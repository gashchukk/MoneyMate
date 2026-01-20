import { Tabs } from 'expo-router';
import React from 'react';

import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
export default function TabLayout() {
  return (
    <Tabs screenOptions={{headerShown: false}}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Spendings',
          tabBarIcon: ({ color }) => <FontAwesome6 name="money-check-dollar" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color }) => <FontAwesome6 name="money-bills" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
