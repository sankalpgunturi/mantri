import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, "..", ".env"), "utf-8");
const vars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.includes("=")) continue;
  const [k, ...r] = line.split("=");
  vars[k.trim()] = r.join("=").trim();
}

const configs = [
  { port: 1025, secure: true, label: "1025 + secure:true (implicit TLS)" },
  { port: 1025, secure: false, requireTLS: true, label: "1025 + requireTLS" },
  { port: 1025, secure: false, ignoreTLS: true, label: "1025 + ignoreTLS" },
];

for (const cfg of configs) {
  console.log("Trying: " + cfg.label);
  const t = nodemailer.createTransport({
    host: "127.0.0.1",
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: vars.PROTON_EMAIL, pass: vars.PROTON_BRIDGE_PASSWORD },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    requireTLS: cfg.requireTLS ?? undefined,
    ignoreTLS: cfg.ignoreTLS ?? undefined,
  });
  try {
    await t.verify();
    console.log("  ✓ WORKS!");
    t.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("  ✗ " + msg);
    t.close();
  }
}
