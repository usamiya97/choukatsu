/**
 * 図鑑（DESIGN §3）。**減らない軸**だけを置く画面。
 * 段階(質)は上限5で止まるが、ここはプリセット全品目ぶん伸び続ける＝終わりを作らないための装置。
 *
 * 進捗は数字とバーの両方で出す（色だけで意味を伝えない）。
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERVINGS, categories, findServing } from '../../lib/dataset';
import { useStore } from '../../lib/store';
import { uniqueLabels } from '../../lib/state';
import { colors, elevation, radius, space, type } from '../../lib/theme';

export default function DexScreen() {
  const { logs, gut } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const found = useMemo(() => uniqueLabels(logs), [logs]);

  const byCategory = useMemo(
    () =>
      categories().map((c) => {
        const all = SERVINGS.filter((s) => s.category === c);
        return { category: c, total: all.length, found: all.filter((s) => found.has(s.label)).length };
      }),
    [found]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
    >
      <View style={styles.head}>
        <Text style={styles.count} maxFontSizeMultiplier={1.4}>
          {gut.flora}
          <Text style={styles.countSub}> / {SERVINGS.length} 種類</Text>
        </Text>
        <Text style={styles.lead}>記録した食べものの数です。ここは減りません。</Text>
        <View style={styles.dots} accessible accessibilityLabel={`まわりの菌 ${gut.floraDots}個`}>
          {Array.from({ length: gut.floraDots }).map((_, i) => (
            <View key={i} style={styles.dot} />
          ))}
          {gut.floraDots === 0 ? (
            <Text style={styles.small}>4種類 記録すると、まわりに菌が増えます</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          カテゴリ
        </Text>
        {byCategory.map((c) => (
          <View
            key={c.category}
            style={styles.catRow}
            accessible
            accessibilityLabel={`${c.category} ${c.total}種類のうち ${c.found}種類`}
          >
            <Text style={styles.catName}>{c.category}</Text>
            <View style={styles.catTrack}>
              <View style={[styles.catFill, { width: `${(c.found / c.total) * 100}%` }]} />
            </View>
            <Text style={styles.catCount}>
              {c.found}/{c.total}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          見つけた食べもの
        </Text>
        {found.size === 0 ? (
          <Text style={styles.small}>記録するとここに増えていきます</Text>
        ) : (
          <View style={styles.chips}>
            {[...found].map((label) => {
              const s = findServing(label);
              if (!s) return null;
              return (
                <Pressable
                  key={label}
                  onPress={() => router.push(`/food/${encodeURIComponent(label)}`)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.displayName} のくわしい話を開く`}
                >
                  <Text style={styles.chipText}>{s.displayName}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xl },
  head: { gap: space.sm },
  count: { ...type.display },
  countSub: { ...type.small },
  lead: { ...type.small },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  section: { gap: space.sm },
  sectionTitle: { ...type.label },
  catRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.md },
  catName: { ...type.small, color: colors.text, width: 56 },
  catTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  catFill: { height: '100%', backgroundColor: colors.accentStrong, borderRadius: radius.pill },
  catCount: { ...type.tiny, width: 48, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    ...elevation.card,
  },
  chipPressed: { backgroundColor: colors.tapPressed },
  chipText: { ...type.small, color: colors.text },
  small: { ...type.small },
});
