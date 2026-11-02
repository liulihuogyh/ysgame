# 海外推广素材（英文）

> 用途：向英文社区介绍 ysgame.xyz。所有文案都已按各平台的语气写过一遍，可直接复制。
> 最后更新：2026-11-02

---

## 发之前先看这三条

1. **现在只有 1 个游戏，先别急着发。** 英文社区对「单页工具站」很敏感，容易判定为 self-promo。建议至少凑到 2–3 个可玩游戏（数独 + 2048 + 扫雷）再开始推。
2. **Reddit 各版规则不同。** r/WebGames 允许开发者发但要求标明；r/IndieGaming 有自己的 self-promotion 限制；r/InternetIsBeautiful 只收「值得一看的站点」，不要带任何推销语气。发之前先看版规和置顶帖。
3. **不要一次多版群发同样的文字。** 会被识别为 spam。同一个故事，换个角度分几天发。

---

## 一句话版本

**超短（推文、签名）**
> A quiet little arcade of browser games. No account, no timers. ysgame.xyz

**短（目录站、导航站）**
> YSGame is a small collection of slow browser games — Sudoku today, 2048 and Minesweeper next. Free, no sign-up, progress saved in your browser.

**中（Product Hunt tagline，60 字符内）**
> A quiet arcade of browser games. No accounts, no timers.

---

## Reddit

### r/WebGames

**Title**
> I made a quiet little arcade of browser games for my daughter — Sudoku first, more coming

**Body**
> My daughter's name is Yunshu. I wanted to make her something that would still be around when she's old enough to use it, so I bought a domain with her initials and started building.
>
> It's just Sudoku for now — five difficulty levels, undo, hints, mistake checking, and it saves your board so you can close the tab and come back later. 2048, Minesweeper and a jigsaw are next.
>
> The rule I set for myself: no accounts, no energy bars, no "watch an ad to continue." There are a couple of small ad slots to cover the domain and hosting, and that's it.
>
> [ysgame.xyz](https://ysgame.xyz/en/) — happy to hear what's broken or what you'd want next.

### r/InternetIsBeautiful

**Title**
> A small arcade of quiet browser games, named after the maker's daughter

**Body**
> No account, no timers, no pop-ups. Just a few slow games and a story about why it's called YS.
> [ysgame.xyz/en](https://ysgame.xyz/en/)

> 注意：这个版对标题很挑，越朴素越好。别用感叹号，别写 "I built"。

### r/indiegames / r/IndieGaming

**Title**
> A one-person browser arcade, built for my daughter

**Body**
> Not a commercial project — more of a craft project that happens to live on the internet. One game is live (Sudoku), the rest are being built one at a time.
>
> Everything is plain HTML/CSS/JS, no framework, no backend. Progress saves locally, nothing is uploaded anywhere.
>
> If you're curious about the "why": [ysgame.xyz/en/about.html](https://ysgame.xyz/en/about.html)

---

## Hacker News（Show HN）

**Title**
> Show HN: A quiet browser arcade named after my daughter

**First comment**（发完自己顶一条，说清技术取舍）
> Author here. It's a static site — no framework, no build step, no backend. Games are plain JS; Sudoku generates and solves puzzles in the browser.
>
> Two decisions worth mentioning:
> - Progress lives in localStorage, so there's no account system at all. The trade-off is it doesn't sync across devices, which I decided was fine.
> - The English pages are separate static HTML rather than a JS-driven i18n layer, because social previews don't run JS and I wanted the og tags to be right.
>
> Feedback welcome, especially on the Sudoku generator's difficulty curve.

---

## Product Hunt

**Tagline**
> A quiet arcade of browser games. No accounts, no timers.

**Description**
> YSGame is a small collection of slow browser games. Open one, play for as long as you feel like, close the tab — your progress is waiting next time.
>
> No sign-up. No energy meters. No "watch an ad to keep playing." A few small ad slots cover the hosting, nothing else.
>
> Currently live: Sudoku, with five levels from beginner to expert. 2048, Minesweeper, Jigsaw, a match-three and Snake are in progress.
>
> Named after the maker's daughter, Yunshu. The whole story is on the about page.

**First comment**
> Maker here. This started as a present for my daughter — something small that could grow with her.
>
> The constraint I kept coming back to: a game you can leave. Most casual games are designed to keep you there; I wanted the opposite. You should be able to play for six minutes and walk away feeling better, not hooked.
>
> Would love feedback on two things: whether the Sudoku difficulty curve feels right, and which game I should build next.

---

## X / Twitter

**单条**
> I built a small arcade of browser games for my daughter.
>
> No account. No timers. No "watch an ad to continue."
>
> Sudoku is live, 2048 is next.
>
> ysgame.xyz

**带故事线的串**
> 1/ My daughter is two. She can't read yet, so this is a bit early.
>
> But I wanted to make her something that would still exist when she's older — so I bought a domain with her initials and started building a small arcade.
>
> 2/ The rule: no accounts, no energy bars, no ads in the way. Just games you can open, play for six minutes, and close.
>
> 3/ Sudoku is live now, with five difficulty levels. 2048 next, then Minesweeper and a jigsaw.
>
> ysgame.xyz

---

## 发布后的固定回复

**有人问「为什么不做成 App」**
> Fair question. A web page means no install, no app store review, and it works on whatever device you already have open. For games this small, that felt like the right trade.

**有人问「广告呢」**
> A couple of small slots to cover the domain and hosting. No pop-ups, nothing over the board. If it ever covers its costs, that's enough.

**有人反馈 bug**
> Thanks — that's useful. Could you tell me the device and browser? I'll reproduce it and fix it this week.

---

## 建议的发布顺序

| 顺序 | 渠道 | 时机 |
| --- | --- | --- |
| 1 | 个人 X / 朋友圈 | 有 2 个游戏后，先积累一点真实访问 |
| 2 | r/WebGames | 2–3 个游戏后 |
| 3 | Hacker News (Show HN) | 3 个游戏后，周二到周四上午（美东） |
| 4 | Product Hunt | 内容页和 3 个游戏都齐了再上 |
| 5 | r/InternetIsBeautiful | 最后发，这个版对站点完整度要求最高 |

> 每次发布前确认 `https://ysgame.xyz/en/` 的分享卡片能正常显示（标题 + 大图）。可以用 Twitter 的 Card Validator 或直接私信自己测试。
