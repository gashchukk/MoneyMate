import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  StatusBar,
  Modal,
} from "react-native";
import { API_BASE_URL } from '@/constants/api';
import { BRAND, BRAND_LIGHT, BRAND_MID } from '@/constants/brand';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';

const extra = Constants.expoConfig?.extra ?? {};

GoogleSignin.configure({
  iosClientId: extra.googleClientIdIos ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
  webClientId: extra.googleClientIdWeb ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
});
// ─── TYPES ───────────────────────────────────────────────────────────────────
type Mode = "login" | "signup";

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface UserResponse {
  id: number;
  email: string;
  created_at: number;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login failed");
  return data;
}

async function apiSignup(email: string, password: string): Promise<UserResponse> {
  const res = await fetch(`${API_BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
        "email": email,
        "password": password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Signup failed");
  return data;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);


  // Animations
  const tabAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token returned from Google.');

      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Google login failed');

      await SecureStore.setItemAsync('access_token', data.access_token);
      await SecureStore.setItemAsync('refresh_token', data.refresh_token);
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert(t('google_login_failed'), e.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    Animated.spring(tabAnim, {
      toValue: next === "login" ? 0 : 1,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    setMode(next);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const openForgot = () => {
    setForgotEmail('');
    setResetCode('');
    setResetPassword('');
    setForgotStep('email');
    setShowForgot(true);
  };

  const handleSendCode = async () => {
    const em = forgotEmail.trim();
    if (!em || !em.includes('@')) {
      Alert.alert(t('invalid_email'), t('please_enter_valid_email'));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send code');
      setForgotStep('code');
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetCode.length !== 6) {
      Alert.alert(t('error'), t('reset_code_label') + ': 6 digits required');
      return;
    }
    if (resetPassword.length < 8) {
      Alert.alert(t('weak_password'), t('password_min_8'));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), code: resetCode.trim(), new_password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed');
      setShowForgot(false);
      Alert.alert('✅', t('password_reset_success'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      shake();
      Alert.alert(t('missing_fields'), t('please_fill_all_fields'));
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      shake();
      Alert.alert(t('password_mismatch'), t('passwords_do_not_match'));
      return;
    }
    if (password.length < 8) {
      shake();
      Alert.alert(t('weak_password'), t('password_min_8'));
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const data = await apiLogin(email.trim(), password);
        await SecureStore.setItemAsync('access_token', data.access_token);
        await SecureStore.setItemAsync('refresh_token', data.refresh_token);
        router.replace('/(tabs)');
      } else {
        await apiSignup(email.trim(), password);
        Alert.alert(t('account_created'), t('please_log_in_continue'));
        switchMode("login");
      }
    } catch (err: any) {
      shake();
      Alert.alert(t('error'), err.message || t('something_went_wrong'));
    } finally {
      setLoading(false);
    }
  };

  const tabIndicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["2%", "50%"],
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── SOFT BACKGROUND BLOBS ── */}
        <View style={styles.blobTopRight} />
        <View style={styles.blobBottomLeft} />

        {/* ── LOGO + HEADER ── */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>MoneyMate</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
        </View>

        {/* ── CARD ── */}
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          {/* Tab switcher */}
          <View style={styles.tabBar}>
            <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft }]} />
            <TouchableOpacity style={styles.tab} onPress={() => switchMode("login")}>
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                {t('log_in_tab')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode("signup")}>
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                {t('sign_up_tab')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.label}>{t('email_label')}</Text>
            <TextInput
              style={[styles.input, focusedField === "email" && styles.inputFocused]}
              placeholder={t('placeholder_email')}
              placeholderTextColor="#bbb"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
            />

            <Text style={styles.label}>{t('password_label')}</Text>
            <View style={[styles.passwordRow, focusedField === "password" && styles.passwordRowFocused]}>
              <TextInput
                style={styles.inputFlex}
                placeholder={t('min_8_characters')}
                placeholderTextColor="#bbb"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>

            {mode === "signup" && (
              <>
                <Text style={styles.label}>{t('confirm_password_label')}</Text>
                <TextInput
                  style={[styles.input, focusedField === "confirm" && styles.inputFocused]}
                  placeholder={t('placeholder_repeat_password')}
                  placeholderTextColor="#bbb"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                />
              </>
            )}

            {mode === "login" && (
              <TouchableOpacity style={styles.forgotBtn} onPress={openForgot}>
                <Text style={styles.forgotText}>{t('forgot_password')}</Text>
              </TouchableOpacity>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === "login" ? t('log_in_tab') : t('create_account')}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('or_divider')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && styles.submitBtnDisabled]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.85}
            >
              {googleLoading ? (
                <ActivityIndicator color="#444" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleText}>{t('continue_with_google')}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Switch mode hint */}
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {mode === "login" ? t('dont_have_account') + ' ' : t('already_have_account') + ' '}
              </Text>
              <TouchableOpacity onPress={() => switchMode(mode === "login" ? "signup" : "login")}>
                <Text style={styles.switchLink}>
                  {mode === "login" ? t('sign_up_link') : t('log_in_link')}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>

        <Text style={styles.footer}>{t('terms_privacy')}</Text>
      </ScrollView>

      {/* ── Forgot Password Modal ── */}
      <Modal visible={showForgot} transparent animationType="slide" onRequestClose={() => setShowForgot(false)}>
        <KeyboardAvoidingView style={styles.forgotOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.forgotCard}>
            <Text style={styles.forgotModalTitle}>{t('forgot_password')}</Text>

            {forgotStep === 'email' ? (
              <>
                <Text style={styles.forgotModalSub}>{t('enter_reset_email')}</Text>
                <Text style={styles.label}>{t('email_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('placeholder_email')}
                  placeholderTextColor="#bbb"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, forgotLoading && styles.submitBtnDisabled]}
                  onPress={handleSendCode}
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitText}>{t('send_reset_code')}</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.forgotModalSub}>{t('reset_code_sent_msg', { email: forgotEmail })}</Text>
                <Text style={styles.label}>{t('reset_code_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('reset_code_placeholder')}
                  placeholderTextColor="#bbb"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetCode}
                  onChangeText={setResetCode}
                />
                <Text style={styles.label}>{t('new_password_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('min_8_characters')}
                  placeholderTextColor="#bbb"
                  secureTextEntry
                  autoCapitalize="none"
                  value={resetPassword}
                  onChangeText={setResetPassword}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, forgotLoading && styles.submitBtnDisabled]}
                  onPress={handleResetPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitText}>{t('set_new_password')}</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.forgotBackBtn} onPress={() => setShowForgot(false)}>
              <Text style={styles.forgotBackText}>{t('back_to_login')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const BG = "#FAFAFA";
const CARD_BG = "#FFFFFF";
const TEXT = "#1a1a1a";
const TEXT_MUTED = "#888";
const BORDER = "#e8e8e8";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // Decorative blobs
  blobTopRight: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: BRAND,
    opacity: 0.06,
  },
  blobBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: BRAND,
    opacity: 0.04,
  },

  // Logo
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 14,
  },
  appName: {
    fontSize: 30,
    fontWeight: "800",
    color: BRAND,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 4,
    letterSpacing: 0.1,
  },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: BRAND_LIGHT,
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    top: 4,
    width: "48%",
    height: "100%",
    backgroundColor: BRAND,
    borderRadius: 11,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: BRAND,
    opacity: 0.5,
  },
  tabTextActive: {
    color: "#fff",
    opacity: 1,
  },

  // Labels & Inputs
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: TEXT_MUTED,
    marginBottom: 7,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: TEXT,
    borderWidth: 1.5,
    borderColor: BORDER,
    marginBottom: 18,
  },
  inputFocused: {
    borderColor: BRAND,
    backgroundColor: BRAND_LIGHT,
  },
  inputFlex: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    paddingVertical: 14,
    paddingLeft: 16,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    marginBottom: 18,
    paddingRight: 8,
  },
  passwordRowFocused: {
    borderColor: BRAND,
    backgroundColor: BRAND_LIGHT,
  },
  eyeBtn: {
    padding: 10,
  },
  eyeIcon: {
    fontSize: 17,
  },

  // Forgot
  forgotBtn: {
    alignSelf: "flex-end",
    marginTop: -8,
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 13,
    color: BRAND,
    fontWeight: "600",
  },

  // Submit
  submitBtn: {
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // Switch mode
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  switchText: {
    fontSize: 14,
    color: TEXT_MUTED,
  },
  switchLink: {
    fontSize: 14,
    color: BRAND,
    fontWeight: "700",
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: TEXT_MUTED,
  },

  // Google button
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: "800",
    color: "#4285F4",
  },
  googleText: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
  },

  // Footer
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#bbb",
    marginTop: 28,
    lineHeight: 16,
  },

  // Forgot password modal
  forgotOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  forgotCard: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 44,
    borderWidth: 1,
    borderColor: BORDER,
  },
  forgotModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    marginBottom: 8,
  },
  forgotModalSub: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 24,
  },
  forgotBackBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotBackText: {
    fontSize: 14,
    color: BRAND,
    fontWeight: '600',
  },
});