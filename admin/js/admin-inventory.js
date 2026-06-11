// ==========================================================================
// RUSSELL HALL CAFÉ — ADMIN INVENTORY, MENU CUSTOMIZER & ROTA MODULE
// ==========================================================================

(function() {
  const db = firebase.firestore();
  const auth = firebase.auth();

  // Helper selectors
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const formatPrice = n => '£' + n.toFixed(2);

  // Global variables
  let rotaWeekStarting = getMondayOfCurrentWeek(new Date());
  let cachedCategoriesList = [];
  let cachedMenuItemsList = [];


  // ==========================================================================
  // 1. DATABASE PRE-POPULATION (57 INGREDIENTS & 7 SUPPLIERS)
  // ==========================================================================
  const DEFAULT_SUPPLIERS = [
    { id: "sup1", name: "Smithfield Meats", contactPerson: "David Smith", phone: "+447700900077", email: "orders@smithfieldmeats.co.uk", address: "Smithfield Market, London EC1A 9LH", paymentTerms: "Net 30", deliveryDays: ["Monday", "Wednesday", "Friday"], minimumOrderValue: 100, activeItems: 12 },
    { id: "sup2", name: "Midlands Fresh Dairy", contactPerson: "Sarah Green", phone: "+447700900088", email: "info@midlandsdairy.co.uk", address: "Dairy Lane, Birmingham B3 2EP", paymentTerms: "Net 14", deliveryDays: ["Tuesday", "Thursday", "Saturday"], minimumOrderValue: 50, activeItems: 8 },
    { id: "sup3", name: "Dudley Bakers & Flour", contactPerson: "Paul Baker", phone: "+447700900099", email: "sales@dudleybakers.co.uk", address: "High St, Dudley DY1 1QA", paymentTerms: "Cash on Delivery", deliveryDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], minimumOrderValue: 30, activeItems: 6 },
    { id: "sup4", name: "Stourbridge Greens Ltd", contactPerson: "Helen Root", phone: "+447700900111", email: "helen@stourbridgegreens.co.uk", address: "Market Rd, Stourbridge DY8 1UF", paymentTerms: "Net 30", deliveryDays: ["Tuesday", "Friday"], minimumOrderValue: 75, activeItems: 15 },
    { id: "sup5", name: "Global Pantry Imports", contactPerson: "Marcus Vance", phone: "+447700900222", email: "marcus@globalpantry.co.uk", address: "Vance Depot, Wolverhampton WV1 1HT", paymentTerms: "Net 60", deliveryDays: ["Thursday"], minimumOrderValue: 150, activeItems: 25 },
    { id: "sup6", name: "Excel Packaging Co", contactPerson: "Gemma Box", phone: "+447700900333", email: "gem@excelpack.co.uk", address: "Industrial Estate, Dudley DY2 9SY", paymentTerms: "Net 30", deliveryDays: ["Wednesday"], minimumOrderValue: 80, activeItems: 5 },
    { id: "sup7", name: "Brierley Hill Spirits", contactPerson: "John Hops", phone: "+447700900444", email: "hops@brierleyhillspirits.co.uk", address: "Canal St, Brierley Hill DY5 1LN", paymentTerms: "Net 14", deliveryDays: ["Thursday", "Friday"], minimumOrderValue: 120, activeItems: 18 }
  ];

  const DEFAULT_INGREDIENTS = [
    // Meat and Poultry
    { id: "ing1", name: "Bacon Rashers (Smoked)", category: "Meat and Poultry", unit: "pack", currentStock: 45, minimumStock: 15, maximumStock: 80, reorderPoint: 20, costPerUnit: 4.50, supplierName: "Smithfield Meats", expiryBatches: [] },
    { id: "ing2", name: "Pork Sausages (Premium)", category: "Meat and Poultry", unit: "pack", currentStock: 30, minimumStock: 10, maximumStock: 60, reorderPoint: 15, costPerUnit: 3.80, supplierName: "Smithfield Meats", expiryBatches: [] },
    { id: "ing3", name: "Chicken Breasts", category: "Meat and Poultry", unit: "kg", currentStock: 12, minimumStock: 5, maximumStock: 25, reorderPoint: 8, costPerUnit: 6.20, supplierName: "Smithfield Meats", expiryBatches: [] },
    { id: "ing4", name: "Beef Burger Patties (1/4 lb)", category: "Meat and Poultry", unit: "box", currentStock: 8, minimumStock: 4, maximumStock: 15, reorderPoint: 5, costPerUnit: 18.50, supplierName: "Smithfield Meats", expiryBatches: [] },
    { id: "ing5", name: "Ham Slices", category: "Meat and Poultry", unit: "pack", currentStock: 22, minimumStock: 8, maximumStock: 40, reorderPoint: 12, costPerUnit: 2.20, supplierName: "Smithfield Meats", expiryBatches: [] },
    
    // Dairy and Eggs
    { id: "ing6", name: "Free Range Eggs (Large)", category: "Dairy and Eggs", unit: "flat", currentStock: 18, minimumStock: 5, maximumStock: 30, reorderPoint: 8, costPerUnit: 5.50, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing7", name: "Whole Milk", category: "Dairy and Eggs", unit: "gallon", currentStock: 15, minimumStock: 6, maximumStock: 25, reorderPoint: 8, costPerUnit: 2.80, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing8", name: "Salted Butter", category: "Dairy and Eggs", unit: "kg", currentStock: 10, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 4.20, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing9", name: "Cheddar Cheese (Grated)", category: "Dairy and Eggs", unit: "kg", currentStock: 14, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 5.10, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing10", name: "Mozzarella Cheese", category: "Dairy and Eggs", unit: "kg", currentStock: 8, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 6.00, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing11", name: "Double Cream", category: "Dairy and Eggs", unit: "litre", currentStock: 6, minimumStock: 2, maximumStock: 10, reorderPoint: 3, costPerUnit: 3.40, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },

    // Bread and Bakery
    { id: "ing12", name: "Brioche Burger Buns", category: "Bread and Bakery", unit: "pack", currentStock: 55, minimumStock: 20, maximumStock: 100, reorderPoint: 30, costPerUnit: 1.80, supplierName: "Dudley Bakers & Flour", expiryBatches: [] },
    { id: "ing13", name: "White Bread Sourdough", category: "Bread and Bakery", unit: "loaf", currentStock: 14, minimumStock: 5, maximumStock: 25, reorderPoint: 8, costPerUnit: 1.95, supplierName: "Dudley Bakers & Flour", expiryBatches: [] },
    { id: "ing14", name: "Brown Toasting Bread", category: "Bread and Bakery", unit: "loaf", currentStock: 12, minimumStock: 5, maximumStock: 25, reorderPoint: 8, costPerUnit: 1.50, supplierName: "Dudley Bakers & Flour", expiryBatches: [] },
    { id: "ing15", name: "English Muffins", category: "Bread and Bakery", unit: "pack", currentStock: 26, minimumStock: 10, maximumStock: 50, reorderPoint: 15, costPerUnit: 1.20, supplierName: "Dudley Bakers & Flour", expiryBatches: [] },
    { id: "ing16", name: "Pancake Mix", category: "Bread and Bakery", unit: "kg", currentStock: 10, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 2.10, supplierName: "Dudley Bakers & Flour", expiryBatches: [] },

    // Vegetables
    { id: "ing17", name: "Tomatoes (Plum)", category: "Vegetables", unit: "kg", currentStock: 18, minimumStock: 6, maximumStock: 30, reorderPoint: 10, costPerUnit: 1.90, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing18", name: "Avocado (Ripe)", category: "Vegetables", unit: "box", currentStock: 4, minimumStock: 2, maximumStock: 8, reorderPoint: 3, costPerUnit: 12.00, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing19", name: "Mushrooms (Flat)", category: "Vegetables", unit: "kg", currentStock: 9, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 2.80, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing20", name: "Spinach Leaves", category: "Vegetables", unit: "bag", currentStock: 15, minimumStock: 5, maximumStock: 25, reorderPoint: 8, costPerUnit: 1.40, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing21", name: "Iceberg Lettuce", category: "Vegetables", unit: "box", currentStock: 5, minimumStock: 2, maximumStock: 10, reorderPoint: 4, costPerUnit: 7.50, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing22", name: "Red Onions", category: "Vegetables", unit: "kg", currentStock: 10, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 1.10, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing23", name: "Fresh Lemons", category: "Vegetables", unit: "bag", currentStock: 11, minimumStock: 3, maximumStock: 20, reorderPoint: 5, costPerUnit: 2.30, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },
    { id: "ing24", name: "Fresh Mint Leaves", category: "Vegetables", unit: "pack", currentStock: 8, minimumStock: 2, maximumStock: 15, reorderPoint: 4, costPerUnit: 0.95, supplierName: "Stourbridge Greens Ltd", expiryBatches: [] },

    // Pantry
    { id: "ing25", name: "Baked Beans (Heinz)", category: "Pantry", unit: "tin", currentStock: 40, minimumStock: 12, maximumStock: 80, reorderPoint: 20, costPerUnit: 0.85, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing26", name: "Tomato Ketchup", category: "Pantry", unit: "bottle", currentStock: 18, minimumStock: 5, maximumStock: 30, reorderPoint: 8, costPerUnit: 1.70, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing27", name: "Mayonnaise", category: "Pantry", unit: "tub", currentStock: 6, minimumStock: 2, maximumStock: 12, reorderPoint: 4, costPerUnit: 8.50, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing28", name: "Brown Sauce (HP)", category: "Pantry", unit: "bottle", currentStock: 12, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 1.90, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing29", name: "Salt & Pepper Shakers", category: "Pantry", unit: "box", currentStock: 3, minimumStock: 1, maximumStock: 6, reorderPoint: 2, costPerUnit: 4.80, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing30", name: "Cooking Oil (Vegetable)", category: "Pantry", unit: "drum", currentStock: 5, minimumStock: 2, maximumStock: 10, reorderPoint: 3, costPerUnit: 22.00, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing31", name: "Maple Syrup", category: "Pantry", unit: "bottle", currentStock: 14, minimumStock: 4, maximumStock: 25, reorderPoint: 6, costPerUnit: 3.10, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing32", name: "Granulated Sugar", category: "Pantry", unit: "bag", currentStock: 10, minimumStock: 3, maximumStock: 20, reorderPoint: 5, costPerUnit: 1.60, supplierName: "Global Pantry Imports", expiryBatches: [] },

    // Frozen
    { id: "ing33", name: "Hash Browns (Frozen)", category: "Frozen", unit: "box", currentStock: 7, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 11.20, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing34", name: "French Fries (Frozen)", category: "Frozen", unit: "box", currentStock: 9, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 9.80, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing35", name: "Ice Cubes Bags", category: "Frozen", unit: "bag", currentStock: 25, minimumStock: 10, maximumStock: 50, reorderPoint: 15, costPerUnit: 1.10, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },

    // Sauces
    { id: "ing36", name: "Hot Buffalo Sauce", category: "Sauces", unit: "bottle", currentStock: 8, minimumStock: 2, maximumStock: 15, reorderPoint: 4, costPerUnit: 2.40, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing37", name: "BBQ Smoked Sauce", category: "Sauces", unit: "bottle", currentStock: 11, minimumStock: 3, maximumStock: 20, reorderPoint: 5, costPerUnit: 2.10, supplierName: "Global Pantry Imports", expiryBatches: [] },

    // Coffee and Tea
    { id: "ing38", name: "Espresso Beans Blend", category: "Coffee and Tea", unit: "kg", currentStock: 15, minimumStock: 5, maximumStock: 30, reorderPoint: 8, costPerUnit: 14.50, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing39", name: "English Breakfast Tea Bags", category: "Coffee and Tea", unit: "box", currentStock: 6, minimumStock: 2, maximumStock: 10, reorderPoint: 3, costPerUnit: 6.80, supplierName: "Global Pantry Imports", expiryBatches: [] },
    { id: "ing40", name: "Hot Chocolate Powder", category: "Coffee and Tea", unit: "tub", currentStock: 8, minimumStock: 3, maximumStock: 15, reorderPoint: 5, costPerUnit: 9.20, supplierName: "Global Pantry Imports", expiryBatches: [] },

    // Spirits
    { id: "ing41", name: "Vodka (Smirnoff)", category: "Spirits", unit: "bottle", currentStock: 10, minimumStock: 3, maximumStock: 15, reorderPoint: 4, costPerUnit: 15.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing42", name: "Coffee Liqueur (Kahlua)", category: "Spirits", unit: "bottle", currentStock: 6, minimumStock: 2, maximumStock: 10, reorderPoint: 3, costPerUnit: 14.00, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing43", name: "Tequila Blanco", category: "Spirits", unit: "bottle", currentStock: 5, minimumStock: 2, maximumStock: 10, reorderPoint: 3, costPerUnit: 18.00, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing44", name: "Gin (Gordon's)", category: "Spirits", unit: "bottle", currentStock: 8, minimumStock: 2, maximumStock: 15, reorderPoint: 4, costPerUnit: 14.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },

    // Alcohol
    { id: "ing45", name: "Corona Extra Beer", category: "Alcohol", unit: "case", currentStock: 12, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 24.00, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing46", name: "Peroni Nastro Azzurro", category: "Alcohol", unit: "case", currentStock: 10, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 26.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing47", name: "Prosecco Spumante", category: "Alcohol", unit: "bottle", currentStock: 15, minimumStock: 5, maximumStock: 30, reorderPoint: 8, costPerUnit: 7.20, supplierName: "Brierley Hill Spirits", expiryBatches: [] },

    // Soft Drinks
    { id: "ing48", name: "Coca-Cola Cans", category: "Soft Drinks", unit: "case", currentStock: 18, minimumStock: 6, maximumStock: 30, reorderPoint: 8, costPerUnit: 9.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing49", name: "Diet Coke Cans", category: "Soft Drinks", unit: "case", currentStock: 16, minimumStock: 6, maximumStock: 30, reorderPoint: 8, costPerUnit: 9.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing50", name: "Sprite Cans", category: "Soft Drinks", unit: "case", currentStock: 10, minimumStock: 4, maximumStock: 20, reorderPoint: 5, costPerUnit: 9.50, supplierName: "Brierley Hill Spirits", expiryBatches: [] },
    { id: "ing51", name: "Still Mineral Water", category: "Soft Drinks", unit: "case", currentStock: 12, minimumStock: 4, maximumStock: 20, reorderPoint: 6, costPerUnit: 6.20, supplierName: "Midlands Fresh Dairy", expiryBatches: [] },
    { id: "ing52", name: "Soda Water Cans", category: "Soft Drinks", unit: "case", currentStock: 8, minimumStock: 3, maximumStock: 15, reorderPoint: 4, costPerUnit: 8.00, supplierName: "Brierley Hill Spirits", expiryBatches: [] },

    // Packaging
    { id: "ing53", name: "Takeaway Burger Boxes", category: "Packaging", unit: "pack", currentStock: 150, minimumStock: 50, maximumStock: 300, reorderPoint: 80, costPerUnit: 0.12, supplierName: "Excel Packaging Co", expiryBatches: [] },
    { id: "ing54", name: "Paper Takeaway Bags", category: "Packaging", unit: "pack", currentStock: 200, minimumStock: 50, maximumStock: 400, reorderPoint: 100, costPerUnit: 0.08, supplierName: "Excel Packaging Co", expiryBatches: [] },
    { id: "ing55", name: "Coffee Cups (12oz)", category: "Packaging", unit: "pack", currentStock: 250, minimumStock: 100, maximumStock: 500, reorderPoint: 150, costPerUnit: 0.07, supplierName: "Excel Packaging Co", expiryBatches: [] },
    { id: "ing56", name: "Plastic Drink Lids", category: "Packaging", unit: "pack", currentStock: 180, minimumStock: 50, maximumStock: 300, reorderPoint: 80, costPerUnit: 0.03, supplierName: "Excel Packaging Co", expiryBatches: [] },
    { id: "ing57", name: "Napkins Paper", category: "Packaging", unit: "pack", currentStock: 300, minimumStock: 100, maximumStock: 600, reorderPoint: 150, costPerUnit: 0.02, supplierName: "Excel Packaging Co", expiryBatches: [] }
  ];

  function prepopulateInventorySystem() {
    db.collection('suppliers').get().then(snap => {
      if (snap.empty) {
        console.log("[Seeding] Prepopulating suppliers...");
        const batch = db.batch();
        DEFAULT_SUPPLIERS.forEach(s => {
          batch.set(db.collection('suppliers').doc(s.id), s);
        });
        batch.commit();
      }
    });

    db.collection('inventory').get().then(snap => {
      if (snap.empty) {
        console.log("[Seeding] Prepopulating inventory ingredients...");
        const batch = db.batch();
        DEFAULT_INGREDIENTS.forEach(i => {
          batch.set(db.collection('inventory').doc(i.id), i);
        });
        batch.commit();
      }
    });
  }

  // ==========================================================================
  // 2. RECIPE MAPPING & AUTO DEDUCTIONS
  // ==========================================================================
  const RECIPES = {
    // Breakfast items
    b1: { ing6: 2, ing1: 2, ing25: 1, ing33: 2, ing19: 2 }, // Small Breakfast: 2 eggs, 2 bacon, 1 beans, 2 hash brown, 2 mushrooms
    b2: { ing6: 2, ing2: 2, ing1: 2, ing19: 2, ing33: 2, ing25: 1, ing13: 2 }, // Large Breakfast
    b3: { ing6: 2, ing19: 3, ing33: 2, ing25: 1, ing13: 2 }, // Veggie Breakfast
    b4: { ing6: 1, ing1: 1, ing2: 1, ing25: 1, ing33: 1, ing13: 1 }, // Traditional Breakfast
    b5: { ing6: 2, ing33: 2, ing1: 2, ing2: 2, ing16: 2, ing31: 1 }, // American Breakfast

    // Muffins
    m1: { ing6: 1, ing10: 1, ing15: 1, ing8: 1 }, // Egg & Cheese
    m2: { ing6: 1, ing1: 1, ing15: 1, ing8: 1 }, // Egg & Bacon
    m3: { ing6: 1, ing2: 1, ing15: 1, ing8: 1 }, // Egg & Sausage
    m4: { ing6: 1, ing2: 1, ing1: 1, ing10: 1, ing15: 1, ing8: 1 }, // Breakfast Muffin

    // Toasties
    t1: { ing13: 2, ing9: 2, ing17: 2, ing8: 1 }, // Cheese & Tomato
    t2: { ing13: 2, ing9: 1, ing5: 2, ing8: 1 }, // Ham & Cheese
    t3: { ing13: 2, ing1: 2, ing18: 1, ing17: 1, ing8: 1 }, // Bacon, Avo, Tomato

    // Sandwiches
    s1: { ing14: 2, ing1: 3, ing17: 1, ing21: 1, ing27: 1 }, // BLT
    s2: { ing14: 2, ing18: 1.5, ing17: 1, ing20: 1 }, // Avocado Club
    s3: { ing14: 2, ing3: 1.5, ing21: 1, ing27: 1 }, // Chicken Mayo

    // Burgers
    bu1: { ing12: 1, ing4: 1, ing9: 1, ing21: 1, ing22: 1, ing26: 1 }, // Classic Quarter
    bu2: { ing12: 1, ing4: 2, ing9: 2, ing21: 1, ing22: 1, ing26: 1 }, // Double Quarter
    bu3: { ing12: 1, ing3: 1.5, ing9: 1, ing21: 1, ing27: 1 }, // Crispy Chicken
    bu4: { ing12: 1, ing4: 1, ing1: 2, ing9: 1, ing37: 1 }, // BBQ Bacon

    // Sides
    si1: { ing34: 1, ing29: 1 }, // Fries
    si2: { ing34: 1, ing9: 2 }, // Cheesy Fries
    si3: { ing34: 1, ing1: 2, ing9: 2, ing36: 1 }, // Loaded Fries
    si4: { ing35: 0.1, ing17: 1, ing21: 1, ing22: 1 }, // Side Salad

    // Drinks / Coffee
    c1: { ing38: 0.02, ing35: 0.1 }, // Espresso
    c2: { ing38: 0.02, ing7: 0.2 }, // Latte
    c3: { ing38: 0.02, ing7: 0.15 }, // Cappuccino
    c4: { ing38: 0.02, ing7: 0.2, ing40: 0.02 }, // Mocha
    c5: { ing38: 0.02, ing7: 0.1 }, // Flat White
    c6: { ing39: 1, ing7: 0.05 }, // Tea

    // Cocktails
    ck1: { ing41: 1, ing42: 1, ing38: 0.02, ing35: 0.1 }, // Espresso Martini
    ck2: { ing43: 1, ing23: 1, ing24: 5, ing35: 0.15, ing52: 0.5 }, // Tequila Mojito
    ck3: { ing47: 1, ing23: 0.5, ing35: 0.1 }, // Mimosa

    // Soft Drinks
    sd1: { ing48: 1 }, // Coke
    sd2: { ing49: 1 }, // Diet Coke
    sd3: { ing50: 1 }, // Sprite
    sd4: { ing51: 1 } // Water
  };

  // Listen to orders to auto-deduct stock on status -> 'preparing'
  function startOrderDeductionListener() {
    console.log("[Firebase] Starting real-time order deduction listener...");
    db.collection('orders').where('status', '==', 'preparing').onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const order = doc.data();
        if (order.ingredientsDeducted) return; // Prevent duplicate deductions
        
        console.log(`[Deduction] Processing order #${order.orderId}...`);
        deductIngredientsForOrder(doc.id, order);
      });
    });
  }

  function deductIngredientsForOrder(orderDocId, order) {
    const batch = db.batch();
    const logsRefs = [];
    const auditLogs = [];
    let deductionCount = 0;

    // Deduct stock for each cart item
    const promises = order.items.map(cartItem => {
      // Find the base itemId (strip size decorations like "(Large)")
      const baseId = getBaseProductId(cartItem.id);
      const recipe = RECIPES[baseId];
      if (!recipe) {
        console.log(`[Deduction] No recipe map for item: ${baseId} (${cartItem.name})`);
        return Promise.resolve();
      }

      const itemQty = cartItem.qty || 1;

      // For each ingredient in the recipe
      return Promise.all(Object.entries(recipe).map(([ingId, qtyPerUnit]) => {
        const totalQty = qtyPerUnit * itemQty;
        const ingRef = db.collection('inventory').doc(ingId);
        
        return ingRef.get().then(ingDoc => {
          if (!ingDoc.exists) return;
          const current = ingDoc.data().currentStock || 0;
          const updated = Math.max(0, current - totalQty);
          
          batch.update(ingRef, { 
            currentStock: updated,
            lastRestocked: firebase.firestore.FieldValue.serverTimestamp()
          });

          // Log stock change
          const logRef = db.collection('inventoryLog').doc();
          batch.set(logRef, {
            logId: logRef.id,
            itemId: ingId,
            itemName: ingDoc.data().name,
            changeType: "used",
            previousStock: current,
            newStock: updated,
            changedBy: auth.currentUser ? auth.currentUser.uid : "system",
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            notes: `Auto-deducted for Order #${order.orderId}`
          });
          
          deductionCount++;
        });
      }));
    });

    Promise.all(promises).then(() => {
      if (deductionCount > 0) {
        // Mark order as ingredientsDeducted
        batch.update(db.collection('orders').doc(orderDocId), {
          ingredientsDeducted: true
        });
        
        // Log auditing
        const auditRef = db.collection('auditLog').doc();
        batch.set(auditRef, {
          auditId: auditRef.id,
          action: "AUTO_DEDUCT_STOCK",
          performedBy: "system",
          performedByName: "Kitchen Auto Sync",
          targetCollection: "orders",
          targetId: order.orderId,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.commit().then(() => {
          console.log(`[Deduction] ✓ Stock successfully deducted for order #${order.orderId}`);
        }).catch(err => {
          console.error(`[Deduction] ✗ Failed committing batch for order #${order.orderId}:`, err);
        });
      }
    });
  }

  function getBaseProductId(id) {
    // E.g., if id is "bu2_large", or if sizes are appended
    // The base menu list has keys like b1, m1, t1, s1, bu1, si1, c1, ck1, sd1
    // Let's extract letters + numbers
    const match = id.match(/^[a-z]+\d+/i);
    return match ? match[0].toLowerCase() : id;
  }

  // ==========================================================================
  // 3. STAFF WEEKLY ROTA SCHEDULER
  // ==========================================================================
  function initWeeklyRota() {
    renderRotaCalendar();
    
    // Day controls
    $('#rota-prev-week-btn')?.addEventListener('click', () => {
      rotaWeekStarting = adjustDateDays(rotaWeekStarting, -7);
      renderRotaCalendar();
    });
    $('#rota-next-week-btn')?.addEventListener('click', () => {
      rotaWeekStarting = adjustDateDays(rotaWeekStarting, 7);
      renderRotaCalendar();
    });

    // Rota form modal save
    $('#rota-save-btn')?.addEventListener('click', saveRotaGridData);
  }

  function getMondayOfCurrentWeek(d) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  function adjustDateDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function renderRotaCalendar() {
    const weekDisplay = $('#rota-week-display');
    if (weekDisplay) {
      const endOfWeek = adjustDateDays(rotaWeekStarting, 6);
      weekDisplay.textContent = `Week starting: ${rotaWeekStarting} to ${endOfWeek}`;
    }

    // Query staff list & rota details
    const staffPromise = db.collection('users').get();
    const rotaPromise = db.collection('staffRota').where('weekStarting', '==', rotaWeekStarting).get();

    Promise.all([staffPromise, rotaPromise]).then(([staffSnap, rotaSnap]) => {
      const staffList = [];
      staffSnap.forEach(doc => {
        const u = doc.data();
        if (u.role === 'admin' || u.role === 'kitchen') {
          staffList.push(u);
        }
      });

      const rotaMap = {};
      rotaSnap.forEach(doc => {
        const r = doc.data();
        rotaMap[r.uid] = r.shifts;
      });

      renderRotaTable(staffList, rotaMap);
    }).catch(err => {
      console.error("[Rota] Error loading rota tables:", err);
    });
  }

  function renderRotaTable(staffList, rotaMap) {
    const tableHead = $('#rota-table-head');
    const tableBody = $('#rota-table-body');
    if (!tableBody) return;

    if (staffList.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; opacity:0.5; padding:2rem 0;">No staff members available to schedule.</td></tr>`;
      return;
    }

    // Days headers
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    tableBody.innerHTML = staffList.map(s => {
      const shifts = rotaMap[s.uid] || {};
      
      const dayCells = days.map((day, i) => {
        const val = shifts[day] || "Off";
        return `
          <td style="padding:0.75rem 0.5rem; text-align:center;">
            <input type="text" class="admin-input rota-cell-input" 
                   data-uid="${s.uid}" data-day="${day}" data-name="${s.name}" data-role="${s.role}"
                   value="${val}" style="width:90px; text-align:center; font-size:0.8rem; padding:0.25rem;">
          </td>
        `;
      }).join('');

      const roleBadge = s.role === 'admin' 
        ? '<span style="color:#e8a825; font-size:0.7rem; font-family:\'Oswald\',sans-serif; border:1px solid #e8a825; padding:0.1rem 0.3rem; border-radius:3px;">ADMIN</span>' 
        : '<span style="color:#3498db; font-size:0.7rem; font-family:\'Oswald\',sans-serif; border:1px solid #3498db; padding:0.1rem 0.3rem; border-radius:3px;">CHEF</span>';

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.75rem 0; font-weight:600;">${s.name || 'No Name'}</td>
          <td style="padding:0.75rem 0;">${roleBadge}</td>
          ${dayCells}
        </tr>
      `;
    }).join('');
  }

  function saveRotaGridData() {
    const inputs = $$('.rota-cell-input');
    if (inputs.length === 0) return;

    const feedback = $('#rota-feedback-msg');
    if (feedback) {
      feedback.textContent = "Saving weekly rota...";
      feedback.style.color = "#e8a825";
    }

    // Group shift inputs by UID
    const userShifts = {};
    inputs.forEach(inp => {
      const uid = inp.dataset.uid;
      const day = inp.dataset.day;
      const val = inp.value.trim();
      const name = inp.dataset.name;
      const role = inp.dataset.role;

      if (!userShifts[uid]) {
        userShifts[uid] = {
          uid: uid,
          name: name,
          role: role,
          shifts: {}
        };
      }
      userShifts[uid].shifts[day] = val || "Off";
    });

    const batch = db.batch();
    
    Object.entries(userShifts).forEach(([uid, uData]) => {
      const docId = `${rotaWeekStarting}_${uid}`;
      const rotaRef = db.collection('staffRota').doc(docId);
      
      batch.set(rotaRef, {
        id: docId,
        uid: uid,
        name: uData.name,
        role: uData.role,
        weekStarting: rotaWeekStarting,
        shifts: uData.shifts,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    batch.commit().then(() => {
      if (feedback) {
        feedback.textContent = "✓ Rota saved successfully!";
        feedback.style.color = "#2ecc71";
        setTimeout(() => { feedback.textContent = ''; }, 3000);
      }
    }).catch(err => {
      if (feedback) {
        feedback.textContent = "Error saving: " + err.message;
        feedback.style.color = "var(--error-red)";
      }
    });
  }

  // Kitchen Rota Loader
  window.loadKitchenStaffRota = function(uid, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const monday = getMondayOfCurrentWeek(new Date());
    const docId = `${monday}_${uid}`;

    db.collection('staffRota').doc(docId).get().then(doc => {
      if (!doc.exists) {
        container.innerHTML = `
          <div style="padding:1.5rem; text-align:center; opacity:0.6; border: 1px dashed rgba(255,255,255,0.15); border-radius:8px;">
            No shifts scheduled for you for the week starting ${monday}.
          </div>
        `;
        return;
      }

      const data = doc.data();
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const daysShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      container.innerHTML = `
        <div class="crew-list-header" style="margin-bottom:1rem;">Your Week Schedule (${monday})</div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.75rem;">
          ${days.map((day, i) => {
            const short = daysShort[i];
            const timeVal = data.shifts[short] || 'Off';
            const isOff = timeVal.toLowerCase() === 'off';
            return `
              <div style="background:${isOff ? 'rgba(255,255,255,0.02)' : 'rgba(232, 168, 37, 0.08)'}; 
                          border:1px solid ${isOff ? 'rgba(255,255,255,0.05)' : 'rgba(232, 168, 37, 0.3)'}; 
                          border-radius:8px; padding:0.75rem; text-align:center;">
                <div style="font-family:'Oswald',sans-serif; font-size:0.8rem; opacity:0.6; text-transform:uppercase;">${day}</div>
                <div style="font-family:'Oswald',sans-serif; font-size:1rem; margin-top:0.4rem; color:${isOff ? '#f5ead6' : '#e8a825'}; font-weight:bold;">${timeVal}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).catch(err => {
      container.innerHTML = `<p style="color:var(--error-red)">Error loading rota: ${err.message}</p>`;
    });
  };

  // ==========================================================================
  // 4. MENU CUSTOMIZER TAB
  // ==========================================================================
  function initMenuCustomizer() {
    renderMenuCustomizerList();
    
    // Add Category submit
    $('#customizer-add-cat-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = $('#cat-id-input').value.trim().toLowerCase();
      const title = $('#cat-title-input').value.trim();
      const icon = $('#cat-icon-input').value.trim();
      const subtitle = $('#cat-subtitle-input').value.trim();
      const feedback = $('#cat-feedback-msg');

      if (!id || !title) return;

      db.collection('categories').doc(id).set({
        id: id,
        title: title,
        icon: icon,
        subtitle: subtitle,
        sortOrder: 100 // push to bottom
      }).then(() => {
        feedback.textContent = "✓ Category added successfully!";
        feedback.style.color = "#2ecc71";
        e.target.reset();
        setTimeout(() => { feedback.textContent = ''; }, 3000);
      }).catch(err => {
        feedback.textContent = err.message;
        feedback.style.color = "var(--error-red)";
      });
    });

    // Add Item submit
    $('#customizer-add-item-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = $('#item-id-input').value.trim().toLowerCase();
      const name = $('#item-name-input').value.trim();
      const desc = $('#item-desc-input').value.trim();
      const price = parseFloat($('#item-price-input').value);
      const image = $('#item-image-input').value.trim() || 'images/menu/default.jpg';
      const category = $('#item-cat-select').value;
      const veg = $('#item-veg-checkbox').checked;
      const feedback = $('#item-feedback-msg');

      if (!id || !name || isNaN(price) || !category) return;

      db.collection('menuItems').doc(id).set({
        id: id,
        name: name,
        description: desc,
        price: price,
        image: image,
        category: category,
        veg: veg,
        outOfStock: false,
        sizes: [],
        options: []
      }).then(() => {
        feedback.textContent = "✓ Menu item added successfully!";
        feedback.style.color = "#2ecc71";
        e.target.reset();
        setTimeout(() => { feedback.textContent = ''; }, 3000);
      }).catch(err => {
        feedback.textContent = err.message;
        feedback.style.color = "var(--error-red)";
      });
    });
  }

  function renderMenuCustomizerList() {
    const listContainer = $('#customizer-menu-list');
    if (!listContainer) return;

    const categories = cachedCategoriesList;
    const items = cachedMenuItemsList;

    // Render categories options dropdown in item form
    const select = $('#item-cat-select');
    if (select) {
      select.innerHTML = categories.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
    }

    // Render customizer list structure
    listContainer.innerHTML = categories.map(c => {
      const cItems = items.filter(item => item.category === c.id);
      const itemRows = cItems.map(item => {
        const sizesText = item.sizes && item.sizes.length 
          ? item.sizes.map(s => `${s.label}: ${formatPrice(s.price)}`).join(', ') 
          : 'None';
          
        return `
          <div style="padding:1rem 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
              <h5 style="margin:0; font-size:1rem; font-family:'Oswald',sans-serif; color:#fff;">
                ${item.name} ${item.veg ? '<span style="color:#2ecc71; font-size:0.75rem;">(v)</span>' : ''}
              </h5>
              <p style="margin:0.2rem 0 0 0; font-size:0.82rem; opacity:0.7;">${item.description}</p>
              <div style="font-size:0.75rem; color:#e8a825; margin-top:0.25rem;">
                Base: ${formatPrice(item.price)} · Sizes: [${sizesText}]
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <button class="btn btn-outline" onclick="openCustomizerSizeModal('${item.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem;">Sizes</button>
              <div style="display:flex; flex-direction:column; align-items:center; gap:0.25rem;">
                <label style="font-size:0.7rem; text-transform:uppercase; opacity:0.6;">Status</label>
                <select class="admin-select" onchange="toggleItemStock('${item.id}', this.value === 'out')" style="padding:0.15rem; font-size:0.75rem;">
                  <option value="in" ${!item.outOfStock ? 'selected' : ''}>Active</option>
                  <option value="out" ${item.outOfStock ? 'selected' : ''}>Sold Out</option>
                </select>
              </div>
              <button class="btn btn-outline" onclick="deleteMenuItem('${item.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem; border-color:var(--error-red); color:var(--error-red);">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="analytics-card" style="margin-bottom:1.5rem;">
          <h3 style="border-bottom:1px dashed rgba(201,148,58,0.3); padding-bottom:0.5rem;">${c.icon} ${c.title}</h3>
          ${itemRows.length === 0 ? '<p style="opacity:0.5; font-size:0.85rem;">No items in this category yet.</p>' : itemRows}
        </div>
      `;
    }).join('');
  }

  window.toggleItemStock = function(itemId, isOut) {
    db.collection('menuItems').doc(itemId).update({
      outOfStock: isOut
    }).then(() => {
      console.log(`[Customizer] Stock status updated for ${itemId}: ${isOut ? 'Sold Out' : 'Active'}`);
    }).catch(err => {
      alert("Failed to update status: " + err.message);
    });
  };

  window.deleteMenuItem = function(itemId) {
    if (confirm("Are you sure you want to permanently delete this menu item?")) {
      db.collection('menuItems').doc(itemId).delete().then(() => {
        alert("Item deleted successfully.");
        renderMenuCustomizerList();
      }).catch(err => {
        alert("Failed to delete item: " + err.message);
      });
    }
  };

  // Sizes Editor modal controls
  let activeCustomizerItemId = null;

  window.openCustomizerSizeModal = function(itemId) {
    activeCustomizerItemId = itemId;
    const modal = $('#customizer-size-modal');
    if (!modal) return;

    db.collection('menuItems').doc(itemId).get().then(doc => {
      if (!doc.exists) return;
      const item = doc.data();
      $('#size-modal-title').textContent = `Manage Sizes: ${item.name}`;
      
      const rows = $('#size-modal-rows');
      const sizes = item.sizes || [];
      
      rows.innerHTML = sizes.map((s, idx) => `
        <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;" class="size-editor-row">
          <input type="text" class="admin-input size-label-input" value="${s.label}" placeholder="e.g. Large" style="flex:1;">
          <input type="number" step="0.01" class="admin-input size-price-input" value="${s.price}" placeholder="e.g. 5.99" style="width:100px;">
          <button class="btn btn-outline" onclick="this.closest('.size-editor-row').remove()" style="padding:0.4rem 0.6rem; border-color:var(--error-red); color:var(--error-red);">✕</button>
        </div>
      `).join('');
      
      modal.style.display = 'flex';
    });
  };

  window.closeCustomizerSizeModal = function() {
    const modal = $('#customizer-size-modal');
    if (modal) modal.style.display = 'none';
    activeCustomizerItemId = null;
  };

  window.addSizeEditorRow = function() {
    const rows = $('#size-modal-rows');
    if (!rows) return;
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '0.5rem';
    div.style.marginBottom = '0.5rem';
    div.className = 'size-editor-row';
    div.innerHTML = `
      <input type="text" class="admin-input size-label-input" value="" placeholder="e.g. Large" style="flex:1;">
      <input type="number" step="0.01" class="admin-input size-price-input" value="" placeholder="e.g. 5.99" style="width:100px;">
      <button class="btn btn-outline" onclick="this.closest('.size-editor-row').remove()" style="padding:0.4rem 0.6rem; border-color:var(--error-red); color:var(--error-red);">✕</button>
    `;
    rows.appendChild(div);
  };

  window.saveCustomizerSizes = function() {
    if (!activeCustomizerItemId) return;
    const rows = $$('.size-editor-row');
    const sizes = [];
    
    rows.forEach(r => {
      const label = r.querySelector('.size-label-input').value.trim();
      const price = parseFloat(r.querySelector('.size-price-input').value);
      if (label && !isNaN(price)) {
        sizes.push({ label, price });
      }
    });

    db.collection('menuItems').doc(activeCustomizerItemId).update({
      sizes: sizes
    }).then(() => {
      alert("Sizes updated successfully!");
      closeCustomizerSizeModal();
      renderMenuCustomizerList();
    }).catch(err => {
      alert("Failed to save sizes: " + err.message);
    });
  };

  // Listen to Firestore updates for real-time list reconstruction
  db.collection('categories').orderBy('sortOrder').onSnapshot(snapshot => {
    cachedCategoriesList = [];
    snapshot.forEach(doc => cachedCategoriesList.push(doc.data()));
    renderMenuCustomizerList();
  }, err => {
    console.error("Categories customizer listener error:", err);
  });

  db.collection('menuItems').onSnapshot(snapshot => {
    cachedMenuItemsList = [];
    snapshot.forEach(doc => cachedMenuItemsList.push(doc.data()));
    renderMenuCustomizerList();
  }, err => {
    console.error("MenuItems customizer listener error:", err);
  });

  // ==========================================================================
  // 5. SALES REPORTS EXPORTER (PDF & CSV)
  // ==========================================================================
  window.downloadSalesReportCSV = function(startDateStr, endDateStr) {
    console.log(`[Reports] Generating sales log CSV from ${startDateStr} to ${endDateStr}...`);
    
    db.collection('orders').where('status', 'in', ['complete', 'delivered']).get().then(snapshot => {
      const start = startDateStr ? new Date(startDateStr) : new Date(0);
      const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date();

      const filtered = [];
      snapshot.forEach(doc => {
        const o = doc.data();
        const date = o.createdAt?.toDate ? o.createdAt.toDate() : null;
        if (date && date >= start && date <= end) {
          filtered.push({ id: doc.id, ...o, date });
        }
      });

      if (filtered.length === 0) {
        alert("No completed sales recorded inside this date range.");
        return;
      }

      // Construct CSV
      let csv = "Order ID,Date,Customer,Type,Subtotal,VAT (20%),Tip,Total,Payment\n";
      filtered.forEach(o => {
        const dateStr = o.date.toLocaleDateString() + ' ' + o.date.toLocaleTimeString();
        const customer = (o.customerDetails?.name || 'Guest').replace(/,/g, ' ');
        const vat = o.vat || 0;
        const tip = o.tip || 0;
        const total = o.total || 0;
        const subtotal = Math.round((total - tip) * 100) / 100;
        
        csv += `${o.orderId},"${dateStr}","${customer}",${o.orderType},${subtotal},${vat},${tip},${total},${o.paymentMethod}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `sales_report_${startDateStr || 'all'}_to_${endDateStr || 'all'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }).catch(err => {
      alert("Failed exporting CSV: " + err.message);
    });
  };

  // jsPDF Exporter
  window.downloadSalesReportPDF = function(startDateStr, endDateStr) {
    db.collection('orders').where('status', 'in', ['complete', 'delivered']).get().then(snapshot => {
      const start = startDateStr ? new Date(startDateStr) : new Date(0);
      const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date();

      const filtered = [];
      snapshot.forEach(doc => {
        const o = doc.data();
        const date = o.createdAt?.toDate ? o.createdAt.toDate() : null;
        if (date && date >= start && date <= end) {
          filtered.push({ id: doc.id, ...o, date });
        }
      });

      if (filtered.length === 0) {
        alert("No completed sales recorded inside this date range.");
        return;
      }

      // Calculations
      let totalRevenue = 0;
      let totalVat = 0;
      let totalTips = 0;
      filtered.forEach(o => {
        totalRevenue += o.total || 0;
        totalVat += o.vat || 0;
        totalTips += o.tip || 0;
      });

      // Generate HTML PDF using window.jspdf or simply printing the summary
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        alert("PDF generator script not loaded. Please ensure jsPDF CDN is loaded.");
        return;
      }

      const doc = new jsPDF();
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(201, 148, 58); // Gold color
      doc.text("RUSSELL HALL CAFÉ", 14, 20);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text("SALES SUMMARY REPORT", 14, 28);
      doc.setDrawColor(201, 148, 58);
      doc.line(14, 32, 196, 32);

      doc.setFontSize(10);
      doc.text(`Report Period: ${startDateStr || 'Beginning'} to ${endDateStr || 'Present'}`, 14, 40);
      doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 46);
      doc.text(`Total Volume: ${filtered.length} Orders Completed`, 14, 52);

      // Financial grid
      doc.setFont("Helvetica", "bold");
      doc.text("FINANCIAL SUMMARY", 14, 65);
      doc.setFont("Helvetica", "normal");
      doc.line(14, 67, 196, 67);

      doc.text("Gross Revenue (Inc. Tips & Tax):", 14, 75);
      doc.text(formatPrice(totalRevenue), 140, 75);

      doc.text("Standard VAT Collected (20%):", 14, 82);
      doc.text(formatPrice(totalVat), 140, 82);

      doc.text("Staff Tips Collected:", 14, 89);
      doc.text(formatPrice(totalTips), 140, 89);

      doc.setFont("Helvetica", "bold");
      doc.text("Net Operating Revenue (Ex. Tips & Tax):", 14, 98);
      doc.text(formatPrice(totalRevenue - totalVat - totalTips), 140, 98);
      doc.setFont("Helvetica", "normal");
      doc.line(14, 101, 196, 101);

      // Simple Table Headers
      doc.setFont("Helvetica", "bold");
      doc.text("RECENT TRANSACTIONS", 14, 115);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      
      let y = 125;
      doc.text("ID", 14, y);
      doc.text("Customer", 35, y);
      doc.text("Type", 85, y);
      doc.text("Tax", 120, y);
      doc.text("Tip", 145, y);
      doc.text("Total", 175, y);
      doc.line(14, y + 2, 196, y + 2);
      y += 8;

      // Limit to first 12 items in PDF to prevent page overflow in simple generator
      const listSlice = filtered.slice(0, 12);
      listSlice.forEach(o => {
        doc.text(o.orderId.substring(0, 8), 14, y);
        doc.text((o.customerDetails?.name || 'Guest').substring(0, 18), 35, y);
        doc.text(o.orderType.toUpperCase(), 85, y);
        doc.text(formatPrice(o.vat || 0), 120, y);
        doc.text(formatPrice(o.tip || 0), 145, y);
        doc.text(formatPrice(o.total || 0), 175, y);
        y += 7;
      });

      if (filtered.length > 12) {
        doc.setFont("Helvetica", "italic");
        doc.text(`* Showing first 12 of ${filtered.length} completed transactions. Export CSV for the full database list.`, 14, y + 5);
      }

      doc.save(`sales_summary_${startDateStr || 'all'}.pdf`);
    }).catch(err => {
      alert("Failed generating PDF report: " + err.message);
    });
  };

  // ==========================================================================
  // MODULE EXPOSURE / STARTUP
  // ==========================================================================
  let cachedInventoryItems = [];
  let inventoryUnsubscribe = null;
  let suppliersUnsubscribe = null;
  let poUnsubscribe = null;
  let auditUnsubscribe = null;

  // Chart instances
  let chartStockValue = null;
  let chartWasteCost = null;
  let chartSalesTurnover = null;

  function startInventorySnapshotListener() {
    console.log("[Firebase] Starting real-time inventory snapshot listener...");
    inventoryUnsubscribe = db.collection('inventory').onSnapshot(snapshot => {
      const items = [];
      let totalValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      snapshot.forEach(doc => {
        const item = { id: doc.id, ...doc.data() };
        items.push(item);
        
        const current = item.currentStock || 0;
        const min = item.minimumStock || 0;
        const cost = item.costPerUnit || 0;
        
        totalValue += current * cost;
        if (current === 0) {
          outOfStockCount++;
        } else if (current <= min) {
          lowStockCount++;
        }
      });

      cachedInventoryItems = items;

      // Render stats row
      if ($('#inv-stat-total')) $('#inv-stat-total').textContent = items.length;
      if ($('#inv-stat-low')) $('#inv-stat-low').textContent = lowStockCount;
      if ($('#inv-stat-empty')) $('#inv-stat-empty').textContent = outOfStockCount;
      if ($('#inv-stat-value')) $('#inv-stat-value').textContent = formatPrice(totalValue);

      // Render inventory table rows
      renderInventoryTable(items);
      
      // Pre-populate dropdowns for quick adjust/waste Forms
      populateInventorySelectDropdowns(items);

      // Render expiring soon FIFO batches
      renderExpiringSoonBatches(items);

      // Update stock value chart
      updateStockValueChart(items);
    }, err => {
      console.error("Inventory listener error:", err);
    });
  }

  function renderInventoryTable(items) {
    const tbody = $('#inventory-table-rows');
    if (!tbody) return;

    const categoryFilter = $('#inv-category-filter')?.value || 'All';
    let filtered = items;
    if (categoryFilter !== 'All') {
      filtered = items.filter(i => i.category === categoryFilter);
    }

    // Sort by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:1.5rem 0;">No ingredients in this category.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const current = item.currentStock || 0;
      const max = item.maximumStock || 100;
      const min = item.minimumStock || 0;
      const pct = Math.min(100, Math.round((current / max) * 100));
      
      // Status check
      let statusText = '<span style="color:#2ecc71; font-weight:600;">OK</span>';
      let barColor = '#2ecc71';
      if (current === 0) {
        statusText = '<span style="color:#e74c3c; font-weight:600;">SOLD OUT</span>';
        barColor = '#e74c3c';
      } else if (current <= min) {
        statusText = '<span style="color:#f39c12; font-weight:600;">LOW STOCK</span>';
        barColor = '#f39c12';
      }

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.75rem 0;"><strong>${item.name}</strong><br><span style="font-size:0.75rem; opacity:0.5;">Cost: ${formatPrice(item.costPerUnit || 0)} / ${item.unit}</span></td>
          <td style="padding:0.75rem 0; opacity:0.8;">${item.category}</td>
          <td style="padding:0.75rem 0; text-align:center; min-width:140px;">
            <div style="font-size:0.8rem; font-weight:bold; margin-bottom:0.25rem;">${current} / ${max} ${item.unit}s</div>
            <div class="progress-bar-wrap" style="height:6px; background:rgba(255,255,255,0.08);">
              <div style="width: ${pct}%; height:100%; border-radius:3px; background:${barColor};"></div>
            </div>
          </td>
          <td style="padding:0.75rem 0; text-align:center;">${statusText}</td>
          <td style="padding:0.75rem 0; text-align:right;">
            <button class="btn btn-outline" onclick="openQuickAdjustModal('${item.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem;">Adjust</button>
            <button class="btn btn-outline" onclick="openWasteModal('${item.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem; border-color:var(--error-red); color:var(--error-red); margin-left:0.25rem;">Waste</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function populateInventorySelectDropdowns(items) {
    const sorted = [...items].sort((a,b) => a.name.localeCompare(b.name));
    const options = sorted.map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');

    const stockInSelect = $('#stock-in-item');
    const stockOutSelect = $('#stock-out-item');
    
    if (stockInSelect) stockInSelect.innerHTML = options;
    if (stockOutSelect) stockOutSelect.innerHTML = options;
    
    // Dynamic Categories
    const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();
    
    // Populate the filter dropdown in the table header
    const filterSelect = $('#inv-category-filter');
    if (filterSelect) {
      const currentFilterVal = filterSelect.value || 'All';
      filterSelect.innerHTML = `<option value="All">All Categories</option>` + 
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
      filterSelect.value = currentFilterVal;
    }
    
    // Populate the add new stock category dropdown
    const addStockCatSelect = $('#add-stock-category-select');
    if (addStockCatSelect) {
      addStockCatSelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('') +
        `<option value="new_cat">+ Create New Category...</option>`;
    }

    // Keep backwards compatibility for any other code looking for adjustSelect etc.
    const adjustSelect = $('#adjust-item-select');
    const wasteSelect = $('#waste-item-select');
    const batchSelect = $('#expiry-batch-item');
    if (adjustSelect) adjustSelect.innerHTML = options;
    if (wasteSelect) wasteSelect.innerHTML = options;
    if (batchSelect) batchSelect.innerHTML = options;
  }

  function renderExpiringSoonBatches(items) {
    const list = $('#expiry-batches-list');
    if (!list) return;

    const allBatches = [];
    items.forEach(item => {
      if (item.expiryBatches && Array.isArray(item.expiryBatches)) {
        item.expiryBatches.forEach(b => {
          allBatches.push({
            itemId: item.id,
            itemName: item.name,
            unit: item.unit,
            ...b
          });
        });
      }
    });

    allBatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    if (allBatches.length === 0) {
      list.innerHTML = `<p class="empty-msg" style="padding:1rem 0; text-align:center;">No active expiring batches tracked.</p>`;
      return;
    }

    const now = new Date();
    list.innerHTML = allBatches.map(b => {
      const exp = new Date(b.expiryDate);
      const diffTime = exp - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let urgencyColor = '#2ecc71';
      let urgencyText = `${diffDays} days left`;
      if (diffDays <= 0) {
        urgencyColor = '#e74c3c';
        urgencyText = 'EXPIRED';
      } else if (diffDays <= 5) {
        urgencyColor = '#f39c12';
        urgencyText = `URGENT: ${diffDays}d left`;
      }

      return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:0.6rem; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:0.85rem;">${b.itemName}</strong>
            <div style="font-size:0.75rem; opacity:0.6;">Qty: ${b.quantity} ${b.unit}s · Exp: ${b.expiryDate}</div>
          </div>
          <div style="font-family:'Oswald', sans-serif; font-size:0.75rem; background:${urgencyColor}20; border:1px solid ${urgencyColor}; color:${urgencyColor}; padding:0.15rem 0.4rem; border-radius:4px;">
            ${urgencyText}
          </div>
        </div>
      `;
    }).join('');
  }

  window.openQuickAdjustModal = function(itemId) {
    const select = $('#stock-in-item');
    if (select) {
      select.value = itemId;
      $('#stock-in-qty')?.focus();
    }
  };

  window.openWasteModal = function(itemId) {
    const select = $('#stock-out-item');
    if (select) {
      select.value = itemId;
      $('#stock-out-qty')?.focus();
    }
  };

  function bindInventoryForms() {
    // Category change listener on Add Stock Item form
    $('#add-stock-category-select')?.addEventListener('change', e => {
      const newCatInput = $('#add-stock-category-new');
      if (e.target.value === 'new_cat') {
        newCatInput?.classList.remove('hidden');
        newCatInput?.setAttribute('required', 'true');
      } else {
        newCatInput?.classList.add('hidden');
        newCatInput?.removeAttribute('required');
      }
    });

    // Stock In Form Submit
    $('#stock-in-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const itemId = $('#stock-in-item')?.value;
      const qty = parseFloat($('#stock-in-qty')?.value);
      const notes = $('#stock-in-notes')?.value.trim() || 'Restocked';
      
      if (!itemId || isNaN(qty) || qty <= 0) {
        alert("Please select a valid item and enter a quantity greater than zero.");
        return;
      }
      
      const docRef = db.collection('inventory').doc(itemId);
      try {
        await db.runTransaction(async (transaction) => {
          const sfDoc = await transaction.get(docRef);
          if (!sfDoc.exists) throw "Stock item not found.";
          const current = sfDoc.data().currentStock || 0;
          const unit = sfDoc.data().unit || '';
          const newStock = parseFloat((current + qty).toFixed(2));
          
          transaction.update(docRef, { currentStock: newStock });
          
          const auditRef = db.collection('auditLog').doc();
          transaction.set(auditRef, {
            action: 'stock_in',
            performedBy: auth.currentUser ? auth.currentUser.uid : 'system',
            performedByName: 'Admin Manager',
            targetCollection: 'inventory',
            targetId: itemId,
            details: `Restocked +${qty} ${unit}. Notes: ${notes}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        showToast("Stock added successfully!", "success");
        $('#stock-in-form')?.reset();
      } catch (err) {
        console.error("Stock In error:", err);
        alert("Failed to update stock: " + err.message);
      }
    });

    // Stock Out Form Submit
    $('#stock-out-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const itemId = $('#stock-out-item')?.value;
      const qty = parseFloat($('#stock-out-qty')?.value);
      const reason = $('#stock-out-reason')?.value || 'Other';
      
      if (!itemId || isNaN(qty) || qty <= 0) {
        alert("Please select a valid item and enter a quantity greater than zero.");
        return;
      }
      
      const docRef = db.collection('inventory').doc(itemId);
      try {
        await db.runTransaction(async (transaction) => {
          const sfDoc = await transaction.get(docRef);
          if (!sfDoc.exists) throw "Stock item not found.";
          const current = sfDoc.data().currentStock || 0;
          const unit = sfDoc.data().unit || '';
          const costPerUnit = sfDoc.data().costPerUnit || 0;
          const newStock = parseFloat(Math.max(0, current - qty).toFixed(2));
          
          transaction.update(docRef, { currentStock: newStock });
          
          // If it is waste, log it to wasteLog
          if (['Spoilage', 'Preparation Waste', 'Spillage', 'Expired'].includes(reason)) {
            const wasteRef = db.collection('wasteLog').doc();
            transaction.set(wasteRef, {
              itemId: itemId,
              itemName: sfDoc.data().name,
              quantity: qty,
              unit: unit,
              cost: parseFloat((qty * costPerUnit).toFixed(2)),
              reason: reason,
              loggedBy: auth.currentUser ? auth.currentUser.uid : 'system',
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          
          const auditRef = db.collection('auditLog').doc();
          transaction.set(auditRef, {
            action: 'stock_out',
            performedBy: auth.currentUser ? auth.currentUser.uid : 'system',
            performedByName: 'Admin Manager',
            targetCollection: 'inventory',
            targetId: itemId,
            details: `Removed -${qty} ${unit} due to ${reason}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        showToast("Stock reduced successfully!", "success");
        $('#stock-out-form')?.reset();
      } catch (err) {
        console.error("Stock Out error:", err);
        alert("Failed to update stock: " + err.message);
      }
    });

    // Add New Stock Item Form Submit
    $('#add-stock-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('#add-stock-name')?.value.trim();
      const catSelect = $('#add-stock-category-select')?.value;
      const catNew = $('#add-stock-category-new')?.value.trim();
      const initialStock = parseFloat($('#add-stock-initial')?.value || 0);
      const minStock = parseFloat($('#add-stock-min')?.value || 0);
      const costPerUnit = parseFloat($('#add-stock-cost')?.value || 0);
      const unit = $('#add-stock-unit')?.value.trim();
      
      const category = catSelect === 'new_cat' ? catNew : catSelect;
      
      if (!name || !category || isNaN(initialStock) || isNaN(minStock) || isNaN(costPerUnit) || !unit) {
        alert("Please fill in all fields correctly.");
        return;
      }
      
      const newId = 'ing_' + Date.now();
      try {
        await db.collection('inventory').doc(newId).set({
          id: newId,
          name: name,
          category: category,
          currentStock: initialStock,
          minimumStock: minStock,
          maximumStock: initialStock * 2 || 100,
          costPerUnit: costPerUnit,
          unit: unit,
          supplierName: "General Supplier",
          expiryBatches: [],
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('auditLog').add({
          action: 'create_stock_item',
          performedBy: auth.currentUser ? auth.currentUser.uid : 'system',
          performedByName: 'Admin Manager',
          targetCollection: 'inventory',
          targetId: newId,
          details: `Created new stock profile: ${name} (${unit}) in category ${category}`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(`Stock item "${name}" created successfully!`, "success");
        $('#add-stock-form')?.reset();
        $('#add-stock-category-new')?.classList.add('hidden');
      } catch (err) {
        console.error("Add Stock Item error:", err);
        alert("Failed to create stock item: " + err.message);
      }
    });

    // Handle filter category change listener
    $('#inv-category-filter')?.addEventListener('change', () => {
      db.collection('inventory').get().then(snap => {
        const items = snap.docs.map(d => d.data());
        renderInventoryTable(items);
      });
    });
  }

  function startSuppliersSnapshotListener() {
    console.log("[Firebase] Starting real-time suppliers snapshot listener...");
    suppliersUnsubscribe = db.collection('suppliers').onSnapshot(snapshot => {
      const suppliers = [];
      snapshot.forEach(doc => {
        suppliers.push({ id: doc.id, ...doc.data() });
      });
      renderSuppliersTable(suppliers);
      populatePOSupplierSelect(suppliers);
    }, err => {
      console.error("Suppliers listener error:", err);
    });
  }

  function renderSuppliersTable(suppliers) {
    const tbody = $('#suppliers-table-rows');
    if (!tbody) return;

    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:1.5rem 0;">No suppliers registered.</td></tr>`;
      return;
    }

    suppliers.sort((a,b) => a.name.localeCompare(b.name));

    tbody.innerHTML = suppliers.map(s => {
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.75rem 0;"><strong>${s.name}</strong><br><span style="font-size:0.75rem; opacity:0.6;">Contact: ${s.contactPerson}</span></td>
          <td style="padding:0.75rem 0;">${s.email}<br><span style="font-size:0.75rem; opacity:0.6;">${s.phone}</span></td>
          <td style="padding:0.75rem 0; font-size:0.75rem;">${(s.deliveryDays || []).join(', ')}</td>
          <td style="padding:0.75rem 0; text-align:center;">${formatPrice(s.minimumOrderValue || 0)}</td>
          <td style="padding:0.75rem 0; text-align:right;">
            <button class="btn btn-outline" onclick="openEditSupplierModal('${s.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem;">Edit</button>
            <button class="btn btn-outline" onclick="deleteSupplier('${s.id}')" style="padding:0.25rem 0.5rem; font-size:0.72rem; border-color:var(--error-red); color:var(--error-red); margin-left:0.25rem;">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function populatePOSupplierSelect(suppliers) {
    const select = $('#po-supplier-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose Supplier --</option>' + 
      suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }

  window.openAddSupplierModal = function() {
    $('#supplier-modal-title').textContent = "Add New Supplier";
    $('#supplier-id-input').value = "";
    $('#add-supplier-form').reset();
    $('#add-supplier-modal').style.display = 'flex';
  };

  window.openEditSupplierModal = function(id) {
    db.collection('suppliers').doc(id).get().then(doc => {
      if (!doc.exists) return;
      const s = doc.data();
      $('#supplier-modal-title').textContent = "Edit Supplier Details";
      $('#supplier-id-input').value = s.id;
      $('#supplier-name').value = s.name;
      $('#supplier-contact').value = s.contactPerson;
      $('#supplier-phone').value = s.phone;
      $('#supplier-email').value = s.email;
      $('#supplier-address').value = s.address || "";
      $('#supplier-terms').value = s.paymentTerms || "";
      $('#supplier-min-order').value = s.minimumOrderValue || "";
      $('#supplier-days').value = (s.deliveryDays || []).join(', ');
      $('#add-supplier-modal').style.display = 'flex';
    });
  };

  window.closeAddSupplierModal = function() {
    $('#add-supplier-modal').style.display = 'none';
  };

  window.deleteSupplier = function(id) {
    if (confirm("Are you sure you want to delete this supplier?")) {
      db.collection('suppliers').doc(id).delete().then(() => {
        alert("Supplier deleted.");
      }).catch(err => {
        alert("Failed to delete supplier: " + err.message);
      });
    }
  };

  function startPurchaseOrdersSnapshotListener() {
    console.log("[Firebase] Starting real-time purchase orders snapshot listener...");
    poUnsubscribe = db.collection('purchaseOrders').onSnapshot(snapshot => {
      const pos = [];
      snapshot.forEach(doc => {
        pos.push({ id: doc.id, ...doc.data() });
      });
      renderPOTable(pos);
    }, err => {
      console.error("PO listener error:", err);
    });
  }

  function renderPOTable(pos) {
    const tbody = $('#purchase-orders-rows');
    if (!tbody) return;

    if (pos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:1.5rem 0;">No purchase orders generated.</td></tr>`;
      return;
    }

    pos.sort((a,b) => {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    });

    tbody.innerHTML = pos.map(p => {
      let actionBtns = '';
      if (p.status === 'draft') {
        actionBtns = `
          <button class="btn btn-outline" onclick="sendPurchaseOrder('${p.id}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Send</button>
          <button class="btn btn-outline" onclick="deletePurchaseOrder('${p.id}')" style="padding:0.2rem 0.4rem; font-size:0.7rem; border-color:var(--error-red); color:var(--error-red); margin-left:0.2rem;">Del</button>
        `;
      } else if (p.status === 'sent') {
        actionBtns = `
          <button class="btn btn-gold" onclick="receivePurchaseOrder('${p.id}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Mark Recv</button>
        `;
      }

      actionBtns = `<button class="btn btn-outline" onclick="downloadPurchaseOrderPDF('${p.id}')" style="padding:0.2rem 0.4rem; font-size:0.7rem; margin-right:0.2rem;">PDF</button>` + actionBtns;

      let statusColor = '#3498db';
      if (p.status === 'received') statusColor = '#2ecc71';
      if (p.status === 'cancelled') statusColor = 'var(--error-red)';

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.75rem 0;"><strong>${p.poNumber}</strong></td>
          <td style="padding:0.75rem 0;">${p.supplierName}</td>
          <td style="padding:0.75rem 0; text-align:center;">${formatPrice(p.grandTotal || 0)}</td>
          <td style="padding:0.75rem 0; text-align:center;">
            <span style="font-family:'Oswald',sans-serif; font-size:0.75rem; background:${statusColor}20; border:1px solid ${statusColor}; color:${statusColor}; padding:0.1rem 0.3rem; border-radius:3px;">
              ${p.status.toUpperCase()}
            </span>
          </td>
          <td style="padding:0.75rem 0; text-align:right;">${actionBtns}</td>
        </tr>
      `;
    }).join('');
  }

  window.loadSupplierIngredientsForPO = function(supplierId) {
    const container = $('#po-items-container');
    if (!container) return;

    if (!supplierId) {
      container.innerHTML = `<p style="opacity:0.5; font-size:0.85rem;">Select a supplier to see their items.</p>`;
      return;
    }

    db.collection('suppliers').doc(supplierId).get().then(supDoc => {
      if (!supDoc.exists) return;
      const sName = supDoc.data().name;

      db.collection('inventory').where('supplierName', '==', sName).get().then(snap => {
        if (snap.empty) {
          container.innerHTML = `<p style="opacity:0.5; font-size:0.85rem;">No inventory ingredients mapped to this supplier.</p>`;
          return;
        }

        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

        container.innerHTML = items.map(item => {
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:6px; border:1px solid rgba(255,255,255,0.04); margin-bottom:0.25rem;">
              <div style="flex:1;">
                <strong style="font-size:0.82rem;">${item.name}</strong>
                <div style="font-size:0.75rem; opacity:0.6;">Current: ${item.currentStock} ${item.unit}s (Min: ${item.minimumStock})</div>
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="font-size:0.8rem; opacity:0.8;">${formatPrice(item.costPerUnit || 0)}</span>
                <input type="number" class="admin-input po-item-qty" 
                       data-id="${item.id}" data-name="${item.name}" data-unit="${item.unit}" data-cost="${item.costPerUnit}"
                       placeholder="Qty" min="0" style="width:70px; padding:0.25rem; font-size:0.8rem; text-align:center;">
              </div>
            </div>
          `;
        }).join('');
      });
    });
  };

  window.openCreatePOModal = function() {
    const select = $('#po-supplier-select');
    if (select) select.value = "";
    $('#po-items-container').innerHTML = `<p style="opacity:0.5; font-size:0.85rem;">Select a supplier to see their items.</p>`;
    $('#po-notes').value = "";
    $('#create-po-modal').style.display = 'flex';
  };

  window.closeCreatePOModal = function() {
    $('#create-po-modal').style.display = 'none';
  };

  window.submitPurchaseOrder = function() {
    const supplierId = $('#po-supplier-select').value;
    if (!supplierId) {
      alert("Please choose a supplier.");
      return;
    }

    const items = [];
    let subtotal = 0;
    
    $$('.po-item-qty').forEach(inp => {
      const qty = parseFloat(inp.value);
      if (qty > 0) {
        const id = inp.dataset.id;
        const name = inp.dataset.name;
        const unit = inp.dataset.unit;
        const cost = parseFloat(inp.dataset.cost);
        const lineTotal = qty * cost;
        
        subtotal += lineTotal;
        items.push({
          itemId: id,
          itemName: name,
          quantity: qty,
          unit: unit,
          unitCost: cost,
          lineTotal: lineTotal
        });
      }
    });

    if (items.length === 0) {
      alert("Please enter a quantity for at least one item.");
      return;
    }

    const tax = subtotal * 0.20;
    const grandTotal = subtotal + tax;
    
    const randomVal = Math.floor(1000 + Math.random() * 9000);
    const poNum = `PO-${new Date().getFullYear()}-${randomVal}`;
    const poId = 'po_' + Date.now();

    db.collection('suppliers').doc(supplierId).get().then(supDoc => {
      const sName = supDoc.data().name;
      
      return db.collection('purchaseOrders').doc(poId).set({
        id: poId,
        poNumber: poNum,
        supplierId: supplierId,
        supplierName: sName,
        items: items,
        subtotal: subtotal,
        tax: tax,
        grandTotal: grandTotal,
        status: "draft",
        notes: $('#po-notes').value.trim(),
        createdBy: auth.currentUser?.uid || "system",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(() => {
      alert("✓ Purchase order generated as draft!");
      closeCreatePOModal();
    }).catch(err => {
      alert("Failed to generate PO: " + err.message);
    });
  };

  window.sendPurchaseOrder = function(id) {
    db.collection('purchaseOrders').doc(id).update({
      status: 'sent',
      sentAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      alert("Purchase order status updated to SENT!");
    }).catch(err => {
      alert("Error updating PO status: " + err.message);
    });
  };

  window.deletePurchaseOrder = function(id) {
    if (confirm("Are you sure you want to delete this draft PO?")) {
      db.collection('purchaseOrders').doc(id).delete().then(() => {
        alert("PO deleted.");
      }).catch(err => {
        alert("Failed to delete PO: " + err.message);
      });
    }
  };

  window.receivePurchaseOrder = function(id) {
    if (!confirm("Confirm receipt of all items? This will increment current stock levels in the inventory database.")) {
      return;
    }

    db.collection('purchaseOrders').doc(id).get().then(poDoc => {
      if (!poDoc.exists) return;
      const po = poDoc.data();
      if (po.status !== 'sent') {
        alert("Can only receive a PO that is currently marked as sent.");
        return;
      }

      const batch = db.batch();
      const promises = po.items.map(item => {
        const ingRef = db.collection('inventory').doc(item.itemId);
        
        return ingRef.get().then(ingDoc => {
          if (!ingDoc.exists) return;
          const currentStock = ingDoc.data().currentStock || 0;
          const newStock = currentStock + item.quantity;
          
          batch.update(ingRef, {
            currentStock: newStock,
            lastRestocked: firebase.firestore.FieldValue.serverTimestamp()
          });

          const logRef = db.collection('inventoryLog').doc();
          batch.set(logRef, {
            logId: logRef.id,
            itemId: item.itemId,
            itemName: item.itemName,
            changeType: "restock",
            previousStock: currentStock,
            newStock: newStock,
            changedBy: auth.currentUser?.uid || "system",
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            notes: `Restocked via PO #${po.poNumber}`
          });
        });
      });

      Promise.all(promises).then(() => {
        batch.update(db.collection('purchaseOrders').doc(id), {
          status: 'received',
          receivedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const auditRef = db.collection('auditLog').doc();
        batch.set(auditRef, {
          auditId: auditRef.id,
          action: "RECEIVE_PURCHASE_ORDER",
          performedBy: auth.currentUser?.uid || "system",
          performedByName: auth.currentUser?.email || "Manager",
          targetCollection: "purchaseOrders",
          targetId: po.poNumber,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        return batch.commit();
      }).then(() => {
        alert("✓ PO successfully received and inventory restocked!");
      }).catch(err => {
        alert("Failed receiving PO: " + err.message);
      });
    });
  };

  window.downloadPurchaseOrderPDF = function(id) {
    db.collection('purchaseOrders').doc(id).get().then(doc => {
      if (!doc.exists) return;
      const p = doc.data();

      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        alert("PDF generator script not loaded. Please ensure jsPDF CDN is loaded.");
        return;
      }

      const docPdf = new jsPDF();
      docPdf.setFont("Helvetica", "bold");
      docPdf.setFontSize(20);
      docPdf.setTextColor(201, 148, 58);
      docPdf.text("RUSSELL HALL CAFÉ", 14, 20);
      
      docPdf.setFont("Helvetica", "normal");
      docPdf.setFontSize(12);
      docPdf.setTextColor(80, 80, 80);
      docPdf.text("PURCHASE ORDER", 14, 28);
      docPdf.line(14, 32, 196, 32);

      docPdf.setFontSize(10);
      docPdf.text(`PO Number: ${p.poNumber}`, 14, 42);
      docPdf.text(`Supplier: ${p.supplierName}`, 14, 48);
      docPdf.text(`Date Generated: ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}`, 14, 54);
      docPdf.text(`Status: ${p.status.toUpperCase()}`, 14, 60);

      let y = 72;
      docPdf.setFont("Helvetica", "bold");
      docPdf.text("Item Name", 14, y);
      docPdf.text("Quantity", 90, y);
      docPdf.text("Unit Cost", 125, y);
      docPdf.text("Total", 165, y);
      docPdf.line(14, y + 2, 196, y + 2);
      y += 8;

      docPdf.setFont("Helvetica", "normal");
      p.items.forEach(item => {
        docPdf.text(item.itemName, 14, y);
        docPdf.text(`${item.quantity} ${item.unit || 'unit'}(s)`, 90, y);
        docPdf.text(formatPrice(item.unitCost), 125, y);
        docPdf.text(formatPrice(item.lineTotal), 165, y);
        y += 7;
      });

      docPdf.line(14, y + 1, 196, y + 1);
      y += 8;

      docPdf.text("Subtotal:", 125, y);
      docPdf.text(formatPrice(p.subtotal), 165, y);
      y += 6;
      docPdf.text("VAT Standard (20%):", 125, y);
      docPdf.text(formatPrice(p.tax), 165, y);
      y += 7;
      
      docPdf.setFont("Helvetica", "bold");
      docPdf.text("Grand Total:", 125, y);
      docPdf.text(formatPrice(p.grandTotal), 165, y);
      
      docPdf.setFont("Helvetica", "normal");
      if (p.notes) {
        y += 12;
        docPdf.text(`Notes: "${p.notes}"`, 14, y);
      }

      docPdf.save(`purchase_order_${p.poNumber}.pdf`);
    });
  };

  function startAuditLogsSnapshotListener() {
    console.log("[Firebase] Starting real-time audit logs snapshot listener...");
    auditUnsubscribe = db.collection('auditLog').onSnapshot(snapshot => {
      const logs = [];
      snapshot.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      renderAuditLogs(logs);
    }, err => {
      console.error("Audit log listener error:", err);
    });
  }

  function renderAuditLogs(logs) {
    const tbody = $('#audit-logs-rows');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:1.5rem 0;">No security audits logged yet.</td></tr>`;
      return;
    }

    logs.sort((a,b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return timeB - timeA;
    });

    tbody.innerHTML = logs.map(l => {
      const dateStr = l.timestamp?.toDate ? l.timestamp.toDate().toLocaleString() : 'Recent';
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-family:monospace; font-size:0.8rem;">
          <td style="padding:0.5rem 0; opacity:0.7;">${dateStr}</td>
          <td style="padding:0.5rem 0; color:#e8a825;">${l.action}</td>
          <td style="padding:0.5rem 0; opacity:0.8;">${l.performedByName || 'System'}</td>
          <td style="padding:0.5rem 0; opacity:0.7;">${l.targetCollection || 'N/A'}</td>
          <td style="padding:0.5rem 0; text-align:right; opacity:0.7;">${l.targetId || 'N/A'}</td>
        </tr>
      `;
    }).join('');
  }

  function updateStockValueChart(items) {
    const ctx = document.getElementById('chart-stock-value')?.getContext('2d');
    if (!ctx) return;

    const categories = {};
    items.forEach(item => {
      const cat = item.category || 'Other';
      const val = (item.currentStock || 0) * (item.costPerUnit || 0);
      categories[cat] = (categories[cat] || 0) + val;
    });

    const labels = Object.keys(categories);
    const data = Object.values(categories);

    if (chartStockValue) chartStockValue.destroy();

    const { Chart } = window;
    if (!Chart) return;

    chartStockValue = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#c9943a', '#e8a825', '#3498db', '#2ecc71', '#9b59b6', 
            '#e74c3c', '#1abc9c', '#d35400', '#f1c40f', '#34495e'
          ],
          borderWidth: 1,
          borderColor: '#121212'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#f5ead6', font: { family: 'Lora' } }
          }
        }
      }
    });
  }

  function loadWasteCostChart() {
    const ctx = document.getElementById('chart-waste-cost')?.getContext('2d');
    if (!ctx) return;

    db.collection('wasteLog').get().then(snap => {
      const wasteData = {};
      snap.forEach(doc => {
        const log = doc.data();
        wasteData[log.itemName] = (wasteData[log.itemName] || 0) + (log.cost || 0);
      });

      const sorted = Object.entries(wasteData).sort((a,b) => b[1] - a[1]).slice(0, 5);
      const labels = sorted.map(x => x[0]);
      const data = sorted.map(x => x[1]);

      if (chartWasteCost) chartWasteCost.destroy();

      const { Chart } = window;
      if (!Chart) return;

      chartWasteCost = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Waste Cost (£)',
            data: data,
            backgroundColor: 'rgba(231, 76, 60, 0.6)',
            borderColor: '#e74c3c',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f5ead6' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f5ead6' } }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    });
  }

  function loadSalesTurnoverChart() {
    const ctx = document.getElementById('chart-sales-turnover')?.getContext('2d');
    if (!ctx) return;

    db.collection('orders').where('status', 'in', ['complete', 'delivered']).get().then(snap => {
      const salesByDay = {};
      const now = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        salesByDay[d.toDateString()] = 0;
      }

      snap.forEach(doc => {
        const o = doc.data();
        const date = o.createdAt?.toDate ? o.createdAt.toDate() : null;
        if (date) {
          const dStr = date.toDateString();
          if (salesByDay[dStr] !== undefined) {
            salesByDay[dStr] += o.total || 0;
          }
        }
      });

      const labels = Object.keys(salesByDay).map(dateStr => {
        const d = new Date(dateStr);
        return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      });
      const data = Object.values(salesByDay);

      if (chartSalesTurnover) chartSalesTurnover.destroy();

      const { Chart } = window;
      if (!Chart) return;

      chartSalesTurnover = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Turnover (£)',
            data: data,
            borderColor: '#e8a825',
            backgroundColor: 'rgba(232, 168, 37, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f5ead6' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f5ead6' } }
          }
        }
      });
    });
  }

  // ==========================================================================
  // MODULE EXPOSURE / STARTUP
  // ==========================================================================
  window.initAdminInventorySystem = function() {
    prepopulateInventorySystem();
    startOrderDeductionListener();
    initWeeklyRota();
    initMenuCustomizer();
    
    // Bind filters & forms
    bindInventoryForms();

    // Start Snapshot listeners
    startInventorySnapshotListener();
    startSuppliersSnapshotListener();
    startPurchaseOrdersSnapshotListener();
    startAuditLogsSnapshotListener();

    // Load static charts
    loadWasteCostChart();
    loadSalesTurnoverChart();
  };

  window.startOrderDeductionListener = startOrderDeductionListener;

})();
