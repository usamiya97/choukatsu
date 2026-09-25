/**
 * 設定。
 * ここに必ず出典を置く（成分表の利用条件・タスク23）。
 * 苦手な食べものは診断 q10 と同じ軸で編集できる（「もち麦しか提案されない」問題の出口）。
 *
 * トグルは switch ロールで状態を読み上げさせる（色だけで on/off を表さない）。
 */
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronRightIcon } from '../../components/Icons';
import { DIAGNOSIS, findServing, labelsForName } from '../../lib/dataset';
import { ATTRIBUTION } from '../../lib/format';
import { useStore } from '../../lib/store';
import { colors, elevation, hit, radius, space, type } from '../../lib/theme';

export default function SettingsScreen() {
  const { profile, updateProfile, resetAll, gut } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q10 = DIAGNOSIS.questions.find((q) => q.id === 'q10');

  const toggle = (names: string[]) => {
    const labels = names.flatMap(labelsForName);
    const has = labels.every((l) => profile.excludedFoods.includes(l));
    const next = has
      ? profile.excludedFoods.filter((l) => !labels.includes(l))
      : [...new Set([...profile.excludedFoods, ...labels])];
    updateProfile({ excludedFoods: next });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
    >
      <Card title="いまの状態">
        <Text style={styles.body}>
          記録した日数 {gut.totalLoggedDays}日 / 見つけた食べもの {gut.flora}種類
        </Text>
        <Text style={styles.small}>
          {gut.useMeasured
            ? 'キャラクターはあなたの実測（直近7日）で育っています'
            : '3日記録すると、診断の推定値からあなたの実測に切り替わります'}
        </Text>
      </Card>

      <Card title="苦手な食べもの" lead="選んだものは提案に出しません">
        {q10?.options
          .filter((o) => o.excludes?.length)
          .map((o) => {
            const labels = (o.excludes ?? []).flatMap(labelsForName);
            const on = labels.length > 0 && labels.every((l) => profile.excludedFoods.includes(l));
            return (
              <Pressable
                key={o.label}
                style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.togglePressed]}
                onPress={() => toggle(o.excludes ?? [])}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${o.label}を提案から外す`}
                android_ripple={{ color: colors.tapPressed }}
              >
                <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{o.label}</Text>
                {on ? (
                  <View style={styles.toggleMark}>
                    <CheckIcon color="#FFFFFF" />
                    <Text style={styles.toggleMarkText}>除外中</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        {profile.excludedFoods.length ? (
          <Text style={styles.small}>
            いま外している食品: {profile.excludedFoods.map((l) => findServing(l)?.displayName ?? l).join('、')}
          </Text>
        ) : null}
      </Card>

      <Card title="診断">
        {profile.typeName ? <Text style={styles.body}>いまのタイプ: {profile.typeName}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/onboarding')}
          accessibilityRole="button"
          accessibilityLabel="10問の診断をやり直す"
        >
          <Text style={styles.rowText}>10問をやり直す</Text>
          <ChevronRightIcon color={colors.accentStrong} />
        </Pressable>
      </Card>

      <Card title="出典">
        <Text style={styles.small}>{ATTRIBUTION}</Text>
        <Text style={styles.small}>
          食物繊維の量は成分表の値から算出しています。分析法（プロスキー変法 / AOAC2011.25法）が異なる食品どうしは
          直接くらべられないため、置き換えの提案は同じ分析法の食品の中だけで出しています。
        </Text>
      </Card>

      <Card title="データ">
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            Alert.alert('記録をすべて消しますか', 'この端末に保存した記録・診断結果が消えます。戻せません。', [
              { text: 'やめる', style: 'cancel' },
              { text: '消す', style: 'destructive', onPress: () => resetAll() },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel="記録をすべて消す"
          accessibilityHint="確認のダイアログが出ます"
        >
          <Text style={[styles.rowText, styles.danger]}>記録をすべて消す</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

function Card({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {lead ? <Text style={styles.small}>{lead}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },
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
  body: { ...type.body },
  small: { ...type.small },
  toggle: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.tap,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  toggleOn: { backgroundColor: colors.accentStrong },
  togglePressed: { opacity: 0.9 },
  toggleText: { ...type.body, flex: 1 },
  toggleTextOn: { color: '#FFFFFF', fontWeight: '700' },
  toggleMark: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  toggleMarkText: { ...type.tiny, color: '#FFFFFF', fontWeight: '700' },
  row: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPressed: { opacity: 0.7 },
  rowText: { ...type.body, color: colors.accentStrong, fontWeight: '600' },
  danger: { color: colors.danger },
});
