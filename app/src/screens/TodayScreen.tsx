import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import type { Role, Lane } from '../model';
import { isApplyNext, inInterview, followUpDue } from '../today';
import { computeActions, groupActions, type Severity } from '../actionItems';
import { ReqonGlyph } from '../components/ReqonGlyph';
import { useLayout } from '../useLayout';

const sevColor = (c: Palette): Record<Severity, string> => ({ high: c.danger, medium: c.amber, low: c.active });

// Today = the daily-loop home base (mirrors the web): a "Find new jobs" strip, four headline
// stats, the "What needs you today" action list, and a reassuring footer. The full scored lists
// live in the Board lanes. All scout / sync wiring is unchanged — only labels and layout differ.
export function TodayScreen({
  roles,
  onJump,
  onScout,
  onServerScout,
  scouting,
  scoutMsg,
  scoutEnabled,
  refreshing,
  onRefresh,
  serverConfigured,
  syncState,
  onOpenRole,
}: {
  roles: Role[];
  onJump: (l: Lane) => void;
  onScout: () => void;
  onServerScout: () => void;
  scouting: boolean;
  scoutMsg: string | null;
  scoutEnabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  serverConfigured: boolean;
  syncState: { at?: number; error?: boolean };
  onOpenRole?: (id: string) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const { wide } = useLayout();
  const sev = sevColor(c);
  const actionGroups = groupActions(computeActions(roles));
  const rel = (t: number) => {
    const s = (Date.now() - t) / 1000;
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };

  // Four headline stats from the existing predicates (today.ts) — tappable to the matching lane.
  const stats: { key: string; n: number; label: string; desc: string; color: string; jump?: Lane }[] = [
    { key: 'strong', n: roles.filter((r) => r.tier === 'A').length, label: 'Strong matches', desc: 'Top fits to prioritize', color: c.emerald, jump: 'open' },
    { key: 'ready', n: roles.filter(isApplyNext).length, label: 'Ready to apply', desc: 'Verified · open · not applied', color: c.emerald, jump: 'open' },
    { key: 'replies', n: roles.filter(inInterview).length, label: 'Replies', desc: 'In conversation', color: c.active, jump: 'interviewing' },
    { key: 'followups', n: roles.filter(followUpDue).length, label: 'Follow-ups', desc: 'Gone quiet — nudge', color: c.danger, jump: 'applied' },
  ];

  const findBtn = (onPress: () => void) => (
    <Pressable style={styles.findBtn} onPress={onPress} disabled={scouting} accessibilityRole="button" accessibilityLabel="Find new jobs">
      {scouting ? <ActivityIndicator size="small" color={c.canvas} /> : <Text style={styles.findBtnText}>Find new jobs</Text>}
    </Pressable>
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <ReqonGlyph size={18} color={c.emerald} />
          <Text style={styles.eyebrow}>REQON</Text>
        </View>
        <Text style={styles.h1}>Today</Text>
      </View>

      <View style={styles.scoutStrip}>
        <View style={styles.scoutLeft}>
          <View style={styles.pulse} />
          <Text style={styles.scoutText}>
            <Text style={styles.scoutStrong}>{roles.length} jobs</Text> tracked
          </Text>
        </View>
        {scoutEnabled ? (
          findBtn(onScout)
        ) : serverConfigured ? (
          <View style={styles.serverCol}>
            {findBtn(onServerScout)}
            <Text style={[styles.serverScout, syncState.error && styles.syncErr]}>
              {syncState.error ? 'Sync failed' : syncState.at ? `Synced ${rel(syncState.at)}` : 'Server connected'}
            </Text>
          </View>
        ) : (
          <Text style={styles.serverScout}>Off</Text>
        )}
      </View>
      {scoutMsg ? <Text style={styles.scoutMsg}>{scoutMsg}</Text> : null}

      <View style={styles.grid}>
        {stats.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.card, wide && styles.cardWide]}
            disabled={!s.jump}
            onPress={() => s.jump && onJump(s.jump)}
          >
            <Text style={[styles.cardNum, { color: s.n === 0 ? c.muted : s.color }]}>{s.n}</Text>
            <Text style={styles.cardTitle}>{s.label}</Text>
            <Text style={styles.cardDesc}>{s.desc}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.h2}>What needs you today</Text>
      {actionGroups.length > 0 ? (
        <View style={styles.actions}>
          {actionGroups.map((g) => (
            <View key={g.title} style={styles.actSec}>
              <Text style={styles.actSecTitle}>{g.title.toUpperCase()} · {g.items.length}</Text>
              {g.items.slice(0, 8).map((a) => (
                <Pressable key={a.id} style={styles.actItem} disabled={!onOpenRole} onPress={() => onOpenRole && onOpenRole(a.roleId)}>
                  <View style={[styles.actDot, { backgroundColor: sev[a.severity] }]} />
                  <View style={styles.actMain}>
                    <Text style={styles.actRole} numberOfLines={1}>{a.company}{a.role ? ` — ${a.role}` : ''}</Text>
                    <Text style={styles.actReason} numberOfLines={1}>{a.reason}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.allClear}>You're all caught up — nothing needs you right now.</Text>
      )}

      <Text style={styles.foot}>Nothing slips — Reqon nudges you before a good lead goes cold.</Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { paddingTop: 12, paddingBottom: 32, gap: 16 },
  scrollWide: { maxWidth: 1040, width: '100%', alignSelf: 'center' },
  header: { gap: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: c.emerald },
  h1: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, letterSpacing: -0.3 },
  scoutStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoutLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.emerald },
  scoutText: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase },
  scoutStrong: { color: c.textHigh, fontWeight: '700' },
  findBtn: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 9,
    backgroundColor: c.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  findBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
  serverCol: { alignItems: 'flex-end', gap: 4 },
  serverScout: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  syncErr: { color: c.danger },
  scoutMsg: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: '47.5%', flexGrow: 1, backgroundColor: c.element, borderRadius: 14, padding: 14, gap: 2 },
  cardWide: { flexBasis: '23%', minWidth: 150 },
  cardNum: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '700', lineHeight: 36 },
  cardTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh, marginTop: 2 },
  cardDesc: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 16 },
  h2: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '600', color: c.textHigh },
  actions: { backgroundColor: c.element, borderRadius: 14, padding: 12, gap: 4 },
  actSec: { marginTop: 6 },
  actSecTitle: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: c.muted, marginBottom: 4 },
  actItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  actDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  actMain: { flex: 1, minWidth: 0 },
  actRole: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh },
  actReason: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 1 },
  allClear: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, backgroundColor: c.element, borderRadius: 14, padding: 16 },
  foot: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 4, lineHeight: 17 },
});
