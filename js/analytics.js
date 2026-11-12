// Яндекс Метрика + баннер согласия на cookie.
// Классический скрипт; подключается после common.js и до app.js (а также на privacy.html).
(function (root) {
  'use strict';

  var METRIKA_ID = 114222148; // номер счётчика Яндекс Метрики; 0 — выключено
  var CONSENT_KEY = 'cookieConsent';
  var App = root.App = root.App || {};

  // ---------- Согласие (localStorage с защитой от исключений) ----------
  function getConsent() {
    try {
      var v = root.localStorage.getItem(CONSENT_KEY);
      return v === 'yes' || v === 'no' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try { root.localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* без хранилища — просто не запоминаем */ }
  }

  function isWeb() {
    return root.location && (root.location.protocol === 'http:' || root.location.protocol === 'https:');
  }

  var active = false;

  // ---------- Метрика ----------
  function loadMetrika() {
    try {
      // Стандартный асинхронный загрузчик Яндекс Метрики
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j].src === r) { return; }
        }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r;
        a.parentNode.insertBefore(k, a);
      })(root, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

      root.ym(METRIKA_ID, 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        trackHash: true,
        webvisor: false
      });
      active = true;
    } catch (e) {
      active = false;
    }
  }

  function disableMetrika() {
    active = false;
    if (METRIKA_ID) root['disableYaCounter' + METRIKA_ID] = true; // официальный флаг отказа Яндекса
  }

  App.track = function (goal, params) {
    if (!active) return;
    try { root.ym(METRIKA_ID, 'reachGoal', goal, params); } catch (e) { /* аналитика не должна ломать сайт */ }
  };

  App.resetConsent = function () {
    try { root.localStorage.removeItem(CONSENT_KEY); } catch (e) { /* ignore */ }
    root.location.reload();
  };

  // ---------- Блокировка сайта при отказе ----------
  function isPrivacyPage() {
    var page = document.body && document.body.getAttribute('data-page');
    return page === 'privacy' || page === 'pamyatka';
  }

  function blockSite() {
    var el = App.el;
    document.documentElement.classList.add('cookie-blocked');
    var old = document.querySelector('.cookie-banner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (document.querySelector('.cookie-refused')) return;
    document.body.appendChild(el('div', { class: 'cookie-refused', role: 'alert' }, [
      el('img', { class: 'refused-knight', src: 'images/knight-2.png', alt: 'Грустный мальчик-путешественник' }),
      el('p', { class: 'refused-text', text: 'Жаль… Без согласия на cookie тренажёр недоступен.' }),
      App.btn('Я передумал — согласен', 'primary', function () {
        setConsent('yes');
        root.location.reload();
      }),
      el('a', { class: 'refused-link', href: 'privacy.html', text: 'Политика конфиденциальности' })
    ]));
  }

  // ---------- Баннер ----------
  function showBanner() {
    var el = App.el;
    var banner;

    function accept() {
      setConsent('yes');
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }

    function decline() {
      setConsent('no');
      disableMetrika();
      blockSite();
    }

    banner = el('div', { class: 'cookie-banner', role: 'dialog', 'aria-label': 'Согласие на cookie' }, [
      el('div', { class: 'cookie-inner' }, [
        el('p', { class: 'cookie-text' }, [
          'Мы используем файлы cookie. Они помогают сайту работать правильно. ' +
          'Оставаясь на сайте, вы соглашаетесь с нашей ',
          el('a', { href: 'privacy.html', text: 'Политикой конфиденциальности' }),
          '.'
        ]),
        el('div', { class: 'cookie-actions' }, [
          App.btn('Хорошо, я согласен', 'primary', accept),
          App.btn('нет', '', decline)
        ])
      ])
    ]);
    document.body.appendChild(banner);
  }

  // ---------- Запуск ----------
  var consent = getConsent();
  if (consent === 'no') {
    disableMetrika();
    if (!isPrivacyPage()) blockSite(); // сразу, чтобы не мигал сайт
  } else if (METRIKA_ID && isWeb()) {
    loadMetrika();
  }

  function init() {
    if (consent === null) showBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
