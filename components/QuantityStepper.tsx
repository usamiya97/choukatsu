/**
 * 量の増減。0.5刻み（1食を半分か倍で数える人が多い）。
 *
 * g入力は出さない。「キャベツ何g？」に答えられる人はいないので、
 * **常用量の何個分か**だけを選ばせ、g数は結果として表示する（DESIGN §7）。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COUNT_MAX, COUNT_MIN, formatCount, stepCount } from '../lib/format';
import { colors, hit, radius, space, type } from '../lib/theme';

export default function QuantityStepper({
  count,
  unitLabel,
  onChange,
}: {
  count: number;
  /** 「1杯」「1パック」など。単位そのものは変えない */
  unitLabel: string;
  onChange: (next: number) => void;
}) {
  const dec = () => onChange(stepCount(count, -1));
  const inc = () => onChange(stepCount(count, 1));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={dec}
        disabled={count <= COUNT_MIN}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, count <= COUNT_MIN && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="量を減らす"
        accessibilityState={{ disabled: count <= COUNT_MIN }}
        hitSlop={8}
      >
        <View style={styles.minus} />
      </Pressable>

      <View style={styles.readout} accessible accessibilityLabel={`${unitLabel} の ${formatCount(count)}個分`}>
        <Text style={styles.count} maxFontSizeMultiplier={1.4}>
          {formatCount(count)}
        </Text>
        <Text style={styles.unit}>{unitLabel}</Text>
      </View>

      <Pressable
        onPress={inc}
        disabled={count >= COUNT_MAX}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, count >= COUNT_MAX && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="量を増やす"
        accessibilityState={{ disabled: count >= COUNT_MAX }}
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
