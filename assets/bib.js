/* ==========================================================================
   Business in a Box — page behaviour
   Accordion, sticky mobile CTA, smooth anchor scroll, GA4 events and the
   reseller-terms gate on the buy form. Self-contained; only runs when a
   .bib element is on the page.
   ========================================================================== */

(function () {
  'use strict';

  if (!document.querySelector('.bib')) return;
  if (window.__bibInit) return;
  window.__bibInit = true;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- analytics helper ---------- */

  function track(eventName, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params || {});
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
    } catch (e) {
      /* analytics must never break the page */
    }
  }

  function itemPayload() {
    var el = document.querySelector('[data-bib-product]');
    if (!el) return {};
    return {
      currency: el.getAttribute('data-currency') || 'USD',
      value: parseFloat(el.getAttribute('data-price')) || 0,
      items: [
        {
          item_id: el.getAttribute('data-sku') || '',
          item_name: el.getAttribute('data-title') || 'Business in a Box',
          item_variant: el.getAttribute('data-variant') || '',
          price: parseFloat(el.getAttribute('data-price')) || 0,
          quantity: 1
        }
      ]
    };
  }

  /* ---------- view_item ---------- */

  track('view_item', itemPayload());

  /* ---------- smooth anchor scroll ---------- */

  document.querySelectorAll('.bib [data-bib-scroll]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------- hero + CTA click tracking ---------- */

  document.querySelectorAll('.bib [data-bib-cta]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      track('bib_cta_click', {
        cta_location: btn.getAttribute('data-bib-cta'),
        cta_text: (btn.textContent || '').trim()
      });
    });
  });

  /* ---------- buy form: reseller terms gate + add_to_cart ---------- */

  document.querySelectorAll('[data-bib-form]').forEach(function (form) {
    var checkbox = form.querySelector('[data-bib-terms]');
    var error = form.querySelector('[data-bib-error]');

    form.addEventListener('submit', function (event) {
      if (checkbox && !checkbox.checked) {
        event.preventDefault();
        if (error) error.classList.add('is-visible');
        checkbox.focus();
        return;
      }
      if (error) error.classList.remove('is-visible');
      track('add_to_cart', itemPayload());
    });

    if (checkbox && error) {
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) error.classList.remove('is-visible');
      });
    }
  });

  /* begin_checkout — dynamic checkout buttons and any direct checkout link */
  document.querySelectorAll('.bib .shopify-payment-button, .bib [data-bib-checkout]').forEach(function (el) {
    el.addEventListener('click', function () {
      track('begin_checkout', itemPayload());
    });
  });

  /* ---------- FAQ accordion ---------- */

  document.querySelectorAll('[data-bib-accordion]').forEach(function (accordion) {
    var singleOpen = accordion.getAttribute('data-single-open') === 'true';
    var buttons = accordion.querySelectorAll('.bib-faq__q');

    function close(button) {
      var panel = document.getElementById(button.getAttribute('aria-controls'));
      if (!panel) return;
      button.setAttribute('aria-expanded', 'false');
      panel.style.height = panel.scrollHeight + 'px';
      requestAnimationFrame(function () { panel.style.height = '0px'; });
    }

    function open(button) {
      var panel = document.getElementById(button.getAttribute('aria-controls'));
      if (!panel) return;
      button.setAttribute('aria-expanded', 'true');
      panel.style.height = panel.scrollHeight + 'px';
      panel.addEventListener('transitionend', function handler(e) {
        if (e.propertyName !== 'height') return;
        if (button.getAttribute('aria-expanded') === 'true') panel.style.height = 'auto';
        panel.removeEventListener('transitionend', handler);
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var isOpen = button.getAttribute('aria-expanded') === 'true';

        if (singleOpen && !isOpen) {
          buttons.forEach(function (other) {
            if (other !== button && other.getAttribute('aria-expanded') === 'true') close(other);
          });
        }

        if (isOpen) {
          close(button);
        } else {
          open(button);
          track('bib_faq_open', { question: (button.querySelector('span') || button).textContent.trim() });
        }
      });
    });

    /* keep an open panel correct when the viewport reflows the text */
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        buttons.forEach(function (button) {
          if (button.getAttribute('aria-expanded') !== 'true') return;
          var panel = document.getElementById(button.getAttribute('aria-controls'));
          if (panel) panel.style.height = 'auto';
        });
      }, 160);
    });
  });

  /* ---------- sticky mobile CTA ---------- */

  var sticky = document.querySelector('[data-bib-sticky]');
  var hero = document.querySelector('[data-bib-hero]');

  if (sticky && hero && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          sticky.classList.toggle('is-visible', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        });
      },
      { threshold: 0, rootMargin: '0px' }
    );
    observer.observe(hero);
  } else if (sticky && hero) {
    window.addEventListener('scroll', function () {
      sticky.classList.toggle('is-visible', window.scrollY > hero.offsetHeight);
    }, { passive: true });
  }
})();
