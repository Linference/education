# 启动 PoC（CodeMirror 6 中文输入法验证）
# 用法：在此文件上右键 →「使用 PowerShell 运行」
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$port = 5188
$bind = "127.0.0.1"
$url = "http://${bind}:$port"

Write-Host "== 格致 PoC · CodeMirror 6 中文输入法验证 ==" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
  Write-Host "[1/3] 首次运行，安装依赖（约 3 分钟）…" -ForegroundColor Yellow
  Push-Location $dir
  & npm install --no-audit --no-fund
  Pop-Location
} else {
  Write-Host "[1/3] 依赖已就绪" -ForegroundColor Green
}

Write-Host "[2/3] 启动本地开发服务器（端口 $port）…" -ForegroundColor Yellow
$job = Start-Job -ScriptBlock {
  param($d)
  Set-Location $d
  & npm run dev 2>&1
} -ArgumentList $dir

# 等待端口就绪
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 700
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Host "服务器启动失败，输出如下：" -ForegroundColor Red
  Receive-Job $job | Select-Object -Last 30
  exit 1
}
Write-Host "[3/3] 已就绪 → $url" -ForegroundColor Green

$chrome = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) { Start-Process $chrome -ArgumentList $url }
else { Start-Process $url }

Write-Host ""
Write-Host "请在打开的页面里按《测试清单.md》做 15–20 分钟手测。" -ForegroundColor Cyan
Write-Host "测完回到这个窗口按 Ctrl+C 结束服务器。" -ForegroundColor Cyan
Write-Host ""
try { while ($true) { Start-Sleep -Seconds 2 } }
finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  Write-Host "服务器已停止。" -ForegroundColor Yellow
}
