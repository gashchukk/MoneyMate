import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { BRAND } from '@/constants/brand';
import { REVENUECAT_API_KEY, RC_STORE_PRODUCT_IDS } from '@/constants/purchases';
import { configureRevenueCat, logInRevenueCat } from '@/lib/revenuecat';
import {
  getMoneyMateCustomerInfo,
  presentMoneyMateCustomerCenter,
  presentMoneyMatePaywall,
  sdkHasMoneyMateProEntitlement,
} from '@/lib/revenuecatUi';
import { getUserIdFromJwt } from '@/utils/jwt';

type Tier = 'basic' | 'premium';

interface SubscriptionInfo {
  tier: Tier;
  receipt_scans_used_this_month: number;
  receipt_scan_limit: number | null;
  premium_expires_at: number | null;
}

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sdkPro, setSdkPro] = useState<boolean | null>(null);
  const [customerDebug, setCustomerDebug] = useState<string | null>(null);

  const syncBackend = async () => {
    const data = await apiFetch('/me/subscription/sync', { method: 'POST' });
    setInfo(data as SubscriptionInfo);
  };

  const load = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        router.replace('/auth');
        return;
      }
      const uid = getUserIdFromJwt(token);
      if (uid != null) {
        await configureRevenueCat();
        await logInRevenueCat(String(uid));
      }
      const data = await apiFetch('/me/subscription');
      setInfo(data as SubscriptionInfo);
      if (REVENUECAT_API_KEY && Platform.OS !== 'web') {
        const [hasPro, snap] = await Promise.all([
          sdkHasMoneyMateProEntitlement(),
          __DEV__ ? getMoneyMateCustomerInfo() : Promise.resolve(null),
        ]);
        setSdkPro(hasPro);
        if (snap) {
          setCustomerDebug(JSON.stringify(snap, null, 2));
        }
      }
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message ?? t('something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleOpenPaywall = async () => {
    setBusy(true);
    try {
      const { success } = await presentMoneyMatePaywall();
      if (success) {
        await syncBackend();
        const onDevice = await sdkHasMoneyMateProEntitlement();
        setSdkPro(onDevice);
        Alert.alert(t('done'), t('subscription_active'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), e?.message ?? t('something_went_wrong'));
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!REVENUECAT_API_KEY || Platform.OS === 'web') {
      Alert.alert(t('error'), t('revenuecat_not_configured'));
      return;
    }
    setBusy(true);
    try {
      const { default: Purchases } = await import('react-native-purchases');
      await Purchases.restorePurchases();
      await syncBackend();
      setSdkPro(await sdkHasMoneyMateProEntitlement());
      Alert.alert(t('done'), t('purchases_restored'));
    } catch (e: any) {
      Alert.alert(t('error'), e?.message ?? t('something_went_wrong'));
    } finally {
      setBusy(false);
    }
  };

  const handleCustomerCenter = async () => {
    setBusy(true);
    try {
      await presentMoneyMateCustomerCenter({
        onRestoreCompleted: async () => {
          await syncBackend();
          setSdkPro(await sdkHasMoneyMateProEntitlement());
        },
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !info) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  const isPremium = info?.tier === 'premium';
  const limit = info?.receipt_scan_limit;
  const used = info?.receipt_scans_used_this_month ?? 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.backText}>{t('back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('moneymate_pro_title')}</Text>
      <Text style={styles.sub}>
        {isPremium ? t('moneymate_pro_active') : t('moneymate_pro_subtitle')}
      </Text>

      {sdkPro != null && (
        <Text style={styles.sdkHint}>
          {t('sdk_entitlement_hint', { active: sdkPro ? t('yes') : t('no') })}
        </Text>
      )}

      {!isPremium && limit != null && (
        <Text style={styles.usage}>
          {t('receipt_scans_usage', { used, limit })}
        </Text>
      )}

      {isPremium && info?.premium_expires_at != null && (
        <Text style={styles.usage}>
          {(() => {
            const ts = info.premium_expires_at!;
            const ms = ts < 1e12 ? ts * 1000 : ts;
            return t('premium_renews', { date: new Date(ms).toLocaleDateString() });
          })()}
        </Text>
      )}

      {!REVENUECAT_API_KEY && (
        <Text style={styles.warn}>{t('revenuecat_not_configured')}</Text>
      )}

      <Text style={styles.productHint}>
        {t('rc_products_hint', {
          monthly: RC_STORE_PRODUCT_IDS.monthly,
          yearly: RC_STORE_PRODUCT_IDS.yearly,
          lifetime: RC_STORE_PRODUCT_IDS.lifetime,
        })}
      </Text>

      {REVENUECAT_API_KEY && Platform.OS !== 'web' ? (
        <>
          {!isPremium && (
            <TouchableOpacity
              style={[styles.buyBtn, busy && styles.buyBtnDisabled]}
              disabled={busy}
              onPress={handleOpenPaywall}
            >
              <Text style={styles.buyBtnText}>{t('view_plans_paywall')}</Text>
            </TouchableOpacity>
          )}

          {isPremium && (
            <TouchableOpacity
              style={[styles.buyBtn, styles.manageBtn, busy && styles.buyBtnDisabled]}
              disabled={busy}
              onPress={handleCustomerCenter}
            >
              <Text style={styles.buyBtnText}>{t('manage_subscription_center')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryBtn, busy && styles.buyBtnDisabled]}
            onPress={handleRestore}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>{t('restore_purchases')}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {__DEV__ && customerDebug ? (
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>{t('customer_info_debug')}</Text>
          <Text selectable style={styles.debugText}>
            {customerDebug}
          </Text>
        </View>
      ) : null}

      {busy && (
        <View style={styles.overlayBusy}>
          <ActivityIndicator color={BRAND} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backRow: { marginBottom: 12, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: BRAND, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 8 },
  sub: { fontSize: 15, color: '#555', marginBottom: 8 },
  sdkHint: { fontSize: 12, color: '#888', marginBottom: 12 },
  usage: { fontSize: 14, color: '#333', marginBottom: 16 },
  warn: { color: '#a60', marginBottom: 12 },
  productHint: { fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 18 },
  buyBtn: {
    backgroundColor: BRAND,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  manageBtn: { backgroundColor: '#333' },
  buyBtnDisabled: { opacity: 0.6 },
  buyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: BRAND, fontSize: 15, fontWeight: '600' },
  overlayBusy: { marginTop: 16 },
  debugBox: { marginTop: 24, padding: 12, backgroundColor: '#eee', borderRadius: 8 },
  debugTitle: { fontWeight: '700', marginBottom: 8, fontSize: 12 },
  debugText: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
