import React, { useState, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  GestureResponderEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
  G,
} from "react-native-svg";
import { Typography } from "../../components/Typography";
import { COLORS } from "../../constants/theme";
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
} from "lucide-react-native";

interface DayDataPoint {
  day: number;
  label: string;
  balance: number;
  pctX: number;
  event?: string;
  eventAmount?: string;
  eventType?: "income" | "bill" | "emi" | "subscription";
}

const FULL_MONTH_DATA: DayDataPoint[] = [
  { day: 1,  label: "1 Sep",  balance: 42850, pctX: 0.0  },
  { day: 7,  label: "7 Sep",  balance: 37400, pctX: 0.17 },
  { day: 14, label: "14 Sep", balance: 31000, pctX: 0.35 },
  { day: 21, label: "21 Sep", balance: 24000, pctX: 0.52 },
  { day: 22, label: "22 Sep", balance: 15600, pctX: 0.58,
    event: "Axis Car Loan EMI", eventAmount: "-₹8,400", eventType: "emi" },
  { day: 24, label: "24 Sep", balance: 13200, pctX: 0.64,
    event: "Adani Electricity",  eventAmount: "-₹2,100", eventType: "bill" },
  { day: 25, label: "25 Sep", balance: 3200,  pctX: 0.70 },
  { day: 28, label: "28 Sep", balance: 88200, pctX: 0.86,
    event: "Monthly Salary", eventAmount: "+₹85,000", eventType: "income" },
  { day: 30, label: "30 Sep", balance: 82400, pctX: 1.0  },
];

const EVENT_FILTERS = ["All", "Income", "Bills", "EMIs"] as const;
type EventFilter = typeof EVENT_FILTERS[number];

function filterMatch(filter: EventFilter, type?: string): boolean {
  if (filter === "All") return true;
  if (filter === "Income") return type === "income";
  if (filter === "Bills") return type === "bill";
  if (filter === "EMIs") return type === "emi";
  return false;
}

export default function CashFlowDetailScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<EventFilter>("All");
  const [cardWidth, setCardWidth] = useState<number>(0);
  const [selectedPoint, setSelectedPoint] = useState<DayDataPoint | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const screenWidth = Dimensions.get("window").width;
  const actualWidth = cardWidth > 0 ? cardWidth : screenWidth - 40;

  const chartH = 240; const padL = 44; const padR = 12;
  const padTop = 24; const padBottom = 28;
  const plotW = Math.max(actualWidth - padL - padR, 160);
  const plotH = chartH - padTop - padBottom;
  const baseY = padTop + plotH;
  const maxVal = 100000;

  const getX = (d: DayDataPoint) => padL + d.pctX * plotW;
  const getY = (val: number) => Math.min(padTop + (1 - Math.max(0, Math.min(val / maxVal, 1))) * plotH, baseY - 6);

  const troughPoint = FULL_MONTH_DATA.find(d => d.day === 25)!;

  const { linePath, areaPath } = useMemo(() => {
    const pts = FULL_MONTH_DATA.map(d => ({ x: getX(d), y: getY(d.balance), isTrough: d.balance <= 3500, isPeak: d.balance >= 80000 }));
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1]; const dx = p2.x - p1.x;
      let cp1x = p1.x + dx * 0.38, cp1y = p1.y, cp2x = p2.x - dx * 0.38, cp2y = p2.y;
      if (p2.isTrough)      { cp2y = p2.y; cp1y = p1.y + (p2.y - p1.y) * 0.3; }
      else if (p1.isTrough) { cp1y = p1.y; cp2y = p2.y - (p2.y - p1.y) * 0.2; }
      else if (p2.isPeak)   { cp2y = p2.y; cp1y = p1.y + (p2.y - p1.y) * 0.5; }
      else { cp1y = p1.y + (p2.y - p1.y) * 0.25; cp2y = p2.y - (p2.y - p1.y) * 0.25; }
      cp1y = Math.min(cp1y, baseY - 5); cp2y = Math.min(cp2y, baseY - 5);
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    const fp = pts[0], lp = pts[pts.length - 1];
    return { linePath: path, areaPath: `${path} L ${lp.x.toFixed(1)} ${baseY.toFixed(1)} L ${fp.x.toFixed(1)} ${baseY.toFixed(1)} Z` };
  }, [actualWidth]);

  const yTicks = [
    { val: 100000, label: "₹100k" }, { val: 75000, label: "₹75k" },
    { val: 50000, label: "₹50k" }, { val: 25000, label: "₹25k" }, { val: 0, label: "₹0" },
  ];

  const handleTouch = (evt: GestureResponderEvent) => {
    const tx = evt.nativeEvent.locationX;
    let closest = FULL_MONTH_DATA[0], minD = Infinity;
    FULL_MONTH_DATA.forEach(pt => { const d = Math.abs(getX(pt) - tx); if (d < minD) { minD = d; closest = pt; } });
    setSelectedPoint(prev => prev?.day === closest.day ? null : closest);
  };

  const toggleAssumptions = () => {
    setAssumptionsOpen(prev => !prev);
    Animated.timing(rotateAnim, { toValue: assumptionsOpen ? 0 : 1, duration: 200, useNativeDriver: true }).start();
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const filteredEvents = FULL_MONTH_DATA.filter(d => d.event && filterMatch(activeFilter, d.eventType));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Typography variant="heading" style={styles.headerTitle}>Cash Flow Forecast</Typography>
          <Typography variant="caption" color={COLORS.textSecondary} style={styles.headerSub}>
            Understand how your balance may move over the next 30 days.
          </Typography>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Typography variant="caption" style={styles.metricLbl}>Current</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: COLORS.text }]}>₹42,850</Typography>
          </View>
          <View style={[styles.metricCard, { alignItems: "center" }]}>
            <Typography variant="caption" style={styles.metricLbl}>Min Projected</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: "#DC2626" }]}>₹3,200</Typography>
          </View>
          <View style={[styles.metricCard, { alignItems: "flex-end" }]}>
            <Typography variant="caption" style={styles.metricLbl}>End Balance</Typography>
            <Typography variant="financial" style={[styles.metricVal, { color: "#16A34A" }]}>₹82,400</Typography>
          </View>
        </View>

        <View style={styles.chartCard} onLayout={e => { const w = e.nativeEvent.layout.width; if (w > 0 && Math.abs(w - cardWidth) > 2) setCardWidth(w); }}>
          <View onTouchStart={handleTouch} onTouchMove={handleTouch}>
            <Svg width={actualWidth} height={chartH}>
              <Defs>
                <LinearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#D6A928" stopOpacity="0.35" />
                  <Stop offset="70%" stopColor="#D6A928" stopOpacity="0.07" />
                  <Stop offset="100%" stopColor="#D6A928" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              {yTicks.map(({ val, label }) => {
                const yp = getY(val); const isZ = val === 0;
                return (
                  <G key={`y${val}`}>
                    <Line x1={padL} y1={yp} x2={actualWidth - padR} y2={yp}
                      stroke={isZ ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)"}
                      strokeDasharray={isZ ? undefined : "3 3"} strokeWidth={isZ ? 1.2 : 1} />
                    <SvgText x={padL - 5} y={yp + 3.5} fill="rgba(255,255,255,0.38)" fontSize="8" fontWeight="500" textAnchor="end">{label}</SvgText>
                  </G>
                );
              })}
              {areaPath ? <Path d={areaPath} fill="url(#dg)" /> : null}
              {linePath ? <Path d={linePath} fill="none" stroke="#D6A928" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
              {[1, 14, 22, 25, 28, 30].map(day => {
                const pt = FULL_MONTH_DATA.find(d => d.day === day); if (!pt) return null;
                const isTr = pt.day === 25, isSa = pt.day === 28;
                return <SvgText key={`xl${day}`} x={getX(pt)} y={baseY + 16}
                  fill={isTr ? "#FCA5A5" : isSa ? "#86EFAC" : "rgba(255,255,255,0.38)"}
                  fontSize={isTr || isSa ? "8.5" : "7.5"} fontWeight={isTr || isSa ? "700" : "500"} textAnchor="middle">{pt.label}</SvgText>;
              })}
              <G>
                <Line x1={getX(troughPoint)} y1={getY(troughPoint.balance) - 8} x2={getX(troughPoint)} y2={baseY} stroke="#EF4444" strokeDasharray="2 3" strokeWidth="1" />
                <Circle cx={getX(troughPoint)} cy={getY(troughPoint.balance)} r="9" fill="rgba(239,68,68,0.15)" />
                <Circle cx={getX(troughPoint)} cy={getY(troughPoint.balance)} r="4.5" fill="#EF4444" stroke="#0F172A" strokeWidth="1.5" />
                <SvgText x={getX(troughPoint)} y={getY(troughPoint.balance) - 13} fill="#FCA5A5" fontSize="8" fontWeight="700" textAnchor="middle">₹3,200</SvgText>
              </G>
              {filteredEvents.map(pt => {
                if (pt.day === 25) return null;
                const isIn = pt.eventType === "income";
                const mc = isIn ? "#22C55E" : "#F59E0B", rc = isIn ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)";
                return (<G key={`em${pt.day}`}>
                  <Circle cx={getX(pt)} cy={getY(pt.balance)} r="7" fill={rc} />
                  <Circle cx={getX(pt)} cy={getY(pt.balance)} r="4" fill={mc} stroke="#0F172A" strokeWidth="1.5" />
                </G>);
              })}
              {selectedPoint && (<G>
                <Line x1={getX(selectedPoint)} y1={padTop} x2={getX(selectedPoint)} y2={baseY} stroke="#D6A928" strokeWidth="1" strokeDasharray="2 2" />
                <Circle cx={getX(selectedPoint)} cy={getY(selectedPoint.balance)} r="6" fill="#D6A928" stroke="#0F172A" strokeWidth="2" />
              </G>)}
            </Svg>
          </View>
        </View>

        {selectedPoint && (
          <View style={styles.tooltipCard}>
            <View style={styles.tooltipRow}>
              <Typography variant="bodyBold" style={{ fontSize: 14 }}>{selectedPoint.label}</Typography>
              <TouchableOpacity onPress={() => setSelectedPoint(null)}>
                <Typography variant="caption" style={{ color: COLORS.textSecondary, fontSize: 16, paddingHorizontal: 4 }}>x</Typography>
              </TouchableOpacity>
            </View>
            <Typography variant="caption" color={COLORS.textSecondary} style={{ marginBottom: 4 }}>Projected Balance</Typography>
            <Typography variant="financial" style={{ fontSize: 22, fontWeight: "700", color: COLORS.text, marginBottom: 6 }}>
              ₹{selectedPoint.balance.toLocaleString("en-IN")}
            </Typography>
            {selectedPoint.event && (
              <View style={styles.tooltipEvent}>
                <Typography variant="caption" color={COLORS.textSecondary}>{selectedPoint.event}</Typography>
                <Typography variant="caption" style={{ fontWeight: "700", fontSize: 14, color: selectedPoint.eventType === "income" ? "#16A34A" : "#DC2626" }}>
                  {selectedPoint.eventAmount}
                </Typography>
              </View>
            )}
          </View>
        )}

        <View style={styles.filterSection}>
          <Typography variant="cardHeading" style={{ fontSize: 17, marginBottom: 10, color: COLORS.text }}>Forecast Events</Typography>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {EVENT_FILTERS.map(f => (
              <TouchableOpacity key={f} style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
                onPress={() => setActiveFilter(f)} activeOpacity={0.75}>
                <Typography variant="caption" style={[{ fontSize: 12, fontWeight: "600", color: COLORS.textSecondary }, activeFilter === f && { color: "#FFFFFF" }]}>{f}</Typography>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 20, gap: 10 }}>
          {filteredEvents.map(pt => {
            const isIn = pt.eventType === "income";
            const dotColor = isIn ? "#16A34A" : pt.eventType === "emi" ? "#EF4444" : "#D97706";
            return (
              <View key={`ev${pt.day}`} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Typography variant="body" style={{ fontSize: 13.5, fontWeight: "600" }}>{pt.event}</Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>{pt.label}</Typography>
                </View>
                <Typography variant="financial" style={{ fontSize: 15, color: isIn ? "#16A34A" : "#DC2626", fontWeight: "700" }}>{pt.eventAmount}</Typography>
              </View>
            );
          })}
          {filteredEvents.length === 0 && (
            <Typography variant="caption" color={COLORS.textSecondary} style={{ textAlign: "center", paddingVertical: 12 }}>No events for this filter</Typography>
          )}
        </View>

        <View style={styles.warnCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <AlertTriangle color="#D97706" size={20} />
            <Typography variant="bodyBold" color="#92400E" style={{ marginLeft: 8, fontSize: 15 }}>Solvency Warning</Typography>
          </View>
          <Typography variant="body" color="#92400E" style={{ fontSize: 13.5, lineHeight: 20, marginBottom: 8 }}>
            Your projected balance falls to ₹3,200 on 25 Sep after your ₹8,400 car EMI.
          </Typography>
          <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: "#FDE68A", marginBottom: 4 }}>
            <Typography variant="caption" color="#B45309">Your preferred liquidity floor is ₹5,000</Typography>
          </View>
          <Typography variant="caption" color="#DC2626" style={{ fontWeight: "700", marginBottom: 10 }}>₹1,800 below your preferred buffer</Typography>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            onPress={() => router.push("/simulator")} activeOpacity={0.8}>
            <Typography variant="caption" style={{ color: "#B45309", fontWeight: "700", fontSize: 12.5 }}>See what could change this</Typography>
            <ArrowRight color="#B45309" size={14} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.assumptionHeader} onPress={toggleAssumptions} activeOpacity={0.8}>
          <Typography variant="bodyBold" style={{ fontSize: 14 }}>How is this forecast calculated?</Typography>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <ChevronDown color={COLORS.textSecondary} size={18} />
          </Animated.View>
        </TouchableOpacity>

        {assumptionsOpen && (
          <View style={styles.assumptionBody}>
            <Typography variant="caption" color={COLORS.textSecondary} style={{ fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" }}>Based on:</Typography>
            {["Recent transaction history", "Recurring income patterns", "Recurring obligations", "Detected subscriptions", "Historical spending patterns"].map(item => (
              <View key={item} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.textSecondary }} />
                <Typography variant="caption" color={COLORS.textSecondary}>{item}</Typography>
              </View>
            ))}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 6 }}>
              {[["Forecast horizon", "30 days"], ["Last updated", "Today, 12:09 PM"]].map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Typography variant="caption" color={COLORS.textSecondary}>{k}</Typography>
                  <Typography variant="caption" style={{ fontWeight: "600" }}>{v}</Typography>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginTop: 4 },
  headerTitle: { fontSize: 22, color: COLORS.text, lineHeight: 26 },
  headerSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  content: { paddingHorizontal: 20 },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metricCard: { flex: 1 },
  metricLbl: { fontSize: 9.5, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  metricVal: { fontSize: 17, fontWeight: "700" },
  chartCard: { backgroundColor: "#0F172A", borderRadius: 20, paddingTop: 10, paddingBottom: 6, marginBottom: 12, overflow: "hidden" },
  tooltipCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 14 },
  tooltipRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  tooltipEvent: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4 },
  filterSection: { marginBottom: 10 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterPillActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  eventRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 12 },
  eventDot: { width: 10, height: 10, borderRadius: 5 },
  warnCard: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 18, padding: 16, marginBottom: 14 },
  assumptionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 2 },
  assumptionBody: { backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 14, marginTop: 4 },
});


