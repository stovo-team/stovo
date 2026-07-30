$caddyfile = Get-Content -Raw (Join-Path $PSScriptRoot "Caddyfile")

if ($caddyfile -notmatch 'Content-Security-Policy\s+"upgrade-insecure-requests"') {
    throw "Caddy must upgrade insecure subresource requests to HTTPS."
}

if ($caddyfile -notmatch 'Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"') {
    throw "Caddy must advertise HSTS for HTTPS origins."
}
