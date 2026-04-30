// seller.js - Fully Restored Firebase SDK Logic, Print/PDF Fixes, & 7-Day Suspension

const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";

// API Keys
let API_KEYS = {
    RAZORPAY: "",
    EMAILJS_PUBLIC: "",
    EMAILJS_OTP_SERVICE: "",
    EMAILJS_OTP_TEMPLATE: ""
};

// PURE FIREBASE SDK CONFIGURATION (Restored original direct DB access)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "aryanta-mart-a8893.firebaseapp.com",
    projectId: "aryanta-mart-a8893",
    storageBucket: "aryanta-mart-a8893.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let suspendInterval;

// GLOBALS
let currentSeller = null;
let sellerProducts = [];
let sellerOrders = [];
let sellerFines = [];
let sellerReviews = [];
let sellerWarranties = []; 
let b2bItems = [];
let salesChartInstance = null;
let uploadedImagesArray = [];
let html5QrcodeScanner = null;

let currentPlanDuration = 'month'; 
let cachedTotalUpcoming = 0; 

// ================= UI & MASKING =================
function renderStatusScreen(title, msg, isSuspended = false, endTime = null) {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("statusBox").style.display = "block";
    document.getElementById("statusTitle").innerText = title;
    document.getElementById("statusTitle").style.color = isSuspended ? "var(--warning)" : "var(--danger)";
    document.getElementById("statusMessage").innerHTML = msg;
    
    const timerEl = document.getElementById("suspendTimer");
    if (isSuspended && endTime) {
        timerEl.style.display = "block";
        clearInterval(suspendInterval);
        suspendInterval = setInterval(() => {
            const now = Date.now();
            const diff = endTime - now;
            if (diff <= 0) {
                clearInterval(suspendInterval);
                timerEl.innerText = "Suspension Over! Unblocking...";
                currentSeller.status = "Active";
                currentSeller.suspendedAt = null;
                localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
                
                db.collection("sellers").doc(currentSeller.email).update({ 
                    status: "Active",
                    suspendedAt: firebase.firestore.FieldValue.delete()
                }).then(() => {
                    window.location.reload();
                });
            } else {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                timerEl.innerText = `${d}d ${h}h ${m}m ${s}s`;
            }
        }, 1000);
    } else {
        timerEl.style.display = "none";
    }
}

window.toggleSidebar = function() { 
    const sb = document.getElementById('mobileSidebar');
    const ov = document.getElementById('mobileSidebarOverlay');
    sb.classList.toggle('open'); 
    if(sb.classList.contains('open')) ov.style.display = 'block';
    else ov.style.display = 'none';
}

window.closeModal = function(id) { 
    document.getElementById(id).style.display = "none"; 
    if(id === 'scanModal' && html5QrcodeScanner) { try { html5QrcodeScanner.clear(); } catch(e) {} }
}

function maskName(name) {
    if(!name) return 'Customer';
    let parts = name.split(' ');
    return parts.map(p => p.charAt(0) + '***').join(' ');
}

function maskEmail(email) {
    if(!email) return 'Hidden'; 
    let parts = email.split("@"); 
    if(parts.length !== 2) return 'Hidden'; 
    let name = parts[0];
    if(name.length <= 4) return name.substring(0,1) + "****@" + parts[1];
    return name.substring(0,4) + "****@" + parts[1];
}

function maskPhone(phone) {
    if(!phone) return 'Hidden'; 
    let pStr = String(phone).replace(/\D/g, ''); 
    if(pStr.length < 4) return 'Hidden'; 
    return "******" + pStr.substring(pStr.length - 4);
}

window.toggleCustomSelect = function() {
    const opts = document.querySelector('.custom-select-options');
    if(opts) opts.classList.toggle('open');
}
window.selectOption = function(value) {
    document.getElementById('supCategorySelected').innerText = value;
    document.getElementById('supCategory').value = value;
    document.querySelector('.custom-select-options').classList.remove('open');
}
document.addEventListener('click', function(e) {
    if(!e.target.closest('.custom-select-wrapper')) {
        const opts = document.querySelector('.custom-select-options');
        if(opts) opts.classList.remove('open');
    }
    if(!e.target.closest('.search-container')) {
        document.getElementById('searchSuggestions').style.display = 'none';
    }
});

window.openImageViewer = function(src) {
    document.getElementById("fullscreenImg").src = src; document.getElementById("imageViewerModal").style.display = "flex";
}

window.showToast = function(msg, type="info") {
    const container = document.getElementById("toastContainer"); const toast = document.createElement("div");
    toast.className = `toast ${type}`; let icon = type === 'success' ? "fa-check-circle" : (type === 'error' ? "fa-times-circle" : "fa-info-circle");
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`; container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3500);
}

function safeSetText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// ================= AUTHENTICATION & SUSPENSION =================
function checkSession() {
    const token = localStorage.getItem('sellerToken');
    const loader = document.getElementById("pageLoader");

    if (token) {
        currentSeller = JSON.parse(token);
        
        if(currentSeller.status === "Blocked") {
            document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none";
            renderStatusScreen(
                "Account Blocked", 
                "You have been permanently blocked by Admin.<br><br>Please get support by:<br>📞 Phone: <strong>06414054676</strong><br>✉️ Email: <strong>support@aryanta.com</strong>",
                false
            );
            return;
        }
        if(currentSeller.status === "Suspended") {
            document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none";
            
            // 7 Days Suspension Logic
            let suspendTime = currentSeller.suspendedAt ? new Date(currentSeller.suspendedAt).getTime() : Date.now();
            let unlockTime = suspendTime + (7 * 24 * 60 * 60 * 1000); 
            
            if (Date.now() >= unlockTime) {
                currentSeller.status = "Active";
                currentSeller.suspendedAt = null;
                localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
                db.collection("sellers").doc(currentSeller.email).update({ 
                    status: "Active", suspendedAt: firebase.firestore.FieldValue.delete() 
                }).catch(e=>console.error(e));
                
                document.getElementById("loginOverlay").style.display = "none"; 
                document.querySelector(".seller-container").style.display = "block";
            } else {
                if (!currentSeller.suspendedAt) {
                    currentSeller.suspendedAt = new Date().toISOString();
                    db.collection("sellers").doc(currentSeller.email).update({ suspendedAt: currentSeller.suspendedAt });
                }
                renderStatusScreen(
                    "Account Suspended", 
                    "Your account is temporarily suspended by admin. You will be automatically unblocked after the timer reaches zero.<br><br>Get support by:<br>📞 Phone: <strong>06414054676</strong><br>✉️ Email: <strong>support@aryanta.com</strong>", 
                    true, 
                    unlockTime
                );
                return;
            }
        }
        
        applySettingsToUI();
        document.getElementById("loginOverlay").style.display = "none"; document.querySelector(".seller-container").style.display = "block";
        document.getElementById("sellerGreeting").innerText = `| ${currentSeller.companyName || currentSeller.email}`;
        
        if(currentSeller.subscription && currentSeller.subscription !== 'None') {
            document.getElementById('verifiedBadge').style.display = 'inline';
        }
        
        checkSubscriptionExpiry();
        initDashboard();
    } else {
        document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none"; 
    }
}

function checkSubscriptionExpiry() {
    if(currentSeller.subscription && currentSeller.subscription !== 'None' && currentSeller.subEndDate) {
        const end = new Date(currentSeller.subEndDate).getTime();
        const now = Date.now();
        const diffDays = (end - now) / (1000 * 3600 * 24);
        
        if(diffDays <= 7 && diffDays > 0) {
            document.getElementById('subExpiryMsg').innerText = `Your ${currentSeller.subscription} plan expires in ${Math.ceil(diffDays)} days (${new Date(end).toLocaleDateString()}). Please update your payment to avoid interruption of orders.`;
            document.getElementById('subExpiryModal').style.display = 'flex';
        } else if (diffDays <= 0) {
            document.getElementById('subExpiryMsg').innerText = `Your ${currentSeller.subscription} plan has EXPIRED. Please renew immediately to keep receiving orders.`;
            document.getElementById('subExpiryMsg').style.color = "var(--danger)";
            document.getElementById('subExpiryModal').style.display = 'flex';
        }
    }
}

window.handleLogin = async function() {
    const id = document.getElementById("loginId").value.trim(); const pass = document.getElementById("loginPass").value.trim();
    if(!id || !pass) return showToast("Enter Email/Phone and Password.", "error");

    const btn = document.getElementById("loginBtn"); btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Logging in...`;

    try {
        const snapshot = await db.collection("sellers").where("email", "==", id).where("password", "==", pass).get();
        if (!snapshot.empty) {
            currentSeller = snapshot.docs[0].data();
            if(!currentSeller.settings) currentSeller.settings = {};
            if(!currentSeller.subHistory) currentSeller.subHistory = [];
            
            localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
            
            checkSession();
            showToast(`Welcome, ${currentSeller.companyName || 'Seller'}!`, "success"); 
        } else {
            const phoneSnap = await db.collection("sellers").where("phone", "==", id).where("password", "==", pass).get();
            if(!phoneSnap.empty) {
                currentSeller = phoneSnap.docs[0].data();
                if(!currentSeller.settings) currentSeller.settings = {};
                if(!currentSeller.subHistory) currentSeller.subHistory = [];
                
                localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
                
                checkSession();
                showToast(`Welcome, ${currentSeller.companyName || 'Seller'}!`, "success"); 
            } else {
                btn.innerHTML = `Login to Dashboard <i class="fas fa-arrow-right"></i>`; 
                showToast("Invalid Credentials or Account Not Found.", "error");
            }
        }
    } catch(e) { btn.innerHTML = `Login to Dashboard <i class="fas fa-arrow-right"></i>`; showToast("Network error or Firebase not configured.", "error"); }
}

window.handleLogout = function() { localStorage.removeItem('sellerToken'); window.location.reload(); }

// ================= NAVIGATION =================
window.showSection = function(section) {
    document.getElementById('mobileSidebar').classList.remove('open'); document.getElementById('mobileSidebarOverlay').style.display = 'none';
    document.querySelectorAll(".data-section").forEach(sec => sec.classList.remove("active"));
    const targetSection = document.getElementById(section + "Section"); if(targetSection) targetSection.classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    if(event && event.target.closest) event.target.closest('.nav-item').classList.add("active");
    
    switch(section) {
        case 'home': renderDashboardStats(); break;
        case 'profile': loadProfile(); break;
        case 'inventory': loadInventory(); break;
        case 'newOrders': loadNewOrders(); break;
        case 'acceptedOrders': loadAcceptedOrders(); break;
        case 'shippedOrders': loadShippedOrders(); break;
        case 'deliveredOrders': loadDeliveredOrders(); break;
        case 'history': loadOrderHistory(); break;
        case 'returns': loadReturns(); break;
        case 'warranty': loadWarranty(); break;
        case 'payments': loadPayments(); break;
        case 'ads': loadAds(); break;
        case 'subscription': loadSubscriptionsUI(); break;
        case 'qna': loadQna(); break;
        case 'buyB2b': loadB2bStore(); break;
        case 'settings': loadSettingsUI(); break;
    }
}

window.handleGlobalSearch = function() {
    const input = document.getElementById("globalSearchInput").value.toLowerCase().trim(); const box = document.getElementById("searchSuggestions");
    if(!input) { box.style.display = 'none'; return; }
    let resultsHtml = '';
    const oMatches = sellerOrders.filter(o => (o.id && o.id.toLowerCase().includes(input)) || (o.order_no && o.order_no.toLowerCase().includes(input)) || (o.delivery_name && o.delivery_name.toLowerCase().includes(input)));
    oMatches.slice(0, 3).forEach(o => { resultsHtml += `<div class="suggestion-item" onclick="viewOrderDetails('${o.id}'); document.getElementById('searchSuggestions').style.display='none';"><strong>📦 Order: ${o.order_no || o.id}</strong><span>Status: ${o.status} | Buyer: ${maskName(o.delivery_name) || 'N/A'}</span></div>`; });
    const pMatches = sellerProducts.filter(p => (p.sku && p.sku.toLowerCase().includes(input)) || (p.name && p.name.toLowerCase().includes(input)));
    pMatches.slice(0, 3).forEach(p => { resultsHtml += `<div class="suggestion-item" onclick="editItem('${p.id}'); document.getElementById('searchSuggestions').style.display='none';"><strong>🛒 Product: ${p.name}</strong><span>SKU: ${p.sku || 'N/A'} | ₹${p.price}</span></div>`; });
    if(resultsHtml) { box.innerHTML = resultsHtml; box.style.display = 'block'; } else { box.innerHTML = `<div style="padding:15px; color:var(--text-light); font-size:13px; font-weight:600;">No matches found.</div>`; box.style.display = 'block'; }
}

// ================= CORE DATA FETCHERS =================
async function initDashboard() {
    const loader = document.getElementById("pageLoader"); const loadPercent = document.getElementById("loadPercent");
    if(loader) loader.style.display = "flex";

    let progress = 0;
    let progressInterval = setInterval(() => { if(progress < 90) { progress += Math.floor(Math.random() * 20); if(progress > 90) progress = 90; } if(loadPercent) loadPercent.innerText = progress + "%"; }, 40);

    try {
        const confSnap = await db.collection("site_config").doc("global").get();
        if(confSnap.exists && confSnap.data().marqueeMessage) {
            document.getElementById('sellerMarquee').innerText = confSnap.data().marqueeMessage;
        }
    } catch(e) {}

    try {
        const userEmailLower = currentSeller.email.toLowerCase().trim();

        // Fetch Products
        const prodSnap = await db.collection("products").where("sellerEmail", "==", userEmailLower).get();
        sellerProducts = prodSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Fetch Orders
        const ordSnap = await db.collection("orders").orderBy("timestamp", "desc").limit(500).get();
        sellerOrders = [];
        ordSnap.forEach(doc => {
            const o = doc.data(); o.id = doc.id;
            let hasSellerItem = false;
            if(o.items) {
                o.items.forEach(i => {
                    let mappedEmail = i.sellerEmail ? String(i.sellerEmail).toLowerCase().trim() : null;
                    if (mappedEmail === userEmailLower) { hasSellerItem = true; return; }
                    if (i.name) { const p = sellerProducts.find(x => x.name.toLowerCase() === i.name.toLowerCase()); if (p) hasSellerItem = true; }
                    if (i.sku || i.id) { const p = sellerProducts.find(x => x.sku === i.sku || x.id === i.id); if (p) hasSellerItem = true; }
                });
            }
            if (hasSellerItem || (o.sellerEmail && o.sellerEmail.toLowerCase().trim() === userEmailLower)) {
                sellerOrders.push(o);
            }
        });

        // Fetch Fines
        const fineSnap = await db.collection("fines").where("email", "==", userEmailLower).get();
        sellerFines = fineSnap.docs.map(d => ({id: d.id, ...d.data()}));

        // Fetch Reviews
        const revSnap = await db.collection("reviews").get();
        sellerReviews = [];
        revSnap.forEach(doc => {
            const r = doc.data();
            if (sellerProducts.some(p => p.id === r.productId)) { sellerReviews.push({id: doc.id, ...r}); }
        });

        // Fetch Warranties
        const warrSnap = await db.collection("warranties").where("sellerEmail", "==", userEmailLower).get();
        sellerWarranties = warrSnap.docs.map(d => ({id: d.id, ...d.data()}));

    } catch(e) {}

    clearInterval(progressInterval); if(loadPercent) loadPercent.innerText = "100%";

    renderDashboardStats(); loadB2bStore(); loadPayments();
    
    const activeSec = document.querySelector('.data-section.active');
    if(activeSec) showSection(activeSec.id.replace('Section', ''));

    if(loader) { setTimeout(() => { loader.style.opacity = "0"; setTimeout(() => { loader.style.display = "none"; loader.style.opacity="1"; }, 300); }, 400); }
}

function getSellerItemsFromOrder(order) {
    const userEmail = currentSeller.email.toLowerCase().trim();
    if (!order.items || !Array.isArray(order.items)) return [];
    return order.items.filter(i => {
        let iEmail = i.sellerEmail ? i.sellerEmail.toLowerCase().trim() : null;
        if (iEmail === userEmail) return true;
        if (i.name) { const p = sellerProducts.find(x => x.name.toLowerCase() === i.name.toLowerCase()); if (p) return true; }
        if (i.sku || i.id) { const p = sellerProducts.find(x => x.sku === i.sku || x.id === i.id); if (p) return true; }
        return false;
    });
}

function renderDashboardStats() {
    let revenue = 0; let pendingPay = 0; let toAccept = 0; let returnsCount = 0; let qnaPending = 0;
    let chartData = [0,0,0,0,0,0,0]; let productSalesMap = {}; 
    let todayOrdersCount = 0; let monthlyOrdersCount = 0;
    const nowStr = new Date().toDateString(); const currentMonth = new Date().getMonth();

    sellerOrders.forEach(o => {
        let myItems = getSellerItemsFromOrder(o);
        if(myItems.length === 0) return;
        
        let sum = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0);
        myItems.forEach(i => { if(!productSalesMap[i.name]) productSalesMap[i.name] = 0; productSalesMap[i.name] += Number(i.qty); });

        if(o.timestamp) {
            const oDate = new Date(o.timestamp);
            if(oDate.toDateString() === nowStr) todayOrdersCount++;
            if(oDate.getMonth() === currentMonth) monthlyOrdersCount++;
        }

        if(o.status === 'Delivered') revenue += sum;
        if(o.status === 'Delivered' && !o.sellerSettled) pendingPay += sum;
        if(o.status === 'Placed' || o.status === 'New' || o.status === 'Pending' || o.status === 'Confirmed') toAccept++;
        if(o.status.includes('Return') || o.status === 'Cancelled') returnsCount++;
        if(o.status === 'Delivered') { let dayIndex = new Date(o.timestamp || Date.now()).getDay(); chartData[dayIndex] += sum; }
    });

    let lowStockCount = 0; sellerProducts.forEach(p => { if(p.stock < 5) lowStockCount++; if(p.qa) p.qa.forEach(q => { if(!q.answer) qnaPending++; }); });

    safeSetText("smartDailyOrders", `${todayOrdersCount} Orders`); safeSetText("smartMonthlyOrders", `${monthlyOrdersCount} Orders`);
    safeSetText("stat-total-inventory", sellerProducts.length); 

    let avgDaily = monthlyOrdersCount / new Date().getDate(); 
    let dailyPct = avgDaily === 0 ? (todayOrdersCount > 0 ? 100 : 0) : Math.round(((todayOrdersCount - avgDaily) / avgDaily) * 100);
    let pctSign = dailyPct >= 0 ? '+' : '';
    let pctHtml = `<span style="font-size:11px; margin-left:5px; font-weight:bold; color:${dailyPct >= 0 ? '#10b981' : '#f43f5e'}">${pctSign}${dailyPct}% vs Avg</span>`;
    document.getElementById("smartDailyPct").innerHTML = pctHtml;
    safeSetText("smartRestock", `${lowStockCount} Items`);

    let rating = 5.0; if(sellerReviews.length > 0) { let totalRating = sellerReviews.reduce((sum, r) => sum + r.rating, 0); rating = (totalRating / sellerReviews.length).toFixed(1); }
    safeSetText("topShopRating", rating);

    safeSetText("stat-total-pay", "₹" + revenue.toLocaleString('en-IN')); safeSetText("stat-pending-pay", "₹" + pendingPay.toLocaleString('en-IN'));
    safeSetText("stat-orders", sellerOrders.length); safeSetText("stat-pending-orders", toAccept);

    const bNew = document.getElementById("badge-new-orders"); if(bNew) { if(toAccept > 0) { bNew.style.display="inline-block"; bNew.innerText=toAccept; } else bNew.style.display="none"; }
    const bAcc = document.getElementById("badge-accepted"); if(bAcc) { let accCount = sellerOrders.filter(o=>o.status==='Accepted').length; if(accCount > 0) { bAcc.style.display="inline-block"; bAcc.innerText=accCount; } else bAcc.style.display="none"; }
    const bWarr = document.getElementById("badge-warranty"); if(bWarr) { const wPending = sellerWarranties.filter(w => w.status === 'Assigned to Seller').length; if(wPending > 0) { bWarr.style.display="inline-block"; bWarr.innerText=wPending; } else bWarr.style.display="none"; }

    setTimeout(() => { renderSalesChart(chartData); }, 100);
}

function renderSalesChart(dataPoints) {
    const ctx = document.getElementById('salesChart'); if(!ctx) return;
    if(salesChartInstance) salesChartInstance.destroy();
    let gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250); gradient.addColorStop(0, 'rgba(5, 150, 105, 0.4)'); gradient.addColorStop(1, 'rgba(5, 150, 105, 0.0)');
    salesChartInstance = new Chart(ctx, { type: 'line', data: { labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], datasets: [{ label: 'Revenue (₹)', data: dataPoints, borderColor: '#059669', backgroundColor: gradient, fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#ffffff', pointBorderColor: '#059669', pointBorderWidth: 2, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5], color: '#e2e8f0' } }, x: { grid: { display: false } } } } });
}

// ================= SETTINGS & DARK MODE WITH CHROME STORAGE =================
function loadSettingsUI() {
    const s = currentSeller.settings || {};
    const elOffline = document.getElementById('settingOffline'); if(elOffline) elOffline.checked = s.offline === true;
    const elTheme = document.getElementById('settingTheme'); if(elTheme) elTheme.checked = s.theme === true;
    const elAutoAcc = document.getElementById('settingAutoAcc'); if(elAutoAcc) elAutoAcc.checked = s.autoAcc === true;
    const elVacation = document.getElementById('settingVacation'); if(elVacation) elVacation.checked = s.vacation === true;
    const elSms = document.getElementById('settingSms'); if(elSms) elSms.checked = s.sms === true;
    const el2fa = document.getElementById('setting2fa'); if(el2fa) el2fa.checked = s['2fa'] === true;
}

window.toggleSetting = async function(key) {
    if(!currentSeller.settings) currentSeller.settings = {};
    const el = document.getElementById(`setting${key.charAt(0).toUpperCase() + key.slice(1)}`);
    if(!el) return;
    
    const isChecked = el.checked;
    currentSeller.settings[key] = isChecked;
    
    applySettingsToUI();
    localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
    
    if(key === 'offline') {
        showToast(isChecked ? "Going Offline... Hiding products." : "Going Online... Making products live.");
        try {
            const batch = db.batch();
            sellerProducts.forEach(p => {
               p.isVisible = !isChecked; 
               batch.update(db.collection("products").doc(p.id), { isVisible: !isChecked }); 
            });
            await batch.commit();
            loadInventory();
        } catch(e){}
    }
    
    try { await db.collection("sellers").doc(currentSeller.email).update({ settings: currentSeller.settings }); } catch(e){}
}

function applySettingsToUI() {
    if(currentSeller && currentSeller.settings && currentSeller.settings.theme === true) { 
        document.body.classList.add('dark-theme'); 
    } else { 
        document.body.classList.remove('dark-theme'); 
    }
}

// ================= ADVANCED PROFILE & SUB HISTORY =================
function loadProfile() {
    const personal = currentSeller.personalInfo || {}; const shop = currentSeller.shopInfo || {};
    
    const subName = currentSeller.subscription || 'None';
    const subEnd = currentSeller.subEndDate ? new Date(currentSeller.subEndDate).toLocaleDateString() : 'N/A';
    const joined = currentSeller.joinedDate ? new Date(currentSeller.joinedDate).toLocaleDateString() : 'N/A';
    
    document.getElementById("profSubGrid").innerHTML = `
        <div class="detail-box"><span>Current Plan</span><strong style="color:var(--secondary); font-size:18px;">${subName}</strong></div>
        <div class="detail-box"><span>Joined Aryanta</span><strong>${joined}</strong></div>
        <div class="detail-box"><span>Valid Until (End Date)</span><strong style="color:var(--danger);">${subEnd}</strong></div>
    `;

    document.getElementById("profPersonalGrid").innerHTML = `
        <div class="detail-box"><span>Company Name</span><strong>${currentSeller.companyName || 'N/A'}</strong></div>
        <div class="detail-box"><span>Registered Email</span><strong>${currentSeller.email}</strong></div>
        <div class="detail-box"><span>Phone Number</span><strong>${currentSeller.phone || 'N/A'}</strong></div>
        <div class="detail-box"><span>Bank IFSC / A/C</span><strong style="font-family:monospace; color:var(--primary);">${currentSeller.bankIfsc || 'N/A'} <br> ${currentSeller.bankAccount || 'N/A'}</strong></div>
        <div class="detail-box" style="grid-column: span 2;"><span>Shop Address</span><strong>${shop.address || 'N/A'}</strong></div>
        <div class="detail-box"><span>Account Status</span><strong style="color:var(--success);">${currentSeller.status || 'Active'}</strong></div>
    `;

    document.getElementById("profIfsc").value = currentSeller.bankIfsc || '';
    document.getElementById("profAcc").value = currentSeller.bankAccount || '';
}

window.updateBankDetails = async function() {
    const ifsc = document.getElementById("profIfsc").value.trim();
    const acc = document.getElementById("profAcc").value.trim();
    if(!ifsc || !acc) return showToast("Both fields are required", "warning");

    try {
        await db.collection("sellers").doc(currentSeller.email).update({ bankIfsc: ifsc, bankAccount: acc });
        currentSeller.bankIfsc = ifsc; currentSeller.bankAccount = acc;
        localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
        showToast("Bank details updated successfully!", "success");
    } catch(e) { showToast("Failed to update bank details.", "error"); }
}

window.openSubHistoryModal = function() {
    const list = document.getElementById("subHistoryList"); list.innerHTML = "";
    const history = currentSeller.subHistory || [];
    if(history.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No subscription history found.</td></tr>"; }
    else {
        [...history].reverse().forEach(h => {
            list.innerHTML += `<tr><td><strong style="font-size:13px;">${new Date(h.startDate).toLocaleDateString()}</strong></td><td><strong style="color:var(--primary); font-size:14px;">${h.plan} (${h.duration})</strong></td><td>${h.method}</td><td><strong style="color:var(--success);">₹${h.cost}</strong></td><td>${new Date(h.endDate).toLocaleDateString()}</td></tr>`;
        });
    }
    document.getElementById('subHistoryModal').style.display = 'flex';
}

// ================= INVENTORY & MULTI-IMAGE SUPPORT =================
function loadInventory() {
    const list = document.getElementById("inventoryList"); list.innerHTML = "";
    if(sellerProducts.length === 0) { list.innerHTML = "<tr><td colspan='6' style='text-align:center; font-weight:600;'>No products found in inventory.</td></tr>"; return; }

    sellerProducts.forEach(p => {
        let imgHtml = "";
        let imgs = p.images && p.images.length > 0 ? p.images : (p.image ? [p.image] : []);
        imgs.forEach(img => {
            imgHtml += `<img src="${img}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; margin-right:5px; border:1px solid #e2e8f0;">`;
        });

        let stockHtml = p.stock < 5 ? `<span style="color:var(--danger); font-weight:800;">${p.stock} (Low)</span>` : `<span style="font-weight:700;">${p.stock}</span>`;
        list.innerHTML += `<tr class="clickable-row" onclick="editItem('${p.id}')">
            <td data-label="SKU & Images"><div style="display:flex; align-items:center;">${imgHtml}<strong style="font-family:monospace; font-size:13px; color:var(--primary); margin-left:10px;">${p.sku || p.id.substring(0,8)}</strong></div></td>
            <td data-label="Product Title"><strong style="font-size:14px;">${p.name}</strong></td>
            <td data-label="Category">${p.category || 'N/A'}</td>
            <td data-label="Stock">${stockHtml}</td>
            <td data-label="Price"><span style="text-decoration:line-through; font-size:11px; color:#94a3b8;">₹${p.mrp}</span> <br><strong style="color:var(--primary); font-size:15px;">₹${p.price}</strong></td>
            <td data-label="Actions">
                <div><button class="btn-sm edit" onclick="event.stopPropagation(); editItem('${p.id}')"><i class="fas fa-edit"></i></button><button class="btn-sm delete" onclick="event.stopPropagation(); deleteItem('${p.id}')"><i class="fas fa-trash"></i></button></div>
            </td>
        </tr>`;
    });
}

document.getElementById('itemImgFiles').addEventListener('change', async function(e) {
    const files = e.target.files; 
    const preview = document.getElementById('imagePreviewContainer'); 
    uploadedImagesArray = []; 
    preview.innerHTML = '';
    
    for (let file of files) {
        if (!file.type.startsWith('image/')) continue;
        
        const base64Str = await new Promise((resolve) => { 
            const reader = new FileReader(); 
            reader.readAsDataURL(file); 
            reader.onload = (ev) => { 
                const img = new Image(); 
                img.src = ev.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600; 
                    let scaleSize = 1;
                    if(img.width > MAX_WIDTH) scaleSize = MAX_WIDTH / img.width;
                    
                    canvas.width = img.width * scaleSize;
                    canvas.height = img.height * scaleSize;
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); 
                }
            }; 
        });
        
        uploadedImagesArray.push(base64Str); 
        preview.innerHTML += `<img src="${base64Str}" style="width:80px; height:80px; object-fit:cover; border-radius:12px; border:2px solid var(--primary);">`;
    }
});

window.calculateListedPrice = function() {
    const sp = parseFloat(document.getElementById("itemPrice").value) || 0;
    let subPlan = currentSeller.subscription || 'None';
    let commPercent = 0.06; 
    if(subPlan === 'Go') commPercent = 0.04;
    if(subPlan === 'Pro') commPercent = 0.03;
    
    const listed = sp + (sp * commPercent);
    document.getElementById("itemListedPrice").value = listed > 0 ? `₹ ${Math.round(listed)}` : '';
}

window.openItemModal = function() { 
    document.getElementById("itemForm").reset(); document.getElementById("editId").value = ""; document.getElementById("itemSku").value = ""; uploadedImagesArray = []; 
    document.getElementById("imagePreviewContainer").innerHTML = ""; document.getElementById("itemListedPrice").value = ""; document.getElementById("itemModal").style.display = "flex"; 
}

window.editItem = function(id) {
    const p = sellerProducts.find(x => x.id === id); if(!p) return;
    document.getElementById("editId").value = p.id; document.getElementById("itemSku").value = p.sku || p.id; document.getElementById("itemName").value = p.name; document.getElementById("itemCat").value = p.category; document.getElementById("itemStock").value = p.stock; document.getElementById("itemMrp").value = p.mrp; document.getElementById("itemPrice").value = p.price; document.getElementById("itemDesc").value = p.desc || "";
    calculateListedPrice();
    uploadedImagesArray = p.images || (p.image ? [p.image] : []); const preview = document.getElementById('imagePreviewContainer'); preview.innerHTML = ''; 
    uploadedImagesArray.forEach(img => preview.innerHTML += `<img src="${img}" style="width:80px; height:80px; object-fit:cover; border-radius:12px; border:2px solid var(--primary);">`);
    document.getElementById("itemModal").style.display = "flex";
}

window.submitItemForm = async function() {
    const id = document.getElementById("editId").value; 
    const mrp = parseInt(document.getElementById("itemMrp").value, 10); 
    const price = parseInt(document.getElementById("itemPrice").value, 10); 
    const stock = parseInt(document.getElementById("itemStock").value, 10);
    
    if(price > mrp) return showToast("Price cannot be > MRP!", "warning");
    if(isNaN(price) || isNaN(stock)) return showToast("Invalid Price or Stock", "error");
    
    let itemSku = document.getElementById("itemSku").value.trim(); 
    if(!itemSku) itemSku = 'PRD-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    let subPlan = currentSeller.subscription || 'None'; 
    let commPercent = 0.06; 
    if(subPlan === 'Go') commPercent = 0.04; 
    if(subPlan === 'Pro') commPercent = 0.03;
    
    const finalListedPrice = Math.round(price + (price * commPercent));

    const isOfflineMode = currentSeller.settings && currentSeller.settings.offline;
    const makeVisible = !isOfflineMode;

    const data = { 
        sellerEmail: currentSeller.email, 
        sellerName: currentSeller.companyName || currentSeller.email, 
        sku: itemSku, 
        name: document.getElementById("itemName").value, 
        category: document.getElementById("itemCat").value, 
        stock: stock, 
        mrp: mrp, 
        price: price, 
        listedPrice: finalListedPrice, 
        desc: document.getElementById("itemDesc").value, 
        isVisible: makeVisible, 
        timestamp: new Date().toISOString() 
    };
    
    if (uploadedImagesArray.length > 0) { 
        data.images = uploadedImagesArray; 
        data.image = uploadedImagesArray[0]; 
    }
    
    document.getElementById("saveProductBtn").innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        if(id) {
            await db.collection("products").doc(id).update(data);
        } else {
            await db.collection("products").add(data);
        }
        
        closeModal("itemModal"); 
        try { await initDashboard(); } catch(e) {} 
        showToast(makeVisible ? "Product Saved & Live on Panel!" : "Saved securely, but Hidden (Due to Offline Mode).", "success"); 
    } catch(e) { 
        showToast("Database Error: " + e.message, "error"); 
    }
    
    document.getElementById("saveProductBtn").innerHTML = '<i class="fas fa-save"></i> Save Product';
}

window.deleteItem = async function(id) { 
    if(confirm("Delete this product permanently?")) { 
        await db.collection("products").doc(id).delete(); 
        try{await initDashboard();}catch(e){} 
        showToast("Deleted", "success"); 
    } 
}

// ================= ORDERS LOGIC WITH IMAGES =================
function getProductImageHtml(itemName) {
    let p = sellerProducts.find(p => p.name === itemName);
    if (!p) return '';
    let imgs = p.images && p.images.length > 0 ? p.images : (p.image ? [p.image] : []);
    let imgHtml = imgs.map(img => `<img src="${img}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; vertical-align:middle; margin-right:5px; border:1px solid #e2e8f0;">`).join('');
    return imgHtml;
}

function loadNewOrders() {
    const list = document.getElementById("newOrdersList"); list.innerHTML = ""; document.getElementById("selectAllNew").checked = false;
    const pending = sellerOrders.filter(o => o.status === 'Placed' || o.status === 'New' || o.status === 'Pending' || o.status === 'Confirmed');
    
    if(pending.length === 0) { list.innerHTML = "<tr><td colspan='7' style='text-align:center; font-weight:600;'>No pending orders! 🎉</td></tr>"; return; }

    const now = Date.now();
    pending.forEach(o => {
        let myItems = getSellerItemsFromOrder(o); if(myItems.length === 0) return;
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span><br><span style="color:var(--text-light); font-size:12px;">Qty: <span style="color:var(--primary); font-weight:800;">${i.qty}</span></span></div></div>`).join('');
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0); 
        
        const orderTime = o.timestamp ? new Date(o.timestamp).getTime() : now; const diffHours = (now - orderTime) / 3600000;
        let isBreached = diffHours > 48;
        let slaText = isBreached ? `<span style="color:white; background:var(--danger); padding:4px 8px; border-radius:8px; font-weight:bold; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> BREACHED SLA!</span>` : `<span style="color:var(--success); font-weight:800; font-size:13px;">${Math.round(48 - diffHours)}h left</span>`;

        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')">
            <td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-new" value="${o.id}" onclick="event.stopPropagation()"></td>
            <td data-label="Order Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td>
            <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td>
            <td data-label="Item Details" style="font-size:13px;">${itemsHtml}</td>
            <td data-label="Amount" style="color:var(--text-main); font-weight:800; font-size:16px;">₹${amount}</td>
            <td data-label="SLA Status">${slaText}</td>
            <td data-label="Action"><div><button class="btn-sm" style="background:var(--success); padding:10px 15px;" onclick="event.stopPropagation(); acceptOrder('${o.id}', ${isBreached})"><i class="fas fa-check"></i> Accept</button><button class="btn-sm" style="background:var(--danger); padding:10px 15px;" onclick="event.stopPropagation(); cancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancel</button></div></td>
        </tr>`;
    });
}

window.toggleSelectAllNew = function(source) { document.querySelectorAll('.cb-new').forEach(cb => cb.checked = source.checked); }

window.bulkAcceptNewOrders = async function() {
    const checkboxes = document.querySelectorAll('.cb-new:checked'); if(checkboxes.length === 0) return showToast("Select at least one order.", "warning");
    let orderIds = []; 
    const batch = db.batch();
    
    checkboxes.forEach(cb => { 
        orderIds.push(cb.value); 
        const o = sellerOrders.find(x => x.id === cb.value); if(o) o.status = 'Accepted'; 
        batch.update(db.collection("orders").doc(cb.value), {status: 'Accepted'});
    });
    
    renderDashboardStats(); loadNewOrders(); loadAcceptedOrders(); showToast(`Accepting ${orderIds.length} orders...`, "info");
    try { await batch.commit(); showToast("Bulk Accept Complete!", "success"); } catch(e) { showToast("Failed to bulk accept.", "error"); }
}

window.acceptOrder = async function(id, isBreached) {
    const o = sellerOrders.find(x => x.id === id); if(o) o.status = 'Accepted'; renderDashboardStats(); loadNewOrders(); loadAcceptedOrders();
    if(isBreached) { 
        showToast("Order Accepted. ₹20 SLA Fine applied.", "warning"); 
        try { await db.collection("fines").add({ email: currentSeller.email, amount: 20, reason: `Late Acceptance SLA Breach: Order ${id}`, timestamp: new Date().toISOString() }); } catch(e){} 
    } else { showToast("Order Accepted!", "success"); }
    try { await db.collection("orders").doc(id).update({status: 'Accepted'}); } catch(e) {}
}

window.cancelOrder = async function(id) {
    if(currentSeller.status === 'Blocked' || currentSeller.status === 'Suspended') return showToast("Account restricted. Cannot modify orders.", "error");
    if(!confirm("Warning! Canceling this order applies a ₹60 Shipping Fine. Proceed?")) return;
    
    const o = sellerOrders.find(x => x.id === id); 
    if(o) o.status = 'Cancelled'; 
    renderDashboardStats(); loadNewOrders(); loadReturns();
    
    try {
        await db.collection("fines").add({ email: currentSeller.email, amount: 60, reason: `Seller Cancelled Order ${id}`, timestamp: new Date().toISOString() });
        await db.collection("orders").doc(id).update({status: 'Cancelled'});
        showToast("Order Cancelled. ₹60 fine applied.", "warning");
    } catch(e) {
        showToast("Network error. Could not cancel order.", "error");
    }
}

// ================= ACCEPTED ORDERS =================
window.toggleSelectAllAcc = function(source) { document.querySelectorAll('.cb-acc').forEach(cb => cb.checked = source.checked); }

function loadAcceptedOrders() {
    const list = document.getElementById("acceptedOrdersList"); list.innerHTML = ""; document.getElementById("selectAllAcc").checked = false;
    const accepted = sellerOrders.filter(o => o.status === 'Accepted');
    if(accepted.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No orders to dispatch.</td></tr>"; return; }

    accepted.forEach(o => {
        let myItems = getSellerItemsFromOrder(o); if(myItems.length === 0) return;
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span><br><span style="color:var(--text-light); font-size:12px;">Qty: <span style="color:var(--primary); font-weight:800;">${i.qty}</span></span></div></div>`).join('');
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')">
            <td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-acc" value="${o.id}" onclick="event.stopPropagation()"></td>
            <td data-label="Order Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td>
            <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--secondary); font-size:14px;">${o.order_no || o.id}</strong></td>
            <td data-label="Item Details" style="font-size:13px;">${itemsHtml}</td>
            <td data-label="Action">
                <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                    <button class="btn-print" onclick="event.stopPropagation(); processSlips('print', '${o.id}')"><i class="fas fa-print"></i> Print</button>
                    <button class="btn-pdf" onclick="event.stopPropagation(); processSlips('download', '${o.id}')"><i class="fas fa-file-pdf"></i> Download PDF</button>
                </div>
            </td>
        </tr>`;
    });
}

// ================= PRINTING & PDF DOWNLOAD (FULLY RESTORED & FIXED) =================
window.processSlips = async function(mode, singleId = null) {
    let selectedIds = []; if(singleId) { selectedIds.push(singleId); } else { document.querySelectorAll('.cb-acc:checked').forEach(cb => selectedIds.push(cb.value)); }
    if(selectedIds.length === 0) return showToast("Select at least one order.", "warning");

    const printArea = document.getElementById("printArea"); let printHtml = '';

    for(let id of selectedIds) {
        const o = sellerOrders.find(x => x.id === id); if(!o) continue;
        let myItems = getSellerItemsFromOrder(o); let itemsHtml = myItems.map(i=>`<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding:10px 0;"><span style="font-weight:600; font-size:14px;">${i.name} (x${i.qty})</span><span style="font-weight:800; font-size:14px;">₹${i.price}</span></div>`).join('');
        
        let warrStr = "N/A"; const p = sellerProducts.find(x => x.name === myItems[0].name);
        if(p && p.warranty && p.warranty !== "No Warranty") warrStr = `Valid for ${p.warranty} from delivery date. Keep invoice safe.`;
        
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(o.order_no || o.id)}`;

        let realName = o.delivery_name || "Customer";
        let realSellerName = currentSeller.companyName || currentSeller.email || "Seller";
        
        // STRICT PRIVACY: Masks email and phone EVEN on the print invoice as requested
        let safeEmail = maskEmail(o.user_email);
        let safePhone = maskPhone(o.delivery_phone);

        let paymentStatusUI = o.payment_method && o.payment_method.toLowerCase().includes('cash') 
            ? `<span style="color:var(--danger); font-weight:800; border: 2px dashed var(--danger); padding: 4px 8px;">CASH ON DELIVERY (COLLECT)</span>`
            : `<span style="color:var(--success); font-weight:800; border: 2px solid var(--success); padding: 4px 8px;">PRE-PAID (ONLINE)</span>`;

        printHtml += `
        <div class="print-page" style="background:white; color:black;">
            <div style="border: 2px solid #0f172a; padding:30px; border-radius:16px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: white;">
                <div style="display:flex; justify-content:space-between; border-bottom:4px solid #0f172a; padding-bottom:20px; margin-bottom:20px;">
                    <div><h1 style="margin:0; font-size:28px; color:#0f172a; font-weight:900; letter-spacing:-1px;">ARYANTA</h1><p style="margin:5px 0 0 0; font-size:14px; color:#475569; font-weight:600;">support@aryanta.com | Ph: 06414054676</p></div>
                    <div style="text-align:right;"><strong style="font-size:20px; color:#059669;">Tax Invoice & Dispatch Slip</strong></div>
                </div>
                
                <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e2e8f0; padding-bottom:25px; margin-bottom:25px;">
                    <div style="width:55%; border:1px solid #cbd5e1; padding:15px; border-radius:12px; background:#f8fafc;">
                        <strong style="font-size:16px; color:#0f172a;">SHIP TO:</strong><br>
                        <strong style="font-size:18px; margin-top:5px; display:block;">${realName}</strong>
                        <div style="font-size:14px; margin-top:5px; line-height:1.6; color:#1e293b;">
                            Phone: <strong>${safePhone}</strong><br>
                            Email: <strong>${safeEmail}</strong><br>
                            Address: ${o.delivery_address || "N/A"}<br>${o.delivery_city || ""}, ${o.delivery_state || ""} - <strong>${o.delivery_pincode || ""}</strong><br>
                        </div>
                    </div>
                    <div style="width:40%; text-align:right; display:flex; flex-direction:column; align-items:flex-end; justify-content:center;">
                        <img src="${qrUrl}" crossorigin="anonymous" style="width:120px; height:120px; border:2px solid #cbd5e1; padding:5px; border-radius:12px;"><br>
                        <strong style="font-size:14px; margin-top:10px;">Order ID: ${o.order_no || o.id}</strong>
                    </div>
                </div>
                
                <div style="margin-bottom:25px; font-size:14px; border:1px solid #cbd5e1; padding:15px; border-radius:12px; background:#f8fafc; line-height:1.6; display: flex; justify-content: space-between;">
                    <div><strong style="font-size:16px;">SELLER DETAILS:</strong><br><span style="font-weight:700;">${realSellerName}</span><br>${currentSeller.shopInfo?.address || 'N/A'}<br>City: ${currentSeller.shopInfo?.city || ''}</div>
                    <div style="text-align:right;"><strong style="font-size:16px;">PAYMENT MODE:</strong><br>${paymentStatusUI}</div>
                </div>
                
                <div style="border:2px solid #0f172a; padding:20px; margin-bottom:25px; border-radius:12px;">
                    <h4 style="margin:0 0 15px 0; border-bottom:2px solid #0f172a; padding-bottom:10px; font-size:18px;">ITEMS ORDERED</h4>
                    ${itemsHtml}
                    <div style="text-align:right; margin-top:15px; font-size:20px; color:#0f172a;"><strong>SELLER PAYOUT: ₹${myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0)}</strong></div>
                </div>
                
                <div style="border:2px dashed #059669; padding:15px; background:#ecfdf5; font-size:14px; border-radius:12px; color:#064e3b;">
                    <strong>WARRANTY STATUS:</strong><br>${warrStr}
                </div>
            </div>
        </div>`;
        
        try { db.collection("orders").doc(id).update({ printed: true }); } catch(e) {}
    }

    printArea.innerHTML = printHtml; 

    if(mode === 'download') {
        const loader = document.getElementById("pageLoader");
        document.getElementById("loaderMessage").innerText = "Generating PDFs...";
        loader.style.display = "flex"; loader.style.opacity = "1";

        const images = printArea.getElementsByTagName('img');
        let loadedImages = 0; let totalImages = images.length;

        const triggerPDFGeneration = () => {
            var opt = { margin: [10, 10], filename: `Aryanta_Invoice_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true, allowTaint: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
            printArea.style.display = 'block';
            printArea.style.position = 'absolute';
            printArea.style.left = '-9999px';
            html2pdf().set(opt).from(printArea).save().then(() => {
                printArea.style.display = 'none'; printArea.style.position = 'static'; printArea.style.left = '0';
                loader.style.opacity = "0"; 
                setTimeout(() => { loader.style.display = "none"; document.getElementById("loaderMessage").innerText = "SYNCING LIVE DB..."; }, 300);
                showToast("PDF Downloaded!", "success");
            }).catch(e => {
                printArea.style.display = 'none'; printArea.style.position = 'static'; loader.style.display = "none"; showToast("Failed to generate PDF", "error");
            });
        };

        if (totalImages === 0) triggerPDFGeneration();
        else {
            for (let i = 0; i < totalImages; i++) {
                if (images[i].complete) { loadedImages++; if (loadedImages === totalImages) triggerPDFGeneration(); } 
                else { 
                    images[i].onload = () => { loadedImages++; if (loadedImages === totalImages) triggerPDFGeneration(); }; 
                    images[i].onerror = () => { loadedImages++; if (loadedImages === totalImages) triggerPDFGeneration(); }; 
                }
            }
        }
    } else { 
        showToast("Opening Print Dialog...", "info"); 
        
        const loader = document.getElementById("pageLoader");
        document.getElementById("loaderMessage").innerText = "Preparing Print...";
        loader.style.display = "flex"; loader.style.opacity = "1";
        
        const images = printArea.getElementsByTagName('img');
        let loadedImages = 0; let totalImages = images.length;
        
        const triggerPrint = () => {
            loader.style.opacity = "0"; 
            setTimeout(() => { loader.style.display = "none"; document.getElementById("loaderMessage").innerText = "SYNCING LIVE DB..."; }, 300);
            setTimeout(() => { window.print(); }, 500); 
        };
        
        if (totalImages === 0) triggerPrint();
        else {
            for (let i = 0; i < totalImages; i++) {
                if (images[i].complete) { loadedImages++; if (loadedImages === totalImages) triggerPrint(); } 
                else { 
                    images[i].onload = () => { loadedImages++; if (loadedImages === totalImages) triggerPrint(); }; 
                    images[i].onerror = () => { loadedImages++; if (loadedImages === totalImages) triggerPrint(); }; 
                }
            }
        }
    }
}

// ================= GLOBAL SCAN TO SHIP CAMERA =================
let scanStep = 1; let isProcessingScan = false;

window.openGlobalScanModal = async function() {
    scanStep = 1; isProcessingScan = false; document.getElementById("scanOrderId").value = ""; document.getElementById("skipScanBtn").style.display = "none";
    document.getElementById("qr-reader").innerHTML = ""; document.getElementById("qr-reader").style.display = "none"; document.getElementById("scannerPlaceholder").style.display = "flex";
    document.getElementById("scanStatus").innerHTML = "Awaiting Pre-fetch check..."; document.getElementById("scanStatus").style.color = "var(--primary)"; document.getElementById("scanModal").style.display = "flex";

    try { const snap = await db.collection("orders").orderBy("timestamp", "desc").limit(500).get(); sellerOrders = snap.docs.map(d=>({id:d.id, ...d.data()})); } catch(e) {}

    setTimeout(() => {
        document.getElementById("scannerPlaceholder").style.display = "none"; document.getElementById("qr-reader").style.display = "block"; document.getElementById("scanStatus").innerHTML = "Awaiting Invoice QR Scan...";
        if(!html5QrcodeScanner) { html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 15, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 }, false); }
        try { html5QrcodeScanner.render(onScanSuccess, onScanFailure); } catch(e) {}
    }, 500);
}

async function onScanSuccess(decodedText, decodedResult) {
    if(isProcessingScan) return; isProcessingScan = true;

    const oId = document.getElementById("scanOrderId").value; const scannedId = decodedText.trim();
    if (scanStep === 1) {
        const order = sellerOrders.find(o => scannedId.includes(o.id) || (o.order_no && scannedId.includes(o.order_no)));
        if (order) {
            if(order.status === 'Accepted') {
                document.getElementById("scanOrderId").value = order.id; scanStep = 2; 
                document.getElementById("skipScanBtn").style.display = "block"; 
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-check-circle"></i> Invoice Verified! Now Scan Shipping Label QR...`; document.getElementById("scanStatus").style.color = "var(--warning)";
                try { html5QrcodeScanner.pause(true); setTimeout(() => html5QrcodeScanner.resume(), 1500); } catch(e){}
            } else {
                showToast(`Order status is '${order.status}'. Needs to be 'Accepted'.`, "warning");
                try { html5QrcodeScanner.pause(true); setTimeout(() => html5QrcodeScanner.resume(), 2000); } catch(e){}
            }
        } else { showToast("Invalid QR or Order not found.", "error"); try { html5QrcodeScanner.pause(true); setTimeout(() => html5QrcodeScanner.resume(), 2000); } catch(e){} }
    } 
    else if (scanStep === 2) {
        document.getElementById("scanStatus").innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking DB for Shipping Label...`; document.getElementById("scanStatus").style.color = "var(--primary)";
        try {
            try { html5QrcodeScanner.pause(true); } catch(e){}
            
            const trackingSnap = await db.collection("orders").where("tracking_no", "==", scannedId).get();
            
            if (trackingSnap.empty) {
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-truck"></i> Verified! Dispatching...`; document.getElementById("scanStatus").style.color = "var(--success)";
                try{ html5QrcodeScanner.clear(); } catch(e){} setTimeout(() => executeDispatch(oId, scannedId), 1000);
            } else {
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-exclamation-triangle"></i> This label is already linked! Skip or scan a fresh label.`; document.getElementById("scanStatus").style.color = "var(--warning)"; document.getElementById("skipScanBtn").style.display = "block";
                try { setTimeout(() => html5QrcodeScanner.resume(), 2500); } catch(e){}
            }
        } catch(e) { document.getElementById("scanStatus").innerText = "Network Error."; try { setTimeout(() => html5QrcodeScanner.resume(), 2000); } catch(e){} }
    }
    setTimeout(() => { isProcessingScan = false; }, 2000);
}
function onScanFailure(error) {}

window.skipAndShip = async function() {
    const id = document.getElementById("scanOrderId").value; if(!id) return showToast("You must scan an Invoice first.", "warning");
    if(!confirm("Skip Scanning the shipping label? A fine of ₹7 will be deducted from your payout.")) return;
    try {
        await db.collection("fines").add({ email: currentSeller.email, amount: 7, reason: `Skipped label scan for Order ${id}`, timestamp: new Date().toISOString() });
        try{ html5QrcodeScanner.clear(); } catch(e){} executeDispatch(id, "SKIPPED_SCAN"); showToast("Shipped (₹7 Fine Applied)", "warning");
    } catch(e) {}
}

async function executeDispatch(id, trackingNo = "") {
    try { 
        await db.collection("orders").doc(id).update({status: 'Shipped', tracking_no: trackingNo, shipped_date: new Date().toISOString()});
        closeModal("scanModal"); showToast("Order officially Dispatched!", "success"); try{await initDashboard();}catch(e){} loadAcceptedOrders(); renderDashboardStats(); 
    } catch(e) {}
}

// ================= SHIPPED, DELIVERED, HISTORY & RETURNS =================
function loadShippedOrders() {
    const list = document.getElementById("shippedOrdersList"); list.innerHTML = "";
    const shipped = sellerOrders.filter(o => o.status === 'Shipped' || o.status === 'Near by warehouse');
    if(shipped.length === 0) { list.innerHTML = "<tr><td colspan='4' style='text-align:center; font-weight:600;'>No orders in transit.</td></tr>"; return; }
    shipped.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); 
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Shipped Date"><strong style="font-size:13px;">${new Date(o.shipped_date || o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;">${o.status}</span></td></tr>`; 
    });
}

function loadDeliveredOrders() {
    const list = document.getElementById("deliveredOrdersList"); list.innerHTML = "";
    const delivered = sellerOrders.filter(o => o.status === 'Delivered');
    if(delivered.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No delivered orders yet.</td></tr>"; return; }
    delivered.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); if(myItems.length===0) return; 
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0); 
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Delivered"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Amount"><strong style="font-size:15px; color:var(--success);">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;"><i class="fas fa-check-circle"></i> ${o.status}</span></td></tr>`; 
    });
}

function loadOrderHistory() {
    const list = document.getElementById("historyList"); list.innerHTML = "";
    if(sellerOrders.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No orders yet.</td></tr>"; return; }
    sellerOrders.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); if(myItems.length===0) return; 
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0); 
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items"><span style="font-weight:600;">${myItems.map(i=>i.name).join(', ')}</span></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:var(--surface-2); color:var(--text-light);">${o.status}</span></td></tr>`; 
    });
}

function loadReturns() {
    const list = document.getElementById("returnsList"); list.innerHTML = "";
    const returns = sellerOrders.filter(o => o.status.includes('Return') || o.status === 'Cancelled');
    if(returns.length === 0) { list.innerHTML = "<tr><td colspan='4' style='text-align:center; font-weight:600;'>No returns recorded.</td></tr>"; return; }
    returns.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); if(myItems.length===0) return; 
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Reason"><span style="color:var(--danger); font-weight:800; font-size:13px;">Customer / Auto Cancel</span></td></tr>`; 
    });
}

window.exportHistoryCSV = function() {
    if(sellerOrders.length === 0) return showToast("No orders to export", "warning");
    let csvContent = "data:text/csv;charset=utf-8,Date,Order ID,Items,Amount,Status,Payment Method\n";
    
    sellerOrders.forEach(o => {
        let myItems = getSellerItemsFromOrder(o);
        if(myItems.length === 0) return;
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0);
        let itemsStr = myItems.map(i => `${i.name} (x${i.qty})`).join('; ');
        let date = new Date(o.timestamp).toLocaleDateString();
        csvContent += `"${date}","${o.order_no || o.id}","${itemsStr}","${amount}","${o.status}","${o.payment_method || 'N/A'}"\n`;
    });

    var encodedUri = encodeURI(csvContent); var link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "Aryanta_Order_History.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

window.viewOrderDetails = function(id) {
    const o = sellerOrders.find(x => x.id === id); if(!o) return;
    let myItems = getSellerItemsFromOrder(o);
    let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0);
    
    let safeName = maskName(o.delivery_name); let emailDisplay = maskEmail(o.user_email); let phoneDisplay = maskPhone(o.delivery_phone);
    let privacyTag = `<br><span style="font-size:10px; color:var(--danger); font-weight:800; text-transform:uppercase;">*Contact Masked for Customer Privacy*</span>`;

    let payType = o.payment_method && o.payment_method.toLowerCase().includes('cash') 
        ? `<strong style="color:var(--danger);">CASH ON DELIVERY</strong>` 
        : `<strong style="color:var(--success);">PRE-PAID (ONLINE)</strong>`;

    document.getElementById("orderDetailsContent").innerHTML = `
        <div style="background:var(--surface-2); padding:20px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:800; font-size:16px; color:var(--primary); font-family:monospace;">${o.order_no || o.id}</span><span class="badge" style="background:#e0e7ff; color:#3b82f6; font-size:13px;">${o.status}</span>
            </div>
            <strong style="font-size:14px; color:var(--text-main);">Customer Details:</strong><br>
            <span style="font-size:15px; font-weight:700; color:var(--text-main);">${safeName}</span><br><span style="color:var(--text-main);"><i class="fas fa-phone-alt"></i> ${phoneDisplay}<br><i class="fas fa-envelope"></i> ${emailDisplay}</span>
            ${privacyTag}<br><br><strong style="font-size:14px; color:var(--text-main);">Shipping Address:</strong><br>
            <span style="color:var(--text-main);">${o.delivery_address || 'N/A'}<br>${o.delivery_city || ''}, ${o.delivery_state || ''} - <strong style="color:var(--primary);">${o.delivery_pincode || ''}</strong></span>
        </div>
        <div style="background:#ecfdf5; padding:20px; border-radius:12px; border:1px solid #a7f3d0;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #a7f3d0; padding-bottom:5px;">
                <strong style="font-size:14px; color:#064e3b;">Items in this order:</strong>
                <span style="font-size:12px; color:#064e3b;">Payment: ${payType}</span>
            </div>
            ${myItems.map(i=>`<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:600; font-size:14px; color:#064e3b;">${i.name} (x${i.qty})</span><strong style="font-size:14px; color:#064e3b;">₹${i.price}</strong></div>`).join('')}
            <div style="border-top:2px solid #a7f3d0; margin-top:10px; padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; font-size:16px; color:#064e3b;">Total Seller Payout:</span><strong style="color:var(--primary); font-size:20px;">₹${amount}</strong>
            </div>
        </div>
    `;
    document.getElementById("orderDetailsModal").style.display = "flex";
}

// ================= WARRANTY CLAIMS =================
function loadWarranty() {
    const list = document.getElementById("warrantyList"); list.innerHTML = "";
    const pendingWarranties = sellerWarranties.filter(w => w.status === 'Assigned to Seller' || w.status === 'Pending Action');
    if(pendingWarranties.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No pending warranty requests.</td></tr>"; return; }

    const now = Date.now();
    pendingWarranties.forEach(w => {
        const claimTime = w.assignedDate ? new Date(w.assignedDate).getTime() : new Date(w.timestamp).getTime();
        const diffHours = (now - claimTime) / 3600000;
        let isBreached = diffHours > 48;

        if(isBreached && !w.slaBreachFined) {
            showToast(`SLA Breached for Claim ${w.id.substring(0,6)}. ₹199 Fine Applied.`, "error");
            try { db.collection("fines").add({ email: currentSeller.email, amount: 199, reason: `Late Warranty Claim SLA Breach: ${w.id}`, timestamp: new Date().toISOString() }); } catch(e){}
            w.slaBreachFined = true; 
        }

        let slaText = isBreached ? `<span style="color:var(--white); background:var(--danger); padding:4px 8px; border-radius:8px; font-weight:bold; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> FINE APPLIED</span>` : `<span style="color:var(--warning); font-weight:800; font-size:13px;">${Math.round(48 - diffHours)}h left</span>`;

        list.innerHTML += `<tr>
            <td data-label="Date"><strong style="font-size:13px;">${new Date(w.timestamp).toLocaleDateString()}</strong></td>
            <td data-label="Product & Serial"><strong style="font-size:14px;">${w.productName}</strong><br><span style="font-family:monospace; color:var(--text-light);">SN: ${w.serialNo}</span></td>
            <td data-label="Issue"><span style="font-size:13px;">${w.issueDesc}</span></td>
            <td data-label="SLA">${slaText}</td>
            <td data-label="Action">
                <div>
                    <button class="btn-sm" style="background:var(--success); padding:10px 15px; margin-bottom:5px;" onclick="acceptWarranty('${w.id}')"><i class="fas fa-check"></i> Accept</button>
                    <button class="btn-sm" style="background:var(--danger); padding:10px 15px;" onclick="cancelWarranty('${w.id}')"><i class="fas fa-times"></i> Reject</button>
                </div>
            </td>
        </tr>`;
    });
}

window.acceptWarranty = async function(id) {
    if(!confirm("Accepting this warranty means you will provide a replacement or refund to the customer. Confirm?")) return;
    try {
        await db.collection("warranties").doc(id).update({ status: 'Accepted' });
        const w = sellerWarranties.find(x => x.id === id); if(w) w.status = "In Progress";
        showToast("Warranty Request Accepted! Arrange resolution with Admin.", "success");
        loadWarranty(); renderDashboardStats();
    } catch(e) {}
}

window.cancelWarranty = async function(id) {
    if(!confirm("Warning! Rejecting this valid claim will deduct a flat ₹300 fine from your payout. Continue?")) return;
    try {
        await db.collection("fines").add({ email: currentSeller.email, amount: 300, reason: `Rejected Warranty Claim: ${id}`, timestamp: new Date().toISOString() });
        await db.collection("warranties").doc(id).update({ status: 'Rejected' });
        
        const w = sellerWarranties.find(x => x.id === id); if(w) w.status = "Rejected";
        showToast("Claim Rejected. ₹300 Fine Applied.", "error");
        loadWarranty(); renderDashboardStats();
    } catch(e) {}
}

// ================= PAYMENTS LEDGER & ADMIN SYNC =================
window.togglePaymentTab = function(tabId) {
    document.querySelectorAll('.payment-tab').forEach(t => t.style.display = 'none');
    document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).style.display = 'block';
}

function loadPayments() {
    const listUpcoming = document.getElementById("payUpcomingList"); listUpcoming.innerHTML = "";
    const listProgress = document.getElementById("payProgressList"); listProgress.innerHTML = "";
    const listCompleted = document.getElementById("payCompletedList"); listCompleted.innerHTML = "";
    const listFines = document.getElementById("payFinesList"); listFines.innerHTML = "";

    let totalUpcoming = 0; let totalFines = sellerFines.reduce((s, f) => s + f.amount, 0);
    const now = new Date();

    sellerOrders.forEach(o => {
        let myItems = getSellerItemsFromOrder(o); if(myItems.length === 0) return;
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0);

        if (o.status === 'Delivered' && !o.sellerSettled) {
            let deliveredDate = new Date(o.timestamp);
            let transferDate = new Date(deliveredDate); transferDate.setDate(transferDate.getDate() + 7);
            
            if(now < transferDate) {
                listProgress.innerHTML += `<tr><td data-label="Delivered Date"><strong style="font-size:13px;">${deliveredDate.toLocaleDateString()}</strong></td><td data-label="Release Date"><span style="color:var(--warning); font-weight:bold;">${transferDate.toLocaleDateString()}</span></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary);">${o.order_no || o.id}</strong></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td></tr>`;
            } else {
                totalUpcoming += amount; 
                let statusMsg = o.adminClearedPayment ? `<span style="color:var(--success); font-weight:bold;"><i class="fas fa-check-circle"></i> Successfully Credited</span>` : `<span style="color:var(--secondary); font-weight:bold;"><i class="fas fa-clock"></i> Processing by Bank</span>`;
                listUpcoming.innerHTML += `<tr><td data-label="Transfer Date"><strong style="font-size:13px;">${transferDate.toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary);">${o.order_no || o.id}</strong></td><td data-label="Status">${statusMsg}</td><td data-label="Gross Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${amount}</td></tr>`;
            }
        } else if (o.sellerSettled) {
            listCompleted.innerHTML += `<tr><td data-label="Settled Date"><strong style="font-size:13px;">${new Date(o.settledDate).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary);">${o.order_no || o.id}</strong></td><td data-label="Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${o.settlementAmount}</td></tr>`;
        }
    });

    sellerFines.forEach(f => { listFines.innerHTML += `<tr><td data-label="Date"><strong style="font-size:13px;">${new Date(f.timestamp).toLocaleDateString()}</strong></td><td data-label="Reason"><span style="font-weight:600;">${f.reason}</span></td><td data-label="Amount" style="color:var(--danger); font-weight:900; font-size:16px;">-₹${f.amount}</td></tr>`; });

    let finalUpcoming = totalUpcoming - totalFines; 
    cachedTotalUpcoming = finalUpcoming; 
    
    const alertBox = document.getElementById("upcomingAlertBox");
    if(totalUpcoming > 0 || totalFines > 0) {
        alertBox.style.display = "block";
        alertBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Gross Payout Pool:</span> <strong>₹${totalUpcoming.toLocaleString()}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:var(--danger);"><span>Total Deductions (Fines):</span> <strong>-₹${totalFines.toLocaleString()}</strong></div>
        <div style="border-top:2px solid #bfdbfe; margin-top:10px; padding-top:10px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:800; font-size:16px; color:#1e3a8a;">Final Expected Net Transfer:</span><strong style="color:var(--primary); font-size:22px;">₹${finalUpcoming.toLocaleString()}</strong></div>`;
        syncPayoutToAdmin(totalUpcoming, totalFines, finalUpcoming);
    } else { alertBox.style.display = "none"; }
    
    validatePayoutButtons();
}

async function syncPayoutToAdmin(totalGross, totalFines, finalUpcoming) {
    try {
        await db.collection("seller_payouts").doc(currentSeller.email).set({
            name: currentSeller.companyName, gross: totalGross, fines: totalFines, netPayout: finalUpcoming, date: new Date().toISOString(), status: "Pending"
        });
    } catch(e) {} 
}

// ================= PREMIUM SUBSCRIPTIONS LOGIC WITH RAZORPAY =================
window.togglePlanDuration = function(type) {
    currentPlanDuration = type;
    const btnM = document.getElementById('btnPlanMonth'); const btnY = document.getElementById('btnPlanYear');
    if(type === 'year') {
        btnY.style.background = 'var(--primary)'; btnY.style.color = 'white';
        btnM.style.background = 'transparent'; btnM.style.color = 'var(--text-light)';
        document.getElementById('priceGo').innerText = '4999';
        document.getElementById('pricePro').innerText = '7599';
        document.querySelectorAll('.txtDuration').forEach(el => el.innerText = 'year');
    } else {
        btnM.style.background = 'var(--primary)'; btnM.style.color = 'white';
        btnY.style.background = 'transparent'; btnY.style.color = 'var(--text-light)';
        document.getElementById('priceGo').innerText = '499';
        document.getElementById('pricePro').innerText = '799';
        document.querySelectorAll('.txtDuration').forEach(el => el.innerText = 'month');
    }
    validatePayoutButtons();
}

function validatePayoutButtons() {
    const costGo = currentPlanDuration === 'year' ? 4999 : 499;
    const costPro = currentPlanDuration === 'year' ? 7599 : 799;
    
    const btnGo = document.getElementById('btnSubPayoutGo');
    const btnPro = document.getElementById('btnSubPayoutPro');
    const btnAd = document.getElementById('btnAdPayout');
    const btnB2b = document.getElementById('b2bPayoutBtn');
    
    if(btnGo) { if(cachedTotalUpcoming >= costGo) { btnGo.disabled = false; btnGo.innerHTML = '<i class="fas fa-wallet"></i> Pay from Payout'; } else { btnGo.disabled = true; btnGo.innerHTML = '<i class="fas fa-exclamation-circle"></i> Insufficient Payout'; } }
    if(btnPro) { if(cachedTotalUpcoming >= costPro) { btnPro.disabled = false; btnPro.innerHTML = '<i class="fas fa-wallet"></i> Pay from Payout'; } else { btnPro.disabled = true; btnPro.innerHTML = '<i class="fas fa-exclamation-circle"></i> Insufficient Payout'; } }
    if(btnAd) { if(cachedTotalUpcoming >= 70) { btnAd.disabled = false; btnAd.innerHTML = '<i class="fas fa-wallet"></i> Pay via Upcoming Payout'; } else { btnAd.disabled = true; btnAd.innerHTML = '<i class="fas fa-exclamation-circle"></i> Insufficient Payout'; } }
}

function loadSubscriptionsUI() {
    validatePayoutButtons();
    if(currentSeller.subscription && currentSeller.subscription !== 'None') {
        showToast(`You are currently on the ${currentSeller.subscription} Plan.`, 'success');
    }
}

window.processSubscription = async function(planName, method) {
    const cost = planName === 'Go' ? (currentPlanDuration === 'year' ? 4999 : 499) : (currentPlanDuration === 'year' ? 7599 : 799);
    
    if(method === 'online') {
        const options = {
            "key": API_KEYS.RAZORPAY, 
            "amount": cost * 100, 
            "currency": "INR", 
            "name": "Aryanta Seller Network",
            "description": `${planName} Subscription (${currentPlanDuration})`,
            "handler": function (res) { finalizeSubscription(planName, cost, "Online Razorpay", res.razorpay_payment_id); },
            "prefill": { "name": currentSeller.companyName, "email": currentSeller.email, "contact": currentSeller.phone || "" },
            "theme": { "color": "#059669" }
        };
        const rzp = new Razorpay(options); 
        rzp.open();
    } else {
        if(cachedTotalUpcoming < cost) return showToast("Insufficient funds in upcoming payout.", "error");
        if(!confirm(`Deduct ₹${cost.toLocaleString()} from your upcoming payout for the ${planName} plan?`)) return;
        try { 
            await db.collection("fines").add({ email: currentSeller.email, amount: cost, reason: `${planName} Subscription (${currentPlanDuration})`, timestamp: new Date().toISOString() }); 
            finalizeSubscription(planName, cost, "Payout Deduction", "PAYOUT_" + Date.now()); 
            try{await initDashboard();}catch(e){} loadPayments(); 
        } catch(e) {} 
    }
}

async function finalizeSubscription(planName, cost, method, txId) {
    const now = new Date();
    const endDate = new Date();
    if(currentPlanDuration === 'year') endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    currentSeller.subscription = planName;
    currentSeller.subEndDate = endDate.toISOString();
    
    if(!currentSeller.subHistory) currentSeller.subHistory = [];
    currentSeller.subHistory.push({
        plan: planName, duration: currentPlanDuration, cost: cost, method: method, txId: txId, 
        startDate: now.toISOString(), endDate: endDate.toISOString()
    });

    localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
    document.getElementById('verifiedBadge').style.display = 'inline'; 
    
    try { 
        await db.collection("sellers").doc(currentSeller.email).update({ subscription: planName, subEndDate: currentSeller.subEndDate, subHistory: currentSeller.subHistory }); 
        showToast(`Successfully Upgraded to ${planName} Plan!`, "success"); 
        applySettingsToUI(); 
        loadProfile(); 
        document.getElementById('subExpiryModal').style.display = 'none'; 
    } catch(e) {}
}


// ================= SPONSORED ADS WITH DISCOUNT =================
function calculateAdCost() {
    let cost = 70;
    if (currentSeller.subscription === 'Go') cost = Math.round(70 * 0.8);  // 20% off
    if (currentSeller.subscription === 'Pro') cost = Math.round(70 * 0.55); // 45% off
    return cost;
}

function loadAds() {
    const list = document.getElementById("adsList"); list.innerHTML = "";
    sellerProducts.forEach(p => {
        let adStatus = p.isAd ? `<span class="badge" style="background:#fef08a; color:#854d0e;">Running</span>` : `<span class="badge" style="background:var(--border-color); color:var(--text-light);">Inactive</span>`;
        let btn = p.isAd ? `<button class="btn-sm delete" style="padding:10px 15px;" onclick="stopAd('${p.id}')"><i class="fas fa-stop"></i> Stop Ad</button>` : `<button class="btn-sm edit" style="background:var(--primary); padding:10px 15px;" onclick="promptAd('${p.id}')"><i class="fas fa-play"></i> Start Ad</button>`;
        list.innerHTML += `<tr><td data-label="Product"><strong style="font-size:14px;">${p.name}</strong></td><td data-label="Price"><strong style="font-size:15px; color:var(--primary);">₹${p.price}</strong></td><td data-label="Status">${adStatus}</td><td data-label="Action">${btn}</td></tr>`;
    });
}

window.promptAd = function(id) {
    const joined = new Date(currentSeller.joinedDate || Date.now()); const diffDays = (Date.now() - joined.getTime()) / (1000 * 3600 * 24);
    let freeAdsAvailable = false;
    if(currentSeller.subscription === 'Go' || currentSeller.subscription === 'Pro') freeAdsAvailable = true; 

    if((diffDays <= 30 && !currentSeller.usedFreeAd) || freeAdsAvailable) { 
        if(confirm("Promotional Offer / Plan Perk: Start 1 ad for free?")) { 
            currentSeller.usedFreeAd = true; localStorage.setItem('sellerToken', JSON.stringify(currentSeller)); executeAdStart(id); 
            db.collection("sellers").doc(currentSeller.email).update({ usedFreeAd: true });
        } 
    } else { 
        document.getElementById("adProdId").value = id;
        document.getElementById("adCostDisplay").innerText = `₹${calculateAdCost()}`;
        validatePayoutButtons();
        document.getElementById("adPaymentModal").style.display = "flex"; 
    }
}

window.payAdOnline = function() {
    const id = document.getElementById("adProdId").value;
    const cost = calculateAdCost();
    const options = {
        "key": API_KEYS.RAZORPAY, "amount": cost * 100, "currency": "INR", "name": "Aryanta Ads", "description": "24 Hour Sponsored Ad Boost",
        "handler": function (res) { executeAdStart(id); closeModal("adPaymentModal"); },
        "prefill": { "name": currentSeller.companyName, "email": currentSeller.email },
        "theme": { "color": "#ec4899" }
    };
    const rzp = new Razorpay(options); rzp.open();
}

window.payAdUpcoming = async function() { 
    const cost = calculateAdCost();
    if(cachedTotalUpcoming < cost) return showToast("Insufficient funds in upcoming payout.", "error");
    if(!confirm(`Secure Action: Deduct ₹${cost} from upcoming payout?`)) return;
    const id = document.getElementById("adProdId").value; 
    try { await db.collection("fines").add({ email: currentSeller.email, amount: cost, reason: `Ad Boost for 24h: ${id}`, timestamp: new Date().toISOString() }); executeAdStart(id); closeModal("adPaymentModal"); try{await initDashboard();}catch(e){} loadPayments(); } catch(e) {} 
}

async function executeAdStart(id) { try { await db.collection("products").doc(id).update({ isAd: true }); try{await initDashboard();}catch(e){} loadAds(); showToast("Ad Started. Product boosted!", "success"); } catch(e) {} }
window.stopAd = async function(id) { try { await db.collection("products").doc(id).update({ isAd: false }); try{await initDashboard();}catch(e){} loadAds(); showToast("Ad Stopped.", "success"); } catch(e) {} }


// ================= BUY B2B SUPPLIES WITH RAZORPAY =================
let b2bImageIndexes = {}; 

async function loadB2bStore() {
    const grid = document.getElementById("b2bProductsGrid"); grid.innerHTML = "Loading...";
    try {
        const snap = await db.collection("b2b_products").get();
        if(!snap.empty) {
            b2bItems = snap.docs.map(d => ({id: d.id, ...d.data()})); grid.innerHTML = "";
            if(b2bItems.length===0) { grid.innerHTML = "<p>No B2B items currently available from admin.</p>"; return; }
            
            b2bItems.forEach(p => {
                b2bImageIndexes[p.id] = 0;
                let images = []; if(p.image) images.push(p.image); if(p.images && Array.isArray(p.images)) { images = p.images; } 
                
                let imgHtml = ""; let navHtml = "";
                if (images.length > 0) {
                    imgHtml = `<img id="b2bImg_${p.id}" src="${images[0]}" onclick="event.stopPropagation(); openImageViewer(this.src)">`;
                    if (images.length > 1) { navHtml = `<div class="gallery-nav left" onclick="event.stopPropagation(); changeB2bImg('${p.id}', -1)"><i class="fas fa-chevron-left"></i></div><div class="gallery-nav right" onclick="event.stopPropagation(); changeB2bImg('${p.id}', 1)"><i class="fas fa-chevron-right"></i></div>`; }
                } else { imgHtml = `<div style="width:100%; height:100%; background:#e2e8f0;"></div>`; }

                grid.innerHTML += `
                <div class="b2b-card" onclick="openB2bBuyModal('${p.id}')">
                    <div class="b2b-img-box">${navHtml}${imgHtml}</div>
                    <div class="b2b-content">
                        <h4 style="margin-bottom:8px; font-size:16px; font-weight:800; color:var(--text-main); line-height:1.2;">${p.name.length > 40 ? p.name.substring(0,40)+'...' : p.name}</h4>
                        <h3 style="color:var(--primary); font-size:22px; margin-bottom:5px; font-weight:900;">₹${p.price.toLocaleString()}</h3>
                        <p style="font-size:11px; color:var(--text-light); margin-bottom:15px; font-weight:700;">Min Qty (MOQ): ${p.moq}</p>
                        <button class="btn-prime w-100" style="padding:12px; font-size:14px; margin-top:auto;" onclick="event.stopPropagation(); openB2bBuyModal('${p.id}')"><i class="fas fa-shopping-bag"></i> Buy Now</button>
                    </div>
                </div>`;
            });
        } else {
            grid.innerHTML = "<p>No B2B items currently available from admin.</p>";
        }
    } catch(e) { grid.innerHTML = "Error loading B2B store."; }
}

window.changeB2bImg = function(id, dir) {
    const p = b2bItems.find(x => x.id === id);
    if(p && p.images && p.images.length > 1) {
        b2bImageIndexes[id] += dir;
        if(b2bImageIndexes[id] >= p.images.length) b2bImageIndexes[id] = 0;
        if(b2bImageIndexes[id] < 0) b2bImageIndexes[id] = p.images.length - 1;
        document.getElementById(`b2bImg_${id}`).src = p.images[b2bImageIndexes[id]];
    }
}

window.openB2bBuyModal = function(id) {
    const p = b2bItems.find(x => x.id === id); if(!p) return;
    
    // Top Image -> Description -> Price layout
    let imgSrc = p.image || '';
    document.getElementById("b2bProductInfo").innerHTML = `
        <div style="display:flex; flex-direction: column; align-items: center; text-align: center; gap: 15px; margin-bottom: 20px;">
            <img src="${imgSrc}" style="width: 100%; max-height: 250px; object-fit: cover; border-radius: 12px; border: 1px solid var(--border-color);">
            <div>
                <h4 style="margin: 0 0 5px; font-size: 18px;">${p.name}</h4>
                <span style="font-size: 14px; color: var(--text-light); display:block; margin-bottom:10px;">${p.desc || 'Quality B2B Wholesale Item'}</span>
                <strong style="color: var(--primary); font-size: 24px;">₹${p.price}</strong> <span style="font-size:12px; color:var(--text-light);">/ unit</span>
            </div>
        </div>
    `;
    document.getElementById("b2bWarrText").innerText = p.warranty || 'No Warranty';
    
    document.getElementById("b2bBuyId").value = id; 
    document.getElementById("b2bMoqLabel").innerText = p.moq;
    document.getElementById("b2bBuyQty").value = p.moq; document.getElementById("b2bBuyQty").min = p.moq;
    
    calcB2bTotal(); 
    document.getElementById("b2bBuyAddress").value = currentSeller.shopInfo?.address || ""; document.getElementById("b2bBuyCity").value = currentSeller.shopInfo?.city || ""; document.getElementById("b2bBuyPin").value = "";
    
    validatePayoutButtons();
    
    document.getElementById("b2bStep1").style.display = "block";
    document.getElementById("b2bStep2").style.display = "none";
    document.getElementById("buyB2bModal").style.display = "flex";
}

window.goToB2bStep2 = function() {
    document.getElementById("b2bStep1").style.display = "none";
    document.getElementById("b2bStep2").style.display = "block";
}
window.goToB2bStep1 = function() {
    document.getElementById("b2bStep2").style.display = "none";
    document.getElementById("b2bStep1").style.display = "block";
}

window.calcB2bTotal = function() {
    const id = document.getElementById("b2bBuyId").value; const p = b2bItems.find(x => x.id === id); 
    let qty = parseInt(document.getElementById("b2bBuyQty").value) || 0; if (qty < p.moq) qty = p.moq; 
    
    const totalAmount = (p.price * qty) + 70;
    document.getElementById("b2bBuyTotal").value = totalAmount.toLocaleString('en-IN');
    
    const btnPayout = document.getElementById("b2bPayoutBtn");
    if(cachedTotalUpcoming >= totalAmount) {
        btnPayout.disabled = false; btnPayout.innerHTML = `<i class="fas fa-wallet"></i> Pay via Upcoming Payout`;
    } else {
        btnPayout.disabled = true; btnPayout.innerHTML = `<i class="fas fa-exclamation-circle"></i> Insufficient Balance`;
    }
}

window.processB2bBuy = async function(method) {
    const id = document.getElementById("b2bBuyId").value; const p = b2bItems.find(x => x.id === id); 
    let qty = parseInt(document.getElementById("b2bBuyQty").value) || p.moq;
    if(qty < p.moq) return showToast(`Minimum order quantity is ${p.moq}`, "warning");
    const amount = (p.price * qty) + 70;
    const add = document.getElementById("b2bBuyAddress").value; const city = document.getElementById("b2bBuyCity").value; const pin = document.getElementById("b2bBuyPin").value;
    if(!add || !city || !pin) return showToast("Enter full shipping address.", "warning");

    if(method === 'online') { 
        const options = {
            "key": API_KEYS.RAZORPAY, "amount": amount * 100, "currency": "INR", "name": "Aryanta B2B Supply", "description": `Purchase ${qty}x ${p.name}`,
            "handler": function (res) { finalizeB2bBuy(id, amount, qty, "Online Razorpay"); },
            "prefill": { "name": currentSeller.companyName, "email": currentSeller.email },
            "theme": { "color": "#10b981" }
        };
        const rzp = new Razorpay(options); rzp.open();
    } 
    else { 
        if(cachedTotalUpcoming < amount) return showToast("Insufficient funds in upcoming payout.", "error");
        if(!confirm(`Deduct ₹${amount.toLocaleString()} from your payout balance?`)) return;
        try { 
            await db.collection("fines").add({ email: currentSeller.email, amount: amount, reason: `B2B Purchase (${qty}x ${p.name}) + Shipping`, timestamp: new Date().toISOString() }); 
            finalizeB2bBuy(id, amount, qty, "Upcoming Payout"); try{await initDashboard();}catch(e){} loadPayments(); 
        } catch(e) {} 
    }
}

async function finalizeB2bBuy(id, amount, qty, method) {
    const p = b2bItems.find(x => x.id === id);
    try { 
        await db.collection("b2b_orders").add({ sellerEmail: currentSeller.email, productId: id, productName: p.name, quantity: qty, amount: amount, paymentMethod: method, timestamp: new Date().toISOString(), status: "Pending" }); 
        closeModal("buyB2bModal"); showToast("B2B Purchase Successful! Admin will ship it.", "success"); 
    } catch(e) {}
}

// ================= CUSTOMER Q&A =================
function loadQna() {
    const list = document.getElementById("qnaList"); list.innerHTML = ""; let qCount = 0;
    sellerProducts.forEach(p => {
        if(p.qa && Array.isArray(p.qa)) {
            p.qa.forEach(q => {
                qCount++; const isAns = q.answer && q.answer.trim() !== '';
                const status = isAns ? `<span class="badge" style="background:#dcfce3; color:#166534;">Answered</span>` : `<span class="badge" style="background:#fee2e2; color:#991b1b;">Pending</span>`;
                
                let btn = '';
                if(isAns) {
                    btn = `<button class="btn-sm edit" style="padding:10px;" onclick="openQnaModal('${p.id}','${q.id}', '${q.question.replace(/'/g, "\\'")}', '${q.answer.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i></button>
                           <button class="btn-sm delete" style="padding:10px;" onclick="deleteQnaAnswer('${p.id}','${q.id}')"><i class="fas fa-trash"></i></button>`;
                } else {
                    btn = `<button class="btn-sm edit" style="padding:10px 15px;" onclick="openQnaModal('${p.id}','${q.id}', '${q.question.replace(/'/g, "\\'")}', '')"><i class="fas fa-reply"></i> Reply</button>`;
                }

                list.innerHTML += `<tr>
                    <td data-label="Product"><div style="font-size:12px; font-weight:600; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div></td>
                    <td data-label="Q&A" style="white-space: normal; line-height: 1.5; min-width: 250px;">
                        <strong style="font-size:14px; color:#1e3a8a; display:block; margin-bottom:5px;">Q: ${q.question}</strong>
                        ${isAns ? `<span style="font-size:13px; color:#064e3b; display:block; background:#ecfdf5; padding:8px; border-radius:8px;">A: ${q.answer}</span>` : ''}
                        <span style="font-size:10px; color:var(--text-light); font-weight:800; text-transform:uppercase; display:block; margin-top:5px;">By: ${maskName(q.user)}</span>
                    </td>
                    <td data-label="Status">${status}</td><td data-label="Action"><div style="display:flex; justify-content:flex-end; gap:5px;">${btn}</div></td>
                </tr>`;
            });
        }
    });
    if(qCount === 0) list.innerHTML = "<tr><td colspan='4' style='text-align:center; font-weight:600;'>No questions from customers.</td></tr>";
}

window.openQnaModal = function(pId, qId, qText, existingAns) { 
    document.getElementById("qnaProdId").value = pId; document.getElementById("qnaQid").value = qId; 
    document.getElementById("qnaTextDisplay").innerText = `"${qText}"`; 
    document.getElementById("qnaAnsText").value = existingAns || ""; 
    document.getElementById("qnaModal").style.display = "flex"; 
}

window.submitQnaAnswer = async function() {
    const pId = document.getElementById("qnaProdId").value; const qId = document.getElementById("qnaQid").value; const ans = document.getElementById("qnaAnsText").value.trim(); if(!ans) return showToast("Enter an answer.", "warning");
    const p = sellerProducts.find(x => x.id === pId); if(!p) return; const updatedQA = p.qa.map(q => { if(q.id === qId) { return { ...q, answer: ans, seller: true }; } return q; });
    try { await db.collection("products").doc(pId).update({ qa: updatedQA }); closeModal('qnaModal'); try{await initDashboard();}catch(e){} loadQna(); showToast("Answer published!", "success"); } catch(e) {}
}

window.deleteQnaAnswer = async function(pId, qId) {
    if(!confirm("Are you sure you want to delete your answer? The question will return to Pending.")) return;
    const p = sellerProducts.find(x => x.id === pId); if(!p) return; 
    const updatedQA = p.qa.map(q => { if(q.id === qId) { return { ...q, answer: "", seller: false }; } return q; });
    try { await db.collection("products").doc(pId).update({ qa: updatedQA }); try{await initDashboard();}catch(e){} loadQna(); showToast("Answer Deleted", "success"); } catch(e) {}
}

// ================= ADMIN SUPPORT TICKET =================
window.submitSupportTicket = async function() {
    const cat = document.getElementById("supCategory").value; 
    if(!cat) return showToast("Please select an Issue Category.", "warning");

    const phone = document.getElementById("supPhone").value; const desc = document.getElementById("supDesc").value;
    try { 
        await db.collection("seller_support_tickets").add({ email: currentSeller.email, name: currentSeller.companyName, phone, reason: cat, description: desc, status: "Pending", timestamp: new Date().toISOString() }); 
        showToast("Support Ticket submitted. Admin will resolve this soon.", "success"); 
        
        document.getElementById("supDesc").value = ""; 
        document.getElementById("supCategory").value = "";
        document.getElementById("supCategorySelected").innerText = "-- Select Issue Type --";
    } catch(e) { showToast("Error sending ticket", "error"); }
}

// ================= FORGOT PASSWORD (SECURE HASHING & DB CHECK) =================
async function generateSecureHash(text) {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

window.openForgotPass = function() {
    document.getElementById('stepEmail').style.display = 'block';
    document.getElementById('stepOTP').style.display = 'none';
    document.getElementById('stepReset').style.display = 'none';
    document.getElementById('fpIdentifier').value = '';
    document.getElementById('fpOTP').value = '';
    document.getElementById('fpNewPass').value = '';
    document.getElementById('fpConfirmPass').value = '';
    document.getElementById('fpNoAccountMsg').style.display = 'none';
    
    document.getElementById('forgotPassModal').style.display = 'flex';
}

window.checkAccountAndSendOTP = async function() {
    const identifier = document.getElementById('fpIdentifier').value.trim();
    if(!identifier) return showToast("Enter your email or phone number", "warning");
    
    const btn = document.getElementById('fpNextBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Database...';
    document.getElementById('fpNoAccountMsg').style.display = 'none';

    try {
        const snapEmail = await db.collection("sellers").where("email", "==", identifier).get();
        let targetEmail = null;
        
        if(!snapEmail.empty) {
            targetEmail = snapEmail.docs[0].data().email;
        } else {
            const snapPhone = await db.collection("sellers").where("phone", "==", identifier).get();
            if(!snapPhone.empty) {
                targetEmail = snapPhone.docs[0].data().email;
            }
        }
        
        if (!targetEmail) {
            btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next';
            document.getElementById('fpNoAccountMsg').style.display = 'block';
            return;
        }

        await sendSecureOTP(targetEmail);

    } catch(e) {
        showToast("Network Error checking database.", "error");
        btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next';
    }
}

async function sendSecureOTP(email) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const secureSalt = "_aryantaCrypt" + Date.now();
    
    const hashedOTP = await generateSecureHash(otp + secureSalt);
    
    sessionStorage.setItem('fp_otp_hash', hashedOTP);
    sessionStorage.setItem('fp_otp_salt', secureSalt);
    sessionStorage.setItem('fp_email_lock', email);

    try {
        await emailjs.send(API_KEYS.EMAILJS_OTP_SERVICE, API_KEYS.EMAILJS_OTP_TEMPLATE, {
            to_email: email,
            otp_code: otp,
            user_type: "Seller Partner"
        });
        
        showToast("Secure OTP Sent to your Email!", "success");
        document.getElementById('stepEmail').style.display = 'none';
        document.getElementById('stepOTP').style.display = 'block';
        document.getElementById('fpNextBtn').innerHTML = '<i class="fas fa-arrow-right"></i> Next';
    } catch(e) {
        showToast("Failed to send email. Check EmailJS config.", "error");
        document.getElementById('fpNextBtn').innerHTML = '<i class="fas fa-arrow-right"></i> Next';
    }
}

window.verifyOTP = async function() {
    const entered = document.getElementById('fpOTP').value.trim();
    const storedHash = sessionStorage.getItem('fp_otp_hash');
    const storedSalt = sessionStorage.getItem('fp_otp_salt');
    
    if(!storedHash || !storedSalt) return showToast("Session expired, please request OTP again.", "error");
    
    const hashedEntered = await generateSecureHash(entered + storedSalt);
    
    if (hashedEntered === storedHash) {
        showToast("OTP Verified Successfully!", "success");
        document.getElementById('stepOTP').style.display = 'none';
        document.getElementById('stepReset').style.display = 'block';
    } else {
        showToast("Incorrect OTP!", "error");
    }
}

window.resetPassword = async function() {
    const newPass = document.getElementById('fpNewPass').value.trim();
    const confirmPass = document.getElementById('fpConfirmPass').value.trim();

    if(newPass.length < 6) return showToast("Password must be at least 6 characters long", "warning");
    if(newPass !== confirmPass) return showToast("Passwords do not match!", "error");
    
    const targetEmail = sessionStorage.getItem('fp_email_lock');
    
    try {
        await db.collection("sellers").doc(targetEmail).update({ password: newPass });
        showToast("Password updated successfully! Logging you in...", "success");
        closeModal('forgotPassModal');
        
        document.getElementById("loginId").value = targetEmail;
        document.getElementById("loginPass").value = newPass;
        handleLogin();

        sessionStorage.removeItem('fp_otp_hash');
        sessionStorage.removeItem('fp_otp_salt');
        sessionStorage.removeItem('fp_email_lock');
    } catch(e) {
        showToast("Network error occurred.", "error");
    }
}

// Fetch API Keys Dynamically via URL from Cloudflare
async function fetchAppKeysAndBoot() {
    try {
        const res = await fetch(`${API_BASE_URL}/get-api-keys`);
        if (res.ok) {
            const data = await res.json();
            
            API_KEYS.RAZORPAY = data.razorpayKey || API_KEYS.RAZORPAY;
            API_KEYS.EMAILJS_PUBLIC = data.emailjsPublicKey || API_KEYS.EMAILJS_PUBLIC;
            API_KEYS.EMAILJS_OTP_SERVICE = data.emailjsOtpService || API_KEYS.EMAILJS_OTP_SERVICE;
            API_KEYS.EMAILJS_OTP_TEMPLATE = data.emailjsOtpTemplate || API_KEYS.EMAILJS_OTP_TEMPLATE;
        }

        if (API_KEYS.EMAILJS_PUBLIC) {
            emailjs.init(API_KEYS.EMAILJS_PUBLIC);
        }
    } catch(e) {
        console.warn("Failed to fetch API keys from Cloudflare URL. Using fallback if available.", e);
    }
    checkSession();
}

window.onload = function() { fetchAppKeysAndBoot(); };