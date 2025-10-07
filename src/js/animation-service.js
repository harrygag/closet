// Animation Service - GSAP-powered enhancements for retro arcade feel
// Gracefully degrades if GSAP not loaded

class AnimationService {
    constructor() {
        this.gsapAvailable = typeof gsap !== 'undefined';
        this.init();
    }

    init() {
        if (!this.gsapAvailable) {
            console.log('🎮 GSAP not loaded - using CSS animations');
            return;
        }

        console.log('🎮 Animation Service initialized with GSAP');
        
        // Setup all enhancements
        this.setupItemCardAnimations();
        this.setupButtonAnimations();
        this.setupModalAnimations();
        this.setupStatCounterAnimations();
    }

    // Enhanced item card hover effects
    setupItemCardAnimations() {
        if (!this.gsapAvailable) return;

        // Create custom GSAP effect for card float
        gsap.registerEffect({
            name: "cardFloat",
            effect: (targets, config) => {
                return gsap.to(targets, {
                    y: -8,
                    scale: 1.02,
                    duration: 0.3,
                    ease: "power2.out",
                    ...config
                });
            },
            defaults: { duration: 0.3 }
        });

        // Apply to all item cards (delegation for dynamic cards)
        document.addEventListener('mouseenter', (e) => {
            if (e.target.closest('.item-card')) {
                const card = e.target.closest('.item-card');
                gsap.effects.cardFloat(card);
            }
        }, true);

        document.addEventListener('mouseleave', (e) => {
            if (e.target.closest('.item-card')) {
                const card = e.target.closest('.item-card');
                gsap.to(card, {
                    y: 0,
                    scale: 1,
                    duration: 0.2,
                    ease: "power2.in"
                });
            }
        }, true);
    }

    // Enhanced button click feedback
    setupButtonAnimations() {
        if (!this.gsapAvailable) return;

        // Apply to all buttons
        const buttonSelectors = '.retro-btn, .retro-btn-small, .power-button, .tab-btn, .save-btn';
        
        document.addEventListener('click', (e) => {
            const button = e.target.closest(buttonSelectors);
            if (button) {
                // Satisfying click animation
                gsap.to(button, {
                    scale: 0.92,
                    duration: 0.1,
                    yoyo: true,
                    repeat: 1,
                    ease: "power2.inOut"
                });
            }
        }, true);
    }

    // Enhanced modal animations
    setupModalAnimations() {
        if (!this.gsapAvailable) return;

        // Observe modal class changes
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        if (modal.classList.contains('active')) {
                            this.animateModalIn(modal);
                        }
                    }
                });
            });

            observer.observe(modal, { attributes: true });
        });
    }

    animateModalIn(modal) {
        if (!this.gsapAvailable) return;

        const modalWindow = modal.querySelector('.modal-window');
        
        gsap.fromTo(modalWindow, 
            {
                scale: 0.8,
                opacity: 0,
                y: 50
            },
            {
                scale: 1,
                opacity: 1,
                y: 0,
                duration: 0.4,
                ease: "back.out(1.7)"
            }
        );
    }

    // Animate stat counters when they update
    setupStatCounterAnimations() {
        if (!this.gsapAvailable) return;

        // Create custom effect for number counting
        gsap.registerEffect({
            name: "countUp",
            effect: (targets, config) => {
                const target = targets[0];
                const endValue = config.value;
                const startValue = parseInt(target.textContent.replace(/[^0-9]/g, '')) || 0;
                
                return gsap.to(target, {
                    textContent: endValue,
                    duration: 0.8,
                    ease: "power2.out",
                    snap: { textContent: 1 },
                    onUpdate: function() {
                        const currentValue = Math.round(this.targets()[0].textContent);
                        if (target.textContent.includes('$')) {
                            target.textContent = '$' + currentValue;
                        } else {
                            target.textContent = currentValue;
                        }
                    }
                });
            },
            defaults: { value: 0 }
        });
    }

    // Animate power button pulsing
    animatePowerButton() {
        if (!this.gsapAvailable) return;

        const powerBtn = document.querySelector('.power-button');
        if (powerBtn) {
            gsap.to(powerBtn, {
                scale: 1.05,
                duration: 0.5,
                yoyo: true,
                repeat: -1,
                ease: "power1.inOut"
            });
        }
    }

    // Enhanced closet view hanger sway
    animateHangerSway(hangerElement) {
        if (!this.gsapAvailable) return;

        gsap.to(hangerElement, {
            rotation: 2,
            duration: 2,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut"
        });
    }

    // Success flash animation
    playSuccessFlash(element) {
        if (!this.gsapAvailable) return;

        gsap.fromTo(element,
            { backgroundColor: 'rgba(0, 255, 0, 0.3)' },
            {
                backgroundColor: 'rgba(0, 255, 0, 0)',
                duration: 0.8,
                ease: "power2.out"
            }
        );
    }

    // Error shake animation
    playErrorShake(element) {
        if (!this.gsapAvailable) return;

        gsap.to(element, {
            x: [-10, 10, -10, 10, 0],
            duration: 0.4,
            ease: "power2.inOut"
        });
    }
}
