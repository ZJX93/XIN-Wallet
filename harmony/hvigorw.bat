@echo off
REM HarmonyOS 构建包装脚本（Windows）：调用全局 @ohos/hvigor。
setlocal
set BASE_DIR=%~dp0
for /f "delims=" %%i in ('npm root -g') do set GLOBAL=%%i\@ohos\hvigor\bin\hvigorw.js
if exist "%GLOBAL%" (
  node "%GLOBAL%" %*
) else (
  echo hvigor not found. Install with: npm install -g @ohos/hvigor
  exit /b 1
)
endlocal
