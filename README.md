# pi-mimo-voice

> 🇨🇳 [中文文档](docs/README.zh-CN.md)

Voice input (STT) and output (TTS) for [pi](https://github.com/earendil-works/pi-coding-agent) powered by Xiaomi MiMo V2.5 API.

[![npm version](https://img.shields.io/npm/v/pi-mimo-voice)](https://www.npmjs.com/package/pi-mimo-voice)
[![GitHub](https://img.shields.io/github/license/wenjinnn/pi-mimo-voice)](https://github.com/wenjinnn/pi-mimo-voice)

![pi-mimo-voice screenshot](https://github.com/wenjinnn/pi-mimo-voice/releases/download/v1.0.5/screenshot.png)

> 🔊 **Please turn on sound for the demo below**

https://github.com/user-attachments/assets/9a9f9984-9476-4c4e-bbeb-ae088a7d875c

## Features

- 🎤 **Speech-to-Text (STT)** — Record audio from microphone and transcribe
- 🔊 **Text-to-Speech (TTS)** — Speak text aloud through speakers
- 🗣️ **Auto-speak** — Automatically read all assistant replies
- 🎙️ **Live mode** — Continuous voice conversation loop
- 🎛️ **Interactive config** — Voice, model, engine, and region settings

## Installation

```bash
# Install from npm
pi install npm:@wenjinnn/pi-mimo-voice

# Or install from GitHub
pi install git:github.com/wenjinnn/pi-mimo-voice

# Or clone manually
cd ~/.pi/agent/extensions
git clone https://github.com/wenjinnn/pi-mimo-voice.git
```

## Quick Start

```bash
# 1. Set API key (via environment variable or pi /login)
export XIAOMI_TOKEN_PLAN_CN_API_KEY="your-key"  # China region
# Or: export XIAOMI_API_KEY="your-key"          # Global

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
| `/auto-speak` | Toggle auto-speak (read all assistant replies). Use `/auto-speak on\|off` for explicit control |
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

| Provider | auth.json Key | Environment Variable | Region |
|----------|---------------|---------------------|--------|
| Xiaomi MiMo | `xiaomi` | `XIAOMI_API_KEY` | Global |
| Token Plan CN | `xiaomi-token-plan-cn` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` | China |
| Token Plan AMS | `xiaomi-token-plan-ams` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | Amsterdam |
| Token Plan SGP | `xiaomi-token-plan-sgp` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | Singapore |

### Setup Options

**Option 1: Environment Variable**
```bash
export XIAOMI_TOKEN_PLAN_CN_API_KEY="your-key"
```

**Option 2: pi /login**
```
/login  → Select provider → Enter API key
```

**Option 3: auth.json**
```json
{
  "xiaomi-token-plan-cn": { "type": "api_key", "key": "your-key" }
}
```

See [pi providers docs](https://pi.dev/docs/latest/providers) for more details.

## Requirements

- **Node.js** ≥ 18
- **MiMo API key** — configured via `pi /login` or environment variable (see [API Configuration](#api-configuration))
- **ffmpeg** — for audio recording and playback (cross-platform)

### Platform-Specific Audio Tools

| Platform | Recording | Playback (priority order) |
|----------|-----------|--------------------------|
| **Linux** | `parecord` (PulseAudio) → ffmpeg | `paplay` → `aplay` → `ffplay` → `mpv` |
| **macOS** | ffmpeg + avfoundation | `afplay` (built-in) → `ffplay` → `mpv` |
| **Windows** | ffmpeg + dshow | `ffplay` → `mpv` |

**Linux:** PulseAudio is recommended (`parecord`/`paplay`). ALSA (`aplay`) also works for playback.

**macOS:** No extra tools needed — `afplay` is built-in, ffmpeg handles recording via avfoundation.

**Windows:** Install [ffmpeg](https://ffmpeg.org/download.html) and ensure it's in PATH. Default recording device is `audio=麦克风`, override with `MIC_DEVICE` env var.

> ⚠️ **Cross-platform note:** macOS and Windows support is based on ffmpeg's platform-specific audio backends (avfoundation/dshow) but has **not been fully tested on real hardware**. Linux is the primary tested platform. If you encounter issues on macOS or Windows, please [open an issue](https://github.com/wenjinnn/pi-mimo-voice/issues) — feedback and contributions are very welcome!

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MIC_DEVICE` | Override audio recording device (all platforms) |
| `WHISPER_MODEL` | Path to whisper.cpp model file |

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
Microphone → parecord/ffmpeg → WAV file → whisper.cpp or MiMo API → Text
```

### Live Mode Flow

```
/live → Start recording
User speaks
/live reply → Stop recording → Transcribe → Send to LLM
LLM responds → Auto-speak reads response
Auto-start next recording
```

## Feedback & Contributing

This project is actively maintained. If you have questions, bug reports, or feature requests:

- 🐛 [Open an issue](https://github.com/wenjinnn/pi-mimo-voice/issues)
- 🔀 [Submit a pull request](https://github.com/wenjinnn/pi-mimo-voice/pulls)
- 💬 Share your experience and suggestions

Contributions of any kind are welcome!

## License

MIT
