# pi-mimo-voice

为 [pi](https://github.com/earendil-works/pi-coding-agent) 提供语音输入 (STT) 和输出 (TTS)，由小米 MiMo V2.5 API 驱动。

[![npm version](https://img.shields.io/npm/v/pi-mimo-voice)](https://www.npmjs.com/package/pi-mimo-voice)
[![GitHub](https://img.shields.io/github/license/wenjinnn/pi-mimo-voice)](https://github.com/wenjinnn/pi-mimo-voice)

## 功能特性

- 🎤 **语音转文字 (STT)** — 录音并转写为文字
- 🔊 **文字转语音 (TTS)** — 将文字朗读出来
- 🗣️ **自动朗读** — 自动朗读所有助手回复
- 🎙️ **连续对话** — 语音对话循环
- 🎛️ **交互配置** — 声音、模型、引擎、区域设置

## 安装

```bash
# 作为 pi 扩展安装
cd ~/.pi/agent/extensions
git clone <this-repo> pi-mimo-voice

# 或从 npm 安装（发布后）
npx pi-package install pi-mimo-voice
```

## 快速开始

```bash
# 1. 设置 API 密钥（或通过 pi /login 配置）
export MIMO_API_KEY="your-key"

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
| `/auto-speak` | 切换自动朗读（朗读所有助手回复） |
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

| Provider | 区域 |
|----------|------|
| `xiaomi-token-plan-cn` | 中国 |
| `xiaomi-token-plan-ams` | 阿姆斯特丹 |
| `xiaomi-token-plan-sgp` | 新加坡 |
| `xiaomi` | 全球 |

## 系统要求

- **Node.js** ≥ 18
- **PulseAudio** — 用于录音（`parecord`）
- **音频播放器** — 任一：`paplay`、`aplay`、`ffplay`、`mpv`
- **MiMo API 密钥** — 通过 `pi /login` 或 `MIMO_API_KEY` 环境变量配置

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
麦克风 → parecord → WAV 文件 → whisper.cpp 或 MiMo API → 文字
```

### 连续对话流程

```
/live → 开始录音
用户说话
/live reply → 停止录音 → 转写 → 发送给 LLM
LLM 回复 → 自动朗读回复
自动开始下一轮录音
```

## 许可证

MIT
