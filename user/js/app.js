(function () {
  'use strict';

  /* ============================================
     RUSSELL HALL CAFÉ — COMPLETE APP.JS
     ============================================ */

  window.showImagePlaceholder = function(imgEl, emoji, name) {
    const parent = imgEl.parentElement;
    if (!parent) return;
    
    // Hide the image
    imgEl.style.display = 'none';
    
    // Remove existing placeholder if any
    const existing = parent.querySelector('.menu-image-placeholder');
    if (existing) existing.remove();
    
    // Create new placeholder using class from style.css
    const placeholder = document.createElement('div');
    placeholder.className = 'menu-image-placeholder';
    placeholder.innerHTML = `
      <div class="placeholder-emoji">${emoji}</div>
      <div class="placeholder-name">${name}</div>
    `;
    
    parent.appendChild(placeholder);
  };

  // --- STATE ---
  let stripe = null, cardElement = null, paymentRequest = null, tipAmount = 0;
  let menuMode = 'browse';
  let browseViewMode = 'list';
  let cart = [];
  let appliedCoupon = null;
  let pendingItem = null;
  let serviceChargeEnabled = false;
  let currentCheckoutStep = 1;
  let currentPaymentMethod = 'card';
  let lastOrderNum = '';
  let trackingInterval = null;
  let currentTrackingStage = 0;
  let activeCategory = 'all';
  let currentCategory = 'All';
  let menuSearchQuery = '';
  const SERVICE_RATE = 0.1;

  function sanitizeInput(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    let clean = str.replace(/<\/?[^>]+(>|$)/g, "");
    return clean.slice(0, maxLength);
  }

  const COUPONS_LOCAL = {
    BRUNCH10: { type: 'percent', value: 10, label: '10% off', discount: 0 },
    WELCOME15: { type: 'percent', value: 15, label: '15% off', discount: 0 },
    RHC20: { type: 'fixed', value: 2, label: '£2 off', discount: 2 },
    STUDENT5: { type: 'fixed', value: 5, label: '£5 off', discount: 5, min: 20 }
  };

  // --- HELPERS ---
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const formatPrice = n => '£' + n.toFixed(2);
  const cartKey = (item, options) => item.id + '::' + (options || []).map(o => o.label).sort().join('|');
  const getCartCount = () => cart.reduce((s, l) => s + l.qty, 0);
  const getSubtotal = () => cart.reduce((s, l) => s + l.lineTotal, 0);
  const getDiscount = () => appliedCoupon ? appliedCoupon.discount : 0;
  const getServiceCharge = () => serviceChargeEnabled ? Math.round(getSubtotal() * SERVICE_RATE * 100) / 100 : 0;
  const getTotal = () => Math.max(0, getSubtotal() + getServiceCharge() + tipAmount - getDiscount());
  const getTotalPence = () => Math.round(getTotal() * 100);

  const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePhone = phone => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    let formatted = cleaned;
    if (formatted.startsWith('00')) {
      formatted = '+' + formatted.substring(2);
    } else if (/^0[1-9]\d{9}$/.test(cleaned)) {
      formatted = '+44' + cleaned.substring(1);
    }
    const isValid = /^\+[1-9]\d{9,14}$/.test(formatted);
    return { isValid, formatted };
  };

  function calculateVAT() {
    const orderTypeEl = $('#order-type-checkout');
    const orderType = orderTypeEl ? orderTypeEl.value : 'collection';
    let taxableAmount = 0;

    cart.forEach(l => {
      let isZeroRated = false;
      
      // Zero-rated items for takeaway/collection/delivery: sandwiches, side salad, side slaw
      if (orderType !== 'dine-in') {
        const itemId = l.id;
        if (itemId.startsWith('s') && !itemId.startsWith('si') && !itemId.startsWith('soft')) {
          isZeroRated = true;
        }
        if (itemId === 'si1' || itemId === 'si2') {
          isZeroRated = true;
        }
      }

      if (!isZeroRated) {
        taxableAmount += l.lineTotal;
      }
    });

    // Proportional service charge addition
    const svc = getServiceCharge();
    if (svc > 0) {
      taxableAmount += svc;
    }

    // Proportional discount subtraction
    const sub = getSubtotal();
    if (sub > 0 && appliedCoupon) {
      const discountPct = getDiscount() / sub;
      taxableAmount -= (taxableAmount * discountPct);
    }

    // UK VAT is 20% (inclusive calculations: Taxable * 20 / 120 = Taxable / 6)
    const vat = Math.max(0, Math.round((taxableAmount / 6) * 100) / 100);
    return vat;
  }

  function calculatePrepTime() {
    if (cart.length === 0) return 0;
    let maxPrep = 5;
    let totalItems = 0;
    cart.forEach(item => {
      totalItems += item.qty;
      const itemId = item.id || '';
      let itemPrep = 5;
      if (itemId.startsWith('bu')) {
        itemPrep = 12;
      } else if (itemId.startsWith('b') && !itemId.startsWith('be')) {
        if (itemId === 'b2' || itemId === 'b5') itemPrep = 15;
        else itemPrep = 10;
      } else if (itemId.startsWith('m')) {
        itemPrep = 5;
      } else if (itemId.startsWith('t')) {
        itemPrep = 8;
      } else if (itemId.startsWith('s') && !itemId.startsWith('si') && !itemId.startsWith('soft')) {
        itemPrep = 6;
      } else if (itemId.startsWith('c')) {
        itemPrep = 7;
      } else if (itemId.startsWith('si')) {
        itemPrep = 5;
      } else if (itemId.startsWith('hd')) {
        itemPrep = 3;
      } else if (itemId.startsWith('sd') || itemId.startsWith('be') || itemId.startsWith('co')) {
        itemPrep = 2;
      } else if (itemId.startsWith('d')) {
        itemPrep = 15;
      }
      if (itemPrep > maxPrep) maxPrep = itemPrep;
    });
    const extraTime = Math.max(0, totalItems - 1) * 1;
    const finalPrep = Math.min(30, maxPrep + extraTime);
    return finalPrep;
  }


  function imgSrc(path) {
    if (!path) return '';
    if (window.location.protocol === 'file:') {
      return path;
    }
    // Append cache buster to bypass cached broken images in user's browser
    return path.includes('?') ? `${path}&v=3` : `${path}?v=3`;
  }

  function initLazyLoading() {
    // Handled natively by browser loading="lazy"
  }

  // --- SMART SEARCH FILTER SYSTEM ---
  const quickFilters = [
    { label: '🌿 Vegetarian', query: 'vegetarian' },
    { label: '☕ Coffee', query: 'coffee' },
    { label: '🍔 Burgers', query: 'burger' },
    { label: '🍳 Breakfast', query: 'breakfast' },
    { label: '💰 Under £4', type: 'price', max: 4 },
    { label: '🔥 Popular', type: 'popular' },
    { label: '⚡ Deals', query: 'deal' },
  ];

  function getAllMenuItems() {
    if (window._allMenuItems && window._allMenuItems.length > 0) {
      return window._allMenuItems;
    }
    const all = [];
    for (const cat of Object.values(menuData)) {
      if (cat.items) {
        all.push(...cat.items);
      }
    }
    return all;
  }

  function searchMenuItems(query, allItems) {
    if (!query || query.trim() === '') return allItems;
    
    const q = query.toLowerCase().trim();
    
    // Check specific filters
    const isVegetarianFilter = q === 'vegetarian';
    const isPopularFilter = q === 'popular';
    
    let maxPrice = null;
    if (q.startsWith('under £')) {
      maxPrice = parseFloat(q.replace('under £', ''));
    } else if (q.startsWith('under ')) {
      maxPrice = parseFloat(q.replace('under ', ''));
    } else if (q.startsWith('price:')) {
      maxPrice = parseFloat(q.replace('price:', ''));
    }
    
    return allItems.filter(item => {
      if (isVegetarianFilter && item.veg) return true;
      if (isPopularFilter && item.tag && item.tag.toLowerCase().includes('popular')) return true;
      if (maxPrice !== null && item.price <= maxPrice) return true;
      
      // Search across multiple fields
      const nameMatch = item.name?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);
      const catMatch = item.category?.toLowerCase().includes(q);
      const tagMatch = item.tags?.some(t => t.toLowerCase().includes(q)) || (item.tag && item.tag.toLowerCase().includes(q));
      const allergenMatch = item.allergens?.some(a => a.toLowerCase().includes(q));
      const priceMatch = item.price?.toString().includes(q);
      
      // Fuzzy match for typos — checks if 60% of characters match
      const fuzzyMatch = fuzzyScore(item.name?.toLowerCase(), q) > 0.6;
      
      return nameMatch || descMatch || catMatch || 
             tagMatch || allergenMatch || priceMatch || fuzzyMatch;
    });
  }

  // Simple fuzzy matching function
  function fuzzyScore(str, pattern) {
    if (!str || !pattern) return 0;
    if (str.includes(pattern)) return 1;
    let score = 0;
    let patternIdx = 0;
    for (let i = 0; i < str.length && patternIdx < pattern.length; i++) {
      if (str[i] === pattern[patternIdx]) {
        score++;
        patternIdx++;
      }
    }
    return score / pattern.length;
  }

  function showSearchSuggestions(query, allItems) {
    const suggestionsEl = document.getElementById('search-suggestions');
    if (!suggestionsEl) return;
    
    if (query.length < 2) {
      suggestionsEl.style.display = 'none';
      return;
    }
    
    const matches = searchMenuItems(query, allItems).slice(0, 6);
    
    if (matches.length === 0) {
      suggestionsEl.style.display = 'block';
      suggestionsEl.innerHTML = `
        <div style="padding:1rem;text-align:center;color:#8a7a68;font-size:0.85rem">
          No items found for "<strong style="color:#e8a825">${query}</strong>"
          <div style="margin-top:0.4rem;font-size:0.75rem">
            Try: burger, breakfast, coffee, toastie...
          </div>
        </div>`;
      return;
    }
    
    suggestionsEl.style.display = 'block';
    suggestionsEl.innerHTML = matches.map(item => `
      <div onclick="selectSuggestion('${item.id}')" style="
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.7rem 1rem;
        cursor: pointer;
        border-bottom: 1px solid rgba(42,30,16,0.5);
        transition: background 0.15s;
      "
      onmouseover="this.style.background='rgba(232,168,37,0.08)'"
      onmouseout="this.style.background='none'">
        <span style="font-size:1.3rem">${item.emoji || '🍔'}</span>
        <div style="flex:1;min-width:0;text-align:left;">
          <div style="
            font-family:'Playfair Display',serif;
            font-size:0.9rem;
            color:#f5ead6;
          ">${highlightMatch(item.name, query)}</div>
          <div style="
            font-size:0.75rem;
            color:#8a7a68;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">${item.category} · ${item.description?.substring(0,40)}...</div>
        </div>
        <div style="
          font-family:'Oswald',sans-serif;
          font-weight:600;
          color:#e8a825;
          flex-shrink:0;
        ">£${item.price?.toFixed(2)}</div>
      </div>`).join('');
      
    // Add "see all results" footer
    suggestionsEl.innerHTML += `
      <div onclick="performSearch('${query}')" style="
        padding:0.6rem 1rem;
        text-align:center;
        font-size:0.8rem;
        font-family:'Oswald',sans-serif;
        color:#e8a825;
        cursor:pointer;
        letter-spacing:0.06em;
      "
      onmouseover="this.style.background='rgba(232,168,37,0.08)'"
      onmouseout="this.style.background='none'">
        SEE ALL ${searchMenuItems(query, allItems).length} RESULTS →
      </div>`;
  }

  // Highlight matching text in gold
  function highlightMatch(text, query) {
    if (!text || !query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:rgba(232,168,37,0.25);color:#e8a825;border-radius:2px;padding:0 2px">$1</mark>');
  }

  function selectSuggestion(itemId) {
    const suggestions = document.getElementById('search-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    
    // Switch to order mode first so that cards are rendered in the DOM
    if (menuMode !== 'order') {
      setMenuMode('order');
    }
    
    // Find card in the DOM by data-id
    const itemCard = document.querySelector(`.order-card[data-id="${itemId}"]`);
    if (itemCard) {
      itemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      itemCard.style.border = '2px solid #e8a825';
      itemCard.style.boxShadow = '0 0 15px rgba(232,168,37,0.4)';
      setTimeout(() => {
        itemCard.style.border = '';
        itemCard.style.boxShadow = '';
      }, 2000);
    }
  }

  function showNoResults(query, targetSelector = null) {
    let container;
    if (targetSelector) {
      container = document.querySelector(targetSelector);
    } else {
      container = menuMode === 'browse' ? document.getElementById('menu-chalkboard') : document.getElementById('order-items-container');
    }
    if (!container) return;
    container.innerHTML = `
      <div style="
        grid-column: 1/-1;
        text-align: center;
        padding: 3rem 1rem;
        width: 100%;
      ">
        <div style="font-size:3rem;margin-bottom:0.8rem">🔍</div>
        <h3 style="
          font-family:'Playfair Display',serif;
          color:#e8a825;
          font-size:1.3rem;
          margin-bottom:0.4rem;
        ">No results for "${query}"</h3>
        <p style="color:#8a7a68;font-size:0.85rem;margin-bottom:1.5rem">
          Try searching for something else or browse our categories
        </p>
        <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.5rem">
          ${['Breakfast','Burger','Coffee','Toastie','Sides'].map(s => `
            <button type="button" onclick="document.getElementById('menu-search-input').value='${s}'; performSearch('${s}')" style="
              background:rgba(232,168,37,0.1);
              border:1px solid #c9943a;
              color:#e8a825;
              padding:0.4rem 1rem;
              border-radius:20px;
              font-family:'Oswald',sans-serif;
              font-size:0.8rem;
              cursor:pointer;
            ">${s}</button>`).join('')}
        </div>
        <button type="button" onclick="clearSearch()" style="
          background:none;
          border:none;
          color:#8a7a68;
          font-size:0.82rem;
          cursor:pointer;
          text-decoration:underline;
        ">Clear search and show all items</button>
      </div>`;
  }

  function updateSearchInfoBar(query, resultCount, totalCount) {
    const bar = document.getElementById('search-info-bar');
    if (!bar) return;
    if (!query) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    bar.innerHTML = resultCount > 0
      ? `Showing <strong style="color:#e8a825">${resultCount}</strong> of ${totalCount} items for "<strong style="color:#e8a825">${query}</strong>" <span style="cursor:pointer;color:#8a7a68;margin-left:0.5rem" onclick="clearSearch()">✕ Clear</span>`
      : `No items found for "<strong style="color:#e8a825">${query}</strong>"`;
  }

  function performSearch(query) {
    menuSearchQuery = query.toLowerCase().trim();
    window._searchQuery = menuSearchQuery;
    
    // Switch view mode to list if searching
    if (menuSearchQuery !== '' && browseViewMode !== 'list') {
      browseViewMode = 'list';
    }

    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
      clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    }
    
    renderSearchResults(menuSearchQuery, window._allMenuItems || []);

    // Smoothly scroll to menu section on search
    if (menuSearchQuery !== '') {
      const menuSec = document.getElementById('menu-section');
      if (menuSec) {
        const rect = menuSec.getBoundingClientRect();
        if (rect.top > 150) {
          menuSec.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }

  function clearSearch() {
    const input = document.getElementById('menu-search-input');
    if (input) input.value = '';
    menuSearchQuery = '';
    window._searchQuery = '';
    
    const suggestions = document.getElementById('search-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    
    currentCategory = 'All';
    renderCategoryChips(window._allMenuItems || []);
    renderMenuByCategory(window._allMenuItems || [], 'All');
    
    if (input) input.focus();
  }

  function renderSearchFilterChips() {
    const container = document.getElementById('search-filter-chips');
    if (!container) return;
    
    const input = document.getElementById('menu-search-input');
    const currentQuery = input ? input.value.toLowerCase().trim() : '';
    
    container.innerHTML = quickFilters.map(filter => {
      let isActive = false;
      if (filter.type === 'price') {
        isActive = currentQuery === `under £${filter.max}` || currentQuery === `price:${filter.max}`;
      } else if (filter.type === 'popular') {
        isActive = currentQuery === 'popular';
      } else {
        isActive = currentQuery === filter.query;
      }
      
      return `
        <button 
          type="button"
          onclick="toggleQuickFilter('${filter.label}', '${filter.query || ''}', '${filter.type || ''}', ${filter.max || 0}, ${isActive})"
          style="
            background: ${isActive ? '#e8a825' : 'rgba(232, 168, 37, 0.1)'};
            border: 1px solid #c9943a;
            color: ${isActive ? '#1a1209' : '#e8a825'};
            padding: 0.4rem 1rem;
            border-radius: 20px;
            font-family: 'Oswald', sans-serif;
            font-size: 0.8rem;
            cursor: pointer;
            font-weight: ${isActive ? '600' : 'normal'};
            transition: all 0.2s;
          "
          onmouseover="if(!${isActive}) this.style.background='rgba(232, 168, 37, 0.2)'"
          onmouseout="if(!${isActive}) this.style.background='rgba(232, 168, 37, 0.1)'"
        >${filter.label}</button>
      `;
    }).join('');
  }

  function toggleQuickFilter(label, query, type, max, isActive) {
    if (isActive) {
      clearSearch();
    } else {
      const input = document.getElementById('menu-search-input');
      let searchQuery = '';
      if (type === 'price') {
        searchQuery = `under £${max}`;
      } else if (type === 'popular') {
        searchQuery = 'popular';
      } else {
        searchQuery = query;
      }
      
      if (input) {
        input.value = searchQuery;
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.style.display = 'block';
      }
      performSearch(searchQuery);
    }
  }

  // Expose search functions to window for onclick handlers
  window.searchMenuItems = searchMenuItems;
  window.selectSuggestion = selectSuggestion;
  window.performSearch = performSearch;
  window.clearSearch = clearSearch;
  window.toggleQuickFilter = toggleQuickFilter;

  let searchDebounceTimer;
  function initMenuSearch() {
    const input = document.getElementById('menu-search-input');
    if (!input) return;

    input.addEventListener('input', function(e) {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value;
      
      // Show clear button only when input has text (FIX 10)
      const clearBtn = document.getElementById('search-clear-btn');
      if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'block' : 'none';
      }
      
      // Show loading indicator (FIX 2)
      const loading = document.getElementById('search-loading');
      if (query.length > 0 && loading) {
        loading.style.display = 'block';
      }
      
      searchDebounceTimer = setTimeout(() => {
        if (loading) loading.style.display = 'none';
        performSearch(query);
        
        // Show live dropdown suggestions (FIX 4)
        showSearchSuggestions(query, getAllMenuItems());
      }, 300);
    });

    // Close suggestions when clicking outside (FIX 8)
    document.addEventListener('click', function(e) {
      const container = document.getElementById('search-container');
      if (container && !container.contains(e.target)) {
        const suggestions = document.getElementById('search-suggestions');
        if (suggestions) suggestions.style.display = 'none';
      }
    });
    
    // Initial render of filter chips
    renderSearchFilterChips();
  }

  function initLightbox() {
    const modal = $('#lightbox-modal');
    const closeBtn = $('#lightbox-close-btn');
    if (!modal) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('open');
        document.body.style.overflow = '';
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  // --- TOAST ---
  let toastTimer = null;
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  // --- CART BADGE ---
  function updateCartBadge() {
    const n = getCartCount();
    $$('.cart-badge').forEach(b => {
      b.textContent = n;
      b.style.display = n ? 'flex' : 'none';
    });
  }

  function bounceCart() {
    $$('.cart-btn, #mob-cart-btn').forEach(b => {
      b.classList.remove('bounce');
      void b.offsetWidth;
      b.classList.add('bounce');
    });
  }

  // --- CART PERSISTENCE ---
  function saveCart() {
    try { localStorage.setItem('rh_cart', JSON.stringify(cart)); } catch (_) {}
  }
  function loadCart() {
    try {
      const s = localStorage.getItem('rh_cart');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          cart = parsed;
          return;
        }
      }
    } catch (_) {}
    cart = [];
  }

  // --- FLY TO CART ANIMATION ---
  function flyToCart(imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const cartBtn = $('#nav-cart');
    const cartRect = cartBtn ? cartBtn.getBoundingClientRect() : null;
    // On mobile, fly to bottom nav cart
    const mobCartBtn = $('#mob-cart-btn');
    const mobRect = mobCartBtn && window.innerWidth <= 900 ? mobCartBtn.getBoundingClientRect() : null;
    const targetRect = mobRect || cartRect;
    if (!targetRect) return;

    const clone = document.createElement('img');
    clone.src = imgEl.src;
    clone.className = 'fly-clone';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    document.body.appendChild(clone);

    const targetX = targetRect.left + targetRect.width / 2 - rect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2 - rect.height / 2;

    if (window.gsap) {
      gsap.to(clone, {
        x: targetX - rect.left,
        y: targetY - rect.top,
        width: 30,
        height: 30,
        opacity: 0.3,
        duration: 0.7,
        ease: 'power2.in',
        onComplete: () => clone.remove()
      });
    } else {
      clone.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
      requestAnimationFrame(() => {
        clone.style.left = targetRect.left + 'px';
        clone.style.top = targetRect.top + 'px';
        clone.style.width = '30px';
        clone.style.height = '30px';
        clone.style.opacity = '0.3';
      });
      setTimeout(() => clone.remove(), 800);
    }
  }

  // --- CART OPERATIONS ---
  function addToCart(item, options, qty = 1, imgEl = null) {
    const opts = options || [];
    const extras = opts.reduce((s, o) => s + o.price, 0);
    const unitPrice = item.price + extras;
    const key = cartKey(item, opts);
    const existing = cart.find(l => l.key === key);
    if (existing) {
      existing.qty += qty;
      existing.lineTotal = existing.unitPrice * existing.qty;
    } else {
      cart.push({
        key, id: item.id, name: item.name, image: item.image,
        unitPrice, qty, lineTotal: unitPrice * qty,
        options: opts, veg: item.veg
      });
    }
    saveCart();
    updateCartBadge();
    bounceCart();
    if (imgEl) flyToCart(imgEl);
    if (typeof refreshMenuAfterCartChange === 'function') refreshMenuAfterCartChange();
    renderCart();
    showToast(`✓ ${item.name} added to cart`);
  }

  function setCartQty(key, delta) {
    const line = cart.find(l => l.key === key);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) cart = cart.filter(l => l.key !== key);
    else line.lineTotal = line.unitPrice * line.qty;
    saveCart(); updateCartBadge(); 
    if (typeof refreshMenuAfterCartChange === 'function') refreshMenuAfterCartChange();
    renderCart();
  }

  function removeFromCart(key) {
    cart = cart.filter(l => l.key !== key);
    saveCart(); updateCartBadge(); 
    if (typeof refreshMenuAfterCartChange === 'function') refreshMenuAfterCartChange();
    renderCart();
  }

  // --- FIND ITEM ---
  function findItem(id) {
    if (window._allMenuItems && window._allMenuItems.length > 0) {
      const item = window._allMenuItems.find(i => i.id === id);
      if (item) return item;
    }
    for (const cat of Object.values(menuData)) {
      const item = cat.items.find(i => i.id === id);
      if (item) return item;
    }
    return null;
  }
  function getItemQtyInCart(itemId) {
    return cart.filter(l => l.id === itemId).reduce((s, l) => s + l.qty, 0);
  }

  function renderBrowseMenu() {
    const container = $('#menu-chalkboard');
    if (!container) return;

    // View toggle header markup
    let toggleHtml = `
      <div class="chalkboard-toggle-wrap">
        <button class="chalk-toggle-btn ${browseViewMode === 'list' ? 'active' : ''}" data-view="list">📋 Interactive Chalk List</button>
        <button class="chalk-toggle-btn ${browseViewMode === 'chart' ? 'active' : ''}" data-view="chart">🎨 Visual Menu Chart</button>
      </div>
    `;

    if (browseViewMode === 'chart') {
      container.innerHTML = `
        ${toggleHtml}
        <div class="menu-chart-container reveal">
          <div class="menu-chart-frame" id="menu-chart-frame-element">
            <img src="images/menu-board.png" class="menu-chart-img" alt="Russell Hall Café Menu Chart" id="menu-chart-img">
            <div class="menu-chart-overlay">
              <span class="zoom-icon">🔍 Click to zoom & interact</span>
            </div>
          </div>
        </div>
      `;

      // Bind interactive mousemove 3D tilt effects
      const frame = $('#menu-chart-frame-element');
      const lightbox = $('#lightbox-modal');
      if (frame) {
        frame.addEventListener('click', () => {
          if (lightbox) {
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
          }
        });

        frame.addEventListener('mousemove', (e) => {
          const rect = frame.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const xc = rect.width / 2;
          const yc = rect.height / 2;
          const angleX = (yc - y) / 20; // Max 10 degrees tilt
          const angleY = (x - xc) / 20;
          frame.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        frame.addEventListener('mouseleave', () => {
          frame.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
      }

      bindBrowseToggleEvents(container);
      observeReveal();
      return;
    }

    // List view mode
    const colorMap = {
      deals: 'toasties', breakfast: 'breakfast', muffins: 'breakfast',
      toasties: 'toasties', sandwiches: 'sandwiches',
      cheesy: 'burgers', burgers: 'burgers',
      sides: 'burgers', cocktails: 'cocktails',
      beers: 'drinks', hotdrinks: 'drinks', softdrinks: 'drinks'
    };

    const filteredMenuData = {};
    for (const [key, cat] of Object.entries(menuData)) {
      const matchingItems = searchMenuItems(menuSearchQuery, cat.items);
      if (matchingItems.length > 0) {
        filteredMenuData[key] = {
          ...cat,
          items: matchingItems
        };
      }
    }

    if (Object.keys(filteredMenuData).length === 0) {
      container.innerHTML = `
        ${toggleHtml}
        <div id="no-results-target"></div>
      `;
      showNoResults(menuSearchQuery, '#no-results-target');
      bindBrowseToggleEvents(container);
      observeReveal();
      return;
    }

    let innerContent = `
        <div class="menu-chalkboard-grid">
          ${Object.entries(filteredMenuData).map(([key, cat]) => `
            <div class="chalk-category reveal">
              <h3 class="chalk-cat-title ${colorMap[key] || 'burgers'}">${cat.icon} ${cat.title}</h3>
              ${cat.subtitle ? `<p class="chalk-subtitle">${cat.subtitle}</p>` : ''}
              ${cat.items.map(item => `
                <div class="menu-item-row" style="${item.outOfStock ? 'opacity:0.55' : ''}">
                  <div class="menu-item-info">
                    <h4>${item.name}${item.veg ? '<span class="veg-badge">(v)</span>' : ''}${item.outOfStock ? ' <span class="deal-tag-chalk" style="background:#e74c3c;border-color:#e74c3c;color:#fff;font-size:0.65rem;padding:0.15rem 0.3rem;border-radius:4px;text-transform:uppercase;">Sold Out</span>' : item.tag ? ` <span class="deal-tag-chalk">${item.tag}</span>` : ''}</h4>
                    <p>${item.description}</p>
                  </div>
                  <span class="price">${key === 'deals' ? `<span class="original-price">${formatPrice(item.price + (item.price < 8.00 ? 2.00 : 3.00))}</span>` : ''}${formatPrice(item.price)}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `;

    container.innerHTML = `
      ${toggleHtml}
      ${innerContent}
    `;

    bindBrowseToggleEvents(container);
    observeReveal();
  }

  function bindBrowseToggleEvents(container) {
    container.querySelectorAll('.chalk-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        browseViewMode = btn.dataset.view;
        renderBrowseMenu();
      });
    });
  }

  // --- CATEGORY SLIDER ---
  function renderCategorySlider() {
    const slider = $('#category-slider');
    if (!slider) return;
    
    const expectedChipsCount = Object.keys(menuData).length + 1; // including 'All'
    if (slider.children.length === 0 || slider.querySelectorAll('.cat-chip').length !== expectedChipsCount) {
      const cats = [{ key: 'all', icon: '🍽️', title: 'All' }, ...Object.entries(menuData).map(([key, cat]) => ({
        key, icon: cat.icon, title: cat.title
      }))];
      slider.innerHTML = cats.map(c =>
        `<button class="cat-chip${c.key === activeCategory ? ' active' : ''}" data-cat="${c.key}">${c.icon} ${c.title}</button>`
      ).join('');
      slider.querySelectorAll('.cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          activeCategory = btn.dataset.cat;
          $$('.cat-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === activeCategory));
          renderOrderGrid();
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
      });
    } else {
      $$('.cat-chip', slider).forEach(b => b.classList.toggle('active', b.dataset.cat === activeCategory));
    }
  }

  // --- FEATURED PRODUCT ---
  function renderFeatured() {
    const container = $('#featured-container');
    if (!container) return;
    // Show featured item: Double Quarter
    const item = findItem('bu2');
    const matchesSearch = !menuSearchQuery || (item && searchMenuItems(menuSearchQuery, [item]).length > 0);

    if (!item || (activeCategory !== 'all' && activeCategory !== 'burgers') || !matchesSearch) {
      container.innerHTML = '';
      return;
    }
    const qty = getItemQtyInCart(item.id);
    container.innerHTML = `
      <div class="featured-product">
        <img class="featured-product-img" src="${imgSrc(item.image)}"
             onerror="this.onerror=null; showImagePlaceholder(this, '${item.emoji || '🍔'}', '${item.name.replace(/'/g, "\\'")}')"
             alt="Featured ${item.name} dish at Russell Hall Café">
        <div class="featured-product-info">
          <p class="featured-badge">⭐ Featured</p>
          <h3>${item.name}</h3>
          <p>${item.description}. Stacked double beef patties, melted American cheese, all the classics in a toasted brioche bun.</p>
          <div class="featured-price">${formatPrice(item.price)}</div>
          <div style="display:flex;gap:0.75rem;align-items:center">
            ${qty > 0 ? `
              <div class="qty-stepper">
                <button type="button" data-action="dec" data-id="${item.id}">−</button>
                <span>${qty}</span>
                <button type="button" data-action="inc" data-id="${item.id}">+</button>
              </div>
            ` : `
              <button class="btn btn-gold" data-customise="${item.id}" style="font-size:0.95rem;padding:0.7rem 1.8rem">+ Add to Cart</button>
            `}
          </div>
        </div>
      </div>
    `;
    bindOrderCardEvents(container);
    initLazyLoading();
    observeReveal();
  }

  function renderOrderGrid() {
    renderCategorySlider();
    renderFeatured();
    const container = $('#order-items-container');
    if (!container) return;

    const entries = Object.entries(menuData).filter(([key]) =>
      activeCategory === 'all' || key === activeCategory
    );

    const filteredEntries = [];
    entries.forEach(([key, cat]) => {
      const matchingItems = searchMenuItems(menuSearchQuery, cat.items);
      if (matchingItems.length > 0) {
        filteredEntries.push([
          key,
          {
            ...cat,
            items: matchingItems
          }
        ]);
      }
    });

    if (filteredEntries.length === 0) {
      showNoResults(menuSearchQuery);
      observeReveal();
      return;
    }

    container.innerHTML = filteredEntries.map(([key, cat]) => `
      <div class="order-category" data-cat="${key}">
        <div class="order-cat-header">
          <span>${cat.icon}</span>
          <h3>${cat.title}</h3>
        </div>
        ${cat.subtitle ? `<p class="chalk-subtitle" style="margin:-0.5rem 0 1rem 0">${cat.subtitle}</p>` : ''}
        <div class="order-grid">
          ${cat.items.map(item => {
            const qty = getItemQtyInCart(item.id);
            const hasOpts = (item.options && item.options.length) || (item.sizes && item.sizes.length);
            const isHighlighted = (key === 'deals' || item.id === 'bu1' || item.id === 'bu2');
            return `
              <article class="order-card${item.outOfStock ? ' out-of-stock-card' : ''}${isHighlighted ? ' highlight-large' : ''}" data-id="${item.id}" style="${item.outOfStock ? 'opacity:0.6;' : ''}">
                <div class="order-card-img-wrap">
                  <img class="order-card-img" src="${imgSrc(item.image)}"
                       onerror="this.onerror=null; showImagePlaceholder(this, '${item.emoji || '🍔'}', '${item.name.replace(/'/g, "\\'")}')"
                       alt="${item.name} food item at Russell Hall Café"
                       loading="lazy">
                  <button class="order-card-fav" aria-label="Favourite">♡</button>
                  ${(key === 'hotdrinks' || item.id.startsWith('hd')) ? `
                    <div class="steam-container">
                      <span class="steam-line"></span>
                      <span class="steam-line"></span>
                      <span class="steam-line"></span>
                    </div>
                  ` : ''}
                  ${item.originalPrice ? `
                    <span class="discount-badge">SALE</span>
                  ` : ''}
                  ${item.outOfStock ? `<span class="deal-badge-img" style="background:#e74c3c; box-shadow:0 0 10px #e74c3c;">SOLD OUT</span>` : item.tag ? `<span class="deal-badge-img">${item.tag}</span>` : ''}
                </div>
                <div class="order-card-body">
                  <h4>${item.name}${item.veg ? ' <span class="veg-badge">(v)</span>' : ''}</h4>
                  <p>${item.description}</p>
                  <div class="order-card-footer">
                    <span class="price">
                      ${item.originalPrice ? `<span class="original-price">${formatPrice(item.originalPrice)}</span>` : ''}
                      ${key === 'deals' && !item.originalPrice ? `<span class="original-price">${formatPrice(item.price + (item.price < 8.00 ? 2.00 : 3.00))}</span>` : ''}
                      ${formatPrice(item.price)}
                    </span>
                    ${item.outOfStock ? `
                      <button type="button" class="btn-add" disabled style="background:#333; color:#777; border-color:#333; cursor:not-allowed;">Sold Out</button>
                    ` : qty > 0 ? `
                      <div class="qty-stepper">
                        <button type="button" data-action="dec" data-id="${item.id}" aria-label="Decrease">−</button>
                        <span>${qty}</span>
                        <button type="button" data-action="inc" data-id="${item.id}" aria-label="Increase">+</button>
                      </div>
                    ` : hasOpts ? `
                      <button type="button" class="btn-add" data-customise="${item.id}">+ Add</button>
                    ` : `
                      <button type="button" class="btn-add" data-add="${item.id}">+ Add</button>
                    `}
                  </div>
                  ${!item.outOfStock && qty > 0 && hasOpts ? `<button type="button" class="btn-customise" data-customise="${item.id}">Customise & add more</button>` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
    bindOrderCardEvents(container);
    initLazyLoading();
    observeReveal();
  }

  function bindOrderCardEvents(container) {
    container.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = findItem(btn.dataset.add);
        if (!item) return;
        const card = btn.closest('.order-card') || btn.closest('.featured-product');
        const imgEl = card ? card.querySelector('img') : null;
        addToCart(item, [], 1, imgEl);
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 500);
      });
    });
    container.querySelectorAll('[data-customise]').forEach(btn => {
      btn.addEventListener('click', () => openCustomiseModal(btn.dataset.customise));
    });
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = findItem(btn.dataset.id);
        if (!item) return;
        const lines = cart.filter(l => l.id === item.id);
        if (btn.dataset.action === 'inc') {
          if (item.options?.length) openCustomiseModal(item.id);
          else if (lines[0]) setCartQty(lines[0].key, 1);
          else addToCart(item, []);
        } else if (lines[0]) setCartQty(lines[0].key, -1);
      });
    });
    // Favourite toggle
    container.querySelectorAll('.order-card-fav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('active');
        btn.textContent = btn.classList.contains('active') ? '♥' : '♡';
      });
    });
  }

  // --- CUSTOMISE MODAL ---
  function openCustomiseModal(itemId) {
    const item = findItem(itemId);
    if (!item) return;
    pendingItem = item;
    $('#customise-title').textContent = 'Customise: ' + item.name;
    $('#customise-body').innerHTML = `
      <p style="margin-bottom:1rem;opacity:0.8">${item.description}</p>
      
      ${item.sizes && item.sizes.length ? `
        <div style="margin-bottom: 1.25rem;">
          <h5 style="font-family:'Oswald', sans-serif; text-transform:uppercase; font-size:0.82rem; color:#e8a825; margin-bottom:0.5rem; letter-spacing:0.05em;">Select Size</h5>
          ${item.sizes.map((sz, idx) => `
            <div class="option-row" style="margin-bottom:0.4rem; display:flex; align-items:center; gap:0.5rem;">
              <input type="radio" name="item-size" id="size-${idx}" data-label="${sz.label}" data-price="${sz.price}" ${idx === 0 ? 'checked' : ''} style="cursor:pointer;">
              <label for="size-${idx}" style="cursor:pointer;">${sz.label} <span class="price" style="color:#e8a825; font-weight:600; margin-left:0.25rem;">${formatPrice(sz.price)}</span></label>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${item.options && item.options.length ? `
        <div>
          <h5 style="font-family:'Oswald', sans-serif; text-transform:uppercase; font-size:0.82rem; color:#e8a825; margin-bottom:0.5rem; letter-spacing:0.05em;">Select Extras</h5>
          ${item.options.map((opt, i) => `
            <div class="option-row" style="margin-bottom:0.4rem; display:flex; align-items:center; gap:0.5rem;">
              <input type="checkbox" id="opt-${i}" data-label="${opt.label}" data-price="${opt.price}" style="cursor:pointer;">
              <label for="opt-${i}" style="cursor:pointer;">${opt.label} <span class="price" style="color:#e8a825; font-weight:600; margin-left:0.25rem;">+${formatPrice(opt.price)}</span></label>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    $('#customise-modal').classList.add('open');
  }

  function closeCustomiseModal() {
    $('#customise-modal').classList.remove('open');
    pendingItem = null;
  }

  function confirmCustomise() {
    if (!pendingItem) return;
    const opts = [];
    
    let basePrice = pendingItem.price;
    let sizeLabel = '';
    const sizeRadio = document.querySelector('input[name="item-size"]:checked');
    if (sizeRadio) {
      sizeLabel = sizeRadio.dataset.label;
      basePrice = parseFloat(sizeRadio.dataset.price);
    }
    
    $$('#customise-body input[type="checkbox"]:checked').forEach(inp => {
      opts.push({ label: inp.dataset.label, price: parseFloat(inp.dataset.price) });
    });
    
    const itemToAdd = { ...pendingItem };
    if (sizeLabel) {
      itemToAdd.name = `${pendingItem.name} (${sizeLabel})`;
      itemToAdd.price = basePrice;
    }

    const card = $(`.order-card[data-id="${pendingItem.id}"]`);
    const imgEl = card ? card.querySelector('.order-card-img') : null;
    addToCart(itemToAdd, opts, 1, imgEl);
    closeCustomiseModal();
  }

  // --- CART RENDERING ---
  function renderCart() {
    const list = $('#cart-items');
    const footer = $('#cart-footer-content');
    if (!list) return;

    if (!cart.length) {
      list.innerHTML = '<p class="cart-empty">Your cart is empty. Start adding items! 🍳</p>';
      if (footer) footer.classList.add('hidden');
      return;
    }
    if (footer) footer.classList.remove('hidden');

    list.innerHTML = cart.map(line => `
      <div class="cart-line">
        <img src="${line.image}" alt="${line.name} in Russell Hall Café cart">
        <div class="cart-line-info">
          <h4>${line.name}</h4>
          ${line.options.length ? `<div class="customs">${line.options.map(o => o.label).join(', ')}</div>` : ''}
          <div class="cart-line-actions">
            <div class="qty-stepper">
              <button type="button" data-cart-dec="${line.key}">−</button>
              <span>${line.qty}</span>
              <button type="button" data-cart-inc="${line.key}">+</button>
            </div>
            <span class="price">${formatPrice(line.lineTotal)}</span>
            <button type="button" class="cart-remove" data-cart-remove="${line.key}">Remove</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-cart-dec]').forEach(b => b.addEventListener('click', () => setCartQty(b.dataset.cartDec, -1)));
    list.querySelectorAll('[data-cart-inc]').forEach(b => b.addEventListener('click', () => setCartQty(b.dataset.cartInc, 1)));
    list.querySelectorAll('[data-cart-remove]').forEach(b => b.addEventListener('click', () => removeFromCart(b.dataset.cartRemove)));
    $('#cart-subtotal').textContent = formatPrice(getSubtotal());
  }

  function openCart() {
    $('#cart-overlay').classList.add('open');
    $('#cart-sidebar').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderCart();
  }

  function closeCart() {
    $('#cart-overlay').classList.remove('open');
    $('#cart-sidebar').classList.remove('open');
    document.body.style.overflow = '';
  }

  // --- MENU MODE ---
  function setMenuMode(mode) {
    menuMode = mode;
    $$('.menu-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    
    // Smooth scroll to menu section
    const menuSec = document.getElementById('menu-section');
    if (menuSec) {
      const offset = window.innerWidth <= 900 ? 70 : 80;
      const y = menuSec.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  // --- CHECKOUT ---
  function openCheckout() {
    if (!cart.length) { showToast('Your cart is empty!'); return; }
    if (!currentUser) {
      showToast('Please log in or register to place your order.');
      openAuthModal();
      return;
    }
    if (currentUser) {
      const isPhoneVerified = currentUserProfile && currentUserProfile.phoneVerified === true;
      if (!currentUser.emailVerified && !isPhoneVerified) {
        showToast('Please verify your email or phone to checkout.');
        auth.signOut();
        openAuthModal();
        return;
      }
    }
    closeCart();
    const orderType = document.querySelector('input[name="order-type"]:checked');
    if (orderType) $('#order-type-checkout').value = orderType.value;
    goToStep(1);
    updateOrderTypeFields();
    renderCheckout();
    $('#checkout-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckout() {
    $('#checkout-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function goToStep(step) {
    currentCheckoutStep = step;
    $$('.checkout-step').forEach(s => s.classList.remove('active'));
    const stepEl = $(`#checkout-step-${step}`);
    if (stepEl) stepEl.classList.add('active');

    // Update progress dots
    $$('.step-dot').forEach(dot => {
      const s = parseInt(dot.dataset.step);
      dot.classList.remove('active', 'done');
      dot.textContent = s;
      if (s === step) dot.classList.add('active');
      else if (s < step) { dot.classList.add('done'); dot.textContent = '✓'; }
    });
    $$('.step-label').forEach((label, i) => {
      label.classList.toggle('active', i + 1 === step);
    });
    $$('.step-line').forEach((line, i) => {
      line.classList.toggle('done', i + 1 < step);
    });
  }

  function validateStep1() {
    const orderType = $('#order-type-checkout')?.value;
    if (orderType === 'delivery') {
      return false;
    }
    const name = $('#cust-name').value.trim();
    const email = $('#cust-email').value.trim();
    const phone = $('#cust-phone').value.trim();
    const errEl = $('#step1-error');

    if (!name || !email || !phone) {
      errEl.textContent = 'Please fill in all required fields.';
      return false;
    }
    if (!validateEmail(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      return false;
    }
    const phoneResult = validatePhone(phone);
    if (!phoneResult.isValid) {
      errEl.textContent = 'Please enter a valid phone number with country code (e.g. +447123456789 or UK 07123456789).';
      return false;
    }
    // Update input field with formatted phone
    $('#cust-phone').value = phoneResult.formatted;

    errEl.textContent = '';
    return true;
  }

  function updateOrderTypeFields() {
    const orderTypeEl = $('#order-type-checkout');
    if (!orderTypeEl) return;
    const orderType = orderTypeEl.value;
    
    const isDelivery = (orderType === 'delivery');
    
    // Toggle standard details fields and continue button
    $('#standard-checkout-fields')?.classList.toggle('hidden', isDelivery);
    $('#checkout-step-1 .step-nav')?.classList.toggle('hidden', isDelivery);
    
    // Toggle delivery partner buttons block
    $('#delivery-partner-checkout-block')?.classList.toggle('hidden', !isDelivery);
    
    // Toggle table number for dine-in if not delivery
    if (!isDelivery) {
      $('#table-group')?.classList.toggle('hidden', orderType !== 'dine-in');
    }
  }

  function renderCheckout() {
    const list = $('#checkout-items');
    list.innerHTML = cart.map(l => `
      <div class="checkout-item"><span>${l.qty}× ${l.name}</span><span>${formatPrice(l.lineTotal)}</span></div>
    `).join('');
    updateCheckoutTotals();
  }

  function updateCheckoutTotals() {
    const sub = getSubtotal();
    const svc = getServiceCharge();
    const disc = getDiscount();
    const total = getTotal();
    const vat = calculateVAT();
    
    $('#checkout-subtotal').textContent = formatPrice(sub);
    $('#checkout-service').textContent = formatPrice(svc);
    $('#checkout-discount').textContent = disc ? '-' + formatPrice(disc) : formatPrice(0);
    $('#checkout-tip').textContent = formatPrice(tipAmount);
    $('#checkout-total').textContent = formatPrice(total);
    $('#checkout-vat').textContent = formatPrice(vat);
    
    const prepTimeEl = $('#checkout-prep-time');
    if (prepTimeEl) prepTimeEl.textContent = calculatePrepTime() + ' mins';
    
    updatePaymentOptionsText();
    
    const finalEl = $('#checkout-total-final');
    if (finalEl) finalEl.textContent = formatPrice(total);
    $('#pay-amount').textContent = formatPrice(total);
    
    $('#discount-row').classList.toggle('hidden', !disc);
    $('#service-row').classList.toggle('hidden', !svc);
    $('#tip-row').classList.toggle('hidden', tipAmount <= 0);

    // Update Stripe Wallet (Apple/Google Pay) amount
    if (paymentRequest) {
      paymentRequest.update({
        total: {
          label: 'Russell Hall Café Order',
          amount: Math.round(total * 100) || 1000
        }
      });
    }
  }

  function updatePaymentOptionsText() {
    const orderType = $('#order-type-checkout').value;
    const cashCard = document.querySelector('.payment-option-card[data-method="cash"]');
    const cashTitle = cashCard ? cashCard.querySelector('.option-title') : null;
    const cashDesc = cashCard ? cashCard.querySelector('.option-desc') : null;
    const cashSection = document.querySelector('#cash-payment-section');
    const payBtn = $('#pay-button') || $('#pay-btn');
    
    if (orderType === 'takeaway' || orderType === 'collection') {
      if (cashTitle) cashTitle.textContent = 'Pay on Collection';
      if (cashDesc) cashDesc.textContent = 'Pay via Cash/Card in cafe on pickup.';
      if (cashSection) {
        cashSection.innerHTML = `<p style="font-size:0.92rem;opacity:0.85;padding:0.75rem 0;color:var(--cream);line-height:1.5;margin:0;">💳 <strong>Pay on Collection:</strong> Your total of <strong>${formatPrice(getTotal())}</strong> is payable at the café counter when you collect your order. We accept cash, credit/debit cards, Apple Pay, Google Pay, and Contactless on arrival.</p>`;
      }
      if (currentPaymentMethod === 'cash' && payBtn) {
        payBtn.innerHTML = `Confirm Order <span id="pay-amount">${formatPrice(getTotal())}</span>`;
      }
    } else {
      if (cashTitle) cashTitle.textContent = 'Pay Cash';
      if (cashDesc) cashDesc.textContent = 'Pay with cash when your food is ready or delivered.';
      if (cashSection) {
        cashSection.innerHTML = `<p style="font-size:0.92rem;opacity:0.85;padding:0.75rem 0;color:var(--cream);line-height:1.5;margin:0;">💵 <strong>Pay Cash:</strong> Please prepare exact cash of <strong>${formatPrice(getTotal())}</strong> for when your order is delivered or ready.</p>`;
      }
      if (currentPaymentMethod === 'cash' && payBtn) {
        payBtn.innerHTML = `Confirm Order <span id="pay-amount">${formatPrice(getTotal())}</span>`;
      }
    }
  }

  // --- COUPON ---
  async function applyCoupon() {
    const code = $('#coupon-code').value.trim().toUpperCase();
    const msg = $('#coupon-msg');
    if (!code) { msg.textContent = 'Enter a coupon code'; msg.className = 'error-msg'; return; }

    // Try server first, fall back to local
    try {
      const res = await fetch('/api/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: getSubtotal() })
      });
      const data = await res.json();
      if (!data.valid) throw new Error(data.error || 'Invalid coupon');
      appliedCoupon = data;
      msg.textContent = `✓ ${data.label} applied`;
      msg.className = 'coupon-applied';
      updateCheckoutTotals();
      return;
    } catch (_) {}

    // Local fallback
    const coupon = COUPONS_LOCAL[code];
    if (!coupon) {
      msg.textContent = 'Invalid coupon code';
      msg.className = 'error-msg';
      appliedCoupon = null;
      updateCheckoutTotals();
      return;
    }
    if (coupon.min && getSubtotal() < coupon.min) {
      msg.textContent = `Minimum order £${coupon.min} for this coupon`;
      msg.className = 'error-msg';
      return;
    }
    let discount = coupon.type === 'percent'
      ? Math.round(getSubtotal() * (coupon.value / 100) * 100) / 100
      : Math.min(coupon.value, getSubtotal());
    appliedCoupon = { valid: true, code, discount, label: coupon.label };
    msg.textContent = `✓ ${coupon.label} applied`;
    msg.className = 'coupon-applied';
    updateCheckoutTotals();
  }

  // --- STRIPE WALLET & UI FLOWS ---
  let walletInitialized = false;
  async function initStripeWallet() {
    if (typeof window.Stripe === 'undefined') {
      const errEl = document.getElementById('checkout-error');
      if (errEl) {
        errEl.textContent = 'Payment system failed to load. Please refresh the page.';
        errEl.style.display = 'block';
      }
      return;
    }
    
    if (walletInitialized) {
      updateWalletPaymentRequest();
      return;
    }
    
    let publishableKey = 'pk_test_your_publishable_key_here';
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.publishableKey) {
        publishableKey = cfg.publishableKey;
      }
    } catch (err) {
      console.warn('Failed to fetch config, using fallback key:', err);
    }
    
    const stripeObj = window._stripe || window.Stripe(publishableKey);
    window._stripe = stripeObj;
    
    paymentRequest = stripeObj.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: {
        label: 'Russell Hall Café Order',
        amount: Math.round(getTotal() * 100) || 1000
      },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true
    });
    
    const prButton = stripeObj.elements().create('paymentRequestButton', {
      paymentRequest: paymentRequest,
      style: {
        paymentRequestButton: {
          theme: 'dark',
          height: '44px'
        }
      }
    });
    
    paymentRequest.canMakePayment().then(result => {
      if (result) {
        const target = document.getElementById('payment-request-button');
        if (target) {
          target.innerHTML = '';
          prButton.mount('#payment-request-button');
        }
        $('#wallet-payment-section').classList.remove('hidden-wallet');
      } else {
        const target = document.getElementById('payment-request-button');
        if (target) {
          target.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 8px; text-align: center; border: 1px dashed rgba(201, 148, 58, 0.3)">
              <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.75rem">Apple Pay & Google Pay are not available on this browser/device.</p>
              <button class="btn btn-outline" type="button" onclick="showPaymentMethod('card')" style="font-size: 0.8rem">Use Credit/Debit Card instead</button>
            </div>
          `;
        }
      }
    });
    
    paymentRequest.on('paymentmethod', async (ev) => {
      goToStep('processing');
      const statusEl = document.getElementById('payment-status');
      if (statusEl) statusEl.textContent = 'Processing wallet payment...';
      
      const orderData = buildOrderData();
      try {
        const response = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_method_id: ev.paymentMethod.id,
            amount: orderData.totalPence,
            currency: 'gbp',
            description: `Russell Hall Café — Wallet Order for ${orderData.name}`,
            order: orderData,
            couponCode: orderData.couponCode
          })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        
        if (result.requiresAction) {
          if (statusEl) statusEl.textContent = 'Verifying payment...';
          const { error: confirmError } = await stripeObj.confirmCardPayment(result.clientSecret);
          if (confirmError) throw confirmError;
        }
        
        ev.complete('success');
        if (statusEl) statusEl.textContent = 'Payment approved ✓';
        await sleep(800);
        
        // Save to firestore first, then show confirmation screen
        const orderId = '#' + (1000 + Math.floor(Math.random() * 9000));
        lastOrderNum = orderId;
        const docId = orderId.replace('#', '');
        
        const orderDoc = {
          orderId: docId,
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          customerDetails: {
            name: orderData.name,
            email: orderData.email,
            phone: orderData.phone
          },
          items: cart.map(item => ({
            id: item.id,
            name: item.name,
            qty: item.qty,
            price: item.price,
            options: item.options || []
          })),
          subtotal: orderData.subtotal,
          tip: orderData.tip || 0,
          vat: orderData.vat || 0,
          prepTime: orderData.prepTime,
          total: orderData.total,
          orderType: orderData.orderType,
          tableNumber: orderData.tableNumber || '',
          instructions: orderData.instructions || '',
          status: 'received',
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          estimatedTime: orderData.orderType === 'delivery' ? `${orderData.prepTime + 15}–${orderData.prepTime + 25} mins` : `${orderData.prepTime} mins`,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (orderData.orderType === 'delivery') {
          orderDoc.deliveryDetails = {
            address: orderData.deliveryAddress,
            city: orderData.deliveryCity,
            zip: orderData.deliveryZip
          };
        }
        
        await db.collection('orders').doc(docId).set(orderDoc);
        
        const savedItems = [...cart];
        const savedTotal = orderData.total;
        const prepVal = orderData.prepTime;
        
        cart = [];
        appliedCoupon = null;
        serviceChargeEnabled = false;
        tipAmount = 0;
        saveCart();
        updateCartBadge();
        refreshMenuAfterCartChange();
        
        renderConfirmationScreen(orderDoc, savedItems, savedTotal, prepVal, 'wallet');
      } catch (e) {
        ev.complete('fail');
        goToStep(3);
        const errEl = document.getElementById('checkout-error');
        if (errEl) {
          errEl.textContent = e.message || 'Wallet payment failed.';
          errEl.style.display = 'block';
        }
      }
    });
    
    walletInitialized = true;
  }

  function showPaymentMethod(method) {
    currentPaymentMethod = method;
    $$('.payment-option-card').forEach(t => t.classList.toggle('active', t.dataset.method === method));
    if ($('#card-payment-section')) $('#card-payment-section').classList.toggle('hidden', method !== 'card');
    if ($('#wallet-payment-section')) $('#wallet-payment-section').classList.toggle('hidden', method !== 'wallet');
    if ($('#cash-payment-section')) $('#cash-payment-section').classList.toggle('hidden', method !== 'cash');
    updatePaymentOptionsText();
    
    // Toggle main pay button visibility
    const payBtn = $('#pay-button') || $('#pay-btn');
    if (payBtn) {
      payBtn.style.display = method === 'wallet' ? 'none' : 'flex';
    }

    if (method === 'card') {
      setTimeout(() => {
        if (typeof initStripeElements === 'function') initStripeElements();
      }, 100);
    }
    if (method === 'wallet') {
      setTimeout(() => {
        if (typeof initStripeWallet === 'function') initStripeWallet();
      }, 100);
    }
  }

  function updateWalletPaymentRequest() {
    if (!paymentRequest) return;
    paymentRequest.update({
      total: { label: 'Russell Hall Café', amount: Math.round(getTotal() * 100) }
    });
  }

  // --- PAYMENT ---
  async function handlePayment(event) {
    if (event && event.preventDefault) event.preventDefault();
    const payButton = document.getElementById('pay-button');
    const errEl = document.getElementById('checkout-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    // CRITICAL: Require login before placing any order so userId is always set
    if (!currentUser) {
      if (errEl) {
        errEl.textContent = 'Please log in or register before placing an order so your order history is saved.';
        errEl.style.display = 'block';
      }
      openAuthModal();
      return;
    }

    if (currentPaymentMethod === 'cash') {
      if (payButton) {
        payButton.disabled = true;
        payButton.innerHTML = `
          <span style="
            width:16px;height:16px;border-radius:50%;
            border:2px solid rgba(0,0,0,0.3);border-top-color:#0d0d0d;
            display:inline-block;animation:spin 0.8s linear infinite;
            margin-right:0.5rem;vertical-align:middle;
          "></span>
          Processing...`;
      }
      
      goToStep('processing');
      const statusEl = document.getElementById('payment-status');
      if (statusEl) statusEl.textContent = 'Placing cash order...';
      await sleep(1000);
      
      const orderData = buildOrderData();
      await showConfirmation(orderData);
      return;
    }
  }

  function buildOrderData() {
    const isDelivery = $('#order-type-checkout').value === 'delivery';
    return {
      name: sanitizeInput($('#cust-name').value.trim(), 100),
      email: sanitizeInput($('#cust-email').value.trim(), 100),
      phone: sanitizeInput($('#cust-phone').value.trim(), 50),
      orderType: sanitizeInput($('#order-type-checkout').value, 20),
      tableNumber: sanitizeInput($('#table-number').value.trim(), 50),
      instructions: sanitizeInput($('#instructions').value.trim(), 500),
      deliveryAddress: (isDelivery && $('#del-address')) ? sanitizeInput($('#del-address').value.trim(), 200) : '',
      deliveryCity: (isDelivery && $('#del-city')) ? sanitizeInput($('#del-city').value.trim(), 100) : '',
      deliveryZip: (isDelivery && $('#del-zip')) ? sanitizeInput($('#del-zip').value.trim(), 20) : '',
      items: [...cart],
      subtotal: getSubtotal(),
      tip: tipAmount,
      vat: calculateVAT(),
      prepTime: calculatePrepTime(),
      total: getTotal(),
      totalPence: getTotalPence(),
      couponCode: appliedCoupon?.code || ''
    };
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // --- CONFIRMATION SCREEN ---
  function renderConfirmationScreen(orderDoc, savedItems, savedTotal, prepVal, paymentMethod) {
    closeCheckout();
    
    $('#confirm-order-num').textContent = '#' + orderDoc.orderId;
    
    const isOnline = paymentMethod !== 'cash';
    const totalPaidLabel = isOnline ? 'Total paid' : (orderDoc.orderType === 'delivery' ? 'Amount to be paid on delivery' : 'Amount to be paid at counter');

    const titleEl = $('#confirm-overlay h2');
    if (titleEl) {
      titleEl.textContent = paymentMethod === 'cash' ? 'Order Placed' : 'Order Confirmed';
    }

    if (paymentMethod === 'cash') {
      const isDelivery = orderDoc.orderType === 'delivery';
      $('#confirm-time').innerHTML = isDelivery
        ? `Order placed — please pay the driver with cash when your food is delivered. Your order number is <strong>#${orderDoc.orderId}</strong>.`
        : `Order placed — please pay at the counter when your food is ready. Your order number is <strong>#${orderDoc.orderId}</strong>.`;
    } else {
      $('#confirm-time').innerHTML = orderDoc.orderType === 'delivery'
        ? `Estimated delivery: ${prepVal + 15}–${prepVal + 25} minutes. Your order number is <strong>#${orderDoc.orderId}</strong>.`
        : `Estimated ready: ${prepVal} minutes. Your order number is <strong>#${orderDoc.orderId}</strong>.`;
    }

    // Explicit Order Details Section
    let orderTypeDetailsHtml = '';
    if (orderDoc.orderType === 'collection') {
      orderTypeDetailsHtml = `
        <div class="vat-breakdown" style="border-top:1px dashed rgba(201,148,58,0.25); margin-top:0.65rem; padding-top:0.5rem; font-size:0.78rem; color:var(--cream); line-height:1.5;">
          <div style="font-weight:600; color:var(--gold); margin-bottom:0.15rem;">Collection Details</div>
          <div>📍 <strong>Collection Point:</strong> Café Counter</div>
          <div>🏠 <strong>Address:</strong> 173-175 Stourbridge Road, Dudley, DY1 2EQ</div>
          <div style="opacity:0.85; margin-top:0.15rem;">💡 <em>Show order number <strong>#${orderDoc.orderId}</strong> at the counter on arrival.</em></div>
        </div>
      `;
    } else if (orderDoc.orderType === 'delivery') {
      const addr = orderDoc.deliveryDetails ? `${orderDoc.deliveryDetails.address}, ${orderDoc.deliveryDetails.city}, ${orderDoc.deliveryDetails.zip}` : '';
      orderTypeDetailsHtml = `
        <div class="vat-breakdown" style="border-top:1px dashed rgba(201,148,58,0.25); margin-top:0.65rem; padding-top:0.5rem; font-size:0.78rem; color:var(--cream); line-height:1.5;">
          <div style="font-weight:600; color:var(--gold); margin-bottom:0.15rem;">Delivery Details</div>
          <div>📍 <strong>Address:</strong> ${addr || 'Provided Address'}</div>
          <div style="opacity:0.85; margin-top:0.15rem;">💡 <em>The driver will contact you at <strong>${orderDoc.customerDetails?.phone}</strong> if needed.</em></div>
        </div>
      `;
    } else {
      orderTypeDetailsHtml = `
        <div class="vat-breakdown" style="border-top:1px dashed rgba(201,148,58,0.25); margin-top:0.65rem; padding-top:0.5rem; font-size:0.78rem; color:var(--cream); line-height:1.5;">
          <div style="font-weight:600; color:var(--gold); margin-bottom:0.15rem;">Dine-In Details</div>
          <div>📍 <strong>Table:</strong> Table ${orderDoc.tableNumber || 'N/A'}</div>
        </div>
      `;
    }

    $('#confirm-summary').innerHTML = 
      `<div style="font-size:0.85rem;color:var(--cream);margin-bottom:0.75rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.4rem;"><strong>Customer:</strong> ${orderDoc.customerDetails?.name || 'Guest'}</div>` +
      savedItems.map(l =>
        `<div class="checkout-item"><span>${l.qty}× ${l.name}</span><span>${formatPrice(l.lineTotal || (l.price * l.qty))}</span></div>`
      ).join('') + 
      (orderDoc.tip > 0 ? `<div class="checkout-item"><span>Tip</span><span>${formatPrice(orderDoc.tip)}</span></div>` : '') +
      `<div class="checkout-item" style="font-size:0.72rem;opacity:0.6;margin-top:0.25rem;color:var(--cream);"><span>Includes 20% UK VAT</span><span>${formatPrice(orderDoc.vat)}</span></div>` +
      `<div class="checkout-item prep-time-row" style="font-size:0.72rem;opacity:0.7;margin-top:0.25rem;border-top:1px dashed rgba(201, 148, 58, 0.2);padding-top:0.25rem;color:var(--cream);"><span>Estimated Prep Time</span><span>${prepVal} mins</span></div>` +
      orderTypeDetailsHtml +
      `<div class="checkout-item" style="margin-top:0.5rem;font-weight:bold;color:var(--gold);font-size:1.1rem;border-top:1px solid rgba(201, 148, 58, 0.3);padding-top:0.5rem;"><span>${totalPaidLabel}</span><span>${formatPrice(savedTotal)}</span></div>`;

    // WhatsApp Click-to-Chat receipt URL
    const receiptTotalLabel = isOnline ? 'Total paid' : (orderDoc.orderType === 'delivery' ? 'Amount to be paid on delivery' : 'Amount to be paid at counter');
    
    let typeDetailText = '';
    if (orderDoc.orderType === 'collection') {
      typeDetailText = `Type: Collection\nCollection Point: Russell Hall Café counter\nAddress: 173-175 Stourbridge Road, Dudley, DY1 2EQ\n`;
    } else if (orderDoc.orderType === 'delivery') {
      const addr = orderDoc.deliveryDetails ? `${orderDoc.deliveryDetails.address}, ${orderDoc.deliveryDetails.city}, ${orderDoc.deliveryDetails.zip}` : '';
      typeDetailText = `Type: Delivery\nAddress: ${addr}\n`;
    } else {
      typeDetailText = `Type: Dine-In\nTable: ${orderDoc.tableNumber || 'N/A'}\n`;
    }

    const receiptText = `*Russell Hall Café Order Receipt*\n` +
      `Order: #${orderDoc.orderId}\n` +
      `Customer: ${orderDoc.customerDetails?.name || 'Guest'}\n` +
      typeDetailText +
      `Items:\n` +
      savedItems.map(l => `- ${l.qty}x ${l.name} (${formatPrice(l.lineTotal || (l.price * l.qty))})`).join('\n') +
      (orderDoc.tip > 0 ? `\nTip: ${formatPrice(orderDoc.tip)}` : '') +
      `\n(Includes 20% UK VAT: ${formatPrice(orderDoc.vat)})` +
      `\n*${receiptTotalLabel}: ${formatPrice(savedTotal)}*\n\n` +
      (paymentMethod === 'cash' ? `Please pay at counter/delivery.` : `Payment completed online.`);

    const waBtn = $('#confirm-wa-btn');
    if (waBtn) {
      const rawPhone = orderDoc.customerDetails?.phone || '';
      waBtn.href = `https://wa.me/${rawPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(receiptText)}`;
      waBtn.style.display = 'inline-flex';
    }

    const overlay = $('#confirm-overlay');
    overlay.classList.add('open');

    // Restart checkmark animation
    const path = overlay.querySelector('.checkmark-path');
    if (path) {
      path.style.animation = 'none';
      path.style.strokeDashoffset = '48';
      void path.offsetWidth;
      path.style.animation = '';
    }
  }

  // --- CONFIRMATION ---
  async function showConfirmation(orderData) {
    const savedItems = [...cart];
    const savedTotal = getTotal();
    const prepVal = orderData.prepTime || calculatePrepTime();
    
    lastOrderNum = '#' + (1000 + Math.floor(Math.random() * 9000));
    const orderId = lastOrderNum.replace('#', '');

    const orderDoc = {
      orderId: orderId,
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      customerDetails: {
        name: orderData.name,
        email: orderData.email,
        phone: orderData.phone
      },
      items: savedItems.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price, // unit price
        options: item.options || []
      })),
      subtotal: orderData.subtotal,
      tip: orderData.tip || 0,
      vat: orderData.vat || 0,
      prepTime: prepVal,
      total: savedTotal,
      orderType: orderData.orderType,
      tableNumber: orderData.tableNumber || '',
      instructions: orderData.instructions || '',
      status: 'received',
      paymentMethod: 'cash',
      paymentStatus: 'cash-pending',
      estimatedTime: orderData.orderType === 'delivery' ? `${prepVal + 15}–${prepVal + 25} mins` : `${prepVal} mins`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (orderData.orderType === 'delivery') {
      orderDoc.deliveryDetails = {
        address: orderData.deliveryAddress,
        city: orderData.deliveryCity,
        zip: orderData.deliveryZip
      };
    }

    try {
      console.log('[Firebase] Saving cash order:', orderId, 'userId:', currentUser.uid);
      await db.collection('orders').doc(orderId).set(orderDoc);
      console.log('[Firebase] ✓ Cash order saved to Firestore successfully! Doc ID:', orderId);
      
      closeCheckout();
      cart = [];
      appliedCoupon = null;
      serviceChargeEnabled = false;
      tipAmount = 0; // Reset tip for next checkout
      saveCart();
      updateCartBadge();
      renderOrderGrid();
      
      renderConfirmationScreen(orderDoc, savedItems, savedTotal, prepVal, 'cash');
      showToast('Order saved to your account ✓');
      
      // Decrement daily specials if order contains today's special
      try {
        const today = new Date().toISOString().split('T')[0];
        const specialItem = orderDoc.items.find(i => i.id && i.id.startsWith('special-'));
        if (specialItem) {
          db.collection('dailySpecials').doc(today).update({
            remainingQuantity: firebase.firestore.FieldValue.increment(-specialItem.qty)
          }).catch(err => console.error("Error decrementing special qty:", err));
        }
      } catch (e) {
        console.error(e);
      }
      
      // Start confetti
      startConfetti();
      // Reset tracking
      currentTrackingStage = 0;
      
    } catch (err) {
      console.error('[Firebase] ❌ Error saving cash order:', err);
      // Go back to checkout and show error
      goToStep(3);
      const errEl = document.getElementById('checkout-error') || document.getElementById('stripe-error');
      if (errEl) {
        errEl.textContent = `Error placing order: ${err.message || 'Database write failed'}. Please try again.`;
        errEl.style.display = 'block';
      }
      const payButton = document.getElementById('pay-button');
      if (payButton) {
        payButton.disabled = false;
        payButton.textContent = 'Confirm Order';
      }
    }
  }

  // --- CONFETTI ---
  let confettiCtx = null, confettiParticles = [], confettiRunning = false;
  function startConfetti() {
    const canvas = $('#confetti-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    confettiCtx = canvas.getContext('2d');
    confettiParticles = [];
    const colors = ['#e8a825', '#e84393', '#f07021', '#27ae60', '#f5ead6', '#6eb5ff'];
    for (let i = 0; i < 150; i++) {
      confettiParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.1
      });
    }
    confettiRunning = true;
    animateConfetti();
  }

  function animateConfetti() {
    if (!confettiRunning || !confettiCtx) return;
    const canvas = confettiCtx.canvas;
    confettiCtx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    confettiParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vy += 0.05; // gravity
      if (p.y < canvas.height + 50) alive = true;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });
    if (alive) requestAnimationFrame(animateConfetti);
    else confettiRunning = false;
  }

  // --- ORDER TRACKING ---
  let trackingTimer = null;
  function startTrackingCountdown(orderTime, durationMin, status, orderType) {
    if (trackingTimer) clearInterval(trackingTimer);
    
    const trackingEstVal = $('#tracking-est-time-val');
    const trackingEstLabel = $('#tracking-est-label');
    if (!trackingEstVal) return;

    if (status === 'ready') {
      trackingEstVal.textContent = 'Ready!';
      if (trackingEstLabel) {
        trackingEstLabel.textContent = orderType === 'delivery' ? 'On its way' : 'Order Ready';
      }
      return;
    }
    if (status === 'complete' || status === 'delivered') {
      trackingEstVal.textContent = 'Enjoy!';
      if (trackingEstLabel) trackingEstLabel.textContent = 'Completed';
      return;
    }

    const targetTime = orderTime + durationMin * 60 * 1000;

    function updateTimer() {
      const now = Date.now();
      const diff = targetTime - now;
      if (diff <= 0) {
        trackingEstVal.textContent = 'Ready shortly...';
        clearInterval(trackingTimer);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        trackingEstVal.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      }
    }
    
    updateTimer();
    trackingTimer = setInterval(updateTimer, 1000);
  }

  function openTracking() {
    const overlay = $('#tracking-overlay');
    if (!overlay) return;
    const orderId = (lastOrderNum || '#0000').replace('#', '');
    const trackingNumEl = $('#tracking-order-num');
    if (trackingNumEl) trackingNumEl.textContent = lastOrderNum || '#0000';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    if (activeOrderListener) activeOrderListener();

    // Reset UI before snapshot
    $$('.tracking-step').forEach(step => step.classList.remove('active', 'done'));
    const trackingEstContainer = $('#tracking-est-container');
    if (trackingEstContainer) trackingEstContainer.style.display = 'none';

    // Setup Cooking Instructions Save Handler
    const saveBtn = $('#tracking-instruction-save-btn');
    const inputEl = $('#tracking-instruction-input');
    if (saveBtn && inputEl) {
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      
      newSaveBtn.addEventListener('click', () => {
        const newInst = inputEl.value.trim();
        newSaveBtn.disabled = true;
        newSaveBtn.textContent = 'Saving...';
        
        db.collection('orders').doc(orderId).update({
          instructions: newInst
        }).then(() => {
          newSaveBtn.disabled = false;
          newSaveBtn.textContent = 'Save';
        }).catch(err => {
          console.error("Error updating instructions:", err);
          newSaveBtn.disabled = false;
          newSaveBtn.textContent = 'Save';
          alert("Failed to update instructions. Please try again.");
        });
      });
    }

    activeOrderListener = db.collection('orders').doc(orderId).onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        const status = data.status || 'received';
        const estTime = data.estimatedTime || '';
        
        const trackTitle = $('#confirm-time');
        if (trackTitle && estTime) {
          trackTitle.textContent = `Estimated ready: ${estTime}`;
        }
        
        // Cooking instructions display update
        const displayEl = $('#tracking-instruction-display');
        const trackingInput = $('#tracking-instruction-input');
        if (displayEl) {
          displayEl.textContent = data.instructions ? `"${data.instructions}"` : 'None added.';
        }
        if (trackingInput && !trackingInput.matches(':focus')) {
          trackingInput.value = data.instructions || '';
        }
        
        const durationMatch = estTime.match(/\d+/);
        let durationMin = durationMatch ? parseInt(durationMatch[0]) : 0;
        const rangeMatch = estTime.match(/–\s*(\d+)/);
        if (rangeMatch) {
          durationMin = parseInt(rangeMatch[1]);
        }

        if (!window.activeOrderStartTimes) window.activeOrderStartTimes = {};
        if (!window.activeOrderStartTimes[orderId]) {
          window.activeOrderStartTimes[orderId] = (data.createdAt && typeof data.createdAt.toDate === 'function') 
            ? data.createdAt.toDate().getTime() 
            : Date.now();
        }
        const orderTime = window.activeOrderStartTimes[orderId];

        const trackingEstContainer = $('#tracking-est-container');
        const trackingEstLabel = $('#tracking-est-label');
        if (trackingEstContainer && estTime) {
          trackingEstContainer.style.display = 'flex';
          if (trackingEstLabel) {
            trackingEstLabel.textContent = data.orderType === 'delivery' ? 'Estimated Delivery' : 'Estimated Ready';
          }
          startTrackingCountdown(orderTime, durationMin, status, data.orderType);
        } else if (trackingEstContainer) {
          trackingEstContainer.style.display = 'none';
        }
        
        const stages = { 'received': 0, 'preparing': 1, 'cooking': 2, 'ready': 3, 'complete': 4, 'delivered': 4 };
        currentTrackingStage = stages[status] !== undefined ? stages[status] : 0;
        
        $$('.tracking-step').forEach(step => {
          const stage = parseInt(step.dataset.stage);
          step.classList.remove('active', 'done');
          if (stage < currentTrackingStage) step.classList.add('done');
          else if (stage === currentTrackingStage) step.classList.add('active');
        });
      }
    }, err => {
      console.error("Tracking listener error:", err);
    });
  }

  function closeTracking() {
    $('#tracking-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
    if (activeOrderListener) {
      activeOrderListener();
      activeOrderListener = null;
    }
    if (trackingTimer) {
      clearInterval(trackingTimer);
      trackingTimer = null;
    }
  }

  function updateTrackingUI() {
    $$('.tracking-step').forEach(step => {
      const stage = parseInt(step.dataset.stage);
      step.classList.remove('active');
      if (stage < currentTrackingStage) step.classList.add('done');
      else if (stage === currentTrackingStage) step.classList.add('active');
      else step.classList.remove('done');
    });
  }

  // --- PARTICLE SYSTEM ---
  let particleCtx = null, particles = [], particleAnimId = null;
  function initParticles() {
    const canvas = $('#particles-canvas');
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.parentElement.offsetWidth;
      canvas.height = canvas.parentElement.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    particleCtx = canvas.getContext('2d');

    const count = Math.min(80, Math.floor(canvas.width * canvas.height / 12000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.4 + 0.1),
        alpha: Math.random() * 0.5 + 0.2,
        color: Math.random() > 0.5 ? '#e8a825' : (Math.random() > 0.5 ? '#f07021' : '#c9943a'),
        pulse: Math.random() * Math.PI * 2
      });
    }
    animateParticles();
  }

  function animateParticles() {
    if (!particleCtx) return;
    const canvas = particleCtx.canvas;
    particleCtx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.015;
      const alpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));

      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;

      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      particleCtx.fillStyle = p.color;
      particleCtx.globalAlpha = alpha;
      particleCtx.fill();

      // Glow
      if (p.r > 1.5) {
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        particleCtx.fillStyle = p.color;
        particleCtx.globalAlpha = alpha * 0.15;
        particleCtx.fill();
      }
    });
    particleCtx.globalAlpha = 1;
    particleAnimId = requestAnimationFrame(animateParticles);
  }

  // --- FLOATING LOGO MOUSE INTERACTION ---
  function initFloatingLogo() {
    const logo = $('#floating-logo');
    if (!logo) return;
    document.addEventListener('mousemove', (e) => {
      const rect = logo.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * 0.02;
      const dy = (e.clientY - cy) * 0.02;
      logo.style.transform = `translateY(${-8 + dy}px) translateX(${dx}px)`;
    });
  }

  // --- GSAP ANIMATIONS ---
  function initGSAP() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    // Reveal on scroll
    gsap.utils.toArray('.reveal').forEach(el => {
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });

    gsap.utils.toArray('.reveal-left').forEach(el => {
      gsap.fromTo(el, { opacity: 0, x: -50 }, {
        opacity: 1, x: 0, duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    gsap.utils.toArray('.reveal-right').forEach(el => {
      gsap.fromTo(el, { opacity: 0, x: 50 }, {
        opacity: 1, x: 0, duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    // Navbar background
    ScrollTrigger.create({
      start: 50,
      onUpdate: (self) => {
        $('#navbar').classList.toggle('scrolled', self.scroll() > 50);
      }
    });

    // Feature cards stagger
    gsap.utils.toArray('.feature-card').forEach((card, i) => {
      gsap.fromTo(card, { opacity: 0, y: 50 }, {
        opacity: 1, y: 0, duration: 0.7,
        delay: i * 0.15,
        ease: 'power3.out',
        scrollTrigger: { trigger: card, start: 'top 85%' }
      });
    });

    // Amenity items stagger
    gsap.utils.toArray('.amenity').forEach((item, i) => {
      gsap.fromTo(item, { opacity: 0, scale: 0.8 }, {
        opacity: 1, scale: 1, duration: 0.5,
        delay: i * 0.1,
        ease: 'back.out(1.5)',
        scrollTrigger: { trigger: item, start: 'top 90%' }
      });
    });
  }

  // --- SCROLL REVEAL (IntersectionObserver fallback and dynamic elements) ---
  function observeReveal() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { 
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          if (window.ScrollTrigger) {
            window.ScrollTrigger.refresh();
          }
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.visible), .reveal-left:not(.visible), .reveal-right:not(.visible)').forEach(el => obs.observe(el));
  }

  // --- MOBILE BOTTOM NAV ---
  function initMobileNav() {
    // Update active state on scroll
    const sections = ['hero', 'menu-section', 'about', 'hours', 'contact'];
    const navMap = { 'hero': 'home', 'menu-section': 'menu' };

    window.addEventListener('scroll', () => {
      let current = 'home';
      sections.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 200) {
          current = navMap[id] || id;
        }
      });
      $$('.mob-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.nav === current);
      });
    });

    // Cart button
    $('#mob-cart-btn')?.addEventListener('click', openCart);
    // Track button
    $('#mob-track-btn')?.addEventListener('click', () => {
      openUserDashboard('orders');
    });
  }

  // --- INITIALIZATION ---
  function initNav() {
    const nav = $('#navbar');
    if (nav && !window.gsap) {
      window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50));
    }

    $('#hamburger')?.addEventListener('click', () => $('#nav-links')?.classList.toggle('mobile-open'));
    $$('.nav-links a').forEach(a => a.addEventListener('click', () => $('#nav-links')?.classList.remove('mobile-open')));

    $$('[data-scroll]').forEach(el => {
      el.addEventListener('click', e => {
        const id = el.getAttribute('href');
        if (id?.startsWith('#')) {
          e.preventDefault();
          const target = document.querySelector(id);
          if (target) {
            const offset = window.innerWidth <= 900 ? 70 : 80;
            const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
          $('#nav-links')?.classList.remove('mobile-open');
        }
      });
    });

    $$('[data-order]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        setMenuMode('order');
        const menu = $('#menu-section');
        if (menu) {
          const offset = window.innerWidth <= 900 ? 70 : 80;
          const y = menu.getBoundingClientRect().top + window.pageYOffset - offset;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      });
    });
  }

  function initMenuTabs() {
    $$('.menu-tab').forEach(tab => {
      tab.addEventListener('click', () => setMenuMode(tab.dataset.mode));
    });
  }

  function initCart() {
    $$('.cart-btn').forEach(b => b.addEventListener('click', openCart));
    $('#cart-overlay')?.addEventListener('click', closeCart);
    $('.cart-close')?.addEventListener('click', closeCart);
    $('#checkout-btn')?.addEventListener('click', openCheckout);
  }

  function initCheckout() {
    $('#checkout-close')?.addEventListener('click', closeCheckout);

    $('#checkout-switch-collect-btn')?.addEventListener('click', () => {
      const select = document.getElementById('order-type-checkout');
      if (select) {
        select.value = 'collection';
        lastSelectedOrderType = 'collection';
        updateOrderTypeFields();
        const radio = document.querySelector('input[name="order-type"][value="collection"]');
        if (radio) radio.checked = true;
      }
    });

    // Step navigation
    $('#step1-next')?.addEventListener('click', () => {
      if (validateStep1()) { renderCheckout(); goToStep(2); }
    });
    $('#step2-back')?.addEventListener('click', () => goToStep(1));
    $('#step2-next')?.addEventListener('click', () => {
      showPaymentMethod('card');
      updateCheckoutTotals();
      goToStep(3);
    });
    $('#step3-back')?.addEventListener('click', () => goToStep(2));
    const payBtn = $('#pay-button') || $('#pay-btn');
    if (payBtn) {
      payBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const errEl = document.getElementById('stripe-error') || document.getElementById('checkout-error');
        if (!currentUser) {
          if (errEl) {
            errEl.textContent = 'Please log in or register before placing an order so your order history is saved.';
            errEl.style.display = 'block';
          }
          openAuthModal();
          return;
        }

        if (currentPaymentMethod === 'cash') {
          handlePayment(e);
        } else if (currentPaymentMethod === 'card') {
          handleStripePayment();
        }
      });
    }

    // Coupon
    $('#apply-coupon')?.addEventListener('click', applyCoupon);

    // Service charge
    $('#service-charge-toggle')?.addEventListener('change', e => {
      serviceChargeEnabled = e.target.checked;
      updateCheckoutTotals();
    });

    // Tip options buttons
    $$('.tip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tipPct = parseInt(btn.dataset.tip);
        if (isNaN(tipPct)) {
          // Custom tip selected
          $('#custom-tip-input')?.classList.remove('hidden');
          const customVal = parseFloat($('#custom-tip-input')?.value) || 0;
          tipAmount = Math.max(0, customVal);
        } else {
          $('#custom-tip-input')?.classList.add('hidden');
          if (tipPct > 0) {
            tipAmount = Math.round(getSubtotal() * (tipPct / 100) * 100) / 100;
          } else {
            tipAmount = 0;
          }
        }
        updateCheckoutTotals();
      });
    });

    // Custom tip input listener
    $('#custom-tip-input')?.addEventListener('input', e => {
      const val = parseFloat(e.target.value) || 0;
      tipAmount = Math.max(0, val);
      updateCheckoutTotals();
    });

    // Order type selection & delivery partner modal interception
    let lastSelectedOrderType = 'dine-in';
    
    // Listen to radio changes in the cart drawer
    document.querySelectorAll('input[name="order-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          lastSelectedOrderType = e.target.value;
          const checkoutSelect = document.getElementById('order-type-checkout');
          if (checkoutSelect) {
            checkoutSelect.value = e.target.value;
            updateOrderTypeFields();
          }
        }
      });
    });

    // Update last selected order type from current radio status on init
    const initialCheckedRadio = document.querySelector('input[name="order-type"]:checked');
    if (initialCheckedRadio) {
      lastSelectedOrderType = initialCheckedRadio.value;
    }

    // Modal close/cancel buttons
    $('#delivery-partner-cancel')?.addEventListener('click', closeDeliveryPartnerModal);
    $('#delivery-partner-modal')?.addEventListener('click', e => {
      if (e.target.id === 'delivery-partner-modal') closeDeliveryPartnerModal();
    });

    function openDeliveryPartnerModal(source) {
      const modal = document.getElementById('delivery-partner-modal');
      if (!modal) return;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      modal.dataset.source = source;
    }

    function closeDeliveryPartnerModal() {
      const modal = document.getElementById('delivery-partner-modal');
      if (!modal) return;
      modal.classList.remove('open');
      document.body.style.overflow = '';
      
      const source = modal.dataset.source;
      if (source === 'cart') {
        const radio = document.querySelector(`input[name="order-type"][value="${lastSelectedOrderType}"]`);
        if (radio) radio.checked = true;
      } else if (source === 'checkout') {
        const select = document.getElementById('order-type-checkout');
        if (select) {
          select.value = lastSelectedOrderType;
          updateOrderTypeFields();
        }
      }
    }

    // Expose functions globally for dynamic/onclick elements
    window.openDeliveryPartnerModal = openDeliveryPartnerModal;
    window.closeDeliveryPartnerModal = closeDeliveryPartnerModal;

    $('#order-type-checkout')?.addEventListener('change', (e) => {
      lastSelectedOrderType = e.target.value;
      updateOrderTypeFields();
      const radio = document.querySelector(`input[name="order-type"][value="${e.target.value}"]`);
      if (radio) radio.checked = true;
    });

    // Payment method options
    $$('.payment-option-card').forEach(t => {
      t.addEventListener('click', () => showPaymentMethod(t.dataset.method));
    });

    // Guest Order Lookup
    $('#guest-lookup-form')?.addEventListener('submit', handleGuestLookupSubmit);
    $('#lookup-login-btn')?.addEventListener('click', () => {
      closeUserDashboard();
      openAuthModal();
    });
    $('#nav-track-order-btn')?.addEventListener('click', e => {
      e.preventDefault();
      openUserDashboard('orders');
    });


    // Confirmation buttons
    $('#confirm-back')?.addEventListener('click', () => {
      $('#confirm-overlay').classList.remove('open');
      confettiRunning = false;
      setMenuMode('order');
    });
    $('#track-btn')?.addEventListener('click', () => {
      $('#confirm-overlay').classList.remove('open');
      confettiRunning = false;
      openTracking();
    });

    // Tracking close
    $('#tracking-close')?.addEventListener('click', closeTracking);

    // Customise modal
    $('#customise-cancel')?.addEventListener('click', closeCustomiseModal);
    $('#customise-confirm')?.addEventListener('click', confirmCustomise);
    $('#customise-modal')?.addEventListener('click', e => {
      if (e.target.id === 'customise-modal') closeCustomiseModal();
    });
  }

  function initNewsletter() {
    $('#newsletter-form')?.addEventListener('submit', e => {
      e.preventDefault();
      showToast('Thanks for subscribing! 🎉');
      e.target.reset();
    });
  }

  // --- BUTTON RIPPLE EFFECT ---
  function initRipple() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--ripple-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
      btn.style.setProperty('--ripple-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
  }

  // --- HASH NAVIGATION ---
  function handleHash() {
    const hash = window.location.hash;
    if (hash === '#menu-section' || hash === '#order') {
      setMenuMode('order');
      setTimeout(() => {
        const menu = $('#menu-section');
        if (menu) menu.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  // --- DYNAMIC FIRESTORE MENU LOADER & SEEDER ---
  const categoryEmojis = {
    deals: '🏷️',
    breakfast: '🍳',
    muffins: '🥐',
    toasties: '🥪',
    sandwiches: '🥙',
    cheesy: '🧀',
    burgers: '🍔',
    sides: '🥗',
    cocktails: '🍸',
    beers: '🍺',
    hotdrinks: '☕',
    softdrinks: '🥤'
  };

  function setMenuItems(items) {
    dbMenuItems = items;
    reconstructMenuData();
  }

  function initMenuDatabase() {
    // Render hardcoded menu immediately as placeholder while db loads
    if (window.hardcodedMenuItems) {
      renderCategoryChips(window.hardcodedMenuItems);
      renderMenuByCategory(window.hardcodedMenuItems, 'All');
    }

    if (typeof db === 'undefined' || !db) {
      console.warn("[Firebase] Firestore DB not initialized. Falling back to local menu-data.js.");
      fallbackToLocalMenu();
      return;
    }


    console.log("[Firebase] Checking menu database state...");
    
    // First, check if categories collection is empty
    db.collection('categories').get().then(snapshot => {
      if (snapshot.empty) {
        console.log("[Firebase] Seeding menu collections from menu-data.js...");
        const batch = db.batch();
        let sortOrder = 0;
        
        for (const [catKey, cat] of Object.entries(menuData)) {
          const catRef = db.collection('categories').doc(catKey);
          batch.set(catRef, {
            id: catKey,
            title: cat.title,
            icon: cat.icon || '',
            subtitle: cat.subtitle || '',
            sortOrder: sortOrder++
          });
          
          cat.items.forEach(item => {
            const itemRef = db.collection('menuItems').doc(item.id);
            batch.set(itemRef, {
              id: item.id,
              name: item.name,
              description: item.description || '',
              price: item.price,
              originalPrice: item.originalPrice || null,
              image: item.image || '',
              category: catKey,
              veg: !!item.veg,
              outOfStock: false,
              status: 'Active',
              emoji: categoryEmojis[catKey] || '🍔',
              sizes: item.sizes || [],
              options: item.options || []
            });
          });
        }
        
        return batch.commit().then(() => {
          console.log("[Firebase] ✓ Menu collections seeded successfully.");
          setupMenuListeners();
        });
      } else {
        // Run migration to make sure status, emoji, and originalPrice properties exist for all documents
        db.collection('menuItems').get().then(menuItemsSnapshot => {
          const batch = db.batch();
          let needsMigration = false;
          
          menuItemsSnapshot.forEach(doc => {
            const data = doc.data();
            const catKey = data.category || 'burgers';
            
            // Find local item in menuData to check originalPrice
            let localItem = null;
            for (const cat of Object.values(menuData)) {
              const found = cat.items.find(i => i.id === doc.id);
              if (found) {
                localItem = found;
                break;
              }
            }
            
            const updates = {};
            let docNeedsUpdate = false;
            
            if (!data.status) {
              updates.status = 'Active';
              docNeedsUpdate = true;
            }
            if (!data.emoji) {
              updates.emoji = categoryEmojis[catKey] || '🍔';
              docNeedsUpdate = true;
            }
            if (localItem && localItem.originalPrice && data.originalPrice !== localItem.originalPrice) {
              updates.originalPrice = localItem.originalPrice;
              docNeedsUpdate = true;
            }
            
            if (docNeedsUpdate) {
              needsMigration = true;
              batch.update(doc.ref, updates);
            }
          });
          
          if (needsMigration) {
            batch.commit().then(() => {
              console.log("[Firebase] ✓ Menu items status/emoji/originalPrice attributes migrated.");
              setupMenuListeners();
            }).catch(err => {
              console.error("[Firebase] ✗ Migration failed:", err);
              setupMenuListeners();
            });
          } else {
            setupMenuListeners();
          }
        }).catch(err => {
          console.error("[Firebase] ✗ Error reading menuItems for migration:", err);
          setupMenuListeners();
        });
      }
    }).catch(err => {
      console.error("[Firebase] ✗ Error checking/seeding menu collections:", err);
      fallbackToLocalMenu();
    });
  }

  function fallbackToLocalMenu() {
    console.log("[Menu] Loading local fallback menu from menu-data.js...");
    if (window.hardcodedMenuItems) {
      renderCategoryChips(window.hardcodedMenuItems);
      renderMenuByCategory(window.hardcodedMenuItems, currentCategory || 'All');
    }
    if (!urlParamsHandled) {
      urlParamsHandled = true;
      handleUrlParams();
    }
  }

  function setupMenuListeners() {
    if (typeof db === 'undefined' || !db) {
      fallbackToLocalMenu();
      return;
    }
    // Listen to categories
    db.collection('categories').orderBy('sortOrder').onSnapshot(catSnapshot => {
      dbCategories = [];
      catSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.id !== 'beers' && data.id !== 'cocktails') {
          dbCategories.push(data);
        }
      });
      reconstructMenuData();
    }, err => {
      console.error("[Firebase] Categories listener error:", err);
      fallbackToLocalMenu();
    });

    db.collection('menuItems')
      .onSnapshot(snapshot => {
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        items = items.filter(item => {
          const cat = (item.category || '').toLowerCase();
          if (cat === 'beers' || cat === 'cocktails') return false;
          if (item.id === 'd5' || item.id === 'd7') return false;
          if (item.id === 'd3') {
            item.description = "Any Gourmet Burger + Side of Fries + Soft Drink (Save up to £2.00)";
          }
          return true;
        });
        window._allMenuItems = items;
        dbMenuItems = items;
        reconstructMenuData();
        renderCategoryChips(items);
        renderMenuByCategory(items, currentCategory || 'All');
      }, error => {
        console.error('Menu error:', error);
        // If Firestore fails, try using hardcoded menu data
        if (window.hardcodedMenuItems) {
          window._allMenuItems = window.hardcodedMenuItems;
          renderCategoryChips(window.hardcodedMenuItems);
          renderMenuByCategory(window.hardcodedMenuItems, 'All');
        }
      });
  }

  function reconstructMenuData() {
    if (dbCategories.length === 0 || dbMenuItems.length === 0) return;
    
    const newMenuData = {};
    dbCategories.forEach(cat => {
      newMenuData[cat.id] = {
        title: cat.title,
        icon: cat.icon,
        subtitle: cat.subtitle,
        items: dbMenuItems.filter(item => item.category === cat.id)
      };
    });
    
    // Overwrite the global menuData reference dynamically
    menuData = newMenuData;
    
    // Re-render menu components dynamically
    renderBrowseMenu();
    renderOrderGrid();
    
    renderCategoryChips(dbMenuItems);
    renderMenuByCategory(dbMenuItems, currentCategory || 'All');
    
    // Perform URL deep-linking highlight once data loads
    if (!urlParamsHandled) {
      urlParamsHandled = true;
      handleUrlParams();
    }
  }

  // --- SEO QUERY PARAMETER NAVIGATION ---
  function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('item');
    if (!itemId) return;
    
    const item = findItem(itemId);
    if (!item) return;
    
    let foundCatKey = 'all';
    for (const [catKey, cat] of Object.entries(menuData)) {
      if (cat.items.some(i => i.id === itemId)) {
        foundCatKey = catKey;
        break;
      }
    }
    
    activeCategory = foundCatKey;
    setMenuMode('order');
    
    setTimeout(() => {
      const card = document.querySelector(`.order-card[data-id="${itemId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-pulse');
        setTimeout(() => {
          card.classList.remove('highlight-pulse');
        }, 3000);
      }
    }, 400);
  }

  // --- MAIN INIT ---
  document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    // Do not render browse menu / order grid synchronously on load,
    // let reconstructMenuData handle it once database connects
    updateCartBadge();
    renderCart();
    initNav();
    initMenuTabs();
    initCart();
    initCheckout();
    initAuthAndBookings();
    initNewsletter();
    initRipple();
    initMobileNav();
    initParticles();
    initFloatingLogo();
    initLazyLoading();
    initMenuSearch();
    initLightbox();
    observeReveal();
    setMenuMode('browse');
    handleHash();
    initMenuDatabase();

    // Init GSAP after a small delay to let DOM settle
    requestAnimationFrame(() => {
      initGSAP();
    });

    // Check QR scan parameters
    checkQRCodeEntry();
  });

  // Handle hash changes
  window.addEventListener('hashchange', handleHash);
  // --- AUTH & BOOKINGS INITIALIZATION ---
  let currentUser = null;
  let currentUserProfile = null;
  let currentUserRole = null;
  let activeOrderListener = null;
  let menuFetchStarted = false;

  function showLoginPage() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('no_modal')) return;
    // Prompt login modal on page land if not authenticated
    setTimeout(() => {
      openAuthModal();
    }, 800);
  }

  function showAdminPortal() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.location.href = '../admin/index.html';
    } else {
      window.location.href = 'https://russell-hall-cafe-admin.pages.dev';
    }
  }

  function showCustomerPortal() {
    if (currentUser) {
      updateAuthUI(currentUser, currentUserProfile);
    }
  }

  function requireAuth(callback) {
    if (currentUser) {
      callback(currentUser);
      return;
    }
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      if (user) {
        callback(user);
      } else {
        showLoginPage();
      }
    });
  }

  async function handleLogout() {
    if (window._ordersListener) {
      window._ordersListener();
      window._ordersListener = null;
    }
    await auth.signOut();
  }

  function fetchUserOrders(uid) {
    const authEmail = (currentUser && currentUser.email) ? currentUser.email.toLowerCase().trim() : '';
    const profileEmail = (currentUserProfile && currentUserProfile.email) ? currentUserProfile.email.toLowerCase().trim() : '';

    const emailsToQuery = new Set();
    if (authEmail) emailsToQuery.add(authEmail);
    if (profileEmail) emailsToQuery.add(profileEmail);
    
    // Cross-account fallback: if they use one of the shyamgjk accounts, search both to link legacy orders
    if (authEmail.includes('shyamgjk') || profileEmail.includes('shyamgjk')) {
      emailsToQuery.add('shyamgjk@gmail.com');
      emailsToQuery.add('shyamgjk3@gmail.com');
    }

    // Show loading state immediately
    const ordersList = $('#orders-history-list');
    if (ordersList) ordersList.innerHTML = '<p class="empty-msg">Loading your orders...</p>';

    // Run all lookups in parallel: by userId, by auth email, by profile email
    function mergeAndRender(docs) {
      const seen = new Set();
      const orders = [];
      docs.forEach(doc => {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          orders.push({ id: doc.id, ...doc.data() });
        }
      });
      orders.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });
      // Auto-patch orders that are missing userId or have a different userId so future queries work
      orders.forEach(o => {
        if (o.userId !== uid && o.id) {
          db.collection('orders').doc(o.id).update({ userId: uid }).catch(() => {});
        }
      });
      if (orders.length === 0) {
        if (ordersList) ordersList.innerHTML = '<p class="empty-msg">No previous orders found. Orders placed while logged in will appear here.</p>';
      } else {
        renderOrdersList(orders);
      }
    }

    // Primary real-time listener: by userId
    const unsubscribe = db.collection('orders')
      .where('userId', '==', uid)
      .onSnapshot(async snapshot => {
        const primaryDocs = snapshot.docs;

        // Also fetch by email in parallel (these are one-time gets, not listeners)
        const emailQueries = [];
        emailsToQuery.forEach(email => {
          emailQueries.push(
            db.collection('orders').where('customerDetails.email', '==', email).get()
          );
          emailQueries.push(
            db.collection('orders').where('userEmail', '==', email).get()
          );
        });

        const emailSnapshots = await Promise.allSettled(emailQueries);
        const allDocs = [...primaryDocs];
        emailSnapshots.forEach(result => {
          if (result.status === 'fulfilled') {
            result.value.docs.forEach(doc => allDocs.push(doc));
          }
        });

        mergeAndRender(allDocs);
      }, error => {
        console.error('[Firebase] Orders fetch error:', error.code, error.message);
        // On permission error, try email-only fallback
        if (error.code === 'permission-denied' || error.code === 'failed-precondition') {
          const fallbacks = [];
          emailsToQuery.forEach(email => {
            fallbacks.push(db.collection('orders').where('customerDetails.email', '==', email).get());
            fallbacks.push(db.collection('orders').where('userEmail', '==', email).get());
          });
          Promise.allSettled(fallbacks).then(results => {
            const allDocs = [];
            results.forEach(r => { if (r.status === 'fulfilled') r.value.docs.forEach(d => allDocs.push(d)); });
            mergeAndRender(allDocs);
          });
        } else {
          if (ordersList) {
            ordersList.innerHTML = `<p class="empty-msg" style="color:#e74c3c;">⚠️ ${error.message || 'Failed to load orders.'}</p>`;
          }
        }
      });
    return unsubscribe;
  }

  function renderOrdersList(orders) {
    const ordersList = $('#orders-history-list');
    if (!ordersList) return;
    ordersList.innerHTML = orders.map(o => {
              const dateStr = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'Recent';
              const vatVal = o.vat || 0;
              const tipVal = o.tip || 0;
              
              // Calculate VAT split
              const isDineIn = o.orderType === 'dine-in';
              let standardGross = 0;
              let zeroGross = 0;
              (o.items || []).forEach(item => {
                const itemId = item.id || '';
                const itemTotal = (item.price || 0) * (item.qty || 1);
                let isZero = false;
                if (!isDineIn) {
                  if (itemId.startsWith('s') && !itemId.startsWith('si') && !itemId.startsWith('soft')) {
                    isZero = true;
                  }
                  if (itemId === 'si1' || itemId === 'si2') {
                    isZero = true;
                  }
                }
                if (isZero) {
                  zeroGross += itemTotal;
                } else {
                  standardGross += itemTotal;
                }
              });

              // Adjust proportionally for discount / service charge
              const sub = o.subtotal || (standardGross + zeroGross) || 1;
              const factor = (o.total - tipVal) / sub;
              standardGross = Math.round(standardGross * factor * 100) / 100;
              zeroGross = Math.round(zeroGross * factor * 100) / 100;

              const netStandard = Math.max(0, Math.round((standardGross - vatVal) * 100) / 100);
              const grossStandard = Math.round((netStandard + vatVal) * 100) / 100;
              const isOnline = o.paymentMethod !== 'cash';
              const historyTotalLabel = isOnline ? 'Total Paid' : (o.orderType === 'delivery' ? 'Amount to be paid on delivery' : 'Amount to be paid at counter');
              
              return `
                <div class="history-item">
                  <div class="history-header">
                    <span>Order #${o.orderId}</span>
                    <span class="status-badge ${o.status}">${o.status}</span>
                  </div>
                  <div class="history-body">
                    <p style="opacity:0.85;margin-bottom:0.25rem;color:var(--cream);"><strong>Customer:</strong> ${o.customerDetails?.name || o.name || 'Guest'}</p>
                    <p style="opacity:0.75;margin-bottom:0.5rem;color:var(--cream);">Date: ${dateStr} · Type: ${o.orderType} ${o.tableNumber ? `(Table ${o.tableNumber})` : ''} · Prep: ${o.prepTime ? `${o.prepTime} mins` : '15 mins'}</p>
                    ${(o.items || []).map(i => `<p style="margin-left:0.25rem;font-size:0.82rem;color:var(--cream);opacity:0.9;">• ${i.qty}× ${i.name} ${(i.options || []).length ? `(${(i.options || []).map(op=>op.label).join(', ')})` : ''}</p>`).join('')}
                    
                    <!-- UK VAT Receipt Compliance Breakdown -->
                    <div class="vat-breakdown" style="border-top:1px dashed rgba(201,148,58,0.25); margin-top:0.65rem; padding-top:0.5rem; font-size:0.72rem; color:var(--cream); opacity:0.85; line-height:1.45;">
                      <div style="display:flex; justify-content:space-between; margin-bottom:0.15rem; font-weight:600; color:var(--gold);">
                        <span>VAT Receipt Breakdown</span>
                        <span>VAT No: GB 987 6543 21</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; opacity:0.85;">
                        <span>Standard Rated (20%):</span>
                        <span>Net: ${formatPrice(netStandard)} · VAT: ${formatPrice(vatVal)} · Gross: ${formatPrice(grossStandard)}</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; opacity:0.85; margin-top:0.1rem;">
                        <span>Zero Rated (0%):</span>
                        <span>Net/Gross: ${formatPrice(zeroGross)}</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(201,148,58,0.25); margin-top:0.2rem; padding-top:0.15rem; font-weight:600; opacity:0.95;">
                        <span>Total Net (Excl. VAT):</span>
                        <span>${formatPrice(Math.round((netStandard + zeroGross) * 100) / 100)}</span>
                      </div>
                    </div>

                    <!-- Inline Tip Selector Box -->
                    <div class="inline-tip-box" id="tip-box-${o.orderId}" style="display:none; margin-top:0.75rem; border-top:1px dashed rgba(201,148,58,0.2); padding-top:0.75rem; background:rgba(26,18,9,0.5); border:1px solid rgba(201,148,58,0.15); border-radius:6px; padding:0.65rem;">
                      <p style="font-size:0.78rem; font-weight:600; margin-bottom:0.4rem; color:var(--gold);">Add a Tip for the Staff:</p>
                      <div style="display:flex; gap:0.35rem; margin-bottom:0.4rem;">
                        <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.72rem; flex:1; min-height:unset;" onclick="window.setHistoryTip('${o.orderId}', 1.00)">£1.00</button>
                        <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.72rem; flex:1; min-height:unset;" onclick="window.setHistoryTip('${o.orderId}', 2.00)">£2.00</button>
                        <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.72rem; flex:1; min-height:unset;" onclick="window.setHistoryTip('${o.orderId}', 5.00)">£5.00</button>
                        <button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.72rem; flex:1; min-height:unset;" onclick="window.toggleCustomHistoryTip('${o.orderId}')">Custom</button>
                      </div>
                      <div id="custom-history-tip-div-${o.orderId}" style="display:none; margin-bottom:0.4rem;">
                        <input type="number" id="custom-history-tip-val-${o.orderId}" placeholder="Enter tip (£)" min="0.01" step="0.01" style="width:100%; background:var(--bg-primary); border:1px solid var(--border-gold); color:var(--cream); padding:0.35rem; border-radius:4px; font-size:0.78rem;">
                      </div>
                      <div style="display:flex; justify-content:flex-end; gap:0.35rem; margin-top:0.5rem;">
                        <button class="btn btn-outline" style="padding:0.3rem 0.6rem; font-size:0.72rem; margin:0; min-height:unset;" onclick="window.closeHistoryTip('${o.orderId}')">Cancel</button>
                        <button class="btn btn-gold" style="padding:0.3rem 0.6rem; font-size:0.72rem; margin:0; min-height:unset;" onclick="window.submitHistoryTip('${o.orderId}')">Submit</button>
                      </div>
                    </div>

                    <div class="history-footer">
                      <span>${historyTotalLabel}</span>
                      <span style="color:var(--gold)">${formatPrice(o.total)}</span>
                    </div>
                    
                    ${(o.status === 'complete' || o.status === 'delivered') && !o.tip ? `
                      <button class="btn btn-outline btn-tip-history" style="margin-top: 0.50rem; padding: 0.4rem 1rem; font-size: 0.78rem; width:100%; display:block;" onclick="window.openHistoryTip('${o.orderId}')">❤ Tip the Chef</button>
                    ` : ''}
                    
                    ${o.status !== 'complete' && o.status !== 'cancelled' && o.status !== 'delivered' ? `
                      <button class="btn btn-gold btn-track-history" style="margin-top: 0.50rem; padding: 0.4rem 1rem; font-size: 0.78rem; width:100%; display:block;" onclick="window.trackUserOrder('${o.orderId}')">⚡ Live Track Order</button>
                    ` : ''}
                  </div>
                </div>
              `;
    }).join('');
  }

  function initAuthAndBookings() {
    if (typeof auth === 'undefined' || !auth || typeof db === 'undefined' || !db) {
      console.warn("[Firebase] Auth or DB not initialized. Running in offline mode.");
      updateAuthUI(null, null);
      if ($('#app-loading')) $('#app-loading').style.display = 'none';
      return;
    }

    // Set LOCAL persistence
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(() => console.log('Auth persistence set to LOCAL'))
      .catch(error => console.error('Persistence error:', error));

    auth.onAuthStateChanged(async (user) => {
      // Hide loading spinner
      if ($('#app-loading')) {
        $('#app-loading').style.display = 'none';
      }

      // Automatically trigger menu database load when auth state is first confirmed
      if (!menuFetchStarted) {
        menuFetchStarted = true;
        initMenuDatabase();
      }

      if (user) {
        // Enforce verification check for customers
        if (!user.emailVerified) {
          try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            const role = userData ? (userData.role || 'customer') : 'customer';
            const isPhoneVerified = userData ? (userData.phoneVerified === true) : false;
            
            if (role === 'customer' && !isPhoneVerified) {
              console.log("[Auth] Unverified customer session detected. Signing out.");
              currentUser = null;
              currentUserProfile = null;
              currentUserRole = null;
              await auth.signOut();
              return;
            }
          } catch (err) {
            console.error("Error checking verification status:", err);
          }
        }

        currentUser = user;
        
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            currentUserProfile = userDoc.data();
            currentUserRole = currentUserProfile.role || 'customer';
          } else {
            // Create profile if it doesn't exist
            currentUserProfile = {
              uid: user.uid,
              email: user.email || '',
              name: user.displayName || user.email || 'Customer',
              role: 'customer',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(user.uid).set(currentUserProfile);
            currentUserRole = 'customer';
          }
        } catch (err) {
          console.error('Profile fetch error:', err);
          currentUserRole = 'customer';
        }

        // Set form fields
        if ($('#cust-name')) $('#cust-name').value = currentUserProfile.name || '';
        if ($('#cust-email')) $('#cust-email').value = currentUserProfile.email || '';
        if ($('#cust-phone')) $('#cust-phone').value = currentUserProfile.phone || '';
        if ($('#book-name')) $('#book-name').value = currentUserProfile.name || '';
        if ($('#book-email')) $('#book-email').value = currentUserProfile.email || '';
        if ($('#book-phone')) $('#book-phone').value = currentUserProfile.phone || '';

        updateAuthUI(user, currentUserProfile);

        // Fetch user orders in real time
        const ordersUnsubscribe = fetchUserOrders(user.uid);
        window._ordersListener = ordersUnsubscribe;

        if (typeof onCustomerLoginSuccess === 'function') {
          onCustomerLoginSuccess(user, currentUserProfile);
        }

        if (currentUserRole === 'admin' || currentUserRole === 'superadmin') {
          showAdminPortal();
        } else {
          showCustomerPortal();
        }
      } else {
        currentUser = null;
        currentUserProfile = null;
        currentUserRole = null;
        updateAuthUI(null, null);
        
        if (document.getElementById('active-orders-badge')) document.getElementById('active-orders-badge').style.display = 'none';

        // Clear forms
        if ($('#cust-name')) $('#cust-name').value = '';
        if ($('#cust-email')) $('#cust-email').value = '';
        if ($('#cust-phone')) $('#cust-phone').value = '';
        if ($('#table-number')) $('#table-number').value = '';
        if ($('#instructions')) $('#instructions').value = '';
        if ($('#book-name')) $('#book-name').value = '';
        if ($('#book-email')) $('#book-email').value = '';
        if ($('#book-phone')) $('#book-phone').value = '';

        showLoginPage();
      }
    });

    $('#login-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      universalLogin(email, password, 'customer');
    });

    // Verification State Variables
    let pendingRegData = null;
    let emailCheckInterval = null;

    $('#register-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#register-name').value.trim();
      const email = $('#register-email').value.trim();
      const phone = $('#register-phone').value.trim();
      const password = $('#register-password').value;
      const errorEl = $('#register-error');
      
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.color = 'var(--error-red)';
      }

      if (!name || !email || !phone || !password) {
        if (errorEl) errorEl.textContent = 'Please fill in all fields.';
        return;
      }
      if (!validateEmail(email)) {
        if (errorEl) errorEl.textContent = 'Please enter a valid email address.';
        return;
      }
      const phoneResult = validatePhone(phone);
      if (!phoneResult.isValid) {
        if (errorEl) errorEl.textContent = 'Please enter a valid phone number with country code (e.g. +447123456789 or UK 07123456789).';
        return;
      }

      // Strong password validation
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      
      if (password.length < 8 || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        if (errorEl) {
          errorEl.innerHTML = `Password must be at least 8 characters long and include:
            <ul style="margin:0.25rem 0 0 1rem; padding:0; text-align:left; font-size:0.8rem; color: var(--error-red);">
              <li>At least one uppercase letter (A-Z)</li>
              <li>At least one lowercase letter (a-z)</li>
              <li>At least one number (0-9)</li>
              <li>At least one special character (e.g. !@#$)</li>
            </ul>`;
          errorEl.style.display = 'block';
        }
        return;
      }

      // Format and store values
      $('#register-phone').value = phoneResult.formatted;
      const verifyMethod = document.querySelector('input[name="reg-verify-method"]:checked').value;

      pendingRegData = {
        name,
        email,
        phone: phoneResult.formatted,
        password,
        verifyMethod
      };

      // Proceed to Verification Step
      showRegisterVerificationStep();
    });

    function showRegisterVerificationStep() {
      if (!pendingRegData) return;
      $('#register-form').classList.add('hidden');
      $('#register-verify-step').classList.remove('hidden');
      $('#verify-error').style.display = 'none';

      const titleEl = $('#verify-step-title');
      const msgEl = $('#verify-step-msg');
      const otpContainer = $('#verify-otp-container');
      const emailContainer = $('#verify-email-container');

      otpContainer.classList.add('hidden');
      emailContainer.classList.add('hidden');

      if (pendingRegData.verifyMethod === 'email') {
        titleEl.textContent = "Verify Your Email";
        msgEl.innerHTML = `We are registering your account. A verification link will be sent to <strong>${pendingRegData.email}</strong>. Please check your inbox and verify before clicking complete.`;
        emailContainer.classList.remove('hidden');
        
        // Create user in firebase in background to send verification email
        auth.createUserWithEmailAndPassword(pendingRegData.email, pendingRegData.password)
          .then(cred => {
            // Store user doc but keep unverified or sign out
            return cred.user.sendEmailVerification();
          })
          .then(() => {
            console.log("Verification email sent successfully.");
            // Auto check email verification status in background
            startEmailVerificationWatcher();
          })
          .catch(err => {
            $('#verify-error').textContent = err.message;
            $('#verify-error').style.display = 'block';
          });
      } else {
        // SMS Verification
        titleEl.textContent = "Verify Your Phone Number";
        msgEl.innerHTML = `Enter the 6-digit OTP verification code sent to your mobile <strong>${pendingRegData.phone}</strong>.`;
        otpContainer.classList.remove('hidden');
        $('#verify-otp-input').value = '';
        
        // Show simulated OTP code in toast for developer/user convenience
        const simulatedOTP = Math.floor(100000 + Math.random() * 900000);
        pendingRegData.simulatedOTP = simulatedOTP.toString();
        setTimeout(() => {
          showToast(`[SMS Sim] Verification code: ${simulatedOTP}`);
        }, 1200);
      }
    }

    function startEmailVerificationWatcher() {
      if (emailCheckInterval) clearInterval(emailCheckInterval);
      emailCheckInterval = setInterval(async () => {
        const user = auth.currentUser;
        if (user) {
          await user.reload();
          if (user.emailVerified) {
            clearInterval(emailCheckInterval);
            completeRegistration();
          }
        }
      }, 3000);
    }

    async function checkEmailVerificationManually() {
      const user = auth.currentUser;
      const errorEl = $('#verify-error');
      if (errorEl) errorEl.style.display = 'none';

      if (user) {
        await user.reload();
        if (user.emailVerified) {
          if (emailCheckInterval) clearInterval(emailCheckInterval);
          completeRegistration();
        } else {
          if (errorEl) {
            errorEl.textContent = "Email is not verified yet. Please click the link inside the verification email first.";
            errorEl.style.display = 'block';
          }
        }
      } else {
        // Attempt signing in with registration password to check status
        if (pendingRegData) {
          try {
            const cred = await auth.signInWithEmailAndPassword(pendingRegData.email, pendingRegData.password);
            if (cred.user.emailVerified) {
              completeRegistration();
            } else {
              await auth.signOut();
              if (errorEl) {
                errorEl.textContent = "Email is not verified yet. Please check your inbox.";
                errorEl.style.display = 'block';
              }
            }
          } catch (err) {
            if (errorEl) {
              errorEl.textContent = err.message;
              errorEl.style.display = 'block';
            }
          }
        }
      }
    }

    async function resendEmailVerificationLink() {
      const user = auth.currentUser;
      const errorEl = $('#verify-error');
      if (errorEl) errorEl.style.display = 'none';

      try {
        if (user) {
          await user.sendEmailVerification();
          showToast('✓ Verification email resent successfully!');
        } else if (pendingRegData) {
          const cred = await auth.signInWithEmailAndPassword(pendingRegData.email, pendingRegData.password);
          await cred.user.sendEmailVerification();
          await auth.signOut();
          showToast('✓ Verification email resent successfully!');
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }
    }

    function verifySMSOTP() {
      const code = $('#verify-otp-input').value.trim();
      const errorEl = $('#verify-error');
      if (errorEl) errorEl.style.display = 'none';

      if (!pendingRegData || code !== pendingRegData.simulatedOTP) {
        if (errorEl) {
          errorEl.textContent = "Invalid code. Please check and try again.";
          errorEl.style.display = 'block';
        }
        return;
      }

      // Create firebase auth user for phone auth registration path
      auth.createUserWithEmailAndPassword(pendingRegData.email, pendingRegData.password)
        .then(() => {
          completeRegistration(true); // pass true to set phoneVerified in profile
        })
        .catch(err => {
          if (errorEl) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
          }
        });
    }

    async function completeRegistration(phoneVerified = false) {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Save profile data
        await db.collection('users').doc(user.uid).set({
          uid: user.uid,
          name: pendingRegData.name,
          email: pendingRegData.email,
          phone: pendingRegData.phone,
          role: 'customer',
          phoneVerified: phoneVerified,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sign out so they can log in normally
        await auth.signOut();
        
        // Reset view
        $('#register-verify-step').classList.add('hidden');
        $('#register-form').classList.remove('hidden');
        
        // Clear forms
        $('#register-name').value = '';
        $('#register-email').value = '';
        $('#register-phone').value = '';
        $('#register-password').value = '';
        pendingRegData = null;

        showToast('✓ Registration complete! You can now log in.');
        closeAuthModal();
      } catch (err) {
        const errorEl = $('#verify-error');
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }
    }

    function cancelVerification() {
      if (emailCheckInterval) clearInterval(emailCheckInterval);
      
      // Delete temporary firebase auth user if it was created during email verification
      const user = auth.currentUser;
      if (user) {
        user.delete().catch(err => console.log("Clean user delete skipped:", err));
      }

      pendingRegData = null;
      $('#register-verify-step').classList.add('hidden');
      $('#register-form').classList.remove('hidden');
    }

    // Assign event listeners
    $('#verify-otp-btn')?.addEventListener('click', verifySMSOTP);
    $('#verify-email-check-btn')?.addEventListener('click', checkEmailVerificationManually);
    $('#verify-email-resend-btn')?.addEventListener('click', resendEmailVerificationLink);
    $('#verify-back-btn')?.addEventListener('click', cancelVerification);

    $('#auth-cancel')?.addEventListener('click', closeAuthModal);
    $('#auth-modal')?.addEventListener('click', e => {
      if (e.target.id === 'auth-modal') closeAuthModal();
    });

    $$('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => showAuthTab(btn.dataset.tab));
    });

    $('#user-dashboard-close')?.addEventListener('click', closeUserDashboard);
    $('#user-dashboard-modal')?.addEventListener('click', e => {
      if (e.target.id === 'user-dashboard-modal') closeUserDashboard();
    });

    $$('.dash-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => showDashboardTab(btn.dataset.dash));
    });

    $('#booking-form')?.addEventListener('submit', handleBookingSubmit);
    $('#booking-cancel')?.addEventListener('click', closeBookingModal);
    $('#booking-modal')?.addEventListener('click', e => {
      if (e.target.id === 'booking-modal') closeBookingModal();
    });

    // Setup table booking modal triggers
    document.querySelectorAll('a, button').forEach(el => {
      if (el.textContent.trim() === 'Book a Table' || el.dataset.order === 'book') {
        el.removeAttribute('data-scroll');
        el.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          openBookingModal();
        });
      }
    });
  }

  function updateAuthUI(user, profile) {
    const authItem = $('#nav-auth-item');
    if (!authItem) return;
    if (user) {
      // Get a clean name of the person, NOT the email
      let displayName = '';
      if (profile && profile.name && !profile.name.includes('@')) {
        displayName = profile.name;
      } else if (user.displayName && !user.displayName.includes('@')) {
        displayName = user.displayName;
      } else {
        // Fallback: extract name from email prefix
        const email = user.email || (profile && profile.email) || '';
        if (email) {
          const prefix = email.split('@')[0];
          displayName = prefix
            .split(/[._-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        } else {
          displayName = 'Customer';
        }
      }
      
      // Only display the first name of the person
      const firstName = displayName.split(' ')[0];
      // Retain the nav-cta-item layout class
      authItem.className = 'nav-cta-item user-dropdown-wrap';
      authItem.innerHTML = `
        <button class="btn btn-outline user-dropdown-btn">👤 ${firstName}</button>
        <ul class="user-dropdown-menu">
          <li><button id="dash-orders-btn">Order History</button></li>
          <li><button id="dash-bookings-btn">Bookings</button></li>
          <li><button id="logout-btn">Log Out</button></li>
        </ul>
      `;
      
      $('#dash-orders-btn')?.addEventListener('click', () => openUserDashboard('orders'));
      $('#dash-bookings-btn')?.addEventListener('click', () => openUserDashboard('bookings'));
      $('#logout-btn')?.addEventListener('click', () => {
        handleLogout().then(() => showToast('Logged out successfully.'));
      });
    } else {
      authItem.className = 'nav-cta-item';
      authItem.innerHTML = `<button class="btn btn-outline" id="auth-modal-btn">Log In</button>`;
      $('#auth-modal-btn')?.addEventListener('click', openAuthModal);
    }
  }

  function openAuthModal() {
    $('#auth-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    showAuthTab('login');
  }

  function closeAuthModal() {
    $('#auth-modal')?.classList.remove('open');
    document.body.style.overflow = '';
    $('#login-form')?.reset();
    $('#register-form')?.reset();
    if ($('#login-error')) $('#login-error').textContent = '';
    if ($('#register-error')) $('#register-error').textContent = '';
  }

  function showAuthTab(tab) {
    $$('.auth-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    $('#login-form')?.classList.toggle('hidden', tab !== 'login');
    $('#register-form')?.classList.toggle('hidden', tab !== 'register');
  }

  // Live track a specific user order from dashboard history
  window.trackUserOrder = function(orderId) {
    closeUserDashboard();
    lastOrderNum = orderId;
    openTracking();
  };

  function openUserDashboard(activeTab = 'orders') {
    const modal = $('#user-dashboard-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    

    
    if (currentUser) {
      $('#dashboard-logged-in-view')?.classList.remove('hidden');
      $('#dashboard-guest-lookup-view')?.classList.add('hidden');
      $$('.dash-tab-btn').forEach(btn => btn.style.display = 'inline-block');
      showDashboardTab(activeTab);
      loadDashboardData();
    } else {
      $('#dashboard-logged-in-view')?.classList.add('hidden');
      $$('.dash-tab-btn').forEach(btn => btn.style.display = 'inline-block');
      $('#dashboard-guest-lookup-view')?.classList.remove('hidden');
      const errEl = $('#lookup-error');
      if (errEl) errEl.textContent = '';
      $('#guest-lookup-form')?.reset();
    }
  }

  function closeUserDashboard() {
    $('#user-dashboard-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function showDashboardTab(tab) {
    $$('.dash-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.dash === tab));
    $('#dash-orders-section').classList.toggle('hidden', tab !== 'orders');
    $('#dash-bookings-section').classList.toggle('hidden', tab !== 'bookings');
  }

  function handleGuestLookupSubmit(e) {
    e.preventDefault();
    const orderId = $('#lookup-order-id').value.trim();
    const lookupPhone = $('#lookup-phone').value.trim();
    const errEl = $('#lookup-error');
    if (errEl) errEl.textContent = '';

    if (!orderId || !lookupPhone) {
      if (errEl) errEl.textContent = 'Please fill in all fields.';
      return;
    }

    db.collection('orders').doc(orderId).get().then(doc => {
      if (doc.exists) {
        const data = doc.data();
        
        // Clean both phone numbers to extract digits only
        const phoneInputCleaned = lookupPhone.replace(/[^0-9]/g, '');
        const orderPhoneCleaned = data.customerDetails.phone.replace(/[^0-9]/g, '');

        // Compare ending digits (e.g., last 9 digits) to prevent country code mismatches
        const matchLength = Math.min(phoneInputCleaned.length, orderPhoneCleaned.length, 9);
        const suffixInput = phoneInputCleaned.slice(-matchLength);
        const suffixOrder = orderPhoneCleaned.slice(-matchLength);

        if (suffixInput === suffixOrder && matchLength > 0) {
          // Success: Close dashboard and track order
          closeUserDashboard();
          lastOrderNum = orderId;
          openTracking();
        } else {
          if (errEl) errEl.textContent = 'Order ID and phone number do not match our records.';
        }
      } else {
        if (errEl) errEl.textContent = 'Order ID not found.';
      }
    }).catch(err => {
      console.error("Lookup error:", err);
      if (errEl) errEl.textContent = 'Error: ' + err.message;
    });
  }

  function loadDashboardData() {
    const user = firebase.auth().currentUser;
    if (!user) {
      console.warn('[Firebase] loadDashboardData called but no user logged in');
      return;
    }
    
    console.log('[Firebase] Loading dashboard data for user:', user.uid, user.email);
    

    // Orders — re-use the real-time fetchUserOrders listener so the
    // dashboard always reflects live Firestore data without a separate .get() call.
    // If an existing listener is already active (window._ordersListener), it is
    // already populating #orders-history-list in real time.  We just refresh it so
    // the latest snapshot is shown immediately when the dashboard opens.
    const ordersList = $('#orders-history-list');
    if (ordersList && typeof fetchUserOrders === 'function') {
      // Unsubscribe the old listener then restart so we get an immediate snapshot
      if (window._ordersListener) {
        try { window._ordersListener(); } catch(e) {}
      }
      ordersList.innerHTML = `<p class="empty-msg">Loading orders…</p>`;
      window._ordersListener = fetchUserOrders(user.uid);
    }


    // Bookings
    const bookingsList = $('#bookings-history-list');
    if (bookingsList) {
      bookingsList.innerHTML = `<p class="empty-msg">Loading reservations...</p>`;
      db.collection('bookings')
        .where('userId', '==', user.uid)
        .limit(100)
        .get()
        .then(querySnapshot => {
          const bookings = [];
          querySnapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
          });
          bookings.sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA;
          });
          
          if (bookings.length === 0) {
            bookingsList.innerHTML = `<p class="empty-msg">No upcoming reservations.</p>`;
          } else {
            bookingsList.innerHTML = bookings.map(b => {
              const dateStr = b.date ? new Date(b.date).toLocaleDateString() : '';
              return `
                <div class="history-item">
                  <div class="history-header">
                    <span>Booking #${b.bookingId}</span>
                    <span class="status-badge ${b.status}">${b.status}</span>
                  </div>
                  <div class="history-body">
                    <p><strong>Date:</strong> ${dateStr} at ${b.time}</p>
                    <p><strong>Table:</strong> ${/^\d+$/.test(b.tableNumber) ? `Table ${b.tableNumber}` : b.tableNumber} (${b.guests} Guests)</p>
                    <p><strong>Duration:</strong> ${b.duration}</p>
                  </div>
                </div>
              `;
            }).join('');
          }
        }).catch(err => {
          console.error('[Firebase] ✗ Error fetching bookings:', err.code, err.message);
          let errorMsg = 'Failed to load bookings.';
          if (err.code === 'permission-denied') {
            errorMsg = 'Access denied. Please update Firestore security rules.';
          }
          bookingsList.innerHTML = `<p class="empty-msg" style="color:var(--error-red)">${errorMsg}</p>`;
        });
    }
  }

  function openBookingModal() {
    $('#booking-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (currentUserProfile) {
      const nameInput = $('#book-name');
      if (nameInput) nameInput.value = currentUserProfile.name || '';
      if ($('#book-email')) $('#book-email').value = currentUserProfile.email || '';
      if ($('#book-phone')) $('#book-phone').value = currentUserProfile.phone || '';
    }
  }
  window.openBookingModal = openBookingModal;

  function closeBookingModal() {
    $('#booking-modal')?.classList.remove('open');
    document.body.style.overflow = '';
    $('#booking-form')?.reset();
    if ($('#booking-error')) $('#booking-error').textContent = '';
  }
  window.closeBookingModal = closeBookingModal;

  function handleBookingSubmit(e) {
    e.preventDefault();
    const name = sanitizeInput($('#book-name').value.trim(), 100);
    const email = sanitizeInput($('#book-email').value.trim(), 100);
    const phone = sanitizeInput($('#book-phone').value.trim(), 50);
    const date = sanitizeInput($('#book-date').value, 20);
    const time = sanitizeInput($('#book-time').value, 20);
    const duration = sanitizeInput($('#book-duration').value, 20);
    const guests = sanitizeInput($('#book-guests').value, 10);
    const tableEl = $('#book-table');
    const table = tableEl ? sanitizeInput(tableEl.value.trim(), 50) : 'any';
    const errorEl = $('#booking-error');
    if (errorEl) errorEl.textContent = '';

    if (!name || !email || !phone || !date || !time) {
      if (errorEl) errorEl.textContent = 'Please fill in all required fields.';
      return;
    }
    if (!validateEmail(email)) {
      if (errorEl) errorEl.textContent = 'Please enter a valid email address.';
      return;
    }
    const phoneResult = validatePhone(phone);
    if (!phoneResult.isValid) {
      if (errorEl) errorEl.textContent = 'Please enter a valid phone number with country code (e.g. +447123456789 or UK 07123456789).';
      return;
    }

    // Update input field with formatted phone
    $('#book-phone').value = phoneResult.formatted;
    
    const bookingId = Math.floor(1000 + Math.random() * 9000).toString();
    const bookingDoc = {
      bookingId: bookingId,
      userId: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null,
      name: name,
      email: email,
      phone: phoneResult.formatted,
      date: date,
      time: time,
      duration: duration,
      guests: guests,
      tableNumber: table === 'any' ? 'Any Available Table' : (table || 'Assigned on arrival'),
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    console.log('[Firebase] Saving booking:', bookingId);
    db.collection('bookings').doc(bookingId).set(bookingDoc).then(() => {
      console.log('[Firebase] ✓ Booking saved successfully! Doc ID:', bookingId);
      closeBookingModal();
      showToast(`✓ Table booking submitted! ID: #${bookingId}`);
    }).catch(err => {
      console.error('[Firebase] ✗ Booking error:', err.code, err.message);
      if (errorEl) errorEl.textContent = 'Failed: ' + (err.code === 'permission-denied' ? 'Please log in to make bookings.' : err.message);
    });
  }

  // --- ORDER HISTORY TIPPING ACTIONS ---
  window.toggleHistoryTip = function(orderId) {
    const box = $(`#tip-box-${orderId}`);
    if (box) {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
  };

  window.setHistoryTip = function(orderId, val) {
    const btn = $(`#confirm-tip-submit-btn-${orderId}`);
    if (btn) {
      btn.dataset.selectedTip = val;
      const customDiv = $(`#custom-history-tip-div-${orderId}`);
      if (customDiv) customDiv.style.display = 'none';
      btn.textContent = `Confirm £${val.toFixed(2)} Tip`;
    }
  };

  window.toggleCustomHistoryTip = function(orderId) {
    const div = $(`#custom-history-tip-div-${orderId}`);
    const btn = $(`#confirm-tip-submit-btn-${orderId}`);
    if (div) {
      div.style.display = 'block';
      const input = $(`#custom-history-tip-val-${orderId}`);
      if (input) {
        input.focus();
        input.oninput = (e) => {
          const val = parseFloat(e.target.value) || 0;
          btn.dataset.selectedTip = val;
          btn.textContent = val > 0 ? `Confirm £${val.toFixed(2)} Tip` : 'Confirm Tip';
        };
      }
    }
  };

  window.closeHistoryTip = function(orderId) {
    const box = $(`#tip-box-${orderId}`);
    if (box) box.style.display = 'none';
  };

  window.submitHistoryTip = function(orderId, oldTip, oldTotal) {
    const btn = $(`#confirm-tip-submit-btn-${orderId}`);
    if (!btn) return;
    
    const selectedVal = parseFloat(btn.dataset.selectedTip) || 0;
    if (selectedVal <= 0) {
      showToast("Please select or enter a valid tip amount.");
      return;
    }
    
    // Disable actions during simulated payment
    btn.disabled = true;
    btn.textContent = 'Authorizing... 🔒';
    
    setTimeout(() => {
      const newTip = selectedVal;
      const updatedTotal = Math.round((oldTotal - oldTip + newTip) * 100) / 100;
      
      db.collection('orders').doc(orderId).update({
        tip: newTip,
        total: updatedTotal
      }).then(() => {
        showToast(`Thank you! Tip of ${formatPrice(newTip)} processed successfully. ❤️`);
        loadDashboardData(); // Refresh history
      }).catch(err => {
        console.error("Error updating tip:", err);
        showToast("Error processing tip. Please try again.");
        btn.disabled = false;
        btn.textContent = 'Confirm Tip';
      });
    }, 1200);
  };

// --- CUSTOMER PORTAL INITIALIZATION AND HELPERS ---
function initCustomerPortal() {
  if (typeof closeAuthModal === 'function') closeAuthModal();
  showToast('✓ Logged in successfully!', 'success');
}
window.initCustomerPortal = initCustomerPortal;

function onCustomerLoginSuccess(user, profile) {
  if (typeof watchDailySpecial === 'function') {
    watchDailySpecial();
  }
  if (typeof watchActiveOrdersBadge === 'function') {
    watchActiveOrdersBadge(user.uid);
  }
  if (typeof calculateEstimatedWait === 'function') {
    calculateEstimatedWait();
    setInterval(calculateEstimatedWait, 60000);
  }
}
window.onCustomerLoginSuccess = onCustomerLoginSuccess;

function watchDailySpecial() {
  const today = new Date().toISOString().split('T')[0];
  db.collection('dailySpecials').doc(today)
    .onSnapshot(doc => {
      const slot = document.getElementById('daily-special-slot');
      if (!doc.exists || !doc.data().active) {
        document.getElementById('daily-special-banner')?.remove();
        if (slot) slot.innerHTML = '';
        return;
      }
      const special = doc.data();
      if (special.remainingQuantity <= 0) {
        document.getElementById('daily-special-banner')?.remove();
        if (slot) slot.innerHTML = '';
        return;
      }
      
      const html = `
        <div id="daily-special-banner" style="
          background:linear-gradient(135deg,#1a1209,#231810);
          border:1px solid #e8a825;border-radius:10px;
          padding:1.2rem 1.5rem;margin:1rem 0;
          display:flex;align-items:center;gap:1rem;
          position:relative;overflow:hidden;
        ">
          <div style="position:absolute;top:-10px;right:-10px;
                      font-size:4rem;opacity:0.06">⭐</div>
          <div style="font-size:2.5rem">${special.emoji || '⭐'}</div>
          <div style="flex:1">
            <div style="font-family:'Oswald',sans-serif;font-size:0.7rem;
                        color:#e84393;text-transform:uppercase;
                        letter-spacing:0.1em;margin-bottom:0.2rem">
              ✦ Today's Special
            </div>
            <div style="font-family:'Playfair Display',serif;
                        color:#f5ead6;font-size:1.1rem;margin-bottom:0.2rem">
              ${special.name}
            </div>
            <div style="color:#8a7a68;font-size:0.8rem">${special.description}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:'Oswald',sans-serif;font-size:1.4rem;
                        font-weight:600;color:#e8a825">£${special.price?.toFixed(2)}</div>
            <div style="font-size:0.7rem;color:#e84393;
                        font-family:'Oswald',sans-serif">
              ${special.remainingQuantity} left
            </div>
            <button onclick="addSpecialToCart('${doc.id}')" style="
              background:#e8a825;border:none;color:#0d0d0d;
              padding:0.4rem 1rem;border-radius:4px;
              font-family:'Oswald',sans-serif;font-weight:600;
              font-size:0.78rem;cursor:pointer;margin-top:0.3rem">
              ADD TO ORDER
            </button>
          </div>
        </div>`;
      
      if (slot) {
        slot.innerHTML = html;
      } else {
        const existing = document.getElementById('daily-special-banner');
        if (existing) {
          existing.outerHTML = html;
        } else {
          const menuSection = document.getElementById('menu-section');
          menuSection?.insertAdjacentHTML('beforebegin', html);
        }
      }
    });
}
window.watchDailySpecial = watchDailySpecial;

async function addSpecialToCart(specialId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const doc = await db.collection('dailySpecials').doc(today).get();
    if (!doc.exists) return;
    const special = doc.data();
    if (special.remainingQuantity <= 0) {
      showToast("Sorry, this daily special is sold out!", "error");
      return;
    }
    
    const item = {
      id: 'special-' + today,
      name: special.name,
      price: special.price,
      description: special.description,
      category: 'specials',
      image: special.image || ''
    };
    
    if (typeof addToCart === 'function') {
      addToCart(item, []);
      showToast(`✓ Added ${special.name} to order!`, 'success');
    }
  } catch(e) {
    console.error(e);
    showToast('Failed to add special to order.', 'error');
  }
}
window.addSpecialToCart = addSpecialToCart;

function watchActiveOrdersBadge(userId) {
  db.collection('orders')
    .where('userId', '==', userId)
    .where('status', 'in', ['received','pending','preparing','cooking','ready'])
    .onSnapshot(snapshot => {
      const count = snapshot.docs.length;
      const badge = document.getElementById('active-orders-badge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    });
}
window.watchActiveOrdersBadge = watchActiveOrdersBadge;

async function calculateEstimatedWait() {
  try {
    const activeOrders = await db.collection('orders')
      .where('status', 'in', ['received','pending','preparing','cooking'])
      .get();
    
    const count = activeOrders.docs.length;
    const estimatedMins = 10 + (count * 3);
    const display = estimatedMins <= 15 ? '10-15 mins' :
                    estimatedMins <= 25 ? '20-25 mins' :
                    estimatedMins <= 35 ? '30-35 mins' : '35+ mins';
    
    const waitEls = document.querySelectorAll('#estimated-wait');
    waitEls.forEach(waitEl => {
      waitEl.innerHTML = `
        <span style="color:#8a7a68;font-size:0.78rem">
          ⏱️ Current wait: 
          <strong style="color:${estimatedMins>30?'#e74c3c':estimatedMins>20?'#e8a825':'#27ae60'}">
            ${display}
          </strong>
          · ${count} active order${count!==1?'s':''}
        </span>`;
    });
    return estimatedMins;
  } catch (e) {
    console.error(e);
  }
}
window.calculateEstimatedWait = calculateEstimatedWait;

function checkQRCodeEntry() {
  const params = new URLSearchParams(window.location.search);
  const tableNum = params.get('table');
  const zone = params.get('zone');
  
  if (tableNum) {
    sessionStorage.setItem('qrTableNumber', tableNum);
    sessionStorage.setItem('qrTableZone', zone || '');
    
    showQRWelcomeBanner(tableNum, zone);
    
    const tableInput = document.getElementById('cart-table-num');
    if (tableInput) tableInput.value = tableNum;
    
    const orderTypeSelect = document.getElementById('cart-order-type');
    if (orderTypeSelect) {
      orderTypeSelect.value = 'dine-in';
      orderTypeSelect.dispatchEvent(new Event('change'));
    }
    
    window.history.replaceState({}, '', '/');
  }
}
window.checkQRCodeEntry = checkQRCodeEntry;

function showQRWelcomeBanner(tableNum, zone) {
  const banner = document.createElement('div');
  banner.id = 'qr-welcome-banner';
  banner.style.cssText = `
    position:fixed;top:80px;left:50%;transform:translateX(-50%);
    background:#1a1209;border:1px solid #e8a825;border-radius:10px;
    padding:1rem 1.5rem;z-index:9999;text-align:center;
    box-shadow:0 8px 24px rgba(0,0,0,0.5);animation:slideDown 0.4s ease;
    font-family:'Playfair Display',serif;
  `;
  banner.innerHTML = `
    <div style="color:#e8a825;font-size:1.1rem;margin-bottom:0.2rem">
      Welcome to Table ${tableNum}! 👋
    </div>
    <div style="color:#8a7a68;font-size:0.8rem;font-family:'Lora',serif">
      ${zone ? zone.charAt(0).toUpperCase()+zone.slice(1)+' seating · ' : ''}
      Browse the menu and order directly to your table
    </div>
    <button onclick="this.parentElement.remove()" style="
      background:none;border:none;color:#8a7a68;position:absolute;
      top:8px;right:10px;cursor:pointer;font-size:1rem">✕</button>`;
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 6000);
}
window.showQRWelcomeBanner = showQRWelcomeBanner;

  // --- NEW MENU CATEGORY CARD GRID & STRIPE INTEGRATION ---

  // Flatten local menuData into hardcodedMenuItems at initialization
  const hardcoded = [];
  const dbToDisplay = {
    'deals': 'Deals & Combos',
    'breakfast': 'Breakfast',
    'muffins': 'Breakfast Muffin Deals',
    'toasties': 'Toasties',
    'sandwiches': 'Sandwiches',
    'cheesy': 'Feeling Cheesy',
    'burgers': 'Gourmet Burgers',
    'sides': 'Sides',
    'hotdrinks': 'Hot Drinks',
    'softdrinks': 'Soft Drinks'
  };
  for (const [catKey, cat] of Object.entries(menuData)) {
    if (catKey === 'beers' || catKey === 'cocktails') continue;
    if (cat && cat.items) {
      cat.items.forEach(item => {
        if (item.id === 'd5' || item.id === 'd7') return;
        if (item.id === 'd3') {
          item.description = "Any Gourmet Burger + Side of Fries + Soft Drink (Save up to £2.00)";
        }
        hardcoded.push({
          ...item,
          category: dbToDisplay[catKey] || cat.title
        });
      });
    }
  }
  window.hardcodedMenuItems = hardcoded;
  window._allMenuItems = hardcoded;

  // Main function — renders menu as individual item cards with big images
  function renderMenuByCategory(allItems, filterCategory = 'All') {
    const grid = document.getElementById('menu-categories-grid');
    const searchGrid = document.getElementById('menu-search-results-grid');
    
    if (!grid || !searchGrid) return;

    // Show category grid, hide search grid
    grid.style.display = 'block';
    searchGrid.style.display = 'none';
    
    // Group items by category
    const categoryMap = {};
    const categoryOrder = [
      'Deals & Combos',
      'Breakfast', 
      'Breakfast Muffin Deals',
      'Toasties',
      'Sandwiches',
      'Feeling Cheesy',
      'Gourmet Burgers',
      'Sides',
      'Hot Drinks',
      'Soft Drinks'
    ];
    
    // Group items and normalize category keys to match display names
    allItems.filter(i => i.available !== false).forEach(item => {
      let cat = item.category || item.cat || 'Other';
      if (dbToDisplay[cat]) {
        cat = dbToDisplay[cat];
      } else if (dbToDisplay[cat.toLowerCase()]) {
        cat = dbToDisplay[cat.toLowerCase()];
      }
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(item);
    });
    
    // Determine which categories to show
    const categoriesToShow = filterCategory === 'All' 
      ? categoryOrder.filter(c => categoryMap[c] && categoryMap[c].length > 0)
      : [filterCategory].filter(c => categoryMap[c]);
    
    if (categoriesToShow.length === 0) {
      grid.innerHTML = `
        <div style="text-align:center;padding:3rem;color:#8a7a68">
          <div style="font-size:3rem;margin-bottom:0.8rem">🍽️</div>
          <div style="font-family:'Playfair Display',serif;color:#e8a825;font-size:1.2rem">No items available</div>
        </div>`;
      return;
    }
    
    // Render each category section with individual item cards
    grid.innerHTML = categoriesToShow.map(cat => {
      const items = categoryMap[cat] || [];
      
      return `
        <div class="menu-cat-section" id="cat-section-${cat.replace(/[\s&]/g,'-')}" style="margin-bottom:2.5rem;">
          <!-- Category heading -->
          <h2 style="
            font-family:'Playfair Display',serif;
            color:#e8a825;
            font-size:1.35rem;
            margin:0 0 1rem 0;
            padding-bottom:0.5rem;
            border-bottom:1px solid #2a1e10;
          ">${cat}</h2>

          <!-- Item cards — 4-column responsive grid -->
          <div style="
            display:grid;
            grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
            gap:1rem;
          ">
            ${items.map(item => {
              const qty = getItemQtyInCart(item.id);
              const imgSrc = item.image || 'images/menu-board.png';
              const isHighlighted = (cat === 'Deals & Combos' || item.id === 'bu1' || item.id === 'bu2');
              return `
                <div class="menu-item-card${isHighlighted ? ' highlight-large' : ''}" onclick="window.location.hash='item=${item.id}'">
                  <!-- Square image 1:1 -->
                  <div class="menu-item-card-img-wrap">
                    <img class="menu-item-card-img" src="${imgSrc}" alt="${item.name}" loading="lazy" onerror="this.src='images/menu-board.png'">
                    <button class="order-card-fav" aria-label="Favourite" onclick="event.stopPropagation(); this.classList.toggle('active'); this.textContent = this.classList.contains('active') ? '♥' : '♡';">♡</button>
                    ${(cat === 'Hot Drinks' || item.id.startsWith('hd')) ? `
                      <div class="steam-container">
                        <span class="steam-line"></span>
                        <span class="steam-line"></span>
                        <span class="steam-line"></span>
                      </div>
                    ` : ''}
                    ${item.originalPrice ? `
                      <span class="discount-badge">SALE</span>
                    ` : ''}
                    ${item.veg ? `<span style="
                      position:absolute;top:8px;left:8px;
                      background:#0d3b1e;color:#58d68d;
                      font-size:0.6rem;padding:2px 7px;border-radius:6px;
                      font-family:'Oswald',sans-serif;font-weight:600;
                      letter-spacing:0.05em;z-index:5;
                    ">VEG</span>` : ''}
                  </div>

                  <!-- Item info slide-up overlay -->
                  <div class="menu-item-card-body">
                    <div class="menu-item-name">${item.name}</div>
                    ${item.description ? `<p class="menu-item-desc">${item.description}</p>` : '<div style="flex:1"></div>'}
                    
                    <!-- Price + Add button row -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.55rem;">
                      <span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:#e8a825;">
                        ${item.originalPrice ? `<span class="original-price" style="text-decoration:line-through;color:#8a7a68;margin-right:0.5rem;font-size:0.85rem">£${item.originalPrice.toFixed(2)}</span>` : ''}
                        £${item.price?.toFixed(2)}
                      </span>

                      ${qty === 0 ? `
                        <button class="btn-add" onclick="event.stopPropagation(); handleAddItem('${item.id}')">+ Add</button>
                      ` : `
                        <div class="qty-stepper" onclick="event.stopPropagation()">
                          <button onclick="changeQty('${item.id}',-1)">−</button>
                          <span>${qty}</span>
                          <button onclick="changeQty('${item.id}',1)">+</button>
                        </div>
                      `}
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function renderCategoryChips(allItems) {
    const rawCats = allItems
      .filter(i => i.available !== false)
      .map(i => i.category || i.cat)
      .filter(Boolean);
      
    // Translate database keys to display titles
    const normalizedCats = rawCats.map(cat => {
      if (dbToDisplay[cat]) return dbToDisplay[cat];
      if (dbToDisplay[cat.toLowerCase()]) return dbToDisplay[cat.toLowerCase()];
      return cat;
    });

    const cats = ['All', ...new Set(normalizedCats)];
    
    const el = document.getElementById('category-chips-row');
    if (!el) return;
    el.innerHTML = cats.map(cat => `
      <button class="cat-chip ${cat === currentCategory ? 'active' : ''}"
              onclick="selectCategory('${cat}')" style="
        display:inline-flex;align-items:center;gap:0.3rem;
        padding:0.35rem 0.9rem;border-radius:20px;
        font-family:'Oswald',sans-serif;font-size:0.78rem;
        font-weight:500;text-transform:uppercase;letter-spacing:0.05em;
        cursor:pointer;transition:all 0.2s;
        border:1px solid ${cat === currentCategory ? '#e8a825' : '#2a1e10'};
        background:${cat === currentCategory ? 'rgba(232,168,37,0.15)' : '#111'};
        color:${cat === currentCategory ? '#e8a825' : '#5a4a38'};
      ">${cat}</button>`
    ).join('');
  }

  function selectCategory(cat) {
    currentCategory = cat;
    renderCategoryChips(window._allMenuItems || []);
    renderMenuByCategory(window._allMenuItems || [], cat);
    
    // Smooth scroll to menu grid
    document.getElementById('menu-categories-grid')
      ?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function handleAddItem(itemId) {
    const item = findItem(itemId);
    if (!item) return;
    const hasOpts = (item.options && item.options.length) || (item.sizes && item.sizes.length);
    if (hasOpts) {
      openCustomiseModal(itemId);
    } else {
      addToCart(item, []);
    }
  }

  function changeQty(itemId, delta) {
    const item = findItem(itemId);
    if (!item) return;
    const lines = cart.filter(l => l.id === itemId);
    if (delta > 0) {
      const hasOpts = (item.options && item.options.length) || (item.sizes && item.sizes.length);
      if (hasOpts) {
        openCustomiseModal(itemId);
      } else if (lines.length > 0) {
        setCartQty(lines[0].key, 1);
      } else {
        addToCart(item, []);
      }
    } else {
      if (lines.length > 0) {
        setCartQty(lines[lines.length - 1].key, -1);
      }
    }
  }

  function renderSearchResults(query, allItems) {
    const grid = document.getElementById('menu-categories-grid');
    const searchGrid = document.getElementById('menu-search-results-grid');
    const infoEl = document.getElementById('search-results-info');
    
    if (!grid || !searchGrid || !infoEl) return;

    if (!query || query.trim() === '') {
      renderMenuByCategory(allItems, currentCategory);
      infoEl.textContent = '';
      return;
    }
    
    const results = searchMenuItems(query, allItems);
    
    // Hide category grid, show flat search results grid
    grid.style.display = 'none';
    searchGrid.style.display = 'grid';
    
    infoEl.textContent = results.length > 0
      ? `${results.length} result${results.length!==1?'s':''} for "${query}"`
      : `No results for "${query}"`;
    
    if (results.length === 0) {
      searchGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem">
          <div style="font-size:3rem;margin-bottom:0.8rem">🔍</div>
          <div style="font-family:'Playfair Display',serif;color:#e8a825;
                      font-size:1.2rem;margin-bottom:0.4rem">
            No results for "${query}"
          </div>
          <div style="color:#8a7a68;font-size:0.82rem;margin-bottom:1rem">
            Try: burger, breakfast, coffee, toastie
          </div>
          <button onclick="clearSearch()" style="
            background:none;border:1px solid #c9943a;color:#e8a825;
            padding:0.5rem 1.2rem;border-radius:6px;
            font-family:'Oswald',sans-serif;cursor:pointer">
            Show All Items
          </button>
        </div>`;
      return;
    }
    
    // Render as individual item cards for search results
    searchGrid.innerHTML = results.filter(i => i.available !== false).map(item => {
      const qty = getItemQtyInCart(item.id);
      let catDisp = item.category || item.cat || '';
      if (dbToDisplay[catDisp]) catDisp = dbToDisplay[catDisp];
      else if (dbToDisplay[catDisp.toLowerCase()]) catDisp = dbToDisplay[catDisp.toLowerCase()];

      return `
        <div style="
          background:#1a1209;border:1px solid #2a1e10;
          border-radius:8px;padding:0.9rem;
          display:flex;flex-direction:column;gap:0.5rem;
          transition:border-color 0.2s;
        "
        onmouseover="this.style.borderColor='#c9943a'"
        onmouseout="this.style.borderColor='#2a1e10'">
          <div style="font-size:1.8rem;text-align:center">${item.emoji||'🍽️'}</div>
          <div style="font-family:'Playfair Display',serif;font-size:0.9rem;
                      color:#f0ece4;cursor:pointer" onclick="window.location.hash = 'item=${item.id}'">${item.name}</div>
          <div style="font-size:0.72rem;color:#5a4a38;line-height:1.3">
            ${item.description||''}</div>
          <div style="font-size:0.7rem;color:#8a7a68;font-family:'Oswald',sans-serif">
            ${catDisp}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;
                      margin-top:auto;padding-top:0.4rem">
            <span style="font-family:'Oswald',sans-serif;font-weight:600;
                         color:#e8a825">£${item.price?.toFixed(2)}</span>
            ${qty===0
              ? `<button onclick="handleAddItem('${item.id}')" style="
                  background:#e8a825;border:none;color:#0d0d0d;
                  padding:0.3rem 0.7rem;border-radius:4px;
                  font-family:'Oswald',sans-serif;font-weight:600;
                  font-size:0.78rem;cursor:pointer">+ Add</button>`
              : `<div style="display:flex;align-items:center;gap:0.3rem">
                  <button onclick="changeQty('${item.id}',-1)" style="
                    background:#2a1e10;border:1px solid #3a2e20;color:#e8a825;
                    width:22px;height:22px;border-radius:50%;cursor:pointer;
                    font-weight:700;font-size:0.9rem">−</button>
                  <span style="font-family:'Oswald',sans-serif;font-weight:600;
                               color:#f5ead6;min-width:16px;text-align:center">${qty}</span>
                  <button onclick="changeQty('${item.id}',1)" style="
                    background:#e8a825;border:none;color:#0d0d0d;
                    width:22px;height:22px;border-radius:50%;cursor:pointer;
                    font-weight:700;font-size:0.9rem">+</button>
                </div>`}
          </div>
        </div>`;
    }).join('');
  }

  function refreshMenuAfterCartChange() {
    if (window._searchQuery && window._searchQuery.length > 0) {
      renderSearchResults(window._searchQuery, window._allMenuItems || []);
    } else {
      renderMenuByCategory(window._allMenuItems || [], currentCategory || 'All');
    }
  }

  // --- STRIPE ELEMENT INITIALISATION (FIX 2) ---
  async function initStripeElements() {
    if (typeof window.Stripe === 'undefined') {
      const errEl = document.getElementById('stripe-error');
      if (errEl) {
        errEl.textContent = 'Payment system failed to load. Please refresh the page.';
        errEl.style.display = 'block';
      }
      return;
    }
    
    if (window._stripeInitialised) return;

    let publishableKey = 'pk_test_your_publishable_key_here';
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.publishableKey) {
        publishableKey = cfg.publishableKey;
      }
    } catch (err) {
      console.warn('Failed to fetch config, using fallback key:', err);
    }
    
    window._stripeInitialised = true;
    const stripeObj = window.Stripe(publishableKey);
    window._stripe = stripeObj;
    
    const elements = stripeObj.elements({
      fonts: [{
        cssSrc: 'https://fonts.googleapis.com/css2?family=Lora'
      }]
    });
    
    const cardEl = elements.create('card', {
      style: {
        base: {
          color: '#f5ead6',
          fontFamily: '"Lora", serif',
          fontSize: '16px',
          fontSmoothing: 'antialiased',
          lineHeight: '1.5',
          '::placeholder': {
            color: '#8a7a68'
          },
          iconColor: '#e8a825'
        },
        invalid: {
          color: '#e74c3c',
          iconColor: '#e74c3c'
        },
        complete: {
          color: '#27ae60',
          iconColor: '#27ae60'
        }
      },
      hidePostalCode: true
    });
    
    const mountTarget = document.getElementById('stripe-card-element');
    if (!mountTarget) {
      console.error('stripe-card-element div not found');
      return;
    }
    
    cardEl.mount('#stripe-card-element');
    window._cardElement = cardEl;
    
    // Listen for validation errors
    cardEl.on('change', function(event) {
      const errorEl = document.getElementById('stripe-error');
      if (errorEl) {
        if (event.error) {
          errorEl.textContent = event.error.message;
          errorEl.style.display = 'block';
        } else {
          errorEl.textContent = '';
          errorEl.style.display = 'none';
        }
      }
      
      // Show card brand icon
      if (event.brand && event.brand !== 'unknown') {
        const brands = {
          visa: '💳 Visa',
          mastercard: '💳 Mastercard', 
          amex: '💳 Amex',
          discover: '💳 Discover'
        };
        const brandEl = document.getElementById('card-brand');
        if (brandEl) brandEl.textContent = brands[event.brand] || '';
      }
    });
    
    cardEl.on('ready', function() {
      console.log('Stripe card element ready');
      const loading = document.getElementById('stripe-loading');
      if (loading) loading.style.display = 'none';
      const target = document.getElementById('stripe-card-element');
      if (target) target.style.opacity = '1';
    });
  }

  // --- STRIPE PAYMENT HANDLER (FIX 4) ---
  let lastStripeOrderDoc = null;

  async function saveOrderToFirestore(paymentInfo) {
    if (!currentUser) {
      throw new Error('Please log in or register before placing an order.');
    }

    const orderData = buildOrderData();
    const savedItems = [...cart];
    const savedTotal = getTotal();
    const prepVal = orderData.prepTime || calculatePrepTime();
    
    const orderId = '#' + (1000 + Math.floor(Math.random() * 9000));
    lastOrderNum = orderId;
    const docId = orderId.replace('#', '');

    const orderDoc = {
      orderId: docId,
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      customerDetails: {
        name: orderData.name,
        email: orderData.email,
        phone: orderData.phone
      },
      items: savedItems.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        options: item.options || []
      })),
      subtotal: orderData.subtotal,
      tip: orderData.tip || 0,
      vat: orderData.vat || 0,
      prepTime: prepVal,
      total: savedTotal,
      orderType: orderData.orderType,
      tableNumber: orderData.tableNumber || '',
      instructions: orderData.instructions || '',
      status: 'received',
      paymentMethod: paymentInfo.paymentMethod,
      paymentStatus: paymentInfo.paymentStatus,
      paymentMethodId: paymentInfo.paymentMethodId || '',
      stripePaymentMethodId: paymentInfo.stripePaymentMethodId || '',
      cardBrand: paymentInfo.cardBrand || '',
      cardLast4: paymentInfo.cardLast4 || '',
      estimatedTime: orderData.orderType === 'delivery' ? `${prepVal + 15}–${prepVal + 25} mins` : `${prepVal} mins`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    lastStripeOrderDoc = {
      orderDoc: orderDoc,
      savedItems: savedItems,
      savedTotal: savedTotal,
      prepVal: prepVal
    };

    console.log('[Firebase] Saving Stripe order:', docId, 'userId:', currentUser.uid);
    await db.collection('orders').doc(docId).set(orderDoc);
    
    // Decrement daily specials if order contains today's special
    try {
      const today = new Date().toISOString().split('T')[0];
      const specialItem = orderDoc.items.find(i => i.id && i.id.startsWith('special-'));
      if (specialItem) {
        await db.collection('dailySpecials').doc(today).update({
          remainingQuantity: firebase.firestore.FieldValue.increment(-specialItem.qty)
        });
      }
    } catch (e) {
      console.error("Error decrementing special qty:", e);
    }
  }

  function showOrderConfirmation() {
    closeCheckout();
    
    const savedItems = lastStripeOrderDoc?.savedItems || [];
    const savedTotal = lastStripeOrderDoc?.savedTotal || 0;
    const prepVal = lastStripeOrderDoc?.prepVal || 20;
    const orderDoc = lastStripeOrderDoc?.orderDoc || {};
    
    cart = [];
    appliedCoupon = null;
    serviceChargeEnabled = false;
    tipAmount = 0; // Reset tip for next checkout
    saveCart();
    updateCartBadge();
    refreshMenuAfterCartChange();

    renderConfirmationScreen(orderDoc, savedItems, savedTotal, prepVal, 'card');
    showToast('Order saved to your account ✓');
  }

  async function handleStripePayment() {
    const payBtn = document.getElementById('pay-button');
    const errorEl = document.getElementById('stripe-error');
    
    if (!window._stripe || !window._cardElement) {
      if (errorEl) {
        errorEl.textContent = 'Payment not ready. Please wait and try again.';
        errorEl.style.display = 'block';
      }
      return;
    }
    
    // Disable button and show loading
    payBtn.disabled = true;
    const originalText = payBtn.textContent;
    payBtn.innerHTML = `
      <span style="
        width:16px;height:16px;border-radius:50%;
        border:2px solid rgba(0,0,0,0.3);border-top-color:#0d0d0d;
        display:inline-block;animation:spin 0.8s linear infinite;
        margin-right:0.5rem;vertical-align:middle;
      "></span>
      Processing...`;
    
    if (errorEl) errorEl.style.display = 'none';
    
    try {
      // Create payment method
      const { paymentMethod, error } = await window._stripe.createPaymentMethod({
        type: 'card',
        card: window._cardElement,
        billing_details: {
          name: document.getElementById('checkout-name')?.value || 
                document.getElementById('cust-name')?.value ||
                currentUser?.displayName || 'Customer',
          email: document.getElementById('checkout-email')?.value || 
                 document.getElementById('cust-email')?.value ||
                 currentUser?.email
        }
      });
      
      if (error) {
        throw error;
      }
      
      // For now save order to Firebase with payment method ID
      // In production this ID goes to your backend to charge
      await saveOrderToFirestore({
        paymentMethodId: paymentMethod.id,
        paymentMethod: 'card',
        paymentStatus: 'paid',
        stripePaymentMethodId: paymentMethod.id,
        cardBrand: paymentMethod.card.brand,
        cardLast4: paymentMethod.card.last4
      });
      
      // Show success
      showOrderConfirmation();
      
    } catch (err) {
      console.error('Payment error:', err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Payment failed. Please try again.';
        errorEl.style.display = 'block';
      }
      payBtn.disabled = false;
      payBtn.textContent = originalText;
    }
  }

  // Expose everything globally for onclick attributes in HTML
  window.renderMenuByCategory = renderMenuByCategory;
  window.renderCategoryChips = renderCategoryChips;
  window.selectCategory = selectCategory;
  window.handleAddItem = handleAddItem;
  window.changeQty = changeQty;
  window.renderSearchResults = renderSearchResults;
  window.refreshMenuAfterCartChange = refreshMenuAfterCartChange;
  window.initStripeElements = initStripeElements;
  window.handleStripePayment = handleStripePayment;
  window.saveOrderToFirestore = saveOrderToFirestore;
  window.showOrderConfirmation = showOrderConfirmation;

  // --- CUSTOMER SESSION TIMEOUT ---
  const SESSION_TIMEOUTS = {
    customer: 24 * 60 * 60 * 1000 // 24 hours
  };
  const currentPortal = 'customer';
  let activityTimer;

  function resetActivityTimer() {
    clearTimeout(activityTimer);
    activityTimer = setTimeout(async () => {
      alert(`Your session has expired due to inactivity. Please sign in again.`);
      await auth.signOut();
      window.location.reload();
    }, SESSION_TIMEOUTS[currentPortal]);
  }

  ['click','keypress','scroll','mousemove','touchstart'].forEach(event => {
    document.addEventListener(event, resetActivityTimer, { passive: true });
  });
  resetActivityTimer();

  // --- CUSTOMER LIVE TABLES OVERLAY (PART 2) ---

  let tablesListener = null;

  function openLiveTablesView() {
    let overlay = document.getElementById('live-tables-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    overlay = document.createElement('div');
    overlay.id = 'live-tables-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.92);
      z-index: 8000;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    `;
    
    overlay.innerHTML = `
      <div style="
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
        padding: 2rem 1.5rem;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2rem;
        ">
          <div>
            <h2 style="
              font-family: 'Playfair Display', serif;
              color: #e8a825;
              font-size: 1.8rem;
              margin-bottom: 0.3rem;
            ">Live Table Availability</h2>
            <div style="
              display: flex;
              align-items: center;
              gap: 0.5rem;
              font-size: 0.78rem;
              color: #8a7a68;
              font-family: 'Oswald', sans-serif;
            ">
              <span style="
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #27ae60;
                display: inline-block;
                animation: livePulse 1.5s infinite;
              "></span>
              UPDATING LIVE
            </div>
          </div>
          <button onclick="closeLiveTablesView()" style="
            background: none;
            border: 1px solid #2a1e10;
            color: #8a7a68;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 1.2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.borderColor='#c9943a';this.style.color='#f5ead6'"
          onmouseout="this.style.borderColor='#2a1e10';this.style.color='#8a7a68'">
            ✕
          </button>
        </div>
        
        <!-- Legend -->
        <div style="
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        ">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div style="
              width: 16px;height: 16px;border-radius: 3px;
              background: #0d3b1e;border: 2px solid #27ae60;
            "></div>
            <span style="font-family:'Oswald',sans-serif;font-size:0.78rem;
                         color:#58d68d;text-transform:uppercase;
                         letter-spacing:0.06em">Available</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div style="
              width: 16px;height: 16px;border-radius: 3px;
              background: #3d0d0d;border: 2px solid #e74c3c;
            "></div>
            <span style="font-family:'Oswald',sans-serif;font-size:0.78rem;
                         color:#f1948a;text-transform:uppercase;
                         letter-spacing:0.06em">Occupied</span>
          </div>
        </div>
        
        <!-- Summary counts -->
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.8rem;
          margin-bottom: 1.5rem;
        ">
          <div style="
            background: #0d3b1e;
            border: 1px solid #27ae60;
            border-radius: 8px;
            padding: 0.8rem;
            text-align: center;
          ">
            <div id="count-available" style="
              font-family: 'Oswald', sans-serif;
              font-size: 2rem;
              font-weight: 600;
              color: #58d68d;
              line-height: 1;
            ">-</div>
            <div style="font-size:0.7rem;color:#27ae60;font-family:'Oswald',sans-serif;
                        text-transform:uppercase;letter-spacing:0.06em;margin-top:0.3rem">
              Available
            </div>
          </div>
          <div style="
            background: #3d0d0d;
            border: 1px solid #e74c3c;
            border-radius: 8px;
            padding: 0.8rem;
            text-align: center;
          ">
            <div id="count-occupied" style="
              font-family: 'Oswald', sans-serif;
              font-size: 2rem;
              font-weight: 600;
              color: #f1948a;
              line-height: 1;
            ">-</div>
            <div style="font-size:0.7rem;color:#e74c3c;font-family:'Oswald',sans-serif;
                        text-transform:uppercase;letter-spacing:0.06em;margin-top:0.3rem">
              Occupied
            </div>
          </div>
          <div style="
            background: #1a1209;
            border: 1px solid #2a1e10;
            border-radius: 8px;
            padding: 0.8rem;
            text-align: center;
          ">
            <div id="count-total" style="
              font-family: 'Oswald', sans-serif;
              font-size: 2rem;
              font-weight: 600;
              color: #e8a825;
              line-height: 1;
            ">-</div>
            <div style="font-size:0.7rem;color:#8a7a68;font-family:'Oswald',sans-serif;
                        text-transform:uppercase;letter-spacing:0.06em;margin-top:0.3rem">
              Total Tables
            </div>
          </div>
        </div>
        
        <!-- Tables Grid -->
        <div id="customer-tables-grid" style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        ">
          <div style="grid-column:1/-1;text-align:center;padding:2rem;
                      color:#8a7a68;font-family:'Lora',serif">
            Loading live table data...
          </div>
        </div>
        
        <!-- Book a table CTA -->
        <div style="
          margin-top: 2rem;
          text-align: center;
          padding: 1.5rem;
          background: #1a1209;
          border: 1px solid #2a1e10;
          border-radius: 10px;
        ">
          <div style="
            font-family: 'Playfair Display', serif;
            color: #f0ece4;
            font-size: 1.1rem;
            margin-bottom: 0.4rem;
          ">Want to guarantee your table?</div>
          <div style="
            color: #8a7a68;
            font-size: 0.82rem;
            margin-bottom: 1rem;
          ">Book in advance and your table will be waiting for you</div>
          <button onclick="closeLiveTablesView(); openBookingModal();" style="
            background: #e8a825;
            border: none;
            color: #0d0d0d;
            padding: 0.7rem 2rem;
            border-radius: 6px;
            font-family: 'Oswald', sans-serif;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            letter-spacing: 0.05em;
          ">BOOK A TABLE →</button>
        </div>
      </div>
      
      <style>
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes tableAvailablePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(39,174,96,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(39,174,96,0); }
        }
        @media (max-width: 768px) {
          #customer-tables-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
          }
        }
      </style>
    `;
    
    document.body.appendChild(overlay);
    
    startTablesListener();
  }

  function closeLiveTablesView() {
    const overlay = document.getElementById('live-tables-overlay');
    if (overlay) overlay.remove();
    
    if (tablesListener) {
      tablesListener();
      tablesListener = null;
    }
  }

  function startTablesListener() {
    if (tablesListener) {
      tablesListener();
      tablesListener = null;
    }
    
    if (typeof firebase === 'undefined' || typeof db === 'undefined' || !db) {
      console.warn("[Firebase] Offline/fallback mode: Using local mock table data.");
      const mockTables = [
        { id: 'table_1', number: 1, name: 'Table 1', capacity: 2, zone: 'Window', shape: 'round', status: 'available' },
        { id: 'table_2', number: 2, name: 'Table 2', capacity: 2, zone: 'Window', shape: 'round', status: 'available' },
        { id: 'table_3', number: 3, name: 'Table 3', capacity: 4, zone: 'Indoor', shape: 'square', status: 'available' },
        { id: 'table_4', number: 4, name: 'Table 4', capacity: 4, zone: 'Indoor', shape: 'square', status: 'available' },
        { id: 'table_5', number: 5, name: 'Table 5', capacity: 6, zone: 'Indoor', shape: 'rectangle', status: 'available' },
        { id: 'table_6', number: 6, name: 'Table 6', capacity: 6, zone: 'Outdoor', shape: 'rectangle', status: 'available' }
      ];
      window._liveTables = mockTables;
      renderCustomerTables(mockTables);
      updateTableCounts(mockTables);
      tablesListener = () => {};
      return;
    }
    
    tablesListener = firebase.firestore()
      .collection('tables')
      .orderBy('number', 'asc')
      .onSnapshot(
        (snapshot) => {
          const tables = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          window._liveTables = tables;
          
          renderCustomerTables(tables);
          updateTableCounts(tables);
        },
        (error) => {
          console.error('Tables listener error:', error);
          const grid = document.getElementById('customer-tables-grid');
          if (grid) {
            grid.innerHTML = `
              <div style="grid-column:1/-1;text-align:center;padding:2rem;
                          color:#e74c3c;font-family:'Lora',serif">
                Failed to load live table data. 
                <button onclick="startTablesListener()" style="
                  background:none;border:none;color:#e8a825;
                  cursor:pointer;text-decoration:underline;
                  font-family:'Lora',serif
                ">Try again</button>
              </div>`;
          }
        }
      );
  }

  function updateTableCounts(tables) {
    const available = tables.filter(t => t.status === 'available').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    
    const avEl = document.getElementById('count-available');
    const ocEl = document.getElementById('count-occupied');
    const toEl = document.getElementById('count-total');
    
    if (avEl) avEl.textContent = available;
    if (ocEl) ocEl.textContent = occupied;
    if (toEl) toEl.textContent = tables.length;
  }

  function renderCustomerTables(tables) {
    const grid = document.getElementById('customer-tables-grid');
    if (!grid) return;
    
    if (!tables || tables.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:2rem;
                    color:#8a7a68;font-family:'Lora',serif">
          No tables found. Admin needs to set up tables.
        </div>`;
      return;
    }
    
    const statusConfig = {
      available: {
        bg: '#0d3b1e',
        border: '#27ae60',
        titleColor: '#58d68d',
        badgeBg: '#27ae60',
        badgeColor: '#fff',
        label: 'AVAILABLE',
        icon: '✓',
        pulse: true
      },
      occupied: {
        bg: '#3d0d0d',
        border: '#e74c3c',
        titleColor: '#f1948a',
        badgeBg: '#e74c3c',
        badgeColor: '#fff',
        label: 'OCCUPIED',
        icon: '●',
        pulse: false
      }
    };
    
    grid.innerHTML = tables.map(table => {
      const config = statusConfig[table.status] || statusConfig.available;
      
      let occupiedTime = '';
      if (table.status === 'occupied' && table.occupiedSince) {
        const since = table.occupiedSince.toDate 
          ? table.occupiedSince.toDate() 
          : new Date(table.occupiedSince);
        const mins = Math.floor((Date.now() - since.getTime()) / 60000);
        const hrs = Math.floor(mins / 60);
        const remainMins = mins % 60;
        occupiedTime = hrs > 0 
          ? `${hrs}h ${remainMins}m` 
          : `${mins}m`;
      }
      
      return `
        <div style="
          background: ${config.bg};
          border: 2px solid ${config.border};
          border-radius: 12px;
          padding: 1.2rem;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          ${config.pulse ? 'animation: tableAvailablePulse 2.5s infinite;' : ''}
        "
        onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'"
        onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
          
          <!-- Status badge -->
          <div style="
            position: absolute;
            top: 0.7rem;
            right: 0.7rem;
            background: ${config.badgeBg};
            color: ${config.badgeColor};
            font-family: 'Oswald', sans-serif;
            font-size: 0.62rem;
            font-weight: 600;
            padding: 0.2rem 0.5rem;
            border-radius: 10px;
            letter-spacing: 0.06em;
          ">${config.label}</div>
          
          <!-- Table number -->
          <div style="
            font-family: 'Playfair Display', serif;
            font-size: 1.3rem;
            color: ${config.titleColor};
            margin-bottom: 0.4rem;
          ">Table ${table.number}</div>
          
          <!-- Zone -->
          <div style="
            font-family: 'Oswald', sans-serif;
            font-size: 0.7rem;
            color: #5a4a38;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 0.6rem;
          ">${table.zone || 'Indoor'}</div>
          
          <!-- Capacity -->
          <div style="
            display: flex;
            align-items: center;
            gap: 0.4rem;
            margin-bottom: 0.5rem;
          ">
            <span style="font-size:1rem">👥</span>
            <span style="
              font-family: 'Oswald', sans-serif;
              font-size: 0.82rem;
              color: #8a7a68;
            ">Seats ${table.capacity} guests</span>
          </div>
          
          <!-- Status info -->
          ${table.status === 'occupied' && occupiedTime ? `
            <div style="
              font-family: 'Oswald', sans-serif;
              font-size: 0.75rem;
              color: #f1948a;
              display: flex;
              align-items: center;
              gap: 0.3rem;
            ">
              <span>⏱️</span>
              <span>Occupied for ${occupiedTime}</span>
            </div>` : ''}
          
          ${table.status === 'available' ? `
            <div style="
              font-family: 'Oswald', sans-serif;
              font-size: 0.75rem;
              color: #27ae60;
              display: flex;
              align-items: center;
              gap: 0.3rem;
            ">
              <span>✓</span>
              <span>Walk in or book now</span>
            </div>` : ''}
          
        </div>`;
    }).join('');
  }

  window.openLiveTablesView = openLiveTablesView;
  window.closeLiveTablesView = closeLiveTablesView;
  window.startTablesListener = startTablesListener;
  window.updateTableCounts = updateTableCounts;
  window.renderCustomerTables = renderCustomerTables;
})();
