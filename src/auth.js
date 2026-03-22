import './style.css';
import { auth } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail
} from "firebase/auth";
import { 
    collection, 
    addDoc, 
    serverTimestamp,
    query,
    where,
    getDocs
} from "firebase/firestore";
import { db } from './firebase.js';

// --- SaaS Store Detection ---
const urlParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(p => p !== '');
const slugFromPath = (pathParts[0] && !['index.html', 'track', 'admin', 'login.html'].includes(pathParts[0])) ? pathParts[0] : null;
const currentStoreId = urlParams.get('store') || slugFromPath || 'mec-nexus';

// --- Branding Sync ---
getDocs(query(window.withShop(collection(db, "stores")), where("slug", "==", currentStoreId))).then(snap => {
    if (!snap.empty) {
        const storeData = snap.docs[0].data();
        if (storeData.logoUrl) {
            document.querySelectorAll('.logo-3d-img').forEach(img => {
                img.src = storeData.logoUrl;
            });
        }
        if (storeData.primaryColor) {
            document.documentElement.style.setProperty('--primary-color', storeData.primaryColor);
        }
    }
});

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authMsg = document.getElementById('auth-msg');

// Password Visibility Toggle Logic
const setupPasswordToggle = (toggleId, inputId) => {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (toggle && input) {
        toggle.addEventListener('click', () => {
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);
            toggle.innerText = type === 'password' ? '👁️' : '🔒';
        });
    }
};

setupPasswordToggle('toggle-login-pass', 'login-pass');
setupPasswordToggle('toggle-reg-pass', 'reg-pass');

// Remember Me Logic - Pre-fill
const rememberMeCheckbox = document.getElementById('remember-me');
const loginEmailInput = document.getElementById('login-email');

if (loginEmailInput) {
    const savedEmail = localStorage.getItem('mec_remembered_email');
    if (savedEmail) {
        loginEmailInput.value = savedEmail;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    }
}

tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
});

tabRegister?.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-pass').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // Update Auth Profile
        await updateProfile(user, { displayName: name });

        // Save to Administrative Customers Collection
        const customersCol = collection(db, 'customers');
        const q = query(customersCol, where('email', '==', email));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            // Auto-generate Loyalty Card Number
            const loyaltyCardNo = 'LO-' + Math.floor(100000 + Math.random() * 900000);
            
            await addDoc(customersCol, { shop_id: window.getShopId(),
                name: name,
                email: email,
                phone: phone,
                loyaltyCardNo: loyaltyCardNo,
                customerType: 'retail',
                storeId: currentStoreId,
                timestamp: serverTimestamp(),
                source: 'web_registration'
            });
            console.log("Customer record synchronized to administrative list.");
        }

        authMsg.style.color = 'green';
        authMsg.innerText = 'Registration successful! Synchronizing...';

        // Session Sync
        sessionStorage.setItem('mec_user', JSON.stringify({
            name: name,
            email: email,
            id: user.uid
        }));

        setTimeout(() => window.location.href = '/', 1500);
    } catch (error) {
        authMsg.style.color = '#ef4444';
        authMsg.innerText = error.message;
    }
});

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // Save email if "Remember Me" is checked
        if (document.getElementById('remember-me')?.checked) {
            localStorage.setItem('mec_remembered_email', email);
        } else {
            localStorage.removeItem('mec_remembered_email');
        }

        sessionStorage.setItem('mec_user', JSON.stringify({
            name: user.displayName || user.email,
            email: user.email,
            id: user.uid
        }));

        window.location.href = '/';
    } catch (error) {
        authMsg.style.color = '#ef4444';
        authMsg.innerText = 'Invalid email or password!';
    }
});

const forgotPassLink = document.getElementById('forgot-pass-link');
const resetForm = document.getElementById('reset-form');
const backToLogin = document.getElementById('back-to-login');
const tabButtons = document.querySelector('.auth-tabs-premium');

forgotPassLink?.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    tabButtons.style.display = 'none';
    resetForm.style.display = 'block';
    authMsg.innerText = '';
});

backToLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    resetForm.style.display = 'none';
    tabButtons.style.display = 'flex';
    loginForm.style.display = 'block';
    authMsg.innerText = '';
});

resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const submitBtn = resetForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerText;

    try {
        // Loading status
        submitBtn.disabled = true;
        submitBtn.innerText = 'Sending...';
        authMsg.style.color = 'var(--primary-color)';
        authMsg.innerText = 'Processing your request...';

        await sendPasswordResetEmail(auth, email);

        console.log('Password reset email sent successfully to:', email);
        authMsg.style.color = 'green';
        authMsg.innerText = 'Success! Reset link sent to ' + email + '. Please check your Inbox and Spam folder.';

        resetForm.reset();
        submitBtn.innerText = 'Email Sent';

        setTimeout(() => {
            backToLogin.click();
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }, 5000);

    } catch (error) {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
        console.error('Firebase Reset Error:', error.code, error.message);

        authMsg.style.color = '#ef4444';

        // Custom messages for common errors
        if (error.code === 'auth/user-not-found') {
            authMsg.innerText = 'This email is not registered with MEC Book Shop.';
        } else if (error.code === 'auth/invalid-email') {
            authMsg.innerText = 'Please enter a valid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            authMsg.innerText = 'Too many attempts. Please try again later.';
        } else {
            authMsg.innerText = 'Error: ' + error.message;
        }
    }
});

