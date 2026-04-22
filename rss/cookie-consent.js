(function () {
  const CONSENT_COOKIE = 'snhu_cookie_consent';
  const ANALYTICS_ID = 'G-EXKQZDM7XW';
  const BANNER_ID = 'cookie-consent-banner';
  const GA_SCRIPT_SELECTOR = 'script[data-snhu-analytics="true"]';

  let bannerElement = null;
  let analyticsLoaded = false;

  /**
   * Reads a browser cookie by name.
   * @param {string} name - The cookie name to look up.
   * @returns {string} The cookie value if present, otherwise an empty string.
   */
  function getCookie(name) {
    const prefix = `${name}=`;
    return document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length) || '';
  }

  /**
   * Writes a browser cookie with a simple max-age, path, and SameSite policy.
   * @param {string} name - The cookie name.
   * @param {string} value - The cookie value.
   * @param {number} days - How long the cookie should remain valid.
   */
  function setCookie(name, value, days) {
    const maxAge = Math.max(1, Number(days) || 365) * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  }


  /**
   * Gets the current consent state stored in the consent cookie.
   * @returns {string} "accepted", "rejected", or an empty string if no choice exists.
   */
  function getConsent() {
    const consent = decodeURIComponent(getCookie(CONSENT_COOKIE));
    return consent === 'accepted' || consent === 'rejected' ? consent : '';
  }

  /**
   * Persists the current consent choice for future visits.
   * @param {string} consent - The consent state to save.
   */
  function setConsent(consent) {
    setCookie(CONSENT_COOKIE, consent, 365);
  }

  /**
   * Ensures a lightweight Google Analytics stub exists before the real script loads.
   */
  function ensureAnalyticsStub() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
  }

  /**
   * Clears common Google Analytics cookies from the current browser session.
   */
  function removeAnalyticsCookies() {
    document.cookie = '_ga=; Max-Age=0; Path=/; SameSite=Lax';
    document.cookie = '_gid=; Max-Age=0; Path=/; SameSite=Lax';
    document.cookie = `_gat=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `_ga_${ANALYTICS_ID.replace(/-/g, '')}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  /**
   * Loads Google Analytics once consent has been granted.
   */
  function loadAnalytics() {
    if (analyticsLoaded || getConsent() !== 'accepted') {
      return;
    }

    ensureAnalyticsStub();
    window[`ga-disable-${ANALYTICS_ID}`] = false;

    if (!document.querySelector(GA_SCRIPT_SELECTOR)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
      script.setAttribute('data-snhu-analytics', 'true');
      document.head.appendChild(script);
    }

    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    analyticsLoaded = true;
  }

  /**
   * Removes the cookie banner from the page.
   */
  function hideBanner() {
    if (bannerElement) {
      bannerElement.remove();
      bannerElement = null;
    }
  }

  /**
   * Creates and displays the cookie consent banner.
   * @returns {HTMLElement} The banner element.
   */
  function showBanner() {
    if (bannerElement) {
      return bannerElement;
    }

    const privacyPolicyUrl = 'privacy-disclaimer.html';

    bannerElement = document.createElement('div');
    bannerElement.id = BANNER_ID;
    bannerElement.className = 'cookie-banner';
    bannerElement.innerHTML = `
      <div class="cookie-banner-card card shadow-lg border-0">
        <div class="card-body p-3 p-md-4">
          <div class="d-flex flex-column gap-3">
            <div class="cookie-banner-copy">
              <h2 class="h5 fw-bold mb-2">Cookie preferences</h2>
              <p class="mb-0 text-muted">
                We use essential cookies and, with your permission, Google Analytics to understand site usage and improve
                the experience. You can accept or reject analytics cookies at any time.
              </p>
            </div>
            <div class="cookie-banner-actions d-flex flex-column gap-2">
              <div class="cookie-banner-buttons d-flex flex-column flex-sm-row gap-2">
                <button type="button" class="btn btn-outline-coffee flex-fill" data-cookie-decline>Reject analytics</button>
                <button type="button" class="btn btn-coffee flex-fill" data-cookie-accept>Accept analytics</button>
              </div>
              <div class="cookie-banner-policy text-center">
                <a class="cookie-manage-link" href="${privacyPolicyUrl}">Privacy policy</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bannerElement.querySelector('[data-cookie-accept]')?.addEventListener('click', () => {
      setConsent('accepted');
      hideBanner();
      loadAnalytics();
    });

    bannerElement.querySelector('[data-cookie-decline]')?.addEventListener('click', () => {
      setConsent('rejected');
      window[`ga-disable-${ANALYTICS_ID}`] = true;
      removeAnalyticsCookies();
      hideBanner();
    });

    document.body.appendChild(bannerElement);
    return bannerElement;
  }

  /**
   * Binds clicks that reopen the cookie preferences banner.
   */
  function handleManageCookiesClicks() {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-cookie-settings]') : null;
      if (!target) {
        return;
      }
      event.preventDefault();
      showBanner();
    });
  }

  /**
   * Sends a search event to analytics when consent allows it.
   * @param {Object} options - The search event details.
   * @param {string} options.query - The normalized search query.
   * @param {string} options.resultType - The type of result returned.
   * @param {number} options.resultCount - The number of matches found.
   */
  function trackSearch({ query = '', resultType = 'unknown', resultCount = 0 } = {}) {
    if (getConsent() !== 'accepted') {
      return;
    }

    ensureAnalyticsStub();
    window.gtag('event', 'search', {
      search_term: query,
      result_type: resultType,
      result_count: resultCount
    });
  }

  window.SNHUAlternativesAnalytics = {
    trackSearch
  };

  document.addEventListener('DOMContentLoaded', () => {
    const consent = getConsent();

    if (consent === 'accepted') {
      loadAnalytics();
    } else if (consent === 'rejected') {
      window[`ga-disable-${ANALYTICS_ID}`] = true;
    } else {
      showBanner();
    }

    handleManageCookiesClicks();
  });
})();

