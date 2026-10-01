/**
 * ふりかえり（DESIGN §16）。**「入れたもの」と「出たもの」を同じ行に並べる**画面。
 *
 * 記録は最初から日付ごとに残っていたのに、今日ぶんしか見られなかった。
 * 週に1回ここを開いて、前の7日とくらべる——という使い方のための画面。
 *
 * 窓は**直近7日のローリング**で、キャラを動かしている7日平均と同じ定義
 * （画面の数字とキャラの見た目をずらさないため）。曜日固定の週は採らなかった。
 *
 * ここに**判断を書かない。** 数字を並べるだけにして、「増えたから良くなった」は言わない
 * （食物繊維とお通じの因果はこのアプリが証明できるものではない・DESIGN §16-2）。
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRightIcon } from '../../components/Icons';
import { SERVINGS } from '../../lib/dataset';
import { axisName } from '../../lib/format';
import {
  REVIEW_DAYS,
  axisLine,
  compareWeeks,
  previousWeekKey,
  reviewText,
  shortDate,
  signed,
  weekReview,
} from '../../lib/review';
import { shiftDays } from '../../lib/state';
import { stoolRecordWord, stoolWeekWord } from '../../lib/stool';
import { useStore } from '../../lib/store';
import { colors, elevation, hit, radius, space, type } from '../../lib/theme';

export default function ReviewScreen() {
  const { logs, stool, today, targets } = useStore();
  const insets = useSafeAreaInsets();
  /** 何週ぶん戻って見ているか。0 が直近7日 */
  const [back, setBack] = useState(0);

  const endKey = useMemo(() => shiftDays(today, -back * REVIEW_DAYS), [today, back]);
  const week = useMemo(
    () => weekReview(logs, stool, SERVINGS, endKey, targets),
    [logs, stool, endKey, targets]
  );
  const prev = useMemo(
    () => weekReview(logs, stool, SERVINGS, previousWeekKey(endKey), targets),
    [logs, stool, endKey, targets]
  );
  const diff = compareWeeks(week, prev);
  const stoolLine = stoolWeekWord(week.stool);

  const share = async () => {
    try {
      await Share.share({ message: reviewText(week, prev, targets) });
    } catch {
      Alert.alert('共有できませんでした', 'もう一度お試しください。');
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
    >
      {/* 窓の移動。未来には行けない（次の7日は back>0 のときだけ） */}
      <View style={styles.nav}>
        <Pressable
          onPress={() => setBack(back + 1)}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
          accessibilityRole="button"
          accessibilityLabel="前の7日を見る"
          hitSlop={8}
        >
          <View style={styles.flip}>
            <ChevronRightIcon color={colors.accentStrong} />
          </View>
        </Pressable>
        <View style={styles.navTexts}>
          <Text style={styles.range}>
            {shortDate(week.from)} 〜 {shortDate(week.to)}
          </Text>
          <Text style={styles.rangeSub}>{back === 0 ? '直近7日' : `${back}週間 前の7日`}</Text>
        </View>
        <Pressable
          onPress={() => setBack(Math.max(0, back - 1))}
          disabled={back === 0}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed, back === 0 && styles.navOff]}
          accessibilityRole="button"
          accessibilityLabel="次の7日を見る"
          accessibilityState={{ disabled: back === 0 }}
          hitSlop={8}
        >
          <ChevronRightIcon color={colors.accentStrong} />
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.statRow}>
          <Stat value={`${week.logDays}日`} label="記録した日" />
          <Stat value={`${Math.round(week.avgTotal)}g`} label="記録した日の平均" />
          <Stat value={`${week.reachedDays}日`} label={`目標${targets.total}gに届いた`} />
        </View>
        <Text style={styles.note}>
          平均は記録した日だけで出しています（記録しなかった日を0gとして数えません）
        </Text>
        {diff.avgTotal === null ? (
          <Text style={styles.note}>前の7日は記録がないので、くらべていません</Text>
        ) : (
          <Text style={styles.diff}>
            前の7日とくらべて 平均 {signed(diff.avgTotal, 'g')} / 届いた日{' '}
            {signed(diff.reachedDays ?? 0, '日')}
            {diff.stoolCount === null ? '' : ` / お通じ ${signed(diff.stoolCount, '回')}`}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          日ごと
        </Text>
        {week.days.map((d) => (
          <View
            key={d.key}
            style={[styles.day, d.reached && styles.dayReached]}
            accessible
            accessibilityLabel={
              (d.logged
                ? `${shortDate(d.key)} 食物繊維 ${Math.round(d.totals.total)}g、${axisLine(d.totals)}${
                    d.reached ? '、目標に届きました' : ''
                  }`
                : `${shortDate(d.key)} 食物繊維の記録なし`) +
              `。お通じ ${d.stool ? stoolRecordWord(d.stool) : '記録なし'}`
            }
          >
            <View style={styles.dayHead}>
              <Text style={styles.dayDate}>{shortDate(d.key)}</Text>
              <Text style={[styles.dayTotal, !d.logged && styles.dayMuted]}>
                {d.logged ? `${Math.round(d.totals.total)}g` : '記録なし'}
              </Text>
              {d.reached ? <Text style={styles.reached}>目標</Text> : null}
            </View>
            <Text style={styles.daySub}>
              {d.logged ? axisLine(d.totals) : '—'} ／{' '}
              {d.stool ? stoolRecordWord(d.stool) : 'お通じの記録なし'}
            </Text>
          </View>
        ))}
        <Text style={styles.note}>
          {axisName('soluble')} と {axisName('insoluble')} は、その日の内訳です
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          お通じ
        </Text>
        <Text style={styles.body}>{stoolLine ?? 'この7日はまだ記録がありません'}</Text>
        <Text style={styles.note}>
          食物繊維との関係は決めつけません。並べて見て、気づいたことはご自身の判断で
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={share}
        accessibilityRole="button"
        accessibilityLabel="この7日のふりかえりを文章にして共有する"
      >
        <Text style={styles.ctaText} maxFontSizeMultiplier={1.4}>
          この7日を文章で共有する
        </Text>
      </Pressable>
      <Text style={styles.foot}>
        日ごとの数字と出典を入れた文章を、そのままメッセージやメールで送れます
      </Text>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.statValue} maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  navButton: {
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  navPressed: { backgroundColor: colors.tapPressed },
  // 押せないことを色だけで示さない（disabled も渡している）
  navOff: { opacity: 0.3 },
  // 「前へ」は同じ矢印を反転して使う（左向きアイコンを増やさない）
  flip: { transform: [{ scaleX: -1 }] },
  navTexts: { flex: 1, alignItems: 'center' },
  range: { ...type.headline },
  rangeSub: { ...type.tiny },
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
  diff: { ...type.bodyStrong, color: colors.accentStrong },
  statRow: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  statValue: { ...type.title, fontSize: 22 },
  statLabel: { ...type.tiny },
  day: {
    gap: 2,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.sm,
  },
  // 届いた日だけ地を変える。印（「目標」の文字）も必ず添える
  dayReached: { backgroundColor: colors.accentSoft },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dayDate: { ...type.bodyStrong, width: 92 },
  dayTotal: { ...type.body, flex: 1 },
  dayMuted: { color: colors.textMuted },
  reached: { ...type.tiny, color: colors.accentStrong, fontWeight: '700' },
  daySub: { ...type.small },
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
  foot: { ...type.tiny },
});
