import {
  clearDownloadArtifacts,
  downloadWithRetry,
  getDownloadStatus,
  resetDownloadState
} from "@/utils/download";
import {
  getLocalDataStats,
  updateLastSynced
} from "@/utils/sync";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import LottieView from "lottie-react-native";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";

export default function DownloadPage() {
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [masterCount, setMasterCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  
  // Progress tracking states
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [downloadedMaster, setDownloadedMaster] = useState(0);
  const [downloadedProducts, setDownloadedProducts] = useState(0);

  const loadStats = async () => {
    try {
      const stats = await getLocalDataStats();
      setMasterCount(stats.masterCount);
      setProductCount(stats.productCount);
      setLastSynced(stats.lastSynced);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const resetDownloadUIState = () => {
    setLoading(false);
    setShowSuccess(false);
    setDownloadProgress(0);
    setCurrentStep("");
    setDownloadedMaster(0);
    setDownloadedProducts(0);
  };

  const updateProgress = (progress: number, step: string, masterCount = 0, productCount = 0) => {
    setDownloadProgress(Math.min(progress, 100));
    setCurrentStep(step);
    setDownloadedMaster(masterCount);
    setDownloadedProducts(productCount);
  };

  const prepareForDownload = async () => {
    try {
      console.log("🧹 Preparing for fresh download...");
      updateProgress(5, "Preparing download...");
      await resetDownloadState();
      await clearDownloadArtifacts();
      updateProgress(10, "Ready to download");
      console.log("✅ Download state reset successful");
    } catch (err) {
      console.warn("⚠️ Error preparing download:", err);
    }
  };

  const checkAuthBeforeDownload = async () => {
    try {
      updateProgress(15, "Checking authentication...");
      const accessToken = await SecureStore.getItemAsync('token') || 
                          await SecureStore.getItemAsync('access_token');
      
      console.log("🔑 Download auth check:", {
        hasToken: !!await SecureStore.getItemAsync('token'),
        hasAccessToken: !!await SecureStore.getItemAsync('access_token'),
        finalToken: accessToken ? `EXISTS (${accessToken.length} chars)` : 'NOT FOUND'
      });
      
      if (!accessToken) {
        throw new Error("Please login to download data");
      }
      updateProgress(20, "Authentication verified");
      return true;
    } catch (error) {
      console.error("❌ Authentication check failed:", error);
      throw error;
    }
  };

  const handleDownload = async () => {
    try {
      resetDownloadUIState();
      setLoading(true);
      
      // Check authentication first
      await checkAuthBeforeDownload();
      
      // Always clear download artifacts before starting any download
      await prepareForDownload();
      
      console.log("🚀 Starting download process...");
      updateProgress(25, "Starting download...");
      
      // Simulate progress updates during download
      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev < 85) {
            const increment = Math.random() * 10 + 5;
            const newProgress = Math.min(prev + increment, 85);
            
            if (newProgress > 30 && newProgress <= 50) {
              setCurrentStep("Downloading master data...");
            } else if (newProgress > 50 && newProgress <= 75) {
              setCurrentStep("Downloading product data...");
            } else if (newProgress > 75) {
              setCurrentStep("Processing data...");
            }
            
            return newProgress;
          }
          return prev;
        });
      }, 800);

      const result = await downloadWithRetry();
      
      // Clear the progress interval
      clearInterval(progressInterval);
      
      // Get actual counts from the result
      const masterCountResult = result.masterData?.length || 0;
      const productCountResult = result.productData?.length || 0;
      const totalDownloaded = masterCountResult + productCountResult;
      
      updateProgress(90, "Saving data locally...", masterCountResult, productCountResult);
      
      // Debug logging
      console.log("📊 Download result details:", {
        hasResult: !!result,
        hasMasterData: !!result.masterData,
        hasProductData: !!result.productData,
        masterCount: masterCountResult,
        productCount: productCountResult,
        totalDownloaded,
        resultKeys: result ? Object.keys(result) : 'no result'
      });
      
      console.log("✅ Data downloaded successfully:", {
        master: masterCountResult,
        product: productCountResult,
        total: totalDownloaded
      });

      // Update sync timestamp first
      updateProgress(95, "Updating sync status...");
      await updateLastSynced();
      
      // Reload stats from database to get the actual stored counts
      await loadStats();
      
      // Complete progress
      updateProgress(100, "Download complete!");
      
      // Brief delay to show completion
      setTimeout(() => {
        // Set success state
        setShowSuccess(true);
      }, 500);
      
      // Show info toast only if no records were downloaded
      if (totalDownloaded === 0) {
        console.warn("⚠️ Download completed but no records were returned");
        Toast.show({
          type: "info",
          text1: "Download Complete",
          text2: "No new records available from server",
          visibilityTime: 4000,
        });
      }
      
    } catch (error: any) {
      console.error("❌ Download failed:", error.message);
      handleDownloadError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadError = (error: any) => {
    resetDownloadUIState();
    
    let errorMessage = "Please try again";
    const msg = error?.message?.toLowerCase() || "";
    
    if (msg.includes('login') || msg.includes('authentication') || msg.includes('token')) {
      errorMessage = "Please login first, then try downloading";
    } else if (msg.includes('timeout') || msg.includes('timed out')) {
      errorMessage = "Download timed out. Check your internet connection.";
    } else if (msg.includes('network')) {
      errorMessage = "Network error. Check your internet connection.";
    } else if (msg.includes('server error')) {
      errorMessage = "Server issue. Try again in a few minutes.";
    } else if (msg.includes('too many requests')) {
      errorMessage = "Too many requests. Wait 30 seconds and try again.";
    } else if (msg.includes('endpoints not found')) {
      errorMessage = "Server endpoints not found. Check server configuration.";
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    Toast.show({
      type: "error",
      text1: "Download Failed",
      text2: errorMessage,
      visibilityTime: 6000,
    });
  };

  const handleBack = () => {
    resetDownloadUIState();
    router.back();
  };

  const handleSuccessOk = () => {
    setShowSuccess(false);
    // Navigate to index.tsx page
    router.push('/');
  };

  useEffect(() => {
    resetDownloadUIState();
    loadStats();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setShowSuccess(false);
      loadStats();
    }, [])
  );

  const downloadStatus = getDownloadStatus();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#C8E6C9" />
      
      {/* Header */}
      <LinearGradient
        colors={["#C8E6C9", "#A5D6A7"]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1B5E20" />
          </Pressable>
          
          <View style={styles.headerTitle}>
            <Ionicons name="cloud-download" size={28} color="#1B5E20" />
            <Text style={styles.headerText}>Download Data</Text>
          </View>
          
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Success Overlay */}
        {showSuccess && (
          <View style={styles.successOverlay}>
            <View style={styles.successCard}>
              <LinearGradient
                colors={["#FFFFFF", "#F8F9FA"]}
                style={styles.successGradient}
              >
                <View style={styles.successIconContainer}>
                  <LinearGradient
                    colors={["#4CAF50", "#388E3C"]}
                    style={styles.successIconGradient}
                  >
                    <Ionicons name="checkmark-circle" size={56} color="#FFFFFF" />
                  </LinearGradient>
                </View>
                
                <Text style={styles.successTitle}>Download Successful!</Text>
                <Text style={styles.successSubtitle}>Data saved locally</Text>
                
                <View style={styles.successStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="cube-outline" size={20} color="#4CAF50" />
                    <Text style={styles.statLabel}>Master</Text>
                    <Text style={styles.statValue}>{masterCount.toLocaleString()}</Text>
                  </View>
                  
                  <View style={styles.statDivider} />
                  
                  <View style={styles.statItem}>
                    <Ionicons name="cart-outline" size={20} color="#4CAF50" />
                    <Text style={styles.statLabel}>Products</Text>
                    <Text style={styles.statValue}>{productCount.toLocaleString()}</Text>
                  </View>
                </View>
                
                <Pressable onPress={handleSuccessOk} style={styles.successButton}>
                  <LinearGradient
                    colors={["#4CAF50", "#388E3C"]}
                    style={styles.successButtonGradient}
                  >
                    <Text style={styles.successButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* Main Card */}
        <View style={styles.mainCard}>
          <LinearGradient
            colors={["#FFFFFF", "#F8F9FA"]}
            style={styles.cardGradient}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <View style={styles.loadingHeader}>
                  <View style={styles.loadingIconContainer}>
                    <LinearGradient
                      colors={["#4CAF50", "#388E3C"]}
                      style={styles.loadingIconGradient}
                    >
                      <Ionicons name="cloud-download" size={32} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <Text style={styles.loadingTitle}>
                    {loading && !showSuccess ? "Downloading..." : "Processing..."}
                  </Text>
                  <Text style={styles.loadingSubtitle}>This may take a few moments</Text>
                </View>
                
                {/* Progress Bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressStep}>{currentStep}</Text>
                    <Text style={styles.progressPercentage}>
                      {Math.round(downloadProgress)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                    <LinearGradient
                      colors={["#4CAF50", "#66BB6A"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressBar, { width: `${downloadProgress}%` }]}
                    />
                  </View>
                </View>

                {/* Progress Stats */}
                {(downloadedMaster > 0 || downloadedProducts > 0) && (
                  <View style={styles.downloadStats}>
                    <LinearGradient
                      colors={["rgba(76, 175, 80, 0.1)", "rgba(76, 175, 80, 0.05)"]}
                      style={styles.downloadStatsGradient}
                    >
                      <Text style={styles.downloadStatsTitle}>Downloaded</Text>
                      <View style={styles.downloadStatsRow}>
                        <View style={styles.downloadStatItem}>
                          <Ionicons name="cube" size={16} color="#4CAF50" />
                          <Text style={styles.downloadStatText}>
                            Master: {downloadedMaster.toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.downloadStatItem}>
                          <Ionicons name="cart" size={16} color="#4CAF50" />
                          <Text style={styles.downloadStatText}>
                            Products: {downloadedProducts.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.downloadStatsTotal}>
                        Total: {(downloadedMaster + downloadedProducts).toLocaleString()}
                      </Text>
                    </LinearGradient>
                  </View>
                )}
                
                <View style={styles.lottieContainer}>
                  <LottieView
                    source={require("@/assets/lottie/download.json")}
                    autoPlay
                    loop
                    style={styles.lottie}
                  />
                </View>
                
                {downloadStatus.isInProgress && (
                  <Text style={styles.downloadStatusText}>Download in progress...</Text>
                )}
              </View>
            ) : (
              <View style={styles.idleContainer}>
                {/* Icon Header */}
                <View style={styles.iconHeader}>
                  <View style={styles.iconCircle}>
                    <LinearGradient
                      colors={["rgba(76, 175, 80, 0.15)", "rgba(76, 175, 80, 0.05)"]}
                      style={styles.iconCircleGradient}
                    >
                      <Ionicons name="cloud-download-outline" size={64} color="#4CAF50" />
                    </LinearGradient>
                  </View>
                </View>

                {/* Stats Section */}
                <View style={styles.statsSection}>
                  <View style={styles.statCard}>
                    <LinearGradient
                      colors={["#E8F5E9", "#C8E6C9"]}
                      style={styles.statCardGradient}
                    >
                      <View style={styles.statCardIcon}>
                        <Ionicons name="cube" size={24} color="#388E3C" />
                      </View>
                      <Text style={styles.statCardLabel}>Master Data</Text>
                      <Text style={styles.statCardValue}>{masterCount.toLocaleString()}</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.statCard}>
                    <LinearGradient
                      colors={["#E8F5E9", "#C8E6C9"]}
                      style={styles.statCardGradient}
                    >
                      <View style={styles.statCardIcon}>
                        <Ionicons name="cart" size={24} color="#388E3C" />
                      </View>
                      <Text style={styles.statCardLabel}>Products</Text>
                      <Text style={styles.statCardValue}>{productCount.toLocaleString()}</Text>
                    </LinearGradient>
                  </View>
                </View>

                {/* Last Synced */}
                <View style={styles.syncInfo}>
                  <Ionicons name="time-outline" size={18} color="#558B2F" />
                  <Text style={styles.syncLabel}>Last Synced:</Text>
                  <Text style={styles.syncValue}>
                    {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
                  </Text>
                </View>

                {/* Download Button */}
                <Pressable
                  onPress={handleDownload}
                  disabled={loading}
                  style={styles.downloadButton}
                >
                  <LinearGradient
                    colors={loading ? ["#81C784", "#66BB6A"] : ["#4CAF50", "#388E3C"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.downloadButtonGradient}
                  >
                    <Ionicons name="cloud-download" size={24} color="#FFFFFF" />
                    <View>
                      <Text style={styles.downloadButtonText}>
                        {loading ? "Downloading..." : "Download Data"}
                      </Text>
                      <Text style={styles.downloadButtonSubtext}>
                        Tap to sync latest data
                      </Text>
                    </View>
                  </LinearGradient>
                </Pressable>

                {/* Error Display */}
                {downloadStatus.lastError && (
                  <View style={styles.errorContainer}>
                    <LinearGradient
                      colors={["#FFEBEE", "#FFCDD2"]}
                      style={styles.errorGradient}
                    >
                      <Ionicons name="alert-circle" size={20} color="#C62828" />
                      <Text style={styles.errorText}>
                        {downloadStatus.lastError}
                      </Text>
                    </LinearGradient>
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 20 : 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
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
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1B5E20",
    letterSpacing: 0.5,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  successOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    paddingHorizontal: 20,
  },
  successCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  successGradient: {
    padding: 32,
    alignItems: "center",
  },
  successIconContainer: {
    marginBottom: 20,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  successIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1B5E20",
    marginBottom: 8,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 15,
    color: "#558B2F",
    fontWeight: "600",
    marginBottom: 24,
  },
  successStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    width: "100%",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: "#A5D6A7",
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 12,
    color: "#558B2F",
    fontWeight: "600",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#2E7D32",
  },
  successButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  successButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  successButtonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  mainCard: {
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
  loadingContainer: {
    alignItems: "center",
  },
  loadingHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  loadingIconContainer: {
    marginBottom: 16,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  loadingIconGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2E7D32",
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: "#757575",
    fontWeight: "500",
  },
  progressSection: {
    width: "100%",
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressStep: {
    fontSize: 14,
    color: "#558B2F",
    fontWeight: "600",
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2E7D32",
  },
  progressBarContainer: {
    width: "100%",
    height: 12,
    backgroundColor: "#E0E0E0",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 6,
  },
  downloadStats: {
    width: "100%",
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
  },
  downloadStatsGradient: {
    padding: 16,
    alignItems: "center",
  },
  downloadStatsTitle: {
    fontSize: 13,
    color: "#2E7D32",
    fontWeight: "700",
    marginBottom: 12,
  },
  downloadStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 10,
  },
  downloadStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  downloadStatText: {
    fontSize: 12,
    color: "#388E3C",
    fontWeight: "600",
  },
  downloadStatsTotal: {
    fontSize: 12,
    color: "#2E7D32",
    fontWeight: "700",
    marginTop: 4,
  },
  lottieContainer: {
    marginVertical: 20,
  },
  lottie: {
    width: 180,
    height: 180,
  },
  downloadStatusText: {
    fontSize: 12,
    color: "#9E9E9E",
    fontWeight: "500",
    marginTop: 8,
  },
  idleContainer: {
    alignItems: "center",
  },
  iconHeader: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  iconCircleGradient: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statsSection: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    width: "100%",
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  statCardGradient: {
    padding: 20,
    alignItems: "center",
  },
  statCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statCardLabel: {
    fontSize: 12,
    color: "#558B2F",
    fontWeight: "600",
    marginBottom: 6,
  },
  statCardValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1B5E20",
  },
  syncInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(76, 175, 80, 0.08)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  syncLabel: {
    fontSize: 13,
    color: "#558B2F",
    fontWeight: "600",
  },
  syncValue: {
    fontSize: 13,
    color: "#2E7D32",
    fontWeight: "700",
    flex: 1,
  },
  downloadButton: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 16,
  },
  downloadButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  downloadButtonText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  downloadButtonSubtext: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "500",
    marginTop: 2,
  },
  errorContainer: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 12,
  },
  errorGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#C62828",
    fontWeight: "600",
  },
});