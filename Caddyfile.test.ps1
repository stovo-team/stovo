$caddyfile = Get-Content -Raw (Join-Path $PSScriptRoot "Caddyfile")

if ($caddyfile -notmatch 'upgrade-insecure-requests') {
    throw "Caddy must upgrade insecure subresource requests to HTTPS."
}

if ($caddyfile -notmatch 'block-all-mixed-content') {
    throw "Caddy must block mixed HTTP content on HTTPS pages."
}

if ($caddyfile -notmatch 'Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"') {
    throw "Caddy must advertise HSTS for HTTPS origins."
}
