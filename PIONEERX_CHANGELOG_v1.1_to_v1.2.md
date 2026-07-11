# PioneerX — Change Log: v1.1 → v1.2

> This document is for the coding agent. The existing codebase was built from v1.1. The items below describe **only what is new or changed**. Do not remove or modify any existing auth code — only add new endpoints and models alongside what already exists.

---

## Context

The existing auth module (email/password register, login) stays exactly as is. This changelog adds two new login options on top: Magic Link and Google OAuth. Nothing is removed, nothing is broken.

---

## 1. Schema Changes

**File:** `prisma/schema.prisma`

Add the following new model only. Do not touch the existing `User` model or any other model:

```prisma
model MagicLinkToken {
  id        String   @id @default(uuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([email])
}
```

**Action:** Add the model. Run `prisma migrate dev`.

---

## 2. New Auth Flow — Magic Link

### How it works:
1. User enters email on the login screen.
2. Backend checks if a `User` with that email exists.
   - If **yes** → send magic link.
   - If **no** → create the `User` record first (with `trialEndsAt = now() + 3 days`), then send magic link.
3. Generate a secure random token, save in `MagicLinkToken` with `expiresAt = now() + 15 minutes`.
4. Send email with link: `https://yourapp.com/auth/verify?token=<token>`
5. User clicks link → backend verifies → issues JWT → logged in.

### 2a. New Endpoint — Request Magic Link

```
POST /auth/magic-link
Body: { email: string }
Response: { message: "Check your email" }  ← always return this regardless of whether user existed
```

Logic:
- Validate email format.
- Find or create `User` by email (if creating, set `trialEndsAt = now() + 3 days`).
- Generate token: `crypto.randomBytes(32).toString('hex')`.
- Save `MagicLinkToken` row.
- Send email with verification link.
- Always return same success message.

### 2b. New Endpoint — Verify Magic Link

```
GET /auth/verify?token=<token>
Response: { accessToken, refreshToken }
```

Logic:
- Find `MagicLinkToken` by token.
- If not found → 400 ("Invalid link").
- If `used = true` → 400 ("Link already used").
- If `expiresAt < now()` → 400 ("Link expired").
- Mark `used = true`.
- Issue JWT access token + refresh token for the linked user.

---

## 3. New Auth Flow — Google OAuth

### How it works:
1. User taps "Continue with Google".
2. Google OAuth consent screen opens.
3. Google returns `code` to backend callback URL.
4. Backend exchanges `code` for Google profile (email, name).
5. Find or create `User` by email (if creating, set `trialEndsAt = now() + 3 days`).
6. Issue JWT → user is logged in.

### 3a. New Endpoints — Google OAuth

```
GET /auth/google               ← redirects user to Google consent screen
GET /auth/google/callback      ← Google redirects here after consent
Response: { accessToken, refreshToken }
```

Use `passport-google-oauth20` with NestJS Passport (`@nestjs/passport`).

Required env variables:
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://yourapp.com/auth/google/callback
```

---

## 4. Email Sending

Use any transactional email provider (Nodemailer/SMTP, Resend, SendGrid). Wrap send call in try/catch — if email fails, log the error but do not crash the request.

Magic link email template:
```
Subject: Your PioneerX login link

Click the link below to log in. This link expires in 15 minutes and can only be used once.

[link]

If you didn't request this, ignore this email.
```

---

## 5. AdminUser — Not Affected

Do not touch admin auth. This changelog only affects end-user auth.

---

## Summary of Files to Create/Modify

| Action | File/Location |
|---|---|
| **No change** | All existing auth endpoints — leave untouched |
| Modify | `prisma/schema.prisma` — add `MagicLinkToken` model only |
| Migrate | Run `prisma migrate dev` |
| Create | `POST /auth/magic-link` endpoint |
| Create | `GET /auth/verify` endpoint |
| Create | `GET /auth/google` + `GET /auth/google/callback` endpoints |
| Create | Email sending service (magic link email) |
| Add | `.env` variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| No change | `AdminUser` auth — leave untouched |
