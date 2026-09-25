/**
 * 今日の提案カード（DESIGN §5-3）。
 * 提案 → なぜ（必ず1行） → 根拠バッジ の3行構成。**1日1つしか置かない。**
 *
 * 押せるカードのときだけ右端に矢印を出す（押せるのか分からないカードを作らない）。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from './Icons';
import type { CoachSuggestion } from '../lib/coach';
import { colors, elevation, radius, space, type } from '../lib/theme';

export default function CoachCard({
  suggestion,
  onPress,
}: {
  suggestion: CoachSuggestion;
  onPress?: () => void;
}) {
  const { item, evidence } = suggestion;
  const body = (pressed: boolean) => (
    <View style={[styles.card, pressed && styles.pressed]}>
      <Text style={styles.eyebrow}>今日の提案</Text>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.reason}>{item.reason}</Text>
      <View style={styles.footer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{evidence}</Text>
        </View>
        {onPress ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>くわしく</Text>
            <ChevronRightIcon color={colors.accentStrong} />
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.message} ${item.reason} 根拠は${evidence}`}
      accessibilityHint="この食品のくわしい話を開きます"
      android_ripple={{ color: colors.tapPressed }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
    ...elevation.card,
  },
  pressed: { backgroundColor: colors.tap },
  eyebrow: { ...type.tiny, color: colors.accentStrong, fontWeight: '700' },
  message: { ...type.body, fontSize: 17, lineHeight: 26, fontWeight: '700' },
  reason: { ...type.small },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  badge: {
    backgroundColor: colors.badge,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  badgeText: { ...type.tiny, color: colors.text },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { ...type.tiny, color: colors.accentStrong, fontWeight: '700' },
});
