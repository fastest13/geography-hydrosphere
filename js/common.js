// Общие помощники и чистая логика (без обращения к DOM при загрузке).
(function (root) {
  'use strict';

  var App = root.App = root.App || {};
  App.modes = App.modes || {};

  // ---------- Случайность ----------
  App.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  App.sample = function (arr, n) {
    return App.shuffle(arr).slice(0, n);
  };

  // ---------- DOM ----------
  App.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'draggable' || k === 'disabled' || k === 'hidden') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };

  App.btn = function (text, cls, onClick) {
    return App.el('button', { type: 'button', class: 'btn ' + (cls || ''), text: text, onclick: onClick });
  };

  // Шапка режима: кнопка «В меню» и заголовок.
  App.modeHeader = function (container, title) {
    container.appendChild(App.el('div', { class: 'mode-head' }, [
      App.btn('← В меню', 'ghost', function () { App.showMenu(); }),
      App.el('h2', { text: title })
    ]));
  };

  // Нижняя липкая панель с кнопками.
  App.bar = function (buttons) {
    return App.el('div', { class: 'bar' }, buttons);
  };

  // Оценка 2..5 по доле верных ответов (чистая функция).
  App.grade = function (correct, total) {
    var r = total ? correct / total : 0;
    if (r >= 0.9) return 5;
    if (r >= 0.7) return 4;
    if (r >= 0.5) return 3;
    return 2;
  };

  App.GRADE_INFO = {
    5: { img: 'images/knight-5.png', phrase: 'Победа! Ты настоящий знаток гидросферы!', alt: 'Мальчик-путешественник в восторге прыгает с глобусом над головой' },
    4: { img: 'images/knight-4.png', phrase: 'Хорошо! Ещё немного — и будет пятёрка.', alt: 'Спокойный мальчик-путешественник с картой и компасом' },
    3: { img: 'images/knight-3.png', phrase: 'Можно лучше… Повтори и попробуй снова.', alt: 'Мальчик-путешественник вздыхает, глядя на смятую карту' },
    2: { img: 'images/knight-2.png', phrase: 'Не сдавайся! Попробуй ещё раз.', alt: 'Грустный мальчик-путешественник сидит рядом со сломанным компасом' }
  };

  // Текст для «Поделиться» (чистая функция).
  App.shareText = function (modeName, grade, correct, total, label) {
    var mode = App.modes && App.modes[modeName];
    var title = mode && mode.title;
    return 'География: гидросфера' + (title ? ' — «' + title + '»' : '') +
      ': оценка ' + grade + ' (' + (label || 'верно').toLowerCase() + ' ' + correct + ' из ' + total + ') \uD83C\uDF0D';
  };

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) {}
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  // Копирует текст; возвращает Promise<boolean>.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        return navigator.clipboard.writeText(text).then(function () { return true; },
          function () { return legacyCopy(text); });
      } catch (e) { /* падаем на запасной вариант */ }
    }
    return Promise.resolve(legacyCopy(text));
  }

  // Нативное меню «Поделиться» или копирование в буфер.
  function shareResult(btn, text) {
    var url = '';
    if (location.protocol === 'http:' || location.protocol === 'https:') url = location.origin + location.pathname.replace(/index\.html$/, '');
    var full = url ? text + ' ' + url : text;

    function flash() {
      clearTimeout(btn._timer);
      btn.textContent = 'Скопировано ✓';
      btn._timer = setTimeout(function () { btn.textContent = '↗ Поделиться'; }, 2000);
    }
    function fallback() {
      copyText(full).then(function (ok) {
        if (ok) flash();
        else window.prompt('Скопируйте результат:', full);
      });
    }

    if (navigator.share) {
      // Ссылку кладём в сам текст: многие приложения при отдельном url отбрасывают text, и оценка теряется.
      // title не передаём: текст уже начинается с названия, иначе оно повторяется дважды.
      var data = { text: full };
      try {
        navigator.share(data).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          fallback();
        });
      } catch (e) {
        fallback();
      }
    } else {
      fallback();
    }
  }

  App.renderResultHeader = function (container, correct, total, label) {
    var grade = App.grade(correct, total);
    var info = App.GRADE_INFO[grade];
    var cls = grade >= 4 ? 'good' : (grade === 3 ? 'mid' : 'low');
    var text = App.shareText(App.currentMode, grade, correct, total, label);
    var shareBtn = App.el('button', { type: 'button', class: 'btn share-btn', text: '↗ Поделиться' });
    shareBtn.addEventListener('click', function () {
      if (App.track) App.track('share', { mode: App.currentMode });
      shareResult(shareBtn, text);
    });
    if (App.track) App.track('result', { mode: App.currentMode, grade: grade });
    var box = App.el('div', { class: 'result ' + cls + ' grade-' + grade }, [
      App.el('img', { class: 'result-knight', src: info.img, alt: info.alt }),
      App.el('div', { class: 'result-body' }, [
        App.el('div', { class: 'result-top' }, [
          App.el('div', { class: 'result-grade', text: 'Оценка: ' + grade }),
          shareBtn
        ]),
        App.el('div', { class: 'result-score', text: (label || 'Верно') + ' ' + correct + ' из ' + total }),
        App.el('div', { class: 'result-phrase', text: info.phrase })
      ])
    ]);
    container.appendChild(box);
    return box;
  };

  App.scrollTo = function (node) {
    try { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { window.scrollTo(0, 0); }
  };

  App.showMenu = function () {
    var menu = document.getElementById('menu');
    var box = document.getElementById('mode');
    box.textContent = '';
    box.hidden = true;
    menu.hidden = false;
    if (location.hash) location.hash = '';
    window.scrollTo(0, 0);
  };

  App.openMode = function (name) {
    var mode = App.modes[name];
    if (!mode) { App.showMenu(); return; }
    App.currentMode = name;
    if (App.track) App.track('mode_open', { mode: name });
    var box = document.getElementById('mode');
    document.getElementById('menu').hidden = true;
    box.hidden = false;
    box.textContent = '';
    window.scrollTo(0, 0);
    mode.start(box);
  };

  // ---------- Общий движок викторины (режим «Выбери определение») ----------
  // opts: { container, title, questions, restart }
  // question: { prompt, promptClass, options: [{ text, review, correct }], media?: () => Node, mountOptions?: (optBox, nextBtn) => boolean, onAnswer?: (option, correct) => void }
  App.runQuiz = function (opts) {
    var c = opts.container, el = App.el;
    var questions = opts.questions, total = questions.length;
    var idx = 0, score = 0, mistakes = [];

    function showQuestion() {
      c.textContent = '';
      App.modeHeader(c, opts.title);
      var q = questions[idx];
      var answered = false;
      var optBox = el('div', { class: 'options' });
      var nextBtn = App.btn(idx === total - 1 ? 'Результат' : 'Далее', 'primary', function () {
        idx++;
        if (idx >= total) showResult(); else showQuestion();
        window.scrollTo(0, 0);
      });
      nextBtn.hidden = true;

      var buttons = q.options.map(function (o) {
        var b = el('button', { type: 'button', class: 'option', text: o.text });
        b.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          buttons.forEach(function (bb, i) {
            bb.classList.add('locked');
            if (q.options[i].correct) bb.classList.add('correct');
          });
          if (o.correct) score++;
          else {
            b.classList.add('wrong');
            mistakes.push({
              prompt: q.prompt,
              chosen: o.review || o.text,
              correct: (q.options.filter(function (x) { return x.correct; })[0]).review ||
                       (q.options.filter(function (x) { return x.correct; })[0]).text
            });
          }
          if (q.onAnswer) q.onAnswer(o, !!o.correct);
          nextBtn.hidden = false;
          try { nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        });
        optBox.appendChild(b);
        return b;
      });

      var mediaNode = q.media ? q.media() : null;
      // q.mountOptions(optBox, nextBtn) → true, если режим сам разместил варианты и кнопку (тогда нижняя панель не нужна)
      var custom = q.mountOptions ? !!q.mountOptions(optBox, nextBtn) : false;
      c.appendChild(el('div', { class: 'card quiz-card' }, [
        el('div', { class: 'progress-line' }, [
          el('span', { text: 'Вопрос ' + (idx + 1) + ' из ' + total }),
          el('span', { class: 'progress-score', text: 'Верно: ' + score })
        ]),
        el('div', { class: 'progress-track' }, [
          el('div', { class: 'progress-fill', style: 'width:' + Math.round(idx / total * 100) + '%' })
        ]),
        el('div', { class: 'prompt ' + (q.promptClass || ''), text: q.prompt }),
        mediaNode,
        custom ? null : optBox
      ]));
      if (!custom) c.appendChild(App.bar([nextBtn]));
    }

    function showResult() {
      c.textContent = '';
      App.modeHeader(c, opts.title);
      var head = App.renderResultHeader(c, score, total);
      if (!mistakes.length) {
        c.appendChild(el('div', { class: 'card note-ok', text: 'Ошибок нет — отличный результат!' }));
      } else {
        c.appendChild(el('h3', { class: 'section-title', text: 'Ошибки (' + mistakes.length + ')' }));
        mistakes.forEach(function (m) {
          c.appendChild(el('div', { class: 'card mistake' }, [
            el('div', { class: 'mistake-prompt', text: m.prompt }),
            el('div', { class: 'answer wrong-text', text: 'Ваш ответ: ' + m.chosen }),
            el('div', { class: 'answer right-text', text: 'Правильно: ' + m.correct })
          ]));
        });
      }
      c.appendChild(App.bar([
        App.btn('Ещё раз', 'primary', opts.restart),
        App.btn('В меню', '', function () { App.showMenu(); })
      ]));
      App.scrollTo(head);
    }

    showQuestion();
  };
})(typeof window !== 'undefined' ? window : this);
