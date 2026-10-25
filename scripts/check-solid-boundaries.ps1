param(
    [ValidateSet('all', 'backend', 'frontend')]
    [string]$Scope = 'all'
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

$limit = 400
$baselineMap = @{}
$baselineFile = Join-Path $repoRoot 'docs/engineering/size-baseline.tsv'

if (Test-Path -LiteralPath $baselineFile) {
    foreach ($line in Get-Content -LiteralPath $baselineFile) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $fields = $line -split "`t", 3
        $allowed = 0
        if ($fields.Length -ge 2 -and [int]::TryParse($fields[1].Trim(), [ref]$allowed)) {
            $baselineMap[$fields[0].Replace('\', '/')] = $allowed
        }
    }
}

function Get-RepositoryRelativePath {
    param([string]$Path)

    $repoRootPrefix = $repoRoot.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($repoRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$fullPath' is outside the repository root."
    }

    return $fullPath.Substring($repoRootPrefix.Length).Replace('\', '/')
}

function Get-ProductionFiles {
    param(
        [string]$Root,
        [string[]]$Extensions,
        [switch]$ExcludeTests,
        [switch]$ExcludeEnt
    )

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        return @()
    }

    $files = Get-ChildItem -LiteralPath $Root -File -Recurse | Where-Object {
        $isTestFile = $ExcludeTests -and ($_.Name.EndsWith('_test.go', [System.StringComparison]::Ordinal) -or $_.Name -cmatch '\.test\.')
        $relativePath = Get-RepositoryRelativePath $_.FullName
        $isEntFile = $ExcludeEnt -and $relativePath.StartsWith(
            'backend/internal/ent/', [System.StringComparison]::Ordinal)

        ($Extensions -ccontains $_.Extension) -and -not $isTestFile -and -not $isEntFile
    } | Sort-Object -Property FullName

    return @($files | ForEach-Object { $_.FullName })
}

function Assert-FileSizeBoundaries {
    param([string[]]$Files)

    foreach ($file in $Files) {
        $relativePath = Get-RepositoryRelativePath $file
        $contents = [System.IO.File]::ReadAllText($file)
        $lineCount = [System.Text.RegularExpressions.Regex]::Matches($contents, "`n").Count

        if ($lineCount -le $limit) {
            continue
        }

        if (-not $baselineMap.ContainsKey($relativePath)) {
            throw "$relativePath is $lineCount lines; new production files must be at most $limit lines. Run 'bash scripts/update-solid-baselines.sh' if intentional."
        }

        $allowed = [int]$baselineMap[$relativePath]
        if ($lineCount -gt $allowed) {
            throw "$relativePath grew from its $allowed-line migration baseline to $lineCount lines. Run 'bash scripts/update-solid-baselines.sh' if intentional."
        }
    }
}

function Assert-NoForbiddenImports {
    param(
        [string[]]$Files,
        [string]$Pattern,
        [string]$FailureMessage
    )

    $foundViolation = $false
    foreach ($file in $Files) {
        foreach ($match in (Select-String -LiteralPath $file -Pattern $Pattern -CaseSensitive)) {
            $relativePath = Get-RepositoryRelativePath $match.Path
            [System.Console]::Error.WriteLine('{0}:{1}:{2}', $relativePath, $match.LineNumber, $match.Line)
            $foundViolation = $true
        }
    }

    if ($foundViolation) {
        throw $FailureMessage
    }
}

try {
    if ($Scope -in @('all', 'backend')) {
        $backendFiles = Get-ProductionFiles `
            -Root (Join-Path $repoRoot 'backend/internal') `
            -Extensions @('.go') `
            -ExcludeTests `
            -ExcludeEnt
        Assert-FileSizeBoundaries -Files $backendFiles

        $domainFiles = Get-ProductionFiles `
            -Root (Join-Path $repoRoot 'backend/internal/domain') `
            -Extensions @('.go') `
            -ExcludeTests
        Assert-NoForbiddenImports `
            -Files $domainFiles `
            -Pattern 'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)' `
            -FailureMessage 'internal/domain imports an outer-layer package'

        $featureFiles = Get-ProductionFiles `
            -Root (Join-Path $repoRoot 'backend/internal/features') `
            -Extensions @('.go') `
            -ExcludeTests
        Assert-NoForbiddenImports `
            -Files $featureFiles `
            -Pattern 'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)|/(ent|redis|socketio)' `
            -FailureMessage 'a feature package imports an adapter or transport package'
    }

    if ($Scope -in @('all', 'frontend')) {
        $frontendFiles = Get-ProductionFiles `
            -Root (Join-Path $repoRoot 'frontend/src') `
            -Extensions @('.ts', '.tsx') `
            -ExcludeTests
        Assert-FileSizeBoundaries -Files $frontendFiles

        $frontendFeatureFiles = Get-ProductionFiles `
            -Root (Join-Path $repoRoot 'frontend/src/features') `
            -Extensions @('.ts', '.tsx') `
            -ExcludeTests
        Assert-NoForbiddenImports `
            -Files $frontendFeatureFiles `
            -Pattern 'from [''"][^''"]*pages/|from [''"][^''"]*../pages' `
            -FailureMessage 'a frontend feature imports a page module'
    }

    Write-Output 'SOLID architecture checks passed'
}
catch {
    [System.Console]::Error.WriteLine("SOLID architecture check failed: {0}", $_.Exception.Message)
    exit 1
}
