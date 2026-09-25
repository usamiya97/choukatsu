/**
 * アニメーションの共通部品。
 *
 * ライブラリを足していない（Animated + ネイティブドライバ）のは、
 * ここで必要なのが transform / opacity のループとワンショットだけで、
 * ジェスチャ連動が無いため。reanimated を入れる価値が出るのは
 * 指の動きに追従させるものを作るときで、v1にはまだ無い。
 *
 * **端末で「視差効果を減らす」がONのときは全部止める。** 止めた状態でも
 * 画面が成立する（静止した絵として正しく見える）ことを前提に組んでいる。
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { motion } from './theme';

/** 端末の「動きを減らす」設定。変更にも追従する */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * 0→1→0 を往復し続ける値。呼吸・浮遊・ゆらぎに使う。
 * enabled=false のときは 0 のまま（＝静止）。
 */
export function useOscillation(durationMs: number, enabled: boolean, delayMs = 0): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: durationMs / 2,
          delay: delayMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [durationMs, enabled, delayMs, value]);
  return value;
}

/** 0→1 を一定速度で回り続ける値。まわりの菌の公転に使う */
export function useRotation(durationMs: number, enabled: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [durationMs, enabled, value]);
  return value;
}

/**
 * 記録したときの一回だけの反応。
 * 「操作に応えた」ことを見せるためのもので、装飾ではない。
 */
export function useBounce(enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  const trigger = () => {
    if (!enabled) return;
    value.setValue(0);
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: motion.fast,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(value, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
    ]).start();
  };
  return { value, trigger };
}

/**
 * まばたき。`true` の間だけ目を閉じる。
 * 3〜6秒おきに120ms閉じる（人のまばたきに近い間隔にすると生きて見える）。
 */
export function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setClosed(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setClosed(true);
        timer = setTimeout(() => {
          setClosed(false);
          schedule();
        }, 120);
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [enabled]);
  return closed;
}

/**
 * 記録の確定と達成のときだけ触覚を返す。
 * 毎タップ震わせると「うるさいアプリ」になるので、この2か所に限定する。
 * 端末が未対応でも失敗させない（Webや一部Androidでは無効）。
 */
export const haptics = {
  record: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  achieved: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
