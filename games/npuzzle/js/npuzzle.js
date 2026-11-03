/* ==========================================================================
   数字华容道（Number Slide）
   - 3×3 / 4×4 / 5×5，打乱方式是从还原态随机走，天然保证有解
   - 点一下相邻的数字就滑过去；也能在棋盘上滑动，或用方向键
   - 撤销栈、每档最佳步数、断点续玩
   [gyh 2026-11-03 新增]
   ========================================================================== */
(function () {
  'use strict';

  var SIZES = [3, 4, 5];
  var KEY_STATE = 'ysgame-npuzzle-state';
  var KEY_BEST = 'ysgame-npuzzle-best';
  var KEY_SIZE = 'ysgame-npuzzle-size';
  var MAX_HISTORY = 300;
  var SWIPE_MIN = 18;

  var state = {
    n: 4,
    tiles: [],      // 长度 n*n，0 表示空格
    moves: 0,
    elapsed: 0,     // 已经冻结的秒数
    since: 0,       // 本段开始计时的时间戳，0 表示没在计时
    won: false,
    isRecord: false,
    history: []
  };

  var best = {};
  var dom = {};
  var tileEls = [];   // 值 → 元素（1 .. n*n-1）
  var holeEl = null;
  var ticking = false;
  var winTimer = 0;
  var fitQueued = false;

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  // 字典里的 {n} {moves} 这类占位符，用 split/join 替换（避免 replace 只换第一个）
  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        s = s.split('{' + k + '}').join(String(map[k]));
      }
    }
    return s;
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 隐私模式下写不进去，忽略 */ }
  }

  function rowOf(i) { return Math.floor(i / state.n); }
  function colOf(i) { return i % state.n; }

  /* ---------------- 音效 ----------------
     [gyh 2026-11-03 新增] 走全站引擎，本页自动用「塑料滑块」主题：
     高音、清脆、短促。音高跟着滑块所在的行列走，滑不同位置声音不一样。
     ------------------------------------ */

  function soundSlide(index) {
    if (window.YSound) window.YSound.play('slide', { step: rowOf(index) + colOf(index) });
  }

  function soundUndo() {
    if (window.YSound) window.YSound.play('undo');
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* ---------------- 棋盘数学 ---------------- */

  function solvedTiles(n) {
    var total = n * n;
    var arr = [];
    for (var i = 0; i < total - 1; i++) arr.push(i + 1);
    arr.push(0);
    return arr;
  }

  function isSolved(tiles) {
    for (var i = 0; i < tiles.length - 1; i++) {
      if (tiles[i] !== i + 1) return false;
    }
    return tiles[tiles.length - 1] === 0;
  }

  function manhattan(tiles, n) {
    var sum = 0;
    for (var i = 0; i < tiles.length; i++) {
      var v = tiles[i];
      if (!v) continue;
      var target = v - 1;
      sum += Math.abs(Math.floor(i / n) - Math.floor(target / n)) +
             Math.abs((i % n) - (target % n));
    }
    return sum;
  }

  // 逆序数判定，偶数阶还要看空格所在行（从下往上数）
  // 只用来校验存档是否被改坏，正常打乱一定是有解的
  function isSolvable(tiles, n) {
    var inversions = 0;
    var blankRowFromBottom = 0;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i] === 0) {
        blankRowFromBottom = n - Math.floor(i / n);
        continue;
      }
      for (var j = i + 1; j < tiles.length; j++) {
        if (tiles[j] !== 0 && tiles[j] < tiles[i]) inversions++;
      }
    }
    if (n % 2 === 1) return inversions % 2 === 0;
    return (inversions + blankRowFromBottom) % 2 === 1;
  }

  function neighbors(index, n) {
    var r = Math.floor(index / n);
    var c = index % n;
    var out = [];
    if (r > 0) out.push(index - n);
    if (r < n - 1) out.push(index + n);
    if (c > 0) out.push(index - 1);
    if (c < n - 1) out.push(index + 1);
    return out;
  }

  // 从还原态随机走若干步。走出来的局面一定有解，不用再验算奇偶性。
  function scramble(n) {
    var total = n * n;
    var steps = n === 3 ? 90 : n === 4 ? 260 : 560;
    var floor = n === 3 ? 12 : n === 4 ? 34 : 70;
    var tries = 0;
    var tiles;

    do {
      tiles = solvedTiles(n);
      var blank = total - 1;
      var prev = -1;
      for (var s = 0; s < steps; s++) {
        var opts = neighbors(blank, n);
        var pickable = [];
        for (var k = 0; k < opts.length; k++) {
          if (opts[k] !== prev) pickable.push(opts[k]);
        }
        var pick = pickable[Math.floor(Math.random() * pickable.length)];
        tiles[blank] = tiles[pick];
        tiles[pick] = 0;
        prev = blank;
        blank = pick;
      }
      tries++;
      // 偶尔会打乱出一个"几乎已经拼好"的局面，重新来
    } while ((isSolved(tiles) || manhattan(tiles, n) < floor) && tries < 40);

    return tiles;
  }

  /* ---------------- 渲染 ---------------- */

  function fitFont() {
    var w = dom.grid.clientWidth;
    if (!w) return;
    var size = Math.max(14, Math.min(40, (w / state.n) * 0.44));
    dom.grid.style.setProperty('--tile-fs', size.toFixed(1) + 'px');
  }

  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    window.requestAnimationFrame(function () {
      fitQueued = false;
      fitFont();
    });
  }

  function build() {
    dom.grid.innerHTML = '';
    dom.grid.style.setProperty('--n', state.n);
    tileEls = [];

    var n = state.n;
    for (var v = 1; v < n * n; v++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile';
      btn.tabIndex = -1;
      btn.dataset.v = String(v);
      btn.style.setProperty('--i', String(v));

      var face = document.createElement('span');
      face.className = 'tile__face';
      face.textContent = String(v);
      btn.appendChild(face);

      btn.setAttribute('aria-label', String(v));
      dom.grid.appendChild(btn);
      tileEls[v] = btn;
    }

    holeEl = document.createElement('i');
    holeEl.className = 'np__hole';
    holeEl.setAttribute('aria-hidden', 'true');
    dom.grid.appendChild(holeEl);

    place();
    fitFont();
  }

  function place() {
    var n = state.n;
    for (var i = 0; i < n * n; i++) {
      var v = state.tiles[i];
      var el = v === 0 ? holeEl : tileEls[v];
      if (!el) continue;
      el.style.setProperty('--r', String(rowOf(i)));
      el.style.setProperty('--c', String(colOf(i)));
    }
  }

  /* ---------------- 计时 ---------------- */

  function nowElapsed() {
    return state.elapsed + (state.since ? (Date.now() - state.since) / 1000 : 0);
  }

  function startClock() {
    if (state.since || state.won) return;
    state.since = Date.now();
  }

  function freezeClock() {
    if (!state.since) return;
    state.elapsed += (Date.now() - state.since) / 1000;
    state.since = 0;
  }

  function resumeClock() {
    if (state.won || !state.tiles.length) return;
    // 打开页面时不该自动开始计时，等第一步真正走了再继续
    if (state.moves === 0) return;
    state.since = Date.now();
  }

  function tick() {
    dom.timer.textContent = formatTime(nowElapsed());
  }

  /* ---------------- 记分板 ---------------- */

  function refreshHud() {
    dom.moves.textContent = String(state.moves);
    dom.timer.textContent = formatTime(nowElapsed());

    var b = best[state.n];
    dom.best.textContent = b && typeof b.moves === 'number' ? String(b.moves) : '--';

    var canUndo = state.history.length > 0 && !state.won;
    dom.btnUndo.disabled = !canUndo;
  }

  function markSizes() {
    var btns = dom.sizes.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = Number(btns[i].dataset.size) === state.n;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 走一步 ---------------- */

  function adjacent(a, b, n) {
    return Math.abs(Math.floor(a / n) - Math.floor(b / n)) +
           Math.abs((a % n) - (b % n)) === 1;
  }

  function pushHistory() {
    state.history.push({ tiles: state.tiles.slice(), moves: state.moves });
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function slide(index, silent) {
    if (state.won) return false;

    var blank = state.tiles.indexOf(0);
    if (!adjacent(index, blank, state.n)) return false;
    if (index === blank) return false;

    pushHistory();
    state.tiles[blank] = state.tiles[index];
    state.tiles[index] = 0;
    state.moves++;

    startClock();
    place();
    refreshHud();
    saveState();
    if (!silent) soundSlide(index);

    if (!silent && isSolved(state.tiles)) finish();
    return true;
  }

  // 方向 = 数字滑动方向；比如向左，就是空格右边那个数字滑过来
  function slideFrom(dir) {
    var blank = state.tiles.indexOf(0);
    var n = state.n;
    var r = rowOf(blank);
    var c = colOf(blank);
    var src = -1;

    if (dir === 'left' && c < n - 1) src = blank + 1;
    if (dir === 'right' && c > 0) src = blank - 1;
    if (dir === 'up' && r < n - 1) src = blank + n;
    if (dir === 'down' && r > 0) src = blank - n;

    if (src < 0) return false;
    return slide(src);
  }

  function undo() {
    if (!state.history.length || state.won) return;
    var last = state.history.pop();
    state.tiles = last.tiles;
    state.moves = last.moves;
    place();
    refreshHud();
    saveState();
    soundUndo();
  }

  /* ---------------- 结算 ---------------- */

  function finish() {
    freezeClock();
    state.won = true;
    dom.board.classList.add('is-won');

    var prev = best[state.n] || null;
    var hadBest = prev && typeof prev.moves === 'number';
    // 第一次拼完只是"拼好了"，得比上次更少步数才算破纪录
    var isRecord = hadBest && state.moves < prev.moves;
    state.isRecord = isRecord;

    if (!hadBest || isRecord) {
      best[state.n] = { moves: state.moves, time: Math.round(nowElapsed()) };
      writeJSON(KEY_BEST, best);
    }

    refreshHud();

    // 破纪录换一段更长的旋律，比普通的"拼好了"更值钱
    if (window.YSound) window.YSound.play(isRecord ? 'record' : 'win');

    winTimer = window.setTimeout(showOverlay, 480);

    saveState();
  }

  function showOverlay() {
    dom.overlayTitle.textContent = t(state.isRecord ? 'win_title_record' : 'win_title');
    dom.overlaySub.textContent = tf('win_sub', {
      size: state.n + '×' + state.n,
      moves: state.moves,
      time: formatTime(nowElapsed())
    });
    dom.overlayMoves.textContent = String(state.moves);
    dom.overlayTime.textContent = formatTime(nowElapsed());
    dom.btnAgain.textContent = t('btn_again');
    dom.shareBtn.textContent = t('share_btn');
    dom.overlay.hidden = false;

    // 手机上一屏放不下棋盘 + 结算卡，别让玩家拼完了却看不见结果
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
  }

  /* ---------------- 开局 / 换规格 ---------------- */

  function startGame(n, tiles) {
    window.clearTimeout(winTimer);
    hideOverlay();
    dom.board.classList.remove('is-won');

    state.n = n;
    state.tiles = tiles || scramble(n);
    state.moves = 0;
    state.elapsed = 0;
    state.since = 0;
    state.won = false;
    state.isRecord = false;
    state.history = [];

    try { window.localStorage.setItem(KEY_SIZE, String(n)); } catch (e) {}

    build();
    markSizes();
    refreshHud();
    saveState();
  }

  function resize() {
    queueFit();
  }

  /* ---------------- 存档 ---------------- */

  function saveState() {
    writeJSON(KEY_STATE, {
      n: state.n,
      tiles: state.tiles,
      moves: state.moves,
      elapsed: Math.round(nowElapsed())
    });
  }

  function loadState() {
    var s = readJSON(KEY_STATE, null);
    if (!s || SIZES.indexOf(s.n) < 0) return false;

    var n = s.n;
    var total = n * n;

    if (!Array.isArray(s.tiles) || s.tiles.length !== total) return false;

    // 必须正好是 0 .. total-1 的一个排列，重复或越界都算坏档
    var seen = {};
    for (var i = 0; i < total; i++) {
      var v = s.tiles[i];
      if (typeof v !== 'number' || v < 0 || v >= total || seen[v]) return false;
      seen[v] = true;
    }
    if (!isSolvable(s.tiles, n)) return false;

    state.n = n;
    state.tiles = s.tiles.slice();
    state.moves = typeof s.moves === 'number' && s.moves > 0 ? Math.floor(s.moves) : 0;
    state.elapsed = typeof s.elapsed === 'number' && s.elapsed > 0 ? s.elapsed : 0;
    state.since = 0;
    state.won = isSolved(state.tiles);
    state.history = [];

    if (state.won) {
      state.tiles = scramble(n);
      state.moves = 0;
      state.elapsed = 0;
      state.won = false;
    }
    return true;
  }

  function lastSize() {
    var n = Number(window.localStorage.getItem(KEY_SIZE));
    return SIZES.indexOf(n) >= 0 ? n : 4;
  }

  /* ---------------- 输入 ---------------- */

  function bindInput() {
    dom.grid.addEventListener('click', function (e) {
      // 滑动结束后浏览器还会补一个 click，别让它再滑一次
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      var btn = e.target.closest ? e.target.closest('.tile') : null;
      if (!btn) return;
      var at = state.tiles.indexOf(Number(btn.dataset.v));
      if (at >= 0) slide(at);
    });

    dom.board.addEventListener('keydown', function (e) {
      var map = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down',
        A: 'left', D: 'right', W: 'up', S: 'down'
      };
      var dir = map[e.key];
      if (dir) {
        e.preventDefault();
        slideFrom(dir);
        return;
      }
      if (e.key === 'u' || e.key === 'U' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      }
    });

    // 手机：在棋盘上滑一下。阈值 18px，太小会和点按打架。
    var startX = 0;
    var startY = 0;
    var tracking = false;
    var suppressClick = false;

    dom.board.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    dom.board.addEventListener('pointerup', function (e) {
      if (!tracking) return;
      tracking = false;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        slideFrom(dx < 0 ? 'left' : 'right');
      } else {
        slideFrom(dy < 0 ? 'up' : 'down');
      }

      // 挡住紧跟着的那次 click；万一这次滑动没落在数字块上，350ms 后自动放开
      suppressClick = true;
      window.setTimeout(function () { suppressClick = false; }, 350);
    });

    dom.board.addEventListener('pointercancel', function () { tracking = false; });

    dom.sizes.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (!btn) return;
      var n = Number(btn.dataset.size);
      if (SIZES.indexOf(n) < 0 || n === state.n && !state.won) return;
      startGame(n, null);
    });

    dom.btnUndo.addEventListener('click', undo);

    dom.btnShuffle.addEventListener('click', function () {
      startGame(state.n, null);
    });

    dom.btnAgain.addEventListener('click', function () {
      startGame(state.n, null);
    });

    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) hideOverlay();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dom.overlay.hidden) hideOverlay();
    });

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    window.addEventListener('pagehide', function () {
      freezeClock();
      saveState();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        freezeClock();
        saveState();
      } else {
        resumeClock();
        tick();
      }
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      board: document.getElementById('board'),
      grid: document.getElementById('grid'),
      moves: document.getElementById('moves'),
      timer: document.getElementById('timer'),
      best: document.getElementById('best'),
      sizes: document.getElementById('sizes'),
      btnUndo: document.getElementById('btn-undo'),
      btnShuffle: document.getElementById('btn-shuffle'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayMoves: document.getElementById('overlay-moves'),
      overlayTime: document.getElementById('overlay-time'),
      btnAgain: document.getElementById('btn-again'),
      shareBtn: document.querySelector('[data-share-open]')
    };

    best = readJSON(KEY_BEST, {}) || {};
    if (typeof best !== 'object' || Array.isArray(best)) best = {};

    if (!loadState()) {
      state.n = lastSize();
      state.tiles = scramble(state.n);
    }

    build();
    markSizes();
    refreshHud();

    bindInput();
    window.setInterval(tick, 500);

    // 切语言时静态文案由 I18N 重绘；结算卡片是 JS 拼的，要自己补
    document.addEventListener('ys:langchange', function () {
      refreshHud();
      if (!dom.overlay.hidden) {
        dom.overlayTitle.textContent = t(state.isRecord ? 'win_title_record' : 'win_title');
        dom.overlaySub.textContent = tf('win_sub', {
          size: state.n + '×' + state.n,
          moves: state.moves,
          time: formatTime(nowElapsed())
        });
        dom.btnAgain.textContent = t('btn_again');
        dom.shareBtn.textContent = t('share_btn');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
