// Режим 1: соедини термины с определениями.
(function () {
  'use strict';

  App.modes.match = {
    title: 'Соедини термины с определениями',
    start: function (c) {
      var el = App.el;
      var N = window.TERMS.length;
      var terms = App.sample(window.TERMS, N);
      // slots[row] = индекс термина, чьё определение стоит в строке row
      var slots = App.shuffle(terms.map(function (_, i) { return i; }));
      var sel = null;          // { kind: 'term' | 'def', row }
      var checked = false;
      var busy = false;        // идёт анимация — клики игнорируются
      var anim = null;         // { finish } текущей анимации
      var termCells = [], defCells = [], defTexts = [];
      var LIFT_MS = 150, FLY_MS = 400, LAND_MS = 200, PULSE_MS = 600;

      c.textContent = '';
      App.modeHeader(c, App.modes.match.title);
      c.appendChild(el('p', { class: 'hint', text: 'Нажми на термин, затем на определение — оно перелетит напротив термина. ' +
        'Два определения можно поменять местами.' }));
      var resultBox = el('div');
      c.appendChild(resultBox);

      var grid = el('div', { class: 'match-grid' });
      c.appendChild(grid);

      function swap(a, b) {
        var t = slots[a]; slots[a] = slots[b]; slots[b] = t;
      }

      function render() {
        for (var r = 0; r < N; r++) {
          defTexts[r].textContent = terms[slots[r]].def;
          var ts = !!sel && sel.kind === 'term' && sel.row === r;
          var ds = !!sel && sel.kind === 'def' && sel.row === r;
          termCells[r].classList.toggle('selected', ts);
          termCells[r].classList.toggle('lifted', ts);
          defCells[r].classList.toggle('selected', ds);
          defCells[r].classList.toggle('lifted', ds);
        }
      }

      function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      // Ждём окончания transition по transitionend, но не дольше ms + запас.
      function waitEnd(cell, ms, cb) {
        var fired = false, timer;
        function fire() {
          if (fired) return;
          fired = true;
          clearTimeout(timer);
          cell.removeEventListener('transitionend', onEnd);
          cb();
        }
        function onEnd(e) { if (e.target === cell && e.propertyName === 'transform') fire(); }
        cell.addEventListener('transitionend', onEnd);
        timer = setTimeout(fire, ms + 80);
        return function cancel() {
          fired = true;
          clearTimeout(timer);
          cell.removeEventListener('transitionend', onEnd);
        };
      }

      function pulse(rows) {
        rows.forEach(function (r) {
          [termCells[r], defCells[r]].forEach(function (cell) {
            cell.classList.remove('just-paired');
            void cell.offsetWidth;
            cell.classList.add('just-paired');
            setTimeout(function () { cell.classList.remove('just-paired'); }, PULSE_MS);
          });
        });
      }

      // Меняет определения строк a и b местами с анимацией:
      // (подъём второй ячейки) -> перелёт (FLIP) -> опускание + подсветка пары.
      // held — уже поднятые ячейки (термин), pulseRows — строки для подсветки,
      // delay — пауза на подъём второй ячейки.
      function runPair(a, b, held, pulseRows, delay) {
        if (reducedMotion()) {
          if (a !== b) swap(a, b);
          sel = null;
          render();
          return;
        }
        busy = true;
        var defA = defCells[a], defB = defCells[b];
        var flying = a === b ? [defA] : [defA, defB];
        var all = held.concat(flying);
        var timer = null, cancelWait = null, swapped = false, landed = false, over = false;

        function hold() {
          all.forEach(function (cl) { cl.classList.add('lifted', 'selected'); });
        }
        function end() {
          if (over) return;
          over = true;
          busy = false;
          anim = null;
        }
        function doLand() {
          if (landed) return;
          landed = true;
          flying.forEach(function (cl) {
            cl.style.transition = '';
            cl.style.transform = '';
            cl.style.zIndex = '';
            cl.classList.remove('flying');
          });
          all.forEach(function (cl) { cl.classList.remove('lifted', 'selected'); });
          pulse(pulseRows);
        }
        function land() {
          doLand();
          timer = setTimeout(end, LAND_MS);
        }
        function fly() {
          var rA = defA.getBoundingClientRect(), rB = defB.getBoundingClientRect();
          if (a !== b) swap(a, b);
          swapped = true;
          sel = null;
          render();
          hold();
          if (a === b) { land(); return; }
          var nA = defA.getBoundingClientRect(), nB = defB.getBoundingClientRect();
          var shifts = [rB.top - nA.top, rA.top - nB.top];
          flying.forEach(function (cl, k) {
            cl.classList.add('flying');
            cl.style.transition = 'none';
            cl.style.transform = 'translate(0, ' + shifts[k] + 'px) scale(1.02)';
          });
          void defA.offsetWidth; // reflow
          flying.forEach(function (cl) {
            cl.style.transition = 'transform ' + FLY_MS + 'ms ease-in-out, box-shadow 180ms ease';
            cl.style.transform = '';  // -> состояние .lifted
          });
          cancelWait = waitEnd(defA, FLY_MS, land);
        }

        anim = {
          finish: function () {
            clearTimeout(timer);
            if (cancelWait) cancelWait();
            if (!swapped) {
              if (a !== b) swap(a, b);
              swapped = true;
              sel = null;
              render();
            }
            doLand();
            end();
          }
        };
        if (delay) timer = setTimeout(fly, delay);
        else fly();
      }

      function termClick(r) {
        if (checked || busy) return;
        if (!sel) sel = { kind: 'term', row: r };
        else if (sel.kind === 'term') sel = sel.row === r ? null : { kind: 'term', row: r };
        else {
          // определение (sel.row) -> термин r
          termCells[r].classList.add('lifted', 'selected');
          runPair(r, sel.row, [termCells[r]], [r], LIFT_MS);
          return;
        }
        render();
      }

      function defClick(r) {
        if (checked || busy) return;
        if (!sel) sel = { kind: 'def', row: r };
        else if (sel.kind === 'term') {
          // термин (sel.row) -> определение r
          defCells[r].classList.add('lifted', 'selected');
          runPair(sel.row, r, [termCells[sel.row]], [sel.row], LIFT_MS);
          return;
        }
        else if (sel.row === r) sel = null;
        else {
          // определение -> определение
          defCells[r].classList.add('lifted', 'selected');
          runPair(sel.row, r, [], [sel.row, r], LIFT_MS);
          return;
        }
        render();
      }

      function onKey(fn) {
        return function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
        };
      }

      for (var i = 0; i < N; i++) {
        (function (r) {
          var tc = el('div', { class: 'cell term-cell', role: 'button', tabindex: '0', text: terms[r].term,
            onclick: function () { termClick(r); }, onkeydown: onKey(function () { termClick(r); }) });
          var dt = el('span', { class: 'def-text' });
          var dc = el('div', { class: 'cell def-cell', role: 'button', tabindex: '0',
            onclick: function () { defClick(r); }, onkeydown: onKey(function () { defClick(r); }) }, [dt]);
          termCells.push(tc); defCells.push(dc); defTexts.push(dt);
          grid.appendChild(tc);
          grid.appendChild(dc);
        })(i);
      }
      render();

      function check() {
        if (anim) anim.finish();
        checked = true;
        sel = null;
        render();
        for (var q = 0; q < N; q++) {
          [termCells[q], defCells[q]].forEach(function (cell) {
            cell.classList.remove('just-paired', 'lifted', 'flying');
          });
        }
        grid.classList.add('locked');
        var correct = 0;
        for (var r = 0; r < N; r++) {
          var ok = slots[r] === r;
          if (ok) correct++;
          defCells[r].removeAttribute('tabindex');
          termCells[r].removeAttribute('tabindex');
          termCells[r].classList.add(ok ? 'ok' : 'bad');
          defCells[r].classList.add(ok ? 'ok' : 'bad');
          if (!ok) {
            defCells[r].appendChild(el('div', { class: 'fix', text: 'Правильно: ' + terms[r].def }));
          }
        }
        resultBox.textContent = '';
        var head = App.renderResultHeader(resultBox, correct, N);
        bar.textContent = '';
        bar.appendChild(App.btn('Ещё раз', 'primary', function () { App.modes.match.start(c); window.scrollTo(0, 0); }));
        bar.appendChild(App.btn('В меню', '', function () { App.showMenu(); }));
        App.scrollTo(head);
      }

      var bar = App.bar([App.btn('Проверить', 'primary', check)]);
      c.appendChild(bar);
    }
  };
})();
