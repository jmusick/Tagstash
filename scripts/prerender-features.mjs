import { readFile, writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { FEATURES_META } from '../src/utils/featuresMeta.js'
import { getFeaturesStructuredData, serializeStructuredData } from '../src/content/marketingSchema.js'

// Render the same presentation used by the public React route. No copied copy,
// runtime Function, or new deployment is needed for this static marketing page.
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, entries: [], include: [] },
})
try {
  const { FeaturesView } = await server.ssrLoadModule('/src/components/FeaturesPage.jsx')
  const markup = renderToStaticMarkup(createElement(FeaturesView))
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
  const styles = new Set()
  const visited = new Set()
  function collectStyles(key) {
    if (visited.has(key)) return
    visited.add(key)
    const entry = manifest[key]
    if (!entry) throw new Error(`Missing build manifest entry: ${key}`)
    for (const css of entry.css || []) styles.add(css)
    for (const dependency of entry.imports || []) collectStyles(dependency)
  }
  collectStyles('index.html')
  collectStyles('src/components/FeaturesPage.jsx')

  const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  const title = escape(FEATURES_META.title)
  const description = escape(FEATURES_META.description)
  const canonical = `https://tagsta.sh${FEATURES_META.path}`
  let html = await readFile('dist/index.html', 'utf8')
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*("\s*\/?>)/g, `$1${description}$2`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*("\s*\/?>)/g, `$1${title}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*("\s*\/?>)/, `$1${canonical}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*("\s*\/?>)/, `$1${canonical}$2`)
    .replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`)
    .replace('</head>', `${[...styles].filter(css => !html.includes(`href="/${css}"`)).map((css) => `<link rel="stylesheet" href="/${css}" />`).join('\n')}\n<script type="application/ld+json" data-page-schema="true">${serializeStructuredData(getFeaturesStructuredData('https://tagsta.sh'))}</script>\n</head>`)
  // Pages serves this at /features and redirects /features/ to the canonical
  // extensionless URL. A directory index would instead redirect to /features/.
  await writeFile('dist/features.html', html)
  console.log('Prerendered /features from FeaturesView')
} finally {
  await server.close()
}
