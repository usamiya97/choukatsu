/**
 * 量を選んで記録するシート。
 *
 * 置いた理由: プリセットは「1杯」「1パック」固定で記録していたので、
 * 半分しか食べていない日も2杯食べた日も同じ数字になっていた。メーターが嘘をつく。
 *
 * 1タップの軽さは壊さない。行の「＋」は今も1個分をそのまま記録する。
 * このシートは**量を変えたいときだけ開く**（DESIGN §7 の入力3段階を崩さない）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QuantityStepper from './QuantityStepper';
import { TrashIcon } from './Icons';
import { fiberOf, gramsOf } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import { colors, elevation, hit, motion, radius, space, type } from '../lib/theme';
import type { Serving } from '../lib/types';

export type QuantitySheetProps = {
  serving: Serving | null;
  /** add = これから記録する / edit = すでに記録した量を直す */
  mode?: 'add' | 'edit';
  initialCount?: number;
  onClose: () => void;
  onSubmit: (count: number) => void;
  /** edit のときだけ。記録を消す */
  onDelete?: () => void;
  /** 食品の詳細へ */
  onDetail?: () => void;
  /** 下の安全領域 */
  bottomInset?: number;
};

export default function QuantitySheet({
  serving,
  mode = 'add',
  initialCount = 1,
  onClose,
  onSubmit,
  onDelete,
  onDetail,
  bottomInset = 0,
}: QuantitySheetProps) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(initialCount);
  const slide = useRef(new Animated.Value(1)).current;

  // 開くたびに量を初期値へ戻す（前に選んだ2杯が次の食品に引き継がれると事故になる）
  useEffect(() => {
    if (serving) setCount(initialCount);
  }, [serving, initialCount]);

  useEffect(() => {
    if (!serving) return;
    if (reduced) {
      slide.setValue(0);
      return;
    }
    slide.setValue(1);
    Animated.timing(slide, {
      toValue: 0,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [serving, reduced, slide]);

  if (!serving) return null;

  const fiber = fiberOf(serving, count);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* 背面を暗くして前面を切り離す。外側を押したら閉じる */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="閉じる"
      />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: bottomInset + space.xl },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }] },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.grip} />

        <Text style={styles.name} accessibilityRole="header">
          {serving.displayName}
        </Text>
        <Text style={styles.sub}>
          {serving.unitLabel} は {serving.servingG}g
        </Text>

        <QuantityStepper count={count} unitLabel={serving.unitLabel} onChange={setCount} />

        <View style={styles.result}>
          <Text style={styles.resultAmount} maxFontSizeMultiplier={1.4}>
            {gramsOf(serving, count)}g
          </Text>
          <Text style={styles.resultFiber}>
            {serving.total > 0 ? `食物繊維 約 ${fiber.toFixed(1)}g` : '食物繊維は 0g'}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => onSubmit(count)}
          accessibilityRole="button"
          accessibilityLabel={mode === 'add' ? 'この量で記録する' : 'この量に変更する'}
        >
          <Text style={styles.ctaText}>{mode === 'add' ? 'この量で記録する' : 'この量に変更する'}</Text>
        </Pressable>

        <View style={styles.links}>
          {onDetail ? (
            <Pressable
              onPress={onDetail}
              hitSlop={12}
              style={styles.link}
              accessibilityRole="button"
              accessibilityLabel={`${serving.displayName} のくわしい話を見る`}
            >
              <Text style={styles.linkText}>くわしい話を見る</Text>
            </Pressable>
          ) : (
            <View style={styles.link} />
          )}
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              hitSlop={12}
              style={styles.deleteLink}
              accessibilityRole="button"
              accessibilityLabel="この記録を消す"
            >
              <TrashIcon color={colors.danger} />
              <Text style={styles.deleteText}>記録を消す</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 50%の暗さ。これより薄いと背面の文字と競合して前面が読みにくくなる
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,42,40,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    gap: space.lg,
    ...elevation.raised,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.xs,
  },
  name: { ...type.title, textAlign: 'center' },
  sub: { ...type.small, textAlign: 'center', marginTop: -space.md },
  result: { alignItems: 'center', gap: 2 },
  resultAmount: { ...type.title, fontSize: 22 },
  resultFiber: { ...type.small },
  cta: {
    minHeight: hit.min + 4,
    backgroundColor: colors.accentStrong,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { backgroundColor: '#18604B' },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: 40, justifyContent: 'center' },
  linkText: { ...type.small, color: colors.accentStrong, fontWeight: '700' },
  deleteLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  deleteText: { ...type.small, color: colors.danger, fontWeight: '700' },
});
