import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  proton: {
    email: process.env.PROTON_EMAIL ?? "",
    password: process.env.PROTON_BRIDGE_PASSWORD ?? "",
    imapPort: parseInt(process.env.PROTON_IMAP_PORT ?? "1143", 10),
    smtpPort: parseInt(process.env.PROTON_SMTP_PORT ?? "1025", 10),
    host: "127.0.0.1",
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    agentId: process.env.ELEVENLABS_AGENT_ID ?? "",
  },
  profilePath:
    process.env.PROFILE_PATH ??
    resolve(__dirname, "..", "data", "PROFILE.md"),
  port: parseInt(process.env.PORT ?? "3000", 10),
} as const;

export function validateConfig(): void {
  if (!config.proton.email) {
    throw new Error("PROTON_EMAIL environment variable is required");
  }
  if (!config.proton.password) {
    throw new Error("PROTON_BRIDGE_PASSWORD environment variable is required");
  }
}

export function validateElevenLabsConfig(): void {
  validateConfig();
  if (!config.elevenlabs.apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is required");
  }
}
