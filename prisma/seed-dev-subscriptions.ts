import 'dotenv/config';
import {
  PrismaClient,
  SubscriptionTier,
  BusinessPhase,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

/**
 * Dev-only subscription scenario seed.
 * Does NOT replace prisma/seed.ts — run that first for config/sections.
 *
 *   npm run seed:dev:subs
 *
 * All users share password: asdfasdf
 * Login via password form when NEXT_PUBLIC_ENABLE_DEV_LOGIN=true
 * or (non-production) magic-link instant login for *@pioneerx.dev
 */

const dbUrl = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: dbUrl });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const SHARED_PASSWORD = 'asdfasdf';
const MS_DAY = 24 * 60 * 60 * 1000;

type Scenario = {
  email: string;
  name: string;
  tier: SubscriptionTier;
  /** null = no trial; Date = trialEndsAt */
  trialEndsAt: Date | null;
  /** Absolute credit balance to set */
  creditBalance: number;
  businessName: string;
  /** Optional: set today's imageGenerationCount near daily limit */
  imageCountToday?: number;
  note: string;
};

async function upsertScenario(
  passwordHash: string,
  scenario: Scenario,
  creditConfigs: Map<SubscriptionTier, { monthlyCredits: number | null; dailyCredits: number | null; trialCredits: number | null }>,
) {
  const user = await prisma.user.upsert({
    where: { email: scenario.email },
    update: {
      passwordHash,
      name: scenario.name,
      isEmailVerified: true,
      trialEndsAt: scenario.trialEndsAt,
      updatedAt: new Date(),
    },
    create: {
      email: scenario.email,
      passwordHash,
      name: scenario.name,
      isEmailVerified: true,
      trialEndsAt: scenario.trialEndsAt,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      tier: scenario.tier,
      status: 'active',
      renewsAt:
        scenario.tier === 'FREE'
          ? null
          : new Date(Date.now() + 30 * MS_DAY),
    },
    create: {
      userId: user.id,
      tier: scenario.tier,
      status: 'active',
      renewsAt:
        scenario.tier === 'FREE'
          ? null
          : new Date(Date.now() + 30 * MS_DAY),
    },
  });

  await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: {
      balance: scenario.creditBalance,
      lastResetAt: new Date(),
    },
    create: {
      userId: user.id,
      balance: scenario.creditBalance,
      lifetimeUsed: 0,
      lastResetAt: new Date(),
    },
  });

  let profile = await prisma.businessProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });

  if (!profile) {
    profile = await prisma.businessProfile.create({
      data: {
        userId: user.id,
        businessName: scenario.businessName,
        industry: 'Technology',
        currentPhase: BusinessPhase.IDEA,
        country: 'USA',
      },
    });
  } else {
    profile = await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        businessName: scenario.businessName,
        industry: 'Technology',
        currentPhase: BusinessPhase.IDEA,
      },
    });
  }

  if (user.activeProfileId !== profile.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeProfileId: profile.id },
    });
  }

  if (typeof scenario.imageCountToday === 'number') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.dailyTask.findFirst({
      where: {
        userId: user.id,
        businessProfileId: profile.id,
        date: today,
      },
    });

    if (existing) {
      await prisma.dailyTask.update({
        where: { id: existing.id },
        data: { imageGenerationCount: scenario.imageCountToday },
      });
    } else {
      await prisma.dailyTask.create({
        data: {
          userId: user.id,
          businessProfileId: profile.id,
          date: today,
          tasks: [],
          imageGenerationCount: scenario.imageCountToday,
        },
      });
    }
  }

  const cfg = creditConfigs.get(scenario.tier);
  return {
    email: scenario.email,
    tier: scenario.tier,
    credits: scenario.creditBalance,
    trialEndsAt: scenario.trialEndsAt,
    limitHint: cfg,
    note: scenario.note,
  };
}

async function main() {
  console.log('🌱 Seeding dev subscription scenarios...\n');

  // Ensure credit configs exist (from main seed)
  const configs = await prisma.creditConfig.findMany();
  if (configs.length === 0) {
    console.error(
      '❌ No CreditConfig rows found. Run the main seed first:\n   npx prisma db seed',
    );
    process.exit(1);
  }

  const creditConfigs = new Map(
    configs.map((c) => [
      c.tier,
      {
        monthlyCredits: c.monthlyCredits,
        dailyCredits: c.dailyCredits,
        trialCredits: c.trialCredits,
      },
    ]),
  );

  const freeDaily = creditConfigs.get('FREE')?.dailyCredits ?? 500;
  const freeTrial = creditConfigs.get('FREE')?.trialCredits ?? 2000;
  const proMonthly = creditConfigs.get('PRO')?.monthlyCredits ?? 15000;
  const proPlusMonthly = creditConfigs.get('PRO_PLUS')?.monthlyCredits ?? 27000;
  const eliteMonthly = creditConfigs.get('ELITE')?.monthlyCredits ?? 60000;

  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);

  const scenarios: Scenario[] = [
    {
      email: 'trial@pioneerx.dev',
      name: 'Trial User',
      tier: 'FREE',
      trialEndsAt: new Date(Date.now() + 2 * MS_DAY),
      creditBalance: freeTrial,
      businessName: 'Trial Ventures',
      note: 'Active 3-day trial — trialCredits balance',
    },
    {
      email: 'free@pioneerx.dev',
      name: 'Free User',
      tier: 'FREE',
      trialEndsAt: null,
      creditBalance: freeDaily,
      businessName: 'Free Startup',
      note: 'Pure Free (no trial) — locked Pro+ sections',
    },
    {
      email: 'expired-trial@pioneerx.dev',
      name: 'Expired Trial User',
      tier: 'FREE',
      trialEndsAt: new Date(Date.now() - MS_DAY),
      creditBalance: freeDaily,
      businessName: 'Post Trial Co',
      note: 'Trial expired → Free daily credits',
    },
    {
      email: 'pro@pioneerx.dev',
      name: 'Pro User',
      tier: 'PRO',
      trialEndsAt: null,
      creditBalance: proMonthly,
      businessName: 'Pro Business',
      note: 'PRO tier — advanced sections unlocked',
    },
    {
      email: 'proplus@pioneerx.dev',
      name: 'Pro Plus User',
      tier: 'PRO_PLUS',
      trialEndsAt: null,
      creditBalance: proPlusMonthly,
      businessName: 'ProPlus Growth Inc',
      note: 'PRO_PLUS tier — growth sections unlocked',
    },
    {
      email: 'elite@pioneerx.dev',
      name: 'Elite User',
      tier: 'ELITE',
      trialEndsAt: null,
      creditBalance: eliteMonthly,
      businessName: 'Elite Holdings',
      note: 'ELITE tier — all sections unlocked',
    },
    {
      email: 'low-credits@pioneerx.dev',
      name: 'Low Credits User',
      tier: 'PRO',
      trialEndsAt: null,
      creditBalance: Math.max(1, Math.floor(proMonthly * 0.08)),
      businessName: 'Low Credit Labs',
      note: '~8% credits left — low-credit notification path',
    },
    {
      email: 'zero-credits@pioneerx.dev',
      name: 'Zero Credits User',
      tier: 'FREE',
      trialEndsAt: null,
      creditBalance: 0,
      businessName: 'Empty Tank Co',
      note: '0 credits — send/image should be blocked',
    },
    {
      email: 'image-limit@pioneerx.dev',
      name: 'Image Limit User',
      tier: 'FREE',
      trialEndsAt: null,
      creditBalance: freeDaily,
      businessName: 'Image Cap Studio',
      imageCountToday: 3,
      note: 'Free dailyImageLimit (3) already used today',
    },
  ];

  const results = [];
  for (const s of scenarios) {
    results.push(await upsertScenario(passwordHash, s, creditConfigs));
  }

  console.log('✅ Dev subscription users ready\n');
  console.log(`   Shared password: ${SHARED_PASSWORD}`);
  console.log('   ─────────────────────────────────────────────────────────');
  for (const r of results) {
    const trial =
      r.trialEndsAt === null
        ? 'no trial'
        : r.trialEndsAt > new Date()
          ? `trial until ${r.trialEndsAt.toISOString().slice(0, 10)}`
          : 'trial expired';
    console.log(
      `   ${r.email.padEnd(28)} ${String(r.tier).padEnd(9)} credits=${String(r.credits).padStart(5)}  (${trial})`,
    );
    console.log(`      → ${r.note}`);
  }
  console.log('   ─────────────────────────────────────────────────────────');
  console.log(
    '\n   Frontend: set NEXT_PUBLIC_ENABLE_DEV_LOGIN=true and restart next, then use email + password.',
  );
  console.log(
    '   Or (non-prod): magic-link with *@pioneerx.dev emails instant-logs in.\n',
  );
}

main()
  .catch((error) => {
    console.error('❌ Dev subscription seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
