# Mantri — Vision

**A voice-first, podcast-style email assistant for ProtonMail.**

Plug in your AirPods. Mantri tells you what's going on. You listen, you interrupt, you act — all by voice.

## The Experience (Where We're Headed)

You open Mantri and hit play. Two voices start discussing your morning — your newsletters from overnight, a thread about Stripe changing their API pricing, a deep-dive on that Rust article from TLDR. It sounds like a podcast made just for you.

Mid-episode, something catches your ear. You interrupt:

> "Wait — tell me more about that Stripe pricing change."

One of the hosts pauses, pulls up the original email, reads you the details. You follow up:

> "Have I got any emails from Sarah?"

The host checks your inbox. "Yeah, Sarah sent you something yesterday about Thursday dinner. Want the gist?"

> "Yeah."

"She's asking if 2pm works at the usual place."

> "Reply to her — tell her Thursday at 2 works, looking forward to it."

The host drafts it, reads it back. You confirm. It sends.

> "Anything else important?"

"You've got a USPS informed delivery — looks like a package from Amazon arriving today, it's a small box. And an American Express ad. That's about it."

> "Trash the AmEx one. Actually, stop telling me about AmEx ads altogether."

"Done. And noted — I'll skip AmEx ads going forward. Want to continue the podcast?"

> "Yeah, continue."

The two hosts pick back up where they left off.

That's Mantri. Your inbox, as a conversation.

## The Day 30 Promise

Instead of telling you that you have 47 unread emails, Mantri says:

*"3 emails actually need you today. The rest is newsletters — your podcast is ready. Want to hear it?"*

## Core Principles

### Voice-first, not voice-added
Mantri isn't a screen with a microphone bolted on. Voice is the primary interface. You should never need to look at a screen to manage your email.

### Podcast, not summary
The digest isn't a bullet-point summary read aloud. It's a conversation between two AI co-hosts who discuss your newsletters the way two friends would over coffee. Engaging, opinionated, easy to absorb while commuting, exercising, or cooking.

### Gist-first, details on demand
Mantri never dumps metadata or reads full emails unprompted. Everything starts as a gist — one or two sentences capturing what matters. You probe deeper only when you want to: "Tell me more about that one."

### Privacy-preserving
Your emails are decrypted only on your local machine by Proton Bridge. Email content passes through the LLM for processing but is never stored on third-party servers. Your preferences and learned patterns stay on your local disk.

### Self-learning
Mantri gets smarter every day. It learns which senders matter, which newsletter sections you skip, what's noise ("stop telling me about AmEx ads"), how you talk to different contacts, and what you actually care about. By month one, it knows you.

## Architecture Overview

```
You speak
  → ElevenLabs STT transcribes
    → Claude reasons + decides which tool to call
      → MCP server executes against Proton Bridge (IMAP/SMTP)
        → Result sent back to Claude
          → Claude formulates response
            → ElevenLabs TTS speaks it back
```

### Key Components

| Component | Technology | Role |
|-----------|-----------|------|
| Email Access | Proton Bridge | Decrypts ProtonMail locally, exposes IMAP/SMTP on localhost |
| Email MCP Server | Node.js / TypeScript | Wraps IMAP/SMTP into callable MCP tools |
| Memory System | PROFILE.md | Persistent preferences, learned patterns, noise filters |
| Voice Agent | ElevenLabs Conversational AI 2.0 | Voice interface with native MCP tool calling support |
| LLM Reasoning | Claude (via ElevenLabs) | Summarization, email drafting, tool orchestration, podcast scripting |
| Podcast Engine | ElevenLabs GenFM / Podcast API | Two AI co-hosts discussing newsletters in conversation mode |

### Existing ProtonMail MCP References

No official ProtonMail MCP exists, but two community repos provide useful foundations:

- [anyrxo/protonmail-pro-mcp](https://github.com/anyrxo/protonmail-pro-mcp) — Comprehensive: 20+ tools, IMAP+SMTP, analytics, folder management
- [amotivv/protonmail-mcp](https://github.com/amotivv/protonmail-mcp) — Lightweight: SMTP-only, clean implementation

## The Memory System

Mantri maintains a `PROFILE.md` that acts as its long-term memory. Loaded into every session as system context. Updated automatically from interactions and explicit instructions.

### How you train it

You train Mantri by talking to it. No settings page, no configuration files to edit manually.

- "Stop telling me about AmEx ads" → adds to noise filter
- "Sarah is my sister" → adds to contact context
- "I don't care about the crypto section in TLDR" → updates newsletter preferences
- "Be more casual when replying to friends" → updates communication style

### What it learns over time

| Timeframe | What Mantri Knows |
|-----------|------------------|
| Week 1 | Basic contact names, newsletter list auto-detected, default behavior rules |
| Week 2 | Newsletter section preferences (you keep skipping crypto → it stops including crypto), per-contact tone starts forming |
| Month 1 | Full priority model: which senders need immediate attention, which emails can wait, how you respond to each type. Podcast is perfectly tailored |
| Ongoing | New contacts categorized automatically. Tone shifts noticed ("you've been more formal with this client — should I update?") |

### Profile structure

```markdown
# Mantri — User Profile

## Identity
- Name: [your name]
- Email: [your@protonmail.com]

## Priority Contacts
- [learned over time]

## Newsletter Preferences
- Subscribed: [auto-detected]
- Preferred sections: [learned]
- Skip sections: [learned]

## Noise Filters
- [senders/topics to suppress, learned from explicit instructions]

## Communication Style
- Default tone: [learned from sent emails]
- Per-contact overrides: [learned]

## Behavior Rules
- Always confirm before sending any email
- Always confirm before permanent deletion

## Learned Patterns
- [auto-updated by Mantri]
```

## The Podcast

The podcast is not an afterthought — it's the core experience. Powered by ElevenLabs GenFM Podcast API in "conversation" mode.

### How it works

1. **Fetch**: Pull unread emails from the Newsletters folder via IMAP
2. **Script**: Claude writes a conversational podcast script — two hosts discussing the content, with personality and opinions, respecting PROFILE.md preferences
3. **Generate**: ElevenLabs GenFM renders the script as a two-voice podcast
4. **Play**: Audio streams to you on demand
5. **Mark read**: As newsletters are covered, they're marked as read

### What makes it different

- Two distinct voices with personality, not a monotone readout
- Hosts discuss and react to the content ("Oh interesting, so Stripe is changing their API pricing...")
- Length adapts to volume (light day = 2 min, heavy day = 10 min)
- Learns what you care about and adjusts emphasis over time
- Newsletters you've already read are skipped (only unread)

## Evolution Roadmap

### V1 — Two Buttons
Mac-only. Browser-based. Two separate modes: a **Podcast** button (listen to newsletters) and a **Chat** button (interact with your inbox). Podcast is listen-only. Chat is interactive. They don't talk to each other yet.

### V2 — Unified Experience
The two modes merge. You can interrupt the podcast to ask questions, take actions, dive deeper into a topic. One of the podcast voices becomes your interactive agent. "Continue the podcast" resumes where you left off. Everything is one seamless conversation.

### V3 — Mobile
Expose MCP server via Cloudflare Tunnel or Tailscale. Access from phone browser or ElevenLabs app. This is the real target: AirPods + Mantri from anywhere.

### V4 — Proactive
Mantri reaches out when something urgent arrives, even if you haven't asked. Smart scheduling ("Send this email tomorrow at 9 AM"). Calendar-aware responses ("I'm free Thursday afternoon").

### V5 — Full Life Assistant
Calendar integration (Proton Calendar, Google Calendar). Attachment handling (read PDFs, summarize documents). Multi-account support. Contact relationship graph. Deep content reading ("go read that blog post and tell me about it").

## Cost Model

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| ProtonMail Plus | Current subscription | $0 (already paying) |
| ElevenLabs | Creator plan (100k credits) | $11/month |
| Claude API | Via ElevenLabs (included) | $0 |
| Proton Bridge | Included with Plus | $0 |
| **Total** | | **~$11/month** |

ElevenLabs Creator plan provides ~100k credits/month ≈ 30-40 minutes of daily voice conversation + podcast generation. Heavy use may require Pro plan ($99/month, 500k credits).

## Guiding Constraint

**Built with privacy in mind. Your emails, your voice, your data, your machine.**
