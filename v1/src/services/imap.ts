import { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { config } from "../config.js";

function createClient(): ImapFlow {
  return new ImapFlow({
    host: config.proton.host,
    port: config.proton.imapPort,
    secure: false,
    auth: {
      user: config.proton.email,
      pass: config.proton.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    logger: false,
  });
}

export interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  preview: string;
}

export interface EmailFull {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  messageId: string;
  text: string;
  html: string;
  attachments: string[];
  listUnsubscribe: string;
}

function formatAddress(
  addr: { name?: string; address?: string }[] | undefined
): string {
  if (!addr || addr.length === 0) return "";
  return addr
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address ?? ""))
    .join(", ");
}

async function withClient<T>(
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = createClient();
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function withMailbox<T>(
  folder: string,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}

async function searchUids(
  client: ImapFlow,
  query: Record<string, unknown>
): Promise<number[]> {
  const result = await client.search(query, { uid: true });
  if (!result) return [];
  return result as number[];
}

async function fetchOneSafe(
  client: ImapFlow,
  uid: number,
  fields: Record<string, boolean>
): Promise<FetchMessageObject> {
  const msg = await client.fetchOne(uid, fields, { uid: true });
  if (!msg) throw new Error(`Email UID ${uid} not found`);
  return msg as FetchMessageObject;
}

function summaryFromEnvelope(msg: FetchMessageObject): EmailSummary {
  const env = msg.envelope;
  const from = env?.from as
    | { name?: string; address?: string }[]
    | undefined;
  return {
    uid: msg.uid,
    from: formatAddress(from),
    subject: env?.subject ?? "(no subject)",
    date: env?.date?.toISOString() ?? "",
    preview: env?.subject ?? "",
  };
}

function parseAddressField(
  field: unknown
): { name?: string; address?: string }[] | undefined {
  if (!field) return undefined;
  if (Array.isArray(field)) {
    return field.flatMap((f: { value?: { name?: string; address?: string }[] }) =>
      f.value ?? []
    );
  }
  if (typeof field === "object" && field !== null && "value" in field) {
    return (field as { value: { name?: string; address?: string }[] }).value;
  }
  return undefined;
}

async function parseMail(source: Buffer): Promise<ParsedMail> {
  return new Promise((resolve, reject) => {
    simpleParser(source, (err, mail) => {
      if (err) reject(err);
      else resolve(mail);
    });
  });
}

async function parseEmail(msg: FetchMessageObject): Promise<EmailFull> {
  if (!msg.source) throw new Error(`No source for UID ${msg.uid}`);
  const parsed = await parseMail(msg.source);

  let listUnsub = "";
  const rawHeader = parsed.headers?.get("list-unsubscribe");
  if (rawHeader) {
    listUnsub = typeof rawHeader === "string" ? rawHeader : String(rawHeader);
  }

  return {
    uid: msg.uid,
    from: formatAddress(parseAddressField(parsed.from?.value)),
    to: formatAddress(parseAddressField(parsed.to)),
    cc: formatAddress(parseAddressField(parsed.cc)),
    subject: parsed.subject ?? "(no subject)",
    date: parsed.date?.toISOString() ?? "",
    messageId: parsed.messageId ?? "",
    text: parsed.text ?? "",
    html: parsed.html || "",
    attachments: parsed.attachments.map(
      (a) => a.filename ?? `unnamed (${a.contentType})`
    ),
    listUnsubscribe: listUnsub,
  };
}

export async function getUnread(
  folder: string = "INBOX",
  limit: number = 20
): Promise<EmailSummary[]> {
  return withMailbox(folder, async (client) => {
    const uids = await searchUids(client, { seen: false });
    if (uids.length === 0) return [];

    const subset = uids.slice(-limit);
    const messages = await client.fetchAll(
      subset,
      { envelope: true },
      { uid: true }
    );

    return (messages as FetchMessageObject[])
      .map(summaryFromEnvelope)
      .reverse();
  });
}

export async function getEmail(
  uid: number,
  folder: string = "INBOX"
): Promise<EmailFull> {
  return withMailbox(folder, async (client) => {
    const msg = await fetchOneSafe(client, uid, {
      source: true,
      envelope: true,
    });
    return parseEmail(msg);
  });
}

export async function getNewsletters(
  limit: number = 50,
  folder: string = "Folders/Newsletters"
): Promise<EmailSummary[]> {
  return withMailbox(folder, async (client) => {
    const uids = await searchUids(client, { seen: false });
    if (uids.length === 0) return [];

    const subset = uids.slice(-limit);
    const messages = await client.fetchAll(
      subset,
      { envelope: true },
      { uid: true }
    );

    return (messages as FetchMessageObject[])
      .map(summaryFromEnvelope)
      .reverse();
  });
}

export interface SearchCriteria {
  from?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
}

export async function searchEmails(
  criteria: SearchCriteria,
  folder: string = "INBOX",
  limit: number = 20
): Promise<EmailSummary[]> {
  return withMailbox(folder, async (client) => {
    const query: Record<string, unknown> = {};
    if (criteria.from) query.from = criteria.from;
    if (criteria.subject) query.subject = criteria.subject;
    if (criteria.text) query.body = criteria.text;
    if (criteria.since) query.since = new Date(criteria.since);
    if (criteria.before) query.before = new Date(criteria.before);

    const uids = await searchUids(client, query);
    if (uids.length === 0) return [];

    const subset = uids.slice(-limit);
    const messages = await client.fetchAll(
      subset,
      { envelope: true },
      { uid: true }
    );

    return (messages as FetchMessageObject[])
      .map(summaryFromEnvelope)
      .reverse();
  });
}

export async function markRead(
  uids: number[],
  folder: string = "INBOX"
): Promise<void> {
  await withMailbox(folder, async (client) => {
    await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
  });
}

export async function markUnread(
  uids: number[],
  folder: string = "INBOX"
): Promise<void> {
  await withMailbox(folder, async (client) => {
    await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
  });
}

export async function deleteEmail(
  uids: number[],
  folder: string = "INBOX",
  permanent: boolean = false
): Promise<void> {
  await withMailbox(folder, async (client) => {
    if (permanent) {
      await client.messageDelete(uids, { uid: true });
    } else {
      await client.messageMove(uids, "Trash", { uid: true });
    }
  });
}

export async function moveEmail(
  uids: number[],
  targetFolder: string,
  folder: string = "INBOX"
): Promise<void> {
  await withMailbox(folder, async (client) => {
    await client.messageMove(uids, targetFolder, { uid: true });
  });
}

export async function getSent(
  limit: number = 20,
  folder: string = "Sent"
): Promise<EmailSummary[]> {
  return withMailbox(folder, async (client) => {
    const uids = await searchUids(client, { all: true });
    if (uids.length === 0) return [];
    const subset = uids.slice(-limit);
    const messages = await client.fetchAll(
      subset,
      { envelope: true },
      { uid: true }
    );
    return (messages as FetchMessageObject[])
      .map(summaryFromEnvelope)
      .reverse();
  });
}

export async function getDrafts(
  limit: number = 20,
  folder: string = "Drafts"
): Promise<EmailSummary[]> {
  return withMailbox(folder, async (client) => {
    const uids = await searchUids(client, { all: true });
    if (uids.length === 0) return [];
    const subset = uids.slice(-limit);
    const messages = await client.fetchAll(
      subset,
      { envelope: true },
      { uid: true }
    );
    return (messages as FetchMessageObject[])
      .map(summaryFromEnvelope)
      .reverse();
  });
}

export async function listFolders(): Promise<string[]> {
  return withClient(async (client) => {
    const mailboxes = await client.list();
    return mailboxes.map((m) => m.path);
  });
}
