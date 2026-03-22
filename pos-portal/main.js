document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Animated Lines (SVG)
    const svg = document.getElementById('animated-lines-svg');
    const lineCount = 8;
    
    for (let i = 0; i < lineCount; i++) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startX = Math.random() * window.innerWidth;
        const startY = -100;
        const endY = window.innerHeight + 100;
        
        // Create curved paths
        const d = `M${startX},${startY} Q${startX + (Math.random() - 0.5) * 400},${window.innerHeight/2} ${startX + (Math.random() - 0.5) * 200},${endY}`;
        
        path.setAttribute('d', d);
        path.setAttribute('class', 'line-curved');
        path.style.animationDelay = `${Math.random() * 5}s`;
        path.style.animationDuration = `${10 + Math.random() * 10}s`;
        
        svg.appendChild(path);
    }

    // 2. Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // 3. Reveal on Scroll
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .download-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease-out';
        observer.observe(card);
    });

    // 4. Header Background Change on Scroll
    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (window.scrollY > 50) {
            header.style.background = 'rgba(10, 10, 35, 0.95)';
            header.style.padding = '1rem 10%';
        } else {
            header.style.background = 'rgba(10, 10, 35, 0.8)';
            header.style.padding = '1.5rem 10%';
        }
    });

    // 5. Update image path (assuming we copy it later)
    const heroImg = document.getElementById('hero-mockup-img');
    heroImg.src = './assets/mec_pos_hero_mockup.png';
});
