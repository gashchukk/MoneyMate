import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { useAppSettings, t } from '@/components/AppContext';
import { BRAND } from '@/constants/brand';

function TabsWithContext() {
  const { language } = useAppSettings();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: '#bbb',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          height: 82,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('transactions', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      {/* ── Centre scan tab ── */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused }) => (
            <View style={scanBtnStyles.wrapper}>
              <View style={[scanBtnStyles.btn, focused && scanBtnStyles.btnActive]}>
                <Text style={scanBtnStyles.icon}>📷</Text>
              </View>
            </View>
          ),
          tabBarLabel: () => <Text style={scanBtnStyles.label}>Scan</Text>,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: t('accounts', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={{ opacity: focused ? 1 : 0.4 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}


const scanBtnStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginTop: -18 },
  btn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: BRAND,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
    borderWidth: 3, borderColor: '#fff',
  },
  btnActive: { backgroundColor: '#6b1212' },
  icon: { fontSize: 24 },
  label: { fontSize: 10, fontWeight: '700', color: BRAND, marginTop: 4 },
});

export default function TabLayout() {
  return <TabsWithContext />;
}