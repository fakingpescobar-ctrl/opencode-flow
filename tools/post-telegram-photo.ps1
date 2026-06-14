param(
    [Parameter(Mandatory)]
    [string]$PhotoPath,
    [Parameter(Mandatory)]
    [string]$Caption
)

$configPath = "$env:USERPROFILE\.opencode-tts\telegram-config.json"
$cfg = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

$url = "https://api.telegram.org/bot$($cfg.token)/sendPhoto"

# Build multipart form manually
$boundary = "------------------------" + [Guid]::NewGuid().ToString("N")
$lf = "`r`n"

$bodyLines = @()
$bodyLines += "--$boundary"
$bodyLines += "Content-Disposition: form-data; name=`"chat_id`"$lf"
$bodyLines += "$($cfg.channel)"

$bodyLines += "--$boundary"
$bodyLines += "Content-Disposition: form-data; name=`"caption`"$lf"
$bodyLines += "$Caption"

$photoBytes = [System.IO.File]::ReadAllBytes($PhotoPath)
$bodyLines += "--$boundary"
$bodyLines += "Content-Disposition: form-data; name=`"photo`"; filename=`"banner.png`""
$bodyLines += "Content-Type: image/png$lf"

$bodyText = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join $lf) + $lf))
$footer = "$lf--$boundary--$lf"
$footerBytes = [System.Text.Encoding]::UTF8.GetBytes($footer)

$ms = New-Object System.IO.MemoryStream
$textBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyText)
$ms.Write($textBytes, 0, $textBytes.Length)
$ms.Write($photoBytes, 0, $photoBytes.Length)
$ms.Write($footerBytes, 0, $footerBytes.Length)
$ms.Seek(0, [System.IO.SeekOrigin]::Begin) | Out-Null

try {
    $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $ms.ToArray() -TimeoutSec 20
    if ($r.ok) { Write-Output "OK: photo sent" }
    else { Write-Error "Telegram error: $($r.description)" }
}
catch {
    Write-Error "Failed: $_"
}
