/**
 * 贪吃蛇 · 游戏逻辑
 * canvas 绘制，无依赖。
 *
 * 几个手感上的取舍：
 *  1. 一进来先停在「准备好了就开始」，不会一打开就撞墙；
 *  2. 转向用队列缓存两格，快速连按「上右上右」也能照做，不会丢输入；
 *  3. 长度越长走得越快，但有个上限，不至于快到没法玩；
 *  4. 切走标签页自动暂停，回来接着走，不会一回来就死。
 * [gyh 2026-11-03 新增]
 */
(function () {
  'use strict';

  var GRID = 17;
  var BASE_MS = 200;      // 初始每步毫秒
  var MIN_MS = 92;        // 最快每步毫秒
  var BEST_KEY = 'ysgame-snake-best';

  var DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  var state = {
    snake: [],
    dir: { x: 1, y: 0 },
    queue: [],
    food: { x: 0, y: 0 },
    score: 0,
    best: 0,
    status: 'ready',     // ready | running | paused | over
    acc: 0
  };

  var lastTs = 0;
  var cell = 20;
  var ctx = null;

  var dom = {
    canvas: document.getElementById('canvas'),
    score: document.getElementById('score'),
    len: document.getElementById('len'),
    best: document.getElementById('best'),
    btnPause: document.getElementById('btn-pause'),
    btnNew: document.getElementById('btn-new'),
    btnAgain: document.getElementById('btn-again'),
    btnStart: document.getElementById('btn-start'),
    card: document.getElementById('card'),
    cardTitle: document.getElementById('card-title'),
    cardSub: document.getElementById('card-sub'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayScore: document.getElementById('overlay-score'),
    overlayLen: document.getElementById('overlay-len')
  };

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function stepMs() {
    return Math.max(MIN_MS, BASE_MS - (state.snake.length - 3) * 5);
  }

  function setI18n(el, key) {
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.len.textContent = String(state.snake.length);
    dom.best.textContent = String(state.best);
  }

  /* ------------------------------------------------------------------
     画布
     ------------------------------------------------------------------ */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var size = Math.max(1, Math.round(rect.width));
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);

    dom.canvas.width = Math.round(size * dpr);
    dom.canvas.height = Math.round(size * dpr);

    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cell = size / GRID;
    draw(performance.now());
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFood(now) {
    if (!state.food) return;

    var cx = (state.food.x + 0.5) * cell;
    var cy = (state.food.y + 0.5) * cell;
    var pulse = 1 + Math.sin(now / 520) * 0.05;
    var r = cell * 0.3 * pulse;

    // 果子
    ctx.fillStyle = '#C0806F';
    ctx.beginPath();
    ctx.arc(cx, cy + cell * 0.03, r, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255, 253, 248, .5)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.3, r * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // 叶子
    ctx.fillStyle = '#8FA88C';
    ctx.save();
    ctx.translate(cx + r * 0.35, cy - r * 1.05);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    var dead = state.status === 'over';
    var bodyColor = dead ? '#B08A83' : '#7E9B84';
    var headColor = dead ? '#9C756F' : '#5F7F68';

    for (var i = state.snake.length - 1; i >= 0; i--) {
      var seg = state.snake[i];
      var inset = cell * 0.055;
      var radius = cell * 0.3;

      ctx.fillStyle = i === 0 ? headColor : bodyColor;
      rrect(
        seg.x * cell + inset,
        seg.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
        radius
      );
      ctx.fill();
    }

    // 眼睛：朝着走的方向看
    var head = state.snake[0];
    if (!head) return;

    var hx = (head.x + 0.5) * cell;
    var hy = (head.y + 0.5) * cell;
    var dx = state.dir.x;
    var dy = state.dir.y;
    var forward = cell * 0.15;
    var side = cell * 0.17;
    var ex = dx * forward;
    var ey = dy * forward;
    var sx = dx === 0 ? side : 0;
    var sy = dx === 0 ? 0 : side;

    var eyes = [[hx + ex + sx, hy + ey + sy], [hx + ex - sx, hy + ey - sy]];

    for (var e = 0; e < 2; e++) {
      ctx.fillStyle = '#FFFDF8';
      ctx.beginPath();
      ctx.arc(eyes[e][0], eyes[e][1], cell * 0.13, 0, Math.PI * 2);
      ctx.fill();

      if (!dead) {
        ctx.fillStyle = '#454B59';
        ctx.beginPath();
        ctx.arc(
          eyes[e][0] + dx * cell * 0.045,
          eyes[e][1] + dy * cell * 0.045,
          cell * 0.055, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  function draw(now) {
    if (!ctx) return;

    var size = cell * GRID;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#E7DCC8';
    ctx.fillRect(0, 0, size, size);

    // 棋盘的细点，给一点参照，不至于眼花
    ctx.fillStyle = 'rgba(69, 75, 89, .12)';
    var dot = Math.max(0.6, cell * 0.038);
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        ctx.beginPath();
        ctx.arc((c + 0.5) * cell, (r + 0.5) * cell, dot, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawFood(now || 0);
    drawSnake();
  }

  /* ------------------------------------------------------------------
     开局 / 结束
     ------------------------------------------------------------------ */

  function placeFood() {
    var free = [];
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        var busy = false;
        for (var i = 0; i < state.snake.length; i++) {
          if (state.snake[i].x === c && state.snake[i].y === r) { busy = true; break; }
        }
        if (!busy) free.push({ x: c, y: r });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.dataset.kind = kind;

    if (kind === 'pause') {
      setI18n(dom.cardTitle, 'pause_title');
      setI18n(dom.cardSub, 'pause_sub');
      setI18n(dom.btnStart, 'btn_resume');
    } else {
      setI18n(dom.cardTitle, 'start_title');
      setI18n(dom.cardSub, 'start_sub');
      setI18n(dom.btnStart, 'btn_start');
    }
  }

  function hideCard() {
    dom.card.hidden = true;
  }

  function syncPauseButton() {
    if (state.status === 'paused') {
      setI18n(dom.btnPause, 'btn_resume');
      dom.btnPause.disabled = false;
      return;
    }
    setI18n(dom.btnPause, 'btn_pause');
    dom.btnPause.disabled = (state.status !== 'running');
  }

  function reset() {
    var mid = Math.floor(GRID / 2);
    state.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ];
    state.dir = { x: 1, y: 0 };
    state.queue = [];
    state.score = 0;
    state.status = 'ready';
    state.acc = 0;
    state.food = placeFood();

    dom.overlay.hidden = true;
    showCard('ready');
    syncPauseButton();
    refreshHud();
    draw(performance.now());
  }

  function startRunning() {
    if (state.status === 'over') return;
    state.status = 'running';
    state.acc = 0;
    hideCard();
    syncPauseButton();
    soundStart();
  }

  function pause() {
    if (state.status !== 'running') return;
    state.status = 'paused';
    showCard('pause');
    syncPauseButton();
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    state.acc = 0;
    hideCard();
    syncPauseButton();
  }

  function die() {
    state.status = 'over';
    state.queue = [];
    soundDie();
    syncPauseButton();
    draw(performance.now());

    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    refreshHud();

    dom.overlayTitle.setAttribute('data-i18n', 'over_title');
    dom.overlaySub.setAttribute('data-i18n', 'over_sub');
    dom.overlayTitle.textContent = t('over_title');
    dom.overlaySub.textContent = t('over_sub');
    dom.overlayScore.textContent = String(state.score);
    dom.overlayLen.textContent = String(state.snake.length);
    dom.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------
     每一步
     ------------------------------------------------------------------ */

  function step() {
    if (state.queue.length) state.dir = state.queue.shift();

    var head = state.snake[0];
    var nx = head.x + state.dir.x;
    var ny = head.y + state.dir.y;

    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      die();
      return;
    }

    var eating = !!state.food && state.food.x === nx && state.food.y === ny;
    // 不进食时尾巴会缩走，那一格可以走
    var limit = eating ? state.snake.length : state.snake.length - 1;

    for (var i = 0; i < limit; i++) {
      if (state.snake[i].x === nx && state.snake[i].y === ny) {
        die();
        return;
      }
    }

    state.snake.unshift({ x: nx, y: ny });

    if (eating) {
      state.score++;
      state.food = placeFood();
      if (state.score > state.best) {
        state.best = state.score;
        saveBest();
      }
      soundEat();
    } else {
      state.snake.pop();
    }

    refreshHud();
  }

  /* ------------------------------------------------------------------
     转向
     ------------------------------------------------------------------ */

  function turn(name) {
    var d = DIRS[name];
    if (!d || state.status === 'over') return;

    if (state.status === 'ready') {
      // 开局不允许直接掉头
      if (d.x === -state.dir.x && d.y === -state.dir.y) return;
      state.dir = d;
      startRunning();
      return;
    }

    if (state.status === 'paused') return;

    var last = state.queue.length
      ? state.queue[state.queue.length - 1]
      : state.dir;

    // 反向和同向都忽略；队列最多存两个转向，够连按两下
    if (last.x + d.x === 0 && last.y + d.y === 0) return;
    if (last.x === d.x && last.y === d.y) return;
    if (state.queue.length >= 2) return;

    state.queue.push(d);
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  // [gyh 2026-11-03 修改] 统一走全站音效引擎
  function soundEat() { if (window.YSound) window.YSound.play('eat'); }
  function soundDie() { if (window.YSound) window.YSound.play('lose'); }
  function soundStart() { if (window.YSound) window.YSound.play('start'); }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function saveBest() {
    try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (e) {}
  }

  function loadBest() {
    var raw = null;
    try { raw = localStorage.getItem(BEST_KEY); } catch (e) {}
    var n = parseInt(raw, 10);
    if (n > 0) state.best = n;
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  function newGame(ask) {
    var inProgress = state.status === 'running' || state.status === 'paused';
    if (ask && inProgress && state.score > 0) {
      if (!window.confirm(t('confirm_new'))) return;
    }
    reset();
  }

  function bindInput() {
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var key = e.key;
      var handled = true;

      if (key === 'ArrowUp' || key === 'w' || key === 'W') turn('up');
      else if (key === 'ArrowDown' || key === 's' || key === 'S') turn('down');
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A') turn('left');
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') turn('right');
      else if (key === ' ' || key === 'Spacebar') {
        // 焦点在按钮上时，空格交给按钮，别暂停两次
        var tag = e.target && e.target.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        if (state.status === 'running') pause();
        else if (state.status === 'paused') resume();
        else if (state.status === 'ready') startRunning();
      } else {
        handled = false;
      }

      if (handled) e.preventDefault();
    });

    // 触屏滑动
    var touch = null;

    dom.canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t0 = e.touches[0];
      touch = { x: t0.clientX, y: t0.clientY };
      if (state.status === 'ready') startRunning();
    }, { passive: true });

    dom.canvas.addEventListener('touchmove', function (e) {
      if (!touch || e.touches.length !== 1) return;
      var t1 = e.touches[0];
      var dx = t1.clientX - touch.x;
      var dy = t1.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;

      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
      else turn(dy > 0 ? 'down' : 'up');

      touch = null;
    }, { passive: true });

    dom.canvas.addEventListener('touchend', function () {
      touch = null;
    }, { passive: true });

    // 点一下棋盘也能开始
    dom.canvas.addEventListener('click', function () {
      if (state.status === 'ready') startRunning();
    });

    var padBtns = document.querySelectorAll('.pad__btn');
    for (var i = 0; i < padBtns.length; i++) {
      padBtns[i].addEventListener('click', function () {
        turn(this.getAttribute('data-dir'));
      });
    }

    dom.btnStart.addEventListener('click', function () {
      if (state.status === 'paused') resume();
      else startRunning();
    });

    dom.btnPause.addEventListener('click', function () {
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
    });

    dom.btnNew.addEventListener('click', function () { newGame(true); });
    dom.btnAgain.addEventListener('click', function () { newGame(false); });

    // 切走标签页自动暂停，回来时不会直接撞上
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
    });

    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) {
      new ResizeObserver(fitCanvas).observe(dom.canvas.parentNode);
    }
  }

  /* ------------------------------------------------------------------
     主循环
     ------------------------------------------------------------------ */

  function loop(ts) {
    window.requestAnimationFrame(loop);

    var dt = lastTs ? ts - lastTs : 0;
    lastTs = ts;

    if (state.status === 'running') {
      // 卡顿或后台回来时不补太多步，最多补一步的量
      state.acc += Math.min(dt, 240);
      if (state.acc >= stepMs()) {
        state.acc = 0;
        step();
      }
    }

    draw(ts);
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function init() {
    loadBest();
    reset();
    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    document.addEventListener('ys:langchange', function () {
      // 静态文案由 I18N 重绘，卡片和暂停按钮的文案要重设
      if (!dom.card.hidden) showCard(dom.card.dataset.kind || 'ready');
      syncPauseButton();

      if (!dom.overlay.hidden) {
        dom.overlayTitle.textContent = t('over_title');
        dom.overlaySub.textContent = t('over_sub');
      }
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
