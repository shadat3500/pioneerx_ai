# PioneerX — Master Technical Specification (v1.0)

> This document is the single source of truth for building PioneerX. It is written to be handed directly to a coding agent / CLI tool (e.g. Claude Code) to scaffold and implement the backend, admin panel, and supporting services. Anything marked **[DEFERRED]** is intentionally left open and must not block the initial build — defaults are provided.

---

## 1. Product Overview

PioneerX is an AI-powered business advisory platform. Users are guided through an 8-phase business journey (Idea → Validation → Setup → Launch → Growth → Scale → Expansion → Wealth) and have access to a catalog of "Sections" (specialized AI advisory modules — Idea & Validation, Branding, Marketing, Legal & Finance, etc.). In each Section, the user submits a prompt; the system runs that prompt through multiple AI models, merges the results, and returns a structured response: 4 action steps (with checkboxes), 4 tool/feature suggestions, 4 suggested links, and one AI tip. Users can save outputs and regenerate.

The dashboard also shows a daily AI-generated task list, e-commerce metrics (via Shopify), and is monetized via a 4-tier subscription (Free / Pro / Pro+ / Elite) sold through RevenueCat (mobile, Play Store distribution).

---

## 2. Tech Stack (Final)

| Layer | Choice | Why |
|---|---|---|
| Backend | **NestJS** (TypeScript) | 26 structurally similar Section modules + need for Guards (tier gating), Interceptors (AI call logging), Scheduled Tasks (daily cron), and a clean DI-based strategy pattern for swappable AI providers. Enforced conventions also produce more consistent output when a coding agent builds many similar modules across sessions. |
| ORM / DB | **Prisma + PostgreSQL** | Already the team's standard. |
| Mobile App | **Flutter** | Play Store distribution. |
| Admin Panel | Separate web app (React/Next.js), separate auth from end-user app | Admin manages nearly all dynamic config (see §6). |
| Cache / Queue | **Redis + BullMQ** | Config caching, daily task cron, quota counters (future). |
| Subscriptions | **RevenueCat** | Cross-platform receipt validation. |
| AI Providers | OpenAI, Google (Gemini), xAI (Grok), Anthropic (Claude) — accessed via an abstraction layer, never hardcoded (see §5.3) | Model landscape shifts monthly; abstraction avoids rework. |
| Deployment | `main` → AWS EC2 via Docker/ECR. `dev` → staging VPS via direct SSH/git pull. | Matches existing team pattern. |

---

## 3. Core Architectural Concepts

### 3.1 Phase vs. Section Access — Decoupled **[DEFERRED — default provided]**

The 8-phase journey and the Section sidebar are **two independent axes**:

- **Phase** (`BusinessProfile.currentPhase`) is a context/display field only. It feeds into AI prompts ("user is currently in Growth phase") and drives which Sections are *highlighted as recommended* on the dashboard. It does **not** gate access.
- **Section access** is controlled solely by `Section.requiredTier`, which is compared against the user's `Subscription.tier`. This mapping lives in the database and is editable from the Admin Panel — so if the client later decides Free users should only get a *partial* view of Core sections (e.g. tied to Phase 1–3), that rule can be implemented later as a config change, not an architecture change.
- **Default for v1 build:** Free tier = full access to all Core sections (see table below). This is the simplest consistent interpretation and can be tightened later without touching code.

Rough phase → recommended-section mapping (display/recommendation only, not enforced):

| Phase | Recommended Sections |
|---|---|
| Idea / Validation | Idea & Validation, Branding |
| Setup | Product/Service, Website & Tech, Legal & Finance |
| Launch | Launch, Marketing, Sales |
| Growth | Operations, Marketing, Sales, Customer Experience |
| Scale | Scaling, Financial Strategy, Data & Analytics, Automation Systems |
| Expansion | Revenue Expansion, Growth Engine, Partnerships |
| Wealth | Wealth & Capital, Investment & Acquisition, Multi-Business Mgmt, Exit & Legacy |

### 3.2 Section Catalog & Tier Mapping

| Tier | Category Label | Sections |
|---|---|---|
| FREE | Core | Idea & Validation, Branding, Product/Service, Website & Tech, Marketing, Sales, Operations, Legal & Finance, Launch, Scaling |
| PRO | Advanced | Financial Strategy, Personal Execution, Opportunity Engine, Partnerships, Customer Experience, Data & Analytics |
| PRO_PLUS | Pro+ Growth | Automation Systems, Advanced Marketing Lab, Revenue Expansion, Advanced Sales Systems, Growth Engine |
| ELITE | Elite | Wealth & Capital, Investment & Acquisition, Personal Brand, Multi-Business Mgmt, Exit & Legacy |

This is the seed data for the `Section` table. Tier requirement per row is editable later from Admin Panel.

### 3.3 Pricing (for reference — confirm exact billing-cycle meaning with client before launch)

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | AI Advisor (limited), Basic templates |
| Pro | $14.99/mo | All Core modules, Full AI Advisor, all templates/tools |
| Pro+ | $24.99/mo | Everything in Pro + Growth modules, Advanced AI Lab, Revenue expansion tools, Automation systems |
| Elite | $49.99/mo | Everything in Pro+ + Wealth strategy, Investment & M&A, Multi-business mgmt, Personal brand tools, Exit & legacy planning |

---

## 4. Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SubscriptionTier {
  FREE
  PRO
  PRO_PLUS
  ELITE
}

enum BusinessPhase {
  IDEA
  VALIDATION
  SETUP
  LAUNCH
  GROWTH
  SCALE
  EXPANSION
  WEALTH
}

enum TaskPriority {
  HIGH
  MEDIUM
  LOW
}

enum IntegrationProvider {
  SHOPIFY
  GOOGLE_ANALYTICS
}

enum ModelRole {
  PROPOSER_1
  PROPOSER_2
  PROPOSER_3
  AGGREGATOR
  DAILY_TASK_GENERATOR
}

model User {
  id              String            @id @default(uuid())
  email           String            @unique
  passwordHash    String
  name            String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  businessProfile BusinessProfile?
  integrations    Integration[]
  generations     Generation[]
  savedOutputs    SavedOutput[]
  dailyTasks      DailyTask[]
  subscription    Subscription?
}

model BusinessProfile {
  id           String        @id @default(uuid())
  userId       String        @unique
  user         User          @relation(fields: [userId], references: [id])
  businessName String?
  industry     String?
  currentPhase BusinessPhase @default(IDEA)
  country      String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Integration {
  id           String              @id @default(uuid())
  userId       String
  user         User                @relation(fields: [userId], references: [id])
  provider     IntegrationProvider
  accessToken  String              // encrypted at rest (app-level AES, not plaintext)
  refreshToken String?
  status       String              @default("connected")
  connectedAt  DateTime            @default(now())
}

model Section {
  id              String            @id @default(uuid())
  key             String            @unique          // "idea_validation"
  name            String                              // "Idea & Validation"
  category        String                              // core | advanced | pro_plus | elite
  requiredTier    SubscriptionTier  @default(FREE)
  isActive        Boolean           @default(true)

  promptTemplates PromptTemplate[]
  toolCatalog     ToolCatalogItem[]
  suggestedLinks  SuggestedLink[]
  generations     Generation[]
}

model PromptTemplate {
  id           String   @id @default(uuid())
  sectionId    String
  section      Section  @relation(fields: [sectionId], references: [id])
  systemPrompt String   @db.Text
  version      Int      @default(1)
  isActive     Boolean  @default(true)
  updatedAt    DateTime @updatedAt
}

model AiModelConfig {
  id        String    @id @default(uuid())
  role      ModelRole @unique
  provider  String    // "openai" | "google" | "xai" | "anthropic"
  modelId   String    // e.g. "gpt-5.5", "gemini-3-pro", "grok-4", "claude-opus-4-8"
  isActive  Boolean   @default(true)
  updatedAt DateTime  @updatedAt
}

model Generation {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  sectionId         String
  section           Section  @relation(fields: [sectionId], references: [id])
  userPrompt        String   @db.Text
  proposerResponses Json     // [{ role, modelId, raw }]
  aggregatedResult  Json     // { action_steps, tools_features, suggested_links, ai_tip }
  isSaved           Boolean  @default(false)
  createdAt         DateTime @default(now())

  actionSteps       ActionStep[]
  savedOutput       SavedOutput?
}

model ActionStep {
  id           String     @id @default(uuid())
  generationId String
  generation   Generation @relation(fields: [generationId], references: [id])
  text         String
  description  String?
  isDone       Boolean    @default(false)
  order        Int
}

model ToolCatalogItem {
  id          String  @id @default(uuid())
  sectionId   String
  section     Section @relation(fields: [sectionId], references: [id])
  name        String
  description String
  linkType    String  // "internal" | "external"
  url         String  // internal route or external URL
  isActive    Boolean @default(true)
}

model SuggestedLink {
  id               String  @id @default(uuid())
  sectionId        String
  section          Section @relation(fields: [sectionId], references: [id])
  label            String
  targetSectionKey String?
  externalUrl      String?
}

model AiTip {
  id       String  @id @default(uuid())
  text     String
  category String?
  isActive Boolean @default(true)
}

model SavedOutput {
  id           String     @id @default(uuid())
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  generationId String     @unique
  generation   Generation @relation(fields: [generationId], references: [id])
  label        String?
  savedAt      DateTime   @default(now())
}

model DailyTask {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  date            DateTime // date-only; one record per user per day
  tasks           Json     // [{ id, text, priority, isDone }]
  regenerateCount Int      @default(0)
  createdAt       DateTime @default(now())

  @@unique([userId, date])
}

model Subscription {
  id                      String           @id @default(uuid())
  userId                  String           @unique
  user                    User             @relation(fields: [userId], references: [id])
  tier                    SubscriptionTier @default(FREE)
  revenuecatEntitlementId String?
  status                  String           @default("active")
  renewsAt                DateTime?
  updatedAt               DateTime         @updatedAt
}

model QuotaConfig {
  id                   String           @id @default(uuid())
  tier                 SubscriptionTier @unique
  dailyRegenerateLimit Int?             // null = unlimited (current default for all tiers)
  updatedAt            DateTime         @updatedAt
}

model AdminUser {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         String   @default("admin")
  createdAt    DateTime @default(now())
}
```

---

## 5. AI Generation Pipeline (Mixture-of-Agents)

### 5.1 Flow (per Section generation request)

1. **Context assembly** — backend builds: `{ businessProfile (industry, phase, name), section.promptTemplate.systemPrompt, userPrompt, toolCatalog[sectionId] }`.
2. **Parallel proposer calls** — read `AiModelConfig` for `PROPOSER_1`, `PROPOSER_2`, `PROPOSER_3` (Redis-cached, short TTL, invalidated on Admin save). Call all three in parallel with identical instructions: *"Return ONLY valid JSON matching this schema: `{ action_steps: [{text, description}] (exactly 4), tools_features: [toolCatalogItemId] (up to 4, chosen only from the provided catalog list), suggested_links: [...], ai_tip: string }`."*
3. **Aggregation** — call the model configured for `AGGREGATOR` with the original context + all 3 proposer outputs. Instruction: *"From the candidates, select the most specific and actionable version of each idea. Do not blend or merge sentences from different candidates into a new sentence — pick the best existing one. Remove duplicates. Output one JSON object in the same schema."*
4. **Persistence** — save `Generation` with both `proposerResponses` (raw, for debugging/future analysis) and `aggregatedResult` (final). Create `ActionStep` rows from `aggregatedResult.action_steps`.
5. **Response** — return `aggregatedResult` + `generationId` to the client.
6. **Regenerate** — same endpoint, new `Generation` row created. Old rows are never hard-deleted.

### 5.2 Model Role Assignment (current default — change anytime via Admin Panel, no deploy needed)

| Role | Suggested Provider/Model | Rationale |
|---|---|---|
| PROPOSER_1 | OpenAI (GPT-5.x) | Broad business reasoning, strong ecosystem |
| PROPOSER_2 | Google (Gemini 3.x Pro) | Strong data-heavy analysis (competitor/demand work), diversity of training approach |
| PROPOSER_3 | xAI (Grok 4) | Best for recency-sensitive content (industry alerts, current trends) |
| AGGREGATOR | Anthropic (Claude Opus) | Strongest at producing polished, coherent, user-facing synthesis |
| DAILY_TASK_GENERATOR | Single model only (e.g. Claude or GPT) | Daily tasks are lighter-weight; full 4-call MoA pipeline is unnecessary here — use one well-prompted call instead |

### 5.3 Model Abstraction Layer (NestJS)

`AiProviderService.callModel(role: ModelRole, prompt: string): Promise<json>` looks up `AiModelConfig` by role (cached), dispatches to the matching SDK (OpenAI / Google GenAI / xAI / Anthropic). **Never hardcode a model name in business logic** — only this service knows which SDK to call, and it reads that from the database. Adding/swapping a provider = one new `case` in this service + one DB row update from the Admin Panel.

---

## 6. Admin Panel — Functional Spec

Separate `AdminUser` auth (JWT), fully separate from end-user auth. Pages:

- **AI Model Config** — assign provider+modelId to each `ModelRole`.
- **Tool Catalog Manager** — CRUD `ToolCatalogItem` per Section (this is first-party content; engineering seeds an initial set per section, admin maintains it going forward — entries can point to either an internal in-app tool route or an external resource link).
- **Prompt Template Editor** — per-Section system prompt, versioned (`isActive` toggle allows rollback without deleting history).
- **Section Manager** — toggle `requiredTier` and `isActive` per Section (this is what absorbs the Free-tier-scope decision in §3.1 whenever it's finalized).
- **Quota Manager** — set `QuotaConfig.dailyRegenerateLimit` per tier (currently null/unlimited for all tiers).
- **AI Tip Manager** — CRUD the pool of `AiTip` rows.
- **Subscription overview** — read-only list of users + tiers, for support purposes.

---

## 7. API Endpoints (by NestJS module)

```
AuthModule
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh

BusinessProfileModule
  GET    /profile
  PATCH  /profile

SectionModule
  GET    /sections                    (tier-filtered for current user)
  GET    /sections/:key

GenerationModule
  POST   /sections/:key/generate
  GET    /generations/:id
  POST   /generations/:id/save
  GET    /saved-outputs

DailyTaskModule
  GET    /daily-tasks/today
  PATCH  /daily-tasks/:id/toggle/:taskId
  POST   /daily-tasks/regenerate

IntegrationModule
  POST   /integrations/shopify/connect      (OAuth callback)
  GET    /integrations/shopify/metrics      (revenue, orders, customers only — see §10)

SubscriptionModule
  POST   /webhooks/revenuecat
  GET    /subscription/me

AdminModule  (separate base path /admin, AdminAuthGuard)
  CRUD endpoints for: AiModelConfig, ToolCatalogItem, PromptTemplate,
  Section, QuotaConfig, AiTip
```

---

## 8. Daily AI Task List — Logic

- Generated once per day per user (BullMQ scheduled job at local midnight, or on first dashboard open of the day as fallback if the cron missed the user).
- Uses **`DAILY_TASK_GENERATOR`** role only (single model call — not the full MoA pipeline; see §5.2).
- Input context includes the **previous day's `DailyTask.tasks`** (which items were/weren't completed) plus `BusinessProfile` (phase, industry), so generated tasks can meaningfully reference prior progress (e.g. "Review yesterday's key metrics...").
- Checkbox toggling updates the matching item's `isDone` inside the day's `tasks` JSON array; "X of Y completed" is computed on read.
- "Regenerate" overwrites that day's `tasks` array and increments `regenerateCount`. No quota currently enforced (see §6, `QuotaConfig`), but the hook exists for when the client requests one.

---

## 9. Subscription & RevenueCat

- RevenueCat sends webhook events (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`) to `POST /webhooks/revenuecat`.
- Verify signature/shared secret.
- Map `product_id` → internal `SubscriptionTier` enum.
- Update `Subscription.tier`, `status`, `renewsAt` on the user.
- On app open, optionally reconcile against RevenueCat's REST API as a safety check against missed webhooks.

---

## 10. Integrations

### 10.1 Shopify (build now)
- Public Shopify App (OAuth, since each user connects their own store).
- Use Admin REST/GraphQL API for **Orders** and **Customers** only → revenue, order count, customer count, growth rate.
- Store per-user access token encrypted in `Integration`.

### 10.2 Visitors / Conversion Rate — **[DEFERRED to Phase 2]**
Shopify's native API does not expose the session data needed to compute conversion rate. When this is picked up: integrate Google Analytics (GA4) Data API via a separate OAuth scope on the merchant's Google account — most merchants already have GA4 connected to their store, making this lower-effort than building a custom tracking pixel. Not part of the v1 build.

---

## 11. Security & Non-Functional Notes

- Encrypt all third-party tokens (`Integration.accessToken`/`refreshToken`) at rest.
- `AdminUser` auth fully isolated from end-user auth — different guard, ideally different subdomain.
- Log every `Generation` (which models were used, latency per call) even though cost/quota isn't enforced yet — needed later for quality/cost analysis.
- Rate-limiting middleware should exist at the route level even if `QuotaConfig` values are currently null, so enabling a limit later is a config change, not a code change.

---

## 12. Deferred / Open Decisions

These are intentionally not resolved in this spec. The architecture is built so resolving them later is a config change, not a rebuild:

1. **Free tier exact scope** — full Core access (current default) vs. partial/phase-limited access. Resolve via `Section.requiredTier` once confirmed with client.
2. **Regenerate quota numeric limits** — currently unlimited for all tiers. Set via `QuotaConfig` if/when client requests limits.
3. **Phase → Section recommendation mapping** — the table in §3.1 is a first draft; refine based on real usage data.
4. **Shopify visitors/conversion rate** — GA4 integration, Phase 2.

---

## 13. Suggested Build Order

1. Auth + `User` + `BusinessProfile`
2. Prisma schema + migrations + seed Section catalog (§3.2) and initial ToolCatalogItem entries
3. `AiProviderService` abstraction (§5.3) + `PromptTemplate` system
4. Single-model generation working end-to-end (proposer + aggregator skipped → just AGGREGATOR), then layer in the full MoA pipeline (§5.1)
5. `Generation` + `ActionStep` + `SavedOutput`
6. Admin Panel APIs (§6) — config tables first, since everything downstream reads from them
7. Daily Task List + cron (§8)
8. Subscription + RevenueCat webhook (§9)
9. Shopify integration — Orders/Customers only (§10.1)
10. Logging, rate-limit middleware scaffolding (§11)