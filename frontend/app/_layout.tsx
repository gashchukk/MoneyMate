// app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { AccountsProvider } from '@/context/AccountsContext';
import { SettingsProvider } from '@/context/SettingsContext';

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <AccountsProvider>
        <SettingsProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SettingsProvider>
      </AccountsProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
