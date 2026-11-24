# Canon ローカル起動スクリプト (port 8010)
$port = 8010
$used = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($used) {
  Write-Host "Port $port is already in use."
  exit 1
}
Set-Location $PSScriptRoot
uvicorn main:app --host 127.0.0.1 --port $port
