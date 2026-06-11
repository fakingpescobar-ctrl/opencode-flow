import logging
import time
import requests

from elevenlabs import ElevenLabs

log = logging.getLogger("elevenlabs_backend")

# Короткий таймаут: туннель может оставить «мёртвое» соединение в пуле;
# без этого SDK ждёт ответ по умолчанию 240с. Лучше быстро упасть и ретрайнуть.
REQUEST_TIMEOUT = 8.0
RETRY_DELAYS = [1, 2, 4, 8, 16]


class ElevenLabsBackend:
    def __init__(self, api_key: str, voice_id: str, model: str = "eleven_multilingual_v2",
                 stability: float = 0.5, similarity_boost: float = 0.75,
                 style: float = 0.0, speed: float = 1.0):
        self._api_key = api_key
        self.client = self._new_client()
        self.voice_id = voice_id
        self.model = model
        self.stability = stability
        self.similarity_boost = similarity_boost
        self.style = style
        self.speed = speed
        self._healthy = True

    def _new_client(self) -> ElevenLabs:
        return ElevenLabs(api_key=self._api_key, timeout=REQUEST_TIMEOUT)

    def _convert_once(self, text: str) -> bytes:
        audio_generator = self.client.text_to_speech.convert(
            text=text,
            voice_id=self.voice_id,
            model_id=self.model,
            voice_settings={
                "stability": self.stability,
                "similarity_boost": self.similarity_boost,
                "style": self.style,
                "speed": self.speed,
            },
        )
        chunks = [chunk for chunk in audio_generator if chunk]
        if not chunks:
            raise RuntimeError("ElevenLabs вернул пустой ответ")
        return b"".join(chunks)

    def _is_connection_error(self, e: Exception) -> bool:
        msg = str(e)
        if isinstance(e, ConnectionResetError):
            return True
        if isinstance(e, requests.exceptions.ConnectionError):
            return True
        if "10054" in msg or "10053" in msg or "10060" in msg:
            return True
        if "connection" in msg.lower() and ("reset" in msg.lower() or "refused" in msg.lower() or "abort" in msg.lower()):
            return True
        return False

    def synthesize(self, text: str) -> bytes:
        if not self._healthy:
            # бэкенд пал — пробуем сходиться, но ходить тихо
            pass
        last_err = None
        max_attempts = 2
        for attempt in range(max_attempts):
            try:
                result = self._convert_once(text)
                self._healthy = True
                return result
            except Exception as e:
                last_err = e
                log.warning(f"Попытка {attempt + 1}/{max_attempts}: {type(e).__name__}: {e}")
                self.client = self._new_client()

        if self._is_connection_error(last_err):
            self._healthy = False
            log.warning("Сеть/VPN недоступен — бэкенд помечен нездоровым, watchtower восстановит")
        raise last_err
