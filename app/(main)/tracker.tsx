import { createEnhancedAPI } from "@/utils/api";
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Open the database
const db = SQLite.openDatabaseSync("magicpedia.db");

interface ProductData {
  code: string;
  name: string;
  catagory: string;
  product: string;
  brand: string;
  unit: string;
  taxcode: string;
  productcode: string;
  barcode: string;
  quantity: number;
  cost: number;
  bmrp: number;
  salesprice: number;
  secondprice: number;
  thirdprice: number;
  supplier: string;
  expirydate: string | null;
}

export default function StockTrackerScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<ProductData[]>([]);
  const [suggestions, setSuggestions] = useState<ProductData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchMode, setSearchMode] = useState<'barcode' | 'name'>('barcode');
  const [dataSource, setDataSource] = useState<'api' | 'database'>('api');
  const inputRef = useRef<TextInput>(null);

  // Camera scanner states
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMode, setScanMode] = useState<"hardware" | "camera">("hardware");
  const [scanned, setScanned] = useState(false);
  const scanLockRef = useRef(false);
  const processingAlertRef = useRef(false);

  // Load scan mode from settings
  useEffect(() => {
    const loadScanMode = async () => {
      const saved = await SecureStore.getItemAsync("scanMode");
      if (saved === "camera" || saved === "hardware") {
        setScanMode(saved);
      }
    };
    loadScanMode();
  }, []);

  // Initialize database and fetch products
  useEffect(() => {
    initializeDatabase();
  }, []);

  // Reset scan lock when scanner closes
  useEffect(() => {
    if (!showScanner) {
      setTimeout(() => {
        setScanned(false);
        scanLockRef.current = false;
        processingAlertRef.current = false;
      }, 300);
    }
  }, [showScanner]);

  const initializeDatabase = async () => {
    try {
      console.log('🔧 Initializing database schema...');
      
      // Check if new columns exist, if not add them
      await addMissingColumns();
      
      // Fetch products (with better error handling)
      try {
        await fetchAllProducts();
      } catch (error) {
        console.error('❌ Failed to fetch products during init:', error);
        // Already falls back to database in fetchAllProducts
      }
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      // Fallback: try to load from database directly
      try {
        await fetchFromDatabase();
      } catch (dbError) {
        console.error('❌ Critical: Cannot load data from database:', dbError);
        Alert.alert('Error', 'Failed to initialize. Please restart the app.');
      }
    }
  };

  const addMissingColumns = async () => {
    try {
      // Get existing columns
      const tableInfo = await db.getAllAsync("PRAGMA table_info(product_data)");
      const existingColumns = tableInfo.map((col: any) => col.name);
      
      console.log('📋 Existing columns:', existingColumns.join(', '));

      // Define required columns
      const requiredColumns = [
        { name: 'category', type: 'TEXT', default: '' },
        { name: 'product', type: 'TEXT', default: '' },
        { name: 'brand', type: 'TEXT', default: '' },
        { name: 'unit', type: 'TEXT', default: '' },
        { name: 'taxcode', type: 'TEXT', default: '0' },
        { name: 'productcode', type: 'TEXT', default: '' },
        { name: 'secondprice', type: 'REAL', default: 0 },
        { name: 'thirdprice', type: 'REAL', default: 0 },
        { name: 'expirydate', type: 'TEXT', default: null },
      ];

      // Add missing columns
      for (const col of requiredColumns) {
        if (!existingColumns.includes(col.name)) {
          const defaultValue = col.default === null ? 'NULL' : 
                              typeof col.default === 'string' ? `'${col.default}'` : 
                              col.default;
          
          const sql = `ALTER TABLE product_data ADD COLUMN ${col.name} ${col.type} DEFAULT ${defaultValue}`;
          await db.execAsync(sql);
          console.log(`✅ Added column: ${col.name}`);
        }
      }

      console.log('✅ Database schema updated successfully');
    } catch (error) {
      console.error('❌ Error adding columns:', error);
      // If table doesn't exist, create it
      await createProductTable();
    }
  };

  const createProductTable = async () => {
    try {
      console.log('🔨 Creating product_data table...');
      
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS product_data (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          barcode TEXT,
          quantity REAL DEFAULT 0,
          salesprice REAL DEFAULT 0,
          bmrp REAL DEFAULT 0,
          cost REAL DEFAULT 0,
          batch_supplier TEXT,
          e_cost REAL DEFAULT 0,
          e_qty REAL DEFAULT 0,
          category TEXT DEFAULT '',
          product TEXT DEFAULT '',
          brand TEXT DEFAULT '',
          unit TEXT DEFAULT '',
          taxcode TEXT DEFAULT '0',
          productcode TEXT DEFAULT '',
          secondprice REAL DEFAULT 0,
          thirdprice REAL DEFAULT 0,
          expirydate TEXT DEFAULT NULL
        )
      `);
      
      console.log('✅ Table created successfully');
    } catch (error) {
      console.error('❌ Error creating table:', error);
    }
  };

  const fetchAllProducts = async () => {
    try {
      console.log('📦 Attempting to fetch from API...');
      
      const apiPromise = (async () => {
        const api = await createEnhancedAPI();
        
        // Override the default timeout for this specific request
        return await api.get("/product-details", {
          timeout: 7000, // 7 seconds - shorter than our catch timeout
          headers: {
            'X-Silent-Error': 'true' // Mark as silent to suppress error logging
          }
        });
      })();
      
      const response = await apiPromise;
      
      let products: any[] = [];

      if (Array.isArray(response.data)) {
        products = response.data;
      } else if (typeof response.data === 'string') {
        products = JSON.parse(response.data);
      } else if (response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data.data)) {
          products = response.data.data;
        } else if (Array.isArray(response.data.products)) {
          products = response.data.products;
        }
      }

      if (products.length > 0) {
        // Check if we need to sync (only if database is empty or outdated)
        const existingCount = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM product_data'
        );
        
        // Only save if database is empty or has significantly fewer products
        if (!existingCount || existingCount.count < products.length * 0.9) {
          console.log(`💾 Syncing ${products.length} products to database...`);
          await saveProductsToDatabase(products);
        } else {
          console.log('✅ Database already synced, skipping save');
        }
      }

      // Map API data to ProductData format
      const mappedProducts = products.map((row: any) => ({
        code: String(row.code || row.item_code || row.itemcode || '').trim(),
        name: String(row.name || row.item_name || row.itemname || 'Unknown').trim(),
        catagory: String(row.catagory || row.category || row.cat || '').trim(),
        product: String(row.product || row.product_type || '').trim(),
        brand: String(row.brand || row.brand_name || '').trim(),
        unit: String(row.unit || row.unit_type || '').trim(),
        taxcode: String(row.taxcode || row.gst || row.tax || '0').trim(),
        productcode: String(row.productcode || row.product_code || '').trim(),
        barcode: String(row.barcode || row.bar_code || '').trim(),
        quantity: Number(row.quantity || row.stock || 0),
        cost: Number(row.cost || row.cost_price || 0),
        bmrp: Number(row.bmrp || row.mrp || 0),
        salesprice: Number(row.salesprice || row.sales_price || 0),
        secondprice: Number(row.secondprice || row.second_price || 0),
        thirdprice: Number(row.thirdprice || row.third_price || 0),
        supplier: String(row.supplier || row.batch_supplier || '').trim(),
        expirydate: row.expirydate || row.expiry_date || null
      }));

      setAllProducts(mappedProducts);
      setDataSource('api');
      console.log(`✅ Loaded ${mappedProducts.length} products from API`);
    } catch (error: any) {
      // Silently fall back to database - this is expected behavior when offline
      // Check if it's an abort error (expected) or actual error
      if (error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ECONNABORTED') {
        console.log('⚠️ API timeout - using local database');
      } else {
        console.log('⚠️ API not available - using local database');
      }
      await fetchFromDatabase();
    }
  };

  const saveProductsToDatabase = async (products: any[]) => {
    try {
      console.log('💾 Saving products to database...');
      const startTime = Date.now();
      
      // Use a transaction for much faster inserts
      await db.withTransactionAsync(async () => {
        // Clear existing data
        await db.runAsync('DELETE FROM product_data');
        
        // Prepare batch insert with multiple values
        const batchSize = 100;
        
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          
          // Create placeholders for batch insert
          const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
          
          // Flatten all values
          const values = batch.flatMap(product => [
            String(product.code || product.item_code || ''),
            String(product.name || product.item_name || 'Unknown'),
            String(product.barcode || ''),
            Number(product.quantity || 0),
            Number(product.salesprice || product.sales_price || 0),
            Number(product.bmrp || product.mrp || 0),
            Number(product.cost || 0),
            String(product.supplier || product.batch_supplier || ''),
            Number(product.e_cost || 0),
            Number(product.e_qty || 0),
            String(product.catagory || product.category || ''),
            String(product.product || product.product_type || ''),
            String(product.brand || ''),
            String(product.unit || ''),
            String(product.taxcode || product.gst || '0'),
            String(product.productcode || product.product_code || ''),
            Number(product.secondprice || product.second_price || 0),
            Number(product.thirdprice || product.third_price || 0),
            product.expirydate || product.expiry_date || null
          ]);
          
          // Insert batch
          await db.runAsync(
            `INSERT OR REPLACE INTO product_data (
              code, name, barcode, quantity, salesprice, bmrp, cost, 
              batch_supplier, e_cost, e_qty, category, product, brand, 
              unit, taxcode, productcode, secondprice, thirdprice, expirydate
            ) VALUES ${placeholders}`,
            values
          );
          
          // Log progress every 10 batches
          if (i % (batchSize * 10) === 0) {
            const progress = Math.round((i / products.length) * 100);
            console.log(`💾 Progress: ${progress}% (${i}/${products.length})`);
          }
        }
      });
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Successfully saved ${products.length} products in ${duration}s`);
    } catch (error) {
      console.error('❌ Error saving to database:', error);
    }
  };

  const fetchFromDatabase = async () => {
    try {
      const rows = await db.getAllAsync("SELECT * FROM product_data");
      
      if (rows.length === 0) {
        console.log('❌ No data in database');
        Alert.alert('No Data', 'Local database is empty. Please connect to internet to sync data.');
        return;
      }

      console.log('📊 DATABASE COLUMNS:', Object.keys(rows[0]).join(', '));
      
      const products: ProductData[] = rows.map((row: any) => ({
        code: String(row.code || '').trim(),
        name: String(row.name || 'Unknown').trim(),
        catagory: String(row.category || '').trim(),
        product: String(row.product || '').trim(),
        brand: String(row.brand || '').trim(),
        unit: String(row.unit || '').trim(),
        taxcode: String(row.taxcode || '0').trim(),
        productcode: String(row.productcode || '').trim(),
        barcode: String(row.barcode || '').trim(),
        quantity: Number(row.quantity || 0),
        cost: Number(row.cost || 0),
        bmrp: Number(row.bmrp || 0),
        salesprice: Number(row.salesprice || 0),
        secondprice: Number(row.secondprice || 0),
        thirdprice: Number(row.thirdprice || 0),
        supplier: String(row.batch_supplier || '').trim(),
        expirydate: row.expirydate || null
      }));

      setAllProducts(products);
      setDataSource('database');
      console.log(`✅ Loaded ${products.length} products from local database`);
      
      if (products.length > 0) {
        console.log('📋 SAMPLE PRODUCT:', JSON.stringify(products[0], null, 2));
      }
    } catch (error) {
      console.error('❌ Error fetching from database:', error);
      Alert.alert('Error', 'Failed to load products from local database: ' + error);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const toggleSearchMode = () => {
    const newMode = searchMode === 'barcode' ? 'name' : 'barcode';
    setSearchMode(newMode);
    setSearchText('');
    setProductData(null);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    
    if (text.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (searchMode === 'name' && text.trim().length >= 2) {
      const searchLower = text.toLowerCase().trim();
      const filtered = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchLower) ||
        product.brand?.toLowerCase().includes(searchLower) ||
        product.product?.toLowerCase().includes(searchLower)
      ).slice(0, 50);

      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (product: ProductData) => {
    setSearchText(product.name);
    setShowSuggestions(false);
    Keyboard.dismiss();
    displayProduct(product);
  };

  const displayProduct = (product: any) => {
    const validatedProduct: ProductData = {
      code: String(product.code || '').trim(),
      name: String(product.name || 'Unknown').trim(),
      catagory: String(product.catagory || product.category || '').trim(),
      product: String(product.product || '').trim(),
      brand: String(product.brand || '').trim(),
      unit: String(product.unit || '').trim(),
      taxcode: String(product.taxcode || product.gst || '0').trim(),
      productcode: String(product.productcode || product.product_code || '').trim(),
      barcode: String(product.barcode || '').trim(),
      quantity: Number(product.quantity) || 0,
      cost: Number(product.cost) || 0,
      bmrp: Number(product.bmrp) || Number(product.mrp) || 0,
      salesprice: Number(product.salesprice) || Number(product.sales_price) || 0,
      secondprice: Number(product.secondprice) || Number(product.second_price) || 0,
      thirdprice: Number(product.thirdprice) || Number(product.third_price) || 0,
      supplier: String(product.supplier || product.batch_supplier || '').trim(),
      expirydate: product.expirydate || product.expiry_date || null
    };
    
    setProductData(validatedProduct);
  };

  // FIXED: Search barcode with variants function (CASE-INSENSITIVE)
  const searchBarcodeWithVariants = async (barcode: string): Promise<ProductData[]> => {
    try {
      const trimmedBarcode = barcode.trim();
      
      console.log('🔍 Starting barcode search for:', trimmedBarcode);
      
      // SQLite LIKE is case-insensitive by default, but to be extra safe we'll use COLLATE NOCASE
      // Search for exact match (case-insensitive)
      const exactRows = await db.getAllAsync(
        `SELECT * FROM product_data 
         WHERE LOWER(barcode) = LOWER(?) 
            OR LOWER(productcode) = LOWER(?) 
            OR LOWER(code) = LOWER(?)`,
        [trimmedBarcode, trimmedBarcode, trimmedBarcode]
      );

      // Search for variants WITH space before colon (barcode : 1, barcode : 2) - case-insensitive
      const variantRows1 = await db.getAllAsync(
        `SELECT * FROM product_data 
         WHERE LOWER(barcode) LIKE LOWER(?) 
            OR LOWER(productcode) LIKE LOWER(?) 
            OR LOWER(code) LIKE LOWER(?)`,
        [`${trimmedBarcode} :%`, `${trimmedBarcode} :%`, `${trimmedBarcode} :%`]
      );

      // Search for variants WITHOUT space (barcode:1, barcode:2) - case-insensitive
      const variantRows2 = await db.getAllAsync(
        `SELECT * FROM product_data 
         WHERE LOWER(barcode) LIKE LOWER(?) 
            OR LOWER(productcode) LIKE LOWER(?) 
            OR LOWER(code) LIKE LOWER(?)`,
        [`${trimmedBarcode}:%`, `${trimmedBarcode}:%`, `${trimmedBarcode}:%`]
      );

      console.log('📊 Exact matches:', exactRows.length);
      console.log('📊 Variants (with space):', variantRows1.length);
      console.log('📊 Variants (no space):', variantRows2.length);

      // Combine all results and remove duplicates
      const allRows = [...exactRows, ...variantRows1, ...variantRows2];
      
      // Remove duplicates based on barcode (case-insensitive comparison)
      const uniqueRows = allRows.filter((row: any, index: number, self: any[]) => 
        index === self.findIndex((r: any) => 
          String(r.barcode || '').toLowerCase() === String(row.barcode || '').toLowerCase()
        )
      );

      console.log('📊 Total unique matches:', uniqueRows.length);

      // Map to ProductData format
      const mappedProducts: ProductData[] = uniqueRows.map((row: any) => ({
        code: String(row.code || '').trim(),
        name: String(row.name || 'Unknown').trim(),
        catagory: String(row.category || '').trim(),
        product: String(row.product || '').trim(),
        brand: String(row.brand || '').trim(),
        unit: String(row.unit || '').trim(),
        taxcode: String(row.taxcode || '0').trim(),
        productcode: String(row.productcode || '').trim(),
        barcode: String(row.barcode || '').trim(),
        quantity: Number(row.quantity || 0),
        cost: Number(row.cost || 0),
        bmrp: Number(row.bmrp || 0),
        salesprice: Number(row.salesprice || 0),
        secondprice: Number(row.secondprice || 0),
        thirdprice: Number(row.thirdprice || 0),
        supplier: String(row.batch_supplier || '').trim(),
        expirydate: row.expirydate || null
      }));

      console.log('✅ Returning', mappedProducts.length, 'products');
      if (mappedProducts.length > 0) {
        console.log('📋 First match:', mappedProducts[0].name, '|', mappedProducts[0].barcode);
      }
      
      return mappedProducts;
    } catch (error) {
      console.error('❌ Error searching barcode with variants:', error);
      return [];
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setShowSuggestions(false);
    Keyboard.dismiss();
    setLoading(true);

    try {
      if (searchMode === 'barcode') {
        await handleBarcodeSearch();
      } else {
        await handleNameSearch();
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      Alert.alert('Error', 'Failed to search. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeSearch = async () => {
    const searchBarcode = searchText.trim();
    
    // Use the new variant search function (now async and case-insensitive)
    const foundProducts = await searchBarcodeWithVariants(searchBarcode);
    
    if (foundProducts.length === 0) {
      Alert.alert(
        'Not Found', 
        `No exact match found for barcode: ${searchBarcode}\n\nPlease verify the barcode and try again.`
      );
      setProductData(null);
    } else if (foundProducts.length === 1) {
      // Single match - display directly
      console.log('🎯 Exact barcode match found:', foundProducts[0].name);
      displayProduct(foundProducts[0]);
    } else {
      // Multiple matches (variants) - show suggestions
      console.log(`📊 Found ${foundProducts.length} variants - showing suggestions`);
      setSuggestions(foundProducts);
      setShowSuggestions(true);
      setProductData(null);
    }
  };

  const handleNameSearch = async () => {
    const searchLower = searchText.toLowerCase().trim();
    
    const matches = allProducts.filter(product => 
      product.name.toLowerCase().includes(searchLower) ||
      product.brand?.toLowerCase().includes(searchLower) ||
      product.product?.toLowerCase().includes(searchLower)
    );

    if (matches.length === 1) {
      console.log('🎯 Single match found:', matches[0].name);
      displayProduct(matches[0]);
    } else if (matches.length > 1) {
      console.log(`📊 Found ${matches.length} matches`);
      setSuggestions(matches);
      setShowSuggestions(true);
      setProductData(null);
    } else {
      Alert.alert(
        'Not Found',
        `No products found matching: "${searchText}"`
      );
      setProductData(null);
    }
  };

  const handleClearAll = () => {
    setSearchText('');
    setProductData(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleScanBarcode = async () => {
    if (scanMode === "camera") {
      if (!permission) {
        return;
      }

      if (!permission.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert(
            "Camera Permission",
            "Camera permission is required to scan barcodes. Please enable it in settings."
          );
          return;
        }
      }

      setScanned(false);
      scanLockRef.current = false;
      processingAlertRef.current = false;
      setProductData(null);
      setSearchText('');
      setShowScanner(true);
    } else {
      Alert.alert('Scanner', 'Hardware scanner is active. Please scan using the device scanner.');
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current || scanned || processingAlertRef.current) {
      return;
    }
    
    scanLockRef.current = true;
    setScanned(true);
    setShowScanner(false);
    
    // Use the new variant search function (now async and case-insensitive)
    const foundProducts = await searchBarcodeWithVariants(data);
    
    if (foundProducts.length === 0) {
      processingAlertRef.current = true;
      
      setTimeout(() => {
        Alert.alert(
          'Not Found', 
          `No product found for barcode: ${data}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setScanned(false);
                scanLockRef.current = false;
                processingAlertRef.current = false;
              }
            }
          ],
          { 
            cancelable: false,
            onDismiss: () => {
              setScanned(false);
              scanLockRef.current = false;
              processingAlertRef.current = false;
            }
          }
        );
      }, 300);
    } else if (foundProducts.length === 1) {
      // Single match - display directly
      console.log('🎯 Barcode scanned:', foundProducts[0].name);
      setSearchText(data);
      setSearchMode('barcode');
      displayProduct(foundProducts[0]);
      setTimeout(() => {
        setScanned(false);
        scanLockRef.current = false;
      }, 500);
    } else {
      // Multiple matches (variants) - show suggestions
      console.log(`📊 Found ${foundProducts.length} variants from scan`);
      setSearchText(data);
      setSearchMode('barcode');
      setSuggestions(foundProducts);
      setShowSuggestions(true);
      setProductData(null);
      setTimeout(() => {
        setScanned(false);
        scanLockRef.current = false;
      }, 500);
    }
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    setTimeout(() => {
      setScanned(false);
      scanLockRef.current = false;
      processingAlertRef.current = false;
    }, 300);
  };

  const renderSuggestionItem = ({ item }: { item: ProductData }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => handleSelectSuggestion(item)}
    >
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.suggestionDetailsContainer}>
          <View style={styles.detailChip}>
            <Text style={styles.detailChipLabel}>Stock:</Text>
            <Text style={styles.detailChipValue}>{Math.abs(item.quantity)}</Text>
          </View>
          <View style={[styles.detailChip, styles.detailChipMRP]}>
            <Text style={styles.detailChipLabel}>MRP:</Text>
            <Text style={styles.detailChipValue}>₹{item.bmrp.toFixed(2)}</Text>
          </View>
          <View style={[styles.detailChip, styles.detailChipPrice]}>
            <Text style={styles.detailChipLabel}>S.Price:</Text>
            <Text style={styles.detailChipValue}>₹{item.salesprice.toFixed(2)}</Text>
          </View>
          {item.barcode && (
            <View style={[styles.detailChip, styles.detailChipBarcode]}>
              <Ionicons name="barcode-outline" size={12} color="#5E35B1" style={{ marginRight: 2 }} />
              <Text style={styles.detailChipValue} numberOfLines={1}>{item.barcode}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999999" />
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1B5E20" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>STOCK TRACKER</Text>
        <TouchableOpacity onPress={handleScanBarcode} style={styles.searchButton}>
          <Ionicons name="barcode-outline" size={22} color="#1B5E20" />
        </TouchableOpacity>
      </View>

      {/* Camera Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={handleCloseScanner}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                "qr",
                "ean13",
                "ean8",
                "code128",
                "code39",
                "upc_a",
                "upc_e",
                "code93",
                "itf14",
              ],
            }}
          >
            <View style={styles.scannerOverlay}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleCloseScanner}
              >
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>

              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>

              <View style={styles.instructionsContainer}>
                <Text style={styles.instructionsText}>
                  {scanned ? 'Processing...' : 'Align barcode within the frame'}
                </Text>
              </View>
            </View>
          </CameraView>
        </View>
      </Modal>

      {/* Search Mode Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            styles.toggleButtonLeft,
            searchMode === 'barcode' && styles.toggleButtonActive
          ]}
          onPress={() => searchMode !== 'barcode' && toggleSearchMode()}
        >
          <Ionicons 
            name="barcode-outline" 
            size={18} 
            color={searchMode === 'barcode' ? '#FFFFFF' : '#666666'} 
            style={styles.toggleIcon}
          />
          <Text style={[
            styles.toggleText,
            searchMode === 'barcode' && styles.toggleTextActive
          ]}>
            Barcode Search
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.toggleButton,
            styles.toggleButtonRight,
            searchMode === 'name' && styles.toggleButtonActive
          ]}
          onPress={() => searchMode !== 'name' && toggleSearchMode()}
        >
          <Ionicons 
            name="search" 
            size={18} 
            color={searchMode === 'name' ? '#FFFFFF' : '#666666'} 
            style={styles.toggleIcon}
          />
          <Text style={[
            styles.toggleText,
            searchMode === 'name' && styles.toggleTextActive
          ]}>
            Item Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={styles.inputContainer}>
          <Ionicons 
            name={searchMode === 'barcode' ? 'barcode-outline' : 'search'} 
            size={20} 
            color="#999999" 
            style={styles.inputIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={searchMode === 'barcode' ? 'Enter barcode...' : 'Search by name...'}
            value={searchText}
            onChangeText={handleSearchTextChange}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            editable={!loading}
            autoCapitalize="none"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.clearIcon}>
              <Ionicons name="close-circle" size={20} color="#999999" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Autocomplete Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 ? (
        <View style={styles.suggestionsContainer}>
          {searchMode === 'barcode' && suggestions.length > 1 && (
            <Text style={styles.variantsHeader}>
              Found {suggestions.length} variants - Select one:
            </Text>
          )}
          <FlatList
            data={suggestions}
            keyExtractor={(item, index) => `${item.barcode}-${index}`}
            renderItem={renderSuggestionItem}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
            contentContainerStyle={styles.suggestionsContentContainer}
            showsVerticalScrollIndicator={true}
          />
        </View>
      ) : (
        <>
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.itemDetailsButton}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Search</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleClearAll} 
              style={styles.clearButton}
              disabled={loading}
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView}>
            {/* Item Details Section */}
            {productData && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Item Details</Text>
                </View>
                <View style={styles.detailsContainer}>
                  <DetailRow label="Item Name" value={productData.name || 'N/A'} />
                  <DetailRow label="Item Code" value={productData.code || 'N/A'} />
                  <DetailRow label="Category" value={productData.catagory || 'N/A'} />
                  <DetailRow label="Product" value={productData.product || 'N/A'} />
                  <DetailRow label="Brand" value={productData.brand || 'N/A'} />
                  <DetailRow label="Unit" value={productData.unit || 'N/A'} />
                  <DetailRow label="GST" value={productData.taxcode ? `${productData.taxcode}%` : 'N/A'} />
                </View>
              </View>
            )}

            {/* Barcode Details Section */}
            {productData && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Barcode Details</Text>
                  <Text style={styles.liveData}>
                    {dataSource === 'api' ? 'Live Data' : 'Offline Data'}
                  </Text>
                </View>
                <View style={styles.detailsContainer}>
                  <DetailRow label="Barcode" value={productData.barcode || 'N/A'} />
                  <DetailRow label="Product Code" value={productData.productcode || 'N/A'} />
                  <DetailRow label="Stock Available" value={`${Math.abs(productData.quantity)}`} />
                  <DetailRow label="Cost" value={`₹${productData.cost.toFixed(2)}`} isHighlighted />
                  <DetailRow label="MRP" value={`₹${productData.bmrp.toFixed(2)}`} isHighlighted />
                  <DetailRow label="Sales Price" value={`₹${productData.salesprice.toFixed(2)}`} isHighlighted />
                  <DetailRow label="Second Price" value={`₹${productData.secondprice.toFixed(2)}`} />
                  <DetailRow label="Third Price" value={`₹${productData.thirdprice.toFixed(2)}`} />
                  <DetailRow label="Supplier" value={productData.supplier || 'N/A'} />
                  <DetailRow label="Expiry" value={productData.expirydate || 'N/A'} />
                </View>
              </View>
            )}

            {/* Empty State */}
            {!productData && !loading && (
              <View style={styles.emptyState}>
                <Ionicons 
                  name={searchMode === 'barcode' ? 'barcode-outline' : 'search-outline'} 
                  size={64} 
                  color="#CCCCCC" 
                />
                <Text style={styles.emptyText}>
                  {searchMode === 'barcode' 
                    ? 'Enter barcode for exact match' 
                    : 'Enter item name for fuzzy search'}
                </Text>
                <Text style={styles.dataSourceNote}>
                  {dataSource === 'api' ? '🟢 Connected to server' : '🔴 Working offline'}
                </Text>
                <Text style={styles.productCount}>
                  {allProducts.length} products loaded
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const DetailRow = ({ label, value, isHighlighted = false }: { 
  label: string; 
  value: string; 
  isHighlighted?: boolean 
}) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label} :</Text>
    <Text style={[styles.detailValue, isHighlighted && styles.highlightedValue]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? 45 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1B5E20',
    textAlign: 'center',
    flex: 1,
  },
  searchButton: {
    padding: 8,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#1B5E20',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  instructionsText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  toggleButtonLeft: {
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  toggleButtonRight: {
    borderLeftWidth: 0,
  },
  toggleButtonActive: {
    backgroundColor: '#1B5E20',
  },
  toggleIcon: {
    marginRight: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0d9431ff',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  inputIcon: {
    marginLeft: 12,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  clearIcon: {
    padding: 8,
    marginRight: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 235 : 235,
    left: 16,
    right: 16,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  variantsHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF9E6',
    paddingVertical: 8,
  },
  suggestionsList: {
    flex: 1,
  },
  suggestionsContentContainer: {
    paddingBottom: 16,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionContent: {
    flex: 1,
    marginRight: 8,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 6,
  },
  suggestionDetailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  detailChipMRP: {
    backgroundColor: '#FFF3E0',
  },
  detailChipPrice: {
    backgroundColor: '#E8F5E9',
  },
  detailChipBarcode: {
    backgroundColor: '#F3E5F5',
    maxWidth: 120,
  },
  detailChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555555',
    marginRight: 3,
  },
  detailChipValue: {
    fontSize: 11,
    fontWeight: '500',
    color: '#333333',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  itemDetailsButton: {
    flex: 1,
    backgroundColor: '#1B5E20',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#38c73dff',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
    marginTop: 16,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionHeader: {
    backgroundColor: '#1B5E20',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  liveData: {
    color: '#FFB74D',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsContainer: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: '#555555',
    fontWeight: '500',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#333333',
    fontWeight: '600',
    textAlign: 'right',
  },
  highlightedValue: {
    color: '#FF9800',
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  dataSourceNote: {
    fontSize: 14,
    color: '#2E7D7A',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  productCount: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    marginTop: 4,
  },
});