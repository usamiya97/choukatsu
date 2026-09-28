/**
 * 設定。
 * ここに必ず出典を置く（成分表の利用条件・タスク23）。
 * 苦手な食べものは診断 q10 と同じ軸で編集できる（「もち麦しか提案されない」問題の出口）。
 *
 * トグルは switch ロールで状態を読み上げさせる（色だけで on/off を表さない）。
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReminderPicker from '../../components/ReminderPicker';
import { CheckIcon, ChevronRightIcon } from '../../components/Icons';
import { DEFAULT_TARGET_TOTAL, DIAGNOSIS, GUIDELINE_TOTAL, TARGET_OPTIONS, findServing, labelsForName } from '../../lib/dataset';
import { looksLikeApiKey } from '../../lib/apikey';
import { ATTRIBUTION, axisName } from '../../lib/format';
import { DEFAULT_REMINDER_AT, reminderLabel, stoolWeekWord } from '../../lib/stool';
import { useStore } from '../../lib/store';
import { stageThresholds } from '../../lib/state';
import { SOLUBLE_CAP_G } from '../../lib/targets';
import { colors, elevation, hit, radius, space, type } from '../../lib/theme';

export default function SettingsScreen() {
  const { profile, updateProfile, resetAll, gut, targets, hasApiKey, setApiKey, stoolWeek, setStoolReminder } =
    useStore();
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q10 = DIAGNOSIS.questions.find((q) => q.id === 'q10');
  // 保存値が壊れていても「null にお聞きします」と書かないよう、読める時刻かどうかで分ける
  const stoolAtLabel = reminderLabel(profile.stoolReminderAt);
  const stoolWeekLine = stoolWeekWord(stoolWeek);

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

      <Card
        title="1日の目標"
        lead={`いまは ${targets.total}g。キャラクターが育つ目安もこれに合わせて動きます`}
      >
        {TARGET_OPTIONS.map((o) => {
          const on = targets.total === o.total;
          const { up } = stageThresholds(o.total);
          return (
            <Pressable
              key={o.total}
              style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.togglePressed]}
              onPress={() =>
                updateProfile({ targetTotal: o.total === DEFAULT_TARGET_TOTAL ? null : o.total })
              }
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`1日の目標を ${o.label} にする。キャラクターは7日平均${up[4]}gで色つやが出て、${up[5]}gでいちばん元気になります`}
              android_ripple={{ color: colors.tapPressed }}
            >
              <View style={styles.toggleTexts}>
                <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{o.label}</Text>
                <Text style={[styles.toggleSub, on && styles.toggleTextOn]}>
                  キャラクターの目安 {up[4]}g → {up[5]}g
                </Text>
              </View>
              {on ? <CheckIcon color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
        <Text style={styles.small}>
          公的な目安は1日 {GUIDELINE_TOTAL}g以上（女性）/ 21g以上（男性）で、25gは研究で理想とされている量です。
          高い目標から始めて、続かないと感じたら下げてかまいません。
        </Text>
        <Text style={styles.small}>
          ※ 内訳の目安は総量から 1:2 で出します。{axisName('soluble')} が {targets.soluble}g、
          {axisName('insoluble')} が {targets.insoluble}g。この比率が整っているときがいちばん働きやすいと
          言われている配分です。{axisName('soluble', false)}側は {SOLUBLE_CAP_G}g で打ち止めにしています
          （毎日狙える範囲に留めるため）。
        </Text>
      </Card>

      <Card
        title="お通じの記録"
        lead={stoolAtLabel ? `${stoolAtLabel} にお聞きします` : '時刻を決めると、その時刻にお聞きします'}
      >
        <ReminderPicker
          value={profile.stoolReminderAt}
          // 時刻だけ変える。通知を出すかどうかは下のトグルの状態を引き継ぐ
          onChange={(at) => void setStoolReminder(at, profile.stoolNotify)}
          allowNone
        />
        <Pressable
          style={({ pressed }) => [
            styles.toggle,
            profile.stoolNotify && styles.toggleOn,
            pressed && styles.togglePressed,
          ]}
          onPress={async () => {
            if (profile.stoolNotify) {
              await setStoolReminder(profile.stoolReminderAt, false);
              return;
            }
            // 時刻を決めていない人がここから入ったときは既定の時刻を当てる
            const ok = await setStoolReminder(profile.stoolReminderAt ?? DEFAULT_REMINDER_AT, true);
            if (!ok) {
              Alert.alert(
                '通知を出せませんでした',
                'この端末では通知が使えないか、通知が切られています。アプリを開いたときにホームでお知らせします。'
              );
            }
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: profile.stoolNotify }}
          accessibilityLabel="その時刻に端末の通知を出す"
        >
          <Text style={[styles.toggleText, profile.stoolNotify && styles.toggleTextOn]}>
            その時刻に通知を出す
          </Text>
          {profile.stoolNotify ? (
            <View style={styles.toggleMark}>
              <CheckIcon color="#FFFFFF" />
              <Text style={styles.toggleMarkText}>オン</Text>
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.small}>
          通知を切っていても、時刻を過ぎるとホームの行でお知らせします。
          回数と便の形だけを記録します（体調そのものの判断はしません）。
        </Text>
        {stoolWeekLine ? <Text style={styles.body}>{stoolWeekLine}</Text> : null}
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

      <Card
        title="AI入力（任意）"
        lead="自由文で食事を書いて記録できるようになります。入れなくてもアプリは全部使えます"
      >
        {hasApiKey ? (
          <>
            <Text style={styles.body}>キーは保存済みです</Text>
            <Text style={styles.small}>
              この端末の安全な領域（iOSはキーチェーン）に保存しています。記録には送りません。
            </Text>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                Alert.alert('キーを削除しますか', '自由文入力は、辞書で解ける範囲だけに戻ります。', [
                  { text: 'やめる', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => void setApiKey(null) },
                ])
              }
              accessibilityRole="button"
              accessibilityLabel="保存したAPIキーを削除する"
              accessibilityHint="確認のダイアログが出ます"
            >
              <Text style={[styles.rowText, styles.danger]}>キーを削除する</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.keyInput}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="sk-ant-..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              // 入力中も伏せる。肩越しに見られる場所で開くことがある
              secureTextEntry
              accessibilityLabel="Anthropic の API キー"
            />
            <Pressable
              style={({ pressed }) => [
                styles.keySave,
                !looksLikeApiKey(keyInput) && styles.keySaveOff,
                pressed && styles.rowPressed,
              ]}
              disabled={!looksLikeApiKey(keyInput) || saving}
              onPress={async () => {
                setSaving(true);
                try {
                  await setApiKey(keyInput);
                  setKeyInput('');
                } catch {
                  Alert.alert('保存できませんでした', 'この端末の安全な領域に書き込めませんでした。');
                } finally {
                  setSaving(false);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="APIキーを保存する"
              accessibilityState={{ disabled: !looksLikeApiKey(keyInput) }}
            >
              <Text style={styles.keySaveText}>{saving ? '保存中…' : '保存する'}</Text>
            </Pressable>
            <Text style={styles.small}>
              console.anthropic.com で発行したキーを貼ってください。あなた自身の利用料がかかります
              （1回の入力でおよそ0.5円）。キーはこの端末から出ません。
            </Text>
          </>
        )}
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
  keyInput: {
    minHeight: hit.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.tap,
    ...type.body,
  },
  keySave: {
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  // 押せないことを色だけで示さない。disabled も同時に渡している
  keySaveOff: { backgroundColor: colors.badge },
  keySaveText: { ...type.bodyStrong, color: '#FFFFFF' },
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
  toggleTexts: { flex: 1, gap: 2 },
  toggleText: { ...type.body },
  toggleSub: { ...type.tiny },
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
