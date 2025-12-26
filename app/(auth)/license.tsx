import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

export default function TrackerLicense() {
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [licenseError, setLicenseError] = useState(false);

  const router = useRouter();

  const getDeviceId = async () => {
    try {
      let id;
      if (Platform.OS === "android") {
        id = Application.androidId || `android_${Date.now()}`;
      } else if (Platform.OS === "ios") {
        id = (await Application.getIosIdForVendorAsync()) || `ios_${Date.now()}`;
      } else {
        id = await AsyncStorage.getItem("deviceId");
        if (!id) {
          id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await AsyncStorage.setItem("deviceId", id);
        }
      }
      return id;
    } catch (error) {
      console.error("Error getting device ID:", error);
      return `device_${Date.now()}`;
    }
  };

  const getDeviceName = async () => {
    try {
      let name = "";
      
      if (Platform.OS === "android") {
        const brand = Device.brand || "";
        const modelName = Device.modelName || "";
        name = `${brand} ${modelName}`.trim() || "Android Device";
      } else if (Platform.OS === "ios") {
        const modelName = Device.modelName || "";
        name = modelName || "iOS Device";
      } else {
        name = "Unknown Device";
      }
      
      return name;
    } catch (error) {
      console.error("Error getting device name:", error);
      return "Unknown Device";
    }
  };

  const checkDeviceRegistration = async (deviceIdToCheck: string) => {
    try {
      const CHECK_LICENSE_API = `https://activate.imcbs.com/mobileapp/api/project/tasktracker/`;

      const response = await fetch(CHECK_LICENSE_API, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (!response.ok || !data.success) {
        console.log("API check failed");
        return { found: false };
      }

      if (!data.customers || data.customers.length === 0) {
        console.log("No customers found");
        return { found: false };
      }

      // Check if this device is registered under any customer
      for (const customer of data.customers) {
        if (customer.registered_devices && customer.registered_devices.length > 0) {
          const deviceFound = customer.registered_devices.some(
            (device: any) => device.device_id === deviceIdToCheck
          );

          if (deviceFound) {
            console.log("Device found in customer:", customer.customer_name);
            console.log("Customer status:", customer.status);
            
            return {
              found: true,
              customer: customer,
              projectName: data.project_name
            };
          }
        }
      }

      console.log("Device not found in any customer");
      return { found: false };
    } catch (error) {
      console.error("Error checking device registration:", error);
      return { found: false };
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setChecking(true);

        const id = await getDeviceId();
        setDeviceId(id);

        const name = await getDeviceName();
        setDeviceName(name);

        console.log("Checking if device is already registered...");
        console.log("Device ID:", id);
        console.log("Device Name:", name);

        // Check local license status FIRST
        const licenseActivated = await AsyncStorage.getItem("licenseActivated");
        const storedDeviceId = await AsyncStorage.getItem("deviceId");
        
        console.log("📱 Local License Status:");
        console.log("  - License Activated:", licenseActivated);
        console.log("  - Stored Device ID:", storedDeviceId);
        console.log("  - Current Device ID:", id);

        // Only skip to pairing if license is valid
        if (licenseActivated === "true" && storedDeviceId === id) {
          console.log("✅ Local license valid, verifying with server...");
          
          // Double-check with server
          const registrationCheck = await checkDeviceRegistration(id);
          
          if (registrationCheck.found) {
            console.log("✅ Server confirms device is registered");
            
            // Ensure all data is stored
            await AsyncStorage.setItem("licenseActivated", "true");
            await AsyncStorage.setItem("licenseKey", registrationCheck.customer.license_key);
            await AsyncStorage.setItem("deviceId", id);
            await AsyncStorage.setItem("customerName", registrationCheck.customer.customer_name);
            await AsyncStorage.setItem("projectName", registrationCheck.projectName);
            await AsyncStorage.setItem("clientId", registrationCheck.customer.client_id);
            
            Toast.show({
              type: "success",
              text1: "Welcome Back! 🎉",
              text2: "Device already registered",
            });

            setTimeout(() => {
              router.replace("/(auth)/pairing");
            }, 500);
            return;
          } else {
            console.log("⚠️ Server says device not registered, clearing local data");
            await AsyncStorage.multiRemove([
              "licenseActivated",
              "licenseKey",
              "deviceId",
              "customerName",
              "projectName",
              "clientId",
            ]);
          }
        } else {
          console.log("❌ No valid local license found");
        }

        console.log("Showing license activation screen");
        setChecking(false);
        
      } catch (error) {
        console.error("Initialization error:", error);
        setChecking(false);
      }
    };

    initializeApp();
  }, []);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setLicenseError(true);
      return;
    }

    if (!deviceId) {
      Alert.alert("Error", "Device ID not available. Please try again.");
      return;
    }

    setLoading(true);
    setLicenseError(false);

    try {
      // STEP 1: Validate license key
      const CHECK_LICENSE_API = `https://activate.imcbs.com/mobileapp/api/project/tasktracker/`;

      console.log("Validating license key...");
      const checkResponse = await fetch(CHECK_LICENSE_API, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const checkData = await checkResponse.json();
      console.log("Check response:", checkData);

      if (!checkResponse.ok || !checkData.success) {
        Toast.show({
          type: "error",
          text1: "Validation Failed",
          text2: checkData.message || "Failed to validate license. Please try again.",
        });
        setLoading(false);
        return;
      }

      if (!checkData.customers || checkData.customers.length === 0) {
        Toast.show({
          type: "error",
          text1: "Invalid License",
          text2: "No customer found for this license",
        });
        setLoading(false);
        return;
      }

      const customer = checkData.customers.find(
        (c: any) => c.license_key === licenseKey.trim()
      );

      if (!customer) {
        Toast.show({
          type: "error",
          text1: "Invalid License",
          text2: "The license key you entered is not valid",
        });
        setLoading(false);
        return;
      }

      // Check if device already registered
      const isAlreadyRegistered = customer.registered_devices?.some(
        (device: any) => device.device_id === deviceId
      );

      if (isAlreadyRegistered) {
        await AsyncStorage.setItem("licenseActivated", "true");
        await AsyncStorage.setItem("licenseKey", licenseKey.trim());
        await AsyncStorage.setItem("deviceId", deviceId);
        await AsyncStorage.setItem("customerName", customer.customer_name);
        await AsyncStorage.setItem("projectName", checkData.project_name);
        await AsyncStorage.setItem("clientId", customer.client_id);

        Toast.show({
          type: "success",
          text1: "Already Registered",
          text2: `Welcome back ${customer.customer_name}!`,
        });

        setTimeout(() => {
          router.replace("/(auth)/pairing");
        }, 500);
        setLoading(false);
        return;
      }

      // Check device limit
      if (
        customer.license_summary.registered_count >=
        customer.license_summary.max_devices
      ) {
        Toast.show({
          type: "error",
          text1: "License Limit Reached",
          text2: `Maximum devices (${customer.license_summary.max_devices}) already registered`,
        });
        setLoading(false);
        return;
      }

      // STEP 2: Register new device
      const POST_DEVICE_API = `https://activate.imcbs.com/mobileapp/api/project/tasktracker/license/register/`;

      console.log("Registering new device...");
      const deviceResponse = await fetch(POST_DEVICE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          license_key: licenseKey.trim(),
          device_id: deviceId,
          device_name: deviceName,
        }),
      });

      const responseText = await deviceResponse.text();
      console.log("Raw response:", responseText);

      let deviceData;
      try {
        deviceData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        Toast.show({
          type: "error",
          text1: "Server Error",
          text2: "Invalid response from server. Please contact support.",
        });
        setLoading(false);
        return;
      }

      if (deviceResponse.ok && deviceData.success) {
        await AsyncStorage.setItem("licenseActivated", "true");
        await AsyncStorage.setItem("licenseKey", licenseKey.trim());
        await AsyncStorage.setItem("deviceId", deviceId);
        await AsyncStorage.setItem("customerName", customer.customer_name);
        await AsyncStorage.setItem("projectName", checkData.project_name);
        await AsyncStorage.setItem("clientId", customer.client_id);

        Toast.show({
          type: "success",
          text1: "Success! 🎉",
          text2: `Welcome ${customer.customer_name}! Device registered successfully.`,
        });

        setTimeout(() => {
          router.replace("/(auth)/pairing");
        }, 500);
      } else {
        const errorMessage =
          deviceData.message ||
          deviceData.error ||
          "Failed to register device. Please try again.";

        Toast.show({
          type: "error",
          text1: "Registration Failed",
          text2: errorMessage,
        });
      }
    } catch (error: any) {
      console.error("Activation error:", error);

      let errorMessage = "Network error. Please check your connection.";
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      Toast.show({
        type: "error",
        text1: "Connection Error",
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error("Error opening URL:", error);
    }
  };

  const handleEmail = async () => {
    const url = "mailto:info@imcbs.com";
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error("Error opening email:", error);
    }
  };

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Checking registration...</Text>
      </View>
    );
  }

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
              <LinearGradient
                colors={["#4CAF50", "#388E3C"]}
                style={styles.logoGradient}
              >
                <Ionicons name="shield-checkmark" size={36} color="#FFFFFF" />
              </LinearGradient>
              
              <View style={styles.titleSection}>
                <Text style={styles.appTitle}>TRACKER</Text>
                <View style={styles.titleUnderline} />
                <Text style={styles.subtitle}>License Activation</Text>
              </View>
            </View>

            <View style={styles.waveContainer}>
              <View style={styles.wave} />
            </View>
          </LinearGradient>

          {/* Main Content */}
          <View style={styles.formContainer}>
            <View style={styles.formCard}>
              <LinearGradient
                colors={["#FFFFFF", "#F8F9FA"]}
                style={styles.cardGradient}
              >
                {/* Icon Section */}
                <View style={styles.iconSection}>
                  <View style={styles.iconWrapper}>
                    <Ionicons name="key" size={48} color="#4CAF50" />
                  </View>
                  <Text style={styles.welcomeTitle}>Activate Your License</Text>
                  <Text style={styles.welcomeSubtitle}>
                    Enter your license key to get started
                  </Text>
                </View>

                {/* Device Info */}
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceLabel}>Device ID</Text>
                  <Text style={styles.deviceValue} numberOfLines={1}>
                    {deviceId || "Loading..."}
                  </Text>
                  <Text style={[styles.deviceLabel, styles.deviceLabelMargin]}>
                    Device Name
                  </Text>
                  <Text style={styles.deviceValue} numberOfLines={1}>
                    {deviceName || "Loading..."}
                  </Text>
                </View>

                {/* License Key Input */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>License Key</Text>
                  <View style={[styles.inputWrapper, licenseError && styles.inputError]}>
                    <View style={styles.inputIcon}>
                      <Ionicons 
                        name="key-outline" 
                        size={20} 
                        color={licenseError ? "#C62828" : "#4CAF50"} 
                      />
                    </View>
                    <TextInput
                      value={licenseKey}
                      onChangeText={(text) => {
                        setLicenseKey(text);
                        setLicenseError(false);
                      }}
                      placeholder="Enter your license key"
                      placeholderTextColor="#9E9E9E"
                      style={styles.textInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                    />
                  </View>
                  {licenseError && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={14} color="#C62828" />
                      <Text style={styles.errorText}>License key is required</Text>
                    </View>
                  )}
                </View>

                {/* Activate Button */}
                <TouchableOpacity
                  onPress={handleActivate}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={styles.activateButton}
                >
                  <LinearGradient
                    colors={loading ? ["#81C784", "#66BB6A"] : ["#4CAF50", "#388E3C"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <View style={styles.loadingButtonContainer}>
                        <ActivityIndicator color="white" size="small" />
                        <Text style={styles.buttonText}>Validating...</Text>
                      </View>
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.buttonText}>Activate License</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Info Section */}
                <View style={styles.infoBox}>
                  <Text style={styles.infoTitle}>💡 Activation Info</Text>
                  <Text style={styles.infoText}>
                    • Your license key was provided by IMC Business Solutions{"\n"}
                    • This device will be registered to your license{"\n"}
                    • You only need to activate once per device{"\n"}
                    • Contact support if you need assistance
                  </Text>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Social Links Footer */}
          <View style={styles.socialSection}>
            <Text style={styles.socialTitle}>Need Help?</Text>
            <View style={styles.socialLinks}>
              <TouchableOpacity
                onPress={() => handleSocialLink("https://imcbs.com/")}
                style={styles.socialButton}
              >
                <Ionicons name="globe-outline" size={28} color="#4CAF50" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSocialLink("https://www.facebook.com/106935927735565")}
                style={styles.socialButton}
              >
                <Ionicons name="logo-facebook" size={28} color="#1877F2" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleEmail}
                style={styles.socialButton}
              >
                <Ionicons name="mail-outline" size={28} color="#EA4335" />
              </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    color: "#757575",
    marginTop: 16,
    fontSize: 16,
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
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 16,
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
  iconSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
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
  deviceInfo: {
    backgroundColor: "#F5F5F5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  deviceLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 6,
  },
  deviceLabelMargin: {
    marginTop: 12,
  },
  deviceValue: {
    fontSize: 12,
    color: "#616161",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
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
  activateButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 24,
  },
  loadingButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#558B2F",
    lineHeight: 20,
  },
  socialSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  socialTitle: {
    fontSize: 14,
    color: "#757575",
    marginBottom: 16,
    fontWeight: "600",
  },
  socialLinks: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  socialButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: 50,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 24,
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