import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { GenerationRepository } from './generation.repository';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { ModelRole } from '@prisma/client';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly repository: GenerationRepository,
    private readonly aiProvider: AiProviderService,
  ) { }

  async generate(userId: string, sectionKey: string, userPrompt: string) {
    const section = await this.repository.findSectionByKey(sectionKey);
    if (!section) {
      throw new NotFoundException(`Section not found: ${sectionKey}`);
    }

    // 1. Fetch system prompt template
    const template = await this.repository.findActivePromptTemplate(section.id);
    const systemPrompt = template ? template.systemPrompt : 'Provide detailed advisory guidelines.';

    // 2. Fetch business profile
    let profile = await this.repository.findBusinessProfile(userId);
    if (!profile) {
      profile = await this.repository.createBusinessProfile(userId);
    }

    // 3. Fetch tool catalog items
    const tools = await this.repository.findActiveTools(section.id);
    const toolsFormatted = tools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    }));

    // 4. Construct proposer instruction payload
    const proposerInstructions = `
You are the Expert AI Advisory Proposer.
User Profile:
- Business Name: ${profile.businessName || 'N/A'}
- Industry: ${profile.industry || 'N/A'}
- Current Phase: ${profile.currentPhase}
- Country: ${profile.country || 'N/A'}

Section System Context:
${systemPrompt}

User Advisory Query:
${userPrompt}

Available Tool Catalog Items (You must ONLY suggest IDs from this list in "tools_features"):
${JSON.stringify(toolsFormatted, null, 2)}

Instructions:
Return ONLY a valid JSON object matching the schema below. Do not wrap it in markdown block tags (e.g. no \`\`\`json).
JSON Schema:
{
  "action_steps": [
    { "text": "Task Title", "description": "Short explanation of the step" }
  ], // MUST contain exactly 4 action steps
  "tools_features": [], // Array of tool IDs from the catalog list provided, up to 4 items
  "suggested_links": [
    { "label": "Link label", "targetSectionKey": "target_section_key_or_null", "externalUrl": "external_url_or_null" }
  ], // suggested links, up to 4 items
  "ai_tip": "A valuable AI advisory tip/insight"
}
`;

    // 5. Run proposers in parallel
    const roles = [ModelRole.PROPOSER_1, ModelRole.PROPOSER_2, ModelRole.PROPOSER_3];
    const proposerPromises = roles.map(async (role) => {
      const startTime = Date.now();
      try {
        const config = await this.aiProvider.getModelConfig(role);
        const rawResponse = await this.aiProvider.callModel(role, proposerInstructions);
        const latencyMs = Date.now() - startTime;
        return {
          role,
          modelId: config.modelId,
          raw: rawResponse,
          latencyMs,
          success: true,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        return {
          role,
          modelId: 'unknown',
          raw: { error: (err as any).message },
          latencyMs,
          success: false,
        };
      }
    });

    const proposerResponses = await Promise.all(proposerPromises);

    // Filter out failed proposals
    const successfulProposals = proposerResponses.filter((p) => p.success);
    if (successfulProposals.length === 0) {
      throw new InternalServerErrorException('All proposer models failed to respond.');
    }

    // 6. Aggregate results
    const aggregatorInstructions = `
You are the Aggregator model in a Mixture-of-Agents pipeline.
Select the most specific and actionable version of each idea from the proposer candidates.
Do not blend or merge sentences from different candidates into a new sentence — pick the best existing one.
Remove duplicates and ensure coherence.

User Query: ${userPrompt}
Section System Context: ${systemPrompt}

Proposer Candidates:
${successfulProposals
        .map((p, idx) => `Candidate ${idx + 1} (Model: ${p.modelId}):\n${JSON.stringify(p.raw, null, 2)}`)
        .join('\n\n')}

Instructions:
1. Output exactly 4 action steps.
2. Select up to 4 tools_features from the candidates' recommended lists.
3. Select up to 4 suggested_links from the candidates' recommended lists.
4. Choose the single most insightful ai_tip.
5. Return ONLY one valid JSON object in the exact same schema. Do not output markdown code blocks.
`;

    let aggregatedResult: any = null;
    let aggregatorLatencyMs = 0;
    const aggStartTime = Date.now();
    await this.aiProvider.getModelConfig(ModelRole.AGGREGATOR);

    try {
      const rawAggResponse = await this.aiProvider.callModel(ModelRole.AGGREGATOR, aggregatorInstructions);
      aggregatorLatencyMs = Date.now() - aggStartTime;
      // Ensure it's treated as object
      aggregatedResult = typeof rawAggResponse === 'string' ? JSON.parse(rawAggResponse) : rawAggResponse;
    } catch (err) {
      aggregatorLatencyMs = Date.now() - aggStartTime;
      // Fallback to the first successful proposer if aggregator fails
      aggregatedResult = successfulProposals[0].raw;
    }

    // Log latencies for quality/cost analysis
    const totalAiLatency = proposerResponses.reduce((sum, p) => sum + p.latencyMs, 0) + aggregatorLatencyMs;
    this.logger.log(`[AI Latency Report] Total: ${totalAiLatency}ms | Proposers: ${proposerResponses.map(p => `${p.role}:${p.latencyMs}ms`).join(', ')} | Aggregator: ${aggregatorLatencyMs}ms`);

    // 7. Normalize aggregated result structure to be safe
    if (!aggregatedResult.action_steps || !Array.isArray(aggregatedResult.action_steps)) {
      aggregatedResult.action_steps = [
        { text: 'Review business plan', description: 'Review core components of your business concept.' },
        { text: 'Analyze market demand', description: 'Identify target buyers and customer pain points.' },
        { text: 'Study competitors', description: 'Find your competitive advantages.' },
        { text: 'Set initial goals', description: 'Outline weekly metrics to evaluate execution success.' }
      ];
    }
    // Limit to exactly 4 action steps
    aggregatedResult.action_steps = aggregatedResult.action_steps.slice(0, 4);

    // 8. Persist Generation
    const generation = await this.repository.createFullGeneration({
      userId,
      sectionId: section.id,
      userPrompt,
      proposerResponses: proposerResponses as any,
      aggregatedResult: aggregatedResult as any,
      actionSteps: aggregatedResult.action_steps,
    });

    return {
      generationId: generation.id,
      aggregatedResult,
    };
  }

  async findOne(userId: string, id: string) {
    const generation = await this.repository.findGenerationDetails(id, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }
    return generation;
  }

  async saveOutput(userId: string, generationId: string, label?: string) {
    const generation = await this.repository.findGenerationDetails(generationId, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    await this.repository.updateIsSaved(generationId, true);

    return this.repository.upsertSavedOutput(
      userId,
      generationId,
      label || 'Saved Advisory Output',
    );
  }

  async unsaveOutput(userId: string, generationId: string) {
    const saved = await this.repository.findSavedOutput(generationId);
    if (!saved || saved.userId !== userId) {
      throw new NotFoundException('Saved output not found');
    }

    await this.repository.updateIsSaved(generationId, false);

    return this.repository.deleteSavedOutput(generationId);
  }

  async getSavedOutputs(userId: string) {
    return this.repository.getUserSavedOutputs(userId);
  }
}
