import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ModelRole } from '@prisma/client';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { ModelCallResult } from './ai-provider.types';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async getModelConfig(role: ModelRole) {
    const cacheKey = `ai-config:${role}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.error(`Redis read error: ${(err as Error).message}`);
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
      await this.redis.set(cacheKey, JSON.stringify(configData), 'EX', 300);
    } catch (err) {
      this.logger.error(`Redis write error: ${(err as Error).message}`);
    }

    return configData;
  }

  async invalidateCache(role: ModelRole) {
    const cacheKey = `ai-config:${role}`;
    await this.redis.del(cacheKey);
  }

  async callModel(role: ModelRole, prompt: string): Promise<ModelCallResult> {
    const config = await this.getModelConfig(role);
    const provider = config.provider.toLowerCase();
    const modelId = config.modelId;

    this.logger.log(`Calling model role ${role} (provider: ${provider}, model: ${modelId})`);

    if (provider === 'openai') {
      const apiKey = this.requireApiKey('OPENAI_API_KEY', 'OpenAI');
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      return {
        json: JSON.parse(response.choices[0].message.content || '{}'),
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    }

    if (provider === 'google') {
      const apiKey = this.requireApiKey('GOOGLE_AI_API_KEY', 'Google AI');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      const usage = result.response.usageMetadata;

      return {
        json: JSON.parse(result.response.text()),
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      };
    }

    if (provider === 'anthropic') {
      const apiKey = this.requireApiKey('ANTHROPIC_API_KEY', 'Anthropic');
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      const json = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : {};

      return {
        json,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    if (provider === 'xai') {
      const apiKey = this.requireApiKey('XAI_API_KEY', 'xAI');
      const grok = new OpenAI({
        apiKey,
        baseURL: 'https://api.x.ai/v1',
      });
      const response = await grok.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      return {
        json: JSON.parse(response.choices[0].message.content || '{}'),
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  private requireApiKey(envKey: string, providerLabel: string): string {
    const apiKey = this.config.get<string>(envKey);
    if (!apiKey) {
      throw new InternalServerErrorException(
        `${providerLabel} API key is not configured (${envKey})`,
      );
    }
    return apiKey;
  }
}
