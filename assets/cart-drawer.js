class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.classList.remove('is-empty');
    const innerEl = this.querySelector('.drawer__inner');
    if (innerEl && innerEl.classList.contains('is-empty')) innerEl.classList.remove('is-empty');
    this.productId = parsedState.id;

    // Update each section. Wrap every section in its own try/catch so that a
    // single failing section (e.g. a Liquid error from an app or a missing
    // selector) can NEVER abort the whole update and leave the drawer unopened.
    this.getSectionsToRender().forEach((section) => {
      try {
        const sectionElement = section.selector
          ? document.querySelector(section.selector)
          : document.getElementById(section.id);

        if (!sectionElement) return;
        const sectionHTML = parsedState.sections && parsedState.sections[section.id];
        if (!sectionHTML) return;
        const newInnerHTML = this.getSectionInnerHTML(sectionHTML, section.selector);
        if (newInnerHTML != null) sectionElement.innerHTML = newInnerHTML;
      } catch (e) {
        console.error('[cart-drawer] Could not render section "' + section.id + '":', e);
      }
    });

    try {
      const sourceWrapper =
        parsedState.sections && parsedState.sections['cart-drawer']
          ? new DOMParser()
              .parseFromString(parsedState.sections['cart-drawer'], 'text/html')
              .querySelector('cart-drawer')
          : null;
      if (sourceWrapper) {
        this.classList.toggle('is-empty', sourceWrapper.classList.contains('is-empty'));
      }
    } catch (e) {
      console.error('[cart-drawer] Could not sync empty state:', e);
    }

    // ALWAYS open the drawer, even if a section above failed to render.
    setTimeout(() => {
      const overlay = this.querySelector('#CartDrawer-Overlay');
      if (overlay) overlay.addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const el = parsed.querySelector(selector);
    // Fall back to the whole body if the expected selector is missing, so a
    // markup change from an app never crashes the render.
    return el ? el.innerHTML : (parsed.body ? parsed.body.innerHTML : null);
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);

/**
 * Safety net: guarantee the cart drawer visibly refreshes and opens on EVERY
 * successful add-to-cart, no matter which button/app triggered it.
 *
 * On this store the cart write lands a moment AFTER the "added" event fires
 * (an app sits in front of the add), so a single immediate fetch comes back
 * empty. To handle that, this opens the drawer right away and then POLLS the
 * server every 350ms until the item actually shows up in the cart, filling the
 * drawer in as soon as it does. A fresh server fetch is ground truth, so the
 * drawer always ends up showing exactly what is really in the cart.
 */
(function () {
  if (window.__cartDrawerAutoOpenBound) return;
  window.__cartDrawerAutoOpenBound = true;

  // Only auto-open for genuine ADD actions, not cart-page quantity edits.
  const OPEN_ON_SOURCES = ['product-form', 'quick-add', 'quick-add-bulk'];
  const MAX_TRIES = 10; // ~3.5s ceiling
  const INTERVAL_MS = 350;
  const parser = new DOMParser();
  let running = false;

  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  async function fetchCartSections() {
    const url = `${root()}?sections=cart-drawer,cart-icon-bubble&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    return res.json();
  }

  // Swaps the fresh cart HTML into the on-page drawer. Returns true if the
  // fetched cart actually has items (so we can stop polling).
  function applySections(drawer, sections) {
    let cartHasItems = false;

    if (sections && sections['cart-drawer']) {
      const doc = parser.parseFromString(sections['cart-drawer'], 'text/html');
      const freshInner = doc.querySelector('#CartDrawer');
      const onPageInner = document.querySelector('#CartDrawer');
      if (freshInner && onPageInner) {
        onPageInner.innerHTML = freshInner.innerHTML;
        // The overlay was just replaced, so re-bind its close handler.
        const overlay = document.querySelector('#CartDrawer-Overlay');
        if (overlay && typeof drawer.close === 'function') {
          overlay.addEventListener('click', drawer.close.bind(drawer));
        }
      }
      const freshWrapper = doc.querySelector('cart-drawer');
      if (freshWrapper) {
        cartHasItems = !freshWrapper.classList.contains('is-empty');
        drawer.classList.toggle('is-empty', !cartHasItems);
      }
    }

    if (sections && sections['cart-icon-bubble']) {
      const doc = parser.parseFromString(sections['cart-icon-bubble'], 'text/html');
      const fresh = doc.querySelector('.shopify-section') || doc.body;
      const onPage = document.getElementById('cart-icon-bubble');
      if (fresh && onPage) onPage.innerHTML = fresh.innerHTML;
    }

    return cartHasItems;
  }

  async function refreshAndOpenDrawer() {
    const drawer = document.querySelector('cart-drawer');
    if (!drawer || typeof drawer.open !== 'function') return;
    if (running) return; // avoid overlapping pollers
    running = true;

    let opened = false;
    const ensureOpen = () => {
      if (!opened) {
        opened = true;
        drawer.open();
      }
    };

    try {
      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const sections = await fetchCartSections();
          const hasItems = applySections(drawer, sections);
          ensureOpen();
          if (hasItems) return; // item has landed and is now shown — done
        } catch (e) {
          console.error('[cart-drawer] Refresh attempt failed:', e);
          ensureOpen();
        }
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
      }
    } finally {
      running = false;
    }
  }

  // 1) Theme pub/sub event (fired by product-form, quick-add, etc.)
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (!event || OPEN_ON_SOURCES.indexOf(event.source) === -1) return;
      refreshAndOpenDrawer();
    });
  }

  // 2) Shopify's global cart events (fired by many cart/subscription apps).
  //    This catches adds that bypass the theme's own add-to-cart code.
  document.addEventListener('cart:refresh', refreshAndOpenDrawer);
  document.addEventListener('cart:updated', refreshAndOpenDrawer);
  document.addEventListener('cart:build', refreshAndOpenDrawer);
  document.addEventListener('ajaxProduct:added', refreshAndOpenDrawer);

  /**
   * 3) Network-level safety net — the actual product-page fix.
   *
   * On the product page the Add-to-Cart button is handled by an app
   * (the subscriptions widget) that sits in front of the theme's own
   * add-to-cart. Because of that, the theme's `cartUpdate` pub/sub event
   * (path #1) never fires there, so the drawer never opened — even though
   * the homepage works, because the homepage button dispatches `cart:refresh`
   * (path #2) itself.
   *
   * Instead of guessing which script performs the add, we watch the network:
   * the moment ANY successful POST to `/cart/add` completes — theme form,
   * quick-add, or a third-party app — we run the SAME existing
   * refreshAndOpenDrawer() routine the homepage already uses. No cart logic is
   * duplicated; we only observe the request and trigger the existing routine.
   * We never read the response body, so the code that made the request keeps
   * working exactly as before.
   */
  let addDebounce = null;
  function triggerFromNetwork() {
    // Coalesce the burst of signals a single add can produce (form publish +
    // network hook + app event) into one drawer refresh.
    if (addDebounce) return;
    addDebounce = setTimeout(function () { addDebounce = null; }, 150);
    refreshAndOpenDrawer();
  }

  function isCartAddUrl(url) {
    if (!url) return false;
    var path = '' + url;
    try {
      path = new URL(url, window.location.origin).pathname;
    } catch (e) {
      /* relative/opaque URL — fall back to the raw string */
    }
    // Matches /cart/add and /cart/add.js, including locale prefixes
    // such as /en-gb/cart/add.js
    return /\/cart\/add(\.js)?$/.test(path.split('?')[0]);
  }

  // Wrap window.fetch (used by the theme form and most modern apps).
  if (window.fetch && !window.__cartAddFetchWrapped) {
    window.__cartAddFetchWrapped = true;
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = '';
      var method = 'GET';
      if (typeof input === 'string') {
        url = input;
      } else if (input && input.url) {
        url = input.url;
        if (input.method) method = input.method;
      }
      if (init && init.method) method = init.method;

      var isAdd = String(method).toUpperCase() === 'POST' && isCartAddUrl(url);
      var promise = origFetch.apply(this, arguments);

      if (isAdd) {
        // Observe success without consuming the body — the caller still
        // gets the untouched original response.
        promise
          .then(function (res) {
            if (res && res.ok) triggerFromNetwork();
          })
          .catch(function () {});
      }
      return promise;
    };
  }

  // Wrap XMLHttpRequest (some cart/subscription apps still use XHR).
  if (window.XMLHttpRequest && !window.__cartAddXhrWrapped) {
    window.__cartAddXhrWrapped = true;
    var OrigXhrOpen = XMLHttpRequest.prototype.open;
    var OrigXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__isCartAdd = String(method || '').toUpperCase() === 'POST' && isCartAddUrl(url);
      return OrigXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this.__isCartAdd) {
        this.addEventListener('load', function () {
          if (this.status >= 200 && this.status < 300) triggerFromNetwork();
        });
      }
      return OrigXhrSend.apply(this, arguments);
    };
  }
})();
