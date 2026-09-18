import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Share, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, SIZES } from '../../constants/theme';
import {
  ChevronLeft,
  Share2,
  MoreVertical,
  ArrowUp,
  Copy,
  Pencil,
  FileText,
  Check,
  X,
  Sparkles,
  ExternalLink
} from 'lucide-react-native';

export default function TransactionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    merchantKey?: string;
    amount?: string;
    time?: string;
    method?: string;
    category?: string;
    notes?: string;
  }>();

  const name = params.name || 'Starbucks';
  const merchantKey = params.merchantKey || 'starbucks';
  const amount = params.amount || '₹250';
  const time = params.time ? `${params.time}` : 'Today, 9:42 AM';
  const method = params.method || 'UPI';
  const category = params.category || 'Food & Dining';
  const initialNotes = params.notes || (name.toLowerCase().includes('starbucks') ? 'Morning coffee ☕' : 'Verified via Assay');

  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [receiptVisible, setReceiptVisible] = useState(false);

  const txId = `T240626${(params.id || '942331145').replace(/[^0-9]/g, '') || '0942331145'}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Assay Transaction: ${name} ${amount} (${method}) on ${time}. Ref: ${txId}`,
      });
    } catch (error) {
      // ignore
    }
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color={COLORS.text} size={24} />
        </TouchableOpacity>

        <View style={styles.rightActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Share2 color={COLORS.text} size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <MoreVertical color={COLORS.text} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Merchant Hero */}
        <View style={styles.heroSection}>
          <MerchantLogo name={merchantKey} size={84} style={styles.merchantLogo} />

          <Typography variant="h1" style={styles.merchantName}>
            {name}
          </Typography>

          <Typography variant="display" style={styles.amount}>
            {amount}
          </Typography>

          <View style={styles.metaRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              {time}
            </Typography>

            <View style={styles.methodBadge}>
              <ArrowUp color="#16A34A" size={14} style={{ marginRight: 4 }} />
              <Typography variant="caption" style={styles.methodBadgeText}>
                {method}
              </Typography>
            </View>
          </View>
        </View>

        {/* Structured Info Card */}
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              Category
            </Typography>
            <Typography variant="bodyBold" color={COLORS.text}>
              {category}
            </Typography>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              Payment Method
            </Typography>
            <Typography variant="bodyBold" color={COLORS.text}>
              {method}
            </Typography>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              Status
            </Typography>
            <Typography variant="bodyBold" color="#16A34A">
              Completed
            </Typography>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              UPI ID
            </Typography>
            <Typography variant="bodyBold" color={COLORS.text}>
              ashish@oksbi
            </Typography>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              Transaction ID
            </Typography>
            <TouchableOpacity
              style={styles.copyRow}
              onPress={handleCopy}
              activeOpacity={0.7}
            >
              <Typography variant="bodyBold" color={COLORS.text} style={styles.idText}>
                {txId}
              </Typography>
              {copied ? (
                <Check color="#16A34A" size={16} style={{ marginLeft: 6 }} />
              ) : (
                <Copy color={COLORS.textSecondary} size={16} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Typography variant="secondary" color={COLORS.textSecondary}>
              Notes
            </Typography>
            <View style={styles.copyRow}>
              <Typography variant="bodyBold" color={COLORS.text}>
                {notes}
              </Typography>
              <Pencil color={COLORS.textSecondary} size={15} style={{ marginLeft: 8 }} />
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* View Receipt Button */}
        <TouchableOpacity
          style={styles.viewReceiptButton}
          activeOpacity={0.8}
          onPress={() => setReceiptVisible(true)}
        >
          <Typography variant="bodyBold" color={COLORS.text} style={{ marginRight: 8, fontSize: 16 }}>
            View Receipt
          </Typography>
          <FileText color={COLORS.text} size={20} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* In-Screen Receipt Preview Modal */}
      <Modal
        visible={receiptVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReceiptVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.ocrTag}>
                <Sparkles color="#D6A928" size={16} style={{ marginRight: 4 }} />
                <Typography variant="caption" style={{ color: '#B45309', fontWeight: '700' }}>
                  OCR Verified Receipt
                </Typography>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setReceiptVisible(false)}
              >
                <X color={COLORS.text} size={20} />
              </TouchableOpacity>
            </View>

            {/* Paper Receipt Visual */}
            <View style={styles.paperReceipt}>
              <Typography variant="bodyBold" align="center" style={styles.receiptBrand}>
                {name.toUpperCase()}
              </Typography>
              <Typography variant="caption" color={COLORS.textSecondary} align="center" style={{ marginBottom: 12 }}>
                TAX INVOICE • {time}
              </Typography>

              <View style={styles.receiptDashLine} />

              <View style={styles.receiptLineItem}>
                <Typography variant="secondary">Item 01 (Regular)</Typography>
                <Typography variant="bodyBold">{amount}</Typography>
              </View>

              <View style={styles.receiptLineItem}>
                <Typography variant="caption" color={COLORS.textSecondary}>GST (5%)</Typography>
                <Typography variant="caption" color={COLORS.textSecondary}>Included</Typography>
              </View>

              <View style={styles.receiptDashLine} />

              <View style={styles.receiptLineItem}>
                <Typography variant="bodyBold">TOTAL PAID</Typography>
                <Typography variant="financial" color="#16A34A">{amount}</Typography>
              </View>
            </View>

            <TouchableOpacity
              style={styles.uploadScreenBtn}
              onPress={() => {
                setReceiptVisible(false);
                router.push('/(tabs)/upload');
              }}
            >
              <Typography variant="bodyBold" color={COLORS.text} style={{ marginRight: 6 }}>
                Open in Receipt Manager
              </Typography>
              <ExternalLink color={COLORS.text} size={16} />
            </TouchableOpacity>
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  merchantLogo: {
    marginBottom: 16,
  },
  merchantName: {
    fontSize: 28,
    marginBottom: 8,
    color: COLORS.text,
  },
  amount: {
    fontSize: 44,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  methodBadgeText: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 12,
  },
  detailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginTop: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  idText: {
    fontSize: 14,
  },
  viewReceiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ocrTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paperReceipt: {
    backgroundColor: '#FAF9F5',
    borderWidth: 1,
    borderColor: '#E7E7E3',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  receiptBrand: {
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 4,
  },
  receiptDashLine: {
    height: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  receiptLineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  uploadScreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 14,
  },
});
