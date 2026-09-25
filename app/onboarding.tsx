/**
 * 初回診断10問（data/diagnosis.json）。
 *
 * 目的は「記録0日の初日に第1提案を出すこと」だけ。だから **スキップできる**。
 * ここを必須にすると最初の壁になり、記録が始まる前に離脱する。
 *
 * 進捗は「3 / 10」と横バーの両方で出す（あと何問かが分からないと答える気にならない）。
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GutCharacterLive from '../components/GutCharacterLive';
import { CheckIcon } from '../components/Icons';
import { DIAGNOSIS, labelsForName } from '../lib/dataset';
import { scoreDiagnosis, type Answers } from '../lib/diagnosis';
import { resolveStage } from '../lib/state';
import { useStore } from '../lib/store';
import { colors, elevation, hit, radius, space, type } from '../lib/theme';

export default function Onboarding() {
  const { updateProfile } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const questions = DIAGNOSIS.questions;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<ReturnType<typeof scoreDiagnosis> | null>(null);

  const q = questions[step];
  const current = answers[q?.id ?? ''];
  const selected = useMemo(
    () => (current === undefined ? [] : Array.isArray(current) ? current : [current]),
    [current]
  );

  const finish = (a: Answers) => {
    const r = scoreDiagnosis(DIAGNOSIS, a, labelsForName);
    setResult(r);
    updateProfile({
      diagnosed: true,
      estTotal: r.estTotal,
      estSolubleRatio: r.estSolubleRatio,
      typeName: r.typeName,
      stoolProfile: r.stoolProfile,
      concerns: r.concerns,
      excludedFoods: r.excludedFoods,
    });
  };

  const skip = () => {
    // スキップも「済み」にする。推定値は持たないので、キャラは実測だけで動く
    updateProfile({ diagnosed: true });
    router.replace('/');
  };

  const choose = (index: number) => {
    const next: Answers = { ...answers };
    if (q.multi) {
      const set = new Set(selected);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      next[q.id] = [...set];
      setAnswers(next);
      return; // 複数選択は「次へ」で進む
    }
    next[q.id] = index;
    setAnswers(next);
    if (step + 1 < questions.length) setStep(step + 1);
    else finish(next);
  };

  if (result) {
    // 推定値から決まる段階のキャラを、結果としてその場で見せる
    const stage = resolveStage(result.estTotal, 1);
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
      >
        <View style={styles.resultHead}>
          <GutCharacterLive
            stage={stage}
            floraCount={0}
            size={180}
            label={`いまの推定でのキャラクター。段階${stage}`}
          />
          <Text style={styles.typeName}>{result.typeName}</Text>
          <Text style={styles.body}>{result.shareCopy}</Text>
        </View>
        <Text style={styles.small}>
          いまの食物繊維は 1日 およそ {Math.round(result.estTotal)}g と見ています。
          3日 記録すると、この推定は捨ててあなたの実測に切り替わります。
        </Text>
        {result.excludedFoods.length ? (
          <Text style={styles.small}>苦手だと答えたものは、提案に出しません（設定でいつでも変えられます）</Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="はじめる"
        >
          <Text style={styles.ctaText}>はじめる</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const progress = (step + 1) / questions.length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
    >
      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>
          {step + 1} / {questions.length}
        </Text>
        <View
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="診断の進み具合"
          accessibilityValue={{ min: 0, max: questions.length, now: step + 1 }}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <Text style={styles.question} accessibilityRole="header">
        {q.q}
      </Text>
      {q.multi ? <Text style={styles.small}>いくつでも選べます</Text> : null}

      <View style={styles.options}>
        {q.options.map((o, i) => {
          const on = selected.includes(i);
          return (
            <Pressable
              key={o.label}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.optionPressed]}
              onPress={() => choose(i)}
              accessibilityRole={q.multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on, selected: on }}
              accessibilityLabel={o.label}
              android_ripple={{ color: colors.tapPressed }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
              {on ? <CheckIcon color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable
            onPress={() => setStep(step - 1)}
            hitSlop={12}
            style={styles.footerButton}
            accessibilityRole="button"
            accessibilityLabel="前の質問にもどる"
          >
            <Text style={styles.linkText}>もどる</Text>
          </Pressable>
        ) : (
          <View style={styles.footerButton} />
        )}
        {q.multi ? (
          <Pressable
            onPress={() => (step + 1 < questions.length ? setStep(step + 1) : finish(answers))}
            hitSlop={12}
            style={styles.footerButton}
            accessibilityRole="button"
            accessibilityLabel={step + 1 < questions.length ? '次の質問へ' : '結果を見る'}
          >
            <Text style={styles.linkText}>{step + 1 < questions.length ? '次へ' : '結果を見る'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={skip}
            hitSlop={12}
            style={styles.footerButton}
            accessibilityRole="button"
            accessibilityLabel="診断をあとにして、先に使いはじめる"
          >
            <Text style={styles.small}>あとにする</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  progressWrap: { gap: space.sm },
  progressText: { ...type.small },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accentStrong, borderRadius: radius.pill },
  question: { ...type.title, fontSize: 21, lineHeight: 30 },
  options: { gap: space.sm },
  option: {
    minHeight: hit.min + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  optionOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  optionPressed: { backgroundColor: colors.tapPressed },
  optionText: { ...type.body, flex: 1 },
  optionTextOn: { color: '#FFFFFF', fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.md,
  },
  footerButton: { minHeight: hit.min, minWidth: 64, justifyContent: 'center' },
  linkText: { ...type.body, color: colors.accentStrong, fontWeight: '700' },
  small: { ...type.small },
  body: { ...type.body },
  resultHead: { alignItems: 'center', gap: space.sm },
  typeName: { ...type.title, fontSize: 24 },
  cta: {
    minHeight: hit.min + 4,
    backgroundColor: colors.accentStrong,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    ...elevation.raised,
  },
  ctaPressed: { backgroundColor: '#18604B' },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
