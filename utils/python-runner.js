/**
 * Python 脚本运行器
 * 在 Node.js 进程中调用 Python 脚本（使用项目内的虚拟环境）
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 检测项目内的 Python 虚拟环境路径
function getPythonVenvPath() {
  const possiblePaths = [
    path.join(__dirname, '..', 'venv'),
    path.join(__dirname, '..', 'env'),
    path.join(__dirname, '..', '.venv'),
    path.join(__dirname, '..', 'python', 'venv'),
  ];
  
  for (const venvPath of possiblePaths) {
    if (fs.existsSync(venvPath)) {
      return venvPath;
    }
  }
  return null;
}

// 获取 Python 解释器路径
function getPythonInterpreter() {
  const venvPath = getPythonVenvPath();
  if (venvPath) {
    const isWindows = process.platform === 'win32';
    const pythonPath = isWindows 
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
    
    if (fs.existsSync(pythonPath)) {
      return pythonPath;
    }
  }
  return 'python3'; // 回退到系统 Python
}

/**
 * 运行 Python 脚本（异步，返回 Promise）
 * @param {string} scriptPath - Python 脚本路径（相对于项目根目录）
 * @param {Array<string>} args - 传递给 Python 脚本的参数
 * @param {Object} options - 选项
 * @param {Object} options.env - 环境变量
 * @param {string} options.cwd - 工作目录
 * @param {number} options.timeout - 超时时间（毫秒）
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runPythonScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const python = getPythonInterpreter();
    const fullScriptPath = path.isAbsolute(scriptPath) 
      ? scriptPath 
      : path.join(__dirname, '..', scriptPath);
    
    const venvPath = getPythonVenvPath();
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1', // 确保输出不被缓冲
      ...(venvPath ? { VIRTUAL_ENV: venvPath } : {}),
      ...(options.env || {})
    };
    
    const cwd = options.cwd || path.dirname(fullScriptPath);
    
    const pythonProcess = spawn(python, [fullScriptPath, ...args], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    let timeoutId = null;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python 脚本执行超时 (${options.timeout}ms)`));
      }, options.timeout);
    }
    
    pythonProcess.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Python 脚本执行失败 (退出代码: ${code})\n${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new Error(`无法启动 Python 进程: ${error.message}`));
    });
  });
}

/**
 * 运行 Python 脚本（同步版本）
 * @param {string} scriptPath - Python 脚本路径
 * @param {Array<string>} args - 参数
 * @param {Object} options - 选项
 * @returns {{stdout: string, stderr: string, code: number}}
 */
function runPythonScriptSync(scriptPath, args = [], options = {}) {
  const { spawnSync } = require('child_process');
  const python = getPythonInterpreter();
  const fullScriptPath = path.isAbsolute(scriptPath) 
    ? scriptPath 
    : path.join(__dirname, '..', scriptPath);
  
  const venvPath = getPythonVenvPath();
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    ...(venvPath ? { VIRTUAL_ENV: venvPath } : {}),
    ...(options.env || {})
  };
  
  const cwd = options.cwd || path.dirname(fullScriptPath);
  
  const result = spawnSync(python, [fullScriptPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: options.timeout
  });
  
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status || 0,
    error: result.error
  };
}

/**
 * 执行 Python 代码字符串（使用 -c 参数）
 * @param {string} code - Python 代码
 * @param {Object} options - 选项
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runPythonCode(code, options = {}) {
  return new Promise((resolve, reject) => {
    const python = getPythonInterpreter();
    const venvPath = getPythonVenvPath();
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      ...(venvPath ? { VIRTUAL_ENV: venvPath } : {}),
      ...(options.env || {})
    };
    
    const pythonProcess = spawn(python, ['-c', code], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Python 代码执行失败 (退出代码: ${code})\n${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(new Error(`无法启动 Python 进程: ${error.message}`));
    });
  });
}

module.exports = {
  runPythonScript,
  runPythonScriptSync,
  runPythonCode,
  getPythonInterpreter,
  getPythonVenvPath
};
