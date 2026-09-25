/**
 * ホーム（最重要画面・DESIGN §7）。
 * 上から: キャラ → 今日のメーター → 今日の提案1つ → 記録するボタン → 今日の記録。
 * ここに置けるカードは1枚だけ。増やすと「情報が多すぎる」に戻る。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GutCharacterLive from '../../components/GutCharacterLive';
import Meter from '../../components/Meter';
import CoachCard from '../../components/CoachCard';
import QuantitySheet from '../../components/QuantitySheet';
import Toast from '../../components/Toast';
import { ChevronRightIcon, PlusIcon } from '../../components/Icons';
import { CAUTIONS, SERVINGS, TARGETS, findServing } from '../../lib/dataset';
import { fillRatio, formatCount, progressWord, remainHint, servingLabel } from '../../lib/format';
import { haptics } from '../../lib/motion';
import { useStore } from '../../lib/store';
import type { LogEntry } from '../../lib/types';
import { colors, elevation, hit, radius, space, type } from '../../lib/theme';

/** 段階ごとの読み上げ文。見た目を言葉でも説明する（画像に相当するため必須） */
const STAGE_LOOK = {
  1: '丸まって眠っています',
  2: '目を開けて、色が少しついてきました',
  3: '起き上がって、ふっくらしています',
  4: '色つやが出て、元気そうです',
  5: 'ぴかぴかで、まわりに菌が舞っています',
} as const;

export default function HomeScreen() {
  const { gut, coach, profile, todayEntries, removeEntry, updateEntryCount } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);
  // 今日の記録を押したときに開く、量の直しシート
  const [editing, setEditing] = useState<LogEntry | null>(null);

  const remaining = TARGETS.total - gut.today.total;
  const hint = remainHint(remaining, SERVINGS, {
    cautions: CAUTIONS,
    excluded: profile.excludedFoods,
  });

  // 目標に届いた瞬間だけ、その日1回だけ触覚で返す（毎回震わせない）
  const achievedDay = useRef<string | null>(null);
  const achieved = gut.today.total >= TARGETS.total;
  useEffect(() => {
    if (!achieved) return;
    const key = new Date().toDateString();
    if (achievedDay.current === key) return;
    achievedDay.current = key;
    haptics.achieved();
  }, [achieved]);

  const editingServing = editing ? findServing(editing.label) ?? null : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.huge },
        ]}
      >
        <View style={styles.character}>
          <GutCharacterLive
            stage={gut.stage}
            floraCount={gut.flora}
            size={220}
            // 記録が増えるたびに1回だけ弾む（記録タブから戻ってきたときの返事）
            reactKey={gut.flora * 100 + todayEntries.length}
            label={`あなたの腸のキャラクター。${STAGE_LOOK[gut.stage]}`}
          />
          <Text style={styles.week}>この7日は {gut.weekLogDays}日 記録しています</Text>
        </View>

        <Meter
          fill={fillRatio(gut.today.total, TARGETS.total)}
          headline={progressWord(gut.today.total, TARGETS.total)}
          hint={hint?.text ?? null}
          note={gut.provisional ? 'まだ見極め中です（3日記録すると、あなたの実測に切り替わります）' : null}
        />

        {coach ? (
          <CoachCard
            suggestion={coach}
            onPress={
              coach.item.targetFood && findServing(coach.item.targetFood)
                ? () => router.push(`/food/${encodeURIComponent(coach.item.targetFood as string)}`)
                : undefined
            }
          />
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.push('/log')}
          accessibilityRole="button"
          accessibilityLabel="食べたものを記録する"
          android_ripple={{ color: colors.accent }}
        >
          <PlusIcon color="#FFFFFF" size={20} />
          <Text style={styles.ctaText} maxFontSizeMultiplier={1.4}>
            記録する
          </Text>
        </Pressable>

        {todayEntries.length ? (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>今日の記録</Text>
            {todayEntries.map((e) => {
              const s = findServing(e.label);
              if (!s) return null;
              const name = servingLabel(s, e.count);
              return (
                <Pressable
                  key={e.at}
                  style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                  onPress={() => setEditing(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}、約 ${(s.total * e.count).toFixed(1)}g。量を直すか消す`}
                >
                  <Text style={styles.listName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.listAmount}>約 {(s.total * e.count).toFixed(1)}g</Text>
                  <ChevronRightIcon />
                </Pressable>
              );
            })}
            <Text style={styles.listHelp}>押すと量を直せます</Text>
          </View>
        ) : (
          <Text style={styles.empty}>まだ今日の記録はありません</Text>
        )}
      </ScrollView>

      <QuantitySheet
        serving={editingServing}
        mode="edit"
        initialCount={editing?.count ?? 1}
        bottomInset={insets.bottom}
        onClose={() => setEditing(null)}
        onSubmit={(count) => {
          if (editing && editingServing) {
            updateEntryCount(editing.at, count);
            setToast(`${editingServing.displayName} を ${formatCount(count)}${editingServing.unitLabel}分 にしました`);
          }
          setEditing(null);
        }}
        onDelete={() => {
          if (editing && editingServing) {
            removeEntry(editing.at);
            setToast(`${editingServing.displayName} を消しました`);
          }
          setEditing(null);
        }}
        onDetail={() => {
          const label = editing?.label;
          setEditing(null);
          if (label) router.push(`/food/${encodeURIComponent(label)}`);
        }}
      />
      <Toast message={toast} bottom={insets.bottom + space.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  character: { alignItems: 'center', gap: space.sm },
  week: { ...type.small },
  cta: {
    minHeight: hit.min + 4,
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.accentStrong,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  ctaPressed: { backgroundColor: '#18604B' },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xs,
    ...elevation.card,
  },
  listTitle: { ...type.label, marginBottom: space.xs },
  listRow: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    marginHorizontal: -space.xs,
  },
  listRowPressed: { backgroundColor: colors.tap },
  listName: { ...type.body, flex: 1 },
  listAmount: { ...type.small },
  listHelp: { ...type.tiny },
  empty: { ...type.small, textAlign: 'center' },
});
