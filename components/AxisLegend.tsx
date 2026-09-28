/**
 * 2軸の説明（菌のごはん／おそうじ）。診断の結果画面で1度だけ見せる。
 *
 * 質問の流れの中には入れない。**診断はスキップできることが前提**なので、
 * ここを必須の1画面にすると記録が始まる前の壁がもう1枚増える（DESIGN §8）。
 *
 * 色の丸はホームの内訳バーと同じ色。「ホームのあの緑の棒＝菌のごはん」を
 * 最初に1度だけ結びつけるためにあるので、バーと色を揃えること。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AXIS, axisName, type Axis } from '../lib/format';
import { axisColors, colors, radius, space, type } from '../lib/theme';
import type { Targets } from '../lib/types';

export default function AxisLegend({ targets }: { targets?: Targets }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>食物繊維には2種類あります</Text>
      <Row axis="soluble" target={targets?.soluble} />
      <Row axis="insoluble" target={targets?.insoluble} />
      {targets ? (
        <Text style={styles.foot}>
          1日の目安は総量から 1:2 で出します（いまは {targets.soluble}g / {targets.insoluble}g）。
          どちらかに寄っている日は、提案がその軸を先に言います
        </Text>
      ) : null}
    </View>
  );
}

function Row({ axis, target }: { axis: Exclude<Axis, 'total'>; target?: number }) {
  const meta = AXIS[axis];
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: axisColors[axis].fill }]} />
      <View style={styles.texts}>
        <Text style={styles.name}>
          {axisName(axis)}
          {target ? ` ${target}g` : ''}
        </Text>
        <Text style={styles.note}>{meta.note}</Text>
        <Text style={styles.look}>{meta.look}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  title: { ...type.label },
  row: { flexDirection: 'row', gap: space.md },
  // 丸はバーと同じ色。位置は1行目の文字の中心に合わせる
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  texts: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong },
  note: { ...type.small },
  look: { ...type.tiny },
  foot: { ...type.tiny },
});
