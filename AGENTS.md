# AGENTS.md

Conventions and gotchas for working in this repo, gathered from hands-on sessions. Read this before making non-trivial changes — several of these aren't obvious from the code alone.

## What this is

Tagstash is a **live SaaS with real users and real Stripe billing** (hosted at tagsta.sh). Treat prod data, migrations, and billing code with care — this isn't a toy project. See `README.md` for the feature/tech overview.

## Backend: single-file dispatcher

All API logic lives in one file: `functions/api/[[path]].js`. There's no router library — `onRequest` splits the URL into `segments` and dispatches by `segments[1]` to a `handleX` function (`handleAuth`, `handleBookmarks`, `handleProfiles`, `handleBilling`, `handleSupport`), each an if-chain branching on `request.method` + further segments. A new route means either a new branch inside an existing `handleX`, or a new top-level `handleX` wired into `onRequest`'s dispatch.

Auth pattern: every protected branch starts with

```js
const auth = await requireAuth(request, env);
if (auth.error) return auth.error;
```

Routes that must be reachable by anonymous visitors (like the public profile endpoint) need their own handler that never calls `requireAuth` — don't add them as a branch inside `handleBookmarks`/`handleAuth`, since those call `requireAuth` unconditionally at the top.

`GET /api/profiles/:username` (in `handleProfiles`) is a **stable, documented public API** meant for third-party consumption — Settings surfaces ready-to-copy URLs (including per-tag `?tag=` filters) for users to embed on other sites, and it's documented in `README.md`. Treat changes to its response shape as a compatibility concern, not a free internal refactor.

## Scraped page metadata: decode entities, don't trust the regex

`fetchSiteMetadata` / `extractPageTitle` / `extractMetaDescription` scrape titles and descriptions out of raw HTML with regexes (Workers has no `DOMParser`). Two things bite here:

- **HTML attribute values arrive entity-encoded.** A page serving `theorycraft &amp; simulations ... don&#x27;t` would otherwise persist those escapes into D1 verbatim and show them raw in the edit form. Everything scraped goes through `cleanScrapedText` (decode → collapse whitespace → trim), which uses the local `decodeHtmlEntities` helper + `HTML_NAMED_ENTITIES` table. Add new named entities there rather than decoding ad hoc at a call site, and keep it a **single** decode pass — decoding repeatedly is how `&amp;lt;` turns into a real `<`.
- **The meta-tag patterns capture the opening quote and back-reference it** (`content=(["'])([\s\S]*?)\1`, value in group **2**, not 1). The earlier `[^"']+` form truncated at the first apostrophe, so `Tom's diner & bar` stored as `Tom`. Preserve the back-reference if you add more patterns.

The browser extension's popup reads meta tags from the live page DOM (already decoded) and only falls back to this endpoint, so it inherits fixes here for free. The frontend also has its own `src/utils/decodeHtmlEntities.js` (textarea-based) applied at *display* time and when opening the edit form — that's legacy-data cover for rows saved before the backend decoded, not the primary fix. Such rows self-heal when edited and saved.

## Email sending: Cloudflare Email Sending (not Resend)

All transactional email goes through the **Cloudflare Email Sending REST API** (no SDK, plain `fetch`) via the `sendEmail` helper in `functions/api/[[path]].js`, used by `sendVerificationEmail`, `sendPasswordResetEmail`, and the support-form handler. Config is `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `EMAIL_REPLY_TO` / `SUPPORT_EMAIL` (see `.dev.vars.example`). `sendEmail` throws if the token/account ID are unset, and callers turn that into a `503`.

Each email purpose has its own "from" address via `emailFrom(purposeVar, fallback, env)`:

- `EMAIL_FROM_VERIFICATION` (default `welcome@tagsta.sh`)
- `EMAIL_FROM_PASSWORD_RESET` (default `support@tagsta.sh`)
- `EMAIL_FROM_CONTACT` (default `contact@tagsta.sh`) — the support form's outgoing *sender*, not to be confused with `SUPPORT_EMAIL`, the inbox it delivers *to*.

Each falls back to the generic `EMAIL_FROM` before its hardcoded default, so self-hosters on another domain can override with one var instead of three.

Integration notes ([REST API docs](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)):

- `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send`, `Authorization: Bearer <token>`, token scoped to `Email Sending: Edit`.
- Reply-to is the **snake_case top-level field `reply_to`** — confirmed by live testing. `replyTo` 400s with `invalid_request_schema`, and a `headers: { 'Reply-To': ... }` object 400s with `email.invalid`; neither is documented clearly, so don't reintroduce them. The support form's "reply goes to the requester" behavior depends on this.
- 5 MiB total message size limit (incl. attachments); rate-limited (error code 10004).
- Beta product — the `from` sending domain must be connected/verified in the Cloudflare dashboard first.
- Migrated from Resend on 2026-08-02; the `resend` npm package is gone from `package.json`.

## D1 migrations: guard new columns, don't assume they exist

Cloudflare Pages deploys the Worker bundle **independently** of `wrangler d1 migrations apply` — there's no auto-migrate-on-deploy hook, so code can reach prod before its migration has been applied there. For any path that references a newly-added column *by name* (filtering, inserting, toggling — not `SELECT *`), guard it:

```js
const hasFoo = await bookmarksTableHasColumn(db, 'foo'); // or usersTableHasColumn
```

and fail closed (404/503) rather than letting an unguarded reference 500 every request that touches that table. `is_favorite`, `is_private`, `profile_public`, and `theme` all follow this pattern — copy it for new boolean/nullable columns on `users` or `bookmarks`. (`0007_password_reset.sql`'s `password_reset_tokens` table is the one deliberate exception — narrow blast radius, only two rarely-hit routes.)

Per-bookmark boolean toggles (favorite, private) share one backend helper, `toggleBookmarkFlag(db, userId, bookmarkId, columnName, messages)`, and one frontend helper, `handleBookmarkToggle(apiCall, id, fallbackErrorMessage)` in `App.jsx` — extend those for the next toggle instead of copy-pasting a route/handler pair. `getTagsByBookmarkId(db, userId, { publicOnly, hasIsPrivateColumn })` is the same idea for the tag-join query.

Migrations are sequential numbered files in `d1/migrations/`, applied via `npm run setup:db` locally.

## The `tags` table is global, not per-user

`tags` (`d1/migrations/0001_initial.sql`) has a single global `UNIQUE` `name` column and **no `user_id`** — it was never made per-user in any later migration. One tag row (e.g. id 15, `gaming`) can be shared by many users' bookmarks simultaneously; per-user scoping exists only one level down, via `bookmark_tags` joined to `bookmarks.user_id`. This matters for any endpoint that mutates or deletes a `tags` row directly (rename, delete, merge — see `POST /bookmarks/tags/merge` for the reference pattern):

- Never trust a client-supplied tag id as "belongs to this user" — verify with `SELECT COUNT(*) FROM bookmark_tags bt JOIN bookmarks b ON bt.bookmark_id = b.id WHERE bt.tag_id = ? AND b.user_id = ?` before acting on it. (`POST /bookmarks/tags/:id/favorite` skips this check — a known gap, not a pattern to copy.)
- Only remove the user's *own* `bookmark_tags` rows, never `DELETE FROM tags WHERE id = ?` unconditionally. Delete the `tags` row only when orphaned: `DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookmark_tags WHERE tag_id = ?)`.
- `favorite_tags` is already per-user (`user_id, tag_id` PK), so clean up the requesting user's row there regardless of whether the global `tags` row gets deleted.

## Frontend: real client-side routing (react-router-dom)

`src/main.jsx` wraps the app in `<BrowserRouter>`, and `src/App.jsx` (the always-mounted root) renders a `<Suspense><Routes>…</Routes></Suspense>` tree using `useNavigate`/`useParams`/`useSearchParams` — there's no manual `activePage` string or `window.location.pathname` parsing.

A new top-level page means a `<Route path="..." element={...} />` in `App.jsx` plus the imported component. Two things to get right:

- Place it **before** the `/` and `/settings` routes' `user ? … : homeElement` auth gate if it must work for anonymous visitors.
- `React.lazy()`-load it for code-splitting, unless it's needed on first paint (like `Home`).

`/settings` (`Settings.jsx`) and `/tags` (`TagsPage.jsx`) are both dumb content components taking a `pageMode` prop, with `App.jsx` supplying header/footer/nav chrome. Copy that route block — including the `.settings-page-main`/`.settings-page-content` classes that give full width instead of the two-column bookmark-browser layout — for the next authenticated full-page view rather than inventing a new page shell.

Because `App.jsx`'s module-level `import './App.css'` always runs, `App.css`'s classes are globally available without re-importing — `PublicProfile.jsx` and friends intentionally reuse `.app-main`, `.bookmark-card`, `.toolbar`, etc. rather than duplicating styles.

The whole tree is wrapped in an `ErrorBoundary` (`src/components/ErrorBoundary.jsx`, mounted in `src/main.jsx`) so an uncaught render error shows a fallback instead of a white screen. It's a class component (required for `componentDidCatch`) and its fallback uses a plain `<a href="/">`, not `<Link>` — it must render even if the error happened above/outside router context.

## Shared bookmark-browsing UI and app shell

`src/components/BookmarkBrowser.jsx` owns sort/search/tag-filter/pagination state and renders the toolbar + grid + pagination + sidebar `TagCloud`. Both the owner's main view (`App.jsx`) and the public profile (`PublicProfile.jsx`) render it — **don't fork this logic again** for a future read-only or filtered view; add a prop instead. Existing extension points: `renderCard`, `toolbarExtra`, `showFavoritesFilter`, `tags`, `emptyStateMessage`, `initialSelectedTags`/`onSelectedTagsChange`, `focusBookmarkId`.

`focusBookmarkId` short-circuits the search/tag/favorites filters to show only that bookmark (clearing the underlying filter controls as a side effect) and scrolls it into view once rendered — it's how the "Random" toolbar button isolates a single bookmark in edit mode regardless of the active filter. Clear it back to `null` (on cancel/save/refresh) to return to the full list.

`TagCloud.jsx` accepts an optional `tags` prop so it can be fed pre-fetched data instead of self-fetching via the authenticated `/api/bookmarks/tags/all`, and an optional `showActions` prop (default `true`) that hides the add-to-query/favorite icon row where the chips are just a pick-list — `TagsPage.jsx`'s merge picker is the reference usage (`showActions={false}`, `onTagSelect` repurposed to mean "select as source/target" instead of "filter by this tag").

`App.jsx`'s bookmark list has a manual refresh button plus a silent 5-minute `setInterval` poll (mirroring the extension sidebar's interval). There is **no** push/webhook/websocket between a bookmark save (e.g. from the extension) and an already-open web app tab — both are plain re-fetches of `GET /bookmarks` + `GET /bookmarks/tags/all`. Don't assume the UI reflects extension-side changes immediately.

`normalizeBookmarkUrl` is duplicated three times — `src/App.jsx`, `functions/api/[[path]].js`, and `TagstashExtension/popup.js` — rather than shared, since the extension is a separate deployable with its own bundling. It prefixes a missing `https://` and strips a trailing slash on a bare root path (`https://example.com/` → `https://example.com`, but `https://example.com/docs/` is left alone). The "Base URL" button (`handleBaseUrl`/`handleEditBaseUrl` in `App.jsx`, `handleBaseUrl` in the extension's `popup.js`) relies on the same root-stripping via `new URL(...).origin`. **Change one copy, change all three**, or site and extension will silently disagree on what gets stored for the same pasted URL.

`src/components/AppHeader.jsx`/`AppFooter.jsx` are the shared page chrome (logo, tagline, theme selector, footer copyright) used by every full-page view. `AppHeader` takes an optional `onLogoClick` — pass it for the authenticated button-based "back to bookmarks" behavior, omit it for a plain `<a href="/">` logo link on anonymous/public pages. Page-specific actions (welcome text, nav buttons, logout, footer links) go through each component's `children`, not by forking the markup.

## Theme system: three CSS-variable themes, account-synced

Three themes — `slate` (neutral grey, default), `midnight` (the original purple-heavy dark theme), and `light` — are three blocks of CSS custom properties in `src/index.css`: bare `:root` (slate), `:root[data-theme='midnight']`, `:root[data-theme='light']`. Every themed color goes through a `--color-*`/`--shadow-*`/`--theme-gradient` variable; there should be no hardcoded theme-sensitive colors in component CSS. `slate` intentionally keeps the purple accent variables matching `midnight` so buttons/links/tags stay on-brand — only neutral surface/background/border/text variables and `--theme-gradient` differ between the two dark themes.

`THEME_ORDER`/`THEME_LABELS`/`THEME_ICONS`/`isValidTheme` live in `src/utils/theme.js`, the single source of truth — import from there rather than hardcoding theme name lists. `src/components/ThemeSelector.jsx` renders the header control: collapsed it shows the active theme's icon, and hovering/focusing expands it (via a JS `expanded` state, not pure CSS `:hover`, so keyboard focus and touch tap work too) into all three options in **fixed** `THEME_ORDER` position — non-active buttons collapse to `max-width: 0` rather than being reordered, so selecting a theme never makes buttons swap places.

⚠️ If you touch `.theme-selector-btn` in `index.css`, watch for specificity traps: a `:first-child`-style override can silently beat a `--hidden`/`--collapsed` modifier of equal-or-lower specificity, leaving phantom padding on whichever button sits first in DOM order. Prefer uniform per-button padding plus a single collapse mechanism over position-based selectors.

`App.jsx` owns the state: `theme` (`useState`, initialized from `localStorage['tagstash-theme']` or `prefers-color-scheme`), applied via `document.documentElement.dataset.theme` in a `useEffect`. `selectTheme(nextTheme)` sets it directly (no cycling) and, when logged in, fires `authAPI.updateTheme(nextTheme)` (`PUT /api/auth/theme`, guarded by `usersTableHasColumn(db, 'theme')` per the migration pattern above) to persist to `users.theme`. A separate effect applies `user.theme` over the local value whenever `user` loads/changes — so a logged-in account's saved theme wins over `localStorage` on that browser, while logged-out visitors still get `localStorage`/system-preference behavior.

## Local dev workflow

```bash
npm run setup:db   # apply D1 migrations to local wrangler state
npm run dev:all    # Vite (localhost:3000) + wrangler pages dev (127.0.0.1:5000), proxied via /api
```

Gotchas:

- **Email verification can't be exercised locally** unless `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are set in `.dev.vars` — `POST /api/auth/register` fails at the send step and rolls back the user without them. For a usable authenticated test account, insert a pre-verified user directly into local D1:
  ```bash
  node -e "require('bcryptjs').hash('testpass123', 10).then(console.log)"
  npx wrangler d1 execute tagstash-db --local --command "INSERT INTO users (username, email, password_hash, membership_tier, role, email_verified) VALUES ('testuser', 'test@example.com', '<hash>', 'free', 'user', 1)"
  ```
  then log in via `POST /api/auth/login` to get a JWT.
- **No automated test suite exists.** Verification is manual: `npm run build` to catch compile errors, then drive the actual app. Pure helpers in `functions/api/[[path]].js` (extractors, normalizers) can be exercised without a Worker by slicing the function out of the file into a temp `.mjs` and importing it — cheap way to check parsing changes against real fetched HTML.
- This environment has a working local Playwright setup (Chromium cached under `%LOCALAPPDATA%\ms-playwright\chromium-<rev>\chrome-win64\chrome.exe` — note `chrome-win64`, not `chrome-win`), usable via `playwright-core` installed ad hoc in the scratchpad. Useful for screenshotting/regression-checking both owner and public-profile views. For authenticated flows, `localStorage.setItem('token', <jwt>)` then reload, rather than driving the login form.
- Windows Git Bash and Node resolve `/tmp` differently (`/tmp/x` from bash isn't `C:\tmp\x` from Node) — write files Node needs to read into the scratchpad directory instead of `/tmp`.
