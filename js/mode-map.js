// Режим 3: найди на карте (острова, моря, реки, озёра, течения).
(function () {
  'use strict';

  var TAP_TOL_PX = 14;
  var MV = App.MapView;

  App.modes.map = {
    title: 'Найди на карте',
    start: function (c) {
      var objs = window.MAP_OBJECTS;
      var targets = App.sample(objs, Math.min(15, objs.length));
      var geoms = {};
      objs.forEach(function (o) { geoms[o.id] = MV.geometry(o); });

      var idx = 0, score = 0, mistakes = [];
      var region = 'world';

      function restart() { App.modes.map.start(c); window.scrollTo(0, 0); }

      function showQuestion() {
        c.textContent = '';
        App.modeHeader(c, App.modes.map.title);
        var target = targets[idx];
        var total = targets.length;
        var answered = false;

        var mv = MV.create({ region: region, onTap: answer });
        var box = mv.boxEl, zoomBox = mv.zoomEl;

        // ----- ответ -----
        function answer(x, y) {
          if (answered) return;
          var tol = mv.tol(TAP_TOL_PX);
          var dT = MV.distance(geoms[target.id], x, y);
          var nearest = null, dN = Infinity;
          objs.forEach(function (o) {
            var d = o.id === target.id ? dT : MV.distance(geoms[o.id], x, y);
            if (d < dN || (d === dN && o.id === target.id)) { dN = d; nearest = o; }
          });
          var ok = dT <= tol && dT <= dN;
          var shown = ok ? target : (dN <= tol ? nearest : null);
          answered = true;
          mv.placePin(x, y);
          mv.highlight(target, 'answer');
          if (ok) {
            score++;
            banner.className = 'map-banner ok';
            bannerText.textContent = 'Верно! Это ' + target.label + '.';
          } else {
            mistakes.push({ target: target, shown: shown });
            banner.className = 'map-banner bad';
            bannerText.textContent = 'Неверно. Ты показал: ' + (shown ? shown.label : 'мимо');
            mv.setRegion(target.region);
          }
          region = mv.getRegion();
          banner.hidden = false;
          placeBanner();
          try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        }

        // Баннер сверху; если он закрывает выделенную зону — снизу (и кнопки зума выше него).
        function placeBanner() {
          var bw = box.clientWidth, bh = box.clientHeight;
          var h = banner.offsetHeight + 8;
          var g = geoms[target.id], pts = [];
          g.circles.forEach(function (ci) {
            pts.push([ci[0], ci[1]]);
            for (var i = 0; i < 8; i++) pts.push([ci[0] + ci[2] * Math.cos(i * Math.PI / 4), ci[1] + ci[2] * Math.sin(i * Math.PI / 4)]);
          });
          g.lines.forEach(function (l) {
            for (var i = 0; i < l.length - 1; i++) {
              for (var t = 0; t < 10; t++) pts.push([l[i][0] + (l[i + 1][0] - l[i][0]) * t / 10, l[i][1] + (l[i + 1][1] - l[i][1]) * t / 10]);
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
          var atBottom = top > 0 && top > bottom;
          banner.classList.toggle('bottom', atBottom);
          zoomBox.style.bottom = atBottom ? (h + 8) + 'px' : '';
        }

        var bannerText = App.el('div', { class: 'map-banner-text' });
        var nextBtn = App.btn(idx === total - 1 ? 'Результат' : 'Далее', 'primary', function () {
          region = mv.getRegion();
          idx++;
          if (idx >= total) { showResult(); window.scrollTo(0, 0); } else showQuestion();
        });
        var banner = App.el('div', { class: 'map-banner', hidden: true, role: 'status' }, [bannerText, nextBtn]);

        var card = App.el('div', { class: 'card quiz-card' }, [
          App.el('div', { class: 'progress-line' }, [
            App.el('span', { text: 'Вопрос ' + (idx + 1) + ' из ' + total }),
            App.el('span', { class: 'progress-score', text: 'Верно: ' + score })
          ]),
          App.el('div', { class: 'progress-track' }, [
            App.el('div', { class: 'progress-fill', style: 'width:' + Math.round(idx / total * 100) + '%' })
          ]),
          App.el('div', { class: 'prompt' }, [
            'Нажми на карте: ',
            App.el('span', { class: 'map-target', text: target.label })
          ]),
          mv.el
        ]);
        c.appendChild(card);
        box.appendChild(banner);
        if (idx > 0) App.scrollTo(card);
        mv.refresh();
      }

      function showResult() {
        c.textContent = '';
        App.modeHeader(c, App.modes.map.title);
        var head = App.renderResultHeader(c, score, targets.length);
        if (!mistakes.length) {
          c.appendChild(App.el('div', { class: 'card note-ok', text: 'Ошибок нет — отличный результат!' }));
        } else {
          c.appendChild(App.el('h3', { class: 'section-title', text: 'Ошибки (' + mistakes.length + ')' }));
          mistakes.forEach(function (m) {
            c.appendChild(App.el('div', { class: 'card mistake' }, [
              App.el('div', { class: 'mistake-prompt', text: m.target.label }),
              App.el('div', { class: 'answer wrong-text', text: 'Ты показал: ' + (m.shown ? m.shown.label : 'мимо') }),
              App.el('div', { class: 'answer right-text', text: 'Нужно было: ' + m.target.label })
            ]));
          });
        }
        c.appendChild(App.bar([
          App.btn('Ещё раз', 'primary', restart),
          App.btn('В меню', '', function () { App.showMenu(); })
        ]));
        App.scrollTo(head);
      }

      showQuestion();
    }
  };
})();
