const fs = require('fs');

function polarToCartesian(cx, cy, r, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians)
  };
}

function getDonutSectorPath(cx, cy, rInner, rOuter, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);

  const angleDiff = endAngle - startAngle;
  const largeArcFlag = angleDiff > 180 ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

// Total 360 degrees
// Categories:
// Food & Dining: 35% -> 126 deg
// Transport: 16% -> 57.6 deg
// Subscriptions: 14% -> 50.4 deg
// Others: 10% -> 36 deg
// Shopping: 25% -> 90 deg

const gap = 3.5; // degrees gap between segments
const categories = [
  { name: 'Food & Dining', percent: 35, color: '#F59E0B' },
  { name: 'Transport', percent: 16, color: '#10B981' },
  { name: 'Subscriptions', percent: 14, color: '#F97316' },
  { name: 'Others', percent: 10, color: '#94A3B8' },
  { name: 'Shopping', percent: 25, color: '#111827' }
];

// Let startAngle start so Food & Dining begins at around 3 degrees (just right of 12 o'clock)
// In polarToCartesian, (angle - 90): 0 deg is 12 o'clock!
let currentAngle = 2.5; // small gap centered around 12 o'clock

const sectors = categories.map(cat => {
  const span = (cat.percent / 100) * 360 - gap;
  const start = currentAngle + gap / 2;
  const end = start + span;
  currentAngle += (cat.percent / 100) * 360;
  return {
    ...cat,
    start,
    end,
    mid: (start + end) / 2
  };
});

console.log(JSON.stringify(sectors, null, 2));
