/**
 * ＋−で数を決める部品。食品の量（既定 0.5刻み・1食を半分か倍で数える人が多い）と、
 * お通じの回数（1刻み・0から）で**同じものを使う**（刻みと範囲だけ props で受ける）。
 *
 * g入力は出さない。「キャベツ何g？」に答えられる人はいないので、
 * **常用量の何個分か**だけを選ばせ、g数は結果として表示する（DESIGN §7）。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COUNT_MAX, COUNT_MIN, COUNT_STEP, formatCount, stepBy } from '../lib/format';
import { colors, hit, radius, space, type } from '../lib/theme';

export default function QuantityStepper({
  count,
  unitLabel,
  onChange,
  step = COUNT_STEP,
  min = COUNT_MIN,
  max = COUNT_MAX,
  noun = '量',
  describe,
}: {
  count: number;
  /** 「1杯」「1パック」など。単位そのものは変えない */
  unitLabel: string;
  onChange: (next: number) => void;
  /**
   * 刻みと範囲。食品の量は 0.5刻み、お通じの回数は 1刻みで 0 から。
   * **部品を2つ作らない**ためにここで受ける（押し心地と読み上げを1か所に保つ）
   */
  step?: number;
  min?: number;
  max?: number;
  /** 読み上げの主語。「量を減らす」/「回数を減らす」 */
  noun?: string;
  /** 読み上げる値の言い方。既定は「1杯 の 2個分」 */
  describe?: (count: number) => string;
}) {
  const dec = () => onChange(stepBy(count, -1, { step, min, max }));
  const inc = () => onChange(stepBy(count, 1, { step, min, max }));
  const readout = describe ? describe(count) : `${unitLabel} の ${formatCount(count)}個分`;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={dec}
        disabled={count <= min}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, count <= min && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`${noun}を減らす`}
        accessibilityState={{ disabled: count <= min }}
        hitSlop={8}
      >
        <View style={styles.minus} />
      </Pressable>

      <View style={styles.readout} accessible accessibilityLabel={readout}>
        <Text style={styles.count} maxFontSizeMultiplier={1.4}>
          {formatCount(count)}
        </Text>
        <Text style={styles.unit}>{unitLabel}</Text>
      </View>

      <Pressable
        onPress={inc}
        disabled={count >= max}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, count >= max && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`${noun}を増やす`}
        accessibilityState={{ disabled: count >= max }}
        hitSlop={8}
      >
        <View style={styles.minus} />
        <View style={styles.plusBar} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  button: {
    width: hit.min,
    height: hit.min,
    borderRadius: radius.pill,
    backgroundColor: colors.tap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.tapPressed },
  // 押せないボタンは見た目でも分かるようにする（押せそうなのに反応しない状態を作らない）
  disabled: { opacity: 0.35 },
  // 「−」と「＋」は線で描く（絵文字やフォント記号に頼らない）
  minus: { width: 18, height: 2.2, borderRadius: 2, backgroundColor: colors.text },
  plusBar: { position: 'absolute', width: 2.2, height: 18, borderRadius: 2, backgroundColor: colors.text },
  readout: { alignItems: 'center', minWidth: 96 },
  count: { ...type.display, fontSize: 30, lineHeight: 36 },
  unit: { ...type.small },
});
