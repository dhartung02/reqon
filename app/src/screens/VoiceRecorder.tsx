import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { transcribeAudio } from '../sync/transcribe';

// Voice capture for the narrative builder. Record → stop → server-side Whisper → transcript handed
// back to the editor. Uses expo-audio (a native module: requires a dev build, NOT Expo Go). Mounted
// only when the user opts into voice, so the native hook never runs unless the module is present.
const MAX_MS = 240000; // 4 min cap keeps the base64 payload under the server's 8mb body limit
const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function VoiceRecorder({ onTranscript, onCancel }: { onTranscript: (text: string) => void; onCancel: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Best-effort stop so we don't leak an active recording when the panel unmounts.
      try { recorder.stop(); } catch { /* not recording */ }
    };
  }, [recorder]);

  const start = async () => {
    setError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Microphone permission denied. Enable it in Settings to dictate.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      if (alive.current) setPhase('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording (a dev build is required — voice is not available in Expo Go).');
    }
  };

  const stopAndTranscribe = async () => {
    if (phase !== 'recording') return;
    setPhase('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) { setError('No recording captured.'); setPhase('idle'); return; }
      const r = await transcribeAudio(uri);
      if (!alive.current) return;
      if (r.error) { setError(r.error); setPhase('idle'); return; }
      onTranscript((r.text || '').trim());
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : 'Transcription failed.'); setPhase('idle'); }
    }
  };

  // Auto-stop at the duration cap so the upload stays within limits.
  useEffect(() => {
    if (phase === 'recording' && state.durationMillis >= MAX_MS) stopAndTranscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis, phase]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.title}>🎤 Speak your story</Text>
        <Pressable onPress={onCancel} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable>
      </View>
      <Text style={styles.hint}>Talk it through naturally — the company, what you did, the outcome. We'll transcribe it, then you can elaborate and polish.</Text>

      {phase === 'transcribing' ? (
        <View style={styles.center}><ActivityIndicator color={c.emerald} /><Text style={styles.dim}>Transcribing…</Text></View>
      ) : (
        <View style={styles.center}>
          <Text style={[styles.timer, phase === 'recording' && styles.timerLive]}>{mmss(phase === 'recording' ? state.durationMillis : 0)}</Text>
          {phase === 'recording'
            ? <Pressable style={[styles.recBtn, styles.stopBtn]} onPress={stopAndTranscribe}><Text style={styles.stopText}>■ Stop &amp; transcribe</Text></Pressable>
            : <Pressable style={styles.recBtn} onPress={start}><Text style={styles.recText}>● Start recording</Text></Pressable>}
          {phase === 'recording' ? <Text style={styles.dim}>Up to {MAX_MS / 60000} min · auto-stops</Text> : null}
        </View>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { backgroundColor: c.element, borderRadius: 12, padding: 16, gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '600', color: c.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 18 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  dim: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  timer: { fontFamily: fonts.serif, fontSize: 34, fontWeight: '600', color: c.muted },
  timerLive: { color: c.emerald },
  recBtn: { borderWidth: 1, borderColor: c.emerald, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 26 },
  recText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.emerald },
  stopBtn: { backgroundColor: c.emerald, borderColor: c.emerald },
  stopText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.canvas },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger, lineHeight: 18 },
});
