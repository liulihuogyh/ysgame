/* ==========================================================================
   迷宫（Maze）· 游戏逻辑
   - 随机 DFS（递归回溯）生成完美迷宫，网格尺寸为奇数 (2n+1)
   - 起点左上、出口右下；方向键 / WASD / 触屏滑动一格一格走
   - 三档难度：尺寸、限时、提示次数、得分基数逐级拉开
   - BFS 高亮一段最短路径作为提示
   - 自动存档（断点续玩）+ 最佳分记录，按难度隔离存档槽
   - 统一走全站音效引擎 window.YSound.play
   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var SIDE = 480;                 // 逻辑画布边长（正方形）
  var STATE_V = 1;
  var HINT_MS = 2500;             // 提示高亮持续时长

  var KEY_STATE = 'ysgame-maze-state';
  var KEY_BEST = 'ysgame-maze-best';
  var KEY_DIFF = 'ysgame-maze-diff';

  // 三档难度：网格边长(size 必须奇数) / 限时(timeLimit 秒,0=无限) / 提示次数 / 得分基数 / 步罚 / 时间奖励
  var DIFF = {
    easy:   { size: 11, timeLimit: 0,   hintLimit: Infinity, scoreBase: 300,  stepPen: 1, timeBonus: 0 },
    medium: { size: 17, timeLimit: 90,  hintLimit: 8,        scoreBase: 700,  stepPen: 2, timeBonus: 4 },
    hard:   { size: 25, timeLimit: 120, hintLimit: 3,        scoreBase: 1200, stepPen: 3, timeBonus: 8 }
  };

  var WALL  = '#C9C2B5';
  var PATH  = '#FBF6EC';
  var EXIT  = '#9FB8A8';
  var PLAYER = '#6B7ACF';
  var HINT  = 'rgba(107, 122, 194, .34)';

  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',   // ready | running | paused | win | lose
    level: 1,
    steps: 0,
    score: 0,
    bestAtStart: 0,
    isRecord: false,
    timeLeft: 0,
    elapsed: 0,
    hintsLeft: 0,
    n: 17,
    maze: [],
    start: { r: 1, c: 1 },
    exit: { r: 15, c: 15 },
    player: { r: 1, c: 1 },
    hintPath: null,
    hintExpire: 0
  };

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var lastSave = 0;

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        s = s.split('{' + k + '}').join(String(map[k]));
      }
    }
    return s;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
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
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function sfx(name, opts) {
    if (window.YSound) window.YSound.play(name, opts || {});
  }

  // 动态文案：挂 data-i18n，切语言时 I18N.apply 会重绘
  function setI18n(el, key) {
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  function diffDef() { return DIFF[state.diff] || DIFF.medium; }

  /* ---------------- 迷宫生成（随机 DFS / 递归回溯） ---------------- */

  function generateMaze(n) {
    var g = [];
    var r, c;
    for (r = 0; r < n; r++) {
      g[r] = [];
      for (c = 0; c < n; c++) g[r][c] = 1; // 全墙
    }

    var stack = [];
    var sr = 1, sc = 1;
    g[sr][sc] = 0;
    stack.push([sr, sc]);

    while (stack.length) {
      var cur = stack[stack.length - 1];
      r = cur[0]; c = cur[1];

      // 洗牌方向
      var sh = DIRS.slice();
      for (var i = sh.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = sh[i]; sh[i] = sh[j]; sh[j] = tmp;
      }

      var moved = false;
      for (var k = 0; k < sh.length; k++) {
        var nr = r + sh[k][0] * 2;
        var nc = c + sh[k][1] * 2;
        if (nr > 0 && nr < n - 1 && nc > 0 && nc < n - 1 && g[nr][nc] === 1) {
          g[(r + nr) / 2][(c + nc) / 2] = 0; // 打通中间的墙
          g[nr][nc] = 0;
          stack.push([nr, nc]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    return g;
  }

  /* ---------------- BFS 最短路径（用于提示） ---------------- */

  function bfsPath(grid, start, goal) {
    var n = grid.length;
    var q = [start];
    var seen = {};
    var prev = {};
    var key = start[0] + ',' + start[1];
    seen[key] = true;

    var head = 0;
    while (head < q.length) {
      var cur = q[head++];
      if (cur[0] === goal[0] && cur[1] === goal[1]) break;
      for (var d = 0; d < DIRS.length; d++) {
        var nr = cur[0] + DIRS[d][0];
        var nc = cur[1] + DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        if (grid[nr][nc] !== 0) continue;
        var nk = nr + ',' + nc;
        if (seen[nk]) continue;
        seen[nk] = true;
        prev[nk] = cur;
        q.push([nr, nc]);
      }
    }

    var gk = goal[0] + ',' + goal[1];
    if (!seen[gk]) return null;

    var path = [];
    var node = goal;
    while (node) {
      path.unshift(node);
      node = prev[node[0] + ',' + node[1]];
    }
    return path;
  }

  /* ---------------- 绘制 ---------------- */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = cssW;

    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr);
    var ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw;
      dom.canvas.height = ph;
    }

    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(pw / SIDE, 0, 0, ph / SIDE, 0, 0);
    draw();
  }

  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (!ctx) return;
    var n = state.n || diffDef().size;
    var cs = SIDE / n;

    ctx.clearRect(0, 0, SIDE, SIDE);
    ctx.fillStyle = WALL;
    ctx.fillRect(0, 0, SIDE, SIDE);

    ctx.fillStyle = PATH;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (state.maze[r] && state.maze[r][c] === 0) {
          ctx.fillRect(c * cs, r * cs, cs + 0.6, cs + 0.6);
        }
      }
    }

    drawExit(cs);

    if (state.hintPath && nowMs() < state.hintExpire) drawHint(cs);
    drawPlayer(cs);
  }

  function drawExit(cs) {
    var e = state.exit;
    var x = e.c * cs, y = e.r * cs;
    ctx.fillStyle = EXIT;
    rrect(x + cs * 0.12, y + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 253, 248, .92)';
    ctx.beginPath();
    ctx.arc(x + cs * 0.5, y + cs * 0.5, cs * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHint(cs) {
    ctx.fillStyle = HINT;
    for (var i = 0; i < state.hintPath.length; i++) {
      var p = state.hintPath[i];
      ctx.beginPath();
      ctx.arc((p[1] + 0.5) * cs, (p[0] + 0.5) * cs, cs * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(cs) {
    var p = state.player;
    var x = (p.c + 0.5) * cs, y = (p.r + 0.5) * cs, rad = cs * 0.32;
    ctx.fillStyle = PLAYER;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 253, 248, .85)';
    ctx.beginPath();
    ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- 每帧推进（仅计时与提示过期） ---------------- */

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 100) : 0;
    lastTs = ts;

    if (state.status === 'running') {
      var d = diffDef();
      if (d.timeLimit > 0) {
        state.timeLeft -= dt / 1000;
        if (state.timeLeft <= 0) {
          state.timeLeft = 0;
          updateTimeLabel();
          draw();
          lose();
          return;
        }
        updateTimeLabel();
      } else {
        state.elapsed += dt / 1000;
        updateTimeLabel();
      }

      if (state.hintPath && nowMs() > state.hintExpire) {
        state.hintPath = null;
      }
    }

    draw();
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.level.textContent = String(state.level);
    dom.steps.textContent = String(state.steps);
    dom.best.textContent = String(Math.max(state.bestAtStart, state.isRecord ? state.score : 0));
    updateTimeLabel();
    syncButtons();
  }

  function updateTimeLabel() {
    var d = diffDef();
    dom.time.textContent = d.timeLimit > 0 ? fmtTime(state.timeLeft) : fmtTime(state.elapsed);
  }

  function syncDiffs() {
    var btns = dom.diffs.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncButtons() {
    if (state.status === 'paused') setI18n(dom.btnPause, 'btn_resume');
    else setI18n(dom.btnPause, 'btn_pause');
    dom.btnPause.disabled = (state.status !== 'running' && state.status !== 'paused');

    var label = t('btn_hint');
    if (state.hintsLeft !== Infinity) label += ' (' + state.hintsLeft + ')';
    dom.btnHint.textContent = label;
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.dataset.kind = kind;
    if (kind === 'pause') {
      setI18n(dom.cardTitle, 'paused_title');
      dom.cardSub.hidden = true;
      setI18n(dom.btnStart, 'btn_resume');
    } else {
      setI18n(dom.cardTitle, 'game_title');
      dom.cardSub.hidden = false;
      setI18n(dom.cardSub, 'tagline');
      setI18n(dom.btnStart, 'btn_start');
    }
  }

  function hideCard() { dom.card.hidden = true; }
  function hideOverlay() { dom.overlay.hidden = true; }

  function renderResult() {
    var cfg;
    if (state.status === 'win') cfg = { title: 'win_title', sub: 'win_sub' };
    else cfg = { title: 'lose_title', sub: 'lose_sub' };

    setI18n(dom.overlayTitle, cfg.title);
    if (state.status === 'win') {
      var used;
      if (diffDef().timeLimit > 0) used = fmtTime(state.timeLeft);
      else used = fmtTime(state.elapsed);
      dom.overlaySub.textContent = tf('win_sub', {
        level: state.level, steps: state.steps, time: used, score: state.score
      });
    } else {
      dom.overlaySub.textContent = t('lose_sub');
    }
    dom.overlayScore.textContent = String(state.score);
    dom.overlayLevel.textContent = String(state.level);
    dom.recordBadge.hidden = !state.isRecord;
    dom.btnNext.hidden = (state.status !== 'win');
    dom.overlay.hidden = false;
  }

  function showResult() {
    hideCard();
    renderResult();
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 得分 / 最佳 ---------------- */

  function readBest() {
    var b = readJSON(KEY_BEST, 0);
    return (typeof b === 'number' && b > 0) ? b : 0;
  }

  function saveBest(v) {
    if (v > readBest()) writeJSON(KEY_BEST, v);
  }

  function computeLevelScore() {
    var d = diffDef();
    var base = d.scoreBase * state.level;
    var pen = state.steps * d.stepPen;
    var bonus = (d.timeLimit > 0 && state.timeLeft > 0)
      ? Math.floor(state.timeLeft) * d.timeBonus : 0;
    return Math.max(0, Math.round(base - pen + bonus));
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function setupLevel() {
    var d = diffDef();
    state.maze = generateMaze(d.size);
    state.n = d.size;
    state.start = { r: 1, c: 1 };
    state.exit = { r: d.size - 2, c: d.size - 2 };
    state.player = { r: 1, c: 1 };
    state.steps = 0;
    state.timeLeft = d.timeLimit;
    state.elapsed = 0;
    state.hintsLeft = d.hintLimit;
    state.hintPath = null;
    state.hintExpire = 0;
  }

  function newGame() {
    state.level = 1;
    state.score = 0;
    state.isRecord = false;
    state.bestAtStart = readBest();
    setupLevel();
    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
  }

  function startGame() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);
  }

  function togglePause() {
    if (state.status === 'running') {
      state.status = 'paused';
      showCard('pause');
      sfx('toggle');
      saveState(true);
    } else if (state.status === 'paused') {
      state.status = 'running';
      hideCard();
      sfx('toggle');
      saveState(true);
    }
    syncButtons();
  }

  function tryMove(dr, dc) {
    if (state.status === 'ready') startGame();
    if (state.status !== 'running') return;

    var nr = state.player.r + dr;
    var nc = state.player.c + dc;
    if (nr < 0 || nc < 0 || nr >= state.n || nc >= state.n) return;
    if (state.maze[nr][nc] === 1) { sfx('error'); return; } // 撞墙不动

    state.player.r = nr;
    state.player.c = nc;
    state.steps += 1;
    sfx('step');

    if (state.player.r === state.exit.r && state.player.c === state.exit.c) {
      win();
      return;
    }
    saveState();
    refreshHud();
  }

  function win() {
    var ls = computeLevelScore();
    state.score += ls;
    state.status = 'win';
    sfx('levelup');

    if (state.score > state.bestAtStart) {
      state.isRecord = true;
      state.bestAtStart = state.score;
      saveBest(state.score);
      sfx('record');
    }
    refreshHud();
    showResult();
    saveState(true);
  }

  function lose() {
    state.status = 'lose';
    sfx('lose');
    refreshHud();
    showResult();
    saveState(true);
  }

  function nextLevel() {
    state.level += 1;
    setupLevel();
    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
  }

  function useHint() {
    if (state.status === 'ready') startGame();
    if (state.status !== 'running') return;

    if (state.hintsLeft !== Infinity && state.hintsLeft <= 0) {
      sfx('error');
      return;
    }
    var path = bfsPath(state.maze,
      [state.player.r, state.player.c],
      [state.exit.r, state.exit.c]);
    if (!path) { sfx('error'); return; }

    if (state.hintsLeft !== Infinity) state.hintsLeft -= 1;
    state.hintPath = path;
    state.hintExpire = nowMs() + HINT_MS;
    sfx('hint');
    refreshHud();
    saveState();
  }

  function switchDiff(diff) {
    if (!DIFF[diff] || diff === state.diff) return;

    var inProgress = (state.status === 'running' || state.status === 'paused' ||
      (state.status === 'ready' && (state.steps > 0 || state.level > 1)));
    if (inProgress && !window.confirm(t('confirm_diff'))) return;

    state.diff = diff;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) {}
    syncDiffs();
    sfx('toggle');
    newGame();
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    return {
      diff: state.diff,
      status: state.status,
      level: state.level,
      score: state.score,
      steps: state.steps,
      bestAtStart: state.bestAtStart,
      isRecord: state.isRecord,
      timeLeft: state.timeLeft,
      elapsed: state.elapsed,
      hintsLeft: (state.hintsLeft === Infinity) ? null : state.hintsLeft,
      n: state.n,
      maze: state.maze,
      start: state.start,
      exit: state.exit,
      player: state.player
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 200) return;
    lastSave = now;

    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || typeof root.data !== 'object' || Array.isArray(root.data)) {
      root = { v: STATE_V, data: {} };
    }
    root.data[state.diff] = snapshot();
    writeJSON(KEY_STATE, root);
  }

  function loadState() {
    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data || typeof root.data !== 'object') return false;

    var s = root.data[state.diff];
    if (!s || typeof s !== 'object') return false;
    if (typeof s.n !== 'number' || s.n < 5 || !Array.isArray(s.maze) || s.maze.length !== s.n) return false;
    if (typeof s.player !== 'object' || typeof s.exit !== 'object') return false;
    if (typeof s.level !== 'number' || s.level < 1) return false;
    if (DIFF[state.diff].size !== s.n) return false; // 尺寸不符，视为损坏

    state.n = s.n;
    state.maze = s.maze;
    state.start = s.start || { r: 1, c: 1 };
    state.exit = s.exit || { r: s.n - 2, c: s.n - 2 };
    state.player = s.player;
    state.level = s.level;
    state.score = (typeof s.score === 'number') ? s.score : 0;
    state.steps = (typeof s.steps === 'number') ? s.steps : 0;
    state.timeLeft = (typeof s.timeLeft === 'number') ? s.timeLeft : diffDef().timeLimit;
    state.elapsed = (typeof s.elapsed === 'number') ? s.elapsed : 0;
    state.hintsLeft = (typeof s.hintsLeft === 'number') ? s.hintsLeft : diffDef().hintLimit;
    state.bestAtStart = (typeof s.bestAtStart === 'number') ? s.bestAtStart : readBest();
    state.isRecord = !!s.isRecord;
    state.hintPath = null;
    state.hintExpire = 0;

    if (s.status === 'win' || s.status === 'lose') {
      state.status = s.status;
      showResult();
    } else if (s.status === 'paused' || s.status === 'running') {
      // 离开期间一律回到可手动继续的暂停态，避免计时偷偷跑
      state.status = 'paused';
      showCard('pause');
      hideOverlay();
    } else {
      state.status = 'ready';
      showCard('ready');
      hideOverlay();
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入 ---------------- */

  function bindInput() {
    // 触屏滑动控制方向
    var swipeStart = null;
    dom.canvas.addEventListener('pointerdown', function (e) {
      swipeStart = { x: e.clientX, y: e.clientY };
    });
    dom.canvas.addEventListener('pointerup', function (e) {
      if (!swipeStart) return;
      var dx = e.clientX - swipeStart.x;
      var dy = e.clientY - swipeStart.y;
      swipeStart = null;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < 20) {
        // 轻点：未开局则开始，已暂停则继续
        if (state.status === 'ready') startGame();
        else if (state.status === 'paused') togglePause();
        return;
      }
      if (ax > ay) tryMove(0, dx > 0 ? 1 : -1);
      else tryMove(dy > 0 ? 1 : -1, 0);
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = e.key;

      if (k === ' ' || k === 'Spacebar') {
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        if (state.status === 'running' || state.status === 'paused') togglePause();
        else if (state.status === 'ready') startGame();
        return;
      }
      if (k === 'p' || k === 'P') {
        if (state.status === 'running' || state.status === 'paused') togglePause();
        return;
      }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); tryMove(-1, 0); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); tryMove(1, 0); }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); tryMove(0, -1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); tryMove(0, 1); }
    });

    dom.btnStart.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') togglePause();
      else if (state.status === 'ready') startGame();
    });

    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      togglePause();
    });

    dom.btnHint.addEventListener('click', function () {
      sfx('click');
      useHint();
    });

    dom.btnRestart.addEventListener('click', function () {
      sfx('click');
      newGame();
    });

    dom.btnAgain.addEventListener('click', function () {
      sfx('click');
      newGame();
    });

    dom.btnNext.addEventListener('click', function () {
      sfx('click');
      nextLevel();
    });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (!btn || !dom.diffs.contains(btn)) return;
      switchDiff(btn.getAttribute('data-diff'));
    });

    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) hideOverlay();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.status === 'running') togglePause();
      if (document.hidden) saveState(true);
    });

    window.addEventListener('pagehide', function () { saveState(true); });
    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) {
      new window.ResizeObserver(fitCanvas).observe(dom.canvas.parentNode);
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: document.getElementById('canvas'),
      level: document.getElementById('level'),
      steps: document.getElementById('steps'),
      time: document.getElementById('time'),
      best: document.getElementById('best'),
      diffs: document.getElementById('diffs'),
      btnPause: document.getElementById('btn-pause'),
      btnHint: document.getElementById('btn-hint'),
      btnRestart: document.getElementById('btn-restart'),
      btnStart: document.getElementById('btn-start'),
      btnAgain: document.getElementById('btn-again'),
      btnNext: document.getElementById('btn-next'),
      card: document.getElementById('card'),
      cardTitle: document.getElementById('card-title'),
      cardSub: document.getElementById('card-sub'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayScore: document.getElementById('overlay-score'),
      overlayLevel: document.getElementById('overlay-level'),
      recordBadge: document.getElementById('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) {}
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    document.addEventListener('ys:langchange', function () {
      syncDiffs();
      syncButtons();
      if (!dom.card.hidden) showCard(dom.card.dataset.kind || 'ready');
      if (!dom.overlay.hidden) renderResult();
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
