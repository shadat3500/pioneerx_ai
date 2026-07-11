import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_AT_SECRET: Joi.string().required(),
  JWT_RT_SECRET: Joi.string().required(),
  JWT_AT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_RT_EXPIRES_IN: Joi.string().default('7d'),
  BASE_URL: Joi.string().default('http://localhost:3000'),
  MAIL_HOST: Joi.string().optional(),
  MAIL_PORT: Joi.number().optional(),
  MAIL_USER: Joi.string().optional(),
  MAIL_PASS: Joi.string().optional(),
  
  // Redis configuration
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // Crypto / AES encryption key
  ENCRYPTION_KEY: Joi.string().length(64).default('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'), // Default 32-byte hex for local dev

  // RevenueCat
  REVENUECAT_SECRET_KEY: Joi.string().allow('').optional(),

  // Shopify App integration
  SHOPIFY_API_KEY: Joi.string().allow('').optional(),
  SHOPIFY_API_SECRET: Joi.string().allow('').optional(),

  // AI Provider Keys
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  GOOGLE_AI_API_KEY: Joi.string().allow('').optional(),
  XAI_API_KEY: Joi.string().allow('').optional(),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),

  // OAuth
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_CALLBACK_URL: Joi.string().allow('').optional(),
  APPLE_CLIENT_ID: Joi.string().allow('').optional(),
  APPLE_TEAM_ID: Joi.string().allow('').optional(),
  APPLE_KEY_ID: Joi.string().allow('').optional(),
  APPLE_PRIVATE_KEY: Joi.string().allow('').optional(),

  // Frontend URL (used for magic link verification link)
  FRONTEND_URL: Joi.string().allow('').optional(),
});


