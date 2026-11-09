/* [gyh 2026-11-09 新增] 魔方纯状态模型 / 转层逻辑：不依赖 DOM，浏览器与 Node 通用 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : global;

  var FACES = ['U', 'D', 'L', 'R', 'F', 'B'];

  // 本站原创莫兰迪配色，刻意避开任何知名品牌的标准配色
  var COLORS = {
    U: '#F4F0E6', D: '#E9C97A', F: '#8FB5A5',
    B: '#7E8FC0', L: '#D98C7A', R: '#B48BB4'
  };

  // 面定义：axis 为法向轴(0=x,1=y,2=z)，layer 为所在层，sign 决定顺时针转向
  var FACE_DEF = {
    U: { axis: 1, layer: 1, sign: -1 },
    D: { axis: 1, layer: -1, sign: 1 },
    R: { axis: 0, layer: 1, sign: -1 },
    L: { axis: 0, layer: -1, sign: 1 },
    F: { axis: 2, layer: 1, sign: -1 },
    B: { axis: 2, layer: -1, sign: 1 }
  };

  // 生成已还原状态：按 FACES 顺序遍历 6 个面，每个面按两个非面法向轴坐标的笛卡尔积铺贴纸
  // [gyh 2026-11-09 新增]
  function create(n) {
    if (n !== 2) n = 3;
    var coords = n === 3 ? [-1, 0, 1] : [-1, 1];
    var stickers = [];
    for (var f = 0; f < FACES.length; f++) {
      var face = FACES[f];
      var def = FACE_DEF[face];
      var axis = def.axis;
      var others = [];
      for (var a = 0; a < 3; a++) {
        if (a !== axis) others.push(a);
      }
      var normal = [0, 0, 0];
      normal[axis] = def.layer;
      for (var i = 0; i < coords.length; i++) {
        for (var j = 0; j < coords.length; j++) {
          var p = [0, 0, 0];
          p[axis] = def.layer;
          p[others[0]] = coords[i];
          p[others[1]] = coords[j];
          stickers.push({ p: p, n: [normal[0], normal[1], normal[2]], c: face });
        }
      }
    }
    return { n: n, stickers: stickers };
  }

  // 深拷贝，返回纯 JSON 数据，可直接 JSON.stringify 存 localStorage
  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  // 绕指定轴做一次 ±90° 旋转（右手系），结果取整兜底
  function rotate90(v, axis, s) {
    var x = v[0], y = v[1], z = v[2], r;
    if (axis === 0) {
      r = s > 0 ? [x, -z, y] : [x, z, -y];
    } else if (axis === 1) {
      r = s > 0 ? [z, y, -x] : [-z, y, x];
    } else {
      r = s > 0 ? [-y, x, z] : [y, -x, z];
    }
    return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2])];
  }

  // 绕轴旋转 quarter 个 90°（quarter 带符号，支持任意整数）
  function rotateAxis(v, axis, quarter) {
    var s = quarter > 0 ? 1 : -1;
    var times = Math.abs(quarter) % 4;
    var out = [v[0], v[1], v[2]];
    for (var i = 0; i < times; i++) {
      out = rotate90(out, axis, s);
    }
    return out;
  }

  // 原地转一层：layer 上每张贴纸的位置 p 与法向 n 同步旋转，颜色 c 不变
  // quarter = sign * dir，保证 turn(s,f,1) 与 turn(s,f,-1) 严格互逆
  // [gyh 2026-11-09 新增]
  function turn(state, face, dir) {
    var def = FACE_DEF[face];
    if (!def) return state;
    var dirn = dir >= 0 ? 1 : -1;
    var quarter = def.sign * dirn;
    for (var i = 0; i < state.stickers.length; i++) {
      var st = state.stickers[i];
      if (st.p[def.axis] === def.layer) {
        st.p = rotateAxis(st.p, def.axis, quarter);
        st.n = rotateAxis(st.n, def.axis, quarter);
      }
    }
    return state;
  }

  // 原地打乱：避免连续两次选同一面，dir 恒为 ±1，返回着法数组
  // [gyh 2026-11-09 新增]
  function scramble(state, count, rng) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    var moves = [];
    var lastFace = null;
    var total = count | 0;
    if (total < 0) total = 0;
    for (var i = 0; i < total; i++) {
      var pool = [];
      for (var k = 0; k < FACES.length; k++) {
        if (FACES[k] !== lastFace) pool.push(FACES[k]);
      }
      var idx = Math.floor(rand() * pool.length);
      if (idx < 0) idx = 0;
      if (idx >= pool.length) idx = pool.length - 1;
      var face = pool[idx];
      var dir = rand() < 0.5 ? 1 : -1;
      lastFace = face;
      turn(state, face, dir);
      moves.push({ face: face, dir: dir });
    }
    return moves;
  }

  // 按法向分组：每个朝向的所有贴纸颜色一致即算还原
  function isSolved(state) {
    var first = {};
    for (var i = 0; i < state.stickers.length; i++) {
      var st = state.stickers[i];
      var key = st.n[0] + ',' + st.n[1] + ',' + st.n[2];
      if (first[key] === undefined) {
        first[key] = st.c;
      } else if (first[key] !== st.c) {
        return false;
      }
    }
    return true;
  }

  // 从存档还原：校验 n 与贴纸数量（及基本结构），非法时回退到 create(3)
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.stickers)) {
      return create(3);
    }
    if (obj.n !== 2 && obj.n !== 3) return create(3);
    var expected = obj.n === 3 ? 54 : 24;
    if (obj.stickers.length !== expected) return create(3);
    for (var i = 0; i < obj.stickers.length; i++) {
      var s = obj.stickers[i];
      if (!s || !Array.isArray(s.p) || !Array.isArray(s.n) || typeof s.c !== 'string') {
        return create(3);
      }
    }
    return clone(obj);
  }

  root.CubeCore = {
    FACES: FACES,
    COLORS: COLORS,
    create: create,
    clone: clone,
    turn: turn,
    scramble: scramble,
    isSolved: isSolved,
    restore: restore
  };
})();
