/**
 * YSGame 分享组件
 *
 * 只在游戏页启用（<body data-dict="...">），两个入口：
 *   1. 导航栏自动插入「分享」按钮
 *   2. 页面上任意带 [data-share-open] 的元素（结算卡片里那个）
 *
 * 分享方式按能力退化：
 *   手机（支持 navigator.share）→ 系统面板，微信、QQ 都在里面
 *   微信内置浏览器            → 只能引导点右上角 ···
 *   桌面                      → 微信（复制）/ 微博 / X / 复制链接
 *
 * 文案走 I18N：common 里有面板用词，各游戏字典里有 share_line。
 * [gyh 2026-11-03 新增]
 */
(function () {
  'use strict';

  var isWeChat = /micromessenger/i.test(navigator.userAgent);
  var canSystemShare = typeof navigator.share === 'function';

  var wrap = null;          // 面板根节点
  var lastFocus = null;     // 关闭后把焦点还回去
  var hintTimer = 0;

  /* ---------------- 文案 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function lang() {
    return (window.I18N && window.I18N.lang) || 'zh';
  }

  /** 分享出去的地址：去掉 hash，语言跟着当前界面走 */
  function pageUrl() {
    var u = new URL(window.location.href);
    u.hash = '';
    if (lang() === 'en') u.searchParams.set('lang', 'en');
    else u.searchParams.delete('lang');
    return u.toString();
  }

  /** 游戏字典里没写 share_line 时退回 tagline */
  function shareLine() {
    var line = t('share_line');
    return line === 'share_line' ? t('tagline') : line;
  }

  function fullText() {
    return t('game_title') + ' · ' + shareLine() + '\n' + pageUrl();
  }

  /* ---------------- 复制 ---------------- */

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);

    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* ---------------- 面板 ---------------- */

  function build() {
    wrap = document.createElement('div');
    wrap.className = 'ys-share';
    wrap.id = 'ysShare';
    wrap.hidden = true;
    wrap.innerHTML = [
      '<div class="ys-share__backdrop" data-share-close></div>',
      '<div class="ys-share__panel" role="dialog" aria-modal="true" aria-labelledby="ysShareTitle">',

      '  <button class="ys-share__close" type="button" data-share-close>',
      '    <span aria-hidden="true">×</span>',
      '  </button>',

      '  <p class="ys-share__eyebrow">YSGame</p>',
      '  <h2 class="ys-share__title" id="ysShareTitle"></h2>',
      '  <p class="ys-share__sub"></p>',

      '  <div class="ys-share__preview">',
      '    <span class="ys-share__mark" aria-hidden="true">Y</span>',
      '    <span class="ys-share__meta">',
      '      <strong class="ys-share__game"></strong>',
      '      <em class="ys-share__tag"></em>',
      '    </span>',
      '  </div>',

      '  <button class="ys-share__primary" type="button"></button>',

      '  <div class="ys-share__row">',
      '    <button class="ys-share__chip" type="button" data-share-channel="wechat">',
      '      <span class="ys-share__chipIcon ys-share__chipIcon--wechat" aria-hidden="true">微</span>',
      '      <span class="ys-share__chipText"></span>',
      '    </button>',
      '    <button class="ys-share__chip" type="button" data-share-channel="weibo">',
      '      <span class="ys-share__chipIcon ys-share__chipIcon--weibo" aria-hidden="true">博</span>',
      '      <span class="ys-share__chipText"></span>',
      '    </button>',
      '    <button class="ys-share__chip" type="button" data-share-channel="x">',
      '      <span class="ys-share__chipIcon ys-share__chipIcon--x" aria-hidden="true">𝕏</span>',
      '      <span class="ys-share__chipText"></span>',
      '    </button>',
      '    <button class="ys-share__chip" type="button" data-share-channel="copy">',
      '      <span class="ys-share__chipIcon ys-share__chipIcon--copy" aria-hidden="true">⧉</span>',
      '      <span class="ys-share__chipText"></span>',
      '    </button>',
      '  </div>',

      '  <p class="ys-share__hint" role="status" aria-live="polite"></p>',
      '</div>'
    ].join('');

    document.body.appendChild(wrap);

    wrap.querySelector('.ys-share__primary').addEventListener('click', systemShare);
  }

  function paint() {
    if (!wrap) return;

    var q = function (sel) { return wrap.querySelector(sel); };

    q('.ys-share__title').textContent = t('share_title');
    q('.ys-share__sub').textContent = t('share_sub');
    q('.ys-share__game').textContent = t('game_title');
    q('.ys-share__tag').textContent = shareLine();
    q('.ys-share__close').setAttribute('aria-label', t('share_close'));

    q('[data-share-channel="wechat"] .ys-share__chipText').textContent = t('share_wechat');
    q('[data-share-channel="weibo"] .ys-share__chipText').textContent = t('share_weibo');
    q('[data-share-channel="x"] .ys-share__chipText').textContent = t('share_x');
    q('[data-share-channel="copy"] .ys-share__chipText').textContent = t('share_copy');

    // 没有系统分享能力（含微信内置浏览器）就只留渠道按钮
    var primary = q('.ys-share__primary');
    primary.textContent = t('share_system');
    primary.hidden = !canSystemShare || isWeChat;

    q('.ys-share__hint').textContent = '';
    q('.ys-share__hint').classList.remove('is-on');
  }

  function hint(msg) {
    var el = wrap.querySelector('.ys-share__hint');
    el.textContent = msg;
    el.classList.add('is-on');
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(function () {
      el.textContent = '';
      el.classList.remove('is-on');
    }, 4200);
  }

  function open(trigger) {
    if (!wrap) build();
    paint();
    collapseNav();

    lastFocus = trigger || document.activeElement;
    wrap.hidden = false;
    document.body.classList.add('is-share-open');

    // 先取消 hidden 再加类，否则过渡不会触发
    window.requestAnimationFrame(function () {
      wrap.classList.add('is-open');
    });

    var first = wrap.querySelector('.ys-share__primary:not([hidden])') ||
      wrap.querySelector('[data-share-channel]');
    if (first) first.focus({ preventScroll: true });
  }

  function close() {
    if (!wrap || wrap.hidden) return;

    wrap.classList.remove('is-open');
    document.body.classList.remove('is-share-open');

    window.setTimeout(function () {
      wrap.hidden = true;
      if (lastFocus && typeof lastFocus.focus === 'function') {
        lastFocus.focus({ preventScroll: true });
      }
    }, 220);
  }

  /* ---------------- 各渠道 ---------------- */

  function systemShare() {
    if (!canSystemShare) return;

    navigator.share({
      title: t('game_title') + ' · YSGame',
      text: shareLine(),
      url: pageUrl()
    }).then(function () {
      close();
    }).catch(function () {
      // 用户取消，不打扰
    });
  }

  function handleChannel(ch) {
    if (ch === 'copy') {
      copy(fullText()).then(function (ok) {
        hint(ok ? t('share_copied') : t('share_copy_fail'));
      });
      return;
    }

    if (ch === 'wechat') {
      if (isWeChat) {
        hint(t('share_wechat_tip'));
        return;
      }
      copy(fullText()).then(function (ok) {
        hint(ok ? t('share_wechat_copy') : t('share_copy_fail'));
      });
      return;
    }

    if (ch === 'weibo') {
      window.open(
        'https://service.weibo.com/share/share.php?url=' + encodeURIComponent(pageUrl()) +
        '&title=' + encodeURIComponent(t('game_title') + ' · ' + shareLine()),
        '_blank',
        'noopener'
      );
      return;
    }

    if (ch === 'x') {
      window.open(
        'https://twitter.com/intent/tweet?url=' + encodeURIComponent(pageUrl()) +
        '&text=' + encodeURIComponent(shareLine()),
        '_blank',
        'noopener'
      );
    }
  }

  /* ---------------- 入口按钮 ---------------- */

  var ARROW_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="M12 15.5V4.2"/><path d="M7.8 8.4 12 4.2l4.2 4.2"/>' +
    '<path d="M5 14.5V18a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 18v-3.5"/></svg>';

  function mountTrigger() {
    // 快捷操作组在导航一级，和汉堡按钮同级，不用展开菜单就能点
    var host = document.querySelector('.ys-nav__utility');
    if (!host || document.getElementById('ysShareBtn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ysShareBtn';
    btn.className = 'ys-share-trigger';
    btn.innerHTML = ARROW_ICON;

    host.insertBefore(btn, host.firstChild);
  }

  /** 从展开的菜单或页面里点分享后，顺手把菜单收起来 */
  function collapseNav() {
    var links = document.getElementById('ysNavLinks');
    var toggle = document.getElementById('ysNavToggle');
    if (links) links.classList.remove('is-open');
    if (toggle) {
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function syncLabels() {
    var btn = document.getElementById('ysShareBtn');
    if (!btn) return;

    // 一级导航里只有图标，名称靠 aria-label 和 title
    btn.setAttribute('aria-label', t('share_title'));
    btn.setAttribute('title', t('share_title'));
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    if (!document.body.hasAttribute('data-dict')) return; // 只服务游戏页

    mountTrigger();
    syncLabels();

    document.addEventListener('click', function (e) {
      // 关：遮罩、×、Esc 之外的点击都走这里
      if (e.target.closest('[data-share-close]')) {
        close();
        return;
      }

      // 开：导航按钮 + 页面里任何 [data-share-open]
      var opener = e.target.closest('#ysShareBtn, [data-share-open]');
      if (opener) {
        e.preventDefault();
        open(opener);
        return;
      }

      var chip = e.target.closest('[data-share-channel]');
      if (chip) handleChannel(chip.getAttribute('data-share-channel'));
    });

    document.addEventListener('keydown', function (e) {
      if (!wrap || wrap.hidden) return;

      if (e.key === 'Escape') {
        close();
        return;
      }

      // 面板是模态的，Tab 不能跑回背后的页面
      if (e.key !== 'Tab') return;

      var items = wrap.querySelectorAll('button:not([hidden]), [href], input, select, textarea');
      if (!items.length) return;

      var first = items[0];
      var last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('ys:langchange', function () {
      syncLabels();
      if (wrap && !wrap.hidden) paint();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
