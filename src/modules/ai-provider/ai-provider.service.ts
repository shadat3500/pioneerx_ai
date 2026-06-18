import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ModelRole } from '@prisma/client';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) { }

  /**
   * Resolves configuration for a model role using Redis cache with db fallback.
   */
  async getModelConfig(role: ModelRole) {
    const cacheKey = `ai-config:${role}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.error(`Redis read error: ${(err as any).message}`);
    }

    const config = await this.prisma.aiModelConfig.findUnique({
      where: { role },
    });

    if (!config) {
      throw new Error(`AI configuration not found for role: ${role}`);
    }

    const configData = {
      provider: config.provider,
      modelId: config.modelId,
    };

    try {
      // Cache with 5-minute TTL
      await this.redis.set(cacheKey, JSON.stringify(configData), 'EX', 300);
    } catch (err) {
      this.logger.error(`Redis write error: ${(err as any).message}`);
    }

    return configData;
  }

  /**
   * Invalidates Redis cache for a specific model role.
   */
  async invalidateCache(role: ModelRole) {
    const cacheKey = `ai-config:${role}`;
    await this.redis.del(cacheKey);
  }

  /**
   * Executes prompt against the configured model for a given role.
   */
  async callModel(role: ModelRole, prompt: string): Promise<any> {
    const config = await this.getModelConfig(role);
    const provider = config.provider.toLowerCase();
    const modelId = config.modelId;

    this.logger.log(`Calling model role ${role} (provider: ${provider}, model: ${modelId})`);

    // 1. OpenAI Call
    if (provider === 'openai') {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        this.logger.warn('OPENAI_API_KEY is missing. Falling back to local mock.');
        return this.getMockResponse(role, prompt);
      }

      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content || '{}');
    }

    // 2. Google Gemini Call
    if (provider === 'google') {
      const apiKey = this.config.get<string>('GOOGLE_AI_API_KEY');
      if (!apiKey) {
        this.logger.warn('GOOGLE_AI_API_KEY is missing. Falling back to local mock.');
        return this.getMockResponse(role, prompt);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    }

    // 3. Anthropic Claude Call
    if (provider === 'anthropic') {
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        this.logger.warn('ANTHROPIC_API_KEY is missing. Falling back to local mock.');
        return this.getMockResponse(role, prompt);
      }

      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      if (textBlock && 'text' in textBlock) {
        return JSON.parse(textBlock.text);
      }
      return {};
    }

    // 4. xAI Grok Call
    if (provider === 'xai') {
      const apiKey = this.config.get<string>('XAI_API_KEY');
      if (!apiKey) {
        this.logger.warn('XAI_API_KEY is missing. Falling back to local mock.');
        return this.getMockResponse(role, prompt);
      }

      const grok = new OpenAI({
        apiKey,
        baseURL: 'https://api.x.ai/v1',
      });
      const response = await grok.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content || '{}');
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  /**
   * Dynamic mock responses for developer fallback when API keys are not supplied.
   */
  private getMockResponse(role: ModelRole, _prompt: string): any {
    // Return formatted proposers or aggregators response mock
    if (role === ModelRole.AGGREGATOR) {
      // Aggregates proposers input (mocked)
      return {
        action_steps: [
          { text: 'Finalize core target audience and value proposition.', description: 'Consolidate the top persona indicators to define your initial product message.' },
          { text: 'Create a minimum viable prototype landing page.', description: 'Launch a simple single-page site using static assets to gauge signup conversion rates.' },
          { text: 'Conduct user validation interviews.', description: 'Talk to at least 10 active prospects to validate pain points and willingness to pay.' },
          { text: 'Formulate basic legal structure and setup.', description: 'Decide on LLC vs C-Corp structure based on your funding and growth plans.' }
        ],
        tools_features: [],
        suggested_links: [],
        ai_tip: 'Prioritize quick, low-cost qualitative feedback over raw scaling efforts during early setup stages.'
      };
    }

    if (role === ModelRole.DAILY_TASK_GENERATOR) {
      return {
        tasks: [
          { id: 'dt-1', text: 'Outline your primary business goals for the week.', priority: 'HIGH', isDone: false },
          { id: 'dt-2', text: 'Analyze top 3 direct competitors features and pricing.', priority: 'MEDIUM', isDone: false },
          { id: 'dt-3', text: 'Draft email outreach copy for initial customer interviews.', priority: 'LOW', isDone: false }
        ]
      };
    }

    // Default proposer mock
    return {
      action_steps: [
        { text: `Define customer segments for ${role}.`, description: 'List typical demographics, pain points, and current alternatives.' },
        { text: `Draft pricing hypothesis for ${role}.`, description: 'Estimate basic subscription tiers and unit economics based on estimated value.' },
        { text: `Establish basic landing page for ${role}.`, description: 'Include an email capture form and brief features overview.' },
        { text: `Run localized search ad campaigns for ${role}.`, description: 'Invest $50 in highly-targeted search phrases to measure click interest.' }
      ],
      tools_features: [],
      suggested_links: [],
      ai_tip: 'Ensure to focus on quick validation loops before any deep product design is initiated.'
    };
  }
}
