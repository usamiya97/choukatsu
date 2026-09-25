import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../lib/store';
import { colors, type } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Gate />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/**
 * 初回だけ診断へ送る。スキップも「済み」として扱い、二度は出さない
 * （毎回出すと入力の壁になる。診断は提案の初期値を作るためだけのもの）。
 */
function Gate() {
  const { ready, profile } = useStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const onOnboarding = segments[0] === 'onboarding';
    if (!profile.diagnosed && !onOnboarding) router.replace('/onboarding');
  }, [ready, profile.diagnosed, segments, router]);

  if (!ready) {
    // 起動直後の読み込み。何も出さないと固まったように見えるので必ず出す
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel="記録を読み込んでいます"
          accessibilityRole="progressbar"
        />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { ...type.headline },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'はじめの10問', presentation: 'modal' }} />
      <Stack.Screen name="food/[label]" options={{ title: '食品のくわしい話' }} />
    </Stack>
  );
}
