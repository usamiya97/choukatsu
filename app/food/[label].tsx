/**
 * 食品詳細（DESIGN §7）。数値の根拠をここだけで開示する。
 *
 * ルートのキーは code ではなく label。
 * 同じ食品番号が複数のプリセットに対応する（01088 = ごはん 小盛/普通/大盛 の3件）ため、
 * code ではプリセットを一意に指せない。
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QuantityStepper from '../../components/QuantityStepper';
import Toast from '../../components/Toast';
import { ChevronRightIcon, PlusIcon } from '../../components/Icons';
import { CAUTIONS, SWAPS, findServing, labelsForName } from '../../lib/dataset';
import { ATTRIBUTION, axisName, formatCount, gramsOf } from '../../lib/format';
import { haptics } from '../../lib/motion';
import { useStore } from '../../lib/store';
import { axisColors, colors, elevation, hit, radius, space, type } from '../../lib/theme';

export default function FoodDetail() {
  const { label } = useLocalSearchParams<{ label: string }>();
  const { addEntry } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);
  // この画面でも量を選べるようにする（1杯だけ、が前提の画面にしない）
  const [count, setCount] = useState(1);

  // コーチの target_food は表示名で書かれていることがあるので label に寄せる
  const serving = findServing(label ?? '') ?? findServing(labelsForName(label ?? '')[0] ?? '');
  if (!serving) {
    return (
      <View style={styles.center}>
        <Text style={type.body}>この食品は見つかりませんでした</Text>
      </View>
    );
  }

  const caution = CAUTIONS.find((c) => c.label === serving.label);
  // 置き換え候補は同じ分析法の食品だけに絞る（method が違うと1.4〜5倍の差が出て比較にならない）
  const swaps = SWAPS.filter((s) => s.before === serving.label && s.purpose !== '推奨しない').filter((s) => {
    const after = findServing(s.after);
    return after ? after.method === serving.method || serving.method === 'both' || after.method === 'both' : false;
  });

  const record = () => {
    addEntry(serving.label, count);
    haptics.record();
    setToast(`${serving.displayName} を記録しました（約 ${(serving.total * count).toFixed(1)}g）`);
    // トーストを一瞬見せてから戻る（記録できたか分からないまま画面が消えるのを防ぐ）
    setTimeout(() => router.back(), 700);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
      >
        <View style={styles.head}>
          <Text style={styles.name} accessibilityRole="header">
            {serving.displayName}
          </Text>
          <Text style={styles.unit}>
            {serving.unitLabel}（{serving.servingG}g）で 食物繊維 約 {serving.total.toFixed(1)}g
          </Text>
          {serving.total <= 0 ? <Text style={styles.small}>この食品の食物繊維は 0g です</Text> : null}
          {serving.total > 0 ? (
            <View style={styles.breakdown}>
              {/* 2軸の内訳。どの食品がどちらに効くかは、具体例で覚えるしかない */}
              <Text style={[styles.breakdownRow, { color: axisColors.soluble.fill }]}>
                {axisName('soluble')} 約 {serving.soluble.toFixed(1)}g
              </Text>
              <Text style={[styles.breakdownRow, { color: axisColors.insoluble.fill }]}>
                {axisName('insoluble')} 約 {serving.insoluble.toFixed(1)}g
              </Text>
            </View>
          ) : null}
          {serving.solubleRatio >= 0.4 && serving.total > 0 ? (
            <Text style={styles.small}>{axisName('soluble', false)}の割合が高めの食品です</Text>
          ) : null}
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.cardTitle}>食べた量</Text>
          <QuantityStepper count={count} unitLabel={serving.unitLabel} onChange={setCount} />
          <Text style={styles.amountResult}>
            {gramsOf(serving, count)}g
            {serving.total > 0 ? ` / 食物繊維 約 ${(serving.total * count).toFixed(1)}g` : ' / 食物繊維は 0g'}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={record}
          accessibilityRole="button"
          accessibilityLabel={`${serving.displayName} ${serving.unitLabel}を ${formatCount(count)}個分 記録する`}
          android_ripple={{ color: colors.accent }}
        >
          <PlusIcon color="#FFFFFF" size={20} />
          <Text style={styles.ctaText}>これを記録する</Text>
        </Pressable>

        {caution ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>よく言われること</Text>
            <Text style={styles.body}>{caution.commonBelief}</Text>
            <Text style={styles.cardTitle}>データを見ると</Text>
            <Text style={styles.body}>{caution.dataSays}</Text>
            <Text style={styles.small}>{caution.reason}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>成分表より</Text>
            </View>
          </View>
        ) : null}

        {swaps.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>これに変えると増えます</Text>
            {swaps.map((s) => (
              <Pressable
                key={s.after}
                style={({ pressed }) => [styles.swapRow, pressed && styles.swapPressed]}
                onPress={() => router.push(`/food/${encodeURIComponent(s.after)}`)}
                accessibilityRole="button"
                accessibilityLabel={`${s.afterDisplay} ${s.afterUnit}。約 ${s.deltaTotal.toFixed(1)}g 増えます。くわしい話を開く`}
              >
                <Text style={styles.body}>
                  {s.afterDisplay} {s.afterUnit}
                </Text>
                <View style={styles.swapRight}>
                  <Text style={styles.small}>約 +{s.deltaTotal.toFixed(1)}g</Text>
                  <ChevronRightIcon />
                </View>
              </Pressable>
            ))}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>成分表より</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>数値の出どころ</Text>
          <Text style={styles.small}>
            {serving.officialName}（食品番号 {serving.code}）/ 100gあたり {serving.fiberPer100g.toFixed(1)}g
          </Text>
          <Text style={styles.small}>分析法: {methodWord(serving.method)}</Text>
          <Text style={styles.small}>{ATTRIBUTION}</Text>
        </View>
      </ScrollView>
      <Toast message={toast} bottom={insets.bottom + space.lg} />
    </View>
  );
}

function methodWord(method: string): string {
  switch (method) {
    case 'prosky':
      return 'プロスキー変法';
    case 'aoac2011.25':
      return 'AOAC2011.25法';
    case 'both':
      return 'プロスキー変法とAOAC2011.25法の両方';
    default:
      return method;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  head: { gap: space.xs },
  name: { ...type.title, fontSize: 24 },
  unit: { ...type.body },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    ...elevation.card,
  },
  cardTitle: { ...type.label },
  amountBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    alignItems: 'center',
  },
  amountResult: { ...type.small },
  body: { ...type.body },
  small: { ...type.small },
  breakdown: { gap: space.xs, marginTop: space.xs },
  breakdownRow: { ...type.small, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badge,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  badgeText: { ...type.tiny, color: colors.text },
  swapRow: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  swapPressed: { opacity: 0.7 },
  swapRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  cta: {
    minHeight: hit.min + 4,
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.accentStrong,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  ctaPressed: { backgroundColor: colors.accentPressed },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
