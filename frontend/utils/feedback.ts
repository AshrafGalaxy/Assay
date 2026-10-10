import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Triggers a single gentle success haptic feedback.
 * Uses expo-haptics notification feedback with impact feedback fallback.
 */
export async function triggerSuccessHaptic(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(40);
        } catch {}
      }
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Graceful fallback for devices without haptics
    }
  }
}

/**
 * Plays a brief, pleasant confirmation chime.
 * - On Web: Uses Web Audio API oscillator synthesis (zero latency, zero download).
 * - On Native: Uses expo-audio with the bundled success.wav asset, gracefully catching any error.
 */
export async function playSuccessSound(): Promise<void> {
  // Web Audio playback
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Dual-harmonic chime: C5 (523.25Hz) blending into E5 (659.25Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, now);
        osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08);

        // Soft volume envelope with smooth exponential decay (350ms duration)
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);

        setTimeout(() => {
          ctx.close().catch(() => {});
        }, 500);
        return;
      }
    } catch {}
  }

  // Native playback via expo-audio
  try {
    const { createAudioPlayer } = require('expo-audio');
    if (createAudioPlayer) {
      const player = createAudioPlayer(require('../assets/sounds/success.wav'));
      player.play();
    }
  } catch {
    // Non-blocking: Audio playback errors never interrupt UI or financial flow
  }
}

/**
 * Convenience method to fire both pleasant haptic and sound feedback simultaneously
 * strictly after confirmed transaction persistence.
 */
export async function triggerTransactionSuccessFeedback(): Promise<void> {
  await Promise.allSettled([
    triggerSuccessHaptic(),
    playSuccessSound(),
  ]);
}
