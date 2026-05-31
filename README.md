# pi-mimo-voice

Voice input (STT) and output (TTS) for [pi](https://github.com/earendil-works/pi-coding-agent) powered by Xiaomi MiMo V2.5 API.

[![npm version](https://img.shields.io/npm/v/pi-mimo-voice)](https://www.npmjs.com/package/pi-mimo-voice)
[![GitHub](https://img.shields.io/github/license/wenjinnn/pi-mimo-voice)](https://github.com/wenjinnn/pi-mimo-voice)

## Features

- 🎤 **Speech-to-Text (STT)** — Record audio from microphone and transcribe
- 🔊 **Text-to-Speech (TTS)** — Speak text aloud through speakers
- 🗣️ **Auto-speak** — Automatically read all assistant replies
- 🎙️ **Live mode** — Continuous voice conversation loop
- 🎛️ **Interactive config** — Voice, model, engine, and region settings

## Installation

```bash
# Install as pi extension
cd ~/.pi/agent/extensions
git clone <this-repo> pi-mimo-voice

# Or install from npm (when published)
npx pi-package install pi-mimo-voice
```

## Quick Start

```bash
# 1. Set API key (or configure via pi /login)
export MIMO_API_KEY="your-key"

# 2. Restart pi or /reload

# 3. Try it
/speak Hello from MiMo!
/listen
/listen stop
```

## Commands

### Text-to-Speech

| Command | Description |
|---------|-------------|
| `/speak <text>` | Speak text aloud using MiMo TTS |

### Speech-to-Text

| Command | Description |
|---------|-------------|
| `/listen` | Start recording (manual stop with `/listen stop`) |
| `/listen stop` | Stop recording and transcribe |
| `/listen auto-stop N` | Record for N seconds then transcribe |
| `/listen N` | Record for N seconds (max 60) then transcribe |

### Auto-speak & Live Mode

| Command | Description |
|---------|-------------|
| `/auto-speak` | Toggle auto-speak (read all assistant replies) |
| `/live` | Start/stop live voice mode (auto-speak ON, begins recording) |
| `/live reply` | Stop recording, transcribe, and send to LLM |

**Live mode flow:**
1. `/live` → recording starts
2. Speak when ready
3. `/live reply` → transcribes and sends
4. AI responds → auto-speak reads it → next recording starts
5. Repeat from step 2
6. `/live` to stop

### Configuration

| Command | Description |
|---------|-------------|
| `/voice-config` | Interactive settings: voice, TTS model, STT engine, API region |

## LLM Tools

When installed, the LLM can call these tools directly:

### `mimo_tts`

Convert text to speech. Parameters:
- `text` (required) — Text to speak
- `style` (optional) — Style instruction (e.g., "excited", "calm", "东北话")

### `mimo_stt`

Record and transcribe speech. Parameters:
- `duration` (optional) — Recording duration in seconds (default: 10, max: 60)
- `auto_stop` (optional) — Auto-stop when silence detected (default: false)

## Voices

### Preset Voices

| Voice | ID | Language | Gender |
|-------|-----|----------|--------|
| Default | `mimo_default` | auto | auto |
| 冰糖 | `冰糖` | zh | female |
| 茉莉 | `茉莉` | zh | female |
| 苏打 | `苏打` | zh | male |
| 白桦 | `白桦` | zh | male |
| Mia | `Mia` | en | female |
| Chloe | `Chloe` | en | female |
| Milo | `Milo` | en | male |
| Dean | `Dean` | en | male |

### TTS Models

| Model | Description |
|-------|-------------|
| `mimo-v2.5-tts` | Preset voices (default) |
| `mimo-v2.5-tts-voicedesign` | Custom voice via text description |
| `mimo-v2.5-tts-voiceclone` | Clone voice from audio sample |

## API Configuration

The extension auto-detects the API region from your pi `auth.json` provider:

| Provider | Region |
|----------|--------|
| `xiaomi-token-plan-cn` | China |
| `xiaomi-token-plan-ams` | Amsterdam |
| `xiaomi-token-plan-sgp` | Singapore |
| `xiaomi` | Global |

## Requirements

- **Node.js** ≥ 18
- **PulseAudio** — for audio recording (`parecord`)
- **Audio player** — one of: `paplay`, `aplay`, `ffplay`, `mpv`
- **MiMo API key** — configured via `pi /login` or `MIMO_API_KEY` env var

### npm Dependencies

The following dependencies are provided by pi automatically:

- `@earendil-works/pi-coding-agent` — pi extension API
- `@earendil-works/pi-tui` — pi TUI components
- `typebox` — type validation

### Optional

- **whisper.cpp** — for local STT (faster, no API calls)
  - Set path: `/voice-config` → Whisper.cpp Path
  - Download model: `whisper-cpp-download-ggml-model base`

## How It Works

### TTS Flow

```
Text → MiMo TTS API → WAV audio → paplay/aplay/ffplay/mpv
```

### STT Flow

```
Microphone → parecord → WAV file → whisper.cpp or MiMo API → Text
```

### Live Mode Flow

```
/live → Start recording
User speaks
/live reply → Stop recording → Transcribe → Send to LLM
LLM responds → Auto-speak reads response
Auto-start next recording
```

## License

MIT
