import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBtspqm6Zcdf2McOE8ZUElljFUiNhVn8gQ",
  authDomain: "mec-nexus.firebaseapp.com",
  projectId: "mec-nexus",
  storageBucket: "mec-nexus.firebasestorage.app",
  messagingSenderId: "421466126701",
  appId: "1:421466126701:web:c00e13d9344b9877eb0264",
  measurementId: "G-36E8KS8MZK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- SaaS Multi-Tenancy Helper ---
window.getShopId = () => {
    // Priority: Session (Logged in user) > LocalStorage (Remembered) > Default MEC
    return sessionStorage.getItem('active_shop_id') || localStorage.getItem('active_shop_id') || '00001';
};

window.withShop = (col) => {
    return query(col, where('shop_id', '==', window.getShopId()));
};

// Enable Offline Sync
if (typeof window !== 'undefined') {
    enableMultiTabIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Persistence failed: Multiple tabs open");
        } else if (err.code == 'unimplemented-state') {
            console.warn("Persistence failed: Browser not supported");
        }
    });
}

export { db, auth };


