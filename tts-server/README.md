# MaylaanAI self-hosted TTS service

FastAPI wrapper around **ai4bharat/indic-parler-tts** (Apache-2.0 weights,
Tamil + English + 19 other Indic languages) serving raw PCM for the Next.js
`/api/tts/vapi` proxy route. See `server.py`'s doc-comment for the exact
HTTP contract and security posture.

**This service is NOT deployed to Vercel** — a 0.9 B-parameter model cannot
live in a serverless function. It runs on a separate host and the Vercel app
reaches it via `CUSTOM_TTS_URL` + `CUSTOM_TTS_API_KEY`.

## Model access (one-time)

`ai4bharat/indic-parler-tts` is a **gated** Hugging Face repo (auto-approved,
but requires an account): log in on huggingface.co, open the model page,
accept the access conditions, create a read token, and set `HF_TOKEN` in the
service's environment before first start. Without it the model download 401s.

## Run locally (development)

```bash
python -m venv venv && venv/Scripts/activate           # Windows
pip install torch --index-url https://download.pytorch.org/whl/cu121   # or /cpu
pip install "torchaudio==<match your torch version>" --index-url <same index>
pip install -r requirements.txt
set TTS_API_KEY=<generate a long random value>
set HF_TOKEN=<your HF read token>
uvicorn server:app --host 0.0.0.0 --port 8100
```

torch and torchaudio MUST come from the same index and version — a mismatch
fails at import with `WinError 127 / procedure could not be found` (hit and
verified during the 2026-08-19 benchmark on the dev laptop).

## Deployment options (decision recorded 2026-08-19)

| Option | Cost class | Latency | Notes |
|---|---|---|---|
| A. CPU VPS + Docker (4 vCPU) | ~$20–40/mo | RTF likely > 1 for the 0.9B model — **unproven, benchmark first** | Cheapest, but the 0.9B Parler class may be too slow on CPU; the small-VITS class (40 M) runs 3× realtime on a laptop CPU |
| B. GPU VPS (e.g. RTX 4000-class) | ~$100–250/mo | RTF ≈ 0.2–0.5 expected | The only option proven-shaped for real-time 0.9B Parler |
| C. Serverless GPU (per-second billing) | usage-based | Cold starts of tens of seconds | Poor fit for conversational TTS; fine for batch pre-generation |
| D. Local dev only | $0 | n/a | What `bench2.py` measured; not reachable from production |

The environment variables in the Vercel app that activate this service
(`VOICE_TTS_PROVIDER=custom`, `CUSTOM_TTS_URL`, `CUSTOM_TTS_API_KEY`,
optional `VOICE_CUSTOM_TTS_EMPLOYEE_IDS` canary allowlist) stay UNSET until
a host exists and a human has approved the Tamil audio quality — until then
production keeps its current voice chain untouched.

## Docker

```bash
docker build -t maylaanai-tts .
docker run -p 8100:8100 -v tts-models:/models -v tts-cache:/cache \
  -e TTS_API_KEY=... -e HF_TOKEN=... maylaanai-tts
```
