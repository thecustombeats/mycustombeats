  // ===== NAVIGATION DOTS =====
        const sections = document.querySelectorAll('.section');
        const navDotsContainer = document.getElementById('navDots');

        sections.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'nav-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', () => {
                sections[i].scrollIntoView({ behavior: 'smooth' });
            });
            navDotsContainer.appendChild(dot);
        });

        const dots = document.querySelectorAll('.nav-dot');

        // ===== PROGRESS BAR & ACTIVE SECTION =====
        const progressBar = document.getElementById('progressBar');
        const headerLogo = document.querySelector('.header-logo');

        function updateActiveSection() {
            const scrollY = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = (scrollY / docHeight) * 100;
            progressBar.style.width = progress + '%';

            sections.forEach((section, i) => {
                const rect = section.getBoundingClientRect();
                if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                    dots.forEach(d => d.classList.remove('active'));
                    dots[i].classList.add('active');
                    
                    // Check if it's the last section
                    if (i === sections.length - 1) {
                        headerLogo.classList.add('last-page');
                    } else {
                        headerLogo.classList.remove('last-page');
                    }
                }
            });
        }

        window.addEventListener('scroll', updateActiveSection);
        updateActiveSection();

        // ===== PARTICLES =====
        const particlesContainer = document.getElementById('heroParticles');
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 8 + 's';
            p.style.animationDuration = (6 + Math.random() * 6) + 's';
            particlesContainer.appendChild(p);
        }

        // ===== INTERSECTION OBSERVER FOR ANIMATIONS =====
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationPlayState = 'running';
                }
            });
        }, observerOptions);

        document.querySelectorAll('.animate-fade-in-up, .animate-fade-in, .animate-slide-left, .animate-slide-right, .animate-scale, .footer-logo, .footer-brand, .footer-tagline').forEach(el => {
            el.style.animationPlayState = 'paused';
            observer.observe(el);
        });

        // ===== KEYBOARD NAVIGATION =====
        let currentSection = 0;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                currentSection = Math.min(currentSection + 1, sections.length - 1);
                sections[currentSection].scrollIntoView({ behavior: 'smooth' });
            } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                currentSection = Math.max(currentSection - 1, 0);
                sections[currentSection].scrollIntoView({ behavior: 'smooth' });
            }
        });