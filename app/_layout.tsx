// app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AccountsProvider } from '@/context/AccountsContext';
import { SettingsProvider } from '@/context/SettingsContext'; // <- new

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <SettingsProvider> {/* <- wrap here */}
        <AccountsProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AccountsProvider>
      </SettingsProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
