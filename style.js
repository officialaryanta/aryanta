/* =========================================
   ARYANTA: VISUAL ENGINE & LOGIC
   ========================================= */

// 1. MOBILE SIDEBAR LOGIC (With Auto-Hide QA Button)
function toggleSidebar() {
    const sidebar = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const qaBtn = document.getElementById('prime-qa'); // Get the QA button

    if (sidebar && backdrop) {
        sidebar.classList.toggle('active');
        backdrop.classList.toggle('active');
        
        // HIDE QUICK ACCESS BUTTON IMMEDIATELY IF SIDEBAR IS OPEN
        if(qaBtn) {
            if(sidebar.classList.contains('active')) {
                qaBtn.classList.add('hidden');
            } else {
                qaBtn.classList.remove('hidden');
            }
        }
    }
}

// 2. QUICK ACCESS BUTTON LOGIC
function toggleQA() {
    const qa = document.getElementById('prime-qa');
    if (qa) {
        qa.classList.toggle('active');
    }
}

// 3. CANVAS BACKGROUND ANIMATION
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

// 4. GSAP ANIMATIONS
document.addEventListener("DOMContentLoaded", (event) => {
    gsap.registerPlugin(ScrollTrigger);

    if(document.querySelector(".anim-hero")) {
        gsap.from(".anim-hero", { 
            duration: 1.5, y: 60, opacity: 0, stagger: 0.2, ease: "power3.out" 
        });
    }

    gsap.utils.toArray('.reveal').forEach(el => {
        gsap.fromTo(el, 
            { opacity: 0, y: 50 }, 
            { 
                opacity: 1, y: 0, duration: 0.8, ease: "power2.out", 
                scrollTrigger: { trigger: el, start: "top 85%" } 
            }
        );
    });
});