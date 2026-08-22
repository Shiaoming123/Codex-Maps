param(
    [Parameter(Mandatory = $false)]
    [string]$AsarPath
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AsarPath)) {
    $package = Get-AppxPackage -Name "OpenAI.Codex" |
        Sort-Object Version -Descending |
        Select-Object -First 1
    if ($null -eq $package) {
        throw "Installed OpenAI.Codex package not found"
    }
    $AsarPath = Join-Path $package.InstallLocation "app\resources\app.asar"
}

if (-not (Test-Path -LiteralPath $AsarPath -PathType Leaf)) {
    throw "Codex Desktop ASAR not found: $AsarPath"
}

$tempRoot = [System.IO.Path]::GetTempPath().TrimEnd("\")
$probePath = Join-Path $tempRoot ("codex-maps-envelope-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $probePath | Out-Null

try {
    Push-Location $probePath
    $archivePaths = @(
        ".vite\build\preload.js",
        ".vite\build\main-g2764IDy.js",
        "webview\assets\app-initial-BhpTek7p.js",
        "webview\assets\index-DEcY3ZNM.js"
    )

    foreach ($archivePath in $archivePaths) {
        pnpm --silent dlx '@electron/asar' extract-file $AsarPath $archivePath
        if ($LASTEXITCODE -ne 0) {
            throw "ASAR extraction failed: $archivePath"
        }
    }
    Pop-Location

    $needles = @(
        "codex_desktop:message-from-view",
        "sendMessageFromView",
        "connect-app-host",
        "navigate-to-route",
        "thread/list",
        "message-for-view"
    )

    Get-ChildItem -LiteralPath $probePath -File | ForEach-Object {
        $content = [System.IO.File]::ReadAllText($_.FullName)
        Write-Output "FILE $($_.Name) BYTES $($content.Length)"

        foreach ($needle in $needles) {
            $start = 0
            $count = 0
            while (($index = $content.IndexOf($needle, $start, [StringComparison]::Ordinal)) -ge 0 -and $count -lt 3) {
                $left = [Math]::Max(0, $index - 700)
                $length = [Math]::Min(1600, $content.Length - $left)
                $snippet = $content.Substring($left, $length) -replace "\s+", " "
                Write-Output "NEEDLE $needle OFFSET $index"
                Write-Output $snippet
                $start = $index + $needle.Length
                $count++
            }
        }
    }
}
finally {
    if ((Get-Location).Path -eq $probePath) {
        Pop-Location
    }

    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot + "\")
    $resolvedProbePath = [System.IO.Path]::GetFullPath($probePath)
    $probeName = [System.IO.Path]::GetFileName($resolvedProbePath)

    if (-not $resolvedProbePath.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing cleanup outside temp root: $resolvedProbePath"
    }
    if (-not $probeName.StartsWith("codex-maps-envelope-", [StringComparison]::Ordinal)) {
        throw "Refusing cleanup of unexpected directory: $resolvedProbePath"
    }
    if (Test-Path -LiteralPath $resolvedProbePath) {
        Remove-Item -LiteralPath $resolvedProbePath -Recurse -Force
    }
}
