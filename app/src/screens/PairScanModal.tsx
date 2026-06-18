import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { decodePairing } from '@reqon/core';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';

// Full-screen QR scanner for device pairing. Reads the QR shown on the board (Settings → Advanced
// → Pair a device), decodes the {url, token} payload via the shared core, and hands it back.
// QR-only; ignores anything that isn't a valid Reqon pairing code.
export function PairScanModal({
  visible,
  onClose,
  onPaired,
}: {
  visible: boolean;
  onClose: () => void;
  onPaired: (url: string, token: string) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const [err, setErr] = useState<string | null>(null);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (visible) {
      setErr(null);
      setHandled(false);
    }
  }, [visible]);

  const onScan = ({ data }: { data: string }) => {
    if (handled) return; // onBarcodeScanned fires repeatedly for the same code
    const parsed = decodePairing(data);
    if (!parsed) {
      setErr('Not a Reqon pairing code. On the board: Settings → Advanced → Pair a device.');
      return;
    }
    setHandled(true);
    onPaired(parsed.url, parsed.token);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {!permission ? (
          <View style={styles.center}>
            <Text style={styles.msg}>Checking camera permission…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.msg}>Camera access is needed to scan the pairing QR.</Text>
            <Pressable style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnText}>Grant camera access</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handled ? undefined : onScan}
          />
        )}

        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.title}>Scan the board’s pairing QR</Text>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  msg: { fontFamily: fonts.sans, fontSize: 15, color: '#fff', textAlign: 'center', lineHeight: 21 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 24, justifyContent: 'space-between' },
  title: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: '#fff', textAlign: 'center', marginTop: 8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  err: { fontFamily: fonts.sans, fontSize: 13, color: '#fff', textAlign: 'center', backgroundColor: alpha(c.danger, 0.85), padding: 10, borderRadius: 8, overflow: 'hidden' },
  close: { alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  closeText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: '#fff' },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: alpha(c.emerald, 0.15), borderWidth: 1, borderColor: alpha(c.emerald, 0.5) },
  btnText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: c.emerald },
});
