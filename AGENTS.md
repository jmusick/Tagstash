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

## The `tags` table is global, not per-user

`tags` (`d1/migrations/0001_initial.sql`) has a single global `UNIQUE` `name` column and **no `user_id`** — it was never made per-user in any later migration. A tag row (e.g. id 15, `gaming`) can be shared by many different users' bookmarks simultaneously; per-user scoping only exists one level down, via `bookmark_tags` joined to `bookmarks.user_id`. This matters for any endpoint that mutates or deletes a `tags` row directly (rename, delete, merge — see the `POST /bookmarks/tags/merge` handler in `functions/api/[[path]].js` for the reference pattern):

- Never trust a client-supplied tag id as "belongs to this user" — verify with `SELECT COUNT(*) FROM bookmark_tags bt JOIN bookmarks b ON bt.bookmark_id = b.id WHERE bt.tag_id = ? AND b.user_id = ?` before acting on it (the existing `POST /bookmarks/tags/:id/favorite` handler skips this check — a known gap, not a pattern to copy).
- Only remove a user's *own* `bookmark_tags` rows for that tag, never `DELETE FROM tags WHERE id = ?` unconditionally — other users may still reference the same global tag row. Delete the `tags` row only when orphaned: `DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookmark_tags WHERE tag_id = ?)`.
- `favorite_tags` is already per-user (`user_id, tag_id` PK), so clean up the requesting user's own row there regardless of whether the global `tags` row gets deleted.

## Frontend: real client-side routing (react-router-dom)

`src/main.jsx` wraps the app in `<BrowserRouter>`, and `src/App.jsx` (the always-mounted root component) renders a `<Suspense><Routes>...</Routes></Suspense>` tree using `useNavigate`/`useParams`/`useSearchParams` — there is no more manual `activePage` string or `window.location.pathname` parsing. Adding a new top-level page/route means adding a `<Route path="..." element={...} />` in `App.jsx` (placed so it's reachable **before** the `/`/`/settings` routes' `user ? ... : homeElement` auth gate if the page must work for anonymous visitors) and importing the page component — most page components are `React.lazy()`-loaded for code-splitting, so follow that pattern for new ones too unless the page is needed on first paint (like `Home`). The `/settings` route (`Settings.jsx`, dumb content component with `pageMode` prop, App.jsx supplies the header/footer/nav chrome) and `/tags` route (`TagsPage.jsx`, same shape) are both built this way — copy that route block (including the `.settings-page-main`/`.settings-page-content` classes that give the page full width instead of the two-column bookmark-browser layout) for the next authenticated full-page view rather than inventing a new page shell.

Because `App.jsx`'s module-level `import './App.css'` always runs (it's the root component), `App.css`'s classes are available globally to every page/component without re-importing — components like `PublicProfile.jsx` intentionally reuse `.app-main`, `.bookmark-card`, `.toolbar`, etc. rather than duplicating styles.

## Shared bookmark-browsing UI and app shell

`src/components/BookmarkBrowser.jsx` owns sort/search/tag-filter/pagination state and renders the toolbar + grid + pagination + sidebar `TagCloud`. Both the owner's main view (`App.jsx`) and the public profile (`PublicProfile.jsx`) render it — **don't fork this logic again** for a future read-only or filtered view; add a prop instead (see its prop list for the existing extension points: `renderCard`, `toolbarExtra`, `showFavoritesFilter`, `tags`, `emptyStateMessage`, `initialSelectedTags`/`onSelectedTagsChange`). `TagCloud.jsx` similarly accepts an optional `tags` prop so it can be fed pre-fetched data instead of always self-fetching via the authenticated `/api/bookmarks/tags/all`, and an optional `showActions` prop (default `true`) that hides the add-to-query/favorite icon row for contexts where the tag chips are just a plain pick-list — `TagsPage.jsx`'s merge-tag picker is the reference usage (`showActions={false}`, `onTagSelect` repurposed to mean "select this tag as source/target" instead of "filter by this tag").

`src/App.jsx`'s bookmark list also has a manual refresh button plus a silent 5-minute `setInterval` poll (mirrors the browser extension sidebar's own refresh interval) — there is no push/webhook/websocket between a bookmark save (e.g. from the extension) and an already-open web app tab, so both the button and the poll are plain re-fetches of `GET /bookmarks` + `GET /bookmarks/tags/all`. Keep that in mind before assuming the UI reflects extension-side changes immediately.

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
- No automated test suite exists. Verification is manual: `npm run build` to catch compile errors, then drive the actual app. This environment has a working local Playwright setup (Chromium already cached under `%LOCALAPPDATA%\ms-playwright\chromium-<rev>\chrome-win64\chrome.exe` — note `chrome-win64`, not `chrome-win`) usable via `playwright-core` installed ad hoc in the scratchpad — useful for screenshotting/regression-checking both the owner and public-profile views after UI changes. To test authenticated flows without clicking through login, `localStorage.setItem('token', <jwt>)` (obtained from `POST /api/auth/login`) then reload, rather than driving the login form.
- Windows Git Bash and Node resolve `/tmp` differently (`/tmp/x` from bash isn't `C:\tmp\x` from Node) — write files Node needs to read into the scratchpad directory instead of `/tmp`.
