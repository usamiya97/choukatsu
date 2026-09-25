/**
 * プリセット1品の行。押す場所で2つに分かれている。
 *
 *  - 行の本体 → **量を選ぶシートを開く**（半分だった／2杯だった、を記録できる）
 *  - 右端の「＋」 → **1個分をそのまま記録**（1タップの軽さを壊さないための近道）
 *
 * 長押しの隠し機能は置かない。詳細はシートの中のリンクから開く。
 * 押した感触は背景色だけで返す（位置やサイズを変えるとリストが揺れる）。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlusIcon } from './Icons';
import type { Serving } from '../lib/types';
import { colors, hit, radius, space, type } from '../lib/theme';

export default function ServingChip({
  serving,
  onQuickAdd,
  onOpenAmount,
}: {
  serving: Serving;
  /** 1個分をそのまま記録する */
  onQuickAdd: () => void;
  /** 量を選ぶシートを開く */
  onOpenAmount: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpenAmount}
        accessibilityRole="button"
        accessibilityLabel={`${serving.displayName}。${amountWord(serving)}。量を選んで記録する`}
        android_ripple={{ color: colors.tapPressed }}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Text style={styles.name} numberOfLines={1}>
          {serving.displayName} <Text style={styles.unit}>{serving.unitLabel}</Text>
        </Text>
        <Text style={styles.amount}>{amountWord(serving)}</Text>
      </Pressable>

      <Pressable
        onPress={onQuickAdd}
        accessibilityRole="button"
        accessibilityLabel={`${serving.displayName} ${serving.unitLabel}を1つ記録する`}
        android_ripple={{ color: colors.tapPressed, borderless: true }}
        style={({ pressed }) => [styles.quick, pressed && styles.quickPressed]}
      >
        <PlusIcon />
      </Pressable>
    </View>
  );
}

/** 0g食品は「見つかりません」ではなく 0g と答える（tier Z・肉魚卵乳） */
function amountWord(s: Serving): string {
  if (s.total <= 0) return '食物繊維は 0g';
  return `約 ${s.total.toFixed(1)}g`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.tap,
  },
  main: {
    flex: 1,
    minHeight: hit.min,
    justifyContent: 'center',
    gap: 2,
    paddingLeft: space.lg,
    paddingRight: space.md,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.tapPressed },
  name: { ...type.bodyStrong },
  unit: { ...type.small, fontWeight: '400' },
  amount: { ...type.small },
  // 「＋」も48pt確保する。小さいアイコンだけの的にしない
  quick: {
    width: hit.min + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.card,
  },
  quickPressed: { backgroundColor: colors.tapPressed },
});
