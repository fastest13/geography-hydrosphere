// Общая карта мира для режимов «Найди на карте» и «Что на карте?»: SVG, регионы, зум, перетаскивание, подсветка зон.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var K = 1000 / 360;
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
    { text: 'Атлантический океан', max: 1, at: [[-35, 20], [-15, -10], [-45, 40], [-25, -35], [-20, 5], [-60, 30], [-35, -45], [-8, -18], [-40, -42], [-10, 46], [-13, 45, 0.7], [-8, -30], [-8, -6]] },
    { text: 'Индийский океан', max: 1, at: [[80, -20], [65, -25], [90, -10], [60, -10], [100, -30], [40, -41], [120, -47], [48, -33]] },
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

  var STYLES = {
    // зелёная зона; линии и течения — оранжевые (режим «Найди на карте»)
    answer: { fill: 'rgba(46,139,87,.18)', stroke: '#2e8b57', line: '#e2571e', lineWidth: 3.5 },
    correct: { fill: 'rgba(46,139,87,.18)', stroke: '#2e8b57', line: '#2e8b57', lineWidth: 3.5 },
    target: { fill: 'rgba(226,87,30,.22)', stroke: '#e2571e', line: '#e2571e', lineWidth: 3.5 },
    other: { fill: 'none', stroke: '#2c4a7a', line: '#2c4a7a', lineWidth: 2.5, dash: '5 3' }
  };

  // opts: { region, onTap(x, y) } — x, y в единицах карты.
  function create(opts) {
    opts = opts || {};
    var D = window.MAP_DATA;
    var region = opts.region || 'world';
    var view = { z: 1, cx: D.W / 2, cy: D.H / 2 };
    var oceanNodes = [];
    var highlights = [];
    var pin = null;
    var centered = true;
    var changeCbs = [];

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
    var zoomEl = App.el('div', { class: 'map-zoom' }, []);
    box.appendChild(zoomEl);

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

    function drawOverlay(s) {
      overlay.textContent = '';
      highlights.forEach(function (h) {
        var st = STYLES[h.style] || STYLES.target, g = h.geom;
        g.circles.forEach(function (ci) {
          var a = {
            cx: fmt(ci[0]), cy: fmt(ci[1]), r: fmt(Math.max(ci[2], 6 * s)),
            fill: st.fill, stroke: st.stroke, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke'
          };
          if (st.dash) a['stroke-dasharray'] = st.dash;
          overlay.appendChild(svgEl('circle', a));
        });
        g.lines.forEach(function (line) {
          if (line.length < 2) return;
          var a = {
            points: line.map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); }).join(' '),
            fill: 'none', stroke: st.line, 'stroke-width': st.lineWidth, 'vector-effect': 'non-scaling-stroke',
            'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          };
          if (st.dash) a['stroke-dasharray'] = st.dash;
          overlay.appendChild(svgEl('polyline', a));
        });
        if (g.arrow && g.lines.length && g.lines[g.lines.length - 1].length > 1) {
          var l = g.lines[g.lines.length - 1], a2 = l[l.length - 2], b = l[l.length - 1];
          var deg = Math.atan2(b[1] - a2[1], b[0] - a2[0]) * 180 / Math.PI;
          overlay.appendChild(svgEl('polygon', {
            points: '-9,-6 7,0 -9,6', fill: st.line, stroke: '#fff', 'stroke-width': 1,
            transform: 'translate(' + fmt(b[0]) + ' ' + fmt(b[1]) + ') rotate(' + fmt(deg) + ') scale(' + fmt(s) + ')'
          }));
        }
      });
      if (pin) {
        var pg = svgEl('g', { transform: 'translate(' + fmt(pin.x) + ' ' + fmt(pin.y) + ') scale(' + fmt(s) + ')' });
        pg.appendChild(svgEl('path', {
          d: 'M0,0 C-5,-8 -9,-12 -9,-18 A9,9 0 1 1 9,-18 C9,-12 5,-8 0,0Z',
          fill: '#2c4a7a', stroke: '#fff', 'stroke-width': 1.5
        }));
        pg.appendChild(svgEl('circle', { cx: 0, cy: -18, r: 3.5, fill: '#fff' }));
        overlay.appendChild(pg);
      }
    }

    function render() {
      var b = baseSize();
      var vw = b.w / view.z, vh = b.h / view.z;
      var laidOut = box.clientWidth > 0;
      if (centered) { // пока не двигали вручную — центр всегда считаем заново по обрезке региона
        var rc = regionById(region);
        view.cx = (px(rc.lon[0]) + px(rc.lon[1])) / 2;
        view.cy = (py(rc.lat[0]) + py(rc.lat[1])) / 2;
      }
      var ccx = clampAxis(view.cx, vw / 2, D.W), ccy = clampAxis(view.cy, vh / 2, D.H);
      if (laidOut && !centered) { view.cx = ccx; view.cy = ccy; } // без размеров рамки не фиксируем результат
      view.cx0 = ccx; view.cy0 = ccy;
      view.vx = ccx - vw / 2; view.vy = ccy - vh / 2;
      view.vw = vw; view.vh = vh;
      svg.setAttribute('viewBox', fmt(view.vx) + ' ' + fmt(view.vy) + ' ' + fmt(vw) + ' ' + fmt(vh));
      svg.style.touchAction = view.z > 1 ? 'none' : 'pan-y';
      var s = vw / (box.clientWidth || 360);
      // зона под кнопками зума (+4 px) — подписи океанов туда не ставим
      var zr = zoomEl.getBoundingClientRect(), br = box.getBoundingClientRect(), forbid = null;
      if (zr.width && br.width) {
        forbid = {
          x0: view.vx + (zr.left - br.left - 4) * s, x1: view.vx + (zr.right - br.left + 4) * s,
          y0: view.vy + (zr.top - br.top - 4) * s, y1: view.vy + (zr.bottom - br.top + 4) * s
        };
      }
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
            if (vis && forbid && bb.x < forbid.x1 && bb.x + bb.width > forbid.x0 &&
                bb.y < forbid.y1 && bb.y + bb.height > forbid.y0) vis = false;
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
      changeCbs.forEach(function (f) { f(); });
    }
    function setRegion(id) {
      region = id;
      var r = regionById(id);
      view.z = 1;
      centered = true;
      view.cx = (px(r.lon[0]) + px(r.lon[1])) / 2;
      view.cy = (py(r.lat[0]) + py(r.lat[1])) / 2;
      render();
    }
    function setZoom(z) {
      view.z = z;
      render();
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
        if (centered) { view.cx = view.cx0; view.cy = view.cy0; centered = false; }
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
      if (!r.width || !r.height || !opts.onTap) return;
      opts.onTap(view.vx + (e.clientX - r.left) / r.width * view.vw,
                 view.vy + (e.clientY - r.top) / r.height * view.vh);
    });
    svg.addEventListener('pointercancel', function () { ptr = null; });

    // ----- интерфейс -----
    var chips = REGIONS.map(function (r) {
      var b = App.el('button', { type: 'button', class: 'map-chip', text: r.name });
      b.addEventListener('click', function () { setRegion(r.id); });
      return { id: r.id, btn: b };
    });
    var chipsEl = App.el('div', { class: 'map-chips' }, chips.map(function (ch) { return ch.btn; }));
    var zoomOut = App.el('button', { type: 'button', class: 'map-zoom-btn', text: '−', 'aria-label': 'Отдалить' });
    var zoomIn = App.el('button', { type: 'button', class: 'map-zoom-btn', text: '+', 'aria-label': 'Приблизить' });
    zoomOut.addEventListener('click', function () {
      var i = ZOOMS.indexOf(view.z); if (i > 0) setZoom(ZOOMS[i - 1]);
    });
    zoomIn.addEventListener('click', function () {
      var i = ZOOMS.indexOf(view.z); if (i < ZOOMS.length - 1) setZoom(ZOOMS[i + 1]);
    });
    zoomEl.appendChild(zoomIn);
    zoomEl.appendChild(zoomOut);
    var wrap = App.el('div', { class: 'map-view' }, [chipsEl, box]);

    function onResize() {
      if (!document.body.contains(box)) { window.removeEventListener('resize', onResize); return; }
      render();
    }
    window.addEventListener('resize', onResize);
    // кнопки зума могут сдвинуться (баннер снизу) — перерисовать подписи
    if (window.MutationObserver) {
      new MutationObserver(function () { if (document.body.contains(box)) render(); })
        .observe(zoomEl, { attributes: true, attributeFilter: ['style'] });
    }

    var api = {
      el: wrap, chipsEl: chipsEl, boxEl: box, zoomEl: zoomEl,
      setRegion: setRegion,
      getRegion: function () { return region; },
      // style: 'answer' | 'correct' | 'target' | 'other'
      highlight: function (obj, style) {
        var h = { geom: geometry(obj), style: style, obj: obj };
        highlights.push(h);
        render();
        return {
          remove: function () {
            var i = highlights.indexOf(h);
            if (i >= 0) { highlights.splice(i, 1); render(); }
          },
          setStyle: function (st) { h.style = st; render(); }
        };
      },
      clearHighlights: function () { highlights = []; render(); },
      placePin: function (x, y) { pin = { x: x, y: y }; render(); },
      clearPin: function () { pin = null; render(); },
      // допуск попадания в единицах карты для текущего вида
      tol: function (px14) { return (px14 || 14) * view.vw / (box.clientWidth || 360); },
      // точка карты → пиксели внутри .map-box
      toScreen: function (x, y) {
        return { x: (x - view.vx) / view.vw * box.clientWidth, y: (y - view.vy) / view.vh * box.clientHeight };
      },
      // перерисовать после вставки в документ (размеры известны только там)
      refresh: render,
      onChange: function (f) { changeCbs.push(f); },
      destroy: function () { window.removeEventListener('resize', onResize); }
    };
    setRegion(region);
    setTimeout(function () { if (document.body.contains(box)) render(); }, 0);
    return api;
  }

  App.MapView = {
    create: create,
    REGIONS: REGIONS,
    geometry: geometry,
    distance: distToGeom,
    // [lon, lat] → [x, y] в единицах карты
    toMap: function (lon, lat) { return [px(lon), py(lat)]; }
  };
})();
