/**
 * お通じの記録（DESIGN §15）。回数と形を選んで、1日1件の要約として残す。
 *
 * **ここでキャラクターは動かない。** お通じは食物繊維のように「やれば増える」ものではなく
 * 体の反応なので、段階に効かせると体調の悪い日にキャラが弱る＝罰になる（DESIGN §15-2）。
 * 記録したことへの返事は触覚とトーストだけにしてある。
 *
 * 良い形・悪い形とも書かない。数字を並べるだけで、判断はユーザーに残す（DESIGN §5-1）。
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QuantityStepper from '../components/QuantityStepper';
import StoolFormIcon from '../components/StoolFormIcon';
import Toast from '../components/Toast';
import { CheckIcon, TrashIcon } from '../components/Icons';
import { haptics } from '../lib/motion';
import {
  STOOL_COUNT_MAX,
  STOOL_COUNT_MIN,
  STOOL_FORMS,
  stoolWeekWord,
} from '../lib/stool';
import { useStore } from '../lib/store';
import { colors, elevation, hit, radius, space, type } from '../lib/theme';
import type { StoolForm } from '../lib/types';

export default function StoolScreen() {
  const { todayStool, stoolWeek, setStool, clearStool } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 既に記録があればそれを初期値にする（開くたびに1回からやり直させない）
  const [count, setCount] = useState<number>(todayStool?.count ?? 1);
  const [form, setForm] = useState<StoolForm | null>(todayStool?.form ?? null);
  const [toast, setToast] = useState<string | null>(null);

  const week = stoolWeekWord(stoolWeek);
  const none = count === STOOL_COUNT_MIN;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const save = () => {
    setStool(count, none ? null : form);
    haptics.record();
    // 保存したら閉じる。閉じた先（ホーム）の行に結果が出るので、ここに結果を残さない
    router.back();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            今日、何回でしたか
          </Text>
          <QuantityStepper
            count={count}
            unitLabel="回"
            onChange={(next) => setCount(next)}
            step={1}
            min={STOOL_COUNT_MIN}
            max={STOOL_COUNT_MAX}
            noun="回数"
            describe={(c) => (c === 0 ? '出なかった' : `${c}回`)}
          />
          <Text style={styles.note}>
            {none
              ? '「出なかった日」として記録します。記録しない日とは別に数えます'
              : `多い日でも ${STOOL_COUNT_MAX}回 までにしています`}
          </Text>
        </View>

        {/* 出なかった日に形は無い。選択肢を出さない（0回で形が残ると振り返りが嘘になる） */}
        {none ? null : (
          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              形はどれに近いですか
            </Text>
            <Text style={styles.note}>いちばん近いものを1つ。選ばなくても記録できます</Text>
            <View style={styles.forms}>
              {STOOL_FORMS.map((f) => {
                const on = form === f.form;
                return (
                  <Pressable
                    key={f.form}
                    style={({ pressed }) => [styles.form, on && styles.formOn, pressed && styles.formPressed]}
                    // 押し直しで外せる（選び間違いを消す手段を隠さない）
                    onPress={() => setForm(on ? null : f.form)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, checked: on }}
                    accessibilityLabel={`${f.name}。${f.note}`}
                    android_ripple={{ color: colors.tapPressed }}
                  >
                    <StoolFormIcon form={f.form} color={on ? '#FFFFFF' : colors.textMuted} />
                    <View style={styles.formTexts}>
                      <Text style={[styles.formName, on && styles.textOn]}>{f.name}</Text>
                      <Text style={[styles.formNote, on && styles.textOn]}>{f.note}</Text>
                    </View>
                    {on ? <CheckIcon color="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={save}
          accessibilityRole="button"
          accessibilityLabel={todayStool ? 'この内容に直す' : 'この内容で記録する'}
        >
          <Text style={styles.ctaText} maxFontSizeMultiplier={1.4}>
            {todayStool ? 'この内容に直す' : '記録する'}
          </Text>
        </Pressable>

        {todayStool ? (
          <Pressable
            style={({ pressed }) => [styles.delete, pressed && styles.deletePressed]}
            onPress={() =>
              Alert.alert('今日のお通じの記録を消しますか', '「出なかった日」としても残りません。', [
                { text: 'やめる', style: 'cancel' },
                {
                  text: '消す',
                  style: 'destructive',
                  onPress: () => {
                    clearStool();
                    setToast('今日の記録を消しました');
                  },
                },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel="今日の記録を消す"
            accessibilityHint="確認のダイアログが出ます"
          >
            <TrashIcon color={colors.danger} />
            <Text style={styles.deleteText}>今日の記録を消す</Text>
          </Pressable>
        ) : null}

        {week ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              この7日
            </Text>
            <Text style={styles.body}>{week}</Text>
            <Text style={styles.note}>
              記録した日だけを数えています（記録しなかった日を「出なかった日」にはしません）
            </Text>
          </View>
        ) : null}

        <Text style={styles.foot}>
          体調そのものの判断はしません。気になることが続くときは、お医者さんに相談してください
        </Text>
      </ScrollView>
      <Toast message={toast} bottom={insets.bottom + space.lg} />
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
  note: { ...type.tiny },
  forms: { gap: space.sm, marginTop: space.xs },
  form: {
    minHeight: hit.min + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.tap,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  formOn: { backgroundColor: colors.accentStrong },
  formPressed: { backgroundColor: colors.tapPressed },
  formTexts: { flex: 1, gap: 2 },
  formName: { ...type.bodyStrong },
  formNote: { ...type.tiny },
  textOn: { color: '#FFFFFF' },
  cta: {
    minHeight: hit.min + 4,
    backgroundColor: colors.accentStrong,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  ctaPressed: { backgroundColor: colors.accentPressed },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  delete: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  deletePressed: { opacity: 0.7 },
  deleteText: { ...type.small, color: colors.danger, fontWeight: '700' },
  foot: { ...type.tiny },
});
