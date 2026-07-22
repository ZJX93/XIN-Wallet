# Docker Desktop 汉化 - 需管理员权限运行
$ErrorActionPreference = "Stop"

$tmpDir = "$env:TEMP\docker-cn"
$targetDir = "C:\Program Files\Docker\Docker\frontend"
$backupDir = "C:\Users\XIN\WorkBuddy\XIN-Wallet\docker-backup"

Write-Host "=== Docker Desktop 4.83.0 汉化 ===" -ForegroundColor Cyan

# 1. 备份原文件
Write-Host "[1/4] 备份原文件..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item "$targetDir\resources\app.asar" "$backupDir\app.asar.bak" -Force
Copy-Item "$targetDir\resources\app.asar.unpacked" "$backupDir\app.asar.unpacked.bak" -Force -Recurse
Copy-Item "$targetDir\Docker Desktop.exe" "$backupDir\Docker Desktop.exe.bak" -Force
Write-Host "  备份完成 -> $backupDir" -ForegroundColor Green

# 2. 删除旧的 app.asar.unpacked 目录
Write-Host "[2/4] 清理旧文件..." -ForegroundColor Yellow
if (Test-Path "$targetDir\resources\app.asar.unpacked") {
    Remove-Item "$targetDir\resources\app.asar.unpacked" -Recurse -Force
}

# 3. 复制汉化文件
Write-Host "[3/4] 安装汉化文件..." -ForegroundColor Yellow
Copy-Item "$tmpDir\app.asar" "$targetDir\resources\app.asar" -Force
Copy-Item "$tmpDir\app.asar.unpacked" "$targetDir\resources\app.asar.unpacked" -Recurse -Force
Copy-Item "$tmpDir\Docker Desktop.exe" "$targetDir\Docker Desktop.exe" -Force
Write-Host "  汉化文件安装完成" -ForegroundColor Green

# 4. 校验
Write-Host "[4/4] 校验..." -ForegroundColor Yellow
$asarOK = Test-Path "$targetDir\resources\app.asar"
$unpackedOK = Test-Path "$targetDir\resources\app.asar.unpacked\package.json"
$exeOK = Test-Path "$targetDir\Docker Desktop.exe"

if ($asarOK -and $unpackedOK -and $exeOK) {
    Write-Host "  ✅ 汉化成功！可以启动 Docker Desktop 了" -ForegroundColor Green
} else {
    Write-Host "  ❌ 校验失败，请检查" -ForegroundColor Red
    Write-Host "  app.asar: $asarOK"
    Write-Host "  app.asar.unpacked: $unpackedOK"
    Write-Host "  Docker Desktop.exe: $exeOK"
}

Write-Host ""
Write-Host "按任意键退出..." 
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
