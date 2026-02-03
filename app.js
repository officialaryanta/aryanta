// 🔐 Restore login session
const savedUser = localStorage.getItem("aryanta_user");
if (savedUser) {
    window.currentUser = JSON.parse(savedUser);
}

// ==========================================
// SESSION CONFIGURATION
// ==========================================
const AUTO_LOGOUT_TIME = 30 * 60 * 1000; // 30 minutes
let logoutTimer;

function startAutoLogoutTimer() {
    clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => {
        alert("Session expired. Please login again.");
        logout();
    }, AUTO_LOGOUT_TIME);
}

// ⚠️ IMPORTANT: Ensure this matches your Cloudflare Worker URL exactly
const API_URL = "https://rough-field-c679.official-aryanta.workers.dev";

// --- EMAILJS CREDENTIALS ---
// Used for OTP emails and notifications
emailjs.init("VKtRMaLwTDl-sNoU1");

// --- GLOBAL STATE ---
let currentUser = window.currentUser || null;
let resendTimer = null;
let updateResendTimer = null; 
let currentPickerYear = new Date().getFullYear();
let currentPickerMonth = new Date().getMonth() + 1;
let isEmailVerified = true; 
let updateEmailOTP = null;
let actionOTP = null; 
let pendingUpdateData = null; 
let refreshInterval = null; 
let pendingNewPassword = null; // Stores password during OTP verification

// --- RECOVERY STATE ---
let recoveryUser = null;
let recoveryOTP = null;

// ==========================================
// INITIALIZATION & AUTO-LOGIN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. INPUT ENFORCEMENT (Allow only numbers for Phone/Aadhaar)
    document.querySelectorAll('.input-numeric').forEach(inp => {
        inp.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
    });

    // 2. INPUT ENFORCEMENT (Uppercase for IFSC)
    document.querySelectorAll('.input-uppercase').forEach(inp => {
        inp.addEventListener('input', function() {
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
    });

    // 3. CHECK LOCAL STORAGE: If user data exists, skip login screen
    const savedData = localStorage.getItem("aryanta_user");
    
    if(savedData) {
        try {
            // Load local data immediately
            currentUser = JSON.parse(savedData);
            
            // Go straight to dashboard (Don't ask to login)
            if(currentUser && currentUser.uid) {
                // Console log removed for privacy
                
                // Hide Login View Immediately
                document.getElementById('view-login').classList.add('hidden');
                
                // Show Dashboard immediately
                loadDashboard();

                // Start Auto-Logout Timer
                startAutoLogoutTimer();
                
                // Verify session in background & Update Tracking (Silent Security Check)
                verifySession(currentUser.uid); 
            } else {
                throw new Error("Invalid stored data");
            }
        } catch(e) { 
            // console.error("Auth Error", e); // Kept minimal
            logout(false); 
        }
    } else {
        // 4. NO DATA: Show Login Screen normally
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('section-credentials').classList.remove('hidden');
    }
    
    // Listeners
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
// SECURITY HELPERS
// ==========================================
async function generateSecureHash(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

function toggleLoader(show) {
    const loader = document.getElementById('loader');
    const credSection = document.getElementById('section-credentials');
    
    if(show) {
        loader.classList.remove('hidden');
        credSection.classList.add('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

async function verifySession(uid, waitPromise) {
    try {
        const response = await fetch(`${API_URL}/api/get-user?uid=${uid}`);
        const data = await response.json();

        if(waitPromise) await waitPromise;

        if (!data || !data.user) return logout("Account not found or Session Expired.");
        const emp = data.user;
        
        if (emp.status !== 'Active') return logout("Your profile is inactive. Contact Admin.");
        
        currentUser = emp;
        currentUser.databaseKey = data.key || "unknown_key";
        
        localStorage.setItem("aryanta_user", JSON.stringify(currentUser));
        updateUserActivity(emp.uid, currentUser.databaseKey);
        toggleLoader(false);

    } catch(e) { 
        // console.error(e);
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

    } catch (err) { 
        // Tracking error ignored silently
    }
}

async function handleLogin(e) {
    if(e) e.preventDefault();
    
    // 1. Capture Input
    let inputIdentifier = document.getElementById('in-uid').value.trim();
    const pass = document.getElementById('in-pass').value.trim();
    
    if(!inputIdentifier || !pass) { 
        showToast("Enter ID/Email/Phone and Password", "danger"); 
        return; 
    }
    
    toggleLoader(true);
    
    try {
        let finalUid = inputIdentifier;

        // Resolve Email/Phone to UID logic
        if (inputIdentifier.includes('@') || /^\d{10,}$/.test(inputIdentifier)) {
            try {
                // Try to resolve UID using the get-user smart search endpoint
                const searchRes = await fetch(`${API_URL}/api/get-user?uid=${inputIdentifier}`);
                const searchData = await searchRes.json();
                
                if (searchData && searchData.user && searchData.user.uid) {
                    finalUid = searchData.user.uid;
                }
            } catch(err) {
                // Silent catch
            }
        }

        // 2. Send Login Request
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: finalUid, pass: pass })
        });
        
        const result = await response.json();
        
        // 3. Handle Errors
        if(!response.ok) {
            toggleLoader(false); 
            document.getElementById('section-credentials').classList.remove('hidden');
            
            if(response.status === 401 || response.status === 404 || result.error) {
                showToast("Wrong Password or ID. Please check.", "danger");
                document.getElementById('in-pass').value = ""; 
            } else {
                showToast(result.error || "Login Failed", "danger");
            }
            return;
        }

        // 4. Success - But Check Activity/Behavior
        const emp = result.user;
        const key = result.key;

        if(emp.status !== 'Active') { 
            toggleLoader(false); 
            document.getElementById('section-credentials').classList.remove('hidden');
            alert("Your profile is inactive. Contact Admin."); 
            return; 
        }

        currentUser = emp;
        currentUser.databaseKey = key;
        
        // --- SUSPICIOUS ACTIVITY & NETWORK CHECK ---
        
        // Check 1: Is this a "Known Device"?
        const trustedDeviceKey = `aryanta_trusted_${emp.uid}`;
        const isKnownDevice = localStorage.getItem(trustedDeviceKey) === "true";

        // Check 2: Low Network / Changed Network (Simulated via Network API)
        let isLowNetwork = false;
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            // If effectiveType is 2g or slow-2g or saveData is on, treat as low network/suspicious
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' || connection.effectiveType === '3g' || connection.saveData) {
                isLowNetwork = true;
            }
        }

        // Decision Logic:
        // If it's a known device AND network is good -> Login Directly
        // If it's a NEW device OR Low Network -> Send OTP
        
        if (isKnownDevice && !isLowNetwork) {
            // Normal Behavior: Skip OTP
            finalizeLogin(emp);
        } else {
            // Suspicious Behavior or New Device: Send OTP
            let msg = "New Device Detected.";
            if(isLowNetwork) msg = "Network instability detected. Verifying...";
            showToast(msg, "warning");
            sendOTP(emp);
        }

    } catch (error) {
        toggleLoader(false);
        document.getElementById('section-credentials').classList.remove('hidden');
        console.error("Login Error: Connection failed"); // Generic error
        showToast("Connection Error. Check Internet.", "danger");
    }
}

async function sendOTP(emp) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const secureHash = await generateSecureHash(otp);
    sessionStorage.setItem("auth_token_hash", secureHash);
    sessionStorage.removeItem("login_otp");
    
    const messageBody = `Security Alert: Suspicious login attempt or New Device.\n\nYour One-Time Password (OTP) is: ${otp}\n\nThis code is valid for verification purposes only.`;

    emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
        to_email: emp.personal.email, 
        name: emp.personal.name,     
        message: messageBody         
    }).then(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('section-credentials').classList.add('hidden');
        document.getElementById('section-otp').classList.remove('hidden');
        
        const email = emp.personal.email || "";
        const parts = email.split("@");
        let masked = email;
        if(parts.length === 2 && parts[0].length > 2) masked = parts[0].substring(0, 2) + "****@" + parts[1];
        
        document.getElementById('disp-email').innerText = masked;
        startResendTimer();
        document.getElementById('in-otp').value = "";
        showToast("OTP sent to email 📧");
    }).catch(err => { 
        toggleLoader(false); 
        document.getElementById('section-credentials').classList.remove('hidden');
        console.error("OTP Error: Email service failed"); // Generic error
        showToast("Failed to send email. Check Console.", "danger"); 
    });
}

window.checkAutoOtp = function(input) {
    if(input.value.length === 6) {
        handleOTPVerify();
    }
};

async function handleOTPVerify(e) {
    if(e) e.preventDefault();
    const userOTP = document.getElementById("in-otp").value.toString();
    
    const inputHash = await generateSecureHash(userOTP);
    const storedHash = sessionStorage.getItem("auth_token_hash");
    
    if (inputHash === storedHash) {
        // Mark device as trusted after successful OTP
        localStorage.setItem(`aryanta_trusted_${currentUser.uid}`, "true");
        finalizeLogin(currentUser);
    } else { 
        if(userOTP.length === 6) showToast("Incorrect OTP", "danger"); 
    }
}

// Helper to finalize login (called by direct login or after OTP)
function finalizeLogin(user) {
    toggleLoader(true);
    document.getElementById('section-otp').classList.add('hidden');
    document.getElementById('section-credentials').classList.add('hidden');
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('loader-text').innerText = "Accessing Dashboard...";

    // Set session data
    localStorage.setItem("aryanta_login", "true");
    localStorage.setItem("aryanta_user", JSON.stringify(user));
    startAutoLogoutTimer();

    setTimeout(() => {
        showToast("Access Granted 🔓");
        sessionStorage.removeItem("auth_token_hash");
        if(user && user.databaseKey) { 
            updateUserActivity(user.uid, user.databaseKey); 
        }
        toggleLoader(false);
        checkRoleAndRedirect(); 
    }, 1000); 
}

// ==========================================
// FORGOT PASSWORD / RECOVERY LOGIC (UPDATED)
// ==========================================

window.showForgotPass = () => { 
    document.getElementById('section-credentials').classList.add('hidden'); 
    document.getElementById('section-forgot').classList.remove('hidden');
    
    // Reset views to Step 1
    document.getElementById('forgot-step-verify').classList.remove('hidden');
    document.getElementById('forgot-step-otp').classList.add('hidden');
    document.getElementById('forgot-step-reset').classList.add('hidden');
    document.getElementById('forgot-step-manual').classList.add('hidden');
    
    // Clear forms
    document.getElementById('form-forgot-verify').reset();
    document.getElementById('rec-otp-input').value = "";
    document.getElementById('rec-new-pass').value = "";
    document.getElementById('rec-conf-pass').value = "";

    // Reset recovery state
    recoveryUser = null;
    recoveryOTP = null;
};

window.hideForgotPass = () => { 
    document.getElementById('section-forgot').classList.add('hidden'); 
    document.getElementById('section-credentials').classList.remove('hidden'); 
};

// STEP 1: VERIFY IDENTITY (CLEAN - NO PII LOGS)
window.verifyRecoveryDetails = async () => {
    const contact = document.getElementById('rec-contact').value.trim();
    const aadhaar = document.getElementById('rec-aadhaar').value.trim();

    // STRICT AADHAAR CHECK
    if(!/^\d{12}$/.test(aadhaar)) {
        showToast("Aadhaar must be exactly 12 digits", "danger");
        return;
    }
    if(!contact) {
        showToast("Enter registered Email or Phone", "danger");
        return;
    }

    toggleLoader(true);
    document.getElementById('section-forgot').classList.add('hidden'); 

    try {
        // Fetch User Data
        const response = await fetch(`${API_URL}/api/get-user?uid=${contact}`);
        const data = await response.json();

        // REMOVED DEBUG LOGS HERE TO HIDE IDENTITY

        if (data && data.user) {
            const user = data.user;
            // Trim values to avoid invisible space issues
            const storedAadhaar = user.security ? String(user.security.aadhaar).trim() : "";
            const storedPhone = user.personal ? String(user.personal.phone).trim() : "";
            const storedEmail = user.personal ? String(user.personal.email).trim() : "";
            const storedUid = String(user.uid).trim();

            // Validate Aadhaar AND (Phone OR Email OR UID)
            const isMatch = (storedAadhaar === aadhaar) && 
                            (storedPhone === contact || storedEmail === contact || storedUid === contact);

            if (isMatch) {
                // MATCH FOUND!
                recoveryUser = user;
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                recoveryOTP = otp;

                const msg = `Use this code to reset your password: ${otp}\n\nIf you didn't request this, ignore this email.`;

                await emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
                    to_email: user.personal.email, 
                    name: user.personal.name,     
                    message: msg         
                });

                toggleLoader(false);
                showToast("Verification Code sent to Email! 📧");
                
                document.getElementById('section-forgot').classList.remove('hidden');
                document.getElementById('forgot-step-verify').classList.add('hidden');
                document.getElementById('forgot-step-otp').classList.remove('hidden');
                return;
            } else {
                // console.warn("Match Failed."); // Kept generic
            }
        } else {
            // console.warn("User not found via API.");
        }

        // No Match Found
        throw new Error("No matching user found");

    } catch(e) { 
        console.error("Recovery Failed: Invalid Details"); // Only generic error log
        toggleLoader(false);
        
        // Restore Recovery Screen & Show Manual Options
        document.getElementById('section-forgot').classList.remove('hidden'); 
        showToast("Details not found. Please try manual request.", "warning");
        
        document.getElementById('forgot-step-verify').classList.add('hidden');
        document.getElementById('forgot-step-manual').classList.remove('hidden');
    }
};

// STEP 2: VERIFY OTP
window.verifyRecoveryOTP = () => {
    const inputOtp = document.getElementById('rec-otp-input').value.trim();
    
    if (inputOtp === recoveryOTP) {
        showToast("Code Verified ✅");
        
        // SWITCH TO STEP 3
        document.getElementById('forgot-step-otp').classList.add('hidden');
        document.getElementById('forgot-step-reset').classList.remove('hidden');
        
        // Populate User Info (Read-Only)
        document.getElementById('rec-disp-name').innerText = recoveryUser.personal.name;
        document.getElementById('rec-disp-uid').innerText = "UID: " + recoveryUser.uid;
    } else {
        showToast("Incorrect Code", "danger");
    }
};

// STEP 3: SUBMIT NEW PASSWORD
window.submitNewPassword = async () => {
    const newPass = document.getElementById('rec-new-pass').value.trim();
    const confPass = document.getElementById('rec-conf-pass').value.trim();

    if (newPass.length < 6) {
        showToast("Password must be at least 6 characters", "warning");
        return;
    }
    if (newPass !== confPass) {
        showToast("Passwords do not match", "danger");
        return;
    }

    const btn = document.getElementById('btn-reset-final');
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
    btn.disabled = true;

    try {
        // CALL API TO UPDATE PASSWORD
        const updateResponse = await fetch(`${API_URL}/api/update-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                uid: recoveryUser.uid, 
                newPass: newPass 
            })
        });

        const resData = await updateResponse.json();

        if (resData.success) {
            // Send Confirmation Email
            const msg = `Security Alert: Your password was successfully changed just now.\n\nIf this wasn't you, contact admin immediately.`;
            await emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
                to_email: recoveryUser.personal.email, 
                name: recoveryUser.personal.name,     
                message: msg         
            });

            showToast("Password Changed Successfully! ✅");
            
            setTimeout(() => {
                hideForgotPass(); // Go back to login
                btn.innerHTML = oldText;
                btn.disabled = false;
            }, 2000);
        } else {
            throw new Error(resData.error || "Update failed");
        }

    } catch (e) {
        console.error("Update Error: Failed to save"); // Generic error
        showToast("Error updating password. Try again later.", "danger");
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

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
                localStorage.setItem("aryanta_user", JSON.stringify(data.user));

                updateUI(currentUser);
            }
        });

    loadNotifications();
    loadMyPayslips(); 
    loadAttendance();
    loadMyDailyAttendance();
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
    // FIX: Set Full Name Display
    setText('p-fullname', p.name);
    
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

    document.getElementById('up-phone').value = p.phone || ""; 
    document.getElementById('up-email').value = p.email || "";
    document.getElementById('up-bank').value = b.bank || "";
    document.getElementById('up-branch').value = b.branch || "";
    document.getElementById('up-ifsc').value = b.ifsc || "";
    document.getElementById('up-acc').value = b.acc || "";
}

// ==========================================
// DATA MODULES
// ==========================================

function loadNotifications() {
    const chatBox = document.getElementById('chat-box');
    
    fetch(`${API_URL}/api/get-messages?uid=${currentUser.uid}`)
        .then(r => r.json())
        .then(data => {
            if(!data || Object.keys(data).length === 0) {
                 chatBox.innerHTML = `<div class="msg-bubble msg-received"><p><b>System:</b> No new notices.</p></div>`;
                 return;
            }
            chatBox.innerHTML = "";
            const validMsgs = [];
            
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

// ==========================================
// INCHARGE PANEL (AMAZON STYLE)
// ==========================================
window.loadInchargePanel = function() {
    const container = document.getElementById('incharge-list-container');
    if (!container) return;
    container.innerHTML = `<p style="text-align: center; color: #94a3b8; margin-top:20px;">Loading Incharges...</p>`;

    // Hardcoded profiles for A, B, C, D
    const mockIncharges = [
        { 
            name: "MD.Asad salam", 
            post: "CO-Founder", 
            phone: "918603467878", 
            email: "coaryanta@gmail.com", 
            desc: "Responsible for overall company operations and strategy.",
            photo: "https://raw.githubusercontent.com/officialaryanta/aryanta/refs/heads/main/founder.png" 
        },
        { 
            name: "Mr. B Name", 
            post: "HR Manager", 
            phone: "910000000002", 
            email: "b@aryanta.com", 
            desc: "Handles employee relations, payroll, and recruitment.",
            photo: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" 
        },
        { 
            name: "Mr. C Name", 
            post: "Operations Head", 
            phone: "910000000003", 
            email: "c@aryanta.com", 
            desc: "Oversees daily business activities and logistics.",
            photo: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" 
        },
        { 
            name: "Mr. D Name", 
            post: "Supervisor", 
            phone: "910000000004", 
            email: "d@aryanta.com", 
            desc: "Manages team schedules and on-ground tasks.",
            photo: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" 
        }
    ];

    container.innerHTML = ""; 
    
    mockIncharges.forEach(inc => {
        const img = inc.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
        const card = document.createElement('div');
        card.className = "incharge-card"; 
        
        // Added onclick to img and style cursor pointer
        card.innerHTML = `
            <img src="${img}" class="incharge-img" onclick="viewFullImage(this.src)">
            <div class="incharge-info">
                <div>
                    <h3 class="incharge-name">${inc.name}</h3>
                    <p class="incharge-role">${inc.post}</p>
                    <p class="incharge-desc">${inc.desc}</p>
                </div>
            </div>
            <div class="incharge-actions">
                <a href="tel:${inc.phone}" class="action-btn btn-call"><i class="fa-solid fa-phone"></i> Call Now</a>
                <a href="mailto:${inc.email}" class="action-btn btn-mail"><i class="fa-solid fa-envelope"></i> Email</a>
                <a href="https://wa.me/${inc.phone}" target="_blank" class="action-btn btn-wa"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
            </div>
        `;
        container.appendChild(card);
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
    if (!currentUser) return;
    if (!isEmailVerified) return showToast("Please verify new email first", "danger");

    // OLD DATA
    const p = currentUser.personal || {};
    const b = currentUser.bank || {};

    // INPUT VALUES
    const phoneIn  = document.getElementById('up-phone').value.trim();
    const emailIn  = document.getElementById('up-email').value.trim();
    const bankIn   = document.getElementById('up-bank').value.trim();
    const branchIn = document.getElementById('up-branch').value.trim();
    const ifscIn   = document.getElementById('up-ifsc').value.trim();
    const accIn    = document.getElementById('up-acc').value.trim();

    // STRICT VALIDATIONS BEFORE SUBMITTING
    if(phoneIn && phoneIn.length !== 10) return showToast("Phone must be 10 digits", "danger");
    if(accIn && accIn.length > 16) return showToast("Account No max 16 digits", "danger");

    // FINAL VALUES (fallback to old if empty)
    const newPhone  = phoneIn  || p.phone;
    const newEmail  = emailIn  || p.email;
    const newBank   = bankIn   || b.bank;
    const newBranch = branchIn || b.branch;
    const newIfsc   = ifscIn   || b.ifsc;
    const newAcc    = accIn    || b.acc;

    // CHECK IF ANYTHING CHANGED
    if (
        newPhone  === p.phone &&
        newEmail  === p.email &&
        newBank   === b.bank &&
        newBranch === b.branch &&
        newIfsc   === b.ifsc &&
        newAcc    === b.acc
    ) {
        return showToast("No changes detected.", "warning");
    }

    // 🔥 SEND ONLY CHANGED DATA
    pendingUpdateData = {
        personal: {
            phone: newPhone !== p.phone ? newPhone : null,
            email: newEmail !== p.email ? newEmail : null
        },
        bank: {
            bank:   newBank   !== b.bank   ? newBank   : null,
            branch: newBranch !== b.branch ? newBranch : null,
            ifsc:   newIfsc   !== b.ifsc   ? newIfsc   : null,
            acc:    newAcc    !== b.acc    ? newAcc    : null
        }
    };

    // SEND OTP FOR CONFIRMATION
    initiateActionOTP(newEmail);
};


window.initiateActionOTP = (targetEmail) => {
    actionOTP = Math.floor(100000 + Math.random() * 900000);
    const messageBody = `Confirm your request with OTP: ${actionOTP}`;
    
    toggleLoader(true);
    emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
        to_email: targetEmail, 
        name: currentUser.personal.name, 
        message: messageBody 
    }).then(() => {
        toggleLoader(false); 
        showToast("Confirmation OTP Sent 📧"); 
        
        // If we have pending password change, show password modal, else profile update modal
        if (pendingNewPassword) {
            document.getElementById('modal-verify-pass-change').classList.remove('hidden');
        } else {
            document.getElementById('modal-verify-action').classList.remove('hidden');
        }
        
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
        emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
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
// UTILITIES (UPDATED: PRINT & INCHARGE)
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
    
    // FIX: USE GENERATION TIME, NOT CURRENT TIME
    // Prefer data.timestamp (number), fallback to data.date (string), finally current date
    let genDate = new Date();
    if (data.timestamp) {
        genDate = new Date(data.timestamp);
    } else if (data.date) {
        // If data.date is just YYYY-MM-DD, this will be midnight. Good enough if no timestamp.
        genDate = new Date(data.date);
    }

    const dateStr = genDate.toLocaleDateString('en-GB');
    const timeStr = genDate.toLocaleTimeString('en-US');
    const fullTimeStr = genDate.toLocaleString();

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
    
    // FIX: Payroll Period Logic - Avoid "Current Month"
    let payrollPeriod = data.salaryMonth;
    if (!payrollPeriod && data.date) {
        // Derive purely from date if salaryMonth string missing
        const d = new Date(data.date);
        payrollPeriod = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    if (!payrollPeriod) payrollPeriod = "N/A"; // Fallback only if absolutely no data

    // UPDATED: EMAIL & PHONE NUMBER & FIXED TIME
    paper.innerHTML = `
    <div class="prime-slip-container">
        <div class="prime-header-box"><div class="title-strip">PAYROLL SLIP</div><h1>ARYANTA</h1><p><strong>Email:</strong> official.aryanta@gmail.com &nbsp;|&nbsp; <strong>Phone:</strong> +91 8603467878</p><p>Habibpur, Bhagalpur, Bihar - 813113</p></div>
        <div class="prime-info-grid"><div class="info-col"><p><strong>Employee Name:</strong> ${data.name}</p><p><strong>Employee ID:</strong> ${data.uid}</p><p><strong>Father's Name:</strong> ${currentUser.personal.father || 'N/A'}</p><p><strong>Bank A/C:</strong> ${data.acc || 'N/A'}</p><p><strong>Phone:</strong> ${currentUser.personal.phone}</p><p><strong>Email:</strong> ${currentUser.personal.email}</p></div><div class="info-col text-right"><p><strong>Slip Number:</strong> ${data.slipId}</p><p><strong>Date:</strong> ${dateStr}</p><p><strong>Generated Time:</strong> ${timeStr}</p><p><strong>Payroll Period:</strong> ${payrollPeriod}</p></div></div>
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
        <div class="print-timestamp">Generated on: ${fullTimeStr}</div>
    </div>`;
    modal.classList.remove('hidden');
}

// CHANGED: Use window.print() triggered by class
window.printPayslip = () => { 
    document.body.classList.add('print-mode-slip'); 
    window.print(); 
    // Remove class after print dialog closes (delay ensures dialog is open)
    setTimeout(() => { document.body.classList.remove('print-mode-slip'); }, 1000); 
};

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

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text || "N/A"; }
function showToast(m, t='success') { const box = document.getElementById('toast-box'); const d = document.createElement('div'); d.className = `toast ${t}`; d.innerText = m; box.appendChild(d); setTimeout(() => d.remove(), 3000); }

// Login Timer
function startResendTimer() { const btn = document.getElementById('btn-resend'); const txt = document.getElementById('timer-text'); btn.disabled = true; let t = 30; clearInterval(resendTimer); resendTimer = setInterval(() => { txt.innerText = `(${t}s)`; t--; if(t < 0) { clearInterval(resendTimer); btn.disabled = false; txt.innerText = ""; } }, 1000); }

function resendOTP() { if(currentUser) { toggleLoader(true); sendOTP(currentUser); } }

// UPDATED: View Full Image accepts source
window.viewFullImage = (src) => { 
    const finalSrc = src || document.getElementById('p-img').src;
    document.getElementById('fs-img').src = finalSrc; 
    document.getElementById('fs-viewer').classList.remove('hidden'); 
};

window.openUpdateModal = () => document.getElementById('modal-update').classList.remove('hidden');
window.closeUpdateModal = () => document.getElementById('modal-update').classList.add('hidden');

// ==========================================
// PASSWORD CHANGE (SETTINGS) - REWRITTEN
// ==========================================

window.changePassword = () => {
    const newPass = document.getElementById('set-new-pass').value.trim();
    const confPass = document.getElementById('set-conf-pass').value.trim();

    if(!newPass || !confPass) return showToast("Please fill all password fields", "warning");
    if(newPass.length < 6) return showToast("Password must be at least 6 characters", "warning");
    if(newPass !== confPass) return showToast("Passwords do not match", "danger");

    pendingNewPassword = newPass;
    
    // Trigger OTP Flow
    initiateActionOTP(currentUser.personal.email);
};

window.verifyPasswordChangeOTP = () => {
    const entered = document.getElementById('pass-change-otp').value.trim();
    if(entered == actionOTP) {
        // OTP Correct, Proceed to update
        submitPasswordChange();
    } else {
        showToast("Incorrect OTP", "danger");
    }
};

window.submitPasswordChange = async () => {
    if(!pendingNewPassword || !currentUser) return;
    
    const btn = document.querySelector('#modal-verify-pass-change .btn-prime');
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
    btn.disabled = true;

    try {
        const updateResponse = await fetch(`${API_URL}/api/update-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                uid: currentUser.uid, 
                newPass: pendingNewPassword 
            })
        });

        const resData = await updateResponse.json();

        if (resData.success) {
            showToast("Password Updated Successfully! ✅");
            document.getElementById('modal-verify-pass-change').classList.add('hidden');
            
            // Clear inputs
            document.getElementById('set-new-pass').value = "";
            document.getElementById('set-conf-pass').value = "";
            document.getElementById('pass-change-otp').value = "";
            pendingNewPassword = null;

            // Notify User
            const msg = `Security Alert: Your password was changed via Settings panel.\n\nIf this wasn't you, contact admin immediately.`;
            emailjs.send("service_k7rqgqq", "template_2ohbmld", { 
                to_email: currentUser.personal.email, 
                name: currentUser.personal.name,     
                message: msg         
            });
        } else {
            showToast(resData.error || "Update failed", "danger");
        }
    } catch (e) {
        showToast("Update Error. Check Internet.", "danger");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
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
function openManagerPopup(){
  document.getElementById("manager-modal").classList.remove("hidden");
}

function closeManagerPopup(){
  document.getElementById("manager-modal").classList.add("hidden");
}

// ==========================================
// MANUAL RECOVERY (CLOUD FALLBACK)
// ==========================================

window.submitRecoveryToFirebase = function() {
    const name = document.getElementById('req-name').value.trim();
    const email = document.getElementById('req-email').value.trim();
    const phone = document.getElementById('req-phone').value.trim();

    if(!name || !email || !phone) {
        showToast("Please fill all fields", "warning");
        return;
    }

    const btn = document.getElementById('btn-submit-rec');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
    btn.disabled = true;

    const requestData = {
        name: name,
        email: email,
        phone: phone,
        timestamp: new Date().toLocaleString(),
        status: "Pending",
        type: "Manual Recovery"
    };

    fetch(`${API_URL}/api/submit-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(res => res.json())
    .then(data => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        if (data.success) {
            document.getElementById('modal-rec-success').classList.remove('hidden');
        } else {
            console.error("API Error: Submission failed"); // Generic error
            showToast(data.error || "Submission failed.", "danger");
            advanceToStage2(); 
        }
    })
    .catch((error) => {
        console.error("Network Error: Failed to connect"); // Generic error
        btn.innerHTML = originalText;
        btn.disabled = false;
        showToast("Connection Error. Try links below.", "danger");
        advanceToStage2(); 
    });
};

window.advanceToStage2 = function() {
    document.getElementById('modal-rec-success').classList.add('hidden');
    document.getElementById('rec-stage-1').classList.add('hidden');
    document.getElementById('rec-stage-2').classList.remove('hidden');
    showToast("Check options below if urgent", "info");
};

window.showFinalNoWay = function() {
    document.getElementById('rec-stage-2').classList.add('hidden');
    document.getElementById('rec-stage-3').classList.remove('hidden');
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

// OPTION 1: Send via NATIVE EMAIL APP (mailto:)
window.sendManualRecoveryRequest = () => {
    const name = document.getElementById('req-name').value.trim();
    const phone = document.getElementById('req-phone').value.trim();

    if(!name || !phone) {
        showToast("Please fill in Name and Phone", "danger");
        return;
    }

    const msg = getRecoveryMessage(name, phone);
    const subject = `Account Recovery Request - ${name}`;
    const mailtoLink = `mailto:official.aryanta@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
    window.location.href = mailtoLink;
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
    const waUrl = `https://wa.me/918603467878?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
};

window.sendSmsRequest = function() {
    const name = document.getElementById('req-name').value;
    const msg = `Urgent: Password Recovery Request for ${name}. Please assist.`;
    window.location.href = `sms:8603467878?body=${encodeURIComponent(msg)}`;
};

window.loadMyDailyAttendance = function() {
  const box = document.getElementById("my-attendance-list");
  if (!box) return;

  const allAtt = JSON.parse(localStorage.getItem("aryanta_attendance") || "{}");
  const uid = currentUser.uid;

  box.innerHTML = "";

  Object.keys(allAtt).sort().reverse().forEach(date => {
    if (allAtt[date][uid]) {
      const div = document.createElement("div");
      div.style.padding = "8px";
      div.style.borderBottom = "1px solid #ccc";
      div.innerText = `${date} → ${allAtt[date][uid]}`;
      box.appendChild(div);
    }
  });

  if (!box.innerHTML) box.innerHTML = "No attendance yet";
};

if (window.currentUser) {
    refreshAllData();
}

// ==========================================
// SESSION MANAGEMENT & LOGOUT
// ==========================================

function logout(msg) {
    if (msg) alert(msg);
  
    localStorage.removeItem("aryanta_login");
    localStorage.removeItem("aryanta_user");
    sessionStorage.clear();
  
    if (typeof refreshInterval !== "undefined") {
      clearInterval(refreshInterval);
    }
  
    currentUser = null;
    location.reload();
}
  
// Reset the auto-logout timer on user interaction
["click","mousemove","keydown","scroll","touchstart"].forEach(event => {
    document.addEventListener(event, () => {
      if (localStorage.getItem("aryanta_login") === "true") {
        startAutoLogoutTimer();
      }
    });
});


