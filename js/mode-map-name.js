// Режим 4: что на карте? Объект выделен — выбери его название из четырёх.
(function () {
  'use strict';

  var MV = App.MapView;
  var DESKTOP = window.matchMedia('(min-width: 601px)');

  var PROMPTS = {
    'Острова': 'Какой остров выделен на карте?',
    'Полуострова': 'Какой полуостров выделен на карте?',
    'Моря': 'Какое море выделено на карте?',
    'Заливы': 'Какой залив выделен на карте?',
    'Проливы': 'Какой пролив выделен на карте?',
    'Течения': 'Какое течение выделено на карте?',
    'Реки': 'Какая река выделена на карте?',
    'Озёра': 'Какое озеро выделено на карте?',
    'Водопады': 'Какой водопад выделен на карте?',
    'Рифы': 'Что выделено на карте?'
  };
  var FALLBACK = { 'Рифы': 'Острова', 'Водопады': 'Озёра' };

  function promptFor(obj) {
    if (obj.group === 'Острова' && /острова/.test(obj.label)) return 'Какие острова выделены на карте?';
    return PROMPTS[obj.group] || 'Что выделено на карте?';
  }

  // Правильный ответ + 3 разных случайных из той же группы (при нехватке — из запасной группы).
  function optionsFor(obj, all) {
    var same = all.filter(function (o) { return o.group === obj.group && o.id !== obj.id; });
    var picked = App.sample(same, 3);
    if (picked.length < 3 && FALLBACK[obj.group]) {
      var extra = all.filter(function (o) { return o.group === FALLBACK[obj.group]; });
      picked = picked.concat(App.sample(extra, 3 - picked.length));
    }
    return App.shuffle([obj].concat(picked)).map(function (o) {
      return { id: o.id, text: o.label, review: o.label, correct: o.id === obj.id };
    });
  }

  App.modes.mapname = {
    title: 'Что на карте?',
    start: function (c) {
      var objs = window.MAP_OBJECTS;
      var byId = {};
      objs.forEach(function (o) { byId[o.id] = o; });
      var targets = App.sample(objs, Math.min(15, objs.length));
      var questions = targets.map(function (t) {
        var q = { prompt: promptFor(t), options: optionsFor(t, objs) };
        var mv = null, handle = null, panel = null;
        var g = MV.geometry(t);

        // Панель (варианты + «Далее») поверх карты: внизу, а если закрывает цель сильнее — вверху.
        function placePanel() {
          if (!panel || !mv) return;
          var box = mv.boxEl, bw = box.clientWidth, bh = box.clientHeight;
          if (!bw) return;
          var h = panel.offsetHeight + 8, pts = [];
          g.circles.forEach(function (ci) {
            pts.push([ci[0], ci[1]]);
            for (var i = 0; i < 8; i++) pts.push([ci[0] + ci[2] * Math.cos(i * Math.PI / 4), ci[1] + ci[2] * Math.sin(i * Math.PI / 4)]);
          });
          g.lines.forEach(function (l) {
            for (var i = 0; i < l.length - 1; i++) {
              for (var k = 0; k < 10; k++) pts.push([l[i][0] + (l[i + 1][0] - l[i][0]) * k / 10, l[i][1] + (l[i + 1][1] - l[i][1]) * k / 10]);
            }
            if (l.length) pts.push(l[l.length - 1]);
          });
          var top = 0, bottom = 0;
          pts.forEach(function (p) {
            var sp = mv.toScreen(p[0], p[1]);
            if (sp.x < 0 || sp.x > bw || sp.y < 0 || sp.y > bh) return;
            if (sp.y <= h + 6) top++;
            if (sp.y >= bh - h - 6) bottom++;
          });
          var atTop = bottom > top;
          panel.classList.toggle('top', atTop);
          var zb = atTop ? '' : (h + 8) + 'px';
          if (mv.zoomEl.style.bottom !== zb) mv.zoomEl.style.bottom = zb;
        }

        q.media = function () {
          mv = MV.create({ region: t.region });
          handle = mv.highlight(t, 'target');
          if (DESKTOP.matches) {
            mv.el.classList.add('map-fit');
            setTimeout(function () {
              var card = mv.el.closest('.card');
              if (card) card.scrollIntoView({ block: 'start' });
            }, 0);
          }
          return mv.el;
        };
        q.mountOptions = function (optBox, nextBtn) {
          if (!DESKTOP.matches || !mv) return false;
          panel = App.el('div', { class: 'map-panel' }, [optBox]);
          mv.boxEl.appendChild(panel);
          mv.chipsEl.appendChild(nextBtn); // кнопка — в строке с регионами, справа
          mv.onChange(placePanel);
          return true;
        };
        q.onAnswer = function (opt, correct) {
          if (!mv) return;
          placePanel();
          if (correct) handle.setStyle('correct');
          else mv.highlight(byId[opt.id], 'other');
        };
        return q;
      });
      App.runQuiz({
        container: c,
        title: App.modes.mapname.title,
        questions: questions,
        restart: function () { App.modes.mapname.start(c); window.scrollTo(0, 0); }
      });
    }
  };
})();
