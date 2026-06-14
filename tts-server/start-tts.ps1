param(
    [switch]$Background
)

$ErrorActionPreference = "Stop"
$ConfigDir = "$env:USERPROFILE\.opencode-tts"
$ConfigFile = "$ConfigDir\config.json"

# Создаём конфиг с дефолтом, если нет
if (-not (Test-Path $ConfigFile)) {
    $null = New-Item -ItemType Directory -Path $ConfigDir -Force
    $default = @{
        model_key = "none"
        elevenlabs = @{
            api_key = ""
            voice_id = "vpUqfpCIn34tjFW4KHjt"
            model = "eleven_multilingual_v2"
            stability = 0.5
            similarity_boost = 0.75
            style = 0.0
            speed = 1.0
        }
    } | ConvertTo-Json -Depth 10
    Set-Content -Path $ConfigFile -Value $default -Encoding UTF8
}

$config = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json

$Models = @(
    @{ Key = "elevenlabs"; Name = "ElevenLabs"; Desc = "Облачный TTS от ElevenLabs, ~20 языков" }
    @{ Key = "none";      Name = "Без TTS";     Desc = "Отключить озвучку ответов" }
)

function Show-Menu {
    Clear-Host
    $current = $config.model_key
    $currentName = "—"
    foreach ($m in $Models) { if ($m.Key -eq $current) { $currentName = $m.Name } }

    Write-Host "=== Выбор TTS-модели ===" -ForegroundColor Cyan
    Write-Host "Текущая: $currentName`n" -ForegroundColor Yellow
    for ($i = 0; $i -lt $Models.Count; $i++) {
        $m = $Models[$i]
        $mark = if ($m.Key -eq $current) { " *" } else { "" }
        Write-Host "$($i+1)) $($m.Name)$mark — $($m.Desc)"
    }
    Write-Host "0) Выход`n"
}

function Set-ElevenLabsConfig {
    $ecfg = $config.elevenlabs
    if (-not $ecfg.api_key) {
        Write-Host "`nAPI-ключ ElevenLabs не указан." -ForegroundColor Yellow
        $key = Read-Host "Введите API-ключ (или Enter = пропустить)"
        if ($key) { $ecfg.api_key = $key }
    }
    if (-not $ecfg.voice_id) {
        Write-Host "`nVoice ID не указан." -ForegroundColor Yellow
        $vid = Read-Host "Введите Voice ID (Enter = пропустить)"
        if ($vid) { $ecfg.voice_id = $vid }
    }
    $config.elevenlabs = $ecfg
}

function Save-And-Launch {
    $json = $config | ConvertTo-Json -Depth 10
    Set-Content -Path $ConfigFile -Value $json -Encoding UTF8

    if ($config.model_key -eq "none") {
        Write-Host "`nTTS отключён." -ForegroundColor Green
        exit 0
    }

    # Проверяем API-ключ перед запуском
    if ($config.model_key -eq "elevenlabs" -and -not $config.elevenlabs.api_key) {
        Write-Host "`nОшибка: для ElevenLabs нужен API-ключ." -ForegroundColor Red
        pause
        return $false
    }

    # Запускаем сервер
    $python = "$env:USERPROFILE\anaconda3\envs\elevenlabs\python.exe"
    $script = "C:\Projects\opencode-tts\tts-server\tts_server.py"

    if (-not (Test-Path $python)) {
        Write-Host "`nОшибка: Python не найден: $python" -ForegroundColor Red
        pause
        return $false
    }

    Write-Host "`nЗапуск TTS-сервера..." -ForegroundColor Green

    if ($Background) {
        $logFile = "$ConfigDir\server.log"
        $errFile = "$ConfigDir\server.err"
        $job = Start-Process -FilePath $python -ArgumentList $script -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $errFile
        Write-Host "Сервер запущен (PID: $($job.Id)). Фоновый режим." -ForegroundColor Cyan
        Start-Sleep 1
        exit 0
    } else {
        & $python $script
    }

    return $true
}

# Основной цикл меню
do {
    Show-Menu
    $choice = Read-Host "Выберите пункт"
    switch ($choice) {
        "1" {
            $config.model_key = "elevenlabs"
            Set-ElevenLabsConfig
            Save-And-Launch
            break
        }
        "2" {
            $config.model_key = "none"
            Save-And-Launch
            break
        }
        "0" { exit 0 }
        default {
            Write-Host "Неверный выбор!" -ForegroundColor Red
            Start-Sleep 1
        }
    }
} while ($true)
