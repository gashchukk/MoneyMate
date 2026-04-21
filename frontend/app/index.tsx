import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';

/**
 * Single entry: avoids loading (tabs) before we know auth state, which caused
 * 401 → clearSession → /auth loops and a flashing login screen.
 */
export default function Index() {
  const [dest, setDest] = useState<'tabs' | 'auth' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (alive) setDest(token ? 'tabs' : 'auth');
      } catch {
        if (alive) setDest('auth');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (dest === null) return;
    void SplashScreen.hideAsync();
  }, [dest]);

  if (dest === null) return null;
  if (dest === 'tabs') return <Redirect href="/(tabs)" />;
  return <Redirect href="/auth" />;
}
