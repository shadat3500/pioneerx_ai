# PioneerX API — App Integration Guide (v1.5)

> For **mobile / web app** developers. You do **not** need a verbal walkthrough of every endpoint — follow this guide + import `PioneerX AI API v1.5.postman_collection.json` for exact request samples.
>
> Admin panel APIs are listed briefly at the end; most app work never touches them.

---

## 1. Quick start

| Item | Value |
|------|--------|
| Base URL | `{HOST}/api/v1` (local example: `http://localhost:8010/api/v1`) |
| Format | JSON |
| Auth | `Authorization: Bearer {access_token}` on protected routes |
| Tokens | `access_token` + `refresh_token` (JWT) |

### Success envelope

Almost all JSON responses look like:

```json
{
  "statusCode": 200,
  "message": "Operation successful",
  "success": true,
  "data": { }
}
```

**Always read payload from `data`.**

### Error envelope

```json
{
  "code": 402,
  "message": "...",
  "success": false
}
```

`message` may be a string or an object (e.g. `{ creditLimitReached: true, balance: 12 }`).

| HTTP | Meaning | App action |
|------|---------|------------|
| 401 | Missing/invalid JWT | Refresh or force re-login |
| 402 | Not enough credits | Show “buy / wait for reset”; stop AI call |
| 403 | Forbidden (e.g. daily image limit, locked section) | Show limit UI |
| 404 | Not found | Soft error |
| 429 | Rate / quota style limit | Retry later |

---

## 2. Recommended app architecture (API map)

```
Splash / cold start
  └─ has tokens? → GET /profile + GET /credit-status + GET /sections
       └─ no → Auth screens

Auth
  ├─ Magic link: POST /auth/magic-link → email → open link → GET /auth/verify?token=
  ├─ Google: open GET /auth/google in browser/WebView → backend redirects to
  │          {FRONTEND}/auth/google/callback?access_token=&refresh_token=
  └─ (dev only) POST /auth/login email+password

Home / Dashboard
  ├─ GET /daily-tasks/today
  ├─ GET /credit-status
  ├─ GET /notifications
  └─ GET /sections  (each item has isLocked)

Section chat (e.g. Branding, Idea Validation)
  ├─ GET /conversations/{sectionKey}     ← active session (empty after re-login)
  ├─ POST /conversations/session/reset   ← call once after login
  ├─ POST /conversations/{sectionKey}/new
  ├─ POST /conversations/{sectionKey}/message
  ├─ POST /image/generate  (optional, with sectionKey)
  ├─ GET /image/generations/{id}
  ├─ GET /saved-outputs
  └─ POST /saved-outputs/{id}/open       ← restore saved chat into active session

Profile / multi-business
  ├─ GET|PATCH /profile
  ├─ GET|POST /business-profiles
  ├─ POST /business-profiles/{id}/activate
  └─ PATCH|DELETE /business-profiles/{id}

Account extras
  ├─ POST /auth/apply-promo
  ├─ GET /subscription/me
  ├─ GET /auth/me             ← name, email, avatarUrl
  ├─ DELETE /auth/me          ← delete my account (permanent)
  ├─ POST /reviews  /  GET /reviews (public approved)
  └─ POST /auth/refresh  when access expires
```

---

## 3. Auth

### 3.1 Magic link (primary)

1. `POST /auth/magic-link`  
   Body: `{ "email": "user@mail.com", "promoCode": "OPTIONAL" }`  
   Always returns something like “Check your email” (no user enumeration).

2. User opens email link → your app route with `?token=...`

3. `GET /auth/verify?token={token}`  
   → `data.access_token`, `data.refresh_token`  
   Store both securely (Keychain / SecureStore / httpOnly cookie / your existing pattern).

### 3.2 Google

1. Open in system browser / ASWebAuthenticationSession / Custom Tabs:  
   `GET {base}/auth/google`
2. Google consent → backend `GET /auth/google/callback`
3. Backend **302 redirects** to:  
   `{FRONTEND_URL}/auth/google/callback?access_token=...&refresh_token=...`
4. App deep-link / WebView intercepts query params → save tokens → go to home.

> Do **not** call Google callback from Postman as a normal JSON API.

### 3.3 Refresh

`POST /auth/refresh` with `Authorization: Bearer {refresh_token}`  
→ new access (and possibly refresh) tokens.

### 3.4 Logout

`POST /auth/logout` (Bearer access) → clear local tokens.

### 3.5 Get my profile

`GET /auth/me` (Bearer access). No body.

```json
{
  "id": "...",
  "name": "Rup",
  "email": "you@mail.com",
  "avatarUrl": "https://lh3.googleusercontent.com/a/..."
}
```

`avatarUrl` is the **Google account photo**, saved on **Google Sign-In**. Magic-link / Apple / password login does not receive Gmail’s picture — then `avatarUrl` is `null` and the app should show the demo `user.png`.

Existing users get a photo on their **next Google login**.

### 3.6 Delete my account (required for App Store / Play)

`DELETE /auth/me` (Bearer access)

- Deletes **only the logged-in user** (never pass someone else’s id).
- Removes the user row and cascaded data (profiles, chats, credits, etc.).
- If they have a **Stripe** subscription, the API tries to cancel it first.
- **RevenueCat / App Store / Play** subscriptions are **not** cancelled here. Show this copy in the confirm UI: *Cancel App Store / Google Play subscriptions in store settings, or billing may continue.*
- On success: `{ "deleted": true }` inside `data`. Then wipe local tokens and send the user to the signed-out screen.

Do **not** use `DELETE /users/{id}` from the app.

### 3.7 Promo after login

`POST /auth/apply-promo` Body: `{ "code": "LAUNCH30" }` (authenticated).

---

## 4. Profile & businesses

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile` | Current user + **active** business profile |
| PATCH | `/profile` | Update active profile fields (name, industry, phase, …) |
| GET | `/business-profiles` | List all businesses for user |
| POST | `/business-profiles` | Create business |
| POST | `/business-profiles/{id}/activate` | Switch active business |
| PATCH/DELETE | `/business-profiles/{id}` | Update / remove |

### Shared Business Brief (important for chat UX)

- Field on active `BusinessProfile`: `businessBrief` (plus `briefUpdatedAt`, `briefUpdatedFrom`).
- **No dedicated write API.** After each successful chat message, the backend updates the brief asynchronously.
- App only **displays** it if you want; chat quality improves automatically across sections (Idea → Branding, etc.) for the **active** profile only.

---

## 5. Sections & locking

`GET /sections` → **all** active sections, each with:

- `key` (use this in URLs), `name`, …
- `isLocked` — if `true`, show upgrade / locked UI; don’t open chat.

`GET /sections/{sectionKey}` → one section.

Use `sectionKey` everywhere (examples: `idea_validation`, `branding`, `marketing`).

---

## 6. Conversations (core product)

### Load history

`GET /conversations/{sectionKey}`

- Returns the **active** conversation for `{ userId, activeProfileId, section }` (see v1.5 §18).
- If none is active (e.g. right after login reset), creates a **new empty** thread.
- After logout → login the app must call `POST /conversations/session/reset` so chats start fresh. Saved outputs are untouched; conversations are **not** deleted.

**Restore a save into the chat:**

`POST /saved-outputs/{id}/open` → sets that thread active and returns the conversation payload. Continue chatting; the next `POST /generations/{id}/save` **updates** that SavedOutput.

**Start another blank thread in the same login:**

`POST /conversations/{sectionKey}/new`

**Image messages in history:**  
assistant `imageUrl` may be `"image-generation:{uuid}"` (not a full data URL).  
Resolve with:

`GET /image/generations/{uuid}` → `{ id, imageUrl, prompt, createdAt }`

### Send message (main AI call)

`POST /conversations/{sectionKey}/message`  
Body:

```json
{ "content": "User text here" }
```

Success `data` includes roughly:

```json
{
  "message": { "id": "...", "role": "assistant", "content": "..." },
  "generationId": "...",
  "action_steps": [ /* up to 4 */ ],
  "suggested_links": [ /* up to 4 */ ],
  "creditStatus": { "balance", "limit", "percentage", "resetAt" },
  "tokenStatus": { }
}
```

**Credits:** reserved before AI, confirmed on success, refunded on failure.  
**402** → not enough credits (`creditLimitReached`).

Optional manual regen (already auto-runs after message):

`POST /conversations/{sectionKey}/generate`

### Save / list outputs

| Method | Path |
|--------|------|
| GET | `/generations/{id}` |
| POST | `/generations/{id}/save` |
| DELETE | `/generations/{id}/save` |
| GET | `/saved-outputs?sectionKey={optional}` |

---

## 7. Credits

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/credit-status` | Meter UI |

`data` shape:

```json
{
  "balance": 1500,
  "limit": 2000,
  "percentage": 25,
  "resetAt": "2026-07-25T00:00:00.000Z"
}
```

Rough costs (server-side constants; treat as current product numbers):

| Action | Credits |
|--------|--------:|
| Full chat message | ~133 |
| Free-tier style message | ~38 |
| Image generate | 40 |

Free / trial: daily reset. Paid tiers: monthly / billing-cycle reset (RevenueCat webhook on backend).

Also refresh meter from `creditStatus` on message / image responses.

---

## 8. Images

`POST /image/generate`

```json
{
  "prompt": "Minimal logo for a coffee brand",
  "type": "logo",
  "sectionKey": "idea_validation"
}
```

- `type`: `"logo"` \| `"business_card"`
- `sectionKey` optional — if set, also appends messages into that section’s chat
- Cost: **40** credits + optional daily image cap from `CreditConfig.dailyImageLimit` (tier-based; `null` = unlimited)
- Provider: **Gemini** (not DALL·E)

Response includes `imageUrl`, `imageGenerationId`, `creditStatus`, and optionally `userMessage` / `assistantMessage`.

Reload later: `GET /image/generations/{imageGenerationId}`

---

## 9. Daily tasks, notifications, reviews, subscription

| Area | Endpoints |
|------|-----------|
| Daily tasks | `GET /daily-tasks/today`, `PATCH /daily-tasks/{id}/toggle/{taskId}`, `POST /daily-tasks/regenerate` |
| Notifications | `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all` |
| Reviews | `GET /reviews` (public approved), `POST /reviews` (auth) |
| Subscription | `GET /subscription/me` |
| Files | `POST /files/upload` multipart field `file` (png/jpeg/jpg/webp, ≤5MB) |
| Health | `GET /health` |

---

## 10. Screen → API checklist (copy for mobile ticket)

| Screen | Calls |
|--------|--------|
| Login | magic-link / Google / (dev) login |
| After login | `GET /profile`, `GET /credit-status`, `GET /sections` |
| Dashboard | `GET /daily-tasks/today`, `GET /notifications` |
| Section list | `GET /sections` → honor `isLocked` |
| Chat open | `GET /conversations/{key}` → resolve `image-generation:*` |
| Send chat | `POST .../message` → update credits + show action_steps / links |
| Generate logo | `POST /image/generate` (+ `sectionKey` if in chat) |
| Switch business | `POST /business-profiles/{id}/activate` then refetch profile + conversations |
| Promo | `POST /auth/apply-promo` |
| Settings logout | `POST /auth/logout` + clear storage |

---

## 11. Multi-tab / multi-device notes

- Tokens are bearer JWTs — **not** tied to one device.
- Logging in on device B with another account does not “push” logout to device A unless you implement that.
- Web app may sync logout across browser tabs via `localStorage`; native apps should treat SecureStore as the source of truth per install.

---

## 12. What you can skip (unless building Admin)

All `/admin/*` routes (sections, AI configs, prompts, credit configs incl. `dailyImageLimit`, stripe prices, promo CRUD, review moderation, broadcast, site pages, payments, token dashboard, admin users). Quota admin routes are retired.  
Use Admin JWT from `POST /admin/auth/login`, not the user access token.

---

## 13. Companion artifacts

| File | Use |
|------|-----|
| `PioneerX AI API v1.5.postman_collection.json` | Clickable requests + bodies |
| `PIONEERX_CHANGELOG_v1.4_to_v1.5_BACKEND.md` | Product/backend change rationale (not needed day-to-day for app UI) |
| Swagger | `{HOST}/docs` when `NODE_ENV` is not production |

---

## 13b. Site CMS pages (optional in-app WebView / links)

Public, no auth. Content is edited in **Admin → Site pages**.

```
GET /site-pages
GET /site-pages/:slug
```

Slugs: `about-us` | `contact-us` | `privacy-policy` | `terms-condition`

Response shape (inside `data`): `{ slug, title, body, updatedAt, ... }` — render `body` preserving newlines.

---

## 13c. Billing

Two providers, one `Subscription` record:

- **Mobile app** → RevenueCat in-app purchase (unchanged, `POST /webhooks/revenuecat` server-side)
- **Website** → Stripe Checkout

Stripe endpoints:

```
GET  /billing/plans                → public: [{ priceId, tier, interval, amount, compareAtAmount, currency, label }]
POST /billing/checkout-session     → auth: { priceId } or { tier, interval } → { url, sessionId }
POST /billing/portal-session       → auth: → { url }  (manage / cancel)
GET  /billing/checkout-session/:id → auth: confirm status on the success page
GET  /billing/payments             → auth: payment history
```

`amount` and optional `compareAtAmount` are in **minor units** (cents) — divide by 100 for display. Show `amount` as the sale price; when `compareAtAmount` is set, render it crossed-out as the “was” price. Stripe still charges the linked `priceId`. Send the user to the returned `url`; entitlement is granted by webhook, so re-fetch `GET /subscription/me` and `GET /credit-status` after returning. If Stripe is not configured on the server these return **503**.

Public promo list (website footer / promo page): `GET /promo-codes` (no auth).

---

## 14. Minimal client pseudocode

```ts
const api = async (path: string, opts: RequestInit = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    if (res.status === 401) await tryRefreshOrLogout();
    if (res.status === 402) showCreditsEmpty(json.message);
    throw json;
  }
  return json.data;
};

// Chat
await api(`/conversations/${sectionKey}/message`, {
  method: "POST",
  body: JSON.stringify({ content }),
});
```

---

**Bottom line for the app team:** Auth → profile/sections → conversation by `sectionKey` → always handle **402 credits** and **image-generation:{id}** refs. Everything else is supporting UI.
