import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Dimensions,
  LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { COLORS } from '../../constants/theme';
import {
  Home,
  Camera,
  List,
  BarChart2,
  Settings,
} from 'lucide-react-native';

const CAPSULE_WIDTH = 50;
const CAPSULE_HEIGHT = 38;
const DOCK_HEIGHT = 62;

export interface FloatingTabBarProps {
  state: {
    index: number;
    routes: Array<{ key: string; name: string; params?: any }>;
  };
  descriptors: Record<string, { options: any }>;
  navigation: {
    emit: (event: any) => any;
    navigate: (name: string, params?: any) => void;
  };
}

export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const [dockWidth, setDockWidth] = useState(screenWidth - 28);

  // Store layout measurements for each tab button
  const tabLayouts = useRef<{ [key: number]: LayoutRectangle }>({});

  // Helper to calculate X destination for a tab based on measured layout
  const getTabDestinationX = useCallback(
    (idx: number): number => {
      const measured = tabLayouts.current[idx];
      if (measured && measured.width > 0) {
        return measured.x + (measured.width - CAPSULE_WIDTH) / 2;
      }
      // Fallback based on dockWidth / 5 until measured
      const tabW = dockWidth / 5;
      return (idx + 0.5) * tabW - CAPSULE_WIDTH / 2;
    },
    [dockWidth]
  );

  // Single shared animated horizontal position and opacity
  const initialX = getTabDestinationX(state.index);
  const translateX = useRef(new Animated.Value(initialX)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Real-time tracking of current rendered coordinate to support smooth interruption
  const currentRenderedX = useRef(initialX);
  const activeIndexRef = useRef(state.index);
  const animIdRef = useRef(0);
  const isInitialMount = useRef(true);

  // Keep currentRenderedX up to date as the animation progresses
  useEffect(() => {
    const listenerId = translateX.addListener(({ value }) => {
      currentRenderedX.current = value;
    });
    return () => {
      translateX.removeListener(listenerId);
    };
  }, [translateX]);

  // Main shared fluid capsule transition animation
  const animateCapsule = useCallback(
    (targetIndex: number) => {
      const destX = getTabDestinationX(targetIndex);
      activeIndexRef.current = targetIndex;

      // Unique token to prevent stale callbacks from cancelling or fading early
      const currentAnimId = ++animIdRef.current;

      // Stop ongoing movement and fade immediately to handle rapid taps cleanly
      translateX.stopAnimation();
      opacity.stopAnimation();

      // Set capsule opacity to ~0.85 for active fluid transition
      opacity.setValue(0.85);

      // Smooth horizontal travel from current rendered position to destination
      Animated.timing(translateX, {
        toValue: destX,
        duration: 240, // 220–280ms
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || animIdRef.current !== currentAnimId) {
          // Interrupted by a newer tap or superceded
          return;
        }

        // Once arrived at destination, fade out completely to opacity 0
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300, // 250–350ms
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    },
    [getTabDestinationX, opacity, translateX]
  );

  // Synchronize on state index change (e.g. initial mount or external route switch)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const initialPos = getTabDestinationX(state.index);
      translateX.setValue(initialPos);
      currentRenderedX.current = initialPos;
      activeIndexRef.current = state.index;
      opacity.setValue(0);
      return;
    }

    if (state.index !== activeIndexRef.current) {
      animateCapsule(state.index);
    }
  }, [state.index, animateCapsule, getTabDestinationX, opacity, translateX]);

  // When tabs are measured
  const handleTabLayout = (index: number, layout: LayoutRectangle) => {
    tabLayouts.current[index] = layout;
    if (state.index === index && isInitialMount.current) {
      const pos = layout.x + (layout.width - CAPSULE_WIDTH) / 2;
      translateX.setValue(pos);
      currentRenderedX.current = pos;
    }
  };

  const handlePress = (route: any, index: number, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      animateCapsule(index);
      navigation.navigate(route.name, route.params);
    }
  };

  const handleLongPress = (route: any) => {
    navigation.emit({
      type: 'tabLongPress',
      target: route.key,
    });
  };

  const renderIcon = (name: string, isFocused: boolean) => {
    const color = isFocused ? COLORS.gold : '#9CA3AF';
    switch (name) {
      case 'index':
        return <Home color={color} size={24} strokeWidth={isFocused ? 2.3 : 1.8} />;
      case 'upload':
        return <Camera color={color} size={24} strokeWidth={isFocused ? 2.3 : 1.8} />;
      case 'transactions':
        return <List color={color} size={24} strokeWidth={isFocused ? 2.5 : 1.8} />;
      case 'insights':
        return <BarChart2 color={color} size={24} strokeWidth={isFocused ? 2.5 : 1.8} />;
      case 'settings':
        return <Settings color={color} size={24} strokeWidth={isFocused ? 2.3 : 1.8} />;
      default:
        return <Home color={color} size={24} strokeWidth={1.8} />;
    }
  };

  const getTabAccessibilityLabel = (name: string) => {
    switch (name) {
      case 'index':
        return 'Dashboard';
      case 'upload':
        return 'Upload';
      case 'transactions':
        return 'Transactions';
      case 'insights':
        return 'Insights';
      case 'settings':
        return 'Settings';
      default:
        return name;
    }
  };

  // Safe bottom offset considering home indicator (iPhone) vs navigation bar
  const bottomMargin = insets.bottom > 0 ? Math.max(insets.bottom - 10, 8) : 8;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          bottom: bottomMargin,
        },
      ]}
    >
      <View
        style={styles.dock}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (width > 0) {
            setDockWidth(width);
          }
        }}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0F172A' }]} />
        )}

        {/* Single shared animated translucent white capsule */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeCapsule,
            {
              transform: [{ translateX }],
              opacity,
            },
          ]}
        />

        {/* Five evenly distributed tab buttons */}
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const options = descriptors[route.key]?.options || {};

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || getTabAccessibilityLabel(route.name)}
              testID={options.tabBarTestID}
              onLayout={(e) => handleTabLayout(index, e.nativeEvent.layout)}
              onPress={() => handlePress(route, index, isFocused)}
              onLongPress={() => handleLongPress(route)}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                {renderIcon(route.name, isFocused)}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 1000,
    elevation: 16,
  },
  dock: {
    height: DOCK_HEIGHT,
    borderRadius: 32,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(20px)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 16,
      },
    }),
  },
  activeCapsule: {
    position: 'absolute',
    left: 0,
    top: (DOCK_HEIGHT - CAPSULE_HEIGHT) / 2,
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
