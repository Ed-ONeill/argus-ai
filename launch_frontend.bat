@echo off
echo Starting Argus AI API (FastAPI)...
start "Argus API" cmd /k "cd /d %~dp0 && python -m uvicorn api.main:app --reload --port 8000"

echo Starting Argus AI Frontend (Next.js)...
start "Argus Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo API:      http://localhost:8000
echo Frontend: http://localhost:3000
echo API docs: http://localhost:8000/docs
