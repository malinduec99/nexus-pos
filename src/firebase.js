import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCFGweYcgmcfP5zS6M1ytOfKYKUbHfsols",
    authDomain: "mec-book-shop.firebaseapp.com",
    projectId: "mec-book-shop",
    storageBucket: "mec-book-shop.firebasestorage.app",
    messagingSenderId: "721921338336",
    appId: "1:721921338336:web:bcd6215a75b163145cd985",
    measurementId: "G-M0GZ9BXGBV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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


