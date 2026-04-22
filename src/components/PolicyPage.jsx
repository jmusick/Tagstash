import './PolicyPage.css';

function PolicyPage({ logoSrc, onBack }) {
  return (
    <div className="privacy-page">
      <header className="privacy-header">
        {logoSrc && <img src={logoSrc} alt="Tagstash" className="privacy-logo" />}
        <h1>Privacy Policy</h1>
      </header>

      <main className="privacy-content">
        <p className="privacy-effective">Effective date: January 1, 2025</p>

        <section>
          <h2>Overview</h2>
          <p>
            Tagstash ("we", "us", or "our") provides a tag-based bookmarking service. This
            policy explains what information we collect, how we use it, and your choices.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <ul>
            <li>
              <strong>Account information:</strong> username and email address provided when you
              register.
            </li>
            <li>
              <strong>Bookmarks and tags:</strong> the URLs, titles, descriptions, and tags you
              save to your account.
            </li>
            <li>
              <strong>Usage data:</strong> standard server logs including IP addresses, browser
              type, and pages accessed, used solely for operating and improving the service.
            </li>
          </ul>
        </section>

        <section>
          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain your bookmarking account.</li>
            <li>To authenticate you and keep your data secure.</li>
            <li>To respond to support requests.</li>
            <li>To improve the reliability and performance of the service.</li>
          </ul>
          <p>We do not sell or share your personal data with third parties for advertising purposes.</p>
        </section>

        <section>
          <h2>Data Storage</h2>
          <p>
            Your data is stored securely in Cloudflare's infrastructure. Bookmark data is
            associated with your account and is not accessible to other users.
          </p>
        </section>

        <section>
          <h2>Data Retention &amp; Deletion</h2>
          <p>
            Your data is retained as long as your account is active. You may delete individual
            bookmarks at any time. To request full account deletion and removal of all associated
            data, contact us at the address below.
          </p>
        </section>

        <section>
          <h2>Cookies &amp; Local Storage</h2>
          <p>
            We use browser local storage to remember your theme preference and to keep you
            logged in between sessions. We do not use third-party tracking cookies.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Passwords are hashed before storage. All data is transmitted over HTTPS. We take
            reasonable measures to protect your information but cannot guarantee absolute
            security.
          </p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. Changes will be posted on this page
            with an updated effective date.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about this policy? Use the in-app Support form and include
            "Privacy Policy" in your message.
          </p>
        </section>
      </main>

      <footer className="privacy-footer">
        <button className="btn-secondary" onClick={onBack}>
          &larr; Back
        </button>
        <span className="privacy-copyright">&copy; {new Date().getFullYear()} Tagstash</span>
      </footer>
    </div>
  );
}

export default PolicyPage;
