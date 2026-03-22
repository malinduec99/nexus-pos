import { db } from './src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function checkEmployees() {
    const snap = await getDocs(collection(db, 'employees'));
    snap.forEach(doc => {
        console.log("Employee:", doc.id, doc.data());
    });
}

checkEmployees();
