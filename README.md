# Tagstash

Tagstash is a self-hosted, tag-first bookmarking app built with React, Cloudflare Pages Functions, and D1. It includes user accounts, email verification, Stripe-powered Pro subscriptions, import tooling, and a companion browser extension.

If you do not want to self-host it, you can use the official hosted version at https://tagsta.sh/

## Project Status

Tagstash is active and in real-world use.

Current status at a glance:

- User registration, login, and JWT-backed sessions are working
- Email verification and resend flows are live
- Free and Pro tiers are implemented
- Stripe Checkout and Stripe Billing Portal are integrated
- Admin controls exist for managing user roles and membership tiers
- Bookmark CRUD, tag cloud filtering, import flow, and search are in place
- Opt-in public profiles let users share a read-only, tag-filterable view of their bookmarks
- Browser extension support exists in the companion TagstashExtension project
- Manual and background refresh keep the bookmark list in sync with saves made via the browser extension
- A dedicated Tag Management page supports merging tags together

## Features

- Tag-first bookmark organization
- Bookmark title, URL, description, and tag management
- Search, sorting, and tag query filtering
- Free tier with a 50-bookmark limit
- Pro tier with unlimited bookmarks
- Stripe Checkout for upgrades
- Stripe Billing Portal for subscription management
- Email verification via Resend
- Opt-in public profiles (`/u/:username`) for sharing your bookmarks via a link, with per-bookmark privacy control and tag filtering
- Public JSON API (`/api/profiles/:username`, optionally tag-filtered) for embedding your bookmarks on other sites, with ready-to-copy URLs in Settings
- Super admin controls for managing users, roles, and tiers
- Light and dark theme support
- Responsive UI for desktop and mobile
- Firefox/browser extension companion for saving the current tab quickly
- Refresh button plus a quiet 5-minute background poll so bookmarks saved elsewhere (e.g. the browser extension) show up without a page reload
- Tag Management page (`/tags`) for merging two tags into one, with a confirmation step since it can't be undone

## Hosted Version

The commercial hosted version of Tagstash is available at https://tagsta.sh/

That hosted service is the official paid offering run by the author. This repository is for people who want to study the codebase or run their own non-commercial instance under the included license terms.

## Tech Stack

### Frontend

- React 18
- React Router
- Vite
- Axios
- Context API
- lucide-react

### Backend

- Cloudflare Pages Functions
- Cloudflare D1
- bcryptjs
- jose
- Resend
- Stripe REST API

## Local Development

### Prerequisites

- Node.js 18+
- npm
- Wrangler / Cloudflare account for deployment workflows

### Install

```bash
git clone https://github.com/jmusick/Tagstash.git
cd Tagstash
npm install
```

### Configure local secrets

Create `.dev.vars` for local Cloudflare Functions development.

Required or commonly used values:

- `JWT_SECRET`
- `SUPER_ADMIN_EMAIL`
- `RESEND_API_KEY` for email verification
- `API_KEY_ENCRYPTION_SECRET` optional, defaults to `JWT_SECRET` behavior in app usage
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MONTHLY_PRICE_ID`
- `STRIPE_ANNUAL_PRICE_ID`
- `APP_URL` for hosted redirect URLs

For the frontend, optionally create `.env` and set:

- `VITE_API_URL` if you do not want to use the default local proxy

### Database setup

```bash
npm run setup:db
```

### Run locally

Run frontend and API together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run dev
npm run dev:api
```

Default local URLs:

- Frontend: http://localhost:3000
- API: http://localhost:5000/api

## Deployment Notes

Tagstash is designed for Cloudflare Pages + D1.

Production setup includes:

- D1 migrations applied locally and remotely
- Cloudflare Pages secrets for Stripe and email
- Stripe webhook endpoint wired to `/api/billing/webhook`

### Stripe-related secrets

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MONTHLY_PRICE_ID`
- `STRIPE_ANNUAL_PRICE_ID`
- `APP_URL`

## Key API Routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `PUT /api/auth/profile-public`

### Admin

- `GET /api/auth/admin/users`
- `PATCH /api/auth/admin/users/:id`

### Billing

- `GET /api/billing/plans`
- `GET /api/billing/status`
- `POST /api/billing/checkout-session`
- `POST /api/billing/portal-session`
- `POST /api/billing/webhook`

### Bookmarks

- `GET /api/bookmarks`
- `GET /api/bookmarks/:id`
- `POST /api/bookmarks`
- `PUT /api/bookmarks/:id`
- `DELETE /api/bookmarks/:id`
- `POST /api/bookmarks/import`
- `GET /api/bookmarks/tags/all`
- `POST /api/bookmarks/tags/merge`
- `POST /api/bookmarks/tags/:id/favorite`
- `POST /api/bookmarks/:id/favorite`
- `POST /api/bookmarks/:id/private`

### Public Profiles

- `GET /api/profiles/:username` — unauthenticated; returns a user's public, non-private bookmarks and tags if they've opted in via `PUT /api/auth/profile-public`

This is a stable, documented public API meant for third-party consumption (not just internal page-support data) — Settings surfaces ready-to-copy URLs for it. Responses are JSON with CORS enabled for all origins, so it can be fetched directly from another site's frontend.

Optional repeatable `?tag=` query param filters to bookmarks that have *all* of the given tags (AND):

```
GET /api/profiles/alice
GET /api/profiles/alice?tag=poe2
GET /api/profiles/alice?tag=poe2&tag=guides
```

Example response:

```json
{
  "profile": { "username": "alice", "member_since": "2026-01-01T00:00:00.000Z" },
  "bookmarks": [
    {
      "id": 1,
      "title": "PoE2 Leveling Guide",
      "url": "https://example.com/guide",
      "description": "...",
      "favicon_url": "https://...",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-02T00:00:00.000Z",
      "tags": [{ "id": 1, "name": "poe2" }, { "id": 2, "name": "guides" }]
    }
  ],
  "tags": [{ "name": "poe2", "count": 3 }, { "name": "guides", "count": 1 }],
  "appliedTags": ["poe2", "guides"]
}
```

`tags` always lists the full public tag set for that user, regardless of any `?tag=` filter applied, so a consumer can discover what other tags are available.

## Project Structure

```text
tagstash/
├── d1/
│   └── migrations/
├── functions/
│   └── api/
├── public/
├── src/
│   ├── api/
│   ├── components/
│   ├── context/
│   ├── App.jsx
│   └── main.jsx
├── .dev.vars
├── package.json
├── vite.config.js
└── wrangler.toml
```

## Available Scripts

- `npm run dev` - Run the frontend dev server
- `npm run dev:api` - Run local Cloudflare Pages Functions and D1
- `npm run dev:all` - Run frontend and API together
- `npm run setup:db` - Apply local D1 migrations
- `npm run build` - Create a production build
- `npm run preview` - Preview the production build locally
- `npm run lint` - Run ESLint

## License

Tagstash is source-available under the custom **Tagstash Non-Commercial License (TNCL) v1.0**.

In plain English:

- You can run Tagstash yourself for free
- You can modify it for your own non-commercial use
- You cannot sell it
- You cannot charge for hosting it
- You cannot bundle it into a paid product or service
- You cannot make money from it in any way without explicit written permission

Read the full terms in [LICENSE.md](./LICENSE.md).

For commercial licensing inquiries, contact `jd@orboro.net`.
