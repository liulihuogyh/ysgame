/**
 * 数独生成与求解核心算法
 * 支持5个难度级别：入门、简单、中等、困难、专家
 */

class SudokuGenerator {
  constructor() {
    this.board = Array(9).fill(0).map(() => Array(9).fill(0));
  }

  /**
   * 生成完整的数独解（填满整个9x9棋盘）
   */
  generateSolution() {
    this.board = Array(9).fill(0).map(() => Array(9).fill(0));
    this.fillBoard();
    return JSON.parse(JSON.stringify(this.board));
  }

  /**
   * 使用回溯法填充棋盘
   */
  fillBoard() {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] === 0) {
          // 随机打乱数字顺序，增加随机性
          this.shuffle(numbers);
          
          for (let num of numbers) {
            if (this.isValid(row, col, num)) {
              this.board[row][col] = num;
              
              if (this.fillBoard()) {
                return true;
              }
              
              this.board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 检查在指定位置放置数字是否有效
   */
  isValid(row, col, num) {
    // 检查行
    for (let x = 0; x < 9; x++) {
      if (this.board[row][x] === num) return false;
    }

    // 检查列
    for (let x = 0; x < 9; x++) {
      if (this.board[x][col] === num) return false;
    }

    // 检查3x3宫格
    let startRow = row - (row % 3);
    let startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (this.board[i + startRow][j + startCol] === num) return false;
      }
    }

    return true;
  }

  /**
   * 根据难度生成数独谜题
   * @param {string} difficulty - 难度：'easy', 'medium', 'hard', 'expert', 'master'
   */
  generatePuzzle(difficulty = 'medium') {
    const solution = this.generateSolution();
    const puzzle = JSON.parse(JSON.stringify(solution));
    
    // 根据难度确定要挖空的格子数
    const blanksMap = {
      'easy': 35,      // 入门（54个已知数）
      'medium': 45,    // 简单（36个已知数）
      'hard': 52,      // 中等（29个已知数）
      'expert': 58,    // 困难（23个已知数）
      'master': 64     // 专家（17个已知数）
    };
    
    const blanks = blanksMap[difficulty] || 45;
    let removed = 0;
    
    // 随机挖空，确保对称性（可选）
    while (removed < blanks) {
      let row = Math.floor(Math.random() * 9);
      let col = Math.floor(Math.random() * 9);
      
      if (puzzle[row][col] !== 0) {
        const backup = puzzle[row][col];
        puzzle[row][col] = 0;
        
        // 简化版：不进行唯一解验证（生产环境建议添加）
        removed++;
      }
    }
    
    return {
      puzzle: puzzle,
      solution: solution
    };
  }

  /**
   * 验证数独解答是否正确
   */
  validateSolution(board) {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (board[i][j] === 0) return false;
        
        const num = board[i][j];
        board[i][j] = 0; // 临时清空
        
        if (!this.isValid(i, j, num)) {
          board[i][j] = num;
          return false;
        }
        
        board[i][j] = num;
      }
    }
    return true;
  }

  /**
   * 求解数独（用于提示功能）
   */
  solve(board) {
    const solver = new SudokuSolver(board);
    return solver.solve();
  }

  /**
   * 数组随机打乱（Fisher-Yates算法）
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

/**
 * 数独求解器（用于提示和验证）
 */
class SudokuSolver {
  constructor(board) {
    this.board = JSON.parse(JSON.stringify(board));
  }

  solve() {
    return this.backtrack();
  }

  backtrack() {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (this.isValid(row, col, num)) {
              this.board[row][col] = num;
              
              if (this.backtrack()) {
                return true;
              }
              
              this.board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  isValid(row, col, num) {
    // 检查行
    for (let x = 0; x < 9; x++) {
      if (this.board[row][x] === num) return false;
    }

    // 检查列
    for (let x = 0; x < 9; x++) {
      if (this.board[x][col] === num) return false;
    }

    // 检查3x3宫格
    let startRow = row - (row % 3);
    let startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (this.board[i + startRow][j + startCol] === num) return false;
      }
    }

    return true;
  }

  getBoard() {
    return this.board;
  }
}

// 导出（浏览器环境）
if (typeof window !== 'undefined') {
  window.SudokuGenerator = SudokuGenerator;
  window.SudokuSolver = SudokuSolver;
}
