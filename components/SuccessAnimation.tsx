import React from 'react';

const PARTICLE_COUNT = 15;

const SuccessAnimation: React.FC = () => {
  const particles = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const angle = (360 / PARTICLE_COUNT) * i;
    const distance = 150 + Math.random() * 50; // Random distance from center
    const duration = 0.8 + Math.random() * 0.4; // Random duration
    const delay = Math.random() * 0.2; // Random delay
    const size = 10 + Math.random() * 8;
    const colors = ['#22d3ee', '#fde047', '#4ade80', '#f472b6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      id: i,
      style: {
        '--angle': `${angle}deg`,
        '--distance': `${distance}px`,
        '--duration': `${duration}s`,
        '--delay': `${delay}s`,
        '--size': `${size}px`,
        '--color': color,
        transform: `rotate(${angle}deg) translateY(0) scale(0)`,
        animation: `burst var(--duration) var(--delay) ease-out forwards`,
      } as React.CSSProperties,
    };
  });

  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute w-[var(--size)] h-[var(--size)] bg-[var(--color)] rounded-full"
            style={p.style}
          />
        ))}
      </div>
      <style>{`
        @keyframes burst {
          0% {
            transform: rotate(var(--angle)) translateY(0) scale(0.5);
            opacity: 1;
          }
          60% {
            transform: rotate(var(--angle)) translateY(calc(var(--distance) * -1)) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--angle)) translateY(calc(var(--distance) * -1.2)) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

export default SuccessAnimation;
