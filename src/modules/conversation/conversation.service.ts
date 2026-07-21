import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModelRole, SubscriptionTier } from '@prisma/client';
import { ConversationRepository } from './conversation.repository';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { TokenService } from '../token/token.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { DailyTaskService } from '../daily-task/daily-task.service';
import { CreditService } from '../credit/credit.service';
import {
  CREDIT_COST_MESSAGE_FREE_PIPELINE,
  CREDIT_COST_MESSAGE_FULL_PIPELINE,
} from '../credit/credit.constants';
import { ModelCallResult } from '../ai-provider/ai-provider.types';
import { CHAT_REPLY_SCHEMA, GENERATE_FROM_CHAT_SCHEMA } from './conversation.types';

interface PendingTokenLog {
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly repository: ConversationRepository,
    private readonly aiProvider: AiProviderService,
    private readonly tokenService: TokenService,
    private readonly businessProfileService: BusinessProfileService,
    private readonly dailyTaskService: DailyTaskService,
    private readonly creditService: CreditService,
  ) {}

  async getOrCreate(userId: string, sectionKey: string) {
    const section = await this.repository.findSectionByKey(sectionKey);
    if (!section || !section.isActive) {
      throw new NotFoundException(`Section not found: ${sectionKey}`);
    }

    const profile = await this.businessProfileService.resolveActiveProfile(userId);
    let conversation = await this.repository.findConversation(userId, profile.id, section.id);

    if (!conversation) {
      conversation = await this.repository.createConversation(userId, profile.id, section.id);
    }

    const latestGeneration = conversation.generations?.[0] ?? null;
    const { generations: _generations, ...rest } = conversation;

    return {
      ...rest,
      latestGeneration: latestGeneration
        ? {
            id: latestGeneration.id,
            aggregatedResult: latestGeneration.aggregatedResult,
            actionSteps: latestGeneration.actionSteps,
            isSaved: latestGeneration.isSaved,
            createdAt: latestGeneration.createdAt,
          }
        : null,
    };
  }

  async sendMessage(userId: string, sectionKey: string, content: string) {
    const user = await this.repository.findUserWithSubscription(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    await this.assertQuota(userId, tier, user.trialEndsAt);

    const isTrialActive = !!(user.trialEndsAt && user.trialEndsAt > new Date());
    const useFullPipeline = isTrialActive || tier !== SubscriptionTier.FREE;

    // ── v1.5 §6a — credit check before any AI call ──
    const estimatedCost = useFullPipeline
      ? CREDIT_COST_MESSAGE_FULL_PIPELINE
      : CREDIT_COST_MESSAGE_FREE_PIPELINE;

    const creditCheck = await this.creditService.checkBalance(userId, estimatedCost);
    if (!creditCheck.allowed) {
      throw new HttpException(
        {
          creditLimitReached: true,
          balance: creditCheck.balance,
          message: 'Credit limit reached. Upgrade your plan or wait for your reset.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const reservation = await this.creditService.reserve(
      userId,
      estimatedCost,
      'message generation',
    );

    try {
      const conversation = await this.getOrCreate(userId, sectionKey);
      const section = await this.repository.findSectionByKey(sectionKey);
      const profile = await this.businessProfileService.resolveActiveProfile(userId);
      const template = await this.repository.findActivePromptTemplate(conversation.sectionId);
      const systemPrompt = this.withSectionIsolation(
        template?.systemPrompt ?? 'Provide helpful advisory guidance.',
        section?.name ?? sectionKey,
      );

      await this.repository.createMessage(conversation.id, 'user', content);

      const last10 = await this.repository.findLastMessages(conversation.id, 10);
      const chatPrompt = this.buildChatPrompt(profile, systemPrompt, last10);

      const pendingLogs: PendingTokenLog[] = [];

      let replyText: string;
      if (useFullPipeline) {
        replyText = await this.runChatFullPipeline(chatPrompt, pendingLogs);
      } else {
        replyText = await this.runChatFreePipeline(chatPrompt, pendingLogs);
      }

      const assistantMessage = await this.repository.createMessage(
        conversation.id,
        'assistant',
        replyText,
      );

      for (const log of pendingLogs) {
        await this.tokenService.logUsage({ userId, ...log });
      }

      // ── v1.5 §6b — success: confirm reservation + low-credit check ──
      await this.creditService.confirm(reservation.reservationId);
      await this.creditService.checkAndNotifyLow(userId);

      // ── v1.5 §6d — auto-generate action steps + links on every message ──
      // [COMMENT OUT] The standalone POST /conversations/:sectionKey/generate endpoint
      // remains available, but generation now also runs automatically here.
      let generationResult: {
        generationId: string | null;
        action_steps: unknown[];
        suggested_links: unknown[];
      } = { generationId: null, action_steps: [], suggested_links: [] };

      try {
        const generated = await this.generateActionSteps({
          userId,
          sectionKey,
          conversationId: conversation.id,
          sectionId: conversation.sectionId,
          profile,
          systemPrompt,
          useFullPipeline,
        });
        generationResult = generated;

        if (generated.generationId) {
          await this.creditService.linkGeneration(
            reservation.reservationId,
            generated.generationId,
          );
        }
      } catch (err) {
        this.logger.error(
          `Auto-generation failed for conversation ${conversation.id}: ${(err as Error).message}`,
        );
      }

      const tokenStatus = await this.tokenService.getTokenStatus(userId, tier, user.trialEndsAt);
      const creditStatus = await this.creditService.getStatus(userId);

      return {
        message: assistantMessage,
        action_steps: generationResult.action_steps,
        suggested_links: generationResult.suggested_links,
        generationId: generationResult.generationId,
        creditStatus,
        tokenStatus,
      };
    } catch (err) {
      // ── v1.5 §6c — failure: refund reservation ──
      await this.creditService.refund(reservation.reservationId);
      throw err;
    }
  }

  /** v1.5 §6d — internal generation used by sendMessage auto-generation. */
  private async generateActionSteps(params: {
    userId: string;
    sectionKey: string;
    conversationId: string;
    sectionId: string;
    profile: {
      id: string;
      businessName: string | null;
      industry: string | null;
      currentPhase: string;
      country: string | null;
    };
    systemPrompt: string;
    useFullPipeline: boolean;
  }) {
    const { userId, sectionKey, conversationId, sectionId, profile, systemPrompt } = params;

    const last10 = await this.repository.findLastMessages(conversationId, 10);
    if (last10.length === 0) {
      return { generationId: null, action_steps: [], suggested_links: [] };
    }

    const generatePrompt = this.buildGeneratePrompt(profile, systemPrompt, last10);
    const pendingLogs: PendingTokenLog[] = [];

    let proposerResponses: unknown[];
    let aggregatedResult: Record<string, unknown>;

    if (params.useFullPipeline) {
      const result = await this.runGenerateFullPipeline(generatePrompt, systemPrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    } else {
      const result = await this.runGenerateFreePipeline(generatePrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    }

    aggregatedResult = this.normalizeGenerateResult(aggregatedResult);

    const userPrompt = last10
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 8000);

    const generation = await this.repository.createFullGeneration({
      userId,
      businessProfileId: profile.id,
      sectionId,
      conversationId, // v1.5 §7d — always linked
      userPrompt,
      proposerResponses,
      aggregatedResult,
      actionSteps: aggregatedResult.action_steps as { text: string; description?: string }[],
    });

    for (const log of pendingLogs) {
      await this.tokenService.logUsage({
        userId,
        generationId: generation.id,
        ...log,
      });
    }

    await this.dailyTaskService.syncFromGeneration(userId, profile.id, generation.id, sectionKey);

    return {
      generationId: generation.id,
      action_steps: aggregatedResult.action_steps as unknown[],
      suggested_links: aggregatedResult.suggested_links as unknown[],
    };
  }

  /** v1.5 §6e — every section prompt gets the isolation + personalization instruction. */
  private withSectionIsolation(systemPrompt: string, sectionName: string) {
    return `${systemPrompt}

You are advising on ${sectionName} specifically. Use the business profile context provided to personalize your advice. Do not reference or continue conversations from other sections.`;
  }

  async generate(userId: string, sectionKey: string) {
    const user = await this.repository.findUserWithSubscription(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    await this.assertQuota(userId, tier, user.trialEndsAt);

    const conversation = await this.getOrCreate(userId, sectionKey);
    const profile = await this.businessProfileService.resolveActiveProfile(userId);
    const template = await this.repository.findActivePromptTemplate(conversation.sectionId);
    const systemPrompt = template?.systemPrompt ?? 'Provide detailed advisory guidelines.';

    const last10 = await this.repository.findLastMessages(conversation.id, 10);
    if (last10.length === 0) {
      throw new HttpException(
        'Start a conversation before generating action steps.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const generatePrompt = this.buildGeneratePrompt(profile, systemPrompt, last10);
    const isTrialActive = !!(user.trialEndsAt && user.trialEndsAt > new Date());
    const useFullPipeline = isTrialActive || tier !== SubscriptionTier.FREE;
    const pendingLogs: PendingTokenLog[] = [];

    let proposerResponses: unknown[];
    let aggregatedResult: Record<string, unknown>;

    if (useFullPipeline) {
      const result = await this.runGenerateFullPipeline(generatePrompt, systemPrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    } else {
      const result = await this.runGenerateFreePipeline(generatePrompt, pendingLogs);
      proposerResponses = result.proposerResponses;
      aggregatedResult = result.aggregatedResult;
    }

    aggregatedResult = this.normalizeGenerateResult(aggregatedResult);

    const userPrompt = last10
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 8000);

    const generation = await this.repository.createFullGeneration({
      userId,
      businessProfileId: profile.id,
      sectionId: conversation.sectionId,
      conversationId: conversation.id,
      userPrompt,
      proposerResponses,
      aggregatedResult,
      actionSteps: aggregatedResult.action_steps as { text: string; description?: string }[],
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
      action_steps: aggregatedResult.action_steps,
      suggested_links: aggregatedResult.suggested_links,
      tokenStatus,
    };
  }

  private async assertQuota(
    userId: string,
    tier: SubscriptionTier,
    trialEndsAt: Date | null | undefined,
  ) {
    const quotaCheck = await this.tokenService.checkDailyQuota(userId, tier, trialEndsAt);
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
  }

  private buildChatPrompt(
    profile: {
      businessName: string | null;
      industry: string | null;
      currentPhase: string;
      country: string | null;
    },
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ) {
    const history = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    return `
You are PioneerX, an expert business advisory chatbot.

User Profile:
- Business Name: ${profile.businessName || 'N/A'}
- Industry: ${profile.industry || 'N/A'}
- Current Phase: ${profile.currentPhase}
- Country: ${profile.country || 'N/A'}

Section System Context:
${systemPrompt}

Conversation History (most recent last):
${history}

Instructions:
Respond helpfully to the latest user message in context of the conversation and business profile.
Return ONLY a valid JSON object matching this schema. Do not wrap it in markdown.

JSON Schema:
${CHAT_REPLY_SCHEMA}
`;
  }

  private buildGeneratePrompt(
    profile: {
      businessName: string | null;
      industry: string | null;
      currentPhase: string;
      country: string | null;
    },
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ) {
    const history = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    return `
Based on this conversation, generate exactly 4 action steps and exactly 4 suggested links relevant to this business and section.

User Profile:
- Business Name: ${profile.businessName || 'N/A'}
- Industry: ${profile.industry || 'N/A'}
- Current Phase: ${profile.currentPhase}
- Country: ${profile.country || 'N/A'}

Section System Context:
${systemPrompt}

Conversation History:
${history}

Instructions:
Return JSON only matching this schema. Do not wrap it in markdown.
- action_steps: MUST contain exactly 4 items with text and description.
- suggested_links: MUST contain exactly 4 items. Each may have targetSectionKey and/or externalUrl.

JSON Schema:
${GENERATE_FROM_CHAT_SCHEMA}
`;
  }

  private async runChatFreePipeline(prompt: string, pendingLogs: PendingTokenLog[]) {
    const config = await this.aiProvider.getModelConfig(ModelRole.FREE_TIER_MODEL);
    const response = await this.aiProvider.callModel(ModelRole.FREE_TIER_MODEL, prompt);
    this.recordTokenUsage(config, response, pendingLogs);
    return this.extractReply(response.json);
  }

  private async runChatFullPipeline(prompt: string, pendingLogs: PendingTokenLog[]) {
    const roles = [ModelRole.PROPOSER_1, ModelRole.PROPOSER_2, ModelRole.PROPOSER_3];
    const proposals = await Promise.all(
      roles.map(async (role) => {
        try {
          const config = await this.aiProvider.getModelConfig(role);
          const response = await this.aiProvider.callModel(role, prompt);
          this.recordTokenUsage(config, response, pendingLogs);
          return { success: true as const, modelId: config.modelId, raw: response.json };
        } catch (err) {
          console.error(`[${role}] model call failed:`, err);
          return {
            success: false as const,
            modelId: 'unknown',
            raw: { error: (err as Error).message },
          };
        }
      }),
    );

    const successful = proposals.filter((p) => p.success);
    if (successful.length === 0) {
      throw new InternalServerErrorException('Chat models failed to respond');
    }

    const aggregatorPrompt = `
You are the Aggregator. Pick the single best conversational reply from the candidates.
Return ONLY JSON matching: ${CHAT_REPLY_SCHEMA}

Candidates:
${successful.map((p, i) => `Candidate ${i + 1} (${p.modelId}):\n${JSON.stringify(p.raw)}`).join('\n\n')}
`;

    try {
      const aggConfig = await this.aiProvider.getModelConfig(ModelRole.AGGREGATOR);
      const aggResponse = await this.aiProvider.callModel(ModelRole.AGGREGATOR, aggregatorPrompt);
      this.recordTokenUsage(aggConfig, aggResponse, pendingLogs);
      return this.extractReply(aggResponse.json);
    } catch {
      return this.extractReply(successful[0].raw);
    }
  }

  private async runGenerateFreePipeline(prompt: string, pendingLogs: PendingTokenLog[]) {
    const startTime = Date.now();
    const config = await this.aiProvider.getModelConfig(ModelRole.FREE_TIER_MODEL);
    const response = await this.aiProvider.callModel(ModelRole.FREE_TIER_MODEL, prompt);
    this.recordTokenUsage(config, response, pendingLogs);

    return {
      proposerResponses: [
        {
          role: ModelRole.FREE_TIER_MODEL,
          modelId: config.modelId,
          raw: response.json,
          latencyMs: Date.now() - startTime,
          success: true,
        },
      ],
      aggregatedResult: response.json,
    };
  }

  private async runGenerateFullPipeline(
    prompt: string,
    systemPrompt: string,
    pendingLogs: PendingTokenLog[],
  ) {
    const roles = [ModelRole.PROPOSER_1, ModelRole.PROPOSER_2, ModelRole.PROPOSER_3];
    const proposerResponses = await Promise.all(
      roles.map(async (role) => {
        const startTime = Date.now();
        try {
          const config = await this.aiProvider.getModelConfig(role);
          const response = await this.aiProvider.callModel(role, prompt);
          this.recordTokenUsage(config, response, pendingLogs);
          return {
            role,
            modelId: config.modelId,
            raw: response.json,
            latencyMs: Date.now() - startTime,
            success: true,
          };
        } catch (err) {
          return {
            role,
            modelId: 'unknown',
            raw: { error: (err as Error).message },
            latencyMs: Date.now() - startTime,
            success: false,
          };
        }
      }),
    );

    const successful = proposerResponses.filter((p) => p.success);
    if (successful.length === 0) {
      throw new InternalServerErrorException('Models failed during generate');
    }

    const aggregatorPrompt = `
You are the Aggregator in a Mixture-of-Agents pipeline.
Select the best action steps and suggested links from the candidates.
Output exactly 4 action_steps and exactly 4 suggested_links.
Return ONLY JSON matching:
${GENERATE_FROM_CHAT_SCHEMA}

Section System Context: ${systemPrompt}

Candidates:
${successful.map((p, i) => `Candidate ${i + 1} (${p.modelId}):\n${JSON.stringify(p.raw)}`).join('\n\n')}
`;

    let aggregatedResult: Record<string, unknown>;
    try {
      const aggConfig = await this.aiProvider.getModelConfig(ModelRole.AGGREGATOR);
      const aggResponse = await this.aiProvider.callModel(ModelRole.AGGREGATOR, aggregatorPrompt);
      this.recordTokenUsage(aggConfig, aggResponse, pendingLogs);
      aggregatedResult = aggResponse.json;
    } catch {
      aggregatedResult = successful[0].raw as Record<string, unknown>;
    }

    this.logger.log(`[Generate MoA] proposers=${proposerResponses.length}`);
    return { proposerResponses, aggregatedResult };
  }

  private extractReply(json: Record<string, unknown>): string {
    if (typeof json.reply === 'string' && json.reply.trim()) {
      return json.reply.trim();
    }
    if (typeof json.content === 'string' && json.content.trim()) {
      return json.content.trim();
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim();
    }
    return JSON.stringify(json);
  }

  private normalizeGenerateResult(result: Record<string, unknown>) {
    const normalized = { ...result };

    if (!Array.isArray(normalized.action_steps)) {
      normalized.action_steps = [
        { text: 'Review business plan', description: 'Review core components of your business concept.' },
        { text: 'Analyze market demand', description: 'Identify target buyers and customer pain points.' },
        { text: 'Study competitors', description: 'Find your competitive advantages.' },
        { text: 'Set initial goals', description: 'Outline weekly metrics to evaluate execution success.' },
      ];
    }
    normalized.action_steps = (normalized.action_steps as unknown[]).slice(0, 4);

    if (!Array.isArray(normalized.suggested_links)) {
      normalized.suggested_links = [];
    }
    normalized.suggested_links = (normalized.suggested_links as unknown[]).slice(0, 4);

    return normalized;
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
}
