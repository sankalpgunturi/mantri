import { convert } from "html-to-text";

const MAX_CHARS = 4000;
const TIMEOUT_MS = 10000;

export async function readUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();

    let text: string;
    if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
      text = convert(body, {
        wordwrap: 120,
        selectors: [
          { selector: "a", options: { ignoreHref: true } },
          { selector: "img", format: "skip" },
          { selector: "script", format: "skip" },
          { selector: "style", format: "skip" },
          { selector: "nav", format: "skip" },
          { selector: "footer", format: "skip" },
          { selector: "header", format: "skip" },
        ],
      });
    } else {
      text = body;
    }

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n\n[...truncated]";
    }

    return text || "(Page had no readable text content)";
  } finally {
    clearTimeout(timer);
  }
}
