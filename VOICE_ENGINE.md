# AI Voice Engine Architecture & Pipeline Specification

## 1. End-to-End Pipeline
```
[ Visitor Audio ] ──(WebAudio/WebRTC)──► [ @vapi-ai/web SDK ] ──► [ Vapi Cloud ]
                                                                      │
                                                               (Webhook Event)
                                                                      │
                                                                      ▼
[ Audio Response ] ◄──(Streaming Voice)─── [ GPT-4o-mini ] ◄── [ Next.js Webhook ]
                                                                      │
                                                                      ▼
                                                            [ ToolRegistry & DB ]
```

## 2. Voice State Lifecycle
- `idle`: Standby state waiting for user interaction.
- `connecting`: Establishing WebRTC connection with Vapi.
- `listening`: Receiving user audio stream.
- `thinking`: Processing LLM reasoning / executing tool.
- `speaking`: Streaming TTS audio back to visitor browser.
