import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "..", "data");
const LOGS_DIR = resolve(DATA_DIR, "logs");
const SUMMARY_PATH = resolve(DATA_DIR, "conversation-summary.md");

const MAX_SUMMARY_CHARS = 2500;

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function logPath(date: string): string {
  return resolve(LOGS_DIR, `${date}.md`);
}

// ── Rolling Summary ──

export async function getSummary(): Promise<string> {
  try {
    return await readFile(SUMMARY_PATH, "utf-8");
  } catch {
    return "";
  }
}

export async function updateSummary(
  transcript: string[]
): Promise<void> {
  await ensureDir(DATA_DIR);

  const current = await getSummary();
  const today = todayDate();

  const newEntries = transcript
    .filter((line) => line.trim().length > 0)
    .slice(-30)
    .map((line) => `  - ${line.slice(0, 200)}`)
    .join("\n");

  const todayBlock = `\n### ${today}\n${newEntries}\n`;
  let updated = current + todayBlock;

  if (updated.length > MAX_SUMMARY_CHARS) {
    const lines = updated.split("\n");
    while (updated.length > MAX_SUMMARY_CHARS && lines.length > 10) {
      lines.splice(0, 1);
      updated = lines.join("\n");
    }
    updated = "# Conversation History (condensed)\n\n" + updated.trimStart();
  }

  await writeFile(SUMMARY_PATH, updated, "utf-8");
}

// ── Dated Logs ──

export async function appendLog(
  entries: string[]
): Promise<void> {
  await ensureDir(LOGS_DIR);
  const date = todayDate();
  const path = logPath(date);

  let existing = "";
  try {
    existing = await readFile(path, "utf-8");
  } catch {}

  const timestamp = new Date().toISOString().slice(11, 19);
  const session = entries
    .map((e) => `[${timestamp}] ${e}`)
    .join("\n");

  const updated = existing
    ? existing.trimEnd() + "\n\n" + session + "\n"
    : `# Mantri Conversation Log — ${date}\n\n${session}\n`;

  await writeFile(path, updated, "utf-8");
}

export async function getLog(date: string): Promise<string> {
  try {
    return await readFile(logPath(date), "utf-8");
  } catch {
    return `No conversation log found for ${date}.`;
  }
}

export async function saveNote(note: string): Promise<void> {
  await ensureDir(LOGS_DIR);
  const date = todayDate();
  const path = logPath(date);

  let existing = "";
  try {
    existing = await readFile(path, "utf-8");
  } catch {}

  const timestamp = new Date().toISOString().slice(11, 19);
  const entry = `[${timestamp}] NOTE: ${note}`;

  const updated = existing
    ? existing.trimEnd() + "\n" + entry + "\n"
    : `# Mantri Conversation Log — ${date}\n\n${entry}\n`;

  await writeFile(path, updated, "utf-8");
}
