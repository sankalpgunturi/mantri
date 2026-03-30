let chatActive = false;
let conversation = null;
let transcript = [];

const statusEl = document.getElementById("status");
const talkBtn = document.getElementById("talk-btn");
const btnIcon = document.getElementById("btn-icon");
const btnLabel = document.getElementById("btn-label");

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = type;
}

// ── Chat ──

async function toggleChat() {
  if (chatActive) {
    await stopChat();
  } else {
    await startChat();
  }
}

async function startChat() {
  talkBtn.disabled = true;
  setStatus("Connecting...", "info");

  try {
    setStatus("Preparing session...", "info");
    const sessionRes = await fetch("/api/session/start");
    const sessionData = await sessionRes.json();

    if (sessionData.error) {
      setStatus("Setup error: " + sessionData.error, "error");
      talkBtn.disabled = false;
      return;
    }

    if (!sessionData.agentId) {
      setStatus("ELEVENLABS_AGENT_ID not set. Run: npm run setup", "error");
      talkBtn.disabled = false;
      return;
    }

    await navigator.mediaDevices.getUserMedia({ audio: true });

    const { Conversation } = await import(
      "https://esm.sh/@elevenlabs/client@latest"
    );

    transcript = [];
    const tools = buildClientTools();

    conversation = await Conversation.startSession({
      agentId: sessionData.agentId,
      connectionType: "webrtc",
      clientTools: tools,
      onConnect: () => {
        chatActive = true;
        talkBtn.disabled = false;
        talkBtn.classList.add("active");
        btnIcon.textContent = "\u23F9";
        btnLabel.textContent = "Stop";
        setStatus("Connected. Speak to Mantri.", "success");
      },
      onDisconnect: () => {
        chatActive = false;
        resetBtn();
        setStatus("Chat ended.", "");
        saveTranscript();
      },
      onError: (err) => {
        console.error("ConvAI error:", err);
        setStatus("Connection error: " + (err.message || err), "error");
      },
      onMessage: (msg) => {
        if (msg.source === "user" && msg.message) {
          transcript.push("User: " + msg.message);
        } else if (msg.source === "ai" && msg.message) {
          transcript.push("Mantri: " + msg.message);
        }
      },
      onUnhandledClientToolCall: (toolCall) => {
        console.warn("Unhandled tool call:", JSON.stringify(toolCall));
      },
    });

    chatActive = true;
    talkBtn.disabled = false;
  } catch (err) {
    setStatus("Error: " + err.message, "error");
    talkBtn.disabled = false;
    resetBtn();
  }
}

async function stopChat() {
  if (conversation) {
    await conversation.endSession();
    conversation = null;
  }
  chatActive = false;
  resetBtn();
  setStatus("Chat ended.", "");
  await saveTranscript();
}

function resetBtn() {
  talkBtn.classList.remove("active");
  btnIcon.textContent = "\uD83C\uDF99";
  btnLabel.textContent = "Talk";
}

async function saveTranscript() {
  if (transcript.length === 0) return;
  try {
    await fetch("/api/conversation/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    transcript = [];
  } catch (err) {
    console.error("Failed to save transcript:", err);
  }
}

// ── Client Tools ──

function buildClientTools() {
  const toolNames = [
    "get_unread",
    "get_email",
    "get_newsletters",
    "get_sent",
    "get_drafts",
    "search_emails",
    "mark_read",
    "mark_unread",
    "delete_email",
    "move_email",
    "send_email",
    "read_profile",
    "update_profile",
    "log_interaction",
    "get_conversation_log",
    "save_conversation_note",
    "read_url",
    "unsubscribe",
  ];

  const clientTools = {};
  for (const name of toolNames) {
    clientTools[name] = async (params) => {
      try {
        const res = await fetch(`/api/tools/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        return data.result || data.error || "Done.";
      } catch (err) {
        return "Error executing tool: " + err.message;
      }
    };
  }
  return clientTools;
}
