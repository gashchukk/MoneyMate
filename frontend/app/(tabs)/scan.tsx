import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Image, Dimensions,
  Platform, StatusBar,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, router } from 'expo-router';
import { apiFetch } from '@/constants/api';
import * as SecureStore from 'expo-secure-store';
import { useAppSettings } from '@/components/AppContext';
import { BRAND, currencySymbol } from '@/constants/brand';

const { width: W, height: H } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────
interface Account { id: number; name: string; currency_code: number; }
interface ReceiptItem { name: string; quantity: number; unit_price: number; total_price: number; }
interface ParsedData { store?: string; date?: string; total?: number; currency?: string; items?: ReceiptItem[]; }
interface ReceiptResult { id: number; transaction_id?: number; filename?: string; raw_text?: string; parsed_data?: ParsedData; }

type Stage = 'camera' | 'preview' | 'account' | 'processing' | 'result';

const cs = (code: number) => currencySymbol(code);

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScanScreen() {
  const { language } = useAppSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [stage, setStage] = useState<Stage>('camera');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash]   = useState(false);
  const [imageUri, setImageUri]   = useState<string | null>(null);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [result, setResult]       = useState<ReceiptResult | null>(null);
  const [processing, setProcessing] = useState(false);

  // Fetch accounts when screen is focused
  useFocusEffect(useCallback(() => {
    apiFetch('/accounts').then(setAccounts).catch(() => {});
    setStage('camera');
    setImageUri(null);
    setResult(null);
    setSelectedAccount(null);
  }, []));

  // ── Camera permission ──────────────────────────────────────────────────────
  if (!permission) return <View style={styles.centered}><ActivityIndicator color={BRAND} /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionSub}>To scan receipts, MoneyMate needs camera access.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permissionSkip} onPress={() => router.back()}>
          <Text style={styles.permissionSkipText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Take photo ─────────────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      if (photo?.uri) { setImageUri(photo.uri); setStage('preview'); }
    } catch {
      Alert.alert('Error', 'Failed to take photo.');
    }
  };

  // ── Pick from gallery ──────────────────────────────────────────────────────
  const handleGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setImageUri(res.assets[0].uri);
      setStage('preview');
    }
  };

  // ── Confirm image → pick account ───────────────────────────────────────────
  const handleConfirmImage = () => {
    if (accounts.length === 0) {
      Alert.alert('No accounts', 'Please create an account first.');
      return;
    }
    // Auto-select first account
    setSelectedAccount(accounts[0].id);
    setStage('account');
  };

  // ── Upload + scan ──────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (!imageUri || !selectedAccount) return;
    setStage('processing');
    setProcessing(true);

    try {
      const token = await SecureStore.getItemAsync('access_token');
      const formData = new FormData();

      // Append image
      const filename = imageUri.split('/').pop() ?? 'receipt.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: mimeType,
      } as any);

      formData.append('account_id', String(selectedAccount));

      const API_BASE = (await import('@/constants/api')).API_BASE_URL;
      const response = await fetch(`${API_BASE}/receipts/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // DO NOT set Content-Type — let fetch set it with boundary for multipart
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `HTTP ${response.status}`);
      }

      const data: ReceiptResult = await response.json();
      setResult(data);
      setStage('result');
    } catch (e: any) {
      Alert.alert('Scan failed', e.message);
      setStage('account');
    } finally {
      setProcessing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE: CAMERA
  // ─────────────────────────────────────────────────────────────────────────
  if (stage === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar barStyle="light-content" />
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash ? 'on' : 'off'}
        />

        {/* Dark overlay with receipt cutout hint */}
        <View style={styles.overlay}>
          {/* Top bar */}
          <View style={styles.camTopBar}>
            <TouchableOpacity style={styles.camIconBtn} onPress={() => router.back()}>
              <Text style={styles.camIconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.camTitle}>Scan Receipt</Text>
            <TouchableOpacity style={styles.camIconBtn} onPress={() => setFlash(f => !f)}>
              <Text style={styles.camIconText}>{flash ? '⚡' : '🔦'}</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt frame guide */}
          <View style={styles.frameWrapper}>
            <View style={styles.frameBox}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.frameHint}>Align receipt within the frame</Text>
          </View>

          {/* Bottom controls */}
          <View style={styles.camBottomBar}>
            {/* Gallery */}
            <TouchableOpacity style={styles.camSideBtn} onPress={handleGallery}>
              <Text style={styles.camSideBtnIcon}>🖼️</Text>
              <Text style={styles.camSideBtnLabel}>Gallery</Text>
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity style={styles.shutter} onPress={handleCapture} activeOpacity={0.8}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            {/* Flip */}
            <TouchableOpacity
              style={styles.camSideBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Text style={styles.camSideBtnIcon}>🔄</Text>
              <Text style={styles.camSideBtnLabel}>Flip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE: PREVIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (stage === 'preview' && imageUri) {
    return (
      <View style={styles.previewContainer}>
        <StatusBar barStyle="light-content" />
        <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />

        {/* Dark gradient overlay at bottom */}
        <View style={styles.previewOverlay}>
          <Text style={styles.previewTitle}>Looking good?</Text>
          <Text style={styles.previewSub}>Make sure the receipt text is clear and in focus.</Text>

          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setStage('camera')}>
              <Text style={styles.retakeBtnText}>↩ Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.useBtn} onPress={handleConfirmImage}>
              <Text style={styles.useBtnText}>Use Photo ›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE: ACCOUNT SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  if (stage === 'account') {
    return (
      <View style={styles.sheetContainer}>
        <StatusBar barStyle="dark-content" />
        {/* Blurred receipt preview behind */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.bgPreview} blurRadius={8} resizeMode="cover" />
        )}
        <View style={styles.bgDim} />

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Choose Account</Text>
          <Text style={styles.sheetSub}>The expense will be deducted from this account.</Text>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {accounts.map(acc => (
              <TouchableOpacity
                key={acc.id}
                style={[styles.accRow, selectedAccount === acc.id && styles.accRowActive]}
                onPress={() => setSelectedAccount(acc.id)}
              >
                <View style={[styles.accRadio, selectedAccount === acc.id && styles.accRadioActive]}>
                  {selectedAccount === acc.id && <View style={styles.accRadioDot} />}
                </View>
                <View style={styles.accRowMid}>
                  <Text style={styles.accRowName}>{acc.name}</Text>
                  <Text style={styles.accRowCurrency}>{cs(acc.currency_code)}</Text>
                </View>
                {selectedAccount === acc.id && <Text style={styles.accCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.scanBtn, !selectedAccount && { opacity: 0.5 }]}
            onPress={handleScan}
            disabled={!selectedAccount}
          >
            <Text style={styles.scanBtnText}>🔍  Scan Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={() => setStage('preview')}>
            <Text style={styles.backLinkText}>← Back to preview</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE: PROCESSING
  // ─────────────────────────────────────────────────────────────────────────
  if (stage === 'processing') {
    return (
      <View style={styles.processingScreen}>
        <StatusBar barStyle="dark-content" />
        {imageUri && <Image source={{ uri: imageUri }} style={styles.processingBg} blurRadius={12} resizeMode="cover" />}
        <View style={styles.bgDim} />
        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color={BRAND} style={{ marginBottom: 20 }} />
          <Text style={styles.processingTitle}>Reading Receipt...</Text>
          <Text style={styles.processingSub}>Extracting items, prices and totals</Text>
          <View style={styles.processingSteps}>
            {['Uploading image', 'Running OCR', 'Parsing data', 'Creating transaction'].map((step, i) => (
              <View key={i} style={styles.processingStep}>
                <ActivityIndicator size="small" color={BRAND + '88'} />
                <Text style={styles.processingStepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE: RESULT
  // ─────────────────────────────────────────────────────────────────────────
  if (stage === 'result' && result) {
    const parsed = result.parsed_data;
    const items = parsed?.items ?? [];
    const acc = accounts.find(a => a.id === selectedAccount);
    const sym = cs(acc?.currency_code ?? 980);

    return (
      <ScrollView style={styles.resultRoot} contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="dark-content" />

        {/* Success banner */}
        <View style={styles.successBanner}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Receipt Scanned!</Text>
          {result.transaction_id
            ? <Text style={styles.successSub}>Transaction #{result.transaction_id} created</Text>
            : <Text style={styles.successSubWarn}>No total found — no transaction created</Text>
          }
        </View>

        {/* Receipt summary card */}
        <View style={styles.resultCard}>
          <View style={styles.resultCardHeader}>
            <Text style={styles.resultStoreName}>{parsed?.store ?? 'Unknown Store'}</Text>
            {parsed?.date && <Text style={styles.resultDate}>{parsed.date}</Text>}
          </View>

          {/* Total */}
          {parsed?.total != null && (
            <View style={styles.resultTotalRow}>
              <Text style={styles.resultTotalLabel}>Total Charged</Text>
              <Text style={styles.resultTotal}>{sym}{parsed.total.toFixed(2)}</Text>
            </View>
          )}

          {/* Account */}
          <View style={styles.resultMetaRow}>
            <Text style={styles.resultMetaLabel}>Account</Text>
            <Text style={styles.resultMetaValue}>{acc?.name ?? '—'}</Text>
          </View>
        </View>

        {/* Line items */}
        {items.length > 0 && (
          <View style={styles.resultCard}>
            <Text style={styles.resultItemsTitle}>Items ({items.length})</Text>
            {items.map((item, i) => (
              <View key={i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  {item.quantity !== 1 && (
                    <Text style={styles.itemQty}>{item.quantity} × {sym}{item.unit_price?.toFixed(2)}</Text>
                  )}
                </View>
                <Text style={styles.itemPrice}>{sym}{item.total_price?.toFixed(2)}</Text>
              </View>
            ))}

            {/* Divider + total */}
            <View style={styles.itemsTotalRow}>
              <Text style={styles.itemsTotalLabel}>Total</Text>
              <Text style={styles.itemsTotalValue}>{sym}{parsed?.total?.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Raw OCR toggle */}
        {result.raw_text && <RawTextToggle raw={result.raw_text} />}

        {/* Actions */}
        <View style={styles.resultActions}>
          <TouchableOpacity
            style={styles.resultDoneBtn}
            onPress={() => { setStage('camera'); setImageUri(null); setResult(null); }}
          >
            <Text style={styles.resultDoneBtnText}>📷  Scan Another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resultGoBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.resultGoBtnText}>View Transactions ›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return null;
}

// ── Raw OCR text expandable ────────────────────────────────────────────────
function RawTextToggle({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.rawCard}>
      <TouchableOpacity style={styles.rawToggle} onPress={() => setOpen(o => !o)}>
        <Text style={styles.rawToggleText}>🔤 Raw OCR Text</Text>
        <Text style={styles.rawChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && <Text style={styles.rawText} selectable>{raw}</Text>}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  // ── Permission ──
  permissionScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 40 },
  permissionIcon: { fontSize: 64, marginBottom: 20 },
  permissionTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  permissionSub: { fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  permissionBtn: { backgroundColor: BRAND, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 16, marginBottom: 12 },
  permissionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  permissionSkip: { padding: 12 },
  permissionSkipText: { color: '#aaa', fontSize: 14 },

  // ── Camera ──
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },

  camTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 36,
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  camIconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  camIconText: { fontSize: 18 },
  camTitle: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  // Receipt frame
  frameWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameBox: {
    width: W * 0.8,
    height: H * 0.52,
    position: 'relative',
  },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: '#fff', borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  frameHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 16, fontWeight: '500' },

  camBottomBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 48 : 28,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shutter: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  camSideBtn: { alignItems: 'center', width: 64 },
  camSideBtnIcon: { fontSize: 26, marginBottom: 4 },
  camSideBtnLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },

  // ── Preview ──
  previewContainer: { flex: 1, backgroundColor: '#000' },
  previewImage: { width: W, height: H },
  previewOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 28, paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  previewTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  previewSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 },
  previewBtns: { flexDirection: 'row', gap: 12 },
  retakeBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  retakeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  useBtn: { flex: 2, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: BRAND, shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 5 },
  useBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Account sheet ──
  sheetContainer: { flex: 1 },
  bgPreview: { ...StyleSheet.absoluteFillObject },
  bgDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sheetSub: { fontSize: 14, color: '#aaa', marginBottom: 20 },

  accRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 14,
  },
  accRowActive: { backgroundColor: '#fff8f8', borderRadius: 12, paddingHorizontal: 10, marginHorizontal: -6 },
  accRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  accRadioActive: { borderColor: BRAND },
  accRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  accRowMid: { flex: 1 },
  accRowName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  accRowCurrency: { fontSize: 12, color: '#aaa', marginTop: 2 },
  accCheck: { fontSize: 18, color: BRAND, fontWeight: '700' },

  scanBtn: {
    backgroundColor: BRAND, borderRadius: 16, paddingVertical: 17,
    alignItems: 'center', marginTop: 20,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  backLink: { alignItems: 'center', marginTop: 14 },
  backLinkText: { color: '#bbb', fontSize: 14 },

  // ── Processing ──
  processingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  processingBg: { ...StyleSheet.absoluteFillObject },
  processingCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 32, margin: 32,
    alignItems: 'center', width: W - 64,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  processingTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  processingSub: { fontSize: 14, color: '#aaa', marginBottom: 24 },
  processingSteps: { width: '100%', gap: 12 },
  processingStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  processingStepText: { fontSize: 13, color: '#888' },

  // ── Result ──
  resultRoot: { flex: 1, backgroundColor: '#F6F6F6' },
  resultContent: { paddingBottom: 20 },

  successBanner: {
    backgroundColor: BRAND, paddingTop: Platform.OS === 'ios' ? 70 : 48,
    paddingBottom: 32, paddingHorizontal: 24, alignItems: 'center',
  },
  successIcon: { fontSize: 48, marginBottom: 10 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  successSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  successSubWarn: { fontSize: 14, color: '#ffaaaa' },

  resultCard: {
    backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, marginTop: 14,
    padding: 18, borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  resultCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  resultStoreName: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', flex: 1 },
  resultDate: { fontSize: 13, color: '#aaa', marginLeft: 8 },
  resultTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5', marginBottom: 8 },
  resultTotalLabel: { fontSize: 14, color: '#888', fontWeight: '500' },
  resultTotal: { fontSize: 26, fontWeight: '800', color: BRAND },
  resultMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  resultMetaLabel: { fontSize: 13, color: '#aaa' },
  resultMetaValue: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },

  resultItemsTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  itemLeft: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  itemQty: { fontSize: 12, color: '#aaa', marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  itemsTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1.5, borderTopColor: '#eee' },
  itemsTotalLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  itemsTotalValue: { fontSize: 16, fontWeight: '800', color: BRAND },

  rawCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0' },
  rawToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rawToggleText: { fontSize: 14, fontWeight: '600', color: '#555' },
  rawChevron: { fontSize: 12, color: '#aaa' },
  rawText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#888', padding: 16, paddingTop: 0, lineHeight: 18 },

  resultActions: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 20 },
  resultDoneBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0' },
  resultDoneBtnText: { fontSize: 14, fontWeight: '700', color: '#555' },
  resultGoBtn: { flex: 1, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  resultGoBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});