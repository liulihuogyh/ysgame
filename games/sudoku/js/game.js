/**
 * 游戏核心逻辑
 * 管理游戏状态、用户交互、进度保存
 */

// [gyh 2026-11-02 新增] 游戏页支持中英切换，弹窗与提示统一从 I18N 取文案
function msg(key) {
  return window.I18N ? window.I18N.t(key) : key;
}

// [gyh 2026-11-02 新增] 存档键统一用 ysgame 前缀，各游戏各占一个键
const STORAGE_KEY = 'ysgame-sudoku-state';

class SudokuGame {
  constructor() {
    this.generator = new SudokuGenerator();
    this.currentPuzzle = null;
    this.currentSolution = null;
    this.playerBoard = null;
    this.difficulty = 'medium';
    this.selectedCell = null;
    this.startTime = null;
    this.timer = null;
    this.history = []; // 用于撤销功能
    this.hints = 3; // 剩余提示次数
    this.errors = 0; // 错误次数
    this.gameCompleted = false;
    
    this.init();
  }

  /**
   * 初始化游戏
   */
  init() {
    this.loadGameState();
    this.bindEvents();

    // [gyh 2026-11-02 新增] 首屏就把难度标签按当前语言渲染，
    // 否则英文模式下这里会残留 HTML 里硬编码的中文「简单」
    this.updateStats();

    // [gyh 2026-11-02 新增] 切换语言后难度名要跟着重绘
    document.addEventListener('ys:langchange', () => this.updateStats());
  }

  /**
   * 开始新游戏
   */
  startNewGame(difficulty = 'medium') {
    this.difficulty = difficulty;
    const { puzzle, solution } = this.generator.generatePuzzle(difficulty);
    
    this.currentPuzzle = puzzle;
    this.currentSolution = solution;
    this.playerBoard = JSON.parse(JSON.stringify(puzzle));
    this.selectedCell = null;
    this.startTime = Date.now();
    this.history = [];
    this.hints = 3;
    this.errors = 0;
    this.gameCompleted = false;
    
    this.saveGameState();
    this.renderBoard();
    this.startTimer();
    this.updateStats();
    
    // 播放音效
    this.playSound('start');
  }

  /**
   * 渲染棋盘
   */
  renderBoard() {
    const boardElement = document.getElementById('sudoku-board');
    boardElement.innerHTML = '';
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        
        // 添加宫格边框样式
        if (col % 3 === 0 && col !== 0) cell.classList.add('border-left');
        if (row % 3 === 0 && row !== 0) cell.classList.add('border-top');
        
        const value = this.playerBoard[row][col];
        
        if (value !== 0) {
          cell.textContent = value;
          
          // 区分初始数字和玩家填入的数字
          if (this.currentPuzzle[row][col] !== 0) {
            cell.classList.add('initial');
          } else {
            cell.classList.add('user-input');
          }
        }
        
        // 绑定点击事件
        cell.addEventListener('click', () => this.selectCell(row, col));
        
        boardElement.appendChild(cell);
      }
    }
  }

  /**
   * 选中单元格
   */
  selectCell(row, col) {
    // 不能选中初始数字
    if (this.currentPuzzle[row][col] !== 0) {
      return;
    }
    
    this.selectedCell = { row, col };
    this.highlightCell();
  }

  /**
   * 高亮选中的单元格
   */
  highlightCell() {
    // 清除之前的高亮
    document.querySelectorAll('.cell').forEach(cell => {
      cell.classList.remove('selected', 'highlight');
    });
    
    if (!this.selectedCell) return;
    
    const { row, col } = this.selectedCell;
    const cells = document.querySelectorAll('.cell');
    
    cells.forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);
      
      // 高亮选中的单元格
      if (r === row && c === col) {
        cell.classList.add('selected');
      }
      
      // 高亮同行、同列、同宫格
      if (r === row || c === col || 
          (Math.floor(r / 3) === Math.floor(row / 3) && 
           Math.floor(c / 3) === Math.floor(col / 3))) {
        cell.classList.add('highlight');
      }
    });
  }

  /**
   * 填入数字
   */
  inputNumber(num) {
    if (!this.selectedCell || this.gameCompleted) return;
    
    const { row, col } = this.selectedCell;
    
    // 保存历史记录（用于撤销）
    this.history.push({
      row,
      col,
      oldValue: this.playerBoard[row][col]
    });
    
    this.playerBoard[row][col] = num;
    this.saveGameState();
    this.renderBoard();
    
    // 检查是否完成
    if (this.checkCompletion()) {
      this.onGameComplete();
    }
    
    this.playSound('input');
    // [gyh 2026-11-08 新增] 刚补上最后一格、填满一行/一列/一宫时给一声 coin
    const prev = this.history[this.history.length - 1];
    if (prev && prev.oldValue === 0 && num !== 0 && this.lineCompleted(row, col)) {
      this.playSound('coin');
    }
  }

  /**
   * 撤销操作
   */
  undo() {
    if (this.history.length === 0) return;
    
    const last = this.history.pop();
    this.playerBoard[last.row][last.col] = last.oldValue;
    
    this.saveGameState();
    this.renderBoard();
    this.playSound('undo');
  }

  /**
   * 清除选中单元格
   */
  erase() {
    if (!this.selectedCell) return;
    // [gyh 2026-11-08 新增] 清除格子
    this.playSound('click');
    this.inputNumber(0);
  }

  /**
   * 使用提示
   */
  useHint() {
    if (this.hints <= 0 || !this.selectedCell || this.gameCompleted) {
      alert(msg('alert_no_hints'));
      return;
    }
    
    const { row, col } = this.selectedCell;
    
    // 如果选中的是初始数字，不能提示
    if (this.currentPuzzle[row][col] !== 0) {
      alert(msg('alert_given'));
      return;
    }
    
    this.hints--;
    this.inputNumber(this.currentSolution[row][col]);
    this.updateStats();
    this.playSound('hint');
  }

  /**
   * 检查错误
   */
  checkErrors() {
    let hasError = false;
    const cells = document.querySelectorAll('.cell');
    
    cells.forEach(cell => {
      cell.classList.remove('error');
      
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      const value = this.playerBoard[row][col];
      
      if (value !== 0 && value !== this.currentSolution[row][col]) {
        cell.classList.add('error');
        hasError = true;
      }
    });
    
    if (hasError) {
      this.errors++;
      this.updateStats();
      this.playSound('error');
      // [gyh 2026-11-08 新增] 累计错误每满 3 次给一次危险提醒
      if (this.errors % 3 === 0) this.playSound('warn');
      alert(msg('alert_errors'));
    } else {
      alert(msg('alert_no_errors'));
    }
  }

  /**
   * 检查是否完成游戏
   */
  checkCompletion() {
    // 检查是否所有格子都填满
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (this.playerBoard[i][j] === 0) return false;
      }
    }
    
    // 检查答案是否正确
    return this.generator.validateSolution(JSON.parse(JSON.stringify(this.playerBoard)));
  }

  /**
   * 游戏完成回调
   */
  onGameComplete() {
    this.gameCompleted = true;
    this.stopTimer();
    
    const timeSpent = this.formatTime(Math.floor((Date.now() - this.startTime) / 1000));
    
    // 更新统计
    this.updateGameStats();
    
    // 显示完成动画和弹窗
    setTimeout(() => {
      this.playSound('complete');
      this.showCompletionModal(timeSpent);
    }, 300);
  }

  /**
   * 显示完成弹窗
   */
  showCompletionModal(time) {
    const modal = document.getElementById('completion-modal');

    document.getElementById('modal-time').textContent = time;
    document.getElementById('modal-difficulty').textContent = this.getDifficultyName();
    document.getElementById('modal-hints').textContent = 3 - this.hints;
    document.getElementById('modal-errors').textContent = this.errors;
    
    modal.classList.add('show');
  }

  /**
   * 计时器
   */
  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      document.getElementById('timer').textContent = this.formatTime(elapsed);
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    document.getElementById('difficulty-display').textContent = this.getDifficultyName();
    document.getElementById('hints-count').textContent = this.hints;
  }

  getDifficultyName() {
    // [gyh 2026-11-02 修改] 难度名改为跟随语言
    return msg('diff_' + this.difficulty);
  }

  /**
   * 保存游戏状态到localStorage
   */
  saveGameState() {
    const state = {
      currentPuzzle: this.currentPuzzle,
      currentSolution: this.currentSolution,
      playerBoard: this.playerBoard,
      difficulty: this.difficulty,
      startTime: this.startTime,
      hints: this.hints,
      errors: this.errors
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * 从localStorage加载游戏状态
   */
  loadGameState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      this.currentPuzzle = state.currentPuzzle;
      this.currentSolution = state.currentSolution;
      this.playerBoard = state.playerBoard;
      this.difficulty = state.difficulty;
      this.startTime = state.startTime;
      this.hints = state.hints;
      this.errors = state.errors;
    }
  }

  /**
   * 更新游戏统计（完成次数、最佳时间等）
   */
  updateGameStats() {
    let stats = JSON.parse(localStorage.getItem('sudoku-stats') || '{}');
    
    if (!stats[this.difficulty]) {
      stats[this.difficulty] = {
        completed: 0,
        bestTime: Infinity,
        totalTime: 0
      };
    }
    
    const timeSpent = Math.floor((Date.now() - this.startTime) / 1000);
    stats[this.difficulty].completed++;
    stats[this.difficulty].totalTime += timeSpent;
    
    if (timeSpent < stats[this.difficulty].bestTime) {
      stats[this.difficulty].bestTime = timeSpent;
    }
    
    localStorage.setItem('sudoku-stats', JSON.stringify(stats));
  }

  /**
   * [gyh 2026-11-08 新增] 判断刚填入的格子所在行/列/宫是否恰好填满
   */
  lineCompleted(row, col) {
    const full = vals => vals.every(v => v !== 0);
    if (full(this.playerBoard[row])) return true;

    const colVals = [];
    for (let i = 0; i < 9; i++) colVals.push(this.playerBoard[i][col]);
    if (full(colVals)) return true;

    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (this.playerBoard[r][c] === 0) return false;
      }
    }
    return true;
  }

  /**
   * 播放音效
   */
  playSound(type) {
    // [gyh 2026-11-03 修改] 统一走全站音效引擎，音色 / 音量 / 开关都在 js/sound.js 里维护。
    // 原来的实现是自己 new AudioContext + 正弦波，和另外七款游戏的音色对不上。
    if (window.YSound) window.YSound.play(type);
  }

  /**
   * 绑定键盘和按钮事件
   */
  bindEvents() {
    // 数字按钮
    for (let i = 1; i <= 9; i++) {
      document.getElementById(`btn-${i}`).addEventListener('click', () => {
        this.inputNumber(i);
      });
    }
    
    // 功能按钮
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-erase').addEventListener('click', () => this.erase());
    document.getElementById('btn-hint').addEventListener('click', () => this.useHint());
    document.getElementById('btn-check').addEventListener('click', () => this.checkErrors());
    
    // 键盘输入
    document.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') {
        this.inputNumber(parseInt(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        this.erase();
      } else if (e.key === 'z' && e.ctrlKey) {
        this.undo();
      }
    });
    
    // 难度选择
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const difficulty = e.target.dataset.difficulty;
        // [gyh 2026-11-08 新增] 切换难度
        this.playSound('toggle');
        this.startNewGame(difficulty);
        document.getElementById('main-menu').classList.remove('show');
      });
    });
    
    // 菜单按钮
    document.getElementById('btn-menu').addEventListener('click', () => {
      document.getElementById('main-menu').classList.add('show');
    });
    
    // 新游戏按钮
    document.getElementById('btn-new-game').addEventListener('click', () => {
      if (confirm(msg('confirm_new'))) {
        this.startNewGame(this.difficulty);
      }
    });
    
    // 关闭弹窗
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.remove('show');
        // [gyh 2026-11-02 新增] 首次访问时关掉难度面板，棋盘本来是空白的，
        // 玩家会不知道下一步做什么。这里直接按默认难度开一局。
        if (!this.currentPuzzle) {
          this.startNewGame(this.difficulty);
        }
      });
    });
    
    // 完成后再来一局
    document.getElementById('btn-play-again').addEventListener('click', () => {
      document.getElementById('completion-modal').classList.remove('show');
      this.startNewGame(this.difficulty);
    });
  }
}

// 页面加载完成后初始化游戏
if (typeof window !== 'undefined') {
  window.SudokuGame = SudokuGame;
}
