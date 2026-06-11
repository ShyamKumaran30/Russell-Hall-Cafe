const firebaseConfig = {
  apiKey: "AIzaSyA5Oj6hCzedhggjLJf5u6JqTS8zPO3J5sg",
  authDomain: "russell-hall-cafe.firebaseapp.com",
  projectId: "russell-hall-cafe",
  storageBucket: "russell-hall-cafe.firebasestorage.app",
  messagingSenderId: "700946954798",
  appId: "1:700946954798:web:4686e94d38427962ddfdbf",
  measurementId: "G-6L2T7YB36V"
};

let db = null;
let auth = null;

if (typeof firebase !== 'undefined') {
  try {
    // Initialize Firebase Compatibility
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();

    // Set Auth Persistence to LOCAL
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(() => {
        console.log('Auth persistence set to LOCAL');
      })
      .catch(error => {
        console.error('Persistence error:', error);
      });

    // Enable Firestore Offline Persistence
    db.enablePersistence().catch(err => {
      console.warn("Firestore offline persistence error:", err.code);
    });
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
} else {
  console.warn("Firebase SDK not loaded. Running in local fallback mode.");
}

// --- PORTAL SECURITY & ACCESS MANAGEMENT ---
const ROLES = {
  SUPERADMIN: 'superadmin',  // Full access everything
  ADMIN: 'admin',            // Full admin portal access
  KITCHEN: 'kitchen',        // Kitchen portal only
  STAFF: 'staff',            // Limited order status updates only
  CUSTOMER: 'customer'       // Customer website only
};

const PORTAL_ACCESS = {
  '/admin':   ['superadmin', 'admin'],
  '/kitchen': ['superadmin', 'admin', 'kitchen'],
  '/':        ['customer', 'superadmin', 'admin', 'kitchen', 'staff']
};

async function universalLogin(email, password, expectedPortal) {
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  
  if (!errorEl || !btn) return;
  
  errorEl.textContent = '';
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Signing in...';
  
  const key = 'loginAttempts_' + expectedPortal;
  const timeKey = 'loginTime_' + expectedPortal;
  const attempts = parseInt(sessionStorage.getItem(key) || '0');
  const lastTime = parseInt(sessionStorage.getItem(timeKey) || '0');
  const now = Date.now();
  
  if (attempts >= 5 && (now - lastTime) < 300000) {
    const remaining = Math.ceil((300000 - (now - lastTime)) / 1000);
    errorEl.textContent = `Too many attempts. Wait ${remaining} seconds.`;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }
  
  try {
    const credential = await firebase.auth()
      .signInWithEmailAndPassword(email, password);
    const user = credential.user;
    
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      await firebase.auth().signOut();
      throw { message: 'Account not found in database. Contact admin.' };
    }
    
    const userData = userDoc.data();
    const role = userData.role;
    
    const lookupPath = expectedPortal === 'customer' ? '/' : '/' + expectedPortal;
    const allowedRoles = PORTAL_ACCESS[lookupPath] || [];
    
    if (!allowedRoles.includes(role)) {
      let redirect = '';
      if (role === 'customer') redirect = 'the main customer website';
      else if (role === 'kitchen') redirect = 'the Kitchen Portal';
      else if (role === 'admin' || role === 'superadmin') redirect = 'the Admin Portal';
      
      // Write the audit log while still authenticated
      await db.collection('auditLog').add({
        action: 'wrong_portal_login_attempt',
        userEmail: email,
        userRole: role,
        attemptedPortal: expectedPortal,
        correctPortal: redirect,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Sign out user after writing the audit log
      await firebase.auth().signOut();
      
      throw { 
        message: `This account (${role}) cannot access the ${expectedPortal} portal. Please use ${redirect}.`
      };
    }
    
    db.collection('users').doc(user.uid).update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      lastLoginPortal: expectedPortal
    }).catch(err => console.error("Error updating lastLogin:", err));
    
    sessionStorage.setItem(key, '0');
    sessionStorage.setItem('loginTime', String(Date.now()));
    
    window.currentUser = user;
    window.currentUserProfile = userData;
    window.currentUserRole = role;
    
    // NOTE: For kitchen and admin portals, the onAuthStateChanged handler
    // (secureKitchenPage / secureAdminPage) will fire automatically after
    // signInWithEmailAndPassword resolves and will call initKitchenPortal /
    // initAdminDashboard.  We do NOT call them here to avoid double-init.
    if (expectedPortal === 'customer' && typeof initCustomerPortal === 'function') {
      initCustomerPortal();
    }
    
    db.collection('auditLog').add({
      action: 'login_success',
      performedBy: user.uid,
      performedByEmail: email,
      role: role,
      portal: expectedPortal,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Error writing audit log:", err));
    
  } catch (error) {
    // Predefined accounts auto-creation check
    const isPredefinedAdmin = (email === 'admin@russellhallcafe.co.uk' && password === 'RHAdmin2026!');
    const isPredefinedKitchen = (email === 'kitchen@russellhallcafe.co.uk' && password === 'RHChef2026!');
    
    if ((error.code === 'auth/user-not-found' || error.code === 'auth/invalid-login-credentials') && (isPredefinedAdmin || isPredefinedKitchen)) {
      try {
        errorEl.textContent = 'Initializing predefined staff account...';
        btn.disabled = true;
        
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const role = isPredefinedAdmin ? 'admin' : 'kitchen';
        const name = isPredefinedAdmin ? 'System Admin' : 'Head Chef';
        
        await db.collection('users').doc(cred.user.uid).set({
          uid: cred.user.uid,
          name: name,
          email: email,
          role: role,
          isWorking: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        sessionStorage.setItem(key, '0');
        sessionStorage.setItem('loginTime', String(Date.now()));
        window.location.reload();
        return;
      } catch (createErr) {
        btn.disabled = false;
        btn.textContent = originalText;
        errorEl.textContent = 'Initialization error: ' + createErr.message;
        errorEl.style.display = 'block';
        return;
      }
    }

    sessionStorage.setItem(key, String(attempts + 1));
    sessionStorage.setItem(timeKey, String(Date.now()));
    
    let message = error.message || 'Login failed.';
    if (error.code === 'auth/user-not-found') {
      message = 'No account found with this email.';
    } else if (error.code === 'auth/wrong-password') {
      message = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/too-many-requests') {
      message = 'Account temporarily locked by Firebase. Try again later.';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Invalid email address format.';
    } else if (error.code === 'auth/network-request-failed') {
      message = 'Network error. Check your internet connection.';
    }
    
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.style.color = '#e74c3c';
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
window.universalLogin = universalLogin;

async function seedTablesIfEmpty() {
  try {
    const snapshot = await firebase.firestore()
      .collection('tables')
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      console.log('Tables already exist in Firestore');
      return;
    }
    
    console.log('Seeding 6 tables to Firestore...');
    const batch = firebase.firestore().batch();
    
    const tables = [
      {
        id: 'table_1',
        number: 1,
        name: 'Table 1',
        capacity: 2,
        zone: 'Window',
        shape: 'round',
        status: 'available',
        posX: 54,
        posY: 35,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      },
      {
        id: 'table_2',
        number: 2,
        name: 'Table 2',
        capacity: 2,
        zone: 'Window',
        shape: 'round',
        status: 'available',
        posX: 54,
        posY: 65,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      },
      {
        id: 'table_3',
        number: 3,
        name: 'Table 3',
        capacity: 4,
        zone: 'Indoor',
        shape: 'square',
        status: 'available',
        posX: 12,
        posY: 35,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      },
      {
        id: 'table_4',
        number: 4,
        name: 'Table 4',
        capacity: 4,
        zone: 'Indoor',
        shape: 'square',
        status: 'available',
        posX: 12,
        posY: 65,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      },
      {
        id: 'table_5',
        number: 5,
        name: 'Table 5',
        capacity: 6,
        zone: 'Indoor',
        shape: 'rectangle',
        status: 'available',
        posX: 28,
        posY: 50,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      },
      {
        id: 'table_6',
        number: 6,
        name: 'Table 6',
        capacity: 6,
        zone: 'Outdoor',
        shape: 'rectangle',
        status: 'available',
        posX: 84,
        posY: 50,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: null
      }
    ];
    
    tables.forEach(table => {
      const ref = firebase.firestore()
        .collection('tables')
        .doc(table.id);
      batch.set(ref, table);
    });
    
    await batch.commit();
    console.log('6 tables seeded successfully');
    
  } catch (error) {
    console.error('Table seed error:', error);
  }
}
window.seedTablesIfEmpty = seedTablesIfEmpty;

function renderFloorPlan(tables, containerId, isAdmin = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const statusColors = {
    available: { fill: '#0d3b1e', stroke: '#27ae60', text: '#58d68d' },
    occupied:  { fill: '#3d0d0d', stroke: '#e74c3c', text: '#f1948a' }
  };
  
  let availCount = 0, occupiedCount = 0;
  
  // Create SVG floor plan container
  container.innerHTML = `
    <div style="overflow-x:auto;padding:1rem">
      <!-- Legend -->
      <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
        ${Object.entries(statusColors).map(([status, colors]) => `
          <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.06em">
            <div style="width:12px;height:12px;border-radius:2px;background:${colors.fill};border:1px solid ${colors.stroke}"></div>
            <span style="color:${colors.text}">${status}</span>
          </div>`).join('')}
        <div style="margin-left:auto;font-family:'Oswald',sans-serif;font-size:0.75rem;color:#8a7a68;display:flex;align-items:center;gap:0.5rem;">
          <span id="fast-filling-badge" style="display:none;font-size:0.8rem;background:rgba(0,0,0,0.5);padding:2px 6px;border-radius:4px;"></span>
          <span><span style="color:#27ae60;font-weight:600" id="available-count">0</span> available</span> · 
          <span><span style="color:#e74c3c;font-weight:600" id="occupied-count">0</span> occupied</span>
        </div>
      </div>
      
      <!-- Floor plan SVG -->
      <svg id="floor-plan-svg" viewBox="0 0 500 320" 
           style="width:100%;max-width:800px;background:#0d0d0d;border:1px solid #2a1e10;border-radius:8px;display:block">
        
        <!-- Zone backgrounds -->
        <rect x="5" y="5" width="185" height="310" rx="6" 
              fill="rgba(232,168,37,0.03)" stroke="#2a1e10" stroke-width="0.5"/>
        <text x="97" y="18" text-anchor="middle" 
              fill="#5a4a38" font-family="Oswald" font-size="8" letter-spacing="1">INDOOR</text>
        
        <rect x="195" y="5" width="150" height="310" rx="6" 
              fill="rgba(52,152,219,0.03)" stroke="#2a1e10" stroke-width="0.5"/>
        <text x="270" y="18" text-anchor="middle" 
              fill="#1a3a5e" font-family="Oswald" font-size="8" letter-spacing="1">WINDOW</text>
        
        <rect x="350" y="5" width="145" height="310" rx="6" 
              fill="rgba(39,174,96,0.03)" stroke="#2a1e10" stroke-width="0.5"/>
        <text x="422" y="18" text-anchor="middle" 
              fill="#0d3b1e" font-family="Oswald" font-size="8" letter-spacing="1">OUTDOOR</text>
        
        <!-- Tables rendered dynamically -->
        <g id="tables-group"></g>
        
        <!-- Counter/bar area -->
        <rect x="180" y="140" width="15" height="40" rx="2"
              fill="#1a1209" stroke="#c9943a" stroke-width="1"/>
        <text x="187" y="163" text-anchor="middle" 
              fill="#c9943a" font-family="Oswald" font-size="6">BAR</text>
      </svg>
    </div>`;
  
  const tablesGroup = container.querySelector('#tables-group');
  if (!tablesGroup) return;
  
  tables.forEach(table => {
    const colors = statusColors[table.status] || statusColors.available;
    const cx = (table.posX / 100) * 490 + 5;
    const cy = (table.posY / 100) * 300 + 20;
    
    if (table.status === 'available') availCount++;
    else if (table.status === 'occupied') occupiedCount++;
    
    let tableShape = '';
    if (table.shape === 'round') {
      tableShape = `<circle cx="${cx}" cy="${cy}" r="22" 
        fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"
        style="cursor:pointer"
        onclick="${isAdmin ? `adminTableClick('${table.id}')` : `customerTableInfo('${table.id}')`}"/>`;
    } else if (table.shape === 'square') {
      tableShape = `<rect x="${cx-22}" y="${cy-22}" width="44" height="44" rx="4"
        fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"
        style="cursor:pointer"
        onclick="${isAdmin ? `adminTableClick('${table.id}')` : `customerTableInfo('${table.id}')`}"/>`;
    } else {
      tableShape = `<rect x="${cx-30}" y="${cy-16}" width="60" height="32" rx="4"
        fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"
        style="cursor:pointer"
        onclick="${isAdmin ? `adminTableClick('${table.id}')` : `customerTableInfo('${table.id}')`}"/>`;
    }
    
    let timerBadge = '';
    if (table.status === 'occupied' && table.occupiedSince) {
      const seatedTime = table.occupiedSince.toDate ? table.occupiedSince.toDate().getTime() : new Date(table.occupiedSince).getTime();
      const mins = Math.floor((Date.now() - seatedTime) / 60000);
      timerBadge = `<text x="${cx+22}" y="${cy-14}" 
        fill="${mins > 60 ? '#e74c3c' : '#e8a825'}" 
        font-family="Oswald" font-size="8" font-weight="600">${mins}m</text>`;
    }
    
    tablesGroup.innerHTML += `
      <g id="table-${table.id}" class="table-node">
        ${tableShape}
        <text x="${cx}" y="${cy+2}" text-anchor="middle" 
              fill="${colors.text}" font-family="Oswald" 
              font-size="10" font-weight="600"
              style="pointer-events:none">T${table.number}</text>
        <text x="${cx}" y="${cy+12}" text-anchor="middle" 
              fill="${colors.text}" font-family="Oswald" 
              font-size="7" opacity="0.8"
              style="pointer-events:none">${table.capacity}👤</text>
        ${timerBadge}
      </g>`;
  });
  
  if (container.querySelector('#available-count')) container.querySelector('#available-count').textContent = availCount;
  if (container.querySelector('#occupied-count')) container.querySelector('#occupied-count').textContent = occupiedCount;
  
  const fastFillingBadge = container.querySelector('#fast-filling-badge');
  if (fastFillingBadge) {
    if (availCount === 0) {
      fastFillingBadge.innerHTML = '<span style="color:#e74c3c;animation:pulse 2s infinite">🚫 FULL HOUSE</span>';
      fastFillingBadge.style.display = 'inline-block';
    } else if (availCount <= 3) {
      fastFillingBadge.innerHTML = '<span style="color:#e8a825;animation:pulse 2s infinite">🔥 FAST FILLING</span>';
      fastFillingBadge.style.display = 'inline-block';
    } else {
      fastFillingBadge.style.display = 'none';
    }
  }

  // Global Real-Time Customer Status Indicators
  const navDot = document.getElementById('nav-live-tables-status-dot');
  if (navDot) {
    if (availCount === 0) {
      navDot.style.background = '#e74c3c';
    } else if (availCount <= 3) {
      navDot.style.background = '#e8a825';
    } else {
      navDot.style.background = '#27ae60';
    }
  }

  const modalBanner = document.getElementById('booking-modal-status-banner');
  const dashBanner = document.getElementById('dash-booking-status-banner');
  let bannerHTML = '';
  
  if (availCount === 0) {
    bannerHTML = `
      <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; border-radius: 6px; padding: 0.6rem; text-align: center; font-size: 0.8rem; color: #f1948a; font-family: 'Lora', serif; line-height: 1.4;">
        🚫 <strong>Full House (0/6 Tables Available)</strong><br>
        All live tables are currently occupied. You can still pre-book a slot in advance below!
      </div>`;
  } else if (availCount <= 3) {
    bannerHTML = `
      <div style="background: rgba(232, 168, 37, 0.1); border: 1px solid #e8a825; border-radius: 6px; padding: 0.6rem; text-align: center; font-size: 0.8rem; color: #f5c518; font-family: 'Lora', serif; line-height: 1.4; animation: livePulse 1.5s infinite;">
        🔥 <strong>Fast Filling (Only ${availCount}/6 Tables Free)</strong><br>
        The café is currently busy. Book now to secure a live table!
      </div>`;
  } else {
    bannerHTML = `
      <div style="background: rgba(39, 174, 96, 0.1); border: 1px solid #27ae60; border-radius: 6px; padding: 0.6rem; text-align: center; font-size: 0.8rem; color: #58d68d; font-family: 'Lora', serif; line-height: 1.4;">
        🟢 <strong>Tables Available (${availCount}/6 Free)</strong><br>
        Walk-ins welcome or pick a preferred table below to book!
      </div>`;
  }

  if (modalBanner) {
    modalBanner.innerHTML = bannerHTML;
    modalBanner.style.display = 'block';
  }
  if (dashBanner) {
    dashBanner.innerHTML = bannerHTML;
    dashBanner.style.display = 'block';
  }

  // Dynamic update of Preferred Table dropdown if container is customer-floor-map
  if (containerId === 'customer-floor-map') {
    const tableSelect = document.getElementById('book-table');
    if (tableSelect) {
      const currentSelected = tableSelect.value;
      
      tableSelect.innerHTML = `
        <option value="any">Any Available Table</option>
      `;
      
      // Sort tables by number ascending
      const sortedTables = [...tables].sort((a, b) => a.number - b.number);
      
      sortedTables.forEach(table => {
        const option = document.createElement('option');
        option.value = table.number.toString();
        
        const statusText = table.status.charAt(0).toUpperCase() + table.status.slice(1);
        option.textContent = `Table ${table.number} (${table.zone} - ${table.capacity} seats) - ${statusText}`;
        
        if (table.status !== 'available') {
          option.disabled = true;
          option.textContent += ' (Unavailable)';
        }
        
        tableSelect.appendChild(option);
      });
      
      // Restore selected value if still valid
      const selectedOption = tableSelect.querySelector(`option[value="${currentSelected}"]`);
      if (selectedOption && !selectedOption.disabled) {
        tableSelect.value = currentSelected;
      } else {
        tableSelect.value = 'any';
      }
    }
  }
}
window.renderFloorPlan = renderFloorPlan;

function watchTables(containerId, isAdmin = false) {
  if (typeof db === 'undefined' || !db) {
    console.warn("[Firebase] Offline/fallback: watchTables using local mock data.");
    const mockTables = [
      { id: 'table_1', number: 1, name: 'Table 1', capacity: 2, zone: 'Window', shape: 'round', status: 'available', posX: 54, posY: 35 },
      { id: 'table_2', number: 2, name: 'Table 2', capacity: 2, zone: 'Window', shape: 'round', status: 'available', posX: 54, posY: 65 },
      { id: 'table_3', number: 3, name: 'Table 3', capacity: 4, zone: 'Indoor', shape: 'square', status: 'available', posX: 12, posY: 35 },
      { id: 'table_4', number: 4, name: 'Table 4', capacity: 4, zone: 'Indoor', shape: 'square', status: 'available', posX: 12, posY: 65 },
      { id: 'table_5', number: 5, name: 'Table 5', capacity: 6, zone: 'Indoor', shape: 'rectangle', status: 'available', posX: 28, posY: 50 },
      { id: 'table_6', number: 6, name: 'Table 6', capacity: 6, zone: 'Outdoor', shape: 'rectangle', status: 'available', posX: 84, posY: 50 }
    ];
    window._allTables = mockTables;
    renderFloorPlan(mockTables, containerId, isAdmin);
    return () => {};
  }

  return db.collection('tables')
    .orderBy('number')
    .onSnapshot(snapshot => {
      const tables = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      window._allTables = tables;
      renderFloorPlan(tables, containerId, isAdmin);
    }, error => {
      console.error(`[Firebase] Tables listener error for ${containerId}:`, error);
      const container = document.getElementById(containerId);
      if (container) {
        let errorMsg = 'Failed to load floor plan.';
        if (error.code === 'permission-denied') {
          errorMsg = 'Permission denied. Please ensure your Firestore Security Rules allow public read access for the "tables" collection (allow read: if true).';
        }
        container.innerHTML = `
          <div style="padding:1.5rem; text-align:center; color:#e74c3c; border:1px dashed rgba(231,76,60,0.4); border-radius:8px; font-family:'Lora',serif; font-size:0.85rem; background:rgba(231,76,60,0.05);">
            ⚠️ ${errorMsg}
          </div>
        `;
      }
    });
}
window.watchTables = watchTables;

async function adminTableClick(tableId) {
  openTableDetailModal(tableId);
}
window.adminTableClick = adminTableClick;


function closeTableModal() {
  document.getElementById('table-modal-bg').style.display = 'none';
}
window.closeTableModal = closeTableModal;

async function saveTableNotes(tableId) {
  const notesInput = document.getElementById('table-notes-input');
  const notes = notesInput ? notesInput.value.trim() : '';
  await db.collection('tables').doc(tableId).update({
    notes: notes,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  closeTableModal();
  showToast('Table notes saved!', 'success');
}
window.saveTableNotes = saveTableNotes;

async function setTableStatus(tableId, status) {
  const updates = {
    status: status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'system'
  };
  if (status === 'occupied') {
    updates.occupiedSince = firebase.firestore.FieldValue.serverTimestamp();
  } else if (status === 'available') {
    updates.currentOrderId = null;
    updates.currentCustomerName = null;
    updates.currentCustomerCount = null;
    updates.occupiedSince = null;
    updates.estimatedClearTime = null;
  }
  await db.collection('tables').doc(tableId).update(updates);
  closeTableModal();
  showToast(`Table status updated to ${status}`, 'success');
}
window.setTableStatus = setTableStatus;

// --- QR CODE table ORDERING ---
async function generateTableQR(tableId) {
  const table = window._allTables?.find(t => t.id === tableId);
  if (!table) return;
  
  const tableUrl = `${window.location.origin}/?table=${table.number}&zone=${table.zone}`;
  
  // Use QR code library from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  document.head.appendChild(script);
  
  script.onload = () => {
    const modal = document.getElementById('qr-modal');
    modal.innerHTML = `
      <div style="background:#1a1209;border:1px solid #c9943a;border-radius:10px;
                  padding:2rem;text-align:center;max-width:320px;width:100%">
        <h3 style="font-family:'Playfair Display',serif;color:#e8a825;
                   margin-bottom:0.3rem">Table ${table.number} QR Code</h3>
        <p style="color:#8a7a68;font-size:0.8rem;margin-bottom:1.2rem">
          Scan to order directly from this table
        </p>
        <div id="qr-code-display" style="background:#fff;padding:1rem;
                                          border-radius:8px;display:inline-block;
                                          margin-bottom:1rem"></div>
        <p style="color:#8a7a68;font-size:0.72rem;margin-bottom:1rem;
                  word-break:break-all">${tableUrl}</p>
        <div style="display:flex;gap:0.5rem">
          <button onclick="printQRCode(${table.number})" style="
            flex:1;background:#e8a825;border:none;color:#0d0d0d;
            padding:0.6rem;border-radius:6px;font-family:'Oswald',sans-serif;
            font-weight:600;font-size:0.82rem;cursor:pointer">
            🖨️ Print
          </button>
          <button onclick="closeQRModal()" style="
            flex:1;background:none;border:1px solid #c9943a;color:#e8a825;
            padding:0.6rem;border-radius:6px;font-family:'Oswald',sans-serif;
            font-weight:500;font-size:0.82rem;cursor:pointer">
            Close
          </button>
        </div>
      </div>`;
    
    document.getElementById('qr-modal-bg').style.display = 'flex';
    
    new QRCode(document.getElementById('qr-code-display'), {
      text: tableUrl,
      width: 200,
      height: 200,
      colorDark: '#0d0d0d',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
    db.collection('tables').doc(tableId).update({
      qrCodeUrl: tableUrl
    });
  };
}
window.generateTableQR = generateTableQR;

function closeQRModal() {
  document.getElementById('qr-modal-bg').style.display = 'none';
}
window.closeQRModal = closeQRModal;

function printQRCode(tableNumber) {
  const printWindow = window.open('', '_blank');
  const qrDisplay = document.getElementById('qr-code-display');
  if (!qrDisplay) return;
  const qrImage = qrDisplay.querySelector('img');
  const qrSrc = qrImage ? qrImage.src : '';
  printWindow.document.write(`
    <html>
      <head>
        <title>Table ${tableNumber} QR Code</title>
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Oswald', sans-serif; text-align: center; background: #000; color: #fff; }
          img { width: 300px; height: 300px; margin-bottom: 20px; border: 10px solid #fff; border-radius: 8px; }
          h1 { margin: 0; font-size: 2rem; color: #e8a825; }
        </style>
      </head>
      <body>
        <img src="${qrSrc}" />
        <h1>Table ${tableNumber}</h1>
        <p>Russell Hall Café - Scan to Order</p>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
window.printQRCode = printQRCode;

function customerTableInfo(tableId) {
  const table = window._allTables?.find(t => t.id === tableId);
  if (!table) return;
  
  if (table.status !== 'available') {
    showToast(`Table ${table.number} (${table.zone}) is currently ${table.status}. Please select an available table.`, 'warning');
    return;
  }
  
  const preferredTableInput = document.getElementById('book-table');
  if (preferredTableInput) {
    // Check if the booking modal is open
    const bookingModal = document.getElementById('booking-modal');
    const isBookingOpen = bookingModal && bookingModal.classList.contains('open');
    
    if (!isBookingOpen) {
      // Close the user dashboard modal if open
      const userDashboardModal = document.getElementById('user-dashboard-modal');
      if (userDashboardModal && userDashboardModal.classList.contains('open')) {
        const closeBtn = document.getElementById('user-dashboard-close');
        if (closeBtn) {
          closeBtn.click();
        } else {
          userDashboardModal.classList.remove('open');
          document.body.style.overflow = '';
        }
      }
      
      // Open booking modal
      if (typeof window.openBookingModal === 'function') {
        window.openBookingModal();
      } else if (bookingModal) {
        bookingModal.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }
    
    // Set the selected table value in the dropdown
    preferredTableInput.value = table.number.toString();
    showToast(`Selected Table ${table.number} (${table.zone}) for your booking.`, 'success');
  } else {
    showToast(`Table ${table.number} (${table.zone}) is ${table.status}. To book, tap the "Book a Table" option on the home page.`, 'info');
  }
}
window.customerTableInfo = customerTableInfo;

// --- TOAST SYSTEM ---
function showToast(message, type = 'info', duration = 3500) {
  const colors = {
    success: { bg:'#0d3b1e', border:'#27ae60', text:'#58d68d', icon:'✅' },
    error:   { bg:'#3d0d0d', border:'#e74c3c', text:'#f1948a', icon:'❌' },
    warning: { bg:'#3d2b00', border:'#e8a825', text:'#f5c518', icon:'⚠️' },
    info:    { bg:'#0d2d4a', border:'#3498db', text:'#7fb3d3', icon:'ℹ️' },
    order:   { bg:'#1a1209', border:'#e8a825', text:'#f5ead6', icon:'🍽️' }
  };
  
  const c = colors[type] || colors.info;
  
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
      display:flex;flex-direction:column;gap:0.5rem;max-width:320px;`;
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${c.bg};border:1px solid ${c.border};border-radius:8px;
    padding:0.9rem 1.2rem;display:flex;align-items:flex-start;gap:0.7rem;
    animation:toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
    box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
  toast.innerHTML = `
    <span style="font-size:1.1rem;flex-shrink:0">${c.icon}</span>
    <div style="flex:1">
      <div style="color:${c.text};font-size:0.85rem;font-family:'Lora',serif;
                  line-height:1.4">${message}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="
      background:none;border:none;color:#8a7a68;cursor:pointer;
      font-size:0.9rem;flex-shrink:0;padding:0;line-height:1">✕</button>`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
window.showToast = showToast;

async function saveDailySpecial(specialData) {
  const today = new Date().toISOString().split('T')[0];
  const data = {
    ...specialData,
    active: true,
    remainingQuantity: specialData.totalQuantity,
    emoji: '🍳',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  return db.collection('dailySpecials').doc(today).set(data);
}
window.saveDailySpecial = saveDailySpecial;

// --- ADMIN TABLE MANAGEMENT PANEL (PART 3 & PART 4) ---

function renderAdminTableManagement(tables) {
  const container = document.getElementById('admin-tables-container');
  if (!container) return;
  
  const availableCount = tables.filter(t => t.status === 'available').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  
  // Real-time Active reservations metric calculations
  const activeBookings = window._allBookings || [];
  const liveBookings = activeBookings.filter(b => b.status === 'confirmed' || b.status === 'pending');
  const bookedPeopleCount = liveBookings.reduce((sum, b) => sum + parseInt(b.guests || 0), 0);
  const bookingsCount = liveBookings.length;
  
  container.innerHTML = `
    <!-- Stats row -->
    <div style="
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.8rem;
      margin-bottom: 1rem;
    ">
      <div style="background:#0d3b1e;border:1px solid #27ae60;border-radius:8px;
                  padding:0.8rem;text-align:center">
        <div style="font-family:'Oswald',sans-serif;font-size:1.8rem;
                    color:#58d68d;font-weight:600">${availableCount}</div>
        <div style="font-size:0.7rem;color:#27ae60;font-family:'Oswald',sans-serif;
                    text-transform:uppercase">Available</div>
      </div>
      <div style="background:#3d0d0d;border:1px solid #e74c3c;border-radius:8px;
                  padding:0.8rem;text-align:center">
        <div style="font-family:'Oswald',sans-serif;font-size:1.8rem;
                    color:#f1948a;font-weight:600">${occupiedCount}</div>
        <div style="font-size:0.7rem;color:#e74c3c;font-family:'Oswald',sans-serif;
                    text-transform:uppercase">Occupied</div>
      </div>
      <div style="background:#1a1209;border:1px solid #2a1e10;border-radius:8px;
                  padding:0.8rem;text-align:center">
        <div style="font-family:'Oswald',sans-serif;font-size:1.8rem;
                    color:#e8a825;font-weight:600">${tables.length}</div>
        <div style="font-size:0.7rem;color:#8a7a68;font-family:'Oswald',sans-serif;
                    text-transform:uppercase">Total</div>
      </div>
    </div>

    <!-- Active Reservations Summary Card -->
    <div style="background:rgba(201,148,58,0.05); border:1px solid rgba(201,148,58,0.3); border-radius:8px; padding:0.8rem 1rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-family:'Oswald',sans-serif; font-size:0.65rem; color:#8a7a68; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.15rem">Currently Booked Tables</div>
        <div style="font-family:'Oswald',sans-serif; font-size:1.1rem; color:#e8a825; font-weight:600">${bookingsCount} Active Booking${bookingsCount !== 1 ? 's' : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:'Oswald',sans-serif; font-size:0.65rem; color:#8a7a68; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.15rem">Total Guests Booked</div>
        <div style="font-family:'Oswald',sans-serif; font-size:1.1rem; color:#e8a825; font-weight:600">${bookedPeopleCount} People</div>
      </div>
    </div>
    
    <!-- Add new table button -->
    <div style="margin-bottom:1rem;display:flex;justify-content:flex-end">
      <button onclick="showAddTableForm()" style="
        background:#e8a825;border:none;color:#0d0d0d;
        padding:0.6rem 1.2rem;border-radius:6px;
        font-family:'Oswald',sans-serif;font-weight:600;
        font-size:0.85rem;cursor:pointer;letter-spacing:0.05em;
      ">+ ADD TABLE</button>
    </div>
    
    <!-- Tables management grid -->
    <div style="
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    ">
      ${tables.map(table => renderAdminTableCard(table)).join('')}
    </div>`;
}
window.renderAdminTableManagement = renderAdminTableManagement;

function renderAdminTableCard(table) {
  const statusColors = {
    available: { border:'#27ae60', bg:'#0d3b1e', text:'#58d68d' },
    occupied:  { border:'#e74c3c', bg:'#3d0d0d', text:'#f1948a' }
  };
  
  const c = statusColors[table.status] || statusColors.available;
  
  return `
    <div style="
      background:${c.bg};
      border:2px solid ${c.border};
      border-radius:10px;
      padding:1rem;
      transition:all 0.2s;
    ">
      <div style="display:flex;justify-content:space-between;
                  align-items:flex-start;margin-bottom:0.8rem">
        <div>
          <div style="font-family:'Playfair Display',serif;
                      color:${c.text};font-size:1.1rem">
            Table ${table.number}
          </div>
          <div style="font-family:'Oswald',sans-serif;font-size:0.7rem;
                      color:#5a4a38;text-transform:uppercase;
                      letter-spacing:0.06em">${table.zone} · ${table.capacity} seats</div>
        </div>
        <span style="
          background:${c.border};
          color:#fff;
          font-family:'Oswald',sans-serif;font-size:0.62rem;
          font-weight:600;padding:0.2rem 0.5rem;border-radius:10px;
          letter-spacing:0.05em;text-transform:uppercase;
        ">${table.status}</span>
      </div>
      
      ${table.status === 'occupied' && table.currentCustomerName ? `
        <div style="font-size:0.78rem;color:#8a7a68;margin-bottom:0.5rem;
                    font-family:'Lora',serif">
          👤 ${table.currentCustomerName} · ${table.guestCount || '?'} guests
        </div>` : ''}
      
      ${table.notes ? `
        <div style="font-size:0.75rem;color:#5a4a38;margin-bottom:0.5rem;
                    font-family:'Lora',serif;font-style:italic">
          "${table.notes}"
        </div>` : ''}
      
      <!-- Status change buttons -->
      <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.6rem">
        ${['available','occupied']
          .filter(s => s !== table.status)
          .map(s => `
            <button onclick="updateTableStatus('${table.id}','${s}')" style="
              background:#111;
              border:1px solid #2a1e10;
              color:#8a7a68;
              padding:0.3rem 0.6rem;
              border-radius:4px;
              font-family:'Oswald',sans-serif;
              font-size:0.65rem;
              cursor:pointer;
              text-transform:uppercase;
              letter-spacing:0.04em;
              transition:all 0.15s;
            "
            onmouseover="this.style.borderColor='#c9943a';this.style.color='#e8a825'"
            onmouseout="this.style.borderColor='#2a1e10';this.style.color='#8a7a68'">
              ${s}
            </button>`).join('')}
        <button onclick="openTableDetailModal('${table.id}')" style="
          background:#e8a825;border:none;color:#0d0d0d;
          padding:0.3rem 0.6rem;border-radius:4px;
          font-family:'Oswald',sans-serif;font-size:0.65rem;
          cursor:pointer;font-weight:600;letter-spacing:0.04em;
        ">DETAILS</button>
      </div>
    </div>`;
}
window.renderAdminTableCard = renderAdminTableCard;

async function updateTableStatus(tableId, newStatus) {
  try {
    const updateData = {
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.uid || null
    };
    
    if (newStatus === 'occupied') {
      updateData.occupiedSince = firebase.firestore.FieldValue.serverTimestamp();
    }
    
    if (newStatus === 'available') {
      updateData.currentOrderId = null;
      updateData.currentCustomerName = null;
      updateData.guestCount = null;
      updateData.occupiedSince = null;
      updateData.reservedFor = null;
      updateData.reservationTime = null;
      updateData.reservationDate = null;
      updateData.notes = '';
    }
    
    await firebase.firestore()
      .collection('tables')
      .doc(tableId)
      .update(updateData);
    
    showToast(`Table updated to ${newStatus}`, 'success');
    
  } catch (error) {
    console.error('Table update error:', error);
    showToast('Failed to update table. Check connection.', 'error');
  }
}
window.updateTableStatus = updateTableStatus;

function openTableDetailModal(tableId) {
  const table = window._liveTables?.find(t => t.id === tableId) || window._allTables?.find(t => t.id === tableId);
  if (!table) return;
  
  let modal = document.getElementById('table-detail-modal');
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.id = 'table-detail-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    z-index:9000;display:flex;align-items:center;
    justify-content:center;padding:1rem;
  `;
  modal.onclick = function(e) {
    if (e.target === modal) modal.remove();
  };
  
  modal.innerHTML = `
    <div style="
      background:#1a1209;border:1px solid #c9943a;
      border-radius:12px;padding:1.5rem;
      max-width:440px;width:100%;max-height:90vh;overflow-y:auto;
    ">
      <div style="display:flex;justify-content:space-between;
                  align-items:center;margin-bottom:1.2rem">
        <h3 style="font-family:'Playfair Display',serif;color:#e8a825;
                   font-size:1.1rem">Table ${table.number} Details</h3>
        <button onclick="document.getElementById('table-detail-modal').remove()" 
                style="background:none;border:none;color:#8a7a68;
                       font-size:1.1rem;cursor:pointer">✕</button>
      </div>
      
      <div style="margin-bottom:0.8rem">
        <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                      color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                      display:block;margin-bottom:0.3rem">Customer Name</label>
        <input id="td-customer-name" value="${table.currentCustomerName || ''}"
               placeholder="e.g. Johnson family"
               style="width:100%;background:#111;border:1px solid #2a1e10;
                      color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                      font-family:'Lora',serif;font-size:0.85rem;
                      outline:none;box-sizing:border-box"
               onfocus="this.style.borderColor='#e8a825'"
               onblur="this.style.borderColor='#2a1e10'">
      </div>
      
      <div style="display:flex;gap:0.8rem;margin-bottom:0.8rem">
        <div style="flex:1">
          <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                        color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                        display:block;margin-bottom:0.3rem">Number of Guests</label>
          <select id="td-guest-count"
                  style="width:100%;background:#111;border:1px solid #2a1e10;
                         color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                         font-family:'Oswald',sans-serif;font-size:0.85rem;
                         outline:none;box-sizing:border-box">
            <option value="0" ${!table.guestCount ? 'selected' : ''}>None</option>
            ${[1,2,3,4,5,6,7,8,10,12].map(n => 
              `<option value="${n}" ${table.guestCount===n?'selected':''}>${n} guests</option>`
            ).join('')}
          </select>
        </div>
        <div style="flex:1">
          <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                        color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                        display:block;margin-bottom:0.3rem">Status</label>
          <select id="td-status"
                  style="width:100%;background:#111;border:1px solid #2a1e10;
                         color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                         font-family:'Oswald',sans-serif;font-size:0.85rem;
                         outline:none;box-sizing:border-box">
            ${['available','occupied'].map(s =>
              `<option value="${s}" ${table.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <!-- Geometry / Configuration Section -->
      <div style="border-top:1px dashed rgba(201,148,58,0.2);margin:1.2rem 0;padding-top:0.8rem">
        <h4 style="font-family:'Oswald',sans-serif;font-size:0.8rem;color:#c9943a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.8rem">Table Geometry Setup</h4>
        
        <div style="display:flex;gap:0.8rem;margin-bottom:0.8rem">
          <div style="flex:1">
            <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                          color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                          display:block;margin-bottom:0.3rem">Capacity (seats)</label>
            <select id="td-capacity"
                    style="width:100%;background:#111;border:1px solid #2a1e10;
                           color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                           font-family:'Oswald',sans-serif;font-size:0.85rem;
                           outline:none;box-sizing:border-box">
              ${[2,4,6,8,10,12].map(n => 
                `<option value="${n}" ${table.capacity===n?'selected':''}>${n} seats</option>`
              ).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                          color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                          display:block;margin-bottom:0.3rem">Shape</label>
            <select id="td-shape"
                    style="width:100%;background:#111;border:1px solid #2a1e10;
                           color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                           font-family:'Oswald',sans-serif;font-size:0.85rem;
                           outline:none;box-sizing:border-box">
              ${['round','square','rectangle'].map(s => 
                `<option value="${s}" ${table.shape===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div style="display:flex;gap:0.8rem;margin-bottom:0.8rem">
          <div style="flex:1">
            <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                          color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                          display:block;margin-bottom:0.3rem">Zone</label>
            <select id="td-zone"
                    style="width:100%;background:#111;border:1px solid #2a1e10;
                           color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                           font-family:'Oswald',sans-serif;font-size:0.85rem;
                           outline:none;box-sizing:border-box">
              ${['Indoor','Window','Outdoor','Private'].map(z => 
                `<option value="${z}" ${table.zone===z?'selected':''}>${z}</option>`
              ).join('')}
            </select>
          </div>
          <div style="flex:1;display:flex;gap:0.4rem">
            <div style="flex:1">
              <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                            color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                            display:block;margin-bottom:0.3rem">Pos X (%)</label>
              <input id="td-posx" type="number" min="0" max="100" value="${table.posX || 50}"
                     style="width:100%;background:#111;border:1px solid #2a1e10;
                            color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                            font-family:'Oswald',sans-serif;font-size:0.85rem;
                            outline:none;box-sizing:border-box">
            </div>
            <div style="flex:1">
              <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                            color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                            display:block;margin-bottom:0.3rem">Pos Y (%)</label>
              <input id="td-posy" type="number" min="0" max="100" value="${table.posY || 50}"
                     style="width:100%;background:#111;border:1px solid #2a1e10;
                            color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                            font-family:'Oswald',sans-serif;font-size:0.85rem;
                            outline:none;box-sizing:border-box">
            </div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom:1.2rem">
        <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                      color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                      display:block;margin-bottom:0.3rem">Notes</label>
        <textarea id="td-notes" rows="2"
                  placeholder="Any notes about this table..."
                  style="width:100%;background:#111;border:1px solid #2a1e10;
                         color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                         font-family:'Lora',serif;font-size:0.82rem;
                         outline:none;resize:none;box-sizing:border-box"
                  onfocus="this.style.borderColor='#e8a825'"
                  onblur="this.style.borderColor='#2a1e10'"
        >${table.notes || ''}</textarea>
      </div>
      
      <div style="display:flex;gap:0.6rem;margin-bottom:0.6rem">
        <button onclick="generateTableQR('${tableId}')"
                style="flex:1;background:none;border:1px solid #c9943a;
                       color:#e8a825;padding:0.7rem;border-radius:6px;
                       font-family:'Oswald',sans-serif;font-weight:500;
                       cursor:pointer;font-size:0.85rem">📱 QR Code</button>
        <button onclick="document.getElementById('table-detail-modal').remove()"
                style="flex:1;background:none;border:1px solid #2a1e10;
                       color:#8a7a68;padding:0.7rem;border-radius:6px;
                       font-family:'Oswald',sans-serif;font-weight:500;
                       cursor:pointer;font-size:0.85rem">Cancel</button>
        <button onclick="saveTableDetails('${tableId}')"
                style="flex:2;background:#e8a825;border:none;color:#0d0d0d;
                       padding:0.7rem;border-radius:6px;
                       font-family:'Oswald',sans-serif;font-weight:600;
                       cursor:pointer;font-size:0.85rem">SAVE CHANGES</button>
      </div>
      
      <button onclick="deleteTable('${tableId}')"
              style="width:100%;margin-top:0.8rem;background:#3d0d0d;border:1px solid #e74c3c;
                     color:#f1948a;padding:0.7rem;border-radius:6px;
                     font-family:'Oswald',sans-serif;font-weight:600;
                     cursor:pointer;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em">
        DELETE TABLE PERMANENTLY
      </button>
    </div>`;
  
  document.body.appendChild(modal);
}
window.openTableDetailModal = openTableDetailModal;

async function saveTableDetails(tableId) {
  const customerName = document.getElementById('td-customer-name')?.value?.trim();
  const guestCount = parseInt(document.getElementById('td-guest-count')?.value || '0');
  const status = document.getElementById('td-status')?.value;
  const notes = document.getElementById('td-notes')?.value?.trim();
  
  const capacity = parseInt(document.getElementById('td-capacity')?.value || '2');
  const shape = document.getElementById('td-shape')?.value;
  const zone = document.getElementById('td-zone')?.value;
  const posX = parseInt(document.getElementById('td-posx')?.value || '50');
  const posY = parseInt(document.getElementById('td-posy')?.value || '50');
  
  try {
    const updateData = {
      status: status,
      currentCustomerName: customerName || null,
      guestCount: guestCount > 0 ? guestCount : null,
      notes: notes || '',
      capacity: capacity,
      shape: shape,
      zone: zone,
      posX: posX,
      posY: posY,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.uid || null
    };
    
    if (status === 'occupied' && !window._liveTables?.find(t=>t.id===tableId)?.occupiedSince) {
      updateData.occupiedSince = firebase.firestore.FieldValue.serverTimestamp();
    }
    
    if (status === 'available') {
      updateData.currentOrderId = null;
      updateData.currentCustomerName = null;
      updateData.guestCount = null;
      updateData.occupiedSince = null;
    }
    
    await firebase.firestore()
      .collection('tables')
      .doc(tableId)
      .update(updateData);
    
    document.getElementById('table-detail-modal')?.remove();
    showToast('Table details saved — customers can see this live', 'success');
    
  } catch (error) {
    console.error('Save table error:', error);
    showToast('Failed to save. Check connection.', 'error');
  }
}
window.saveTableDetails = saveTableDetails;

async function deleteTable(tableId) {
  const table = window._liveTables?.find(t => t.id === tableId);
  const number = table ? table.number : '';
  if (!confirm(`Are you sure you want to delete Table ${number} permanently? This will remove it from the floor plan.`)) {
    return;
  }
  
  try {
    await firebase.firestore()
      .collection('tables')
      .doc(tableId)
      .delete();
    
    document.getElementById('table-detail-modal')?.remove();
    showToast(`Table ${number} deleted successfully`, 'success');
  } catch (error) {
    console.error('Delete table error:', error);
    showToast('Failed to delete table. Check permission.', 'error');
  }
}
window.deleteTable = deleteTable;

function showAddTableForm() {
  let modal = document.getElementById('add-table-modal');
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.id = 'add-table-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    z-index:9000;display:flex;align-items:center;
    justify-content:center;padding:1rem;
  `;
  modal.onclick = function(e) { if(e.target===modal) modal.remove(); };
  
  modal.innerHTML = `
    <div style="background:#1a1209;border:1px solid #c9943a;
                border-radius:12px;padding:1.5rem;max-width:380px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-bottom:1.2rem">
        <h3 style="font-family:'Playfair Display',serif;color:#e8a825;
                   font-size:1.1rem">Add New Table</h3>
        <button onclick="document.getElementById('add-table-modal').remove()"
                style="background:none;border:none;color:#8a7a68;
                       font-size:1.1rem;cursor:pointer">✕</button>
      </div>
      
      <div style="margin-bottom:0.8rem">
        <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                      color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                      display:block;margin-bottom:0.3rem">Table Number</label>
        <input id="new-table-number" type="number" min="1" max="50"
               placeholder="e.g. 7"
               style="width:100%;background:#111;border:1px solid #2a1e10;
                      color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                      font-family:'Oswald',sans-serif;font-size:0.9rem;
                      outline:none;box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:0.8rem">
        <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                      color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                      display:block;margin-bottom:0.3rem">Capacity (seats)</label>
        <select id="new-table-capacity"
                style="width:100%;background:#111;border:1px solid #2a1e10;
                       color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                       font-family:'Oswald',sans-serif;font-size:0.85rem;
                       outline:none;box-sizing:border-box">
          <option value="2">2 seats</option>
          <option value="4" selected>4 seats</option>
          <option value="6">6 seats</option>
          <option value="8">8 seats</option>
          <option value="10">10 seats</option>
        </select>
      </div>
      
      <div style="margin-bottom:0.8rem">
        <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                      color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                      display:block;margin-bottom:0.3rem">Zone</label>
        <select id="new-table-zone"
                style="width:100%;background:#111;border:1px solid #2a1e10;
                       color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                       font-family:'Oswald',sans-serif;font-size:0.85rem;
                       outline:none;box-sizing:border-box">
          <option value="Indoor">Indoor</option>
          <option value="Window">Window</option>
          <option value="Outdoor">Outdoor</option>
          <option value="Private">Private Dining</option>
        </select>
      </div>

      <div style="display:flex;gap:0.8rem;margin-bottom:1.2rem">
        <div style="flex:1">
          <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                        color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                        display:block;margin-bottom:0.3rem">Shape</label>
          <select id="new-table-shape"
                  style="width:100%;background:#111;border:1px solid #2a1e10;
                         color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                         font-family:'Oswald',sans-serif;font-size:0.85rem;
                         outline:none;box-sizing:border-box">
            <option value="round">Round</option>
            <option value="square" selected>Square</option>
            <option value="rectangle">Rectangle</option>
          </select>
        </div>
        <div style="flex:1;display:flex;gap:0.4rem">
          <div style="flex:1">
            <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                          color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                          display:block;margin-bottom:0.3rem">Pos X (%)</label>
            <input id="new-table-posx" type="number" min="0" max="100" placeholder="Auto"
                   style="width:100%;background:#111;border:1px solid #2a1e10;
                          color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                          font-family:'Oswald',sans-serif;font-size:0.85rem;
                          outline:none;box-sizing:border-box">
          </div>
          <div style="flex:1">
            <label style="font-family:'Oswald',sans-serif;font-size:0.72rem;
                          color:#8a7a68;text-transform:uppercase;letter-spacing:0.06em;
                          display:block;margin-bottom:0.3rem">Pos Y (%)</label>
            <input id="new-table-posy" type="number" min="0" max="100" placeholder="Auto"
                   style="width:100%;background:#111;border:1px solid #2a1e10;
                          color:#f5ead6;padding:0.6rem 0.8rem;border-radius:4px;
                          font-family:'Oswald',sans-serif;font-size:0.85rem;
                          outline:none;box-sizing:border-box">
          </div>
        </div>
      </div>
      
      <div style="display:flex;gap:0.6rem">
        <button onclick="document.getElementById('add-table-modal').remove()"
                style="flex:1;background:none;border:1px solid #2a1e10;
                       color:#8a7a68;padding:0.7rem;border-radius:6px;
                       font-family:'Oswald',sans-serif;cursor:pointer">
          Cancel
        </button>
        <button onclick="addNewTable()"
                style="flex:2;background:#e8a825;border:none;color:#0d0d0d;
                       padding:0.7rem;border-radius:6px;
                       font-family:'Oswald',sans-serif;font-weight:600;
                       cursor:pointer">
          ADD TABLE
        </button>
      </div>
    </div>`;
  
  document.body.appendChild(modal);
}
window.showAddTableForm = showAddTableForm;

async function addNewTable() {
  const number = parseInt(document.getElementById('new-table-number')?.value);
  const capacity = parseInt(document.getElementById('new-table-capacity')?.value);
  const zone = document.getElementById('new-table-zone')?.value;
  const shape = document.getElementById('new-table-shape')?.value || (capacity <= 2 ? 'round' : capacity <= 4 ? 'square' : 'rectangle');
  
  let posX = parseInt(document.getElementById('new-table-posx')?.value);
  let posY = parseInt(document.getElementById('new-table-posy')?.value);
  
  if (isNaN(posX)) {
    posX = zone === 'Indoor' ? 12 : zone === 'Window' ? 54 : zone === 'Outdoor' ? 84 : 50;
  }
  if (isNaN(posY)) {
    posY = 10 + Math.floor(Math.random() * 80);
  }
  
  if (!number || number < 1) {
    showToast('Please enter a valid table number', 'error');
    return;
  }
  
  const existing = window._liveTables?.find(t => t.number === number);
  if (existing) {
    showToast(`Table ${number} already exists`, 'error');
    return;
  }
  
  try {
    await firebase.firestore()
      .collection('tables')
      .doc('table_' + number)
      .set({
        id: 'table_' + number,
        number: number,
        name: 'Table ' + number,
        capacity: capacity,
        zone: zone,
        shape: shape,
        status: 'available',
        posX: posX,
        posY: posY,
        currentOrderId: null,
        currentCustomerName: null,
        guestCount: null,
        occupiedSince: null,
        reservedFor: null,
        reservationTime: null,
        reservationDate: null,
        notes: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: firebase.auth().currentUser?.uid || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: firebase.auth().currentUser?.uid || null
      });
    
    document.getElementById('add-table-modal')?.remove();
    showToast(`Table ${number} added — visible to customers live`, 'success');

    
  } catch (error) {
    console.error('Add table error:', error);
    showToast('Failed to add table. Check connection.', 'error');
  }
}
window.addNewTable = addNewTable;

function startAdminTablesWatcher() {
  firebase.firestore()
    .collection('tables')
    .orderBy('number', 'asc')
    .onSnapshot(snapshot => {
      const tables = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      window._liveTables = tables;
      renderAdminTableManagement(tables);
    });
}
window.startAdminTablesWatcher = startAdminTablesWatcher;

function updateAdminBookingStats() {
  if (window._liveTables) {
    renderAdminTableManagement(window._liveTables);
  }
}
window.updateAdminBookingStats = updateAdminBookingStats;


