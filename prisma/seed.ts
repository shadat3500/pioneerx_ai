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
      update: {},
      create: {
        tier,
        dailyRegenerateLimit: null, // unlimited
      },
    });
  }
  console.log('✅ Quota configurations seeded.');

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
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-latest',
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
