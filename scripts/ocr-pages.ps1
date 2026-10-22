param([Parameter(Mandatory=$true)][string]$InputDirectory)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1: local Korean OCR; no document leaves the computer.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
$taskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-Operation($operation, $resultType) {
    $task = $taskMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    $task.Result
}
$language = New-Object Windows.Globalization.Language 'ko'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if (-not $engine) { throw 'Korean OCR language pack is required.' }
foreach ($inputFile in Get-ChildItem -LiteralPath $InputDirectory -Filter '*.png' | Sort-Object Name) {
    if ($inputFile.BaseName -notmatch '^\d{2}-\d{2}$') { continue }
    $textFile = [IO.Path]::ChangeExtension($inputFile.FullName, '.text.json')
    if (Test-Path -LiteralPath $textFile) {
        $nativeText = Get-Content -LiteralPath $textFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($nativeText.chars.Count -gt 100) { continue }
    }
    $outputFile = [IO.Path]::ChangeExtension($inputFile.FullName, '.ocr.json')
    if (Test-Path -LiteralPath $outputFile) {
        $existing = Get-Content -LiteralPath $outputFile -Raw | ConvertFrom-Json
        if ($existing.width -and $existing.lines.Count) { continue }
    }
    $file = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($inputFile.FullName)) ([Windows.Storage.StorageFile])
    $stream = Await-Operation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @($result.Lines | ForEach-Object {
        @{ text = $_.Text; words = @($_.Words | ForEach-Object {
            @{ text=$_.Text; x=$_.BoundingRect.X; y=$_.BoundingRect.Y; w=$_.BoundingRect.Width; h=$_.BoundingRect.Height }
        }) }
    })
    @{ width=$bitmap.PixelWidth; height=$bitmap.PixelHeight; lines=$lines } | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $outputFile -Encoding UTF8
    $bitmap.Dispose()
    $stream.Dispose()
    Write-Output $inputFile.Name
}
