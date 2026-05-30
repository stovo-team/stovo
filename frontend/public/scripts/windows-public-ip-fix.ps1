param(
    [int]$Port = 8000,
    [string]$RuleName = "Stovo Family Messenger TCP 8000"
)

Write-Host "Stovo Public IP setup" -ForegroundColor Cyan
Write-Host "Port: $Port"
Write-Host ""

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right click PowerShell -> Run as Administrator, then run this script again."
    exit 1
}

function Get-LanIPv4 {
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike "127.*" `
            -and $_.IPAddress -notlike "169.254.*" `
            -and $_.PrefixOrigin -ne "WellKnown"
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1

    if (-not $ip) {
        throw "Could not detect LAN IPv4 address."
    }

    return $ip.IPAddress
}

function Test-LocalBackend {
    param([int]$Port)

    try {
        $url = "http://127.0.0.1:$Port/api/health"
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return $res.StatusCode -ge 200 -and $res.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Get-PublicIPv4 {
    try {
        return (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 10).Content.Trim()
    } catch {
        return $null
    }
}

function Test-PrivateOrCGNAT {
    param([string]$IP)

    if (-not $IP) {
        return $true
    }

    $parts = $IP.Split(".") | ForEach-Object { [int]$_ }

    if ($parts[0] -eq 10) { return $true }
    if ($parts[0] -eq 172 -and $parts[1] -ge 16 -and $parts[1] -le 31) { return $true }
    if ($parts[0] -eq 192 -and $parts[1] -eq 168) { return $true }
    if ($parts[0] -eq 100 -and $parts[1] -ge 64 -and $parts[1] -le 127) { return $true }

    return $false
}

function Add-FirewallRule {
    param(
        [string]$RuleName,
        [int]$Port
    )

    $existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "Firewall rule already exists: $RuleName" -ForegroundColor Yellow
        return
    }

    New-NetFirewallRule `
        -DisplayName $RuleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port | Out-Null

    Write-Host "Windows Firewall opened TCP $Port" -ForegroundColor Green
}

function Add-UPnPPortMapping {
    param(
        [string]$LanIP,
        [int]$Port
    )

    try {
        $upnp = New-Object -ComObject HNetCfg.NATUPnP
        $mappings = $upnp.StaticPortMappingCollection

        if ($null -eq $mappings) {
            Write-Host "UPnP is not available on this network/router." -ForegroundColor Yellow
            return $false
        }

        foreach ($mapping in $mappings) {
            if ($mapping.ExternalPort -eq $Port -and $mapping.Protocol -eq "TCP") {
                Write-Host "Existing UPnP mapping found for TCP $Port. Removing old mapping..." -ForegroundColor Yellow
                $mappings.Remove($Port, "TCP")
                break
            }
        }

        $mappings.Add($Port, "TCP", $Port, $LanIP, $true, "Stovo Family Messenger")
        Write-Host "UPnP router mapping added: external TCP $Port -> ${LanIP}:$Port" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "UPnP router mapping failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

Write-Host "Checking local backend..."
$backendOk = Test-LocalBackend -Port $Port

if (-not $backendOk) {
    Write-Host "Backend is not reachable at http://127.0.0.1:$Port/api/health" -ForegroundColor Red
    Write-Host "Start Docker Compose first:"
    Write-Host "docker compose up"
    exit 1
}

Write-Host "Backend is reachable locally." -ForegroundColor Green

$lanIP = Get-LanIPv4
Write-Host "LAN IP: $lanIP"

$publicIP = Get-PublicIPv4
if ($publicIP) {
    Write-Host "Public IP: $publicIP"
} else {
    Write-Host "Could not detect public IP." -ForegroundColor Yellow
}

Add-FirewallRule -RuleName $RuleName -Port $Port
$upnpOk = Add-UPnPPortMapping -LanIP $lanIP -Port $Port

Write-Host ""
Write-Host "Result" -ForegroundColor Cyan
Write-Host "Local URL:  http://127.0.0.1:$Port"
Write-Host "LAN URL:    http://${lanIP}:$Port"

if ($publicIP) {
    Write-Host "Public URL: http://${publicIP}:$Port"
}

if (-not $upnpOk) {
    Write-Host ""
    Write-Host "Router auto setup failed or UPnP is disabled." -ForegroundColor Yellow
    Write-Host "Manual fix:"
    Write-Host "1. Open your router admin panel."
    Write-Host "2. Forward TCP $Port to $lanIP:$Port."
    Write-Host "3. Make sure your ISP does not use CGNAT."
}

if ($publicIP -and (Test-PrivateOrCGNAT -IP $publicIP)) {
    Write-Host ""
    Write-Host "Your detected public IP looks private/CGNAT-like. Public IP mode may not work." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "After this, click Try Public IP again in Stovo Admin."
Write-Host "If it still fails, use Cloudflare Tunnel."
