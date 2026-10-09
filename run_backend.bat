@echo off
cd /d %~dp0
if not exist venv\Scripts\python.exe (
  echo Python virtual environment not found.
  echo First run: py -3.13 -m venv venv
  echo Then activate and install dependencies with: python -m pip install -r requirements.txt
  pause
  exit /b 1
)
call venv\Scripts\activate.bat
python -m uvicorn backend.app.main:app --reload --port 8000
