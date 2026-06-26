import * as FileSystem from 'expo-file-system/legacy';
import { getConfig } from './config';
import { timedFetch } from './http';

// Speech-to-text for the voice narrative builder. Reads the recorded clip, ships it base64 to the
// server's /api/transcribe (OpenAI Whisper) and returns plain text. The AI key stays server-side;
// the transcript then flows into the same elaborate → polish path as typed narratives.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');
const TRANSCRIBE_TIMEOUT = 90000; // upload + Whisper can take a while on a slow link

export async function transcribeAudio(uri: string, mimeType = 'audio/m4a'): Promise<{ text?: string; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings to transcribe.' };
  try {
    const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const r = await timedFetch(`${normalize(url)}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ audioBase64, filename: 'narrative.m4a', mimeType }),
    }, TRANSCRIBE_TIMEOUT);
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { text: String(j.text || '') };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}
