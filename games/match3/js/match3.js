/**
 * 消消乐 · 游戏逻辑
 * 纯前端、无依赖，8×8 棋盘、6 种糖果。
 *
 * 几条刻意为之的设计：
 *  1. 只做"点击交换"，不做拖动——手机上拖动会和页面滚动抢手势；
 *  2. 换不出三连就换回去，抖一下提示，不扣步数、不弹窗；
 *  3. 连锁消除有连击加成，分数在那儿涨，但不催人；
 *  4. 棋盘走到无解会自动重排，不会把人卡死。
 * [gyh 2026-11-03 新增]
 */
(function () {
  'use strict';

  var N = 8;
  var KINDS = 6;

  // [gyh 2026-11-03 修改] 三档难度：步数更紧、目标分更高 → 越难越要精打细算
  var DIFFS = {
    easy:   { moves: 35, target: 1000 },
    medium: { moves: 30, target: 1500 },
    hard:   { moves: 24, target: 2000 }
  };

  var STATE_KEY = 'ysgame-match3-state';
  var DIFF_KEY = 'ysgame-match3-diff';

  function diffDef() { return DIFFS[state.diff] || DIFFS.medium; }
  function movesTotal() { return diffDef().moves; }
  function targetScore() { return diffDef().target; }
  function bestKey() { return 'ysgame-match3-best-' + state.diff; }

  var state = {
    grid: [],
    score: 0,
    moves: 0,
    diff: 'medium',
    best: 0,
    over: false,
    won: false,
    busy: false
  };

  var selected = null;
  var tiles = [];
  var comboTimer = 0;
  var hintTimer = 0;

  var dom = {
    board: document.getElementById('board'),
    score: document.getElementById('score'),
    moves: document.getElementById('moves'),
    best: document.getElementById('best'),
    goal: document.getElementById('goal'),
    meter: document.getElementById('meter'),
    meterFill: document.getElementById('meter-fill'),
    combo: document.getElementById('combo'),
    btnHint: document.getElementById('btn-hint'),
    btnNew: document.getElementById('btn-new'),
    btnAgain: document.getElementById('btn-again'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayScore: document.getElementById('overlay-score'),
    diffs: document.getElementById('diffs')
  };

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < N; r++) {
      var row = [];
      for (var c = 0; c < N; c++) row.push(null);
      g.push(row);
    }
    return g;
  }

  function copyGrid(g) {
    var out = [];
    for (var r = 0; r < N; r++) out.push(g[r].slice());
    return out;
  }

  function randKind() {
    return Math.floor(Math.random() * KINDS);
  }

  /* ------------------------------------------------------------------
     建棋盘
     ------------------------------------------------------------------ */

  function buildBoard() {
    dom.board.innerHTML = '';
    tiles = [];

    var frag = document.createDocumentFragment();
    for (var r = 0; r < N; r++) {
      var row = [];
      for (var c = 0; c < N; c++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile';
        btn.setAttribute('role', 'gridcell');
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);

        var shape = document.createElement('span');
        shape.className = 'tile__shape';
        shape.setAttribute('aria-hidden', 'true');

        btn.appendChild(shape);
        frag.appendChild(btn);
        row.push(btn);
      }
      tiles.push(row);
    }
    dom.board.appendChild(frag);
  }

  function ariaFor(r, c) {
    var base = t('cell_pos')
      .replace('{r}', r + 1)
      .replace('{c}', c + 1);
    var v = state.grid[r][c];
    return base + ' · ' + (v === null ? t('cell_empty') : t('cell_candy'));
  }

  function renderTile(r, c) {
    var el = tiles[r][c];
    if (!el) return;

    var v = state.grid[r][c];
    if (v === null || v === undefined) {
      el.removeAttribute('data-type');
      el.classList.add('is-empty');
    } else {
      el.setAttribute('data-type', String(v));
      el.classList.remove('is-empty');
    }

    el.classList.toggle('is-selected',
      !!selected && selected.r === r && selected.c === c);
    el.setAttribute('aria-label', ariaFor(r, c));
  }

  function renderAll() {
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) renderTile(r, c);
    }
  }

  function animateCells(list, cls) {
    for (var i = 0; i < list.length; i++) {
      var el = tiles[list[i][0]][list[i][1]];
      if (!el) continue;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    }
  }

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.moves.textContent = String(Math.max(0, state.moves));
    dom.best.textContent = String(state.best);
    if (dom.goal) dom.goal.textContent = String(targetScore());

    var pct = Math.min(100, state.score / targetScore() * 100);
    dom.meterFill.style.width = pct + '%';
    dom.meter.setAttribute('aria-valuenow', String(Math.min(state.score, targetScore())));
    dom.meter.setAttribute('aria-valuemax', String(targetScore()));
  }

  /* ------------------------------------------------------------------
     找三连
     ------------------------------------------------------------------ */

  function findMatches(grid) {
    grid = grid || state.grid;

    var out = [];
    var seen = {};

    function mark(r, c) {
      var k = r + ',' + c;
      if (seen[k]) return;
      seen[k] = 1;
      out.push([r, c]);
    }

    var r, c, v, end;

    // 横着
    for (r = 0; r < N; r++) {
      c = 0;
      while (c < N) {
        v = grid[r][c];
        end = c;
        if (v !== null && v !== undefined) {
          while (end + 1 < N && grid[r][end + 1] === v) end++;
        }
        if (v !== null && v !== undefined && end - c + 1 >= 3) {
          for (var i = c; i <= end; i++) mark(r, i);
        }
        c = end + 1;
      }
    }

    // 竖着
    for (c = 0; c < N; c++) {
      r = 0;
      while (r < N) {
        v = grid[r][c];
        end = r;
        if (v !== null && v !== undefined) {
          while (end + 1 < N && grid[end + 1][c] === v) end++;
        }
        if (v !== null && v !== undefined && end - r + 1 >= 3) {
          for (var j = r; j <= end; j++) mark(j, c);
        }
        r = end + 1;
      }
    }

    return out;
  }

  function swapIn(grid, a, b) {
    var tmp = grid[a.r][a.c];
    grid[a.r][a.c] = grid[b.r][b.c];
    grid[b.r][b.c] = tmp;
  }

  /** 找一个还能消的交换，顺手给提示按钮用 */
  function findMove(grid) {
    grid = grid || state.grid;
    var g = copyGrid(grid);

    var dirs = [[0, 1], [1, 0]];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        for (var d = 0; d < dirs.length; d++) {
          var nr = r + dirs[d][0];
          var nc = c + dirs[d][1];
          if (nr >= N || nc >= N) continue;

          var a = { r: r, c: c };
          var b = { r: nr, c: nc };
          swapIn(g, a, b);
          var ok = findMatches(g).length > 0;
          swapIn(g, a, b);
          if (ok) return [a, b];
        }
      }
    }
    return null;
  }

  function hasMove(grid) {
    return !!findMove(grid);
  }

  /* ------------------------------------------------------------------
     铺棋盘
     ------------------------------------------------------------------ */

  function pickKind(r, c, g) {
    var banned = {};
    if (c >= 2 && g[r][c - 1] === g[r][c - 2] && g[r][c - 1] !== null) {
      banned[g[r][c - 1]] = 1;
    }
    if (r >= 2 && g[r - 1][c] === g[r - 2][c] && g[r - 1][c] !== null) {
      banned[g[r - 1][c]] = 1;
    }

    var pool = [];
    for (var i = 0; i < KINDS; i++) if (!banned[i]) pool.push(i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function fillGrid() {
    var g = emptyGrid();
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) g[r][c] = pickKind(r, c, g);
    }
    return g;
  }

  function freshGrid() {
    var g = fillGrid();
    var guard = 0;
    while ((findMatches(g).length || !hasMove(g)) && guard < 60) {
      g = fillGrid();
      guard++;
    }
    return g;
  }

  /* ------------------------------------------------------------------
     交换与消除
     ------------------------------------------------------------------ */

  function onTileClick(r, c) {
    if (state.busy || state.over) return;

    if (!selected) {
      selected = { r: r, c: c };
      renderTile(r, c);
      soundPick();
      return;
    }

    if (selected.r === r && selected.c === c) {
      selected = null;
      renderTile(r, c);
      return;
    }

    var a = selected;
    var dist = Math.abs(a.r - r) + Math.abs(a.c - c);

    if (dist !== 1) {
      selected = { r: r, c: c };
      renderTile(a.r, a.c);
      renderTile(r, c);
      soundPick();
      return;
    }

    selected = null;
    renderTile(a.r, a.c);
    renderTile(r, c);
    attemptSwap(a, { r: r, c: c });
  }

  async function attemptSwap(a, b) {
    state.busy = true;
    clearHint();

    swapIn(state.grid, a, b);
    renderTile(a.r, a.c);
    renderTile(b.r, b.c);

    await sleep(130);

    if (!findMatches().length) {
      swapIn(state.grid, a, b);
      renderTile(a.r, a.c);
      renderTile(b.r, b.c);
      animateCells([[a.r, a.c], [b.r, b.c]], 'is-bad');
      soundBad();
      state.busy = false;
      return;
    }

    state.moves--;
    refreshHud();
    // [gyh 2026-11-08 新增] 进入最后 5 步时提醒一次（不每步都响，避免吵）
    if (state.moves === 5) sfx('warn');
    soundSwap();

    await resolve();

    state.busy = false;
    save();

    if (state.score >= targetScore()) {
      win();
    } else if (state.moves <= 0) {
      gameOver();
    }
  }

  async function resolve() {
    var combo = 0;

    while (true) {
      var cells = findMatches();
      if (!cells.length) break;

      combo++;
      state.score += cells.length * 10 * combo;

      if (state.score > state.best) {
        // [gyh 2026-11-08 新增] 本局首次刷新最高分，每局只响一次
        if (state.best > 0 && !recordAnnounced) {
          recordAnnounced = true;
          sfx('perfect');
        }
        state.best = state.score;
        saveBest();
      }
      refreshHud();

      if (combo > 1) showCombo(combo);
      // [gyh 2026-11-08 新增] 三连以上连锁给一声 combo
      if (combo >= 3) sfx('combo', { combo: combo });
      soundClear(combo);

      var i;
      for (i = 0; i < cells.length; i++) {
        tiles[cells[i][0]][cells[i][1]].classList.add('is-clear');
      }

      await sleep(200);

      for (i = 0; i < cells.length; i++) {
        state.grid[cells[i][0]][cells[i][1]] = null;
        renderTile(cells[i][0], cells[i][1]);
      }

      await sleep(60);

      var moved = collapse();
      renderAll();
      animateCells(moved, 'is-new');

      await sleep(240);
    }

    if (!hasMove()) {
      await reshuffle();
    }

    save();
  }

  /** 下落 + 顶部补新糖，返回所有移动过的坐标，用来播落下动画 */
  function collapse() {
    var moved = [];

    for (var c = 0; c < N; c++) {
      var write = N - 1;

      for (var r = N - 1; r >= 0; r--) {
        if (state.grid[r][c] === null) continue;
        if (write !== r) {
          state.grid[write][c] = state.grid[r][c];
          state.grid[r][c] = null;
          moved.push([write, c]);
        }
        write--;
      }

      for (var k = write; k >= 0; k--) {
        state.grid[k][c] = randKind();
        moved.push([k, c]);
      }
    }

    return moved;
  }

  async function reshuffle() {
    showToast(t('reshuffle'));

    var g = freshGrid();
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) state.grid[r][c] = g[r][c];
    }

    renderAll();

    var all = [];
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) all.push([i, j]);
    }
    animateCells(all, 'is-new');

    soundShuffle();
    await sleep(300);
  }

  /* ------------------------------------------------------------------
     提示 / 连击 / 提示条
     ------------------------------------------------------------------ */

  function clearHint() {
    window.clearTimeout(hintTimer);
    var marked = dom.board.querySelectorAll('.is-hint');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('is-hint');
  }

  function showHint() {
    if (state.busy || state.over) return;

    clearHint();
    var move = findMove();
    if (!move) {
      reshuffle();
      return;
    }

    tiles[move[0].r][move[0].c].classList.add('is-hint');
    tiles[move[1].r][move[1].c].classList.add('is-hint');
    // [gyh 2026-11-08 新增] 提示按钮
    sfx('hint');

    hintTimer = window.setTimeout(clearHint, 2400);
  }

  function showCombo(n) {
    window.clearTimeout(comboTimer);
    dom.combo.textContent = t('combo').replace('{n}', n);
    dom.combo.hidden = false;

    dom.combo.style.animation = 'none';
    void dom.combo.offsetWidth;
    dom.combo.style.animation = '';

    comboTimer = window.setTimeout(function () {
      dom.combo.hidden = true;
    }, 700);
  }

  function showToast(text) {
    window.clearTimeout(comboTimer);
    dom.combo.textContent = text;
    dom.combo.hidden = false;

    dom.combo.style.animation = 'none';
    void dom.combo.offsetWidth;
    dom.combo.style.animation = '';

    comboTimer = window.setTimeout(function () {
      dom.combo.hidden = true;
    }, 1200);
  }

  /* ------------------------------------------------------------------
     结算
     ------------------------------------------------------------------ */

  function showOverlay(kind) {
    var isWin = kind === 'win';

    dom.overlayTitle.setAttribute('data-i18n', isWin ? 'win_title' : 'over_title');
    dom.overlaySub.setAttribute('data-i18n', isWin ? 'win_sub' : 'over_sub');
    dom.overlayTitle.textContent = t(isWin ? 'win_title' : 'over_title');
    dom.overlaySub.textContent = t(isWin ? 'win_sub' : 'over_sub');
    dom.overlayScore.textContent = String(state.score);
    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
  }

  function win() {
    state.over = true;
    state.won = true;
    selected = null;
    soundWin();
    showOverlay('win');
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }

  function gameOver() {
    state.over = true;
    state.won = false;
    selected = null;
    soundOver();
    showOverlay('over');
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  // [gyh 2026-11-03 修改] 统一走全站音效引擎；连击越高音越高
  // [gyh 2026-11-08 新增] 通用音效包装；破纪录提示每局只响一次
  function sfx(n, o) { if (window.YSound) window.YSound.play(n, o); }
  var recordAnnounced = false;

  function soundPick() { if (window.YSound) window.YSound.play('pick'); }
  function soundSwap() { if (window.YSound) window.YSound.play('swap'); }

  function soundClear(combo) {
    if (window.YSound) window.YSound.play('pop', { combo: combo });
  }

  function soundBad() { if (window.YSound) window.YSound.play('error'); }
  function soundShuffle() { if (window.YSound) window.YSound.play('shuffle'); }
  function soundWin() { if (window.YSound) window.YSound.play('win'); }
  function soundOver() { if (window.YSound) window.YSound.play('lose'); }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function packGrid() {
    var out = '';
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var v = state.grid[r][c];
        out += (v === null || v === undefined) ? 'x' : String(v);
      }
    }
    return out;
  }

  function unpackGrid(str) {
    if (typeof str !== 'string' || str.length !== N * N) return null;
    var g = [];
    var i = 0;
    for (var r = 0; r < N; r++) {
      var row = [];
      for (var c = 0; c < N; c++) {
        var ch = str.charAt(i++);
        if (ch === 'x') { row.push(null); continue; }
        var v = parseInt(ch, 10);
        if (!(v >= 0 && v < KINDS)) return null;
        row.push(v);
      }
      g.push(row);
    }
    return g;
  }

  function save() {
    if (state.over) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        grid: packGrid(),
        score: state.score,
        moves: state.moves,
        diff: state.diff
      }));
    } catch (e) {}
  }

  function saveBest() {
    try { localStorage.setItem(bestKey(), String(state.best)); } catch (e) {}
  }

  function loadBest() {
    var raw = null;
    try { raw = localStorage.getItem(bestKey()); } catch (e) {}
    var n = parseInt(raw, 10);
    if (n > 0) state.best = n;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) {}
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data) return false;

    var g = unpackGrid(data.grid);
    if (!g) return false;

    var score = parseInt(data.score, 10);
    var moves = parseInt(data.moves, 10);
    if (!(score >= 0) || !(moves > 0 && moves <= movesTotal())) return false;

    // 存档里如果已经是三连状态（中途关页面恰好在动画里），直接作废
    if (findMatches(g).length) return false;

    state.grid = g;
    state.score = score;
    state.moves = moves;
    if (data.diff && DIFFS[data.diff]) state.diff = data.diff;
    state.over = false;
    state.won = false;

    if (!hasMove()) return false;

    return true;
  }

  /* ------------------------------------------------------------------
     开局
     ------------------------------------------------------------------ */

  function newGame(ask) {
    if (state.busy) return;

    var inProgress = !state.over && state.moves < movesTotal();
    if (ask && inProgress) {
      if (!window.confirm(t('confirm_new'))) return;
    }

    clearHint();
    selected = null;
    state.grid = freshGrid();
    state.score = 0;
    state.moves = movesTotal();
    state.over = false;
    state.won = false;
    state.busy = false;
    // [gyh 2026-11-08 新增] 重置破纪录标记
    recordAnnounced = false;

    hideOverlay();
    renderAll();
    refreshHud();
    save();
  }

  /* ------------------------------------------------------------------
     难度切换
     ------------------------------------------------------------------ */

  function syncDiffs() {
    if (!dom.diffs) return;
    var btns = dom.diffs.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-diff') === state.diff);
    }
  }

  function switchDiff(diff) {
    if (!DIFFS[diff] || diff === state.diff) return;
    if (state.busy) return;

    var inProgress = !state.over && state.moves < movesTotal();
    if (inProgress && !window.confirm(t('confirm_diff'))) return;

    state.diff = diff;
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}
    // [gyh 2026-11-08 新增] 切换难度
    sfx('toggle');
    loadBest();
    newGame(false);
    syncDiffs();
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  function bindInput() {
    dom.board.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.tile') : null;
      if (!el || !dom.board.contains(el)) return;
      onTileClick(parseInt(el.dataset.r, 10), parseInt(el.dataset.c, 10));
    });

    dom.btnHint.addEventListener('click', showHint);

    dom.btnNew.addEventListener('click', function () { newGame(true); });
    dom.btnAgain.addEventListener('click', function () { newGame(false); });

    if (dom.diffs) {
      dom.diffs.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.seg__btn') : null;
        if (!btn || !dom.diffs.contains(btn)) return;
        switchDiff(btn.getAttribute('data-diff'));
      });
    }
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function init() {
    var savedDiff = null;
    try { savedDiff = localStorage.getItem(DIFF_KEY); } catch (e) {}
    if (savedDiff && DIFFS[savedDiff]) state.diff = savedDiff;

    loadBest();
    buildBoard();

    if (!load()) {
      newGame(false);
    } else {
      renderAll();
      refreshHud();
    }

    syncDiffs();
    bindInput();

    document.addEventListener('ys:langchange', function () {
      renderAll();
      if (!dom.overlay.hidden && state.over) {
        showOverlay(state.won ? 'win' : 'over');
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
