<#
.SYNOPSIS
  Starts Verilo on this computer: Docker, the database, Ollama, the website and the pipeline.

.DESCRIPTION
  Safe to run again: anything already running is left alone. The website (http://localhost:3001)
  and the pipeline run in the background; their output goes to logs\web.log and logs\pipeline.log.

    .\start.ps1             start everything
    .\start.ps1 -Stop       stop the website and the pipeline (Docker and the database keep running)
    .\start.ps1 -AtLogin    also start Verilo whenever you sign in to Windows
    .\start.ps1 -NoLogin    stop starting it at sign-in
#>
param([switch]$Stop, [switch]$AtLogin, [switch]$NoLogin)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Logs = Join-Path $Root "logs"
$Web = Join-Path $Root "apps\web"
$Workers = Join-Path $Root "workers"
$StartupLink = Join-Path ([Environment]::GetFolderPath("Startup")) "Verilo.lnk"
New-Item -ItemType Directory -Force $Logs | Out-Null

function Say($text) { Write-Host "  $text" }

function Listening($port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# The processes this script starts, found by their command lines (so -Stop finds them too).
function WebProcess {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$Web*next*" -or $_.CommandLine -like "*next* dev --port 3001*" }
}
function PipelineProcess {
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like "*verilo_workers pipeline*" }
}

# A value from apps\web\.env.local (the secrets the pipeline shares with the website).
function EnvValue($name) {
  $line = Get-Content (Join-Path $Web ".env.local") -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if ($line) { $line.Substring($name.Length + 1) } else { "" }
}

if ($NoLogin) {
  Remove-Item $StartupLink -ErrorAction SilentlyContinue
  Say "Verilo won't start at sign-in any more."
  return
}

if ($Stop) {
  foreach ($p in @(PipelineProcess) + @(WebProcess)) {
    if ($p) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  Say "Stopped the website and the pipeline."
  return
}

if ($AtLogin) {
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($StartupLink)
  $link.TargetPath = "powershell.exe"
  $link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $link.WorkingDirectory = $Root
  $link.WindowStyle = 7
  $link.Save()
  Say "Verilo will start whenever you sign in to Windows (.\start.ps1 -NoLogin to undo)."
}

Write-Host "Starting Verilo"

# 1. Docker, which runs the database.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Say "Starting Docker Desktop..."
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  $deadline = (Get-Date).AddMinutes(4)
  do {
    Start-Sleep 3
    docker info *> $null
  } until ($LASTEXITCODE -eq 0 -or (Get-Date) -gt $deadline)
  if ($LASTEXITCODE -ne 0) { throw "Docker didn't start within 4 minutes." }
}
Say "Docker is running."

# 2. The database (Supabase).
if (-not (Listening 54322)) {
  Say "Starting the database..."
  Push-Location $Root
  try { npx supabase start *> (Join-Path $Logs "database.log") } finally { Pop-Location }
}
if (-not (Listening 54322)) { throw "The database didn't start: see logs\database.log." }
Say "The database is running."

# 3. Ollama, the local AI model for tags.
if (-not (Listening 11434)) {
  $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path $ollama) {
    Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
    Say "Started Ollama."
  } else {
    Say "Ollama isn't installed: tags will wait until it is."
  }
} else { Say "Ollama is running." }

# 4. The website.
if (-not (Listening 3001)) {
  Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -WorkingDirectory $Web `
    -ArgumentList "/c", "npm run dev > `"$Logs\web.log`" 2>&1"
  Say "Starting the website..."
  $deadline = (Get-Date).AddMinutes(2)
  while (-not (Listening 3001) -and (Get-Date) -lt $deadline) { Start-Sleep 2 }
}
if (Listening 3001) { Say "The website is at http://localhost:3001" } else {
  Say "The website hasn't answered yet: see logs\web.log."
}

# 5. The pipeline (news every minute, briefings every 15 minutes).
if (-not (PipelineProcess)) {
  $env:VERILO_REVALIDATE_SECRET = EnvValue "REVALIDATE_SECRET"
  $env:VERILO_BRIEFING_SECRET = EnvValue "BRIEFING_SECRET"
  $env:PYTHONIOENCODING = "utf-8"
  $env:PYTHONUNBUFFERED = "1"
  Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -WorkingDirectory $Workers `
    -ArgumentList "/c", ".venv\Scripts\python -m verilo_workers pipeline --loop >> `"$Logs\pipeline.log`" 2>&1"
  Say "Started the pipeline (logs\pipeline.log)."
} else { Say "The pipeline is running." }

Write-Host "Verilo is up. Stop it with .\start.ps1 -Stop"
