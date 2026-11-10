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
        page_desc: '免费在线 2048：简单 1024 / 中等 2048 / 困难 4096 三档目标，上下左右滑动合并相同的数字，支持撤销、最高分记录和断点续玩。无需注册登录，打开就能玩。',
        game_title: '2048',
        tagline: '上下左右，把相同的数字叠在一起',
        share_line: '滑两下就上手的 2048，看看你能叠到多少。',

        board_aria: '2048 棋盘',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单 1024',
        diff_medium: '中等 2048',
        diff_hard: '困难 4096',
        label_score: '得分',
        label_best: '最高',

        btn_new: '新游戏',
        btn_undo: '↶ 撤销',
        hint_keys: '用方向键或 WASD，手机上直接滑动',

        win_title: '拼到 {target} 了',
        win_sub: '可以接着往上叠，也可以重新开一局。',
        btn_continue: '继续玩',

        over_title: '这一局到此为止',
        over_sub: '格子满了，也没有能合并的数字了。',
        btn_again: '再来一局',

        confirm_new: '要重新开一局吗？这一局的进度会丢掉。',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。'
      },

      en: {
        page_title: '2048, free to play | YSGame',
        page_desc: 'A quiet 2048 with three goals: Easy 1024, Medium 2048, Hard 4096. Slide the tiles, merge the matching numbers, undo when you change your mind. Saves automatically, no account needed.',
        game_title: '2048',
        tagline: 'Slide the tiles, merge the matching numbers',
        share_line: '2048: swipe, merge, and see how far you get.',

        board_aria: '2048 board',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy 1024',
        diff_medium: 'Medium 2048',
        diff_hard: 'Hard 4096',
        label_score: 'Score',
        label_best: 'Best',

        btn_new: 'New game',
        btn_undo: '↶ Undo',
        hint_keys: 'Arrow keys or WASD. Swipe on a phone.',

        win_title: 'You reached {target}',
        win_sub: 'Keep going for 4096, or start a fresh board.',
        btn_continue: 'Keep playing',

        over_title: 'No moves left',
        over_sub: 'The board is full, and nothing matches any more.',
        btn_again: 'Play again',

        confirm_new: 'Start a new game? This board will be lost.',
        confirm_diff: 'Switching difficulty starts a fresh board. Your progress will be lost.'
      }
    },

    gmines: {
      zh: {
        page_title: '扫雷 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线扫雷：简单 9×9、中等 13×13、困难 16×16 三种棋盘，第一次点击永不踩雷，支持右键插旗、手机长按、计时与最佳成绩。无需注册登录，打开就能玩。',
        game_title: '扫雷',
        tagline: '翻开每一格，用数字推掉剩下的可能',
        share_line: '经典扫雷，第一次点击不会踩雷。',

        board_aria: '扫雷棋盘',
        level_group_aria: '选择难度',
        label_mines: '剩余雷数',
        label_time: '用时',
        label_best: '最佳',

        level_easy: '简单 9×9',
        level_medium: '中等 13×13',
        level_hard: '困难 16×16',

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
        page_desc: 'A quiet online Minesweeper with Easy 9×9, Medium 13×13 and Hard 16×16 boards. The first click never hits a mine, right-click or long-press to flag, and your best time is kept. No account needed.',
        game_title: 'Minesweeper',
        tagline: 'Turn over a square, let the numbers do the reasoning',
        share_line: 'Classic Minesweeper, and the first click never hits a mine.',

        board_aria: 'Minesweeper board',
        level_group_aria: 'Choose a board size',
        label_mines: 'Mines left',
        label_time: 'Time',
        label_best: 'Best',

        level_easy: 'Easy 9×9',
        level_medium: 'Medium 13×13',
        level_hard: 'Hard 16×16',

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
        page_desc: '免费在线拼图：简单 3×3、中等 4×4、困难 5×5 三档难度，内置三幅手绘风画面，点两块交换位置就能拼回去，可随时看原图，自动记录最佳用时。无需注册登录，打开就能玩。',
        game_title: '拼图',
        tagline: '一块一块，把画面拼回原来的样子',
        share_line: '三幅画，慢慢拼。手指在动，脑子可以什么都不想。',

        board_aria: '拼图棋盘',
        level_group_aria: '选择难度',
        size_easy: '简单 3×3',
        size_medium: '中等 4×4',
        size_hard: '困难 5×5',
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
        page_desc: 'A quiet online jigsaw with Easy 3×3, Medium 4×4 and Hard 5×5 boards and three hand-drawn pictures. Tap two pieces to swap them, peek at the picture any time. Your best time is kept. No account needed.',
        game_title: 'Jigsaw',
        tagline: 'Piece by piece, until the picture comes back',
        share_line: 'Three little pictures, taken apart. Hands busy, mind quiet.',

        board_aria: 'Jigsaw board',
        level_group_aria: 'Choose a difficulty',
        size_easy: 'Easy 3×3',
        size_medium: 'Medium 4×4',
        size_hard: 'Hard 5×5',
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
        page_desc: '免费在线消消乐：8×8 棋盘，点两颗相邻的糖果交换，三颗同色连成一线就会消掉，连锁消除有连击加分。简单 / 中等 / 困难三档，在有限步数内拿到目标分即可过关，无需注册登录。',
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
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',

        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        difficulty_group_aria: '选择难度',

        cell_pos: '第 {r} 行第 {c} 列',
        cell_candy: '糖果',
        cell_empty: '空'
      },

      en: {
        page_title: 'Match three, free to play | YSGame',
        page_desc: 'A quiet match-three on an 8×8 board. Swap two neighbouring candies, line up three of a kind, and watch the cascade. Pick Easy, Medium or Hard — reach the target score before you run out of moves. No account needed.',
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
        confirm_diff: 'Switching difficulty starts a fresh board. Your progress will be lost.',

        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        difficulty_group_aria: 'Choose a difficulty',

        cell_pos: 'Row {r}, column {c}',
        cell_candy: 'candy',
        cell_empty: 'empty'
      }
    },

    gsnake: {
      zh: {
        page_title: '贪吃蛇 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线贪吃蛇：简单 / 中等 / 困难三档速度，17×17 棋盘，方向键、WASD 或滑动屏幕控制，吃到果子会越来越长、越来越快，撞墙或咬到自己就结束。自动记录最高分，无需注册登录。',
        game_title: '贪吃蛇',
        tagline: '一条线，一个方向，越吃越长',
        share_line: '小时候在诺基亚上偷偷玩的那个。十七乘十七，看你能长到多长。',

        board_aria: '贪吃蛇棋盘',
        pad_aria: '方向键',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
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

        confirm_new: '要重新开一局吗？这一局会丢失。',
        confirm_diff: '切换难度会重新开始，当前这一局的成绩会丢掉。'
      },

      en: {
        page_title: 'Snake, free to play | YSGame',
        page_desc: 'The classic Snake on a 17×17 board with Easy, Medium and Hard speeds. Arrow keys, WASD, or swipe to steer. Every bite makes you longer and a little faster. Your best score is kept. No account needed.',
        game_title: 'Snake',
        tagline: 'One line, one direction, longer with every bite',
        share_line: 'The one you played on a Nokia. Seventeen by seventeen, how long can you get?',

        board_aria: 'Snake board',
        pad_aria: 'Direction pad',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
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

        confirm_new: 'Start over? This round will be lost.',
        confirm_diff: 'Switching difficulty restarts the game; your current score will be lost.'
      }
    },

    gsokoban: {
      zh: {
        page_title: '推箱子 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线推箱子：简单 / 中等 / 困难三档，每档 15 关，共 45 关，难度逐级上升。方向键、WASD 或手指滑动都能玩，推错了可以撤销一步，自动记录每关最少步数。无需注册登录，打开就能玩。',
        game_title: '推箱子',
        tagline: '把箱子推到点上，推不回来就撤销一步',
        share_line: '三档 45 关推箱子，慢慢想。推错了撤销一步，不用重开。',

        board_aria: '推箱子棋盘',
        level_group_aria: '选择关卡',
        difficulty_group_aria: '选择难度',
        tier_easy: '简单',
        tier_medium: '中等',
        tier_hard: '困难',
        level_n: '第 {n} 关',
        pad_aria: '方向键',
        dir_up: '上',
        dir_down: '下',
        dir_left: '左',
        dir_right: '右',

        label_moves: '步数',
        label_time: '用时',
        label_best: '本关最佳',

        btn_undo: '↶ 撤销一步',
        btn_restart: '重来这一关',
        btn_next: '下一关',
        btn_next_tier: '挑战下一难度',
        btn_first: '回到第一关',

        hint_controls: '方向键或 WASD 移动，推错了按撤销（U）。手机上滑一下，或按住下面的方向键。',

        win_title: '过关了',
        win_sub: '第 {n} 关的箱子都归位了。',
        win_tier_all: '本档十五关全清！',
        win_sub_tier_all: '这一档全通关了，试试更高难度吧。',
        win_title_all: '十五关都过了',
        win_sub_all: '十五关全清。慢慢来，反而更快。',

        deadlock: '这个箱子推进死角了，按撤销退回一步。',
        confirm_restart: '重来这一关？当前步数会清零。',
        confirm_diff: '切换难度会回到该难度的选关界面，当前这一关的进度会丢掉。'
      },

      en: {
        page_title: 'Sokoban, free to play | YSGame',
        page_desc: 'Sokoban with three tiers — Easy, Medium, Hard — fifteen levels each, forty-five in total, rising in difficulty. Arrow keys, WASD or swipe; undo whenever a push goes wrong. Your best move count is kept per level. No account needed.',
        game_title: 'Sokoban',
        tagline: 'Push every box onto a dot — undo if it goes wrong',
        share_line: 'Forty-five warehouse puzzles across three tiers. Take your time; undo is always there.',

        board_aria: 'Sokoban board',
        level_group_aria: 'Choose a level',
        difficulty_group_aria: 'Choose a difficulty',
        tier_easy: 'Easy',
        tier_medium: 'Medium',
        tier_hard: 'Hard',
        level_n: 'Level {n}',
        pad_aria: 'Direction pad',
        dir_up: 'Up',
        dir_down: 'Down',
        dir_left: 'Left',
        dir_right: 'Right',

        label_moves: 'Moves',
        label_time: 'Time',
        label_best: 'Best',

        btn_undo: '↶ Undo',
        btn_restart: 'Restart level',
        btn_next: 'Next level',
        btn_next_tier: 'Next difficulty',
        btn_first: 'Back to level 1',

        hint_controls: 'Arrow keys or WASD to move, U to undo. On a phone, swipe the board or hold the arrows below.',

        win_title: 'Cleared',
        win_sub: 'Every box is home on level {n}.',
        win_tier_all: 'This tier is complete!',
        win_sub_tier_all: 'All fifteen of this tier are done — try a harder one.',
        win_title_all: 'All fifteen cleared',
        win_sub_all: 'Fifteen levels, all solved. Slower is faster.',

        deadlock: 'That box is stuck in a corner — undo a step.',
        confirm_restart: 'Restart this level? Your moves so far will be lost.',
        confirm_diff: 'Switching difficulty returns you to that tier’s level picker; progress on this level will be lost.'
      }
    },

    gnpuzzle: {
      zh: {
        page_title: '数字华容道 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线数字华容道：简单 3×3、中等 4×4、困难 5×5 三档难度，点一下空格旁边的数字就能滑动，自动记录每档最少步数。无需注册登录，打开就能玩。',
        game_title: '数字华容道',
        tagline: '把数字按顺序排好，只留右下角一个空格',
        share_line: '3×3 到 5×5，点一下就滑。试试最少几步能拼回去。',

        board_aria: '数字华容道棋盘',
        size_group_aria: '选择难度',
        size_easy: '简单 3×3',
        size_medium: '中等 4×4',
        size_hard: '困难 5×5',

        label_moves: '步数',
        label_time: '用时',
        label_best: '最佳步数',

        btn_undo: '↶ 撤销一步',
        btn_shuffle: '重新打乱',
        btn_again: '再来一局',

        hint_controls: '点空格旁边的数字，它就滑过去。也可以在棋盘上滑动，或用方向键（方向 = 数字滑动的方向）。',

        win_title: '拼好了',
        win_title_record: '破纪录了',
        win_sub: '{size} · {moves} 步 · {time}'
      },

      en: {
        page_title: 'Number Slide, free to play | YSGame',
        page_desc: 'Free online number slide puzzle with Easy 3×3, Medium 4×4 and Hard 5×5 tiers. Tap a tile next to the gap to slide it in; your best move count is saved for each tier. No sign-up, no download.',
        game_title: 'Number Slide',
        tagline: 'Line the numbers up and leave one gap at the end',
        share_line: 'From 3x3 up to 5x5 — tap a tile and it slides. How few moves do you need?',

        board_aria: 'Number slide board',
        size_group_aria: 'Choose a difficulty',
        size_easy: 'Easy 3×3',
        size_medium: 'Medium 4×4',
        size_hard: 'Hard 5×5',

        label_moves: 'Moves',
        label_time: 'Time',
        label_best: 'Best moves',

        btn_undo: '↶ Undo',
        btn_shuffle: 'Shuffle again',
        btn_again: 'Play again',

        hint_controls: 'Tap a tile next to the gap and it slides in. You can also swipe the board or use the arrow keys.',

        win_title: 'Solved',
        win_title_record: 'New record',
        win_sub: '{size} · {moves} moves · {time}'
      }
    },

    /* 俄罗斯方块 [gyh 2026-11-08 新增] */
    gtetris: {
      zh: {
        page_title: '俄罗斯方块 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线俄罗斯方块：简单 / 中等 / 困难三档速度，七种方块、旋转墙踢、硬降与下一个预览，消行连消有加成。支持键盘与触屏，自动存档、断点续玩，无需注册登录。',
        game_title: '俄罗斯方块',
        tagline: '转一转，填满一行，让它安安静静消失',
        share_line: '七种方块，三档速度，看看这次能消掉多少行。',

        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开始本局，确定吗？',

        label_score: '分数',
        label_lines: '消行',
        label_level: '等级',
        label_best: '最高分',
        label_next: '下一个',
        board_aria: '俄罗斯方块棋盘',

        btn_start: '开始',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_restart: '重开一局',
        btn_again: '再来一局',
        btn_left: '左移',
        btn_right: '右移',
        btn_rotate: '旋转',
        btn_drop: '直接落下',

        hint_controls: '方向键左右移动，上键旋转，下键软降，空格直接落下。手机上用下面的按钮，也可以在棋盘上左右滑动。',
        paused_title: '暂停中',
        gameover_title: '堆到顶了',
        gameover_sub: '{score} 分 · 消了 {lines} 行 · 到第 {level} 级',
        win_title: '这一局结束',
        win_sub: '{score} 分',
        new_record: '新纪录'
      },

      en: {
        page_title: 'Tetris, free to play | YSGame',
        page_desc: 'A free online Tetris with Easy, Medium and Hard speeds. Seven tetrominoes, rotation with wall kicks, hard drop and a next-piece preview. Keyboard and touch, autosave, no account needed.',
        game_title: 'Tetris',
        tagline: 'Turn it, fill a row, and let it quietly disappear',
        share_line: 'Seven shapes, three speeds. How many lines can you clear this time?',

        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty restarts this round. Continue?',

        label_score: 'Score',
        label_lines: 'Lines',
        label_level: 'Level',
        label_best: 'Best',
        label_next: 'Next',
        board_aria: 'Tetris board',

        btn_start: 'Start',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_left: 'Left',
        btn_right: 'Right',
        btn_rotate: 'Rotate',
        btn_drop: 'Hard drop',

        hint_controls: 'Arrow keys to move and rotate, Down to soft drop, Space for a hard drop. On a phone use the buttons below, or swipe across the board.',
        paused_title: 'Paused',
        gameover_title: 'Stacked to the top',
        gameover_sub: '{score} points · {lines} lines · level {level}',
        win_title: 'Round over',
        win_sub: '{score} points',
        new_record: 'New record'
      }
    },

    /* 打砖块 [gyh 2026-11-08 新增] */
    gbreakout: {
      zh: {
        page_title: '打砖块 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线打砖块：一块挡板、一颗球，把砖一块块敲下来，还有加宽挡板、多球、慢速三种掉落道具。简单 / 中等 / 困难三档、多关卡、自动存档，支持鼠标键盘与触屏，无需注册登录。',
        game_title: '打砖块',
        tagline: '接住球，把上面那一整墙慢慢敲空',
        share_line: '一块挡板，一颗球，看你能撑到第几关。',

        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开始本局，确定吗？',

        label_score: '分数',
        label_lives: '生命',
        label_level: '关卡',
        label_best: '最高分',
        board_aria: '打砖块游戏区',

        btn_start: '开始',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_restart: '重开一局',
        btn_again: '再来一局',

        hint_controls: '移动鼠标或手指控制挡板，方向键 ←→ / A D 也行。空格发球或暂停，P 暂停。接住掉落的道具会帮上忙。',
        paused_title: '已暂停',
        gameover_title: '球掉了',
        gameover_sub: '{score} 分 · 打到第 {level} 关',
        level_clear_title: '这一关清空了',
        level_clear_sub: '第 {level} 关完成 · {score} 分',
        win_title: '全部通关',
        win_sub: '{score} 分 · 砖块一块不剩',
        new_record: '新纪录'
      },

      en: {
        page_title: 'Breakout, free to play | YSGame',
        page_desc: 'A free online Breakout: one paddle, one ball, a wall of bricks and three falling power-ups (wider paddle, multiball, slow ball). Easy, Medium and Hard tiers, several levels, autosave, mouse, keyboard and touch. No account needed.',
        game_title: 'Breakout',
        tagline: 'Keep the ball up and chip the whole wall away',
        share_line: 'One paddle, one ball. See how far you can get.',

        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty restarts this round. Continue?',

        label_score: 'Score',
        label_lives: 'Lives',
        label_level: 'Level',
        label_best: 'Best',
        board_aria: 'Breakout play area',

        btn_start: 'Start',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_restart: 'Restart',
        btn_again: 'Play again',

        hint_controls: 'Move the mouse or your finger to steer the paddle, or use the arrow keys / A and D. Space launches or pauses, P pauses. Catch falling power-ups for a hand.',
        paused_title: 'Paused',
        gameover_title: 'Ball lost',
        gameover_sub: '{score} points · reached level {level}',
        level_clear_title: 'Level cleared',
        level_clear_sub: 'Level {level} done · {score} points',
        win_title: 'All levels cleared',
        win_sub: '{score} points · not a brick left',
        new_record: 'New record'
      }
    },

    /* ---------------- 批次二：连连看 ----------------
       [gyh 2026-11-08 新增] */
    glinkup: {
      zh: {
        page_title: '连连看 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线连连看：同类配对，连线最多拐两个弯，还能绕棋盘外一圈。简单 / 中等 / 困难三档牌数与时间逐级收紧，有提示、洗牌、计时与得分，自动存档、断点续玩，无需注册登录。',
        game_title: '连连看',
        tagline: '把相同的两张连起来，中间最多拐两个弯',
        share_line: '找一找哪两张能连上，卡住了就用提示。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最高分', label_time: '剩余时间', label_moves: '步数',
        label_level: '关卡', label_lives: '生命', label_pairs: '已消对数', label_combo: '连击',
        label_hints: '提示', label_turn: '回合', label_matched: '已配对', label_remaining: '剩余',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_undo: '撤销', btn_pause: '暂停', btn_resume: '继续', btn_shuffle: '洗牌', btn_next: '下一关',
        board_aria: '连连看棋盘',
        hint_controls: '点两张相同的牌，中间的连线最多拐两个弯，也可以绕棋盘外一圈。提示和洗牌都有次数，时间用完这一局就结束了。',
        win_title: '全部消完了', win_sub: '用时 {time}，拿到 {score} 分。',
        lose_title: '时间到了', lose_sub: '还剩 {pairs} 对，拿到 {score} 分。',
        new_record: '破纪录了', paused_title: '暂停中',
        draw_title: '平局', draw_sub: '这一局打平了。',
        turn_you: '轮到你', turn_ai: '电脑思考中', thinking: '思考中'
      },
      en: {
        page_title: 'Link-up, free to play | YSGame',
        page_desc: 'A quiet online Link-up: match identical tiles with a path that turns at most twice, even around the outside of the board. Easy, Medium and Hard add tiles and cut the clock. Hints, shuffle, scoring and autosave, no account needed.',
        game_title: 'Link-up',
        tagline: 'Match two tiles with a path that turns at most twice',
        share_line: 'Spot the pair that connects. There is a hint if you get stuck.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time left', label_moves: 'Moves',
        label_level: 'Level', label_lives: 'Lives', label_pairs: 'Pairs', label_combo: 'Combo',
        label_hints: 'Hints', label_turn: 'Turn', label_matched: 'Matched', label_remaining: 'Left',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_undo: 'Undo', btn_pause: 'Pause', btn_resume: 'Resume', btn_shuffle: 'Shuffle', btn_next: 'Next',
        board_aria: 'Link-up board',
        hint_controls: 'Pick two identical tiles. The path between them may turn at most twice and can run around the outside of the board. Hints and shuffles are limited, and the round ends when the clock runs out.',
        win_title: 'Board cleared', win_sub: '{time} on the clock, {score} points.',
        lose_title: 'Time is up', lose_sub: '{pairs} pairs left, {score} points.',
        new_record: 'New record', paused_title: 'Paused',
        draw_title: 'Draw', draw_sub: 'This one ended level.',
        turn_you: 'Your turn', turn_ai: 'Computer thinking', thinking: 'Thinking'
      }
    },

    /* ---------------- 批次二：记忆翻牌 ----------------
       [gyh 2026-11-08 新增] */
    gmemory: {
      zh: {
        page_title: '记忆翻牌 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线记忆翻牌：翻开两张，记住位置，把一对对找回来。简单 / 中等 / 困难三档牌数递增、翻回更快，记步数与用时，自动存档、断点续玩，无需注册登录。',
        game_title: '记忆翻牌',
        tagline: '翻开两张，记住位置，把一对对找回来',
        share_line: '记性好不好，翻两张就知道。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_moves: '步数',
        label_level: '关卡', label_lives: '生命', label_pairs: '已配对', label_combo: '连击',
        label_hints: '提示', label_turn: '回合', label_matched: '已配对', label_remaining: '剩余',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_undo: '撤销', btn_pause: '暂停', btn_resume: '继续', btn_shuffle: '洗牌', btn_next: '下一关',
        board_aria: '记忆翻牌棋盘',
        hint_controls: '一次翻开两张，图案一样就配对成功，不一样会翻回去。步数越少越好；难度越高，牌越多、翻回得越快。',
        win_title: '全部找到了', win_sub: '{moves} 步，用时 {time}，拿到 {score} 分。',
        lose_title: '时间到了', lose_sub: '还剩 {pairs} 对没找到。',
        new_record: '破纪录了', paused_title: '暂停中',
        draw_title: '平局', draw_sub: '这一局打平了。',
        turn_you: '轮到你', turn_ai: '电脑思考中', thinking: '思考中'
      },
      en: {
        page_title: 'Memory match, free to play | YSGame',
        page_desc: 'A quiet online memory game: flip two cards, remember where they were, and find every pair. Easy, Medium and Hard add pairs and flip back faster. Move count, timer and autosave, no account needed.',
        game_title: 'Memory match',
        tagline: 'Flip two, remember where they were, find every pair',
        share_line: 'Two cards is all it takes to find out how good your memory is.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_moves: 'Moves',
        label_level: 'Level', label_lives: 'Lives', label_pairs: 'Pairs', label_combo: 'Combo',
        label_hints: 'Hints', label_turn: 'Turn', label_matched: 'Matched', label_remaining: 'Left',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_undo: 'Undo', btn_pause: 'Pause', btn_resume: 'Resume', btn_shuffle: 'Shuffle', btn_next: 'Next',
        board_aria: 'Memory match board',
        hint_controls: 'Flip two cards. A matching pair stays up; the rest turn back. Fewer moves is better. Higher levels add pairs and flip back sooner.',
        win_title: 'Every pair found', win_sub: '{moves} moves, {time}, {score} points.',
        lose_title: 'Time is up', lose_sub: '{pairs} pairs still hidden.',
        new_record: 'New record', paused_title: 'Paused',
        draw_title: 'Draw', draw_sub: 'This one ended level.',
        turn_you: 'Your turn', turn_ai: 'Computer thinking', thinking: 'Thinking'
      }
    },

    /* ---------------- 批次二：五子棋 ----------------
       [gyh 2026-11-08 新增] */
    ggomoku: {
      zh: {
        page_title: '五子棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线五子棋人机对弈：15×15 棋盘，你执黑先手，电脑执白。三档 AI 强度，能封堵活三与冲四，支持悔棋、提示与断点续玩，无需注册登录。',
        game_title: '五子棋',
        tagline: '十五路棋盘，和电脑轮流落子，先连成五子的一方赢',
        share_line: '来下一盘五子棋，电脑不会让着你。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_moves: '手数',
        label_level: '关卡', label_lives: '生命', label_pairs: '对数', label_combo: '连击',
        label_hints: '提示', label_turn: '回合', label_matched: '已配对', label_remaining: '剩余',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_undo: '悔棋', btn_pause: '暂停', btn_resume: '继续', btn_shuffle: '洗牌', btn_next: '下一关',
        board_aria: '五子棋棋盘',
        hint_controls: '点交叉点落子，横、竖、斜任意方向先连成五子就赢。悔棋一次撤回你和电脑各一手；提示会指一个好点，但次数有限。',
        win_title: '你赢了', win_sub: '{moves} 手连成五子，漂亮。',
        lose_title: '这局输了', lose_sub: '电脑先连成了五子，再来一局吧。',
        new_record: '破纪录了', paused_title: '暂停中',
        draw_title: '和棋', draw_sub: '棋盘满了，谁也没连成五子。',
        turn_you: '轮到你落子', turn_ai: '电脑思考中', thinking: '思考中'
      },
      en: {
        page_title: 'Gomoku, free to play | YSGame',
        page_desc: 'A quiet online Gomoku against the computer: a 15×15 board, you play black and move first. Three AI levels that block open threes and fours, plus undo, hints and autosave. No account needed.',
        game_title: 'Gomoku',
        tagline: 'A 15×15 board, take turns, five in a row wins',
        share_line: 'A game of Gomoku. The computer does not go easy on you.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_moves: 'Moves',
        label_level: 'Level', label_lives: 'Lives', label_pairs: 'Pairs', label_combo: 'Combo',
        label_hints: 'Hints', label_turn: 'Turn', label_matched: 'Matched', label_remaining: 'Left',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_undo: 'Undo', btn_pause: 'Pause', btn_resume: 'Resume', btn_shuffle: 'Shuffle', btn_next: 'Next',
        board_aria: 'Gomoku board',
        hint_controls: 'Click an intersection to place a stone. Five in a row horizontally, vertically or diagonally wins. Undo takes back your move and the computer reply; hints point out a good spot but are limited.',
        win_title: 'You win', win_sub: 'Five in a row in {moves} moves.',
        lose_title: 'You lost', lose_sub: 'The computer got five first. Another round?',
        new_record: 'New record', paused_title: 'Paused',
        draw_title: 'Draw', draw_sub: 'The board is full and nobody made five.',
        turn_you: 'Your move', turn_ai: 'Computer thinking', thinking: 'Thinking'
      }
    },

    /* ---------------- 批次二：经典马里奥（原创横版跳跃） ----------------
       美术与关卡均为原创几何像素，不含任何第三方品牌素材。
       [gyh 2026-11-08 新增] */
    gmario: {
      zh: {
        page_title: '经典马里奥 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线横版跳跃闯关：一路向右跑，跳过缺口、踩掉小怪、捡起金币，摸到旗杆就过关。三关逐级变难，简单 / 中等 / 困难三档，键盘与触屏都能玩，自动存档、断点续玩，无需注册登录。',
        game_title: '经典马里奥',
        tagline: '一路向右跑，跳过缺口，摸到旗杆就过关',
        share_line: '小时候那种一路往右跑的游戏，手机上也能玩。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最高分', label_time: '用时', label_moves: '步数',
        label_level: '关卡', label_lives: '生命', label_pairs: '金币', label_combo: '连击',
        label_hints: '提示', label_turn: '回合', label_matched: '已过关', label_remaining: '剩余',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_undo: '撤销', btn_pause: '暂停', btn_resume: '继续', btn_shuffle: '洗牌', btn_next: '下一关',
        board_aria: '横版跳跃游戏画面',
        hint_controls: '方向键或 A D 左右移动，空格 / ↑ / W 跳跃，P 暂停。从上方踩掉小怪，侧面碰到会掉一条命；掉进缺口也一样。手机用画面下方的三个按钮。',
        win_title: '全部通关了', win_sub: '三关全过，一共 {score} 分。',
        lose_title: '没命了', lose_sub: '走到第 {level} 关，拿到 {score} 分。',
        new_record: '破纪录了', paused_title: '暂停中',
        draw_title: '平局', draw_sub: '这一局打平了。',
        turn_you: '轮到你', turn_ai: '电脑思考中', thinking: '思考中'
      },
      en: {
        page_title: 'Classic platformer, free to play | YSGame',
        page_desc: 'A quiet online side-scrolling platformer: run right, clear the gaps, stomp the little creatures, collect coins and touch the flag to finish. Three levels, Easy / Medium / Hard, keyboard and touch, autosave, no account needed.',
        game_title: 'Classic platformer',
        tagline: 'Run right, clear the gaps, touch the flag to finish',
        share_line: 'The old run-and-jump kind of game, playable on a phone too.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_moves: 'Moves',
        label_level: 'Level', label_lives: 'Lives', label_pairs: 'Coins', label_combo: 'Combo',
        label_hints: 'Hints', label_turn: 'Turn', label_matched: 'Cleared', label_remaining: 'Left',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_undo: 'Undo', btn_pause: 'Pause', btn_resume: 'Resume', btn_shuffle: 'Shuffle', btn_next: 'Next',
        board_aria: 'Platformer playfield',
        hint_controls: 'Arrow keys or A / D to move, Space / Up / W to jump, P to pause. Stomp a creature from above; touching one from the side, or falling into a gap, costs a life. On a phone use the three buttons below the screen.',
        win_title: 'All levels cleared', win_sub: 'Three levels done, {score} points.',
        lose_title: 'Out of lives', lose_sub: 'Reached level {level}, {score} points.',
        new_record: 'New record', paused_title: 'Paused',
        draw_title: 'Draw', draw_sub: 'This one ended level.',
        turn_you: 'Your turn', turn_ai: 'Computer thinking', thinking: 'Thinking'
      }
    },

    /* ---------------- 批次三：迷宫 / 坦克大战 / 星际飞机大战 / 炸弹人 ----------------
       [gyh 2026-11-08 新增] */

    gmaze: {
      zh: {
        page_title: '迷宫 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线迷宫：随机生成、三档尺寸逐档变大，岔路越来越多。最短路径高亮提示，记步数与用时，简单 / 中等 / 困难三档逐级变难，自动存档、断点续玩，无需注册登录。',
        game_title: '迷宫',
        tagline: '在随机生成的迷宫里找到出口',
        share_line: '看着简单、走起来绕的迷宫，手机上就能玩。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '步数', label_wave: '波次', label_enemies: '敌人', label_power: '火力',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一关',
        board_aria: '迷宫游戏画面',
        hint_controls: '方向键 / WASD 或手指滑动控制小球移动，从起点走到出口即过关。卡住了点「提示」会高亮一段最短路径。难度越高，迷宫越大、岔路越多。',
        win_title: '走出迷宫', win_sub: '第 {level} 关，{steps} 步，用时 {time}，{score} 分。',
        lose_title: '时间到了', lose_sub: '还没走到出口，再试一次吧。',
        new_record: '破纪录了', paused_title: '暂停中'
      },
      en: {
        page_title: 'Maze, free to play | YSGame',
        page_desc: 'A quiet online maze: procedurally generated, three sizes that grow each tier with more branches. Highlight the shortest path when stuck, track steps and time, Easy / Medium / Hard, autosave, no account needed.',
        game_title: 'Maze',
        tagline: 'Find your way out of a random maze',
        share_line: 'Looks easy, gets twisty — playable on a phone.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Level',
        label_lives: 'Lives', label_steps: 'Steps', label_wave: 'Waves', label_enemies: 'Enemies', label_power: 'Power',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next',
        board_aria: 'Maze playfield',
        hint_controls: 'Arrow keys / WASD or swipe to move the dot. Reach the exit to clear the level. Tap Hint to highlight a stretch of the shortest path. Higher tiers mean bigger mazes with more turns.',
        win_title: 'Maze cleared', win_sub: 'Level {level}, {steps} steps, {time}, {score} points.',
        lose_title: 'Time is up', lose_sub: 'You did not reach the exit. Try again.',
        new_record: 'New record', paused_title: 'Paused'
      }
    },

    gtank: {
      zh: {
        page_title: '坦克大战 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线坦克大战：四方向移动射击，砖墙可炸开，守住底部的基地，一波波敌坦冲过来。三档难度敌坦更快更密，自动存档、断点续玩，无需注册登录。',
        game_title: '坦克大战',
        tagline: '守住基地，把冲过来的敌坦都打掉',
        share_line: '小时候守基地打坦克的那个玩法，手机上也能玩。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '步数', label_wave: '波次', label_enemies: '敌坦', label_power: '火力',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一关',
        board_aria: '坦克大战游戏画面',
        hint_controls: '方向键 / WASD 移动，J 或空格开炮，P 暂停。砖墙能挡子弹也能被自己炸开，钢墙炸不动。别让敌坦碰到你的基地（底部的鹰）。手机用画面下方的方向盘和开炮键。',
        win_title: '清光了这一波', win_sub: '第 {level} 关，挡下 {wave} 波，{score} 分。',
        lose_title: '基地失守', lose_sub: '坚持到第 {level} 关，{score} 分。',
        new_record: '破纪录了', paused_title: '暂停中'
      },
      en: {
        page_title: 'Battle Tank, free to play | YSGame',
        page_desc: 'A free online tank battle: drive in four directions and shoot, brick walls break open, defend the base at the bottom while waves of enemy tanks roll in. Three tiers make enemies faster and denser, autosave, no account needed.',
        game_title: 'Battle Tank',
        tagline: 'Defend the base, take out every enemy tank',
        share_line: 'The old defend-the-base tank game, now on a phone.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Level',
        label_lives: 'Lives', label_steps: 'Steps', label_wave: 'Waves', label_enemies: 'Tanks', label_power: 'Power',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next',
        board_aria: 'Tank battle playfield',
        hint_controls: 'Arrow keys / WASD to move, J or Space to fire, P to pause. Brick walls block and can be blown open by your own shells; steel walls hold. Keep enemies off your base (the eagle at the bottom). On a phone use the on-screen d-pad and fire button.',
        win_title: 'Wave cleared', win_sub: 'Level {level}, {wave} waves held, {score} points.',
        lose_title: 'Base lost', lose_sub: 'Reached level {level}, {score} points.',
        new_record: 'New record', paused_title: 'Paused'
      }
    },

    gplane: {
      zh: {
        page_title: '星际飞机大战 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线飞机大战：纵向弹幕，敌机编队俯冲，吃道具升级火力、护盾或召唤僚机。三档难度弹幕更密、敌机更快，自动存档、断点续玩，无需注册登录。',
        game_title: '星际飞机大战',
        tagline: '驾着小飞机，把一波波敌机打下去',
        share_line: '竖屏打飞机，躲弹幕、吃道具，手机上也能爽。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '步数', label_wave: '波次', label_enemies: '敌机', label_power: '火力',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一关',
        board_aria: '飞机大战游戏画面',
        hint_controls: '移动鼠标或手指控制飞机，自动开火。躲开敌机和子弹，吃掉掉落的 P（火力）/ S（护盾）/ W（僚机）道具。难度越高，弹幕越密、敌机越凶。',
        win_title: '这一波清场了', win_sub: '第 {wave} 波，{score} 分。',
        lose_title: '被击落了', lose_sub: '打到第 {wave} 波，{score} 分。',
        new_record: '破纪录了', paused_title: '暂停中'
      },
      en: {
        page_title: 'Star Fighter, free to play | YSGame',
        page_desc: 'A free online shoot-em-up: vertical bullet curtain, enemy squadrons dive in, grab power-ups to upgrade firepower, shield or call a wingman. Three tiers pack denser fire and faster foes, autosave, no account needed.',
        game_title: 'Star Fighter',
        tagline: 'Pilot the little ship and shoot down wave after wave',
        share_line: 'A vertical shmup: dodge bullets, grab power-ups, on a phone too.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Level',
        label_lives: 'Lives', label_steps: 'Steps', label_wave: 'Wave', label_enemies: 'Ships', label_power: 'Power',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next',
        board_aria: 'Shoot-em-up playfield',
        hint_controls: 'Move the mouse or finger to steer; the ship fires on its own. Dodge enemies and bullets, and pick up falling P (firepower) / S (shield) / W (wingman) items. Higher tiers mean denser fire and fiercer enemies.',
        win_title: 'Wave cleared', win_sub: 'Wave {wave}, {score} points.',
        lose_title: 'Shot down', lose_sub: 'Reached wave {wave}, {score} points.',
        new_record: 'New record', paused_title: 'Paused'
      }
    },

    gbomber: {
      zh: {
        page_title: '炸弹人 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线炸弹人：放炸弹、十字爆炸、炸开软墙找出口，小心别被自己的炸弹炸到。三档难度敌人更多更聪明，自动存档、断点续玩，无需注册登录。',
        game_title: '炸弹人',
        tagline: '放炸弹清出一条路，找到隐藏的出口',
        share_line: '放炸弹、躲爆炸，经典玩法手机上也能玩。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '步数', label_wave: '波次', label_enemies: '敌人', label_power: '火力',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一关',
        board_aria: '炸弹人游戏画面',
        hint_controls: '方向键 / WASD 移动，空格或 J 放炸弹，P 暂停。炸弹会十字爆炸、能炸开软墙（棕色），钢墙炸不动；爆炸会引爆其他炸弹形成连锁。放完炸弹赶紧跑开，别困在自己炸出的火里。找到隐藏的出口即可过关。手机用画面下方的方向键和炸弹键。',
        win_title: '找到出口了', win_sub: '第 {level} 关，{score} 分。',
        lose_title: '被炸到了', lose_sub: '打到第 {level} 关，{score} 分。',
        new_record: '破纪录了', paused_title: '暂停中'
      },
      en: {
        page_title: 'Bomber, free to play | YSGame',
        page_desc: 'A free online Bomber: drop bombs, cross-shaped blast, blow open soft walls to find the exit — but do not get caught in your own blast. Three tiers add more and smarter enemies, autosave, no account needed.',
        game_title: 'Bomber',
        tagline: 'Drop bombs to clear a path and find the hidden exit',
        share_line: 'Drop bombs, dodge the blast — classic, on a phone too.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Level',
        label_lives: 'Lives', label_steps: 'Steps', label_wave: 'Waves', label_enemies: 'Enemies', label_power: 'Power',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next',
        board_aria: 'Bomber playfield',
        hint_controls: 'Arrow keys / WASD to move, Space or J to drop a bomb, P to pause. Bombs blast in a cross and open soft (brown) walls; steel walls hold. A blast can chain-detonate other bombs. After dropping, run clear — do not get trapped in your own fire. Find the hidden exit to clear the level. On a phone use the on-screen d-pad and bomb button.',
        win_title: 'Exit found', win_sub: 'Level {level}, {score} points.',
        lose_title: 'Caught in the blast', lose_sub: 'Reached level {level}, {score} points.',
        new_record: 'New record', paused_title: 'Paused'
      }
    },

    /* [gyh 2026-11-09 新增] 批次四：数字连线 / 飞扬小鸟 / 恐龙跳跳 / 黑白棋 */
    gnumberlink: {
      zh: {
        page_title: '数字连线 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线数字连线：把相同数字的两个端点用线连起来，线不能交叉、盘面不能留空格。三档网格逐步变大，提示、撤销、自动存档，无需注册登录。',
        game_title: '数字连线',
        tagline: '把同号两端连起来，一格都不能空着',
        share_line: '线不能交叉，还得铺满整盘，安静又烧脑。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '步数', label_wave: '波次', label_enemies: '障碍', label_power: '火力',
        label_pairs: '连线', label_moves: '操作',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一关', btn_undo: '撤销', btn_clear: '清空',
        board_aria: '数字连线棋盘',
        hint_controls: '从一个数字端点按住拖到同号端点即可连线，线经过的格子会被占住；两条线不能交叉，也不能盖住端点。所有数字都连通、且盘面没有空格才算过关。右键或长按可以擦掉一条线，手机直接手指拖动。',
        win_title: '全部连通', win_sub: '第 {level} 关，{score} 分，用了 {steps} 步。',
        lose_title: '这局卡住了', lose_sub: '第 {level} 关，{score} 分。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '这一格已经被别的线占住了。',
        msg_invalid: '线不能交叉，换个走法试试。'
      },
      en: {
        page_title: 'Number Link, free to play | YSGame',
        page_desc: 'A free online Number Link puzzle: connect matching numbered endpoints without crossing lines or leaving empty squares. Three grid sizes, hints, undo and autosave. No account needed.',
        game_title: 'Number Link',
        tagline: 'Join matching numbers, and leave no square behind',
        share_line: 'No crossings, no empty squares — quiet and quietly tricky.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Level',
        label_lives: 'Lives', label_steps: 'Steps', label_wave: 'Wave', label_enemies: 'Blocks', label_power: 'Power',
        label_pairs: 'Links', label_moves: 'Moves',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Number Link board',
        hint_controls: 'Drag from one numbered endpoint to its match to draw a line; every square the line passes through becomes occupied. Lines may not cross or cover an endpoint. Clear the level by connecting every pair AND filling the whole board. Right-click or long-press a line to erase it; on a phone just drag with your finger.',
        win_title: 'All connected', win_sub: 'Level {level}, {score} points in {steps} steps.',
        lose_title: 'Stuck here', lose_sub: 'Level {level}, {score} points.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'That square is already taken by another line.',
        msg_invalid: 'Lines cannot cross. Try another route.'
      }
    },

    gskybird: {
      zh: {
        page_title: '飞扬小鸟 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线飞扬小鸟：单键控制上升，穿过管道之间的缝隙，飞得越远速度越快。三档难度、最高分记录、自动存档，无需注册登录。',
        game_title: '飞扬小鸟',
        tagline: '点一下抬一抬翅膀，别撞上管子',
        share_line: '一下一下点着飞，看看能过几根管子。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '关卡',
        label_lives: '生命', label_steps: '距离', label_wave: '管道', label_enemies: '障碍', label_power: '火力',
        label_pairs: '连过', label_moves: '拍翅',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '继续飞', btn_undo: '撤销', btn_clear: '清空',
        board_aria: '小鸟飞行画面',
        hint_controls: '点一下屏幕 / 空格 / ↑ 让小鸟上升，松手就会往下坠；从上下管道之间的缝隙穿过去，碰到管子或地面这局就结束。每穿过一组管道得 1 分，飞得越远速度越快、缝隙越窄。手机上点屏幕任意位置即可。',
        win_title: '飞得漂亮', win_sub: '穿过了 {score} 组管道，第 {level} 段。',
        lose_title: '撞到了', lose_sub: '穿过了 {score} 组管道，最佳 {level} 组。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '这局已经结束，再来一局吧。',
        msg_invalid: '还没起飞呢，先点开始。'
      },
      en: {
        page_title: 'Sky Bird, free to play | YSGame',
        page_desc: 'A free online one-button flying game: tap to rise, slip through the gaps between pipes, and survive as the pace picks up. Three difficulty tiers, best-score tracking and autosave. No account needed.',
        game_title: 'Sky Bird',
        tagline: 'One tap for a flap, and mind the pipes',
        share_line: 'Tap, tap, tap — how many pipes can you clear?',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Stage',
        label_lives: 'Lives', label_steps: 'Distance', label_wave: 'Pipes', label_enemies: 'Obstacles', label_power: 'Power',
        label_pairs: 'Streak', label_moves: 'Flaps',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Keep flying', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Sky Bird playfield',
        hint_controls: 'Tap anywhere, or press Space / Up to flap upward; let go and the bird sinks. Slip through the gap between pipes — touching a pipe or the ground ends the run. Each pipe cleared scores 1, and the further you go the faster and tighter it gets. On a phone just tap the screen.',
        win_title: 'Nice flying', win_sub: 'Cleared {score} pipes, stage {level}.',
        lose_title: 'Crashed', lose_sub: 'Cleared {score} pipes, best {level}.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'This run is over. Start another one.',
        msg_invalid: 'Not flying yet — press start first.'
      }
    },

    gdino: {
      zh: {
        page_title: '恐龙跳跳 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线恐龙跳跳：单键起跳躲开仙人掌与飞鸟，速度一路爬升，白天与夜晚交替。三档难度、最高分记录、自动存档，无需注册登录。',
        game_title: '恐龙跳跳',
        tagline: '一路往前跑，看见障碍就跳',
        share_line: '一跳一跳往前跑，越跑越快的那种。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '路段',
        label_lives: '生命', label_steps: '距离', label_wave: '波次', label_enemies: '障碍', label_power: '火力',
        label_pairs: '连跳', label_moves: '跳跃',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '继续跑', btn_undo: '撤销', btn_clear: '清空',
        board_aria: '恐龙奔跑画面',
        hint_controls: '空格 / ↑ / 点屏幕起跳，按住可以跳得更高；躲开地上的仙人掌和低空飞鸟，撞上就结束。跑得越远分数越高，速度也一路爬升，还会从白天跑到夜晚。手机上点屏幕任意位置。',
        win_title: '跑得漂亮', win_sub: '跑了 {score} 米，第 {level} 段。',
        lose_title: '撞上了', lose_sub: '跑了 {score} 米，最佳 {level} 米。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '这局已经结束，再来一局吧。',
        msg_invalid: '还没起跑呢，先点开始。'
      },
      en: {
        page_title: 'Dino Dash, free to play | YSGame',
        page_desc: 'A free online one-button runner: jump over cacti and low-flying birds as the pace climbs and day turns to night. Three difficulty tiers, best-score tracking and autosave. No account needed.',
        game_title: 'Dino Dash',
        tagline: 'Keep running, jump when something shows up',
        share_line: 'Hop, hop, hop — and it only gets faster.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Stage',
        label_lives: 'Lives', label_steps: 'Distance', label_wave: 'Wave', label_enemies: 'Obstacles', label_power: 'Power',
        label_pairs: 'Streak', label_moves: 'Jumps',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Keep running', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Dino Dash playfield',
        hint_controls: 'Press Space / Up or tap the screen to jump; hold for a higher hop. Dodge ground cacti and low-flying birds — one hit ends the run. The further you go the higher the score and the faster the pace, and day fades into night. On a phone just tap anywhere.',
        win_title: 'Great run', win_sub: 'Ran {score} metres, stage {level}.',
        lose_title: 'Crashed', lose_sub: 'Ran {score} metres, best {level} metres.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'This run is over. Start another one.',
        msg_invalid: 'Not running yet — press start first.'
      }
    },

    greversi: {
      zh: {
        page_title: '黑白棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线黑白棋：8×8 棋盘，落子翻转对方棋子，合法落点有提示，三档 AI 强度，悔棋与自动存档，无需注册登录。',
        game_title: '黑白棋',
        tagline: '落一子，翻一片，最后看谁占得多',
        share_line: '八个方向都能翻子，一不留神四个角就没了。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '黑子', label_best: '最佳', label_time: '用时', label_level: '回合',
        label_lives: '白子', label_steps: '步数', label_wave: '波次', label_enemies: '对手', label_power: '火力',
        label_pairs: '棋子', label_moves: '落子',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一局', btn_undo: '悔棋', btn_clear: '清空',
        board_aria: '黑白棋棋盘',
        hint_controls: '你执黑先手。落子后，把夹在你两颗黑子之间的对方白子全部翻成黑色；只能下在能翻子的格子，没地方下就自动跳过。棋盘下满或双方都无子可下时，棋子多的一方获胜。高亮的格子是合法落点，手机直接点格子。',
        win_title: '这一局你赢了', win_sub: '你 {score} 子，对手 {level} 子。',
        lose_title: '这局没赢下来', lose_sub: '你 {score} 子，对手 {level} 子。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '这一方没有合法落点，自动跳过。',
        msg_invalid: '这里不能落子，选一个高亮的格子。'
      },
      en: {
        page_title: 'Reversi, free to play | YSGame',
        page_desc: 'A free online Reversi game on an 8x8 board: flip your opponent\'s discs, see every legal move, pick from three AI levels, undo and autosave. No account needed.',
        game_title: 'Reversi',
        tagline: 'Place one disc, flip a whole line, and count them at the end',
        share_line: 'Eight directions to flip — look away and the corners are gone.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Black', label_best: 'Best', label_time: 'Time', label_level: 'Turn',
        label_lives: 'White', label_steps: 'Moves', label_wave: 'Wave', label_enemies: 'Rival', label_power: 'Power',
        label_pairs: 'Discs', label_moves: 'Placed',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next game', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Reversi board',
        hint_controls: 'You play black and move first. A move flips every opponent disc sandwiched between your new disc and another black disc; you may only play on a square that flips something, and with no legal move your turn is skipped. When the board fills or neither side can move, the side with more discs wins. Highlighted squares are legal moves; on a phone just tap a square.',
        win_title: 'You won this one', win_sub: 'You {score}, your rival {level}.',
        lose_title: 'Not this time', lose_sub: 'You {score}, your rival {level}.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side — turn skipped.',
        msg_invalid: 'You cannot play there. Pick a highlighted square.'
      }
    },

    /* [gyh 2026-11-09 新增] 批次五：跳一跳 / 魔方 / 台球 / 中国象棋 */
    ghop: {
      zh: {
        page_title: '跳一跳 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线跳一跳：按住蓄力、松手起跳，稳稳落在下一块方块上，连击有加成，三档难度、伪 3D 画面、自动存档，无需注册登录。',
        game_title: '跳一跳',
        tagline: '按住蓄力，松手一跳，稳稳落在下一块上',
        share_line: '就差那么一点点踩空，手心都在出汗。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '高度',
        label_lives: '机会', label_steps: '跳跃', label_wave: '平台', label_enemies: '障碍', label_power: '蓄力',
        label_pairs: '方块', label_moves: '落点', label_combo: '连击',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一局', btn_undo: '悔棋', btn_clear: '清空',
        board_aria: '跳一跳游戏画面',
        hint_controls: '按住鼠标、触屏或空格键蓄力，松开起跳；蓄力越久跳得越远。落在方块上得分，正中中心算完美落点，连续完美可以叠连击加分；踩空就结束。手机直接按住画面任意位置即可。',
        win_title: '这一跳漂亮', win_sub: '本次 {score} 分，最长 {level} 连击。',
        lose_title: '掉下去了', lose_sub: '拿到 {score} 分，再来一次。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '前面没有可落脚的方块了。',
        msg_invalid: '这里落不了脚。',
        msg_perfect: '完美落点！', msg_combo: '{score} 连击', msg_miss: '踩空了',
        msg_charge: '按住蓄力，松手起跳'
      },
      en: {
        page_title: 'Stack Jump, free to play | YSGame',
        page_desc: 'A free online stacking jump game: hold to charge, release to leap, land on the next block for points, chain perfect landings for a combo bonus, three difficulty levels and autosave. No account needed.',
        game_title: 'Stack Jump',
        tagline: 'Hold to charge, release to leap, and stick the landing',
        share_line: 'Missed it by a hair — my palms were sweating.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Height',
        label_lives: 'Chances', label_steps: 'Jumps', label_wave: 'Blocks', label_enemies: 'Hazards', label_power: 'Charge',
        label_pairs: 'Blocks', label_moves: 'Landings', label_combo: 'Combo',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next game', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Stack Jump game board',
        hint_controls: 'Hold the mouse, the screen or the space bar to charge; release to jump. The longer you hold, the farther you fly. Landing on a block scores, hitting dead centre is a perfect landing, and consecutive perfect landings build a combo. Miss the block and the run ends. On a phone, just press and hold anywhere on the board.',
        win_title: 'What a jump', win_sub: '{score} points, best streak {level}.',
        lose_title: 'Off the edge', lose_sub: 'You scored {score}. One more try?',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'No block left to land on.',
        msg_invalid: 'Nothing to land on there.',
        msg_perfect: 'Perfect landing!', msg_combo: '{score} combo', msg_miss: 'Missed it',
        msg_charge: 'Hold to charge, release to jump'
      }
    },

    gcube: {
      zh: {
        page_title: '魔方 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线魔方：2×2 与 3×3 两种阶数，三维转层动画，一键打乱与复原，步数计时，三档难度，自动存档，无需注册登录。',
        game_title: '魔方',
        tagline: '转一层、看三面，把颜色一块块送回家',
        share_line: '明明只差一个角，又转乱了。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新打乱一局，当前进度会丢掉。',
        label_score: '进度', label_best: '最佳', label_time: '用时', label_level: '阶数',
        label_lives: '提示次数', label_steps: '步数', label_wave: '打乱', label_enemies: '错块', label_power: '转速',
        label_pairs: '色块', label_moves: '转层', label_size: '阶数',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一局', btn_undo: '撤销', btn_clear: '清空',
        btn_scramble: '打乱', btn_reset: '复原',
        board_aria: '魔方三维视图',
        hint_controls: '点住画面拖动可以转动视角，点右侧的层按钮转动对应的一层，按住 Shift 再点就是反向转；键盘用 U / D / L / R / F / B 转层，Shift 反向，P 暂停。把六个面的颜色各归一面即还原成功。',
        win_title: '还原完成', win_sub: '用了 {score} 步，耗时 {level} 秒。',
        lose_title: '这局没还原', lose_sub: '共转了 {score} 步，再试一次。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '没有可以撤销的转层了。',
        msg_invalid: '这一层现在转不了。',
        msg_scrambled: '已打乱，开始还原吧', msg_solved: '六面归位！',
        msg_turn: '转动了一层'
      },
      en: {
        page_title: 'Puzzle Cube, free to play | YSGame',
        page_desc: 'A free online cube puzzle: 2x2 and 3x3 sizes, animated 3D layer turns, one-tap scramble and reset, move count and timer, three difficulty levels and autosave. No account needed.',
        game_title: 'Puzzle Cube',
        tagline: 'Turn a layer, check three faces, and walk every colour home',
        share_line: 'One corner left, and somehow it is scrambled again.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh scramble. Your progress will be lost.',
        label_score: 'Progress', label_best: 'Best', label_time: 'Time', label_level: 'Size',
        label_lives: 'Hints', label_steps: 'Moves', label_wave: 'Scramble', label_enemies: 'Misplaced', label_power: 'Speed',
        label_pairs: 'Tiles', label_moves: 'Turns', label_size: 'Size',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next cube', btn_undo: 'Undo', btn_clear: 'Clear',
        btn_scramble: 'Scramble', btn_reset: 'Reset',
        board_aria: '3D puzzle cube view',
        hint_controls: 'Drag the board to rotate the view. Use the layer buttons on the right to turn a layer, or hold Shift to turn it the other way. On a keyboard, U / D / L / R / F / B turn layers, Shift reverses, and P pauses. Solve it by getting one colour onto each of the six faces.',
        win_title: 'Solved', win_sub: '{score} moves in {level} seconds.',
        lose_title: 'Not solved this time', lose_sub: '{score} turns made. Give it another go.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'No turn left to undo.',
        msg_invalid: 'That layer cannot turn right now.',
        msg_scrambled: 'Scrambled — go solve it', msg_solved: 'All six faces done!',
        msg_turn: 'One layer turned'
      }
    },

    gbilliards: {
      zh: {
        page_title: '台球 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线台球：拖杆瞄准、拉远加力，真实 2D 球体碰撞与落袋判定，瞄准辅助线，三档难度，自动存档，无需注册登录。',
        game_title: '台球',
        tagline: '拖杆、瞄准、收力，看白球把场面打开',
        share_line: '这一杆想得太简单了，白球自己进了袋。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新摆一局，当前进度会丢掉。',
        label_score: '得分', label_best: '最佳', label_time: '用时', label_level: '局数',
        label_lives: '剩余球', label_steps: '击球', label_wave: '回合', label_enemies: '障碍', label_power: '力度',
        label_pairs: '球数', label_moves: '杆数', label_balls: '台面球', label_force: '力度',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一局', btn_undo: '悔棋', btn_clear: '清空',
        board_aria: '台球桌面',
        hint_controls: '在球桌上按住并朝反方向拖动来瞄准和蓄力，松开击球；拖得越远力量越大。虚线是白球第一下会撞到哪里。把目标球打进六个袋口得分，白球落袋要罚分。手机直接用手指拖。',
        win_title: '清台了', win_sub: '拿下 {score} 分，共出杆 {level} 次。',
        lose_title: '这局没收干净', lose_sub: '得到 {score} 分，再来一局。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '球都停稳了才能出下一杆。',
        msg_invalid: '白球还没摆好，稍等一下。',
        msg_foul: '白球落袋，罚一分', msg_potted: '进袋！',
        msg_aim: '拖动瞄准，拉远加力'
      },
      en: {
        page_title: 'Billiards, free to play | YSGame',
        page_desc: 'A free online billiards game: drag to aim and pull back for power, proper 2D ball collisions and pocket detection, an aiming guide, three difficulty levels and autosave. No account needed.',
        game_title: 'Billiards',
        tagline: 'Line it up, pull back, and let the cue ball open the table',
        share_line: 'Made that shot look far too easy — and potted the cue ball.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty re-racks the table. Your progress will be lost.',
        label_score: 'Score', label_best: 'Best', label_time: 'Time', label_level: 'Rack',
        label_lives: 'Balls left', label_steps: 'Shots', label_wave: 'Turn', label_enemies: 'Obstacles', label_power: 'Power',
        label_pairs: 'Balls', label_moves: 'Shots', label_balls: 'On table', label_force: 'Force',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next rack', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Billiards table',
        hint_controls: 'Press on the table and drag away from the shot line to aim, then release to strike; the farther you pull, the harder the shot. The dashed line shows where the cue ball makes first contact. Pot the object balls into any of the six pockets to score, and mind the cue ball — potting it costs a point. On a phone, just drag with a finger.',
        win_title: 'Table cleared', win_sub: '{score} points from {level} shots.',
        lose_title: 'Left a few on the table', lose_sub: '{score} points. Rack them up again.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'Wait for the balls to settle before the next shot.',
        msg_invalid: 'The cue ball is not placed yet.',
        msg_foul: 'Cue ball potted — one point off', msg_potted: 'Potted!',
        msg_aim: 'Drag to aim, pull back for power'
      }
    },

    gxiangqi: {
      zh: {
        page_title: '中国象棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线中国象棋：完整走子规则、将军与将死判定、蹩马腿与塞象眼、悔棋提示、三档棋力 AI，自动存档，无需注册登录。',
        game_title: '中国象棋',
        tagline: '楚河汉界摆开，一步一子都算数',
        share_line: '光顾着吃车，回头一看老将没了。',
        difficulty_group_aria: '选择难度',
        diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '回合', label_best: '胜场', label_time: '用时', label_level: '回合',
        label_lives: '剩余子', label_steps: '步数', label_wave: '轮次', label_enemies: '对手', label_power: '攻势',
        label_pairs: '棋子', label_moves: '走子', label_side: '执子',
        btn_start: '开始', btn_restart: '重开', btn_again: '再来一局', btn_hint: '提示',
        btn_pause: '暂停', btn_resume: '继续', btn_next: '下一局', btn_undo: '悔棋', btn_clear: '清空',
        board_aria: '中国象棋棋盘',
        hint_controls: '你执红先走。点选自己的棋子，再点高亮的落点走子；车走直线、马走日且会被蹩腿、象走田且会被塞眼、士斜走不出九宫、将帅不能照面、炮要隔一个子才能吃、兵过河前只能向前。将军时必须应将，将死或困毙即分胜负。',
        win_title: '赢了这一盘', win_sub: '第 {score} 回合将死对手。',
        lose_title: '这盘输了', lose_sub: '对手在第 {score} 回合取胜。',
        new_record: '破纪录了', paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的落点。',
        msg_check: '将军！', msg_checkmate: '将死，本局结束',
        msg_stalemate: '困毙，判负', msg_capture: '吃子'
      },
      en: {
        page_title: 'Xiangqi (Chinese Chess), free to play | YSGame',
        page_desc: 'A free online Xiangqi game: full movement rules, check and checkmate detection, blocked-horse and blocked-elephant rules, undo and hints, three AI levels and autosave. No account needed.',
        game_title: 'Xiangqi',
        tagline: 'Set out the river and the border — every single move counts',
        share_line: 'Too busy taking the rook to notice my own general was gone.',
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Turn', label_best: 'Wins', label_time: 'Time', label_level: 'Turn',
        label_lives: 'Pieces left', label_steps: 'Moves', label_wave: 'Round', label_enemies: 'Rival', label_power: 'Attack',
        label_pairs: 'Pieces', label_moves: 'Moves', label_side: 'Side',
        btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
        btn_pause: 'Pause', btn_resume: 'Resume', btn_next: 'Next game', btn_undo: 'Undo', btn_clear: 'Clear',
        board_aria: 'Xiangqi board',
        hint_controls: 'You play red and move first. Tap one of your pieces, then tap a highlighted square. The rook moves in straight lines, the horse moves in an L but can be blocked at the leg, the elephant moves two diagonals and can be blocked at the eye, the advisor stays inside the palace, the two generals may never face each other, the cannon needs a screen to capture, and the soldier only moves forward until it crosses the river. You must answer a check; checkmate or stalemate ends the game.',
        win_title: 'You won the game', win_sub: 'Checkmate on turn {score}.',
        lose_title: 'Lost this one', lose_sub: 'Your rival won on turn {score}.',
        new_record: 'New record', paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted square.',
        msg_check: 'Check!', msg_checkmate: 'Checkmate — game over',
        msg_stalemate: 'Stalemate — you lose', msg_capture: 'Capture'
      }
    },
    /* [gyh 2026-11-10 新增] 批次六：国际象棋 / 围棋 / 跳棋 / 飞行棋 */
    gchess: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        page_title: '国际象棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线国际象棋：王车易位、吃过路兵、兵升变、将军与将死判定、悔棋与提示、三档棋力 AI，自动存档，无需注册登录。',
        game_title: '国际象棋',
        tagline: '六十四格里，每一步都在改写结局',
        share_line: '以为只是随手拱了个兵，回头王已经被将死。',
        board_aria: '国际象棋棋盘',
        hint_controls: '你执白先走。点选棋子再点高亮格落子：兵直走斜吃、马走日、象走斜线、车走直线、后横竖斜皆可、王每次一格。王车易位、吃过路兵与兵到底升变都已实现，被将军时必须应将，将死或逼和即分胜负。',
        win_title: '将死，你赢了',
        win_sub: '第 {score} 回合将死对手。',
        lose_title: '这盘输了',
        lose_sub: '对手在第 {score} 回合取胜。',
        msg_check: '将军！',
        msg_checkmate: '将死，本局结束',
        msg_stalemate: '逼和，平局',
        msg_castle: '王车易位',
        msg_promote: '兵升变',
        msg_capture: '吃子',
        msg_promote_choose: '选一个升变棋子',
        msg_draw: '和棋'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        page_title: 'Chess, free to play | YSGame',
        page_desc: 'A free online chess game: castling, en passant, promotion, check and checkmate detection, undo and hints, three AI levels and autosave. No account needed.',
        game_title: 'Chess',
        tagline: 'Sixty-four squares, and every move rewrites the ending',
        share_line: 'I only pushed a pawn. Somehow that was checkmate.',
        board_aria: 'Chess board',
        hint_controls: 'You play white and move first. Tap a piece, then a highlighted square. Pawns move straight and capture diagonally, knights jump in an L, bishops run on diagonals, rooks on ranks and files, the queen does both and the king steps one square. Castling, en passant and promotion are all supported. You must answer a check; checkmate or stalemate ends the game.',
        win_title: 'Checkmate — you won',
        win_sub: 'Checkmate on turn {score}.',
        lose_title: 'Lost this one',
        lose_sub: 'Your rival won on turn {score}.',
        msg_check: 'Check!',
        msg_checkmate: 'Checkmate — game over',
        msg_stalemate: 'Stalemate — a draw',
        msg_castle: 'Castling',
        msg_promote: 'Promotion',
        msg_capture: 'Capture',
        msg_promote_choose: 'Choose a promotion piece',
        msg_draw: 'Draw'
      }
    },
    ggo: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        page_title: '围棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线围棋：气与提子、打劫禁着、停一手与点目结算，9 路 / 13 路 / 19 路三档棋盘，自动存档，无需注册登录。',
        game_title: '围棋',
        tagline: '一手一地，围出自己的边界',
        share_line: '看着只是一块空地，收完官才发现全是对方的。',
        board_aria: '围棋棋盘',
        hint_controls: '黑先白后，轮流落在交叉点上。横竖相邻的同色子连成一块，气尽即被提走；打劫不能立刻回提，自杀点也不能落。可以点「停一手」让过，双方连续停手后按围地与提子点目定胜负。',
        win_title: '这一局你赢了',
        win_sub: '以 {score} 目取胜。',
        lose_title: '这一局输了',
        lose_sub: '输了 {score} 目。',
        btn_pass: '停一手',
        label_territory: '目数',
        label_captures: '提子',
        msg_pass: '你停了一手',
        msg_ko: '打劫禁着，不能马上回提',
        msg_atari: '打吃！',
        msg_suicide: '这里不能落子（无气）',
        msg_score: '点目结束',
        msg_capture: '提子'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        page_title: 'Go, free to play | YSGame',
        page_desc: 'A free online Go game: liberties and captures, the ko rule, passing and territory scoring, with 9x9 / 13x13 / 19x19 boards, three levels and autosave. No account needed.',
        game_title: 'Go',
        tagline: 'Stone by stone, draw the border of your own',
        share_line: 'Looked like empty space. Then we counted the territory.',
        board_aria: 'Go board',
        hint_controls: 'Black moves first; take turns placing stones on the intersections. Adjacent same-colour stones form a group, and a group with no liberties is captured. The ko rule forbids an immediate recapture, and suicide is illegal. Use Pass to skip; two passes in a row end the game and territory plus captures decide the score.',
        win_title: 'You won this game',
        win_sub: 'Won by {score} points.',
        lose_title: 'Lost this one',
        lose_sub: 'Lost by {score} points.',
        btn_pass: 'Pass',
        label_territory: 'Territory',
        label_captures: 'Captures',
        msg_pass: 'You passed',
        msg_ko: 'Ko rule: you cannot recapture yet',
        msg_atari: 'Atari!',
        msg_suicide: 'No liberties there — illegal move',
        msg_score: 'Scoring finished',
        msg_capture: 'Capture'
      }
    },
    ghexcheckers: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        page_title: '跳棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线跳棋：六角星棋盘、相邻走子与隔子连跳、可达点高亮、三档棋盘与 AI、自动存档，无需注册登录。',
        game_title: '跳棋',
        tagline: '六角星盘上，借力才能跳得最远',
        share_line: '本来只想挪一格，结果一路连跳到了对面。',
        board_aria: '跳棋六角星棋盘',
        hint_controls: '把自己营区的棋子全部搬进正对面的营区就赢。每回合可以走到相邻空位，也可以隔着任意一颗棋子跳到它后面的空位，落点还能继续起跳形成连跳；点选棋子后会高亮所有可达点。',
        win_title: '全部到家，你赢了',
        win_sub: '用 {score} 步完成转移。',
        lose_title: '对手先到家',
        lose_sub: '对手用了 {score} 步。',
        label_hops: '连跳',
        msg_jump: '连跳！',
        msg_no_jump: '这里跳不过去',
        msg_win: '全部抵达对面营区',
        msg_select: '先选一颗自己的棋子'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        page_title: 'Hex Checkers, free to play | YSGame',
        page_desc: 'A free online hex checkers game: a six-pointed star board, step moves and chained jumps, highlighted destinations, three board sizes with AI levels and autosave. No account needed.',
        game_title: 'Hex Checkers',
        tagline: 'On a six-pointed star, a good jump borrows momentum',
        share_line: 'Meant to move one hole. Ended up hopping clear across the board.',
        board_aria: 'Hex checkers star board',
        hint_controls: 'Move every piece from your home triangle into the opposite one to win. Each turn you may step into an adjacent empty hole, or jump over any single adjacent piece into the empty hole just beyond it — and keep jumping from the new spot. Select a piece to highlight every reachable hole.',
        win_title: 'All home — you won',
        win_sub: 'Moved across in {score} moves.',
        lose_title: 'Your rival got there first',
        lose_sub: 'They needed {score} moves.',
        label_hops: 'Chain',
        msg_jump: 'Chain jump!',
        msg_no_jump: 'You cannot jump there',
        msg_win: 'Every piece reached the far camp',
        msg_select: 'Select one of your pieces first'
      }
    },
    gflightchess: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        page_title: '飞行棋 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线飞行棋：四色飞机、掷骰起飞、同色跳格、撞子回营、终点判定，三档难度与 AI，自动存档，无需注册登录。',
        game_title: '飞行棋',
        tagline: '掷骰起飞，把四架飞机挨个送回家',
        share_line: '差一格到家，被一记撞子送回了停机坪。',
        board_aria: '飞行棋棋盘',
        hint_controls: '掷出 6 点才能把一架飞机送上跑道，之后按点数沿外圈前进；停在己方颜色格可以跳到下一个同色格，正好落在对手飞机上会把它送回停机坪。先让全部飞机进入终点区即获胜。',
        win_title: '率先到家，你赢了',
        win_sub: '第 {score} 回合完成。',
        lose_title: '对手先到家',
        lose_sub: '对手在第 {score} 回合完成。',
        label_roll: '点数',
        btn_roll: '掷骰',
        label_planes: '飞机',
        msg_roll: '掷出 {score} 点',
        msg_hit: '撞子！对手回停机坪',
        msg_takeoff: '起飞！',
        msg_home: '一架飞机到家',
        msg_need_six: '要掷出 6 点才能起飞'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        page_title: 'Aeroplane Chess, free to play | YSGame',
        page_desc: 'A free online aeroplane chess game: four colours of planes, roll to take off, same-colour hops, sending rivals back to the hangar, three AI levels and autosave. No account needed.',
        game_title: 'Aeroplane Chess',
        tagline: 'Roll, take off, and fly all four planes home',
        share_line: 'One square from home. One bump later, back at the hangar.',
        board_aria: 'Aeroplane chess board',
        hint_controls: 'Roll a six to launch a plane onto the track, then move it around the outer ring by the number shown. Landing on your own colour hops you to the next matching square; landing exactly on a rival plane sends it back to the hangar. Get every plane into the home stretch to win.',
        win_title: 'First home — you won',
        win_sub: 'Finished on turn {score}.',
        lose_title: 'Your rival got home first',
        lose_sub: 'They finished on turn {score}.',
        label_roll: 'Roll',
        btn_roll: 'Roll dice',
        label_planes: 'Planes',
        msg_roll: 'Rolled {score}',
        msg_hit: 'Bumped! Rival back to the hangar',
        msg_takeoff: 'Taking off!',
        msg_home: 'One plane is home',
        msg_need_six: 'Roll a six to take off'
      }
    },
    /* [gyh 2026-11-10 新增] 批次七：架子鼓 / 太阳系 / 死活题 / 残局 */
    gdrumkit: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        label_combo: '连击',
        label_hits: '命中',
        btn_play: '演奏',
        btn_stop: '停止',
        msg_hit: '命中！',
        msg_miss: '漏了一拍',
        page_title: '在线架子鼓 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线架子鼓：多点触控鼓面、合成鼓声、内置节奏谱跟拍与节拍器，三档难度与自动存档，无需注册登录。',
        game_title: '在线架子鼓',
        tagline: '点几下，就有了节奏',
        share_line: '随手敲了一段，没想到还挺带感。',
        board_aria: '架子鼓鼓面',
        mode_free: '自由演奏：想怎么敲就怎么敲，不计分。',
        mode_slow: '慢谱：跟着节拍器在光圈缩到鼓面时落点。',
        mode_fast: '快谱：更快的节拍、更复杂的节奏，考你的反应。',
        pad_kick: '底鼓',
        pad_snare: '军鼓',
        pad_hat: '踩镲',
        pad_tom1: '高桶',
        pad_tom2: '中桶',
        pad_crash: '吊镲',
        done_title: '这一遍打完啦',
        done_sub: '节奏感不错，再来一遍？',
        acc_label: '准确率',
        hint_controls: '点按或敲下鼓面就会发声。选一首节奏谱，跟着节拍器在圈缩到鼓面时落点，命中高亮圈得分，连击越多分越高；漏拍会断连击。自由演奏档不计时，纯听个响。'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        label_combo: 'Combo',
        label_hits: 'Hits',
        btn_play: 'Play',
        btn_stop: 'Stop',
        msg_hit: 'Hit!',
        msg_miss: 'Missed a beat',
        page_title: 'Drum kit, free to play | YSGame',
        page_desc: 'A free online drum kit: tap pads for synth drums, follow built-in beats with a metronome, three levels and autosave. No account needed.',
        game_title: 'Drum kit',
        tagline: 'A few taps and you have a groove',
        share_line: 'Tapped out a little beat — turns out it grooves.',
        board_aria: 'Drum pads',
        mode_free: 'Free play: hit whatever you like, no score kept.',
        mode_slow: 'Slow groove: tap each pad as the ring shrinks onto it with the metronome.',
        mode_fast: 'Fast groove: quicker tempo, busier pattern — test your reflexes.',
        pad_kick: 'Kick',
        pad_snare: 'Snare',
        pad_hat: 'Hi-hat',
        pad_tom1: 'High tom',
        pad_tom2: 'Mid tom',
        pad_crash: 'Crash',
        done_title: 'That run is done',
        done_sub: 'Nice groove — run it again?',
        acc_label: 'Accuracy',
        hint_controls: 'Tap a pad and it sounds. Pick a beat, then tap each pad as the ring shrinks onto it in time with the metronome; hit the lit ring for points, and chain hits for combos. Miss and the chain breaks. Free play has no clock — just make noise.'
      }
    },
    gsolarsystem: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        label_planet: '当前',
        label_rank: '名次',
        label_diameter: '直径',
        label_distance: '距太阳',
        label_period: '公转',
        cruise_hint: '拖动旋转 · 滚轮缩放 · 点行星看资料',
        btn_cruise: '巡航',
        btn_quiz: '闯关',
        msg_correct: '答对！',
        msg_wrong: '答错了',
        page_title: '掌控太阳系 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线太阳系：伪 3D 行星轨道、缩放查看、行星资料，以及行星知识闯关，三档难度与自动存档，无需注册登录。',
        game_title: '掌控太阳系',
        tagline: '把八大行星握在手心',
        share_line: '原来木星比其它七颗加起来还重。',
        board_aria: '太阳系全景',
        hint_controls: '拖动旋转视角、滚轮或双指缩放观察行星轨道；点行星看它的资料卡。闯关档会出关于行星的问答题，按难度给你限定时间作答。'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        label_planet: 'Now',
        label_rank: 'Rank',
        label_diameter: 'Diameter',
        label_distance: 'From Sun',
        label_period: 'Orbit',
        cruise_hint: 'Drag to rotate · scroll to zoom · tap a planet for facts',
        btn_cruise: 'Cruise',
        btn_quiz: 'Quiz',
        msg_correct: 'Correct!',
        msg_wrong: 'Wrong',
        page_title: 'Solar System, free to play | YSGame',
        page_desc: 'A free online solar system: a fake-3D orbit view, zoom and planet facts, plus a planet quiz. Three levels and autosave. No account needed.',
        game_title: 'Solar System',
        tagline: 'Hold the eight planets in your hand',
        share_line: 'Jupiter is heavier than the other seven combined.',
        board_aria: 'Solar system view',
        hint_controls: 'Drag to rotate, scroll or pinch to zoom and watch the orbits; tap a planet for its fact card. Quiz mode asks planet questions with a time limit that tightens by level.'
      }
    },
    gtsumego: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        label_problem: '第几题',
        btn_solve: '看正解',
        msg_solved: '做对了',
        msg_dead: '这块死了',
        msg_alive: '这块活了',
        msg_wrong: '这一手不对',
        page_title: '围棋死活题 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线围棋死活题：经典死活题型库、落子判活判死、逐步提示，三档难度与自动存档，无需注册登录。',
        game_title: '围棋死活题',
        tagline: '一块棋，是活是死',
        share_line: '看着是活棋，走错一手全死了。',
        board_aria: '死活题棋盘',
        hint_controls: '黑先，轮到你落子。目标通常是把指定的一块白棋杀掉、或者做活自己的一块黑棋。落子后系统判定死活；卡住了可以看提示，简单档还能直接看正解。'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        label_problem: 'Problem',
        btn_solve: 'Show answer',
        msg_solved: 'Solved',
        msg_dead: 'This group is dead',
        msg_alive: 'This group lives',
        msg_wrong: 'That move is wrong',
        page_title: 'Go Problems, free to play | YSGame',
        page_desc: 'A free online Go life-and-death drill: a library of classic tsumego, place stones to kill or live, step-by-step hints, three levels and autosave. No account needed.',
        game_title: 'Go Problems',
        tagline: 'One group: alive or dead',
        share_line: 'Looked alive — one wrong move and it was dead.',
        board_aria: 'Tsumego board',
        hint_controls: 'Black moves first, it is your turn. Usually the goal is to kill a marked white group or to make your black group live. After you play, the system checks life and death; use a hint if stuck, and Easy even shows the answer.'
      }
    },
    gendgame: {
      zh: {
        difficulty_group_aria: '选择难度',
        diff_easy: '简单',
        diff_medium: '中等',
        diff_hard: '困难',
        confirm_diff: '切换难度会重新开一局，当前进度会丢掉。',
        label_score: '得分',
        label_best: '最佳',
        label_time: '用时',
        label_level: '回合',
        label_lives: '剩余',
        label_steps: '步数',
        label_wave: '轮次',
        label_enemies: '对手',
        label_power: '力度',
        label_pairs: '组数',
        label_moves: '走子',
        label_side: '执子',
        btn_start: '开始',
        btn_restart: '重开',
        btn_again: '再来一局',
        btn_hint: '提示',
        btn_pause: '暂停',
        btn_resume: '继续',
        btn_next: '下一局',
        btn_undo: '悔棋',
        btn_clear: '清空',
        new_record: '破纪录了',
        paused_title: '暂停中',
        msg_no_moves: '这一方没有合法走法。',
        msg_invalid: '这一步不合规，选一个高亮的位置。',
        msg_win: '将死，你赢了',
        msg_lose: '被将死了',
        msg_stuck: '无子可动，判负',
        msg_check: '将军！必须应将。',
        msg_capture: '吃子。',
        win_title: '将死，你赢了',
        win_sub: '用 {score} 步拿下这一局',
        lose_title: '被将死了',
        lose_sub: '你坚持了 {score} 步',
        page_title: '象棋残局 · 在线玩 | YSGame 云舒的小游戏屋',
        page_desc: '免费在线象棋残局：经典残局题库、走子与胜负判定、三档电脑棋力与提示，自动存档，无需注册登录。',
        game_title: '象棋残局',
        tagline: '几子之间，定胜负',
        share_line: '就剩两车一兵，硬是把将给困死了。',
        board_aria: '象棋残局棋盘',
        hint_controls: '按题目摆好的局面走子，目标是把对方将死（或按题意守和）。你执红先行，点子再点落点；被将军必须应将，系统判定胜负与逼和。简单档提示多、悔棋多，困难档电脑更顽强。'
      },
      en: {
        difficulty_group_aria: 'Choose a difficulty',
        diff_easy: 'Easy',
        diff_medium: 'Medium',
        diff_hard: 'Hard',
        confirm_diff: 'Switching difficulty starts a fresh game. Your progress will be lost.',
        label_score: 'Score',
        label_best: 'Best',
        label_time: 'Time',
        label_level: 'Turn',
        label_lives: 'Left',
        label_steps: 'Moves',
        label_wave: 'Round',
        label_enemies: 'Rival',
        label_power: 'Power',
        label_pairs: 'Pairs',
        label_moves: 'Moves',
        label_side: 'Side',
        btn_start: 'Start',
        btn_restart: 'Restart',
        btn_again: 'Play again',
        btn_hint: 'Hint',
        btn_pause: 'Pause',
        btn_resume: 'Resume',
        btn_next: 'Next game',
        btn_undo: 'Undo',
        btn_clear: 'Clear',
        new_record: 'New record',
        paused_title: 'Paused',
        msg_no_moves: 'No legal move for this side.',
        msg_invalid: 'That move is not legal. Pick a highlighted spot.',
        msg_win: 'Checkmate — you won',
        msg_lose: 'You were checkmated',
        msg_stuck: 'No legal move — you lose',
        msg_check: 'Check! You must respond.',
        msg_capture: 'Capture.',
        win_title: 'Checkmate — you won',
        win_sub: 'Mated in {score} moves',
        lose_title: 'You were checkmated',
        lose_sub: 'You lasted {score} moves',
        page_title: 'Xiangqi Endgames, free to play | YSGame',
        page_desc: 'A free online xiangqi endgame drill: a library of classic endgames, move and win-or-draw judgement, three AI levels and hints, autosave. No account needed.',
        game_title: 'Xiangqi Endgames',
        tagline: 'Win or lose in a few pieces',
        share_line: 'Down to two rooks and a pawn, and still checkmated the king.',
        board_aria: 'Xiangqi endgame board',
        hint_controls: 'Play from the position given by the puzzle; the goal is to checkmate the enemy (or hold a draw as stated). You are red and move first — tap a piece then a square. You must answer a check, and the system judges checkmate, stalemate and draw. Easy gives more hints and undos; Hard is a tougher computer.'
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
