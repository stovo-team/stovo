param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Start')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$dockerCli = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $dockerCli) {
  $dockerCliDirectories = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin')
  )
  $dockerCliDirectory = $dockerCliDirectories | Where-Object { Test-Path (Join-Path $_ 'docker.exe') } | Select-Object -First 1
  if (-not $dockerCliDirectory) {
    throw 'Docker CLI was not found. Install Docker Desktop for the Windows runner account.'
  }
  Add-Content -Path $env:GITHUB_PATH -Value $dockerCliDirectory
  $env:PATH = "$dockerCliDirectory;$env:PATH"
}

docker desktop start --detach 2>$null | Out-Null
$desktopStartExitCode = $LASTEXITCODE
if ($desktopStartExitCode -ne 0) {
  $desktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
  )
  $dockerDesktop = $desktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $dockerDesktop) {
    throw 'Docker Desktop was not found. Install it for the Windows runner account.'
  }
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $dockerDesktop
  }
}

$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 3
  $ErrorActionPreference = 'Continue'
  $dockerOs = docker info --format '{{.OSType}}' 2>$null
  $dockerInfoExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($dockerInfoExitCode -eq 0) { break }
} while ((Get-Date) -lt $deadline)
if ($dockerInfoExitCode -ne 0) {
  throw 'Docker Desktop did not start within 3 minutes. Ensure the Windows runner account can access the Docker engine.'
}

if ($dockerOs -ne 'linux') {
  docker desktop engine use linux
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not switch Docker Desktop to Linux containers. Update Docker Desktop to a version with the desktop CLI and allow the runner account to switch engines.'
  }
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 3
    $ErrorActionPreference = 'Continue'
    $dockerOs = docker info --format '{{.OSType}}' 2>$null
    $dockerInfoExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($dockerInfoExitCode -eq 0 -and $dockerOs -eq 'linux') { break }
  } while ((Get-Date) -lt $deadline)
  if ($dockerInfoExitCode -ne 0 -or $dockerOs -ne 'linux') {
    throw 'Docker Desktop did not become ready with its Linux container engine within 3 minutes.'
  }
}

$suffix = "$env:GITHUB_RUN_ID-$env:GITHUB_RUN_ATTEMPT"
$postgresContainer = "stovo-test-postgres-$suffix"
$redisContainer = "stovo-test-redis-$suffix"
docker rm -f -v $postgresContainer $redisContainer 2>$null | Out-Null

docker run --detach --name $postgresContainer --publish 127.0.0.1::5432 `
  --env POSTGRES_USER=family_user `
  --env POSTGRES_PASSWORD=family_password `
  --env POSTGRES_DB=family_messenger_test `
  --health-cmd 'pg_isready -U family_user -d family_messenger_test' `
  --health-interval 5s --health-timeout 5s --health-retries 10 postgres:16
if ($LASTEXITCODE -ne 0) { throw 'Failed to start the PostgreSQL test container.' }

docker run --detach --name $redisContainer --publish 127.0.0.1::6379 `
  --health-cmd 'redis-cli ping' `
  --health-interval 5s --health-timeout 5s --health-retries 10 redis:7
if ($LASTEXITCODE -ne 0) { throw 'Failed to start the Redis test container.' }

foreach ($container in @($postgresContainer, $redisContainer)) {
  $deadline = (Get-Date).AddMinutes(2)
  do {
    $health = docker inspect --format '{{.State.Health.Status}}' $container 2>$null
    if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') { break }
    if ((Get-Date) -ge $deadline) {
      docker logs $container
      throw "Test container '$container' did not become healthy within 2 minutes."
    }
    Start-Sleep -Seconds 2
  } while ($true)
}

foreach ($shard in 0, 1, 2) {
  $database = "family_messenger_test_shard_$shard"
  docker exec $postgresContainer createdb -U family_user $database
  if ($LASTEXITCODE -ne 0) { throw "Failed to create PostgreSQL database '$database'." }
}

$postgresPortBinding = docker port $postgresContainer 5432/tcp
if ($LASTEXITCODE -ne 0) { throw 'Failed to resolve the PostgreSQL host port.' }
$postgresPortMatch = [regex]::Match([string]$postgresPortBinding, ':(\d+)$')
if (-not $postgresPortMatch.Success) { throw "Unexpected PostgreSQL host port binding: $postgresPortBinding" }
$redisPortBinding = docker port $redisContainer 6379/tcp
if ($LASTEXITCODE -ne 0) { throw 'Failed to resolve the Redis host port.' }
$redisPortMatch = [regex]::Match([string]$redisPortBinding, ':(\d+)$')
if (-not $redisPortMatch.Success) { throw "Unexpected Redis host port binding: $redisPortBinding" }

$machineName = (Get-CimInstance Win32_ComputerSystem).Name
Add-Content -Path $env:GITHUB_OUTPUT -Value "postgres_port=$($postgresPortMatch.Groups[1].Value)"
Add-Content -Path $env:GITHUB_OUTPUT -Value "redis_port=$($redisPortMatch.Groups[1].Value)"
Add-Content -Path $env:GITHUB_OUTPUT -Value "machine_name=$machineName"
