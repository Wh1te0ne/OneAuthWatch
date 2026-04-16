$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $serverRoot

$sourceDir = Join-Path $repoRoot 'client\dist-web'
$targetDir = Join-Path $serverRoot 'internal\web\static\ui'

if (-not (Test-Path -LiteralPath $sourceDir)) {
    throw "Web build output not found: $sourceDir"
}

$resolvedTarget = (Resolve-Path -LiteralPath $targetDir).Path
if ($resolvedTarget -notlike (Join-Path $serverRoot 'internal\web\static\ui*')) {
    throw "Refusing to sync into unexpected target: $resolvedTarget"
}

Get-ChildItem -LiteralPath $targetDir -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $sourceDir -Force | Copy-Item -Destination $targetDir -Recurse -Force

Write-Host "Synced web UI from $sourceDir to $targetDir"
