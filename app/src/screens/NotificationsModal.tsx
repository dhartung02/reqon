import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { fetchNotifications, markNotificationsRead, type Notification } from '../sync/notifications';

// In-app notification feed (P1.8). Mirrors the web bell: the digest/scout/mail engine's feed, with
// mark-read. Native push is EAS-build dependent — called out here so its status is clear.
export function NotificationsModal({
  visible, onClose, onUnreadChange,
}: { visible: boolean; onClose: () => void; onUnreadChange?: (n: number) => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    setBusy(true); setError(null);
    const r = await fetchNotifications();
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setItems(r.items);
    onUnreadChange?.(r.unread);
  };
  useEffect(() => { if (visible) load(); }, [visible]);

  const markAll = async () => {
    const r = await markNotificationsRead();
    if (!r.error) { setItems((xs) => xs.map((x) => ({ ...x, read: true }))); onUnreadChange?.(r.unread); }
  };

  const rel = (ts?: string) => {
    if (!ts) return '';
    const s = (Date.now() - Date.parse(ts)) / 1000;
    if (isNaN(s)) return '';
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Notifications</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.cancel}>Done</Text></Pressable>
          </View>

          {busy ? <ActivityIndicator color={c.emerald} style={{ marginVertical: 20 }} /> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}

          {!busy && !error && items.length === 0 ? <Text style={styles.empty}>No notifications.</Text> : null}

          {items.length > 0 ? (
            <>
              <ScrollView style={styles.list}>
                {items.map((n) => (
                  <View key={n.id} style={styles.row}>
                    {!n.read ? <View style={styles.unreadDot} /> : <View style={styles.readDot} />}
                    <View style={styles.rowMain}>
                      {n.title ? <Text style={[styles.rowTitle, n.read && styles.dim]} numberOfLines={2}>{n.title}</Text> : null}
                      {n.body ? <Text style={styles.rowBody} numberOfLines={3}>{n.body}</Text> : null}
                      {n.ts ? <Text style={styles.rowWhen}>{rel(n.ts)}</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.footRow}>
                <Text style={styles.note}>Native push: set up via an EAS build · this feed works now</Text>
                <Pressable onPress={markAll} hitSlop={8}><Text style={styles.markAll}>Mark all read</Text></Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.canvas, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.element, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '85%', gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: c.muted, paddingVertical: 20, textAlign: 'center' },
  list: { maxHeight: 460 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: c.element },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.emerald, marginTop: 5 },
  readDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.element, marginTop: 5 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh },
  dim: { color: c.textBase },
  rowBody: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2, lineHeight: 18 },
  rowWhen: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, marginTop: 3 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  note: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, flexShrink: 1 },
  markAll: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
});
