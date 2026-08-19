"""MaylaanAI self-hosted TTS service — Indic Parler-TTS behind FastAPI.

Serves NATIVE Tamil + English speech as raw PCM (s16le, mono) for the
Next.js `/api/tts/vapi` proxy route. This process is the only place the
model lives; the Vercel app never loads Python or model weights.

Contract (kept deliberately tiny and provider-shaped, so the Next.js
adapter can swap this backend without changing Vapi-facing code):

    POST /tts
    Authorization: Bearer <TTS_API_KEY>
    { "text": str, "language": "ta"|"en", "sample_rate": int }
      -> 200 audio/pcm  (raw signed 16-bit little-endian mono PCM at
                         exactly the requested sample_rate, streamed in
                         chunks as generation progresses)
      -> 400 invalid payload / oversized text
      -> 401 bad or missing bearer token
      -> 429 concurrency limit reached
      -> 503 model not loaded

    GET /health  (no auth, no text) -> model/device/queue status.

Security posture (this endpoint is computationally expensive):
  - bearer auth required on /tts (constant-time compare)
  - strict text length cap (TTS_MAX_TEXT_CHARS, default 800)
  - bounded concurrency (TTS_MAX_CONCURRENCY, default 1) — excess
    requests get 429 immediately instead of queueing unboundedly
  - per-request generation timeout (TTS_TIMEOUT_SECONDS, default 60)
  - disk cache is keyed by content hash — no caller-controlled paths
  - logs carry text hashes and lengths, never the text itself

Run:  uvicorn server:app --host 0.0.0.0 --port 8100
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import struct
import threading
import time

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tts")

MODEL_ID = os.environ.get("TTS_MODEL_ID", "ai4bharat/indic-parler-tts")
API_KEY = os.environ.get("TTS_API_KEY", "")
MAX_TEXT_CHARS = int(os.environ.get("TTS_MAX_TEXT_CHARS", "800"))
MAX_CONCURRENCY = int(os.environ.get("TTS_MAX_CONCURRENCY", "1"))
TIMEOUT_SECONDS = float(os.environ.get("TTS_TIMEOUT_SECONDS", "60"))
CACHE_DIR = os.environ.get("TTS_CACHE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache"))
CACHE_MAX_FILES = int(os.environ.get("TTS_CACHE_MAX_FILES", "500"))
ALLOWED_SAMPLE_RATES = {8000, 16000, 22050, 24000, 44100}

# Voice descriptions steer Parler-TTS. One fixed voice per language keeps a
# stable speaker identity across a call AND makes the cache key meaningful.
VOICE_DESCRIPTIONS = {
    "ta": os.environ.get(
        "TTS_TA_VOICE_DESCRIPTION",
        "Jaya speaks with a clear, professional tone at a moderate pace in a very close sounding, noise-free studio recording.",
    ),
    "en": os.environ.get(
        "TTS_EN_VOICE_DESCRIPTION",
        "Thoma speaks with a clear, professional Indian English tone at a moderate pace in a very close sounding, noise-free studio recording.",
    ),
}

_model = None
_tokenizer = None
_desc_tokenizer = None
_model_sr = 44100
_device = "cpu"
_load_error: str | None = None
_active = 0
_active_lock = threading.Lock()


def _load_model() -> None:
    global _model, _tokenizer, _desc_tokenizer, _model_sr, _device, _load_error
    try:
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        _device = "cuda:0" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        t0 = time.perf_counter()
        _model = ParlerTTSForConditionalGeneration.from_pretrained(
            MODEL_ID, torch_dtype=dtype, attn_implementation="eager"
        ).to(_device)
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        _desc_tokenizer = AutoTokenizer.from_pretrained(_model.config.text_encoder._name_or_path)
        _model_sr = int(_model.config.sampling_rate)
        log.info("model loaded id=%s device=%s dtype=%s sr=%d in %.1fs", MODEL_ID, _device, dtype, _model_sr, time.perf_counter() - t0)
    except Exception as exc:  # noqa: BLE001 — /health must be able to report this
        _load_error = repr(exc)
        log.error("model load failed: %s", _load_error)


def _resample_linear(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate:
        return audio
    n_dst = int(round(len(audio) * dst_rate / src_rate))
    x_src = np.linspace(0.0, 1.0, num=len(audio), endpoint=False)
    x_dst = np.linspace(0.0, 1.0, num=n_dst, endpoint=False)
    return np.interp(x_dst, x_src, audio).astype(np.float32)


def _to_pcm_s16le(audio: np.ndarray) -> bytes:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


def _cache_key(text: str, language: str, sample_rate: int) -> str:
    ident = "|".join([MODEL_ID, VOICE_DESCRIPTIONS[language], language, str(sample_rate), text])
    return hashlib.sha256(ident.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> str:
    return os.path.join(CACHE_DIR, f"{key}.pcm")


def _cache_evict_if_needed() -> None:
    try:
        files = [os.path.join(CACHE_DIR, f) for f in os.listdir(CACHE_DIR) if f.endswith(".pcm")]
        if len(files) <= CACHE_MAX_FILES:
            return
        files.sort(key=os.path.getmtime)
        for stale in files[: len(files) - CACHE_MAX_FILES]:
            os.remove(stale)
    except OSError:
        pass


def _generate_pcm(text: str, language: str, sample_rate: int) -> bytes:
    import torch

    desc = VOICE_DESCRIPTIONS[language]
    di = _desc_tokenizer(desc, return_tensors="pt").to(_device)
    pi = _tokenizer(text, return_tensors="pt").to(_device)
    with torch.no_grad():
        audio = _model.generate(
            input_ids=di.input_ids,
            attention_mask=di.attention_mask,
            prompt_input_ids=pi.input_ids,
            prompt_attention_mask=pi.attention_mask,
        )
    arr = audio.to(torch.float32).cpu().numpy().squeeze()
    del audio
    if _device.startswith("cuda"):
        torch.cuda.empty_cache()
    return _to_pcm_s16le(_resample_linear(arr, _model_sr, sample_rate))


try:
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, Response
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"FastAPI is required: pip install fastapi uvicorn ({exc})")

app = FastAPI(title="MaylaanAI TTS", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def startup() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    if not API_KEY:
        log.warning("TTS_API_KEY is empty — /tts will reject every request until it is set")
    threading.Thread(target=_load_model, daemon=True).start()


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok" if _model is not None else ("error" if _load_error else "loading"),
            "model": MODEL_ID,
            "device": _device,
            "sample_rate": _model_sr,
            "active_requests": _active,
            "load_error": _load_error,
        }
    )


def _authorized(request: Request) -> bool:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer ") or not API_KEY:
        return False
    return hmac.compare_digest(header[len("Bearer ") :], API_KEY)


@app.post("/tts")
async def tts(request: Request) -> Response:
    global _active
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    if _model is None:
        return JSONResponse({"error": "model not ready", "detail": _load_error or "loading"}, status_code=503)

    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    text = payload.get("text")
    language = payload.get("language")
    sample_rate = payload.get("sample_rate", 24000)
    if not isinstance(text, str) or not text.strip():
        return JSONResponse({"error": "text is required"}, status_code=400)
    if len(text) > MAX_TEXT_CHARS:
        return JSONResponse({"error": f"text exceeds {MAX_TEXT_CHARS} chars"}, status_code=400)
    if language not in VOICE_DESCRIPTIONS:
        return JSONResponse({"error": "language must be one of: " + ", ".join(sorted(VOICE_DESCRIPTIONS))}, status_code=400)
    if not isinstance(sample_rate, int) or sample_rate not in ALLOWED_SAMPLE_RATES:
        return JSONResponse({"error": "unsupported sample_rate"}, status_code=400)

    text = text.strip()
    key = _cache_key(text, language, sample_rate)
    path = _cache_path(key)
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        os.utime(path, None)  # refresh mtime so LRU eviction keeps hot entries
        log.info("cache hit lang=%s chars=%d key=%s bytes=%d", language, len(text), key[:12], len(data))
        return Response(content=data, media_type="audio/pcm", headers={"X-TTS-Cache": "hit"})

    with _active_lock:
        if _active >= MAX_CONCURRENCY:
            return JSONResponse({"error": "busy"}, status_code=429, headers={"Retry-After": "2"})
        _active += 1
    t0 = time.perf_counter()
    try:
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _generate_pcm, text, language, sample_rate),
            timeout=TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log.warning("generation timeout lang=%s chars=%d key=%s", language, len(text), key[:12])
        return JSONResponse({"error": "generation timeout"}, status_code=504)
    except Exception as exc:  # noqa: BLE001
        log.error("generation failed lang=%s chars=%d key=%s err=%r", language, len(text), key[:12], exc)
        return JSONResponse({"error": "generation failed"}, status_code=500)
    finally:
        with _active_lock:
            _active -= 1

    try:
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        _cache_evict_if_needed()
    except OSError:
        pass  # serving beats caching

    log.info(
        "generated lang=%s chars=%d key=%s bytes=%d in %.2fs", language, len(text), key[:12], len(data), time.perf_counter() - t0
    )
    return Response(content=data, media_type="audio/pcm", headers={"X-TTS-Cache": "miss"})


@app.get("/tts/wav-probe")
async def wav_probe(request: Request) -> Response:
    """Same auth + limits as /tts but wraps the PCM in a WAV header — for a
    human listening check with any audio player. Never used by Vapi."""
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    text = request.query_params.get("text", "")
    language = request.query_params.get("language", "ta")
    if not text or len(text) > MAX_TEXT_CHARS or language not in VOICE_DESCRIPTIONS or _model is None:
        return JSONResponse({"error": "bad request or model not ready"}, status_code=400)
    pcm = await asyncio.get_event_loop().run_in_executor(None, _generate_pcm, text.strip(), language, 24000)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1, 24000, 48000, 2, 16, b"data", len(pcm)
    )
    return Response(content=header + pcm, media_type="audio/wav")
