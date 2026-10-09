@echo off
setlocal
cd /d %~dp0

echo ==================================================
echo AeroQ - Windows setup
echo ==================================================

if not exist venv\Scripts\python.exe (
  echo Creating Python virtual environment...
  py -3.13 -m venv venv
  if errorlevel 1 goto fail
)

call venv\Scripts\activate.bat
python -m pip install --upgrade pip
if errorlevel 1 goto fail
python -m pip install -r requirements.txt
if errorlevel 1 goto fail

echo Installing frontend dependencies...
cd /d %~dp0\frontend
call npm install
if errorlevel 1 goto fail

cd /d %~dp0
echo.
echo Setup finished. Start run_backend.bat and run_frontend.bat in two terminals/windows.
pause
exit /b 0

:fail
echo.
echo Setup did not complete. Review the first error above and resolve it before running AeroQ.
pause
exit /b 1
