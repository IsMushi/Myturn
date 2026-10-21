# Starts the Flask API and the Next.js web app in this one terminal.
# The API is launched in the background of this same window, so its log lines
# and the web app's arrive together. Closing the window (or Ctrl+C) stops both.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$api = Start-Process -NoNewWindow -PassThru `
  -FilePath "$root\api\.venv\Scripts\python.exe" `
  -ArgumentList "app.py" `
  -WorkingDirectory "$root\api"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "API       http://127.0.0.1:5000/api/health"
Write-Host "Home      http://localhost:3000/"
Write-Host "Ticket    http://localhost:3000/ticket"
Write-Host "Display   http://localhost:3000/display"
Write-Host "Sign in   http://localhost:3000/auth/login"
Write-Host "Desk      http://localhost:3000/staff/dashboard"
Write-Host "Admin     http://localhost:3000/admin/dashboard"
Write-Host ""

Set-Location "$root\web"
try {
  npm run dev
} finally {
  # The web app has stopped, so take the API with it rather than leaving it
  # holding port 5000 behind the window. taskkill /T ends the whole tree: the
  # venv's python.exe launches the real interpreter as a child.
  if ($api -and -not $api.HasExited) {
    taskkill /PID $api.Id /T /F | Out-Null
  }
}
