/* ==========================================================================
   全站音效引擎 · YSound
   纯 WebAudio 合成，不加载任何音频文件（首屏零请求、零体积）。

   用法：
     YSound.play('merge', { level: 3 })      // 走当前页面自动识别的主题
     YSound.play('win', { theme: 'snake' })  // 临时指定主题
     YSound.theme('snake')                   // 手动锁一个主题

   为什么要分主题：
   共用引擎是为了不重复写代码，但**每款游戏不能共用一套音色**——
   否则玩三个游戏听感一模一样，像同一个游戏换了张皮。
   所以这里一个引擎带十八套「乐器」，按 body[data-dict] 自动选：

     2048     马林巴木琴   低音、长余音、强八度泛音
     数独      钢琴铃      中高音、柔和、衰减长
     扫雷      军鼓金属    方波、短促、强瞬态噪声
     消消乐    水滴气泡    高音、上滑、几乎无瞬态
     拼图      木头咔哒    中低音、闷、指尖撞击感
     贪吃蛇    8-bit 芯片  方波、窄音域、复古
     推箱子    仓库石头    低音、很闷、沉重
     数字华容道 塑料滑块    高音、清脆、短促
     俄罗斯方块 小调芯片    低方波、五声音阶、消行扫频
     打砖块    弹球台 blip  极短电子音、强撞击瞬态
     连连看    竹牌相碰    中高频、极短木质嗒、尾音干净
     记忆翻牌  纸页翻动    柔和 sine、空气感、音量最轻
     五子棋    石子落枰    低而实的叩击、几乎无尾音
     横版跳跃  掌机芯片    明亮方波大调琶音、跳跃感最强

   [gyh 2026-11-03 新增]
   [gyh 2026-11-03 修改] 从「一套音色」改为「八套音色族」
   [gyh 2026-11-08 修改] 补俄罗斯方块 / 打砖块两套主题 + 18 个新音色
                          (UI 反馈、连击、物理动作、庆祝 [gyh 2026-11-08 修改] 批次三补迷宫 / 坦克 / 飞机 / 炸弹四套主题），全部沿用主题参数
   [gyh 2026-11-08 修改] 批次二补连连看 / 记忆翻牌 / 五子棋 / 横版跳跃四套主题
   ========================================================================== */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var unlocked = false;
  var manual = null;
  var detected = null;

  /* ---------------- 音色族 ----------------
     字段说明：
       wave   主波形      base  基准频率（决定整体音域）
       dur    时长倍率    gain  音量倍率
       lp     低通截止（0 = 不滤，越小越闷）
       shine  高八度泛音强度（木头、钢琴、塑料的「亮」都靠它）
       click  起音瞬态强度（打击感、指尖感）
       attack 起音时间（秒，越小越硬）
       scale  音阶（半音偏移），merge / pop 按它上行
       win / lose / start  旋律：[半音偏移, 延迟秒]
     ------------------------------------------------- */

  var THEMES = {

    /* 中性：大厅、以后没配主题的页面 */
    'default': {
      wave: 'triangle', base: 440, dur: 1, gain: 1,
      lp: 0, shine: 0.12, click: 0.05, attack: 0.008,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [4, 0.09], [7, 0.18], [12, 0.28]],
      lose: [[0, 0], [-3, 0.13], [-8, 0.26]],
      start: [[0, 0], [7, 0.07]]
    },

    /* 2048 · 马林巴：低音木琴，敲一下有长长的木头余音 */
    '2048': {
      wave: 'sine', base: 392, dur: 1.7, gain: 1.1,
      lp: 0, shine: 0.40, click: 0.09, attack: 0.004,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [7, 0.11], [12, 0.22], [16, 0.33], [19, 0.44], [24, 0.56]],
      lose: [[0, 0], [-3, 0.15], [-7, 0.30]],
      start: [[0, 0], [7, 0.08]]
    },

    /* 数独 · 钢琴铃：安静克制，声音小、尾巴长，别打断思考 */
    sudoku: {
      wave: 'triangle', base: 523, dur: 1.3, gain: 0.78,
      lp: 0, shine: 0.20, click: 0.015, attack: 0.006,
      scale: [0, 2, 4, 5, 7, 9, 11],
      win: [[0, 0], [4, 0.12], [7, 0.24], [11, 0.36], [12, 0.50]],
      lose: [[0, 0], [-2, 0.16], [-5, 0.32]],
      start: [[0, 0], [4, 0.10], [7, 0.20]]
    },

    /* 扫雷 · 军鼓金属：方波 + 重瞬态，翻格像敲铁皮 */
    mines: {
      wave: 'square', base: 330, dur: 0.6, gain: 0.62,
      lp: 3600, shine: 0, click: 0.50, attack: 0.002,
      scale: [0, 2, 4, 5, 7, 9, 11],
      win: [[0, 0], [7, 0.10], [12, 0.20], [19, 0.30], [24, 0.42]],
      lose: [[0, 0], [-5, 0.11], [-12, 0.24]],
      start: [[0, 0], [5, 0.07], [12, 0.14]]
    },

    /* 消消乐 · 水滴气泡：高音上滑，「啵」的一声，没有攻击感 */
    match3: {
      wave: 'sine', base: 587, dur: 0.95, gain: 1.1,
      lp: 0, shine: 0.16, click: 0, attack: 0.003,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [2, 0.07], [4, 0.14], [7, 0.21], [9, 0.28], [12, 0.37]],
      lose: [[0, 0], [-4, 0.12], [-9, 0.25]],
      start: [[0, 0], [4, 0.06], [7, 0.12]]
    },

    /* 拼图 · 木头：指尖敲木板，闷、带一点沙沙的接触声 */
    jigsaw: {
      wave: 'triangle', base: 262, dur: 0.62, gain: 1.15,
      lp: 2400, shine: 0.10, click: 0.36, attack: 0.003,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [4, 0.09], [7, 0.18], [9, 0.27], [12, 0.36]],
      lose: [[0, 0], [-3, 0.13], [-8, 0.26]],
      start: [[0, 0], [5, 0.08]]
    },

    /* 贪吃蛇 · 8-bit：纯方波，音域窄，故意保留芯片音的粗糙 */
    snake: {
      wave: 'square', base: 440, dur: 0.45, gain: 0.55,
      lp: 0, shine: 0, click: 0, attack: 0.002,
      scale: [0, 4, 7, 12],
      win: [[0, 0], [4, 0.07], [7, 0.14], [12, 0.21], [7, 0.30], [12, 0.38], [19, 0.46]],
      lose: [[0, 0], [-1, 0.08], [-2, 0.16], [-12, 0.28]],
      start: [[0, 0], [7, 0.06], [12, 0.12]]
    },

    /* 推箱子 · 仓库石头：低音、闷、短，推起来有重量 */
    sokoban: {
      wave: 'triangle', base: 196, dur: 0.6, gain: 1.2,
      lp: 1100, shine: 0.05, click: 0.24, attack: 0.004,
      scale: [0, 2, 5, 7, 10],
      win: [[0, 0], [7, 0.14], [12, 0.28], [19, 0.42]],
      lose: [[0, 0], [-5, 0.16], [-12, 0.32]],
      start: [[0, 0], [5, 0.12]]
    },

    /* 数字华容道 · 塑料滑块：清脆的「嗒」，音高跟着滑块走 */
    npuzzle: {
      wave: 'sine', base: 698, dur: 0.5, gain: 0.95,
      lp: 0, shine: 0.24, click: 0.12, attack: 0.002,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [4, 0.08], [7, 0.16], [12, 0.24], [14, 0.32], [16, 0.40]],
      lose: [[0, 0], [-2, 0.12], [-7, 0.24]],
      start: [[0, 0], [7, 0.07], [12, 0.14]]
    },

    /* 俄罗斯方块 · 小调芯片：和贪吃蛇同族但更低、更「方」，五声音阶带一点俄式味道
       [gyh 2026-11-08 新增] */
    tetris: {
      wave: 'triangle', base: 330, dur: 0.62, gain: 0.82,
      lp: 3200, shine: 0.22, click: 0.16, attack: 0.002,
      scale: [0, 3, 5, 7, 10],
      win: [[0, 0], [3, 0.10], [7, 0.20], [10, 0.30], [12, 0.42], [15, 0.54]],
      lose: [[0, 0], [-3, 0.14], [-5, 0.28], [-12, 0.44]],
      start: [[0, 0], [7, 0.09], [12, 0.18]]
    },

    /* 打砖块 · 弹球台：极短的电子 blip + 撞击瞬态，像老街机的 Pong
       [gyh 2026-11-08 新增] */
    breakout: {
      wave: 'square', base: 660, dur: 0.38, gain: 0.58,
      lp: 4400, shine: 0.06, click: 0.22, attack: 0.001,
      scale: [0, 4, 7, 12, 16],
      win: [[0, 0], [4, 0.08], [7, 0.16], [12, 0.26], [16, 0.36], [19, 0.48]],
      lose: [[0, 0], [-4, 0.10], [-9, 0.22], [-16, 0.36]],
      start: [[0, 0], [4, 0.06], [7, 0.12]]
    },

    /* 连连看 · 竹牌相碰：中高频、极短的木质「嗒」，尾音干净
       [gyh 2026-11-08 新增] */
    linkup: {
      wave: 'triangle', base: 784, dur: 0.30, gain: 0.72,
      lp: 5200, shine: 0.30, click: 0.20, attack: 0.001,
      scale: [0, 2, 5, 7, 9],
      win: [[0, 0], [5, 0.07], [9, 0.14], [12, 0.22], [17, 0.30]],
      lose: [[0, 0], [-2, 0.10], [-5, 0.20]],
      start: [[0, 0], [7, 0.06], [12, 0.12]]
    },

    /* 记忆翻牌 · 纸页翻动：柔和 sine、带一点空气感，音量最轻
       [gyh 2026-11-08 新增] */
    memory: {
      wave: 'sine', base: 523, dur: 0.66, gain: 0.62,
      lp: 2600, shine: 0.42, click: 0.04, attack: 0.012,
      scale: [0, 2, 4, 7, 11],
      win: [[0, 0], [4, 0.10], [7, 0.20], [11, 0.32], [12, 0.44], [16, 0.56]],
      lose: [[0, 0], [-3, 0.16], [-5, 0.32]],
      start: [[0, 0], [4, 0.10], [7, 0.20]]
    },

    /* 五子棋 · 石子落枰：低而实的叩击，短促、几乎无尾音
       [gyh 2026-11-08 新增] */
    gomoku: {
      wave: 'triangle', base: 294, dur: 0.34, gain: 0.88,
      lp: 1900, shine: 0.16, click: 0.30, attack: 0.001,
      scale: [0, 3, 5, 7, 10],
      win: [[0, 0], [3, 0.09], [7, 0.18], [10, 0.28], [12, 0.40]],
      lose: [[0, 0], [-3, 0.12], [-7, 0.26]],
      start: [[0, 0], [5, 0.08], [7, 0.16]]
    },

    /* 横版跳跃 · 掌机芯片音：明亮方波大调琶音，跳跃感最强
       [gyh 2026-11-08 新增] */
    mario: {
      wave: 'square', base: 440, dur: 0.46, gain: 0.52,
      lp: 5600, shine: 0.10, click: 0.14, attack: 0.001,
      scale: [0, 4, 7, 9, 12],
      win: [[0, 0], [4, 0.08], [7, 0.16], [12, 0.24], [16, 0.32], [19, 0.40], [24, 0.50]],
      lose: [[0, 0], [-1, 0.10], [-3, 0.20], [-5, 0.30]],
      start: [[0, 0], [4, 0.07], [7, 0.14], [12, 0.21]]
    },

    /* 迷宫 · 木琴音：清亮中音三角波，带一点敲击感
       [gyh 2026-11-08 新增] 批次三 */
    maze: {
      wave: 'triangle', base: 392, dur: 0.5, gain: 0.92,
      lp: 2400, shine: 0.22, click: 0.16, attack: 0.004,
      scale: [0, 2, 4, 7, 9],
      win: [[0, 0], [4, 0.09], [7, 0.18], [12, 0.28], [16, 0.38]],
      lose: [[0, 0], [-3, 0.13], [-7, 0.26]],
      start: [[0, 0], [4, 0.07], [7, 0.14]]
    },

    /* 坦克大战 · 机械方波：低音方波，重瞬态像履带与炮击
       [gyh 2026-11-08 新增] 批次三 */
    tank: {
      wave: 'square', base: 247, dur: 0.42, gain: 0.62,
      lp: 3000, shine: 0.05, click: 0.42, attack: 0.002,
      scale: [0, 3, 5, 7, 10],
      win: [[0, 0], [3, 0.10], [7, 0.20], [10, 0.30], [12, 0.42]],
      lose: [[0, 0], [-5, 0.12], [-12, 0.26]],
      start: [[0, 0], [5, 0.08], [10, 0.16]]
    },

    /* 星际飞机大战 · 科幻电音：高音方波，快而亮，像街机射击
       [gyh 2026-11-08 新增] 批次三 */
    plane: {
      wave: 'square', base: 587, dur: 0.34, gain: 0.54,
      lp: 5200, shine: 0.12, click: 0.20, attack: 0.001,
      scale: [0, 4, 7, 12, 16],
      win: [[0, 0], [4, 0.07], [7, 0.14], [12, 0.22], [16, 0.32], [19, 0.42]],
      lose: [[0, 0], [-4, 0.10], [-9, 0.22], [-16, 0.36]],
      start: [[0, 0], [4, 0.06], [7, 0.12]]
    },

    /* 炸弹人 · 爆破音：中低方波 + 强瞬态，像炸弹的闷响
       [gyh 2026-11-08 新增] 批次三 */
    bomber: {
      wave: 'square', base: 220, dur: 0.46, gain: 0.7,
      lp: 2600, shine: 0.06, click: 0.46, attack: 0.002,
      scale: [0, 2, 5, 7, 10],
      win: [[0, 0], [2, 0.09], [5, 0.18], [10, 0.28], [12, 0.40]],
      lose: [[0, 0], [-5, 0.12], [-10, 0.26]],
      start: [[0, 0], [5, 0.08], [10, 0.16]]
    }
  };

  /* body[data-dict] → 主题名 */
  var ALIAS = {
    'g2048': '2048',
    'sudoku': 'sudoku',
    'gmines': 'mines',
    'gmatch3': 'match3',
    'gjigsaw': 'jigsaw',
    'gsnake': 'snake',
    'gsokoban': 'sokoban',
    'gnpuzzle': 'npuzzle',
    'gtetris': 'tetris',      // [gyh 2026-11-08 新增]
    'gbreakout': 'breakout',  // [gyh 2026-11-08 新增]
    'glinkup': 'linkup',      // [gyh 2026-11-08 新增] 批次二
    'gmemory': 'memory',      // [gyh 2026-11-08 新增]
    'ggomoku': 'gomoku',      // [gyh 2026-11-08 新增]
    'gmario': 'mario',        // [gyh 2026-11-08 新增]
    'gmaze': 'maze',          // [gyh 2026-11-08 新增] 批次三
    'gtank': 'tank',          // [gyh 2026-11-08 新增] 批次三
    'gplane': 'plane',        // [gyh 2026-11-08 新增] 批次三
    'gbomber': 'bomber'       // [gyh 2026-11-08 新增] 批次三
  };

  function detect() {
    if (detected) return detected;
    var body = document.body;
    if (!body) return 'default';

    var raw = body.getAttribute('data-dict') || body.getAttribute('data-game') || '';
    var key = ALIAS[raw] || raw;
    if (!THEMES[key]) return 'default';

    detected = key;
    return key;
  }

  /** 当前生效的主题配置 */
  function T() {
    return THEMES[manual || detect()] || THEMES['default'];
  }

  /* ---------------- 开关 ---------------- */

  function soundOn() {
    if (window.YSGame && typeof window.YSGame.isSoundOn === 'function') {
      return window.YSGame.isSoundOn();
    }
    try {
      return window.localStorage.getItem('ys_sound') !== 'off';
    } catch (e) {
      return true;
    }
  }

  /* ---------------- 上下文 ---------------- */

  function ensure() {
    if (!AC) return null;

    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;

      // 连击、爆炸、过场旋律叠在一起容易顶到 0dB，压一下更干净
      if (ctx.createDynamicsCompressor) {
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 10;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }
    }

    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 噪声缓冲只建一次，所有人共用 */
  function buildNoise(ac) {
    var len = Math.floor(ac.sampleRate * 1.2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * 一段噪声。返回输出节点，调用方决定接到哪儿。
   * @param {Object} o freq / to / dur / gain / delay / filter / q
   */
  function noiseNode(o) {
    var ac = ensure();
    if (!ac) return null;
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) buildNoise(ac);

    var t0 = ac.currentTime + (o.delay || 0);
    var dur = o.dur || 0.2;

    var src = ac.createBufferSource();
    src.buffer = noiseBuf;

    var filt = ac.createBiquadFilter();
    filt.type = o.filter || 'lowpass';
    filt.frequency.setValueAtTime(Math.max(60, o.freq || 1400), t0);
    if (o.to) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + dur);
    }
    filt.Q.value = o.q == null ? 1 : o.q;

    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain == null ? 0.12 : o.gain), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filt);
    filt.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
    return g;
  }

  /** 噪声直接送到总输出（爆炸、脚步） */
  function noise(o) {
    var th = T();
    var dur = Math.max(0.03, (o.dur || 0.2) * th.dur);
    var peak = Math.max(0.0005, (o.gain == null ? 0.12 : o.gain) * th.gain);

    // 主题的低通会把噪声也压暗，这是「闷」的来源，不要绕过
    var hi = o.freq || 1400;
    if (th.lp) hi = Math.min(hi, th.lp * 1.5);

    var out = noiseNode({
      freq: hi,
      to: o.to || hi * 0.3,
      dur: dur,
      gain: peak,
      delay: o.delay,
      filter: o.filter || 'lowpass',
      q: o.q
    });
    if (out) out.connect(master);
  }

  /**
   * 一个带包络的音。主音 + 泛音层 + 瞬态噪声，
   * 三层配比决定了它是木琴、钢琴还是塑料。
   * @param {number} freq 基频
   * @param {Object} o to / dur / gain / delay / type / noShine / noClick
   */
  function v(freq, o) {
    var th = T();
    var ac = ensure();
    if (!ac) return;
    o = o || {};

    var t0 = ac.currentTime + (o.delay || 0);
    var dur = Math.max(0.03, (o.dur || 0.08) * th.dur);
    var peak = Math.max(0.0004, (o.gain == null ? 0.12 : o.gain) * th.gain);
    var attack = Math.max(0.002, o.attack || th.attack);

    // 先汇到一条总线，低通 / 瞬态统一处理
    var bus = ac.createGain();
    bus.gain.value = 1;

    /* 主音 */
    var osc = ac.createOscillator();
    osc.type = o.type || th.wave;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (o.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur * 0.82);
    }

    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(bus);

    /* 泛音层：八度上方一条正弦，衰减比主音快，木/塑料全靠它 */
    if (!o.noShine && th.shine > 0) {
      var osc2 = ac.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(Math.max(20, freq * 2), t0);
      if (o.to) {
        osc2.frequency.exponentialRampToValueAtTime(Math.max(20, o.to * 2), t0 + dur * 0.82);
      }

      var g2 = ac.createGain();
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * th.shine), t0 + attack + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.55);

      osc2.connect(g2);
      g2.connect(bus);
      osc2.start(t0);
      osc2.stop(t0 + dur + 0.03);
    }

    /* 低通：越闷越像木头 / 石头 */
    var tail = bus;
    if (th.lp) {
      var lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = th.lp;
      lp.Q.value = 0.7;
      bus.connect(lp);
      tail = lp;
    }

    /* 瞬态：木槌、指甲、鼓槌砸下去的那一下 */
    if (!o.noClick && th.click > 0) {
      var clk = noiseNode({
        freq: Math.min(3200, freq * 4),
        to: Math.min(900, freq * 1.5),
        dur: 0.018,
        gain: peak * th.click * 2.2,
        delay: o.delay || 0,
        filter: 'bandpass',
        q: 1.2
      });
      if (clk) clk.connect(bus);
    }

    tail.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* ---------------- 音阶工具 ---------------- */

  /** 按主题音阶取第 deg 级（自动跨八度） */
  function degFreq(deg) {
    var th = T();
    var scale = th.scale;
    var oct = Math.floor(deg / scale.length);
    var i = ((deg % scale.length) + scale.length) % scale.length;
    return th.base * Math.pow(2, (scale[i] + oct * 12) / 12);
  }

  /** 弹一段旋律，steps 是 [[半音偏移, 延迟秒], ...] */
  function melody(steps, gain, dur) {
    var th = T();
    for (var i = 0; i < steps.length; i++) {
      v(th.base * Math.pow(2, steps[i][0] / 12), {
        dur: dur,
        gain: gain,
        delay: steps[i][1]
      });
    }
  }

  /* ---------------- 音色表 ----------------
     同一批动作名，在十个主题下发出十种声音。
     ------------------------------------------ */

  var SFX = {

    /* 轻点 */
    tap: function () {
      var f = T().base * 1.5;
      v(f, { to: f * 1.06, dur: 0.045, gain: 0.11 });
    },

    /* 拿起一块 */
    pick: function () {
      var f = T().base * 1.3;
      v(f, { to: f * 1.07, dur: 0.04, gain: 0.1 });
    },

    /* 落子 / 填数：短，带一点木头的摩擦 */
    input: function () {
      var f = T().base * 1.1;
      v(f, { to: f * 1.2, dur: 0.065, gain: 0.13 });
    },

    place: function () {
      var f = T().base;
      v(f, { to: f * 1.24, dur: 0.07, gain: 0.13 });
    },

    /* 滑块：音高跟着位置走，一格一个音 */
    slide: function (o) {
      var step = Math.min(Math.max((o && o.step) || 0, 0), 10);
      var f = degFreq(step);
      v(f, { to: f * 1.06, dur: 0.045, gain: 0.085 });
    },

    /* 整盘推动（2048）：整体音高轻微浮动，连续推不会像节拍器 */
    move: function () {
      var f = T().base * 0.6 * (0.95 + Math.random() * 0.1);
      v(f, { to: f * 1.2, dur: 0.06, gain: 0.075 });
    },

    /* 合并：按主题音阶一格一格往上爬 */
    merge: function (o) {
      var lv = Math.min(Math.max(((o && o.level) || 1) - 1, 0), 11);
      var f = degFreq(lv);
      v(f, { dur: 0.12, gain: 0.17 });
      v(f * Math.pow(2, 7 / 12), { dur: 0.1, gain: 0.07, delay: 0.012, noShine: true });
    },

    /* 消除：连击升音，最多五级，再高就刺耳了 */
    pop: function (o) {
      var c = Math.min(Math.max(((o && o.combo) || 1) - 1, 0), 5);
      var f = degFreq(c);
      v(f, { to: f * 1.5, dur: 0.075, gain: 0.135 });
      v(f * 2, { dur: 0.05, gain: 0.05, delay: 0.012, noShine: true });
    },

    /* 交换两格 */
    swap: function () {
      var f = T().base * 1.2;
      v(f, { to: f * 0.78, dur: 0.06, gain: 0.1 });
    },

    /* 拼图归位：先一声「咔」，再补一个高音确认 */
    snap: function () {
      var f = T().base * 1.5;
      v(f, { dur: 0.07, gain: 0.14 });
      v(f * 1.5, { dur: 0.09, gain: 0.06, delay: 0.045 });
    },

    /* 扫雷翻格：极短，音高带一点随机，连翻一片不会像机关枪 */
    reveal: function () {
      var f = T().base * (1.15 + Math.random() * 0.12);
      v(f, { dur: 0.032, gain: 0.085 });
    },

    /* 插旗 */
    flag: function () {
      var f = T().base * 2.2;
      v(f, { dur: 0.028, gain: 0.07, noShine: true });
      v(f * 1.42, { dur: 0.045, gain: 0.05, delay: 0.012, noShine: true });
    },

    /* 踩雷：宽频噪声 + 低频冲击 */
    boom: function () {
      noise({ freq: 1900, to: 80, dur: 0.45, gain: 0.24, filter: 'lowpass' });
      v(96, { to: 40, dur: 0.4, gain: 0.2, type: 'sine', noShine: true, noClick: true });
    },

    /* 贪吃蛇吃到：经典两音交替 */
    eat: function () {
      var th = T();
      v(th.base, { dur: 0.045, gain: 0.1, type: 'square', noShine: true, noClick: true });
      v(th.base * Math.pow(2, 7 / 12), {
        dur: 0.05, gain: 0.09, delay: 0.05, type: 'square', noShine: true, noClick: true
      });
    },

    /* 走一步（推箱子）：很轻，音高每次浮动一点，走二十步也不会像节拍器 */
    step: function () {
      var k = 0.94 + Math.random() * 0.12;
      noise({ freq: 620 * k, to: 240, dur: 0.035, gain: 0.06 });
      v(120 * k, { to: 104 * k, dur: 0.035, gain: 0.05, noShine: true });
    },

    /* 推箱子：低沉的「咚」，脚底能感到重量 */
    push: function () {
      noise({ freq: 520, to: 150, dur: 0.1, gain: 0.1 });
      v(150, { to: 105, dur: 0.13, gain: 0.16, noShine: true });
    },

    deadlock: function () {
      v(210, { to: 148, dur: 0.2, gain: 0.07, type: 'sawtooth', noShine: true });
    },

    /* 撤销：往回滑一下 */
    undo: function () {
      var f = T().base * 1.2;
      v(f, { to: f * 0.8, dur: 0.055, gain: 0.1 });
    },

    /* 洗牌：三连音 */
    shuffle: function () {
      for (var i = 0; i < 3; i++) {
        v(degFreq(i * 2), { dur: 0.06, gain: 0.1, delay: i * 0.06 });
      }
    },

    /* 提示 */
    hint: function () {
      var f = T().base * 1.15;
      v(f, { to: f * 1.22, dur: 0.08, gain: 0.11 });
      v(f * 1.7, { dur: 0.09, gain: 0.06, delay: 0.07 });
    },

    error: function () {
      v(190, { to: 162, dur: 0.13, gain: 0.08, type: 'sawtooth', noShine: true });
    },

    /* 开局 / 过关 / 失败：每个主题旋律都不一样 */
    start: function () {
      melody(T().start, 0.11, 0.16);
    },

    complete: function () {
      // 数独过关不必放完整八音，前四个音就够
      melody(T().win.slice(0, 4), 0.12, 0.22);
    },

    win: function () {
      melody(T().win, 0.13, 0.24);
    },

    record: function () {
      melody(T().win, 0.14, 0.24);
      v(T().base * 4, { dur: 0.26, gain: 0.05, delay: 0.5, noShine: true });
    },

    lose: function () {
      melody(T().lose, 0.11, 0.24);
    },

    /* ---------------------------------------------------------------
       第二批：UI 反馈 / 连击 / 物理动作 / 庆祝
       全部走 T()，所以十八套主题会自动长出十四种音色，不用逐个配。
       高频动作（bounce / brick / turn）都带随机音高或由调用方节流，
       免得连打时听成一条平铺的机关枪。
       [gyh 2026-11-08 新增]
       --------------------------------------------------------------- */

    /* 按钮确认：一声实、一声虚，比原来的 tap 更像「按下去」 */
    click: function () {
      var f = T().base * 1.35;
      v(f, { dur: 0.035, gain: 0.085 });
      v(f * 1.5, { dur: 0.04, gain: 0.035, delay: 0.02, noShine: true });
    },

    /* 切换难度 / 规格：两音上行，明确告诉玩家「换了」 */
    toggle: function () {
      v(degFreq(0), { dur: 0.05, gain: 0.09 });
      v(degFreq(2), { dur: 0.075, gain: 0.085, delay: 0.048 });
    },

    /* 选中某一项（选关、选图片） */
    select: function () {
      var f = T().base * 1.6;
      v(f, { to: f * 1.12, dur: 0.05, gain: 0.09 });
    },

    /* 倒计时 / 计时滴答：极轻，不抢戏 */
    tick: function () {
      v(T().base * 2, { dur: 0.022, gain: 0.05, noShine: true, noClick: true });
    },

    /* 只剩最后几步 / 最后一条命：两声下行小警报 */
    warn: function () {
      var f = T().base * 0.9;
      v(f, { dur: 0.07, gain: 0.10, noShine: true });
      v(f * 0.94, { dur: 0.09, gain: 0.09, delay: 0.115, noShine: true });
    },

    /* 大连击：从连击数对应的音级往上弹三个音，越连越高 */
    combo: function (o) {
      var c = Math.min(Math.max(((o && o.combo) || 2) - 2, 0), 6);
      for (var i = 0; i < 3; i++) {
        v(degFreq(c + i * 2), { dur: 0.07, gain: 0.11 - i * 0.015, delay: i * 0.045 });
      }
    },

    /* 整行 / 整片清除：一道噪声扫频 + 上行短琶音；rows 越多音越多 */
    clear: function (o) {
      var rows = Math.min(Math.max((o && o.rows) || 1, 1), 4);
      noise({ freq: 2600, to: 420, dur: 0.2, gain: 0.10, filter: 'bandpass', q: 0.8 });
      for (var i = 0; i < rows + 1; i++) {
        v(degFreq(i * 2 + 2), { dur: 0.1, gain: 0.12, delay: i * 0.035 });
      }
    },

    /* 落地 / 硬降：低音撞击 + 一点摩擦噪声 */
    drop: function () {
      var f = T().base * 0.5;
      noise({ freq: 900, to: 180, dur: 0.09, gain: 0.11 });
      v(f, { to: f * 0.7, dur: 0.11, gain: 0.15, noShine: true });
    },

    /* 旋转：短促上滑 */
    rotate: function () {
      var f = T().base * 1.25;
      v(f, { to: f * 1.45, dur: 0.045, gain: 0.085, noShine: true });
    },

    /* 锁定落定：比 drop 轻，不带下坠感 */
    lock: function () {
      v(T().base * 0.75, { dur: 0.06, gain: 0.11 });
      noise({ freq: 700, to: 260, dur: 0.05, gain: 0.06 });
    },

    /* 弹跳：随机音高，连续撞墙不会像节拍器 */
    bounce: function (o) {
      var k = 0.92 + Math.random() * 0.16;
      var f = T().base * ((o && o.high) ? 1.6 : 1.15) * k;
      v(f, { to: f * 0.82, dur: 0.03, gain: 0.075, noShine: true });
    },

    /* 砖块破碎：噪声碎片 + 随连击升高的音 */
    brick: function (o) {
      var c = Math.min(Math.max(((o && o.combo) || 1) - 1, 0), 6);
      noise({ freq: 2200, to: 700, dur: 0.05, gain: 0.075, filter: 'bandpass', q: 1.1 });
      v(degFreq(c), { dur: 0.055, gain: 0.10, noShine: true });
    },

    /* 拿到道具 / 奖励：四音上行 */
    powerup: function () {
      for (var i = 0; i < 4; i++) {
        v(degFreq(i + 2), { dur: 0.08, gain: 0.10, delay: i * 0.055 });
      }
    },

    /* 得分 / 入袋：经典两音「叮」 */
    coin: function () {
      var f = T().base * 2;
      v(f, { dur: 0.055, gain: 0.10, noShine: true, noClick: true });
      v(f * 1.5, { dur: 0.09, gain: 0.085, delay: 0.055, noShine: true, noClick: true });
    },

    /* 破纪录 / 完美：比 win 更长，最后挂一颗高音 */
    perfect: function () {
      melody([[0, 0], [4, 0.07], [7, 0.14], [12, 0.22], [16, 0.31], [19, 0.42]], 0.11, 0.16);
      v(T().base * 4, { dur: 0.32, gain: 0.045, delay: 0.5, noShine: true });
    },

    /* 快速甩动 / 硬降的风声 */
    whoosh: function () {
      noise({ freq: 1800, to: 260, dur: 0.14, gain: 0.09, filter: 'bandpass', q: 0.7 });
    },

    /* 升关 / 升档：四音爬升后落一颗长音 */
    levelup: function () {
      for (var i = 0; i < 4; i++) {
        v(degFreq(i * 2), { dur: 0.12, gain: 0.11, delay: i * 0.075 });
      }
      v(T().base * 2, { dur: 0.22, gain: 0.05, delay: 0.32, noShine: true });
    },

    /* 转向：极短、极轻，给贪吃蛇这类每步都要反馈的操作用 */
    turn: function () {
      var f = T().base * 1.05;
      v(f, { to: f * 1.18, dur: 0.025, gain: 0.05, noShine: true, noClick: true });
    }
  };

  /* ---------------- 对外接口 ---------------- */

  function play(name, opts) {
    if (!soundOn() || !AC) return;

    // 用户还没碰过页面时不建上下文：浏览器本来就会静音，
    // 建了只会在控制台留一条 suspended 警告，还白占一条音频线程。
    if (!ctx && !unlocked) return;

    var fn = SFX[name];
    if (!fn) return;

    if (opts && opts.theme && THEMES[opts.theme]) {
      var old = manual;
      manual = opts.theme;
      try { fn(opts); } finally { manual = old; }
      return;
    }

    fn(opts || {});
  }

  // 第一次触摸 / 按键时把上下文建好，之后第一声不会有延迟
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensure();
  }

  document.addEventListener('pointerdown', unlock, { once: true, passive: true });
  document.addEventListener('keydown', unlock, { once: true, passive: true });

  window.YSound = {
    play: play,
    unlock: unlock,

    /** 手动锁一个主题；传 null 恢复自动识别 */
    theme: function (name) {
      if (name == null) { manual = null; return detect(); }
      if (!THEMES[name]) return T() && (manual || detect());
      manual = name;
      return name;
    },

    /** 当前主题名（调试用） */
    current: function () { return manual || detect(); },

    /** 所有可用音色名（调试用） */
    names: function () { return Object.keys(SFX); },

    /** 所有主题名（调试用） */
    themes: function () { return Object.keys(THEMES); }
  };
})();
