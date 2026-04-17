import { Platform } from 'react-native';
import { REVENUECAT_API_KEY } from '@/constants/purchases';

let configured = false;

async function nativePurchases() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return import('react-native-purchases');
}

export async function configureRevenueCat(): Promise<void> {
  if (configured || !REVENUECAT_API_KEY) return;
  const mod = await nativePurchases();
  if (!mod) return;
  const { default: Purchases, LOG_LEVEL } = mod;
  Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  configured = true;
}

export async function logInRevenueCat(appUserId: string): Promise<void> {
  await configureRevenueCat();
  if (!configured) return;
  const mod = await nativePurchases();
  if (!mod) return;
  await mod.default.logIn(appUserId);
}

export async function logOutRevenueCat(): Promise<void> {
  if (!REVENUECAT_API_KEY) return;
  await configureRevenueCat();
  if (!configured) return;
  const mod = await nativePurchases();
  if (!mod) return;
  try {
    await mod.default.logOut();
  } catch {
    /* anonymous user etc. */
  }
}
