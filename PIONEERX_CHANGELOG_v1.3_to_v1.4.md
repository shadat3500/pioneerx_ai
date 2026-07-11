# PioneerX — Change Log: v1.3 → v1.4

> This document is for the coding agent. The existing codebase was built from v1.3. The items below describe **only what is new or changed**. Do not touch anything not mentioned here.

---

## Context

This changelog introduces four major changes:
1. Section-scoped chatbot (replaces the single prompt → structured output flow)
2. Output structure simplified (only action steps + suggested links + save option remain)
3. Shopify integration fully removed
4. Business profile creation limit for Free tier (max 3)

---

## 1. Schema Changes

**File:** `prisma/schema.prisma`

### 1a. Add `Conversation` model

```prisma
model Conversation {
  id                String          @id @default(uuid())
  userId            String
  user              User            @relation(fields: [userId], references: [id])
  businessProfileId String
  businessProfile   BusinessProfile @relation(fields: [businessProfileId], references: [id])
  sectionId         String
  section           Section         @relation(fields: [sectionId], references: [id])
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  messages          Message[]

  @@unique([userId, businessProfileId, sectionId]) // one active conversation per user per profile per section
}
```

### 1b. Add `Message` model

```prisma
model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // "user" | "assistant"
  content        String       @db.Text
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}
```

### 1c. Update `Generation` model

`Generation` is no longer created per prompt. It is now created when the user clicks the "Generate" button inside a conversation. Add `conversationId` to link it:

```prisma
conversationId String?
conversation   Conversation? @relation(fields: [conversationId], references: [id])
```

Also add this relation to the `Conversation` model:
```prisma
generations Generation[]
```

### 1d. Remove `Integration` model and `IntegrationProvider` enum

The `Integration` model and `IntegrationProvider` enum were used for Shopify. Both are now removed.

**Before:**
```prisma
enum IntegrationProvider {
  SHOPIFY
  GOOGLE_ANALYTICS
}

model Integration {
  ...
}
```

**After:** Delete both entirely from schema.

Also remove the `integrations` relation from the `User` model:
```prisma
// Remove this line from User model:
integrations Integration[]
```

### 1e. Remove `ToolCatalogItem` model

Tools & Features section has been removed from the product. Remove the `ToolCatalogItem` model entirely and remove its relation from the `Section` model:

```prisma
// Remove from Section model:
toolCatalog ToolCatalogItem[]

// Remove entire model:
model ToolCatalogItem { ... }
```

### 1f. Remove `AiTip` model

AI Tip has been removed from the output. Remove the `AiTip` model entirely.

```prisma
// Remove entire model:
model AiTip { ... }
```

**Action:** Apply all schema changes. Run `prisma migrate dev`.

---

## 2. New Chat Endpoints

**Create:** `src/conversation/conversation.controller.ts` and `conversation.service.ts`

```
GET    /conversations/:sectionKey          → get or create conversation for this user + active profile + section
POST   /conversations/:sectionKey/message  → send a user message, get AI reply
POST   /conversations/:sectionKey/generate → generate action steps + suggested links from conversation context
```

### 2a. `GET /conversations/:sectionKey`

- Find existing `Conversation` by `{ userId, businessProfileId: activeProfileId, sectionId }`.
- If not found → create one.
- Return conversation + all messages (ordered by `createdAt` ASC).
- Frontend uses this to render the full chat history when user opens a section.

### 2b. `POST /conversations/:sectionKey/message`

Body: `{ content: string }`

Logic:
1. Find the conversation (create if not exists).
2. Save the user message as a `Message` row `{ role: "user", content }`.
3. Fetch the **last 10 messages** from this conversation (ordered by `createdAt` DESC, limit 10, then reverse for chronological order) — use these as AI context.
4. Build context: `{ businessProfile (industry, phase, name), section.promptTemplate.systemPrompt, last10Messages }`.
5. Call AI (use the appropriate pipeline based on tier — Free = FREE_TIER_MODEL, others = full MoA).
6. Save AI response as a `Message` row `{ role: "assistant", content }`.
7. Log token usage via `TokenService.logUsage()`.
8. Return `{ message: assistantMessage, tokenStatus }`.

> Note: All messages are stored in DB permanently. Only last 10 are sent to AI as context. This keeps storage intact for future use while keeping token costs controlled.

### 2c. `POST /conversations/:sectionKey/generate`

This endpoint is triggered when the user clicks the "Generate" button — independent of the chat flow, can be called at any time.

Logic:
1. Fetch the last 10 messages from the conversation.
2. Build prompt: *"Based on this conversation, generate exactly 4 action steps and exactly 4 suggested links relevant to this business and section. Return JSON only: `{ action_steps: [{ text, description }], suggested_links: [{ label, targetSectionKey?, externalUrl? }] }`"*
3. Call AI (same tier-based pipeline as messages).
4. Save result as a `Generation` row linked to the conversation.
5. Log token usage.
6. Return `{ generationId, action_steps, suggested_links, tokenStatus }`.

---

## 3. Changes to Existing Endpoints

### 3a. Remove old generation endpoint

**Remove:** `POST /sections/:key/generate` (the old single-prompt → structured output flow)

Replace with the new `POST /conversations/:sectionKey/generate` from §2c.

### 3b. `POST /generations/:id/save` — no change needed

Save output still works the same — user can save any `Generation` by id. No changes required.

### 3c. `GET /saved-outputs` — no change needed

Already filters by `userId` and `businessProfileId`. No changes required.

---

## 4. Remove Shopify Integration

### 4a. Remove endpoints

**Remove these endpoints entirely:**
```
POST /integrations/shopify/connect
GET  /integrations/shopify/metrics
```

Remove the `IntegrationModule` entirely if Shopify was its only purpose.

### 4b. Remove any Shopify-related code

Search the codebase for any references to:
- `shopify`
- `IntegrationProvider`
- `Integration` model usage
- Shopify OAuth flow
- Shopify metrics fetching

Remove all of them.

---

## 5. Remove Progress Bar

Search the codebase for any progress bar logic related to:
- Phase completion tracking
- Section unlock progress
- Any `progress`, `completedPhases`, `unlockedSections` fields or logic

Remove all of them. Phase (`BusinessProfile.currentPhase`) stays as a field — it is still used as AI context. Only progress/unlock tracking logic is removed.

---

## 6. Business Profile Creation Limit

**File:** `src/business-profile/business-profile.service.ts`

In the `create()` method, add a limit check before creating a new profile:

```ts
const profileCount = await prisma.businessProfile.count({
  where: { userId: user.id }
});

const limit = user.subscription.tier === 'FREE' ? 3 : null; // null = unlimited

if (limit !== null && profileCount >= limit) {
  throw new HttpException(
    'Free tier allows a maximum of 3 business profiles. Upgrade to create more.',
    HttpStatus.FORBIDDEN
  );
}
```

| Tier | Max Profiles |
|---|---|
| FREE | 3 |
| PRO | Unlimited |
| PRO_PLUS | Unlimited |
| ELITE | Unlimited |

---

## 7. Output Structure — What Remains vs What Is Removed

| Feature | v1.3 | v1.4 |
|---|---|---|
| Chat / Conversation | ❌ | ✅ |
| Action Steps (4) | ✅ | ✅ (generated on demand via Generate button) |
| Suggested Links (4) | ✅ | ✅ (generated on demand via Generate button) |
| Tools & Features | ✅ | ❌ Removed |
| AI Tip | ✅ | ❌ Removed |
| Save Output | ✅ | ✅ |
| Shopify Metrics | ✅ | ❌ Removed |
| Progress Bar | ✅ | ❌ Removed |

---

## 8. AI Pipeline — No Structural Change

The MoA pipeline (proposer 1/2/3 + aggregator) and FREE_TIER_MODEL logic stay exactly the same. The only difference is:
- Chat messages use the pipeline for conversational replies.
- Generate button uses the pipeline to produce structured JSON output.

Both flows go through the same `AiProviderService`.

---

## Summary of Files to Create/Modify

| Action | File/Location |
|---|---|
| Modify | `prisma/schema.prisma` — add Conversation + Message, update Generation, remove Integration + ToolCatalogItem + AiTip |
| Migrate | Run `prisma migrate dev` |
| Create | `src/conversation/conversation.service.ts` |
| Create | `src/conversation/conversation.controller.ts` |
| Create | `src/conversation/conversation.module.ts` |
| Remove | `POST /sections/:key/generate` (old endpoint) |
| Remove | `IntegrationModule` / Shopify endpoints and all related code |
| Remove | Progress bar logic throughout codebase |
| Modify | `src/business-profile/business-profile.service.ts` — add Free tier profile limit check |
| No change | Token system, Admin Panel, RevenueCat webhook, Auth, Daily Tasks |
