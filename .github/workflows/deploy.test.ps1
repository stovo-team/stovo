$workflow = Get-Content -Raw (Join-Path $PSScriptRoot "deploy.yml")

if ($workflow -notmatch 'APP_DOMAIN' -or
    $workflow -notmatch 'https://\$app_domain/' -or
    $workflow -notmatch '--resolve "\$app_domain:443:127\.0\.0\.1"') {
    throw "Deployment must verify the public HTTPS listener after starting Caddy."
}

if ($workflow -notmatch 'ensure_env\(\) \{' -or
    $workflow -notmatch 'MINIO_ROOT_PASSWORD' -or
    $workflow -notmatch 'MINIO_SECRET_KEY') {
    throw "Deployment must initialize missing MinIO credentials before Docker Compose runs."
}

if ($workflow -match '(?m)^\s*sudo docker compose(?:\s+-f\s+\S+)? down\s*$') {
    throw "Deployment must not tear down the full production stack."
}

if ($workflow -notmatch 'docker-compose\.master\.yml' -or
    $workflow -notmatch 'up -d --build frontend orchestrator caddy coturn' -or
    $workflow -notmatch 'docker build -t stovo-backend ./backend') {
    throw "Deployment must start the master gateway and build the tenant backend image."
}

if ($workflow -notmatch '--filter label=stovo-server' -or
    $workflow -notmatch '--network stovo_default') {
    throw "Deployment must update tenant containers on the shared Stovo network."
}

if ($workflow -notmatch 'Refusing to redeploy.*MinIO bucket' -or
    $workflow -notmatch 'mc stat "local/stovo-\$1"') {
    throw "Deployment must refuse to restart a tenant whose MinIO bucket is missing."
}

if ($workflow -notmatch 'active_file_count=' -or
    $workflow -notmatch 'object_count=' -or
    $workflow -notmatch 'WARNING: MinIO has \$object_count objects but the database has \$active_file_count active files' -or
    $workflow -notmatch 'Deploying backend; restore or reconcile missing media separately') {
    throw "Deployment must warn about a MinIO/database mismatch while allowing a backend rollout."
}

if ($workflow -notmatch 'migrations/master') {
    throw "Deployment must apply master database migrations."
}
