[CmdletBinding()]
param(
    [string]$OutputPath = ".local\host-probe.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-GeneratedMethod {
    param(
        [Parameter(Mandatory)] [string]$ContractRoot,
        [Parameter(Mandatory)] [string]$Method
    )

    $clientRequest = Join-Path $ContractRoot "ClientRequest.ts"
    if (-not (Test-Path -LiteralPath $clientRequest)) {
        throw "Generated contract is missing ClientRequest.ts"
    }
    return (Get-Content -Raw -LiteralPath $clientRequest).Contains("`"method`": `"$Method`"")
}

function Test-GeneratedField {
    param(
        [Parameter(Mandatory)] [string]$ContractRoot,
        [Parameter(Mandatory)] [string]$RelativeFile,
        [Parameter(Mandatory)] [string]$Field
    )

    $target = Join-Path $ContractRoot $RelativeFile
    if (-not (Test-Path -LiteralPath $target)) {
        return $false
    }
    return (Get-Content -Raw -LiteralPath $target) -match "(?m)^$([regex]::Escape($Field))\??:"
}

$servers = @(
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -ieq "codex.exe" -and
            $_.CommandLine -match "(^|\s)app-server(\s|$)"
        }
)

if ($servers.Count -ne 1) {
    throw "Expected exactly one active Codex Desktop App Server, found $($servers.Count)."
}

$server = $servers[0]
$executablePath = [System.IO.Path]::GetFullPath([string]$server.ExecutablePath)
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Active App Server executable does not exist: $executablePath"
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$probeRoot = Join-Path $tempBase ("codex-maps-probe-" + [guid]::NewGuid().ToString("N"))
$resolvedProbeRoot = [System.IO.Path]::GetFullPath($probeRoot)
$tempPrefix = $tempBase.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedProbeRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($resolvedProbeRoot)).StartsWith("codex-maps-probe-", [System.StringComparison]::Ordinal)) {
    throw "Refusing to use an unverified temporary probe path: $resolvedProbeRoot"
}

New-Item -ItemType Directory -Path $resolvedProbeRoot | Out-Null

try {
    $probeExecutable = Join-Path $resolvedProbeRoot "codex-desktop.exe"
    Copy-Item -LiteralPath $executablePath -Destination $probeExecutable

    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $executablePath).Hash
    $copyHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $probeExecutable).Hash
    if ($sourceHash -ne $copyHash) {
        throw "Copied App Server hash does not match the active executable."
    }

    $version = (& $probeExecutable --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
        throw "Could not read the active App Server version."
    }

    $stableRoot = Join-Path $resolvedProbeRoot "stable"
    $experimentalRoot = Join-Path $resolvedProbeRoot "experimental"
    New-Item -ItemType Directory -Path $stableRoot, $experimentalRoot | Out-Null

    & $probeExecutable app-server generate-ts --out $stableRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Stable App Server contract generation failed."
    }
    & $probeExecutable app-server generate-ts --experimental --out $experimentalRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Experimental App Server contract generation failed."
    }

    $resourceRoot = Split-Path $executablePath -Parent
    $appAsar = Join-Path $resourceRoot "app.asar"
    $packageMatch = [regex]::Match($executablePath, "OpenAI\.Codex_([^\\]+)\\app\\resources\\codex\.exe$", "IgnoreCase")

    $report = [ordered]@{
        schemaVersion = 1
        observedAt = (Get-Date).ToUniversalTime().ToString("o")
        platform = [ordered]@{
            os = [System.Environment]::OSVersion.VersionString
            architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        }
        desktop = [ordered]@{
            packageIdentitySuffix = if ($packageMatch.Success) { $packageMatch.Groups[1].Value } else { $null }
            appServerPid = [int]$server.ProcessId
            appServerParentPid = [int]$server.ParentProcessId
            executablePath = $executablePath
            executableSha256 = $sourceHash
            appAsarSha256 = if (Test-Path -LiteralPath $appAsar) { (Get-FileHash -Algorithm SHA256 -LiteralPath $appAsar).Hash } else { $null }
            cliVersion = $version
            activeAppServerCount = $servers.Count
        }
        stable = [ordered]@{
            generatedFileCount = @(Get-ChildItem -LiteralPath $stableRoot -File -Recurse).Count
            methods = [ordered]@{
                threadList = Test-GeneratedMethod $stableRoot "thread/list"
                threadRead = Test-GeneratedMethod $stableRoot "thread/read"
                threadDelete = Test-GeneratedMethod $stableRoot "thread/delete"
                projectList = Test-GeneratedMethod $stableRoot "project/list"
                threadSectionList = Test-GeneratedMethod $stableRoot "threadSection/list"
                threadSectionMove = Test-GeneratedMethod $stableRoot "thread/section/move"
            }
            fields = [ordered]@{
                projectId = Test-GeneratedField $stableRoot "v2\ThreadListParams.ts" "projectId"
                sectionId = Test-GeneratedField $stableRoot "v2\ThreadListParams.ts" "sectionId"
                parentThreadId = Test-GeneratedField $stableRoot "v2\ThreadListParams.ts" "parentThreadId"
                ancestorThreadId = Test-GeneratedField $stableRoot "v2\ThreadListParams.ts" "ancestorThreadId"
                isPinned = Test-GeneratedField $stableRoot "v2\ThreadMetadataUpdateParams.ts" "isPinned"
            }
        }
        experimental = [ordered]@{
            generatedFileCount = @(Get-ChildItem -LiteralPath $experimentalRoot -File -Recurse).Count
            methods = [ordered]@{
                threadDelete = Test-GeneratedMethod $experimentalRoot "thread/delete"
                projectList = Test-GeneratedMethod $experimentalRoot "project/list"
                threadSectionList = Test-GeneratedMethod $experimentalRoot "threadSection/list"
                threadSectionMove = Test-GeneratedMethod $experimentalRoot "thread/section/move"
            }
            fields = [ordered]@{
                projectId = Test-GeneratedField $experimentalRoot "v2\ThreadListParams.ts" "projectId"
                sectionId = Test-GeneratedField $experimentalRoot "v2\ThreadListParams.ts" "sectionId"
                parentThreadId = Test-GeneratedField $experimentalRoot "v2\ThreadListParams.ts" "parentThreadId"
                ancestorThreadId = Test-GeneratedField $experimentalRoot "v2\ThreadListParams.ts" "ancestorThreadId"
                isPinned = Test-GeneratedField $experimentalRoot "v2\ThreadMetadataUpdateParams.ts" "isPinned"
            }
        }
    }

    $resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
        [System.IO.Path]::GetFullPath($OutputPath)
    } else {
        [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
    }
    $outputDirectory = Split-Path $resolvedOutput -Parent
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8

    Write-Output "Host probe written to $resolvedOutput"
    $report | ConvertTo-Json -Depth 8
}
finally {
    $verifiedTarget = [System.IO.Path]::GetFullPath($resolvedProbeRoot)
    if ($verifiedTarget.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        ([System.IO.Path]::GetFileName($verifiedTarget)).StartsWith("codex-maps-probe-", [System.StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $verifiedTarget -Recurse -Force
    } else {
        throw "Refusing to clean an unverified temporary probe path: $verifiedTarget"
    }
}
