# Telegram comment watcher daemon.
# Runs in background, checks comments every 15s, auto-replies.

$python = "C:\Users\OLD\anaconda3\envs\chatterbox-tts\python.exe"
$watch = "C:\Projects\opencode-tts\tools\telegram-watch.py"
$logDir = "$env:USERPROFILE\.opencode-tts"
$logFile = "$logDir\watch-daemon.log"
$stateFile = "$logDir\telegram-watch-state.json"

function Write-Log {
    param([string]$Msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Reply-To-Comment {
    param([int]$MessageId, [string]$Text)

    # Build reply based on comment text
    $reply = ""
    $lower = $Text.ToLower()

    if ($lower -match "что.*тут|что.*происходит|что.*это|зачем|откуда") {
        $reply = "Разработка ИИ-ассистентов, автоматизация, реверс-инжиниринг. opencode-flow — голосовой плагин для OpenCode + Kioku — локальный AI ассистент на Ollama. В общем, всё что горим 🔥"
    }
    elseif ($lower -match "круто|класс|прикольно|ого|нифига|заебись|красава") {
        $reply = "Спасибо! Заходи, тут будет ещё много интересного 🚀"
    }
    elseif ($lower -match "вопрос|как|почему|зачем|что такое") {
        $reply = "Спрашивай, расскажу. Если сам не знаю — Макс подскажет, он шарит 🤝"
    }
    elseif ($lower -match "привет|здарова|здравствуй|салам") {
        $reply = "Салам! Заходи, располагайся, будет интересно 🤙"
    }
    else {
        $reply = "Заходи, тут будет интересно. По проекту — спрашивай, отвечу 🚀"
    }

    if ($reply -and $MessageId) {
        $json = @{
            chat_id = -1003939462897
            text = $reply
            reply_to_message_id = $MessageId
            parse_mode = "HTML"
        } | ConvertTo-Json -Compress

        try {
            $cfg = Get-Content "$logDir\telegram-config.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            $url = "https://api.telegram.org/bot$($cfg.token)/sendMessage"
            $r = Invoke-RestMethod -Uri $url -Method Post -Body $json -ContentType "application/json" -TimeoutSec 10
            if ($r.ok) { Write-Log ("replied to msg " + $MessageId + ": " + $reply) }
            else { Write-Log ("FAIL reply to msg " + $MessageId + ": " + $r.description) }
        } catch {
            Write-Log "ERROR replying: $_"
        }
    }
}

Write-Log "Daemon started"

while ($true) {
    try {
        # Get last update id from state
        $offset = 0
        if (Test-Path $stateFile) {
            $state = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
            $offset = $state.last_update_id
        }

        # Fetch updates
        $cfg = Get-Content "$logDir\telegram-config.json" -Raw -Encoding UTF8 | ConvertFrom-Json
        $url = "https://api.telegram.org/bot$($cfg.token)/getUpdates?offset=$offset&timeout=10&allowed_updates=%5B%22message%22%5D"
        $r = Invoke-RestMethod -Uri $url -TimeoutSec 15

        if ($r.ok -and $r.result.Count -gt 0) {
            $maxId = 0
            foreach ($update in $r.result) {
                $msg = $update.message
                if (-not $msg) { continue }
                if ($msg.chat.id -ne -1003939462897) { continue }

                $text = $msg.text
                if (-not $text) { continue }

                $from = $msg.from.username
                if (-not $from) { $from = $msg.from.first_name }

                Write-Log "New comment from $from (msg $($msg.message_id)): $text"

                # Auto-reply
                Reply-To-Comment -MessageId $msg.message_id -Text $text

                if ($update.update_id -gt $maxId) { $maxId = $update.update_id }
            }

            if ($maxId -gt 0) {
                $newState = @{ last_update_id = $maxId + 1; updated_at = (Get-Date -Format "o") } | ConvertTo-Json -Compress
                Set-Content -Path $stateFile -Value $newState -Encoding UTF8 -NoNewline
            }
        }
    }
    catch {
        Write-Log "Error in loop: $_"
    }

    Start-Sleep -Seconds 15
}
