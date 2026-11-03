/**
 * 2048 · 游戏逻辑
 * 纯前端、无依赖。
 *
 * 动画设计：外层 .tile 只负责位移（transform 过渡），内层 .tile__face 负责缩放，
 * 两套变换分开，合并时的弹跳才不会把滑动位置覆盖掉。
 * [gyh 2026-11-02 新增]
 */
(function () {
  'use strict';

  var SIZE = 4;
  var STORAGE_KEY = 'ysgame-2048-state';
  var BEST_KEY = 'ysgame-2048-best';
  var MAX_UNDO = 20;
  var SWIPE_MIN = 24;

  var VECTORS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  var dom = {
    board: document.getElementById('board'),
    tiles: document.getElementById('tiles'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    btnNew: document.getElementById('btn-new'),
    btnUndo: document.getElementById('btn-undo'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayScore: document.getElementById('overlay-score'),
    btnContinue: document.getElementById('btn-continue'),
    btnAgain: document.getElementById('btn-again')
  };

  var state = {
    cells: [],
    score: 0,
    best: 0,
    won: false,      // 拼到过 2048，只提示一次
    over: false,
    undo: [],
    overlay: null    // null | 'win' | 'over'
  };

  var uid = 1;

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function emptyGrid() {
    state.cells = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(null);
      state.cells.push(row);
    }
  }

  /* ------------------------------------------------------------------
     方块
     ------------------------------------------------------------------ */

  function place(tile, r, c) {
    tile.r = r;
    tile.c = c;
    tile.el.style.setProperty('--r', r);
    tile.el.style.setProperty('--c', c);
  }

  function paintTile(tile, value) {
    tile.value = value;
    var face = tile.face;
    face.textContent = value;
    face.setAttribute('data-value', value);
    face.classList.toggle('tile__face--super', value > 2048);

    var digits = String(value).length;
    tile.el.classList.toggle('tile--sm', digits === 3);
    tile.el.classList.toggle('tile--xs', digits >= 4);
  }

  function createTile(value, r, c, isNew) {
    var node = document.createElement('div');
    node.className = 'tile';

    var face = document.createElement('span');
    face.className = 'tile__face';
    node.appendChild(face);

    var tile = { id: uid++, value: value, r: r, c: c, el: node, face: face };
    paintTile(tile, value);
    place(tile, r, c);

    if (isNew) {
      node.classList.add('tile--new');
      // 动画只播一次，播完摘掉类，避免后续重绘又弹一遍
      node.addEventListener('animationend', function () {
        node.classList.remove('tile--new');
      }, { once: true });
    }

    dom.tiles.appendChild(node);
    return tile;
  }

  function clearTiles() {
    dom.tiles.innerHTML = '';
  }

  function removeLater(node, delay) {
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, delay || 200);
  }

  /* ------------------------------------------------------------------
     生成新方块
     ------------------------------------------------------------------ */

  function spawnRandom() {
    var free = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!state.cells[r][c]) free.push([r, c]);
      }
    }
    if (!free.length) return null;

    var spot = free[Math.floor(Math.random() * free.length)];
    // 2 占九成，4 占一成，和原版一致
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = createTile(value, spot[0], spot[1], true);
    state.cells[spot[0]][spot[1]] = tile;
    return tile;
  }

  /* ------------------------------------------------------------------
     判断
     ------------------------------------------------------------------ */

  function canMove() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var tile = state.cells[r][c];
        if (!tile) return true;
        if (c + 1 < SIZE) {
          var right = state.cells[r][c + 1];
          if (right && right.value === tile.value) return true;
        }
        if (r + 1 < SIZE) {
          var down = state.cells[r + 1][c];
          if (down && down.value === tile.value) return true;
        }
      }
    }
    return false;
  }

  function hasValue(value) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (state.cells[r][c] && state.cells[r][c].value === value) return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------
     分数
     ------------------------------------------------------------------ */

  function popScore(gained) {
    var host = dom.score.parentNode;
    var span = document.createElement('span');
    span.className = 'score-pop';
    span.textContent = '+' + gained;
    host.appendChild(span);
    removeLater(span, 780);
  }

  function renderScore(gained) {
    dom.score.textContent = state.score;
    dom.best.textContent = state.best;
    if (gained > 0) popScore(gained);
  }

  function refreshUndo() {
    dom.btnUndo.disabled = state.undo.length === 0;
  }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function gridValues() {
    var grid = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(state.cells[r][c] ? state.cells[r][c].value : 0);
      grid.push(row);
    }
    return grid;
  }

  function snapshot() {
    return { grid: gridValues(), score: state.score, won: state.won };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        grid: gridValues(),
        score: state.score,
        won: state.won,
        over: state.over
      }));
    } catch (e) {
      /* 隐私模式下写不进去，游戏照常能玩 */
    }
  }

  function loadBest() {
    var v = 0;
    try { v = parseInt(localStorage.getItem(BEST_KEY) || '0', 10); } catch (e) {}
    state.best = isNaN(v) ? 0 : v;
    dom.best.textContent = state.best;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || !Array.isArray(data.grid) || data.grid.length !== SIZE) return false;

    // 先校验再落盘，避免读一半把界面弄脏
    for (var r = 0; r < SIZE; r++) {
      if (!Array.isArray(data.grid[r]) || data.grid[r].length !== SIZE) return false;
    }

    clearTiles();
    emptyGrid();
    var any = false;
    for (var i = 0; i < SIZE; i++) {
      for (var j = 0; j < SIZE; j++) {
        var v = data.grid[i][j];
        if (typeof v === 'number' && v > 0) {
          state.cells[i][j] = createTile(v, i, j, false);
          any = true;
        }
      }
    }
    if (!any) return false;

    state.score = typeof data.score === 'number' ? data.score : 0;
    state.won = !!data.won;
    state.over = !!data.over;

    // 存档里的分数可能比本地最高分高（换浏览器、清过缓存），兜一下
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (e) {}
    }

    renderScore(0);

    if (state.over) {
      showOverlay('over');
    } else if (!canMove()) {
      // 读档时就已经走不动了，别让玩家对着死局发呆
      state.over = true;
      showOverlay('over');
      save();
    }
    return true;
  }

  /* ------------------------------------------------------------------
     结算浮层
     ------------------------------------------------------------------ */

  function showOverlay(kind) {
    state.overlay = kind;

    var titleKey = kind === 'win' ? 'win_title' : 'over_title';
    var subKey = kind === 'win' ? 'win_sub' : 'over_sub';

    // data-i18n 留着，切语言时 I18N 会自动重绘
    dom.overlayTitle.setAttribute('data-i18n', titleKey);
    dom.overlaySub.setAttribute('data-i18n', subKey);
    dom.overlayTitle.textContent = t(titleKey);
    dom.overlaySub.textContent = t(subKey);

    dom.overlayScore.textContent = state.score;
    dom.btnContinue.hidden = kind !== 'win';
    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    state.overlay = null;
    dom.overlay.hidden = true;
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  // [gyh 2026-11-03 修改] 改用全站共用的 YSound，音色与音量统一维护在 js/sound.js
  function soundMove() {
    if (window.YSound) window.YSound.play('move');
  }

  function soundMerge(value) {
    // 数值越大音越高；引擎那边会按层数压住，不会刺耳
    if (window.YSound) window.YSound.play('merge', { level: Math.log2(value) });
  }

  function soundWin() {
    if (window.YSound) window.YSound.play('win');
  }

  function soundOver() {
    if (window.YSound) window.YSound.play('lose');
  }

  /* ------------------------------------------------------------------
     核心：移动
     ------------------------------------------------------------------ */

  function move(dir) {
    if (state.over || state.overlay === 'win') return;

    var v = VECTORS[dir];
    if (!v) return;

    var before = snapshot();
    var rows = v.dr > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    var cols = v.dc > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];

    var mergedIds = Object.create(null);
    var moved = false;
    var gained = 0;
    var ghosts = [];   // 被合并掉的方块（滑过去再淡出）
    var pops = [];     // 合并后留下的方块（换数字 + 弹一下）
    var mergedTop = 0;

    for (var i = 0; i < SIZE; i++) {
      for (var j = 0; j < SIZE; j++) {
        var r = rows[i];
        var c = cols[j];
        var tile = state.cells[r][c];
        if (!tile) continue;

        var nr = r;
        var nc = c;
        var didMerge = false;

        while (true) {
          var tr = nr + v.dr;
          var tc = nc + v.dc;
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;

          var other = state.cells[tr][tc];
          if (!other) {
            nr = tr;
            nc = tc;
            continue;
          }

          // 目标是自己、或本轮已经合并过，都不能再吃
          if (other.value === tile.value && !mergedIds[other.id]) {
            mergedIds[other.id] = true;
            state.cells[r][c] = null;
            tile.dead = true;

            ghosts.push({ tile: tile, r: tr, c: tc });

            other.value *= 2;
            gained += other.value;
            mergedTop = Math.max(mergedTop, other.value);

            pops.push(other);

            didMerge = true;
            moved = true;
          }
          break;
        }

        if (didMerge) continue;

        if (nr !== r || nc !== c) {
          state.cells[r][c] = null;
          state.cells[nr][nc] = tile;
          place(tile, nr, nc);
          moved = true;
        }
      }
    }

    if (!moved) {
      // 方向撞墙，格子没动。顺便确认是不是已经无路可走
      // （读档进来就是死局时，靠这一步补上结算）
      if (!state.over && !canMove()) {
        state.over = true;
        save();
        showOverlay('over');
      }
      return;
    }

    // 被吃掉的：先滑到目标位置，再淡出
    for (var g = 0; g < ghosts.length; g++) {
      var ghost = ghosts[g];
      ghost.tile.el.style.setProperty('--r', ghost.r);
      ghost.tile.el.style.setProperty('--c', ghost.c);
      ghost.tile.el.classList.add('tile--ghost');
      removeLater(ghost.tile.el, 200);
    }

    // 合并后的：换数字、重播弹跳
    for (var p = 0; p < pops.length; p++) {
      var pt = pops[p];
      paintTile(pt, pt.value);
      pt.el.classList.remove('tile--pop');
      void pt.el.offsetWidth; // 强制回流，动画才能重新开始
      pt.el.classList.add('tile--pop');
    }

    state.score += gained;
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (e) {}
    }
    renderScore(gained);

    // 记一步历史，供撤销
    state.undo.push(before);
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    refreshUndo();

    spawnRandom();
    save();

    if (gained === 0) soundMove();
    if (gained > 0) soundMerge(mergedTop);

    if (!state.won && hasValue(2048)) {
      state.won = true;
      save();
      soundWin();
      showOverlay('win');
    } else if (!canMove()) {
      state.over = true;
      save();
      soundOver();
      showOverlay('over');
    }
  }

  /* ------------------------------------------------------------------
     开局 / 撤销
     ------------------------------------------------------------------ */

  function newGame(ask) {
    // 只要动过手（哪怕还没合并出分）就问一句，别让人白玩一局
    var inProgress = state.undo.length > 0 || state.score > 0;
    if (ask && !state.over && inProgress) {
      if (!window.confirm(t('confirm_new'))) return;
    }

    clearTiles();
    emptyGrid();

    state.score = 0;
    state.won = false;
    state.over = false;
    state.undo = [];
    state.overlay = null;

    hideOverlay();
    spawnRandom();
    spawnRandom();

    renderScore(0);
    refreshUndo();
    save();
  }

  function undo() {
    if (!state.undo.length) return;

    var snap = state.undo.pop();
    clearTiles();
    emptyGrid();

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (snap.grid[r][c] > 0) {
          state.cells[r][c] = createTile(snap.grid[r][c], r, c, false);
        }
      }
    }

    state.score = snap.score;
    state.won = snap.won;
    state.over = false;

    hideOverlay();
    renderScore(0);
    refreshUndo();
    save();
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.altKey) return;

      var dir = KEYMAP[e.key];
      if (!dir) return;

      e.preventDefault();
      move(dir);
    });
  }

  function bindTouch() {
    var start = null;

    dom.board.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    // 在棋盘上滑动时别让页面跟着滚
    dom.board.addEventListener('touchmove', function (e) {
      if (start && e.cancelable) e.preventDefault();
    }, { passive: false });

    dom.board.addEventListener('touchend', function (e) {
      if (!start) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - start.x;
      var dy = touch.clientY - start.y;
      start = null;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        move(dx > 0 ? 'right' : 'left');
      } else {
        move(dy > 0 ? 'down' : 'up');
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function init() {
    loadBest();

    if (!load()) newGame(false);
    refreshUndo();

    dom.btnNew.addEventListener('click', function () { newGame(true); });
    dom.btnUndo.addEventListener('click', undo);

    dom.btnContinue.addEventListener('click', function () {
      hideOverlay();
      save();
    });

    dom.btnAgain.addEventListener('click', function () { newGame(false); });

    bindKeyboard();
    bindTouch();

    // 切语言时浮层文案跟着重绘（data-i18n 已挂在标题/副标题上）
    document.addEventListener('ys:langchange', function () {
      if (state.overlay) showOverlay(state.overlay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
