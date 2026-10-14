# OpenLogBook Local Development Launcher
$root = $PSScriptRoot
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✈️  Starting OpenLogBook Development Server" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Start Backend FastAPI
Write-Host "Starting Python FastAPI Backend on http://localhost:8000..." -ForegroundColor Yellow
$backendCmd = "Set-Location '$root\backend'; & '$root\venv\Scripts\uvicorn.exe' app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# 2. Start Frontend Vite PWA
Write-Host "Starting Frontend PWA on http://localhost:3000..." -ForegroundColor Yellow
$frontendCmd = "Set-Location '$root\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host "`nBoth services launched!" -ForegroundColor Green
Write-Host "Open your browser at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Swagger documentation: http://localhost:8000/api/v1/docs" -ForegroundColor Cyan
