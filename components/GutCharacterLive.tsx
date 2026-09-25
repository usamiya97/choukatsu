/**
 * 動くキャラクター。`GutCharacter`（静止したSVG）に動きだけを足す層。
 *
 * 動かす理由と、動かし方の制約:
 *  - **呼吸と浮遊は「生きている」ことの表示**。段階が低いほど遅く浅くする
 *    （段階1は寝ているので、ほぼ動かない = 弱っているのではなく眠っている、と読ませる）
 *  - **動きの数は絞る**。同時に動くのは本体（呼吸＋浮遊）とまわりの菌（公転）だけ。
 *    たくさん動かすと注意が散り、酔う人が出る
 *  - **記録したときの1回だけの反応**（`reactKey` の変化）が、唯一の「操作への返事」。
 *    装飾のためのアニメーションは置かない
 *  - **段階が上がった瞬間だけ**少し大きく弾ませる。数字やレベルアップ表示は出さない（DESIGN §2）
 *  - 端末の「視差効果を減らす」がONなら全部止める。止めても絵として成立する
 *
 * 実装は transform / opacity のみをネイティブドライバで動かす。
 * SVGの中の値（半径や座標）はアニメーションさせない（JSスレッドに毎フレーム乗るため）。
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import GutCharacter from './GutCharacter';
import { useBlink, useBounce, useOscillation, useReducedMotion, useRotation } from '../lib/motion';
import { colors } from '../lib/theme';
import type { Stage } from '../lib/types';

export type GutCharacterLiveProps = {
  stage: Stage;
  floraCount?: number;
  size?: number;
  /**
   * この値が変わるたびに1回だけ弾む。記録した回数を渡す想定。
   * （「記録した」というイベントではなく値の変化で駆動するので、再マウントでも暴発しない）
   */
  reactKey?: number;
  /** 読み上げ用の説明。画像に相当するものなので必ず渡す */
  label: string;
};

/** 段階ごとの動きの強さ。低い段階は「眠っている」ので動かさない */
const IDLE = {
  1: { breath: 4200, scale: 0.012, float: 2, dots: 0 },
  2: { breath: 3800, scale: 0.018, float: 3, dots: 60000 },
  3: { breath: 3200, scale: 0.024, float: 4, dots: 48000 },
  4: { breath: 2800, scale: 0.03, float: 5, dots: 38000 },
  5: { breath: 2400, scale: 0.036, float: 6, dots: 30000 },
} as const;

export default function GutCharacterLive({
  stage,
  floraCount = 0,
  size = 220,
  reactKey = 0,
  label,
}: GutCharacterLiveProps) {
  const reduced = useReducedMotion();
  const animate = !reduced;
  const idle = IDLE[stage];

  const breath = useOscillation(idle.breath, animate);
  // 浮遊は呼吸と周期をずらす。同期すると機械的な上下運動に見える
  const float = useOscillation(Math.round(idle.breath * 1.35), animate, 400);
  const orbit = useRotation(idle.dots || 60000, animate && idle.dots > 0 && floraCount >= 4);
  const blink = useBlink(animate && stage >= 2);
  const { value: bounce, trigger: triggerBounce } = useBounce(animate);

  // 記録したときの反応。初回マウントでは弾ませない（開いた瞬間に跳ねると理由が伝わらない）
  const firstReact = useRef(true);
  useEffect(() => {
    if (firstReact.current) {
      firstReact.current = false;
      return;
    }
    triggerBounce();
  }, [reactKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 段階が上がった瞬間だけ、少し大きめに弾ませる
  const prevStage = useRef(stage);
  useEffect(() => {
    if (stage > prevStage.current) triggerBounce();
    prevStage.current = stage;
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = Animated.add(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + idle.scale] }),
    bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] })
  );
  const translateY = Animated.add(
    float.interpolate({ inputRange: [0, 1], outputRange: [idle.float / 2, -idle.float / 2] }),
    bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] })
  );

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* まわりの菌の公転。本体と別レイヤーにして、呼吸とは独立に回す */}
      <Animated.View
        style={[
          styles.layer,
          {
            transform: [
              { rotate: orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <GutCharacter stage={stage} floraCount={floraCount} size={size} bodyHidden />
      </Animated.View>

      {/* 本体。呼吸（scale）＋浮遊（translateY）＋記録の反応（bounce） */}
      <Animated.View
        style={[styles.layer, { transform: [{ translateY }, { scale }] }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        <GutCharacter stage={stage} floraCount={0} size={size} blink={blink} />
      </Animated.View>

      {/* 段階5のときだけ、ゆっくり明滅する光。1枚だけに絞る */}
      {stage === 5 ? <Sparkle enabled={animate} size={size} /> : null}
    </View>
  );
}

function Sparkle({ enabled, size }: { enabled: boolean; size: number }) {
  const pulse = useOscillation(2600, enabled, 200);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          left: size * 0.74,
          top: size * 0.22,
          opacity: enabled ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] }) : 0.6,
          transform: [
            { scale: enabled ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) : 1 },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentSoft,
  },
});
