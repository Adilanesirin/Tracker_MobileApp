import { initDatabase } from "@/utils/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

export default function Index() {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("🚀 App initialization started...");
        
        // Initialize DB
        await initDatabase();
        console.log("✅ Database initialized");

        // Check license activation first
        const licenseActivated = await AsyncStorage.getItem("licenseActivated");
        console.log("📋 License Activated:", licenseActivated);
        
        if (!licenseActivated || licenseActivated !== "true") {
          // License not activated, go to license screen
          console.log("❌ License not activated, redirecting to license screen");
          setTimeout(() => {
            setRedirectTo("/(auth)/license");
            console.log("🔄 Redirect set to: /(auth)/license");
          }, 2000);
          return;
        }

        // License is activated, check pairing and auth
        const ip = await SecureStore.getItemAsync("paired_ip");
        const token = await SecureStore.getItemAsync("token");
        console.log("📡 IP:", ip);
        console.log("🔑 Token:", token ? "exists" : "null");

        setTimeout(() => {
          if (ip && token) {
            console.log("✅ IP and token exist, going to main");
            setRedirectTo("/(main)/");
          } else {
            console.log("⚠️ Missing IP or token, going to pairing");
            setRedirectTo("/(auth)/pairing");
          }
          console.log("🔄 Redirect set to:", ip && token ? "/(main)/" : "/(auth)/pairing");
        }, 2000);
      } catch (error) {
        console.error("❌ Initialization Error:", error);
        // On error, go to license screen
        setTimeout(() => {
          setRedirectTo("/(auth)/license");
          console.log("🔄 Error redirect to: /(auth)/license");
        }, 2000);
      }
    };

    initializeApp();
  }, []);

  if (!redirectTo) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "white" }}>
        <Image
          source={require("../assets/images/tracker.png")}
          style={{ width: 160, height: 160 }}
          resizeMode="contain"
        />
        <Text style={{ marginTop: 20, fontSize: 16, color: "#666" }}>Loading...</Text>
      </View>
    );
  }

  console.log("🎯 Final redirect to:", redirectTo);
  return <Redirect href={redirectTo as any} />;
}