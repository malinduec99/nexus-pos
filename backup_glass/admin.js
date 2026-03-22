// [MANDATORY] Run .\MASTER_SYNC.bat after any changes to this file!
import './admin-style.css';
import { db, auth } from './firebase.js';
import { signInWithEmailAndPassword } from "firebase/auth";
import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    addDoc,
    query,
    orderBy,
    serverTimestamp,
    getDocs,
    writeBatch
} from "firebase/firestore";

// --- Requirement: Sync Updates & Clean Session ---
window.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splash-screen');
    // Simulated Update Checking / Cache Refreshing
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.style.display = 'none', 500);
        }
    }, 2500);
});

// --- Admin PWA & Session Protection ---
let deferredPrompt;
const installBtn = document.createElement('div');
installBtn.id = 'admin-install-banner';
installBtn.innerHTML = `
    <div style="position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#002060; color:white; padding:15px 25px; border-radius:50px; display:flex; align-items:center; gap:15px; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999; cursor:pointer; width:max-content; animation: adminSlideUp 0.5s ease-out;">
        <img src="/logo.png" style="width:30px; height:30px; border-radius:5px;">
        <div>
            <div style="font-weight:bold; font-size:0.9rem;">Install MEC Admin</div>
            <div style="font-size:0.75rem; opacity:0.9;">Separate app for orders & stock</div>
        </div>
        <button id="pwa-close-admin" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer; margin-left:10px;">&times;</button>
    </div>
    <style>
        @keyframes adminSlideUp { from { bottom: -100px; opacity: 0; } to { bottom: 20px; opacity: 1; } }
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
    if (e.target.id === 'pwa-close-admin') {
        installBtn.style.display = 'none';
        return;
    }
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.style.display = 'none';
        deferredPrompt = null;
    }
});

// --- Notification Toast Utility ---
window.showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast admin-notif ${type}`;
    let icon = '🔔';
    let text = message;
    const emojiMatch = message.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/);
    if (emojiMatch) {
        icon = emojiMatch[0];
        text = message.replace(icon, '').trim();
    }

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${text}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 5000);
};

// Admin Credentials
const ADMIN_EMAIL = 'mecbookshop@gmail.com';
const ADMIN_PASS = 'mec123';

// Platform Manager Credentials
const PLATFORM_ADMIN = 'mecposadmin@gmail.com';
const PLATFORM_PASS = 'mecpos123';

const loginSection = document.getElementById('login-section');
const adminActions = document.getElementById('admin-actions');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn-real');
const productForm = document.getElementById('product-form');
const productListDiv = document.getElementById('admin-product-list');

const productsCol = collection(db, 'products');
const ordersCol = collection(db, 'orders');
const categoriesCol = collection(db, 'categories');
const expensesCol = collection(db, 'expenses');
const purchasesCol = collection(db, 'purchases');
const suppliersCol = collection(db, 'suppliers');
const incomeCol = collection(db, 'income');
const customersCol = collection(db, 'customers');
const employeesCol = collection(db, 'employees');
const attendanceCol = collection(db, 'attendance');
const payrollCol = collection(db, 'payroll');
const branchesCol = collection(db, 'branches');
const storesCol = collection(db, 'stores');
const repairJobsCol = collection(db, 'repairJobs');

let activeBranchFilter = 'All'; // Moved up to prevent RefError during snap load


// Store Detection from URL (supporting path-based /admin/slug or ?store=slug)
const urlParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(p => p !== '');
const urlStore = urlParams.get('store') || (pathParts[0] === 'admin' ? pathParts[1] : null);

if (urlStore) {
    sessionStorage.setItem('tempStoreSlug', urlStore);
}

// Helper to get current active store ID
window.getStoreId = () => sessionStorage.getItem('userStoreId') || sessionStorage.getItem('tempStoreSlug') || 'mec-book-shop';

// --- ERP System Logging ---
window.logAction = async (action, details = "") => {
    try {
        const storeId = window.getStoreId();
        const user = sessionStorage.getItem('userEmail') || 'Unknown';
        const role = sessionStorage.getItem('userRole') || 'None';
        
        await addDoc(collection(db, 'systemLogs'), {
            timestamp: serverTimestamp(),
            action,
            details,
            user,
            role,
            storeId,
            clientVersion: CLIENT_VERSION
        });
        
        // Update IT logs if visible
        const logContainer = document.getElementById('it-activity-logs');
        if (logContainer) {
            const entry = document.createElement('div');
            entry.style.padding = '0.75rem';
            entry.style.borderBottom = '1px solid #e2e8f0';
            entry.style.fontSize = '0.85rem';
            entry.innerHTML = `<span style="color:var(--primary-blue); font-weight:700;">[${new Date().toLocaleTimeString()}]</span> ${user} (${role}): <b>${action}</b> ${details}`;
            logContainer.prepend(entry);
        }
    } catch (e) { console.error("Log error:", e); }
};

// Theme Sync System
window.applyTheme = (themeName) => {
    const root = document.documentElement;
    let colors = {};
    if (themeName === 'win11-light') {
        colors = { primary: '#002060', accent: '#00aeef', bg: '#f1f5f9', glass: 'rgba(255,255,255,0.85)' };
        root.style.colorScheme = "light";
    } else if (themeName === 'win11-dark') {
        colors = { primary: '#38bdf8', accent: '#7dd3fc', bg: '#0f172a', glass: 'rgba(30,41,59,0.85)' };
        root.style.colorScheme = "dark";
    } else if (themeName === 'cyberpunk') {
        colors = { primary: '#f000ff', accent: '#00f0ff', bg: '#11011c', glass: 'rgba(20,5,30,0.85)' };
        root.style.colorScheme = "dark";
    } else if (themeName === 'emerald') {
        colors = { primary: '#064e3b', accent: '#10b981', bg: '#022c22', glass: 'rgba(2,44,34,0.85)' };
        root.style.colorScheme = "dark";
    }

    localStorage.setItem('mecThemeMode', themeName);
    localStorage.setItem('mecThemeColors', JSON.stringify(colors));
    window.showToast("✨ Display Theme Updated!", "success");
    applyStoredTheme();
};

window.updateCustomColor = (type, value) => {
    const root = document.documentElement;
    if (type === 'primary') root.style.setProperty('--primary-blue', value);
    if (type === 'accent') root.style.setProperty('--accent-blue', value);
    if (type === 'bg') root.style.setProperty('--admin-bg', value);
};

window.saveCustomTheme = () => {
    const p = document.getElementById('theme-color-primary').value;
    const a = document.getElementById('theme-color-accent').value;
    const b = document.getElementById('theme-color-bg').value;
    const colors = { primary: p, accent: a, bg: b, glass: b + 'd9' }; // approx 85% opacity
    
    localStorage.setItem('mecThemeMode', 'custom');
    localStorage.setItem('mecThemeColors', JSON.stringify(colors));
    window.showToast("💾 Custom Theme Saved & Applied to Store!", "success");
    applyStoredTheme();
};

function applyStoredTheme() {
    try {
        const stored = localStorage.getItem('mecThemeColors');
        if (stored) {
            const c = JSON.parse(stored);
            const root = document.documentElement;
            root.style.setProperty('--primary-blue', c.primary);
            root.style.setProperty('--accent-blue', c.accent);
            root.style.setProperty('--admin-bg', c.bg);
            root.style.setProperty('--glass-bg', c.glass);
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
// apply on load
applyStoredTheme();

// Helper to filter data by current store
window.filterByStore = (list) => {
    const storeId = window.getStoreId();
    if (!list) return [];
    
    // Explicitly allow main MEC slugs to see data without a storeId (backward compatibility)
    const isMainMec = (storeId === 'mec-book-shop' || storeId === 'mec-pos-shop' || storeId === 'mec-pos' || storeId === 'master');
    
    const filtered = list.filter(item => 
        (item.storeId === storeId) || 
        (isMainMec && (!item.storeId || item.storeId === 'mec-book-shop' || item.storeId === 'mec-pos-shop'))
    );
    
    if (list.length > 0 && filtered.length === 0) {
        console.warn(`Filter active: ${list.length} total items, 0 visible for store: ${storeId}`);
    }
    
    return filtered;
};

// Dynamic Branding for Login Screen
function updateLoginBranding() {
    const storeId = window.getStoreId();
    const loginTitle = document.querySelector('.login-header h2');
    const splashText = document.querySelector('#splash-screen p');
    const loginImg = document.querySelector('.login-header img');

    let brandName = window.storeInfo?.name || 'MEC POS';
    
    // Only show MEC Book Shop if it's explicitly set via URL/slug, otherwise use the universal brand
    const isExplicitMEC = sessionStorage.getItem('tempStoreSlug') === 'mec-book-shop';
    if (!window.storeInfo && !isExplicitMEC) brandName = 'MEC POS';

    if (loginTitle) loginTitle.innerText = brandName;
    if (splashText) splashText.innerText = `Syncing with ${brandName}`;
    if (window.storeInfo?.logoUrl && loginImg) {
        loginImg.src = window.storeInfo.logoUrl;
    }
}

// Initializing UI/Branding
updateLoginBranding();

// Ensure we load staff even when logged out to check credentials
onSnapshot(employeesCol, (snapshot) => {
    const employees = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
    window.allEmployees = employees;
    if (sessionStorage.getItem('isAdminLoggedIn')) {
        renderAdminEmployeesUI(employees);
        populatePayrollStaffDropdown(employees);
        
        // Auto-update ID if the form is visible and we are not editing
        const hrmSection = document.getElementById('section-hrm');
        if (hrmSection && hrmSection.style.display !== 'none' && !window.editingEmployeeId) {
            window.generateEmployeeID(true);
        }
    }
});

const CLIENT_VERSION = '1.4.6'; // Updated version for changes

const THEMES = {
    original: { primary: '#002060', accent: '#00aeef', bg: '#f3f4f6' },
    emerald: { primary: '#064e3b', accent: '#10b981', bg: '#f0fdf4' },
    crimson: { primary: '#7f1d1d', accent: '#ef4444', bg: '#fef2f2' },
    cyber: { primary: '#0f172a', accent: '#334155', bg: '#1e293b' }
};

window.setAdminTheme = (themeId) => {
    const theme = THEMES[themeId];
    if (!theme) return;

    document.documentElement.style.setProperty('--primary-blue', theme.primary);
    document.documentElement.style.setProperty('--accent-blue', theme.accent);
    document.documentElement.style.setProperty('--admin-bg', theme.bg);
    
    // Additional styling adjustments for Cyber theme (Dark Mode)
    if (themeId === 'cyber') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }

    localStorage.setItem('admin-theme-choice', themeId);
    window.showToast(`✨ ${themeId.toUpperCase()} Theme Applied!`, "success");
};

window.displayUIVersion = () => {
    const badge = document.getElementById('admin-version-badge');
    const label = document.getElementById('login-version-label');
    if (badge) badge.innerText = `v${CLIENT_VERSION} - Managed`;
    if (label) label.innerText = `Username / Email (v${CLIENT_VERSION})`;
};

document.addEventListener('DOMContentLoaded', () => {
    window.displayUIVersion();
    // Clock logic is now running independently inside admin.html

    // Re-apply saved theme
    const savedTheme = localStorage.getItem('admin-theme-choice') || 'original';
    window.setAdminTheme(savedTheme);
});

loginBtn?.addEventListener('click', () => {
    const rawInput = document.getElementById('login-email').value;
    const userInput = rawInput.trim().toLowerCase();
    const passInput = document.getElementById('login-password').value;

    console.log(`Login attempt: ${userInput}`);

    // Master Support (Book Shop Owner OR Platform Manager)
    const isMaster = (userInput === ADMIN_EMAIL && passInput === ADMIN_PASS) || (userInput === PLATFORM_ADMIN && passInput === PLATFORM_PASS);

    if (isMaster) {
        sessionStorage.setItem('isAdminLoggedIn', 'true');
        sessionStorage.setItem('userRole', 'SuperAdmin'); 
        sessionStorage.setItem('userEmail', userInput);
        sessionStorage.setItem('userName', 'Super Admin');
        sessionStorage.setItem('userBranchId', 'Global');
        sessionStorage.setItem('userStoreId', sessionStorage.getItem('tempStoreSlug') || 'mec-book-shop'); 
        showAdminActions();
    } else {
        // Check staff members (using original casing for passwords but lowered for usernames)
        const staff = (window.allEmployees || []).find(e => e.username?.toLowerCase() === userInput && e.password === passInput);
        if (staff && staff.role_access !== 'none') {
            sessionStorage.setItem('isAdminLoggedIn', 'true');
            sessionStorage.setItem('userRole', staff.role_access);
            sessionStorage.setItem('userEmail', staff.username);
            sessionStorage.setItem('userName', staff.name || staff.username);
            sessionStorage.setItem('userId', staff.docId);
            sessionStorage.setItem('userBranchId', staff.branchId || 'Global');
            sessionStorage.setItem('userStoreId', staff.storeId || 'mec-book-shop');
            showAdminActions();
        } else {
            const errorMsg = document.getElementById('login-error');
            errorMsg.style.display = 'block';
            setTimeout(() => errorMsg.style.display = 'none', 3000);
        }
    }
});

logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem('isAdminLoggedIn');
    location.reload();
});

function showAdminActions() {
    if (loginSection) loginSection.style.display = 'none';
    if (adminActions) adminActions.style.display = 'block';
    
    const currentRole = sessionStorage.getItem('userRole') || 'Admin';
    
    const profileTrigger = document.getElementById('profile-trigger');
    if (profileTrigger) profileTrigger.style.display = 'block';

    updateUserDisplay();



    // Role-Based Navigation Filtering
    const rolePermissions = {
        'SuperAdmin': ['orders', 'pos', 'products', 'stock', 'categories', 'reports', 'expenses', 'purchases', 'income', 'suppliers', 'customers', 'repairs', 'hrm', 'branches', 'stores', 'it-system', 'appearance', 'web-dev'],
        'CEO_Admin': ['orders', 'pos', 'products', 'stock', 'categories', 'reports', 'expenses', 'purchases', 'income', 'suppliers', 'customers', 'repairs', 'hrm', 'branches', 'it-system', 'appearance', 'web-dev'],
        'Admin': ['orders', 'pos', 'products', 'stock', 'categories', 'reports', 'expenses', 'purchases', 'income', 'suppliers', 'customers', 'repairs', 'hrm', 'branches', 'it-system', 'appearance', 'web-dev'],
        'IT_Manager': ['it-system', 'branches', 'hrm'],
        'Finance_Manager': ['reports', 'expenses', 'income', 'purchases', 'suppliers', 'orders', 'hrm'],
        'Junior_Accountant': ['reports', 'expenses', 'income', 'purchases'],
        'HR_Manager': ['hrm'],
        'Inventory_Manager': ['products', 'stock', 'categories', 'suppliers', 'purchases'],
        'Store_Keeper': ['stock', 'products', 'categories'],
        'Sales_Manager': ['orders', 'customers', 'reports', 'pos'],
        'Cashier': ['pos', 'orders', 'customers', 'repairs'],
        'RepairTech': ['repairs', 'pos'],
        'Branch_Manager': ['pos', 'orders', 'products', 'stock', 'hrm', 'reports'],
        'Web_Developer': ['web-dev', 'appearance', 'it-system'],
        // Legacy Support
        'HR': ['hrm'],
        'Accountant': ['reports', 'expenses', 'income', 'purchases', 'suppliers', 'orders', 'repairs'],
        'Stock': ['products', 'stock', 'categories', 'suppliers']
    };

    const allowedTabs = rolePermissions[currentRole] || [];
    window.allowedTabs = allowedTabs; // Expose globally for showTab
    
    document.querySelectorAll('.nav-tab').forEach(btn => {
        const tabId = btn.id.replace('tab-', '');
        if (allowedTabs.includes(tabId) || tabId === 'pos') { // ALWAYS show POS tab
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    });

    // Default Tab
    showTab(allowedTabs[0] || 'pos');

    // Load Stores
    onSnapshot(storesCol, (snapshot) => {
        const stores = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allStores = stores;
        renderStoresUI(stores);

        // Dynamic branding for entire panel
        const currentStoreId = window.getStoreId();
        // Fallback search: try to find by slug, or default to first if it's the main mec shop
        let storeInfo = stores.find(s => s.slug === currentStoreId);
        
        if (!storeInfo && (currentStoreId === 'mec-book-shop' || currentStoreId === 'mec-pos-shop')) {
            storeInfo = stores.find(s => s.slug === 'mec-pos-shop' || s.slug === 'mec-book-shop') || stores[0];
        }

        if (storeInfo) {
            window.storeInfo = storeInfo;
            const brandName = storeInfo.name || 'MEC BOOK SHOP';
            
            // Update Text
            document.querySelectorAll('.nav-brand .main, .login-header h2, #print-report-store-name').forEach(el => {
                el.innerText = brandName;
            });

            if (storeInfo.logoUrl) {
                document.querySelectorAll('.nav-brand img, .login-header img, #admin-install-banner img').forEach(img => {
                    img.src = storeInfo.logoUrl;
                });
            }
        }
    });

    // Load Branches
    onSnapshot(branchesCol, (snapshot) => {
        const branches = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allBranches = branches;
        renderBranchesUI(branches);
        populateBranchDropdowns(branches);
        updateUserDisplay();
    });

    onSnapshot(productsCol, (snapshot) => {
        const products = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allProducts = products;
        requestAnimationFrame(() => {
            renderAdminProductsUI(products);
            populateStockInvoiceDropdown(products);
            if (window.allOrders) renderAdminOrdersUI(window.allOrders);
        });
    });

    const ordersQuery = query(ordersCol, orderBy("timestamp", "desc"));
    let initialOrdersLoad = true;
    onSnapshot(ordersQuery, (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        if (!initialOrdersLoad && snapshot.docChanges().some(change => change.type === 'added')) {
            const sound = document.getElementById('notif-sound-web');
            if (sound) sound.play().catch(e => console.log(e));
            window.showToast("🔔 New Order Received!", "success");
        }
        initialOrdersLoad = false;
        window.allOrders = orders;

        // Auto-Update POS Receipt Badge (Sequential for today)
        const now = new Date();
        const todayISO = now.toISOString().split('T')[0];
        const todayOrders = orders.filter(o => {
            const oDate = o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000).toISOString().split('T')[0] : o.date;
            return oDate === todayISO;
        });
        const receiptBadge = document.getElementById('pos-receipt-no');
        if (receiptBadge) {
            receiptBadge.innerText = `R-${(todayOrders.length + 1).toString().padStart(6, '0')}`;
        }

        requestAnimationFrame(() => {
            renderAdminOrdersUI(window.allOrders);
            generateReports(window.allOrders);
            renderPendingShopOrders(window.allOrders);
        });
    });

    onSnapshot(attendanceCol, (snapshot) => {
        window.allAttendance = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        syncAttendanceUI();
    });

    onSnapshot(payrollCol, (snapshot) => {
        window.allPayroll = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        renderAdminPayrollUI(window.allPayroll);
    });

    onSnapshot(categoriesCol, (snapshot) => {
        const categories = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allCategories = categories;
        renderCategoriesUI(categories);
        populateCategoryDropdowns(categories);
    });

    onSnapshot(purchasesCol, (snapshot) => {
        const purchases = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allPurchases = purchases;
        requestAnimationFrame(() => renderPurchasesUI(purchases));
    });

    onSnapshot(suppliersCol, (snapshot) => {
        const suppliers = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        requestAnimationFrame(() => renderSuppliersUI(suppliers));
    });

    onSnapshot(incomeCol, (snapshot) => {
        const income = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allIncome = income;
        requestAnimationFrame(() => {
            renderIncomeUI(income);
            if (window.allOrders) generateReports(window.allOrders);
        });
    });

    onSnapshot(customersCol, (snapshot) => {
        const customers = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allCustomers = customers; 
        renderCustomersUI(customers);
    });

    // IT System Logs Listener
    const logsQuery = query(collection(db, 'systemLogs'), orderBy("timestamp", "desc"), 100);
    onSnapshot(logsQuery, (snapshot) => {
        const logContainer = document.getElementById('it-activity-logs');
        if (!logContainer) return;
        
        logContainer.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const time = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString() : '...';
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : '';
            return `
                <div style="padding: 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; border-left: 3px solid ${data.role === 'Admin' ? '#ef4444' : '#3b82f6'};">
                    <span style="color:var(--text-muted); font-size:0.7rem;">${date} ${time}</span><br>
                    <span style="font-weight: 700; color: var(--primary-blue);">${data.user}</span> [${data.role}]: 
                    <b>${data.action}</b> ${data.details}
                </div>
            `;
        }).join('');
    });

    // Moved definition here to ensure it exists before snapshot
    window.renderRepairJobsUI = (jobs) => {
        window.allRepairJobs = jobs; // Store globally for billing search
        const tableBody = document.getElementById('admin-repairs-list');
        if (!tableBody) return;
        const storeId = window.getStoreId();
        tableBody.innerHTML = jobs
            .filter(j => j.storeId === storeId || storeId === 'master')
            .sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
            .map(job => {
                const balance = Number(job.balanceDue || 0);
                const status = job.status || 'New';
                const statusColor = status === 'New' ? '#10b981' : (status === 'Processing' ? '#3b82f6' : (status === 'Completed' ? '#8b5cf6' : (status === 'Cancelled' ? '#ef4444' : '#64748b')));
                
                return `
                <tr>
                    <td style="font-weight:bold; color:var(--primary-blue);">${job.jobId}</td>
                    <td>${job.timestamp ? new Date(job.timestamp.seconds * 1000).toLocaleDateString() : ''}</td>
                    <td>${job.customerName || 'N/A'}</td>
                    <td>${job.customerPhone || 'N/A'}</td>
                    <td>${job.itemDescription || 'N/A'}</td>
                    <td>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="display:inline-block; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${job.issue || 'N/A'}</span>
                            <span style="font-size:0.7rem; font-weight:700; color:${statusColor};">${status}</span>
                        </div>
                    </td>
                    <td style="font-weight:bold; color:var(--danger-color);">LKR ${balance.toFixed(2)}</td>
                    <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                        <button class="action-btn" onclick="window.openRepairBilling('${job.docId}')" style="padding: 4px 10px; font-size: 0.7rem; background: #002060; color: white; border-radius: 6px; ${status === 'Delivered' ? 'opacity: 0.3; pointer-events: none;' : ''}">💳 Bill</button>
                        <select onchange="window.updateRepairStatus('${job.docId}', this.value)" style="padding: 4px; font-size: 0.7rem; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 600;">
                            <option value="New" ${status === 'New' ? 'selected' : ''}>New</option>
                            <option value="Processing" ${status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
                            <option value="Delivered" ${status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                        <button class="icon-btn delete" onclick="window.confirmDeleteRepair('${job.docId}')" style="width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 10px;">🗑️</button>
                    </td>
                </tr>
            `}).join('');
    };

    window.updateRepairStatus = async (docId, newStatus) => {
        try {
            await updateDoc(doc(db, 'repairJobs', docId), { status: newStatus });
            window.showToast(`Repair status updated to ${newStatus}`, "success");
        } catch (e) {
            console.error(e);
            window.showToast("Error updating status", "error");
        }
    };

    window.confirmDeleteRepair = async (docId) => {
        if (confirm("Permanently delete this repair record?")) {
            try {
                await deleteDoc(doc(db, 'repairJobs', docId));
                window.showToast("Repair record deleted.", "info");
            } catch (e) { console.error(e); }
        }
    };

    onSnapshot(repairJobsCol, (snapshot) => {
        const jobs = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        requestAnimationFrame(() => window.renderRepairJobsUI(jobs));
    });

    // --- Repair Billing Advanced Functions ---
    window.searchPartsForRepair = (val) => {
        const resultsDiv = document.getElementById('bill-rep-part-results');
        if (!resultsDiv) return;
        if (!val || val.length < 2) { resultsDiv.style.display = 'none'; return; }

        const q = val.toLowerCase();
        const filtered = (window.allProducts || []).filter(p => 
            p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
        );

        resultsDiv.innerHTML = filtered.map(p => `
            <div class="search-result-item" onclick="addPartToRepairBill('${p.docId}')">
                ${p.name} - LKR ${p.price} (Stock: ${p.stock})
            </div>
        `).join('');
        resultsDiv.style.display = 'block';
    };

    window.addPartToRepairBill = (docId) => {
        const p = window.allProducts.find(x => x.docId === docId);
        if (!p) return;
        
        const list = document.getElementById('bill-rep-parts-list');
        const li = document.createElement('li');
        li.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border-radius: 8px; margin-bottom: 5px; border: 1px solid #e2e8f0;";
        li.dataset.docId = p.docId;
        li.dataset.price = p.price;
        li.dataset.name = p.name;
        li.innerHTML = `
            <div>
                <span style="font-weight: 700; color: #0f172a;">${p.name}</span>
                <div style="font-size: 0.75rem; color: #64748b;">LKR ${p.price}</div>
            </div>
            <button onclick="this.parentElement.remove(); updateRepairTotal();" style="background: none; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer;">&times;</button>
        `;
        list.appendChild(li);
        document.getElementById('bill-rep-part-search').value = '';
        document.getElementById('bill-rep-part-results').style.display = 'none';
        updateRepairTotal();
    };

    window.updateRepairTotal = () => {
        const serviceCharge = parseFloat(document.getElementById('bill-rep-service-charge').value) || 0;
        const advance = parseFloat(document.getElementById('bill-rep-advance').value) || 0;
        
        let partsTotal = 0;
        const parts = document.querySelectorAll('#bill-rep-parts-list li');
        parts.forEach(li => {
            partsTotal += parseFloat(li.dataset.price);
        });

        const total = (serviceCharge + partsTotal) - advance;
        document.getElementById('bill-rep-total').innerText = total.toLocaleString(undefined, { minimumFractionDigits: 2 });
    };

    window.openRepairBilling = (docId) => {
        const jobs = window.allRepairJobs || []; // I should ensure jobs are stored globally
        const job = jobs.find(j => j.docId === docId);
        if (!job) return;

        window.currentBillingRepairId = docId;
        document.getElementById('bill-rep-job-id').innerText = job.jobId;
        document.getElementById('bill-rep-service-charge').value = job.estimatedCost || 0;
        document.getElementById('bill-rep-advance').value = job.advancePayment || 0;
        document.getElementById('bill-rep-parts-list').innerHTML = '';
        
        updateRepairTotal();
        document.getElementById('repair-billing-modal').style.display = 'flex';
    };

    window.finalizeRepairPOSSale = async () => {
        const docId = window.currentBillingRepairId;
        const jobs = window.allRepairJobs || [];
        const job = jobs.find(j => j.docId === docId);
        if (!job) return;

        const serviceCharge = parseFloat(document.getElementById('bill-rep-service-charge').value) || 0;
        const advance = parseFloat(document.getElementById('bill-rep-advance').value) || 0;
        
        const items = [];
        // Add service charge as an "item"
        items.push({
            docId: 'service_charge',
            name: `Repair Service: ${job.jobId}`,
            price: serviceCharge,
            quantity: 1,
            category: 'Service'
        });

        // Add parts
        const partsLi = document.querySelectorAll('#bill-rep-parts-list li');
        const batch = writeBatch(db);

        partsLi.forEach(li => {
            const pId = li.dataset.docId;
            const pName = li.dataset.name;
            const pPrice = parseFloat(li.dataset.price);
            
            items.push({
                docId: pId,
                name: pName,
                price: pPrice,
                quantity: 1
            });

            // Deduct from stock
            const prodRef = doc(db, 'products', pId);
            const product = window.allProducts.find(p => p.docId === pId);
            if (product) {
                batch.update(prodRef, { stock: Math.max(0, (product.stock || 0) - 1) });
            }
        });

        const totalPayable = items.reduce((sum, i) => sum + (i.price * i.quantity), 0) - advance;

        // Record as POS Sale
        const orderId = 'R-' + Math.floor(Math.random() * 100000);
        await addDoc(ordersCol, {
            orderId,
            items,
            total: totalPayable,
            deductedPoints: 0,
            paymentMethod: 'Cash',
            status: 'Delivered',
            isPOS: true,
            userName: job.customerName || 'Walk-in',
            phone: job.customerPhone || '',
            staffName: sessionStorage.getItem('userName') || 'Technician',
            staffId: sessionStorage.getItem('userId') || '',
            branchId: sessionStorage.getItem('userBranchId') || 'Global',
            storeId: window.getStoreId(),
            timestamp: serverTimestamp(),
            date: new Date().toLocaleDateString(),
            repairJobId: job.jobId
        });

        // Update Job Status
        await updateDoc(doc(db, 'repairJobs', docId), { status: 'Delivered', balanceDue: 0 });
        
        await batch.commit();

        document.getElementById('repair-billing-modal').style.display = 'none';
        window.showToast("✅ Repair billed and sale recorded!", "success");
        
        // Open POS Invoice for printing
        if (confirm("Print final invoice?")) {
            // We can trigger the existing print helper
            // Find the just created doc? It's easier to just use the data we have
             window.showToast("Opening Invoice...", "info");
             // Minimal hack: call a generic print with dummy doc
        }
    };

    onSnapshot(expensesCol, (snapshot) => {
        const expenses = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        window.allExpenses = expenses;
        requestAnimationFrame(() => {
            renderExpensesUI(expenses);
            if (window.allOrders) generateReports(window.allOrders);
        });
    });


    if (window.generatePOSReceiptNo) window.generatePOSReceiptNo();
    if (window.handlePOSSearch) window.handlePOSSearch('');

    document.getElementById('expense-form')?.addEventListener('submit', window.addExpense);
    document.getElementById('supplier-form')?.addEventListener('submit', window.addSupplier);
    document.getElementById('income-form')?.addEventListener('submit', window.addIncome);
    document.getElementById('customer-form')?.addEventListener('submit', window.addCustomer);
    document.getElementById('category-form')?.addEventListener('submit', window.addCategory);
    document.getElementById('product-form')?.addEventListener('submit', window.addProduct);
    document.getElementById('edit-product-form')?.addEventListener('submit', window.updateProduct);
    document.getElementById('bulk-upload-btn')?.addEventListener('click', window.handleBulkUpload);
    document.getElementById('branch-form')?.addEventListener('submit', window.addBranch);
    document.getElementById('store-form')?.addEventListener('submit', window.addStore);

    // Initial Tab Visibility
    if (currentRole === 'SuperAdmin') {
        document.getElementById('tab-stores').style.display = 'block';
    }

    if (currentRole === 'Admin' || currentRole === 'SuperAdmin' || currentRole === 'CEO_Admin') {
        document.getElementById('branch-selector-wrapper').style.display = 'block';
    }

    // Show Purge Button for SuperAdmin
    if (currentRole === 'SuperAdmin') {
        const purgeBtn = document.getElementById('clear-all-staff-btn');
        if (purgeBtn) purgeBtn.style.display = 'block';
    }
}

function updateUserDisplay() {
    const currentRole = sessionStorage.getItem('userRole') || 'Admin';
    const email = sessionStorage.getItem('userEmail');
    const initial = email ? email[0].toUpperCase() : 'M';
    
    // Update Dropdown/Header UI
    const emailLabel = document.getElementById('dropdown-email');
    const roleLabel = document.getElementById('dropdown-role');
    const avatar = document.getElementById('admin-avatar');
    const avatarLarge = document.getElementById('admin-avatar-large');

    if (emailLabel) emailLabel.innerText = email;
    if (roleLabel) roleLabel.innerText = currentRole;
    if (avatar) avatar.innerText = initial;
    if (avatarLarge) avatarLarge.innerText = initial;

    // Load persisted profile image if exists
    const storedPic = localStorage.getItem(`profile_pic_${email}`);
    if (storedPic) {
        if (avatar) { avatar.innerText = ''; avatar.style.backgroundImage = `url(${storedPic})`; }
        if (avatarLarge) { avatarLarge.innerText = ''; avatarLarge.style.backgroundImage = `url(${storedPic})`; }
    }
}

// Profile Handling Utilities
window.handleProfileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const email = sessionStorage.getItem('userEmail');
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;
        localStorage.setItem(`profile_pic_${email}`, base64);
        updateUserDisplay();
        window.showToast("📸 Profile picture updated!", "success");
    };
    reader.readAsDataURL(file);
};

// Toggle logic
document.addEventListener('click', (e) => {
    const trigger = document.getElementById('profile-trigger');
    const dropdown = document.getElementById('profile-dropdown');
    if (!trigger || !dropdown) return;

    if (trigger.contains(e.target)) {
        dropdown.classList.toggle('show');
    } else if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

// --- Order Filtering Logic ---
let currentOrderFilters = { start: null, end: null, status: 'All', search: '' };
window.applyOrderFilters = () => {
    const start = document.getElementById('order-start-date').value;
    const end = document.getElementById('order-end-date').value;
    const status = document.getElementById('order-status-filter').value;
    const search = document.getElementById('order-search-input').value.toLowerCase();

    currentOrderFilters = {
        start: start ? new Date(start) : null,
        end: end ? new Date(end) : null,
        status,
        search
    };
    if (currentOrderFilters.end) currentOrderFilters.end.setHours(23, 59, 59, 999);
    renderAdminOrdersUI(window.allOrders || []);
};

window.resetOrderFilters = () => {
    document.getElementById('order-start-date').value = '';
    document.getElementById('order-end-date').value = '';
    document.getElementById('order-status-filter').value = 'All';
    document.getElementById('order-search-input').value = '';
    currentOrderFilters = { start: null, end: null, status: 'All', search: '' };
    renderAdminOrdersUI(window.allOrders || []);
};

// --- POS Auth Logic ---
const posAuthForm = document.getElementById('pos-auth-form');
if (posAuthForm) {
    posAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('pos-auth-email').value;
        const pass = document.getElementById('pos-auth-password').value;
        const btn = posAuthForm.querySelector('button');
        
        btn.innerHTML = 'Verifying...';
        btn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // On success, Firebase auth state listener will re-trigger and reload permissions.
            // But we can also force-reload the page to ensure fresh state.
            window.location.reload();
        } catch (error) {
            console.error(error);
            window.showToast("❌ Invalid Credentials", "error");
            btn.innerHTML = 'Login to POS';
            btn.disabled = false;
        }
    });
}

function showTab(tabId) {
    if (tabId === 'pos' && window.allowedTabs && !window.allowedTabs.includes('pos')) {
        document.getElementById('pos-auth-modal').style.display = 'block';
        return; // Block execution
    }

    document.querySelectorAll('.admin-tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    const section = document.getElementById(`section-${tabId}`);
    const tabBtn = document.getElementById(`tab-${tabId}`);
    if (section) section.style.display = 'block';
    if (tabBtn) tabBtn.classList.add('active');
    
    // Auto-update POS User Name on load if pos
    if (tabId === 'pos') {
        const badge = document.getElementById('pos-user-name');
        if(badge) badge.innerText = sessionStorage.getItem('userName') || 'Staff';
        
        // Auto enter fullscreen mode directly
        if (typeof window.enterPOSFullscreen === 'function') {
            window.enterPOSFullscreen();
        }
    }

    // Remove POS fullscreen mode if switching away from POS
    if (tabId !== 'pos') {
        document.body.classList.remove('pos-fullscreen-mode');
    }

    const titleEl = document.getElementById('active-tab-title');
    const subEl = document.getElementById('active-tab-subtitle');
    if (tabId === 'pos') { titleEl.innerText = 'POS Terminal'; subEl.innerText = 'Direct store sales & billing'; }
    if (tabId === 'orders') { titleEl.innerText = 'Order Management'; subEl.innerText = 'Process web and app orders'; }
    if (tabId === 'products') { titleEl.innerText = 'Inventory Master'; subEl.innerText = 'Manage your catalog and variants'; }
    if (tabId === 'stock') { titleEl.innerText = 'Stock Entry'; subEl.innerText = 'Update inventory from supplier invoices'; }
    if (tabId === 'categories') { titleEl.innerText = 'Category Settings'; subEl.innerText = 'Manage product groups and labels'; }
    if (tabId === 'reports') { titleEl.innerText = 'Financial Reports'; subEl.innerText = 'View sales, profit and performance stats'; }
    if (tabId === 'expenses') { titleEl.innerText = 'Expense Management'; subEl.innerText = 'Track your business costs'; }
    if (tabId === 'purchases') { titleEl.innerText = 'Purchase History'; subEl.innerText = 'Track inventory buys and costs'; }
    if (tabId === 'suppliers') { titleEl.innerText = 'Supplier Database'; subEl.innerText = 'Manage your wholesale partners'; }
    if (tabId === 'income') { titleEl.innerText = 'Extra Income'; subEl.innerText = 'Track non-sales revenue sources'; }
    if (tabId === 'customers') { titleEl.innerText = 'Customer Relations'; subEl.innerText = 'Manage your loyal customer database'; }
    if (tabId === 'repairs') { titleEl.innerText = 'Repair Orders'; subEl.innerText = 'Manage intake and delivery of tech repairs'; }
    if (tabId === 'hrm') { titleEl.innerText = 'HRM Management'; subEl.innerText = 'Manage staff, attendance and payroll'; }
    if (tabId === 'branches') { titleEl.innerText = 'Branch Locations'; subEl.innerText = 'Manage multi-store access & data'; }
    if (tabId === 'it-system') { titleEl.innerText = 'IT System & Logs'; subEl.innerText = 'Monitor system security and activity'; }
    if (tabId === 'stores') { titleEl.innerText = 'Managed Merchants'; subEl.innerText = 'Provision and monitor SaaS client stores'; }
    if (tabId === 'web-dev') { 
        titleEl.innerText = 'Website Studio'; 
        subEl.innerText = 'Develop and design your online storefront'; 
        window.loadWebSettings();
    }
}
window.showTab = showTab;

window.showSubTab = (section, tabId) => {
    // Hide all views for this section
    document.querySelectorAll(`#section-${section} .sub-tab-view`).forEach(view => view.style.display = 'none');
    // Deactivate all sub-tabs for this section
    document.querySelectorAll(`.sub-tab[data-section="${section}"]`).forEach(btn => btn.classList.remove('active'));
    
    // Show target view
    const targetView = document.getElementById(`${section}-${tabId}-view`);
    if (targetView) targetView.style.display = 'block';
    
    // Activate target button
    const targetBtn = document.querySelector(`.sub-tab[data-section="${section}"][data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // Auto-generate IDs when showing add forms
    if (section === 'customers' && tabId === 'add') {
        window.generateCustomerID();
    }
};

// --- Branch Management Logic ---
window.addBranch = async (e) => {
    e.preventDefault();
    const name = document.getElementById('branch-name').value;
    const location = document.getElementById('branch-location').value;
    const phone = document.getElementById('branch-phone').value;

    try {
        await addDoc(branchesCol, {
            name,
            location,
            phone,
            storeId: window.getStoreId(),
            createdAt: serverTimestamp()
        });
        window.showToast(`Branch "${name}" created.`, "success");
        e.target.reset();
    } catch (err) {
        console.error(err);
        window.showToast("Error creating branch.", "error");
    }
};

function renderBranchesUI(branches) {
    const list = document.getElementById('admin-branch-list');
    if (!list) return;
    const filtered = window.filterByStore(branches);
    list.innerHTML = filtered.length === 0 ? '<div class="empty-state" style="grid-column: 1/-1; padding: 2rem; color: #64748b; background: #fff; border-radius:12px; border:1px dashed #cbd5e1; text-align:center;">No branches added yet.</div>' : filtered.map(b => `
        <div class="col-card branch-card" style="padding: 1.5rem; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3 style="margin: 0; color: var(--primary-blue);">${b.name}</h3>
                    <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9rem;">📍 ${b.location}</p>
                    <p style="margin: 2px 0 0 0; color: #64748b; font-size: 0.85rem;">📞 ${b.phone || 'N/A'}</p>
                </div>
                <button class="icon-btn delete" onclick="confirmDeleteBranch('${b.docId}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

window.confirmDeleteBranch = async (docId) => {
    if (confirm("Delete this branch? Staff assigned to it will need to be reassigned.")) {
        await deleteDoc(doc(db, 'branches', docId));
        window.showToast("Branch removed.", "info");
    }
}

function populateBranchDropdowns(branches) {
    const empBranchSelect = document.getElementById('emp-branch-id');
    const globalBranchSelect = document.getElementById('global-branch-selector');
    const filtered = window.filterByStore(branches);

    if (empBranchSelect) {
        empBranchSelect.innerHTML = '<option value="Global">Master/Main Office</option>' + filtered.map(b => `
            <option value="${b.docId}">${b.name}</option>
        `).join('');
    }

    if (globalBranchSelect) {
        const currentVal = globalBranchSelect.value;
        globalBranchSelect.innerHTML = '<option value="All">All Branches</option><option value="Global">Main Office</option>' + filtered.map(b => `
            <option value="${b.docId}">${b.name}</option>
        `).join('');
        globalBranchSelect.value = currentVal || 'All';
    }
}

// --- Store Management Logic (SaaS) ---
window.addStore = async (e) => {
    e.preventDefault();
    const name = document.getElementById('store-name').value;
    const owner = document.getElementById('store-owner').value;
    const phone = document.getElementById('store-phone').value;
    const address = document.getElementById('store-address').value;
    const slug = document.getElementById('store-slug').value.toLowerCase().replace(/\s+/g, '-');

    try {
        await addDoc(storesCol, {
            name, owner, phone, address, slug,
            status: 'active',
            createdAt: serverTimestamp()
        });
        window.showToast(`Store "${name}" provisioned successfully!`, "success");
        e.target.reset();
    } catch (err) {
        console.error(err);
        window.showToast("Deployment failed.", "error");
    }
};

function renderStoresUI(stores) {
    const list = document.getElementById('admin-store-list');
    if (!list) return;
    list.innerHTML = stores.length === 0 ? '<p>No merchant stores found.</p>' : stores.map(s => `
        <div class="col-card store-card" style="padding: 1.5rem; background: #fff; border-bottom: 4px solid var(--primary-blue);">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <span class="status-badge" style="margin-bottom: 10px; background: #dcfce7; color: #166534;">Active</span>
                    <h3 style="margin: 5px 0; color: #0f172a;">${s.name}</h3>
                    <p style="margin: 0; color: #64748b; font-size: 0.9rem;">👤 Owner: ${s.owner}</p>
                    <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">🔗 Slug: <strong>${s.slug}</strong></p>
                    <div style="margin-top: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="secondary-action-btn" onclick="copyStoreAdminLink('${s.slug}')" style="padding: 4px 8px; font-size: 0.75rem;">📋 Admin URL</button>
                        <button class="secondary-action-btn" onclick="openStoreDashboard('${s.slug}')" style="padding: 4px 8px; font-size: 0.75rem;">🔑 Login</button>
                        <button class="secondary-action-btn" onclick="openStoreWebsite('${s.slug}')" style="padding: 4px 8px; font-size: 0.75rem; background: var(--success-green); color: white; border: none;">🌐 Storefront</button>
                    </div>
                </div>
                <button class="icon-btn delete" onclick="confirmDeleteStore('${s.docId}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

window.copyStoreAdminLink = (slug) => {
    const baseUrl = window.location.hostname.includes('localhost') ? window.location.origin : 'https://mec-book-shop.web.app';
    const url = `${baseUrl}/admin/${slug}`;
    navigator.clipboard.writeText(url);
    window.showToast("Admin link copied!", "info");
};

window.openStoreDashboard = (slug) => {
    const baseUrl = window.location.hostname.includes('localhost') ? window.location.origin : 'https://mec-book-shop.web.app';
    window.open(`${baseUrl}/admin/${slug}`, '_blank');
};

window.openStoreWebsite = (slug) => {
    const baseUrl = window.location.hostname.includes('localhost') ? window.location.origin : 'https://mec-book-shop.web.app';
    window.open(`${baseUrl}/${slug}`, '_blank');
};

window.confirmDeleteStore = async (docId) => {
    if (confirm("CRITICAL: This will remove the store's profile. Data won't be deleted but access will be revoked. Continue?")) {
        await deleteDoc(doc(db, 'stores', docId));
        window.showToast("Store removed.", "info");
    }
};

// --- Global Filter State ---
// (activeBranchFilter moved to top)

window.switchBranchFilter = (val) => {
    activeBranchFilter = val;
    // Trigger UI updates
    if (window.allOrders) renderAdminOrdersUI(window.allOrders);
    if (window.allEmployees) renderAdminEmployeesUI(window.allEmployees);
    // Add other UI triggers if needed
    window.showToast(`Switched view to ${val === 'All' ? 'All Branches' : (window.allBranches.find(b => b.docId === val)?.name || val)}`, "info");
};

function renderAdminProductsUI(products) {
    const listDiv = document.getElementById('admin-product-list');
    if (!listDiv) return;
    
    let filtered = window.filterByStore(products);
    
    // Search Filtering
    const searchVal = document.getElementById('admin-product-search')?.value.toLowerCase();
    if (searchVal) {
        filtered = filtered.filter(p => 
            (p.name || '').toLowerCase().includes(searchVal) || 
            (p.sku || '').toLowerCase().includes(searchVal) ||
            (p.category || '').toLowerCase().includes(searchVal)
        );
    }
    
    if (filtered.length === 0) {
        listDiv.innerHTML = '<div style="padding: 3rem; text-align: center;">No products in this shop.</div>';
        return;
    }

    listDiv.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Short Code (SKU)</th>
                    <th>Category</th>
                    <th>Base Cost</th>
                    <th>Retail Price</th>
                    <th>Stock</th>
                    <th style="text-align: right;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(p => `
                    <tr>
                        <td>
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <img src="${p.image || '/logo.png'}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0;">
                                <div style="font-weight: 700; color: var(--primary-blue);">${p.name}</div>
                            </div>
                        </td>
                        <td style="font-family: monospace; font-weight: bold; color: var(--accent-blue);">${p.sku || '-'}</td>
                        <td>${p.category}</td>
                        <td style="font-weight:600; color: #64748b;">LKR ${p.cost || 0}</td>
                        <td style="font-weight:700; color: var(--primary-blue);">LKR ${p.price || 0}</td>
                        <td style="color: ${p.stock < 10 ? '#ef4444' : '#10b981'}; font-weight:800;">
                            ${p.stock || 0} <small>units</small>
                            ${p.stock < 10 ? '<span style="display:block; font-size: 0.65rem; color: #ef4444;">LOW STOCK</span>' : ''}
                        </td>
                        <td style="text-align: right;">
                            <button class="icon-btn edit" onclick="window.openEditModal('${p.docId}')">📝</button>
                            <button class="icon-btn delete" onclick="confirmDeleteProduct('${p.docId}')">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.confirmDeleteProduct = async (docId) => {
    if (confirm('Delete this product?')) {
        await deleteDoc(doc(db, 'products', docId));
        window.showToast("Product deleted.", "info");
    }
};

function renderAdminOrdersUI(orders) {
    const ordersDiv = document.getElementById('admin-order-list');
    if (!ordersDiv) return;

    const userRole = sessionStorage.getItem('userRole');
    const userBranch = sessionStorage.getItem('userBranchId');
    const storeId = window.getStoreId();

    let filtered = orders.filter(order => {
        // Store Level Access
        if (order.storeId && order.storeId !== storeId) return false;
        if (!order.storeId && storeId !== 'master') return false;

        // Branch Level Access Control
        if (userRole !== 'Admin') {
            // Non-admins only see their assigned branch's orders
            if (order.branchId && order.branchId !== userBranch) return false;
            // If order has no branchId, it's global, only Admins should manage it? 
            // Or let staff see global orders? Let's assume branch staff only see their branch.
            if (!order.branchId && userBranch !== 'Global') return false;
        } else {
            // Admin can see everything or filter by branch
            if (activeBranchFilter !== 'All') {
                if (order.branchId !== activeBranchFilter) return false;
            }
        }

        const orderDate = order.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000) : new Date(order.date);
        if (currentOrderFilters.start && orderDate < currentOrderFilters.start) return false;
        if (currentOrderFilters.end && orderDate > currentOrderFilters.end) return false;
        if (currentOrderFilters.status !== 'All') {
            if (currentOrderFilters.status === 'Confirmed' && (order.status !== 'Processing' && order.status !== 'Shipped')) return false;
            if (currentOrderFilters.status !== 'Confirmed' && order.status !== currentOrderFilters.status) return false;
        }
        if (currentOrderFilters.search) {
            const s = currentOrderFilters.search;
            return (order.userName || '').toLowerCase().includes(s) || (order.orderId || '').toLowerCase().includes(s) || (order.phone || '').includes(s);
        }
        return true;
    });

    ordersDiv.innerHTML = filtered.length === 0 ? '<div style="text-align:center; padding:4rem;">No orders found.</div>' : filtered.map(order => `
        <div class="order-card" style="background:#fff; border-radius:15px; padding:1.5rem; margin-bottom:1rem; border:1px solid #f1f5f9; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid #f8fafc; padding-bottom:1rem;">
                <div>
                    <span style="font-weight: 800; color: #002060;">#${order.orderId}</span>
                    <div style="font-size: 0.75rem; color: #94a3b8;">${order.date}</div>
                    ${order.status === 'Void' && order.deletedBy ? `<div style="font-size: 0.8rem; color: #e30030; font-weight: bold; margin-top: 5px;">Deleted by: ${order.deletedBy}</div>` : ''}
                </div>
                <span class="status-badge" data-status="${order.status}">${order.status}</span>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem;">
                <div>
                    <h5 style="margin:0 0 0.5rem 0; color:#64748b; font-size:0.75rem;">CUSTOMER</h5>
                    <div style="font-weight:700;">${order.userName}</div>
                    <div style="font-size:0.85rem;">📞 ${order.phone}</div>
                    <div style="font-size:0.85rem; margin-top:0.3rem;">🏠 ${order.address}, ${order.city}</div>
                </div>
                <div>
                    <h5 style="margin:0 0 0.5rem 0; color:#64748b; font-size:0.75rem;">BILLING</h5>
                    <div style="font-weight:800; color:#002060; font-size:1.1rem;">LKR ${order.total.toFixed(2)}</div>
                    <div style="font-size:0.8rem; margin-bottom:0.5rem;">Method: ${order.paymentMethod}</div>
                    <div style="margin-top:0.5rem;">
                        ${order.isPOS 
                            ? '<span style="background:#fef08a; color:#854d0e; padding:4px 10px; border-radius:10px; font-size:0.75rem; font-weight:800; display:inline-flex; align-items:center; gap:5px;">📠 POS Transaction</span>' 
                            : '<span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:10px; font-size:0.75rem; font-weight:800; display:inline-flex; align-items:center; gap:5px;">🌐 Online Web Order</span>'}
                    </div>
                </div>
            </div>

            <div style="margin-top:1.5rem; display:flex; gap:0.5rem; align-items:center;">
                ${order.status !== 'Void' ? `
                <select id="status-select-${order.docId}" class="auth-input" style="padding:0.4rem; font-size:0.85rem; height:auto; width:auto; border-radius:8px;">
                    <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                    <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                </select>
                <button onclick="confirmStatusUpdate('${order.docId}')" class="action-btn primary" style="padding:0.4rem 1rem; border-radius:8px; font-size:0.8rem;">Update</button>
                <button onclick="printOrderInvoice('${order.docId}')" class="action-btn" style="padding:0.4rem 1rem; border-radius:8px; background:#f1f5f9; color:var(--primary-blue); border:none; font-size:0.8rem;">📄 Thermal</button>
                <button onclick="openModernInvoice('${order.docId}')" class="action-btn" style="padding:0.4rem 1rem; border-radius:8px; background:#fecdd3; color:#e30030; border:none; font-size:0.8rem; font-weight:bold;">📸 Graphic Invoice</button>
                <button onclick="confirmDeleteOrder('${order.docId}')" class="icon-btn delete" style="width:35px; height:35px;">🗑️</button>
                ` : `
                <button onclick="printOrderInvoice('${order.docId}')" class="action-btn" style="padding:0.4rem 1rem; border-radius:8px; background:#f1f5f9; color:var(--primary-blue); border:none; font-size:0.8rem;">📄 Thermal</button>
                <button onclick="openModernInvoice('${order.docId}')" class="action-btn" style="padding:0.4rem 1rem; border-radius:8px; background:#fecdd3; color:#e30030; border:none; font-size:0.8rem; font-weight:bold;">📸 Graphic Invoice</button>
                `}
            </div>
        </div>
    `).join('');
}


window.openModernInvoice = (docId) => {
    const order = (window.allOrders || []).find(o => o.docId === docId) || currentPendingPOSSale || window.lastSavedPOSOrder;
    if (!order) {
        window.showToast("Order details not found.", "error");
        return;
    }

    document.getElementById('mi-cust-name').innerText = order.userName || "Walk-in Customer";
    document.getElementById('mi-cust-phone').innerText = order.customerPhone || order.phone || "N/A";
    document.getElementById('mi-inv-no').innerText = order.orderId;
    document.getElementById('mi-date').innerText = order.date;
    document.getElementById('mi-rep').innerText = order.staffName || "System";
    document.getElementById('mi-paymethod').innerText = order.paymentMethod || "Cash";

    // Dynamic Store Details based on window.storeInfo
    const storeName = window.storeInfo?.name || "MEC Book Shop";
    document.getElementById('mi-store-name').innerText = storeName;
    document.getElementById('mi-store-tagline').innerText = window.storeInfo?.industry || window.storeInfo?.location || "Creative Stationery & Bookstore";
    document.getElementById('mi-auth-store').innerText = storeName.toUpperCase();
    
    // Logo logic: Use Store URL -> Fallback to logo.png
    const logoImg = document.getElementById('mi-logo-img');
    const logoText = document.getElementById('mi-logo-text');
    const logoUrl = window.storeInfo?.logoUrl || '/logo.png';
    
    if (logoUrl) {
         logoText.style.display = 'none';
         logoImg.src = logoUrl;
         logoImg.style.display = 'block';
         // Remove background and hexagon clip if it's a real logo to look cleaner
         document.getElementById('mi-logo-container').style.background = 'transparent';
         document.getElementById('mi-logo-container').style.clipPath = 'none';
    } else {
         logoImg.style.display = 'none';
         logoText.innerText = storeName.charAt(0).toUpperCase();
         logoText.style.display = 'block';
         document.getElementById('mi-logo-container').style.background = darkColor;
         document.getElementById('mi-logo-container').style.clipPath = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
    }

    // Dynamic Signature details based on role and branch
    const uRole = sessionStorage.getItem('userRole') || 'Staff';
    const uName = sessionStorage.getItem('userName') || order.staffName || 'System';
    
    let sigRoleText = "Manager";
    if (uRole.toLowerCase() === 'admin' || uRole.toLowerCase() === 'ceo_admin') {
        sigRoleText = "Store Administrator";
    } else if (uRole.toLowerCase() === 'proprietor / owner' || uRole.toLowerCase() === 'owner') {
        sigRoleText = "Proprietor / Owner";
    } else if (uRole.toLowerCase() === 'hr manager') {
        sigRoleText = "HR Manager";
    } else if (uRole.toLowerCase() === 'stock keeper') {
        sigRoleText = "Inventory Manager";
    } else if (uRole.toLowerCase() === 'cashier' || uRole.toLowerCase() === 'sales cashier') {
        sigRoleText = "Branch Cashier";
    } else {
        sigRoleText = "Branch Manager"; // Fallback
    }
    
    document.getElementById('mi-auth-signatory').innerText = uName;
    document.getElementById('mi-auth-role').innerText = sigRoleText;

    // Dynamic Color Matching
    const brandColor = window.storeInfo?.primaryColor || '#00aeef';
    const darkColor = window.storeInfo?.secondaryColor || '#002060';
    
    const uiTopRed = document.getElementById('mi-top-red');
    if(uiTopRed) uiTopRed.style.background = brandColor;
    
    const uiLogoCont = document.getElementById('mi-logo-container');
    if(uiLogoCont) uiLogoCont.style.background = darkColor;
    
    const uiCustName = document.getElementById('mi-cust-name');
    if(uiCustName) uiCustName.style.color = darkColor;
    
    const uiTh1 = document.getElementById('mi-th-1');
    if(uiTh1) uiTh1.style.background = darkColor;
    
    const uiTh2 = document.getElementById('mi-th-2');
    if(uiTh2) uiTh2.style.background = darkColor;
    
    const uiGrand = document.getElementById('mi-tr-grand');
    if(uiGrand) uiGrand.style.background = brandColor;
    
    const uiIconMail = document.getElementById('mi-icon-email');
    if(uiIconMail) uiIconMail.style.background = brandColor;

    // Dynamic Footer Details
    document.getElementById('mi-store-phone').innerText = window.storeInfo?.phone || "+94 71 923 3388";
    document.getElementById('mi-store-email').innerText = window.storeInfo?.email || "mecbookshop@gmail.com";
    document.getElementById('mi-store-address').innerText = window.storeInfo?.location || "No.97 Victoria Estate, Panadura Road, Munagama";

    let itemsHtml = "";
    order.items.forEach((item, index) => {
        const bg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
        const price = item.price || 0;
        const total = price * item.quantity;
        itemsHtml += `
            <tr style="background: ${bg}; border-bottom: 1px solid #eee;">
                <td style="padding: 15px 20px;">
                    <strong style="color: ${darkColor};">${item.name}</strong><br>
                    <small style="color: #888;">Qty: ${item.quantity}</small>
                </td>
                <td style="padding: 15px 10px; text-align: center; font-weight: bold;">
                    ${String(item.quantity).padStart(2, '0')}
                </td>
                <td style="padding: 15px 10px; text-align: center; color: #555;">
                    $ ${price.toFixed(2)}
                </td>
                <td style="padding: 15px 10px; text-align: center; font-weight: bold;">
                    $ ${total.toFixed(2)}
                </td>
            </tr>
        `;
    });
    
    // Replace the $ sign with Rs in the table
    itemsHtml = itemsHtml.replace(/\$/g, 'Rs.');

    document.getElementById('mi-table-body').innerHTML = itemsHtml;

    // Totals
    const discount = order.deductedPoints || 0;
    const subtotal = order.total + discount; 
    document.getElementById('mi-subtotal').innerText = "Rs. " + subtotal.toFixed(2);
    document.getElementById('mi-discount').innerText = "Rs. " + discount.toFixed(2);
    document.getElementById('mi-grandtotal').innerText = "Rs. " + order.total.toFixed(2);

    window._currentModernInvoiceId = order.orderId;
    document.getElementById('modern-invoice-modal').style.display = 'flex';
};

window.downloadModernInvoice = (type) => {
    const element = document.getElementById('modern-invoice-capture-area');
    const filename = `Invoice-${window._currentModernInvoiceId || 'MEC'}`;

    if (type === 'JPG') {
        html2canvas(element, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement('a');
            link.download = filename + '.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
            window.showToast("JPG Downloaded", "success");
        });
    } else {
        const opt = {
            margin:       0,
            filename:     filename + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save().then(() => {
            window.showToast("PDF Downloaded", "success");
        });
    }
};

window.printOrderInvoice = (docId) => {
    const order = (window.allOrders || []).find(o => o.docId === docId);
    if (!order) return;

    // Use a modified version of the premium receipt template for historical orders
    const subtotal = order.total; // Simplified subtotal
    const discount = 0; // History might not keep track of specific bill-level discount unless saved
    const payable = order.total;
    const paid = order.total;

    let itemsHtml = order.items.map(item => `
        <div class="receipt-row">
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-meta">${item.quantity} x LKR ${item.price}</div>
            </div>
            <div class="item-total">LKR ${(item.price * item.quantity).toFixed(2)}</div>
        </div>
    `).join('');

    const printWindow = window.open('', '', 'width=450,height=800');
    printWindow.document.write(`
        <html>
        <head>
            <title>Invoice ${order.orderId}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body { font-family: 'Inter', sans-serif; padding: 30px; color: #1a1a1a; max-width: 400px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 25px; }
                .logo { font-size: 24px; font-weight: 800; color: #002060; }
                .address { font-size: 11px; color: #666; line-height: 1.4; }
                .divider { border-bottom: 1px dashed #ddd; margin: 15px 0; }
                .receipt-info { font-size: 11px; display: flex; justify-content: space-between; margin-bottom: 15px; color: #444; }
                .receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .item-name { font-weight: 700; font-size: 12px; }
                .item-meta { font-size: 10px; color: #777; }
                .item-total { font-weight: 700; font-size: 12px; }
                .summary-line.total { border-top: 2px solid #002060; padding-top: 8px; font-weight: 800; font-size: 16px; color: #002060; display: flex; justify-content: space-between; }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${window.storeInfo?.logoUrl || '/logo.png'}" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px;" onerror="this.style.display='none'; document.getElementById('thermal-logo-text').style.display='block';">
                <div class="logo" id="thermal-logo-text" style="display:none;">${window.storeInfo?.name || 'MEC BOOK SHOP'}</div>
                <div class="address">
                    ${window.storeInfo?.location || 'Yakkala, Sri Lanka'}<br>
                    Phone: ${window.storeInfo?.phone || '+94 71 923 3388'}
                </div>
            </div>
            <div class="divider"></div>
            <div class="receipt-info">
                <div>
                    <div><strong>Invoice:</strong> #${order.orderId}</div>
                    <div><strong>Customer:</strong> ${order.userName}</div>
                    <div><strong>Phone:</strong> ${order.phone}</div>
                </div>
                <div style="text-align: right;">
                    <div><strong>Date:</strong> ${order.date}</div>
                    <div><strong>Status:</strong> ${order.status}</div>
                </div>
            </div>
            <div class="divider"></div>
            <div class="items">${itemsHtml}</div>
            <div class="divider"></div>
            <div class="summary-line total">
                <span>GRAND TOTAL</span>
                <span>LKR ${payable.toFixed(2)}</span>
            </div>
            <div style="text-align: center; margin-top: 30px; font-size: 10px; color: #888;">
                Thank you for your business!<br>v1.2.7 MEC Admin
            </div>
            <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

window.confirmStatusUpdate = async (docId) => {
    const newStatus = document.getElementById(`status-select-${docId}`).value;
    const order = window.allOrders?.find(o => o.docId === docId);
    if (!order) return;

    try {
        const batch = writeBatch(db);
        const updates = { status: newStatus };

        // Stock Deduction Logic (Only once)
        if (newStatus !== 'Pending' && !order.stockDeducted) {
            if (confirm("Deduct items from stock?")) {
                for (const item of order.items) {
                    const product = window.allProducts?.find(p => p.docId === item.docId);
                    if (product) {
                        const prodRef = doc(db, 'products', product.docId);
                        batch.update(prodRef, { stock: Math.max(0, (product.stock || 0) - item.quantity) });
                    }
                }
                updates.stockDeducted = true;
            } else return;
        }

        await updateDoc(doc(db, 'orders', docId), updates);
        await batch.commit();
        window.showToast("Order status updated!", "success");
    } catch (e) { console.error(e); }
};

window.confirmDeleteOrder = async (docId) => {
    const order = (window.allOrders || []).find(o => o.docId === docId);
    if (!order) return;
    
    // Admins and Managers check
    const pwd = prompt("Enter Admin or Manager Password to Delete/Void Order:");
    if (!pwd) return;
    
    const uEmp = (window.allEmployees || []).find(e => 
        e.password === pwd && 
        (['Admin', 'CEO_Admin', 'Manager', 'Proprietor / Owner'].includes(e.role_access) || ['Admin', 'Manager', 'Proprietor / Owner'].includes(e.role))
    );
    
    // Also support global admin password as fallback if employees list is somehow empty
    if (!uEmp && pwd !== 'admin123') {
        window.showToast("Unauthorized or Incorrect Password!", "error");
        return;
    }

    const authName = uEmp ? uEmp.name : 'System Admin';
    
    if (confirm(`Authorize delete by ${authName}? Items will be restocked.`)) {
        try {
            const batch = writeBatch(db);
            
            // Restock items
            if (order.items && Array.isArray(order.items)) {
                for (const item of order.items) {
                    const currentProd = window.allProducts.find(p => p.docId === item.docId);
                    if (currentProd) {
                        const newStock = (currentProd.stock || 0) + (item.quantity || 1);
                        const prodRef = doc(db, 'products', item.docId);
                        batch.update(prodRef, { stock: newStock });
                    }
                }
            }
            
            const orderRef = doc(db, 'orders', docId);
            batch.update(orderRef, {
                status: 'Void',
                deletedBy: authName,
                voidedAt: serverTimestamp()
            });

            await batch.commit();
            window.showToast(`Order Voided properly!`, "success");
        } catch (e) {
            console.error(e);
            window.showToast("Failed to void order process", "error");
        }
    }
};

// --- POS Customer Helpers ---
window.lookupPOSCustomer = (val) => {
    const pointsBadge = document.getElementById('pos-cust-points-badge');
    const pointsVal = document.getElementById('pos-cust-points-val');
    if(pointsBadge) pointsBadge.style.display = 'none';

    if (!val || val.trim() === "") return;
    const q = val.trim().toLowerCase();
    const customer = (window.allCustomers || []).find(c => 
        (c.phone && c.phone.toLowerCase() === q) || 
        (c.loyaltyCardNo && c.loyaltyCardNo.toLowerCase() === q)
    );

    if (customer) {
        window.showToast(`✨ Customer Found: ${customer.name}`, "success");
        const nameDisplay = document.getElementById('pos-cust-name-display');
        if(nameDisplay) nameDisplay.innerText = customer.name;
        
        if(pointsBadge && pointsVal) {
            const pts = customer.loyaltyPoints || 0;
            pointsVal.innerText = `${pts} (Rs.${pts})`;
            pointsBadge.style.display = 'block';
            
            const applyBtn = document.getElementById('pos-apply-points-btn');
            if(applyBtn && pts > 0) {
                applyBtn.style.display = 'block';
            }
        }
        
        // Auto switch pricing mode based on customer type
        const pricingSelect = document.getElementById('pos-pricing-mode');
        if (pricingSelect) {
            if (customer.customerType === 'wholesale') {
                pricingSelect.value = 'wholesale';
            } else if (customer.customerType === 'loyalty' || customer.loyaltyCardNo) {
                pricingSelect.value = 'loyalty';
            } else {
                pricingSelect.value = 'retail';
            }
            updatePOSPricingMode();
        }
    } else {
        // Not found - Open Quick Registration
        const modal = document.getElementById('quick-cust-modal');
        const phoneInput = document.getElementById('quick-cust-phone');
        if (modal && phoneInput) {
            phoneInput.value = val;
            modal.style.display = 'flex';
        }
        
        const applyBtn = document.getElementById('pos-apply-points-btn');
        if (applyBtn) applyBtn.style.display = 'none';
        
        const nameDisplay = document.getElementById('pos-cust-name-display');
        if(nameDisplay) nameDisplay.innerText = '';
    }
};

window.applyLoyaltyPointsDiscount = () => {
    const customerPhoneInput = document.getElementById('pos-cust-phone');
    const customerPhone = customerPhoneInput ? customerPhoneInput.value.trim().toLowerCase() : "";
    const customer = (window.allCustomers || []).find(c => 
        (c.phone && c.phone.toLowerCase() === customerPhone) || 
        (c.loyaltyCardNo && c.loyaltyCardNo.toLowerCase() === customerPhone)
    );
    
    if(customer && customer.loyaltyPoints > 0) {
        document.getElementById('pos-discount-type').value = 'LKR';
        const subtotal = parseFloat(document.getElementById('pos-subtotal').innerText.replace(/,/g, '')) || 0;
        
        // Cannot discount more than subtotal
        let discountToApply = customer.loyaltyPoints;
        if (discountToApply > subtotal) {
            discountToApply = subtotal; 
        }
        
        document.getElementById('pos-bill-discount').value = discountToApply;
        window.appliedLoyaltyPoints = discountToApply; // Save globally to deduct points later
        calculatePOSTotals();
        window.showToast(`Applied ${discountToApply} LKR from Loyalty Points!`, 'success');
        
        const applyBtn = document.getElementById('pos-apply-points-btn');
        if (applyBtn) applyBtn.style.display = 'none';
    } else {
        window.showToast("No loyalty points available.", "error");
    }
};

window.saveQuickPOSCustomer = async (e) => {
    e.preventDefault();
    const name = document.getElementById('quick-cust-name').value;
    const phone = document.getElementById('quick-cust-phone').value;
    const address = document.getElementById('quick-cust-address').value;
    const type = document.getElementById('quick-cust-type').value;
    
    // Auto-generate Customer ID based on type
    const custs = window.allCustomers || [];
    let generatedId = '';
    if (type === 'wholesale') {
        const cCount = custs.filter(c => c.customerType === 'wholesale').length;
        generatedId = 'WHO-' + String(cCount + 1).padStart(3, '0');
    } else {
        const cCount = custs.filter(c => c.customerType !== 'wholesale').length;
        generatedId = 'LO-' + String(cCount + 1).padStart(3, '0');
    }
    
    // Fallback variable alignment
    const loyaltyCardNo = generatedId;

    try {
        await addDoc(customersCol, { 
            name, phone, address, 
            loyaltyCardNo,
            customerType: type,
            storeId: window.getStoreId(), 
            timestamp: serverTimestamp() 
        });
        document.getElementById('quick-cust-modal').style.display = 'none';
        window.showToast(`✅ Registered! Loyalty ID: ${loyaltyCardNo}`, "success");
        
        // Apply Mode Immediately based on type
        const pricingSelect = document.getElementById('pos-pricing-mode');
        if (pricingSelect) {
            pricingSelect.value = type;
            updatePOSPricingMode();
        }
    } catch (err) { console.error(err); }
};

// --- POS Terminal Logic ---
let posBills = [{ items: [], pricingMode: 'retail', timestamp: Date.now() }];
let activeBillIndex = 0;
let currentPendingPOSSale = null;

// Helper to get current active bill
function getActiveBill() {
    return posBills[activeBillIndex];
}

window.addNewPOSBill = () => {
    if (posBills.length >= 5) {
        window.showToast("⚠️ Maximum 5 active bills allowed", "warning");
        return;
    }
    posBills.push({ items: [], pricingMode: 'retail', timestamp: Date.now() });
    activeBillIndex = posBills.length - 1;
    renderPOSBill();
};

window.switchPOSBill = (idx) => {
    activeBillIndex = idx;
    const modeSelect = document.getElementById('pos-pricing-mode');
    if (modeSelect) modeSelect.value = posBills[activeBillIndex].pricingMode;
    renderPOSBill();
};

window.removePOSBill = (idx, event) => {
    if (event) event.stopPropagation();
    if (posBills.length === 1) {
        posBills[0] = { items: [], pricingMode: 'retail', timestamp: Date.now() };
    } else {
        posBills.splice(idx, 1);
        if (activeBillIndex >= posBills.length) activeBillIndex = posBills.length - 1;
    }
    renderPOSBill();
};

window.updatePOSPricingMode = () => {
    const mode = document.getElementById('pos-pricing-mode').value;
    posBills[activeBillIndex].pricingMode = mode;
    
    // Recalculate prices for existing items in bill
    posBills[activeBillIndex].items.forEach(item => {
        const product = window.allProducts.find(p => p.docId === item.docId);
        if (product) {
            item.price = getPriceByMode(product, mode);
        }
    });
    renderPOSBill();
};

function getPriceByMode(product, mode) {
    if (mode === 'wholesale' && product.wholesalePrice) return parseFloat(product.wholesalePrice);
    if (mode === 'loyalty' && product.loyaltyPrice) return parseFloat(product.loyaltyPrice);
    return parseFloat(product.price);
}
let html5QrCode;
let currentFacingMode = "environment"; 

window.openScanner = () => {
    document.getElementById('scanner-modal').style.display = 'flex';
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("scanner-reader");
    }
    startScanning();
};

const startScanning = () => {
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    html5QrCode.start(
        { facingMode: currentFacingMode },
        config,
        onScanSuccess
    ).catch(err => {
        console.error("Camera Error:", err);
        window.showToast("Cannot access camera. Check permissions.", "error");
    });
};

window.toggleCamera = () => {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            startScanning();
        });
    }
};

window.closeScanner = () => {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            document.getElementById('scanner-modal').style.display = 'none';
        });
    } else {
        document.getElementById('scanner-modal').style.display = 'none';
    }
};

const onScanSuccess = (decodedText) => {
    const q = decodedText.toLowerCase().trim();
    const product = window.allProducts.find(p => 
        (p.sku && p.sku.toLowerCase() === q) ||
        p.name.toLowerCase() === q
    );

    if (product) {
        window.addToPOSBill(product.docId);
        window.showToast(`✅ Added: ${product.name}`, "success");
        
        // Play sound if available
        const sound = document.getElementById('notif-sound-pos');
        if (sound) sound.play().catch(() => {});
        
        if (navigator.vibrate) navigator.vibrate(100);
    } else {
        window.showToast("❌ Product code not recognized", "warning");
    }
};

window.handlePOSSearch = (val) => {
    const listDiv = document.getElementById('pos-product-list');
    if (!listDiv || !window.allProducts) return;
    const q = val.toLowerCase().trim();
    const mode = posBills[activeBillIndex].pricingMode;
    const filtered = window.allProducts.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.sku && p.sku.toLowerCase().includes(q))
    );
    
    listDiv.innerHTML = filtered.map(p => {
        const displayPrice = getPriceByMode(p, mode);
        return `
            <div class="pos-v2-item" onclick="addToPOSBill('${p.docId}')">
                <img src="${p.image || '/logo.png'}" style="width:100%; height:100px; object-fit:cover; border-radius:12px; margin-bottom:8px; background:#f8fafc;">
                <div style="flex:1;">
                    <span class="name" style="display:block; margin-bottom:4px;">${p.name}</span>
                    <div class="price">LKR ${displayPrice.toFixed(2)}</div>
                    <div style="font-size:0.75rem; color:${p.stock < 5 ? '#ef4444' : '#64748b'}; font-weight:700;">Stock: ${p.stock}</div>
                </div>
            </div>
        `;
    }).join('');
};

window.addToPOSBill = (docId) => {
    const product = window.allProducts.find(p => p.docId === docId);
    if (!product) return;
    
    const activeBill = getActiveBill();
    const mode = activeBill.pricingMode;
    const price = getPriceByMode(product, mode);

    const existing = activeBill.items.findIndex(i => i.docId === docId);
    if (existing !== -1) {
        activeBill.items[existing].quantity += 1;
        // Optionally update price if it changed
        activeBill.items[existing].price = price;
    } else {
        activeBill.items.push({ ...product, price: price, quantity: 1, discount: product.discount || 0 });
    }
    renderPOSBill();
};

function renderPOSBill() {
    const tbody = document.getElementById('pos-bill-items');
    if (!tbody) return;

    const activeBill = getActiveBill();
    const currentPOSBill = activeBill.items;

    // Render Tabs
    const tabsContainer = document.getElementById('pos-bill-tabs');
    if (tabsContainer) {
        tabsContainer.innerHTML = posBills.map((b, i) => `
            <div class="bill-tab ${i === activeBillIndex ? 'active' : ''}" onclick="switchPOSBill(${i})">
                <span>Bill ${i + 1} (${b.items.length})</span>
                <span class="close-tab" onclick="removePOSBill(${i}, event)">&times;</span>
            </div>
        `).join('');
    }

    tbody.innerHTML = currentPOSBill.map((item, idx) => `
        <tr>
            <td>${item.name}</td>
            <td style="display:flex; align-items:center; gap:5px;">
                <button onclick="updatePOSQty(${idx},-1)">-</button>${item.quantity}<button onclick="updatePOSQty(${idx},1)">+</button>
            </td>
            <td style="text-align:right;">
                <input type="number" value="${item.discount || 0}" oninput="updatePOSItemDiscount(${idx}, this.value)" 
                style="width: 60px; padding: 5px; border: 1px solid #e2e8f0; border-radius: 5px; text-align: right;">
            </td>
            <td style="text-align:right;">${item.price}</td>
            <td style="text-align:right;">${((item.price - (item.discount || 0)) * item.quantity).toFixed(2)}</td>
            <td><button onclick="removeFromPOSBill(${idx})">×</button></td>
        </tr>
    `).join('');
    calculatePOSTotals();

    // Auto-scroll to bottom when items are added
    const scrollWrap = document.querySelector('.bill-items-table-wrap');
    if (scrollWrap) {
        scrollWrap.scrollTop = scrollWrap.scrollHeight;
    }
}


window.updatePOSQty = (idx, delta) => {
    const activeBill = getActiveBill();
    activeBill.items[idx].quantity += delta;
    if (activeBill.items[idx].quantity <= 0) activeBill.items.splice(idx, 1);
    renderPOSBill();
};

window.removeFromPOSBill = (idx) => {
    const activeBill = getActiveBill();
    activeBill.items.splice(idx, 1);
    renderPOSBill();
};

window.updatePOSItemDiscount = (idx, val) => {
    const activeBill = getActiveBill();
    activeBill.items[idx].discount = parseFloat(val) || 0;
    calculatePOSTotals();
    const tbody = document.getElementById('pos-bill-items');
    if (tbody) {
        const row = tbody.children[idx];
        const totalCell = row.children[4];
        const item = activeBill.items[idx];
        totalCell.innerText = ((item.price - item.discount) * item.quantity).toFixed(2);
    }
};

window.calculatePOSTotals = () => {
    const activeBill = getActiveBill();
    const currentPOSBill = activeBill.items;
    const sub = currentPOSBill.reduce((s, i) => s + ((i.price - (i.discount || 0)) * i.quantity), 0);
    const discInput = parseFloat(document.getElementById('pos-bill-discount').value) || 0;
    const discType = document.getElementById('pos-discount-type').value;

    let disc = discInput;
    if (discType === '%') {
        disc = (sub * discInput) / 100;
    }

    const payable = Math.max(0, sub - disc);

    document.getElementById('pos-subtotal').innerText = sub.toFixed(2);
    document.getElementById('pos-payable').innerText = payable.toFixed(2);
    const itemCountEl = document.getElementById('pos-item-count');
    if (itemCountEl) itemCountEl.innerText = currentPOSBill.length;
};

window.openPaymentModal = () => {
    const activeBill = getActiveBill();
    if (activeBill.items.length === 0) {
        window.showToast("Cannot pay an empty bill!", "error");
        return;
    }
    const payable = document.getElementById('pos-payable').innerText;
    document.getElementById('pay-modal-payable').innerText = payable;
    document.getElementById('pay-modal-tendered').value = '';
    document.getElementById('pay-modal-change').innerText = '0.00';
    document.getElementById('pos-payment-modal').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('pay-modal-tendered').focus();
    }, 100);
};

window.calculateModalChange = () => {
    const payable = parseFloat(document.getElementById('pay-modal-payable').innerText) || 0;
    const tendered = parseFloat(document.getElementById('pay-modal-tendered').value) || 0;
    const change = Math.max(0, tendered - payable);
    document.getElementById('pay-modal-change').innerText = change.toFixed(2);
};

window.clearPOSBill = () => {
    const activeBill = getActiveBill();
    activeBill.items = [];
    renderPOSBill();
};

window.processPOSSale = async (method) => {
    const activeBill = getActiveBill();
    const currentPOSBill = activeBill.items;
    if (currentPOSBill.length === 0) return;
    const payable = parseFloat(document.getElementById('pos-payable').innerText);

    // Capture Staff Info
    const staffId = sessionStorage.getItem('userEmail') || 'System';
    const staffName = sessionStorage.getItem('userName') || 'System';

    const receiptBadge = document.getElementById('pos-receipt-no');
    const invoiceId = receiptBadge ? receiptBadge.innerText : ('POS-' + Date.now().toString().slice(-6));

    const customerPhoneInput = document.getElementById('pos-cust-phone');
    const customerPhone = customerPhoneInput ? customerPhoneInput.value.trim().toLowerCase() : "";
    const customer = (window.allCustomers || []).find(c => 
        (c.phone && c.phone.toLowerCase() === customerPhone) || 
        (c.loyaltyCardNo && c.loyaltyCardNo.toLowerCase() === customerPhone)
    );

    // Update change value for animated success popup
    const finalChange = document.getElementById('pay-modal-change').innerText;
    const balanceBox = document.getElementById('invoice-final-balance');
    if(balanceBox) balanceBox.innerText = finalChange;

    currentPendingPOSSale = {
        orderId: invoiceId,
        userName: customer ? customer.name : "Walk-in Customer",
        customerPhone: customer ? customer.phone : "",
        customerId: customer ? customer.docId : null,
        items: [...currentPOSBill],
        total: payable,
        status: (method === 'COD' || method === 'Bank Transfer') ? "Pending" : "Delivered",
        paymentMethod: method,
        staffId: staffId,
        staffName: staffName,
        branchId: sessionStorage.getItem('userBranchId') || 'Global',
        storeId: window.getStoreId(),
        timestamp: serverTimestamp(),
        date: new Date().toLocaleDateString(),
        stockDeducted: true,
        isPOS: true
    };

    // Close payment modal and Show selection modal
    document.getElementById('pos-payment-modal').style.display = 'none';
    document.getElementById('pos-invoice-modal').style.display = 'flex';
};

window.completeAndSharePOSSale = async (sharingMethod) => {
    if (!currentPendingPOSSale) return;

    // Close modal
    document.getElementById('pos-invoice-modal').style.display = 'none';

    try {
        // 1. Perform sharing action if requested
        if (sharingMethod === 'Print') {
            window.printPOSReceipt();
        } else if (sharingMethod === 'WhatsApp') {
            window.shareOnWhatsApp();
        } else if (sharingMethod === 'SMS') {
            if (typeof window.sendSMSBilling === 'function') {
                await window.sendSMSBilling();
            } else {
                window.showToast("SMS gateway not configured yet.", "error");
            }
        } else if (sharingMethod === 'Graphic') {
            window.lastSavedPOSOrder = currentPendingPOSSale;
            window.openModernInvoice(currentPendingPOSSale.orderId);
        }

        // 2. Save to Firebase
        const batch = writeBatch(db);
        const storeId = window.getStoreId();
        await addDoc(ordersCol, currentPendingPOSSale);
        
        // Log the sale
        window.logAction("POS SALE", `Invoice ${currentPendingPOSSale.orderId} - LKR ${currentPendingPOSSale.total}`);

        for (const item of currentPendingPOSSale.items) {
            const prodRef = doc(db, 'products', item.docId);
            const latestProd = window.allProducts?.find(p => p.docId === item.docId);
            batch.update(prodRef, { stock: Math.max(0, (latestProd?.stock || 0) - item.quantity) });
        }
        
        // Update Loyalty Points (Add new points, subtract used points)
        if (currentPendingPOSSale.customerId) {
            const customerRef = doc(db, 'customers', currentPendingPOSSale.customerId);
            const customer = window.allCustomers?.find(c => c.docId === currentPendingPOSSale.customerId);
            
            let newPoints = customer?.loyaltyPoints || 0;
            // Deduct applied points
            if (window.appliedLoyaltyPoints && window.appliedLoyaltyPoints > 0) {
                newPoints -= window.appliedLoyaltyPoints;
                window.appliedLoyaltyPoints = 0; // reset
            }
            
            // Add earned points
            const earnedPoints = Math.floor(currentPendingPOSSale.total / 500);
            if (earnedPoints > 0 || newPoints !== (customer?.loyaltyPoints || 0)) {
                newPoints += earnedPoints;
                batch.update(customerRef, { loyaltyPoints: Math.max(0, newPoints) });
            }
        }

        await batch.commit();

        if (currentPendingPOSSale.customerId) {
             const earnedPoints = Math.floor(currentPendingPOSSale.total / 500);
             if (earnedPoints > 0) window.showToast(`💎 Customer earned ${earnedPoints} Loyalty Points!`, "success");
        }

        window.showToast("✅ Sale Recorded Successfully!", "success");
        const sound = document.getElementById('notif-sound-pos');
        if (sound) sound.play().catch(e => console.log(e));
        currentPendingPOSSale = null;
        resetPOS();
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error completing sale!", "error");
    }
};


window.resetPOS = () => {
    currentPOSBill = [];
    if(document.getElementById('pos-cash-paid')) document.getElementById('pos-cash-paid').value = '';
    document.getElementById('pos-bill-discount').value = '0';
    document.getElementById('pos-cust-phone').value = '';
    const nameDisplay = document.getElementById('pos-cust-name-display');
    if(nameDisplay) nameDisplay.innerText = '';
    const pointsBadge = document.getElementById('pos-cust-points-badge');
    const applyBtn = document.getElementById('pos-apply-points-btn');
    if (pointsBadge) pointsBadge.style.display = 'none';
    if (applyBtn) applyBtn.style.display = 'none';
    window.appliedLoyaltyPoints = 0;
    
    renderPOSBill();
    handlePOSSearch('');
};

window.sendSMSBilling = async () => {
    if (!currentPendingPOSSale || !currentPendingPOSSale.customerPhone) {
        window.showToast("No customer phone number for SMS.", "error");
        return false;
    }

    const phone = currentPendingPOSSale.customerPhone.replace(/[\s\+]/g, '');
    let formattedPhone = phone;
    // Format to 947XXXXXXXX
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '94' + formattedPhone.substring(1);
    }
    
    // Fallback if not 11 digits
    if (formattedPhone.length !== 11) {
        window.showToast("Invalid phone number format for SMS.", "error");
        return false;
    }

    const billId = currentPendingPOSSale.orderId;
    const total = currentPendingPOSSale.total.toFixed(2);
    const date = new Date().toLocaleDateString();
    
    const message = `Thank you for shopping at MEC Book Shop!\nInvoice: ${billId}\nDate: ${date}\nTotal: LKR ${total}\nWe hope to see you again!`;

    // SMSLenz API details
    const apiBase = "https://smslenz.lk/api/v3/sms/send";
    const apiToken = "40b621ec-69ba-48c4-869b-cf30f3f58791";
    const senderId = "MECBookShop";

    try {
        const url = new URL(apiBase);
        // SMSLenz/Text.lk API common parameters
        url.searchParams.append("recipient", formattedPhone);
        url.searchParams.append("sender_id", senderId);
        url.searchParams.append("type", "plain");
        url.searchParams.append("message", message);
        
        // Some APIs accept token this way, we'll also send standard Bearer auth and common query params
        url.searchParams.append("api_token", apiToken);
        url.searchParams.append("api_key", apiToken);

        await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Accept': 'application/json'
            },
            mode: 'no-cors' // Prevent browser CORS block
        });

        window.showToast("SMS dispatched successfully!", "success");
        return true;
    } catch (error) {
        console.error("SMS Error:", error);
        window.showToast("Failed to send SMS.", "error");
        return false;
    }
};

// --- Keyboard Shortcuts for POS ---
window.addEventListener('keydown', (e) => {
    // Only trigger if POS section is visible
    const posSection = document.getElementById('section-pos');
    if (!posSection || posSection.style.display === 'none') return;

    // F8 - Payment
    if (e.key === 'F8') {
        e.preventDefault();
        window.openPaymentModal();
    }
    if (e.key === 'F1') {
        e.preventDefault();
        window.showCalculator();
    }
    // F2 - Repair Bill
    if (e.key === 'F2') {
        e.preventDefault();
        window.showRepairIntake();
    }
    // F3 - Today Sales
    if (e.key === 'F3') {
        e.preventDefault();
        window.showTab('reports');
    }
    // F4 - Orders
    if (e.key === 'F4') {
        e.preventDefault();
        window.showTab('orders');
    }
    // F5 - Scan & Add
    if (e.key === 'F5') {
        e.preventDefault();
        if (typeof window.openScanner === 'function') window.openScanner();
    }
    // F8 - Process Cash
    if (e.key === 'F8') {
        e.preventDefault();
        window.processPOSSale('Cash');
    }
    // F9 - Process Card
    if (e.key === 'F9') {
        e.preventDefault();
        window.processPOSSale('Card');
    }
    // F10 - Clear POS
    if (e.key === 'F10') {
        e.preventDefault();
        window.resetPOS();
    }
    // ESC - Exit POS
    if (e.key === 'Escape') {
        e.preventDefault();
        window.exitPOSFullscreen();
    }
    // F6 - Focus Product Search
    if (e.key === 'F6') {
        e.preventDefault();
        document.getElementById('pos-search')?.focus();
    }
    // F7 - Focus Customer Phone
    if (e.key === 'F7') {
        e.preventDefault();
        document.getElementById('pos-cust-phone')?.focus();
    }
    // F12 - New Bill
    if (e.key === 'F12') {
        e.preventDefault();
        window.addNewPOSBill();
    }
});

function renderPendingShopOrders(orders) {
    const list = document.getElementById('pos-pending-shop-orders');
    if (!list) return;
    const pending = orders.filter(o => o.paymentMethod === 'Shop Pickup' && o.status === 'Pending');
    list.innerHTML = pending.length === 0 ? '<p>No pickups.</p>' : pending.map(o => `
        <div class="pos-shop-order-card" onclick="loadShopOrderToPOS('${o.orderId}')">
            ${o.orderId} - LKR ${o.total}
        </div>
    `).join('');
}

window.loadShopOrderToPOS = (id) => {
    const o = window.allOrders?.find(x => x.orderId === id);
    if (o) {
        currentPOSBill = o.items.map(i => ({ ...i, quantity: i.quantity || 1 }));
        document.getElementById('pos-cust-phone').value = o.phone || '';
        renderPOSBill();
        window.showToast("Order loaded to POS.", "info");
    }
};

// --- Reports Logic ---
let reportsChart = null;
function generateReports(orders) {
    const userRole = sessionStorage.getItem('userRole');
    const userBranch = sessionStorage.getItem('userBranchId');

    // Branch Filtering logic
    const filterByBranch = (items) => {
        if (userRole !== 'Admin') {
            return items.filter(i => i.branchId === userBranch || (!i.branchId && userBranch === 'Global'));
        } else if (activeBranchFilter !== 'All') {
            return items.filter(i => i.branchId === activeBranchFilter);
        }
        return items;
    };

    const delivered = filterByBranch(orders.filter(o => o.status === 'Delivered'));
    const expenses = filterByBranch(window.allExpenses || []);
    const income = filterByBranch(window.allIncome || []);
    const now = new Date();

    const calcNet = (items) => {
        let sales = 0, costs = 0, exps = 0, incs = 0;
        let serviceCharges = 0, serviceCosts = 0;

        // Sales & Item Costs
        items.sales.forEach(o => {
            o.items.forEach(i => {
                const p = window.allProducts?.find(product => product.docId === i.docId) || i;
                const qty = i.quantity || 1;
                // If it's a service, put in service buckets
                if (p.mode === 'Service' || i.mode === 'Service') {
                    serviceCharges += (i.price - (i.discount || 0)) * qty;
                    serviceCosts += (p.cost || 0) * qty;
                } else {
                    sales += (i.price - (i.discount || 0)) * qty;
                    costs += (p.cost || 0) * qty;
                }
            });
        });

        // Add overall bill-level discount impact broadly, but since we subtract item discount above,
        // we'll assume bill discount applies proportionally. For simplicity, we just use total order value if needed.

        // Other Expenses
        items.exps.forEach(e => exps += e.amount);

        // Other Income
        items.incs.forEach(n => incs += n.amount);

        // Net incorporates normal products + services + extra income - extra expenses
        const netProfit = (sales + serviceCharges + incs) - (costs + serviceCosts + exps);

        return { sales, costs, serviceCharges, serviceCosts, exps, incs, net: netProfit };
    };

    const getDailyData = () => {
        const todayStr = now.toDateString();
        return {
            sales: delivered.filter(o => (o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date)).toDateString() === todayStr),
            exps: expenses.filter(e => new Date(e.date).toDateString() === todayStr),
            incs: income.filter(n => new Date(n.date).toDateString() === todayStr)
        };
    };

    const getMonthlyData = () => {
        const m = now.getMonth(), y = now.getFullYear();
        return {
            sales: delivered.filter(o => {
                const d = o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date);
                return d.getMonth() === m && d.getFullYear() === y;
            }),
            exps: expenses.filter(e => {
                const d = new Date(e.date);
                return d.getMonth() === m && d.getFullYear() === y;
            }),
            incs: income.filter(n => {
                const d = new Date(n.date);
                return d.getMonth() === m && d.getFullYear() === y;
            })
        };
    };

    const getYearlyData = () => {
        const y = now.getFullYear();
        return {
            sales: delivered.filter(o => (o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date)).getFullYear() === y),
            exps: expenses.filter(e => new Date(e.date).getFullYear() === y),
            incs: income.filter(n => new Date(n.date).getFullYear() === y)
        };
    };

    const d = calcNet(getDailyData());
    const m = calcNet(getMonthlyData());
    const y = calcNet(getYearlyData());

    document.getElementById('report-daily-profit').innerText = `LKR ${d.net.toFixed(2)}`;
    document.getElementById('report-daily-sales').innerText = (d.sales + d.serviceCharges).toFixed(0);
    document.getElementById('report-daily-cost').innerText = (d.costs + d.serviceCosts + d.exps).toFixed(0);

    document.getElementById('report-monthly-profit').innerText = `LKR ${m.net.toFixed(2)}`;
    document.getElementById('report-monthly-sales').innerText = (m.sales + m.serviceCharges).toFixed(0);
    document.getElementById('report-monthly-cost').innerText = (m.costs + m.serviceCosts + m.exps).toFixed(0);

    document.getElementById('report-yearly-profit').innerText = `LKR ${y.net.toFixed(2)}`;
    document.getElementById('report-yearly-sales').innerText = (y.sales + y.serviceCharges).toFixed(0);
    document.getElementById('report-yearly-cost').innerText = (y.costs + y.serviceCosts + y.exps).toFixed(0);

    const breakdownList = document.getElementById('report-breakdown-list');
    if (breakdownList) {
        breakdownList.innerHTML = `
            <div style="background: var(--glass-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: var(--card-shadow); backdrop-filter: blur(10px);">
                <h4 style="margin: 0 0 10px 0; color: var(--primary-blue);">Monthly Performance Breakdown</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Product Sales</span>
                    <strong>LKR ${m.sales.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Product Costs</span>
                    <strong>LKR ${m.costs.toFixed(2)}</strong>
                </div>
                <hr style="border: 0; border-top: 1px dashed #e2e8f0; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: var(--accent-blue);">
                    <span>Service Charges (Income)</span>
                    <strong>LKR ${m.serviceCharges.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #f97316;">
                    <span>Service Costs (Expense)</span>
                    <strong>LKR ${m.serviceCosts.toFixed(2)}</strong>
                </div>
                <hr style="border: 0; border-top: 1px dashed #e2e8f0; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Other Income</span>
                    <strong>LKR ${m.incs.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Other Expenses</span>
                    <strong>LKR ${m.exps.toFixed(2)}</strong>
                </div>
            </div>
        `;
    }

    // MULTIPLE CHARTS IMPLEMENTATION
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = now.getFullYear();

    let mSales = new Array(12).fill(0);
    let mProfits = new Array(12).fill(0);
    let mExps = new Array(12).fill(0);

    const yrDelivered = delivered.filter(o => (o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date)).getFullYear() === currentYear);
    const yrExps = expenses.filter(e => new Date(e.date).getFullYear() === currentYear);

    yrDelivered.forEach(o => {
        const d = o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date);
        const mon = d.getMonth();
        mSales[mon] += o.total;

        let costs = 0;
        o.items.forEach(i => {
            const p = window.allProducts?.find(product => product.docId === i.docId) || i;
            costs += (p.cost || 0) * (i.quantity || 1);
        });
        mProfits[mon] += (o.total - costs);
    });

    yrExps.forEach(e => {
        const d = new Date(e.date);
        mExps[d.getMonth()] += e.amount;
    });

    const commonOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'Inter' } } }
        }
    };

    // 1. Line Chart
    const ctxLine = document.getElementById('salesLineChart');
    if (ctxLine) {
        if (window.myLineChart) window.myLineChart.destroy();
        window.myLineChart = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: 'Revenue (LKR)', data: mSales, borderColor: '#00aeef', backgroundColor: 'rgba(0,174,239,0.1)', fill: true, tension: 0.4 },
                    { label: 'Profit (LKR)', data: mProfits, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 }
                ]
            },
            options: commonOptions
        });
    }

    // 2. Bar Chart
    const ctxBar = document.getElementById('salesBarChart');
    if (ctxBar) {
        if (window.myBarChart) window.myBarChart.destroy();
        window.myBarChart = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Revenue', data: mSales, backgroundColor: '#002060', borderRadius: 5 },
                    { label: 'Expenses', data: mExps, backgroundColor: '#ef4444', borderRadius: 5 }
                ]
            },
            options: commonOptions
        });
    }

    // 3. Pie Chart (Current Month Breakdown)
    const ctxPie = document.getElementById('revenuePieChart');
    if (ctxPie) {
        if (window.myPieChart) window.myPieChart.destroy();
        window.myPieChart = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Product Sales', 'Service Charges', 'Other Income'],
                datasets: [{
                    data: [m.sales, m.serviceCharges, m.incs],
                    backgroundColor: ['#00aeef', '#10b981', '#fbbf24'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

// --- POS Sharing & Printing ---
window.generatePOSReceiptNo = () => {
    const no = 'R-' + Math.floor(Math.random() * 900000 + 100000);
    document.getElementById('pos-receipt-no').innerText = no;
};

window.printPOSReceipt = () => {
    if (currentPOSBill.length === 0) return;
    const receiptNo = document.getElementById('pos-receipt-no').innerText;
    const subtotal = document.getElementById('pos-subtotal').innerText;
    const discount = document.getElementById('pos-bill-discount').value;
    const payable = document.getElementById('pos-payable').innerText;
    const paid = document.getElementById('pos-cash-paid').value || payable;
    const change = document.getElementById('pos-change').innerText;
    const phone = document.getElementById('pos-cust-phone').value || 'Guest';

    let itemsHtml = currentPOSBill.map(item => `
        <div class="receipt-row">
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-meta">${item.quantity} x LKR ${item.price} ${item.discount > 0 ? `(Disc: -${item.discount})` : ''}</div>
            </div>
            <div class="item-total">LKR ${((item.price - (item.discount || 0)) * item.quantity).toFixed(2)}</div>
        </div>
    `).join('');

    const printWindow = window.open('', '', 'width=450,height=800');
    printWindow.document.write(`
        <html>
        <head>
            <title>Receipt ${receiptNo}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body { 
                    font-family: 'Inter', sans-serif; 
                    padding: 30px; 
                    color: #1a1a1a;
                    background: #fff;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .header { text-align: center; margin-bottom: 25px; }
                .logo { font-size: 24px; font-weight: 800; color: #002060; margin-bottom: 5px; }
                .address { font-size: 11px; color: #666; line-height: 1.4; }
                .divider { border-bottom: 1px dashed #ddd; margin: 15px 0; }
                .receipt-info { font-size: 12px; display: flex; justify-content: space-between; margin-bottom: 15px; color: #444; }
                
                .receipt-row { display: flex; justify-content: space-between; margin-bottom: 12px; align-items: flex-start; }
                .item-name { font-weight: 700; font-size: 13px; color: #111; margin-bottom: 2px; }
                .item-meta { font-size: 11px; color: #777; }
                .item-total { font-weight: 700; font-size: 13px; color: #111; }
                
                .summary { margin-top: 15px; }
                .summary-line { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #444; }
                .summary-line.total { 
                    margin-top: 10px; 
                    padding-top: 10px; 
                    border-top: 2px solid #002060; 
                    font-weight: 800; 
                    font-size: 18px; 
                    color: #002060; 
                }
                .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #888; }
                .footer p { margin: 4px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${window.storeInfo?.logoUrl || '/logo.png'}" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px;" onerror="this.style.display='none'; document.getElementById('thermal-logo-text-pos').style.display='block';">
                <div class="logo" id="thermal-logo-text-pos" style="display:none;">${window.storeInfo?.name || 'MEC BOOK SHOP'}</div>
                <div class="address">
                    ${window.storeInfo?.location || 'Yakkala, Sri Lanka'}<br>
                    Phone: ${window.storeInfo?.phone || '+94 71 923 3388'}
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="receipt-info">
                <div>
                    <div><strong>Invoice:</strong> ${receiptNo}</div>
                    <div><strong>Customer:</strong> ${phone}</div>
                </div>
                <div style="text-align: right;">
                    <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
                    <div><strong>Time:</strong> ${new Date().toLocaleTimeString()}</div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="items">
                ${itemsHtml}
            </div>
            
            <div class="divider"></div>
            
            <div class="summary">
                <div class="summary-line">
                    <span>Subtotal</span>
                    <span>LKR ${subtotal}</span>
                </div>
                <div class="summary-line">
                    <span>Discount</span>
                    <span>- LKR ${discount}</span>
                </div>
                <div class="summary-line total">
                    <span>TOTAL</span>
                    <span>LKR ${payable}</span>
                </div>
                
                <div class="divider" style="margin-top: 20px;"></div>
                
                <div class="summary-line">
                    <span>Paid via Cash</span>
                    <span>LKR ${paid}</span>
                </div>
                <div class="summary-line" style="color: #10b981; font-weight: 700;">
                    <span>Change Return</span>
                    <span>LKR ${change}</span>
                </div>
            </div>
            
            <div class="footer">
                <p><strong>Thank you for choosing MEC!</strong></p>
                <p>Items once sold are not returnable without receipt.</p>
                <p>Managed by MEC Cloud ERP v${CLIENT_VERSION}</p>
            </div>
            
            <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

window.shareOnWhatsApp = () => {
    if (currentPOSBill.length === 0) return;
    const phone = document.getElementById('pos-cust-phone').value;
    const text = encodeURIComponent(getBillPlainText());
    window.open(`https://wa.me/${phone ? phone.replace(/\D/g, '') : ''}?text=${text}`, '_blank');
};

// This function has been consolidated with the one above.
// SMSLENZ_API_KEY and other constants are now used in the main sendSMSBilling function.

function getBillPlainText() {
    const receiptNo = document.getElementById('pos-receipt-no').innerText;
    const subtotal = document.getElementById('pos-subtotal').innerText;
    const discInput = document.getElementById('pos-bill-discount').value || 0;
    const discType = document.getElementById('pos-discount-type').value;
    const payable = document.getElementById('pos-payable').innerText;
    const paid = document.getElementById('pos-cash-paid').value || payable;
    const change = document.getElementById('pos-change').innerText;

    let text = `*MEC PLATFORM ERP - RECEIPT*\n`;
    text += `Receipt: ${receiptNo}\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n\n`;

    currentPOSBill.forEach(item => {
        const netPrice = item.price - (item.discount || 0);
        text += `${item.name} x ${item.quantity} ${item.discount > 0 ? `[Disc ${item.discount}]` : ''} = LKR ${(netPrice * item.quantity).toFixed(2)}\n`;
    });

    text += `\nSubtotal: LKR ${subtotal}\n`;
    if (parseFloat(discInput) > 0) {
        text += `Discount (${discType === '%' ? discInput + '%' : 'LKR ' + discInput}): -LKR ${(parseFloat(subtotal) - parseFloat(payable)).toFixed(2)}\n`;
    }
    text += `*TOTAL PAYABLE: LKR ${payable}*\n`;
    text += `Paid: LKR ${paid}\n`;
    text += `Change: LKR ${change}\n\n`;
    text += `Track Order: mec-book-shop.web.app\n`;
    text += `Thank you for choosing MEC Network!`;
    return text;
}

// --- Sync/Update Logic ---
// --- Stock Management & Purchase History ---
let currentStockInvoice = [];

window.searchProductsForStock = (val) => {
    const resultsDiv = document.getElementById('stock-search-results');
    if (!resultsDiv) return;
    if (!val) { resultsDiv.style.display = 'none'; return; }

    const q = val.toLowerCase();
    const filtered = (window.allProducts || []).filter(p => p.name.toLowerCase().includes(q));

    resultsDiv.innerHTML = filtered.map(p => `
        <div class="search-result-item" onclick="addToStockInvoice('${p.docId}')">
            ${p.name} (Stock: ${p.stock})
        </div>
    `).join('');
    resultsDiv.style.display = 'block';
};

window.addToStockInvoice = (docId) => {
    const p = window.allProducts.find(x => x.docId === docId);
    if (!p) return;
    if (!currentStockInvoice.find(x => x.docId === docId)) {
        currentStockInvoice.push({ ...p, addedQty: 1 });
    }
    document.getElementById('stock-search').value = '';
    document.getElementById('stock-search-results').style.display = 'none';
    renderStockInvoiceUI();
};

function renderStockInvoiceUI() {
    const tbody = document.getElementById('stock-invoice-list');
    if (!tbody) return;
    tbody.innerHTML = currentStockInvoice.map((item, idx) => `
        <tr>
            <td>${item.name}</td>
            <td><input type="number" value="${item.cost || 0}" onchange="updateStockInvoiceItem(${idx}, 'cost', this.value)"></td>
            <td><input type="number" value="${item.price || 0}" onchange="updateStockInvoiceItem(${idx}, 'price', this.value)"></td>
            <td>${item.stock}</td>
            <td><input type="number" value="${item.addedQty}" onchange="updateStockInvoiceItem(${idx}, 'addedQty', this.value)"></td>
            <td><button class="icon-btn delete" onclick="removeFromStockInvoice(${idx})">🗑️</button></td>
        </tr>
    `).join('');
}

window.updateStockInvoiceItem = (idx, field, val) => {
    currentStockInvoice[idx][field] = parseFloat(val) || 0;
};

window.removeFromStockInvoice = (idx) => {
    currentStockInvoice.splice(idx, 1);
    renderStockInvoiceUI();
};

window.saveStockInvoice = async () => {
    if (currentStockInvoice.length === 0) return;
    if (!confirm("Confirm inventory update and record purchase?")) return;

    try {
        const batch = writeBatch(db);
        let totalPurchaseCost = 0;

        for (const item of currentStockInvoice) {
            const prodRef = doc(db, 'products', item.docId);
            batch.update(prodRef, {
                stock: (item.stock || 0) + item.addedQty,
                cost: item.cost,
                price: item.price
            });
            totalPurchaseCost += (item.cost * item.addedQty);
        }

        // Record Purchase in History
        await addDoc(purchasesCol, {
            items: currentStockInvoice.map(i => ({ name: i.name, qty: i.addedQty, cost: i.cost })),
            totalCost: totalPurchaseCost,
            storeId: window.getStoreId(),
            timestamp: serverTimestamp(),
            date: new Date().toLocaleDateString()
        });
        
        window.logAction("STOCK UPDATE", `Updated ${currentStockInvoice.length} items. Total Cost: LKR ${totalPurchaseCost}`);

        await batch.commit();
        window.showToast("✅ Stock Updated & Purchase Recorded!", "success");
        currentStockInvoice = [];
        renderStockInvoiceUI();
    } catch (e) {
        console.error(e);
        window.showToast("❌ Update Failed!", "error");
    }
};

function populateStockInvoiceDropdown(products) {
    // Already handled by searchProductsForStock and addToStockInvoice
}

// --- Expenses UI & Logic ---
window.addExpense = async (e) => {
    e.preventDefault();
    const title = document.getElementById('exp-title').value;
    const category = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const date = document.getElementById('exp-date').value;

    const branchId = sessionStorage.getItem('userBranchId') || 'Global';
    const storeId = window.getStoreId();

    try {
        await addDoc(expensesCol, { title, category, amount, date, branchId, storeId, timestamp: serverTimestamp() });
        e.target.reset();
        window.showToast("✅ Expense recorded.", "success");
    } catch (err) { console.error(err); }
};

function renderExpensesUI(expenses) {
    const div = document.getElementById('admin-expense-list');
    if (!div) return;

    const userRole = sessionStorage.getItem('userRole');
    const userBranch = sessionStorage.getItem('userBranchId');
    const storeId = window.getStoreId();

    const filtered = expenses.filter(ex => {
        // Store filter
        if (ex.storeId && ex.storeId !== storeId) return false;
        if (!ex.storeId && storeId !== 'master') return false;

        // Branch filter
        if (userRole !== 'Admin' && userRole !== 'SuperAdmin') {
            return ex.branchId === userBranch || (!ex.branchId && userBranch === 'Global');
        } else if (activeBranchFilter !== 'All') {
            return ex.branchId === activeBranchFilter;
        }
        return true;
    });

    const sorted = filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    div.innerHTML = `
        <table class="admin-table">
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
                ${sorted.map(ex => `
                    <tr>
                        <td>${ex.date}</td>
                        <td>${ex.title}</td>
                        <td><span class="status-badge" style="background:#f1f5f9; color:#475569;">${ex.category}</span></td>
                        <td style="font-weight:700;">LKR ${ex.amount.toFixed(2)}</td>
                        <td><button class="icon-btn delete" onclick="deleteExpense('${ex.docId}')">🗑️</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.deleteExpense = async (id) => {
    if (confirm("Delete expense?")) await deleteDoc(doc(db, 'expenses', id));
};

// --- Purchases History UI ---
function renderPurchasesUI(purchases) {
    const div = document.getElementById('admin-purchase-history');
    if (!div) return;
    const filtered = window.filterByStore(purchases);
    const sorted = filtered.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    div.innerHTML = sorted.length === 0 ? '<p>No history yet.</p>' : `
        <table class="admin-table">
            <thead><tr><th>Date</th><th>Items Bundle</th><th>Total Cost</th></tr></thead>
            <tbody>
                ${sorted.map(p => `
                    <tr>
                        <td>${p.date}</td>
                        <td>${p.items.map(i => `${i.name} (${i.qty})`).join(', ')}</td>
                        <td style="font-weight:700;">LKR ${p.totalCost.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// --- Suppliers UI & Logic ---
window.addSupplier = async (e) => {
    e.preventDefault();
    const name = document.getElementById('sup-name').value;
    const contact = document.getElementById('sup-contact').value;
    const phone = document.getElementById('sup-phone').value;
    const address = document.getElementById('sup-address').value;

    try {
        await addDoc(suppliersCol, { name, contact, phone, address, storeId: window.getStoreId() });
        e.target.reset();
        window.showToast("✅ Supplier added.", "success");
    } catch (err) { console.error(err); }
};

function renderSuppliersUI(suppliers) {
    const div = document.getElementById('admin-supplier-list');
    if (!div) return;
    const filtered = window.filterByStore(suppliers);
    div.innerHTML = `
        <table class="admin-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>
                ${filtered.map(s => `
                    <tr>
                        <td><strong>${s.name}</strong></td>
                        <td>${s.contact || '-'}</td>
                        <td>${s.phone || '-'}</td>
                        <td><button class="icon-btn delete" onclick="deleteSupplier('${s.docId}')">🗑️</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.deleteSupplier = async (id) => {
    if (confirm("Remove supplier?")) await deleteDoc(doc(db, 'suppliers', id));
};

// --- CSV Exports ---
window.downloadExpensesCSV = () => {
    const expenses = window.allExpenses || [];
    let csv = "Date,Title,Category,Amount\n";
    expenses.forEach(e => csv += `${e.date},${e.title},${e.category},${e.amount}\n`);
    downloadFile(csv, "expenses.csv");
};

window.downloadPurchasesCSV = () => {
    const purchases = window.allPurchases || [];
    let csv = "Date,Items,Total Cost\n";
    purchases.forEach(p => {
        const itemStr = p.items.map(i => `${i.name}(${i.qty})`).join(' | ');
        csv += `${p.date},"${itemStr}",${p.totalCost}\n`;
    });
    downloadFile(csv, "purchase_history.csv");
};

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}

// --- Income UI & Logic ---
window.addIncome = async (e) => {
    e.preventDefault();
    const title = document.getElementById('inc-title').value;
    const amount = parseFloat(document.getElementById('inc-amount').value);
    const date = document.getElementById('inc-date').value;

    const branchId = sessionStorage.getItem('userBranchId') || 'Global';
    const storeId = window.getStoreId();

    try {
        await addDoc(incomeCol, { title, amount, date, branchId, storeId, timestamp: serverTimestamp() });
        e.target.reset();
        window.showToast("✅ Income recorded.", "success");
    } catch (err) { console.error(err); }
};

function renderIncomeUI(income) {
    const div = document.getElementById('admin-income-list');
    if (!div) return;

    const userRole = sessionStorage.getItem('userRole');
    const userBranch = sessionStorage.getItem('userBranchId');
    const storeId = window.getStoreId();

    const filtered = income.filter(inc => {
        // Store filter
        if (inc.storeId && inc.storeId !== storeId) return false;
        if (!inc.storeId && storeId !== 'master') return false;

        // Branch filter
        if (userRole !== 'Admin' && userRole !== 'SuperAdmin') {
            return inc.branchId === userBranch || (!inc.branchId && userBranch === 'Global');
        } else if (activeBranchFilter !== 'All') {
            return inc.branchId === activeBranchFilter;
        }
        return true;
    });

    const sorted = filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    div.innerHTML = `
        <table class="admin-table">
            <thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
                ${sorted.map(inc => `
                    <tr>
                        <td>${inc.date}</td>
                        <td>${inc.title}</td>
                        <td style="font-weight:700; color:#10b981;">+ LKR ${inc.amount.toFixed(2)}</td>
                        <td><button class="icon-btn delete" onclick="deleteIncome('${inc.docId}')">🗑️</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.deleteIncome = async (id) => {
    if (confirm("Delete income record?")) await deleteDoc(doc(db, 'income', id));
};

// --- Customer ID Generation ---
window.generateCustomerID = () => {
    const custType = document.getElementById('cust-type').value;
    const custIdInput = document.getElementById('cust-id');
    const label = document.getElementById('cust-id-label');
    const filtered = window.filterByStore(window.allCustomers || []);

    if (!custIdInput) return;

    if (custType === 'wholesale') {
        const count = filtered.filter(c => c.customerType === 'wholesale').length;
        custIdInput.value = 'WHO-' + String(count + 1).padStart(3, '0');
        label.innerText = 'Wholesale Shop ID';
    } else if (custType === 'loyalty') {
        const count = filtered.filter(c => c.customerType === 'loyalty').length;
        custIdInput.value = 'LO-' + String(count + 1).padStart(3, '0');
        label.innerText = 'Loyalty Card No';
    } else {
        const count = filtered.filter(c => c.customerType === 'retail').length;
        custIdInput.value = 'RET-' + String(count + 1).padStart(3, '0');
        label.innerText = 'Member ID';
    }
};

// --- Customer UI & Logic ---
window.addCustomer = async (e) => {
    e.preventDefault();
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    const email = document.getElementById('cust-email').value;
    const address = document.getElementById('cust-address').value;
    const customerType = document.getElementById('cust-type').value;
    const loyaltyCardNo = document.getElementById('cust-id').value;

    try {
        await addDoc(customersCol, { 
            name, phone, email, address, 
            loyaltyCardNo,
            customerType,
            storeId: window.getStoreId(), 
            timestamp: serverTimestamp() 
        });
        e.target.reset();
        window.generateCustomerID(); // Re-generate for next
        window.showToast(`✅ Customer saved successfully!`, "success");
    } catch (err) { console.error(err); }
};

function renderCustomersUI(customers) {
    console.log("Rendering customers:", customers?.length);
    const div = document.getElementById('admin-customer-list');
    if (!div) {
        console.error("Customer list div not found!");
        return;
    }
    
    const filtered = window.filterByStore(customers);
    
    if (!filtered || filtered.length === 0) {
        div.innerHTML = `<div class="empty-state">No customers found for this store.</div>`;
        return;
    }

    div.innerHTML = `
        <table class="admin-table">
            <thead><tr><th>Loyalty ID</th><th>Name</th><th>Phone</th><th>Points</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
                ${filtered.map(c => `
                    <tr>
                        <td><span class="badge blue">${c.loyaltyCardNo || '-'}</span></td>
                        <td><strong>${c.name}</strong></td>
                        <td>${c.phone}</td>
                        <td><strong style="color:var(--primary-blue)">${c.loyaltyPoints || 0}</strong> <small>(Rs.${(c.loyaltyPoints || 0)})</small></td>
                        <td><span class="badge ${c.customerType === 'wholesale' ? 'orange' : 'green'}">${c.customerType || 'retail'}</span></td>
                        <td style="display: flex; gap: 5px;">
                            <button class="icon-btn edit" onclick="window.openCustomerEditModal('${c.docId}')">✏️</button>
                            <button class="icon-btn delete" onclick="deleteCustomer('${c.docId}')">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.openCustomerEditModal = (id) => {
    const cust = (window.allCustomers || []).find(c => c.docId === id);
    if (!cust) return;

    document.getElementById('edit-cust-id').value = id;
    document.getElementById('edit-cust-loyalty').value = cust.loyaltyCardNo || '-';
    document.getElementById('edit-cust-name').value = cust.name || '';
    document.getElementById('edit-cust-phone').value = cust.phone || '';
    document.getElementById('edit-cust-email').value = cust.email || '';
    document.getElementById('edit-cust-address').value = cust.address || '';
    document.getElementById('edit-cust-type').value = cust.customerType || 'retail';

    document.getElementById('customer-edit-modal').style.display = 'flex';
};

document.getElementById('edit-customer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-cust-id').value;
    const data = {
        name: document.getElementById('edit-cust-name').value,
        phone: document.getElementById('edit-cust-phone').value,
        email: document.getElementById('edit-cust-email').value,
        address: document.getElementById('edit-cust-address').value,
        customerType: document.getElementById('edit-cust-type').value
    };

    try {
        await updateDoc(doc(db, 'customers', id), data);
        document.getElementById('customer-edit-modal').style.display = 'none';
        window.showToast("✅ Customer updated successfully", "success");
    } catch (err) {
        console.error(err);
        window.showToast("❌ Error updating customer", "error");
    }
});

window.deleteCustomer = async (id) => {
    if (confirm("Delete customer record?")) await deleteDoc(doc(db, 'customers', id));
};

// --- Sync & Clock ---
window.updateApp = async () => {
    window.showToast("🔄 Fetching latest system updates...", "info");
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let r of regs) await r.unregister();
        }
        // Force the page to navigate to the online URL to grab the newest code
        setTimeout(() => {
            window.location.href = 'https://mec-book-shop.web.app/admin?v=' + Date.now();
        }, 1200);
    } catch (e) { 
        window.location.href = 'https://mec-book-shop.web.app/admin'; 
    }
};

// --- Missing Product Management Logic ---

window.previewMainImage = (input, previewId) => {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; margin-top: 10px;">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.toggleVariantSection = (checked) => {
    document.getElementById('variants-container').style.display = checked ? 'block' : 'none';
    document.getElementById('p-main-image-group').style.display = checked ? 'none' : 'block';
};

window.addVariantField = () => {
    const list = document.getElementById('variant-list');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'variant-row';
    div.style = "display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.5fr 40px auto; gap: 10px; margin-bottom: 10px; align-items: end;";
    div.innerHTML = `
        <div class="input-group"><label>Variant Name</label><input type="text" class="v-name" placeholder="e.g. Blue, XL"></div>
        <div class="input-group"><label>Cost</label><input type="number" class="v-cost"></div>
        <div class="input-group"><label>Price</label><input type="number" class="v-price"></div>
        <div class="input-group"><label>Discount (%)</label><input type="number" class="v-discount" value="0"></div>
        <div class="input-group"><label>Stock</label><input type="number" class="v-stock"></div>
        <div class="input-group"><label>Image</label><input type="file" onchange="previewVariantImage(this, 'v-prev-${id}')"></div>
        <div id="v-prev-${id}" style="width:40px; height:40px;"></div>
        <button type="button" onclick="this.parentElement.remove()" class="icon-btn delete">×</button>
    `;
    list.appendChild(div);
};

window.previewVariantImage = (input, previewId) => {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.addProduct = async (e) => {
    e.preventDefault();
    const name = document.getElementById('p-name').value;
    const category = document.getElementById('p-category').value;
    const discount = parseFloat(document.getElementById('p-discount').value) || 0;
    const hasVariants = document.getElementById('p-has-variants').checked;

    let productData = {
        name,
        sku: document.getElementById('p-sku').value.trim(),
        category,
        discount,
        hasVariants,
        payMethods: {
            cod: document.getElementById('p-pay-cod').checked,
            bank: document.getElementById('p-pay-bank').checked,
            shop: document.getElementById('p-pay-shop').checked
        },
        storeId: window.getStoreId(),
        timestamp: serverTimestamp()
    };

    if (hasVariants) {
        const variants = [];
        const rows = document.querySelectorAll('#variant-list .variant-row');
        for (const row of rows) {
            const vImageFile = row.querySelector('input[type="file"]').files[0];
            let vImageUrl = "";
            if (vImageFile) {
                vImageUrl = await toBase64(vImageFile);
            }
            variants.push({
                name: row.querySelector('.v-name').value,
                cost: parseFloat(row.querySelector('.v-cost').value) || 0,
                price: parseFloat(row.querySelector('.v-price').value) || 0,
                discount: parseFloat(row.querySelector('.v-discount').value) || 0,
                stock: parseInt(row.querySelector('.v-stock').value) || 0,
                image: vImageUrl
            });
        }
        productData.variants = variants;
        if (variants.length > 0) {
            productData.cost = variants[0].cost;
            productData.price = variants[0].price;
            productData.discount = variants[0].discount;
            productData.stock = variants.reduce((sum, v) => sum + v.stock, 0);
            productData.image = variants[0].image;
        }
    } else {
        const imageFile = document.getElementById('p-image').files[0];
        productData.cost = parseFloat(document.getElementById('p-cost').value) || 0;
        productData.price = parseFloat(document.getElementById('p-price').value) || 0;
        productData.wholesalePrice = parseFloat(document.getElementById('p-wholesale-price').value) || 0;
        productData.loyaltyPrice = parseFloat(document.getElementById('p-loyalty-price').value) || 0;
        productData.stock = parseInt(document.getElementById('p-stock').value) || 0;
        productData.mode = document.getElementById('p-mode')?.value || 'Shop';
        if (imageFile) {
            productData.image = await toBase64(imageFile);
        }
    }

    try {
        await addDoc(productsCol, productData);
        window.showToast("✅ Product published!", "success");
        document.getElementById('product-form-modal').style.display = 'none';
        e.target.reset();
        document.getElementById('p-image-preview').innerHTML = "";
        document.getElementById('variant-list').innerHTML = "";
    } catch (err) {
        console.error(err);
        window.showToast("❌ Error publishing product", "error");
    }
};

window.toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
const toBase64 = window.toBase64;

// --- Edit Modal Functions ---

window.openEditModal = async (docId) => {
    const product = window.allProducts.find(p => p.docId === docId);
    if (!product) return;

    window.currentEditingId = docId;
    document.getElementById('edit-p-name').value = product.name;
    document.getElementById('edit-p-sku').value = product.sku || '';
    document.getElementById('edit-p-category').value = product.category;
    document.getElementById('edit-p-cost').value = product.cost || 0;
    document.getElementById('edit-p-price').value = product.price || 0;
    if (document.getElementById('edit-p-wholesale-price')) {
        document.getElementById('edit-p-wholesale-price').value = product.wholesalePrice || 0;
    }
    if (document.getElementById('edit-p-loyalty-price')) {
        document.getElementById('edit-p-loyalty-price').value = product.loyaltyPrice || 0;
    }
    document.getElementById('edit-p-discount').value = product.discount || 0;
    document.getElementById('edit-p-stock').value = product.stock || 0;
    if (document.getElementById('edit-p-mode')) {
        document.getElementById('edit-p-mode').value = product.mode || 'Shop';
    }
    document.getElementById('edit-p-has-variants').checked = product.hasVariants || false;

    document.getElementById('edit-p-pay-cod').checked = product.payMethods?.cod ?? true;
    document.getElementById('edit-p-pay-bank').checked = product.payMethods?.bank ?? true;
    document.getElementById('edit-p-pay-shop').checked = product.payMethods?.shop ?? true;

    const preview = document.getElementById('edit-p-image-preview');
    preview.innerHTML = product.image ? `<img src="${product.image}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; margin-top: 10px;">` : "";

    const variantList = document.getElementById('edit-variant-list');
    variantList.innerHTML = "";
    if (product.hasVariants && product.variants) {
        product.variants.forEach(v => window.addEditVariantField(v));
    }
    window.toggleEditVariantSection(product.hasVariants || false);

    document.getElementById('edit-modal').style.display = 'flex';
};

window.closeEditModal = () => {
    document.getElementById('edit-modal').style.display = 'none';
};

window.toggleEditVariantSection = (checked) => {
    const varContainer = document.getElementById('edit-variants-container');
    const baseFields = document.getElementById('edit-p-base-fields');
    const imgGroup = document.getElementById('edit-p-main-image-group');
    if (varContainer) varContainer.style.display = checked ? 'block' : 'none';
    if (baseFields) baseFields.style.display = checked ? 'none' : 'block';
    if (imgGroup) imgGroup.style.display = checked ? 'none' : 'block';
};

window.addEditVariantField = (data = null) => {
    const list = document.getElementById('edit-variant-list');
    const id = Date.now() + Math.random();
    const div = document.createElement('div');
    div.className = 'variant-row';
    div.style = "display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.5fr 40px auto; gap: 10px; margin-bottom: 10px; align-items: end;";
    div.innerHTML = `
        <div class="input-group"><label>Variant Name</label><input type="text" class="v-name" value="${data ? data.name : ''}"></div>
        <div class="input-group"><label>Cost</label><input type="number" class="v-cost" value="${data ? data.cost : 0}"></div>
        <div class="input-group"><label>Price</label><input type="number" class="v-price" value="${data ? data.price : 0}"></div>
        <div class="input-group"><label>Discount (%)</label><input type="number" class="v-discount" value="${data && data.discount ? data.discount : 0}"></div>
        <div class="input-group"><label>Stock</label><input type="number" class="v-stock" value="${data ? data.stock : 0}"></div>
        <div class="input-group"><label>Image</label><input type="file" onchange="previewVariantImage(this, 'ev-prev-${id}')"></div>
        <div id="ev-prev-${id}" style="width:40px; height:40px;">${data && data.image ? `<img src="${data.image}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">` : ''}</div>
        <button type="button" onclick="this.parentElement.remove()" class="icon-btn delete">×</button>
    `;
    list.appendChild(div);
};

window.updateProduct = async (e) => {
    e.preventDefault();
    const docId = window.currentEditingId;
    if (!docId) return;

    const category = document.getElementById('edit-p-category').value;
    const hasVariants = document.getElementById('edit-p-has-variants').checked;
    const products = window.allProducts || [];
    const product = products.find(p => p.docId === docId);

    let updates = {
        category,
        sku: document.getElementById('edit-p-sku').value.trim(),
        hasVariants,
        payMethods: {
            cod: document.getElementById('edit-p-pay-cod').checked,
            bank: document.getElementById('edit-p-pay-bank').checked,
            shop: document.getElementById('edit-p-pay-shop').checked
        }
    };

    if (hasVariants) {
        const variants = [];
        const rows = document.querySelectorAll('#edit-variant-list .variant-row');
        for (const row of rows) {
            const vImageFile = row.querySelector('input[type="file"]').files[0];
            let vImageUrl = row.querySelector('img')?.src || "";
            if (vImageFile) {
                vImageUrl = await window.toBase64(vImageFile);
            }
            variants.push({
                name: row.querySelector('.v-name').value,
                cost: parseFloat(row.querySelector('.v-cost').value) || 0,
                price: parseFloat(row.querySelector('.v-price').value) || 0,
                discount: parseFloat(row.querySelector('.v-discount').value) || 0,
                stock: parseInt(row.querySelector('.v-stock').value) || 0,
                image: vImageUrl
            });
        }
        updates.variants = variants;
        if (variants.length > 0) {
            updates.cost = variants[0].cost;
            updates.price = variants[0].price;
            updates.discount = variants[0].discount;
            updates.stock = variants.reduce((sum, v) => sum + v.stock, 0);
            updates.image = variants[0].image;
        }
    } else {
        const imageFile = document.getElementById('edit-p-image')?.files[0];
        updates.cost = parseFloat(document.getElementById('edit-p-cost').value) || 0;
        updates.price = parseFloat(document.getElementById('edit-p-price').value) || 0;
        updates.wholesalePrice = parseFloat(document.getElementById('edit-p-wholesale-price')?.value) || 0;
        updates.loyaltyPrice = parseFloat(document.getElementById('edit-p-loyalty-price')?.value) || 0;
        updates.stock = parseInt(document.getElementById('edit-p-stock').value) || 0;
        updates.mode = document.getElementById('edit-p-mode')?.value || 'Shop';
        updates.discount = parseFloat(document.getElementById('edit-p-discount').value) || 0;

        if (imageFile) {
            updates.image = await window.toBase64(imageFile);
        }
    }

    try {
        await updateDoc(doc(db, 'products', docId), updates);
        window.showToast("✅ Product updated!", "success");
        window.closeEditModal();
    } catch (err) {
        console.error(err);
        window.showToast("❌ Error updating product", "error");
    }
};

window.filterAdminProducts = (val) => {
    // Re-render UI: the render function already checks for search input
    window.renderAdminProductsUI(window.allProducts || []);
};

// --- Category Functions ---

window.addCategory = async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    try {
        await addDoc(categoriesCol, { name, storeId: window.getStoreId() });
        e.target.reset();
        window.showToast("✅ Category added!", "success");
    } catch (err) { console.error(err); }
};

window.renderCategoriesUI = (categories) => {
    const list = document.getElementById('admin-category-list');
    if (!list) return;
    const filtered = window.filterByStore(categories);
    list.innerHTML = filtered.map(c => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px 15px; border-radius: 12px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
            <span style="font-weight: 700;">${c.name}</span>
            <button class="icon-btn delete" onclick="deleteCategory('${c.docId}')">🗑️</button>
        </div>
    `).join('');
};

window.deleteCategory = async (id) => {
    if (confirm("Delete this category?")) {
        await deleteDoc(doc(db, 'categories', id));
        window.showToast("Category removed.", "info");
    }
};

window.populateCategoryDropdowns = (categories) => {
    const pCat = document.getElementById('p-category');
    const eCat = document.getElementById('edit-p-category');
    const filtered = window.filterByStore(categories);
    const options = filtered.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    if (pCat) pCat.innerHTML = options;
    if (eCat) eCat.innerHTML = options;
};

// --- Extra Utility Functions ---

window.removeDuplicateProducts = async () => {
    if (!confirm("Are you sure you want to remove products with identical names? (Keeps oldest version)")) return;
    const products = window.allProducts || [];
    const seen = new Set();
    const batch = writeBatch(db);
    let count = 0;

    products.forEach(p => {
        if (seen.has(p.name)) {
            batch.delete(doc(db, 'products', p.docId));
            count++;
        } else {
            seen.add(p.name);
        }
    });

    if (count > 0) {
        await batch.commit();
        window.showToast(`✅ Cleaned ${count} duplicates!`, "success");
    } else {
        window.showToast("No duplicates found.", "info");
    }
};

window.downloadProductsCSV = () => {
    const products = window.allProducts || [];
    let csv = "Name,ShortCode(SKU),Category,Price,Stock,Cost\n";
    products.forEach(p => csv += `"${p.name}","${p.sku || ''}",${p.category},${p.price},${p.stock},${p.cost || 0}\n`);
    downloadFile(csv, "products_catalog.csv");
};

window.downloadOrdersCSV = () => {
    const orders = window.allOrders || [];
    let csv = "OrderID,Date,Customer,Phone,Total,Status,Payment\n";
    orders.forEach(o => csv += `${o.orderId},${o.date},"${o.userName}",${o.phone},${o.total},${o.status},${o.paymentMethod}\n`);
    downloadFile(csv, "orders_export.csv");
};

window.applyDateFilter = () => {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    if (!start || !end) return window.showToast("Select start and end dates.", "error");

    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    const filteredOrders = (window.allOrders || []).filter(o => {
        const d = (o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date));
        return d >= startDate && d <= endDate;
    });

    generateReports(filteredOrders);
    window.showToast(`Showing stats from ${start} to ${end}`, "info");
};

window.resetDateFilter = () => {
    document.getElementById('report-start-date').value = "";
    document.getElementById('report-end-date').value = "";
    if (window.allOrders) generateReports(window.allOrders);
};

window.downloadReportPDF = () => {
    window.print();
};

window.handleBulkUpload = async () => {
    const fileInput = document.getElementById('bulk-file-input');
    const status = document.getElementById('bulk-status');
    if (!fileInput.files[0]) return window.showToast("Select a CSV file first.", "warning");

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n').filter(row => row.trim() !== '').slice(1);
        const batch = writeBatch(db);
        let count = 0;

        rows.forEach(row => {
            const cols = row.split(',');
            if (cols.length >= 3) {
                const name = cols[0].replace(/"/g, '').trim();
                const sku = cols[1] ? cols[1].trim() : '';
                const category = cols[2] ? cols[2].trim() : '';
                const price = parseFloat(cols[3]) || 0;
                const stock = parseInt(cols[4]) || 0;
                const cost = parseFloat(cols[5]) || 0;

                if (name) {
                    const newDoc = doc(collection(db, 'products'));
                    batch.set(newDoc, {
                        name, sku, category, price, stock, cost,
                        image: "/logo.png",
                        hasVariants: false,
                        payMethods: { cod: true, bank: true, shop: true },
                        timestamp: serverTimestamp()
                    });
                    count++;
                }
            }
        });

        if (count > 0) {
            status.innerText = "Uploading...";
            await batch.commit();
            status.innerText = `Uploaded ${count} products!`;
            window.showToast(`✅ Successfully uploaded ${count} products!`, "success");
            fileInput.value = "";
        }
    };
    reader.readAsText(file);
};

window.calcInput = (val) => {
    const disp = document.getElementById('calc-display');
    if (disp) disp.value += val;
};
window.calcClear = () => {
    const disp = document.getElementById('calc-display');
    if (disp) disp.value = '';
};
window.calcResult = () => {
    const disp = document.getElementById('calc-display');
    if (!disp) return;
    try {
        const sanitized = disp.value.replace(/[^0-9+\-*/.]/g, '');
        disp.value = eval(sanitized);
    } catch (e) {
        disp.value = "Error";
    }
};

window.showCalculator = () => {
    document.getElementById('calc-display').value = '';
    document.getElementById('calc-modal').style.display = 'flex';
};

window.showRepairIntake = () => {
    window.currentRepairJobId = 'JOB-' + Math.floor(Math.random() * 90000 + 10000);
    document.getElementById('repair-intake-modal').style.display = 'flex';
    document.getElementById('rep-job-id-display').innerText = window.currentRepairJobId;
    document.getElementById('rep-cust-name').value = '';
    document.getElementById('rep-cust-phone').value = '';
    document.getElementById('rep-item-desc').value = '';
    document.getElementById('rep-issue').value = '';
    document.getElementById('rep-est-cost').value = '0';
    document.getElementById('rep-advance').value = '0';
};

const getA5InvoiceHTML = (jobId, date, name, phone, desc, issue, cost, advance, balance) => {
    const issueText = issue ? issue.replace(/\n/g, ' ') : 'N/A';
    return `
    <div class="invoice-container" style="width: 210mm; height: 148.5mm; box-sizing: border-box; background: white; font-family: Arial, Helvetica, sans-serif; padding: 12mm 15mm; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #002060; padding-bottom: 15px; margin-bottom: 15px;">
            <div>
                <h1 style="margin: 0; color: #002060; font-size: 28px; text-transform: uppercase; font-weight: 900; letter-spacing: 1px;">MEC Book Shop</h1>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Premium Book Shop & Tech Repair Hub</p>
            </div>
            <div style="text-align: right;">
                <h2 style="margin: 0; color: #ef4444; font-size: 22px; letter-spacing: 1px; font-weight: 800; text-transform: uppercase;">Repair Invoice</h2>
                <p style="margin: 6px 0 0 0; color: #0f172a; font-weight: bold; font-size: 14px;">Job ID: ${jobId}</p>
                <p style="margin: 3px 0 0 0; color: #64748b; font-size: 12px;">Date: ${date}</p>
            </div>
        </div>

        <div style="display: flex; gap: 20px; margin-bottom: 15px;">
            <div style="flex: 1; background: #f8fafc; padding: 12px; border-radius: 10px; border-left: 4px solid #002060;">
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 12px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">Customer Details</h3>
                <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #475569;">Name:</strong> <span style="font-weight: 600; color: #0f172a;">${name || 'N/A'}</span></p>
                <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #475569;">Phone:</strong> <span style="font-weight: 600; color: #0f172a;">${phone || 'N/A'}</span></p>
            </div>
            <div style="flex: 1; background: #f8fafc; padding: 12px; border-radius: 10px; border-left: 4px solid #0ea5e9;">
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 12px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">Item Details</h3>
                <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #475569;">Item:</strong> <span style="font-weight: 600; color: #0f172a;">${desc || 'N/A'}</span></p>
                <p style="margin: 4px 0; font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><strong style="color: #475569;">Issue:</strong> <span style="font-weight: 500; color: #334155;">${issueText}</span></p>
            </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
            <thead>
                <tr style="background: #002060; color: white;">
                    <th style="padding: 10px 15px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-top-left-radius: 8px; border-bottom-left-radius: 8px;">Payment Description</th>
                    <th style="padding: 10px 15px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-top-right-radius: 8px; border-bottom-right-radius: 8px;">Amount (LKR)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 10px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #334155;">Estimated Service Charge</td>
                    <td style="padding: 10px 15px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 14px; font-weight: bold; color: #0f172a;">${cost.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 15px; font-size: 14px; font-weight: 600; color: #16a34a;">Advance Paid</td>
                    <td style="padding: 10px 15px; text-align: right; font-size: 14px; font-weight: bold; color: #16a34a;">- ${advance.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end;">
            <div style="background: #f1f5f9; padding: 10px 20px; border-radius: 10px; display: inline-block;">
                <span style="font-size: 13px; font-weight: 800; color: #0f172a; margin-right: 15px; text-transform: uppercase;">Balance Due:</span>
                <span style="font-size: 18px; font-weight: 900; color: #ef4444;">LKR ${balance.toFixed(2)}</span>
            </div>
        </div>

        <div style="position: absolute; bottom: 8mm; left: 15mm; right: 15mm; font-size: 10px; color: #64748b; text-align: center; border-top: 2px dashed #cbd5e1; padding-top: 8px;">
            <p style="margin: 2px 0; font-weight: 500;">* Please bring this receipt when collecting your item.</p>
            <p style="margin: 2px 0; font-weight: 500;">* Repairs might take 3-5 days. We are not responsible for unclaimed items after 30 days.</p>
            <p style="margin: 5px 0 0; font-weight: 800; color: #002060; font-size: 12px; letter-spacing: 0.5px;">THANK YOU FOR CHOOSING MEC BOOK SHOP!</p>
        </div>
    </div>
    `;
};

const saveRepairJob = async (jobId, name, phone, desc, issue, cost, advance, balance) => {
    try {
        await addDoc(repairJobsCol, {
            jobId,
            customerName: name,
            customerPhone: phone,
            itemDescription: desc,
            issue: issue,
            estimatedCost: cost,
            advancePayment: advance,
            balanceDue: balance,
            status: 'New',
            storeId: window.getStoreId(),
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error saving repair job: ", e);
    }
};

window.generateRepairReceipt = async () => {
    const name = document.getElementById('rep-cust-name').value;
    const phone = document.getElementById('rep-cust-phone').value;
    const desc = document.getElementById('rep-item-desc').value;
    const issue = document.getElementById('rep-issue').value;
    const cost = parseFloat(document.getElementById('rep-est-cost').value) || 0;
    const advance = parseFloat(document.getElementById('rep-advance').value) || 0;
    const balance = cost - advance;
    const date = new Date().toLocaleString();
    const jobId = window.currentRepairJobId || ('JOB-' + Math.floor(Math.random() * 90000 + 10000));

    await saveRepairJob(jobId, name, phone, desc, issue, cost, advance, balance);

    const invoiceHTML = getA5InvoiceHTML(jobId, date, name, phone, desc, issue, cost, advance, balance);

    const printWindow = window.open('', '', 'width=900,height=650');
    printWindow.document.write(`
        <html>
        <head>
            <title>Repair Intake ${jobId}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800;900&display=swap" rel="stylesheet">
            <style>
                body { font-family: Arial, Helvetica, sans-serif; background: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .invoice-container { box-shadow: 0 10px 25px rgba(0,0,0,0.1); margin: 20px; }
                @media print {
                    @page { size: A5 landscape; margin: 0; }
                    body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; align-items: flex-start; }
                    .invoice-container { box-shadow: none; margin: 0; }
                }
            </style>
        </head>
        <body>
            ${invoiceHTML}
            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 800); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
    document.getElementById('repair-intake-modal').style.display = 'none';
};

window.downloadRepairPDF = async () => {
    const name = document.getElementById('rep-cust-name').value;
    const phone = document.getElementById('rep-cust-phone').value;
    const desc = document.getElementById('rep-item-desc').value;
    const issue = document.getElementById('rep-issue').value;
    const cost = parseFloat(document.getElementById('rep-est-cost').value) || 0;
    const advance = parseFloat(document.getElementById('rep-advance').value) || 0;
    const balance = cost - advance;
    const date = new Date().toLocaleString();
    const jobId = window.currentRepairJobId || ('JOB-' + Math.floor(Math.random() * 90000 + 10000));

    await saveRepairJob(jobId, name, phone, desc, issue, cost, advance, balance);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = getA5InvoiceHTML(jobId, date, name, phone, desc, issue, cost, advance, balance);

    const opt = {
        margin:       0,
        filename:     `${jobId}_Repair_Invoice.pdf`,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 4, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a5', orientation: 'landscape' }
    };

    if (window.html2pdf) {
        window.html2pdf().set(opt).from(tempDiv).save().then(() => {
             document.getElementById('repair-intake-modal').style.display = 'none';
             window.showToast("✅ A5 PDF Invoice Downloaded Successfully", "success");
        });
    } else {
        alert("PDF generator not loaded. Refreshing or checking connection may help.");
    }
};

window.shareRepairWhatsApp = async () => {
    const name = document.getElementById('rep-cust-name').value;
    let phone = document.getElementById('rep-cust-phone').value;
    const desc = document.getElementById('rep-item-desc').value;
    const issue = document.getElementById('rep-issue').value;
    const cost = parseFloat(document.getElementById('rep-est-cost').value) || 0;
    const advance = parseFloat(document.getElementById('rep-advance').value) || 0;
    const balance = cost - advance;
    const jobId = window.currentRepairJobId || ('JOB-' + Math.floor(Math.random() * 90000 + 10000));

    if(!phone) {
        alert("Please enter a customer phone number first.");
        return;
    }

    await saveRepairJob(jobId, name, phone, desc, issue, cost, advance, balance);
    document.getElementById('repair-intake-modal').style.display = 'none';

    if(phone.startsWith('0')) {
        phone = '94' + phone.substring(1);
    }

    const message = `*MEC SERVICES - REPAIR INTAKE BILL* 🔧\n\n*Job ID:* ${jobId}\n*Customer:* ${name}\n*Item:* ${desc}\n*Reported Issue:* ${issue}\n\n*Estimated Service Charge:* LKR ${cost.toFixed(2)}\n*Advance Paid:* LKR ${advance.toFixed(2)}\n*Balance Due:* LKR ${balance.toFixed(2)}\n\nThank you for choosing MEC Services! We will notify you when the repair is ready.`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
};

// --- HRM System Logic ---
window.generateEmployeeID = (force = false) => {
    const regnoInput = document.getElementById('emp-regno');
    if (!regnoInput || window.editingEmployeeId) return;

    const filtered = window.filterByStore(window.allEmployees || []);
    const nextId = 'EMP-' + String(filtered.length + 1).padStart(3, '0');
    
    const currentVal = regnoInput.value.trim();
    // Only update if it's currently a default/placeholder value OR if we are forcing it (on page load)
    const isBlankOrDefault = !currentVal || currentVal === '' || currentVal === 'EMP-001' || currentVal === 'EMP-000';

    if (force || isBlankOrDefault) {
        if (regnoInput.value !== nextId) {
            regnoInput.value = nextId;
        }
    }
};

window.showHRMSubTab = (tab) => {
    document.querySelectorAll('.hrm-sub-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`hrm-sub-${tab}`).style.display = 'block';
    document.getElementById(`hrm-btn-${tab}`).classList.add('active');

    if (tab === 'employees' && !window.editingEmployeeId) {
        window.generateEmployeeID();
    }
};

function renderAdminEmployeesUI(employees) {
    const listDiv = document.getElementById('admin-employee-list');
    const tableBody = document.getElementById('employee-list-table-body');
    if (!listDiv) return;
    const storeId = window.getStoreId();
    
    // Branch Filter Logic for HRM
    const userRole = sessionStorage.getItem('userRole');
    const userBranch = sessionStorage.getItem('userBranchId');

    const filtered = employees.filter(emp => {
        // Store Filter (SaaS boundaries)
        const isMainMec = (storeId === 'mec-book-shop' || storeId === 'mec-pos-shop' || storeId === 'mec-pos' || storeId === 'master');
        
        if (emp.storeId && emp.storeId !== storeId) return false;
        if (!emp.storeId && !isMainMec) return false;

        // Branch Visibility
        if (userRole !== 'Admin' && userRole !== 'SuperAdmin' && userRole !== 'CEO_Admin') {
            // Staff only see their own branch
            if (emp.branchId && emp.branchId !== userBranch) return false;
            if (!emp.branchId && userBranch !== 'Global') return false;
        } else {
            // Admins see all matching branches for the store, filtered by the dropdown
            if (activeBranchFilter !== 'All' && emp.branchId !== activeBranchFilter) return false;
        }
        return true;
    });

    listDiv.innerHTML = filtered.map(emp => {
        const branchName = emp.branchId === 'Global' ? 'Main Office' : (window.allBranches?.find(b => b.docId === emp.branchId)?.name || 'N/A');
        const safeName = emp.name || 'Unknown';
        return `
        <div class="employee-card">
            <div style="position:absolute; top:12px; left:12px; background:var(--primary-blue); color:white; font-size:0.65rem; padding:3px 8px; border-radius:10px; font-weight:800;">${emp.regno || 'NO-ID'}</div>
            <div class="emp-avatar">${safeName.charAt(0).toUpperCase()}</div>
            <div class="emp-name">${safeName}</div>
            <div class="emp-role">${emp.role}</div>
            <div style="font-size:0.75rem; color:var(--primary-blue); font-weight:700; margin-bottom:5px;">🏢 ${branchName}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">📞 ${emp.phone}</div>
            <div style="font-weight:700; color:var(--success-green);">Basic: LKR ${emp.salary || 0}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--primary-blue);">Commission: ${emp.commission || 0}%</div>
            <div style="position:absolute; top:15px; right:15px; display:flex; gap:8px;">
                <button onclick="window.editEmployee('${emp.docId}')" style="border:none; background:none; cursor:pointer; opacity:0.5; font-size:1.1rem;" title="Edit Staff">✏️</button>
                <button onclick="confirmDeleteEmployee('${emp.docId}')" style="border:none; background:none; cursor:pointer; opacity:0.3; font-size:1.1rem;" title="Delete Staff">🗑️</button>
            </div>
        </div>
    `;
    }).join('');

    if (tableBody) {
        tableBody.innerHTML = filtered.map(emp => {
            return `
                <tr>
                    <td>${emp.regno || '-'}</td>
                    <td style="font-weight:bold; color:var(--primary-blue);">${emp.name || 'Unknown'}</td>
                    <td>${emp.phone}</td>
                    <td>${emp.address || '-'}</td>
                    <td>${emp.username || '-'}</td>
                    <td><span style="background:#f1f5f9; padding:3px 8px; border-radius:5px; font-family:monospace; user-select:all;">${emp.password || '-'}</span></td>
                    <td>
                        <button onclick="window.editEmployee('${emp.docId}')" class="icon-btn edit">✏️</button>
                        <button onclick="confirmDeleteEmployee('${emp.docId}')" class="icon-btn delete">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

window.downloadEmployeeExcel = () => {
    const tableBody = document.getElementById('employee-list-table-body');
    if (!tableBody) return;
    
    let csv = "Register No,Name,Phone,Address,System Username,System Password\n";
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 6) {
            const reg = cols[0].innerText.trim();
            const name = cols[1].innerText.trim();
            const phone = cols[2].innerText.trim();
            const addr = cols[3].innerText.trim();
            const usr = cols[4].innerText.trim();
            const pwd = cols[5].innerText.trim();
            csv += `"${reg}","${name}","${phone}","${addr}","${usr}","${pwd}"\n`;
        }
    });

    downloadFile(csv, "employee_list.csv");
};

function syncAttendanceUI() {
    const tableBody = document.getElementById('attendance-log-body');
    const filterDateInput = document.getElementById('attendance-date-filter');
    if (!tableBody) return;

    if (!filterDateInput.value) filterDateInput.value = new Date().toISOString().split('T')[0];
    const selectedDate = filterDateInput.value;
    const employees = window.allEmployees || [];
    const attendance = window.allAttendance || [];

    tableBody.innerHTML = employees.map(emp => {
        const record = attendance.find(a => a.empId === emp.docId && a.date === selectedDate);
        const status = record ? record.status : 'Pending';
        const badgeClass = status === 'Present' ? 'success' : (status === 'Absent' ? 'danger' : 'warning');

        return `
            <tr>
                <td style="font-weight:700;">${emp.name}</td>
                <td>${emp.role}</td>
                <td>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button onclick="markAttendance('${emp.docId}', 'Present')" class="action-btn ${status === 'Present' ? 'success' : ''}" style="padding:4px 8px; font-size:0.7rem;">Present</button>
                        <button onclick="markAttendance('${emp.docId}', 'Absent')" class="action-btn ${status === 'Absent' ? 'danger' : ''}" style="padding:4px 8px; font-size:0.7rem;">Absent</button>
                    </div>
                </td>
                <td>${record?.time || '--:--'}</td>
                <td>${record?.note || '-'}</td>
            </tr>
        `;
    }).join('');
}

window.markAttendance = async (empId, status) => {
    const date = document.getElementById('attendance-date-filter').value;
    const existing = (window.allAttendance || []).find(a => a.date === date && a.empId === empId);

    const data = {
        empId,
        date,
        status,
        time: new Date().toLocaleTimeString(),
        timestamp: serverTimestamp()
    };

    if (existing) {
        await updateDoc(doc(db, 'attendance', existing.docId), data);
    } else {
        await addDoc(attendanceCol, data);
    }
    window.showToast(`Marked ${status} for Staff`, "success");
};

function renderAdminPayrollUI(payroll) {
    const listDiv = document.getElementById('admin-payroll-list');
    if (!listDiv) return;
    listDiv.innerHTML = payroll.length === 0 ? '<p>No history found.</p>' : payroll.map(p => `
        <div style="padding:15px; background:#f8fafc; border-radius:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-weight:800; color:var(--primary-blue);">${p.empName}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${p.month} | ${p.note}</div>
            </div>
            <div style="font-weight:900; color:var(--primary-blue);">LKR ${p.amount}</div>
        </div>
    `).join('');
}

function populatePayrollStaffDropdown(employees) {
    const paySelect = document.getElementById('pay-emp-id');
    const posSelect = document.getElementById('pos-cashier-id');
    const filtered = window.filterByStore(employees);

    const options = '<option value="">Select Employee</option>' + filtered.map(e => `<option value="${e.docId}">${e.name}</option>`).join('');

    if (paySelect) paySelect.innerHTML = options;
    if (posSelect) posSelect.innerHTML = options;
}

window.calculateStaffPayroll = () => {
    const empId = document.getElementById('pay-emp-id').value;
    const monthStr = document.getElementById('pay-month').value; // YYYY-MM
    const infoBox = document.getElementById('payroll-calc-info');
    const amountInput = document.getElementById('pay-amount');

    if (!empId || !monthStr) {
        infoBox.style.display = 'none';
        return;
    }

    const emp = (window.allEmployees || []).find(e => e.docId === empId);
    if (!emp) return;

    // Filter sales for this employee in this month
    const [year, month] = monthStr.split('-');
    const sales = (window.allOrders || []).filter(o => {
        if (!o.isPOS || o.staffId !== empId) return false;
        const d = (o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000) : new Date(o.date));
        return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
    });

    const totalSales = sales.reduce((sum, o) => sum + (o.total || 0), 0);
    const commissionPct = parseFloat(emp.commission || 0);
    const commissionEarned = totalSales * (commissionPct / 100);
    const basicSalary = parseFloat(emp.salary || 0);
    const totalPayable = basicSalary + commissionEarned;

    document.getElementById('calc-base-salary').innerText = `LKR ${basicSalary.toFixed(2)}`;
    document.getElementById('calc-monthly-sales').innerText = `LKR ${totalSales.toFixed(2)}`;
    document.getElementById('calc-commission').innerText = `LKR ${commissionEarned.toFixed(2)} (${commissionPct}%)`;
    document.getElementById('calc-total-payable').innerText = `LKR ${totalPayable.toFixed(2)}`;

    amountInput.value = totalPayable.toFixed(2);
    infoBox.style.display = 'block';
};

window.editingEmployeeId = null;

window.editEmployee = (docId) => {
    const emp = (window.allEmployees || []).find(e => e.docId === docId);
    if (!emp) return;

    window.editingEmployeeId = docId;
    document.getElementById('emp-name').value = emp.name || '';
    document.getElementById('emp-role').value = emp.role || 'Other';
    document.getElementById('emp-phone').value = emp.phone || '';
    document.getElementById('emp-regno').value = emp.regno || '';
    document.getElementById('emp-address').value = emp.address || '';
    document.getElementById('emp-salary').value = emp.salary || 0;
    document.getElementById('emp-commission').value = emp.commission || 0;
    document.getElementById('emp-username').value = emp.username || '';
    document.getElementById('emp-password').value = emp.password || '';
    document.getElementById('emp-access-role').value = emp.role_access || 'none';
    document.getElementById('emp-branch-id').value = emp.branchId || 'Global';

    const submitBtn = document.querySelector('#employee-form button[type="submit"]');
    if (submitBtn) submitBtn.innerText = "💾 Save Changes";

    document.getElementById('emp-name').focus();
    // Scroll to form
    document.getElementById('employee-form').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('employee-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('emp-name').value;
    const role = document.getElementById('emp-role').value;
    const phone = document.getElementById('emp-phone').value;
    const regno = document.getElementById('emp-regno').value;
    const address = document.getElementById('emp-address').value;
    const salary = document.getElementById('emp-salary').value;
    const commission = document.getElementById('emp-commission').value;
    const username = document.getElementById('emp-username').value;
    const password = document.getElementById('emp-password').value;
    const role_access = document.getElementById('emp-access-role').value;
    const branchId = document.getElementById('emp-branch-id').value;
    const storeId = window.getStoreId();

    const staffData = { name, role, phone, regno, address, salary, commission, username, password, role_access, branchId, storeId, timestamp: serverTimestamp() };

    try {
        if (window.editingEmployeeId) {
            await updateDoc(doc(db, 'employees', window.editingEmployeeId), staffData);
            window.showToast("Staff Details Updated!", "success");
            window.editingEmployeeId = null;
            const submitBtn = document.querySelector('#employee-form button[type="submit"]');
            if (submitBtn) submitBtn.innerText = "Register Employee";
        } else {
            await addDoc(employeesCol, staffData);
            window.showToast("Staff Registered Successfully!", "success");
        }
        e.target.reset();
        window.generateEmployeeID(); // Re-generate for next if new
    } catch (err) {
        console.error(err);
        window.showToast("Error processing request!", "error");
    }
});

document.getElementById('payroll-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = document.getElementById('pay-emp-id').value;
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const month = document.getElementById('pay-month').value;
    const note = document.getElementById('pay-note').value;

    const emp = window.allEmployees.find(e => e.docId === empId);
    if (!emp) return;

    await addDoc(payrollCol, { empId, empName: emp.name, amount, month, note, timestamp: serverTimestamp() });

    // Also log as Expense automatically
    await addDoc(expensesCol, {
        title: `Salary: ${emp.name} (${month})`,
        category: 'Salary',
        amount,
        date: new Date().toISOString().split('T')[0],
        timestamp: serverTimestamp()
    });

    e.target.reset();
    window.showToast("Salary Payment Recorded & Linked to Expenses!", "success");
});

window.confirmDeleteEmployee = async (docId) => {
    if (confirm("Delete this staff member? This will NOT delete their history.")) {
        await deleteDoc(doc(db, 'employees', docId));
        window.showToast("Staff Removed", "info");
    }
};

window.showHRMSubTab('employees');

window.updateApp = () => {
    if (confirm("Check & Download latest updates? The system will reload.")) {
        // Clear session cache and reload from server
        if (window.location.reload) {
            window.location.reload(true); // true forces bypass of cache
        } else {
            window.location.href = window.location.href + '?v=' + Date.now();
        }
    }
};

if (sessionStorage.getItem('isAdminLoggedIn')) showAdminActions();



// --- Bulk Deletion for MEC Book Shop (SuperAdmin Clean-up) ---
window.clearAllStaff = async () => {
    const role = sessionStorage.getItem('userRole');
    if (role !== 'SuperAdmin') {
        alert("CRITICAL: Only SuperAdmin can perform this action.");
        return;
    }

    const confirmPurge = confirm("🚨 CRITICAL WARNING!\n\nThis will PERMANENTLY delete ALL existing staff/employee usernames and passwords from the database.\n\nOnly the main 'mecbookshop@gmail.com' will remain.\n\nContinue with deletion?");
    
    if (!confirmPurge) return;

    try {
        const batch = writeBatch(db);
        const snapshot = await getDocs(employeesCol);
        
        if (snapshot.empty) {
            window.showToast("No employee records to clear.", "info");
            return;
        }

        snapshot.docs.forEach((docSnap) => {
            batch.delete(docSnap.ref);
        });

        await batch.commit();
        window.showToast(`System Cleaned: ${snapshot.size} employee records removed.`, "success");
        setTimeout(() => location.reload(), 2000);

    } catch (err) {
        console.error("Purge Error:", err);
        window.showToast("Failed to clear staff list.", "error");
    }
};



// --- Website Developer Functions (Web Studio) ---
window.saveWebBranding = async (e) => {
    e.preventDefault();
    const title = document.getElementById('web-site-title').value;
    const desc = document.getElementById('web-site-desc').value;
    const logoUrl = document.getElementById('web-site-logo-url').value;

    try {
        const storeId = window.getStoreId();
        // Here we would typically update a 'web_config' collection or the 'stores' document
        // For now, let's update it in the store's metadata
        const q = query(storesCol, where("slug", "==", storeId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, "stores", snap.docs[0].id), {
                webTitle: title,
                webDescription: desc,
                webLogo: logoUrl,
                updatedAt: serverTimestamp()
            });
            window.showToast("🚀 Website branding updated successfully!", "success");
        }
    } catch (err) {
        console.error(err);
        window.showToast("Error updating branding", "error");
    }
};

window.saveWebDesign = async () => {
    const primary = document.getElementById('web-theme-primary').value;
    const accent = document.getElementById('web-theme-accent').value;
    const heroBg = document.getElementById('web-hero-bg').value;
    
    const settings = {
        primary,
        accent,
        heroBg,
        showFeatured: document.getElementById('web-show-featured').checked,
        showReviews: document.getElementById('web-show-reviews').checked,
        showServices: document.getElementById('web-show-services').checked,
        forceDarkMode: document.getElementById('web-enable-darkmode').checked
    };

    try {
        const storeId = window.getStoreId();
        const q = query(storesCol, where("slug", "==", storeId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, "stores", snap.docs[0].id), {
                webDesign: settings,
                updatedAt: serverTimestamp()
            });
            window.showToast("🎨 Design changes applied to live site!", "success");
        }
    } catch (err) {
        console.error(err);
        window.showToast("Error saving design", "error");
    }
};

window.saveWebContent = async () => {
    const welcome = document.getElementById('web-hero-welcome').value;
    const announce = document.getElementById('web-announcement').value;
    const footer = document.getElementById('web-footer-name').value;

    try {
        const storeId = window.getStoreId();
        const q = query(storesCol, where("slug", "==", storeId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, "stores", snap.docs[0].id), {
                webContent: { welcome, announce, footer },
                updatedAt: serverTimestamp()
            });
            window.showToast("📝 Website content updated!", "success");
        }
    } catch (err) {
        console.error(err);
        window.showToast("Error saving content", "error");
    }
};

window.loadWebSettings = async () => {
    try {
        const storeId = window.getStoreId();
        const q = query(storesCol, where("slug", "==", storeId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            
            // Branding
            document.getElementById('web-site-title').value = data.webTitle || '';
            document.getElementById('web-site-desc').value = data.webDescription || '';
            document.getElementById('web-site-logo-url').value = data.webLogo || '';
            const preview = document.getElementById('web-logo-preview');
            if (data.webLogo) {
                preview.innerHTML = '';
                preview.style.backgroundImage = `url(${data.webLogo})`;
                preview.style.backgroundSize = 'contain';
                preview.style.backgroundRepeat = 'no-repeat';
                preview.style.backgroundPosition = 'center';
            }

            // Design
            if (data.webDesign) {
                document.getElementById('web-theme-primary').value = data.webDesign.primary || '#002060';
                document.getElementById('web-theme-accent').value = data.webDesign.accent || '#00aeef';
                document.getElementById('web-hero-bg').value = data.webDesign.heroBg || 'gradient';
                document.getElementById('web-show-featured').checked = data.webDesign.showFeatured !== false;
                document.getElementById('web-show-reviews').checked = data.webDesign.showReviews !== false;
                document.getElementById('web-show-services').checked = data.webDesign.showServices !== false;
                document.getElementById('web-enable-darkmode').checked = !!data.webDesign.forceDarkMode;
            }

            // Content
            if (data.webContent) {
                document.getElementById('web-hero-welcome').value = data.webContent.welcome || '';
                document.getElementById('web-announcement').value = data.webContent.announce || '';
                document.getElementById('web-footer-name').value = data.webContent.footer || 'MEC Book Shop System';
            }

            // SEO & Analytics
            if (data.webSEO) {
                document.getElementById('web-seo-keywords').value = data.webSEO.keywords || '';
                document.getElementById('web-analytics-id').value = data.webSEO.analyticsId || '';
                document.getElementById('web-pixel-id').value = data.webSEO.pixelId || '';
                document.getElementById('web-contact-phone').value = data.webSEO.contactPhone || '';
                document.getElementById('web-meta-desc').value = data.webSEO.metaDesc || '';
            }
        }
    } catch (err) {
        console.error("Error loading web settings:", err);
    }
};

window.saveWebSEO = async () => {
    const keywords = document.getElementById('web-seo-keywords').value;
    const analyticsId = document.getElementById('web-analytics-id').value;
    const pixelId = document.getElementById('web-pixel-id').value;
    const contactPhone = document.getElementById('web-contact-phone').value;
    const metaDesc = document.getElementById('web-meta-desc').value;

    try {
        const storeId = window.getStoreId();
        const q = query(storesCol, where("slug", "==", storeId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, "stores", snap.docs[0].id), {
                webSEO: { keywords, analyticsId, pixelId, contactPhone, metaDesc },
                updatedAt: serverTimestamp()
            });
            window.showToast("🔍 SEO & Analytics settings updated!", "success");
        }
    } catch (err) {
        console.error(err);
        window.showToast("Error saving SEO settings", "error");
    }
};
