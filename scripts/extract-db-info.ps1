param(
  [string]$EnvFile = "backend/.env"
)

if (-not (Test-Path -Path $EnvFile)) {
  exit 1
}

$line = Get-Content -Path $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
  exit 1
}

$url = $line.Substring($line.IndexOf('=') + 1).Trim()
if ($url.Length -ge 2 -and $url[0] -eq [char]34 -and $url[$url.Length - 1] -eq [char]34) {
  $url = $url.Substring(1, $url.Length - 2)
}

if (-not $url) {
  exit 1
}

try {
  $uri = [uri]$url
} catch {
  exit 1
}

$dbName = $uri.AbsolutePath.Trim('/').Split('?')[0]
$userInfo = $uri.UserInfo.Split(':', 2)
$dbUser = if ($userInfo.Length -gt 0) { $userInfo[0] } else { '' }
$dbPass = if ($userInfo.Length -gt 1) { [uri]::UnescapeDataString($userInfo[1]) } else { '' }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

Write-Output $dbName
Write-Output $dbHost
Write-Output $dbPort
Write-Output $dbUser
Write-Output $dbPass
