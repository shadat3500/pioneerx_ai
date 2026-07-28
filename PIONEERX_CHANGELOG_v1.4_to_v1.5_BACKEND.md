# PioneerX — Change Log: v1.4 → v1.5 (Backend)

> This document is for the coding agent. The existing codebase was built from v1.4. The items below describe **only what is new or changed**. Do not touch anything not mentioned here. Items marked **[COMMENT OUT]** must be commented out, never deleted.

---

## 1. Schema Changes

**File:** `prisma/schema.prisma`

### 1a. Add `CreditBalance` model

```prisma
model CreditBalance {
  id             String           @id @default(uuid())
  userId         String           @unique
  user           User             @relation(fields: [userId], references: [id])
  balance        Int              @default(0)
  lifetimeUsed   Int              @default(0)
  lastResetAt    DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}
```

Also add relation to `User` model:
```prisma
creditBalance CreditBalance?
```

### 1b. Add `CreditTransaction` model

Every deduct, refund, and top-up is logged here for audit and debugging:

```prisma
model CreditTransaction {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  amount       Int      // positive = credit added, negative = credit deducted
  type         String   // "deduct" | "refund" | "topup" | "reset"
  description  String?  // e.g. "message generation", "image generation", "billing reset"
  generationId String?
  createdAt    DateTime @default(now())
}
```

Also add relation to `User` model:
```prisma
creditTransactions CreditTransaction[]
```

### 1c. Add `imageGenerationCount` to `DailyTask` model

We reuse the `DailyTask` date-scoped record to track daily image counts:

```prisma
imageGenerationCount Int @default(0)
```

### 1d. Add `ImageGeneration` model

```prisma
model ImageGeneration {
  id                String          @id @default(uuid())
  userId            String
  user              User            @relation(fields: [userId], references: [id])
  businessProfileId String
  businessProfile   BusinessProfile @relation(fields: [businessProfileId], references: [id])
  prompt            String          @db.Text
  imageUrl          String
  creditsDeducted   Int             @default(40)
  createdAt         DateTime        @default(now())
}
```

Also add relation to `User` and `BusinessProfile` models:
```prisma
// On User:
imageGenerations ImageGeneration[]

// On BusinessProfile:
imageGenerations ImageGeneration[]
```

### 1e. Add `Notification` model

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String   // "credit_low" | "model_update" | "platform_update"
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId, isRead])
}
```

Also add relation to `User` model:
```prisma
notifications Notification[]
```

### 1f. Update `QuotaConfig` — add image limit field

Add to existing `QuotaConfig` model:
```prisma
dailyImageLimit Int? // null = unlimited
```

### 1g. Update `AiModelConfig` — add IMAGE_GENERATOR role

Add to existing `ModelRole` enum:
```prisma
IMAGE_GENERATOR
```

**Action:** Apply all schema changes. Run `prisma migrate dev`.

### 1h. Update `BusinessProfile` — Shared Business Brief fields

Cross-section continuity without copying full chat history between sections. Each **business profile** owns its own brief (never shared across a user's other profiles).

```prisma
model BusinessProfile {
  // ...existing fields...
  businessBrief    String?   @db.Text  // durable facts: product, audience, decisions, etc.
  briefUpdatedAt   DateTime?
  briefUpdatedFrom String?   // section key that last updated the brief
}
```

---

## 2. Seed Data Updates

**File:** `prisma/seed.ts`

### 2a. Seed `CreditBalance` defaults

On new user creation (handled in auth, see §4), not in seed. Seed only the config.

### 2b. Seed `QuotaConfig` — add image limits and credit limits

Update existing `QuotaConfig` upserts to include new fields:

```ts
const quotaConfigs = [
  { tier: 'FREE',     dailyTokenLimit: null, dailyRegenerateLimit: null, dailyImageLimit: 3,  dailyCreditLimit: 500  },
  { tier: 'PRO',      dailyTokenLimit: null, dailyRegenerateLimit: null, dailyImageLimit: 10, dailyCreditLimit: null },
  { tier: 'PRO_PLUS', dailyTokenLimit: null, dailyRegenerateLimit: null, dailyImageLimit: 20, dailyCreditLimit: null },
  { tier: 'ELITE',    dailyTokenLimit: null, dailyRegenerateLimit: null, dailyImageLimit: 30, dailyCreditLimit: null },
];
```

Monthly credit limits per tier (stored separately in a new `CreditConfig` — see §2c).

### 2c. Seed `AiModelConfig` — add IMAGE_GENERATOR role

```ts
await prisma.aiModelConfig.upsert({
  where:  { role: 'IMAGE_GENERATOR' },
  update: {},
  create: { role: 'IMAGE_GENERATOR', provider: 'openai', modelId: 'dall-e-3', isActive: true },
});
```

### 2d. Seed credit allowances per tier

Add a new `CreditConfig` table (add to schema as well):

```prisma
model CreditConfig {
  id             String           @id @default(uuid())
  tier           SubscriptionTier @unique
  monthlyCredits Int?             // null = daily reset applies instead
  dailyCredits   Int?             // used for Free and Trial
  trialCredits   Int?             // daily credits during trial period
  updatedAt      DateTime         @updatedAt
}
```

Seed values:
```ts
await prisma.creditConfig.createMany({
  data: [
    { tier: 'FREE',     monthlyCredits: null,   dailyCredits: 500,    trialCredits: 2000 },
    { tier: 'PRO',      monthlyCredits: 15000,  dailyCredits: null,   trialCredits: null },
    { tier: 'PRO_PLUS', monthlyCredits: 27000,  dailyCredits: null,   trialCredits: null },
    { tier: 'ELITE',    monthlyCredits: 60000,  dailyCredits: null,   trialCredits: null },
  ],
  skipDuplicates: true,
});
```

---

## 3. New Service — `CreditService`

**Create:** `src/credit/credit.service.ts` and `src/credit/credit.module.ts`

### 3a. `checkBalance(userId, estimatedCost): Promise<{ allowed: boolean; balance: number }>`
- Fetch `CreditBalance.balance` for user.
- If `balance >= estimatedCost` → allowed.
- If `balance < estimatedCost` → not allowed.

### 3b. `reserve(userId, amount, description): Promise<{ reservationId: string }>`
- Temporarily deduct `amount` from `CreditBalance.balance`.
- Log a `CreditTransaction` with `type: "deduct"`.
- Return a `reservationId` (the transaction id) for potential refund.

### 3c. `confirm(reservationId): Promise<void>`
- Mark the transaction as confirmed. No balance change needed (already deducted in reserve).

### 3d. `refund(reservationId): Promise<void>`
- Find the `CreditTransaction` by id.
- Add the amount back to `CreditBalance.balance`.
- Log a new `CreditTransaction` with `type: "refund"`.

### 3e. `getStatus(userId): Promise<{ balance, monthlyLimit, percentage, resetAt }>`
- Return current balance + limit from `CreditConfig` for user's tier.
- `percentage = (used / limit) * 100` where `used = limit - balance`.
- Used by frontend to display the credit meter.

### 3f. `resetOnBillingCycle(userId): Promise<void>`
- Called by RevenueCat webhook on `RENEWAL`.
- Set `CreditBalance.balance` to the tier's `monthlyCredits`.
- Log a `CreditTransaction` with `type: "reset"`.

### 3g. `checkAndNotifyLow(userId): Promise<void>`
- After every deduction, check if balance <= 10% of limit.
- If yes and no unread `credit_low` notification exists → create one.

---

## 4. Auth Changes — Credit Balance on Registration

**File:** `src/auth/auth.service.ts`

When a new user is created (magic link, Google OAuth, or password), after creating the user record, also create a `CreditBalance`:

```ts
// Determine starting credits based on trial
const creditConfig = await prisma.creditConfig.findUnique({ where: { tier: 'FREE' } });
const startingBalance = creditConfig.trialCredits ?? creditConfig.dailyCredits ?? 0;

await prisma.creditBalance.create({
  data: {
    userId: user.id,
    balance: startingBalance, // trial daily credits on day 1
    lastResetAt: new Date(),
  }
});
```

---

## 5. BullMQ Jobs — Credit Reset

**File:** wherever BullMQ cron jobs are defined

### 5a. Daily credit reset for Free users

Runs at midnight daily:
- Find all users where `Subscription.tier = FREE` and `trialEndsAt < now()`.
- Reset `CreditBalance.balance` to `CreditConfig.dailyCredits` for FREE tier.
- Log `CreditTransaction` with `type: "reset"`.

### 5b. Daily credit reset for Trial users

Runs at midnight daily:
- Find all users where `trialEndsAt > now()`.
- Reset `CreditBalance.balance` to `CreditConfig.trialCredits`.
- Log `CreditTransaction` with `type: "reset"`.

---

## 6. Changes to Message Generation

**File:** `src/conversation/conversation.service.ts`

### 6a. Add credit check before AI call

At the start of `sendMessage()`, before any AI call:

```ts
const estimatedCost = isFullPipeline ? 133 : 38;
const creditCheck = await this.creditService.checkBalance(userId, estimatedCost);

if (!creditCheck.allowed) {
  throw new HttpException(
    { creditLimitReached: true, balance: creditCheck.balance },
    HttpStatus.PAYMENT_REQUIRED
  );
}

const reservation = await this.creditService.reserve(userId, estimatedCost, 'message generation');
```

### 6b. On success — confirm reservation

After AI call succeeds:
```ts
await this.creditService.confirm(reservation.reservationId);
await this.creditService.checkAndNotifyLow(userId);
```

### 6c. On failure — refund reservation

In the catch block:
```ts
await this.creditService.refund(reservation.reservationId);
```

### 6d. Auto-generate action steps + links on every message

**[COMMENT OUT]** the existing standalone generate endpoint call logic inside `sendMessage()` if it exists. Do not delete.

After the assistant message is saved, automatically trigger generation:

```ts
const generationResult = await this.generateActionSteps(conversationId, userId);
```

`generateActionSteps()` fetches last 10 messages, calls AI for structured output `{ action_steps, suggested_links }`, saves a `Generation` row, and returns the result.

Return from `sendMessage()`:
```ts
return {
  message: assistantMessage,
  action_steps: generationResult.action_steps,
  suggested_links: generationResult.suggested_links,
  generationId: generationResult.id,
  creditStatus: await this.creditService.getStatus(userId),
};
```

### 6e. Cross-section business context

When building the AI prompt context, always include the full `BusinessProfile` (name, industry, phase, country) regardless of which section the conversation is in:

```ts
const activeProfile = await prisma.businessProfile.findUnique({
  where: { id: user.activeProfileId }
});

const context = {
  businessProfile: {
    name: activeProfile.businessName,
    industry: activeProfile.industry,
    phase: activeProfile.currentPhase,
    country: activeProfile.country,
  },
  sectionSystemPrompt: section.promptTemplates[0].systemPrompt,
  conversationHistory: last10Messages,
};
```

**Important:** The system prompt for every section must include this instruction:
*"You are advising on [section name] specifically. Use the business profile context provided to personalize your advice. Do not reference or continue conversations from other sections."*

This ensures **static** business profile fields are shared but conversations remain isolated.

> **Follow-up (implemented):** §6e alone is not enough for “Idea chat remembered in Branding.” See **§15 Shared Business Brief** for durable cross-section memory via `businessBrief` (still profile-scoped + section-isolated advice).

---

## 7. Bug Fixes

### 7a. Fix section description returning wrong section data

**File:** `src/section/section.service.ts`

The `findByKey()` method must query by `section.key`, not return a hardcoded or cached single section. Verify the query:

```ts
return prisma.section.findUnique({
  where: { key: sectionKey },
  include: { promptTemplates: { where: { isActive: true } } }
});
```

If this is already correct, check whether the controller is passing the wrong `sectionKey` param.

### 7b. Fix saved outputs showing in wrong section

**File:** `src/generation/generation.service.ts` or saved outputs endpoint

`GET /saved-outputs` must filter by both `userId` AND `sectionId`:

```ts
where: {
  userId: user.id,
  businessProfileId: user.activeProfileId,
  generation: {
    sectionId: section.id  // filter by current section
  }
}
```

### 7c. Fix saved output not showing conversation

**File:** `GET /generations/:id` or saved output fetch

When fetching a saved output, include the linked conversation messages:

```ts
include: {
  actionSteps: true,
  conversation: {
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    }
  }
}
```

### 7d. Fix conversationId not being linked on Generation save

**File:** wherever `Generation` rows are created

Ensure `conversationId` is always set when creating a `Generation` row inside `generateActionSteps()`:

```ts
await prisma.generation.create({
  data: {
    userId,
    sectionId,
    businessProfileId: user.activeProfileId,
    conversationId,           // must be set
    userPrompt: lastUserMessage.content,
    proposerResponses: [...],
    aggregatedResult: { action_steps, suggested_links },
  }
});
```

---

## 8. Image Generation Endpoint

**Create:** `src/image/image.service.ts` and `src/image/image.controller.ts`

```
POST /image/generate
Body: { prompt: string, type: "logo" | "business_card" }
```

Logic:
1. Check daily image limit: count today's `ImageGeneration` rows for this user. If `count >= QuotaConfig.dailyImageLimit` → 403.
2. Check credit balance: image costs 40 credits. `CreditService.checkBalance(userId, 40)`. If not allowed → 402.
3. Reserve 40 credits.
4. Call DALL-E 3 via OpenAI SDK with the user's prompt + type context.
5. On success: confirm reservation, save `ImageGeneration` row, return `{ imageUrl }`.
6. On failure: refund reservation, return error.
7. Include `creditStatus` in response.

---

## 9. Notification Endpoints

**Create:** `src/notification/notification.controller.ts`

```
GET   /notifications           → list unread notifications for current user
PATCH /notifications/:id/read  → mark one as read
PATCH /notifications/read-all  → mark all as read
```

Notifications are created by:
- `CreditService.checkAndNotifyLow()` → type: `credit_low`
- Admin Panel broadcast (new model / platform update) → type: `model_update` | `platform_update` (see §10)

---

## 10. Admin Panel — New Pages

Add these pages. Do not modify existing pages.

### 10a. Credit Config Manager
- View and edit `CreditConfig` per tier (monthlyCredits, dailyCredits, trialCredits).
- Changes take effect on next reset cycle.

### 10b. Broadcast Notification
- Form: select type (`model_update` | `platform_update`), enter message.
- On submit: create `Notification` rows for all active users.
- Endpoint: `POST /admin/notifications/broadcast`

### 10c. Image Limit Manager
- Already covered by existing `QuotaConfig` admin page — add `dailyImageLimit` field there.

---

## 11. RevenueCat Webhook — Credit Reset on Renewal

**File:** wherever RevenueCat webhook is handled

On `RENEWAL` event, after updating `Subscription.tier`, call:
```ts
await this.creditService.resetOnBillingCycle(userId);
```

---

## 12. Promo Code System

### 12a. Add `PromoCode` model

**File:** `prisma/schema.prisma`

```prisma
model PromoCode {
  id            String    @id @default(uuid())
  code          String    @unique
  trialDays     Int       // how many days of trial this code gives
  maxUses       Int?      // null = unlimited
  usedCount     Int       @default(0)
  expiresAt     DateTime?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())

  redemptions   PromoCodeRedemption[]
}

model PromoCodeRedemption {
  id          String    @id @default(uuid())
  promoCodeId String
  promoCode   PromoCode @relation(fields: [promoCodeId], references: [id])
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  redeemedAt  DateTime  @default(now())

  @@unique([promoCodeId, userId]) // one redemption per user per code
}
```

Also add relation to `User` model:
```prisma
promoRedemptions PromoCodeRedemption[]
```

Run `prisma migrate dev`.

### 12b. New Endpoint — Apply Promo Code

```
POST /auth/apply-promo
Body: { code: string }
Auth: required (logged-in user)
```

Logic:
1. Find `PromoCode` by `code` where `isActive = true`.
2. If not found → 404 ("Invalid promo code").
3. If `expiresAt < now()` → 400 ("Promo code expired").
4. If `maxUses` is set and `usedCount >= maxUses` → 400 ("Promo code limit reached").
5. Check `PromoCodeRedemption` — if user already used this code → 400 ("Already redeemed").
6. Update `User.trialEndsAt = now() + trialDays`.
7. Increment `PromoCode.usedCount`.
8. Create `PromoCodeRedemption` row.
9. Return `{ trialEndsAt }`.

### 12c. Promo Code at Registration

Optionally, promo code can also be applied at registration time. Add an optional `promoCode` field to the magic link / Google OAuth registration flow:

```ts
// After user is created:
if (promoCode) {
  await this.applyPromoCode(user.id, promoCode);
}
```

### 12d. Admin Panel — Promo Code Manager

Add a new page to the Admin Panel:
- Table of all promo codes (code, trialDays, maxUses, usedCount, expiresAt, isActive)
- Create new promo code (code, trialDays, maxUses, expiresAt)
- Toggle `isActive` on/off
- Endpoint: `POST /admin/promo-codes`, `GET /admin/promo-codes`, `PATCH /admin/promo-codes/:id`

---

## 13. `GET /sections` — Add `isLocked` Flag

**File:** `src/section/section.service.ts`

Change `GET /sections` to return **all active sections**, not just the ones accessible to the current tier. Add `isLocked` to each:

```ts
const userTierLevel = getTierLevel(user.subscription.tier); // FREE=0, PRO=1, PRO_PLUS=2, ELITE=3

return sections.map(section => ({
  ...section,
  isLocked: getTierLevel(section.requiredTier) > userTierLevel,
}));
```

Frontend uses `isLocked` to grey out sections and show upgrade prompt.

---

## Summary of Files to Create/Modify

| Action | File/Location |
|---|---|
| Modify | `prisma/schema.prisma` — §1a–1g + §1h Business Brief fields |
| Migrate | Run `prisma migrate dev` |
| Modify | `prisma/seed.ts` — CreditConfig, IMAGE_GENERATOR, QuotaConfig image limits |
| Modify | `src/auth/auth.service.ts` — create CreditBalance on registration |
| Create | `src/credit/credit.service.ts` + `credit.module.ts` |
| Create | BullMQ daily reset jobs for Free + Trial credit |
| Modify | `src/conversation/conversation.service.ts` — credit check, auto-generation, cross-section context, Shared Business Brief (§15) |
| Modify | `src/section/section.service.ts` — fix section query bug, add isLocked |
| Modify | Saved outputs endpoint — fix section filter + conversation include |
| Modify | Generation create — ensure conversationId always set |
| Create | `src/image/image.service.ts` + `image.controller.ts` |
| Create | `src/notification/notification.controller.ts` |
| Modify | RevenueCat webhook handler — call creditService.resetOnBillingCycle |
| Create | Admin: Credit Config Manager page |
| Create | Admin: Broadcast Notification page |
| Modify | Admin: QuotaConfig page — add dailyImageLimit field |
| Create | `src/promo/promo.service.ts` + `promo.controller.ts` |
| Modify | `src/auth/auth.service.ts` — optional promo code on registration |
| Create | Admin: Promo Code Manager page |
| Create | `src/business-profile/business-brief.service.ts` — Shared Business Brief (§15) |
| Modify | `src/business-profile/business-profile.module.ts` — export BusinessBriefService |
| No change | Auth endpoints, DailyTask, BusinessProfile CRUD basics, Token tracking |

---

## 14. Real Review System

### 14a. Add `Review` model

**File:** `prisma/schema.prisma`

```prisma
model Review {
  id          String   @id @default(uuid())
  userId      String?
  user        User?    @relation(fields: [userId], references: [id])
  name        String
  roleCompany String?
  reviewText  String   @db.Text
  rating      Int?     // 1-5 stars, optional
  avatarUrl   String?
  isApproved  Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

Also add relation to `User` model:
```prisma
reviews Review[]
```

Run `prisma migrate dev`.

### 14b. New Endpoints — User Review Submission

```
POST /reviews
Auth: required (logged-in user)
Body: { name: string, roleCompany?: string, reviewText: string, rating?: number }
```

Logic:
- Save `Review` row with `userId`, `isApproved: false`
- Return `{ message: "Review submitted. It will appear after approval." }`

### 14c. New Endpoints — Public Review Fetch

```
GET /reviews
Auth: not required (public)
Response: all reviews where isApproved = true, ordered by createdAt DESC
```

### 14d. Admin Endpoints — Review Management

```
GET    /admin/reviews/pending     → list all reviews where isApproved = false
GET    /admin/reviews             → list all reviews
PATCH  /admin/reviews/:id/approve → set isApproved = true
PATCH  /admin/reviews/:id/reject  → delete or soft-delete
DELETE /admin/reviews/:id         → hard delete
```

### 14e. Admin Panel — Review Manager Page

Add a new page to Admin Panel:
- Two tabs: Pending / Approved
- Each row shows: user name, role/company, review text, rating, submitted date
- Actions: Approve / Reject per row

---

## 15. Shared Business Brief (cross-section memory)

> Extends §6e. Static profile fields alone are not enough when a user discusses an idea in **Idea & Validation** and later asks for branding in **Branding** — they should not re-explain the whole business. Conversations stay section-isolated; durable facts live in a **per-profile brief**.

### 15a. Goal

| Do | Don't |
|---|---|
| Remember product / audience / decisions across sections for the **active** business profile | Copy full chat transcripts into other sections |
| Keep section advice scoped (Branding still only does branding) | Merge briefs across a user's other business profiles |
| Update brief in the background after successful chat | Charge user credits for brief refresh |

### 15b. Schema

See **§1h**. Fields on `BusinessProfile`: `businessBrief`, `briefUpdatedAt`, `briefUpdatedFrom`.

### 15c. New service — `BusinessBriefService`

**File:** `src/business-profile/business-brief.service.ts`

- `formatBriefForPrompt(brief, profile)` — inject into AI prompts with an explicit **this-profile-only** scope line.
- `refreshFromConversation({ userId, profileId, sectionKey, sectionName, messages, ... })`:
  - Re-load **this** profile from DB by `id` + `userId` (never use another profile's brief).
  - Load sibling profile names for the same user and tell the model: **do not include those businesses**.
  - Call `FREE_TIER_MODEL` to merge durable facts into JSON `{ brief, changed }`.
  - Save only onto `where: { id: profileId }`.
  - Fire-and-forget from `sendMessage` — failures are logged; they must not fail the user reply.
  - **No credit deduction** for brief updates.

### 15d. Wire into conversation prompts

**File:** `src/conversation/conversation.service.ts`

After a successful assistant reply in `sendMessage`:

```ts
void this.businessBriefService.refreshFromConversation({ ... });
```

In `buildChatPrompt` / `buildGeneratePrompt`, always include:

```
Active business ONLY: { businessName, industry, phase, country }
Shared Business Brief for "{businessName}" only: { formatBriefForPrompt(...) }
```

Plus hard rules: advise only for the active profile; use brief for personalization; do not change section job because of the brief; ignore other businesses.

### 15e. Isolation rules (must keep)

1. **Section isolation** — still refuse off-topic section work (see section system prompts + hard boundary).
2. **Profile isolation** — brief + prompt context are for `user.activeProfileId` / resolved active profile only. Never aggregate all profiles' Idea chats into one Branding answer.
3. If an existing brief was contaminated with multiple businesses, the next refresh must **strip other businesses** and keep only the active profile's facts.

---

## 16. Site CMS (About / Contact / Privacy / Terms) — admin-editable

> Website legal/marketing pages are **not** hardcoded long-term. Content is stored in Postgres and edited from the Admin Panel. Public site + app fetch by slug.

### 16a. Schema — `SitePage`

**File:** `prisma/schema.prisma`

```prisma
model SitePage {
  id        String   @id @default(uuid())
  /// Route slug: about-us | contact-us | privacy-policy | terms-condition
  slug      String   @unique
  title     String
  body      String   @db.Text
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@map("site_pages")
}
```

Apply with `npx prisma db push` (or a migration). Module `onModuleInit` / `ensureDefaults()` upserts the four slugs with draft copy (does not overwrite existing rows).

### 16b. Public endpoints

**Module:** `src/modules/site-page/`

```
GET /site-pages           → list pages (public)
GET /site-pages/:slug     → one page by slug (public)
```

Slugs must match frontend routes:

| Slug | Frontend route |
|---|---|
| `about-us` | `/about-us` |
| `contact-us` | `/contact-us` |
| `privacy-policy` | `/privacy-policy` |
| `terms-condition` | `/terms-condition` |

### 16c. Admin endpoints

```
GET   /admin/site-pages        → list (admin JWT)
PATCH /admin/site-pages/:slug  → update `{ title?, body }` (admin JWT)
```

### 16d. Admin Panel UI

- Sidebar + Settings hub card: **Site pages**
- Route: `/site-pages`
- Edit title + body per slug; save via `PATCH /admin/site-pages/:slug`

### 16e. Frontend (public website)

- `GET /site-pages/:slug` via RTK Query (`useGetSitePageQuery`)
- Shared client component renders title + `whitespace-pre-wrap` body
- Pages under `(mainLayout)`: `about-us`, `contact-us`, `privacy-policy`, `terms-condition`

### 16f. Related admin / infra notes (same release window)

- Admin dashboard uses live `GET /admin/dashboard-stats` (no mock KPI data)
- Admin Settings hub: Credits, Quotas (`dailyImageLimit`), Promos, Reviews, Broadcast, Site pages
- Pagination DTO: `@Type(() => Number)` so `page` / `limit` query params validate
- Dev CORS / Vite proxy: admin may call API via `/api/v1` proxy to avoid HTTPS HSTS redirect blocking preflight
- Google OAuth callback redirects to `{FRONTEND_URL}/auth/google/callback?access_token=&refresh_token=` then app routes to dashboard

---

## 17. Stripe Billing (web checkout) — NEW

> Until now the only payment path was **RevenueCat** (§11), which covers iOS/Android in-app purchase. The website cannot sell through RevenueCat, so v1.5 adds **Stripe Checkout + Billing Portal** as a second provider writing into the same `Subscription` record. RevenueCat code stays as-is; nothing in §11 is removed.

### 17a. Ground rules

| Rule | Why |
|---|---|
| One `Subscription` row per user, `provider` marks who owns it | Avoids two sources fighting over `tier` |
| Stripe is the source of truth **only** for `provider = "stripe"` rows; RevenueCat only for `"revenuecat"` | A Play Store cancellation must not wipe a web subscriber |
| A provider may **upgrade** a row it doesn't own, but may never **downgrade** another provider's active paid row | Prevents accidental loss of paid access |
| Tier comes from the **price → tier map in DB**, never hardcoded price IDs | Admin can change prices without a deploy |
| Every webhook event is recorded and de-duplicated by `eventId` | Stripe retries; handlers must be idempotent |
| Credits reset on `invoice.payment_succeeded`, not on `subscription.updated` | Money actually moved |

### 17b. Dependency + env

```bash
npm i stripe
```

**File:** `src/common/config/env.validation.ts` (all optional — backend must still boot with no Stripe keys)

```
STRIPE_SECRET_KEY=            # sk_test_... / sk_live_...
STRIPE_WEBHOOK_SECRET=        # whsec_... from `stripe listen` or dashboard endpoint
STRIPE_PUBLISHABLE_KEY=       # for the website (not used server-side)
STRIPE_CURRENCY=usd
STRIPE_SUCCESS_URL=           # default {FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=            # default {FRONTEND_URL}/billing/cancelled
STRIPE_PORTAL_RETURN_URL=     # default {FRONTEND_URL}/dashboard
```

If `STRIPE_SECRET_KEY` is empty, checkout/portal endpoints return **503 Service Unavailable** and the webhook returns `{ skipped: true }` instead of crashing the app.

### 17c. Schema changes

**File:** `prisma/schema.prisma`

Extend `Subscription`:

```prisma
model Subscription {
  // ... existing fields (tier, revenuecatEntitlementId, status, renewsAt)
  provider             String?  // "stripe" | "revenuecat" | null
  stripeCustomerId     String?
  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  cancelAtPeriodEnd    Boolean  @default(false)

  @@index([stripeCustomerId])
}
```

Add price → tier mapping (admin-editable, replaces hardcoded product matching):

```prisma
model StripePrice {
  id        String           @id @default(uuid())
  priceId   String           @unique // price_xxx from Stripe dashboard
  tier      SubscriptionTier
  interval  String           @default("month") // "month" | "year"
  label     String?          // "Pro monthly"
  amount    Int?             // minor units, display only
  currency  String           @default("usd")
  isActive  Boolean          @default(true)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@map("stripe_prices")
}
```

Webhook idempotency ledger (shared by both providers):

```prisma
model WebhookEvent {
  id          String   @id @default(uuid())
  provider    String   // "stripe" | "revenuecat"
  eventId     String
  type        String
  processedAt DateTime @default(now())

  @@unique([provider, eventId])
  @@map("webhook_events")
}
```

Payment history (for user receipts + admin revenue reporting):

```prisma
model PaymentRecord {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider    String   @default("stripe")
  invoiceId   String?  @unique
  amount      Int      // minor units (cents)
  currency    String   @default("usd")
  status      String   // "paid" | "failed" | "refunded"
  description String?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@map("payment_records")
}
```

Add relation on `User`:
```prisma
payments PaymentRecord[]
```

Apply with `npx prisma db push`.

### 17d. New module — `src/modules/billing/`

| File | Responsibility |
|---|---|
| `stripe.client.ts` | Lazily construct the `Stripe` SDK from `STRIPE_SECRET_KEY`; expose `isEnabled` |
| `billing.service.ts` | Checkout session, portal session, plan list, payment history |
| `stripe-webhook.service.ts` | Signature verify, de-dupe, event handlers |
| `billing.controller.ts` | User-facing `/billing/*` routes |
| `stripe-webhook.controller.ts` | `POST /webhooks/stripe` (public, raw body) |
| `dto/create-checkout-session.dto.ts` | `{ priceId? , tier?, interval? }` |

`BillingModule` imports `CreditModule` (credit reset) and is registered in `AppModule`.

### 17e. Endpoints

```
GET  /billing/plans              → public: active StripePrice rows (tier, interval, amount, label)
POST /billing/checkout-session   → auth: { priceId } | { tier, interval } → { url, sessionId }
POST /billing/portal-session     → auth: → { url }   (manage/cancel card + subscription)
GET  /billing/payments           → auth: user's PaymentRecord history
POST /webhooks/stripe            → public, raw body, Stripe-Signature verified
```

Checkout session details:
- `mode: "subscription"`, `line_items: [{ price, quantity: 1 }]`
- `client_reference_id = userId` and `metadata.userId = userId` → this is how the webhook maps back to our user
- Reuses `stripeCustomerId` if present, otherwise creates a Stripe customer and stores the id
- `success_url` / `cancel_url` from env

### 17f. Webhook events handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Store `stripeCustomerId` + `stripeSubscriptionId`, set `provider = "stripe"`, resolve tier from price |
| `customer.subscription.created` / `.updated` | Sync `tier`, `status`, `renewsAt = current_period_end`, `cancelAtPeriodEnd`, `stripePriceId` |
| `customer.subscription.deleted` | Downgrade to `FREE`, `status = "expired"` |
| `invoice.payment_succeeded` | `PaymentRecord(status: "paid")` + `creditService.resetOnBillingCycle(userId)` |
| `invoice.payment_failed` | `PaymentRecord(status: "failed")`, `status = "past_due"`, notification row |

Implementation requirements:
1. **Raw body** — `NestFactory.create(AppModule, { rawBody: true })` in `main.ts`; handler reads `req.rawBody` for `stripe.webhooks.constructEvent`. A parsed/re-serialized body will always fail signature verification.
2. **Skip throttling** — `@SkipThrottle()` on the webhook route (global throttler is 10 req/60s; Stripe bursts more than that).
3. **Always 200** on handled-but-ignored events so Stripe stops retrying; only return 4xx for a bad signature.
4. `@Public()` decorator so `AtGuard` doesn't demand a JWT.
5. Unknown `priceId` (not in `StripePrice`) → log + record the event, do not guess a tier.

### 17g. Provider coexistence with RevenueCat

**File:** `src/modules/subscription/subscription.service.ts`

Before writing tier from a RevenueCat event, guard:

```ts
// Don't let one store's cancellation downgrade the other provider's active paid plan
const existing = await this.repository.findByUserId(userId);
const otherProviderActive =
  existing?.provider && existing.provider !== 'revenuecat' &&
  existing.status === 'active' && existing.tier !== SubscriptionTier.FREE;

if (otherProviderActive && targetTier === SubscriptionTier.FREE) {
  // log and skip the downgrade
}
```

Stripe handlers apply the mirror-image rule. RevenueCat writes also set `provider = "revenuecat"` so ownership is explicit going forward.

### 17h. Admin endpoints — Stripe price map

```
GET    /admin/stripe-prices        → list mappings
POST   /admin/stripe-prices        → { priceId, tier, interval, label?, amount?, currency? }
PATCH  /admin/stripe-prices/:id    → update tier / label / amount / isActive
DELETE /admin/stripe-prices/:id    → remove mapping
GET    /admin/payments?page=&limit= → paginated payment history (all providers)
```

Admin Panel page **Billing** (`/billing`, sidebar + Settings card): paste the `price_...` id from the Stripe dashboard, pick tier + interval + amount, enable/disable or delete a mapping, and review recent payments.

### 17i. Frontend / app integration

- Website pricing page → `GET /billing/plans` → “Subscribe” → `POST /billing/checkout-session` → `window.location.href = url`
- Return routes needed: `/billing/success`, `/billing/cancelled`
- “Manage subscription” → `POST /billing/portal-session` → redirect
- Mobile app keeps using RevenueCat (store policy); web uses Stripe

### 17j. Local testing

```bash
stripe login
stripe listen --forward-to http://localhost:8010/api/v1/webhooks/stripe
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed
```

Test card `4242 4242 4242 4242`, any future expiry/CVC.

### 17k. Files touched

| Action | File |
|---|---|
| Modify | `prisma/schema.prisma` — `Subscription` fields, `StripePrice`, `WebhookEvent`, `PaymentRecord`, `User.payments` |
| Modify | `src/main.ts` — `rawBody: true` |
| Modify | `src/app.module.ts` — register `BillingModule` |
| Modify | `src/common/config/env.validation.ts` + `.env` — Stripe keys |
| Create | `src/modules/billing/*` (client, services, controllers, dto, module) |
| Modify | `src/modules/subscription/subscription.service.ts` — provider ownership guard + event de-dup |
| Modify | `src/modules/subscription/subscription.repository.ts` — `recordWebhookEvent` |
| Modify | `src/modules/admin/{admin.controller,admin.service,admin.repository}.ts` + `dto/stripe-price.dto.ts` |
| Create | Admin Panel: `src/pages/BillingPage.tsx` + route, sidebar and Settings entries |
| Modify | Admin Panel: `src/lib/api.ts`, `src/types/index.ts` |
| Modify | `APP_API_INTEGRATION_GUIDE.md` §13c |

### 17l. Status after this release

Done: schema, billing module, webhook, admin CRUD + UI, provider guard, docs.

Still open (needs the client's real Stripe account):
1. Put live `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in `.env`
2. Create the products/prices in Stripe and map them in Admin → Billing
3. Register the webhook endpoint `{HOST}/api/v1/webhooks/stripe` in the Stripe dashboard
4. End-to-end test with card `4242 4242 4242 4242`

### 17m. Frontend website checkout (wired)

| Route / UI | Behavior |
|---|---|
| Home `#pricing` (`Startfreescale.tsx`) | Free → auth or `/dashboard`; paid → `POST /billing/checkout-session` → Stripe redirect. Guest: AuthModal + pending checkout resume after login |
| `/billing/success?session_id=` | Confirms session, refreshes subscription/credits |
| `/billing/cancelled` | Cancelled messaging + link back to pricing |
| `/billing` | Current plan, Stripe portal (if `provider=stripe`), payment history |
| Profile menu + credit meter | Link to `/billing` |

RevenueCat remains mobile-app only — no website SDK.
