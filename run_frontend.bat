@echo off
cd /d %~dp0\frontend
if not exist node_modules (
  echo Installing frontend dependencies for first run...
  call npm install
  if errorlevel 1 (
    echo Frontend dependency installation failed. Check network access and npm output above.
    pause
    exit /b 1
  )
)
call npm run dev
