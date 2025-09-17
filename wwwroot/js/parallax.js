// parallax.js
// Lightweight parallax + reveal combo
// - Auto-enables panels & FAQ items
// - Uses rAF for smooth parallax
// - Uses IntersectionObserver for buttery reveal (adds .in-view)
// - Respects prefers-reduced-motion

(function () {
    // Respect reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
        // Still add 'in-view' to reveal elements so they don't remain hidden for screen-reader users,
        // but skip all motion/parallax behavior.
        document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('in-view'));
        return;
    }

    // Auto-assign parallax speeds for content sections and FAQ items (if not present)
    document.querySelectorAll('.content-sections .panel, #bigFaqAccordion .accordion-item')
        .forEach((el, i) => {
            if (!el.hasAttribute('data-parallax-speed')) {
                const speed = (i % 2 === 0 ? 0.08 : 0.12); // alternate speeds for layered depth
                el.setAttribute('data-parallax-speed', String(speed));
            }
        });

    // Collect elements that declare parallax speed
    const parallaxElems = Array.from(document.querySelectorAll('[data-parallax-speed]'));

    // Also add animate-on-scroll elements into the observer list (they may or may not be parallax elements)
    const revealElems = Array.from(document.querySelectorAll('.animate-on-scroll'));

    // Map parallax elements to structured items for rAF loop
    const items = parallaxElems.map(el => {
        const raw = el.getAttribute('data-parallax-speed');
        const speed = parseFloat(raw);
        return { el, speed: isNaN(speed) ? 0.08 : speed, rect: null };
    });

    // Utility: refresh bounding rects
    function refreshRects() {
        items.forEach(it => (it.rect = it.el.getBoundingClientRect()));
    }
    let resizeDebounce = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(refreshRects, 120);
    }, { passive: true });

    // If no parallax items, we still want to observe reveal elems
    if (items.length) refreshRects();

    // rAF parallax loop
    let latestScrollY = window.scrollY || window.scrollY;
    let ticking = false;

    function onScroll() {
        latestScrollY = window.scrollY || window.scrollY;
        if (!ticking) {
            window.requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }

    function updateParallax() {
        ticking = false;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        items.forEach(item => {
            // recalc rect if null (safe fallback)
            if (!item.rect) item.rect = item.el.getBoundingClientRect();

            // element's top relative to page
            const top = item.rect.top + (window.scrollY || window.scrollY);
            const elCenter = top + item.rect.height * 0.5;
            const distanceFromCenter = (elCenter - (latestScrollY + viewportHeight * 0.5));
            const translateY = -distanceFromCenter * item.speed;

            // apply transform — we don't overwrite the inline transform completely if element also has other transforms
            // but for simplicity we set translate3d(0, y, 0). If you have nested transforms, consider wrapping element.
            item.el.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;
            item.el.style.willChange = 'transform';
        });
    }

    // IntersectionObserver for reveal + initial "buttery" entry
    // Options tuned for earlier reveal (rootMargin) to create a nicer effect
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -8% 0px', // slightly early trigger
        threshold: 0.08
    };

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;

            if (entry.isIntersecting) {
                // Add in-view so CSS reveal runs (.animate-on-scroll.in-view)
                if (el.classList && el.classList.contains('animate-on-scroll')) {
                    el.classList.add('in-view');
                }

                // If this element participates in parallax, apply an immediate transform so entry + depth feel combined.
                const pi = items.find(it => it.el === el);
                if (pi) {
                    // compute current transform offset (same formula as rAF)
                    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                    const rect = el.getBoundingClientRect();
                    const top = rect.top + (window.scrollY || window.scrollY);
                    const elCenter = top + rect.height * 0.5;
                    const distanceFromCenter = (elCenter - (latestScrollY + viewportHeight * 0.5));
                    const translateY = -distanceFromCenter * pi.speed;

                    // set a subtle starting offset (slightly larger for a 'pop' effect)
                    const entryOffset = translateY * 0.85; // slight easing into place
                    el.style.transform = `translate3d(0, ${entryOffset.toFixed(2)}px, 0)`;
                    // ensure a smooth transition into the ongoing rAF-driven transform
                    el.style.transition = 'transform 520ms cubic-bezier(.16,.84,.36,1)';
                    // clear the transition after it finishes so rAF can take over seamlessly
                    setTimeout(() => {
                        el.style.transition = '';
                    }, 540);
                } else {
                    // For non-parallax reveal elems, just add a small 'in-view' class; CSS handles the fade
                    // No action required here
                }

                // If you only want to reveal once, you can unobserve afterwards:
                io.unobserve(el);
            }
        });
    }, observerOptions);

    // Observe reveal elements (both parallax items and pure reveal items)
    revealElems.forEach(el => {
        io.observe(el);
    });

    // Also observe parallax elements which might not have animate-on-scroll class
    parallaxElems.forEach(el => {
        if (!revealElems.includes(el)) {
            // Give parallax-only elements a reveal too (smooth entrance), but don't require .animate-on-scroll
            // We'll add .in-view class to allow CSS if desired
            el.classList.add('animate-on-scroll');
            io.observe(el);
        }
    });

    // initial update so items are positioned correctly on load
    updateParallax();

    // connect scroll
    window.addEventListener('scroll', onScroll, { passive: true });

    // refresh rects periodically (layout shift safety)
    let refreshTimer = setInterval(refreshRects, 2200);

    // cleanup
    window.addEventListener('beforeunload', () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', refreshRects);
        clearInterval(refreshTimer);
        io.disconnect();
    });

})();


