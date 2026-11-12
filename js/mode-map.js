// Режим 3: найди на карте (острова, моря, реки, озёра, течения).
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var K = 1000 / 360;
  var TAP_TOL_PX = 14;
  var DRAG_PX = 6;
  var ZOOMS = [1, 2, 4];

  var REGIONS = [
    { id: 'europe', name: 'Европа', lon: [-25, 60], lat: [72, 28] },
    { id: 'asia', name: 'Азия', lon: [25, 180], lat: [80, -12] },
    { id: 'africa', name: 'Африка', lon: [-25, 65], lat: [40, -38] },
    { id: 'namerica', name: 'С. Америка', lon: [-170, -30], lat: [80, 5] },
    { id: 'samerica', name: 'Ю. Америка', lon: [-95, -30], lat: [15, -62] },
    { id: 'australia', name: 'Австралия', lon: [105, 180], lat: [5, -50] },
    { id: 'world', name: 'Весь мир', lon: [-180, 180], lat: [84, -65] }
  ];

  // Кандидаты позиций подписи (lon, lat): показываем первую, что целиком влезла в вид.
  var OCEANS = [
    { text: 'Тихий океан', max: 2, at: [[-140, 5], [165, 15], [-120, -20], [150, 30], [-160, 35], [-85, -15], [-125, 15], [160, -51]] },
    { text: 'Атлантический океан', max: 1, at: [[-35, 20], [-15, -10], [-45, 40], [-25, -35], [-20, 5], [-60, 30], [-35, -45], [-8, -18], [-40, -42], [-10, 46], [-13, 45, 0.7]] },
    { text: 'Индийский океан', max: 1, at: [[80, -20], [65, -25], [90, -10], [60, -10], [100, -30], [40, -41], [120, -47]] },
    { text: 'Северный Ледовитый океан', max: 1, at: [[75, 78], [-150, 76], [30, 79], [150, 77]] }
  ];

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function px(lon) { return (lon + 180) * K; }
  function py(lat) { return (84 - lat) * K; }
  function regionById(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return REGIONS[REGIONS.length - 1];
  }
  function fmt(n) { return Math.round(n * 100) / 100; }

  function distSeg(x, y, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var ex = ax + t * dx - x, ey = ay + t * dy - y;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // Геометрия объекта в единицах карты: окружности и/или ломаные.
  function geometry(obj) {
    var z = obj.zone || {};
    var g = { circles: [], lines: [], arrow: false };
    if (z.circles) {
      z.circles.forEach(function (c) { g.circles.push([px(c[0]), py(c[1]), c[2] * K]); });
    } else if (z.river) {
      var pl = (window.MAP_DATA.rivers || {})[z.river] || [];
      pl.forEach(function (line) { g.lines.push(line); });
    } else if (z.line || z.lines) {
      (z.lines || [z.line]).forEach(function (ln) {
        g.lines.push(ln.map(function (p) { return [px(p[0]), py(p[1])]; }));
      });
      g.arrow = true;
    }
    return g;
  }

  function distToGeom(g, x, y) {
    var best = Infinity, i, j, d;
    for (i = 0; i < g.circles.length; i++) {
      var c = g.circles[i];
      d = Math.max(0, Math.sqrt((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1])) - c[2]);
      if (d < best) best = d;
    }
    for (i = 0; i < g.lines.length; i++) {
      var l = g.lines[i];
      for (j = 0; j < l.length - 1; j++) {
        d = distSeg(x, y, l[j][0], l[j][1], l[j + 1][0], l[j + 1][1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  App.modes.map = {
    title: 'Найди на карте',
    start: function (c) {
      var D = window.MAP_DATA, objs = window.MAP_OBJECTS;
      var targets = App.sample(objs, Math.min(15, objs.length));
      var geoms = {};
      objs.forEach(function (o) { geoms[o.id] = geometry(o); });

      var idx = 0, score = 0, mistakes = [];
      var region = 'world';

      function restart() { App.modes.map.start(c); window.scrollTo(0, 0); }

      function showQuestion() {
        c.textContent = '';
        App.modeHeader(c, App.modes.map.title);
        var target = targets[idx];
        var total = targets.length;
        var answered = false;
        var tap = null; // { x, y, ok, shown }
        var view = { z: 1, cx: D.W / 2, cy: D.H / 2 };
        var oceanNodes = [];

        // ----- SVG -----
        var svg = svgEl('svg', { 'class': 'map-svg', role: 'img', 'aria-label': 'Карта мира', preserveAspectRatio: 'xMidYMid meet' });
        svg.appendChild(svgEl('rect', { x: -2000, y: -2000, width: 5000, height: 5000, fill: '#cfe3f1' }));
        svg.appendChild(svgEl('path', { d: D.land, fill: '#f3ead7', stroke: '#b9a988', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
        if (D.lakes) svg.appendChild(svgEl('path', { d: D.lakes, fill: '#cfe3f1', stroke: '#7fa6c6', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke' }));
        Object.keys(D.rivers || {}).forEach(function (name) {
          D.rivers[name].forEach(function (line) {
            if (line.length < 2) return;
            svg.appendChild(svgEl('polyline', {
              points: line.map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); }).join(' '),
              fill: 'none', stroke: '#5b93c4', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
              'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }));
          });
        });
        OCEANS.forEach(function (o) {
          o.at.forEach(function (pt) {
            var t = svgEl('text', {
              x: px(pt[0]), y: py(pt[1]), 'text-anchor': 'middle', 'font-style': 'italic',
              'font-family': 'Georgia, "Times New Roman", serif', fill: '#4a6f93',
              'pointer-events': 'none', visibility: 'hidden'
            });
            t.textContent = o.text;
            svg.appendChild(t);
            oceanNodes.push({ node: t, ocean: o, x: px(pt[0]), f: pt[2] || 1 });
          });
        });
        var overlay = svgEl('g', { 'pointer-events': 'none' });
        svg.appendChild(overlay);
        var box = App.el('div', { class: 'map-box' }, [svg]);
        box.appendChild(App.el('div', { class: 'map-zoom' }, []));

        // ----- вид -----
        function aspect() {
          var w = box.clientWidth, h = box.clientHeight;
          return w && h ? w / h : 1;
        }
        function baseSize() {
          var r = regionById(region);
          var w = px(r.lon[1]) - px(r.lon[0]), h = py(r.lat[1]) - py(r.lat[0]);
          var a = aspect();
          if (w / h < a) w = h * a; else h = w / a;
          return { w: w, h: h };
        }
        function clampAxis(v, half, size) {
          if (half * 2 >= size) return size / 2;
          return Math.max(half, Math.min(size - half, v));
        }
        function scale() { // единиц карты в одном экранном пикселе
          var cw = box.clientWidth || 360;
          return baseSize().w / view.z / cw;
        }
        function render() {
          var b = baseSize();
          var vw = b.w / view.z, vh = b.h / view.z;
          view.cx = clampAxis(view.cx, vw / 2, D.W);
          view.cy = clampAxis(view.cy, vh / 2, D.H);
          view.vx = view.cx - vw / 2; view.vy = view.cy - vh / 2;
          view.vw = vw; view.vh = vh;
          svg.setAttribute('viewBox', fmt(view.vx) + ' ' + fmt(view.vy) + ' ' + fmt(vw) + ' ' + fmt(vh));
          svg.style.touchAction = view.z > 1 ? 'none' : 'pan-y';
          var s = vw / (box.clientWidth || 360);
          var shown = {};
          oceanNodes.forEach(function (it) {
            var t = it.node, o = it.ocean, vis = false;
            t.setAttribute('font-size', fmt(10.5 * s * it.f));
            var list = shown[o.text] = shown[o.text] || [];
            if (list.length < o.max) {
              try {
                var bb = t.getBBox();
                vis = bb.x >= view.vx && bb.y >= view.vy &&
                  bb.x + bb.width <= view.vx + vw && bb.y + bb.height <= view.vy + vh;
              } catch (e) { vis = false; }
              for (var k = 0; vis && k < list.length; k++) {
                if (Math.abs(list[k] - it.x) <= vw / 3) vis = false;
              }
              if (vis) list.push(it.x);
            }
            t.setAttribute('visibility', vis ? 'visible' : 'hidden');
          });
          drawOverlay(s);
          chips.forEach(function (ch) {
            var on = ch.id === region;
            ch.btn.classList.toggle('active', on);
            ch.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          zoomOut.disabled = view.z <= ZOOMS[0];
          zoomIn.disabled = view.z >= ZOOMS[ZOOMS.length - 1];
        }
        function setRegion(id) {
          region = id;
          var r = regionById(id);
          view.z = 1;
          view.cx = (px(r.lon[0]) + px(r.lon[1])) / 2;
          view.cy = (py(r.lat[0]) + py(r.lat[1])) / 2;
          render();
        }
        function setZoom(z) {
          view.z = z;
          render();
        }

        // ----- слой ответа -----
        function drawOverlay(s) {
          overlay.textContent = '';
          if (!answered) return;
          var g = geoms[target.id];
          g.circles.forEach(function (ci) {
            overlay.appendChild(svgEl('circle', {
              cx: fmt(ci[0]), cy: fmt(ci[1]), r: fmt(Math.max(ci[2], 6 * s)),
              fill: 'rgba(46,139,87,.18)', stroke: '#2e8b57', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke'
            }));
          });
          g.lines.forEach(function (line) {
            if (line.length < 2) return;
            overlay.appendChild(svgEl('polyline', {
              points: line.map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); }).join(' '),
              fill: 'none', stroke: '#e2571e', 'stroke-width': 3.5, 'vector-effect': 'non-scaling-stroke',
              'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }));
          });
          if (g.arrow && g.lines.length && g.lines[g.lines.length - 1].length > 1) {
            var l = g.lines[g.lines.length - 1], a = l[l.length - 2], b = l[l.length - 1];
            var deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
            overlay.appendChild(svgEl('polygon', {
              points: '-9,-6 7,0 -9,6', fill: '#e2571e', stroke: '#fff', 'stroke-width': 1,
              transform: 'translate(' + fmt(b[0]) + ' ' + fmt(b[1]) + ') rotate(' + fmt(deg) + ') scale(' + fmt(s) + ')'
            }));
          }
          if (tap) {
            var pin = svgEl('g', { transform: 'translate(' + fmt(tap.x) + ' ' + fmt(tap.y) + ') scale(' + fmt(s) + ')' });
            pin.appendChild(svgEl('path', {
              d: 'M0,0 C-5,-8 -9,-12 -9,-18 A9,9 0 1 1 9,-18 C9,-12 5,-8 0,0Z',
              fill: '#2c4a7a', stroke: '#fff', 'stroke-width': 1.5
            }));
            pin.appendChild(svgEl('circle', { cx: 0, cy: -18, r: 3.5, fill: '#fff' }));
            overlay.appendChild(pin);
          }
        }

        // ----- ответ -----
        function answer(x, y) {
          if (answered) return;
          var tol = TAP_TOL_PX * view.vw / (box.clientWidth || 360);
          var dT = distToGeom(geoms[target.id], x, y);
          var nearest = null, dN = Infinity;
          objs.forEach(function (o) {
            var d = o.id === target.id ? dT : distToGeom(geoms[o.id], x, y);
            if (d < dN || (d === dN && o.id === target.id)) { dN = d; nearest = o; }
          });
          var ok = dT <= tol && dT <= dN;
          var shown = ok ? target : (dN <= tol ? nearest : null);
          answered = true;
          tap = { x: x, y: y };
          if (ok) {
            score++;
            banner.className = 'map-banner ok';
            bannerText.textContent = 'Верно! Это ' + target.label + '.';
          } else {
            mistakes.push({ target: target, shown: shown });
            banner.className = 'map-banner bad';
            bannerText.textContent = 'Неверно. Ты показал: ' + (shown ? shown.label : 'мимо');
            setRegion(target.region);
          }
          banner.hidden = false;
          render();
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
            var sx = (p[0] - view.vx) / view.vw * bw, sy = (p[1] - view.vy) / view.vh * bh;
            if (sx < 0 || sx > bw || sy < 0 || sy > bh) return;
            if (sy <= h + 6) top++;
            if (sy >= bh - h - 6) bottom++;
          });
          var atBottom = top > 0 && top > bottom;
          banner.classList.toggle('bottom', atBottom);
          zoomBox.style.bottom = atBottom ? (h + 8) + 'px' : '';
        }

        // ----- указатель: касание или перетаскивание -----
        var ptr = null;
        svg.addEventListener('pointerdown', function (e) {
          if (ptr) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, drag: false };
          try { svg.setPointerCapture(e.pointerId); } catch (err) {}
        });
        svg.addEventListener('pointermove', function (e) {
          if (!ptr || e.pointerId !== ptr.id) return;
          if (!ptr.drag && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > DRAG_PX) ptr.drag = true;
          if (ptr.drag && view.z > 1) {
            var s = view.vw / (box.clientWidth || 360);
            view.cx -= (e.clientX - ptr.lx) * s;
            view.cy -= (e.clientY - ptr.ly) * s;
            render();
          }
          ptr.lx = e.clientX; ptr.ly = e.clientY;
        });
        svg.addEventListener('pointerup', function (e) {
          if (!ptr || e.pointerId !== ptr.id) return;
          var p = ptr; ptr = null;
          if (p.drag) return;
          var r = svg.getBoundingClientRect();
          if (!r.width || !r.height) return;
          answer(view.vx + (e.clientX - r.left) / r.width * view.vw,
                 view.vy + (e.clientY - r.top) / r.height * view.vh);
        });
        svg.addEventListener('pointercancel', function () { ptr = null; });

        // ----- интерфейс -----
        var chips = REGIONS.map(function (r) {
          var b = App.el('button', { type: 'button', class: 'map-chip', text: r.name });
          b.addEventListener('click', function () { setRegion(r.id); });
          return { id: r.id, btn: b };
        });
        var zoomOut = App.el('button', { type: 'button', class: 'map-zoom-btn', text: '−', 'aria-label': 'Отдалить' });
        var zoomIn = App.el('button', { type: 'button', class: 'map-zoom-btn', text: '+', 'aria-label': 'Приблизить' });
        zoomOut.addEventListener('click', function () {
          var i = ZOOMS.indexOf(view.z); if (i > 0) setZoom(ZOOMS[i - 1]);
        });
        zoomIn.addEventListener('click', function () {
          var i = ZOOMS.indexOf(view.z); if (i < ZOOMS.length - 1) setZoom(ZOOMS[i + 1]);
        });
        var bannerText = App.el('div', { class: 'map-banner-text' });
        var nextBtn = App.btn(idx === total - 1 ? 'Результат' : 'Далее', 'primary', function () {
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
          App.el('div', { class: 'map-chips' }, chips.map(function (ch) { return ch.btn; })),
          box
        ]);
        c.appendChild(card);
        var zoomBox = box.querySelector('.map-zoom');
        box.appendChild(banner);
        if (idx > 0) App.scrollTo(card);
        zoomBox.appendChild(zoomIn);
        zoomBox.appendChild(zoomOut);
        setRegion(region);
        window.addEventListener('resize', onResize);
        function onResize() {
          if (!document.body.contains(box)) { window.removeEventListener('resize', onResize); return; }
          render();
        }
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
