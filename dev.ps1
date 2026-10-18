# Starts the Flask API and the Next.js frontend, each in its own window.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python.exe app.py"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "API      http://127.0.0.1:5000/api/health"
Write-Host "Frontend http://localhost:3000"
Write-Host "Screen   http://localhost:3000/screen"
Write-Host "Staff    http://localhost:3000/staff"
