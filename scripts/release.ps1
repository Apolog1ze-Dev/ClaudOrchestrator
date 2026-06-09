#Requires -Version 5.1
<#
.SYNOPSIS
    One-command release: prompts for version, updates all files, signs, builds,
    and packages artifacts ready to upload to GitHub Releases.

.EXAMPLE
    .\scripts\release.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# GitHub repo for releases (must match the endpoint in tauri.conf.json)
$GitHubOwner = "Apolog1ze-Dev"
$GitHubRepo  = "ClaudOrchestrator"

# Signing key location
$SigningKeyPath     = "$HOME\.tauri\claudorchestrator.key"
$SigningKeyPassword = ""  # leave empty if you didn't set one

# ─────────────────────────────────────────────────────────────────────────────
# Files that contain the version
# ─────────────────────────────────────────────────────────────────────────────
$TauriConfPath = "$ProjectRoot\src-tauri\tauri.conf.json"
$CargoTomlPath = "$ProjectRoot\src-tauri\Cargo.toml"
$PackageJsonPath = "$ProjectRoot\package.json"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1 — Read current version and prompt for new one
# ═════════════════════════════════════════════════════════════════════════════

$TauriConf    = Get-Content $TauriConfPath -Raw | ConvertFrom-Json
$CurrentVersion = $TauriConf.version
$ProductName    = $TauriConf.productName

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  $ProductName Release Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Current version: " -NoNewline -ForegroundColor Gray
Write-Host "$CurrentVersion" -ForegroundColor White

# Parse current version to suggest the next patch bump
$Parts = $CurrentVersion.Split(".")
$SuggestedVersion = "$($Parts[0]).$($Parts[1]).$([int]$Parts[2] + 1)"

Write-Host ""
$NewVersion = Read-Host "  Enter new version [$SuggestedVersion]"
if ([string]::IsNullOrWhiteSpace($NewVersion)) {
    $NewVersion = $SuggestedVersion
}

# Validate semver format
if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "ERROR: '$NewVersion' is not valid semver (expected: X.Y.Z)" -ForegroundColor Red
    exit 1
}

if ($NewVersion -eq $CurrentVersion) {
    Write-Host "ERROR: New version is the same as current ($CurrentVersion)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  $CurrentVersion  -->  $NewVersion" -ForegroundColor Green
Write-Host ""

# Optional release notes
$ReleaseNotes = Read-Host "  Release notes (optional, press Enter to skip)"
if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
    $ReleaseNotes = "Update to version $NewVersion"
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2 — Update version in all files
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "[1/5] Updating version to $NewVersion..." -ForegroundColor Yellow

# Use regex replacement instead of ConvertTo-Json to preserve formatting and
# avoid PowerShell adding a UTF-8 BOM (which breaks Tauri's JSON parser).

# — tauri.conf.json —
$TauriContent = Get-Content $TauriConfPath -Raw
$TauriContent = $TauriContent -replace '("version"\s*:\s*")[^"]*(")', "`${1}$NewVersion`${2}"
[System.IO.File]::WriteAllText($TauriConfPath, $TauriContent)
Write-Host "  Updated: src-tauri\tauri.conf.json" -ForegroundColor Gray

# — Cargo.toml —
$CargoContent = Get-Content $CargoTomlPath -Raw
$CargoContent = $CargoContent -replace '(?m)^(version\s*=\s*")[^"]*(")', "`${1}$NewVersion`${2}"
[System.IO.File]::WriteAllText($CargoTomlPath, $CargoContent)
Write-Host "  Updated: src-tauri\Cargo.toml" -ForegroundColor Gray

# — package.json —
$PkgContent = Get-Content $PackageJsonPath -Raw
$PkgContent = $PkgContent -replace '("version"\s*:\s*")[^"]*(")', "`${1}$NewVersion`${2}"
[System.IO.File]::WriteAllText($PackageJsonPath, $PkgContent)
Write-Host "  Updated: package.json" -ForegroundColor Gray

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3 — Load signing key automatically
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "[2/5] Loading signing key..." -ForegroundColor Yellow

if (-not (Test-Path $SigningKeyPath)) {
    Write-Host "ERROR: Signing key not found at $SigningKeyPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Generate one with:" -ForegroundColor Yellow
    Write-Host "  npx @tauri-apps/cli signer generate -w `"$SigningKeyPath`""
    exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $SigningKeyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SigningKeyPassword
Write-Host "  Loaded key from: $SigningKeyPath" -ForegroundColor Gray

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4 — Build
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "[3/5] Building Tauri app..." -ForegroundColor Yellow
Write-Host ""

Push-Location $ProjectRoot
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
} finally {
    Pop-Location
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5 — Locate artifacts
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "[4/5] Locating build artifacts..." -ForegroundColor Yellow

$BundleDir = "$ProjectRoot\src-tauri\target\release\bundle\nsis"

$UpdateBundle = Get-ChildItem "$BundleDir\*.nsis.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$Signature    = Get-ChildItem "$BundleDir\*.nsis.zip.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
$Installer    = Get-ChildItem "$BundleDir\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $UpdateBundle -or -not $Signature) {
    Write-Host "ERROR: Could not find update bundle or signature in $BundleDir" -ForegroundColor Red
    Write-Host "Contents:" -ForegroundColor Yellow
    Get-ChildItem $BundleDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host "  Installer:     $($Installer.Name)" -ForegroundColor Gray
Write-Host "  Update bundle: $($UpdateBundle.Name)" -ForegroundColor Gray
Write-Host "  Signature:     $($Signature.Name)" -ForegroundColor Gray

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6 — Generate latest.json and copy to release/
# ═════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "[5/5] Packaging release..." -ForegroundColor Yellow

$Sig = (Get-Content $Signature.FullName -Raw).Trim()
$DownloadUrl = "https://github.com/$GitHubOwner/$GitHubRepo/releases/download/v$NewVersion/$($UpdateBundle.Name)"
$PubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$LatestJson = @{
    version   = $NewVersion
    notes     = $ReleaseNotes
    pub_date  = $PubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $Sig
            url       = $DownloadUrl
        }
    }
} | ConvertTo-Json -Depth 4

$ReleaseDir = "$ProjectRoot\release"
if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force }
New-Item -ItemType Directory -Path $ReleaseDir | Out-Null

Copy-Item $Installer.FullName    "$ReleaseDir\"
Copy-Item $UpdateBundle.FullName "$ReleaseDir\"
Copy-Item $Signature.FullName    "$ReleaseDir\"
[System.IO.File]::WriteAllText("$ReleaseDir\latest.json", $LatestJson)

# ═════════════════════════════════════════════════════════════════════════════
# DONE
# ═════════════════════════════════════════════════════════════════════════════

# Clean up env vars (don't leave key in shell session)
$env:TAURI_SIGNING_PRIVATE_KEY = $null
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Release v$NewVersion ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Notes: $ReleaseNotes" -ForegroundColor Gray
Write-Host ""
Write-Host "  Artifacts:" -ForegroundColor Cyan
Get-ChildItem $ReleaseDir | ForEach-Object {
    $Size = if ($_.Length -gt 1MB) { "$([math]::Round($_.Length / 1MB, 1)) MB" } else { "$([math]::Round($_.Length / 1KB, 0)) KB" }
    Write-Host "    $($_.Name)  ($Size)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Upload to GitHub:" -ForegroundColor Yellow
Write-Host "    1. https://github.com/$GitHubOwner/$GitHubRepo/releases/new" -ForegroundColor White
Write-Host "    2. Tag: v$NewVersion   Title: $ProductName v$NewVersion" -ForegroundColor White
Write-Host "    3. Drag all files from: $ReleaseDir\" -ForegroundColor White
Write-Host "    4. Publish" -ForegroundColor White
Write-Host ""
