// --- 1. CONFIGURATION ---
const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";
const RAZORPAY_KEY = "rzp_test_SfN9xZbqkMSz6G"; 

emailjs.init("TDgNRO0CEs9rU3ozD");

// --- 2. GLOBAL STATE ---
let hashedOTP; 
let tempUserData = null;
let cart = [];
let allProducts = [];
let currentOrderState = {
    itemsTotal: 0,
    shippingCost: 0,
    grandTotal: 0,
    distanceKm: 0
};

const BHAGALPUR_LAT = 25.2425;
const BHAGALPUR_LON = 86.9842;

// --- 3. UI & CUSTOM ALERT LOGIC ---
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const authModal = document.getElementById('authModal');
const productModal = document.getElementById('productModal');
const checkoutModal = document.getElementById('checkoutModal');
const orderSuccessModal = document.getElementById('orderSuccessModal');
const cartPanel = document.getElementById('cartPanel');
const customAlertOverlay = document.getElementById('customAlertOverlay');

function showAlert(message, title = "Notice") {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    customAlertOverlay.style.display = 'flex';
}
window.closeAlert = function() { customAlertOverlay.style.display = 'none'; };

menuBtn.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
overlay.addEventListener('click', closeAllModals);
document.querySelectorAll('.exit-modal').forEach(btn => btn.addEventListener('click', closeAllModals));
document.getElementById('closeCart').addEventListener('click', closeAllModals);

document.getElementById('cartBtn').addEventListener('click', () => {
    cartPanel.classList.add('open');
    overlay.classList.add('show');
});

function closeAllModals() {
    sidebar.classList.remove('open');
    cartPanel.classList.remove('open');
    overlay.classList.remove('show');
    authModal.style.display = 'none';
    checkoutModal.style.display = 'none';
    productModal.style.display = 'none';
    orderSuccessModal.style.display = 'none';
}

window.goToStep = function(step) {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('otpView').style.display = 'none';
    document.getElementById(step + 'View').style.display = 'block';
};

// --- 4. SESSION & AUTH ---
function checkSession() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const accBtn = document.getElementById('accountBtn');
    
    if (session && session.email) {
        document.getElementById('sidebarUser').innerText = 'Welcome ' + session.name;
        accBtn.innerText = 'Log Out';
        accBtn.onclick = () => { localStorage.removeItem('active_session'); location.reload(); };
    } else {
        document.getElementById('sidebarUser').innerText = 'Welcome Guest';
        accBtn.innerText = 'Sign In';
        accBtn.onclick = () => { authModal.style.display = 'flex'; goToStep('login'); overlay.classList.add('show'); };
    }
}

async function secureHash(string) {
    const msgBuffer = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => { if (e.target.value.length === 1 && index < 3) otpInputs[index + 1].focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && e.target.value === '' && index > 0) otpInputs[index - 1].focus(); });
});

function toggleButtonState(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = 'Wait... <div class="loader"></div>';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText;
        btn.disabled = false;
    }
}

window.handleSignup = async function() {
    tempUserData = {
        action: 'signup',
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        phone: document.getElementById('regPhone').value,
        address: document.getElementById('regAddress').value,
        city: document.getElementById('regCity').value,
        state: document.getElementById('regState').value,
        pincode: document.getElementById('regPincode').value
    };

    if (!tempUserData.name || !tempUserData.email || !tempUserData.phone || !tempUserData.pincode) {
        return showAlert("Please fill all mandatory fields including Pincode.");
    }

    toggleButtonState('signupBtn', true);
    const rawOTP = Math.floor(1000 + Math.random() * 9000).toString();
    hashedOTP = await secureHash(rawOTP);

    try {
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: tempUserData.email, to_name: tempUserData.name, otp_code: rawOTP });
        showAlert("Verification code sent to your email!", "Check Inbox");
        goToStep('otp');
    } catch (err) { showAlert("Failed to send email. Check API keys."); } 
    finally { toggleButtonState('signupBtn', false); }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    if(!email) return showAlert("Please enter your email.");
    
    toggleButtonState('loginBtn', true);
    try {
        const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data || !data.email) {
            toggleButtonState('loginBtn', false);
            showAlert("Email not found. Please register as a new user.");
            return goToStep('signup');
        }

        tempUserData = { action: 'login', ...data };
        const rawOTP = Math.floor(1000 + Math.random() * 9000).toString();
        hashedOTP = await secureHash(rawOTP);
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: email, to_name: tempUserData.name, otp_code: rawOTP });
        goToStep('otp');
    } catch(err) { showAlert("Login failed. Check your connection."); }
    finally { toggleButtonState('loginBtn', false); }
};

window.completeAuth = async function() {
    let otp = '';
    otpInputs.forEach(i => otp += i.value);
    if(otp.length !== 4) return showAlert("Please enter all 4 digits.");
    
    const hash = await secureHash(otp);
    if (hash === hashedOTP) {
        try {
            if (tempUserData.action === 'signup') {
                const addRes = await fetch(`${API_BASE_URL}/add-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: tempUserData.name,
                        email: tempUserData.email,
                        phone: tempUserData.phone,
                        address: tempUserData.address,
                        city: tempUserData.city,
                        state: tempUserData.state,
                        pincode: tempUserData.pincode,
                        timestamp: new Date().toISOString()
                    })
                });
                if(!addRes.ok) throw new Error("API Save Failed");
            }

            localStorage.setItem('active_session', JSON.stringify(tempUserData));
            showAlert(`Welcome, ${tempUserData.name}!`, "Success");
            setTimeout(() => location.reload(), 1500);
        } catch (error) { showAlert("Server sync failed."); }
    } else { showAlert("Invalid OTP."); }
};

// --- 5. PRODUCTS & CART ---
async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        if(!res.ok) throw new Error("Failed to load");
        allProducts = await res.json();
        
        if(allProducts.length === 0) {
            allProducts = [
                { id: 1, name: "Sony WH-1000XM5", price: 29990, icon: "🎧", desc: "Noise canceling headphones." },
                { id: 2, name: "Apple Watch Series 9", price: 41900, icon: "⌚", desc: "Advanced health features." }
            ];
        }
        renderProducts(allProducts);
    } catch(err) {
        document.getElementById('productShelf').innerHTML = '<p style="text-align:center; grid-column:1/-1;">Loading products failed.</p>';
    }
}

function renderProducts(list) {
    const shelf = document.getElementById('productShelf');
    shelf.innerHTML = '';
    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.onclick = () => {
            currentProduct = p;
            document.getElementById('modalProductImage').innerText = p.icon || "📦";
            document.getElementById('modalProductName').innerText = p.name;
            document.getElementById('modalProductDesc').innerText = p.desc;
            document.getElementById('modalProductPrice').innerText = `₹${Number(p.price).toLocaleString('en-IN')}`;
            productModal.style.display = 'flex';
            overlay.classList.add('show');
        };
        div.innerHTML = `<div class="item-image">${p.icon || "📦"}</div><div class="item-info"><h4>${p.name}</h4><span class="price">₹${Number(p.price).toLocaleString('en-IN')}</span></div>`;
        shelf.appendChild(div);
    });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = allProducts.filter(p => (p.name && p.name.toLowerCase().includes(term)) || (p.desc && p.desc.toLowerCase().includes(term)));
    renderProducts(filtered);
});

let currentProduct = null;
window.addToCartFromModal = function() { addToCart(currentProduct); closeAllModals(); };
window.buyNowFromModal = function() { cart = []; addToCart(currentProduct); closeAllModals(); openCheckout(); };

function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    existing ? existing.qty += 1 : cart.push({ ...product, qty: 1 });
    updateCartUI();
    const t = document.getElementById("toast");
    t.className = "toast show"; setTimeout(() => t.className = "toast", 3000);
}

window.changeQty = function(id, d) {
    const item = cart.find(i => i.id === id);
    if(item) { item.qty += d; if(item.qty <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); }
};

window.removeFromCart = function(id) { cart = cart.filter(i => i.id !== id); updateCartUI(); };

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let total = 0, qty = 0;

    cart.forEach(item => {
        qty += item.qty; total += (item.price * item.qty);
        container.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h5>${item.name}</h5>
                    <span style="color:var(--primary); font-weight:bold;">₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
                        <button class="remove-btn" onclick="removeFromCart('${item.id}')">Remove</button>
                    </div>
                </div>
                <div style="font-size:30px;">${item.icon || "📦"}</div>
            </div>`;
    });
    document.getElementById('cartBadge').innerText = qty;
    document.getElementById('cartTotalValue').innerText = `₹${total.toLocaleString('en-IN')}`;
    currentOrderState.itemsTotal = total;
}

// --- 6. CHECKOUT & SHIPPING ---
window.openCheckout = function() {
    if (cart.length === 0) return showAlert("Your Cart is empty!");
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (!session) { showAlert("Please sign in first.", "Account Required"); return document.getElementById('accountBtn').click(); }

    document.getElementById('chkName').value = session.name || "";
    document.getElementById('chkPhone').value = session.phone || "";
    document.getElementById('chkAddress').value = session.address || "";
    document.getElementById('chkCity').value = session.city || "";
    document.getElementById('chkPincode').value = session.pincode || "";

    cartPanel.classList.remove('open');
    checkoutModal.style.display = 'flex';
    document.getElementById('checkoutStep1').style.display = 'block';
    document.getElementById('checkoutStep2').style.display = 'none';
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

window.calculateShippingAndProceed = async function() {
    const pincode = document.getElementById('chkPincode').value;
    if(!pincode) return showAlert("Pincode is required to calculate shipping.");
    
    toggleButtonState('calcShippingBtn', true);

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${pincode},+India`);
        const data = await res.json();
        
        let shippingFee = 60; 
        
        if (data && data.length > 0) {
            const userLat = parseFloat(data[0].lat);
            const userLon = parseFloat(data[0].lon);
            const distance = getDistanceFromLatLonInKm(BHAGALPUR_LAT, BHAGALPUR_LON, userLat, userLon);
            currentOrderState.distanceKm = distance.toFixed(2);
            
            if (distance < 10) shippingFee = 10;
            else if (distance < 35) shippingFee = 25;
            else if (distance < 70) shippingFee = 60;
            else if (distance < 120) shippingFee = 100;
            else shippingFee = 150;
        }

        currentOrderState.shippingCost = shippingFee;
        currentOrderState.grandTotal = currentOrderState.itemsTotal + shippingFee;

        document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal}`;
        document.getElementById('sumShipping').innerText = `₹${shippingFee}`;
        document.getElementById('sumTotal').innerText = `₹${currentOrderState.grandTotal}`;

        document.getElementById('checkoutStep1').style.display = 'none';
        document.getElementById('checkoutStep2').style.display = 'block';
    } catch(err) {
        showAlert("Could not verify Pincode accurately. Applying default ₹60 shipping.", "Map Warning");
        currentOrderState.shippingCost = 60;
        currentOrderState.grandTotal = currentOrderState.itemsTotal + 60;
        document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal}`;
        document.getElementById('sumShipping').innerText = `₹60`;
        document.getElementById('sumTotal').innerText = `₹${currentOrderState.grandTotal}`;
        
        document.getElementById('checkoutStep1').style.display = 'none';
        document.getElementById('checkoutStep2').style.display = 'block';
    } finally {
        toggleButtonState('calcShippingBtn', false);
    }
};

// --- 7. PAYMENT, RECEIPT & EMAIL ---
window.processPayment = function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const isCOD = document.querySelector('input[name="payMethod"]:checked').value === 'cod';
    const amountToCharge = isCOD ? currentOrderState.shippingCost : currentOrderState.grandTotal;

    if (amountToCharge === 0 && isCOD) return saveOrderToBackend("COD_NO_SHIPPING_FEE", isCOD);

    const options = {
        "key": RAZORPAY_KEY, 
        "amount": amountToCharge * 100, 
        "currency": "INR",
        "name": "Aryanta Premium",
        "description": isCOD ? "Shipping Charge Payment" : "Full Order Payment",
        "handler": function (response) {
            saveOrderToBackend(response.razorpay_payment_id, isCOD);
        },
        "prefill": { "name": document.getElementById('chkName').value, "email": session.email, "contact": document.getElementById('chkPhone').value },
        "theme": { "color": "#008080" }
    };
    
    if (isCOD) {
        showAlert(`As you chose COD, you must pay the ₹${amountToCharge} shipping charge now. You will pay ₹${currentOrderState.itemsTotal} on delivery.`, "COD Policy");
        setTimeout(() => { const rzp = new Razorpay(options); rzp.open(); }, 3000);
    } else {
        const rzp = new Razorpay(options); rzp.open();
    }
};

async function saveOrderToBackend(paymentId, isCOD) {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const orderNo = "ORD-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
    const fullAddress = `${document.getElementById('chkAddress').value}, ${document.getElementById('chkCity').value} - ${document.getElementById('chkPincode').value}`;

    const orderData = {
        order_no: orderNo,
        user_email: session.email,
        delivery_name: document.getElementById('chkName').value,
        delivery_phone: document.getElementById('chkPhone').value,
        delivery_address: fullAddress,
        items: cart,
        financials: currentOrderState,
        payment_method: isCOD ? "COD (Shipping Prepaid)" : "Online Full",
        razorpay_id: paymentId,
        status: "Processing",
        timestamp: new Date().toISOString()
    };

    document.getElementById('payBtn').innerText = "Processing...";
    document.getElementById('payBtn').disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if(!res.ok) throw new Error("API Save Failed");

        // Prepare Receipt
        buildReceiptAndEmail(orderData);
        
        cart = []; 
        updateCartUI();
        checkoutModal.style.display = 'none';
        orderSuccessModal.style.display = 'flex';

    } catch (error) {
        showAlert("Payment successful, but saving order failed. Screenshot this Payment ID: " + paymentId, "Critical Error");
    } finally {
        document.getElementById('payBtn').innerText = "Proceed to Pay";
        document.getElementById('payBtn').disabled = false;
    }
}

function buildReceiptAndEmail(data) {
    // 1. Populate Screen Receipt
    document.getElementById('recOrderNo').innerText = data.order_no;
    document.getElementById('recAddress').innerText = data.delivery_address;
    document.getElementById('recItemsTotal').innerText = `₹${data.financials.itemsTotal}`;
    document.getElementById('recShipping').innerText = `₹${data.financials.shippingCost}`;
    document.getElementById('recGrandTotal').innerText = `₹${data.financials.grandTotal}`;
    
    const tbody = document.getElementById('recTableBody');
    tbody.innerHTML = '';
    let emailItemsText = ""; // For email

    data.items.forEach(item => {
        // UI Table
        tbody.innerHTML += `<tr><td>${item.name}</td><td>${item.qty}</td><td>₹${item.price * item.qty}</td></tr>`;
        // Text formatted for EmailJS template
        emailItemsText += `${item.name} (x${item.qty}) - Rs.${item.price * item.qty}\n`;
    });

    // 2. Send Receipt Email via EmailJS
    // NOTE: You need to create a new template in EmailJS for receipts and put the ID below!
    // Example variables for your EmailJS Template: {{order_no}}, {{address}}, {{items_list}}, {{grand_total}}
    emailjs.send("service_wnqvm4n", "YOUR_NEW_RECEIPT_TEMPLATE_ID", {
        to_email: data.user_email,
        to_name: data.delivery_name,
        order_no: data.order_no,
        address: data.delivery_address,
        items_list: emailItemsText,
        shipping: data.financials.shippingCost,
        grand_total: data.financials.grandTotal
    }).catch(err => console.log("Receipt email failed to send", err));
}

window.closeOrderSuccess = function() {
    orderSuccessModal.style.display = 'none';
    overlay.classList.remove('show');
}

// Init
checkSession();
fetchProducts();
