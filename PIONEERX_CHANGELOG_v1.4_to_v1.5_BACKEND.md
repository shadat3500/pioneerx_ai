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

This ensures business context is shared but conversations remain isolated.

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
| Modify | `prisma/schema.prisma` — 7 changes (§1a–1g) |
| Migrate | Run `prisma migrate dev` |
| Modify | `prisma/seed.ts` — CreditConfig, IMAGE_GENERATOR, QuotaConfig image limits |
| Modify | `src/auth/auth.service.ts` — create CreditBalance on registration |
| Create | `src/credit/credit.service.ts` + `credit.module.ts` |
| Create | BullMQ daily reset jobs for Free + Trial credit |
| Modify | `src/conversation/conversation.service.ts` — credit check, auto-generation, cross-section context fix |
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
| No change | Auth endpoints, DailyTask, BusinessProfile CRUD, Token tracking |

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
