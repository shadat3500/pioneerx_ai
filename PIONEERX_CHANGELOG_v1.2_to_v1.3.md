# PioneerX — Change Log: v1.2 → v1.3

> This document is for the coding agent. The existing codebase was built from v1.2. The items below describe **only what is new or changed**. Do not touch anything not mentioned here.

---

## Context

Currently `BusinessProfile` is 1:1 with `User`. This changelog converts it to 1:many — one user can have multiple business profiles. Each profile operates independently with its own AI context, generation history, saved outputs, and daily tasks. The user has one "active" profile at a time, which is what gets sent to the AI as context.

---

## 1. Schema Changes

**File:** `prisma/schema.prisma`

### 1a. Update `User` model — add `activeProfileId`

Add this field to the existing `User` model:

```prisma
activeProfileId String?
```

Do not add a Prisma relation for this field — just store the ID as a plain string to avoid circular relation issues between `User` and `BusinessProfile`.

### 1b. Update `BusinessProfile` model — remove `@unique` from `userId`

**Before (v1.2):**
```prisma
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
```

**After (v1.3):**
```prisma
model BusinessProfile {
  id           String        @id @default(uuid())
  userId       String                          // removed @unique
  user         User          @relation(fields: [userId], references: [id])
  businessName String?
  industry     String?
  currentPhase BusinessPhase @default(IDEA)
  country      String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  generations  Generation[]
  savedOutputs SavedOutput[]
  dailyTasks   DailyTask[]

  @@index([userId])
}
```

### 1c. Update `Generation` model — add `businessProfileId`

Add this field to the existing `Generation` model:

```prisma
businessProfileId String
businessProfile   BusinessProfile @relation(fields: [businessProfileId], references: [id])
```

### 1d. Update `SavedOutput` model — add `businessProfileId`

Add this field to the existing `SavedOutput` model:

```prisma
businessProfileId String
businessProfile   BusinessProfile @relation(fields: [businessProfileId], references: [id])
```

### 1e. Update `DailyTask` model — add `businessProfileId`

Add this field to the existing `DailyTask` model:

```prisma
businessProfileId String
businessProfile   BusinessProfile @relation(fields: [businessProfileId], references: [id])
```

**Action:** Apply all schema changes. Run `prisma migrate dev`.

---

## 2. New Endpoints — Business Profile

**File:** Create `src/business-profile/business-profile.controller.ts` (or add to existing controller)

```
POST   /business-profiles                  → create a new profile for the logged-in user
GET    /business-profiles                  → list all profiles for the logged-in user
GET    /business-profiles/:id              → get a single profile
PATCH  /business-profiles/:id             → update a profile (name, industry, phase, country)
DELETE /business-profiles/:id             → delete a profile (only if user has more than 1)
POST   /business-profiles/:id/activate    → set this profile as the active one
```

### Rules:
- A user can have a maximum of **[TBD — set in config, default: no limit for now]** profiles.
- On `DELETE`: if the deleted profile was the `activeProfileId`, set `activeProfileId` to the next available profile automatically.
- On `POST /business-profiles` (first profile creation): automatically set `User.activeProfileId` to the new profile's id.

---

## 3. Changes to Existing Endpoints

### 3a. All generation requests — use active profile context

**File:** `src/generation/generation.service.ts`

**Before (v1.2):** AI context was built from `user.businessProfile`.

**After (v1.3):** AI context must be built from the user's **active** profile:

```ts
const activeProfile = await prisma.businessProfile.findUnique({
  where: { id: user.activeProfileId }
});
```

Also set `businessProfileId: activeProfile.id` when creating the `Generation` row.

### 3b. Daily task generation — use active profile

**File:** wherever daily task generation is handled (BullMQ job / DailyTask service)

Same change — use `user.activeProfileId` to fetch the profile, pass it as AI context, and set `businessProfileId` on the `DailyTask` row.

### 3c. Saved outputs — set `businessProfileId`

**File:** `src/generation/generation.service.ts` (save output logic)

When saving an output, set `businessProfileId` from the generation's linked profile.

### 3d. GET /saved-outputs — filter by active profile

**Before:** Returns all saved outputs for the user.
**After:** Returns saved outputs for the user's current active profile only.

```ts
where: {
  userId: user.id,
  businessProfileId: user.activeProfileId
}
```

### 3e. GET /daily-tasks/today — filter by active profile

Same pattern — filter by `businessProfileId: user.activeProfileId`.

---

## 4. Auth — Profile Creation on Register

**File:** `src/auth/auth.service.ts`

When a new user is created (via magic link, Google OAuth, or password), automatically create a default `BusinessProfile` and set it as `activeProfileId`:

```ts
const profile = await prisma.businessProfile.create({
  data: { userId: user.id }
});

await prisma.user.update({
  where: { id: user.id },
  data: { activeProfileId: profile.id }
});
```

This ensures every user always has at least one profile from the moment they register.

---

## 5. Response — Include Active Profile Info

**File:** wherever the current user's data is returned (e.g. `GET /profile` or auth response)

Include the active profile in the response so the frontend always knows which profile is currently selected:

```ts
{
  user: { id, email, name, ... },
  activeProfile: { id, businessName, industry, currentPhase, ... },
  profiles: [ list of all profiles ]
}
```

---

## Summary of Files to Create/Modify

| Action | File/Location |
|---|---|
| Modify | `prisma/schema.prisma` — 5 changes (see §1a–1e) |
| Migrate | Run `prisma migrate dev` |
| Modify | `src/business-profile/` — add new CRUD + activate endpoints |
| Modify | `src/generation/generation.service.ts` — use activeProfileId for context + businessProfileId on rows |
| Modify | Daily task generation job — use activeProfileId |
| Modify | `GET /saved-outputs` — filter by activeProfileId |
| Modify | `GET /daily-tasks/today` — filter by activeProfileId |
| Modify | `src/auth/auth.service.ts` — create default profile on register |
| Modify | Current user response — include activeProfile + profiles list |
| No change | Token system, AI pipeline, Admin Panel, RevenueCat webhook |
