import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { computeTier, expectedValue } from '@reqon/core';
import type { NewRole } from '../db/store';

// Minimal create form. Company + role required; fit/prob (0–10) drive the live tier/score preview.
export function AddRoleModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (r: NewRole) => void;
}) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [fit, setFit] = useState('');
  const [prob, setProb] = useState('');
  const [salary, setSalary] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');

  const f = clamp(parseFloat(fit));
  const p = clamp(parseFloat(prob));
  const valid = company.trim() && role.trim();
  const tier = computeTier(f, p);
  const ev = expectedValue({ fit: f, prob: p });

  const reset = () => {
    setCompany(''); setRole(''); setFit(''); setProb(''); setSalary(''); setLocation(''); setLink('');
  };
  const save = () => {
    if (!valid) return;
    onAdd({
      company: company.trim(),
      role: role.trim(),
      fit: f,
      prob: p,
      salary: salary.trim() || undefined,
      location: location.trim() || undefined,
      link: link.trim() || undefined,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Add role</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Labeled label="Company">
              <TextInput value={company} onChangeText={setCompany} placeholder="Acme" placeholderTextColor={colors.muted} style={styles.input} />
            </Labeled>
            <Labeled label="Role">
              <TextInput value={role} onChangeText={setRole} placeholder="Principal PM, Data Platform" placeholderTextColor={colors.muted} style={styles.input} />
            </Labeled>
            <View style={styles.twoCol}>
              <Labeled label="Fit (0–10)" style={styles.col}>
                <TextInput value={fit} onChangeText={setFit} keyboardType="decimal-pad" placeholder="8.5" placeholderTextColor={colors.muted} style={styles.input} />
              </Labeled>
              <Labeled label="Prob (0–10)" style={styles.col}>
                <TextInput value={prob} onChangeText={setProb} keyboardType="decimal-pad" placeholder="7" placeholderTextColor={colors.muted} style={styles.input} />
              </Labeled>
            </View>
            <Text style={styles.preview}>
              Tier {tier} · EV {ev.toFixed(1)}
            </Text>
            <Labeled label="Salary (optional)">
              <TextInput value={salary} onChangeText={setSalary} placeholder="$240–280K" placeholderTextColor={colors.muted} style={styles.input} />
            </Labeled>
            <Labeled label="Location (optional)">
              <TextInput value={location} onChangeText={setLocation} placeholder="Remote" placeholderTextColor={colors.muted} style={styles.input} />
            </Labeled>
            <Labeled label="Link (optional)">
              <TextInput value={link} onChangeText={setLink} autoCapitalize="none" placeholder="https://…" placeholderTextColor={colors.muted} style={styles.input} />
            </Labeled>
          </ScrollView>

          <Pressable style={[styles.save, !valid && styles.saveDisabled]} onPress={save} disabled={!valid}>
            <Text style={styles.saveText}>Add to pipeline</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const clamp = (n: number) => (isNaN(n) ? 0 : Math.max(0, Math.min(10, n)));

function Labeled({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.labeled, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.element,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted },
  form: { gap: 14, paddingBottom: 16 },
  labeled: { gap: 6 },
  label: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  input: {
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.textHigh,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  preview: { fontFamily: fonts.sans, fontSize: 13, color: colors.emerald, fontWeight: '500' },
  save: { backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  saveDisabled: { backgroundColor: alpha(colors.emerald, 0.35) },
  saveText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: colors.canvas },
});
