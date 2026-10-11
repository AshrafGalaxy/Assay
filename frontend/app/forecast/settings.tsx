import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { ChevronLeft, Info } from 'lucide-react-native';
import {
  fetchForecastSettings,
  saveForecastSettings,
  formatINR,
} from '../../services/finance';

function AmountInput({
  value,
  onChangeValue,
}: {
  value: number;
  onChangeValue: (next: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <TextInput
      style={styles.amountInput}
      keyboardType="number-pad"
      value={focused ? draft : formatINR(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(value > 0 ? String(Math.round(value)) : '');
      }}
      onChangeText={(raw) => {
        const digits = raw.replace(/[^0-9]/g, '');
        setDraft(digits);
        onChangeValue(digits ? parseInt(digits, 10) : 0);
      }}
      onBlur={() => setFocused(false)}
      selectTextOnFocus
      placeholder="₹0"
      placeholderTextColor="#9CA3AF"
    />
  );
}

export default function ForecastSettingsScreen() {
  const router = useRouter();

  // Settings State
  const [forecastPeriod, setForecastPeriod] = useState<'3M' | '6M' | '12M'>('6M');
  const [minReserve, setMinReserve] = useState<number>(0);
  const [includeIncome, setIncludeIncome] = useState(true);
  const [includeEssential, setIncludeEssential] = useState(true);
  const [includeDiscretionary, setIncludeDiscretionary] = useState(true);
  const [includeDebt, setIncludeDebt] = useState(true);
  const [includeObligations, setIncludeObligations] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await fetchForecastSettings();
      if (settings) {
        setForecastPeriod(
          settings.horizon_months === 3 ? '3M' : settings.horizon_months === 12 ? '12M' : '6M'
        );
        if (settings.minimum_reserve != null) {
          setMinReserve(settings.minimum_reserve);
        }
        setIncludeIncome(settings.include_income ?? true);
        setIncludeEssential(settings.include_essential ?? true);
        setIncludeDiscretionary(settings.include_discretionary ?? true);
        setIncludeDebt(settings.include_debt ?? true);
        setIncludeObligations(settings.include_obligations ?? true);
      }
    } catch {
      // Keep sensible defaults if network or offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const horizonMonths = forecastPeriod === '3M' ? 3 : forecastPeriod === '12M' ? 12 : 6;
      await saveForecastSettings({
        horizon_months: horizonMonths as 1 | 3 | 6 | 12,
        minimum_reserve: minReserve,
        include_income: includeIncome,
        include_essential: includeEssential,
        include_discretionary: includeDiscretionary,
        include_debt: includeDebt,
        include_obligations: includeObligations,
      });

      Alert.alert('Settings Saved', 'Forecast calculation preferences have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Save Failed', 'Unable to persist preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft color={COLORS.primary} size={24} />
        </TouchableOpacity>
        <Typography variant="h2" color={COLORS.primary} style={styles.headerTitle}>
          Update My Plan
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Forecast Period Section */}
        <View style={styles.sectionCard}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.sectionTitle}>
            Forecast period
          </Typography>
          <View style={styles.segmentedRow}>
            {(['3M', '6M', '12M'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.segmentBtn,
                  forecastPeriod === period && styles.segmentBtnActive,
                ]}
                onPress={() => setForecastPeriod(period)}
                activeOpacity={0.8}
              >
                <Typography
                  variant="bodyMedium"
                  color={forecastPeriod === period ? COLORS.white : COLORS.primary}
                  style={styles.segmentText}
                >
                  {period}
                </Typography>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Minimum Cash Reserve Section */}
        <View style={styles.sectionCard}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.sectionTitle}>
            Safety Buffer
          </Typography>

          <Typography variant="caption" color={COLORS.textSecondary} style={styles.reserveLabel}>
            Current setting
          </Typography>
          <AmountInput value={minReserve} onChangeValue={setMinReserve} />

          <View style={styles.recommendationBox}>
            <Info size={14} color={COLORS.gold} style={{ marginRight: 6, marginTop: 2 }} />
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.recommendationText}>
              Recommended: about 3 months of Monthly Spending & Bills.
            </Typography>
          </View>
        </View>

        {/* Include in Forecast Toggles */}
        <View style={styles.sectionCard}>
          <Typography variant="bodyBold" color={COLORS.primary} style={styles.sectionTitle}>
            Include in Forecast
          </Typography>

          <View style={styles.toggleList}>
            <View style={styles.toggleRow}>
              <Typography variant="body" color={COLORS.primary}>
                Monthly Income
              </Typography>
              <Switch
                value={includeIncome}
                onValueChange={setIncludeIncome}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
                thumbColor={includeIncome ? COLORS.gold : '#FFFFFF'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <Typography variant="body" color={COLORS.primary}>
                Essential Expenses
              </Typography>
              <Switch
                value={includeEssential}
                onValueChange={setIncludeEssential}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
                thumbColor={includeEssential ? COLORS.gold : '#FFFFFF'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <Typography variant="body" color={COLORS.primary}>
                Discretionary Spending
              </Typography>
              <Switch
                value={includeDiscretionary}
                onValueChange={setIncludeDiscretionary}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
                thumbColor={includeDiscretionary ? COLORS.gold : '#FFFFFF'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <Typography variant="body" color={COLORS.primary}>
                Debt Payments (EMI)
              </Typography>
              <Switch
                value={includeDebt}
                onValueChange={setIncludeDebt}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
                thumbColor={includeDebt ? COLORS.gold : '#FFFFFF'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <Typography variant="body" color={COLORS.primary}>
                Upcoming Obligations
              </Typography>
              <Switch
                value={includeObligations}
                onValueChange={setIncludeObligations}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
                thumbColor={includeObligations ? COLORS.gold : '#FFFFFF'}
              />
            </View>
          </View>
        </View>

        {/* Save Changes Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Typography variant="bodyBold" color={COLORS.white}>
              Save Preferences
            </Typography>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  scrollContent: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 8,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    marginBottom: 12,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 13.5,
  },
  reserveLabel: {
    marginBottom: 8,
  },
  amountInput: {
    fontFamily: FONTS.bodyBold,
    fontSize: 28,
    color: COLORS.primary,
    backgroundColor: '#F8F7F4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  recommendationBox: {
    flexDirection: 'row',
    backgroundColor: '#FCFAF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFE5CC',
  },
  recommendationText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  toggleList: {
    gap: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
});
