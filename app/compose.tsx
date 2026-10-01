/**
 * 自由文で食事を書いて記録する画面（DESIGN §14）。
 *
 * **読み取った結果をそのまま記録しない。** 必ず確認を挟む。
 * 入力の取り違え（ポテトサラダ→ポテトチップス等）は記録の信頼をいちばん早く壊すので、
 * 「これで合っていますか」を1枚必ず通す。外したいものは個別に外せる。
 *
 * **いまは端末の辞書（lib/lexicon.ts・549キー）だけで解く。** LLMは呼んでいない（DESIGN §19）。
 * 辞書だけでも代表8文のうち6件は完結するので、この画面は AI 無しで成立する。
 * プロキシができたら、解けなかった断片だけをLLMに渡す経路が復活する（§14-1）。
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QuantityStepper from '../components/QuantityStepper';
import Toast from '../components/Toast';
import { CheckIcon, ChevronRightIcon, PlusIcon } from '../components/Icons';
import { servingLabel } from '../lib/format';
import { haptics } from '../lib/motion';
import { useStore } from '../lib/store';
import type { ParsedEntry } from '../lib/mealparse';
import { colors, elevation, hit, radius, space, type } from '../lib/theme';

/** 確認画面の1行。外すことも量を変えることもできる */
type Candidate = ParsedEntry & { on: boolean };

export default function ComposeScreen() {
  const { parseText, addEntry } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [usedLlm, setUsedLlm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const read = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const result = await parseText(text);
      setCandidates(result.entries.map((e) => ({ ...e, on: true })));
      setUnknown(result.unknown);
      setUsedLlm(!result.fromLexicon);
    } finally {
      setBusy(false);
    }
  };

  const record = () => {
    const chosen = (candidates ?? []).filter((c) => c.on);
    if (!chosen.length) return;
    for (const c of chosen) addEntry(c.serving.label, c.count);
    haptics.record();
    // 記録したら入力を空にする。同じ文をもう一度読み取らせない
    setText('');
    setCandidates(null);
    setUnknown([]);
    setToast(`${chosen.length}件を記録しました`);
    setTimeout(() => router.back(), 900);
  };

  const chosenCount = (candidates ?? []).filter((c) => c.on).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          食べたものをそのまま書いてください。「朝は納豆ごはんとサラダ」のような書き方で読み取ります
        </Text>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="今日はもち麦ごはん2杯と納豆、ブロッコリー"
          placeholderTextColor={colors.textMuted}
          multiline
          accessibilityLabel="食べたものを書く"
        />

        <Pressable
          style={({ pressed }) => [styles.cta, !text.trim() && styles.ctaOff, pressed && styles.ctaPressed]}
          onPress={read}
          disabled={!text.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="書いた内容を読み取る"
          accessibilityState={{ disabled: !text.trim() || busy }}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" accessibilityLabel="読み取っています" />
          ) : (
            <Text style={styles.ctaText}>読み取る</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          登録のある食べものの名前を見つけて読み取ります。見つからなかったものは
          下に出るので、記録タブから探して足してください
        </Text>

        {candidates ? (
          <View style={styles.result}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              これで合っていますか
            </Text>
            <Text style={styles.small}>
              ちがうものは押して外してください。量も直せます
              {usedLlm ? '（AIが読み取りました）' : ''}
            </Text>

            {candidates.length === 0 ? (
              <Text style={styles.body}>読み取れませんでした。書き方を変えるか、検索から探してください</Text>
            ) : null}

            {candidates.map((c, i) => (
              <View key={`${c.serving.label}-${i}`} style={styles.row}>
                <Pressable
                  style={styles.rowHead}
                  onPress={() =>
                    setCandidates((prev) =>
                      (prev ?? []).map((x, xi) => (xi === i ? { ...x, on: !x.on } : x))
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: c.on }}
                  accessibilityLabel={`${servingLabel(c.serving, c.count)}。「${c.quoted}」から読み取りました`}
                >
                  <View style={[styles.box, c.on && styles.boxOn]}>
                    {c.on ? <CheckIcon color="#FFFFFF" /> : null}
                  </View>
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowName, !c.on && styles.rowOff]}>
                      {servingLabel(c.serving, c.count)}
                    </Text>
                    {/* どの語から当てたかを必ず出す。取り違えはここを見れば気づける */}
                    <Text style={styles.quoted}>「{c.quoted}」から</Text>
                  </View>
                </Pressable>
                {c.on ? (
                  <QuantityStepper
                    count={c.count}
                    unitLabel={c.serving.unitLabel}
                    onChange={(n) =>
                      setCandidates((prev) =>
                        (prev ?? []).map((x, xi) => (xi === i ? { ...x, count: n } : x))
                      )
                    }
                  />
                ) : null}
              </View>
            ))}

            {unknown.length ? (
              <View style={styles.unknownBox}>
                <Text style={styles.small}>
                  登録がありません: {unknown.join('、')}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.link, pressed && styles.rowPressed]}
                  onPress={() => router.replace('/log')}
                  accessibilityRole="button"
                  accessibilityLabel="検索から探す"
                >
                  <Text style={styles.linkText}>検索から探す</Text>
                  <ChevronRightIcon color={colors.accentStrong} />
                </Pressable>
              </View>
            ) : null}

            {candidates.length ? (
              <Pressable
                style={({ pressed }) => [
                  styles.cta,
                  !chosenCount && styles.ctaOff,
                  pressed && styles.ctaPressed,
                ]}
                onPress={record}
                disabled={!chosenCount}
                accessibilityRole="button"
                accessibilityLabel={`選んだ${chosenCount}件を記録する`}
                accessibilityState={{ disabled: !chosenCount }}
              >
                <PlusIcon color="#FFFFFF" size={20} />
                <Text style={styles.ctaText}>{chosenCount}件を記録する</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <Toast message={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  lead: { ...type.small },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.card,
    textAlignVertical: 'top',
    ...type.body,
  },
  cta: {
    minHeight: hit.min,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  ctaPressed: { backgroundColor: colors.accentPressed },
  ctaOff: { backgroundColor: colors.badge },
  ctaText: { ...type.bodyStrong, color: '#FFFFFF', fontSize: 17 },
  note: { ...type.tiny },
  result: { gap: space.md, marginTop: space.lg },
  sectionTitle: { ...type.title },
  body: { ...type.body },
  small: { ...type.small },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    ...elevation.card,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.min },
  rowPressed: { opacity: 0.7 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  rowTexts: { flex: 1, gap: 2 },
  rowName: { ...type.bodyStrong },
  // 外した行は色だけでなく取り消し線でも示す
  rowOff: { color: colors.textMuted, textDecorationLine: 'line-through' },
  quoted: { ...type.tiny },
  unknownBox: {
    backgroundColor: colors.badge,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: hit.min },
  linkText: { ...type.small, color: colors.accentStrong, fontWeight: '700' },
});
