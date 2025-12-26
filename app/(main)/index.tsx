import { deleteUserid, getUserid, logout } from "@/utils/auth";
import { clearPairing } from "@/utils/pairing";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

const { width } = Dimensions.get("window");
const cardWidth = (width - 60) / 2;

export default function HomeScreen() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const loadUser = async () => {
      const user = await getUserid();
      setUsername(user);
    };
    loadUser();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      Animated.stagger(
        100,
        scaleAnims.map((anim) =>
          Animated.spring(anim, {
            toValue: 1,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
          })
        )
      ).start();
    });
  }, []);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          await clearPairing();
          await deleteUserid();
          router.replace("/(auth)/pairing");
          Toast.show({
            type: "success",
            text1: "Logged out successfully",
            visibilityTime: 2500,
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#C8E6C9" />
      
      {/* Header */}
      <LinearGradient
        colors={["#C8E6C9", "#A5D6A7"]}
        style={styles.header}
      >
        <SafeAreaView>
          <View style={styles.headerContent}>
            <TouchableOpacity 
              style={styles.settingsButton}
              onPress={() => router.push("/(main)/settings")}
            >
              <Ionicons name="settings" size={26} color="#1B5E20" />
            </TouchableOpacity>
            
            <View style={styles.titleContainer}>
              <Text style={styles.appTitle}>Tracker</Text>
              <View style={styles.titleUnderline} />
            </View>
            
            <TouchableOpacity onPress={handleLogout} style={styles.powerButton}>
              <Ionicons name="power" size={26} color="#C62828" />
            </TouchableOpacity>
          </View>
          
          <Animated.View style={[styles.welcomeSection, { opacity: fadeAnim }]}>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting}>Hi, {username || "User"}!</Text>
              <View style={styles.waveEmoji}>
                <Text style={styles.waveText}>👋</Text>
              </View>
            </View>
            
            <View style={styles.stockCard}>
              <LinearGradient
                colors={["rgba(255,255,255,0.95)", "rgba(255,255,255,0.85)"]}
                style={styles.stockCardGradient}
              >
                <View style={styles.stockCardLeft}>
                  <View style={styles.trendingIconContainer}>
                    <Ionicons name="trending-up" size={22} color="#4CAF50" />
                  </View>
                  <View>
                    <Text style={styles.stockText}>Market Activity</Text>
                    <Text style={styles.stockSubtext}>Real-time tracking</Text>
                  </View>
                </View>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      {/* Main Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardsGrid}>
          {/* Download Card */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: scaleAnims[0],
                transform: [
                  {
                    scale: scaleAnims[0].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/(main)/download")}
            >
              <LinearGradient
                colors={["#E3F2FD", "#BBDEFB"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconContainer}>
                    <LinearGradient
                      colors={["#2196F3", "#1976D2"]}
                      style={styles.iconGradient}
                    >
                      <Ionicons name="cloud-download-outline" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <View style={styles.cardBadge}>
                    <View style={styles.badgeDot} />
                  </View>
                </View>
                
                <View style={styles.cardMainContent}>
                  <View style={styles.featureIconWrapper}>
                    <View style={styles.iconRing}>
                      <Ionicons name="arrow-down-circle" size={52} color="#1976D2" />
                    </View>
                  </View>
                </View>
                
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTitle}>Download</Text>
                  <Text style={styles.cardSubtitle}>Sync stock data</Text>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={16} color="#1976D2" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Tracker Card */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: scaleAnims[1],
                transform: [
                  {
                    scale: scaleAnims[1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/(main)/tracker")}
            >
              <LinearGradient
                colors={["#E8F5E9", "#C8E6C9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconContainer}>
                    <LinearGradient
                      colors={["#4CAF50", "#388E3C"]}
                      style={styles.iconGradient}
                    >
                      <Ionicons name="stats-chart-outline" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <View style={styles.cardBadge}>
                    <View style={styles.badgeDot} />
                  </View>
                </View>
                
                <View style={styles.cardMainContent}>
                  <View style={styles.featureIconWrapper}>
                    <View style={styles.iconRing}>
                      <Ionicons name="analytics" size={52} color="#388E3C" />
                    </View>
                  </View>
                </View>
                
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTitle}>Tracker</Text>
                  <Text style={styles.cardSubtitle}>Monitor stocks</Text>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={16} color="#388E3C" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer */}
        <View style={styles.footerCard}>
          <LinearGradient
            colors={["#ffffffff", "#F5F5F5"]}
            style={styles.footerGradient}
          >
            <Text style={styles.footerTitle}>IMCB Solutions LLP</Text>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>All rights reserved © 2025</Text>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    paddingBottom: 28,
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 10 : 10,
    marginBottom: 24,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  titleContainer: {
    alignItems: "center",
  },
  appTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1B5E20",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  titleUnderline: {
    width: 40,
    height: 3,
    backgroundColor: "#2E7D32",
    borderRadius: 2,
    marginTop: 4,
  },
  powerButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  welcomeSection: {
    paddingHorizontal: 20,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  greeting: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1B5E20",
    marginRight: 8,
  },
  waveEmoji: {
    marginLeft: 4,
  },
  waveText: {
    fontSize: 26,
  },
  stockCard: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  stockCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  stockCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  trendingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  stockText: {
    fontSize: 16,
    color: "#1B5E20",
    fontWeight: "700",
  },
  stockSubtext: {
    fontSize: 12,
    color: "#558B2F",
    fontWeight: "500",
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  liveText: {
    fontSize: 11,
    color: "#2E7D32",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 80,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  cardWrapper: {
    width: cardWidth,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    minHeight: 220,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardIconContainer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  iconGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBadge: {
    width: 10,
    height: 10,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },
  cardMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
  },
  featureIconWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  iconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
  },
  cardFooter: {
    marginTop: 8,
    position: "relative",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#212121",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#616161",
  },
  cardArrow: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  footerCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 20,
    shadowColor: "#070707ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  footerGradient: {
    padding: 94,
    alignItems: "center",
  },
  footerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2E7D32",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  footerDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#A5D6A7",
    borderRadius: 1,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 12,
    color: "#757575",
    fontWeight: "600",
  },
});