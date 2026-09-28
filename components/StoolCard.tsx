/**
 * ホームに置くお通じの1行（DESIGN §15-3）。
 *
 * **消さない。** 「時刻前は隠す」案は捨てた——出たり消えたりする行は
 * 「さっきあったものが無い」になって探させる。代わりに、時刻を過ぎて未記録のときだけ
 * 色を濃くして催促にする。文言は lib/stool.ts の `stoolRow` が決める（3状態を1か所で持つ）。
 *
 * カードにせず**1行**にしているのは、ホームに置けるカードは提案の1枚だけという制約
 * （app/(tabs)/index.tsx の冒頭）を崩さないため。繊維のメーターと競わせない。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from './Icons';
import { stoolRow } from '../lib/stool';
import { colors, hit, radius, space, type } from '../lib/theme';
import type { StoolRecord } from '../lib/types';

export default function StoolCard({
  record,
  reminderAt,
  onPress,
  now,
}: {
  record: StoolRecord | null;
  reminderAt: string | null;
  onPress: () => void;
  /** 「時刻を過ぎたか」の判定に使う現在時刻。画面が復帰したときに新しい値をもらう */
  now?: Date;
}) {
  const row = stoolRow(record, reminderAt, now);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, row.due && styles.due, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.sub ? `${row.title}。${row.sub}` : row.title}
      android_ripple={{ color: colors.tapPressed }}
    >
      <View style={styles.texts}>
        <Text style={[styles.title, row.due && styles.titleDue]}>{row.title}</Text>
        {row.sub ? <Text style={styles.sub}>{row.sub}</Text> : null}
      </View>
      <ChevronRightIcon color={row.due ? colors.accentStrong : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // 催促のときだけ地を変える。色だけに頼らず文言も変わる（lib/stool.ts stoolRow）
  due: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  pressed: { backgroundColor: colors.tapPressed },
  texts: { flex: 1, gap: 2 },
  title: { ...type.bodyStrong },
  titleDue: { color: colors.accentStrong },
  sub: { ...type.tiny },
});
