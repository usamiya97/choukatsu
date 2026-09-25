/**
 * 記録画面（DESIGN §7・入力3段階）。
 * よく食べるもの → カテゴリ → 入力して探す。
 * g入力は置かない。常用量のタップと量の選択だけで完結させる（プリセットだけで3指標に到達できることは検算済み）。
 *
 * 記録した結果は**重ねたトースト**で返す（行を挿入すると、次に押そうとした品目が下にずれる）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ServingChip from '../../components/ServingChip';
import QuantitySheet from '../../components/QuantitySheet';
import Toast from '../../components/Toast';
import { CloseIcon } from '../../components/Icons';
import { TARGETS, categories, searchFoods, searchServings, servingsOf } from '../../lib/dataset';
import { fillRatio, formatCount, progressWord } from '../../lib/format';
import { haptics } from '../../lib/motion';
import { useStore } from '../../lib/store';
import { colors, hit, radius, space, type } from '../../lib/theme';
import type { Serving } from '../../lib/types';

export default function LogScreen() {
  const { gut, frequent, addEntry, todayEntries } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openCategory, setOpenCategory] = useState<string>('主食');
  const [toast, setToast] = useState<string | null>(null);
  // 量を選ぶシート。開いている食品を持つ（null なら閉じている）
  const [amountFor, setAmountFor] = useState<Serving | null>(null);

  const cats = useMemo(() => categories(), []);
  const hits = useMemo(() => searchServings(query), [query]);
  // プリセットに無いときだけ成分表フル（2,393件）を引く。記録には足せないので参考値として出す
  const dbHits = useMemo(
    () => (query.trim().length >= 2 && hits.length === 0 ? searchFoods(query, 8) : []),
    [query, hits]
  );

  /** 量を指定して記録する。count=1 は行の「＋」からの近道 */
  const add = (s: Serving, count = 1) => {
    addEntry(s.label, count);
    haptics.record();
    const amount = count === 1 ? '' : ` ${formatCount(count)}${s.unitLabel}分`;
    setToast(`${s.displayName}${amount} を記録しました（約 ${(s.total * count).toFixed(1)}g）`);
  };

  // トーストは数秒で消す。残り続けると次のタップの邪魔になる
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const openDetail = (s: Serving) => router.push(`/food/${encodeURIComponent(s.label)}`);

  const chip = (s: Serving) => (
    <ServingChip
      key={s.label}
      serving={s}
      onQuickAdd={() => add(s)}
      onOpenAmount={() => setAmountFor(s)}
    />
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{progressWord(gut.today.total, TARGETS.total)}</Text>
          <View
            style={styles.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="今日の食物繊維"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(fillRatio(gut.today.total, TARGETS.total) * 100),
            }}
          >
            <View
              style={[styles.fill, { width: `${Math.round(fillRatio(gut.today.total, TARGETS.total) * 100)}%` }]}
            />
          </View>
          <Text style={styles.summarySub}>今日 {todayEntries.length}件 記録しました</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="入力して探す（例：ごぼう）"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="食べものを名前で探す"
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={12}
              style={styles.clear}
              accessibilityRole="button"
              accessibilityLabel="入力を消す"
            >
              <CloseIcon />
            </Pressable>
          ) : null}
        </View>

        {query.trim() ? (
          <Section title={`「${query.trim()}」の候補`}>
            {hits.length ? (
              hits.map(chip)
            ) : dbHits.length ? (
              <>
                <Text style={styles.note}>
                  プリセットには無い食品です。100gあたりの参考値だけ出します（記録にはまだ足せません）
                </Text>
                {dbHits.map((f) => (
                  <View key={f.code} style={styles.dbRow}>
                    <Text style={styles.dbName}>{f.name}</Text>
                    <Text style={styles.dbAmount}>100gで約 {f.total.toFixed(1)}g</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.note}>見つかりませんでした。カテゴリからも探せます</Text>
            )}
          </Section>
        ) : null}

        {frequent.length ? (
          <Section title="よく食べるもの">
            {frequent.map(chip)}
          </Section>
        ) : null}

        <Section title="カテゴリから選ぶ">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
            // 横スクロールはこの行の中だけ。画面本体は横に動かさない
          >
            {cats.map((c) => {
              const on = c === openCategory;
              return (
                <Pressable
                  key={c}
                  onPress={() => setOpenCategory(c)}
                  style={[styles.tab, on && styles.tabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c}のプリセットを表示`}
                >
                  <Text style={[styles.tabText, on && styles.tabTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {servingsOf(openCategory).map(chip)}
        </Section>

        <Text style={styles.footNote}>
          「＋」で1つ記録。名前を押すと量を選べます
        </Text>
      </ScrollView>

      <QuantitySheet
        serving={amountFor}
        bottomInset={insets.bottom}
        onClose={() => setAmountFor(null)}
        onSubmit={(count) => {
          if (amountFor) add(amountFor, count);
          setAmountFor(null);
        }}
        onDetail={() => {
          const s = amountFor;
          setAmountFor(null);
          if (s) openDetail(s);
        }}
      />
      <Toast message={toast} bottom={insets.bottom + space.lg} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xl },
  summary: { gap: space.sm },
  summaryText: { ...type.bodyStrong },
  summarySub: { ...type.small },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accentStrong, borderRadius: radius.pill },
  searchRow: { position: 'relative', justifyContent: 'center' },
  search: {
    minHeight: hit.min,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingRight: space.huge,
    paddingVertical: space.md,
    fontSize: 16,
    color: colors.text,
  },
  clear: { position: 'absolute', right: space.md, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  section: { gap: space.sm },
  sectionTitle: { ...type.label },
  sectionBody: { gap: space.sm },
  tabs: { gap: space.sm, paddingVertical: 2, paddingRight: space.lg },
  tab: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.tap,
  },
  tabActive: { backgroundColor: colors.accentStrong },
  tabText: { ...type.small, color: colors.text },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  note: { ...type.small },
  dbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dbName: { ...type.small, flex: 1, color: colors.text },
  dbAmount: { ...type.small },
  footNote: { ...type.tiny },
});
