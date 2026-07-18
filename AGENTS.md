# AGENTS.md

Conventions and gotchas for working in this repo, gathered from hands-on sessions. Read this before making non-trivial changes — several of these aren't obvious from the code alone.

## What this is

Tagstash is a **live SaaS with real users and real Stripe billing** (hosted at tagsta.sh). Treat prod data, migrations, and billing code with care — this isn't a toy project. See `README.md` for the feature/tech overview.

## Backend: single-file dispatcher

All API logic lives in one file: `functions/api/[[path]].js`. There's no router library — `onRequest` splits the URL into `segments` and dispatches by `segments[1]` to a `handleX` function (`handleAuth`, `handleBookmarks`, `handleProfiles`, `handleBilling`, `handleSupport`), each of which is an if-chain branching on `request.method` + further segments. A new route means either a new branch inside an existing `handleX`, or a new top-level `handleX` wired into `onRequest`'s dispatch.

Auth pattern: every protected branch starts with
```js
const auth = await requireAuth(request, env);
if (auth.error) return auth.error;
```
Routes that must be reachable by anonymous visitors (like the public profile endpoint) need their own handler that never calls `requireAuth` — don't add them as a branch inside `handleBookmarks`/`handleAuth`, since those call `requireAuth` unconditionally at the top of the function.

`GET /api/profiles/:username` (in `handleProfiles`) is a **stable, documented public API** meant for third-party consumption — Settings surfaces ready-to-copy URLs (including per-tag `?tag=` filters) for users to embed on other sites, and it's documented in `README.md`. Treat changes to its response shape as a compatibility concern, not a free internal refactor — it's not just page-support data for `/u/:username` anymore.

## D1 migrations: guard new columns, don't assume they exist

Cloudflare Pages deploys the Worker bundle **independently** of `wrangler d1 migrations apply` — there's no auto-migrate-on-deploy hook. Code can reach prod before a new migration has been applied there (or the reverse, in cases where it doesn't matter). For any code path that references a newly-added column by name (filtering, inserting, toggling — not `SELECT *`), guard it with the existing helpers:

```js
const hasFoo = await bookmarksTableHasColumn(db, 'foo'); // or usersTableHasColumn
```

and fail closed (404/503) rather than letting an unguarded reference 500 every request that touches that table. `is_favorite`, `is_private`, and `profile_public` all follow this pattern — copy it for new boolean/nullable columns on `users` or `bookmarks`. (`0007_password_reset.sql`'s `password_reset_tokens` table is the one deliberate exception — a narrow blast radius, only two rarely-hit routes touch it.)

Per-bookmark boolean toggles (favorite, private) share one backend helper, `toggleBookmarkFlag(db, userId, bookmarkId, columnName, messages)`, and one frontend helper, `handleBookmarkToggle(apiCall, id, fallbackErrorMessage)` in `App.jsx` — extend those for the next toggle instead of copy-pasting a new route/handler pair. `getTagsByBookmarkId(db, userId, { publicOnly, hasIsPrivateColumn })` is the same idea for the tag-join query: one parameterized function, not a near-duplicate per caller.

Migrations are sequential numbered files in `d1/migrations/`, applied via `npm run setup:db` locally.

## Frontend: real client-side routing (react-router-dom)

`src/main.jsx` wraps the app in `<BrowserRouter>`, and `src/App.jsx` (the always-mounted root component) renders a `<Suspense><Routes>...</Routes></Suspense>` tree using `useNavigate`/`useParams`/`useSearchParams` — there is no more manual `activePage` string or `window.location.pathname` parsing. Adding a new top-level page/route means adding a `<Route path="..." element={...} />` in `App.jsx` (placed so it's reachable **before** the `/`/`/settings` routes' `user ? ... : homeElement` auth gate if the page must work for anonymous visitors) and importing the page component — most page components are `React.lazy()`-loaded for code-splitting, so follow that pattern for new ones too unless the page is needed on first paint (like `Home`).

Because `App.jsx`'s module-level `import './App.css'` always runs (it's the root component), `App.css`'s classes are available globally to every page/component without re-importing — components like `PublicProfile.jsx` intentionally reuse `.app-main`, `.bookmark-card`, `.toolbar`, etc. rather than duplicating styles.

## Shared bookmark-browsing UI and app shell

`src/components/BookmarkBrowser.jsx` owns sort/search/tag-filter/pagination state and renders the toolbar + grid + pagination + sidebar `TagCloud`. Both the owner's main view (`App.jsx`) and the public profile (`PublicProfile.jsx`) render it — **don't fork this logic again** for a future read-only or filtered view; add a prop instead (see its prop list for the existing extension points: `renderCard`, `toolbarExtra`, `showFavoritesFilter`, `tags`, `emptyStateMessage`, `initialSelectedTags`/`onSelectedTagsChange`). `TagCloud.jsx` similarly accepts an optional `tags` prop so it can be fed pre-fetched data instead of always self-fetching via the authenticated `/api/bookmarks/tags/all`.

Likewise, `src/components/AppHeader.jsx`/`AppFooter.jsx` are the shared page-chrome components (logo, tagline, theme toggle, footer copyright) used by every full-page view (`App.jsx`'s `/` and `/settings` routes, plus `PublicProfile.jsx`). `AppHeader` takes an optional `onLogoClick` — pass it for the authenticated button-based "back to bookmarks" behavior, omit it to get a plain `<a href="/">` logo link for anonymous/public pages. Page-specific actions (welcome text, nav buttons, logout, footer links) go through each component's `children`, not by forking the header/footer markup again.

The whole tree is wrapped in an `ErrorBoundary` (`src/components/ErrorBoundary.jsx`, mounted in `src/main.jsx`) — an uncaught render error shows a generic fallback instead of a white screen. It's a class component (required for `componentDidCatch`) and its fallback uses a plain `<a href="/">`, not `<Link>`, since it must render correctly even if the error happened above/outside router context.

## Local dev workflow

```bash
npm run setup:db   # apply D1 migrations to local wrangler state
npm run dev:all     # Vite (localhost:3000) + wrangler pages dev (127.0.0.1:5000), proxied via /api
```

Gotchas:
- **Email verification can't be exercised locally** — there's no real Resend send, so `POST /api/auth/register` will fail at the send step and roll back the user. To get a usable authenticated test account, insert a pre-verified user directly into local D1 instead:
  ```bash
  node -e "require('bcryptjs').hash('testpass123', 10).then(console.log)"
  npx wrangler d1 execute tagstash-db --local --command "INSERT INTO users (username, email, password_hash, membership_tier, role, email_verified) VALUES ('testuser', 'test@example.com', '<hash>', 'free', 'user', 1)"
  ```
  then log in via `POST /api/auth/login` to get a JWT.
- No automated test suite exists. Verification is manual: `npm run build` to catch compile errors, then drive the actual app. This environment has a working local Playwright setup (Chromium already cached under `%LOCALAPPDATA%\ms-playwright`) usable via `playwright-core` installed ad hoc in the scratchpad — useful for screenshotting/regression-checking both the owner and public-profile views after UI changes.
- Windows Git Bash and Node resolve `/tmp` differently (`/tmp/x` from bash isn't `C:\tmp\x` from Node) — write files Node needs to read into the scratchpad directory instead of `/tmp`.
