import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.includes("=")) continue;
  const [key, ...rest] = line.split("=");
  process.env[key.trim()] = rest.join("=").trim();
}

const email = process.env.PROTON_EMAIL!;
const password = process.env.PROTON_BRIDGE_PASSWORD!;
const imapPort = parseInt(process.env.PROTON_IMAP_PORT ?? "1143", 10);
const smtpPort = parseInt(process.env.PROTON_SMTP_PORT ?? "1025", 10);

console.log(`Email: ${email}`);
console.log(`IMAP port: ${imapPort}, SMTP port: ${smtpPort}\n`);

// Test 1: List IMAP folders
console.log("=== IMAP: Listing all folders ===");
const imap = new ImapFlow({
  host: "127.0.0.1",
  port: imapPort,
  secure: false,
  auth: { user: email, pass: password },
  tls: { rejectUnauthorized: false },
  logger: false,
});

try {
  await imap.connect();
  console.log("IMAP connected OK\n");
  const mailboxes = await imap.list();
  for (const mb of mailboxes) {
    const status = await imap.status(mb.path, {
      messages: true,
      unseen: true,
    });
    console.log(
      `  ${mb.path}  (${status.messages} total, ${status.unseen} unread)`
    );
  }
  await imap.logout();
} catch (err) {
  console.error("IMAP error:", err);
}

// Test 2: SMTP connection
console.log("\n=== SMTP: Testing connection ===");
for (const port of [smtpPort, 587, 465, 1025]) {
  const secure = port === 465;
  console.log(`\n  Trying port ${port} (secure=${secure})...`);
  const transport = nodemailer.createTransport({
    host: "127.0.0.1",
    port,
    secure,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
  });
  try {
    await transport.verify();
    console.log(`  ✓ Port ${port} works!`);
    transport.close();
    break;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Port ${port} failed: ${msg}`);
    transport.close();
  }
}
