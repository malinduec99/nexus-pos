import './style.css';
import { db, auth } from './firebase.js';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    serverTimestamp
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// --- SaaS Store Detection ---
const urlParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(p => p !== '');
const slugFromPath = (pathParts[0] && !['index.html', 'track', 'admin', 'login.html'].includes(pathParts[0])) ? pathParts[0] : null;
const currentStoreId = urlParams.get('store') || slugFromPath || 'mec-book-shop';

window.storeInfo = null;
getDocs(query(collection(db, 'stores'), where('slug', '==', currentStoreId))).then(snap => {
    if (!snap.empty) {
        window.storeInfo = snap.docs[0].data();
    }
});

const resultDiv = document.getElementById('tracking-result');
const listView = document.getElementById('list-view');
const historyList = document.getElementById('history-list');

const resOrderId = document.getElementById('res-order-id');
const resStatusBadge = document.getElementById('res-status-badge');
const resDate = document.getElementById('res-date');
const resTotal = document.getElementById('res-total');
const resItemsCount = document.getElementById('res-items-count');
const resItemsList = document.getElementById('res-items-list');
const resCodRow = document.getElementById('res-cod-row');
const resCod = document.getElementById('res-cod');

const confirmSection = document.getElementById('confirm-section');
const reviewSection = document.getElementById('review-section');

let selectedRating = 5;
let currentViewingOrder = null;

const steps = {
    'Pending': document.getElementById('step-pending'),
    'Processing': document.getElementById('step-processing'),
    'Shipped': document.getElementById('step-shipped'),
    'Delivered': document.getElementById('step-delivered')
};

let currentOrders = [];

// Listen for Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadUserOrders(user.uid);
    } else {
        historyList.innerHTML = `
            <div style="padding: 2rem; border: 2px dashed #eee; border-radius: 12px;">
                <p>Please log in to your account to view your orders.</p>
                <a href="/login.html" class="add-to-cart-btn" style="display: inline-block; text-decoration: none; margin-top: 1rem;">Login Now</a>
            </div>
        `;
    }
});

async function loadUserOrders(userId) {
    const ordersCol = collection(db, 'orders');
    const q = query(ordersCol, where("userId", "==", userId));

    onSnapshot(q, (snapshot) => {
        currentOrders = snapshot.docs
            .map(doc => ({ ...doc.data(), docId: doc.id }))
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        renderOrderList();

        // Update detail view if open
        if (currentViewingOrder) {
            const updated = currentOrders.find(o => o.orderId === currentViewingOrder.orderId);
            if (updated) viewOrderDetails(updated.orderId);
        }
    }, (err) => {
        console.error(err);
        historyList.innerHTML = "Error: " + err.message;
    });
}

function renderOrderList() {
    if (currentOrders.length === 0) {
        historyList.innerHTML = `
            <div class="empty-orders">
                <div style="font-size: 4rem; opacity: 0.2; margin-bottom: 1rem;">📦</div>
                <p>You haven't placed any orders yet.</p>
                <button class="category-btn active" onclick="window.location.href='/#products'" style="margin-top: 1rem;">Start Shopping</button>
            </div>
        `;
        return;
    }

    historyList.innerHTML = currentOrders.map(order => `
        <div class="order-card" onclick="viewOrderDetails('${order.orderId}')" style="cursor: pointer;">
            <div class="order-info">
                <div class="order-id">${order.orderId}</div>
                <div class="order-meta">${order.date} • ${order.items?.length || 0} Items</div>
                <div class="order-total">LKR ${(order.total + (order.codCharge || 0)).toFixed(2)}</div>
            </div>
            <div class="order-status-col">
                <span class="status-badge" data-status="${order.status}">
                    ${order.status}
                </span>
            </div>
        </div>
    `).join('');
}

window.viewOrderDetails = (orderId) => {
    const order = currentOrders.find(o => o.orderId === orderId);
    if (!order) return;
    currentViewingOrder = order;

    resOrderId.innerText = order.orderId;
    resDate.innerText = order.date;
    resStatusBadge.innerText = order.status;
    resStatusBadge.setAttribute('data-status', order.status);

    const itemsCount = order.items ? order.items.length : 0;
    resItemsCount.innerText = `${itemsCount} Items`;
    document.getElementById('res-name').innerText = order.userName || 'Customer';

    const total = order.total || 0;
    const codCharge = order.codCharge || 0;
    const grandTotal = total + codCharge;

    resTotal.innerText = grandTotal.toFixed(2);

    if (codCharge > 0) {
        resCodRow.style.display = 'block';
        resCod.innerText = codCharge.toFixed(2);
    } else {
        resCodRow.style.display = 'none';
    }

    resItemsList.innerHTML = `
        <div class="cart-body" style="padding: 0;">
            ${order.items?.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <div class="cart-item-price">LKR ${item.price.toFixed(2)}</div>
                    </div>
                </div>
            `).join('') || 'No items information available.'}
        </div>
    `;

    // Timeline logic
    Object.keys(steps).forEach(key => {
        steps[key].classList.remove('active', 'completed');
    });

    const statusOrder = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    const currentIndex = statusOrder.indexOf(order.status);
    statusOrder.forEach((status, index) => {
        if (index < currentIndex) steps[status].classList.add('completed');
        else if (index === currentIndex) steps[status].classList.add('active');
    });

    // Confirm/Review Visibility
    confirmSection.style.display = (order.status === 'Shipped') ? 'block' : 'none';
    reviewSection.style.display = (order.status === 'Delivered' && !order.reviewed) ? 'block' : 'none';

    listView.style.display = 'none';
    resultDiv.style.display = 'block';
};

window.hideOrderDetails = () => {
    resultDiv.style.display = 'none';
    listView.style.display = 'block';
    currentViewingOrder = null;
};

// Confirm Received Logic
window.confirmOrderReceived = async () => {
    if (!currentViewingOrder) return;

    try {
        const orderRef = doc(db, 'orders', currentViewingOrder.docId);
        await updateDoc(orderRef, { status: 'Delivered' });
        alert('📦 Thank you for confirming! You can now leave a review.');
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

// Star Rating Logic
window.setRating = (rating) => {
    selectedRating = rating;
    const stars = document.querySelectorAll('.star-rating span');
    stars.forEach((star, i) => {
        star.style.color = i < rating ? '#fbbf24' : '#ddd';
    });
};

// Submit Review Logic
window.submitReview = async () => {
    if (!currentViewingOrder) return;
    const comment = document.getElementById('review-comment').value.trim();

    try {
        const reviewsCol = collection(db, 'reviews');
        await addDoc(reviewsCol, {
            orderId: currentViewingOrder.orderId,
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || 'Customer',
            rating: selectedRating,
            comment: comment,
            timestamp: serverTimestamp(),
            date: new Date().toLocaleDateString()
        });

        // Mark order as reviewed
        const orderRef = doc(db, 'orders', currentViewingOrder.docId);
        await updateDoc(orderRef, { reviewed: true });

        document.getElementById('review-status').style.display = 'block';
        setTimeout(() => reviewSection.style.display = 'none', 3000);
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

window.printFromTrack = () => {
    const orderId = resOrderId.innerText.replace('Order ID: ', '');
    const order = currentOrders.find(o => o.orderId === orderId);
    if (!order) return;

    const printArea = document.getElementById('printable-area');
    printArea.innerHTML = `
        <div style="padding: 40px; font-family: sans-serif;">
            <div style="text-align: center; border-bottom: 2px solid #002060; padding-bottom: 20px;">
                ${window.storeInfo?.logoUrl ? `<img src="${window.storeInfo.logoUrl}" style="width: 100px; height: 100px; object-fit: contain; margin-bottom: 10px;">` : ''}
                <h1>${window.storeInfo?.name || 'MEC BOOK SHOP'}</h1>
                <p>${window.storeInfo?.location || 'No 97, Victoria Estate, Panadura Road, Munagama, Horana.'}</p>
                <h2>OFFICIAL INVOICE</h2>
            </div>
            <div style="margin: 30px 0; display: flex; justify-content: space-between;">
                <div>
                    <h4>BILL TO:</h4>
                    <p><strong>${order.userName}</strong></p>
                    <p>${order.address}, ${order.city}</p>
                    <p>Tel: ${order.phone}${order.phone2 ? ' / ' + order.phone2 : ''}</p>
                </div>
                <div style="text-align: right;">
                    <p><strong>Order ID:</strong> ${order.orderId}</p>
                    <p><strong>Date:</strong> ${order.date}</p>
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 12px; text-align: left;">Item</th>
                        <th style="padding: 12px; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items?.map(item => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 12px;">${item.name}</td>
                            <td style="padding: 12px; text-align: right;">LKR ${item.price.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr><td style="padding: 12px; text-align: right;">Subtotal:</td><td style="padding: 12px; text-align: right;">LKR ${order.total.toFixed(2)}</td></tr>
                    <tr><td style="padding: 12px; text-align: right;">COD Charge:</td><td style="padding: 12px; text-align: right;">LKR ${(order.codCharge || 0).toFixed(2)}</td></tr>
                    <tr style="font-weight: bold; font-size: 1.2rem;"><td style="padding: 12px; text-align: right;">Grand Total:</td><td style="padding: 12px; text-align: right;">LKR ${(order.total + (order.codCharge || 0)).toFixed(2)}</td></tr>
                </tfoot>
            </table>
        </div>
    `;

    // Temporary style for print
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body * { visibility: hidden; }
            #printable-area, #printable-area * { visibility: visible; }
            #printable-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
};

// Handle Back Button
document.getElementById('back-btn').addEventListener('click', () => {
    window.hideOrderDetails();
});
