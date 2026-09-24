/* Business in a Box — landing page behaviour. Scoped, idempotent, no dependencies. */
(function () {
  'use strict';

  function initFaq(root) {
    (root || document).querySelectorAll('.biab-faq__q').forEach(function (btn) {
      if (btn.dataset.biabBound) return;
      btn.dataset.biabBound = '1';
      btn.addEventListener('click', function () {
        var item = btn.closest('.biab-faq__item');
        if (!item) return;
        var open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  function initTabs(root) {
    (root || document).querySelectorAll('[data-biab-tabs]').forEach(function (group) {
      if (group.dataset.biabBound) return;
      group.dataset.biabBound = '1';
      var tabs = Array.prototype.slice.call(group.querySelectorAll('.biab-tab'));
      var scope = group.closest('[data-biab-contents]') || document;

      function select(filter) {
        tabs.forEach(function (t) {
          t.setAttribute('aria-selected', t.dataset.filter === filter ? 'true' : 'false');
        });
        scope.querySelectorAll('[data-category]').forEach(function (card) {
          var show = filter === 'all' || card.dataset.category === filter;
          card.style.display = show ? '' : 'none';
        });
      }

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () { select(tab.dataset.filter); });
      });
      select('all');
    });
  }

  function initSticky(root) {
    (root || document).querySelectorAll('[data-biab-sticky]').forEach(function (bar) {
      if (bar.dataset.biabBound) return;
      bar.dataset.biabBound = '1';
      var threshold = parseInt(bar.dataset.threshold, 10) || 600;

      function update() {
        var pastTop = window.pageYOffset > threshold;
        var buy = document.getElementById('biab-purchase');
        var buyVisible = false;
        if (buy) {
          var r = buy.getBoundingClientRect();
          buyVisible = r.top < window.innerHeight && r.bottom > 0;
        }
        bar.classList.toggle('is-visible', pastTop && !buyVisible);
      }

      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    });
  }

  function initTermsGate(root) {
    (root || document).querySelectorAll('[data-biab-form]').forEach(function (form) {
      if (form.dataset.biabBound) return;
      form.dataset.biabBound = '1';
      form.addEventListener('submit', function (event) {
        var box = form.querySelector('[data-biab-terms]');
        var error = form.querySelector('[data-biab-error]');
        if (box && !box.checked) {
          event.preventDefault();
          if (error) {
            error.classList.add('is-visible');
            error.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          box.focus();
        }
      });
      var box = form.querySelector('[data-biab-terms]');
      if (box) {
        box.addEventListener('change', function () {
          var error = form.querySelector('[data-biab-error]');
          if (box.checked && error) error.classList.remove('is-visible');
        });
      }
    });
  }

  function initAll(root) {
    initFaq(root);
    initTabs(root);
    initSticky(root);
    initTermsGate(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
})();
