import { spawn, execSync } from "child_process"
import { appendFileSync } from "fs"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

const PARENT_PID = String(process.pid)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Telegram comment watcher daemon ────────────────────────────
function isTelegramDaemonRunning(): boolean {
  const cmd =
    `@(Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'telegram-watch-daemon') }).Count`
  try {
    return parseInt(execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 5000 }).trim(), 10) > 0
  } catch {
    return false
  }
}

function killOldTelegramDaemon() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'telegram-watch-daemon') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startTelegramDaemon() {
  if (isTelegramDaemonRunning()) return
  killOldTelegramDaemon()
  const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
  const script = "C:\\Projects\\opencode-tts\\tools\\telegram-watch-daemon.py"
  const proc = spawn(pythonw, [script], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

// ── Отладочный лог (временный, для диагностики озвучки) ─────────
const DLOG_PATH = `${process.env.USERPROFILE}\\.opencode-tts\\plugin.log`
const DLOG_ENABLED = false // диагностика озвучки завершена; включить при отладке
function dlog(msg: string) {
  if (!DLOG_ENABLED) return
  try {
    appendFileSync(DLOG_PATH, `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* ignore */
  }
}

// ── Whisper (voice input) ──────────────────────────────────────

function isWhisperRunning(): boolean {
  const cmd =
    `@(Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'whisper_listener') }).Count`
  try {
    return parseInt(execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 5000 }).trim(), 10) > 0
  } catch {
    return false
  }
}

function killOldVoiceListeners() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python' ) -and ($_.CommandLine -match 'whisper_listener') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startVoiceListener() {
  const already = isWhisperRunning()
  if (already) return
  killOldVoiceListeners()
  const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
  const script = "C:\\Projects\\opencode-tts\\whisper\\whisper_listener.py"
  const proc = spawn(pythonw, [script], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

// ── Status overlay (плавающий индикатор статуса Whisper) ───────

function killOldStatusOverlay() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'status_overlay') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startStatusOverlay() {
  if (isOverlayRunning()) return
  killOldStatusOverlay()
  const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
  const script = "C:\\Projects\\opencode-tts\\overlays\\status_overlay.py"
  const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

function isOverlayRunning(): boolean {
  const cmd =
    `@(Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'status_overlay') }).Count`
  try {
    return parseInt(execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 5000 }).trim(), 10) > 0
  } catch {
    return false
  }
}

// Вотчдог: если оверлей умер (гонка на старте и т.п.) — поднять заново.
async function startOverlayMonitor() {
  while (true) {
    await sleep(15_000)
    if (!isOverlayRunning()) {
      const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
      const script = "C:\\Projects\\opencode-tts\\overlays\\status_overlay.py"
      const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
      proc.unref()
    }
  }
}

// ── TTS overlay (плавающий индикатор статуса TTS) ─────────────

function killOldTtsOverlay() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'tts_overlay') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startTtsOverlay() {
  if (isTtsOverlayRunning()) return
  killOldTtsOverlay()
  const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
  const script = "C:\\Projects\\opencode-tts\\overlays\\tts_overlay.py"
  const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

function isTtsOverlayRunning(): boolean {
  const cmd =
    `@(Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'tts_overlay') }).Count`
  try {
    return parseInt(execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 5000 }).trim(), 10) > 0
  } catch {
    return false
  }
}

async function startTtsOverlayMonitor() {
  while (true) {
    await sleep(15_000)
    if (!isTtsOverlayRunning()) {
      const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
      const script = "C:\\Projects\\opencode-tts\\overlays\\tts_overlay.py"
      const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
      proc.unref()
    }
  }
}

// ── Telegram overlay ───────────────────────────────────────────

function killOldTelegramOverlay() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'telegram_overlay') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startTelegramOverlay() {
  if (isTelegramOverlayRunning()) return
  killOldTelegramOverlay()
  const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
  const script = "C:\\Projects\\opencode-tts\\overlays\\telegram_overlay.py"
  const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

function isTelegramOverlayRunning(): boolean {
  const cmd =
    `@(Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python') -and ($_.CommandLine -match 'telegram_overlay') }).Count`
  try {
    return parseInt(execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 5000 }).trim(), 10) > 0
  } catch {
    return false
  }
}

async function startTelegramOverlayMonitor() {
  while (true) {
    await sleep(15_000)
    if (!isTelegramOverlayRunning()) {
      const pythonw = "C:\\Users\\OLD\\anaconda3\\envs\\chatterbox-tts\\pythonw.exe"
      const script = "C:\\Projects\\opencode-tts\\overlays\\telegram_overlay.py"
      const proc = spawn(pythonw, [script, '--parent-pid', PARENT_PID], { stdio: "ignore", windowsHide: true })
      proc.unref()
    }
  }
}

// ── TTS (voice output) ─────────────────────────────────────────

const TTS_PORT = 4321
const TTS_URL = `http://127.0.0.1:${TTS_PORT}`

function killOldTtsProcesses() {
  const cmd =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { ($_.Name -match '^python' ) -and ($_.CommandLine -match 'tts_server') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  try {
    execSync(cmd, { shell: "powershell", encoding: "utf8", timeout: 8000 })
  } catch { /* ignore */ }
}

function startTtsServer() {
  killOldTtsProcesses()
  // Запускаем python-сервер напрямую. start-tts.ps1 — интерактивное меню
  // (Read-Host), в фоне оно зависает и сервер не поднимается.
  const python = `${process.env.USERPROFILE}\\anaconda3\\envs\\elevenlabs\\python.exe`
  const script = "C:\\Projects\\opencode-tts\\tts-server\\tts_server.py"
  const proc = spawn(python, [script], { stdio: "ignore", windowsHide: true })
  proc.unref()
}

async function isTtsReady(): Promise<boolean> {
  try {
    const res = await fetch(`${TTS_URL}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function speakText(text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TTS_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Извлечение русского текста из «Thought» ────────────────────
// Озвучиваем только русские предложения из reasoning-частей,
// отбрасывая английский, код и технический мусор.
function cleanMarkup(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")          // блоки кода
    .replace(/`[^`]*`/g, " ")                  // инлайн-код / имена файлов
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // ссылки → текст
    .replace(/[*_#>|~]/g, " ")                 // markdown-символы
    .replace(/^\s*[-•]\s*/, "")                // маркер списка
    .replace(/\s+/g, " ")
    .trim()
}

function extractRussian(text: string): string {
  if (!text) return ""
  // сначала убираем блоки кода целиком, потом режем на сегменты
  const cleaned = text.replace(/```[\s\S]*?```/g, "\n")
  const segments = cleaned.split(/(?<=[.!?…])\s+|\n+/)
  const kept: string[] = []
  for (const raw of segments) {
    const seg = cleanMarkup(raw)
    if (!seg) continue
    const cyr = (seg.match(/[а-яёА-ЯЁ]/g) || []).length
    const lat = (seg.match(/[a-zA-Z]/g) || []).length
    // оставляем сегмент, если в нём есть кириллица и её не меньше латиницы
    if (cyr >= 2 && cyr >= lat) kept.push(seg)
  }
  return kept.join(" ").replace(/\s+/g, " ").trim()
}

// ── Plugin export ──────────────────────────────────────────────

export default (async (input) => {
  // 0. Telegram comment watcher daemon (LLM автоответ) + оверлей
  startTelegramDaemon()
  startTelegramOverlay()

  // 1. Whisper (voice input) + плавающий индикатор статуса
  startVoiceListener()
  startStatusOverlay()

  // 2. TTS (voice output)
  const configPath = `${process.env.USERPROFILE}\\.opencode-tts\\config.json`
  let modelKey = "none"
  try {
    const fs = await import("fs")
    const raw = fs.readFileSync(configPath, "utf-8")
    const cfg = JSON.parse(raw)
    modelKey = cfg.model_key || "none"
  } catch { /* use default */ }
  dlog(`plugin init: modelKey=${modelKey}`)

  if (modelKey !== "none") {
    const ttsAlreadyHealthy = await isTtsReady()
    if (!ttsAlreadyHealthy) {
      killOldTtsProcesses()
      startTtsServer()
    }
    startTtsOverlay()

    if (!ttsAlreadyHealthy) {
      // ожидаем готовности TTS-сервера (таймаут 2 мин)
      setTimeout(() => {
        void (async () => {
          for (let i = 0; i < 60; i++) {
            if (await isTtsReady()) return
            await sleep(2000)
          }
        })()
      }, 2000)
    }

    void startTtsOverlayMonitor()
  }

  // 3. Регистрируем cleanup при выходе из opencode
  const cleanup = () => {
    killOldTelegramDaemon()
    killOldTelegramOverlay()
    killOldVoiceListeners()
    killOldTtsProcesses()
    killOldStatusOverlay()
    killOldTtsOverlay()
    // Выгружаем LLM-модель из VRAM
    try {
      execSync("ollama stop hf.co/mradermacher/Impish_Bloodmoon_12B-i1-GGUF:Q4_K_M", { shell: "powershell", encoding: "utf8", timeout: 5000 })
    } catch { /* ignore */ }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  // 4. Мониторинг оверлеев (автоподъём если упал)
  void startOverlayMonitor()
  void startTelegramOverlayMonitor()

  // 5. Auto-speak on session idle
  let _lastSpokeSessionId = ""
  let _lastSpokeTime = 0

  return {
    event: async ({ event }) => {
      dlog(`event: ${event?.type}`)
      if (event.type !== "session.idle") return
      dlog(`idle event payload: ${JSON.stringify(event).slice(0, 400)}`)
      if (modelKey === "none") return

      const ready = await isTtsReady()
      dlog(`isTtsReady=${ready}`)
      if (!ready) return

      const sessionId: string | undefined =
        (event as any).properties?.sessionID ??
        (event as any).properties?.sessionId ??
        (event as any).sessionID ??
        (event as any).sessionId
      dlog(`sessionId=${sessionId}`)
      if (!sessionId) return

      // Защита от дублей: один и тот же session не озвучивать чаще раза в 8 секунд
      const now = Date.now()
      if (sessionId === _lastSpokeSessionId && now - _lastSpokeTime < 8000) {
        dlog(`dedup: session ${sessionId} уже озвучен ${now - _lastSpokeTime}ms назад`)
        return
      }

      try {
        const msgsResp: any = await input.client.session.messages({
          path: { id: sessionId },
        })
        // SDK может вернуть массив или обёртку { data: [...] }
        const msgs: any[] = Array.isArray(msgsResp)
          ? msgsResp
          : (msgsResp?.data ?? msgsResp?.messages ?? [])
        dlog(
          `msgs isArray=${Array.isArray(msgsResp)} keys=${
            msgsResp && !Array.isArray(msgsResp) ? JSON.stringify(Object.keys(msgsResp)) : "-"
          } len=${msgs.length}`,
        )

        if (msgs[0]) dlog(`msg[0] keys=${JSON.stringify(Object.keys(msgs[0]))}`)

        const lastAssistant = msgs
          .slice()
          .reverse()
          .find((m: any) => m.info?.role === "assistant")
        dlog(`lastAssistant found=${!!lastAssistant}`)

        if (!lastAssistant) {
          // подстрахуемся: вдруг роль лежит не в .info
          const alt = msgs.slice().reverse().find((m: any) => m.role === "assistant")
          dlog(`alt(role at top) found=${!!alt}`)
          if (alt) dlog(`alt keys=${JSON.stringify(Object.keys(alt))}`)
          return
        }

        dlog(`lastAssistant keys=${JSON.stringify(Object.keys(lastAssistant))} partTypes=${JSON.stringify((lastAssistant.parts || []).map((p: any) => p.type))}`)

        // Берём финальный ответ (text-части) и оставляем только русский
        const answer = lastAssistant.parts
          ?.filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .filter(Boolean)
          .join("\n")

        const russian = extractRussian(answer || "")
        // ограничиваем длину, чтобы не гнать огромные ответы в синтез
        const toSpeak = russian.length > 1500 ? russian.slice(0, 1500) : russian
        dlog(`answer.len=${(answer || "").length} russian.len=${russian.length} preview="${toSpeak.slice(0, 60)}"`)

        if (toSpeak) {
          _lastSpokeSessionId = sessionId
          _lastSpokeTime = Date.now()
          const ok = await speakText(toSpeak)
          dlog(`speakText ok=${ok}`)
        } else {
          dlog("toSpeak пуст — нечего озвучивать")
        }
      } catch (e: any) {
        dlog(`ERROR в обработчике: ${e?.message || e}`)
      }
    },
  }
}) satisfies Plugin
