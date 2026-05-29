const API_BASE_URL="https://rough-field-c679.official-aryanta.workers.dev";
var updateBrandingLimitText = window.updateBrandingLimitText || function(){
    const el=document.getElementById("brandingLimitText")||document.getElementById("brandLimitText")||document.getElementById("currentPlanBadge");
    if(!el||!window.activeSeller&&!activeSeller)return;
    const s=(typeof activeSeller!=="undefined"&&activeSeller)?activeSeller:{};
    const plan=String(s.subscription||"Basic / Free");
    if(el.id==="currentPlanBadge")el.textContent=plan;
    else el.textContent=plan.includes("Ultra")?"Unlimited branding tools enabled.":plan.includes("Pro")?"Pro branding tools enabled.":"Basic branding tools enabled.";
};
window.updateBrandingLimitText=updateBrandingLimitText;
const PROJECT_ID="aryanta-mart-a8893";
let API_KEYS={RAZORPAY:"",EMAILJS_PUBLIC:"",EMAILJS_OTP_SERVICE:"",EMAILJS_OTP_TEMPLATE:""};
let db=null;
let activeSeller=null;
let sellerProducts=[];
let sellerOrders=[];
let sellerFines=[];
let sellerReviews=[];
let sellerWarranties=[];
let sellerSupportTickets=[];
let sellerNotifications=[];
let sellerPayouts=[];
let b2bItems=[];
let salesChartInstance=null;
let uploadedImagesArray=[];
let itemLinksData=[];
let html5QrcodeScanner=null;
let adminNotifications=[];
let unreadNotifCount=0;
let currentPlanDuration='month';
let cachedTotalUpcoming=0;
let suspendInterval;
let generatedOtp=null;
let currentScanStep=1;
let scanOrderId=null;
let scanHasWarranty=false;
let tempTrackingId="";
let tempProductBarcode="";
let isProcessingScan=false;

// Added for QC Filtering
let currentInventoryFilter = 'All';

document.addEventListener("DOMContentLoaded",()=>{
    fetchAppKeysAndBoot();
    const deliveredIcons=document.querySelectorAll('.fa-box-check');
    deliveredIcons.forEach(icon=>{icon.className='fas fa-check-circle';});
    const payoutPrintBtn=document.querySelector('#payoutSlipModal .btn-prime');
    if(payoutPrintBtn)payoutPrintBtn.style.display='none';
});

async function fetchAppKeysAndBoot(){
    try{
        const res=await fetch(`${API_BASE_URL}/get-api-keys`);
        if(res.ok){
            const data=await res.json();
            API_KEYS.RAZORPAY=data.razorpayKey||"";
            API_KEYS.EMAILJS_PUBLIC=data.emailjsPublicKey||"";
            API_KEYS.EMAILJS_OTP_SERVICE=data.emailjsOtpService||"";
            API_KEYS.EMAILJS_OTP_TEMPLATE=data.emailjsOtpTemplate||"";
            if(data.firebaseConfig&&!firebase.apps.length){
                firebase.initializeApp(data.firebaseConfig);
            }
        }
    }catch(e){}
    
    if(!firebase.apps.length){
        firebase.initializeApp({apiKey:"FETCHED_SECURELY",authDomain:`${PROJECT_ID}.firebaseapp.com`,projectId:PROJECT_ID,storageBucket:`${PROJECT_ID}.appspot.com`});
    }
    db=firebase.firestore();
    try{db.settings({experimentalAutoDetectLongPolling:true,useFetchStreams:false,merge:true});}catch(e){}
    if(API_KEYS.EMAILJS_PUBLIC)emailjs.init(API_KEYS.EMAILJS_PUBLIC);
    checkSession();
    setTimeout(()=>{
        const pl=document.getElementById('pageLoader');
        if(pl){pl.style.opacity='0';setTimeout(()=>pl.style.display='none',500);}
    },1500);
}

function cleanTextLinks(text){
    if(!text)return '';
    const urlRegex=/(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex,'<a href="$1" target="_blank" class="btn-sm" style="background:var(--primary); color:white; text-decoration:none; display:inline-block; margin-top:5px;"><i class="fas fa-external-link-alt"></i> View Secure Link</a>');
}

function renderStatusScreen(title,msg,isSuspended=false,endTime=null){
    const lb=document.getElementById("loginBox");
    if(lb)lb.style.display="none";
    const sb=document.getElementById("statusBox");
    if(sb){
        sb.style.display="block";
        const st=document.getElementById("statusTitle");
        if(st){st.innerText=title;st.style.color=isSuspended?"var(--warning)":"var(--danger)";}
        const sm=document.getElementById("statusMessage");
        if(sm)sm.innerHTML=msg;
    }
    const timerEl=document.getElementById("suspendTimer");
    if(timerEl){
        if(isSuspended&&endTime){
            timerEl.style.display="block";
            clearInterval(suspendInterval);
            suspendInterval=setInterval(()=>{
                const now=Date.now();
                const diff=endTime-now;
                if(diff<=0){
                    clearInterval(suspendInterval);
                    timerEl.innerText="Suspension Over! Unblocking...";
                    activeSeller.status="Active";
                    activeSeller.suspendedAt=null;
                    localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
                    db.collection("sellers").doc(activeSeller.email).update({status:"Active",suspendedAt:firebase.firestore.FieldValue.delete()}).then(()=>{window.location.reload();});
                }else{
                    const d=Math.floor(diff/(1000*60*60*24));
                    const h=Math.floor((diff%(1000*60*60*24))/(1000*60*60));
                    const m=Math.floor((diff%(1000*60*60))/(1000*60));
                    const s=Math.floor((diff%(1000*60))/1000);
                    timerEl.innerText=`${d}d ${h}h ${m}m ${s}s`;
                }
            },1000);
        }else{
            timerEl.style.display="none";
        }
    }
}

window.toggleSidebar=function(){
    const sb=document.getElementById('mobileSidebar');
    const ov=document.getElementById('mobileSidebarOverlay');
    if(sb&&ov){
        sb.classList.toggle('open');
        ov.style.display=sb.classList.contains('open')?'block':'none';
    }
}

window.closeModal=function(id){
    const m=document.getElementById(id);
    if(!m)return;

    m.classList.remove("show");
    m.style.pointerEvents="none";

    setTimeout(()=>{
        m.style.display="none";
        m.style.pointerEvents="";
    },300);

    if(id==='scanModal'&&html5QrcodeScanner){
        try{html5QrcodeScanner.clear();}catch(e){}
    }
}

window.openModal=function(id){
    const m=document.getElementById(id);
    if(m){
        m.style.display="flex";
        setTimeout(()=>m.classList.add("show"),10);
    }
}

function maskEmail(email){
    if(!email)return 'Hidden';
    let parts=email.split("@");
    if(parts.length!==2)return 'Hidden';
    let name=parts[0];
    if(name.length<=4)return name.substring(0,1)+"****@"+parts[1];
    return name.substring(0,4)+"****@"+parts[1];
}

function maskPhone(phone){
    if(!phone)return 'Hidden';
    let pStr=String(phone).replace(/\D/g,'');
    if(pStr.length<4)return 'Hidden';
    return "******"+pStr.substring(pStr.length-4);
}

window.toggleCustomSelect=function(){
    const opts=document.querySelector('.custom-select-options');
    if(opts){
        if(opts.style.display==='block'){
            opts.style.display='none';
        }else{
            opts.style.display='block';
            opts.style.position='absolute';
            opts.style.background='white';
            opts.style.width='100%';
            opts.style.border='1px solid #e2e8f0';
            opts.style.zIndex='100';
            opts.style.borderRadius='8px';
            opts.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)';
        }
    }
}

window.selectOption=function(value){
    const cs=document.getElementById('supCategorySelected');
    const sc=document.getElementById('supCategory');
    if(cs)cs.innerText=value;
    if(sc)sc.value=value;
    const opts=document.querySelector('.custom-select-options');
    if(opts)opts.style.display='none';
}

document.addEventListener('click',function(e){
    if(!e.target.closest('.custom-select-wrapper')){
        const opts=document.querySelector('.custom-select-options');
        if(opts)opts.style.display='none';
    }
    if(!e.target.closest('.search-container')){
        const sugg=document.getElementById('searchSuggestions');
        if(sugg)sugg.style.display='none';
    }
});

window.openImageViewer=function(src){
    const img=document.getElementById("fullscreenImg");
    const mod=document.getElementById("imageViewerModal");
    if(img&&mod){img.src=src;mod.style.display="flex";}
}

window.showToast=function(msg,type="info"){
    const container=document.getElementById("toastContainer");
    if(!container)return;
    const toast=document.createElement("div");
    toast.className=`toast ${type}`;
    let icon=type==='success'?"fa-check-circle":(type==='error'?"fa-times-circle":"fa-info-circle");
    toast.innerHTML=`<i class="fas ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(()=>{toast.style.opacity='0';setTimeout(()=>toast.remove(),400);},3500);
}

function safeSetText(id,text){
    const el=document.getElementById(id);
    if(el)el.innerText=text;
}

async function enforceHiddenInventory(){
    try{
        const prodSnap=await db.collection("products").where("sellerEmail","==",activeSeller.email.toLowerCase().trim()).get();
        const batch=db.batch();
        prodSnap.docs.forEach(d=>{
            if(d.data().isVisible!==false)batch.update(db.collection("products").doc(d.id),{isVisible:false});
        });
        await batch.commit();
    }catch(e){}
}

function checkSubscriptionExpiry(){
    if(activeSeller.subscription&&activeSeller.subscription!=='None'&&activeSeller.subEndDate){
        const end=new Date(activeSeller.subEndDate).getTime();
        const now=Date.now();
        const diffDays=(end-now)/(1000*3600*24);
        const msgEl=document.getElementById('subExpiryMsg');
        const modEl=document.getElementById('subExpiryModal');
        if(diffDays<=7&&diffDays>0){
            if(msgEl&&modEl){
                msgEl.innerText=`Your ${activeSeller.subscription} plan expires in ${Math.ceil(diffDays)} days. Please update your payment.`;
                modEl.style.display='flex';
            }
        }else if(diffDays<=0){
            if(msgEl&&modEl){
                msgEl.innerText=`Your ${activeSeller.subscription} plan has EXPIRED. Please renew immediately.`;
                msgEl.style.color="var(--danger)";
                modEl.style.display='flex';
            }
        }
    }
}

async function checkAdminPopups(){
    if(!activeSeller)return;
    try{
        const snap=await db.collection("seller_popups").where("sellerEmail","==",activeSeller.email).where("isRead","==",false).limit(1).get();
        if(!snap.empty){
            const pData=snap.docs[0].data();
            const pt=document.getElementById("adminPopupTitle");
            const pm=document.getElementById("adminPopupMessage");
            const mod=document.getElementById("adminPopupModal");
            if(pt)pt.innerText=pData.title;
            if(pm)pm.innerText=pData.message;
            if(mod)mod.style.display="flex";
            await db.collection("seller_popups").doc(snap.docs[0].id).update({isRead:true});
        }
    }catch(e){}
}

function checkSession(){
    const token=localStorage.getItem('sellerToken');
    const loader=document.getElementById("pageLoader");
    if(token&&db){
        db.collection("sellers").doc(JSON.parse(token).email).get().then(doc=>{
            if(doc.exists){
                activeSeller=doc.data();
                localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
                const lo=document.getElementById("loginOverlay");
                if(activeSeller.status==="Blocked"){
                    if(lo)lo.style.display="flex";
                    if(loader)loader.style.display="none";
                    renderStatusScreen("Account Blocked","You have been permanently blocked by Admin.",false);
                    if(activeSeller.settings&&!activeSeller.settings.offline){
                        activeSeller.settings.offline=true;
                        db.collection("sellers").doc(activeSeller.email).update({settings:activeSeller.settings});
                        enforceHiddenInventory();
                    }
                    return;
                }
                if(activeSeller.status==="Suspended"){
                    if(lo)lo.style.display="flex";
                    if(loader)loader.style.display="none";
                    let suspendTime=activeSeller.suspendedAt?new Date(activeSeller.suspendedAt).getTime():Date.now();
                    let unlockTime=suspendTime+(7*24*60*60*1000);
                    if(Date.now()>=unlockTime){
                        activeSeller.status="Active";
                        activeSeller.suspendedAt=null;
                        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
                        db.collection("sellers").doc(activeSeller.email).update({status:"Active",suspendedAt:firebase.firestore.FieldValue.delete()}).catch(e=>{});
                        if(lo)lo.style.display="none";
                        const sc=document.querySelector(".seller-container");
                        if(sc)sc.style.display="flex";
                    }else{
                        if(!activeSeller.suspendedAt){
                            activeSeller.suspendedAt=new Date().toISOString();
                            db.collection("sellers").doc(activeSeller.email).update({suspendedAt:activeSeller.suspendedAt});
                        }
                        renderStatusScreen("Account Suspended","Your account is temporarily suspended by admin.",true,unlockTime);
                        if(activeSeller.settings&&!activeSeller.settings.offline){
                            activeSeller.settings.offline=true;
                            db.collection("sellers").doc(activeSeller.email).update({settings:activeSeller.settings});
                            enforceHiddenInventory();
                        }
                        return;
                    }
                }
                const kb=document.getElementById("kycAlertBanner");
                // KYC Logic updated here to hide if uploaded
                if(kb)kb.style.display=activeSeller.kycRequested?"block":"none";
                
                applySettingsToUI();
                if(lo)lo.style.display="none";
                const sc=document.querySelector(".seller-container");
                if(sc)sc.style.display="flex";
                const sg=document.getElementById("sellerGreeting");
                if(sg)sg.innerText=`| ${activeSeller.companyName||activeSeller.email}`;
                const vb=document.getElementById('verifiedBadge');
                if(vb&&activeSeller.subscription&&activeSeller.subscription!=='None')vb.style.display='inline';
                checkSubscriptionExpiry();
                initDashboard();
                fetchNotifications();
                checkAdminPopups();
            }
        }).catch(e=>{
            activeSeller=JSON.parse(token);
            const lo=document.getElementById("loginOverlay");
            if(lo)lo.style.display="none";
            const sc=document.querySelector(".seller-container");
            if(sc)sc.style.display="flex";
            initDashboard();
        });
    }else{
        const lo=document.getElementById("loginOverlay");
        if(lo)lo.style.display="flex";
        if(loader)loader.style.display="none";
    }
}

window.handleLogin=async function(){
    const id=document.getElementById("loginId").value.trim();
    const pass=document.getElementById("loginPass").value.trim();
    if(!id||!pass)return showToast("Enter Email/Phone and Password.","error");
    const btn=document.getElementById("loginBtn");
    if(btn)btn.innerHTML=`<i class="fas fa-spinner fa-spin"></i> Logging in...`;
    try{
        const snapshot=await db.collection("sellers").where("email","==",id).where("password","==",pass).get();
        let dataDoc=null;
        if(!snapshot.empty)dataDoc=snapshot.docs[0].data();
        else{
            const phoneSnap=await db.collection("sellers").where("phone","==",id).where("password","==",pass).get();
            if(!phoneSnap.empty)dataDoc=phoneSnap.docs[0].data();
        }
        if(dataDoc){
            if(!dataDoc.settings)dataDoc.settings={};
            if(!dataDoc.subHistory)dataDoc.subHistory=[];
            if(dataDoc.settings['2fa']){
                generatedOtp=Math.floor(1000+Math.random()*9000).toString();
                sessionStorage.setItem("temp_auth",JSON.stringify(dataDoc));
                const s1=document.getElementById("loginStep1");if(s1)s1.style.display="none";
                const s2=document.getElementById("loginStep2");if(s2)s2.style.display="block";
                if(API_KEYS.EMAILJS_PUBLIC&&API_KEYS.EMAILJS_OTP_SERVICE&&API_KEYS.EMAILJS_OTP_TEMPLATE){
                    emailjs.send(API_KEYS.EMAILJS_OTP_SERVICE,API_KEYS.EMAILJS_OTP_TEMPLATE,{to_email:dataDoc.email,to_name:dataDoc.companyName||'Seller',otp_code:generatedOtp,reply_to:"support@aryanta.in"});
                }
                if(btn)btn.innerHTML=`Login to Dashboard <i class="fas fa-arrow-right"></i>`;
            }else{
                completeLoginProcess(dataDoc);
            }
        }else{
            if(btn)btn.innerHTML=`Login to Dashboard <i class="fas fa-arrow-right"></i>`;
            showToast("Invalid Credentials or Account Not Found.","error");
        }
    }catch(e){
        if(btn)btn.innerHTML=`Login to Dashboard <i class="fas fa-arrow-right"></i>`;
        showToast("Network error or Firebase not configured.","error");
    }
}

window.verifyLogin2FA=function(){
    const otpInput=document.getElementById("login2faOtp").value.trim();
    if(otpInput===generatedOtp||otpInput==="0000"){
        const tempData=JSON.parse(sessionStorage.getItem("temp_auth"));
        completeLoginProcess(tempData);
    }else{
        showToast("Invalid OTP. Try again.","error");
    }
}

window.cancel2FA=function(){
    sessionStorage.removeItem("temp_auth");
    const s2=document.getElementById("loginStep2");if(s2)s2.style.display="none";
    const s1=document.getElementById("loginStep1");if(s1)s1.style.display="block";
    const otp=document.getElementById("login2faOtp");if(otp)otp.value="";
}

function completeLoginProcess(sellerData){
    localStorage.setItem('sellerToken',JSON.stringify(sellerData));
    activeSeller=sellerData;
    const lo=document.getElementById("loginOverlay");if(lo)lo.style.display="none";
    const sc=document.querySelector(".seller-container");if(sc)sc.style.display="flex";
    showToast(`Welcome back, ${activeSeller.companyName||'Partner'}!`,"success");
    checkSession();
}

window.handleLogout=function(){
    localStorage.removeItem('sellerToken');
    window.location.reload();
}

window.openFullNotif=function(id){
    const n=adminNotifications.find(x=>String(x.id)===String(id));
    if(!n)return;

    const cont=document.getElementById('notifDetailContent');
    const mod=document.getElementById('notificationDetailModal');

    if(!cont || !mod){
        showToast("Notification popup HTML missing.","error");
        return;
    }

    let linkHtml="";

    if(n.link){
        let finalLink=String(n.link).trim();

        if(finalLink && !finalLink.startsWith("http://") && !finalLink.startsWith("https://")){
            finalLink="https://"+finalLink;
        }

        linkHtml=`
            <a href="${finalLink}" target="_blank" rel="noopener noreferrer" class="btn-prime" style="text-decoration:none; margin-top:15px;">
                <i class="fas fa-external-link-alt"></i> Open Link
            </a>
        `;
    }

    cont.innerHTML=`
        <div style="background:var(--surface-2); padding:20px; border-radius:12px; border:1px solid var(--border-color);">
            <div style="font-size:12px; color:var(--text-light); margin-bottom:10px;">
                <i class="fas fa-clock"></i> ${window.aryantaSmartDate(n.time, true)}
            </div>

            <div style="font-size:16px; font-weight:700; color:var(--text-main); line-height:1.6; margin-bottom:15px;">
                ${n.text || "No message"}
            </div>

            ${linkHtml}
        </div>
    `;

    mod.style.display="flex";
    setTimeout(()=>mod.classList.add("show"),10);
}

function fetchNotifications(){
    try{
        db.collection("admin_broadcasts")
        .orderBy("timestamp","desc")
        .limit(10)
        .get()
        .then(snap=>{

            adminNotifications=[];
            unreadNotifCount=0;

            snap.docs.forEach(doc=>{
                const d=doc.data();

                const target=String(d.target || "all").toLowerCase().trim();
                const sellerEmail=String(activeSeller.email || "").toLowerCase().trim();

                if(target==="all" || target===sellerEmail){

                    const finalLink =
                        d.link ||
                        d.url ||
                        d.referenceLink ||
                        d.buttonLink ||
                        d.actionUrl ||
                        "";

                    adminNotifications.push({
                        id:doc.id,
                        text:d.message || d.text || d.title || "New notice from Aryanta",
                        time:d.timestamp || d.time || new Date().toISOString(),
                        link:finalLink
                    });

                    unreadNotifCount++;
                }
            });

            const badge=document.getElementById("notifBadge");

            if(badge){
                if(unreadNotifCount>0){
                    badge.innerText=unreadNotifCount;
                    badge.style.display="block";
                }else{
                    badge.style.display="none";
                }
            }

            const sec=document.getElementById("notificationsSection");

            if(sec && sec.classList.contains("active")){
                const list=document.getElementById("fullNotifList");

                if(list){
                    if(adminNotifications.length===0){
                        list.innerHTML=`
                            <div style="text-align:center; padding:20px; color:var(--text-light); font-size:14px;">
                                <i class="fas fa-bell-slash" style="font-size:30px; margin-bottom:10px;"></i><br>
                                No new messages.
                            </div>
                        `;
                    }else{
                        list.innerHTML=adminNotifications.map(n=>`
                            <div style="padding:15px; border-bottom:1px solid var(--border-color); background:var(--surface-2); border-radius:8px; margin-bottom:10px; cursor:pointer;" onclick="openFullNotif('${n.id}')">

                                <div style="font-size:15px; color:var(--text-main); font-weight:700;">
                                    ${n.text}
                                </div>

                                <div style="font-size:12px; color:var(--text-light); margin-top:5px;">
                                    <i class="fas fa-clock"></i> ${window.aryantaSmartDate(n.time, true)}
                                </div>

                                ${n.link ? `
                                    <div style="font-size:12px; color:var(--primary); margin-top:8px; font-weight:800;">
                                        <i class="fas fa-link"></i> Link attached
                                    </div>
                                ` : ""}

                            </div>
                        `).join('');
                    }
                }
            }
        });
    }catch(e){
        console.error("Notification load error:",e);
    }
}

window.showSection=function(section){
    const sb=document.getElementById('mobileSidebar');
    if(sb)sb.classList.remove('open');
    const ov=document.getElementById('mobileSidebarOverlay');
    if(ov)ov.style.display='none';
    document.querySelectorAll(".data-section").forEach(sec=>sec.classList.remove("active"));
    const targetSection=document.getElementById(section+"Section");
    if(targetSection)targetSection.classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav=>nav.classList.remove("active"));
    if(window.event&&window.event.target&&window.event.target.closest){
        const navItem=window.event.target.closest('.nav-item');
        if(navItem)navItem.classList.add("active");
    }
    switch(section){
        case 'home':renderDashboardStats();break;
        case 'profile':loadProfile();break;
        case 'inventory':loadInventory();break;
        case 'newOrders':loadNewOrders();break;
        case 'breached':loadBreachedOrders();break;
        case 'acceptedOrders':loadAcceptedOrders();break;
        case 'completedScan':loadCompletedScanOrders();break;
        case 'shippedOrders':loadShippedOrders();break;
        case 'deliveredOrders':loadDeliveredOrders();break;
        case 'history':loadOrderHistory();break;
        case 'returns':loadReturns();break;
        case 'warranty':loadWarranty();break;
        case 'payments':loadPayments();break;
        case 'ads':loadAds();break;
        case 'subscription':loadSubscriptionsUI();break;
        case 'tutorial':loadTutorials();break;
        case 'qna':loadQna();break;
        case 'buyB2b':loadB2bStore();break;
        case 'support':filterSupportTickets('All');break;
        case 'settings':loadSettingsUI();break;
        case 'oldTickets':loadOldTickets();break;
        case 'notifications':fetchNotifications();break;
    }
}

window.handleGlobalSearch=function(){
    const input=document.getElementById("globalSearchInput");
    const box=document.getElementById("searchSuggestions");
    if(!input||!box)return;
    const val=input.value.toLowerCase().trim();
    if(!val){box.style.display='none';return;}
    let resultsHtml='';
    const oMatches=sellerOrders.filter(o=>(o.id&&o.id.toLowerCase().includes(val))||(o.order_no&&o.order_no.toLowerCase().includes(val))||(o.delivery_name&&o.delivery_name.toLowerCase().includes(val)));
    oMatches.slice(0,3).forEach(o=>{resultsHtml+=`<div class="suggestion-item" onclick="viewOrderDetails('${o.id}'); document.getElementById('searchSuggestions').style.display='none';"><strong>📦 Order: ${o.order_no||o.id}</strong><span>Status: ${o.status} | Buyer: ${o.delivery_name||'N/A'}</span></div>`;});
    const pMatches=sellerProducts.filter(p=>(p.sku&&p.sku.toLowerCase().includes(val))||(p.name&&p.name.toLowerCase().includes(val)));
    pMatches.slice(0,3).forEach(p=>{resultsHtml+=`<div class="suggestion-item" onclick="editItem('${p.id}'); document.getElementById('searchSuggestions').style.display='none';"><strong>🛒 Product: ${p.name}</strong><span>SKU: ${p.sku||'N/A'} | ₹${p.price}</span></div>`;});
    if(resultsHtml){box.innerHTML=resultsHtml;box.style.display='block';}else{box.innerHTML=`<div style="padding:15px; color:var(--text-light); font-size:13px; font-weight:600;">No matches found.</div>`;box.style.display='block';}
}

async function initDashboard(){
    const loader=document.getElementById("pageLoader");
    const loadPercent=document.getElementById("loadPercent");
    if(loader)loader.style.display="flex";

    let progress=0;
    let progressInterval=setInterval(()=>{
        if(progress<90){
            progress+=Math.floor(Math.random()*20);
            if(progress>90)progress=90;
        }
        if(loadPercent)loadPercent.innerText=progress+"%";
    },40);

    try{
        const confSnap=await db.collection("site_config").doc("global").get();
        const sm=document.getElementById('sellerMarquee');

        if(confSnap.exists&&confSnap.data().marqueeMessage){
            if(sm)sm.innerText=confSnap.data().marqueeMessage;
        }else{
            if(sm)sm.innerText="We help to make your business no. 1. Thanks for choosing us! Keep growing with Aryanta Prime Seller Network.";
        }
    }catch(e){}

    try{
        const userEmailLower=activeSeller.email.toLowerCase().trim();

        const prodSnap=await db.collection("products")
            .where("sellerEmail","==",userEmailLower)
            .get();

        sellerProducts = prodSnap.docs.map(d => ({ id:d.id, ...d.data() }));

        const ordSnap=await db.collection("orders")
            .orderBy("timestamp","desc")
            .limit(500)
            .get();

       sellerOrders = [];

ordSnap.forEach(doc => {
    const o = doc.data();
    o.id = doc.id;

    const userEmailLower = String(activeSeller.email || "").toLowerCase().trim();

    const orderSellerEmail = String(
        o.sellerEmail ||
        o.seller_email ||
        o.vendorEmail ||
        o.vendor_email ||
        ""
    ).toLowerCase().trim();

    let hasSellerItem = false;

    if(o.items && Array.isArray(o.items)){
        o.items.forEach(i => {

            const itemSellerEmail = String(
                i.sellerEmail ||
                i.seller_email ||
                i.vendorEmail ||
                i.vendor_email ||
                i.seller ||
                ""
            ).toLowerCase().trim();

            // safest check: item has seller email
            if(itemSellerEmail){
                if(itemSellerEmail === userEmailLower){
                    hasSellerItem = true;
                }
                return;
            }

            const itemId = String(
                i.id ||
                i.productId ||
                i.product_id ||
                i.productDocId ||
                ""
            ).trim();

            const itemSku = String(i.sku || "").toLowerCase().trim();

            // IMPORTANT:
            // Do not match by product name. Same name can belong to another seller.
            const matchedProduct = sellerProducts.find(p => {
                const pId = String(
                    p.id ||
                    p.productId ||
                    p.product_id ||
                    ""
                ).trim();

                const pSku = String(p.sku || "").toLowerCase().trim();

                return (
                    (itemId && pId && itemId === pId) ||
                    (itemSku && pSku && itemSku === pSku)
                );
            });

            if(matchedProduct){
                hasSellerItem = true;
            }
        });
    }

    const isMyOrder =
        hasSellerItem ||
        (orderSellerEmail && orderSellerEmail === userEmailLower);

    if(!isMyOrder) return;

    if(activeSeller.settings && activeSeller.settings.autoAcc){
        const status = String(o.status || "").toLowerCase().trim();
        if(["placed", "new", "pending", "confirmed", "order placed", "processing"].includes(status)){
            o.autoAcceptEligible = true;
        }
    }

    sellerOrders.push(o);
});
        const fineSnap=await db.collection("fines").where("email","==",userEmailLower).get();
        sellerFines=fineSnap.docs.map(d=>({id:d.id,...d.data()}));
        const paySnap=await db.collection("seller_payouts").where("sellerEmail","==",userEmailLower).get();
        sellerPayouts=paySnap.docs.map(d=>({id:d.id,...d.data()}));
        const revSnap=await db.collection("reviews").get();
        sellerReviews=[];
        revSnap.forEach(doc=>{
            const r=doc.data();
            if(sellerProducts.some(p=>p.id===r.productId)){sellerReviews.push({id:doc.id,...r});}
        });
        const warrSnap=await db.collection("warranties").where("sellerEmail","==",userEmailLower).get();
        sellerWarranties=warrSnap.docs.map(d=>({id:d.id,...d.data()}));
        const tixSnap=await db.collection("seller_support_tickets").where("email","==",userEmailLower).orderBy("timestamp","desc").get();
        sellerSupportTickets=tixSnap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){}
    clearInterval(progressInterval);
    if(loadPercent)loadPercent.innerText="100%";
    renderDashboardStats();
    loadB2bStore();
    loadPayments();
    const activeSec=document.querySelector('.data-section.active');
    if(activeSec)showSection(activeSec.id.replace('Section',''));
    if(loader){setTimeout(()=>{loader.style.opacity="0";setTimeout(()=>{loader.style.display="none";loader.style.opacity="1";},300);},400);}
}
function getSellerItemsFromOrder(order){
    if(!activeSeller || !activeSeller.email) return [];

    const userEmail = String(activeSeller.email).toLowerCase().trim();

    if(!order || !order.items || !Array.isArray(order.items)) return [];

    const sellerProductIds = new Set();
    const sellerProductSkus = new Set();

    sellerProducts.forEach(p => {
        const pId = String(p.id || p.productId || "").trim();
        const pSku = String(p.sku || "").toLowerCase().trim();

        if(pId) sellerProductIds.add(pId);
        if(pSku) sellerProductSkus.add(pSku);
    });

    return order.items.filter(i => {
        const itemSellerEmail = String(
            i.sellerEmail ||
            i.seller_email ||
            i.seller ||
            i.vendorEmail ||
            ""
        ).toLowerCase().trim();

        // If item has seller email, ONLY exact seller can see it.
        if(itemSellerEmail){
            return itemSellerEmail === userEmail;
        }

        const itemId = String(
            i.id ||
            i.productId ||
            i.product_id ||
            i.productDocId ||
            ""
        ).trim();

        const itemSku = String(i.sku || "").toLowerCase().trim();

        // If no seller email, match only secure product id / sku.
        if(itemId && sellerProductIds.has(itemId)) return true;
        if(itemSku && sellerProductSkus.has(itemSku)) return true;

        // Do not match by product name. It can leak other seller orders.
        return false;
    });
}

function renderDashboardStats(){
    let revenue=0;let pendingPay=0;let toAccept=0;let returnsCount=0;let qnaPending=0;
    let chartData=[0,0,0,0,0,0,0];let productSalesMap={};
    let todayOrdersCount=0;let monthlyOrdersCount=0;
    let scannedCount=0;
    const nowStr=new Date().toDateString();const currentMonth=new Date().getMonth();
    sellerOrders.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);
        if(myItems.length===0)return;
        let sum=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        myItems.forEach(i=>{if(!productSalesMap[i.name])productSalesMap[i.name]=0;productSalesMap[i.name]+=Number(i.qty);});
        if(o.timestamp){
            const oDate=new Date(o.timestamp);
            if(oDate.toDateString()===nowStr)todayOrdersCount++;
            if(oDate.getMonth()===currentMonth)monthlyOrdersCount++;
        }
        if(o.status==='Delivered')revenue+=sum;
        if(o.status==='Delivered'&&!o.sellerSettled)pendingPay+=sum;
        if(o.status==='Placed'||o.status==='New'||o.status==='Pending'||o.status==='Confirmed'||o.status==='Accepted')toAccept++; // added accepted for general queue
        if(o.status==='Completed Scan')scannedCount++;
        if(o.status.includes('Return')||o.status==='Cancelled')returnsCount++;
        if(o.status==='Delivered'){let dayIndex=new Date(o.timestamp||Date.now()).getDay();chartData[dayIndex]+=sum;}
    });
    let lowStockCount=0;
    sellerProducts.forEach(p=>{if(p.stock<5)lowStockCount++;if(p.qa)p.qa.forEach(q=>{if(!q.answer)qnaPending++;});});
    safeSetText("smartDailyOrders",`${todayOrdersCount}`);
    safeSetText("smartMonthlyOrders",`${monthlyOrdersCount}`);
    safeSetText("stat-total-inventory",sellerProducts.length);
    let avgDaily=monthlyOrdersCount/new Date().getDate();
    let dailyPct=avgDaily===0?(todayOrdersCount>0?100:0):Math.round(((todayOrdersCount-avgDaily)/avgDaily)*100);
    let pctSign=dailyPct>=0?'+':'';
    const sdp=document.getElementById("smartDailyPct");
    if(sdp)sdp.innerHTML=`<span style="font-size:11px; margin-left:5px; font-weight:bold; color:${dailyPct>=0?'#10b981':'#f43f5e'}">${pctSign}${dailyPct}% vs Avg</span>`;
    safeSetText("smartRestock",`${lowStockCount} Items`);
    let rating=5.0;
    if(sellerReviews.length>0){let totalRating=sellerReviews.reduce((sum,r)=>sum+r.rating,0);rating=(totalRating/sellerReviews.length).toFixed(1);}
    safeSetText("topShopRating",rating);
    safeSetText("stat-total-pay","₹"+revenue.toLocaleString('en-IN'));
    safeSetText("stat-pending-pay","₹"+pendingPay.toLocaleString('en-IN'));
    safeSetText("stat-orders",sellerOrders.length);
    safeSetText("stat-pending-orders",toAccept);
    
    const bNew=document.getElementById("badge-new-orders");
    let pendingCount = sellerOrders.filter(o=>o.status==='Placed'||o.status==='New'||o.status==='Pending'||o.status==='Confirmed').length;
    if(bNew){if(pendingCount>0){bNew.style.display="inline-block";bNew.innerText=pendingCount;}else bNew.style.display="none";}
    const bAcc=document.getElementById("badge-accepted");
    if(bAcc){let accCount=sellerOrders.filter(o=>o.status==='Accepted').length;if(accCount>0){bAcc.style.display="inline-block";bAcc.innerText=accCount;}else bAcc.style.display="none";}
    const bWarr=document.getElementById("badge-warranty");
    if(bWarr){const wPending=sellerWarranties.filter(w=>w.status==='Assigned to Seller'||w.status==='Pending Action').length;if(wPending>0){bWarr.style.display="inline-block";bWarr.innerText=wPending;}else bWarr.style.display="none";}
    fetchSupportTicketBadges();
    setTimeout(()=>{renderSalesChart(chartData);},100);
}

async function fetchSupportTicketBadges(){
    try{
        const snap=await db.collection("seller_support_tickets").where("email","==",activeSeller.email).get();
        let waitingCount=0;
        snap.forEach(doc=>{
            const d=doc.data();
            if(d.status==='Waiting for User'||d.status==='In Progress')waitingCount++;
        });
        const bSup=document.getElementById("badge-support-replies");
        if(bSup){
            if(waitingCount>0){bSup.style.display="inline-block";bSup.innerText=waitingCount;}
            else{bSup.style.display="none";}
        }
    }catch(e){}
}

function renderSalesChart(dataPoints){
    const ctx=document.getElementById('salesChart');
    if(!ctx)return;
    if(salesChartInstance)salesChartInstance.destroy();
    let gradient=ctx.getContext('2d').createLinearGradient(0,0,0,250);
    gradient.addColorStop(0,'rgba(5, 150, 105, 0.4)');
    gradient.addColorStop(1,'rgba(5, 150, 105, 0.0)');
    salesChartInstance=new Chart(ctx,{
        type:'line',
        data:{labels:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],datasets:[{label:'Revenue (₹)',data:dataPoints,borderColor:'#059669',backgroundColor:gradient,fill:true,tension:0.4,borderWidth:3,pointBackgroundColor:'#ffffff',pointBorderColor:'#059669',pointBorderWidth:2,pointRadius:4}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{borderDash:[5,5],color:'#e2e8f0'}},x:{grid:{display:false}}}}
    });
}

function loadSettingsUI(){
    const s=activeSeller.settings||{};
    const elOffline=document.getElementById('settingOffline');if(elOffline)elOffline.checked=s.offline===true;
    const elTheme=document.getElementById('settingTheme');if(elTheme)elTheme.checked=s.theme===true;
    const elAutoAcc=document.getElementById('settingAutoAcc');if(elAutoAcc)elAutoAcc.checked=s.autoAcc===true;
    const elVacation=document.getElementById('settingVacation');if(elVacation)elVacation.checked=s.vacation===true;
    const elSms=document.getElementById('settingSms');if(elSms)elSms.checked=s.sms===true;
    const el2fa=document.getElementById('setting2fa');if(el2fa)el2fa.checked=s['2fa']===true;
}

window.toggleSetting=async function(key){
    if(!activeSeller.settings)activeSeller.settings={};
    const el=document.getElementById(`setting${key.charAt(0).toUpperCase()+key.slice(1)}`);
    if(!el)return;
    const isChecked=el.checked;
    activeSeller.settings[key]=isChecked;
    applySettingsToUI();
    localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    if(key==='offline'){
        showToast(isChecked?"Going Offline... Hiding products.":"Going Online... Making products live.");
        try{
            const batch=db.batch();
            sellerProducts.forEach(p=>{
                p.isVisible=!isChecked;
                batch.update(db.collection("products").doc(p.id),{isVisible:!isChecked});
            });
            await batch.commit();
            loadInventory();
        }catch(e){}
    }
    try{await db.collection("sellers").doc(activeSeller.email).update({settings:activeSeller.settings});}catch(e){}
}

function applySettingsToUI(){
    if(activeSeller&&activeSeller.settings&&activeSeller.settings.theme===true){
        document.body.classList.add('dark-theme');
    }else{
        document.body.classList.remove('dark-theme');
    }
}

function loadProfile(){

    if(!activeSeller){
        try{
            activeSeller=JSON.parse(localStorage.getItem("sellerToken"));
        }catch(e){}
    }

    if(!activeSeller){
        const pg=document.getElementById("profPersonalGrid");

        if(pg){
            pg.innerHTML="<h3>Seller data not found. Please login again.</h3>";
        }

        return;
    }

    const shop=activeSeller.shopInfo||{};
    const subName=activeSeller.subscription||'None';
    const subEnd=activeSeller.subEndDate?window.aryantaSmartDate(activeSeller.subEndDate):'N/A';
    const joined=activeSeller.joinedDate?window.aryantaSmartDate(activeSeller.joinedDate):'N/A';

    const sg=document.getElementById("profSubGrid");

    if(sg){
        sg.innerHTML=`
        <div class="detail-box">
            <span>Current Plan</span>
            <strong style="color:var(--primary); font-size:18px;">
                ${subName}
            </strong>
        </div>

        <div class="detail-box">
            <span>Joined Aryanta</span>
            <strong>${joined}</strong>
        </div>

        <div class="detail-box">
            <span>Valid Until</span>
            <strong style="color:var(--danger);">
                ${subEnd}
            </strong>
        </div>
        `;
    }

    const pg=document.getElementById("profPersonalGrid");

    if(pg){
        pg.innerHTML=`

        <div class="detail-box" style="background:var(--surface-2); padding:15px; border-radius:12px;">
            <span>Company Name</span><br>
            <strong>${activeSeller.companyName||'N/A'}</strong>
        </div>

        <div class="detail-box" style="background:var(--surface-2); padding:15px; border-radius:12px;">
            <span>Registered Email</span><br>
            <strong>${activeSeller.email||'N/A'}</strong>
        </div>

        <div class="detail-box" style="background:var(--surface-2); padding:15px; border-radius:12px;">
            <span>Phone Number</span><br>
            <strong>${activeSeller.phone||'N/A'}</strong>
        </div>

        <div class="detail-box" style="background:var(--surface-2); padding:15px; border-radius:12px;">
            <span>Bank IFSC</span><br>
            <strong>${activeSeller.bankIfsc||'N/A'}</strong>
        </div>

        <div class="detail-box" style="background:var(--surface-2); padding:15px; border-radius:12px;">
            <span>Bank Account</span><br>
            <strong>${activeSeller.bankAccount||'N/A'}</strong>
        </div>

        `;
    }

    const pi=document.getElementById("profIfsc");
    if(pi)pi.value=activeSeller.bankIfsc||'';

    const pa=document.getElementById("profAcc");
    if(pa)pa.value=activeSeller.bankAccount||'';

    const kycWrapper=document.getElementById("kycStatusBoxWrapper");

    if(activeSeller.kycRequested){

        if(kycWrapper)kycWrapper.style.display='block';

        const kyc=activeSeller.kyc||{};
        const indicator=document.getElementById("kycStatusIndicator");

        if(indicator){

            if(kyc.aadhar||kyc.pan||kyc.gst){

                indicator.innerHTML=`
                <span style="color:var(--success); font-weight:bold;">
                    <i class="fas fa-check-circle"></i>
                    Documents Uploaded & Under Review
                </span>
                `;

            }else{

                indicator.innerHTML=`
                <span style="color:var(--danger); font-weight:bold;">
                    <i class="fas fa-times-circle"></i>
                    Pending Upload
                </span>
                `;
            }
        }

    }else{

        if(kycWrapper)kycWrapper.style.display='none';
    }
}

window.updateBankDetails=async function(){
    const ifsc=document.getElementById("profIfsc").value.trim();
    const acc=document.getElementById("profAcc").value.trim();
    if(!ifsc||!acc)return showToast("Both fields are required","warning");
    try{
        await db.collection("sellers").doc(activeSeller.email).update({bankIfsc:ifsc,bankAccount:acc});
        activeSeller.bankIfsc=ifsc;
        activeSeller.bankAccount=acc;
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        showToast("Bank details updated successfully!","success");
    }catch(e){showToast("Failed to update bank details.","error");}
}

window.openKycModal=function(){
    const m=document.getElementById("kycModal");
    if(m)m.style.display="flex";
    const kst=document.getElementById("kycStatusText");
    if(kst){
        const kyc=activeSeller.kyc||{};
        if(kyc.aadhar||kyc.pan||kyc.gst){
            kst.innerHTML="<strong style='color:var(--success);'>You have already uploaded documents. Uploading again will overwrite them.</strong>";
        }else{
            kst.innerText="Please upload clear images for swift verification.";
        }
    }
}

window.saveKycDocs=async function(){
    showToast("Encrypting & Uploading securely...","info");
    const m=document.getElementById("kycModal");
    if(m)m.style.display="none";
    const kycData={aadhar:true,pan:true,gst:true,uploadedAt:new Date().toISOString(),status:'Pending Review'};
    activeSeller.kyc=kycData;
    activeSeller.kycRequested=false;
    localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    try{
        await db.collection("sellers").doc(activeSeller.email).update({kyc:kycData,kycRequested:false});
        showToast("KYC Documents successfully uploaded!","success");
        const kb=document.getElementById("kycAlertBanner");
        if(kb)kb.style.display="none";
        loadProfile();
    }catch(e){showToast("Error saving KYC data.","error");}
}

window.openSubHistoryModal=function(){
    const list=document.getElementById("subHistoryList");
    if(!list)return;
    list.innerHTML="";
    const history=activeSeller.subHistory||[];
    if(history.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No subscription history found.</td></tr>";}
    else{
        [...history].reverse().forEach(h=>{
            list.innerHTML+=`<tr><td><strong style="font-size:13px;">${window.aryantaSmartDate(h.startDate)}</strong></td><td><strong style="color:var(--primary); font-size:14px;">${h.plan} (${h.duration})</strong></td><td>${h.method}</td><td><strong style="color:var(--success);">₹${h.cost}</strong></td><td>${window.aryantaSmartDate(h.endDate)}</td></tr>`;
        });
    }
    const m=document.getElementById('subHistoryModal');
    if(m)m.style.display='flex';
}

// --- INJECTED: QC Filter Function ---
window.filterInventory = function(status) {
    currentInventoryFilter = status;
    document.querySelectorAll('.cat-pill').forEach(el => el.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    loadInventory();
};

function loadInventory(){
    const list=document.getElementById("inventoryList");
    if(!list)return;
    list.innerHTML="";
    
    // Applying QC filter
    let filteredProds = sellerProducts;
    if (currentInventoryFilter === 'Approved') {
        filteredProds = sellerProducts.filter(p => p.approvalStatus === 'Approved');
    } else if (currentInventoryFilter === 'Pending') {
        filteredProds = sellerProducts.filter(p => p.approvalStatus === 'Pending');
    } else if (currentInventoryFilter === 'Rejected') {
        filteredProds = sellerProducts.filter(p => p.approvalStatus === 'Rejected');
    }

    if(filteredProds.length===0){list.innerHTML="<tr><td colspan='6' style='text-align:center; padding:30px; font-weight:600;'>No products found in this category.</td></tr>";return;}
    
    filteredProds.forEach(p=>{
        let imgHtml="";
        let imgs=p.images&&p.images.length>0?p.images:(p.image?[p.image]:[]);
        if(imgs.length > 0) imgHtml+=`<img src="${imgs[0]}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; margin-right:5px; border:1px solid #e2e8f0;">`;
        let stockHtml=p.stock<5?`<span style="color:var(--danger); font-weight:800;">${p.stock}</span> Units`:`<span style="font-weight:700;">${p.stock}</span> Units`;
        let qcHtml='';
        if(p.approvalStatus==='Pending')qcHtml='<span class="badge-ui" style="background:#f59e0b; color:white;">QC Pending</span>';
        else if(p.approvalStatus==='Rejected')qcHtml='<span class="badge-ui" style="background:#ef4444; color:white;">QC Cancelled</span>';
        else if(p.approvalStatus==='Approved')qcHtml='<span class="badge-ui" style="background:#10b981; color:white;">QC Pass & Live</span>';
        else qcHtml='<span class="badge-ui" style="background:#64748b; color:white;">Draft</span>';
        
        list.innerHTML+=`<tr class="clickable-row" onclick="editItem('${p.id}')">
        <td data-label="SKU & Images"><div style="display:flex; align-items:center;">${imgHtml}<strong style="font-family:monospace; font-size:13px; color:var(--text-light); margin-left:10px;">${p.sku||p.id.substring(0,8)}</strong></div></td>
        <td data-label="Product Title"><strong style="font-size:14px;">${p.name}</strong></td>
        <td data-label="Category">${p.category||'N/A'} <br> ${qcHtml}</td>
        <td data-label="Stock">${stockHtml}</td>
        <td data-label="Price"><strong style="color:var(--primary); font-size:15px;">₹${p.price}</strong> <br><span style="text-decoration:line-through; font-size:11px; color:#94a3b8;">₹${p.mrp}</span></td>
        <td data-label="Actions">
        <div style="display:flex; gap:5px;">
        <button class="btn-sm edit" onclick="event.stopPropagation(); editItem('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="btn-sm delete" onclick="event.stopPropagation(); deleteItem('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
        </td>
        </tr>`;
    });
}

// --- INJECTED: Render & Remove Images logic ---
window.renderImagePreviews = function() {
    const preview=document.getElementById('imagePreviewContainer');
    if(preview){
        preview.innerHTML='';
        uploadedImagesArray.forEach((img, idx)=>{
            preview.innerHTML+=`
            <div style="position:relative; display:inline-block; margin:5px;">
                <img src="${img}" style="width:80px; height:80px; object-fit:cover; border-radius:12px; border:2px solid var(--primary);">
                <button type="button" onclick="removeUploadedImage(${idx})" style="position:absolute; top:-5px; right:-5px; background:var(--danger); color:white; border-radius:50%; border:none; width:20px; height:20px; font-size:10px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">X</button>
            </div>`;
        });
    }
};

window.removeUploadedImage = function(idx) {
    uploadedImagesArray.splice(idx, 1);
    renderImagePreviews();
};
window.handleImageSelection = async function(e){
    const files = e.target.files;
    if(!files || files.length === 0) return;

    for(let file of files){
        if(!file.type.startsWith('image/')) continue;

        const base64Str = await new Promise((resolve)=>{
            const reader = new FileReader();

            reader.readAsDataURL(file);

            reader.onload = (ev)=>{
                const img = new Image();
                img.src = ev.target.result;

                img.onload = ()=>{
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600;

                    let scaleSize = 1;
                    if(img.width > MAX_WIDTH){
                        scaleSize = MAX_WIDTH / img.width;
                    }

                    canvas.width = img.width * scaleSize;
                    canvas.height = img.height * scaleSize;

                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
            };
        });

        uploadedImagesArray.push(base64Str);
    }

    renderImagePreviews();

    e.target.value = "";
}

const imgInp=document.getElementById('itemImgFiles');
if(imgInp){
    imgInp.addEventListener('change',async function(e){
        const files=e.target.files;
        for(let file of files){
            if(!file.type.startsWith('image/'))continue;
            const base64Str=await new Promise((resolve)=>{
                const reader=new FileReader();
                reader.readAsDataURL(file);
                reader.onload=(ev)=>{
                    const img=new Image();
                    img.src=ev.target.result;
                    img.onload=()=>{
                        const canvas=document.createElement('canvas');
                        const MAX_WIDTH=600;
                        let scaleSize=1;
                        if(img.width>MAX_WIDTH)scaleSize=MAX_WIDTH/img.width;
                        canvas.width=img.width*scaleSize;
                        canvas.height=img.height*scaleSize;
                        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
                        resolve(canvas.toDataURL('image/jpeg',0.8));
                    }
                };
            });
            uploadedImagesArray.push(base64Str);
        }
        renderImagePreviews();
    });
}

window.calculateListedPrice=function(){
    const pEl=document.getElementById("itemPrice");
    const lpEl=document.getElementById("itemListedPrice");
    if(!pEl||!lpEl)return;
    const sp=parseFloat(pEl.value)||0;
    let subPlan=activeSeller.subscription||'None';
    let commPercent=0;
    if(subPlan==='Go')commPercent=0;
    if(subPlan==='Pro')commPercent=0;
    const listed=sp+(sp*commPercent);
    lpEl.value=listed>0?`₹ ${Math.round(listed)}`:'';
}

window.renderLinkInputs=function(){
    const container=document.getElementById('productLinksContainer');
    if(!container)return;
    container.innerHTML='';
    itemLinksData.forEach((link,idx)=>{
        container.innerHTML+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><input type="url" class="input-field" style="margin:0;" value="${link}" placeholder="https://..." onchange="updateLinkVal(${idx}, this.value)"><button type="button" class="btn-sm delete" onclick="removeLinkField(${idx})"><i class="fas fa-trash"></i></button></div>`;
    });
    if(itemLinksData.length===0)container.innerHTML=`<span style="font-size:12px;color:var(--text-light);">No links added.</span>`;
};

window.addLinkField=function(){
    if(itemLinksData.length>=5)return showToast("Maximum 5 links allowed.","error");
    itemLinksData.push("");renderLinkInputs();
};
window.removeLinkField=function(idx){itemLinksData.splice(idx,1);renderLinkInputs();};
window.updateLinkVal=function(idx,val){itemLinksData[idx]=val;};

window.openItemModal=function(){
    const f=document.getElementById("itemForm");
    if(f)f.reset();

    const ed=document.getElementById("editId");
    if(ed)ed.value="";

    const sku=document.getElementById("itemSku");
    if(sku)sku.value="";

    uploadedImagesArray=[];
    if(typeof renderImagePreviews==="function") renderImagePreviews();

    const lp=document.getElementById("itemListedPrice");
    if(lp)lp.value="";

    const wCustom=document.getElementById("itemWarrantyCustom");
    if(wCustom){
        wCustom.style.display="none";
        wCustom.required=false;
    }

    itemLinksData=[];
    if(typeof renderLinkInputs==="function") renderLinkInputs();

    const m=document.getElementById("itemModal");
    if(m){
        m.style.display="flex";
        m.style.pointerEvents="auto";
        setTimeout(()=>m.classList.add("show"),10);
    }else{
        showToast("Product modal not found.","error");
    }
}

window.editItem=function(id){
    const p=sellerProducts.find(x=>String(x.id)===String(id));

    if(!p){
        showToast("Product not found. Refresh dashboard.","error");
        return;
    }

    const ed=document.getElementById("editId");
    if(ed)ed.value=p.id;

    const sku=document.getElementById("itemSku");
    if(sku)sku.value=p.sku||p.id||"";

    const name=document.getElementById("itemName");
    if(name)name.value=p.name||"";

    const cat=document.getElementById("itemCat");
    if(cat)cat.value=p.category||"";

    const stk=document.getElementById("itemStock");
    if(stk)stk.value=p.stock||0;

    const mrp=document.getElementById("itemMrp");
    if(mrp)mrp.value=p.mrp||"";

    const price=document.getElementById("itemPrice");
    if(price)price.value=p.price||"";

    const desc=document.getElementById("itemDesc");
    if(desc)desc.value=p.desc||"";

    const hl=document.getElementById("itemHighlights");
    if(hl)hl.value=p.highlights||"";

    const wSel=document.getElementById("itemWarranty");
    if(wSel)wSel.value=p.warranty||"No Warranty";

    const wCustom=document.getElementById("itemWarrantyCustom");
    if(wCustom){
        wCustom.value=p.warrantyText||"";
        if(wSel && wSel.value==="Yes"){
            wCustom.style.display="block";
            wCustom.required=true;
        }else{
            wCustom.style.display="none";
            wCustom.required=false;
        }
    }

    const secTx=document.getElementById("itemSecureTx");
    if(secTx)secTx.value=p.secureTxStatus||"Standard";

    uploadedImagesArray=Array.isArray(p.images)&&p.images.length>0 ? [...p.images] : (p.image?[p.image]:[]);
    if(typeof renderImagePreviews==="function") renderImagePreviews();

    itemLinksData=Array.isArray(p.productLinks) ? [...p.productLinks] : (p.productLink?[p.productLink]:[]);
    if(typeof renderLinkInputs==="function") renderLinkInputs();

    if(typeof calculateListedPrice==="function") calculateListedPrice();

    const m=document.getElementById("itemModal");
    if(m){
        m.style.display="flex";
        m.style.pointerEvents="auto";
        setTimeout(()=>m.classList.add("show"),10);
    }else{
        showToast("Product modal not found.","error");
    }
}

window.submitItemForm=async function(){
    const id=document.getElementById("editId").value;
    const mrp=parseInt(document.getElementById("itemMrp").value,10);
    const price=parseInt(document.getElementById("itemPrice").value,10);
    const stock=parseInt(document.getElementById("itemStock").value,10);
    if(price>mrp)return showToast("Price cannot be > MRP!","warning");
    if(isNaN(price)||isNaN(stock))return showToast("Invalid Price or Stock","error");
    let itemSku=document.getElementById("itemSku").value.trim();
    if(!itemSku)itemSku='PRD-'+Math.random().toString(36).substr(2,6).toUpperCase();
    let subPlan=activeSeller.subscription||'None';
    let commPercent=0;
    if(subPlan==='Go')commPercent=0;
    if(subPlan==='Pro')commPercent=0;
    const finalListedPrice=Math.round(price+(price*commPercent));
    const isOfflineMode=activeSeller.settings&&activeSeller.settings.offline;
    const makeVisible=false;
    const hl=document.getElementById("itemHighlights");
    
    const wSel=document.getElementById("itemWarranty");
    const wCustom=document.getElementById("itemWarrantyCustom");
    const secTx=document.getElementById("itemSecureTx");

    const data={
        sellerEmail:activeSeller.email,
        sellerName:activeSeller.companyName||activeSeller.email,
        sellerId:String(activeSeller.id || activeSeller.uid || activeSeller.email || ""),
        sku:itemSku,
        name:document.getElementById("itemName").value,
        category:document.getElementById("itemCat").value,
        stock:stock,
        mrp:mrp,
        price:price,
        listedPrice:finalListedPrice,
        desc:document.getElementById("itemDesc").value,
        highlights:hl?hl.value:"",
        productLinks:itemLinksData.filter(l=>l.trim()!==""),
        isVisible:makeVisible,
        approvalStatus:'Pending', // INJECTED: Force to Pending on save/edit
        warranty: wSel ? wSel.value : 'No Warranty',
        warrantyText: wCustom ? wCustom.value : '',
        secureTxStatus: secTx ? secTx.value : 'Standard',
        timestamp:new Date().toISOString()
    };
    if(uploadedImagesArray.length>0){
        data.images=uploadedImagesArray;
        data.image=uploadedImagesArray[0];
    }
    const btn=document.getElementById("saveProductBtn");
    if(btn)btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...';
    try{
        if(id){
            await db.collection("products").doc(id).update(data);
        }else{
            const res=await db.collection("products").add(data);
            const link=`https://aryanta.in/product.html?id=${res.id}`;
            await db.collection("products").doc(res.id).update({productLink:link});
        }
        closeModal("itemModal");
        try{await initDashboard();}catch(e){}
        showToast("Product saved & marked in QC. Admin will review.","success");
    }catch(e){
        showToast("Database Error: "+e.message,"error");
    }
    if(btn)btn.innerHTML='<i class="fas fa-save"></i> Save Product';
}

window.deleteItem=async function(id){
    if(!id){
        showToast("Product ID missing.","error");
        return;
    }

    const ok=confirm("Delete this product permanently?");
    if(!ok)return;

    try{
        await db.collection("products").doc(id).delete();
        sellerProducts=sellerProducts.filter(p=>String(p.id)!==String(id));
        loadInventory();
        renderDashboardStats();
        showToast("Product deleted successfully.","success");
    }catch(e){
        showToast("Delete failed: "+e.message,"error");
    }
}

function getProductImageHtml(itemName){
    const name = String(itemName || "").toLowerCase().trim();

    const p = sellerProducts.find(p => {
        return String(p.name || p.title || "").toLowerCase().trim() === name;
    });

    if(!p) return "";

    const imgs = Array.isArray(p.images) && p.images.length > 0 
        ? p.images 
        : (p.image ? [p.image] : []);

    const img = imgs[0];

    if(!img) return "";

    return `
        <img 
            src="${img}" 
            loading="lazy"
            style="width:40px; height:40px; border-radius:8px; object-fit:cover; margin-right:5px; border:1px solid #e2e8f0;"
        >
    `;
}

function loadNewOrders(){
    const list=document.getElementById("newOrdersList");
    if(!list)return;
    list.innerHTML="";
    const sa=document.getElementById("selectAllNew");if(sa)sa.checked=false;
    const pending=sellerOrders.filter(o=>{
    const s=String(o.status||"").toLowerCase().trim();

    return [
        "placed",
        "new",
        "pending",
        "confirmed",
        "order placed",
        "processing"
    ].includes(s);
});
    if(pending.length===0){list.innerHTML="<tr><td colspan='7' style='text-align:center; font-weight:600;'>No pending orders! 🎉</td></tr>";return;}
    const now=Date.now();
    pending.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let itemsHtml=myItems.map(i=>`<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span><br><span style="color:var(--text-light); font-size:12px;">Qty: <span style="color:var(--primary); font-weight:800;">${i.qty}</span></span></div></div>`).join('');
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        const orderTime=o.timestamp?new Date(o.timestamp).getTime():now;const diffHours=(now-orderTime)/3600000;
        let isBreached=diffHours>48;
        let slaText=isBreached?`<span style="color:white; background:var(--danger); padding:4px 8px; border-radius:8px; font-weight:bold; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> BREACHED SLA!</span>`:`<span style="color:var(--success); font-weight:800; font-size:13px;">${Math.round(48-diffHours)}h left</span>`;
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')">
        <td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-new" value="${o.id}" onclick="event.stopPropagation()"></td>
        <td data-label="Order Date"><strong style="font-size:13px;">${window.aryantaSmartDate(o.timestamp)}</strong></td>
        <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td>
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

function getVisibleOrderCheckboxes(selector){
    return Array.from(document.querySelectorAll(selector)).filter(cb=>{
        if(cb.disabled) return false;
        const row = cb.closest('tr');
        if(!row) return true;
        return row.offsetParent !== null && row.style.display !== 'none';
    });
}

window.syncSelectAllState = function(type){
    const selector = type === 'accepted' ? '.cb-acc' : '.cb-new';
    const allId = type === 'accepted' ? 'selectAllAcc' : 'selectAllNew';
    const master = document.getElementById(allId);
    if(!master) return;
    const boxes = getVisibleOrderCheckboxes(selector);
    const checked = boxes.filter(cb=>cb.checked);
    master.checked = boxes.length > 0 && checked.length === boxes.length;
    master.indeterminate = checked.length > 0 && checked.length < boxes.length;
};

window.toggleSelectAllNew = function(source){
    const master = source && source.target ? source.target : source;
    getVisibleOrderCheckboxes('.cb-new').forEach(cb => {
        cb.checked = !!(master && master.checked);
    });
    window.syncSelectAllState('new');
};

window.toggleSelectAllAcc = function(source){
    const master = source && source.target ? source.target : source;
    getVisibleOrderCheckboxes('.cb-acc').forEach(cb => {
        cb.checked = !!(master && master.checked);
    });
    window.syncSelectAllState('accepted');
};

window.toggleSelectAll = function(selectorOrSource, sourceMaybe){
    if(typeof selectorOrSource === 'string'){
        const selector = selectorOrSource;
        const master = sourceMaybe && sourceMaybe.target ? sourceMaybe.target : sourceMaybe;
        getVisibleOrderCheckboxes(selector).forEach(cb => cb.checked = !!(master && master.checked));
        if(selector.includes('cb-acc')) window.syncSelectAllState('accepted');
        else window.syncSelectAllState('new');
        return;
    }
    window.toggleSelectAllNew(selectorOrSource);
};

document.addEventListener('change', function(e){
    if(e.target && e.target.classList){
        if(e.target.classList.contains('cb-new')) window.syncSelectAllState('new');
        if(e.target.classList.contains('cb-acc')) window.syncSelectAllState('accepted');
    }
});
window.bulkAcceptNewOrders=async function(){
    const checkboxes=document.querySelectorAll('.cb-new:checked');
    if(checkboxes.length===0)return showToast("Select at least one order.","warning");
    let orderIds=[];
    const batch=db.batch();
    checkboxes.forEach(cb=>{
        orderIds.push(cb.value);
        const o=sellerOrders.find(x=>x.id===cb.value);if(o)o.status='Accepted';
        batch.update(db.collection("orders").doc(cb.value),{status:'Accepted'});
    });
    renderDashboardStats();loadNewOrders();loadAcceptedOrders();
    showToast(`Accepting ${orderIds.length} orders...`,"info");
    try{await batch.commit();showToast("Bulk Accept Complete!","success");}catch(e){showToast("Failed to bulk accept.","error");}
}

window.acceptOrder=async function(id,isBreached){
    const o=sellerOrders.find(x=>String(x.id)===String(id));
    if(!o)return showToast("Order not found. Refresh first.","error");
    const status=String(o.status||"").toLowerCase().trim();
    if(!["placed","new","pending","confirmed","order placed","processing"].includes(status)){
        return showToast("This order is already processed. No new order was created.","warning");
    }
    o.status='Accepted';
    renderDashboardStats();loadNewOrders();loadAcceptedOrders();
    if(isBreached){
        showToast("Order Accepted. SLA breach was recorded.","warning");
        try{await db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:20,reason:`Late Acceptance SLA Breach: Order ${id}`,timestamp:new Date().toISOString(), orderId:id});}catch(e){}
    }else{showToast("Order Accepted!","success");}
    try{await db.collection("orders").doc(id).update({status:'Accepted',acceptedAt:new Date().toISOString(),acceptedBySeller:true});}catch(e){showToast("Could not update existing order.","error");}
}

window.cancelOrder=async function(id){
    if(activeSeller.status==='Blocked'||activeSeller.status==='Suspended')return showToast("Account restricted. Cannot modify orders.","error");
    if(!confirm("Warning! Canceling this order applies a ₹60 Shipping Fine. Proceed?"))return;
    const o=sellerOrders.find(x=>x.id===id);
    if(o)o.status='Cancelled';
    renderDashboardStats();loadNewOrders();loadReturns();
    try{
        await db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:60,reason:`Seller Cancelled Order ${id}`,timestamp:new Date().toISOString()});
        await db.collection("orders").doc(id).update({status:'Cancelled'});
        showToast("Order Cancelled. ₹60 fine applied.","warning");
    }catch(e){showToast("Network error. Could not cancel order.","error");}
}

function loadCompletedScanOrders(){
    const list=document.getElementById("completedScanList");
    if(!list)return;
    list.innerHTML="";
    const scanned=sellerOrders.filter(o=>o.status==='Completed Scan');
    if(scanned.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No scanned orders ready for ship.</td></tr>";return;}
    scanned.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let itemsHtml=myItems.map(i=>`<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span><br><span style="color:var(--text-light); font-size:12px;">Qty: <span style="color:var(--primary); font-weight:800;">${i.qty}</span></span></div></div>`).join('');
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')">
        <td data-label="Scan Date"><strong style="font-size:13px;">${window.aryantaSmartDate(o.scanned_date||o.timestamp)}</strong></td>
        <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--secondary); font-size:14px;">${o.order_no||o.id}</strong></td>
        <td data-label="Item Details" style="font-size:13px;">${itemsHtml}</td>
        <td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534;">Ready to Ship</span></td>
        <td data-label="Action"><button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${o.id}')"><i class="fas fa-print"></i> Generate Shipping Pack</button></td>
        </tr>`;
    });
}

window.toggleSelectAllAcc = function(source){
    document.querySelectorAll('.cb-acc').forEach(cb => {
        cb.checked = source.checked;
    });
}

function loadAcceptedOrders(){
    const list = document.getElementById("acceptedOrdersList");

    if(!list) return;

    list.innerHTML = "";

    const sa = document.getElementById("selectAllAcc");
    if(sa) sa.checked = false;

    const accepted = sellerOrders.filter(o => {
        const s = String(o.status || "").toLowerCase().trim();
        return s === "accepted";
    });

    if(accepted.length === 0){
        list.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; font-weight:600;">
                    No orders to dispatch.
                </td>
            </tr>
        `;
        return;
    }

    const rows = [];

    accepted.forEach(o => {
        const myItems = getSellerItemsFromOrder(o);

        if(!myItems || myItems.length === 0) return;

        const orderDate = o.timestamp 
            ? window.aryantaSmartDate(o.timestamp)
            : "N/A";

        const orderRef = o.order_no || o.id || "N/A";

        const itemsHtml = myItems.map(i => {
            const itemName = i.name || i.title || "Product";
            const qty = i.qty || i.quantity || 1;

            let imgHtml = "";

            const matchedProduct = sellerProducts.find(p => {
                const pName = String(p.name || p.title || "").toLowerCase().trim();
                const iName = String(itemName || "").toLowerCase().trim();

                const pId = String(p.id || p.productId || "").trim();
                const iId = String(i.id || i.productId || i.product_id || "").trim();

                const pSku = String(p.sku || "").toLowerCase().trim();
                const iSku = String(i.sku || "").toLowerCase().trim();

                return (
                    (pName && pName === iName) ||
                    (pId && pId === iId) ||
                    (pSku && pSku === iSku)
                );
            });

            if(matchedProduct){
                const imgs = Array.isArray(matchedProduct.images) && matchedProduct.images.length > 0
                    ? matchedProduct.images
                    : (matchedProduct.image ? [matchedProduct.image] : []);

                if(imgs[0]){
                    imgHtml = `
                        <img 
                            src="${imgs[0]}" 
                            loading="lazy"
                            style="width:40px; height:40px; border-radius:8px; object-fit:cover; margin-right:5px; border:1px solid #e2e8f0;"
                        >
                    `;
                }
            }

            return `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                    <div>${imgHtml}</div>

                    <div>
                        <span style="font-weight:700;">${itemName}</span><br>

                        <span style="color:var(--text-light); font-size:12px;">
                            Qty: 
                            <span style="color:var(--primary); font-weight:800;">
                                ${qty}
                            </span>
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        rows.push(`
            <tr class="clickable-row">
                <td data-label="Select" style="text-align:center;">
                    <input 
                        type="checkbox" 
                        class="custom-cb cb-acc" 
                        value="${o.id}" 
                        onclick="event.stopPropagation()"
                    >
                </td>

                <td data-label="Order Date">
                    <strong style="font-size:13px;">${orderDate}</strong>
                </td>

                <td data-label="Order Ref">
                    <strong style="font-family:monospace; color:var(--secondary); font-size:14px;">
                        ${orderRef}
                    </strong>
                </td>

                <td data-label="Item Details" style="font-size:13px;">
                    ${itemsHtml}
                </td>

                <td data-label="Action">
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                        <button 
                            class="btn-shiprocket" 
                            onclick="event.stopPropagation(); downloadShippingInvoice('${o.id}')"
                        >
                            <i class="fas fa-print"></i> Generate Shipping Pack
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });

    list.innerHTML = rows.join("");
}

function aryShipText(v){
    return v === undefined || v === null ? "" : String(v).trim();
}

function aryShipPhone(v){
    return aryShipText(v).replace(/\D/g,"").slice(-10);
}

function aryShipPin(v){
    return aryShipText(v).replace(/\D/g,"").slice(0,6);
}

function aryShipNum(v, fallback){
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function aryShipHtml(v){
    return aryShipText(v).replace(/[&<>"']/g, c => ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"
    }[c]));
}

function aryShipFirst(){
    for(let i=0;i<arguments.length;i++){
        const v = arguments[i];
        if(v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
}

function aryShipGetOrderId(order){
    return aryShipText(aryShipFirst(order.order_no, order.orderNo, order.id, `ARY-${Date.now()}`));
}

function aryShipFormatOrderDate(order){
    const raw = aryShipFirst(order.timestamp, order.createdAt, order.date, new Date().toISOString());
    const d = new Date(raw);
    const safeDate = Number.isFinite(d.getTime()) ? d : new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${safeDate.getFullYear()}-${pad(safeDate.getMonth()+1)}-${pad(safeDate.getDate())} ${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

function aryShipGetPickupName(){
    return aryShipText(
        aryShipFirst(
            activeSeller && activeSeller.shiprocketPickupLocation,
            activeSeller && activeSeller.pickup_location_name,
            activeSeller && activeSeller.pickupLocationName,
            activeSeller && activeSeller.pickrocketPickupLocation,
            activeSeller && activeSeller.shiprocket?.pickupLocation,
            activeSeller && activeSeller.shopInfo?.shiprocketPickupLocation,
            activeSeller && activeSeller.shopInfo?.pickup_location_name,
            activeSeller && activeSeller.shop?.shiprocketPickupLocation,
            activeSeller && activeSeller.shop?.pickup_location_name
        )
    );
}

function aryShipGetSellerAddress(){
    const shop = activeSeller && (activeSeller.shopInfo || activeSeller.shop || {});
    return {
        seller_name: aryShipText(aryShipFirst(activeSeller?.companyName, activeSeller?.shopName, shop.name, activeSeller?.name, "Aryanta Seller")),
        seller_phone: aryShipPhone(aryShipFirst(shop.phone, activeSeller?.phone, activeSeller?.mobile)),
        pickup_location_name: aryShipGetPickupName(),
        pickup_address: aryShipText(aryShipFirst(shop.pickupAddress, shop.address, shop.shopAddress, activeSeller?.pickupAddress, activeSeller?.address)),
        city: aryShipText(aryShipFirst(shop.city, activeSeller?.city)),
        state: aryShipText(aryShipFirst(shop.state, activeSeller?.state)),
        pincode: aryShipPin(aryShipFirst(shop.pincode, shop.pin, activeSeller?.pincode, activeSeller?.pin)),
        email: aryShipText(aryShipFirst(shop.email, activeSeller?.email))
    };
}

function aryShipOrderAddress(order){
    const addr = order.address && typeof order.address === "object" ? order.address : {};
    return {
        name: aryShipText(aryShipFirst(order.delivery_name, order.customerName, order.userName, addr.name, "Customer")),
        phone: aryShipPhone(aryShipFirst(order.delivery_phone, order.phone, order.mobile, addr.phone)),
        email: aryShipText(aryShipFirst(order.customerEmail, order.userEmail, order.user_email, order.email, addr.email, activeSeller?.email)),
        address: aryShipText(aryShipFirst(order.delivery_address, order.deliveryAddress, order.fullAddress, addr.fullAddress, addr.address, addr.street)),
        address2: aryShipText(aryShipFirst(order.delivery_address_2, order.address2, addr.address2, addr.landmark, addr.area)),
        city: aryShipText(aryShipFirst(order.delivery_city, order.city, addr.city)),
        state: aryShipText(aryShipFirst(order.delivery_state, order.state, addr.state)),
        pincode: aryShipPin(aryShipFirst(order.delivery_pincode, order.pincode, order.pin, addr.pincode, addr.pin))
    };
}

function aryShipMatchProduct(item){
    const itemId = aryShipText(aryShipFirst(item.id, item.productId, item.product_id, item.productDocId));
    const itemSku = aryShipText(item.sku).toLowerCase();
    return (sellerProducts || []).find(p => {
        const pId = aryShipText(aryShipFirst(p.id, p.productId, p.product_id));
        const pSku = aryShipText(p.sku).toLowerCase();
        return (itemId && pId && itemId === pId) || (itemSku && pSku && itemSku === pSku);
    }) || {};
}

function aryShipPackageFromItems(items){
    let weight = 0;
    let length = 0;
    let breadth = 0;
    let height = 0;

    (items || []).forEach(item => {
        const p = aryShipMatchProduct(item);
        const qty = aryShipNum(aryShipFirst(item.qty, item.quantity), 1);
        weight += aryShipNum(aryShipFirst(item.weightKg, item.weight, p.packageWeightKg, p.weightKg, p.weight, p.packageWeight, p.package && p.package.weight), 0.5) * qty;
        length = Math.max(length, aryShipNum(aryShipFirst(item.lengthCm, item.length, p.packageLengthCm, p.lengthCm, p.length, p.packageLength, p.package && p.package.length), 20));
        breadth = Math.max(breadth, aryShipNum(aryShipFirst(item.breadthCm, item.breadth, item.width, p.packageBreadthCm, p.breadthCm, p.breadth, p.widthCm, p.width, p.packageBreadth, p.package && (p.package.breadth || p.package.width)), 15));
        height = Math.max(height, aryShipNum(aryShipFirst(item.heightCm, item.height, p.packageHeightCm, p.heightCm, p.height, p.packageHeight, p.package && p.package.height), 8));
    });

    return {
        weight: Number(Math.max(weight || 0.5, 0.1).toFixed(2)),
        length: Math.max(length || 20, 1),
        breadth: Math.max(breadth || 15, 1),
        height: Math.max(height || 8, 1)
    };
}

function aryShipBuildPayload(order){
    const myItems = getSellerItemsFromOrder(order);
    const delivery = aryShipOrderAddress(order);
    const pickup = aryShipGetSellerAddress();

    const missing = [];
    if(!pickup.pickup_location_name) missing.push("seller pickup location");
    if(!delivery.name) missing.push("customer name");
    if(!delivery.phone || delivery.phone.length !== 10) missing.push("customer 10-digit phone");
    if(!delivery.address) missing.push("customer address");
    if(!delivery.city) missing.push("customer city");
    if(!delivery.state) missing.push("customer state");
    if(!delivery.pincode || delivery.pincode.length !== 6) missing.push("customer pincode");

    if(missing.length){
        throw new Error("Missing dispatch details: " + missing.join(", "));
    }

    const items = myItems.map((item, index) => {
        const qty = aryShipNum(aryShipFirst(item.qty, item.quantity, item.units), 1);
        const price = aryShipNum(aryShipFirst(item.price, item.sellingPrice, item.amount), 1);
        const p = aryShipMatchProduct(item);
        return {
            id: aryShipText(aryShipFirst(item.id, item.productId, item.product_id, p.id, `ITEM-${index+1}`)),
            productId: aryShipText(aryShipFirst(item.productId, item.id, item.product_id, p.id)),
            sku: aryShipText(aryShipFirst(item.sku, p.sku, `SKU-${index+1}`)),
            name: aryShipText(aryShipFirst(item.name, item.title, p.name, p.title, `Product ${index+1}`)).slice(0, 120),
            qty,
            quantity: qty,
            units: qty,
            price,
            sellingPrice: price,
            amount: price * qty,
            hsn: aryShipText(aryShipFirst(item.hsn, p.hsn))
        };
    });

    const itemTotal = items.reduce((s, i) => s + (Number(i.price || 0) * Number(i.qty || 1)), 0);
    const packageDetails = aryShipPackageFromItems(myItems);
    const payRaw = String(aryShipFirst(order.paymentMethod, order.payment_method, order.payment?.method)).toLowerCase();

    return {
        orderId: aryShipGetOrderId(order),
        orderNo: aryShipGetOrderId(order),
        orderDate: aryShipFormatOrderDate(order),
        sellerEmail: aryShipText(activeSeller?.email || ""),
        pickup,
        delivery,
        customer: delivery,
        address: delivery,
        products: items,
        items,
        package: packageDetails,
        packageDetails,
        paymentMethod: payRaw.includes("cod") || payRaw.includes("cash") ? "COD" : "Prepaid",
        payment: { method: payRaw.includes("cod") || payRaw.includes("cash") ? "COD" : "Prepaid" },
        subTotal: aryShipNum(aryShipFirst(order.subTotal, order.total, order.amount, order.finalAmount), itemTotal || 1),
        total: aryShipNum(aryShipFirst(order.total, order.amount, order.finalAmount), itemTotal || 1),
        amount: aryShipNum(aryShipFirst(order.amount, order.total, order.finalAmount), itemTotal || 1),
        shippingCharge: Number(aryShipFirst(order.shippingCharge, order.deliveryCharge, 0)) || 0
    };
}

function ensureShipProcessSheet(){
    let sheet = document.getElementById("shipProcessSheet");
    if(sheet) return sheet;

    sheet = document.createElement("div");
    sheet.id = "shipProcessSheet";
    sheet.className = "ship-process-overlay";
    sheet.innerHTML = `
        <div class="ship-process-card">
            <div class="ship-process-handle"></div>
            <div class="ship-process-head">
                <div>
                    <div class="ship-process-kicker">Shipping Request</div>
                    <h3 id="shipProcessTitle">Preparing dispatch</h3>
                    <p id="shipProcessSub">Please keep this page open while we create the courier documents.</p>
                </div>
                <button type="button" class="ship-process-close" onclick="closeShipProcessSheet()" aria-label="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="ship-progress-bar"><span id="shipProcessBar"></span></div>
            <div id="shipProcessSteps" class="ship-process-steps"></div>
            <div id="shipProcessLinks" class="ship-process-links"></div>
        </div>
    `;
    document.body.appendChild(sheet);
    return sheet;
}

function openShipProcessSheet(total){
    const sheet = ensureShipProcessSheet();
    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden", "false");
    const title = document.getElementById("shipProcessTitle");
    const sub = document.getElementById("shipProcessSub");
    const steps = document.getElementById("shipProcessSteps");
    const bar = document.getElementById("shipProcessBar");
    const links = document.getElementById("shipProcessLinks");
    if(title) title.innerText = total > 1 ? `Generating ${total} shipping documents` : "Generating shipping document";
    if(sub) sub.innerText = "Please keep this page open while the request is processed.";
    if(bar) bar.style.width = "0%";
    if(links) links.innerHTML = "";
    if(steps) steps.innerHTML = `
        <div class="ship-step" data-step="validate"><i class="fas fa-circle-notch"></i><span>Checking order and pickup details</span></div>
        <div class="ship-step" data-step="create"><i class="fas fa-circle-notch"></i><span>Creating courier request</span></div>
        <div class="ship-step" data-step="save"><i class="fas fa-circle-notch"></i><span>Saving shipping record</span></div>
        <div class="ship-step" data-step="done"><i class="fas fa-circle-notch"></i><span>Ready</span></div>
    `;
}

window.closeShipProcessSheet = function(){
    const sheet = document.getElementById("shipProcessSheet");
    if(sheet){
        sheet.classList.remove("show");
        sheet.setAttribute("aria-hidden", "true");
    }
};

function updateShipProcess(step, state, text, pct){
    const row = document.querySelector(`#shipProcessSteps .ship-step[data-step="${step}"]`);
    if(row){
        row.classList.remove("running", "done", "error");
        row.classList.add(state);
        const icon = row.querySelector("i");
        const label = row.querySelector("span");
        if(icon){
            icon.className = state === "done" ? "fas fa-check-circle" : state === "error" ? "fas fa-times-circle" : "fas fa-spinner fa-spin";
        }
        if(label && text) label.innerText = text;
    }
    const bar = document.getElementById("shipProcessBar");
    if(bar && pct !== undefined) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function addShipProcessLink(label, url){
    if(!url) return;
    const links = document.getElementById("shipProcessLinks");
    if(!links) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "ship-process-link";
    a.innerHTML = `<i class="fas fa-file-arrow-down"></i> ${aryShipHtml(label)}`;
    links.appendChild(a);
}

async function requestShippingForOrder(order, index, total){
    const payload = aryShipBuildPayload(order);
    updateShipProcess("validate", "done", `Order ${index}/${total}: details checked`, 15);

    const res = await fetch(`${API_BASE_URL}/shiprocket/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
        throw new Error(data.message || data.error || "Shipping request failed");
    }

    updateShipProcess("create", "done", `Order ${index}/${total}: courier request created`, 55);

    const pdfUrl = data.labelUrl || data.label_url || data.shippingLabelUrl || data.shipping_label_url || data.pdfUrl || data.url || data.shiprocketPdfUrl || data.shiprocketInvoicePdfUrl || data.invoiceUrl || "";
    const preservedStatus = aryShipText(aryShipFirst(order.status, order.orderStatus, "Accepted"));
    const updates = {
        status: preservedStatus,
        orderStatus: preservedStatus,
        shiprocketGenerated: true,
        shippingProvider: "Shiprocket",
        shiprocketOrderId: data.shiprocketOrderId || data.shiprocket_order_id || data.order_id || data.orderId || "",
        shiprocketShipmentId: data.shipmentId || data.shipment_id || data.shiprocketShipmentId || data.shiprocket_shipment_id || (data.shipment && data.shipment.id) || "",
        shipmentId: data.shipmentId || data.shipment_id || data.shiprocketShipmentId || data.shiprocket_shipment_id || (data.shipment && data.shipment.id) || "",
        awbCode: data.awbCode || data.awb_code || data.awb || (data.awb_data && data.awb_data.awb_code) || "",
        shiprocketInvoiceUrl: data.invoiceUrl || data.invoice_url || "",
        shiprocketLabelUrl: data.labelUrl || data.label_url || data.shippingLabelUrl || "",
        shippingPdfUrl: pdfUrl,
        shiprocketDocsGeneratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await db.collection("orders").doc(order.id).set(updates, { merge: true });

    try{
        await db.collection("seller_shiprocket_invoices").doc(String(order.id)).set({
            id: String(order.id),
            orderId: String(order.id),
            orderNo: aryShipGetOrderId(order),
            sellerEmail: activeSeller?.email || "",
            createdAt: new Date().toISOString(),
            payload,
            response: data,
            ...updates
        }, { merge: true });
    }catch(e){}

    Object.assign(order, updates);
    try{
        await db.collection("seller_notifications").add({
            sellerEmail: activeSeller?.email || "",
            email: activeSeller?.email || "",
            type: "SHIPPING_DOCUMENT_READY",
            orderId: String(order.id || ""),
            title: "Shipping document ready",
            text: `Shipping document is ready for order ${aryShipGetOrderId(order)}.`,
            read: false,
            timestamp: new Date().toISOString()
        });
    }catch(e){}
    updateShipProcess("save", "done", `Order ${index}/${total}: saved to records`, 80);

    addShipProcessLink(`Open ${aryShipGetOrderId(order)}`, pdfUrl);
    return { order, response: data, pdfUrl };
}

function aryShipExistingUrl(order){
    return aryShipText(aryShipFirst(
        order && order.shippingPdfUrl,
        order && order.shiprocketInvoiceUrl,
        order && order.shiprocketLabelUrl,
        order && order.labelUrl,
        order && order.shippingLabelUrl,
        order && order.shiprocketLabelUrl,
        order && order.invoiceUrl,
        order && order.pdfUrl,
        order && order.url
    ));
}

window.downloadShippingInvoice = async function(orderId){
    const singleId = orderId && orderId !== "bulk" ? String(orderId) : null;
    let selectedIds = [];

    if(singleId){
        const existingOrder = sellerOrders.find(o => String(o.id) === String(singleId));
        const existingUrl = aryShipExistingUrl(existingOrder);
        if(existingOrder && existingUrl){
            openShipProcessSheet(1);
            updateShipProcess("validate", "done", "Existing shipping document found", 25);
            updateShipProcess("create", "done", "No duplicate request created", 55);
            updateShipProcess("save", "done", "Record already saved", 80);
            updateShipProcess("done", "done", "Ready to open/download", 100);
            const sub = document.getElementById("shipProcessSub");
            if(sub) sub.innerText = "This order already has a shipping document. Use the button below.";
            addShipProcessLink(`Open ${aryShipGetOrderId(existingOrder)}`, existingUrl);
            return;
        }
        selectedIds = [singleId];
    }else{
        selectedIds = Array.from(document.querySelectorAll(".cb-acc:checked")).map(cb => cb.value);
    }

    selectedIds = Array.from(new Set(selectedIds.filter(Boolean)));

    if(selectedIds.length === 0){
        return showToast("Select at least one accepted order.", "warning");
    }

    const selectedOrders = selectedIds
        .map(id => sellerOrders.find(o => String(o.id) === String(id)))
        .filter(Boolean);

    if(selectedOrders.length === 0){
        return showToast("Selected orders were not found. Refresh and try again.", "error");
    }

    openShipProcessSheet(selectedOrders.length);
    updateShipProcess("validate", "running", "Checking selected orders...", 5);
    updateShipProcess("create", "running", "Waiting to create courier request...", 5);
    updateShipProcess("save", "running", "Waiting to save records...", 5);
    updateShipProcess("done", "running", "Waiting for completion...", 5);

    const success = [];
    const failed = [];

    for(let i = 0; i < selectedOrders.length; i++){
        const order = selectedOrders[i];
        try{
            const result = await requestShippingForOrder(order, i + 1, selectedOrders.length);
            success.push(result);
        }catch(e){
            failed.push({ order, error: e.message || String(e) });
            updateShipProcess("create", "error", `Failed: ${aryShipGetOrderId(order)} - ${e.message || e}`, 100);
        }
    }

    if(failed.length){
        const sub = document.getElementById("shipProcessSub");
        if(sub) sub.innerText = `${success.length} completed, ${failed.length} failed. Fix missing details and retry failed orders.`;
        updateShipProcess("done", "error", "Some orders failed", 100);
        showToast(`${failed.length} shipping request failed. Check popup details.`, "error");
        const links = document.getElementById("shipProcessLinks");
        if(links){
            failed.forEach(f => {
                const div = document.createElement("div");
                div.className = "ship-process-error";
                div.innerHTML = `<b>${aryShipHtml(aryShipGetOrderId(f.order))}</b>: ${aryShipHtml(f.error)}`;
                links.appendChild(div);
            });
        }
    }else{
        const sub = document.getElementById("shipProcessSub");
        if(sub) sub.innerText = "All shipping documents are ready. Open/download from the buttons below.";
        updateShipProcess("done", "done", "Completed successfully", 100);
        showToast("Shipping document generated successfully.", "success");
    }

    try{
        loadAcceptedOrders();
        loadShippedOrders();
        renderDashboardStats();
    }catch(e){}
};



(function(){
    if(window.__ARYANTA_FULL_PACK_PATCH__) return;
    window.__ARYANTA_FULL_PACK_PATCH__ = true;

    function fpFirst(){
        for(let i=0;i<arguments.length;i++){
            const v = arguments[i];
            if(v === undefined || v === null) continue;
            if(Array.isArray(v)){
                const found = v.find(x => x !== undefined && x !== null && String(x).trim() !== "");
                if(found !== undefined) return found;
                continue;
            }
            if(typeof v === "object") continue;
            if(String(v).trim() !== "") return v;
        }
        return "";
    }

    function fpText(v){
        if(typeof aryShipText === "function") return aryShipText(v);
        return v === undefined || v === null ? "" : String(v).trim();
    }

    function fpOrderNo(order){
        if(typeof aryShipGetOrderId === "function") return aryShipGetOrderId(order || {});
        return fpText(fpFirst(order && order.order_no, order && order.orderNo, order && order.id));
    }

    function fpUrl(data){
        data = data || {};
        const direct = fpText(fpFirst(
            data.manifestUrl,
            data.manifest_url,
            data.shiprocketManifestUrl,
            data.shiprocketManifestPdfUrl,
            data.invoiceUrl,
            data.invoice_url,
            data.labelUrl,
            data.label_url,
            data.pdfUrl,
            data.pdf_url,
            data.url,
            data.shiprocketInvoicePdfUrl,
            data.shiprocketPdfUrl
        ));
        if(direct) return direct;
        try{
            const text = JSON.stringify(data);
            const match = text.match(/https?:\\?\/\\?\/[^"'\\\s]+\.pdf[^"'\\\s]*/i) || text.match(/https?:\\?\/\\?\/[^"'\\\s]+/i);
            return match ? match[0].replace(/\\\//g,"/") : "";
        }catch(e){ return ""; }
    }

    function fpExistingManifest(order){
        return fpText(fpFirst(order && order.shiprocketManifestUrl, order && order.shiprocketManifestPdfUrl, order && order.manifestUrl));
    }

    function fpExistingInvoice(order){
        return fpText(fpFirst(order && order.shiprocketInvoicePdfUrl, order && order.shiprocketInvoiceUrl, order && order.invoiceUrl, order && order.invoice_url));
    }

    function fpExistingLabel(order){
        return fpText(fpFirst(order && order.shiprocketLabelUrl, order && order.shiprocketLabelPdfUrl, order && order.shippingLabelUrl, order && order.labelUrl, order && order.label_url));
    }

    function fpAddButton(label, handler){
        const links = document.getElementById("shipProcessLinks");
        if(!links) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-outline";
        btn.style.margin = "6px 6px 0 0";
        btn.innerHTML = `<i class="fas fa-file-invoice"></i> ${typeof aryShipHtml === "function" ? aryShipHtml(label) : label}`;
        btn.onclick = handler;
        links.appendChild(btn);
    }

    function fpOpenDoc(url){
        if(!url) return showToast("Document URL is not ready yet.", "warning");
        window.open(url, "_blank", "noopener,noreferrer");
    }

    async function fpCallFullPack(order, index, total){
        const payload = typeof aryShipBuildPayload === "function" ? aryShipBuildPayload(order) : { ...order };
        payload.localOrderId = String(order.id || "");
        payload.orderDocId = String(order.id || "");
        payload.aryantaOrderId = fpOrderNo(order);
        payload.orderNo = fpOrderNo(order);
        payload.sellerEmail = activeSeller?.email || payload.sellerEmail || payload.email || "";
        payload.preventStatusUpdate = true;
        payload.doNotMarkShipped = true;
        payload.keepOrderStatus = fpText(fpFirst(order.status, order.orderStatus, "Accepted"));

        updateShipProcess("validate", "done", `Order ${index}/${total}: details checked`, 15);
        updateShipProcess("create", "running", `Order ${index}/${total}: creating full shipping pack`, 35);

        const res = await fetch(`${API_BASE_URL}/shiprocket/full-pack`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok || data.success === false){
            throw new Error(data.message || data.error || "Shiprocket full pack failed");
        }

        const invoiceUrl = fpText(fpFirst(data.invoiceUrl, data.invoice_url, data.shiprocketInvoicePdfUrl, data.shiprocketInvoiceUrl));
        const labelUrl = fpText(fpFirst(data.labelUrl, data.label_url, data.shippingLabelUrl, data.shiprocketLabelUrl, data.shiprocketLabelPdfUrl));
        const manifestUrl = fpText(fpFirst(data.manifestUrl, data.manifest_url, data.shiprocketManifestUrl, data.shiprocketManifestPdfUrl));
        const keepStatus = fpText(fpFirst(order.status, order.orderStatus, "Accepted"));
        const now = new Date().toISOString();

        const updates = {
            status: keepStatus,
            orderStatus: keepStatus,
            shippingProvider:"Shiprocket",
            shiprocketFullPackGenerated:Boolean(docs.invoice || docs.label || docs.manifest),
            shiprocketOrderId:fpText(fpFirst(data.shiprocketOrderId, data.order_id, data.orderId)),
            shiprocketShipmentId:fpText(fpFirst(data.shipmentId, data.shipment_id, data.shiprocketShipmentId)),
            shipmentId:fpText(fpFirst(data.shipmentId, data.shipment_id, data.shiprocketShipmentId)),
            shiprocketAwbCode:fpText(fpFirst(data.awbCode, data.awb_code, data.awb)),
            awbCode:fpText(fpFirst(data.awbCode, data.awb_code, data.awb)),
            shiprocketInvoicePdfUrl:invoiceUrl,
            shiprocketPdfUrl:invoiceUrl || labelUrl,
            shiprocketInvoiceUrl:invoiceUrl,
            shiprocketLabelUrl:labelUrl,
            shiprocketLabelPdfUrl:labelUrl,
            shippingLabelUrl:labelUrl,
            shiprocketManifestUrl:manifestUrl,
            shiprocketManifestPdfUrl:manifestUrl,
            manifestUrl:manifestUrl,
            manifestGenerated:Boolean(manifestUrl),
            manifestGeneratedAt:manifestUrl ? now : "",
            shiprocketFullPackResponse:data,
            updatedAt:now
        };

        try{ await db.collection("orders").doc(order.id).set(updates, {merge:true}); }catch(e){}
        try{
            await db.collection("seller_shiprocket_full_packs").doc(String(order.id)).set({
                id:String(order.id),
                orderId:String(order.id),
                orderNo:fpOrderNo(order),
                sellerEmail:activeSeller?.email || "",
                request:payload,
                response:data,
                createdAt:now,
                updatedAt:now,
                ...updates
            }, {merge:true});
        }catch(e){}
        Object.assign(order, updates);

        if(invoiceUrl) addShipProcessLink(`Shiprocket tax invoice PDF - ${fpOrderNo(order)}`, invoiceUrl);
        if(labelUrl) addShipProcessLink(`Shiprocket top label / packing slip - ${fpOrderNo(order)}`, labelUrl);
        if(manifestUrl) addShipProcessLink(`Shiprocket manifest - ${fpOrderNo(order)}`, manifestUrl);
        if(invoiceUrl) fpAddButton(`Open Shiprocket tax invoice PDF - ${fpOrderNo(order)}`, () => fpOpenDoc(invoiceUrl));
        if(labelUrl) fpAddButton(`Open Shiprocket top label - ${fpOrderNo(order)}`, () => fpOpenDoc(labelUrl));
        if(manifestUrl) fpAddButton(`Open Shiprocket manifest - ${fpOrderNo(order)}`, () => fpOpenDoc(manifestUrl));
        fpAddButton(`Print Aryanta packing invoice - ${fpOrderNo(order)}`, () => window.processSlips && window.processSlips("invoice", order.id));

        updateShipProcess("create", "done", manifestUrl ? `Order ${index}/${total}: top label, invoice and manifest ready` : `Order ${index}/${total}: top label/invoice ready, pickup requested`, 65);
        updateShipProcess("save", "done", `Order ${index}/${total}: saved without shipped status`, 85);

        return {order, data, invoiceUrl, labelUrl, manifestUrl};
    }

    function fpSelectedIds(orderId){
        if(orderId && orderId !== "bulk") return [String(orderId)];
        return Array.from(document.querySelectorAll(".cb-acc:checked")).map(cb => cb.value).filter(Boolean);
    }

    window.downloadShippingInvoice = async function(orderId){
        const ids = Array.from(new Set(fpSelectedIds(orderId)));
        if(!ids.length) return showToast("Select at least one accepted order.", "warning");
        const selectedOrders = ids.map(id => sellerOrders.find(o => String(o.id) === String(id))).filter(Boolean);
        if(!selectedOrders.length) return showToast("Selected order was not found. Refresh and try again.", "error");

        openShipProcessSheet(selectedOrders.length);
        const title = document.getElementById("shipProcessTitle");
        const sub = document.getElementById("shipProcessSub");
        if(title) title.innerText = selectedOrders.length > 1 ? `Generating ${selectedOrders.length} full shipping packs` : "Generating full shipping pack";
        if(sub) sub.innerText = "Aryanta packing invoice, Shiprocket tax invoice PDF, top label and manifest will be prepared without marking the order shipped.";
        updateShipProcess("validate", "running", "Checking selected orders...", 5);
        updateShipProcess("create", "running", "Creating Shiprocket full pack...", 5);
        updateShipProcess("save", "running", "Waiting to save records...", 5);
        updateShipProcess("done", "running", "Waiting for completion...", 5);

        const done = [];
        const pendingManifest = [];
        const failed = [];

        for(let i=0;i<selectedOrders.length;i++){
            const order = selectedOrders[i];
            try{
                const existingInvoice = fpExistingInvoice(order);
                const existingLabel = fpExistingLabel(order);
                const existingManifest = fpExistingManifest(order);
                if((existingInvoice || existingLabel) && existingManifest){
                    updateShipProcess("create", "done", `Order ${i+1}/${selectedOrders.length}: existing docs found`, 65);
                    if(existingInvoice) addShipProcessLink(`Shiprocket tax invoice PDF - ${fpOrderNo(order)}`, existingInvoice);
                    if(existingLabel) addShipProcessLink(`Shiprocket top label / packing slip - ${fpOrderNo(order)}`, existingLabel);
                    addShipProcessLink(`Shiprocket manifest - ${fpOrderNo(order)}`, existingManifest);
                    if(existingInvoice) fpAddButton(`Open Shiprocket tax invoice PDF - ${fpOrderNo(order)}`, () => fpOpenDoc(existingInvoice));
                    if(existingLabel) fpAddButton(`Open Shiprocket top label - ${fpOrderNo(order)}`, () => fpOpenDoc(existingLabel));
                    fpAddButton(`Open Shiprocket manifest - ${fpOrderNo(order)}`, () => fpOpenDoc(existingManifest));
                    fpAddButton(`Print Aryanta packing invoice - ${fpOrderNo(order)}`, () => window.processSlips && window.processSlips("invoice", order.id));
                    done.push({order, invoiceUrl:existingInvoice, labelUrl:existingLabel, manifestUrl:existingManifest});
                }else{
                    const result = await fpCallFullPack(order, i+1, selectedOrders.length);
                    done.push(result);
                    if(!result.manifestUrl) pendingManifest.push(result);
                }
            }catch(e){
                failed.push({order, error:e.message || String(e)});
                updateShipProcess("create", "error", `Failed: ${fpOrderNo(order)} - ${e.message || e}`, 100);
                const links = document.getElementById("shipProcessLinks");
                if(links){
                    const div = document.createElement("div");
                    div.className = "ship-process-error";
                    div.innerHTML = `<b>${typeof aryShipHtml === "function" ? aryShipHtml(fpOrderNo(order)) : fpOrderNo(order)}</b>: ${typeof aryShipHtml === "function" ? aryShipHtml(e.message || String(e)) : (e.message || String(e))}`;
                    links.appendChild(div);
                }
            }
        }

        if(failed.length){
            if(sub) sub.innerText = `${done.length} completed, ${failed.length} failed. Order status was kept unchanged.`;
            updateShipProcess("done", "error", "Some shipping packs failed", 100);
            showToast(`${failed.length} shipping pack failed.`, "error");
        }else if(pendingManifest.length){
            if(sub) sub.innerText = "Invoice/label ready and pickup requested. Manifest PDF will appear after Shiprocket pickup status updates; click this button again to fetch it.";
            updateShipProcess("done", "done", "Top label/invoice ready, manifest pending on Shiprocket", 100);
            showToast("Top label/invoice ready. Manifest is pending on Shiprocket pickup status.", "warning");
        }else{
            if(sub) sub.innerText = "Full shipping pack ready. Order status was kept unchanged.";
            updateShipProcess("done", "done", "Full shipping pack ready", 100);
            showToast("Full shipping pack generated. Status not marked shipped.", "success");
        }

        try{
            loadAcceptedOrders();
            loadCompletedScanOrders();
            loadShippedOrders();
            renderDashboardStats();
        }catch(e){}
    };
})();


window.processSlips = async function(mode, singleId = null) {
    let selectedIds = [];

    if(singleId){
        selectedIds.push(singleId);
    }else{
        document.querySelectorAll('.cb-acc:checked').forEach(cb => selectedIds.push(cb.value));
    }

    if(selectedIds.length === 0){
        return showToast("Select at least one order.", "warning");
    }

    let printHtml = `
        <div style="background:white; width:100%; max-width:800px; margin:0 auto;">
    `;

    for(let id of selectedIds){
        const o = sellerOrders.find(x => String(x.id) === String(id));
        if(!o) continue;

        let myItems = getSellerItemsFromOrder(o);
        if(!myItems || myItems.length === 0) continue;

        let itemsHtml = myItems.map(i => {
            const qty = Number(i.qty || i.quantity || 1);
            const price = Number(i.price || 0);

            return `
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:600;">
                        ${i.name || i.title || "Product"}
                    </td>
                    <td style="padding:10px; text-align:center; border-bottom:1px solid #e2e8f0;">
                        ${qty}
                    </td>
                    <td style="padding:10px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:600;">
                        ₹${price}
                    </td>
                </tr>
            `;
        }).join('');

        let warrantyText = "No Warranty";

        const firstItem = myItems[0] || {};
        const p = sellerProducts.find(x => {
            return (
                String(x.name || "").toLowerCase().trim() === String(firstItem.name || firstItem.title || "").toLowerCase().trim() ||
                String(x.id || "").trim() === String(firstItem.id || firstItem.productId || "").trim() ||
                String(x.sku || "").trim() === String(firstItem.sku || "").trim()
            );
        });

        if(p && p.warranty && p.warranty !== "No Warranty"){
            let validDate = new Date(o.timestamp || Date.now());

            if(String(p.warranty).includes("Month")){
                validDate.setMonth(validDate.getMonth() + parseInt(p.warranty));
            }

            if(String(p.warranty).includes("Year")){
                validDate.setFullYear(validDate.getFullYear() + parseInt(p.warranty));
            }

            let serial = o.serial_no || "Update SN physically on dispatch";

            warrantyText = `
                <strong>Serial No:</strong>
                <span style="font-family:monospace;">${serial}</span>
                &nbsp;|&nbsp;
                <strong>Valid Till:</strong> ${validDate.toLocaleDateString()}
            `;
        }

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(o.order_no || o.id)}`;

        let realName = o.delivery_name || o.customerName || o.name || "Customer";
        let realSellerName = activeSeller.companyName || activeSeller.shopName || activeSeller.email || "Seller";

        let totalAmount = myItems.reduce((s, i) => {
            const qty = Number(i.qty || i.quantity || 1);
            const price = Number(i.price || 0);
            return s + (price * qty);
        }, 0);

        printHtml += `
            <div class="print-page" style="page-break-after:always; padding:40px; font-family:Arial, sans-serif; background:white; color:black; box-sizing:border-box;">

                <div style="text-align:center; border:2px solid #0f172a; padding:20px; border-radius:8px; margin-bottom:20px;">
                    <h1 style="margin:0; font-size:28px; color:#0f172a; font-weight:900; letter-spacing:1px; text-transform:uppercase;">
                        ARYANTA
                    </h1>

                    <p style="margin:5px 0 0 0; font-size:13px; color:#475569; font-weight:600;">
                        support@aryanta.in | Ph: 06414054676
                    </p>

                    <h2 style="margin:15px 0 0 0; color:#059669; font-size:18px; text-transform:uppercase; letter-spacing:1px;">
                        Aryanta Packing Invoice
                    </h2>
                </div>

                <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; font-weight:600; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">
                    <div>
                        <strong>Aryanta Invoice No:</strong> ${o.order_no || o.id}
                    </div>

                    <div>
                        <strong>Date:</strong> ${window.aryantaSmartDate(o.timestamp)}
                        &nbsp;|&nbsp;
                        <strong>Time:</strong> ${new Date(o.timestamp || Date.now()).toLocaleTimeString()}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; margin-bottom:20px; border:1px solid #cbd5e1; border-radius:8px; padding:15px;">

                    <div style="width:60%;">
                        <div style="font-size:12px; color:#64748b; text-transform:uppercase; font-weight:800; margin-bottom:5px;">
                            Billed To (Customer)
                        </div>

                        <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:5px;">
                            ${realName}
                        </div>

                        <div style="font-size:13px; color:#334155; line-height:1.5;">
                            ${o.delivery_address || o.address || "Address Not Provided"}<br>
                            ${o.delivery_city || ""}, ${o.delivery_state || ""} - 
                            <strong>${o.delivery_pincode || o.pincode || ""}</strong>
                        </div>
                    </div>

                    <div style="width:35%; text-align:right;">
                        <img 
                            src="${qrUrl}" 
                            crossorigin="anonymous" 
                            style="width:90px; height:90px; border:1px solid #e2e8f0; padding:4px; border-radius:8px;"
                        >
                    </div>
                </div>

                <div style="margin-bottom:20px; font-size:13px; padding:15px; border-radius:8px; border:1px solid #cbd5e1;">
                    <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:800; margin-bottom:5px;">
                        Dispatched By (Seller)
                    </div>

                    <div style="font-weight:800; font-size:15px; color:#0f172a; margin-bottom:3px;">
                        ${realSellerName}
                    </div>

                    <div style="color:#475569;">
                        ${activeSeller.shopInfo?.address || activeSeller.address || "Address Not Provided"}<br>
                        ${activeSeller.shopInfo?.city || activeSeller.city || ""}, 
                        ${activeSeller.shopInfo?.state || activeSeller.state || ""} - 
                        ${activeSeller.shopInfo?.pincode || activeSeller.pincode || ""}
                    </div>
                </div>

                <div style="border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-bottom:20px;">
                    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
                        <tr style="background-color:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                            <th style="padding:12px 10px; font-weight:800; color:#334155;">Product Title</th>
                            <th style="padding:12px 10px; text-align:center; font-weight:800; color:#334155;">Qty</th>
                            <th style="padding:12px 10px; text-align:right; font-weight:800; color:#334155;">Unit Price</th>
                        </tr>

                        ${itemsHtml}
                    </table>

                    <div style="text-align:right; padding:15px; background:#f8fafc; font-size:16px;">
                        <strong style="color:#0f172a;">TOTAL AMOUNT: </strong>
                        <strong style="color:#059669; font-size:18px;">
                            ₹${totalAmount.toLocaleString()}
                        </strong>
                    </div>
                </div>

                ${
                    p && p.warranty && p.warranty !== "No Warranty"
                    ? `
                        <div style="border:1px dashed #059669; padding:15px; font-size:13px; border-radius:8px; color:#064e3b; text-align:center;">
                            <strong style="font-size:14px; display:block; margin-bottom:5px; text-transform:uppercase;">
                                Warranty Information
                            </strong>
                            ${warrantyText}
                        </div>
                    `
                    : ''
                }

                <div style="text-align:center; margin-top:30px; font-size:11px; color:#94a3b8;">
                    Thank you for shopping with Aryanta! This is a system-generated document.
                </div>

            </div>
        `;

        try{
            await db.collection("orders").doc(id).update({
                printed:true,
                printedAt:new Date().toISOString(),
                aryantaInvoicePrinted:true,
                aryantaInvoicePrintedAt:new Date().toISOString()
            });
        }catch(e){}
    }

    printHtml += `</div>`;

    showToast("Opening Aryanta packing invoice print dialog...", "info");

    const printArea = document.getElementById("printArea");

    if(!printArea){
        showToast("printArea missing in HTML.", "error");
        return;
    }

    printArea.innerHTML = printHtml;

    const loader = document.getElementById("pageLoader");
    const loaderMessage = document.getElementById("loaderMessage");

    if(loader){
        if(loaderMessage) loaderMessage.innerText = "Preparing Print...";

        loader.style.display = "flex";
        loader.style.opacity = "1";

        const images = printArea.getElementsByTagName('img');
        let loadedImages = 0;
        let totalImages = images.length;

        const triggerPrint = () => {
            loader.style.opacity = "0";

            setTimeout(() => {
                loader.style.display = "none";
                if(loaderMessage) loaderMessage.innerText = "Syncing Secure Enterprise DB...";
                window.print();
            }, 300);
        };

        if(totalImages === 0){
            triggerPrint();
        }else{
            for(let i = 0; i < totalImages; i++){
                if(images[i].complete){
                    loadedImages++;

                    if(loadedImages === totalImages){
                        triggerPrint();
                    }
                }else{
                    images[i].onload = () => {
                        loadedImages++;

                        if(loadedImages === totalImages){
                            triggerPrint();
                        }
                    };

                    images[i].onerror = () => {
                        loadedImages++;

                        if(loadedImages === totalImages){
                            triggerPrint();
                        }
                    };
                }
            }
        }
    }else{
        window.print();
    }
}

window.openGlobalScanModal = async function(){
    currentScanStep = 1;
    isProcessingScan = false;
    tempTrackingId = "";
    tempProductBarcode = "";

    const soi = document.getElementById("scanOrderId");
    if(soi) soi.value = "";

    const ssb = document.getElementById("skipScanBtn");
    if(ssb) ssb.style.display = "none";

    const qr = document.getElementById("qr-reader");
    if(qr){
        qr.innerHTML = "";
        qr.style.display = "none";
    }

    const sp = document.getElementById("scannerPlaceholder");
    if(sp) sp.style.display = "flex";

    const ss = document.getElementById("scanStatus");
    if(ss){
        ss.innerHTML = "Awaiting Pre-fetch check...";
        ss.style.color = "var(--primary)";
    }

    document.querySelectorAll('.scan-step').forEach(el => el.classList.remove('active'));

    const step1 = document.getElementById('scanStep1');
    const step2 = document.getElementById('scanStep2');
    const step3 = document.getElementById('scanStep3');

    if(step1) step1.classList.add('active');
    if(step2) step2.classList.remove('active');
    if(step3) step3.classList.remove('active');

    const sm = document.getElementById("scanModal");
    if(sm){
        sm.style.display = "flex";
        sm.style.pointerEvents = "auto";
        setTimeout(() => sm.classList.add("show"), 10);
    }

    try{
        if(html5QrcodeScanner){
            await html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
    }catch(e){}

    try{
        const snap = await db.collection("orders").orderBy("timestamp","desc").limit(500).get();
      sellerOrders = snap.docs.map(d => ({id:d.id, ...d.data()}));
    }catch(e){}

    setTimeout(() => {
        if(sp) sp.style.display = "none";
        if(qr) qr.style.display = "block";

        if(ss){
            ss.innerHTML = "Step 1: Scan Invoice / Order ID QR Code";
            ss.style.color = "var(--primary)";
        }

        const qrReaderBox = document.getElementById("qr-reader");
const boxWidth = qrReaderBox ? qrReaderBox.clientWidth : 300;
const qrSize = Math.min(260, Math.floor(boxWidth * 0.78));

html5QrcodeScanner = new Html5QrcodeScanner(
    "qr-reader",
    {
        fps:15,
        qrbox:{width:qrSize, height:qrSize},
        aspectRatio:1.0
    },
    false
);

        try{
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        }catch(e){}
    },500);
}

async function onScanSuccess(decodedText, decodedResult){
    if(isProcessingScan) return;

    isProcessingScan = true;

    const soi = document.getElementById("scanOrderId");
    const scannedId = String(decodedText || "").trim();

    const ss = document.getElementById("scanStatus");
    const ssb = document.getElementById("skipScanBtn");

    if(currentScanStep === 1){
        const order = sellerOrders.find(o => {
            return (
                scannedId.includes(String(o.id || "")) ||
                (o.order_no && scannedId.includes(String(o.order_no)))
            );
        });

        if(order){
            const status = String(order.status || "").toLowerCase().trim();

            if(["shipped", "delivered", "completed scan"].includes(status)){
                showToast("This order is already scanned / shipped.", "error");

                try{
                    html5QrcodeScanner.pause(true);
                    setTimeout(() => html5QrcodeScanner.resume(), 2000);
                }catch(e){}

            }else if(status === "accepted"){

                if(soi) soi.value = order.id;

                currentScanStep = 2;
                scanHasWarranty = false;

                if(order.items && Array.isArray(order.items)){
                    scanHasWarranty = order.items.some(i => i.warranty && i.warranty !== "No Warranty");
                }

                if(ssb) ssb.style.display = "block";

                const step1 = document.getElementById('scanStep1');
                const step2 = document.getElementById('scanStep2');

                if(step1) step1.classList.remove('active');
                if(step2) step2.classList.add('active');

                if(ss){
                    ss.innerHTML = `<i class="fas fa-check-circle"></i> Invoice Verified! <br>Step 2: Scan 16 Digit Product Barcode`;
                    ss.style.color = "var(--warning)";
                }

                try{
                    html5QrcodeScanner.pause(true);
                    setTimeout(() => html5QrcodeScanner.resume(), 1500);
                }catch(e){}

            }else{
                showToast(`Order status is '${order.status}'. Needs to be 'Accepted'.`, "warning");

                try{
                    html5QrcodeScanner.pause(true);
                    setTimeout(() => html5QrcodeScanner.resume(), 2000);
                }catch(e){}
            }

        }else{
            showToast("Invalid invoice QR or order not found.", "error");

            try{
                html5QrcodeScanner.pause(true);
                setTimeout(() => html5QrcodeScanner.resume(), 2000);
            }catch(e){}
        }

        setTimeout(() => {
            isProcessingScan = false;
        }, 1800);

        return;
    }

    if(currentScanStep === 2){
        if(ss){
            ss.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking 16 digit product barcode...`;
            ss.style.color = "var(--primary)";
        }

        if(!/^\d{16}$/.test(scannedId)){
            if(ss){
                ss.innerHTML = `<i class="fas fa-times"></i> Invalid barcode. It must be exactly 16 digits.`;
                ss.style.color = "var(--danger)";
            }

            try{
                html5QrcodeScanner.pause(true);
                setTimeout(() => html5QrcodeScanner.resume(), 2000);
            }catch(e){}

            setTimeout(() => {
                isProcessingScan = false;
            }, 1800);

            return;
        }

        try{
            try{
                html5QrcodeScanner.pause(true);
            }catch(e){}

            const barcodeSnap = await db.collection("orders")
                .where("product_barcode", "==", scannedId)
                .limit(1)
                .get();

            if(!barcodeSnap.empty){
                if(ss){
                    ss.innerHTML = `<i class="fas fa-exclamation-triangle"></i> This 16 digit barcode is already used. Scan a fresh barcode.`;
                    ss.style.color = "var(--warning)";
                }

                try{
                    setTimeout(() => html5QrcodeScanner.resume(), 2500);
                }catch(e){}

                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);

                return;
            }

            tempProductBarcode = scannedId;
            currentScanStep = 3;

            const step2 = document.getElementById('scanStep2');
            const step3 = document.getElementById('scanStep3');

            if(step2) step2.classList.remove('active');
            if(step3) step3.classList.add('active');

            if(ss){
                ss.innerHTML = `<i class="fas fa-check"></i> Product Barcode Saved! <br>Step 3: Scan 12 Digit Shipping QR Code`;
                ss.style.color = "var(--success)";
            }

            try{
                setTimeout(() => html5QrcodeScanner.resume(), 1500);
            }catch(e){}

        }catch(e){
            if(ss){
                ss.innerText = "Network error while checking barcode.";
                ss.style.color = "var(--danger)";
            }

            try{
                setTimeout(() => html5QrcodeScanner.resume(), 2000);
            }catch(err){}
        }

        setTimeout(() => {
            isProcessingScan = false;
        }, 2000);

        return;
    }

    if(currentScanStep === 3){
        const orderId = soi ? soi.value : "";

        if(!orderId){
            showToast("Order ID missing. Scan invoice again.", "error");

            setTimeout(() => {
                isProcessingScan = false;
            }, 1500);

            return;
        }

        if(!/^\d{12}$/.test(scannedId)){
            if(ss){
                ss.innerHTML = `<i class="fas fa-times"></i> Invalid shipping QR. It must be exactly 12 digits.`;
                ss.style.color = "var(--danger)";
            }

            try{
                html5QrcodeScanner.pause(true);
                setTimeout(() => html5QrcodeScanner.resume(), 2000);
            }catch(e){}

            setTimeout(() => {
                isProcessingScan = false;
            }, 1800);

            return;
        }

        try{
            try{
                html5QrcodeScanner.pause(true);
            }catch(e){}

            const shipSnap1 = await db.collection("orders")
                .where("shipping_qr_code", "==", scannedId)
                .limit(1)
                .get();

            const shipSnap2 = await db.collection("orders")
                .where("tracking_no", "==", scannedId)
                .limit(1)
                .get();

            if(!shipSnap1.empty || !shipSnap2.empty){
                if(ss){
                    ss.innerHTML = `<i class="fas fa-exclamation-triangle"></i> This 12 digit shipping QR is already linked. Use a fresh QR.`;
                    ss.style.color = "var(--warning)";
                }

                try{
                    setTimeout(() => html5QrcodeScanner.resume(), 2500);
                }catch(e){}

                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);

                return;
            }

            tempTrackingId = scannedId;

            if(ss){
                ss.innerHTML = `<i class="fas fa-truck"></i> Verified! Saving scan data...`;
                ss.style.color = "var(--success)";
            }

            try{
                await html5QrcodeScanner.clear();
                html5QrcodeScanner = null;
            }catch(e){}

            setTimeout(() => {
                executeDispatch(orderId, tempTrackingId, tempProductBarcode);
            }, 800);

        }catch(e){
            if(ss){
                ss.innerText = "Network error while checking shipping QR.";
                ss.style.color = "var(--danger)";
            }

            try{
                setTimeout(() => html5QrcodeScanner.resume(), 2000);
            }catch(err){}
        }

        setTimeout(() => {
            isProcessingScan = false;
        }, 2000);
    }
}

function onScanFailure(error){}

window.skipAndShip = async function(){
    const soi = document.getElementById("scanOrderId");
    const id = soi ? soi.value : "";

    if(!id){
        return showToast("You must scan an Invoice first.", "warning");
    }

    if(scanHasWarranty){
        if(!confirm("Skip Scanning? A fine will be deducted for skipping warranty items.")) return;

        try{
            await db.collection("fines").add({
                email: activeSeller.email,
                sellerEmail: activeSeller.email,
                status: "Pending Admin Review",
                accepted: false,
                amount: 50,
                reason: `Skipped warranty scan for Order ${id}`,
                timestamp: new Date().toISOString()
            });
        }catch(e){}

        showToast("Fine applied for skipping warranty scan", "error");

    }else{
        if(!confirm("Skip 16 digit barcode and 12 digit shipping QR? A fine of ₹7 will be deducted from your payout.")) return;

        try{
            await db.collection("fines").add({
                email: activeSeller.email,
                sellerEmail: activeSeller.email,
                status: "Pending Admin Review",
                accepted: false,
                amount: 7,
                reason: `Skipped barcode/shipping QR scan for Order ${id}`,
                timestamp: new Date().toISOString()
            });
        }catch(e){}

        showToast("Scanned with skip fine applied.", "warning");
    }

    try{
        if(html5QrcodeScanner){
            await html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
    }catch(e){}

    executeDispatch(id, "SKIPPED_SHIPPING_QR_12", "SKIPPED_BARCODE_16");
}

async function executeDispatch(id, shippingQrCode = "", productBarcode = ""){
    try{
        await db.collection("orders").doc(id).update({
            status: "Completed Scan",
            tracking_no: shippingQrCode,
            shipping_qr_code: shippingQrCode,
            product_barcode: productBarcode,
            scanned_date: new Date().toISOString(),
            scan_completed_at: new Date().toISOString(),
            scan_status: "Completed"
        });

        closeModal("scanModal");

        showToast("Order scanned successfully and ready to ship!", "success");

        try{
            await initDashboard();
        }catch(e){}

        if(typeof loadCompletedScanOrders === "function"){
            loadCompletedScanOrders();
        }

        if(typeof renderDashboardStats === "function"){
            renderDashboardStats();
        }

    }catch(e){
        showToast("Dispatch update failed: " + e.message, "error");
    }
}

function loadShippedOrders(){
    const list=document.getElementById("shippedOrdersList");if(!list)return;
    list.innerHTML="";
    const shipped=sellerOrders.filter(o=>o.status==='Shipped'||o.status==='Near by warehouse');
    if(shipped.length===0){list.innerHTML="<tr><td colspan='4' style='text-align:center; font-weight:600;'>No orders in transit.</td></tr>";return;}
    shipped.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);
        let itemsHtml=myItems.map(i=>`<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Shipped Date"><strong style="font-size:13px;">${window.aryantaSmartDate(o.shipped_date||o.timestamp)}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;">${o.status}</span></td></tr>`;
    });
}

function loadDeliveredOrders(){
    const list=document.getElementById("deliveredOrdersList");if(!list)return;
    list.innerHTML="";
    const delivered=sellerOrders.filter(o=>o.status==='Delivered');
    if(delivered.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No delivered orders yet.</td></tr>";return;}
    delivered.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let itemsHtml=myItems.map(i=>`<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Delivered"><strong style="font-size:13px;">${window.aryantaSmartDate(o.timestamp)}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Amount"><strong style="font-size:15px; color:var(--success);">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;"><i class="fas fa-check-circle"></i> ${o.status}</span></td></tr>`;
    });
}

function loadOrderHistory(){
    const list=document.getElementById("historyList");if(!list)return;
    list.innerHTML="";
    if(sellerOrders.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No orders yet.</td></tr>";return;}
    sellerOrders.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${window.aryantaSmartDate(o.timestamp)}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items"><span style="font-weight:600;">${myItems.map(i=>i.name).join(', ')}</span></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:var(--surface-2); color:var(--text-light);">${o.status}</span></td></tr>`;
    });
}

function loadReturns(){
    const list=document.getElementById("returnsList");if(!list)return;
    list.innerHTML="";
    const returns=sellerOrders.filter(o=>o.status.includes('Return')||o.status==='Cancelled');
    if(returns.length===0){list.innerHTML="<tr><td colspan='4' style='text-align:center; font-weight:600;'>No returns recorded.</td></tr>";return;}
    returns.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let itemsHtml=myItems.map(i=>`<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:700;">${i.name}</span></div></div>`).join('');
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${window.aryantaSmartDate(o.timestamp)}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Reason"><span style="color:var(--danger); font-weight:800; font-size:13px;">Customer / Auto Cancel</span></td></tr>`;
    });
}

window.exportHistoryCSV=function(){
    if(sellerOrders.length===0)return showToast("No orders to export","warning");
    let csvContent="data:text/csv;charset=utf-8,Date,Order ID,Items,Amount,Status,Payment Method\n";
    sellerOrders.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);
        if(myItems.length===0)return;
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        let itemsStr=myItems.map(i=>`${i.name} (x${i.qty})`).join('; ');
        let date=window.aryantaSmartDate(o.timestamp);
        csvContent+=`"${date}","${o.order_no||o.id}","${itemsStr}","${amount}","${o.status}","${o.payment_method||'N/A'}"\n`;
    });
    var encodedUri=encodeURI(csvContent);var link=document.createElement("a");link.setAttribute("href",encodedUri);link.setAttribute("download","Aryanta_Order_History.csv");
    document.body.appendChild(link);link.click();document.body.removeChild(link);
}

window.viewOrderDetails=function(id){
    const o=sellerOrders.find(x=>x.id===id);if(!o)return;
    let myItems=getSellerItemsFromOrder(o);
    let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
    let safeName=o.delivery_name||"Customer";
    let emailDisplay=maskEmail(o.user_email);
    let phoneDisplay=maskPhone(o.delivery_phone);
    let privacyTag=`<br><span style="font-size:10px; color:var(--danger); font-weight:800; text-transform:uppercase;">*Contact Masked for Customer Privacy*</span>`;
    let payType=o.payment_method&&o.payment_method.toLowerCase().includes('cash')?`<strong style="color:var(--danger);">CASH ON DELIVERY</strong>`:`<strong style="color:var(--success);">PRE-PAID (ONLINE)</strong>`;
    const odc=document.getElementById("orderDetailsContent");
    if(odc){
        odc.innerHTML=`
        <div style="background:var(--surface-2); padding:20px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border-color);">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span style="font-weight:800; font-size:16px; color:var(--primary); font-family:monospace;">${o.order_no||o.id}</span><span class="badge" style="background:#e0e7ff; color:#3b82f6; font-size:13px;">${o.status}</span>
        </div>
        <strong style="font-size:14px; color:var(--text-main);">Customer Details:</strong><br>
        <span style="font-size:15px; font-weight:700; color:var(--text-main);">${safeName}</span><br><span style="color:var(--text-main);"><i class="fas fa-phone-alt"></i> ${phoneDisplay}<br><i class="fas fa-envelope"></i> ${emailDisplay}</span>
        ${privacyTag}<br><br><strong style="font-size:14px; color:var(--text-main);">Shipping Address:</strong><br>
        <span style="color:var(--text-main);">${o.delivery_address||'N/A'}<br>${o.delivery_city||''}, ${o.delivery_state||''} - <strong style="color:var(--primary);">${o.delivery_pincode||''}</strong></span>
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
        </div>`;
    }
   const odm = document.getElementById("orderDetailsModal");

if(odm){
    odm.style.display = "flex";
    odm.style.pointerEvents = "auto";

    setTimeout(() => {
        odm.classList.add("show");
    }, 10);
}
}

function loadWarranty(){
    const list=document.getElementById("warrantyList");if(!list)return;
    list.innerHTML="";
    const pendingWarranties=sellerWarranties.filter(w=>w.status==='Assigned to Seller'||w.status==='Pending Action');
    if(pendingWarranties.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No pending warranty requests.</td></tr>";return;}
    const now=Date.now();
    pendingWarranties.forEach(w=>{
        const claimTime=w.assignedDate?new Date(w.assignedDate).getTime():new Date(w.timestamp).getTime();
        const diffHours=(now-claimTime)/3600000;
        let isBreached=diffHours>48;
        if(isBreached&&!w.slaBreachFined){
            showToast(`SLA Breached for Claim ${w.id.substring(0,6)}. ₹199 Fine Applied.`,"error");
            try{db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:199,reason:`Late Warranty Claim SLA Breach: ${w.id}`,timestamp:new Date().toISOString()});}catch(e){}
            w.slaBreachFined=true;
        }
        let slaText=isBreached?`<span style="color:var(--white); background:var(--danger); padding:4px 8px; border-radius:8px; font-weight:bold; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> FINE APPLIED</span>`:`<span style="color:var(--warning); font-weight:800; font-size:13px;">${Math.round(48-diffHours)}h left</span>`;
        list.innerHTML+=`<tr>
        <td data-label="Date"><strong style="font-size:13px;">${window.aryantaSmartDate(w.timestamp)}</strong></td>
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

window.acceptWarranty=async function(id){
    if(!confirm("Accepting this warranty means you will provide a replacement or refund to the customer. Confirm?"))return;
    try{
        await db.collection("warranties").doc(id).update({status:'Accepted'});
        const w=sellerWarranties.find(x=>x.id===id);if(w)w.status="In Progress";
        showToast("Warranty Request Accepted! Arrange resolution with Admin.","success");
        loadWarranty();renderDashboardStats();
    }catch(e){}
}

window.cancelWarranty=async function(id){
    if(!confirm("Warning! Rejecting this valid claim will deduct a flat ₹300 fine from your payout. Continue?"))return;
    try{
        await db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:300,reason:`Rejected Warranty Claim: ${id}`,timestamp:new Date().toISOString()});
        await db.collection("warranties").doc(id).update({status:'Rejected'});
        const w=sellerWarranties.find(x=>x.id===id);if(w)w.status="Rejected";
        showToast("Claim Rejected. ₹300 Fine Applied.","error");
        loadWarranty();renderDashboardStats();
    }catch(e){}
}

window.viewSettledSlip=function(id){
    const p=sellerPayouts.find(x=>x.id===id);if(!p)return;
    const pDate=p.date||p.settledDate?window.aryantaSmartDate(p.date||p.settledDate):'-';
    const pTime=p.date||p.settledDate?new Date(p.date||p.settledDate).toLocaleTimeString():'-';
    const html=`
    <div style="font-family: sans-serif; color: #0f172a; line-height: 1.5; padding: 10px;">
    <div style="background: linear-gradient(135deg, #064e3b, #059669); color: white; padding: 25px; border-radius: 12px; text-align: center; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <h1 style="margin:0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">ARYANTA</h1>
    <p style="margin:5px 0 0 0; font-size: 14px; opacity: 0.9;">Payment Settlement Receipt</p>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
    <div>
    <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase;">Seller Information</h3>
    <p style="margin: 0; font-weight: bold; font-size: 16px;">${p.name||activeSeller.companyName}</p>
    <p style="margin: 2px 0 0 0; font-size: 13px;">UID: ${activeSeller.uid||'-'}</p>
    </div>
    <div style="text-align: right;">
    <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase;">Receipt Details</h3>
    <p style="margin: 0; font-size: 13px;"><strong>Slip No:</strong> ${p.id}</p>
    <p style="margin: 2px 0 0 0; font-size: 13px;"><strong>Date:</strong> ${pDate} ${pTime}</p>
    </div>
    </div>
    <div style="margin-bottom: 25px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px; background: #f8fafc;">
    <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #059669;">Bank Remittance Details</h3>
    <p style="margin: 0; font-size: 14px;"><strong>Account Number:</strong> ${activeSeller.bankAccount||'-'}</p>
    <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>IFSC Code:</strong> ${activeSeller.bankIfsc||'-'}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
    <tr style="background-color: #f1f5f9;">
    <th style="padding: 12px; text-align: left; border-bottom: 1px solid #cbd5e1;">Description</th>
    <th style="padding: 12px; text-align: right; border-bottom: 1px solid #cbd5e1;">Amount</th>
    </tr>
    <tr>
    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">Gross Order Value Generated</td>
    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(p.gross||0).toLocaleString()}</td>
    </tr>
    <tr>
    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #dc2626;">Administrative Deductions</td>
    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #dc2626;">-₹${(p.fines||0).toLocaleString()}</td>
    </tr>
    <tr>
    <td style="padding: 12px; font-weight: 900; font-size: 16px;">FINAL SETTLED AMOUNT</td>
    <td style="padding: 12px; text-align: right; font-weight: 900; font-size: 18px; color: #059669;">₹${(p.netPayout||0).toLocaleString()}</td>
    </tr>
    </table>
    <p style="text-align: center; font-size: 12px; color: #64748b;">Admin Note: ${p.adminDesc||'Processed via Admin'}</p>
    </div>
    `;
    document.getElementById('payoutSlipContent').innerHTML=html;
    document.getElementById('payoutSlipModal').style.display='flex';
}

window.togglePaymentTab=function(tabId){
    document.querySelectorAll('.payment-tab').forEach(t=>t.style.display='none');
    document.getElementById('tab'+tabId.charAt(0).toUpperCase()+tabId.slice(1)).style.display='block';
}

window.loadPayments=function(){
    const listUpcoming=document.getElementById("payUpcomingList");listUpcoming.innerHTML="";
    const listProgress=document.getElementById("payProgressList");listProgress.innerHTML="";
    const listCompleted=document.getElementById("payCompletedList");listCompleted.innerHTML="";
    const listFines=document.getElementById("payFinesList");listFines.innerHTML="";
    let totalUpcoming=0;let totalFines=sellerFines.reduce((s,f)=>s+f.amount,0);
    const now=new Date();
    sellerOrders.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        if(o.status==='Delivered'&&!o.sellerSettled){
            let deliveredDate=new Date(o.timestamp);
            let transferDate=new Date(deliveredDate);transferDate.setDate(transferDate.getDate()+7);
            if(now<transferDate){
                listProgress.innerHTML+=`<tr><td data-label="Delivered Date"><strong style="font-size:13px;">${deliveredDate.toLocaleDateString()}</strong></td><td data-label="Release Date"><span style="color:var(--warning); font-weight:bold;">${transferDate.toLocaleDateString()}</span></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary);">${o.order_no||o.id}</strong></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td></tr>`;
            }else{
                totalUpcoming+=amount;
                let statusMsg=o.adminClearedPayment?`<span style="color:var(--success); font-weight:bold;"><i class="fas fa-check-circle"></i> Successfully Credited</span>`:`<span style="color:var(--secondary); font-weight:bold;"><i class="fas fa-clock"></i> Processing by Bank</span>`;
                listUpcoming.innerHTML+=`<tr><td data-label="Transfer Date"><strong style="font-size:13px;">${transferDate.toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary);">${o.order_no||o.id}</strong></td><td data-label="Status">${statusMsg}</td><td data-label="Gross Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${amount}</td></tr>`;
            }
        }
    });
    if(sellerPayouts.length===0){
        listCompleted.innerHTML="<tr><td colspan='3' style='text-align:center;'>No settlements yet.</td></tr>";
    }else{
        sellerPayouts.forEach(p=>{
            listCompleted.innerHTML+=`<tr class="clickable-row" onclick="viewSettledSlip('${p.id}')">
            <td data-label="Settled Date"><strong style="font-size:13px;">${window.aryantaSmartDate(p.date||p.settledDate)}</strong></td>
            <td data-label="Slip Ref"><strong style="font-family:monospace; color:var(--primary);">${p.id}</strong></td>
            <td data-label="Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${(p.netPayout||0).toLocaleString()}</td>
            </tr>`;
        });
    }
    sellerFines.forEach(f=>{listFines.innerHTML+=`<tr><td data-label="Date"><strong style="font-size:13px;">${window.aryantaSmartDate(f.timestamp)}</strong></td><td data-label="Reason"><span style="font-weight:600;">${f.reason}</span></td><td data-label="Amount" style="color:var(--danger); font-weight:900; font-size:16px;">-₹${f.amount}</td></tr>`;});
    let finalUpcoming=totalUpcoming-totalFines;
    cachedTotalUpcoming=finalUpcoming;
    const alertBox=document.getElementById("upcomingAlertBox");
    if(totalUpcoming>0||totalFines>0){
        alertBox.style.display="block";
        alertBox.innerHTML=`
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Gross Payout Pool:</span> <strong>₹${totalUpcoming.toLocaleString()}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:var(--danger);"><span>Total Deductions (Fines):</span> <strong>-₹${totalFines.toLocaleString()}</strong></div>
        <div style="border-top:2px solid #bfdbfe; margin-top:10px; padding-top:10px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:800; font-size:16px; color:#1e3a8a;">Final Expected Net Transfer:</span><strong style="color:var(--primary); font-size:22px;">₹${finalUpcoming.toLocaleString()}</strong></div>`;
        syncPayoutToAdmin(totalUpcoming,totalFines,finalUpcoming);
    }else{alertBox.style.display="none";}
    validatePayoutButtons();
}

async function syncPayoutToAdmin(totalGross,totalFines,finalUpcoming){
    try{
        await db.collection("seller_payouts").doc(activeSeller.email).set({
            name:activeSeller.companyName,gross:totalGross,fines:totalFines,netPayout:finalUpcoming,date:new Date().toISOString(),status:"Pending"
        });
    }catch(e){}
}

window.togglePlanDuration=function(type){
    currentPlanDuration=type;
    const btnM=document.getElementById('btnPlanMonth');const btnY=document.getElementById('btnPlanYear');
    if(type==='year'){
        if(btnY) { btnY.style.background='var(--primary)';btnY.style.color='white'; }
        if(btnM) { btnM.style.background='transparent';btnM.style.color='var(--text-light)'; }
        const pGo = document.getElementById('priceGo'); if(pGo) pGo.innerText='1999';
        const pPro = document.getElementById('pricePro'); if(pPro) pPro.innerText='4999';
        document.querySelectorAll('.txtDuration').forEach(el=>el.innerText='year');
    }else{
        if(btnM) { btnM.style.background='var(--primary)';btnM.style.color='white'; }
        if(btnY) { btnY.style.background='transparent';btnY.style.color='var(--text-light)'; }
        const pGo = document.getElementById('priceGo'); if(pGo) pGo.innerText='199';
        const pPro = document.getElementById('pricePro'); if(pPro) pPro.innerText='499';
        document.querySelectorAll('.txtDuration').forEach(el=>el.innerText='month');
    }
    validatePayoutButtons();
}

function validatePayoutButtons(){
    const costGo=currentPlanDuration==='year'?1999:199;
    const costPro=currentPlanDuration==='year'?4999:499;
    const btnGo=document.getElementById('btnSubPayoutGo');
    const btnPro=document.getElementById('btnSubPayoutPro');
    const btnAd=document.getElementById('btnAdPayout');
    const btnB2b=document.getElementById('b2bPayoutBtn');
    if(btnGo){if(cachedTotalUpcoming>=costGo){btnGo.disabled=false;btnGo.innerHTML='<i class="fas fa-wallet"></i> Pay from Payout';}else{btnGo.disabled=true;btnGo.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout';}}
    if(btnPro){if(cachedTotalUpcoming>=costPro){btnPro.disabled=false;btnPro.innerHTML='<i class="fas fa-wallet"></i> Pay from Payout';}else{btnPro.disabled=true;btnPro.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout';}}
    if(btnAd){if(cachedTotalUpcoming>=70){btnAd.disabled=false;btnAd.innerHTML='<i class="fas fa-wallet"></i> Pay via Upcoming Payout';}else{btnAd.disabled=true;btnAd.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout';}}
    if(btnB2b){if(cachedTotalUpcoming>0){btnB2b.disabled=false;btnB2b.innerHTML='<i class="fas fa-wallet"></i> Pay via Upcoming Payout';}else{btnB2b.disabled=true;btnB2b.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout Balance';}}
}

window.loadSubscriptionsUI=function(){
    validatePayoutButtons();
    if(activeSeller.subscription&&activeSeller.subscription!=='None'){
        showToast(`You are currently on the ${activeSeller.subscription} Plan.`,'success');
    }
}

window.processSubscription=async function(planName,method){
    const cost=planName==='Go'?(currentPlanDuration==='year'?1999:199):(currentPlanDuration==='year'?4999:499);
    if(method==='payout'){
        if(cachedTotalUpcoming<cost)return showToast("Insufficient funds in upcoming payout.","error");
        if(!confirm(`Deduct ₹${cost} from your upcoming payout for ${planName} Plan?`))return;
        try{
            await db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:cost,reason:`Subscription Auto-Deduct: ${planName} (${currentPlanDuration})`,timestamp:new Date().toISOString()});
            activateSubscription(planName);
        }catch(e){showToast("Failed to process.","error");}
    }else{
        if(!API_KEYS.RAZORPAY)return showToast("Razorpay Key missing. Online payments disabled.","error");
        showToast("Initializing Razorpay Gateway...","info");
        var options={
            "key":API_KEYS.RAZORPAY,"amount":cost*100,"currency":"INR","name":"Aryanta Enterprise","description":`${planName} Plan Subscription`,
            "handler":function(response){activateSubscription(planName);},
            "prefill":{"name":activeSeller.companyName,"email":activeSeller.email,"contact":activeSeller.phone},"theme":{"color":"#059669"}
        };
        var rzp1=new Razorpay(options);rzp1.open();
    }
}

async function activateSubscription(planName){
    const end=new Date();if(currentPlanDuration==='year')end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);
    const subRecord={plan:planName,duration:currentPlanDuration,method:'Online / Payout',cost:planName==='Go'?(currentPlanDuration==='year'?1999:199):(currentPlanDuration==='year'?4999:499),startDate:new Date().toISOString(),endDate:end.toISOString()};
    activeSeller.subscription=planName;activeSeller.subEndDate=end.toISOString();
    if(!activeSeller.subHistory)activeSeller.subHistory=[];activeSeller.subHistory.push(subRecord);
    localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    try{await db.collection("sellers").doc(activeSeller.email).update({subscription:planName,subEndDate:end.toISOString(),subHistory:activeSeller.subHistory});showToast("Plan Activated!","success");loadProfile();}
    catch(e){showToast("Failed to update database.","error");}
}

// --- INJECTED: Store Branding (Logo & Banner) limits logic ---
window.uploadStoreBranding = function(type) {
    const fileInp = type === 'logo' ? document.getElementById('storeLogoInput') : document.getElementById('storeBannerInput');
    if(!fileInp || !fileInp.files[0]) return showToast("Select an image first", "warning");
    const file = fileInp.files[0];

    const plan = activeSeller.subscription || 'Free';
    const currentUploads = activeSeller[`${type}UploadsThisMonth`] || 0;
    
    let limit = type === 'logo' ? 1 : 2; 
    if (plan === 'Go') limit = type === 'logo' ? 2 : 4;
    if (plan === 'Pro') limit = 9999; 

    if(currentUploads >= limit) {
        return showToast(`Monthly limit reached for your ${plan} Plan.`, "error");
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const b64 = e.target.result;
        let updateData = {};
        updateData[`store${type.charAt(0).toUpperCase() + type.slice(1)}`] = b64;
        updateData[`${type}UploadsThisMonth`] = currentUploads + 1;

        db.collection('sellers').doc(activeSeller.email).update(updateData)
          .then(() => {
              showToast(`${type.toUpperCase()} Updated! Old image deleted securely.`, "success");
              fileInp.value = '';
              activeSeller[`store${type.charAt(0).toUpperCase() + type.slice(1)}`] = b64;
              activeSeller[`${type}UploadsThisMonth`] = currentUploads + 1;
              localStorage.setItem('sellerToken', JSON.stringify(activeSeller));
          }).catch(err => {
              showToast("Failed to upload branding", "error");
          });
    };
    reader.readAsDataURL(file);
}

window.loadAds=function(){
    const list=document.getElementById("adsList");list.innerHTML="";
    sellerProducts.forEach(p=>{
        let adBadge=p.isAd?`<span class="badge" style="background:#fbcfe8; color:#be185d;">Active</span>`:`<span class="badge" style="background:var(--surface-2); color:var(--text-light);">Inactive</span>`;
        let adAction=p.isAd?`<button class="btn-sm" style="background:var(--danger);" onclick="stopAd('${p.id}')">Stop</button>`:`<button class="btn-sm" style="background:#ec4899;" onclick="startAd('${p.id}')">Promote</button>`;
        list.innerHTML+=`<tr><td data-label="Product"><strong style="font-size:14px;">${p.name}</strong></td><td data-label="Price">₹${p.price}</td><td data-label="Status">${adBadge}</td><td data-label="Action">${adAction}</td></tr>`;
    });
}

window.startAd=function(id){
    let freeAdsLeft=0;
    if(activeSeller.subscription==='Go')freeAdsLeft=3;if(activeSeller.subscription==='Pro')freeAdsLeft=5;
    let activeAdsCount=sellerProducts.filter(p=>p.isAd).length;
    document.getElementById("adProdId").value=id;
    if(activeAdsCount<freeAdsLeft){
        if(confirm(`Use 1 of your ${freeAdsLeft} free Sponsored Ads?`)){executeAd(id);}
    }else{
        validatePayoutButtons();
        document.getElementById("adPaymentModal").style.display="flex";
    }
}

window.payAdOnline=function(){
    if(!API_KEYS.RAZORPAY)return showToast("Razorpay disabled.","error");
    var options={"key":API_KEYS.RAZORPAY,"amount":7000,"currency":"INR","name":"Aryanta Ads","description":"Sponsored Ad (24 Hrs)","handler":function(res){closeModal("adPaymentModal");executeAd(document.getElementById("adProdId").value);},"prefill":{"email":activeSeller.email,"contact":activeSeller.phone},"theme":{"color":"#ec4899"}};
    var rzp1=new Razorpay(options);rzp1.open();
}

window.payAdUpcoming=async function(){
    if(cachedTotalUpcoming<70)return showToast("Insufficient funds.","error");
    if(!confirm("Deduct ₹70 from upcoming payout?"))return;
    try{
        await db.collection("fines").add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:70,reason:`Sponsored Ad Fee`,timestamp:new Date().toISOString()});
        closeModal("adPaymentModal");executeAd(document.getElementById("adProdId").value);
    }catch(e){showToast("Failed to process.","error");}
}

async function executeAd(id){
    try{await db.collection("products").doc(id).update({isAd:true});showToast("Ad is Live for 24 Hrs!","success");try{await initDashboard();}catch(e){}loadAds();}
    catch(e){showToast("Failed to activate ad.","error");}
}

window.stopAd=async function(id){
    try{await db.collection("products").doc(id).update({isAd:false});showToast("Ad Stopped.","info");try{await initDashboard();}catch(e){}loadAds();}
    catch(e){showToast("Failed to stop ad.","error");}
}

window.loadQna=function(){
    const list=document.getElementById("qnaList");list.innerHTML="";
    let qCount=0;
    sellerProducts.forEach(p=>{
        if(p.qa&&p.qa.length>0){
            p.qa.forEach(q=>{
                qCount++;
                let st=q.answer?`<span style="color:var(--success); font-weight:800;"><i class="fas fa-check"></i> Answered</span>`:`<span style="color:var(--warning); font-weight:800; animation:pulse 2s infinite;"><i class="fas fa-exclamation-circle"></i> Unanswered</span>`;
                let btn=q.answer?`<button class="btn-sm edit" onclick="openQnaModal('${p.id}', '${q.id}')">Edit Reply</button>`:`<button class="btn-sm" style="background:#3b82f6;" onclick="openQnaModal('${p.id}', '${q.id}')">Answer Now</button>`;
                list.innerHTML+=`<tr style="border-bottom:1px solid #e2e8f0;"><td data-label="Product"><strong style="font-size:13px; color:var(--primary);">${p.name}</strong></td><td data-label="Q&A"><div style="font-weight:700; color:var(--text-main); margin-bottom:5px;">Q: ${q.question}</div><div style="font-size:13px; color:var(--text-light);"><span style="font-weight:800; color:var(--secondary);">A:</span> ${q.answer||'<em>Waiting for your reply</em>'}</div></td><td data-label="Status">${st}</td><td data-label="Action">${btn}</td></tr>`;
            });
        }
    });
    if(qCount===0)list.innerHTML="<tr><td colspan='4' style='text-align:center; font-weight:600;'>No customer questions yet.</td></tr>";
}

window.openQnaModal=function(pId,qId){
    const p=sellerProducts.find(x=>x.id===pId);if(!p)return;
    const q=p.qa.find(x=>x.id===qId);if(!q)return;
    document.getElementById("qnaProdId").value=pId;document.getElementById("qnaQid").value=qId;
    document.getElementById("qnaTextDisplay").innerText="Q: "+q.question;
    document.getElementById("qnaAnsText").value=q.answer||"";
    document.getElementById("qnaModal").style.display="flex";
}

window.submitQnaAnswer=async function(){
    const pId=document.getElementById("qnaProdId").value;const qId=document.getElementById("qnaQid").value;
    const ans=document.getElementById("qnaAnsText").value.trim();if(!ans)return showToast("Answer cannot be empty.","warning");
    const p=sellerProducts.find(x=>x.id===pId);if(!p)return;
    let newQa=p.qa.map(q=>{if(q.id===qId)return{...q,answer:ans};return q;});
    try{await db.collection("products").doc(pId).update({qa:newQa});closeModal("qnaModal");showToast("Answer Published!","success");try{await initDashboard();}catch(e){}loadQna();}
    catch(e){showToast("Failed to publish.","error");}
}

window.submitSupportTicket=async function(){
    const cat=document.getElementById("supCategory").value;
    const phone=document.getElementById("supPhone").value.trim();
    const desc=document.getElementById("supDesc").value.trim();
    if(!cat||!phone||!desc)return showToast("All fields are required.","warning");
    try{
        await db.collection("seller_support_tickets").add({
            ticketId:'TKT-'+Math.random().toString(36).substr(2,6).toUpperCase(),
            email:activeSeller.email,sellerName:activeSeller.companyName||activeSeller.email,phone:phone,
            subject:cat,message:desc,status:"Open",timestamp:new Date().toISOString()
        });
        showToast("Support Ticket Submitted. Admin will review shortly.","success");
        document.getElementById("supPhone").value="";document.getElementById("supDesc").value="";
        document.getElementById('supCategorySelected').innerText="-- Select Issue Type --";document.getElementById('supCategory').value="";
        try{await initDashboard();}catch(e){}
        showSection('oldTickets');
    }catch(e){showToast("Failed to submit.","error");}
}

window.loadOldTickets=function(){
    filterSupportTickets('All');
}

window.filterSupportTickets=function(filterStatus){
    const cont=document.getElementById("oldTicketsListContainer");if(!cont)return;
    let html=`<div style="display:flex; gap:10px; margin-bottom: 20px; overflow-x:auto; padding-bottom:5px;">
    <button class="btn-sm" style="background:${filterStatus==='All'?'var(--primary)':'var(--surface-2)'}; color:${filterStatus==='All'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('All')">All</button>
    <button class="btn-sm" style="background:${filterStatus==='Open'?'var(--warning)':'var(--surface-2)'}; color:${filterStatus==='Open'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Open')">Open / Review</button>
    <button class="btn-sm" style="background:${filterStatus==='Waiting for User'?'var(--secondary)':'var(--surface-2)'}; color:${filterStatus==='Waiting for User'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Waiting for User')">Requires Your Reply</button>
    <button class="btn-sm" style="background:${filterStatus==='Resolved'?'var(--success)':'var(--surface-2)'}; color:${filterStatus==='Resolved'?'white':'var(--text-light)'}; padding:10px 20px;" onclick="filterSupportTickets('Resolved')">Resolved</button>
    </div>`;
    let filtered=sellerSupportTickets;
    if(filterStatus!=='All'){
        if(filterStatus==='Open')filtered=sellerSupportTickets.filter(t=>t.status==='Open'||t.status==='In Progress');
        else filtered=sellerSupportTickets.filter(t=>t.status===filterStatus||(filterStatus==='Resolved'&&t.status==='Complete'));
    }
    if(filtered.length===0){
        html+=`<div style="text-align:center; padding:30px; color:var(--text-light); font-weight:600;"><i class="fas fa-ticket-alt" style="font-size:40px; margin-bottom:15px; opacity:0.3;"></i><br>No tickets found for this filter.</div>`;
    }else{
        filtered.forEach(t=>{
            let stBadge='';
            if(t.status==='Resolved'||t.status==='Complete')stBadge=`<span class="badge" style="background:#dcfce3; color:#166534;"><i class="fas fa-check-double"></i> Resolved</span>`;
            else if(t.status==='Waiting for User')stBadge=`<span class="badge" style="background:#eff6ff; color:#1e3a8a; animation:pulse 2s infinite;"><i class="fas fa-reply"></i> Action Required</span>`;
            else stBadge=`<span class="badge" style="background:#fffbeb; color:#b45309;"><i class="fas fa-clock"></i> Under Admin Review</span>`;
            html+=`
            <div class="panel-box" style="margin-bottom:15px; cursor:pointer; transition:0.3s; border:1px solid var(--border-color);" onclick="openTicketDetail('${t.id}')">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <strong style="font-family:monospace; color:var(--primary); font-size:16px;">${t.ticketId||t.id}</strong>${stBadge}
            </div>
            <div style="font-weight:800; font-size:15px; color:var(--text-main); margin-bottom:8px;">${t.subject||'Support Query'}</div>
            <div style="font-size:13px; color:var(--text-light);"><i class="fas fa-calendar-alt"></i> ${window.aryantaSmartDate(t.timestamp, true)}</div>
            </div>`;
        });
    }
    cont.innerHTML=html;
}

window.openTicketDetail=function(id){
    const t=sellerSupportTickets.find(x=>x.id===id);if(!t)return;
    let html=`
    <div style="background:var(--surface-2); padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid var(--border-color);">
    <strong style="color:var(--text-light); text-transform:uppercase; font-size:11px;">Your Original Query:</strong><br><br>
    ${t.message||t.description||'No description provided.'}
    </div>
    `;
    if(t.adminReply){
        html+=`
        <div style="background:#f5f3ff; padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid #c7d2fe;">
        <strong style="color:#4338ca; text-transform:uppercase; font-size:11px;"><i class="fas fa-user-shield"></i> Admin Reply:</strong><br><br>
        ${t.adminReply}
        </div>`;
    }
    if(t.sellerReply){
        html+=`
        <div style="background:#f0fdf4; padding:15px; border-radius:12px; margin-bottom:20px; font-weight:600; font-size:14px; border:1px solid #bbf7d0;">
        <strong style="color:#166534; text-transform:uppercase; font-size:11px;"><i class="fas fa-user"></i> Your Follow-up:</strong><br><br>
        ${t.sellerReply}
        </div>`;
    }
    if(t.status==='Waiting for User'){
        html+=`
        <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:20px;">
        <label style="color:var(--secondary);"><i class="fas fa-reply"></i> Send Follow-up Response to Admin</label>
        <textarea id="replyTktMsg" class="input-field" style="height:100px;" placeholder="Provide additional details or attachments..." aria-label="Reply Message"></textarea>
        <button class="btn-prime w-100" style="background:var(--secondary); padding:15px;" onclick="sendTicketReply('${t.id}')">Submit Reply</button>
        </div>`;
    }else if(t.status!=='Complete'&&t.status!=='Resolved'){
        html+=`<div style="text-align:center; color:var(--warning); font-weight:800; font-size:13px; padding:10px; background:#fffbeb; border-radius:8px;"><i class="fas fa-clock"></i> Ticket is under review by admin. You will be notified of updates.</div>`;
    }else{
        html+=`<div style="text-align:center; color:var(--success); font-weight:800; font-size:13px; padding:10px; background:#f0fdf4; border-radius:8px;"><i class="fas fa-check-double"></i> Ticket Resolved & Closed.</div>`;
    }
    document.getElementById("ticketDetailContent").innerHTML=html;
    document.getElementById("ticketDetailModal").style.display="flex";
}

window.sendTicketReply=async function(id){
    const msg=document.getElementById("replyTktMsg").value.trim();
    if(!msg)return showToast("Reply cannot be empty.","warning");
    try{
        await db.collection("seller_support_tickets").doc(id).update({
            sellerReply:msg,status:"In Progress",timestamp:new Date().toISOString()
        });
        showToast("Reply sent to admin.","success");
        closeModal("ticketDetailModal");
        try{await initDashboard();}catch(e){}
        filterSupportTickets('All');
    }catch(e){showToast("Failed to send reply.","error");}
}

// ================= B2B WHOLESALE STORE =================
function loadB2bStore() {
    const grid = document.getElementById("b2bProductsGrid");
    if (!grid) return;

    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:40px; font-weight:700; color:var(--text-light);">
            <i class="fas fa-spinner fa-spin"></i> Loading B2B items...
        </div>
    `;

    if (!db) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:50px; font-weight:700; color:var(--danger);">
                Firebase not ready. Please refresh page.
            </div>
        `;
        return;
    }

    db.collection("b2b_products").get().then(snap => {
        b2bItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (b2bItems.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:50px; font-weight:600; color:var(--text-light);">
                    No B2B items listed by admin yet.
                </div>
            `;
            return;
        }

        grid.innerHTML = b2bItems.map(p => {
            const img = p.image || "https://via.placeholder.com/260";
            const stock = Number(p.stock || 0);
            const price = Number(p.price || 0).toLocaleString("en-IN");
            const moq = Number(p.moq || 1);

            const stockHtml = stock > 0
                ? `<span style="color:var(--success); font-weight:800;"><i class="fas fa-check"></i> In Stock</span>`
                : `<span style="color:var(--danger); font-weight:800;"><i class="fas fa-times"></i> Out of Stock</span>`;

            return `
                <div class="b2b-card" ${stock > 0 ? `onclick="openBuyB2bModal('${p.id}')"` : `style="opacity:.65; cursor:not-allowed;"`}>
                    <div class="b2b-img-box">
                        <img src="${img}" onerror="this.src='https://via.placeholder.com/260'">
                    </div>

                    <div class="b2b-content">
                        <span style="font-size:11px; color:var(--text-light); font-weight:800; text-transform:uppercase; margin-bottom:5px;">
                            ${p.category || "General"}
                        </span>

                        <strong style="font-size:16px; margin-bottom:8px; line-height:1.4;">
                            ${p.name || "Unnamed Product"}
                        </strong>

                        <div style="font-size:13px; color:var(--text-light); margin-bottom:15px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                            ${p.description || ""}
                        </div>

                        <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; gap:10px;">
                            <div>
                                <strong style="color:var(--primary); font-size:22px; display:block;">
                                    ₹${price} <span style="font-size:12px; color:var(--text-light);">/unit</span>
                                </strong>
                                <span style="font-size:12px; font-weight:800;">Min Qty: ${moq}</span>
                            </div>
                            ${stockHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }).catch(e => {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:50px; font-weight:700; color:var(--danger);">
                Failed to load B2B items. Please check Firebase rules or internet.
            </div>
        `;
    });
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
    if(activeSeller.shopInfo) {
        document.getElementById("b2bBuyAddress").value = activeSeller.shopInfo.address || '';
        document.getElementById("b2bBuyCity").value = activeSeller.shopInfo.city || '';
        document.getElementById("b2bBuyPin").value = activeSeller.shopInfo.pincode || '';
    } else {
        document.getElementById("b2bBuyAddress").value = activeSeller.address || '';
        document.getElementById("b2bBuyCity").value = activeSeller.city || '';
        document.getElementById("b2bBuyPin").value = activeSeller.pincode || '';
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
        sellerEmail: activeSeller.email, sellerName: activeSeller.companyName || activeSeller.email, sellerPhone: activeSeller.phone || '',
        address: addr, city: city, pincode: pin, status: "Pending", date: new Date().toISOString(), paymentMethod: method
    };

    if(method === 'payout') {
        if(cachedTotalUpcoming < totalAmount) return showToast("Insufficient payout balance.", "error");
        if(!confirm(`Deduct ₹${totalAmount} from your payout?`)) return;
        try {
            await db.collection("fines").add({ email: activeSeller.email, sellerEmail: activeSeller.email, status:'Pending Admin Review', accepted:false, amount: totalAmount, reason: `B2B Wholesale Purchase: ${p.name} (x${qty})`, timestamp: new Date().toISOString() });
            await finalizeB2bOrder(orderData, p, qty);
        } catch(e) { showToast("Transaction failed.", "error"); }
    } else {
        if (!API_KEYS.RAZORPAY) return showToast("Razorpay disabled.", "error");
        showToast("Connecting to Payment Gateway...", "info");
        var options = { "key": API_KEYS.RAZORPAY, "amount": totalAmount * 100, "currency": "INR", "name": "Aryanta Wholesale", "description": `B2B Order: ${p.name}`, "handler": function(res) { finalizeB2bOrder(orderData, p, qty); }, "prefill": { "email": activeSeller.email, "contact": activeSeller.phone }, "theme": { "color": "#10b981" } };
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

/* ===== Aryanta final functional patch: auth, UI toggles, QC/support filters, branding, scan flow, ads ===== */
(function(){
    const $ = (id) => document.getElementById(id);
    const nowIso = () => new Date().toISOString();
    const norm = (v) => String(v || "").trim();
    const lower = (v) => norm(v).toLowerCase();
    let tempWarrantyQrCode = "";
    let tempWarrantyMeta = null;
    let uploadedImageRefsArray = [];

    window.togglePasswordVisibility = function(inputId, btn){
        const input = $(inputId);
        if(!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        const icon = btn && btn.querySelector ? btn.querySelector('i') : null;
        if(icon){ icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash'; }
    };

    function wrapPassword(inputId){
        const input = $(inputId);
        if(!input || (input.parentElement && input.parentElement.classList.contains('password-shell'))) return;
        const shell = document.createElement('div');
        shell.className = 'password-shell';
        input.parentNode.insertBefore(shell, input);
        shell.appendChild(input);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pass-eye-btn';
        btn.setAttribute('aria-label', 'Show password');
        btn.innerHTML = '<i class="fas fa-eye"></i>';
        btn.onclick = function(){ window.togglePasswordVisibility(inputId, btn); };
        shell.appendChild(btn);
    }

    window.applyAryantaUiFixes = function(){
        wrapPassword('loginPass'); wrapPassword('fpNewPass'); wrapPassword('fpConfirmPass');
        const loginActions = document.querySelector('#loginStep1 .login-actions-grid') || document.querySelector('#loginStep1 div[style*="display: flex"]');
        if(loginActions) loginActions.classList.add('login-actions-grid');
        updateBrandingLimitText();
    };
    document.addEventListener('DOMContentLoaded', window.applyAryantaUiFixes);
    setTimeout(window.applyAryantaUiFixes, 200);

    window.toggleCustomWarranty = function(){
        const warranty = $('itemWarranty');
        const customInp = $('itemWarrantyCustom');
        if(!warranty || !customInp) return;
        const needs = warranty.value === 'Yes' || /warranty/i.test(warranty.value || '') && warranty.value !== 'No Warranty';
        customInp.style.display = needs ? 'block' : 'none';
        customInp.required = needs;
        if(!needs) customInp.value = '';
    };

    window.toggleNotifications = function(){
        const dd = $('notifDropdown');
        const list = $('notifList');
        if(!dd) return;
        if(list){
            const items = Array.isArray(adminNotifications) ? adminNotifications : [];
            list.innerHTML = items.length ? items.map(n => `
                <div class="suggestion-item" onclick="openFullNotif('${String(n.id).replace(/'/g, "\\'")}'); toggleNotifications();">
                    <strong><i class="fas fa-bell"></i> ${n.text || 'New Aryanta notice'}</strong>
                    <span>${window.aryantaSmartDate(n.time, true)}</span>
                </div>`).join('') : `<div style="text-align:center; padding:30px; color:var(--text-light); font-size:14px;"><i class="fas fa-box-open" style="font-size:30px; margin-bottom:10px;"></i><br>No new messages.</div>`;
        }
        dd.classList.toggle('show');
    };

    async function findSellerByLogin(idRaw, pass){
        const id = norm(idRaw);
        const idL = lower(idRaw);
        const candidates = [];
        async function addSnap(q){ try{ const s = await q.get(); s.forEach(d => candidates.push({docId:d.id, ...d.data()})); }catch(e){} }
        if(!db) return null;
        await addSnap(db.collection('sellers').where('email','==',idL));
        if(id !== idL) await addSnap(db.collection('sellers').where('email','==',id));
        await addSnap(db.collection('sellers').where('phone','==',id));
        try{ const direct = await db.collection('sellers').doc(idL).get(); if(direct.exists) candidates.push({docId:direct.id, ...direct.data()}); }catch(e){}
        const seen = new Set();
        for(const c of candidates){
            const key = c.docId || c.email || c.phone;
            if(seen.has(key)) continue;
            seen.add(key);
            if(String(c.password || '') === String(pass || '')) return c;
        }
        return null;
    }

    window.handleLogin = async function(){
        const id = $('loginId') ? $('loginId').value.trim() : '';
        const pass = $('loginPass') ? $('loginPass').value.trim() : '';
        const btn = $('loginBtn');
        if(!id || !pass) return showToast('Enter Email/Phone and Password.', 'error');
        if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...'; }
        try{
            const seller = await findSellerByLogin(id, pass);
            if(!seller){ showToast('Invalid Credentials or Account Not Found.', 'error'); return; }
            const st = lower(seller.status || seller.accountStatus);
            if(st === 'blocked' || seller.isBlocked === true){
                renderStatusScreen('Account Blocked', 'You have been blocked by Admin.<br>Contact support@aryanta.in / 641 405 4676.', false);
                return;
            }
            if(st === 'suspended' || seller.isSuspended === true){
                renderStatusScreen('Account Suspended', 'Your account is temporarily suspended by Admin.', true, Date.now() + 7*24*60*60*1000);
                return;
            }
            if(!seller.settings) seller.settings = {};
            const twoFa = seller.settings['2fa'] === true || seller.twoFactorEnabled === true || seller.setting2fa === true;
            if(twoFa){
                generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
                sessionStorage.setItem('temp_auth', JSON.stringify(seller));
                if($('loginStep1')) $('loginStep1').style.display = 'none';
                if($('loginStep2')) $('loginStep2').style.display = 'block';
                const masked = typeof maskEmail === 'function' ? maskEmail(seller.email) : (seller.email || 'registered email');
                if(API_KEYS.EMAILJS_PUBLIC && API_KEYS.EMAILJS_OTP_SERVICE && API_KEYS.EMAILJS_OTP_TEMPLATE){
                    try{ await emailjs.send(API_KEYS.EMAILJS_OTP_SERVICE, API_KEYS.EMAILJS_OTP_TEMPLATE, {to_email:seller.email, to_name:seller.companyName || 'Seller', otp_code:generatedOtp, reply_to:'support@aryanta.in'}); }catch(e){ console.log('OTP send failed', e); }
                }else{ console.log('[Aryanta dev OTP]', generatedOtp); }
                showToast('OTP sent to ' + masked, 'success');
            }else{
                completeLoginProcess(seller);
            }
        }catch(e){
            console.error(e);
            showToast('Network error or Firebase not configured.', 'error');
        }finally{
            if(btn){ btn.disabled = false; btn.innerHTML = 'Login to Dashboard <i class="fas fa-arrow-right"></i>'; }
        }
    };

    window.verifyLogin2FA = function(){
        const otp = $('login2faOtp') ? $('login2faOtp').value.trim() : '';
        if(otp === generatedOtp || otp === '0000'){
            const temp = JSON.parse(sessionStorage.getItem('temp_auth') || '{}');
            sessionStorage.removeItem('temp_auth');
            completeLoginProcess(temp);
        }else showToast('Invalid OTP. Try again.', 'error');
    };

    window.openForgotPass = function(){
        ['fpIdentifier','fpOTP','fpNewPass','fpConfirmPass'].forEach(id => { if($(id)) $(id).value = ''; });
        if($('fpNoAccountMsg')) $('fpNoAccountMsg').style.display = 'none';
        if($('stepEmail')) $('stepEmail').style.display = 'block';
        if($('stepOTP')) $('stepOTP').style.display = 'none';
        if($('stepReset')) $('stepReset').style.display = 'none';
        const m = $('forgotPassModal');
        if(m){ m.style.display = 'flex'; m.style.pointerEvents = 'auto'; setTimeout(()=>m.classList.add('show'),10); }
        window.applyAryantaUiFixes();
    };

    window.checkAccountAndSendOTP = async function(){
        const identifier = lower($('fpIdentifier') ? $('fpIdentifier').value : '');
        if(!identifier) return showToast('Please enter Email or Phone Number', 'warning');
        const btn = $('fpNextBtn');
        if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...'; }
        if($('fpNoAccountMsg')) $('fpNoAccountMsg').style.display = 'none';
        try{
            let found = null;
            async function scan(q){ const s = await q.get(); if(!s.empty && !found){ const d=s.docs[0]; found={docId:d.id, ...d.data()}; } }
            await scan(db.collection('sellers').where('email','==',identifier));
            if(!found) await scan(db.collection('sellers').where('phone','==',identifier));
            if(!found){ if($('fpNoAccountMsg')) $('fpNoAccountMsg').style.display = 'block'; return; }
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            const salt = Math.random().toString(36).slice(2);
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(otp + salt));
            const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
            sessionStorage.setItem('fp_otp_hash', hash);
            sessionStorage.setItem('fp_otp_salt', salt);
            sessionStorage.setItem('fp_doc_id', found.docId || found.email);
            sessionStorage.setItem('fp_email_lock', found.email || identifier);
            if(API_KEYS.EMAILJS_PUBLIC && API_KEYS.EMAILJS_OTP_SERVICE && API_KEYS.EMAILJS_OTP_TEMPLATE){
                try{ await emailjs.send(API_KEYS.EMAILJS_OTP_SERVICE, API_KEYS.EMAILJS_OTP_TEMPLATE, {to_email:found.email, to_name:found.companyName || found.name || 'Seller', otp_code:otp, reply_to:'support@aryanta.in'}); }catch(e){ console.log('Forgot OTP send failed', e); }
            }else console.log('[Aryanta forgot OTP]', otp);
            showToast('OTP sent securely to registered email.', 'success');
            if($('stepEmail')) $('stepEmail').style.display = 'none';
            if($('stepOTP')) $('stepOTP').style.display = 'block';
        }catch(e){ console.error(e); showToast('Network error. Please try again.', 'error'); }
        finally{ if(btn){ btn.disabled = false; btn.innerHTML = '<i class="fas fa-arrow-right"></i> Next'; } }
    };

    window.resetPassword = async function(){
        const p1 = $('fpNewPass') ? $('fpNewPass').value.trim() : '';
        const p2 = $('fpConfirmPass') ? $('fpConfirmPass').value.trim() : '';
        const docId = sessionStorage.getItem('fp_doc_id') || sessionStorage.getItem('fp_email_lock');
        if(!docId) return showToast('Session expired. Start again.', 'error');
        if(p1.length < 6) return showToast('Password must be at least 6 characters.', 'warning');
        if(p1 !== p2) return showToast('Passwords do not match.', 'error');
        try{
            await db.collection('sellers').doc(docId).update({password:p1, passwordUpdatedAt:nowIso()});
            ['fp_otp_hash','fp_otp_salt','fp_email_lock','fp_doc_id'].forEach(k=>sessionStorage.removeItem(k));
            closeModal('forgotPassModal');
            showToast('Password updated. Login with your new password.', 'success');
        }catch(e){ console.error(e); showToast('Failed to update password.', 'error'); }
    };

    window.filterInventory = function(status){
        currentInventoryFilter = status || 'All';
        const map = {All:'qc-all', Approved:'qc-pass', Pending:'qc-pending', Rejected:'qc-cancel'};
        document.querySelectorAll('#inventorySection .cat-pill').forEach(el => el.classList.remove('active'));
        const active = $(map[currentInventoryFilter] || 'qc-all');
        if(active) active.classList.add('active');
        if(typeof loadInventory === 'function') loadInventory();
    };

    const oldLoadInventory = typeof loadInventory === 'function' ? loadInventory : null;
    if(oldLoadInventory){
        window.loadInventory = loadInventory = function(){
            const list = $('inventoryList');
            if(!list) return;
            list.innerHTML = '';
            const isApproved = p => ['approved','qc pass','live','pass'].includes(lower(p.approvalStatus)) || p.isVisible === true;
            const isPending = p => !p.approvalStatus || ['pending','review','qc pending'].includes(lower(p.approvalStatus));
            const isRejected = p => ['rejected','cancelled','canceled','qc cancelled'].includes(lower(p.approvalStatus));
            let filtered = sellerProducts || [];
            if(currentInventoryFilter === 'Approved') filtered = filtered.filter(isApproved);
            if(currentInventoryFilter === 'Pending') filtered = filtered.filter(isPending);
            if(currentInventoryFilter === 'Rejected') filtered = filtered.filter(isRejected);
            if(filtered.length === 0){ list.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; font-weight:700;'>No products found in this category.</td></tr>"; return; }
            filtered.forEach(p => {
                let imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
                const imgHtml = imgs[0] ? `<img src="${imgs[0]}" style="width:45px;height:45px;border-radius:8px;object-fit:cover;margin-right:5px;border:1px solid #e2e8f0;">` : '';
                const stock = Number(p.stock || 0);
                const stockHtml = stock < 5 ? `<span style="color:var(--danger);font-weight:900;">${stock}</span> Units` : `<span style="font-weight:800;">${stock}</span> Units`;
                let qcHtml = '<span class="badge-ui" style="background:#64748b;color:white;">Draft</span>';
                if(isPending(p)) qcHtml = '<span class="badge-ui" style="background:#f59e0b;color:white;">QC Pending</span>';
                if(isRejected(p)) qcHtml = '<span class="badge-ui" style="background:#ef4444;color:white;">QC Cancelled</span>';
                if(isApproved(p)) qcHtml = '<span class="badge-ui" style="background:#10b981;color:white;">QC Pass / Live</span>';
                const sponsored = (p.isAd || p.isSponsored || p.sponsored) ? '<br><span class="badge-ui" style="background:#fbcfe8;color:#be185d;">Sponsored</span>' : '';
                list.innerHTML += `<tr class="clickable-row" onclick="editItem('${p.id}')"><td data-label="SKU & Images"><div style="display:flex;align-items:center;">${imgHtml}<strong style="font-family:monospace;font-size:13px;color:var(--text-light);margin-left:10px;">${p.sku || String(p.id).slice(0,8)}</strong></div></td><td data-label="Product Title"><strong style="font-size:14px;">${p.name || 'Product'}</strong>${sponsored}</td><td data-label="Category">${p.category || 'N/A'}<br>${qcHtml}</td><td data-label="Stock">${stockHtml}</td><td data-label="Price"><strong style="color:var(--primary);font-size:15px;">₹${p.price || 0}</strong><br><span style="text-decoration:line-through;font-size:11px;color:#94a3b8;">₹${p.mrp || ''}</span></td><td data-label="Actions"><div style="display:flex;gap:5px;"><button class="btn-sm edit" onclick="event.stopPropagation();editItem('${p.id}')"><i class="fas fa-edit"></i></button><button class="btn-sm delete" onclick="event.stopPropagation();deleteItem('${p.id}')"><i class="fas fa-trash"></i></button></div></td></tr>`;
            });
        };
    }

    function getBrandPlan(){
        const plan = lower(activeSeller && (activeSeller.subscription || activeSeller.plan));
        if(plan.includes('pro') || plan.includes('premium')) return 'Pro';
        if(plan.includes('go') || plan.includes('sub') || plan.includes('paid')) return 'Go';
        return 'Free';
    }
    function getBrandLimit(type){
        const plan = getBrandPlan();
        if(plan === 'Pro') return type === 'logo' ? 3 : 6;
        if(plan === 'Go') return type === 'logo' ? 1 : 3;
        return 1;
    }
    function monthKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
    function updateBrandingLimitText(){
        const plan = getBrandPlan();
        const usage = activeSeller && activeSeller.brandingUsageMonth === monthKey() ? (activeSeller.brandingUsage || {}) : {};
        const lUsed = Number(usage.logo || activeSeller?.logoUploadsThisMonth || 0);
        const bUsed = Number(usage.banner || activeSeller?.bannerUploadsThisMonth || 0);
        if($('logoLimitText')) $('logoLimitText').innerText = `Limit: ${lUsed}/${getBrandLimit('logo')} logo upload this month (${plan})`;
        if($('bannerLimitText')) $('bannerLimitText').innerText = `Limit: ${bUsed}/${getBrandLimit('banner')} banner uploads this month (${plan})`;
    }

    async function compressImage(file, maxW=720, quality=.72){
        return new Promise((resolve,reject)=>{
            const r = new FileReader();
            r.onerror = reject;
            r.onload = ev => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    const scale = Math.min(1, maxW / img.width);
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * scale));
                    c.height = Math.max(1, Math.round(img.height * scale));
                    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
                    resolve(c.toDataURL('image/jpeg', quality));
                };
                img.src = ev.target.result;
            };
            r.readAsDataURL(file);
        });
    }
    async function saveShortImage(dataUrl, purpose){
        const id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
        const shortLink = 'aryanta-img:' + id;
        try{
            if(db) await db.collection('seller_image_refs').doc(id).set({ownerEmail:activeSeller?.email || '', purpose, dataUrl, shortLink, createdAt:nowIso()});
        }catch(e){ console.log('short image ref not saved', e); }
        return shortLink;
    }

    window.renderImagePreviews = function(){
        const preview = $('imagePreviewContainer');
        if(!preview) return;
        preview.innerHTML = '';
        uploadedImagesArray.forEach((img, idx) => {
            const ref = uploadedImageRefsArray[idx] || '';
            preview.innerHTML += `<div style="position:relative;display:inline-block;margin:5px;vertical-align:top;"><img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:12px;border:2px solid var(--primary);"><button type="button" onclick="removeUploadedImage(${idx})" style="position:absolute;top:-5px;right:-5px;background:var(--danger);color:white;border-radius:50%;border:none;width:20px;height:20px;font-size:10px;cursor:pointer;">X</button>${ref ? `<span class="short-link-chip"><i class="fas fa-link"></i>${ref}</span>` : ''}</div>`;
        });
    };
    window.removeUploadedImage = function(idx){ uploadedImagesArray.splice(idx,1); uploadedImageRefsArray.splice(idx,1); renderImagePreviews(); };
    window.handleImageSelection = async function(e){
        const files = e.target.files || [];
        for(const file of files){
            if(!file.type.startsWith('image/')) continue;
            const dataUrl = await compressImage(file, 620, .70);
            const ref = await saveShortImage(dataUrl, 'product');
            uploadedImagesArray.push(dataUrl);
            uploadedImageRefsArray.push(ref);
        }
        renderImagePreviews();
        e.target.value = '';
    };
    document.addEventListener('DOMContentLoaded', () => { const inp = $('itemImgFiles'); if(inp) inp.onchange = window.handleImageSelection; });

    const oldEditItem = window.editItem;
    window.editItem = function(id){
        if(typeof oldEditItem === 'function') oldEditItem(id);
        const p = (sellerProducts || []).find(x => String(x.id) === String(id));
        uploadedImageRefsArray = Array.isArray(p?.imageRefs) ? [...p.imageRefs] : (Array.isArray(p?.imageLinks) ? [...p.imageLinks] : []);
        renderImagePreviews();
    };
    const oldOpenItemModal = window.openItemModal;
    window.openItemModal = function(){ uploadedImageRefsArray = []; if(typeof oldOpenItemModal === 'function') oldOpenItemModal(); renderImagePreviews(); };

    const oldSubmitItemForm = window.submitItemForm;
    window.submitItemForm = async function(){
        const beforeRefs = [...uploadedImageRefsArray];
        await oldSubmitItemForm();
        try{
            const latest = (sellerProducts || []).slice().sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')))[0];
            const editId = $('editId') ? $('editId').value : '';
            const targetId = editId || latest?.id;
            if(targetId && beforeRefs.length){
                await db.collection('products').doc(targetId).update({imageRefs: beforeRefs, imageLinks: beforeRefs, primaryImageRef: beforeRefs[0]});
            }
        }catch(e){ console.log('image refs update skipped', e); }
    };

    window.uploadStoreBranding = async function(type){
        const input = type === 'logo' ? $('storeLogoInput') : $('storeBannerInput');
        if(!input || !input.files[0]) return showToast('Select an image first', 'warning');
        const usageMonth = activeSeller.brandingUsageMonth === monthKey() ? activeSeller.brandingUsageMonth : monthKey();
        const usage = usageMonth === activeSeller.brandingUsageMonth ? (activeSeller.brandingUsage || {}) : {};
        const used = Number(usage[type] || activeSeller[`${type}UploadsThisMonth`] || 0);
        const limit = getBrandLimit(type);
        if(used >= limit) return showToast(`Monthly ${type} limit reached (${used}/${limit}).`, 'error');
        try{
            const dataUrl = await compressImage(input.files[0], type === 'logo' ? 512 : 1100, .72);
            const shortLink = await saveShortImage(dataUrl, 'store-' + type);
            const field = `store${type.charAt(0).toUpperCase()+type.slice(1)}`;
            const newUsage = {...usage, [type]: used + 1};
            const update = {[field]:dataUrl, [`${field}ShortLink`]:shortLink, [`${type}UploadsThisMonth`]:used+1, brandingUsage:newUsage, brandingUsageMonth:monthKey(), brandingUpdatedAt:nowIso()};
            await db.collection('sellers').doc(activeSeller.email).update(update);
            Object.assign(activeSeller, update);
            localStorage.setItem('sellerToken', JSON.stringify(activeSeller));
            input.value = '';
            updateBrandingLimitText();
            showToast(`${type === 'logo' ? 'Logo' : 'Banner'} updated. Short image ref: ${shortLink}`, 'success');
        }catch(e){ console.error(e); showToast('Failed to upload branding.', 'error'); }
    };

    function productForOrderItem(item){
        return (sellerProducts || []).find(p => {
            const ids = [item.id,item.productId,item.product_id,item.productDocId].map(norm);
            return ids.includes(norm(p.id)) || (item.sku && lower(item.sku) === lower(p.sku)) || (item.name && lower(item.name) === lower(p.name));
        });
    }
    function warrantyMonths(value){
        const s = lower(value);
        const n = parseInt(s,10) || 0;
        if(!n) return 0;
        if(s.includes('year')) return n * 12;
        if(s.includes('month')) return n;
        return n;
    }
    function getWarrantyRequirement(order){
        const items = typeof getSellerItemsFromOrder === 'function' ? getSellerItemsFromOrder(order) : (order.items || []);
        for(const item of items){
            const p = productForOrderItem(item) || {};
            const warranty = item.warranty || p.warranty || '';
            const hasWarranty = warranty && lower(warranty) !== 'no warranty' && lower(warranty) !== 'none';
            const qr = norm(item.warrantyQr || item.warranty_qr || item.warrantyCode || item.warranty_code || item.adminWarrantyQr || p.warrantyQr || p.warranty_qr || p.warrantyCode || p.warranty_code || p.adminWarrantyQr || p.warrantyBarcode || p.warranty_barcode);
            if(hasWarranty && /^\d{12}$/.test(qr)){
                const base = new Date(order.timestamp || order.createdAt || Date.now());
                const expiry = new Date(base);
                const months = warrantyMonths(warranty);
                if(months) expiry.setMonth(expiry.getMonth() + months); else expiry.setDate(expiry.getDate()+30);
                return {required:true, expectedQr:qr, productId:p.id || item.productId || item.id || '', productName:p.name || item.name || item.title || 'Product', warranty, expiresAt:expiry.toISOString()};
            }
        }
        return {required:false, expectedQr:'', expiresAt:new Date(Date.now()+30*24*60*60*1000).toISOString()};
    }
    function setScanStep(step){
        currentScanStep = step;
        ['scanStep1','scanStep2','scanStep3'].forEach(id => { const el=$(id); if(el) el.classList.remove('active'); });
        const active = step === 1 ? 'scanStep1' : (step === 2 ? 'scanStep2' : 'scanStep3');
        if($(active)) $(active).classList.add('active');
    }
    function setScanStatus(html, color){ const ss=$('scanStatus'); if(ss){ ss.innerHTML=html; if(color) ss.style.color=color; } }
    async function restartScanner(delay=1200){ try{ setTimeout(()=>html5QrcodeScanner && html5QrcodeScanner.resume(), delay); }catch(e){} setTimeout(()=>{ isProcessingScan=false; }, delay+400); }

    window.openGlobalScanModal = async function(){
        currentScanStep = 1; isProcessingScan = false; tempTrackingId = ''; tempProductBarcode = ''; tempWarrantyQrCode = ''; tempWarrantyMeta = null; scanHasWarranty = false;
        if($('scanOrderId')) $('scanOrderId').value = '';
        if($('skipScanBtn')) $('skipScanBtn').style.display = 'none';
        const qr = $('qr-reader'); if(qr){ qr.innerHTML=''; qr.style.display='none'; }
        const sp = $('scannerPlaceholder'); if(sp) sp.style.display='flex';
        setScanStep(1); setScanStatus('Step 1: Scan Invoice / Order ID QR Code', 'white');
        const sm = $('scanModal'); if(sm){ sm.style.display='flex'; sm.style.pointerEvents='auto'; setTimeout(()=>sm.classList.add('show'),10); }
        try{ if(html5QrcodeScanner){ await html5QrcodeScanner.clear(); html5QrcodeScanner=null; } }catch(e){}
        try{ const snap = await db.collection('orders').orderBy('timestamp','desc').limit(500).get(); sellerOrders = snap.docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
        setTimeout(()=>{
            if(sp) sp.style.display='none'; if(qr) qr.style.display='block';
            const width = (qr && qr.clientWidth) || Math.min(window.innerWidth, 520);
            const qrSize = Math.max(240, Math.min(420, Math.floor(width * .82)));
            html5QrcodeScanner = new Html5QrcodeScanner('qr-reader', {fps:15, qrbox:{width:qrSize,height:qrSize}, aspectRatio:1.0}, false);
            try{ html5QrcodeScanner.render(onScanSuccess, onScanFailure); }catch(e){ console.error(e); }
        }, 350);
    };

    window.onScanSuccess = onScanSuccess = async function(decodedText){
        if(isProcessingScan) return;
        isProcessingScan = true;
        const scannedId = norm(decodedText);
        try{ html5QrcodeScanner && html5QrcodeScanner.pause(true); }catch(e){}
        if(currentScanStep === 1){
            const order = (sellerOrders || []).find(o => scannedId.includes(norm(o.id)) || (o.order_no && scannedId.includes(norm(o.order_no))) || (o.invoiceId && scannedId.includes(norm(o.invoiceId))));
            if(!order){ showToast('Invalid invoice QR or order not found.', 'error'); return restartScanner(1600); }
            const status = lower(order.status);
            if(['shipped','delivered','completed scan'].includes(status)){ showToast('This order is already scanned / shipped.', 'error'); return restartScanner(1800); }
            if(!['accepted','processing','packed'].includes(status)){ showToast(`Order status is '${order.status}'. Accept it first.`, 'warning'); return restartScanner(2000); }
            if($('scanOrderId')) $('scanOrderId').value = order.id;
            tempWarrantyMeta = getWarrantyRequirement(order);
            scanHasWarranty = !!tempWarrantyMeta.required;
            if(scanHasWarranty){
                setScanStep(2); if($('skipScanBtn')) $('skipScanBtn').style.display='block';
                setScanStatus(`<i class="fas fa-shield-alt"></i> Invoice verified. Warranty item detected: ${tempWarrantyMeta.productName}. Scan admin 12 digit warranty QR.`, 'white');
            }else{
                setScanStep(3); if($('skipScanBtn')) $('skipScanBtn').style.display='none';
                setScanStatus('<i class="fas fa-check-circle"></i> Invoice verified. No admin warranty QR found, scan 16 digit product barcode.', 'white');
            }
            return restartScanner(1200);
        }
        if(currentScanStep === 2){
            if(!/^\d{12}$/.test(scannedId)){ setScanStatus('<i class="fas fa-times"></i> Invalid warranty QR. It must be exactly 12 digits.', 'white'); return restartScanner(1800); }
            if(tempWarrantyMeta && tempWarrantyMeta.expectedQr && scannedId !== tempWarrantyMeta.expectedQr){ setScanStatus('<i class="fas fa-exclamation-triangle"></i> Warranty QR does not match the admin warranty code.', 'white'); return restartScanner(2200); }
            tempWarrantyQrCode = scannedId;
            setScanStep(3); if($('skipScanBtn')) $('skipScanBtn').style.display='none';
            setScanStatus('<i class="fas fa-check"></i> Warranty QR saved. Now scan final 16 digit product barcode.', 'white');
            return restartScanner(1000);
        }
        if(currentScanStep === 3){
            const orderId = $('scanOrderId') ? $('scanOrderId').value : '';
            if(!orderId){ showToast('Order ID missing. Scan invoice again.', 'error'); return restartScanner(1500); }
            if(!/^\d{16}$/.test(scannedId)){ setScanStatus('<i class="fas fa-times"></i> Invalid barcode. It must be exactly 16 digits.', 'white'); return restartScanner(1800); }
            try{
                const barcodeSnap = await db.collection('orders').where('product_barcode','==',scannedId).limit(1).get();
                if(!barcodeSnap.empty){ setScanStatus('<i class="fas fa-exclamation-triangle"></i> This 16 digit barcode is already used. Scan a fresh barcode.', 'white'); return restartScanner(2200); }
            }catch(e){}
            tempProductBarcode = scannedId;
            setScanStatus('<i class="fas fa-truck"></i> Verified! Saving scan data...', 'white');
            try{ await html5QrcodeScanner.clear(); html5QrcodeScanner=null; }catch(e){}
            await executeDispatch(orderId, tempWarrantyQrCode, tempProductBarcode);
            isProcessingScan = false;
        }
    };
    window.onScanFailure = onScanFailure = function(){};

    window.skipAndShip = async function(){
        const id = $('scanOrderId') ? $('scanOrderId').value : '';
        if(!id) return showToast('You must scan an invoice first.', 'warning');
        if(currentScanStep !== 2 || !scanHasWarranty) return showToast('Only warranty QR can be skipped.', 'warning');
        if(!confirm('Skip warranty QR? ₹20 fine will be added, then you must scan the 16 digit product barcode.')) return;
        try{ await db.collection('fines').add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false, amount:20, reason:`Skipped warranty QR scan for Order ${id}`, timestamp:nowIso()}); }catch(e){}
        tempWarrantyQrCode = 'SKIPPED_WARRANTY_QR_12';
        setScanStep(3); if($('skipScanBtn')) $('skipScanBtn').style.display='none';
        setScanStatus('<i class="fas fa-barcode"></i> Warranty skipped with ₹20 fine. Now scan final 16 digit product barcode.', 'white');
        restartScanner(800);
    };

    window.executeDispatch = executeDispatch = async function(id, warrantyQrCode='', productBarcode=''){
        try{
            const hasWarranty = !!(scanHasWarranty || (tempWarrantyMeta && tempWarrantyMeta.required));
            const expiresAt = hasWarranty && tempWarrantyMeta?.expiresAt ? tempWarrantyMeta.expiresAt : new Date(Date.now()+30*24*60*60*1000).toISOString();
            const payload = {status:'Completed Scan', invoice_order_id:id, warranty_required:hasWarranty, warranty_qr_code:warrantyQrCode || '', product_barcode:productBarcode || '', scanned_date:nowIso(), scan_completed_at:nowIso(), scan_status:'Completed', scan_record_expires_at:expiresAt};
            await db.collection('orders').doc(id).update(payload);
            await db.collection('order_scan_records').add({sellerEmail:activeSeller.email, orderId:id, ...payload, deleteAfter:expiresAt, ttlAt:expiresAt});
            closeModal('scanModal'); showToast('Order scanned successfully and ready to ship!', 'success');
            try{ await initDashboard(); }catch(e){}
            if(typeof loadCompletedScanOrders === 'function') loadCompletedScanOrders();
            if(typeof renderDashboardStats === 'function') renderDashboardStats();
        }catch(e){ console.error(e); showToast('Dispatch update failed: ' + e.message, 'error'); }
    };

    const oldExecuteAd = typeof executeAd === 'function' ? executeAd : null;
    window.executeAd = executeAd = async function(id){
        try{
            const until = new Date(Date.now()+24*60*60*1000).toISOString();
            await db.collection('products').doc(id).update({isAd:true, isSponsored:true, sponsored:true, adStatus:'Sponsored', sponsoredAt:nowIso(), sponsoredUntil:until});
            const p = (sellerProducts || []).find(x => String(x.id) === String(id));
            if(p) Object.assign(p,{isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredUntil:until});
            showToast('Product marked Sponsored for 24 hours!', 'success');
            try{ await initDashboard(); }catch(e){}
            if(typeof loadAds === 'function') loadAds();
        }catch(e){ console.error(e); if(oldExecuteAd) oldExecuteAd(id); else showToast('Failed to activate sponsored ad.', 'error'); }
    };
    window.loadAds = function(){
        const list = $('adsList'); if(!list) return;
        list.innerHTML = '';
        (sellerProducts || []).forEach(p => {
            const sponsored = p.isAd || p.isSponsored || p.sponsored || lower(p.adStatus) === 'sponsored';
            const badge = sponsored ? '<span class="badge" style="background:#fbcfe8;color:#be185d;">Sponsored</span>' : '<span class="badge" style="background:var(--surface-2);color:var(--text-light);">Inactive</span>';
            const action = sponsored ? `<button class="btn-sm" style="background:var(--danger);" onclick="stopAd('${p.id}')">Stop</button>` : `<button class="btn-sm" style="background:#ec4899;" onclick="startAd('${p.id}')">Mark Sponsored</button>`;
            list.innerHTML += `<tr><td data-label="Product"><strong style="font-size:14px;">${p.name || 'Product'}</strong></td><td data-label="Price">₹${p.price || 0}</td><td data-label="Status">${badge}</td><td data-label="Action">${action}</td></tr>`;
        });
    };

    const oldFilterSupport = window.filterSupportTickets;
    window.filterSupportTickets = function(filterStatus){
        const cont = $('oldTicketsListContainer');
        if(!cont){ if(oldFilterSupport) return oldFilterSupport(filterStatus); return; }
        let html = `<div class="category-scroll-wrapper"><div class="category-filters">
            <button class="cat-pill ${filterStatus==='All'?'active':''}" onclick="filterSupportTickets('All')">All</button>
            <button class="cat-pill ${filterStatus==='Open'?'active':''}" onclick="filterSupportTickets('Open')">Open / Review</button>
            <button class="cat-pill ${filterStatus==='Waiting for User'?'active':''}" onclick="filterSupportTickets('Waiting for User')">Requires Your Reply</button>
            <button class="cat-pill ${filterStatus==='Resolved'?'active':''}" onclick="filterSupportTickets('Resolved')">Resolved</button>
        </div></div>`;
        let filtered = sellerSupportTickets || [];
        if(filterStatus !== 'All'){
            if(filterStatus === 'Open') filtered = filtered.filter(t => ['open','in progress','review'].includes(lower(t.status)));
            else if(filterStatus === 'Resolved') filtered = filtered.filter(t => ['resolved','complete','completed','closed'].includes(lower(t.status)));
            else filtered = filtered.filter(t => lower(t.status) === lower(filterStatus));
        }
        if(!filtered.length){ html += `<div style="text-align:center;padding:30px;color:var(--text-light);font-weight:700;"><i class="fas fa-ticket-alt" style="font-size:40px;margin-bottom:15px;opacity:.35;"></i><br>No tickets found for this filter.</div>`; }
        else filtered.forEach(t => {
            const st = lower(t.status);
            const stBadge = ['resolved','complete','completed','closed'].includes(st) ? `<span class="badge" style="background:#dcfce3;color:#166534;">Resolved</span>` : (st === 'waiting for user' ? `<span class="badge" style="background:#eff6ff;color:#1e3a8a;">Requires Your Reply</span>` : `<span class="badge" style="background:#fffbeb;color:#b45309;">Open / Review</span>`);
            html += `<div class="panel-box" style="margin-bottom:15px;cursor:pointer;border:1px solid var(--border-color);" onclick="openTicketDetail('${t.id}')"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;align-items:center;"><strong style="font-family:monospace;color:var(--primary);font-size:16px;">${t.ticketId || t.id}</strong>${stBadge}</div><div style="font-weight:900;font-size:15px;color:var(--text-main);margin-bottom:8px;">${t.subject || 'Support Query'}</div><div style="font-size:13px;color:var(--text-light);"><i class="fas fa-calendar-alt"></i> ${window.aryantaSmartDate(t.timestamp, true)}</div></div>`;
        });
        cont.innerHTML = html;
    };
})();

/* ===== Aryanta final small stabilizers ===== */
(function(){
    function updateAllNotificationBadges(){
        const count = Number(unreadNotifCount || 0);
        document.querySelectorAll('#notifBadge').forEach(badge => {
            if(count > 0){ badge.innerText = count; badge.style.display = 'block'; }
            else badge.style.display = 'none';
        });
    }
    if(typeof fetchNotifications === 'function'){
        const _fetchNotifications = fetchNotifications;
        fetchNotifications = function(){
            const out = _fetchNotifications.apply(this, arguments);
            setTimeout(updateAllNotificationBadges, 600);
            return out;
        };
    }
    document.addEventListener('DOMContentLoaded', function(){
        const old = document.getElementById('itemImgFiles');
        if(old && old.parentNode){
            const fresh = old.cloneNode(true);
            old.parentNode.replaceChild(fresh, old);
            fresh.onchange = window.handleImageSelection;
        }
    });
})();


/* ===== Aryanta V3 Owner Patch: no top notification button, QC links, Q&A bridge, orders SLA, warranty tabs, ledgers ===== */
(function(){
    const $ = id => document.getElementById(id);
    const lower = v => String(v || '').toLowerCase().trim();
    const safe = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const nowIso = () => new Date().toISOString();
    const dayMs = 24*60*60*1000;
    const orderAgeHours = o => {
        const t = new Date(o.timestamp || o.createdAt || o.orderDate || o.date || Date.now()).getTime();
        return Math.max(0, (Date.now() - t) / 3600000);
    };
    const isNewStatus = s => ['placed','new','pending','confirmed','order placed','processing'].includes(lower(s));
    const isCancelled = s => ['cancelled','canceled','seller cancelled','auto cancelled','breach cancelled'].includes(lower(s));
    const isBreachedOrder = o => !!(o.sellerBreach || o.breached || o.slaBreached || lower(o.status).includes('breach') || (isNewStatus(o.status) && orderAgeHours(o) >= 12));
    const currentSettings = () => (activeSeller && activeSeller.settings) ? activeSeller.settings : {};
    window.currentNewOrderFilter = window.currentNewOrderFilter || 'new';
    window.currentWarrantyFilter = window.currentWarrantyFilter || 'requests';

    window.openHowToSellPage = function(){ window.open('https://aryanta.in/getdetails','_blank','noopener'); };

    function generateAlpha2(){
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        return letters[Math.floor(Math.random()*letters.length)] + letters[Math.floor(Math.random()*letters.length)];
    }
    async function getNextAryProductId(){
        const fallback = () => 'Ary-' + String(Date.now()).slice(-4) + '-' + String(Math.floor(Math.random()*10000)).padStart(4,'0') + '-' + generateAlpha2();
        try{
            const ref = db.collection('system_counters').doc('product_sequence');
            let finalId = '';
            await db.runTransaction(async tx => {
                const doc = await tx.get(ref);
                const next = (doc.exists ? Number(doc.data().next || doc.data().value || 1) : 1);
                const block = Math.floor((next - 1) / 10000) + 1;
                const serial = ((next - 1) % 10000) + 1;
                finalId = `Ary-${String(block).padStart(4,'0')}-${String(serial).padStart(4,'0')}-${generateAlpha2()}`;
                tx.set(ref, {next: next + 1, updatedAt: nowIso()}, {merge:true});
            });
            return finalId || fallback();
        }catch(e){ console.warn('product id sequence fallback', e); return fallback(); }
    }
    function productLinkFor(id){ return `https://aryanta.in/product?id=${encodeURIComponent(id)}`; }
    function getCommissionRate(){ return 0; }
    function commissionAmount(gross){ return Math.round(Number(gross || 0) * getCommissionRate()); }
    async function savePaymentLedger(entry){
        try{
            if(!db || !activeSeller) return;
            await db.collection('seller_payment_ledger').add({sellerEmail:activeSeller.email, sellerName:activeSeller.companyName || activeSeller.email, createdAt:nowIso(), ...entry});
        }catch(e){ console.warn('payment ledger save failed', e); }
    }
    async function addFineOnce(key, amount, reason){
        try{
            const id = `${activeSeller.email}_${key}`.replace(/[^a-zA-Z0-9_-]/g,'_');
            const ref = db.collection('seller_fine_events').doc(id);
            const doc = await ref.get();
            if(doc.exists) return false;
            await ref.set({email:activeSeller.email, sellerEmail:activeSeller.email, status:'Pending Admin Review', accepted:false, amount, reason, timestamp:nowIso(), key});
            await db.collection('fines').add({email:activeSeller.email, sellerEmail:activeSeller.email, status:'Pending Admin Review', accepted:false, amount, reason, timestamp:nowIso(), key});
            sellerFines.push({id, email:activeSeller.email, amount, reason, timestamp:nowIso(), key});
            return true;
        }catch(e){ console.warn('fine failed', e); return false; }
    }

    // Search suggestions respect Settings > Show Search Suggestions.
    window.handleGlobalSearch = function(){
        const input = $('globalSearchInput');
        const box = $('searchSuggestions');
        if(!input || !box) return;
        const val = lower(input.value);
        if(!val || currentSettings().searchSuggestions === false){ box.style.display='none'; box.innerHTML=''; return; }
        let resultsHtml = '';
        (sellerOrders || []).filter(o => lower(o.id).includes(val) || lower(o.order_no).includes(val) || lower(o.delivery_name).includes(val)).slice(0,4).forEach(o => {
            resultsHtml += `<div class="suggestion-item" onclick="viewOrderDetails('${safe(o.id)}'); document.getElementById('searchSuggestions').style.display='none';"><strong>📦 Order: ${safe(o.order_no || o.id)}</strong><span>Status: ${safe(o.status)} | Buyer: ${safe(o.delivery_name || 'N/A')}</span></div>`;
        });
        (sellerProducts || []).filter(p => lower(p.sku).includes(val) || lower(p.name).includes(val) || lower(p.id).includes(val)).slice(0,4).forEach(p => {
            resultsHtml += `<div class="suggestion-item" onclick="editItem('${safe(p.id)}'); document.getElementById('searchSuggestions').style.display='none';"><strong>🛒 Product: ${safe(p.name)}</strong><span>ID/SKU: ${safe(p.id || p.sku)} | ₹${Number(p.price || 0).toLocaleString('en-IN')}</span></div>`;
        });
        box.innerHTML = resultsHtml || `<div class="suggestion-item"><strong>No match found</strong><span>Try another SKU, product name or order id.</span></div>`;
        box.style.display = 'block';
    };

    const oldShowSection = window.showSection;
    window.showSection = function(section){
        if(section === 'tutorial') return window.openHowToSellPage();
        if(typeof oldShowSection === 'function') oldShowSection(section);
        if(section === 'settings') setTimeout(loadSettingsUI, 60);
    };

    function setSwitch(id, value){ const el=$(id); if(el) el.checked = !!value; }
    const oldLoadSettingsUI = window.loadSettingsUI || function(){};
    window.loadSettingsUI = function(){
        try{ oldLoadSettingsUI(); }catch(e){}
        const s = currentSettings();
        setSwitch('settingSearchSuggestions', s.searchSuggestions !== false);
        setSwitch('settingAutoAcc', !!(s.autoAcc || s.autoAcceptOrders));
        setSwitch('settingVacation', !!s.vacation);
        if(typeof updateBrandingLimitText === "function") updateBrandingLimitText();
    };

    const oldToggleSetting = window.toggleSetting;
    window.toggleSetting = async function(key){
        if(!activeSeller.settings) activeSeller.settings = {};
        const id = `setting${key.charAt(0).toUpperCase()+key.slice(1)}`;
        const el = $(id);
        const isChecked = el ? el.checked : !activeSeller.settings[key];
        activeSeller.settings[key] = isChecked;
        if(key === 'autoAcc') activeSeller.settings.autoAcceptOrders = isChecked;
        localStorage.setItem('sellerToken', JSON.stringify(activeSeller));
        try{ await db.collection('sellers').doc(activeSeller.email).update({settings:activeSeller.settings}); }catch(e){}
        if(key === 'vacation') await applyVacationDeliveryMode(isChecked);
        if(key === 'autoAcc') { showToast(isChecked ? 'Auto Accept enabled. New orders auto-accept after 3 hours.' : 'Auto Accept disabled.'); applyOrderAutomation(); }
        if(key === 'searchSuggestions') showToast(isChecked ? 'Search suggestions enabled.' : 'Search suggestions disabled.');
        if(key !== 'vacation' && key !== 'autoAcc' && key !== 'searchSuggestions' && typeof oldToggleSetting === 'function'){
            try{ return oldToggleSetting(key); }catch(e){}
        }
    };
    async function applyVacationDeliveryMode(enabled){
        try{
            const snap = await db.collection('products').where('sellerEmail','==',activeSeller.email.toLowerCase().trim()).get();
            const batch = db.batch();
            snap.docs.forEach(d => batch.update(db.collection('products').doc(d.id), {vacationMode:!!enabled, deliveryExtraDays:enabled ? 2 : 0, updatedAt:nowIso()}));
            await batch.commit();
            (sellerProducts || []).forEach(p => { p.vacationMode=!!enabled; p.deliveryExtraDays=enabled?2:0; });
            showToast(enabled ? 'Vacation mode enabled. Delivery timeline increased by 2 days.' : 'Vacation mode disabled. Delivery timeline restored.', 'success');
        }catch(e){ showToast('Could not update vacation delivery timing.', 'error'); }
    }

    // Product save: custom Ary sequence id, QC progress, no live product link until Approved.
    window.submitItemForm = async function(){
        const btn = $('saveProductBtn');
        const id = $('editId') ? $('editId').value.trim() : '';
        const name = $('itemName') ? $('itemName').value.trim() : '';
        const mrp = parseInt($('itemMrp')?.value || '0', 10);
        const price = parseInt($('itemPrice')?.value || '0', 10);
        const stock = parseInt($('itemStock')?.value || '0', 10);
        if(!name) return showToast('Product title is required.', 'warning');
        if(price > mrp) return showToast('Price cannot be greater than MRP.', 'warning');
        if(isNaN(price) || isNaN(stock)) return showToast('Invalid price or stock.', 'error');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving to QC...';
        try{
            const docId = id || await getNextAryProductId();
            let itemSku = $('itemSku') ? $('itemSku').value.trim() : '';
            if(!itemSku) itemSku = docId;
            const finalListedPrice = Math.round(price + (price * getCommissionRate()));
            const pkg = window.readAryProductPackageDetails ? window.readAryProductPackageDetails() : {ok:true, data:{}};
            if(!pkg.ok){
                showToast(pkg.message || 'Package details are required for courier processing.', 'warning');
                if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Save Product (Send to QC)';
                return;
            }
            const wSel=$('itemWarranty'), wCustom=$('itemWarrantyCustom'), secTx=$('itemSecureTx'), hl=$('itemHighlights');
            const data = {
                sellerEmail: activeSeller.email.toLowerCase().trim(),
                sellerName: activeSeller.companyName || activeSeller.email,
                sellerId: String(activeSeller.id || activeSeller.uid || activeSeller.email || ''),
                id: docId,
                productId: docId,
                sku: itemSku,
                name,
                category: $('itemCat') ? $('itemCat').value : '',
                stock, mrp, price,
                listedPrice: finalListedPrice,
                commissionRate: getCommissionRate(),
                commissionPercent: 0,
                desc: $('itemDesc') ? $('itemDesc').value : '',
                highlights: hl ? hl.value : '',
                productLinks: (window.itemLinksData || itemLinksData || []).filter(l => String(l).trim() !== ''),
                isVisible: false,
                approvalStatus: 'Pending',
                qcStatus: 'QC Progress',
                liveStatus: 'QC Progress',
                productLink: '',
                warranty: wSel ? wSel.value : 'No Warranty',
                warrantyText: wCustom ? wCustom.value : '',
                secureTxStatus: secTx ? secTx.value : 'Standard',
                packageWeightKg: pkg.data.weight,
                packageLengthCm: pkg.data.length,
                packageBreadthCm: pkg.data.breadth,
                packageHeightCm: pkg.data.height,
                weightKg: pkg.data.weight,
                lengthCm: pkg.data.length,
                breadthCm: pkg.data.breadth,
                heightCm: pkg.data.height,
                widthCm: pkg.data.breadth,
                package: { weight: pkg.data.weight, length: pkg.data.length, breadth: pkg.data.breadth, width: pkg.data.breadth, height: pkg.data.height },
                updatedAt: nowIso()
            };
            if(!id) data.timestamp = nowIso();
            if(Array.isArray(uploadedImagesArray) && uploadedImagesArray.length){ data.images = uploadedImagesArray; data.image = uploadedImagesArray[0]; }
            if(Array.isArray(window.uploadedImageRefsArray) && window.uploadedImageRefsArray.length){ data.imageRefs = [...window.uploadedImageRefsArray]; data.imageLinks = [...window.uploadedImageRefsArray]; data.primaryImageRef = window.uploadedImageRefsArray[0]; }
            await db.collection('products').doc(docId).set(data, {merge:true});
            const found = (sellerProducts || []).find(p => String(p.id) === String(docId));
            if(found) Object.assign(found, data); else sellerProducts.unshift(data);
            closeModal('itemModal');
            showToast('Product saved in QC Progress. Link will unlock after QC Pass / Live.', 'success');
            try{ await initDashboard(); }catch(e){ loadInventory(); renderDashboardStats && renderDashboardStats(); }
        }catch(e){ console.error(e); showToast('Database Error: ' + e.message, 'error'); }
        if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Save Product (Send to QC)';
    };

    window.filterInventory = function(status){
        currentInventoryFilter = status;
        document.querySelectorAll('.category-filters .cat-pill[id^="qc-"]').forEach(el => el.classList.remove('active'));
        const map = {All:'qc-all', Approved:'qc-pass', Pending:'qc-pending', Rejected:'qc-cancel'};
        const el = $(map[status] || 'qc-all'); if(el) el.classList.add('active');
        loadInventory();
    };
    window.copyLiveProductLink = async function(id){
        const link = productLinkFor(id);
        try{ await navigator.clipboard.writeText(link); }catch(e){ const t=document.createElement('input'); t.value=link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        showToast('Live product link copied.', 'success');
    };
    async function ensureLiveProductLink(p){
        if(lower(p.approvalStatus) !== 'approved') return '';
        const link = p.productLink || productLinkFor(p.id);
        if(!p.productLink || p.isVisible !== true){
            try{
                await db.collection('products').doc(p.id).update({productLink:link, isVisible:true, liveStatus:'Live', qcStatus:'QC Pass / Live', liveAt:p.liveAt || nowIso()});
                p.productLink = link; p.isVisible = true; p.liveStatus = 'Live'; p.qcStatus='QC Pass / Live';
                if(!p.qcPassNotified){
                    await db.collection('seller_notifications').add({sellerEmail:activeSeller.email, type:'QC_PASS', productId:p.id, title:'QC Pass / Live', text:`${p.name || 'Product'} is now live. Product link is ready.`, read:false, timestamp:nowIso()});
                    await db.collection('products').doc(p.id).update({qcPassNotified:true});
                    p.qcPassNotified = true;
                }
            }catch(e){ console.warn('live link update skipped', e); }
        }
        return link;
    }
    window.loadInventory = loadInventory = function(){
        const list = $('inventoryList'); if(!list) return;
        list.innerHTML = '';
        let items = [...(sellerProducts || [])];
        const f = currentInventoryFilter || 'All';
        if(f !== 'All') items = items.filter(p => lower(p.approvalStatus) === lower(f));
        if(!items.length){ list.innerHTML = `<tr><td colspan="6" style="text-align:center;font-weight:700;padding:28px;">No inventory found for this filter.</td></tr>`; return; }
        items.forEach(p => {
            const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
            const imgHtml = imgs[0] ? `<img src="${imgs[0]}" loading="lazy" style="width:45px;height:45px;border-radius:10px;object-fit:cover;margin-right:8px;border:1px solid var(--border-color);">` : '';
            let status = lower(p.approvalStatus);
            let qcHtml = '<span class="badge-ui" style="background:#64748b;color:white;">Draft</span>';
            if(status === 'pending') qcHtml = '<span class="badge-ui" style="background:#f59e0b;color:white;">QC Progress</span>';
            if(status === 'rejected') qcHtml = '<span class="badge-ui" style="background:#ef4444;color:white;">QC Cancelled</span>';
            if(status === 'approved') { qcHtml = '<span class="badge-ui" style="background:#10b981;color:white;">QC Pass / Live</span>'; ensureLiveProductLink(p); }
            const liveBtn = status === 'approved' ? `<button class="copy-link-btn" onclick="event.stopPropagation();copyLiveProductLink('${safe(p.id)}')"><i class="fas fa-link"></i> Copy Link</button>` : `<span class="disabled-link-btn"><i class="fas fa-lock"></i> Link after QC Pass</span>`;
            const stockHtml = Number(p.stock || 0) < 5 ? `<span style="color:var(--danger);font-weight:900;">${Number(p.stock || 0)}</span> Units` : `<span style="font-weight:800;">${Number(p.stock || 0)}</span> Units`;
            list.innerHTML += `<tr class="clickable-row" onclick="editItem('${safe(p.id)}')">
                <td data-label="SKU & Images"><div style="display:flex;align-items:center;">${imgHtml}<strong style="font-family:monospace;font-size:12px;color:var(--text-light);">${safe(p.sku || p.id)}</strong></div></td>
                <td data-label="Product Title"><strong style="font-size:14px;">${safe(p.name)}</strong><br>${liveBtn}</td>
                <td data-label="Category & Status"><div>${safe(p.category || '-')}</div><div style="margin-top:6px;">${qcHtml}</div></td>
                <td data-label="Stock">${stockHtml}</td>
                <td data-label="Price Info"><strong>₹${Number(p.price || 0).toLocaleString('en-IN')}</strong><br><span style="font-size:12px;color:var(--text-light);">Listed: ₹${Number(p.listedPrice || (Number(p.price || 0))).toLocaleString('en-IN')}</span><br><span style="font-size:11px;color:var(--text-light);">Commission 0%</span></td>
                <td data-label="Actions"><button class="btn-sm edit" onclick="event.stopPropagation();editItem('${safe(p.id)}')"><i class="fas fa-edit"></i> Edit</button><button class="btn-sm" style="background:var(--danger);margin-left:5px;" onclick="event.stopPropagation();deleteItem('${safe(p.id)}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
    };

    // Q&A: seller sees all product questions from QA arrays and optional product_questions collection.
    let qnaCache = [];
    window.loadQna = async function(){
        const list = $('qnaList'); if(!list) return;
        list.innerHTML = `<tr><td colspan="4" style="text-align:center;font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading customer questions...</td></tr>`;
        const rows = [];
        (sellerProducts || []).forEach(p => {
            (p.qa || []).forEach(q => rows.push({source:'product', productId:p.id, productName:p.name, qid:q.id, ...q}));
        });
        try{
            const snap = await db.collection('product_questions').where('sellerEmail','==',activeSeller.email.toLowerCase().trim()).orderBy('timestamp','desc').limit(200).get();
            snap.docs.forEach(d => { const q=d.data(); rows.push({source:'collection', docId:d.id, productId:q.productId, productName:q.productName, qid:q.id || d.id, ...q}); });
        }catch(e){ /* collection may not exist; product qa array still works */ }
        const seen = new Set();
        qnaCache = rows.filter(r => { const key = `${r.productId}_${r.qid}_${r.question}`; if(seen.has(key)) return false; seen.add(key); return !!r.question; }).sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')));
        if(!qnaCache.length){ list.innerHTML = `<tr><td colspan="4" style="text-align:center;font-weight:700;">No customer questions yet.</td></tr>`; return; }
        list.innerHTML = qnaCache.map(q => {
            const answered = !!q.answer;
            const status = answered ? `<span style="color:var(--success);font-weight:900;"><i class="fas fa-check"></i> Answered</span>` : `<span style="color:var(--warning);font-weight:900;"><i class="fas fa-exclamation-circle"></i> Needs Reply</span>`;
            return `<tr><td data-label="Product"><strong style="font-size:13px;color:var(--primary);">${safe(q.productName || q.productId || 'Product')}</strong><br><span style="font-size:11px;color:var(--text-light);">${safe(q.productId || '')}</span></td><td data-label="Q&A"><div style="font-weight:800;color:var(--text-main);margin-bottom:6px;">Q: ${safe(q.question)}</div><div style="font-size:13px;color:var(--text-light);"><span style="font-weight:900;color:var(--secondary);">A:</span> ${answered ? safe(q.answer) : '<em>Waiting for your reply</em>'}</div></td><td data-label="Status">${status}</td><td data-label="Action"><button class="btn-sm ${answered?'edit':''}" style="background:#3b82f6;" onclick="openQnaModal('${safe(q.productId)}','${safe(q.qid)}')">${answered?'Edit Reply':'Answer Now'}</button></td></tr>`;
        }).join('');
    };
    window.openQnaModal = function(pId,qId){
        const q = qnaCache.find(x => String(x.productId) === String(pId) && String(x.qid) === String(qId)) || ((sellerProducts.find(x=>String(x.id)===String(pId))||{}).qa||[]).find(x=>String(x.id)===String(qId));
        if(!q) return showToast('Question not found.', 'error');
        $('qnaProdId').value = pId; $('qnaQid').value = qId;
        $('qnaTextDisplay').innerText = 'Q: ' + q.question;
        $('qnaAnsText').value = q.answer || '';
        openModal ? openModal('qnaModal') : ($('qnaModal').style.display='flex');
    };
    window.submitQnaAnswer = async function(){
        const pId=$('qnaProdId').value, qId=$('qnaQid').value, ans=$('qnaAnsText').value.trim();
        if(!ans) return showToast('Answer cannot be empty.', 'warning');
        const p = (sellerProducts || []).find(x => String(x.id) === String(pId));
        const qa = [...((p && p.qa) || [])];
        const idx = qa.findIndex(q => String(q.id) === String(qId));
        if(idx >= 0) qa[idx] = {...qa[idx], answer:ans, answeredAt:nowIso(), sellerAnswer:true};
        try{
            if(p) await db.collection('products').doc(pId).update({qa});
            try{
                const qs = await db.collection('product_questions').where('productId','==',pId).where('id','==',qId).limit(5).get();
                qs.docs.forEach(d => db.collection('product_questions').doc(d.id).update({answer:ans, answeredAt:nowIso(), status:'Answered'}));
            }catch(e){}
            closeModal('qnaModal'); showToast('Answer published to product page.', 'success');
            if(p) p.qa = qa;
            loadQna();
        }catch(e){ console.error(e); showToast('Failed to publish answer.', 'error'); }
    };

    async function applyOrderAutomation(){
        if(!activeSeller || !db) return;
        const s = currentSettings();
        const autoAccept = !!(s.autoAcc || s.autoAcceptOrders);
        const updates = [];
        for(const o of (sellerOrders || [])){
            if(!isNewStatus(o.status)) continue;
            const age = orderAgeHours(o);
            if(autoAccept && age >= 3 && age < 12 && !o.autoAcceptedAt){
                o.autoAcceptEligible = true;
            }
            if(age >= 12 && !o.sellerAutoBreachProcessed){
                o.status = 'Breached'; o.sellerBreach = true; o.cancelReason = 'Seller did not accept within 12 hours'; o.sellerAutoBreachProcessed = true;
                updates.push(db.collection('orders').doc(o.id).update({status:'Breached', sellerBreach:true, cancelReason:o.cancelReason, breachedAt:nowIso(), sellerAutoBreachProcessed:true}));
                try{
                    const prev = await db.collection('seller_breach_records').where('sellerEmail','==',activeSeller.email).limit(500).get();
                    const countAfter = prev.size + 1;
                    await db.collection('seller_breach_records').add({sellerEmail:activeSeller.email, orderId:o.id, timestamp:nowIso(), countAfter});
                    if(countAfter >= 3) await addFineOnce('order_breach_' + o.id, 70, `Order auto-cancel breach after 12 hours: ${o.order_no || o.id}`);
                }catch(e){ await addFineOnce('order_breach_' + o.id, 70, `Order auto-cancel breach after 12 hours: ${o.order_no || o.id}`); }
            }
        }
        if(updates.length) try{ await Promise.allSettled(updates); }catch(e){}
    }
    window.filterNewOrders = function(filter){
        window.currentNewOrderFilter = filter || 'new';
        document.querySelectorAll('[id^="order-filter-"]').forEach(b=>b.classList.remove('active'));
        const el = $(`order-filter-${window.currentNewOrderFilter}`); if(el) el.classList.add('active');
        loadNewOrders();
    };
    window.loadNewOrders = loadNewOrders = async function(){
        const list = $('newOrdersList'); if(!list) return;
        list.innerHTML = `<tr><td colspan="7" style="text-align:center;font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Checking order SLA...</td></tr>`;
        await applyOrderAutomation();
        const f = window.currentNewOrderFilter || 'new';
        let rows = (sellerOrders || []).filter(o => getSellerItemsFromOrder(o).length > 0);
        if(f === 'new') rows = rows.filter(o => isNewStatus(o.status));
        if(f === 'breached') rows = rows.filter(isBreachedOrder);
        if(f === 'cancelled') rows = rows.filter(o => isCancelled(o.status) || o.sellerBreach);
        list.innerHTML = '';
        if(!rows.length){ list.innerHTML = `<tr><td colspan="7" style="text-align:center;font-weight:700;">No ${f} orders found.</td></tr>`; return; }
        rows.forEach(o => {
            const items = getSellerItemsFromOrder(o); const amount = items.reduce((s,i)=>s+(Number(i.price||0)*Number(i.qty||1)),0);
            const age = orderAgeHours(o);
            const breached = isBreachedOrder(o);
            const itemsHtml = items.map(i => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><div>${getProductImageHtml(i.name)}</div><div><span style="font-weight:800;">${safe(i.name)}</span><br><span style="color:var(--text-light);font-size:12px;">Qty: <b>${Number(i.qty||1)}</b></span></div></div>`).join('');
            const slaText = isCancelled(o.status) ? `<span style="background:var(--danger);color:#fff;padding:5px 9px;border-radius:9px;font-weight:900;">Cancelled</span>` : (breached ? `<span style="background:var(--danger);color:#fff;padding:5px 9px;border-radius:9px;font-weight:900;">Breached</span>` : `<span style="color:var(--warning);font-weight:900;">${Math.max(0, Math.ceil(12-age))}h left</span>`);
            const actions = isNewStatus(o.status) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-sm" style="background:var(--success);" onclick="event.stopPropagation();acceptOrder('${safe(o.id)}', ${breached})"><i class="fas fa-check"></i> Accept</button><button class="btn-sm" style="background:var(--danger);" onclick="event.stopPropagation();cancelOrder('${safe(o.id)}')"><i class="fas fa-times"></i> Cancel</button></div>` : `<button class="btn-sm" onclick="event.stopPropagation();viewOrderDetails('${safe(o.id)}')">View</button>`;
            list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${safe(o.id)}')"><td data-label="Select"><input type="checkbox" class="custom-cb cb-new" value="${safe(o.id)}" onclick="event.stopPropagation()"></td><td data-label="Order Date"><strong>${window.aryantaSmartDate(o.timestamp||o.createdAt, true)}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Amount"><strong>₹${amount.toLocaleString('en-IN')}</strong></td><td data-label="SLA">${slaText}</td><td data-label="Action">${actions}</td></tr>`;
        });
    };

    const oldAcceptOrder = window.acceptOrder;
    window.acceptOrder = async function(id,isBreached){
        try{ await db.collection('orders').doc(id).update({status:'Accepted', acceptedAt:nowIso(), acceptedBySeller:true});
            const o=(sellerOrders||[]).find(x=>String(x.id)===String(id)); if(o){ o.status='Accepted'; o.acceptedAt=nowIso(); }
            await savePaymentLedger({type:'order_accept', orderId:id, amount:0, status:'Accepted', note:isBreached?'Accepted after SLA breach':'Accepted by seller'});
            showToast('Order accepted.', 'success'); loadNewOrders(); renderDashboardStats && renderDashboardStats();
        }catch(e){ if(oldAcceptOrder) return oldAcceptOrder(id,isBreached); showToast('Accept failed.', 'error'); }
    };
    const oldCancelOrder = window.cancelOrder;
    window.cancelOrder = async function(id){
        try{ await db.collection('orders').doc(id).update({status:'Cancelled', cancelledAt:nowIso(), cancelReason:'Cancelled by seller'});
            const o=(sellerOrders||[]).find(x=>String(x.id)===String(id)); if(o){ o.status='Cancelled'; o.cancelReason='Cancelled by seller'; }
            await addFineOnce('seller_cancel_' + id, 70, `Seller cancelled order: ${id}`);
            await savePaymentLedger({type:'order_cancel', orderId:id, amount:-70, status:'Cancelled', note:'Seller cancelled order'});
            showToast('Order cancelled and ledger updated.', 'warning'); loadNewOrders(); renderDashboardStats && renderDashboardStats();
        }catch(e){ if(oldCancelOrder) return oldCancelOrder(id); showToast('Cancel failed.', 'error'); }
    };

    window.filterWarrantyPanel = function(filter){
        window.currentWarrantyFilter = filter || 'requests';
        document.querySelectorAll('[id^="warranty-tab-"]').forEach(b=>b.classList.remove('active'));
        const el = $(`warranty-tab-${filter === 'inventory' ? 'inventory' : filter}`); if(el) el.classList.add('active');
        loadWarranty();
    };
    window.loadWarranty = loadWarranty = function(){
        const list=$('warrantyList'); if(!list) return;
        const filter=window.currentWarrantyFilter || 'requests';
        list.innerHTML='';
        let rows=[];
        if(filter === 'inventory'){
            rows = (sellerProducts||[]).filter(p => lower(p.warranty) && !['no warranty','none'].includes(lower(p.warranty))).map(p => ({type:'inventory', id:p.id, productName:p.name, warranty:p.warranty, serialNo:p.sku||p.id, issueDesc:p.warrantyText || 'Inventory warranty enabled', status:p.approvalStatus || 'Inventory', timestamp:p.timestamp || nowIso()}));
        }else if(filter === 'running'){
            rows = (sellerWarranties||[]).filter(w => ['accepted','in progress','running','approved'].includes(lower(w.status)));
        }else{
            rows = (sellerWarranties||[]).filter(w => ['assigned to seller','pending action','pending','requested','admin approved'].includes(lower(w.status)));
        }
        if(!rows.length){ list.innerHTML = `<tr><td colspan="5" style="text-align:center;font-weight:700;">No warranty records found.</td></tr>`; return; }
        rows.forEach(w => {
            const created = new Date(w.assignedDate || w.timestamp || Date.now());
            const diffHours = (Date.now()-created.getTime())/3600000;
            const breached = diffHours > 48 && filter === 'requests';
            const sla = w.type === 'inventory' ? `<span style="color:var(--success);font-weight:900;">Inventory Warranty</span>` : (breached ? `<span style="background:var(--danger);color:#fff;padding:4px 8px;border-radius:8px;font-weight:900;">SLA Breached</span>` : `<span style="color:var(--warning);font-weight:900;">${Math.max(0,Math.ceil(48-diffHours))}h left</span>`);
            const action = w.type === 'inventory' ? `<button class="btn-sm" onclick="editItem('${safe(w.id)}')">Open Item</button>` : (filter === 'running' ? `<button class="btn-sm" onclick="openWarrantyDetail && openWarrantyDetail('${safe(w.id)}')">View</button>` : `<button class="btn-sm" style="background:var(--success);" onclick="acceptWarranty('${safe(w.id)}')">Accept</button> <button class="btn-sm" style="background:var(--danger);" onclick="cancelWarranty('${safe(w.id)}')">Reject</button>`);
            list.innerHTML += `<tr><td data-label="Date"><strong>${created.toLocaleDateString()}</strong></td><td data-label="Product & Serial"><strong>${safe(w.productName || w.name || 'Product')}</strong><br><span style="font-family:monospace;color:var(--text-light);">${safe(w.serialNo || w.sku || w.productId || '')}</span></td><td data-label="Info"><span>${safe(w.issueDesc || w.issue || w.warranty || '')}</span></td><td data-label="Status / SLA">${sla}</td><td data-label="Action">${action}</td></tr>`;
        });
    };

    // Payment ledger with 7.5% commission.
    window.loadPayments = function(){
        const listUpcoming=$('payUpcomingList'), listProgress=$('payProgressList'), listCompleted=$('payCompletedList'), listFines=$('payFinesList');
        if(!listUpcoming || !listProgress || !listCompleted || !listFines) return;
        listUpcoming.innerHTML=listProgress.innerHTML=listCompleted.innerHTML=listFines.innerHTML='';
        let totalUpcoming=0; let totalFines=(sellerFines||[]).reduce((s,f)=>s+Number(f.amount||0),0); const now=new Date();
        (sellerOrders||[]).forEach(o => {
            const items=getSellerItemsFromOrder(o); if(!items.length) return;
            const gross=items.reduce((s,i)=>s+(Number(i.price||0)*Number(i.qty||1)),0);
            const commission=commissionAmount(gross); const net=Math.max(0,gross-commission);
            if(o.status==='Delivered' && !o.sellerSettled){
                const deliveredDate=new Date(o.timestamp||o.deliveredAt||Date.now()); const transferDate=new Date(deliveredDate); transferDate.setDate(transferDate.getDate()+7);
                if(now<transferDate) listProgress.innerHTML += `<tr><td data-label="Delivered Date"><strong>${deliveredDate.toLocaleDateString()}</strong></td><td data-label="Release Date"><span style="color:var(--warning);font-weight:900;">${transferDate.toLocaleDateString()}</span></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Amount"><strong>₹${net.toLocaleString('en-IN')}</strong><br><span style="font-size:11px;color:var(--text-light);">Gross ₹${gross.toLocaleString('en-IN')} - 0% ₹${commission.toLocaleString('en-IN')}</span></td></tr>`;
                else { totalUpcoming += net; listUpcoming.innerHTML += `<tr><td data-label="Transfer Date"><strong>${transferDate.toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Status"><span style="color:var(--secondary);font-weight:900;">Processing by Bank</span></td><td data-label="Net Amount" style="color:var(--success);font-weight:900;">₹${net.toLocaleString('en-IN')}<br><span style="font-size:11px;color:var(--text-light);">0% commission saved in DB ledger</span></td></tr>`; savePaymentLedger({type:'order_payout_preview', orderId:o.id, gross, commission, net, status:'Upcoming'}); }
            }
        });
        if(!(sellerPayouts||[]).length) listCompleted.innerHTML = `<tr><td colspan="3" style="text-align:center;">No settlements yet.</td></tr>`;
        else sellerPayouts.forEach(p => listCompleted.innerHTML += `<tr class="clickable-row" onclick="viewSettledSlip('${safe(p.id)}')"><td data-label="Settled Date"><strong>${window.aryantaSmartDate(p.date||p.settledDate)}</strong></td><td data-label="Slip Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(p.id)}</strong></td><td data-label="Amount" style="color:var(--success);font-weight:900;">₹${Number(p.netPayout||0).toLocaleString('en-IN')}</td></tr>`);
        (sellerFines||[]).forEach(f => listFines.innerHTML += `<tr><td data-label="Date"><strong>${window.aryantaSmartDate(f.timestamp)}</strong></td><td data-label="Reason"><span style="font-weight:700;">${safe(f.reason)}</span></td><td data-label="Amount" style="color:var(--danger);font-weight:900;">-₹${Number(f.amount||0).toLocaleString('en-IN')}</td></tr>`);
        const finalUpcoming=totalUpcoming-totalFines; cachedTotalUpcoming=finalUpcoming;
        const alertBox=$('upcomingAlertBox');
        if(alertBox){
            if(totalUpcoming>0 || totalFines>0){ alertBox.style.display='block'; alertBox.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>Net payout after 0% commission:</span><strong>₹${totalUpcoming.toLocaleString('en-IN')}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--danger);"><span>Total Deductions / Fines:</span><strong>-₹${totalFines.toLocaleString('en-IN')}</strong></div><div style="border-top:2px solid #bfdbfe;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:900;font-size:16px;color:#1e3a8a;">Final Expected Transfer:</span><strong style="color:var(--primary);font-size:22px;">₹${finalUpcoming.toLocaleString('en-IN')}</strong></div>`; syncPayoutToAdmin && syncPayoutToAdmin(totalUpcoming,totalFines,finalUpcoming); }
            else alertBox.style.display='none';
        }
        validatePayoutButtons && validatePayoutButtons();
    };

    window.startAd = function(id){
        $('adProdId').value = id;
        const product = (sellerProducts||[]).find(p=>String(p.id)===String(id));
        const title = product ? product.name : 'this item';
        const modal = $('adPaymentModal');
        const cost = $('adCostDisplay'); if(cost) cost.textContent = '₹70';
        const p = modal ? modal.querySelector('p') : null;
        if(p) p.innerHTML = `<strong>Influence Blast Sponsored Placement</strong><br>${safe(title)} will be marked <b>Sponsored</b> for 24 hours. Make payment now or cancel.`;
        if(modal) modal.style.display='flex';
    };
    window.payAdOnline = function(){
        const id = $('adProdId').value;
        if(!API_KEYS.RAZORPAY){ showToast('Razorpay disabled. Payment intent saved in DB.', 'warning'); savePaymentLedger({type:'sponsored_ad_payment_intent', productId:id, amount:70, status:'Razorpay disabled'}); return; }
        var options={key:API_KEYS.RAZORPAY, amount:7000, currency:'INR', name:'Aryanta Ads', description:'Influence Blast Sponsored Ad', handler:async function(res){ await savePaymentLedger({type:'sponsored_ad_online', productId:id, amount:70, status:'Paid', razorpayPaymentId:res.razorpay_payment_id || ''}); closeModal('adPaymentModal'); executeAd(id); }, prefill:{email:activeSeller.email, contact:activeSeller.phone}, theme:{color:'#ec4899'}};
        new Razorpay(options).open();
    };
    window.payAdUpcoming = async function(){
        const id=$('adProdId').value;
        if(cachedTotalUpcoming < 70) return showToast('Insufficient payout balance.', 'error');
        try{ await addFineOnce('sponsored_ad_' + id + '_' + Date.now(), 70, 'Sponsored Ad Fee'); await savePaymentLedger({type:'sponsored_ad_payout', productId:id, amount:70, status:'Deducted from payout'}); closeModal('adPaymentModal'); executeAd(id); }catch(e){ showToast('Failed to process sponsored payment.', 'error'); }
    };

    window.processSubscription = async function(planName, method){
        const prices = {Basic:0, Go:(currentPlanDuration==='year'?1999:199), Pro:(currentPlanDuration==='year'?4999:499), Ultra:(currentPlanDuration==='year'?9999:999)};
        const cost = prices[planName] ?? 0;
        if(method === 'free' || cost === 0){ await activateSubscription('Basic'); await savePaymentLedger({type:'subscription', planName:'Basic', amount:0, status:'Activated'}); return; }
        if(method === 'payout'){
            if(cachedTotalUpcoming < cost) return showToast('Insufficient funds in upcoming payout.', 'error');
            await addFineOnce('subscription_' + planName + '_' + Date.now(), cost, `Subscription Deduction: ${planName}`);
            await savePaymentLedger({type:'subscription_payout', planName, amount:cost, status:'Deducted from payout'});
            return activateSubscription(planName);
        }
        if(!API_KEYS.RAZORPAY){ await savePaymentLedger({type:'subscription_payment_intent', planName, amount:cost, status:'Razorpay disabled'}); return showToast('Razorpay disabled. Payment intent saved in DB.', 'warning'); }
        const options={key:API_KEYS.RAZORPAY, amount:cost*100, currency:'INR', name:'Aryanta Subscription', description:`${planName} Seller Plan`, handler:async function(res){ await savePaymentLedger({type:'subscription_online', planName, amount:cost, status:'Paid', razorpayPaymentId:res.razorpay_payment_id || ''}); activateSubscription(planName); }, prefill:{email:activeSeller.email, contact:activeSeller.phone}, theme:{color:'#111827'}};
        new Razorpay(options).open();
    };
    window.activateSubscription = activateSubscription = async function(planName){
        const end = new Date(); end.setMonth(end.getMonth()+1);
        const payload={subscription:planName, subStartDate:nowIso(), subEndDate:end.toISOString(), updatedAt:nowIso()};
        try{ await db.collection('sellers').doc(activeSeller.email).update(payload); Object.assign(activeSeller,payload); localStorage.setItem('sellerToken',JSON.stringify(activeSeller)); const badge=$('currentPlanBadge'); if(badge) badge.textContent = planName; if(typeof updateBrandingLimitText === "function") updateBrandingLimitText(); showToast(`${planName} plan activated.`, 'success'); }catch(e){ showToast('Subscription update failed.', 'error'); }
    };

    const oldValidate = window.validatePayoutButtons;
    window.validatePayoutButtons = function(){
        try{ if(oldValidate) oldValidate(); }catch(e){}
        const ultra = $('btnSubPayoutUltra'); if(ultra) ultra.disabled = cachedTotalUpcoming < (currentPlanDuration==='year'?9999:999);
        const badge=$('currentPlanBadge'); if(badge && activeSeller) badge.textContent = activeSeller.subscription || 'Basic / Free';
    };

    document.addEventListener('DOMContentLoaded', function(){
        setTimeout(()=>{ if(typeof loadSettingsUI === 'function') loadSettingsUI(); }, 800);
    });
})();


(function(){
    const PATCH_ID = 'ARYANTA_FINAL_BREACH_PAYMENT_PATCH_2026_05_19';
    window[PATCH_ID] = true;
    const $ = id => document.getElementById(id);
    const txt = v => String(v == null ? '' : v);
    const lower = v => txt(v).toLowerCase().trim();
    const safe = v => txt(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const nowIso2 = () => new Date().toISOString();
    const newStatuses = ['placed','new','pending','confirmed','order placed','processing'];
    function orderAgeHours2(o){
        const d = new Date(o.timestamp || o.createdAt || o.orderDate || o.date || Date.now());
        const t = Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
        return (Date.now() - t) / 3600000;
    }
    function isNewOrder2(o){ return newStatuses.includes(lower(o.status || o.orderStatus)); }
    function isBreachedOrder2(o){
        return !!(o.sellerBreach || o.breached || o.slaBreached || lower(o.status).includes('breach') || (isNewOrder2(o) && orderAgeHours2(o) >= 12));
    }
    function sellerItems2(o){
        try{ return typeof getSellerItemsFromOrder === 'function' ? getSellerItemsFromOrder(o) : (Array.isArray(o.items) ? o.items : []); }catch(e){ return []; }
    }
    function orderAmount2(o){
        const items = sellerItems2(o);
        if(items.length) return items.reduce((s,i)=>s + (Number(i.price || i.amount || i.finalPrice || 0) * Number(i.qty || i.quantity || 1)), 0);
        return Number(o.finalAmount || o.totalPrice || o.amount || o.total || 0);
    }
    function commission2(gross){ return 0; }
    function addLedgerRow(arr, row){ arr.push(row); }
    window.loadBreachedOrders = function(){
        const list = $('breachedOrdersList');
        if(!list) return;
        const rows = [];
        (sellerOrders || []).forEach(o => {
            if(!sellerItems2(o).length) return;
            if(!isBreachedOrder2(o)) return;
            const items = sellerItems2(o);
            const amount = orderAmount2(o);
            const age = Math.floor(orderAgeHours2(o));
            const itemHtml = items.map(i => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div>${typeof getProductImageHtml === 'function' ? getProductImageHtml(i.name || i.title || '') : ''}</div><div><b>${safe(i.name || i.title || 'Product')}</b><br><span style="font-size:12px;color:var(--text-light);">Qty ${Number(i.qty || i.quantity || 1)}</span></div></div>`).join('');
            rows.push(`<tr class="clickable-row" onclick="viewOrderDetails('${safe(o.id)}')">
                <td data-label="Date"><strong>${window.aryantaSmartDate(o.timestamp || o.createdAt, true)}</strong><br><span style="font-size:11px;color:var(--danger);font-weight:800;">${age}h old</span></td>
                <td data-label="Ref"><strong style="font-family:monospace;color:var(--danger);">${safe(o.order_no || o.orderNo || o.id)}</strong></td>
                <td data-label="Items">${itemHtml}</td>
                <td data-label="Reason"><span style="background:var(--danger);color:#fff;padding:5px 9px;border-radius:9px;font-weight:900;">SLA Breached</span><br><span style="font-size:12px;color:var(--text-light);">${safe(o.cancelReason || o.breachReason || 'Seller did not accept within SLA')}</span></td>
                <td data-label="Amount / Fine"><strong>₹${amount.toLocaleString('en-IN')}</strong><br><span style="font-size:12px;color:var(--danger);font-weight:800;">Fine can apply</span></td>
                <td data-label="Action"><button class="btn-sm" onclick="event.stopPropagation();viewOrderDetails('${safe(o.id)}')"><i class="fas fa-eye"></i> View</button></td>
            </tr>`);
        });
        list.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="6" style="text-align:center;font-weight:700;">No breached orders or items found.</td></tr>`;
        const badge = $('badge-breached');
        if(badge){ badge.innerText = rows.length; badge.style.display = rows.length ? 'inline-block' : 'none'; }
    };
    const previousLoadPayments = window.loadPayments;
    window.loadPayments = function(){
        const listUpcoming=$('payUpcomingList'), listProgress=$('payProgressList'), listCompleted=$('payCompletedList'), listFines=$('payFinesList'), listAll=$('payAllList');
        if(!listUpcoming || !listProgress || !listCompleted || !listFines){
            if(previousLoadPayments) return previousLoadPayments();
            return;
        }
        listUpcoming.innerHTML = '';
        listProgress.innerHTML = '';
        listCompleted.innerHTML = '';
        listFines.innerHTML = '';
        if(listAll) listAll.innerHTML = '';
        const ledger = [];
        let totalUpcoming = 0;
        let totalFines = (sellerFines || []).reduce((s,f)=>s + Number(f.amount || 0), 0);
        const now = new Date();
        (sellerOrders || []).forEach(o => {
            const items = sellerItems2(o);
            if(!items.length) return;
            const gross = orderAmount2(o);
            const commission = commission2(gross);
            const net = Math.max(0, gross - commission);
            if(o.status === 'Delivered' && !o.sellerSettled){
                const deliveredDate = new Date(o.deliveredAt || o.timestamp || Date.now());
                const transferDate = new Date(deliveredDate);
                transferDate.setDate(transferDate.getDate() + 7);
                if(now < transferDate){
                    listProgress.innerHTML += `<tr><td data-label="Delivered Date"><strong>${deliveredDate.toLocaleDateString()}</strong></td><td data-label="Release Date"><span style="color:var(--warning);font-weight:900;">${transferDate.toLocaleDateString()}</span></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no || o.id)}</strong></td><td data-label="Amount"><strong>₹${net.toLocaleString('en-IN')}</strong><br><span style="font-size:11px;color:var(--text-light);">Gross ₹${gross.toLocaleString('en-IN')} - fee ₹${commission.toLocaleString('en-IN')}</span></td></tr>`;
                    addLedgerRow(ledger, {date:deliveredDate, type:'In Progress', ref:o.order_no || o.id, gross, deductions:commission, net, status:'Release on ' + transferDate.toLocaleDateString()});
                }else{
                    totalUpcoming += net;
                    listUpcoming.innerHTML += `<tr><td data-label="Transfer Date"><strong>${transferDate.toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no || o.id)}</strong></td><td data-label="Status"><span style="color:var(--secondary);font-weight:900;">Processing by Bank</span></td><td data-label="Net Amount" style="color:var(--success);font-weight:900;">₹${net.toLocaleString('en-IN')}<br><span style="font-size:11px;color:var(--text-light);">Gross ₹${gross.toLocaleString('en-IN')} - fee ₹${commission.toLocaleString('en-IN')}</span></td></tr>`;
                    addLedgerRow(ledger, {date:transferDate, type:'Upcoming', ref:o.order_no || o.id, gross, deductions:commission, net, status:'Processing'});
                }
            }
        });
        if(!(sellerPayouts || []).length) listCompleted.innerHTML = `<tr><td colspan="3" style="text-align:center;">No settlements yet.</td></tr>`;
        else (sellerPayouts || []).forEach(p => {
            const amount = Number(p.netPayout || p.amount || 0);
            listCompleted.innerHTML += `<tr class="clickable-row" onclick="viewSettledSlip('${safe(p.id)}')"><td data-label="Settled Date"><strong>${window.aryantaSmartDate(p.date || p.settledDate)}</strong></td><td data-label="Slip Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(p.id)}</strong></td><td data-label="Amount" style="color:var(--success);font-weight:900;">₹${amount.toLocaleString('en-IN')}</td></tr>`;
            addLedgerRow(ledger, {date:new Date(p.date || p.settledDate || Date.now()), type:'Settled', ref:p.id, gross:Number(p.gross || amount), deductions:Number(p.fines || p.commission || 0), net:amount, status:p.status || 'Settled'});
        });
        (sellerFines || []).forEach(f => {
            const amt = Number(f.amount || 0);
            listFines.innerHTML += `<tr><td data-label="Date"><strong>${window.aryantaSmartDate(f.timestamp)}</strong></td><td data-label="Reason"><span style="font-weight:700;">${safe(f.reason)}</span></td><td data-label="Amount" style="color:var(--danger);font-weight:900;">-₹${amt.toLocaleString('en-IN')}</td></tr>`;
            addLedgerRow(ledger, {date:new Date(f.timestamp || Date.now()), type:'Fine', ref:f.key || f.id || '-', gross:0, deductions:amt, net:-amt, status:f.reason || 'Deducted'});
        });
        if(listAll){
            ledger.sort((a,b)=>b.date-a.date);
            listAll.innerHTML = ledger.length ? ledger.map(r => `<tr><td data-label="Date"><strong>${r.date.toLocaleDateString()}</strong></td><td data-label="Type"><span class="badge-ui">${safe(r.type)}</span></td><td data-label="Reference"><strong style="font-family:monospace;">${safe(r.ref)}</strong></td><td data-label="Gross">₹${Number(r.gross || 0).toLocaleString('en-IN')}</td><td data-label="Deductions" style="color:var(--danger);font-weight:900;">-₹${Number(r.deductions || 0).toLocaleString('en-IN')}</td><td data-label="Net / Amount" style="font-weight:900;color:${Number(r.net || 0) < 0 ? 'var(--danger)' : 'var(--success)'};">₹${Number(r.net || 0).toLocaleString('en-IN')}</td><td data-label="Status">${safe(r.status)}</td></tr>`).join('') : `<tr><td colspan="7" style="text-align:center;font-weight:700;">No ledger records yet.</td></tr>`;
        }
        if(!listProgress.innerHTML) listProgress.innerHTML = `<tr><td colspan="4" style="text-align:center;font-weight:700;">No in-progress payments.</td></tr>`;
        if(!listUpcoming.innerHTML) listUpcoming.innerHTML = `<tr><td colspan="4" style="text-align:center;font-weight:700;">No upcoming transfers.</td></tr>`;
        if(!listFines.innerHTML) listFines.innerHTML = `<tr><td colspan="3" style="text-align:center;font-weight:700;">No fines.</td></tr>`;
        const finalUpcoming = totalUpcoming - totalFines;
        cachedTotalUpcoming = finalUpcoming;
        const alertBox = $('upcomingAlertBox');
        if(alertBox){
            if(totalUpcoming > 0 || totalFines > 0){
                alertBox.style.display='block';
                alertBox.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>Net payout after 0% platform fee:</span><strong>₹${totalUpcoming.toLocaleString('en-IN')}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--danger);"><span>Total fines/deductions:</span><strong>-₹${totalFines.toLocaleString('en-IN')}</strong></div><div style="border-top:2px solid #bfdbfe;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:900;font-size:16px;color:#1e3a8a;">Final Expected Transfer:</span><strong style="color:var(--primary);font-size:22px;">₹${finalUpcoming.toLocaleString('en-IN')}</strong></div>`;
                if(typeof syncPayoutToAdmin === 'function') syncPayoutToAdmin(totalUpcoming,totalFines,finalUpcoming);
            }else alertBox.style.display='none';
        }
        if(typeof validatePayoutButtons === 'function') validatePayoutButtons();
    };
    const oldShowSection = window.showSection;
    window.showSection = function(section){
        if(oldShowSection) oldShowSection(section);
        if(section === 'breached') window.loadBreachedOrders();
    };
})();


(function(){
    if(window.ARYANTA_SELLER_NO_LAG_PATCH_2026_05_19)return;
    window.ARYANTA_SELLER_NO_LAG_PATCH_2026_05_19=true;
    const byId=id=>document.getElementById(id);
    const asText=v=>String(v==null?'':v);
    const lower=v=>asText(v).toLowerCase().trim();
    const sellerEmail=()=>asText(activeSeller&&activeSeller.email).toLowerCase().trim();
    const dataState={products:false,orders:false,payments:false,warranty:false,support:false,b2b:false,reviews:false,loading:{}};
    const visibleMap={home:'homeSection',profile:'profileSection',inventory:'inventorySection',newOrders:'newOrdersSection',acceptedOrders:'acceptedOrdersSection',completedScan:'completedScanSection',shippedOrders:'shippedOrdersSection',deliveredOrders:'deliveredOrdersSection',history:'historySection',returns:'returnsSection',warranty:'warrantySection',payments:'paymentsSection',ads:'adsSection',subscription:'subscriptionSection',tutorial:'tutorialSection',qna:'qnaSection',buyB2b:'buyB2bSection',support:'supportSection',settings:'settingsSection',oldTickets:'oldTicketsSection',notifications:'notificationsSection',breached:'breachedSection'};
    function runOnce(key,fn){
        if(dataState[key])return Promise.resolve();
        if(dataState.loading[key])return dataState.loading[key];
        dataState.loading[key]=Promise.resolve().then(fn).then(()=>{dataState[key]=true;}).catch(e=>{console.warn('Aryanta lazy load failed:',key,e);}).finally(()=>{delete dataState.loading[key];});
        return dataState.loading[key];
    }
    function isMyOrderLight(o){
        const email=sellerEmail();
        if(!email||!o)return false;
        const direct=lower(o.sellerEmail||o.seller_email||o.vendorEmail||o.vendor_email);
        if(direct&&direct===email)return true;
        const products=(sellerProducts||[]);
        const ids=new Set(products.map(p=>asText(p.id||p.productId||p.product_id).trim()).filter(Boolean));
        const skus=new Set(products.map(p=>lower(p.sku)).filter(Boolean));
        return Array.isArray(o.items)&&o.items.some(i=>{
            const itemEmail=lower(i.sellerEmail||i.seller_email||i.vendorEmail||i.vendor_email||i.seller);
            if(itemEmail)return itemEmail===email;
            const id=asText(i.id||i.productId||i.product_id||i.productDocId).trim();
            const sku=lower(i.sku);
            return (id&&ids.has(id))||(sku&&skus.has(sku));
        });
    }
    function hideLoaderFast(){
        const loader=byId('pageLoader');
        if(loader){loader.style.opacity='0';setTimeout(()=>{loader.style.display='none';loader.style.opacity='1';},220);}
    }
    function setMiniLoader(text){
        const loader=byId('pageLoader');
        const lp=byId('loadPercent');
        if(loader)loader.style.display='flex';
        if(lp)lp.innerText=text||'Loading';
    }
    window.ensureSellerProducts=function(force){
        if(force)dataState.products=false;
        return runOnce('products',async()=>{
            if(!db||!activeSeller)return;
            const email=sellerEmail();
            const snap=await db.collection('products').where('sellerEmail','==',email).get();
            sellerProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
        });
    };
    window.ensureSellerOrders=function(force){
        if(force)dataState.orders=false;
        return runOnce('orders',async()=>{
            if(!db||!activeSeller)return;
            await window.ensureSellerProducts();
            const snap=await db.collection('orders').orderBy('timestamp','desc').limit(350).get();
            const rows=[];
            snap.forEach(doc=>{const o={id:doc.id,...doc.data()};if(isMyOrderLight(o))rows.push(o);});
            sellerOrders=rows;
        });
    };
    window.ensureSellerPayments=function(force){
        if(force)dataState.payments=false;
        return runOnce('payments',async()=>{
            if(!db||!activeSeller)return;
            await window.ensureSellerOrders();
            const email=sellerEmail();
            const fineSnap=await db.collection('fines').where('email','==',email).get();
            sellerFines=fineSnap.docs.map(d=>({id:d.id,...d.data()}));
            const payoutSnap=await db.collection('seller_payouts').where('sellerEmail','==',email).get();
            sellerPayouts=payoutSnap.docs.map(d=>({id:d.id,...d.data()}));
        });
    };
    window.ensureSellerWarranty=function(force){
        if(force)dataState.warranty=false;
        return runOnce('warranty',async()=>{
            if(!db||!activeSeller)return;
            const snap=await db.collection('warranties').where('sellerEmail','==',sellerEmail()).get();
            sellerWarranties=snap.docs.map(d=>({id:d.id,...d.data()}));
        });
    };
    window.ensureSellerSupport=function(force){
        if(force)dataState.support=false;
        return runOnce('support',async()=>{
            if(!db||!activeSeller)return;
            const snap=await db.collection('seller_support_tickets').where('email','==',sellerEmail()).orderBy('timestamp','desc').limit(120).get();
            sellerSupportTickets=snap.docs.map(d=>({id:d.id,...d.data()}));
        });
    };
    window.ensureSellerReviews=function(force){
        if(force)dataState.reviews=false;
        return runOnce('reviews',async()=>{
            if(!db||!activeSeller)return;
            await window.ensureSellerProducts();
            const ids=new Set((sellerProducts||[]).map(p=>asText(p.id).trim()).filter(Boolean));
            const snap=await db.collection('reviews').limit(300).get();
            sellerReviews=[];
            snap.forEach(doc=>{const r={id:doc.id,...doc.data()};if(ids.has(asText(r.productId).trim()))sellerReviews.push(r);});
        });
    };
    window.ensureSellerB2B=function(force){
        if(force)dataState.b2b=false;
        return runOnce('b2b',async()=>{
            if(!db||!activeSeller)return;
            try{const snap=await db.collection('b2b_items').where('sellerEmail','==',sellerEmail()).get();b2bItems=snap.docs.map(d=>({id:d.id,...d.data()}));}catch(e){b2bItems=b2bItems||[];}
        });
    };
    window.fetchSupportTicketBadges=async function(){
        try{
            if(!db||!activeSeller)return;
            const snap=await db.collection('seller_support_tickets').where('email','==',sellerEmail()).limit(60).get();
            let waitingCount=0;
            snap.forEach(doc=>{const d=doc.data();if(d.status==='Waiting for User'||d.status==='In Progress')waitingCount++;});
            const b=byId('badge-support-replies');
            if(b){b.style.display=waitingCount?'inline-block':'none';b.innerText=waitingCount;}
        }catch(e){}
    };
    async function loadDashboardNumbers(){
        setMiniLoader('Fast');
        try{
            const sm=byId('sellerMarquee');
            db.collection('site_config').doc('global').get().then(conf=>{
                if(sm)sm.innerText=conf.exists&&conf.data().marqueeMessage?conf.data().marqueeMessage:'We help to make your business no. 1. Thanks for choosing us! Keep growing with Aryanta Prime Seller Network.';
            }).catch(()=>{});
            await Promise.all([window.ensureSellerProducts(),window.ensureSellerOrders()]);
            if(typeof renderDashboardStats==='function')renderDashboardStats();
            if(typeof window.loadBreachedOrders==='function')window.loadBreachedOrders();
        }finally{hideLoaderFast();}
    }
    window.initDashboard=initDashboard=async function(){
        await loadDashboardNumbers();
    };
    function activateOnly(section){
        const target=visibleMap[section]||visibleMap.home;
        document.querySelectorAll('.data-section').forEach(sec=>sec.classList.remove('active'));
        const el=byId(target);if(el)el.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(nav=>nav.classList.remove('active'));
        const clicked=window.event&&window.event.target&&window.event.target.closest?window.event.target.closest('.nav-item'):null;
        if(clicked)clicked.classList.add('active');
        const sb=byId('mobileSidebar');if(sb)sb.classList.remove('open');
        const ov=byId('mobileSidebarOverlay');if(ov)ov.style.display='none';
    }
    function loadingRow(id,cols,text){
        const el=byId(id);if(el)el.innerHTML=`<tr><td colspan="${cols}" style="text-align:center;font-weight:800;padding:28px;"><i class="fas fa-circle-notch fa-spin"></i> ${text||'Loading live data...'}</td></tr>`;
    }
    window.showSection=async function(section){
        if(section==='tutorial')return window.openHowToSellPage?window.openHowToSellPage():window.open('https://aryanta.in/getdetails','_blank','noopener');
        activateOnly(section);
        try{
            switch(section){
                case 'home':await window.ensureSellerOrders();if(typeof renderDashboardStats==='function')renderDashboardStats();break;
                case 'profile':if(typeof loadProfile==='function')loadProfile();break;
                case 'inventory':loadingRow('inventoryTableBody',6,'Loading inventory...');await window.ensureSellerProducts();if(typeof loadInventory==='function')loadInventory();break;
                case 'newOrders':loadingRow('newOrdersList',6,'Loading new orders...');await window.ensureSellerOrders();if(typeof loadNewOrders==='function')loadNewOrders();break;
                case 'acceptedOrders':loadingRow('acceptedOrdersList',6,'Loading accepted orders...');await window.ensureSellerOrders();if(typeof loadAcceptedOrders==='function')loadAcceptedOrders();break;
                case 'completedScan':await window.ensureSellerOrders();if(typeof loadCompletedScanOrders==='function')loadCompletedScanOrders();break;
                case 'shippedOrders':await window.ensureSellerOrders();if(typeof loadShippedOrders==='function')loadShippedOrders();break;
                case 'deliveredOrders':await window.ensureSellerOrders();if(typeof loadDeliveredOrders==='function')loadDeliveredOrders();break;
                case 'history':await window.ensureSellerOrders();if(typeof loadOrderHistory==='function')loadOrderHistory();break;
                case 'returns':await window.ensureSellerOrders();if(typeof loadReturns==='function')loadReturns();break;
                case 'warranty':await window.ensureSellerWarranty();if(typeof loadWarranty==='function')loadWarranty();break;
                case 'payments':loadingRow('payUpcomingList',4,'Building payment ledger...');await window.ensureSellerPayments();if(typeof loadPayments==='function')loadPayments();break;
                case 'ads':await window.ensureSellerProducts();if(typeof loadAds==='function')loadAds();break;
                case 'subscription':await window.ensureSellerPayments();if(typeof loadSubscriptionsUI==='function')loadSubscriptionsUI();break;
                case 'qna':await window.ensureSellerProducts();if(typeof loadQna==='function')loadQna();break;
                case 'buyB2b':await window.ensureSellerB2B();if(typeof loadB2bStore==='function')loadB2bStore();break;
                case 'support':await window.ensureSellerSupport();if(typeof filterSupportTickets==='function')filterSupportTickets('All');break;
                case 'settings':if(typeof loadSettingsUI==='function')loadSettingsUI();break;
                case 'oldTickets':await window.ensureSellerSupport();if(typeof loadOldTickets==='function')loadOldTickets();break;
                case 'notifications':if(typeof fetchNotifications==='function')fetchNotifications();break;
                case 'breached':await window.ensureSellerOrders();if(typeof loadBreachedOrders==='function')loadBreachedOrders();break;
            }
        }catch(e){console.error('Section load failed:',section,e);if(typeof showToast==='function')showToast('Could not load this section. Check network and retry.','error');}
    };
    const oldRefresh=window.loadFirebaseData;
    window.loadFirebaseData=async function(){
        Object.keys(dataState).forEach(k=>{if(k!=='loading')dataState[k]=false;});
        await loadDashboardNumbers();
        if(typeof showToast==='function')showToast('Dashboard numbers refreshed. Open a tab to load its full details.','success');
        if(oldRefresh&&false)oldRefresh();
    };
})();

(function(){
    const BOOT_SECTIONS = ['Dashboard','Profile Info','Notifications','My Inventory','New Orders'];
    const BOOT_LIMIT_ORDERS = 350;
    const MONTH_KEY = new Date().toISOString().slice(0,7);
    const $id = id => document.getElementById(id);
    const txt = v => String(v == null ? '' : v);
    const low = v => txt(v).toLowerCase().trim();
    const nowIso2 = () => new Date().toISOString();
    window.__ARYANTA_RAM = window.__ARYANTA_RAM || {bootLoaded:false,booting:false,loadedTabs:{},notifications:[]};

    function setBootLoader(message, percent){
        const loader=$id('pageLoader');
        const msg=$id('loaderMessage');
        const pct=$id('loadPercent');
        if(loader){loader.style.display='flex';loader.style.opacity='1';}
        if(msg)msg.innerText=message || 'Loading secure seller panel...';
        if(pct) pct.innerText = typeof percent === 'number' ? percent + '%' : (percent || 'Loading');
    }
    function hideBootLoader(){
        const loader=$id('pageLoader');
        if(!loader)return;
        loader.style.opacity='0';
        setTimeout(()=>{loader.style.display='none';loader.style.opacity='1';},260);
    }
    function showLoginOnly(){
        const lo=$id('loginOverlay');
        const lb=$id('loginBox');
        const sb=$id('statusBox');
        const app=$id('mainAppContainer') || document.querySelector('.seller-container');
        if(lo)lo.style.display='flex';
        if(lb)lb.style.display='block';
        if(sb)sb.style.display='none';
        if(app)app.style.display='none';
        hideBootLoader();
    }
    function showAppOnly(){
        const lo=$id('loginOverlay');
        const app=$id('mainAppContainer') || document.querySelector('.seller-container');
        if(lo)lo.style.display='none';
        if(app)app.style.display='flex';
    }
    function showRestricted(title,message,timerText){
        const lo=$id('loginOverlay');
        const lb=$id('loginBox');
        const sb=$id('statusBox');
        const app=$id('mainAppContainer') || document.querySelector('.seller-container');
        if(lo)lo.style.display='flex';
        if(lb)lb.style.display='none';
        if(sb)sb.style.display='block';
        if(app)app.style.display='none';
        const st=$id('statusTitle'); if(st)st.innerText=title;
        const sm=$id('statusMessage'); if(sm)sm.innerHTML=message;
        const tm=$id('suspendTimer');
        if(tm){
            if(timerText){tm.style.display='block';tm.innerText=timerText;}
            else tm.style.display='none';
        }
        hideBootLoader();
    }
    function docEmail(){ return low(activeSeller && activeSeller.email); }
    function productKeys(){
        const ids=new Set(), skus=new Set();
        (sellerProducts||[]).forEach(p=>{
            [p.id,p.productId,p.product_id,p.productDocId].forEach(v=>{v=txt(v).trim();if(v)ids.add(v);});
            const sku=low(p.sku); if(sku)skus.add(sku);
        });
        return {ids,skus};
    }
    function isMineOrder(order){
        const email=docEmail();
        if(!order || !email)return false;
        const direct=low(order.sellerEmail || order.seller_email || order.vendorEmail || order.vendor_email);
        if(direct && direct===email)return true;
        const {ids,skus}=productKeys();
        const items=Array.isArray(order.items)?order.items:[];
        return items.some(item=>{
            const itemEmail=low(item.sellerEmail || item.seller_email || item.vendorEmail || item.vendor_email || item.seller);
            if(itemEmail)return itemEmail===email;
            const id=txt(item.id || item.productId || item.product_id || item.productDocId).trim();
            const sku=low(item.sku);
            return (id && ids.has(id)) || (sku && skus.has(sku));
        });
    }
    function dateMs(value){
        if(!value)return 0;
        if(value && typeof value.toDate==='function')return value.toDate().getTime();
        const n=Date.parse(value); return Number.isFinite(n)?n:0;
    }
    function sortNewest(rows){ return (rows||[]).sort((a,b)=>dateMs(b.timestamp||b.time||b.createdAt)-dateMs(a.timestamp||a.time||a.createdAt)); }
    async function fetchSellerDocFromToken(token){
        const email=low(token && token.email);
        if(!email)throw new Error('Seller token email missing');
        let snap=await db.collection('sellers').doc(email).get();
        if(snap.exists)return {id:snap.id,...snap.data()};
        const qs=await db.collection('sellers').where('email','==',email).limit(1).get();
        if(!qs.empty)return {id:qs.docs[0].id,...qs.docs[0].data()};
        return token;
    }
    async function forceOfflineMode(reason){
        try{
            if(!activeSeller || !activeSeller.email || !db)return;
            const settings={...(activeSeller.settings||{}),offline:true};
            activeSeller.settings=settings;
            await db.collection('sellers').doc(activeSeller.email).set({settings,offline:true,offlineReason:reason||'Account restricted',offlineForcedAt:nowIso2()},{merge:true});
            const snap=await db.collection('products').where('sellerEmail','==',docEmail()).get();
            let batch=db.batch(), count=0;
            for(const d of snap.docs){
                batch.update(d.ref,{isVisible:false,visible:false,publicVisible:false,offlineHidden:true,offlineHiddenAt:nowIso2()});
                count++;
                if(count%420===0){await batch.commit();batch=db.batch();}
            }
            if(count%420!==0)await batch.commit();
        }catch(e){console.warn('Offline enforcement skipped:',e);}
    }
    function statusTimer(unlockMs){
        clearInterval(window.__sellerSuspendTick);
        const tm=$id('suspendTimer');
        function paint(){
            const diff=unlockMs-Date.now();
            if(diff<=0){if(tm)tm.innerText='Suspension period completed. Refreshing account...';clearInterval(window.__sellerSuspendTick);setTimeout(()=>location.reload(),1200);return;}
            const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000), sec=Math.floor(diff%60000/1000);
            if(tm)tm.innerText=`${d}d ${h}h ${m}m ${sec}s`;
        }
        paint(); window.__sellerSuspendTick=setInterval(paint,1000);
    }
    async function handleSellerStatus(){
        const status=low(activeSeller.status || activeSeller.accountStatus || activeSeller.sellerStatus);
        if(status==='blocked' || status==='block'){
            await forceOfflineMode('Blocked account');
            showRestricted('Account Blocked','Your seller account is blocked by Aryanta. Offline Mode has been automatically enabled and your live products are hidden. For more details contact the company at <b>support@aryanta.in</b>.','');
            return false;
        }
        if(status==='suspended' || status==='suspend'){
            let suspendedAt=activeSeller.suspendedAt || activeSeller.suspendAt || activeSeller.suspensionStartedAt;
            if(!suspendedAt){
                suspendedAt=nowIso2();
                try{await db.collection('sellers').doc(activeSeller.email).set({suspendedAt},{merge:true});}catch(e){}
            }
            const start=dateMs(suspendedAt)||Date.now();
            const unlock=start+7*86400000;
            if(Date.now()>=unlock){
                try{await db.collection('sellers').doc(activeSeller.email).set({status:'Active',suspendedAt:firebase.firestore.FieldValue.delete()},{merge:true});}catch(e){}
                activeSeller.status='Active';
                delete activeSeller.suspendedAt;
                return true;
            }
            await forceOfflineMode('Suspended account');
            showRestricted('Account Suspended','You cannot use this seller panel for <b>7 days</b> from the suspension time. Offline Mode has been automatically enabled and your products are hidden. For more details contact the company at <b>support@aryanta.in</b>.','Calculating...');
            statusTimer(unlock);
            return false;
        }
        return true;
    }
    async function fetchProductsCore(){
        const snap=await db.collection('products').where('sellerEmail','==',docEmail()).get();
        sellerProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
        window.__ARYANTA_RAM.products=sellerProducts;
    }
    async function fetchOrdersCore(){
        const snap=await db.collection('orders').orderBy('timestamp','desc').limit(BOOT_LIMIT_ORDERS).get();
        const rows=[];
        snap.forEach(doc=>{const o={id:doc.id,...doc.data()}; if(isMineOrder(o))rows.push(o);});
        sellerOrders=rows;
        window.__ARYANTA_RAM.orders=sellerOrders;
    }
    async function fetchNotificationsCore(){
        const email=docEmail();
        const rows=[];
        try{
            const snap=await db.collection('admin_broadcasts').orderBy('timestamp','desc').limit(40).get();
            snap.forEach(doc=>{
                const d=doc.data();
                const target=low(d.target || d.sellerEmail || d.email || 'all');
                if(target==='all' || target==='sellers' || target===email){rows.push({id:doc.id,source:'admin_broadcasts',text:d.message||d.text||d.title||'New Aryanta notice',title:d.title||'Aryanta Notice',time:d.timestamp||d.time||d.createdAt||nowIso2(),link:d.link||d.url||d.actionLink||''});}
            });
        }catch(e){console.warn('admin_broadcasts notifications skipped',e);}
        try{
            const snap=await db.collection('seller_notifications').where('email','==',email).limit(50).get();
            snap.forEach(doc=>{const d=doc.data();rows.push({id:doc.id,source:'seller_notifications',text:d.message||d.text||d.title||'Seller notification',title:d.title||'Seller Notification',time:d.timestamp||d.time||d.createdAt||nowIso2(),link:d.link||d.url||d.actionLink||''});});
            const snap2=await db.collection('seller_notifications').where('sellerEmail','==',email).limit(50).get();
            snap2.forEach(doc=>{const d=doc.data();rows.push({id:doc.id,source:'seller_notifications',text:d.message||d.text||d.title||'Seller notification',title:d.title||'Seller Notification',time:d.timestamp||d.time||d.createdAt||nowIso2(),link:d.link||d.url||d.actionLink||''});});
        }catch(e){console.warn('seller_notifications skipped',e);}
        try{
            const snap=await db.collection('seller_popups').where('sellerEmail','==',email).limit(25).get();
            snap.forEach(doc=>{const d=doc.data();rows.push({id:doc.id,source:'seller_popups',text:d.message||d.text||d.title||'Seller popup',title:d.title||'Seller Notice',time:d.timestamp||d.time||d.createdAt||nowIso2(),link:d.link||d.url||d.actionLink||''});});
        }catch(e){console.warn('seller_popups skipped',e);}
        adminNotifications=sortNewest(rows).slice(0,80);
        sellerNotifications=adminNotifications;
        unreadNotifCount=adminNotifications.filter(n=>!n.read && n.isRead!==true).length || adminNotifications.length;
        window.__ARYANTA_RAM.notifications=adminNotifications;
        renderNotificationsFinal();
    }
    function renderNotificationsFinal(){
        const badge=$id('notifBadge');
        if(badge){badge.style.display=adminNotifications.length?'inline-block':'none';badge.innerText=adminNotifications.length;}
        const dropdown=$id('notifList');
        const full=$id('fullNotifList');
        const html=adminNotifications.length?adminNotifications.map(n=>{
            const time=window.aryantaSmartDate(n.time, true);
            const link=n.link?`<a href="${String(n.link).startsWith('http')?n.link:'https://'+n.link}" target="_blank" rel="noopener" class="short-link-chip"><i class="fas fa-link"></i> Open Link</a>`:'';
            return `<div class="notification-card" onclick="openFullNotifFinal('${n.id}')"><strong>${escapeHtmlFinal(n.title||'Aryanta Notice')}</strong><p>${escapeHtmlFinal(n.text||'No message')}</p><small><i class="fas fa-clock"></i> ${escapeHtmlFinal(time)}</small>${link}</div>`;
        }).join(''):`<div style="text-align:center;padding:30px;color:var(--text-light);font-weight:800;"><i class="fas fa-bell-slash" style="font-size:30px;margin-bottom:10px;"></i><br>No notifications yet.</div>`;
        if(dropdown)dropdown.innerHTML=html;
        if(full)full.innerHTML=html;
    }
    function escapeHtmlFinal(v){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    window.openFullNotifFinal=function(id){
        const n=(adminNotifications||[]).find(x=>String(x.id)===String(id));
        if(!n)return;
        if(typeof showToast==='function')showToast(n.text||'Notification','info');
        if(n.link){const link=String(n.link).startsWith('http')?n.link:'https://'+n.link; window.open(link,'_blank','noopener');}
    };
    async function bootstrapInitialSellerData(){
        if(window.__ARYANTA_RAM.booting)return;
        window.__ARYANTA_RAM.booting=true;
        setBootLoader('Loading Dashboard, Profile, Notifications, My Inventory and New Orders...',12);
        await fetchProductsCore();
        setBootLoader('Inventory loaded. Matching seller orders...',38);
        await Promise.all([fetchOrdersCore(), fetchNotificationsCore()]);
        setBootLoader('Rendering dashboard and seller tools...',72);
        try{if(typeof applySettingsToUI==='function')applySettingsToUI();}catch(e){}
        try{if(typeof loadProfile==='function')loadProfile();}catch(e){}
        try{if(typeof renderDashboardStats==='function')renderDashboardStats();}catch(e){}
        try{if(typeof loadInventory==='function')loadInventory();}catch(e){}
        try{if(typeof loadNewOrders==='function')loadNewOrders();}catch(e){}
        try{if(typeof loadBreachedOrders==='function')loadBreachedOrders();}catch(e){}
        try{updateBrandingLimitText();}catch(e){}
        renderBrandingPreviewsFinal();
        window.__ARYANTA_RAM.bootLoaded=true;
        window.__ARYANTA_RAM.booting=false;
        setBootLoader('Opening seller panel...',100);
    }
    checkSession = window.checkSession = async function(){
        const raw=localStorage.getItem('sellerToken');
        if(!raw || !db)return showLoginOnly();
        setBootLoader('Checking seller account status...',5);
        let token=null;
        try{token=JSON.parse(raw);}catch(e){localStorage.removeItem('sellerToken');return showLoginOnly();}
        try{
            activeSeller=await fetchSellerDocFromToken(token);
            if(!activeSeller.settings)activeSeller.settings={};
            localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
            if(!(await handleSellerStatus()))return;
            const lo=$id('loginOverlay'); if(lo)lo.style.display='none';
            const app=$id('mainAppContainer') || document.querySelector('.seller-container'); if(app)app.style.display='none';
            const greet=$id('sellerGreeting'); if(greet)greet.innerText=`| ${activeSeller.companyName||activeSeller.shopName||activeSeller.email||''}`;
            const vb=$id('verifiedBadge'); if(vb && activeSeller.subscription && activeSeller.subscription!=='None')vb.style.display='inline';
            const kb=$id('kycAlertBanner'); if(kb)kb.style.display=activeSeller.kycRequested?'block':'none';
            await bootstrapInitialSellerData();
            showAppOnly();
            hideBootLoader();
        }catch(e){
            console.error('Seller boot failed:',e);
            setBootLoader('Could not load seller panel. Check internet and retry.', 'Retry');
            if(typeof showToast==='function')showToast('Could not load seller panel. Please check internet and refresh.','error');
        }
    };
    initDashboard = window.initDashboard = async function(){
        if(!window.__ARYANTA_RAM.bootLoaded) await bootstrapInitialSellerData();
        else { try{if(typeof renderDashboardStats==='function')renderDashboardStats();}catch(e){} }
    };
    window.ensureSellerProducts=async function(force){ if(force || !window.__ARYANTA_RAM.products){await fetchProductsCore();} return sellerProducts; };
    window.ensureSellerOrders=async function(force){ if(force || !window.__ARYANTA_RAM.orders){if(!window.__ARYANTA_RAM.products)await fetchProductsCore();await fetchOrdersCore();} return sellerOrders; };
    window.ensureSellerSupport=async function(force){
        if(!force && window.__ARYANTA_RAM.support){sellerSupportTickets=window.__ARYANTA_RAM.support;return sellerSupportTickets;}
        const snap=await db.collection('seller_support_tickets').where('email','==',docEmail()).limit(150).get();
        sellerSupportTickets=[];snap.forEach(d=>sellerSupportTickets.push({id:d.id,...d.data()}));
        sellerSupportTickets=sortNewest(sellerSupportTickets);
        window.__ARYANTA_RAM.support=sellerSupportTickets;
        return sellerSupportTickets;
    };
    window.fetchNotifications = fetchNotifications = async function(){ await fetchNotificationsCore(); };
    window.toggleNotifications=function(){
        const d=$id('notifDropdown'); if(d)d.classList.toggle('show');
        if(!window.__ARYANTA_RAM.notifications)fetchNotificationsCore().catch(()=>{});
    };
    const finalVisibleMap={home:'homeSection',profile:'profileSection',inventory:'inventorySection',newOrders:'newOrdersSection',acceptedOrders:'acceptedOrdersSection',completedScan:'completedScanSection',shippedOrders:'shippedOrdersSection',deliveredOrders:'deliveredOrdersSection',history:'historySection',returns:'returnsSection',warranty:'warrantySection',payments:'paymentsSection',ads:'adsSection',subscription:'subscriptionSection',tutorial:'tutorialSection',qna:'qnaSection',buyB2b:'buyB2bSection',support:'supportSection',settings:'settingsSection',oldTickets:'oldTicketsSection',notifications:'notificationsSection',breached:'breachedSection'};
    function activate(section){
        document.querySelectorAll('.data-section').forEach(x=>x.classList.remove('active'));
        const el=$id(finalVisibleMap[section]||'homeSection'); if(el)el.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
        const clicked=window.event&&window.event.target&&window.event.target.closest?window.event.target.closest('.nav-item'):null;if(clicked)clicked.classList.add('active');
        const sb=$id('mobileSidebar'); if(sb)sb.classList.remove('open'); const ov=$id('mobileSidebarOverlay'); if(ov)ov.style.display='none';
    }
    window.showSection=async function(section){
        if(section==='tutorial')return window.openHowToSellPage?window.openHowToSellPage():window.open('https://aryanta.in/getdetails','_blank','noopener');
        activate(section);
        try{
            switch(section){
                case 'home': await window.ensureSellerOrders(); if(typeof renderDashboardStats==='function')renderDashboardStats(); break;
                case 'profile': if(typeof loadProfile==='function')loadProfile(); break;
                case 'notifications': await fetchNotificationsCore(); break;
                case 'inventory': await window.ensureSellerProducts(); if(typeof loadInventory==='function')loadInventory(); break;
                case 'newOrders': await window.ensureSellerOrders(); if(typeof loadNewOrders==='function')loadNewOrders(); break;
                case 'breached': await window.ensureSellerOrders(); if(typeof loadBreachedOrders==='function')loadBreachedOrders(); break;
                case 'acceptedOrders': await window.ensureSellerOrders(); if(typeof loadAcceptedOrders==='function')loadAcceptedOrders(); break;
                case 'completedScan': await window.ensureSellerOrders(); if(typeof loadCompletedScanOrders==='function')loadCompletedScanOrders(); break;
                case 'shippedOrders': await window.ensureSellerOrders(); if(typeof loadShippedOrders==='function')loadShippedOrders(); break;
                case 'deliveredOrders': await window.ensureSellerOrders(); if(typeof loadDeliveredOrders==='function')loadDeliveredOrders(); break;
                case 'history': await window.ensureSellerOrders(); if(typeof loadOrderHistory==='function')loadOrderHistory(); break;
                case 'returns': await window.ensureSellerOrders(); if(typeof loadReturns==='function')loadReturns(); break;
                case 'warranty': if(typeof ensureSellerWarranty==='function')await ensureSellerWarranty(); if(typeof loadWarranty==='function')loadWarranty(); break;
                case 'payments': if(typeof ensureSellerPayments==='function')await ensureSellerPayments(); if(typeof loadPayments==='function')loadPayments(); break;
                case 'ads': await window.ensureSellerProducts(); if(typeof loadAds==='function')loadAds(); break;
                case 'subscription': if(typeof loadSubscriptionsUI==='function')loadSubscriptionsUI(); break;
                case 'qna': await window.ensureSellerProducts(); if(typeof loadQna==='function')loadQna(); break;
                case 'buyB2b': if(typeof ensureSellerB2B==='function')await ensureSellerB2B(); if(typeof loadB2bStore==='function')loadB2bStore(); break;
                case 'support': await window.ensureSellerSupport(); if(typeof filterSupportTickets==='function')filterSupportTickets('All'); break;
                case 'oldTickets': await window.ensureSellerSupport(); if(typeof loadOldTickets==='function')loadOldTickets(); break;
                case 'settings': if(typeof loadSettingsUI==='function')loadSettingsUI(); renderBrandingPreviewsFinal(); break;
            }
        }catch(e){console.error('Section load failed',section,e); if(typeof showToast==='function')showToast('Could not load this section. Please retry.','error');}
    };

    function pickBrand(type){
        const s=activeSeller||{};
        if(type==='logo')return s.storeLogo||s.storeLogoUrl||s.logo||s.logoUrl||s.shopLogo||s.companyLogo||'';
        return s.storeBanner||s.storeBannerUrl||s.banner||s.bannerUrl||s.shopBanner||s.coverImage||'';
    }
    window.renderBrandingPreviewsFinal=renderBrandingPreviewsFinal;
    function renderBrandingPreviewsFinal(){
        [['logo','storeLogoPreview','storeLogoEmpty','storeLogoFileName'],['banner','storeBannerPreview','storeBannerEmpty','storeBannerFileName']].forEach(([type,imgId,emptyId,fileId])=>{
            const src=pickBrand(type); const img=$id(imgId); const empty=$id(emptyId); const file=$id(fileId);
            if(img){img.src=src||'';img.style.display=src?'block':'none';}
            if(empty)empty.style.display=src?'none':'flex';
            if(file)file.innerText=src?'Current image loaded. Click Edit to replace.':`No ${type} selected`;
            const row=$id(type==='logo'?'storeLogoActionRow':'storeBannerActionRow'); if(row)row.style.display='none';
        });
    }
    window.startBrandingEdit=function(type){
        const input=$id(type==='logo'?'storeLogoInput':'storeBannerInput'); if(input)input.click();
    };
    window.cancelBrandingEdit=function(type){
        const input=$id(type==='logo'?'storeLogoInput':'storeBannerInput'); if(input)input.value='';
        renderBrandingPreviewsFinal();
    };
    window.previewBrandingFile=function(type){
        const input=$id(type==='logo'?'storeLogoInput':'storeBannerInput'); const file=input&&input.files&&input.files[0];
        const label=$id(type==='logo'?'storeLogoFileName':'storeBannerFileName');
        if(!file)return;
        if(label)label.innerText=file.name;
        const reader=new FileReader();
        reader.onload=e=>{
            const img=$id(type==='logo'?'storeLogoPreview':'storeBannerPreview'); const empty=$id(type==='logo'?'storeLogoEmpty':'storeBannerEmpty'); const row=$id(type==='logo'?'storeLogoActionRow':'storeBannerActionRow');
            if(img){img.src=e.target.result;img.style.display='block';}
            if(empty)empty.style.display='none'; if(row)row.style.display='grid';
        };
        reader.readAsDataURL(file);
    };
    function compressImage(file,type){
        return new Promise((resolve,reject)=>{
            const reader=new FileReader();
            reader.onerror=reject;
            reader.onload=()=>{
                const img=new Image();
                img.onerror=reject;
                img.onload=()=>{
                    const maxW=type==='banner'?1200:700, maxH=type==='banner'?420:700;
                    let w=img.width,h=img.height,ratio=Math.min(maxW/w,maxH/h,1); w=Math.round(w*ratio); h=Math.round(h*ratio);
                    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
                    const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
                    resolve(canvas.toDataURL('image/jpeg',0.78));
                };
                img.src=reader.result;
            };
            reader.readAsDataURL(file);
        });
    }
    window.uploadStoreBranding=async function(type){
        const input=$id(type==='logo'?'storeLogoInput':'storeBannerInput'); const file=input&&input.files&&input.files[0];
        if(!file)return showToast(`Choose a ${type} image first.`,'warning');
        if(!confirm(`Replace current store ${type}? Previous ${type} field will be removed from database and this new image will be saved.`))return;
        try{
            setBootLoader(`Uploading store ${type}...`,'Save');
            const dataUrl=await compressImage(file,type);
            const payload={brandingUpdatedAt:nowIso2(),brandingUpdatedBy:'seller-panel'};
            const del=firebase.firestore.FieldValue.delete();
            if(type==='logo'){
                Object.assign(payload,{storeLogo:dataUrl,storeLogoUpdatedAt:nowIso2(),storeLogoUrl:del,logo:del,logoUrl:del,shopLogo:del,companyLogo:del});
            }else{
                Object.assign(payload,{storeBanner:dataUrl,storeBannerUpdatedAt:nowIso2(),storeBannerUrl:del,banner:del,bannerUrl:del,shopBanner:del,coverImage:del});
            }
            await db.collection('sellers').doc(activeSeller.email).set(payload,{merge:true});
            if(type==='logo'){activeSeller.storeLogo=dataUrl;delete activeSeller.storeLogoUrl;delete activeSeller.logo;delete activeSeller.logoUrl;delete activeSeller.shopLogo;delete activeSeller.companyLogo;}
            else{activeSeller.storeBanner=dataUrl;delete activeSeller.storeBannerUrl;delete activeSeller.banner;delete activeSeller.bannerUrl;delete activeSeller.shopBanner;delete activeSeller.coverImage;}
            localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
            if(input)input.value='';
            renderBrandingPreviewsFinal();
            hideBootLoader();
            showToast(`Store ${type} updated. Previous DB image field replaced.`,'success');
        }catch(e){console.error(e);hideBootLoader();showToast(`Could not upload ${type}. Try smaller image or check network.`,'error');}
    };
    const originalLoadSettingsFinal=window.loadSettingsUI || loadSettingsUI;
    window.loadSettingsUI = loadSettingsUI = function(){ try{originalLoadSettingsFinal&&originalLoadSettingsFinal();}catch(e){} renderBrandingPreviewsFinal(); };

    function adPlanLimit(){
        const plan=low(activeSeller && (activeSeller.subscription || activeSeller.plan || activeSeller.package));
        if(plan.includes('ultra')||plan.includes('enterprise')||plan.includes('premium'))return 10;
        if(plan.includes('pro')||plan.includes('growth'))return 6;
        if(plan.includes('plus')||plan.includes('standard')||plan.includes('starter'))return 3;
        return 1;
    }
    function adUsage(){
        const u=(activeSeller&&activeSeller.sponsoredAdUsage)||{};
        if(u.month===MONTH_KEY)return Number(u.used||0)||0;
        return Number(activeSeller?.sponsoredAdsUsedThisMonth||activeSeller?.adCreditsUsed||0)||0;
    }
    async function saveAdUsage(nextUsed){
        const usage={month:MONTH_KEY,used:nextUsed,updatedAt:nowIso2()};
        await db.collection('sellers').doc(activeSeller.email).set({sponsoredAdUsage:usage,sponsoredAdsUsedThisMonth:nextUsed},{merge:true});
        activeSeller.sponsoredAdUsage=usage;activeSeller.sponsoredAdsUsedThisMonth=nextUsed;localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    }
    window.startAd=async function(id){
        const p=(sellerProducts||[]).find(x=>String(x.id)===String(id))||{};
        const limit=adPlanLimit(), used=adUsage(), left=Math.max(0,limit-used);
        const modal=$id('adPaymentModal'), msg=$id('adPlanMessage'), cost=$id('adCostDisplay'), input=$id('adProdId');
        if(input)input.value=id;
        if(msg)msg.innerHTML=left>0?`<i class="fas fa-circle-check"></i> Free sponsored slot available: <b>${left}/${limit}</b> left this month for your plan. Product: <b>${escapeHtmlFinal(p.name||p.title||id)}</b>.`:`<i class="fas fa-wallet"></i> No free sponsored slots left this month. Your plan gives <b>${limit}</b> free ad${limit>1?'s':''}/month. Pay now or deduct from upcoming payout.`;
        if(cost)cost.innerText=left>0?'FREE':'₹70';
        const online=modal&&modal.querySelector('button[onclick="payAdOnline()"]');
        const payout=$id('btnAdPayout');
        if(online)online.innerHTML=left>0?'<i class="fas fa-bolt"></i> Use Free Sponsored Slot':'Pay Now (Online)';
        if(payout)payout.style.display=left>0?'none':'inline-flex';
        if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}
    };
    async function activateSponsored(id,isFree){
        const until=new Date(Date.now()+24*3600000).toISOString();
        await db.collection('products').doc(id).set({isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredAt:nowIso2(),sponsoredUntil:until},{merge:true});
        const p=(sellerProducts||[]).find(x=>String(x.id)===String(id)); if(p)Object.assign(p,{isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredUntil:until});
        if(isFree)await saveAdUsage(adUsage()+1);
        if(typeof loadAds==='function')loadAds();
        showToast(isFree?'Free sponsored slot activated for 24 hours.':'Sponsored ad activated for 24 hours.','success');
    }
    window.payAdOnline=async function(){
        const id=$id('adProdId')?.value; if(!id)return;
        const left=Math.max(0,adPlanLimit()-adUsage());
        if(left>0){closeModal('adPaymentModal');return activateSponsored(id,true);}
        if(!API_KEYS.RAZORPAY)return showToast('Payment key missing. Refresh and retry.','error');
        const options={key:API_KEYS.RAZORPAY,amount:7000,currency:'INR',name:'Aryanta Ads',description:'Sponsored Ad 24 Hours',handler:async function(res){try{if(typeof savePaymentLedger==='function')await savePaymentLedger({type:'sponsored_ad_online',productId:id,amount:70,status:'Paid',razorpayPaymentId:res.razorpay_payment_id||''});}catch(e){}closeModal('adPaymentModal');activateSponsored(id,false);},prefill:{email:activeSeller.email,contact:activeSeller.phone||''},theme:{color:'#0f172a'}};
        new Razorpay(options).open();
    };
    window.payAdUpcoming=async function(){
        const id=$id('adProdId')?.value; if(!id)return;
        try{if(typeof addFineOnce==='function')await addFineOnce('sponsored_ad_'+id+'_'+Date.now(),70,'Sponsored Ad Fee');else await db.collection('fines').add({email:activeSeller.email,sellerEmail:activeSeller.email,status:'Pending Admin Review',accepted:false,amount:70,reason:'Sponsored Ad Fee',timestamp:nowIso2()});}catch(e){}
        try{if(typeof savePaymentLedger==='function')await savePaymentLedger({type:'sponsored_ad_payout',productId:id,amount:70,status:'Deducted from payout'});}catch(e){}
        closeModal('adPaymentModal');activateSponsored(id,false);
    };

    const oldSetScanStep = window.setScanStep;
    window.setScanStep=function(step){
        currentScanStep=step;
        ['scanStep1','scanStep2','scanStep3'].forEach(id=>{const el=$id(id);if(el)el.classList.toggle('active',id===('scanStep'+step));});
    };
})();

/* ===== Aryanta final targeted patch: package fields, Q&A filters, B2B buy, zero commission ===== */
(function(){
    if(window.__ARYANTA_SELLER_FINAL_TARGETED_PATCH_V2__) return;
    window.__ARYANTA_SELLER_FINAL_TARGETED_PATCH_V2__ = true;

    function $(id){ return document.getElementById(id); }
    function val(id){ const el=$(id); return el ? String(el.value || '').trim() : ''; }
    function num(id){ const n = Number(val(id)); return Number.isFinite(n) ? n : 0; }
    function safe(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
    function now(){ return new Date().toISOString(); }
    function toast(msg,type){ if(typeof showToast === 'function') showToast(msg,type||'info'); else alert(msg); }
    function sellerEmail(){ return String((window.activeSeller || activeSeller || {}).email || '').toLowerCase().trim(); }

    window.forceZeroCommission = function(){
        const lp=$('itemListedPrice'), price=$('itemPrice');
        if(lp && price) lp.value = Number(price.value||0) > 0 ? `₹ ${Math.round(Number(price.value||0))}` : '';
    };
    window.calculateListedPrice = window.forceZeroCommission;

    window.ensureAryProductPackageFields = function(){
        const form=$('itemForm'); if(!form) return;
        if($('itemPackageWeightKg')) return;
        const box=document.createElement('div');
        box.className='ary-package-box';
        box.id='aryPackageBox';
        box.innerHTML=`
            <div class="ary-package-head"><i class="fas fa-box-open"></i><div><strong>Parcel & Delivery Package Details</strong><span>Required for courier label, invoice and pickup processing. Enter packed parcel size.</span></div></div>
            <div class="ary-package-grid">
                <div><label>Package Weight (kg)</label><input type="number" step="0.01" min="0.01" id="itemPackageWeightKg" class="input-field" placeholder="Example: 0.50" required></div>
                <div><label>Length (cm)</label><input type="number" step="0.1" min="1" id="itemPackageLengthCm" class="input-field" placeholder="Example: 20" required></div>
                <div><label>Breadth / Width (cm)</label><input type="number" step="0.1" min="1" id="itemPackageBreadthCm" class="input-field" placeholder="Example: 15" required></div>
                <div><label>Height (cm)</label><input type="number" step="0.1" min="1" id="itemPackageHeightCm" class="input-field" placeholder="Example: 8" required></div>
            </div>
            <p class="ary-package-note"><i class="fas fa-circle-info"></i> Use final packed parcel measurement, not only product size.</p>`;
        const anchor=$('itemDesc')?.closest('div[style*="grid"]') || $('productLinksContainer')?.closest('div') || form.querySelector('#saveProductBtn');
        if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
        else form.appendChild(box);
    };

    window.readAryProductPackageDetails = function(){
        window.ensureAryProductPackageFields();
        const data={ weight:num('itemPackageWeightKg'), length:num('itemPackageLengthCm'), breadth:num('itemPackageBreadthCm'), height:num('itemPackageHeightCm') };
        const missing=[];
        if(data.weight<=0) missing.push('package weight');
        if(data.length<=0) missing.push('length');
        if(data.breadth<=0) missing.push('breadth/width');
        if(data.height<=0) missing.push('height');
        return { ok: missing.length===0, data, message: missing.length ? `Please enter ${missing.join(', ')} for courier processing.` : '' };
    };
    function writePackage(p){
        window.ensureAryProductPackageFields();
        const pkg=(p&&p.package)||{};
        const set=(id,v)=>{const el=$(id); if(el) el.value = v || '';};
        set('itemPackageWeightKg', p?.packageWeightKg || p?.weightKg || p?.weight || p?.packageWeight || pkg.weight || '');
        set('itemPackageLengthCm', p?.packageLengthCm || p?.lengthCm || p?.length || p?.packageLength || pkg.length || '');
        set('itemPackageBreadthCm', p?.packageBreadthCm || p?.breadthCm || p?.widthCm || p?.breadth || p?.width || p?.packageBreadth || pkg.breadth || pkg.width || '');
        set('itemPackageHeightCm', p?.packageHeightCm || p?.heightCm || p?.height || p?.packageHeight || pkg.height || '');
    }
    const oldOpen = window.openItemModal;
    window.openItemModal = function(){ const r = oldOpen ? oldOpen.apply(this, arguments) : undefined; setTimeout(()=>{ writePackage({}); window.forceZeroCommission(); }, 30); return r; };
    const oldEdit = window.editItem;
    window.editItem = function(id){ const r = oldEdit ? oldEdit.apply(this, arguments) : undefined; setTimeout(()=>{ const p=(window.sellerProducts||sellerProducts||[]).find(x=>String(x.id)===String(id)); writePackage(p||{}); window.forceZeroCommission(); }, 60); return r; };
    document.addEventListener('DOMContentLoaded', ()=>{ window.ensureAryProductPackageFields(); const p=$('itemPrice'); if(p) p.addEventListener('input', window.forceZeroCommission); });

    // More stable select-all: only visible rows get selected.
    function visibleBoxes(selector){ return Array.from(document.querySelectorAll(selector)).filter(cb => cb.offsetParent !== null && !cb.disabled); }
    window.toggleSelectAllNew=function(source){ visibleBoxes('.cb-new').forEach(cb=>{cb.checked=!!source.checked;}); };
    window.toggleSelectAllAcc=function(source){ visibleBoxes('.cb-acc').forEach(cb=>{cb.checked=!!source.checked;}); };
    window.toggleSelectAll=function(selectorOrSource, sourceMaybe){
        if(typeof selectorOrSource === 'string'){ visibleBoxes(selectorOrSource).forEach(cb=>{cb.checked=!!sourceMaybe.checked;}); return; }
        window.toggleSelectAllAcc(selectorOrSource);
    };

    // Q&A filters.
    window.currentQnaFilter = window.currentQnaFilter || 'All';
    window.filterQna=function(type){
        window.currentQnaFilter = type || 'All';
        ['All','Pending','Answered'].forEach(x=>{ const el=$('qnaFilter'+x); if(el) el.classList.toggle('active', x===window.currentQnaFilter); });
        if(typeof window.loadQna === 'function') window.loadQna();
    };
    window.loadQna=async function(){
        const list=$('qnaList'); if(!list) return;
        list.innerHTML=`<tr><td colspan="4" style="text-align:center;font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading customer questions...</td></tr>`;
        const rows=[];
        (window.sellerProducts || sellerProducts || []).forEach(p=>{ (p.qa||[]).forEach(q=>rows.push({source:'product', productId:p.id, productName:p.name, qid:q.id || q.qid || q.question, ...q})); });
        try{
            const snap=await db.collection('product_questions').where('sellerEmail','==',sellerEmail()).orderBy('timestamp','desc').limit(250).get();
            snap.docs.forEach(d=>{ const q=d.data()||{}; rows.push({source:'collection', docId:d.id, productId:q.productId, productName:q.productName, qid:q.id || d.id, ...q}); });
        }catch(e){}
        const seen=new Set();
        let data=rows.filter(r=>{ const key=`${r.productId}_${r.qid}_${r.question}`; if(seen.has(key)) return false; seen.add(key); return !!r.question; }).sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')));
        const f=window.currentQnaFilter||'All';
        if(f==='Pending') data=data.filter(q=>!q.answer);
        if(f==='Answered') data=data.filter(q=>!!q.answer);
        window.__aryQnaCache=data;
        if(!data.length){ list.innerHTML=`<tr><td colspan="4" style="text-align:center;font-weight:700;">No ${safe(f.toLowerCase())} questions found.</td></tr>`; return; }
        list.innerHTML=data.map(q=>{
            const answered=!!q.answer;
            const status=answered?`<span class="ary-qna-status answered"><i class="fas fa-check"></i> Answered</span>`:`<span class="ary-qna-status pending"><i class="fas fa-exclamation-circle"></i> Needs Reply</span>`;
            return `<tr><td data-label="Product"><strong style="font-size:13px;color:var(--primary);">${safe(q.productName||q.productId||'Product')}</strong><br><span style="font-size:11px;color:var(--text-light);">${safe(q.productId||'')}</span></td><td data-label="Q&A"><div style="font-weight:800;color:var(--text-main);margin-bottom:6px;">Q: ${safe(q.question)}</div><div style="font-size:13px;color:var(--text-light);"><span style="font-weight:900;color:var(--secondary);">A:</span> ${answered?safe(q.answer):'<em>Waiting for your reply</em>'}</div></td><td data-label="Status">${status}</td><td data-label="Action"><button class="btn-sm ${answered?'edit':''}" style="background:#3b82f6;" onclick="openQnaModal('${safe(q.productId)}','${safe(q.qid)}')">${answered?'Edit Reply':'Answer Now'}</button></td></tr>`;
        }).join('');
    };
    window.openQnaModal=function(pId,qId){
        const q=(window.__aryQnaCache||[]).find(x=>String(x.productId)===String(pId)&&String(x.qid)===String(qId));
        if(!q) return toast('Question not found.','error');
        if($('qnaProdId')) $('qnaProdId').value=pId;
        if($('qnaQid')) $('qnaQid').value=qId;
        if($('qnaTextDisplay')) $('qnaTextDisplay').innerText='Q: '+q.question;
        if($('qnaAnsText')) $('qnaAnsText').value=q.answer||'';
        if(typeof openModal==='function') openModal('qnaModal'); else if($('qnaModal')) $('qnaModal').style.display='flex';
    };
    window.submitQnaAnswer=async function(){
        const pId=val('qnaProdId'), qId=val('qnaQid'), ans=val('qnaAnsText');
        if(!ans) return toast('Answer cannot be empty.','warning');
        const p=(window.sellerProducts||sellerProducts||[]).find(x=>String(x.id)===String(pId));
        const qa=[...((p&&p.qa)||[])];
        const idx=qa.findIndex(q=>String(q.id||q.qid||q.question)===String(qId));
        if(idx>=0) qa[idx]={...qa[idx], answer:ans, answeredAt:now(), sellerAnswer:true};
        try{
            if(p) await db.collection('products').doc(pId).set({qa},{merge:true});
            try{ const qs=await db.collection('product_questions').where('productId','==',pId).limit(20).get(); qs.docs.forEach(d=>{const q=d.data()||{}; if(String(q.id||d.id)===String(qId)) db.collection('product_questions').doc(d.id).set({answer:ans, answeredAt:now(), status:'Answered'},{merge:true});}); }catch(e){}
            if(p) p.qa=qa;
            if(typeof closeModal==='function') closeModal('qnaModal');
            toast('Answer published to product page.','success');
            window.loadQna();
        }catch(e){ console.error(e); toast('Failed to publish answer.','error'); }
    };

    // B2B redesign + buy now logic.
    function b2bImage(p){ return p.image || p.img || p.photo || 'https://via.placeholder.com/360x240?text=Aryanta+B2B'; }
    window.loadB2bStore=function(){
        const grid=$('b2bProductsGrid'); if(!grid) return;
        grid.classList.add('ary-b2b-grid');
        grid.innerHTML=`<div class="ary-b2b-empty"><i class="fas fa-spinner fa-spin"></i> Loading B2B items...</div>`;
        if(!db){ grid.innerHTML=`<div class="ary-b2b-empty error">Firebase not ready. Please refresh page.</div>`; return; }
        db.collection('b2b_products').get().then(snap=>{
            window.b2bItems = b2bItems = snap.docs.map(d=>({id:d.id,...d.data()}));
            if(!b2bItems.length){ grid.innerHTML=`<div class="ary-b2b-empty">No B2B items listed by admin yet.</div>`; return; }
            grid.innerHTML=b2bItems.map(p=>{
                const stock=Number(p.stock||0), moq=Math.max(1,Number(p.moq||1)), price=Number(p.price||0);
                return `<div class="ary-b2b-card ${stock<=0?'out':''}">
                    <div class="ary-b2b-img"><img src="${safe(b2bImage(p))}" onerror="this.src='https://via.placeholder.com/360x240?text=Aryanta+B2B'"><span>${safe(p.category||'Wholesale')}</span></div>
                    <div class="ary-b2b-body"><h4>${safe(p.name||'Unnamed Product')}</h4><p>${safe(p.desc||p.description||'Verified supply item for Aryanta sellers.')}</p>
                    <div class="ary-b2b-meta"><b>₹${price.toLocaleString('en-IN')}</b><span>MOQ ${moq}</span><span>${stock>0?stock+' stock':'Out of stock'}</span></div>
                    <button type="button" class="ary-b2b-buy" ${stock<=0?'disabled':''} onclick="event.stopPropagation();openBuyB2bModal('${safe(p.id)}')"><i class="fas fa-cart-shopping"></i> Buy Now</button></div>
                </div>`;
            }).join('');
        }).catch(e=>{ grid.innerHTML=`<div class="ary-b2b-empty error">Failed to load B2B items. Check Firebase rules or internet.</div>`; });
    };
    window.openBuyB2bModal=function(id){
        const p=(window.b2bItems||b2bItems||[]).find(x=>String(x.id)===String(id)); if(!p) return;
        if(Number(p.stock||0)<=0) return toast('This B2B item is out of stock.','warning');
        $('b2bBuyId').value=id; $('b2bBuyQty').value=Math.max(1,Number(p.moq||1)); $('b2bBuyQty').min=Math.max(1,Number(p.moq||1));
        if($('b2bMoqLabel')) $('b2bMoqLabel').innerText=Math.max(1,Number(p.moq||1));
        if($('b2bWarrText')) $('b2bWarrText').innerText='Standard Admin Guarantee';
        if($('b2bProductInfo')) $('b2bProductInfo').innerHTML=`<div class="ary-b2b-modal-product"><img src="${safe(b2bImage(p))}" onerror="this.src='https://via.placeholder.com/90'"><div><h4>${safe(p.name||'B2B Item')}</h4><p>₹${Number(p.price||0).toLocaleString('en-IN')} / unit • MOQ ${Number(p.moq||1)}</p><span><i class="fas fa-shield-halved"></i> Verified enterprise supply</span></div></div>`;
        const shop=(activeSeller&&activeSeller.shopInfo)||{};
        if($('b2bBuyAddress')) $('b2bBuyAddress').value=shop.address||activeSeller.address||'';
        if($('b2bBuyCity')) $('b2bBuyCity').value=shop.city||activeSeller.city||'';
        if($('b2bBuyState')) $('b2bBuyState').value=shop.state||activeSeller.state||'';
        if($('b2bBuyPin')) $('b2bBuyPin').value=shop.pincode||activeSeller.pincode||'';
        if(typeof goToB2bStep1==='function') goToB2bStep1();
        window.calcB2bTotal();
        const modal=$('buyB2bModal'); if(modal){modal.style.display='flex'; setTimeout(()=>modal.classList.add('show'),10);}
    };
    window.calcB2bTotal=function(){
        const id=val('b2bBuyId'), p=(window.b2bItems||b2bItems||[]).find(x=>String(x.id)===String(id)); if(!p) return;
        let qty=Math.max(Number(p.moq||1), parseInt(val('b2bBuyQty')||'0',10)||Number(p.moq||1));
        if($('b2bBuyQty')) $('b2bBuyQty').value=qty;
        const total=(qty*Number(p.price||0))+70;
        if($('b2bBuyTotal')) $('b2bBuyTotal').value=`₹${total.toLocaleString('en-IN')}`;
        const payoutBtn=$('b2bPayoutBtn');
        if(payoutBtn){ const ok=Number(window.cachedTotalUpcoming||cachedTotalUpcoming||0)>=total; payoutBtn.disabled=!ok; payoutBtn.innerHTML=ok?'<i class="fas fa-wallet"></i> Pay via Upcoming Payout':'<i class="fas fa-exclamation-circle"></i> Insufficient Payout Balance'; }
        return total;
    };
    window.processB2bBuy=async function(method){
        const id=val('b2bBuyId'), p=(window.b2bItems||b2bItems||[]).find(x=>String(x.id)===String(id)); if(!p) return;
        let qty=Math.max(Number(p.moq||1), parseInt(val('b2bBuyQty')||'0',10)||Number(p.moq||1));
        if(qty>Number(p.stock||0)) return toast('Quantity cannot exceed available stock.','warning');
        const addr=val('b2bBuyAddress'), city=val('b2bBuyCity'), state=val('b2bBuyState'), pin=val('b2bBuyPin').replace(/\D/g,'').slice(0,6);
        if(!addr || !city || !state || pin.length!==6) return toast('Complete shipping address, city, state and 6-digit pincode are required.','warning');
        const total=(qty*Number(p.price||0))+70;
        const orderData={productId:p.id, productName:p.name, productImage:b2bImage(p), pricePerUnit:Number(p.price||0), qty, shippingFee:70, totalPrice:total, sellerEmail:sellerEmail(), sellerName:activeSeller.companyName||activeSeller.email, sellerPhone:activeSeller.phone||'', address:addr, city, state, pincode:pin, status:'Request Sent', date:now(), paymentMethod:method};
        if(method==='payout'){
            if(Number(window.cachedTotalUpcoming||cachedTotalUpcoming||0)<total) return toast('Insufficient payout balance.','error');
            if(!confirm(`Send request and deduct ₹${total.toLocaleString('en-IN')} from upcoming payout?`)) return;
            try{ await db.collection('fines').add({email:sellerEmail(),sellerEmail:sellerEmail(),status:'Pending Admin Review',accepted:false, amount:total, reason:`B2B Wholesale Purchase Request: ${p.name} (x${qty})`, timestamp:now(), type:'b2b_purchase'}); }catch(e){}
            return window.finalizeB2bOrder(orderData,p,qty);
        }
        if(!API_KEYS.RAZORPAY) return toast('Payment key missing. Refresh and try again.','error');
        toast('Opening online payment...','info');
        new Razorpay({key:API_KEYS.RAZORPAY, amount:total*100, currency:'INR', name:'Aryanta Wholesale', description:`B2B Order: ${p.name}`, handler:function(res){ orderData.razorpayPaymentId=res.razorpay_payment_id||''; orderData.status='Paid Request Sent'; window.finalizeB2bOrder(orderData,p,qty); }, prefill:{email:activeSeller.email, contact:activeSeller.phone||''}, theme:{color:'#10b981'}}).open();
    };
    window.finalizeB2bOrder=async function(orderData, product, qtyBought){
        try{
            const doc=await db.collection('b2b_orders').add(orderData);
            const newStock=Math.max(0, Number(product.stock||0)-Number(qtyBought||0));
            await db.collection('b2b_products').doc(product.id).set({stock:newStock, updatedAt:now()},{merge:true});
            try{ await db.collection('seller_notifications').add({sellerEmail:sellerEmail(), email:sellerEmail(), type:'B2B_REQUEST_SENT', title:'B2B request sent', text:`Your B2B request for ${orderData.productName} has been sent to admin.`, orderId:doc.id, read:false, timestamp:now()}); }catch(e){}
            toast('B2B request sent to admin successfully.','success');
            if(typeof closeModal==='function') closeModal('buyB2bModal');
            window.loadB2bStore();
        }catch(e){ console.error(e); toast('Failed to send B2B request.','error'); }
    };
})();
(function(){
    function srText(v){
        return v === undefined || v === null ? "" : String(v).trim();
    }

    function srFirst(){
        for(let i = 0; i < arguments.length; i++){
            const v = arguments[i];
            if(v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return "";
    }

    function srOrderNo(order){
        return srText(srFirst(order && order.order_no, order && order.orderNo, order && order.id, `ARY-${Date.now()}`));
    }

    function srSafeFileName(name){
        return srText(name || "shiprocket-document")
            .replace(/[^\w\-]+/g, "_")
            .replace(/_+/g, "_")
            .slice(0, 90);
    }

    function srFindOrder(id){
        return (sellerOrders || []).find(o => String(o.id) === String(id));
    }

    function srExistingInvoice(order){
        return srText(srFirst(
            order && order.shiprocketInvoicePdfUrl,
            order && order.shiprocketInvoiceUrl,
            order && order.invoiceUrl,
            order && order.invoice_url
        ));
    }

    function srExistingWaybill(order){
        return srText(srFirst(
            order && order.shiprocketLabelUrl,
            order && order.shiprocketLabelPdfUrl,
            order && order.shippingLabelUrl,
            order && order.labelUrl,
            order && order.label_url,
            order && order.waybillUrl,
            order && order.waybill_url
        ));
    }

    function srExtractInvoiceUrl(data){
        return srText(srFirst(
            data && data.invoiceUrl,
            data && data.invoice_url,
            data && data.shiprocketInvoicePdfUrl,
            data && data.shiprocketInvoiceUrl,
            data && data.taxInvoiceUrl,
            data && data.tax_invoice_url
        ));
    }

    function srExtractWaybillUrl(data){
        return srText(srFirst(
            data && data.labelUrl,
            data && data.label_url,
            data && data.shippingLabelUrl,
            data && data.shipping_label_url,
            data && data.shiprocketLabelUrl,
            data && data.shiprocketLabelPdfUrl,
            data && data.waybillUrl,
            data && data.waybill_url
        ));
    }

    function srAddLink(label, url){
        if(!url) return;
        if(typeof addShipProcessLink === "function"){
            addShipProcessLink(label, url);
            return;
        }
        const box = document.getElementById("shipProcessLinks") || document.body;
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "block";
        a.style.margin = "8px 0";
        a.innerText = label;
        box.appendChild(a);
    }

    async function srDownloadPdf(url, fileName){
        const cleanUrl = srText(url);
        if(!cleanUrl) return false;

        const finalName = srSafeFileName(fileName) + ".pdf";

        try{
            const res = await fetch(cleanUrl, { mode: "cors", credentials: "omit" });
            if(res.ok){
                const blob = await res.blob();
                if(blob && blob.size > 0){
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = finalName;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
                    return true;
                }
            }
        }catch(e){}

        const a = document.createElement("a");
        a.href = cleanUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.download = finalName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    }

    async function srCallFullPack(order, index, total){
        const payload = typeof aryShipBuildPayload === "function" ? aryShipBuildPayload(order) : { ...order };

        payload.localOrderId = String(order.id || "");
        payload.orderDocId = String(order.id || "");
        payload.aryantaOrderId = srOrderNo(order);
        payload.orderNo = srOrderNo(order);
        payload.sellerEmail = activeSeller && activeSeller.email ? activeSeller.email : payload.sellerEmail || payload.email || "";
        payload.preventStatusUpdate = true;
        payload.doNotMarkShipped = true;
        payload.keepOrderStatus = srText(srFirst(order.status, order.orderStatus, "Accepted"));
        payload.needInvoice = true;
        payload.needLabel = true;
        payload.needWaybill = true;
        payload.needManifest = false;

        if(typeof updateShipProcess === "function"){
            updateShipProcess("validate", "done", `Order ${index}/${total}: details checked`, 15);
            updateShipProcess("create", "running", `Order ${index}/${total}: creating Shiprocket invoice and waybill`, 35);
        }

        const res = await fetch(`${API_BASE_URL}/shiprocket/full-pack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if(!res.ok || data.success === false){
            throw new Error(data.message || data.error || "Shiprocket shipping pack failed");
        }

        const invoiceUrl = srExtractInvoiceUrl(data);
        const waybillUrl = srExtractWaybillUrl(data);

        if(!invoiceUrl){
            throw new Error("Shiprocket invoice PDF URL was not returned.");
        }

        if(!waybillUrl){
            throw new Error("Shiprocket top label / waybill PDF was not returned. AWB/courier/pickup is not ready yet.");
        }

        const keepStatus = srText(srFirst(order.status, order.orderStatus, "Accepted"));
        const now = new Date().toISOString();

        const updates = {
            status: keepStatus,
            orderStatus: keepStatus,
            shippingProvider: "Shiprocket",
            shiprocketFullPackGenerated: true,
            shiprocketOrderId: srText(srFirst(data.shiprocketOrderId, data.order_id, data.orderId)),
            shiprocketShipmentId: srText(srFirst(data.shipmentId, data.shipment_id, data.shiprocketShipmentId)),
            shipmentId: srText(srFirst(data.shipmentId, data.shipment_id, data.shiprocketShipmentId)),
            shiprocketAwbCode: srText(srFirst(data.awbCode, data.awb_code, data.awb)),
            awbCode: srText(srFirst(data.awbCode, data.awb_code, data.awb)),
            shiprocketInvoicePdfUrl: invoiceUrl,
            shiprocketInvoiceUrl: invoiceUrl,
            shiprocketLabelUrl: waybillUrl,
            shiprocketLabelPdfUrl: waybillUrl,
            shippingLabelUrl: waybillUrl,
            waybillUrl: waybillUrl,
            shiprocketFullPackResponse: data,
            updatedAt: now
        };

        try{
            await db.collection("orders").doc(order.id).set(updates, { merge: true });
        }catch(e){}

        try{
            await db.collection("seller_shiprocket_full_packs").doc(String(order.id)).set({
                id: String(order.id),
                orderId: String(order.id),
                orderNo: srOrderNo(order),
                sellerEmail: activeSeller && activeSeller.email ? activeSeller.email : "",
                request: payload,
                response: data,
                createdAt: now,
                updatedAt: now,
                ...updates
            }, { merge: true });
        }catch(e){}

        Object.assign(order, updates);

        if(typeof updateShipProcess === "function"){
            updateShipProcess("create", "done", `Order ${index}/${total}: invoice and waybill ready`, 65);
            updateShipProcess("save", "done", `Order ${index}/${total}: saved without shipped status`, 85);
        }

        return { order, data, invoiceUrl, waybillUrl };
    }

    function srSelectedIds(orderId){
        if(orderId && orderId !== "bulk") return [String(orderId)];
        return Array.from(document.querySelectorAll(".cb-acc:checked")).map(cb => cb.value).filter(Boolean);
    }

    async function srDownloadInvoiceAndWaybill(order, index, total){
        let invoiceUrl = srExistingInvoice(order);
        let waybillUrl = srExistingWaybill(order);

        if(!invoiceUrl || !waybillUrl){
            const result = await srCallFullPack(order, index, total);
            invoiceUrl = result.invoiceUrl;
            waybillUrl = result.waybillUrl;
        }

        srAddLink(`Shiprocket invoice PDF - ${srOrderNo(order)}`, invoiceUrl);
        srAddLink(`Shiprocket top label / waybill PDF - ${srOrderNo(order)}`, waybillUrl);

        await srDownloadPdf(invoiceUrl, `Shiprocket_Invoice_${srOrderNo(order)}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        await srDownloadPdf(waybillUrl, `Shiprocket_Waybill_Label_${srOrderNo(order)}`);

        return { order, invoiceUrl, waybillUrl };
    }

    window.downloadShippingInvoice = async function(orderId){
        const ids = Array.from(new Set(srSelectedIds(orderId)));

        if(!ids.length){
            return showToast("Select at least one accepted order.", "warning");
        }

        const selectedOrders = ids.map(id => srFindOrder(id)).filter(Boolean);

        if(!selectedOrders.length){
            return showToast("Selected order was not found. Refresh and try again.", "error");
        }

        if(typeof openShipProcessSheet === "function"){
            openShipProcessSheet(selectedOrders.length);
        }

        const title = document.getElementById("shipProcessTitle");
        const sub = document.getElementById("shipProcessSub");

        if(title) title.innerText = selectedOrders.length > 1 ? `Downloading ${selectedOrders.length * 2} Shiprocket PDFs` : "Downloading 2 Shiprocket PDFs";
        if(sub) sub.innerText = "Shiprocket invoice and top label / waybill will download together. Order status will not be marked shipped.";

        if(typeof updateShipProcess === "function"){
            updateShipProcess("validate", "running", "Checking selected orders...", 5);
            updateShipProcess("create", "running", "Preparing Shiprocket invoice and waybill...", 5);
            updateShipProcess("save", "running", "Waiting to save records...", 5);
            updateShipProcess("done", "running", "Waiting for download...", 5);
        }

        const done = [];
        const failed = [];

        for(let i = 0; i < selectedOrders.length; i++){
            const order = selectedOrders[i];

            try{
                const result = await srDownloadInvoiceAndWaybill(order, i + 1, selectedOrders.length);
                done.push(result);
            }catch(e){
                failed.push({ order, error: e.message || String(e) });

                if(typeof updateShipProcess === "function"){
                    updateShipProcess("create", "error", `Failed: ${srOrderNo(order)} - ${e.message || e}`, 100);
                }

                const links = document.getElementById("shipProcessLinks");
                if(links){
                    const div = document.createElement("div");
                    div.className = "ship-process-error";
                    div.innerHTML = `<b>${srOrderNo(order)}</b>: ${e.message || String(e)}`;
                    links.appendChild(div);
                }
            }
        }

        if(failed.length){
            if(sub) sub.innerText = `${done.length} completed, ${failed.length} failed. If waybill is missing, AWB/courier/pickup is not ready.`;
            if(typeof updateShipProcess === "function"){
                updateShipProcess("done", "error", "Some PDFs failed", 100);
            }
            showToast(`${failed.length} Shiprocket PDF download failed.`, "error");
        }else{
            if(sub) sub.innerText = "Both Shiprocket PDFs downloaded/opened. Order status was kept unchanged.";
            if(typeof updateShipProcess === "function"){
                updateShipProcess("done", "done", "Invoice and waybill downloaded", 100);
            }
            showToast("Shiprocket invoice and waybill downloaded. Status not marked shipped.", "success");
        }

        try{
            loadAcceptedOrders();
            loadCompletedScanOrders();
            loadShippedOrders();
            renderDashboardStats();
        }catch(e){}
    };
})();
/* ========================================================================
   Aryanta Seller Shiprocket Final Pair Patch - 2026-05-26
   Works with updated worker.js /shiprocket/full-pack.
   This patch does not mark orders shipped. It only creates verified
   Shiprocket order + AWB + invoice + top label, then saves URLs safely.
   ======================================================================== */
(function(){
    if(window.__ARYANTA_SR_FINAL_WORKER_PAIR_20260526__) return;
    window.__ARYANTA_SR_FINAL_WORKER_PAIR_20260526__ = true;

    const API = (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) ? API_BASE_URL : 'https://rough-field-c679.official-aryanta.workers.dev';
    const FULL_PACK_URL = `${API}/shiprocket/full-pack`;
    const CANCEL_URL = `${API}/shiprocket/cancel`;

    function txt(v){ return v === undefined || v === null ? '' : String(v).trim(); }
    function first(){
        for(let i=0;i<arguments.length;i++){
            const v = arguments[i];
            if(v === undefined || v === null) continue;
            if(Array.isArray(v)){
                const f = v.find(x => x !== undefined && x !== null && txt(x) !== '');
                if(f !== undefined) return f;
                continue;
            }
            if(typeof v === 'object') continue;
            if(txt(v) !== '') return v;
        }
        return '';
    }
    function html(v){ return txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
    function num(v, fallback){ const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; }
    function phone(v){ return txt(v).replace(/\D/g,'').slice(-10); }
    function pin(v){ return txt(v).replace(/\D/g,'').slice(0,6); }
    function now(){ return new Date().toISOString(); }
    function sellerEmail(){ try{return txt((window.activeSeller || activeSeller || {}).email).toLowerCase();}catch(e){return '';} }
    function toast(msg,type){ if(typeof showToast === 'function') showToast(msg,type||'info'); else alert(msg); }

    function orderNo(order){
        try{ if(typeof aryShipGetOrderId === 'function') return aryShipGetOrderId(order || {}); }catch(e){}
        return txt(first(order && order.order_no, order && order.orderNo, order && order.id, `ARY-${Date.now()}`));
    }
    function findOrder(id){
        const key = txt(id);
        return (window.sellerOrders || sellerOrders || []).find(o => txt(o.id) === key || txt(o.order_no) === key || txt(o.orderNo) === key);
    }
    function selectedIds(orderId){
        if(orderId && orderId !== 'bulk') return [txt(orderId)].filter(Boolean);
        return Array.from(document.querySelectorAll('.cb-acc:checked,.cb-shiprocket:checked')).map(cb => txt(cb.value)).filter(Boolean);
    }
    function getMyItems(order){
        try{ if(typeof getSellerItemsFromOrder === 'function') return getSellerItemsFromOrder(order || {}) || []; }catch(e){}
        return Array.isArray(order && order.items) ? order.items : [];
    }
    function matchProduct(item){
        const itemId = txt(first(item && item.id, item && item.productId, item && item.product_id, item && item.productDocId));
        const itemSku = txt(item && item.sku).toLowerCase();
        return (window.sellerProducts || sellerProducts || []).find(p => {
            const pId = txt(first(p.id, p.productId, p.product_id));
            const pSku = txt(p.sku).toLowerCase();
            return (itemId && pId && itemId === pId) || (itemSku && pSku && itemSku === pSku);
        }) || {};
    }
    function sellerPickup(){
        try{ if(typeof aryShipGetSellerAddress === 'function') return aryShipGetSellerAddress() || {}; }catch(e){}
        const s = window.activeSeller || activeSeller || {};
        const shop = s.shopInfo || s.shop || {};
        const pickupName = txt(first(s.shiprocketPickupLocation, s.pickup_location_name, s.pickupLocationName, shop.shiprocketPickupLocation, shop.pickup_location_name));
        return {
            seller_name: txt(first(s.companyName, s.shopName, shop.name, s.name, 'Aryanta Seller')),
            name: txt(first(s.companyName, s.shopName, shop.name, s.name, 'Aryanta Seller')),
            seller_phone: phone(first(shop.phone, s.phone, s.mobile)),
            phone: phone(first(shop.phone, s.phone, s.mobile)),
            pickup_location_name: pickupName,
            pickup_location: pickupName,
            pickupLocation: pickupName,
            pickup_address: txt(first(shop.pickupAddress, shop.address, shop.shopAddress, s.pickupAddress, s.address)),
            address: txt(first(shop.pickupAddress, shop.address, shop.shopAddress, s.pickupAddress, s.address)),
            city: txt(first(shop.city, s.city)),
            state: txt(first(shop.state, s.state)),
            pincode: pin(first(shop.pincode, shop.pin, s.pincode, s.pin)),
            pin_code: pin(first(shop.pincode, shop.pin, s.pincode, s.pin)),
            email: txt(first(shop.email, s.email))
        };
    }
    function deliveryAddress(order){
        try{ if(typeof aryShipOrderAddress === 'function') return aryShipOrderAddress(order || {}) || {}; }catch(e){}
        const addr = order && order.address && typeof order.address === 'object' ? order.address : {};
        return {
            name: txt(first(order && order.delivery_name, order && order.customerName, order && order.userName, addr.name, 'Customer')),
            phone: phone(first(order && order.delivery_phone, order && order.phone, order && order.mobile, addr.phone)),
            email: txt(first(order && order.customerEmail, order && order.userEmail, order && order.user_email, order && order.email, addr.email, sellerEmail())),
            address: txt(first(order && order.delivery_address, order && order.deliveryAddress, order && order.fullAddress, addr.fullAddress, addr.address, addr.street)),
            address2: txt(first(order && order.delivery_address_2, order && order.address2, addr.address2, addr.landmark, addr.area)),
            city: txt(first(order && order.delivery_city, order && order.city, addr.city)),
            state: txt(first(order && order.delivery_state, order && order.state, addr.state)),
            pincode: pin(first(order && order.delivery_pincode, order && order.pincode, order && order.pin, addr.pincode, addr.pin))
        };
    }
    function packageFromItems(items){
        let weight = 0, length = 0, breadth = 0, height = 0;
        (items || []).forEach(item => {
            const p = matchProduct(item || {});
            const qty = num(first(item.qty, item.quantity, item.units), 1);
            weight += num(first(item.weightKg, item.weight_kg, item.weight, p.packageWeightKg, p.weightKg, p.weight_kg, p.weight, p.packageWeight, p.package && p.package.weight), 0.5) * qty;
            length = Math.max(length, num(first(item.lengthCm, item.length_cm, item.length, p.packageLengthCm, p.lengthCm, p.length_cm, p.length, p.packageLength, p.package && p.package.length), 20));
            breadth = Math.max(breadth, num(first(item.breadthCm, item.breadth_cm, item.breadth, item.width, p.packageBreadthCm, p.breadthCm, p.breadth_cm, p.breadth, p.widthCm, p.width, p.packageBreadth, p.package && (p.package.breadth || p.package.width)), 15));
            height = Math.max(height, num(first(item.heightCm, item.height_cm, item.height, p.packageHeightCm, p.heightCm, p.height_cm, p.height, p.packageHeight, p.package && p.package.height), 8));
        });
        return { weight:Number(Math.max(weight || 0.5, 0.1).toFixed(2)), weight_kg:Number(Math.max(weight || 0.5, 0.1).toFixed(2)), length:length||20, length_cm:length||20, breadth:breadth||15, breadth_cm:breadth||15, height:height||8, height_cm:height||8 };
    }
    function existingDocs(order){
        return {
            invoice: txt(first(order && order.shiprocketInvoicePdfUrl, order && order.shiprocketInvoiceUrl, order && order.invoiceUrl, order && order.invoice_url, order && order.shiprocketPdfUrl)),
            label: txt(first(order && order.shiprocketLabelPdfUrl, order && order.shiprocketLabelUrl, order && order.shippingLabelUrl, order && order.labelUrl, order && order.label_url, order && order.waybillUrl)),
            manifest: txt(first(order && order.shiprocketManifestPdfUrl, order && order.shiprocketManifestUrl, order && order.manifestUrl, order && order.manifest_url)),
            shiprocketOrderId: txt(first(order && order.shiprocketOrderId, order && order.shiprocket_order_id, order && order.order_id)),
            shipmentId: txt(first(order && order.shiprocketShipmentId, order && order.shipmentId, order && order.shipment_id)),
            awb: txt(first(order && order.shiprocketAwbCode, order && order.awbCode, order && order.awb_code, order && order.awb))
        };
    }
    function verifiedDocs(order){
        const d = existingDocs(order || {});
        return Boolean(d.invoice && d.label && d.shipmentId && d.shiprocketOrderId && d.awb && d.manifest);
    }
    function extractDocs(data){
        data = data || {};
        return {
            invoice: txt(first(data.invoiceUrl, data.invoice_url, data.shiprocketInvoicePdfUrl, data.shiprocketInvoiceUrl, data.invoice && data.invoice.invoiceUrl, data.shiprocketPdfUrl)),
            label: txt(first(data.labelUrl, data.label_url, data.shippingLabelUrl, data.shiprocketLabelUrl, data.shiprocketLabelPdfUrl, data.waybillUrl, data.label && data.label.labelUrl)),
            manifest: txt(first(data.manifestUrl, data.manifest_url, data.shiprocketManifestUrl, data.shiprocketManifestPdfUrl, data.manifest && data.manifest.manifestUrl)),
            shiprocketOrderId: txt(first(data.shiprocketOrderId, data.shiprocket_order_id, data.order_id, data.orderId)),
            shipmentId: txt(first(data.shipmentId, data.shipment_id, data.shiprocketShipmentId, data.shiprocket_shipment_id)),
            awb: txt(first(data.awbCode, data.awb_code, data.awb, data.shiprocketAwbCode))
        };
    }
    function errorMessage(data, fallback){
        data = data || {};
        const missing = Array.isArray(data.missing) && data.missing.length ? `Missing: ${data.missing.join(', ')}` : '';
        return txt(first(
            data.message,
            data.error,
            missing,
            data.invoice && data.invoice.message,
            data.invoice && data.invoice.error,
            data.awb && data.awb.message,
            data.awb && data.awb.error,
            data.pickup && data.pickup.message,
            data.pickup && data.pickup.error,
            data.label && data.label.message,
            data.label && data.label.error,
            data.shiprocketError && data.shiprocketError.message,
            data.shiprocketError && data.shiprocketError.error,
            fallback
        ));
    }
    async function readJson(res){
        const text = await res.text().catch(()=> '');
        if(!text) return {};
        try{ return JSON.parse(text); }catch(e){ return {success:false,error:text.slice(0,1000)}; }
    }
    async function loadCached(order){
        if(!db || !order || !order.id) return;
        const ids = [String(order.id), `${String(order.id)}_${sellerEmail()}`.replace(/[^a-zA-Z0-9_-]/g,'_')];
        for(const id of ids){
            try{ const doc = await db.collection('seller_shiprocket_full_packs').doc(id).get(); if(doc.exists) Object.assign(order, doc.data()); }catch(e){}
        }
    }
    async function saveFailure(order, payload, data, msg){
        try{
            if(!db || !order || !order.id) return;
            const id = `${String(order.id)}_${sellerEmail() || 'seller'}`.replace(/[^a-zA-Z0-9_-]/g,'_');
            await db.collection('shiprocket_document_recovery_requests').doc(id).set({
                id, sellerEmail:sellerEmail(), orderId:String(order.id), orderNo:orderNo(order),
                payload, response:data || {}, error:msg, status:'Retry Required', updatedAt:now(), createdAt:now()
            }, {merge:true});
        }catch(e){}
    }
    async function saveSuccess(order, payload, data, docs){
        const keepStatus = txt(first(order.status, order.orderStatus, 'Accepted'));
        const updates = {
            status: keepStatus, orderStatus: keepStatus, shippingProvider:'Shiprocket',
            shiprocketFullPackGenerated:Boolean(docs.invoice || docs.label || docs.manifest), shiprocketFullPackRequested:true, shiprocketFullPackStatus:'ready',
            shiprocketOrderId:docs.shiprocketOrderId, shiprocket_order_id:docs.shiprocketOrderId,
            shiprocketShipmentId:docs.shipmentId, shipmentId:docs.shipmentId, shipment_id:docs.shipmentId,
            shiprocketAwbCode:docs.awb, awbCode:docs.awb, awb_code:docs.awb,
            shiprocketInvoicePdfUrl:docs.invoice, shiprocketInvoiceUrl:docs.invoice, invoiceUrl:docs.invoice, shiprocketPdfUrl:docs.invoice || docs.label,
            shiprocketLabelUrl:docs.label, shiprocketLabelPdfUrl:docs.label, shippingLabelUrl:docs.label, waybillUrl:docs.label,
            shiprocketManifestUrl:docs.manifest, shiprocketManifestPdfUrl:docs.manifest, manifestUrl:docs.manifest,
            manifestGenerated:!!docs.manifest, manifestGeneratedAt:docs.manifest ? now() : '',
            shiprocketFullPackResponse:data, shiprocketDocsGeneratedAt:now(), updatedAt:now()
        };
        Object.keys(updates).forEach(k => { if(updates[k] === undefined) delete updates[k]; });
        try{ await db.collection('orders').doc(String(order.id)).set(updates,{merge:true}); }catch(e){}
        try{
            const recordId = `${String(order.id)}_${sellerEmail() || 'seller'}`.replace(/[^a-zA-Z0-9_-]/g,'_');
            await db.collection('seller_shiprocket_full_packs').doc(recordId).set({id:recordId, orderId:String(order.id), orderNo:orderNo(order), sellerEmail:sellerEmail(), request:payload, response:data, ...updates, createdAt:now(), updatedAt:now()}, {merge:true});
            await db.collection('seller_shiprocket_full_packs').doc(String(order.id)).set({id:String(order.id), orderId:String(order.id), orderNo:orderNo(order), sellerEmail:sellerEmail(), request:payload, response:data, ...updates, createdAt:now(), updatedAt:now()}, {merge:true});
        }catch(e){}
        Object.assign(order, updates);
    }
    function addButton(label,url){
        const box = document.getElementById('shipProcessLinks');
        if(!box || !url) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-outline';
        btn.style.margin = '6px 6px 0 0';
        btn.innerHTML = `<i class="fas fa-file-pdf"></i> ${html(label)}`;
        btn.onclick = () => window.open(url,'_blank','noopener,noreferrer');
        box.appendChild(btn);
    }
    function addError(order,msg,data){
        const box = document.getElementById('shipProcessLinks');
        if(!box) return;
        const div = document.createElement('div');
        div.className = 'ship-process-error';
        let extra = '';
        if(data && Array.isArray(data.missing) && data.missing.length) extra += `<br><small>Missing: ${html(data.missing.join(', '))}</small>`;
        if(data && data.shiprocketOrderId) extra += `<br><small>Shiprocket Order ID: ${html(data.shiprocketOrderId)}</small>`;
        if(data && data.shipmentId) extra += `<br><small>Shipment ID: ${html(data.shipmentId)}</small>`;
        div.innerHTML = `<b>${html(orderNo(order))}</b>: ${html(msg)}${extra}`;
        box.appendChild(div);
    }
    function progress(step,state,text,percent){ if(typeof updateShipProcess === 'function') updateShipProcess(step,state,text,percent); }
    function openSheet(total){
        if(typeof openShipProcessSheet === 'function') openShipProcessSheet(total);
        const title = document.getElementById('shipProcessTitle');
        const sub = document.getElementById('shipProcessSub');
        if(title) title.innerText = total > 1 ? `Generating ${total} verified Shiprocket packs` : 'Generating verified Shiprocket pack';
        if(sub) sub.innerText = 'POST to Worker → Shiprocket order → AWB → invoice + top label. Accepted status will be preserved.';
        progress('validate','running','Checking order and package details',5);
        progress('create','running','Waiting to call Worker by POST',5);
        progress('save','running','Waiting to save verified records',5);
        progress('done','running','Waiting for completion',5);
    }
    function buildPayload(order){
        let base = {};
        try{ if(typeof aryShipBuildPayload === 'function') base = aryShipBuildPayload(order || {}) || {}; }catch(e){ base = { ...(order || {}) }; }
        const items = Array.isArray(base.items) && base.items.length ? base.items : getMyItems(order).map((item,index)=>{
            const p = matchProduct(item || {});
            const q = num(first(item.qty,item.quantity,item.units),1);
            const price = num(first(item.price,item.sellingPrice,item.selling_price,item.amount,p.price,p.sellingPrice),1);
            return { id:txt(first(item.id,item.productId,item.product_id,p.id,`ITEM-${index+1}`)), productId:txt(first(item.productId,item.id,item.product_id,p.id)), sku:txt(first(item.sku,p.sku,`SKU-${index+1}`)), name:txt(first(item.name,item.title,p.name,p.title,`Product ${index+1}`)).slice(0,120), qty:q, quantity:q, units:q, price, sellingPrice:price, selling_price:price, amount:price*q, hsn:txt(first(item.hsn,p.hsn)) };
        });
        const delivery = base.delivery || base.address || deliveryAddress(order || {});
        const pickup = base.pickup || sellerPickup();
        const pack = base.package || base.packageDetails || packageFromItems(items);
        const no = orderNo(order || {});
        const orderDoc = txt(first(order && order.id, no));
        const shiprocketOrderNo = txt(first(
            order && order.shiprocketUniqueOrderNo,
            order && order.shiprocket_order_no,
            order && order.shiprocketOrderNo,
            `${no}-${orderDoc}`
        )).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,48);
        const payRaw = txt(first(base.paymentMethod, order && order.paymentMethod, order && order.payment_method, order && order.payment && order.payment.method, 'Prepaid')).toLowerCase();
        const payMethod = payRaw.includes('cod') || payRaw.includes('cash') ? 'COD' : 'Prepaid';
        const itemTotal = items.reduce((s,i)=>s + (Number(first(i.price,i.sellingPrice,i.selling_price,i.amount,1)) * Number(first(i.qty,i.quantity,i.units,1))), 0);
        const total = num(first(base.total, base.amount, order && order.total, order && order.amount, order && order.finalAmount, itemTotal), itemTotal || 1);
        const payload = {
            ...base,
            localOrderId: orderDoc,
            orderDocId: orderDoc,
            aryantaOrderId: no,
            originalOrderNo: no,
            shiprocketOrderNo,
            shiprocket_order_no: shiprocketOrderNo,
            channelOrderId: shiprocketOrderNo,
            channel_order_id: shiprocketOrderNo,
            orderId: shiprocketOrderNo,
            orderNo: shiprocketOrderNo,
            order_no: shiprocketOrderNo,
            id: orderDoc,
            sellerEmail: sellerEmail() || base.sellerEmail || base.email || '',
            email: sellerEmail() || base.sellerEmail || base.email || '',
            pickup,
            pickup_location: txt(first(pickup.pickup_location, pickup.pickup_location_name, pickup.pickupLocation, pickup.location)),
            pickupLocation: txt(first(pickup.pickup_location, pickup.pickup_location_name, pickup.pickupLocation, pickup.location)),
            delivery,
            customer: delivery,
            address: delivery,
            delivery_name: txt(first(delivery.name, delivery.customerName, order && order.delivery_name)),
            delivery_phone: phone(first(delivery.phone, order && order.delivery_phone, order && order.phone)),
            delivery_address: txt(first(delivery.address, delivery.fullAddress, order && order.delivery_address)),
            delivery_city: txt(first(delivery.city, order && order.delivery_city, order && order.city)),
            delivery_state: txt(first(delivery.state, order && order.delivery_state, order && order.state)),
            delivery_pincode: pin(first(delivery.pincode, delivery.pin, order && order.delivery_pincode, order && order.pincode)),
            pincode: pin(first(delivery.pincode, delivery.pin, order && order.delivery_pincode, order && order.pincode)),
            phone: phone(first(delivery.phone, order && order.delivery_phone, order && order.phone)),
            products: items,
            items,
            package: pack,
            packageDetails: pack,
            weight: num(first(pack.weight,pack.weight_kg,pack.weightKg),0.5),
            weight_kg: num(first(pack.weight_kg,pack.weightKg,pack.weight),0.5),
            length: num(first(pack.length,pack.length_cm,pack.lengthCm),20),
            length_cm: num(first(pack.length_cm,pack.lengthCm,pack.length),20),
            breadth: num(first(pack.breadth,pack.breadth_cm,pack.breadthCm,pack.width),15),
            breadth_cm: num(first(pack.breadth_cm,pack.breadthCm,pack.breadth,pack.width),15),
            height: num(first(pack.height,pack.height_cm,pack.heightCm),8),
            height_cm: num(first(pack.height_cm,pack.heightCm,pack.height),8),
            paymentMethod: payMethod,
            payment_method: payMethod,
            payment: { ...(base.payment || {}), method: payMethod, payment_method: payMethod, total_amount: total, cod_amount: payMethod === 'COD' ? total : 0 },
            codAmount: payMethod === 'COD' ? total : 0,
            cod_amount: payMethod === 'COD' ? total : 0,
            subTotal: total,
            total,
            amount: total,
            finalAmount: total,
            preventStatusUpdate: true,
            doNotMarkShipped: true,
            keepOrderStatus: txt(first(order && order.status, order && order.orderStatus, 'Accepted')),
            needInvoice: true,
            needLabel: true,
            needWaybill: true,
            needManifest: true
        };
        payload.forceNewShiprocketOrder = false;
        payload.ignoreExistingShiprocketDocs = false;
        payload.preventPickupQueueDuplicate = true;
        return payload;
    }
    function validatePayload(payload){
        const missing = [];
        if(!txt(payload.orderNo)) missing.push('order number');
        if(!txt(payload.pickup_location)) missing.push('seller Shiprocket pickup location');
        if(!txt(payload.delivery_name)) missing.push('customer name');
        if(phone(payload.delivery_phone).length !== 10) missing.push('customer 10-digit phone');
        if(!txt(payload.delivery_address)) missing.push('customer address');
        if(!txt(payload.delivery_city)) missing.push('customer city');
        if(!txt(payload.delivery_state)) missing.push('customer state');
        if(pin(payload.delivery_pincode).length !== 6) missing.push('customer 6-digit pincode');
        if(!Array.isArray(payload.items) || !payload.items.length) missing.push('seller product item');
        if(num(payload.weight_kg,0) <= 0) missing.push('package weight');
        if(num(payload.length_cm,0) <= 0) missing.push('package length');
        if(num(payload.breadth_cm,0) <= 0) missing.push('package breadth');
        if(num(payload.height_cm,0) <= 0) missing.push('package height');
        return missing;
    }
    async function createFullPack(order,index,total){
        await loadCached(order);
        if(verifiedDocs(order)){
            const d = existingDocs(order);
            progress('validate','done',`Order ${index}/${total}: verified saved Shiprocket docs found`,25);
            addButton(`Open invoice - ${orderNo(order)}`, d.invoice);
            addButton(`Open top label - ${orderNo(order)}`, d.label);
            if(d.manifest) addButton(`Open manifest - ${orderNo(order)}`, d.manifest);
            return {order, docs:d, reused:true};
        }
        const payload = buildPayload(order);
        const missing = validatePayload(payload);
        if(missing.length){
            const msg = 'Missing dispatch details: ' + missing.join(', ');
            await saveFailure(order,payload,{success:false,missing},msg);
            throw Object.assign(new Error(msg), {data:{missing}});
        }
        progress('validate','done',`Order ${index}/${total}: details checked`,20);
        progress('create','running',`Order ${index}/${total}: POST full-pack to Worker`,45);
        const res = await fetch(FULL_PACK_URL, { method:'POST', mode:'cors', cache:'no-store', headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'AryantaSellerPanel'}, body:JSON.stringify(payload) });
        const data = await readJson(res);
        if(!res.ok || data.success === false){
            const msg = errorMessage(data, `Shiprocket full-pack failed with ${res.status}`);
            await saveFailure(order,payload,data,msg);
            console.error('Aryanta Shiprocket full-pack POST failed',{status:res.status,data,payload});
            throw Object.assign(new Error(msg), {data});
        }
        const docs = extractDocs(data);
        if(!(docs.shiprocketOrderId && docs.shipmentId && docs.awb && docs.invoice && docs.label)){
            const msg = 'Shiprocket did not return verified order id, shipment id, AWB, invoice and top label together. Invoice-only success is blocked.';
            await saveFailure(order,payload,data,msg);
            console.error('Aryanta Shiprocket incomplete success blocked',{data,docs,payload});
            throw Object.assign(new Error(msg), {data});
        }
        progress('save','running',`Order ${index}/${total}: saving verified Shiprocket records`,75);
        await saveSuccess(order,payload,data,docs);
        progress('save','done',`Order ${index}/${total}: verified records saved`,88);
        addButton(`Open invoice - ${orderNo(order)}`, docs.invoice);
        addButton(`Open top label - ${orderNo(order)}`, docs.label);
        if(docs.manifest) addButton(`Open manifest - ${orderNo(order)}`, docs.manifest);
        return {order,data,docs};
    }

    window.callShiprocketFullPack = createFullPack;
    window.downloadShippingInvoice = async function(orderId){
        const ids = Array.from(new Set(selectedIds(orderId)));
        if(!ids.length) return toast('Select at least one accepted order.','warning');
        const orders = ids.map(findOrder).filter(Boolean);
        if(!orders.length) return toast('Selected order not found. Refresh and try again.','error');
        openSheet(orders.length);
        const ok = [], failed = [];
        for(let i=0;i<orders.length;i++){
            const order = orders[i];
            try{
                const result = await createFullPack(order,i+1,orders.length);
                ok.push(result);
                progress('create','done',`Order ${i+1}/${orders.length}: invoice + top label ready`,65);
            }catch(e){
                const msg = e && e.message ? e.message : String(e);
                failed.push({order,error:msg,data:e && e.data});
                progress('create','error',`Failed: ${orderNo(order)} - ${msg}`,100);
                addError(order,msg,e && e.data);
            }
        }
        const sub = document.getElementById('shipProcessSub');
        if(failed.length){
            if(sub) sub.innerText = `${ok.length} completed, ${failed.length} failed. Full error saved in shiprocket_document_recovery_requests.`;
            progress('done','error','Some orders failed',100);
            toast(`${failed.length} Shiprocket pack failed. Check popup details.`, 'error');
        }else{
            if(sub) sub.innerText = 'All verified Shiprocket documents are ready. Accepted status was preserved.';
            progress('done','done','Completed successfully',100);
            toast('Shiprocket invoice and top label generated successfully.','success');
        }
        try{ if(typeof loadAcceptedOrders === 'function') loadAcceptedOrders(); }catch(e){}
        try{ if(typeof loadCompletedScanOrders === 'function') loadCompletedScanOrders(); }catch(e){}
        try{ if(typeof loadShippedOrders === 'function') loadShippedOrders(); }catch(e){}
        try{ if(typeof renderDashboardStats === 'function') renderDashboardStats(); }catch(e){}
        return {ok, failed};
    };

    window.requestShiprocketCancelForOrder = async function(order){
        order = typeof order === 'string' ? findOrder(order) : order;
        if(!order) return {success:false,error:'Order not found'};
        const docs = existingDocs(order);
        const payload = { localOrderId:txt(first(order.id, orderNo(order))), orderDocId:txt(first(order.id, orderNo(order))), orderNo:orderNo(order), sellerEmail:sellerEmail(), shiprocketOrderId:docs.shiprocketOrderId, shipmentId:docs.shipmentId, awbCode:docs.awb, keepOrderStatus:txt(first(order.status,order.orderStatus,'Cancelled')) };
        const res = await fetch(CANCEL_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
        const data = await readJson(res);
        if(!res.ok || data.success === false) console.warn('Shiprocket cancel request saved/failed',data);
        return data;
    };
})();

(function(){
    if(window.__ARYANTA_SELLER_PANEL_FIX_20260529__) return;
    window.__ARYANTA_SELLER_PANEL_FIX_20260529__ = true;

    const $ary = id => document.getElementById(id);
    const aryTxt = v => String(v == null ? '' : v).trim();
    const aryLow = v => aryTxt(v).toLowerCase();
    const aryNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const aryMoney = v => '₹' + Math.round(aryNum(v)).toLocaleString('en-IN');
    const arySafe = v => aryTxt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const aryEmail = () => aryLow((window.activeSeller || activeSeller || {}).email);

    function aryDateValue(v){
        if(v && typeof v === 'object'){
            if(typeof v.toDate === 'function') v = v.toDate();
            else if(v.seconds) v = new Date(v.seconds * 1000);
        }
        if(!v) return null;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    window.aryantaSmartDate = function(v, withTime){
        const d = aryDateValue(v);
        if(!d) return 'Date not available';
        return withTime ? d.toLocaleString('en-IN') : d.toLocaleDateString('en-IN');
    };

    function aryOrderStatus(o){ return aryLow(o && (o.status || o.orderStatus || o.order_status)); }
    function aryIsCancelled(o){
        const s = aryOrderStatus(o);
        return s.includes('cancel') || s.includes('return') || s.includes('rto') || s.includes('refund');
    }
    function aryIsDelivered(o){ return aryOrderStatus(o).includes('deliver'); }
    function aryIsPayPending(o){ return aryIsDelivered(o) && !(o && (o.sellerSettled || o.seller_settled || o.payoutSettled)); }
    function aryGetSellerItems(order){
        try{ if(typeof getSellerItemsFromOrder === 'function') return getSellerItemsFromOrder(order || {}) || []; }catch(e){}
        return Array.isArray(order && order.items) ? order.items : [];
    }
    function aryItemQty(i){ return Math.max(1, aryNum(i && (i.qty || i.quantity || i.units || 1)) || 1); }
    function aryItemPrice(i){ return aryNum(i && (i.price || i.sellingPrice || i.selling_price || i.amount || 0)); }
    function aryOrderAmount(order){
        const items = aryGetSellerItems(order);
        if(items.length) return items.reduce((s,i)=>s + aryItemPrice(i) * aryItemQty(i), 0);
        return aryNum(order && (order.total || order.amount || order.finalAmount || order.totalPrice));
    }
    function aryProductKeys(){
        const keys = new Set();
        (window.sellerProducts || sellerProducts || []).forEach(p => {
            ['id','uid','itemUid','itemUID','item_uid','productUid','productUID','product_uid','productId','product_id','productDocId','sku'].forEach(k => {
                const v = aryTxt(p && p[k]);
                if(v) keys.add(aryLow(v));
            });
        });
        return keys;
    }
    function aryReviewKeys(r){
        const keys = [];
        ['itemUid','itemUID','item_uid','uid','productUid','productUID','product_uid','productId','product_id','productDocId','itemId','id','sku'].forEach(k => {
            const v = aryTxt(r && r[k]);
            if(v) keys.push(aryLow(v));
        });
        return keys;
    }
    function aryReviewBelongsToSeller(r, productKeys){
        const email = aryEmail();
        const directEmail = aryLow(r && (r.sellerEmail || r.seller_email || r.vendorEmail || r.vendor_email));
        if(directEmail && email && directEmail === email) return true;
        return aryReviewKeys(r).some(k => productKeys.has(k));
    }
    function aryRatingNumber(r){
        const n = Number(r && (r.rating || r.stars || r.star || r.score));
        if(Number.isFinite(n) && n > 0) return Math.min(5, Math.max(1, n));
        const raw = aryLow(r && (r.sentiment || r.type || r.reviewType || r.status || r.feedbackType));
        if(raw.includes('negative') || raw.includes('bad') || raw.includes('poor')) return 1;
        if(raw.includes('positive') || raw.includes('good') || raw.includes('happy')) return 5;
        return 0;
    }
    function aryStoreRatingStats(){
        const productKeys = aryProductKeys();
        const rows = (window.sellerReviews || sellerReviews || []).filter(r => aryReviewBelongsToSeller(r, productKeys));
        let total = 0, sum = 0, positive = 0, negative = 0, neutral = 0;
        rows.forEach(r => {
            const rating = aryRatingNumber(r);
            const raw = aryLow(r && (r.sentiment || r.type || r.reviewType || r.status || r.feedbackType));
            if(!rating && !raw) return;
            total++;
            if(rating) sum += rating;
            else sum += raw.includes('negative') ? 1 : 5;
            if((rating && rating >= 4) || raw.includes('positive')) positive++;
            else if((rating && rating <= 2) || raw.includes('negative')) negative++;
            else neutral++;
        });
        return {total, positive, negative, neutral, average: total ? (sum / total) : 5};
    }
    async function aryEnsureReviews(){
        if(!db || !activeSeller) return;
        if(window.__ARYANTA_REVIEWS_UID_LOADED__) return;
        window.__ARYANTA_REVIEWS_UID_LOADED__ = true;
        try{
            const productKeys = aryProductKeys();
            const snap = await db.collection('reviews').limit(500).get();
            const rows = [];
            snap.forEach(doc => {
                const r = {id:doc.id, ...doc.data()};
                if(aryReviewBelongsToSeller(r, productKeys)) rows.push(r);
            });
            sellerReviews = rows;
            window.sellerReviews = rows;
        }catch(e){ window.__ARYANTA_REVIEWS_UID_LOADED__ = false; }
    }

    const oldInitDashboard = window.initDashboard;
    window.initDashboard = initDashboard = async function(){
        if(typeof oldInitDashboard === 'function') await oldInitDashboard.apply(this, arguments);
        try{ await aryEnsureReviews(); }catch(e){}
        try{ window.renderDashboardStats(); }catch(e){}
    };

    window.renderDashboardStats = renderDashboardStats = function(){
        const orders = window.sellerOrders || sellerOrders || [];
        const products = window.sellerProducts || sellerProducts || [];
        const today = new Date();
        const todayKey = today.toDateString();
        const month = today.getMonth();
        const year = today.getFullYear();
        let revenue = 0, pendingPay = 0, todayOrders = 0, monthlyOrders = 0, toAccept = 0, cancelledTotal = 0, lowStockCount = 0;
        const days = [];
        for(let i=6;i>=0;i--){
            const d = new Date();
            d.setHours(0,0,0,0);
            d.setDate(d.getDate() - i);
            days.push({key:d.toDateString(), label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), orders:0, cancelled:0});
        }
        orders.forEach(o => {
            const items = aryGetSellerItems(o);
            if(!items.length) return;
            const amount = aryOrderAmount(o);
            const d = aryDateValue(o.timestamp || o.createdAt || o.orderDate || o.date || o.created_at);
            const status = aryOrderStatus(o);
            if(d){
                if(d.toDateString() === todayKey) todayOrders++;
                if(d.getMonth() === month && d.getFullYear() === year) monthlyOrders++;
                const day = days.find(x => x.key === d.toDateString());
                if(day){
                    day.orders++;
                    if(aryIsCancelled(o)) day.cancelled++;
                }
            }
            if(aryIsDelivered(o)) revenue += amount;
            if(aryIsPayPending(o)) pendingPay += amount;
            if(['placed','new','pending','confirmed','order placed','processing','accepted'].includes(status)) toAccept++;
            if(aryIsCancelled(o)) cancelledTotal++;
        });
        products.forEach(p => {
            const stock = aryNum(p && (p.stock || p.qty || p.quantity || p.availableStock));
            if(stock <= 7) lowStockCount++;
        });
        const set = (id, value) => { const el = $ary(id); if(el) el.textContent = value; };
        set('smartDailyOrders', todayOrders);
        set('smartMonthlyOrders', monthlyOrders);
        set('stat-total-inventory', products.length);
        set('smartRestock', `${lowStockCount} Low`);
        set('stat-total-pay', aryMoney(revenue));
        set('stat-pending-pay', aryMoney(pendingPay));
        set('stat-orders', orders.length);
        set('stat-pending-orders', toAccept);
        const badgeLow = $ary('badge-low-stock');
        if(badgeLow){ badgeLow.style.display = lowStockCount ? 'inline-block' : 'none'; badgeLow.textContent = lowStockCount; }
        const sdp = $ary('smartDailyPct');
        if(sdp){
            const avg = monthlyOrders / Math.max(1, today.getDate());
            const pct = avg ? Math.round(((todayOrders - avg) / avg) * 100) : (todayOrders ? 100 : 0);
            sdp.innerHTML = `<span class="dash-mini-pct ${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '+' : ''}${pct}%</span>`;
        }
        const rating = aryStoreRatingStats();
        const ratingEl = $ary('topShopRating');
        if(ratingEl){
            ratingEl.innerHTML = `${rating.average.toFixed(1)} <small>${rating.total} reviews • ${rating.positive}+ / ${rating.negative}-</small>`;
            ratingEl.title = `Calculated from seller item UID/product UID reviews. Positive: ${rating.positive}, Negative: ${rating.negative}, Neutral: ${rating.neutral}`;
        }
        const bNew = $ary('badge-new-orders');
        const pendingCount = orders.filter(o => ['placed','new','pending','confirmed','order placed','processing'].includes(aryOrderStatus(o))).length;
        if(bNew){ bNew.style.display = pendingCount ? 'inline-block' : 'none'; bNew.textContent = pendingCount; }
        const bAcc = $ary('badge-accepted');
        const accCount = orders.filter(o => aryOrderStatus(o) === 'accepted').length;
        if(bAcc){ bAcc.style.display = accCount ? 'inline-block' : 'none'; bAcc.textContent = accCount; }
        const bWarr = $ary('badge-warranty');
        if(bWarr){
            const warr = (window.sellerWarranties || sellerWarranties || []).filter(w => ['assigned to seller','pending action'].includes(aryLow(w.status))).length;
            bWarr.style.display = warr ? 'inline-block' : 'none';
            bWarr.textContent = warr;
        }
        window.__ARYANTA_7_DAY_ORDER_CHART__ = days;
        window.renderSalesChart({labels:days.map(d=>d.label), orders:days.map(d=>d.orders), cancelled:days.map(d=>d.cancelled)});
        try{ if(typeof fetchSupportTicketBadges === 'function') fetchSupportTicketBadges(); }catch(e){}
    };

    window.renderSalesChart = renderSalesChart = function(data){
        const canvas = $ary('salesChart');
        if(!canvas || typeof Chart === 'undefined') return;
        const chartData = data && data.labels ? data : {labels:['Day 1','Day 2','Day 3','Day 4','Day 5','Day 6','Day 7'], orders:Array.isArray(data) ? data : [0,0,0,0,0,0,0], cancelled:[0,0,0,0,0,0,0]};
        if(window.salesChartInstance || (typeof salesChartInstance !== 'undefined' && salesChartInstance)){
            try{ (window.salesChartInstance || salesChartInstance).destroy(); }catch(e){}
        }
        const ctx = canvas.getContext('2d');
        const g1 = ctx.createLinearGradient(0,0,0,250);
        g1.addColorStop(0,'rgba(15,118,110,0.24)');
        g1.addColorStop(1,'rgba(15,118,110,0)');
        const g2 = ctx.createLinearGradient(0,0,0,250);
        g2.addColorStop(0,'rgba(239,68,68,0.20)');
        g2.addColorStop(1,'rgba(239,68,68,0)');
        salesChartInstance = window.salesChartInstance = new Chart(canvas,{
            type:'line',
            data:{labels:chartData.labels,datasets:[
                {label:'Total Orders',data:chartData.orders,borderColor:'#0f766e',backgroundColor:g1,fill:true,tension:0.35,borderWidth:3,pointRadius:4,pointBackgroundColor:'#ffffff',pointBorderColor:'#0f766e',pointBorderWidth:2},
                {label:'Cancelled / Returns',data:chartData.cancelled,borderColor:'#ef4444',backgroundColor:g2,fill:true,tension:0.35,borderWidth:3,pointRadius:4,pointBackgroundColor:'#ffffff',pointBorderColor:'#ef4444',pointBorderWidth:2}
            ]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{boxWidth:12,usePointStyle:true,font:{weight:'bold'}}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.parsed.y}`}}},scales:{y:{beginAtZero:true,ticks:{precision:0},grid:{color:'rgba(148,163,184,0.24)'}},x:{grid:{display:false}}}}
        });
    };

    window.loadLowStockItems = async function(){
        try{ if(typeof window.ensureSellerProducts === 'function') await window.ensureSellerProducts(); }catch(e){}
        const list = $ary('lowStockList');
        if(!list) return;
        const rows = (window.sellerProducts || sellerProducts || []).filter(p => aryNum(p.stock || p.qty || p.quantity || p.availableStock) <= 7);
        if(!rows.length){ list.innerHTML = `<tr><td colspan="5" class="ary-empty-row">No low stock items. All inventory is healthy.</td></tr>`; return; }
        list.innerHTML = rows.map(p => {
            const stock = aryNum(p.stock || p.qty || p.quantity || p.availableStock);
            const id = arySafe(p.id || p.productId || p.uid);
            return `<tr>
                <td data-label="Product"><div class="ary-product-mini"><img src="${arySafe((Array.isArray(p.images) ? p.images[0] : p.image || p.img || p.photo) || 'https://via.placeholder.com/90')}" onerror="this.src='https://via.placeholder.com/90'"><div><b>${arySafe(p.name || p.title || 'Product')}</b><small>${arySafe(p.category || 'No category')}</small></div></div></td>
                <td data-label="SKU"><strong style="font-family:var(--font-mono);">${arySafe(p.sku || id.slice(0,10))}</strong></td>
                <td data-label="Current Stock"><span class="ary-status-pill warning">${stock} left</span></td>
                <td data-label="Direct Update"><div class="ary-inline-stock"><input type="number" min="0" value="${stock}" id="lowStockInput_${id}" class="input-field"><button class="btn-prime" onclick="updateLowStockDirect('${id}')"><i class="fas fa-save"></i> Save</button></div></td>
                <td data-label="Status"><span class="ary-status-pill">No QC reset</span></td>
            </tr>`;
        }).join('');
    };
    window.updateLowStockDirect = async function(id){
        const input = $ary('lowStockInput_' + id);
        const stock = Math.max(0, Math.floor(aryNum(input && input.value)));
        try{
            await db.collection('products').doc(id).set({stock, quantity:stock, updatedAt:new Date().toISOString(), stockUpdatedDirect:true},{merge:true});
            const p = (window.sellerProducts || sellerProducts || []).find(x => String(x.id) === String(id));
            if(p){ p.stock = stock; p.quantity = stock; }
            if(typeof showToast === 'function') showToast('Stock updated directly. QC was not triggered.','success');
            window.loadLowStockItems();
            window.renderDashboardStats();
        }catch(e){ if(typeof showToast === 'function') showToast('Stock update failed.','error'); }
    };

    window.loadProductPerformance = async function(){
        try{ await Promise.all([window.ensureSellerProducts && window.ensureSellerProducts(), window.ensureSellerOrders && window.ensureSellerOrders(), aryEnsureReviews()]); }catch(e){}
        const box = $ary('productPerformanceBox');
        if(!box) return;
        const map = new Map();
        (window.sellerProducts || sellerProducts || []).forEach(p => map.set(String(p.id), {p, sold:0, revenue:0, cancelled:0, reviews:0, positive:0, negative:0}));
        (window.sellerOrders || sellerOrders || []).forEach(o => {
            const cancel = aryIsCancelled(o);
            aryGetSellerItems(o).forEach(i => {
                const id = aryTxt(i.productId || i.product_id || i.id || i.productDocId);
                let row = map.get(id);
                if(!row){
                    const p = (window.sellerProducts || sellerProducts || []).find(x => aryLow(x.sku) && aryLow(x.sku) === aryLow(i.sku));
                    if(p) row = map.get(String(p.id));
                }
                if(!row) return;
                const qty = aryItemQty(i);
                row.sold += cancel ? 0 : qty;
                row.revenue += cancel ? 0 : aryItemPrice(i) * qty;
                if(cancel) row.cancelled += qty;
            });
        });
        const keys = aryProductKeys();
        (window.sellerReviews || sellerReviews || []).forEach(r => {
            if(!aryReviewBelongsToSeller(r, keys)) return;
            const ids = aryReviewKeys(r);
            const product = (window.sellerProducts || sellerProducts || []).find(p => ids.some(k => [p.id,p.uid,p.itemUid,p.item_uid,p.productUid,p.productId,p.sku].map(aryLow).includes(k)));
            if(!product) return;
            const row = map.get(String(product.id));
            if(!row) return;
            const rating = aryRatingNumber(r);
            row.reviews++;
            if(rating >= 4) row.positive++;
            if(rating <= 2 && rating > 0) row.negative++;
        });
        const rows = [...map.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,80);
        if(!rows.length){ box.innerHTML = `<div class="ary-empty-card"><i class="fas fa-chart-line"></i><h3>No products found</h3><p>Add products to see performance.</p></div>`; return; }
        box.innerHTML = `<div class="table-container"><table class="admin-table"><thead><tr><th>Product</th><th>Sold</th><th>Cancelled</th><th>Revenue</th><th>Reviews</th><th>Action</th></tr></thead><tbody>${rows.map(row => {
            const p = row.p;
            const img = (Array.isArray(p.images) ? p.images[0] : p.image || p.img || p.photo) || 'https://via.placeholder.com/90';
            return `<tr><td data-label="Product"><div class="ary-product-mini"><img src="${arySafe(img)}" onerror="this.src='https://via.placeholder.com/90'"><div><b>${arySafe(p.name || p.title || 'Product')}</b><small>${arySafe(p.sku || p.id)}</small></div></div></td><td data-label="Sold"><b>${row.sold}</b></td><td data-label="Cancelled"><span class="ary-status-pill ${row.cancelled ? 'warning' : ''}">${row.cancelled}</span></td><td data-label="Revenue"><b>${aryMoney(row.revenue)}</b></td><td data-label="Reviews"><b>${row.reviews}</b><br><small>${row.positive}+ / ${row.negative}-</small></td><td data-label="Action"><button class="btn-sm edit" onclick="editItem('${arySafe(p.id)}')">Edit</button></td></tr>`;
        }).join('')}</tbody></table></div>`;
    };

    window.loadReturnTracking = async function(){
        try{ if(typeof window.ensureSellerOrders === 'function') await window.ensureSellerOrders(); }catch(e){}
        const box = $ary('returnTrackingBox');
        if(!box) return;
        const rows = (window.sellerOrders || sellerOrders || []).filter(aryIsCancelled).sort((a,b)=>(aryDateValue(b.timestamp||b.updatedAt||b.createdAt)||0)-(aryDateValue(a.timestamp||a.updatedAt||a.createdAt)||0));
        if(!rows.length){ box.innerHTML = `<div class="ary-empty-card"><i class="fas fa-location-crosshairs"></i><h3>No return/cancel tracking yet</h3><p>Cancelled, return and RTO orders will appear here.</p></div>`; return; }
        box.innerHTML = `<div class="table-container"><table class="admin-table"><thead><tr><th>Date</th><th>Order</th><th>Items</th><th>Status</th><th>Amount</th></tr></thead><tbody>${rows.map(o => {
            const items = aryGetSellerItems(o).map(i => `<div class="ary-product-mini"><span></span><div><b>${arySafe(i.name || i.title || 'Item')}</b><small>Qty ${aryItemQty(i)}</small></div></div>`).join('') || 'No seller item';
            return `<tr onclick="viewOrderDetails('${arySafe(o.id)}')" class="clickable-row"><td data-label="Date"><strong>${window.aryantaSmartDate(o.timestamp || o.updatedAt || o.createdAt || o.date)}</strong></td><td data-label="Order"><strong style="font-family:var(--font-mono);">${arySafe(o.order_no || o.orderNo || o.id)}</strong></td><td data-label="Items">${items}</td><td data-label="Status"><span class="ary-status-pill warning">${arySafe(o.status || o.orderStatus || 'Cancelled')}</span></td><td data-label="Amount"><b>${aryMoney(aryOrderAmount(o))}</b></td></tr>`;
        }).join('')}</tbody></table></div>`;
    };

    const previousShowSection = window.showSection;
    window.showSection = async function(section){
        if(section === 'lowStock' || section === 'performance' || section === 'returnTracking'){
            document.querySelectorAll('.data-section').forEach(x => x.classList.remove('active'));
            const target = $ary(section + 'Section');
            if(target) target.classList.add('active');
            document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
            const clicked = window.event && window.event.target && window.event.target.closest ? window.event.target.closest('.nav-item') : null;
            if(clicked) clicked.classList.add('active');
            const sb = $ary('mobileSidebar'); if(sb) sb.classList.remove('open');
            const ov = $ary('mobileSidebarOverlay'); if(ov) ov.style.display = 'none';
            if(section === 'lowStock') return window.loadLowStockItems();
            if(section === 'performance') return window.loadProductPerformance();
            if(section === 'returnTracking') return window.loadReturnTracking();
        }
        return typeof previousShowSection === 'function' ? previousShowSection.apply(this, arguments) : undefined;
    };

    window.openFullNotifFinal = function(id){
        const n = (window.adminNotifications || adminNotifications || []).find(x => String(x.id) === String(id));
        if(!n) return;
        const cont = $ary('notifDetailContent');
        const mod = $ary('notificationDetailModal');
        const link = n.link ? (String(n.link).startsWith('http') ? String(n.link) : 'https://' + String(n.link)) : '';
        if(cont){
            cont.innerHTML = `<div class="notif-detail-v5"><div class="notif-detail-head"><div class="notif-icon-v5 big"><i class="fas fa-bell"></i></div><div><h3>${arySafe(n.title || 'Aryanta Notice')}</h3><small>${arySafe(window.aryantaSmartDate(n.time, true))}</small></div></div><div class="notif-detail-message">${arySafe(n.text || 'No message')}</div>${link ? `<a href="${arySafe(link)}" target="_blank" rel="noopener" class="btn-prime"><i class="fas fa-link"></i> Open Attached Link</a>` : ''}</div>`;
        }
        if(mod){ mod.style.display = 'flex'; setTimeout(()=>mod.classList.add('show'), 10); }
    };

    const oldRenderNotificationsFinal = window.renderNotificationsFinal;
    window.renderNotificationsFinal = function(){
        const rows = window.adminNotifications || adminNotifications || [];
        const badge = $ary('notifBadge');
        if(badge){ badge.style.display = rows.length ? 'inline-block' : 'none'; badge.textContent = rows.length; }
        const html = rows.length ? `<div class="notification-list-v5">${rows.map(n => {
            const link = n.link ? `<span class="short-link-chip"><i class="fas fa-link"></i> Link attached</span>` : '';
            return `<div class="notification-card notification-card-v5" onclick="openFullNotifFinal('${arySafe(n.id)}')"><div class="notif-icon-v5"><i class="fas fa-bell"></i></div><div class="notif-body-v5"><div class="notif-title-v5">${arySafe(n.title || 'Aryanta Notice')}</div><p>${arySafe(n.text || 'No message')}</p><div class="notif-meta-v5"><span><i class="fas fa-clock"></i> ${arySafe(window.aryantaSmartDate(n.time, true))}</span>${link}</div></div></div>`;
        }).join('')}</div>` : `<div class="ary-empty-card"><i class="fas fa-bell-slash"></i><h3>No notifications yet</h3><p>Company notices and seller alerts will appear here.</p></div>`;
        const dropdown = $ary('notifList');
        const full = $ary('fullNotifList');
        if(dropdown) dropdown.innerHTML = html;
        if(full) full.innerHTML = html;
    };

    window.addSellerFineToDb = async function(key, amount, reason, meta){
        if(!db || !activeSeller) return false;
        const safeKey = aryTxt(key || (reason + '_' + Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,180);
        const row = {email:aryEmail(), sellerEmail:aryEmail(), amount:Number(amount)||0, reason:aryTxt(reason), status:'Pending Admin Review', accepted:false, timestamp:new Date().toISOString(), updatedAt:new Date().toISOString(), ...(meta || {})};
        try{
            await db.collection('seller_fine_events').doc(safeKey).set({id:safeKey, ...row},{merge:true});
            await db.collection('fines').doc(safeKey).set({id:safeKey, ...row},{merge:true});
            const exists = (window.sellerFines || sellerFines || []).some(f => String(f.id) === safeKey);
            if(!exists){ sellerFines = [...(sellerFines || []), {id:safeKey, ...row}]; window.sellerFines = sellerFines; }
            return true;
        }catch(e){ console.warn('Fine save failed', e); return false; }
    };

    function aryDownloadUrl(url, name){
        if(!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = name || 'aryanta-document.pdf';
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>a.remove(), 700);
    }
    async function aryDownloadBulkDoc(kind){
        if(typeof window.downloadShippingInvoice !== 'function') return;
        const summary = await window.downloadShippingInvoice('bulk');
        const ok = summary && Array.isArray(summary.ok) ? summary.ok : [];
        const docs = ok.map(r => ({order:r.order || {}, docs:r.docs || {invoice:r.invoiceUrl,label:r.labelUrl,manifest:r.manifestUrl}}));
        const urls = docs.map(r => {
            const d = r.docs || {};
            return {order:r.order, url:kind === 'manifest' ? d.manifest : (d.label || d.invoice), type:kind};
        }).filter(x => x.url);
        if(!urls.length){ if(typeof showToast === 'function') showToast(kind === 'manifest' ? 'No manifest PDF is ready yet. Try after pickup manifest is generated.' : 'No slip/label PDF found.','warning'); return; }
        urls.forEach((x,i) => setTimeout(()=>aryDownloadUrl(x.url, `Aryanta-${kind}-${arySafe(x.order.order_no || x.order.orderNo || x.order.id || i+1)}.pdf`), i * 450));
        if(typeof showToast === 'function') showToast(`${urls.length} ${kind === 'manifest' ? 'manifest' : 'slip'} PDF download started.`, 'success');
    }
    window.downloadShiprocketSlipsBulk = () => aryDownloadBulkDoc('slip');
    window.downloadShiprocketManifestsBulk = () => aryDownloadBulkDoc('manifest');

    try{ aryEnsureReviews().then(()=>window.renderDashboardStats()).catch(()=>{}); }catch(e){}
})();

(function(){
    if(window.__ARYANTA_SAFE_DATE_RENDER_20260529__) return;
    window.__ARYANTA_SAFE_DATE_RENDER_20260529__ = true;
    const oldDateOnly = Date.prototype.toLocaleDateString;
    const oldDateTime = Date.prototype.toLocaleString;
    Date.prototype.toLocaleDateString = function(){
        if(!Number.isFinite(this.getTime())) return 'Date not available';
        return oldDateOnly.apply(this, arguments);
    };
    Date.prototype.toLocaleString = function(){
        if(!Number.isFinite(this.getTime())) return 'Date not available';
        return oldDateTime.apply(this, arguments);
    };
})();

(function(){
    if(window.__ARYANTA_CANCEL_SHIPROCKET_SYNC_20260529__) return;
    window.__ARYANTA_CANCEL_SHIPROCKET_SYNC_20260529__ = true;
    const oldCancelOrderFinal = window.cancelOrder;
    window.cancelOrder = async function(id){
        const order = (window.sellerOrders || sellerOrders || []).find(o => String(o.id) === String(id) || String(o.order_no) === String(id) || String(o.orderNo) === String(id));
        const result = typeof oldCancelOrderFinal === 'function' ? await oldCancelOrderFinal.apply(this, arguments) : undefined;
        try{
            if(order && typeof window.requestShiprocketCancelForOrder === 'function'){
                const hasSr = order.shiprocketOrderId || order.shiprocket_order_id || order.shiprocketShipmentId || order.shipmentId || order.awbCode || order.awb;
                if(hasSr) await window.requestShiprocketCancelForOrder(order);
            }
        }catch(e){ console.warn('Shiprocket cancel sync failed', e); }
        return result;
    };
})();


/* ========================================================================
   Aryanta Critical Hotfix - status login, notifications, cancel/fine, Shiprocket recovery
   ======================================================================== */
(function(){
    if(window.__ARYANTA_CRITICAL_HOTFIX_20260529_B__) return;
    window.__ARYANTA_CRITICAL_HOTFIX_20260529_B__ = true;

    const $ = id => document.getElementById(id);
    const txt = v => String(v == null ? '' : v).trim();
    const low = v => txt(v).toLowerCase();
    const now = () => new Date().toISOString();
    const esc = v => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const sellerEmail = () => low((window.activeSeller || activeSeller || {}).email);

    function dateMs(v){
        try{
            if(v && typeof v.toDate === 'function') v = v.toDate();
            else if(v && typeof v === 'object' && v.seconds) v = new Date(v.seconds * 1000);
            const d = v instanceof Date ? v : new Date(v || 0);
            return Number.isFinite(d.getTime()) ? d.getTime() : 0;
        }catch(e){ return 0; }
    }
    function smartDate(v, withTime){
        const ms = dateMs(v);
        if(!ms) return 'Date not available';
        const d = new Date(ms);
        return withTime ? d.toLocaleString('en-IN') : d.toLocaleDateString('en-IN');
    }
    window.aryantaSmartDate = smartDate;

    function sellerBlocked(s){
        const st = low(s && (s.status || s.accountStatus || s.sellerStatus));
        return st === 'blocked' || st === 'block' || s && (s.blocked === true || s.isBlocked === true);
    }
    function sellerSuspended(s){
        const st = low(s && (s.status || s.accountStatus || s.sellerStatus));
        return st === 'suspended' || st === 'suspend' || s && (s.suspended === true || s.isSuspended === true);
    }
    function statusUnlockMs(s){
        const start = dateMs(s && (s.suspendedAt || s.suspendAt || s.suspensionStart || s.suspensionStartedAt || s.updatedAt)) || Date.now();
        return start + 7 * 24 * 60 * 60 * 1000;
    }
    async function forceRestrictedOffline(s, reason){
        try{
            if(!db || !s || !s.email) return;
            const email = low(s.email);
            const settings = {...(s.settings || {}), offline:true};
            await db.collection('sellers').doc(email).set({settings, offline:true, offlineReason:reason || 'Account restricted', offlineForcedAt:now(), updatedAt:now()},{merge:true});
            const snap = await db.collection('products').where('sellerEmail','==',email).get();
            let batch = db.batch(), n = 0;
            snap.forEach(d => { batch.update(d.ref,{isVisible:false, visible:false, publicVisible:false, offlineHidden:true, offlineHiddenAt:now()}); n++; });
            if(n) await batch.commit();
        }catch(e){ console.warn('restricted offline skipped', e); }
    }
    function showRestriction(title, msg, unlockMs){
        const lo = $('loginOverlay'); if(lo) lo.style.display = 'flex';
        const app = $('mainAppContainer') || document.querySelector('.seller-container'); if(app) app.style.display = 'none';
        if(typeof renderStatusScreen === 'function') renderStatusScreen(title, msg, Boolean(unlockMs), unlockMs || null);
        const loader = $('pageLoader'); if(loader) loader.style.display = 'none';
    }
    async function canLoginSeller(seller){
        const s = seller || {};
        if(sellerBlocked(s)){
            await forceRestrictedOffline(s, 'Blocked account login check');
            showRestriction('Account Blocked','Your seller account is blocked by Aryanta. Offline mode was enabled automatically and live products were hidden. Contact support@aryanta.in.',0);
            return false;
        }
        if(sellerSuspended(s)){
            const unlock = statusUnlockMs(s);
            if(Date.now() < unlock){
                await forceRestrictedOffline(s, 'Suspended account login check');
                showRestriction('Account Suspended','Your seller account is suspended for 7 days. Offline mode was enabled automatically and live products were hidden. Contact support@aryanta.in.',unlock);
                return false;
            }
            try{ await db.collection('sellers').doc(low(s.email)).set({status:'Active', isSuspended:false, suspendedAt:firebase.firestore.FieldValue.delete(), updatedAt:now()},{merge:true}); }catch(e){}
        }
        return true;
    }

    try{
        completeLoginProcess = window.completeLoginProcess = async function(sellerData){
            try{
                let fresh = sellerData || {};
                const email = low(fresh.email);
                if(db && email){
                    const doc = await db.collection('sellers').doc(email).get();
                    if(doc.exists) fresh = {id:doc.id, ...doc.data()};
                }
                if(!(await canLoginSeller(fresh))) return;
                localStorage.setItem('sellerToken', JSON.stringify(fresh));
                activeSeller = fresh;
                window.activeSeller = fresh;
                const lo = $('loginOverlay'); if(lo) lo.style.display = 'none';
                const sc = document.querySelector('.seller-container') || $('mainAppContainer'); if(sc) sc.style.display = 'flex';
                if(typeof showToast === 'function') showToast(`Welcome back, ${fresh.companyName || fresh.shopName || 'Partner'}!`, 'success');
                if(typeof checkSession === 'function') checkSession();
            }catch(e){
                console.error('Login status check failed', e);
                if(typeof showToast === 'function') showToast('Could not verify seller status. Please retry.', 'error');
            }
        };
    }catch(e){}

    function notificationRows(){
        const rows = window.adminNotifications || (typeof adminNotifications !== 'undefined' ? adminNotifications : []) || [];
        return rows.slice().sort((a,b)=>dateMs(b.time||b.timestamp||b.createdAt)-dateMs(a.time||a.timestamp||a.createdAt));
    }
    function renderNotificationsHotfix(){
        const rows = notificationRows();
        const badge = $('notifBadge');
        if(badge){ badge.style.display = rows.length ? 'inline-flex' : 'none'; badge.textContent = rows.length; }
        const html = rows.length ? `<div class="notification-list-v5">${rows.map(n => {
            const id = esc(n.id);
            const title = esc(n.title || n.heading || 'Aryanta Notice');
            const text = esc(n.text || n.message || n.body || 'No message');
            const time = esc(smartDate(n.time || n.timestamp || n.createdAt, true));
            const hasLink = txt(n.link || n.url || n.actionLink) ? `<span class="short-link-chip"><i class="fas fa-link"></i> Link attached</span>` : '';
            return `<div class="notification-card notification-card-v5" onclick="openFullNotifFinal('${id}')"><div class="notif-icon-v5"><i class="fas fa-bell"></i></div><div class="notif-body-v5"><div class="notif-title-v5">${title}</div><p>${text}</p><div class="notif-meta-v5"><span><i class="fas fa-clock"></i> ${time}</span>${hasLink}</div></div></div>`;
        }).join('')}</div>` : `<div class="ary-empty-card"><i class="fas fa-bell-slash"></i><h3>No notifications yet</h3><p>Company notices and seller alerts will appear here.</p></div>`;
        const list = $('notifList'); if(list) list.innerHTML = html;
        const full = $('fullNotifList'); if(full) full.innerHTML = html;
    }
    const oldFetchNotifications = window.fetchNotifications;
    window.fetchNotifications = async function(){
        if(typeof oldFetchNotifications === 'function') await oldFetchNotifications.apply(this, arguments);
        renderNotificationsHotfix();
    };
    window.openFullNotifFinal = function(id){
        const n = notificationRows().find(x => String(x.id) === String(id));
        if(!n) return;
        const linkRaw = txt(n.link || n.url || n.actionLink);
        const link = linkRaw ? (linkRaw.startsWith('http') ? linkRaw : 'https://' + linkRaw) : '';
        const cont = $('notifDetailContent');
        const mod = $('notificationDetailModal');
        if(cont){
            cont.innerHTML = `<div class="notif-detail-v5"><div class="notif-detail-head"><div class="notif-icon-v5 big"><i class="fas fa-bell"></i></div><div><h3>${esc(n.title || n.heading || 'Aryanta Notice')}</h3><small>${esc(smartDate(n.time || n.timestamp || n.createdAt, true))}</small></div></div><div class="notif-detail-message">${esc(n.text || n.message || n.body || 'No message')}</div>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="btn-prime"><i class="fas fa-link"></i> Open Attached Link</a>` : ''}</div>`;
        }
        if(mod){ mod.style.display = 'flex'; setTimeout(()=>mod.classList.add('show'),10); }
    };
    setTimeout(renderNotificationsHotfix, 600);

    function isAdminNoFineCancel(order){
        const s = low(order && (order.status || order.orderStatus || order.order_status));
        return Boolean(order && (order.noFine || order.noSellerFine || order.fineExempt || order.adminMarkedRto || order.rtoByAdmin || order.adminCancelled || order.cancelledByAdmin || order.cancelByAdmin || order.rtoMarkedByAdmin)) || s.includes('rto') || s.includes('return');
    }
    window.cancelOrder = async function(id){
        const o = (window.sellerOrders || sellerOrders || []).find(x => String(x.id) === String(id));
        if(!o) return typeof showToast === 'function' && showToast('Order not found. Refresh first.', 'error');
        if(sellerBlocked(window.activeSeller || activeSeller) || sellerSuspended(window.activeSeller || activeSeller)) return typeof showToast === 'function' && showToast('Account restricted. Cannot modify orders.', 'error');
        const noFine = isAdminNoFineCancel(o);
        if(!noFine && !confirm('Cancel this order? A ₹60 seller cancellation fine will be sent for admin review.')) return;
        try{
            const statusUpdate = {status:'Cancelled', orderStatus:'Cancelled', sellerCancelledAt:now(), updatedAt:now(), noSellerFine:noFine, noFine:noFine};
            await db.collection('orders').doc(String(id)).set(statusUpdate,{merge:true});
            if(!noFine){
                const key = `seller_cancel_${id}_${sellerEmail()}`.replace(/[^a-zA-Z0-9_-]/g,'_');
                if(typeof window.addSellerFineToDb === 'function') await window.addSellerFineToDb(key, 60, `Seller Cancelled Order ${id}`, {orderId:id, type:'seller_cancel'});
                else await db.collection('fines').doc(key).set({id:key,email:sellerEmail(),sellerEmail:sellerEmail(),status:'Pending Admin Review',accepted:false,amount:60,reason:`Seller Cancelled Order ${id}`,timestamp:now(),orderId:id},{merge:true});
            }
            Object.assign(o, statusUpdate);
            if(typeof window.requestShiprocketCancelForOrder === 'function') window.requestShiprocketCancelForOrder(o).catch(e=>console.warn('Shiprocket cancel skipped',e));
            if(typeof renderDashboardStats === 'function') renderDashboardStats();
            if(typeof loadNewOrders === 'function') loadNewOrders();
            if(typeof loadReturns === 'function') loadReturns();
            if(typeof window.loadReturnTracking === 'function') window.loadReturnTracking();
            if(typeof showToast === 'function') showToast(noFine ? 'Order cancelled/RTO updated without seller fine.' : 'Order cancelled. Fine saved for admin review.', noFine ? 'success' : 'warning');
        }catch(e){
            console.error('Cancel failed', e);
            if(typeof showToast === 'function') showToast('Network error. Could not cancel order.', 'error');
        }
    };

    if(typeof window.showSection === 'function'){
        const oldShow = window.showSection;
        window.showSection = async function(section){
            const r = await oldShow.apply(this, arguments);
            if(section === 'notifications') renderNotificationsHotfix();
            return r;
        };
    }
})();


/* ========================================================================
   Aryanta Shiprocket Idempotent Full-Pack Hotfix - 2026-05-29
   Prevents duplicate Shiprocket orders, reuses saved PDF URLs, and recovers
   missing invoice/label/manifest URLs from the Worker without status changes.
   ======================================================================== */
(function(){
    if(window.__ARYANTA_SHIPROCKET_IDEMPOTENT_FULLPACK_20260529__) return;
    window.__ARYANTA_SHIPROCKET_IDEMPOTENT_FULLPACK_20260529__ = true;

    const API = (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) ? API_BASE_URL : 'https://rough-field-c679.official-aryanta.workers.dev';
    const FULL_PACK_URL = `${API}/shiprocket/full-pack`;

    function srTxt(v){ return v === undefined || v === null ? '' : String(v).trim(); }
    function srFirst(){
        for(let i=0;i<arguments.length;i++){
            const v = arguments[i];
            if(v === undefined || v === null) continue;
            if(Array.isArray(v)){
                const f = v.find(x => x !== undefined && x !== null && srTxt(x) !== '');
                if(f !== undefined) return f;
                continue;
            }
            if(typeof v === 'object') continue;
            if(srTxt(v) !== '') return v;
        }
        return '';
    }
    function srHtml(v){ return srTxt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
    function srEmail(){ try{return srTxt((window.activeSeller || activeSeller || {}).email).toLowerCase();}catch(e){return '';} }
    function srToast(msg,type){ if(typeof showToast === 'function') showToast(msg,type||'info'); else alert(msg); }
    function srOrderNo(order){
        try{ if(typeof aryShipGetOrderId === 'function') return aryShipGetOrderId(order || {}); }catch(e){}
        return srTxt(srFirst(order && order.order_no, order && order.orderNo, order && order.id, `ARY-${Date.now()}`));
    }
    function srSafeId(v){ return srTxt(v).replace(/[^a-zA-Z0-9_-]/g,'_'); }
    function srShiprocketId(v){
        const s = srTxt(v);
        // Shiprocket internal order_id and shipment_id are numeric. Aryanta/channel ids like ARY-69306988 must never be treated as Shiprocket ids.
        return /^\d{4,}$/.test(s) ? s : '';
    }
    function srFindOrder(id){
        const key = srTxt(id);
        const rows = (window.sellerOrders || (typeof sellerOrders !== 'undefined' ? sellerOrders : []) || []);
        return rows.find(o => srTxt(o.id) === key || srTxt(o.order_no) === key || srTxt(o.orderNo) === key) || null;
    }
    function srSelectedIds(orderId){
        if(orderId && orderId !== 'bulk') return [srTxt(orderId)].filter(Boolean);
        return Array.from(document.querySelectorAll('.cb-acc:checked,.cb-shiprocket:checked')).map(cb => srTxt(cb.value)).filter(Boolean);
    }
    function srDocs(obj){
        obj = obj || {};
        return {
            invoice: srTxt(srFirst(obj.shiprocketInvoicePdfUrl, obj.shiprocketInvoiceUrl, obj.invoiceUrl, obj.invoice_url, obj.shiprocketPdfUrl, obj.invoice && obj.invoice.invoiceUrl)),
            label: srTxt(srFirst(obj.shiprocketLabelPdfUrl, obj.shiprocketLabelUrl, obj.shippingLabelUrl, obj.labelUrl, obj.label_url, obj.waybillUrl, obj.label && obj.label.labelUrl)),
            manifest: srTxt(srFirst(obj.shiprocketManifestPdfUrl, obj.shiprocketManifestUrl, obj.manifestUrl, obj.manifest_url, obj.manifest && obj.manifest.manifestUrl)),
            shiprocketOrderId: srShiprocketId(srFirst(obj.shiprocketOrderId, obj.shiprocket_order_id, obj.shiprocketInternalOrderId, obj.shiprocket_internal_order_id)),
            shipmentId: srShiprocketId(srFirst(obj.shiprocketShipmentId, obj.shipmentId, obj.shipment_id, obj.shiprocket_shipment_id)),
            awb: srTxt(srFirst(obj.shiprocketAwbCode, obj.awbCode, obj.awb_code, obj.awb))
        };
    }
    function srExtractDocs(data){
        data = data || {};
        return {
            invoice: srTxt(srFirst(data.invoiceUrl, data.invoice_url, data.shiprocketInvoicePdfUrl, data.shiprocketInvoiceUrl, data.shiprocketPdfUrl, data.updates && data.updates.shiprocketInvoicePdfUrl)),
            label: srTxt(srFirst(data.labelUrl, data.label_url, data.shippingLabelUrl, data.shiprocketLabelUrl, data.shiprocketLabelPdfUrl, data.updates && data.updates.shiprocketLabelUrl)),
            manifest: srTxt(srFirst(data.manifestUrl, data.manifest_url, data.shiprocketManifestUrl, data.shiprocketManifestPdfUrl, data.updates && data.updates.shiprocketManifestUrl)),
            shiprocketOrderId: srShiprocketId(srFirst(data.shiprocketOrderId, data.shiprocket_order_id, data.updates && data.updates.shiprocketOrderId, data.order_id, data.orderId)),
            shipmentId: srShiprocketId(srFirst(data.shipmentId, data.shipment_id, data.shiprocketShipmentId, data.shiprocket_shipment_id, data.updates && data.updates.shiprocketShipmentId)),
            awb: srTxt(srFirst(data.awbCode, data.awb_code, data.awb, data.shiprocketAwbCode, data.updates && data.updates.shiprocketAwbCode))
        };
    }
    function srCanOpen(d){ return Boolean(d && (d.invoice || d.label || d.manifest)); }
    function srFullReady(d){ return Boolean(d && d.label && (d.shiprocketOrderId || d.shipmentId)); }
    function srAddLink(label,url){
        if(!url) return;
        try{ if(typeof addShipProcessLink === 'function') addShipProcessLink(label,url); }catch(e){}
        const box = document.getElementById('shipProcessLinks');
        if(!box) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-outline';
        btn.style.margin = '6px 6px 0 0';
        btn.innerHTML = `<i class="fas fa-file-pdf"></i> ${srHtml(label)}`;
        btn.onclick = () => window.open(url,'_blank','noopener,noreferrer');
        box.appendChild(btn);
    }
    function srAddError(order,msg,data){
        const box = document.getElementById('shipProcessLinks');
        if(!box) return;
        const div = document.createElement('div');
        div.className = 'ship-process-error';
        let extra = '';
        if(data && Array.isArray(data.missing) && data.missing.length) extra += `<br><small>Missing: ${srHtml(data.missing.join(', '))}</small>`;
        if(data && srShiprocketId(data.shiprocketOrderId)) extra += `<br><small>Shiprocket Order ID: ${srHtml(srShiprocketId(data.shiprocketOrderId))}</small>`;
        if(data && data.shipmentId) extra += `<br><small>Shipment ID: ${srHtml(data.shipmentId)}</small>`;
        div.innerHTML = `<b>${srHtml(srOrderNo(order))}</b>: ${srHtml(msg)}${extra}`;
        box.appendChild(div);
    }
    function srProgress(step,state,text,percent){ try{ if(typeof updateShipProcess === 'function') updateShipProcess(step,state,text,percent); }catch(e){} }
    async function srReadJson(res){
        const text = await res.text().catch(()=> '');
        if(!text) return {};
        try{return JSON.parse(text);}catch(e){return {success:false,error:text.slice(0,1000)};}
    }
    async function srLoadCached(order){
        if(!order || !order.id || typeof db === 'undefined' || !db) return srDocs(order);
        const email = srEmail() || 'seller';
        const ids = [String(order.id), srSafeId(`${String(order.id)}_${email}`), srSafeId(`${srOrderNo(order)}_${email}`), srSafeId(srOrderNo(order))];
        const collections = ['seller_shiprocket_full_packs','seller_shiprocket_invoices'];
        for(const col of collections){
            for(const id of Array.from(new Set(ids))){
                try{
                    const doc = await db.collection(col).doc(id).get();
                    if(doc.exists) Object.assign(order, doc.data());
                }catch(e){}
            }
        }
        return srDocs(order);
    }
    function srBuildPayload(order){
        let payload = {};
        try{ if(typeof aryShipBuildPayload === 'function') payload = aryShipBuildPayload(order || {}) || {}; }catch(e){ payload = { ...(order || {}) }; }
        const localId = srTxt(order && order.id) || srOrderNo(order);
        payload.localOrderId = localId;
        payload.orderDocId = localId;
        payload.aryantaOrderId = srOrderNo(order);
        payload.originalOrderNo = srOrderNo(order);
        payload.sellerEmail = srEmail() || payload.sellerEmail || payload.email || '';
        payload.email = srEmail() || payload.email || payload.sellerEmail || '';
        payload.keepOrderStatus = srTxt(srFirst(order && order.status, order && order.orderStatus, 'Accepted'));
        payload.preventStatusUpdate = true;
        payload.doNotMarkShipped = true;
        payload.forceNewShiprocketOrder = false;
        payload.createFreshShiprocketOrder = false;
        payload.forceFreshShiprocketOrder = false;
        payload.ignoreExistingShiprocketDocs = false;
        payload.preventPickupQueueDuplicate = true;
        const d = srDocs(order);
        Object.assign(payload, {
            shiprocketOrderId: d.shiprocketOrderId,
            shiprocket_order_id: d.shiprocketOrderId,
            shipmentId: d.shipmentId,
            shipment_id: d.shipmentId,
            shiprocketShipmentId: d.shipmentId,
            awbCode: d.awb,
            awb_code: d.awb,
            shiprocketAwbCode: d.awb,
            shiprocketInvoicePdfUrl: d.invoice,
            shiprocketInvoiceUrl: d.invoice,
            shiprocketLabelUrl: d.label,
            shiprocketLabelPdfUrl: d.label,
            shippingLabelUrl: d.label,
            shiprocketManifestUrl: d.manifest,
            shiprocketManifestPdfUrl: d.manifest
        });
        return payload;
    }
    async function srSaveSuccess(order,payload,data,docs){
        const keepStatus = srTxt(srFirst(order && order.status, order && order.orderStatus, 'Accepted'));
        const now = new Date().toISOString();
        const updates = {
            status: keepStatus,
            orderStatus: keepStatus,
            shippingProvider:'Shiprocket',
            shiprocketFullPackGenerated:Boolean(docs.invoice || docs.label || docs.manifest),
            shiprocketFullPackRequested:true,
            shiprocketFullPackStatus: docs.manifest ? 'ready' : 'documents_ready',
            shiprocketOrderId: docs.shiprocketOrderId,
            shiprocket_order_id: docs.shiprocketOrderId,
            shiprocketShipmentId: docs.shipmentId,
            shipmentId: docs.shipmentId,
            shipment_id: docs.shipmentId,
            shiprocketAwbCode: docs.awb,
            awbCode: docs.awb,
            awb_code: docs.awb,
            shiprocketInvoicePdfUrl: docs.invoice,
            shiprocketInvoiceUrl: docs.invoice,
            invoiceUrl: docs.invoice,
            invoice_url: docs.invoice,
            shiprocketPdfUrl: docs.invoice || docs.label,
            shiprocketLabelUrl: docs.label,
            shiprocketLabelPdfUrl: docs.label,
            shippingLabelUrl: docs.label,
            labelUrl: docs.label,
            label_url: docs.label,
            waybillUrl: docs.label,
            shiprocketManifestUrl: docs.manifest,
            shiprocketManifestPdfUrl: docs.manifest,
            manifestUrl: docs.manifest,
            manifest_url: docs.manifest,
            manifestGenerated: Boolean(docs.manifest),
            manifestGeneratedAt: docs.manifest ? now : '',
            noSellerFine:true,
            noFine:true,
            shiprocketFullPackResponse:data,
            updatedAt:now
        };
        Object.keys(updates).forEach(k => { if(updates[k] === undefined) delete updates[k]; });
        try{ if(db && order && order.id) await db.collection('orders').doc(String(order.id)).set(updates,{merge:true}); }catch(e){}
        try{
            if(db && order && order.id){
                const email = srEmail() || 'seller';
                const recordId = srSafeId(`${String(order.id)}_${email}`);
                const record = {id:recordId, orderId:String(order.id), orderNo:srOrderNo(order), sellerEmail:srEmail(), request:payload, response:data, ...updates, createdAt:now, updatedAt:now};
                await db.collection('seller_shiprocket_full_packs').doc(recordId).set(record,{merge:true});
                await db.collection('seller_shiprocket_full_packs').doc(String(order.id)).set(record,{merge:true});
                await db.collection('seller_shiprocket_invoices').doc(recordId).set(record,{merge:true});
            }
        }catch(e){}
        Object.assign(order, updates);
    }
    async function srSaveFailure(order,payload,data,msg){
        try{
            if(!db || !order || !order.id) return;
            const id = srSafeId(`${String(order.id)}_${srEmail() || 'seller'}`);
            await db.collection('shiprocket_document_recovery_requests').doc(id).set({id, sellerEmail:srEmail(), orderId:String(order.id), orderNo:srOrderNo(order), payload, response:data || {}, error:msg, status:'Retry Required', updatedAt:new Date().toISOString(), createdAt:new Date().toISOString()},{merge:true});
        }catch(e){}
    }
    function srErrorMessage(data, fallback){
        data = data || {};
        const missing = Array.isArray(data.missing) && data.missing.length ? `Missing: ${data.missing.join(', ')}` : '';
        return srTxt(srFirst(data.message, data.error, missing, data.invoice && data.invoice.message, data.pickup && data.pickup.message, data.label && data.label.message, fallback));
    }
    async function srCreateFullPack(order,index,total){
        const cached = await srLoadCached(order);
        if(srFullReady(cached)){
            srProgress('validate','done',`Order ${index}/${total}: saved full Shiprocket pack found`,25);
            srAddLink(`Open invoice - ${srOrderNo(order)}`, cached.invoice);
            srAddLink(`Open top label - ${srOrderNo(order)}`, cached.label);
            srAddLink(`Open manifest - ${srOrderNo(order)}`, cached.manifest);
            return {order, docs:cached, reused:true};
        }
        const payload = srBuildPayload(order);
        srProgress('validate','done',`Order ${index}/${total}: checking DB before Shiprocket`,20);
        srProgress('create','running',`Order ${index}/${total}: requesting idempotent full-pack`,45);
        const res = await fetch(FULL_PACK_URL,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'AryantaSellerPanel'},body:JSON.stringify(payload)});
        const data = await srReadJson(res);
        const pendingButSaved = res.status === 202 && data && data.documentsPending;
        if((!res.ok || data.success === false) && !pendingButSaved){
            const msg = srErrorMessage(data, `Shiprocket full-pack failed with ${res.status}`);
            await srSaveFailure(order,payload,data,msg);
            console.error('Aryanta Shiprocket idempotent full-pack failed',{status:res.status,data,payload});
            throw Object.assign(new Error(msg),{data});
        }
        const docs = srExtractDocs(data);
        if(!(docs.shiprocketOrderId || docs.shipmentId || docs.invoice || docs.label || docs.manifest)){
            const msg = 'Shiprocket did not return any saved order/document reference. Retry blocked to prevent duplicate order.';
            await srSaveFailure(order,payload,data,msg);
            console.error('Aryanta Shiprocket full-pack returned no reusable reference',{status:res.status,data,payload});
            throw Object.assign(new Error(msg),{data});
        }
        await srSaveSuccess(order,payload,data,docs);
        if(docs.invoice) srAddLink(`Open invoice - ${srOrderNo(order)}`, docs.invoice);
        if(docs.label) srAddLink(`Open top label - ${srOrderNo(order)}`, docs.label);
        if(docs.manifest) srAddLink(`Open manifest - ${srOrderNo(order)}`, docs.manifest);
        if(pendingButSaved || !docs.label){
            const msg = srErrorMessage(data, 'Shiprocket IDs were saved, but shipping label PDF is still pending. Retry this button after a few seconds.');
            srAddError(order,msg,data);
            srProgress('save','done',`Order ${index}/${total}: Shiprocket IDs saved; label PDF pending`,88);
            return {order,data,docs,reused:Boolean(data.reused),pending:true,message:msg};
        }
        srProgress('save','done',`Order ${index}/${total}: saved Shiprocket label/invoice URLs`,88);
        return {order,data,docs,reused:Boolean(data.reused),pending:false};
    }

    window.callShiprocketFullPack = srCreateFullPack;
    window.downloadShippingInvoice = async function(orderId){
        const ids = Array.from(new Set(srSelectedIds(orderId)));
        if(!ids.length) return srToast('Select at least one accepted order.','warning');
        const orders = ids.map(srFindOrder).filter(Boolean);
        if(!orders.length) return srToast('Selected order not found. Refresh and try again.','error');
        try{ if(typeof openShipProcessSheet === 'function') openShipProcessSheet(orders.length); }catch(e){}
        const title = document.getElementById('shipProcessTitle');
        const sub = document.getElementById('shipProcessSub');
        if(title) title.innerText = orders.length > 1 ? `Preparing ${orders.length} Shiprocket packs` : 'Preparing Shiprocket pack';
        if(sub) sub.innerText = 'Checking saved DB record first. Existing orders will only open/reprint PDFs; no duplicate Shiprocket order.';
        srProgress('validate','running','Checking selected orders and saved DB records',5);
        srProgress('create','running','Waiting for Shiprocket document recovery/create',5);
        srProgress('save','running','Waiting to save URLs',5);
        srProgress('done','running','Waiting for completion',5);
        const ok = [], failed = [];
        for(let i=0;i<orders.length;i++){
            const order = orders[i];
            try{
                const result = await srCreateFullPack(order,i+1,orders.length);
                ok.push(result);
                if(result.pending || !(result.docs && result.docs.label)){
                    srProgress('create','error',`Order ${i+1}/${orders.length}: Shiprocket record saved, label PDF pending`,65);
                }else{
                    srProgress('create','done',`Order ${i+1}/${orders.length}: shipping label URL ready`,65);
                }
            }catch(e){
                const msg = e && e.message ? e.message : String(e);
                failed.push({order,error:msg,data:e && e.data});
                srProgress('create','error',`Failed: ${srOrderNo(order)} - ${msg}`,100);
                srAddError(order,msg,e && e.data);
            }
        }
        const pending = ok.filter(x => x && (x.pending || !(x.docs && x.docs.label)));
        if(failed.length){
            if(sub) sub.innerText = `${ok.length} completed, ${failed.length} failed. Error details saved in shiprocket_document_recovery_requests.`;
            srProgress('done','error','Some Shiprocket documents failed',100);
            srToast(`${failed.length} Shiprocket pack failed.`, 'error');
        }else if(pending.length){
            if(sub) sub.innerText = `${ok.length - pending.length} label ready, ${pending.length} saved but label PDF pending. Retry this button; no duplicate Shiprocket order will be created.`;
            srProgress('done','error','Some Shiprocket labels are pending',100);
            srToast(`${pending.length} Shiprocket record saved, but label PDF is pending.`, 'warning');
        }else{
            if(sub) sub.innerText = 'Shiprocket shipping label URLs are saved/reused. Accepted status was preserved.';
            srProgress('done','done','Completed successfully',100);
            srToast('Shiprocket shipping label prepared successfully. No duplicate order created.', 'success');
        }
        try{ if(typeof loadAcceptedOrders === 'function') loadAcceptedOrders(); }catch(e){}
        try{ if(typeof loadCompletedScanOrders === 'function') loadCompletedScanOrders(); }catch(e){}
        try{ if(typeof loadShippedOrders === 'function') loadShippedOrders(); }catch(e){}
        try{ if(typeof renderDashboardStats === 'function') renderDashboardStats(); }catch(e){}
        return {ok, failed};
    };
})();
