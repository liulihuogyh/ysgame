/**
 * YSGame 游戏页国际化
 * 游戏页只有一份 HTML，语言在这里原地切换（不像内容页那样跳转 /en/）
 *
 * 文案分两层：
 *   common  —— 导航、页脚、广告位等全站共用
 *   dicts   —— 每款游戏一份，页面用 <body data-dict="g2048"> 指定
 * 查找顺序：当前游戏字典 → common → 中文兜底
 * [gyh 2026-11-02 新增][gyh 2026-11-02 重构：拆分多游戏字典]
 */
(function () {
  'use strict';

  var LANG_KEY = 'ys_lang';

  /* ------------------------------------------------------------------
     全站共用
     ------------------------------------------------------------------ */
  var common = {
    zh: {
      brand_sub: '云舒的小游戏屋',
      nav_home: '游戏大厅',
      nav_about: '关于',
      nav_help: '帮助',
      lang_btn: 'EN',
      lang_aria: 'Switch to English',

      ad_placeholder: '广告位（申请 AdSense 后替换）',

      footer_brand: 'YSGame · 云舒的小游戏屋',
      footer_desc: '一个人维护的休闲小游戏合集。全部免费，不注册、不登录、不弹窗打扰。',
      footer_games: '游戏',
      footer_all: '全部游戏',
      footer_about: '关于',
      footer_story: '品牌故事',
      footer_help: '玩法说明',
      footer_privacy: '隐私政策',
      footer_copy: '一个爸爸的业余作品',

      share_title: '分享给朋友',
      share_sub: '一局几分钟，随手转发给想一起玩的人。',
      share_close: '关闭',
      share_btn: '分享',
      share_system: '分享给朋友',
      share_wechat: '微信',
      share_weibo: '微博',
      share_x: 'X',
      share_copy: '复制链接',
      share_copied: '链接已复制，粘贴给朋友就行。',
      share_copy_fail: '没能复制，长按地址栏手动复制吧。',
      share_wechat_tip: '微信里点右上角 ··· ，选「发送给朋友」。',
      share_wechat_copy: '链接已复制，打开微信粘贴给朋友。'
    },

    en: {
      brand_sub: "Yunshu's little arcade",
      nav_home: 'Games',
      nav_about: 'About',
      nav_help: 'Help',
      lang_btn: '中文',
      lang_aria: '切换到中文',

      ad_placeholder: 'Ad space',

      footer_brand: "YSGame · Yunshu's little arcade",
      footer_desc: 'Quiet games, kept by one person. Free, no account, no pop-ups.',
      footer_games: 'Games',
      footer_all: 'All games',
      footer_about: 'About',
      footer_story: 'The story',
      footer_help: 'How to play',
      footer_privacy: 'Privacy',
      footer_copy: "A dad's side project",

      share_title: 'Share this game',
      share_sub: 'A few quiet minutes. Pass it on to someone who might like it.',
      share_close: 'Close',
      share_btn: 'Share',
      share_system: 'Share',
      share_wechat: 'WeChat',
      share_weibo: 'Weibo',
      share_x: 'X',
      share_copy: 'Copy link',
      share_copied: 'Link copied. Paste it wherever you like.',
      share_copy_fail: 'Copy failed. Grab the address bar instead.',
      share_wechat_tip: 'In WeChat, tap ··· at the top right, then Send to Friend.',
      share_wechat_copy: 'Link copied. Open WeChat and paste it to a friend.'
    }
  };

  /* ------------------------------------------------------------------
     各游戏字典
     ------------------------------------------------------------------ */
  var dicts = {
    sudoku: {
      zh: {
        page_title: '数独 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线数独游戏，五种难度（入门到专家），支持撤销、提示、错误检查和断点续玩。无需注册登录，打开就能玩。',
        game_title: '数独',
        tagline: '慢慢推理，一格一格把秩序填回来',
        share_line: '闲着的时候来一盘数独，五种难度，不用登录。',

        label_level: '难度',
        label_time: '用时',
        label_hints: '提示',

        btn_new: '新游戏',
        btn_menu: '选择难度',
        btn_undo: '↶ 撤销',
        btn_erase: '🗑️ 橡皮',
        btn_hint: '💡 提示',
        btn_check: '✓ 检查',

        menu_title: '选择难度',
        menu_sub: '选一个适合当下心情的难度，慢慢来。',

        diff_easy_label: '🌱 入门（54 个已知数）',
        diff_medium_label: '🌿 简单（36 个已知数）',
        diff_hard_label: '🌳 中等（29 个已知数）',
        diff_expert_label: '🔥 困难（23 个已知数）',
        diff_master_label: '⚡ 专家（17 个已知数）',

        diff_easy: '入门',
        diff_medium: '简单',
        diff_hard: '中等',
        diff_expert: '困难',
        diff_master: '专家',

        modal_title: '🎉 恭喜完成',
        modal_time: '用时',
        modal_level: '难度',
        modal_hints: '用掉提示',
        modal_errors: '错误次数',
        btn_again: '再来一局',

        alert_no_hints: '提示次数用完了。',
        alert_given: '这是题目给出的数字，不需要提示。',
        alert_errors: '有几个格子填错了，标红的那些需要再想想。',
        alert_no_errors: '目前没有发现错误。',
        confirm_new: '要开始新的一局吗？当前的进度会丢失。'
      },

      en: {
        page_title: 'Sudoku, free to play | YSGame',
        page_desc: 'A quiet online Sudoku with five difficulty levels, undo, hints, mistake checking and automatic save. No account, no sign-up.',
        game_title: 'Sudoku',
        tagline: 'Slow reasoning, one square at a time',
        share_line: 'A slow game of Sudoku for whenever you have a few quiet minutes.',

        label_level: 'Level',
        label_time: 'Time',
        label_hints: 'Hints',

        btn_new: 'New game',
        btn_menu: 'Difficulty',
        btn_undo: '↶ Undo',
        btn_erase: '🗑️ Erase',
        btn_hint: '💡 Hint',
        btn_check: '✓ Check',

        menu_title: 'Choose a level',
        menu_sub: 'Pick whichever suits your mood. Nothing here is timed against anyone.',

        diff_easy_label: '🌱 Beginner (54 given)',
        diff_medium_label: '🌿 Easy (36 given)',
        diff_hard_label: '🌳 Medium (29 given)',
        diff_expert_label: '🔥 Hard (23 given)',
        diff_master_label: '⚡ Expert (17 given)',

        diff_easy: 'Beginner',
        diff_medium: 'Easy',
        diff_hard: 'Medium',
        diff_expert: 'Hard',
        diff_master: 'Expert',

        modal_title: '🎉 Solved',
        modal_time: 'Time',
        modal_level: 'Level',
        modal_hints: 'Hints used',
        modal_errors: 'Mistakes',
        btn_again: 'Play another',

        alert_no_hints: 'No hints left.',
        alert_given: 'That number came with the puzzle.',
        alert_errors: 'A few cells are off. The red ones need another look.',
        alert_no_errors: 'No mistakes so far.',
        confirm_new: 'Start a new game? Your current progress will be lost.'
      }
    },

    g2048: {
      zh: {
        page_title: '2048 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线 2048：上下左右滑动合并相同的数字，支持撤销、最高分记录和断点续玩。无需注册登录，打开就能玩。',
        game_title: '2048',
        tagline: '上下左右，把相同的数字叠在一起',
        share_line: '滑两下就上手的 2048，看看你能叠到多少。',

        board_aria: '2048 棋盘',
        label_score: '得分',
        label_best: '最高',

        btn_new: '新游戏',
        btn_undo: '↶ 撤销',
        hint_keys: '用方向键或 WASD，手机上直接滑动',

        win_title: '拼到 2048 了',
        win_sub: '可以接着往上叠，也可以重新开一局。',
        btn_continue: '继续玩',

        over_title: '这一局到此为止',
        over_sub: '格子满了，也没有能合并的数字了。',
        btn_again: '再来一局',

        confirm_new: '要重新开一局吗？这一局的进度会丢掉。'
      },

      en: {
        page_title: '2048, free to play | YSGame',
        page_desc: 'A quiet 2048. Slide the tiles, merge the matching numbers, undo when you change your mind. Saves automatically, no account needed.',
        game_title: '2048',
        tagline: 'Slide the tiles, merge the matching numbers',
        share_line: '2048: swipe, merge, and see how far you get.',

        board_aria: '2048 board',
        label_score: 'Score',
        label_best: 'Best',

        btn_new: 'New game',
        btn_undo: '↶ Undo',
        hint_keys: 'Arrow keys or WASD. Swipe on a phone.',

        win_title: 'You reached 2048',
        win_sub: 'Keep going for 4096, or start a fresh board.',
        btn_continue: 'Keep playing',

        over_title: 'No moves left',
        over_sub: 'The board is full, and nothing matches any more.',
        btn_again: 'Play again',

        confirm_new: 'Start a new game? This board will be lost.'
      }
    },

    gmines: {
      zh: {
        page_title: '扫雷 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线扫雷：入门 9×9、进阶 16×16 两种棋盘，第一次点击永不踩雷，支持右键插旗、手机长按、计时与最佳成绩。无需注册登录，打开就能玩。',
        game_title: '扫雷',
        tagline: '翻开每一格，用数字推掉剩下的可能',
        share_line: '经典扫雷，第一次点击不会踩雷。',

        board_aria: '扫雷棋盘',
        level_group_aria: '选择难度',
        label_mines: '剩余雷数',
        label_time: '用时',
        label_best: '最佳',

        level_easy: '入门 9×9',
        level_hard: '进阶 16×16',

        btn_flag: '🚩 插旗',
        btn_new: '新游戏',
        btn_again: '再来一局',

        hint_controls: '轻点翻开，长按插旗；电脑上左键翻开、右键插旗。',

        lose_title: '踩到雷了',
        lose_sub: '重开一局，先把确定的格子插上旗。',
        win_title: '全部扫清了',
        win_sub: '雷区清空，用时记在下面。',

        confirm_new: '要重新开一局吗？当前进度会丢失。',

        cell_pos: '第 {r} 行第 {c} 列',
        cell_empty: '空',
        cell_flag: '插了旗',
        cell_covered: '未翻开',
        cell_mine: '地雷'
      },

      en: {
        page_title: 'Minesweeper, free to play | YSGame',
        page_desc: 'A quiet online Minesweeper with 9×9 and 16×16 boards. The first click never hits a mine, right-click or long-press to flag, and your best time is kept. No account needed.',
        game_title: 'Minesweeper',
        tagline: 'Turn over a square, let the numbers do the reasoning',
        share_line: 'Classic Minesweeper, and the first click never hits a mine.',

        board_aria: 'Minesweeper board',
        level_group_aria: 'Choose a board size',
        label_mines: 'Mines left',
        label_time: 'Time',
        label_best: 'Best',

        level_easy: '9×9',
        level_hard: '16×16',

        btn_flag: '🚩 Flag',
        btn_new: 'New game',
        btn_again: 'Play again',

        hint_controls: 'Tap to open, press and hold to flag. On a computer, left-click opens and right-click flags.',

        lose_title: 'That one was a mine',
        lose_sub: 'Start again and flag what you are sure of first.',
        win_title: 'Clear field',
        win_sub: 'Every mine accounted for. Your time is below.',

        confirm_new: 'Start a new board? This one will be lost.',

        cell_pos: 'Row {r}, column {c}',
        cell_empty: 'empty',
        cell_flag: 'flagged',
        cell_covered: 'covered',
        cell_mine: 'mine'
      }
    }
  };

  /* ------------------------------------------------------------------
     语言判定与应用
     ------------------------------------------------------------------ */

  function detectLang() {
    var q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;

    var saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;

    return 'zh';
  }

  function currentDict() {
    var name = document.body && document.body.getAttribute('data-dict');
    return (name && dicts[name]) ? dicts[name] : null;
  }

  var api = {
    lang: detectLang(),

    t: function (key) {
      var lang = this.lang;
      var d = currentDict();

      if (d && d[lang] && d[lang][key] !== undefined) return d[lang][key];
      if (common[lang] && common[lang][key] !== undefined) return common[lang][key];

      // 兜底中文，避免漏翻时页面出现裸 key
      if (d && d.zh && d.zh[key] !== undefined) return d.zh[key];
      if (common.zh[key] !== undefined) return common.zh[key];
      return key;
    },

    apply: function () {
      var lang = this.lang;
      var isEn = lang === 'en';

      document.documentElement.lang = isEn ? 'en' : 'zh-CN';
      document.body.classList.toggle('lang-en', isEn);

      // 纯文本节点
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute('data-i18n');
        nodes[i].textContent = this.t(key);
      }

      // 需要保留 HTML 的节点（含 <br> 等多半不用，留作扩展）
      var htmlNodes = document.querySelectorAll('[data-i18n-html]');
      for (var j = 0; j < htmlNodes.length; j++) {
        htmlNodes[j].innerHTML = this.t(htmlNodes[j].getAttribute('data-i18n-html'));
      }

      // title / aria-label
      var ariaNodes = document.querySelectorAll('[data-i18n-aria]');
      for (var k = 0; k < ariaNodes.length; k++) {
        ariaNodes[k].setAttribute('aria-label', this.t(ariaNodes[k].getAttribute('data-i18n-aria')));
      }

      // 链接目标要跟着语言走：英文模式指向 /en/，中文模式指向根目录
      var linkNodes = document.querySelectorAll('[data-href-zh]');
      for (var m = 0; m < linkNodes.length; m++) {
        var target = isEn
          ? linkNodes[m].getAttribute('data-href-en')
          : linkNodes[m].getAttribute('data-href-zh');
        if (target) linkNodes[m].setAttribute('href', target);
      }

      document.title = this.t('page_title');
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', this.t('page_desc'));

      document.dispatchEvent(new CustomEvent('ys:langchange', { detail: { lang: lang } }));
    },

    setLang: function (lang) {
      if (lang !== 'zh' && lang !== 'en') return;

      this.lang = lang;
      localStorage.setItem(LANG_KEY, lang);

      // 让地址栏也能直接分享对应语言
      var url = new URL(window.location.href);
      if (lang === 'en') {
        url.searchParams.set('lang', 'en');
      } else {
        url.searchParams.delete('lang');
      }
      window.history.replaceState({}, '', url);

      this.apply();
    }
  };

  window.I18N = api;

  function boot() {
    api.apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
