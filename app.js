// ==========================================
// CONFIGURATION
// ==========================================
// ✅ Your Secure Cloudflare Worker URL
const API_URL = "https://rough-field-c679.official-aryanta.workers.dev";

// --- EMAILJS CREDENTIALS ---
emailjs.init("TDgNRO0CEs9rU3ozD");

// --- GLOBAL STATE ---
let currentUser = null;
let resendTimer = null;
let updateResendTimer = null; 
let currentPickerYear = new Date().getFullYear();
let currentPickerMonth = new Date().getMonth() + 1;
let isEmailVerified = true; 
let updateEmailOTP = null;
let actionOTP = null; 
let pendingUpdateData = null; 
let refreshInterval = null; 

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('view-login').classList.remove('hidden');
    
    const savedData = localStorage.getItem("aryanta_user");
    if(savedData) {
        toggleLoader(true);
        // Hide credentials, try to auto-login
        document.getElementById('section-credentials').classList.add('hidden');
        try {
            const tempUser = JSON.parse(savedData);
            if(tempUser && tempUser.uid) {
                const minWait = new Promise(resolve => setTimeout(resolve, 1500));
                verifySession(tempUser.uid, minWait); 
            } else { throw new Error("Invalid stored data"); }
        } catch(e) { 
            console.error("Auth Error", e); 
            logout(false); 
        }
    } else {
        // NO AUTO LOGIN: Show Credentials directly
        // Removed logic regarding Role Select Screen
        document.getElementById('section-credentials').classList.remove('hidden');
    }
    
    document.getElementById('btn-login-action')?.addEventListener('click', handleLogin);
    
    const overlay = document.querySelector('.mobile-nav-overlay');
    if(overlay) overlay.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('active');
        overlay.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        const picker = document.getElementById('att-custom-picker');
        const btn = document.getElementById('att-picker-btn');
        if (picker && !picker.classList.contains('hidden') && !picker.contains(e.target) && !btn.contains(e.target)) {
            picker.classList.add('hidden');
        }
        const customSelect = document.querySelector('.custom-select-wrapper');
        if (customSelect && !customSelect.contains(e.target)) {
            document.querySelector('.custom-options')?.classList.remove('open');
        }
    });

    initCustomPicker();
});

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

window.togglePassVisibility = (id, icon) => {
    const input = document.getElementById(id);
    if(input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

async function verifySession(uid, waitPromise) {
    try {
        const response = await fetch(`${API_URL}/api/get-user?uid=${uid}`);
        const data = await response.json();

        if(waitPromise) await waitPromise;

        if (!data || !data.user) return logout("Account not found.");
        const emp = data.user;
        
        if (emp.status !== 'Active') return logout("Your profile is inactive. Contact Admin.");
        
        currentUser = emp;
        currentUser.databaseKey = data.key || "unknown_key";
        
        localStorage.setItem("aryanta_user", JSON.stringify(currentUser));
        updateUserActivity(emp.uid, currentUser.databaseKey);
        toggleLoader(false);
        checkRoleAndRedirect(); 

    } catch(e) { 
        console.error(e);
        if(waitPromise) await waitPromise; 
        toggleLoader(false); 
        logout(false); 
    }
}

function checkRoleAndRedirect() {
    if(!currentUser) return;
    const role = (currentUser.personal.post || "").toLowerCase();
    
    // Automatically redirect managers, everyone else goes to dashboard
    if(role.includes('manager')) {
        window.location.href = "manager.html"; 
    } else {
        loadDashboard();
    }
}

async function updateUserActivity(uid, dbKey) {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const json = await res.json();
        
        const activityData = {
            state: 'Online',
            last_login: new Date().toLocaleString(),
            timestamp: Date.now(),
            ip: json.ip,
            device: navigator.userAgent
        };

        await fetch(`${API_URL}/api/update-activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dbKey, activityData })
        });

    } catch (err) { console.error("Tracking Error:", err); }
}

async function handleLogin(e) {
    if(e) e.preventDefault();
    const uid = document.getElementById('in-uid').value.trim();
    const pass = document.getElementById('in-pass').value.trim();
    
    if(!uid || !pass) { showToast("Enter Credentials", "danger"); return; }
    
    toggleLoader(true);
    
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, pass })
        });
        
        const result = await response.json();
        
        if(!response.ok) {
            toggleLoader(false);
            showToast(result.error || "Login Failed", "danger");
            return;
        }

        const emp = result.user;
        const key = result.key;

        if(emp.status !== 'Active') { 
            toggleLoader(false); 
            alert("Your profile is inactive. Contact Admin."); 
            return; 
        }

        currentUser = emp;
        currentUser.databaseKey = key;
        
        sendOTP(emp);

    } catch (error) {
        toggleLoader(false);
        console.error(error);
        showToast("Connection Error. Check Internet.", "danger");
    }
}

function sendOTP(emp) {
    const otp = Math.floor(100000 + Math.random() * 900000);
    sessionStorage.setItem("login_otp", otp);
    
    const messageBody = `Your One-Time Password (OTP) is: ${otp}\n\nThis code is valid for verification purposes only. Do not share it with anyone.`;

    emailjs.send("service_wnqvm4n", "template_qiyhfbm", { 
        to_email: emp.personal.email, 
        name: emp.personal.name,     
        message: messageBody         
    }).then(() => {
        toggleLoader(false);
        showToast("OTP sent to email 📧");
        document.getElementById('section-credentials').classList.add('hidden');
        document.getElementById('section-otp').classList.remove('hidden');
        
        const email = emp.personal.email || "";
        const parts = email.split("@");
        let masked = email;
        if(parts.length === 2 && parts[0].length > 2) masked = parts[0].substring(0, 2) + "****@" + parts[1];
        
        document.getElementById('disp-email').innerText = masked;
        startResendTimer();
        document.getElementById('in-otp').value = "";
    }).catch(err => { 
        toggleLoader(false); 
        console.error("EmailJS Error:", err); 
        showToast("Failed to send email. Check Console.", "danger"); 
    });
}

window.checkAutoOtp = function(input) {
    if(input.value.length === 6) {
        handleOTPVerify();
    }
};

function handleOTPVerify(e) {
    if(e) e.preventDefault();
    const userOTP = document.getElementById("in-otp").value;
    const savedOTP = sessionStorage.getItem("login_otp");
    
    if (userOTP === savedOTP) {
        toggleLoader(true);
        document.getElementById('loader-text').innerText = "Verifying...";

        setTimeout(() => {
            showToast("Access Granted 🔓");
            sessionStorage.removeItem("login_otp");
            if(currentUser && currentUser.databaseKey) { 
                updateUserActivity(currentUser.uid, currentUser.databaseKey); 
            }
            toggleLoader(false);
            checkRoleAndRedirect(); 
        }, 2000); 
    } else { 
        if(userOTP.length === 6) showToast("Incorrect OTP", "danger"); 
    }
}

// ==========================================
// DASHBOARD & UI
// ==========================================

function loadDashboard() {
    if(!currentUser) return logout();
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    
    refreshAllData();

    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        refreshAllData();
    }, 15000); 

    updateUI(currentUser);
    loadInchargePanel(); 
}

function refreshAllData() {
    if(!currentUser) return;
    
    fetch(`${API_URL}/api/get-user?uid=${currentUser.uid}`)
        .then(res => res.json())
        .then(data => {
            if(data.user) {
                currentUser = data.user;
                updateUI(currentUser);
            }
        });

    loadNotifications();
    loadMyPayslips(); 
    loadAttendance(); 
}

function updateUI(u) {
    const p = u.personal || {};
    const b = u.bank || {};
    const s = u.security || {};
    const defImg = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
    setText('header-name', p.name || "User");
    document.getElementById('header-img').src = s.photo || defImg;
    document.getElementById('p-img').src = s.photo || defImg;
    
    setText('p-name', p.name);
    
    const designation = p.job || "Employee";
    const role = p.post || "Staff"; 
    
    setText('p-job', designation);
    setText('p-post', role);
    setText('p-job-detail', designation);
    setText('p-post-detail', role);

    setText('p-uid', "UID: " + u.uid);
    setText('p-father', p.father);
    setText('p-dob', p.dob);
    setText('p-phone', p.phone);
    setText('p-email', p.email);
    setText('p-join', p.join);
    setText('p-address', p.address);
    setText('p-bank', b.bank);
    setText('p-acc', b.acc);
    setText('p-salary', "₹ " + parseFloat(b.salary || 0).toLocaleString('en-IN'));
    setText('p-aadhaar', s.aadhaar);

    document.getElementById('up-phone').placeholder = p.phone || "Phone";
    document.getElementById('up-email').placeholder = p.email || "Email";
    document.getElementById('up-bank').placeholder = b.bank || "Bank Name";
    document.getElementById('up-branch').placeholder = b.branch || "Branch";
    document.getElementById('up-ifsc').placeholder = b.ifsc || "IFSC";
    document.getElementById('up-acc').placeholder = b.acc || "Account No";
}

// ==========================================
// DATA MODULES (NOTICES, MESSAGES, INCHARGES)
// ==========================================

function loadNotifications() {
    const chatBox = document.getElementById('chat-box');
    
    // ✅ Fetch logic updated: Now fetches 'messages/UID' directly
    fetch(`${API_URL}/api/get-messages?uid=${currentUser.uid}`)
        .then(r => r.json())
        .then(data => {
            if(!data || Object.keys(data).length === 0) {
                 chatBox.innerHTML = `<div class="msg-bubble msg-received"><p><b>System:</b> No new notices.</p></div>`;
                 return;
            }
            chatBox.innerHTML = "";
            const validMsgs = [];
            
            // Logic updated to handle direct message list from Worker
            Object.values(data).forEach(msg => {
                validMsgs.push(msg);
            });
            validMsgs.sort((a,b) => a.timestamp - b.timestamp);
            
            validMsgs.forEach(msg => {
                const bubble = document.createElement('div'); bubble.className = "msg-bubble msg-received";
                if(msg.sender === currentUser.personal.name) {
                    bubble.className = "msg-bubble msg-sent";
                    bubble.style.background = "#3b82f6";
                    bubble.style.alignSelf = "flex-end";
                }
                const dateStr = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "";
                bubble.innerHTML = `<div style="margin-bottom:5px;"><p><b>${msg.sender || 'Admin'}:</b> ${msg.text || msg.message}</p></div><span style="font-size:10px; color:#e2e8f0; opacity:0.8; display:block;">${dateStr}</span>`;
                chatBox.appendChild(bubble);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        })
        .catch(e => {
            console.error("Notice Error:", e);
        });
}

// ✅ SUBMIT USER MESSAGE (Chat)
window.submitUserMessage = () => {
    const txt = document.getElementById('new-msg-input').value.trim();
    if(!txt) return showToast("Type a message", "warning");

    const msgData = {
        sender: currentUser.personal.name,
        senderUid: currentUser.uid,
        target: "Admin",
        text: txt,
        timestamp: Date.now(),
        readAt: null
    };

    const btn = document.querySelector('.btn-prime[type="submit"]'); 
    const originalText = btn ? btn.innerHTML : "Send";
    if(btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending`;
        btn.disabled = true;
    }

    // ✅ Calls new Worker Endpoint for User Chat
    fetch(`${API_URL}/api/send-message`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(msgData)
    }).then(res => res.json()).then(d => {
        if(d.success) {
            showToast("Message Sent 📤");
            document.getElementById('new-msg-input').value = "";
            loadNotifications(); 
        } else {
            showToast("Failed to send", "danger");
        }
        if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
    }).catch(() => {
        showToast("Error sending", "danger");
        if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
    });
};

window.loadInchargePanel = function() {
    const container = document.getElementById('incharge-list-container');
    if (!container) return;
    container.innerHTML = `<p style="text-align: center; color: #94a3b8; margin-top:20px;">Loading Incharges...</p>`;

    fetch(`${API_URL}/api/get-incharges`)
        .then(r => r.json())
        .then(data => {
            if(!data || data.length === 0) {
                 container.innerHTML = `<p style="text-align: center; color: #94a3b8;">No Incharges Assigned</p>`;
                 return;
            }
            container.innerHTML = ""; 
            
            data.forEach(inc => {
                const img = inc.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
                const card = document.createElement('div');
                card.className = "incharge-card";
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:15px; padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1);">
                        <img src="${img}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #3b82f6;">
                        <div style="flex:1;">
                            <h4 style="color:white; margin:0;">${inc.name}</h4>
                            <span style="color:#94a3b8; font-size:12px;">${inc.post}</span>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <a href="tel:${inc.phone}" style="background:#3b82f6; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; text-decoration:none;"><i class="fa-solid fa-phone"></i></a>
                            <a href="mailto:${inc.email}" style="background:#f59e0b; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; text-decoration:none;"><i class="fa-solid fa-envelope"></i></a>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        })
        .catch(() => {
            container.innerHTML = `<p style="text-align: center; color: #94a3b8;">Error loading incharges.</p>`;
        });
};

function loadMyPayslips() {
    const list = document.getElementById('payments-list-container');
    fetch(`${API_URL}/api/get-payslips?uid=${currentUser.uid}`)
        .then(r => r.json())
        .then(data => {
            if(!data || Object.keys(data).length === 0) {
                 list.innerHTML = `<p style="color:#94a3b8; text-align:center;">No salary slips available.</p>`;
                 return;
            }
            list.innerHTML = "";
            Object.values(data).sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(slip => {
                const displayDate = slip.salaryMonth || slip.date;
                const card = document.createElement('div'); card.className = "slip-notice-card";
                card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div><span class="slip-title">Salary Slip: ${displayDate}</span><span class="slip-date">Slip ID: ${slip.slipId}</span></div><div style="text-align:right;"><span style="display:block; font-weight:bold; color:#10b981; font-size:16px;">₹${parseInt(slip.netPay).toLocaleString('en-IN')}</span><span style="font-size:10px; color:#64748b;">Click to View</span></div></div>`;
                card.onclick = () => viewPayslipPaper(slip);
                list.appendChild(card);
            });
        });
}

window.loadAttendance = () => {
    if (!currentUser) return;
    const monthFormatted = currentPickerMonth < 10 ? `0${currentPickerMonth}` : currentPickerMonth;
    const selectedMonth = `${currentPickerYear}-${monthFormatted}`; 
    const circle = document.getElementById('att-circle');
    const percentTxt = document.getElementById('att-percent');
    
    fetch(`${API_URL}/api/get-attendance?uid=${currentUser.uid}&month=${selectedMonth}`)
        .then(r => r.json())
        .then(data => {
            const rawPresent = parseFloat(data.present || 0); 
            const rawLeaves = parseFloat(data.leaves || 0);
            const rawHolidays = parseFloat(data.holidays || 0);
            const rawLate = parseFloat(data.late || 0);
            const rawAbsent = parseFloat(data.absent || 0); 
            const totalDays = parseFloat(data.totalDays || 30); 

            const displayPresent = rawPresent + rawLate + rawHolidays;
            
            let percentage = Math.round((displayPresent / totalDays) * 100); 
            if (percentage > 100) percentage = 100;

            circle.style.setProperty('--progress', `${percentage}%`); 
            percentTxt.innerText = `${percentage}%`;
            
            if(percentage >= 75) { circle.style.color = '#3b82f6'; } 
            else if (percentage >= 50) { circle.style.color = '#f59e0b'; } 
            else { circle.style.color = '#ef4444'; }

            document.getElementById('att-present').innerText = `${displayPresent} / ${totalDays}`; 
            document.getElementById('att-leaves').innerText = rawLeaves; 
            document.getElementById('att-holidays').innerText = rawHolidays; 
            document.getElementById('att-late').innerText = rawLate + " days";
            document.getElementById('att-absent').innerText = rawAbsent;
        });
};

window.loadSalaryExpectation = (monthStr) => {
    if(!currentUser) return;
    const monthlySalary = parseFloat(currentUser.bank.salary || 0);
    const [year, month] = monthStr.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyRate = monthlySalary / daysInMonth;
    
    fetch(`${API_URL}/api/get-attendance?uid=${currentUser.uid}&month=${monthStr}`)
        .then(r => r.json())
        .then(data => {
            const present = parseFloat(data.present || 0);
            const holidays = parseFloat(data.holidays || 0);
            const leaves = parseFloat(data.leaves || 0);
            const late = parseFloat(data.late || 0);
            
            let earnedValue = (present * dailyRate) + 
                              (holidays * dailyRate) + 
                              (leaves * (dailyRate * 0.5)) + 
                              (late * (dailyRate * 0.7));
            
            if (earnedValue < 0) earnedValue = 0; 
            const finalAmount = Math.round(earnedValue);
            
            document.getElementById('salary-projection').innerText = "₹ " + finalAmount.toLocaleString('en-IN');
        })
        .catch(() => {
             document.getElementById('salary-projection').innerText = "₹ --";
        });
};

window.toggleCustomSelect = function() {
    document.getElementById('msg-recipient-options').classList.toggle('open');
}

window.selectCustomOption = function(element) {
    const value = element.getAttribute('data-value');
    const text = element.innerText;
    document.getElementById('msg-recipient-value').value = value;
    document.getElementById('msg-recipient-text').innerText = text;
    document.querySelectorAll('.custom-option').forEach(op => op.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('msg-recipient-options').classList.remove('open');
}

// ==========================================
// PROFILE UPDATE LOGIC
// ==========================================

window.checkEmailChange = () => {
    const inputEmail = document.getElementById('up-email').value.trim();
    const btnVerify = document.getElementById('btn-verify-email');
    const btnSubmit = document.getElementById('btn-submit-update');
    if (inputEmail && inputEmail !== currentUser.personal.email) {
        btnVerify.classList.remove('hidden'); btnSubmit.disabled = true; btnSubmit.innerText = "Verify Email First"; btnSubmit.style.background = "#94a3b8"; isEmailVerified = false;
    } else {
        btnVerify.classList.add('hidden'); btnSubmit.disabled = false; btnSubmit.innerText = "Submit Approval Request"; btnSubmit.style.background = ""; isEmailVerified = true;
    }
};

window.initiateEmailVerification = () => {
    initiateActionOTP(document.getElementById('up-email').value.trim());
};

window.verifyUpdateOTP = () => {
    const entered = document.getElementById('up-email-otp').value;
    if(entered == actionOTP) {
        showToast("Email Verified ✅"); isEmailVerified = true; document.getElementById('modal-verify-email').classList.add('hidden');
        const btnSubmit = document.getElementById('btn-submit-update'); btnSubmit.disabled = false; btnSubmit.innerText = "Submit Approval Request"; btnSubmit.style.background = ""; document.getElementById('btn-verify-email').innerText = "Verified"; document.getElementById('btn-verify-email').disabled = true;
    } else { showToast("Wrong OTP", "danger"); }
};

window.validateAndInitiateUpdate = () => {
    if(!currentUser) return;
    if(!isEmailVerified) return showToast("Please verify new email first", "danger");
    const p = currentUser.personal || {}; const b = currentUser.bank || {};
    const phoneIn = document.getElementById('up-phone').value.trim(); const emailIn = document.getElementById('up-email').value.trim(); const bankIn = document.getElementById('up-bank').value.trim(); const branchIn = document.getElementById('up-branch').value.trim(); const ifscIn = document.getElementById('up-ifsc').value.trim(); const accIn = document.getElementById('up-acc').value.trim();
    const newPhone = phoneIn !== "" ? phoneIn : p.phone; const newEmail = emailIn !== "" ? emailIn : p.email; const newBank = bankIn !== "" ? bankIn : b.bank; const newBranch = branchIn !== "" ? branchIn : b.branch; const newIfsc = ifscIn !== "" ? ifscIn : b.ifsc; const newAcc = accIn !== "" ? accIn : b.acc;
    if (newPhone === p.phone && newEmail === p.email && newBank === b.bank && newBranch === b.branch && newIfsc === b.ifsc && newAcc === b.acc) return showToast("No changes detected.", "warning");
    pendingUpdateData = { phone: newPhone, email: newEmail, bank: newBank, branch: newBranch, ifsc: newIfsc, acc: newAcc, photo: "No Change", message: "Requesting updates to profile details." };
    initiateActionOTP(newEmail);
};

window.initiateActionOTP = (targetEmail) => {
    actionOTP = Math.floor(100000 + Math.random() * 900000);
    const messageBody = `Confirm your profile update with OTP: ${actionOTP}`;
    
    toggleLoader(true);
    emailjs.send("service_wnqvm4n", "template_qiyhfbm", { 
        to_email: targetEmail, 
        name: currentUser.personal.name, 
        message: messageBody 
    }).then(() => {
        toggleLoader(false); 
        showToast("Confirmation OTP Sent 📧"); 
        document.getElementById('modal-verify-action').classList.remove('hidden');
        startUpdateResendTimer();
    }).catch(err => { toggleLoader(false); console.error(err); showToast("Error sending OTP", "danger"); });
};

function startUpdateResendTimer() {
    const btn = document.getElementById('btn-resend-action') || document.getElementById('btn-resend-update'); 
}

window.confirmUpdateWithOTP = () => {
    const entered = document.getElementById('action-otp').value;
    if(entered == actionOTP) { document.getElementById('modal-verify-action').classList.add('hidden'); submitFinalUpdate(); } else { showToast("Incorrect OTP", "danger"); }
};

function submitFinalUpdate() {
    if(!pendingUpdateData) return;
    
    const requestData = {
        uid: currentUser.uid,
        name: currentUser.personal.name,
        changes: pendingUpdateData,
        timestamp: Date.now(),
        status: "Pending"
    };

    fetch(`${API_URL}/api/submit-request`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestData)
    }).then(() => {
        const messageBody = `User ${currentUser.personal.name} (${currentUser.uid}) requested changes:\n\n${JSON.stringify(pendingUpdateData)}`;
        emailjs.send("service_wnqvm4n", "template_qiyhfbm", { 
            to_email: "aryanta@support.com", 
            name: "Admin", 
            message: messageBody 
        });

        closeUpdateModal();
        document.getElementById('modal-success').classList.remove('hidden');
        document.getElementById('form-update').reset();
        pendingUpdateData = null;
    }).catch(err => {
        showToast("Error submitting request", "danger");
    });
}

// ==========================================
// FORGOT PASSWORD / RECOVERY LOGIC (UPDATED)
// ==========================================

window.showForgotPass = () => { 
    document.getElementById('section-credentials').classList.add('hidden'); 
    document.getElementById('section-forgot').classList.remove('hidden');
    
    // Reset views to Step 1
    document.getElementById('forgot-step-verify').classList.remove('hidden');
    document.getElementById('forgot-step-manual').classList.add('hidden');
    
    // Clear forms
    document.getElementById('form-forgot-verify').reset();
    document.getElementById('form-forgot-manual').reset();
};

window.hideForgotPass = () => { 
    document.getElementById('section-forgot').classList.add('hidden'); 
    document.getElementById('section-credentials').classList.remove('hidden'); 
};

window.verifyRecoveryDetails = async () => {
    const contact = document.getElementById('rec-contact').value.trim();
    const aadhaar = document.getElementById('rec-aadhaar').value.trim();

    if(!contact || aadhaar.length !== 12) {
        showToast("Enter valid Email/Phone & 12-digit Aadhaar", "danger");
        return;
    }

    toggleLoader(true);

    // SIMULATE CHECK (Intentionally fails to show the manual form options)
    setTimeout(() => {
        toggleLoader(false);
        showToast("Account details not found.", "warning");
        
        // Hide Step 1, Show Step 2 (Manual Request)
        document.getElementById('forgot-step-verify').classList.add('hidden');
        document.getElementById('forgot-step-manual').classList.remove('hidden');
    }, 1500);
};

// HELPER: Generate the specific message text
function getRecoveryMessage(name, phone) {
    return `Respected Admin Sir,

I hope you are doing well. I am writing this message as an employee of the company. Unfortunately, I have forgotten my UID and password, due to which I am unable to log in to my account. I kindly request you to please help me reset or recover my login credentials at the earliest so I can continue my assigned work smoothly. Please let me know if any verification is required from my side.

My Details:
Name: ${name}
Mobile No: ${phone}

Thank you for your support.`;
}

// OPTION 1: Send via NATIVE EMAIL APP (mailto:) - NO EMAILJS
window.sendManualRecoveryRequest = () => {
    const name = document.getElementById('req-name').value.trim();
    const phone = document.getElementById('req-phone').value.trim();

    if(!name || !phone) {
        showToast("Please fill in Name and Phone", "danger");
        return;
    }

    const msg = getRecoveryMessage(name, phone);
    const subject = `Account Recovery Request - ${name}`;
    
    // Construct Mailto Link with pre-filled fields
    const mailtoLink = `mailto:official.aryanta@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
    
    // Open default email client
    window.location.href = mailtoLink;
    
    setTimeout(() => {
         hideForgotPass();
    }, 1000);
};

// OPTION 2: Open WhatsApp
window.openWhatsAppSupport = () => {
    const name = document.getElementById('req-name').value.trim();
    const phone = document.getElementById('req-phone').value.trim();

    if(!name || !phone) {
        showToast("Please enter Name and Phone first", "warning");
        document.getElementById('req-name').focus();
        return;
    }

    const msg = getRecoveryMessage(name, phone);
    
    // WhatsApp URL (using the phone number 8603467878 found in your app footer)
    const waUrl = `https://wa.me/918603467878?text=${encodeURIComponent(msg)}`;
    
    window.open(waUrl, '_blank');
};

// ==========================================
// UTILITIES
// ==========================================

window.downloadPayslipPDF = function() {
    const element = document.getElementById('payslip-paper-content');
    if(!element) return;
    const opt = {
      margin:       10,
      filename:     `Payslip_${currentUser.uid}_${Date.now()}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    showToast("Downloading PDF...");
    html2pdf().set(opt).from(element).save();
};

function viewPayslipPaper(data) {
    const modal = document.getElementById('payslip-preview-modal');
    const paper = document.getElementById('payslip-paper-content');
    const now = new Date(); const dateStr = now.toLocaleDateString('en-GB'); const timeStr = now.toLocaleTimeString('en-US'); const fullTimeStr = now.toLocaleString();
    let rowsHtml = ''; 
    let counter = 1;
    let finalNetPay = parseInt(data.netPay); 

    if(data.earnings && Array.isArray(data.earnings)) {
        data.earnings.forEach((item) => { 
            const val = parseFloat(item.amount);
            rowsHtml += `<tr><td style="text-align:center;">${counter++}</td><td>${item.desc}</td><td class="text-right">₹${val.toLocaleString('en-IN')}</td></tr>`; 
        }); 
    } else {
         rowsHtml += `<tr><td style="text-align:center;">${counter++}</td><td>Monthly Salary</td><td class="text-right">₹${finalNetPay.toLocaleString('en-IN')}</td></tr>`; 
    }

    if(data.deductions && Array.isArray(data.deductions)) {
        data.deductions.forEach((item) => {
            const val = parseFloat(item.amount);
            rowsHtml += `<tr><td style="text-align:center;">${counter++}</td><td>${item.desc}</td><td class="text-right text-red">- ₹${val.toLocaleString('en-IN')}</td></tr>`;
        });
    }
    
    paper.innerHTML = `
    <div class="prime-slip-container">
        <div class="prime-header-box"><div class="title-strip">PAYROLL SLIP</div><h1>ARYANTA</h1><p><strong>Email:</strong> ${currentUser.personal.email || 'aryanta@support.com'} &nbsp;|&nbsp; <strong>Phone:</strong> 8603467878</p><p>Habibpur, Bhagalpur, Bihar - 813113</p></div>
        <div class="prime-info-grid"><div class="info-col"><p><strong>Employee Name:</strong> ${data.name}</p><p><strong>Employee ID:</strong> ${data.uid}</p><p><strong>Father's Name:</strong> ${currentUser.personal.father || 'N/A'}</p><p><strong>Bank A/C:</strong> ${data.acc || 'N/A'}</p><p><strong>Phone:</strong> ${currentUser.personal.phone}</p><p><strong>Email:</strong> ${currentUser.personal.email}</p></div><div class="info-col text-right"><p><strong>Slip Number:</strong> ${data.slipId}</p><p><strong>Date:</strong> ${dateStr}</p><p><strong>Printed Time:</strong> ${timeStr}</p><p><strong>Payroll Period:</strong> ${data.salaryMonth || 'Current Month'}</p></div></div>
        <table class="prime-table"><thead><tr><th width="10%">Sr.No</th><th width="60%">Description</th><th width="30%" class="text-right">Amount</th></tr></thead><tbody>${rowsHtml}<tr><td style="height:20px;"></td><td></td><td></td></tr><tr class="total-row"><td colspan="2" class="text-right"><strong>TOTAL EARNINGS</strong></td><td class="text-right"><strong>₹${finalNetPay.toLocaleString('en-IN')}</strong></td></tr></tbody></table>
        <div class="prime-footer">
            <div class="amount-words"><span>Total in Words:</span><br><strong>Rupees ${finalNetPay.toLocaleString('en-IN')} Only</strong></div>
            <div class="signature-section">
                <div class="sig-block"><div class="sig-line">Md. Asad Salam</div><span>Co-Founder</span></div>
                <div class="company-logo">
                    <span style="display:block; font-size:10px; font-weight:bold; margin-top:5px;">ARYANTA</span>
                </div>
            </div>
        </div>
        <div class="print-timestamp">Printed on: ${fullTimeStr}</div>
    </div>`;
    modal.classList.remove('hidden');
}

window.printPayslip = () => { document.body.classList.add('print-mode-slip'); window.print(); setTimeout(() => { document.body.classList.remove('print-mode-slip'); }, 500); };

window.toggleSidebar = () => { document.querySelector('.sidebar').classList.toggle('active'); document.querySelector('.mobile-nav-overlay').classList.toggle('active'); };
window.switchTab = (tabId, btn) => {
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-'+tabId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    if (tabId === 'attendance') { renderCustomPickerBtn(); loadAttendance(); }
    if (tabId === 'payments') { const now = new Date(); const monthStr = now.toISOString().slice(0, 7); loadSalaryExpectation(monthStr); }
    if (tabId === 'incharge') { window.loadInchargePanel(); }
    
    if(window.innerWidth <= 768) { document.querySelector('.sidebar').classList.remove('active'); document.querySelector('.mobile-nav-overlay').classList.remove('active'); }
};

window.logout = (reason) => {
    if(currentUser && currentUser.databaseKey) { 
        fetch(`${API_URL}/api/update-activity`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ dbKey: currentUser.databaseKey, activityData: {state: 'Offline'} })
        });
    }
    localStorage.removeItem("aryanta_user"); 
    sessionStorage.clear();
    clearInterval(refreshInterval); 
    currentUser = null; 
    if(reason) alert(reason); 
    location.reload();
};

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text || "N/A"; }
function toggleLoader(show) { document.getElementById('loader').classList.toggle('hidden', !show); if(show) document.getElementById('section-credentials').classList.add('hidden'); }
function showToast(m, t='success') { const box = document.getElementById('toast-box'); const d = document.createElement('div'); d.className = `toast ${t}`; d.innerText = m; box.appendChild(d); setTimeout(() => d.remove(), 3000); }

// Login Timer
function startResendTimer() { const btn = document.getElementById('btn-resend'); const txt = document.getElementById('timer-text'); btn.disabled = true; let t = 30; clearInterval(resendTimer); resendTimer = setInterval(() => { txt.innerText = `(${t}s)`; t--; if(t < 0) { clearInterval(resendTimer); btn.disabled = false; txt.innerText = ""; } }, 1000); }

function resendOTP() { if(currentUser) { toggleLoader(true); sendOTP(currentUser); } }
window.viewFullImage = () => { document.getElementById('fs-img').src = document.getElementById('p-img').src; document.getElementById('fs-viewer').classList.remove('hidden'); };
window.openUpdateModal = () => document.getElementById('modal-update').classList.remove('hidden');
window.closeUpdateModal = () => document.getElementById('modal-update').classList.add('hidden');

window.changePassword = () => {
   showToast("Password change must be done by Admin.", "warning");
};

function initCustomPicker() {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const grid = document.getElementById('picker-months');
    grid.innerHTML = months.map((m, i) => `<button class="month-btn" onclick="selectPickerMonth(${i+1})">${m}</button>`).join('');
    renderCustomPickerBtn();
}
window.toggleDatePicker = () => { document.getElementById('att-custom-picker').classList.toggle('hidden'); };
window.changePickerYear = (delta) => { currentPickerYear += delta; renderCustomPickerBtn(); };
window.selectPickerMonth = (m) => { currentPickerMonth = m; renderCustomPickerBtn(); document.getElementById('att-custom-picker').classList.add('hidden'); loadAttendance(); };
function renderCustomPickerBtn() {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    document.getElementById('picker-year').innerText = currentPickerYear;
    document.getElementById('att-display-date').innerText = `${months[currentPickerMonth-1]} ${currentPickerYear}`;
    document.querySelectorAll('.month-btn').forEach((btn, idx) => { if(idx + 1 === currentPickerMonth) btn.classList.add('active'); else btn.classList.remove('active'); });
}
