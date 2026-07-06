import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "../api";
import { styles } from "../theme";
import { ThemeToggle } from "../ui";

export function LoginScreen({ onLogin, theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin");       // "signin" | "forgot"
  const [email, setEmail] = useState("nurse@demo.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next) { setMode(next); setError(""); setInfo(""); }

  async function submit() {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signin") {
        const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
        onLogin(data.token, data.user);
      } else {
        const data = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
        setInfo((data && data.message) || "If an account exists, a reset link is on its way. Open it on this device to set a new password.");
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <View style={styles.loginWrap}>
      <View style={styles.loginTheme}><ThemeToggle theme={theme} onToggle={onToggleTheme} /></View>
      <View style={styles.loginCard}>
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
          <Text style={styles.brandTitle}>Mirai</Text>
        </View>
        <Text style={styles.muted}>{mode === "signin" ? "Every shift, in sync" : "Enter your email and we'll send a reset link"}</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {mode === "signin" ? (<>
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
        </>) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.note}>{info}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Send reset link"}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => switchMode(mode === "signin" ? "forgot" : "signin")}>
          <Text style={styles.linkBtn}>{mode === "signin" ? "Forgot password?" : "‹ Back to sign in"}</Text>
        </TouchableOpacity>
        {mode === "signin" ? <Text style={styles.hint}>Demo: nurse@demo.com · Password123!</Text> : null}
      </View>
    </View>
  );
}
