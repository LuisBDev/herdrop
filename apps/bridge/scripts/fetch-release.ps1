$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$pluginDir = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Path (Join-Path $pluginDir 'herdr-plugin.toml')
if ($manifest -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
    throw 'herdr-plugin.toml declares no version'
}
$version = $Matches[1]
$base = 'https://github.com/LuisBDev/herdrop/releases/download'
if ($env:HERDROP_RELEASE_BASE) {
    $base = $env:HERDROP_RELEASE_BASE.TrimEnd('/')
}
$releaseUrl = "$base/v$version"
$binaryAsset = 'herdrop-x86_64-pc-windows-msvc.exe'
$extensionAsset = 'herdrop-extension.tar.gz'

$work = Join-Path $pluginDir 'target\release-download'
if (Test-Path $work) {
    Remove-Item -Recurse -Force $work
}
New-Item -ItemType Directory -Path $work | Out-Null

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
foreach ($name in @('SHA256SUMS', $binaryAsset, $extensionAsset)) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$releaseUrl/$name" -OutFile (Join-Path $work $name)
    } catch {
        throw "cannot download $releaseUrl/$name`: $($_.Exception.Message)"
    }
}

$sums = @{}
foreach ($line in Get-Content -Path (Join-Path $work 'SHA256SUMS')) {
    if ($line -match '^([0-9a-fA-F]{64}) [ *](.+)$') {
        $sums[$Matches[2]] = $Matches[1].ToLowerInvariant()
    }
}
foreach ($name in @($binaryAsset, $extensionAsset)) {
    if (-not $sums.ContainsKey($name)) {
        throw "SHA256SUMS for v$version lists no $name"
    }
    $stream = [IO.File]::OpenRead((Join-Path $work $name))
    try {
        $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($stream)
    } finally {
        $stream.Dispose()
    }
    $actual = ([BitConverter]::ToString($digest) -replace '-', '').ToLowerInvariant()
    if ($actual -ne $sums[$name]) {
        throw "$name does not match SHA256SUMS: expected $($sums[$name]), got $actual"
    }
}

$unpacked = Join-Path $work 'extension'
New-Item -ItemType Directory -Path $unpacked | Out-Null
& (Join-Path $env:SystemRoot 'System32\tar.exe') -xzf (Join-Path $work $extensionAsset) -C $unpacked
if ($LASTEXITCODE -ne 0) {
    throw "tar cannot unpack $extensionAsset"
}
if (-not (Test-Path (Join-Path $unpacked 'manifest.json'))) {
    throw "$extensionAsset has no manifest.json at its root"
}

$releaseDir = Join-Path $pluginDir 'target\release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Move-Item -Force -Path (Join-Path $work $binaryAsset) -Destination (Join-Path $releaseDir 'herdrop.exe')
$extensionDir = Join-Path $pluginDir 'extension'
if (Test-Path $extensionDir) {
    Remove-Item -Recurse -Force $extensionDir
}
Move-Item -Path $unpacked -Destination $extensionDir
Remove-Item -Recurse -Force $work
Write-Output "herdrop v$version installed from $releaseUrl"
