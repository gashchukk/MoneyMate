import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Small delay lets Expo Router finish mounting before redirecting
    const timer = setTimeout(async () => {
      try {
        // Uncomment when expo-secure-store is installed:
        // const { default: SecureStore } = await import('expo-secure-store');
        // const token = await SecureStore.getItemAsync('access_token');
        // if (token) {
        //   router.replace('/(tabs)');
        // } else {
        //   router.replace('/auth');
        // }

        // For now, go straight to auth:
        router.replace('/auth');
      } catch (e) {
        router.replace('/auth');
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}