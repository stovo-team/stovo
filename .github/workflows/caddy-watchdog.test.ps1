$workflow = Get-Content -Raw (Join-Path $PSScriptRoot "caddy-watchdog.yml")

if ($workflow -notmatch "cron: '\*/5 \* \* \* \*'") {
    throw "The Caddy watchdog must check production HTTPS every five minutes."
}

if ($workflow -notmatch '--resolve "\$app_domain:443:127\.0\.0\.1"') {
    throw "The watchdog must probe Caddy's local TLS listener using the production hostname."
}

$bluegreenComposePrefix = "docker compose --project-directory . -f deploy/compose/production-bluegreen.yml"
if (-not $workflow.Contains("$bluegreenComposePrefix restart caddy") -or
    -not $workflow.Contains("$bluegreenComposePrefix ps") -or
    -not $workflow.Contains("$bluegreenComposePrefix logs --tail=150 caddy frontend backend-blue backend-green")) {
    throw "The blue/green watchdog restart and diagnostics must use the root project directory and production-bluegreen Compose file."
}

if ($workflow -match '(?m)^\s*sudo docker compose\s+(?:restart caddy|ps\b|logs\b)') {
    throw "Watchdog Compose restart and diagnostics commands must not omit their project directory and configuration file."
}
