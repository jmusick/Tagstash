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
  { title: 'Tag-Based Organization', description: 'Save links with flexible tags, then find them again with search, sorting, and tag queries.' },
  { title: 'Free And Pro Tiers', description: 'Start free with up to 50 bookmarks, then upgrade to Pro for unlimited saving.' },
  { title: 'Privacy Focused', description: 'Keep bookmarks private by default, with fine-grained control over what you choose to share.' },
  { title: 'Public Profiles', description: 'Opt in to a public profile to share a read-only, tag-filterable view of your bookmarks. Mark individual bookmarks private to keep them out of it.' },
  { title: 'Browser Extension', description: 'Pair it with the companion extension to save the current tab without breaking your flow.' },
  { title: 'Account And Billing', description: 'Email verification, admin controls, Stripe billing, and billing portal support are built in.' },
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
    description: 'Tag-first bookmarking for people who outgrow folders fast. Save, organize, and share your bookmarks with Tagstash.',
    applicationCategory: 'Bookmark Manager',
    operatingSystem: 'Web, Chrome, Firefox',
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', description: 'Up to 50 bookmarks, no time limit.' },
      { '@type': 'Offer', name: 'Pro Monthly', price: '3', priceCurrency: 'USD', description: 'Unlimited bookmarks, billed monthly, cancel anytime.' },
      { '@type': 'Offer', name: 'Pro Annual', price: '36', priceCurrency: 'USD', description: 'Unlimited bookmarks, same $3/month rate billed once a year.' },
    ],
  };

  const headHtml = `
<script type="application/ld+json">${JSON.stringify(softwareJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
`;

  const featuresHtml = FEATURES.map(
    (f) => `<div class="feature-card"><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.description)}</p></div>`
  ).join('');

  const faqHtml = FAQS.map(
    (faq) => `<div class="faq-item"><dt>${escapeHtml(faq.question)}</dt><dd>${escapeHtml(faq.answer)}</dd></div>`
  ).join('');

  const rootHtml = `
<div class="home-container">
  <section class="hero-section">
    <div class="hero-content">
      <h1 class="hero-title"><span class="hero-title-text">Tagstash - Tag-Based Bookmarking</span></h1>
      <p class="hero-subtitle">Tag-first bookmarking for people who outgrow folders fast</p>
      <div class="hero-description">
        <p><strong>Tagstash</strong> is a modern bookmarking app built for people who want fast capture, clean organization, and retrieval by tags instead of rigid folder trees.</p>
        <p>Create an account, verify your email, save bookmarks with tags and descriptions, then search, filter, and manage your library from anywhere.</p>
      </div>
    </div>
  </section>
  <section class="features-section">
    <div class="section-header"><h2>Why Tagstash?</h2></div>
    <div class="features-grid">${featuresHtml}</div>
  </section>
  <section class="pricing-section">
    <div class="section-header"><h2>Simple, Transparent Pricing</h2></div>
    <p class="pricing-note">Free up to 50 bookmarks with no time limit. Pro is $3/month or $36/year (same $3/month rate) for unlimited bookmarks.</p>
  </section>
  <section class="faq-section">
    <div class="section-header"><h2>Frequently Asked Questions</h2></div>
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
