// TypeCut Pro 랜딩 — 대본을 지우면 타임라인이 닫히는 축소 데모. 대본은 합성 예시다.
(function () {
  var DATA = {
    ko: {
      // '*'로 끝나는 낱말은 군소리. 숫자는 문장 뒤 무음(초).
      lines: [
        ['어* 처음 가게를 열었을 때는 음* 솔직히 하루에 열 잔도 못 팔았어요.', 1.1],
        ['그래서 메뉴를 전부 다시 짰습니다.', 1.6],
        ['원두를 직접 볶기 시작한 게 그러니까* 삼 년 전 겨울이었고요.', 0.7],
        ['아 잠깐만요, 다시 할게요.', 1.9],
        ['원두를 직접 볶기 시작한 건 삼 년 전 겨울입니다.', 0.8],
        ['지금은 어* 주말이면 줄을 서서 기다리는 분들이 생겼어요.', 1.3],
        ['결국 맛은 음* 숫자가 아니라 매일 같은 시간에 문을 여는 데서 나오더라고요.', 0]
      ],
      idle: '낱말을 눌러 고르고 ⌫를 눌러 보세요. 끌면 여러 낱말이 골라집니다.',
      picked: function (n) { return '낱말 ' + n + '개를 골랐습니다. ⌫를 누르면 영상에서 잘립니다.'; },
      saved: function (s) { return s + '초가 잘렸습니다. ⌘Z로 되돌릴 수 있습니다.'; },
      nothing: '더 자를 것이 없습니다.',
      undone: '되돌렸습니다.',
      auto: '방금 군소리 하나가 잘렸습니다. 이제 직접 해 보세요.'
    },
    en: {
      lines: [
        ['Um* when we first opened, uh* honestly we sold maybe ten cups a day.', 1.1],
        ['So we rebuilt the whole menu.', 1.6],
        ['We started roasting our own beans, like* three winters ago, and.', 0.7],
        ['Sorry, hold on, let me say that again.', 1.9],
        ['We started roasting our own beans three winters ago.', 0.8],
        ['Now, um* on weekends people actually line up outside.', 1.3],
        ['In the end, uh* taste comes from opening the door at the same time every day.', 0]
      ],
      idle: 'Click a word, then press ⌫. Drag to select several.',
      picked: function (n) { return n + (n === 1 ? ' word' : ' words') + ' selected. Press ⌫ to cut them from the video.'; },
      saved: function (s) { return s + 's cut. Press ⌘Z to undo.'; },
      nothing: 'Nothing left to cut.',
      undone: 'Undone.',
      auto: 'One filler word was just cut. Now try it yourself.'
    }
  };

  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function fmt(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  // 도트 글꼴의 쌍점·마침표는 모양이 달라 본문 글꼴로 찍는다
  function led(el, text) {
    el.textContent = '';
    text.split(/([:.])/).forEach(function (part) {
      if (part === ':' || part === '.') { var s = document.createElement('span'); s.className = 'sep'; s.textContent = part; el.appendChild(s); }
      else if (part) el.appendChild(document.createTextNode(part));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.led'), function (el) { if (/[:.]/.test(el.textContent)) led(el, el.textContent); });
  function bars(el, n, rand, lo, hi) {
    for (var i = 0; i < n; i++) {
      var b = document.createElement('i');
      b.style.height = Math.round(lo + rand() * (hi - lo)) + '%';
      el.appendChild(b);
    }
  }

  // 무음 전/후 예시 파형
  Array.prototype.forEach.call(document.querySelectorAll('[data-wave]'), function (el) {
    var rand = rng(7), after = el.getAttribute('data-wave') === 'after';
    for (var g = 0; g < 9; g++) {
      bars(el, 9 + Math.floor(rand() * 8), rand, 22, 92);
      if (!after && g < 8) {
        var q = 2 + Math.floor(rand() * 4);
        for (var k = 0; k < q; k++) { var b = document.createElement('i'); b.className = 'q'; b.style.height = '3%'; el.appendChild(b); }
      }
    }
  });

  var demo = document.getElementById('demo');
  if (!demo) return;
  var T = DATA[demo.getAttribute('data-lang')] || DATA.ko;
  var script = document.getElementById('script'), track = document.getElementById('track');
  var hint = document.getElementById('hint');
  var ledOrig = document.getElementById('ledOrig'), ledCut = document.getElementById('ledCut'), ledSaved = document.getElementById('ledSaved');
  var btn = {};
  Array.prototype.forEach.call(demo.querySelectorAll('[data-act]'), function (b) { btn[b.getAttribute('data-act')] = b; });
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 조각: 낱말과 무음. words[]는 낱말 조각의 segs 색인.
  var segs = [], words = [], rand = rng(41), total = 0;
  T.lines.forEach(function (line) {
    var p = document.createElement('p');
    line[0].split(' ').forEach(function (raw) {
      var filler = raw.slice(-1) === '*', text = filler ? raw.slice(0, -1) : raw;
      var dur = filler ? 0.5 : 0.16 + 0.085 * text.replace(/[.,]/g, '').length;
      var el = document.createElement('span');
      el.className = 'w' + (filler ? ' f' : '');
      el.textContent = text;
      el.setAttribute('data-w', words.length);
      p.appendChild(el);
      p.appendChild(document.createTextNode(' '));
      words.push(segs.length);
      segs.push({ dur: dur, filler: filler, gap: false, el: el, cut: false });
      total += dur;
    });
    script.appendChild(p);
    if (line[1] > 0) { segs.push({ dur: line[1], gap: true, cut: false }); total += line[1]; }
  });
  segs.forEach(function (s) {
    var t = document.createElement('div');
    t.className = 'seg' + (s.gap ? ' gap' : '');
    t.style.width = (s.dur / total * 100) + '%';
    if (s.gap) bars(t, Math.max(2, Math.round(s.dur * 5)), rand, 3, 5);
    else bars(t, Math.max(2, Math.round(s.dur * 6)), rand, s.filler ? 14 : 26, s.filler ? 46 : 94);
    track.appendChild(t);
    s.tl = t;
  });

  var anchor = -1, caret = -1, history = [], shown = total, timer = null, touched = false;

  function range() { return anchor < 0 ? null : [Math.min(anchor, caret), Math.max(anchor, caret)]; }
  function remaining() { return segs.reduce(function (a, s) { return a + (s.cut ? 0 : s.dur); }, 0); }
  function paintLed(v) { led(ledCut, fmt(v)); led(ledSaved, fmt(total - v)); }
  function paint() {
    var r = range(), n = 0;
    words.forEach(function (si, wi) {
      var s = segs[si], on = !!r && wi >= r[0] && wi <= r[1];
      if (on && !s.cut) n++;
      s.el.classList.toggle('sel', on);
      s.el.classList.toggle('caret', wi === caret && !on);
      s.el.classList.toggle('cut', s.cut);
    });
    segs.forEach(function (s, i) {
      var wi = words.indexOf(i);
      s.tl.classList.toggle('cut', s.cut);
      s.tl.classList.toggle('sel', !!r && wi >= r[0] && wi <= r[1] && !s.cut);
    });
    btn.cut.disabled = n === 0;
    btn.undo.disabled = history.length === 0;
    var target = remaining();
    clearInterval(timer);
    if (reduce || Math.abs(target - shown) < 0.05) { shown = target; paintLed(shown); }
    else {
      var from = shown, step = 0;
      timer = setInterval(function () {
        step++; shown = from + (target - from) * (step / 8); paintLed(shown);
        if (step >= 8) { clearInterval(timer); shown = target; paintLed(shown); }
      }, 36);
    }
    return n;
  }
  function say(t) { hint.textContent = t; }
  function apply(idx, msg) {
    idx = idx.filter(function (i) { return !segs[i].cut; });
    if (!idx.length) { say(T.nothing); return; }
    var d = 0;
    idx.forEach(function (i) { segs[i].cut = true; d += segs[i].dur; });
    history.push(idx);
    anchor = -1;
    paint();
    say(msg || T.saved(d.toFixed(1)));
  }
  function cutSelection() {
    var r = range(); if (!r) return;
    var idx = [];
    for (var w = r[0]; w <= r[1]; w++) idx.push(words[w]);
    // 고른 범위 안에 통째로 든 무음도 함께 자른다
    for (var i = words[r[0]]; i <= words[r[1]]; i++) if (segs[i].gap) idx.push(i);
    apply(idx);
  }
  function undo() {
    var last = history.pop(); if (!last) return;
    last.forEach(function (i) { segs[i].cut = false; });
    paint(); say(T.undone);
  }
  function select(a, c) {
    anchor = a; caret = c;
    var n = paint();
    say(n ? T.picked(n) : T.idle);
  }

  var dragging = false;
  function wordAt(e) { var el = e.target.closest ? e.target.closest('.w') : null; return el ? +el.getAttribute('data-w') : -1; }
  script.addEventListener('pointerdown', function (e) {
    var w = wordAt(e); touched = true;
    if (w < 0) { anchor = -1; paint(); say(T.idle); return; }
    dragging = true;
    select(e.shiftKey && caret >= 0 ? (anchor < 0 ? caret : anchor) : w, w);
  });
  script.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var w = el && el.closest ? el.closest('.w') : null;
    if (w && +w.getAttribute('data-w') !== caret) select(anchor, +w.getAttribute('data-w'));
  });
  window.addEventListener('pointerup', function () { dragging = false; });
  script.addEventListener('keydown', function (e) {
    touched = true;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      var next = Math.max(0, Math.min(words.length - 1, (caret < 0 ? 0 : caret + (k === 'ArrowRight' ? 1 : -1))));
      if (e.shiftKey) select(anchor < 0 ? Math.max(0, caret) : anchor, next);
      else { anchor = -1; caret = next; paint(); say(T.idle); }
      e.preventDefault();
    } else if (k === 'Backspace' || k === 'Delete') {
      if (anchor < 0 && caret >= 0) anchor = caret;
      cutSelection(); e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { undo(); e.preventDefault(); }
    else if (k === 'Escape') { anchor = -1; paint(); say(T.idle); }
  });
  btn.cut.addEventListener('click', function () { touched = true; cutSelection(); });
  btn.undo.addEventListener('click', function () { touched = true; undo(); });
  btn.fillers.addEventListener('click', function () {
    touched = true;
    apply(segs.map(function (s, i) { return s.filler ? i : -1; }).filter(function (i) { return i >= 0; }));
  });
  btn.silence.addEventListener('click', function () {
    touched = true;
    apply(segs.map(function (s, i) { return s.gap ? i : -1; }).filter(function (i) { return i >= 0; }));
  });

  led(ledOrig, fmt(total));
  paintLed(total);

  // 한 번만: 아무도 건드리지 않았으면 첫 군소리를 골랐다가 잘라 보인다
  if (!reduce) {
    setTimeout(function () {
      if (touched) return;
      select(0, 0); say(T.idle);
      setTimeout(function () {
        if (touched) return;
        apply([words[0]], T.auto);
      }, 900);
    }, 1500);
  }

  // 언어 선택 기억
  Array.prototype.forEach.call(document.querySelectorAll('a[data-lang]'), function (a) {
    a.addEventListener('click', function () { try { localStorage.setItem('fcpa-lang', a.getAttribute('data-lang')); } catch (e) {} });
  });
})();
