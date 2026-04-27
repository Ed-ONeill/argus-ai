@echo off
REM  Atlas — Quick launcher
REM  Double-click this file or run it from the command prompt.

set PYTHONPATH=C:\Users\Edward\Documents\LLM_Assistant
cd /d C:\Users\Edward\Documents\LLM_Assistant

REM  Check Ollama is running; start it if not
ollama list >nul 2>&1
if errorlevel 1 (
    echo Starting Ollama in background...
    start /B "" ollama serve
    timeout /t 3 /nobreak >nul
)

echo.
echo Starting Atlas...
echo.
"C:\Users\Edward\AppData\Local\Programs\Python\Python312\python.exe" -m app.inference %*
