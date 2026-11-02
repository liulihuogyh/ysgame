/**
 * 拼图 · 游戏逻辑
 * 纯前端、无依赖，画面全部由内置 SVG 生成，不引外链图片。
 *
 * 规则只有一条：点两块，交换位置；全部归位就拼好了。
 * 之所以做成"交换"而不是"拖动"：手机上单指拖动容易和页面滚动打架，
 * 点两下反而更稳，也更不费劲。
 * [gyh 2026-11-03 新增]
 */
(function () {
  'use strict';

  var STATE_KEY = 'ysgame-jigsaw-state';
  var BEST_KEY = 'ysgame-jigsaw-best';
  var PREVIEW_MS = 4000;   // 看原图 4 秒后自动收起，免得一直盖着

  /* ------------------------------------------------------------------
     三幅画
     都是矢量图，缩放到 4×4 也不会糊；配色跟着站内的莫兰迪色走
     ------------------------------------------------------------------ */

  function sceneDawn() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">' +
      '<defs>' +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#F8ECDC"/><stop offset=".55" stop-color="#EFD8C2"/>' +
      '<stop offset="1" stop-color="#E2C6AF"/></linearGradient>' +
      '<linearGradient id="far" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#CBD5C8"/><stop offset="1" stop-color="#B3C2B4"/></linearGradient>' +
      '<linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#A8BBA8"/><stop offset="1" stop-color="#8DA48D"/></linearGradient>' +
      '<linearGradient id="near" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#7E987F"/><stop offset="1" stop-color="#5D7862"/></linearGradient>' +
      '</defs>' +
      '<rect width="900" height="900" fill="url(#sky)"/>' +
      '<circle cx="628" cy="286" r="126" fill="#E7B183" opacity=".18"/>' +
      '<circle cx="628" cy="286" r="78" fill="#E9B786" opacity=".92"/>' +
      '<path d="M0 520 L140 430 L268 500 L400 412 L556 512 L700 446 L900 528 L900 900 L0 900Z" fill="url(#far)" opacity=".88"/>' +
      '<path d="M0 606 L164 512 L322 592 L500 500 L676 596 L900 528 L900 900 L0 900Z" fill="url(#mid)"/>' +
      '<rect x="0" y="604" width="900" height="32" fill="#FFFDF8" opacity=".4"/>' +
      '<path d="M0 700 L150 624 L330 700 L510 616 L700 706 L900 630 L900 900 L0 900Z" fill="#789377"/>' +
      '<rect x="0" y="698" width="900" height="24" fill="#FFFDF8" opacity=".28"/>' +
      '<path d="M0 800 L220 726 L430 806 L650 730 L900 818 L900 900 L0 900Z" fill="url(#near)"/>' +
      '<g fill="#4F6A54" opacity=".92">' +
      '<path d="M180 726l16-74 16 74z"/><path d="M214 736l13-56 13 56z"/>' +
      '<path d="M700 742l18-82 18 82z"/><path d="M742 752l14-60 14 60z"/>' +
      '<path d="M470 762l15-66 15 66z"/>' +
      '</g>' +
      '<g fill="none" stroke="#6E7A69" stroke-width="4" stroke-linecap="round" opacity=".75">' +
      '<path d="M232 250q16-14 32 0"/><path d="M282 214q12-11 24 0"/>' +
      '<path d="M342 274q10-9 20 0"/>' +
      '</g>' +
      '</svg>';
  }

  function sceneNight() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">' +
      '<defs>' +
      '<linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#232B48"/><stop offset=".55" stop-color="#3E4A6E"/>' +
      '<stop offset="1" stop-color="#878BA4"/></linearGradient>' +
      '<linearGradient id="nsea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2F3959"/><stop offset="1" stop-color="#1A2134"/></linearGradient>' +
      '<radialGradient id="glow"><stop offset="0" stop-color="#F7ECD6" stop-opacity=".34"/>' +
      '<stop offset="1" stop-color="#F7ECD6" stop-opacity="0"/></radialGradient>' +
      '<mask id="cres"><rect width="900" height="900" fill="#fff"/>' +
      '<circle cx="624" cy="206" r="70" fill="#000"/></mask>' +
      '</defs>' +
      '<rect width="900" height="900" fill="url(#nsky)"/>' +
      '<circle cx="656" cy="248" r="190" fill="url(#glow)"/>' +
      '<circle cx="656" cy="248" r="82" fill="#F7ECD6" mask="url(#cres)"/>' +
      '<g fill="#F7ECD6">' +
      '<circle cx="146" cy="150" r="4" opacity=".85"/><circle cx="238" cy="96" r="3" opacity=".6"/>' +
      '<circle cx="322" cy="190" r="3.4" opacity=".7"/><circle cx="92" cy="288" r="3" opacity=".55"/>' +
      '<circle cx="410" cy="120" r="3" opacity=".5"/><circle cx="512" cy="196" r="2.6" opacity=".6"/>' +
      '<circle cx="760" cy="120" r="3.2" opacity=".7"/><circle cx="820" cy="300" r="2.6" opacity=".5"/>' +
      '<circle cx="196" cy="360" r="2.6" opacity=".45"/><circle cx="352" cy="296" r="2.4" opacity=".4"/>' +
      '</g>' +
      '<g fill="#5B6485" opacity=".5">' +
      '<ellipse cx="210" cy="246" rx="118" ry="20"/>' +
      '<ellipse cx="286" cy="268" rx="86" ry="14"/>' +
      '<ellipse cx="742" cy="352" rx="104" ry="16"/>' +
      '</g>' +
      '<rect x="0" y="556" width="900" height="344" fill="url(#nsea)"/>' +
      '<path d="M0 556h900v10H0z" fill="#8A93AE" opacity=".55"/>' +
      /* 月光在水面拉出的一道光 */
      '<g fill="#F3E5C6">' +
      '<rect x="618" y="576" width="76" height="6" rx="3" opacity=".55"/>' +
      '<rect x="600" y="606" width="112" height="5" rx="2.5" opacity=".4"/>' +
      '<rect x="578" y="644" width="156" height="5" rx="2.5" opacity=".3"/>' +
      '<rect x="548" y="690" width="216" height="4" rx="2" opacity=".22"/>' +
      '<rect x="510" y="744" width="292" height="4" rx="2" opacity=".16"/>' +
      '</g>' +
      /* 小帆船 */
      '<path d="M196 640l58-96 8 96z" fill="#EDE3D0" opacity=".9"/>' +
      '<path d="M252 640l30-64 6 64z" fill="#D9CDB8" opacity=".8"/>' +
      '<path d="M168 644h136l-22 34H190z" fill="#2B3350"/>' +
      '<path d="M168 644h136l-4 8H172z" fill="#4A5474"/>' +
      /* 近处浪 */
      '<path d="M0 792q120-26 240 0t240 0 240 0 180 0v108H0z" fill="#1D2438" opacity=".55"/>' +
      '<path d="M0 842q150-22 300 0t300 0 300 0v58H0z" fill="#171D2E" opacity=".45"/>' +
      '</svg>';
  }

  function sceneWindow() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">' +
      '<defs>' +
      '<linearGradient id="out" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#E9F0F1"/><stop offset=".62" stop-color="#F4EFDC"/>' +
      '<stop offset="1" stop-color="#EBDCC0"/></linearGradient>' +
      '</defs>' +
      '<rect width="900" height="900" fill="#F4E9D8"/>' +
      /* 窗外的光斜落在地板上 */
      '<path d="M118 512h344l124 388H0z" fill="#FFF7E6" opacity=".5"/>' +
      /* 桌面 */
      '<rect x="0" y="628" width="900" height="272" fill="#E7CDAE"/>' +
      '<rect x="0" y="628" width="900" height="9" fill="#F5E2C9" opacity=".85"/>' +
      /* 窗 */
      '<rect x="80" y="70" width="400" height="450" rx="10" fill="#E2CDB2"/>' +
      '<rect x="98" y="88" width="364" height="414" fill="url(#out)"/>' +
      '<circle cx="404" cy="168" r="40" fill="#F2D6AB"/>' +
      '<path d="M98 376l92-50 90 62 88-70 92 58v126H98z" fill="#A9BEA6"/>' +
      '<path d="M98 434l76-34 82 40 78-32 78 30v64H98z" fill="#8FA792"/>' +
      '<rect x="272" y="88" width="14" height="414" fill="#E2CDB2"/>' +
      '<rect x="98" y="284" width="364" height="14" fill="#E2CDB2"/>' +
      '<rect x="68" y="506" width="424" height="26" rx="6" fill="#D6BC9C"/>' +
      '<rect x="68" y="532" width="424" height="8" fill="#C7AA88" opacity=".6"/>' +
      /* 桌上阴影 */
      '<ellipse cx="640" cy="792" rx="96" ry="16" fill="#D8B995" opacity=".7"/>' +
      '<ellipse cx="228" cy="792" rx="126" ry="14" fill="#D8B995" opacity=".55"/>' +
      '<ellipse cx="388" cy="756" rx="60" ry="10" fill="#D8B995" opacity=".45"/>' +
      /* 书 */
      '<g transform="rotate(-2 210 774)">' +
      '<rect x="112" y="766" width="204" height="30" rx="5" fill="#8FA292"/>' +
      '<rect x="112" y="766" width="16" height="30" fill="#7C907F"/>' +
      '<rect x="118" y="740" width="192" height="26" rx="5" fill="#C3A29E"/>' +
      '<rect x="118" y="740" width="14" height="26" fill="#B08F8B"/>' +
      '<rect x="126" y="716" width="176" height="24" rx="5" fill="#DCC49B"/>' +
      '</g>' +
      /* 杯子 */
      '<path d="M436 590q32 2 32 24 0 22-32 24" fill="none" stroke="#FBF3E6" stroke-width="11"/>' +
      '<path d="M340 596h94v78a26 26 0 0 1-26 26h-42a26 26 0 0 1-26-26z" fill="#FBF3E6"/>' +
      '<ellipse cx="387" cy="596" rx="47" ry="12" fill="#EBD9BD"/>' +
      '<ellipse cx="387" cy="596" rx="40" ry="9" fill="#8C6A50" opacity=".55"/>' +
      /* 绿植 */
      '<g stroke="#7E9478" stroke-width="5" fill="none" stroke-linecap="round">' +
      '<path d="M648 646v-92"/><path d="M648 606q-52-30-72-74"/>' +
      '<path d="M648 592q44-34 58-80"/><path d="M648 636q-40 2-66-22"/>' +
      '</g>' +
      '<g fill="#8FA88C">' +
      '<ellipse cx="566" cy="516" rx="44" ry="24" transform="rotate(-34 566 516)"/>' +
      '<ellipse cx="706" cy="500" rx="46" ry="24" transform="rotate(28 706 500)"/>' +
      '<ellipse cx="612" cy="470" rx="40" ry="22" transform="rotate(-16 612 470)"/>' +
      '<ellipse cx="694" cy="566" rx="38" ry="20" transform="rotate(18 694 566)"/>' +
      '<ellipse cx="586" cy="596" rx="36" ry="19" transform="rotate(-24 586 596)"/>' +
      '</g>' +
      '<g fill="#A6BDA0">' +
      '<ellipse cx="642" cy="494" rx="34" ry="18" transform="rotate(4 642 494)"/>' +
      '<ellipse cx="678" cy="620" rx="34" ry="18" transform="rotate(26 678 620)"/>' +
      '</g>' +
      '<path d="M592 646h112l-14 146h-84z" fill="#C79A86"/>' +
      '<rect x="584" y="638" width="128" height="20" rx="7" fill="#D3A791"/>' +
      '</svg>';
  }

  var SCENES = [
    { id: 'dawn', key: 'scene_1', svg: sceneDawn },
    { id: 'night', key: 'scene_2', svg: sceneNight },
    { id: 'window', key: 'scene_3', svg: sceneWindow }
  ];

  /* ------------------------------------------------------------------
     状态
     ------------------------------------------------------------------ */

  var state = {
    size: 3,
    scene: 0,
    pieces: [],
    moves: 0,
    started: false,
    done: false,
    elapsed: 0,
    startedAt: 0,
    best: { 3: null, 4: null }
  };

  var urls = {};        // 场景 id → data URL，只生成一次
  var selected = -1;
  var previewTimer = 0;

  var dom = {
    puzzle: document.getElementById('puzzle'),
    preview: document.getElementById('preview'),
    moves: document.getElementById('moves'),
    timer: document.getElementById('timer'),
    best: document.getElementById('best'),
    scene: document.getElementById('scene-name'),
    btnNew: document.getElementById('btn-new'),
    btnPreview: document.getElementById('btn-preview'),
    btnAgain: document.getElementById('btn-again'),
    sizeBtns: document.querySelectorAll('.seg__btn'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayMoves: document.getElementById('overlay-moves'),
    overlayTime: document.getElementById('overlay-time')
  };

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function sceneUrl(index) {
    var s = SCENES[index];
    if (!urls[s.id]) {
      urls[s.id] = 'data:image/svg+xml,' + encodeURIComponent(s.svg());
    }
    return urls[s.id];
  }

  function fmtTime(sec) {
    if (sec === null || sec === undefined) return '--:--';
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  function elapsedSec() {
    var sec = state.elapsed;
    if (state.started && !state.done && state.startedAt) {
      sec += (Date.now() - state.startedAt) / 1000;
    }
    return Math.max(0, Math.floor(sec));
  }

  /* ------------------------------------------------------------------
     渲染
     ------------------------------------------------------------------ */

  function buildTiles() {
    var n = state.size;
    dom.puzzle.innerHTML = '';
    dom.puzzle.style.setProperty('--n', n);
    dom.puzzle.classList.toggle('is-done', state.done);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < n * n; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile';
      btn.setAttribute('role', 'gridcell');
      btn.dataset.slot = String(i);
      btn.style.backgroundImage = 'url("' + sceneUrl(state.scene) + '")';
      btn.style.backgroundSize = (n * 100) + '% ' + (n * 100) + '%';
      frag.appendChild(btn);
    }
    dom.puzzle.appendChild(frag);
  }

  function paintTile(slot) {
    var el = dom.puzzle.children[slot];
    if (!el) return;
    var n = state.size;
    var piece = state.pieces[slot];
    var r = Math.floor(piece / n);
    var c = piece % n;
    var pos = n === 1 ? '0% 0%'
      : (c / (n - 1) * 100) + '% ' + (r / (n - 1) * 100) + '%';

    el.style.backgroundPosition = pos;
    el.classList.toggle('is-selected', slot === selected);
    el.setAttribute('aria-label', t('cell_pos')
      .replace('{r}', Math.floor(slot / n) + 1)
      .replace('{c}', slot % n + 1)
      + (slot === selected ? ' · ' + t('cell_selected') : ''));
  }

  function paintAll() {
    for (var i = 0; i < state.pieces.length; i++) paintTile(i);
    refreshHud();
    paintSceneName();
  }

  function paintSceneName() {
    var key = SCENES[state.scene].key;
    dom.scene.setAttribute('data-i18n', key);
    dom.scene.textContent = t(key);
    dom.preview.style.backgroundImage = 'url("' + sceneUrl(state.scene) + '")';
  }

  function refreshHud() {
    dom.moves.textContent = String(state.moves);
    dom.timer.textContent = fmtTime(elapsedSec());
    dom.best.textContent = fmtTime(state.best[state.size]);
  }

  function syncSizeButtons() {
    for (var i = 0; i < dom.sizeBtns.length; i++) {
      var btn = dom.sizeBtns[i];
      btn.classList.toggle('is-active', parseInt(btn.dataset.size, 10) === state.size);
    }
  }

  /* ------------------------------------------------------------------
     洗牌
     ------------------------------------------------------------------ */

  function shuffled(n) {
    var arr = [];
    for (var i = 0; i < n * n; i++) arr.push(i);

    for (var k = arr.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = arr[k];
      arr[k] = arr[j];
      arr[j] = tmp;
    }

    // 极小概率洗回原样，重来一次；顺便避免"只差两块"的无聊开局
    var same = 0;
    for (var m = 0; m < arr.length; m++) if (arr[m] === m) same++;
    if (same === arr.length || same > arr.length - 2) return shuffled(n);
    return arr;
  }

  /* ------------------------------------------------------------------
     交换
     ------------------------------------------------------------------ */

  function selectTile(slot) {
    if (state.done) return;

    if (selected === slot) {
      selected = -1;
      paintTile(slot);
      return;
    }

    if (selected < 0) {
      selected = slot;
      paintTile(slot);
      soundPick();
      return;
    }

    var a = selected;
    selected = -1;
    swap(a, slot);
  }

  function swap(a, b) {
    var tmp = state.pieces[a];
    state.pieces[a] = state.pieces[b];
    state.pieces[b] = tmp;

    state.moves++;
    if (!state.started) {
      state.started = true;
      state.startedAt = Date.now();
    }

    paintTile(a);
    paintTile(b);
    flash(a);
    flash(b);
    refreshHud();
    soundSwap();

    if (isSolved()) {
      win();
      return;
    }
    save();
  }

  function flash(slot) {
    var el = dom.puzzle.children[slot];
    if (!el) return;
    el.classList.remove('is-swap');
    // 强制重排，让同一块连续交换时动画能重新播放
    void el.offsetWidth;
    el.classList.add('is-swap');
  }

  function isSolved() {
    for (var i = 0; i < state.pieces.length; i++) {
      if (state.pieces[i] !== i) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------
     看原图
     ------------------------------------------------------------------ */

  function showPreview() {
    dom.preview.hidden = false;
    dom.btnPreview.setAttribute('aria-pressed', 'true');
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(hidePreview, PREVIEW_MS);
  }

  function hidePreview() {
    window.clearTimeout(previewTimer);
    dom.preview.hidden = true;
    dom.btnPreview.setAttribute('aria-pressed', 'false');
  }

  /* ------------------------------------------------------------------
     结算
     ------------------------------------------------------------------ */

  function win() {
    state.done = true;
    state.elapsed = Math.max(1, elapsedSec());
    state.startedAt = 0;

    dom.puzzle.classList.add('is-done');
    hidePreview();
    soundWin();

    var prev = state.best[state.size];
    if (prev === null || state.elapsed < prev) {
      state.best[state.size] = state.elapsed;
      saveBest();
    }

    refreshHud();
    showOverlay();

    // 拼完就把进行中的存档清掉，刷新后是一局新的
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }

  function showOverlay() {
    dom.overlayTitle.setAttribute('data-i18n', 'win_title');
    dom.overlaySub.setAttribute('data-i18n', 'win_sub');
    dom.overlayTitle.textContent = t('win_title');
    dom.overlaySub.textContent = t('win_sub');
    dom.overlayMoves.textContent = String(state.moves);
    dom.overlayTime.textContent = fmtTime(state.elapsed);
    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  var audioCtx = null;

  function soundContext() {
    if (!window.YSGame || !window.YSGame.isSoundOn()) return null;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, duration, volume, delay) {
    var ac = soundContext();
    if (!ac) return;

    var start = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function soundPick() { beep(660, 0.04, 0.022, 0); }
  function soundSwap() { beep(470, 0.06, 0.03, 0); }

  function soundWin() {
    beep(523, 0.2, 0.05, 0);
    beep(659, 0.2, 0.046, 0.12);
    beep(784, 0.3, 0.044, 0.24);
  }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        size: state.size,
        scene: state.scene,
        moves: state.moves,
        started: state.started,
        elapsed: elapsedSec(),
        pieces: state.pieces.slice(0, state.size * state.size)
      }));
    } catch (e) {}
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

    if (typeof data['3'] === 'number' && data['3'] >= 1) state.best[3] = data['3'];
    if (typeof data['4'] === 'number' && data['4'] >= 1) state.best[4] = data['4'];
  }

  function validPieces(arr, total) {
    if (!Array.isArray(arr) || arr.length !== total) return false;
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (typeof v !== 'number' || v < 0 || v >= total || seen[v]) return false;
      seen[v] = true;
    }
    return true;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) {}
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data) return false;

    var size = parseInt(data.size, 10);
    if (size !== 3 && size !== 4) return false;
    if (!validPieces(data.pieces, size * size)) return false;

    var scene = parseInt(data.scene, 10);
    if (!(scene >= 0 && scene < SCENES.length)) scene = 0;

    state.size = size;
    state.scene = scene;
    state.pieces = data.pieces;
    state.moves = typeof data.moves === 'number' ? data.moves : 0;
    state.started = !!data.started;
    state.elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
    state.done = false;
    // 计时从回到页面的这一刻接着走，不把离开的时间算进去
    state.startedAt = state.started ? Date.now() : 0;

    buildTiles();
    paintAll();
    syncSizeButtons();
    return true;
  }

  /* ------------------------------------------------------------------
     开局
     ------------------------------------------------------------------ */

  function newGame(size, ask) {
    var inProgress = state.started && !state.done && state.moves > 0;
    if (ask && inProgress) {
      if (!window.confirm(t('confirm_new'))) return;
    }

    if (size === 3 || size === 4) state.size = size;

    // 换一幅画，尽量不和上一局重复
    var next = state.scene;
    if (SCENES.length > 1) {
      while (next === state.scene) next = Math.floor(Math.random() * SCENES.length);
    }
    state.scene = next;

    state.pieces = shuffled(state.size);
    state.moves = 0;
    state.started = false;
    state.done = false;
    state.elapsed = 0;
    state.startedAt = 0;
    selected = -1;

    hidePreview();
    hideOverlay();
    buildTiles();
    paintAll();
    syncSizeButtons();
    save();
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  function slotOf(target) {
    var el = target && target.closest ? target.closest('.tile') : null;
    if (!el || !dom.puzzle.contains(el)) return -1;
    return parseInt(el.dataset.slot, 10);
  }

  function bindInput() {
    dom.puzzle.addEventListener('click', function (e) {
      var slot = slotOf(e.target);
      if (slot < 0) return;
      hidePreview();
      selectTile(slot);
    });

    dom.btnPreview.addEventListener('click', function () {
      if (dom.preview.hidden) showPreview();
      else hidePreview();
    });

    dom.btnNew.addEventListener('click', function () {
      newGame(null, true);
    });

    dom.btnAgain.addEventListener('click', function () {
      newGame(null, false);
    });

    for (var i = 0; i < dom.sizeBtns.length; i++) {
      dom.sizeBtns[i].addEventListener('click', function () {
        var size = parseInt(this.dataset.size, 10);
        if (size === state.size) {
          newGame(size, true);
          return;
        }
        newGame(size, true);
      });
    }
  }

  /* ------------------------------------------------------------------
     计时
     ------------------------------------------------------------------ */

  function tick() {
    if (state.started && !state.done) {
      dom.timer.textContent = fmtTime(elapsedSec());
    }
  }

  function pauseClock() {
    if (!state.started || state.done || !state.startedAt) return;
    state.elapsed = elapsedSec();
    state.startedAt = 0;
    save();
  }

  function resumeClock() {
    if (!state.started || state.done || state.startedAt) return;
    state.startedAt = Date.now();
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function init() {
    loadBest();

    if (!load()) newGame(3, false);

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
      // 静态文案由 I18N 重绘；画面名、格子 aria、结算卡片要自己补
      paintSceneName();
      for (var i = 0; i < state.pieces.length; i++) paintTile(i);
      if (!dom.overlay.hidden) showOverlay();
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
