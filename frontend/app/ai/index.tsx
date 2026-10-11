import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS } from '../../constants/theme';
import { FeatureCard } from '../../components/fi/FeatureCard';
import { FinancialGrowthIllustration } from '../../components/fi/FinancialGrowthIllustration';
import {
  ChevronLeft,
  TrendingUp,
  Sliders,
  ShieldCheck,
  Sparkles,
  Lightbulb,
  ChevronRight,
} from 'lucide-react-native';

export default function FinancialIntelligenceHub() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Subtle Background Golden Wave Ribbon Watermarks */}
      <View style={styles.watermarkLayer} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 390 844" fill="none">
          <Path
            d="M -30 200 C 60 260, 20 420, -10 600"
            stroke="rgba(214, 169, 40, 0.08)"
            strokeWidth="1.5"
          />
          <Path
            d="M 390 320 C 310 400, 340 560, 420 700"
            stroke="rgba(214, 169, 40, 0.08)"
            strokeWidth="1.5"
          />
        </Svg>
      </View>

      {/* Top Header with Back Navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.primary} size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Header Section with Serif Title & Subtle Gold Financial Growth Illustration */}
        <View style={styles.headerSection}>
          <View style={styles.headerTextCol}>
            <Typography variant="h1" color={COLORS.primary} style={styles.title}>
              Financial{'\n'}Intelligence
            </Typography>
            <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
              Plan smarter. Make better financial decisions with AI powered insights.
            </Typography>
          </View>

          {/* Gold Financial Growth Illustration */}
          <View style={styles.illustrationWrapper}>
            <FinancialGrowthIllustration />
          </View>
        </View>

        {/* 2. Premium "YOUR FINANCIAL FOCUS" Card */}
        <TouchableOpacity
          style={styles.focusCard}
          activeOpacity={0.8}
          onPress={() => router.push('/cashflow-detail')}
        >
          {/* Circular Gold Badge with Lightbulb */}
          <View style={styles.bulbBadge}>
            <Lightbulb size={22} color="#CFA42A" strokeWidth={2} />
          </View>

          {/* Center Copy */}
          <View style={styles.focusCopyCol}>
            <Typography variant="caption" style={styles.focusTag}>
              YOUR FINANCIAL FOCUS
            </Typography>
            <Typography variant="bodyBold" color={COLORS.primary} style={styles.focusHeadline}>
              Stay ahead of your next financial decision.
            </Typography>
            <Typography variant="body" color={COLORS.textSecondary} style={styles.focusSubtext}>
              Explore your forecast, test scenarios and understand your options.
            </Typography>
          </View>

          {/* Right Chevron */}
          <View style={styles.focusChevron}>
            <ChevronRight size={18} color="#CFA42A" strokeWidth={2.2} />
          </View>
        </TouchableOpacity>

        {/* 3. The 4 Feature Cards */}
        <View style={styles.cardsContainer}>
          {/* Card 1: Cash Flow Forecast (Highlighted with thin gold border) */}
          <FeatureCard
            title="Cash Flow Forecast"
            description="See where your money is heading"
            icon={<TrendingUp size={22} color="#D6A928" strokeWidth={2.2} />}
            highlighted={true}
            onPress={() => router.push('/cashflow-detail')}
          />

          {/* Card 2: What-If Simulator */}
          <FeatureCard
            title="Update My Plan"
            description="Change income, spending, and your Safety Buffer"
            icon={<Sliders size={22} color="#D6A928" strokeWidth={2.2} />}
            onPress={() => router.push('/simulator')}
          />

          {/* Card 3: Affordability Check */}
          <FeatureCard
            title="Affordability Check"
            description="Check if you can afford a purchase"
            icon={<ShieldCheck size={22} color="#D6A928" strokeWidth={2.2} />}
            onPress={() => router.push('/copilot/affordability')}
          />

          {/* Card 4: ASSAY Copilot */}
          <FeatureCard
            title="ASSAY Copilot"
            description="Get audited insights and recommendations"
            icon={<Sparkles size={22} color="#D6A928" strokeWidth={2.2} />}
            onPress={() => router.push('/copilot/analysis')}
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
    backgroundColor: '#FAF9F6',
  },
  watermarkLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    minHeight: 130,
  },
  headerTextCol: {
    flex: 1,
    paddingRight: 6,
  },
  title: {
    fontSize: 34,
    lineHeight: 39,
    fontFamily: FONTS.heading,
    letterSpacing: -0.5,
    marginBottom: 8,
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    maxWidth: 215,
    fontFamily: FONTS.body,
  },
  illustrationWrapper: {
    width: 138,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.2,
    borderColor: '#F0EFEA',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
      },
    }),
  },
  bulbBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FCF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  focusCopyCol: {
    flex: 1,
  },
  focusTag: {
    fontFamily: FONTS.bodyBold,
    fontSize: 10.5,
    color: '#CFA42A',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  focusHeadline: {
    fontSize: 14.5,
    lineHeight: 19,
    fontFamily: FONTS.bodyBold,
    color: '#0F172A',
  },
  focusSubtext: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: FONTS.body,
    marginTop: 3,
  },
  focusChevron: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardsContainer: {
    gap: 0,
  },
});
