// Injects structured data and a static content snapshot into the SPA shell for
// GET /, so crawlers that don't execute JavaScript (most AI/LLM crawlers, unlike
// Googlebot which renders JS on a second pass) see real marketing copy instead of
// an empty <div id="root">. Real visitors get the same HTML; React's createRoot
// render() replaces it on mount (see src/main.jsx), so this is a flash-then-hydrate
// snapshot of the *same* copy that ships in src/components/Home.jsx, not bot-only
// content. Keep the two in sync if either changes.

const FAQS = [
  {
    question: 'What is Tagstash?',
    answer: 'Tagstash is a tag-based bookmark manager. Instead of filing links into a single folder tree, you attach one or more tags to each bookmark and find it again by searching, sorting, or filtering by tag.',
  },
  {
    question: 'How is Tagstash different from folders or browser bookmarks?',
    answer: 'Folder-based bookmarking forces every link into one location, which breaks down once you have hundreds of saved pages. Tagstash lets a single bookmark carry multiple tags, so the same link can show up under every topic it relates to, and you can combine tags to narrow results instead of hunting through nested folders.',
  },
  {
    question: 'How much does Tagstash cost?',
    answer: 'Tagstash is free for up to 50 bookmarks with no time limit. The Pro plan removes that limit for unlimited bookmarks at $3/month, or $36/year billed annually (same $3/month rate, paid once a year).',
  },
  {
    question: 'Does Tagstash have a browser extension?',
    answer: 'Yes. Tagstash has extensions for Chrome and Firefox that save the current tab into your library without leaving the page you are on.',
  },
  {
    question: 'Can I share my bookmarks publicly?',
    answer: 'Yes, opt-in. Enabling a public profile gives you a read-only, tag-filterable page of your bookmarks that others can browse. Individual bookmarks can be marked private to keep them out of that public view even when the profile itself is public.',
  },
  {
    question: 'Is my data private by default?',
    answer: 'Yes. Bookmarks are private by default. Sharing anything publicly, whether an individual bookmark or your whole profile, requires an explicit opt-in from account settings.',
  },
];

const FEATURES = [
  { title: 'Tags instead of folders', description: 'One link can carry as many tags as it needs. Combine tags to narrow a search instead of digging through nested folders.' },
  { title: 'Find anything fast', description: 'Search titles, links, notes and tags at once, then sort by date saved, title or URL.' },
  { title: 'Save from your browser', description: 'The Chrome and Firefox extensions save the tab you are on without leaving the page.' },
  { title: 'Private by default', description: 'Nothing is shared until you choose to share it. Any bookmark can be marked private.' },
  { title: 'A public page, if you want one', description: 'Turn on a public profile to share a read-only, tag-filterable page of your bookmarks.' },
  { title: 'Bring your bookmarks', description: 'Import an HTML export from any major browser, or a Raindrop.io CSV.' },
];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

export async function onRequestGet({ request, next }) {
  const response = await next();

  const contentType = response.headers.get('Content-Type') || '';
  if (response.status !== 200 || !contentType.includes('text/html')) {
    return response;
  }

  const origin = new URL(request.url).origin;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tagstash',
    url: `${origin}/`,
    description: 'A tag-based bookmark manager for saving links, organizing bookmarks, and sharing a public profile. Free for your first 50 bookmarks.',
    applicationCategory: 'Bookmark Manager',
    operatingSystem: 'Web, Chrome, Firefox',
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', description: 'Up to 50 bookmarks, no time limit.' },
      { '@type': 'Offer', name: 'Pro Monthly', price: '3', priceCurrency: 'USD', description: 'Unlimited bookmarks, billed monthly, cancel anytime.' },
      { '@type': 'Offer', name: 'Pro Annual', price: '36', priceCurrency: 'USD', description: 'Unlimited bookmarks, same $3/month rate billed once a year.' },
    ],
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Stone Dragon Media LLC',
    url: 'https://stonedragonmedia.com/',
    brand: { '@type': 'Brand', name: 'Tagstash', url: origin + '/', logo: origin + '/icon-512.png' },
  };

  const headHtml = `
<script type="application/ld+json">${JSON.stringify(softwareJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(organizationJsonLd)}</script>
`;

  const featuresHtml = FEATURES.map(
    (f) => `<div class="feature-item"><dt>${escapeHtml(f.title)}</dt><dd>${escapeHtml(f.description)}</dd></div>`
  ).join('');

  const faqHtml = FAQS.map(
    (faq) => `<div class="faq-item"><dt>${escapeHtml(faq.question)}</dt><dd>${escapeHtml(faq.answer)}</dd></div>`
  ).join('');

  const rootHtml = `
<div class="home-container">
  <section class="hero-section">
    <div class="hero-content">
      <h1 class="sr-only">Tagstash - Tag-Based Bookmark Manager</h1>
      <p class="hero-headline">Tag-first bookmarking for people who outgrow folders fast.</p>
      <p class="hero-lede">Save links in a bookmark manager built around tags. Give each link every tag that fits, and find it again from any of them. Free for your first 50 bookmarks.</p>
    </div>
  </section>
  <section class="features-section">
    <h2 class="home-section-title">What you get</h2>
    <dl class="features-list">${featuresHtml}</dl>
  </section>
  <section class="pricing-section">
    <h2 class="home-section-title">Pricing</h2>
    <p class="pricing-note">Free: up to 50 bookmarks, with no time limit. Pro: unlimited bookmarks for $3/month, or $36 once a year. Same rate either way.</p>
  </section>
  <section class="faq-section">
    <h2 class="home-section-title">Questions</h2>
    <dl class="faq-list">${faqHtml}</dl>
  </section>
</div>
`;

  const rewriter = new HTMLRewriter()
    .on('head', {
      element(el) {
        el.append(headHtml, { html: true });
      },
    })
    .on('#root', {
      element(el) {
        el.setInnerContent(rootHtml, { html: true });
      },
    });

  return rewriter.transform(response);
}
