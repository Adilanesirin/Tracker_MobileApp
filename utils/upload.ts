// utils/upload.ts
import * as SecureStore from "expo-secure-store";
import { createEnhancedAPI } from "./api";

export async function uploadPendingOrders(orders: any[]) {
  try {
    console.log("📤 Starting upload of", orders.length, "orders");
    
    // Check authentication
    const token = await SecureStore.getItemAsync("token");
    if (!token) {
      throw new Error("Authentication token not found. Please login again.");
    }

    const api = await createEnhancedAPI();
    
    // Format orders for backend with special handling for manual entries
    const formattedOrders = orders.map((order, index) => {
      // Check if this is a manual entry - handle both number and string
      const isManualEntry = order.is_manual_entry === 1 || order.is_manual_entry === '1' || order.is_manual_entry === true;
      
      console.log(`📦 Order ${index + 1}:`, {
        barcode: order.barcode,
        is_manual_entry: order.is_manual_entry,
        isManualEntry: isManualEntry,
        product_name: order.product_name,
        itemcode: order.itemcode
      });
      
      // Base order structure matching acc_purchaseorderdetails requirements
      const formattedOrder: any = {
        supplier_code: order.supplier_code,
        user_id: order.userid,
        barcode: order.barcode,
        quantity: order.quantity,
        rate: order.rate,
        mrp: order.mrp,
        order_date: order.order_date,
        created_at: order.created_at,
        discount: 0,
        pnfcharges: 0,
        exceiseduty: 0,
        salestax: 0,
        freightcharge: 0,
        othercharges: 0,
        cessoned: 0,
        cess: 0,
        taxcode: 'NT', // Default tax code
      };

      // 🎯 CRITICAL FIX: Special handling for manual entries
      if (isManualEntry) {
        // For manual entries: 
        // - code: use barcode (the barcode user entered)
        // - item: product_name (the name user entered) ✅ FIX: Use product_name, not item
        // - ioflag: -100 (identifies manual entry)
        formattedOrder.code = order.barcode;
        formattedOrder.item = order.product_name || ''; // ✅ Use product_name from orders_to_sync
        formattedOrder.ioflag = -100;
        
        console.log("🔧 Manual entry RAW from DB:", {
          barcode: order.barcode,
          product_name: order.product_name,
          is_manual_entry: order.is_manual_entry
        });
        console.log("🔧 Manual entry formatted:", {
          barcode: order.barcode,
          code: formattedOrder.code,
          item: formattedOrder.item, // ✅ This should now show actual product name
          ioflag: formattedOrder.ioflag
        });
      } else {
        // For regular products:
        // - code: use itemcode from product database
        // - item: empty (backend populates from product master)
        // - ioflag: 0 (regular product)
        formattedOrder.code = order.itemcode;
        formattedOrder.item = '';
        formattedOrder.ioflag = 0;
      }

      return formattedOrder;
    });

    console.log("📦 Formatted orders for upload:", formattedOrders.length);
    console.log("🔢 Manual entries count:", formattedOrders.filter(o => o.ioflag === -100).length);
    console.log("📋 Regular entries count:", formattedOrders.filter(o => o.ioflag === 0).length);
    console.log("🔍 Sample manual entry:", formattedOrders.find(o => o.ioflag === -100));
    console.log("🔍 Sample regular entry:", formattedOrders.find(o => o.ioflag === 0));

    const res = await api.post("/upload-orders", { 
      orders: formattedOrders,
      total_orders: formattedOrders.length
    });

    console.log("✅ Upload response:", res.data);

    // Handle different response formats from backend
    if (res.data) {
      // Case 1: Backend returns { success: true, message: "..." }
      if (res.data.success === true) {
        return {
          success: true,
          message: res.data.message || "Orders uploaded successfully",
          uploaded_count: res.data.uploaded_count || formattedOrders.length
        };
      }
      
      // Case 2: Backend returns { status: "success", message: "..." }
      if (res.data.status === "success") {
        return {
          success: true,
          message: res.data.message || "Orders uploaded successfully",
          uploaded_count: formattedOrders.length
        };
      }
      
      // Case 3: Backend returns simple success message
      if (typeof res.data === "string" && res.data.includes("success")) {
        return {
          success: true,
          message: res.data,
          uploaded_count: formattedOrders.length
        };
      }
    }

    // If we get here, the response format is unexpected
    console.warn("⚠️ Unexpected response format from server:", res.data);
    return {
      success: true, // Assume success since we got a 200 response
      message: "Orders processed by server",
      uploaded_count: formattedOrders.length
    };
    
  } catch (error: any) {
    console.error("❌ Upload error:", error.response?.data || error.message);
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      throw new Error("Authentication failed. Please login again.");
    } else if (error.response?.status === 400) {
      throw new Error("Invalid data format: " + (error.response.data?.message || "Check your data"));
    } else if (error.code === "NETWORK_ERROR") {
      throw new Error("Network error. Please check your connection.");
    } else if (error.response?.data?.message) {
      // Server returned an error message
      throw new Error(error.response.data.message);
    } else {
      throw new Error(error.message || "Upload failed");
    }
  }
}

// Alternative upload function for different endpoint
export async function uploadOrdersBatch(orders: any[]) {
  try {
    const token = await SecureStore.getItemAsync("token");
    if (!token) {
      throw new Error("Authentication required");
    }

    const api = await createEnhancedAPI();
    
    const response = await api.post("/api/orders/batch", {
      orders: orders,
      sync_timestamp: new Date().toISOString()
    });

    return response.data;
  } catch (error: any) {
    console.error("Batch upload error:", error);
    throw error;
  }
}