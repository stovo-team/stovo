$compose = Get-Content -Raw (Join-Path $PSScriptRoot "docker-compose.yml")

if ($compose -match './uploads:/app/uploads:ro') {
    throw "Local storage mode requires a writable uploads mount."
}

if ($compose -notmatch './logs:/app/logs') {
    throw "Local storage mode requires a writable log mount."
}

if ($compose -notmatch '(?s)caddy:.*?healthcheck:') {
    throw "Caddy must expose a health check so unhealthy proxies are detected."
}

if ($compose -notmatch 'http://(127\.0\.0\.1|localhost):2019/config/') {
    throw "Caddy health check must verify Caddy's responsive admin endpoint."
}
