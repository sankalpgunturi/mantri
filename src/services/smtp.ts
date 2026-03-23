import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config.js";

function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: config.proton.host,
    port: config.proton.smtpPort,
    secure: true,
    auth: {
      user: config.proton.email,
      pass: config.proton.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export interface SendOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
}

export async function sendEmail(opts: SendOptions): Promise<string> {
  const transport = createTransport();
  try {
    const info = await transport.sendMail({
      from: config.proton.email,
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
      cc: opts.cc || undefined,
      bcc: opts.bcc || undefined,
      inReplyTo: opts.inReplyTo || undefined,
      references: opts.inReplyTo || undefined,
    });
    return info.messageId;
  } finally {
    transport.close();
  }
}
