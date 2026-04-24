// --- 1. CORE CONFIGURATION ---
const API_BASE_URL = "https://rough-field-c679.official-aryanta.workers.dev";
const PROJECT_ID = "aryanta-mart-a8893"; 
const GOOGLE_CLIENT_ID = "534670405296-dat142ad15koph0aupropeau1997o1md.apps.googleusercontent.com";
const RAZORPAY_KEY = "rzp_test_SfN9xZbqkMSz6G"; 

emailjs.init("TDgNRO0CEs9rU3ozD");

let allProducts = [];
let baseCategoryProducts = []; 
let currentlyDisplayed = 0;
const BATCH_SIZE = 20; 

let cart = [];
let wishlist = []; 
let currentProduct = null;
let currentImageIndex = 0; 
let currentCategory = 'All'; 
let hashedOTP = "";
let tempUserData = null; 
let currentOrderState = { itemsTotal: 0, shippingCost: 0, grandTotal: 0, discount: 0, finalPayable: 0 };
let savedUserAddresses = [];
let userAvatar = "";
let walletBalance = 0; 
let walletAppliedAmount = 0;

let isGoogleSignup = false;
let googleUserData = null;

let siteConfig = { isSpecialDay: false, specialDayName: "", taxConfig: { baseShipping: 60, gstRate: 18, primeRadius: 120 } };

const BHAGALPUR_LAT = 25.2425;
const BHAGALPUR_LON = 86.9842;

// --- 2. FAST BOOT OPTIMIZATION & REFRESH/URL LINKING ---
let activeOverlays = [];

const navEntries = performance.getEntriesByType("navigation");
if ((navEntries.length > 0 && navEntries[0].type === "reload") || (window.performance && window.performance.navigation && window.performance.navigation.type === 1)) {
    if (window.location.search.includes('product=')) {
        window.location.href = window.location.pathname;
    }
}

setTimeout(() => {
    const loader = document.getElementById('pageLoader');
    if (loader && !localStorage.getItem('cached_products')) {
        loader.classList.add('hidden');
    }
}, 800);

window.closeAllModals = function() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('sidebar').classList.remove('open');
    document.body.style.overflow = 'auto';
    activeOverlays = [];
    window.history.replaceState(null, null, window.location.pathname);
};

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
    
    if(id === 'fullWishlistPage') renderWishlistPage();

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
        const anyFull = activeOverlays.some(uid => { const check = document.getElementById(uid); return check && check.classList.contains('full-page'); });
        if(!anyFull) document.body.style.overflow = 'auto';
    }
    if (activeOverlays.length === 0) { window.history.replaceState(null, null, window.location.pathname); }
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
    
    document.getElementById('alertOkBtn').onclick = () => { 
        document.getElementById('customAlertOverlay').style.display = 'none'; 
        if(onConfirm) onConfirm(); 
    };
    document.getElementById('alertCancelBtn').onclick = () => { 
        document.getElementById('customAlertOverlay').style.display = 'none'; 
    };
}
function closeAlert() { document.getElementById('customAlertOverlay').style.display = 'none'; }

function toggleButtonState(btnId, isLoading, defaultText, loadingText = "Processing...") {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${loadingText}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = defaultText;
        btn.disabled = false;
    }
}

async function updateUserDataAPI(email, updateFields) {
    try {
        await fetch(`${API_BASE_URL}/update-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, updates: updateFields, projectId: PROJECT_ID })
        });
    } catch(e) {}
}

// --- NEW FEATURE: BROADCAST LISTENER ---
async function listenForBroadcasts() {
    try {
        const res = await fetch(`${API_BASE_URL}/get-broadcasts`);
        const data = await res.json();
        if(data && data.length > 0) {
            const b = data[0]; 
            const lastSeen = localStorage.getItem('last_seen_broadcast');
            if(lastSeen !== b.id) {
                document.getElementById('broadcastTitle').innerText = b.title;
                document.getElementById('broadcastMessage').innerText = b.message;
                document.getElementById('broadcastModal').style.display = 'flex';
                localStorage.setItem('last_seen_broadcast', b.id);
            }
        }
    } catch(e) { }
}

// --- 3. PRODUCTS, BANNERS, CATEGORIES, & INFINITE SCROLL ---
let scrollObserver = null;
let isFetchingBatch = false;

function sortProductsByAdAndRandom(products) {
    let ads = products.filter(p => p.isAd === true); 
    let primeSellers = products.filter(p => p.sellerType === 'prime' && !p.isAd);
    let newSellers = products.filter(p => p.sellerType === 'new' && !p.isAd);
    let regular = products.filter(p => p.sellerType !== 'prime' && p.sellerType !== 'new' && !p.isAd);
    
    regular.sort(() => Math.random() - 0.5); 
    newSellers.sort(() => Math.random() - 0.5);
    
    let mixedSellers = [];
    while(primeSellers.length || newSellers.length) {
        if(primeSellers.length) mixedSellers.push(primeSellers.shift());
        if(primeSellers.length) mixedSellers.push(primeSellers.shift());
        if(newSellers.length) mixedSellers.push(newSellers.shift());
    }

    return [...ads, ...mixedSellers, ...regular];
}

async function fetchAppConfig() {
    try {
        const res = await fetch(`${API_BASE_URL}/config`);
        const data = await res.json();

        // 1. Theme Configuration
        if(data && data.special_day && data.special_day.isActive) {
            const now = new Date();
            const start = new Date(data.special_day.startTime);
            const end = new Date(data.special_day.endTime);
            if(now >= start && now <= end) {
                siteConfig.isSpecialDay = true;
                siteConfig.specialDayName = data.special_day.eventName;
                document.body.classList.add('theme-special-day');
                
                const festiveBar = document.getElementById('festiveAnnouncement');
                if(festiveBar) {
                    festiveBar.style.display = 'block';
                    festiveBar.innerText = `🎉 ${siteConfig.specialDayName} is LIVE! Enjoy exclusive offers. 🎉`;
                }
            }
        }
        
        // 2. Tax/Shipping Configuration
        if(data && data.global_tax) {
            siteConfig.taxConfig = data.global_tax;
        }

    } catch (e) {}
}

async function fetchBanners() {
    const cachedBanners = localStorage.getItem('cached_banners');
    if (cachedBanners) {
        try { renderBanners(JSON.parse(cachedBanners)); } catch(e) {}
    }

    try {
        const res = await fetch(`${API_BASE_URL}/banners`);
        const banners = await res.json();
        if (banners && banners.length > 0) {
            localStorage.setItem('cached_banners', JSON.stringify(banners));
            renderBanners(banners);
        }
    } catch(e) {}
}

function renderBanners(banners) {
    const slider = document.getElementById('bannerSlider');
    if(!slider) return;
    
    slider.innerHTML = banners.map((b, index) => {
        let clickTarget = (b.link && b.link.trim() !== '' && b.link !== 'undefined') ? `onclick="window.location.href='${b.link}'"` : '';
        let transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
        return `<div class="banner-slide" style="background-image: url('${b.imageUrl}'); transform: ${transform}; cursor:pointer;" ${clickTarget}></div>`;
    }).join('');
    
    if(window.bannerInterval) clearInterval(window.bannerInterval);
    initBannerSlider();
}

function initBannerSlider() {
    let currentSlide = 0;
    const slides = document.querySelectorAll('.banner-slide');
    if(slides.length <= 1) return;
    
    window.bannerInterval = setInterval(() => {
        slides[currentSlide].style.transform = 'translateX(-100%)'; 
        currentSlide = (currentSlide + 1) % slides.length;
        
        slides[currentSlide].style.transition = 'none';
        slides[currentSlide].style.transform = 'translateX(100%)';
        
        setTimeout(() => {
            slides[currentSlide].style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            slides[currentSlide].style.transform = 'translateX(0)';
        }, 20);
    }, 1500); 
}

async function fetchProducts() {
    const cached = localStorage.getItem('cached_products');
    const urlParams = new URLSearchParams(window.location.search);
    const sharedProductId = urlParams.get('product');
    
    if (cached) {
        try {
            allProducts = JSON.parse(cached);
            baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
            document.getElementById('pageLoader').classList.add('hidden');
            renderCategoryPills();
            currentlyDisplayed = 0;
            document.getElementById('productShelf').innerHTML = '';
            loadMoreProducts(); 
            if(sharedProductId) openProductPage(sharedProductId);
        } catch(e) {}
    }

    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        const freshData = await res.json();
        
        if (!cached || freshData.length !== allProducts.length) {
            allProducts = freshData;
            baseCategoryProducts = sortProductsByAdAndRandom(allProducts); 
            localStorage.setItem('cached_products', JSON.stringify(allProducts));
            
            document.getElementById('pageLoader').classList.add('hidden');
            renderCategoryPills();
            
            currentlyDisplayed = 0;
            document.getElementById('productShelf').innerHTML = '';
            loadMoreProducts(); 
            if(sharedProductId && !cached) openProductPage(sharedProductId);
        } else {
            localStorage.setItem('cached_products', JSON.stringify(freshData));
            allProducts = freshData;
        }
    } catch(err) {
        if (!cached) {
            document.getElementById('pageLoader').classList.add('hidden');
            document.getElementById('productShelf').innerHTML = '<p class="text-center" style="grid-column: 1/-1;">Loading products...</p>';
        }
    }
}

function renderCategoryPills() {
    let cats = Array.from(new Set(allProducts.map(p => p.category || 'Other')));
    cats = cats.slice(0, 19); 

    const container = document.getElementById('categoryFilters');
    container.innerHTML = `
        <button class="cat-pill active" id="pill-All" onclick="filterCategory('All')">All</button>
        <button class="cat-pill" id="pill-More" onclick="openCategoryModal()"><i class="fas fa-layer-group"></i> Categories</button>
    `;

    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = '';
    cats.forEach(c => {
        grid.innerHTML += `<button class="cat-pill" style="justify-content: center; padding: 15px;" onclick="filterCategory('${c}')">${c}</button>`;
    });
}

window.openCategoryModal = function() { document.getElementById('categoryModal').style.display = 'flex'; }
window.closeCategoryModal = function() { document.getElementById('categoryModal').style.display = 'none'; }

window.filterCategory = function(cat) {
    currentCategory = cat;
    document.getElementById('pill-All').classList.remove('active');
    document.getElementById('pill-More').classList.remove('active');
    
    if (cat === 'All') {
        document.getElementById('pill-All').classList.add('active');
        baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
    } else {
        document.getElementById('pill-More').classList.add('active');
        baseCategoryProducts = sortProductsByAdAndRandom(allProducts.filter(p => (p.category || 'Other') === cat));
    }
    closeCategoryModal(); 
    const term = document.getElementById('searchInput').value.toLowerCase().trim();
    applySearchAndRender(term);
}

window.loadMoreProducts = function() {
    if (isFetchingBatch) return;
    isFetchingBatch = true;
    
    const container = document.getElementById('productShelf');
    const btnMore = document.getElementById('loadMoreBtn');
    if(!container || baseCategoryProducts.length === 0) { isFetchingBatch = false; return; }

    const nextBatch = baseCategoryProducts.slice(currentlyDisplayed, currentlyDisplayed + BATCH_SIZE);
    if(nextBatch.length === 0) { btnMore.style.display = 'none'; isFetchingBatch = false; return; } 
    
    renderProducts(nextBatch, 'productShelf', true); 
    
    const allRenderedCards = container.querySelectorAll('.list-item-card');
    const triggerIndex = Math.max(0, allRenderedCards.length - 8);

    if (triggerIndex < allRenderedCards.length) {
        const triggerCard = allRenderedCards[triggerIndex];
        if (scrollObserver) scrollObserver.disconnect();
        scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreProducts();
        }, { rootMargin: "400px" });
        scrollObserver.observe(triggerCard);
    }

    currentlyDisplayed += BATCH_SIZE;
    
    if(currentlyDisplayed < baseCategoryProducts.length) btnMore.style.display = 'block';
    else btnMore.style.display = 'none';
    
    isFetchingBatch = false;
}

function fuzzyMatch(str, pattern) {
    pattern = pattern.toLowerCase();
    str = str.toLowerCase();
    let patternIdx = 0; let strIdx = 0;
    while (patternIdx < pattern.length && strIdx < str.length) {
        if (pattern[patternIdx] === str[strIdx]) patternIdx++;
        strIdx++;
    }
    return patternIdx === pattern.length;
}

function applySearchAndRender(term) {
    if (!term) {
        if (scrollObserver) scrollObserver.disconnect();
        currentlyDisplayed = 0;
        baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
        document.getElementById('productShelf').innerHTML = '';
        return loadMoreProducts();
    }
    const searchTerms = term.split(' ');
    const filtered = allProducts.map(p => {
        let score = p.isAd ? 15 : 0; 
        const nameStr = p.name.toLowerCase();
        const descStr = (p.desc || "").toLowerCase();
        const catStr = (p.category || "").toLowerCase();
        const tagsStr = (p.tags ? p.tags.join(" ") : "").toLowerCase();
        const brandStr = (p.brand || "").toLowerCase();
        
        searchTerms.forEach(t => { 
            if(nameStr.includes(t)) score += 10; 
            else if(fuzzyMatch(nameStr, t)) score += 3;
            if(tagsStr.includes(t)) score += 8;
            if(brandStr.includes(t)) score += 8;
            if(catStr.includes(t)) score += 3;
            if(descStr.includes(t)) score += 1; 
        });
        return { ...p, score };
    }).filter(p => p.score > 0).sort((a,b) => b.score - a.score);
    
    if (scrollObserver) scrollObserver.disconnect();
    
    if (filtered.length === 0) {
        showToast(`No matches for "${term}". Showing all items.`);
        baseCategoryProducts = sortProductsByAdAndRandom(allProducts); 
        currentlyDisplayed = 0;
        document.getElementById('productShelf').innerHTML = '';
        loadMoreProducts(); 
    } else {
        baseCategoryProducts = filtered;
        currentlyDisplayed = 0;
        document.getElementById('productShelf').innerHTML = '';
        loadMoreProducts();
    }
}

function renderProducts(list, containerId, append = false) {
    const container = document.getElementById(containerId);
    if(!container) return;
    if(!append) container.innerHTML = '';
    
    if(list.length === 0 && !append) {
        container.innerHTML = '<p class="text-center" style="grid-column: 1/-1; padding: 40px; color: var(--text-muted);">No products match your query.</p>';
        return;
    }
    
    const session = JSON.parse(localStorage.getItem('active_session'));
    const isUserPrime = session && session.isPrime;

    list.forEach((p, index) => {
        if(p.isDummy) return;
        let img = p.image || (p.images && p.images.length > 0 ? p.images[0] : 'https://via.placeholder.com/300');
        let starUI = (p.avgRating && p.avgRating !== "New") ? `<i class="fas fa-star"></i> ${p.avgRating} (${p.reviewCount})` : `<i class="fas fa-star" style="color:#cbd5e1;"></i> New`;
        
        let isWished = wishlist.includes(p.id) ? 'fas fa-heart text-danger' : 'far fa-heart';
        
        let price = Number(p.price);
        let mrp = p.mrp ? Number(p.mrp) : 0;
        
        if(isUserPrime) price = Math.floor(price * 0.95);

        let priceHTML = '';
        let badgeHTML = '';

        if (mrp > price) {
            let offPercent = Math.round(((mrp - price) / mrp) * 100);
            badgeHTML = `<span style="position:absolute; top:8px; left:8px; background:var(--danger); color:white; font-size:10px; font-weight:800; padding:4px 6px; border-radius:4px; z-index:5;">${offPercent}% OFF</span>`;
            priceHTML = `<span style="text-decoration:line-through; color:var(--text-muted); font-size:13px; margin-right:6px; font-weight:500;">₹${mrp.toLocaleString('en-IN')}</span> ₹${price.toLocaleString('en-IN')}`;
        } else {
            priceHTML = `₹${price.toLocaleString('en-IN')}`;
        }

        let adBadge = p.isAd ? `<div class="ad-badge">Sponsored <i class="fas fa-info-circle"></i></div>` : '';
        let stockWarning = (p.stock !== undefined && p.stock < 10) ? `<div class="stock-warning">Only ${p.stock} left in stock!</div>` : '';

        // FIX: PERFECT VERIFIED TICK ALIGNMENT
        let sellerText = '';
        let adminVerified = false;
        if(!p.sellerEmail || p.sellerEmail === 'admin' || p.sellerName === 'Aryanta Admin') {
            sellerText = `Aryanta Admin`;
            adminVerified = true;
        } else {
            sellerText = p.sellerName ? `${p.sellerName}` : "Seller";
        }

        const div = document.createElement('div');
        div.className = 'list-item-card';
        div.style.cursor = 'pointer'; 
        
        div.onclick = () => openProductPage(p.id);
        
        div.innerHTML = `
            <div class="list-image" style="position:relative;">
                ${badgeHTML}
                <img src="${img}" alt="${p.name}">
            </div>
            <div class="list-info" style="position: relative;">
                <i class="${isWished} wishlist-icon premium-hover" onclick="event.stopPropagation(); toggleWishlist('${p.id}', this)" style="position: absolute; top: 0; right: 0; font-size: 18px; color: ${wishlist.includes(p.id) ? 'var(--danger)' : 'var(--text-muted)'}; z-index: 10;"></i>
                <h4>${p.name}</h4>
                <div class="stars" id="stars-${p.id}">${starUI}</div>
                
                <div class="seller-line">
                    <span>Sold by ${sellerText}</span> 
                    ${adminVerified ? '<i class="fas fa-check-circle" style="color:var(--primary); font-size:12px;"></i>' : ''}
                </div>

                ${adBadge}
                ${stockWarning}
                <div class="price">
                    ${priceHTML}
                    ${isUserPrime ? '<span style="font-size:11px; color:var(--accent); font-weight:800; margin-left: 5px;"><i class="fas fa-gem"></i> Prime Price</span>' : ''}
                </div>
                <div class="list-actions">
                    <button class="btn-list-add" onclick="event.stopPropagation(); directAddToCart('${p.id}')">Add to Cart</button>
                    <button class="btn-list-buy" onclick="event.stopPropagation(); directBuyNow('${p.id}')">Buy Now</button>
                </div>
            </div>`;
        container.appendChild(div);
    });
}

// --- NEW FEATURE: RECENTLY VIEWED TRACKER ---
function trackRecentlyViewed(product) {
    let viewed = JSON.parse(localStorage.getItem('recently_viewed')) || [];
    viewed = viewed.filter(p => p.id !== product.id); 
    viewed.unshift(product); 
    if(viewed.length > 10) viewed.pop(); 
    localStorage.setItem('recently_viewed', JSON.stringify(viewed));
    renderRecentlyViewed();
}

function renderRecentlyViewed() {
    let viewed = JSON.parse(localStorage.getItem('recently_viewed')) || [];
    const container = document.getElementById('recentShelf');
    const wrapper = document.getElementById('recentlyViewedContainer');
    
    if(!container || !wrapper) return;
    if(viewed.length === 0) { wrapper.style.display = 'none'; return; }
    
    wrapper.style.display = 'block';
    container.innerHTML = viewed.map(p => {
        let imgUrl = p.image || (p.images && p.images.length > 0 ? p.images[0] : 'https://via.placeholder.com/100');
        return `
            <div class="cat-pill" style="padding: 10px; border-radius: 12px; min-width: 250px; justify-content:flex-start;" onclick="openProductPage('${p.id}')">
                <img src="${imgUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; margin-right: 10px;">
                <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <strong style="font-size:13px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${p.name}</strong>
                    <span style="font-size:12px; color:var(--primary); font-weight:800;">₹${p.price}</span>
                </div>
            </div>
        `;
    }).join('');
}


// --- 4. PRODUCT PAGE, SHARE & WISHLIST ---
let relatedDisplayed = 0;
let relatedObserver = null;
let isFetchingRelated = false;

window.openProductPage = async function(id) {
    currentProduct = allProducts.find(p => p.id === id);
    if(!currentProduct) return;
    
    currentImageIndex = 0;
    trackRecentlyViewed(currentProduct);
    
    document.getElementById('fpName').innerText = currentProduct.name;
    document.getElementById('fpDesc').innerText = currentProduct.desc || "High-quality product selected for you.";
    
    const highlightBox = document.getElementById('fpHighlights');
    if (highlightBox && currentProduct.highlights && currentProduct.highlights.length > 0) {
        highlightBox.style.display = 'block';
        highlightBox.innerHTML = '<strong>Highlights:</strong><ul>' + currentProduct.highlights.map(h => `<li>${h}</li>`).join('') + '</ul>';
    } else if(highlightBox) {
        highlightBox.style.display = 'none';
    }

    const session = JSON.parse(localStorage.getItem('active_session'));
    const isUserPrime = session && session.isPrime;

    let price = Number(currentProduct.price);
    let mrp = currentProduct.mrp ? Number(currentProduct.mrp) : 0;
    
    if(isUserPrime) price = Math.floor(price * 0.95);

    if (mrp > price) {
        document.getElementById('fpMrp').innerText = `₹${mrp.toLocaleString('en-IN')}`;
        document.getElementById('fpMrp').style.display = 'inline';
    } else {
        document.getElementById('fpMrp').style.display = 'none';
    }

    document.getElementById('fpPrice').innerText = `₹${price.toLocaleString('en-IN')}`;
    
    // Check Admin Verified Status for Full Page
    let adminVerified = false;
    if(!currentProduct.sellerEmail || currentProduct.sellerEmail === 'admin' || currentProduct.sellerName === 'Aryanta Admin') {
        adminVerified = true;
    }
    
    let verifiedUI = adminVerified 
        ? `<span class="verified-badge admin-badge"><i class="fas fa-shield-check"></i> Aryanta Verified</span>`
        : (currentProduct.isSellerVerified ? `<span class="verified-badge seller-badge"><i class="fas fa-check-circle"></i> Verified Seller</span>` : '');
    
    const sellerInfoEl = document.getElementById('fpSellerInfo');
    if(sellerInfoEl) {
        sellerInfoEl.innerHTML = `Sold by: <strong style="color: var(--primary);">${currentProduct.sellerName || "Aryanta Admin"}</strong><br>${verifiedUI}`;
    }

    const delBox = document.getElementById('fpDeliveryBox');
    if(delBox) {
        const estDate = new Date();
        estDate.setDate(estDate.getDate() + (isUserPrime ? 2 : 5)); 
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
        document.getElementById('fpDeliveryDate').innerText = estDate.toLocaleDateString('en-IN', dateOptions);
    }

    const wBox = document.getElementById('fpWarrantyBox');
    if(currentProduct.warranty) {
        wBox.style.display = 'flex';
        document.getElementById('fpWarrantyText').innerText = "Warranty valid for max: " + currentProduct.warranty;
    } else { wBox.style.display = 'none'; }

    const wBtn = document.getElementById('fpWishlistBtn');
    wBtn.className = wishlist.includes(id) ? "fas fa-heart premium-hover" : "far fa-heart premium-hover";

    const mainImgSrc = currentProduct.image || (currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : 'https://via.placeholder.com/600');
    document.getElementById('fpImage').src = mainImgSrc;
    
    renderProductThumbnails();

    document.getElementById('fpStarsAvg').innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    document.getElementById('fpRatingCount').innerText = `Loading...`;

    relatedDisplayed = 0;
    document.getElementById('relatedProductsShelf').innerHTML = '';
    loadMoreRelated();
    
    window.history.replaceState({ ui: 'fullProductPage' }, "", "?product=" + id);
    openUI('fullProductPage');
    document.getElementById('fullProductPage').scrollTo(0,0);

    try {
        const revRes = await fetch(`${API_BASE_URL}/reviews?productId=${id}`);
        const reviews = await revRes.json();
        let total = 0;
        if(Array.isArray(reviews) && reviews.length > 0) {
            reviews.forEach(doc => total += doc.rating);
            currentProduct.reviewCount = reviews.length;
            currentProduct.avgRating = (total / reviews.length).toFixed(1);
            let percent = Math.round(((total / reviews.length) / 5) * 100);
            
            document.getElementById('fpStarsAvg').innerHTML = `${currentProduct.avgRating} <span style="font-size:12px; color:var(--text-muted);">(${percent}% Positive)</span>`;
            document.getElementById('fpRatingCount').innerText = `${currentProduct.reviewCount} Ratings`;
            
            const cardStars = document.getElementById(`stars-${id}`);
            if(cardStars) cardStars.innerHTML = `<i class="fas fa-star"></i> ${currentProduct.avgRating} (${currentProduct.reviewCount})`;
        } else {
            currentProduct.reviewCount = 0;
            currentProduct.avgRating = "New";
            document.getElementById('fpStarsAvg').innerHTML = "New";
            document.getElementById('fpRatingCount').innerText = `0 Ratings`;
        }
    } catch(e) {
        document.getElementById('fpStarsAvg').innerHTML = `<i class="fas fa-exclamation-circle"></i>`;
        document.getElementById('fpRatingCount').innerText = `Error`;
    }
};

window.openQAPage = async function() {
    if(!currentProduct) return;
    openUI('fullQAPage');
    document.getElementById('qaList').innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading Questions...</p>';
    
    setTimeout(() => {
        const mockQA = currentProduct.qa || [];
        if(mockQA.length === 0) {
            document.getElementById('qaList').innerHTML = '<div class="panel-box text-center"><i class="fas fa-comments" style="font-size:40px; color:var(--border); margin-bottom:15px;"></i><p class="sub-text">No questions asked yet. Be the first!</p></div>';
            return;
        }
        
        document.getElementById('qaList').innerHTML = mockQA.map(qa => {
            let answerHtml = qa.answer ? `<div class="qa-a"><strong>A:</strong> ${qa.answer} <br><span style="font-size:11px; font-weight:bold; color:var(--primary);"><i class="fas fa-check-circle"></i> Official Answer</span></div>` : `<div class="qa-a" style="background:#f1f5f9; color:#94a3b8;"><em>Pending official answer...</em></div>`;
            return `
            <div class="qa-item">
                <div class="qa-q"><strong>Q:</strong> ${qa.question} <br><span style="font-size:11px; color:var(--text-muted);">by ${qa.user}</span></div>
                ${answerHtml}
            </div>
        `}).join('');
    }, 500);
}

// --- NEW FEATURE: DB SYNC FOR Q&A ---
window.askQuestion = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return showAlert("Please log in to ask a question.");
    
    const q = prompt("What would you like to know about this product?");
    if(q && q.trim() !== '') {
        toggleButtonState('qaSubmitBtn', true, 'Submitting...');
        try {
            const qaObj = {
                id: 'Q-' + Date.now(),
                user: session.name.split(' ')[0],
                question: q,
                answer: '',
                admin: false,
                timestamp: new Date().toISOString()
            };
            
            if(!currentProduct.qa) currentProduct.qa = [];
            currentProduct.qa.push(qaObj);
            
            await fetch(`${API_BASE_URL}/update-product`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentProduct.id, qa: currentProduct.qa, projectId: PROJECT_ID })
            });
            
            showToast("Question submitted! Admin will answer shortly.");
            openQAPage(); 
        } catch(e) {
            showToast("Question sent securely.");
            openQAPage();
        } finally {
            toggleButtonState('qaSubmitBtn', false, 'Ask a Question');
        }
    }
}

window.shareProduct = function() {
    if(!currentProduct) return;
    const url = window.location.origin + window.location.pathname + '?product=' + currentProduct.id;
    if (navigator.share) { navigator.share({ title: `Buy ${currentProduct.name} on Aryanta`, url: url });
    } else { navigator.clipboard.writeText(url); showToast('Product Link copied to clipboard!'); }
}

window.toggleWishlist = function(id, element) {
    if(wishlist.includes(id)) {
        wishlist = wishlist.filter(item => item !== id);
        if(element) { element.className = 'far fa-heart wishlist-icon premium-hover'; element.style.color = 'var(--text-muted)'; }
        showToast("Removed from Wishlist");
    } else {
        wishlist.push(id);
        if(element) { element.className = 'fas fa-heart wishlist-icon premium-hover'; element.style.color = 'var(--danger)'; }
        showToast("Added to Wishlist");
    }
    saveWishlist();
    if(document.getElementById('fullWishlistPage').classList.contains('open')) renderWishlistPage();
}

window.toggleWishlistFromPage = function() {
    toggleWishlist(currentProduct.id, document.getElementById('fpWishlistBtn'));
}

async function saveWishlist() {
    localStorage.setItem('local_wishlist', JSON.stringify(wishlist));
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (session && session.email) updateUserDataAPI(session.email, { wishlist: wishlist });
}

function renderWishlistPage() {
    const container = document.getElementById('wishlistShelf');
    if(!container) return;
    
    const wishedProducts = allProducts.filter(p => wishlist.includes(p.id));
    if(wishedProducts.length === 0) {
        container.innerHTML = '<div class="panel-box text-center" style="grid-column: 1/-1;"><i class="fas fa-heart" style="font-size:40px; color:var(--border); margin-bottom:15px;"></i><p style="font-size:18px; font-weight:600; color:var(--text-muted);">Your wishlist is empty.</p></div>';
        return;
    }
    
    renderProducts(wishedProducts, 'wishlistShelf', false);
}

// --- NEW FEATURE: NATIVE SHARE WISHLIST ---
window.shareWishlist = function() {
    if(wishlist.length === 0) return showAlert("Your wishlist is empty.");
    let text = "Check out my Aryanta Wishlist:\n";
    wishlist.forEach(id => {
        const p = allProducts.find(x => x.id === id);
        if(p) text += `- ${p.name}\n`;
    });
    text += "\nShop on Aryanta!";
    
    if (navigator.share) { navigator.share({ title: `My Aryanta Wishlist`, text: text, url: window.location.origin });
    } else { navigator.clipboard.writeText(text); showToast('Wishlist copied to clipboard!'); }
}

window.openWalletPage = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (!session) return showAlert("Please Login to access your wallet.", "Secure Wallet", false, () => document.getElementById('accountBtn').click());
    
    openUI('fullWalletPage');
    document.getElementById('walletBalanceDisplay').innerText = `₹${Number(walletBalance).toLocaleString('en-IN')}`;
    
    try {
        const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(session.email)}`);
        const data = await res.json();
        if(data && data.wallet !== undefined) {
            walletBalance = data.wallet;
            document.getElementById('walletBalanceDisplay').innerText = `₹${Number(walletBalance).toLocaleString('en-IN')}`;
        }
    } catch(e) {}
}

function renderProductThumbnails() {
    const container = document.getElementById('fpThumbnails');
    const imgs = currentProduct.images || [currentProduct.image];
    
    if (imgs.length <= 1) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = imgs.map((img, index) => `
        <img src="${img}" class="thumbnail-img ${index === currentImageIndex ? 'active' : ''}" 
             onclick="selectProductImage(${index}); event.stopPropagation();">
    `).join('');
}

window.selectProductImage = function(index) {
    if (!currentProduct || !currentProduct.images) return;
    currentImageIndex = index;
    document.getElementById('fpImage').src = currentProduct.images[currentImageIndex];
    renderProductThumbnails(); 
}

function loadMoreRelated() {
    if (isFetchingRelated || !currentProduct) return;
    isFetchingRelated = true;

    const similar = sortProductsByAdAndRandom(allProducts.filter(p => p.id !== currentProduct.id && (p.category === currentProduct.category || p.brand === currentProduct.brand)));
    const nextBatch = similar.slice(relatedDisplayed, relatedDisplayed + BATCH_SIZE);
    
    if(nextBatch.length === 0) { isFetchingRelated = false; return; }
    
    renderProducts(nextBatch, 'relatedProductsShelf', true);
    
    const container = document.getElementById('relatedProductsShelf');
    const allCards = container.querySelectorAll('.list-item-card');
    const triggerIndex = Math.max(0, allCards.length - 8);
    
    if(triggerIndex < allCards.length) {
        if(relatedObserver) relatedObserver.disconnect();
        relatedObserver = new IntersectionObserver((entries) => {
            if(entries[0].isIntersecting) loadMoreRelated();
        }, { rootMargin: "400px" });
        relatedObserver.observe(allCards[triggerIndex]);
    }
    
    relatedDisplayed += BATCH_SIZE;
    isFetchingRelated = false;
}

let touchStartX = 0;
let touchEndX = 0;
let swipeImgIndex = 0;

window.openSwipeGallery = function() {
    if(!currentProduct) return;
    swipeImgIndex = currentImageIndex;
    updateSwipeGallery();
    document.getElementById('swipeGalleryModal').style.display = 'flex';
}

window.closeSwipeGallery = function() {
    document.getElementById('swipeGalleryModal').style.display = 'none';
    selectProductImage(swipeImgIndex);
}

function updateSwipeGallery() {
    const imgs = currentProduct.images || [currentProduct.image];
    document.getElementById('swipeGalleryImg').src = imgs[swipeImgIndex];
    
    const thumbContainer = document.getElementById('swipeGalleryThumbnails');
    if (imgs.length > 1) {
        thumbContainer.style.display = 'flex';
        thumbContainer.innerHTML = imgs.map((img, i) => `
            <img src="${img}" class="thumbnail-img ${i === swipeImgIndex ? 'active' : ''}" 
                 onclick="selectSwipeThumbnail(${i}); event.stopPropagation();">
        `).join('');
    } else {
        thumbContainer.style.display = 'none';
    }
}

window.selectSwipeThumbnail = function(index) {
    swipeImgIndex = index;
    updateSwipeGallery();
}

const swipeContainer = document.getElementById('swipeGalleryContainer');
swipeContainer.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
swipeContainer.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].clientX; handleSwipe(); }, { passive: true });

function handleSwipe() {
    const imgs = currentProduct.images || [currentProduct.image];
    if(imgs.length <= 1) return;
    const swipeThreshold = 40; 
    
    if (touchStartX - touchEndX > swipeThreshold) { swipeImgIndex = (swipeImgIndex + 1) % imgs.length; updateSwipeGallery(); }
    if (touchEndX - touchStartX > swipeThreshold) { swipeImgIndex = (swipeImgIndex - 1 + imgs.length) % imgs.length; updateSwipeGallery(); }
}

window.directAddToCart = function(id) { currentProduct = allProducts.find(p => p.id === id); window.addToCartFromPage(); };
window.directBuyNow = function(id) { currentProduct = allProducts.find(p => p.id === id); cart = [{ ...currentProduct, qty: 1 }]; saveCart(); updateCartUI(); openCheckoutDirect(); };
window.buyNowFromPage = function() { cart = [{ ...currentProduct, qty: 1 }]; saveCart(); updateCartUI(); openCheckoutDirect(); };

// --- 5. REAL-TIME REVIEWS SYSTEM ---
let selectedReviewStars = 0;
let selectedReviewImages = [];
let currentZoom = 1;

window.setReviewStars = function(stars) {
    selectedReviewStars = stars;
    const icons = document.getElementById('starSelector').querySelectorAll('i');
    icons.forEach((icon, index) => { icon.style.color = index < stars ? '#f59e0b' : '#cbd5e1'; });
};

window.toggleReviewForm = function() {
    const form = document.getElementById('reviewFormContainer');
    if(form.style.display === 'none') {
        form.style.display = 'block';
        document.getElementById('editingReviewId').value = ""; 
        document.getElementById('revText').value = "";
        selectedReviewImages = [];
        document.getElementById('revDropZone').innerHTML = `<i class="fas fa-camera" style="font-size: 28px; color: var(--text-muted); margin-bottom: 10px;"></i> <div style="font-size: 15px; font-weight: 600; color: var(--primary);">Attach Photos (Max 5)</div>`;
        setReviewStars(5);
        form.scrollIntoView({ behavior: 'smooth' });
    } else {
        form.style.display = 'none';
    }
}

window.openImageZoom = function(src) { const modal = document.getElementById('imageZoomModal'); const img = document.getElementById('zoomedImage'); img.src = src; currentZoom = 1; img.style.transform = `scale(${currentZoom})`; modal.style.display = 'flex'; }
window.closeImageZoom = function() { document.getElementById('imageZoomModal').style.display = 'none'; }
window.zoomImage = function(delta) { currentZoom += delta; if(currentZoom < 0.5) currentZoom = 0.5; if(currentZoom > 4) currentZoom = 4; document.getElementById('zoomedImage').style.transform = `scale(${currentZoom})`; }
window.resetZoom = function() { currentZoom = 1; document.getElementById('zoomedImage').style.transform = `scale(1)`; }

const originalOpenUI = window.openUI;
window.openUI = async function(id) {
    originalOpenUI(id);
    
    if(id === 'fullReviewPage' && currentProduct) {
        document.getElementById('reviewFormContainer').style.display = 'none';
        document.getElementById('revProdName').innerText = currentProduct.name;
        document.getElementById('revProdImg').src = currentProduct.image || (currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0] : 'https://via.placeholder.com/150');
        document.getElementById('revScore').innerText = currentProduct.avgRating === "New" ? "0.0" : currentProduct.avgRating;
        document.getElementById('revCount').innerText = `${currentProduct.reviewCount} reviews`;
        
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
                    const files = Array.from(this.files).slice(0, 5); 
                    selectedReviewImages = [];
                    revDropZone.innerHTML = '';
                    
                    files.forEach(file => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = (event) => {
                            const img = new Image();
                            img.src = event.target.result;
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 600; 
                                let scaleSize = 1;
                                if (img.width > MAX_WIDTH) scaleSize = MAX_WIDTH / img.width;
                                canvas.width = img.width * scaleSize; canvas.height = img.height * scaleSize;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                selectedReviewImages.push(dataUrl);
                                
                                revDropZone.innerHTML += `<img src="${dataUrl}" style="height: 60px; width: 60px; object-fit: cover; border-radius: 8px; margin: 5px; box-shadow: var(--shadow-sm);">`;
                            }
                        };
                    });
                    
                    setTimeout(() => {
                        revDropZone.innerHTML += `<div style="width: 100%; color:var(--success); font-weight:800; font-size:13px; margin-top:10px;"><i class="fas fa-check-circle"></i> Attached (${files.length}/5)</div>`;
                    }, 500);
                }
            };
        }
        await loadReviewsList();
    }
    
    if (id === 'fullCartPage') {
        const session = JSON.parse(localStorage.getItem('active_session'));
        if (session && session.email) {
            try {
                const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(session.email)}`);
                const data = await res.json();
                if(data && data.cart) { cart = data.cart; localStorage.setItem('local_cart', JSON.stringify(cart)); updateCartUI(); }
            } catch(e) {}
        }
    }
};

async function loadReviewsList() {
    const list = document.getElementById('reviewsList');
    const session = JSON.parse(localStorage.getItem('active_session'));
    list.innerHTML = '<p class="sub-text text-center"><i class="fas fa-spinner fa-spin"></i> Loading reviews...</p>';
    try {
        const res = await fetch(`${API_BASE_URL}/reviews?productId=${currentProduct.id}`);
        const reviewsData = await res.json();
        
        if(!Array.isArray(reviewsData) || reviewsData.length === 0) {
            list.innerHTML = '<div class="panel-box text-center"><i class="fas fa-comment-dots" style="font-size:40px; color:var(--border); margin-bottom:15px;"></i><p class="sub-text">Be the first to share your experience with this product.</p></div>';
            return;
        }
        list.innerHTML = '';
        reviewsData.forEach(data => {
            let rStars = "";
            for(let i=1; i<=5; i++) rStars += `<i class="fas fa-star" style="color: ${i <= data.rating ? '#f59e0b' : '#cbd5e1'}; font-size:14px;"></i>`;
            
            let imgHTML = "";
            if (data.images && data.images.length > 0) {
                data.images.forEach(imgData => {
                    imgHTML += `<img src="${imgData}" class="rev-image-thumb" onclick="openImageZoom('${imgData}')">`;
                });
            } else if (data.image) {
                imgHTML += `<img src="${data.image}" class="rev-image-thumb" onclick="openImageZoom('${data.image}')">`;
            }
            
            const isOwner = session && session.email === data.userEmail;
            let actionBtns = isOwner ? `
                <div style="display:flex; gap:10px; margin-top:15px; border-top:1px dashed var(--border); padding-top:15px;">
                    <button class="btn-mini" onclick='editReview(${JSON.stringify(data).replace(/'/g, "\\'")})'><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn-mini delete" onclick="deleteReview('${data.id}')"><i class="fas fa-trash"></i> Delete</button>
                </div>
            ` : '';
            
            list.innerHTML += `
                <div class="review-item-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:center;">
                        <strong style="font-size:16px;"><i class="fas fa-user-circle" style="color:var(--text-muted); margin-right:8px;"></i> ${data.userName}</strong>
                        <div>${rStars}</div>
                    </div>
                    <p style="font-size:15px; line-height:1.7; color:var(--text-main); font-weight:500;">${data.text}</p>
                    <div style="display:flex; flex-wrap:wrap;">${imgHTML}</div>
                    <p style="font-size:12px; color:var(--text-muted); margin-top:15px; font-weight:600;"><i class="fas fa-clock"></i> Reviewed on ${new Date(data.timestamp).toLocaleDateString()}</p>
                    ${actionBtns}
                </div>`;
        });
    } catch(e) { list.innerHTML = '<p class="sub-text text-center" style="color:var(--danger);">Error loading reviews.</p>'; }
}

window.submitReview = async function() {
    const user = JSON.parse(localStorage.getItem('active_session'));
    if(!user) return showAlert("Please sign in to submit a review.", "Sign In Required", false, () => document.getElementById('accountBtn').click());
    if(selectedReviewStars === 0) return showAlert("Please select a star rating.");
    
    const text = document.getElementById('revText').value.trim();
    if(!text) return showAlert("Please write a short review text.");

    const editingId = document.getElementById('editingReviewId').value;
    
    const payload = {
        productId: currentProduct.id, userName: user.name, userEmail: user.email, rating: selectedReviewStars,
        text: text, images: selectedReviewImages, timestamp: new Date().toISOString(), projectId: PROJECT_ID 
    };
    
    if (editingId) payload.id = editingId; 

    toggleButtonState('submitReviewBtn', true, '<i class="fas fa-paper-plane"></i> Submit Review', 'Submitting...');
    try {
        await fetch(`${API_BASE_URL}/add-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showAlert("Your review has been successfully saved.", "Review Published");
        document.getElementById('reviewFormContainer').style.display = 'none';
        
        await window.openProductPage(currentProduct.id);
        await loadReviewsList();
    } catch(e) { showAlert("Error submitting review. Please try again."); } finally { toggleButtonState('submitReviewBtn', false, '<i class="fas fa-paper-plane"></i> Submit Review'); }
};

window.editReview = function(data) {
    document.getElementById('editingReviewId').value = data.id;
    document.getElementById('revText').value = data.text;
    setReviewStars(data.rating);
    selectedReviewImages = data.images || (data.image ? [data.image] : []);
    
    if(selectedReviewImages.length > 0) {
        document.getElementById('revDropZone').innerHTML = '';
        selectedReviewImages.forEach(img => {
            document.getElementById('revDropZone').innerHTML += `<img src="${img}" style="height: 60px; width: 60px; object-fit: cover; border-radius: 8px; margin: 5px;">`;
        });
        document.getElementById('revDropZone').innerHTML += `<div style="width:100%; color:var(--success); font-weight:800; font-size:13px; margin-top:10px;"><i class="fas fa-check-circle"></i> Images Attached (${selectedReviewImages.length}/5)</div>`;
    } else {
        document.getElementById('revDropZone').innerHTML = `<i class="fas fa-camera" style="font-size: 28px; color: var(--text-muted); margin-bottom: 10px;"></i> <div style="font-size: 15px; font-weight: 600; color: var(--primary);">Attach Photos (Max 5)</div>`;
    }
    document.getElementById('reviewFormContainer').style.display = 'block';
    document.getElementById('reviewFormContainer').scrollIntoView({ behavior: 'smooth' });
}

window.deleteReview = async function(id) {
    showAlert("Are you sure you want to permanently delete this review?", "Confirm Deletion", true, async () => {
        try {
            await fetch(`${API_BASE_URL}/add-review`, {
                 method: 'POST', 
                 headers: { 'Content-Type': 'application/json' }, 
                 body: JSON.stringify({ id: id, delete: true, productId: currentProduct.id, projectId: PROJECT_ID }) 
            });
            showToast("Review deleted");
            await loadReviewsList();
        } catch(e) { showAlert("Failed to delete review."); }
    });
}

// --- 6. CART LOGIC (With Abandoned Cart Sync) ---
async function saveCart() {
    localStorage.setItem('local_cart', JSON.stringify(cart));
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (session && session.email) updateUserDataAPI(session.email, { cart: cart }); // Abandoned Cart Sync
}

function bootLocalData() {
    const local = localStorage.getItem('local_cart');
    if(local) cart = JSON.parse(local);
    const localWish = localStorage.getItem('local_wishlist');
    if(localWish) wishlist = JSON.parse(localWish);
    updateCartUI(); 
    renderRecentlyViewed();
}

window.addToCartFromPage = function() {
    const existing = cart.find(i => i.id === currentProduct.id);
    existing ? existing.qty += 1 : cart.push({ ...currentProduct, qty: 1 });
    saveCart(); updateCartUI();
    
    const badge = document.getElementById('cartBadge');
    if (badge) { badge.classList.add('show'); badge.style.transform = 'scale(1.3)'; setTimeout(() => badge.style.transform = 'scale(1)', 200); }
    
    const fpBadge = document.getElementById('fpCartBadge');
    if (fpBadge) { fpBadge.classList.add('show'); fpBadge.style.transform = 'scale(1.3)'; setTimeout(() => fpBadge.style.transform = 'scale(1)', 200); }

    showToast(`"${currentProduct.name}" added to bag.`);
};

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let total = 0, count = 0;
    
    const session = JSON.parse(localStorage.getItem('active_session'));
    const isUserPrime = session && session.isPrime;

    cart.forEach(item => {
        let pPrice = Number(item.price);
        if(isUserPrime) pPrice = Math.floor(pPrice * 0.95);

        total += pPrice * item.qty; count += item.qty;
        let img = item.image || (item.images && item.images.length > 0 ? item.images[0] : 'https://via.placeholder.com/150');
        container.innerHTML += `
            <div class="cart-item-row">
                <div class="cart-img-box"><img src="${img}"></div>
                <div class="cart-details">
                    <h4>${item.name}</h4>
                    <div class="price">₹${(pPrice * item.qty).toLocaleString('en-IN')}</div>
                    <div class="cart-controls">
                        <button class="qty-btn" onclick="changeQty('${item.id}', -1)"><i class="fas fa-minus"></i></button>
                        <span style="font-weight:800; width: 24px; text-align:center;">${item.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${item.id}', 1)"><i class="fas fa-plus"></i></button>
                        <button class="btn-remove" onclick="removeFromCart('${item.id}')">Remove</button>
                    </div>
                </div>
            </div>`;
    });

    if(cart.length === 0) container.innerHTML = '<div class="panel-box text-center"><i class="fas fa-shopping-bag" style="font-size:40px; color:var(--border); margin-bottom:15px;"></i><p style="font-size:18px; font-weight:600; color:var(--text-muted);">Your bag is empty.</p></div>';
    
    document.getElementById('cartBadge').innerText = count;
    const fpBadge = document.getElementById('fpCartBadge');
    if (fpBadge) fpBadge.innerText = count;

    if(count > 0) {
        document.getElementById('cartBadge').classList.add('show');
        if (fpBadge) fpBadge.classList.add('show');
    } else {
        document.getElementById('cartBadge').classList.remove('show');
        if (fpBadge) fpBadge.classList.remove('show');
    }
    
    document.getElementById('cartSubtotal').innerText = `₹${total.toLocaleString('en-IN')}`; document.getElementById('cartTotalValue').innerText = `₹${total.toLocaleString('en-IN')}`;
    currentOrderState.itemsTotal = total;
}

window.changeQty = function(id, d) { 
    const item = cart.find(i => i.id === id); 
    if(item) { item.qty += d; if(item.qty <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); saveCart(); } 
};
window.removeFromCart = function(id) { cart = cart.filter(i => i.id !== id); updateCartUI(); saveCart(); };

// --- 7. AUTHENTICATION & GOOGLE INTEGRATION ---
async function secureHash(string) {
    const msgBuffer = new TextEncoder().encode(string); const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

window.onload = function () {
    if(window.google) {
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleCredentialResponse
            });
            google.accounts.id.renderButton(
                document.getElementById("googleAuthBtnLogin"),
                { theme: "outline", size: "large", shape: "rectangular", text: "signin_with" }
            );
            google.accounts.id.renderButton(
                document.getElementById("googleAuthBtnSignup"),
                { theme: "outline", size: "large", shape: "rectangular", text: "signup_with" }
            );
        } catch(e) {
            console.log("Ensure you added a valid Google Client ID to the JS file.", e);
        }
    }
}

function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

async function handleGoogleCredentialResponse(response) {
    const data = parseJwt(response.credential);
    
    try {
        const checkRes = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(data.email)}`);
        const existingUser = await checkRes.json();

        if(existingUser && existingUser.email) {
            localStorage.setItem('active_session', JSON.stringify(existingUser));
            showAlert(`Welcome back, ${existingUser.name.split(' ')[0]}.`, "Login Success");
            setTimeout(() => location.reload(), 1500);
        } else {
            isGoogleSignup = true;
            googleUserData = { name: data.name, email: data.email, avatar: data.picture };
            
            document.getElementById('regName').value = data.name;
            document.getElementById('regEmail').value = data.email;
            document.getElementById('regEmail').readOnly = true; 
            
            goToStep('signup');
            document.getElementById('signupBtn').innerText = "Complete Profile"; 
            showAlert("Please complete your delivery details (Phone, Address, Pincode) below to finish signing up.", "Almost Done!");
        }
    } catch (error) {
        showAlert("Failed to connect to backend after Google Login.");
    }
}

window.goToStep = function(step) { 
    document.getElementById('loginView').style.display = 'none'; 
    document.getElementById('signupView').style.display = 'none'; 
    document.getElementById('otpView').style.display = 'none'; 
    document.getElementById(step + 'View').style.display = 'block'; 
};

window.openAccountPage = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return;
    
    document.getElementById('accName').value = session.name || "";
    document.getElementById('accEmail').value = session.email || "";
    document.getElementById('accPhone').value = session.phone || "";
    document.getElementById('accAddress').value = session.address || "";
    document.getElementById('accCity').value = session.city || "";
    document.getElementById('accState').value = session.state || "";
    document.getElementById('accPincode').value = session.pincode || "";
    
    openUI('fullAccountPage');
    await initUserProfileAPI(session.email); 
}

function checkSession() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const accBtn = document.getElementById('accountBtn');
    
    if (session && session.email) {
        document.getElementById('sidebarUser').innerText = session.name;
        document.getElementById('sidebarRole').innerText = session.isPrime ? "Prime Member" : "Member";
        document.getElementById('sidebarLogoutBtn').style.display = "flex"; 
        
        let avatar = session.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.email}`;
        accBtn.innerHTML = `<img src="${avatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${session.name.split(' ')[0]}</span>`;
        accBtn.onclick = () => window.openAccountPage();
        document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); window.openAccountPage(); };
        
        // Prime Member Gold Tags UI Update
        if(session.isPrime) {
            const crown = document.getElementById('primeCrownBadge');
            if(crown) crown.style.display = 'block';
            const profileTag = document.getElementById('profilePrimeTag');
            if(profileTag) profileTag.style.display = 'inline-block';
        }

        bootLocalData(); 
        initUserProfileAPI(session.email);
    } else {
        document.getElementById('sidebarUser').innerText = 'Welcome Guest'; 
        document.getElementById('sidebarRole').innerText = "Sign in to access features"; 
        document.getElementById('sidebarLogoutBtn').style.display = "none";
        
        accBtn.innerHTML = 'Sign In'; 
        accBtn.onclick = () => { openUI('overlay'); openUI('authModal'); goToStep('login'); }; 
        document.getElementById('sidebarAccountLink').onclick = (e) => { e.preventDefault(); accBtn.click(); };
        bootLocalData(); 
    }
}

window.handleSignup = async function() {
    tempUserData = { 
        action: 'signup', 
        name: document.getElementById('regName').value.trim(), 
        email: document.getElementById('regEmail').value.trim(), 
        phone: document.getElementById('regPhone').value.trim(), 
        address: document.getElementById('regAddress').value.trim(), 
        city: document.getElementById('regCity').value.trim(), 
        state: document.getElementById('regState').value.trim(), 
        pincode: document.getElementById('regPincode').value.trim() 
    };
    
    if (!tempUserData.name || !tempUserData.email || !tempUserData.phone || !tempUserData.pincode) {
        return showAlert("Fill all mandatory fields including Phone and Pincode.");
    }
    
    if (isGoogleSignup) {
        toggleButtonState('signupBtn', true, 'Complete Profile', 'Saving Profile...');
        const newUser = {
            name: tempUserData.name, email: tempUserData.email, phone: tempUserData.phone,
            address: tempUserData.address, city: tempUserData.city, state: tempUserData.state,
            pincode: tempUserData.pincode, timestamp: new Date().toISOString(), projectId: PROJECT_ID,
            avatar: googleUserData.avatar,
            addresses: [], cart: [], wishlist: [], wallet: 0
        };
        try {
            await fetch(`${API_BASE_URL}/add-user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
            localStorage.setItem('active_session', JSON.stringify(newUser)); 
            
            showToast("Profile Complete! Redirecting..."); 
            setTimeout(() => location.reload(), 1000); 
        } catch (error) { 
            showAlert("Account creation failed via API. Please check your connection."); 
            toggleButtonState('signupBtn', false, 'Complete Profile');
        }
        return;
    }

    try {
        const checkRes = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(tempUserData.email)}`);
        const docRef = await checkRes.json();
        if(docRef && docRef.email) return showAlert("This email is already registered. Please sign in instead.");
    } catch(e) {}

    toggleButtonState('signupBtn', true, 'Send OTP');
    const rawOTP = Math.floor(1000 + Math.random() * 9000).toString(); hashedOTP = await secureHash(rawOTP);
    try { 
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: tempUserData.email, to_name: tempUserData.name, otp_code: rawOTP }); 
        showAlert("Verification code dispatched.", "Check Inbox"); 
        goToStep('otp'); 
    } catch (err) { 
        showAlert("Failed to send secure email."); 
    } finally { 
        toggleButtonState('signupBtn', false, 'Send OTP'); 
    }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value.trim(); 
    if(!email) return showAlert("Enter your registered email.");
    toggleButtonState('loginBtn', true, 'Send OTP');
    
    try {
        const res = await fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!data || !data.email) { 
            toggleButtonState('loginBtn', false, 'Send OTP'); 
            showAlert("Email not found. Please create an account."); 
            return goToStep('signup'); 
        }
        
        tempUserData = { action: 'login', ...data }; 
        const rawOTP = Math.floor(1000 + Math.random() * 9000).toString(); hashedOTP = await secureHash(rawOTP);
        await emailjs.send("service_wnqvm4n", "template_5by2ldn", { to_email: email, to_name: tempUserData.name, otp_code: rawOTP }); goToStep('otp');
    } catch(err) { showAlert("Cloudflare connection failed."); } finally { toggleButtonState('loginBtn', false, 'Send OTP'); }
};

const otpInputs = document.querySelectorAll('.otp-box-premium');
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
                const newUser = {
                    name: tempUserData.name, email: tempUserData.email, phone: tempUserData.phone,
                    address: tempUserData.address, city: tempUserData.city, state: tempUserData.state,
                    pincode: tempUserData.pincode, timestamp: new Date().toISOString(), projectId: PROJECT_ID,
                    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + tempUserData.name,
                    addresses: [], cart: [], wishlist: [], wallet: 0
                };
                await fetch(`${API_BASE_URL}/add-user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
                tempUserData = newUser;
            }
            localStorage.setItem('active_session', JSON.stringify(tempUserData)); 
            showAlert(`Welcome, ${tempUserData.name.split(' ')[0]}.`, "Authentication Success"); 
            setTimeout(() => location.reload(), 1500);
        } catch (error) { showAlert("Account creation failed via API. Please check your connection."); }
    } else { showAlert("Invalid Verification Code."); }
};

// --- 8. EDITABLE PROFILE & ADDRESS BOOK ---
function initUserProfileAPI(email) {
    return fetch(`${API_BASE_URL}/get-user?email=${encodeURIComponent(email)}`)
    .then(res => res.json())
    .then(data => {
        if(data && data.email) {
            savedUserAddresses = data.addresses || []; 
            if(data.wishlist) wishlist = data.wishlist;
            if(data.wallet !== undefined) walletBalance = data.wallet;
            
            let session = JSON.parse(localStorage.getItem('active_session'));
            if(session) { 
                session.addresses = savedUserAddresses; 
                session.isPrime = data.isPrime; 
                session.walletPin = data.walletPin; 
                localStorage.setItem('active_session', JSON.stringify(session)); 
            }

            userAvatar = data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
            document.getElementById('sidebarAvatar').src = userAvatar;
            const firstName = session ? session.name.split(' ')[0] : 'Profile';
            document.getElementById('accountBtn').innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${firstName}</span>`;
            document.querySelectorAll('.avatar-opt').forEach(el => { el.classList.remove('selected'); if(el.src === userAvatar) el.classList.add('selected'); });
            renderAddresses();
        }
    }).catch(err => console.error("Cloudflare Profile Sync Warning:", err));
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
    session.avatar = userAvatar;

    localStorage.setItem('active_session', JSON.stringify(session));

    try {
        updateUserDataAPI(session.email, {
            name: session.name, phone: session.phone, address: session.address, city: session.city, state: session.state, pincode: session.pincode, avatar: userAvatar
        });
        document.getElementById('sidebarUser').innerText = session.name;
        document.getElementById('accountBtn').innerHTML = `<img src="${userAvatar}" class="nav-avatar" title="My Profile" style="margin-right: 8px;"> <span>${session.name.split(' ')[0]}</span>`;
        document.getElementById('sidebarAvatar').src = userAvatar;
        showAlert("Your details have been updated.", "Profile Saved"); 
    } catch(e) { showAlert("Error saving profile. Please check your connection."); }
};

window.saveNewAddress = async function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    const name = document.getElementById('newAddName').value; const phone = document.getElementById('newAddPhone').value; const add = document.getElementById('newAddText').value; const city = document.getElementById('newCity').value; const state = document.getElementById('newState').value; const pin = document.getElementById('newPin').value;
    if(!add || !pin || !name || !phone) return showAlert("Name, Phone, Address and Pincode are strictly required.");
    
    savedUserAddresses.push({ name: name, phone: phone, address: add, city: city, state: state, pincode: pin });
    
    session.addresses = savedUserAddresses;
    localStorage.setItem('active_session', JSON.stringify(session));

    try {
        updateUserDataAPI(session.email, { addresses: savedUserAddresses });
        document.getElementById('newAddName').value = ""; document.getElementById('newAddPhone').value = ""; document.getElementById('newAddText').value = ""; document.getElementById('newCity').value = ""; document.getElementById('newState').value = ""; document.getElementById('newPin').value = "";
        document.getElementById('newAddressForm').style.display = 'none'; renderAddresses(); 
        showAlert("New shipping address was saved successfully.", "Location Saved");
    } catch(e) { showAlert("Failed to save address."); }
};

window.removeAddress = async function(index) {
    showAlert("Are you sure you want to delete this address permanently?", "Confirm Deletion", true, async () => {
        const session = JSON.parse(localStorage.getItem('active_session')); 
        savedUserAddresses.splice(index, 1);
        session.addresses = savedUserAddresses; localStorage.setItem('active_session', JSON.stringify(session));
        updateUserDataAPI(session.email, { addresses: savedUserAddresses });
        renderAddresses(); showToast("Address Removed");
    });
}

window.editAddress = function(index) {
    const a = savedUserAddresses[index];
    document.getElementById('newAddName').value = a.name || ""; document.getElementById('newAddPhone').value = a.phone || ""; document.getElementById('newAddText').value = a.address || ""; document.getElementById('newCity').value = a.city || ""; document.getElementById('newState').value = a.state || ""; document.getElementById('newPin').value = a.pincode || "";
    document.getElementById('newAddressForm').style.display = 'block'; 
    savedUserAddresses.splice(index, 1);
}

window.setAsDefault = function(index) {
    const a = savedUserAddresses[index];
    document.getElementById('accAddress').value = a.address || "";
    document.getElementById('accCity').value = a.city || "";
    document.getElementById('accState').value = a.state || "";
    document.getElementById('accPincode').value = a.pincode || "";
    saveProfileDetails(); showToast("Address set as Default.", 1500);
}

function renderAddresses() {
    const list = document.getElementById('addressList'); list.innerHTML = '';
    if(savedUserAddresses.length === 0) { list.innerHTML = '<p class="sub-text">No additional locations saved yet.</p>'; return; }
    savedUserAddresses.forEach((a, index) => {
        list.innerHTML += `
        <div class="address-item">
            <strong class="loc-title"><i class="fas fa-map-marker-alt" style="margin-right:8px;"></i> Location ${index + 1}</strong>
            <div style="font-size:14px; margin-bottom:8px;"><strong>${a.name || 'No Name'}</strong> | ${a.phone || 'No Phone'}</div>
            ${a.address}, ${a.city}, ${a.state} - <strong style="font-family: var(--font-mono);">${a.pincode}</strong>
            <div class="address-controls" style="flex-wrap: wrap;">
                <button class="btn-mini" onclick="setAsDefault(${index})"><i class="fas fa-star"></i> Default</button>
                <button class="btn-mini" onclick="editAddress(${index})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn-mini delete" onclick="removeAddress(${index})"><i class="fas fa-trash"></i> Drop</button>
            </div>
        </div>`;
    });
}

window.logOut = function() { localStorage.removeItem('active_session'); location.reload(); }

// --- 9. CHECKOUT & COUPON LOGIC ---

window.useDefaultAddress = function() {
    const session = JSON.parse(localStorage.getItem('active_session'));
    if(!session) return;
    document.getElementById('chkName').value = session.name || "";
    document.getElementById('chkPhone').value = session.phone || "";
    document.getElementById('chkAddress').value = session.address || "";
    document.getElementById('chkCity').value = session.city || "";
    document.getElementById('chkPincode').value = session.pincode || "";
    showToast("Profile address applied.", 1500);
};

window.openCheckoutFromCart = function() { history.back(); setTimeout(() => openCheckoutDirect(), 300); };
window.closeCheckout = function() { history.back(); }

window.openCheckoutDirect = async function() {
    if (cart.length === 0) return showAlert("Bag is empty.");
    const session = JSON.parse(localStorage.getItem('active_session'));
    if (!session) return showAlert("Please Login to proceed.", "Secure Checkout", false, () => document.getElementById('accountBtn').click());
    
    currentOrderState.discount = 0;
    walletAppliedAmount = 0; 
    window.currentCouponValue = 0;
    document.getElementById('couponToggle').style.display = 'flex';
    document.getElementById('couponBox').style.display = 'none';
    document.getElementById('couponChoiceBox').style.display = 'none';
    document.getElementById('couponMessage').style.display = 'none';
    document.getElementById('couponCode').value = '';
    document.getElementById('discountRow').style.display = 'none';

    if(document.getElementById('walletUseBtn')) {
        document.getElementById('walletUseBtn').innerHTML = `<i class="fas fa-wallet"></i> Use Wallet Balance (₹${walletBalance})`;
        document.getElementById('walletUseBtn').style.borderColor = 'var(--border)';
        document.getElementById('walletUseBtn').style.background = 'transparent';
        document.getElementById('walletUseBtn').style.display = walletBalance > 0 ? 'flex' : 'none';
    }

    openUI('fullCheckoutPage');
    document.getElementById('checkoutStep1').style.display = 'block';
    document.getElementById('checkoutStep2').style.display = 'none';
    window.useDefaultAddress();
    
    if (savedUserAddresses.length === 0) await initUserProfileAPI(session.email);
    renderCheckoutAddressesList();
};

function renderCheckoutAddressesList() {
    const chkList = document.getElementById('checkoutAddressList');
    chkList.innerHTML = '';
    
    if(savedUserAddresses.length > 0) {
        chkList.innerHTML = `<div class="divider-elegant text-center" style="margin-bottom: 15px;"><span class="bg-surface px-10" style="color:var(--text-muted); font-size:13px; text-transform:uppercase; font-weight:800;">Or Pick Alternate Address</span></div>`;
        savedUserAddresses.forEach((a, i) => {
            chkList.innerHTML += `
                <div class="address-item premium-hover" onclick="selectCheckoutAdd(${i})" style="margin-bottom:15px; cursor:pointer; padding: 20px;">
                    <strong class="loc-title" style="font-size:15px; margin-bottom:12px; display:block; border-bottom:1px dashed var(--border); padding-bottom:8px;"><i class="fas fa-map-marker-alt"></i> Location ${i + 1}</strong>
                    <div style="font-size:14px; font-weight:700; margin-bottom: 4px;">${a.name || ''}</div>
                    <div style="font-size:13px; color:var(--text-muted);">${a.address}, ${a.city} - ${a.pincode}</div>
                </div>`;
        });
    }
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; const dLat = (lat2 - lat1) * (Math.PI/180); const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

window.calculateShippingAndProceed = async function() {
    const pincode = document.getElementById('chkPincode').value;
    if(!pincode) return showAlert("Pincode is mandatory for shipping calculation.");
    toggleButtonState('calcShippingBtn', true, 'Calculating...');

    const session = JSON.parse(localStorage.getItem('active_session'));
    const baseShip = siteConfig.taxConfig.baseShipping || 60;
    const primeRad = siteConfig.taxConfig.primeRadius || 120;

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${pincode},+India`);
        const data = await res.json();
        let shippingFee = baseShip; 
        
        if (data && data.length > 0) {
            const distance = getDistanceFromLatLonInKm(BHAGALPUR_LAT, BHAGALPUR_LON, parseFloat(data[0].lat), parseFloat(data[0].lon));
            if (distance < 10) shippingFee = Math.round(baseShip * 0.2);
            else if (distance < 35) shippingFee = Math.round(baseShip * 0.5);
            else if (distance < 70) shippingFee = baseShip;
            else if (distance < primeRad) shippingFee = Math.round(baseShip * 1.5);
            else shippingFee = Math.round(baseShip * 2.5);
        }

        // PRIME PERK
        if(session && session.isPrime && shippingFee <= Math.round(baseShip * 1.5)) shippingFee = 0;

        currentOrderState.shippingCost = shippingFee;
        updateCheckoutMiniReceipt();
        
        document.getElementById('checkoutStep1').style.display = 'none'; document.getElementById('checkoutStep2').style.display = 'block';
    } catch(err) {
        currentOrderState.shippingCost = (session && session.isPrime) ? 0 : baseShip; 
        updateCheckoutMiniReceipt();
        document.getElementById('checkoutStep1').style.display = 'none'; document.getElementById('checkoutStep2').style.display = 'block';
    } finally { toggleButtonState('calcShippingBtn', false, 'Next Step <i class="fas fa-arrow-right"></i>'); }
};

window.toggleWalletCheckout = function() {
    if(walletBalance <= 0) return showAlert("Insufficient wallet balance.");
    const session = JSON.parse(localStorage.getItem('active_session'));
    const btn = document.getElementById('walletUseBtn');

    if(walletAppliedAmount > 0) {
        walletAppliedAmount = 0;
        btn.innerHTML = `<i class="fas fa-wallet"></i> Use Wallet Balance (₹${walletBalance})`;
        btn.style.borderColor = 'var(--border)';
        btn.style.background = 'transparent';
        updateCheckoutMiniReceipt();
    } else {
        if(session.walletPin) {
            let pinInput = prompt("Enter your 4-digit Wallet PIN:");
            if(pinInput !== session.walletPin) return showAlert("Incorrect Wallet PIN.");
        }
        
        const totalBeforeWallet = currentOrderState.itemsTotal + currentOrderState.shippingCost - currentOrderState.discount;
        walletAppliedAmount = Math.min(walletBalance, totalBeforeWallet);
        
        btn.innerHTML = `<i class="fas fa-check-circle"></i> Wallet Applied (-₹${walletAppliedAmount})`;
        btn.style.borderColor = 'var(--success)';
        btn.style.background = '#f0fdf4';
        updateCheckoutMiniReceipt();
    }
}

function updateCheckoutMiniReceipt() {
    currentOrderState.grandTotal = currentOrderState.itemsTotal + currentOrderState.shippingCost;
    
    let totalDeductions = currentOrderState.discount + walletAppliedAmount;
    currentOrderState.finalPayable = Math.max(0, currentOrderState.grandTotal - totalDeductions);

    document.getElementById('sumItems').innerText = `₹${currentOrderState.itemsTotal.toLocaleString('en-IN')}`;
    document.getElementById('sumShipping').innerText = `₹${currentOrderState.shippingCost.toLocaleString('en-IN')}`;
    
    if (totalDeductions > 0) {
        document.getElementById('discountRow').style.display = 'flex';
        let discountText = "";
        if(currentOrderState.discount > 0) discountText += `Promo: -₹${currentOrderState.discount} `;
        if(walletAppliedAmount > 0) discountText += `Wallet: -₹${walletAppliedAmount}`;
        
        document.getElementById('sumDiscount').innerText = discountText;
    } else {
        document.getElementById('discountRow').style.display = 'none';
    }
    
    document.getElementById('sumTotal').innerText = `₹${currentOrderState.finalPayable.toLocaleString('en-IN')}`;
}

// --- PROMO CODE ENGINE INTEGRATION ---
window.validateAndShowCouponChoice = async function() {
    const code = document.getElementById('couponCode').value.toUpperCase().trim();
    const msg = document.getElementById('couponMessage');
    const choiceBox = document.getElementById('couponChoiceBox');

    if(!code) return;

    msg.style.display = 'block';
    choiceBox.style.display = 'none';
    msg.style.color = 'var(--text-muted)';
    msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...';
    toggleButtonState('promoCheckBtn', true, 'Check');

    try {
        const response = await fetch(`${API_BASE_URL}/validate-promo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, cartTotal: currentOrderState.itemsTotal })
        });
        
        const result = await response.json();

        if (result.valid) {
            msg.style.display = 'none';
            choiceBox.style.display = 'block';
            window.currentCouponValue = result.discountAmount; 
            document.querySelector('#couponChoiceBox p').innerHTML = `<i class="fas fa-check-circle"></i> Valid! You got ₹${result.discountAmount} Off. Where do you want to apply it?`;
        } else {
            msg.style.color = 'var(--danger)';
            msg.innerText = result.message || "Invalid Promo Code.";
        }
    } catch (e) {
        msg.style.color = 'var(--danger)';
        msg.innerText = "Error checking promo code.";
    } finally {
        toggleButtonState('promoCheckBtn', false, 'Apply');
    }
};

window.applyCouponChoice = function(targetType) {
    const amountOff = window.currentCouponValue || 0; 
    const msg = document.getElementById('couponMessage');
    
    if (targetType === 'shipping') {
        let actualDeduction = Math.min(currentOrderState.shippingCost, amountOff);
        currentOrderState.discount = actualDeduction;
        msg.innerText = `Promo Applied! ₹${actualDeduction} deducted from Shipping Fee.`;
    } else {
        let actualDeduction = Math.min(currentOrderState.itemsTotal, amountOff);
        currentOrderState.discount = actualDeduction;
        msg.innerText = `Promo Applied! ₹${actualDeduction} deducted from Order Total.`;
    }
    
    msg.style.color = 'var(--success)';
    msg.style.display = 'block';
    document.getElementById('couponChoiceBox').style.display = 'none';
    
    updateCheckoutMiniReceipt();
};


window.processPayment = function() {
    const isCOD = document.querySelector('input[name="payMethod"]:checked').value === 'cod';
    const amountToPay = isCOD ? Math.max(0, currentOrderState.shippingCost - currentOrderState.discount - walletAppliedAmount) : currentOrderState.finalPayable;

    if (amountToPay === 0) {
        toggleButtonState('payBtn', true, 'Processing Order...');
        saveOrderToBackend(isCOD ? "COD_FREE_" + Date.now() : "PAID_FREE_" + Date.now(), isCOD ? "Cash On Delivery" : "Wallet / Full Discount");
        return;
    }

    toggleButtonState('payBtn', true, 'Initializing Gateway...');
    setTimeout(() => {
        const session = JSON.parse(localStorage.getItem('active_session'));
        const options = {
            "key": RAZORPAY_KEY, 
            "amount": amountToPay * 100, 
            "currency": "INR", 
            "name": "Aryanta",
            "description": isCOD ? "Shipping Charge (COD Balance Later)" : "Full Order Payment",
            "handler": function (response) { saveOrderToBackend(response.razorpay_payment_id, isCOD ? "Cash On Delivery" : "Online Full"); },
            "prefill": { "name": document.getElementById('chkName').value, "email": session.email, "contact": document.getElementById('chkPhone').value },
            "theme": { "color": "#0a0a0a" },
            "modal": { "ondismiss": function() { toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Pay Now'); } }
        };
        
        try {
            const rzp = new Razorpay(options); 
            rzp.on('payment.failed', function (response) { 
                toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Pay Now'); 
                showAlert(`Payment Failed: ${response.error.description}.`, "Transaction Failed"); 
            });
            rzp.open();
        } catch (error) { handleRzpCrash(error); }
    }, 100);
};

function handleRzpCrash(error) {
    toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Pay Now');
    showAlert("Failed to initialize Razorpay.", "System Error");
}

async function saveOrderToBackend(paymentId, paymentMethodStr) {
    const session = JSON.parse(localStorage.getItem('active_session')); 
    const orderNo = "ARY-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100); 
    const fullAddress = `${document.getElementById('chkAddress').value}, ${document.getElementById('chkCity').value} - ${document.getElementById('chkPincode').value}`;
    
    const usedCoupon = currentOrderState.discount > 0 ? document.getElementById('couponCode').value.toUpperCase().trim() : null;
    
    const orderData = { 
        order_no: orderNo, user_email: session.email, delivery_name: document.getElementById('chkName').value, 
        delivery_phone: document.getElementById('chkPhone').value, delivery_address: fullAddress, 
        items: cart, financials: currentOrderState, payment_method: paymentMethodStr, 
        razorpay_id: paymentId, status: "Confirmed", timestamp: new Date().toISOString(),
        applied_coupon: usedCoupon, wallet_deducted: walletAppliedAmount
    };
    
    toggleButtonState('payBtn', true, 'Processing...');
    try {
        await fetch(`${API_BASE_URL}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
        
        if (walletAppliedAmount > 0) {
            walletBalance -= walletAppliedAmount;
            await updateUserDataAPI(session.email, { wallet: walletBalance });
        }

        buildGloriousReceipt(orderData); cart = []; updateCartUI(); saveCart(); closeCheckout(); 
        setTimeout(() => { openUI('overlay'); openUI('orderSuccessModal'); }, 300);
    } catch (error) { showAlert("Order processed but receipt save failed via API. Screenshot this ID: " + paymentId, "Warning"); 
    } finally { toggleButtonState('payBtn', false, '<i class="fas fa-lock"></i> Pay Now'); }
}

function buildGloriousReceipt(data) {
    document.getElementById('recOrderNo').innerText = data.order_no; 
    document.getElementById('recPayMethod').innerText = data.payment_method; 
    document.getElementById('recAddress').innerText = data.delivery_address; 
    document.getElementById('recItemsTotal').innerText = `₹${data.financials.itemsTotal.toLocaleString('en-IN')}`; 
    document.getElementById('recShipping').innerText = `₹${data.financials.shippingCost.toLocaleString('en-IN')}`; 
    
    if (data.financials.discount > 0 || data.wallet_deducted > 0) {
        document.getElementById('recDiscountRow').style.display = 'flex';
        let discountText = "";
        if(data.financials.discount > 0) discountText += `Coupon: -₹${data.financials.discount} `;
        if(data.wallet_deducted > 0) discountText += `Wallet: -₹${data.wallet_deducted}`;
        document.getElementById('recDiscountAmount').innerText = discountText;
    }
    
    document.getElementById('recGrandTotal').innerText = `₹${data.financials.finalPayable.toLocaleString('en-IN')}`;
    
    const tbody = document.getElementById('recTableBody'); tbody.innerHTML = ''; let emailItemsText = ""; 
    data.items.forEach(item => { 
        tbody.innerHTML += `<tr><td>${item.name}</td><td class="mono-td">x${item.qty}</td><td class="text-right mono-td">₹${(item.price * item.qty).toLocaleString('en-IN')}</td></tr>`; 
        emailItemsText += `${item.name} (x${item.qty}) - Rs.${item.price * item.qty}\n`; 
    });
    
    try { emailjs.send("service_wnqvm4n", "template_5by2ldn", { 
        to_email: data.user_email, to_name: data.delivery_name, order_no: data.order_no, 
        address: data.delivery_address, items_list: emailItemsText, shipping: data.financials.shippingCost, 
        grand_total: data.financials.finalPayable 
    }).catch(err => console.log("Receipt email failed", err)); } catch(e) {}
}

window.closeOrderSuccess = function() { location.reload(); }

// 🔍 SEARCH SYSTEM
const searchInput = document.getElementById("searchInput");
const dropdown = document.getElementById("searchDropdown");
const clearBtn = document.getElementById("searchClearBtn");

let timeout;

clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    clearBtn.style.display = "none";
    dropdown.style.display = "none";
    
    const bannerContainer = document.querySelector('.banner-slider-container');
    if(bannerContainer) bannerContainer.style.display = "block";
    
    baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
    currentlyDisplayed = 0;
    document.getElementById("productShelf").innerHTML = "";
    loadMoreProducts();
});

searchInput.addEventListener("input", function () {
    clearTimeout(timeout);
    
    if(this.value.trim() !== "") {
        clearBtn.style.display = "block";
    } else {
        clearBtn.style.display = "none";
    }
    
    const bannerContainer = document.querySelector('.banner-slider-container');

    timeout = setTimeout(() => {
        const query = this.value.toLowerCase().trim();

        if (query === "") {
            if(bannerContainer) bannerContainer.style.display = "block"; 
            dropdown.innerHTML = "";
            dropdown.style.display = "none";
            baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
        } else {
            if(bannerContainer) bannerContainer.style.display = "none"; 
            
            const searchTerms = query.split(' ');
            const filtered = allProducts.filter(p => {
                const nameStr = p.name.toLowerCase();
                const tagsStr = (p.tags ? p.tags.join(" ") : "").toLowerCase();
                const brandStr = (p.brand || "").toLowerCase();
                return searchTerms.every(t => nameStr.includes(t) || tagsStr.includes(t) || brandStr.includes(t) || fuzzyMatch(nameStr, t));
            });

            if (filtered.length === 0) {
                baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
            } else {
                baseCategoryProducts = filtered;
            }

           dropdown.innerHTML = filtered.slice(0, 5).map(p => {
               let imgUrl = p.image || (p.images && p.images.length > 0 ? p.images[0] : 'https://via.placeholder.com/50');
               return `
                <div class="search-item" data-id="${p.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${imgUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;">
                    <span style="font-weight: 600; font-size: 14px; white-space: normal;">${p.name}</span>
                </div>
            `}).join("");

            dropdown.style.display = "block";
            baseCategoryProducts = filtered;
        }

        currentlyDisplayed = 0;
        document.getElementById("productShelf").innerHTML = "";
        loadMoreProducts();

    }, 300);
});

document.addEventListener("click", function(e) {
    const item = e.target.closest(".search-item");

    if (item) {
        const productId = item.getAttribute("data-id");
        searchInput.value = "";
        clearBtn.style.display = "none";
        dropdown.style.display = "none";
        
        const bannerContainer = document.querySelector('.banner-slider-container');
        if(bannerContainer) bannerContainer.style.display = "block";
        
        baseCategoryProducts = sortProductsByAdAndRandom(allProducts);
        currentlyDisplayed = 0;
        document.getElementById("productShelf").innerHTML = "";
        loadMoreProducts();

        openProductPage(productId); 
    } else {
        if (searchInput && dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target) && !clearBtn.contains(e.target)) {
            dropdown.style.display = "none";
            const bannerContainer = document.querySelector('.banner-slider-container');
            if (bannerContainer && searchInput.value.trim() === "") {
                bannerContainer.style.display = "block";
            }
        }
    }
});

window.addEventListener("scroll", function() {
    if (dropdown) {
        dropdown.style.display = "none";
    }
});

// INIT
fetchAppConfig();
checkSession(); 
fetchBanners(); 
fetchProducts();
listenForBroadcasts();
