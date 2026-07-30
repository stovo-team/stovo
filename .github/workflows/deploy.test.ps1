$workflow = Get-Content -Raw (Join-Path $PSScriptRoot "deploy.yml")
$resetIndex = $workflow.IndexOf("git reset --hard origin/master")
$ownershipIndex = $workflow.IndexOf('sudo chown -R "$(id -u):$(id -g)" uploads')

if ($resetIndex -lt 0 -or $ownershipIndex -lt 0 -or $ownershipIndex -gt $resetIndex) {
    throw "The deployment user must own uploads before Git resets the working tree."
}
