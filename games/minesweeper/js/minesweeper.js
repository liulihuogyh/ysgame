/**
 * 扫雷 · 游戏逻辑
 * 纯前端、无依赖。
 *
 * 几条刻意为之的规则：
 *  1. 第一次点击才布雷，并且把点击处周围 5×5 让出来，保证开局能翻出一片空地；
 *  2. 踩雷只结算这一局，不扣分、不弹羞辱文案，重开即可；
 *  3. 已翻开的数字格再点一次＝和弦（周围旗子数够了就一起翻开），
 *     手机上就靠这一下省掉大量来回点；
 *  4. 长按＝插旗，同时屏蔽之后那次合成 click，避免插完旗又被翻开。
 * [gyh 2026-11-02 新增]
 */
(function () {
  'use strict';

  var LEVELS = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 13, cols: 13, mines: 25 },
    hard: { rows: 16, cols: 16, mines: 40 }
  };

  var STATE_KEY = 'ysgame-mines-state';
  var BEST_KEY = 'ysgame-mines-best';
  var LONG_PRESS = 430;   // 长按判定，太短容易误插旗
  var MOVE_TOL = 12;      // 手指移动超过这个距离就不算长按

  var dom = {
    board: document.getElementById('board'),
    minesLeft: document.getElementById('mines-left'),
    timer: document.getElementById('timer'),
    best: document.getElementById('best'),
    btnNew: document.getElementById('btn-new'),
    btnFlag: document.getElementById('btn-flag'),
    btnAgain: document.getElementById('btn-again'),
    levelBtns: document.querySelectorAll('.seg__btn'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayTime: document.getElementById('overlay-time')
  };

  var state = {
    level: 'easy',
    rows: 9,
    cols: 9,
    mines: 10,

    mine: null,      // 2D boolean
    adj: null,       // 2D number
    open: null,      // 2D boolean
    flag: null,      // 2D boolean
    cells: null,     // 2D { el, num, icon }

    planted: false,
    started: false,
    over: false,
    won: false,

    opened: 0,
    flagCount: 0,

    elapsed: 0,      // 已经结束的对局累计的秒数
    startedAt: 0,    // 开始时刻（毫秒），用来算真实用时
    overlay: null,
    flagMode: false,

    best: { easy: null, hard: null }
  };

  var suppressClickUntil = 0;

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function idxIn(r, c) {
    return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
  }

  function makeGrid(fill) {
    var g = [];
    for (var r = 0; r < state.rows; r++) {
      var row = [];
      for (var c = 0; c < state.cols; c++) row.push(fill);
      g.push(row);
    }
    return g;
  }

  function elapsedSec() {
    var sec = state.elapsed;
    if (state.started && !state.over && state.startedAt) {
      sec += (Date.now() - state.startedAt) / 1000;
    }
    return Math.max(0, Math.floor(sec));
  }

  function fmtTime(sec) {
    if (sec === null || sec === undefined) return '--:--';
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  /* ------------------------------------------------------------------
     渲染
     ------------------------------------------------------------------ */

  function buildBoard() {
    dom.board.innerHTML = '';
    dom.board.style.setProperty('--n', state.cols);
    dom.board.setAttribute('data-size', String(state.cols));

    state.cells = [];
    var frag = document.createDocumentFragment();

    for (var r = 0; r < state.rows; r++) {
      var row = [];
      for (var c = 0; c < state.cols; c++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.setAttribute('role', 'gridcell');
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);

        var icon = document.createElement('span');
        icon.className = 'cell__icon';
        icon.setAttribute('aria-hidden', 'true');

        var num = document.createElement('span');
        num.className = 'cell__num';
        num.setAttribute('aria-hidden', 'true');

        btn.appendChild(icon);
        btn.appendChild(num);
        frag.appendChild(btn);

        row.push({ el: btn, num: num, icon: icon });
      }
      state.cells.push(row);
    }

    dom.board.appendChild(frag);
  }

  function ariaFor(r, c) {
    var base = t('cell_pos').replace('{r}', r + 1).replace('{c}', c + 1);

    if (state.open[r][c]) {
      var n = state.adj[r][c];
      return base + ' · ' + (n > 0 ? String(n) : t('cell_empty'));
    }
    if (state.flag[r][c]) return base + ' · ' + t('cell_flag');
    return base + ' · ' + t('cell_covered');
  }

  function paintCell(r, c) {
    var cell = state.cells[r][c];
    var isOpen = state.open[r][c];
    var isFlag = !isOpen && state.flag[r][c];
    var n = isOpen ? state.adj[r][c] : 0;

    cell.el.classList.toggle('is-open', isOpen);
    cell.el.classList.toggle('is-flag', isFlag);

    cell.num.textContent = isOpen && n > 0 ? String(n) : '';
    if (isOpen && n > 0) {
      cell.el.setAttribute('data-n', String(n));
    } else {
      cell.el.removeAttribute('data-n');
    }

    cell.el.setAttribute('aria-label', ariaFor(r, c));
  }

  function paintAll() {
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) paintCell(r, c);
    }
    refreshHud();
  }

  function refreshHud() {
    dom.minesLeft.textContent = String(Math.max(0, state.mines - state.flagCount));
    dom.timer.textContent = fmtTime(elapsedSec());
    dom.best.textContent = fmtTime(state.best[state.level]);
  }

  /* ------------------------------------------------------------------
     布雷
     ------------------------------------------------------------------ */

  function plant(safeR, safeC) {
    var rows = state.rows;
    var cols = state.cols;
    var total = rows * cols;

    // 先尽量让出 5×5；放不下就缩到 3×3；再不行只排除脚下这一格
    var radius = 2;
    for (; radius >= 0; radius--) {
      var blocked = 0;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (Math.max(Math.abs(r - safeR), Math.abs(c - safeC)) <= radius) blocked++;
        }
      }
      if (total - blocked >= state.mines) break;
    }

    var pool = [];
    for (var i = 0; i < rows; i++) {
      for (var j = 0; j < cols; j++) {
        var safe = radius >= 0
          ? Math.max(Math.abs(i - safeR), Math.abs(j - safeC)) <= radius
          : (i === safeR && j === safeC);
        if (!safe) pool.push([i, j]);
      }
    }

    // 部分洗牌：只把前 mines 个位置随机出来，不必打乱整个池子
    for (var k = 0; k < state.mines; k++) {
      var pick = k + Math.floor(Math.random() * (pool.length - k));
      var tmp = pool[k];
      pool[k] = pool[pick];
      pool[pick] = tmp;
      var pos = pool[k];
      state.mine[pos[0]][pos[1]] = true;
    }

    for (var a = 0; a < rows; a++) {
      for (var b = 0; b < cols; b++) {
        var count = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            if (idxIn(a + dr, b + dc) && state.mine[a + dr][b + dc]) count++;
          }
        }
        state.adj[a][b] = count;
      }
    }

    state.planted = true;
  }

  /* ------------------------------------------------------------------
     翻开
     ------------------------------------------------------------------ */

  function openFlood(r0, c0) {
    var stack = [[r0, c0]];

    while (stack.length) {
      var pos = stack.pop();
      var r = pos[0];
      var c = pos[1];

      if (!idxIn(r, c)) continue;
      if (state.open[r][c] || state.flag[r][c]) continue;

      state.open[r][c] = true;
      state.opened++;
      paintCell(r, c);

      if (state.adj[r][c] !== 0) continue;

      // 周围一圈全是 0 才继续扩散
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }

  function reveal(r, c) {
    if (state.over || state.won) return;
    if (state.open[r][c] || state.flag[r][c]) return;

    if (!state.planted) {
      plant(r, c);
      state.started = true;
      // [gyh 2026-11-08 新增] 首次点击保护触发
      sfx('powerup');
    }

    if (!state.started) state.started = true;
    // startedAt 为 0 说明计时被暂停过（切走了标签页），点一下接着走
    if (!state.startedAt) state.startedAt = Date.now();

    if (state.mine[r][c]) {
      lose(r, c);
      return;
    }

    // [gyh 2026-11-08 新增] 一次翻出一片（连锁空白）时补一声 clear
    var openedBefore = state.opened;
    openFlood(r, c);
    if (state.opened - openedBefore >= 4) sfx('clear');
    soundReveal();
    refreshHud();

    if (state.opened >= state.rows * state.cols - state.mines) {
      win();
      return;
    }

    save();
  }

  /**
   * 和弦：点已翻开的数字，如果周围旗子数正好等于数字，就把其余邻居一起翻开。
   * 旗子插错了照样会炸——这是扫雷本来的规矩。
   */
  function chord(r, c) {
    if (state.over || state.won) return;
    if (!state.open[r][c] || state.adj[r][c] === 0) return;

    var flags = 0;
    var targets = [];

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nr = r + dr;
        var nc = c + dc;
        if (!idxIn(nr, nc)) continue;
        if (state.flag[nr][nc]) flags++;
        else if (!state.open[nr][nc]) targets.push([nr, nc]);
      }
    }

    if (flags !== state.adj[r][c] || !targets.length) return;

    var boom = null;
    for (var i = 0; i < targets.length; i++) {
      var tr = targets[i][0];
      var tc = targets[i][1];
      if (state.mine[tr][tc]) {
        boom = [tr, tc];
        break;
      }
    }

    if (boom) {
      lose(boom[0], boom[1]);
      return;
    }

    // [gyh 2026-11-08 新增] 和弦一次翻开多格时补一声 clear
    var openedBefore = state.opened;
    for (var j = 0; j < targets.length; j++) {
      openFlood(targets[j][0], targets[j][1]);
    }
    if (state.opened - openedBefore >= 4) sfx('clear');

    soundReveal();
    refreshHud();

    if (state.opened >= state.rows * state.cols - state.mines) {
      win();
      return;
    }

    save();
  }

  function toggleFlag(r, c) {
    if (state.over || state.won) return;
    if (!idxIn(r, c) || state.open[r][c]) return;

    state.flag[r][c] = !state.flag[r][c];
    state.flagCount += state.flag[r][c] ? 1 : -1;

    paintCell(r, c);
    refreshHud();
    soundFlag();
    // [gyh 2026-11-08 新增] 取消插旗给一声 UI 确认音
    if (!state.flag[r][c]) sfx('click');
    save();
  }

  /* ------------------------------------------------------------------
     结算
     ------------------------------------------------------------------ */

  function exposeMines(boomR, boomC) {
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.cells[r][c];

        if (state.mine[r][c] && !state.flag[r][c]) {
          cell.el.classList.add('is-mine');
          cell.el.setAttribute('aria-label', ariaFor(r, c) + ' · ' + t('cell_mine'));
        }

        if (!state.mine[r][c] && state.flag[r][c]) {
          cell.el.classList.remove('is-flag');
          cell.el.classList.add('is-wrong');
        }
      }
    }

    if (boomR !== null) {
      state.cells[boomR][boomC].el.classList.add('is-boom');
    }
  }

  function lose(r, c) {
    state.over = true;
    state.won = false;
    state.elapsed = elapsedSec();
    state.startedAt = 0;

    exposeMines(r, c);
    refreshHud();
    soundBoom();
    showOverlay('lose');
    save();
  }

  function win() {
    state.over = true;
    state.won = true;
    // 理论上不可能 0 秒扫完，但连点测试会跑到，给个下限免得记成「最佳 0:00」
    state.elapsed = Math.max(1, elapsedSec());
    state.startedAt = 0;

    // 把剩下的雷都插上旗，结算画面干净一点
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.mine[r][c] && !state.flag[r][c]) {
          state.flag[r][c] = true;
          state.flagCount++;
          paintCell(r, c);
        }
      }
    }

    var time = state.elapsed;
    var prev = state.best[state.level];
    // [gyh 2026-11-08 新增] 打破已有最佳时间才给破纪录音
    if (prev !== null && time < prev) sfx('perfect');
    if (prev === null || time < prev) {
      state.best[state.level] = time;
      saveBest();
    }

    refreshHud();
    soundWin();
    showOverlay('win');
    save();
  }

  function showOverlay(kind) {
    state.overlay = kind;

    var isWin = kind === 'win';
    var titleKey = isWin ? 'win_title' : 'lose_title';
    var subKey = isWin ? 'win_sub' : 'lose_sub';

    // data-i18n 留着，切语言时交给 I18N 重绘；这里同步一次文字
    dom.overlayTitle.setAttribute('data-i18n', titleKey);
    dom.overlaySub.setAttribute('data-i18n', subKey);
    dom.overlayTitle.textContent = t(titleKey);
    dom.overlaySub.textContent = t(subKey);

    dom.overlayTime.textContent = fmtTime(state.elapsed);
    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    state.overlay = null;
    dom.overlay.hidden = true;
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  // [gyh 2026-11-03 修改] 统一走全站音效引擎；爆炸换成噪声 + 低频，比正弦波像回事
  // [gyh 2026-11-08 新增] 通用音效包装
  function sfx(n, o) { if (window.YSound) window.YSound.play(n, o); }

  function soundReveal() { if (window.YSound) window.YSound.play('reveal'); }
  function soundFlag() { if (window.YSound) window.YSound.play('flag'); }
  function soundBoom() { if (window.YSound) window.YSound.play('boom'); }
  function soundWin() { if (window.YSound) window.YSound.play('win'); }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function pack(grid) {
    if (!grid) return null;
    var out = '';
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) out += grid[r][c] ? '1' : '0';
    }
    return out;
  }

  function unpack(str) {
    if (typeof str !== 'string') return null;
    if (str.length !== state.rows * state.cols) return null;

    var grid = [];
    var i = 0;
    for (var r = 0; r < state.rows; r++) {
      var row = [];
      for (var c = 0; c < state.cols; c++) row.push(str.charAt(i++) === '1');
      grid.push(row);
    }
    return grid;
  }

  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        level: state.level,
        planted: state.planted,
        started: state.started,
        over: state.over,
        won: state.won,
        elapsed: elapsedSec(),
        opened: state.opened,
        mine: pack(state.planted ? state.mine : null),
        open: pack(state.open),
        flag: pack(state.flag)
      }));
    } catch (e) {
      /* 隐私模式下写不进去，游戏照常能玩 */
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
    } catch (e) {}
  }

  function loadBest() {
    var raw = null;
    try { raw = localStorage.getItem(BEST_KEY); } catch (e) {}
    if (!raw) return;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;

    if (typeof data.easy === 'number' && data.easy >= 1) state.best.easy = data.easy;
    if (typeof data.hard === 'number' && data.hard >= 1) state.best.hard = data.hard;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) {}
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || !LEVELS[data.level]) return false;

    var lv = LEVELS[data.level];
    state.level = data.level;
    state.rows = lv.rows;
    state.cols = lv.cols;
    state.mines = lv.mines;

    var open = unpack(data.open);
    var flag = unpack(data.flag);
    var mine = data.planted ? unpack(data.mine) : null;
    if (!open || !flag) return false;
    if (data.planted && !mine) return false;

    state.open = open;
    state.flag = flag;
    state.mine = mine || makeGrid(false);
    state.adj = makeGrid(0);
    state.planted = !!data.planted;
    state.started = !!data.started;
    state.over = !!data.over;
    state.won = !!data.won;
    state.elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
    state.opened = typeof data.opened === 'number' ? data.opened : 0;

    // 旗子数量直接数一遍，比信存档里的值可靠
    state.flagCount = 0;
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.flag[r][c]) state.flagCount++;
      }
    }

    // 已播种的局，adj 得重算（存档里不存它，省体积）
    if (state.planted) {
      for (var a = 0; a < state.rows; a++) {
        for (var b = 0; b < state.cols; b++) {
          var count = 0;
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              if (idxIn(a + dr, b + dc) && state.mine[a + dr][b + dc]) count++;
            }
          }
          state.adj[a][b] = count;
        }
      }
    }

    // 计时接着走，但从现在重新计时，避免把离线的时间也算进去
    if (state.started && !state.over) state.startedAt = Date.now();

    buildBoard();
    paintAll();

    if (state.over) {
      if (state.won) {
        showOverlay('win');
      } else {
        exposeMines(null, null);
        showOverlay('lose');
      }
    }

    return true;
  }

  /* ------------------------------------------------------------------
     开局
     ------------------------------------------------------------------ */

  function resetBoards() {
    state.mine = makeGrid(false);
    state.adj = makeGrid(0);
    state.open = makeGrid(false);
    state.flag = makeGrid(false);

    state.planted = false;
    state.started = false;
    state.over = false;
    state.won = false;
    state.opened = 0;
    state.flagCount = 0;
    state.elapsed = 0;
    state.startedAt = 0;
    state.overlay = null;
  }

  function newGame(level, ask) {
    var inProgress = state.started && !state.over;
    if (ask && inProgress) {
      if (!window.confirm(t('confirm_new'))) return;
    }

    if (level && LEVELS[level]) {
      state.level = level;
      state.rows = LEVELS[level].rows;
      state.cols = LEVELS[level].cols;
      state.mines = LEVELS[level].mines;
    }

    resetBoards();
    hideOverlay();
    buildBoard();
    paintAll();
    syncLevelButtons();
    // [gyh 2026-11-08 新增] 开局提示音
    sfx('start');
    save();
  }

  function syncLevelButtons() {
    for (var i = 0; i < dom.levelBtns.length; i++) {
      var btn = dom.levelBtns[i];
      btn.classList.toggle('is-active', btn.getAttribute('data-level') === state.level);
    }
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  function cellAt(target) {
    var el = target && target.closest ? target.closest('.cell') : null;
    if (!el || !dom.board.contains(el)) return null;
    return { r: parseInt(el.dataset.r, 10), c: parseInt(el.dataset.c, 10) };
  }

  function primary(pos) {
    if (state.open[pos.r][pos.c]) {
      chord(pos.r, pos.c);
      return;
    }

    if (state.flagMode) {
      toggleFlag(pos.r, pos.c);
      return;
    }

    reveal(pos.r, pos.c);
  }

  function bindInput() {
    dom.board.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil) return;
      var pos = cellAt(e.target);
      if (!pos) return;
      primary(pos);
    });

    dom.board.addEventListener('contextmenu', function (e) {
      var pos = cellAt(e.target);
      if (!pos) return;
      e.preventDefault();
      toggleFlag(pos.r, pos.c);
    });

    // 长按插旗（只在触摸设备上生效）
    var press = null;

    dom.board.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var pos = cellAt(e.target);
      if (!pos) return;

      var touch = e.touches[0];
      press = {
        r: pos.r,
        c: pos.c,
        x: touch.clientX,
        y: touch.clientY,
        fired: false,
        timer: window.setTimeout(function () {
          if (!press) return;
          press.fired = true;
          toggleFlag(pos.r, pos.c);
        }, LONG_PRESS)
      };
    }, { passive: true });

    dom.board.addEventListener('touchmove', function (e) {
      if (!press) return;
      var touch = e.touches[0];
      if (!touch) return;
      if (Math.abs(touch.clientX - press.x) > MOVE_TOL ||
          Math.abs(touch.clientY - press.y) > MOVE_TOL) {
        window.clearTimeout(press.timer);
        press.moved = true;
      }
    }, { passive: true });

    dom.board.addEventListener('touchend', function () {
      if (!press) return;
      window.clearTimeout(press.timer);
      if (press.fired) {
        // 长按之后浏览器还会补一个 click，挡掉它
        suppressClickUntil = Date.now() + 450;
      }
      press = null;
    }, { passive: true });

    dom.board.addEventListener('touchcancel', function () {
      if (press) {
        window.clearTimeout(press.timer);
        press = null;
      }
    }, { passive: true });

    dom.btnNew.addEventListener('click', function () {
      newGame(null, true);
    });

    dom.btnAgain.addEventListener('click', function () {
      newGame(null, false);
    });

    for (var i = 0; i < dom.levelBtns.length; i++) {
      dom.levelBtns[i].addEventListener('click', function () {
        var level = this.getAttribute('data-level');
        if (level === state.level) {
          // 点当前难度＝重开这一档，仍然要确认
          newGame(level, true);
          return;
        }
        // [gyh 2026-11-08 新增] 切换难度
        sfx('toggle');
        newGame(level, true);
      });
    }

    dom.btnFlag.addEventListener('click', function () {
      state.flagMode = !state.flagMode;
      dom.btnFlag.setAttribute('aria-pressed', state.flagMode ? 'true' : 'false');
    });

    // 键盘：F 键也能切换插旗模式
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') {
        state.flagMode = !state.flagMode;
        dom.btnFlag.setAttribute('aria-pressed', state.flagMode ? 'true' : 'false');
      }
    });
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function tick() {
    if (state.started && !state.over) {
      dom.timer.textContent = fmtTime(elapsedSec());
    }
  }

  /**
   * 切走标签页或刷新时把计时"冻结"：先结算已用的秒数，再把 startedAt 归零。
   * 否则每秒都写一次存档太浪费，不写又会把后台待着的时间一起算进去。
   */
  function pauseClock() {
    if (!state.started || state.over || !state.startedAt) return;
    state.elapsed = elapsedSec();
    state.startedAt = 0;
    save();
  }

  function resumeClock() {
    if (!state.started || state.over || state.startedAt) return;
    state.startedAt = Date.now();
  }

  function init() {
    loadBest();

    if (!load()) {
      newGame('easy', false);
    } else {
      syncLevelButtons();
    }

    bindInput();
    window.setInterval(tick, 250);

    window.addEventListener('pagehide', pauseClock);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pauseClock();
      } else {
        resumeClock();
        refreshHud();
      }
    });

    document.addEventListener('ys:langchange', function () {
      // 静态文案由 I18N 重绘，棋盘里的 aria 和结算浮层要自己补
      if (state.cells) {
        for (var r = 0; r < state.rows; r++) {
          for (var c = 0; c < state.cols; c++) {
            state.cells[r][c].el.setAttribute('aria-label', ariaFor(r, c));
          }
        }
      }
      if (state.overlay) showOverlay(state.overlay);
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
