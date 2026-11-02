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
    },

    gjigsaw: {
      zh: {
        page_title: '拼图 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线拼图：3×3 与 4×4 两种难度，内置三幅手绘风画面，点两块交换位置就能拼回去，可随时看原图，自动记录最佳用时。无需注册登录，打开就能玩。',
        game_title: '拼图',
        tagline: '一块一块，把画面拼回原来的样子',
        share_line: '三幅画，慢慢拼。手指在动，脑子可以什么都不想。',

        board_aria: '拼图棋盘',
        level_group_aria: '选择难度',
        label_moves: '步数',
        label_time: '用时',
        label_best: '最佳',

        btn_preview: '👁 看原图',
        btn_new: '新游戏',
        btn_again: '再来一局',

        hint_controls: '点一块，再点另一块，两块就换位置。拼的时候可以随时看原图。',

        win_title: '拼好了',
        win_sub: '整幅画面回到原位，慢慢看一会儿。',

        confirm_new: '要重新拼一幅吗？当前进度会丢失。',

        scene_1: '晨雾山峦',
        scene_2: '夜里的海',
        scene_3: '窗台的午后',

        cell_pos: '第 {r} 行第 {c} 列',
        cell_selected: '已选中'
      },

      en: {
        page_title: 'Jigsaw, free to play | YSGame',
        page_desc: 'A quiet online jigsaw with 3×3 and 4×4 boards and three hand-drawn pictures. Tap two pieces to swap them, peek at the picture any time. Your best time is kept. No account needed.',
        game_title: 'Jigsaw',
        tagline: 'Piece by piece, until the picture comes back',
        share_line: 'Three little pictures, taken apart. Hands busy, mind quiet.',

        board_aria: 'Jigsaw board',
        level_group_aria: 'Choose a size',
        label_moves: 'Moves',
        label_time: 'Time',
        label_best: 'Best',

        btn_preview: '👁 Peek',
        btn_new: 'New game',
        btn_again: 'Play again',

        hint_controls: 'Tap one piece, then another, and they trade places. You can peek at the picture whenever you like.',

        win_title: 'All put together',
        win_sub: 'The whole picture is back. Stay with it a moment.',

        confirm_new: 'Start a new picture? This one will be lost.',

        scene_1: 'Morning mist',
        scene_2: 'Night sea',
        scene_3: 'Window seat',

        cell_pos: 'Row {r}, column {c}',
        cell_selected: 'selected'
      }
    },

    gmatch3: {
      zh: {
        page_title: '消消乐 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线消消乐：8×8 棋盘，点两颗相邻的糖果交换，三颗同色连成一线就会消掉，连锁消除有连击加分。30 步内拿到 1200 分即可过关，无需注册登录。',
        game_title: '消消乐',
        tagline: '三颗同色连成一线，看着它们一个个消失',
        share_line: '点两下，三颗同色就消掉。三十步，一个小目标。',

        board_aria: '消消乐棋盘',
        label_score: '分数',
        label_moves: '剩余步数',
        label_best: '最佳',
        goal_label: '本局目标',
        goal_unit: '分',

        btn_hint: '💡 提示',
        btn_new: '新游戏',
        btn_again: '再来一局',

        hint_controls: '点一颗，再点它上下左右相邻的一颗，两颗就交换。三颗同色连成一线就会消掉。',

        win_title: '过关了',
        win_sub: '这一局的分够了，可以再来一局。',
        over_title: '步数用完了',
        over_sub: '差一点就到目标了，再来一局试试。',

        combo: '连击 ×{n}',
        reshuffle: '没有可消的了，重排一下',

        confirm_new: '要重新开一局吗？这一局的进度会丢失。',

        cell_pos: '第 {r} 行第 {c} 列',
        cell_candy: '糖果',
        cell_empty: '空'
      },

      en: {
        page_title: 'Match three, free to play | YSGame',
        page_desc: 'A quiet match-three on an 8×8 board. Swap two neighbouring candies, line up three of a kind, and watch the cascade. Thirty moves to reach 1200 points. No account needed.',
        game_title: 'Match three',
        tagline: 'Three of a kind, and they disappear',
        share_line: 'Tap two candies, match three. Thirty moves, one small goal.',

        board_aria: 'Match three board',
        label_score: 'Score',
        label_moves: 'Moves left',
        label_best: 'Best',
        goal_label: 'Goal',
        goal_unit: 'pts',

        btn_hint: '💡 Hint',
        btn_new: 'New game',
        btn_again: 'Play again',

        hint_controls: 'Tap one candy, then a neighbour, and the two swap. Three in a row clears them.',

        win_title: 'Goal reached',
        win_sub: 'That is the target. Fancy another round?',
        over_title: 'Out of moves',
        over_sub: 'Just short of the goal. One more try?',

        combo: 'Combo ×{n}',
        reshuffle: 'Nothing left to match — reshuffling',

        confirm_new: 'Start a new board? This one will be lost.',

        cell_pos: 'Row {r}, column {c}',
        cell_candy: 'candy',
        cell_empty: 'empty'
      }
    },

    gsnake: {
      zh: {
        page_title: '贪吃蛇 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线贪吃蛇：17×17 棋盘，方向键、WASD 或滑动屏幕控制，吃到果子会越来越长、越来越快，撞墙或咬到自己就结束。自动记录最高分，无需注册登录。',
        game_title: '贪吃蛇',
        tagline: '一条线，一个方向，越吃越长',
        share_line: '小时候在诺基亚上偷偷玩的那个。十七乘十七，看你能长到多长。',

        board_aria: '贪吃蛇棋盘',
        pad_aria: '方向键',
        dir_up: '上',
        dir_down: '下',
        dir_left: '左',
        dir_right: '右',

        label_score: '得分',
        label_len: '长度',
        label_best: '最高',

        btn_pause: '暂停',
        btn_resume: '继续',
        btn_new: '新游戏',
        btn_again: '再来一局',
        btn_start: '开始',

        start_title: '准备好了就开始',
        start_sub: '按方向键，或在屏幕上滑一下',
        pause_title: '暂停中',
        pause_sub: '回来接着走，不用重新开始',

        over_title: '撞到了',
        over_sub: '这一局到这儿，再来一次会长一点。',

        hint_controls: '方向键或 WASD 控制，手机上滑动屏幕，也可以点下面的方向键。空格键暂停。',

        confirm_new: '要重新开一局吗？这一局会丢失。'
      },

      en: {
        page_title: 'Snake, free to play | YSGame',
        page_desc: 'The classic Snake on a 17×17 board. Arrow keys, WASD, or swipe to steer. Every bite makes you longer and a little faster. Your best score is kept. No account needed.',
        game_title: 'Snake',
        tagline: 'One line, one direction, longer with every bite',
        share_line: 'The one you played on a Nokia. Seventeen by seventeen, how long can you get?',

        board_aria: 'Snake board',
        pad_aria: 'Direction pad',
        dir_up: 'Up',
        dir_down: 'Down',
        dir_left: 'Left',
        dir_right: 'Right',

        label_score: 'Score',
        label_len: 'Length',
        label_best: 'Best',

        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_new: 'New game',
        btn_again: 'Play again',
        btn_start: 'Start',

        start_title: 'Ready when you are',
        start_sub: 'Use the arrow keys, or swipe on the board',
        pause_title: 'Paused',
        pause_sub: 'Pick up where you left off.',

        over_title: 'That was a wall',
        over_sub: 'This round ends here. The next one will be longer.',

        hint_controls: 'Arrow keys or WASD. On a phone, swipe on the board or use the pad below. Space pauses.',

        confirm_new: 'Start over? This round will be lost.'
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
