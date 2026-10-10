import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS } from '../../constants/theme';
import { ArrowLeft } from 'lucide-react-native';

/**
 * Legacy prototype screen — demo cash-flow mocks removed.
 * Canonical forecast UI lives in `frontend/app/(tabs)/insights.tsx`
 * backed by GET /api/v1/analytics/cash-flow/forecast.
 */
export default function CashflowScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft color={COLORS.text} size={22} strokeWidth={1.8} />
        </TouchableOpacity>
        <Typography variant="pageTitle" style={{ fontSize: 22 }}>
          Cash Flow Forecast
        </Typography>
      </View>
      <View style={styles.body}>
        <Typography variant="body" color={COLORS.textSecondary} style={{ lineHeight: 22 }}>
          This legacy demo screen no longer ships hardcoded balances. Open the Assay app Insights
          tab (Cash Flow Forecast) which loads projections from the synthetic ledger API.
        </Typography>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20 },
});
