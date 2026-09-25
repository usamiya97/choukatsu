/**
 * 記録したときの短い確認。
 *
 * 画面の流れに差し込むのではなく**重ねて出す**。文字を挿入するとその下の
 * 全部が動いて、次にタップしようとしていたボタンが逃げる（pro-rules: Stable Interaction States）。
 * 読み上げには live region として渡すので、見えなくても結果が伝わる。
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../lib/motion';
import { colors, motion, radius, space, type, z } from '../lib/theme';

export default function Toast({ message, bottom = space.xl }: { message: string | null; bottom?: number }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const show = Boolean(message);
    if (reduced) {
      opacity.setValue(show ? 1 : 0);
      shift.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: show ? 1 : 0,
        // 消えるほうを速くする（出るときより短いと、邪魔になりにくい）
        duration: show ? motion.base : motion.fast,
        easing: show ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: show ? 0 : 8,
        duration: motion.base,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [message, reduced, opacity, shift]);

  return (
    <View style={[styles.holder, { bottom }]} pointerEvents="none">
      <Animated.View style={[styles.pill, { opacity, transform: [{ translateY: shift }] }]}>
        <Text style={styles.text} accessibilityLiveRegion="polite">
          {message ?? ''}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: z.toast,
  },
  pill: {
    backgroundColor: colors.scrim,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    maxWidth: '90%',
  },
  text: { ...type.small, color: '#FFFFFF', fontWeight: '600' },
});
