# pi-mimo-voice

> 🇬🇳 [English](../README.md)

为 [pi](https://github.com/earendil-works/pi-coding-agent) 提供语音输入 (STT) 和输出 (TTS)，由小米 MiMo V2.5 API 驱动。

[![npm version](https://img.shields.io/npm/v/pi-mimo-voice)](https://www.npmjs.com/package/pi-mimo-voice)
[![GitHub](https://img.shields.io/github/license/wenjinnn/pi-mimo-voice)](https://github.com/wenjinnn/pi-mimo-voice)

![pi-mimo-voice 截图](https://github.com/wenjinnn/pi-mimo-voice/releases/download/v1.0.5/screenshot.png)

> 🔊 **请打开声音观看下方演示**

https://github.com/user-attachments/assets/9a9f9984-9476-4c4e-bbeb-ae088a7d875c

## 功能特性

- 🎤 **语音转文字 (STT)** — 录音并转写为文字
- 🔊 **文字转语音 (TTS)** — 将文字朗读出来
- 🗣️ **自动朗读** — 自动朗读所有助手回复
- 🎙️ **连续对话** — 语音对话循环
- 🎛️ **交互配置** — 声音、模型、引擎、区域设置

## 安装

```bash
# 从 npm 安装
pi install npm:@wenjinnn/pi-mimo-voice

# 或从 GitHub 安装
pi install git:github.com/wenjinnn/pi-mimo-voice

# 或手动克隆
cd ~/.pi/agent/extensions
git clone https://github.com/wenjinnn/pi-mimo-voice.git
```

## 快速开始

```bash
# 1. 设置 API 密钥（通过环境变量或 pi /login）
export XIAOMI_TOKEN_PLAN_CN_API_KEY="your-key"  # 中国区域
# 或: export XIAOMI_API_KEY="your-key"          # 全球

# 2. 重启 pi 或 /reload

# 3. 尝试
/speak 你好，这是 MiMo 语音测试！
/listen
/listen stop
```

## 命令

### 文字转语音

| 命令 | 说明 |
|------|------|
| `/speak <文字>` | 使用 MiMo TTS 朗读文字 |

### 语音转文字

| 命令 | 说明 |
|------|------|
| `/listen` | 开始录音（手动 `/listen stop` 停止） |
| `/listen stop` | 停止录音并转写 |
| `/listen auto-stop N` | 录音 N 秒后自动转写 |
| `/listen N` | 录音 N 秒（最大 60）后转写 |

### 自动朗读与连续对话

| 命令 | 说明 |
|------|------|
| `/auto-speak` | 切换自动朗读（朗读所有助手回复）。使用 `/auto-speak on|off` 显式控制 |
| `/live` | 开启/关闭连续语音模式（自动朗读+开始录音） |
| `/live reply` | 停止录音、转写、发送给 LLM |

**连续对话流程：**
1. `/live` → 开始录音
2. 说话
3. `/live reply` → 停止录音、转写、发送
4. AI 回复 → 自动朗读 → 开始下一轮录音
5. 重复步骤 2
6. `/live` 结束

### 配置

| 命令 | 说明 |
|------|------|
| `/voice-config` | 交互式设置：声音、TTS 模型、STT 引擎、API 区域 |

## LLM 工具

安装后，LLM 可直接调用以下工具：

### `mimo_tts`

文字转语音。参数：
- `text`（必填）— 要朗读的文字
- `style`（可选）— 风格指令（如 "excited"、"calm"、"东北话"）

### `mimo_stt`

录音并转写。参数：
- `duration`（可选）— 录音时长（秒，默认：10，最大：60）
- `auto_stop`（可选）— 静音自动停止（默认：false）

## 声音列表

### 预设声音

| 声音 | ID | 语言 | 性别 |
|------|-----|------|------|
| Default | `mimo_default` | auto | auto |
| 冰糖 | `冰糖` | zh | female |
| 茉莉 | `茉莉` | zh | female |
| 苏打 | `苏打` | zh | male |
| 白桦 | `白桦` | zh | male |
| Mia | `Mia` | en | female |
| Chloe | `Chloe` | en | female |
| Milo | `Milo` | en | male |
| Dean | `Dean` | en | male |

### TTS 模型

| 模型 | 说明 |
|------|------|
| `mimo-v2.5-tts` | 预设声音（默认） |
| `mimo-v2.5-tts-voicedesign` | 通过文字描述自定义声音 |
| `mimo-v2.5-tts-voiceclone` | 从音频样本克隆声音 |

## API 配置

扩展会根据 pi `auth.json` 中的 provider 自动检测 API 区域：

| Provider | auth.json 密钥 | 环境变量 | 区域 |
|----------|---------------|----------|------|
| Xiaomi MiMo | `xiaomi` | `XIAOMI_API_KEY` | 全球 |
| Token Plan CN | `xiaomi-token-plan-cn` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` | 中国 |
| Token Plan AMS | `xiaomi-token-plan-ams` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | 阿姆斯特丹 |
| Token Plan SGP | `xiaomi-token-plan-sgp` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | 新加坡 |

### 配置方式

**方式 1：环境变量**
```bash
export XIAOMI_TOKEN_PLAN_CN_API_KEY="your-key"
```

**方式 2：pi /login**
```
/login  → 选择 provider → 输入 API 密钥
```

**方式 3：auth.json**
```json
{
  "xiaomi-token-plan-cn": { "type": "api_key", "key": "your-key" }
}
```

详见 [pi providers 文档](https://pi.dev/docs/latest/providers)。

## 系统要求

- **Node.js** ≥ 18
- **MiMo API 密钥** — 通过 `pi /login` 或环境变量配置（见 [API 配置](#api-配置)）
- **ffmpeg** — 用于录音和播放（跨平台）

### 平台音频工具

| 平台 | 录音 | 播放（优先级顺序） |
|------|------|-------------------|
| **Linux** | `parecord` (PulseAudio) → ffmpeg | `paplay` → `aplay` → `ffplay` → `mpv` |
| **macOS** | ffmpeg + avfoundation | `afplay`（系统自带） → `ffplay` → `mpv` |
| **Windows** | ffmpeg + dshow | `ffplay` → `mpv` |

**Linux：** 推荐使用 PulseAudio（`parecord`/`paplay`），ALSA（`aplay`）也可用于播放。

**macOS：** 无需额外工具 — `afplay` 系统自带，ffmpeg 通过 avfoundation 处理录音。

**Windows：** 安装 [ffmpeg](https://ffmpeg.org/download.html) 并确保在 PATH 中。默认录音设备为 `audio=麦克风`，可通过 `MIC_DEVICE` 环境变量覆盖。

> ⚠️ **跨平台说明：** macOS 和 Windows 支持基于 ffmpeg 的平台音频后端（avfoundation/dshow），但**尚未在实际硬件上充分测试**。Linux 是主要测试平台。如果你在 macOS 或 Windows 上遇到问题，请[提交 issue](https://github.com/wenjinnn/pi-mimo-voice/issues) — 非常欢迎反馈和贡献！

### 环境变量

| 变量 | 说明 |
|------|------|
| `MIC_DEVICE` | 覆盖录音设备（所有平台） |
| `WHISPER_MODEL` | whisper.cpp 模型文件路径 |

### npm 依赖

以下依赖由 pi 自动提供，无需手动安装：

- `@earendil-works/pi-coding-agent` — pi 扩展 API
- `@earendil-works/pi-tui` — pi TUI 组件
- `typebox` — 类型验证

### 可选

- **whisper.cpp** — 本地 STT（更快，无 API 调用）
  - 设置路径：`/voice-config` → Whisper.cpp Path
  - 下载模型：`whisper-cpp-download-ggml-model base`

## 工作原理

### TTS 流程

```
文字 → MiMo TTS API → WAV 音频 → paplay/aplay/ffplay/mpv
```

### STT 流程

```
麦克风 → parecord/ffmpeg → WAV 文件 → whisper.cpp 或 MiMo API → 文字
```

### 连续对话流程

```
/live → 开始录音
用户说话
/live reply → 停止录音 → 转写 → 发送给 LLM
LLM 回复 → 自动朗读回复
自动开始下一轮录音
```

## 反馈与贡献

本项目持续维护中。如有问题、建议或功能需求：

- 🐛 [提交 issue](https://github.com/wenjinnn/pi-mimo-voice/issues)
- 🔀 [提交 Pull Request](https://github.com/wenjinnn/pi-mimo-voice/pulls)
- 💬 分享你的使用体验和建议

欢迎任何形式的贡献！

## 许可证

MIT
