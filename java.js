// --- 1. CONFIGURATION ---
// Replace the values below with your actual Firebase Project keys from Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Services
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Initialize EmailJS with your Public Key
emailjs.init("TDgNRO0CEs9rU3ozD");

// --- 2. SELECTORS ---
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const accountBtn = document.getElementById('accountBtn');
const authModal = document.getElementById('authModal');
const closeModal = document.getElementById('closeModal');
const cartBtn = document.getElementById('cartBtn');
const cartPanel = document.getElementById('cartPanel');
const closeCart = document.getElementById('closeCart');
const productModal = document.getElementById('productModal');

let hashedOTP; 
let tempUserData = null;
let cart = []; // Shopping Cart State

// --- 3. UI & SIDEBAR LOGIC ---
function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.add('show');
}

menuBtn.addEventListener('click', toggleSidebar);

overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    cartPanel.classList.remove('open');
    overlay.classList.remove('show');
    authModal.style.display = 'none';
});

accountBtn.addEventListener('click', () => {
    authModal.style.display = 'flex';
    goToStep('login');
});

closeModal.addEventListener('click', () => {
    authModal.style.display = 'none';
});

cartBtn.addEventListener('click', () => {
    cartPanel.classList.add('open');
    overlay.classList.add('show');
});

closeCart.addEventListener('click', () => {
    cartPanel.classList.remove('open');
    overlay.classList.remove('show');
});

window.goToStep = function(step) {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('otpView').style.display = 'none';
    document.getElementById(step + 'View').style.display = 'block';
};

// --- 4. ENCRYPTION ENGINE (SHA-256) ---
async function secureHash(string) {
    const msgBuffer = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- 5. OTP INPUT LOGIC ---
const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
            otpInputs[index - 1].focus();
        }
    });
});

function getEnteredOTP() {
    let otp = '';
    otpInputs.forEach(input => otp += input.value);
    return otp;
}

// --- 6. SIGNUP & EMAIL LOGIC (With Loaders) ---
function toggleButtonState(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = 'Sending... <div class="loader"></div>';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText;
        btn.disabled = false;
    }
}

window.handleSignup = async function() {
    tempUserData = {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        phone: document.getElementById('regPhone').value
    };

    if (!tempUserData.name || !tempUserData.email || !tempUserData.phone) {
        alert("Please provide Name, Email, and Phone Number.");
        return;
    }

    toggleButtonState('signupBtn', true);
    const rawOTP = Math.floor(100000 + Math.random() * 900000).toString();
    hashedOTP = await secureHash(rawOTP);

    try {
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", {
            to_email: tempUserData.email,
            to_name: tempUserData.name,
            otp_code: rawOTP
        });
        alert("Verification code sent to your email!");
        goToStep('otp');
    } catch (err) {
        console.error("EmailJS Error:", err);
        alert("Failed to send email. Check your Service/Template IDs.");
    } finally {
        toggleButtonState('signupBtn', false);
    }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    if(!email) return alert("Please enter email");
    
    toggleButtonState('loginBtn', true);
    tempUserData = { email: email, name: "Returning User" };
    const rawOTP = Math.floor(100000 + Math.random() * 900000).toString();
    hashedOTP = await secureHash(rawOTP);

    try {
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", {
            to_email: email,
            to_name: "Customer",
            otp_code: rawOTP
        });
        goToStep('otp');
    } catch(err) {
        alert("Failed to send OTP.");
    } finally {
        toggleButtonState('loginBtn', false);
    }
};

window.completeAuth = async function() {
    const enteredOTP = getEnteredOTP();
    if(enteredOTP.length !== 6) return alert("Please enter all 6 digits.");
    
    const enteredHash = await secureHash(enteredOTP);

    if (enteredHash === hashedOTP) {
        try {
            await db.collection("users").add({
                ...tempUserData,
                auth_method: "Email-OTP",
                timestamp: new Date().toISOString()
            });
            alert("Registration/Login Successful!");
            location.reload(); 
        } catch (error) {
            console.error("Firebase Error:", error);
            alert("Verified, but data failed to sync to cloud.");
        }
    } else {
        alert("Invalid OTP code. Access Denied.");
    }
};

// --- 7. PRODUCTS, CART & SEARCH SYSTEM ---
const products = [
    { id: 1, name: "Sony WH-1000XM5", price: 29990, icon: "🎧", desc: "Industry leading noise canceling wireless headphones." },
    { id: 2, name: "Apple Watch Series 9", price: 41900, icon: "⌚", desc: "Smarter. Brighter. Mightier. Advanced health features." },
    { id: 3, name: "Samsung Galaxy S24 Ultra", price: 129999, icon: "📱", desc: "AI powered smartphone with a 200MP camera and titanium frame." },
    { id: 4, name: "MacBook Pro M3", price: 169900, icon: "💻", desc: "Mind-blowing performance. Boundary-breaking graphics." },
    { id: 5, name: "Nike Air Max 270", price: 12995, icon: "👟", desc: "Lifestyle shoe delivering visible air under every step." },
    { id: 6, name: "Dyson V15 Detect", price: 55900, icon: "🧹", desc: "Cordless vacuum with laser illumination for microscopic dust." },
    { id: 7, name: "Sony PlayStation 5", price: 54990, icon: "🎮", desc: "Next-gen gaming console with lightning-fast loading." },
    { id: 8, name: "Kindle Paperwhite", price: 13999, icon: "📖", desc: "Waterproof e-reader with a 6.8-inch display." }
];

// Update function to accept a specific list of products (for searching)
function renderProducts(productList = products) {
    const shelf = document.getElementById('productShelf');
    shelf.innerHTML = '';
    
    if (productList.length === 0) {
        shelf.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 40px; font-size: 18px;">No products found matching your search.</p>';
        return;
    }

    productList.forEach(p => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.onclick = () => openProductModal(p);
        div.innerHTML = `
            <div class="item-image">${p.icon}</div>
            <div class="item-info">
                <h4>${p.name}</h4>
                <span class="price">₹${p.price.toLocaleString('en-IN')}</span>
            </div>
        `;
        shelf.appendChild(div);
    });
}

// Real-Time Search Functionality
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    // Filter products by name or description
    const filteredProducts = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm) || 
        product.desc.toLowerCase().includes(searchTerm)
    );
    
    // Re-render the grid with only the filtered items
    renderProducts(filteredProducts);
});

let currentProduct = null;

function openProductModal(product) {
    currentProduct = product;
    document.getElementById('modalProductImage').outerHTML = `<div class="product-image-container" id="modalProductImage">${product.icon}</div>`;
    document.getElementById('modalProductName').innerText = product.name;
    document.getElementById('modalProductDesc').innerText = product.desc;
    document.getElementById('modalProductPrice').innerText = `₹${product.price.toLocaleString('en-IN')}`;
    
    productModal.style.display = 'flex';
}

window.closeProductModal = function() {
    productModal.style.display = 'none';
}

window.addToCartFromModal = function() {
    if(currentProduct) {
        addToCart(currentProduct);
        closeProductModal();
    }
}

function showToast() {
    const toast = document.getElementById("toast");
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        existingItem.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }
    updateCartUI();
    showToast();
}

window.changeQty = function(id, delta) {
    const item = cart.find(item => item.id === id);
    if(item) {
        item.qty += delta;
        if(item.qty <= 0) cart = cart.filter(i => i.id !== id);
        updateCartUI();
    }
}

window.removeFromCart = function(id) {
    cart = cart.filter(i => i.id !== id);
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    const badge = document.getElementById('cartBadge');
    const totalEl = document.getElementById('cartTotalValue');
    
    container.innerHTML = '';
    let totalQty = 0;
    let totalPrice = 0;

    cart.forEach(item => {
        totalQty += item.qty;
        totalPrice += (item.price * item.qty);
        
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <h5>${item.name}</h5>
                <span style="color:var(--primary); font-weight:bold;">₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
                    <button class="remove-btn" onclick="removeFromCart(${item.id})">Remove</button>
                </div>
            </div>
            <div style="font-size:30px;">${item.icon}</div>
        `;
        container.appendChild(div);
    });

    badge.innerText = totalQty;
    totalEl.innerText = `₹${totalPrice.toLocaleString('en-IN')}`;
}

// Initialize Page
renderProducts();