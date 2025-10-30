// utils/sync.ts
import { getDatabase } from "./database";

// Save master data
export const saveMasterData = async (data: any[]) => {
  const db = getDatabase();
  try {
    await db.withTransactionAsync(async () => {
      for (const item of data) {
        await db.runAsync(
          'INSERT OR REPLACE INTO master_data (code, name, place) VALUES (?, ?, ?)',
          [item.code, item.name, item.place || null]
        );
      }
    });
    console.log(`✅ Saved ${data.length} master records`);
  } catch (error) {
    console.error("❌ Error saving master data:", error);
    throw error;
  }
};

// Save product data with fallback for missing batch_supplier
export const saveProductData = async (data: any[]) => {
  const db = getDatabase();
  try {
    await db.withTransactionAsync(async () => {
      for (const item of data) {
        // Check if batch_supplier exists in the item, use fallback if not
        const batchSupplier = item.batch_supplier || item.supplier || item.batch_supplier_name || null;
        
        await db.runAsync(
          'INSERT OR REPLACE INTO product_data (code, name, barcode, quantity, salesprice, bmrp, cost, batch_supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            item.code || item.product_code,
            item.name || item.product_name,
            item.barcode,
            item.quantity || item.stock || 0,
            item.salesprice || item.selling_price || 0,
            item.bmrp || item.mrp || 0,
            item.cost || item.purchase_price || 0,
            batchSupplier
          ]
        );
      }
    });
    console.log(`✅ Saved ${data.length} product records`);
  } catch (error) {
    console.error("❌ Error saving product data:", error);
    throw error;
  }
};

// Get local data statistics
export const getLocalDataStats = async () => {
  const db = getDatabase();
  try {
    const masterCountResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM master_data') as {count: number};
    const productCountResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM product_data') as {count: number};
    const pendingOrdersResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM orders_to_sync WHERE sync_status = ?', ['pending']) as {count: number};
    const lastSyncedResult = await db.getFirstAsync('SELECT last_synced FROM sync_info WHERE id = 1') as {last_synced: string} | null;

    return {
      masterCount: masterCountResult?.count || 0,
      productCount: productCountResult?.count || 0,
      pendingOrders: pendingOrdersResult?.count || 0,
      lastSynced: lastSyncedResult?.last_synced || null
    };
  } catch (error) {
    console.error("❌ Error getting local stats:", error);
    return {
      masterCount: 0,
      productCount: 0,
      pendingOrders: 0,
      lastSynced: null
    };
  }
};

// 🎯 CRITICAL FIX: Get pending orders with correct product_name handling
export const getPendingOrders = async () => {
  const db = getDatabase();
  try {
    const orders = await db.getAllAsync(
      `SELECT 
         o.*,
         COALESCE(o.product_name, p.name) as product_name
       FROM orders_to_sync o 
       LEFT JOIN product_data p ON o.barcode = p.barcode 
       WHERE o.sync_status = ? 
       ORDER BY o.created_at`,
      ['pending']
    );
    
    // 🔍 Debug log
    console.log("\n🔍 === getPendingOrders() DEBUG ===");
    console.log(`Total orders fetched: ${orders.length}`);
    
    const manualEntries = orders.filter((o: any) => o.is_manual_entry === 1);
    if (manualEntries.length > 0) {
      console.log(`\nManual entries (${manualEntries.length}):`);
      manualEntries.forEach((entry: any, idx: number) => {
        console.log(`  ${idx + 1}. barcode: ${entry.barcode}`);
        console.log(`     product_name: "${entry.product_name}"`);
        console.log(`     is_manual_entry: ${entry.is_manual_entry}`);
      });
    }
    console.log("🔍 === END DEBUG ===\n");
    
    return orders;
  } catch (error) {
    console.error("❌ Error getting pending orders:", error);
    return [];
  }
};

// Mark orders as synced
export const markOrdersAsSynced = async () => {
  const db = getDatabase();
  try {
    await db.runAsync(
      'UPDATE orders_to_sync SET sync_status = ? WHERE sync_status = ?',
      ['synced', 'pending']
    );
    console.log("✅ Orders marked as synced");
  } catch (error) {
    console.error("❌ Error marking orders as synced:", error);
    throw error;
  }
};

// Save order to sync
export const saveOrderToSync = async (order: {
  supplier_code: string;
  userid: string;
  barcode: string;
  quantity: number;
  rate: number;
  mrp: number;
  order_date: string;
}) => {
  const db = getDatabase();
  try {
    // Check if order already exists for same date, barcode, user, and supplier
    const existingOrder = await db.getFirstAsync(
      `SELECT id, quantity FROM orders_to_sync 
       WHERE barcode = ? AND order_date = ? AND userid = ? AND supplier_code = ? 
       AND sync_status = 'pending'`,
      [order.barcode, order.order_date, order.userid, order.supplier_code]
    );

    if (existingOrder) {
      // Update existing order with new quantity (accumulate)
      const newQuantity = (existingOrder.quantity || 0) + order.quantity;
      
      await db.runAsync(
        `UPDATE orders_to_sync 
         SET quantity = ?, rate = ?, mrp = ?, created_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [newQuantity, order.rate, order.mrp, existingOrder.id]
      );
      
      console.log("✅ Updated existing order quantity:", {
        barcode: order.barcode,
        oldQuantity: existingOrder.quantity,
        newQuantity: newQuantity
      });
    } else {
      // Insert new order
      await db.runAsync(
        `INSERT INTO orders_to_sync 
         (supplier_code, userid, barcode, quantity, rate, mrp, order_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [order.supplier_code, order.userid, order.barcode, order.quantity, order.rate, order.mrp, order.order_date]
      );
      
      console.log("✅ New order saved for sync:", {
        barcode: order.barcode,
        quantity: order.quantity
      });
    }
  } catch (error: any) {
    // Handle unique constraint violation gracefully
    if (error.message?.includes('UNIQUE constraint failed')) {
      console.log("⚠️ Order already exists, updating instead...");
      
      // Try to update existing order
      await db.runAsync(
        `UPDATE orders_to_sync 
         SET quantity = quantity + ?, rate = ?, mrp = ?, created_at = CURRENT_TIMESTAMP 
         WHERE barcode = ? AND order_date = ? AND userid = ? AND supplier_code = ?`,
        [order.quantity, order.rate, order.mrp, order.barcode, order.order_date, order.userid, order.supplier_code]
      );
      
      console.log("✅ Updated existing order after constraint violation");
    } else {
      console.error("❌ Error saving order to sync:", error);
      throw error;
    }
  }
};

// Update last synced timestamp
export const updateLastSynced = async () => {
  const db = getDatabase();
  try {
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_info (id, last_synced) VALUES (1, ?)',
      [now]
    );
    console.log("✅ Last sync timestamp updated:", now);
  } catch (error) {
    console.error("❌ Error updating sync timestamp:", error);
    throw error;
  }
};

// Clean up duplicate orders function
export const cleanupDuplicateOrders = async () => {
  const db = getDatabase();
  try {
    console.log("🧹 Cleaning up duplicate orders...");
    
    // Find and merge duplicate orders
    const duplicates = await db.getAllAsync(`
      SELECT barcode, order_date, userid, supplier_code, 
             COUNT(*) as duplicate_count,
             GROUP_CONCAT(id) as order_ids,
             SUM(quantity) as total_quantity
      FROM orders_to_sync 
      WHERE sync_status = 'pending'
      GROUP BY barcode, order_date, userid, supplier_code
      HAVING COUNT(*) > 1
    `);

    console.log(`Found ${duplicates.length} sets of duplicates to clean up`);

    for (const duplicate of duplicates) {
      const orderIds = duplicate.order_ids.split(',').map((id: string) => parseInt(id));
      
      // Keep the first order and delete the rest
      const orderIdToKeep = orderIds[0];
      const orderIdsToDelete = orderIds.slice(1);
      
      // Update the kept order with the total quantity
      await db.runAsync(
        `UPDATE orders_to_sync 
         SET quantity = ? 
         WHERE id = ?`,
        [duplicate.total_quantity, orderIdToKeep]
      );
      
      // Delete the duplicate orders
      if (orderIdsToDelete.length > 0) {
        const placeholders = orderIdsToDelete.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM orders_to_sync 
           WHERE id IN (${placeholders})`,
          orderIdsToDelete
        );
      }
      
      console.log(`✅ Merged ${duplicate.duplicate_count} duplicates for barcode: ${duplicate.barcode}`);
    }
    
    return duplicates.length;
  } catch (error) {
    console.error("❌ Error cleaning up duplicate orders:", error);
    throw error;
  }
};

// Clear all sync data (for testing/reset)
export const clearAllSyncData = async () => {
  const db = getDatabase();
  try {
    await db.runAsync('DELETE FROM orders_to_sync');
    await db.runAsync('DELETE FROM sync_info');
    console.log("✅ All sync data cleared");
  } catch (error) {
    console.error("❌ Error clearing sync data:", error);
    throw error;
  }
};

// Run initial cleanup (optional)
export const runInitialCleanup = async () => {
  try {
    const cleanedCount = await cleanupDuplicateOrders();
    if (cleanedCount > 0) {
      console.log(`✅ Cleaned up ${cleanedCount} sets of duplicate orders`);
    }
    return cleanedCount;
  } catch (error) {
    console.error("❌ Initial cleanup failed:", error);
    return 0;
  }
};