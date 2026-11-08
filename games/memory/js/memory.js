/* ==========================================================================
   记忆翻牌 · 游戏逻辑
   纯 ES5 + IIFE，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：一次翻两张，图案相同即配对消除，不同则延时翻回；翻两次算一步，
        连续配对有连击加分。全部配对完成判胜，困难档倒计时归零判负。
   难度：三档牌数 / 翻回延时 / 时限都不同，参数在 HUD 与参数条里可见。
   存档：按难度分桶，含牌面 / 已配对 / 翻开的两张 / 待决翻回 / 步数 / 用时；
        最高成绩（最少步数、最短用时）同样按档隔离，刷新可断点续玩。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict="gmemory"] 自动识别。

   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var STATE_KEY = 'ysgame-memory-state';
  var BEST_KEY = 'ysgame-memory-best';
  var DIFF_KEY = 'ysgame-memory-diff';

  /* 三档必须真的拉开：对数 8/10/18、翻回 1000/700/450ms、困难档 180s 时限 */
  var DIFFS = {
    easy: { cols: 4, rows: 4, pairs: 8, flip: 1000, limit: 0 },
    medium: { cols: 4, rows: 5, pairs: 10, flip: 700, limit: 0 },
    hard: { cols: 6, rows: 6, pairs: 18, flip: 450, limit: 180 }
  };

  /* 18 个软萌的 Unicode 符号，困难档 18 对刚好全用上，绝不引用外部图片 */
  var SYMBOLS = ['🌙', '⭐', '🍄', '🦋', '🍒', '🧿', '🍀', '🌸', '🐚', '🍋',
    '🌵', '🦊', '🐳', '🍇', '🍉', '🌼', '🐝', '🎈'];

  /* 正面底色，低饱和柔和风 */
  var CARD_COLORS = ['#F3E8E4', '#E8EEF6', '#EAF1E9', '#F6EEDC', '#EFE7F3',
    '#E4F0EE', '#F5E6EA', '#E9EDDF', '#F0E9E0'];

  /* ---------------- DOM ---------------- */

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board');
  var veil = $('veil');
  var veilText = $('veilText');
  var overlay = $('overlay');
  var recordBadge = $('recordBadge');
  var btnPause = $('btn-pause');

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    deck: [],            // [{ id, sym }, ...] 长度 = cols*rows
    matched: [],         // 每张牌是否已配对
    up: [],              // 当前翻开、尚未结算的牌（最多 2 张）
    pending: null,       // { a, b, kind, at } 待结算的一对
    locked: false,       // 动画 / 翻回期间锁输入，防连点作弊
    moves: 0,
    matchedPairs: 0,
    combo: 0,
    score: 0,
    elapsed: 0,          // 已用秒数
    remaining: 0,        // 困难档剩余秒数
    started: false,
    paused: true,
    over: false,
    won: false,
    recordShown: false,
    best: null           // { easy:{moves,time}, medium:{...}, hard:{...} }
  };

  /* 结算卡片上的文字要能跟着语言切换重画，记下 key 现算变量 */
  var overlayInfo = null;

  var lastTs = 0;
  var accMs = 0;

  /* ---------------- 工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  /** I18N.t 只收一个参数；带占位符的文案在这里用 split/join 自己替换 */
  function tf(key, vars) {
    var s = String(t(key));
    var k;
    for (k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    /* 兜底：万一字典里的占位符名没覆盖到，也别把 {xxx} 露在页面上 */
    s = s.replace(/\{[^}]*\}/g, '');
    return s;
  }

  function sfx(name, opts) {
    if (window.YSound) window.YSound.play(name, opts);
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(Number(s) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : '' + r);
  }

  function shuffleCopy(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function buildDeck(diff) {
    var d = DIFFS[diff];
    var pool = shuffleCopy(SYMBOLS);
    var deck = [];
    for (var p = 0; p < d.pairs; p++) {
      var sym = pool[p % pool.length];
      deck.push({ id: p, sym: sym });
      deck.push({ id: p, sym: sym });
    }
    return shuffleCopy(deck);
  }

  function bestMoves() {
    var b = state.best && state.best[state.diff];
    return (b && b.moves > 0) ? b.moves : 0;
  }

  /* ---------------- 存档（按难度分桶） ---------------- */

  function readStateAll() {
    try {
      var d = JSON.parse(localStorage.getItem(STATE_KEY));
      if (d && d.v === 1 && d.tiers && typeof d.tiers === 'object') return d;
    } catch (e) { /* 存档坏了就当没有 */ }
    return { v: 1, diff: state.diff, tiers: {} };
  }

  function snapshot() {
    return {
      deck: state.deck,
      matched: state.matched,
      up: state.up,
      pending: state.pending,
      locked: state.locked,
      moves: state.moves,
      matchedPairs: state.matchedPairs,
      combo: state.combo,
      score: state.score,
      elapsed: state.elapsed,
      remaining: state.remaining,
      started: state.started,
      paused: state.paused,
      over: state.over,
      won: state.won,
      recordShown: state.recordShown
    };
  }

  function save() {
    try {
      var all = readStateAll();
      all.v = 1;
      all.diff = state.diff;
      all.tiers[state.diff] = snapshot();
      localStorage.setItem(STATE_KEY, JSON.stringify(all));
    } catch (e) { /* 隐私模式写不了，不影响玩 */ }
  }

  function loadState() {
    var all = readStateAll();
    var d = all.tiers[state.diff];
    if (!d || !d.deck || !d.deck.length) return false;
    var expect = DIFFS[state.diff].cols * DIFFS[state.diff].rows;
    if (d.deck.length !== expect) return false;

    state.deck = d.deck;
    state.matched = [];
    for (var i = 0; i < expect; i++) state.matched.push(!!(d.matched && d.matched[i]));

    state.up = [];
    if (d.up && d.up.length) {
      for (var u = 0; u < d.up.length && u < 2; u++) {
        var ix = Number(d.up[u]);
        if (ix >= 0 && ix < expect) state.up.push(ix);
      }
    }

    state.pending = null;
    if (d.pending && d.pending.kind) {
      state.pending = {
        a: Number(d.pending.a), b: Number(d.pending.b),
        kind: d.pending.kind === 'match' ? 'match' : 'miss',
        at: Date.now() + 200   /* 刷新/切档后稍等一下再自动结算 */
      };
    }

    state.moves = Number(d.moves) || 0;
    state.matchedPairs = Number(d.matchedPairs) || 0;
    state.combo = Number(d.combo) || 0;
    state.score = Number(d.score) || 0;
    state.elapsed = Number(d.elapsed) || 0;
    state.remaining = (d.remaining == null) ? DIFFS[state.diff].limit : Number(d.remaining);
    state.started = !!d.started;
    state.over = !!d.over;
    state.won = !!d.won;
    state.recordShown = !!d.recordShown;
    state.paused = true;      /* 刷新 / 恢复一律先暂停，别让计时自己跑 */
    overlayInfo = null;

    /* 防御：有两张翻开却没有待决记录，补一个待决，恢复后自动翻回/配对 */
    if (state.up.length === 2 && !state.pending) {
      state.pending = {
        a: state.up[0], b: state.up[1],
        kind: state.deck[state.up[0]].id === state.deck[state.up[1]].id ? 'match' : 'miss',
        at: Date.now() + 200
      };
    }
    state.locked = state.up.length === 2;
    return true;
  }

  function emptyBest() {
    var o = {};
    for (var k in DIFFS) if (Object.prototype.hasOwnProperty.call(DIFFS, k)) o[k] = { moves: 0, time: 0 };
    return o;
  }

  function loadBest() {
    var out = emptyBest();
    try {
      var d = JSON.parse(localStorage.getItem(BEST_KEY));
      if (d && d.v === 1 && d.tiers) {
        for (var k in DIFFS) {
          if (Object.prototype.hasOwnProperty.call(DIFFS, k) && d.tiers[k]) {
            out[k].moves = Number(d.tiers[k].moves) || 0;
            out[k].time = Number(d.tiers[k].time) || 0;
          }
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ v: 1, tiers: state.best }));
    } catch (e) { /* ignore */ }
  }

  function loadDiff() {
    try {
      var d = localStorage.getItem(DIFF_KEY);
      if (d && DIFFS[d]) { state.diff = d; return; }
      var all = readStateAll();
      if (all.diff && DIFFS[all.diff]) state.diff = all.diff;
    } catch (e) { /* ignore */ }
  }

  function saveDiff() {
    try { localStorage.setItem(DIFF_KEY, state.diff); } catch (e) { /* ignore */ }
  }

  /* ---------------- 牌面绘制 ---------------- */

  function buildBoardDom() {
    board.innerHTML = '';
    board.style.setProperty('--cols', String(DIFFS[state.diff].cols));
    for (var i = 0; i < state.deck.length; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      btn.setAttribute('data-idx', String(i));

      var inner = document.createElement('span');
      inner.className = 'card__inner';
      inner.setAttribute('aria-hidden', 'true');

      var back = document.createElement('span');
      back.className = 'card__face card__face--back';

      var front = document.createElement('span');
      front.className = 'card__face card__face--front';
      front.style.backgroundColor = CARD_COLORS[state.deck[i].id % CARD_COLORS.length];
      var sym = document.createElement('span');
      sym.className = 'sym';
      sym.textContent = state.deck[i].sym;
      front.appendChild(sym);

      inner.appendChild(back);
      inner.appendChild(front);
      btn.appendChild(inner);
      board.appendChild(btn);

      (function (idx, el) {
        el.addEventListener('click', function () { onCardClick(idx); });
      })(i, btn);
    }
  }

  function render() {
    var cards = board.children;
    for (var i = 0; i < state.deck.length; i++) {
      var c = cards[i];
      if (!c) continue;
      var up = state.up.indexOf(i) !== -1;
      var matched = !!state.matched[i];
      c.classList.toggle('is-up', up || matched);
      c.classList.toggle('is-matched', matched);
      var label;
      if (matched) label = state.deck[i].sym + ' #' + (i + 1) + ' \u2713';
      else if (up) label = state.deck[i].sym + ' #' + (i + 1);
      else label = '? #' + (i + 1);
      c.setAttribute('aria-label', label);
      c.setAttribute('aria-disabled', canFlip() ? 'false' : 'true');
    }
  }

  /* ---------------- 界面 ---------------- */

  function updateClock() {
    $('time').textContent = fmtTime(state.elapsed);
    var limit = DIFFS[state.diff].limit;
    $('remaining').textContent = limit > 0 ? fmtTime(state.remaining) : '\u221E';
  }

  function updateHud() {
    $('score').textContent = String(state.score);
    $('moves').textContent = String(state.moves);
    $('pairs').textContent = state.matchedPairs + '/' + (state.deck.length / 2);
    $('combo').textContent = state.combo > 0 ? ('x' + state.combo) : '0';
    $('best').textContent = bestMoves() > 0 ? String(bestMoves()) : '--';
    updateClock();
  }

  function updateParams() {
    var d = DIFFS[state.diff];
    var limitTxt = d.limit > 0 ? (d.limit + 's') : '\u221E';
    /* 全是数字和通用符号，语言无关：难度名 / 行列 / 对数 / 翻回速度 / 时限 */
    $('params').textContent = t('diff_' + state.diff) + '  \u00B7  ' +
      d.cols + '\u00D7' + d.rows + ' (' + d.pairs + ')  \u00B7  ' +
      '\u21BA ' + d.flip + 'ms  \u00B7  ' + '\u23F1 ' + limitTxt;
  }

  function updateVeil() {
    btnPause.textContent = (state.paused && state.started) ? t('btn_resume') : t('btn_pause');
    if (state.over) { veil.hidden = true; return; }
    if (!state.started) {
      veil.hidden = false;
      veilText.textContent = t('btn_start');
      return;
    }
    if (state.paused) {
      veil.hidden = false;
      veilText.textContent = t('paused_title');
      return;
    }
    veil.hidden = true;
  }

  function overlayVars() {
    var total = state.deck.length / 2;
    var remainPairs = total - state.matchedPairs;
    var timeStr = fmtTime(state.elapsed);
    var moves = state.moves;
    var score = state.score;
    var matched = state.matchedPairs;
    var combo = state.combo;
    var best = bestMoves();
    var diffName = t('diff_' + state.diff);
    var limit = DIFFS[state.diff].limit;
    var remainTime = limit > 0 ? fmtTime(state.remaining) : '--';
    /* 别名给足，字典里占位符用哪个名字都能替换上，不露 {xxx} */
    return {
      moves: moves, steps: moves, step: moves, move: moves,
      time: timeStr, elapsed: timeStr, duration: timeStr, seconds: state.elapsed,
      score: score, points: score, pts: score,
      pairs: remainPairs, remain: remainTime, left: remainTime,
      matched: matched, match: matched,
      total: total, size: total, n: total, count: total,
      combo: combo, streak: combo,
      best: best, record: best, bestMoves: best,
      diff: diffName, difficulty: diffName
    };
  }

  function showOverlay(titleKey, subKey) {
    overlayInfo = { title: titleKey, sub: subKey };
    $('overlay-title').textContent = t(titleKey);
    $('overlay-sub').textContent = tf(subKey, overlayVars());
    $('overlay-score').textContent = String(state.score);
    overlay.hidden = false;
  }

  /** 语言原地切换时，data-i18n 由 I18N.apply 管，这些动态文字自己重画 */
  function refreshDynamicText() {
    updateVeil();
    updateParams();
    if (overlayInfo && !overlay.hidden) {
      $('overlay-title').textContent = t(overlayInfo.title);
      $('overlay-sub').textContent = tf(overlayInfo.sub, overlayVars());
    }
  }

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 玩法 ---------------- */

  function canFlip() {
    return state.started && !state.paused && !state.over && !state.locked && !state.pending;
  }

  function onCardClick(i) {
    if (!canFlip()) return;
    if (state.matched[i]) return;
    if (state.up.indexOf(i) !== -1) return;
    if (state.up.length >= 2) return;

    state.up.push(i);
    sfx('reveal');

    if (state.up.length === 2) {
      state.moves += 1;          /* 翻两次算一步 */
      state.locked = true;       /* 结算前锁输入，翻回前不能再翻第三张 */
      var a = state.up[0], b = state.up[1];
      var kind = state.deck[a].id === state.deck[b].id ? 'match' : 'miss';
      state.pending = {
        a: a, b: b, kind: kind,
        at: Date.now() + (kind === 'match' ? 360 : DIFFS[state.diff].flip)
      };
    }

    render();
    updateHud();
    save();
  }

  function resolvePending() {
    var p = state.pending;
    if (!p) return;
    state.pending = null;

    if (p.kind === 'match') {
      state.matched[p.a] = true;
      state.matched[p.b] = true;
      state.matchedPairs += 1;
      state.combo += 1;
      state.score += 100 + (state.combo - 1) * 50;   /* 连击加分 */
      sfx('pop');
      if (state.combo >= 2) sfx('combo', { combo: state.combo });
    } else {
      state.combo = 0;
      sfx('warn');
    }

    state.up = [];
    state.locked = false;
    render();
    updateHud();
    save();

    if (p.kind === 'match' && state.matchedPairs === state.deck.length / 2) win();
  }

  function checkRecord() {
    var b = state.best[state.diff] || { moves: 0, time: 0 };
    var isRecord = false;
    if (!b.moves || state.moves < b.moves) { b.moves = state.moves; isRecord = true; }
    if (!b.time || state.elapsed < b.time) { b.time = state.elapsed; isRecord = true; }
    state.best[state.diff] = b;
    saveBest();
    if (isRecord && !state.recordShown) {
      state.recordShown = true;
      recordBadge.hidden = false;
      sfx('record');
    }
  }

  function win() {
    if (state.over) return;
    state.over = true;
    state.won = true;
    state.paused = true;
    state.locked = false;
    state.pending = null;
    checkRecord();
    sfx('win');
    sfx('complete');
    showOverlay('win_title', 'win_sub');
    updateHud();
    updateVeil();
    save();
  }

  function lose() {
    if (state.over) return;
    state.over = true;
    state.won = false;
    state.paused = true;
    state.locked = false;
    state.pending = null;
    state.up = [];
    sfx('lose');
    showOverlay('lose_title', 'lose_sub');
    render();
    updateHud();
    updateVeil();
    save();
  }

  /* ---------------- 局面控制 ---------------- */

  function resetClock() {
    lastTs = 0;
    accMs = 0;
  }

  function newGame() {
    var d = DIFFS[state.diff];
    state.deck = buildDeck(state.diff);
    state.matched = [];
    for (var i = 0; i < state.deck.length; i++) state.matched.push(false);
    state.up = [];
    state.pending = null;
    state.locked = false;
    state.moves = 0;
    state.matchedPairs = 0;
    state.combo = 0;
    state.score = 0;
    state.elapsed = 0;
    state.remaining = d.limit;
    state.started = false;
    state.paused = true;
    state.over = false;
    state.won = false;
    state.recordShown = false;
    overlayInfo = null;
    overlay.hidden = true;
    recordBadge.hidden = true;
    resetClock();
    syncDiffs();
    buildBoardDom();
    render();
    updateHud();
    updateParams();
    updateVeil();
    save();
  }

  function start() {
    if (state.over) newGame();
    state.started = true;
    state.paused = false;
    resetClock();
    overlay.hidden = true;
    sfx('start');
    updateVeil();
    save();
  }

  function togglePause() {
    if (state.over) return;
    if (!state.started) { start(); return; }
    state.paused = !state.paused;
    sfx('click');
    updateVeil();
    save();
  }

  function restart() {
    sfx('click');
    newGame();
    start();
  }

  function afterLoad() {
    syncDiffs();
    buildBoardDom();
    render();
    updateHud();
    updateParams();
    updateVeil();
    if (state.over) {
      if (state.won) showOverlay('win_title', 'win_sub');
      else showOverlay('lose_title', 'lose_sub');
    } else {
      overlay.hidden = true;
    }
    recordBadge.hidden = !state.recordShown;
    save();   /* 把恢复后的「先暂停」状态一并写回，刷新续玩保持一致 */
  }

  function switchDiff(diff) {
    if (!DIFFS[diff]) return;
    if (diff === state.diff) return;
    if (state.started && !state.over && state.moves > 0) {
      if (!window.confirm(t('confirm_diff'))) { syncDiffs(); return; }
    }
    save();                 /* 先把当前难度这局存回它自己的桶 */
    state.diff = diff;
    saveDiff();
    sfx('toggle');
    /* 按难度隔离：该档有存档就恢复，没有就重开 */
    if (!loadState()) newGame();
    else afterLoad();
  }

  /* ---------------- 主循环（100ms 一跳） ---------------- */

  function loop() {
    var now = Date.now();
    if (!lastTs) lastTs = now;
    var dt = now - lastTs;
    lastTs = now;
    if (dt > 1000) dt = 1000;   /* 后台节流回来别把挂机时间算成游戏时间 */
    if (!state.started || state.paused || state.over) return;

    if (state.pending && now >= state.pending.at) {
      resolvePending();
      if (state.over) return;   /* 这次结算可能刚好全部配对 -> win */
    }

    accMs += dt;
    var rolled = false;
    var limit = DIFFS[state.diff].limit;
    while (accMs >= 1000) {
      accMs -= 1000;
      state.elapsed += 1;
      rolled = true;
      if (limit > 0) {
        state.remaining -= 1;
        if (state.remaining <= 0) { state.remaining = 0; lose(); return; }
      }
    }
    if (rolled) { updateHud(); save(); }
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    var diffs = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < diffs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          switchDiff(btn.getAttribute('data-diff'));
        });
      })(diffs[i]);
    }

    $('btn-start').addEventListener('click', function () { sfx('click'); start(); });
    btnPause.addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', restart);
    $('btn-again').addEventListener('click', restart);

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePause();
      }
    });

    /* 切到后台自动暂停，回来别发现时间已经走光 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.started && !state.paused && !state.over) {
        state.paused = true;
        updateVeil();
        save();
      }
    });

    document.addEventListener('ys:langchange', refreshDynamicText);
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    state.best = loadBest();
    loadDiff();
    syncDiffs();
    saveDiff();   /* 三个存档键开局即落盘 */
    saveBest();

    if (!loadState()) newGame();
    else afterLoad();

    bind();
    refreshDynamicText();
    window.setInterval(loop, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
