import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Typography } from '../../components/Typography';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, FONTS } from '../../constants/theme';
import { useAAState } from '../../services/aaState';
import {
  confirmReceipt,
  RECEIPT_CATEGORIES,
  ReceiptOcrResult,
  scanReceipt,
} from '../../services/upload';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  ChevronRight,
} from 'lucide-react-native';

interface UploadItem {
  id: string;
  merchant: string;
  title: string;
  time: string;
  amount: string;
  category: string;
  notes: string;
  status: 'Processed' | 'Analyzing';
}

const RECENT_UPLOADS: UploadItem[] = [
  { id: 'tx-1', merchant: 'starbucks', title: 'Starbucks Receipt', time: 'Today, 9:42 AM', amount: '₹250', category: 'Food & Dining', notes: 'Morning coffee ☕', status: 'Processed' },
  { id: 'tx-2', merchant: 'uber', title: 'Uber Ride', time: 'Today, 8:20 AM', amount: '₹120', category: 'Transport', notes: 'Morning Commute to HQ', status: 'Processed' },
  { id: 'tx-3', merchant: 'amazon', title: 'Amazon Purchase', time: 'Yesterday, 6:10 PM', amount: '₹899', category: 'Shopping', notes: 'Office Desk Accessories', status: 'Processed' },
];

export default function UploadScreen() {
  const router = useRouter();
  const aaState = useAAState();

  const [uploads, setUploads] = useState<UploadItem[]>(RECENT_UPLOADS);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptOcrResult | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Other');
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryChipOffsets = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!scanResult) return;
    setEditMerchant(scanResult.receipt?.merchant || '');
    setEditAmount(
      scanResult.receipt?.total_amount != null ? String(scanResult.receipt.total_amount) : '',
    );
    setEditCategory(scanResult.suggested_category || 'Other');
  }, [scanResult]);

  // Bring the selected chip into view: the classifier's pick may be off-screen in
  // the horizontal row (e.g. "Entertainment", "Other"), which looks like nothing is selected.
  useEffect(() => {
    if (!scanResult) return;
    const x = categoryChipOffsets.current[editCategory];
    if (x == null) return;
    const timer = setTimeout(() => {
      categoryScrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [editCategory, scanResult]);

  const suggestedCategory = scanResult?.suggested_category ?? null;

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsScanning(true);
    try {
      const result = await scanReceipt({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      });
      setScanResult(result);
      if (result.status === 'UNREADABLE') {
        Alert.alert(
          'Receipt needs review',
          result.message || 'We could not read this image. Edit the fields below or try another photo.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check that the Assay backend is running, then try again.';
      Alert.alert('Could not scan receipt', message);
    } finally {
      setIsScanning(false);
    }
  };

  const takeReceiptPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to scan a receipt.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const chooseReceiptImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to select a receipt or UPI screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const parsedAmount = Number(editAmount.replace(/,/g, '').trim());
  const canConfirm = Boolean(editMerchant.trim()) && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const saveScannedReceipt = async () => {
    if (!scanResult || !canConfirm) return;
    setIsSaving(true);
    try {
      const saved = await confirmReceipt(scanResult, {
        merchant: editMerchant.trim(),
        total_amount: parsedAmount,
        category: editCategory,
      });
      const newItem: UploadItem = {
        id: saved.transaction_id,
        merchant: 'receipt',
        title: editMerchant.trim(),
        time: 'Just now',
        amount: `₹${parsedAmount.toLocaleString('en-IN')}`,
        category: saved.category || editCategory,
        notes: 'Created from receipt OCR scan',
        status: 'Processed',
      };
      setUploads((current) => [newItem, ...current]);
      setScanResult(null);
      router.push({
        pathname: '/transaction/[id]',
        params: {
          id: saved.transaction_id,
          name: editMerchant.trim(),
          merchantKey: 'receipt',
          amount: newItem.amount,
          time: newItem.time,
          method: scanResult.receipt.payment_method || 'Receipt',
          category: newItem.category,
          notes: newItem.notes,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please review the extracted fields and try again.';
      Alert.alert('Could not add transaction', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleScanAction = (source: 'camera' | 'gallery' | 'manual') => {
    if (source === 'manual') {
      Alert.alert(
        'Manual Transaction',
        'Add a custom expense or cash transaction.',
        [
          { text: 'Add ₹150 Chai & Snacks', onPress: () => {
            const newItem: UploadItem = {
              id: `tx-${Date.now()}`,
              merchant: 'chaipoint',
              title: 'Chai Point',
              time: 'Just now',
              amount: '₹150',
              category: 'Food & Dining',
              notes: 'Manual entry: Evening tea',
              status: 'Processed',
            };
            setUploads((prev) => [newItem, ...prev]);
          }},
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if (source === 'camera') {
      void takeReceiptPhoto();
      return;
    }
    void chooseReceiptImage();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Typography variant="pageTitle" style={styles.headerTitle}>
          Add financial activity
        </Typography>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={styles.dropZone}
          activeOpacity={0.75}
          onPress={() => handleScanAction('gallery')}
          disabled={isScanning}
        >
          {isScanning ? (
            <ActivityIndicator color={COLORS.text} style={styles.dropZoneIcon} />
          ) : (
            <ImageIcon color={COLORS.text} size={46} strokeWidth={1.6} style={styles.dropZoneIcon} />
          )}
          <Typography variant="cardHeading" style={styles.dropZoneTitle}>
            {isScanning ? 'Extracting text & categorizing…' : 'Upload from gallery'}
          </Typography>
          <Typography variant="secondary" color={COLORS.textSecondary}>
            Pick a receipt or UPI screenshot to scan
          </Typography>
        </TouchableOpacity>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.75}
            onPress={() => handleScanAction('gallery')}
            disabled={isScanning}
          >
            <ImageIcon color={COLORS.text} size={18} style={{ marginRight: 8 }} />
            <Typography variant="bodyBold" color={COLORS.text} style={styles.actionButtonText}>
              Gallery
            </Typography>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.75}
            onPress={() => handleScanAction('camera')}
            disabled={isScanning}
          >
            <Camera color={COLORS.text} size={18} style={{ marginRight: 8 }} />
            <Typography variant="bodyBold" color={COLORS.text} style={styles.actionButtonText}>
              Camera
            </Typography>
          </TouchableOpacity>
        </View>

        {/* Prominent Full-Width Manual Entry Card with balanced vertical presence */}
        <TouchableOpacity
          style={styles.manualEntryCard}
          activeOpacity={0.85}
          onPress={() => router.push('/add-transaction')}
          accessibilityLabel="Add Manual Entry"
          accessibilityRole="button"
        >
          <View style={styles.manualEntryIconWrap}>
            <FileText color={COLORS.gold} size={24} strokeWidth={1.9} />
          </View>
          <View style={styles.manualEntryTextWrap}>
            <Typography variant="bodyBold" color={COLORS.white} style={styles.manualEntryTitle}>
              Add Manual Entry
            </Typography>
            <Typography variant="caption" style={styles.manualEntrySubtitle}>
              Enter cash or unlinked transaction details
            </Typography>
          </View>
          <ChevronRight color="rgba(255, 255, 255, 0.75)" size={22} strokeWidth={2} />
        </TouchableOpacity>

        {/* Subtle, restrained helper note to balance vertical layout */}
        <View style={styles.hintBox}>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.hintText}>
            Tip: Use manual entry for cash expenses, vendor transfers, or splits to keep your monthly figures accurate.
          </Typography>
        </View>

        {!aaState.aa_onboarding_completed && (
          <TouchableOpacity
            style={styles.aaBanner}
            activeOpacity={0.8}
            onPress={() => router.push('/connect')}
          >
            <View style={styles.aaBannerLeft}>
              <Typography variant="caption" color={COLORS.gold} style={{ fontFamily: FONTS.bodyBold, letterSpacing: 0.8 }}>
                RBI ACCOUNT AGGREGATOR
              </Typography>
              <Typography variant="bodyBold" color={COLORS.primary} style={{ marginTop: 2 }}>
                Sync Live Bank Accounts
              </Typography>
              <Typography variant="secondary" color={COLORS.textSecondary} style={{ marginTop: 2 }}>
                Automate statements with consent-based data access.
              </Typography>
            </View>
            <Typography variant="caption" color={COLORS.primary} style={{ fontFamily: FONTS.bodySemiBold }}>
              Connect →
            </Typography>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        visible={scanResult !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setScanResult(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.resultSheet}>
            <Typography variant="cardHeading" style={styles.resultTitle}>Review scan</Typography>
            <Typography variant="secondary" color={COLORS.textSecondary} style={styles.resultSubtitle}>
              Text extracted, fields analyzed, category suggested. Edit anything before saving.
            </Typography>

            <View style={styles.extractCard}>
              <View style={styles.fieldBlock}>
                <Typography variant="caption" color={COLORS.textSecondary}>Merchant</Typography>
                <TextInput
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  placeholder="Merchant name"
                  placeholderTextColor={COLORS.textSecondary}
                  style={styles.fieldInput}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.fieldBlock}>
                <Typography variant="caption" color={COLORS.textSecondary}>Total amount (₹)</Typography>
                <TextInput
                  value={editAmount}
                  onChangeText={setEditAmount}
                  placeholder="0"
                  placeholderTextColor={COLORS.textSecondary}
                  style={styles.fieldInput}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldBlock}>
                <View style={styles.resultRow}>
                  <Typography variant="caption" color={COLORS.textSecondary}>Category</Typography>
                  {suggestedCategory ? (
                    <Typography variant="caption" color={COLORS.gold} style={styles.suggestedLabel}>
                      {suggestedCategory === 'Other'
                        ? 'No confident match — pick one'
                        : `Suggested: ${suggestedCategory}`}
                    </Typography>
                  ) : null}
                </View>
                <ScrollView
                  ref={categoryScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                >
                  {RECEIPT_CATEGORIES.map((category) => {
                    const selected = editCategory === category;
                    return (
                      <TouchableOpacity
                        key={category}
                        style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                        onPress={() => setEditCategory(category)}
                        onLayout={(event) => {
                          categoryChipOffsets.current[category] = event.nativeEvent.layout.x;
                        }}
                        activeOpacity={0.8}
                      >
                        <Typography
                          variant="caption"
                          color={selected ? COLORS.primary : COLORS.text}
                          style={styles.categoryChipText}
                        >
                          {category}
                        </Typography>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.resultRow}>
                <Typography variant="caption" color={COLORS.textSecondary}>OCR confidence</Typography>
                <Typography variant="bodyBold">{Math.round((scanResult?.ocr.overall_confidence || 0) * 100)}%</Typography>
              </View>
            </View>

            <View style={styles.rawTextCard}>
              <Typography variant="caption" color={COLORS.textSecondary}>EXTRACTED TEXT</Typography>
              <Typography variant="secondary" style={styles.rawText} numberOfLines={8}>
                {scanResult?.raw_text || 'No readable text was found.'}
              </Typography>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setScanResult(null)} disabled={isSaving}>
                <Typography variant="bodyBold">Discard</Typography>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
                onPress={() => void saveScannedReceipt()}
                disabled={isSaving || !canConfirm}
              >
                {isSaving ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Typography variant="bodyBold" color={COLORS.primary}>Add transaction</Typography>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    color: COLORS.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 110,
  },
  dropZone: {
    backgroundColor: '#FAF9F5',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D4CEB8',
    borderRadius: 24,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dropZoneIcon: {
    marginBottom: 12,
  },
  dropZoneTitle: {
    fontSize: 19,
    marginBottom: 6,
    color: COLORS.text,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 14,
  },
  actionButtonText: {
    fontSize: 14,
  },
  manualEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16,
  },
  manualEntryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(214, 169, 40, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  manualEntryTextWrap: {
    flex: 1,
  },
  manualEntryTitle: {
    fontSize: 16.5,
    lineHeight: 22,
    marginBottom: 2,
  },
  manualEntrySubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
  },
  hintBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.025)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  hintText: {
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 12,
  },
  aaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FCFAF5',
    borderWidth: 1,
    borderColor: 'rgba(214, 169, 40, 0.35)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  aaBannerLeft: {
    flex: 1,
    paddingRight: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  resultSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 14,
    maxHeight: '92%',
  },
  resultTitle: { color: COLORS.text, fontSize: 22 },
  resultSubtitle: { lineHeight: 20 },
  extractCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  fieldBlock: { gap: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  categoryChipSelected: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(214, 169, 40, 0.18)',
  },
  categoryChipText: {
    fontFamily: FONTS.bodySemiBold,
  },
  suggestedLabel: {
    fontFamily: FONTS.bodySemiBold,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rawTextCard: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  rawText: { color: COLORS.text, lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: {
    flex: 1,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
  },
  confirmButton: {
    flex: 1.6,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  confirmButtonDisabled: { opacity: 0.45 },
});
