param(
  [ValidateSet('start', 'stop')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptRoot 'backend'
$FrontendDir = Join-Path $ScriptRoot 'frontend'
$BackendEnvFile = Join-Path $BackendDir '.env'
$BackendEnvExample = Join-Path $BackendDir '.env.example'
$PidFile = Join-Path $ScriptRoot '.gestionstore-processes.json'

function Write-Info([string]$Message) {
  Write-Host "[INFO] $Message"
}

function Write-Ok([string]$Message) {
  Write-Host "[OK] $Message"
}

function Write-Warn([string]$Message) {
  Write-Warning $Message
}

function Test-Tool([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget([string]$PackageId, [string]$Label) {
  if (-not (Test-Tool 'winget')) {
    throw "winget n'est pas disponible pour installer automatiquement $Label."
  }

  Write-Info "Installation de $Label via winget..."
  & winget install --id $PackageId -e --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Echec installation $Label (winget code $LASTEXITCODE)."
  }
}

function Ensure-Prerequisites {
  if (-not (Test-Tool 'node')) {
    Install-WithWinget -PackageId 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS'
  }

  if (-not (Test-Tool 'npm')) {
    throw 'npm est introuvable meme apres installation de Node.js.'
  }

  if (-not (Test-Tool 'psql')) {
    Install-WithWinget -PackageId 'PostgreSQL.PostgreSQL' -Label 'PostgreSQL (psql)'
  }

  if (-not (Test-Tool 'psql')) {
    throw 'psql est introuvable. Verifiez PostgreSQL et redemarrez la session Windows.'
  }

  Write-Ok 'Prerequis verifies.'
}

function Ensure-EnvFile {
  if (-not (Test-Path -Path $BackendEnvFile)) {
    if (-not (Test-Path -Path $BackendEnvExample)) {
      throw "Fichier $BackendEnvFile absent et .env.example introuvable."
    }

    Copy-Item -Path $BackendEnvExample -Destination $BackendEnvFile
    Write-Ok 'backend/.env cree depuis .env.example'
  }
}

function Parse-DatabaseConfig {
  $line = Get-Content -Path $BackendEnvFile | Where-Object { $_ -match '^\s*DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) {
    throw 'DATABASE_URL introuvable dans backend/.env'
  }

  $value = $line.Substring($line.IndexOf('=') + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  try {
    $uri = [uri]$value
  } catch {
    throw 'DATABASE_URL invalide dans backend/.env'
  }

  $dbName = $uri.AbsolutePath.Trim('/').Split('?')[0]
  if ([string]::IsNullOrWhiteSpace($dbName)) {
    throw 'Nom de base invalide dans DATABASE_URL'
  }

  $userInfo = $uri.UserInfo.Split(':', 2)
  $dbUser = if ($userInfo.Length -ge 1) { $userInfo[0] } else { '' }
  $dbPass = if ($userInfo.Length -ge 2) { [uri]::UnescapeDataString($userInfo[1]) } else { '' }
  $dbHost = if ($uri.Host) { $uri.Host } else { 'localhost' }
  $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

  if ([string]::IsNullOrWhiteSpace($dbUser)) {
    throw 'Utilisateur PostgreSQL manquant dans DATABASE_URL'
  }

  return [ordered]@{
    Name = $dbName
    Host = $dbHost
    Port = $dbPort
    User = $dbUser
    Pass = $dbPass
  }
}

function Ensure-NodeModules {
  if (-not (Test-Path -Path (Join-Path $FrontendDir 'node_modules'))) {
    Write-Info 'Installation dependances frontend...'
    Push-Location $FrontendDir
    try {
      & npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install frontend echec ($LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
  }

  if (-not (Test-Path -Path (Join-Path $BackendDir 'node_modules'))) {
    Write-Info 'Installation dependances backend...'
    Push-Location $BackendDir
    try {
      & npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install backend echec ($LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
  }

  Write-Ok 'Dependances npm pretes.'
}

function Ensure-Database([hashtable]$Db) {
  $env:PGPASSWORD = $Db.Pass
  $query = "SELECT 1 FROM pg_database WHERE datname='$($Db.Name)';"
  $existsRaw = & psql -h $Db.Host -p $Db.Port -U $Db.User -d postgres -t -A -c $query 2>$null
  $exists = if ($existsRaw) { $existsRaw.Trim() } else { '' }

  if ($exists -ne '1') {
    Write-Info "Creation base '$($Db.Name)'..."
    $createSql = "CREATE DATABASE `"$($Db.Name)`";"
    & psql -h $Db.Host -p $Db.Port -U $Db.User -d postgres -v ON_ERROR_STOP=1 -c $createSql
    if ($LASTEXITCODE -ne 0) {
      throw "Creation base '$($Db.Name)' impossible"
    }
    Write-Ok "Base '$($Db.Name)' creee."
  } else {
    Write-Ok "Base '$($Db.Name)' deja presente."
  }
}

function Run-BackendCommand([string]$Executable, [string[]]$CommandArgs, [string]$Label) {
  Write-Info $Label
  Push-Location $BackendDir
  try {
    & $Executable @CommandArgs
    if ($LASTEXITCODE -ne 0) {
      throw "$Label echec (code $LASTEXITCODE)"
    }
  } finally {
    Pop-Location
  }
}

function Start-ServicesHidden {
  Write-Info 'Demarrage backend (mode cache)...'
  $backendProc = Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -ArgumentList @('/k', "cd /d `"$BackendDir`" && npm run dev") -PassThru

  Start-Sleep -Seconds 2

  Write-Info 'Seed de la base...'
  Run-BackendCommand -Executable 'npm' -CommandArgs @('run', 'db:seed') -Label 'npm run db:seed'

  Write-Info 'Demarrage frontend (mode cache)...'
  $frontendProc = Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -ArgumentList @('/k', "cd /d `"$FrontendDir`" && npm run dev -- --host 0.0.0.0") -PassThru

  $state = [ordered]@{
    backendCmdPid = $backendProc.Id
    frontendCmdPid = $frontendProc.Id
    startedAt = (Get-Date).ToString('o')
  }
  $state | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8

  Start-Sleep -Seconds 2
  Start-Process 'http://localhost:5173'

  Write-Ok 'Application lancee en mode cache.'
  Write-Host 'Frontend : http://localhost:5173'
  Write-Host 'Backend  : http://localhost:3001'
}

function Stop-Services {
  $stopped = $false

  if (Test-Path -Path $PidFile) {
    try {
      $state = Get-Content -Path $PidFile -Raw | ConvertFrom-Json
      foreach ($pid in @($state.backendCmdPid, $state.frontendCmdPid)) {
        if ($pid) {
          try {
            Stop-Process -Id ([int]$pid) -Force -ErrorAction Stop
            $stopped = $true
          } catch {
            # ignore already stopped
          }
        }
      }
    } catch {
      Write-Warn 'Fichier PID invalide, tentative d arret par recherche de processus.'
    }

    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
  }

  $fallback = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'cmd.exe' -or $_.Name -eq 'node.exe') -and
    ($_.CommandLine -like '*GestionStore_v1 - Client*' -or $_.CommandLine -like '*vite --host*' -or $_.CommandLine -like '*tsx watch src/index.ts*')
  }

  foreach ($proc in $fallback) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      $stopped = $true
    } catch {
      # ignore
    }
  }

  if ($stopped) {
    Write-Ok 'Services GestionStore arretes.'
  } else {
    Write-Info 'Aucun service GestionStore actif trouve.'
  }
}

try {
  if ($Action -eq 'stop') {
    Stop-Services
    exit 0
  }

  Ensure-Prerequisites
  Ensure-EnvFile
  Ensure-NodeModules

  $dbConfig = Parse-DatabaseConfig
  Ensure-Database -Db $dbConfig

  Run-BackendCommand -Executable 'npx' -CommandArgs @('prisma', 'db', 'push') -Label 'npx prisma db push'
  Start-ServicesHidden
  exit 0
} catch {
  Write-Error $_
  exit 1
}
