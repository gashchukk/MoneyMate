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
} from "react-native";
import { API_BASE_URL } from '@/constants/api';
import { BRAND, BRAND_LIGHT, BRAND_MID } from '@/constants/brand';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
// ─── TYPES ───────────────────────────────────────────────────────────────────
type Mode = "login" | "signup";

interface AuthResponse {
  access_token: string;
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
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Animations
  const tabAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

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

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      shake();
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      shake();
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      shake();
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const data = await apiLogin(email.trim(), password);
        await SecureStore.setItemAsync('access_token', data.access_token);
        router.replace('/(tabs)');
      } else {
        await apiSignup(email.trim(), password);
        Alert.alert("Account created! 🎉", "Please log in to continue.");
        switchMode("login");
      }
    } catch (err: any) {
      shake();
      Alert.alert("Oops", err.message || "Something went wrong.");
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
          <Text style={styles.tagline}>Your finances, finally clear.</Text>
        </View>

        {/* ── CARD ── */}
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          {/* Tab switcher */}
          <View style={styles.tabBar}>
            <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft }]} />
            <TouchableOpacity style={styles.tab} onPress={() => switchMode("login")}>
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                Log In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode("signup")}>
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, focusedField === "email" && styles.inputFocused]}
              placeholder="you@example.com"
              placeholderTextColor="#bbb"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
            />

            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, focusedField === "password" && styles.passwordRowFocused]}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Min. 8 characters"
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
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={[styles.input, focusedField === "confirm" && styles.inputFocused]}
                  placeholder="Repeat your password"
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
              <TouchableOpacity style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot password?</Text>
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
                  {mode === "login" ? "Log In" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Switch mode hint */}
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              </Text>
              <TouchableOpacity onPress={() => switchMode(mode === "login" ? "signup" : "login")}>
                <Text style={styles.switchLink}>
                  {mode === "login" ? "Sign up" : "Log in"}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>

        <Text style={styles.footer}>By continuing, you agree to our Terms & Privacy Policy.</Text>
      </ScrollView>
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

  // Footer
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#bbb",
    marginTop: 28,
    lineHeight: 16,
  },
});