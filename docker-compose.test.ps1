$compose = Get-Content -Raw (Join-Path $PSScriptRoot "docker-compose.yml")

if ($compose -match './uploads:/app/uploads:ro') {
    throw "Local storage mode requires a writable uploads mount."
}

if ($compose -notmatch './logs:/app/logs') {
    throw "Local storage mode requires a writable log mount."
}
