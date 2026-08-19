# MaylaanAI self-hosted TTS (Indic Parler-TTS) — CPU image.
# For a GPU host use nvidia/cuda:12.1.1-runtime-ubuntu22.04 as the base and
# install the cu121 torch wheel instead of the cpu one.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY server.py .

# The model (~3.5 GB) downloads to this volume on first start; mount it so
# restarts don't re-download.
ENV HF_HOME=/models
VOLUME /models

ENV TTS_CACHE_DIR=/cache
VOLUME /cache

EXPOSE 8100
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8100"]
