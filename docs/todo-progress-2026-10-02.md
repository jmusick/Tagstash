# TODO progress — October 2, 2026

Included in release v1.29.0. Migration `0013_email_token_hashes.sql` was applied successfully to local and production D1 on October 2, 2026 before the release push.

- Login uses a cost-10 dummy bcrypt comparison for missing users. Unverified-email guidance follows successful password verification; wrong passwords still count toward lockout.
- Verification and password-reset tokens are SHA-256 digests in new `token_hash` columns. The original `token` column carries a marked digest for schema compatibility. Incoming links are hashed before lookup; the digest itself cannot redeem a link. All five affected routes return 503 before the migration is installed, while login continues working.
- Keyboard outlines survive component styles. A first-tab skip link targets a focusable main landmark on every page. Reduced motion disables movement and animations while retaining opacity fades.
- Settings → Import / Export downloads the entire authenticated library as HTML, CSV, or JSON. JSON preserves dates, tags, favorite/private flags, titles, descriptions, and URLs. CSV escapes multiline/quoted text and neutralizes spreadsheet formulas. HTML escapes content and includes tag/description metadata, which the existing importer now reads. HTML/CSV imports preserve their existing behavior; privacy/favorite flags are preserved in JSON but are not restored by the existing importers.
- Unknown paths return a real HTTP 404 and a client-side Not Found page with noindex. The middleware page-path allowlist must be updated when new public routes are added.
- Homepage legal/support links are anchors. Homepage title, descriptions, manifest, and SSR copy use bookmark-manager wording. Robots excludes verification and reset routes. Static sitemap entries have content-change dates (homepage updated today; privacy/support dates come from their last substantive source commits).
- Small logos are about 16 KB as WebP, with PNG fallbacks and a larger WebP variant for the password/verification pages. Original artwork is retained. Logo markup reserves its aspect ratio. Separate favicon, Apple touch icon, and manifest icons replace the oversized shared favicon. A 1200 × 630 social image is about 29 KB and uses a large Twitter card.
- Homepage Organization JSON-LD describes the existing Stone Dragon Media LLC business and Tagstash brand. No unverified social accounts or ratings were added. `llms.txt` includes export and public API capabilities.

## Deployment note

Apply `0013_email_token_hashes.sql` alongside the Worker release. It adds indexed `token_hash` columns and removes **all existing reset/verification token rows**, including unused links. Accounts, passwords, bookmarks, and sessions are unaffected. Users with an outstanding link must request a new one. Apply the migration and deploy the matching code together: the old bundle still writes plaintext tokens, which the new bundle will reject. Deploying code first temporarily returns 503 for registration, verification/resend, and reset request/redemption until the migration is applied. The user authorized production migration and the minor release after reviewing this batch. Migration 0013 is now applied to both local and production D1.

## Validation

- `npm run build` and `npm run lint`.
- `npm test`: 14 auth regression checks using isolated SQLite with real migrations, plus four export checks. Covers pre-migration guards, clearing legacy tokens, digest-only email storage, raw-token redemption, rejection of stored digests and replay, cookie/bearer separation, CSRF, revocation, and export escaping.
- Chromium against a local Wrangler Pages preview with mock API data: known routes, real 404s, homepage metadata, skip-link focus, focus outlines in all three themes, reduced-motion behavior, export downloads and HTML import round trip, populated admin security-events panel, mobile export layout, public-profile canonical URLs and homepage links, and absence of uncaught rendering errors.
- Screenshots inspected locally in `.tmp/`; original brand artwork remains unchanged.

## Remaining work

Browser-store submissions, legal terms and business decisions, bulk operations, API-key authentication, scaling/search, and the larger feature/content roadmap remain open in `TODO.md`. Production deployment and smoke checks are part of the v1.29.0 release procedure. The admin panel was checked locally with mock data, not through a production admin account. The minor release uses an annotated v1.29.0 tag and a push to master.
