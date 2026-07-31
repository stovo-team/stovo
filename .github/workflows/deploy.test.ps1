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

if ($workflow -notmatch 'api/health' -or
    $workflow -notmatch 'docker compose logs --tail=100 backend caddy minio minio-init') {
    throw "Deployment must check the public health endpoint and print startup logs on failure."
}

if ($workflow -notmatch 'uploads logs') {
    throw "Deployment must grant the backend user access to both local storage and logs."
}

if ($workflow -notmatch 'sudo install -d -m 0750 -o 100 -g 100 uploads logs' -or
    $workflow -notmatch 'sudo chown -R 100:100 uploads logs') {
    throw "Deployment must grant the Alpine backend user (UID/GID 100) access to local storage and logs."
}
