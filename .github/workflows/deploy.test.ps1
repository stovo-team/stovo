$workflow = Get-Content -Raw (Join-Path $PSScriptRoot "deploy.yml")
$resetIndex = $workflow.IndexOf("git reset --hard origin/master")
$ownershipIndex = $workflow.IndexOf('sudo chown -R "$(id -u):$(id -g)" uploads')

if ($resetIndex -lt 0 -or $ownershipIndex -lt 0 -or $ownershipIndex -gt $resetIndex) {
    throw "The deployment user must own uploads before Git resets the working tree."
}

if ($workflow -notmatch 'ensure_env\(\) \{' -or
    $workflow -notmatch 'MINIO_ROOT_PASSWORD' -or
    $workflow -notmatch 'MINIO_SECRET_KEY') {
    throw "Deployment must initialize missing MinIO credentials before Docker Compose runs."
}

if ($workflow -match '(?m)^\s*sudo docker compose down\s*$') {
    throw "Deployment must not run a full 'docker compose down' (blue/green keeps shared deps up)."
}

if ($workflow -notmatch 'ACTIVE_BACKEND' -or
    $workflow -notmatch 'backend-blue' -or
    $workflow -notmatch 'backend-green' -or
    $workflow -notmatch 'docker compose up -d --build --no-deps') {
    throw "Deployment must perform blue/green cutover via ACTIVE_BACKEND and --no-deps backend builds."
}

if ($workflow -notmatch 'api/health' -or
    $workflow -notmatch 'docker compose logs --tail=100') {
    throw "Deployment must check the health endpoint and print startup logs on failure."
}

if ($workflow -notmatch 'uploads logs') {
    throw "Deployment must grant the backend user access to both local storage and logs."
}

if ($workflow -notmatch 'sudo install -d -m 0750 -o 100 -g 100 uploads logs' -or
    $workflow -notmatch 'sudo chown -R 100:100 uploads logs') {
    throw "Deployment must grant the Alpine backend user (UID/GID 100) access to local storage and logs."
}
