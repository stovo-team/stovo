$workflow = Get-Content -Raw (Join-Path $PSScriptRoot "caddy-watchdog.yml")

if ($workflow -notmatch "cron: '\*/5 \* \* \* \*'") {
    throw "The Caddy watchdog must check production HTTPS every five minutes."
}

if ($workflow -notmatch '--resolve "\$app_domain:443:127\.0\.0\.1"') {
    throw "The watchdog must probe Caddy's local TLS listener using the production hostname."
}

if ($workflow -notmatch 'docker compose restart caddy') {
    throw "The watchdog must recover an unresponsive Caddy container."
}
