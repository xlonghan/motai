@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.14 或更新的稳定版。
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo 正在准备墨台，首次运行需要下载依赖。
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto failed
  call npm.cmd run build
  if errorlevel 1 goto failed
)
echo.
echo 启动后请在浏览器打开 http://127.0.0.1:4318/
echo 请保留此窗口；关闭窗口将停止本地服务。
echo.
node scripts\serve.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo 启动失败，请查看上方的错误信息。
pause
