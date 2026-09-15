$script = Get-Content -Raw (Join-Path $PSScriptRoot "deploy-environment.sh")

if ($script -notmatch 'set -euo pipefail') {
    throw "Environment deployments must stop immediately when a migration fails."
}

if ($script -notmatch 'up -d postgres' -or
    $script -notmatch 'pg_isready' -or
    $script -notmatch 'build backend' -or
    $script -notmatch 'atlas migrate apply --dir file:///app/migrations' -or
    $script -notmatch 'stovo-database-url') {
    throw "Environment deployments must build the current backend and apply Atlas migrations before starting it."
}

$migration = $script.IndexOf('atlas migrate apply --dir file:///app/migrations')
$startup = $script.IndexOf('up -d --build')
if ($migration -lt 0 -or $startup -lt 0 -or $migration -gt $startup) {
    throw "Atlas migrations must complete before the application stack starts."
}
