import { runNetworkDiagnostics, testConnectionEnhanced } from "@/utils/api";
import { savePairingIP } from "@/utils/pairing";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

export default function Pairing() {
  const [ip, setIp] = useState("");
  const [password, setPassword] = useState("IMC-MOBILE"); // Pre-filled default password
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ipError, setIpError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const router = useRouter();

  const testPairing = async (
    ipAddress: string,
    pairPassword: string
  ): Promise<boolean> => {
    try {
      const res = await axios.post(
        `http://${ipAddress}:8000/pair-check`,
        {
          ip: ipAddress,
          password: pairPassword,
        },
        {
          timeout: 10000, // 10 second timeout
        }
      );

      return res.data.status === "success";
    } catch (error) {
      console.error("Pairing test failed:", error);
      return false;
    }
  };

  const validateIP = (ipString: string): boolean => {
    // Clean the IP first
    const cleanIP = ipString
      .replace(/^https?:\/\//, "")
      .replace(":8000", "")
      .trim();

    // Basic IP validation regex
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(cleanIP)) {
      return false;
    }

    // Validate each octet is 0-255
    const parts = cleanIP.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  };

  const handleConnect = async () => {
    let hasError = false;

    // Validate IP
    if (!ip || !validateIP(ip)) {
      setIpError(true);
      hasError = true;
    } else {
      setIpError(false);
    }

    // Validate password
    if (!password) {
      setPasswordError(true);
      hasError = true;
    } else {
      setPasswordError(false);
    }

    if (hasError) return;

    setLoading(true);

    try {
      // Clean the IP address
      const cleanIP = ip
        .replace(/^https?:\/\//, "")
        .replace(":8000", "")
        .trim();

      console.log("🔍 Testing connection to:", cleanIP);

      // First test if we can reach the server
      const canConnect = await testConnectionEnhanced(cleanIP);

      if (!canConnect) {
        const diagnostics = await runNetworkDiagnostics(cleanIP);
        console.log("Full diagnostics:", diagnostics);
        Toast.show({
          type: "error",
          text1: "Connection Failed",
          text2: `Cannot reach server at ${cleanIP}:8000`,
        });
        return;
      }

      console.log("✅ Server reachable, testing pairing...");

      // If connection works, try pairing
      const pairingSuccess = await testPairing(cleanIP, password);

      if (pairingSuccess) {
        // Save the IP for future use
        await savePairingIP(cleanIP);

        Toast.show({
          type: "success",
          text1: "Success! 🎉",
          text2: `Connected to ${cleanIP}`,
        });

        // Navigate to login screen
        setTimeout(() => {
          router.replace("/(auth)/login");
        }, 500);
      } else {
        Toast.show({
          type: "error",
          text1: "Authentication Failed",
          text2: "Invalid password. Please check and try again.",
        });
      }
    } catch (err: any) {
      console.error("Connection error:", err);

      let errorMessage = "Connection failed. Please check your settings.";

      if (err.code === "NETWORK_ERROR" || err.code === "ECONNREFUSED") {
        errorMessage =
          "Cannot connect to server. Check IP address and ensure server is running.";
      } else if (err.response?.status === 401) {
        errorMessage = "Invalid password.";
      } else if (err.code === "ECONNABORTED") {
        errorMessage =
          "Connection timeout. Server might be slow or unreachable.";
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      {/* Status Bar */}
      <StatusBar backgroundColor="#C8E6C9" />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center items-center px-5 py-10 bg-[#F8F9FA]">
            {/* Header Section */}
            <View className="items-center w-full">
              <Image
                source={require("../../assets/images/icon.jpg")}
                style={{
                  width: 80,
                  height: 80,
                  marginBottom: 12,
                }}
              />
              <Text className="text-2xl font-bold mb-2 text-[#1B5E20]">
                TaskPMS
              </Text>
              <Text className="text-[#558B2F] mb-8 text-center">
                Connect to your server
              </Text>

              {/* Main Form Card */}
              <View className="w-full max-w-[360px] bg-white rounded-2xl p-6 shadow-lg">
                <Text className="text-center text-[#2E7D32] text-xl font-semibold mb-6">
                  Server Connection
                </Text>

                {/* Connection Icon */}
                <View className="items-center mb-6">
                  <Ionicons name="server" size={48} color="#4CAF50" />
                  <Text className="text-[#616161] text-center mt-3">
                    Enter your server details below
                  </Text>
                </View>

                {/* Form Fields */}
                <View className="gap-y-5">
                  {/* IP Address Field */}
                  <View>
                    <Text className="text-[#2E7D32] font-semibold mb-2">
                      Server IP Address
                    </Text>
                    <TextInput
                      value={ip}
                      onChangeText={(text) => {
                        setIp(text);
                        setIpError(false);
                      }}
                      placeholder="192.168.1.37"
                      keyboardType="decimal-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className={`border rounded-lg px-4 py-4 text-base bg-white ${
                        ipError ? "border-red-400" : "border-[#A5D6A7]"
                      }`}
                    />
                    {ipError && (
                      <Text className="text-red-500 text-sm mt-1">
                        Please enter a valid IP address
                      </Text>
                    )}
                    <Text className="text-[#757575] text-xs mt-1">
                      Example: 192.168.1.100 (no http:// or :8000)
                    </Text>
                  </View>

                  {/* Password Field */}
                  <View>
                    <Text className="text-[#2E7D32] font-semibold mb-2">
                      Pairing Password
                    </Text>
                    <View className="relative">
                      <TextInput
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          setPasswordError(false);
                        }}
                        placeholder="Enter pairing password"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        className={`border rounded-lg px-4 py-4 pr-12 text-base bg-white ${
                          passwordError ? "border-red-400" : "border-[#A5D6A7]"
                        }`}
                      />
                      <TouchableOpacity
                        className="absolute right-4 top-4"
                        onPress={() => setShowPassword((prev) => !prev)}
                      >
                        <Ionicons
                          name={showPassword ? "eye-off" : "eye"}
                          size={22}
                          color="#666"
                        />
                      </TouchableOpacity>
                    </View>
                    {passwordError && (
                      <Text className="text-red-500 text-sm mt-1">
                        Password is required
                      </Text>
                    )}
                    <Text className="text-[#757575] text-xs mt-1">
                      Default password: IMC-MOBILE
                    </Text>
                  </View>
                </View>

                {/* Connect Button */}
                <Pressable
                  onPress={handleConnect}
                  className={`rounded-lg py-4 mt-8 shadow-lg ${
                    loading ? "bg-[#A5D6A7]" : "bg-[#4CAF50]"
                  }`}
                  disabled={loading}
                >
                  {loading ? (
                    <View className="flex-row justify-center items-center">
                      <ActivityIndicator color="white" size="small" />
                      <Text className="text-white font-bold text-lg ml-2">
                        Connecting...
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-center text-white font-bold text-lg">
                      🔗 Connect to Server
                    </Text>
                  )}
                </Pressable>

                {/* Help Section */}
                <View className="mt-6 p-4 bg-[#E8F5E9] rounded-lg">
                  <Text className="text-[#2E7D32] font-semibold mb-2">
                    💡 Connection Help
                  </Text>
                  <Text className="text-[#558B2F] text-sm leading-5">
                    • Both phone and computer must be on the same WiFi network
                    {"\n"}• Make sure the server is running on your computer
                    {"\n"}• Check the server console for the correct IP address
                    {"\n"}• The server should show something like: "📱 Use IP:
                    192.168.1.37"
                  </Text>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View className="mt-8">
              <Text className="text-sm text-[#757575] text-center">
                Powered by IMC Business Solutions
              </Text>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}