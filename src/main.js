import './style.css'
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, auth } from './firebase.js';
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  getDocs,
  serverTimestamp
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// --- Theme Sync System ---
function applyStoredTheme() {
    try {
        const stored = localStorage.getItem('mecThemeColors');
        if (stored) {
            const c = JSON.parse(stored);
            const root = document.documentElement;
            
            // Admin Panel Overrides
            root.style.setProperty('--primary-blue', c.primary);
            root.style.setProperty('--accent-blue', c.accent);
            root.style.setProperty('--admin-bg', c.bg);
            root.style.setProperty('--glass-bg', c.glass);
            
            // Store Front Overrides
            root.style.setProperty('--primary-color', c.primary);
            root.style.setProperty('--secondary-color', c.accent);
            root.style.setProperty('--deep-bg', c.bg);

            if(c.bg === '#0f172a' || c.bg === '#11011c' || c.bg === '#022c22') {
                 root.style.setProperty('--text-dark', '#f8fafc');
                 root.style.setProperty('--text-muted', '#94a3b8');
            } else {
                 root.style.setProperty('--text-dark', '#0f172a');
                 root.style.setProperty('--text-muted', '#64748b');
            }
        }
    } catch(e) {}
}
applyStoredTheme();

// --- SaaS Store Detection ---
const urlParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(p => p !== '');
// First path part is the slug, unless it's a known page like 'track' or 'admin'
const slugFromPath = (pathParts[0] && !['index.html', 'track', 'admin', 'login.html'].includes(pathParts[0])) ? pathParts[0] : null;
window.currentStoreId = urlParams.get('store') || slugFromPath || 'mec-book-shop';
console.log("Current Store ID:", window.currentStoreId);

window.currentStoreData = null;

// Always fetch store data if possible
const storesRef = collection(db, 'stores');
getDocs(query(storesRef, where('slug', '==', window.currentStoreId))).then(snap => {
  if (!snap.empty) {
    window.currentStoreData = snap.docs[0].data();
  }
  updateStoreBranding();
});

function updateStoreBranding() {
  let name = window.currentStoreData?.name || "MEC Book Shop";
  if (name === "MEC POS" || !window.currentStoreData) name = "MEC Book Shop"; // Force correct name
  document.title = `${name} | Official Store`;


  // Update all logo text instances
  document.querySelectorAll('.logo-text').forEach(el => {
    el.innerText = name;
  });

  // Update dynamic logo images
  if (window.currentStoreData?.logoUrl) {
    document.querySelectorAll('.logo-img, #pwa-install-banner img').forEach(img => {
      img.src = window.currentStoreData.logoUrl;
    });
  }

  // Update Page Title and Footer
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.innerText = `${name} | Official Store`;

  const footerCopy = document.getElementById('footer-copy');
  if (footerCopy) footerCopy.innerText = `© 2026 ${name}. All rights reserved.`;

  // Update Hero Subtitle if it's the default shop
  const heroSub = document.getElementById('hero-subtitle');
  if (heroSub && window.currentStoreId === 'mec-book-shop') {
    heroSub.innerText = "Your premium destination for books, stationery, and creative supplies.";
  }

  updateGreeting(); // Re-trigger greeting with new name
}

// --- PWA Installation Logic ---
let deferredPrompt;
const installBtn = document.createElement('div');
installBtn.id = 'pwa-install-banner';
installBtn.innerHTML = `
    <div style="position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--primary-color); color:white; padding:15px 25px; border-radius:50px; display:flex; align-items:center; gap:15px; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999; cursor:pointer; width:max-content; animation: slideUp 0.5s ease-out;">
        <img src="/logo.png" style="width:30px; height:30px; border-radius:5px;">
        <div>
            <div style="font-weight:bold; font-size:0.9rem;">Install MEC App</div>
            <div style="font-size:0.75rem; opacity:0.9;">Faster access & offline shopping</div>
        </div>
        <button id="pwa-close" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer; margin-left:10px;">&times;</button>
    </div>
    <style>
        @keyframes slideUp { from { bottom: -100px; opacity: 0; } to { bottom: 20px; opacity: 1; } }
    </style>
`;
installBtn.style.display = 'none';
document.body.appendChild(installBtn);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async (e) => {
  if (e.target.id === 'pwa-close') {
    installBtn.style.display = 'none';
    return;
  }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.style.display = 'none';
    }
    deferredPrompt = null;
  }
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW Registered', reg.scope);
    }).catch(err => {
      console.log('SW Registration Failed', err);
    });
  });
}

// --- Mobile Menu Toggle ---
const menuToggle = document.getElementById('menu-toggle');
const navMenu = document.getElementById('nav-menu');

const mobileOverlay = document.getElementById('mobile-menu-overlay');

const closeMobileMenu = () => {
  navMenu?.classList.remove('active');
  menuToggle?.classList.remove('active');
  mobileOverlay?.classList.remove('active');
};

menuToggle?.addEventListener('click', () => {
  const isActive = navMenu?.classList.toggle('active');
  menuToggle?.classList.toggle('active');
  if (isActive) mobileOverlay?.classList.add('active');
  else mobileOverlay?.classList.remove('active');
});

const closeMenuBtn = document.getElementById('close-menu');
closeMenuBtn?.addEventListener('click', closeMobileMenu);
mobileOverlay?.addEventListener('click', closeMobileMenu);

// Close menu when link is clicked
navMenu?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMobileMenu);
});
// -----------------------------

function updateGreeting() {
  const heroTitle = document.getElementById('hero-title');
  const greetingIcon = document.getElementById('greeting-icon');
  const hour = new Date().getHours();
  const storeName = window.currentStoreData?.name || "MEC Book Shop";

  let greeting = `Welcome to ${storeName}`;
  let icon = "☀️"; // Default sun

  if (hour >= 5 && hour < 12) {
    greeting = `Good Morning! Welcome to ${storeName}`;
    icon = "🌅"; // Sunrise
  } else if (hour >= 12 && hour < 17) {
    greeting = `Good Afternoon! Welcome to ${storeName}`;
    icon = "☀️"; // Sun
  } else if (hour >= 17 && hour < 21) {
    greeting = `Good Evening! Welcome to ${storeName}`;
    icon = "🌤️"; // Smiling Cloud (Sun behind cloud)
  } else {
    greeting = `Good Night! Welcome to ${storeName}`;
    icon = "🌙"; // Moon
  }

  if (heroTitle) heroTitle.innerText = greeting;
  if (greetingIcon) greetingIcon.innerText = icon;
}
updateGreeting();
setInterval(updateGreeting, 60000);

const defaultProducts = [
  {
    id: 1,
    name: 'Atlas CR Book (80 Pages)',
    price: 350.00,
    category: 'Notebooks',
    image: 'https://placehold.co/400x300/002060/FFF?text=Atlas+CR+80'
  },
  {
    id: 2,
    name: 'Promate Exercise Book (120 Pg)',
    price: 280.00,
    category: 'Notebooks',
    image: 'https://placehold.co/400x300/EC008C/FFF?text=Promate+120'
  }
];

// Firebase Collection References
const productsCol = collection(db, 'products');
const ordersCol = collection(db, 'orders');

let products = [];
let cartCount = 0;
let cart = [];
let currentCategory = 'All';
let currentPage = 1;
let itemsPerPage = 12; // Adjusted for better grid layout
let currentSort = 'recommended';
let searchQuery = '';
let seededRandomOrder = null;

const cartCountElement = document.getElementById('cart-count');

// Listen for Products Live
onSnapshot(productsCol, (snapshot) => {
  const allProducts = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
  products = allProducts.filter(p => {
    const isOurStore = (p.storeId === window.currentStoreId) ||
      (p.storeId === 'mec-pos-shop') || 
      (!p.storeId && (window.currentStoreId === 'mec-book-shop' || window.currentStoreId === 'master'));
    
    // Hide Service and Technical products from web storefront
    const isVisibleMode = (p.mode === 'Shop' || p.mode === 'Warehouse');
    
    return isOurStore && isVisibleMode;
  });


  if (products.length === 0 && window.currentStoreId === 'master') {
    // Seed initial data if empty
    defaultProducts.forEach(async (p) => {
      await addDoc(productsCol, p);
    });
  }
  renderProducts();
  renderCategories();
});

// Sorting listener
document.getElementById('product-sort')?.addEventListener('change', (e) => {
  currentSort = e.target.value;
  currentPage = 1;
  renderProducts();
});

// Search listener
document.getElementById('store-search')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  currentPage = 1;
  renderProducts();
});

// --- Cart Persistence ---
function saveCart() {
  localStorage.setItem('mec_cart', JSON.stringify(cart));
}

function loadCart() {
  const saved = localStorage.getItem('mec_cart');
  if (saved) {
    cart = JSON.parse(saved);
    cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    updateCartUI();
  }
}

// Create Cart Modal UI dynamically
const cartModal = document.createElement('div');
cartModal.id = 'cart-modal';
document.body.appendChild(cartModal);

const overlay = document.createElement('div');
overlay.id = 'cart-overlay';
document.body.appendChild(overlay);

window.toggleCart = (show) => {
  if (show) {
    cartModal.classList.add('active');
    overlay.classList.add('active');
    renderCartItems();
    document.body.style.overflow = 'hidden';
  } else {
    cartModal.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
};
const toggleCart = window.toggleCart;

overlay.onclick = () => toggleCart(false);

const cartTriggers = document.querySelectorAll('a[href="#cart"]');
cartTriggers.forEach(trigger => {
  trigger.onclick = (e) => {
    e.preventDefault();
    closeMobileMenu(); // Close sidebar if it's open
    toggleCart(true);
  };
});

const shopNowBtn = document.getElementById('shop-now-btn');
if (shopNowBtn) {
  shopNowBtn.addEventListener('click', () => {
    const productsSection = document.getElementById('shop-section');
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

const categoryIcons = {
  'All': '🏠',
  'Notebooks': '📓',
  'Stationery': '📎',
  'Writing': '✏️',
  'Art': '🎨',
  'Books': '📖',
  'Pens': '🖋️',
  'School': '🎒',
  'Office': '🏢'
};

function getCategories() {
  const categories = ['All', ...new Set(products.map(p => p.category))];
  return categories;
}

function renderCategories() {
  const categories = getCategories();
  const sidebarList = document.getElementById('sidebar-category-list');
  const mobileBar = document.getElementById('mobile-category-bar');

  if (sidebarList) {
    sidebarList.innerHTML = categories.map(cat => `
      <li class="sidebar-cat-item ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">
        <div class="cat-icon-text">
          <span class="cat-icon">${categoryIcons[cat] || '📁'}</span>
          <span>${cat}</span>
        </div>
        <span class="arrow">›</span>
      </li>
    `).join('');
  }

  if (mobileBar) {
    mobileBar.innerHTML = categories.map(cat => `
      <button class="mobile-cat-btn ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">
        ${cat}
      </button>
    `).join('');
  }

  // Common selection handler
  const handleCategorySelect = (cat) => {
    currentCategory = cat;
    const titleEl = document.getElementById('featured-title');
    if (titleEl) titleEl.innerText = cat === 'All' ? 'Featured Collection' : `${cat} Collection`;
    renderProducts();
    renderCategories();
    hideMegaMenu();
    // Scroll to products on sidebar selection too
    document.getElementById('shop-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Add click and hover listeners to sidebar
  document.querySelectorAll('.sidebar-cat-item').forEach(item => {
    item.addEventListener('click', (e) => handleCategorySelect(e.currentTarget.dataset.category));
    item.addEventListener('mouseenter', (e) => {
      const cat = e.currentTarget.dataset.category;
      if (cat !== 'All') showMegaMenu(cat, e.currentTarget);
    });
  });

  // Add click listeners to mobile bar
  document.querySelectorAll('.mobile-cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleCategorySelect(e.target.dataset.category));
  });

  const menuWrapper = document.querySelector('.category-menu-wrapper');
  menuWrapper?.addEventListener('mouseleave', () => {
    hideMegaMenu();
  });
}

const megaMenu = document.getElementById('mega-menu');

let megaMenuTimer;

function showMegaMenu(category, targetElement) {
  if (!megaMenu) return;
  clearTimeout(megaMenuTimer); // Cancel any pending hide

  // Mock sub-categories based on main category
  const subCategories = {
    'Writing': ['Ball Point Pens', 'Gel Pens', 'Markers', 'Pencils'],
    'Pens': ['Ball Point', 'Gel Pens', 'Highlighters', 'Ink Pens'],
    'Notebooks': ['Hardcover', 'Softcover', 'Spiral', 'CR Books'],
    'Art': ['Watercolors', 'Acrylics', 'Brushes', 'Sketchbooks']
  }[category] || ['Regular Items', 'Premium Items', 'New Arrivals'];

  // Get recent products for this category
  const categoryProducts = products.filter(p => p.category === category).slice(0, 4);

  // Update Mega Menu Content
  const subList = document.getElementById('mega-category-links');
  const prodList = document.getElementById('mega-products-list');

  if (subList) {
    subList.innerHTML = subCategories.map(sub => `<li><a href="#" onclick="event.preventDefault(); window.filterBySubCategory('${sub}', '${category}')">${sub}</a></li>`).join('');
  }

  if (prodList) {
    prodList.innerHTML = categoryProducts.length > 0
      ? categoryProducts.map(p => `
          <a href="#" class="mega-prod-item" onclick="event.preventDefault(); window.openProductDetail('${p.docId}')">
            <img src="${p.image}" class="mega-prod-img">
            <div class="mega-prod-info">
              <h5>${p.name}</h5>
              <div class="price">LKR ${p.price.toFixed(2)}</div>
            </div>
          </a>
        `).join('')
      : '<p style="color: #94a3b8; font-size: 0.85rem;">No recent products in this category.</p>';
  }

  // Positioning relative to the menu wrapper
  const headerHeight = document.querySelector('.sidebar-header')?.offsetHeight || 60;
  megaMenu.style.top = `${targetElement.offsetTop + headerHeight}px`;
  megaMenu.classList.add('active');
}

function hideMegaMenu() {
  // Add a small delay so user can move from category to the mega menu panel
  megaMenuTimer = setTimeout(() => {
    megaMenu?.classList.remove('active');
  }, 100);
}

// Ensure mega menu stays open when mouse is inside it
megaMenu?.addEventListener('mouseenter', () => clearTimeout(megaMenuTimer));

// Global function for sub-category filtering
window.filterBySubCategory = (sub, mainCat) => {
  currentCategory = mainCat;
  renderProducts();
  renderCategories();
  const titleEl = document.getElementById('featured-title');
  if (titleEl) titleEl.innerText = `${sub} in ${mainCat}`;
  document.getElementById('product-grid').scrollIntoView({ behavior: 'smooth' });
  hideMegaMenu();
};

window.scrollToProduct = (docId) => {
  const el = document.getElementById(`product-${docId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-pulse');
    setTimeout(() => el.classList.remove('highlight-pulse'), 3000);
    hideMegaMenu();
  }
};

const detailModal = document.getElementById('product-detail-modal');
const detailOverlay = document.getElementById('product-detail-overlay');

window.openProductDetail = (docId) => {
  const product = products.find(p => p.docId === docId);
  if (!product) return;

  const discount = product.discount || 0;
  const hasVariants = product.variants && product.variants.length > 0;
  const price = hasVariants ? product.variants[0].price : product.price;
  const discountedPrice = price * (1 - discount / 100);

  detailModal.innerHTML = `
        <button class="detail-close" onclick="window.closeProductDetail()">&times;</button>
        <div class="detail-content">
            <div class="detail-image-sec">
                <img src="${product.image}" id="detail-main-img" alt="${product.name}">
            </div>
            <div class="detail-info-sec">
                <div style="font-size: 0.9rem; color: var(--secondary-color); font-weight: 800; text-transform: uppercase;">${product.category}</div>
                <h2 style="font-size: 2rem; line-height: 1.2;">${product.name}</h2>
                <div class="product-price" style="font-size: 1.5rem;" id="detail-price-box">
                    ${discount > 0 ? `<span class="detail-original-price" style="text-decoration:line-through; opacity: 0.5; font-size: 1.2rem; margin-right: 10px;">LKR ${price.toFixed(2)}</span>` : ''}
                    <span class="detail-final-price" style="color: var(--accent-color); font-weight: 900;">LKR ${discountedPrice.toFixed(2)}</span>
                </div>
                <p style="color: var(--text-light); line-height: 1.6;">Premium quality ${product.name} specifically curated for our customers. Limited stock available.</p>
                
                ${hasVariants ? `
                    <div style="margin: 1rem 0;">
                        <label style="font-weight: 800; font-size: 0.8rem; display: block; margin-bottom: 0.5rem; text-transform: uppercase;">Select Variant:</label>
                        <select class="variant-select auth-input" style="width: 100%;" onchange="window.updateDetailDisplay('${product.docId}', this.value)">
                            ${product.variants.map((v, i) => `<option value="${i}">${v.name}</option>`).join('')}
                        </select>
                    </div>
                ` : ''}

                <div id="detail-stock" style="font-weight: 700; color: #10b981;">In Stock</div>
                
                <button class="add-to-cart-btn" style="width: 100%; padding: 1.25rem; font-size: 1.1rem; margin-top: 1rem;" 
                        onclick="window.handleDetailAddToCart('${product.docId}')">
                    Add to Cart
                </button>
            </div>
        </div>
    `;

  detailModal.classList.add('active');
  detailOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  hideMegaMenu();
};

window.closeProductDetail = () => {
  detailModal.classList.remove('active');
  detailOverlay.classList.remove('active');
  document.body.style.overflow = '';
};

detailOverlay.onclick = window.closeProductDetail;

window.updateDetailDisplay = (docId, variantIndex) => {
  const product = products.find(p => p.docId === docId);
  const variant = product.variants[variantIndex];
  const imgEl = document.getElementById('detail-main-img');
  const stockEl = document.getElementById('detail-stock');
  const origPriceEl = detailModal.querySelector('.detail-original-price');
  const finalPriceEl = detailModal.querySelector('.detail-final-price');

  if (variant.images && variant.images.length > 0) imgEl.src = variant.images[0];

  const discount = product.discount || 0;
  const price = variant.price;
  const discountedPrice = price * (1 - discount / 100);

  if (origPriceEl) origPriceEl.innerText = `LKR ${price.toFixed(2)}`;
  if (finalPriceEl) finalPriceEl.innerText = `LKR ${discountedPrice.toFixed(2)}`;

  stockEl.innerText = variant.stock > 0 ? `In Stock (${variant.stock})` : 'Out of Stock';
  stockEl.style.color = variant.stock > 0 ? '#10b981' : '#ef4444';
};

window.handleDetailAddToCart = (docId) => {
  const product = products.find(p => p.docId === docId);
  if (!product) return;

  const variantSelect = detailModal.querySelector('.variant-select');
  const variantIndex = variantSelect ? parseInt(variantSelect.value) : -1;

  let selectedVariant = 'Default';
  let price = product.price;

  let costValue = product.cost || 0;
  if (variantIndex !== -1) {
    const variant = product.variants[variantIndex];
    selectedVariant = variant.name;
    price = variant.price;
    costValue = variant.cost || product.cost || 0;
  }

  addToCartWithLogic(product, selectedVariant, price, costValue);
  window.closeProductDetail();
  toggleCart(true);
};

function addToCartWithLogic(product, variantName, price, costValue) {
  const existingIndex = cart.findIndex(item => item.docId === product.docId && item.selectedVariant === variantName);

  if (existingIndex !== -1) {
    cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + 1;
  } else {
    cart.push({
      ...product,
      selectedVariant: variantName,
      price: price,
      cost: costValue,
      quantity: 1
    });
  }

  cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  saveCart();
  updateCartUI();
}

window.changeCartQty = (docId, variantName, delta) => {
  const index = cart.findIndex(item => item.docId === docId && item.selectedVariant === variantName);
  if (index !== -1) {
    cart[index].quantity = (cart[index].quantity || 1) + delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    saveCart();
    updateCartUI();
    renderCartItems();
  }
};

function updateCartUI() {
  const counts = [
    document.getElementById('cart-count'),
    document.getElementById('cart-count-mobile')
  ];

  counts.forEach(el => {
    if (el) {
      el.innerText = cartCount;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 300);
    }
  });
}

function renderCartItems() {
  const total = cart.reduce((sum, item) => {
    const discount = item.discount || 0;
    const finalPrice = item.price * (1 - discount / 100);
    const qty = item.quantity || 1;
    return sum + (finalPrice * qty);
  }, 0);

  cartModal.innerHTML = `
        <div class="cart-header">
            <h2 style="font-size: 1.25rem;">Shopping Cart</h2>
            <button class="close-cart" id="close-cart-btn">&times;</button>
        </div>
        
        <div class="cart-scroll-area" style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;">
            <div class="cart-body">
                ${cart.length === 0 ? `
                    <div class="cart-empty-state">
                        <div style="font-size: 4rem; opacity: 0.2;">🛒</div>
                        <p>Your cart is empty</p>
                        <button class="category-btn active" onclick="toggleCart(false)">Start Shopping</button>
                    </div>
                ` : cart.map((item) => {
    const discount = item.discount || 0;
    const singleFinalPrice = item.price * (1 - discount / 100);
    const qty = item.quantity || 1;
    const itemTotal = singleFinalPrice * qty;

    return `
                        <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid #f1f5f9; gap: 1rem;">
                            <div class="cart-item-info" style="flex: 1;">
                                <h4 style="margin: 0; font-size: 1rem; color: var(--text-dark);">${item.name}</h4>
                                <div style="font-size: 0.75rem; color: var(--text-light); margin: 0.25rem 0 0.5rem;">Variant: ${item.selectedVariant || 'Default'}</div>
                                <div class="cart-item-price" style="font-weight: 800; color: var(--primary-color);">
                                    ${discount > 0 ? `<span style="text-decoration:line-through; color:#94a3b8; font-size:0.75rem; margin-right:5px; font-weight: normal;">LKR ${item.price.toFixed(2)}</span>` : ''}
                                    LKR ${singleFinalPrice.toFixed(2)} ${qty > 1 ? `<span style="color: var(--text-light); font-weight: normal; font-size: 0.8rem;">x ${qty} = LKR ${itemTotal.toFixed(2)}</span>` : ''}
                                </div>
                            </div>
                            <div class="cart-qty-controls" style="display:flex; align-items:center; gap:0.6rem; background: #f8fafc; padding: 6px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
                                <button onclick="window.changeCartQty('${item.docId}', '${item.selectedVariant}', -1)" 
                                        style="background:white; border:1px solid #e2e8f0; color:var(--primary-color); width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight:bold; cursor:pointer; font-size: 1.1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s;">
                                    -
                                </button>
                                <span style="font-weight:900; width: 24px; text-align:center; color: var(--text-dark); font-size: 1rem;">${qty}</span>
                                <button onclick="window.changeCartQty('${item.docId}', '${item.selectedVariant}', 1)" 
                                        style="background:var(--primary-color); border:none; color:white; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight:bold; cursor:pointer; font-size: 1.1rem; box-shadow: 0 2px 4px rgba(0,32,96,0.2); transition: all 0.2s;">
                                    +
                                </button>
                            </div>
                        </div>
                    `;
  }).join('')}
            </div>

            ${cart.length > 0 ? `
                <div class="cart-footer">
                    <div class="delivery-info-banner">
                        <span>🚚</span>
                        <span>COD LKR 400 | Bank Transfer LKR 250</span>
                    </div>
                    
                    <div class="cart-subtotal">
                        <span>Total Payable</span>
                        <span>LKR ${total.toFixed(2)}</span>
                    </div>

                    <div class="checkout-form-section">
                        <p class="section-title">📦 Delivery Details</p>
                        <div class="input-group">
                            <input id="delivery-phone" type="tel" placeholder="Phone Number 1 *" required value="${localStorage.getItem('mec_saved_phone') || ''}">
                        </div>
                        <div class="input-group">
                            <input id="delivery-phone-2" type="tel" placeholder="Phone Number 2 (Optional)" value="${localStorage.getItem('mec_saved_phone2') || ''}">
                        </div>
                        <div class="input-group">
                            <input id="delivery-address" type="text" placeholder="Full Address *" required value="${localStorage.getItem('mec_saved_address') || ''}">
                        </div>
                        <div class="input-group">
                            <input id="delivery-city" type="text" placeholder="City *" required value="${localStorage.getItem('mec_saved_city') || ''}">
                        </div>

                        <p class="section-title" style="margin-top: 1.5rem;">💳 Payment Method</p>
                        <div class="payment-method-selector">
                            ${cart.every(item => item.payCOD !== false) ? `
                            <label class="method-option">
                                <input type="radio" name="payment-method" value="COD" checked onclick="toggleBankDetails(false)">
                                <span class="method-label">COD</span>
                            </label>
                            ` : ''}
                            ${cart.every(item => item.payBank !== false) ? `
                            <label class="method-option">
                                <input type="radio" name="payment-method" value="Bank" ${!cart.every(item => item.payCOD !== false) ? 'checked' : ''} onclick="toggleBankDetails(true)">
                                <span class="method-label">Transfer</span>
                            </label>
                            ` : ''}
                            ${cart.every(item => item.payShop !== false) ? `
                            <label class="method-option">
                                <input type="radio" name="payment-method" value="ShopPay" ${(!cart.every(item => item.payCOD !== false) && !cart.every(item => item.payBank !== false)) ? 'checked' : ''} onclick="toggleBankDetails(false)">
                                <span class="method-label">Shop Cash</span>
                            </label>
                            ` : ''}
                        </div>
                        
                        <div id="bank-details-box" style="display: none;">
                            <p style="color: #166534; font-weight: bold; margin-bottom: 0.5rem; font-size: 0.75rem;">✨ Lower delivery charge (LKR 250)</p>
                            <div class="bank-info-card">
                                <strong>Bank of Ceylon</strong><br>
                                Horana Branch | WPM Shamesh<br>
                                A/C: 0084334885
                            </div>
                            <div style="margin-top: 1rem;">
                                <label style="display: block; font-size: 0.75rem; font-weight: bold; margin-bottom: 0.4rem; color: var(--text-light);">Upload Deposit Slip *</label>
                                <input type="file" id="deposit-slip" accept="image/*, application/pdf" style="font-size: 0.75rem; width: 100%;">
                            </div>
                        </div>
                    </div>

                    <button id="checkout-btn" class="add-to-cart-btn" style="width:100%; padding:1.25rem; font-size: 1.1rem; border-radius: 12px; height: auto;">
                        Confirm Order
                    </button>
                    <div style="height: 40px;"></div> <!-- Spacer for mobile -->
                </div>
            ` : ''}
        </div>
    `;

  document.getElementById('close-cart-btn').onclick = () => toggleCart(false);
  document.getElementById('checkout-btn')?.addEventListener('click', handleCheckout);

  window.toggleBankDetails = (show) => {
    const box = document.getElementById('bank-details-box');
    if (box) box.style.display = show ? 'block' : 'none';
  };
}

async function handleCheckout() {
  const user = JSON.parse(sessionStorage.getItem('mec_user'));
  if (!user) {
    alert('Please login to place an order!');
    window.location.href = '/login.html';
    return;
  }

  if (cart.length === 0) return;

  const phone = document.getElementById('delivery-phone')?.value.trim();
  const phone2 = document.getElementById('delivery-phone-2')?.value.trim();
  const address = document.getElementById('delivery-address')?.value.trim();
  const city = document.getElementById('delivery-city')?.value.trim();
  const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'COD';
  const slipFile = document.getElementById('deposit-slip')?.files[0];

  const isShopPickup = paymentMethod === 'ShopPay';

  if (!phone || (!isShopPickup && (!address || !city))) {
    alert(isShopPickup ? 'Please enter your Phone Number!' : 'Please fill in all delivery details (Phone, Address, City)!');
    return;
  }

  // SAVE Delivery Details for next time
  localStorage.setItem('mec_saved_phone', phone);
  localStorage.setItem('mec_saved_phone2', phone2);
  localStorage.setItem('mec_saved_address', address);
  localStorage.setItem('mec_saved_city', city);

  if (paymentMethod === 'Bank' && !slipFile) {
    alert('Please upload your bank deposit slip!');
    return;
  }

  const processOrder = async (slipBase64 = null) => {
    try {
      const newOrder = {
        orderId: 'ORD-' + Date.now(),
        userId: user.id || user.uid,
        userName: user.name || user.email,
        userEmail: user.email || '',
        phone: phone,
        phone2: phone2 || '',
        address: isShopPickup ? 'Shop Pickup' : address,
        city: isShopPickup ? 'Shop' : city,
        items: cart.map(item => ({
          ...item,
          cost: item.cost || 0,
          quantity: item.quantity || 1,
          finalPrice: item.price * (1 - (item.discount || 0) / 100)
        })),
        total: cart.reduce((sum, item) => sum + (item.price * (1 - (item.discount || 0) / 100) * (item.quantity || 1)), 0),
        status: 'Pending',
        paymentMethod: paymentMethod,
        slipImage: slipBase64,
        codCharge: paymentMethod === 'COD' ? 400 : (paymentMethod === 'Bank' ? 250 : 0),
        isShopPending: paymentMethod === 'ShopPay',
        storeId: window.currentStoreId,
        timestamp: serverTimestamp(),
        date: new Date().toLocaleString()
      };

      await addDoc(ordersCol, newOrder);

      cart = [];
      cartCount = 0;
      saveCart();
      updateCartUI();
      toggleCart(false);
      if (paymentMethod === 'Bank') {
        alert('Order placed successfully! We will verify your slip soon. Delivery: LKR 250');
      } else if (isShopPickup) {
        alert('Order placed successfully! No delivery charge. Please pay at the shop.');
      } else {
        alert('Order placed successfully! Delivery charge will be LKR 400/-');
      }
    } catch (e) {
      console.error("Order error", e);
      alert("Error placing order. Please try again.");
    }
  };

  if (slipFile) {
    const reader = new FileReader();
    reader.onloadend = () => processOrder(reader.result);
    reader.readAsDataURL(slipFile);
  } else {
    processOrder();
  }
}

function renderProducts() {
  const grid = document.querySelector('#product-grid');
  const pagControls = document.getElementById('pagination-controls');
  if (!grid) return;

  // 1. Filter
  let displayProducts = products.filter(p => {
    const matchesCategory = currentCategory === 'All' || p.category === currentCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery) || 
                         p.category.toLowerCase().includes(searchQuery) ||
                         (p.sku && p.sku.toLowerCase().includes(searchQuery));
    return matchesCategory && matchesSearch;
  });

  // 2. Sort
  if (currentSort === 'recommended') {
    // Generate a stable random order for the session if not exists
    if (!seededRandomOrder || seededRandomOrder.length !== displayProducts.length) {
      seededRandomOrder = displayProducts.map((_, i) => ({ id: i, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(item => item.id);
    }
    // Simple shuffle for demonstration - users like seeing different things
    displayProducts.sort(() => Math.random() - 0.5);
  } else {
    displayProducts.sort((a, b) => {
      if (currentSort === 'az') return a.name.localeCompare(b.name);
      if (currentSort === 'za') return b.name.localeCompare(a.name);
      if (currentSort === 'low') {
        const p1 = a.variants && a.variants.length > 0 ? a.variants[0].price : a.price;
        const p2 = b.variants && b.variants.length > 0 ? b.variants[0].price : b.price;
        return p1 - p2;
      }
      if (currentSort === 'high') {
        const p1 = a.variants && a.variants.length > 0 ? a.variants[0].price : a.price;
        const p2 = b.variants && b.variants.length > 0 ? b.variants[0].price : b.price;
        return p2 - p1;
      }
      return 0;
    });
  }

  // 3. Pagination Data
  const totalItems = displayProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = displayProducts.slice(startIndex, startIndex + itemsPerPage);

  // 4. Render Grid
  grid.innerHTML = paginatedProducts.map(product => {
    const discount = product.discount || 0;
    const hasVariants = product.variants && product.variants.length > 0;
    const defaultVariant = hasVariants ? product.variants[0] : null;

    const price = defaultVariant ? defaultVariant.price : product.price;
    const stock = defaultVariant ? defaultVariant.stock : (product.stock || 0);
    const discountedPrice = price * (1 - discount / 100);
    const displayImage = defaultVariant && defaultVariant.images && defaultVariant.images.length > 0 ? defaultVariant.images[0] : product.image;

    // Check for NEW (within 7 days) or HOT (Random best seller simulation)
    const isNew = product.timestamp && (Date.now() - product.timestamp.toMillis() < 7 * 24 * 60 * 60 * 1000);
    const isHot = !isNew && Math.random() > 0.8; // Randomly highlight some as best sellers for demo

    return `
    <div class="product-card" id="product-${product.docId}">
      <div class="product-image" style="position: relative; cursor: pointer; border-radius: 12px; overflow: hidden;" onclick="window.openProductDetail('${product.docId}')">
        <div class="image-slider-container" style="height: 100%; width: 100%;">
            <img src="${displayImage}" class="main-product-img" alt="${product.name}" style="width:100%; height:100%; object-fit:cover; transition: transform 0.6s cubic-bezier(0.165, 0.84, 0.44, 1);">
        </div>
        ${stock <= 0 ? '<div style="position:absolute; top:12px; right:12px; background:rgba(239, 68, 68, 0.9); backdrop-filter:blur(5px); color:white; padding:5px 12px; border-radius:20px; font-size:0.65rem; font-weight:900; z-index:5;">SOLD OUT</div>' : ''}
        ${discount > 0 ? `<div style="position:absolute; top:12px; left:12px; background:var(--highlight-color); color:#000; padding:5px 12px; border-radius:20px; font-size:0.7rem; font-weight:900; z-index:5; box-shadow: 0 0 15px rgba(255,242,0,0.5);">${discount}% OFF</div>` : ''}
        ${isNew ? `<div style="position:absolute; bottom:12px; left:12px; background:var(--secondary-color); color:white; padding:5px 12px; border-radius:20px; font-size:0.6rem; font-weight:900; z-index:5; box-shadow: var(--neon-glow-blue);">NEW</div>` : ''}
        
        <div class="image-dots" style="position: absolute; bottom: 12px; right: 12px; display: flex; gap: 4px; z-index: 6;">
            ${(defaultVariant?.images || [product.image]).map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" style="width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.3); ${i === 0 ? 'background: #00aeef; width: 12px; border-radius: 4px;' : ''}"></div>`).join('')}
        </div>
      </div>
      <div class="product-info">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.2rem;">
          <div style="font-size: 0.8rem; color: var(--text-light);">${product.category}</div>
          <div class="stock-display" style="font-size: 0.75rem; color: ${stock < 5 ? '#ef4444' : '#10b981'}; font-weight:700;">Stock: ${stock}</div>
        </div>
        <div class="product-title" style="cursor: pointer; transition: color 0.2s;" onclick="window.openProductDetail('${product.docId}')" onmouseover="this.style.color='var(--secondary-color)'" onmouseout="this.style.color=''">
          ${product.name}
        </div>
        
        ${hasVariants ? `
            <div class="variant-selector-wrap" style="margin: 0.75rem 0;">
                <label style="font-size: 0.7rem; font-weight: bold; color: var(--text-light); text-transform: uppercase;">Select Variant:</label>
                <select class="variant-select auth-input" style="padding: 0.4rem; font-size: 0.85rem; margin-top: 0.3rem;" onchange="updateProductDisplay('${product.docId}', this.value)">
                    ${product.variants.map((v, i) => `<option value="${i}">${v.name}</option>`).join('')}
                </select>
            </div>
        ` : ''}

        <div class="product-price">
            ${discount > 0 ? `<span class="original-price" style="text-decoration:line-through; color:#94a3b8; font-size:0.8rem; margin-right:5px;">LKR ${price.toFixed(2)}</span>` : ''}
            <span class="final-price">LKR ${discountedPrice.toFixed(2)}</span>
        </div>
        <button class="add-to-cart-btn" data-docid="${product.docId}" ${stock <= 0 ? 'disabled style="background:#cbd5e1; cursor:not-allowed;"' : ''}>
          ${stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>`;
  }).join('');

  // 5. Pagination UI
  if (pagControls) {
    if (totalPages > 1) {
      let pagHTML = `<button class="pag-nav-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.changePage(${currentPage - 1})">‹ Previous</button>`;

      const maxVisible = 5;
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);

      if (endPage === totalPages) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }

      // First Page + Dots
      if (startPage > 1) {
        pagHTML += `<button class="pag-num-btn" onclick="window.changePage(1)">1</button>`;
        if (startPage > 2) pagHTML += `<span style="color:white; padding:0 8px; align-self:center; opacity:0.6;">...</span>`;
      }

      // Middle Pages
      for (let i = startPage; i <= endPage; i++) {
        pagHTML += `<button class="pag-num-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
      }

      // Last Page + Dots
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagHTML += `<span style="color:white; padding:0 8px; align-self:center; opacity:0.6;">...</span>`;
        pagHTML += `<button class="pag-num-btn" onclick="window.changePage(${totalPages})">${totalPages}</button>`;
      }

      pagHTML += `<button class="pag-nav-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.changePage(${currentPage + 1})">Next ›</button>`;
      pagControls.innerHTML = pagHTML;
    } else {
      pagControls.innerHTML = '';
    }
  }

  // Add click listeners for Add to Cart
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.onclick = (e) => {
      const docId = e.currentTarget.dataset.docid;
      const product = products.find(p => p.docId === docId);
      if (product) {
        const card = document.getElementById(`product-${docId}`);
        const variantSelect = card.querySelector('.variant-select');
        const variantIndex = variantSelect ? parseInt(variantSelect.value) : -1;

        const variantName = variantIndex !== -1 ? product.variants[variantIndex].name : 'Default';
        const price = variantIndex !== -1 ? product.variants[variantIndex].price : product.price;
        const costValue = variantIndex !== -1 ? (product.variants[variantIndex].cost || product.cost || 0) : (product.cost || 0);

        addToCartWithLogic(product, variantName, price, costValue);

        const originalText = e.currentTarget.innerText;
        e.currentTarget.innerText = 'Added!';
        e.currentTarget.style.background = '#10b981';
        setTimeout(() => {
          e.currentTarget.innerText = originalText;
          e.currentTarget.style.background = '';
        }, 1000);
      }
    };
  });
}

window.changePage = (page) => {
  currentPage = page;
  renderProducts();
  document.getElementById('shop-section')?.scrollIntoView({ behavior: 'smooth' });
};

// Global function to update product card when variant changes
window.updateProductDisplay = (docId, variantIndex) => {
  const product = products.find(p => p.docId === docId);
  const card = document.getElementById(`product-${docId}`);
  if (!product || !card) return;

  const variant = product.variants[variantIndex];
  const discount = product.discount || 0;
  const price = variant.price;
  const stock = variant.stock;
  const discountedPrice = price * (1 - discount / 100);
  const images = variant.images && variant.images.length > 0 ? variant.images : [product.image];

  // Update Price
  const originalPriceEl = card.querySelector('.original-price');
  const finalPriceEl = card.querySelector('.final-price');
  if (originalPriceEl) originalPriceEl.innerText = `LKR ${price.toFixed(2)}`;
  if (finalPriceEl) finalPriceEl.innerText = `LKR ${discountedPrice.toFixed(2)}`;

  // Update Stock
  const stockEl = card.querySelector('.stock-display');
  stockEl.innerText = `Stock: ${stock}`;
  stockEl.style.color = stock < 5 ? '#ef4444' : '#10b981';

  // Update Add to Cart Button
  const btn = card.querySelector('.add-to-cart-btn');
  if (stock <= 0) {
    btn.disabled = true;
    btn.innerText = 'Out of Stock';
    btn.style.background = '#cbd5e1';
    btn.style.cursor = 'not-allowed';
  } else {
    btn.disabled = false;
    btn.innerText = 'Add to Cart';
    btn.style.background = '';
    btn.style.cursor = 'pointer';
  }

  // Update Image and Dots
  const imgEl = card.querySelector('.main-product-img');
  imgEl.src = images[0];

  const dotsContainer = card.querySelector('.image-dots');
  dotsContainer.innerHTML = images.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" style="width: 6px; height: 6px; border-radius: 50%; background: ${i === 0 ? 'white' : 'rgba(255,255,255,0.5)'};"></div>`).join('');

  // Handle image cycling if multiple images
  if (images.length > 1) {
    let currentImgIdx = 0;
    if (card.imageInterval) clearInterval(card.imageInterval);
    card.imageInterval = setInterval(() => {
      currentImgIdx = (currentImgIdx + 1) % images.length;
      imgEl.style.opacity = '0.5';
      setTimeout(() => {
        imgEl.src = images[currentImgIdx];
        imgEl.style.opacity = '1';
        // Update active dot
        const dots = dotsContainer.querySelectorAll('.dot');
        dots.forEach((dot, idx) => {
          dot.style.background = idx === currentImgIdx ? 'white' : 'rgba(255,255,255,0.5)';
        });
      }, 300);
    }, 3000);
  } else {
    if (card.imageInterval) clearInterval(card.imageInterval);
  }
};

// Auth State Management
function checkUserAuth() {
  const navAuthItem = document.getElementById('nav-auth-item');
  const userProfileSection = document.getElementById('user-profile');
  const userDisplayName = document.getElementById('user-display-name');

  onAuthStateChanged(auth, (user) => {
    const heroTitle = document.getElementById('hero-title');
    const heroSubtitle = document.getElementById('hero-subtitle');

    if (user) {
      // User is signed in
      const userData = {
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        id: user.uid
      };

      // Update session for other parts of the app
      sessionStorage.setItem('mec_user', JSON.stringify(userData));

      // Update session for other parts of the app
      sessionStorage.setItem('mec_user', JSON.stringify(userData));

      if (navAuthItem) {
        navAuthItem.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="color:var(--primary-color); font-weight:bold; font-size: 0.85rem;">Welcome, ${userData.name}!</span>
            <button id="nav-logout-btn" class="logout-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; height: auto;">Logout</button>
          </div>
        `;

        // Use a more resilient event listener approach
        navAuthItem.onclick = async (e) => {
          if (e.target && e.target.id === 'nav-logout-btn') {
            try {
              sessionStorage.removeItem('mec_user');
              await signOut(auth);
              window.location.href = '/'; // Force redirect to home after logout
            } catch (error) {
              console.error("Logout Error:", error);
              // Fallback if Firebase fails
              sessionStorage.removeItem('mec_user');
              window.location.reload();
            }
          }
        };
      }

      // Profile section logic removed as requested
    } else {
      // User is signed out
      sessionStorage.removeItem('mec_user');
      sessionStorage.removeItem('mec_user');

      if (navAuthItem) {
        navAuthItem.innerHTML = `<a href="/login.html">Login</a>`;
      }
      if (userProfileSection) {
        userProfileSection.style.display = 'none';
      }
    }
  });
}

function renderUserOrdersUI(userOrders) {
  const list = document.getElementById('user-orders-list');
  if (!list) return;

  list.innerHTML = userOrders.length === 0 ? `
    <div class="empty-orders">
      <p>You haven't placed any orders yet.</p>
      <button class="category-btn active" onclick="document.getElementById('products').scrollIntoView({behavior:'smooth'})">Start Shopping</button>
    </div>
  ` : userOrders.map(order => `
        <div class="order-card">
            <div class="order-info">
                <div class="order-id">${order.orderId}</div>
                <div class="order-meta">${order.date} • ${order.items.length} items</div>
                <div class="order-total">LKR ${order.total.toFixed(2)}</div>
            </div>
            <div class="order-status-col">
                <span class="status-badge" data-status="${order.status}">
                    ${order.status}
                </span>
            </div>
        </div>
  `).join('');
}

function getStatusBg(status) {
  if (status === 'Pending') return '#fee2e2';
  if (status === 'Processing') return '#fef3c7';
  if (status === 'Shipped') return '#dcfce7';
  if (status === 'Delivered') return '#dbeafe';
  return '#eee';
}

function getStatusColor(status) {
  if (status === 'Pending') return '#991b1b';
  if (status === 'Processing') return '#92400e';
  if (status === 'Shipped') return '#166534';
  if (status === 'Delivered') return '#1e40af';
  return '#333';
}

// Logout logic is now handled in the nav bar

// Real-time Reviews for Homepage
function loadReviews() {
  const reviewsContainer = document.getElementById('reviews-container');
  if (!reviewsContainer) return;

  const reviewsCol = collection(db, 'reviews');
  const q = query(reviewsCol, orderBy('timestamp', 'desc'));

  onSnapshot(q, (snapshot) => {
    const reviews = snapshot.docs.map(doc => doc.data());

    if (reviews.length === 0) {
      reviewsContainer.innerHTML = '<p class="loading-text">No reviews yet. Be the first to review us!</p>';
      return;
    }

    reviewsContainer.innerHTML = reviews.map(rev => `
      <div class="review-card">
        <div class="review-stars">
          ${'★'.repeat(rev.rating)}${'☆'.repeat(5 - rev.rating)}
        </div>
        <p class="review-comment">"${rev.comment || 'No comment provided.'}"</p>
        <div class="review-footer">
          <span class="review-author">${rev.userName}</span>
          <span class="review-date">${rev.date}</span>
        </div>
      </div>
    `).join('');
  });
}

// Initialize
updateGreeting();
loadCart();
checkUserAuth();
loadReviews();

/* --- Real Gemini AI Interaction --- */
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

async function getGeminiResponse(userText, lang) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Enhanced product info with Stock & Variants for Gemini
    const productInfo = products.map(p => {
      let info = `${p.name} (LKR ${p.price})`;
      if (p.variants && p.variants.length > 0) {
        info += ` [Variants: ${p.variants.map(v => `${v.name}-Stock:${v.stock}`).join(', ')}]`;
      } else {
        info += ` [Stock: ${p.stock || 0}]`;
      }
      return info;
    }).join(' | ');

    const systemPrompt = `You are the polite AI Shopkeeper for MEC Book Shop, Horana. 
    Current Inventory: ${productInfo}.
    
    PRIMARY RULES:
    1. Check Stock: If a user asks about a product, explicitly state if it's in stock or out of stock based on the data.
    2. Sinhala Excellence: Use natural, friendly, and polite Sinhala (e.g., using "ඔබට", "ස්තූතියි"). Avoid robotic translations.
    3. Speed: Be extremely concise. Max 1-2 very short sentences. NO yapping. 
    4. Search: If they ask to find/search, acknowledge and let the UI handle it.
    
    Customer Query: "${userText}"`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini Error:", error);
    return lang === 'si'
      ? "සමාවෙන්න, මට සම්බන්ධ වෙන්න බැහැ. ආයෙත් උත්සාහ කරන්න."
      : "Sorry, I'm having trouble connecting. Try again.";
  }
}

/* --- Gemini Voice Assistant Logic (Robust Engine) --- */
function initGeminiAssistant() {
  const orbBtn = document.getElementById('gemini-orb-btn');
  const bubble = document.getElementById('gemini-bubble');
  const searchInput = document.getElementById('store-search');

  if (!orbBtn || !bubble) return;

  let isListening = false;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported in this browser.");
    orbBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  window._geminiRec = recognition;

  const handleVoiceInput = async (text) => {
    const input = text.toLowerCase().trim();
    const lang = recognition.lang.startsWith('si') ? 'si' : 'en';

    bubble.textContent = lang === 'si' ? "පොඩ්ඩක් ඉන්න... (Thinking)" : "Thinking...";
    bubble.classList.add('active');

    // 1. Check for hard Search Intent (to trigger UI filtering)
    const searchKeywords = ['search', 'find', 'hoyala', 'hoyanna', 'balanna', 'thiyenawada', 'tiyenawada', 'look for', 'get me'];
    let query = input;
    let isSearch = false;
    searchKeywords.forEach(kw => { if (input.includes(kw)) isSearch = true; });

    if (isSearch) {
      searchKeywords.forEach(kw => { query = query.replace(kw, ''); });
      query = query.replace('for', '').replace('mata', '').trim();

      if (query.length > 1) {
        searchQuery = query;
        if (searchInput) searchInput.value = query;
        currentPage = 1;
        renderProducts();
        document.getElementById('shop-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // 2. Get AI Response from real Gemini
    const aiText = await getGeminiResponse(text, lang);
    speak(aiText, lang);
  };

  const speak = (responseText, lang) => {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance();

    utterance.text = responseText;
    utterance.lang = lang === 'si' ? 'si-LK' : 'en-US';

    bubble.textContent = responseText;
    bubble.classList.add('active');
    orbBtn.classList.add('listening');

    synth.speak(utterance);
    utterance.onend = () => {
      orbBtn.classList.remove('listening');
      setTimeout(() => { if (!isListening) bubble.classList.remove('active'); }, 7000);
    };
  };

  orbBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (e) {
      console.error("Recognition start error:", e);
      // If already started, just ignore or restart
    }
  });

  recognition.onstart = () => {
    isListening = true;
    orbBtn.classList.add('listening');
    bubble.textContent = recognition.lang.startsWith('si') ? "කතා කරන්න... (Listening)" : "Listening... (Please speak)";
    bubble.classList.add('active');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    handleVoiceInput(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Recognition Error:", event.error);
    isListening = false;
    orbBtn.classList.remove('listening');

    if (event.error === 'not-allowed') {
      bubble.textContent = "Please allow microphone access! (Microphone එක අනුමත කරන්න)";
    } else if (event.error === 'network') {
      bubble.textContent = "Network error. (අන්තර්ජාල සම්බන්ධතාවය පරීක්ෂා කරන්න)";
    } else {
      bubble.textContent = "I didn't hear that. (ඇහුණේ නැහැ...)";
    }
    setTimeout(() => bubble.classList.remove('active'), 4000);
  };

  recognition.onend = () => {
    isListening = false;
    if (!synth.speaking) {
      orbBtn.classList.remove('listening');
    }
  };
}

window.setAssistantLang = (lang) => {
  if (window._geminiRec) {
    window._geminiRec.lang = lang;
    const spans = document.getElementById('gemini-lang-toggle')?.querySelectorAll('span');
    spans?.forEach(s => {
      s.style.background = s.textContent.includes(lang.substring(0, 2).toUpperCase()) ? 'var(--secondary-color)' : '';
    });
    const bubble = document.getElementById('gemini-bubble');
    if (bubble) {
      bubble.textContent = lang.startsWith('si') ? "මම දැන් සිංහලෙන් කතා කරනවා!" : "I am now speaking English!";
      bubble.classList.add('active');
      setTimeout(() => bubble.classList.remove('active'), 3000);
    }
  }
};

initGeminiAssistant();
