import { Tabs } from 'expo-router';
import { AppProvider, useAppSettings, t } from '@/components/AppContext';

function TabsWithContext() {
  const { language } = useAppSettings();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B1A1A',
        tabBarInactiveTintColor: '#bbb',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('transactions', language),
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="💳" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: t('accounts', language),
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🏦" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings', language),
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="⚙️" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text, View } = require('react-native');
  return (
    <View style={{ opacity: color === '#8B1A1A' ? 1 : 0.4 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <AppProvider>
      <TabsWithContext />
    </AppProvider>
  );
}
