/**
 * 今日の2軸の内訳（菌のごはん／おそうじ）。
 *
 * **カードにしない。** ホームに置けるカードは1枚（今日の提案）だけなので、
 * 総量メーターの続きとして地の上に直接置く（DESIGN §7）。
 *
 * 2軸の塗りは色相でしか区別できないので、**名前を必ず添える**（色だけで意味を持たせない）。
 * 各バーの下に「キャラのどこに効くか」を1行置く。2軸は言葉だけでは覚えられず、
 * 目の前のキャラと結びついて初めて意味を持つ（DESIGN §5-2）。
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../lib/motion';
import { AXIS, axisName, axisRemainWord, fillRatio, type Axis } from '../lib/format';
import { axisColors, motion, radius, space, type } from '../lib/theme';
import type { Targets, Totals } from '../lib/types';

export type AxisBarsProps = {
  today: Totals;
  targets: Targets;
};

export default function AxisBars({ today, targets }: AxisBarsProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>今日の内訳</Text>
      <AxisRow axis="soluble" value={today.soluble} target={targets.soluble} />
      <AxisRow axis="insoluble" value={today.insoluble} target={targets.insoluble} />
    </View>
  );
}

function AxisRow({ axis, value, target }: { axis: Exclude<Axis, 'total'>; value: number; target: number }) {
  const reduced = useReducedMotion();
  const fill = fillRatio(value, target);
  const scale = useRef(new Animated.Value(fill)).current;
  const { fill: fillColor, track } = axisColors[axis];
  const meta = AXIS[axis];

  useEffect(() => {
    if (reduced) {
      scale.setValue(fill);
      return;
    }
    Animated.timing(scale, {
      toValue: fill,
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fill, reduced, scale]);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      // 読み上げでは専門語より先に「何をする繊維か」を言う（音だけでは括弧が伝わらない）
      accessibilityLabel={`${meta.name}、${meta.term}食物繊維。${meta.note}。${axisRemainWord(value, target)}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }}
    >
      <View style={styles.labels}>
        <Text style={[styles.name, { color: fillColor }]} maxFontSizeMultiplier={1.6}>
          {axisName(axis)}
        </Text>
        <Text style={styles.remain} maxFontSizeMultiplier={1.6}>
          {axisRemainWord(value, target)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <Animated.View
          style={[styles.bar, { backgroundColor: fillColor, transform: [{ scaleX: scale }] }]}
          needsOffscreenAlphaCompositing
        />
      </View>
      <Text style={styles.look}>{meta.look}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  heading: { ...type.label },
  row: { gap: space.xs },
  // 名前と残りを両端に置く。長い名前でも折り返せるよう flex を持たせる
  labels: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  name: { ...type.small, fontWeight: '700', flexShrink: 1 },
  remain: { ...type.small, fontWeight: '600' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%', width: '100%', borderRadius: radius.pill, transformOrigin: 'left' },
  look: { ...type.tiny },
});
