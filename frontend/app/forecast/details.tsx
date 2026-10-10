import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { FeatureCard } from '../../components/fi/FeatureCard';
import {
  ChevronLeft,
  ListFilter,
  BarChart2,
  CalendarCheck,
  Settings,
} from 'lucide-react-native';

export default function ForecastDetailsScreen() {
  const router = useRouter();

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
          Forecast Details
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
          Detailed projections, scenario comparisons, contractual obligations, and calculation preferences.
        </Typography>

        {/* Exactly four options according to the specification */}
        <View style={styles.cardsContainer}>
          {/* 1. Monthly Breakdown */}
          <FeatureCard
            title="Monthly Breakdown"
            description="View month-wise details"
            icon={<ListFilter size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/monthly-breakdown')}
          />

          {/* 2. Scenario Analysis */}
          <FeatureCard
            title="Scenario Analysis"
            description="Best, expected and worst case"
            icon={<BarChart2 size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/scenarios')}
          />

          {/* 3. Upcoming Obligations */}
          <FeatureCard
            title="Upcoming Obligations"
            description="View known future payments"
            icon={<CalendarCheck size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/obligations')}
          />

          {/* 4. Forecast Settings */}
          <FeatureCard
            title="Forecast Settings"
            description="Adjust inputs and preferences"
            icon={<Settings size={20} color={COLORS.gold} />}
            onPress={() => router.push('/forecast/settings')}
          />
        </View>

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
    paddingTop: 10,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  cardsContainer: {
    gap: 4,
  },
});
