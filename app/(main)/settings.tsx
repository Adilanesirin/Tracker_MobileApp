import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import Toast from "react-native-toast-message";

export default function Settings() {
  const [removingLicense, setRemovingLicense] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{
    customerName: string;
    licenseKey: string;
    deviceId: string;
    expiryDate?: string;
    remainingDays?: number;
    isExpired?: boolean;
  } | null>(null);
  const [loadingExpiry, setLoadingExpiry] = useState(false);

  useEffect(() => {
    const loadLicenseInfo = async () => {
      const customerName = await AsyncStorage.getItem("customerName");
      const licenseKey = await AsyncStorage.getItem("licenseKey");
      const deviceId = await AsyncStorage.getItem("deviceId");

      if (customerName && licenseKey && deviceId) {
        setLicenseInfo({ customerName, licenseKey, deviceId });
        // Fetch expiry date after setting basic info
        fetchLicenseExpiry(licenseKey);
      }
    };
    loadLicenseInfo();
  }, []);

  const fetchLicenseExpiry = async (licenseKey: string) => {
    setLoadingExpiry(true);
    try {
      const response = await fetch("https://activate.imcbs.com/mobileapp/api/project/tasktracker/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.customers) {
          // Find the customer with matching license key
          const customer = data.customers.find(
            (c: any) => c.license_key === licenseKey
          );

          if (customer && customer.license_validity) {
            setLicenseInfo(prev => prev ? {
              ...prev,
              expiryDate: customer.license_validity.expiry_date,
              remainingDays: customer.license_validity.remaining_days,
              isExpired: customer.license_validity.is_expired,
            } : null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch license expiry:", error);
    } finally {
      setLoadingExpiry(false);
    }
  };

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getExpiryStatus = () => {
    if (!licenseInfo?.remainingDays) return null;
    
    if (licenseInfo.isExpired) {
      return { color: '#DC2626', text: 'Expired', icon: 'close-circle' };
    } else if (licenseInfo.remainingDays <= 30) {
      return { color: '#F59E0B', text: `Expires in ${licenseInfo.remainingDays} days`, icon: 'warning' };
    } else {
      return { color: '#10B981', text: `${licenseInfo.remainingDays} days remaining`, icon: 'checkmark-circle' };
    }
  };

  const formatDeviceId = (deviceId: string) => {
    if (Platform.OS === 'android') {
      return deviceId.length > 8 ? `${deviceId.substring(0, 8)}...` : deviceId;
    } else if (Platform.OS === 'ios') {
      const parts = deviceId.split('-');
      return parts.length > 0 ? `${parts[0]}-...` : deviceId;
    }
    return deviceId.substring(0, 20) + '...';
  };

  const getDeviceType = () => {
    if (Platform.OS === 'android') {
      return 'Android ID';
    } else if (Platform.OS === 'ios') {
      return 'iOS IDFV (UUID)';
    }
    return 'Device ID';
  };

  const handleRemoveLicense = () => {
    if (!licenseInfo) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "No license information found",
      });
      return;
    }

    Alert.alert(
      "Remove License",
      `Are you sure you want to deactivate this device from license?\n\nCustomer: ${licenseInfo.customerName}\n\nThis will log you out and you'll need to activate again.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: confirmRemoveLicense
        }
      ]
    );
  };

  const confirmRemoveLicense = async () => {
    if (!licenseInfo) return;

    setRemovingLicense(true);

    try {
      console.log("🗑️ Removing license...");
      console.log("License Key:", licenseInfo.licenseKey);
      console.log("Device ID:", licenseInfo.deviceId);

      const LOGOUT_API = `https://activate.imcbs.com/mobileapp/api/project/tasktracker/logout/`;

      const response = await fetch(LOGOUT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          license_key: licenseInfo.licenseKey,
          device_id: licenseInfo.deviceId,
        }),
      });

      const responseText = await response.text();
      console.log("Raw response:", responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        Toast.show({
          type: "error",
          text1: "Server Error",
          text2: "Invalid response from server",
        });
        setRemovingLicense(false);
        return;
      }

      console.log("Logout response:", data);

      if (response.ok && data.success) {
        console.log("✅ License removed successfully");

        // Clear all stored data
        await AsyncStorage.multiRemove([
          "licenseActivated",
          "licenseKey",
          "deviceId",
          "device_hardware_id",
          "customerName",
          "projectName",
          "clientId",
        ]);

        // Also clear auth tokens
        await SecureStore.deleteItemAsync("authToken");
        await SecureStore.deleteItemAsync("userId");

        Toast.show({
          type: "success",
          text1: "License Removed",
          text2: "Device has been deactivated successfully",
        });

        // Redirect to license activation screen after a short delay
        setTimeout(() => {
          router.replace("/(auth)/license");
        }, 1500);
      } else {
        const errorMessage =
          data.message ||
          data.error ||
          data.detail ||
          "Failed to remove license";

        console.error("License removal failed:", errorMessage);

        Toast.show({
          type: "error",
          text1: "Removal Failed",
          text2: errorMessage,
        });
      }
    } catch (error: any) {
      console.error("💥 License removal error:", error);

      let errorMessage = "Network error. Please check your connection.";

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      if (
        error.name === "TypeError" &&
        error.message.includes("Network request failed")
      ) {
        errorMessage = "Cannot connect to server. Check your internet connection.";
      }

      Toast.show({
        type: "error",
        text1: "Connection Error",
        text2: errorMessage,
      });
    } finally {
      setRemovingLicense(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#C8E6C9" />
      
      {/* Header */}
      <LinearGradient
        colors={["#C8E6C9", "#A5D6A7"]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#1B5E20" />
          </TouchableOpacity>
          
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>
          
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* License Management Card */}
        {licenseInfo && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={["#4CAF50", "#388E3C"]}
                  style={styles.iconGradient}
                >
                  <Ionicons name="key" size={24} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={styles.cardTitle}>License Management</Text>
            </View>
            
            <Text style={styles.cardSubtitle}>
              Manage your device license activation
            </Text>

            {/* License Info Display */}
            <View style={styles.licenseInfoBox}>
              <View style={styles.licenseInfoRow}>
                <Ionicons name="person-outline" size={20} color="#4CAF50" />
                <View style={styles.licenseInfoTextContainer}>
                  <Text style={styles.licenseInfoLabel}>Customer</Text>
                  <Text style={styles.licenseInfoValue}>{licenseInfo.customerName}</Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.licenseInfoRow}>
                <Ionicons name="key-outline" size={20} color="#4CAF50" />
                <View style={styles.licenseInfoTextContainer}>
                  <Text style={styles.licenseInfoLabel}>License Key</Text>
                  <Text style={styles.licenseInfoValue} numberOfLines={1}>
                    {licenseInfo.licenseKey}
                  </Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.licenseInfoRow}>
                <Ionicons name="phone-portrait-outline" size={20} color="#4CAF50" />
                <View style={styles.licenseInfoTextContainer}>
                  <Text style={styles.licenseInfoLabel}>Device ID</Text>
                  <Text style={styles.licenseInfoValue} numberOfLines={1}>
                    {formatDeviceId(licenseInfo.deviceId)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.licenseInfoRow}>
                <Ionicons name="information-circle-outline" size={20} color="#4CAF50" />
                <View style={styles.licenseInfoTextContainer}>
                  <Text style={styles.licenseInfoLabel}>Device Type</Text>
                  <Text style={styles.licenseInfoValue}>
                    {getDeviceType()}
                  </Text>
                </View>
              </View>

              {/* License Expiry Information */}
              {loadingExpiry ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.licenseInfoRow}>
                    <ActivityIndicator size="small" color="#4CAF50" />
                    <View style={styles.licenseInfoTextContainer}>
                      <Text style={styles.licenseInfoLabel}>Loading expiry...</Text>
                    </View>
                  </View>
                </>
              ) : licenseInfo.expiryDate ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.licenseInfoRow}>
                    <Ionicons name="calendar-outline" size={20} color="#4CAF50" />
                    <View style={styles.licenseInfoTextContainer}>
                      <Text style={styles.licenseInfoLabel}>Expires On</Text>
                      <Text style={styles.licenseInfoValue}>
                        {formatExpiryDate(licenseInfo.expiryDate)}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {/* Expiry Status Badge */}
            {getExpiryStatus() && (
              <View style={[styles.expiryStatusBadge, { backgroundColor: getExpiryStatus()!.color + '15' }]}>
                <Ionicons 
                  name={getExpiryStatus()!.icon as any} 
                  size={20} 
                  color={getExpiryStatus()!.color} 
                />
                <Text style={[styles.expiryStatusText, { color: getExpiryStatus()!.color }]}>
                  {getExpiryStatus()!.text}
                </Text>
              </View>
            )}

            {/* Remove License Button */}
            <TouchableOpacity
              style={[
                styles.removeButton,
                removingLicense && styles.removeButtonDisabled
              ]}
              onPress={handleRemoveLicense}
              disabled={removingLicense}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={removingLicense ? ["#E5E7EB", "#D1D5DB"] : ["#FEE2E2", "#FEE2E2"]}
                style={styles.removeButtonGradient}
              >
                {removingLicense ? (
                  <>
                    <ActivityIndicator size="small" color="#DC2626" />
                    <Text style={styles.removeButtonText}>Removing License...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={22} color="#DC2626" />
                    <Text style={styles.removeButtonText}>Remove License</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={18} color="#F59E0B" />
              <Text style={styles.warningText}>
                Removing license will deactivate this device and log you out
              </Text>
            </View>
          </View>
        )}

        {/* No License Info */}
        {!licenseInfo && (
          <View style={styles.card}>
            <View style={styles.noLicenseContainer}>
              <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
              <Text style={styles.noLicenseTitle}>No License Found</Text>
              <Text style={styles.noLicenseText}>
                No license information available on this device
              </Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <LinearGradient
            colors={["#FFFFFF", "#F5F5F5"]}
            style={styles.footerGradient}
          >
            <Text style={styles.footerTitle}>IMCB Solutions LLP</Text>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>All rights reserved © 2025</Text>
            <Text style={[styles.footerText, { fontSize: 11, marginTop: 4 }]}>
              Device ID persists across app updates
            </Text>
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
    paddingBottom: 24,
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
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 10) + 10 : 50,
  },
  backButton: {
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
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1B5E20",
    letterSpacing: 1,
  },
  placeholder: {
    width: 48,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconContainer: {
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  iconGradient: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1B5E20",
    flex: 1,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
    lineHeight: 20,
  },
  licenseInfoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  licenseInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  licenseInfoTextContainer: {
    flex: 1,
  },
  licenseInfoLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  licenseInfoValue: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  expiryStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  expiryStatusText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  removeButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  removeButtonDisabled: {
    opacity: 0.6,
  },
  removeButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 10,
  },
  removeButtonText: {
    fontWeight: "700",
    color: "#DC2626",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    fontWeight: "600",
    lineHeight: 18,
  },
  noLicenseContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noLicenseTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  noLicenseText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  footerGradient: {
    padding: 40,
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