/**
 * お通じを記録する時刻を選ぶ（初回の10問のあと・設定画面の両方で使う）。
 *
 * **時刻ピッカーを出さない。** g入力を置かないのと同じ理由で、
 * 「何時何分がよいか」を決められる人はいないので、生活の区切りの名前で選ばせる
 * （@react-native-community/datetimepicker を足す理由もここには無い）。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './Icons';
import { REMINDER_OPTIONS } from '../lib/stool';
import { colors, hit, radius, space, type } from '../lib/theme';

export default function ReminderPicker({
  value,
  onChange,
  allowNone = false,
}: {
  /** いまの時刻('HH:MM')。null は「決めていない」 */
  value: string | null;
  onChange: (at: string | null) => void;
  /** 「決めない」を出すか（設定では出す。初回は「あとで決める」の導線が別にある） */
  allowNone?: boolean;
}) {
  const row = (at: string | null, label: string, sub: string | null) => {
    const on = value === at;
    return (
      <Pressable
        key={label}
        style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.rowPressed]}
        onPress={() => onChange(at)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, checked: on }}
        accessibilityLabel={sub ? `${label} ${sub} に記録する` : label}
        android_ripple={{ color: colors.tapPressed }}
      >
        <View style={styles.texts}>
          <Text style={[styles.label, on && styles.textOn]}>{label}</Text>
          {sub ? <Text style={[styles.sub, on && styles.textOn]}>{sub}</Text> : null}
        </View>
        {on ? <CheckIcon color="#FFFFFF" /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      {REMINDER_OPTIONS.map((o) => row(o.at, o.label, o.at))}
      {allowNone ? row(null, '決めない', '声をかけません') : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.tap,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowOn: { backgroundColor: colors.accentStrong },
  rowPressed: { opacity: 0.9 },
  texts: { flex: 1, gap: 2 },
  label: { ...type.body },
  sub: { ...type.tiny },
  textOn: { color: '#FFFFFF', fontWeight: '700' },
});
