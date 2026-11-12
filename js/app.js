// Меню и маршрутизация по хешу (#match, #terms).
(function () {
  'use strict';

  function route() {
    var name = location.hash.replace('#', '');
    if (name && App.modes[name]) App.openMode(name);
    else App.showMenu();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cards = document.querySelectorAll('.menu-card');
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function () {
        var name = card.getAttribute('data-mode');
        if (location.hash === '#' + name) App.openMode(name);
        else location.hash = '#' + name;
      });
    });
    window.addEventListener('hashchange', route);
    route();
  });
})();
