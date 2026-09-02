# Onside project runner
# Common entrypoints for the web app and the prediction pipeline.
#
# Usage:
#   .\run.ps1 web            Start the web dev server (Next.js) on :3000
#   .\run.ps1 pipeline       Run the full prediction pipeline
#   .\run.ps1 pipeline -skip-historical  Skip StatsBomb historical load
#   .\run.ps1 backtest       Run the backtest only
#   .\run.ps1 all            Start web dev server in background, then pipeline
#
# help (default) prints this message.

param(
    [Parameter(Position = 0)]
    [ValidateSet("web", "pipeline", "backtest", "all", "help")]
    [string]$Command = "help",

    [switch]$SkipHistorical,
    [switch]$SkipLive
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $Root "web"
$PipelineDir = Join-Path $Root "pipeline"
$Py = Join-Path $PipelineDir ".venv\Scripts\python.exe"

function Write-Step($Msg) {
    Write-Host ""
    Write-Host "==> $Msg" -ForegroundColor Cyan
}

function Test-DotenvFile {
    if (-not (Test-Path (Join-Path $WebDir ".env.local"))) {
        Write-Host "WARN: web/.env.local not found. Copy web/.env.local.example or set DATABASE_URL/JWT_SECRET." -ForegroundColor Yellow
    }
}

function Start-Web {
    Write-Step "Starting web dev server (http://localhost:3000)"
    if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
        Write-Host "  Installing web dependencies (npm install)..." -ForegroundColor DarkGray
        Push-Location $WebDir
        npm install
        Pop-Location
    }
    Push-Location $WebDir
    npm run dev
    Pop-Location
}

function Run-Pipeline {
    param([bool]$SkipHist, [bool]$SkipLiveFlag)
    if (-not (Test-Path $Py)) {
        Write-Host "ERROR: pipeline venv not found at $Py" -ForegroundColor Red
        Write-Host "  Create it:  py -m venv pipeline\.venv && pipeline\.venv\Scripts\pip install -r pipeline\requirements.txt"
        exit 1
    }
    Write-Step "Running prediction pipeline"
    $args = @()
    if ($SkipHist) { $args += "--skip-historical" }
    if ($SkipLiveFlag) { $args += "--skip-live" }
    Push-Location $PipelineDir
    & $Py "run_pipeline.py" @args
    Pop-Location
}

function Run-Backtest {
    if (-not (Test-Path $Py)) {
        Write-Host "ERROR: pipeline venv not found at $Py" -ForegroundColor Red
        exit 1
    }
    Write-Step "Running backtest"
    Push-Location $PipelineDir
    & $Py "run_pipeline.py" --backtest
    Pop-Location
}

function Show-Help {
    Get-Content $PSCommandPath | Where-Object { $_ -match "^# " } | ForEach-Object { $_ -replace "^# ?", "" }
}

# ---------------------------------------------------------------
Test-DotenvFile

switch ($Command) {
    "web"     { Start-Web }
    "pipeline" { Run-Pipeline -SkipHist $SkipHistorical -SkipLiveFlag $SkipLive }
    "backtest" { Run-Backtest }
    "all" {
        Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" -ArgumentList "run", "dev" `
            -WorkingDirectory $WebDir -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 4
        Write-Step "Web dev server launched in background on :3000"
        Run-Pipeline -SkipHist $SkipHistorical -SkipLiveFlag $SkipLive
    }
    default { Show-Help }
}
