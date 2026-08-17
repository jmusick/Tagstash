// Google Analytics 4 measurement ID. Public by definition (ships in page HTML),
// so it's committed here rather than sourced from an env var.
//
// Loading gtag.js at all requires cookie consent - see components/CookieConsent.jsx.
// Changing or removing this ID means updating the Google Analytics section of the
// privacy policy (components/PolicyPage.jsx) in the same commit.
export const GA_MEASUREMENT_ID = 'G-7YTZSKS5ZE'

// Null in dev so local page views never reach the property. The consent banner
// still renders in dev (see CookieConsent.jsx) so it stays workable, it just
// has nothing to load when accepted.
export const ANALYTICS_ID = import.meta.env.PROD ? GA_MEASUREMENT_ID : null

export const ANALYTICS_CONSENT_STORAGE_KEY = 'tagstash-analytics-consent'
