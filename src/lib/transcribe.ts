/**
 * Transcription module — pipeline completo e robusto.
 *
 * Strategy (sempre tenta tudo, nunca falha silenciosamente):
 *   1. Se NVIDIA_NIM_API_KEY está configurada → usa NVIDIA Parakeet ASR (rápido, cloud)
 *   2. Se não, tenta Whisper local (pip install openai-whisper). Se não estiver instalado,
 *      tenta instalar automaticamente (pip install --quiet openai-whisper).
 *   3. Se Whisper também falhar, registra o erro mas NÃO bloqueia o processamento —
 *      o vídeo entra no banco com transcript vazio e o erro em processingError.
 *
 * Retorna sempre um resultado com engine preenchido e, quando aplicável,
 * um note explicando o que aconteceu.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { nimTranscribe, isNimAvailable } from "./nvidia-nim";

/**
 * Extract audio (mp3, 16kHz mono) from a video file using ffmpeg.
 * Returns the path to a temporary .mp3 file. Caller MUST delete it.
 */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-audio-"));
  const outPath = path.join(tmpDir, `audio-${Date.now()}.mp3`);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-i", videoPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "64k",
      outPath,
    ];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg audio extract exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  return outPath;
}

/**
 * Check if openai-whisper is installed in Python.
 */
async function isWhisperInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("python3", ["-c", "import whisper; print('OK')"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (c) => { out += c.toString(); });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0 && out.includes("OK")));
  });
}

/**
 * Try to install openai-whisper silently via pip.
 * Returns true on success.
 */
async function installWhisper(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("pip3", ["install", "--quiet", "openai-whisper"], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (c) => { err += c.toString(); });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => {
      if (code === 0) resolve(true);
      else {
        console.warn("Whisper install failed:", err.slice(-300));
        resolve(false);
      }
    });
  });
}

/**
 * Run local Whisper on the given audio file.
 * If Whisper isn't installed, tries to install it first.
 * Returns the transcript text or null if it can't be done.
 */
async function tryLocalWhisper(audioPath: string): Promise<{ text: string | null; error?: string }> {
  // Check if installed
  let installed = await isWhisperInstalled();
  if (!installed) {
    console.log("Whisper not installed, attempting automatic install...");
    installed = await installWhisper();
    if (!installed) {
      return {
        text: null,
        error: "Whisper não está instalado e não foi possível instalar automaticamente. Instale manualmente com: pip install openai-whisper",
      };
    }
  }

  // Run transcription with tiny model for speed
  const script = `
import sys
try:
    import whisper
except ImportError:
    print("__NO_WHISPER__", end="")
    sys.exit(0)
try:
    model = whisper.load_model("tiny")
    result = model.transcribe(r"${audioPath.replace(/"/g, '\\"')}", language="pt", fp16=False)
    print(result.get("text", ""), end="")
except Exception as e:
    print(f"__ERROR__: {e}", end="", file=sys.stderr)
    sys.exit(1)
`;

  return new Promise((resolve) => {
    const proc = spawn("python3", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => { out += c.toString(); });
    proc.stderr.on("data", (c) => { err += c.toString(); });
    proc.on("error", () => resolve({ text: null, error: "Falha ao executar python3" }));
    proc.on("close", (code) => {
      if (out === "__NO_WHISPER__") {
        resolve({ text: null, error: "Whisper não disponível após install" });
      } else if (code === 0) {
        resolve({ text: out.trim() });
      } else {
        resolve({ text: null, error: err.trim() || `Whisper exited ${code}` });
      }
    });
  });
}

export interface TranscriptionResult {
  text: string;
  engine: "nvidia-nim" | "local-whisper" | "none";
  durationSeconds?: number;
  note?: string;
  error?: string;
}

/**
 * Transcribe a video file. Extracts audio first, then runs transcription.
 *
 * Always returns a result — never throws. If all engines fail, returns
 * { text: "", engine: "none", error: "..." } so the caller can persist
 * the error in the database.
 */
export async function transcribeVideo(videoPath: string): Promise<TranscriptionResult> {
  let audioPath: string | null = null;
  try {
    audioPath = await extractAudioFromVideo(videoPath);
  } catch (err) {
    return {
      text: "",
      engine: "none",
      error: `Falha ao extrair áudio: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    // Strategy 1: NVIDIA NIM ASR (Parakeet) — fast, cloud
    if (isNimAvailable()) {
      try {
        const audioBuffer = await fs.readFile(audioPath);
        const text = await nimTranscribe(audioBuffer, "audio.mp3", "audio/mpeg");
        return { text: text.trim(), engine: "nvidia-nim" };
      } catch (err) {
        console.warn("NIM ASR failed, falling back to local whisper:", err);
        // Fall through to whisper
      }
    }

    // Strategy 2: local Whisper (with auto-install if needed)
    const whisperResult = await tryLocalWhisper(audioPath);
    if (whisperResult.text !== null) {
      return { text: whisperResult.text, engine: "local-whisper" };
    }

    // Strategy 3: nothing worked — return error but don't throw
    return {
      text: "",
      engine: "none",
      error: whisperResult.error || "Nenhuma engine de transcrição disponível",
      note: "Configure NVIDIA_NIM_API_KEY (recomendado, grátis em build.nvidia.com) ou instale openai-whisper manualmente (pip install openai-whisper).",
    };
  } finally {
    if (audioPath) {
      await fs.unlink(audioPath).catch(() => {});
      await fs.rmdir(path.dirname(audioPath)).catch(() => {});
    }
  }
}
