import 'dotenv/config';
import { PrismaClient, SubscriptionTier, ModelRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// Set up pool for Prisma adapter if needed, otherwise fallback to normal PrismaClient
const dbUrl = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: dbUrl });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('🌱 Start seeding...');

  // 1. Seed AdminUser
  const adminEmail = 'admin@pioneerx.ai';
  const adminPassword = 'adminpassword123'; // Standard default, will hash

  const adminExists = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (!adminExists) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'admin',
      },
    });
    console.log(`✅ Admin user seeded: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log('ℹ️ Admin user already exists. Skipping...');
  }

  // 2. Seed QuotaConfig (Unlimited default)
  const tiers: SubscriptionTier[] = ['FREE', 'PRO', 'PRO_PLUS', 'ELITE'];
  for (const tier of tiers) {
    await prisma.quotaConfig.upsert({
      where: { tier },
      update: { dailyTokenLimit: null },
      create: {
        tier,
        dailyTokenLimit: null,
        dailyRegenerateLimit: null, // unlimited
      },
    });
  }
  console.log('✅ Quota configurations seeded.');

  // 2b. Seed ModelPricing
  await prisma.modelPricing.createMany({
    data: [
      { provider: 'openai', modelId: 'gpt-5.5', inputPricePerMToken: 2.5, outputPricePerMToken: 10.0 },
      { provider: 'google', modelId: 'gemini-3.1-pro', inputPricePerMToken: 2.0, outputPricePerMToken: 12.0 },
      { provider: 'google', modelId: 'gemini-3.5-flash', inputPricePerMToken: 0.5, outputPricePerMToken: 3.0 },
      { provider: 'xai', modelId: 'grok-4.3', inputPricePerMToken: 0.2, outputPricePerMToken: 0.5 },
      { provider: 'anthropic', modelId: 'claude-opus-4-8', inputPricePerMToken: 5.0, outputPricePerMToken: 25.0 },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputPricePerMToken: 1.0, outputPricePerMToken: 5.0 },
    ],
    skipDuplicates: true,
  });
  console.log('✅ Model pricing seeded.');

  // 3. Seed AiModelConfig (Default Model Roles)
  const defaultModelConfigs = [
    {
      role: ModelRole.PROPOSER_1,
      provider: 'openai',
      modelId: 'gpt-4o',
    },
    {
      role: ModelRole.PROPOSER_2,
      provider: 'google',
      modelId: 'gemini-1.5-pro',
    },
    {
      role: ModelRole.PROPOSER_3,
      provider: 'xai',
      modelId: 'grok-2-1212',
    },
    {
      role: ModelRole.AGGREGATOR,
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-latest',
    },
    {
      role: ModelRole.DAILY_TASK_GENERATOR,
      provider: 'google',
      modelId: 'gemini-3.5-flash',
    },
    {
      role: ModelRole.FREE_TIER_MODEL,
      provider: 'google',
      modelId: 'gemini-3.5-flash',
    },
  ];

  for (const config of defaultModelConfigs) {
    await prisma.aiModelConfig.upsert({
      where: { role: config.role },
      update: {
        provider: config.provider,
        modelId: config.modelId,
      },
      create: {
        role: config.role,
        provider: config.provider,
        modelId: config.modelId,
      },
    });
  }
  console.log('✅ AI Model configurations seeded.');

  // 4. Seed Sections Catalog
  const sectionsData = [
    // FREE - Core
    { key: 'idea_validation', name: 'Idea & Validation', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'branding', name: 'Branding', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'product_service', name: 'Product/Service', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'website_tech', name: 'Website & Tech', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'marketing', name: 'Marketing', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'sales', name: 'Sales', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'operations', name: 'Operations', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'legal_finance', name: 'Legal & Finance', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'launch', name: 'Launch', category: 'core', requiredTier: SubscriptionTier.FREE },
    { key: 'scaling', name: 'Scaling', category: 'core', requiredTier: SubscriptionTier.FREE },

    // PRO - Advanced
    { key: 'financial_strategy', name: 'Financial Strategy', category: 'advanced', requiredTier: SubscriptionTier.PRO },
    { key: 'personal_execution', name: 'Personal Execution', category: 'advanced', requiredTier: SubscriptionTier.PRO },
    { key: 'opportunity_engine', name: 'Opportunity Engine', category: 'advanced', requiredTier: SubscriptionTier.PRO },
    { key: 'partnerships', name: 'Partnerships', category: 'advanced', requiredTier: SubscriptionTier.PRO },
    { key: 'customer_experience', name: 'Customer Experience', category: 'advanced', requiredTier: SubscriptionTier.PRO },
    { key: 'data_analytics', name: 'Data & Analytics', category: 'advanced', requiredTier: SubscriptionTier.PRO },

    // PRO_PLUS - Pro+ Growth
    { key: 'automation_systems', name: 'Automation Systems', category: 'pro_plus', requiredTier: SubscriptionTier.PRO_PLUS },
    { key: 'advanced_marketing_lab', name: 'Advanced Marketing Lab', category: 'pro_plus', requiredTier: SubscriptionTier.PRO_PLUS },
    { key: 'revenue_expansion', name: 'Revenue Expansion', category: 'pro_plus', requiredTier: SubscriptionTier.PRO_PLUS },
    { key: 'advanced_sales_systems', name: 'Advanced Sales Systems', category: 'pro_plus', requiredTier: SubscriptionTier.PRO_PLUS },
    { key: 'growth_engine', name: 'Growth Engine', category: 'pro_plus', requiredTier: SubscriptionTier.PRO_PLUS },

    // ELITE
    { key: 'wealth_capital', name: 'Wealth & Capital', category: 'elite', requiredTier: SubscriptionTier.ELITE },
    { key: 'investment_acquisition', name: 'Investment & Acquisition', category: 'elite', requiredTier: SubscriptionTier.ELITE },
    { key: 'personal_brand', name: 'Personal Brand', category: 'elite', requiredTier: SubscriptionTier.ELITE },
    { key: 'multi_business_mgmt', name: 'Multi-Business Mgmt', category: 'elite', requiredTier: SubscriptionTier.ELITE },
    { key: 'exit_legacy', name: 'Exit & Legacy', category: 'elite', requiredTier: SubscriptionTier.ELITE },
  ];

  for (const sec of sectionsData) {
    const section = await prisma.section.upsert({
      where: { key: sec.key },
      update: {
        name: sec.name,
        category: sec.category,
        requiredTier: sec.requiredTier,
      },
      create: {
        key: sec.key,
        name: sec.name,
        category: sec.category,
        requiredTier: sec.requiredTier,
      },
    });

    // Seed an initial active PromptTemplate per Section
    const activeTemplate = await prisma.promptTemplate.findFirst({
      where: { sectionId: section.id, isActive: true },
    });

    if (!activeTemplate) {
      await prisma.promptTemplate.create({
        data: {
          sectionId: section.id,
          systemPrompt: `You are the Expert AI Advisory module for "${sec.name}" in the PioneerX platform.
Help the user validate, launch, and grow their business specifically focusing on ${sec.name}.
Always output structured analysis matching the requested response format.`,
          version: 1,
          isActive: true,
        },
      });
    }
  }
  console.log('✅ Section catalog and default prompt templates seeded.');

  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
