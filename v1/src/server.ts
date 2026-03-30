import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env BEFORE importing config (which reads process.env at import time)
try {
  const envPath = resolve(__dirname, "..", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("#") || !line.trim() || !line.includes("=")) continue;
    const eqIdx = line.indexOf("=");
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {}

async function main() {
  const { validateElevenLabsConfig, config } = await import("./config.js");
  const { router } = await import("./api/routes.js");
  const express = (await import("express")).default;

  validateElevenLabsConfig();

  const app = express();

  app.use(express.json());
  app.use(express.static(resolve(__dirname, "..", "public")));

  app.use(router);

  app.listen(config.port, () => {
    console.log(`Mantri server running at http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
