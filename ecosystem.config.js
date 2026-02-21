const path = require('path');

// 检测项目内的 Python 虚拟环境路径
const pythonVenvPath = (() => {
  const possiblePaths = [
    path.join(__dirname, 'venv'),
    path.join(__dirname, 'env'),
    path.join(__dirname, '.venv'),
    path.join(__dirname, 'python', 'venv'),
  ];
  
  for (const venvPath of possiblePaths) {
    if (require('fs').existsSync(venvPath)) {
      return venvPath;
    }
  }
  return null;
})();

// 获取 Python 解释器路径
const getPythonInterpreter = () => {
  if (pythonVenvPath) {
    const isWindows = process.platform === 'win32';
    const pythonPath = isWindows 
      ? path.join(pythonVenvPath, 'Scripts', 'python.exe')
      : path.join(pythonVenvPath, 'bin', 'python');
    
    if (require('fs').existsSync(pythonPath)) {
      return pythonPath;
    }
  }
  return 'python3'; // 回退到系统 Python
};

module.exports = {
  apps: [
    {
      name: "boda",
      script: "./server.js",
      env: {
        TZ: "Africa/Cairo"
      }
    }
    // 注意：Python 脚本现在在 Node.js 进程中通过 utils/python-runner.js 调用
    // 不需要单独的 PM2 进程
    // 如果确实需要独立的 Python 进程，取消下面的注释：
    // ...(pythonVenvPath ? [{
    //   name: "boda-python-worker",
    //   interpreter: getPythonInterpreter(),
    //   script: "./scripts/python_worker.py",
    //   cwd: __dirname,
    //   env: {
    //     TZ: "Africa/Cairo",
    //     PYTHONUNBUFFERED: "1",
    //     VIRTUAL_ENV: pythonVenvPath
    //   },
    //   instances: 1,
    //   exec_mode: "fork",
    //   watch: false,
    //   max_memory_restart: "500M",
    //   error_file: "./logs/python-error.log",
    //   out_file: "./logs/python-out.log",
    //   log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    //   merge_logs: true,
    //   autorestart: true,
    //   max_restarts: 10,
    //   min_uptime: "10s"
    // }] : [])
  ]
}

