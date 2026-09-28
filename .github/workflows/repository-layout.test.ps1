$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$safeRepoRoot = $repoRoot -replace '\\', '/'
$failures = [System.Collections.Generic.List[string]]::new()
$skips = [System.Collections.Generic.List[string]]::new()

function Assert-Condition([bool]$condition, [string]$message) {
    if (-not $condition) {
        $script:failures.Add($message)
    }
}

function Invoke-Git([string[]]$arguments) {
    $output = & git -c "safe.directory=$safeRepoRoot" -C $repoRoot @arguments 2>$null
    return @{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

function Get-ComposeConfig([string[]]$composeFiles, [string[]]$profiles = @()) {
    $arguments = @("compose", "--project-directory", $repoRoot)
    foreach ($profile in $profiles) {
        $arguments += @("--profile", $profile)
    }
    foreach ($composeFile in $composeFiles) {
        $arguments += @("-f", (Join-Path $repoRoot $composeFile))
    }
    $arguments += @("config", "--format", "json")

    $requiredEnvironment = @{
        JWT_SECRET = "layout-test-jwt"
        REFRESH_TOKEN_SECRET = "layout-test-refresh"
        INVITE_TOKEN_SECRET = "layout-test-invite"
        MESSAGE_ENCRYPTION_KEY = "layout-test-encryption-key"
        MINIO_ACCESS_KEY = "layout-test-access"
        MINIO_SECRET_KEY = "layout-test-secret"
        MINIO_ROOT_USER = "layout-test-root"
        MINIO_ROOT_PASSWORD = "layout-test-root-password"
        TURN_USERNAME = "layout-test-turn"
        TURN_PASSWORD = "layout-test-turn-password"
        TURN_REALM = "layout.test"
    }
    $previousEnvironment = @{}
    foreach ($name in $requiredEnvironment.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        [Environment]::SetEnvironmentVariable($name, $requiredEnvironment[$name], "Process")
    }

    try {
        $output = & docker @arguments 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }
        return ($output -join "`n") | ConvertFrom-Json -AsHashtable
    } catch {
        return $null
    } finally {
        foreach ($name in $requiredEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
        }
    }
}

function Assert-BuildContext($compose, [string]$service, [string]$expectedPath) {
    if ($null -eq $compose -or -not $compose.services.ContainsKey($service)) {
        Assert-Condition $false "Compose service '$service' must exist and resolve."
        return
    }
    $actual = $compose.services[$service].build.context
    Assert-Condition ($actual -eq (Join-Path $repoRoot $expectedPath)) "Compose service '$service' must build from the intended repository directory."
}

function Assert-VolumeSource($compose, [string]$service, [string]$expectedPath) {
    if ($null -eq $compose -or -not $compose.services.ContainsKey($service)) {
        Assert-Condition $false "Compose service '$service' must exist and resolve."
        return
    }
    $mount = @($compose.services[$service].volumes | Where-Object { $_.type -eq "bind" -and $_.target -eq "/etc/caddy/Caddyfile" }) | Select-Object -First 1
    Assert-Condition ($null -ne $mount -and $mount.source -eq (Join-Path $repoRoot $expectedPath)) "Service '$service' must mount the expected Caddy configuration file."
}

# Compose documents stay grouped under deploy/compose. Always resolve paths
# from the repository root so moving the YAML files does not change bind mounts
# or build contexts.
$composePaths = @(
    "deploy/compose/production-bluegreen.yml",
    "deploy/compose/production-multiserver.yml",
    "deploy/compose/external-overlay.yml",
    "deploy/compose/dev.yml",
    "deploy/compose/stage.yml"
)
foreach ($path in $composePaths) {
    Assert-Condition (Test-Path (Join-Path $repoRoot $path) -PathType Leaf) "Expected Compose configuration '$path' to exist."
}

$bluegreen = Get-ComposeConfig @("deploy/compose/production-bluegreen.yml")
$multiserver = Get-ComposeConfig @("deploy/compose/production-multiserver.yml")
$external = Get-ComposeConfig @("deploy/compose/production-bluegreen.yml", "deploy/compose/external-overlay.yml") @("bundled-infra")
$dev = Get-ComposeConfig @("deploy/compose/dev.yml")
$stage = Get-ComposeConfig @("deploy/compose/stage.yml")

foreach ($service in @("postgres", "backend-migrate", "backend-blue", "frontend", "caddy")) {
    Assert-Condition ($null -ne $bluegreen -and $bluegreen.services.ContainsKey($service)) "Blue/green production Compose must contain service '$service'."
}
foreach ($service in @("postgres", "orchestrator", "frontend", "caddy")) {
    Assert-Condition ($null -ne $multiserver -and $multiserver.services.ContainsKey($service)) "Multiserver production Compose must contain service '$service'."
}
foreach ($service in @("backend-blue", "postgres", "redis", "minio")) {
    Assert-Condition ($null -ne $external -and $external.services.ContainsKey($service)) "External-infrastructure overlay must retain service '$service' in the combined configuration."
}
foreach ($service in @("backend", "frontend", "caddy")) {
    Assert-Condition ($null -ne $dev -and $dev.services.ContainsKey($service)) "Development Compose must contain service '$service'."
    Assert-Condition ($null -ne $stage -and $stage.services.ContainsKey($service)) "Staging Compose must contain service '$service'."
}

Assert-BuildContext $bluegreen "backend-migrate" "backend"
Assert-BuildContext $bluegreen "backend-blue" "backend"
Assert-BuildContext $bluegreen "frontend" "frontend"
Assert-BuildContext $multiserver "orchestrator" "backend"
Assert-BuildContext $multiserver "frontend" "frontend"
Assert-BuildContext $dev "backend" "backend"
Assert-BuildContext $dev "frontend" "frontend"
Assert-BuildContext $stage "backend" "backend"
Assert-BuildContext $stage "frontend" "frontend"

if ($null -ne $multiserver -and $multiserver.services.ContainsKey("orchestrator")) {
    $orchestratorDockerfile = $multiserver.services.orchestrator.build.dockerfile
    Assert-Condition ($orchestratorDockerfile -eq "Dockerfile.orchestrator") "Orchestrator must use its Dockerfile inside the backend-only build context."
    Assert-Condition (Test-Path (Join-Path $repoRoot "backend/Dockerfile.orchestrator") -PathType Leaf) "Orchestrator Dockerfile must live under backend/."
}

Assert-VolumeSource $bluegreen "caddy" "deploy/caddy/Caddyfile"
Assert-VolumeSource $multiserver "caddy" "deploy/caddy/Caddyfile"
Assert-VolumeSource $dev "caddy" "deploy/caddy/Caddyfile.internal"
Assert-VolumeSource $stage "caddy" "deploy/caddy/Caddyfile.internal"
Assert-Condition (Test-Path (Join-Path $repoRoot "deploy/livekit.yaml") -PathType Leaf) "The LiveKit configuration must remain available at its deploy path."

# Deployment consumers must reference relocated files, never legacy root paths.
# Match root-level basenames (or explicit ./../ prefixes), while allowing the
# same basenames when qualified by their new directory, e.g. deploy/caddy/.
$legacyRootPath = '(?m)(?:^|[^A-Za-z0-9_/-])(?:\.\.?/)?(?:docker-compose(?:\.(?:master|external|dev|stage))?\.yml|Dockerfile\.orchestrator|Caddyfile(?:\.internal)?)(?=$|[^A-Za-z0-9_.-])'
$scanRoots = @(".github/workflows", "scripts", "frontend")
$scanFiles = foreach ($relativeRoot in $scanRoots) {
    $directory = Join-Path $repoRoot $relativeRoot
    if (Test-Path $directory -PathType Container) {
        Get-ChildItem $directory -File -Recurse | Where-Object { $_.Name -ne "repository-layout.test.ps1" }
    }
}
foreach ($file in $scanFiles) {
    $content = Get-Content -Raw $file.FullName
    if ($content -cmatch $legacyRootPath) {
        $failures.Add("Deployment consumer '$($file.FullName.Substring($repoRoot.Length + 1))' still references a legacy root path.")
    }
}
# README is maintained on the target branch and can include historical or
# development references; keep it verbatim while checking executable consumers.

# Development-only instructions and nested worktree gitlinks are not part of
# the shared repository. These checks inspect the index without changing it.
foreach ($path in @("AGENTS.md", ".cursor/rules/tdd-orchestration.mdc")) {
    $tracked = Invoke-Git @("ls-files", "--error-unmatch", $path)
    Assert-Condition ($tracked.ExitCode -eq 1) "Development-only path '$path' must not be tracked."
    $ignored = Invoke-Git @("check-ignore", "--no-index", "-v", $path)
    $positiveSharedIgnoreRule = $ignored.Output -match '(?m)(?:^|[/\\])\.gitignore:\d+:(?!\!)/?(?:AGENTS\.md|\.cursor(?:/.*)?)(?:\t|$)'
    Assert-Condition ($ignored.ExitCode -eq 0 -and $positiveSharedIgnoreRule) "Development-only path '$path' must be ignored by a positive rule in the repository .gitignore."
}
$worktreeGitlinks = Invoke-Git @("ls-files", "--stage", ".worktrees")
Assert-Condition ([string]::IsNullOrWhiteSpace($worktreeGitlinks.Output)) "Nested .worktrees gitlinks must not be tracked."
$cleanInputTracked = Invoke-Git @("ls-files", "--error-unmatch", "clean_input.txt")
Assert-Condition ($cleanInputTracked.ExitCode -eq 1) "The local copied-input file must not be tracked."
$cleanInputIgnored = Invoke-Git @("check-ignore", "--no-index", "-v", "clean_input.txt")
$positiveCleanInputIgnoreRule = $cleanInputIgnored.Output -match '(?m)(?:^|[/\\])\.gitignore:\d+:(?!\!)/?clean_input\.txt(?:\t|$)'
Assert-Condition ($cleanInputIgnored.ExitCode -eq 0 -and $positiveCleanInputIgnoreRule) "The local copied-input file must be covered by a positive rule in the repository .gitignore."
$worktreesIgnored = Invoke-Git @("check-ignore", "--no-index", "-v", ".worktrees/chat-popup-clean")
$positiveWorktreesIgnoreRule = $worktreesIgnored.Output -match '(?m)(?:^|[/\\])\.gitignore:\d+:(?!\!)/?\.worktrees/?(?:\t|$)'
Assert-Condition ($worktreesIgnored.ExitCode -eq 0 -and $positiveWorktreesIgnoreRule) "The .worktrees directory must be covered by a positive rule in the repository .gitignore."

# The dev/stage rsync deployment must not copy ignored, repository-local agent
# instructions or nested working copies to the environment hosts.
$environmentDeployScript = Get-Content -Raw (Join-Path $repoRoot "scripts/deploy-environment.sh")
foreach ($exclude in @("AGENTS.md", ".cursor/", ".worktrees/")) {
    Assert-Condition ($environmentDeployScript.Contains("--exclude '$exclude'")) "scripts/deploy-environment.sh must exclude '$exclude' from rsync uploads."
}
foreach ($exclude in @(".env", "uploads/", "logs/")) {
    Assert-Condition ($environmentDeployScript.Contains("--exclude '$exclude'")) "scripts/deploy-environment.sh must exclude '$exclude' from rsync uploads."
}
Assert-Condition ($environmentDeployScript.Contains("rsync -az --delete")) "Environment deployment must use rsync --delete."
Assert-Condition ($environmentDeployScript -notmatch '--delete-excluded') "Environment deployment must not use rsync --delete-excluded, which would remove excluded host data."

# Exercise rsync's actual --delete behavior with the deployment's extracted
# exclude patterns. Excluded host-only data should survive, while ordinary
# stale files should still be removed. Skip explicitly where rsync is absent.
$rsyncCommand = Get-Command rsync -ErrorAction SilentlyContinue
if ($null -eq $rsyncCommand) {
    $skips.Add("rsync exclude/delete fixture: rsync executable is unavailable.")
} else {
    $fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("stovo-rsync-layout-" + [Guid]::NewGuid().ToString("N"))
    $sourceRoot = Join-Path $fixtureRoot "source"
    $destinationRoot = Join-Path $fixtureRoot "destination"
    try {
        New-Item -ItemType Directory -Path $sourceRoot, $destinationRoot -Force | Out-Null
        Set-Content -NoNewline (Join-Path $sourceRoot "included.txt") "source version"
        Set-Content -NoNewline (Join-Path $destinationRoot "included.txt") "stale version"
        Set-Content -NoNewline (Join-Path $destinationRoot "stale.txt") "remove me"

        foreach ($entry in @("AGENTS.md", ".env")) {
            Set-Content -NoNewline (Join-Path $sourceRoot $entry) "source version"
            Set-Content -NoNewline (Join-Path $destinationRoot $entry) "destination data"
        }
        foreach ($directory in @(".cursor", ".worktrees", "uploads", "logs")) {
            $sourceDirectory = Join-Path $sourceRoot $directory
            $destinationDirectory = Join-Path $destinationRoot $directory
            New-Item -ItemType Directory -Path $sourceDirectory, $destinationDirectory -Force | Out-Null
            Set-Content -NoNewline (Join-Path $sourceDirectory "fixture.txt") "source version"
            Set-Content -NoNewline (Join-Path $destinationDirectory "fixture.txt") "destination data"
        }

        $excludeArguments = [System.Collections.Generic.List[string]]::new()
        $excludeMatches = [regex]::Matches($environmentDeployScript, '--exclude\s+[''\"]([^''\"]+)[''\"]')
        foreach ($match in $excludeMatches) {
            $excludeArguments.Add("--exclude")
            $excludeArguments.Add($match.Groups[1].Value)
        }
        $rsyncArguments = @("-a", "--delete") + $excludeArguments.ToArray() + @("$sourceRoot/", "$destinationRoot/")
        & $rsyncCommand.Source @rsyncArguments 2>$null
        Assert-Condition ($LASTEXITCODE -eq 0) "rsync --delete fixture must complete successfully."
        Assert-Condition ((Get-Content -Raw (Join-Path $destinationRoot "included.txt")) -eq "source version") "rsync fixture must copy included source files."
        Assert-Condition (-not (Test-Path (Join-Path $destinationRoot "stale.txt"))) "rsync --delete must remove stale, non-excluded destination files."
        foreach ($entry in @("AGENTS.md", ".cursor/fixture.txt", ".worktrees/fixture.txt", ".env", "uploads/fixture.txt", "logs/fixture.txt")) {
            $destinationEntry = Join-Path $destinationRoot $entry
            Assert-Condition ((Test-Path $destinationEntry -PathType Leaf) -and (Get-Content -Raw $destinationEntry) -eq "destination data") "rsync --delete must preserve excluded destination data at '$entry'."
        }
    } catch {
        $failures.Add("rsync exclude/delete fixture could not complete: $($_.Exception.Message)")
    } finally {
        if (Test-Path $fixtureRoot) {
            Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
        }
    }
}

# The architecture baseline and layout test must stay wired into the shared
# repository tooling and CI workflow after the moves.
$preCommitPath = Join-Path $repoRoot ".githooks/pre-commit"
$preCommitContent = if (Test-Path $preCommitPath -PathType Leaf) { Get-Content -Raw $preCommitPath } else { "" }
Assert-Condition ($preCommitContent.Contains("docs/engineering/size-baseline.tsv")) ".githooks/pre-commit must reference docs/engineering/size-baseline.tsv."
$hookFiles = if (Test-Path (Join-Path $repoRoot ".githooks") -PathType Container) { Get-ChildItem (Join-Path $repoRoot ".githooks") -File -Recurse } else { @() }
foreach ($hookFile in $hookFiles) {
    Assert-Condition (-not ((Get-Content -Raw $hookFile.FullName) -cmatch '\.architecture/size-baseline\.tsv')) ".githooks must not retain the old .architecture/size-baseline.tsv path."
}
$pipelinePath = Join-Path $repoRoot ".github/workflows/pipeline.yml"
$pipelineContent = if (Test-Path $pipelinePath -PathType Leaf) { Get-Content -Raw $pipelinePath } else { "" }
Assert-Condition ($pipelineContent -cmatch '(?m)^\s*(?:pwsh|powershell)(?:\.exe)?\b[^\r\n]*repository-layout\.test\.ps1\b') ".github/workflows/pipeline.yml must execute repository-layout.test.ps1."

# The baseline is a team engineering artifact and must retain its bytes at its
# documentation destination; the copied local input is deliberately not read.
$baselinePath = Join-Path $repoRoot "docs/engineering/size-baseline.tsv"
Assert-Condition (Test-Path $baselinePath -PathType Leaf) "The tracked size baseline must move to docs/engineering/."
if (Test-Path $baselinePath -PathType Leaf) {
    $baselineHash = (Get-FileHash $baselinePath -Algorithm SHA256).Hash
    Assert-Condition ($baselineHash -eq "B9D9E3ECDDCFABDD7F2BA6C1C6C61810DCE64C9327171ACC2AD19B592CC57ADC") "The size baseline contents must remain unchanged during reorganization."
}

foreach ($skip in $skips) {
    Write-Output "SKIP: $skip"
}
if ($failures.Count -gt 0) {
    throw ("Repository layout checks failed ({0}):`n - {1}" -f $failures.Count, ($failures -join "`n - "))
}

Write-Output "Repository layout checks passed."
