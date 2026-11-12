// TypeCut Pro 랜딩 — 대본을 지우면 타임라인이 닫히는 축소 데모. 대본은 합성 예시다.
(function () {
  var DATA = {
    ko: {
      // '*'로 끝나는 낱말은 군소리. 숫자는 문장 뒤 무음(초). retake는 버린 테이크 줄.
      lines: [
        ['원두를 직접 볶기 시작한 게 그러니까* 삼 년 전 겨울이었고요.', 0.7],
        ['아 잠깐만요, 다시 할게요.', 1.9],
        ['원두를 직접 볶기 시작한 건 삼 년 전 겨울입니다.', 0.8],
        ['어* 처음에는 음* 솔직히 하루에 열 잔도 못 팔았어요.', 1.1],
        ['그래서 메뉴를 전부 다시 짰습니다.', 1.6],
        ['지금은 어* 주말이면 줄을 서서 기다리는 분들이 생겼어요.', 1.3],
        ['결국 맛은 음* 숫자가 아니라 매일 같은 시간에 문을 여는 데서 나오더라고요.', 0]
      ],
      retake: 1,
      start: '버린 테이크 한 줄을 골라 두었습니다. ⌫를 누르면 영상에서 잘립니다.',
      startTouch: '버린 테이크 한 줄을 골라 두었습니다. ‘영상에서 자르기’를 눌러 보세요.',
      idle: '낱말을 눌러 고르고 ⌫를 눌러 보세요. 끌면 여러 낱말이 골라집니다.',
      idleTouch: '낱말을 누르고, 다른 낱말을 누르면 그 사이가 골라집니다.',
      picked: function (n) { return '낱말 ' + n + '개를 골랐습니다. ⌫를 누르면 영상에서 잘립니다.'; },
      pickedTouch: function (n) { return '낱말 ' + n + '개를 골랐습니다. ‘영상에서 자르기’를 누르세요.'; },
      saved: function (s) { return s + '초가 잘렸습니다. ⌘Z로 되돌릴 수 있습니다.'; },
      savedTouch: function (s) { return s + '초가 잘렸습니다. ‘되돌리기’로 되살릴 수 있습니다.'; },
      nothing: '더 자를 것이 없습니다.',
      undone: '되돌렸습니다.',
      auto: '방금 버린 테이크가 잘렸습니다. 이제 직접 해 보세요.'
    },
    en: {
      lines: [
        ['We started roasting our own beans, like* three winters ago, and.', 0.7],
        ['Sorry, hold on, let me say that again.', 1.9],
        ['We started roasting our own beans three winters ago.', 0.8],
        ['Um* at first, uh* honestly we sold maybe ten cups a day.', 1.1],
        ['So we rebuilt the whole menu.', 1.6],
        ['Now, um* on weekends people actually line up outside.', 1.3],
        ['In the end, uh* taste comes from opening the door at the same time every day.', 0]
      ],
      retake: 1,
      start: 'One discarded take is already selected. Press ⌫ to cut it from the video.',
      startTouch: 'One discarded take is already selected. Tap “Cut from video”.',
      idle: 'Click a word, then press ⌫. Drag to select several.',
      idleTouch: 'Tap a word, then tap another to select everything between them.',
      picked: function (n) { return n + (n === 1 ? ' word' : ' words') + ' selected. Press ⌫ to cut from the video.'; },
      pickedTouch: function (n) { return n + (n === 1 ? ' word' : ' words') + ' selected. Tap “Cut from video”.'; },
      saved: function (s) { return s + 's cut. Press ⌘Z to undo.'; },
      savedTouch: function (s) { return s + 's cut. Tap “Undo” to bring it back.'; },
      nothing: 'Nothing left to cut.',
      undone: 'Undone.',
      auto: 'The discarded take was just cut. Now try it yourself.'
    }
  };

  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function fmt(t) {
    t = Math.max(0, Math.round(t * 10) / 10);
    var m = Math.floor(t / 60), s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  // 쌍점·마침표는 숫자와 같은 점으로 그린다(도트 글꼴은 숫자만 자체 호스팅한다)
  function led(el, text) {
    el.textContent = '';
    text.split(/([:.])/).forEach(function (part) {
      if (part === ':' || part === '.') {
        var s = document.createElement('span');
        s.className = 'sep ' + (part === ':' ? 'colon' : 'dot');
        s.setAttribute('aria-hidden', 'true');
        el.appendChild(s);
      } else if (part) el.appendChild(document.createTextNode(part));
    });
    el.setAttribute('aria-label', text);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.led'), function (el) { if (/[:.]/.test(el.textContent)) led(el, el.textContent); });
  function bar(el, h, cls) { var b = document.createElement('i'); if (cls) b.className = cls; b.style.height = h + '%'; el.appendChild(b); }
  function bars(el, n, rand, lo, hi) { for (var i = 0; i < n; i++) bar(el, Math.round(lo + rand() * (hi - lo))); }

  // 무음 전/후 예시 파형 — 같은 소리에서 무음만 뺀 것
  (function () {
    var rand = rng(7), groups = [];
    for (var g = 0; g < 9; g++) {
      var voice = [], n = 9 + Math.floor(rand() * 8);
      for (var i = 0; i < n; i++) voice.push(Math.round(22 + rand() * 70));
      groups.push({ voice: voice, quiet: g < 8 ? 2 + Math.floor(rand() * 4) : 0 });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-wave]'), function (el) {
      var after = el.getAttribute('data-wave') === 'after';
      groups.forEach(function (gr) {
        gr.voice.forEach(function (h) { bar(el, h); });
        if (!after) for (var k = 0; k < gr.quiet; k++) bar(el, 3, 'q');
      });
    });
  })();

  var demo = document.getElementById('demo');
  if (!demo) return;
  var T = DATA[demo.getAttribute('data-lang')] || DATA.ko;
  var script = document.getElementById('script'), track = document.getElementById('track');
  var hint = document.getElementById('hint');
  var ledOrig = document.getElementById('ledOrig'), ledCut = document.getElementById('ledCut'), ledSaved = document.getElementById('ledSaved');
  var btn = {};
  Array.prototype.forEach.call(demo.querySelectorAll('[data-act]'), function (b) { btn[b.getAttribute('data-act')] = b; });
  var mq = window.matchMedia || function () { return { matches: false }; };
  var reduce = mq('(prefers-reduced-motion: reduce)').matches;
  var coarse = mq('(pointer: coarse)').matches;
  function t(key) { return (coarse && T[key + 'Touch']) || T[key]; }

  // 조각: 낱말과 무음. words[]는 낱말 조각의 segs 색인. 길이는 0.1초 단위(전광판 셈이 맞게).
  var segs = [], words = [], lineOf = [], rand = rng(41), total = 0;
  T.lines.forEach(function (line, li) {
    var p = document.createElement('p');
    line[0].split(' ').forEach(function (raw) {
      var filler = raw.slice(-1) === '*', text = filler ? raw.slice(0, -1) : raw;
      var dur = Math.round((filler ? 0.5 : 0.16 + 0.085 * text.replace(/[.,]/g, '').length) * 10) / 10;
      var el = document.createElement('span');
      el.className = 'w' + (filler ? ' f' : '');
      el.textContent = text;
      el.setAttribute('data-w', words.length);
      p.appendChild(el);
      p.appendChild(document.createTextNode(' '));
      words.push(segs.length); lineOf.push(li);
      segs.push({ dur: dur, filler: filler, gap: false, el: el, cut: false });
      total += dur;
    });
    script.appendChild(p);
    if (line[1] > 0) { segs.push({ dur: line[1], gap: true, cut: false }); total += line[1]; }
  });
  total = Math.round(total * 10) / 10;
  segs.forEach(function (s) {
    var el = document.createElement('div');
    el.className = 'seg' + (s.gap ? ' gap' : '');
    el.style.width = (s.dur / total * 100) + '%';
    if (s.gap) bars(el, Math.max(2, Math.round(s.dur * 5)), rand, 3, 5);
    else bars(el, Math.max(2, Math.round(s.dur * 6)), rand, s.filler ? 14 : 26, s.filler ? 46 : 94);
    track.appendChild(el);
    s.tl = el;
  });

  var anchor = -1, caret = -1, history = [], shown = total, timer = null, touched = false;

  function range() { return anchor < 0 ? null : [Math.min(anchor, caret), Math.max(anchor, caret)]; }
  function remaining() { return segs.reduce(function (a, s) { return a + (s.cut ? 0 : s.dur); }, 0); }
  function paintLed(v) { led(ledCut, fmt(v)); led(ledSaved, fmt(total - v)); }
  // 고른 낱말과, 그 사이·바로 뒤에 통째로 든 무음
  function selectionSegs() {
    var r = range(); if (!r) return [];
    var a = words[r[0]], b = words[r[1]], idx = [];
    for (var i = a; i <= b; i++) idx.push(i);
    var wholeLines = (a === 0 || segs[a - 1].gap) && b + 1 < segs.length && segs[b + 1].gap;
    if (wholeLines) idx.push(b + 1);
    return idx;
  }
  function paint() {
    var r = range(), n = 0, sel = {};
    selectionSegs().forEach(function (i) { sel[i] = true; });
    words.forEach(function (si, wi) {
      var s = segs[si], on = !!r && wi >= r[0] && wi <= r[1];
      if (on && !s.cut) n++;
      s.el.classList.toggle('sel', on);
      s.el.classList.toggle('caret', wi === caret && !on);
      s.el.classList.toggle('cut', s.cut);
    });
    segs.forEach(function (s, i) {
      s.tl.classList.toggle('cut', s.cut);
      s.tl.classList.toggle('sel', !!sel[i] && !s.cut);
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
  function say(text) { hint.textContent = text; }
  function apply(idx, msg) {
    idx = idx.filter(function (i) { return !segs[i].cut; });
    if (!idx.length) { say(T.nothing); return; }
    var d = 0;
    idx.forEach(function (i) { segs[i].cut = true; d += segs[i].dur; });
    history.push(idx);
    anchor = -1;
    paint();
    say(msg || t('saved')(d.toFixed(1)));
  }
  function cutSelection(msg) { var idx = selectionSegs(); if (idx.length) apply(idx, msg); }
  function undo() {
    var last = history.pop(); if (!last) return;
    last.forEach(function (i) { segs[i].cut = false; });
    paint(); say(T.undone);
  }
  function select(a, c) {
    anchor = a; caret = c;
    var n = paint();
    say(n ? t('picked')(n) : t('idle'));
  }
  function clear() { anchor = -1; paint(); say(t('idle')); }
  // 버튼을 누른 뒤에도 ⌘Z·⌫가 듣도록 초점을 대본으로 돌려놓는다
  function refocus() { try { script.focus({ preventScroll: true }); } catch (e) { script.focus(); } }

  var dragging = false, tap = null;
  // 포인터로 누른 뒤 돌려준 초점에는 테두리를 그리지 않는다 — 키보드를 쓰면 다시 보인다
  function quiet(on) { script.classList.toggle('quiet', on); }
  function wordAt(e) { var el = e.target.closest ? e.target.closest('.w') : null; return el ? +el.getAttribute('data-w') : -1; }
  script.addEventListener('pointerdown', function (e) {
    var w = wordAt(e);
    if (e.pointerType === 'touch') { tap = w < 0 ? null : { w: w, x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
    touched = true; quiet(true);
    if (w < 0) { clear(); return; }
    dragging = true;
    select(e.shiftKey && caret >= 0 ? (anchor < 0 ? caret : anchor) : w, w);
  });
  script.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var w = el && el.closest ? el.closest('.w') : null;
    if (w && +w.getAttribute('data-w') !== caret) select(anchor, +w.getAttribute('data-w'));
  });
  function endDrag() { dragging = false; }
  // 터치: 첫 낱말, 그다음 낱말을 차례로 톡 눌러 범위를 고른다. 밀면(10px 넘게) 아무 일도 없다
  script.addEventListener('pointerup', function (e) {
    var t0 = tap; tap = null;
    if (!t0 || e.pointerId !== t0.id || Math.abs(e.clientX - t0.x) > 10 || Math.abs(e.clientY - t0.y) > 10) return;
    touched = true; quiet(true);
    if (anchor >= 0 && anchor === caret && t0.w !== anchor) select(anchor, t0.w);
    else select(t0.w, t0.w);
  });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  demo.addEventListener('keydown', function (e) {
    var k = e.key, inScript = e.target === script;
    quiet(false);
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { touched = true; undo(); e.preventDefault(); return; }
    if (!inScript) return;
    touched = true;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      var next = Math.max(0, Math.min(words.length - 1, (caret < 0 ? 0 : caret + (k === 'ArrowRight' ? 1 : -1))));
      if (e.shiftKey) select(anchor < 0 ? Math.max(0, caret) : anchor, next);
      else { anchor = -1; caret = next; paint(); say(t('idle')); }
      e.preventDefault();
    } else if (k === 'Backspace' || k === 'Delete') {
      if (anchor < 0 && caret >= 0) anchor = caret;
      cutSelection(); e.preventDefault();
    } else if (k === 'Escape') clear();
  });
  function onBtn(name, fn) { btn[name].addEventListener('click', function (e) { touched = true; fn(); quiet(e.detail > 0); refocus(); }); }
  onBtn('cut', function () { cutSelection(); });
  onBtn('undo', undo);
  onBtn('fillers', function () { apply(segs.map(function (s, i) { return s.filler ? i : -1; }).filter(function (i) { return i >= 0; })); });
  onBtn('silence', function () { apply(segs.map(function (s, i) { return s.gap ? i : -1; }).filter(function (i) { return i >= 0; })); });

  led(ledOrig, fmt(total));
  paintLed(total);

  // 처음부터 버린 테이크 줄을 골라 둔다 — 자르기 버튼이 살아 있어야 만질 수 있는 것으로 읽힌다
  var first = lineOf.indexOf(T.retake), last = lineOf.lastIndexOf(T.retake);
  if (first >= 0) { anchor = first; caret = last; paint(); }
  say(t('start'));

  // 한 번만: 타임라인이 보이고 아무도 건드리지 않았으면 골라 둔 줄을 잘라 보인다
  if (!reduce && first >= 0 && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(function () { if (!touched) cutSelection(T.auto); }, 1800);
    }, { threshold: 0.9 });
    io.observe(track);
  }

  // 언어 선택 기억
  Array.prototype.forEach.call(document.querySelectorAll('a[data-lang]'), function (a) {
    a.addEventListener('click', function () { try { localStorage.setItem('fcpa-lang', a.getAttribute('data-lang')); } catch (e) {} });
  });
})();
