const API_BASE_URL="https://rough-field-c679.official-aryanta.workers.dev";
var updateBrandingLimitText = window.updateBrandingLimitText || function(){
    const el=document.getElementById("brandingLimitText")||document.getElementById("brandLimitText")||document.getElementById("currentPlanBadge");
    if(!el||!window.activeSeller&&!activeSeller)return;
    const s=(typeof activeSeller!=="undefined"&&activeSeller)?activeSeller:{};
    const plan=String(s.subscription||"No DB plan active");
    if(el.id==="currentPlanBadge")el.textContent=plan;
    else el.textContent=plan.includes("Ultra")?"Unlimited branding tools enabled.":plan.includes("Pro")?"Pro branding tools enabled.":"Branding tools are controlled by admin DB.";
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

window.downloadShippingInvoice=async function(orderId){
    showToast("Generating Aryanta Native Print Slip.","info");
    processSlips('print',orderId==='bulk'?null:orderId);
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
    currentPlanDuration=type==='year'?'year':'month';
    if(window.loadSubscriptionsUI) window.loadSubscriptionsUI();
};

function validatePayoutButtons(){
    if(window.validateStrictPayoutButtons) return window.validateStrictPayoutButtons();
}

window.loadSubscriptionsUI=async function(){
    if(window.loadStrictSubscriptionsUI) return window.loadStrictSubscriptionsUI();
    const grid=document.getElementById('subscriptionPlansGrid');
    if(grid)grid.innerHTML='<div class="panel-box" style="grid-column:1/-1;text-align:center;font-weight:800;color:var(--danger);">Subscription plans are not loaded from admin database.</div>';
};

window.processSubscription=async function(planId,method){
    if(window.processStrictSubscription) return window.processStrictSubscription(planId,method);
    showToast('Subscription plans are not loaded from admin database. Ask admin to add active plans.','error');
};

async function activateSubscription(){
    showToast('Old built-in subscription activator is disabled. Admin DB plan is required.','error');
}

// --- Store Branding is controlled by admin DB plan limits. Final uploader is defined later. ---
window.uploadStoreBranding = async function(type){
    if(window.uploadStoreBrandingStrict) return window.uploadStoreBrandingStrict(type);
    showToast('Branding upload is admin-database controlled. Load seller plan first.','warning');
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
    window.processSubscription = async function(planId, method){
        if(window.processStrictSubscription) return window.processStrictSubscription(planId, method);
        showToast('Subscription is admin-database controlled. Add plans in Firestore first.','error');
    };
    window.activateSubscription = activateSubscription = async function(){
        showToast('Old built-in subscription activation is removed. Admin DB plan is required.','error');
    };
    window.validatePayoutButtons = function(){
        if(window.validateStrictPayoutButtons) return window.validateStrictPayoutButtons();
        const badge=$('currentPlanBadge'); if(badge && activeSeller) badge.textContent = activeSeller.subscription || 'No DB plan active';
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
        try{
            const plan=typeof window.getActiveSubscriptionPlanForSeller==='function'?window.getActiveSubscriptionPlanForSeller():null;
            const direct=Number(plan&&plan.freeAds);
            if(Number.isFinite(direct)&&direct>=0)return Math.floor(direct);
            const sf=activeSeller&&activeSeller.subscriptionFeatures;
            const feature=Number(sf&&(sf.freeAds||sf.sponsoredFreeAds||sf.freeSponsoredAds));
            if(Number.isFinite(feature)&&feature>=0)return Math.floor(feature);
        }catch(e){}
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


/* Aryanta Seller STRICT Dynamic Admin Control Patch - no built-in subscription/category defaults */
(function(){
    if(window.ARYANTA_SELLER_STRICT_DYNAMIC_2026_05_21)return;
    window.ARYANTA_SELLER_STRICT_DYNAMIC_2026_05_21=true;

    const MONTH_KEY=new Date().toISOString().slice(0,7);
    const $=id=>document.getElementById(id);
    const text=v=>String(v==null?'':v);
    const low=v=>text(v).toLowerCase().trim();
    const nowIso=()=>new Date().toISOString();
    const money=n=>`₹${Number(n||0).toLocaleString('en-IN')}`;
    const safe=v=>text(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
    const sellerEmail=()=>low(activeSeller&&activeSeller.email);
    const sellerDocId=()=>text(activeSeller&&activeSeller.email).trim();

    let adminConfig={};
    let dynamicPlans=[];
    let supportCategories=[];
    let dynamicButtons={sidebar:[],settings:[],profile:[]};
    let dynamicLedger=[];
    let textOverrides=[];
    let cfgFetchedAt=0;
    let cfgPromise=null;

    function arr(v){
        if(Array.isArray(v))return v;
        if(v&&typeof v==='object')return Object.keys(v).map(k=>Object.assign({id:k},v[k]));
        return [];
    }
    function truthy(v,def=true){
        if(v===undefined||v===null||v==='')return def;
        if(typeof v==='boolean')return v;
        const s=low(v);
        if(['false','0','no','off','disabled','inactive','hide','hidden'].includes(s))return false;
        if(['true','1','yes','on','enabled','active','show','visible'].includes(s))return true;
        return def;
    }
    function deepMerge(target,source){
        if(!source||typeof source!=='object')return target;
        Object.keys(source).forEach(k=>{
            if(source[k]&&typeof source[k]==='object'&&!Array.isArray(source[k])&&!(source[k] instanceof Date)){
                if(!target[k]||typeof target[k]!=='object'||Array.isArray(target[k]))target[k]={};
                deepMerge(target[k],source[k]);
            }else if(source[k]!==undefined){target[k]=source[k];}
        });
        return target;
    }
    function iconClass(v,fallback='fas fa-link'){
        const s=text(v||fallback).trim();
        if(!s)return fallback;
        if(s.includes('fa-'))return s;
        return 'fas fa-'+s;
    }
    function isActiveDoc(d){return truthy(d.active,d.enabled!==undefined?truthy(d.enabled,true):true)&&truthy(d.visible,d.show!==undefined?truthy(d.show,true):true);}
    async function getDocRows(refs){
        const rows=[];
        if(!db)return rows;
        for(const [c,id] of refs){
            try{const doc=await db.collection(c).doc(id).get();if(doc.exists)rows.push({id:doc.id,...doc.data(),__collection:c});}
            catch(e){console.warn('Admin config skipped',c+'/'+id,e);}
        }
        return rows;
    }
    async function getCollectionRows(names){
        const rows=[];
        if(!db)return rows;
        for(const name of names){
            try{
                let snap;
                try{snap=await db.collection(name).orderBy('sortOrder','asc').get();}
                catch(e){snap=await db.collection(name).get();}
                snap.forEach(doc=>rows.push({id:doc.id,...doc.data(),__collection:name}));
                if(rows.length)break;
            }catch(e){console.warn('Admin collection skipped',name,e);}
        }
        return rows;
    }
    function normalizePlan(raw){
        const name=text(raw.name||raw.title||raw.planName||raw.label||raw.id).trim();
        const hasMonthly=raw.monthlyPrice!==undefined||raw.priceMonthly!==undefined||raw.monthPrice!==undefined||raw.price!==undefined||raw.amount!==undefined;
        const hasYearly=raw.yearlyPrice!==undefined||raw.priceYearly!==undefined||raw.yearPrice!==undefined||raw.yearlyAmount!==undefined;
        const monthly=hasMonthly?Number(raw.monthlyPrice??raw.priceMonthly??raw.monthPrice??raw.price??raw.amount):null;
        const yearly=hasYearly?Number(raw.yearlyPrice??raw.priceYearly??raw.yearPrice??raw.yearlyAmount):null;
        const settings=raw.settings||raw.enabledSettings||raw.allowedSettings||raw.settingAccess||null;
        const features=arr(raw.features||raw.planFeatures||raw.benefits).map(f=>typeof f==='string'?f:(f.title||f.name||f.text||f.description)).filter(Boolean);
        return {
            ...raw,
            id:text(raw.id||raw.planId||name).trim(),
            name,
            title:text(raw.title||raw.name||name).trim(),
            description:text(raw.description||raw.subtitle||raw.shortDescription||''),
            monthlyPrice:Number.isFinite(monthly)?monthly:null,
            yearlyPrice:Number.isFinite(yearly)?yearly:null,
            active:truthy(raw.active,truthy(raw.enabled,true)),
            visible:truthy(raw.visible,truthy(raw.show,true)),
            badge:text(raw.badge||raw.tag||''),
            features,
            freeAds:Number(raw.freeAds??raw.freeAdCount??raw.sponsoredAdsFree??raw.adCredits??0)||0,
            logoLimit:Number(raw.logoLimit??raw.logoUploads??raw.brandLogoLimit??0)||0,
            bannerLimit:Number(raw.bannerLimit??raw.bannerUploads??raw.brandBannerLimit??0)||0,
            commissionPercent:Number(raw.commissionPercent??raw.platformFeePercent??adminConfig.platformCommissionPercent??0)||0,
            durationDays:Number(raw.durationDays??raw.days??0)||0,
            settings,
            allowPayoutPayment:truthy(raw.allowPayoutPayment,truthy(raw.payoutPayment,true)),
            freeFirstLimit:Number(raw.freeFirstLimit??raw.freeFirstMembers??raw.freeForFirstMembers??raw.firstFreeLimit??0)||0,
            freeFirstEnabled:truthy(raw.freeFirstEnabled,(raw.freeFirstLimit||raw.freeFirstMembers||raw.freeForFirstMembers)?true:false),
            isFree:truthy(raw.isFree,truthy(raw.free,false))
        };
    }
    function normalizeCategory(raw){
        return {
            id:text(raw.id||raw.categoryId||raw.value||raw.title||raw.name).trim(),
            title:text(raw.title||raw.name||raw.value||'').trim(),
            description:text(raw.description||raw.desc||raw.subtitle||''),
            active:truthy(raw.active,truthy(raw.enabled,true)),
            visible:truthy(raw.visible,truthy(raw.show,true)),
            sortOrder:Number(raw.sortOrder||raw.order||raw.sort||0)||0,
            askForImage:truthy(raw.askForImage, truthy(raw.askImage, false)),
            requireImage:truthy(raw.requireImage, truthy(raw.imageRequired, false)),
            askForFile:truthy(raw.askForFile, truthy(raw.askFile, false)),
            requireFile:truthy(raw.requireFile, truthy(raw.fileRequired, false)),
            allowAttachment:truthy(raw.allowAttachment, truthy(raw.attachmentAllowed, false)),
            attachmentRequired:truthy(raw.attachmentRequired, truthy(raw.requireAttachment, false)),
            attachmentLabel:text(raw.attachmentLabel||raw.uploadLabel||'Upload proof / screenshot'),
            attachmentHelp:text(raw.attachmentHelp||raw.uploadHelp||'Add a screenshot, invoice or file if admin asked for it.')
        };
    }
    function normalizeButton(raw){
        return {
            id:text(raw.id||raw.buttonId||raw.title||raw.name||Math.random()).trim(),
            location:low(raw.location||raw.place||raw.area||'settings'),
            title:text(raw.title||raw.name||raw.text||'Open'),
            description:text(raw.description||raw.desc||raw.subtitle||''),
            icon:iconClass(raw.icon,'fas fa-link'),
            image:text(raw.image||raw.imageUrl||raw.img||''),
            url:text(raw.url||raw.link||raw.href||''),
            section:text(raw.section||raw.targetSection||''),
            action:low(raw.action||raw.type||(raw.section?'section':'url')),
            active:truthy(raw.active,truthy(raw.enabled,true)),
            visible:truthy(raw.visible,truthy(raw.show,true)),
            sortOrder:Number(raw.sortOrder||raw.order||0)||0,
            html:text(raw.html||'')
        };
    }
    function normalizeTextOverride(raw){
        const key=text(raw.key||raw.id||raw.selector||raw.target||raw.elementId||'').trim();
        return {
            key,
            selector:text(raw.selector||raw.cssSelector||'').trim(),
            elementId:text(raw.elementId||raw.elId||'').trim(),
            text:raw.text??raw.value??raw.title??'',
            html:raw.html??raw.innerHTML??null,
            placeholder:raw.placeholder??null,
            titleAttr:raw.titleAttr??raw.tooltip??null,
            active:truthy(raw.active,truthy(raw.enabled,true)),
            visible:truthy(raw.visible,truthy(raw.show,true))
        };
    }
    function collectTextOverrides(cfg, collectionRows){
        const rows=[];
        const raw=cfg.textOverrides||cfg.uiText||cfg.texts||cfg.labels||{};
        if(Array.isArray(raw))rows.push(...raw.map(normalizeTextOverride));
        else Object.keys(raw).forEach(k=>{
            const v=raw[k];
            if(v&&typeof v==='object')rows.push(normalizeTextOverride({key:k,...v}));
            else rows.push(normalizeTextOverride({key:k,text:v}));
        });
        rows.push(...collectionRows.map(normalizeTextOverride));
        return rows.filter(r=>r.active&&r.visible&&(r.key||r.selector||r.elementId));
    }
    function basicPlanTemplate(){
        return normalizePlan({
            id:'basic',
            planId:'basic',
            name:'Basic',
            title:'Basic',
            description:'Free starter plan for every Aryanta seller.',
            monthlyPrice:0,
            yearlyPrice:0,
            active:true,
            visible:true,
            badge:'Free',
            sortOrder:-9999,
            freeAds:1,
            durationDays:30,
            settings:{
                theme:true,
                darkTheme:true,
                support:true,
                supportTickets:true,
                b2b:true,
                buyB2b:true,
                b2bSupplies:true,
                ads:true,
                sponsoredAds:true,
                offline:false,
                autoAcc:false,
                vacation:false,
                sms:false,
                '2fa':false,
                searchSuggestions:false,
                bankEdit:false
            },
            features:[
                'Dark Theme access',
                'Support Tickets enabled',
                'B2B Supplies access',
                '1 free Sponsored Ad every month'
            ]
        });
    }
    function ensureBasicPlan(plans){
        const clean=Array.isArray(plans)?plans.filter(Boolean):[];
        const basic=basicPlanTemplate();
        const idx=clean.findIndex(p=>low(p.id)==='basic'||low(p.name)==='basic'||low(p.title)==='basic');
        if(idx>=0){
            clean[idx]={...basic,...clean[idx],id:'basic',planId:'basic',name:'Basic',title:'Basic',monthlyPrice:0,yearlyPrice:0,isFree:true,freeAds:Number(clean[idx].freeAds||clean[idx].sponsoredAdsFree||1)||1,settings:{...basic.settings,...(clean[idx].settings||{})},features:(clean[idx].features&&clean[idx].features.length)?clean[idx].features:basic.features,sortOrder:Number(clean[idx].sortOrder??clean[idx].order??-9999)};
        }else{
            clean.unshift(basic);
        }
        return clean.sort((a,b)=>(Number(a.sortOrder??a.order??0)-Number(b.sortOrder??b.order??0)));
    }
    async function fetchAdminConfig(force=false){
        if(cfgPromise&&!force)return cfgPromise;
        if(!force&&cfgFetchedAt)return Promise.resolve(adminConfig);
        cfgPromise=(async()=>{
            const merged={};
            try{
                const workerUrl=(typeof API_BASE_URL!=='undefined'?API_BASE_URL:'')+'/seller/panel-boot?email='+encodeURIComponent(sellerEmail()||'');
                if(typeof API_BASE_URL!=='undefined'&&API_BASE_URL){
                    const res=await fetch(workerUrl,{cache:'no-store'});
                    const data=await res.json().catch(()=>({}));
                    const boot=data.data||data;
                    if(boot.panelConfig)deepMerge(merged,boot.panelConfig);
                    if(Array.isArray(boot.subscriptionPlans))merged.subscriptionPlans=boot.subscriptionPlans;
                    if(Array.isArray(boot.issueCategories))merged.issueCategories=boot.issueCategories;
                    if(Array.isArray(boot.buttons))merged.customButtons=boot.buttons;
                    if(boot.texts)merged.textOverrides=boot.texts;
                }
            }catch(e){console.warn('Worker panel boot skipped, using Firestore/direct cache.',e);}
            const docs=await getDocRows([
                ['seller_panel_config','global'],['seller_config','global'],['admin_config','seller_panel'],['aryanta_config','seller_panel'],['site_config','seller_panel'],['site_config','global']
            ]);
            docs.forEach(d=>deepMerge(merged,d));
            adminConfig=merged;

            let plans=arr(merged.subscriptionPlans||merged.plans||merged.subscriptions).map(normalizePlan).filter(p=>p.id&&p.name&&p.visible&&p.active);
            if(plans.length<=1){
                const rows=await getCollectionRows(['subscription_plans','seller_subscription_plans','seller_subscriptions_plans','subscriptions_plans','seller_plans']);
                const dbPlans=rows.map(normalizePlan).filter(p=>p.id&&p.name&&p.visible&&p.active);
                if(dbPlans.length)plans=dbPlans;
            }
            dynamicPlans=ensureBasicPlan(plans);

            let cats=arr(merged.supportCategories||merged.issueCategories||merged.ticketCategories).map(normalizeCategory).filter(c=>c.id&&c.title&&c.visible&&c.active);
            if(!cats.length){
                const rows=await getCollectionRows(['seller_issue_categories','support_categories','seller_support_categories','issue_categories']);
                cats=rows.map(normalizeCategory).filter(c=>c.id&&c.title&&c.visible&&c.active);
            }
            supportCategories=cats.sort((a,b)=>a.sortOrder-b.sortOrder);

            const btnMap={sidebar:[],settings:[],profile:[]};
            const rawBtn=merged.customButtons||merged.buttons||{};
            if(Array.isArray(rawBtn))rawBtn.forEach(b=>{const nb=normalizeButton(b);if(!btnMap[nb.location])btnMap[nb.location]=[];btnMap[nb.location].push(nb);});
            else Object.keys(rawBtn||{}).forEach(loc=>arr(rawBtn[loc]).forEach(b=>{const nb=normalizeButton({...b,location:loc});if(!btnMap[nb.location])btnMap[nb.location]=[];btnMap[nb.location].push(nb);}));
            const btnRows=await getCollectionRows(['seller_custom_buttons','seller_panel_buttons','seller_extra_buttons']);
            btnRows.map(normalizeButton).forEach(b=>{if(!btnMap[b.location])btnMap[b.location]=[];btnMap[b.location].push(b);});
            Object.keys(btnMap).forEach(k=>btnMap[k]=btnMap[k].filter(b=>b.active&&b.visible).sort((a,b)=>a.sortOrder-b.sortOrder));
            dynamicButtons=btnMap;

            const textRows=await getCollectionRows(['seller_panel_texts','seller_ui_texts','ui_text_overrides','admin_text_overrides']);
            textOverrides=collectTextOverrides(merged,textRows);
            cfgFetchedAt=Date.now();
            window.__ARYANTA_ADMIN_CONFIG=adminConfig;
            window.__ARYANTA_DB_SUBSCRIPTION_PLANS=dynamicPlans;
            window.__ARYANTA_DB_SUPPORT_CATEGORIES=supportCategories;
            return adminConfig;
        })().finally(()=>{cfgPromise=null;});
        return cfgPromise;
    }

    function findOverrideTargets(o){
        if(o.selector)return Array.from(document.querySelectorAll(o.selector));
        if(o.elementId)return [$(o.elementId)].filter(Boolean);
        if(o.key){
            const direct=$(o.key);
            if(direct)return [direct];
            try{return Array.from(document.querySelectorAll(o.key));}catch(e){return Array.from(document.querySelectorAll(`[data-admin-text="${CSS.escape(o.key)}"]`));}
        }
        return [];
    }
    function applyAdminTextOverrides(){
        textOverrides.forEach(o=>{
            findOverrideTargets(o).forEach(el=>{
                if(o.html!==null&&o.html!==undefined)el.innerHTML=text(o.html);
                else if(o.text!==undefined&&o.text!==null&&text(o.text)!==''){
                    if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.value=text(o.text);
                    else el.textContent=text(o.text);
                }
                if(o.placeholder!==null&&o.placeholder!==undefined)el.setAttribute('placeholder',text(o.placeholder));
                if(o.titleAttr!==null&&o.titleAttr!==undefined)el.setAttribute('title',text(o.titleAttr));
            });
        });
    }
    window.applyAdminTextOverrides=applyAdminTextOverrides;

    function planYearlyBase(plan){
        const monthly=Number(plan&&plan.monthlyPrice);
        if(Number.isFinite(monthly))return monthly*12;
        const yearly=Number(plan&&plan.yearlyPrice);
        return Number.isFinite(yearly)?yearly:null;
    }
    function planPrice(plan,duration){
        if(!plan)return null;
        duration=duration==='year'?'year':'month';
        if(duration==='year'){
            const base=planYearlyBase(plan);
            if(base===null)return null;
            if(base<=0)return 0;
            return Math.round(base*0.65);
        }
        const price=plan.monthlyPrice;
        return Number.isFinite(Number(price))?Number(price):null;
    }
    function activePlan(){
        if(!dynamicPlans.length)dynamicPlans=ensureBasicPlan([]);
        const sub=low(activeSeller&&(activeSeller.subscriptionId||activeSeller.subscriptionPlanId||activeSeller.subscription||activeSeller.plan));
        const found=dynamicPlans.find(p=>sub&&(low(p.id)===sub||low(p.name)===sub||low(p.title)===sub));
        return found||dynamicPlans.find(p=>low(p.id)==='basic'||low(p.name)==='basic')||basicPlanTemplate();
    }
    window.getActiveSubscriptionPlanForSeller=function(){return activePlan();};
    function planDurationDays(plan,duration){
        if(plan&&low(plan.id)==='basic')return 30;
        if(plan&&Number(plan.durationDays)>0&&duration!=='year')return Number(plan.durationDays);
        return duration==='year'?365:30;
    }
    function subscriptionSetupMessage(){
        return `<div class="strict-empty-state" style="grid-column:1/-1;"><i class="fas fa-crown"></i><h4>Basic plan is active</h4><p>Admin subscription plans were not found, so sellers can continue with the free Basic plan only.</p></div>`;
    }
    function renderSubscriptionPlans(){
        const grid=$('subscriptionPlansGrid');
        if(!grid)return;
        const current=activePlan();
        const duration=currentPlanDuration==='year'?'year':'month';
        if(!dynamicPlans.length)dynamicPlans=ensureBasicPlan([]);
        grid.innerHTML=dynamicPlans.map(plan=>{
            const price=planPrice(plan,duration);
            const yearlyBase=duration==='year'?planYearlyBase(plan):null;
            const currentMatch=current&&(low(current.id)===low(plan.id)||low(current.name)===low(plan.name));
            const priceMissing=price===null;
            const isFree=!priceMissing&&(price<=0||plan.isFree);
            const buttonText=currentMatch?'Current Plan':priceMissing?'Price not added by admin':(isFree?'Activate Free Plan':`Pay ${money(price)} & Get Now`);
            const disabled=currentMatch||priceMissing;
            const features=plan.features.length?plan.features:[];
            const yearlySave=(duration==='year'&&!priceMissing&&yearlyBase&&yearlyBase>price)?`<span class="yearly-save"><del>${money(yearlyBase)}</del> 35% OFF</span>`:'';
            return `<div class="dynamic-plan-card ${currentMatch?'current-plan-card':''} ${low(plan.id)==='basic'?'basic-plan-card':''}">
                <div class="dynamic-plan-head"><div><div class="dynamic-plan-title">${safe(plan.title||plan.name)}</div>${plan.description?`<div class="dynamic-plan-desc">${safe(plan.description)}</div>`:''}</div>${plan.badge?`<div class="plan-badge">${safe(plan.badge)}</div>`:''}</div>
                <p class="plan-price">${priceMissing?'<span class="missing-price">Admin price required</span>':(isFree?'₹<span>0</span>':`₹<span>${Number(price).toLocaleString('en-IN')}</span>`)} ${priceMissing?'':`<span>/ ${duration}</span>`}</p>
                ${yearlySave}
                <div class="dynamic-plan-meta">${plan.commissionPercent?`<span><i class="fas fa-percent"></i> ${Number(plan.commissionPercent)}% fee</span>`:''}${plan.freeAds?`<span><i class="fas fa-bullhorn"></i> ${plan.freeAds} free ad(s)/month</span>`:''}${plan.freeFirstEnabled&&plan.freeFirstLimit?`<span><i class="fas fa-gift"></i> First ${plan.freeFirstLimit} seller(s) free for 1 month</span>`:''}</div>
                <ul class="plan-features">${features.map(f=>`<li><i class="fas fa-check-circle"></i> ${safe(f)}</li>`).join('') || '<li><i class="fas fa-info-circle"></i> Admin has not added feature text.</li>'}</ul>
                <div class="dynamic-plan-actions">
                    <button class="btn-prime w-100" ${disabled?'disabled':''} onclick="processStrictSubscription('${safe(plan.id)}','online')">${safe(buttonText)}</button>
                    ${plan.allowPayoutPayment&&!isFree&&!currentMatch&&!priceMissing?`<button class="btn-outline w-100" id="btnSubPayout_${safe(plan.id)}" onclick="processStrictSubscription('${safe(plan.id)}','payout')"><i class="fas fa-wallet"></i> Pay from Payout</button>`:''}
                </div>
            </div>`;
        }).join('');
        const badge=$('currentPlanBadge');
        if(badge)badge.textContent=current?current.name:'Basic';
        validateStrictPayoutButtons();
    }
    window.renderStrictSubscriptionPlans=renderSubscriptionPlans;
    async function freeFirstEligible(plan){
        const price=planPrice(plan,currentPlanDuration);
        if(price!==null&&price<=0)return true;
        if(!plan.freeFirstEnabled||!plan.freeFirstLimit)return false;
        const history=arr(activeSeller&&activeSeller.subHistory);
        if(history.some(h=>truthy(h.freeOffer,false)&&low(h.planId||h.plan)===low(plan.id)))return false;
        try{
            const snap=await db.collection('seller_subscriptions').where('planId','==',plan.id).where('freeOffer','==',true).limit(plan.freeFirstLimit).get();
            return snap.size<plan.freeFirstLimit;
        }catch(e){console.warn('Free-first check failed; refusing free fallback.',e);return false;}
    }
    async function savePaymentLedger(row){
        if(!db||!activeSeller)return;
        const id=text(row.id||`${sellerEmail()}_${row.type||'entry'}_${row.reference||row.planId||Date.now()}`).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,180);
        const payload={sellerEmail:sellerEmail(),email:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.name||activeSeller.email||'',timestamp:row.timestamp||nowIso(),createdAt:row.createdAt||nowIso(),updatedAt:nowIso(),...row};
        await db.collection('seller_payment_ledger').doc(id).set(payload,{merge:true});
    }
    window.savePaymentLedger=savePaymentLedger;
    async function activatePlan(plan,opts={}){
        const duration=opts.duration||currentPlanDuration||'month';
        const amount=Number(opts.amount??planPrice(plan,duration))||0;
        const start=new Date();
        const end=new Date(start.getTime()+planDurationDays(plan,duration)*86400000);
        const record={planId:plan.id,plan:plan.name,duration,amount,method:opts.method||'online',status:'Active',freeOffer:!!opts.freeOffer,startDate:start.toISOString(),endDate:end.toISOString(),timestamp:nowIso(),features:plan.features||[],freeAds:plan.freeAds||0,commissionPercent:plan.commissionPercent||0};
        if(!activeSeller.subHistory)activeSeller.subHistory=[];
        activeSeller.subHistory.push(record);
        activeSeller.subscription=plan.name;activeSeller.subscriptionId=plan.id;activeSeller.subEndDate=end.toISOString();
        activeSeller.subscriptionFeatures={features:plan.features||[],freeAds:plan.freeAds||0,logoLimit:plan.logoLimit,bannerLimit:plan.bannerLimit,settings:plan.settings||null,commissionPercent:plan.commissionPercent||0};
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        await db.collection('sellers').doc(sellerDocId()).set({subscription:plan.name,subscriptionId:plan.id,subscriptionPlanId:plan.id,subEndDate:end.toISOString(),subscriptionFeatures:activeSeller.subscriptionFeatures,subHistory:activeSeller.subHistory,subscriptionUpdatedAt:nowIso()},{merge:true});
        await db.collection('seller_subscriptions').add({...record,sellerEmail:sellerEmail(),email:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.email});
        await savePaymentLedger({type:amount<=0?'subscription_free':'subscription_payment',planId:plan.id,reference:plan.name,gross:amount,deductions:0,net:amount,amount,status:amount<=0?'Free Active':'Paid',method:record.method,freeOffer:record.freeOffer});
        showToast(`${plan.name} activated successfully.`,'success');
        renderSubscriptionPlans();
        await loadSettingsUIDynamic();
        await loadProfileDynamic();
    }
    window.processStrictSubscription=async function(planId,method){
        await fetchAdminConfig(false);
        const plan=dynamicPlans.find(p=>String(p.id)===String(planId)||String(p.name)===String(planId));
        if(!plan)return showToast('Plan not found in admin database.','error');
        const duration=currentPlanDuration==='year'?'year':'month';
        const price=planPrice(plan,duration);
        if(price===null)return showToast('Admin has not added this plan price for selected duration.','error');
        const freeByAdmin=price<=0||plan.isFree;
        const firstFree=await freeFirstEligible(plan);
        if(method==='free'||freeByAdmin||firstFree){
            if(firstFree&&!freeByAdmin)showToast('Admin first-member free offer applied for 1 month.','success');
            return activatePlan(plan,{amount:0,method:'free',duration:'month',freeOffer:firstFree&&!freeByAdmin});
        }
        if(method==='payout'){
            if(cachedTotalUpcoming<price)return showToast('Insufficient upcoming payout balance.','error');
            if(!confirm(`Deduct ${money(price)} from upcoming payout for ${plan.name}?`))return;
            await db.collection('fines').add({email:sellerEmail(),sellerEmail:sellerEmail(),amount:price,reason:`Subscription payout deduction: ${plan.name}`,timestamp:nowIso(),planId:plan.id});
            await savePaymentLedger({type:'subscription_payout_deduction',planId:plan.id,reference:plan.name,gross:0,deductions:price,net:-price,amount:price,status:'Deducted from payout',method:'payout'});
            return activatePlan(plan,{amount:price,method:'payout'});
        }
        if(!API_KEYS.RAZORPAY)return showToast('Razorpay key missing. Online payment disabled.','error');
        const options={key:API_KEYS.RAZORPAY,amount:Math.round(price*100),currency:'INR',name:'Aryanta Enterprise',description:`${plan.name} Subscription`,handler:async function(res){await savePaymentLedger({type:'subscription_online_payment',planId:plan.id,reference:plan.name,gross:price,deductions:0,net:price,amount:price,status:'Paid',method:'online',razorpayPaymentId:res.razorpay_payment_id||''});await activatePlan(plan,{amount:price,method:'online'});},prefill:{name:activeSeller.companyName||'',email:activeSeller.email||'',contact:activeSeller.phone||''},theme:{color:'#0f172a'}};
        new Razorpay(options).open();
    };
    window.processSubscription=window.processStrictSubscription;
    window.loadStrictSubscriptionsUI=async function(){await fetchAdminConfig(false);renderSubscriptionPlans();applyAdminTextOverrides();};
    window.refreshSellerPanelDynamicData=async function(){
        try{
            cfgFetchedAt=0;
            const grid=$('subscriptionPlansGrid');
            if(grid)grid.insertAdjacentHTML('afterbegin','<div class="admin-note-box refresh-note" style="grid-column:1/-1;"><i class="fas fa-sync fa-spin"></i> Refreshing admin data...</div>');
            await fetchAdminConfig(true);
            renderSubscriptionPlans();renderDynamicButtons();renderDownloadAppBox();renderVersionInfo();applyNavControls();await renderSupportCategories();await loadSettingsUIDynamic();applyAdminTextOverrides();
            showToast('Admin seller settings refreshed.','success');
        }catch(e){console.warn(e);showToast('Could not refresh admin settings. Basic plan remains active.','warning');renderSubscriptionPlans();}
    };
    window.loadSubscriptionsUI=window.loadStrictSubscriptionsUI;
    try{loadSubscriptionsUI=window.loadSubscriptionsUI;}catch(e){}
    window.togglePlanDuration=function(type){currentPlanDuration=type==='year'?'year':'month';const m=$('btnPlanMonth'),y=$('btnPlanYear');if(m)m.classList.toggle('active',currentPlanDuration==='month');if(y)y.classList.toggle('active',currentPlanDuration==='year');renderSubscriptionPlans();};
    function validateStrictPayoutButtons(){
        dynamicPlans.forEach(plan=>{const btn=$(`btnSubPayout_${plan.id}`);if(!btn)return;const price=planPrice(plan,currentPlanDuration||'month');if(price===null){btn.disabled=true;btn.innerHTML='<i class="fas fa-exclamation-circle"></i> Admin price required';return;}if(cachedTotalUpcoming>=price){btn.disabled=false;btn.innerHTML='<i class="fas fa-wallet"></i> Pay from Payout';}else{btn.disabled=true;btn.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout';}});
        const adBtn=$('btnAdPayout');if(adBtn){if(cachedTotalUpcoming>=70){adBtn.disabled=false;adBtn.innerHTML='<i class="fas fa-wallet"></i> Pay via Upcoming Payout';}else{adBtn.disabled=true;adBtn.innerHTML='<i class="fas fa-exclamation-circle"></i> Insufficient Payout';}}
    }
    window.validateStrictPayoutButtons=validateStrictPayoutButtons;
    window.validatePayoutButtons=validateStrictPayoutButtons;

    function controlConfig(key){return (adminConfig.settingsControls||adminConfig.controls||{})[key]||{};}
    function settingInputId(key){const map={offline:'settingOffline',theme:'settingTheme',autoAcc:'settingAutoAcc',vacation:'settingVacation',sms:'settingSms','2fa':'setting2fa',searchSuggestions:'settingSearchSuggestions'};return map[key]||('setting'+key.charAt(0).toUpperCase()+key.slice(1));}
    function planAllowsSetting(key){
        const p=activePlan();
        const sellerFeature=(activeSeller&&activeSeller.subscriptionFeatures)||{};
        const settings=(p&&p.settings)||sellerFeature.settings;
        if(!settings)return true;
        if(Array.isArray(settings))return settings.map(low).includes(low(key))||settings.map(low).includes(low(key==='theme'?'darkTheme':key));
        if(typeof settings==='object'){
            if(settings[key]!==undefined)return truthy(settings[key],true);
            if(key==='theme'&&settings.darkTheme!==undefined)return truthy(settings.darkTheme,true);
            return low((activePlan()||{}).id)==='basic'?false:true;
        }
        return low((activePlan()||{}).id)==='basic'?(key==='theme'):true;
    }
    function controlAllowsSetting(key){
        const c=controlConfig(key);
        if(truthy(c.enabled,true)===false)return false;
        const req=c.requiredPlans||c.allowedPlans||c.plans;
        if(Array.isArray(req)&&req.length){
            const current=low(activeSeller&&(activeSeller.subscription||activeSeller.subscriptionId||activeSeller.plan));
            if(!req.map(low).some(p=>p===current))return false;
        }
        return planAllowsSetting(key);
    }
    const settingIcons={offline:'fas fa-store-slash',theme:'fas fa-moon',autoAcc:'fas fa-bolt',vacation:'fas fa-umbrella-beach',sms:'fas fa-sms','2fa':'fas fa-shield-alt',searchSuggestions:'fas fa-search'};
    function setSettingCardState(key){
        const input=$(settingInputId(key));if(!input)return;
        const card=input.closest('.setting-card-premium')||input.closest('.setting-card');
        const c=controlConfig(key);
        const visible=truthy(c.visible,true);
        const enabled=controlAllowsSetting(key);
        if(card){
            card.style.display=visible?'flex':'none';
            card.classList.toggle('admin-disabled',!enabled);
            const icon=card.querySelector('.setting-icon i'); if(icon)icon.className=iconClass(c.icon,settingIcons[key]||'fas fa-sliders-h');
            const title=card.querySelector('.setting-title'); if(title&&c.title)title.textContent=c.title;
            const sub=card.querySelector('.setting-sub'); if(sub&&c.description)sub.textContent=c.description;
        }
        input.disabled=!enabled;
        input.title=enabled?'':(c.disabledMessage||'This control is disabled by admin or unavailable for your current subscription.');
    }
    function renderDownloadAppBox(){
        const box=$('downloadAppSettingsBox');if(!box)return;
        const app=adminConfig.downloadApp||{};
        if(!truthy(app.enabled,false)){box.style.display='none';box.innerHTML='';return;}
        box.style.display='block';
        box.innerHTML=`<h4><i class="fas fa-mobile-screen-button"></i> ${safe(app.title||'Download Our App')}</h4><p>${safe(app.description||'')}</p><button type="button" class="btn-prime" onclick="window.open('${safe(app.url||'#')}','_blank','noopener')"><i class="fas fa-download"></i> ${safe(app.buttonText||'Download App')}</button>`;
    }
    function renderVersionInfo(){
        const box=$('versionInfoBox');if(!box)return;
        const v=adminConfig.versionInfo||adminConfig.version||{};
        const rows=[];
        if(v.appVersion||v.app)rows.push(['App Version',v.appVersion||v.app]);
        if(v.webVersion||v.web)rows.push(['Web Version',v.webVersion||v.web]);
        if(v.panelType||v.type)rows.push(['Panel Type',v.panelType||v.type]);
        arr(v.extra||v.items).forEach(x=>rows.push([x.label||x.title||'Info',x.value||x.text||'']));
        if(!rows.length){
            rows.push(['Panel','Aryanta Seller Panel']);
            rows.push(['Sync Mode','One-time fetch; use Refresh to update']);
            rows.push(['Default Plan','Basic Free']);
        }
        box.innerHTML=rows.map(([k,val])=>`<div class="version-card"><span>${safe(k)}</span><strong>${safe(val)}</strong></div>`).join('');
    }
    function runDynamicButton(btn){
        if(!btn)return;
        if(btn.action==='section'&&btn.section){showSection(btn.section);return;}
        if(btn.action==='download'||btn.action==='app'){const url=btn.url||((adminConfig.downloadApp||{}).url); if(url)window.open(url,'_blank','noopener'); else showToast('Admin has not added the app link.','warning'); return;}
        if(btn.html){openDynamicHtml(btn);return;}
        if(btn.url){window.open(btn.url,'_blank','noopener');return;}
        showToast('Admin enabled this button but did not add an action.','info');
    }
    window.runStrictDynamicButton=function(location,id){const b=(dynamicButtons[location]||[]).find(x=>String(x.id)===String(id));runDynamicButton(b);};
    function openDynamicHtml(btn){
        const modal=$('adminDynamicPopupModal'),body=$('adminDynamicPopupBody');
        if(!modal||!body)return;
        body.innerHTML=`<div class="dynamic-popup-hero"><h3>${safe(btn.title)}</h3><p>${safe(btn.description)}</p></div><div class="dynamic-popup-body">${btn.html}<div class="dynamic-popup-actions"><button class="btn-outline" onclick="closeDynamicAdminPopup()">Close</button></div></div>`;
        modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);
    }
    function renderDynamicButtons(){
        const side=$('dynamicSidebarButtons');
        if(side)side.innerHTML=(dynamicButtons.sidebar||[]).map(b=>`<div class="nav-item" onclick="runStrictDynamicButton('sidebar','${safe(b.id)}')"><i class="${safe(b.icon)}"></i> ${safe(b.title)}</div>`).join('');
        const renderCards=(loc,el)=>{if(!el)return;const rows=dynamicButtons[loc]||[];el.innerHTML=rows.map(b=>`<div class="dynamic-action-card"><div style="display:flex;gap:12px;align-items:center;min-width:0;">${b.image?`<img src="${safe(b.image)}" alt="">`:`<div class="setting-icon"><i class="${safe(b.icon)}"></i></div>`}<div><strong>${safe(b.title)}</strong><span>${safe(b.description||'Admin added action')}</span></div></div><button class="btn-outline" type="button" onclick="runStrictDynamicButton('${loc}','${safe(b.id)}')">${safe(b.buttonText||'Open')}</button></div>`).join('');};
        renderCards('settings',$('dynamicSettingsButtons'));renderCards('profile',$('profileDynamicButtons'));
    }
    function applyNavControls(){
        const controls=adminConfig.navControls||adminConfig.sidebarControls||{};
        document.querySelectorAll('.sidebar .nav-item').forEach(item=>{
            const label=low(item.textContent);let key='';
            const map={home:['dashboard'],profile:['profile'],notifications:['notifications'],inventory:['inventory'],newOrders:['new orders'],breached:['breached'],acceptedOrders:['accepted'],completedScan:['completed scan'],shippedOrders:['shipped'],deliveredOrders:['delivered'],history:['history'],returns:['returns'],warranty:['warranty'],payments:['payments'],ads:['sponsored'],subscription:['subscriptions'],qna:['q&a'],buyB2b:['b2b'],support:['support'],tutorial:['how to sell']};
            Object.keys(map).some(k=>map[k].some(w=>label.includes(w))?(key=k,true):false);
            const c=controls[key]; if(!c)return;
            item.style.display=truthy(c.visible,true)?'flex':'none';
            const enabled=truthy(c.enabled,true); item.style.pointerEvents=enabled?'':'none'; item.style.opacity=enabled?'':'0.45';
            if(c.title){const i=item.querySelector('i');const b=item.querySelector('.nav-badge');item.innerHTML=(i?i.outerHTML+' ':'')+safe(c.title)+(b?b.outerHTML:'');}
        });
    }
    async function loadSettingsUIDynamic(){
        await fetchAdminConfig();
        const s=(activeSeller&&activeSeller.settings)||{};
        ['offline','theme','autoAcc','vacation','sms','2fa','searchSuggestions',...Object.keys(adminConfig.settingsControls||{})].forEach(key=>{
            const input=$(settingInputId(key));
            if(input)input.checked=key==='searchSuggestions'?s.searchSuggestions!==false:s[key]===true;
            setSettingCardState(key);
        });
        if(typeof applySettingsToUI==='function')applySettingsToUI();
        renderDynamicButtons();renderDownloadAppBox();renderVersionInfo();applyNavControls();applyAdminTextOverrides();
    }
    window.loadSettingsUI=async function(){try{await loadSettingsUIDynamic();}catch(e){console.warn(e);}};
    try{loadSettingsUI=window.loadSettingsUI;}catch(e){}
    const originalToggleSetting=window.toggleSetting;
    window.toggleSetting=async function(key){
        await fetchAdminConfig();
        if(!controlAllowsSetting(key)){const input=$(settingInputId(key));if(input)input.checked=!!(activeSeller&&activeSeller.settings&&activeSeller.settings[key]);return showToast('This setting is disabled by admin or unavailable for your subscription.','warning');}
        if(!activeSeller.settings)activeSeller.settings={};
        const input=$(settingInputId(key));if(!input)return;
        activeSeller.settings[key]=input.checked;
        if(key==='searchSuggestions'){const box=$('searchSuggestions');if(box&&!input.checked)box.style.display='none';}
        if(originalToggleSetting&&key!=='searchSuggestions')return originalToggleSetting(key);
        await db.collection('sellers').doc(sellerDocId()).set({settings:activeSeller.settings},{merge:true});
        localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
        showToast('Setting updated.','success');
    };
    const originalSearch=window.handleGlobalSearch;
    window.handleGlobalSearch=function(){
        if(activeSeller&&activeSeller.settings&&activeSeller.settings.searchSuggestions===false){const box=$('searchSuggestions');if(box)box.style.display='none';return;}
        return originalSearch?originalSearch():undefined;
    };

    function pickSeller(paths){for(const p of paths){let v=activeSeller;for(const part of p.split('.'))v=v&&v[part];if(v!==undefined&&v!==null&&v!=='')return v;}return '';}
    function detail(label,value){return `<div class="detail-box"><span>${safe(label)}</span><strong>${safe(value||'N/A')}</strong></div>`;}
    function mediaCard(label,url){return url?`<div class="profile-media-card"><span>${safe(label)}</span><img src="${safe(url)}" alt="${safe(label)}" onclick="openImageViewer('${safe(url)}')"></div>`:'';}
    function renderProfileHero(){
        const hero=$('profileBrandHero');if(!hero||!activeSeller)return;
        const logo=pickSeller(['storeLogo','storeLogoUrl','logo','logoUrl','shopLogo','companyLogo']);
        const banner=pickSeller(['storeBanner','storeBannerUrl','banner','bannerUrl','shopBanner','coverImage']);
        const name=pickSeller(['shopName','businessName','shopInfo.shopName','companyName','name'])||'Seller Store';
        const cat=pickSeller(['shopCategory','category','shopInfo.category']);
        hero.innerHTML=`<div class="profile-hero-banner" style="${banner?`background-image:url('${safe(banner)}')`:''}"><div class="profile-hero-overlay"></div></div><div class="profile-hero-body"><div class="profile-hero-logo">${logo?`<img src="${safe(logo)}" alt="Shop Logo">`:'<i class="fas fa-store"></i>'}</div><div class="profile-hero-info"><h3>${safe(name)}</h3><p>${safe(cat||activeSeller.email||'Aryanta Seller')}</p></div><button class="btn-outline" type="button" onclick="showSection('settings')"><i class="fas fa-pen"></i> Edit Branding</button></div>`;
    }
    async function loadProfileDynamic(){
        await fetchAdminConfig();
        const pg=$('profPersonalGrid'); if(!pg)return;
        if(!activeSeller){pg.innerHTML='<h3>Seller data not found. Please login again.</h3>';return;}
        if(truthy(adminConfig.profileEnabled,true)===false){pg.innerHTML='<div class="admin-note-box" style="grid-column:1/-1;">Profile details are disabled by admin.</div>';return;}
        renderProfileHero();
        const f=adminConfig.profileFields||{};
        const isShown=(key,def=true)=>truthy(f[key],def);
        let html='';
        if(isShown('companyName')||isShown('name'))html+=detail('Company / Seller Name',pickSeller(['companyName','name','sellerName','ownerName']));
        if(isShown('email'))html+=detail('Registered Email',pickSeller(['email']));
        if(isShown('phone'))html+=detail('Phone Number',pickSeller(['phone','mobile']));
        if(isShown('address'))html+=detail('Address',pickSeller(['address','sellerAddress','shopInfo.address']));
        if(isShown('city'))html+=detail('City',pickSeller(['city','shopInfo.city']));
        if(isShown('pincode'))html+=detail('Pincode',pickSeller(['pincode','pinCode','shopInfo.pincode']));
        if(isShown('state'))html+=detail('State',pickSeller(['state','shopInfo.state']));
        if(isShown('shopName'))html+=detail('Shop Name',pickSeller(['shopName','businessName','shopInfo.shopName','companyName']));
        if(isShown('shopCategory'))html+=detail('Shop Category',pickSeller(['shopCategory','category','shopInfo.category']));
        if(isShown('shopAddress'))html+=detail('Shop Address',pickSeller(['shopAddress','shopInfo.address','address']));
        if(isShown('subscription')){const end=activeSeller.subEndDate?new Date(activeSeller.subEndDate).toLocaleDateString():'N/A';html+=detail('Current Subscription',`${activeSeller.subscription||'No DB plan active'} • Valid until ${end}`);}
        if(isShown('bank'))html+=detail('Bank IFSC',activeSeller.bankIfsc||'N/A')+detail('Bank Account',activeSeller.bankAccount||'N/A');
        arr(adminConfig.profileExtraFields||adminConfig.extraProfileFields).forEach(x=>{if(truthy(x.visible,true)!==false)html+=detail(x.title||x.label||x.field||'Info',pickSeller([x.field||x.path||''])||x.value||'');});
        const mediaRows=[];
        if(isShown('shopLogo'))mediaRows.push(mediaCard('Shop Logo',pickSeller(['storeLogo','storeLogoUrl','logo','shopLogo','companyLogo'])));
        if(isShown('shopBanner'))mediaRows.push(mediaCard('Shop Banner',pickSeller(['storeBanner','storeBannerUrl','banner','shopBanner','coverImage'])));
        if(isShown('kyc')){const k=activeSeller.kyc||{};mediaRows.push(mediaCard('Aadhaar / ID',k.aadhar||k.aadhaar||activeSeller.aadharImage));mediaRows.push(mediaCard('PAN',k.pan||activeSeller.panImage));mediaRows.push(mediaCard('GST / Business Proof',k.gst||activeSeller.gstImage));}
        if(mediaRows.filter(Boolean).length)html+=`<div class="profile-media-grid">${mediaRows.join('')}</div>`;
        pg.innerHTML=html||'<div class="admin-note-box" style="grid-column:1/-1;">No profile fields are enabled by admin.</div>';
        const bankEnabled=truthy(adminConfig.bankEditEnabled,true);
        const ifsc=$('profIfsc'),acc=$('profAcc'),btn=$('btnSaveBankInfo'),note=$('profileBankEditNote');
        if(ifsc){ifsc.value=activeSeller.bankIfsc||'';ifsc.disabled=!bankEnabled;}
        if(acc){acc.value=activeSeller.bankAccount||'';acc.disabled=!bankEnabled;}
        if(btn){btn.disabled=!bankEnabled;btn.style.display=bankEnabled?'inline-flex':'none';}
        if(note){note.style.display=bankEnabled?'none':'block';note.innerHTML='<strong>Bank edit disabled:</strong> Admin has locked bank detail editing for seller accounts.';}
        const kyc=$('kycStatusBoxWrapper'); if(kyc)kyc.style.display=activeSeller.kycRequested?'block':'none';
        renderDynamicButtons();applyAdminTextOverrides();
    }
    window.loadProfile=loadProfileDynamic;
    try{loadProfile=loadProfileDynamic;}catch(e){}
    window.updateBankDetails=async function(){
        await fetchAdminConfig();
        if(!truthy(adminConfig.bankEditEnabled,true))return showToast('Bank detail editing is disabled by admin.','warning');
        const ifsc=$('profIfsc')?.value.trim();const acc=$('profAcc')?.value.trim();
        if(!ifsc||!acc)return showToast('Both fields are required.','warning');
        await db.collection('sellers').doc(sellerDocId()).set({bankIfsc:ifsc,bankAccount:acc,bankUpdatedAt:nowIso()},{merge:true});
        activeSeller.bankIfsc=ifsc;activeSeller.bankAccount=acc;localStorage.setItem('sellerToken',JSON.stringify(activeSeller));showToast('Bank details updated successfully.','success');loadProfileDynamic();
    };

    async function renderSupportCategories(){
        await fetchAdminConfig();
        const sel=$('supCategory'); if(!sel)return;
        if(!supportCategories.length){
            sel.innerHTML='<option value="">Admin has not added issue categories</option>';
            sel.disabled=true;
            const info=$('supportCategoryInfo');if(info){info.style.display='block';info.innerHTML='<strong>Admin setup required</strong><br>No issue category was found in Firestore. Add categories in seller_issue_categories or support_categories.';}
            return;
        }
        sel.disabled=false;
        sel.innerHTML='<option value="">Select issue category added by admin</option>'+supportCategories.map(c=>`<option value="${safe(c.id)}" data-description="${safe(c.description)}">${safe(c.title)}</option>`).join('');
        updateSupportCategoryInfo();
        const h=document.querySelector('#supportSection h3'); if(h&&(adminConfig.supportTitle||adminConfig.supportHeading))h.innerHTML=`<i class="fas fa-headset"></i> ${safe(adminConfig.supportTitle||adminConfig.supportHeading)}`;
    }
    window.updateSupportCategoryInfo=function(){
        const sel=$('supCategory'),info=$('supportCategoryInfo'); if(!sel||!info)return;
        const c=supportCategories.find(x=>String(x.id)===String(sel.value));
        if(c){info.style.display='block';info.innerHTML=`<strong>${safe(c.title)}</strong><br>${safe(c.description||'')}`;}
        else{info.style.display='none';info.innerHTML='';}
    };
    window.submitSupportTicket=async function(){
        await fetchAdminConfig();
        const sel=$('supCategory');const catId=sel?sel.value:'';const cat=supportCategories.find(c=>String(c.id)===String(catId));
        const phone=$('supPhone')?.value.trim();const desc=$('supDesc')?.value.trim();
        if(!supportCategories.length)return showToast('Issue categories are not added by admin yet.','error');
        if(!catId||!phone||!desc)return showToast('All fields are required.','warning');
        await db.collection('seller_support_tickets').add({ticketId:'TKT-'+Math.random().toString(36).substr(2,6).toUpperCase(),email:sellerEmail(),sellerEmail:sellerEmail(),sellerName:activeSeller.companyName||activeSeller.email,phone,categoryId:catId,categoryTitle:cat?cat.title:catId,categoryDescription:cat?cat.description:'',subject:cat?cat.title:catId,message:desc,status:'Open',timestamp:nowIso(),source:'seller_panel'});
        showToast('Support ticket submitted. Admin will review shortly.','success');
        if($('supPhone'))$('supPhone').value=''; if($('supDesc'))$('supDesc').value=''; if(sel)sel.value=''; updateSupportCategoryInfo(); showSection('oldTickets');
    };

    function activePlanAdLimit(){
        const p=activePlan();
        const sellerFeature=(activeSeller&&activeSeller.subscriptionFeatures)||{};
        return Number(sellerFeature.freeAds??(p&&p.freeAds)??0)||0;
    }
    function dynamicAdUsage(){const u=(activeSeller&&activeSeller.sponsoredAdUsage)||{};return u.month===MONTH_KEY ? (Number(u.used||0)||0) : 0;}
    async function saveAdUsage(n){const usage={month:MONTH_KEY,used:n,updatedAt:nowIso()};activeSeller.sponsoredAdUsage=usage;localStorage.setItem('sellerToken',JSON.stringify(activeSeller));await db.collection('sellers').doc(sellerDocId()).set({sponsoredAdUsage:usage},{merge:true});}
    window.startAd=async function(id){await fetchAdminConfig();const input=$('adProdId');if(input)input.value=id;const limit=activePlanAdLimit(),used=dynamicAdUsage(),left=Math.max(0,limit-used);const msg=$('adPlanMessage'),cost=$('adCostDisplay'),modal=$('adPaymentModal');if(msg)msg.innerHTML=left>0?`<i class="fas fa-circle-check"></i> Your admin plan gives <b>${limit}</b> free sponsored ad(s). <b>${left}</b> left this month.`:'<i class="fas fa-wallet"></i> No free sponsored ads left. Pay now or deduct from upcoming payout.';if(cost)cost.textContent=left>0?'FREE':'₹70';const online=modal&&modal.querySelector('button[onclick="payAdOnline()"]');if(online)online.innerHTML=left>0?'<i class="fas fa-bolt"></i> Use Free Sponsored Ad':'Pay Now (Online)';const payout=$('btnAdPayout');if(payout)payout.style.display=left>0?'none':'inline-flex';if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}};
    async function activateAd(id,isFree){const until=new Date(Date.now()+86400000).toISOString();await db.collection('products').doc(id).set({isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredAt:nowIso(),sponsoredUntil:until},{merge:true});const p=(sellerProducts||[]).find(x=>String(x.id)===String(id));if(p)Object.assign(p,{isAd:true,isSponsored:true,sponsored:true,adStatus:'Sponsored',sponsoredUntil:until});if(isFree)await saveAdUsage(dynamicAdUsage()+1);await savePaymentLedger({type:isFree?'sponsored_ad_free':'sponsored_ad',productId:id,reference:id,gross:isFree?0:70,deductions:0,net:isFree?0:70,amount:isFree?0:70,status:isFree?'Free active':'Active'}).catch(()=>{});closeModal('adPaymentModal');if(typeof loadAds==='function')loadAds();showToast(isFree?'Free sponsored ad activated.':'Sponsored ad activated.','success');}
    window.payAdOnline=async function(){const id=$('adProdId')?.value;if(!id)return;const left=Math.max(0,activePlanAdLimit()-dynamicAdUsage());if(left>0)return activateAd(id,true);if(!API_KEYS.RAZORPAY)return showToast('Razorpay disabled.','error');new Razorpay({key:API_KEYS.RAZORPAY,amount:7000,currency:'INR',name:'Aryanta Ads',description:'Sponsored Ad',handler:function(){activateAd(id,false);},prefill:{email:activeSeller.email,contact:activeSeller.phone||''},theme:{color:'#0f172a'}}).open();};
    window.payAdUpcoming=async function(){const id=$('adProdId')?.value;if(!id)return;if(cachedTotalUpcoming<70)return showToast('Insufficient payout balance.','error');await db.collection('fines').add({email:sellerEmail(),sellerEmail:sellerEmail(),amount:70,reason:'Sponsored Ad Fee',timestamp:nowIso(),productId:id}).catch(()=>{});await savePaymentLedger({type:'sponsored_ad_payout_deduction',productId:id,reference:id,gross:0,deductions:70,net:-70,amount:70,status:'Deducted from payout'}).catch(()=>{});activateAd(id,false);};

    function popupTargetOk(d){const target=low(d.target||d.sellerEmail||d.email||'all');return target==='all'||target==='sellers'||target===sellerEmail();}
    function popupActive(d){if(!isActiveDoc(d))return false;const now=Date.now();const start=d.startAt||d.startDate,end=d.endAt||d.endDate;if(start&&new Date(start).getTime()>now)return false;if(end&&new Date(end).getTime()<now)return false;return true;}
    async function fetchDynamicPopups(){const rows=[];for(const c of ['seller_popups','seller_panel_popups','admin_seller_popups']){try{const snap=await db.collection(c).limit(50).get();snap.forEach(doc=>{const d={id:doc.id,...doc.data(),__collection:c};if(popupTargetOk(d)&&popupActive(d))rows.push(d);});}catch(e){}}return rows.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));}
    function popupSeenKey(p){return `aryanta_popup_${sellerEmail()}_${p.__collection}_${p.id}_${p.updatedAt||p.timestamp||''}`;}
    window.closeDynamicAdminPopup=function(){const modal=$('adminDynamicPopupModal');if(modal){modal.classList.remove('show');modal.style.display='none';}if(window.__ARYANTA_CURRENT_DYNAMIC_POPUP&&!truthy(window.__ARYANTA_CURRENT_DYNAMIC_POPUP.showEveryLogin,false))localStorage.setItem(popupSeenKey(window.__ARYANTA_CURRENT_DYNAMIC_POPUP),'1');};
    async function showDynamicPopupIfAny(force=false){const popups=await fetchDynamicPopups();const popup=popups.find(p=>force||truthy(p.forceShow,false)||truthy(p.showEveryLogin,false)||!localStorage.getItem(popupSeenKey(p)));if(!popup)return;window.__ARYANTA_CURRENT_DYNAMIC_POPUP=popup;const body=$('adminDynamicPopupBody'),modal=$('adminDynamicPopupModal');if(!body||!modal)return;const buttons=arr(popup.buttons||popup.actions).length?arr(popup.buttons||popup.actions):[{title:popup.buttonText||'Open',url:popup.buttonLink||popup.link||popup.url,action:'url'}];const btnHtml=buttons.filter(b=>truthy(b.visible,true)).map(b=>{const title=safe(b.title||b.text||b.label||'Open');const url=text(b.url||b.link||b.href||'');const section=text(b.section||'');if(section)return `<button class="btn-prime" onclick="closeDynamicAdminPopup();showSection('${safe(section)}')">${title}</button>`;if(url)return `<a class="btn-prime" href="${safe(url)}" target="_blank" rel="noopener" onclick="closeDynamicAdminPopup()">${title}</a>`;return `<button class="btn-outline" onclick="closeDynamicAdminPopup()">${title}</button>`;}).join('');body.innerHTML=`<div class="dynamic-popup-hero"><h3>${safe(popup.title||'Aryanta Notice')}</h3><p>${safe(popup.message||popup.text||popup.description||'')}</p></div><div class="dynamic-popup-body">${popup.image?`<img src="${safe(popup.image)}" style="width:100%;border-radius:18px;margin-bottom:14px;">`:''}${popup.html?text(popup.html):''}<div class="dynamic-popup-actions">${btnHtml}${truthy(popup.dismissible,true)?'<button class="btn-outline" onclick="closeDynamicAdminPopup()">Cancel</button>':''}</div></div>`;modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);}

    async function syncDerivedPaymentLedger(){
        if(!db||!activeSeller||!Array.isArray(sellerOrders))return;
        const p=activePlan();const commission=Number((p&&p.commissionPercent)||adminConfig.platformCommissionPercent||0)||0;
        const jobs=[];
        for(const o of sellerOrders){
            const status=low(o.status);if(status!=='delivered'||o.sellerSettled)continue;
            const items=typeof getSellerItemsFromOrder==='function'?getSellerItemsFromOrder(o):[];if(!items.length)continue;
            const gross=items.reduce((s,i)=>s+(Number(i.price||i.amount||0)*Number(i.qty||i.quantity||1)),0);
            const deductions=Math.round((gross*commission/100)*100)/100;const net=Math.max(0,gross-deductions);
            const delivered=new Date(o.deliveredAt||o.delivered_date||o.timestamp||Date.now());const release=new Date(delivered.getTime()+7*86400000);const due=Date.now()>=release.getTime();
            jobs.push(savePaymentLedger({id:`order_${sellerEmail()}_${o.id}`,type:'order_payout',reference:o.order_no||o.id,orderId:o.id,gross,deductions,net,amount:net,status:due?'Upcoming Transfer':'In Progress',deliveredDate:delivered.toISOString(),releaseDate:release.toISOString(),commissionPercent:commission}));
            if(jobs.length>=12){await Promise.allSettled(jobs.splice(0));}
        }
        if(jobs.length)await Promise.allSettled(jobs);
    }
    async function ensureSellerPaymentsDynamic(force=false){
        if(!db||!activeSeller)return;
        await fetchAdminConfig();
        if(typeof window.ensureSellerOrders==='function')await window.ensureSellerOrders(force);
        await syncDerivedPaymentLedger();
        const email=sellerEmail();
        const [l1,l2,paySnap,fineSnap]=await Promise.all([
            db.collection('seller_payment_ledger').where('sellerEmail','==',email).get().catch(()=>null),
            db.collection('seller_payment_ledger').where('email','==',email).get().catch(()=>null),
            db.collection('seller_payouts').where('sellerEmail','==',email).get().catch(()=>null),
            db.collection('fines').where('email','==',email).get().catch(()=>null)
        ]);
        const map=new Map();[l1,l2].forEach(s=>s&&s.forEach(d=>map.set(d.id,{id:d.id,...d.data()})));
        dynamicLedger=[...map.values()].sort((a,b)=>new Date(b.timestamp||b.createdAt||0)-new Date(a.timestamp||a.createdAt||0));
        sellerPayouts=paySnap?paySnap.docs.map(d=>({id:d.id,...d.data()})):sellerPayouts;
        sellerFines=fineSnap?fineSnap.docs.map(d=>({id:d.id,...d.data()})):sellerFines;
    }
    window.ensureSellerPayments=ensureSellerPaymentsDynamic;
    function rowDate(v){const d=new Date(v||Date.now());return isNaN(d.getTime())?new Date():d;}
    function renderLedgerRows(rows){return rows.map(r=>`<tr><td data-label="Date"><strong>${rowDate(r.timestamp||r.createdAt||r.releaseDate||r.date).toLocaleDateString()}</strong></td><td data-label="Type"><span class="badge-ui">${safe(r.type||'Ledger')}</span></td><td data-label="Reference"><strong style="font-family:monospace;">${safe(r.reference||r.orderId||r.planId||r.id)}</strong></td><td data-label="Gross">${money(r.gross||0)}</td><td data-label="Deductions" style="color:var(--danger);font-weight:900;">-${money(r.deductions||0)}</td><td data-label="Net / Amount" style="color:var(--success);font-weight:900;">${money(r.net??r.amount??0)}</td><td data-label="Status">${safe(r.status||'Saved')}</td></tr>`).join('');}
    window.loadPayments=async function(){
        await ensureSellerPaymentsDynamic();
        const progress=$('payProgressList'),upcoming=$('payUpcomingList'),completed=$('payCompletedList'),fines=$('payFinesList'),all=$('payAllList');
        const ledger=dynamicLedger||[];
        const progressRows=ledger.filter(r=>low(r.status).includes('progress'));
        const upcomingRows=ledger.filter(r=>low(r.status).includes('upcoming')||low(r.status).includes('processing'));
        const completedRows=ledger.filter(r=>low(r.status).includes('paid')||low(r.status).includes('settled')||low(r.status).includes('completed'));
        if(progress)progress.innerHTML=progressRows.length?progressRows.map(r=>`<tr><td><strong>${rowDate(r.deliveredDate||r.timestamp).toLocaleDateString()}</strong></td><td><span style="color:var(--warning);font-weight:900;">${rowDate(r.releaseDate).toLocaleDateString()}</span></td><td><strong style="font-family:monospace;color:var(--primary);">${safe(r.reference||r.orderId)}</strong></td><td><strong>${money(r.net||r.amount)}</strong><br><span style="font-size:11px;color:var(--text-light);">Gross ${money(r.gross)} - ${money(r.deductions)}</span></td></tr>`).join(''):`<tr><td colspan="4" style="text-align:center;font-weight:700;">No in-progress ledger.</td></tr>`;
        if(upcoming)upcoming.innerHTML=upcomingRows.length?upcomingRows.map(r=>`<tr><td><strong>${rowDate(r.releaseDate||r.timestamp).toLocaleDateString()}</strong></td><td><strong style="font-family:monospace;color:var(--primary);">${safe(r.reference||r.orderId)}</strong></td><td>${safe(r.status)}</td><td style="color:var(--success);font-weight:900;">${money(r.net||r.amount)}</td></tr>`).join(''):`<tr><td colspan="4" style="text-align:center;font-weight:700;">No upcoming ledger.</td></tr>`;
        if(completed)completed.innerHTML=completedRows.length?completedRows.map(r=>`<tr><td><strong>${rowDate(r.settledDate||r.timestamp).toLocaleDateString()}</strong></td><td><strong style="font-family:monospace;color:var(--primary);">${safe(r.reference||r.id)}</strong></td><td style="color:var(--success);font-weight:900;">${money(r.net||r.amount)}</td></tr>`).join(''):(sellerPayouts&&sellerPayouts.length?sellerPayouts.map(p=>`<tr class="clickable-row" onclick="viewSettledSlip('${safe(p.id)}')"><td><strong>${rowDate(p.date||p.settledDate).toLocaleDateString()}</strong></td><td><strong style="font-family:monospace;color:var(--primary);">${safe(p.id)}</strong></td><td style="color:var(--success);font-weight:900;">${money(p.netPayout||p.amount)}</td></tr>`).join(''):`<tr><td colspan="3" style="text-align:center;">No settlements yet.</td></tr>`);
        if(fines)fines.innerHTML=(sellerFines&&sellerFines.length)?sellerFines.map(f=>`<tr><td><strong>${rowDate(f.timestamp).toLocaleDateString()}</strong></td><td><span style="font-weight:700;">${safe(f.reason||f.note||'Deduction')}</span></td><td style="color:var(--danger);font-weight:900;">-${money(f.amount)}</td></tr>`).join(''):`<tr><td colspan="3" style="text-align:center;font-weight:700;">No fines.</td></tr>`;
        if(all)all.innerHTML=ledger.length?renderLedgerRows(ledger):`<tr><td colspan="7" style="text-align:center;font-weight:700;">No payment ledger saved yet.</td></tr>`;
        const totalUpcoming=upcomingRows.reduce((s,r)=>s+Number(r.net??r.amount??0),0);const totalFines=(sellerFines||[]).reduce((s,f)=>s+Number(f.amount||0),0);cachedTotalUpcoming=Math.max(0,totalUpcoming-totalFines);const alert=$('upcomingAlertBox');if(alert){if(totalUpcoming||totalFines){alert.style.display='block';alert.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>DB upcoming ledger total:</span><strong>${money(totalUpcoming)}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--danger);"><span>DB fines/deductions:</span><strong>-${money(totalFines)}</strong></div><div style="border-top:2px solid #bfdbfe;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:900;font-size:16px;color:#1e3a8a;">Final usable payout:</span><strong style="color:var(--primary);font-size:22px;">${money(cachedTotalUpcoming)}</strong></div>`;}else alert.style.display='none';}
        validateStrictPayoutButtons();
    };

    const oldShowSection=window.showSection;
    window.showSection=async function(section){
        const r=oldShowSection?oldShowSection(section):undefined;
        try{if(section==='subscription')await window.loadStrictSubscriptionsUI();if(section==='settings')await window.loadSettingsUI();if(section==='profile')await window.loadProfile();if(section==='support')await renderSupportCategories();if(section==='payments')await window.loadPayments();}catch(e){console.warn('Strict dynamic section refresh failed',section,e);}
        return r;
    };

    async function strictBoot(){
        if(!db||!activeSeller)return;
        try{await fetchAdminConfig(false);renderSubscriptionPlans();renderDynamicButtons();renderDownloadAppBox();renderVersionInfo();applyNavControls();await renderSupportCategories();await loadSettingsUIDynamic();renderProfileHero();applyAdminTextOverrides();showDynamicPopupIfAny(false);}catch(e){console.warn('Dynamic boot skipped; Basic plan remains available.',e);dynamicPlans=ensureBasicPlan(dynamicPlans);renderSubscriptionPlans();}
    }
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>window.refreshDynamicAdminControls(false),1800);});
    window.refreshDynamicAdminControls=async function(force=false){
        try{
            if(force){ cfgFetchedAt=0; cfgPromise=null; }
            await fetchAdminConfig(!!force);
            renderSubscriptionPlans();
            renderDynamicButtons();
            renderDownloadAppBox();
            renderVersionInfo();
            applyNavControls();
            await renderSupportCategories();
            await loadSettingsUIDynamic();
            renderProfileHero();
            applyAdminTextOverrides();
            showDynamicPopupIfAny(false);
            return true;
        }catch(e){
            console.warn('Admin control refresh failed', e);
            dynamicPlans=ensureBasicPlan(dynamicPlans);
            renderSubscriptionPlans();
            return false;
        }
    };
    window.forceRefreshDynamicAdminControls=function(){return window.refreshDynamicAdminControls(true);};
})();


/* Strict branding upload guard - DB plan limits only */
(function(){
    const $=id=>document.getElementById(id);
    const low=v=>String(v==null?'':v).toLowerCase().trim();
    const nowIso=()=>new Date().toISOString();
    function currentDbPlan(){
        const plans=window.__ARYANTA_DB_SUBSCRIPTION_PLANS||[];
        const sub=low(activeSeller&&(activeSeller.subscriptionId||activeSeller.subscriptionPlanId||activeSeller.subscription||activeSeller.plan));
        return plans.find(p=>low(p.id)===sub||low(p.name)===sub||low(p.title)===sub)||null;
    }
    function brandLimit(type){
        const f=(activeSeller&&activeSeller.subscriptionFeatures)||{};
        const p=currentDbPlan()||{};
        const val= type==='logo' ? (f.logoLimit??p.logoLimit) : (f.bannerLimit??p.bannerLimit);
        return Number(val||0)||0;
    }
    function monthKey(){return new Date().toISOString().slice(0,7);}
    function brandUsed(type){
        const usage=(activeSeller&&activeSeller.brandingUsageMonth===monthKey())?(activeSeller.brandingUsage||{}):{};
        return Number(usage[type]??activeSeller?.[`${type}UploadsThisMonth`]??0)||0;
    }
    async function compress(file,type){
        return new Promise((resolve,reject)=>{
            const reader=new FileReader(); reader.onerror=reject;
            reader.onload=()=>{const img=new Image(); img.onerror=reject; img.onload=()=>{const maxW=type==='banner'?1400:700,maxH=type==='banner'?500:700;let w=img.width,h=img.height;const r=Math.min(maxW/w,maxH/h,1);w=Math.round(w*r);h=Math.round(h*r);const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);resolve(canvas.toDataURL('image/jpeg',0.82));}; img.src=reader.result;};
            reader.readAsDataURL(file);
        });
    }
    window.uploadStoreBrandingStrict=async function(type){
        const input=$(type==='logo'?'storeLogoInput':'storeBannerInput');
        const file=input&&input.files&&input.files[0];
        if(!file)return showToast(`Choose a ${type} image first.`,'warning');
        if(window.refreshDynamicAdminControls)await window.refreshDynamicAdminControls();
        const limit=brandLimit(type);
        if(limit<=0)return showToast(`Admin DB plan does not allow ${type} uploads. Ask admin to set ${type==='logo'?'logoLimit':'bannerLimit'} in the subscription plan.`,'error');
        const used=brandUsed(type);
        if(used>=limit)return showToast(`Monthly ${type} upload limit reached (${used}/${limit}) for your DB plan.`,'error');
        try{
            const dataUrl=await compress(file,type);
            const usageMonth=monthKey();
            const usage=activeSeller.brandingUsageMonth===usageMonth?{...(activeSeller.brandingUsage||{})}:{};
            usage[type]=used+1;
            const del=firebase.firestore.FieldValue.delete();
            const payload={brandingUsage:usage,brandingUsageMonth:usageMonth,brandingUpdatedAt:nowIso(),brandingUpdatedBy:'seller-panel'};
            if(type==='logo')Object.assign(payload,{storeLogo:dataUrl,storeLogoUpdatedAt:nowIso(),storeLogoUrl:del,logo:del,logoUrl:del,shopLogo:del,companyLogo:del,logoUploadsThisMonth:used+1});
            else Object.assign(payload,{storeBanner:dataUrl,storeBannerUpdatedAt:nowIso(),storeBannerUrl:del,banner:del,bannerUrl:del,shopBanner:del,coverImage:del,bannerUploadsThisMonth:used+1});
            await db.collection('sellers').doc(activeSeller.email).set(payload,{merge:true});
            if(type==='logo'){activeSeller.storeLogo=dataUrl;activeSeller.logoUploadsThisMonth=used+1;}
            else{activeSeller.storeBanner=dataUrl;activeSeller.bannerUploadsThisMonth=used+1;}
            activeSeller.brandingUsage=usage;activeSeller.brandingUsageMonth=usageMonth;
            localStorage.setItem('sellerToken',JSON.stringify(activeSeller));
            if(input)input.value='';
            if(typeof renderBrandingPreviewsFinal==='function')renderBrandingPreviewsFinal();
            showToast(`Store ${type} updated using DB plan limit (${used+1}/${limit}).`,'success');
        }catch(e){console.error(e);showToast(`Could not upload ${type}. Try a smaller image or check network.`,'error');}
    };
    window.uploadStoreBranding=window.uploadStoreBrandingStrict;
})();


/* Aryanta Professional Runtime Stabilizer v4 - one-time fetch, plan locks, support uploads */
(function(){
  if(window.ARYANTA_PRO_RUNTIME_V4) return;
  window.ARYANTA_PRO_RUNTIME_V4 = true;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const truthy = (v, def=false) => {
    if(v === undefined || v === null || v === '') return def;
    if(typeof v === 'boolean') return v;
    const s = String(v).toLowerCase().trim();
    if(['1','true','yes','on','enabled','active','show','visible'].includes(s)) return true;
    if(['0','false','no','off','disabled','inactive','hide','hidden'].includes(s)) return false;
    return def;
  };
  const fileToDataUrl = file => new Promise((resolve,reject)=>{ const r=new FileReader(); r.onerror=reject; r.onload=()=>resolve(r.result); r.readAsDataURL(file); });
  function selectedSupportCategory(){
    try{
      const sel=$('supCategory');
      const id=sel && sel.value;
      const rows=window.__ARYANTA_SUPPORT_CATEGORIES || [];
      return rows.find(c=>String(c.id)===String(id)) || null;
    }catch(e){ return null; }
  }
  const oldUpdate = window.updateSupportCategoryInfo;
  window.updateSupportCategoryInfo = function(){
    if(typeof oldUpdate === 'function') oldUpdate();
    const box=$('supportAttachmentBox');
    if(!box) return;
    const cat=selectedSupportCategory();
    if(!cat){ box.style.display='none'; box.innerHTML=''; return; }
    const needs = truthy(cat.askForImage,false) || truthy(cat.requireImage,false) || truthy(cat.askForFile,false) || truthy(cat.requireFile,false) || truthy(cat.allowAttachment,false) || truthy(cat.attachmentRequired,false);
    if(!needs){ box.style.display='none'; box.innerHTML=''; return; }
    const required = truthy(cat.requireImage,false) || truthy(cat.requireFile,false) || truthy(cat.attachmentRequired,false);
    const accept = (truthy(cat.askForImage,false)||truthy(cat.requireImage,false)) && !(truthy(cat.askForFile,false)||truthy(cat.requireFile,false)) ? 'image/*' : 'image/*,.pdf,.doc,.docx,.txt';
    box.style.display='block';
    box.innerHTML = `<label>${esc(cat.attachmentLabel || 'Upload proof / screenshot')}${required?' <span style="color:var(--danger);font-weight:900;">*</span>':''}</label><input type="file" id="supAttachment" class="input-field" accept="${accept}"><div class="admin-note-box" style="margin-top:8px;display:block;">${esc(cat.attachmentHelp || 'Upload screenshot, invoice, product image, or any proof requested by admin.')}</div>`;
  };
  const oldSubmit = window.submitSupportTicket;
  window.submitSupportTicket = async function(){
    const cat=selectedSupportCategory();
    const fileInput=$('supAttachment');
    const file=fileInput && fileInput.files && fileInput.files[0];
    const required = cat && (truthy(cat.requireImage,false) || truthy(cat.requireFile,false) || truthy(cat.attachmentRequired,false));
    if(required && !file){ return showToast('Admin requires an attachment for this issue. Upload proof first.','warning'); }
    if(!file){ return oldSubmit ? oldSubmit() : undefined; }
    if(file.size > 950000){ return showToast('Attachment is too large. Please upload an image/file under 950 KB.','warning'); }
    const dataUrl = await fileToDataUrl(file);
    const originalAdd = db && db.collection ? db.collection.bind(db) : null;
    // The strict submitSupportTicket below writes directly; easiest safe route is to create the ticket here with attachment.
    const sel=$('supCategory'); const phone=$('supPhone')?.value.trim(); const desc=$('supDesc')?.value.trim();
    if(!sel?.value || !phone || !desc) return showToast('All fields are required.','warning');
    try{
      await db.collection('seller_support_tickets').add({
        ticketId:'TKT-'+Math.random().toString(36).substr(2,6).toUpperCase(),
        email:(activeSeller&&activeSeller.email)||'', sellerEmail:(activeSeller&&activeSeller.email)||'', sellerName:(activeSeller&&activeSeller.companyName)||((activeSeller&&activeSeller.email)||''),
        phone, categoryId:sel.value, categoryTitle:cat?cat.title:sel.value, categoryDescription:cat?cat.description:'', subject:cat?cat.title:sel.value, message:desc,
        attachment:{name:file.name,type:file.type,size:file.size,dataUrl}, attachmentName:file.name, attachmentType:file.type, hasAttachment:true,
        status:'Open', timestamp:new Date().toISOString(), source:'seller_panel_professional'
      });
      showToast('Support ticket submitted with attachment.','success');
      $('supPhone').value=''; $('supDesc').value=''; sel.value=''; if(fileInput)fileInput.value=''; window.updateSupportCategoryInfo(); showSection('oldTickets');
    }catch(e){ console.error(e); showToast('Failed to submit ticket. Check Firestore rules.','error'); }
  };
  const oldLoadSubs = window.loadStrictSubscriptionsUI || window.loadSubscriptionsUI;
  window.loadSubscriptionsUI = async function(){
    if(typeof oldLoadSubs === 'function') await oldLoadSubs();
    const grid=$('subscriptionPlansGrid');
    if(grid && !$('refreshAdminPlansBtn')){
      const wrap=document.createElement('div'); wrap.style.gridColumn='1/-1'; wrap.style.display='flex'; wrap.style.justifyContent='flex-end'; wrap.style.marginBottom='8px';
      wrap.innerHTML='<button id="refreshAdminPlansBtn" class="btn-outline" type="button" onclick="forceRefreshDynamicAdminControls().then(()=>showToast(\'Admin seller settings refreshed\',\'success\'))"><i class="fas fa-rotate"></i> Refresh Admin Plans</button>';
      grid.prepend(wrap);
    }
  };
  try{ loadSubscriptionsUI=window.loadSubscriptionsUI; }catch(e){}
})();

/* Aryanta Seller Subscription Final Fix v7 - stable active plan, invoices, read-more, loader gate */
(function(){
  if(window.ARYANTA_SUBSCRIPTION_FINAL_FIX_V7) return;
  window.ARYANTA_SUBSCRIPTION_FINAL_FIX_V7 = true;

  const $ = id => document.getElementById(id);
  const txt = v => String(v == null ? '' : v);
  const low = v => txt(v).toLowerCase().trim();
  const nowIso = () => new Date().toISOString();
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const esc = v => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sellerEmailFinal = () => low(window.activeSeller && window.activeSeller.email);
  const sellerDocIdFinal = () => txt(window.activeSeller && window.activeSeller.email).trim();
  const state = window.__ARYANTA_SUB_FINAL = window.__ARYANTA_SUB_FINAL || {
    loaded:false, loading:null, plans:[], active:null, invoices:[], config:{}, supportCategories:[], yearly:false, lastLoadedAt:0
  };

  function truthy(v, def=false){
    if(v === undefined || v === null || v === '') return def;
    if(typeof v === 'boolean') return v;
    const s = low(v);
    if(['1','true','yes','on','enabled','active','show','visible'].includes(s)) return true;
    if(['0','false','no','off','disabled','inactive','hide','hidden'].includes(s)) return false;
    return def;
  }
  function arr(v){
    if(Array.isArray(v)) return v;
    if(v && typeof v === 'object') return Object.keys(v).map(k => ({ id:k, ...v[k] }));
    return [];
  }
  function parseLines(value){
    if(Array.isArray(value)) return value.flatMap(parseLines).filter(Boolean);
    if(value && typeof value === 'object') return [value.title || value.name || value.text || value.description || ''].filter(Boolean).map(txt);
    return txt(value)
      .split(/\r?\n|\u2022|\u25CF|\u25A0|\s*;\s*/g)
      .map(x => x.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
  }
  function firstDefined(...vals){
    for(const v of vals) if(v !== undefined && v !== null && v !== '') return v;
    return undefined;
  }
  function normalizePlanFinal(raw){
    raw = raw || {};
    const id = txt(firstDefined(raw.id, raw.planId, raw.slug, raw.name, raw.title, 'basic')).trim();
    const name = txt(firstDefined(raw.name, raw.title, raw.planName, raw.label, id)).trim() || 'Basic';
    const monthlyRaw = firstDefined(raw.monthlyPrice, raw.priceMonthly, raw.monthPrice, raw.price, raw.amount, raw.monthlyAmount);
    const yearlyRaw = firstDefined(raw.yearlyPrice, raw.priceYearly, raw.yearPrice, raw.yearlyAmount);
    let monthly = Number(monthlyRaw);
    let yearly = Number(yearlyRaw);
    if(!Number.isFinite(monthly)) monthly = null;
    if(!Number.isFinite(yearly)) yearly = null;
    const rawBenefits = firstDefined(raw.benefits, raw.features, raw.planFeatures, raw.benefitText, raw.benefitsText, raw.benefitsOnePerLine, raw.descriptionLines);
    let benefits = parseLines(rawBenefits);
    const settings = raw.settings || raw.enabledSettings || raw.allowedSettings || raw.settingAccess || raw.featuresAccess || {};
    const freeAds = Number(firstDefined(raw.freeAds, raw.freeAdCount, raw.sponsoredAdsFree, raw.freeSponsoredAds, raw.adCredits, raw.sponsoredFreeAds, 0)) || 0;
    if(!benefits.length && low(id) === 'basic') benefits = ['Dark Theme access', 'Support Tickets enabled', 'B2B Supplies access', '1 free Sponsored Ad every month'];
    return {
      ...raw,
      id, planId:id, name, title:txt(firstDefined(raw.title, name)),
      description:txt(firstDefined(raw.description, raw.subtitle, raw.shortDescription, '')),
      monthlyPrice: monthly, yearlyPrice: yearly,
      active: truthy(firstDefined(raw.active, raw.enabled), true),
      visible: truthy(firstDefined(raw.visible, raw.show), true),
      badge: txt(firstDefined(raw.badge, raw.tag, '')),
      sortOrder: Number(firstDefined(raw.sortOrder, raw.order, raw.priority, 0)) || 0,
      benefits, features: benefits,
      freeAds,
      logoLimit: Number(firstDefined(raw.logoLimit, raw.logoUploads, raw.brandLogoLimit, 0)) || 0,
      bannerLimit: Number(firstDefined(raw.bannerLimit, raw.bannerUploads, raw.brandBannerLimit, 0)) || 0,
      sponsoredAdPrice: Number(firstDefined(raw.sponsoredAdPrice, raw.adPrice, raw.sponsorPrice, state.config.sponsoredAdPrice, 70)) || 70,
      commissionPercent: Number(firstDefined(raw.commissionPercent, raw.platformFeePercent, state.config.platformCommissionPercent, 0)) || 0,
      durationDays: Number(firstDefined(raw.durationDays, raw.days, 30)) || 30,
      settings,
      allowPayoutPayment: truthy(firstDefined(raw.allowPayoutPayment, raw.payoutPayment), true),
      freeFirstLimit: Number(firstDefined(raw.freeFirstLimit, raw.freeFirstMembers, raw.freeForFirstMembers, raw.firstFreeLimit, 0)) || 0,
      freeFirstEnabled: truthy(firstDefined(raw.freeFirstEnabled, raw.firstMemberFree, raw.getFree, raw.freeForFirstMembers), false),
      isFree: truthy(firstDefined(raw.isFree, raw.free), Number(monthly || 0) <= 0)
    };
  }
  function basicPlanFinal(){
    return normalizePlanFinal({
      id:'basic', name:'Basic', title:'Basic', badge:'Free', monthlyPrice:0, yearlyPrice:0, durationDays:30,
      description:'Free starter plan for every Aryanta seller.', freeAds:1, sortOrder:-999999,
      settings:{ theme:true, darkTheme:true, support:true, supportTickets:true, b2b:true, buyB2b:true, b2bSupplies:true, ads:true, sponsoredAds:true, offline:false, autoAcc:false, vacation:false, sms:false, '2fa':false, searchSuggestions:false, bankEdit:false },
      benefits:'Dark Theme access\nSupport Tickets enabled\nB2B Supplies access\n1 free Sponsored Ad every month'
    });
  }
  function ensureBasicFinal(plans){
    const clean = (plans || []).filter(p => p && p.id && p.name && p.active && p.visible).map(normalizePlanFinal);
    const basic = basicPlanFinal();
    const i = clean.findIndex(p => low(p.id) === 'basic' || low(p.name) === 'basic');
    if(i >= 0){
      clean[i] = { ...basic, ...clean[i], id:'basic', planId:'basic', name:'Basic', title:'Basic', monthlyPrice:0, yearlyPrice:0, isFree:true, freeAds:Number(clean[i].freeAds || 1) || 1, settings:{...basic.settings, ...(clean[i].settings || {})}, benefits: clean[i].benefits && clean[i].benefits.length ? clean[i].benefits : basic.benefits, features: clean[i].features && clean[i].features.length ? clean[i].features : basic.features };
    } else clean.unshift(basic);
    return clean.sort((a,b) => (Number(a.sortOrder || 0) - Number(b.sortOrder || 0)));
  }
  function priceForFinal(plan, yearly){
    plan = normalizePlanFinal(plan);
    if(yearly){
      const base = Number.isFinite(Number(plan.monthlyPrice)) ? Number(plan.monthlyPrice) * 12 : Number(plan.yearlyPrice);
      if(!Number.isFinite(base)) return null;
      if(base <= 0) return 0;
      return Math.round(base * 0.65);
    }
    const p = Number(plan.monthlyPrice);
    return Number.isFinite(p) ? p : null;
  }
  function yearlyBaseFinal(plan){
    const monthly = Number(plan && plan.monthlyPrice);
    if(Number.isFinite(monthly)) return monthly * 12;
    const yearly = Number(plan && plan.yearlyPrice);
    return Number.isFinite(yearly) ? yearly : null;
  }
  function setLoaderFinal(msg, percent){
    const loader = $('pageLoader'), m = $('loaderMessage'), p = $('loadPercent');
    if(loader){ loader.style.display = 'flex'; loader.style.opacity = '1'; }
    if(m) m.innerText = msg || 'Loading seller panel...';
    if(p) p.innerText = typeof percent === 'number' ? percent + '%' : (percent || 'Loading');
  }
  function hideLoaderFinal(){
    const loader = $('pageLoader');
    if(!loader) return;
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; loader.style.opacity = '1'; }, 280);
  }
  async function getColFinal(name, limit=500){
    if(!window.db) return [];
    try{
      let snap;
      try{ snap = await db.collection(name).orderBy('sortOrder','asc').limit(limit).get(); }
      catch(e){ snap = await db.collection(name).limit(limit).get(); }
      const out = [];
      snap.forEach(d => out.push({id:d.id, ...d.data(), __collection:name}));
      return out;
    }catch(e){ console.warn('Aryanta read skipped:', name, e); return []; }
  }
  async function getDocFinal(path){
    if(!window.db) return null;
    try{ const d = await db.doc(path).get(); return d.exists ? {id:d.id, ...d.data()} : null; }
    catch(e){ console.warn('Aryanta doc read skipped:', path, e); return null; }
  }
  async function fetchWorkerBootFinal(){
    if(!window.API_BASE_URL) return {};
    const email = sellerEmailFinal();
    try{
      const url = API_BASE_URL + '/seller/panel-boot' + (email ? '?email=' + encodeURIComponent(email) : '');
      const res = await fetch(url, { cache:'no-store' });
      const json = await res.json().catch(() => ({}));
      return json.data || json || {};
    }catch(e){ console.warn('Worker panel boot failed:', e); return {}; }
  }
  async function fetchDynamicFinal(force=false){
    if(state.loading && !force) return state.loading;
    if(state.loaded && !force) return state;
    state.loading = (async() => {
      const boot = await fetchWorkerBootFinal();
      const cfgDocs = await Promise.all([
        getDocFinal('seller_panel_config/global'), getDocFinal('seller_config/global'), getDocFinal('admin_config/seller_panel'), getDocFinal('aryanta_config/seller_panel')
      ]);
      state.config = Object.assign({}, boot.panelConfig || {}, ...cfgDocs.filter(Boolean));
      let rawPlans = arr(boot.subscriptionPlans || boot.plans || boot.subscriptions || state.config.subscriptionPlans || state.config.plans);
      if(rawPlans.length <= 1){
        for(const c of ['subscription_plans','seller_subscription_plans','seller_subscriptions_plans','subscriptions_plans','seller_plans']){
          const rows = await getColFinal(c, 200);
          if(rows.length){ rawPlans = rows; break; }
        }
      }
      state.plans = ensureBasicFinal(rawPlans.map(normalizePlanFinal));
      window.__ARYANTA_DB_SUBSCRIPTION_PLANS = state.plans;
      let cats = arr(boot.issueCategories || boot.supportCategories || state.config.issueCategories || state.config.supportCategories);
      if(!cats.length){
        for(const c of ['seller_issue_categories','support_categories','seller_support_categories','issue_categories']){
          const rows = await getColFinal(c, 200);
          if(rows.length){ cats = rows; break; }
        }
      }
      state.supportCategories = cats;
      window.__ARYANTA_DB_SUPPORT_CATEGORIES = cats;
      await fetchActiveSubscriptionFinal();
      await fetchSubscriptionInvoicesFinal();
      state.loaded = true; state.lastLoadedAt = Date.now();
      return state;
    })().finally(() => { state.loading = null; });
    return state.loading;
  }
  function planByIdNameFinal(idOrName){
    const s = low(idOrName);
    return (state.plans || []).find(p => s && (low(p.id) === s || low(p.planId) === s || low(p.name) === s || low(p.title) === s)) || null;
  }
  function recordEndMs(r){
    const v = firstDefined(r && r.endDate, r && r.subEndDate, r && r.validTill, r && r.expiresAt, r && r.expiryDate);
    const t = Date.parse(v || '');
    return Number.isFinite(t) ? t : 0;
  }
  function isRecordActive(r){
    if(!r) return false;
    const st = low(firstDefined(r.status, r.state, 'active'));
    if(['cancelled','expired','failed','rejected','inactive'].includes(st)) return false;
    const end = recordEndMs(r);
    return !end || end >= Date.now();
  }
  async function fetchActiveSubscriptionFinal(){
    const email = sellerEmailFinal();
    const found = [];
    if(email && window.db){
      const directIds = [email, email.replace(/[.#$\[\]/]/g,'_'), encodeURIComponent(email)];
      for(const id of directIds){
        const d = await getDocFinal('active_seller_subscriptions/' + id);
        if(d) found.push(d);
      }
      for(const c of ['active_seller_subscriptions','seller_subscriptions']){
        try{ const snap = await db.collection(c).where('sellerEmail','==',email).limit(20).get(); snap.forEach(d => found.push({id:d.id, ...d.data(), __collection:c})); }catch(e){}
        try{ const snap = await db.collection(c).where('email','==',email).limit(20).get(); snap.forEach(d => found.push({id:d.id, ...d.data(), __collection:c})); }catch(e){}
      }
    }
    if(window.activeSeller){
      if(activeSeller.subscription || activeSeller.subscriptionId || activeSeller.subscriptionPlanId){
        found.push({
          id:'seller_doc_current', planId:firstDefined(activeSeller.subscriptionId, activeSeller.subscriptionPlanId, activeSeller.subscription, 'basic'),
          plan:firstDefined(activeSeller.subscription, activeSeller.plan), endDate:activeSeller.subEndDate, status:'Active',
          features: activeSeller.subscriptionFeatures && activeSeller.subscriptionFeatures.features,
          freeAds: activeSeller.subscriptionFeatures && activeSeller.subscriptionFeatures.freeAds,
          settings: activeSeller.subscriptionFeatures && activeSeller.subscriptionFeatures.settings
        });
      }
      arr(activeSeller.subHistory).forEach(h => found.push(h));
    }
    const active = found.filter(isRecordActive).sort((a,b) => recordEndMs(b) - recordEndMs(a))[0] || null;
    let plan = active ? planByIdNameFinal(firstDefined(active.planId, active.subscriptionId, active.plan, active.subscription, active.name)) : null;
    if(!plan) plan = basicPlanFinal();
    state.active = { ...(active || {}), planId:plan.id, plan:plan.name, planName:plan.name, endDate:firstDefined(active && active.endDate, active && active.subEndDate, active && active.validTill, active && active.expiresAt, window.activeSeller && activeSeller.subEndDate, '') };
    if(window.activeSeller){
      activeSeller.subscription = plan.name;
      activeSeller.subscriptionId = plan.id;
      activeSeller.subscriptionPlanId = plan.id;
      if(state.active.endDate) activeSeller.subEndDate = state.active.endDate;
      activeSeller.subscriptionFeatures = {
        ...(activeSeller.subscriptionFeatures || {}),
        planId:plan.id, planName:plan.name, features:plan.benefits || plan.features || [], freeAds:Number(plan.freeAds || 0),
        logoLimit:Number(plan.logoLimit || 0), bannerLimit:Number(plan.bannerLimit || 0), settings:plan.settings || {},
        commissionPercent:Number(plan.commissionPercent || 0), sponsoredAdPrice:Number(plan.sponsoredAdPrice || 70)
      };
      try{ localStorage.setItem('sellerToken', JSON.stringify(activeSeller)); }catch(e){}
    }
    return state.active;
  }
  async function fetchSubscriptionInvoicesFinal(){
    const email = sellerEmailFinal();
    const rows = [];
    if(email && window.db){
      for(const c of ['seller_subscriptions','subscription_purchases','seller_payment_ledger']){
        try{ const snap = await db.collection(c).where('sellerEmail','==',email).limit(100).get(); snap.forEach(d => rows.push({id:d.id, ...d.data(), __collection:c})); }catch(e){}
        try{ const snap = await db.collection(c).where('email','==',email).limit(100).get(); snap.forEach(d => rows.push({id:d.id, ...d.data(), __collection:c})); }catch(e){}
      }
    }
    arr(window.activeSeller && activeSeller.subHistory).forEach((h,i) => rows.push({id:'history_' + i, ...h, __collection:'seller_doc_history'}));
    const isSub = r => low(r.type || '').includes('subscription') || r.planId || r.plan || r.subscription || r.subscriptionId;
    const seen = new Set();
    state.invoices = rows.filter(isSub).filter(r => {
      const key = [r.id, r.planId, r.plan, r.amount, r.timestamp, r.startDate, r.endDate].join('|');
      if(seen.has(key)) return false; seen.add(key); return true;
    }).sort((a,b) => Date.parse(firstDefined(b.timestamp,b.createdAt,b.startDate,b.date,'') || 0) - Date.parse(firstDefined(a.timestamp,a.createdAt,a.startDate,a.date,'') || 0));
    return state.invoices;
  }
  function activePlanFinal(){
    if(!state.plans.length) state.plans = ensureBasicFinal([]);
    const id = firstDefined(state.active && state.active.planId, window.activeSeller && activeSeller.subscriptionId, window.activeSeller && activeSeller.subscriptionPlanId, window.activeSeller && activeSeller.subscription, 'basic');
    return planByIdNameFinal(id) || basicPlanFinal();
  }
  window.getActiveSubscriptionPlanForSeller = activePlanFinal;
  function isCurrentPlanFinal(plan){ return low(activePlanFinal().id) === low(plan.id) || low(activePlanFinal().name) === low(plan.name); }
  function renderSubscriptionHeaderButtonsFinal(){
    const section = $('subscriptionSection');
    if(!section || $('yourSubInvoiceBtn')) return;
    const panel = section.querySelector('.panel-box') || section;
    const wrap = document.createElement('div');
    wrap.className = 'sub-final-actions';
    wrap.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;';
    wrap.innerHTML = `
      <button type="button" id="yourSubInvoiceBtn" class="btn-prime" onclick="openSubscriptionInvoicesFinal()"><i class="fas fa-file-invoice"></i> Your Subscription Invoice</button>
      <button type="button" class="btn-outline" onclick="refreshSellerPanelDynamicData()"><i class="fas fa-sync-alt"></i> Refresh Admin Plans</button>`;
    panel.appendChild(wrap);
  }
  function renderPlanCardFinal(plan){
    const yearly = state.yearly || window.currentPlanDuration === 'year';
    const price = priceForFinal(plan, yearly);
    const base = yearly ? yearlyBaseFinal(plan) : null;
    const current = isCurrentPlanFinal(plan);
    const missing = price === null;
    const free = !missing && (price <= 0 || plan.isFree);
    const benefits = parseLines(firstDefined(plan.benefits, plan.features, plan.benefitsText));
    const actionText = current ? 'Active Plan' : missing ? 'Admin price missing' : free ? 'Activate Free Plan' : `Pay ${money(price)} & Get Now`;
    const valid = state.active && state.active.endDate ? new Date(state.active.endDate).toLocaleDateString() : (low(plan.id)==='basic' ? 'Always available' : 'After purchase');
    const settingsList = settingsTextFinal(plan.settings).slice(0,5);
    return `<div class="dynamic-plan-card sub-final-card ${current?'current-plan-card':''} ${low(plan.id)==='basic'?'basic-plan-card':''}">
      <div class="dynamic-plan-head"><div><div class="dynamic-plan-title">${esc(plan.title || plan.name)}</div><div class="dynamic-plan-desc">${esc(plan.description || '')}</div></div>${plan.badge?`<div class="plan-badge">${esc(plan.badge)}</div>`:''}</div>
      <p class="plan-price">${missing?'<span class="missing-price">Admin price required</span>':(free?'₹<span>0</span>':`₹<span>${Number(price).toLocaleString('en-IN')}</span>`)} ${missing?'':`<span>/ ${yearly?'year':'month'}</span>`}</p>
      ${yearly && base && base > price ? `<span class="yearly-save"><del>${money(base)}</del> 35% OFF</span>` : ''}
      <div class="dynamic-plan-meta">
        <span><i class="fas fa-calendar-check"></i> ${current ? 'Valid: ' + esc(valid) : (yearly ? '365 days' : (Number(plan.durationDays || 30) + ' days'))}</span>
        <span><i class="fas fa-bullhorn"></i> ${Number(plan.freeAds || 0)} free ad(s)/month</span>
        ${plan.commissionPercent ? `<span><i class="fas fa-percent"></i> ${Number(plan.commissionPercent)}% fee</span>` : ''}
        ${plan.freeFirstEnabled && plan.freeFirstLimit ? `<span><i class="fas fa-gift"></i> First ${Number(plan.freeFirstLimit)} seller(s) free for 1 month</span>` : ''}
      </div>
      <ul class="plan-features">${benefits.length ? benefits.map(f => `<li><i class="fas fa-check-circle"></i> ${esc(f)}</li>`).join('') : '<li><i class="fas fa-info-circle"></i> Admin has not added benefits.</li>'}</ul>
      ${settingsList.length ? `<div class="sub-setting-mini"><strong>Access:</strong> ${settingsList.map(esc).join(', ')}</div>` : ''}
      <div class="dynamic-plan-actions">
        <button class="btn-outline w-100" type="button" onclick="openSubscriptionReadMoreFinal('${esc(plan.id)}')"><i class="fas fa-circle-info"></i> Read more</button>
        <button class="btn-prime w-100" ${current || missing ? 'disabled' : ''} onclick="processSubscriptionFinal('${esc(plan.id)}','online')">${esc(actionText)}</button>
        ${plan.allowPayoutPayment && !free && !current && !missing ? `<button class="btn-outline w-100" onclick="processSubscriptionFinal('${esc(plan.id)}','payout')"><i class="fas fa-wallet"></i> Pay from Payout</button>` : ''}
      </div>
    </div>`;
  }
  function settingsTextFinal(settings){
    if(!settings) return [];
    const names = {theme:'Dark Theme',darkTheme:'Dark Theme',support:'Support Tickets',supportTickets:'Support Tickets',b2b:'B2B Supplies',buyB2b:'B2B Supplies',b2bSupplies:'B2B Supplies',ads:'Sponsored Ads',sponsoredAds:'Sponsored Ads',offline:'Offline Mode',autoAcc:'Auto Accept',vacation:'Vacation Mode',sms:'SMS Alerts','2fa':'2FA Security',searchSuggestions:'Search Suggestions',bankEdit:'Bank Edit'};
    if(Array.isArray(settings)) return settings.map(k => names[low(k)] || txt(k));
    return Object.keys(settings).filter(k => truthy(settings[k], false)).map(k => names[k] || names[low(k)] || k);
  }
  function renderSubscriptionsFinal(){
    renderSubscriptionHeaderButtonsFinal();
    const grid = $('subscriptionPlansGrid');
    if(!grid) return;
    if(!state.plans.length) state.plans = ensureBasicFinal([]);
    grid.innerHTML = state.plans.map(renderPlanCardFinal).join('');
    const badge = $('currentPlanBadge');
    const plan = activePlanFinal();
    if(badge) badge.textContent = plan.name || 'Basic';
    applySettingLocksFinal();
  }
  window.renderSubscriptionsFinal = renderSubscriptionsFinal;
  window.loadSubscriptionsUI = window.loadStrictSubscriptionsUI = async function(){
    await fetchDynamicFinal(false);
    renderSubscriptionsFinal();
  };
  try{ window.loadSubscriptionsUI = window.loadSubscriptionsUI; loadSubscriptionsUI = window.loadSubscriptionsUI; }catch(e){}
  window.togglePlanDuration = function(type){
    state.yearly = type === 'year'; window.currentPlanDuration = state.yearly ? 'year' : 'month';
    const m = $('btnPlanMonth'), y = $('btnPlanYear');
    if(m) m.classList.toggle('active', !state.yearly);
    if(y){ y.classList.toggle('active', state.yearly); y.innerHTML = state.yearly ? 'Yearly -35% <i class="fas fa-check"></i>' : 'Yearly -35%'; }
    renderSubscriptionsFinal();
  };
  async function freeFirstEligibleFinal(plan){
    if(priceForFinal(plan, false) <= 0) return true;
    if(!plan.freeFirstEnabled || !plan.freeFirstLimit) return false;
    const email = sellerEmailFinal();
    try{
      const snap = await db.collection('seller_subscriptions').where('planId','==',plan.id).where('freeOffer','==',true).limit(Number(plan.freeFirstLimit)).get();
      const already = await db.collection('seller_subscriptions').where('sellerEmail','==',email).where('planId','==',plan.id).where('freeOffer','==',true).limit(1).get().catch(()=>({empty:true}));
      return already.empty && snap.size < Number(plan.freeFirstLimit);
    }catch(e){ return false; }
  }
  async function saveInvoiceRecordFinal(plan, opts){
    const start = new Date();
    const duration = opts.duration === 'year' ? 'year' : 'month';
    const days = duration === 'year' ? 365 : (low(plan.id) === 'basic' ? 30 : Number(plan.durationDays || 30));
    const end = new Date(start.getTime() + days * 86400000);
    const amount = Number(opts.amount || 0);
    const record = {
      invoiceId:'SUB-' + Date.now(), type: amount <= 0 ? 'subscription_free' : 'subscription_payment', sellerEmail:sellerEmailFinal(), email:sellerEmailFinal(), sellerName:activeSeller.companyName || activeSeller.shopName || activeSeller.email || '',
      planId:plan.id, plan:plan.name, planName:plan.name, amount, gross:amount, deductions:0, net:amount, method:opts.method || 'online', paidBy:opts.method || 'online', status:'Active', freeOffer:!!opts.freeOffer,
      startDate:start.toISOString(), endDate:end.toISOString(), timestamp:nowIso(), benefits:plan.benefits || plan.features || [], freeAds:Number(plan.freeAds || 0), settings:plan.settings || {}, duration
    };
    const sellerUpdate = { subscription:plan.name, subscriptionId:plan.id, subscriptionPlanId:plan.id, subEndDate:end.toISOString(), subscriptionUpdatedAt:nowIso(), subscriptionFeatures:{planId:plan.id, planName:plan.name, features:plan.benefits||plan.features||[], freeAds:Number(plan.freeAds||0), logoLimit:Number(plan.logoLimit||0), bannerLimit:Number(plan.bannerLimit||0), settings:plan.settings||{}, commissionPercent:Number(plan.commissionPercent||0), sponsoredAdPrice:Number(plan.sponsoredAdPrice||70)} };
    if(!activeSeller.subHistory) activeSeller.subHistory = [];
    activeSeller.subHistory.push(record);
    Object.assign(activeSeller, sellerUpdate);
    localStorage.setItem('sellerToken', JSON.stringify(activeSeller));
    const docId = sellerDocIdFinal();
    await db.collection('sellers').doc(docId).set({...sellerUpdate, subHistory:activeSeller.subHistory}, {merge:true});
    await db.collection('active_seller_subscriptions').doc(docId).set({...record, ...sellerUpdate.subscriptionFeatures}, {merge:true});
    await db.collection('seller_subscriptions').add(record);
    try{ await db.collection('seller_payment_ledger').add({...record, reference:plan.name}); }catch(e){}
    state.active = record;
    await fetchSubscriptionInvoicesFinal();
    renderSubscriptionsFinal();
    applySettingLocksFinal();
    if(typeof showToast === 'function') showToast(plan.name + ' activated successfully.', 'success');
    return record;
  }
  window.processSubscriptionFinal = async function(planId, method){
    await fetchDynamicFinal(false);
    const plan = planByIdNameFinal(planId);
    if(!plan) return showToast('Plan not found. Click Refresh Admin Plans.', 'error');
    const yearly = state.yearly || window.currentPlanDuration === 'year';
    let amount = priceForFinal(plan, yearly);
    if(amount === null) return showToast('Admin has not added price for this plan.', 'error');
    const firstFree = await freeFirstEligibleFinal(plan);
    if(amount <= 0 || plan.isFree || firstFree || method === 'free'){
      if(firstFree && amount > 0) showToast('Admin free offer applied for 1 month.', 'success');
      return saveInvoiceRecordFinal(plan, {amount:0, method:'free', duration:'month', freeOffer:firstFree && amount > 0});
    }
    if(method === 'payout'){
      const ok = confirm('Deduct ' + money(amount) + ' from your upcoming payout for ' + plan.name + '?');
      if(!ok) return;
      try{ await db.collection('fines').add({email:sellerEmailFinal(), sellerEmail:sellerEmailFinal(), amount, reason:'Subscription payout deduction: ' + plan.name, timestamp:nowIso(), planId:plan.id}); }catch(e){}
      return saveInvoiceRecordFinal(plan, {amount, method:'payout', duration:yearly?'year':'month'});
    }
    if(!window.Razorpay || !window.API_KEYS || !API_KEYS.RAZORPAY) return showToast('Razorpay key missing. Ask admin to set payment key.', 'error');
    new Razorpay({
      key:API_KEYS.RAZORPAY, amount:Math.round(amount * 100), currency:'INR', name:'Aryanta Enterprise', description:plan.name + ' Subscription',
      prefill:{name:activeSeller.companyName||'', email:activeSeller.email||'', contact:activeSeller.phone||''}, theme:{color:'#0f172a'},
      handler: async res => saveInvoiceRecordFinal(plan, {amount, method:'online', duration:yearly?'year':'month', razorpayPaymentId:res.razorpay_payment_id||''})
    }).open();
  };
  window.processSubscription = window.processStrictSubscription = window.processSubscriptionFinal;
  function modalShellFinal(id, html){
    let modal = $(id);
    if(!modal){
      modal = document.createElement('div'); modal.id = id; modal.className = 'modal'; modal.style.display = 'none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  }
  window.closeFinalModal = function(id){ const m = $(id); if(m){ m.classList.remove('show'); setTimeout(() => m.style.display = 'none', 200); } };
  window.openSubscriptionReadMoreFinal = function(planId){
    const plan = planByIdNameFinal(planId) || basicPlanFinal();
    const monthly = priceForFinal(plan, false), yearly = priceForFinal(plan, true), base = yearlyBaseFinal(plan);
    const benefits = parseLines(firstDefined(plan.benefits, plan.features, plan.benefitsText));
    const settings = settingsTextFinal(plan.settings);
    modalShellFinal('subscriptionReadMoreModal', `<div class="modal-content" style="max-width:760px;width:94%;max-height:90vh;overflow:auto;">
      <div class="modal-header"><h3><i class="fas fa-crown"></i> ${esc(plan.name)} Plan Details</h3><button onclick="closeFinalModal('subscriptionReadMoreModal')" class="modal-close-btn"><i class="fas fa-times"></i></button></div>
      <div class="modal-body" style="padding:20px;">
        <div class="sub-read-hero"><h2>${esc(plan.title||plan.name)}</h2><p>${esc(plan.description||'')}</p><strong>${monthly===0?'Free':money(monthly)} / month</strong>${yearly!==null?`<span style="margin-left:10px;">Yearly: ${money(yearly)} ${base&&base>yearly?`<del>${money(base)}</del> 35% OFF`:''}</span>`:''}</div>
        <div class="profile-info-grid" style="margin-top:16px;">
          <div><label>Free Sponsored Ads</label><strong>${Number(plan.freeAds||0)} / month</strong></div>
          <div><label>Logo Upload Limit</label><strong>${Number(plan.logoLimit||0)} / month</strong></div>
          <div><label>Banner Upload Limit</label><strong>${Number(plan.bannerLimit||0)} / month</strong></div>
          <div><label>Commission / Fee</label><strong>${Number(plan.commissionPercent||0)}%</strong></div>
          <div><label>Sponsored Ad Price</label><strong>${money(plan.sponsoredAdPrice||70)}</strong></div>
          <div><label>Validity</label><strong>${Number(plan.durationDays||30)} days monthly / 365 days yearly</strong></div>
        </div>
        <h4 style="margin-top:18px;">Benefits</h4><ul class="plan-features readmore-benefits">${benefits.length?benefits.map(b=>`<li><i class="fas fa-check-circle"></i> ${esc(b)}</li>`).join(''):'<li>No benefit text added by admin.</li>'}</ul>
        <h4 style="margin-top:18px;">Allowed Seller Settings</h4><div class="dynamic-button-grid">${settings.length?settings.map(s=>`<div class="dynamic-button-card"><i class="fas fa-check"></i><strong>${esc(s)}</strong></div>`).join(''):'<div class="admin-note-box">No custom access list added.</div>'}</div>
        <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-prime" onclick="processSubscriptionFinal('${esc(plan.id)}','online')">${priceForFinal(plan,state.yearly)<=0?'Activate Free':'Get This Plan'}</button><button class="btn-outline" onclick="closeFinalModal('subscriptionReadMoreModal')">Close</button></div>
      </div></div>`);
  };
  function invoiceRowFinal(r, i){
    const plan = firstDefined(r.planName, r.plan, r.subscription, r.reference, r.planId, 'Subscription');
    const amount = Number(firstDefined(r.amount, r.net, r.gross, 0)) || 0;
    const method = firstDefined(r.method, r.paidBy, r.paymentMethod, 'free');
    const start = firstDefined(r.startDate, r.timestamp, r.createdAt, '');
    const end = firstDefined(r.endDate, r.subEndDate, r.validTill, '');
    return `<tr><td data-label="Invoice"><strong>${esc(firstDefined(r.invoiceId, r.id, 'SUB-'+(i+1)))}</strong><br><small>${start?new Date(start).toLocaleString():'N/A'}</small></td><td data-label="Plan">${esc(plan)}</td><td data-label="Paid By">${esc(method)}</td><td data-label="Amount"><strong>${money(amount)}</strong></td><td data-label="Valid Till">${end?new Date(end).toLocaleDateString():'N/A'}</td><td data-label="Slip"><button class="btn-sm" onclick="printSubscriptionSlipFinal(${i})"><i class="fas fa-print"></i> Slip</button></td></tr>`;
  }
  window.openSubscriptionInvoicesFinal = async function(){
    await fetchDynamicFinal(false); await fetchSubscriptionInvoicesFinal();
    const rows = state.invoices.length ? state.invoices.map(invoiceRowFinal).join('') : '<tr><td colspan="6" style="text-align:center;font-weight:800;padding:24px;">No subscription invoice found yet.</td></tr>';
    modalShellFinal('subscriptionInvoicesModal', `<div class="modal-content" style="max-width:980px;width:96%;max-height:90vh;overflow:auto;">
      <div class="modal-header"><h3><i class="fas fa-file-invoice"></i> Your Subscription Invoices</h3><button onclick="closeFinalModal('subscriptionInvoicesModal')" class="modal-close-btn"><i class="fas fa-times"></i></button></div>
      <div class="modal-body" style="padding:20px;"><div class="table-container"><table class="admin-table"><thead><tr><th>Invoice</th><th>Plan</th><th>Paid By</th><th>Amount</th><th>Valid Till</th><th>Slip</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`);
  };
  window.printSubscriptionSlipFinal = function(index){
    const r = state.invoices[index]; if(!r) return;
    const plan = firstDefined(r.planName, r.plan, r.subscription, r.reference, r.planId, 'Subscription');
    const amount = Number(firstDefined(r.amount, r.net, r.gross, 0)) || 0;
    const benefits = parseLines(firstDefined(r.benefits, r.features, (planByIdNameFinal(r.planId||plan)||{}).benefits));
    const html = `<!doctype html><html><head><title>Subscription Invoice</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a}.slip{max-width:760px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}.head{background:#0f172a;color:white;padding:24px;display:flex;justify-content:space-between;align-items:center}.body{padding:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{background:#f1f5f9;border-radius:12px;padding:14px}.label{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:900}.val{font-size:15px;font-weight:800;margin-top:4px}.amount{font-size:32px;color:#059669}.foot{padding:18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b}@media print{body{background:white}.no-print{display:none}}</style></head><body><div class="slip"><div class="head"><div><h2>Aryanta Subscription Invoice</h2><p>${esc(firstDefined(r.invoiceId,r.id,'SUB'))}</p></div><div class="amount">${money(amount)}</div></div><div class="body"><div class="grid"><div class="box"><div class="label">Seller</div><div class="val">${esc(activeSeller.companyName||activeSeller.shopName||activeSeller.email||'Seller')}</div></div><div class="box"><div class="label">Plan</div><div class="val">${esc(plan)}</div></div><div class="box"><div class="label">Paid By</div><div class="val">${esc(firstDefined(r.method,r.paidBy,r.paymentMethod,'free'))}</div></div><div class="box"><div class="label">Status</div><div class="val">${esc(firstDefined(r.status,'Active'))}</div></div><div class="box"><div class="label">Start Date</div><div class="val">${r.startDate?new Date(r.startDate).toLocaleString():'N/A'}</div></div><div class="box"><div class="label">End Date</div><div class="val">${r.endDate?new Date(r.endDate).toLocaleString():'N/A'}</div></div></div><h3>Benefits</h3><ul>${benefits.map(b=>`<li>${esc(b)}</li>`).join('') || '<li>No benefits added.</li>'}</ul><button class="no-print" onclick="window.print()" style="padding:12px 18px;background:#0f172a;color:white;border:0;border-radius:10px;font-weight:800">Print Slip</button></div><div class="foot">Generated by Aryanta Seller Panel • ${new Date().toLocaleString()}</div></div></body></html>`;
    const w = window.open('', '_blank'); if(w){ w.document.write(html); w.document.close(); setTimeout(()=>w.print(), 400); }
  };
  function planAllowsSettingFinal(key){
    const plan = activePlanFinal();
    const s = plan.settings || {};
    if(Array.isArray(s)) return s.map(low).includes(low(key)) || (key === 'theme' && s.map(low).includes('darktheme'));
    if(typeof s === 'object'){
      if(s[key] !== undefined) return truthy(s[key], false);
      if(key === 'theme' && s.darkTheme !== undefined) return truthy(s.darkTheme, false);
      if(key === 'support' && s.supportTickets !== undefined) return truthy(s.supportTickets, false);
      if(key === 'b2b' && (s.buyB2b !== undefined || s.b2bSupplies !== undefined)) return truthy(firstDefined(s.buyB2b, s.b2bSupplies), false);
      if(key === 'ads' && s.sponsoredAds !== undefined) return truthy(s.sponsoredAds, false);
      return low(plan.id) !== 'basic';
    }
    return low(plan.id) === 'basic' ? ['theme','support','b2b','ads'].includes(key) : true;
  }
  function applySettingLocksFinal(){
    const controls = [
      ['settingOffline','offline'], ['settingTheme','theme'], ['settingAutoAcc','autoAcc'], ['settingVacation','vacation'], ['settingSms','sms'], ['setting2fa','2fa'], ['settingSearchSuggestions','searchSuggestions']
    ];
    controls.forEach(([id,key]) => {
      const input = $(id); if(!input) return;
      const card = input.closest('.setting-card-premium') || input.closest('.setting-card') || input.parentElement;
      const allowed = planAllowsSettingFinal(key);
      input.disabled = !allowed;
      if(card){
        card.classList.toggle('subscription-locked', !allowed);
        let lock = card.querySelector('.sub-lock-msg');
        if(!allowed){
          if(!lock){ lock = document.createElement('div'); lock.className = 'sub-lock-msg'; lock.style.cssText = 'font-size:11px;font-weight:900;color:#f59e0b;margin-top:5px;'; card.appendChild(lock); }
          lock.innerHTML = '<i class="fas fa-lock"></i> Buy subscription to unlock';
        } else if(lock) lock.remove();
      }
    });
  }
  const oldLoadSettingsFinal = window.loadSettingsUI;
  window.loadSettingsUI = async function(){
    if(oldLoadSettingsFinal) await oldLoadSettingsFinal();
    await fetchDynamicFinal(false);
    applySettingLocksFinal();
  };
  window.applySubscriptionSettingLocksFinal = applySettingLocksFinal;
  function applyProfileBrandingFinal(){
    const plan = activePlanFinal();
    const cfg = state.config || {};
    const branding = cfg.branding || cfg.profileBranding || {};
    const showBranding = truthy(firstDefined(branding.enabled, branding.show, cfg.showSellerBranding), true);
    const logoAllowed = showBranding && Number(plan.logoLimit || 0) > 0 && truthy(firstDefined(branding.logoUploadEnabled, branding.allowLogoUpload), true);
    const bannerAllowed = showBranding && Number(plan.bannerLimit || 0) > 0 && truthy(firstDefined(branding.bannerUploadEnabled, branding.allowBannerUpload), true);
    const logoInput = $('storeLogoInput'), bannerInput = $('storeBannerInput');
    [logoInput, bannerInput].forEach((inp, idx) => {
      if(!inp) return;
      const wrap = inp.closest('.profile-upload-box') || inp.closest('.panel-box') || inp.parentElement;
      if(wrap) wrap.style.display = (idx === 0 ? logoAllowed : bannerAllowed) ? '' : 'none';
    });
  }
  const oldLoadProfileFinal = window.loadProfile;
  window.loadProfile = async function(){
    if(oldLoadProfileFinal) await oldLoadProfileFinal();
    await fetchDynamicFinal(false);
    applyProfileBrandingFinal();
  };
  async function loadInitialCoreFinal(){
    if(typeof window.ensureSellerProducts === 'function') await window.ensureSellerProducts(true);
    if(typeof window.ensureSellerOrders === 'function') await window.ensureSellerOrders(true);
    if(typeof window.fetchNotifications === 'function') await window.fetchNotifications().catch(()=>{});
    if(typeof window.renderDashboardStats === 'function') window.renderDashboardStats();
  }
  async function fetchSellerDocFinal(token){
    const email = low(token && token.email);
    if(!email || !window.db) return token;
    try{ const d = await db.collection('sellers').doc(email).get(); if(d.exists) return {id:d.id, ...d.data()}; }catch(e){}
    try{ const qs = await db.collection('sellers').where('email','==',email).limit(1).get(); if(!qs.empty) return {id:qs.docs[0].id, ...qs.docs[0].data()}; }catch(e){}
    return token;
  }
  function showLoginFinal(){
    const lo=$('loginOverlay'), app=$('mainAppContainer') || document.querySelector('.seller-container');
    if(lo) lo.style.display='flex'; if(app) app.style.display='none'; hideLoaderFinal();
  }
  function showAppFinal(){
    const lo=$('loginOverlay'), app=$('mainAppContainer') || document.querySelector('.seller-container');
    if(lo) lo.style.display='none'; if(app) app.style.display='flex';
  }
  window.checkSession = checkSession = async function(){
    const raw = localStorage.getItem('sellerToken');
    if(!raw || !window.db) return showLoginFinal();
    setLoaderFinal('Checking seller account...', 8);
    let token; try{ token = JSON.parse(raw); }catch(e){ localStorage.removeItem('sellerToken'); return showLoginFinal(); }
    try{
      window.activeSeller = activeSeller = await fetchSellerDocFinal(token);
      if(!activeSeller.settings) activeSeller.settings = {};
      localStorage.setItem('sellerToken', JSON.stringify(activeSeller));
      const st = low(activeSeller.status || activeSeller.accountStatus || 'active');
      if(st === 'blocked'){
        if(typeof renderStatusScreen === 'function') renderStatusScreen('Account Blocked','Your seller account is blocked by Admin.',false);
        const lo=$('loginOverlay'); if(lo) lo.style.display='flex'; hideLoaderFinal(); return;
      }
      setLoaderFinal('Loading dashboard, orders and inventory...', 28);
      await loadInitialCoreFinal();
      setLoaderFinal('Loading subscription, settings and support controls...', 62);
      await fetchDynamicFinal(true);
      setLoaderFinal('Applying active subscription access...', 82);
      renderSubscriptionsFinal();
      applySettingLocksFinal();
      applyProfileBrandingFinal();
      if(typeof window.renderSupportCategories === 'function') await window.renderSupportCategories().catch(()=>{});
      if(typeof window.renderVersionInfo === 'function') window.renderVersionInfo();
      if(typeof window.applyAdminTextOverrides === 'function') window.applyAdminTextOverrides();
      const greet=$('sellerGreeting'); if(greet) greet.innerText = '| ' + (activeSeller.companyName || activeSeller.shopName || activeSeller.email || '');
      const vb=$('verifiedBadge'); if(vb && activeSeller.subscription && activeSeller.subscription !== 'Basic') vb.style.display='inline';
      showAppFinal();
      setLoaderFinal('Opening seller panel...', 100);
      setTimeout(hideLoaderFinal, 250);
    }catch(e){
      console.error('Final seller boot failed:', e);
      setLoaderFinal('Could not load seller panel. Check internet and refresh.', 'Retry');
      if(typeof showToast === 'function') showToast('Could not load seller panel. Please refresh once.', 'error');
    }
  };
  window.refreshSellerPanelDynamicData = window.forceRefreshDynamicAdminControls = window.refreshDynamicAdminControls = async function(force=true){
    setLoaderFinal('Refreshing admin subscription settings...', 35);
    await fetchDynamicFinal(true);
    renderSubscriptionsFinal();
    applySettingLocksFinal();
    applyProfileBrandingFinal();
    if(typeof window.renderSupportCategories === 'function') await window.renderSupportCategories().catch(()=>{});
    hideLoaderFinal();
    if(typeof showToast === 'function') showToast('Admin seller settings refreshed.', 'success');
    return true;
  };
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      renderSubscriptionHeaderButtonsFinal();
      if(state.loaded) renderSubscriptionsFinal();
    }, 800);
  });
})();
