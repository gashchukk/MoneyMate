// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import FontAwesome from '@expo/vector-icons/FontAwesome';


export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {/* Home / Spendings */}
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Spendings',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="money-check-dollar" size={24} color={color} />
          ),
        }}
      />

      {/* Accounts */}
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="money-bills" size={24} color={color} />
          ),
        }}
      />

      {/* Settings */}
      <Tabs.Screen
        name="settings/index"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <FontAwesome name="gear" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
