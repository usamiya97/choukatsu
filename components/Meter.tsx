/**
 * 今日のメーター。**小数点を出さない**（DESIGN §6-1）。
 * 数値そのものではなく「8割くらい」「あと納豆1パック分」で伝える。
 *
 * 伸びるアニメーションは width ではなく scaleX で行う（width はレイアウトを毎フレーム
 * 再計算させるため）。読み上げには progressbar として割合を渡す。
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../lib/motion';
import { colors, motion, radius, space, type } from '../lib/theme';

export type MeterProps = {
  /** 0..1。超過は1で止める */
  fill: number;
  /** 「今日は 18g目標の 8割くらい」 */
  headline: string;
  /** 「あと 納豆 1パック分」。達成時は null */
  hint?: string | null;
  /** 診断の推定値で暫定表示している間の注記 */
  note?: string | null;
  /**
   * バーの途中に置く目印。目標を公的な目安より高く設定したときに使う。
   * 目標だけを見せると「毎日届かない」になるので、**手前に越えられる線を1本置く**。
   */
  marker?: { ratio: number; label: string; passed: boolean } | null;
};

export default function Meter({ fill, headline, hint, note, marker }: MeterProps) {
  const reduced = useReducedMotion();
  const width = useRef(new Animated.Value(fill)).current;

  useEffect(() => {
    if (reduced) {
      width.setValue(fill);
      return;
    }
    Animated.timing(width, {
      toValue: fill,
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fill, reduced, width]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={1.6}>
        {headline}
      </Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="今日の食物繊維"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }}
      >
        <Animated.View
          style={[styles.fill, { transform: [{ scaleX: width }] }]}
          // 0幅のときに丸みが潰れて見えるのを防ぐ
          needsOffscreenAlphaCompositing
        />
        {marker ? (
          <View
            style={[styles.marker, { left: `${Math.round(marker.ratio * 100)}%` }]}
            pointerEvents="none"
          />
        ) : null}
      </View>
      {marker ? (
        <Text style={[styles.markerLabel, marker.passed && styles.markerPassed]}>
          {marker.passed ? `${marker.label}は超えました` : `${marker.label}の目印`}
        </Text>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  headline: { ...type.headline, textAlign: 'center' },
  track: {
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accentStrong,
    // scaleX の原点を左端にする（既定は中央なので両側から伸びてしまう）
    transformOrigin: 'left',
  },
  // 目印は白い縦線。塗りの上でも地の上でも見える
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.card },
  markerLabel: { ...type.tiny, textAlign: 'center' },
  markerPassed: { color: colors.accentStrong, fontWeight: '700' },
  hint: { ...type.small, textAlign: 'center' },
  note: { ...type.tiny, textAlign: 'center' },
});
