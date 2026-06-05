import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSettings, t } from '@/components/AppContext';
import { BRAND } from '@/constants/brand';

function TabsWithContext() {
  const { language } = useAppSettings();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      key={language}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: '#bbb',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          height: 66 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('analytics_title', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          href: null,
        }}
      />
      {/* ── Centre scan tab ── */}
      <Tabs.Screen
        name="scan"
        options={{
          title: t('scan_tab', language),
          tabBarIcon: ({ focused }) => (
            <View style={scanBtnStyles.wrapper}>
              <View style={[scanBtnStyles.btn, focused && scanBtnStyles.btnActive]}>
                <Text style={scanBtnStyles.icon}>📷</Text>
              </View>
            </View>
          ),
          tabBarLabel: () => <Text style={scanBtnStyles.label}>{t('scan_tab', language)}</Text>,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('transactions', language),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" focused={focused} />,
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
          href: null,
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