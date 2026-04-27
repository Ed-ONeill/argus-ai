# scripts/install_ollama.ps1
# Downloads and installs Ollama for Windows, then pulls the default model.
# Run once as administrator for system-wide install, or as your user for per-user.

param(
    [string]$Model = "llama3.2"
)

Write-Host "=== Ollama Installer ===" -ForegroundColor Cyan

# Check if already installed
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host "Ollama is already installed: $(ollama --version)" -ForegroundColor Green
} else {
    Write-Host "Downloading Ollama installer..." -ForegroundColor Yellow
    $installer = "$env:TEMP\OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $installer
    Write-Host "Running installer (follow any prompts)..."
    Start-Process -FilePath $installer -Wait
    Write-Host "Ollama installed." -ForegroundColor Green
}

# Start Ollama service in background
Write-Host "Starting Ollama service..." -ForegroundColor Yellow
Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 3

# Pull the model
Write-Host "Pulling model: $Model (this may take a few minutes)..." -ForegroundColor Yellow
ollama pull $Model

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Run your assistant:" -ForegroundColor Cyan
Write-Host "  cd C:\Users\Edward\Documents\LLM_Assistant"
Write-Host "  python -m app.inference"
