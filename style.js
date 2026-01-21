/* =========================================
   ARYANTA: VISUAL ENGINE & LOGIC
   ========================================= */

/* FRONTEND EMAILJS + FIREBASE BYPASS MODE */

/* =========================================
   UI LOGIC & ANIMATIONS
   ========================================= */

// MOBILE SIDEBAR
window.toggleSidebar = function() {
    const sidebar = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const qaBtn = document.getElementById('prime-qa');

    if (sidebar && backdrop) {
        sidebar.classList.toggle('active');
        backdrop.classList.toggle('active');
        if(qaBtn) {
            qaBtn.classList.toggle('hidden', sidebar.classList.contains('active'));
        }
    }
};

// QUICK ACCESS BUTTON
window.toggleQA = function() {
    const qa = document.getElementById('prime-qa');
    if (qa) qa.classList.toggle('active');
};

// BACKGROUND ANIMATION (CANVAS)
const canvas = document.getElementById('video-canvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 1;
            this.vy = (Math.random() - 0.5) * 1;
            this.size = Math.random() * 2 + 1;
            this.color = Math.random() > 0.5 ? 'rgba(59, 130, 246, ' : 'rgba(139, 92, 246, ';
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if(this.x < 0 || this.x > width) this.vx *= -1;
            if(this.y < 0 || this.y > height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color + '0.5)';
            ctx.fill();
        }
    }

    for(let i=0; i<60; i++) particles.push(new Particle());

    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach((p, i) => {
            p.update();
            p.draw();
            for(let j=i; j<particles.length; j++) {
                const dx = p.x - particles[j].x;
                const dy = p.y - particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if(dist < 150) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(100, 100, 255, ${1 - dist/150 * 0.8})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        });
        requestAnimationFrame(animate);
    }
    animate();
}

/* =========================================
   GSAP & FORM SUBMISSION
   ========================================= */

document.addEventListener("DOMContentLoaded", (event) => {
    
    // SAFE GSAP INIT
    if (typeof gsap !== 'undefined') {
        if (typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        } else {
            console.warn("ScrollTrigger not found. Animations disabled.");
        }

        if(document.getElementById("card")) {
            gsap.to("#card", { opacity: 1, y: 0, duration: 1, ease: "power3.out", delay: 0.2 });
        }

        if(document.querySelector(".anim-hero")) {
            gsap.from(".anim-hero", { 
                duration: 1.5, y: 60, opacity: 0, stagger: 0.2, ease: "power3.out" 
            });
        }

        if (typeof ScrollTrigger !== 'undefined') {
            gsap.utils.toArray('.reveal').forEach(el => {
                gsap.fromTo(el, 
                    { opacity: 0, y: 50 }, 
                    { 
                        opacity: 1, y: 0, duration: 0.8, ease: "power2.out", 
                        scrollTrigger: { trigger: el, start: "top 85%" } 
                    }
                );
            });
        }
    }

    // FORM HANDLING LOGIC
    const form = document.getElementById('contactForm');
    if (form) {
        const submitBtn = document.getElementById('submitBtn');
        const popup = document.getElementById('successPopup');
        const timerElement = document.getElementById('timer');

        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;

            // Get Input Values
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;

            const formData = {
                name: name,
                email: email,
                phone: document.getElementById('phone').value || "Not Provided", 
                subject: document.getElementById('subject').value,
                message: message,
                date: new Date().toLocaleString()
            };

            // 1. EMAILJS SEND (Auto-reply TO User)
            const emailPromise = emailjs.send(
                "service_wnqvm4n",
                "template_5by2ldn",
                {
                    to_name: name,    // Maps to {{to_name}} in email
                    to_email: email,  // Tells EmailJS who to send this email to
                    message: message  // Optional, if you want it in the email
                }
            );

            // 2. FIREBASE SAVE (Direct Database)
            const firebasePromise = fetch(
                "https://aryanta-default-rtdb.asia-southeast1.firebasedatabase.app/contacts.json",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData)
                }
            );

            // Wait for BOTH to finish
            Promise.all([emailPromise, firebasePromise])
            .then(([emailRes, firebaseRes]) => {
                // Check if Firebase was successful
                if (firebaseRes.ok) {
                    console.log("Email Sent & Data Saved!");
                    
                    // Show Success Popup
                    if(popup) {
                        popup.classList.add('active');
                        let timeLeft = 3;
                        const downloadTimer = setInterval(function(){
                            timeLeft--;
                            if(timerElement) timerElement.textContent = timeLeft;
                            
                            if(timeLeft <= 0){
                                clearInterval(downloadTimer);
                                window.location.href = "index.html";
                            }
                        }, 1000);
                    }
                } else {
                    throw new Error("Database save failed.");
                }
            })
            .catch(function(error) {
                console.error('FAILED...', error);
                alert("Error sending message. Please try again later.");
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            });
        });
    }
});
