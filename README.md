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
- Browser extension support exists in the companion TagstashExtension project

## Features

- Tag-first bookmark organization
- Bookmark title, URL, description, and tag management
- Search, sorting, and tag query filtering
- Free tier with a 50-bookmark limit
- Pro tier with unlimited bookmarks
- Stripe Checkout for upgrades
- Stripe Billing Portal for subscription management
- Email verification via Resend
- Super admin controls for managing users, roles, and tiers
- Light and dark theme support
- Responsive UI for desktop and mobile
- Firefox/browser extension companion for saving the current tab quickly

## Hosted Version

The commercial hosted version of Tagstash is available at https://tagsta.sh/

That hosted service is the official paid offering run by the author. This repository is for people who want to study the codebase or run their own non-commercial instance under the included license terms.

## Tech Stack

### Frontend

- React 18
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

Read the full terms in [LICENSE](./LICENSE).

For commercial licensing inquiries, contact `jd@orboro.net`.
