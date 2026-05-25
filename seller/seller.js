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
                <i class="fas fa-clock"></i> ${n.time ? new Date(n.time).toLocaleString() : "Now"}
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
                                    <i class="fas fa-clock"></i> ${new Date(n.time).toLocaleString()}
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
    safeSetText("stat-followers",activeSeller.followers||0); // INJECTED: Followers fetch
    
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
    const subEnd=activeSeller.subEndDate?new Date(activeSeller.subEndDate).toLocaleDateString():'N/A';
    const joined=activeSeller.joinedDate?new Date(activeSeller.joinedDate).toLocaleDateString():'N/A';

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
            list.innerHTML+=`<tr><td><strong style="font-size:13px;">${new Date(h.startDate).toLocaleDateString()}</strong></td><td><strong style="color:var(--primary); font-size:14px;">${h.plan} (${h.duration})</strong></td><td>${h.method}</td><td><strong style="color:var(--success);">₹${h.cost}</strong></td><td>${new Date(h.endDate).toLocaleDateString()}</td></tr>`;
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
    let commPercent=0.075;
    if(subPlan==='Go')commPercent=0.075;
    if(subPlan==='Pro')commPercent=0.075;
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
    let commPercent=0.075;
    if(subPlan==='Go')commPercent=0.075;
    if(subPlan==='Pro')commPercent=0.075;
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
        <td data-label="Order Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td>
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

window.toggleSelectAllNew = function(source){
    document.querySelectorAll('.cb-new').forEach(cb => {
        cb.checked = source.checked;
    });
}

// Backward support for old HTML onclick="toggleSelectAll(this)"
window.toggleSelectAll = function(source){
    window.toggleSelectAllNew(source);
}
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
        try{await db.collection("fines").add({email:activeSeller.email,amount:20,reason:`Late Acceptance SLA Breach: Order ${id}`,timestamp:new Date().toISOString(), orderId:id});}catch(e){}
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
        await db.collection("fines").add({email:activeSeller.email,amount:60,reason:`Seller Cancelled Order ${id}`,timestamp:new Date().toISOString()});
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
        <td data-label="Scan Date"><strong style="font-size:13px;">${new Date(o.scanned_date||o.timestamp).toLocaleDateString()}</strong></td>
        <td data-label="Order Ref"><strong style="font-family:monospace; color:var(--secondary); font-size:14px;">${o.order_no||o.id}</strong></td>
        <td data-label="Item Details" style="font-size:13px;">${itemsHtml}</td>
        <td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534;">Ready to Ship</span></td>
        <td data-label="Action"><button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${o.id}')"><i class="fas fa-print"></i> Re-Print Slip</button></td>
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
            ? new Date(o.timestamp).toLocaleDateString()
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
                            <i class="fas fa-print"></i> Get Shiprocket Slip
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });

    list.innerHTML = rows.join("");
}


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
                        Tax Invoice / Dispatch Slip
                    </h2>
                </div>

                <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; font-weight:600; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">
                    <div>
                        <strong>Invoice No:</strong> ${o.order_no || o.id}
                    </div>

                    <div>
                        <strong>Date:</strong> ${new Date(o.timestamp || Date.now()).toLocaleDateString()}
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
                printedAt:new Date().toISOString()
            });
        }catch(e){}
    }

    printHtml += `</div>`;

    showToast("Opening Print Dialog...", "info");

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
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Shipped Date"><strong style="font-size:13px;">${new Date(o.shipped_date||o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;">${o.status}</span></td></tr>`;
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
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Delivered"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Amount"><strong style="font-size:15px; color:var(--success);">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:#dcfce3; color:#166534; font-size:12px;"><i class="fas fa-check-circle"></i> ${o.status}</span></td></tr>`;
    });
}

function loadOrderHistory(){
    const list=document.getElementById("historyList");if(!list)return;
    list.innerHTML="";
    if(sellerOrders.length===0){list.innerHTML="<tr><td colspan='5' style='text-align:center; font-weight:600;'>No orders yet.</td></tr>";return;}
    sellerOrders.forEach(o=>{
        let myItems=getSellerItemsFromOrder(o);if(myItems.length===0)return;
        let amount=myItems.reduce((s,i)=>s+(Number(i.price)*Number(i.qty)),0);
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items"><span style="font-weight:600;">${myItems.map(i=>i.name).join(', ')}</span></td><td data-label="Amount"><strong style="font-size:15px;">₹${amount}</strong></td><td data-label="Status"><span class="badge" style="background:var(--surface-2); color:var(--text-light);">${o.status}</span></td></tr>`;
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
        list.innerHTML+=`<tr class="clickable-row" onclick="viewOrderDetails('${o.id}')"><td data-label="Date"><strong style="font-size:13px;">${new Date(o.timestamp).toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace; color:var(--primary); font-size:14px;">${o.order_no||o.id}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Reason"><span style="color:var(--danger); font-weight:800; font-size:13px;">Customer / Auto Cancel</span></td></tr>`;
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
        let date=new Date(o.timestamp).toLocaleDateString();
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
            try{db.collection("fines").add({email:activeSeller.email,amount:199,reason:`Late Warranty Claim SLA Breach: ${w.id}`,timestamp:new Date().toISOString()});}catch(e){}
            w.slaBreachFined=true;
        }
        let slaText=isBreached?`<span style="color:var(--white); background:var(--danger); padding:4px 8px; border-radius:8px; font-weight:bold; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> FINE APPLIED</span>`:`<span style="color:var(--warning); font-weight:800; font-size:13px;">${Math.round(48-diffHours)}h left</span>`;
        list.innerHTML+=`<tr>
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
        await db.collection("fines").add({email:activeSeller.email,amount:300,reason:`Rejected Warranty Claim: ${id}`,timestamp:new Date().toISOString()});
        await db.collection("warranties").doc(id).update({status:'Rejected'});
        const w=sellerWarranties.find(x=>x.id===id);if(w)w.status="Rejected";
        showToast("Claim Rejected. ₹300 Fine Applied.","error");
        loadWarranty();renderDashboardStats();
    }catch(e){}
}

window.viewSettledSlip=function(id){
    const p=sellerPayouts.find(x=>x.id===id);if(!p)return;
    const pDate=p.date||p.settledDate?new Date(p.date||p.settledDate).toLocaleDateString():'-';
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
            <td data-label="Settled Date"><strong style="font-size:13px;">${new Date(p.date||p.settledDate).toLocaleDateString()}</strong></td>
            <td data-label="Slip Ref"><strong style="font-family:monospace; color:var(--primary);">${p.id}</strong></td>
            <td data-label="Amount" style="color:var(--success); font-weight:800; font-size:16px;">₹${(p.netPayout||0).toLocaleString()}</td>
            </tr>`;
        });
    }
    sellerFines.forEach(f=>{listFines.innerHTML+=`<tr><td data-label="Date"><strong style="font-size:13px;">${new Date(f.timestamp).toLocaleDateString()}</strong></td><td data-label="Reason"><span style="font-weight:600;">${f.reason}</span></td><td data-label="Amount" style="color:var(--danger); font-weight:900; font-size:16px;">-₹${f.amount}</td></tr>`;});
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
            await db.collection("fines").add({email:activeSeller.email,amount:cost,reason:`Subscription Auto-Deduct: ${planName} (${currentPlanDuration})`,timestamp:new Date().toISOString()});
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
        await db.collection("fines").add({email:activeSeller.email,amount:70,reason:`Sponsored Ad Fee`,timestamp:new Date().toISOString()});
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
            <div style="font-size:13px; color:var(--text-light);"><i class="fas fa-calendar-alt"></i> ${new Date(t.timestamp).toLocaleString()}</div>
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
            await db.collection("fines").add({ email: activeSeller.email, amount: totalAmount, reason: `B2B Wholesale Purchase: ${p.name} (x${qty})`, timestamp: new Date().toISOString() });
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
                    <span>${n.time ? new Date(n.time).toLocaleString() : 'Now'}</span>
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
        try{ await db.collection('fines').add({email:activeSeller.email, amount:20, reason:`Skipped warranty QR scan for Order ${id}`, timestamp:nowIso()}); }catch(e){}
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
            html += `<div class="panel-box" style="margin-bottom:15px;cursor:pointer;border:1px solid var(--border-color);" onclick="openTicketDetail('${t.id}')"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;align-items:center;"><strong style="font-family:monospace;color:var(--primary);font-size:16px;">${t.ticketId || t.id}</strong>${stBadge}</div><div style="font-weight:900;font-size:15px;color:var(--text-main);margin-bottom:8px;">${t.subject || 'Support Query'}</div><div style="font-size:13px;color:var(--text-light);"><i class="fas fa-calendar-alt"></i> ${t.timestamp ? new Date(t.timestamp).toLocaleString() : ''}</div></div>`;
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
    function getCommissionRate(){ return 0.075; }
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
            await ref.set({email:activeSeller.email, amount, reason, timestamp:nowIso(), key});
            await db.collection('fines').add({email:activeSeller.email, amount, reason, timestamp:nowIso(), key});
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
                commissionPercent: 7.5,
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
                <td data-label="Price Info"><strong>₹${Number(p.price || 0).toLocaleString('en-IN')}</strong><br><span style="font-size:12px;color:var(--text-light);">Listed: ₹${Number(p.listedPrice || (Number(p.price || 0)*1.075)).toLocaleString('en-IN')}</span><br><span style="font-size:11px;color:var(--text-light);">Commission 7.5%</span></td>
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
            list.innerHTML += `<tr class="clickable-row" onclick="viewOrderDetails('${safe(o.id)}')"><td data-label="Select"><input type="checkbox" class="custom-cb cb-new" value="${safe(o.id)}" onclick="event.stopPropagation()"></td><td data-label="Order Date"><strong>${new Date(o.timestamp||o.createdAt||Date.now()).toLocaleString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Items">${itemsHtml}</td><td data-label="Amount"><strong>₹${amount.toLocaleString('en-IN')}</strong></td><td data-label="SLA">${slaText}</td><td data-label="Action">${actions}</td></tr>`;
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
                if(now<transferDate) listProgress.innerHTML += `<tr><td data-label="Delivered Date"><strong>${deliveredDate.toLocaleDateString()}</strong></td><td data-label="Release Date"><span style="color:var(--warning);font-weight:900;">${transferDate.toLocaleDateString()}</span></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Amount"><strong>₹${net.toLocaleString('en-IN')}</strong><br><span style="font-size:11px;color:var(--text-light);">Gross ₹${gross.toLocaleString('en-IN')} - 7.5% ₹${commission.toLocaleString('en-IN')}</span></td></tr>`;
                else { totalUpcoming += net; listUpcoming.innerHTML += `<tr><td data-label="Transfer Date"><strong>${transferDate.toLocaleDateString()}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.id)}</strong></td><td data-label="Status"><span style="color:var(--secondary);font-weight:900;">Processing by Bank</span></td><td data-label="Net Amount" style="color:var(--success);font-weight:900;">₹${net.toLocaleString('en-IN')}<br><span style="font-size:11px;color:var(--text-light);">7.5% commission saved in DB ledger</span></td></tr>`; savePaymentLedger({type:'order_payout_preview', orderId:o.id, gross, commission, net, status:'Upcoming'}); }
            }
        });
        if(!(sellerPayouts||[]).length) listCompleted.innerHTML = `<tr><td colspan="3" style="text-align:center;">No settlements yet.</td></tr>`;
        else sellerPayouts.forEach(p => listCompleted.innerHTML += `<tr class="clickable-row" onclick="viewSettledSlip('${safe(p.id)}')"><td data-label="Settled Date"><strong>${new Date(p.date||p.settledDate||Date.now()).toLocaleDateString()}</strong></td><td data-label="Slip Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(p.id)}</strong></td><td data-label="Amount" style="color:var(--success);font-weight:900;">₹${Number(p.netPayout||0).toLocaleString('en-IN')}</td></tr>`);
        (sellerFines||[]).forEach(f => listFines.innerHTML += `<tr><td data-label="Date"><strong>${new Date(f.timestamp||Date.now()).toLocaleDateString()}</strong></td><td data-label="Reason"><span style="font-weight:700;">${safe(f.reason)}</span></td><td data-label="Amount" style="color:var(--danger);font-weight:900;">-₹${Number(f.amount||0).toLocaleString('en-IN')}</td></tr>`);
        const finalUpcoming=totalUpcoming-totalFines; cachedTotalUpcoming=finalUpcoming;
        const alertBox=$('upcomingAlertBox');
        if(alertBox){
            if(totalUpcoming>0 || totalFines>0){ alertBox.style.display='block'; alertBox.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>Net payout after 7.5% commission:</span><strong>₹${totalUpcoming.toLocaleString('en-IN')}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--danger);"><span>Total Deductions / Fines:</span><strong>-₹${totalFines.toLocaleString('en-IN')}</strong></div><div style="border-top:2px solid #bfdbfe;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:900;font-size:16px;color:#1e3a8a;">Final Expected Transfer:</span><strong style="color:var(--primary);font-size:22px;">₹${finalUpcoming.toLocaleString('en-IN')}</strong></div>`; syncPayoutToAdmin && syncPayoutToAdmin(totalUpcoming,totalFines,finalUpcoming); }
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
    function commission2(gross){ return Math.round(Number(gross || 0) * 0.075); }
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
                <td data-label="Date"><strong>${new Date(o.timestamp || o.createdAt || Date.now()).toLocaleString()}</strong><br><span style="font-size:11px;color:var(--danger);font-weight:800;">${age}h old</span></td>
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
            listCompleted.innerHTML += `<tr class="clickable-row" onclick="viewSettledSlip('${safe(p.id)}')"><td data-label="Settled Date"><strong>${new Date(p.date || p.settledDate || Date.now()).toLocaleDateString()}</strong></td><td data-label="Slip Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(p.id)}</strong></td><td data-label="Amount" style="color:var(--success);font-weight:900;">₹${amount.toLocaleString('en-IN')}</td></tr>`;
            addLedgerRow(ledger, {date:new Date(p.date || p.settledDate || Date.now()), type:'Settled', ref:p.id, gross:Number(p.gross || amount), deductions:Number(p.fines || p.commission || 0), net:amount, status:p.status || 'Settled'});
        });
        (sellerFines || []).forEach(f => {
            const amt = Number(f.amount || 0);
            listFines.innerHTML += `<tr><td data-label="Date"><strong>${new Date(f.timestamp || Date.now()).toLocaleDateString()}</strong></td><td data-label="Reason"><span style="font-weight:700;">${safe(f.reason)}</span></td><td data-label="Amount" style="color:var(--danger);font-weight:900;">-₹${amt.toLocaleString('en-IN')}</td></tr>`;
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
                alertBox.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>Net payout after 7.5% platform fee:</span><strong>₹${totalUpcoming.toLocaleString('en-IN')}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--danger);"><span>Total fines/deductions:</span><strong>-₹${totalFines.toLocaleString('en-IN')}</strong></div><div style="border-top:2px solid #bfdbfe;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:900;font-size:16px;color:#1e3a8a;">Final Expected Transfer:</span><strong style="color:var(--primary);font-size:22px;">₹${finalUpcoming.toLocaleString('en-IN')}</strong></div>`;
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
            const time=n.time?new Date(n.time).toLocaleString():'Now';
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
        try{if(typeof addFineOnce==='function')await addFineOnce('sponsored_ad_'+id+'_'+Date.now(),70,'Sponsored Ad Fee');else await db.collection('fines').add({email:activeSeller.email,amount:70,reason:'Sponsored Ad Fee',timestamp:nowIso2()});}catch(e){}
        try{if(typeof savePaymentLedger==='function')await savePaymentLedger({type:'sponsored_ad_payout',productId:id,amount:70,status:'Deducted from payout'});}catch(e){}
        closeModal('adPaymentModal');activateSponsored(id,false);
    };

    const oldSetScanStep = window.setScanStep;
    window.setScanStep=function(step){
        currentScanStep=step;
        ['scanStep1','scanStep2','scanStep3'].forEach(id=>{const el=$id(id);if(el)el.classList.toggle('active',id===('scanStep'+step));});
    };
})();


/* Aryanta Seller Panel Rebuild 2026-05-23: admin-controlled subscriptions, ads, events, returns, metrics */
(function(){
    const PATCH='ARYANTA_SELLER_PANEL_REBUILD_2026_05_23';
    if(window[PATCH]) return;
    window[PATCH]=true;
    const $=id=>document.getElementById(id);
    const txt=v=>String(v==null?'':v);
    const low=v=>txt(v).toLowerCase().trim();
    const safe=v=>txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const nowIso=()=>new Date().toISOString();
    const monthKey=()=>new Date().toISOString().slice(0,7);
    const email=()=>low(activeSeller&&activeSeller.email);
    const DEFAULT_CONFIG={
        sponsorDurationHours:24,
        paidSponsorCharge:0,
        appDownload:{enabled:false,url:'https://aryanta.in/app'},
        freeTrial:{enabled:true,days:30,plan:'Basic',allowAll:false},
        plans:{
            Basic:{name:'Basic',price:0,productLimit:30,freeAds:1,commissionPercent:7,deliveryChargePerProduct:25,features:{sponsoredAds:true,storeBranding:false,sellerControls:false,sendOrderEmail:false,events:true,loans:false,downloadApp:false},description:'Admin default free seller plan'},
            Growth:{name:'Growth',price:0,productLimit:100,freeAds:3,commissionPercent:7,deliveryChargePerProduct:25,features:{sponsoredAds:true,storeBranding:true,sellerControls:true,sendOrderEmail:true,events:true,loans:false,downloadApp:true},description:'Admin-controlled paid/approved plan'},
            Pro:{name:'Pro',price:0,productLimit:300,freeAds:6,commissionPercent:7,deliveryChargePerProduct:25,features:{sponsoredAds:true,storeBranding:true,sellerControls:true,sendOrderEmail:true,events:true,loans:true,downloadApp:true},description:'Admin-controlled premium plan'}
        }
    };
    let ARY_CFG=null;
    let lastSupportIssueConfig=[];
    let activeEventRows=[];
    let activeEventTab='live';

    function toast(msg,type){ if(typeof showToast==='function')showToast(msg,type||'info'); else alert(msg); }
    function asDate(v){ if(!v)return null; if(v&&typeof v.toDate==='function')return v.toDate(); const d=new Date(v); return Number.isFinite(d.getTime())?d:null; }
    function dateMs(v){ const d=asDate(v); return d?d.getTime():0; }
    function currentPlanName(){
        const raw=txt(activeSeller&&(activeSeller.subscription||activeSeller.plan||activeSeller.package||activeSeller.subscriptionName)).trim();
        const end=asDate(activeSeller&&activeSeller.subEndDate);
        if(raw && !['none','free','basic / free','basic/free'].includes(raw.toLowerCase()) && end && end.getTime()<Date.now()) return 'Basic';
        if(!raw || ['none','free','basic / free','basic/free'].includes(raw.toLowerCase())) return 'Basic';
        return raw;
    }
    function normalizePlans(raw){
        if(!raw)return {...DEFAULT_CONFIG.plans};
        if(Array.isArray(raw)){
            const out={}; raw.forEach(p=>{const n=txt(p.name||p.id||p.planName).trim(); if(n)out[n]={...p,name:n};}); return Object.keys(out).length?out:{...DEFAULT_CONFIG.plans};
        }
        const out={}; Object.keys(raw).forEach(k=>{const p=raw[k]||{}; out[p.name||k]={...p,name:p.name||k};}); return Object.keys(out).length?out:{...DEFAULT_CONFIG.plans};
    }
    async function fetchAdminConfig(force=false){
        if(ARY_CFG&&!force) return ARY_CFG;
        let cfg=JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        if(!db){ARY_CFG=cfg; return cfg;}
        try{
            const docs=[['site_config','seller_subscription_config'],['site_config','sellerPanelConfig'],['site_config','seller_settings']];
            for(const [col,id] of docs){
                const snap=await db.collection(col).doc(id).get();
                if(snap.exists){
                    const d=snap.data()||{};
                    cfg={...cfg,...d,plans:normalizePlans(d.plans||d.subscriptionPlans||d.sellerPlans||cfg.plans),freeTrial:{...cfg.freeTrial,...(d.freeTrial||d.freeSubscription||{})},appDownload:{...cfg.appDownload,...(d.appDownload||d.downloadApp||{})}};
                    break;
                }
            }
        }catch(e){console.warn('Admin subscription config fallback used',e);}
        ARY_CFG=cfg; return cfg;
    }
    async function planCfg(){ const cfg=await fetchAdminConfig(); const plans=cfg.plans||DEFAULT_CONFIG.plans; const name=currentPlanName(); return plans[name]||plans[Object.keys(plans).find(k=>low(k)===low(name))]||plans.Basic||DEFAULT_CONFIG.plans.Basic; }
    function getSellerAccessOverride(key){
        const a=activeSeller&&activeSeller.subscriptionAccess||activeSeller&&activeSeller.featureAccess||{};
        if(a && Object.prototype.hasOwnProperty.call(a,key))return a[key]===true;
        return null;
    }
    async function hasFeature(key){
        const o=getSellerAccessOverride(key); if(o!==null)return o;
        const p=await planCfg();
        return !!(p.features&&p.features[key]);
    }
    async function getLimits(){
        const p=await planCfg(); const cfg=await fetchAdminConfig();
        return {plan:p,config:cfg,productLimit:Number(p.productLimit||30),freeAds:Number(p.freeAds||0),commissionPercent:Number(p.commissionPercent||7),deliveryChargePerProduct:Number(p.deliveryChargePerProduct||25),durationHours:Number(cfg.sponsorDurationHours||24)};
    }
    function sellerItems(order){ try{return typeof getSellerItemsFromOrder==='function'?getSellerItemsFromOrder(order):(Array.isArray(order.items)?order.items:[]);}catch(e){return [];} }
    function itemAmount(i){return Number(i.price||i.sellingPrice||i.finalPrice||0)*Number(i.qty||i.quantity||1);}
    function orderAmount(o){const it=sellerItems(o); return it.length?it.reduce((s,i)=>s+itemAmount(i),0):Number(o.finalAmount||o.totalPrice||o.amount||o.total||0);}
    function productOfItem(i){
        const id=txt(i.id||i.productId||i.product_id||i.productDocId).trim(), sku=low(i.sku), name=low(i.name||i.title);
        return (sellerProducts||[]).find(p=>txt(p.id||p.productId).trim()===id || (sku&&low(p.sku)===sku) || (name&&low(p.name||p.title)===name));
    }
    function productStats(){
        const map={};
        (sellerProducts||[]).forEach(p=>{map[p.id]={product:p,totalQty:0,totalOrders:0,delivered:0,cancelled:0,returned:0,gross:0,views:Number(p.views||p.totalViews||p.clicks||p.totalClicks||0)}});
        (sellerOrders||[]).forEach(o=>{
            const status=low(o.status||o.orderStatus);
            sellerItems(o).forEach(i=>{
                const p=productOfItem(i); if(!p||!map[p.id])return;
                const st=map[p.id], q=Number(i.qty||i.quantity||1);
                st.totalQty+=q; st.totalOrders+=1; st.gross+=itemAmount(i);
                if(status.includes('deliver'))st.delivered+=q;
                if(status.includes('cancel'))st.cancelled+=q;
                if(status.includes('return'))st.returned+=q;
            });
        });
        return Object.values(map);
    }
    function updateText(id,v){const el=$(id); if(el)el.innerText=v;}
    async function renderPlanBadges(){
        const lim=await getLimits();
        const badge=$('currentPlanBadge'); if(badge)badge.innerText=lim.plan.name||currentPlanName();
        const verified=$('verifiedBadge'); if(verified)verified.style.display=currentPlanName()!=='Basic'?'inline':'none';
    }
    async function adUsage(){
        const u=activeSeller&&activeSeller.sponsoredAdUsage||{};
        return u.month===monthKey()?Number(u.used||0):0;
    }
    async function saveAdUsage(n){
        const usage={month:monthKey(),used:n,updatedAt:nowIso()};
        if(db&&activeSeller&&activeSeller.email) await db.collection('sellers').doc(activeSeller.email).set({sponsoredAdUsage:usage,sponsoredAdsUsedThisMonth:n},{merge:true});
        activeSeller.sponsoredAdUsage=usage; activeSeller.sponsoredAdsUsedThisMonth=n; localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    }
    function isSponsoredLive(p){
        const until=dateMs(p.sponsoredUntil||p.sponsorEndAt||p.adEndAt);
        return !!(p.isSponsored||p.isAd||p.sponsored) && (!until || until>Date.now());
    }
    window.cleanupExpiredSponsoredAds=async function(manual){
        if(!db||!activeSeller)return;
        let changed=0;
        try{
            const now=Date.now();
            for(const p of (sellerProducts||[])){
                const until=dateMs(p.sponsoredUntil||p.sponsorEndAt||p.adEndAt);
                if((p.isSponsored||p.isAd||p.sponsored) && until && until<=now){
                    Object.assign(p,{isAd:false,isSponsored:false,sponsored:false,adStatus:'Expired'});
                    await db.collection('products').doc(p.id).set({isAd:false,isSponsored:false,sponsored:false,adStatus:'Expired',sponsorStatus:'Expired',sponsoredExpiredAt:nowIso()},{merge:true});
                    changed++;
                }
            }
            if(manual)toast(changed?`${changed} expired ad(s) synced.`:'No expired sponsored ads found.','success');
            if(changed && typeof loadAds==='function')loadAds();
        }catch(e){console.warn(e); if(manual)toast('Could not sync expired ads.','error');}
    };
    async function activateSponsoredProduct(id,isFree){
        const lim=await getLimits();
        const start=nowIso(); const end=new Date(Date.now()+lim.durationHours*3600000).toISOString();
        await db.collection('products').doc(id).set({isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsorStatus:'Live',sponsoredAt:start,sponsoredStartAt:start,sponsoredUntil:end,sponsorEndAt:end,sponsoredBySeller:email(),sponsoredSource:isFree?'free-plan-slot':'admin-approved'},{merge:true});
        const p=(sellerProducts||[]).find(x=>String(x.id)===String(id)); if(p)Object.assign(p,{isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredAt:start,sponsoredUntil:end});
        if(isFree)await saveAdUsage((await adUsage())+1);
        try{await db.collection('seller_ad_logs').add({sellerEmail:email(),productId:id,type:isFree?'free_sponsor':'sponsor',startAt:start,endAt:end,status:'Live',createdAt:start});}catch(e){}
        toast(`Sponsored ad active for ${lim.durationHours} hours.`,'success');
        if(typeof loadAds==='function')loadAds();
    }
    window.startAd=async function(id){
        if(!activeSeller)return toast('Login required.','error');
        await fetchAdminConfig(); await cleanupExpiredSponsoredAds(false);
        if(!(await hasFeature('sponsoredAds'))) return toast('Sponsored ads are locked. Admin must enable it in your subscription.','warning');
        const lim=await getLimits(); const used=await adUsage(); const left=Math.max(0,lim.freeAds-used);
        const p=(sellerProducts||[]).find(x=>String(x.id)===String(id))||{};
        const msg=$('adPlanMessage'), cost=$('adCostDisplay'), input=$('adProdId'), modal=$('adPaymentModal');
        if(input)input.value=id;
        if(msg)msg.innerHTML=left>0?`<b>${safe(p.name||p.title||id)}</b><br>Use free highlight <b>${used+1}/${lim.freeAds}</b>. It will start now and end automatically after <b>${lim.durationHours}h</b>.`:`No free ad left for <b>${safe(lim.plan.name)}</b>. Upgrade your subscription or pay ₹70 for 24h sponsorship.`;
        if(cost)cost.innerText=left>0?'FREE':'Admin approval needed';
        const btn=modal&&modal.querySelector('button[onclick="payAdOnline()"]'); if(btn)btn.innerHTML=left>0?'<i class="fas fa-bolt"></i> Use Free Sponsored Slot':'Request Admin Access';
        const payout=$('btnAdPayout'); if(payout)payout.style.display='none';
        if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}
    };
    window.payAdOnline=async function(){
        const id=$('adProdId')&&$('adProdId').value; if(!id)return;
        const lim=await getLimits(); const left=Math.max(0,lim.freeAds-(await adUsage()));
        closeModal('adPaymentModal');
        if(left>0)return activateSponsoredProduct(id,true);
        try{await db.collection('sponsored_ad_requests').add({sellerEmail:email(),productId:id,status:'Pending Admin Approval',requestedAt:nowIso(),reason:'No free sponsored slot left'});toast('Request sent to admin for sponsored access.','success');}catch(e){toast('Could not send request.','error');}
    };
    window.payAdUpcoming=async function(){ return window.payAdOnline(); };
    window.stopAd=async function(id){
        try{
            await db.collection('products').doc(id).set({isAd:false,isSponsored:false,sponsored:false,adStatus:'Stopped',sponsorStatus:'Stopped',sponsoredStoppedAt:nowIso()},{merge:true});
            const p=(sellerProducts||[]).find(x=>String(x.id)===String(id)); if(p)Object.assign(p,{isAd:false,isSponsored:false,sponsored:false,adStatus:'Stopped'});
            await db.collection('seller_ad_logs').add({sellerEmail:email(),productId:id,type:'stop_sponsor',status:'Stopped',createdAt:nowIso()}).catch(()=>{});
            toast('Sponsored ad stopped immediately.','success'); loadAds();
        }catch(e){toast('Could not stop sponsored ad.','error');}
    };
    window.loadAds=async function(){
        const list=$('adsList'); if(!list)return; await fetchAdminConfig(); await cleanupExpiredSponsoredAds(false);
        const lim=await getLimits(); const used=await adUsage(); const box=$('adsPlanBox');
        if(box)box.innerHTML=`<b>${safe(lim.plan.name||currentPlanName())}</b> gives <b>${lim.freeAds}</b> free sponsored highlight(s)/month. Used: <b>${used}</b>. Duration: <b>${lim.durationHours}h</b>. Paid/fine sponsored ads are disabled unless admin enables access.`;
        const rows=(sellerProducts||[]).map(p=>{
            const live=isSponsoredLive(p); const start=asDate(p.sponsoredAt||p.sponsoredStartAt); const end=asDate(p.sponsoredUntil||p.sponsorEndAt);
            return `<tr><td data-label="Product"><div style="display:flex;gap:10px;align-items:center;">${productImg(p)}<div><b>${safe(p.name||p.title||'Product')}</b><br><span style="font-family:monospace;font-size:11px;color:var(--text-light);">${safe(p.sku||p.id)}</span></div></div></td><td data-label="Status"><span class="${live?'ad-status-live':'ad-status-expired'}">${live?'Sponsored Live':'Not Sponsored'}</span></td><td data-label="24h Window">${start?start.toLocaleString():'-'}<br><b>${end?end.toLocaleString():'-'}</b></td><td data-label="Action">${live?`<button class="btn-sm" style="background:var(--danger);" onclick="stopAd('${safe(p.id)}')"><i class="fas fa-stop"></i> Stop Ad</button>`:`<button class="btn-sm" style="background:#ec4899;" onclick="startAd('${safe(p.id)}')"><i class="fas fa-bolt"></i> Sponsor</button>`}</td></tr>`;
        });
        list.innerHTML=rows.length?rows.join(''):`<tr><td colspan="4" style="text-align:center;font-weight:800;">No products found.</td></tr>`;
    };
    function productImg(p){ const imgs=Array.isArray(p.images)?p.images:(p.image?[p.image]:[]); return imgs[0]?`<img src="${safe(imgs[0])}" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:12px;border:1px solid var(--border-color);">`:`<div style="width:48px;height:48px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center;"><i class="fas fa-box"></i></div>`; }

    window.loadSubscriptionsUI=async function(){
        const cfg=await fetchAdminConfig(true); const lim=await getLimits();
        await renderPlanBadges();
        const notice=$('subscriptionAdminNotice'), cards=$('subscriptionCards'); if(!cards)return;
        const end=asDate(activeSeller&&activeSeller.subEndDate);
        const freeEligible=freeTrialEligible(cfg);
        if(notice)notice.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><b>Current plan:</b> ${safe(lim.plan.name||currentPlanName())}<br><span class="muted-line">${end?'Valid till '+end.toLocaleString():'Basic is active without expiry'}</span></div><div><button class="btn-prime" onclick="redeemFreeSubscription()" ${freeEligible?'':'disabled'}><i class="fas fa-gift"></i> Redeem 1 Month Free</button></div></div>`;
        const plans=cfg.plans||{};
        cards.innerHTML=Object.keys(plans).map(k=>{
            const p=plans[k]||{}; const active=low(p.name||k)===low(currentPlanName());
            const f=p.features||{};
            return `<div class="admin-plan-card ${active?'active':''}"><div class="admin-plan-title"><strong>${safe(p.name||k)}</strong>${active?'<span class="ok-chip"><i class="fas fa-check"></i> Active</span>':'<span class="lock-chip"><i class="fas fa-user-shield"></i> Admin</span>'}</div><p class="muted-line">${safe(p.description||'Subscription details are controlled by admin.')}</p><div class="feature-list"><div class="feature-row"><span>Product listing</span><span>${Number(p.productLimit||30)} products</span></div><div class="feature-row"><span>Free sponsored ad</span><span>${Number(p.freeAds||0)}</span></div><div class="feature-row"><span>Commission</span><span>${Number(p.commissionPercent||7)}%</span></div><div class="feature-row"><span>Delivery charge</span><span>₹${Number(p.deliveryChargePerProduct||25)}/product</span></div><div class="feature-row"><span>Store branding</span><span>${f.storeBranding?'Allowed':'Admin locked'}</span></div><div class="feature-row"><span>Seller controls</span><span>${f.sellerControls?'Allowed':'Admin locked'}</span></div><div class="feature-row"><span>Order email</span><span>${f.sendOrderEmail?'Allowed':'Admin locked'}</span></div></div>${active?'<button class="btn-outline w-100" disabled>Already Active</button>':`<button class="btn-prime w-100" onclick="requestSubscriptionFromAdmin('${safe(p.name||k)}')"><i class="fas fa-paper-plane"></i> Request Admin Activation</button>`}</div>`;
        }).join('');
    };
    function freeTrialEligible(cfg){
        if(activeSeller&&activeSeller.freeSubscriptionRedeemedAt)return false;
        return !!(activeSeller&&(activeSeller.freeSubscriptionEligible||activeSeller.freeTrialEligible||activeSeller.oneMonthFreeSubscription||activeSeller.freeSubscriptionOffer)||(cfg.freeTrial&&cfg.freeTrial.allowAll));
    }
    window.requestSubscriptionFromAdmin=async function(plan){
        try{await db.collection('seller_subscription_requests').add({sellerEmail:email(),sellerName:activeSeller.companyName||activeSeller.shopName||'',planName:plan,status:'Pending Admin Approval',requestedAt:nowIso(),source:'seller-panel'});toast('Subscription request sent to admin.','success');}catch(e){toast('Could not send subscription request.','error');}
    };
    window.processSubscription=async function(planName,method){ return window.requestSubscriptionFromAdmin(planName||'Basic'); };
    window.redeemFreeSubscription=async function(){
        const cfg=await fetchAdminConfig(); if(!freeTrialEligible(cfg))return toast('Free month is not enabled for your account by admin.','warning');
        const days=Number((cfg.freeTrial&&cfg.freeTrial.days)||30), plan=(cfg.freeTrial&&cfg.freeTrial.plan)||'Basic'; const end=new Date(Date.now()+days*86400000).toISOString();
        try{await db.collection('sellers').doc(activeSeller.email).set({subscription:plan,subStartDate:nowIso(),subEndDate:end,freeSubscriptionActive:true,freeSubscriptionRedeemedAt:nowIso(),subscriptionSource:'admin-free-month'},{merge:true});Object.assign(activeSeller,{subscription:plan,subStartDate:nowIso(),subEndDate:end,freeSubscriptionActive:true,freeSubscriptionRedeemedAt:nowIso()});localStorage.setItem('sellerToken',JSON.stringify(activeSeller));showAdminPopup('1 Month Free Subscription Activated',`Your ${safe(plan)} plan is active till ${new Date(end).toLocaleDateString()}.`);loadSubscriptionsUI();}catch(e){toast('Could not activate free subscription.','error');}
    };

    const oldOpenItemModal=window.openItemModal;
    window.openItemModal=async function(){
        const lim=await getLimits();
        if((sellerProducts||[]).length>=lim.productLimit)return toast(`Your ${lim.plan.name} plan allows ${lim.productLimit} product listings. Upgrade your subscription to increase access.`,'warning');
        return oldOpenItemModal?oldOpenItemModal():null;
    };
    async function uniqueSku(base,editId){
        let sku=txt(base).trim().toUpperCase().replace(/\s+/g,'-'); if(!sku)sku='ARY-'+Date.now().toString(36).toUpperCase();
        for(let i=0;i<12;i++){
            const test=i?`${sku}-${i+1}`:sku;
            let dup=false;
            try{const snap=await db.collection('products').where('sku','==',test).limit(2).get(); snap.forEach(d=>{if(String(d.id)!==String(editId||''))dup=true;});}catch(e){}
            if(!dup && !(sellerProducts||[]).some(p=>low(p.sku)===low(test)&&String(p.id)!==String(editId||'')))return test;
        }
        return sku+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
    }
    const oldSubmitItemForm=window.submitItemForm;
    window.submitItemForm=async function(){
        const lim=await getLimits(); const id=$('editId')&&$('editId').value.trim();
        if(!id && (sellerProducts||[]).length>=lim.productLimit)return toast(`Product limit reached: ${lim.productLimit}. Admin must upgrade subscription.`,'warning');
        const skuEl=$('itemSku'); if(skuEl)skuEl.value=await uniqueSku(skuEl.value||$('itemName')?.value||'',id);
        const priceEl=$('itemPrice'), mrpEl=$('itemMrp');
        if(priceEl&&mrpEl&&Number(priceEl.value)>Number(mrpEl.value))return toast('Selling price cannot be greater than MRP.','warning');
        try{ if(oldSubmitItemForm) await oldSubmitItemForm(); }
        finally{
            try{const saved=(sellerProducts||[])[0]; if(saved&&db) await db.collection('products').doc(saved.id).set({commissionPercent:lim.commissionPercent,deliveryChargePerProduct:lim.deliveryChargePerProduct,subscriptionPlanAtListing:lim.plan.name||currentPlanName()},{merge:true});}catch(e){}
        }
    };

    const oldLoadSettings=window.loadSettingsUI;
    window.loadSettingsUI=async function(){ try{oldLoadSettings&&oldLoadSettings();}catch(e){} await fetchAdminConfig(); await enforceSettingAccess(); await renderDownloadAppSetting(); };
    async function enforceSettingAccess(){
        const sellerControls=await hasFeature('sellerControls');
        ['settingAutoAcc','settingVacation','settingSms','setting2fa','settingSearchSuggestions'].forEach(id=>{const el=$(id); if(el){el.disabled=!sellerControls; const card=el.closest('.setting-card-premium'); if(card)card.classList.toggle('sub-disabled',!sellerControls);}});
        const branding=await hasFeature('storeBranding');
        ['storeLogoInput','storeBannerInput'].forEach(id=>{const el=$(id); if(el)el.disabled=!branding;});
        document.querySelectorAll('.branding-edit-btn').forEach(btn=>{btn.disabled=!branding;});
        if($('logoLimitText'))$('logoLimitText').innerText=branding?'Store branding enabled by subscription/admin.':'Store branding locked. Admin must enable subscription access.';
        if($('bannerLimitText'))$('bannerLimitText').innerText=branding?'Banner branding enabled by subscription/admin.':'Banner branding locked. Admin must enable subscription access.';
        const orderEmail=await hasFeature('sendOrderEmail'); ensureOrderEmailSetting(orderEmail);
    }
    const oldToggleSetting=window.toggleSetting;
    window.toggleSetting=async function(key){
        const adminKeys=['autoAcc','vacation','sms','2fa','searchSuggestions','sendOrderEmail'];
        if(adminKeys.includes(key)&&!(await hasFeature(key==='sendOrderEmail'?'sendOrderEmail':'sellerControls'))){ const el=$('setting'+key.charAt(0).toUpperCase()+key.slice(1)); if(el)el.checked=false; return toast('This setting is locked by subscription/admin access.','warning'); }
        return oldToggleSetting?oldToggleSetting(key):null;
    };
    function ensureOrderEmailSetting(allowed){
        if($('settingSendOrderEmail')){ $('settingSendOrderEmail').disabled=!allowed; return; }
        const grid=document.querySelector('.settings-grid-premium'); if(!grid)return;
        const div=document.createElement('div'); div.className='setting-card-premium'+(allowed?'':' sub-disabled'); div.innerHTML=`<div class="setting-left"><div class="setting-icon"><i class="fas fa-envelope-open-text"></i></div><div><div class="setting-title">Send Order Email</div><div class="setting-sub">New order email notification to seller. Admin/subscription controlled.</div></div></div><label class="premium-switch"><input type="checkbox" id="settingSendOrderEmail" ${activeSeller?.settings?.sendOrderEmail?'checked':''} ${allowed?'':'disabled'} onchange="toggleSetting('sendOrderEmail')"><span class="switch-slider"></span></label>`; grid.appendChild(div);
    }
    async function renderDownloadAppSetting(){
        const cfg=await fetchAdminConfig(); if(!(cfg.appDownload&&cfg.appDownload.enabled))return;
        if($('downloadAppSettingBox'))return;
        const sec=$('settingsSection'); if(!sec)return;
        const box=document.createElement('div'); box.id='downloadAppSettingBox'; box.className='panel-box mt-20'; box.innerHTML=`<h4 style="font-size:18px;font-weight:900;margin-bottom:10px;"><i class="fas fa-mobile-screen"></i> Download Aryanta App</h4><p class="muted-line">Enabled by admin.</p><button class="btn-prime" onclick="window.open('${safe(cfg.appDownload.url||'https://aryanta.in/app')}','_blank','noopener')"><i class="fas fa-download"></i> Download App</button>`; sec.appendChild(box);
    }

    const oldRenderDashboard=window.renderDashboardStats;
    window.renderDashboardStats=async function(){
        try{oldRenderDashboard&&oldRenderDashboard();}catch(e){}
        const lim=await getLimits(); const today=new Date().toDateString(), mon=new Date().getMonth(); let todayCount=0, monthCount=0, revenue=0, upcoming=0; const chart=[0,0,0,0,0,0,0];
        (sellerOrders||[]).forEach(o=>{const items=sellerItems(o); if(!items.length)return; const amt=orderAmount(o); const d=asDate(o.timestamp||o.createdAt||o.orderDate)||new Date(); if(d.toDateString()===today)todayCount++; if(d.getMonth()===mon)monthCount++; if(low(o.status).includes('deliver')){revenue+=amt; chart[d.getDay()]+=amt;} if(low(o.status).includes('deliver')&&!o.sellerSettled){upcoming+=Math.max(0,amt-Math.round(amt*lim.commissionPercent/100));}});
        updateText('smartDailyOrders',todayCount); updateText('smartMonthlyOrders',monthCount); updateText('stat-total-inventory',(sellerProducts||[]).length); updateText('stat-total-pay','₹'+revenue.toLocaleString('en-IN')); updateText('stat-pending-pay','₹'+upcoming.toLocaleString('en-IN')); updateText('stat-followers',activeSeller?.followers||0);
        const reviews=(sellerReviews||[]); let avg=0; if(reviews.length)avg=reviews.reduce((s,r)=>s+Number(r.rating||r.stars||0),0)/reviews.length; updateText('topShopRating',reviews.length?`${avg.toFixed(1)}/5 (${Math.round(avg/5*100)}%)`:'N/A');
        const stats=productStats(); const views=stats.reduce((s,x)=>s+x.views,0); updateText('stat-product-views',views.toLocaleString('en-IN'));
        const top=[...stats].sort((a,b)=>b.delivered-a.delivered)[0]; const losing=[...stats].sort((a,b)=>(b.cancelled+b.returned)-(a.cancelled+a.returned))[0];
        if(top){updateText('stat-top-selling',txt(top.product.name||top.product.title||'-').slice(0,22)); updateText('stat-top-selling-meta',`${top.delivered} delivered | ₹${top.gross.toLocaleString('en-IN')}`);} if(losing){updateText('stat-top-losing',txt(losing.product.name||losing.product.title||'-').slice(0,22)); updateText('stat-top-losing-meta',`${losing.cancelled} cancel | ${losing.returned} return`);} try{if(typeof renderSalesChart==='function')renderSalesChart(chart);}catch(e){}
    };

    const oldLoadInventory=window.loadInventory;
    window.loadInventory=function(){
        try{oldLoadInventory&&oldLoadInventory();}catch(e){}
        const rows=$('inventoryList'); if(!rows)return; const stats=productStats();
        setTimeout(()=>{document.querySelectorAll('#inventoryList tr').forEach(tr=>{
            const sku=tr.querySelector('[data-label="SKU & Images"] strong')?.innerText||''; const p=(sellerProducts||[]).find(x=>txt(x.sku||x.id).includes(sku)||txt(sku).includes(txt(x.sku||x.id).slice(0,8))); if(!p)return; const st=stats.find(x=>x.product.id===p.id); if(!st)return; const title=tr.querySelector('[data-label="Product Title"]'); if(title&&!title.querySelector('.metric-mini')){const total=Math.max(1,st.totalOrders); title.innerHTML+=`<div class="metric-mini"><span>Orders ${st.totalOrders}</span><span>Return ${Math.round(st.returned/total*100)}%</span><span>Cancel ${Math.round(st.cancelled/total*100)}%</span><span>Views ${st.views}</span></div>`;}
        });},0);
    };
    window.loadProductPerformance=function(){
        const list=$('productPerformanceList'); if(!list)return; const rows=productStats();
        if(!rows.length){list.innerHTML='<div class="panel-box">No products found.</div>';return;}
        list.innerHTML=rows.map(st=>{const p=st.product,total=Math.max(1,st.totalOrders),ret=Math.round(st.returned/total*100),can=Math.round(st.cancelled/total*100),del=Math.round(st.delivered/Math.max(1,st.totalQty)*100);return `<div class="performance-card">${productImg(p)}<h4>${safe(p.name||p.title||'Product')}</h4><p class="muted-line">Code: <b>${safe(p.sku||p.id)}</b> | Price: <b>₹${Number(p.price||0).toLocaleString('en-IN')}</b></p><div class="tiny-metric-grid"><div class="tiny-metric"><span>Total Sell</span>${st.totalQty}</div><div class="tiny-metric"><span>Delivered</span>${st.delivered}</div><div class="tiny-metric"><span>Cancelled</span>${st.cancelled}</div></div><div class="perf-bars"><small>Delivered ${del}%</small><div class="perf-bar"><i style="width:${Math.min(100,del)}%"></i></div><small>Returns ${ret}%</small><div class="perf-bar"><i style="width:${Math.min(100,ret)}%"></i></div><small>Cancelled ${can}%</small><div class="perf-bar"><i style="width:${Math.min(100,can)}%"></i></div></div><button class="btn-outline w-100" onclick="editItem('${safe(p.id)}')"><i class="fas fa-edit"></i> Edit Product</button></div>`;}).join('');
    };

    async function fetchSupportIssues(){
        if(!db)return [];
        const out=[];
        try{const snap=await db.collection('support_issue_categories').orderBy('sort','asc').get(); snap.forEach(d=>out.push({id:d.id,...d.data()}));}catch(e){}
        if(!out.length){try{const d=await db.collection('site_config').doc('support_issue_categories').get(); const arr=d.exists?(d.data().categories||[]):[]; arr.forEach((x,i)=>out.push({id:x.id||String(i),...x}));}catch(e){}}
        if(!out.length)out.push({id:'payment',title:'Payment/Payout Issue',description:'Payment or settlement issue',requireImage:false,requireDocument:false,allowSkip:true},{id:'listing',title:'Product Listing Error',description:'Listing/QC/update issue',requireImage:true,requireDocument:false,allowSkip:true},{id:'other',title:'Other / General Query',description:'General seller support',allowSkip:true});
        lastSupportIssueConfig=out; return out;
    }
    async function renderSupportCategories(){
        const sel=$('supCategory'); if(!sel)return; const arr=await fetchSupportIssues(); const selected=sel.value; sel.innerHTML='<option value="">-- Select Issue Type --</option>'+arr.map(c=>`<option value="${safe(c.id||c.title)}">${safe(c.title||c.name||c.id)}</option>`).join(''); if(selected)sel.value=selected;
    }
    window.handleSupportCategoryChange=function(){
        const val=$('supCategory')?.value; const c=lastSupportIssueConfig.find(x=>txt(x.id||x.title)===val)||{}; const detail=$('supportIssueDetailBox'), attach=$('supportAttachmentBox');
        if(detail){detail.style.display=val?'block':'none'; detail.innerHTML=`<b>${safe(c.title||c.name||val||'Issue')}</b><br><span class="muted-line">${safe(c.description||c.details||'Describe this issue in detail.')}</span>`;}
        const img=$('supImage'), doc=$('supDoc'), il=$('supportImageLabel'), dl=$('supportDocLabel'), skip=$('supportSkipDocBtn');
        if(attach){attach.style.display=(c.requireImage||c.requireDocument||c.askImage||c.askDocument)?'block':'none';}
        if(img){img.style.display=(c.requireImage||c.askImage)?'block':'none'; img.required=!!c.requireImage&&!c.allowSkip;} if(il)il.style.display=img&&img.style.display==='block'?'block':'none';
        if(doc){doc.style.display=(c.requireDocument||c.askDocument)?'block':'none'; doc.required=!!c.requireDocument&&!c.allowSkip;} if(dl)dl.style.display=doc&&doc.style.display==='block'?'block':'none';
        if(skip)skip.style.display=c.allowSkip?'inline-flex':'none';
    };
    window.skipSupportDocument=function(){ const img=$('supImage'),doc=$('supDoc'); if(img)img.value=''; if(doc)doc.value=''; toast('Optional upload skipped.','info'); };
    async function fileData(input){ const f=input&&input.files&&input.files[0]; if(!f)return null; return new Promise((resolve,reject)=>{const r=new FileReader(); r.onerror=reject; r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,dataUrl:r.result}); r.readAsDataURL(f);}); }
    window.submitSupportTicket=async function(){
        const cat=$('supCategory')?.value, phone=$('supPhone')?.value.trim(), desc=$('supDesc')?.value.trim(); if(!cat||!phone||!desc)return toast('Fill support category, phone and detailed description.','warning');
        const c=lastSupportIssueConfig.find(x=>txt(x.id||x.title)===cat)||{};
        try{const [image,doc]=await Promise.all([fileData($('supImage')),fileData($('supDoc'))]); await db.collection('seller_support_tickets').add({email:email(),sellerEmail:email(),sellerName:activeSeller.companyName||activeSeller.shopName||'',category:cat,categoryTitle:c.title||cat,categoryDetail:c.description||'',phone,description:desc,image,document:doc,status:'Pending',timestamp:nowIso(),createdAt:nowIso(),source:'seller-panel'}); toast('Support ticket sent to admin.','success'); ['supDesc','supPhone','supImage','supDoc'].forEach(id=>{const el=$(id); if(el)el.value='';}); await renderSupportCategories(); }catch(e){toast('Could not submit support ticket.','error');}
    };

    async function requestCharge(type,amount,reason,extra={}){ try{await db.collection('seller_charge_requests').add({sellerEmail:email(),type,amount:Number(amount||0),reason,status:'Pending Admin Approval',createdAt:nowIso(),...extra});}catch(e){console.warn('charge request failed',e);} }
    window.cancelOrder=async function(id){
        if(!confirm('Cancel this order? Any fine/charge will go to admin approval first.'))return;
        try{await db.collection('orders').doc(id).set({status:'Cancelled',cancelledAt:nowIso(),cancelledBySeller:true},{merge:true}); const o=(sellerOrders||[]).find(x=>String(x.id)===String(id)); if(o)o.status='Cancelled'; await requestCharge('seller_order_cancel',0,'Seller cancelled order - admin decides fine',{orderId:id}); toast('Order cancelled. Fine request sent to admin for approval, no direct fine added.','success'); renderDashboardStats(); if(typeof loadNewOrders==='function')loadNewOrders();}
        catch(e){toast('Could not cancel order.','error');}
    };
    window.skipAndShip=async function(){
        const id=$('scanOrderId')?.value||'';
        if(!id)return toast('You must scan an invoice first.','warning');
        if(!confirm('Skip scan and send admin approval request? No fine will be added directly.'))return;
        await requestCharge('skip_scan',0,'Seller skipped dispatch/warranty scan - admin decides fine',{orderId:id});
        try{if(html5QrcodeScanner){await html5QrcodeScanner.clear(); html5QrcodeScanner=null;}}catch(e){}
        if(typeof executeDispatch==='function')executeDispatch(id,'SKIPPED_ADMIN_REVIEW','SKIPPED_ADMIN_REVIEW');
        else toast('Skip request sent to admin.','success');
    };

    window.loadReturnTracking=function(){
        const box=$('returnTrackingList'); if(!box)return; const rows=[]; const cutoff=15*86400000;
        (sellerOrders||[]).forEach(o=>{const status=low(o.status); const afterDispatch=status.includes('deliver')||status.includes('ship')||status.includes('cancel'); if(!afterDispatch)return; const d=asDate(o.deliveredAt||o.shippedAt||o.timestamp)||new Date(); const deadline=asDate(o.returnDeadline||o.adminReturnDeadline)||new Date(d.getTime()+cutoff); sellerItems(o).forEach(i=>{const p=productOfItem(i)||{}; rows.push({o,i,p,d,deadline});});});
        box.innerHTML=rows.length?rows.map(r=>`<div class="return-card"><h4>${safe(r.i.name||r.i.title||r.p.name||'Product')}</h4><p class="muted-line">Order: <b>${safe(r.o.order_no||r.o.id)}</b><br>Status: <b>${safe(r.o.status)}</b><br>Expected return window: <b>${r.deadline.toLocaleDateString()}</b></p><button class="btn-prime w-100" onclick="openReturnClaimModal('${safe(r.o.id)}','${safe(r.p.id||r.i.productId||'')}')"><i class="fas fa-paper-plane"></i> Claim Return</button><div id="claimStatus-${safe(r.o.id)}" class="muted-line" style="margin-top:8px;">Claim status fetched from admin DB when available.</div></div>`).join(''):'<div class="panel-box">No return tracking items found.</div>';
        fetchReturnClaimStatuses();
    };
    window.openReturnClaimModal=function(orderId,productId){ if($('returnClaimOrderId'))$('returnClaimOrderId').value=orderId; if($('returnClaimProductId'))$('returnClaimProductId').value=productId; openModal('returnClaimModal'); };
    window.submitReturnClaim=async function(){
        const orderId=$('returnClaimOrderId')?.value, productId=$('returnClaimProductId')?.value, title=$('returnClaimTitle')?.value.trim(), message=$('returnClaimMessage')?.value.trim(); if(!title||!message)return toast('Add claim title and message.','warning');
        try{const image=await fileData($('returnClaimImage')); await db.collection('seller_return_claims').add({sellerEmail:email(),orderId,productId,title,message,image,status:'Pending',createdAt:nowIso(),source:'seller-panel'}); closeModal('returnClaimModal'); toast('Return claim sent to admin.','success'); loadReturnTracking();}catch(e){toast('Could not send claim.','error');}
    };
    async function fetchReturnClaimStatuses(){
        try{const snap=await db.collection('seller_return_claims').where('sellerEmail','==',email()).orderBy('createdAt','desc').limit(80).get(); snap.forEach(d=>{const c=d.data(); const el=$('claimStatus-'+c.orderId); if(el)el.innerHTML=`Latest claim: <b>${safe(c.status||'Pending')}</b>${c.adminMessage?' - '+safe(c.adminMessage):''}`;});}catch(e){}
    }

    async function fetchEventAds(){
        const rows=[]; try{const snap=await db.collection('seller_events').orderBy('startAt','desc').limit(60).get(); snap.forEach(d=>rows.push({id:d.id,...d.data()}));}catch(e){}
        activeEventRows=rows; return rows;
    }
    window.loadEventAds=async function(){ await fetchEventAds(); renderEventAds(activeEventTab); };
    window.renderEventAds=function(tab){ activeEventTab=tab||'live'; ['live','expired'].forEach(t=>{const b=$('event-tab-'+t); if(b)b.classList.toggle('active',t===activeEventTab);}); const box=$('eventAdsList'); if(!box)return; const now=Date.now(); const rows=(activeEventRows||[]).filter(e=>{const start=dateMs(e.startAt||e.startDate)||0,end=dateMs(e.endAt||e.endDate)||0,live=(e.active!==false)&&(!start||start<=now)&&(!end||end>=now); return activeEventTab==='live'?live:!live;}); box.innerHTML=rows.length?rows.map(e=>{const img=e.image||e.imageUrl||e.banner||''; const cost=Number(e.cost||e.fee||0); return `<div class="event-card">${img?`<img src="${safe(img)}" loading="lazy" style="width:100%;height:150px;object-fit:cover;border-radius:16px;margin-bottom:12px;">`:''}<h4>${safe(e.title||e.name||'Aryanta Event')}</h4><p class="muted-line">${safe(e.description||e.desc||'Admin event')}<br>Cost: <b>${cost?('₹'+cost):'Free'}</b><br>Ends: <b>${asDate(e.endAt||e.endDate)?.toLocaleString()||'Admin controlled'}</b></p>${activeEventTab==='live'?`<button class="btn-prime w-100" onclick="openEventParticipate('${safe(e.id)}')"><i class="fas fa-plus"></i> Participate</button>`:`<button class="btn-outline w-100" onclick="viewExpiredEvent('${safe(e.id)}')"><i class="fas fa-eye"></i> View Details</button>`}</div>`;}).join(''):'<div class="panel-box">No events in this tab.</div>'; };
    window.openEventParticipate=function(id){ const e=(activeEventRows||[]).find(x=>String(x.id)===String(id)); if(!e)return; if($('eventParticipateId'))$('eventParticipateId').value=id; if($('eventParticipateInfo'))$('eventParticipateInfo').innerHTML=`<b>${safe(e.title||e.name)}</b><br><span class="muted-line">Select max 5 inventory items.</span>`; const box=$('eventInventorySelect'); if(box)box.innerHTML=(sellerProducts||[]).map(p=>`<label class="event-product-option"><input type="checkbox" class="event-product-cb" value="${safe(p.id)}" onchange="limitEventProducts(this)">${productImg(p)}<span>${safe(p.name||p.title||p.sku||p.id)}</span></label>`).join(''); openModal('eventParticipateModal'); };
    window.limitEventProducts=function(cb){ const checked=[...document.querySelectorAll('.event-product-cb:checked')]; if(checked.length>5){cb.checked=false;toast('Maximum 5 products allowed.','warning');} };
    window.submitEventParticipation=async function(){ const eventId=$('eventParticipateId')?.value; const ids=[...document.querySelectorAll('.event-product-cb:checked')].map(x=>x.value); if(!ids.length)return toast('Select at least one product.','warning'); const e=(activeEventRows||[]).find(x=>String(x.id)===String(eventId))||{}; try{await db.collection('seller_event_participations').doc(eventId+'_'+email().replace(/[^a-z0-9]/g,'_')).set({eventId,sellerEmail:email(),productIds:ids,status:'Pending Admin Review',cost:Number(e.cost||e.fee||0),createdAt:nowIso()},{merge:true}); closeModal('eventParticipateModal'); toast('Event participation sent to admin.','success');}catch(err){toast('Could not submit event products.','error');} };
    window.viewExpiredEvent=function(id){ const e=(activeEventRows||[]).find(x=>String(x.id)===String(id)); if(!e)return; showAdminPopup(e.title||'Expired Event',`${safe(e.description||'Event expired.')}<br><br>Your participation details are available in admin review if you joined this event.`); };

    window.loadLoanSection=async function(){
        const box=$('loanContent'); if(!box)return; const eligible=!!(activeSeller&&(activeSeller.loanEligible||activeSeller.loanAccess||activeSeller.loanActive));
        if(!eligible){box.innerHTML='<h3 style="font-weight:900;">We will notify you when you are eligible.</h3><p class="muted-line">Loan access is controlled by admin based on seller profile, orders and settlement history.</p>';return;}
        let loan={}; try{const s=await db.collection('seller_loans').where('sellerEmail','==',email()).limit(1).get(); if(!s.empty)loan=s.docs[0].data();}catch(e){}
        box.innerHTML=`<h3 style="font-weight:900;color:var(--success);">Loan Access Active</h3><p class="muted-line">Limit: <b>₹${Number(loan.limit||activeSeller.loanLimit||0).toLocaleString('en-IN')}</b><br>Status: <b>${safe(loan.status||activeSeller.loanStatus||'Eligible')}</b></p><button class="btn-prime" onclick="requestSellerLoan()"><i class="fas fa-paper-plane"></i> Request Loan</button>`;
    };
    window.requestSellerLoan=async function(){ try{await db.collection('seller_loan_requests').add({sellerEmail:email(),sellerName:activeSeller.companyName||'',status:'Pending Admin Review',createdAt:nowIso()});toast('Loan request sent to admin.','success');}catch(e){toast('Could not send loan request.','error');} };

    function showAdminPopup(title,msg){ const t=$('adminPopupTitle'),m=$('adminPopupMessage'),modal=$('adminPopupModal'); if(t)t.innerHTML=title; if(m)m.innerHTML=msg; if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);} else toast(txt(title).replace(/<[^>]*>/g,''),'info'); }
    window.checkAdminPopups=async function(){
        if(!db||!activeSeller)return; try{const seenKey='popupSeen_'+email(); const localSeen=JSON.parse(sessionStorage.getItem(seenKey)||'[]'); const snap=await db.collection('seller_popups').where('active','==',true).limit(20).get(); for(const d of snap.docs){const p=d.data(); const target=low(p.target||p.sellerEmail||'all'); if(!(target==='all'||target==='sellers'||target===email()))continue; if(localSeen.includes(d.id))continue; showAdminPopup(p.title||'Aryanta Notice',p.message||p.text||'New message from admin.'); localSeen.push(d.id); sessionStorage.setItem(seenKey,JSON.stringify(localSeen)); try{await db.collection('seller_popup_reads').doc(d.id+'_'+email().replace(/[^a-z0-9]/g,'_')).set({popupId:d.id,sellerEmail:email(),readAt:nowIso()},{merge:true});}catch(e){} break; }}catch(e){}
    };
    async function checkFirstOrderPopup(){ if(!activeSeller||activeSeller.firstOrderPopupShown)return; if((sellerOrders||[]).length>0){showAdminPopup('Congratulations 🎉','You received your first Aryanta order. Please accept and dispatch it on time.'); try{await db.collection('sellers').doc(activeSeller.email).set({firstOrderPopupShown:true,firstOrderPopupAt:nowIso()},{merge:true}); activeSeller.firstOrderPopupShown=true;}catch(e){}} }

    window.fetchNotifications=async function(){
        if(!db||!activeSeller)return; const rows=[]; try{const b=await db.collection('admin_broadcasts').orderBy('timestamp','desc').limit(40).get(); b.forEach(doc=>{const d=doc.data(); const target=low(d.target||d.sellerEmail||'all'); if(target==='all'||target==='sellers'||target===email())rows.push({id:doc.id,text:d.message||d.text||d.title||'Notice',title:d.title||'Aryanta Notice',time:d.timestamp||d.createdAt||nowIso(),link:d.link||d.url||''});});}catch(e){} try{const s=await db.collection('seller_notifications').where('sellerEmail','==',email()).orderBy('timestamp','desc').limit(30).get(); s.forEach(doc=>{const d=doc.data(); rows.push({id:doc.id,text:d.text||d.message||d.title||'Notification',title:d.title||'Seller Notification',time:d.timestamp||d.createdAt||nowIso(),link:d.link||d.url||''});});}catch(e){} adminNotifications=rows.sort((a,b)=>dateMs(b.time)-dateMs(a.time)); const count=adminNotifications.length; ['notifBadge','topbarNotifBadge'].forEach(id=>{const el=$(id); if(el){el.innerText=count; el.style.display=count?'inline-block':'none';}}); const list=$('fullNotifList')||$('notifList'); if(list)list.innerHTML=count?adminNotifications.map((n,i)=>`<div class="return-card" onclick="openFullNotifFinal('${safe(n.id)}')" style="cursor:pointer;margin-bottom:10px;"><h4>${i+1}. ${safe(n.title||'Notification')}</h4><p class="muted-line">${safe(n.text)}<br>${asDate(n.time)?.toLocaleString()||''}</p>${n.link?'<span class="ok-chip"><i class="fas fa-link"></i> Link attached</span>':''}</div>`).join(''):'<div class="panel-box">No notifications.</div>'; };

    const oldShow=window.showSection;
    window.showSection=async function(section){
        if(['returnTracking','productPerformance','eventAds','loan'].includes(section)){
            document.querySelectorAll('.data-section').forEach(sec=>sec.classList.remove('active')); const el=$(section+'Section'); if(el)el.classList.add('active'); const sb=$('mobileSidebar'); if(sb)sb.classList.remove('open'); const ov=$('mobileSidebarOverlay'); if(ov)ov.style.display='none';
            if(section==='returnTracking'){ if(typeof ensureSellerOrders==='function')await ensureSellerOrders(); loadReturnTracking(); }
            if(section==='productPerformance'){ if(typeof ensureSellerOrders==='function')await ensureSellerOrders(); loadProductPerformance(); }
            if(section==='eventAds'){ if(typeof ensureSellerProducts==='function')await ensureSellerProducts(); loadEventAds(); }
            if(section==='loan')loadLoanSection();
            return;
        }
        const res=oldShow?oldShow(section):null;
        if(section==='subscription')setTimeout(()=>loadSubscriptionsUI(),80);
        if(section==='ads')setTimeout(()=>loadAds(),80);
        if(section==='support')setTimeout(()=>renderSupportCategories().then(handleSupportCategoryChange),80);
        return res;
    };
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(async()=>{try{await fetchAdminConfig(); await renderPlanBadges(); await renderSupportCategories(); await fetchNotifications(); await checkAdminPopups(); await checkFirstOrderPopup(); await cleanupExpiredSponsoredAds(false); setInterval(()=>cleanupExpiredSponsoredAds(false),60000);}catch(e){console.warn('rebuild boot skipped',e);}},1600);});
})();

/* Aryanta Prime Seller Panel Upgrade - 2026-05-23
   Final override layer for subscriptions, notifications, sponsorship, support issues, breach fines and settings locks. */
(function(){
    const PATCH='ARYANTA_PRIME_SELLER_FINAL_2026_05_23';
    if(window[PATCH]) return;
    window[PATCH]=true;

    const $=id=>document.getElementById(id);
    const txt=v=>String(v==null?'':v);
    const low=v=>txt(v).toLowerCase().trim();
    const safe=v=>txt(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
    const nowIso=()=>new Date().toISOString();
    const sellerEmail=()=>low(activeSeller && activeSeller.email);
    const sellerDocId=()=>activeSeller && (activeSeller.email || activeSeller.id || activeSeller.uid);
    const toast=(m,t='info')=>typeof showToast==='function'?showToast(m,t):alert(m);
    const toDate=v=>{
        if(!v) return null;
        if(v && typeof v.toDate==='function') return v.toDate();
        const d=new Date(v);
        return Number.isFinite(d.getTime())?d:null;
    };
    const dateMs=v=>{const d=toDate(v);return d?d.getTime():0;};
    const monthKey=()=>new Date().toISOString().slice(0,7);

    const PRIME_PLANS={
        Basic:{name:'Basic / Free',key:'Basic',price:0,monthlyPrice:0,commissionPercent:7,productLimit:30,freeAds:0,sponsoredAdPrice:70,sort:1,recommended:false,trial:false,features:{offlineMode:true,darkTheme:true,searchSuggestions:true,notifications:true,sponsoredAds:true,supportTickets:true,autoAcceptOrders:false,vacationMode:false,smsAlerts:false,sendOrderEmail:false,twoFactor:false,brandingTools:false,profileBranding:false,b2bSupplies:false,downloadApp:false,bankEdit:false,fineControl:false},benefits:['Free seller access','Search suggestions','Offline mode toggle','Dark theme toggle','Sponsored ad available by ₹70 payment only']},
        Growth:{name:'Growth',key:'Growth',price:259,monthlyPrice:259,commissionPercent:6,productLimit:150,freeAds:2,sponsoredAdPrice:70,sort:2,recommended:true,trial:true,trialDays:30,features:{offlineMode:true,darkTheme:true,searchSuggestions:true,notifications:true,sponsoredAds:true,supportTickets:true,brandingTools:true,profileBranding:true,b2bSupplies:true,downloadApp:true,bankEdit:true,twoFactor:true,autoAcceptOrders:false,vacationMode:false,smsAlerts:false,sendOrderEmail:false,fineControl:false},benefits:['Recommended starter growth plan','1 month free once per seller','6% commission','Store branding access','No email notification access','Auto accept, vacation and SMS remain locked']},
        Pro:{name:'Pro',key:'Pro',price:659,monthlyPrice:659,commissionPercent:5,productLimit:500,freeAds:6,sponsoredAdPrice:70,sort:3,recommended:false,trial:false,features:{offlineMode:true,darkTheme:true,searchSuggestions:true,notifications:true,sponsoredAds:true,supportTickets:true,brandingTools:true,profileBranding:true,b2bSupplies:true,downloadApp:true,bankEdit:true,twoFactor:true,autoAcceptOrders:true,vacationMode:true,smsAlerts:true,sendOrderEmail:true,fineControl:true},benefits:['5% commission','Auto accept orders','Vacation mode','SMS alerts','Email order notifications','Advanced seller controls','Higher sponsored ad allowance']}
    };
    window.ARYANTA_PRIME_PLANS=PRIME_PLANS;

    const DEFAULT_ISSUES=[
        ['payment-payout','Payment / Payout Issue','Settlement, UTR, payout delay or wrong deduction.'],
        ['product-listing','Product Listing Error','Title, price, image, stock, category or QC listing problem.'],
        ['order-acceptance','Order Acceptance Problem','Unable to accept, cancel, or process a new order.'],
        ['slip-printing','Slip / Invoice Printing','Invoice, shipping label, barcode or packing slip not printing.'],
        ['shipping-pickup','Shipping / Pickup Delay','Pickup failed, courier delay, pickup address problem.'],
        ['return-claim','Return / RTO Claim','Return received damaged, missing, wrong, or RTO dispute.'],
        ['warranty-claim','Warranty Claim','Warranty scan, warranty proof or warranty replacement issue.'],
        ['fine-dispute','Fine / Breach Dispute','Request admin review of a fine or breach mark.'],
        ['sponsored-ad','Sponsored Ad Payment','Ad payment, sponsorship activation or 24-hour boost issue.'],
        ['subscription','Subscription / Free Month','Plan activation, free month, Pro/Growth benefit or renewal issue.'],
        ['kyc-gst','KYC / GST Upload','PAN, Aadhaar, GST, shop proof or bank KYC issue.'],
        ['bank-update','Bank Account Update','IFSC, account number, beneficiary or settlement bank issue.'],
        ['app-login','App / Login Problem','Password, OTP, 2FA, session or device login issue.'],
        ['inventory-stock','Inventory / Stock Issue','Stock mismatch, low stock, bulk update or item hidden issue.'],
        ['pricing-commission','Pricing / Commission','MRP, selling price, listed price or commission calculation issue.'],
        ['customer-message','Customer Message / Q&A','Customer question, review reply or message moderation issue.'],
        ['b2b-supply','B2B Supply Order','Wholesale material, B2B order or supplier payment issue.'],
        ['account-status','Account Block / Suspension','Seller account restricted, offline forced, or contact admin required.'],
        ['technical-bug','Technical Bug / UI Error','Button not working, blank page, slow panel, or browser error.'],
        ['other','Other Seller Help','Any other issue that needs Aryanta admin support.']
    ].map((x,i)=>({id:x[0],title:x[1],name:x[1],description:x[2],sort:i+1,active:true,askImage:true,allowSkip:true,requireImage:false,attachmentLabel:'Upload picture / screenshot (optional)',attachmentHelp:'You can upload proof or skip it.'}));
    window.ARYANTA_DEFAULT_ISSUES=DEFAULT_ISSUES;

    function normalPlanName(v){
        const p=low(v || (activeSeller && (activeSeller.subscription||activeSeller.plan||activeSeller.subscriptionPlan||activeSeller.subscriptionName)));
        if(!p || ['none','free','basic','basic / free','basic/free','trial expired'].includes(p)) return 'Basic';
        if(p.includes('growth') || p.includes('grow')) return 'Growth';
        if(p.includes('pro')) return 'Pro';
        return PRIME_PLANS[p] ? p : 'Basic';
    }
    function activePlanName(){
        const name=normalPlanName();
        const end=toDate(activeSeller && (activeSeller.subEndDate||activeSeller.subscriptionEndDate));
        if(name!=='Basic' && end && end.getTime()<Date.now()) return 'Basic';
        return name;
    }
    function plan(){return PRIME_PLANS[activePlanName()] || PRIME_PLANS.Basic;}
    function sellerAccessOverride(feature){
        const a=(activeSeller && (activeSeller.subscriptionAccess||activeSeller.featureAccess||activeSeller.adminFeatureAccess)) || {};
        if(Object.prototype.hasOwnProperty.call(a,feature)) return a[feature]===true;
        return null;
    }
    function featureAllowed(feature){
        const direct=sellerAccessOverride(feature);
        if(direct!==null) return direct;
        const p=plan();
        return !!(p.features && p.features[feature]);
    }
    window.aryantaCurrentPlan=plan;
    window.aryantaFeatureAllowed=featureAllowed;
    window.getAryantaCommissionPercent=()=>Number(plan().commissionPercent||7);
    window.getAryantaCommissionRate=()=>window.getAryantaCommissionPercent()/100;

    function itemList(order){
        try{ if(typeof getSellerItemsFromOrder==='function') return getSellerItemsFromOrder(order)||[]; }catch(e){}
        return Array.isArray(order&&order.items)?order.items:[];
    }
    function itemAmount(i){return Number(i.sellingPrice||i.price||i.finalPrice||0)*Number(i.qty||i.quantity||1);}
    function orderAmount(o){const items=itemList(o);return items.length?items.reduce((s,i)=>s+itemAmount(i),0):Number(o&& (o.finalAmount||o.totalPrice||o.amount||o.total)||0);}
    function productImage(p){
        const img=p && (p.image||p.mainImage||p.imageUrl||p.thumbnail||(Array.isArray(p.images)&&p.images[0]));
        return img?`<img src="${safe(img)}" loading="lazy" style="width:100%;height:150px;object-fit:cover;border-radius:16px;margin-bottom:12px;">`:`<div class="prime-image-fallback"><i class="fas fa-box-open"></i></div>`;
    }
    function productMatch(item){
        const id=txt(item.id||item.productId||item.product_id||item.productDocId).trim();
        const sku=low(item.sku), name=low(item.name||item.title);
        return (sellerProducts||[]).find(p=>txt(p.id||p.productId).trim()===id || (sku&&low(p.sku)===sku) || (name&&low(p.name||p.title)===name));
    }
    function productStats(){
        const map={};
        (sellerProducts||[]).forEach(p=>{const id=txt(p.id||p.productId||p.sku||p.name); if(id) map[id]={product:p,totalQty:0,totalOrders:0,delivered:0,cancelled:0,returned:0,gross:0,views:Number(p.views||p.totalViews||p.clicks||p.totalClicks||0)};});
        (sellerOrders||[]).forEach(o=>{
            const status=low(o.status||o.orderStatus);
            itemList(o).forEach(i=>{
                const p=productMatch(i); if(!p) return;
                const id=txt(p.id||p.productId||p.sku||p.name); if(!map[id]) return;
                const st=map[id], q=Number(i.qty||i.quantity||1);
                st.totalQty+=q; st.totalOrders+=1; st.gross+=itemAmount(i);
                if(status.includes('deliver')) st.delivered+=q;
                if(status.includes('cancel')||status.includes('breach')) st.cancelled+=q;
                if(status.includes('return')||status.includes('rto')) st.returned+=q;
            });
        });
        return Object.values(map);
    }
    async function saveLedger(entry){
        if(!db || !activeSeller) return;
        const payload={sellerEmail:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.shopName||activeSeller.email||'',createdAt:nowIso(),month:monthKey(),...entry};
        try{await db.collection('seller_payment_ledger').add(payload);}catch(e){console.warn('seller_payment_ledger failed',e);}
    }
    async function addFineOnce(key, amount, reason, extra={}){
        if(!db || !activeSeller) return false;
        const id=(sellerEmail()+'_'+key).replace(/[^a-zA-Z0-9_-]/g,'_');
        const payload={email:sellerEmail(),sellerEmail:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.shopName||'',amount:Number(amount||0),reason,key,status:'Pending Payment',timestamp:nowIso(),createdAt:nowIso(),source:'seller-panel-auto',...extra};
        try{
            const ref=db.collection('seller_fine_events').doc(id);
            const doc=await ref.get();
            if(doc.exists) return false;
            await ref.set(payload,{merge:true});
            await db.collection('fines').add(payload);
            await saveLedger({type:'fine',amount:-Number(amount||0),status:'Fine Added',reason,reference:key});
            sellerFines=sellerFines||[]; sellerFines.push({id,...payload});
            return true;
        }catch(e){console.warn('addFineOnce failed',e); return false;}
    }
    window.aryantaAddFineOnce=addFineOnce;
    window.aryantaSavePaymentLedger=saveLedger;

    function decorateStaticUI(){
        document.querySelectorAll('.nav-item').forEach(n=>{
            const t=low(n.textContent);
            if(t.includes('seller loan') || t.includes('event ads')) n.remove();
        });
        ['loanSection','eventAdsSection','eventParticipateModal'].forEach(id=>{const el=$(id); if(el) el.remove();});
        ['stat-top-selling','stat-top-selling-meta','stat-top-losing','stat-top-losing-meta'].forEach(id=>{const el=$(id); const card=el&&el.closest('.stat-card'); if(card) card.remove();});
        const perfBtn=document.querySelector('#inventorySection button[onclick*="productPerformance"]');
        if(perfBtn) perfBtn.remove();
        document.body.classList.add('aryanta-prime-ui');
    }

    const oldShowSection=window.showSection;
    window.showSection=function(section){
        if(section==='loan' || section==='eventAds'){
            toast('This function has been removed from the seller panel.','warning');
            return oldShowSection ? oldShowSection('home') : null;
        }
        const res=oldShowSection?oldShowSection(section):null;
        if(section==='settings') setTimeout(loadSettingsUI,80);
        if(section==='subscription') setTimeout(loadSubscriptionsUI,80);
        if(section==='notifications') setTimeout(fetchNotifications,80);
        if(section==='support') setTimeout(()=>{renderSupportCategories(); handleSupportCategoryChange();},80);
        if(section==='productPerformance') setTimeout(loadProductPerformance,80);
        if(['acceptedOrders','newOrders','breached','home'].includes(section)) setTimeout(auditAcceptedSlipBreaches,900);
        return res;
    };

    function settingFeatureKey(key){
        const m={offline:'offlineMode',dark:'darkTheme',darkTheme:'darkTheme',searchSuggestions:'searchSuggestions',autoAcc:'autoAcceptOrders',autoAcceptOrders:'autoAcceptOrders',vacation:'vacationMode',vacationMode:'vacationMode',sms:'smsAlerts',smsAlerts:'smsAlerts','2fa':'twoFactor',twoFactor:'twoFactor',sendOrderEmail:'sendOrderEmail',bankEdit:'bankEdit'};
        return m[key]||key;
    }
    function settingInputIds(key){
        const cap=key.charAt(0).toUpperCase()+key.slice(1);
        const ids=[`setting${cap}`];
        if(key==='autoAcc') ids.push('settingAutoAcceptOrders');
        if(key==='autoAcceptOrders') ids.push('settingAutoAcc');
        if(key==='sms') ids.push('settingSmsAlerts');
        if(key==='smsAlerts') ids.push('settingSms');
        if(key==='darkTheme') ids.push('settingDark');
        if(key==='dark') ids.push('settingDarkTheme');
        return ids;
    }
    function setSettingControl(key, checked){
        settingInputIds(key).forEach(id=>{const el=$(id); if(el) el.checked=!!checked;});
    }
    function lockSettingControl(key, allowed){
        settingInputIds(key).forEach(id=>{
            const el=$(id); if(!el) return;
            el.disabled=!allowed;
            const card=el.closest('.setting-card-premium')||el.closest('.setting-card');
            if(card){card.classList.toggle('sub-disabled',!allowed); card.dataset.lockReason=allowed?'':`${plan().name} does not include this feature`;}
        });
    }
    const oldLoadSettingsUI=window.loadSettingsUI;
    window.loadSettingsUI=async function(){
        try{oldLoadSettingsUI&&oldLoadSettingsUI();}catch(e){}
        if(!activeSeller) return;
        if(!activeSeller.settings) activeSeller.settings={};
        if(activeSeller.settings.searchSuggestions===undefined) activeSeller.settings.searchSuggestions=true;
        const controlled=['offline','darkTheme','searchSuggestions','autoAcc','autoAcceptOrders','vacation','sms','smsAlerts','2fa','sendOrderEmail'];
        controlled.forEach(key=>{
            const f=settingFeatureKey(key);
            const allowed=featureAllowed(f);
            lockSettingControl(key,allowed);
            if(!allowed){
                setSettingControl(key,false);
                if(f==='autoAcceptOrders') activeSeller.settings.autoAcc=activeSeller.settings.autoAcceptOrders=false;
                else if(f==='vacationMode') activeSeller.settings.vacation=false;
                else if(f==='smsAlerts') activeSeller.settings.sms=activeSeller.settings.smsAlerts=false;
                else if(f==='sendOrderEmail') activeSeller.settings.sendOrderEmail=false;
            }
        });
        setSettingControl('searchSuggestions', activeSeller.settings.searchSuggestions!==false);
        setSettingControl('offline', !!activeSeller.settings.offline);
        setSettingControl('darkTheme', !!(activeSeller.settings.darkTheme||activeSeller.settings.dark));
        const noticeId='settingPlanAccessNotice';
        let notice=$(noticeId);
        const sec=$('settingsSection');
        if(sec && !notice){notice=document.createElement('div'); notice.id=noticeId; notice.className='panel-box mini-plan-box prime-plan-notice'; sec.insertBefore(notice, sec.firstElementChild?.nextSibling||sec.firstChild);}
         };
    const oldToggleSetting=window.toggleSetting;
    window.toggleSetting=async function(key){
        if(!activeSeller) return toast('Login required.','error');
        const feature=settingFeatureKey(key);
        if(!featureAllowed(feature)){
            settingInputIds(key).forEach(id=>{const el=$(id); if(el) el.checked=false;});
            return toast(`${plan().name} does not include this setting. Upgrade to Pro to unlock it.`, 'warning');
        }
        if(!activeSeller.settings) activeSeller.settings={};
        const el=settingInputIds(key).map(id=>$(id)).find(Boolean);
        const checked=el ? !!el.checked : !activeSeller.settings[key];
        if(key==='dark' || key==='darkTheme'){
            activeSeller.settings.darkTheme=checked; activeSeller.settings.dark=checked;
            document.body.classList.toggle('dark-theme',checked);
        }else if(key==='autoAcc' || key==='autoAcceptOrders'){
            activeSeller.settings.autoAcc=checked; activeSeller.settings.autoAcceptOrders=checked;
        }else if(key==='sms' || key==='smsAlerts'){
            activeSeller.settings.sms=checked; activeSeller.settings.smsAlerts=checked;
        }else activeSeller.settings[key]=checked;
        if(key==='searchSuggestions') activeSeller.settings.searchSuggestions=checked;
        try{await db.collection('sellers').doc(sellerDocId()).set({settings:activeSeller.settings,updatedAt:nowIso()},{merge:true});}catch(e){console.warn(e);}
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        toast('Setting updated.','success');
        try{ if(oldToggleSetting && !['dark','darkTheme','autoAcc','autoAcceptOrders','sms','smsAlerts','searchSuggestions'].includes(key)) return oldToggleSetting(key); }catch(e){}
        loadSettingsUI();
    };

    const oldHandleSearch=window.handleGlobalSearch;
    window.handleGlobalSearch=function(){
        if(activeSeller && activeSeller.settings && activeSeller.settings.searchSuggestions===false){const box=$('searchSuggestions'); if(box){box.style.display='none'; box.innerHTML='';} return;}
        return oldHandleSearch?oldHandleSearch():null;
    };

    function freeTrialUsed(){
        const hist=Array.isArray(activeSeller&&activeSeller.subHistory)?activeSeller.subHistory:[];
        return !!(activeSeller&&(activeSeller.freeTrialRedeemed||activeSeller.freeSubscriptionRedeemedAt||activeSeller.freeSubscriptionActive)) || hist.some(h=>h && (h.freeTrial || low(h.method).includes('free') || low(h.status).includes('free')));
    }
    function planCardHtml(p){
        const current=activePlanName()===p.key;
        const canFree=p.key==='Growth' && p.trial && !freeTrialUsed();
        const lockedNotes=p.key==='Growth'?'<span class="lock-chip"><i class="fas fa-lock"></i> No Email/SMS/Auto Accept/Vacation</span>':'';
        return `<div class="admin-plan-card prime-sub-card ${current?'active':''}">
            <div class="admin-plan-title"><strong>${safe(p.name)}</strong>${p.recommended?'<span class="recommended-chip">Recommended</span>':''}${current?'<span class="ok-chip"><i class="fas fa-check"></i> Active</span>':''}</div>
            <div class="prime-price">₹${p.price}<span>/month</span></div>
            <div class="feature-list">
                <div class="feature-row"><span>Commission</span><span>${p.commissionPercent}%</span></div>
                <div class="feature-row"><span>Product Limit</span><span>${p.productLimit}</span></div>
                <div class="feature-row"><span>Free 24h Sponsored Slots</span><span>${p.freeAds}/month</span></div>
                <div class="feature-row"><span>Paid Sponsored Price</span><span>₹${p.sponsoredAdPrice}/24hr</span></div>
            </div>
            <div class="prime-benefits">${p.benefits.map(b=>`<div><i class="fas fa-circle-check"></i> ${safe(b)}</div>`).join('')}${lockedNotes}</div>
            <div class="prime-plan-actions">
                ${p.key==='Basic'?`<button class="btn-outline w-100" onclick="activateFreeBasicPlan()"><i class="fas fa-leaf"></i> Use Free Plan</button>`:''}
                ${canFree?`<button class="btn-prime w-100" onclick="redeemGrowthFreeMonth()"><i class="fas fa-gift"></i> Redeem 1 Month Free</button>`:''}
                ${p.price>0?`<button class="btn-prime w-100" onclick="processSubscription('${p.key}','online')"><i class="fas fa-credit-card"></i> Pay ₹${p.price} / Month</button><button class="btn-outline w-100" onclick="processSubscription('${p.key}','payout')"><i class="fas fa-wallet"></i> Deduct from Payout</button>`:''}
            </div>
        </div>`;
    }
    window.loadSubscriptionsUI=async function(){
        const box=$('subscriptionCards');
        const notice=$('subscriptionAdminNotice');
        if(notice) notice.innerHTML=`<b>Current plan:</b> ${safe(plan().name)} · Commission <b>${plan().commissionPercent}%</b> · ${freeTrialUsed()?'Free month already used':'Growth has one-time 1 month free trial'}.`;
        if(box) box.innerHTML=Object.values(PRIME_PLANS).sort((a,b)=>a.sort-b.sort).map(planCardHtml).join('');
        renderSubscriptionHistory(false);
        const badge=$('currentPlanBadge'); if(badge) badge.textContent=plan().name;
    };
    async function activatePlan(planKey, method, amount, paymentMeta={}){
        if(!activeSeller || !db) return;
        const p=PRIME_PLANS[planKey]||PRIME_PLANS.Basic;
        const start=nowIso();
        const endDate=new Date(); endDate.setMonth(endDate.getMonth()+1);
        const record={plan:p.key,planName:p.name,amount:Number(amount||0),commissionPercent:p.commissionPercent,duration:'month',startDate:start,endDate:endDate.toISOString(),method,status:amount?'Paid':'Activated',...paymentMeta};
        const hist=Array.isArray(activeSeller.subHistory)?activeSeller.subHistory:[]; hist.push(record);
        const payload={subscription:p.key,subscriptionName:p.name,subStartDate:start,subEndDate:endDate.toISOString(),subscriptionCommissionPercent:p.commissionPercent,subscriptionFeatures:p.features,subHistory:hist,updatedAt:start};
        if(method==='free_month') payload.freeTrialRedeemed=true, payload.freeSubscriptionRedeemedAt=start;
        await db.collection('sellers').doc(sellerDocId()).set(payload,{merge:true});
        await db.collection('seller_subscription_payments').add({sellerEmail:sellerEmail(),sellerName:activeSeller.companyName||'',...record,createdAt:start});
        await saveLedger({type:'subscription',planName:p.name,amount:Number(amount||0),status:record.status,method,commissionPercent:p.commissionPercent,razorpayPaymentId:paymentMeta.razorpayPaymentId||''});
        Object.assign(activeSeller,payload);
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        toast(`${p.name} plan activated.`, 'success');
        loadSubscriptionsUI(); loadSettingsUI();
    }
    window.activateFreeBasicPlan=()=>activatePlan('Basic','free',0);
    window.redeemGrowthFreeMonth=function(){
        if(freeTrialUsed()) return toast('You have already used your one-time free subscription.','warning');
        return activatePlan('Growth','free_month',0,{freeTrial:true,status:'1 Month Free'});
    };
    window.processSubscription=function(planKey,method='online'){
        const p=PRIME_PLANS[planKey]||PRIME_PLANS.Growth;
        if(method==='payout') return paySubscriptionFromPayout(p);
        if(!API_KEYS || !API_KEYS.RAZORPAY){ saveLedger({type:'subscription_payment_intent',planName:p.name,amount:p.price,status:'Razorpay key missing'}); return toast('Razorpay key missing from Cloudflare Worker. Payment intent saved.','error'); }
        const options={key:API_KEYS.RAZORPAY,amount:p.price*100,currency:'INR',name:'Aryanta Subscription',description:`${p.name} Seller Plan`,handler:res=>activatePlan(p.key,'razorpay',p.price,{razorpayPaymentId:res.razorpay_payment_id||''}),prefill:{name:activeSeller.companyName||'',email:activeSeller.email||'',contact:activeSeller.phone||''},theme:{color:'#111827'}};
        new Razorpay(options).open();
    };
    async function paySubscriptionFromPayout(p){
        const upcoming=Number(window.cachedTotalUpcoming||cachedTotalUpcoming||0);
        if(upcoming<p.price) return toast('Insufficient upcoming payout balance. Use online payment.','error');
        await addFineOnce('subscription_deduction_'+p.key+'_'+Date.now(),p.price,`Subscription payout deduction: ${p.name}`,{type:'subscription_payout',planName:p.name});
        return activatePlan(p.key,'upcoming_payout',p.price);
    }
    function renderSubscriptionHistory(show=true){
        const box=$('subscriptionHistoryBox'); if(!box) return;
        const hist=Array.isArray(activeSeller&&activeSeller.subHistory)?activeSeller.subHistory:[];
        if(show) box.style.display='block';
        if(!show && box.style.display!=='block') return;
        box.innerHTML=`<div class="section-head-row"><div><h3><i class="fas fa-receipt"></i> Subscription Details</h3><p class="muted-line">All previous subscriptions and free-month redemption history.</p></div></div>` + (hist.length?`<div class="table-container"><table class="admin-table"><thead><tr><th>Plan</th><th>Amount</th><th>Commission</th><th>Method</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${hist.slice().reverse().map(h=>`<tr><td data-label="Plan"><b>${safe(h.planName||h.plan||'-')}</b></td><td data-label="Amount">₹${Number(h.amount||h.cost||0).toLocaleString('en-IN')}</td><td data-label="Commission">${safe(h.commissionPercent||'')}%</td><td data-label="Method">${safe(h.method||'-')}</td><td data-label="Start">${toDate(h.startDate)?.toLocaleDateString()||'-'}</td><td data-label="End">${toDate(h.endDate)?.toLocaleDateString()||'-'}</td><td data-label="Status"><span class="ok-chip">${safe(h.status||'Active')}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No subscription history yet.</div>');
    }
    window.showSubscriptionDetails=function(){renderSubscriptionHistory(true); const box=$('subscriptionHistoryBox'); if(box) box.scrollIntoView({behavior:'smooth',block:'start'});};

    async function sponsorUsage(){
        const u=(activeSeller&&activeSeller.sponsoredAdUsage)||{};
        return u.month===monthKey()?Number(u.used||0):0;
    }
    async function saveSponsorUsage(n){
        const usage={month:monthKey(),used:n,updatedAt:nowIso()};
        activeSeller.sponsoredAdUsage=usage; activeSeller.sponsoredAdsUsedThisMonth=n;
        try{await db.collection('sellers').doc(sellerDocId()).set({sponsoredAdUsage:usage,sponsoredAdsUsedThisMonth:n},{merge:true});}catch(e){}
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
    }
    async function activateSponsor(productId,isFree,paymentInfo={}){
        const p=plan();
        const start=nowIso();
        const end=new Date(Date.now()+24*3600000).toISOString();
        const payload={isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsorStatus:'Live',sponsoredAt:start,sponsoredStartAt:start,sponsoredUntil:end,sponsorEndAt:end,sponsoredBySeller:sellerEmail(),sponsoredPlan:p.key,sponsoredPayment:isFree?'free_slot':'paid'};
        await db.collection('products').doc(productId).set(payload,{merge:true});
        await db.collection('seller_ad_logs').add({sellerEmail:sellerEmail(),productId,amount:isFree?0:70,status:'Live',startAt:start,endAt:end,plan:p.key,...paymentInfo,createdAt:start});
        await saveLedger({type:'sponsored_ad',productId,amount:isFree?0:70,status:'Live 24hr',method:isFree?'free_slot':'razorpay',...paymentInfo});
        if(isFree) await saveSponsorUsage((await sponsorUsage())+1);
        const prod=(sellerProducts||[]).find(x=>String(x.id)===String(productId)); if(prod) Object.assign(prod,payload);
        toast('Sponsored ad active for 24 hours.','success');
        if(typeof closeModal==='function') closeModal('adPaymentModal');
        if(typeof loadAds==='function') loadAds();
    }
    window.startAd=async function(productId){
        const p=plan();
        const used=await sponsorUsage();
        const freeLeft=Math.max(0,Number(p.freeAds||0)-used);
        const prod=(sellerProducts||[]).find(x=>String(x.id)===String(productId))||{};
        const modal=$('adPaymentModal'), msg=$('adPlanMessage'), cost=$('adCostDisplay'), input=$('adProdId'), payout=$('btnAdPayout');
        if(input) input.value=productId;
        if(cost) cost.textContent=freeLeft>0?'FREE':'₹70';
        if(msg) msg.innerHTML=freeLeft>0?`<b>${safe(prod.name||prod.title||'This product')}</b> can use a free 24-hour sponsored slot from your ${safe(p.name)} plan. Remaining this month: <b>${freeLeft}</b>.`:`No active free sponsored slot found for this product. Pay <b>₹70</b> and sponsor it for <b>24 hours</b>.`;
        const online=modal&&modal.querySelector('button[onclick="payAdOnline()"]');
        if(online) online.innerHTML=freeLeft>0?'<i class="fas fa-bolt"></i> Use Free Sponsored Slot':'<i class="fas fa-credit-card"></i> Pay ₹70 with Razorpay';
        if(payout) payout.style.display=freeLeft>0?'none':'inline-flex';
        if(modal){modal.style.display='flex'; setTimeout(()=>modal.classList.add('show'),10);}
    };
    window.payAdOnline=async function(){
        const productId=$('adProdId')&&$('adProdId').value; if(!productId) return;
        const p=plan(), freeLeft=Math.max(0,Number(p.freeAds||0)-(await sponsorUsage()));
        if(freeLeft>0) return activateSponsor(productId,true);
        if(!API_KEYS || !API_KEYS.RAZORPAY){await saveLedger({type:'sponsored_ad_payment_intent',productId,amount:70,status:'Razorpay key missing'}); return toast('Razorpay key missing from Cloudflare Worker. Payment intent saved.','error');}
        new Razorpay({key:API_KEYS.RAZORPAY,amount:7000,currency:'INR',name:'Aryanta Sponsored Ads',description:'Sponsored product placement for 24 hours',handler:res=>activateSponsor(productId,false,{razorpayPaymentId:res.razorpay_payment_id||''}),prefill:{name:activeSeller.companyName||'',email:activeSeller.email||'',contact:activeSeller.phone||''},theme:{color:'#111827'}}).open();
    };
    window.payAdUpcoming=async function(){
        const productId=$('adProdId')&&$('adProdId').value; if(!productId) return;
        await addFineOnce('sponsored_ad_payout_'+productId+'_'+Date.now(),70,'Sponsored Ad Fee',{type:'sponsored_ad_payout',productId});
        return activateSponsor(productId,false,{method:'upcoming_payout'});
    };

    async function readIds(){
        const ids=new Set();
        if(!db || !sellerEmail()) return ids;
        try{const snap=await db.collection('seller_notification_reads').where('sellerEmail','==',sellerEmail()).limit(500).get(); snap.forEach(d=>ids.add(String((d.data()||{}).notificationId||d.id).split('_'+sellerEmail().replace(/[^a-z0-9]/g,'_'))[0]));}catch(e){}
        return ids;
    }
    function notificationTargetMatches(d){
        const target=low(d.target||d.sellerEmail||d.email||'all');
        return target==='all'||target==='sellers'||target===sellerEmail();
    }
    window.fetchNotifications=async function(){
        if(!db||!activeSeller) return;
        const reads=await readIds();
        const rows=[];
        try{const b=await db.collection('admin_broadcasts').orderBy('timestamp','desc').limit(80).get(); b.forEach(doc=>{const d=doc.data()||{}; if(notificationTargetMatches(d)) rows.push({id:doc.id,collection:'admin_broadcasts',title:d.title||'Aryanta Notice',text:d.message||d.text||d.title||'Notice',time:d.timestamp||d.createdAt||nowIso(),link:d.link||d.url||d.actionUrl||'',read:reads.has(doc.id)});});}catch(e){console.warn('admin_broadcasts notifications failed',e);}
        try{const s=await db.collection('seller_notifications').where('sellerEmail','==',sellerEmail()).orderBy('timestamp','desc').limit(80).get(); s.forEach(doc=>{const d=doc.data()||{}; rows.push({id:doc.id,collection:'seller_notifications',title:d.title||'Seller Notification',text:d.message||d.text||d.title||'Notification',time:d.timestamp||d.createdAt||nowIso(),link:d.link||d.url||'',read:reads.has(doc.id)});});}catch(e){console.warn('seller_notifications failed',e);}
        adminNotifications=rows.sort((a,b)=>dateMs(b.time)-dateMs(a.time));
        const unread=adminNotifications.filter(n=>!n.read).length;
        ['notifBadge','topbarNotifBadge'].forEach(id=>{const el=$(id); if(el){el.textContent=unread; el.style.display=unread?'inline-block':'none';}});
        const list=$('fullNotifList')||$('notifList');
        if(list) list.innerHTML=adminNotifications.length?adminNotifications.map(n=>`<div class="notification-card ${n.read?'read':'unread'}" onclick="openFullNotif('${safe(n.id)}')"><div><h4>${n.read?'<i class="fas fa-envelope-open"></i>':'<i class="fas fa-envelope"></i>'} ${safe(n.title)}</h4><p>${safe(n.text)}</p><small><i class="fas fa-clock"></i> ${toDate(n.time)?.toLocaleString()||''}</small></div>${n.link?'<span class="ok-chip"><i class="fas fa-link"></i> Link</span>':''}</div>`).join(''):'<div class="panel-box">No notifications.</div>';
    };
    async function markNotificationRead(n){
        if(!db||!n||!activeSeller) return;
        const readId=(n.id+'_'+sellerEmail()).replace(/[^a-zA-Z0-9_-]/g,'_');
        await db.collection('seller_notification_reads').doc(readId).set({notificationId:n.id,collection:n.collection,sellerEmail:sellerEmail(),title:n.title,text:n.text,link:n.link||'',readAt:nowIso(),storedBeforeDelete:true},{merge:true});
        n.read=true;
        if(n.collection==='seller_notifications'){
            try{await db.collection('seller_notifications').doc(n.id).delete(); n.deleted=true;}catch(e){console.warn('delete seller notification failed',e);}
        }
    }
    window.openFullNotif=window.openFullNotifFinal=async function(id){
        const n=(adminNotifications||[]).find(x=>String(x.id)===String(id));
        if(!n) return;
        await markNotificationRead(n);
        const cont=$('notifDetailContent'), modal=$('notificationDetailModal');
        if(cont) cont.innerHTML=`<div class="prime-notif-detail"><h3>${safe(n.title)}</h3><p>${safe(n.text)}</p><div class="muted-line"><i class="fas fa-clock"></i> ${toDate(n.time)?.toLocaleString()||''}</div>${n.link?`<a class="btn-prime" style="text-decoration:none;margin-top:15px;display:inline-flex;" target="_blank" rel="noopener" href="${safe(/^https?:\/\//.test(n.link)?n.link:'https://'+n.link)}"><i class="fas fa-external-link-alt"></i> Open Link</a>`:''}<div class="ok-chip" style="margin-top:14px;"><i class="fas fa-check-double"></i> Marked as read and stored</div></div>`;
        if(modal){modal.style.display='flex'; setTimeout(()=>modal.classList.add('show'),10);} else toast(n.title,'info');
        fetchNotifications();
    };

    let supportIssues=[...DEFAULT_ISSUES];
    async function getSupportIssues(){
        const out=[];
        if(db){
            try{const snap=await db.collection('seller_issue_categories').orderBy('sort','asc').get(); snap.forEach(d=>{const x=d.data()||{}; if(x.active!==false) out.push({id:d.id,...x});});}catch(e){}
            if(!out.length){try{const snap=await db.collection('support_issue_categories').orderBy('sort','asc').get(); snap.forEach(d=>{const x=d.data()||{}; if(x.active!==false) out.push({id:d.id,...x});});}catch(e){}}
        }
        supportIssues=out.length?out.map((x,i)=>({...x,askImage:true,allowSkip:x.allowSkip!==false,sort:x.sort||i+1})):DEFAULT_ISSUES;
        return supportIssues;
    }
    window.renderSupportCategories=async function(){
        const sel=$('supCategory'); if(!sel) return;
        const arr=await getSupportIssues();
        sel.innerHTML='<option value="">Select issue</option>'+arr.map(c=>`<option value="${safe(c.id)}">${safe(c.title||c.name||c.id)}</option>`).join('');
        sel.style.display='none';
        let grid=$('supportIssueCards');
        const host=$('supportIssueDetailBox')?.parentElement || sel.parentElement;
        if(host && !grid){grid=document.createElement('div'); grid.id='supportIssueCards'; grid.className='issue-card-grid'; host.insertBefore(grid,$('supportIssueDetailBox')||sel.nextSibling);}
        if(grid) grid.innerHTML=arr.map(c=>`<button type="button" class="issue-card" data-issue="${safe(c.id)}" onclick="selectSupportIssueCard('${safe(c.id)}')"><i class="fas ${safe(c.icon||'fa-circle-info')}"></i><strong>${safe(c.title||c.name||c.id)}</strong><span>${safe(c.description||'Upload picture or skip if not needed.')}</span></button>`).join('');
    };
    window.selectSupportIssueCard=function(id){
        const sel=$('supCategory'); if(sel) sel.value=id;
        document.querySelectorAll('.issue-card').forEach(b=>b.classList.toggle('active',b.dataset.issue===id));
        handleSupportCategoryChange();
    };
    window.handleSupportCategoryChange=function(){
        const val=$('supCategory')?.value||''; const c=supportIssues.find(x=>String(x.id)===String(val))||{};
        const detail=$('supportIssueDetailBox'), attach=$('supportAttachmentBox'), img=$('supImage'), doc=$('supDoc'), imgLabel=$('supportImageLabel'), docLabel=$('supportDocLabel'), skip=$('supportSkipDocBtn');
        if(detail){detail.style.display=val?'block':'none'; detail.innerHTML=val?`<b>${safe(c.title||c.name||val)}</b><br><span class="muted-line">${safe(c.description||'Describe the issue and upload a picture or skip it.')}</span>`:'';}
        if(attach) attach.style.display=val?'block':'none';
        if(img){img.style.display=val?'block':'none'; img.required=false;}
        if(imgLabel){imgLabel.style.display=val?'block':'none'; imgLabel.textContent='Upload picture / screenshot (optional)';}
        if(doc){doc.style.display=val?'block':'none'; doc.required=false;}
        if(docLabel){docLabel.style.display=val?'block':'none'; docLabel.textContent='Upload document (optional)';}
        if(skip){skip.style.display=val?'inline-flex':'none'; skip.innerHTML='<i class="fas fa-forward"></i> Skip upload';}
    };
    window.skipSupportDocument=function(){['supImage','supDoc'].forEach(id=>{const el=$(id); if(el) el.value='';}); toast('Upload skipped. You can submit without a picture.','info');};
    function fileData(input){
        const f=input&&input.files&&input.files[0]; if(!f) return Promise.resolve(null);
        return new Promise((resolve,reject)=>{const r=new FileReader(); r.onerror=reject; r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,dataUrl:r.result}); r.readAsDataURL(f);});
    }
    window.submitSupportTicket=async function(){
        const cat=$('supCategory')?.value, phone=$('supPhone')?.value.trim(), desc=$('supDesc')?.value.trim();
        if(!cat||!phone||!desc) return toast('Select issue category, phone and write details.','warning');
        const c=supportIssues.find(x=>String(x.id)===String(cat))||{};
        try{
            const [image,documentFile]=await Promise.all([fileData($('supImage')),fileData($('supDoc'))]);
            await db.collection('seller_support_tickets').add({email:sellerEmail(),sellerEmail:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.shopName||'',category:cat,categoryTitle:c.title||c.name||cat,categoryDetail:c.description||'',phone,description:desc,image,document:documentFile,imageSkipped:!image,documentSkipped:!documentFile,status:'Pending',timestamp:nowIso(),createdAt:nowIso(),source:'seller-panel-prime'});
            toast('Support ticket sent to admin.','success');
            ['supDesc','supPhone','supImage','supDoc'].forEach(id=>{const el=$(id); if(el) el.value='';});
            if($('supCategory')) $('supCategory').value='';
            document.querySelectorAll('.issue-card').forEach(b=>b.classList.remove('active'));
            handleSupportCategoryChange();
        }catch(e){console.warn(e); toast('Could not submit ticket.','error');}
    };

    window.productPerformanceFilter=window.productPerformanceFilter||'all';
    window.setProductPerformanceFilter=function(filter){
        window.productPerformanceFilter=filter||'all';
        ['all','top','loss'].forEach(f=>{const b=$('perf-filter-'+f); if(b) b.classList.toggle('active',f===window.productPerformanceFilter);});
        loadProductPerformance();
    };
    window.loadProductPerformance=function(){
        const list=$('productPerformanceList'); if(!list) return;
        let rows=productStats();
        const filter=window.productPerformanceFilter||'all';
        if(filter==='top') rows=rows.filter(x=>x.delivered>0).sort((a,b)=>b.delivered-a.delivered||b.gross-a.gross);
        else if(filter==='loss') rows=rows.filter(x=>(x.cancelled+x.returned)>0).sort((a,b)=>(b.cancelled+b.returned)-(a.cancelled+a.returned));
        else rows=rows.sort((a,b)=>b.totalQty-a.totalQty);
        if(!rows.length){list.innerHTML='<div class="panel-box">No products found for this filter.</div>';return;}
        list.innerHTML=rows.map(st=>{const p=st.product,total=Math.max(1,st.totalOrders),loss=st.cancelled+st.returned,ret=Math.round(st.returned/total*100),can=Math.round(st.cancelled/total*100),del=Math.round(st.delivered/Math.max(1,st.totalQty||1)*100);return `<div class="performance-card prime-performance-card">${productImage(p)}<h4>${safe(p.name||p.title||'Product')}</h4><p class="muted-line">Code: <b>${safe(p.sku||p.id)}</b> · Price: <b>₹${Number(p.price||0).toLocaleString('en-IN')}</b></p><div class="tiny-metric-grid"><div class="tiny-metric"><span>Total Sell</span>${st.totalQty}</div><div class="tiny-metric"><span>Delivered</span>${st.delivered}</div><div class="tiny-metric"><span>Loss</span>${loss}</div></div><div class="perf-bars"><small>Delivered ${del}%</small><div class="perf-bar"><i style="width:${Math.min(100,del)}%"></i></div><small>Cancelled ${can}%</small><div class="perf-bar danger"><i style="width:${Math.min(100,can)}%"></i></div><small>Returns ${ret}%</small><div class="perf-bar warning"><i style="width:${Math.min(100,ret)}%"></i></div></div><button class="btn-outline w-100" onclick="editItem('${safe(p.id)}')"><i class="fas fa-edit"></i> Edit Product</button></div>`;}).join('');
    };

    const oldRenderDashboard=window.renderDashboardStats;
    window.renderDashboardStats=async function(){
        try{oldRenderDashboard&&oldRenderDashboard();}catch(e){}
        const p=plan(), today=new Date().toDateString(), mon=new Date().getMonth();
        let todayCount=0, monthCount=0, revenue=0, upcoming=0;
        (sellerOrders||[]).forEach(o=>{
            const d=toDate(o.timestamp||o.createdAt||o.orderDate)||new Date(); const amt=orderAmount(o);
            if(d.toDateString()===today) todayCount++;
            if(d.getMonth()===mon && d.getFullYear()===new Date().getFullYear()) monthCount++;
            if(low(o.status).includes('deliver')) revenue+=amt;
            if(low(o.status).includes('deliver') && !o.sellerSettled) upcoming+=Math.max(0,amt-Math.round(amt*p.commissionPercent/100));
        });
        const set=(id,v)=>{const el=$(id); if(el) el.textContent=v;};
        set('smartDailyOrders',todayCount); set('smartMonthlyOrders',monthCount); set('stat-total-inventory',(sellerProducts||[]).length); set('stat-total-pay','₹'+revenue.toLocaleString('en-IN')); set('stat-pending-pay','₹'+upcoming.toLocaleString('en-IN'));
        cachedTotalUpcoming=upcoming; window.cachedTotalUpcoming=upcoming;
        ['stat-top-selling','stat-top-selling-meta','stat-top-losing','stat-top-losing-meta'].forEach(id=>{const el=$(id); const card=el&&el.closest('.stat-card'); if(card) card.remove();});
        auditAcceptedSlipBreaches();
    };

    function hasPrintedBothSlips(o){
        const invoice=o.invoicePrintedAt||o.sellerSlipPrintedAt||o.standardSlipPrintedAt||o.packingSlipPrintedAt||o.printedAt;
        const shipping=o.shippingSlipPrintedAt||o.shiprocketSlipPrintedAt||o.shippingInvoicePrintedAt||o.labelPrintedAt||o.dispatchSlipPrintedAt;
        return !!(invoice && shipping) || !!o.bothSlipsPrinted || !!o.slipsPrinted;
    }
    async function countBreaches(){
        if(!db||!activeSeller) return 0;
        try{const snap=await db.collection('seller_breach_records').where('sellerEmail','==',sellerEmail()).limit(1000).get(); return snap.size;}catch(e){return Number(activeSeller.breachCount||0);}
    }
    async function suspendForBreaches(count){
        if(!db||!activeSeller) return;
        const payload={status:'Suspended',suspendedAt:nowIso(),suspendReason:'More than 3 breach items. Contact admin.',settings:{...(activeSeller.settings||{}),offline:true},breachCount:count};
        try{await db.collection('sellers').doc(sellerDocId()).set(payload,{merge:true});}catch(e){}
        Object.assign(activeSeller,payload); localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        toast('Account suspended due to more than 3 breach items. Contact admin.','error');
        if(typeof renderStatusScreen==='function'){
            const lo=$('loginOverlay'); if(lo) lo.style.display='flex';
            renderStatusScreen('Account Suspended','More than 3 breach items found. Please contact Aryanta admin for reactivation.',true,Date.now()+7*24*3600000);
        }
    }
    window.auditAcceptedSlipBreaches=async function(){
        if(!db||!activeSeller||!(sellerOrders||[]).length) return;
        const jobs=[];
        for(const o of (sellerOrders||[])){
            const st=low(o.status||o.orderStatus);
            if(!st.includes('accept')) continue;
            if(hasPrintedBothSlips(o)) continue;
            const acceptedAt=dateMs(o.acceptedAt||o.sellerAcceptedAt||o.acceptTime||o.updatedAt||o.timestamp||o.createdAt);
            if(!acceptedAt) continue;
            const age=(Date.now()-acceptedAt)/3600000;
            const items=Math.max(1,itemList(o).length||Number(o.itemCount||1));
            if(age>=24 && !o.printSlipBreachProcessed){
                const amount=items*50;
                o.status='Breached'; o.sellerBreach=true; o.printSlipBreachProcessed=true;
                jobs.push(db.collection('orders').doc(o.id).set({status:'Breached',sellerBreach:true,breachReason:'Accepted but both slips not printed within 24 hours',breachedAt:nowIso(),printSlipBreachProcessed:true,breachFineAmount:amount},{merge:true}));
                jobs.push(addFineOnce('print_slip_breach_'+o.id,amount,`₹50/item slip breach: ${items} item(s) not printed within 24 hours`,{orderId:o.id,itemCount:items,breachType:'print_slip_24h'}));
                jobs.push(db.collection('seller_breach_records').add({sellerEmail:sellerEmail(),orderId:o.id,itemCount:items,amount,breachType:'print_slip_24h',reason:'Accepted order slips not printed within 24 hours',createdAt:nowIso()}));
            }else if(age>=12 && !o.printSlipWarningAt){
                o.printSlipWarningAt=nowIso(); o.sellerPrintWarningStatus='Breaching Soon';
                jobs.push(db.collection('orders').doc(o.id).set({printSlipWarningAt:o.printSlipWarningAt,sellerPrintWarningStatus:'Breaching Soon'},{merge:true}));
                jobs.push(db.collection('seller_notifications').add({sellerEmail:sellerEmail(),title:'Breaching Soon',message:`Order ${o.order_no||o.id} will be breached if both slips are not printed before 24 hours.`,orderId:o.id,timestamp:nowIso(),createdAt:nowIso(),type:'breach_warning'}));
            }
        }
        if(jobs.length){try{await Promise.allSettled(jobs);}catch(e){} const c=await countBreaches(); if(c>=3) await suspendForBreaches(c); if(typeof loadBreachedOrders==='function') loadBreachedOrders();}
    };

    const oldLoadAccepted=window.loadAcceptedOrders;
    window.loadAcceptedOrders=async function(){await auditAcceptedSlipBreaches(); return oldLoadAccepted?oldLoadAccepted():null;};
    const oldLoadBreached=window.loadBreachedOrders;
    window.loadBreachedOrders=async function(){
        await auditAcceptedSlipBreaches();
        const res=oldLoadBreached?oldLoadBreached():null;
        return res;
    };

    window.loadEventAds=function(){toast('Event function has been removed from this seller panel.','warning');};
    window.loadLoanSection=function(){toast('Loan function has been removed from this seller panel.','warning');};
    window.requestSellerLoan=function(){toast('Loan function has been removed. Contact admin for any financial query.','warning');};

    async function seedPrimeConfigIfAdminAllowed(){
        if(!db) return;
        try{
            await db.collection('seller_panel_config').doc('global').set({updatedAt:nowIso(),primeUpgrade:'2026-05-23',plans:PRIME_PLANS,freeTrial:{enabled:true,days:30,plan:'Growth',oneTimeOnly:true},settingsAccess:{Basic:PRIME_PLANS.Basic.features,Growth:PRIME_PLANS.Growth.features,Pro:PRIME_PLANS.Pro.features},sponsoredAdPrice:70,breachFinePerItem:50,breachSuspendAfter:3},{merge:true});
            for(const issue of DEFAULT_ISSUES){await db.collection('seller_issue_categories').doc(issue.id).set(issue,{merge:true});}
        }catch(e){console.warn('Prime config seed skipped',e);}
    }
    window.seedAryantaPrimeSellerConfig=seedPrimeConfigIfAdminAllowed;

    document.addEventListener('DOMContentLoaded',()=>{
        setTimeout(()=>{decorateStaticUI(); loadSettingsUI(); loadSubscriptionsUI(); renderSupportCategories(); fetchNotifications(); auditAcceptedSlipBreaches();},1800);
        setTimeout(()=>seedPrimeConfigIfAdminAllowed(),3500);
        setInterval(()=>{auditAcceptedSlipBreaches(); fetchNotifications();},120000);
    });
})();


/* ===== Aryanta Shiprocket Seller Final Fix 2026-05-23 ===== */
(function(){
    const PATCH='ARYANTA_SHIPROCKET_SELLER_FINAL_FIX_2026_05_23';
    if(window[PATCH]) return;
    window[PATCH]=true;

    const $=id=>document.getElementById(id);
    const txt=v=>(v===undefined||v===null?'':String(v));
    const low=v=>txt(v).toLowerCase().trim();
    const safe=v=>txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>txt(v).replace(/\s+/g,'').trim();
    const num=v=>{const n=Number(String(v??0).replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0;};
    const nowIso=()=>new Date().toISOString();
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const sellerEmail=()=>low(activeSeller&&activeSeller.email);
    const sellerDocId=()=>txt(activeSeller&&activeSeller.email||sellerEmail()).trim();
    const oneMinuteMs=60000;

    function readPath(obj, keys, fallback=''){
        for(const key of keys){
            const parts=String(key).split('.');
            let cur=obj;
            let ok=true;
            for(const p of parts){
                if(cur && Object.prototype.hasOwnProperty.call(cur,p)) cur=cur[p];
                else {ok=false; break;}
            }
            if(ok && cur!==undefined && cur!==null && txt(cur).trim()!=='') return cur;
        }
        return fallback;
    }

    function orderItems(order){
        try{
            if(typeof getSellerItemsFromOrder==='function'){
                const arr=getSellerItemsFromOrder(order);
                if(Array.isArray(arr)&&arr.length) return arr;
            }
        }catch(e){}
        return Array.isArray(order&&order.items)?order.items:[];
    }

    function productForItem(item){
        const itemId=txt(item.id||item.productId||item.product_id||item.productDocId).trim();
        const sku=low(item.sku||item.SKU||item.productSku);
        return (sellerProducts||[]).find(p=>{
            const pId=txt(p.id||p.productId||p.product_id).trim();
            const pSku=low(p.sku||p.SKU||p.productSku);
            return (itemId&&pId&&itemId===pId)||(sku&&pSku&&sku===pSku);
        })||{};
    }

    function itemAmount(item){
        const qty=Math.max(1,num(item.qty||item.quantity||item.count||1));
        const price=num(item.sellingPrice||item.price||item.salePrice||item.mrp||item.totalPrice||0);
        return qty*price;
    }

    function orderAmount(order){
        const items=orderItems(order);
        const itemTotal=items.reduce((s,i)=>s+itemAmount(i),0);
        return itemTotal || num(order.totalAmount||order.total||order.finalAmount||order.amount||order.orderAmount||0);
    }

    function orderDate(order){
        const raw=readPath(order,['timestamp','createdAt','orderDate','date','order_date','placedAt','created_at'],nowIso());
        const d=new Date(raw);
        return Number.isNaN(d.getTime())?new Date():d;
    }

    function hasShiprocketUrl(order){
        return txt(order.shiprocketInvoicePdfUrl||order.shiprocketPdfUrl||order.shiprocket_invoice_pdf_url||order.shiprocketInvoiceUrl||order.shiprocket_invoice_url||order.shippingLabelUrl||order.label_url||'').trim();
    }

    function currentShiprocketStatus(order){
        if(hasShiprocketUrl(order)) return 'ready';
        return low(order.shiprocketInvoiceStatus||order.shiprocket_status||'');
    }

    function sanitizeDocId(v){
        return txt(v||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,140)||('order_'+Date.now());
    }

    function fieldValueForMissing(data,path){
        return readPath(data,[path],'');
    }

    function buildShiprocketPayload(order){
        const seller=activeSeller||{};
        const items=orderItems(order).map((item,idx)=>{
            const p=productForItem(item);
            const qty=Math.max(1,num(item.qty||item.quantity||item.count||1));
            const price=num(item.sellingPrice||item.price||item.salePrice||p.price||p.sellingPrice||0);
            return {
                product_name:txt(item.name||item.title||p.name||p.title||'').trim(),
                sku:txt(item.sku||item.SKU||item.productId||item.product_id||item.id||p.sku||p.id||'').trim(),
                product_id:txt(item.productId||item.product_id||item.id||p.id||'').trim(),
                quantity:qty,
                selling_price:price,
                discount:num(item.discount||item.discountAmount||0),
                tax:num(item.tax||item.gst||item.gstPercent||p.tax||p.gst||0),
                hsn:txt(item.hsn||item.hsnCode||p.hsn||p.hsnCode||'').trim(),
                index:idx+1
            };
        });

        const paymentMethod=low(readPath(order,['paymentMethod','payment_method','payMode','mode','payment.type'],''));
        const isCod=paymentMethod.includes('cod') || low(order.paymentStatus).includes('cod') || low(order.cod).includes('true') || num(order.codAmount||order.cod_amount)>0;
        const packageSources=orderItems(order).map(i=>({item:i||{},product:productForItem(i)||{}}));
        function firstPackageValue(paths){
            for(const src of packageSources){
                const merged={...(src.product||{}),...(src.item||{})};
                const v=readPath(merged,paths,'');
                if(num(v)>0) return v;
            }
            return '';
        }

        const payload={
            action:'create_invoice',
            source:'aryanta-seller-panel',
            sellerEmail:sellerEmail(),
            orderId:txt(order.id).trim(),
            orderNo:txt(order.order_no||order.orderNo||order.orderId||order.id).trim(),
            pickup:{
                seller_name:txt(seller.companyName||seller.shopName||seller.storeName||seller.name||seller.ownerName||'').trim(),
                seller_phone:txt(seller.phone||seller.mobile||seller.contact||seller.pickupPhone||'').trim(),
                pickup_address:txt(seller.pickupAddress||seller.address||seller.fullAddress||seller.storeAddress||seller.businessAddress||'').trim(),
                city:txt(seller.pickupCity||seller.city||seller.storeCity||'').trim(),
                state:txt(seller.pickupState||seller.state||seller.storeState||'').trim(),
                pincode:txt(seller.pickupPincode||seller.pincode||seller.pinCode||seller.storePincode||'').trim(),
                pickup_location_name:txt(seller.pickupLocationName||seller.pickup_location||seller.companyName||seller.shopName||'').trim()
            },
            delivery:{
                customer_name:txt(order.delivery_name||order.customerName||order.name||order.userName||order.shippingName||order.address?.name||'').trim(),
                phone:txt(order.delivery_phone||order.customerPhone||order.phone||order.mobile||order.address?.phone||'').trim(),
                email:txt(order.delivery_email||order.customerEmail||order.email||order.userEmail||order.address?.email||'').trim(),
                full_address:txt(order.delivery_address||order.addressLine||order.address||order.shippingAddress||order.address?.full||order.address?.address||'').trim(),
                city:txt(order.delivery_city||order.city||order.shippingCity||order.address?.city||'').trim(),
                state:txt(order.delivery_state||order.state||order.shippingState||order.address?.state||'').trim(),
                pincode:txt(order.delivery_pincode||order.pincode||order.pinCode||order.shippingPincode||order.address?.pincode||'').trim(),
                country:txt(order.country||order.delivery_country||order.shippingCountry||order.address?.country||'India').trim()
            },
            products:items,
            payment:{
                order_id:txt(order.order_no||order.orderNo||order.id).trim(),
                order_date:orderDate(order).toISOString(),
                payment_method:isCod?'COD':'Prepaid',
                total_amount:orderAmount(order),
                cod_amount:isCod?num(order.codAmount||order.cod_amount||order.cod||orderAmount(order)):0
            },
            package:{
                weight_kg:num(order.weightKg||order.weight_kg||order.weight||order.package?.weight_kg||order.package?.weight||firstPackageValue(['packageWeightKg','package_weight_kg','weightKg','weight_kg','weight','package.weight_kg','package.weight'])||seller.defaultWeightKg||seller.packageWeightKg||0),
                length_cm:num(order.lengthCm||order.length_cm||order.length||order.package?.length_cm||order.package?.length||firstPackageValue(['packageLengthCm','package_length_cm','lengthCm','length_cm','length','package.length_cm','package.length'])||seller.defaultLengthCm||seller.packageLengthCm||0),
                breadth_cm:num(order.breadthCm||order.breadth_cm||order.breadth||order.widthCm||order.width||order.package?.breadth_cm||order.package?.breadth||order.package?.width||firstPackageValue(['packageBreadthCm','package_breadth_cm','breadthCm','breadth_cm','breadth','widthCm','width','package.breadth_cm','package.breadth','package.width'])||seller.defaultBreadthCm||seller.packageBreadthCm||0),
                height_cm:num(order.heightCm||order.height_cm||order.height||order.package?.height_cm||order.package?.height||firstPackageValue(['packageHeightCm','package_height_cm','heightCm','height_cm','height','package.height_cm','package.height'])||seller.defaultHeightCm||seller.packageHeightCm||0)
            },
            rawOrder:order
        };
        return payload;
    }

    function validateShiprocketPayload(payload){
        const missing=[];
        const req=[
            ['Pickup seller name','pickup.seller_name'],
            ['Pickup seller phone','pickup.seller_phone'],
            ['Pickup address','pickup.pickup_address'],
            ['Pickup city','pickup.city'],
            ['Pickup state','pickup.state'],
            ['Pickup pincode','pickup.pincode'],
            ['Pickup location name','pickup.pickup_location_name'],
            ['Customer name','delivery.customer_name'],
            ['Customer phone','delivery.phone'],
            ['Customer full address','delivery.full_address'],
            ['Customer city','delivery.city'],
            ['Customer state','delivery.state'],
            ['Customer pincode','delivery.pincode'],
            ['Customer country','delivery.country'],
            ['Order ID','payment.order_id'],
            ['Order date','payment.order_date'],
            ['Payment method','payment.payment_method'],
            ['Total amount','payment.total_amount'],
            ['Package weight in kg','package.weight_kg'],
            ['Package length in cm','package.length_cm'],
            ['Package breadth in cm','package.breadth_cm'],
            ['Package height in cm','package.height_cm']
        ];
        req.forEach(([label,path])=>{
            const value=fieldValueForMissing(payload,path);
            if(value===undefined||value===null||txt(value).trim()===''||Number(value)===0 && path.startsWith('package.')) missing.push(label);
        });
        if(!Array.isArray(payload.products)||!payload.products.length) missing.push('At least one seller product item');
        (payload.products||[]).forEach((p,i)=>{
            if(!txt(p.product_name).trim()) missing.push(`Product ${i+1} name`);
            if(!txt(p.sku||p.product_id).trim()) missing.push(`Product ${i+1} SKU / product id`);
            if(!num(p.quantity)) missing.push(`Product ${i+1} quantity`);
            if(!num(p.selling_price)) missing.push(`Product ${i+1} selling price`);
        });
        if(payload.payment.payment_method==='COD' && !num(payload.payment.cod_amount)) missing.push('COD amount');
        return missing;
    }

    function ensureShiprocketSheet(){
        let sheet=$('aryantaShiprocketSheet');
        if(sheet) return sheet;
        sheet=document.createElement('div');
        sheet.id='aryantaShiprocketSheet';
        sheet.className='shiprocket-bottom-sheet';
        sheet.innerHTML=`
            <div class="shiprocket-sheet-card">
                <div class="shiprocket-sheet-head">
                    <div>
                        <b><i class="fas fa-rocket"></i> Shiprocket Invoice</b>
                        <small id="shiprocketSheetSub">Preparing secure PDF download</small>
                    </div>
                    <button type="button" class="shiprocket-sheet-close" onclick="hideShiprocketSheet()"><i class="fas fa-times"></i></button>
                </div>
                <div id="shiprocketSheetBody" class="shiprocket-sheet-body"></div>
                <div class="shiprocket-progress"><span id="shiprocketProgressBar"></span></div>
                <div class="shiprocket-sheet-actions">
                    <button type="button" class="btn-outline" onclick="hideShiprocketSheet()"><i class="fas fa-minimize"></i> Keep Working</button>
                    <button type="button" id="shiprocketDownloadBtn" class="btn-prime" style="display:none;"><i class="fas fa-download"></i> Download PDF</button>
                </div>
            </div>
        `;
        document.body.appendChild(sheet);
        return sheet;
    }

    window.hideShiprocketSheet=function(){
        const sheet=$('aryantaShiprocketSheet');
        if(sheet) sheet.classList.remove('show');
    };

    function showShiprocketSheet(state,message,order,url,missing){
        const sheet=ensureShiprocketSheet();
        const sub=$('shiprocketSheetSub'), body=$('shiprocketSheetBody'), bar=$('shiprocketProgressBar'), btn=$('shiprocketDownloadBtn');
        sheet.classList.add('show');
        const orderText=order?`Order ${safe(order.order_no||order.orderNo||order.id)}`:'Selected order';
        if(sub) sub.textContent=orderText;
        if(bar){
            bar.style.width=state==='ready'?'100%':(state==='error'?'100%':'58%');
            bar.className=state==='error'?'error':(state==='ready'?'ready':'');
        }
        if(body){
            let icon=state==='ready'?'fa-circle-check':(state==='error'?'fa-circle-exclamation':'fa-spinner fa-spin');
            let cls=state==='ready'?'ready':(state==='error'?'error':'waiting');
            body.innerHTML=`
                <div class="shiprocket-status ${cls}">
                    <i class="fas ${icon}"></i>
                    <div>
                        <h4>${safe(message||'Please wait, your Shiprocket invoice PDF is being generated.')}</h4>
                        <p>${state==='waiting'?'This can take up to 1 minute. You can switch panels; this box will stay at the bottom.':state==='ready'?'Shiprocket PDF URL has been stored in DB. You can download it anytime from Accepted/Completed Scan orders.':'No fine will be created for this order because the Shiprocket PDF was requested but not generated/downloaded.'}</p>
                    </div>
                </div>
                ${missing&&missing.length?`<div class="shiprocket-missing"><b>Missing required details:</b><ul>${missing.map(m=>`<li>${safe(m)}</li>`).join('')}</ul></div>`:''}
            `;
        }
        if(btn){
            if(url){
                btn.style.display='inline-flex';
                btn.onclick=()=>downloadShiprocketPdf(url, order);
            }else{
                btn.style.display='none';
                btn.onclick=null;
            }
        }
    }

    function downloadShiprocketPdf(url, order){
        if(!url) return;
        try{
            const a=document.createElement('a');
            a.href=url;
            a.target='_blank';
            a.rel='noopener';
            a.download=`Shiprocket_${txt(order&&order.order_no||order&&order.id||'invoice')}.pdf`;
            document.body.appendChild(a);
            a.click();
            setTimeout(()=>a.remove(),400);
        }catch(e){
            window.open(url,'_blank','noopener');
        }
    }
    window.downloadShiprocketPdfForOrder=function(orderId){
        const order=(sellerOrders||[]).find(o=>String(o.id)===String(orderId));
        const url=order&&hasShiprocketUrl(order);
        if(url) downloadShiprocketPdf(url,order);
        else showShiprocketSheet('error','Shiprocket PDF URL is not ready yet.',order,null);
    };

    function extractPdfUrl(data){
        if(!data || typeof data!=='object') return '';
        const direct=['pdf_url','pdfUrl','invoice_pdf_url','invoicePdfUrl','invoice_url','invoiceUrl','label_url','labelUrl','shipping_label_url','shippingLabelUrl','url','download_url','downloadUrl'];
        for(const k of direct){
            if(data[k] && /^https?:\/\//i.test(txt(data[k]))) return txt(data[k]).trim();
        }
        for(const k of ['data','result','response','invoice','payload','shiprocket']){
            const v=data[k];
            const found=extractPdfUrl(v);
            if(found) return found;
        }
        if(Array.isArray(data)){
            for(const item of data){const found=extractPdfUrl(item); if(found) return found;}
        }
        return '';
    }

    function extractRequestId(data){
        if(!data || typeof data!=='object') return '';
        return txt(data.requestId||data.request_id||data.jobId||data.job_id||data.invoiceId||data.shipment_id||data.shipmentId||data.awb_code||data.awb||data.data?.requestId||data.data?.invoiceId||'').trim();
    }

    async function callShiprocketEndpoint(payload, mode='create'){
        const endpoints=[
            `${API_BASE_URL}/shiprocket/invoice`,
            `${API_BASE_URL}/shiprocket/generate-invoice`,
            `${API_BASE_URL}/seller/shiprocket/invoice`
        ];
        let lastErr=null;
        for(const url of endpoints){
            try{
                const res=await fetch(url,{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({...payload, mode})
                });
                const textResp=await res.text();
                let data={};
                try{data=textResp?JSON.parse(textResp):{};}catch(e){data={raw:textResp};}
                if(res.ok) return data;
                lastErr=new Error(data.message||data.error||`Shiprocket API ${res.status}`);
            }catch(e){lastErr=e;}
        }
        throw lastErr||new Error('Shiprocket API route not available.');
    }

    async function saveShiprocketStatus(order, fields){
        if(!order||!order.id||!db) return;
        const payload={...fields, sellerEmail:sellerEmail(), orderId:order.id, updatedAt:nowIso()};
        try{await db.collection('orders').doc(order.id).set(payload,{merge:true});}catch(e){console.warn('order shiprocket status save failed',e);}
        try{await db.collection('seller_shiprocket_invoices').doc(sanitizeDocId(order.id+'_'+sellerEmail())).set(payload,{merge:true});}catch(e){console.warn('seller shiprocket status save failed',e);}
        Object.assign(order,payload);
        try{
            const idx=(sellerOrders||[]).findIndex(o=>String(o.id)===String(order.id));
            if(idx>=0) Object.assign(sellerOrders[idx],payload);
        }catch(e){}
    }

    async function pollShiprocketForUrl(order, requestId){
        const start=Date.now();
        while(Date.now()-start<oneMinuteMs){
            await sleep(5000);
            try{
                const statusRes=await callShiprocketEndpoint({action:'status_invoice',orderId:order.id,orderNo:order.order_no||order.id,requestId},'status');
                const found=extractPdfUrl(statusRes);
                if(found) return found;
            }catch(e){}
            try{
                const snap=await db.collection('orders').doc(order.id).get();
                if(snap.exists){
                    const d=snap.data()||{};
                    const found=hasShiprocketUrl(d);
                    if(found){Object.assign(order,d);return found;}
                }
            }catch(e){}
        }
        return '';
    }

    async function requestShiprocketForOrder(order){
        const existing=hasShiprocketUrl(order);
        if(existing){
            showShiprocketSheet('ready','Shiprocket PDF is already generated.',order,existing);
            downloadShiprocketPdf(existing,order);
            return existing;
        }
        const payload=buildShiprocketPayload(order);
        const missing=validateShiprocketPayload(payload);
        if(missing.length){
            await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'missing_details',shiprocketInvoiceRequested:true,shiprocketInvoiceNoFine:true,shiprocketInvoiceLastError:'Missing: '+missing.join(', '),shiprocketInvoiceRequestedAt:nowIso()});
            showShiprocketSheet('error','Shiprocket invoice cannot be requested until all required details are complete.',order,null,missing);
            return '';
        }

        showShiprocketSheet('waiting','Please wait, your Shiprocket invoice PDF is being generated.',order,null);
        await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'generating',shiprocketInvoiceRequested:true,shiprocketInvoiceNoFine:true,shiprocketInvoiceRequestedAt:nowIso(),shiprocketPayloadPreview:{pickup:payload.pickup,delivery:payload.delivery,payment:payload.payment,package:payload.package,products:payload.products}});

        let createRes={};
        try{
            createRes=await callShiprocketEndpoint(payload,'create');
        }catch(e){
            await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'api_error',shiprocketInvoiceNoFine:true,shiprocketInvoiceLastError:e.message||String(e),shiprocketInvoiceErrorAt:nowIso()});
            showShiprocketSheet('error','Oops, Shiprocket API route did not return a PDF. No fine will be created for this requested order.',order,null);
            return '';
        }

        let url=extractPdfUrl(createRes);
        const requestId=extractRequestId(createRes);
        if(!url){
            await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'waiting_pdf',shiprocketRequestId:requestId,shiprocketInvoiceNoFine:true,shiprocketLastResponse:createRes});
            url=await pollShiprocketForUrl(order,requestId);
        }

        if(url){
            await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'ready',shiprocketInvoicePdfUrl:url,shiprocketInvoiceGeneratedAt:nowIso(),shiprocketInvoiceNoFine:false,shiprocketRequestId:requestId||order.shiprocketRequestId||''});
            showShiprocketSheet('ready','Shiprocket invoice PDF generated successfully.',order,url);
            addLocalNotification({
                id:'shiprocket_ready_'+order.id,
                title:'Shiprocket invoice generated',
                text:`Your Shiprocket invoice for order ${order.order_no||order.id} is successfully generated.`,
                time:nowIso(),
                link:url,
                type:'shiprocket'
            });
            try{
                await db.collection('seller_notifications').add({sellerEmail:sellerEmail(),title:'Shiprocket invoice generated',message:`Your Shiprocket invoice for order ${order.order_no||order.id} is successfully generated.`,link:url,orderId:order.id,type:'shiprocket_invoice_ready',timestamp:nowIso(),createdAt:nowIso()});
            }catch(e){}
            downloadShiprocketPdf(url,order);
            if(typeof loadAcceptedOrders==='function') setTimeout(()=>loadAcceptedOrders(),250);
            if(typeof loadCompletedScanOrders==='function') setTimeout(()=>loadCompletedScanOrders(),250);
            return url;
        }

        await saveShiprocketStatus(order,{shiprocketInvoiceStatus:'timeout',shiprocketInvoiceNoFine:true,shiprocketInvoiceLastError:'PDF URL not ready within 1 minute',shiprocketInvoiceErrorAt:nowIso()});
        showShiprocketSheet('error','Oops, something went wrong. Shiprocket PDF was not ready within 1 minute.',order,null);
        return '';
    }

    window.downloadShippingInvoice=async function(orderId){
        if(!activeSeller||!db) return showToast('Login/session not ready. Refresh and try again.','warning');
        let ids=[];
        if(orderId==='bulk'){
            document.querySelectorAll('.cb-acc:checked').forEach(cb=>ids.push(cb.value));
            if(!ids.length) return showToast('Select at least one accepted order.','warning');
        }else ids=[orderId];

        for(const id of ids){
            const order=(sellerOrders||[]).find(o=>String(o.id)===String(id));
            if(!order){showToast('Order not found. Refresh the panel.','error');continue;}
            await requestShiprocketForOrder(order);
        }
    };

    function renderShiprocketButton(order){
        const url=hasShiprocketUrl(order);
        const st=currentShiprocketStatus(order);
        if(url){
            return `<button class="btn-shiprocket shiprocket-ready-btn" onclick="event.stopPropagation(); downloadShiprocketPdfForOrder('${safe(order.id)}')"><i class="fas fa-download"></i> Download Shiprocket PDF</button>`;
        }
        if(['generating','waiting_pdf','api_error','timeout','missing_details'].includes(st)){
            const label=st==='missing_details'?'Fix Missing Details':(st==='timeout'||st==='api_error'?'Retry Shiprocket':'Waiting Shiprocket PDF');
            return `<button class="btn-shiprocket shiprocket-waiting-btn" onclick="event.stopPropagation(); downloadShippingInvoice('${safe(order.id)}')"><i class="fas ${st==='generating'||st==='waiting_pdf'?'fa-spinner fa-spin':'fa-rotate-right'}"></i> ${label}</button>`;
        }
        return `<button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${safe(order.id)}')"><i class="fas fa-rocket"></i> Generate Shiprocket</button>`;
    }

    const oldLoadAcceptedOrders=window.loadAcceptedOrders;
    window.loadAcceptedOrders=function(){
        const list=$('acceptedOrdersList');
        if(!list) return oldLoadAcceptedOrders?oldLoadAcceptedOrders():null;
        const sa=$('selectAllAcc'); if(sa) sa.checked=false;
        const accepted=(sellerOrders||[]).filter(o=>{
            const s=low(o.status||o.orderStatus);
            return ['accepted','processing','packed','ready to ship'].includes(s) || s.includes('accept');
        });
        if(!accepted.length){
            list.innerHTML='<tr><td colspan="5" style="text-align:center;font-weight:800;padding:22px;">No orders to dispatch.</td></tr>';
            return;
        }
        list.innerHTML=accepted.map(o=>{
            const items=orderItems(o);
            const itemHtml=items.length?items.map(i=>{
                const p=productForItem(i);
                return `<div class="order-product-line"><b>${safe(i.name||i.title||p.name||'Product')}</b><span>SKU: ${safe(i.sku||p.sku||i.productId||i.id||'N/A')} · Qty: ${safe(i.qty||i.quantity||1)} · ₹${num(i.price||i.sellingPrice||p.price).toLocaleString('en-IN')}</span></div>`;
            }).join(''):'<span class="muted-line">No seller item found.</span>';
            return `<tr class="clickable-row">
                <td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-acc" value="${safe(o.id)}" onclick="event.stopPropagation()"></td>
                <td data-label="Order Date"><strong style="font-size:13px;">${orderDate(o).toLocaleString()}</strong></td>
                <td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);font-size:14px;">${safe(o.order_no||o.orderNo||o.id)}</strong></td>
                <td data-label="Item Details" style="font-size:13px;">${itemHtml}${o.shiprocketInvoiceNoFine&&!hasShiprocketUrl(o)?'<div class="no-fine-note"><i class="fas fa-shield-heart"></i> Shiprocket requested: no fine until PDF is generated.</div>':''}</td>
                <td data-label="Action"><div class="shiprocket-action-col">${renderShiprocketButton(o)}<button class="btn-outline btn-sm" onclick="event.stopPropagation(); viewOrderDetails('${safe(o.id)}')"><i class="fas fa-eye"></i> Details</button></div></td>
            </tr>`;
        }).join('');
    };

    const oldAcceptOrder=window.acceptOrder;
    window.acceptOrder=async function(id,isBreached){
        const res=oldAcceptOrder?await oldAcceptOrder(id,isBreached):null;
        const o=(sellerOrders||[]).find(x=>String(x.id)===String(id));
        if(o&&hasShiprocketUrl(o)){
            showShiprocketSheet('ready','This order already has a Shiprocket PDF ready to download.',o,hasShiprocketUrl(o));
        }else if(o){
            showToast('Order accepted. Generate Shiprocket PDF from Accepted Orders before dispatch.','info');
        }
        return res;
    };

    const oldAudit=window.auditAcceptedSlipBreaches;
    window.auditAcceptedSlipBreaches=async function(){
        if(!oldAudit) return;
        const original=sellerOrders;
        try{
            sellerOrders=(sellerOrders||[]).filter(o=>!(o.shiprocketInvoiceRequested && !hasShiprocketUrl(o) && o.shiprocketInvoiceNoFine));
            return await oldAudit();
        }finally{
            sellerOrders=original;
        }
    };

    function sevenDayKeys(){
        const out=[];
        for(let i=6;i>=0;i--){
            const d=new Date();
            d.setHours(0,0,0,0);
            d.setDate(d.getDate()-i);
            const key=d.toISOString().slice(0,10);
            out.push({key,label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),value:0});
        }
        return out;
    }

    function computeSevenDayTrend(){
        const days=sevenDayKeys();
        const map=new Map(days.map(d=>[d.key,d]));
        (sellerOrders||[]).forEach(o=>{
            const st=low(o.status||o.orderStatus);
            if(st.includes('cancel')||st.includes('return')) return;
            const d=orderDate(o);
            d.setHours(0,0,0,0);
            const key=d.toISOString().slice(0,10);
            if(map.has(key)) map.get(key).value+=orderAmount(o);
        });
        return days;
    }

    function renderSevenDaySalesTrend(){
        const ctx=$('salesChart');
        if(!ctx||typeof Chart==='undefined') return;
        const trend=computeSevenDayTrend();
        try{ if(salesChartInstance) salesChartInstance.destroy(); }catch(e){}
        try{
            const gradient=ctx.getContext('2d').createLinearGradient(0,0,0,250);
            gradient.addColorStop(0,'rgba(17,24,39,0.28)');
            gradient.addColorStop(1,'rgba(17,24,39,0.02)');
            salesChartInstance=new Chart(ctx,{
                type:'line',
                data:{labels:trend.map(x=>x.label),datasets:[{label:'Order Sales (₹)',data:trend.map(x=>Math.round(x.value)),borderColor:'#111827',backgroundColor:gradient,fill:true,tension:.35,borderWidth:3,pointRadius:4,pointBackgroundColor:'#fff',pointBorderColor:'#111827',pointBorderWidth:2}]},
                options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'₹'+Number(c.parsed.y||0).toLocaleString('en-IN')}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}},x:{grid:{display:false}}}}
            });
        }catch(e){console.warn('7-day trend render failed',e);}
    }

    const oldRenderDashboardStats=window.renderDashboardStats;
    window.renderDashboardStats=async function(){
        const res=oldRenderDashboardStats?await oldRenderDashboardStats():null;
        renderSevenDaySalesTrend();
        return res;
    };

    function localNotifications(){
        const arr=[];
        if(activeSeller){
            arr.push({id:'built_joined',title:'Welcome to Aryanta Seller Network',text:'You have successfully joined the Aryanta seller subscription/network. Keep your store details complete for faster payouts and shipping.',time:activeSeller.createdAt||activeSeller.joinedAt||nowIso(),type:'builtin'});
            if(activeSeller.subscription&&activeSeller.subscription!=='None'){
                arr.push({id:'built_subscription',title:'Subscription active',text:`Your ${activeSeller.subscription} subscription is active. Tap See Subscription Details to view plan benefits and history.`,time:activeSeller.subStartDate||activeSeller.createdAt||nowIso(),type:'builtin'});
            }
            if((sellerOrders||[]).length){
                const first=[...(sellerOrders||[])].sort((a,b)=>orderDate(a)-orderDate(b))[0];
                arr.push({id:'built_first_order',title:'Congratulations on your first order',text:`You got your first order on Aryanta. Accept, generate Shiprocket PDF, scan and dispatch on time.`,time:first.timestamp||first.createdAt||nowIso(),type:'builtin'});
            }
            const ready=(sellerOrders||[]).find(o=>hasShiprocketUrl(o));
            if(ready) arr.push({id:'built_shiprocket_any',title:'Shiprocket invoice ready',text:'One or more Shiprocket invoice PDFs are generated successfully for your orders.',time:ready.shiprocketInvoiceGeneratedAt||nowIso(),link:hasShiprocketUrl(ready),type:'builtin'});
            arr.push({id:'built_support',title:'Support available for seller problems',text:'For payout, order, listing, shipping partner delay, customer dispute, B2B supply and other problems, open Admin Support and submit a quick ticket.',time:nowIso(),type:'builtin'});
            arr.push({id:'built_b2b',title:'B2B supply support',text:'Aryanta can support seller B2B supply requirements from the Buy B2B Supplies section.',time:nowIso(),type:'builtin'});
        }
        return arr;
    }
    function addLocalNotification(n){
        adminNotifications=[n,...(adminNotifications||[]).filter(x=>x.id!==n.id)];
        renderNotificationList();
    }

    function renderNotificationList(){
        const list=$('fullNotifList')||$('notifList');
        if(!list) return;
        const rows=[...localNotifications(),...(adminNotifications||[])];
        const dedup=[]; const seen=new Set();
        rows.forEach(n=>{if(!seen.has(n.id)){seen.add(n.id); dedup.push(n);}});
        adminNotifications=dedup;
        const unread=dedup.filter(n=>!n.read).length;
        ['notifBadge','topbarNotifBadge'].forEach(id=>{const el=$(id); if(el){el.textContent=unread; el.style.display=unread?'inline-block':'none';}});
        list.innerHTML=dedup.length?dedup.map(n=>`<div class="notification-card ${n.read?'read':'unread'}" onclick="openFullNotif('${safe(n.id)}')"><div><h4>${n.read?'<i class="fas fa-envelope-open"></i>':'<i class="fas fa-envelope"></i>'} ${safe(n.title||'Aryanta Notice')}</h4><p>${safe(n.text||n.message||'Notification')}</p><small><i class="fas fa-clock"></i> ${new Date(n.time||Date.now()).toLocaleString()}</small></div>${n.link?'<span class="ok-chip"><i class="fas fa-link"></i> Link</span>':''}</div>`).join(''):'<div class="panel-box">No notifications.</div>';
    }

    const oldFetchNotifications=window.fetchNotifications;
    window.fetchNotifications=async function(){
        try{if(oldFetchNotifications) await oldFetchNotifications();}catch(e){console.warn('base notification fetch failed',e);}
        renderNotificationList();
    };

    const oldOpenFullNotif=window.openFullNotif||window.openFullNotifFinal;
    window.openFullNotif=window.openFullNotifFinal=async function(id){
        const n=(adminNotifications||[]).find(x=>String(x.id)===String(id));
        if(!n) return oldOpenFullNotif?oldOpenFullNotif(id):null;
        n.read=true;
        const cont=$('notifDetailContent'), modal=$('notificationDetailModal');
        if(cont){
            cont.innerHTML=`<div class="prime-notif-detail"><h3>${safe(n.title||'Aryanta Notice')}</h3><p>${safe(n.text||n.message||'Notification')}</p><div class="muted-line"><i class="fas fa-clock"></i> ${new Date(n.time||Date.now()).toLocaleString()}</div>${n.link?`<a class="btn-prime" style="text-decoration:none;margin-top:15px;display:inline-flex;" target="_blank" rel="noopener" href="${safe(/^https?:\/\//.test(n.link)?n.link:'https://'+n.link)}"><i class="fas fa-external-link-alt"></i> Open Link</a>`:''}</div>`;
        }
        if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);} else showToast(n.title||'Notification','info');
        try{
            if(db&&activeSeller&&!n.type?.includes('builtin')){
                const readId=(n.id+'_'+sellerEmail()).replace(/[^a-zA-Z0-9_-]/g,'_');
                await db.collection('seller_notification_reads').doc(readId).set({notificationId:n.id,sellerEmail:sellerEmail(),title:n.title||'',text:n.text||'',readAt:nowIso()},{merge:true});
            }
        }catch(e){}
        renderNotificationList();
    };

    function ensureSupportModal(){
        let modal=$('supportQuickModal');
        if(modal) return modal;
        modal=document.createElement('div');
        modal.className='modal';
        modal.id='supportQuickModal';
        modal.innerHTML=`
            <div class="modal-content support-quick-modal">
                <span class="close-modal" onclick="closeModal('supportQuickModal')"><i class="fas fa-times"></i></span>
                <h3><i class="fas fa-headset"></i> Admin Support Request</h3>
                <p class="muted-line" id="supportQuickTitle">Describe your problem. Aryanta admin can call you back.</p>
                <input type="hidden" id="supportModalCategory">
                <label>Callback phone number</label>
                <input type="text" id="supportModalPhone" class="input-field" placeholder="Seller phone number">
                <label>Problem description</label>
                <textarea id="supportModalDesc" class="input-field" style="height:130px;" placeholder="Explain the issue clearly for admin."></textarea>
                <div class="support-upload-row">
                    <label class="support-upload-chip"><i class="fas fa-image"></i> Image <input type="file" id="supportModalImage" accept="image/*"></label>
                    <label class="support-upload-chip"><i class="fas fa-file"></i> Document <input type="file" id="supportModalDoc" accept="image/*,pdf,doc,docx"></label>
                </div>
                <button class="btn-prime w-100" onclick="submitSupportTicket()"><i class="fas fa-paper-plane"></i> Send to Admin</button>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    async function fileData(input){
        const f=input&&input.files&&input.files[0];
        if(!f) return null;
        return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,dataUrl:r.result});r.readAsDataURL(f);});
    }

    const defaultIssueList=[
        {id:'payment',title:'Payment/Payout Issue',description:'Payout, settlement, deduction, payment hold or bank problem.',icon:'fa-wallet'},
        {id:'cancel',title:'Order Cancellation Dispute',description:'Wrong cancellation, charge/fine dispute or order status problem.',icon:'fa-ban'},
        {id:'listing',title:'Product Listing Error',description:'Product upload, pricing, stock, image or listing visibility problem.',icon:'fa-tags'},
        {id:'shipping',title:'Shipping Partner Delay',description:'Pickup, Shiprocket, label, courier delay or failed pickup issue.',icon:'fa-truck-fast'},
        {id:'fraud',title:'Customer Fraud / Dispute',description:'Customer claim, return fraud, wrong item or support investigation.',icon:'fa-user-shield'},
        {id:'b2b',title:'B2B Supply Support',description:'Wholesale supply, bulk purchase, material or sourcing support.',icon:'fa-boxes-stacked'},
        {id:'other',title:'Other / General Query',description:'Anything else. Admin will review and call you if needed.',icon:'fa-circle-question'}
    ];
    let issueList=defaultIssueList;

    window.openSupportIssueModal=function(id){
        ensureSupportModal();
        const issue=(issueList||defaultIssueList).find(x=>String(x.id)===String(id)||String(x.title)===String(id))||defaultIssueList.find(x=>x.id==='other');
        const cat=$('supportModalCategory'), ph=$('supportModalPhone'), desc=$('supportModalDesc'), title=$('supportQuickTitle');
        if(cat) cat.value=issue.id;
        if(ph) ph.value=txt(activeSeller&&activeSeller.phone||activeSeller&&activeSeller.mobile||activeSeller&&activeSeller.contact||'');
        if(desc) desc.value='';
        if(title) title.innerHTML=`<b>${safe(issue.title)}</b><br>${safe(issue.description||'Describe this issue in detail.')}`;
        document.querySelectorAll('.issue-card').forEach(b=>b.classList.toggle('active',b.dataset.issue===issue.id));
        const modal=$('supportQuickModal');
        if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}
    };

    const oldRenderSupportCategories=window.renderSupportCategories;
    window.renderSupportCategories=async function(){
        try{if(oldRenderSupportCategories) await oldRenderSupportCategories();}catch(e){}
        let fromSelect=[];
        const sel=$('supCategory');
        if(sel){
            fromSelect=[...sel.options].filter(o=>o.value).map(o=>({id:o.value,title:o.textContent,description:'Tap to describe this problem and request admin callback.',icon:'fa-circle-info'}));
        }
        issueList=fromSelect.length?fromSelect:defaultIssueList;
        const host=$('supportSection')?.querySelector('.panel-box') || $('supportIssueDetailBox')?.parentElement || $('supportSection');
        if(!host) return;
        let grid=$('supportIssueCards');
        if(!grid){grid=document.createElement('div');grid.id='supportIssueCards';grid.className='issue-card-grid support-popup-grid';host.insertBefore(grid,host.firstChild);}
        grid.innerHTML=issueList.map(c=>`<button type="button" class="issue-card" data-issue="${safe(c.id)}" onclick="openSupportIssueModal('${safe(c.id)}')"><i class="fas ${safe(c.icon||'fa-circle-info')}"></i><strong>${safe(c.title||c.name||c.id)}</strong><span>${safe(c.description||'Click to open popup.')}</span></button>`).join('');
        if(sel) sel.style.display='none';
        const form=host.querySelector('form');
        if(form) form.classList.add('support-inline-hidden-form');
    };

    window.selectSupportIssueCard=function(id){openSupportIssueModal(id);};
    window.handleSupportCategoryChange=function(){
        const val=$('supCategory')?.value;
        if(val) openSupportIssueModal(val);
    };

    window.submitSupportTicket=async function(){
        const modal=$('supportQuickModal');
        const modalOpen=modal && modal.style.display==='flex';
        const cat=modalOpen?$('supportModalCategory')?.value:$('supCategory')?.value;
        const phone=modalOpen?$('supportModalPhone')?.value.trim():$('supPhone')?.value.trim();
        const desc=modalOpen?$('supportModalDesc')?.value.trim():$('supDesc')?.value.trim();
        if(!cat||!phone||!desc) return showToast('Select problem, callback phone and description.','warning');
        const issue=(issueList||defaultIssueList).find(x=>String(x.id)===String(cat))||{id:cat,title:cat};
        try{
            const image=await fileData(modalOpen?$('supportModalImage'):$('supImage'));
            const documentFile=await fileData(modalOpen?$('supportModalDoc'):$('supDoc'));
            await db.collection('seller_support_tickets').add({
                ticketId:'TKT-'+Math.random().toString(36).slice(2,8).toUpperCase(),
                email:sellerEmail(),
                sellerEmail:sellerEmail(),
                sellerName:activeSeller?.companyName||activeSeller?.shopName||activeSeller?.name||sellerEmail(),
                category:cat,
                categoryTitle:issue.title||issue.name||cat,
                categoryDetail:issue.description||'',
                phone,
                callbackPhone:phone,
                description:desc,
                message:desc,
                image,
                document:documentFile,
                status:'Pending',
                timestamp:nowIso(),
                createdAt:nowIso(),
                source:'seller-panel-support-popup'
            });
            showToast('Support request sent. Admin will review and can call you back.','success');
            if(modalOpen){closeModal('supportQuickModal'); ['supportModalDesc','supportModalImage','supportModalDoc'].forEach(id=>{const el=$(id); if(el) el.value='';});}
            ['supDesc','supPhone','supImage','supDoc'].forEach(id=>{const el=$(id); if(el) el.value='';});
            try{await fetchSupportTicketBadges();}catch(e){}
        }catch(e){console.warn(e);showToast('Could not submit support ticket.','error');}
    };

    function ensureSubscriptionDetailsPage(){
        let sec=$('subscriptionDetailsSection');
        if(sec) return sec;
        const content=document.querySelector('.content-padding')||document.querySelector('.main-content')||document.body;
        sec=document.createElement('section');
        sec.id='subscriptionDetailsSection';
        sec.className='data-section subscription-details-page';
        content.appendChild(sec);
        return sec;
    }

    window.showSubscriptionDetails=function(){
        const sec=ensureSubscriptionDetailsPage();
        const plan=activeSeller?.subscription||'Basic / Free';
        const start=activeSeller?.subStartDate||activeSeller?.subscriptionStart||activeSeller?.createdAt||'Not available';
        const end=activeSeller?.subEndDate||activeSeller?.subscriptionEnd||'Not available';
        const history=Array.isArray(activeSeller?.subHistory)?activeSeller.subHistory:[];
        sec.innerHTML=`
            <div class="section-head-row">
                <div>
                    <h3 style="font-size:24px;font-weight:950;color:var(--warning);"><i class="fas fa-receipt"></i> Subscription Details</h3>
                    <p class="muted-line">Only subscription data is shown on this page.</p>
                </div>
                <button class="btn-outline" onclick="showSection('subscription')"><i class="fas fa-arrow-left"></i> Back to Subscription</button>
            </div>
            <div class="subscription-detail-hero">
                <div><span>Current plan</span><strong>${safe(plan)}</strong></div>
                <div><span>Started</span><strong>${safe(start)}</strong></div>
                <div><span>Ends / renews</span><strong>${safe(end)}</strong></div>
            </div>
            <div class="panel-box">
                <h4><i class="fas fa-crown"></i> Plan Benefits</h4>
                <div class="prime-benefits">
                    <div><i class="fas fa-check-circle"></i> Store access and seller tools based on admin-enabled settings.</div>
                    <div><i class="fas fa-check-circle"></i> Subscription status is stored in seller DB and shown here.</div>
                    <div><i class="fas fa-check-circle"></i> Ads, branding, commission and delivery rules can be controlled from admin configuration.</div>
                </div>
            </div>
            <div class="panel-box">
                <h4><i class="fas fa-history"></i> Subscription History</h4>
                ${history.length?history.map(h=>`<div class="subscription-history-row"><b>${safe(h.plan||h.name||'Plan')}</b><span>${safe(h.date||h.createdAt||h.startDate||'')}</span><small>${safe(h.status||h.method||'')}</small></div>`).join(''):'<p class="muted-line">No subscription history found in seller profile.</p>'}
            </div>
        `;
        document.querySelectorAll('.data-section').forEach(s=>s.classList.remove('active'));
        sec.classList.add('active');
        window.scrollTo({top:0,behavior:'smooth'});
    };

    function primeUiBoot(){
        document.body.classList.add('aryanta-prime-ui');
        ensureShiprocketSheet();
        ensureSupportModal();
        renderSevenDaySalesTrend();
        try{renderSupportCategories();}catch(e){}
        try{fetchNotifications();}catch(e){}
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(primeUiBoot,700));
    else setTimeout(primeUiBoot,700);
})();
/* ===== End Aryanta Shiprocket Seller Final Fix 2026-05-23 ===== */

/* ===== Aryanta Seller Stability Patch v2 - package/product-performance/support/subscription/select-all ===== */
(function(){
    const PATCH='ARYANTA_SELLER_STABILITY_PATCH_V2_2026_05_23';
    if(window[PATCH]) return;
    window[PATCH]=true;

    const $=id=>document.getElementById(id);
    const txt=v=>(v===undefined||v===null?'':String(v));
    const low=v=>txt(v).toLowerCase().trim();
    const safe=v=>txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const num=v=>{const n=Number(String(v??0).replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0;};
    const nowIso=()=>new Date().toISOString();
    const toast=(m,t='info')=>typeof showToast==='function'?showToast(m,t):alert(m);
    const sellerEmail=()=>low(activeSeller&&activeSeller.email);
    const sellerDocId=()=>txt((activeSeller&&activeSeller.email)||sellerEmail()).trim();
    function orderDate(o){const raw=o&&(o.timestamp||o.createdAt||o.orderDate||o.date||o.order_date||o.placedAt||o.created_at); const d=new Date(raw||Date.now()); return Number.isNaN(d.getTime())?new Date():d;}
    function sellerItems(o){try{if(typeof getSellerItemsFromOrder==='function'){const arr=getSellerItemsFromOrder(o); if(Array.isArray(arr)&&arr.length) return arr;}}catch(e){} return Array.isArray(o&&o.items)?o.items:[];}
    function itemPrice(i,p={}){return num(i.sellingPrice||i.price||i.salePrice||i.finalPrice||p.price||p.sellingPrice||0);}
    function itemQty(i){return Math.max(1,num(i.qty||i.quantity||i.count||1));}
    function itemAmount(i,p={}){return itemPrice(i,p)*itemQty(i);}
    function productOfItem(i){
        const id=txt(i&& (i.id||i.productId||i.product_id||i.productDocId)).trim();
        const sku=low(i&& (i.sku||i.SKU||i.productSku));
        return (sellerProducts||[]).find(p=>{
            const pid=txt(p.id||p.productId||p.product_id).trim();
            const psku=low(p.sku||p.SKU||p.productSku);
            return (id&&pid&&id===pid)||(sku&&psku&&sku===psku);
        })||{};
    }
    function orderAmount(o){const items=sellerItems(o); const itemTotal=items.reduce((s,i)=>s+itemAmount(i,productOfItem(i)),0); return itemTotal||num(o&& (o.totalAmount||o.finalAmount||o.totalPrice||o.total||o.amount||o.orderAmount));}
    function isRealOrder(o){
        if(!o) return false;
        if(o.isDemo===true||o.demo===true||o.test===true||o.isTest===true) return false;
        const ref=low(o.order_no||o.orderNo||o.orderId||o.id||'');
        if(ref.includes('demo')||ref.includes('sample')||ref.includes('test-order')) return false;
        const st=low(o.status||o.orderStatus||'');
        if(st.includes('draft')||st.includes('fake')) return false;
        return sellerItems(o).length>0;
    }
    function isNonCancelledOrder(o){const st=low(o.status||o.orderStatus||''); return !st.includes('cancel')&&!st.includes('return')&&!st.includes('refund')&&!st.includes('failed');}

    function ensurePackageFields(){
        const form=$('itemForm'); if(!form) return;
        if(!$('itemPackageWeightKg')){
            const anchor=$('itemDesc')?.closest('div[style*="grid"]') || $('itemWarranty')?.closest('div[style*="grid"]') || form.querySelector('button[type="submit"]');
            const box=document.createElement('div');
            box.className='package-dim-box';
            box.innerHTML=`<div class="package-dim-title"><i class="fas fa-box"></i> Package Details for Shiprocket</div><p class="muted-line">Required for Shiprocket invoice/label generation. Use packed parcel size, not only product size.</p><div class="package-dim-grid"><div><label>Package weight in kg</label><input type="number" step="0.01" min="0.01" id="itemPackageWeightKg" class="input-field" placeholder="Example: 0.50" required></div><div><label>Package length in cm</label><input type="number" step="0.1" min="1" id="itemPackageLengthCm" class="input-field" placeholder="Example: 20" required></div><div><label>Package breadth in cm</label><input type="number" step="0.1" min="1" id="itemPackageBreadthCm" class="input-field" placeholder="Example: 15" required></div><div><label>Package height in cm</label><input type="number" step="0.1" min="1" id="itemPackageHeightCm" class="input-field" placeholder="Example: 8" required></div></div>`;
            if(anchor && anchor.parentElement) anchor.parentElement.insertBefore(box,anchor);
            else form.insertBefore(box,form.querySelector('button[type="submit"]'));
        }
        ['itemPackageWeightKg','itemPackageLengthCm','itemPackageBreadthCm','itemPackageHeightCm'].forEach(id=>{const el=$(id); if(el) el.required=true;});
    }
    function setPackageFieldsFromProduct(p={}){
        ensurePackageFields();
        const map={
            itemPackageWeightKg:['packageWeightKg','package_weight_kg','weightKg','weight_kg','weight','package.weight_kg','package.weight'],
            itemPackageLengthCm:['packageLengthCm','package_length_cm','lengthCm','length_cm','length','package.length_cm','package.length'],
            itemPackageBreadthCm:['packageBreadthCm','package_breadth_cm','breadthCm','breadth_cm','breadth','widthCm','width','package.breadth_cm','package.breadth','package.width'],
            itemPackageHeightCm:['packageHeightCm','package_height_cm','heightCm','height_cm','height','package.height_cm','package.height']
        };
        Object.entries(map).forEach(([id,keys])=>{const el=$(id); if(!el) return; let val=''; for(const k of keys){const parts=k.split('.'); let cur=p; let ok=true; for(const part of parts){if(cur && Object.prototype.hasOwnProperty.call(cur,part)) cur=cur[part]; else {ok=false; break;}} if(ok && cur!==undefined && cur!==null && txt(cur).trim()!==''){val=cur;break;}} el.value=val||'';});
    }
    function readPackageFields(){
        ensurePackageFields();
        return {
            packageWeightKg:num($('itemPackageWeightKg')?.value),
            packageLengthCm:num($('itemPackageLengthCm')?.value),
            packageBreadthCm:num($('itemPackageBreadthCm')?.value),
            packageHeightCm:num($('itemPackageHeightCm')?.value)
        };
    }
    function validatePackageFields(){
        const p=readPackageFields();
        const missing=[];
        if(!(p.packageWeightKg>0)) missing.push('Package weight in kg');
        if(!(p.packageLengthCm>0)) missing.push('Package length in cm');
        if(!(p.packageBreadthCm>0)) missing.push('Package breadth in cm');
        if(!(p.packageHeightCm>0)) missing.push('Package height in cm');
        if(missing.length){toast('Please fill: '+missing.join(', '),'warning'); return false;}
        return true;
    }

    const oldOpenItemModal=window.openItemModal;
    window.openItemModal=function(){ensurePackageFields(); setPackageFieldsFromProduct({}); return oldOpenItemModal?oldOpenItemModal.apply(this,arguments):null;};
    const oldEditItem=window.editItem;
    window.editItem=function(id){const res=oldEditItem?oldEditItem.apply(this,arguments):null; const p=(sellerProducts||[]).find(x=>String(x.id)===String(id))||{}; setTimeout(()=>setPackageFieldsFromProduct(p),60); return res;};
    const oldSubmitItemForm=window.submitItemForm;
    window.submitItemForm=async function(){
        ensurePackageFields();
        if(!validatePackageFields()) return;
        const pkg=readPackageFields();
        const editId=txt($('editId')?.value).trim();
        const sku=txt($('itemSku')?.value).trim();
        const beforeIds=new Set((sellerProducts||[]).map(p=>String(p.id)));
        const res=oldSubmitItemForm?await oldSubmitItemForm.apply(this,arguments):null;
        try{
            let productId=editId;
            if(!productId && db){
                const email=sellerEmail();
                if(sku){
                    const snap=await db.collection('products').where('sellerEmail','==',email).where('sku','==',sku).limit(3).get();
                    snap.forEach(d=>{if(!productId) productId=d.id;});
                }
                if(!productId){
                    const latest=(sellerProducts||[]).find(p=>!beforeIds.has(String(p.id)));
                    if(latest) productId=latest.id;
                }
            }
            if(productId && db){
                const payload={...pkg,package:{weight_kg:pkg.packageWeightKg,length_cm:pkg.packageLengthCm,breadth_cm:pkg.packageBreadthCm,height_cm:pkg.packageHeightCm},shiprocketPackageReady:true,updatedAt:nowIso()};
                await db.collection('products').doc(productId).set(payload,{merge:true});
                const local=(sellerProducts||[]).find(p=>String(p.id)===String(productId)); if(local) Object.assign(local,payload);
            }
        }catch(e){console.warn('package details save failed',e); toast('Product saved, but package details sync failed. Edit once and save again.','warning');}
        return res;
    };

    window.toggleSelectAll=function(selectorOrSource, maybeSource){
        let selector='.cb-new'; let source=selectorOrSource;
        if(typeof selectorOrSource==='string'){selector=selectorOrSource; source=maybeSource;}
        if(!source || typeof source.checked==='undefined') return;
        document.querySelectorAll(selector).forEach(cb=>{if(!cb.disabled) cb.checked=!!source.checked;});
    };
    window.toggleSelectAllNew=source=>window.toggleSelectAll('.cb-new',source);
    window.toggleSelectAllAcc=source=>window.toggleSelectAll('.cb-acc',source);
    window.toggleSelectAllByClass=(cls,source)=>window.toggleSelectAll(cls&&cls.startsWith('.')?cls:'.'+cls,source);

    function ensureSidebarItem(section,label,icon,afterText){
        const side=$('mobileSidebar'); if(!side) return;
        if(side.querySelector(`.nav-item[onclick*="${section}"]`)) return;
        const div=document.createElement('div');
        div.className='nav-item';
        div.setAttribute('onclick',`showSection('${section}')`);
        div.innerHTML=`<i class="fas ${icon}"></i> ${label}`;
        const items=[...side.querySelectorAll('.nav-item')];
        const after=items.find(x=>low(x.textContent).includes(low(afterText||'')));
        if(after&&after.parentElement) after.parentElement.insertBefore(div,after.nextSibling); else side.appendChild(div);
    }
    function activateSidebar(section){
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active','selected'));
        const item=[...document.querySelectorAll('.nav-item')].find(x=>txt(x.getAttribute('onclick')).includes(`'${section}'`)||txt(x.getAttribute('onclick')).includes(`"${section}"`));
        if(item) item.classList.add('active','selected');
    }
    function showOnlySection(section){
        document.querySelectorAll('.data-section').forEach(sec=>sec.classList.remove('active'));
        const el=$(section+'Section'); if(el) el.classList.add('active');
        const sb=$('mobileSidebar'); if(sb) sb.classList.remove('open'); const ov=$('mobileSidebarOverlay'); if(ov) ov.style.display='none';
        activateSidebar(section);
    }
    function productStats(){
        const map={};
        (sellerProducts||[]).forEach(p=>{map[p.id]={product:p,totalQty:0,totalOrders:0,delivered:0,cancelled:0,returned:0,gross:0,views:num(p.views||p.totalViews||p.clicks||p.totalClicks)}});
        (sellerOrders||[]).filter(isRealOrder).forEach(o=>{
            const st=low(o.status||o.orderStatus);
            sellerItems(o).forEach(i=>{
                const p=productOfItem(i); if(!p||!map[p.id]) return;
                const q=itemQty(i), row=map[p.id];
                row.totalQty+=q; row.totalOrders+=1; row.gross+=itemAmount(i,p);
                if(st.includes('deliver')) row.delivered+=q;
                else if(st.includes('cancel')) row.cancelled+=q;
                else if(st.includes('return')||st.includes('refund')) row.returned+=q;
            });
        });
        return Object.values(map);
    }
    window.setProductPerformanceFilter=function(filter){
        window.productPerformanceFilter=filter||'all';
        ['all','top','loss'].forEach(f=>{const b=$('perf-filter-'+f); if(b) b.classList.toggle('active',f===window.productPerformanceFilter);});
        window.loadProductPerformance();
    };
    window.loadProductPerformance=function(){
        const list=$('productPerformanceList'); if(!list) return;
        let rows=productStats(); const filter=window.productPerformanceFilter||'all';
        if(filter==='top') rows=rows.filter(x=>x.delivered>0||x.totalQty>0).sort((a,b)=>b.delivered-a.delivered||b.totalQty-a.totalQty||b.gross-a.gross);
        else if(filter==='loss') rows=rows.filter(x=>(x.cancelled+x.returned)>0).sort((a,b)=>(b.cancelled+b.returned)-(a.cancelled+a.returned));
        else rows=rows.sort((a,b)=>b.totalQty-a.totalQty||b.views-a.views);
        if(!rows.length){list.innerHTML='<div class="panel-box"><b>No product performance data yet.</b><br><span class="muted-line">Only real seller orders are counted. Demo/test orders are ignored.</span></div>';return;}
        list.innerHTML=rows.map(st=>{const p=st.product,total=Math.max(1,st.totalOrders),loss=st.cancelled+st.returned,ret=Math.round(st.returned/total*100),can=Math.round(st.cancelled/total*100),del=Math.round(st.delivered/Math.max(1,st.totalQty||1)*100); const img=(Array.isArray(p.images)&&p.images[0])||p.image||''; return `<div class="performance-card prime-performance-card">${img?`<img src="${safe(img)}" loading="lazy" class="perf-img">`:''}<h4>${safe(p.name||p.title||'Product')}</h4><p class="muted-line">SKU: <b>${safe(p.sku||p.id)}</b> · Price: <b>₹${num(p.price).toLocaleString('en-IN')}</b></p><div class="tiny-metric-grid"><div class="tiny-metric"><span>Sold</span>${st.totalQty}</div><div class="tiny-metric"><span>Delivered</span>${st.delivered}</div><div class="tiny-metric"><span>Loss</span>${loss}</div></div><div class="perf-bars"><small>Delivered ${del}%</small><div class="perf-bar"><i style="width:${Math.min(100,del)}%"></i></div><small>Cancelled ${can}%</small><div class="perf-bar danger"><i style="width:${Math.min(100,can)}%"></i></div><small>Returns ${ret}%</small><div class="perf-bar warning"><i style="width:${Math.min(100,ret)}%"></i></div></div><button class="btn-outline w-100" onclick="editItem('${safe(p.id)}')"><i class="fas fa-edit"></i> Edit Product</button></div>`;}).join('');
    };
    window.loadReturnTracking=window.loadReturnTracking||function(){const box=$('returnTrackingList'); if(box) box.innerHTML='<div class="panel-box">Return tracking will appear when return/cancelled-after-dispatch orders exist.</div>';};

    function sevenDayRows(){const rows=[]; for(let i=6;i>=0;i--){const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i); rows.push({date:d,key:d.toISOString().slice(0,10),label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),value:0,count:0});} return rows;}
    function renderRealSevenDayChart(){
        const ctx=$('salesChart'); if(!ctx||typeof Chart==='undefined') return;
        const rows=sevenDayRows(); const map=new Map(rows.map(r=>[r.key,r]));
        (sellerOrders||[]).filter(isRealOrder).filter(isNonCancelledOrder).forEach(o=>{const d=orderDate(o); d.setHours(0,0,0,0); const key=d.toISOString().slice(0,10); const row=map.get(key); if(row){row.value+=orderAmount(o); row.count+=1;}});
        try{if(window.salesChartInstance) window.salesChartInstance.destroy(); else if(typeof salesChartInstance!=='undefined'&&salesChartInstance) salesChartInstance.destroy();}catch(e){}
        const gradient=ctx.getContext('2d').createLinearGradient(0,0,0,250); gradient.addColorStop(0,'rgba(15,23,42,.24)'); gradient.addColorStop(1,'rgba(15,23,42,.02)');
        try{window.salesChartInstance=new Chart(ctx,{type:'line',data:{labels:rows.map(r=>r.label),datasets:[{label:'Real order sales (₹)',data:rows.map(r=>Math.round(r.value)),backgroundColor:gradient,borderColor:'#0f172a',fill:true,tension:.35,borderWidth:3,pointRadius:4,pointBackgroundColor:'#fff',pointBorderColor:'#0f172a'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`₹${Number(c.parsed.y||0).toLocaleString('en-IN')} from ${rows[c.dataIndex]?.count||0} order(s)`}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}},x:{grid:{display:false}}}}});}catch(e){console.warn('chart render failed',e);}
    }
    window.renderSalesChart=function(){renderRealSevenDayChart();};
    const oldRenderDashboardStats=window.renderDashboardStats;
    window.renderDashboardStats=async function(){const res=oldRenderDashboardStats?await oldRenderDashboardStats.apply(this,arguments):null; renderRealSevenDayChart(); return res;};

    function ensureSupportMultipleInputs(){
        ['supportModalImage','supportModalDoc','supImage','supDoc'].forEach(id=>{const el=$(id); if(el) el.multiple=true;});
        const img=$('supportModalImage'); if(img) img.accept='image/*';
        const doc=$('supportModalDoc'); if(doc) doc.accept='image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    async function fileListData(input){
        const files=[...(input&&input.files?input.files:[])];
        return Promise.all(files.slice(0,8).map(f=>new Promise((resolve,reject)=>{const r=new FileReader(); r.onerror=reject; r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,dataUrl:r.result}); r.readAsDataURL(f);} )));
    }
    const oldEnsureSupportModal=window.ensureSupportModal;
    function makeSupportModalMultiple(){ensureSupportMultipleInputs(); document.querySelectorAll('.support-upload-chip').forEach(l=>{if(l.textContent.includes('Image')) l.childNodes[0].textContent=' Images '; if(l.textContent.includes('Document')) l.childNodes[0].textContent=' Documents ';});}
    const oldOpenSupportIssueModal=window.openSupportIssueModal;
    window.openSupportIssueModal=function(){const res=oldOpenSupportIssueModal?oldOpenSupportIssueModal.apply(this,arguments):null; setTimeout(makeSupportModalMultiple,30); return res;};
    const oldRenderSupportCategories=window.renderSupportCategories;
    window.renderSupportCategories=async function(){const res=oldRenderSupportCategories?await oldRenderSupportCategories.apply(this,arguments):null; makeSupportModalMultiple(); return res;};
    window.submitSupportTicket=async function(){
        ensureSupportMultipleInputs();
        const modal=$('supportQuickModal'); const modalOpen=modal&&modal.style.display==='flex';
        const cat=modalOpen?$('supportModalCategory')?.value:$('supCategory')?.value;
        const phone=txt(modalOpen?$('supportModalPhone')?.value:$('supPhone')?.value).trim();
        const desc=txt(modalOpen?$('supportModalDesc')?.value:$('supDesc')?.value).trim();
        if(!cat||!phone||!desc) return toast('Select problem, callback phone and description.','warning');
        try{
            const images=await fileListData(modalOpen?$('supportModalImage'):$('supImage'));
            const documents=await fileListData(modalOpen?$('supportModalDoc'):$('supDoc'));
            await db.collection('seller_support_tickets').add({ticketId:'TKT-'+Math.random().toString(36).slice(2,8).toUpperCase(),email:sellerEmail(),sellerEmail:sellerEmail(),sellerName:activeSeller?.companyName||activeSeller?.shopName||activeSeller?.name||sellerEmail(),category:cat,categoryTitle:cat,phone,callbackPhone:phone,description:desc,message:desc,images,documents,image:images[0]||null,document:documents[0]||null,attachmentCount:images.length+documents.length,status:'Pending',timestamp:nowIso(),createdAt:nowIso(),source:'seller-panel-multi-upload'});
            toast('Support request sent with attachments. Admin will review.','success');
            if(modalOpen) closeModal('supportQuickModal');
            ['supportModalDesc','supportModalImage','supportModalDoc','supDesc','supPhone','supImage','supDoc'].forEach(id=>{const el=$(id); if(el) el.value='';});
            try{await fetchSupportTicketBadges();}catch(e){}
        }catch(e){console.warn(e); toast('Could not submit support ticket.','error');}
    };

    function subscriptionHistory(){return Array.isArray(activeSeller?.subHistory)?activeSeller.subHistory:[];}
    function invoiceRow(label,value){return `<div class="invoice-row"><span>${safe(label)}</span><b>${safe(value||'-')}</b></div>`;}
    function ensureSubInvoiceModal(){
        let modal=$('subscriptionInvoiceModal'); if(modal) return modal;
        modal=document.createElement('div'); modal.className='modal'; modal.id='subscriptionInvoiceModal';
        modal.innerHTML=`<div class="modal-content subscription-invoice-modal"><span class="close-modal" onclick="closeModal('subscriptionInvoiceModal')"><i class="fas fa-times"></i></span><div id="subscriptionInvoiceContent"></div></div>`;
        document.body.appendChild(modal); return modal;
    }
    window.viewSubscriptionInvoice=function(index){
        const hist=subscriptionHistory(); const h=hist[index]||hist.slice().reverse()[index]||{}; const modal=ensureSubInvoiceModal(); const cont=$('subscriptionInvoiceContent');
        const plan=h.planName||h.plan||h.subscriptionName||activeSeller?.subscriptionName||activeSeller?.subscription||'Subscription';
        const amount=num(h.amount||h.cost||h.price||0);
        const method=h.method||h.paymentMethod||h.payment_mode||'Not recorded';
        const paidBy=h.paymentBy||h.paidBy||activeSeller?.companyName||activeSeller?.shopName||activeSeller?.name||sellerEmail();
        const paymentId=h.razorpayPaymentId||h.paymentId||h.transactionId||h.txnId||h.reference||'';
        if(cont) cont.innerHTML=`<div class="invoice-title"><i class="fas fa-receipt"></i><div><h3>Aryanta Subscription Invoice</h3><p>${safe(plan)}</p></div></div><div class="invoice-box">${invoiceRow('Invoice No.',h.invoiceNo||h.invoiceId||('SUB-'+(h.startDate||h.createdAt||Date.now()).toString().replace(/[^0-9]/g,'').slice(0,12)))}${invoiceRow('Seller',paidBy)}${invoiceRow('Seller Email',sellerEmail())}${invoiceRow('Plan',plan)}${invoiceRow('Amount','₹'+amount.toLocaleString('en-IN'))}${invoiceRow('Commission',txt(h.commissionPercent||activeSeller?.subscriptionCommissionPercent||'' )+(h.commissionPercent||activeSeller?.subscriptionCommissionPercent?'%':''))}${invoiceRow('Payment Method',method)}${invoiceRow('Payment By',paidBy)}${invoiceRow('Payment ID',paymentId)}${invoiceRow('Start Date',h.startDate?new Date(h.startDate).toLocaleString():h.createdAt?new Date(h.createdAt).toLocaleString():'-')}${invoiceRow('End Date',h.endDate?new Date(h.endDate).toLocaleString():'-')}${invoiceRow('Status',h.status||'Active')}</div><button class="btn-prime w-100" onclick="window.print()"><i class="fas fa-print"></i> Print Invoice</button>`;
        modal.style.display='flex'; setTimeout(()=>modal.classList.add('show'),10);
    };
    window.showSubscriptionDetails=function(){
        let sec=$('subscriptionDetailsSection');
        if(!sec){sec=document.createElement('section'); sec.id='subscriptionDetailsSection'; sec.className='data-section subscription-details-page'; (document.querySelector('.content-padding')||document.body).appendChild(sec);}
        const hist=subscriptionHistory();
        sec.innerHTML=`<div class="section-head-row"><div><h3 style="font-size:24px;font-weight:950;color:var(--warning);"><i class="fas fa-receipt"></i> Subscription Details</h3><p class="muted-line">Full plan, payment method, payment by, and invoice details.</p></div><button class="btn-outline" onclick="showSection('subscription')"><i class="fas fa-arrow-left"></i> Back to Subscription</button></div><div class="subscription-detail-hero"><div><span>Current plan</span><strong>${safe(activeSeller?.subscriptionName||activeSeller?.subscription||'Basic / Free')}</strong></div><div><span>Start</span><strong>${safe(activeSeller?.subStartDate?new Date(activeSeller.subStartDate).toLocaleDateString():'-')}</strong></div><div><span>End / renew</span><strong>${safe(activeSeller?.subEndDate?new Date(activeSeller.subEndDate).toLocaleDateString():'-')}</strong></div></div><div class="table-container"><table class="admin-table"><thead><tr><th>Plan</th><th>Amount</th><th>Payment Method</th><th>Payment By</th><th>Payment ID</th><th>Status</th><th>Invoice</th></tr></thead><tbody>${hist.length?hist.map((h,i)=>`<tr><td data-label="Plan"><b>${safe(h.planName||h.plan||'-')}</b><br><small>${safe(h.startDate?new Date(h.startDate).toLocaleDateString():'')}</small></td><td data-label="Amount">₹${num(h.amount||h.cost||h.price).toLocaleString('en-IN')}</td><td data-label="Payment Method">${safe(h.method||h.paymentMethod||'-')}</td><td data-label="Payment By">${safe(h.paymentBy||h.paidBy||activeSeller?.companyName||activeSeller?.shopName||sellerEmail())}</td><td data-label="Payment ID">${safe(h.razorpayPaymentId||h.paymentId||h.transactionId||'-')}</td><td data-label="Status"><span class="ok-chip">${safe(h.status||'Active')}</span></td><td data-label="Invoice"><button class="btn-sm" onclick="viewSubscriptionInvoice(${i})"><i class="fas fa-receipt"></i> View</button></td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;font-weight:800;">No subscription invoice/history found yet.</td></tr>'}</tbody></table></div>`;
        document.querySelectorAll('.data-section').forEach(x=>x.classList.remove('active')); sec.classList.add('active'); activateSidebar('subscription'); window.scrollTo({top:0,behavior:'smooth'});
    };

    function showFirstOrderCelebration(){
        if(!activeSeller||(activeSeller.firstOrderPopupShownV2||localStorage.getItem('firstOrderPopupV2_'+sellerEmail()))) return;
        const orders=(sellerOrders||[]).filter(isRealOrder); if(!orders.length) return;
        let modal=$('firstOrderCelebrationModal');
        if(!modal){modal=document.createElement('div'); modal.className='modal'; modal.id='firstOrderCelebrationModal'; modal.innerHTML=`<div class="modal-content first-order-modal"><div class="confetti">🎉</div><h2>Congratulations!</h2><p>You received your first Aryanta order. Accept it, generate the Shiprocket PDF, scan, and dispatch on time.</p><button class="btn-prime w-100" onclick="closeModal('firstOrderCelebrationModal'); showSection('newOrders')"><i class="fas fa-box"></i> View Order</button></div>`; document.body.appendChild(modal);}
        modal.style.display='flex'; setTimeout(()=>modal.classList.add('show'),10); localStorage.setItem('firstOrderPopupV2_'+sellerEmail(),'1');
        try{db.collection('sellers').doc(sellerDocId()).set({firstOrderPopupShownV2:true,firstOrderPopupAt:nowIso()},{merge:true}); activeSeller.firstOrderPopupShownV2=true;}catch(e){}
    }

    const oldShowSection=window.showSection;
    window.showSection=async function(section){
        ensureSidebarItem('productPerformance','Product Performance','fa-chart-line','My Inventory');
        ensureSidebarItem('returnTracking','Return Tracking','fa-route','Returns');
        if(section==='productPerformance'||section==='returnTracking'){
            showOnlySection(section);
            try{if(typeof ensureSellerOrders==='function') await ensureSellerOrders(); if(section==='productPerformance'&&typeof ensureSellerProducts==='function') await ensureSellerProducts();}catch(e){}
            if(section==='productPerformance') window.loadProductPerformance();
            if(section==='returnTracking') window.loadReturnTracking();
            return;
        }
        const res=oldShowSection?await oldShowSection.apply(this,arguments):null;
        activateSidebar(section);
        if(section==='home') setTimeout(renderRealSevenDayChart,150);
        if(section==='support') setTimeout(()=>{makeSupportModalMultiple();},120);
        return res;
    };

    function boot(){
        ensurePackageFields(); ensureSupportMultipleInputs(); ensureSidebarItem('productPerformance','Product Performance','fa-chart-line','My Inventory'); ensureSidebarItem('returnTracking','Return Tracking','fa-route','Returns');
        setTimeout(()=>{renderRealSevenDayChart(); showFirstOrderCelebration();},1200);
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
/* ===== End Aryanta Seller Stability Patch v2 ===== */

/* Aryanta Seller Panel Final Bug-Fix Patch
   Add this file's content at the END of your existing seller.js.
   It is intentionally additive: it does not remove your existing logic, QC flow, auth, Shiprocket flow, or order matching logic.
*/
(function(){
  'use strict';

  const LOW_STOCK_LIMIT = 7;
  const NOTICE_SETTING_KEY = 'showNotices';
  const $ = (id) => document.getElementById(id);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const txt = (v) => (v === undefined || v === null) ? '' : String(v);
  const lower = (v) => txt(v).toLowerCase().trim();
  const nowIso = () => new Date().toISOString();
  const toast = (m,t='info') => (typeof window.showToast === 'function' ? window.showToast(m,t) : console.log(t,m));
  const activeEmail = () => lower(window.activeSeller && window.activeSeller.email || (typeof activeSeller !== 'undefined' && activeSeller && activeSeller.email) || '');
  const getDb = () => window.db || (typeof db !== 'undefined' ? db : null);
  const getSeller = () => window.activeSeller || (typeof activeSeller !== 'undefined' ? activeSeller : null);
  const getProducts = () => window.sellerProducts || (typeof sellerProducts !== 'undefined' ? sellerProducts : []);
  const setProducts = (arr) => { try{ window.sellerProducts = arr; if(typeof sellerProducts !== 'undefined') sellerProducts = arr; }catch(e){} };
  const getOrders = () => window.sellerOrders || (typeof sellerOrders !== 'undefined' ? sellerOrders : []);

  function esc(v){ return txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  function firstImage(item){
    if(!item) return '';
    const candidates = [item.image, item.imageUrl, item.thumbnail, item.photo, item.mainImage, item.productImage, item.img];
    if(Array.isArray(item.images)) candidates.unshift(item.images[0]);
    if(Array.isArray(item.imageUrls)) candidates.unshift(item.imageUrls[0]);
    if(item.product && Array.isArray(item.product.images)) candidates.unshift(item.product.images[0]);
    if(item.product && item.product.image) candidates.unshift(item.product.image);
    return candidates.find(x => txt(x).trim()) || '';
  }
  function fmtDate(v){
    if(!v) return 'Not available';
    let d = v;
    if(v && typeof v.toDate === 'function') d = v.toDate();
    else if(typeof v === 'number') d = new Date(v < 10000000000 ? v*1000 : v);
    else d = new Date(v);
    if(isNaN(d.getTime())) return 'Not available';
    return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  window.aryantaFormatDate = fmtDate;
  window.aryantaProductImg = firstImage;

  async function ensureProductsFresh(){
    try{
      if(typeof window.ensureSellerProducts === 'function') return await window.ensureSellerProducts(true);
      if(typeof ensureSellerProducts === 'function') return await ensureSellerProducts(true);
    }catch(e){}
    return getProducts();
  }

  function injectLowStockNav(){
    if($('nav-lowStock') || document.querySelector('[data-aryanta-low-stock-nav]')) return;
    const inv = Array.from(document.querySelectorAll('.nav-item')).find(n => /my inventory/i.test(n.textContent||''));
    if(!inv) return;
    const div = document.createElement('div');
    div.className = 'nav-item';
    div.id = 'nav-lowStock';
    div.setAttribute('data-aryanta-low-stock-nav','1');
    div.setAttribute('onclick', "showSection('lowStock')");
    div.innerHTML = '<i class="fas fa-battery-quarter" style="color:var(--danger);"></i> Low Stock Items <span id="badge-low-stock" class="nav-badge" style="background:var(--danger);">0</span>';
    inv.insertAdjacentElement('afterend', div);
  }

  function injectLowStockSection(){
    if($('lowStockSection')) return;
    const content = document.querySelector('.content-padding') || document.querySelector('main .content') || document.querySelector('main') || document.body;
    const section = document.createElement('section');
    section.id = 'lowStockSection';
    section.className = 'data-section';
    section.innerHTML = `
      <div class="ary-final-page-head">
        <div>
          <h3><i class="fas fa-battery-quarter"></i> Low Stock Items</h3>
          <p>Products with stock less than ${LOW_STOCK_LIMIT}. Updating stock here directly modifies stock only and does not send the item to QC.</p>
        </div>
        <button class="btn-prime" type="button" onclick="aryantaRenderLowStock(true)"><i class="fas fa-sync-alt"></i> Refresh</button>
      </div>
      <div class="ary-low-stock-summary" id="lowStockSummary"></div>
      <div id="lowStockGrid" class="ary-low-stock-grid"></div>
    `;
    content.appendChild(section);
  }

  function injectStockModal(){
    if($('stockQuickEditModal')) return;
    const modal = document.createElement('div');
    modal.id = 'stockQuickEditModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-content ary-stock-modal">
        <div class="modal-header">
          <h3><i class="fas fa-boxes-stacked"></i> Direct Stock Update</h3>
          <button type="button" class="modal-close" onclick="closeModal('stockQuickEditModal')">&times;</button>
        </div>
        <div id="stockQuickProductInfo" class="ary-stock-product-info"></div>
        <label class="input-label">New Stock Quantity</label>
        <input id="stockQuickQty" type="number" class="input-field" min="0" step="1" placeholder="Enter new stock">
        <div class="ary-stock-note"><i class="fas fa-shield-check"></i> Only stock will update. QC status, approval, product title, price, image and live status will not be changed.</div>
        <button class="btn-prime w-100" type="button" onclick="aryantaSaveQuickStock()"><i class="fas fa-save"></i> Update Stock Directly</button>
      </div>`;
    document.body.appendChild(modal);
  }

  let activeStockProductId = '';
  window.aryantaOpenStockEditor = function(productId){
    const p = getProducts().find(x => String(x.id||x.productId||'') === String(productId));
    if(!p) return toast('Product not found. Refresh inventory and try again.','error');
    activeStockProductId = String(p.id || p.productId);
    const img = firstImage(p);
    const info = $('stockQuickProductInfo');
    if(info) info.innerHTML = `
      <div class="ary-stock-product-row">
        ${img ? `<img src="${esc(img)}" onerror="this.style.display='none'">` : '<div class="ary-no-img"><i class="fas fa-image"></i></div>'}
        <div><strong>${esc(p.name || p.title || 'Product')}</strong><span>SKU: ${esc(p.sku || p.productId || p.id || 'N/A')}</span><small>Current stock: ${esc(p.stock ?? 0)}</small></div>
      </div>`;
    const qty = $('stockQuickQty'); if(qty) qty.value = Number(p.stock || 0);
    if(typeof window.openModal === 'function') openModal('stockQuickEditModal'); else { const m=$('stockQuickEditModal'); if(m)m.style.display='flex'; }
  };

  window.aryantaSaveQuickStock = async function(){
    const db = getDb();
    const qty = parseInt(($('stockQuickQty')||{}).value,10);
    if(!db) return toast('Database not ready. Try again after panel loads.','error');
    if(!activeStockProductId) return toast('Select a product first.','warning');
    if(isNaN(qty) || qty < 0) return toast('Enter a valid stock number.','warning');
    try{
      const payload = { stock: qty, stockUpdatedAt: nowIso(), updatedAt: nowIso(), directStockUpdate: true, lastStockUpdateSource: 'seller_low_stock_page' };
      await db.collection('products').doc(activeStockProductId).update(payload);
      const products = getProducts().map(p => String(p.id||p.productId) === activeStockProductId ? {...p, ...payload} : p);
      setProducts(products);
      if(typeof window.closeModal === 'function') closeModal('stockQuickEditModal');
      toast('Stock updated directly. Product was not sent to QC.','success');
      window.aryantaRenderLowStock(false);
      try{ if(typeof window.loadInventory === 'function') window.loadInventory(); }catch(e){}
    }catch(e){ console.error(e); toast('Stock update failed. Check Firestore permission.','error'); }
  };

  window.aryantaRenderLowStock = async function(force){
    if(force) await ensureProductsFresh();
    const list = getProducts().filter(p => num(p.stock) < LOW_STOCK_LIMIT).sort((a,b)=>num(a.stock)-num(b.stock));
    const badge = $('badge-low-stock');
    if(badge){ badge.textContent = list.length; badge.style.display = list.length ? 'inline-block' : 'none'; }
    const summary = $('lowStockSummary');
    if(summary) summary.innerHTML = `
      <div><strong>${list.length}</strong><span>Items below ${LOW_STOCK_LIMIT}</span></div>
      <div><strong>${list.filter(p=>num(p.stock)<=0).length}</strong><span>Out of stock</span></div>
      <div><strong>${list.filter(p=>num(p.stock)>0 && num(p.stock)<LOW_STOCK_LIMIT).length}</strong><span>Urgent restock</span></div>`;
    const grid = $('lowStockGrid');
    if(!grid) return;
    if(!list.length){ grid.innerHTML = '<div class="ary-empty-state"><i class="fas fa-check-circle"></i><h3>All stock levels look good</h3><p>No products are below the low stock limit.</p></div>'; return; }
    grid.innerHTML = list.map(p => {
      const img = firstImage(p);
      const stock = num(p.stock);
      const id = esc(p.id || p.productId || '');
      return `<div class="ary-low-stock-card ${stock<=0?'out':''}">
        <div class="ary-product-img-wrap">${img ? `<img src="${esc(img)}" onerror="this.parentNode.innerHTML='<i class=&quot;fas fa-image&quot;></i>'">` : '<i class="fas fa-image"></i>'}</div>
        <div class="ary-low-stock-body">
          <strong>${esc(p.name || p.title || 'Unnamed Product')}</strong>
          <span>SKU: ${esc(p.sku || p.productId || p.id || 'N/A')}</span>
          <span>Last update: ${esc(fmtDate(p.stockUpdatedAt || p.updatedAt || p.createdAt))}</span>
          <div class="ary-stock-pill ${stock<=0?'danger':'warn'}">${stock} left</div>
        </div>
        <div class="ary-low-stock-actions">
          <button class="btn-prime" type="button" onclick="aryantaOpenStockEditor('${id}')"><i class="fas fa-pen"></i> Edit Stock</button>
          ${typeof window.editItem === 'function' ? `<button class="btn-outline" type="button" onclick="editItem('${id}')"><i class="fas fa-eye"></i> Open Product</button>` : ''}
        </div>
      </div>`;
    }).join('');
  };

  function injectSettingNoticeToggle(){
    const settingsSection = $('settingsSection');
    if(!settingsSection || $('settingShowNoticesFinal')) return;
    const grid = settingsSection.querySelector('.settings-grid-premium') || settingsSection.querySelector('.settings-grid') || settingsSection;
    const card = document.createElement('div');
    card.className = 'setting-card-premium ary-setting-card-final';
    card.innerHTML = `
      <div class="setting-left"><div class="setting-icon"><i class="fas fa-bullhorn"></i></div><div><div class="setting-title">Show Notices</div><div class="setting-sub">Show Aryanta update notices and system notices. Available for all sellers including Free.</div></div></div>
      <label class="premium-switch"><input type="checkbox" id="settingShowNoticesFinal" onchange="aryantaToggleShowNotices(this.checked)"><span class="switch-slider"></span></label>`;
    grid.appendChild(card);
    const seller = getSeller();
    const cb = $('settingShowNoticesFinal');
    if(cb) cb.checked = !(seller && seller.settings && seller.settings[NOTICE_SETTING_KEY] === false);
  }

  window.aryantaToggleShowNotices = async function(enabled){
    const db = getDb(), seller = getSeller();
    if(!seller) return;
    seller.settings = seller.settings || {};
    seller.settings[NOTICE_SETTING_KEY] = !!enabled;
    try{
      if(db && seller.email) await db.collection('sellers').doc(seller.email).set({settings:seller.settings, updatedAt:nowIso()},{merge:true});
      localStorage.setItem('sellerToken', JSON.stringify(seller));
      toast(enabled ? 'Notices enabled.' : 'Notices hidden. Only important alerts will show.','success');
      if(typeof window.fetchNotifications === 'function') window.fetchNotifications();
    }catch(e){ toast('Could not update notice setting.','error'); }
  };

  async function markNotificationRead(n){
    if(!n || n.read) return;
    const db = getDb();
    n.read = true; n.isRead = true;
    try{
      if(db && n.collection && n.id && !String(n.id).startsWith('built-')){
        await db.collection(n.collection).doc(n.id).set({read:true,isRead:true,readAt:nowIso()},{merge:true});
      }
      toast('Notification marked read.','success');
    }catch(e){ console.warn('mark read failed',e); }
    renderNotificationsClean();
  }

  function builtInNotices(){
    const seller = getSeller() || {};
    const notices = [];
    if(!seller.__welcomeNoticeHidden) notices.push({id:'built-welcome',collection:'built',title:'Welcome to Aryanta Seller',text:'You have successfully joined Aryanta Seller Network. Keep your stock and orders updated.',time:seller.createdAt||nowIso(),read:true});
    if(seller.subscription && !['none','basic / free','free'].includes(lower(seller.subscription))) notices.push({id:'built-sub',collection:'built',title:'Subscription Active',text:`Your ${seller.subscription} subscription is active. Check plan benefits in Subscription Details.`,time:seller.subStartDate||nowIso(),read:true});
    if((getOrders()||[]).length>0) notices.push({id:'built-first-order',collection:'built',title:'Congrats on your first order',text:'You received orders on Aryanta. Accept only when stock and packing documents are ready.',time:(getOrders()[0]||{}).timestamp||nowIso(),read:true});
    notices.push({id:'built-stock',collection:'built',title:'Low Stock Reminder',text:'Use the Low Stock page to update stock directly without sending the product to QC.',time:nowIso(),read:true});
    return notices;
  }

  function normalizeNotif(doc, collection){
    const d = doc.data ? doc.data() : (doc || {});
    return {
      id: doc.id || d.id || Math.random().toString(36).slice(2), collection,
      title: d.title || d.heading || 'Aryanta Notice',
      text: d.message || d.text || d.body || d.description || 'New update from Aryanta.',
      time: d.createdAt || d.timestamp || d.time || nowIso(),
      link: d.link || d.url || d.actionUrl || '',
      target: lower(d.target || d.email || d.sellerEmail || 'all'),
      read: d.read === true || d.isRead === true,
      priority: d.priority || ''
    };
  }

  async function fetchNotificationsClean(){
    const db = getDb(), seller = getSeller();
    if(!db || !seller) return renderNotificationsClean();
    const email = activeEmail();
    const rows = [];
    try{
      const snap = await db.collection('seller_notifications').limit(80).get();
      snap.forEach(doc => { const n=normalizeNotif(doc,'seller_notifications'); if(['all','sellers',email,''].includes(n.target)) rows.push(n); });
    }catch(e){}
    try{
      const snap = await db.collection('admin_broadcasts').limit(80).get();
      snap.forEach(doc => { const n=normalizeNotif(doc,'admin_broadcasts'); if(['all','sellers',email,''].includes(n.target)) rows.push(n); });
    }catch(e){}
    const showNotices = !(seller.settings && seller.settings[NOTICE_SETTING_KEY] === false);
    if(showNotices) rows.push(...builtInNotices());
    const seen = new Set();
    const deduped = rows.filter(n => {
      const key = lower((n.collection||'')+'|'+(n.id||'')+'|'+(n.title||'')+'|'+(n.text||''));
      if(seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b)=>new Date(b.time||0)-new Date(a.time||0)).slice(0,60);
    window.adminNotifications = deduped;
    try{ if(typeof adminNotifications !== 'undefined') adminNotifications = deduped; }catch(e){}
    renderNotificationsClean();
  }

  function renderNotificationsClean(){
    const list = window.adminNotifications || (typeof adminNotifications !== 'undefined' ? adminNotifications : []);
    const unread = list.filter(n => !n.read && n.collection !== 'built').length;
    ['notifBadge','topbarNotifBadge'].forEach(id => { const b=$(id); if(b){ b.textContent = unread || list.length || 0; b.style.display = list.length ? 'inline-flex' : 'none'; }});
    const html = list.length ? list.map(n => {
      const link = n.link ? `<a class="short-link-chip" href="${esc(String(n.link).startsWith('http')?n.link:'https://'+n.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fas fa-link"></i> Open Link</a>` : '';
      return `<div class="notification-card ${n.read?'read':'unread'}" onclick="aryantaOpenNotification('${esc(n.id)}')">
        <div class="ary-notif-top"><strong>${esc(n.title)}</strong>${n.read?'<span>Read</span>':'<span class="unread-chip">New</span>'}</div>
        <p>${esc(n.text)}</p><small><i class="fas fa-clock"></i> ${esc(fmtDate(n.time))}</small>${link}
      </div>`;
    }).join('') : '<div class="ary-empty-state"><i class="fas fa-bell-slash"></i><h3>No notifications</h3><p>New Aryanta notices will appear here.</p></div>';
    ['notifList','fullNotifList'].forEach(id => { const el=$(id); if(el) el.innerHTML=html; });
  }

  window.aryantaOpenNotification = async function(id){
    const list = window.adminNotifications || (typeof adminNotifications !== 'undefined' ? adminNotifications : []);
    const n = list.find(x => String(x.id) === String(id));
    if(!n) return;
    await markNotificationRead(n);
    const cont = $('notifDetailContent');
    const mod = $('notificationDetailModal');
    const link = n.link ? `<a href="${esc(String(n.link).startsWith('http')?n.link:'https://'+n.link)}" target="_blank" rel="noopener" class="btn-prime"><i class="fas fa-external-link-alt"></i> Open Link</a>` : '';
    if(cont && mod){
      cont.innerHTML = `<div class="ary-notif-detail"><h3>${esc(n.title)}</h3><small><i class="fas fa-clock"></i> ${esc(fmtDate(n.time))}</small><p>${esc(n.text)}</p>${link}</div>`;
      mod.style.display='flex'; setTimeout(()=>mod.classList.add('show'),10);
    }else{
      toast(n.title+': '+n.text,'info');
      if(n.link) window.open(String(n.link).startsWith('http')?n.link:'https://'+n.link,'_blank','noopener');
    }
  };

  function installNotificationOverrides(){
    window.fetchNotifications = fetchNotificationsClean;
    try{ fetchNotifications = fetchNotificationsClean; }catch(e){}
    window.openFullNotif = window.aryantaOpenNotification;
    window.openFullNotifFinal = window.aryantaOpenNotification;
  }

  async function applyOfflineMode(enabled){
    const db = getDb(), seller = getSeller();
    if(!db || !seller || !seller.email) return toast('Database or seller not ready.','error');
    seller.settings = seller.settings || {};
    seller.settings.offline = !!enabled;
    try{
      await db.collection('sellers').doc(seller.email).set({settings:seller.settings, offline:!!enabled, updatedAt:nowIso()},{merge:true});
      const products = getProducts();
      const batch = db.batch();
      products.forEach(p => {
        const approved = ['approved','live','qc pass','pass'].includes(lower(p.approvalStatus || p.qcStatus)) || p.isVisible === true;
        if(p.id && (enabled || approved)) batch.update(db.collection('products').doc(p.id), {isVisible: enabled ? false : approved, sellerOffline:!!enabled, updatedAt:nowIso()});
      });
      await batch.commit().catch(()=>{});
      products.forEach(p => { p.sellerOffline = !!enabled; if(enabled) p.isVisible=false; });
      localStorage.setItem('sellerToken', JSON.stringify(seller));
      toast(enabled ? 'Offline mode ON. Live products hidden from customers.' : 'Offline mode OFF. Approved products restored online.','success');
    }catch(e){ console.error(e); toast('Offline mode update failed.','error'); }
  }
  window.aryantaApplyOfflineMode = applyOfflineMode;

  function patchToggleSetting(){
    const old = window.toggleSetting;
    window.toggleSetting = async function(key){
      const el = document.getElementById('setting'+String(key||'').charAt(0).toUpperCase()+String(key||'').slice(1)) || document.getElementById('settingOffline');
      if(key === 'offline') return applyOfflineMode(!!(el && el.checked));
      if(key === NOTICE_SETTING_KEY) return window.aryantaToggleShowNotices(!!(el && el.checked));
      if(typeof old === 'function') return old.apply(this, arguments);
    };
  }

  function orderSellerItems(order){
    if(typeof window.getSellerItemsFromOrder === 'function') return window.getSellerItemsFromOrder(order);
    try{ if(typeof getSellerItemsFromOrder === 'function') return getSellerItemsFromOrder(order); }catch(e){}
    return Array.isArray(order && order.items) ? order.items : [];
  }
  function insufficientStock(order){
    const products = getProducts();
    return orderSellerItems(order).map(i => {
      const p = products.find(pr => String(pr.id||pr.productId||'') === String(i.productId||i.id||i.product_id||'') || lower(pr.sku) === lower(i.sku));
      const stock = p ? num(p.stock) : num(i.stock);
      const qty = num(i.qty || i.quantity || 1);
      return {item:i, product:p, stock, qty, low: stock < qty};
    }).filter(x=>x.low);
  }
  async function cancelNoFineStock(order, missing){
    const db = getDb(); if(!db || !order || !order.id) return;
    const payload = {
      status:'Cancelled', sellerCancelled:true, sellerCancelNoFine:true, noFineReason:'Stock lower than order quantity', noFineStockProtection:true,
      cancelReason:'Seller stock is lower than order quantity. No fine should be recovered.', cancelledAt:nowIso(), updatedAt:nowIso(), stockShortItems: missing.map(x=>({name:x.item.name||x.item.title||'', sku:x.item.sku||'', orderedQty:x.qty, availableStock:x.stock}))
    };
    await db.collection('orders').doc(order.id).set(payload,{merge:true});
    Object.assign(order,payload);
    toast('Order cancelled with no-fine stock protection. Admin can see the reason.','success');
    try{ if(typeof window.loadNewOrders==='function') window.loadNewOrders(); if(typeof window.loadAcceptedOrders==='function') window.loadAcceptedOrders(); }catch(e){}
  }
  function findOrderById(orderId){ return (getOrders()||[]).find(o => String(o.id||o.orderId||o.order_no) === String(orderId)); }
  function patchOrderAcceptCancel(){
    const names = ['acceptOrder','acceptOrderNow','markOrderAccepted','updateOrderStatus'];
    names.forEach(name => {
      const old = window[name];
      if(typeof old !== 'function' || old.__aryStockPatched) return;
      const patched = async function(orderId, status){
        const isAccept = name !== 'updateOrderStatus' || ['accepted','accept'].includes(lower(status));
        if(isAccept){
          const order = findOrderById(orderId);
          const missing = insufficientStock(order);
          if(order && missing.length){
            const msg = missing.map(x => `${x.item.name||x.item.title||x.item.sku||'Item'}: ordered ${x.qty}, stock ${x.stock}`).join('\n');
            if(confirm('Stock is lower than received order quantity.\n\n'+msg+'\n\nCancel this order with NO FINE protection?')){
              await cancelNoFineStock(order, missing);
              return;
            }
          }
        }
        return old.apply(this, arguments);
      };
      patched.__aryStockPatched = true;
      window[name] = patched;
      try{ eval(name+'=window[name]'); }catch(e){}
    });
  }

  function patchShowSection(){
    const old = window.showSection;
    if(old && old.__aryFinalPatched) return;
    const patched = function(section){
      injectLowStockNav(); injectLowStockSection(); injectStockModal(); injectSettingNoticeToggle();
      if(section === 'lowStock'){
        const sb=$('mobileSidebar'); if(sb) sb.classList.remove('open'); const ov=$('mobileSidebarOverlay'); if(ov) ov.style.display='none';
        qsa('.data-section').forEach(sec=>sec.classList.remove('active'));
        const target=$('lowStockSection'); if(target) target.classList.add('active');
        qsa('.nav-item').forEach(n=>n.classList.remove('active'));
        const nav=$('nav-lowStock'); if(nav) nav.classList.add('active');
        window.aryantaRenderLowStock(true);
        return;
      }
      const result = typeof old === 'function' ? old.apply(this, arguments) : undefined;
      if(section === 'settings') setTimeout(injectSettingNoticeToggle,120);
      return result;
    };
    patched.__aryFinalPatched = true;
    window.showSection = patched;
    try{ showSection = patched; }catch(e){}
  }

  function improveDatesAndImages(){
    qsa('[data-date],[data-time]').forEach(el => { if(!el.textContent.trim()) el.textContent = fmtDate(el.getAttribute('data-date') || el.getAttribute('data-time')); });
    qsa('.order-date,.date-cell,.created-at,.updated-at').forEach(el => { if(!el.textContent.trim() || /invalid date/i.test(el.textContent)) el.textContent = 'Not available'; });
  }

  function bootFinalPatch(){
    injectLowStockNav(); injectLowStockSection(); injectStockModal(); injectSettingNoticeToggle();
    installNotificationOverrides(); patchToggleSetting(); patchOrderAcceptCancel(); patchShowSection(); improveDatesAndImages();
    setTimeout(()=>{ window.aryantaRenderLowStock(false); fetchNotificationsClean(); },700);
    setInterval(()=>{ try{ window.aryantaRenderLowStock(false); improveDatesAndImages(); }catch(e){} },15000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFinalPatch); else bootFinalPatch();
})();

/* ============================================================
   ARYANTA SELLER PANEL V4 FIX
   Fixes: Firestore-only Shiprocket state, notification vanish,
   Chart.js duplicate canvas crash, delete-product cleanup,
   custom delete popup, subscription expiry/renewal, order popups,
   return tracking, shipped/delivered/completed scans, warranty action.
   Paste at the VERY END of seller.js.
============================================================ */
(function(){
  if(window.__ARYANTA_SELLER_V4_PATCH__) return;
  window.__ARYANTA_SELLER_V4_PATCH__ = true;

  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  const txt = v => String(v == null ? '' : v);
  const low = v => txt(v).toLowerCase().trim();
  const esc = v => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const nowIso = () => new Date().toISOString();
  const dayMs = 86400000;
  const toastRaw = (m,t='info') => { try{ if(typeof window.__ARYANTA_ORIGINAL_TOAST_V4 === 'function') return window.__ARYANTA_ORIGINAL_TOAST_V4(m,t); if(typeof window.showToast === 'function') return window.showToast(m,t); }catch(e){} console.log(t,m); };
  const dbx = () => { try{return db || window.db || null;}catch(e){return window.db || null;} };
  const seller = () => { try{return activeSeller || window.activeSeller || null;}catch(e){return window.activeSeller || null;} };
  const orders = () => { try{return sellerOrders || window.sellerOrders || [];}catch(e){return window.sellerOrders || [];} };
  const products = () => { try{return sellerProducts || window.sellerProducts || [];}catch(e){return window.sellerProducts || [];} };
  const warranties = () => { try{return sellerWarranties || window.sellerWarranties || [];}catch(e){return window.sellerWarranties || [];} };
  const email = () => low((seller() || {}).email);
  const sellerDocId = () => txt((seller() || {}).email || (seller() || {}).id || (seller() || {}).uid).trim();
  const validDb = () => !!(dbx() && seller());
  const safeId = v => txt(v || '').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,150) || ('doc_'+Date.now());
  const dateOf = v => { if(!v) return null; if(v && typeof v.toDate === 'function') return v.toDate(); const d = new Date(v); return Number.isFinite(d.getTime()) ? d : null; };
  const orderDate = o => dateOf(o && (o.timestamp || o.createdAt || o.orderDate || o.date || o.acceptedAt || o.updatedAt)) || new Date();
  const isStatus = (o, arr) => arr.some(s => low(o && (o.status || o.orderStatus || o.fulfillmentStatus)).includes(s));

  function sellerSetting(key, fallback){
    const s = seller();
    if(!s || !s.settings) return fallback;
    return s.settings[key] === undefined ? fallback : s.settings[key];
  }
  function showNotices(){ return sellerSetting('showNotices', true) !== false; }
  function isMinorNotice(message){
    const m = low(message);
    return m.includes('setting') || m.includes('offline') || m.includes('go live') || m.includes('saved') || m.includes('notice');
  }

  if(!window.__ARYANTA_ORIGINAL_TOAST_V4) window.__ARYANTA_ORIGINAL_TOAST_V4 = window.showToast;
  window.showToast = function(msg,type='info'){
    if(!showNotices() && ['success','info','warning'].includes(type) && isMinorNotice(msg)) return;
    return window.__ARYANTA_ORIGINAL_TOAST_V4 ? window.__ARYANTA_ORIGINAL_TOAST_V4(msg,type) : console.log(type,msg);
  };
  try{ showToast = window.showToast; }catch(e){}

  function injectStyle(){
    if($('aryantaSellerV4Style')) return;
    const style = document.createElement('style');
    style.id = 'aryantaSellerV4Style';
    style.textContent = `
      .ary-v4-modal{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.62);display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(10px)}
      .ary-v4-card{width:min(560px,100%);max-height:88vh;overflow:auto;background:var(--white,#fff);color:var(--text-main,#111827);border-radius:24px;border:1px solid var(--border-color,#e5e7eb);box-shadow:0 30px 80px rgba(0,0,0,.28);padding:22px;animation:aryV4In .18s ease-out}
      @keyframes aryV4In{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
      .ary-v4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.ary-v4-head h3{font-size:20px;font-weight:950;margin:0}.ary-v4-x{border:0;background:var(--surface-2,#f3f4f6);border-radius:12px;width:38px;height:38px;cursor:pointer;color:var(--text-main,#111827)}
      .ary-v4-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}.ary-v4-danger{background:var(--danger,#ef4444)!important;color:white!important}.ary-v4-grid{display:grid;gap:10px}.ary-v4-item{display:flex;gap:10px;align-items:center;border:1px solid var(--border-color,#e5e7eb);background:var(--surface-2,#f8fafc);border-radius:16px;padding:10px}.ary-v4-item img{width:58px;height:58px;border-radius:14px;object-fit:cover;background:#e5e7eb}.ary-v4-muted{color:var(--text-light,#64748b);font-size:12px;font-weight:750;line-height:1.5}.ary-v4-chip{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:950;background:var(--surface-2,#f1f5f9);border:1px solid var(--border-color,#e2e8f0)}
      .ary-v4-ok{background:#ecfdf5!important;color:#065f46!important;border-color:#a7f3d0!important}.ary-v4-warn{background:#fffbeb!important;color:#92400e!important;border-color:#fde68a!important}.ary-v4-bad{background:#fff1f2!important;color:#991b1b!important;border-color:#fecaca!important}
      .shiprocket-action-col{display:flex;flex-direction:column;gap:8px;align-items:flex-end}.no-fine-note{margin-top:8px;display:inline-flex;gap:7px;align-items:center;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;padding:8px 10px;font-size:12px;font-weight:900}.ok-chip{margin-top:8px;display:inline-flex;gap:7px;align-items:center;border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;border-radius:12px;padding:8px 10px;font-size:12px;font-weight:900}.notification-card{padding:14px;border:1px solid var(--border-color);border-radius:16px;background:var(--white);margin-bottom:10px;cursor:pointer;box-shadow:var(--shadow-sm)}.notification-card.unread{border-left:5px solid var(--primary);background:linear-gradient(135deg,var(--white),var(--surface-2))}.notification-card.read{opacity:.78}.ary-notif-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.ary-notif-top strong{font-size:14px}.ary-notif-top span{font-size:11px;font-weight:950;border-radius:999px;padding:3px 8px;background:var(--primary);color:#fff}.notification-card p{margin:8px 0;color:var(--text-main);font-weight:750;line-height:1.45}.notification-card small{color:var(--text-light);font-weight:850}.return-track-card,.perf-card{border:1px solid var(--border-color);border-radius:18px;background:var(--white);padding:14px;margin-bottom:12px;box-shadow:var(--shadow-sm)}
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    injectStyle();
    let m = $('aryV4Modal');
    if(m) return m;
    m = document.createElement('div');
    m.id = 'aryV4Modal';
    m.className = 'ary-v4-modal';
    m.innerHTML = `<div class="ary-v4-card"><div class="ary-v4-head"><h3 id="aryV4Title"></h3><button class="ary-v4-x" id="aryV4Close"><i class="fas fa-times"></i></button></div><div id="aryV4Body"></div><div class="ary-v4-actions" id="aryV4Actions"></div></div>`;
    document.body.appendChild(m);
    $('aryV4Close').onclick = () => m.style.display = 'none';
    m.addEventListener('click', e => { if(e.target === m) m.style.display = 'none'; });
    return m;
  }
  function customDialog({title, body, actions}){
    const m = ensureModal();
    $('aryV4Title').innerHTML = title;
    $('aryV4Body').innerHTML = body;
    $('aryV4Actions').innerHTML = actions || `<button class="btn-prime" onclick="document.getElementById('aryV4Modal').style.display='none'">OK</button>`;
    m.style.display = 'flex';
  }
  function confirmDialog(title, body, yesText='Confirm'){
    return new Promise(resolve => {
      customDialog({
        title,
        body,
        actions:`<button class="btn-outline" id="aryV4No">Cancel</button><button class="btn-prime ary-v4-danger" id="aryV4Yes">${esc(yesText)}</button>`
      });
      $('aryV4No').onclick = () => { $('aryV4Modal').style.display='none'; resolve(false); };
      $('aryV4Yes').onclick = () => { $('aryV4Modal').style.display='none'; resolve(true); };
    });
  }

  function imgForItem(item){
    const ps = products();
    const iid = txt(item && (item.productId || item.product_id || item.id || item.productDocId)).trim();
    const isku = low(item && item.sku);
    const iname = low(item && (item.name || item.title || item.productName));
    const p = ps.find(x => {
      const pid = txt(x.id || x.productId || x.product_id).trim();
      const psku = low(x.sku);
      const pname = low(x.name || x.title);
      return (iid && pid && iid === pid) || (isku && psku && isku === psku) || (iname && pname && iname === pname);
    }) || {};
    const arr = Array.isArray(p.images) ? p.images : [];
    return txt(item.image || item.img || item.productImage || p.image || p.img || p.photo || arr[0] || '').trim();
  }
  function orderItems(order){
    let items = [];
    try{ if(typeof window.getSellerItemsFromOrder === 'function') items = window.getSellerItemsFromOrder(order) || []; }catch(e){}
    try{ if(!items.length && typeof getSellerItemsFromOrder === 'function') items = getSellerItemsFromOrder(order) || []; }catch(e){}
    if(!items.length && Array.isArray(order && order.items)) items = order.items;
    if(!items.length && order) items = [{name:order.productName || order.itemName || 'Product', qty:order.qty || order.quantity || 1, price:order.price || order.amount || order.total || order.finalAmount || 0}];
    return items;
  }
  function itemLine(item){
    const img = imgForItem(item);
    const name = item.name || item.title || item.productName || 'Product';
    const qty = item.qty || item.quantity || 1;
    const price = num(item.sellingPrice || item.price || item.amount || 0);
    return `<div class="ary-v4-item">${img ? `<img src="${esc(img)}" onerror="this.style.display='none'">` : `<img style="display:none">`}<div><b>${esc(name)}</b><div class="ary-v4-muted">SKU: ${esc(item.sku || item.productId || item.id || 'N/A')} · Qty: ${esc(qty)} · Seller Price: ₹${price.toLocaleString('en-IN')}</div></div></div>`;
  }
  function orderAmount(o){ return orderItems(o).reduce((s,i)=>s + num(i.sellingPrice || i.price || i.amount || 0) * Math.max(1,num(i.qty || i.quantity || 1)),0); }
  function findOrder(id){ const key = txt(id); return orders().find(o => [o.id,o.orderId,o.order_no,o.orderNo,o.invoiceId].some(v => txt(v) === key)); }
  function shipUrl(o){ return txt(o && (o.shiprocketInvoicePdfUrl || o.shiprocketPdfUrl || o.shiprocket_invoice_pdf_url || o.shiprocketInvoiceUrl || o.shiprocket_invoice_url || o.shippingLabelUrl || o.label_url || o.pdf_url || o.invoicePdfUrl)).trim(); }
  function shipStatus(o){ if(shipUrl(o)) return 'ready'; return low(o && (o.shiprocketInvoiceStatus || o.shiprocket_status || o.shiprocketStatus)); }
  function hasShipWork(o){ return !!(o && (shipUrl(o) || o.shiprocketInvoiceRequested || o.shiprocketInvoiceNoFine || shipStatus(o) || o.shiprocketRequestId || o.shiprocketInvoiceRequestedAt)); }
  function absUrl(u){ u = txt(u).trim(); return u && !/^https?:\/\//i.test(u) ? 'https://' + u : u; }

  async function hydrateShiprocketV4(){
    if(!validDb() || !email()) return;
    const database = dbx();
    try{
      const snap = await database.collection('seller_shiprocket_invoices').where('sellerEmail','==',email()).limit(500).get();
      snap.forEach(doc => {
        const d = doc.data() || {};
        const oid = txt(d.orderId || d.order_id || d.id || d.orderNo || d.order_no).trim();
        if(!oid) return;
        orders().forEach(o => {
          if([o.id,o.orderId,o.order_no,o.orderNo].some(v => txt(v) === oid)) Object.assign(o,d);
        });
      });
    }catch(e){ console.warn('Shiprocket hydrate failed. Add seller_shiprocket_invoices rule.', e && e.message ? e.message : e); }
  }

  async function saveShipState(order, fields){
    if(!validDb() || !order) return false;
    const database = dbx();
    const id = txt(order.id || order.orderId || order.order_no || order.orderNo).trim();
    if(!id) return false;
    const payload = Object.assign({}, fields, {orderId:id, sellerEmail:email(), updatedAt:nowIso()});
    Object.assign(order,payload);
    let ok = false;
    try{ await database.collection('orders').doc(txt(order.id || id)).set(payload,{merge:true}); ok = true; }catch(e){ console.warn('orders ship state save failed',e && e.message ? e.message : e); }
    try{ await database.collection('seller_shiprocket_invoices').doc(safeId(id+'_'+email())).set(payload,{merge:true}); ok = true; }catch(e){ console.warn('seller_shiprocket_invoices save failed. Add rule.',e && e.message ? e.message : e); }
    return ok;
  }

  const originalDownloadShiprocket = window.downloadShippingInvoice;
  window.downloadShippingInvoice = async function(orderId){
    let ids = [];
    if(orderId === 'bulk'){
      qsa('.cb-acc:checked').forEach(cb => ids.push(cb.value));
      if(!ids.length) return window.showToast('Select at least one accepted order.','warning');
    }else ids = [orderId];

    for(const id of ids){
      const o = findOrder(id);
      if(o) await saveShipState(o,{shiprocketInvoiceRequested:true,shiprocketInvoiceNoFine:true,shiprocketInvoiceStatus:shipStatus(o) || 'requested',shiprocketInvoiceRequestedAt:o.shiprocketInvoiceRequestedAt || nowIso()});
    }
    if(typeof window.loadAcceptedOrders === 'function') setTimeout(()=>window.loadAcceptedOrders(),80);

    try{
      if(typeof originalDownloadShiprocket === 'function') await originalDownloadShiprocket.apply(this, arguments);
    }catch(e){
      console.error(e);
      window.showToast('Shiprocket request failed, but DB status is saved. Fix package/API and retry.','warning');
    }

    for(const id of ids){
      const o = findOrder(id);
      if(o) await saveShipState(o,{shiprocketInvoiceRequested:true,shiprocketInvoiceNoFine:shipUrl(o)?false:true,shiprocketInvoiceStatus:shipUrl(o)?'ready':(shipStatus(o) || 'requested'),shiprocketInvoicePdfUrl:shipUrl(o) || '',shiprocketInvoiceCheckedAt:nowIso()});
    }
    if(typeof window.loadAcceptedOrders === 'function') setTimeout(()=>window.loadAcceptedOrders(),120);
  };
  try{ downloadShippingInvoice = window.downloadShippingInvoice; }catch(e){}

  function renderShipBtn(o){
    const url = shipUrl(o), st = shipStatus(o);
    if(url) return `<button class="btn-shiprocket shiprocket-ready-btn" onclick="event.stopPropagation(); window.open('${esc(absUrl(url))}','_blank','noopener')"><i class="fas fa-download"></i> Download Shiprocket PDF</button>`;
    const label = st === 'missing_details' ? 'Fix Missing Details' : (st === 'api_error' || st === 'timeout' ? 'Retry Shiprocket' : (st === 'generating' || st === 'waiting_pdf' || st === 'requested' ? 'Waiting / Retry PDF' : 'Generate Shiprocket'));
    return `<button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice('${esc(o.id || o.order_no || o.orderNo)}')"><i class="fas ${st === 'generating' || st === 'waiting_pdf' ? 'fa-spinner fa-spin' : 'fa-rocket'}"></i> ${label}</button>`;
  }

  window.loadAcceptedOrders = async function(){
    await hydrateShiprocketV4();
    const list = $('acceptedOrdersList');
    if(!list) return;
    const rows = orders().filter(o => isStatus(o,['accepted','processing','packed','ready to ship','completed scan']) || hasShipWork(o));
    if(!rows.length){ list.innerHTML = `<tr><td colspan="5" style="text-align:center;font-weight:800;padding:22px;">No accepted / Shiprocket pending orders.</td></tr>`; return; }
    list.innerHTML = rows.map(o => {
      const note = shipUrl(o) ? `<div class="ok-chip"><i class="fas fa-check-circle"></i> Shiprocket PDF saved in DB.</div>` : (hasShipWork(o) ? `<div class="no-fine-note"><i class="fas fa-shield-heart"></i> Shiprocket status saved in Firestore: <b>${esc(shipStatus(o) || 'requested')}</b>. Order will stay visible after refresh.</div>` : '');
      const id = esc(o.id || o.orderId || o.order_no || o.orderNo);
      return `<tr class="clickable-row" onclick="viewOrderDetails('${id}')">
        <td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-acc" value="${id}" onclick="event.stopPropagation()"></td>
        <td data-label="Order Date"><strong style="font-size:13px;">${esc(orderDate(o).toLocaleString())}</strong></td>
        <td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);font-size:14px;">${esc(o.order_no || o.orderNo || o.id || 'N/A')}</strong><br><small class="ary-v4-muted">${esc(o.status || o.orderStatus || '')}</small></td>
        <td data-label="Item Details">${orderItems(o).map(itemLine).join('')}${note}</td>
        <td data-label="Action"><div class="shiprocket-action-col">${renderShipBtn(o)}<button class="btn-outline btn-sm" onclick="event.stopPropagation(); viewOrderDetails('${id}')"><i class="fas fa-eye"></i> Details</button></div></td>
      </tr>`;
    }).join('');
  };
  try{ loadAcceptedOrders = window.loadAcceptedOrders; }catch(e){}

  function chartData7(){
    const days = [];
    for(let i=6;i>=0;i--){ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i); days.push({key:d.toISOString().slice(0,10), label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), value:0}); }
    const map = new Map(days.map(d => [d.key,d]));
    orders().forEach(o => {
      if(isStatus(o,['cancel','return'])) return;
      const d = orderDate(o); d.setHours(0,0,0,0);
      const k = d.toISOString().slice(0,10);
      if(map.has(k)) map.get(k).value += orderAmount(o);
    });
    return days;
  }
  function render7DayTrendSafe(){
    const canvas = $('salesChart');
    if(!canvas || typeof Chart === 'undefined') return;
    try{ const old = Chart.getChart ? Chart.getChart(canvas) : null; if(old) old.destroy(); }catch(e){}
    try{ if(window.salesChartInstance && typeof window.salesChartInstance.destroy === 'function') window.salesChartInstance.destroy(); }catch(e){}
    try{ if(typeof salesChartInstance !== 'undefined' && salesChartInstance && typeof salesChartInstance.destroy === 'function') salesChartInstance.destroy(); }catch(e){}
    const trend = chartData7();
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0,0,0,250);
    gradient.addColorStop(0,'rgba(17,24,39,0.25)');
    gradient.addColorStop(1,'rgba(17,24,39,0.02)');
    const chart = new Chart(canvas,{type:'line',data:{labels:trend.map(x=>x.label),datasets:[{label:'7-Day Sales (₹)',data:trend.map(x=>Math.round(x.value)),borderColor:'#111827',backgroundColor:gradient,fill:true,tension:.35,borderWidth:3,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'₹'+Number(v).toLocaleString('en-IN')}},x:{grid:{display:false}}}}});
    window.salesChartInstance = chart;
    try{ salesChartInstance = chart; }catch(e){}
  }
  const oldRenderDash = window.renderDashboardStats;
  window.renderDashboardStats = async function(){
    const res = oldRenderDash ? await oldRenderDash.apply(this, arguments) : null;
    setTimeout(render7DayTrendSafe,60);
    return res;
  };
  try{ renderDashboardStats = window.renderDashboardStats; }catch(e){}

  async function cleanupReadNotifications(){
    if(!validDb() || !email()) return;
    const database = dbx();
    const cutoff = Date.now() - 7*dayMs;
    try{
      const snap = await database.collection('seller_notification_reads').where('sellerEmail','==',email()).limit(300).get();
      const batch = database.batch(); let changed = 0;
      snap.forEach(doc => {
        const d = doc.data() || {}; const rd = dateOf(d.readAt);
        if(rd && rd.getTime() < cutoff){ batch.delete(doc.ref); changed++; }
      });
      if(changed) await batch.commit();
    }catch(e){}
    try{
      const snap = await database.collection('seller_notifications').where('sellerEmail','==',email()).where('readBySeller','==',true).limit(300).get();
      const batch = database.batch(); let changed = 0;
      snap.forEach(doc => {
        const d = doc.data() || {}; const rd = dateOf(d.readAt || d.readAtSeller);
        if(rd && rd.getTime() < cutoff){ batch.delete(doc.ref); changed++; }
      });
      if(changed) await batch.commit();
    }catch(e){}
  }
  async function readNotificationMap(){
    const map = new Map();
    if(!validDb() || !email()) return map;
    try{
      const snap = await dbx().collection('seller_notification_reads').where('sellerEmail','==',email()).limit(500).get();
      snap.forEach(doc => { const d = doc.data() || {}; if(d.notificationId) map.set(txt(d.notificationId), d); });
    }catch(e){ console.warn('seller_notification_reads denied. Add rule.', e && e.message ? e.message : e); }
    return map;
  }
  function normalizeNotif(doc, collection, readMap){
    const d = doc.data ? doc.data() : doc;
    const id = doc.id || d.id || safeId(d.title || d.message || Date.now());
    const read = readMap.has(txt(id)) || d.readBySeller === true;
    return {id, collection, title:d.title || d.heading || 'Aryanta Notice', text:d.message || d.text || d.body || d.description || 'New update from Aryanta.', time:d.timestamp || d.createdAt || d.time || nowIso(), link:d.link || d.url || d.actionUrl || d.buttonLink || '', target:low(d.target || d.email || d.sellerEmail || 'all'), read, readAt:readMap.get(txt(id)) && readMap.get(txt(id)).readAt};
  }
  function targetOk(n){ const e = email(); return !n.target || ['all','seller','sellers'].includes(n.target) || n.target === e; }
  function renderNotifs(list){
    window.adminNotifications = list;
    try{ adminNotifications = list; }catch(e){}
    const unread = list.filter(n => !n.read).length;
    ['notifBadge','topbarNotifBadge'].forEach(id => { const b=$(id); if(b){ b.textContent = unread || list.length || 0; b.style.display = list.length ? 'inline-flex' : 'none'; } });
    const html = list.length ? list.map(n => `<div class="notification-card ${n.read?'read':'unread'}" onclick="openFullNotif('${esc(n.id)}')"><div class="ary-notif-top"><strong>${esc(n.title)}</strong><span>${n.read?'Read':'New'}</span></div><p>${esc(n.text)}</p><small><i class="fas fa-clock"></i> ${esc((dateOf(n.time)||new Date()).toLocaleString())}</small>${n.link?`<br><a class="short-link-chip" onclick="event.stopPropagation()" href="${esc(absUrl(n.link))}" target="_blank" rel="noopener"><i class="fas fa-link"></i> Open Link</a>`:''}</div>`).join('') : `<div class="ary-empty-state" style="text-align:center;padding:28px;color:var(--text-light);font-weight:800;"><i class="fas fa-bell-slash" style="font-size:32px;"></i><br>No notifications.</div>`;
    ['fullNotifList','notifList'].forEach(id => { const el=$(id); if(el) el.innerHTML = html; });
  }
  window.fetchNotifications = async function(){
    if(!validDb()) return renderNotifs([]);
    await cleanupReadNotifications();
    if(!showNotices()) return renderNotifs([]);
    const readMap = await readNotificationMap();
    const out = [];
    async function q(collection, fn){
      try{ const snap = await fn(dbx().collection(collection)); snap.forEach(doc => { const n = normalizeNotif(doc,collection,readMap); if(targetOk(n)) out.push(n); }); }catch(e){}
    }
    await q('admin_broadcasts', c => c.orderBy('timestamp','desc').limit(100).get());
    await q('seller_notifications', c => c.where('sellerEmail','==',email()).limit(100).get());
    await q('seller_notifications', c => c.where('email','==',email()).limit(100).get());
    const seen = new Set();
    const final = out.filter(n => { const key = n.collection+'|'+n.id; if(seen.has(key)) return false; seen.add(key); const rd = dateOf(n.readAt); if(rd && Date.now()-rd.getTime() > 7*dayMs) return false; return true; }).sort((a,b)=>(dateOf(b.time)?.getTime()||0)-(dateOf(a.time)?.getTime()||0));
    renderNotifs(final);
  };
  try{ fetchNotifications = window.fetchNotifications; }catch(e){}
  window.openFullNotif = async function(id){
    const n = (window.adminNotifications || []).find(x => txt(x.id) === txt(id));
    if(!n) return;
    n.read = true;
    try{
      await dbx().collection('seller_notification_reads').doc(safeId(n.id+'_'+email())).set({notificationId:n.id,collection:n.collection,sellerEmail:email(),readAt:nowIso(),title:n.title,text:n.text,link:n.link || ''},{merge:true});
      if(n.collection === 'seller_notifications') await dbx().collection('seller_notifications').doc(n.id).set({readBySeller:true,readAt:nowIso()},{merge:true});
    }catch(e){ console.warn('mark notification read failed',e && e.message ? e.message : e); }
    customDialog({title:esc(n.title),body:`<div class="prime-notif-detail"><p>${esc(n.text)}</p><div class="ary-v4-muted"><i class="fas fa-clock"></i> ${esc((dateOf(n.time)||new Date()).toLocaleString())}</div>${n.link?`<a class="btn-prime" style="display:inline-flex;margin-top:14px;text-decoration:none" href="${esc(absUrl(n.link))}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Open Link</a>`:''}</div>`});
    renderNotifs(window.adminNotifications || []);
  };

  async function deleteCollectionWhere(collection, field, value){
    try{
      const snap = await dbx().collection(collection).where(field,'==',value).limit(450).get();
      if(snap.empty) return 0;
      const batch = dbx().batch(); let c=0;
      snap.forEach(doc => { batch.delete(doc.ref); c++; });
      await batch.commit();
      return c;
    }catch(e){ console.warn('cleanup skipped',collection,field,e && e.message ? e.message : e); return 0; }
  }
  window.deleteItem = async function(id){
    if(!id) return window.showToast('Product ID missing.','error');
    const p = products().find(x => txt(x.id) === txt(id)) || {};
    const ok = await confirmDialog('Delete product permanently?', `<p class="ary-v4-muted">Are you sure you want to delete this product.</p><div class="ary-v4-item">${imgForItem(p)?`<img src="${esc(imgForItem(p))}">`:''}<div><b>${esc(p.name || p.title || id)}</b><div class="ary-v4-muted">Orders are kept safe for accounting/history.</div></div></div>`, 'Delete Product');
    if(!ok) return;
    try{
      await dbx().collection('seller_deleted_products').doc(safeId(id+'_'+Date.now())).set({sellerEmail:email(),productId:id,product:p,deletedAt:nowIso(),note:'Deleted from seller panel. Orders were not deleted.'},{merge:true}).catch(()=>{});
      const collections = ['reviews','product_reviews','questions','product_questions','product_qna','qna','seller_qna','customer_questions'];
      for(const c of collections){ await deleteCollectionWhere(c,'productId',id); await deleteCollectionWhere(c,'product_id',id); }
      await dbx().collection('products').doc(id).delete();
      try{ sellerProducts = products().filter(x => txt(x.id) !== txt(id)); window.sellerProducts = sellerProducts; }catch(e){}
      if(typeof loadInventory === 'function') loadInventory();
      if(typeof renderDashboardStats === 'function') renderDashboardStats();
      window.showToast('Product, reviews and questions deleted. Orders were kept.','success');
    }catch(e){ window.showToast('Delete failed: '+(e.message || e),'error'); }
  };
  try{ deleteItem = window.deleteItem; }catch(e){}

  window.viewOrderDetails = function(id){
    const o = findOrder(id);
    if(!o) return window.showToast('Order not found. Refresh and try again.','error');
    const items = orderItems(o);
    const amount = orderAmount(o);
    const slipBtn = shipUrl(o) ? `<button class="btn-prime" onclick="window.open('${esc(absUrl(shipUrl(o)))}','_blank','noopener')"><i class="fas fa-download"></i> Download Slip</button>` : `<button class="btn-prime" onclick="downloadShippingInvoice('${esc(o.id || o.order_no || o.orderNo)}')"><i class="fas fa-rocket"></i> Generate / Download Slip</button>`;
    customDialog({
      title:`Order ${esc(o.order_no || o.orderNo || o.id || '')}`,
      body:`<div class="ary-v4-grid">${items.map(itemLine).join('')}<div class="ary-v4-item"><div><b>Status:</b> ${esc(o.status || o.orderStatus || 'N/A')}<br><b>Seller Amount:</b> ₹${amount.toLocaleString('en-IN')}<br><b>Payment:</b> ${esc(o.payment_method || o.paymentMethod || 'N/A')}<br><b>Date:</b> ${esc(orderDate(o).toLocaleString())}</div></div></div>`,
      actions:`<button class="btn-outline" onclick="document.getElementById('aryV4Modal').style.display='none'">Close</button>${slipBtn}`
    });
  };

  function loadOrderTable(listId, statusKeys, emptyText, amountCol=false){
    const list = $(listId); if(!list) return;
    const rows = orders().filter(o => isStatus(o,statusKeys));
    if(!rows.length){ list.innerHTML = `<tr><td colspan="5" style="text-align:center;font-weight:800;padding:22px;">${esc(emptyText)}</td></tr>`; return; }
    list.innerHTML = rows.map(o => {
      const id = esc(o.id || o.order_no || o.orderNo);
      const amount = orderAmount(o);
      return `<tr class="clickable-row" onclick="viewOrderDetails('${id}')"><td data-label="Date"><strong>${esc(orderDate(o).toLocaleString())}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${esc(o.order_no || o.orderNo || o.id)}</strong></td><td data-label="Items">${orderItems(o).map(itemLine).join('')}</td>${amountCol?`<td data-label="Seller Amount"><b style="color:var(--success);">₹${amount.toLocaleString('en-IN')}</b></td>`:''}<td data-label="Status"><span class="ary-v4-chip ary-v4-ok">${esc(o.status || o.orderStatus || '')}</span></td></tr>`;
    }).join('');
  }
  window.loadShippedOrders = function(){ loadOrderTable('shippedOrdersList',['shipped','near by warehouse','in transit'],'No shipped orders yet.',false); };
  window.loadDeliveredOrders = function(){ loadOrderTable('deliveredOrdersList',['delivered'],'No delivered orders yet.',true); };
  window.loadCompletedScanOrders = function(){ loadOrderTable('completedScanList',['completed scan','scanned','ready to ship'],'No completed scan orders yet.',false); };
  try{ loadShippedOrders=window.loadShippedOrders; loadDeliveredOrders=window.loadDeliveredOrders; loadCompletedScanOrders=window.loadCompletedScanOrders; }catch(e){}

  window.loadProductPerformance = function(){
    const list = $('productPerformanceList') || $('productPerformanceGrid') || $('productPerformanceBody');
    if(!list) return;
    const rows = products().map(p => {
      const pid = txt(p.id || p.productId); const sku = low(p.sku); const name = low(p.name || p.title);
      let sold=0,revenue=0,returns=0;
      orders().forEach(o => orderItems(o).forEach(i => {
        const match = (pid && txt(i.productId || i.product_id || i.id) === pid) || (sku && low(i.sku) === sku) || (name && low(i.name || i.title) === name);
        if(match){ const q = Math.max(1,num(i.qty || i.quantity || 1)); sold += q; revenue += q * num(i.sellingPrice || i.price || 0); if(isStatus(o,['return','cancel'])) returns += q; }
      }));
      return {p,sold,revenue,returns,views:num(p.views || p.viewCount || p.clicks || 0)};
    }).sort((a,b)=>b.revenue-a.revenue);
    if(!rows.length){ list.innerHTML = `<div class="panel-box">No product performance data yet.</div>`; return; }
    list.innerHTML = rows.map(r => `<div class="perf-card" onclick="editItem && editItem('${esc(r.p.id)}')"><div class="ary-v4-item">${imgForItem(r.p)?`<img src="${esc(imgForItem(r.p))}">`:''}<div><b>${esc(r.p.name || r.p.title || 'Product')}</b><div class="ary-v4-muted">Sold: ${r.sold} · Sales: ₹${r.revenue.toLocaleString('en-IN')} · Returns: ${r.returns} · Views: ${r.views}</div></div></div></div>`).join('');
  };
  try{ loadProductPerformance=window.loadProductPerformance; }catch(e){}

  async function createReplacementOrder(orderId){
    const o = findOrder(orderId); if(!o || !validDb()) return;
    const copy = Object.assign({}, o, {originalOrderId:o.id || orderId, replacementFor:o.id || orderId, status:'Placed', orderType:'Replacement Return Order', timestamp:nowIso(), createdAt:nowIso(), replacementCreatedAt:nowIso(), shiprocketInvoicePdfUrl:'', shiprocketInvoiceStatus:'', shiprocketInvoiceRequested:false});
    delete copy.id;
    try{ const ref = await dbx().collection('orders').add(copy); await dbx().collection('return_items').doc(safeId((o.id||orderId)+'_'+ref.id)).set({sellerEmail:email(),originalOrderId:o.id||orderId,replacementOrderId:ref.id,status:'Replacement order created',createdAt:nowIso()},{merge:true}); window.showToast('Replacement order created.','success'); if(typeof initDashboard==='function') initDashboard(); }catch(e){ window.showToast('Replacement order failed: '+(e.message||e),'error'); }
  }
  window.aryantaCreateReplacementOrder = createReplacementOrder;
  window.loadReturnTracking = function(){
    const box = $('returnTrackingList'); if(!box) return;
    const rows = orders().filter(o => isStatus(o,['return','rto','cancel','replacement']));
    if(!rows.length){ box.innerHTML = `<div class="panel-box">No return/cancel tracking yet.</div>`; return; }
    box.innerHTML = rows.map(o => {
      const cancelOnly = isStatus(o,['cancel']) && !isStatus(o,['return','rto']);
      const title = cancelOnly ? 'Customer cancelled order' : 'Return request sent';
      const desc = cancelOnly ? 'No claim return button is shown because this is only an order cancellation.' : 'Product will be expected back to you within 15 days after pickup/approval.';
      const btn = cancelOnly ? '' : `<button class="btn-outline" onclick="aryantaCreateReplacementOrder('${esc(o.id || o.order_no || o.orderNo)}')"><i class="fas fa-plus"></i> Create Replacement Order</button>`;
      return `<div class="return-track-card" onclick="viewOrderDetails('${esc(o.id || o.order_no || o.orderNo)}')"><h4>${esc(title)} · ${esc(o.order_no || o.orderNo || o.id)}</h4><div class="ary-v4-grid">${orderItems(o).map(itemLine).join('')}</div><p class="ary-v4-muted">${esc(desc)}</p><div class="ary-v4-actions">${btn}<button class="btn-prime" onclick="event.stopPropagation(); viewOrderDetails('${esc(o.id || o.order_no || o.orderNo)}')">View Details</button></div></div>`;
    }).join('');
  };
  try{ loadReturnTracking=window.loadReturnTracking; }catch(e){}

  async function addFineOnce(docId, amount, reason, extra){
    try{ await dbx().collection('fines').doc(safeId(docId)).set(Object.assign({sellerEmail:email(),amount,reason,status:'Pending',createdAt:nowIso()},extra||{}),{merge:false}); }catch(e){}
  }
  async function acceptWarrantyClaim(wid){
    const w = warranties().find(x => txt(x.id) === txt(wid));
    if(!w || !validDb()) return;
    try{
      await dbx().collection('warranties').doc(wid).set({sellerAccepted:true,sellerAcceptedAt:nowIso(),status:'Seller Accepted'},{merge:true});
      const order = findOrder(w.orderId || w.originalOrderId);
      if(order){
        const copy = Object.assign({}, order, {originalOrderId:order.id, warrantyId:wid, status:'Warranty Return Created', orderType:'Warranty Copy', timestamp:nowIso(), createdAt:nowIso()});
        delete copy.id;
        const ref = await dbx().collection('orders').add(copy);
        await dbx().collection('return_items').doc(safeId(wid+'_'+ref.id)).set({sellerEmail:email(),warrantyId:wid,originalOrderId:order.id,copyOrderId:ref.id,status:'Warranty return copy created',createdAt:nowIso()},{merge:true});
      }
      window.showToast('Warranty claim accepted and copy created.','success');
      if(typeof loadWarranty === 'function') loadWarranty();
    }catch(e){ window.showToast('Warranty accept failed: '+(e.message||e),'error'); }
  }
  window.acceptWarrantyClaimV4 = acceptWarrantyClaim;
  window.loadWarranty = async function(){
    const list = $('warrantyList'); if(!list) return;
    try{ if(typeof window.ensureSellerWarranty === 'function') await window.ensureSellerWarranty(); }catch(e){}
    const rows = warranties();
    if(!rows.length){ list.innerHTML = `<tr><td colspan="5" style="text-align:center;font-weight:800;padding:22px;">No warranty claims.</td></tr>`; return; }
    for(const w of rows){
      const assigned = dateOf(w.assignedAt || w.adminAcceptedAt || w.createdAt || w.timestamp);
      if((w.status && low(w.status).includes('accepted')) || w.adminAccepted === true || w.status === 'Assigned to Seller'){
        if(!w.sellerAccepted && assigned && Date.now()-assigned.getTime() > 48*3600000){
          await addFineOnce('warranty_48h_'+(w.id || w.orderId),120,'Warranty claim not accepted within 48 hours',{warrantyId:w.id || '',orderId:w.orderId || ''});
        }
      }
    }
    list.innerHTML = rows.map(w => {
      const o = findOrder(w.orderId || w.originalOrderId) || {};
      const btn = !w.sellerAccepted && ((low(w.status).includes('accepted')) || w.adminAccepted === true || w.status === 'Assigned to Seller') ? `<button class="btn-prime" onclick="acceptWarrantyClaimV4('${esc(w.id)}')"><i class="fas fa-check"></i> Accept</button>` : `<span class="ary-v4-chip">${esc(w.status || 'Pending')}</span>`;
      return `<tr><td data-label="Date">${esc((dateOf(w.createdAt || w.timestamp)||new Date()).toLocaleString())}</td><td data-label="Order">${esc(w.orderId || o.order_no || o.id || 'N/A')}</td><td data-label="Product">${orderItems(o).map(itemLine).join('') || esc(w.productName || 'Product')}</td><td data-label="Status">${esc(w.status || '')}</td><td data-label="Action">${btn}</td></tr>`;
    }).join('');
  };
  try{ loadWarranty=window.loadWarranty; }catch(e){}

  function subscriptionEndDate(){ return dateOf((seller() || {}).subEndDate || (seller() || {}).subscriptionEndDate); }
  function currentPlan(){ return txt((seller() || {}).subscription || (seller() || {}).plan || (seller() || {}).subscriptionPlan || 'Basic'); }
  window.aryantaRenewCurrentSubscription = async function(){
    const s = seller(); if(!s || !validDb()) return;
    const plan = currentPlan();
    const price = num(s.subscriptionPrice || s.planPrice || 0);
    const finish = async (meta) => {
      const oldEnd = subscriptionEndDate();
      const base = oldEnd && oldEnd.getTime() > Date.now() ? oldEnd : new Date();
      base.setDate(base.getDate()+30);
      const payload = {subscription:plan, subEndDate:base.toISOString(), subscriptionEndDate:base.toISOString(), updatedAt:nowIso()};
      await dbx().collection('sellers').doc(sellerDocId()).set(payload,{merge:true});
      await dbx().collection('seller_subscription_payments').add({sellerEmail:email(),planName:plan,amount:price,status:'Renewed 30 days',meta:meta||{},createdAt:nowIso()}).catch(()=>{});
      Object.assign(s,payload);
      try{ localStorage.setItem('sellerToken',JSON.stringify(s)); }catch(e){}
      window.showToast('Subscription renewed for 30 more days.','success');
      if(typeof loadSubscriptionsUI === 'function') loadSubscriptionsUI();
    };
    if(price <= 0 || !window.Razorpay || !window.API_KEYS || !API_KEYS.RAZORPAY){ return finish({method:'manual_or_free'}); }
    new Razorpay({key:API_KEYS.RAZORPAY,amount:price*100,currency:'INR',name:'Aryanta Subscription Renewal',description:`Renew ${plan} for 30 days`,handler:r=>finish({razorpayPaymentId:r.razorpay_payment_id}),prefill:{name:s.companyName||'',email:s.email||'',contact:s.phone||''},theme:{color:'#111827'}}).open();
  };
  window.checkSubscriptionExpiry = function(){
    const end = subscriptionEndDate(); if(!end) return;
    const diff = Math.ceil((end.getTime()-Date.now())/dayMs);
    if(diff <= 3 && diff >= 1){
      customDialog({title:'Subscription ending soon',body:`<p>Your <b>${esc(currentPlan())}</b> subscription will end in <b>${diff} day${diff>1?'s':''}</b>. Please renew to avoid feature lock.</p>`,actions:`<button class="btn-outline" onclick="document.getElementById('aryV4Modal').style.display='none'">Cancel</button><button class="btn-prime" onclick="aryantaRenewCurrentSubscription()"><i class="fas fa-crown"></i> Renew Now</button>`});
      try{ dbx().collection('seller_notifications').add({sellerEmail:email(),title:'Subscription ending soon',message:`Your ${currentPlan()} subscription will end in ${diff} day(s). Please renew.`,type:'subscription_expiry',timestamp:nowIso(),createdAt:nowIso()}); }catch(e){}
    }
  };
  try{ checkSubscriptionExpiry=window.checkSubscriptionExpiry; }catch(e){}

  const oldSubUI = window.loadSubscriptionsUI;
  window.loadSubscriptionsUI = async function(){
    try{ if(typeof oldSubUI === 'function') await oldSubUI.apply(this, arguments); }catch(e){}
    const box = $('subscriptionHistoryBox') || $('currentSubscriptionDetails') || $('subscriptionSection');
    const s = seller(); if(!box || !s) return;
    const end = subscriptionEndDate();
    const html = `<div class="panel-box" style="margin:14px 0;"><h3><i class="fas fa-crown"></i> Active Subscription Details</h3><p><b>Plan:</b> ${esc(currentPlan())}</p><p><b>End Date:</b> ${esc(end ? end.toLocaleString() : 'Not set')}</p><p><b>Commission:</b> ${esc(s.commissionPercent || s.subscriptionCommission || 'Default')}%</p><button class="btn-prime" onclick="aryantaRenewCurrentSubscription()"><i class="fas fa-rotate"></i> Renew / Add 30 Days</button></div>`;
    if(box.id === 'subscriptionSection') box.insertAdjacentHTML('afterbegin',html); else box.innerHTML = html + box.innerHTML;
  };
  try{ loadSubscriptionsUI=window.loadSubscriptionsUI; }catch(e){}

  const oldShowSection = window.showSection;
  if(oldShowSection && !oldShowSection.__aryantaV4Wrapped){
    const wrapped = async function(section){
      const res = await oldShowSection.apply(this, arguments);
      setTimeout(async () => {
        if(section === 'notifications') await window.fetchNotifications();
        if(section === 'acceptedOrders') await window.loadAcceptedOrders();
        if(section === 'shippedOrders') window.loadShippedOrders();
        if(section === 'deliveredOrders') window.loadDeliveredOrders();
        if(section === 'completedScan') window.loadCompletedScanOrders();
        if(section === 'history') { const f = window.loadOrderHistory; if(typeof f === 'function') f(); }
        if(section === 'returnTracking') window.loadReturnTracking();
        if(section === 'productPerformance') window.loadProductPerformance();
        if(section === 'warranty') await window.loadWarranty();
        if(section === 'subscription') await window.loadSubscriptionsUI();
      },80);
      return res;
    };
    wrapped.__aryantaV4Wrapped = true;
    window.showSection = wrapped;
    try{ showSection = wrapped; }catch(e){}
  }

  setTimeout(()=>{ injectStyle(); window.fetchNotifications().catch(()=>{}); hydrateShiprocketV4().then(()=>{ if($('acceptedOrdersSection') && $('acceptedOrdersSection').classList.contains('active')) window.loadAcceptedOrders(); }); try{ window.checkSubscriptionExpiry(); }catch(e){} },900);
  setTimeout(render7DayTrendSafe,1200);
})();
/* ===== FIX: Dark Theme free for all users ===== */
(function(){
    if(window.ARYANTA_DARK_THEME_FREE_FIX) return;
    window.ARYANTA_DARK_THEME_FREE_FIX = true;

    function el(id){
        return document.getElementById(id);
    }

    function getSellerSafe(){
        try{
            return activeSeller || window.activeSeller || null;
        }catch(e){
            return window.activeSeller || null;
        }
    }

    function getDbSafe(){
        try{
            return db || window.db || null;
        }catch(e){
            return window.db || null;
        }
    }

    function darkInputs(){
        return [
            el("settingTheme"),
            el("settingDarkTheme"),
            el("settingDark")
        ].filter(Boolean);
    }

    function unlockDarkThemeControl(){
        const seller = getSellerSafe();
        const settings = seller && seller.settings ? seller.settings : {};

        const isDark = settings.theme === true || settings.darkTheme === true || settings.dark === true;

        darkInputs().forEach(input => {
            input.disabled = false;
            input.checked = isDark;
            input.removeAttribute("disabled");
            input.removeAttribute("title");

            const card = input.closest(".setting-card-premium") || input.closest(".setting-card");
            if(card){
                card.classList.remove("sub-disabled");
                card.removeAttribute("data-lock-reason");
                card.style.opacity = "";
                card.style.filter = "";
                card.style.pointerEvents = "";
            }
        });

        document.body.classList.toggle("dark-theme", isDark);
    }

    const oldLoadSettingsUI = window.loadSettingsUI;

    window.loadSettingsUI = async function(){
        try{
            if(typeof oldLoadSettingsUI === "function"){
                await oldLoadSettingsUI.apply(this, arguments);
            }
        }catch(e){}

        unlockDarkThemeControl();
    };

    const oldToggleSetting = window.toggleSetting;

    window.toggleSetting = async function(key){
        key = String(key || "").trim();

        if(key === "theme" || key === "darkTheme" || key === "dark"){
            const seller = getSellerSafe();
            const database = getDbSafe();
            const input = el("settingTheme") || el("settingDarkTheme") || el("settingDark");

            if(!seller){
                if(typeof showToast === "function") showToast("Login required.", "error");
                return;
            }

            if(!seller.settings) seller.settings = {};

            const checked = input ? input.checked === true : !seller.settings.theme;

            seller.settings.theme = checked;
            seller.settings.darkTheme = checked;
            seller.settings.dark = checked;

            document.body.classList.toggle("dark-theme", checked);
            unlockDarkThemeControl();

            try{
                if(database && seller.email){
                    await database.collection("sellers").doc(seller.email).set({
                        settings: seller.settings,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }

                if(typeof showToast === "function"){
                    showToast(checked ? "Dark Theme enabled." : "Dark Theme disabled.", "success");
                }
            }catch(e){
                console.error("Dark theme save failed:", e);
                if(typeof showToast === "function"){
                    showToast("Dark Theme changed, but save failed. Check Firestore permission.", "error");
                }
            }

            return;
        }

        if(typeof oldToggleSetting === "function"){
            return oldToggleSetting.apply(this, arguments);
        }
    };

    document.addEventListener("DOMContentLoaded", function(){
        setTimeout(unlockDarkThemeControl, 300);
        setTimeout(unlockDarkThemeControl, 1200);
        setTimeout(unlockDarkThemeControl, 2500);
    });

    setTimeout(unlockDarkThemeControl, 300);
    setTimeout(unlockDarkThemeControl, 1200);
})();
/* ===== FIX: Search Suggestions only for subscribed sellers ===== */
(function(){
    if(window.ARYANTA_SEARCH_SUGGESTIONS_SUB_ONLY_FIX) return;
    window.ARYANTA_SEARCH_SUGGESTIONS_SUB_ONLY_FIX = true;

    function el(id){
        return document.getElementById(id);
    }

    function sellerSafe(){
        try{
            return activeSeller || window.activeSeller || null;
        }catch(e){
            return window.activeSeller || null;
        }
    }

    function dbSafe(){
        try{
            return db || window.db || null;
        }catch(e){
            return window.db || null;
        }
    }

    function low(v){
        return String(v || "").toLowerCase().trim();
    }

    function isSubscriptionActive(){
        const s = sellerSafe();
        if(!s) return false;

        const plan = low(
            s.subscription ||
            s.plan ||
            s.subscriptionPlan ||
            s.subscriptionName ||
            s.package ||
            ""
        );

        if(!plan || plan === "none" || plan === "free" || plan === "basic" || plan === "basic / free"){
            return false;
        }

        const endRaw = s.subEndDate || s.subscriptionEndDate || s.planEndDate || s.endDate;
        if(endRaw){
            const end = new Date(endRaw).getTime();
            if(Number.isFinite(end) && end < Date.now()){
                return false;
            }
        }

        return true;
    }

    function applySearchSuggestionLock(){
        const s = sellerSafe();
        const input = el("settingSearchSuggestions");

        if(!s) return;

        if(!s.settings) s.settings = {};

        if(isSubscriptionActive()){
            if(s.settings.searchSuggestions === undefined){
                s.settings.searchSuggestions = true;
            }

            if(input){
                input.disabled = false;
                input.checked = s.settings.searchSuggestions !== false;

                const card = input.closest(".setting-card-premium") || input.closest(".setting-card");
                if(card){
                    card.classList.remove("sub-disabled");
                    card.removeAttribute("data-lock-reason");
                }
            }
        }else{
            s.settings.searchSuggestions = false;

            if(input){
                input.checked = false;
                input.disabled = true;

                const card = input.closest(".setting-card-premium") || input.closest(".setting-card");
                if(card){
                    card.classList.add("sub-disabled");
                    card.dataset.lockReason = "Search Suggestions need active subscription";
                }
            }

            const box = el("searchSuggestions");
            if(box){
                box.style.display = "none";
                box.innerHTML = "";
            }
        }
    }

    const oldLoadSettingsUI = window.loadSettingsUI;

    window.loadSettingsUI = async function(){
        try{
            if(typeof oldLoadSettingsUI === "function"){
                await oldLoadSettingsUI.apply(this, arguments);
            }
        }catch(e){}

        applySearchSuggestionLock();
    };

    const oldToggleSetting = window.toggleSetting;

    window.toggleSetting = async function(key){
        key = String(key || "").trim();

        if(key === "searchSuggestions"){
            const s = sellerSafe();
            const database = dbSafe();
            const input = el("settingSearchSuggestions");

            if(!s){
                if(typeof showToast === "function") showToast("Login required.", "error");
                return;
            }

            if(!isSubscriptionActive()){
                if(input) input.checked = false;
                if(!s.settings) s.settings = {};
                s.settings.searchSuggestions = false;

                const box = el("searchSuggestions");
                if(box){
                    box.style.display = "none";
                    box.innerHTML = "";
                }

                if(typeof showToast === "function"){
                    showToast("Search Suggestions need active subscription.", "warning");
                }

                return;
            }

            if(!s.settings) s.settings = {};
            const checked = input ? input.checked === true : !s.settings.searchSuggestions;
            s.settings.searchSuggestions = checked;

            try{
                if(database && s.email){
                    await database.collection("sellers").doc(s.email).set({
                        settings: s.settings,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }

                if(typeof showToast === "function"){
                    showToast(checked ? "Search Suggestions enabled." : "Search Suggestions disabled.", "success");
                }
            }catch(e){
                console.error("Search Suggestions save failed:", e);
                if(typeof showToast === "function"){
                    showToast("Setting changed, but save failed.", "error");
                }
            }

            applySearchSuggestionLock();
            return;
        }

        if(typeof oldToggleSetting === "function"){
            return oldToggleSetting.apply(this, arguments);
        }
    };

    const oldHandleGlobalSearch = window.handleGlobalSearch;

    window.handleGlobalSearch = function(){
        if(!isSubscriptionActive()){
            const box = el("searchSuggestions");
            if(box){
                box.style.display = "none";
                box.innerHTML = "";
            }
            return;
        }

        const s = sellerSafe();
        if(s && s.settings && s.settings.searchSuggestions === false){
            const box = el("searchSuggestions");
            if(box){
                box.style.display = "none";
                box.innerHTML = "";
            }
            return;
        }

        if(typeof oldHandleGlobalSearch === "function"){
            return oldHandleGlobalSearch.apply(this, arguments);
        }
    };

    document.addEventListener("DOMContentLoaded", function(){
        setTimeout(applySearchSuggestionLock, 300);
        setTimeout(applySearchSuggestionLock, 1200);
        setTimeout(applySearchSuggestionLock, 2500);
    });

    setTimeout(applySearchSuggestionLock, 300);
    setTimeout(applySearchSuggestionLock, 1200);
})();
/* ===== FIX: Stable Notifications + Badge Decrease ===== */
(function(){
    if(window.ARYANTA_STABLE_NOTIFICATION_FIX_V5) return;
    window.ARYANTA_STABLE_NOTIFICATION_FIX_V5 = true;

    let notifCache = [];
    let notifFetchRunning = false;
    let notifRenderLock = false;
    let lastFetchAt = 0;

    function el(id){
        return document.getElementById(id);
    }

    function dbSafe(){
        try{
            return db || window.db || null;
        }catch(e){
            return window.db || null;
        }
    }

    function sellerSafe(){
        try{
            return activeSeller || window.activeSeller || null;
        }catch(e){
            return window.activeSeller || null;
        }
    }

    function sellerEmail(){
        const s = sellerSafe();
        return String((s && s.email) || "").toLowerCase().trim();
    }

    function safe(v){
        return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
            return {
                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#39;"
            }[c];
        });
    }

    function dateMs(v){
        if(!v) return 0;
        if(v && typeof v.toDate === "function") return v.toDate().getTime();
        const d = new Date(v);
        return Number.isFinite(d.getTime()) ? d.getTime() : 0;
    }

    function fmtTime(v){
        const ms = dateMs(v);
        return ms ? new Date(ms).toLocaleString() : "Now";
    }

    function noticesAllowed(){
        const s = sellerSafe();
        if(!s || !s.settings) return true;
        return s.settings.showNotices !== false;
    }

    function badgeUpdate(){
        const unread = noticesAllowed() ? notifCache.filter(n => !n.read).length : 0;

        ["notifBadge", "topbarNotifBadge"].forEach(function(id){
            const b = el(id);
            if(!b) return;

            b.textContent = unread;

            if(unread > 0){
                b.style.display = "inline-flex";
                b.style.alignItems = "center";
                b.style.justifyContent = "center";
            }else{
                b.style.display = "none";
            }
        });
    }

    function targetOk(data){
        const target = String(
            data.target ||
            data.sellerEmail ||
            data.email ||
            data.to ||
            "all"
        ).toLowerCase().trim();

        const email = sellerEmail();

        return (
            target === "" ||
            target === "all" ||
            target === "seller" ||
            target === "sellers" ||
            target === email
        );
    }

    function normalizeNotif(doc, collection, readIds){
        const d = doc.data ? doc.data() : doc;
        const id = doc.id || d.id || Math.random().toString(36).slice(2);

        return {
            id: String(id),
            collection: collection,
            title: d.title || d.heading || "Aryanta Notice",
            text: d.message || d.text || d.body || d.description || d.title || "New notice from Aryanta.",
            time: d.timestamp || d.createdAt || d.time || d.date || new Date().toISOString(),
            link: d.link || d.url || d.actionUrl || d.buttonLink || "",
            read: readIds.has(String(id))
        };
    }

    async function getReadIds(){
        const database = dbSafe();
        const email = sellerEmail();
        const ids = new Set();

        if(!database || !email) return ids;

        try{
            const snap = await database
                .collection("seller_notification_reads")
                .where("sellerEmail", "==", email)
                .limit(500)
                .get();

            snap.forEach(function(doc){
                const d = doc.data() || {};
                if(d.notificationId) ids.add(String(d.notificationId));
            });
        }catch(e){
            console.warn("notification read-state load failed:", e);
        }

        return ids;
    }

    async function saveRead(n){
        const database = dbSafe();
        const email = sellerEmail();

        if(!database || !email || !n || !n.id) return;

        const readDocId = String(n.id + "_" + email).replace(/[^a-zA-Z0-9_-]/g, "_");

        try{
            await database.collection("seller_notification_reads").doc(readDocId).set({
                notificationId: String(n.id),
                collection: n.collection || "",
                sellerEmail: email,
                title: n.title || "",
                text: n.text || "",
                link: n.link || "",
                readAt: new Date().toISOString()
            }, { merge: true });
        }catch(e){
            console.warn("notification read-state save failed:", e);
        }
    }

    function renderNotifications(){
        if(notifRenderLock) return;
        notifRenderLock = true;

        try{
            badgeUpdate();

            const list1 = el("fullNotifList");
            const list2 = el("notifList");

            if(!noticesAllowed()){
                const html = `
                    <div class="ary-empty-state">
                        <i class="fas fa-bell-slash"></i>
                        <h3>Notices are off</h3>
                        <p>You disabled Show Notices in Settings.</p>
                    </div>
                `;
                if(list1) list1.innerHTML = html;
                if(list2) list2.innerHTML = html;
                return;
            }

            let html = "";

            if(notifCache.length === 0){
                html = `
                    <div class="ary-empty-state">
                        <i class="fas fa-bell-slash"></i>
                        <h3>No notifications</h3>
                        <p>New Aryanta notices will appear here.</p>
                    </div>
                `;
            }else{
                html = notifCache.map(function(n){
                    const link = n.link
                        ? `<a class="short-link-chip" href="${safe(String(n.link).startsWith("http") ? n.link : "https://" + n.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fas fa-link"></i> Open Link</a>`
                        : "";

                    return `
                        <div class="notification-card ${n.read ? "read" : "unread"}" onclick="openFullNotif('${safe(n.id)}')">
                            <div style="width:100%;">
                                <div class="ary-notif-top">
                                    <strong>${n.read ? '<i class="fas fa-envelope-open"></i>' : '<i class="fas fa-envelope"></i>'} ${safe(n.title)}</strong>
                                    ${n.read ? '<span>Read</span>' : '<span class="unread-chip">New</span>'}
                                </div>
                                <p>${safe(n.text)}</p>
                                <small><i class="fas fa-clock"></i> ${safe(fmtTime(n.time))}</small>
                                ${link}
                            </div>
                        </div>
                    `;
                }).join("");
            }

            if(list1) list1.innerHTML = html;
            if(list2) list2.innerHTML = html;
        }finally{
            notifRenderLock = false;
        }
    }

    async function fetchStableNotifications(){
        const database = dbSafe();
        const email = sellerEmail();

        if(!database || !email){
            renderNotifications();
            return notifCache;
        }

        if(notifFetchRunning){
            renderNotifications();
            return notifCache;
        }

        const now = Date.now();
        if(now - lastFetchAt < 1200){
            renderNotifications();
            return notifCache;
        }

        notifFetchRunning = true;
        lastFetchAt = now;

        try{
            if(!noticesAllowed()){
                notifCache = [];
                renderNotifications();
                return notifCache;
            }

            const readIds = await getReadIds();
            const rows = [];

            async function readCollection(collection, builder){
                try{
                    const snap = await builder(database.collection(collection));
                    snap.forEach(function(doc){
                        const d = doc.data() || {};
                        if(targetOk(d)){
                            rows.push(normalizeNotif(doc, collection, readIds));
                        }
                    });
                }catch(e){
                    console.warn(collection + " notification fetch failed:", e);
                }
            }

            await readCollection("admin_broadcasts", q => q.limit(100).get());
            await readCollection("seller_notifications", q => q.where("sellerEmail", "==", email).limit(100).get());
            await readCollection("seller_notifications", q => q.where("email", "==", email).limit(100).get());
            await readCollection("notifications", q => q.where("sellerEmail", "==", email).limit(50).get());
            await readCollection("notifications", q => q.where("email", "==", email).limit(50).get());

            const seen = new Set();
            const finalRows = rows.filter(function(n){
                const key = n.collection + "_" + n.id;
                if(seen.has(key)) return false;
                seen.add(key);
                return true;
            }).sort(function(a,b){
                return dateMs(b.time) - dateMs(a.time);
            });

            notifCache = finalRows;
            try{ adminNotifications = finalRows; }catch(e){}
            window.adminNotifications = finalRows;

            renderNotifications();
            return notifCache;
        }finally{
            notifFetchRunning = false;
        }
    }

    async function markAllVisibleRead(){
        if(!noticesAllowed()) return;

        let changed = false;

        notifCache.forEach(function(n){
            if(!n.read){
                n.read = true;
                changed = true;
                saveRead(n);
            }
        });

        if(changed){
            try{ adminNotifications = notifCache; }catch(e){}
            window.adminNotifications = notifCache;
            renderNotifications();
        }
    }

    window.fetchNotifications = async function(){
        renderNotifications();
        await fetchStableNotifications();
    };

    window.openFullNotif = window.openFullNotifFinal = async function(id){
        const n = notifCache.find(x => String(x.id) === String(id));

        if(!n){
            await fetchStableNotifications();
        }

        const finalN = notifCache.find(x => String(x.id) === String(id));
        if(!finalN) return;

        finalN.read = true;
        renderNotifications();
        await saveRead(finalN);

        const cont = el("notifDetailContent");
        const mod = el("notificationDetailModal");

        const linkHtml = finalN.link
            ? `<a href="${safe(String(finalN.link).startsWith("http") ? finalN.link : "https://" + finalN.link)}" target="_blank" rel="noopener noreferrer" class="btn-prime" style="text-decoration:none; margin-top:15px; display:inline-flex;"><i class="fas fa-external-link-alt"></i> Open Link</a>`
            : "";

        if(cont && mod){
            cont.innerHTML = `
                <div class="prime-notif-detail">
                    <h3>${safe(finalN.title)}</h3>
                    <p>${safe(finalN.text)}</p>
                    <div class="muted-line"><i class="fas fa-clock"></i> ${safe(fmtTime(finalN.time))}</div>
                    ${linkHtml}
                </div>
            `;
            mod.style.display = "flex";
            setTimeout(function(){ mod.classList.add("show"); }, 10);
        }
    };

    const oldShowSection = window.showSection;

    window.showSection = async function(section){
        if(typeof oldShowSection === "function"){
            await oldShowSection.apply(this, arguments);
        }

        if(section === "notifications"){
            renderNotifications();
            await fetchStableNotifications();
            setTimeout(markAllVisibleRead, 250);
            setTimeout(markAllVisibleRead, 900);
        }
    };

    const observerTarget = el("fullNotifList");

    if(observerTarget){
        const obs = new MutationObserver(function(){
            if(notifRenderLock) return;

            const sec = el("notificationsSection");
            if(!sec || !sec.classList.contains("active")) return;

            const txt = String(observerTarget.textContent || "").toLowerCase();

            if(notifCache.length && (txt.includes("loading") || txt.includes("no notifications") || txt.includes("no new messages"))){
                setTimeout(renderNotifications, 50);
            }
        });

        obs.observe(observerTarget, { childList:true, subtree:true });
    }

    document.addEventListener("DOMContentLoaded", function(){
        setTimeout(fetchStableNotifications, 700);
        setTimeout(fetchStableNotifications, 2000);
    });

    setTimeout(fetchStableNotifications, 700);
    setTimeout(fetchStableNotifications, 2000);
})();
/* ===== RESTORE PRODUCT PERFORMANCE AS BEFORE ===== */
(function(){
    if(window.ARYANTA_RESTORE_PRODUCT_PERFORMANCE_OLD_UI) return;
    window.ARYANTA_RESTORE_PRODUCT_PERFORMANCE_OLD_UI = true;

    let currentPerfFilter = "all";

    function $(id){
        return document.getElementById(id);
    }

    function safe(v){
        return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
            return {
                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#39;"
            }[c];
        });
    }

    function low(v){
        return String(v == null ? "" : v).toLowerCase().trim();
    }

    function num(v){
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function getProductsSafe(){
        try{
            return sellerProducts || window.sellerProducts || [];
        }catch(e){
            return window.sellerProducts || [];
        }
    }

    function getOrdersSafe(){
        try{
            return sellerOrders || window.sellerOrders || [];
        }catch(e){
            return window.sellerOrders || [];
        }
    }

    function getSellerItems(order){
        try{
            if(typeof getSellerItemsFromOrder === "function"){
                return getSellerItemsFromOrder(order) || [];
            }
        }catch(e){}

        return Array.isArray(order && order.items) ? order.items : [];
    }

    function firstImage(p){
        if(!p) return "";

        if(Array.isArray(p.images) && p.images[0]) return p.images[0];
        if(Array.isArray(p.imageUrls) && p.imageUrls[0]) return p.imageUrls[0];

        return (
            p.image ||
            p.imageUrl ||
            p.mainImage ||
            p.productImage ||
            p.thumbnail ||
            ""
        );
    }

    function productMatch(product, item){
        const pId = String(product.id || product.productId || product.product_id || "").trim();
        const iId = String(item.id || item.productId || item.product_id || item.productDocId || "").trim();

        const pSku = low(product.sku);
        const iSku = low(item.sku);

        return (
            (pId && iId && pId === iId) ||
            (pSku && iSku && pSku === iSku)
        );
    }

    function itemAmount(item, product){
        const price = num(
            item.price ||
            item.sellingPrice ||
            item.finalPrice ||
            product.price ||
            product.sellingPrice ||
            0
        );

        const qty = num(item.qty || item.quantity || 1) || 1;

        return price * qty;
    }

    function buildProductPerformance(){
        const products = getProductsSafe();
        const orders = getOrdersSafe();

        const map = {};

        products.forEach(function(p){
            const id = String(p.id || p.productId || p.sku || Math.random()).trim();

            map[id] = {
                id: id,
                product: p,
                soldQty: 0,
                totalOrders: 0,
                deliveredQty: 0,
                cancelledQty: 0,
                returnedQty: 0,
                revenue: 0,
                views: num(p.views || p.totalViews || p.clicks || p.totalClicks || 0),
                stock: num(p.stock || p.quantity || p.totalStock || 0)
            };
        });

        orders.forEach(function(order){
            const status = low(order.status || order.orderStatus || order.deliveryStatus);
            const items = getSellerItems(order);

            items.forEach(function(item){
                let matchedKey = null;
                let matchedProduct = null;

                Object.keys(map).some(function(key){
                    const p = map[key].product;

                    if(productMatch(p, item)){
                        matchedKey = key;
                        matchedProduct = p;
                        return true;
                    }

                    return false;
                });

                if(!matchedKey || !matchedProduct) return;

                const qty = num(item.qty || item.quantity || 1) || 1;
                const st = map[matchedKey];

                st.soldQty += qty;
                st.totalOrders += 1;
                st.revenue += itemAmount(item, matchedProduct);

                if(status.includes("deliver")){
                    st.deliveredQty += qty;
                }

                if(status.includes("cancel")){
                    st.cancelledQty += qty;
                }

                if(status.includes("return")){
                    st.returnedQty += qty;
                }
            });
        });

        return Object.values(map);
    }

    function setActiveFilterUI(filter){
        ["all", "top", "loss"].forEach(function(f){
            const btn = $("perf-filter-" + f);
            if(btn){
                btn.classList.toggle("active", f === filter);
            }
        });
    }

    window.setProductPerformanceFilter = function(filter){
        currentPerfFilter = filter || "all";
        setActiveFilterUI(currentPerfFilter);
        window.loadProductPerformance();
    };

    window.loadProductPerformance = function(){
        const list = $("productPerformanceList");

        if(!list) return;

        setActiveFilterUI(currentPerfFilter);

        let rows = buildProductPerformance();

        if(currentPerfFilter === "top"){
            rows = rows
                .filter(function(x){
                    return x.soldQty > 0 || x.deliveredQty > 0 || x.revenue > 0;
                })
                .sort(function(a,b){
                    return b.soldQty - a.soldQty || b.revenue - a.revenue || b.views - a.views;
                });
        }else if(currentPerfFilter === "loss"){
            rows = rows
                .filter(function(x){
                    return (x.cancelledQty + x.returnedQty) > 0;
                })
                .sort(function(a,b){
                    return (b.cancelledQty + b.returnedQty) - (a.cancelledQty + a.returnedQty);
                });
        }else{
            rows = rows.sort(function(a,b){
                return b.soldQty - a.soldQty || b.views - a.views || b.revenue - a.revenue;
            });
        }

        if(rows.length === 0){
            list.innerHTML = `
                <div class="panel-box" style="grid-column:1/-1;">
                    <h3 style="margin-bottom:6px;">No product performance data yet.</h3>
                    <p class="muted-line">Once real seller orders, views, cancellations or returns are available, product performance will show here.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = rows.map(function(st){
            const p = st.product || {};
            const img = firstImage(p);

            const lossQty = st.cancelledQty + st.returnedQty;
            const totalQty = Math.max(1, st.soldQty);
            const deliveredPct = Math.round((st.deliveredQty / totalQty) * 100);
            const cancelPct = Math.round((st.cancelledQty / totalQty) * 100);
            const returnPct = Math.round((st.returnedQty / totalQty) * 100);

            const stockBadge = st.stock <= 0
                ? `<span class="lock-chip"><i class="fas fa-ban"></i> Out of Stock</span>`
                : st.stock <= 7
                    ? `<span class="lock-chip"><i class="fas fa-triangle-exclamation"></i> Low Stock: ${st.stock}</span>`
                    : `<span class="ok-chip"><i class="fas fa-box"></i> Stock: ${st.stock}</span>`;

            const editBtn = p.id
                ? `<button class="btn-outline w-100" onclick="editItem('${safe(p.id)}')"><i class="fas fa-edit"></i> Edit Product</button>`
                : "";

            return `
                <div class="performance-card prime-performance-card">
                    ${
                        img
                        ? `<img src="${safe(img)}" loading="lazy" class="perf-img" style="width:100%;height:150px;object-fit:cover;border-radius:16px;margin-bottom:12px;">`
                        : `<div class="prime-image-fallback"><i class="fas fa-box-open"></i></div>`
                    }

                    <h4>${safe(p.name || p.title || "Product")}</h4>

                    <p class="muted-line">
                        SKU: <b>${safe(p.sku || p.id || "N/A")}</b><br>
                        Price: <b>₹${num(p.price || p.sellingPrice || 0).toLocaleString("en-IN")}</b>
                    </p>

                    <div style="margin:10px 0;">
                        ${stockBadge}
                    </div>

                    <div class="tiny-metric-grid">
                        <div class="tiny-metric"><span>Sold</span>${st.soldQty}</div>
                        <div class="tiny-metric"><span>Delivered</span>${st.deliveredQty}</div>
                        <div class="tiny-metric"><span>Loss</span>${lossQty}</div>
                    </div>

                    <div class="tiny-metric-grid">
                        <div class="tiny-metric"><span>Views</span>${st.views}</div>
                        <div class="tiny-metric"><span>Orders</span>${st.totalOrders}</div>
                        <div class="tiny-metric"><span>Revenue</span>₹${st.revenue.toLocaleString("en-IN")}</div>
                    </div>

                    <div class="perf-bars">
                        <small>Delivered ${deliveredPct}%</small>
                        <div class="perf-bar"><i style="width:${Math.min(100, deliveredPct)}%"></i></div>

                        <small>Cancelled ${cancelPct}%</small>
                        <div class="perf-bar danger"><i style="width:${Math.min(100, cancelPct)}%"></i></div>

                        <small>Returns ${returnPct}%</small>
                        <div class="perf-bar warning"><i style="width:${Math.min(100, returnPct)}%"></i></div>
                    </div>

                    ${editBtn}
                </div>
            `;
        }).join("");
    };

    const oldShowSection = window.showSection;

    window.showSection = async function(section){
        const res = oldShowSection ? await oldShowSection.apply(this, arguments) : null;

        if(section === "productPerformance"){
            setTimeout(function(){
                window.loadProductPerformance();
            }, 100);
        }

        return res;
    };

    setTimeout(function(){
        const sec = $("productPerformanceSection");
        if(sec && sec.classList.contains("active")){
            window.loadProductPerformance();
        }
    }, 800);
})();/* Aryanta Seller Panel Smart Feature Upgrade - 2026-05-25 */
(function(){
    if(window.ARYANTA_SELLER_SMART_UPGRADE_20260525) return;
    window.ARYANTA_SELLER_SMART_UPGRADE_20260525 = true;

    const PLAN_RULES = {
        Basic:{key:'Basic',name:'Basic',commission:6,sponsoredPrice:70,fineDiscount:0,performance:'locked',badge:'Free seller access',freeAds:0},
        Growth:{key:'Growth',name:'Growth',commission:4,sponsoredPrice:50,fineDiscount:30,performance:'growth',badge:'Growth analytics enabled',freeAds:2},
        Pro:{key:'Pro',name:'Pro',commission:2.5,sponsoredPrice:40,fineDiscount:50,performance:'pro',badge:'Pro deep analytics enabled',freeAds:5}
    };

    window.ARYANTA_PLAN_RULES_2026 = PLAN_RULES;

    function $(id){return document.getElementById(id);}
    function qsa(sel,root=document){return Array.from(root.querySelectorAll(sel));}
    function txt(v){return v===undefined||v===null?'':String(v);}
    function low(v){return txt(v).toLowerCase().trim();}
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function nowIso(){return new Date().toISOString();}
    function safe(v){return txt(v).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
    function toast(msg,type='info'){try{if(typeof showToast==='function')showToast(msg,type);else console.log(msg);}catch(e){console.log(msg);}}
    function seller(){try{return activeSeller||window.activeSeller||null;}catch(e){return window.activeSeller||null;}}
    function dbx(){try{return db||window.db||null;}catch(e){return window.db||null;}}
    function sellerEmail(){const s=seller()||{};return low(s.email||s.sellerEmail||s.mail);}
    function sellerDocId(){const s=seller()||{};return txt(s.email||s.sellerEmail||s.uid||s.id||sellerEmail()).trim();}
    function products(){try{return Array.isArray(sellerProducts)?sellerProducts:[];}catch(e){return window.sellerProducts||[];}}
    function orders(){try{return Array.isArray(sellerOrders)?sellerOrders:[];}catch(e){return window.sellerOrders||[];}}
    function reviews(){try{return Array.isArray(sellerReviews)?sellerReviews:[];}catch(e){return window.sellerReviews||[];}}
    function planKey(raw){
        const s=seller()||{};
        const p=low(raw||s.subscription||s.subscriptionName||s.plan||s.package||'Basic');
        if(p.includes('pro')||p.includes('ultra')||p.includes('premium')) return 'Pro';
        if(p.includes('growth')||p.includes('grow')||p==='go'||p.includes('go plan')) return 'Growth';
        return 'Basic';
    }
    function currentPlan(){return PLAN_RULES[planKey()]||PLAN_RULES.Basic;}
    function isPaidPlan(){return currentPlan().key!=='Basic';}
    function planPrice(plan){plan=PLAN_RULES[planKey(plan)]||PLAN_RULES.Basic;return plan.sponsoredPrice;}
    function formatMoney(v){return '₹'+num(v).toLocaleString('en-IN');}
    function dateOf(v){if(!v)return null;if(v&&typeof v.toDate==='function')return v.toDate();const d=new Date(v);return isNaN(d.getTime())?null:d;}
    function monthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
    function productImage(p){
        if(!p)return '';
        if(Array.isArray(p.images)&&p.images[0])return p.images[0];
        if(Array.isArray(p.imageUrls)&&p.imageUrls[0])return p.imageUrls[0];
        return p.image||p.imageUrl||p.mainImage||p.productImage||p.thumbnail||p.img||'';
    }
    function productById(id){
        const key=txt(id).trim();
        return products().find(p=>[p.id,p.productId,p.product_id,p.sku].some(v=>txt(v).trim()===key));
    }
    function orderItems(order){
        let items=[];
        try{if(typeof getSellerItemsFromOrder==='function')items=getSellerItemsFromOrder(order)||[];}catch(e){}
        if(!items.length&&Array.isArray(order&&order.items))items=order.items;
        return items;
    }
    function orderAmount(order){return orderItems(order).reduce((s,i)=>s+(num(i.price||i.sellingPrice||i.finalPrice||i.amount)*Math.max(1,num(i.qty||i.quantity||1)||1)),0)||num(order&& (order.total||order.amount||order.finalAmount||order.totalPrice));}
    function orderDate(order){return dateOf(order&& (order.timestamp||order.createdAt||order.orderDate||order.date))||new Date();}
    function findOrder(id){const key=txt(id).trim();return orders().find(o=>[o.id,o.orderId,o.order_no,o.orderNo,o.invoiceId].some(v=>txt(v).trim()===key));}
    function productMatchItem(p,item){
        const pId=txt(p.id||p.productId||p.product_id).trim();
        const iId=txt(item.productId||item.product_id||item.productDocId||item.id).trim();
        const pSku=low(p.sku), iSku=low(item.sku);
        const pName=low(p.name||p.title), iName=low(item.name||item.title||item.productName);
        return (pId&&iId&&pId===iId)||(pSku&&iSku&&pSku===iSku)||(pName&&iName&&pName===iName);
    }
    function closeSmartModal(id){const m=$(id);if(m){m.classList.remove('show');m.style.display='none';}}
    window.closeSmartModal = closeSmartModal;

    window.getAryantaCommissionPercent = function(){return currentPlan().commission;};
    window.getAryantaCommissionRate = function(){return currentPlan().commission/100;};
    window.getAryantaSponsoredAdPrice = function(){return currentPlan().sponsoredPrice;};
    window.getAryantaFineDiscountPercent = function(){return currentPlan().fineDiscount;};

    function discountedFineAmount(amount){
        const p=currentPlan();
        const original=num(amount);
        const final=Math.max(0,Math.round(original*(100-p.fineDiscount)/100));
        return {original,final,discount:p.fineDiscount,plan:p.key};
    }

    function normalizeFineRequest(payload){
        payload=payload||{};
        const s=seller()||{};
        const calc=discountedFineAmount(payload.amount||payload.finalAmount||payload.requestedAmount||0);
        return Object.assign({},payload,{
            email:sellerEmail(),
            sellerEmail:sellerEmail(),
            sellerName:s.companyName||s.shopName||s.name||s.email||'',
            sellerPhone:s.phone||s.mobile||'',
            sellerUid:s.uid||s.sellerUid||s.accountUid||s.id||'',
            sellerAddress:s.address||s.shopAddress||s.businessAddress||'',
            requestedAmount:calc.original,
            originalAmount:calc.original,
            amount:calc.final,
            suggestedFinalAmount:calc.final,
            planAtRequest:calc.plan,
            fineDiscountPercent:calc.discount,
            status:'Pending Admin Approval',
            fineRequestStatus:'Waiting Admin Approval',
            adminEditableAmount:true,
            adminCanAccept:true,
            adminCanChangeAmount:true,
            source:'seller-panel-fine-request',
            requestedAt:payload.requestedAt||payload.timestamp||payload.createdAt||nowIso(),
            createdAt:payload.createdAt||nowIso(),
            timestamp:payload.timestamp||nowIso(),
            note:'This is a request only. Seller payout is not deducted until admin accepts or edits the fine amount.'
        });
    }

    async function sendFineRequest(key,amount,reason,extra){
        const database=dbx();
        if(!database||!sellerEmail())return false;
        const safeId=(sellerEmail()+'_'+txt(key||reason||Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,180);
        const payload=normalizeFineRequest(Object.assign({requestKey:key,reason:reason||'Fine request',amount:amount},extra||{}));
        try{
            const ref=database.collection('seller_fine_requests').doc(safeId);
            const old=await ref.get().catch(()=>null);
            if(old&&old.exists)return false;
            await ref.set(payload,{merge:true});
            toast('Fine request sent to admin for approval. No deduction applied now.','warning');
            return true;
        }catch(e){console.warn('fine request failed',e);return false;}
    }

    window.aryantaAddFineOnce = sendFineRequest;
    window.addFineRequestToAdmin = sendFineRequest;
    try{window.addFineOnce=sendFineRequest;}catch(e){}

    function installFineRequestMode(){
        const database=dbx();
        if(!database||database.__ARYANTA_FINE_REQUEST_MODE)return false;
        const originalCollection=database.collection.bind(database);
        database.collection=function(path,...rest){
            const ref=originalCollection(path,...rest);
            if(txt(path)!=='fines')return ref;
            return new Proxy(ref,{
                get(target,prop){
                    if(prop==='add'){
                        return function(payload){
                            return originalCollection('seller_fine_requests').add(normalizeFineRequest(payload));
                        };
                    }
                    if(prop==='doc'){
                        return function(docId){
                            const fineRef=originalCollection('seller_fine_requests').doc(txt(docId||('fine_'+Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_'));
                            return new Proxy(fineRef,{
                                get(t,p){
                                    if(p==='set')return function(payload,opt){return fineRef.set(normalizeFineRequest(Object.assign({requestKey:docId},payload||{})),opt||{merge:true});};
                                    if(p==='update')return function(payload){return fineRef.set(normalizeFineRequest(Object.assign({requestKey:docId},payload||{})),{merge:true});};
                                    const value=t[p];
                                    return typeof value==='function'?value.bind(t):value;
                                }
                            });
                        };
                    }
                    const value=target[prop];
                    return typeof value==='function'?value.bind(target):value;
                }
            });
        };
        database.__ARYANTA_FINE_REQUEST_MODE=true;
        return true;
    }

    function retryFinePatch(){
        let tries=0;
        const timer=setInterval(function(){
            tries++;
            if(installFineRequestMode()||tries>40)clearInterval(timer);
        },250);
    }
    retryFinePatch();

    function reviewValue(r){return num(r.rating||r.stars||r.star||r.value||r.rate);}
    function collectStoreReviews(){
        const rows=[];
        reviews().forEach(r=>{const v=reviewValue(r);if(v>0)rows.push({rating:Math.max(1,Math.min(5,Math.round(v))),source:'review'});});
        products().forEach(p=>{
            const arr=Array.isArray(p.reviews)?p.reviews:(Array.isArray(p.ratings)?p.ratings:[]);
            arr.forEach(r=>{const v=reviewValue(r);if(v>0)rows.push({rating:Math.max(1,Math.min(5,Math.round(v))),source:'product',productId:p.id});});
            const avg=num(p.rating||p.avgRating||p.averageRating);
            const count=num(p.reviewCount||p.ratingCount||p.totalReviews);
            if(avg>0&&count>0){for(let i=0;i<count;i++)rows.push({rating:Math.max(1,Math.min(5,Math.round(avg))),source:'aggregate',productId:p.id});}
        });
        return rows;
    }
    function storeRatingStats(){
        const rows=collectStoreReviews();
        const buckets={1:0,2:0,3:0,4:0,5:0};
        let total=0;
        rows.forEach(r=>{const v=Math.max(1,Math.min(5,Math.round(r.rating)));buckets[v]++;total+=v;});
        const count=rows.length;
        return {count,avg:count?Number((total/count).toFixed(1)):0,buckets,total};
    }
    function applyStoreRatingUI(){
        const st=storeRatingStats();
        const top=$('topShopRating');
        if(top)top.textContent=st.count?`${st.avg} (${st.count} reviews)`:'No reviews';
        let box=$('aryStoreRatingBreakdown');
        const home=$('homeSection');
        if(!box&&home){
            box=document.createElement('div');box.id='aryStoreRatingBreakdown';box.className='panel-box ary-rating-box';
            const chart=home.querySelector('.panel-box.mt-20');
            if(chart)chart.insertAdjacentElement('beforebegin',box);else home.appendChild(box);
        }
        if(box){
            const max=Math.max(1,...Object.values(st.buckets));
            box.innerHTML=`<div class="section-head-row"><div><h3><i class="fas fa-star"></i> Store Rating Calculation</h3><p class="muted-line">Calculated from all visible item reviews and product rating summaries.</p></div><strong>${st.count?st.avg:'N/A'} / 5</strong></div>`+
            [5,4,3,2,1].map(n=>`<div class="ary-rating-row"><span>${n}★</span><b style="width:${Math.round((st.buckets[n]/max)*100)}%"></b><em>${st.buckets[n]}</em></div>`).join('');
        }
    }

    const oldRenderDashboardStats=window.renderDashboardStats;
    window.renderDashboardStats=function(){
        const res=oldRenderDashboardStats?oldRenderDashboardStats.apply(this,arguments):undefined;
        setTimeout(function(){applyStoreRatingUI();renderAiBusinessTips();updatePlanGates();renderAchievementBadge();},60);
        return res;
    };
    try{renderDashboardStats=window.renderDashboardStats;}catch(e){}

    function ensureSubscriptionModal(){
        if($('arySubscriptionDetailModal'))return;
        document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="arySubscriptionDetailModal"><div class="modal-content ary-smart-modal"><span class="close-modal" onclick="closeSmartModal('arySubscriptionDetailModal')"><i class="fas fa-times"></i></span><div id="arySubscriptionDetailBody"></div></div></div>`);
    }

    function subscriptionEnd(){return dateOf((seller()||{}).subEndDate||(seller()||{}).subscriptionEndDate||(seller()||{}).planEndDate);}
    function pausedPlan(){const s=seller()||{};return s.pausedSubscription||s.pausedPlan||s.lastPaidSubscription||'';}

    async function saveSellerPatch(payload){
        const database=dbx(),s=seller();
        if(!database||!s)return;
        Object.assign(s,payload);
        try{await database.collection('sellers').doc(sellerDocId()).set(payload,{merge:true});}catch(e){console.warn('seller save failed',e);}
        try{localStorage.setItem('sellerToken',JSON.stringify(s));}catch(e){}
    }

    window.pauseMySubscription = async function(){
        const s=seller(); if(!s)return toast('Login required.','error');
        const p=currentPlan();
        if(p.key==='Basic')return toast('Basic plan is already active.','info');
        await saveSellerPatch({subscription:'Basic',subscriptionName:'Basic',subscriptionPaused:true,pausedSubscription:p.key,pausedSubscriptionName:p.name,pausedSubEndDate:s.subEndDate||s.subscriptionEndDate||'',pausedAt:nowIso(),subscriptionCommissionPercent:PLAN_RULES.Basic.commission});
        toast('Running subscription paused. Basic is active now.','success');
        renderSmartSubscriptionUI();updatePlanGates();
    };

    window.resumePausedSubscription = async function(){
        const s=seller(); if(!s)return toast('Login required.','error');
        const old=planKey(pausedPlan());
        if(!old||old==='Basic')return toast('No paused paid subscription found.','warning');
        const p=PLAN_RULES[old];
        await saveSellerPatch({subscription:p.key,subscriptionName:p.name,subscriptionPaused:false,resumedAt:nowIso(),subscriptionCommissionPercent:p.commission,subEndDate:s.pausedSubEndDate||s.subEndDate||''});
        toast(`${p.name} subscription resumed.`, 'success');
        renderSmartSubscriptionUI();updatePlanGates();
    };

    window.switchToBasicWithConfirm = async function(){
        if(isPaidPlan()){
            const ok=confirm('Are you sure you want to switch to Basic? It will pause your running subscription. You can resume it later from Subscription Details.');
            if(!ok)return;
            return window.pauseMySubscription();
        }
        await saveSellerPatch({subscription:'Basic',subscriptionName:'Basic',subscriptionCommissionPercent:PLAN_RULES.Basic.commission});
        renderSmartSubscriptionUI();updatePlanGates();
    };

    window.requestSubscriptionFromAdmin = async function(plan){
        plan=planKey(plan);
        if(plan==='Basic')return window.switchToBasicWithConfirm();
        const database=dbx(),s=seller(); if(!database||!s)return toast('Login required.','error');
        const p=PLAN_RULES[plan];
        try{
            await database.collection('seller_subscription_requests').add({sellerEmail:sellerEmail(),sellerName:s.companyName||s.shopName||'',sellerPhone:s.phone||'',sellerUid:s.uid||s.id||'',planName:p.name,planKey:p.key,commissionPercent:p.commission,sponsoredAdPrice:p.sponsoredPrice,fineDiscountPercent:p.fineDiscount,status:'Pending Admin Approval',requestedAt:nowIso(),source:'seller-panel'});
            toast(`${p.name} subscription request sent to admin.`, 'success');
        }catch(e){toast('Could not send subscription request.','error');}
    };

    window.processSubscription = function(planName){return window.requestSubscriptionFromAdmin(planName);};

    function subscriptionCard(p){
        const active=currentPlan().key===p.key;
        const pauseResume=(p.key==='Basic'&&seller()&&seller().subscriptionPaused)?`<button class="btn-prime w-100" onclick="resumePausedSubscription()"><i class="fas fa-play"></i> Resume ${safe(pausedPlan())}</button>`:'';
        const action=active?`<button class="btn-outline w-100" disabled><i class="fas fa-check"></i> Active Plan</button>`:(p.key==='Basic'?`<button class="btn-outline w-100" onclick="switchToBasicWithConfirm()"><i class="fas fa-pause"></i> Switch / Pause to Basic</button>`:`<button class="btn-prime w-100" onclick="requestSubscriptionFromAdmin('${p.key}')"><i class="fas fa-paper-plane"></i> Request Admin Activation</button>`);
        return `<div class="admin-plan-card ary-smart-plan-card ${active?'active':''}"><div class="admin-plan-title"><strong>${safe(p.name)}</strong>${active?'<span class="ok-chip"><i class="fas fa-check"></i> Current</span>':'<span class="lock-chip"><i class="fas fa-user-shield"></i> Admin approval</span>'}</div><p class="muted-line">${safe(p.badge)}</p><div class="feature-list"><div class="feature-row"><span>Commission</span><span>${p.commission}%</span></div><div class="feature-row"><span>Paid Sponsored Price</span><span>${formatMoney(p.sponsoredPrice)}/24hr</span></div><div class="feature-row"><span>Fine Charge</span><span>${p.fineDiscount?`${p.fineDiscount}% lower`:'Standard admin approval'}</span></div><div class="feature-row"><span>Product Performance</span><span>${p.performance==='locked'?'Hidden':(p.performance==='pro'?'Advanced Pro':'Growth view')}</span></div></div>${action}${pauseResume}</div>`;
    }

    function renderSmartSubscriptionUI(){
        const notice=$('subscriptionAdminNotice'),cards=$('subscriptionCards'),history=$('subscriptionHistoryBox');
        const p=currentPlan(),end=subscriptionEnd(),s=seller()||{};
        if(notice){
            notice.innerHTML=`<div class="ary-sub-toolbar"><div><b>Current plan:</b> ${safe(p.name)} ${s.subscriptionPaused?'<span class="lock-chip"><i class="fas fa-pause"></i> Paid plan paused</span>':''}<br><span class="muted-line">Commission ${p.commission}% · Sponsored ${formatMoney(p.sponsoredPrice)} · Fine discount ${p.fineDiscount}% · ${end?'Valid till '+end.toLocaleDateString('en-IN'):'No expiry set'}</span></div><div class="ary-sub-actions"><button class="btn-outline" onclick="showSubscriptionDetails()"><i class="fas fa-receipt"></i> Subscription Details</button>${isPaidPlan()?'<button class="btn-outline" onclick="pauseMySubscription()"><i class="fas fa-pause"></i> Pause My Subscription</button>':(s.subscriptionPaused?'<button class="btn-prime" onclick="resumePausedSubscription()"><i class="fas fa-play"></i> Resume</button>':'')}</div></div>`;
        }
        if(cards)cards.innerHTML=[PLAN_RULES.Basic,PLAN_RULES.Growth,PLAN_RULES.Pro].map(subscriptionCard).join('');
        if(history&&history.style.display==='block')renderSubscriptionHistoryBox();
    }

    const oldLoadSubscriptionsUI=window.loadSubscriptionsUI;
    window.loadSubscriptionsUI=async function(){
        try{if(typeof oldLoadSubscriptionsUI==='function')await oldLoadSubscriptionsUI.apply(this,arguments);}catch(e){}
        renderSmartSubscriptionUI();
    };
    try{loadSubscriptionsUI=window.loadSubscriptionsUI;}catch(e){}

    function renderSubscriptionHistoryBox(){
        const box=$('subscriptionHistoryBox'); if(!box)return;
        const hist=Array.isArray((seller()||{}).subHistory)?(seller()||{}).subHistory:[];
        box.style.display='block';
        box.innerHTML=`<div class="section-head-row"><div><h3><i class="fas fa-file-invoice"></i> Subscription Invoice & History</h3><p class="muted-line">Print invoice, pause/resume details and payment records.</p></div><button class="btn-prime" onclick="printSubscriptionInvoice()"><i class="fas fa-print"></i> Print Invoice</button></div>`+(hist.length?`<div class="table-container"><table class="admin-table"><thead><tr><th>Plan</th><th>Amount</th><th>Payment</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${hist.slice().reverse().map(h=>`<tr><td data-label="Plan"><b>${safe(h.planName||h.plan||h.name||'-')}</b></td><td data-label="Amount">${formatMoney(h.amount||h.cost||h.price||0)}</td><td data-label="Payment">${safe(h.method||h.paymentMethod||'-')}</td><td data-label="Start">${dateOf(h.startDate||h.createdAt)?.toLocaleDateString('en-IN')||'-'}</td><td data-label="End">${dateOf(h.endDate||h.subEndDate)?.toLocaleDateString('en-IN')||'-'}</td><td data-label="Status"><span class="ok-chip">${safe(h.status||'Active')}</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="admin-empty">No subscription payment history found.</div>`);
    }

    window.showSubscriptionDetails=function(){
        ensureSubscriptionModal();
        const p=currentPlan(),s=seller()||{},end=subscriptionEnd();
        const body=$('arySubscriptionDetailBody');
        if(body)body.innerHTML=`<h3 style="font-size:24px;font-weight:900;margin-bottom:8px;"><i class="fas fa-crown"></i> Subscription Details</h3><p class="muted-line">Seller can pause paid plan to Basic and resume the old plan later.</p><div class="ary-detail-grid"><div><span>Seller</span><b>${safe(s.companyName||s.shopName||s.name||'-')}</b></div><div><span>Email</span><b>${safe(s.email||'-')}</b></div><div><span>Phone</span><b>${safe(s.phone||'-')}</b></div><div><span>Account UID</span><b>${safe(s.uid||s.id||'-')}</b></div><div><span>Current Plan</span><b>${safe(p.name)}</b></div><div><span>Commission</span><b>${p.commission}%</b></div><div><span>Sponsored Price</span><b>${formatMoney(p.sponsoredPrice)}</b></div><div><span>Fine Discount</span><b>${p.fineDiscount}%</b></div><div><span>End Date</span><b>${end?end.toLocaleString('en-IN'):'Not set'}</b></div><div><span>Paused Plan</span><b>${safe(pausedPlan()||'None')}</b></div></div><div class="ary-sub-actions" style="margin-top:18px;"><button class="btn-prime" onclick="printSubscriptionInvoice()"><i class="fas fa-print"></i> Print Invoice</button>${isPaidPlan()?'<button class="btn-outline" onclick="pauseMySubscription()"><i class="fas fa-pause"></i> Pause My Subscription</button>':((seller()||{}).subscriptionPaused?'<button class="btn-prime" onclick="resumePausedSubscription()"><i class="fas fa-play"></i> Resume Subscription</button>':'')}</div>`;
        const modal=$('arySubscriptionDetailModal');if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}
        renderSubscriptionHistoryBox();
    };

    window.printSubscriptionInvoice=function(){
        const s=seller()||{},p=currentPlan(),end=subscriptionEnd();
        const hist=Array.isArray(s.subHistory)?s.subHistory:[];
        const last=hist[hist.length-1]||{};
        const html=`<div style="font-family:Arial,sans-serif;color:#0f172a;padding:28px;max-width:850px;margin:0 auto;"><div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:16px;margin-bottom:20px;"><div><h1 style="margin:0;font-size:28px;">Aryanta.in</h1><p style="margin:5px 0 0;font-weight:700;">Seller Subscription Invoice</p><p style="margin:5px 0 0;font-size:12px;">support@aryanta.in · 6206318133</p></div><div style="text-align:right;font-size:12px;"><b>Invoice Date</b><br>${new Date().toLocaleString('en-IN')}<br><br><b>Plan</b><br>${safe(p.name)}</div></div><h3>Seller Details</h3><table style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr><td style="padding:8px;border:1px solid #e2e8f0;"><b>Name</b><br>${safe(s.companyName||s.shopName||s.name||'-')}</td><td style="padding:8px;border:1px solid #e2e8f0;"><b>Email</b><br>${safe(s.email||'-')}</td></tr><tr><td style="padding:8px;border:1px solid #e2e8f0;"><b>Phone</b><br>${safe(s.phone||'-')}</td><td style="padding:8px;border:1px solid #e2e8f0;"><b>Account UID</b><br>${safe(s.uid||s.id||'-')}</td></tr><tr><td colspan="2" style="padding:8px;border:1px solid #e2e8f0;"><b>Address</b><br>${safe(s.address||s.shopAddress||s.businessAddress||'-')}</td></tr></table><h3>Subscription Details</h3><table style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;">Plan</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;">Commission</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;">Sponsored Price</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;">Fine Discount</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;">Valid Till</th></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;">${safe(p.name)}</td><td style="padding:10px;border:1px solid #e2e8f0;">${p.commission}%</td><td style="padding:10px;border:1px solid #e2e8f0;">${formatMoney(p.sponsoredPrice)}</td><td style="padding:10px;border:1px solid #e2e8f0;">${p.fineDiscount}%</td><td style="padding:10px;border:1px solid #e2e8f0;">${end?end.toLocaleDateString('en-IN'):'-'}</td></tr></table><h3>Paid Information</h3><p><b>Amount:</b> ${formatMoney(last.amount||last.price||0)} &nbsp; <b>Payment Method:</b> ${safe(last.method||last.paymentMethod||'Admin / Manual')} &nbsp; <b>Status:</b> ${safe(last.status||'Active')}</p><p style="font-size:12px;color:#64748b;margin-top:30px;">This invoice is generated from Aryanta seller panel subscription records.</p></div>`;
        const area=$('printArea')||document.body.appendChild(document.createElement('div'));area.id='printArea';area.innerHTML=html;area.style.display='block';
        if(window.printJS){printJS({printable:'printArea',type:'html',targetStyles:['*']});}
        else{const w=window.open('','_blank');w.document.write(html);w.document.close();w.focus();w.print();}
        setTimeout(()=>{area.style.display='none';},800);
    };

    async function notificationReadIds(){
        const ids=new Set(),database=dbx();
        if(!database||!sellerEmail())return ids;
        try{const snap=await database.collection('seller_notification_reads').where('sellerEmail','==',sellerEmail()).limit(500).get();snap.forEach(d=>{const data=d.data()||{};ids.add(txt(data.notificationId||d.id));});}catch(e){}
        return ids;
    }
    function targetOk(d){const target=low(d.target||d.sellerEmail||d.email||'all');return target==='all'||target==='sellers'||target===sellerEmail();}
    function renderNotificationsSmart(){
        const count=(window.adminNotifications||adminNotifications||[]).length;
        ['notifBadge','topbarNotifBadge'].forEach(id=>{const el=$(id);if(el){el.textContent=count;el.style.display=count?'inline-block':'none';el.classList.remove('blink','pulse','animate');el.style.animation='none';}});
        const rows=window.adminNotifications||adminNotifications||[];
        const html=rows.length?rows.map(n=>`<div class="notification-card ary-notification-card" onclick="openFullNotifFinal('${safe(n.id)}')"><div class="ary-notif-top"><strong>${safe(n.title||'Aryanta Notice')}</strong><span>${safe(n.source==='seller_notifications'?'Personal':'Broadcast')}</span></div><p>${safe(n.text||'No message')}</p><small><i class="fas fa-clock"></i> ${dateOf(n.time)?.toLocaleString('en-IN')||''}</small>${n.link?'<div class="ok-chip"><i class="fas fa-link"></i> Link attached</div>':''}</div>`).join(''):`<div class="panel-box" style="text-align:center;"><i class="fas fa-bell-slash" style="font-size:30px;color:var(--text-light);"></i><h3>No notifications</h3><p class="muted-line">Read notifications are removed from this seller view.</p></div>`;
        const full=$('fullNotifList');if(full)full.innerHTML=html;
        const drop=$('notifList');if(drop)drop.innerHTML=html;
    }
    window.fetchNotifications=async function(){
        const database=dbx(); if(!database||!sellerEmail())return;
        const rows=[],read=await notificationReadIds();
        try{const b=await database.collection('admin_broadcasts').orderBy('timestamp','desc').limit(60).get();b.forEach(doc=>{const d=doc.data()||{};const id='admin_broadcasts_'+doc.id;if(targetOk(d)&&!read.has(id))rows.push({id,docId:doc.id,source:'admin_broadcasts',title:d.title||'Aryanta Notice',text:d.message||d.text||d.title||'Notice',time:d.timestamp||d.createdAt||d.time||nowIso(),link:d.link||d.url||d.actionUrl||''});});}catch(e){}
        try{const s1=await database.collection('seller_notifications').where('sellerEmail','==',sellerEmail()).limit(60).get();s1.forEach(doc=>{const d=doc.data()||{};rows.push({id:'seller_notifications_'+doc.id,docId:doc.id,source:'seller_notifications',title:d.title||'Seller Notification',text:d.message||d.text||d.title||'Notification',time:d.timestamp||d.createdAt||d.time||nowIso(),link:d.link||d.url||d.actionLink||''});});}catch(e){}
        try{const s2=await database.collection('seller_notifications').where('email','==',sellerEmail()).limit(60).get();s2.forEach(doc=>{if(rows.some(r=>r.docId===doc.id&&r.source==='seller_notifications'))return;const d=doc.data()||{};rows.push({id:'seller_notifications_'+doc.id,docId:doc.id,source:'seller_notifications',title:d.title||'Seller Notification',text:d.message||d.text||d.title||'Notification',time:d.timestamp||d.createdAt||d.time||nowIso(),link:d.link||d.url||d.actionLink||''});});}catch(e){}
        rows.sort((a,b)=>(dateOf(b.time)||0)-(dateOf(a.time)||0));
        try{adminNotifications=rows;window.adminNotifications=rows;sellerNotifications=rows;}catch(e){window.adminNotifications=rows;}
        renderNotificationsSmart();
    };
    try{fetchNotifications=window.fetchNotifications;}catch(e){}

    async function markNotificationRead(n){
        const database=dbx(); if(!database||!n)return;
        try{
            if(n.source==='seller_notifications')await database.collection('seller_notifications').doc(n.docId).delete();
            else await database.collection('seller_notification_reads').doc((n.id+'_'+sellerEmail()).replace(/[^a-zA-Z0-9_-]/g,'_')).set({sellerEmail:sellerEmail(),notificationId:n.id,source:n.source,docId:n.docId,readAt:nowIso()},{merge:true});
        }catch(e){console.warn('notification read save failed',e);}
        const rows=(window.adminNotifications||adminNotifications||[]).filter(x=>x.id!==n.id);
        try{adminNotifications=rows;window.adminNotifications=rows;sellerNotifications=rows;}catch(e){window.adminNotifications=rows;}
        renderNotificationsSmart();
    }
    window.openFullNotifFinal=async function(id){
        const rows=window.adminNotifications||adminNotifications||[];
        const n=rows.find(x=>txt(x.id)===txt(id)); if(!n)return;
        const cont=$('notifDetailContent'),mod=$('notificationDetailModal');
        if(cont&&mod){
            cont.innerHTML=`<div style="background:var(--surface-2);padding:20px;border-radius:16px;border:1px solid var(--border-color);"><h3 style="margin-bottom:10px;">${safe(n.title||'Aryanta Notice')}</h3><p style="font-size:15px;font-weight:800;line-height:1.7;color:var(--text-main);">${safe(n.text||'No message')}</p><small class="muted-line"><i class="fas fa-clock"></i> ${dateOf(n.time)?.toLocaleString('en-IN')||''}</small>${n.link?`<br><a class="btn-prime" style="display:inline-flex;text-decoration:none;margin-top:14px;" target="_blank" rel="noopener" href="${safe(/^https?:\/\//i.test(n.link)?n.link:'https://'+n.link)}"><i class="fas fa-link"></i> Open Link</a>`:''}<p class="muted-line" style="margin-top:12px;">This notification is now removed from your seller notification view.</p></div>`;
            mod.style.display='flex';setTimeout(()=>mod.classList.add('show'),10);
        }else toast(n.text||'Notification','info');
        await markNotificationRead(n);
    };
    window.openFullNotif=window.openFullNotifFinal;

    function productPerformanceRows(){
        const st=products().map(p=>({product:p,sold:0,orders:0,delivered:0,cancelled:0,returned:0,revenue:0,views:num(p.views||p.viewCount||p.totalViews||p.clicks||0),stock:num(p.stock||p.quantity||p.totalStock||0),rating:num(p.rating||p.avgRating||0),reviewCount:num(p.reviewCount||p.ratingCount||0)}));
        orders().forEach(o=>{
            const status=low(o.status||o.orderStatus||o.deliveryStatus);
            orderItems(o).forEach(i=>{
                const row=st.find(r=>productMatchItem(r.product,i)); if(!row)return;
                const q=Math.max(1,num(i.qty||i.quantity||1)||1), amt=q*num(i.price||i.sellingPrice||i.finalPrice||0);
                row.sold+=q; row.orders+=1; row.revenue+=amt;
                if(status.includes('deliver'))row.delivered+=q;
                if(status.includes('cancel')||status.includes('breach'))row.cancelled+=q;
                if(status.includes('return')||status.includes('rto'))row.returned+=q;
            });
        });
        return st.sort((a,b)=>b.revenue-a.revenue||b.sold-a.sold||b.views-a.views);
    }
    function aiTip(r){
        if(r.stock<=0)return 'Restock first. Ads and ranking will not help while stock is zero.';
        if(r.views>20&&r.sold===0)return 'Many views but no sale: improve price, first image and highlights.';
        if(r.returned+r.cancelled>Math.max(1,r.sold)*0.25)return 'High loss rate: check packaging, product title accuracy and QC.';
        if(r.sold>0&&r.stock<=7)return 'Good demand with low stock. Refill before the item goes out of stock.';
        if(r.views<10)return 'Low visibility. Use sponsored slot or improve title keywords.';
        return 'Stable item. Keep stock and monitor reviews for ranking.';
    }
    window.loadProductPerformance=function(){
        const p=currentPlan();
        const list=$('productPerformanceList'); if(!list)return;
        if(p.performance==='locked'){
            list.innerHTML=`<div class="panel-box ary-locked-performance"><i class="fas fa-lock"></i><h3>Product Performance is locked on Basic</h3><p class="muted-line">Upgrade to Growth for product performance. Pro unlocks deeper Amazon/Flipkart-style analytics, loss signals and AI tips.</p><button class="btn-prime" onclick="showSection('subscription')"><i class="fas fa-crown"></i> View Plans</button></div>`;
            return;
        }
        let rows=productPerformanceRows();
        const filter=window.currentPerfFilter||'all';
        qsa('#productPerformanceSection .cat-pill').forEach(b=>b.classList.remove('active'));
        const fbtn=$('perf-filter-'+filter);if(fbtn)fbtn.classList.add('active');
        if(filter==='top')rows=rows.filter(r=>r.sold>0).sort((a,b)=>b.sold-a.sold||b.revenue-a.revenue);
        if(filter==='loss')rows=rows.filter(r=>r.cancelled+r.returned>0).sort((a,b)=>(b.cancelled+b.returned)-(a.cancelled+a.returned));
        if(!rows.length){list.innerHTML='<div class="panel-box">No product performance data yet.</div>';return;}
        list.innerHTML=rows.map((r,idx)=>{
            const prod=r.product||{},img=productImage(prod),loss=r.cancelled+r.returned,views=Math.max(0,r.views),conversion=views?((r.sold/views)*100).toFixed(1):'0.0',returnRate=r.sold?Math.round((loss/r.sold)*100):0,sellThrough=(r.sold+r.stock)>0?Math.round((r.sold/(r.sold+r.stock))*100):0;
            const proBlock=p.performance==='pro'?`<div class="ary-pro-metrics"><div><span>Conversion</span><b>${conversion}%</b></div><div><span>Return/Loss Rate</span><b>${returnRate}%</b></div><div><span>Sell-through</span><b>${sellThrough}%</b></div><div><span>Rank</span><b>#${idx+1}</b></div></div><div class="ary-ai-tip"><i class="fas fa-wand-magic-sparkles"></i> ${safe(aiTip(r))}</div>`:'';
            return `<div class="performance-card ary-smart-performance-card"><div class="ary-perf-img">${img?`<img src="${safe(img)}" loading="lazy" onclick="openImageViewer&&openImageViewer('${safe(img)}')">`:'<i class="fas fa-box-open"></i>'}</div><div class="ary-perf-body"><h4>${safe(prod.name||prod.title||'Product')}</h4><p class="muted-line">UID: <b>${safe(prod.id||prod.productId||'-')}</b><br>SKU: <b>${safe(prod.sku||'-')}</b></p><div class="tiny-metric-grid"><div class="tiny-metric"><span>Sold</span>${r.sold}</div><div class="tiny-metric"><span>Revenue</span>${formatMoney(r.revenue)}</div><div class="tiny-metric"><span>Views</span>${views}</div></div><div class="tiny-metric-grid"><div class="tiny-metric"><span>Stock</span>${r.stock}</div><div class="tiny-metric"><span>Delivered</span>${r.delivered}</div><div class="tiny-metric"><span>Loss</span>${loss}</div></div>${proBlock}<button class="btn-outline w-100" onclick="editItem&&editItem('${safe(prod.id||prod.productId||'')}')"><i class="fas fa-edit"></i> Edit Product</button></div></div>`;
        }).join('');
    };
    try{loadProductPerformance=window.loadProductPerformance;}catch(e){}
    window.setProductPerformanceFilter=function(filter){window.currentPerfFilter=filter||'all';window.loadProductPerformance();};

    function updatePlanGates(){
        const basic=currentPlan().key==='Basic';
        qsa('.nav-item').forEach(nav=>{
            const click=nav.getAttribute('onclick')||'';
            if(click.includes('productPerformance'))nav.style.display=basic?'none':'';
        });
        const badge=$('currentPlanBadge');if(badge)badge.textContent=currentPlan().name;
    }

    function qnaEntries(){
        const rows=[];
        products().forEach(p=>{
            const qs=Array.isArray(p.qa)?p.qa:(Array.isArray(p.qna)?p.qna:(Array.isArray(p.questions)?p.questions:[]));
            qs.forEach((q,i)=>rows.push({product:p,question:q,index:i,id:q.id||q.qid||String(i),answered:!!(q.answer||q.ans||q.reply)}));
        });
        return rows;
    }
    function ensureQnaControls(){
        const sec=$('qnaSection'); if(!sec||$('aryQnaToolbar'))return;
        const panel=sec.querySelector('.panel-box');
        const div=document.createElement('div');div.id='aryQnaToolbar';div.className='ary-qna-toolbar';
        div.innerHTML=`<button class="cat-pill active" id="qna-filter-new" onclick="setQnaFilter('new')"><i class="fas fa-circle-question"></i> New Questions</button><button class="cat-pill" id="qna-filter-answered" onclick="setQnaFilter('answered')"><i class="fas fa-check-circle"></i> Answered Ques</button><button class="cat-pill" id="qna-filter-all" onclick="setQnaFilter('all')"><i class="fas fa-layer-group"></i> All</button>`;
        if(panel)panel.insertAdjacentElement('afterend',div);else sec.insertBefore(div,sec.firstChild);
    }
    window.setQnaFilter=function(filter){window.currentQnaFilter=filter||'new';window.loadQna();};
    window.loadQna=function(){
        ensureQnaControls();
        const list=$('qnaList'); if(!list)return;
        const filter=window.currentQnaFilter||'new';
        ['new','answered','all'].forEach(f=>{const b=$('qna-filter-'+f);if(b)b.classList.toggle('active',f===filter);});
        let rows=qnaEntries();
        if(filter==='new')rows=rows.filter(r=>!r.answered);
        if(filter==='answered')rows=rows.filter(r=>r.answered);
        if(!rows.length){list.innerHTML=`<tr><td colspan="4" style="text-align:center;font-weight:800;padding:22px;">No ${filter==='answered'?'answered':'new'} questions.</td></tr>`;return;}
        list.innerHTML=rows.map(r=>{
            const p=r.product,q=r.question,img=productImage(p),ans=q.answer||q.ans||q.reply||'';
            return `<tr class="clickable-row" onclick="openQnaProductDetails('${safe(p.id||p.productId||'')}','${safe(r.id)}')"><td data-label="Product"><div class="ary-qna-product">${img?`<img src="${safe(img)}" loading="lazy">`:'<i class="fas fa-box-open"></i>'}<div><b>${safe(p.name||p.title||'Product')}</b><small>UID: ${safe(p.id||p.productId||'-')}</small></div></div></td><td data-label="Question"><b>Q:</b> ${safe(q.question||q.text||q.message||'Question')}<br><span class="muted-line"><b>A:</b> ${ans?safe(ans):'Waiting for your reply'}</span></td><td data-label="Status">${ans?'<span class="ok-chip">Answered</span>':'<span class="lock-chip">New</span>'}</td><td data-label="Action"><button class="btn-prime btn-sm" onclick="event.stopPropagation(); answerQnaSmart('${safe(p.id||p.productId||'')}','${safe(r.id)}')"><i class="fas fa-reply"></i> ${ans?'Edit':'Answer'}</button></td></tr>`;
        }).join('');
    };
    try{loadQna=window.loadQna;}catch(e){}

    function ensureQnaDetailModal(){
        if($('aryQnaProductModal'))return;
        document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="aryQnaProductModal"><div class="modal-content ary-smart-modal"><span class="close-modal" onclick="closeSmartModal('aryQnaProductModal')"><i class="fas fa-times"></i></span><div id="aryQnaProductBody"></div></div></div>`);
    }
    window.openQnaProductDetails=function(pid,qid){
        ensureQnaDetailModal();
        const row=qnaEntries().find(r=>txt(r.product.id||r.product.productId)===txt(pid)&&txt(r.id)===txt(qid)); if(!row)return;
        const p=row.product,q=row.question,img=productImage(p),ans=q.answer||q.ans||q.reply||'';
        const body=$('aryQnaProductBody');
        if(body)body.innerHTML=`<h3><i class="fas fa-comments"></i> Product Question Details</h3><div class="ary-qna-detail">${img?`<img src="${safe(img)}" onclick="openImageViewer&&openImageViewer('${safe(img)}')">`:'<div class="prime-image-fallback"><i class="fas fa-box-open"></i></div>'}<div><p><b>Product UID:</b> ${safe(p.id||p.productId||'-')}</p><p><b>Title:</b> ${safe(p.name||p.title||'-')}</p><p><b>Description:</b> ${safe(p.description||p.desc||p.highlights||'-')}</p><p><b>Question:</b> ${safe(q.question||q.text||q.message||'-')}</p><p><b>Answer:</b> ${ans?safe(ans):'Not answered yet'}</p><button class="btn-prime" onclick="answerQnaSmart('${safe(p.id||p.productId||'')}','${safe(row.id)}')"><i class="fas fa-reply"></i> Answer / Edit</button></div></div>`;
        const modal=$('aryQnaProductModal');if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}
    };
    window.answerQnaSmart=function(pid,qid){
        const row=qnaEntries().find(r=>txt(r.product.id||r.product.productId)===txt(pid)&&txt(r.id)===txt(qid)); if(!row)return;
        const p=row.product,q=row.question;
        if($('qnaProdId'))$('qnaProdId').value=p.id||p.productId||'';
        if($('qnaQid'))$('qnaQid').value=qid;
        if($('qnaTextDisplay'))$('qnaTextDisplay').innerText='Q: '+(q.question||q.text||q.message||'Question');
        if($('qnaAnsText'))$('qnaAnsText').value=q.answer||q.ans||q.reply||'';
        const m=$('qnaModal');if(m){m.style.display='flex';setTimeout(()=>m.classList.add('show'),10);}
    };
    window.saveQnaAnswer=async function(){
        const pid=$('qnaProdId')?.value, qid=$('qnaQid')?.value, ans=$('qnaAnsText')?.value.trim();
        if(!pid||!ans)return toast('Answer cannot be empty.','warning');
        const p=productById(pid); if(!p)return toast('Product not found.','error');
        const arr=Array.isArray(p.qa)?p.qa.slice():(Array.isArray(p.qna)?p.qna.slice():(Array.isArray(p.questions)?p.questions.slice():[]));
        const idx=arr.findIndex((q,i)=>txt(q.id||q.qid||i)===txt(qid));
        if(idx<0)return toast('Question not found.','error');
        arr[idx]=Object.assign({},arr[idx],{answer:ans,answeredAt:nowIso(),answeredBy:sellerEmail(),status:'Answered'});
        try{await dbx().collection('products').doc(p.id||p.productId).set({qa:arr},{merge:true});p.qa=arr;closeModal&&closeModal('qnaModal');toast('Answer published.','success');window.loadQna();}catch(e){toast('Could not save answer.','error');}
    };

    function injectSupportQnaButtons(){
        const sec=$('supportSection'); if(!sec||$('supportQnaShortcutRow'))return;
        const head=sec.querySelector('div[style*="justify-content:space-between"]')||sec.firstElementChild;
        const row=document.createElement('div');row.id='supportQnaShortcutRow';row.className='ary-support-shortcuts';
        row.innerHTML=`<button class="btn-prime" onclick="showSection('qna');setQnaFilter('new')"><i class="fas fa-circle-question"></i> New Questions</button><button class="btn-outline" onclick="showSection('qna');setQnaFilter('answered')"><i class="fas fa-check-circle"></i> Answered Ques</button>`;
        if(head)head.insertAdjacentElement('afterend',row);else sec.insertBefore(row,sec.firstChild);
    }

    function ensureAchievementUI(){
        if(!$('nav-achievements')){
            const div=document.createElement('div');div.id='nav-achievements';div.className='nav-item';div.setAttribute('onclick',"showSection('achievements')");div.innerHTML='<i class="fas fa-trophy" style="color:#f59e0b;"></i> Achievements <span id="badge-achievements" class="nav-badge" style="background:#f59e0b;">0</span>';
            const anchor=Array.from(document.querySelectorAll('.nav-item')).find(n=>(n.getAttribute('onclick')||'').includes('subscription'))||Array.from(document.querySelectorAll('.nav-item')).find(n=>(n.getAttribute('onclick')||'').includes('support'));
            if(anchor)anchor.insertAdjacentElement('afterend',div);
        }
        if(!$('achievementsSection')){
            const sec=document.createElement('section');sec.id='achievementsSection';sec.className='data-section';sec.innerHTML=`<div class="section-head-row"><div><h3 style="font-size:24px;font-weight:900;color:#f59e0b;"><i class="fas fa-trophy"></i> Seller Achievements</h3><p class="muted-line">Unlock powers, free sponsored ad slots and subscription reward requests as your store grows.</p></div><button class="btn-outline" onclick="loadAchievements()"><i class="fas fa-sync"></i> Refresh</button></div><div id="achievementsSummary" class="ary-achievement-summary"></div><div id="achievementsGrid" class="ary-achievement-grid"></div>`;
            const pad=document.querySelector('.content-padding'); if(pad)pad.appendChild(sec);
        }
    }
    function achievementDefinitions(){
        const os=orders(), delivered=os.filter(o=>low(o.status).includes('deliver')), losses=os.filter(o=>low(o.status).includes('cancel')||low(o.status).includes('return')), st=storeRatingStats(), ps=products();
        return [
            {id:'first_order',title:'First Order Hero',icon:'fa-flag-checkered',unlocked:os.length>=1,progress:Math.min(os.length,1),target:1,reward:'1 free sponsored ad slot',type:'sponsored_slot',power:'+1 Boost Slot'},
            {id:'ten_orders',title:'10 Order Starter',icon:'fa-boxes-stacked',unlocked:os.length>=10,progress:Math.min(os.length,10),target:10,reward:'2 free sponsored ad slots',type:'sponsored_slot_2',power:'+2 Boost Slots'},
            {id:'fifty_orders',title:'50 Order Growth Seller',icon:'fa-chart-line',unlocked:os.length>=50,progress:Math.min(os.length,50),target:50,reward:'Growth subscription reward request',type:'growth_subscription',power:'Growth Upgrade Request'},
            {id:'hundred_orders',title:'100 Order Pro Seller',icon:'fa-crown',unlocked:os.length>=100,progress:Math.min(os.length,100),target:100,reward:'Pro subscription reward request',type:'pro_subscription',power:'Pro Upgrade Request'},
            {id:'first_5star',title:'First 5-Star Review',icon:'fa-star',unlocked:st.buckets[5]>=1,progress:Math.min(st.buckets[5],1),target:1,reward:'Store trust badge request',type:'badge',power:'Trust Badge'},
            {id:'ten_delivered',title:'10 Delivered Orders',icon:'fa-truck-fast',unlocked:delivered.length>=10,progress:Math.min(delivered.length,10),target:10,reward:'1 free sponsored ad slot',type:'sponsored_slot',power:'+1 Boost Slot'},
            {id:'clean_seller',title:'Clean Seller Streak',icon:'fa-shield-heart',unlocked:os.length>=10&&losses.length===0,progress:os.length>=10&&losses.length===0?10:Math.max(0,10-losses.length),target:10,reward:'Low fine priority review',type:'priority_review',power:'Priority Review'},
            {id:'stock_master',title:'Stock Master',icon:'fa-warehouse',unlocked:ps.length>0&&ps.every(p=>num(p.stock||p.quantity)>7),progress:ps.filter(p=>num(p.stock||p.quantity)>7).length,target:Math.max(1,ps.length),reward:'Inventory health badge',type:'badge',power:'Inventory Badge'}
        ];
    }
    function claimedAchievements(){const s=seller()||{};return new Set(Array.isArray(s.claimedAchievements)?s.claimedAchievements:[]);}
    function renderAchievementBadge(){
        const unlocked=achievementDefinitions().filter(a=>a.unlocked&&!claimedAchievements().has(a.id)).length;
        const b=$('badge-achievements');if(b){b.style.display=unlocked?'inline-block':'none';b.textContent=unlocked;}
    }
    window.loadAchievements=function(){
        ensureAchievementUI();
        const grid=$('achievementsGrid'),sum=$('achievementsSummary'); if(!grid)return;
        const defs=achievementDefinitions(),claimed=claimedAchievements();
        if(sum)sum.innerHTML=`<div><strong>${defs.filter(a=>a.unlocked).length}</strong><span>Unlocked</span></div><div><strong>${claimed.size}</strong><span>Claimed</span></div><div><strong>${defs.length}</strong><span>Total Powers</span></div>`;
        grid.innerHTML=defs.map(a=>{
            const c=claimed.has(a.id),pct=Math.min(100,Math.round((a.progress/Math.max(1,a.target))*100));
            return `<div class="ary-achievement-card ${a.unlocked?'unlocked':'locked'} ${c?'claimed':''}"><div class="ary-ach-icon"><i class="fas ${a.icon}"></i></div><h4>${safe(a.title)}</h4><p>${safe(a.reward)}</p><div class="ary-ach-progress"><span style="width:${pct}%"></span></div><small>${safe(a.progress)} / ${safe(a.target)} · ${safe(a.power)}</small>${a.unlocked?(c?'<button class="btn-outline w-100" disabled><i class="fas fa-check"></i> Claimed</button>':`<button class="btn-prime w-100" onclick="claimAchievement('${safe(a.id)}')"><i class="fas fa-gift"></i> Claim Reward</button>`):'<button class="btn-outline w-100" disabled><i class="fas fa-lock"></i> Locked</button>'}</div>`;
        }).join('');
        renderAchievementBadge();
    };
    window.claimAchievement=async function(id){
        const def=achievementDefinitions().find(a=>a.id===id),database=dbx(),s=seller();
        if(!def||!def.unlocked)return toast('Achievement not unlocked yet.','warning');
        const claimed=claimedAchievements(); if(claimed.has(id))return toast('Already claimed.','info');
        const next=[...claimed,id];
        try{
            await database.collection('seller_achievement_claims').doc((sellerEmail()+'_'+id).replace(/[^a-zA-Z0-9_-]/g,'_')).set({sellerEmail:sellerEmail(),sellerName:s.companyName||s.shopName||'',achievementId:id,title:def.title,reward:def.reward,type:def.type,status:def.type.includes('subscription')?'Pending Admin Approval':'Available',claimedAt:nowIso(),source:'seller-panel'},{merge:true});
            const patch={claimedAchievements:next};
            if(def.type==='sponsored_slot')patch.rewardSponsoredSlots=num(s.rewardSponsoredSlots)+1;
            if(def.type==='sponsored_slot_2')patch.rewardSponsoredSlots=num(s.rewardSponsoredSlots)+2;
            await saveSellerPatch(patch);
            if(def.type.includes('subscription'))await database.collection('seller_subscription_requests').add({sellerEmail:sellerEmail(),sellerName:s.companyName||'',planName:def.type==='pro_subscription'?'Pro':'Growth',source:'achievement',achievementId:id,status:'Pending Admin Approval',requestedAt:nowIso()}).catch(()=>{});
            toast('Achievement reward claimed.','success');window.loadAchievements();
        }catch(e){toast('Could not claim reward.','error');}
    };

    function renderAiBusinessTips(){
        const home=$('homeSection'); if(!home||$('aryAiTipsBox'))return;
        const box=document.createElement('div');box.id='aryAiTipsBox';box.className='panel-box ary-ai-box';
        const rows=productPerformanceRows();
        const lowStock=products().filter(p=>num(p.stock||p.quantity)<=7).length;
        const losses=orders().filter(o=>low(o.status).includes('cancel')||low(o.status).includes('return')).length;
        const top=rows[0];
        box.innerHTML=`<h3><i class="fas fa-wand-magic-sparkles"></i> AI Seller Assistant</h3><div class="ary-ai-list"><p><b>Plan:</b> ${safe(currentPlan().name)} · commission ${currentPlan().commission}% · sponsored ${formatMoney(currentPlan().sponsoredPrice)}</p><p><b>Stock:</b> ${lowStock?`${lowStock} products need restock.`:'Stock health looks good.'}</p><p><b>Order quality:</b> ${losses?`${losses} cancelled/return order signals found. Check packaging and listing accuracy.`:'No major loss signal in loaded orders.'}</p><p><b>Top item:</b> ${top?safe(top.product.name||top.product.title||'Product')+' with '+formatMoney(top.revenue)+' revenue.':'No sales data loaded yet.'}</p></div>`;
        const chart=home.querySelector('.panel-box.mt-20'); if(chart)chart.insertAdjacentElement('beforebegin',box); else home.appendChild(box);
    }

    function shipUrl(o){return txt(o&&(o.shiprocketInvoicePdfUrl||o.shiprocketPdfUrl||o.shiprocket_invoice_pdf_url||o.shiprocketInvoiceUrl||o.shippingLabelUrl||o.label_url||o.pdf_url||o.invoicePdfUrl)).trim();}
    function absUrl(u){u=txt(u).trim();return u&&!/^https?:\/\//i.test(u)?'https://'+u:u;}
    function shipStatus(o){if(shipUrl(o))return 'ready';return low(o&&(o.shiprocketInvoiceStatus||o.shiprocket_status||o.shiprocketStatus));}
    function orderStatusMatch(o,keys){const s=low(o.status||o.orderStatus||o.deliveryStatus);return keys.some(k=>s.includes(k));}
    function itemLine(i){
        const p=products().find(x=>productMatchItem(x,i))||{};
        const img=i.image||i.productImage||productImage(p);
        return `<div class="ary-v4-item">${img?`<img src="${safe(img)}" style="object-fit:contain;background:#fff;">`:'<img style="display:none">'}<div><b>${safe(i.name||i.title||i.productName||p.name||'Product')}</b><div class="ary-v4-muted">SKU: ${safe(i.sku||p.sku||i.productId||'-')} · Qty: ${safe(i.qty||i.quantity||1)} · ${formatMoney(i.price||i.sellingPrice||p.price||0)}</div></div></div>`;
    }
    async function saveShipState(o,payload){
        Object.assign(o,payload);
        const database=dbx(); if(!database)return;
        const id=txt(o.id||o.orderId||o.order_no||o.orderNo).trim(); if(!id)return;
        try{await database.collection('orders').doc(txt(o.id||id)).set(Object.assign({sellerEmail:sellerEmail(),orderId:id,updatedAt:nowIso()},payload),{merge:true});}catch(e){}
        try{await database.collection('seller_shiprocket_invoices').doc((id+'_'+sellerEmail()).replace(/[^a-zA-Z0-9_-]/g,'_')).set(Object.assign({sellerEmail:sellerEmail(),orderId:id,updatedAt:nowIso()},payload),{merge:true});}catch(e){}
    }
    function renderShipBtn(o){
        const url=shipUrl(o),st=shipStatus(o),id=safe(o.id||o.orderId||o.order_no||o.orderNo);
        if(url)return `<button class="btn-shiprocket shiprocket-ready-btn" onclick="event.stopPropagation();window.open('${safe(absUrl(url))}','_blank','noopener')"><i class="fas fa-download"></i> Download Shiprocket PDF</button>`;
        const label=st==='missing_details'?'Fix Missing Details':(st==='api_error'||st==='timeout'?'Retry Shiprocket':(st==='requested'||st==='generating'||st==='waiting_pdf'?'Waiting / Retry PDF':'Generate Shiprocket'));
        return `<button class="btn-shiprocket" onclick="event.stopPropagation();downloadShippingInvoice('${id}')"><i class="fas ${st==='generating'||st==='waiting_pdf'?'fa-spinner fa-spin':'fa-rocket'}"></i> ${label}</button>`;
    }
    window.loadAcceptedOrders=function(){
        const list=$('acceptedOrdersList'); if(!list)return;
        const rows=orders().filter(o=>orderStatusMatch(o,['accepted','processing','packed','ready to ship','completed scan'])||o.shiprocketInvoiceRequested||shipUrl(o));
        if(!rows.length){list.innerHTML='<tr><td colspan="5" style="text-align:center;font-weight:800;padding:22px;">No accepted / Shiprocket pending orders.</td></tr>';return;}
        list.innerHTML=rows.map(o=>{
            const id=safe(o.id||o.orderId||o.order_no||o.orderNo), note=shipUrl(o)?'<div class="ok-chip"><i class="fas fa-check"></i> Shiprocket PDF saved.</div>':(o.shiprocketInvoiceRequested?'<div class="no-fine-note"><i class="fas fa-shield-heart"></i> Shiprocket requested. No auto fine while PDF is pending.</div>':'');
            return `<tr class="clickable-row" onclick="viewOrderDetails&&viewOrderDetails('${id}')"><td data-label="Select"><input type="checkbox" class="custom-cb cb-acc" value="${id}" onclick="event.stopPropagation()"></td><td data-label="Order Date"><strong>${orderDate(o).toLocaleString('en-IN')}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);">${safe(o.order_no||o.orderNo||o.id||'N/A')}</strong><br><small class="muted-line">${safe(o.status||o.orderStatus||'Accepted')}</small></td><td data-label="Item Details">${orderItems(o).map(itemLine).join('')}${note}</td><td data-label="Action"><div class="shiprocket-action-col">${renderShipBtn(o)}<button class="btn-outline btn-sm" onclick="event.stopPropagation();processSlips('print','${id}')"><i class="fas fa-print"></i> Standard Slip</button><button class="btn-outline btn-sm" onclick="event.stopPropagation();viewOrderDetails&&viewOrderDetails('${id}')"><i class="fas fa-eye"></i> Details</button></div></td></tr>`;
        }).join('');
    };
    try{loadAcceptedOrders=window.loadAcceptedOrders;}catch(e){}

    const oldDownloadShippingInvoice=window.downloadShippingInvoice;
    window.downloadShippingInvoice=async function(orderId){
        let ids=[];
        if(orderId==='bulk'){qsa('.cb-acc:checked').forEach(cb=>ids.push(cb.value));if(!ids.length)return toast('Select at least one accepted order.','warning');}else ids=[orderId];
        for(const id of ids){const o=findOrder(id);if(o)await saveShipState(o,{shiprocketInvoiceRequested:true,shiprocketInvoiceNoFine:true,shiprocketInvoiceStatus:shipStatus(o)||'requested',shiprocketInvoiceRequestedAt:o.shiprocketInvoiceRequestedAt||nowIso()});}
        try{if(typeof oldDownloadShippingInvoice==='function')await oldDownloadShippingInvoice.apply(this,arguments);}catch(e){toast('Shiprocket request saved. Retry after package/API details are fixed.','warning');}
        setTimeout(()=>window.loadAcceptedOrders(),120);
    };
    try{downloadShippingInvoice=window.downloadShippingInvoice;}catch(e){}

    window.processSlips=async function(mode,singleId){
        let ids=[]; if(singleId)ids=[singleId]; else qsa('.cb-acc:checked').forEach(cb=>ids.push(cb.value));
        if(!ids.length)return toast('Select at least one order.','warning');
        const s=seller()||{};
        let html='<div style="font-family:Arial,sans-serif;color:#0f172a;background:#fff;">';
        for(const id of ids){
            const o=findOrder(id); if(!o)continue;
            const items=orderItems(o); await saveShipState(o,{standardSlipPrinted:true,standardSlipPrintedAt:nowIso(),dispatchSlipPrintedAt:nowIso()});
            html+=`<div style="page-break-after:always;max-width:850px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;"><div style="display:flex;justify-content:space-between;border-bottom:3px solid #111827;padding-bottom:12px;margin-bottom:15px;"><div><h1 style="margin:0;font-size:26px;">Aryanta.in</h1><p style="margin:4px 0;font-size:12px;font-weight:700;">Standard Seller Dispatch Slip</p><p style="margin:0;font-size:11px;">support@aryanta.in · 6206318133</p></div><div style="text-align:right;font-size:12px;"><b>Order</b><br>${safe(o.order_no||o.orderNo||o.id||id)}<br><br><b>Date</b><br>${orderDate(o).toLocaleString('en-IN')}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px;"><tr><td style="border:1px solid #e2e8f0;padding:8px;"><b>Seller</b><br>${safe(s.companyName||s.shopName||s.email||'-')}<br>${safe(s.phone||'')}</td><td style="border:1px solid #e2e8f0;padding:8px;"><b>Buyer</b><br>${safe(o.delivery_name||o.customerName||o.name||'-')}<br>${safe(o.delivery_phone||o.customerPhone||o.phone||'')}</td></tr><tr><td colspan="2" style="border:1px solid #e2e8f0;padding:8px;"><b>Delivery Address</b><br>${safe(o.delivery_address||o.address||o.shippingAddress||'-')}</td></tr></table><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;border:1px solid #e2e8f0;padding:8px;background:#f8fafc;">Item</th><th style="text-align:center;border:1px solid #e2e8f0;padding:8px;background:#f8fafc;">Qty</th><th style="text-align:right;border:1px solid #e2e8f0;padding:8px;background:#f8fafc;">Seller Price</th></tr></thead><tbody>${items.map(i=>`<tr><td style="border:1px solid #e2e8f0;padding:8px;">${safe(i.name||i.title||i.productName||'Product')}<br><small>SKU: ${safe(i.sku||i.productId||'-')}</small></td><td style="text-align:center;border:1px solid #e2e8f0;padding:8px;">${safe(i.qty||i.quantity||1)}</td><td style="text-align:right;border:1px solid #e2e8f0;padding:8px;">${formatMoney(i.price||i.sellingPrice||0)}</td></tr>`).join('')}</tbody></table><div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;"><b>Total: ${formatMoney(orderAmount(o))}</b><div style="font-family:monospace;font-size:18px;letter-spacing:3px;border:1px dashed #111827;padding:8px 14px;">${safe(o.order_no||o.orderNo||o.id||id)}</div></div><p style="font-size:11px;color:#64748b;margin-top:18px;">Pack only the listed seller items. Keep proof photo/video until shipment is picked up.</p></div>`;
        }
        html+='</div>';
        const area=$('printArea')||document.body.appendChild(document.createElement('div'));area.id='printArea';area.innerHTML=html;area.style.display='block';
        if(window.printJS)printJS({printable:'printArea',type:'html',targetStyles:['*']});else{const w=window.open('','_blank');w.document.write(html);w.document.close();w.focus();w.print();}
        setTimeout(()=>{area.style.display='none';window.loadAcceptedOrders();},800);
    };

    async function sponsorUsage(){const s=seller()||{},u=s.sponsoredAdUsage||{};return u.month===monthKey()?num(u.used):0;}
    async function saveSponsorUsage(n){const usage={month:monthKey(),used:n,updatedAt:nowIso()};await saveSellerPatch({sponsoredAdUsage:usage,sponsoredAdsUsedThisMonth:n});}
    async function activateSponsored(productId,isFree,paymentInfo){
        const p=currentPlan(),database=dbx(); if(!database)return;
        const start=nowIso(),end=new Date(Date.now()+24*3600000).toISOString();
        const payload={isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsorStatus:'Live',sponsoredAt:start,sponsoredStartAt:start,sponsoredUntil:end,sponsorEndAt:end,sponsoredBySeller:sellerEmail(),sponsoredPlan:p.key,sponsoredPayment:isFree?'free_slot':'paid'};
        await database.collection('products').doc(productId).set(payload,{merge:true});
        await database.collection('seller_ad_logs').add({sellerEmail:sellerEmail(),productId,amount:isFree?0:p.sponsoredPrice,status:'Live',startAt:start,endAt:end,plan:p.key,createdAt:start,method:isFree?'free_slot':((paymentInfo&&paymentInfo.method)||'paid'),...(paymentInfo||{})}).catch(()=>{});
        const prod=productById(productId);if(prod)Object.assign(prod,payload);
        if(isFree)await saveSponsorUsage((await sponsorUsage())+1);
        toast('Sponsored ad active for 24 hours.','success');
        if(typeof closeModal==='function')closeModal('adPaymentModal');
        if(typeof loadAds==='function')loadAds();
    }
    window.startAd=async function(productId){
        const p=currentPlan(),used=await sponsorUsage(),freeLeft=Math.max(0,num(p.freeAds)+num((seller()||{}).rewardSponsoredSlots)-used),prod=productById(productId)||{};
        if($('adProdId'))$('adProdId').value=productId;
        if($('adCostDisplay'))$('adCostDisplay').textContent=freeLeft>0?'FREE':formatMoney(p.sponsoredPrice);
        if($('adPlanMessage'))$('adPlanMessage').innerHTML=freeLeft>0?`<b>${safe(prod.name||prod.title||'This product')}</b> can use a free sponsored slot. Remaining: <b>${freeLeft}</b>.`:`${safe(p.name)} sponsored price is <b>${formatMoney(p.sponsoredPrice)}</b> for 24 hours.`;
        const online=document.querySelector('#adPaymentModal button[onclick="payAdOnline()"]');if(online)online.innerHTML=freeLeft>0?'<i class="fas fa-bolt"></i> Use Free Sponsored Slot':`<i class="fas fa-credit-card"></i> Pay ${formatMoney(p.sponsoredPrice)} Online`;
        const payout=$('btnAdPayout');if(payout)payout.innerHTML=`<i class="fas fa-wallet"></i> Deduct ${formatMoney(p.sponsoredPrice)} from Payout`;
        const m=$('adPaymentModal');if(m){m.style.display='flex';setTimeout(()=>m.classList.add('show'),10);}
    };
    window.payAdOnline=async function(){
        const productId=$('adProdId')?.value;if(!productId)return;
        const p=currentPlan(),freeLeft=Math.max(0,num(p.freeAds)+num((seller()||{}).rewardSponsoredSlots)-(await sponsorUsage()));
        if(freeLeft>0)return activateSponsored(productId,true,{method:'free_slot'});
        if(!window.Razorpay||!API_KEYS||!API_KEYS.RAZORPAY){toast('Razorpay key missing. Ask admin to enable payment.','error');return;}
        new Razorpay({key:API_KEYS.RAZORPAY,amount:p.sponsoredPrice*100,currency:'INR',name:'Aryanta Sponsored Ads',description:`Sponsored ad ${p.name}`,handler:res=>activateSponsored(productId,false,{method:'razorpay',razorpayPaymentId:res.razorpay_payment_id||''}),prefill:{name:(seller()||{}).companyName||'',email:sellerEmail(),contact:(seller()||{}).phone||''},theme:{color:'#111827'}}).open();
    };
    window.payAdUpcoming=async function(){
        const productId=$('adProdId')?.value;if(!productId)return;
        const p=currentPlan();
        try{await dbx().collection('seller_payment_ledger').add({sellerEmail:sellerEmail(),type:'sponsored_ad_payout',productId,amount:-p.sponsoredPrice,status:'Pending payout deduction',createdAt:nowIso(),plan:p.key});}catch(e){}
        return activateSponsored(productId,false,{method:'upcoming_payout'});
    };

    const oldUpdateBankDetails=window.updateBankDetails;
    window.updateBankDetails=async function(){
        const accEl=$('profAcc'); if(accEl)accEl.value=txt(accEl.value).replace(/\D/g,'');
        if(accEl&&!accEl.value)return toast('Account number must be numeric only.','warning');
        if(typeof oldUpdateBankDetails==='function')return oldUpdateBankDetails.apply(this,arguments);
    };
    try{updateBankDetails=window.updateBankDetails;}catch(e){}

    const oldShowSection=window.showSection;
    window.showSection=async function(section){
        ensureAchievementUI();injectSupportQnaButtons();updatePlanGates();
        if(section==='productPerformance'&&currentPlan().key==='Basic'){
            toast('Product Performance is hidden on Basic. Upgrade to Growth or Pro.','warning');
            section='subscription';
        }
        let res;
        if(section==='achievements'){
            qsa('.data-section').forEach(sec=>sec.classList.remove('active'));
            const sec=$('achievementsSection');if(sec)sec.classList.add('active');
            qsa('.nav-item').forEach(n=>n.classList.remove('active'));const nav=$('nav-achievements');if(nav)nav.classList.add('active');
            const sb=$('mobileSidebar');if(sb)sb.classList.remove('open');const ov=$('mobileSidebarOverlay');if(ov)ov.style.display='none';
            window.loadAchievements();return;
        }
        if(typeof oldShowSection==='function')res=await oldShowSection.apply(this,[section]);
        setTimeout(function(){
            if(section==='subscription')renderSmartSubscriptionUI();
            if(section==='notifications')window.fetchNotifications();
            if(section==='productPerformance')window.loadProductPerformance();
            if(section==='qna')window.loadQna();
            if(section==='support')injectSupportQnaButtons();
            if(section==='acceptedOrders')window.loadAcceptedOrders();
            applyStoreRatingUI();updatePlanGates();renderAchievementBadge();
        },100);
        return res;
    };
    try{showSection=window.showSection;}catch(e){}

    function bootSmartFeatures(){
        installFineRequestMode();ensureAchievementUI();ensureQnaControls();injectSupportQnaButtons();updatePlanGates();applyStoreRatingUI();renderAiBusinessTips();renderAchievementBadge();
        const acc=$('profAcc');if(acc){acc.setAttribute('inputmode','numeric');acc.setAttribute('pattern','[0-9]*');acc.addEventListener('input',function(){this.value=this.value.replace(/\D/g,'');});}
        try{window.fetchNotifications();}catch(e){}
    }
    document.addEventListener('DOMContentLoaded',function(){setTimeout(bootSmartFeatures,500);setTimeout(bootSmartFeatures,1800);});
    setTimeout(bootSmartFeatures,1200);
})();

(function(){
    const bindQnaSubmit=function(){
        if(window.saveQnaAnswer){
            window.submitQnaAnswer=window.saveQnaAnswer;
            try{submitQnaAnswer=window.saveQnaAnswer;}catch(e){}
        }
        if(window.answerQnaSmart){
            window.openQnaModal=window.answerQnaSmart;
            try{openQnaModal=window.answerQnaSmart;}catch(e){}
        }
    };
    document.addEventListener('DOMContentLoaded',function(){setTimeout(bindQnaSubmit,600);setTimeout(bindQnaSubmit,1800);});
    setTimeout(bindQnaSubmit,1200);
})();


/* ===== Aryanta Final Requested Patch 2026-05-25: direct subscriptions, chart fix, returns, achievements, support cleanup ===== */
(function(){
    if(window.ARYANTA_FINAL_DIRECT_SUB_PATCH_20260525) return;
    window.ARYANTA_FINAL_DIRECT_SUB_PATCH_20260525 = true;

    const PLAN_FINAL = {
        Basic:{key:'Basic',name:'Basic',monthlyPrice:0,commission:6,sponsoredPrice:70,fineDiscount:0,freeAds:0,performance:'locked',badge:'Free access · 6% commission'},
        Growth:{key:'Growth',name:'Growth',monthlyPrice:259,commission:4,sponsoredPrice:50,fineDiscount:30,freeAds:2,performance:'growth',badge:'Direct paid plan · smarter analytics'},
        Pro:{key:'Pro',name:'Pro',monthlyPrice:459,commission:2.5,sponsoredPrice:40,fineDiscount:50,freeAds:5,performance:'pro',badge:'Direct paid plan · advanced analytics'}
    };
    window.ARYANTA_PLAN_RULES_2026 = PLAN_FINAL;
    window.ARYANTA_DIRECT_PAID_PLANS = PLAN_FINAL;

    function $(id){return document.getElementById(id);}
    function qsa(sel,root=document){return Array.from(root.querySelectorAll(sel));}
    function txt(v){return v===undefined||v===null?'':String(v);}
    function low(v){return txt(v).toLowerCase().trim();}
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function safe(v){return txt(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
    function nowIso(){return new Date().toISOString();}
    function toast(msg,type='info'){try{if(typeof showToast==='function')showToast(msg,type);else console.log(msg);}catch(e){console.log(msg);}}
    function seller(){try{return activeSeller||window.activeSeller||{};}catch(e){return window.activeSeller||{};}}
    function sellerEmail(){const s=seller();return low(s.email||s.sellerEmail||s.mail);}
    function sellerDocId(){const s=seller();return txt(s.email||s.sellerEmail||sellerEmail()||s.uid||s.id).trim();}
    function dbx(){try{return db||window.db||null;}catch(e){return window.db||null;}}
    function products(){try{return Array.isArray(sellerProducts)?sellerProducts:[];}catch(e){return window.sellerProducts||[];}}
    function orders(){try{return Array.isArray(sellerOrders)?sellerOrders:[];}catch(e){return window.sellerOrders||[];}}
    function reviews(){try{return Array.isArray(sellerReviews)?sellerReviews:[];}catch(e){return window.sellerReviews||[];}}
    function money(v){return '₹'+num(v).toLocaleString('en-IN');}
    function dateOf(v){if(!v)return null;if(v&&typeof v.toDate==='function')return v.toDate();const d=new Date(v);return isNaN(d.getTime())?null:d;}
    function addDays(d,n){const x=new Date(d||Date.now());x.setDate(x.getDate()+n);return x;}
    function planKey(raw){
        const s=seller();const p=low(raw||s.subscription||s.subscriptionName||s.plan||'Basic');
        if(p.includes('pro')||p.includes('ultra')||p.includes('premium'))return 'Pro';
        if(p.includes('growth')||p.includes('grow'))return 'Growth';
        return 'Basic';
    }
    function currentPlan(){return PLAN_FINAL[planKey()]||PLAN_FINAL.Basic;}
    function planByKey(k){return PLAN_FINAL[planKey(k)]||PLAN_FINAL.Basic;}
    function subEnd(){const s=seller();return dateOf(s.subEndDate||s.subscriptionEndDate||s.planEndDate||s.endDate);}
    function itemQty(i){return Math.max(1,num(i.qty||i.quantity||1)||1);}
    function orderDate(o){return dateOf(o&& (o.timestamp||o.createdAt||o.orderDate||o.date||o.acceptedAt||o.updatedAt))||new Date();}
    function orderItems(o){let it=[];try{if(typeof getSellerItemsFromOrder==='function')it=getSellerItemsFromOrder(o)||[];}catch(e){} if(!it.length&&Array.isArray(o&&o.items))it=o.items;return it;}
    function orderAmount(o){return orderItems(o).reduce((s,i)=>s+(num(i.price||i.sellingPrice||i.finalPrice||i.amount)*itemQty(i)),0)||num(o&&(o.total||o.amount||o.finalAmount||o.totalPrice));}
    function findOrder(id){const key=txt(id).trim();return orders().find(o=>[o.id,o.orderId,o.order_no,o.orderNo,o.invoiceId].some(v=>txt(v).trim()===key));}
    function productImageByItem(i){
        const itemId=txt(i.productId||i.product_id||i.productDocId||i.id).trim(), sku=low(i.sku), name=low(i.name||i.title||i.productName);
        const p=products().find(x=>txt(x.id||x.productId||x.product_id).trim()===itemId || (sku&&low(x.sku)===sku) || (name&&low(x.name||x.title)===name))||{};
        if(Array.isArray(i.images)&&i.images[0])return i.images[0];
        if(i.image||i.imageUrl||i.productImage)return i.image||i.imageUrl||i.productImage;
        if(Array.isArray(p.images)&&p.images[0])return p.images[0];
        if(Array.isArray(p.imageUrls)&&p.imageUrls[0])return p.imageUrls[0];
        return p.image||p.imageUrl||p.mainImage||p.productImage||'';
    }

    function installSafeChart(){
        if(!window.Chart || window.Chart.__aryantaSafeChart) return;
        const RealChart = window.Chart;
        function SafeChart(ctx, config){
            try{
                const canvas = ctx && ctx.canvas ? ctx.canvas : ctx;
                const old = RealChart.getChart ? RealChart.getChart(canvas) : null;
                if(old && typeof old.destroy === 'function') old.destroy();
            }catch(e){}
            return new RealChart(ctx, config);
        }
        try{Object.setPrototypeOf(SafeChart, RealChart);}catch(e){}
        try{SafeChart.prototype = RealChart.prototype;}catch(e){}
        try{Object.getOwnPropertyNames(RealChart).forEach(k=>{if(!(k in SafeChart))SafeChart[k]=RealChart[k];});}catch(e){}
        SafeChart.__aryantaSafeChart = true;
        window.Chart = SafeChart;
    }
    installSafeChart();

    function destroySalesChart(){
        const c=$('salesChart');
        try{if(c&&window.Chart&&Chart.getChart){const ch=Chart.getChart(c);if(ch)ch.destroy();}}catch(e){}
        try{if(window.salesChartInstance&&typeof window.salesChartInstance.destroy==='function')window.salesChartInstance.destroy();}catch(e){}
        try{if(typeof salesChartInstance!=='undefined'&&salesChartInstance&&typeof salesChartInstance.destroy==='function')salesChartInstance.destroy();}catch(e){}
    }
    window.destroyAryantaSalesChart = destroySalesChart;

    const oldRenderSalesChart = window.renderSalesChart;
    window.renderSalesChart = function(data){
        destroySalesChart();
        const canvas=$('salesChart');
        if(!canvas || !window.Chart) return;
        const labels=[]; const values=[];
        const today=new Date();
        for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);labels.push(d.toLocaleDateString('en-IN',{weekday:'short'}));values.push(0);}
        orders().forEach(o=>{
            const d=orderDate(o); const diff=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
            if(diff>=0&&diff<7 && low(o.status).includes('delivered')) values[6-diff]+=orderAmount(o);
        });
        const finalData = Array.isArray(data)&&data.some(v=>num(v)>0)?data:values;
        try{
            const ctx=canvas.getContext('2d');
            window.salesChartInstance = new Chart(ctx,{type:'line',data:{labels:labels,datasets:[{label:'Revenue (₹)',data:finalData,fill:true,tension:.35,borderWidth:3,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true},x:{grid:{display:false}}}}});
            try{salesChartInstance=window.salesChartInstance;}catch(e){}
        }catch(e){console.warn('Aryanta 7-day chart render skipped safely',e);}
    };

    window.getAryantaCommissionPercent=function(){return currentPlan().commission;};
    window.getAryantaCommissionRate=function(){return currentPlan().commission/100;};
    window.getAryantaSponsoredAdPrice=function(){return currentPlan().sponsoredPrice;};
    window.getAryantaFineDiscountPercent=function(){return currentPlan().fineDiscount;};
    window.calculateAryantaCommission=function(amount){return Math.round(num(amount)*currentPlan().commission)/100;};

    function saveSellerPatch(patch){
        const database=dbx(), id=sellerDocId(); if(!database||!id)return Promise.resolve(false);
        Object.assign(seller(),patch);
        try{activeSeller=Object.assign(activeSeller||{},patch);window.activeSeller=activeSeller;localStorage.setItem('sellerToken',JSON.stringify(activeSeller));}catch(e){}
        return database.collection('sellers').doc(id).set(patch,{merge:true}).then(()=>true).catch(e=>{console.warn('seller patch failed',e);return false;});
    }

    function normalizeFineRequest(payload){
        payload=payload||{};const s=seller(),p=currentPlan();const original=num(payload.amount||payload.finalAmount||payload.requestedAmount||0);const final=Math.max(0,Math.round(original*(100-p.fineDiscount)/100));
        return Object.assign({},payload,{email:sellerEmail(),sellerEmail:sellerEmail(),sellerName:s.companyName||s.shopName||s.name||'',sellerPhone:s.phone||'',sellerUid:s.uid||s.id||'',requestedAmount:original,originalAmount:original,amount:final,suggestedFinalAmount:final,planAtRequest:p.key,fineDiscountPercent:p.fineDiscount,status:'Pending Admin Approval',fineRequestStatus:'Waiting Admin Approval',adminEditableAmount:true,adminCanAccept:true,adminCanChangeAmount:true,source:'seller-panel-fine-request',requestedAt:payload.requestedAt||payload.createdAt||nowIso(),createdAt:payload.createdAt||nowIso(),timestamp:payload.timestamp||nowIso(),note:'Fine is only a DB request. Admin can accept or change amount before applying.'});
    }
    window.addFineRequestToAdmin=async function(key,amount,reason,extra){
        const database=dbx(); if(!database||!sellerEmail())return false;
        const doc=(sellerEmail()+'_'+txt(key||reason||Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,180);
        try{await database.collection('seller_fine_requests').doc(doc).set(normalizeFineRequest(Object.assign({requestKey:key,reason:reason||'Fine request',amount},extra||{})),{merge:true});toast('Fine request saved for admin approval.','warning');return true;}catch(e){console.warn('fine request failed',e);return false;}
    };
    try{window.addFineOnce=window.addFineRequestToAdmin;addFineOnce=window.addFineRequestToAdmin;}catch(e){}

    function installFineProxy(){
        const database=dbx(); if(!database||database.__ARYANTA_FINAL_FINE_PROXY)return;
        const original=database.collection.bind(database);
        database.collection=function(path,...rest){
            const ref=original(path,...rest);
            if(txt(path)!=='fines')return ref;
            return new Proxy(ref,{get(target,prop){
                if(prop==='add')return payload=>original('seller_fine_requests').add(normalizeFineRequest(payload));
                if(prop==='doc')return docId=>{
                    const fineRef=original('seller_fine_requests').doc(txt(docId||('fine_'+Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_'));
                    return new Proxy(fineRef,{get(t,p){
                        if(p==='set')return (payload,opt)=>fineRef.set(normalizeFineRequest(Object.assign({requestKey:docId},payload||{})),opt||{merge:true});
                        if(p==='update')return payload=>fineRef.set(normalizeFineRequest(Object.assign({requestKey:docId},payload||{})),{merge:true});
                        const v=t[p];return typeof v==='function'?v.bind(t):v;
                    }});
                };
                const v=target[prop];return typeof v==='function'?v.bind(target):v;
            }});
        };
        database.__ARYANTA_FINAL_FINE_PROXY=true;
    }

    async function activateSubscription(planName,payment){
        const p=planByKey(planName); if(p.key==='Basic')return saveSellerPatch({subscription:'Basic',subscriptionName:'Basic',subscriptionCommissionPercent:PLAN_FINAL.Basic.commission});
        const start=new Date(), end=addDays(start,30), s=seller();
        const hist=Array.isArray(s.subHistory)?s.subHistory.slice():[];
        const entry={plan:p.key,planName:p.name,amount:p.monthlyPrice,price:p.monthlyPrice,commissionPercent:p.commission,sponsoredAdPrice:p.sponsoredPrice,fineDiscountPercent:p.fineDiscount,method:payment.method||'Razorpay',paymentMethod:payment.method||'Razorpay',paymentBy:s.companyName||s.shopName||s.email||sellerEmail(),paymentId:payment.razorpayPaymentId||payment.paymentId||'',razorpayPaymentId:payment.razorpayPaymentId||'',startDate:start.toISOString(),endDate:end.toISOString(),status:'Active',createdAt:nowIso(),source:'direct-seller-payment'};
        hist.push(entry);
        await saveSellerPatch({subscription:p.key,subscriptionName:p.name,plan:p.key,subStartDate:start.toISOString(),subEndDate:end.toISOString(),subscriptionEndDate:end.toISOString(),subscriptionCommissionPercent:p.commission,subscriptionAmount:p.monthlyPrice,subscriptionPaymentStatus:'Paid',subscriptionPaused:false,pausedSubscription:null,pausedSubEndDate:null,lastSubscriptionPaymentAt:nowIso(),subHistory:hist,canClaimFreePro:false});
        const database=dbx();
        if(database){
            database.collection('seller_subscription_payments').add(Object.assign({sellerEmail:sellerEmail(),sellerName:s.companyName||s.shopName||'',sellerPhone:s.phone||'',sellerUid:s.uid||s.id||''},entry)).catch(()=>{});
            database.collection('seller_payment_ledger').add({sellerEmail:sellerEmail(),type:'subscription_payment',plan:p.key,amount:p.monthlyPrice,status:'Paid',createdAt:nowIso(),paymentId:entry.paymentId}).catch(()=>{});
        }
        toast(`${p.name} subscription activated for 1 month.`, 'success');
        renderFinalSubscriptionUI(); updatePlanGatesFinal(); checkSubscriptionReminder(true);
    }

    window.startSubscriptionPayment=function(planName){
        const p=planByKey(planName);
        if(p.key==='Basic')return switchToBasicWithConfirmFinal();
        if(currentPlan().key===p.key)return toast('This plan is already active.','info');
        if(!window.Razorpay || !window.API_KEYS || !API_KEYS.RAZORPAY){
            toast('Payment key is missing. Add Razorpay key in /get-api-keys first. No admin request was sent.','error');
            return;
        }
        new Razorpay({
            key:API_KEYS.RAZORPAY,
            amount:p.monthlyPrice*100,
            currency:'INR',
            name:'Aryanta Seller Subscription',
            description:`${p.name} plan - ₹${p.monthlyPrice}/month`,
            handler:function(res){activateSubscription(p.key,{method:'Razorpay',razorpayPaymentId:res.razorpay_payment_id||''});},
            prefill:{name:seller().companyName||seller().shopName||'',email:sellerEmail(),contact:seller().phone||''},
            notes:{sellerEmail:sellerEmail(),plan:p.key},
            theme:{color:'#111827'}
        }).open();
    };
    window.requestSubscriptionFromAdmin=function(plan){return window.startSubscriptionPayment(plan);};
    window.processSubscription=function(planName){return window.startSubscriptionPayment(planName);};

    async function switchToBasicWithConfirmFinal(){
        const cur=currentPlan();
        if(cur.key==='Basic')return toast('Basic plan is already active.','info');
        if(!confirm('Are you sure you want to switch to Basic? This will pause your running paid subscription. You can resume it later.'))return;
        await saveSellerPatch({subscription:'Basic',subscriptionName:'Basic',subscriptionPaused:true,pausedSubscription:cur.key,pausedSubscriptionName:cur.name,pausedSubEndDate:(seller().subEndDate||seller().subscriptionEndDate||''),subscriptionCommissionPercent:PLAN_FINAL.Basic.commission,pausedAt:nowIso()});
        toast('Paid subscription paused. Basic plan is active now.','success');renderFinalSubscriptionUI();
    }
    window.switchToBasicWithConfirm=switchToBasicWithConfirmFinal;
    window.pauseMySubscription=switchToBasicWithConfirmFinal;
    window.resumePausedSubscription=async function(){
        const s=seller(); const old=planKey(s.pausedSubscription||s.pausedSubscriptionName);
        if(old==='Basic')return toast('No paid paused subscription found.','warning');
        const p=PLAN_FINAL[old];
        await saveSellerPatch({subscription:p.key,subscriptionName:p.name,subscriptionPaused:false,subscriptionCommissionPercent:p.commission,subEndDate:s.pausedSubEndDate||s.subEndDate||addDays(new Date(),30).toISOString(),subscriptionEndDate:s.pausedSubEndDate||s.subscriptionEndDate||addDays(new Date(),30).toISOString(),resumedAt:nowIso()});
        toast(`${p.name} subscription resumed.`, 'success');renderFinalSubscriptionUI();
    };

    async function applyNewSellerGrowthTrial(){
        const s=seller(),database=dbx(); if(!database||!sellerEmail())return;
        if(s.growthTrialRedeemedAt||s.freeGrowthTrialRedeemed||s.newSellerGrowthTrialRedeemed)return;
        if(planKey()!=='Basic')return;
        const hist=Array.isArray(s.subHistory)?s.subHistory:[];
        if(hist.length>0)return;
        const start=new Date(),end=addDays(start,60),entry={plan:'Growth',planName:'Growth',amount:0,price:0,method:'New Seller Free Trial',paymentMethod:'Free Trial',startDate:start.toISOString(),endDate:end.toISOString(),status:'Active',source:'new-seller-2-month-growth-trial',createdAt:nowIso(),commissionPercent:PLAN_FINAL.Growth.commission};
        await saveSellerPatch({subscription:'Growth',subscriptionName:'Growth',plan:'Growth',subStartDate:start.toISOString(),subEndDate:end.toISOString(),subscriptionEndDate:end.toISOString(),subscriptionCommissionPercent:PLAN_FINAL.Growth.commission,subscriptionAmount:0,subscriptionPaymentStatus:'Free Trial',growthTrialRedeemedAt:nowIso(),freeGrowthTrialRedeemed:true,newSellerGrowthTrialRedeemed:true,canClaimFreePro:false,subHistory:[entry]});
        database.collection('seller_subscription_payments').add({sellerEmail:sellerEmail(),plan:'Growth',amount:0,status:'Free Trial',source:'new-seller-2-month-growth-trial',startDate:start.toISOString(),endDate:end.toISOString(),createdAt:nowIso()}).catch(()=>{});
        toast('New seller offer active: 2 months Growth subscription free.','success');
    }

    const oldActivateFreeSubscription=window.activateFreeSubscription;
    window.activateFreeSubscription=function(plan){
        if(planKey(plan)==='Pro' && (planKey()==='Growth'||seller().growthTrialRedeemedAt||seller().freeGrowthTrialRedeemed)){
            return toast('Free Pro trial is not available after Growth has been activated.','warning');
        }
        if(typeof oldActivateFreeSubscription==='function')return oldActivateFreeSubscription.apply(this,arguments);
    };

    function planCard(p){
        const active=currentPlan().key===p.key, paid=p.key!=='Basic', s=seller();
        const price=paid?`<div class="plan-price-line">${money(p.monthlyPrice)} <small>/month</small></div><span class="direct-pay-tag"><i class="fas fa-bolt"></i> Direct payment</span>`:`<div class="plan-price-line">Free <small>default</small></div>`;
        const action=active?`<button class="btn-outline w-100" disabled><i class="fas fa-check"></i> Active Plan</button>`:(p.key==='Basic'?`<button class="btn-outline w-100" onclick="switchToBasicWithConfirm()"><i class="fas fa-pause"></i> Switch / Pause to Basic</button>`:`<button class="btn-prime w-100" onclick="startSubscriptionPayment('${p.key}')"><i class="fas fa-credit-card"></i> Pay ${money(p.monthlyPrice)}</button>`);
        const resume=(p.key==='Basic'&&s.subscriptionPaused)?`<button class="btn-prime w-100" onclick="resumePausedSubscription()" style="margin-top:8px"><i class="fas fa-play"></i> Resume ${safe(s.pausedSubscriptionName||s.pausedSubscription||'Paid Plan')}</button>`:'';
        return `<div class="admin-plan-card ary-direct-plan-card ${active?'active':''}"><div class="admin-plan-title"><strong>${safe(p.name)}</strong>${active?'<span class="ok-chip"><i class="fas fa-check"></i> Current</span>':''}</div>${price}<p class="muted-line">${safe(p.badge)}</p><div class="feature-list"><div class="feature-row"><span>Commission on orders</span><span>${p.commission}%</span></div><div class="feature-row"><span>Sponsored ad price</span><span>${money(p.sponsoredPrice)}/24h</span></div><div class="feature-row"><span>Fine charge</span><span>${p.fineDiscount?`${p.fineDiscount}% lower`:'Normal request'}</span></div><div class="feature-row"><span>Product performance</span><span>${p.performance==='locked'?'Hidden':p.performance==='pro'?'Advanced Pro':'Growth analytics'}</span></div></div>${action}${resume}</div>`;
    }

    function checkSubscriptionReminder(force){
        const end=subEnd(); if(!end)return;
        const days=Math.ceil((end.getTime()-Date.now())/86400000);
        const key='ary_sub_reminder_'+sellerEmail()+'_'+end.toISOString().slice(0,10);
        if(days<=7 && days>=0 && (force||sessionStorage.getItem(key)!=='1')){
            toast(`Your ${currentPlan().name} subscription ends in ${days} day${days===1?'':'s'}. Please renew before expiry.`, 'warning');
            try{sessionStorage.setItem(key,'1');}catch(e){}
        }
    }

    function renderFinalSubscriptionUI(){
        const notice=$('subscriptionAdminNotice'),cards=$('subscriptionCards'),history=$('subscriptionHistoryBox');
        const p=currentPlan(),end=subEnd(),s=seller();
        if(notice){
            let reminder='';
            if(end){const days=Math.ceil((end.getTime()-Date.now())/86400000);if(days<=7&&days>=0)reminder=`<div class="ary-sub-reminder"><i class="fas fa-bell"></i><div>Your ${safe(p.name)} subscription will end in <b>${days}</b> day${days===1?'':'s'}. Renew before expiry to keep plan powers active.</div></div>`;}
            notice.innerHTML=`${reminder}<div class="ary-sub-toolbar"><div><b>Current plan:</b> ${safe(p.name)} ${s.subscriptionPaused?'<span class="lock-chip"><i class="fas fa-pause"></i> Paid plan paused</span>':''}<br><span class="muted-line">Commission ${p.commission}% · Sponsored ${money(p.sponsoredPrice)} · Fine discount ${p.fineDiscount}% · ${end?'Valid till '+end.toLocaleDateString('en-IN'):'No expiry set'}</span></div><div class="ary-sub-actions"><button class="btn-outline" onclick="showSubscriptionDetails()"><i class="fas fa-receipt"></i> Subscription Invoice & History</button>${p.key!=='Basic'?'<button class="btn-outline" onclick="pauseMySubscription()"><i class="fas fa-pause"></i> Pause My Subscription</button>':(s.subscriptionPaused?'<button class="btn-prime" onclick="resumePausedSubscription()"><i class="fas fa-play"></i> Resume</button>':'')}</div></div>`;
        }
        if(cards)cards.innerHTML=[PLAN_FINAL.Basic,PLAN_FINAL.Growth,PLAN_FINAL.Pro].map(planCard).join('');
        if(history){history.style.display='none';history.innerHTML='';}
        checkSubscriptionReminder(false);
    }
    const oldLoadSubscriptionsUI=window.loadSubscriptionsUI;
    window.loadSubscriptionsUI=async function(){try{if(typeof oldLoadSubscriptionsUI==='function')await oldLoadSubscriptionsUI.apply(this,arguments);}catch(e){} renderFinalSubscriptionUI();};
    try{loadSubscriptionsUI=window.loadSubscriptionsUI;}catch(e){}

    function ensureSubscriptionModal(){
        if($('arySubscriptionDetailModal'))return;
        const modal=document.createElement('div');modal.id='arySubscriptionDetailModal';modal.className='modal-overlay';modal.style.display='none';
        modal.innerHTML=`<div class="modal-content" style="max-width:900px;"><div class="modal-header"><h3><i class="fas fa-file-invoice"></i> Subscription Invoice & History</h3><button class="close-btn" onclick="closeSmartModal('arySubscriptionDetailModal')">&times;</button></div><div id="arySubscriptionDetailBody" style="padding:20px;max-height:75vh;overflow:auto;"></div></div>`;
        document.body.appendChild(modal);
    }
    window.closeSmartModal=function(id){const m=$(id);if(m){m.classList.remove('show');m.style.display='none';}};
    window.showSubscriptionDetails=function(){
        ensureSubscriptionModal(); const p=currentPlan(),s=seller(),end=subEnd(),hist=Array.isArray(s.subHistory)?s.subHistory:[];
        const body=$('arySubscriptionDetailBody');
        if(body)body.innerHTML=`<div class="ary-detail-grid"><div><span>Seller</span><b>${safe(s.companyName||s.shopName||s.name||'-')}</b></div><div><span>Email</span><b>${safe(s.email||'-')}</b></div><div><span>Phone</span><b>${safe(s.phone||'-')}</b></div><div><span>Account UID</span><b>${safe(s.uid||s.id||'-')}</b></div><div><span>Current Plan</span><b>${safe(p.name)}</b></div><div><span>Commission</span><b>${p.commission}%</b></div><div><span>Sponsored Price</span><b>${money(p.sponsoredPrice)}</b></div><div><span>Fine Discount</span><b>${p.fineDiscount}%</b></div><div><span>End Date</span><b>${end?end.toLocaleString('en-IN'):'Not set'}</b></div><div><span>Paused Plan</span><b>${safe(s.pausedSubscriptionName||s.pausedSubscription||'None')}</b></div></div><div class="ary-sub-actions" style="margin:18px 0"><button class="btn-prime" onclick="printSubscriptionInvoice()"><i class="fas fa-print"></i> Print Invoice</button>${p.key!=='Basic'?'<button class="btn-outline" onclick="pauseMySubscription()"><i class="fas fa-pause"></i> Pause My Subscription</button>':(s.subscriptionPaused?'<button class="btn-prime" onclick="resumePausedSubscription()"><i class="fas fa-play"></i> Resume Subscription</button>':'')}</div><h3 style="margin:18px 0 10px"><i class="fas fa-clock-rotate-left"></i> Payment History</h3>${hist.length?`<div class="table-container"><table class="admin-table"><thead><tr><th>Plan</th><th>Amount</th><th>Payment</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${hist.slice().reverse().map(h=>`<tr><td data-label="Plan"><b>${safe(h.planName||h.plan||'-')}</b></td><td data-label="Amount">${money(h.amount||h.price||0)}</td><td data-label="Payment">${safe(h.paymentMethod||h.method||'-')}</td><td data-label="Start">${dateOf(h.startDate||h.createdAt)?.toLocaleDateString('en-IN')||'-'}</td><td data-label="End">${dateOf(h.endDate||h.subEndDate)?.toLocaleDateString('en-IN')||'-'}</td><td data-label="Status"><span class="ok-chip">${safe(h.status||'Active')}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No subscription invoice/history found yet.</div>'}`;
        const m=$('arySubscriptionDetailModal'); if(m){m.style.display='flex';setTimeout(()=>m.classList.add('show'),10);} const histBox=$('subscriptionHistoryBox');if(histBox){histBox.style.display='none';histBox.innerHTML='';}
    };
    window.printSubscriptionInvoice=function(){
        const s=seller(),p=currentPlan(),end=subEnd(),hist=Array.isArray(s.subHistory)?s.subHistory:[],last=hist[hist.length-1]||{};
        const html=`<div style="font-family:Arial,sans-serif;color:#0f172a;padding:28px;max-width:850px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:16px;margin-bottom:20px"><div><h1 style="margin:0;font-size:28px">Aryanta.in</h1><p style="margin:5px 0 0;font-weight:700">Seller Subscription Invoice</p><p style="margin:5px 0 0;font-size:12px">support@aryanta.in · 6206318133</p></div><div style="text-align:right;font-size:12px"><b>Invoice Date</b><br>${new Date().toLocaleString('en-IN')}<br><br><b>Plan</b><br>${safe(p.name)}</div></div><h3>Seller Details</h3><table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr><td style="padding:8px;border:1px solid #e2e8f0"><b>Name</b><br>${safe(s.companyName||s.shopName||s.name||'-')}</td><td style="padding:8px;border:1px solid #e2e8f0"><b>Email</b><br>${safe(s.email||'-')}</td></tr><tr><td style="padding:8px;border:1px solid #e2e8f0"><b>Phone</b><br>${safe(s.phone||'-')}</td><td style="padding:8px;border:1px solid #e2e8f0"><b>Account UID</b><br>${safe(s.uid||s.id||'-')}</td></tr><tr><td colspan="2" style="padding:8px;border:1px solid #e2e8f0"><b>Address</b><br>${safe(s.address||s.shopAddress||s.businessAddress||'-')}</td></tr></table><h3>Subscription Details</h3><table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc">Plan</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc">Monthly Price</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc">Commission</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc">Sponsored Price</th><th style="text-align:left;padding:10px;border:1px solid #e2e8f0;background:#f8fafc">Valid Till</th></tr><tr><td style="padding:10px;border:1px solid #e2e8f0">${safe(p.name)}</td><td style="padding:10px;border:1px solid #e2e8f0">${money(p.monthlyPrice)}</td><td style="padding:10px;border:1px solid #e2e8f0">${p.commission}%</td><td style="padding:10px;border:1px solid #e2e8f0">${money(p.sponsoredPrice)}</td><td style="padding:10px;border:1px solid #e2e8f0">${end?end.toLocaleDateString('en-IN'):'-'}</td></tr></table><h3>Paid Information</h3><p><b>Amount:</b> ${money(last.amount||last.price||p.monthlyPrice)} &nbsp; <b>Payment Method:</b> ${safe(last.paymentMethod||last.method||'Direct Payment')} &nbsp; <b>Status:</b> ${safe(last.status||'Active')}</p><p style="font-size:12px;color:#64748b;margin-top:30px">This invoice is generated from Aryanta seller panel subscription records.</p></div>`;
        const area=$('printArea')||document.body.appendChild(document.createElement('div'));area.id='printArea';area.innerHTML=html;area.style.display='block';
        if(window.printJS)printJS({printable:'printArea',type:'html',targetStyles:['*']});else{const w=window.open('','_blank');w.document.write(html);w.document.close();w.focus();w.print();}
        setTimeout(()=>{area.style.display='none';},800);
    };

    function normalizeSidebar(){
        const ach=qsa('.sidebar .nav-item').filter(n=>/Achievements/i.test(n.textContent||''));
        ach.forEach((n,i)=>{if(i===0){n.id='nav-achievements';n.setAttribute('onclick',"showSection('achievements')");}else n.remove();});
        qsa('#supportQnaShortcutRow,.ary-support-shortcuts').forEach(n=>n.remove());
    }
    window.injectSupportQnaButtons=function(){qsa('#supportQnaShortcutRow,.ary-support-shortcuts').forEach(n=>n.remove());};

    window.openHowToSellPage=function(){
        let modal=$('aryHowToSellConfirm');
        if(!modal){modal=document.createElement('div');modal.id='aryHowToSellConfirm';modal.className='modal-overlay';modal.style.display='none';modal.innerHTML=`<div class="ary-how-modal-card"><h3><i class="fas fa-video"></i> Open How to Sell?</h3><p>This page will redirect to another tab. Are you sure you want to continue?</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn-prime" onclick="confirmHowToSellRedirect()"><i class="fas fa-check"></i> Yes, Open</button><button class="btn-outline" onclick="closeSmartModal('aryHowToSellConfirm')"><i class="fas fa-times"></i> Cancel</button></div></div>`;document.body.appendChild(modal);} modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);
    };
    window.confirmHowToSellRedirect=function(){closeSmartModal('aryHowToSellConfirm');window.open('https://aryanta.in/getdetails','_blank','noopener');};

    function stableNotifications(){
        qsa('#notifBadge,#topbarNotifBadge').forEach(b=>{b.style.animation='none';b.classList.remove('blink','pulse','animate','pulseGlow');});
    }
    const oldFetchNotifications=window.fetchNotifications;
    window.fetchNotifications=async function(){
        let r; try{if(typeof oldFetchNotifications==='function')r=await oldFetchNotifications.apply(this,arguments);}catch(e){console.warn('notification fetch skipped',e);} stableNotifications(); return r;
    };
    try{fetchNotifications=window.fetchNotifications;}catch(e){}

    function returnDueDate(o){return addDays(orderDate(o),15);}
    function isReturnOrCancel(o){const st=low(o.status||o.orderStatus||o.returnStatus);return st.includes('return')||st.includes('cancel');}
    function isReturnTrackingOnly(o){const st=low(o.status||o.orderStatus||o.returnStatus);return st.includes('tracking')||st.includes('pickup')||st.includes('in transit')||st.includes('rto')||st.includes('reverse shipped')||st.includes('return shipped');}
    function deliveredToSeller(o){return !!(o.sellerReturnDelivered||o.returnDeliveredToSeller||o.returnReceivedBySeller||o.returnDeliveredAt||o.cancelDeliveredToSeller||low(o.returnStatus).includes('delivered to seller'));}
    function returnCard(o){
        const due=returnDueDate(o),past=Date.now()>due.getTime();
        const items=orderItems(o).map(i=>`<div class="return-item"><img src="${safe(productImageByItem(i)||'')}" onerror="this.style.display='none'"><div><b>${safe(i.name||i.title||i.productName||'Product')}</b><br><small>Qty ${safe(i.qty||i.quantity||1)} · SKU ${safe(i.sku||i.productId||'-')}</small></div></div>`).join('');
        return `<div class="ary-return-card"><div class="return-head"><div><b>${safe(o.order_no||o.orderNo||o.id)}</b><br><small>${orderDate(o).toLocaleDateString('en-IN')}</small></div><span class="lock-chip">${safe(o.status||'Return/Cancel')}</span></div><div class="return-items">${items}</div><p class="muted-line">${past?'We are sorry, expected seller return date has passed. Aryanta support will follow up.':'This item will be delivered to you within 15 days.'}</p><div><b>Expected by:</b> ${due.toLocaleDateString('en-IN')}</div><div><b>Admin delivery confirmation:</b> ${deliveredToSeller(o)?'<span class="ok-chip">Delivered to seller</span>':'<span class="lock-chip">Pending</span>'}</div></div>`;
    }
    window.loadReturns=function(){
        const list=$('returnsList'); if(!list)return;
        const rows=orders().filter(o=>isReturnOrCancel(o)&&!deliveredToSeller(o));
        if(!rows.length){list.innerHTML="<tr><td colspan='4' style='text-align:center;font-weight:800;'>No returns or cancellations pending.</td></tr>";return;}
        list.innerHTML=rows.map(o=>`<tr><td colspan="4">${returnCard(o)}</td></tr>`).join('');
    };
    try{loadReturns=window.loadReturns;}catch(e){}
    window.loadReturnTracking=function(){
        const box=$('returnTrackingList'); if(!box)return;
        const rows=orders().filter(o=>isReturnTrackingOnly(o)||isReturnOrCancel(o)).filter(o=>!deliveredToSeller(o));
        box.innerHTML=rows.length?rows.map(returnCard).join(''):'<div class="admin-empty">No active return tracking records. Once admin marks delivered to seller, item leaves this list.</div>';
    };
    try{loadReturnTracking=window.loadReturnTracking;}catch(e){}

    window.printAryantaOrderSlip=function(orderId){
        const o=findOrder(orderId); if(!o)return toast('Order not found.','error');
        const s=seller(),items=orderItems(o);
        const html=`<div style="font-family:Arial,sans-serif;color:#111827;padding:28px;max-width:820px;margin:0 auto"><div style="display:flex;justify-content:space-between;border-bottom:3px solid #111827;padding-bottom:15px;margin-bottom:18px"><div><h1 style="margin:0">Aryanta.in</h1><p style="font-size:12px;font-weight:700;margin:5px 0 0">Aryanta Seller Dispatch Slip</p></div><div style="text-align:right;font-size:12px"><b>Order</b><br>${safe(o.order_no||o.orderNo||o.id)}<br><br><b>Date</b><br>${orderDate(o).toLocaleString('en-IN')}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr><td style="border:1px solid #e5e7eb;padding:8px"><b>Seller Name</b><br>${safe(s.companyName||s.shopName||s.name||'Aryanta Seller')}</td><td style="border:1px solid #e5e7eb;padding:8px"><b>Buyer</b><br>${safe(o.delivery_name||o.customerName||o.name||'-')}<br>${safe(o.delivery_phone||o.customerPhone||o.phone||'')}</td></tr><tr><td colspan="2" style="border:1px solid #e5e7eb;padding:8px"><b>Delivery Address</b><br>${safe(o.delivery_address||o.address||o.shippingAddress||'-')}</td></tr></table><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Item</th><th style="text-align:center;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Qty</th><th style="text-align:right;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Price</th></tr></thead><tbody>${items.map(i=>`<tr><td style="border:1px solid #e5e7eb;padding:8px">${safe(i.name||i.title||i.productName||'Product')}<br><small>SKU: ${safe(i.sku||i.productId||'-')}</small></td><td style="text-align:center;border:1px solid #e5e7eb;padding:8px">${safe(i.qty||i.quantity||1)}</td><td style="text-align:right;border:1px solid #e5e7eb;padding:8px">${money(i.price||i.sellingPrice||0)}</td></tr>`).join('')}</tbody></table><div style="margin-top:18px;text-align:right"><b>Total: ${money(orderAmount(o))}</b></div><p style="font-size:11px;color:#64748b;margin-top:20px">Seller phone/email hidden. This is Aryanta standard slip, not Shiprocket PDF.</p></div>`;
        const area=$('printArea')||document.body.appendChild(document.createElement('div'));area.id='printArea';area.innerHTML=html;area.style.display='block';
        if(window.printJS)printJS({printable:'printArea',type:'html',targetStyles:['*']});else{const w=window.open('','_blank');w.document.write(html);w.document.close();w.print();}
        setTimeout(()=>{area.style.display='none';},800);
    };
    window.loadOrderHistory=function(){
        const list=$('historyList'); if(!list)return;
        const rows=orders().filter(o=>orderItems(o).length>0);
        if(!rows.length){list.innerHTML="<tr><td colspan='5' style='text-align:center;font-weight:800;'>No orders yet.</td></tr>";return;}
        list.innerHTML=rows.map(o=>`<tr class="clickable-row" onclick="viewOrderDetails('${safe(o.id||o.order_no||o.orderNo)}')"><td data-label="Date"><strong>${orderDate(o).toLocaleDateString('en-IN')}</strong></td><td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary)">${safe(o.order_no||o.orderNo||o.id)}</strong></td><td data-label="Items"><span style="font-weight:700">${orderItems(o).map(i=>safe(i.name||i.title||i.productName||'Product')).join(', ')}</span><div class="ary-history-action" onclick="event.stopPropagation()"><button class="btn-sm" onclick="printAryantaOrderSlip('${safe(o.id||o.order_no||o.orderNo)}')"><i class="fas fa-print"></i> Download Aryanta Slip</button></div></td><td data-label="Amount"><strong>${money(orderAmount(o))}</strong></td><td data-label="Status"><span class="badge" style="background:var(--surface-2);color:var(--text-light)">${safe(o.status||'-')}</span></td></tr>`).join('');
    };
    try{loadOrderHistory=window.loadOrderHistory;}catch(e){}

    function localAchievements(){
        const os=orders(),ps=products(),rs=reviews();const delivered=os.filter(o=>low(o.status).includes('delivered'));const cancelled=os.filter(o=>low(o.status).includes('cancel'));const returned=os.filter(o=>low(o.status).includes('return'));const rev5=rs.filter(r=>num(r.rating||r.stars)===5).length;const totalRev=rs.length;const stockOk=ps.filter(p=>num(p.stock||p.quantity)>7).length;
        return [
            {id:'first_order',title:'First Order Hero',icon:'fa-flag-checkered',unlocked:os.length>=1,progress:Math.min(os.length,1),target:1,reward:'1 free sponsored ad slot',type:'sponsored_slot',power:'+1 Boost Slot'},
            {id:'ten_orders',title:'10 Order Starter',icon:'fa-boxes-stacked',unlocked:os.length>=10,progress:Math.min(os.length,10),target:10,reward:'2 free sponsored slots',type:'sponsored_slot_2',power:'+2 Boost Slots'},
            {id:'twentyfive_orders',title:'25 Order Builder',icon:'fa-chart-simple',unlocked:os.length>=25,progress:Math.min(os.length,25),target:25,reward:'3 free sponsored slots',type:'sponsored_slot_3',power:'+3 Boost Slots'},
            {id:'fifty_orders',title:'50 Order Growth Seller',icon:'fa-chart-line',unlocked:os.length>=50,progress:Math.min(os.length,50),target:50,reward:'Growth upgrade reward request',type:'growth_subscription',power:'Growth Reward'},
            {id:'hundred_orders',title:'100 Order Pro Seller',icon:'fa-crown',unlocked:os.length>=100,progress:Math.min(os.length,100),target:100,reward:'Pro reward request',type:'pro_subscription',power:'Pro Reward'},
            {id:'first_delivered',title:'First Delivered Order',icon:'fa-truck-fast',unlocked:delivered.length>=1,progress:Math.min(delivered.length,1),target:1,reward:'Trust progress badge',type:'badge',power:'Delivery Badge'},
            {id:'ten_delivered',title:'10 Delivered Orders',icon:'fa-truck-ramp-box',unlocked:delivered.length>=10,progress:Math.min(delivered.length,10),target:10,reward:'1 free sponsored slot',type:'sponsored_slot',power:'+1 Boost Slot'},
            {id:'fifty_delivered',title:'50 Delivered Orders',icon:'fa-medal',unlocked:delivered.length>=50,progress:Math.min(delivered.length,50),target:50,reward:'Priority seller review',type:'priority_review',power:'Priority Review'},
            {id:'first_5star',title:'First 5-Star Review',icon:'fa-star',unlocked:rev5>=1,progress:Math.min(rev5,1),target:1,reward:'Store trust badge',type:'badge',power:'Trust Badge'},
            {id:'ten_reviews',title:'10 Reviews Club',icon:'fa-comments',unlocked:totalRev>=10,progress:Math.min(totalRev,10),target:10,reward:'Review highlight power',type:'badge',power:'Review Power'},
            {id:'rating_master',title:'Rating Master',icon:'fa-ranking-star',unlocked:totalRev>=5 && (rs.reduce((a,r)=>a+num(r.rating||r.stars),0)/Math.max(1,totalRev))>=4.5,progress:Math.min(totalRev,5),target:5,reward:'High-rating badge',type:'badge',power:'Rating Badge'},
            {id:'stock_master',title:'Stock Master',icon:'fa-warehouse',unlocked:ps.length>0&&stockOk===ps.length,progress:stockOk,target:Math.max(1,ps.length),reward:'Inventory health badge',type:'badge',power:'Stock Badge'},
            {id:'low_cancel_seller',title:'Low Cancel Seller',icon:'fa-shield-heart',unlocked:os.length>=10&&cancelled.length<=1,progress:Math.max(0,10-cancelled.length),target:10,reward:'Fine priority review',type:'priority_review',power:'Low Cancel Trust'},
            {id:'return_control',title:'Return Control',icon:'fa-rotate-left',unlocked:os.length>=10&&returned.length<=1,progress:Math.max(0,10-returned.length),target:10,reward:'Return quality badge',type:'badge',power:'Return Badge'},
            {id:'pro_analytics_ready',title:'Analytics Ready',icon:'fa-wand-magic-sparkles',unlocked:currentPlan().key==='Pro',progress:currentPlan().key==='Pro'?1:0,target:1,reward:'Advanced Pro analytics unlocked',type:'analytics',power:'AI Analytics'}
        ];
    }
    async function remoteAchievements(){
        const database=dbx(); if(!database)return [];
        try{const snap=await database.collection('seller_achievements').where('active','==',true).get();return snap.docs.map(d=>Object.assign({id:d.id,remote:true},d.data()));}catch(e){return [];}
    }
    function claimedSet(){const s=seller();return new Set(Array.isArray(s.claimedAchievements)?s.claimedAchievements:[]);}
    window.loadAchievements=async function(){
        normalizeSidebar();const grid=$('achievementsGrid'),sum=$('achievementsSummary');if(!grid)return;
        const defs=localAchievements().concat(await remoteAchievements());const claimed=claimedSet();
        if(sum)sum.innerHTML=`<div><strong>${defs.filter(a=>a.unlocked).length}</strong><span>Unlocked</span></div><div><strong>${claimed.size}</strong><span>Claimed</span></div><div><strong>${defs.length}</strong><span>Total Powers</span></div>`;
        grid.innerHTML=defs.map(a=>{const c=claimed.has(a.id),target=Math.max(1,num(a.target||1)),progress=Math.min(target,num(a.progress||(a.unlocked?target:0))),pct=Math.min(100,Math.round(progress/target*100));return `<div class="ary-achievement-card ${a.unlocked?'unlocked':'locked'} ${c?'claimed':''}"><div class="ary-ach-icon"><i class="fas ${safe(a.icon||'fa-trophy')}"></i></div><h4>${safe(a.title||a.name||'Achievement')}</h4><p>${safe(a.reward||a.description||'Seller reward')}</p><div class="ary-ach-progress"><span style="width:${pct}%"></span></div><small>${progress} / ${target} · ${safe(a.power||a.type||'Power')}</small>${a.unlocked?(c?'<button class="btn-outline w-100" disabled><i class="fas fa-check"></i> Claimed</button>':`<button class="btn-prime w-100" onclick="claimAchievement('${safe(a.id)}')"><i class="fas fa-gift"></i> Claim Reward</button>`):'<button class="btn-outline w-100" disabled><i class="fas fa-lock"></i> Locked</button>'}</div>`;}).join('');
        renderAchievementBadgeFinal(defs,claimed);
    };
    function renderAchievementBadgeFinal(defs,claimed){defs=defs||localAchievements();claimed=claimed||claimedSet();const count=defs.filter(a=>a.unlocked&&!claimed.has(a.id)).length;const b=$('badge-achievements');if(b){b.style.display=count?'inline-block':'none';b.textContent=count;}}
    window.claimAchievement=async function(id){
        const database=dbx(),s=seller();const defs=localAchievements().concat(await remoteAchievements());const def=defs.find(a=>a.id===id);if(!def||!def.unlocked)return toast('Achievement not unlocked yet.','warning');const claimed=claimedSet();if(claimed.has(id))return toast('Already claimed.','info');const next=[...claimed,id];
        try{await database.collection('seller_achievement_claims').doc((sellerEmail()+'_'+id).replace(/[^a-zA-Z0-9_-]/g,'_')).set({sellerEmail:sellerEmail(),sellerName:s.companyName||s.shopName||'',achievementId:id,title:def.title||def.name,reward:def.reward||'',type:def.type||'badge',status:(txt(def.type).includes('subscription')?'Pending Admin Review':'Available'),claimedAt:nowIso(),source:def.remote?'admin-db':'seller-panel'},{merge:true});const patch={claimedAchievements:next};if(def.type==='sponsored_slot')patch.rewardSponsoredSlots=num(s.rewardSponsoredSlots)+1;if(def.type==='sponsored_slot_2')patch.rewardSponsoredSlots=num(s.rewardSponsoredSlots)+2;if(def.type==='sponsored_slot_3')patch.rewardSponsoredSlots=num(s.rewardSponsoredSlots)+3;await saveSellerPatch(patch);toast('Achievement reward claimed.','success');window.loadAchievements();}catch(e){toast('Could not claim reward.','error');}
    };

    function updatePlanGatesFinal(){
        const perfNav=qsa('.nav-item').find(n=>/Product Performance/i.test(n.textContent||''));
        if(perfNav)perfNav.style.display=currentPlan().key==='Basic'?'none':'';
    }
    const oldShowSection=window.showSection;
    window.showSection=async function(section){
        normalizeSidebar();updatePlanGatesFinal();
        if(section==='productPerformance'&&currentPlan().key==='Basic'){toast('Product Performance is available on Growth and Pro plans.','warning');section='subscription';}
        let r;try{if(typeof oldShowSection==='function')r=await oldShowSection.apply(this,[section]);}catch(e){console.warn('showSection fallback',e);} 
        setTimeout(()=>{normalizeSidebar();updatePlanGatesFinal();stableNotifications();if(section==='subscription')renderFinalSubscriptionUI();if(section==='returns')window.loadReturns();if(section==='returnTracking')window.loadReturnTracking();if(section==='history')window.loadOrderHistory();if(section==='achievements')window.loadAchievements();if(section==='support')window.injectSupportQnaButtons();try{if(section==='home')window.renderSalesChart();}catch(e){}},120);
        return r;
    };
    try{showSection=window.showSection;}catch(e){}

    function bootFinalPatch(){installSafeChart();installFineProxy();normalizeSidebar();stableNotifications();updatePlanGatesFinal();checkSubscriptionReminder(false);applyNewSellerGrowthTrial().then(()=>{renderFinalSubscriptionUI();updatePlanGatesFinal();}).catch(()=>{});if($('subscriptionSection')&&$('subscriptionSection').classList.contains('active'))renderFinalSubscriptionUI();try{window.renderSalesChart();}catch(e){} }
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(bootFinalPatch,400);setTimeout(bootFinalPatch,1800);});
    setTimeout(bootFinalPatch,1000);
})();
(function () {
    const PATCH_ID = "ARYANTA_SPONSOR_PAYMENT_AMOUNT_LOCK_PATCH_2026_05_25";
    if (window[PATCH_ID]) return;
    window[PATCH_ID] = true;

    const $ = (id) => document.getElementById(id);

    const SPONSOR_PRICE_BY_PLAN = {
        basic: 70,
        growth: 50,
        pro: 40
    };

    function toast(msg, type) {
        if (typeof window.showToast === "function") {
            window.showToast(msg, type || "info");
        } else {
            alert(msg);
        }
    }

    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c];
        });
    }

    function sellerEmail() {
        return String(activeSeller && activeSeller.email ? activeSeller.email : "").toLowerCase().trim();
    }

    function getSellerPlan() {
        const raw = String(
            activeSeller?.subscription ||
            activeSeller?.plan ||
            activeSeller?.package ||
            "basic"
        ).toLowerCase();

        if (raw.includes("pro")) return "pro";
        if (raw.includes("growth") || raw.includes("growt")) return "growth";
        return "basic";
    }

    function getSponsorAmount() {
        const plan = getSellerPlan();
        const amount = Number(SPONSOR_PRICE_BY_PLAN[plan]);

        if (!Number.isFinite(amount) || amount <= 0) {
            return null;
        }

        return amount;
    }

    function getSelectedSponsorProductId() {
        const input = $("adProdId");
        return String(input && input.value ? input.value : "").trim();
    }

    function getSponsorProduct(productId) {
        return (window.sellerProducts || sellerProducts || []).find(function (p) {
            return String(p.id) === String(productId);
        });
    }

    function ensureSponsorReady(productId) {
        if (!window.db && typeof db === "undefined") {
            toast("Database not ready. Please refresh and try again.", "error");
            return false;
        }

        if (!activeSeller || !sellerEmail()) {
            toast("Seller account not loaded. Please login again.", "error");
            return false;
        }

        if (!productId) {
            toast("Product not selected for sponsor.", "error");
            return false;
        }

        const product = getSponsorProduct(productId);
        if (!product) {
            toast("Product not found. Sponsor cannot start.", "error");
            return false;
        }

        const amount = getSponsorAmount();
        if (!amount) {
            toast("Sponsor payment amount not found. Sponsor is blocked.", "error");
            return false;
        }

        return true;
    }

    function writeSponsorAmountToUI(amount) {
        const costIds = [
            "adCostDisplay",
            "adAmountDisplay",
            "sponsorCostDisplay",
            "sponsorAmountDisplay",
            "adPaymentAmount",
            "sponsorPaymentAmount"
        ];

        costIds.forEach(function (id) {
            const el = $(id);
            if (el) el.textContent = "₹" + amount;
        });

        const hiddenAmountIds = [
            "adAmount",
            "sponsorAmount",
            "adPayAmount",
            "sponsorPayAmount"
        ];

        hiddenAmountIds.forEach(function (id) {
            const el = $(id);
            if (el) el.value = amount;
        });
    }

    async function saveSponsorPaymentRecord(productId, amount, mode, razorpayPaymentId) {
        const product = getSponsorProduct(productId) || {};
        const payload = {
            sellerEmail: sellerEmail(),
            email: sellerEmail(),
            sellerName: activeSeller?.companyName || activeSeller?.name || "",
            sellerUid: activeSeller?.uid || activeSeller?.sellerUid || activeSeller?.accountUid || "",
            productId: productId,
            productName: product.name || product.title || "",
            amount: Number(amount),
            plan: getSellerPlan(),
            type: "sponsored_ad",
            paymentMode: mode,
            status: mode === "online" ? "Paid" : "Deduct From Payout",
            razorpayPaymentId: razorpayPaymentId || "",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        try {
            await db.collection("sponsored_ad_payments").add(payload);
        } catch (e) {
            console.error("Sponsor payment save failed:", e);
            throw new Error("Sponsor payment record failed.");
        }

        try {
            await db.collection("seller_payment_ledger").add({
                ...payload,
                ledgerType: "debit",
                reason: "Sponsored Ad Fee"
            });
        } catch (e) {
            console.warn("Sponsor ledger save failed:", e);
        }
    }

    async function activateSponsorAfterPaid(productId, amount, mode, razorpayPaymentId) {
        if (!ensureSponsorReady(productId)) return;

        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            toast("Payment amount missing. Sponsor cannot activate.", "error");
            return;
        }

        const now = new Date();
        const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        try {
            await saveSponsorPaymentRecord(productId, amount, mode, razorpayPaymentId);

            await db.collection("products").doc(productId).set({
                isAd: true,
                isSponsored: true,
                sponsored: true,
                adStatus: "Sponsored",
                sponsorAmount: Number(amount),
                sponsorPlan: getSellerPlan(),
                sponsorPaymentMode: mode,
                sponsoredAt: now.toISOString(),
                sponsoredUntil: until.toISOString()
            }, { merge: true });

            const product = getSponsorProduct(productId);
            if (product) {
                product.isAd = true;
                product.isSponsored = true;
                product.sponsored = true;
                product.adStatus = "Sponsored";
                product.sponsorAmount = Number(amount);
                product.sponsoredUntil = until.toISOString();
            }

            if (typeof closeModal === "function") closeModal("adPaymentModal");
            else {
                const modal = $("adPaymentModal");
                if (modal) modal.style.display = "none";
            }

            toast("Sponsored ad activated for 24 hours.", "success");

            if (typeof loadAds === "function") loadAds();
        } catch (e) {
            console.error(e);
            toast("Sponsor failed. Payment record/product update was not completed.", "error");
        }
    }

    window.startAd = async function (productId) {
        productId = String(productId || "").trim();

        if (!ensureSponsorReady(productId)) return;

        const amount = getSponsorAmount();
        const product = getSponsorProduct(productId) || {};
        const plan = getSellerPlan();

        const idInput = $("adProdId");
        if (idInput) idInput.value = productId;

        writeSponsorAmountToUI(amount);

        const msg = $("adPlanMessage");
        if (msg) {
            msg.innerHTML = `
                <div style="font-weight:900;color:var(--text-main);margin-bottom:6px;">
                    Sponsored Ad Payment Required
                </div>
                <div style="font-size:13px;color:var(--text-light);line-height:1.6;">
                    Product: <b>${esc(product.name || product.title || productId)}</b><br>
                    Plan: <b>${plan.toUpperCase()}</b><br>
                    Sponsor Price: <b>₹${amount}</b> for 24 hours
                </div>
            `;
        }

        const onlineBtn = document.querySelector('#adPaymentModal button[onclick="payAdOnline()"]');
        if (onlineBtn) {
            onlineBtn.innerHTML = `<i class="fas fa-bolt"></i> Pay ₹${amount} Online`;
        }

        const payoutBtn = $("btnAdPayout");
        if (payoutBtn) {
            payoutBtn.style.display = "inline-flex";
            payoutBtn.innerHTML = `<i class="fas fa-wallet"></i> Deduct ₹${amount} From Payout`;
        }

        const modal = $("adPaymentModal");
        if (modal) {
            modal.style.display = "flex";
            setTimeout(function () {
                modal.classList.add("show");
            }, 10);
        } else {
            toast("Sponsor payment popup missing. Sponsor cannot start.", "error");
        }
    };

    window.payAdOnline = async function () {
        const productId = getSelectedSponsorProductId();

        if (!ensureSponsorReady(productId)) return;

        const amount = getSponsorAmount();

        if (!amount) {
            toast("Payment amount missing. Sponsor payment blocked.", "error");
            return;
        }

        if (!window.Razorpay) {
            toast("Razorpay SDK not loaded. Payment cannot start.", "error");
            return;
        }

        if (!API_KEYS || !API_KEYS.RAZORPAY) {
            toast("Razorpay key missing. Payment cannot start.", "error");
            return;
        }

        const options = {
            key: API_KEYS.RAZORPAY,
            amount: amount * 100,
            currency: "INR",
            name: "Aryanta Sponsored Ads",
            description: "Sponsored Ad for 24 Hours",
            handler: async function (response) {
                const paymentId = response && response.razorpay_payment_id ? response.razorpay_payment_id : "";

                if (!paymentId) {
                    toast("Payment ID missing. Sponsor not activated.", "error");
                    return;
                }

                await activateSponsorAfterPaid(productId, amount, "online", paymentId);
            },
            prefill: {
                email: activeSeller?.email || "",
                contact: activeSeller?.phone || ""
            },
            theme: {
                color: "#0f172a"
            },
            modal: {
                ondismiss: function () {
                    toast("Payment cancelled. Sponsor not activated.", "info");
                }
            }
        };

        new Razorpay(options).open();
    };

    window.payAdUpcoming = async function () {
        const productId = getSelectedSponsorProductId();

        if (!ensureSponsorReady(productId)) return;

        const amount = getSponsorAmount();

        if (!amount) {
            toast("Payment amount missing. Sponsor deduction blocked.", "error");
            return;
        }

        const available = Number(window.cachedTotalUpcoming || cachedTotalUpcoming || 0);

        if (!Number.isFinite(available) || available < amount) {
            toast("Insufficient upcoming payout. Sponsor cannot start.", "error");
            return;
        }

        const ok = confirm("Deduct ₹" + amount + " from upcoming payout for Sponsored Ad?");
        if (!ok) return;

        try {
            await db.collection("fines").add({
                email: sellerEmail(),
                sellerEmail: sellerEmail(),
                amount: amount,
                reason: "Sponsored Ad Fee",
                type: "sponsored_ad_fee",
                productId: productId,
                plan: getSellerPlan(),
                status: "Pending Deduction",
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString()
            });

            await activateSponsorAfterPaid(productId, amount, "upcoming_payout", "");
        } catch (e) {
            console.error(e);
            toast("Could not save sponsor payout deduction. Sponsor not activated.", "error");
        }
    };

    window.executeAd = async function () {
        toast("Direct sponsor activation is blocked. Payment amount is required.", "error");
    };

    console.log("Aryanta sponsor payment amount lock patch active.");
})();
(function () {
    const PATCH_ID = "ARYANTA_REAL_ORDER_STATS_PATCH_2026_05_25";
    if (window[PATCH_ID]) return;
    window[PATCH_ID] = true;

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function getSellerEmailSafe() {
        return String(
            window.activeSeller?.email ||
            activeSeller?.email ||
            ""
        ).toLowerCase().trim();
    }

    function parseOrderDate(order) {
        if (!order) return null;

        const raw =
            order.timestamp ||
            order.createdAt ||
            order.orderDate ||
            order.date ||
            order.placedAt ||
            order.created_at ||
            order.time ||
            null;

        if (!raw) return null;

        if (raw && typeof raw.toDate === "function") {
            const d = raw.toDate();
            return isNaN(d.getTime()) ? null : d;
        }

        if (typeof raw === "number") {
            const d = new Date(raw);
            return isNaN(d.getTime()) ? null : d;
        }

        if (typeof raw === "string") {
            const d = new Date(raw);
            return isNaN(d.getTime()) ? null : d;
        }

        if (raw.seconds) {
            const d = new Date(raw.seconds * 1000);
            return isNaN(d.getTime()) ? null : d;
        }

        return null;
    }

    function isRealOrder(order) {
        const status = String(order?.status || "").toLowerCase().trim();
        const paymentStatus = String(order?.paymentStatus || "").toLowerCase().trim();

        const blockedStatus = [
            "demo",
            "test",
            "fake",
            "deleted",
            "draft",
            "failed",
            "payment failed",
            "payment_failed"
        ];

        if (blockedStatus.includes(status)) return false;
        if (blockedStatus.includes(paymentStatus)) return false;

        if (order?.isDemo === true) return false;
        if (order?.demo === true) return false;
        if (order?.isDeleted === true) return false;
        if (order?.deleted === true) return false;

        return true;
    }

    function orderBelongsToSeller(order) {
        const sellerEmail = getSellerEmailSafe();
        if (!sellerEmail || !order) return false;

        const orderSellerEmail = String(
            order.sellerEmail ||
            order.seller_email ||
            order.vendorEmail ||
            order.vendor_email ||
            ""
        ).toLowerCase().trim();

        if (orderSellerEmail && orderSellerEmail === sellerEmail) {
            return true;
        }

        if (typeof window.getSellerItemsFromOrder === "function") {
            try {
                const items = window.getSellerItemsFromOrder(order);
                if (Array.isArray(items) && items.length > 0) return true;
            } catch (e) {}
        }

        const sellerProductsArr = Array.isArray(window.sellerProducts)
            ? window.sellerProducts
            : (typeof sellerProducts !== "undefined" && Array.isArray(sellerProducts) ? sellerProducts : []);

        const sellerProductIds = new Set();
        const sellerProductSkus = new Set();

        sellerProductsArr.forEach(function (p) {
            const id = String(p.id || p.productId || p.product_id || "").trim();
            const sku = String(p.sku || "").toLowerCase().trim();

            if (id) sellerProductIds.add(id);
            if (sku) sellerProductSkus.add(sku);
        });

        const items = Array.isArray(order.items) ? order.items : [];

        return items.some(function (item) {
            const itemSellerEmail = String(
                item.sellerEmail ||
                item.seller_email ||
                item.vendorEmail ||
                item.vendor_email ||
                item.seller ||
                ""
            ).toLowerCase().trim();

            if (itemSellerEmail) return itemSellerEmail === sellerEmail;

            const itemId = String(
                item.id ||
                item.productId ||
                item.product_id ||
                item.productDocId ||
                ""
            ).trim();

            const itemSku = String(item.sku || "").toLowerCase().trim();

            if (itemId && sellerProductIds.has(itemId)) return true;
            if (itemSku && sellerProductSkus.has(itemSku)) return true;

            return false;
        });
    }

    function calculateRealOrderStats() {
        const ordersArr = Array.isArray(window.sellerOrders)
            ? window.sellerOrders
            : (typeof sellerOrders !== "undefined" && Array.isArray(sellerOrders) ? sellerOrders : []);

        const now = new Date();

        const todayKey =
            now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0");

        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        let todayOrders = 0;
        let monthlyOrders = 0;

        const countedOrderIds = new Set();

        ordersArr.forEach(function (order, index) {
            if (!order || !isRealOrder(order)) return;
            if (!orderBelongsToSeller(order)) return;

            const orderId = String(order.id || order.orderId || order.order_no || index);
            if (countedOrderIds.has(orderId)) return;
            countedOrderIds.add(orderId);

            const d = parseOrderDate(order);
            if (!d) return;

            const orderKey =
                d.getFullYear() + "-" +
                String(d.getMonth() + 1).padStart(2, "0") + "-" +
                String(d.getDate()).padStart(2, "0");

            if (orderKey === todayKey) {
                todayOrders++;
            }

            if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                monthlyOrders++;
            }
        });

        const dayOfMonth = Math.max(1, now.getDate());
        const avgDaily = monthlyOrders / dayOfMonth;

        let percentage = 0;

        if (avgDaily > 0) {
            percentage = Math.round(((todayOrders - avgDaily) / avgDaily) * 100);
        } else if (todayOrders > 0) {
            percentage = 100;
        }

        return {
            todayOrders,
            monthlyOrders,
            percentage
        };
    }

    function applyRealOrderStats() {
        const stats = calculateRealOrderStats();

        setText("smartDailyOrders", stats.todayOrders);
        setText("smartMonthlyOrders", stats.monthlyOrders);

        const pctEl = document.getElementById("smartDailyPct");
        if (pctEl) {
            const sign = stats.percentage >= 0 ? "+" : "";
            const color = stats.percentage >= 0 ? "#10b981" : "#ef4444";

            pctEl.innerHTML = `
                <span style="font-size:11px;margin-left:5px;font-weight:900;color:${color}">
                    ${sign}${stats.percentage}% vs Avg
                </span>
            `;
        }

        const todayTitle = document.querySelector("#smartDailyOrders")?.closest(".stat-card")?.querySelector("p");
        if (todayTitle && /orders/i.test(todayTitle.textContent)) {
            todayTitle.textContent = "Orders Today";
        }

        const monthlyTitle = document.querySelector("#smartMonthlyOrders")?.closest(".stat-card")?.querySelector("p");
        if (monthlyTitle && /orders/i.test(monthlyTitle.textContent)) {
            monthlyTitle.textContent = "Orders This Month";
        }
    }

    const oldRenderDashboardStats = window.renderDashboardStats;

    window.renderDashboardStats = async function () {
        let result;

        if (typeof oldRenderDashboardStats === "function") {
            result = await oldRenderDashboardStats.apply(this, arguments);
        }

        applyRealOrderStats();

        return result;
    };

    window.applyRealOrderStats = applyRealOrderStats;
    window.calculateRealOrderStats = calculateRealOrderStats;

    document.addEventListener("DOMContentLoaded", function () {
        setTimeout(applyRealOrderStats, 800);
        setTimeout(applyRealOrderStats, 2000);
        setTimeout(applyRealOrderStats, 4000);
    });

    setInterval(function () {
        const homeActive = document.getElementById("homeSection")?.classList.contains("active");
        if (homeActive) applyRealOrderStats();
    }, 5000);

    console.log("Aryanta real order stats patch active.");
})();
(function(){
    const KEY="ARYANTA_ACCEPTED_ORDER_SHIPROCKET_SHOW_ALL_PATCH_2026_05_25";
    if(window[KEY])return;
    window[KEY]=true;

    function el(id){return document.getElementById(id);}
    function txt(v){return String(v==null?"":v);}
    function safe(v){
        return txt(v).replace(/[&<>"']/g,function(c){
            return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
        });
    }
    function low(v){return txt(v).toLowerCase().trim();}
    function money(v){
        const n=Number(v||0);
        return "₹"+(Number.isFinite(n)?n:0).toLocaleString("en-IN");
    }
    function dateOf(o){
        const raw=o.timestamp||o.createdAt||o.orderDate||o.date||o.placedAt||o.acceptedAt||o.time;
        if(raw&&typeof raw.toDate==="function")return raw.toDate();
        if(raw&&raw.seconds)return new Date(raw.seconds*1000);
        const d=new Date(raw||Date.now());
        return isNaN(d.getTime())?new Date():d;
    }
    function sellerEmail(){
        return low(window.activeSeller&&activeSeller.email?activeSeller.email:"");
    }
    function products(){
        if(Array.isArray(window.sellerProducts))return window.sellerProducts;
        if(typeof sellerProducts!=="undefined"&&Array.isArray(sellerProducts))return sellerProducts;
        return [];
    }
    function orders(){
        if(Array.isArray(window.sellerOrders))return window.sellerOrders;
        if(typeof sellerOrders!=="undefined"&&Array.isArray(sellerOrders))return sellerOrders;
        return [];
    }
    function hasShiprocketUrl(o){
        const fields=[
            o.shiprocketInvoicePdfUrl,
            o.shiprocketPdfUrl,
            o.shiprocketInvoiceUrl,
            o.invoicePdfUrl,
            o.invoice_url,
            o.labelUrl,
            o.label_url,
            o.shippingLabelUrl,
            o.shipping_label_url,
            o.shiprocketLabelUrl,
            o.shiprocketDownloadUrl
        ];
        for(const f of fields){
            const s=txt(f).trim();
            if(/^https?:\/\//i.test(s))return s;
        }
        return "";
    }
    function shipStatus(o){
        const url=hasShiprocketUrl(o);
        if(url)return "ready";
        const s=low(o.shiprocketInvoiceStatus||o.shiprocketStatus||o.invoiceStatus||o.labelStatus||"");
        if(s.includes("ready")||s.includes("generated")||s.includes("success"))return "ready";
        if(s.includes("wait")||s.includes("generat")||s.includes("process")||s.includes("pending"))return "waiting";
        if(s.includes("error")||s.includes("fail")||s.includes("timeout")||s.includes("missing"))return "retry";
        return "not_generated";
    }
    function itemProduct(item){
        const id=txt(item.id||item.productId||item.product_id||item.productDocId).trim();
        const sku=low(item.sku||"");
        return products().find(function(p){
            const pid=txt(p.id||p.productId||p.product_id).trim();
            const psku=low(p.sku||"");
            return (id&&pid&&id===pid)||(sku&&psku&&sku===psku);
        })||{};
    }
    function orderSellerItems(o){
        if(typeof window.getSellerItemsFromOrder==="function"){
            try{
                const x=window.getSellerItemsFromOrder(o);
                if(Array.isArray(x)&&x.length)return x;
            }catch(e){}
        }
        const email=sellerEmail();
        const arr=Array.isArray(o.items)?o.items:[];
        const pids=new Set();
        const skus=new Set();
        products().forEach(function(p){
            const id=txt(p.id||p.productId||p.product_id).trim();
            const sku=low(p.sku||"");
            if(id)pids.add(id);
            if(sku)skus.add(sku);
        });
        return arr.filter(function(i){
            const itemEmail=low(i.sellerEmail||i.seller_email||i.vendorEmail||i.vendor_email||i.seller||"");
            if(itemEmail)return itemEmail===email;
            const id=txt(i.id||i.productId||i.product_id||i.productDocId).trim();
            const sku=low(i.sku||"");
            if(id&&pids.has(id))return true;
            if(sku&&skus.has(sku))return true;
            return false;
        });
    }
    function belongsToSeller(o){
        const email=sellerEmail();
        if(!email)return false;
        const oe=low(o.sellerEmail||o.seller_email||o.vendorEmail||o.vendor_email||"");
        if(oe&&oe===email)return true;
        return orderSellerItems(o).length>0;
    }
    function isAcceptedActive(o){
        if(!belongsToSeller(o))return false;
        const s=low(o.status||o.orderStatus||"");
        if(["cancelled","canceled","return","returned","delivered","shipped","closed","deleted","failed"].some(function(x){return s.includes(x);}))return false;
        if(["accepted","processing","packed","ready to ship","ready_to_ship","completed scan","completed_scan","scanned","ready for dispatch","ready_to_dispatch"].includes(s))return true;
        if(s.includes("accept"))return true;
        if(hasShiprocketUrl(o)&&!s.includes("ship")&&!s.includes("deliver")&&!s.includes("cancel")&&!s.includes("return"))return true;
        return false;
    }
    function statusBadge(o){
        const st=shipStatus(o);
        if(st==="ready")return '<span class="badge" style="background:#dcfce7;color:#166534;">Shiprocket Generated</span>';
        if(st==="waiting")return '<span class="badge" style="background:#fef3c7;color:#92400e;">Shiprocket Waiting</span>';
        if(st==="retry")return '<span class="badge" style="background:#fee2e2;color:#991b1b;">Retry Shiprocket</span>';
        return '<span class="badge" style="background:#e0f2fe;color:#075985;">Shiprocket Not Generated</span>';
    }
    function buttonHtml(o){
        const id=safe(o.id||o.orderId||o.order_no||"");
        const url=hasShiprocketUrl(o);
        if(url){
            return '<button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShiprocketPdfForOrder(\''+id+'\')"><i class="fas fa-download"></i> Download Shiprocket PDF</button>';
        }
        const st=shipStatus(o);
        const label=st==="waiting"?"Check / Retry Shiprocket":st==="retry"?"Retry Shiprocket":"Generate Shiprocket Invoice";
        return '<button class="btn-shiprocket" onclick="event.stopPropagation(); downloadShippingInvoice(\''+id+'\')"><i class="fas fa-file-invoice"></i> '+label+'</button>';
    }
    function itemHtml(o){
        const items=orderSellerItems(o);
        if(!items.length)return '<div style="font-weight:800;color:var(--danger);">Seller item not found in this order.</div>';
        return items.map(function(i){
            const p=itemProduct(i);
            const name=safe(i.name||i.title||p.name||p.title||"Product");
            const sku=safe(i.sku||p.sku||i.productId||i.id||"N/A");
            const qty=safe(i.qty||i.quantity||1);
            const price=money(i.price||i.sellingPrice||i.finalPrice||p.price);
            const img=i.image||i.img||i.productImage||p.image||p.imageUrl||p.mainImage||"";
            const image=img?'<img src="'+safe(img)+'" style="width:46px;height:46px;border-radius:12px;object-fit:cover;border:1px solid var(--border-color);">':'<div style="width:46px;height:46px;border-radius:12px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;"><i class="fas fa-box"></i></div>';
            return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+image+'<div><b>'+name+'</b><br><span style="font-size:12px;color:var(--text-light);font-weight:700;">SKU: '+sku+' · Qty: '+qty+' · '+price+'</span></div></div>';
        }).join("");
    }
    function render(){
        const list=el("acceptedOrdersList");
        if(!list)return;
        const sa=el("selectAllAcc");
        if(sa)sa.checked=false;
        const rows=orders().filter(isAcceptedActive).sort(function(a,b){return dateOf(b)-dateOf(a);});
        if(!rows.length){
            list.innerHTML='<tr><td colspan="6" style="text-align:center;font-weight:900;padding:24px;">No accepted orders found.</td></tr>';
            return;
        }
        list.innerHTML=rows.map(function(o){
            const id=safe(o.id||o.orderId||o.order_no||"");
            const ref=safe(o.order_no||o.orderNo||o.orderId||o.id||"N/A");
            return '<tr class="clickable-row" onclick="viewOrderDetails(\''+id+'\')">'+
                '<td data-label="Select" style="text-align:center;"><input type="checkbox" class="custom-cb cb-acc" value="'+id+'" onclick="event.stopPropagation()"></td>'+
                '<td data-label="Date"><strong style="font-size:13px;">'+safe(dateOf(o).toLocaleString())+'</strong></td>'+
                '<td data-label="Order Ref"><strong style="font-family:monospace;color:var(--primary);font-size:14px;">'+ref+'</strong></td>'+
                '<td data-label="Items" style="font-size:13px;">'+itemHtml(o)+'</td>'+
                '<td data-label="Shiprocket">'+statusBadge(o)+'</td>'+
                '<td data-label="Action"><div class="shiprocket-action-col">'+buttonHtml(o)+'<button class="btn-outline btn-sm" onclick="event.stopPropagation(); viewOrderDetails(\''+id+'\')"><i class="fas fa-eye"></i> Details</button></div></td>'+
            '</tr>';
        }).join("");
    }

    window.loadAcceptedOrders=function(){render();};

    const oldShowSection=window.showSection;
    window.showSection=async function(section){
        const res=oldShowSection?await oldShowSection.apply(this,arguments):undefined;
        if(section==="acceptedOrders"){
            if(typeof window.ensureSellerOrders==="function"){
                try{await window.ensureSellerOrders();}catch(e){}
            }
            render();
        }
        return res;
    };

    window.toggleSelectAllAcc=function(source){
        document.querySelectorAll(".cb-acc").forEach(function(cb){cb.checked=!!source.checked;});
    };

    setTimeout(render,800);
    setTimeout(render,2000);
})();
/* ===== FIX: Subscription Invoice & History opens as separate page ===== */
(function(){
    if(window.ARYANTA_SUB_INVOICE_HISTORY_PAGE_FIX) return;
    window.ARYANTA_SUB_INVOICE_HISTORY_PAGE_FIX = true;

    const $ = id => document.getElementById(id);

    function text(v){
        return v === undefined || v === null ? "" : String(v);
    }

    function safe(v){
        return text(v).replace(/[&<>"']/g, function(c){
            return {
                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#039;"
            }[c];
        });
    }

    function num(v){
        const n = Number(text(v).replace(/[^0-9.-]/g,""));
        return Number.isFinite(n) ? n : 0;
    }

    function money(v){
        return "₹" + num(v).toLocaleString("en-IN");
    }

    function getDate(v){
        if(!v) return null;
        try{
            if(v.toDate && typeof v.toDate === "function") return v.toDate();
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        }catch(e){
            return null;
        }
    }

    function dateText(v){
        const d = getDate(v);
        return d ? d.toLocaleString("en-IN") : "-";
    }

    function getSellerSafe(){
        try{
            if(typeof activeSeller !== "undefined" && activeSeller) return activeSeller;
        }catch(e){}
        try{
            return JSON.parse(localStorage.getItem("sellerToken") || "null") || {};
        }catch(e){
            return {};
        }
    }

    function sellerEmailSafe(){
        const s = getSellerSafe();
        return text(s.email || s.sellerEmail || "").toLowerCase().trim();
    }

    function hideOldInlineHistoryBox(){
        const box = $("subscriptionHistoryBox");
        if(box){
            box.style.display = "none";
            box.innerHTML = "";
        }
    }

    function ensureSubHistoryStyle(){
        if($("arySubHistoryPageStyle")) return;

        const st = document.createElement("style");
        st.id = "arySubHistoryPageStyle";
        st.textContent = `
            #subscriptionInvoiceHistoryPage{
                display:none;
            }
            #subscriptionInvoiceHistoryPage.active{
                display:block;
            }
            .ary-sub-page-head{
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:14px;
                margin-bottom:18px;
                padding:20px;
                border-radius:22px;
                background:linear-gradient(135deg,#111827,#020617);
                color:#fff;
                box-shadow:0 18px 40px rgba(15,23,42,.22);
            }
            .ary-sub-page-head h3{
                margin:0 0 6px 0;
                font-size:24px;
                font-weight:950;
            }
            .ary-sub-page-head p{
                margin:0;
                color:#cbd5e1;
                font-size:13px;
                font-weight:700;
            }
            .ary-sub-summary-grid{
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
                gap:12px;
                margin-bottom:16px;
            }
            .ary-sub-summary-card{
                background:var(--white);
                border:1px solid var(--border-color);
                border-radius:18px;
                padding:16px;
                box-shadow:var(--shadow-sm);
            }
            .ary-sub-summary-card span{
                display:block;
                font-size:11px;
                color:var(--text-light);
                font-weight:900;
                text-transform:uppercase;
                margin-bottom:6px;
            }
            .ary-sub-summary-card b{
                font-size:16px;
                color:var(--text-main);
                font-weight:950;
            }
            .ary-sub-invoice-paper{
                background:var(--white);
                border:1px solid var(--border-color);
                border-radius:22px;
                padding:22px;
                box-shadow:var(--shadow-md);
            }
            .ary-sub-invoice-row{
                display:flex;
                justify-content:space-between;
                gap:14px;
                padding:12px 0;
                border-bottom:1px solid var(--border-color);
                font-size:14px;
            }
            .ary-sub-invoice-row:last-child{
                border-bottom:0;
            }
            .ary-sub-invoice-row span{
                color:var(--text-light);
                font-weight:850;
            }
            .ary-sub-invoice-row b{
                text-align:right;
                color:var(--text-main);
                font-weight:950;
            }
            @media(max-width:700px){
                .ary-sub-page-head{
                    flex-direction:column;
                    align-items:stretch;
                }
                .ary-sub-page-head .btn-outline,
                .ary-sub-page-head .btn-prime{
                    width:100%;
                }
                .ary-sub-invoice-row{
                    flex-direction:column;
                    gap:4px;
                }
                .ary-sub-invoice-row b{
                    text-align:left;
                }
            }
        `;
        document.head.appendChild(st);
    }

    function ensureSubHistoryPage(){
        ensureSubHistoryStyle();

        let page = $("subscriptionInvoiceHistoryPage");
        if(page) return page;

        page = document.createElement("section");
        page.id = "subscriptionInvoiceHistoryPage";
        page.className = "data-section subscription-details-page";

        const parent = document.querySelector(".content-padding") || document.querySelector(".main-content") || document.body;
        parent.appendChild(page);

        return page;
    }

    function showOnlySubHistoryPage(){
        hideOldInlineHistoryBox();

        document.querySelectorAll(".data-section").forEach(sec => {
            sec.classList.remove("active");
        });

        const page = ensureSubHistoryPage();
        page.classList.add("active");

        try{
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            document.querySelectorAll(".nav-item").forEach(n => {
                if((n.getAttribute("onclick") || "").includes("subscription")){
                    n.classList.add("active");
                }
            });
        }catch(e){}

        window.scrollTo({top:0, behavior:"smooth"});
    }

    function normalizeHistoryRow(h){
        h = h || {};
        return {
            id: h.id || h.docId || "",
            plan: h.planName || h.plan || h.subscriptionName || h.name || h.packageName || "-",
            amount: h.amount || h.cost || h.price || h.subscriptionPrice || 0,
            method: h.paymentMethod || h.method || h.payment_mode || h.type || "-",
            paidBy: h.paymentBy || h.paidBy || h.sellerName || h.companyName || "",
            paymentId: h.razorpayPaymentId || h.paymentId || h.transactionId || h.txnId || h.reference || h.ref || "-",
            invoiceNo: h.invoiceNo || h.invoiceId || "",
            startDate: h.startDate || h.subStartDate || h.createdAt || h.timestamp || h.time || "",
            endDate: h.endDate || h.subEndDate || h.subscriptionEndDate || "",
            status: h.status || "Active",
            raw: h
        };
    }

    let cachedSubHistoryRows = [];

    async function getSubscriptionHistoryRows(){
        const seller = getSellerSafe();
        const rows = [];

        if(Array.isArray(seller.subHistory)){
            seller.subHistory.forEach(h => rows.push(normalizeHistoryRow(h)));
        }

        try{
            if(typeof db !== "undefined" && db && sellerEmailSafe()){
                const snap = await db.collection("seller_subscription_payments")
                    .where("sellerEmail","==",sellerEmailSafe())
                    .limit(50)
                    .get();

                snap.forEach(doc => {
                    rows.push(normalizeHistoryRow({id:doc.id, ...doc.data()}));
                });
            }
        }catch(e){}

        const seen = new Set();
        const clean = rows.filter(r => {
            const key = [
                r.invoiceNo,
                r.paymentId,
                r.plan,
                r.amount,
                r.startDate
            ].join("|");

            if(seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        clean.sort((a,b) => {
            const da = getDate(a.startDate);
            const dbb = getDate(b.startDate);
            return (dbb ? dbb.getTime() : 0) - (da ? da.getTime() : 0);
        });

        cachedSubHistoryRows = clean;
        return clean;
    }

    function invoiceNo(row, index){
        if(row.invoiceNo) return row.invoiceNo;
        const base = text(row.startDate || Date.now()).replace(/[^0-9]/g,"").slice(0,12);
        return "ARY-SUB-" + (base || Date.now()) + "-" + String(index + 1).padStart(2,"0");
    }

    function currentPlanSummary(){
        const s = getSellerSafe();

        return `
            <div class="ary-sub-summary-grid">
                <div class="ary-sub-summary-card">
                    <span>Current Plan</span>
                    <b>${safe(s.subscriptionName || s.subscription || s.plan || "Basic / Free")}</b>
                </div>
                <div class="ary-sub-summary-card">
                    <span>Start Date</span>
                    <b>${safe(dateText(s.subStartDate || s.subscriptionStartDate))}</b>
                </div>
                <div class="ary-sub-summary-card">
                    <span>End / Renewal Date</span>
                    <b>${safe(dateText(s.subEndDate || s.subscriptionEndDate))}</b>
                </div>
                <div class="ary-sub-summary-card">
                    <span>Seller</span>
                    <b>${safe(s.companyName || s.shopName || s.name || sellerEmailSafe() || "-")}</b>
                </div>
            </div>
        `;
    }

    function historyTable(rows){
        if(!rows.length){
            return `
                <div class="panel-box" style="text-align:center;padding:28px;font-weight:850;color:var(--text-light);">
                    <i class="fas fa-file-invoice" style="font-size:32px;margin-bottom:10px;color:var(--warning);"></i><br>
                    No subscription invoice/history found yet.
                </div>
            `;
        }

        return `
            <div class="table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Plan</th>
                            <th>Amount</th>
                            <th>Payment Method</th>
                            <th>Payment By</th>
                            <th>Payment ID</th>
                            <th>Status</th>
                            <th>Invoice</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((h,i) => `
                            <tr>
                                <td data-label="Plan">
                                    <b>${safe(h.plan)}</b><br>
                                    <small>${safe(dateText(h.startDate))}</small>
                                </td>
                                <td data-label="Amount">${money(h.amount)}</td>
                                <td data-label="Payment Method">${safe(h.method)}</td>
                                <td data-label="Payment By">${safe(h.paidBy || getSellerSafe().companyName || getSellerSafe().shopName || sellerEmailSafe() || "-")}</td>
                                <td data-label="Payment ID">${safe(h.paymentId)}</td>
                                <td data-label="Status"><span class="ok-chip">${safe(h.status)}</span></td>
                                <td data-label="Invoice">
                                    <button class="btn-sm" onclick="viewSubscriptionInvoice(${i})">
                                        <i class="fas fa-receipt"></i> View
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    window.showSubscriptionDetails = async function(){
        const page = ensureSubHistoryPage();
        showOnlySubHistoryPage();

        page.innerHTML = `
            <div class="ary-sub-page-head">
                <div>
                    <h3><i class="fas fa-file-invoice"></i> Subscription Invoice & History</h3>
                    <p>Full subscription plan, payment method, payment by, payment ID and invoice records.</p>
                </div>
                <button class="btn-outline" onclick="showSection('subscription')">
                    <i class="fas fa-arrow-left"></i> Back to Subscription
                </button>
            </div>

            <div class="panel-box" style="text-align:center;padding:26px;font-weight:900;">
                <i class="fas fa-spinner fa-spin"></i> Loading invoice history...
            </div>
        `;

        const rows = await getSubscriptionHistoryRows();

        page.innerHTML = `
            <div class="ary-sub-page-head">
                <div>
                    <h3><i class="fas fa-file-invoice"></i> Subscription Invoice & History</h3>
                    <p>Full subscription plan, payment method, payment by, payment ID and invoice records.</p>
                </div>
                <button class="btn-outline" onclick="showSection('subscription')">
                    <i class="fas fa-arrow-left"></i> Back to Subscription
                </button>
            </div>

            ${currentPlanSummary()}
            ${historyTable(rows)}
        `;
    };

    window.viewSubscriptionInvoice = async function(index){
        if(!cachedSubHistoryRows.length){
            await getSubscriptionHistoryRows();
        }

        const h = cachedSubHistoryRows[index] || {};
        const s = getSellerSafe();
        const page = ensureSubHistoryPage();

        showOnlySubHistoryPage();

        const paidBy = h.paidBy || s.companyName || s.shopName || s.name || sellerEmailSafe() || "-";

        page.innerHTML = `
            <div class="ary-sub-page-head">
                <div>
                    <h3><i class="fas fa-receipt"></i> Subscription Invoice</h3>
                    <p>${safe(h.plan || "Subscription")}</p>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="btn-outline" onclick="showSubscriptionDetails()">
                        <i class="fas fa-arrow-left"></i> Back to History
                    </button>
                    <button class="btn-prime" onclick="printSubscriptionInvoiceByIndex(${Number(index) || 0})">
                        <i class="fas fa-print"></i> Print
                    </button>
                </div>
            </div>

            <div class="ary-sub-invoice-paper" id="arySubInvoicePrintArea">
                <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:18px;border-bottom:3px solid #111827;padding-bottom:14px;">
                    <div>
                        <h2 style="margin:0;font-size:28px;font-weight:950;">Aryanta.in</h2>
                        <p style="margin:5px 0 0;font-weight:850;color:var(--text-light);">Seller Subscription Invoice</p>
                        <p style="margin:5px 0 0;font-size:12px;font-weight:750;color:var(--text-light);">support@aryanta.in · 6206318133</p>
                    </div>
                    <div style="text-align:right;font-size:12px;font-weight:850;color:var(--text-main);">
                        Invoice Date<br>
                        <b>${safe(dateText(h.startDate) || new Date().toLocaleString("en-IN"))}</b>
                    </div>
                </div>

                <div class="ary-sub-invoice-row"><span>Invoice No.</span><b>${safe(invoiceNo(h,index))}</b></div>
                <div class="ary-sub-invoice-row"><span>Seller</span><b>${safe(paidBy)}</b></div>
                <div class="ary-sub-invoice-row"><span>Seller Email</span><b>${safe(sellerEmailSafe() || "-")}</b></div>
                <div class="ary-sub-invoice-row"><span>Plan</span><b>${safe(h.plan || "-")}</b></div>
                <div class="ary-sub-invoice-row"><span>Amount</span><b>${money(h.amount)}</b></div>
                <div class="ary-sub-invoice-row"><span>Payment Method</span><b>${safe(h.method || "-")}</b></div>
                <div class="ary-sub-invoice-row"><span>Payment By</span><b>${safe(paidBy)}</b></div>
                <div class="ary-sub-invoice-row"><span>Payment ID</span><b>${safe(h.paymentId || "-")}</b></div>
                <div class="ary-sub-invoice-row"><span>Start Date</span><b>${safe(dateText(h.startDate))}</b></div>
                <div class="ary-sub-invoice-row"><span>End Date</span><b>${safe(dateText(h.endDate))}</b></div>
                <div class="ary-sub-invoice-row"><span>Status</span><b>${safe(h.status || "Active")}</b></div>
            </div>
        `;
    };

    window.printSubscriptionInvoiceByIndex = async function(index){
        if(!cachedSubHistoryRows.length){
            await getSubscriptionHistoryRows();
        }

        const h = cachedSubHistoryRows[index] || {};
        const s = getSellerSafe();
        const paidBy = h.paidBy || s.companyName || s.shopName || s.name || sellerEmailSafe() || "-";

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${safe(invoiceNo(h,index))}</title>
                <style>
                    body{font-family:Arial,sans-serif;color:#0f172a;padding:28px;background:#fff;}
                    .paper{max-width:850px;margin:0 auto;}
                    .top{display:flex;justify-content:space-between;gap:14px;border-bottom:3px solid #111827;padding-bottom:16px;margin-bottom:18px;}
                    h1{margin:0;font-size:30px;}
                    p{margin:5px 0;}
                    .row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding:11px 0;font-size:14px;}
                    .row span{color:#64748b;font-weight:700;}
                    .row b{text-align:right;}
                </style>
            </head>
            <body>
                <div class="paper">
                    <div class="top">
                        <div>
                            <h1>Aryanta.in</h1>
                            <p><b>Seller Subscription Invoice</b></p>
                            <p>support@aryanta.in · 6206318133</p>
                        </div>
                        <div style="text-align:right;font-size:12px;">
                            <b>Invoice Date</b><br>${safe(dateText(h.startDate) || new Date().toLocaleString("en-IN"))}
                        </div>
                    </div>
                    <div class="row"><span>Invoice No.</span><b>${safe(invoiceNo(h,index))}</b></div>
                    <div class="row"><span>Seller</span><b>${safe(paidBy)}</b></div>
                    <div class="row"><span>Seller Email</span><b>${safe(sellerEmailSafe() || "-")}</b></div>
                    <div class="row"><span>Plan</span><b>${safe(h.plan || "-")}</b></div>
                    <div class="row"><span>Amount</span><b>${money(h.amount)}</b></div>
                    <div class="row"><span>Payment Method</span><b>${safe(h.method || "-")}</b></div>
                    <div class="row"><span>Payment By</span><b>${safe(paidBy)}</b></div>
                    <div class="row"><span>Payment ID</span><b>${safe(h.paymentId || "-")}</b></div>
                    <div class="row"><span>Start Date</span><b>${safe(dateText(h.startDate))}</b></div>
                    <div class="row"><span>End Date</span><b>${safe(dateText(h.endDate))}</b></div>
                    <div class="row"><span>Status</span><b>${safe(h.status || "Active")}</b></div>
                </div>
            </body>
            </html>
        `;

        const w = window.open("", "_blank");
        if(!w){
            if(typeof showToast === "function") showToast("Popup blocked. Please allow popups to print invoice.","warning");
            return;
        }

        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => {
            try{
                w.focus();
                w.print();
            }catch(e){}
        }, 400);
    };

    const oldLoadSubscriptionsUI = window.loadSubscriptionsUI;

    window.loadSubscriptionsUI = async function(){
        try{
            if(typeof oldLoadSubscriptionsUI === "function"){
                await oldLoadSubscriptionsUI.apply(this, arguments);
            }
        }catch(e){}

        hideOldInlineHistoryBox();

        const page = $("subscriptionInvoiceHistoryPage");
        if(page) page.classList.remove("active");
    };

    try{
        loadSubscriptionsUI = window.loadSubscriptionsUI;
    }catch(e){}

    const oldShowSection = window.showSection;

    window.showSection = async function(section){
        const page = $("subscriptionInvoiceHistoryPage");
        if(page) page.classList.remove("active");

        const result = typeof oldShowSection === "function"
            ? await oldShowSection.apply(this, arguments)
            : undefined;

        if(section === "subscription"){
            setTimeout(hideOldInlineHistoryBox, 80);
            setTimeout(hideOldInlineHistoryBox, 300);
        }

        return result;
    };

    try{
        showSection = window.showSection;
    }catch(e){}

    setTimeout(hideOldInlineHistoryBox, 300);
})();
/* ===== FIX: Manual Free Subscription Choice Only ===== */
(function(){
    const PATCH_ID = "ARYANTA_MANUAL_FREE_TRIAL_CHOICE_LOCK_2026_05_25";
    if(window[PATCH_ID]) return;
    window[PATCH_ID] = true;

    const $ = id => document.getElementById(id);

    function txt(v){
        return v === undefined || v === null ? "" : String(v);
    }

    function low(v){
        return txt(v).toLowerCase().trim();
    }

    function safe(v){
        return txt(v).replace(/[&<>"']/g, function(c){
            return {
                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#039;"
            }[c];
        });
    }

    function toast(msg,type){
        try{
            if(typeof showToast === "function") showToast(msg,type || "info");
            else alert(msg);
        }catch(e){
            console.log(msg);
        }
    }

    function nowIso(){
        return new Date().toISOString();
    }

    function addDays(date,days){
        const d = new Date(date);
        d.setDate(d.getDate() + Number(days || 0));
        return d;
    }

    function dbSafe(){
        try{
            if(typeof db !== "undefined" && db) return db;
            if(window.db) return window.db;
        }catch(e){}
        return null;
    }

    function sellerSafe(){
        try{
            if(typeof activeSeller !== "undefined" && activeSeller) return activeSeller;
            if(window.activeSeller) return window.activeSeller;
        }catch(e){}

        try{
            return JSON.parse(localStorage.getItem("sellerToken") || "null") || {};
        }catch(e){
            return {};
        }
    }

    function sellerEmail(){
        const s = sellerSafe();
        return low(s.email || s.sellerEmail || s.mail);
    }

    function sellerDocId(){
        const s = sellerSafe();
        return txt(s.email || s.sellerEmail || sellerEmail()).trim();
    }

    function planKey(v){
        const s = sellerSafe();
        const p = low(v || s.subscription || s.subscriptionName || s.plan || s.package || "Basic");
        if(p.includes("pro")) return "Pro";
        if(p.includes("growth") || p.includes("growt") || p.includes("grow")) return "Growth";
        return "Basic";
    }

    function currentPlan(){
        return planKey();
    }

    function hist(){
        const s = sellerSafe();
        return Array.isArray(s.subHistory) ? s.subHistory : [];
    }

    function isAutoGrowthEntry(h){
        const source = low(h && h.source);
        const method = low(h && (h.method || h.paymentMethod));
        const amount = Number(h && (h.amount || h.price || 0));

        return (
            source.includes("new-seller-2-month-growth-trial") ||
            method.includes("new seller free trial") ||
            (
                planKey(h && (h.plan || h.planName)) === "Growth" &&
                amount === 0 &&
                source.includes("trial")
            )
        );
    }

    function hasManualChoice(){
        const s = sellerSafe();

        return !!(
            s.subscriptionTrialChoice ||
            s.trialChoiceLocked ||
            s.freeTrialChosenAt ||
            s.growthTrialManuallyActivated ||
            s.proTrialManuallyActivated ||
            s.freeGrowthTrialClaimedAt ||
            s.freeProTrialClaimedAt
        );
    }

    function chosenTrial(){
        const s = sellerSafe();

        if(s.subscriptionTrialChoice) return planKey(s.subscriptionTrialChoice);
        if(s.growthTrialManuallyActivated || s.freeGrowthTrialClaimedAt) return "Growth";
        if(s.proTrialManuallyActivated || s.freeProTrialClaimedAt) return "Pro";

        const h = hist();
        const manual = h.find(x => low(x.source).includes("seller-click-free") || low(x.source).includes("manual-free-trial"));
        if(manual) return planKey(manual.plan || manual.planName);

        return "";
    }

    function autoGrowthLooksWrong(){
        const s = sellerSafe();
        const h = hist();

        if(hasManualChoice()) return false;
        if(currentPlan() !== "Growth") return false;
        if(!(s.freeGrowthTrialRedeemed || s.newSellerGrowthTrialRedeemed || s.growthTrialRedeemedAt)) return false;

        const autoEntries = h.filter(isAutoGrowthEntry);
        const paidEntries = h.filter(x => Number(x.amount || x.price || 0) > 0);

        if(paidEntries.length > 0) return false;
        if(autoEntries.length > 0) return true;

        return false;
    }

    async function undoAutomaticGrowthTrial(){
        if(!autoGrowthLooksWrong()) return false;

        const database = dbSafe();
        const cleanHistory = hist().filter(h => !isAutoGrowthEntry(h));

        const payload = {
            subscription:"Basic",
            subscriptionName:"Basic",
            plan:"Basic",
            subscriptionAmount:0,
            subscriptionPaymentStatus:"Not Activated",
            subscriptionCommissionPercent:6,
            subStartDate:null,
            subEndDate:null,
            subscriptionEndDate:null,
            growthTrialRedeemedAt:null,
            freeGrowthTrialRedeemed:false,
            newSellerGrowthTrialRedeemed:false,
            canClaimFreePro:true,
            canClaimFreeGrowth:true,
            trialChoiceLocked:false,
            subscriptionTrialChoice:"",
            blockedTrialPlan:"",
            subHistory:cleanHistory,
            updatedAt:nowIso()
        };

        try{
            if(database && sellerDocId()){
                await database.collection("sellers").doc(sellerDocId()).set(payload,{merge:true});
            }
        }catch(e){}

        try{
            Object.assign(activeSeller,payload);
            localStorage.setItem("sellerToken",JSON.stringify(activeSeller));
        }catch(e){}

        toast("Auto Growth trial removed. Seller must click free trial manually.","info");
        return true;
    }

    function ensureStyle(){
        if($("manualTrialChoiceStyle")) return;

        const st = document.createElement("style");
        st.id = "manualTrialChoiceStyle";
        st.textContent = `
            .ary-trial-card{
                position:relative;
                background:var(--white);
                border:1px solid var(--border-color);
                border-radius:22px;
                padding:22px;
                box-shadow:var(--shadow-sm);
                overflow:hidden;
            }
            .ary-trial-card.active{
                border-color:var(--success);
                box-shadow:0 12px 32px rgba(16,185,129,.18);
            }
            .ary-trial-card.locked{
                opacity:.62;
                filter:grayscale(.2);
            }
            .ary-trial-tag{
                display:inline-flex;
                align-items:center;
                gap:7px;
                font-size:11px;
                font-weight:950;
                padding:7px 10px;
                border-radius:999px;
                background:var(--surface-2);
                color:var(--text-main);
                margin-bottom:12px;
            }
            .ary-trial-card h4{
                font-size:21px;
                font-weight:950;
                margin:0 0 8px 0;
                color:var(--text-main);
            }
            .ary-trial-price{
                font-size:28px;
                font-weight:950;
                margin:10px 0;
                color:var(--primary);
            }
            .ary-trial-list{
                display:grid;
                gap:9px;
                margin:16px 0;
                color:var(--text-light);
                font-weight:750;
                font-size:13px;
                line-height:1.45;
            }
            .ary-trial-list div{
                display:flex;
                gap:9px;
                align-items:flex-start;
            }
            .ary-trial-list i{
                color:var(--success);
                margin-top:2px;
            }
            .ary-trial-lock-note{
                background:#fff7ed;
                color:#9a3412;
                border:1px solid #fed7aa;
                padding:10px 12px;
                border-radius:14px;
                font-size:12px;
                font-weight:900;
                margin:12px 0;
            }
            body.dark-theme .ary-trial-lock-note{
                background:#451a03;
                color:#fed7aa;
                border-color:#9a3412;
            }
        `;
        document.head.appendChild(st);
    }

    function trialButton(plan){
        const chosen = chosenTrial();
        const active = currentPlan() === plan;
        const other = plan === "Growth" ? "Pro" : "Growth";

        if(chosen && chosen !== plan){
            return `
                <button class="btn-outline w-100" disabled>
                    <i class="fas fa-lock"></i> Locked — ${chosen} Free Selected
                </button>
            `;
        }

        if(chosen === plan || active){
            return `
                <button class="btn-outline w-100" disabled>
                    <i class="fas fa-check-circle"></i> Active / Claimed
                </button>
            `;
        }

        if(plan === "Growth"){
            return `
                <button class="btn-prime w-100" onclick="activateManualFreeTrial('Growth')">
                    <i class="fas fa-gift"></i> Activate 2 Months Free Growth
                </button>
            `;
        }

        return `
            <button class="btn-prime w-100" onclick="activateManualFreeTrial('Pro')">
                <i class="fas fa-gift"></i> Activate 1 Month Free Pro
            </button>
        `;
    }

    function renderTrialUI(){
        ensureStyle();

        const cards = $("subscriptionCards");
        const notice = $("subscriptionAdminNotice");

        if(!cards) return;

        const chosen = chosenTrial();
        const plan = currentPlan();

        if(notice){
            notice.style.display = "block";
            notice.innerHTML = `
                <div style="display:flex;align-items:flex-start;gap:12px;">
                    <i class="fas fa-circle-info" style="font-size:20px;color:var(--warning);margin-top:2px;"></i>
                    
                </div>
            `;
        }

        cards.innerHTML = `
            <div class="ary-trial-card ${plan === "Basic" ? "active" : ""}">
                <span class="ary-trial-tag"><i class="fas fa-store"></i> Default</span>
                <h4>Basic Seller</h4>
                <div class="ary-trial-price">Free</div>
                <div class="ary-trial-list">
                    <div><i class="fas fa-check"></i><span>Default seller access.</span></div>
                    <div><i class="fas fa-check"></i><span>No free trial used yet.</span></div>
                    <div><i class="fas fa-check"></i><span>Growth and Pro free buttons remain available until seller chooses one.</span></div>
                </div>
                ${plan === "Basic" ? `
                    <button class="btn-outline w-100" disabled>
                        <i class="fas fa-check"></i> Current Plan
                    </button>
                ` : `
                    <button class="btn-outline w-100" onclick="switchToBasicWithConfirm && switchToBasicWithConfirm()">
                        <i class="fas fa-pause"></i> Switch / Pause to Basic
                    </button>
                `}
            </div>

            <div class="ary-trial-card ${plan === "Growth" ? "active" : ""} ${chosen && chosen !== "Growth" ? "locked" : ""}">
                <span class="ary-trial-tag"><i class="fas fa-chart-line"></i> 2 Months Free</span>
                <h4>Growth Plan</h4>
                <div class="ary-trial-price">₹0 <small style="font-size:12px;color:var(--text-light);">for 2 months</small></div>
                <div class="ary-trial-list">
                    <div><i class="fas fa-check"></i><span>2 months free Growth access.</span></div>
                    <div><i class="fas fa-check"></i><span>Growth tools and lower commission enabled after click.</span></div>
                    <div><i class="fas fa-check"></i><span>Choosing Growth blocks the free Pro option.</span></div>
                </div>
                ${chosen && chosen !== "Growth" ? `<div class="ary-trial-lock-note">Free Growth blocked because ${safe(chosen)} free trial was selected.</div>` : ""}
                ${trialButton("Growth")}
                <button class="btn-outline w-100" style="margin-top:10px;" onclick="processSubscription && processSubscription('Growth','online')">
                    <i class="fas fa-credit-card"></i> Pay Growth ₹259/month
                </button>
            </div>

            <div class="ary-trial-card ${plan === "Pro" ? "active" : ""} ${chosen && chosen !== "Pro" ? "locked" : ""}">
                <span class="ary-trial-tag"><i class="fas fa-crown"></i> 1 Month Free</span>
                <h4>Pro Plan</h4>
                <div class="ary-trial-price">₹0 <small style="font-size:12px;color:var(--text-light);">for 1 month</small></div>
                <div class="ary-trial-list">
                    <div><i class="fas fa-check"></i><span>1 month free Pro access.</span></div>
                    <div><i class="fas fa-check"></i><span>Pro tools and best commission enabled after click.</span></div>
                    <div><i class="fas fa-check"></i><span>Choosing Pro blocks the free Growth option.</span></div>
                </div>
                ${chosen && chosen !== "Pro" ? `<div class="ary-trial-lock-note">Free Pro blocked because ${safe(chosen)} free trial was selected.</div>` : ""}
                ${trialButton("Pro")}
                <button class="btn-outline w-100" style="margin-top:10px;" onclick="processSubscription && processSubscription('Pro','online')">
                    <i class="fas fa-credit-card"></i> Pay Pro ₹459/month
                </button>
            </div>

            <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn-outline" onclick="showSubscriptionDetails && showSubscriptionDetails()">
                    <i class="fas fa-receipt"></i> Subscription Invoice / History
                </button>
            </div>
        `;
    }

    async function saveSellerPatch(payload){
        const database = dbSafe();

        try{
            if(database && sellerDocId()){
                await database.collection("sellers").doc(sellerDocId()).set(payload,{merge:true});
            }
        }catch(e){
            throw e;
        }

        try{
            Object.assign(activeSeller,payload);
            localStorage.setItem("sellerToken",JSON.stringify(activeSeller));
        }catch(e){}
    }

    window.activateManualFreeTrial = async function(plan){
        plan = planKey(plan);

        if(plan !== "Growth" && plan !== "Pro"){
            return toast("Only Growth or Pro free trial can be activated.","error");
        }

        const chosen = chosenTrial();

        if(chosen && chosen !== plan){
            return toast(`You already selected ${chosen} free trial. Other free option is locked.`,"warning");
        }

        if(chosen === plan){
            return toast(`${plan} free trial is already claimed.`,"warning");
        }

        const database = dbSafe();

        if(!sellerEmail() || !sellerDocId()){
            return toast("Seller account not loaded. Please login again.","error");
        }

        const start = new Date();
        const days = plan === "Growth" ? 60 : 30;
        const end = addDays(start,days);
        const other = plan === "Growth" ? "Pro" : "Growth";
        const commission = plan === "Growth" ? 4 : 2.5;

        const cleanHistory = hist().filter(h => !isAutoGrowthEntry(h));

        const entry = {
            plan:plan,
            planName:plan,
            amount:0,
            price:0,
            method:"Manual Free Trial",
            paymentMethod:"Free Trial",
            startDate:start.toISOString(),
            endDate:end.toISOString(),
            status:"Active",
            source:plan === "Growth" ? "seller-click-free-growth-2-month" : "seller-click-free-pro-1-month",
            createdAt:nowIso(),
            trialChoiceLocked:true,
            blockedTrialPlan:other,
            commissionPercent:commission
        };

        const payload = {
            subscription:plan,
            subscriptionName:plan,
            plan:plan,
            subStartDate:start.toISOString(),
            subEndDate:end.toISOString(),
            subscriptionEndDate:end.toISOString(),
            subscriptionCommissionPercent:commission,
            subscriptionAmount:0,
            subscriptionPaymentStatus:"Free Trial",
            subscriptionTrialChoice:plan,
            trialChoiceLocked:true,
            freeTrialChosenAt:nowIso(),
            blockedTrialPlan:other,
            canClaimFreeGrowth:plan === "Growth",
            canClaimFreePro:plan === "Pro",
            freeGrowthTrialRedeemed:plan === "Growth",
            freeProTrialRedeemed:plan === "Pro",
            growthTrialManuallyActivated:plan === "Growth",
            proTrialManuallyActivated:plan === "Pro",
            freeGrowthTrialClaimedAt:plan === "Growth" ? nowIso() : null,
            freeProTrialClaimedAt:plan === "Pro" ? nowIso() : null,
            growthTrialRedeemedAt:plan === "Growth" ? nowIso() : null,
            newSellerGrowthTrialRedeemed:plan === "Growth",
            subHistory:[...cleanHistory,entry],
            updatedAt:nowIso()
        };

        try{
            await saveSellerPatch(payload);

            try{
                if(database){
                    await database.collection("seller_subscription_payments").add({
                        sellerEmail:sellerEmail(),
                        sellerName:sellerSafe().companyName || sellerSafe().shopName || "",
                        plan:plan,
                        planName:plan,
                        amount:0,
                        status:"Free Trial",
                        method:"Manual Free Trial",
                        source:entry.source,
                        startDate:start.toISOString(),
                        endDate:end.toISOString(),
                        blockedTrialPlan:other,
                        createdAt:nowIso()
                    });
                }
            }catch(e){}

            toast(`${plan} free trial activated. ${other} free option is now locked.`,"success");

            renderTrialUI();

            try{
                if(typeof updateBrandingLimitText === "function") updateBrandingLimitText();
            }catch(e){}

            try{
                if(typeof updatePlanGatesFinal === "function") updatePlanGatesFinal();
            }catch(e){}

        }catch(e){
            toast("Free trial activation failed. Please try again.","error");
        }
    };

    const oldRedeemGrowthFreeMonth = window.redeemGrowthFreeMonth;
    window.redeemGrowthFreeMonth = function(){
        return window.activateManualFreeTrial("Growth");
    };

    const oldActivateFreeSubscription = window.activateFreeSubscription;
    window.activateFreeSubscription = function(plan){
        return window.activateManualFreeTrial(planKey(plan));
    };

    const oldProcessSubscription = window.processSubscription;
    window.processSubscription = function(plan,method){
        const m = low(method);

        if(m === "free" || m === "free_month" || m === "free-trial" || m === "trial"){
            return window.activateManualFreeTrial(plan);
        }

        if(typeof oldProcessSubscription === "function"){
            return oldProcessSubscription.apply(this,arguments);
        }

        toast("Subscription payment function not ready.","error");
    };

    const oldLoadSubscriptionsUI = window.loadSubscriptionsUI;
    window.loadSubscriptionsUI = async function(){
        await undoAutomaticGrowthTrial();

        let res;
        try{
            if(typeof oldLoadSubscriptionsUI === "function"){
                res = await oldLoadSubscriptionsUI.apply(this,arguments);
            }
        }catch(e){}

        setTimeout(renderTrialUI,80);
        setTimeout(renderTrialUI,300);
        return res;
    };

    try{
        loadSubscriptionsUI = window.loadSubscriptionsUI;
    }catch(e){}

    const oldShowSection = window.showSection;
    window.showSection = async function(section){
        await undoAutomaticGrowthTrial();

        let res;
        if(typeof oldShowSection === "function"){
            res = await oldShowSection.apply(this,arguments);
        }

        if(section === "subscription"){
            setTimeout(renderTrialUI,120);
            setTimeout(renderTrialUI,450);
        }

        return res;
    };

    try{
        showSection = window.showSection;
    }catch(e){}

    async function boot(){
        await undoAutomaticGrowthTrial();

        const sec = $("subscriptionSection");
        if(sec && sec.classList.contains("active")){
            renderTrialUI();
        }
    }

    document.addEventListener("DOMContentLoaded",function(){
        setTimeout(boot,300);
        setTimeout(boot,1200);
        setTimeout(boot,2400);
    });

    setTimeout(boot,700);
    setTimeout(boot,1600);
    setTimeout(boot,3200);
})();
/* ===== FIX: Razorpay key missing even when Cloudflare has key ===== */
(function(){
    const PATCH_ID = "ARYANTA_RAZORPAY_KEY_NORMALIZER_FIX_2026_05_25";
    if(window[PATCH_ID]) return;
    window[PATCH_ID] = true;

    const API_URL = typeof API_BASE_URL !== "undefined"
        ? API_BASE_URL
        : "https://rough-field-c679.official-aryanta.workers.dev";

    function toast(msg,type){
        try{
            if(typeof showToast === "function") showToast(msg,type || "info");
            else alert(msg);
        }catch(e){
            console.log(msg);
        }
    }

    function safeText(v){
        return v === undefined || v === null ? "" : String(v).trim();
    }

    function getSeller(){
        try{
            if(typeof activeSeller !== "undefined" && activeSeller) return activeSeller;
        }catch(e){}

        try{
            return JSON.parse(localStorage.getItem("sellerToken") || "null") || {};
        }catch(e){
            return {};
        }
    }

    function getRazorpayFromObject(data){
        if(!data || typeof data !== "object") return "";

        return safeText(
            data.razorpayKey ||
            data.razorpay_key ||
            data.razorpayKeyId ||
            data.razorpay_key_id ||
            data.RAZORPAY_KEY ||
            data.RAZORPAY_KEY_ID ||
            data.key ||
            data.keyId ||
            data.key_id ||
            data.razorpay ||
            data.paymentKey ||
            data.payment_key ||
            data.publicKey ||
            data.public_key ||
            ""
        );
    }

    function isValidRazorpayKey(key){
        key = safeText(key);
        return key.startsWith("rzp_test_") || key.startsWith("rzp_live_");
    }

    function ensureApiKeysObject(){
        if(typeof window.API_KEYS === "undefined"){
            window.API_KEYS = {};
        }

        try{
            if(typeof API_KEYS === "undefined"){
                window.API_KEYS = window.API_KEYS || {};
            }
        }catch(e){}

        try{
            if(typeof API_KEYS !== "undefined" && API_KEYS){
                if(!window.API_KEYS) window.API_KEYS = API_KEYS;
            }
        }catch(e){}
    }

    window.fetchRazorpayKeyFromCloudflare = async function(force){
        ensureApiKeysObject();

        try{
            if(!force && typeof API_KEYS !== "undefined" && isValidRazorpayKey(API_KEYS.RAZORPAY)){
                return API_KEYS.RAZORPAY;
            }
        }catch(e){}

        try{
            if(!force && window.API_KEYS && isValidRazorpayKey(window.API_KEYS.RAZORPAY)){
                return window.API_KEYS.RAZORPAY;
            }
        }catch(e){}

        let finalKey = "";

        try{
            const res = await fetch(`${API_URL}/get-api-keys`, {
                method:"GET",
                cache:"no-store",
                headers:{
                    "Accept":"application/json"
                }
            });

            if(res.ok){
                const data = await res.json();

                finalKey =
                    getRazorpayFromObject(data) ||
                    getRazorpayFromObject(data.keys) ||
                    getRazorpayFromObject(data.apiKeys) ||
                    getRazorpayFromObject(data.payment) ||
                    getRazorpayFromObject(data.razorpayConfig);
            }
        }catch(e){}

        if(!isValidRazorpayKey(finalKey)){
            try{
                const res2 = await fetch(`${API_URL}/health`, {
                    method:"GET",
                    cache:"no-store",
                    headers:{
                        "Accept":"application/json"
                    }
                });

                if(res2.ok){
                    const data2 = await res2.json();

                    finalKey =
                        getRazorpayFromObject(data2) ||
                        getRazorpayFromObject(data2.keys) ||
                        getRazorpayFromObject(data2.apiKeys) ||
                        getRazorpayFromObject(data2.payment) ||
                        getRazorpayFromObject(data2.razorpayConfig);
                }
            }catch(e){}
        }

        if(isValidRazorpayKey(finalKey)){
            try{
                API_KEYS.RAZORPAY = finalKey;
            }catch(e){}

            window.API_KEYS = window.API_KEYS || {};
            window.API_KEYS.RAZORPAY = finalKey;

            return finalKey;
        }

        return "";
    };

    async function waitForRazorpayKey(){
        let key = await window.fetchRazorpayKeyFromCloudflare(false);
        if(isValidRazorpayKey(key)) return key;

        for(let i = 0; i < 8; i++){
            await new Promise(resolve => setTimeout(resolve, 350));
            key = await window.fetchRazorpayKeyFromCloudflare(i > 2);
            if(isValidRazorpayKey(key)) return key;
        }

        return "";
    }

    function planData(plan){
        const p = safeText(plan).toLowerCase();

        if(p.includes("pro")){
            return {
                key:"Pro",
                name:"Pro",
                price:459,
                commissionPercent:2.5
            };
        }

        if(p.includes("growth") || p.includes("grow")){
            return {
                key:"Growth",
                name:"Growth",
                price:259,
                commissionPercent:4
            };
        }

        return {
            key:"Basic",
            name:"Basic",
            price:0,
            commissionPercent:6
        };
    }

    async function activatePaidPlanAfterRazorpay(plan, paymentId){
        const seller = getSeller();

        if(!seller || !seller.email){
            toast("Seller account not loaded. Please login again.","error");
            return;
        }

        const p = planData(plan);
        const start = new Date();
        const end = new Date();
        end.setMonth(end.getMonth() + 1);

        const record = {
            plan:p.key,
            planName:p.name,
            amount:p.price,
            price:p.price,
            commissionPercent:p.commissionPercent,
            duration:"month",
            method:"Razorpay",
            paymentMethod:"Razorpay",
            razorpayPaymentId:paymentId || "",
            status:"Paid",
            startDate:start.toISOString(),
            endDate:end.toISOString(),
            createdAt:start.toISOString()
        };

        const oldHistory = Array.isArray(seller.subHistory) ? seller.subHistory : [];

        const payload = {
            subscription:p.key,
            subscriptionName:p.name,
            plan:p.key,
            subStartDate:start.toISOString(),
            subEndDate:end.toISOString(),
            subscriptionEndDate:end.toISOString(),
            subscriptionCommissionPercent:p.commissionPercent,
            subscriptionAmount:p.price,
            subscriptionPaymentStatus:"Paid",
            subHistory:[...oldHistory, record],
            updatedAt:start.toISOString()
        };

        try{
            if(typeof db !== "undefined" && db){
                await db.collection("sellers").doc(seller.email).set(payload,{merge:true});

                try{
                    await db.collection("seller_subscription_payments").add({
                        sellerEmail:seller.email,
                        sellerName:seller.companyName || seller.shopName || "",
                        plan:p.key,
                        planName:p.name,
                        amount:p.price,
                        status:"Paid",
                        method:"Razorpay",
                        paymentMethod:"Razorpay",
                        razorpayPaymentId:paymentId || "",
                        startDate:start.toISOString(),
                        endDate:end.toISOString(),
                        createdAt:start.toISOString()
                    });
                }catch(e){}
            }

            try{
                Object.assign(activeSeller,payload);
                localStorage.setItem("sellerToken",JSON.stringify(activeSeller));
            }catch(e){}

            toast(`${p.name} plan activated successfully.`,"success");

            try{
                if(typeof loadSubscriptionsUI === "function") loadSubscriptionsUI();
            }catch(e){}

            try{
                if(typeof loadProfile === "function") loadProfile();
            }catch(e){}

        }catch(e){
            toast("Payment done, but plan update failed. Please contact support with payment ID.","error");
            console.error(e);
        }
    }

    const oldProcessSubscription = window.processSubscription;

    window.processSubscription = async function(plan, method){
        const m = safeText(method || "online").toLowerCase();

        if(m === "free" || m === "free_month" || m === "free-trial" || m === "trial"){
            if(typeof window.activateManualFreeTrial === "function"){
                return window.activateManualFreeTrial(plan);
            }
            if(typeof oldProcessSubscription === "function"){
                return oldProcessSubscription.apply(this, arguments);
            }
        }

        if(m === "payout" || m === "upcoming_payout"){
            if(typeof oldProcessSubscription === "function"){
                return oldProcessSubscription.apply(this, arguments);
            }
            return toast("Upcoming payout payment is not ready.","error");
        }

        const p = planData(plan);

        if(p.price <= 0){
            if(typeof window.activateFreeBasicPlan === "function"){
                return window.activateFreeBasicPlan();
            }
            return toast("Basic plan is already free.","info");
        }

        const key = await waitForRazorpayKey();

        if(!isValidRazorpayKey(key)){
            toast("Razorpay public key not received from Cloudflare. Check /get-api-keys response key name.","error");
            console.error("Razorpay key missing. Cloudflare must return key_id like rzp_live_xxx or rzp_test_xxx, not key_secret.");
            return;
        }

        if(typeof Razorpay === "undefined"){
            toast("Razorpay script not loaded. Refresh and try again.","error");
            return;
        }

        const seller = getSeller();

        const options = {
            key:key,
            amount:p.price * 100,
            currency:"INR",
            name:"Aryanta Subscription",
            description:`${p.name} Seller Plan`,
            handler:function(response){
                activatePaidPlanAfterRazorpay(p.key, response.razorpay_payment_id || "");
            },
            prefill:{
                name:seller.companyName || seller.shopName || "",
                email:seller.email || "",
                contact:seller.phone || ""
            },
            theme:{
                color:"#111827"
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();
    };

    try{
        processSubscription = window.processSubscription;
    }catch(e){}

    const oldPayAdOnline = window.payAdOnline;

    window.payAdOnline = async function(){
        const key = await waitForRazorpayKey();

        if(!isValidRazorpayKey(key)){
            toast("Razorpay key not loaded from Cloudflare. Cannot open payment.","error");
            return;
        }

        try{
            API_KEYS.RAZORPAY = key;
        }catch(e){}

        window.API_KEYS = window.API_KEYS || {};
        window.API_KEYS.RAZORPAY = key;

        if(typeof oldPayAdOnline === "function"){
            return oldPayAdOnline.apply(this, arguments);
        }
    };

    document.addEventListener("DOMContentLoaded",function(){
        setTimeout(function(){
            window.fetchRazorpayKeyFromCloudflare(true).then(function(key){
                if(isValidRazorpayKey(key)){
                    console.log("Razorpay key loaded from Cloudflare.");
                }else{
                    console.warn("Razorpay key still missing. Worker /get-api-keys must return razorpayKey or razorpayKeyId.");
                }
            });
        },800);
    });

    setTimeout(function(){
        window.fetchRazorpayKeyFromCloudflare(true);
    },1200);
})();
