// Режим 2: выбери определение к термину.
(function () {
  'use strict';

  App.modes.terms = {
    title: 'Выбери определение',
    start: function (c) {
      var targets = App.sample(window.TERMS, Math.min(15, window.TERMS.length));
      var questions = targets.map(function (t) {
        var options = App.shuffle([t.def].concat(t.wrong)).map(function (text) {
          return { text: text, correct: text === t.def };
        });
        return { prompt: t.term, promptClass: 'prompt-term', options: options };
      });
      App.runQuiz({
        container: c,
        title: App.modes.terms.title,
        questions: questions,
        restart: function () { App.modes.terms.start(c); window.scrollTo(0, 0); }
      });
    }
  };
})();
