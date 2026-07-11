import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { GenerationRepository } from './generation.repository';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { TokenService } from '../token/token.service';
import { DailyTaskService } from '../daily-task/daily-task.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { ModelCallResult } from '../ai-provider/ai-provider.types';
import { ADVISORY_RESPONSE_SCHEMA, AiSuggestedTool } from './generation.types';
import { ModelRole, SubscriptionTier } from '@prisma/client';

const MAX_TOOL_RECOMMENDATIONS = 4;

interface PendingTokenLog {
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly repository: GenerationRepository,
    private readonly aiProvider: AiProviderService,
    private readonly tokenService: TokenService,
    private readonly dailyTaskService: DailyTaskService,
    private readonly businessProfileService: BusinessProfileService,
  ) {}

  async generate(userId: string, sectionKey: string, userPrompt: string) {
    const user = await this.repository.findUserForGeneration(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    const quotaCheck = await this.tokenService.checkDailyQuota(userId, tier, user.trialEndsAt);

    if (!quotaCheck.allowed) {
      throw new HttpException(
        {
          limitReached: true,
          resetAt: quotaCheck.resetAt,
          tokenStatus: {
            used: quotaCheck.used,
            limit: quotaCheck.limit,
            percentage: quotaCheck.percentage,
            resetAt: quotaCheck.resetAt,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const section = await this.repository.findSectionByKey(sectionKey);
    if (!section) {
      throw new NotFoundException(`Section not found: ${sectionKey}`);
    }

    const template = await this.repository.findActivePromptTemplate(section.id);
    const systemPrompt = template ? template.systemPrompt : 'Provide detailed advisory guidelines.';

    let profile = await this.businessProfileService.resolveActiveProfile(userId);

    const tools = await this.repository.findActiveTools(section.id);
    const toolsFormatted = tools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    }));

    const advisoryPrompt = this.buildAdvisoryPrompt(
      profile,
      systemPrompt,
      userPrompt,
      toolsFormatted,
    );

    const isTrialActive = !!(user.trialEndsAt && user.trialEndsAt > new Date());
    const useFullPipeline = isTrialActive || tier !== SubscriptionTier.FREE;

    const pendingLogs: PendingTokenLog[] = [];
    let proposerResponses: any[];
    let aggregatedResult: Record<string, unknown>;

    if (useFullPipeline) {
      const result = await this.runFullPipeline(advisoryPrompt, userPrompt, systemPrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    } else {
      const result = await this.runFreeTierPipeline(advisoryPrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    }

    aggregatedResult = this.normalizeAggregatedResult(
      aggregatedResult,
      new Set(toolsFormatted.map((t) => t.id)),
    );

    const generation = await this.repository.createFullGeneration({
      userId,
      businessProfileId: profile.id,
      sectionId: section.id,
      userPrompt,
      proposerResponses,
      aggregatedResult,
      actionSteps: aggregatedResult.action_steps as any[],
    });

    for (const log of pendingLogs) {
      await this.tokenService.logUsage({
        userId,
        generationId: generation.id,
        ...log,
      });
    }

    await this.dailyTaskService.syncFromGeneration(
      userId,
      profile.id,
      generation.id,
      sectionKey,
    );

    const tokenStatus = await this.tokenService.getTokenStatus(userId, tier, user.trialEndsAt);

    return {
      generationId: generation.id,
      aggregatedResult,
      tokenStatus,
    };
  }

  private buildAdvisoryPrompt(
    profile: {
      businessName: string | null;
      industry: string | null;
      currentPhase: string;
      country: string | null;
    },
    systemPrompt: string,
    userPrompt: string,
    toolsFormatted: { id: string; name: string; description: string }[],
  ) {
    const hasCatalog = toolsFormatted.length > 0;
    const catalogBlock = hasCatalog
      ? `PioneerX Verified Tool Catalog (use IDs in "tools_features"):
${JSON.stringify(toolsFormatted, null, 2)}`
      : 'PioneerX Verified Tool Catalog: (none configured for this section)';

    const toolInstructions = hasCatalog
      ? `Tool recommendations (max ${MAX_TOOL_RECOMMENDATIONS} total across both fields):
- "tools_features": catalog IDs that fit the query (preferred when a catalog tool applies).
- "ai_suggested_tools": real tools NOT in the catalog, or to fill remaining slots.
- Do not duplicate: if a tool is in the catalog, use its ID in tools_features, not ai_suggested_tools.
- Combined count of tools_features + ai_suggested_tools must not exceed ${MAX_TOOL_RECOMMENDATIONS}.`
      : `Tool recommendations:
- "tools_features": must be [].
- "ai_suggested_tools": up to ${MAX_TOOL_RECOMMENDATIONS} real, well-known tools with accurate name, description, and https URL.`;

    return `
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

${catalogBlock}

Instructions:
Return ONLY a valid JSON object matching the schema below. Do not wrap it in markdown block tags (e.g. no \`\`\`json).
- action_steps: MUST contain exactly 4 items.
- suggested_links: up to 4 items.
${toolInstructions}

JSON Schema:
${ADVISORY_RESPONSE_SCHEMA}
`;
  }

  private async runFreeTierPipeline(advisoryPrompt: string, pendingLogs: PendingTokenLog[]) {
    const startTime = Date.now();
    const config = await this.aiProvider.getModelConfig(ModelRole.FREE_TIER_MODEL);
    const response = await this.aiProvider.callModel(ModelRole.FREE_TIER_MODEL, advisoryPrompt);
    const latencyMs = Date.now() - startTime;

    this.recordTokenUsage(config, response, pendingLogs);

    return {
      proposerResponses: [
        {
          role: ModelRole.FREE_TIER_MODEL,
          modelId: config.modelId,
          raw: response.json,
          latencyMs,
          success: true,
        },
      ],
      aggregatedResult: response.json,
    };
  }

  private async runFullPipeline(
    advisoryPrompt: string,
    userPrompt: string,
    systemPrompt: string,
    pendingLogs: PendingTokenLog[],
  ) {
    const roles = [ModelRole.PROPOSER_1, ModelRole.PROPOSER_2, ModelRole.PROPOSER_3];
    const proposerPromises = roles.map(async (role) => {
      const startTime = Date.now();
      try {
        const config = await this.aiProvider.getModelConfig(role);
        const response = await this.aiProvider.callModel(role, advisoryPrompt);
        const latencyMs = Date.now() - startTime;
        this.recordTokenUsage(config, response, pendingLogs);

        return {
          role,
          modelId: config.modelId,
          raw: response.json,
          latencyMs,
          success: true,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        return {
          role,
          modelId: 'unknown',
          raw: { error: (err as Error).message },
          latencyMs,
          success: false,
        };
      }
    });

    const proposerResponses = await Promise.all(proposerPromises);
    const successfulProposals = proposerResponses.filter((p) => p.success);

    if (successfulProposals.length === 0) {
      const firstFail = proposerResponses[0];
      throw new InternalServerErrorException(
        `Models failed. Reason: ${JSON.stringify(firstFail.raw)}`,
      );
    }

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
2. Merge tools_features (catalog IDs) and ai_suggested_tools (name/description/url) from candidates. Max ${MAX_TOOL_RECOMMENDATIONS} total tool recommendations combined. Prefer catalog IDs when present; keep ai_suggested_tools only for tools not covered by catalog IDs.
3. Select up to 4 suggested_links from the candidates' recommended lists.
4. Choose the single most insightful ai_tip.
5. Return ONLY one valid JSON object matching this schema. Do not output markdown code blocks.

JSON Schema:
${ADVISORY_RESPONSE_SCHEMA}
`;

    let aggregatedResult: Record<string, unknown>;
    let aggregatorLatencyMs = 0;
    const aggStartTime = Date.now();
    const aggConfig = await this.aiProvider.getModelConfig(ModelRole.AGGREGATOR);

    try {
      const aggResponse = await this.aiProvider.callModel(ModelRole.AGGREGATOR, aggregatorInstructions);
      aggregatorLatencyMs = Date.now() - aggStartTime;
      this.recordTokenUsage(aggConfig, aggResponse, pendingLogs);
      aggregatedResult = aggResponse.json;
    } catch {
      aggregatorLatencyMs = Date.now() - aggStartTime;
      aggregatedResult = successfulProposals[0].raw as Record<string, unknown>;
    }

    const totalAiLatency =
      proposerResponses.reduce((sum, p) => sum + p.latencyMs, 0) + aggregatorLatencyMs;
    this.logger.log(
      `[AI Latency Report] Total: ${totalAiLatency}ms | Proposers: ${proposerResponses.map((p) => `${p.role}:${p.latencyMs}ms`).join(', ')} | Aggregator: ${aggregatorLatencyMs}ms`,
    );

    return { proposerResponses, aggregatedResult };
  }

  private recordTokenUsage(
    config: { provider: string; modelId: string },
    response: ModelCallResult,
    pendingLogs: PendingTokenLog[],
  ) {
    pendingLogs.push({
      provider: config.provider,
      modelId: config.modelId,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });
  }

  private normalizeAggregatedResult(
    aggregatedResult: Record<string, unknown>,
    validCatalogIds: Set<string>,
  ) {
    const result = { ...aggregatedResult };

    if (!result.action_steps || !Array.isArray(result.action_steps)) {
      result.action_steps = [
        { text: 'Review business plan', description: 'Review core components of your business concept.' },
        { text: 'Analyze market demand', description: 'Identify target buyers and customer pain points.' },
        { text: 'Study competitors', description: 'Find your competitive advantages.' },
        { text: 'Set initial goals', description: 'Outline weekly metrics to evaluate execution success.' },
      ];
    }

    result.action_steps = (result.action_steps as unknown[]).slice(0, 4);

    const toolsFeatures = Array.isArray(result.tools_features)
      ? result.tools_features
          .filter((id): id is string => typeof id === 'string')
          .filter((id) => validCatalogIds.has(id))
          .slice(0, MAX_TOOL_RECOMMENDATIONS)
      : [];

    result.tools_features = toolsFeatures;
    result.ai_suggested_tools = this.normalizeAiSuggestedTools(
      result.ai_suggested_tools,
      Math.max(0, MAX_TOOL_RECOMMENDATIONS - toolsFeatures.length),
    );

    return result;
  }

  private normalizeAiSuggestedTools(raw: unknown, maxItems: number): AiSuggestedTool[] {
    if (!Array.isArray(raw) || maxItems <= 0) {
      return [];
    }

    const normalized: AiSuggestedTool[] = [];

    for (const item of raw) {
      if (normalized.length >= maxItems) {
        break;
      }

      if (!item || typeof item !== 'object') {
        continue;
      }

      const entry = item as Record<string, unknown>;
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const description = typeof entry.description === 'string' ? entry.description.trim() : '';
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';

      if (!name || !url || !/^https?:\/\//i.test(url)) {
        continue;
      }

      normalized.push({
        name,
        description: description || name,
        url,
      });
    }

    return normalized;
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
      generation.businessProfileId,
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
    const activeProfile = await this.businessProfileService.resolveActiveProfile(userId);
    return this.repository.getSavedOutputs(userId, activeProfile.id);
  }
}
