# Windows installer entrypoint for meme-maker.

[CmdletBinding()]
param(
  [switch]$DepsOnly,
  [switch]$LinkOnly,
  [switch]$Doctor,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $HOME ".local\bin"

function Show-Help {
  @"
Usage:
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 [-DepsOnly|-LinkOnly|-Doctor|-Help]

Installs/checks the Windows-side tools needed by meme-maker and creates .cmd
shims in $BinDir for the Bash scripts.

Notes:
  - The media scripts are Bash scripts. The installer detects bash on PATH and
    in the standard Git for Windows locations.
  - Dependencies are installed with winget when it is available.
"@
}

function Has-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-BashPath {
  $command = Get-Command "bash" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in @(
    (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
    (Join-Path $env:ProgramFiles "Git\usr\bin\bash.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Git\bin\bash.exe")
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

$BashPath = Resolve-BashPath

function Warn([string]$Message) {
  Write-Warning $Message
}

function Install-WithWinget([string]$Id, [string]$Name) {
  if (-not (Has-Command "winget")) {
    Warn "winget is not available. Install $Name manually."
    return
  }

  Write-Host "Installing $Name with winget..."
  winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
}

function Run-Doctor {
  $issues = 0
  Write-Host ""
  Write-Host "meme-maker Windows Doctor"
  Write-Host "Repo: $RepoRoot"
  Write-Host ""

  if ($BashPath) {
    Write-Host "OK bash ($BashPath)"
  } else {
    Warn "bash is missing"
    $issues += 1
  }

  foreach ($cmd in @("yt-dlp", "ffmpeg", "ffprobe", "node", "npm")) {
    if (Has-Command $cmd) {
      Write-Host "OK $cmd"
    } else {
      Warn "$cmd is missing"
      $issues += 1
    }
  }

  foreach ($cmd in @("mememaker.cmd", "meme-convert.cmd", "audio_video.cmd", "audio-video.cmd", "combine_videos.cmd", "combine-videos.cmd", "build.cmd")) {
    $path = Join-Path $BinDir $cmd
    if (Test-Path $path) {
      Write-Host "OK $path"
    } else {
      Warn "$path is not linked"
      $issues += 1
    }
  }

  if ($issues -gt 0) {
    throw "$issues issue(s) found."
  }

  Write-Host "All checks passed."
}

function New-Shim([string]$Name, [string]$Script) {
  if (-not $BashPath) {
    throw "bash was not found. Install Git for Windows or make bash available on PATH."
  }
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $target = Join-Path $RepoRoot $Script
  $shim = Join-Path $BinDir "$Name.cmd"
  $content = "@echo off`r`n`"$BashPath`" `"$target`" %*`r`n"
  Set-Content -Path $shim -Value $content -Encoding ASCII
  Write-Host "linked $Name.cmd -> $target"
}

function Remove-StaleShim([string]$Name) {
  $shim = Join-Path $BinDir "$Name.cmd"
  if (Test-Path $shim) {
    Remove-Item -Force $shim
    Write-Host "removed stale $Name.cmd"
  }
}

if ($Help) {
  Show-Help
  exit 0
}

if ($Doctor) {
  Run-Doctor
  exit 0
}

if (-not $LinkOnly) {
  Install-WithWinget "yt-dlp.yt-dlp" "yt-dlp"
  Install-WithWinget "Gyan.FFmpeg" "ffmpeg"
  Install-WithWinget "OpenJS.NodeJS" "Node.js"
  Install-WithWinget "Git.Git" "Git for Windows"
}

if (-not $DepsOnly) {
  foreach ($stale in @("download", "text", "audio", "video", "music")) {
    Remove-StaleShim $stale
  }

  New-Shim "mememaker" "mememaker.sh"
  New-Shim "meme-convert" "convert.sh"
  New-Shim "audio_video" "audio_video.sh"
  New-Shim "audio-video" "audio_video.sh"
  New-Shim "combine_videos" "combine_videos.sh"
  New-Shim "combine-videos" "combine_videos.sh"
  New-Shim "build" "build.sh"
}

if (-not $LinkOnly -and (Has-Command "npm") -and (Test-Path (Join-Path $RepoRoot "package.json"))) {
  Push-Location $RepoRoot
  try {
    npm install
  } finally {
    Pop-Location
  }
}

Write-Host "Setup complete."
