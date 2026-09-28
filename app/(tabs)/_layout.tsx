import React from 'react';
import { Tabs } from 'expo-router';
import TabIcon from '../../components/TabIcon';
import { colors, type } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { ...type.headline },
        sceneStyle: { backgroundColor: colors.bg },
        // 選択中だけ濃い緑にする。塗り／線の切り替えはしない（階層が読めなくなる）
        tabBarActiveTintColor: colors.accentStrong,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: '記録',
          tabBarIcon: ({ color }) => <TabIcon name="log" color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'ふりかえり',
          tabBarIcon: ({ color }) => <TabIcon name="review" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dex"
        options={{
          title: '図鑑',
          tabBarIcon: ({ color }) => <TabIcon name="dex" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}
