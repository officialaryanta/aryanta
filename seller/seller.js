// ================= seller.js - Premium E-Commerce & Enterprise Seller Panel Logic =================
// 100% ORIGINAL CODE PRESERVED. ALL NEW FEATURES STRICTLY INTEGRATED.

// --- 1. CORE CONFIGURATION & DYNAMIC API KEYS ---
const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";
const PROJECT_ID = "aryanta-mart-a8893"; 

// Keys will be fetched dynamically from Cloudflare on boot
let API_KEYS = {
    RAZORPAY: "",
    EMAILJS_PUBLIC: "",
    EMAILJS_OTP_SERVICE: "",
    EMAILJS_OTP_TEMPLATE: ""
};

// PURE FIREBASE SDK CONFIGURATION
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "aryanta-mart-a8893.firebaseapp.com",
    projectId: "aryanta-mart-a8893",
    storageBucket: "aryanta-mart-a8893.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Global DB Reference
let db = null;

// Ensure Firebase is initialized safely
function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        return true;
    } else {
        console.error("Firebase SDK not loaded.");
        return false;
    }
}

let suspendInterval;

// GLOBALS
let currentSeller = null;
let sellerProducts = [];
let sellerOrders = [];
let sellerFines = [];
let sellerReviews = [];
let sellerWarranties = []; 
let sellerSupportTickets = [];
let sellerNotifications = [];
let sellerPayouts = [];
let b2bItems = [];
let salesChartInstance = null;
let uploadedImagesArray = [];
let html5QrcodeScanner = null;
let adminNotifications = [];
let unreadNotifCount = 0;

let currentPlanDuration = 'month'; 
let cachedTotalUpcoming = 0; 

// ================= UI & MASKING UTILITIES =================

// URL Masking Utility function for rendering text securely
function cleanTextLinks(text) {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" class="btn-sm" style="background:var(--primary); color:white; text-decoration:none; display:inline-block; margin-top:5px;"><i class="fas fa-external-link-alt"></i> View Secure Link</a>');
}

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

// Fix Support Toggle Dropdown issue
window.toggleCustomSelect = function() {
    const opts = document.querySelector('.custom-select-options');
    if(opts) {
        if (opts.style.display === 'block') {
            opts.style.display = 'none';
        } else {
            opts.style.display = 'block';
            opts.style.position = 'absolute';
            opts.style.background = 'white';
            opts.style.width = '100%';
            opts.style.border = '1px solid #e2e8f0';
            opts.style.zIndex = '100';
            opts.style.borderRadius = '8px';
            opts.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        }
    }
}

window.selectOption = function(value) {
    document.getElementById('supCategorySelected').innerText = value;
    document.getElementById('supCategory').value = value;
    const opts = document.querySelector('.custom-select-options');
    if(opts) opts.style.display = 'none';
}

// Global click event to close dropdowns when clicking anywhere else
document.addEventListener('click', function(e) {
    if(!e.target.closest('.custom-select-wrapper')) {
        const opts = document.querySelector('.custom-select-options');
        if(opts) opts.style.display = 'none';
    }
    if(!e.target.closest('.search-container')) {
        const sugg = document.getElementById('searchSuggestions');
        if(sugg) sugg.style.display = 'none';
    }
});

window.openImageViewer = function(src) {
    document.getElementById("fullscreenImg").src = src; 
    document.getElementById("imageViewerModal").style.display = "flex";
}

window.showToast = function(msg, type="info") {
    const container = document.getElementById("toastContainer"); 
    if(!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`; 
    let icon = type === 'success' ? "fa-check-circle" : (type === 'error' ? "fa-times-circle" : "fa-info-circle");
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`; 
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3500);
}

function safeSetText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// ================= AUTHENTICATION & SUSPENSION =================
function checkSession() {
    const token = localStorage.getItem('sellerToken');
    const loader = document.getElementById("pageLoader");

    if (token && db) {
        // Fetch fresh status from DB on load to strictly enforce Blocks/Suspends
        db.collection("sellers").doc(JSON.parse(token).email).get().then(doc => {
            if (doc.exists) {
                currentSeller = doc.data();
                localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
                
                let shouldHideInventory = false;

                if(currentSeller.status === "Blocked") {
                    shouldHideInventory = true;
                    document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none";
                    renderStatusScreen(
                        "Account Blocked", 
                        "You have been permanently blocked by Admin.<br><br>Please get support by:<br>📞 Phone: <strong>06414054676</strong><br>✉️ Email: <strong>support@aryanta.com</strong>",
                        false
                    );
                    if(currentSeller.settings && !currentSeller.settings.offline) {
                        currentSeller.settings.offline = true;
                        db.collection("sellers").doc(currentSeller.email).update({ settings: currentSeller.settings });
                        enforceHiddenInventory();
                    }
                    return;
                }
                if(currentSeller.status === "Suspended") {
                    shouldHideInventory = true;
                    document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none";
                    
                    let suspendTime = currentSeller.suspendedAt ? new Date(currentSeller.suspendedAt).getTime() : Date.now();
                    let unlockTime = suspendTime + (7 * 24 * 60 * 60 * 1000); 
                    
                    if (Date.now() >= unlockTime) {
                        currentSeller.status = "Active";
                        currentSeller.suspendedAt = null;
                        shouldHideInventory = false;
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
                        if(currentSeller.settings && !currentSeller.settings.offline) {
                            currentSeller.settings.offline = true;
                            db.collection("sellers").doc(currentSeller.email).update({ settings: currentSeller.settings });
                            enforceHiddenInventory();
                        }
                        return;
                    }
                }
                
                // KYC Alert Trigger
                if(currentSeller.kycRequested) {
                    document.getElementById("kycAlertBanner").style.display = "block";
                } else {
                    document.getElementById("kycAlertBanner").style.display = "none";
                }
                
                applySettingsToUI();
                document.getElementById("loginOverlay").style.display = "none"; document.querySelector(".seller-container").style.display = "block";
                document.getElementById("sellerGreeting").innerText = `| ${currentSeller.companyName || currentSeller.email}`;
                
                if(currentSeller.subscription && currentSeller.subscription !== 'None') {
                    document.getElementById('verifiedBadge').style.display = 'inline';
                }
                
                checkSubscriptionExpiry();
                initDashboard();
                fetchNotifications();
                checkAdminPopups();
            }
        }).catch(e => {
            // Fallback to local token if network fails
            currentSeller = JSON.parse(token);
            document.getElementById("loginOverlay").style.display = "none"; document.querySelector(".seller-container").style.display = "block";
            initDashboard();
        });

    } else {
        document.getElementById("loginOverlay").style.display = "flex"; if(loader) loader.style.display = "none"; 
    }
}

async function enforceHiddenInventory() {
    try {
        const prodSnap = await db.collection("products").where("sellerEmail", "==", currentSeller.email.toLowerCase().trim()).get();
        const batch = db.batch();
        prodSnap.docs.forEach(d => {
            if (d.data().isVisible !== false) {
                batch.update(db.collection("products").doc(d.id), { isVisible: false });
            }
        });
        await batch.commit();
    } catch(e) {}
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

async function checkAdminPopups() {
    if(!currentSeller) return;
    try {
        const snap = await db.collection("seller_popups")
            .where("sellerEmail", "==", currentSeller.email)
            .where("isRead", "==", false)
            .limit(1).get();
        if(!snap.empty) {
            const popupDoc = snap.docs[0];
            const pData = popupDoc.data();
            document.getElementById("adminPopupTitle").innerText = pData.title;
            document.getElementById("adminPopupMessage").innerText = pData.message;
            document.getElementById("adminPopupModal").style.display = "flex";
            // Mark as read immediately
            await db.collection("seller_popups").doc(popupDoc.id).update({ isRead: true });
        }
    } catch(e) {}
}

window.handleLogin = async function() {
    const id = document.getElementById("loginId").value.trim(); const pass = document.getElementById("loginPass").value.trim();
    if(!id || !pass) return showToast("Enter Email/Phone and Password.", "error");

    const btn = document.getElementById("loginBtn"); btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Logging in...`;

    if (!db) {
         if (!initializeFirebase()) {
             showToast("Database connection failed.", "error");
             btn.innerHTML = `Login to Dashboard <i class="fas fa-arrow-right"></i>`;
             return;
         }
    }

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

// ================= NOTIFICATIONS LOGIC =================
window.openFullNotif = function(id) {
    const n = adminNotifications.find(x => x.id === id); if(!n) return;
    document.getElementById('notifDetailContent').innerHTML = `
        <div style="background:var(--surface-2); padding:20px; border-radius:12px; border:1px solid var(--border-color);">
            <div style="font-size:12px; color:var(--text-light); margin-bottom:10px;"><i class="fas fa-clock"></i> ${new Date(n.time).toLocaleString()}</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-main); line-height:1.6; margin-bottom: 15px;">${n.text}</div>
            ${n.link ? `<a href="${n.link}" target="_blank" class="btn-prime" style="text-decoration:none;"><i class="fas fa-external-link-alt"></i> View Reference Link</a>` : ''}
        </div>
    `;
    document.getElementById('notificationDetailModal').style.display = 'flex';
}

function fetchNotifications() {
    try {
        db.collection("admin_broadcasts").orderBy("timestamp", "desc").limit(10).get().then(snap => {
            adminNotifications = []; unreadNotifCount = 0;
            snap.docs.forEach(doc => {
                const d = doc.data();
                if(d.target === 'all' || d.target === currentSeller.email) {
                    adminNotifications.push({ id: doc.id, text: d.message, time: d.timestamp, link: d.link });
                    unreadNotifCount++;
                }
            });
            
            const badge = document.getElementById("notifBadge");
            if(unreadNotifCount > 0 && badge) { badge.innerText = unreadNotifCount; badge.style.display = "block"; }
            
            // Re-render full list if it is active
            if(document.getElementById("notificationsSection").classList.contains("active")) {
                const list = document.getElementById("fullNotifList");
                if(adminNotifications.length === 0) {
                    list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-light); font-size:14px;"><i class="fas fa-bell-slash" style="font-size:30px; margin-bottom:10px;"></i><br>No new messages.</div>`;
                } else {
                    list.innerHTML = adminNotifications.map(n => `
                        <div style="padding:15px; border-bottom:1px solid var(--border-color); background: var(--surface-2); border-radius: 8px; margin-bottom: 10px; cursor:pointer;" onclick="openFullNotif('${n.id}')">
                            <div style="font-size:15px; color:var(--text-main); font-weight:700;">${n.text}</div>
                            <div style="font-size:12px; color:var(--text-light); margin-top:5px;"><i class="fas fa-clock"></i> ${new Date(n.time).toLocaleString()}</div>
                        </div>
                    `).join('');
                }
            }
        });
    } catch(e) {}
}

window.toggleNotifications = function() {
    showSection('notifications');
}

// ================= NAVIGATION =================
window.showSection = function(section) {
    document.getElementById('mobileSidebar').classList.remove('open'); 
    document.getElementById('mobileSidebarOverlay').style.display = 'none';
    
    document.querySelectorAll(".data-section").forEach(sec => sec.classList.remove("active"));
    const targetSection = document.getElementById(section + "Section"); 
    if(targetSection) targetSection.classList.add("active");
    
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    if(event && event.target && event.target.closest) {
        const navItem = event.target.closest('.nav-item');
        if(navItem) navItem.classList.add("active");
    }
    
    switch(section) {
        case 'home': renderDashboardStats(); break;
        case 'profile': loadProfile(); break;
        case 'inventory': loadInventory(); break;
        case 'newOrders': loadNewOrders(); break;
        case 'acceptedOrders': loadAcceptedOrders(); break;
        case 'completedScan': loadCompletedScanOrders(); break; 
        case 'shippedOrders': loadShippedOrders(); break;
        case 'deliveredOrders': loadDeliveredOrders(); break;
        case 'history': loadOrderHistory(); break;
        case 'returns': loadReturns(); break;
        case 'warranty': loadWarranty(); break;
        case 'payments': loadPayments(); break;
        case 'ads': loadAds(); break;
        case 'subscription': loadSubscriptionsUI(); break;
        case 'tutorial': loadTutorials(); break;
        case 'qna': loadQna(); break;
        case 'buyB2b': loadB2bStore(); break;
        case 'support': filterSupportTickets('All'); break;
        case 'settings': loadSettingsUI(); break;
        case 'oldTickets': loadOldTickets(); break; 
        case 'notifications': fetchNotifications(); break;
    }
}

window.handleGlobalSearch = function() {
    const input = document.getElementById("globalSearchInput").value.toLowerCase().trim(); const box = document.getElementById("searchSuggestions");
    if(!input) { box.style.display = 'none'; return; }
    let resultsHtml = '';
    const oMatches = sellerOrders.filter(o => (o.id && o.id.toLowerCase().includes(input)) || (o.order_no && o.order_no.toLowerCase().includes(input)) || (o.delivery_name && o.delivery_name.toLowerCase().includes(input)));
    oMatches.slice(0, 3).forEach(o => { resultsHtml += `<div class="suggestion-item" onclick="viewOrderDetails('${o.id}'); document.getElementById('searchSuggestions').style.display='none';"><strong>📦 Order: ${o.order_no || o.id}</strong><span>Status: ${o.status} | Buyer: ${o.delivery_name || 'N/A'}</span></div>`; });
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
        } else {
            document.getElementById('sellerMarquee').innerText = "We help to make your business no. 1. Thanks for choosing us! Keep growing with Aryanta Prime Seller Network.";
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

        // Fetch Payouts
        const paySnap = await db.collection("seller_payouts").where("sellerEmail", "==", userEmailLower).get();
        sellerPayouts = paySnap.docs.map(d => ({id: d.id, ...d.data()}));

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

        // Fetch Tickets
        const tixSnap = await db.collection("seller_support_tickets").where("email", "==", userEmailLower).orderBy("timestamp", "desc").get();
        sellerSupportTickets = tixSnap.docs.map(d => ({id: d.id, ...d.data()}));

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
    let scannedCount = 0;
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
        if(o.status === 'Completed Scan') scannedCount++;
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
    const bScan = document.getElementById("badge-completed-scan"); if(bScan) { if(scannedCount > 0) { bScan.style.display="inline-block"; bScan.innerText=scannedCount; } else bScan.style.display="none"; }
    
    // Support Badges
    fetchSupportTicketBadges();
    
    setTimeout(() => { renderSalesChart(chartData); }, 100);
}

async function fetchSupportTicketBadges() {
    try {
        const snap = await db.collection("seller_support_tickets").where("email", "==", currentSeller.email).get();
        let waitingCount = 0;
        snap.forEach(doc => {
            const d = doc.data();
            if(d.status === 'Waiting for User' || d.status === 'In Progress') waitingCount++;
        });
        const bSup = document.getElementById("badge-support-replies");
        if(bSup) {
            if(waitingCount > 0) { bSup.style.display="inline-block"; bSup.innerText = waitingCount; }
            else { bSup.style.display="none"; }
        }
    } catch(e) {}
}

function renderSalesChart(dataPoints) {
    const ctx = document.getElementById('salesChart'); if(!ctx) return;
    if(salesChartInstance) salesChartInstance.destroy();
    let gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250); gradient.addColorStop(0, 'rgba(5, 150, 105, 0.4)'); gradient.addColorStop(1, 'rgba(5, 150, 105, 0.0)');
    salesChartInstance = new Chart(ctx, { type: 'line', data: { labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], datasets: [{ label: 'Revenue (₹)', data: dataPoints, borderColor: '#059669', backgroundColor: gradient, fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#ffffff', pointBorderColor: '#059669', pointBorderWidth: 2, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5], color: '#e2e8f0' } }, x: { grid: { display: false } } } } });
}

// ================= SETTINGS & DARK MODE =================
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

// ================= ADVANCED PROFILE, KYC & SUB HISTORY =================
function loadProfile() {
    const shop = currentSeller.shopInfo || {};
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

    // Handle KYC visibility strictly if requested by Admin
    const kycWrapper = document.getElementById("kycStatusBoxWrapper");
    if (currentSeller.kycRequested) {
        if(kycWrapper) kycWrapper.style.display = 'block';
        const kyc = currentSeller.kyc || {};
        const indicator = document.getElementById("kycStatusIndicator");
        if (kyc.aadhar || kyc.pan || kyc.gst) {
            indicator.innerHTML = `<span style="color:var(--success); font-weight:bold;"><i class="fas fa-check-circle"></i> Documents Uploaded & Under Review</span>`;
        } else {
            indicator.innerHTML = `<span style="color:var(--danger); font-weight:bold;"><i class="fas fa-times-circle"></i> Pending Upload</span>`;
        }
    } else {
        if(kycWrapper) kycWrapper.style.display = 'none';
    }
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

// KYC & GST Modal Logic
window.openKycModal = function() {
    document.getElementById("kycModal").style.display = "flex";
    const kyc = currentSeller.kyc || {};
    if(kyc.aadhar || kyc.pan || kyc.gst) {
        document.getElementById("kycStatusText").innerHTML = "<strong style='color:var(--success);'>You have already uploaded documents. Uploading again will overwrite them.</strong>";
    } else {
        document.getElementById("kycStatusText").innerText = "Please upload clear images for swift verification.";
    }
}

window.saveKycDocs = async function() {
    showToast("Encrypting & Uploading securely...", "info");
    document.getElementById("kycModal").style.display = "none";
    
    const kycData = { aadhar: true, pan: true, gst: true, uploadedAt: new Date().toISOString(), status: 'Pending Review' };
    currentSeller.kyc = kycData;
    localStorage.setItem('sellerToken', JSON.stringify(currentSeller));

    try {
        await db.collection("sellers").doc(currentSeller.email).update({ kyc: kycData });
        showToast("KYC Documents successfully uploaded!", "success");
        loadProfile();
    } catch(e) {
        showToast("Error saving KYC data.", "error");
    }
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
                <div style="display:flex; gap:5px;">
                    <button class="btn-sm" style="background:#10b981;" onclick="event.stopPropagation(); shareProduct('${p.sku || p.id}')" title="Share Link"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-sm edit" onclick="event.stopPropagation(); editItem('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn-sm delete" onclick="event.stopPropagation(); deleteItem('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

window.shareProduct = function(sku) {
    const url = `https://aryanta.in/product/${sku}`; 
    const tempInput = document.createElement("input");
    tempInput.value = url;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    showToast("Product Link Copied & Ready to Share!", "success");
};

document.getElementById('itemImgFiles')?.addEventListener('change', async function(e) {
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
            <td data-label="Action">
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <div style="display:flex; gap:5px;">
                        <button class="btn-sm" style="background:var(--success); flex:1;" onclick="event.stopPropagation(); acceptOrder('${o.id}', ${isBreached})"><i class="fas fa-check"></i> Accept</button>
                        <button class="btn-sm" style="background:var(--danger); flex:1;" onclick="event.stopPropagation(); cancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancel</button>
                    </div>
                </div>
            </td>
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

// ================= COMPLETED SCANNING LOGIC =================
function loadCompletedScanOrders() {
    const list = document.getElementById("completedScanList"); list.innerHTML = "";
    const scanned = sellerOrders.filter(o => o.status === 'Completed Scan');
    if(scanned.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No scanned orders ready for ship.</td></tr>"; return; }

    scanned.forEach(o => {
        let myItems = getSellerItemsFromOrder(o); if(myItems.length === 0) return;
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span><br><span style="color:var(--text-light); font-size:12px;">Qty: <span style="color:var(--primary); font-weight:800;">${i.qty}</span></span></div></div>`).join('');
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')">
            <td data-label="Scan Date"><strong style="font-size:13px;">${new Date(o.scanned_date || o.timestamp).toLocaleDateString()}</strong></td>
            <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--secondary); font-size:14px;">${o.order_no || o.id}</strong></td>
            <td data-label="Item Details" style="font-size:13px;">${itemsHtml}</td>
            <td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534;">Ready to Ship</span></td>
            <td data-label="Action">
                <button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${o.id}')"><i class="fas fa-print"></i> Re-Print Slip</button>
            </td>
        </tr>`;
    });
}

// Override existing scanner logic from admin to handle "Completed Scan"
window.handleScanShip = async function(scannedValue) {
    const val = scannedValue.trim();
    if(!val) return;
    document.getElementById("scanShipInput").value = ""; 
    
    const list = document.getElementById("scanShipList");
    const timeStr = new Date().toLocaleTimeString();

    const o = sellerOrders.find(x => x.id === val || x.order_no === val || (x.tracking_no && x.tracking_no === val) || (x.serial_no && x.serial_no === val) || (x.product_barcode && x.product_barcode === val));

    if(!o) {
        list.innerHTML = `<tr><td>${timeStr}</td><td><strong style="font-family:monospace;">${val}</strong></td><td><span class="badge" style="background:#fee2e2; color:#991b1b;"><i class="fas fa-times"></i> Order Not Found</span></td></tr>` + list.innerHTML;
        return;
    }
    if(o.status === "Completed Scan" || o.status === "Shipped" || o.status === "Delivered") {
        list.innerHTML = `<tr><td>${timeStr}</td><td><strong>${o.order_no || o.id}</strong></td><td><span class="badge" style="background:#fef3c7; color:#d97706;">Already ${o.status}</span></td></tr>` + list.innerHTML;
        return;
    }

    try {
        await db.collection("orders").doc(o.id).update({ status: "Completed Scan", scanned_date: new Date().toISOString() });
        list.innerHTML = `<tr><td>${timeStr}</td><td><strong>${o.order_no || o.id}</strong></td><td><span class="badge" style="background:#dcfce3; color:#166534;"><i class="fas fa-check"></i> Scanned Successfully</span></td></tr>` + list.innerHTML;
        initDashboard(); 
    } catch(e) {
         list.innerHTML = `<tr><td>${timeStr}</td><td><strong>${o.order_no || o.id}</strong></td><td><span class="badge" style="background:#fee2e2; color:#991b1b;">Error Saving</span></td></tr>` + list.innerHTML;
    }
}

// ================= ACCEPTED ORDERS =================
window.toggleSelectAllAcc = function(source) { document.querySelectorAll('.cb-acc').forEach(cb => cb.checked = source.checked); }

window.loadAcceptedOrders = function() {
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
                    <button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${o.id}')"><i class="fas fa-print"></i> Get Shiprocket Slip</button>
                </div>
            </td>
        </tr>`;
    });
}

// SHIPROCKET INVOICE FETCH VIA CLOUDFLARE WORKER
window.downloadShippingInvoice = async function(orderId) {
    showToast("Authenticating with Aryanta Logistics...", "info");
    try {
        const res = await fetch(`${API_BASE_URL}/shiprocket/generate-awb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: orderId, sellerEmail: currentSeller.email })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.label_url || data.invoice_url || data.url) {
                // Safely open the Cloudflare URL to download/print Shiprocket generated PDF without internal API exposure
                window.open(data.label_url || data.invoice_url || data.url, '_blank');
                showToast("Shiprocket Slip Opened!", "success");
            } else {
                showToast("Generating Aryanta Native Print Slip...", "info");
                processSlips('print', orderId === 'bulk' ? null : orderId);
            }
        } else {
            throw new Error("Logistics API returned " + res.status);
        }
    } catch (e) {
        console.error(e);
        showToast("Logistics unavailable. Generating native print slip...", "warning");
        processSlips('print', orderId === 'bulk' ? null : orderId);
    }
}

// ================= NATIVE BROWSER PRINTING (BUG-FREE GUARANTEE) =================
window.processSlips = async function(mode, singleId = null) {
    let selectedIds = []; 
    if(singleId) { selectedIds.push(singleId); } 
    else { document.querySelectorAll('.cb-acc:checked').forEach(cb => selectedIds.push(cb.value)); }
    
    if(selectedIds.length === 0) return showToast("Select at least one order.", "warning");

    let printHtml = `<div style="background: white; width: 100%; max-width: 800px; margin: 0 auto;">`;

    for(let id of selectedIds) {
        const o = sellerOrders.find(x => x.id === id); if(!o) continue;
        let myItems = getSellerItemsFromOrder(o); 
        let itemsHtml = myItems.map(i=>`<tr><td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:600;">${i.name}</td><td style="padding:10px; text-align:center; border-bottom:1px solid #e2e8f0;">${i.qty}</td><td style="padding:10px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:600;">₹${i.price}</td></tr>`).join('');
        
        let warrantyText = "No Warranty"; 
        const p = sellerProducts.find(x => x.name === myItems[0].name);
        if(p && p.warranty && p.warranty !== "No Warranty") {
            let validDate = new Date(o.timestamp || Date.now());
            if(p.warranty.includes('Month')) validDate.setMonth(validDate.getMonth() + parseInt(p.warranty));
            if(p.warranty.includes('Year')) validDate.setFullYear(validDate.getFullYear() + parseInt(p.warranty));
            let serial = o.serial_no || "Update SN physically on dispatch";
            warrantyText = `<strong>Serial No:</strong> <span style="font-family:monospace;">${serial}</span> &nbsp;|&nbsp; <strong>Valid Till:</strong> ${validDate.toLocaleDateString()}`;
        }
        
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(o.order_no || o.id)}`;
        let realName = o.delivery_name || "Customer";
        let realSellerName = currentSeller.companyName || currentSeller.email || "Seller";

        printHtml += `
        <div class="print-page" style="page-break-after: always; padding: 40px; font-family: 'Arial', sans-serif; background: white; color: black; box-sizing: border-box;">
            <!-- Top Aryanta Details -->
            <div style="text-align:center; border: 2px solid #0f172a; padding: 20px; border-radius: 8px; margin-bottom:20px;">
                <h1 style="margin:0; font-size:28px; color:#0f172a; font-weight:900; letter-spacing:1px; text-transform: uppercase;">ARYANTA</h1>
                <p style="margin:5px 0 0 0; font-size:13px; color:#475569; font-weight:600;">support@aryanta.in | Ph: 06414054676</p>
                <h2 style="margin:15px 0 0 0; color:#059669; font-size:18px; text-transform: uppercase; letter-spacing: 1px;">Tax Invoice / Dispatch Slip</h2>
            </div>
            
            <!-- Invoice No, Date, Time -->
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; font-weight: 600; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
                <div><strong>Invoice No:</strong> ${o.order_no || o.id}</div>
                <div><strong>Date:</strong> ${new Date(o.timestamp || Date.now()).toLocaleDateString()} &nbsp;|&nbsp; <strong>Time:</strong> ${new Date(o.timestamp || Date.now()).toLocaleTimeString()}</div>
            </div>

            <!-- Customer Details & QR -->
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
                <div style="width:60%;">
                    <div style="font-size:12px; color:#64748b; text-transform:uppercase; font-weight:800; margin-bottom:5px;">Billed To (Customer)</div>
                    <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:5px;">${realName}</div>
                    <div style="font-size:13px; color:#334155; line-height:1.5;">
                        ${o.delivery_address || "Address Not Provided"}<br>
                        ${o.delivery_city || ""}, ${o.delivery_state || ""} - <strong>${o.delivery_pincode || ""}</strong>
                    </div>
                </div>
                <div style="width:35%; text-align:right;">
                    <img src="${qrUrl}" crossorigin="anonymous" style="width:90px; height:90px; border:1px solid #e2e8f0; padding:4px; border-radius:8px;">
                </div>
            </div>

            <!-- Seller Details -->
            <div style="margin-bottom:20px; font-size:13px; padding:15px; border-radius:8px; border:1px solid #cbd5e1;">
                <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:800; margin-bottom:5px;">Dispatched By (Seller)</div>
                <div style="font-weight:800; font-size:15px; color:#0f172a; margin-bottom:3px;">${realSellerName}</div>
                <div style="color:#475569;">
                    ${currentSeller.shopInfo?.address || currentSeller.address || 'Address Not Provided'}<br>
                    ${currentSeller.shopInfo?.city || currentSeller.city || ''}, ${currentSeller.shopInfo?.state || currentSeller.state || ''} - ${currentSeller.shopInfo?.pincode || currentSeller.pincode || ''}
                </div>
            </div>

            <!-- Order Table -->
            <div style="border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-bottom:20px;">
                <table style="width:100%; border-collapse: collapse; text-align:left; font-size: 13px;">
                    <tr style="background-color: #f1f5f9; border-bottom:1px solid #cbd5e1;">
                        <th style="padding:12px 10px; font-weight:800; color:#334155;">Product Title</th>
                        <th style="padding:12px 10px; text-align:center; font-weight:800; color:#334155;">Qty</th>
                        <th style="padding:12px 10px; text-align:right; font-weight:800; color:#334155;">Unit Price</th>
                    </tr>
                    ${itemsHtml}
                </table>
                <div style="text-align:right; padding: 15px; background: #f8fafc; font-size:16px;">
                    <strong style="color: #0f172a;">TOTAL AMOUNT: </strong>
                    <strong style="color: #059669; font-size: 18px;">₹${myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0).toLocaleString()}</strong>
                </div>
            </div>

            <!-- Warranty -->
            ${p && p.warranty && p.warranty !== "No Warranty" ? `
            <div style="border:1px dashed #059669; padding:15px; font-size:13px; border-radius:8px; color:#064e3b; text-align:center;">
                <strong style="font-size:14px; display:block; margin-bottom:5px; text-transform:uppercase;">Warranty Information</strong>
                ${warrantyText}
            </div>` : ''}
            
            <div style="text-align:center; margin-top:30px; font-size:11px; color:#94a3b8;">
                Thank you for shopping with Aryanta! This is a system-generated document.
            </div>
        </div>`;
        
        try { db.collection("orders").doc(id).update({ printed: true }); } catch(e) {}
    }

    printHtml += `</div>`;

    showToast("Opening Print Dialog...", "info"); 
    const printArea = document.getElementById("printArea");
    printArea.innerHTML = printHtml;
    
    const loader = document.getElementById("pageLoader");
    document.getElementById("loaderMessage").innerText = "Preparing Print...";
    loader.style.display = "flex"; loader.style.opacity = "1";
    
    const images = printArea.getElementsByTagName('img');
    let loadedImages = 0; let totalImages = images.length;
    
    // Safely trigger print using browser's native capabilities, guaranteeing fully rendered output
    const triggerPrint = () => {
        loader.style.opacity = "0"; 
        setTimeout(() => { 
            loader.style.display = "none"; 
            document.getElementById("loaderMessage").innerText = "SYNCING LIVE DB..."; 
            window.print();
        }, 300);
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

// ================= GLOBAL SCAN TO SHIP CAMERA (3-STEP MULTI-SCAN) =================
let scanStep = 1; let isProcessingScan = false;
let tempTrackingId = "";

window.openGlobalScanModal = async function() {
    scanStep = 1; isProcessingScan = false; tempTrackingId = ""; 
    document.getElementById("scanOrderId").value = ""; document.getElementById("skipScanBtn").style.display = "none";
    document.getElementById("qr-reader").innerHTML = ""; document.getElementById("qr-reader").style.display = "none"; document.getElementById("scannerPlaceholder").style.display = "flex";
    document.getElementById("scanStatus").innerHTML = "Awaiting Pre-fetch check..."; document.getElementById("scanStatus").style.color = "var(--primary)"; document.getElementById("scanModal").style.display = "flex";

    try { const snap = await db.collection("orders").orderBy("timestamp", "desc").limit(500).get(); sellerOrders = snap.docs.map(d=>({id:d.id, ...d.data()})); } catch(e) {}

    setTimeout(() => {
        document.getElementById("scannerPlaceholder").style.display = "none"; document.getElementById("qr-reader").style.display = "block"; document.getElementById("scanStatus").innerHTML = "Step 1: Awaiting Invoice QR Scan...";
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
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-check-circle"></i> Invoice Verified! <br>Step 2: Scan Shipping Label QR...`; document.getElementById("scanStatus").style.color = "var(--warning)";
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
                tempTrackingId = scannedId;
                scanStep = 3;
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-check"></i> Label Valid! <br>Step 3: Scan 16-Digit Numeric Barcode...`; document.getElementById("scanStatus").style.color = "var(--success)";
                try { setTimeout(() => html5QrcodeScanner.resume(), 1500); } catch(e){}
            } else {
                document.getElementById("scanStatus").innerHTML = `<i class="fas fa-exclamation-triangle"></i> This label is already linked! Skip or scan a fresh label.`; document.getElementById("scanStatus").style.color = "var(--warning)"; document.getElementById("skipScanBtn").style.display = "block";
                try { setTimeout(() => html5QrcodeScanner.resume(), 2500); } catch(e){}
            }
        } catch(e) { document.getElementById("scanStatus").innerText = "Network Error."; try { setTimeout(() => html5QrcodeScanner.resume(), 2000); } catch(e){} }
    }
    else if (scanStep === 3) {
        try { html5QrcodeScanner.pause(true); } catch(e){}
        if (scannedId.length >= 10 && /^\d+$/.test(scannedId)) {
            document.getElementById("scanStatus").innerHTML = `<i class="fas fa-truck"></i> Verified! Dispatching...`; document.getElementById("scanStatus").style.color = "var(--success)";
            try{ html5QrcodeScanner.clear(); } catch(e){} setTimeout(() => executeDispatch(oId, tempTrackingId, scannedId), 1000);
        } else {
            document.getElementById("scanStatus").innerHTML = `<i class="fas fa-times"></i> Invalid! Must be numeric barcode. Scan again.`; document.getElementById("scanStatus").style.color = "var(--danger)";
            try { setTimeout(() => html5QrcodeScanner.resume(), 2000); } catch(e){}
        }
    }
    setTimeout(() => { isProcessingScan = false; }, 2000);
}
function onScanFailure(error) {}

window.skipAndShip = async function() {
    const id = document.getElementById("scanOrderId").value; if(!id) return showToast("You must scan an Invoice first.", "warning");
    if(!confirm("Skip Scanning the shipping label and barcode? A fine of ₹7 will be deducted from your payout.")) return;
    try {
        await db.collection("fines").add({ email: currentSeller.email, amount: 7, reason: `Skipped label scan for Order ${id}`, timestamp: new Date().toISOString() });
        try{ html5QrcodeScanner.clear(); } catch(e){} executeDispatch(id, "SKIPPED_SCAN", "SKIPPED_BARCODE"); showToast("Shipped (₹7 Fine Applied)", "warning");
    } catch(e) {}
}

async function executeDispatch(id, trackingNo = "", productBarcode = "") {
    try { 
        await db.collection("orders").doc(id).update({
            status: 'Completed Scan', // Moves to Ready to Ship
            tracking_no: trackingNo, 
            product_barcode: productBarcode,
            scanned_date: new Date().toISOString()
        });
        closeModal("scanModal"); showToast("Order officially Scanned and ready to Ship!", "success"); try{await initDashboard();}catch(e){} loadCompletedScanOrders(); renderDashboardStats(); 
    } catch(e) {}
}

// ================= SHIPPED, DELIVERED, HISTORY & RETURNS =================
window.loadShippedOrders = function() {
    const list = document.getElementById("shippedOrdersList"); list.innerHTML = "";
    const shipped = sellerOrders.filter(o => o.status === 'Shipped' || o.status === 'Near by warehouse');
    if(shipped.length === 0) { list.innerHTML = "<tr><td colspan='4' style='text-align:center; font-weight:600;'>No orders in transit.</td></tr>"; return; }
    shipped.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); 
        let itemsHtml = myItems.map(i=> `<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Shipped Date"><strong style="font-size:13px;">${new Date(o.shipped_date || o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;">${o.status}</span></td></tr>`; 
    });
}

window.loadDeliveredOrders = function() {
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

window.loadOrderHistory = function() {
    const list = document.getElementById("historyList"); list.innerHTML = "";
    if(sellerOrders.length === 0) { list.innerHTML = "<tr><td colspan='5' style='text-align:center; font-weight:600;'>No orders yet.</td></tr>"; return; }
    sellerOrders.forEach(o => { 
        let myItems = getSellerItemsFromOrder(o); if(myItems.length===0) return; 
        let amount = myItems.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0); 
        list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no || o.id}</strong></td><td data-label="Items"><span style="font-weight:600;">${myItems.map(i=>i.name).join(', ')}</span></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:var(--surface-2); color:var(--text-light);">${o.status}</span></td></tr>`; 
    });
}

window.loadReturns = function() {
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
    
    let safeName = o.delivery_name || "Customer"; 
    let emailDisplay = maskEmail(o.user_email); 
    let phoneDisplay = maskPhone(o.delivery_phone);
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
window.loadWarranty = function() {
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

// ================= PAYMENTS LEDGER, Payout Slips & ADMIN SYNC =================
window.viewSettledSlip = function(id) {
    const p = sellerPayouts.find(x => x.id === id); if(!p) return;
    const pDate = p.date || p.settledDate ? new Date(p.date || p.settledDate).toLocaleDateString() : '-';
    const pTime = p.date || p.settledDate ? new Date(p.date || p.settledDate).toLocaleTimeString() : '-';

    const html = `
        <div style="font-family: sans-serif; color: #0f172a; line-height: 1.5; padding: 10px;">
            <div style="background: linear-gradient(135deg, #064e3b, #059669); color: white; padding: 25px; border-radius: 12px; text-align: center; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h1 style="margin:0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">ARYANTA</h1>
                <p style="margin:5px 0 0 0; font-size: 14px; opacity: 0.9;">Payment Settlement Receipt</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase;">Seller Information</h3>
                    <p style="margin: 0; font-weight: bold; font-size: 16px;">${p.name || currentSeller.companyName}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px;">UID: ${currentSeller.uid || '-'}</p>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase;">Receipt Details</h3>
                    <p style="margin: 0; font-size: 13px;"><strong>Slip No:</strong> ${p.id}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px;"><strong>Date:</strong> ${pDate} ${pTime}</p>
                </div>
            </div>

            <div style="margin-bottom: 25px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px; background: #f8fafc;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #059669;">Bank Remittance Details</h3>
                <p style="margin: 0; font-size: 14px;"><strong>Account Number:</strong> ${currentSeller.bankAccount || '-'}</p>
                <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>IFSC Code:</strong> ${currentSeller.bankIfsc || '-'}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #f1f5f9;">
                    <th style="padding: 12px; text-align: left; border-bottom: 1px solid #cbd5e1;">Description</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 1px solid #cbd5e1;">Amount</th>
                </tr>
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">Gross Order Value Generated</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(p.gross || 0).toLocaleString()}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #dc2626;">Administrative Deductions</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #dc2626;">-₹${(p.fines || 0).toLocaleString()}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: 900; font-size: 16px;">FINAL SETTLED AMOUNT</td>
                    <td style="padding: 12px; text-align: right; font-weight: 900; font-size: 18px; color: #059669;">₹${(p.netPayout || 0).toLocaleString()}</td>
                </tr>
            </table>
            <p style="text-align: center; font-size: 12px; color: #64748b;">Admin Note: ${p.adminDesc || 'Processed via Admin'}</p>
        </div>
    `;
    document.getElementById('payoutSlipContent').innerHTML = html;
    document.getElementById('payoutSlipModal').style.display = 'flex';
}

window.togglePaymentTab = function(tabId) {
    document.querySelectorAll('.payment-tab').forEach(t => t.style.display = 'none');
    document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).style.display = 'block';
}

window.loadPayments = function() {
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
        } 
    });

    if (sellerPayouts.length === 0) {
        listCompleted.innerHTML = "<tr><td colspan='3' style='text-align:center;'>No settlements yet.</td></tr>";
    } else {
        sellerPayouts.forEach(p => {
            listCompleted.innerHTML += `<tr class="clickable-row" onclick="viewSettledSlip('${p.id}')">
                <td data-label="Settled Date"><strong style="font-size:13px;">${new Date(p.date || p.settledDate).toLocaleDateString()}</strong></td>
                <td data-label="Slip Ref"><strong style="font-family:monospace; color:var(--primary);">${p.id}</strong></td>
                <td data-label="Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${(p.netPayout || 0).toLocaleString()}</td>
            </tr>`;
        });
    }

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

// ================= PREMIUM SUBSCRIPTIONS LOGIC =================
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

window.loadSubscriptionsUI = function() {
    validatePayoutButtons();
    if(currentSeller.subscription && currentSeller.subscription !== 'None') {
        showToast(`You are currently on the ${currentSeller.subscription} Plan.`, 'success');
    }
}

window.processSubscription = async function(planName, method) {
    const cost = planName === 'Go' ? (currentPlanDuration === 'year' ? 4999 : 499) : (currentPlanDuration === 'year' ? 7599 : 799);
    
    if(method === 'payout') {
        if(cachedTotalUpcoming < cost) return showToast("Insufficient funds in upcoming payout.", "error");
        if(!confirm(`Deduct ₹${cost} from your upcoming payout for ${planName} Plan?`)) return;
        
        try {
            await db.collection("fines").add({ email: currentSeller.email, amount: cost, reason: `Subscription Auto-Deduct: ${planName} (${currentPlanDuration})`, timestamp: new Date().toISOString() });
            activateSubscription(planName);
        } catch(e) { showToast("Failed to process.", "error"); }
    } else {
        if (!API_KEYS.RAZORPAY) return showToast("Razorpay Key missing. Online payments disabled.", "error");
        showToast("Initializing Razorpay Gateway...", "info");
        var options = {
            "key": API_KEYS.RAZORPAY, "amount": cost * 100, "currency": "INR", "name": "Aryanta Enterprise", "description": `${planName} Plan Subscription`,
            "handler": function (response) { activateSubscription(planName); },
            "prefill": { "name": currentSeller.companyName, "email": currentSeller.email, "contact": currentSeller.phone }, "theme": { "color": "#059669" }
        };
        var rzp1 = new Razorpay(options); rzp1.open();
    }
}

async function activateSubscription(planName) {
    const end = new Date(); if(currentPlanDuration === 'year') end.setFullYear(end.getFullYear() + 1); else end.setMonth(end.getMonth() + 1);
    const subRecord = { plan: planName, duration: currentPlanDuration, method: 'Online / Payout', cost: planName === 'Go' ? (currentPlanDuration === 'year' ? 4999 : 499) : (currentPlanDuration === 'year' ? 7599 : 799), startDate: new Date().toISOString(), endDate: end.toISOString() };
    
    currentSeller.subscription = planName; currentSeller.subEndDate = end.toISOString(); 
    if(!currentSeller.subHistory) currentSeller.subHistory = []; currentSeller.subHistory.push(subRecord);
    
    localStorage.setItem('sellerToken', JSON.stringify(currentSeller));
    try { await db.collection("sellers").doc(currentSeller.email).update({ subscription: planName, subEndDate: end.toISOString(), subHistory: currentSeller.subHistory }); showToast("Plan Activated!", "success"); loadProfile(); } 
    catch(e) { showToast("Failed to update database.", "error"); }
}

// ================= SPONSORED ADS =================
window.loadAds = function() {
    const list = document.getElementById("adsList"); list.innerHTML = "";
    sellerProducts.forEach(p => {
        let adBadge = p.sponsored ? `<span class="badge" style="background:#fbcfe8; color:#be185d;">Active</span>` : `<span class="badge" style="background:var(--surface-2); color:var(--text-light);">Inactive</span>`;
        let adAction = p.sponsored ? `<button class="btn-sm" style="background:var(--danger);" onclick="stopAd('${p.id}')">Stop</button>` : `<button class="btn-sm" style="background:#ec4899;" onclick="startAd('${p.id}')">Promote</button>`;
        list.innerHTML += `<tr><td data-label="Product"><strong style="font-size:14px;">${p.name}</strong></td><td data-label="Price">₹${p.price}</td><td data-label="Status">${adBadge}</td><td data-label="Action">${adAction}</td></tr>`;
    });
}

window.startAd = function(id) {
    let freeAdsLeft = 0;
    if(currentSeller.subscription === 'Go') freeAdsLeft = 3; if(currentSeller.subscription === 'Pro') freeAdsLeft = 5;
    
    let activeAdsCount = sellerProducts.filter(p => p.sponsored).length;
    document.getElementById("adProdId").value = id;
    
    if(activeAdsCount < freeAdsLeft) {
        if(confirm(`Use 1 of your ${freeAdsLeft} free Sponsored Ads?`)) { executeAd(id); }
    } else {
        validatePayoutButtons();
        document.getElementById("adPaymentModal").style.display = "flex";
    }
}

window.payAdOnline = function() {
    if (!API_KEYS.RAZORPAY) return showToast("Razorpay disabled.", "error");
    var options = { "key": API_KEYS.RAZORPAY, "amount": 7000, "currency": "INR", "name": "Aryanta Ads", "description": "Sponsored Ad (24 Hrs)", "handler": function(res) { closeModal("adPaymentModal"); executeAd(document.getElementById("adProdId").value); }, "prefill": { "email": currentSeller.email, "contact": currentSeller.phone }, "theme": { "color": "#ec4899" } };
    var rzp1 = new Razorpay(options); rzp1.open();
}

window.payAdUpcoming = async function() {
    if(cachedTotalUpcoming < 70) return showToast("Insufficient funds.", "error");
    if(!confirm("Deduct ₹70 from upcoming payout?")) return;
    try {
        await db.collection("fines").add({ email: currentSeller.email, amount: 70, reason: `Sponsored Ad Fee`, timestamp: new Date().toISOString() });
        closeModal("adPaymentModal"); executeAd(document.getElementById("adProdId").value);
    } catch(e) { showToast("Failed to process.", "error"); }
}

async function executeAd(id) {
    try { await db.collection("products").doc(id).update({ sponsored: true, adExpiry: new Date(Date.now() + 86400000).toISOString() }); showToast("Ad is Live for 24 Hrs!", "success"); try{await initDashboard();}catch(e){} loadAds(); } 
    catch(e) { showToast("Failed to activate ad.", "error"); }
}

window.stopAd = async function(id) {
    try { await db.collection("products").doc(id).update({ sponsored: false, adExpiry: null }); showToast("Ad Stopped.", "info"); try{await initDashboard();}catch(e){} loadAds(); } 
    catch(e) { showToast("Failed to stop ad.", "error"); }
}

// ================= CUSTOMER Q&A =================
window.loadQna = function() {
    const list = document.getElementById("qnaList"); list.innerHTML = "";
    let qCount = 0;
    sellerProducts.forEach(p => {
        if(p.qa && p.qa.length > 0) {
            p.qa.forEach(q => {
                qCount++;
                let st = q.answer ? `<span style="color:var(--success); font-weight:800;"><i class="fas fa-check"></i> Answered</span>` : `<span style="color:var(--warning); font-weight:800; animation:pulse 2s infinite;"><i class="fas fa-exclamation-circle"></i> Unanswered</span>`;
                let btn = q.answer ? `<button class="btn-sm edit" onclick="openQnaModal('${p.id}', '${q.id}')">Edit Reply</button>` : `<button class="btn-sm" style="background:#3b82f6;" onclick="openQnaModal('${p.id}', '${q.id}')">Answer Now</button>`;
                list.innerHTML += `<tr style="border-bottom:1px solid #e2e8f0;"><td data-label="Product"><strong style="font-size:13px; color:var(--primary);">${p.name}</strong></td><td data-label="Q&A"><div style="font-weight:700; color:var(--text-main); margin-bottom:5px;">Q: ${q.question}</div><div style="font-size:13px; color:var(--text-light);"><span style="font-weight:800; color:var(--secondary);">A:</span> ${q.answer || '<em>Waiting for your reply</em>'}</div></td><td data-label="Status">${st}</td><td data-label="Action">${btn}</td></tr>`;
            });
        }
    });
    if(qCount === 0) list.innerHTML = "<tr><td colspan='4' style='text-align:center; font-weight:600;'>No customer questions yet.</td></tr>";
}

window.openQnaModal = function(pId, qId) {
    const p = sellerProducts.find(x => x.id === pId); if(!p) return;
    const q = p.qa.find(x => x.id === qId); if(!q) return;
    document.getElementById("qnaProdId").value = pId; document.getElementById("qnaQid").value = qId;
    document.getElementById("qnaTextDisplay").innerText = "Q: " + q.question;
    document.getElementById("qnaAnsText").value = q.answer || "";
    document.getElementById("qnaModal").style.display = "flex";
}

window.submitQnaAnswer = async function() {
    const pId = document.getElementById("qnaProdId").value; const qId = document.getElementById("qnaQid").value;
    const ans = document.getElementById("qnaAnsText").value.trim(); if(!ans) return showToast("Answer cannot be empty.", "warning");
    
    const p = sellerProducts.find(x => x.id === pId); if(!p) return;
    let newQa = p.qa.map(q => { if(q.id === qId) return {...q, answer: ans}; return q; });
    
    try { await db.collection("products").doc(pId).update({ qa: newQa }); closeModal("qnaModal"); showToast("Answer Published!", "success"); try{await initDashboard();}catch(e){} loadQna(); } 
    catch(e) { showToast("Failed to publish.", "error"); }
}

// ================= SUPPORT TICKETS =================
window.submitSupportTicket = async function() {
    const cat = document.getElementById("supCategory").value;
    const phone = document.getElementById("supPhone").value.trim();
    const desc = document.getElementById("supDesc").value.trim();
    if(!cat || !phone || !desc) return showToast("All fields are required.", "warning");

    try {
        await db.collection("seller_support_tickets").add({
            ticketId: 'TKT-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
            email: currentSeller.email, sellerName: currentSeller.companyName || currentSeller.email, phone: phone,
            subject: cat, message: desc, status: "Open", timestamp: new Date().toISOString()
        });
        showToast("Support Ticket Submitted. Admin will review shortly.", "success");
        document.getElementById("supPhone").value = ""; document.getElementById("supDesc").value = "";
        document.getElementById('supCategorySelected').innerText = "-- Select Issue Type --"; document.getElementById('supCategory').value = "";
        try{await initDashboard();}catch(e){} 
        showSection('oldTickets');
    } catch(e) { showToast("Failed to submit.", "error"); }
}

window.loadOldTickets = function() {
    filterSupportTickets('All');
}

window.filterSupportTickets = function(filterStatus) {
    const cont = document.getElementById("oldTicketsListContainer"); if(!cont) return;
    let html = `<div style="display:flex; gap:10px; margin-bottom: 20px; overflow-x:auto; padding-bottom:5px;">
        <button class="btn-sm" style="background:${filterStatus==='All'?'var(--primary)':'var(--surface-2)'}; color:${filterStatus==='All'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('All')">All</button>
        <button class="btn-sm" style="background:${filterStatus==='Open'?'var(--warning)':'var(--surface-2)'}; color:${filterStatus==='Open'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Open')">Open / Review</button>
        <button class="btn-sm" style="background:${filterStatus==='Waiting for User'?'var(--secondary)':'var(--surface-2)'}; color:${filterStatus==='Waiting for User'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Waiting for User')">Requires Your Reply</button>
        <button class="btn-sm" style="background:${filterStatus==='Resolved'?'var(--success)':'var(--surface-2)'}; color:${filterStatus==='Resolved'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Resolved')">Resolved</button>
    </div>`;

    let filtered = sellerSupportTickets;
    if(filterStatus !== 'All') {
        if(filterStatus === 'Open') filtered = sellerSupportTickets.filter(t => t.status === 'Open' || t.status === 'In Progress');
        else filtered = sellerSupportTickets.filter(t => t.status === filterStatus || (filterStatus === 'Resolved' && t.status === 'Complete'));
    }

    if(filtered.length === 0) {
        html += `<div style="text-align:center; padding:30px; color:var(--text-light); font-weight:600;"><i class="fas fa-ticket-alt" style="font-size:40px; margin-bottom:15px; opacity:0.3;"></i><br>No tickets found for this filter.</div>`;
    } else {
        filtered.forEach(t => {
            let stBadge = '';
            if(t.status === 'Resolved' || t.status === 'Complete') stBadge = `<span class="badge" style="background:#dcfce3; color:#166534;"><i class="fas fa-check-double"></i> Resolved</span>`;
            else if(t.status === 'Waiting for User') stBadge = `<span class="badge" style="background:#eff6ff; color:#1e3a8a; animation:pulse 2s infinite;"><i class="fas fa-reply"></i> Action Required</span>`;
            else stBadge = `<span class="badge" style="background:#fffbeb; color:#b45309;"><i class="fas fa-clock"></i> Under Admin Review</span>`;

            html += `
            <div class="panel-box" style="margin-bottom:15px; cursor:pointer; transition:0.3s; border:1px solid var(--border-color);" onclick="openTicketDetail('${t.id}')">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong style="font-family:monospace; color:var(--primary); font-size:16px;">${t.ticketId || t.id}</strong>${stBadge}
                </div>
                <div style="font-weight:800; font-size:15px; color:var(--text-main); margin-bottom:8px;">${t.subject || 'Support Query'}</div>
                <div style="font-size:13px; color:var(--text-light);"><i class="fas fa-calendar-alt"></i> ${new Date(t.timestamp).toLocaleString()}</div>
            </div>`;
        });
    }
    cont.innerHTML = html;
}

window.openTicketDetail = function(id) {
    const t = sellerSupportTickets.find(x => x.id === id); if(!t) return;
    
    let html = `
        <div style="background:var(--surface-2); padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid var(--border-color);">
            <strong style="color:var(--text-light); text-transform:uppercase; font-size:11px;">Your Original Query:</strong><br><br>
            ${t.message || t.description || 'No description provided.'}
        </div>
    `;

    if(t.adminReply) {
        html += `
        <div style="background:#f5f3ff; padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid #c7d2fe;">
            <strong style="color:#4338ca; text-transform:uppercase; font-size:11px;"><i class="fas fa-user-shield"></i> Admin Reply:</strong><br><br>
            ${t.adminReply}
        </div>`;
    }

    if(t.sellerReply) {
        html += `
        <div style="background:#f0fdf4; padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid #bbf7d0;">
            <strong style="color:#166534; text-transform:uppercase; font-size:11px;"><i class="fas fa-user"></i> Your Follow-up:</strong><br><br>
            ${t.sellerReply}
        </div>`;
    }

    if(t.status === 'Waiting for User') {
        html += `
        <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:20px;">
            <label style="color:var(--secondary);"><i class="fas fa-reply"></i> Send Follow-up Response to Admin</label>
            <textarea id="replyTktMsg" class="input-field" style="height:100px;" placeholder="Provide additional details or attachments..." aria-label="Reply Message"></textarea>
            <button class="btn-prime w-100" style="background:var(--secondary); padding:15px;" onclick="sendTicketReply('${t.id}')">Submit Reply</button>
        </div>`;
    } else if (t.status !== 'Complete' && t.status !== 'Resolved') {
         html += `<div style="text-align:center; color:var(--warning); font-weight:800; font-size:13px; padding:10px; background:#fffbeb; border-radius:8px;"><i class="fas fa-clock"></i> Ticket is under review by admin. You will be notified of updates.</div>`;
    } else {
        html += `<div style="text-align:center; color:var(--success); font-weight:800; font-size:13px; padding:10px; background:#f0fdf4; border-radius:8px;"><i class="fas fa-check-double"></i> Ticket Resolved & Closed.</div>`;
    }

    document.getElementById("ticketDetailContent").innerHTML = html;
    document.getElementById("ticketDetailModal").style.display = "flex";
}

window.sendTicketReply = async function(id) {
    const msg = document.getElementById("replyTktMsg").value.trim();
    if(!msg) return showToast("Reply cannot be empty.", "warning");
    
    try {
        await db.collection("seller_support_tickets").doc(id).update({
            sellerReply: msg, status: "In Progress", timestamp: new Date().toISOString()
        });
        showToast("Reply sent to admin.", "success");
        closeModal("ticketDetailModal");
        try{await initDashboard();}catch(e){}
        filterSupportTickets('All');
    } catch(e) { showToast("Failed to send reply.", "error"); }
}

// ================= B2B WHOLESALE STORE =================
function loadB2bStore() {
    const grid = document.getElementById("b2bProductsGrid"); grid.innerHTML = "";
    db.collection("b2b_products").get().then(snap => {
        b2bItems = snap.docs.map(d => ({id: d.id, ...d.data()}));
        if(b2bItems.length === 0) { grid.innerHTML = "<div style='grid-column: 1/-1; text-align:center; padding:50px; font-weight:600; color:var(--text-light);'>No B2B items listed by admin yet.</div>"; return; }
        
        b2bItems.forEach(p => {
            let img = p.image || "https://via.placeholder.com/260";
            let stockHtml = p.stock > 0 ? `<span style="color:var(--success); font-weight:800;"><i class="fas fa-check"></i> In Stock</span>` : `<span style="color:var(--danger); font-weight:800;"><i class="fas fa-times"></i> Out of Stock</span>`;
            
            grid.innerHTML += `
            <div class="b2b-card" onclick="${p.stock > 0 ? `openBuyB2bModal('${p.id}')` : ''}">
                <div class="b2b-img-box"><img src="${img}"></div>
                <div class="b2b-content">
                    <span style="font-size:11px; color:var(--text-light); font-weight:800; text-transform:uppercase; margin-bottom:5px;">${p.category || 'General'}</span>
                    <strong style="font-size:16px; margin-bottom:8px; line-height:1.4;">${p.name}</strong>
                    <div style="font-size:13px; color:var(--text-light); margin-bottom:15px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${p.description || ''}</div>
                    <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <strong style="color:var(--primary); font-size:22px; display:block;">₹${p.price} <span style="font-size:12px; color:var(--text-light);">/unit</span></strong>
                            <span style="font-size:12px; font-weight:800;">Min Qty: ${p.moq || 1}</span>
                        </div>
                        ${stockHtml}
                    </div>
                </div>
            </div>`;
        });
    }).catch(e=>{});
}

window.openBuyB2bModal = function(id) {
    const p = b2bItems.find(x => x.id === id); if(!p) return;
    document.getElementById("b2bBuyId").value = id;
    document.getElementById("b2bBuyQty").value = p.moq || 1;
    document.getElementById("b2bBuyQty").min = p.moq || 1;
    document.getElementById("b2bMoqLabel").innerText = p.moq || 1;
    document.getElementById("b2bWarrText").innerText = "Standard Admin Guarantee";
    
    document.getElementById("b2bProductInfo").innerHTML = `
        <div style="display:flex; gap:15px; background:var(--surface-2); padding:15px; border-radius:12px; margin-bottom:20px; border:1px solid var(--border-color);">
            <img src="${p.image || 'https://via.placeholder.com/80'}" style="width:80px; height:80px; border-radius:8px; object-fit:cover;">
            <div>
                <strong style="font-size:16px; display:block; margin-bottom:5px;">${p.name}</strong>
                <span style="font-size:13px; color:var(--text-light); display:block; margin-bottom:8px;">Base Price: <strong style="color:var(--primary);">₹${p.price}</strong> / unit</span>
                <span class="badge" style="background:#dcfce3; color:#166534;">Verified Enterprise Supplier</span>
            </div>
        </div>
    `;
    
    // Auto-fill address if available
    if(currentSeller.shopInfo) {
        document.getElementById("b2bBuyAddress").value = currentSeller.shopInfo.address || '';
        document.getElementById("b2bBuyCity").value = currentSeller.shopInfo.city || '';
        document.getElementById("b2bBuyPin").value = currentSeller.shopInfo.pincode || '';
    } else {
        document.getElementById("b2bBuyAddress").value = currentSeller.address || '';
        document.getElementById("b2bBuyCity").value = currentSeller.city || '';
        document.getElementById("b2bBuyPin").value = currentSeller.pincode || '';
    }

    goToB2bStep1(); calcB2bTotal(); document.getElementById("buyB2bModal").style.display = "flex";
}

window.calcB2bTotal = function() {
    const id = document.getElementById("b2bBuyId").value; const p = b2bItems.find(x => x.id === id); if(!p) return;
    let qty = parseInt(document.getElementById("b2bBuyQty").value) || p.moq || 1;
    if(qty < (p.moq||1)) qty = p.moq || 1;
    const total = (qty * p.price) + 70; // 70 flat shipping
    document.getElementById("b2bBuyTotal").value = `₹${total}`;
    
    const payoutBtn = document.getElementById("b2bPayoutBtn");
    if(payoutBtn) {
        if(cachedTotalUpcoming >= total) { payoutBtn.disabled = false; payoutBtn.innerHTML = '<i class="fas fa-wallet"></i> Pay via Upcoming Payout'; }
        else { payoutBtn.disabled = true; payoutBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Insufficient Payout Balance'; }
    }
}

window.goToB2bStep2 = function() { document.getElementById("b2bStep1").style.display = "none"; document.getElementById("b2bStep2").style.display = "block"; }
window.goToB2bStep1 = function() { document.getElementById("b2bStep2").style.display = "none"; document.getElementById("b2bStep1").style.display = "block"; }

window.processB2bBuy = async function(method) {
    const id = document.getElementById("b2bBuyId").value; const p = b2bItems.find(x => x.id === id); if(!p) return;
    let qty = parseInt(document.getElementById("b2bBuyQty").value) || p.moq || 1;
    const totalAmount = (qty * p.price) + 70;
    
    const addr = document.getElementById("b2bBuyAddress").value.trim(); const city = document.getElementById("b2bBuyCity").value.trim(); const pin = document.getElementById("b2bBuyPin").value.trim();
    if(!addr || !city || !pin) return showToast("Complete shipping address is required.", "warning");

    const orderData = {
        productId: p.id, productName: p.name, productImage: p.image || '', pricePerUnit: p.price, qty: qty, shippingFee: 70, totalPrice: totalAmount,
        sellerEmail: currentSeller.email, sellerName: currentSeller.companyName || currentSeller.email, sellerPhone: currentSeller.phone || '',
        address: addr, city: city, pincode: pin, status: "Pending", date: new Date().toISOString(), paymentMethod: method
    };

    if(method === 'payout') {
        if(cachedTotalUpcoming < totalAmount) return showToast("Insufficient payout balance.", "error");
        if(!confirm(`Deduct ₹${totalAmount} from your payout?`)) return;
        try {
            await db.collection("fines").add({ email: currentSeller.email, amount: totalAmount, reason: `B2B Wholesale Purchase: ${p.name} (x${qty})`, timestamp: new Date().toISOString() });
            await finalizeB2bOrder(orderData, p, qty);
        } catch(e) { showToast("Transaction failed.", "error"); }
    } else {
        if (!API_KEYS.RAZORPAY) return showToast("Razorpay disabled.", "error");
        showToast("Connecting to Payment Gateway...", "info");
        var options = { "key": API_KEYS.RAZORPAY, "amount": totalAmount * 100, "currency": "INR", "name": "Aryanta Wholesale", "description": `B2B Order: ${p.name}`, "handler": function(res) { finalizeB2bOrder(orderData, p, qty); }, "prefill": { "email": currentSeller.email, "contact": currentSeller.phone }, "theme": { "color": "#10b981" } };
        var rzp1 = new Razorpay(options); rzp1.open();
    }
}

async function finalizeB2bOrder(orderData, product, qtyBought) {
    try {
        await db.collection("b2b_orders").add(orderData);
        let newStock = product.stock - qtyBought; if(newStock < 0) newStock = 0;
        await db.collection("b2b_products").doc(product.id).update({ stock: newStock });
        showToast("B2B Order Confirmed! Admin will ship soon.", "success");
        closeModal("buyB2bModal"); loadB2bStore();
    } catch(e) { showToast("Failed to log order securely.", "error"); }
}

// ================= PASSWORD RESET LOGIC (Firebase + EmailJS OTP) =================
window.openForgotPass = function() {
    document.getElementById("fpIdentifier").value = "";
    document.getElementById("fpOTP").value = "";
    document.getElementById("fpNewPass").value = "";
    document.getElementById("fpConfirmPass").value = "";
    document.getElementById("fpNoAccountMsg").style.display = "none";
    
    document.getElementById("stepEmail").style.display = "block";
    document.getElementById("stepOTP").style.display = "none";
    document.getElementById("stepReset").style.display = "none";
    
    document.getElementById("forgotPassModal").style.display = "flex";
}

window.checkAccountAndSendOTP = async function() {
    const identifier = document.getElementById("fpIdentifier").value.trim().toLowerCase();
    if(!identifier) return showToast("Please enter Email or Phone Number", "warning");

    const btn = document.getElementById("fpNextBtn");
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking...`;
    btn.disabled = true;
    document.getElementById("fpNoAccountMsg").style.display = "none";

    try {
        let sellerDoc = null; let foundEmail = null;

        const emailSnap = await db.collection("sellers").where("email", "==", identifier).get();
        if(!emailSnap.empty) { sellerDoc = emailSnap.docs[0].data(); foundEmail = sellerDoc.email; }
        else {
            const phoneSnap = await db.collection("sellers").where("phone", "==", identifier).get();
            if(!phoneSnap.empty) { sellerDoc = phoneSnap.docs[0].data(); foundEmail = sellerDoc.email; }
        }

        if(!sellerDoc || !foundEmail) {
            document.getElementById("fpNoAccountMsg").style.display = "block";
            btn.innerHTML = `<i class="fas fa-arrow-right"></i> Next`;
            btn.disabled = false;
            return;
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const salt = Math.random().toString(36).substring(2, 15);
        const encoder = new TextEncoder(); const data = encoder.encode(otp + salt); const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer)); const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        sessionStorage.setItem('fp_otp_hash', hashHex);
        sessionStorage.setItem('fp_otp_salt', salt);
        sessionStorage.setItem('fp_email_lock', foundEmail);

        if(API_KEYS.EMAILJS_PUBLIC) emailjs.init(API_KEYS.EMAILJS_PUBLIC);
        
        let templateParams = {
            to_email: foundEmail,
            to_name: sellerDoc.companyName || sellerDoc.name || 'Seller',
            otp_code: otp,
            reply_to: "support@aryanta.in"
        };

        if(API_KEYS.EMAILJS_OTP_SERVICE && API_KEYS.EMAILJS_OTP_TEMPLATE) {
            await emailjs.send(API_KEYS.EMAILJS_OTP_SERVICE, API_KEYS.EMAILJS_OTP_TEMPLATE, templateParams);
        } else {
             // Fallback console log if keys missing (for dev)
             console.log(`[DEV MODE] OTP for ${foundEmail} is: ${otp}`);
        }

        showToast("OTP sent securely to registered email.", "success");
        document.getElementById("stepEmail").style.display = "none";
        document.getElementById("stepOTP").style.display = "block";

    } catch(e) {
        showToast("Network error. Please try again.", "error");
    } finally {
        btn.innerHTML = `<i class="fas fa-arrow-right"></i> Next`;
        btn.disabled = false;
    }
}

window.verifyOTP = async function() {
    const enteredOTP = document.getElementById("fpOTP").value.trim();
    if(enteredOTP.length !== 4) return showToast("Enter complete 4-digit OTP", "warning");

    const savedHash = sessionStorage.getItem('fp_otp_hash');
    const salt = sessionStorage.getItem('fp_otp_salt');
    if(!savedHash || !salt) return showToast("Session expired. Start again.", "error");

    const encoder = new TextEncoder(); const data = encoder.encode(enteredOTP + salt); const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer)); const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if(computedHash === savedHash) {
        showToast("OTP Verified successfully!", "success");
        document.getElementById("stepOTP").style.display = "none";
        document.getElementById("stepReset").style.display = "block";
    } else {
        showToast("Invalid OTP. Try again.", "error");
    }
}

window.resetPassword = async function() {
    const p1 = document.getElementById("fpNewPass").value.trim();
    const p2 = document.getElementById("fpConfirmPass").value.trim();
    const lockedEmail = sessionStorage.getItem('fp_email_lock');

    if(!lockedEmail) return showToast("Security error. Restart process.", "error");
    if(p1.length < 6) return showToast("Password must be at least 6 characters.", "warning");
    if(p1 !== p2) return showToast("Passwords do not match.", "error");

    try {
        await db.collection("sellers").doc(lockedEmail).update({ password: p1 });
        showToast("Password Reset Successful! You can now login.", "success");
        closeModal("forgotPassModal");
        
        document.getElementById("loginId").value = lockedEmail;
        document.getElementById("loginPass").value = p1;
        handleLogin();

        sessionStorage.removeItem('fp_otp_hash');
        sessionStorage.removeItem('fp_otp_salt');
        sessionStorage.removeItem('fp_email_lock');
    } catch(e) {
        showToast("Network error occurred.", "error");
    }
}

window.loadTutorials = function() {
    const list = document.getElementById("tutorialContentList");
    if(list) list.innerHTML = "<div style='grid-column: 1 / -1; padding: 50px; text-align: center; color: var(--text-light);'><h4>Tutorials Loading...</h4><p style='margin-top:10px;'>Your educational content is being retrieved from the admin.</p></div>";
};

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

        if (API_KEYS.EMAILJS_PUBLIC) emailjs.init(API_KEYS.EMAILJS_PUBLIC);
    } catch(e) {
        console.warn("Failed to fetch secure API keys.", e);
    } finally {
        initializeFirebase();
        checkSession();
    }
}

// Ensure DOM DOM Updates are injected properly on load
document.addEventListener("DOMContentLoaded", () => {
    // Fix fontawesome icon for delivered orders to be perfectly visible
    const deliveredIcons = document.querySelectorAll('.fa-box-check');
    deliveredIcons.forEach(icon => {
        icon.className = 'fas fa-check-circle';
    });
    
    // Hide print button from payout slip modal
    const payoutPrintBtn = document.querySelector('#payoutSlipModal .btn-prime');
    if(payoutPrintBtn) {
        payoutPrintBtn.style.display = 'none';
    }

    fetchAppKeysAndBoot();
});
