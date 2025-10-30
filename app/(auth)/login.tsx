import { createDebugAPI, createEnhancedAPI } from "@/utils/api";
import { saveToken, saveUserid } from "@/utils/auth";
import { analyzeServerError, debugLoginPayloads } from "@/utils/debug";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import Toast from "react-native-toast-message";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  const router = useRouter();

  // Double-tap logo to enable debug mode
  const handleLogoPress = () => {
    setDebugMode(prev => !prev);
    Toast.show({
      type: 'info',
      text1: debugMode ? 'Debug mode disabled' : 'Debug mode enabled',
      text2: debugMode ? 'Normal login' : 'Testing all payload formats',
    });
  };

  const handleLogin = async () => {
    let hasError = false;

    if (!username) {
      setUsernameError(true);
      hasError = true;
    } else {
      setUsernameError(false);
    }

    if (!password) {
      setPasswordError(true);
      hasError = true;
    } else {
      setPasswordError(false);
    }

    if (hasError) return;

    setLoading(true);

    if (debugMode) {
      await runDebugLogin();
    } else {
      await runNormalLogin();
    }
  };

  const runNormalLogin = async () => {
    try {
      console.log("📄 Creating API instance for login...");
      const api = await createEnhancedAPI();
      
      const commonPayloads = [
        { userid: username, password },
        { username, password },
        { email: username, password },
        { login: username, password },
      ];

      let success = false;
      
      for (const [index, payload] of commonPayloads.entries()) {
        try {
          console.log(`🧪 Attempt ${index + 1}:`, JSON.stringify(payload));
          const res = await api.post("/login", payload);
          
          console.log("✅ Success with payload:", JSON.stringify(payload));
          console.log("🔥 Response:", res.data);

          if (res.data.status === "success") {
            await handleLoginSuccess(res.data);
            success = true;
            break;
          }
        } catch (err: any) {
          console.log(`❌ Failed with payload ${index + 1}:`, {
            status: err.response?.status,
            data: err.response?.data
          });
          continue;
        }
      }
      
      if (!success) {
        Toast.show({
          type: "error",
          text1: "Login failed",
          text2: "Please check username/password format OR check Database connection",
        });
      }
      
    } catch (err: any) {
      console.error("💥 Login error:", err);
      analyzeServerError(err);
      
      Toast.show({
        type: "error",
        text1: "Connection Error",
        text2: "Cannot connect to server. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const runDebugLogin = async () => {
    try {
      const api = await createDebugAPI();
      const payloads = debugLoginPayloads(username, password);
      
      console.log("🔍 DEBUG MODE: Testing all payload formats");
      
      const results = [];
      
      for (const [index, payload] of payloads.entries()) {
        try {
          console.log(`\n--- Testing Payload ${index + 1} ---`);
          console.log("Payload:", JSON.stringify(payload, null, 2));
          
          const res = await api.post("/login", payload);
          results.push({
            payloadIndex: index + 1,
            payload,
            success: true,
            response: res.data,
            status: res.status
          });
          
          console.log("✅ SUCCESS:", res.status, res.data);
          
          if (res.data.status === "success") {
            await handleLoginSuccess(res.data);
            break;
          }
          
        } catch (err: any) {
          results.push({
            payloadIndex: index + 1,
            payload,
            success: false,
            error: err.response?.data,
            status: err.response?.status
          });
          
          console.log("❌ FAILED:", err.response?.status, err.response?.data);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log("\n📊 DEBUG RESULTS SUMMARY:");
      results.forEach(result => {
        console.log(`Payload ${result.payloadIndex}: ${result.success ? '✅' : '❌'} ${result.status}`);
        if (!result.success) {
          console.log('  Error:', JSON.stringify(result.error, null, 2));
        }
      });
      
      if (!results.some(r => r.success && r.response?.status === "success")) {
        Toast.show({
          type: "error",
          text1: "Debug Complete",
          text2: "Check console for results. No successful login format found.",
        });
      }
      
    } catch (err: any) {
      console.error("💥 Debug mode error:", err);
      analyzeServerError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (data: any) => {
    await saveToken(data.token);
    await saveUserid(data.user_id);
    
    Toast.show({
      type: "success",
      text1: "Success",
      text2: "Welcome, Login successful",
    });
    
    setTimeout(() => {
      router.replace("/(main)");
    }, 300);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#C8E6C9" />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <LinearGradient
            colors={["#C8E6C9", "#A5D6A7"]}
            style={styles.header}
          >
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={handleLogoPress} style={styles.logoContainer}>
                <LinearGradient
                  colors={["#4CAF50", "#388E3C"]}
                  style={styles.logoGradient}
                >
                  <Ionicons name="shield-checkmark" size={36} color="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>
              
              <View style={styles.titleSection}>
                <Text style={styles.appTitle}>TRACKER</Text>
                <View style={styles.titleUnderline} />
                <Text style={styles.subtitle}>Stock tracking Managment </Text>
              </View>

              {debugMode && (
                <View style={styles.debugBadge}>
                  <View style={styles.debugDot} />
                  <Text style={styles.debugText}>DEBUG</Text>
                </View>
              )}
            </View>

            {/* Decorative Wave */}
            <View style={styles.waveContainer}>
              <View style={styles.wave} />
            </View>
          </LinearGradient>

          {/* Login Form Card */}
          <View style={styles.formContainer}>
            <View style={styles.formCard}>
              <LinearGradient
                colors={["#FFFFFF", "#F8F9FA"]}
                style={styles.cardGradient}
              >
                {/* Welcome Section */}
                <View style={styles.welcomeSection}>
                  <View style={styles.welcomeIcon}>
                    <Ionicons name="person-circle-outline" size={44} color="#4CAF50" />
                  </View>
                  <Text style={styles.welcomeTitle}>Welcome Back!</Text>
                  <Text style={styles.welcomeSubtitle}>
                    Sign in to continue to your account
                  </Text>
                </View>

                {/* Username Input */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>
                    {debugMode ? "Username / UserID / Email" : "Username"}
                  </Text>
                  <View style={[styles.inputWrapper, usernameError && styles.inputError]}>
                    <View style={styles.inputIcon}>
                      <Ionicons 
                        name="person-outline" 
                        size={20} 
                        color={usernameError ? "#C62828" : "#4CAF50"} 
                      />
                    </View>
                    <TextInput
                      value={username}
                      onChangeText={(text) => {
                        setUsername(text);
                        setUsernameError(false);
                      }}
                      placeholder={debugMode ? "Enter username, userid, or email" : "Enter your username"}
                      placeholderTextColor="#9E9E9E"
                      style={styles.textInput}
                      autoCapitalize="none"
                    />
                  </View>
                  {usernameError && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={14} color="#C62828" />
                      <Text style={styles.errorText}>Username is required</Text>
                    </View>
                  )}
                </View>

                {/* Password Input */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={[styles.inputWrapper, passwordError && styles.inputError]}>
                    <View style={styles.inputIcon}>
                      <Ionicons 
                        name="lock-closed-outline" 
                        size={20} 
                        color={passwordError ? "#C62828" : "#4CAF50"} 
                      />
                    </View>
                    <TextInput
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        setPasswordError(false);
                      }}
                      placeholder="Enter your password"
                      placeholderTextColor="#9E9E9E"
                      secureTextEntry={!showPassword}
                      style={styles.textInput}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color="#757575"
                      />
                    </TouchableOpacity>
                  </View>
                  {passwordError && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={14} color="#C62828" />
                      <Text style={styles.errorText}>Password is required</Text>
                    </View>
                  )}
                </View>

                {/* Login Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={styles.loginButton}
                >
                  <LinearGradient
                    colors={loading ? ["#81C784", "#66BB6A"] : ["#4CAF50", "#388E3C"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.loginGradient}
                  >
                    {loading ? (
                      <View style={styles.loadingContainer}>
                        <View style={styles.loadingDot} />
                        <View style={[styles.loadingDot, styles.loadingDot2]} />
                        <View style={[styles.loadingDot, styles.loadingDot3]} />
                      </View>
                    ) : (
                      <>
                        <Text style={styles.loginText}>Sign In</Text>
                        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {debugMode && (
                  <View style={styles.debugInfo}>
                    <Ionicons name="information-circle" size={16} color="#FF9800" />
                    <Text style={styles.debugInfoText}>
                      Testing all field name combinations
                    </Text>
                  </View>
                )}

                {/* Security Badge */}
                <View style={styles.securityBadge}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#4CAF50" />
                  <Text style={styles.securityText}>Secured Connection</Text>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <Text style={styles.footerTitle}>IMCB Solutions LLP</Text>
            <Text style={styles.footerText}>All rights reserved © 2025</Text>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 20 : 50,
    paddingBottom: 60,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  logoContainer: {
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  titleSection: {
    alignItems: "center",
  },
  appTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1B5E20",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  titleUnderline: {
    width: 60,
    height: 4,
    backgroundColor: "#2E7D32",
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#558B2F",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  debugBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 152, 0, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    marginTop: 12,
  },
  debugDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF9800",
  },
  debugText: {
    fontSize: 11,
    color: "#E65100",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  waveContainer: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 30,
    overflow: "hidden",
  },
  wave: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: "#F8F9FA",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: -30,
  },
  formCard: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  cardGradient: {
    padding: 24,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  welcomeIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1B5E20",
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: "#757575",
    fontWeight: "500",
    textAlign: "center",
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    height: 56,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: {
    borderColor: "#C62828",
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#212121",
    fontWeight: "500",
  },
  eyeIcon: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingLeft: 4,
  },
  errorText: {
    fontSize: 13,
    color: "#C62828",
    fontWeight: "600",
  },
  loginButton: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 24,
  },
  loginText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    opacity: 0.4,
  },
  loadingDot2: {
    opacity: 0.7,
  },
  loadingDot3: {
    opacity: 1,
  },
  debugInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  debugInfoText: {
    fontSize: 12,
    color: "#E65100",
    fontWeight: "600",
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  securityText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  footerDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#A5D6A7",
    borderRadius: 1,
    marginBottom: 12,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2E7D32",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  footerText: {
    fontSize: 12,
    color: "#757575",
    fontWeight: "600",
  },
});