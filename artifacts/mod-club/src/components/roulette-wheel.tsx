import { useEffect, useRef } from 'react';

export const EURO_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function pocketFill(n: number) {
  if (n === 0) return '#0f9d58';
  return RED_SET.has(n) ? '#c81e1e' : '#141414';
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function wheelAngle(result: number, progress: number, idle: number) {
  const index = EURO_ORDER.indexOf(result);
  const slot = 360 / EURO_ORDER.length;
  const land = 360 - (index + 0.5) * slot;
  if (progress <= 0) return idle % 360;
  return idle + easeOut(progress) * (360 * 6 + land);
}

export function RouletteWheel({
  phase,
  result = 0,
  spinStartedAt,
  spinEndsAt,
  now,
}: {
  phase: 'betting' | 'spinning' | 'settled';
  result?: number;
  spinStartedAt: number;
  spinEndsAt: number;
  now: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;

    const draw = (stamp: number) => {
      const size = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(size * dpr)) {
        canvas.width = Math.floor(size * dpr);
        canvas.height = Math.floor(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.46;
      const slot = (Math.PI * 2) / EURO_ORDER.length;
      idleRef.current += phase === 'betting' ? 0.35 : 0;
      const duration = Math.max(1, spinEndsAt - spinStartedAt);
      const liveProgress = phase === 'spinning'
        ? Math.min(1, Math.max(0, (Date.now() - spinStartedAt) / duration))
        : phase === 'settled' ? 1 : 0;
      void stamp;
      const deg = wheelAngle(result, liveProgress, idleRef.current);
      const rot = (deg * Math.PI) / 180;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      EURO_ORDER.forEach((num, index) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, index * slot - Math.PI / 2, (index + 1) * slot - Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = pocketFill(num);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 215, 120, .35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.save();
        ctx.rotate(index * slot + slot / 2);
        ctx.fillStyle = '#fff7d6';
        ctx.font = `700 ${Math.max(9, size * 0.038)}px ui-sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(num), 0, -radius * 0.78);
        ctx.restore();
      });
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1a0c';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#d4a017';
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8c36a';
      ctx.lineWidth = 10;
      ctx.stroke();

      const ballA = -Math.PI / 2 - ((deg + 8) * Math.PI) / 180;
      const ballR = radius * 0.9;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ballA) * ballR, cy + Math.sin(ballA) * ballR, size * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = '#f8f4e8';
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, result, spinStartedAt, spinEndsAt, now]);

  return (
    <div className="roulette-stage">
      <div className="roulette-felt" />
      <canvas ref={canvasRef} className="roulette-canvas" />
      <div className="roulette-hub" />
    </div>
  );
}
