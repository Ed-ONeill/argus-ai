@echo off
REM  Atlas Web UI — launch the browser chat interface
REM  Double-click or run from command line.
REM  Options: launch_ui.bat --port 7861 --share

set PYTHONPATH=C:\Users\Edward\Documents\LLM_Assistant
cd /d C:\Users\Edward\Documents\LLM_Assistant

REM  Make sure Ollama is running
ollama list >nul 2>&1
if errorlevel 1 (
    echo Starting Ollama in background...
    start /B "" ollama serve
    timeout /t 4 /nobreak >nul
)

echo.
echo Starting Atlas Web UI...
echo Your browser will open automatically at http://127.0.0.1:7860
echo Press Ctrl+C to stop the server.
echo.

"C:\Users\Edward\AppData\Local\Programs\Python\Python312\python.exe" -m ui.chat_ui %*
