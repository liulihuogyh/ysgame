/* ==========================================================================
   炸弹人（原创几何像素 · 不使用任何第三方商标素材）
   原生 JS · Canvas · 无外部依赖
   [bomber-dev 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     常量
     ---------------------------------------------------------------------- */
  var COLS = 13;            // 奇数边长（外围钢墙 + 内部棋盘格钢柱）
  var ROWS = 13;
  var CELL = 40;            // 逻辑像素 / 格
  var W = COLS * CELL;      // 逻辑分辨率 520 x 520
  var H = ROWS * CELL;

  var EMPTY = 0;
  var STEEL = 1;            // 钢墙（不可破坏）
  var SOFT  = 2;            // 软墙（可炸开）
  var EXIT  = 3;            // 隐藏出口（炸开软墙后显现）

  var PLAYER_SPEED = 138;   // 玩家移动速度 px/s（略快于困难敌人，保证可逃脱）
  var FLAME_TIME   = 0.45;  // 火焰持续秒数
  var INVULN_TIME  = 2.0;   // 受伤后无敌秒数
  var HALF = CELL * 0.40;   // 玩家 / 敌人碰撞半宽

  var SCORE_WALL = 10;
  var SCORE_POWER = 50;
  var SCORE_ENEMY = 200;

  var STATE_KEY = 'ysgame-bomber-state';
  var BEST_KEY  = 'ysgame-bomber-best';
  var DIFF_KEY  = 'ysgame-bomber-diff';

  var START = { cx: 1, cy: 1 };

  /* ----------------------------------------------------------------------
     难度配置（三档真正拉开）
     ---------------------------------------------------------------------- */
  var DIFF = {
    easy: {
      label: 'easy',
      enemyCount: 2,
      enemySpeed: 60,
      ai: 'random',          // 纯随机游走
      chaseChance: 0,
      softWallDensity: 0.42, // 软墙密度低
      blastRadius: 2,
      bombFuse: 2.6,         // 引信稍长
      maxBombs: 1,
      powerupChance: 0.18,
      lives: 3
    },
    medium: {
      label: 'medium',
      enemyCount: 4,
      enemySpeed: 88,
      ai: 'chase',           // 部分会朝玩家方向走
      chaseChance: 0.5,
      softWallDensity: 0.56,
      blastRadius: 2,
      bombFuse: 2.2,
      maxBombs: 1,
      powerupChance: 0.22,
      lives: 3
    },
    hard: {
      label: 'hard',
      enemyCount: 6,
      enemySpeed: 124,       // 移动快
      ai: 'chase',           // BFS 追玩家、绕开墙
      chaseChance: 1,
      softWallDensity: 0.72, // 软墙密度高、更绕
      blastRadius: 3,
      bombFuse: 1.8,         // 引信短
      maxBombs: 2,
      powerupChance: 0.26,
      lives: 3
    }
  };

  var ENEMY_COLORS = ['#C2453B', '#7A4FB0', '#3F9D6B', '#C99A2E', '#3B7AC2', '#B04F8C', '#4FA0A8', '#B0723F'];

  /* ----------------------------------------------------------------------
     DOM
     ---------------------------------------------------------------------- */
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');

  var el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    diffs: document.getElementById('diffs'),
    card: document.getElementById('card'),
    cardTitle: document.getElementById('card-title'),
    cardSub: document.getElementById('card-sub'),
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    btnRestart: document.getElementById('btn-restart'),
    btnHint: document.getElementById('btn-hint'),
    btnBomb: document.getElementById('btn-bomb'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayScore: document.getElementById('overlay-score'),
    overlayLevel: document.getElementById('overlay-level'),
    recordBadge: document.getElementById('record-badge'),
    btnAgain: document.getElementById('btn-again'),
    btnNext: document.getElementById('btn-next'),
    toast: document.getElementById('toast'),
    touch: document.getElementById('touch')
  };

  /* ----------------------------------------------------------------------
     游戏状态
     ---------------------------------------------------------------------- */
  var state = {
    running: false,
    paused: false,
    over: false,
    won: false,
    diff: 'medium',
    level: 1,
    score: 0,
    lives: 3,
    best: 0,
    newRecord: false
  };

  var grid = [];            // grid[y][x]
  var exitCell = { cx: 1, cy: 1, revealed: false };
  var player = {
    x: 0, y: 0, dir: null, speed: PLAYER_SPEED,
    invuln: 0, blastRadius: 2, maxBombs: 1, activeBombs: 0
  };
  var bombs = [];
  var flames = [];
  var powerups = [];
  var enemies = [];

  var dirStack = [];        // 当前按下的方向（最后一个为生效方向）
  var toastTimer = null;

  /* ----------------------------------------------------------------------
     工具函数
     ---------------------------------------------------------------------- */
  function I18N_t(key) {
    return (window.I18N && window.I18N.t) ? window.I18N.t(key) : key;
  }

  function center(cx, cy) {
    return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  }

  function inBounds(cx, cy) {
    return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS;
  }

  function playerTile() {
    var cx = Math.round((player.x - CELL / 2) / CELL);
    var cy = Math.round((player.y - CELL / 2) / CELL);
    cx = Math.max(0, Math.min(COLS - 1, cx));
    cy = Math.max(0, Math.min(ROWS - 1, cy));
    return { cx: cx, cy: cy };
  }

  function enemyTile(en) {
    var cx = Math.round((en.x - CELL / 2) / CELL);
    var cy = Math.round((en.y - CELL / 2) / CELL);
    return { cx: Math.max(0, Math.min(COLS - 1, cx)), cy: Math.max(0, Math.min(ROWS - 1, cy)) };
  }

  function bombAt(cx, cy) {
    for (var i = 0; i < bombs.length; i++) {
      if (bombs[i].cx === cx && bombs[i].cy === cy) return bombs[i];
    }
    return null;
  }

  function flameAt(cx, cy) {
    for (var i = 0; i < flames.length; i++) {
      if (flames[i].cx === cx && flames[i].cy === cy && flames[i].timer > 0) return true;
    }
    return false;
  }

  /* ----------------------------------------------------------------------
     地图生成
     ---------------------------------------------------------------------- */
  function genGrid(density) {
    grid = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) {
          row.push(STEEL);                 // 外围钢墙
        } else if (x % 2 === 0 && y % 2 === 0) {
          row.push(STEEL);                 // 内部棋盘格钢柱
        } else {
          row.push(EMPTY);
        }
      }
      grid.push(row);
    }

    // 软墙
    var safe = function (x, y) {
      // 玩家出生角保持空地，避免一开局被困
      return (x <= 2 && y <= 1) || (x <= 1 && y <= 2);
    };
    var softCells = [];
    for (var yy = 1; yy < ROWS - 1; yy++) {
      for (var xx = 1; xx < COLS - 1; xx++) {
        if (grid[yy][xx] !== EMPTY) continue;
        if (safe(xx, yy)) continue;
        if (Math.random() < density) {
          grid[yy][xx] = SOFT;
          softCells.push({ cx: xx, cy: yy });
        }
      }
    }

    // 若软墙太少（极端随机），强制铺几块，保证有得炸
    if (softCells.length < 6) {
      for (var k = 0; k < 30 && softCells.length < 6; k++) {
        var rx = 1 + Math.floor(Math.random() * (COLS - 2));
        var ry = 1 + Math.floor(Math.random() * (ROWS - 2));
        if (grid[ry][rx] === EMPTY && !safe(rx, ry) && (rx + ry) > 4) {
          grid[ry][rx] = SOFT;
          softCells.push({ cx: rx, cy: ry });
        }
      }
    }

    // 隐藏出口：随机选一块远离出生角的软墙
    var pool = softCells.filter(function (c) { return (c.cx + c.cy) > 4; });
    if (pool.length === 0) pool = softCells;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    exitCell = { cx: pick.cx, cy: pick.cy, revealed: false };
  }

  function spawnEnemies(count, speed) {
    enemies = [];
    var tries = 0;
    while (enemies.length < count && tries < 600) {
      tries++;
      var cx = 1 + Math.floor(Math.random() * (COLS - 2));
      var cy = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (grid[cy][cx] !== EMPTY) continue;
      if ((cx === exitCell.cx && cy === exitCell.cy)) continue;
      var dist = Math.abs(cx - START.cx) + Math.abs(cy - START.cy);
      if (dist < 6) continue;                 // 离玩家远一点，开局不秒杀
      var c = center(cx, cy);
      enemies.push({
        cx: cx, cy: cy, tcx: cx, tcy: cy,
        x: c.x, y: c.y, fromX: c.x, fromY: c.y, toX: c.x, toY: c.y,
        progress: 1, speed: speed, ldx: 0, ldy: 0,
        color: ENEMY_COLORS[enemies.length % ENEMY_COLORS.length]
      });
    }
  }

  /* ----------------------------------------------------------------------
     关卡构建
     ---------------------------------------------------------------------- */
  function buildLevel() {
    var d = DIFF[state.diff];
    var density = Math.min(d.softWallDensity + (state.level - 1) * 0.03, 0.82);
    var count = Math.min(d.enemyCount + Math.floor((state.level - 1) / 2), 12);
    var speed = Math.min(d.enemySpeed + (state.level - 1) * 4, 165);

    genGrid(density);
    bombs = [];
    flames = [];
    powerups = [];

    var c = center(START.cx, START.cy);
    player.x = c.x; player.y = c.y; player.dir = null;
    player.invuln = 0; player.activeBombs = 0;
    player.blastRadius = (state.level === 1) ? d.blastRadius : player.blastRadius;
    player.maxBombs = (state.level === 1) ? d.maxBombs : player.maxBombs;

    spawnEnemies(count, speed);
    dirStack = [];
  }

  /* ----------------------------------------------------------------------
     存档
     ---------------------------------------------------------------------- */
  function save() {
    if (!state.running) return;            // 仅在开局后写入
    var st = {
      v: 1,
      diff: state.diff,
      level: state.level,
      score: state.score,
      lives: state.lives,
      blastRadius: player.blastRadius,
      maxBombs: player.maxBombs,
      grid: grid,
      exit: [exitCell.cx, exitCell.cy, exitCell.revealed ? 1 : 0],
      powerups: powerups.map(function (p) { return [p.cx, p.cy, p.type]; }),
      player: [playerTile().cx, playerTile().cy],
      enemies: enemies.map(function (e) { return [e.cx, e.cy]; })
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  function readSaved() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !st.grid || !DIFF[st.diff]) return null;
      return st;
    } catch (e) { return null; }
  }

  function resumeGame(st) {
    state.diff = st.diff;
    state.level = st.level || 1;
    state.score = st.score || 0;
    state.lives = (st.lives != null) ? st.lives : DIFF[st.diff].lives;
    grid = st.grid;
    exitCell = { cx: st.exit[0], cy: st.exit[1], revealed: !!st.exit[2] };
    powerups = (st.powerups || []).map(function (p) { return { cx: p[0], cy: p[1], type: p[2] }; });
    player.blastRadius = st.blastRadius || DIFF[st.diff].blastRadius;
    player.maxBombs = st.maxBombs || DIFF[st.diff].maxBombs;
    player.activeBombs = 0;

    bombs = []; flames = [];
    var c = center(st.player[0], st.player[1]);
    player.x = c.x; player.y = c.y; player.dir = null; player.invuln = 1.0;

    enemies = (st.enemies || []).map(function (e, i) {
      var cc = center(e[0], e[1]);
      return {
        cx: e[0], cy: e[1], tcx: e[0], tcy: e[1],
        x: cc.x, y: cc.y, fromX: cc.x, fromY: cc.y, toX: cc.x, toY: cc.y,
        progress: 1, speed: Math.min(DIFF[st.diff].enemySpeed + (state.level - 1) * 4, 165),
        ldx: 0, ldy: 0, color: ENEMY_COLORS[i % ENEMY_COLORS.length]
      };
    });

    state.running = true; state.paused = false; state.over = false; state.won = false;
    syncDiffButtons();
    hideCard();
    hideOverlay();
    updateHUD();
  }

  /* ----------------------------------------------------------------------
     开局 / 重开 / 下一关
     ---------------------------------------------------------------------- */
  function newGame() {
    var d = DIFF[state.diff];
    state.level = 1;
    state.score = 0;
    state.lives = d.lives;
    state.over = false;
    state.won = false;
    state.newRecord = false;
    player.blastRadius = d.blastRadius;
    player.maxBombs = d.maxBombs;
    buildLevel();
    state.running = true;
    state.paused = false;
    hideCard();
    hideOverlay();
    updateHUD();
    save();
  }

  function startGame() {
    var st = readSaved();
    if (st && st.diff === state.diff) {
      resumeGame(st);
    } else {
      newGame();
    }
  }

  function nextLevel() {
    state.level++;
    state.over = false;
    state.won = false;
    buildLevel();
    state.running = true;
    hideOverlay();
    updateHUD();
    save();
  }

  /* ----------------------------------------------------------------------
     输入
     ---------------------------------------------------------------------- */
  function active() {
    return state.running && !state.paused && !state.over;
  }

  function pressDir(d) {
    if (!active()) return;
    if (dirStack.indexOf(d) === -1) dirStack.push(d);
  }

  function releaseDir(d) {
    var i = dirStack.indexOf(d);
    if (i !== -1) dirStack.splice(i, 1);
  }

  function currentDir() {
    return dirStack.length ? dirStack[dirStack.length - 1] : null;
  }

  function placeBomb() {
    if (!active()) return;
    if (player.activeBombs >= player.maxBombs) return;
    var pt = playerTile();
    if (bombAt(pt.cx, pt.cy)) return;
    bombs.push({
      cx: pt.cx, cy: pt.cy,
      fuse: DIFF[state.diff].bombFuse,
      radius: player.blastRadius,
      exploded: false,
      placerLeft: false,
      owner: 'player'
    });
    player.activeBombs++;
    if (window.YSound) window.YSound.play('click');
  }

  function bindInput() {
    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if (k === 'arrowup' || k === 'w') { e.preventDefault(); pressDir('up'); }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); pressDir('down'); }
      else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); pressDir('left'); }
      else if (k === 'arrowright' || k === 'd') { e.preventDefault(); pressDir('right'); }
      else if (k === ' ' || k === 'j') { e.preventDefault(); placeBomb(); }
      else if (k === 'p') { e.preventDefault(); togglePause(); }
    });
    document.addEventListener('keyup', function (e) {
      var k = (e.key || '').toLowerCase();
      if (k === 'arrowup' || k === 'w') releaseDir('up');
      else if (k === 'arrowdown' || k === 's') releaseDir('down');
      else if (k === 'arrowleft' || k === 'a') releaseDir('left');
      else if (k === 'arrowright' || k === 'd') releaseDir('right');
    });

    // 触屏方向盘
    var dbtns = el.touch.querySelectorAll('.bk__dbtn');
    for (var i = 0; i < dbtns.length; i++) {
      (function (btn) {
        var d = btn.getAttribute('data-dir');
        var down = function (ev) { ev.preventDefault(); pressDir(d); };
        var up = function (ev) { ev.preventDefault(); releaseDir(d); };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointerleave', up);
        btn.addEventListener('pointercancel', up);
      })(dbtns[i]);
    }
    if (el.btnBomb) {
      el.btnBomb.addEventListener('pointerdown', function (ev) { ev.preventDefault(); placeBomb(); });
    }
  }

  /* ----------------------------------------------------------------------
     碰撞
     ---------------------------------------------------------------------- */
  function blockedForPlayer(cx, cy) {
    if (!inBounds(cx, cy)) return true;
    var cell = grid[cy][cx];
    if (cell === STEEL || cell === SOFT) return true;
    var b = bombAt(cx, cy);
    if (b) {
      var pt = playerTile();
      var onIt = (pt.cx === cx && pt.cy === cy);
      if (!(b.placerLeft === false && onIt)) return true;
    }
    return false;
  }

  function blockedForEnemy(cx, cy) {
    if (!inBounds(cx, cy)) return true;
    var cell = grid[cy][cx];
    if (cell === STEEL || cell === SOFT) return true;
    if (bombAt(cx, cy)) return true;
    return false;
  }

  function collidesPlayer(x, y) {
    var left = x - HALF, right = x + HALF, top = y - HALF, bottom = y + HALF;
    var cx0 = Math.floor(left / CELL), cx1 = Math.floor(right / CELL);
    var cy0 = Math.floor(top / CELL), cy1 = Math.floor(bottom / CELL);
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        if (blockedForPlayer(cx, cy)) return true;
      }
    }
    return false;
  }

  function tryMoveAxis(e, axis, sign, step) {
    var nv = e[axis] + sign * step;
    var test = { x: e.x, y: e.y };
    test[axis] = nv;
    if (!collidesPlayer(test.x, test.y)) { e[axis] = nv; return; }
    // 贴墙对齐
    if (axis === 'x') {
      if (sign > 0) e.x = Math.floor((e.x + HALF) / CELL) * CELL - HALF - 0.01;
      else e.x = (Math.floor((e.x - HALF) / CELL) + 1) * CELL + HALF + 0.01;
    } else {
      if (sign > 0) e.y = Math.floor((e.y + HALF) / CELL) * CELL - HALF - 0.01;
      else e.y = (Math.floor((e.y - HALF) / CELL) + 1) * CELL + HALF + 0.01;
    }
  }

  function snapLane(e, dx, dy, dt) {
    if (dx !== 0) {
      var row = Math.round((e.y - CELL / 2) / CELL);
      var c = row * CELL + CELL / 2;
      e.y += (c - e.y) * Math.min(1, dt * 12);
    } else if (dy !== 0) {
      var col = Math.round((e.x - CELL / 2) / CELL);
      var c2 = col * CELL + CELL / 2;
      e.x += (c2 - e.x) * Math.min(1, dt * 12);
    }
  }

  /* ----------------------------------------------------------------------
     玩家更新
     ---------------------------------------------------------------------- */
  function updatePlayer(dt) {
    if (player.invuln > 0) player.invuln -= dt;

    var d = currentDir();
    if (d) {
      var dx = d === 'left' ? -1 : d === 'right' ? 1 : 0;
      var dy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
      snapLane(player, dx, dy, dt);
      var step = player.speed * dt;
      if (dx !== 0) tryMoveAxis(player, 'x', dx, step);
      if (dy !== 0) tryMoveAxis(player, 'y', dy, step);
    }

    // 玩家离开刚放下的炸弹后，炸弹变实心
    for (var i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (b.placerLeft === false) {
        var pt = playerTile();
        if (!(pt.cx === b.cx && pt.cy === b.cy)) b.placerLeft = true;
      }
    }
  }

  /* ----------------------------------------------------------------------
     敌人 AI
     ---------------------------------------------------------------------- */
  function bfsNext(sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return null;
    var visited = [], prev = [];
    for (var y = 0; y < ROWS; y++) {
      visited.push(new Array(COLS).fill(false));
      prev.push(new Array(COLS).fill(null));
    }
    var q = [[sx, sy]];
    visited[sy][sx] = true;
    var found = false;
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    while (q.length) {
      var cur = q.shift();
      if (cur[0] === gx && cur[1] === gy) { found = true; break; }
      for (var i = 0; i < 4; i++) {
        var nx = cur[0] + dirs[i][0], ny = cur[1] + dirs[i][1];
        if (!inBounds(nx, ny) || visited[ny][nx]) continue;
        if (grid[ny][nx] === STEEL || grid[ny][nx] === SOFT) continue;
        if (bombAt(nx, ny)) continue;
        visited[ny][nx] = true;
        prev[ny][nx] = cur;
        q.push([nx, ny]);
      }
    }
    if (!found) return null;
    var path = [];
    var c = [gx, gy];
    while (c && !(c[0] === sx && c[1] === sy)) {
      path.push(c);
      c = prev[c[1]][c[0]];
    }
    if (path.length === 0) return null;
    var first = path[path.length - 1];
    return { cx: first[0], cy: first[1] };
  }

  function enemyChooseTarget(en) {
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    var opts = [];
    for (var i = 0; i < 4; i++) {
      var nx = en.cx + dirs[i][0], ny = en.cy + dirs[i][1];
      if (!blockedForEnemy(nx, ny)) opts.push({ cx: nx, cy: ny, dx: dirs[i][0], dy: dirs[i][1] });
    }
    if (opts.length === 0) return null;

    var d = DIFF[state.diff];
    if (d.ai === 'chase' && Math.random() < d.chaseChance) {
      var pt = playerTile();
      var step = bfsNext(en.cx, en.cy, pt.cx, pt.cy);
      if (step && !blockedForEnemy(step.cx, step.cy)) {
        en.ldx = step.cx - en.cx; en.ldy = step.cy - en.cy;
        return step;
      }
    }

    // 随机：尽量不回头
    var nonRev = opts.filter(function (o) {
      return !(o.dx === -en.ldx && o.dy === -en.ldy) || opts.length === 1;
    });
    var pickFrom = nonRev.length ? nonRev : opts;
    var pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    en.ldx = pick.dx; en.ldy = pick.dy;
    return { cx: pick.cx, cy: pick.cy };
  }

  function updateEnemy(en, dt) {
    if (en.progress >= 1) {
      var t = enemyChooseTarget(en);
      if (t) {
        en.tcx = t.cx; en.tcy = t.cy;
        var from = center(en.cx, en.cy);
        var to = center(t.cx, t.cy);
        en.fromX = from.x; en.fromY = from.y;
        en.toX = to.x; en.toY = to.y;
        en.cx = t.cx; en.cy = t.cy;
        en.progress = 0;
      } else {
        en.progress = 1; // 卡住，下一帧再试
      }
    }
    if (en.progress < 1) {
      en.progress += (en.speed / CELL) * dt;
      if (en.progress >= 1) en.progress = 1;
      en.x = en.fromX + (en.toX - en.fromX) * en.progress;
      en.y = en.fromY + (en.toY - en.fromY) * en.progress;
    }
  }

  /* ----------------------------------------------------------------------
     炸弹 / 火焰
     ---------------------------------------------------------------------- */
  function addFlame(cx, cy) {
    if (!inBounds(cx, cy)) return;
    flames.push({ cx: cx, cy: cy, timer: FLAME_TIME });
  }

  function destroySoft(cx, cy) {
    if (grid[cy][cx] !== SOFT) return;
    grid[cy][cx] = EMPTY;
    state.score += SCORE_WALL;
    if (cx === exitCell.cx && cy === exitCell.cy) {
      grid[cy][cx] = EXIT;
      exitCell.revealed = true;
    } else if (Math.random() < DIFF[state.diff].powerupChance) {
      powerups.push({ cx: cx, cy: cy, type: Math.random() < 0.5 ? 'fire' : 'bomb' });
    }
  }

  function detonate(initial) {
    var queue = [initial];
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    while (queue.length) {
      var b = queue.shift();
      if (b.exploded) continue;
      b.exploded = true;
      if (b.owner === 'player') player.activeBombs = Math.max(0, player.activeBombs - 1);
      if (window.YSound) window.YSound.play('boom');

      addFlame(b.cx, b.cy);
      for (var i = 0; i < 4; i++) {
        var dx = dirs[i][0], dy = dirs[i][1];
        for (var r = 1; r <= b.radius; r++) {
          var nx = b.cx + dx * r, ny = b.cy + dy * r;
          if (!inBounds(nx, ny)) break;
          var cell = grid[ny][nx];
          if (cell === STEEL) break;
          if (cell === SOFT) {
            destroySoft(nx, ny);
            addFlame(nx, ny);
            break;
          }
          addFlame(nx, ny);
          var ob = bombAt(nx, ny);
          if (ob && !ob.exploded) queue.push(ob);   // 连锁引爆
        }
      }
    }
    // 清理已爆炸的炸弹
    bombs = bombs.filter(function (x) { return !x.exploded; });
    updateHUD();
  }

  function updateBombs(dt) {
    for (var i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (b.exploded) continue;
      b.fuse -= dt;
      if (b.fuse <= 0) detonate(b);
    }
  }

  function updateFlames(dt) {
    for (var i = flames.length - 1; i >= 0; i--) {
      flames[i].timer -= dt;
      if (flames[i].timer <= 0) flames.splice(i, 1);
    }
  }

  /* ----------------------------------------------------------------------
     伤害 / 拾取 / 胜负
     ---------------------------------------------------------------------- */
  function loseLife() {
    if (player.invuln > 0) return;
    state.lives--;
    updateHUD();
    if (window.YSound) window.YSound.play('error');
    if (state.lives <= 0) {
      endGame(false);
      return;
    }
    var c = center(START.cx, START.cy);
    player.x = c.x; player.y = c.y; player.dir = null;
    dirStack = [];
    player.invuln = INVULN_TIME;
    save();
  }

  function pickup(p, i) {
    if (p.type === 'fire') player.blastRadius = Math.min(player.blastRadius + 1, 8);
    else player.maxBombs = Math.min(player.maxBombs + 1, 8);
    state.score += SCORE_POWER;
    powerups.splice(i, 1);
    if (window.YSound) window.YSound.play('powerup');
    updateHUD();
    save();
  }

  function killEnemy(idx) {
    enemies.splice(idx, 1);
    state.score += SCORE_ENEMY;
    if (window.YSound) window.YSound.play('coin');
    updateHUD();
    save();
  }

  function maybeUpdateBest() {
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (e) {}
    }
  }

  function levelClear() {
    state.over = true; state.won = true;
    var prevBest = state.best;
    maybeUpdateBest();
    state.newRecord = (state.score > prevBest && state.score > 0);
    if (window.YSound) window.YSound.play('win');
    save();
    showOverlay('win');
  }

  function endGame(win) {
    state.over = true; state.won = win;
    var prevBest = state.best;
    maybeUpdateBest();
    state.newRecord = (state.score > prevBest && state.score > 0);
    if (window.YSound) window.YSound.play(win ? 'win' : 'lose');
    if (!win) {
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
    } else {
      save();
    }
    showOverlay(win ? 'win' : 'lose');
  }

  function resolveCollisions() {
    var pt = playerTile();

    // 玩家踩到火焰
    if (player.invuln <= 0 && flameAt(pt.cx, pt.cy)) {
      loseLife();
      return;
    }

    // 玩家踩到道具
    for (var i = powerups.length - 1; i >= 0; i--) {
      if (powerups[i].cx === pt.cx && powerups[i].cy === pt.cy) {
        pickup(powerups[i], i);
      }
    }

    // 走到出口
    if (grid[pt.cy][pt.cx] === EXIT) {
      levelClear();
      return;
    }

    // 敌人：被火焰烧死 / 撞到玩家
    for (var j = enemies.length - 1; j >= 0; j--) {
      var en = enemies[j];
      var et = enemyTile(en);
      if (flameAt(et.cx, et.cy)) { killEnemy(j); continue; }
      var dx = en.x - player.x, dy = en.y - player.y;
      if (player.invuln <= 0 && (dx * dx + dy * dy) < (CELL * 0.6) * (CELL * 0.6)) {
        loseLife();
        return;
      }
    }
  }

  /* ----------------------------------------------------------------------
     主循环
     ---------------------------------------------------------------------- */
  var lastTime = 0;
  function loop(now) {
    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;       // 防止切后台后大跳

    if (active()) {
      updatePlayer(dt);
      for (var i = 0; i < enemies.length; i++) updateEnemy(enemies[i], dt);
      updateBombs(dt);
      updateFlames(dt);
      resolveCollisions();
    } else {
      updateFlames(dt);              // 暂停/结束时火焰继续消散，画面更自然
    }

    render();
    requestAnimationFrame(loop);
  }

  /* ----------------------------------------------------------------------
     渲染
     ---------------------------------------------------------------------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // 地板棋盘格
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#EFE7D8' : '#E7DECC';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // 墙体
    for (var yy = 0; yy < ROWS; yy++) {
      for (var xx = 0; xx < COLS; xx++) {
        var cell = grid[yy][xx];
        if (cell === STEEL) drawSteel(xx, yy);
        else if (cell === SOFT) drawSoft(xx, yy);
        else if (cell === EXIT) drawExit(xx, yy);
      }
    }

    // 道具
    for (var p = 0; p < powerups.length; p++) drawPowerup(powerups[p]);

    // 炸弹
    for (var b = 0; b < bombs.length; b++) drawBomb(bombs[b]);

    // 火焰
    for (var f = 0; f < flames.length; f++) drawFlame(flames[f]);

    // 敌人
    for (var e = 0; e < enemies.length; e++) drawEnemy(enemies[e]);

    // 玩家
    drawPlayer();
  }

  function drawSteel(x, y) {
    var px = x * CELL, py = y * CELL;
    ctx.fillStyle = '#6B6358';
    roundRect(px + 2, py + 2, CELL - 4, CELL - 4, 5); ctx.fill();
    ctx.fillStyle = '#807868';
    roundRect(px + 4, py + 4, CELL - 8, (CELL - 8) / 2, 4); ctx.fill();
    ctx.fillStyle = '#524B42';
    roundRect(px + 4, py + CELL / 2 + 1, CELL - 8, (CELL - 8) / 2 - 2, 4); ctx.fill();
  }

  function drawSoft(x, y) {
    var px = x * CELL, py = y * CELL;
    ctx.fillStyle = '#B07A45';
    roundRect(px + 2, py + 2, CELL - 4, CELL - 4, 4); ctx.fill();
    ctx.strokeStyle = '#8C5E32';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 3, py + CELL / 2); ctx.lineTo(px + CELL - 3, py + CELL / 2);
    ctx.moveTo(px + CELL / 2, py + 3); ctx.lineTo(px + CELL / 2, py + CELL / 2);
    ctx.moveTo(px + CELL / 4, py + CELL / 2); ctx.lineTo(px + CELL / 4, py + CELL - 3);
    ctx.moveTo(px + 3 * CELL / 4, py + CELL / 2); ctx.lineTo(px + 3 * CELL / 4, py + CELL - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(px + 4, py + 4, CELL - 8, 6, 3); ctx.fill();
  }

  function drawExit(x, y) {
    var c = center(x, y);
    var t = (Date.now() % 1000) / 1000;
    var pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(40,40,40,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, CELL * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F2C14E';
    ctx.beginPath(); ctx.arc(0, 0, CELL * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E08A2B';
    ctx.beginPath(); ctx.arc(0, 0, CELL * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.strokeStyle = '#FFF3D0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, CELL * 0.36 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawPowerup(p) {
    var c = center(p.cx, p.cy);
    var t = (Date.now() % 1200) / 1200;
    var bob = Math.sin(t * Math.PI * 2) * 2;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    if (p.type === 'fire') {
      ctx.fillStyle = '#E8552B';
      roundRect(-CELL * 0.30, -CELL * 0.30, CELL * 0.60, CELL * 0.60, 7); ctx.fill();
      ctx.fillStyle = '#FFD24A';
      ctx.beginPath();
      ctx.moveTo(0, -CELL * 0.18);
      ctx.quadraticCurveTo(CELL * 0.16, CELL * 0.02, 0, CELL * 0.18);
      ctx.quadraticCurveTo(-CELL * 0.16, CELL * 0.02, 0, -CELL * 0.18);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3A342E';
      roundRect(-CELL * 0.30, -CELL * 0.30, CELL * 0.60, CELL * 0.60, 7); ctx.fill();
      ctx.fillStyle = '#FBF6EC';
      ctx.beginPath(); ctx.arc(CELL * 0.05, CELL * 0.02, CELL * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FBF6EC'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CELL * 0.10, -CELL * 0.10); ctx.lineTo(CELL * 0.16, -CELL * 0.18); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBomb(b) {
    var c = center(b.cx, b.cy);
    var t = (Date.now() % 600) / 600;
    var pulse = 1 + 0.08 * Math.sin(t * Math.PI * 2);
    var r = CELL * 0.32 * pulse;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#3A342E';
    ctx.beginPath(); ctx.arc(0, 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.28, 0, Math.PI * 2); ctx.fill();
    // 引信
    ctx.strokeStyle = '#8C7A5B'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.5, -r * 1.3, r * 0.7, -r * 1.1); ctx.stroke();
    // 火花
    ctx.fillStyle = '#FFD24A';
    ctx.beginPath(); ctx.arc(r * 0.7, -r * 1.1, 2.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFlame(f) {
    var px = f.cx * CELL, py = f.cy * CELL;
    var a = Math.max(0, f.timer / FLAME_TIME);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * a;
    var grad = ctx.createRadialGradient(px + CELL / 2, py + CELL / 2, 2, px + CELL / 2, py + CELL / 2, CELL / 2);
    grad.addColorStop(0, '#FFE9A8');
    grad.addColorStop(0.5, '#FF9A2E');
    grad.addColorStop(1, 'rgba(255,70,20,0.15)');
    ctx.fillStyle = grad;
    roundRect(px + 2, py + 2, CELL - 4, CELL - 4, 6); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(en) {
    var r = CELL * 0.34;
    ctx.save();
    ctx.translate(en.x, en.y);
    // 身体
    ctx.fillStyle = en.color;
    roundRect(-r, -r, r * 2, r * 2, r * 0.5); ctx.fill();
    // 眼睛（朝向移动方向）
    var ox = en.ldx * 3, oy = en.ldy * 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-r * 0.4 + ox, -r * 0.2 + oy, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.4 + ox, -r * 0.2 + oy, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2622';
    ctx.beginPath(); ctx.arc(-r * 0.4 + ox * 1.6, -r * 0.2 + oy * 1.6, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.4 + ox * 1.6, -r * 0.2 + oy * 1.6, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return; // 受伤闪烁
    var r = CELL * 0.34;
    var dx = 0, dy = 0;
    if (player.dir === 'left') dx = -1; else if (player.dir === 'right') dx = 1;
    else if (player.dir === 'up') dy = -1; else if (player.dir === 'down') dy = 1;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#2E8B8B';
    roundRect(-r, -r, r * 2, r * 2, r * 0.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(-r + 3, -r + 3, r * 2 - 6, r * 0.6, r * 0.3); ctx.fill();
    // 眼睛（朝向）
    var ox = dx * 3, oy = dy * 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-r * 0.4 + ox, -r * 0.1 + oy, r * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.4 + ox, -r * 0.1 + oy, r * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1B3F3F';
    ctx.beginPath(); ctx.arc(-r * 0.4 + ox * 1.6, -r * 0.1 + oy * 1.6, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.4 + ox * 1.6, -r * 0.1 + oy * 1.6, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ----------------------------------------------------------------------
     UI 更新
     ---------------------------------------------------------------------- */
  function updateHUD() {
    el.score.textContent = state.score;
    el.best.textContent = state.best;
    el.level.textContent = state.level;
    el.lives.textContent = state.lives;
  }

  function syncDiffButtons() {
    var btns = el.diffs.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function showStartCard() {
    el.card.hidden = false;
    el.cardTitle.textContent = I18N_t('game_title');
    el.cardSub.textContent = I18N_t('tagline');
    var st = readSaved();
    el.btnStart.textContent = (st && st.diff === state.diff) ? I18N_t('btn_resume') : I18N_t('btn_start');
    el.btnPause.textContent = I18N_t('btn_pause');
  }

  function hideCard() { el.card.hidden = true; }

  function showPausedCard() {
    el.card.hidden = false;
    el.cardTitle.textContent = I18N_t('paused_title');
    el.cardSub.textContent = I18N_t('btn_resume');
    el.btnStart.textContent = I18N_t('btn_resume');
    el.btnPause.textContent = I18N_t('btn_resume');
  }

  function hideOverlay() { el.overlay.hidden = true; }

  function showOverlay(kind) {
    hideCard();
    el.overlay.hidden = false;
    if (kind === 'win') {
      el.overlayTitle.textContent = I18N_t('win_title');
      el.overlaySub.textContent = I18N_t('win_sub')
        .replace('{level}', state.level).replace('{score}', state.score);
      el.btnNext.hidden = false;
      el.btnAgain.hidden = false;
    } else {
      el.overlayTitle.textContent = I18N_t('lose_title');
      el.overlaySub.textContent = I18N_t('lose_sub')
        .replace('{level}', state.level).replace('{score}', state.score);
      el.btnNext.hidden = true;
      el.btnAgain.hidden = false;
    }
    el.overlayScore.textContent = state.score;
    el.overlayLevel.textContent = state.level;
    el.recordBadge.hidden = !state.newRecord;
  }

  function togglePause() {
    if (!state.running || state.over) return;
    state.paused = !state.paused;
    if (state.paused) {
      showPausedCard();
      if (window.YSound) window.YSound.play('toggle');
    } else {
      hideCard();
      if (window.YSound) window.YSound.play('toggle');
    }
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1500);
  }

  /* ----------------------------------------------------------------------
     绑定界面事件
     ---------------------------------------------------------------------- */
  function bindUI() {
    el.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg__btn');
      if (!btn) return;
      var d = btn.getAttribute('data-diff');
      if (d === state.diff) return;
      state.diff = d;
      try { localStorage.setItem(DIFF_KEY, d); } catch (e2) {}
      syncDiffButtons();
      // 切换难度即重开
      if (window.YSound) window.YSound.play('select');
      newGame();
    });

    el.btnStart.addEventListener('click', function () {
      if (state.running && state.paused) {
        // 暂停态下「继续」
        state.paused = false;
        hideCard();
        if (window.YSound) window.YSound.play('toggle');
      } else {
        if (window.YSound) window.YSound.play('start');
        startGame();
      }
    });

    el.btnPause.addEventListener('click', togglePause);

    el.btnRestart.addEventListener('click', function () {
      if (window.YSound) window.YSound.play('click');
      newGame();
    });

    el.btnHint.addEventListener('click', function () {
      if (window.YSound) window.YSound.play('select');
      showToast(I18N_t('label_enemies') + '：' + enemies.length);
    });

    el.btnAgain.addEventListener('click', function () {
      if (window.YSound) window.YSound.play('click');
      newGame();
    });

    el.btnNext.addEventListener('click', function () {
      if (window.YSound) window.YSound.play('levelup');
      nextLevel();
    });

    // 语言切换后刷新我手动设置的文案
    document.addEventListener('ys:langchange', function () {
      if (!state.running || state.paused) showStartOrPausedCard();
      else { el.btnPause.textContent = I18N_t('btn_pause'); }
    });
  }

  function showStartOrPausedCard() {
    if (state.paused) showPausedCard();
    else showStartCard();
  }

  /* ----------------------------------------------------------------------
     画布缩放（按 dpr）
     ---------------------------------------------------------------------- */
  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ----------------------------------------------------------------------
     初始化
     ---------------------------------------------------------------------- */
  function init() {
    // 读取难度
    var savedDiff = null;
    try { savedDiff = localStorage.getItem(DIFF_KEY); } catch (e) {}
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    // 读取最佳
    try {
      var b = parseInt(localStorage.getItem(BEST_KEY), 10);
      if (!isNaN(b)) state.best = b;
    } catch (e) {}

    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    // 先构建一关作为开始界面的预览背景
    buildLevel();
    syncDiffButtons();
    updateHUD();
    showStartCard();

    bindInput();
    bindUI();

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
