#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Python Worker 示例脚本
使用 PM2 管理时，此脚本会在虚拟环境中运行
"""

import time
import sys
import os
import signal

# 设置信号处理，优雅退出
def signal_handler(sig, frame):
    """处理退出信号"""
    print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] 收到停止信号，正在退出...")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def main():
    """主函数"""
    print("=" * 60)
    print("Python Worker 启动成功")
    print("=" * 60)
    print(f"Python 版本: {sys.version}")
    print(f"Python 可执行文件: {sys.executable}")
    print(f"虚拟环境: {os.environ.get('VIRTUAL_ENV', '未设置')}")
    print(f"工作目录: {os.getcwd()}")
    print(f"进程 ID: {os.getpid()}")
    print("=" * 60)
    
    try:
        counter = 0
        while True:
            counter += 1
            timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
            print(f"[{timestamp}] Worker 运行中... (第 {counter} 次循环)")
            
            # 在这里添加你的业务逻辑
            # 例如：处理任务、调用 API、更新数据库等
            
            time.sleep(10)  # 每 10 秒执行一次
            
    except KeyboardInterrupt:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] 收到键盘中断，正在退出...")
        sys.exit(0)
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
