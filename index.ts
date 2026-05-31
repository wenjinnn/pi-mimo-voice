/**
 * MiMo Voice Extension for Pi
 *
 * Adds voice input (STT) and output (TTS) to pi using:
 * - MiMo V2.5 TTS API for speech synthesis
 * - whisper.cpp (local) or MiMo audio understanding for speech recognition
 *
 * Commands:
 *   /speak <text>    - Speak text aloud using MiMo TTS
 *   /listen          - Record audio and transcribe (STT)
 *   /voice-config    - Configure voice settings
 *   /auto-speak      - Toggle auto-speak mode (read all replies)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ─── Constants ──────────────────────────────────────────────────────────────

const MIMO_API_URLS: Record<string, string> = {
  "xiaomi-token-plan-cn": "https://token-plan-cn.xiaomimimo.com/v1",
  "xiaomi-token-plan-ams": "https://token-plan-ams.xiaomimimo.com/v1",
  "xiaomi-token-plan-sgp": "https://token-plan-sgp.xiaomimimo.com/v1",
  "xiaomi": "https://api.xiaomimimo.com/v1",
};

const PROVIDER_LABELS: Record<string, string> = {
  "xiaomi-token-plan-cn": "Token Plan CN (China)",
  "xiaomi-token-plan-ams": "Token Plan AMS (Amsterdam)",
  "xiaomi-token-plan-sgp": "Token Plan SGP (Singapore)",
  "xiaomi": "MiMo API (Global)",
};

const PRESET_VOICES = [
  { id: "mimo_default", name: "Default", lang: "auto", gender: "auto" },
  { id: "冰糖", name: "Bing Tang", lang: "zh", gender: "female" },
  { id: "茉莉", name: "Mo Li", lang: "zh", gender: "female" },
  { id: "苏打", name: "Su Da", lang: "zh", gender: "male" },
  { id: "白桦", name: "Bai Hua", lang: "zh", gender: "male" },
  { id: "Mia", name: "Mia", lang: "en", gender: "female" },
  { id: "Chloe", name: "Chloe", lang: "en", gender: "female" },
  { id: "Milo", name: "Milo", lang: "en", gender: "male" },
  { id: "Dean", name: "Dean", lang: "en", gender: "male" },
];

const TTS_MODELS = [
  { id: "mimo-v2.5-tts", name: "Preset Voices", desc: "Built-in high-quality voices" },
  { id: "mimo-v2.5-tts-voicedesign", name: "Voice Design", desc: "Customize voice via text description" },
  { id: "mimo-v2.5-tts-voiceclone", name: "Voice Clone", desc: "Clone voice from audio sample" },
];

// ─── State ──────────────────────────────────────────────────────────────────

interface VoiceState {
  autoSpeak: boolean;
  voice: string;
  ttsModel: string;
  style: string;
  whisperPath: string | null;
  whisperModel: string | null;
  sttEngine: "whisper" | "mimo";
  provider: string;
  autoStopSilence: number; // seconds of silence before auto-stop
}

const state: VoiceState = {
  autoSpeak: false,
  voice: process.env.MIMO_TTS_VOICE || "mimo_default",
  ttsModel: process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts",
  style: "",
  whisperPath: null,
  whisperModel: null,
  sttEngine: "whisper",
  provider: "auto",
  autoStopSilence: 3,
};

/** Start recording in background. onFinish(audioPath) is called once when recording stops. */
async function startRecording(
  onFinish: (audioPath: string) => Promise<void>,
  maxDurationMs: number = 120000,
): Promise<void> {
  const outFile = await tmpFile(".wav");
  _recordingFile = outFile;
  _recordingStartedAt = Date.now();

  // Use parecord (reliable on PulseAudio)
  if (cmdExists("parecord")) {
    return new Promise((resolve, reject) => {
      const proc = spawn("parecord", [
        "--file-format=wav", "--channels=1", "--rate=16000", "--format=s16le", outFile,
      ], { stdio: ["pipe", "ignore", "ignore"] });
      _recordingProc = proc;
      let done = false;
      const finish = async () => {
        if (done) return;
        done = true;
        _recordingProc = null;
        _recordingFile = null;
        if (_recordingTimer) { clearTimeout(_recordingTimer); _recordingTimer = null; }
        if (!_recordingCancelled) {
          await onFinish(outFile);
        } else {
          await unlink(outFile).catch(() => {});
        }
        _recordingCancelled = false;
        resolve();
      };
      _recordingTimer = setTimeout(() => proc.kill("SIGINT"), maxDurationMs);
      proc.on("close", () => finish());
      proc.on("error", (e) => { if (!done) reject(e); });
    });
  }

  // Fallback: ffmpeg without silencedetect
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y", "-f", "pulse", "-i", "default",
      "-f", "wav", "-ar", "16000", "-ac", "1", outFile,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    _recordingProc = proc;
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      _recordingProc = null;
      _recordingFile = null;
      if (_recordingTimer) { clearTimeout(_recordingTimer); _recordingTimer = null; }
      if (!_recordingCancelled) {
        await onFinish(outFile);
      }
      _recordingCancelled = false;
      resolve();
    };
    _recordingTimer = setTimeout(() => proc.kill("SIGINT"), maxDurationMs);
    proc.on("close", () => finish());
    proc.on("error", (e) => { if (!done) reject(e); });
  });
}

/** Stop active recording and return the file path, or null if nothing was recording. */
// Active recording state
let _recordingProc: ChildProcess | null = null;
let _recordingFile: string | null = null;
let _recordingTimer: ReturnType<typeof setTimeout> | null = null;
let _recordingStartedAt: number = 0;
let _recordingCancelled: boolean = false;

function stopRecording(cancel: boolean = false): void {
  if (cancel) _recordingCancelled = true;
  if (_recordingProc) {
    _recordingProc.kill("SIGTERM");
    _recordingProc = null;
  }
  if (_recordingTimer) {
    clearTimeout(_recordingTimer);
    _recordingTimer = null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let _cachedApiKey: string | null = null;
let _resolvedProvider: string | null = null;

/**
 * Resolve API key from pi's auth.json.
 * Supports: "!command" (shell), "ENV_VAR" (env), or literal value.
 */
function resolvePiAuthKey(provider: string): string | null {
  try {
    const home = process.env.HOME || "";
    const authPath = `${home}/.pi/agent/auth.json`;
    const raw = execSync(`cat '${authPath}'`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const auth = JSON.parse(raw);
    const entry = auth[provider];
    if (!entry?.key) return null;

    const keyValue: string = entry.key;

    if (keyValue.startsWith("!")) {
      return execSync(keyValue.slice(1), {
        encoding: "utf-8",
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    }

    if (process.env[keyValue]) return process.env[keyValue]!;

    if (keyValue.startsWith("sk-") || keyValue.length > 20) return keyValue;

    return null;
  } catch {
    return null;
  }
}

function getApiKey(): string {
  if (_cachedApiKey) return _cachedApiKey;

  // 1. Direct environment variables
  const envVars: Array<[string, string]> = [
    ["MIMO_API_KEY", "xiaomi"],
    ["XIAOMI_TOKEN_PLAN_CN_API_KEY", "xiaomi-token-plan-cn"],
    ["XIAOMI_API_KEY", "xiaomi"],
  ];
  for (const [envKey, provider] of envVars) {
    if (process.env[envKey]) {
      _cachedApiKey = process.env[envKey]!;
      if (!_resolvedProvider) _resolvedProvider = provider;
      return _cachedApiKey;
    }
  }

  // 2. Read from pi's auth.json
  const providers = [
    "xiaomi-token-plan-cn",
    "xiaomi",
    "xiaomi-token-plan-ams",
    "xiaomi-token-plan-sgp",
  ];
  for (const p of providers) {
    const key = resolvePiAuthKey(p);
    if (key) {
      _cachedApiKey = key;
      if (!_resolvedProvider) _resolvedProvider = p;
      return key;
    }
  }

  throw new Error(
    "MiMo API key not found. Set MIMO_API_KEY env var, or configure via '/login' in pi."
  );
}

function getApiBase(): string {
  if (!_cachedApiKey) getApiKey();
  // If user explicitly selected a provider, use it
  if (state.provider !== "auto" && MIMO_API_URLS[state.provider]) {
    return MIMO_API_URLS[state.provider];
  }
  return MIMO_API_URLS[_resolvedProvider || "xiaomi"] || MIMO_API_URLS["xiaomi"];
}

async function tmpFile(ext: string): Promise<string> {
  const dir = join(tmpdir(), "pi-mimo-voice");
  await mkdir(dir, { recursive: true });
  return join(dir, `${randomUUID()}${ext}`);
}

function cmdExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findWhisper(): string | null {
  const candidates = [
    "whisper-cpp", "whisper.cpp", "whisper",
    "/usr/local/bin/whisper-cpp", "/opt/homebrew/bin/whisper-cpp",
  ];
  for (const c of candidates) {
    if (cmdExists(c)) return c;
  }
  return null;
}

function findWhisperModel(): string | null {
  if (process.env.WHISPER_MODEL) return process.env.WHISPER_MODEL;
  const home = process.env.HOME || "";
  const candidates = [
    join(home, ".cache/whisper/ggml-base.bin"),
    join(home, ".cache/whisper/ggml-small.bin"),
    join(home, ".cache/whisper/ggml-medium.bin"),
    join(home, ".cache/whisper/ggml-large-v3.bin"),
    join(home, ".cache/whisper/ggml-base.en.bin"),
    "/tmp/ggml-base.bin",
  ];
  for (const c of candidates) {
    try {
      execSync(`test -f "${c}"`, { stdio: "ignore" });
      return c;
    } catch { /* not found */ }
  }
  return null;
}

// ─── TTS ────────────────────────────────────────────────────────────────────

async function callMimoTTS(text: string, styleInstruction?: string): Promise<Buffer> {
  const apiKey = getApiKey();
  const messages: Array<{ role: string; content: string }> = [];

  if (styleInstruction) {
    messages.push({ role: "user", content: styleInstruction });
  } else if (state.style) {
    messages.push({ role: "user", content: state.style });
  }

  messages.push({ role: "assistant", content: text });

  const audio: Record<string, unknown> = {
    format: "wav",
    voice: state.voice,
  };

  const body: Record<string, unknown> = {
    model: state.ttsModel,
    messages,
    audio,
  };

  // voicedesign model needs optimize_text_preview
  if (state.ttsModel === "mimo-v2.5-tts-voicedesign") {
    audio.optimize_text_preview = true;
    if (!styleInstruction && !state.style) {
      messages.length = 0;
      messages.push({ role: "user", content: "A warm, clear, natural voice." });
      messages.push({ role: "assistant", content: text });
    }
  }

  const resp = await fetch(`${getApiBase()}/chat/completions`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MiMo TTS API ${resp.status}: ${errText}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { audio?: { data: string } } }>;
  };

  const audioData = data.choices?.[0]?.message?.audio?.data;
  if (!audioData) throw new Error("No audio data in TTS response");
  return Buffer.from(audioData, "base64");
}

async function playAudio(filePath: string): Promise<void> {
  const players = [
    { cmd: "paplay", args: [filePath] },
    { cmd: "aplay", args: [filePath] },
    { cmd: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath] },
    { cmd: "mpv", args: ["--no-video", "--really-quiet", filePath] },
  ];
  for (const p of players) {
    if (cmdExists(p.cmd)) {
      return new Promise((resolve, reject) => {
        const child = spawn(p.cmd, p.args, { stdio: "ignore" });
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${p.cmd} exited ${code}`))));
        child.on("error", reject);
      });
    }
  }
  throw new Error("No audio player found. Install paplay, aplay, ffplay, or mpv.");
}

// ─── STT ────────────────────────────────────────────────────────────────────

/**
 * Record audio with optional silence-based auto-stop.
 * silentDuration: if > 0, auto-stop after this many ms of silence (requires ffmpeg).
 */
async function recordAudio(durationMs: number = 10000): Promise<string> {
  const outFile = await tmpFile(".wav");

  if (cmdExists("parecord")) {
    return new Promise((resolve, reject) => {
      const child = spawn("parecord", [
        "--file-format=wav", "--channels=1", "--rate=16000", "--format=s16le", outFile,
      ], { stdio: ["pipe", "ignore", "ignore"] });
      const timer = setTimeout(() => child.kill("SIGINT"), durationMs);
      child.on("close", () => { clearTimeout(timer); resolve(outFile); });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y", "-f", "pulse", "-i", "default",
      "-f", "wav", "-ar", "16000", "-ac", "1", outFile,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    const timer = setTimeout(() => child.kill("SIGINT"), durationMs);
    child.on("close", () => { clearTimeout(timer); resolve(outFile); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
  throw new Error("No recording tool found. Install pulseaudio (parecord) or ffmpeg.");
}

async function transcribeWithWhisper(audioPath: string): Promise<string> {
  const whisperBin = state.whisperPath || findWhisper();
  const model = state.whisperModel || findWhisperModel();
  if (!whisperBin) throw new Error("whisper.cpp not found.");
  if (!model) throw new Error("Whisper model not found. Set WHISPER_MODEL or download to ~/.cache/whisper/.");
  const outFile = audioPath.replace(/\.[^.]+$/, "");

  return new Promise((resolve, reject) => {
    const child = spawn(whisperBin, [
      "-m", model, "-f", audioPath, "--output-txt", "--output-file", outFile,
      "--language", "auto", "--no-timestamps",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", async (code) => {
      if (code !== 0) return reject(new Error(`whisper.cpp failed (${code}): ${stderr}`));
      try { resolve((await readFile(`${outFile}.txt`, "utf-8")).trim()); }
      catch { reject(new Error("Could not read whisper output")); }
    });
    child.on("error", reject);
  });
}

async function transcribeWithMimo(audioPath: string): Promise<string> {
  const apiKey = getApiKey();
  const audioBuffer = await readFile(audioPath);
  const base64Audio = audioBuffer.toString("base64");
  const mime = audioPath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";

  const resp = await fetch(`${getApiBase()}/chat/completions`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mimo-v2.5",
      messages: [{
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: `data:${mime};base64,${base64Audio}` } },
          {
            type: "text",
            text: "Transcribe the speech in this audio to text. Output only the transcribed text, no explanations. If no speech is detected, output [NO SPEECH].",
          },
        ],
      }],
      max_completion_tokens: 4096,
    }),
  });

  if (!resp.ok) throw new Error(`MiMo Audio API ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    choices: Array<{ message: { content?: string; reasoning_content?: string } }>;
  };
  const msg = data.choices?.[0]?.message;
  return (msg?.content || msg?.reasoning_content || "").trim();
}

async function transcribeAudio(audioPath: string): Promise<string> {
  if (state.sttEngine === "whisper") {
    try { return await transcribeWithWhisper(audioPath); }
    catch (e) {
      console.error(`whisper failed, falling back to MiMo: ${e}`);
      return await transcribeWithMimo(audioPath);
    }
  }
  return await transcribeWithMimo(audioPath);
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Register message renderer for persistent records ───────────────────
  pi.registerMessageRenderer("mimo-voice", (message, _options, theme) => {
    return new Text(theme.fg("accent", message.content), 0, 0);
  });

  // ── Detect STT capabilities on startup ──────────────────────────────────
  pi.on("session_start", async (_event, _ctx) => {
    const whisperBin = findWhisper();
    state.whisperPath = whisperBin;
    state.whisperModel = findWhisperModel();
    if (!whisperBin) state.sttEngine = "mimo";
  });

  // ── Live mode ────────────────────────────────────────────────────────
  let _liveMode = false;
  let _liveModeGeneration = 0; // Incremented on each toggle to detect stale callbacks

  async function startLiveListen(ctx: ExtensionContext) {
    if (!_liveMode) return;
    try {
      const transcribeAndSend = async (audioPath: string) => {
        const elapsed = ((Date.now() - _recordingStartedAt) / 1000).toFixed(1);
        const text = await transcribeAudio(audioPath);
        await unlink(audioPath).catch(() => {});
        if (text && text !== "[NO SPEECH]") {
          pi.sendMessage({
            customType: "mimo-voice",
            content: `🎤 [STT ${elapsed}s] ${text}`,
            display: true,
          }, { deliverAs: "followUp" });
          pi.sendUserMessage(text);
        } else {
          ctx.ui.notify("No speech detected. Say something and try /live reply again.", "warning");
          // Don't auto-restart, let user try again
        }
      };
      startRecording(transcribeAndSend);
      ctx.ui.notify("Listening... say /live reply when done speaking.", "info");
    } catch (e) {
      ctx.ui.notify(`Live listen failed: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  pi.registerCommand("live", {
    description: "Toggle live voice mode. /live to start, /live reply when done speaking, /live to stop.",
    handler: async (args, ctx) => {
      const argStr = args?.trim() || "";

      // /live reply — stop recording, transcribe, send
      if (argStr === "reply") {
        if (!_liveMode) {
          ctx.ui.notify("Live mode is not active. Use /live first.", "warning");
          return;
        }
        if (!_recordingProc) {
          ctx.ui.notify("No active recording. Say /live to start listening.", "warning");
          return;
        }
        ctx.ui.notify("Stopping recording...", "info");
        stopRecording();
        // The onFinish callback will transcribe and send
        return;
      }

      // /live — toggle on/off
      if (_liveMode) {
        _liveMode = false;
        _liveModeGeneration++; // Invalidate any pending callbacks
        state.autoSpeak = false;
        if (_recordingProc) stopRecording(true);
        ctx.ui.notify("Live mode: OFF", "info");
        return;
      }

      _liveMode = true;
      _liveModeGeneration++;
      state.autoSpeak = true;
      ctx.ui.notify("Live mode: ON (auto-speak enabled)", "info");
      await startLiveListen(ctx);
    },
  });

  // ── Auto-speak: read assistant replies ──────────────────────────────────
  // Guard to prevent re-entrant auto-speak (TTS output triggering another TTS)
  let _autoSpeakInProgress = false;
  // Flag: set when mimo_tts tool plays audio, so message_end skips auto-speak for that turn
  let _ttsJustPlayed = false;

  pi.on("message_end", async (event, ctx) => {
    if (!state.autoSpeak || event.message.role !== "assistant") return;
    if (_autoSpeakInProgress) return; // Skip messages produced by TTS itself
    if (_ttsJustPlayed) { _ttsJustPlayed = false; return; } // TTS tool already played audio

    const content = event.message.content;
    // Content can be a string or an array of content blocks
    let text: string = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ");
    }
    if (!text.trim()) return;

    // Skip TTS tool output messages to avoid echo loop
    if (text.startsWith("🔊 TTS:")) return;

    const maxChars = 2000;
    const ttsText = text.length > maxChars ? text.slice(0, maxChars) + "…" : text;

    // Capture generation before TTS to detect if live mode was toggled during playback
    const generationBeforeTTS = _liveModeGeneration;

    try {
      _autoSpeakInProgress = true;
      const audioBuffer = await callMimoTTS(ttsText);
      const audioFile = await tmpFile(".wav");
      await writeFile(audioFile, audioBuffer);
      await playAudio(audioFile);
      await unlink(audioFile).catch(() => {});
    } catch (e) {
      ctx.ui.notify(`Auto-speak failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      _autoSpeakInProgress = false;
    }

    // Only restart live listening if live mode is STILL active and wasn't toggled during TTS
    if (_liveMode && _liveModeGeneration === generationBeforeTTS) {
      await startLiveListen(ctx);
    }
  });

  // ── Register tools ─────────────────────────────────────────────────────

  pi.registerTool({
    name: "mimo_tts",
    label: "MiMo TTS",
    description:
      "Convert text to speech using MiMo V2.5 TTS. Reads text aloud through speakers. " +
      "Use when the user asks to hear something spoken, or when a spoken response is more appropriate.",
    promptSnippet: "Speak text aloud using MiMo TTS voice synthesis",
    promptGuidelines: [
      "Use mimo_tts when the user asks to hear text spoken aloud, to read something out, or says '说给我听' / '读出来'.",
      "Use mimo_tts with a style instruction for expressive speech (e.g., excited, calm, storytelling).",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "Text to speak" }),
      style: Type.Optional(
        Type.String({
          description:
            "Optional style instruction in natural language, e.g. '温柔舒缓的语调' or 'excited and bouncy'. " +
            "Placed in the user message to control synthesis style.",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      try {
        onUpdate?.({ content: [{ type: "text", text: `Starting TTS (${params.text.length} chars)...` }] });
        const audioBuffer = await callMimoTTS(params.text, params.style);
        onUpdate?.({ content: [{ type: "text", text: "Synthesized, playing..." }] });
        const audioFile = await tmpFile(".wav");
        await writeFile(audioFile, audioBuffer);
        await playAudio(audioFile);
        await unlink(audioFile).catch(() => {});
        _ttsJustPlayed = true; // Prevent auto-speak from reading the response again
        return {
          content: [{ type: "text", text: `🔊 TTS: ${params.text}` }],
          details: { chars: params.text.length, voice: state.voice, style: params.style },
        };
      } catch (e) {
        throw new Error(`MiMo TTS failed: ${e instanceof Error ? e.message : e}`);
      }
    },
  });

  pi.registerTool({
    name: "mimo_stt",
    label: "MiMo STT",
    description:
      "Record audio from microphone and transcribe speech to text. " +
      "Use when the user asks to 'listen', 'record', or input voice.",
    promptSnippet: "Record and transcribe voice from microphone",
    promptGuidelines: [
      "Use mimo_stt when the user says '听我说' / '我说' / 'record my voice' or asks to input via voice.",
    ],
    parameters: Type.Object({
      duration: Type.Optional(
        Type.Number({ description: "Recording duration in seconds (default: 10, max: 60). Ignored if auto_stop is true.", minimum: 1, maximum: 60 })
      ),
      auto_stop: Type.Optional(
        Type.Boolean({ description: "Auto-stop when ~2s of silence is detected (default: false)" })
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const auto = params.auto_stop === true;
      const duration = auto ? 30000 : Math.min((params.duration ?? 10), 60) * 1000;
      const silentMs = auto ? 2000 : 0;
      try {
        onUpdate?.({ content: [{ type: "text", text: `Recording ${auto ? "(auto-stop)" : duration / 1000 + "s"}...` }] });
        const audioPath = await recordAudio(duration);
        onUpdate?.({ content: [{ type: "text", text: "Transcribing..." }] });
        const text = await transcribeAudio(audioPath);
        await unlink(audioPath).catch(() => {});
        if (!text || text === "[NO SPEECH]") {
          return { content: [{ type: "text", text: "No speech detected." }], details: { transcription: "" } };
        }
        return {
          content: [{ type: "text", text: `Transcription:\n\n${text}` }],
          details: { transcription: text },
        };
      } catch (e) {
        throw new Error(`STT failed: ${e instanceof Error ? e.message : e}`);
      }
    },
  });

  // ── Commands ────────────────────────────────────────────────────────────

  pi.registerCommand("speak", {
    description: "Speak text with MiMo TTS",
    getArgumentCompletions: () => null,
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /speak <text>", "warning");
        return;
      }
      try {
        ctx.ui.notify(`Starting TTS (${args.trim().length} chars)...`, "info");
        const audioBuffer = await callMimoTTS(args.trim());
        ctx.ui.notify("Synthesized, playing...", "info");
        const audioFile = await tmpFile(".wav");
        await writeFile(audioFile, audioBuffer);
        await playAudio(audioFile);
        await unlink(audioFile).catch(() => {});
        _ttsJustPlayed = true; // Prevent auto-speak duplicate
        pi.sendMessage({
          customType: "mimo-voice",
          content: `🔊 [TTS] ${args.trim()}`,
          display: true,
        }, { deliverAs: "followUp" });
      } catch (e) {
        ctx.ui.notify(`TTS failed: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
  });

  pi.registerCommand("listen", {
    description: "Record and transcribe speech. /listen (manual), /listen stop, /listen auto-stop N",
    handler: async (args, ctx) => {
      const argStr = args?.trim() || "";

      // /listen stop — kill active recording (callback handles transcription)
      if (argStr === "stop") {
        if (!_recordingProc) {
          ctx.ui.notify("No active recording.", "warning");
          return;
        }
        ctx.ui.notify("Stopping recording...", "info");
        stopRecording();
        return;
      }

      // /listen status
      if (argStr === "status") {
        ctx.ui.notify(_recordingProc ? "Recording in progress" : "Not recording", "info");
        return;
      }

      // /listen auto-stop N — record with silence detection
      const autoMatch = argStr.match(/^auto-stop(\s+(\d+))?$/);
      if (autoMatch) {
        const silentSec = parseInt(autoMatch[2] || String(state.autoStopSilence), 10);
        ctx.ui.notify(`Recording (auto-stop after ${silentSec}s silence)...`, "info");
        const started = Date.now();
        const audioPath = await recordAudio(silentSec * 2000);
        ctx.ui.notify("Transcribing...", "info");
        const text = await transcribeAudio(audioPath);
        await unlink(audioPath).catch(() => {});
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        if (!text || text === "[NO SPEECH]") {
          ctx.ui.notify("No speech detected", "warning");
          return;
        }
        pi.sendMessage({
          customType: "mimo-voice",
          content: `🎤 [STT ${elapsed}s] ${text}`,
          display: true,
        }, { deliverAs: "followUp" });
        pi.sendUserMessage(text);
        return;
      }

      // /listen with duration — manual mode with timeout (backward compat)
      if (argStr && /^\d+$/.test(argStr)) {
        const duration = Math.min(parseInt(argStr, 10), 60);
        ctx.ui.notify(`Recording ${duration}s... speak now`, "info");
        const audioPath = await recordAudio(duration * 1000);
        ctx.ui.notify("Transcribing...", "info");
        const text = await transcribeAudio(audioPath);
        await unlink(audioPath).catch(() => {});
        if (!text || text === "[NO SPEECH]") {
          ctx.ui.notify("No speech detected", "warning");
          return;
        }
        pi.sendMessage({
          customType: "mimo-voice",
          content: `🎤 [STT ${duration}s] ${text}`,
          display: true,
        }, { deliverAs: "followUp" });
        pi.sendUserMessage(text);
        return;
      }

      // /listen (no args) — fire-and-forget, callback handles completion
      try {
        const transcribeAndSend = async (audioPath: string) => {
          const elapsed = ((Date.now() - _recordingStartedAt) / 1000).toFixed(1);
          const text = await transcribeAudio(audioPath);
          await unlink(audioPath).catch(() => {});
          if (text && text !== "[NO SPEECH]") {
            pi.sendMessage({
              customType: "mimo-voice",
              content: `🎤 [STT ${elapsed}s] ${text}`,
              display: true,
            }, { deliverAs: "followUp" });
            pi.sendUserMessage(text);
          } else {
            ctx.ui.notify("No speech detected", "warning");
          }
        };
        startRecording(transcribeAndSend);
        // Don't await — let the callback handle async completion
        ctx.ui.notify(`Recording started (timeout 60s). Say /listen stop to finish.`, "info");
      } catch (e) {
        ctx.ui.notify(`Failed to start: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
  });

  // cleanup on shutdown
  pi.on("session_shutdown", () => { stopRecording(); });

  pi.registerCommand("auto-speak", {
    description: "Toggle auto-speak (read all replies aloud)",
    handler: async (_args, ctx) => {
      state.autoSpeak = !state.autoSpeak;
      ctx.ui.notify(`Auto-speak: ${state.autoSpeak ? "ON" : "OFF"}`, "info");
    },
  });

  // cleanup live mode on shutdown
  pi.on("session_shutdown", () => {
    _liveMode = false;
    _liveModeGeneration++;
    _autoSpeakInProgress = false;
  });

  pi.registerCommand("voice-config", {
    description: "Configure voice settings (voice, model, engine, region)",
    handler: async (_args, ctx) => {
      const choices = [
        "Voice",
        "TTS Model",
        "STT Engine",
        "Default Style",
        "Auto-Stop Silence",
        "API Region",
        "whisper.cpp Path",
        "Show Current Config",
      ];

      const choice = await ctx.ui.select("Voice Settings:", choices);
      if (!choice) return;

      if (choice === "Voice") {
        const voiceChoices = PRESET_VOICES.map(
          (v) => `${v.name} (${v.id}) [${v.lang}/${v.gender}]`
        );
        const selected = await ctx.ui.select("Select voice:", voiceChoices);
        if (selected) {
          const idx = voiceChoices.indexOf(selected);
          state.voice = PRESET_VOICES[idx].id;
          ctx.ui.notify(`Voice set to: ${PRESET_VOICES[idx].name}`, "info");
        }
      } else if (choice === "TTS Model") {
        const modelChoices = TTS_MODELS.map((m) => `${m.name} — ${m.desc} (${m.id})`);
        const selected = await ctx.ui.select("Select TTS model:", modelChoices);
        if (selected) {
          const idx = modelChoices.indexOf(selected);
          state.ttsModel = TTS_MODELS[idx].id;
          ctx.ui.notify(`TTS model: ${TTS_MODELS[idx].name}`, "info");
        }
      } else if (choice === "STT Engine") {
        const engineChoices = [
          `whisper.cpp (local) ${state.whisperPath ? "✓" : "✗ not found"}`,
          "MiMo Audio Understanding (API)",
        ];
        const selected = await ctx.ui.select("Select STT engine:", engineChoices);
        if (selected) {
          state.sttEngine = selected.includes("whisper") ? "whisper" : "mimo";
          ctx.ui.notify(`STT engine: ${state.sttEngine}`, "info");
        }
      } else if (choice === "Default Style") {
        const style = await ctx.ui.input("Default style (leave empty to clear):", state.style || "");
        state.style = style || "";
        ctx.ui.notify(state.style ? `Style: ${state.style}` : "Style cleared", "info");
      } else if (choice === "Auto-Stop Silence") {
        const secs = await ctx.ui.input("Silence seconds before auto-stop:", String(state.autoStopSilence));
        const n = parseInt(secs || "3", 10);
        if (n > 0) {
          state.autoStopSilence = n;
          ctx.ui.notify(`Auto-stop silence: ${n}s`, "info");
        }
      } else if (choice === "API Region") {
        const regionChoices = [
          "auto (use current provider)",
          ...Object.entries(PROVIDER_LABELS).map(([k, v]) => `${v} (${k})`),
        ];
        const selected = await ctx.ui.select("Select API region:", regionChoices);
        if (selected) {
          if (selected.startsWith("auto")) {
            state.provider = "auto";
          } else {
            const match = selected.match(/\(([^)]+)\)$/);
            if (match) state.provider = match[1];
          }
          const label = state.provider === "auto"
            ? PROVIDER_LABELS[_resolvedProvider || "xiaomi"] || "auto"
            : PROVIDER_LABELS[state.provider] || state.provider;
          ctx.ui.notify(`API region: ${label}`, "info");
        }
      } else if (choice === "whisper.cpp Path") {
        const path = await ctx.ui.input("whisper.cpp binary path:", state.whisperPath || "");
        if (path) {
          state.whisperPath = path;
          state.sttEngine = "whisper";
          ctx.ui.notify(`whisper.cpp: ${path}`, "info");
        }
      } else if (choice === "Show Current Config") {
        const providerLabel = state.provider === "auto"
          ? (PROVIDER_LABELS[_resolvedProvider || ""] || "unknown (auto)")
          : (PROVIDER_LABELS[state.provider] || state.provider);
        const info = [
          `Voice: ${state.voice}`,
          `TTS Model: ${state.ttsModel}`,
          `STT Engine: ${state.sttEngine}`,
          `whisper.cpp: ${state.whisperPath || "not configured"}`,
          `Whisper Model: ${state.whisperModel || "not found"}`,
          `Default Style: ${state.style || "none"}`,
          `Auto-speak: ${state.autoSpeak ? "ON" : "OFF"}`,
          `Auto-Stop Silence: ${state.autoStopSilence}s`,
          `API Region: ${providerLabel}`,
          `API Endpoint: ${getApiBase()}`,
          `API Key: ${_cachedApiKey ? "resolved ✓" : "not found ⚠️"}`,
        ].join("\n");
        ctx.ui.notify(info, "info");
      }
    },
  });
}
