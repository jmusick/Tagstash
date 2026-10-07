// Dynamic XML sitemap: static marketing pages + all public profile URLs.
const STATIC_PATHS = [
  // Content-change dates; update these when editing a page's substantive content.
  { path: '/', lastmod: '2026-10-07' },
  { path: '/features', lastmod: '2026-10-07' },
  { path: '/privacy', lastmod: '2026-09-23' },
  { path: '/support', lastmod: '2026-08-17' },
];

const usersTableHasColumn = async (db, columnName) => {
  const result = await db.prepare('PRAGMA table_info(users)').all();
  return result.results.some((col) => col.name === columnName);
};

const xmlEscape = (value) =>
  String(value).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]));

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const db = env.DB;

  const urlEntries = STATIC_PATHS.map(
    ({ path, lastmod }) =>
      `<url><loc>${xmlEscape(origin + path)}</loc><lastmod>${lastmod}</lastmod></url>`
  );

  if (db && (await usersTableHasColumn(db, 'profile_public'))) {
    const { results } = await db
      .prepare('SELECT username, updated_at FROM users WHERE profile_public = 1')
      .all();

    for (const { username, updated_at: updatedAt } of results) {
      const lastmod = updatedAt ? `<lastmod>${new Date(updatedAt).toISOString().slice(0, 10)}</lastmod>` : '';
      urlEntries.push(
        `<url><loc>${xmlEscape(`${origin}/u/${username}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.6</priority></url>`
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
