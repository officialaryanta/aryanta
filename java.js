// --- 1. CORE CONFIGURATION ---
const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";
const RAZORPAY_KEY = "rzp_test_SfN9xZbqkMSz6G"; 
emailjs.init("TDgNRO0CEs9rU3ozD");

// CHANGE THIS: You must paste your real Firebase Config here
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

// --- 2. HISTORY API & GLOBAL UI CONTROLS ---
let activeOverlays = [];

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('overlay').classList.add('show');
    activeOverlays.push('sidebar_layer');
    history.pushState({ ui: 'sidebar_layer' }, "");
}

function openUI(id) {
    const el = document.getElementById(id);
    if(!el) return;
    
    if(el.classList.contains('full-page') || id === 'sidebar') el.classList.add('open');
    else if (id === 'overlay') el.classList.add('show');
    else el.style.display = 'flex';
    
    if(el.classList.contains('full-page')) document.body.style.overflow = 'hidden';
    
    activeOverlays.push(id);
    history.pushState({ ui: id }, "");
}

window.addEventListener('popstate', (e) => {
    if(activeOverlays.length > 0) {
        const id = activeOverlays.pop();
        if(id === 'sidebar_layer') {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('overlay').classList.remove('show');
        } else {
            const el = document.getElementById(id);
            if(el) {
                if(el.classList.contains('full-page') || id === 'sidebar') el.classList.remove('open');
                else if (id === 'overlay') el.classList.remove('show');
                else el.style.display = 'none';
            }
        }
        const anyFull = activeOverlays.some(uid => {
            const check = document.getElementById(uid);
            return check && check.classList.contains('full-page');
        });
        if(!anyFull) document.body.style.overflow = 'auto';
    }
});

let toastTimer;
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastMessage').innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove('show'); }, duration);
}

function showAlert(message, title = "Notice", showCancel = false, onConfirm = null) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('alertCancelBtn').style.display = showCancel ? 'block' : 'none';
    document.getElementById('customAlertOverlay').style.display = 'flex';
    
    document.getElementById('alertOkBtn').onclick = () => { document.getElementById('customAlertOverlay').style.display = 'none'; if(onConfirm) onConfirm(); };
    document.getElementById('alertCancelBtn').onclick = () => { document.getElementById('customAlertOverlay').style.display = 'none'; };
}

function closeAlert() { document.getElementById('customAlertOverlay').style.display = 'none'; }

function toggleButtonState(btnId, isLoading, defaultText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;
    } else {
        btn.innerHTML = defaultText;
        btn.disabled = false;
    }
}

// --- 3. PRODUCTS & AI SMART SEARCH ---
async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        allProducts = await res.json();
        
        for(let p of allProducts) {
            const snapshot = await db.collection("reviews").where("productId", "==", p.id).get();
            let total = 0;
            snapshot.forEach(doc => total += doc.data().rating);
            p.reviewCount = snapshot.size;
            p.avgRating = p.reviewCount > 0 ? (total / p.reviewCount).toFixed(1) : "New";
        }
        renderProducts(allProducts, 'productShelf');
    } catch(err) {
        document.getElementById('productShelf').innerHTML = '<p class="text-center" style="grid-column: 1/-1;">Premium catalog is currently refreshing.</p>';
    } finally {
        document.getElementById('pageLoader').classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const term = e.target.value.toLowerCase().trim();
                if (!term) return renderProducts(allProducts, 'productShelf');

                // Simulate AI Semantic matching using a weighted score
                const searchTerms = term.split(' ');
                const filtered = allProducts.map(p => {
                    let score = 0;
                    const nameStr = p.name.toLowerCase();
                    const descStr = (p.desc || "").toLowerCase();
                    
                    searchTerms.forEach(t => {
                        if(nameStr.includes(t)) score += 3; 
                        if(descStr.includes(t)) score += 1; 
                    });
                    return { ...p, score };
                }).filter(p => p.score > 0).sort((a,b) => b.score - a.score);

                renderProducts(filtered, 'productShelf');
            }, 300); 
        });
    }
});

function renderProducts(list, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    
    if(list.length === 0) {
        container.innerHTML = '<p class="text-center" style="grid-column: 1/-1; padding: 40px; color: var(--text-muted);">No collections match your AI query.</p>';
        return;
    }
    
    list.forEach((p, index) => {
        if(p.isDummy) return;

        let img = p.images && p.images.length > 0 ? p.images[0] : 'https://via.placeholder.com/300';
        let desc = p.desc ? p.desc.substring(0, 150) + '...' : 'Experience the pinnacle of craftsmanship.';
        let starUI = p.avgRating === "New" ? "No ratings yet" : `<i class="fas fa-star"></i> ${p.avgRating} (${p.reviewCount})`;

        const div = document.createElement('div');
        div.className = 'list-item-card';
        div.style.animationDelay = `${index * 0.05}s`;
        
        div.innerHTML = `
            <div class="list-image" onclick="openProductPage('${p.id}')"><img src="${img}" alt="${p.name}"></div>
            <div class="list-info">
                <h4 onclick="openProductPage('${p.id}')">${p.name}</h4>
                <div class="stars" onclick="openProductPage('${p.id}')">${starUI}</div>
                <p onclick="openProductPage('${p.id}')">${desc}</p>
                <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
                <div class="list-actions">
                    <button class="btn-list-add" onclick="directAddToCart('${p.id}')">Add to Cart</button>
                    <button class="btn-list-buy" onclick="directBuyNow('${p.id}')">Buy Now</button>
                </div>
            </div>`;
        container.appendChild(div);
    });
}

// --- 4. ULTRA PREMIUM FULL SCREEN PRODUCT PAGE ---
window.openProductPage = function(id) {
    currentProduct = allProducts.find(p => p.id === id);
    document.getElementById('fpName').innerText = currentProduct.name;
    document.getElementById('fpDesc').innerText = currentProduct.desc || "Experience the pinnacle of craftsmanship. Engineered for the modern elite with uncompromising quality.";
    document.getElementById('fpPrice').innerText = `₹${Number(currentProduct.price).toLocaleString('en-IN')}`;
    document.getElementById('fpImage').src = currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : 'https://via.placeholder.com/600';
    
    document.getElementById('fpStarsAvg').innerHTML = currentProduct.avgRating === "New" ? "New Product" : `<i class="fas fa-star"></i> ${currentProduct.avgRating}`;
    document.getElementById('fpRatingCount').innerText = `${currentProduct.reviewCount} Verified Ratings & Reviews`;

    let similar = allProducts.filter(p => p.id !== currentProduct.id).slice(0, 2);
    renderProducts(similar, 'relatedProductsShelf');
    
    openUI('fullProductPage');
    document.getElementById('fullProductPage').scrollTo(0,0);
};

window.directAddToCart = function(id) {
    currentProduct = allProducts.find(p => p.id === id);
    window.addToCartFromPage();
};

window.directBuyNow = function(id) {
    currentProduct = allProducts.find(p => p.id === id);
    window.buyNowFromPage();
};

// --- 5. REAL-TIME REVIEWS SYSTEM ---
let selectedReviewStars = 0;
let selectedReviewImage = null;

window.setReviewStars = function(stars) {
    selectedReviewStars = stars;
    const icons = document.getElementById('starSelector').querySelectorAll('i');
    icons.forEach((icon, index) => {
        icon.style.color = index < stars ? '#f59e0b' : '#cbd5e1';
    });
};

const originalOpenUI = window.openUI;
window.openUI = async function(id) {
    originalOpenUI(id);
    if(id === 'fullReviewPage' && currentProduct) {
        document.getElementById('revProdName').innerText = currentProduct.name;
        document.getElementById('revProdImg').src = currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : 'https://via.placeholder.com/150';
        document.getElementById('revScore').innerText = currentProduct.avgRating === "New" ? "0.0" : currentProduct.avgRating;
        document.getElementById('revCount').innerText = `${currentProduct.reviewCount} verified ratings`;
        
        let starsHTML = "";
        const avg = parseFloat(currentProduct.avgRating) || 0;
        for(let i=1; i<=5; i++) starsHTML += `<i class="fas fa-star" style="color: ${i <= Math.round(avg) ? '#f59e0b' : '#cbd5e1'};"></i>`;
        document.getElementById('revStars').innerHTML = starsHTML;

        const revDropZone = document.getElementById('revDropZone');
        const revImageInput = document.getElementById('revImage');
        if(revDropZone && revImageInput) {
            revDropZone.onclick = () => revImageInput.click();
            revImageInput.onchange = function(e) {
                if(this.files.length) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        selectedReviewImage = event.target.result;
                        revDropZone.innerHTML = `<img src="${selectedReviewImage}" style="max-height: 100px; border-radius: 8px;"><div style="color:var(--success); font-weight:800; font-size:12px; margin-top:10px;"><i class="fas fa-check-circle"></i> Image Attached</div>`;
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            };
        }

        const list = document.getElementById('reviewsList');
        list.innerHTML = '<p class="sub-text text-center"><i class="fas fa-spinner fa-spin"></i> Loading feedback...</p>';
        try {
            const snapshot = await db.collection("reviews").where("productId", "==", currentProduct.id).orderBy("timestamp", "desc").get();
            if(snapshot.empty) {
                list.innerHTML = '<p class="sub-text text-center">Be the first to review this product.</p>';
                return;
            }
            list.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                let rStars = "";
                for(let i=1; i<=5; i++) rStars += `<i class="fas fa-star" style="color: ${i <= data.rating ? '#f59e0b' : '#cbd5e1'}; font-size:12px;"></i>`;
                let imgHTML = data.image ? `<img src="${data.image}" style="height:100px; border-radius:8px; margin-top:15px; border:1px solid var(--border);">` : "";
                
                list.innerHTML += `
                    <div style="background:var(--surface); border:1px solid var(--border); padding: 20px; border-radius: 16px; margin-bottom: 15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <strong><i class="fas fa-user-circle" style="color:var(--text-muted); margin-right:5px;"></i> ${data.userName}</strong>
                            <div>${rStars}</div>
                        </div>
                        <p style="font-size:15px; line-height:1.6; color:var(--text-main);">${data.text}</p>
                        ${imgHTML}
                        <p style="font-size:12px; color:var(--text-muted); margin-top:10px;">Reviewed on ${new Date(data.timestamp).toLocaleDateString()}</p>
                    </div>`;
            });
        } catch(e) { list.innerHTML = '<p class="sub-text text-center" style="color:var(--danger);">Error loading reviews.</p>'; }
    }
};

window.submitReview = async function() {
    const user = JSON.parse(localStorage.getItem('active_session'));
    if(!user) return showAlert("Please sign in to submit a review.", "Sign In Required", false, () => document.getElementById('accountBtn').click());
    if(selectedReviewStars === 0) return showAlert("Please select a star rating.");
    
    const text = document.getElementById('revText').value.trim();
    if(!text) return showAlert("Please write a short review text.");

    try {
        await db.collection("reviews").add({
            productId: currentProduct.id, userName: user.name, userEmail: user.email, rating: selectedReviewStars,
            text: text, image: selectedReviewImage, timestamp: new Date().toISOString()
        });
        showToast("Review submitted successfully!");
        history.back(); fetchProducts();
    } catch(e) { showAlert("Error submitting review. Please try again."); }
};


// --- 6. CART LOGIC ---
window.addToCartFromPage = function() {
    const existing = cart.find(i => i.id === currentProduct.id);
    existing ? existing.qty += 1 : cart.push({ ...currentProduct, qty: 1 });
    updateCartUI();
    
    const badge = document.getElementById('cartBadge');
    badge.classList.add('show'); badge.style.transform = 'scale(1.3)'; setTimeout(() => badge.style.transform = 'scale(1)', 200);
    showToast(`"${currentProduct.name}" added to bag.`);
};

window.buyNowFromPage = function() { cart = []; window.addToCartFromPage(); openUI('fullCartPage'); };

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let total = 0, count = 0;

    cart.forEach(item => {
        total += item.price * item.qty; count += item.qty;
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
    if(count > 0) document.getElementById('cartBadge').classList.add('show'); else document.getElementById('cartBadge').classList.remove('show');
    document.getElementById('cartSubtotal').innerText = `₹${total.toLocaleString('en-IN')}`; document.getElementById('cartTotalValue').innerText = `₹${total.toLocaleString('en-IN')}`;
    currentOrderState.itemsTotal = total;
}

window.changeQty = function(id, d) { const item = cart.find(i => i.id === id); if(item) { item.qty += d; if(item.qty <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); } };
window.removeFromCart = function(id) { cart = cart.filter(i => i.id !== id); updateCartUI(); };

// --- 7. AUTHENTICATION ---
async function secureHash(string) {
    const msgBuffer = new TextEncoder().encode(string); const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
window.goToStep = function(step) { document.getElementById('loginView').style.display = 'none'; document.getElementById('signupView').style.display = 'none'; document.getElementById('otpView').style.display = 'none'; document.getElementById(step + 'View').style.display = 'block'; };

window.openAccountPage = function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return;
    
    document.getElementById('accName').value = session.name || "";
    document.getElementById('accEmail').value = session.email || "";
    document.getElementById('accPhone').value = session.phone || "";
    document.getElementById('accAddress').value = session.address || "";
    document.getElementById('accCity').value = session.city || "";
    document.getElementById('accState').value = session.state || "";
    document.getElementById('accPincode').value = session.pincode || "";
    
    initFirebaseProfile(session.email); openUI('fullAccountPage');
}

function checkSession() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const accBtn = document.getElementById('accountBtn');
    
    if (session && session.email) {
        document.getElementById('sidebarUser').innerText = session.name;
        document.getElementById('sidebarRole').innerText = "Prime Member";
        document.getElementById('sidebarLogoutBtn').style.display = "flex"; 
        
        accBtn.innerHTML = '<i class="fas fa-user-circle" style="font-size:20px; margin-right:8px;"></i> <span>' + session.name.split(' ')[0] + '</span>';
        accBtn.onclick = () => window.openAccountPage();
        document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); window.openAccountPage(); };
        initFirebaseProfile(session.email);
    } else {
        document.getElementById('sidebarUser').innerText = 'Welcome Guest'; document.getElementById('sidebarRole').innerText = "Sign in to access Prime"; document.getElementById('sidebarLogoutBtn').style.display = "none";
        accBtn.innerHTML = 'Sign In'; accBtn.onclick = () => { openUI('overlay'); openUI('authModal'); goToStep('login'); }; document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); accBtn.click(); };
    }
}

window.handleSignup = async function() {
    tempUserData = { action: 'signup', name: document.getElementById('regName').value, email: document.getElementById('regEmail').value, phone: document.getElementById('regPhone').value, address: document.getElementById('regAddress').value, city: document.getElementById('regCity').value, state: document.getElementById('regState').value, pincode: document.getElementById('regPincode').value };
    if (!tempUserData.name || !tempUserData.email || !tempUserData.phone || !tempUserData.pincode) return showAlert("Fill all mandatory fields including Pincode.");
    toggleButtonState('signupBtn', true, 'Send OTP');
    const rawOTP = Math.floor(1000 + Math.random() * 9000).toString(); hashedOTP = await secureHash(rawOTP);
    try { await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: tempUserData.email, to_name: tempUserData.name, otp_code: rawOTP }); showAlert("Verification code dispatched.", "Check Inbox"); goToStep('otp'); } catch (err) { showAlert("Failed to send secure email."); } finally { toggleButtonState('signupBtn', false, 'Send OTP'); }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value; if(!email) return showAlert("Enter your registered email.");
    toggleButtonState('loginBtn', true, 'Send Secure OTP');
    try {
        const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(email)}`); const data = await res.json();
        if (!data || !data.email) { toggleButtonState('loginBtn', false, 'Send Secure OTP'); showAlert("Email not found. Please create an account."); return goToStep('signup'); }
        tempUserData = { action: 'login', ...data }; 
        const rawOTP = Math.floor(1000 + Math.random() * 9000).toString(); hashedOTP = await secureHash(rawOTP);
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: email, to_name: tempUserData.name, otp_code: rawOTP }); goToStep('otp');
    } catch(err) { showAlert("Secure connection failed."); } finally { toggleButtonState('loginBtn', false, 'Send Secure OTP'); }
};

const otpInputs = document.querySelectorAll('.otp-box');
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => { if (e.target.value.length === 1 && index < 3) otpInputs[index + 1].focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && e.target.value === '' && index > 0) otpInputs[index - 1].focus(); });
});

window.completeAuth = async function() {
    let otp = ''; otpInputs.forEach(i => otp += i.value); if(otp.length !== 4) return showAlert("Enter full secure code.");
    const hash = await secureHash(otp);
    if (hash === hashedOTP) {
        try {
            if (tempUserData.action === 'signup') {
                const addRes = await fetch(`${API_BASE_URL}/add-user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tempUserData, timestamp: new Date().toISOString() }) });
                if(!addRes.ok) throw new Error("API Save Failed");
                await db.collection("users").doc(tempUserData.email).set({ avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + tempUserData.name, addresses: [] }, { merge: true });
            }
            localStorage.setItem('active_session', JSON.stringify(tempUserData)); showAlert(`Welcome to Prime, ${tempUserData.name.split(' ')[0]}.`, "Authentication Success"); setTimeout(() => location.reload(), 1500);
        } catch (error) { showAlert("Sync failed."); }
    } else { showAlert("Invalid Verification Code."); }
};

// --- 8. EDITABLE PROFILE & ADDRESS BOOK LOGIC ---
function initFirebaseProfile(email) {
    db.collection("users").doc(email).get().then(doc => {
        if(doc.exists) {
            const data = doc.data(); firebaseAddresses = data.addresses || []; userAvatar = data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
            document.getElementById('sidebarAvatar').src = userAvatar;
            const session = JSON.parse(localStorage.getItem('active_session')); const firstName = session ? session.name.split(' ')[0] : 'Profile';
            document.getElementById('accountBtn').innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${firstName}</span>`;
            document.querySelectorAll('.avatar-opt').forEach(el => { el.classList.remove('selected'); if(el.src === userAvatar) el.classList.add('selected'); });
            renderAddresses();
        }
    }).catch(err => console.error("Firebase Auth Warning:", err));
}

window.selectAvatar = function(src) { document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected')); event.target.classList.add('selected'); userAvatar = src; };

window.saveProfileDetails = async function() {
    const session = JSON.parse(localStorage.getItem('active_session')); if (!session) return;
    
    session.name = document.getElementById('accName').value;
    session.phone = document.getElementById('accPhone').value;
    session.address = document.getElementById('accAddress').value;
    session.city = document.getElementById('accCity').value;
    session.state = document.getElementById('accState').value;
    session.pincode = document.getElementById('accPincode').value;

    localStorage.setItem('active_session', JSON.stringify(session));

    try {
        await db.collection("users").doc(session.email).set({
            name: session.name, phone: session.phone, address: session.address, city: session.city, state: session.state, pincode: session.pincode, avatar: userAvatar
        }, { merge: true });

        document.getElementById('sidebarUser').innerText = session.name;
        document.getElementById('accountBtn').innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${session.name.split(' ')[0]}</span>`;
        document.getElementById('sidebarAvatar').src = userAvatar;

        showToast("Profile saved successfully.", 1000); 
    } catch(e) { showAlert("Error saving profile. Please check your connection."); }
};

window.saveNewAddress = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const name = document.getElementById('newAddName').value; const phone = document.getElementById('newAddPhone').value; const add = document.getElementById('newAddText').value; const city = document.getElementById('newCity').value; const state = document.getElementById('newState').value; const pin = document.getElementById('newPin').value;
    if(!add || !pin || !name || !phone) return showAlert("Name, Phone, Address and Pincode are strictly required.");
    firebaseAddresses.push({ name: name, phone: phone, address: add, city: city, state: state, pincode: pin });
    try {
        await db.collection("users").doc(session.email).set({ addresses: firebaseAddresses }, { merge: true });
        document.getElementById('newAddName').value = ""; document.getElementById('newAddPhone').value = ""; document.getElementById('newAddText').value = ""; document.getElementById('newCity').value = ""; document.getElementById('newState').value = ""; document.getElementById('newPin').value = "";
        document.getElementById('newAddressForm').style.display = 'none'; renderAddresses(); showToast("New Address Added");
    } catch(e) { showAlert("Failed to save address."); }
};

window.removeAddress = async function(index) {
    if(confirm("Delete this saved location?")) {
        const session = JSON.parse(localStorage.getItem('active_session')); firebaseAddresses.splice(index, 1);
        await db.collection("users").doc(session.email).set({ addresses: firebaseAddresses }, { merge: true }); renderAddresses(); showToast("Address Removed");
    }
}

window.editAddress = function(index) {
    const a = firebaseAddresses[index];
    document.getElementById('newAddName').value = a.name || ""; document.getElementById('newAddPhone').value = a.phone || ""; document.getElementById('newAddText').value = a.address || ""; document.getElementById('newCity').value = a.city || ""; document.getElementById('newState').value = a.state || ""; document.getElementById('newPin').value = a.pincode || "";
    document.getElementById('newAddressForm').style.display = 'block'; firebaseAddresses.splice(index, 1);
}

window.setAsDefault = function(index) {
    const a = firebaseAddresses[index];
    document.getElementById('accAddress').value = a.address || "";
    document.getElementById('accCity').value = a.city || "";
    document.getElementById('accState').value = a.state || "";
    document.getElementById('accPincode').value = a.pincode || "";
    
    saveProfileDetails();
    showToast("Address set as Primary Default.", 1500);
}

function renderAddresses() {
    const list = document.getElementById('addressList'); list.innerHTML = '';
    if(firebaseAddresses.length === 0) { list.innerHTML = '<p class="sub-text">No additional locations saved yet.</p>'; return; }
    firebaseAddresses.forEach((a, index) => {
        list.innerHTML += `
        <div class="address-item">
            <strong class="loc-title"><i class="fas fa-map-marker-alt" style="margin-right:8px;"></i> Location ${index + 1}</strong>
            <div style="font-size:14px; margin-bottom:8px;"><strong>${a.name || 'No Name'}</strong> | ${a.phone || 'No Phone'}</div>
            ${a.address}, ${a.city}, ${a.state} - <strong style="font-family: var(--font-mono);">${a.pincode}</strong>
            <div class="address-controls" style="flex-wrap: wrap;">
                <button class="btn-mini" onclick="setAsDefault(${index})"><i class="fas fa-star"></i> Make Default</button>
                <button class="btn-mini" onclick="editAddress(${index})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn-mini delete" onclick="removeAddress(${index})"><i class="fas fa-trash"></i> Remove</button>
            </div>
        </div>`;
    });
}

window.logOut = function() { localStorage.removeItem('active_session'); location.reload(); }

// --- 9. PREMIUM NON-BLOCKING CHECKOUT & GLORIOUS RECEIPT ---
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
    
    history.back(); // Closes Cart
    setTimeout(() => { openUI('fullCheckoutPage'); }, 300);

    document.getElementById('checkoutStep1').style.display = 'block';
    document.getElementById('checkoutStep2').style.display = 'none';
    
    window.useDefaultAddress();

    const chkList = document.getElementById('checkoutAddressList');
    chkList.innerHTML = '';
    if(firebaseAddresses.length > 0) {
        chkList.innerHTML = `<div class="divider-elegant text-center" style="margin-bottom: 15px;"><span class="bg-surface px-10" style="color:var(--text-muted); font-size:13px; text-transform:uppercase; font-weight:800;">Or Pick Alternate Address</span></div>`;
        firebaseAddresses.forEach((a, i) => {
            chkList.innerHTML += `
                <div class="address-item premium-hover" onclick="selectCheckoutAdd(${i})" style="margin-bottom:10px; cursor:pointer; padding: 15px;">
                    <strong class="loc-title" style="font-size:14px; margin-bottom:4px;"><i class="fas fa-map-marker-alt"></i> Location ${i + 1}</strong>
                    <div style="font-size:13px; font-weight:600;">${a.name || ''}</div>
                    <div style="font-size:13px;">${a.address}, ${a.city} - ${a.pincode}</div>
                </div>`;
        });
    }
};

window.selectCheckoutAdd = function(index) {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const a = firebaseAddresses[index];
    
    document.getElementById('chkName').value = a.name || session.name || "";
    document.getElementById('chkPhone').value = a.phone || session.phone || "";
    document.getElementById('chkAddress').value = a.address || "";
    document.getElementById('chkCity').value = a.city || "";
    document.getElementById('chkPincode').value = a.pincode || "";
    
    showToast("Address Selected for Checkout", 1500);
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
        
        document.getElementById('checkoutStep1').style.display = 'none'; document.getElementById('checkoutStep2').style.display = 'block';
    } catch(err) {
        currentOrderState.shippingCost = 60; currentOrderState.grandTotal = currentOrderState.itemsTotal + 60;
        document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal.toLocaleString('en-IN')}`;
        document.getElementById('sumShipping').innerText = `₹60`; document.getElementById('sumTotal').innerText = `₹${currentOrderState.grandTotal.toLocaleString('en-IN')}`;
        document.getElementById('checkoutStep1').style.display = 'none'; document.getElementById('checkoutStep2').style.display = 'block';
    } finally { toggleButtonState('calcShippingBtn', false, 'Next: Payment <i class="fas fa-arrow-right"></i>'); }
};

window.processPayment = function() {
    toggleButtonState('payBtn', true, 'Initializing Gateway...');
    setTimeout(() => {
        const session = JSON.parse(localStorage.getItem('active_session'));
        const isCOD = document.querySelector('input[name="payMethod"]:checked').value === 'cod';
        const amountToCharge = isCOD ? currentOrderState.shippingCost : currentOrderState.grandTotal;

        const options = {
            "key": RAZORPAY_KEY, 
            "amount": amountToCharge * 100, 
            "currency": "INR", 
            "name": "Aryanta Prime",
            "description": isCOD ? "Shipping Charge Payment" : "Full Order Payment",
            
            // CRITICAL: Razorpay throws a 500 error if your API key has strict order validation enabled
            // and you do not pass a backend-generated "order_id" here. 
            // "order_id": "order_XXXXXX", 

            "handler": function (response) { saveOrderToBackend(response.razorpay_payment_id, isCOD); },
            "prefill": { "name": document.getElementById('chkName').value, "email": session.email, "contact": document.getElementById('chkPhone').value },
            "theme": { "color": "#0a0a0a" },
            "modal": { 
                "ondismiss": function() { 
                    toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment'); 
                } 
            }
        };
        
        try {
            const rzp = new Razorpay(options); 
            
            // Robust error catching if Razorpay 500s or fails setup
            rzp.on('payment.failed', function (response) { 
                toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment'); 
                showAlert(`Payment Failed: ${response.error.description}. Note: If you get a 500 Error, your backend must generate an order_id first.`, "Transaction Failed"); 
            });
            
            if (isCOD) { 
                showAlert(`As you chose COD, you must pay the ₹${amountToCharge} shipping charge now. You will pay ₹${currentOrderState.itemsTotal} on delivery.`, "COD Policy", true, () => { 
                    try { rzp.open(); } catch(e) { handleRzpCrash(e); }
                }); 
                toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment'); 
            } else { 
                rzp.open(); 
            }
        } catch (error) {
            handleRzpCrash(error);
        }
    }, 100);
};

function handleRzpCrash(error) {
    console.error(error);
    toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment');
    showAlert("Failed to initialize Razorpay. This is usually caused by missing a backend-generated order_id.", "System Error");
}

async function saveOrderToBackend(paymentId, isCOD) {
    const session = JSON.parse(localStorage.getItem('active_session')); const orderNo = "ARY-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100); const fullAddress = `${document.getElementById('chkAddress').value}, ${document.getElementById('chkCity').value} - ${document.getElementById('chkPincode').value}`;
    const orderData = { order_no: orderNo, user_email: session.email, delivery_name: document.getElementById('chkName').value, delivery_phone: document.getElementById('chkPhone').value, delivery_address: fullAddress, items: cart, financials: currentOrderState, payment_method: isCOD ? "COD (Shipping Prepaid)" : "Online Full", razorpay_id: paymentId, status: "Confirmed", timestamp: new Date().toISOString() };
    toggleButtonState('payBtn', true, 'Authorizing...');
    try {
        const res = await fetch(`${API_BASE_URL}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) }); if(!res.ok) throw new Error("API Save Failed");
        buildGloriousReceipt(orderData); cart = []; updateCartUI();
        history.back(); setTimeout(() => { openUI('overlay'); openUI('orderSuccessModal'); }, 300);
    } catch (error) { showAlert("Payment successful, but saving order failed. Screenshot this Payment ID: " + paymentId, "Critical Error"); } finally { toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Authorize Payment'); }
}

function buildGloriousReceipt(data) {
    document.getElementById('recOrderNo').innerText = data.order_no; document.getElementById('recAddress').innerText = data.delivery_address; document.getElementById('recItemsTotal').innerText = `₹${data.financials.itemsTotal.toLocaleString('en-IN')}`; document.getElementById('recShipping').innerText = `₹${data.financials.shippingCost.toLocaleString('en-IN')}`; document.getElementById('recGrandTotal').innerText = `₹${data.financials.grandTotal.toLocaleString('en-IN')}`;
    const tbody = document.getElementById('recTableBody'); tbody.innerHTML = ''; let emailItemsText = ""; 
    data.items.forEach(item => { tbody.innerHTML += `<tr><td>${item.name}</td><td class="mono-td">x${item.qty}</td><td class="text-right mono-td">₹${(item.price * item.qty).toLocaleString('en-IN')}</td></tr>`; emailItemsText += `${item.name} (x${item.qty}) - Rs.${item.price * item.qty}\n`; });
    emailjs.send("service_wnqvm4n", "YOUR_NEW_RECEIPT_TEMPLATE_ID", { to_email: data.user_email, to_name: data.delivery_name, order_no: data.order_no, address: data.delivery_address, items_list: emailItemsText, shipping: data.financials.shippingCost, grand_total: data.financials.grandTotal }).catch(err => console.log("Receipt email failed", err));
}
window.closeOrderSuccess = function() { history.back(); }

checkSession(); fetchProducts();
