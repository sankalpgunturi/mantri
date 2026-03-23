import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { config } from "../config.js";

function getClient(): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: config.elevenlabs.apiKey });
}

export async function listVoices(): Promise<
  { voiceId: string; name: string; category: string }[]
> {
  const client = getClient();
  const response = await client.voices.getAll({});
  const voices = (response as any).voices ?? [];
  return voices.map((v: any) => ({
    voiceId: v.voiceId ?? v.voice_id,
    name: v.name ?? "Unknown",
    category: v.category ?? "unknown",
  }));
}
