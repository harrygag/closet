// Custom confetti effect utility
export function triggerConfetti() {
  const colors = ['#f59e0b', '#f97316', '#ec4899', '#8b5cf6', '#10b981'];
  const confettiCount = 50;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background-color: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${Math.random() * 100}%;
      top: -10px;
      opacity: 1;
      transform: rotate(${Math.random() * 360}deg);
      z-index: 9999;
      pointer-events: none;
      border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
    `;
    
    document.body.appendChild(confetti);
    
    const duration = Math.random() * 3 + 2;
    const targetX = (Math.random() - 0.5) * 200;
    const targetY = window.innerHeight + 20;
    
    confetti.animate([
      {
        transform: `translate(0, 0) rotate(0deg)`,
        opacity: 1
      },
      {
        transform: `translate(${targetX}px, ${targetY}px) rotate(${Math.random() * 720}deg)`,
        opacity: 0
      }
    ], {
      duration: duration * 1000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }).onfinish = () => {
      confetti.remove();
    };
  }
}

export function triggerCartAnimation(element: HTMLElement) {
  element.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.3)' },
    { transform: 'scale(1)' }
  ], {
    duration: 300,
    easing: 'ease-out'
  });
}

