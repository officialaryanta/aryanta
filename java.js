// --- 1. CORE CONFIGURATION ---
const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";
const RAZORPAY_KEY = "rzp_test_SfN9xZbqkMSz6G"; 
emailjs.init("TDgNRO0CEs9rU3ozD");

// CHANGE THIS: You must paste your real Firebase Config here to stop the permission errors!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Application State
let allProducts = [];
let cart = [];
let currentProduct = null;
let hashedOTP = "";
let tempUserData = null; 
let currentOrderState = { itemsTotal: 0, shippingCost: 0, grandTotal: 0 };
let firebaseAddresses = [];
let userAvatar = "";

// Map Constants
const BHAGALPUR_LAT = 25.2425;
const BHAGALPUR_LON = 86.9842;

// --- 2. GLOBAL UI CONTROLS & TOASTS ---
const overlay = document.getElementById('overlay');
const sidebar = document.getElementById('sidebar');

document.getElementById('menuBtn').addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
overlay.addEventListener('click', closeAllModals);

function closeAllModals() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.getElementById('authModal').style.display = 'none';
}

function closeFullPage(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = 'auto';
}

function showToast(message) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastMessage').innerText = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function showAlert(message, title = "Notice", showCancel = false, onConfirm = null) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('alertCancelBtn').style.display = showCancel ? 'block' : 'none';
    document.getElementById('customAlertOverlay').style.display = 'flex';
    
    document.getElementById('alertOkBtn').onclick = () => { document.getElementById('customAlertOverlay').style.display = 'none'; if(onConfirm) onConfirm(); };
    document.getElementById('alertCancelBtn').onclick = () => { document.getElementById('customAlertOverlay').style.display = 'none'; };
}

window.closeAlert = function(confirm) {
    document.getElementById('customAlertOverlay').style.display = 'none';
}

function toggleButtonState(btnId, isLoading, defaultText) {
    const btn = document.getElementById(btnId);
    if (isLoading) {
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;
    } else {
        btn.innerHTML = defaultText;
        btn.disabled = false;
    }
}

// --- 3. PRODUCTS & LIVE SEARCH ---
async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        allProducts = await res.json();
        renderProducts(allProducts, 'productShelf');
    } catch(err) {
        document.getElementById('productShelf').innerHTML = '<p style="text-align:center; width:100%; font-weight: 600; color: var(--text-muted);">Premium catalog is currently refreshing.</p>';
    } finally {
        document.getElementById('pageLoader').classList.add('hidden');
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term) || (p.desc && p.desc.toLowerCase().includes(term)));
    renderProducts(filtered, 'productShelf');
});

function renderProducts(list, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    list.forEach((p, index) => {
        const div = document.createElement('div');
        div.style.animationDelay = `${index * 0.05}s`;
        
        if(p.isDummy) {
            div.className = 'item-card dummy-box';
            div.innerHTML = `<div class="dummy-content"><i class="fas fa-box-open"></i><p>More Premium Drops Coming Soon</p></div>`;
            div.onclick = null;
            container.appendChild(div);
            return;
        }

        div.className = 'item-card';
        let img = p.images && p.images.length > 0 ? p.images[0] : 'https://via.placeholder.com/300';
        div.onclick = () => openProductPage(p);
        div.innerHTML = `
            <div class="item-image"><img src="${img}" alt="${p.name}"></div>
            <div class="item-info">
                <h4>${p.name}</h4>
                <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
            </div>`;
        container.appendChild(div);
    });
}

// --- 4. ULTRA PREMIUM FULL SCREEN PRODUCT PAGE ---
function openProductPage(product) {
    currentProduct = product;
    document.getElementById('fpName').innerText = product.name;
    document.getElementById('fpDesc').innerText = product.desc || "Experience the pinnacle of craftsmanship. Engineered for the modern elite with uncompromising quality.";
    document.getElementById('fpPrice').innerText = `₹${Number(product.price).toLocaleString('en-IN')}`;
    document.getElementById('fpImage').src = product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/600';
    
    // Exactly 12 items logic
    let similar = allProducts.filter(p => p.id !== product.id).slice(0, 12);
    while(similar.length > 0 && similar.length < 12) {
        similar.push({ isDummy: true });
    }
    renderProducts(similar, 'relatedProductsShelf');
    
    document.body.style.overflow = 'hidden';
    document.getElementById('fullProductPage').classList.add('open');
    document.getElementById('fullProductPage').scrollTo(0,0);
}

// --- 5. CART LOGIC (WITH TOAST) ---
window.addToCartFromPage = function() {
    const existing = cart.find(i => i.id === currentProduct.id);
    existing ? existing.qty += 1 : cart.push({ ...currentProduct, qty: 1 });
    updateCartUI();
    
    const badge = document.getElementById('cartBadge');
    badge.classList.add('show');
    badge.style.transform = 'scale(1.3)';
    setTimeout(() => badge.style.transform = 'scale(1)', 200);
    
    showToast(`"${currentProduct.name}" added to bag.`);
};

window.buyNowFromPage = function() {
    cart = []; addToCartFromPage(); document.getElementById('cartBtn').click();
};

document.getElementById('cartBtn').addEventListener('click', () => {
    updateCartUI();
    document.getElementById('fullCartPage').classList.add('open');
});

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let total = 0, count = 0;

    cart.forEach(item => {
        total += item.price * item.qty;
        count += item.qty;
        let img = item.images && item.images.length > 0 ? item.images[0] : 'https://via.placeholder.com/150';
        container.innerHTML += `
            <div class="cart-item-row">
                <div class="cart-img-box"><img src="${img}"></div>
                <div class="cart-details">
                    <h4>${item.name}</h4>
                    <div class="price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
                    <div class="cart-controls">
                        <button class="qty-btn" onclick="changeQty('${item.id}', -1)"><i class="fas fa-minus"></i></button>
                        <span style="font-weight:800; width: 24px; text-align:center;">${item.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${item.id}', 1)"><i class="fas fa-plus"></i></button>
                        <button class="btn-remove" onclick="removeFromCart('${item.id}')">Remove</button>
                    </div>
                </div>
            </div>`;
    });

    if(cart.length === 0) container.innerHTML = '<p style="font-size:18px; font-weight:600; color:var(--text-muted); padding:40px 0;">Your shopping bag is empty.</p>';

    document.getElementById('cartBadge').innerText = count;
    if(count > 0) document.getElementById('cartBadge').classList.add('show');
    else document.getElementById('cartBadge').classList.remove('show');
    
    document.getElementById('cartSubtotal').innerText = `₹${total.toLocaleString('en-IN')}`;
    document.getElementById('cartTotalValue').innerText = `₹${total.toLocaleString('en-IN')}`;
    currentOrderState.itemsTotal = total;
}

window.changeQty = function(id, d) {
    const item = cart.find(i => i.id === id);
    if(item) { item.qty += d; if(item.qty <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); }
};
window.removeFromCart = function(id) { cart = cart.filter(i => i.id !== id); updateCartUI(); };


// --- 6. AUTHENTICATION ---
async function secureHash(string) {
    const msgBuffer = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

window.goToStep = function(step) {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('otpView').style.display = 'none';
    document.getElementById(step + 'View').style.display = 'block';
};

function checkSession() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const accBtn = document.getElementById('accountBtn');
    
    if (session && session.email) {
        document.getElementById('sidebarUser').innerText = session.name;
        document.getElementById('sidebarRole').innerText = "Prime Member";
        document.getElementById('sidebarLogoutBtn').style.display = "flex"; 
        
        accBtn.innerHTML = '<i class="fas fa-user-circle" style="font-size:20px; margin-right:8px;"></i> <span>' + session.name.split(' ')[0] + '</span>';
        
        accBtn.onclick = () => openAccount();
        document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); openAccount(); };
        
        initFirebaseProfile(session.email);
    } else {
        document.getElementById('sidebarUser').innerText = 'Welcome Guest';
        document.getElementById('sidebarRole').innerText = "Sign in to access Prime";
        document.getElementById('sidebarLogoutBtn').style.display = "none";
        
        accBtn.innerHTML = 'Sign In';
        accBtn.onclick = () => { document.getElementById('authModal').style.display = 'flex'; goToStep('login'); overlay.classList.add('show'); };
        document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); accBtn.click(); };
    }
}

window.handleSignup = async function() {
    tempUserData = {
        action: 'signup',
        name: document.getElementById('regName').value, email: document.getElementById('regEmail').value, phone: document.getElementById('regPhone').value,
        address: document.getElementById('regAddress').value, city: document.getElementById('regCity').value, state: document.getElementById('regState').value, pincode: document.getElementById('regPincode').value
    };

    if (!tempUserData.name || !tempUserData.email || !tempUserData.phone || !tempUserData.pincode) return showAlert("Fill all mandatory fields including Pincode.");

    toggleButtonState('signupBtn', true, 'Send OTP');
    const rawOTP = Math.floor(1000 + Math.random() * 9000).toString();
    hashedOTP = await secureHash(rawOTP);

    try {
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: tempUserData.email, to_name: tempUserData.name, otp_code: rawOTP });
        showAlert("Verification code dispatched.", "Check Inbox");
        goToStep('otp');
    } catch (err) { showAlert("Failed to send secure email."); } 
    finally { toggleButtonState('signupBtn', false, 'Send OTP'); }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    if(!email) return showAlert("Enter your registered email.");
    
    toggleButtonState('loginBtn', true, 'Send Secure OTP');
    try {
        const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data || !data.email) {
            toggleButtonState('loginBtn', false, 'Send Secure OTP');
            showAlert("Email not found. Please create an account.");
            return goToStep('signup');
        }

        tempUserData = { action: 'login', ...data }; 
        const rawOTP = Math.floor(1000 + Math.random() * 9000).toString();
        hashedOTP = await secureHash(rawOTP);
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: email, to_name: tempUserData.name, otp_code: rawOTP });
        goToStep('otp');
    } catch(err) { showAlert("Secure connection failed."); }
    finally { toggleButtonState('loginBtn', false, 'Send Secure OTP'); }
};

const otpInputs = document.querySelectorAll('.otp-box');
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => { if (e.target.value.length === 1 && index < 3) otpInputs[index + 1].focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && e.target.value === '' && index > 0) otpInputs[index - 1].focus(); });
});

window.completeAuth = async function() {
    let otp = ''; otpInputs.forEach(i => otp += i.value);
    if(otp.length !== 4) return showAlert("Enter full secure code.");
    
    const hash = await secureHash(otp);
    if (hash === hashedOTP) {
        try {
            if (tempUserData.action === 'signup') {
                const addRes = await fetch(`${API_BASE_URL}/add-user`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...tempUserData, timestamp: new Date().toISOString() })
                });
                if(!addRes.ok) throw new Error("API Save Failed");
                
                await db.collection("users").doc(tempUserData.email).set({ avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + tempUserData.name, addresses: [] }, { merge: true });
            }
            
            localStorage.setItem('active_session', JSON.stringify(tempUserData));
            showAlert(`Welcome to Prime, ${tempUserData.name.split(' ')[0]}.`, "Authentication Success");
            setTimeout(() => location.reload(), 1500);
        } catch (error) { showAlert("Sync failed."); }
    } else { showAlert("Invalid Verification Code."); }
};


// --- 7. EDITABLE PROFILE & ADDRESS BOOK LOGIC ---
window.openAccount = function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return;
    
    closeAllModals();
    document.getElementById('fullAccountPage').classList.add('open');
    
    document.getElementById('accName').value = session.name || "";
    document.getElementById('accEmail').value = session.email || "";
    document.getElementById('accPhone').value = session.phone || "";
    document.getElementById('accAddress').value = session.address || "";
    document.getElementById('accCity').value = session.city || "";
    document.getElementById('accState').value = session.state || "";
    document.getElementById('accPincode').value = session.pincode || "";
    
    initFirebaseProfile(session.email);
};

function initFirebaseProfile(email) {
    db.collection("users").doc(email).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            firebaseAddresses = data.addresses || [];
            userAvatar = data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
            
            document.getElementById('sidebarAvatar').src = userAvatar;
            
            const session = JSON.parse(localStorage.getItem('active_session'));
            const firstName = session ? session.name.split(' ')[0] : 'Profile';
            const accBtn = document.getElementById('accountBtn');
            accBtn.innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${firstName}</span>`;
            
            document.querySelectorAll('.avatar-opt').forEach(el => {
                el.classList.remove('selected');
                if(el.src === userAvatar) el.classList.add('selected');
            });
            renderAddresses();
        }
    }).catch(err => console.error("Firebase Auth Warning:", err));
}

window.selectAvatar = function(src) {
    document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
    event.target.classList.add('selected');
    userAvatar = src;
};

window.saveAvatarToFirebase = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    await db.collection("users").doc(session.email).set({ avatar: userAvatar }, { merge: true });
    document.getElementById('sidebarAvatar').src = userAvatar;
    
    const firstName = session ? session.name.split(' ')[0] : 'Profile';
    const accBtn = document.getElementById('accountBtn');
    accBtn.innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${firstName}</span>`;
    
    showToast("Avatar updated securely.");
};

window.saveProfileDetails = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (!session) return;
    
    const newName = document.getElementById('accName').value;
    const newPhone = document.getElementById('accPhone').value;
    const newAddress = document.getElementById('accAddress').value;
    const newCity = document.getElementById('accCity').value;
    const newState = document.getElementById('accState').value;
    const newPincode = document.getElementById('accPincode').value;

    session.name = newName;
    session.phone = newPhone;
    session.address = newAddress;
    session.city = newCity;
    session.state = newState;
    session.pincode = newPincode;

    localStorage.setItem('active_session', JSON.stringify(session));

    await db.collection("users").doc(session.email).set({
        name: newName, phone: newPhone, address: newAddress, city: newCity, state: newState, pincode: newPincode
    }, { merge: true });

    document.getElementById('sidebarUser').innerText = newName;
    saveAvatarToFirebase();
    showToast("Profile saved successfully.");
};

// Ensure address addition ONLY checks address and pin for validation
window.saveNewAddress = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const add = document.getElementById('newAddText').value;
    const city = document.getElementById('newCity').value;
    const state = document.getElementById('newState').value;
    const pin = document.getElementById('newPin').value;
    
    if(!add || !pin) return showAlert("Address and Pincode are strictly required.");
    
    firebaseAddresses.push({ address: add, city: city, state: state, pincode: pin });
    await db.collection("users").doc(session.email).set({ addresses: firebaseAddresses }, { merge: true });
    
    document.getElementById('newAddText').value = ""; document.getElementById('newCity').value = ""; document.getElementById('newState').value = ""; document.getElementById('newPin').value = "";
    document.getElementById('newAddressForm').classList.remove('show');
    renderAddresses();
    showToast("New Address Added");
};

window.removeAddress = async function(index) {
    if(confirm("Delete this saved location?")) {
        const session = JSON.parse(localStorage.getItem('active_session'));
        firebaseAddresses.splice(index, 1);
        await db.collection("users").doc(session.email).set({ addresses: firebaseAddresses }, { merge: true });
        renderAddresses();
        showToast("Address Removed");
    }
}

window.editAddress = function(index) {
    const a = firebaseAddresses[index];
    document.getElementById('newAddText').value = a.address;
    document.getElementById('newCity').value = a.city;
    document.getElementById('newState').value = a.state;
    document.getElementById('newPin').value = a.pincode;
    document.getElementById('newAddressForm').classList.add('show');
    
    // Remove the old entry so saving acts as an update
    firebaseAddresses.splice(index, 1);
}

function renderAddresses() {
    const list = document.getElementById('addressList');
    list.innerHTML = '';
    
    if(firebaseAddresses.length === 0) {
        list.innerHTML = '<p class="sub-text">No additional locations saved yet.</p>';
        return;
    }

    firebaseAddresses.forEach((a, index) => {
        list.innerHTML += `
        <div class="address-item">
            <strong class="loc-title"><i class="fas fa-map-marker-alt" style="margin-right:8px;"></i> Location ${index + 1}</strong>
            ${a.address}, ${a.city}, ${a.state} - <strong style="font-family: var(--font-mono);">${a.pincode}</strong>
            <div class="address-controls">
                <button class="btn-mini" onclick="editAddress(${index})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn-mini delete" onclick="removeAddress(${index})"><i class="fas fa-trash"></i> Remove</button>
            </div>
        </div>`;
    });
}

window.logOut = function() {
    localStorage.removeItem('active_session');
    location.reload();
}


// --- 8. PREMIUM NON-BLOCKING CHECKOUT & GLORIOUS RECEIPT ---
window.useDefaultAddress = function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return;
    document.getElementById('chkName').value = session.name || "";
    document.getElementById('chkPhone').value = session.phone || "";
    document.getElementById('chkAddress').value = session.address || "";
    document.getElementById('chkCity').value = session.city || "";
    document.getElementById('chkPincode').value = session.pincode || "";
};

window.openCheckout = function() {
    if (cart.length === 0) return showAlert("Bag is empty.");
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (!session) return showAlert("Please authenticate to proceed.", "Secure Checkout", false, () => document.getElementById('accountBtn').click());
    
    document.getElementById('fullCartPage').classList.remove('open');
    
    document.getElementById('fullCheckoutPage').classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('checkoutStep1').style.display = 'block';
    document.getElementById('checkoutStep2').style.display = 'none';
    
    const chkList = document.getElementById('checkoutAddressList');
    chkList.innerHTML = '';
    if(firebaseAddresses.length > 0) {
        chkList.innerHTML = `<div class="divider-elegant text-center"><span class="bg-surface px-10">Or select from Address Book</span></div>`;
        firebaseAddresses.forEach((a, i) => {
            chkList.innerHTML += `<div class="address-item premium-hover" onclick="selectCheckoutAdd(${i})" style="margin-bottom:10px; cursor:pointer;"><strong class="loc-title" style="font-size:14px; margin-bottom:4px;"><i class="fas fa-map-marker-alt"></i> Location ${i + 1}</strong>${a.address}, ${a.city} - ${a.pincode}</div>`;
        });
    }
};

// FIX: Ensure name and phone are autofilled when selecting from Address Book during checkout
window.selectCheckoutAdd = function(index) {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const a = firebaseAddresses[index];
    
    document.getElementById('chkName').value = session.name || "";
    document.getElementById('chkPhone').value = session.phone || "";
    document.getElementById('chkAddress').value = a.address;
    document.getElementById('chkCity').value = a.city;
    document.getElementById('chkPincode').value = a.pincode;
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; const dLat = (lat2 - lat1) * (Math.PI/180); const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

window.calculateShippingAndProceed = async function() {
    const pincode = document.getElementById('chkPincode').value;
    if(!pincode) return showAlert("Pincode is mandatory for shipping calculation.");
    toggleButtonState('calcShippingBtn', true, 'Calculating Logistics...');

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${pincode},+India`);
        const data = await res.json();
        let shippingFee = 60; 
        
        if (data && data.length > 0) {
            const distance = getDistanceFromLatLonInKm(BHAGALPUR_LAT, BHAGALPUR_LON, parseFloat(data[0].lat), parseFloat(data[0].lon));
            if (distance < 10) shippingFee = 10;
            else if (distance < 35) shippingFee = 25;
            else if (distance < 70) shippingFee = 60;
            else if (distance < 120) shippingFee = 100;
            else shippingFee = 150;
        }

        currentOrderState.shippingCost = shippingFee;
        currentOrderState.grandTotal = currentOrderState.itemsTotal + shippingFee;
        
        document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal.toLocaleString('en-IN')}`;
        document.getElementById('sumShipping').innerText = `₹${shippingFee.toLocaleString('en-IN')}`;
        document.getElementById('sumTotal').innerText = `₹${currentOrderState.grandTotal.toLocaleString('en-IN')}`;
        
        document.getElementById('checkoutStep1').style.display = 'none';
        document.getElementById('checkoutStep2').style.display = 'block';
    } catch(err) {
        currentOrderState.shippingCost = 60; currentOrderState.grandTotal = currentOrderState.itemsTotal + 60;
        document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal.toLocaleString('en-IN')}`;
        document.getElementById('sumShipping').innerText = `₹60`; document.getElementById('sumTotal').innerText = `₹${currentOrderState.grandTotal.toLocaleString('en-IN')}`;
        document.getElementById('checkoutStep1').style.display = 'none'; document.getElementById('checkoutStep2').style.display = 'block';
    } finally {
        toggleButtonState('calcShippingBtn', false, 'Next: Payment <i class="fas fa-arrow-right"></i>');
    }
};

window.processPayment = function() {
    toggleButtonState('payBtn', true, 'Initializing Gateway...');
    
    setTimeout(() => {
        const session = JSON.parse(localStorage.getItem('active_session'));
        const isCOD = document.querySelector('input[name="payMethod"]:checked').value === 'cod';
        const amountToCharge = isCOD ? currentOrderState.shippingCost : currentOrderState.grandTotal;

        const options = {
            "key": RAZORPAY_KEY, "amount": amountToCharge * 100, "currency": "INR", "name": "Aryanta Prime",
            "description": isCOD ? "Shipping Charge Payment" : "Full Order Payment",
            "handler": function (response) { saveOrderToBackend(response.razorpay_payment_id, isCOD); },
            "prefill": { "name": document.getElementById('chkName').value, "email": session.email, "contact": document.getElementById('chkPhone').value },
            "theme": { "color": "#0a0a0a" },
            "modal": {
                "ondismiss": function() {
                    toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment');
                }
            }
        };
        
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', () => {
            toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment');
            showAlert(`Payment unsuccessful. If deducted it will be refunded within 24h.`, "Transaction Failed");
        });

        if (isCOD) {
            showAlert(`As you chose COD, you must pay the ₹${amountToCharge} shipping charge now. You will pay ₹${currentOrderState.itemsTotal} on delivery.`, "COD Policy", true, () => { rzp.open(); });
            toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment');
        } else { 
            rzp.open(); 
        }
    }, 100);
};

async function saveOrderToBackend(paymentId, isCOD) {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const orderNo = "ARY-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
    const fullAddress = `${document.getElementById('chkAddress').value}, ${document.getElementById('chkCity').value} - ${document.getElementById('chkPincode').value}`;

    const orderData = {
        order_no: orderNo, user_email: session.email, delivery_name: document.getElementById('chkName').value,
        delivery_phone: document.getElementById('chkPhone').value, delivery_address: fullAddress,
        items: cart, financials: currentOrderState, payment_method: isCOD ? "COD (Shipping Prepaid)" : "Online Full",
        razorpay_id: paymentId, status: "Confirmed", timestamp: new Date().toISOString()
    };

    toggleButtonState('payBtn', true, 'Authorizing...');

    try {
        const res = await fetch(`${API_BASE_URL}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
        if(!res.ok) throw new Error("API Save Failed");

        buildGloriousReceipt(orderData);
        cart = []; updateCartUI();
        
        document.getElementById('fullCheckoutPage').classList.remove('open');
        document.getElementById('overlay').classList.add('show');
        document.getElementById('orderSuccessModal').style.display = 'flex';

    } catch (error) {
        showAlert("Payment successful, but saving order failed. Screenshot this Payment ID: " + paymentId, "Critical Error");
    } finally { toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment'); }
}

function buildGloriousReceipt(data) {
    document.getElementById('recOrderNo').innerText = data.order_no;
    document.getElementById('recAddress').innerText = data.delivery_address;
    document.getElementById('recItemsTotal').innerText = `₹${data.financials.itemsTotal.toLocaleString('en-IN')}`;
    document.getElementById('recShipping').innerText = `₹${data.financials.shippingCost.toLocaleString('en-IN')}`;
    document.getElementById('recGrandTotal').innerText = `₹${data.financials.grandTotal.toLocaleString('en-IN')}`;
    
    const tbody = document.getElementById('recTableBody');
    tbody.innerHTML = '';
    let emailItemsText = ""; 

    data.items.forEach(item => {
        tbody.innerHTML += `<tr><td>${item.name}</td><td class="mono-td">x${item.qty}</td><td class="text-right mono-td">₹${(item.price * item.qty).toLocaleString('en-IN')}</td></tr>`;
        emailItemsText += `${item.name} (x${item.qty}) - Rs.${item.price * item.qty}\n`;
    });

    emailjs.send("service_wnqvm4n", "YOUR_NEW_RECEIPT_TEMPLATE_ID", {
        to_email: data.user_email, to_name: data.delivery_name, order_no: data.order_no, address: data.delivery_address,
        items_list: emailItemsText, shipping: data.financials.shippingCost, grand_total: data.financials.grandTotal
    }).catch(err => console.log("Receipt email failed", err));
}

window.closeOrderSuccess = function() {
    document.getElementById('orderSuccessModal').style.display = 'none';
    overlay.classList.remove('show');
}

checkSession();
fetchProducts();
