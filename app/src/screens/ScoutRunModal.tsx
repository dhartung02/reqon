import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { SCOUT_RUN_MODES, type ScoutRunMode } from '../sync/serverScout';

// Run-Scout menu — mirrors the web board's "Run Scout ▾" control (find / validate / run all).
// The actual trigger-or-queue logic lives in App; this just picks a mode. When the server is
// offline the pick is queued and sent on the next successful sync (handled by the caller).
export function ScoutRunModal({
  visible,
  onClose,
  onPick,
  queued,
  onCancelQueue,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (mode: ScoutRunMode) => void;
  queued: ScoutRunMode | null;
  onCancelQueue: () => void;
}) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Find new jobs</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Done</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>
            Runs the full server-side scout (multi-source search + enrichment). If the server can’t be
            reached, your choice is queued and sent automatically on the next successful sync.
          </Text>
          {SCOUT_RUN_MODES.map(({ mode, label }) => (
            <Pressable key={mode} style={styles.option} onPress={() => onPick(mode)}>
              <Text style={styles.optionText}>{label}</Text>
            </Pressable>
          ))}
          {queued ? (
            <View style={styles.queuedRow}>
              <Text style={styles.queuedText}>Queued: {queued} — will run when reconnected.</Text>
              <Pressable onPress={onCancelQueue} hitSlop={8}>
                <Text style={styles.queuedCancel}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.canvas,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: c.element,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 28,
      gap: 12,
    },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
    cancel: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
    help: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19 },
    option: { backgroundColor: c.element, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
    optionText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: c.textHigh },
    queuedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: alpha(c.amber, 0.12),
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    queuedText: { fontFamily: fonts.sans, fontSize: 12, color: c.amber, flex: 1, lineHeight: 16 },
    queuedCancel: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.danger },
  });
