$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$i = 0
$targets | ForEach-Object {
    Write-Output "$($i): type=$($_.type) url=$($_.url) title=$($_.title) id=$($_.id)"
    $i++
}
