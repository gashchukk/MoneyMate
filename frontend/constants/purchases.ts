import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};

/**
 * Public SDK keys from RevenueCat (safe in client). Use platform-specific keys in production.
 * `expo.extra` or EXPO_PUBLIC_REVENUECAT_IOS / EXPO_PUBLIC_REVENUECAT_ANDROID.
 */
const iosKey =
  (extra.revenueCatIosApiKey as string) ||
  (extra.revenueCatApiKey as string) ||
  process.env.EXPO_PUBLIC_REVENUECAT_IOS ||
  '';
const androidKey =
  (extra.revenueCatAndroidApiKey as string) ||
  (extra.revenueCatApiKey as string) ||
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID ||
  '';

export const REVENUECAT_API_KEY =
  Platform.OS === 'ios' ? iosKey : Platform.OS === 'android' ? androidKey : '';

/**
 * Entitlement identifier in RevenueCat (not the display name).
 * Create "MoneyMate Pro" in the dashboard with identifier `moneymate_pro`, or set EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID.
 */
export const MONEYMATE_PRO_ENTITLEMENT_ID =
  (extra.revenueCatEntitlementId as string) ||
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ||
  'moneymate_pro';

/**
 * Store product identifiers — must match App Store Connect, Google Play, and RevenueCat products.
 * Attach all three to a single offering; map packages (monthly / annual / lifetime) in the dashboard.
 */
export const RC_STORE_PRODUCT_IDS = {
  monthly: 'monthly',
  yearly: 'yearly',
  lifetime: 'lifetime',
} as const;
