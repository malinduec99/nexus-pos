import { db } from './src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function checkStores() {
    const snap = await getDocs(collection(db, 'stores'));
    snap.forEach(doc => {
        console.log("Store:", doc.id, doc.data());
    });
}

checkStores();
