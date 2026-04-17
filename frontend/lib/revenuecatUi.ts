/**
 * RevenueCat Paywall UI + Customer Center (react-native-purchases-ui).
 * Requires a development build — Expo Go uses preview/no-op behavior for some APIs.
 */

import { Platform } from 'react-native';
import { MONEYMATE_PRO_ENTITLEMENT_ID, REVENUECAT_API_KEY } from '@/constants/purchases';

export type CustomerInfoSnapshot = {
  userId: string | null;
  activeEntitlements: string[];
  allPurchaseDates: Record<string, string | null>;
};

function purchasesUnavailable(): boolean {
  return Platform.OS === 'web' || !REVENUECAT_API_KEY;
}

/** Latest CustomerInfo from the native SDK (device-side truth before server sync). */
export async function getMoneyMateCustomerInfo(): Promise<CustomerInfoSnapshot | null> {
  if (purchasesUnavailable()) return null;
  try {
    const { default: Purchases } = await import('react-native-purchases');
    const info = await Purchases.getCustomerInfo();
    return {
      userId: info.originalAppUserId ?? null,
      activeEntitlements: Object.keys(info.entitlements.active ?? {}),
      allPurchaseDates: (info.allPurchaseDates ?? {}) as Record<string, string | null>,
    };
  } catch {
    return null;
  }
}

/** Whether the MoneyMate Pro entitlement is active according to the SDK. */
export async function sdkHasMoneyMateProEntitlement(): Promise<boolean> {
  if (purchasesUnavailable()) return false;
  try {
    const { default: Purchases } = await import('react-native-purchases');
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[MONEYMATE_PRO_ENTITLEMENT_ID] != null;
  } catch {
    return false;
  }
}

/** Result is true when user purchased or restored; call your backend sync after. */
export async function presentMoneyMatePaywall(): Promise<{ success: boolean; userCancelled: boolean }> {
  if (purchasesUnavailable()) return { success: false, userCancelled: false };
  try {
    const { default: RevenueCatUI, PAYWALL_RESULT } = await import('react-native-purchases-ui');
    const result = await RevenueCatUI.presentPaywall();
    const success =
      result === PAYWALL_RESULT.PURCHASED ||
      result === PAYWALL_RESULT.RESTORED;
    const userCancelled = result === PAYWALL_RESULT.CANCELLED;
    return { success, userCancelled };
  } catch (e: any) {
    return { success: false, userCancelled: Boolean(e?.userCancelled) };
  }
}

/** Presents paywall only if MoneyMate Pro is not already active on device. */
export async function presentMoneyMatePaywallIfNeeded(): Promise<{ success: boolean; userCancelled: boolean }> {
  if (purchasesUnavailable()) return { success: false, userCancelled: false };
  try {
    const { default: RevenueCatUI, PAYWALL_RESULT } = await import('react-native-purchases-ui');
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: MONEYMATE_PRO_ENTITLEMENT_ID,
    });
    const success =
      result === PAYWALL_RESULT.PURCHASED ||
      result === PAYWALL_RESULT.RESTORED;
    const userCancelled = result === PAYWALL_RESULT.CANCELLED;
    return { success, userCancelled };
  } catch (e: any) {
    return { success: false, userCancelled: Boolean(e?.userCancelled) };
  }
}

export type CustomerCenterHandlers = {
  onRestoreCompleted?: () => void | Promise<void>;
};

/** Modal Customer Center (manage subscription, restore, refunds on iOS, etc.). */
export async function presentMoneyMateCustomerCenter(handlers?: CustomerCenterHandlers): Promise<void> {
  if (purchasesUnavailable()) return;
  try {
    const { default: RevenueCatUI } = await import('react-native-purchases-ui');
    await RevenueCatUI.presentCustomerCenter({
      callbacks: {
        onRestoreCompleted: async () => {
          await handlers?.onRestoreCompleted?.();
        },
      },
    });
  } catch {
    /* */
  }
}
