import { useEffect, useRef, useCallback } from 'react';

export const EURO_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function pocketFill(n: number) {
  if (n === 0) return '#0b8a44';
  return RED_SET.has(n) ? '#c91c1c' : '#181818';
}

function easeOutQuint(t: number) { return 1 - (1 - t) ** 5; }

function wheelAngle(result: number, progress: number, idle: number) {
  const index = EURO_ORDER.indexOf(result);
  const slot = 360 / EURO_ORDER.length;
  const land = 360 - (index + 0.5) * slot;
  if (progress <= 0) return idle % 360;
  return idle + easeOutQuint(progress) * (360 * 8 + land);
}

/* ---- audio helpers ---- */
let audioCtx: AudioContext | null = null;
function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function playTick() {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2200;
    g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    o.stop(ctx.currentTime + 0.07);
  } catch {/* */}
}

export function playCountdown() {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 660;
    g.gain.value = 0.035;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    o.stop(ctx.currentTime + 0.13);
  } catch {/* */}
}

export function playWin() {
  try {
    const ctx = getAudio();
    [440, 554, 659, 880].forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.value = 0.04;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.1 + 0.18);
      o.stop(ctx.currentTime + i * 0.1 + 0.2);
    });
  } catch {/* */}
}

export function playSpin() {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120;
    g.gain.value = 0.02;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 3);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 4);
    o.stop(ctx.currentTime + 4.1);
  } catch {/* */}
}

/* ---- draw helpers ---- */
function drawGlossyRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy - outer * 0.2, inner, cx, cy, outer);
  grad.addColorStop(0, '#4a4a4a');
  grad.addColorStop(0.3, '#1a1a1a');
  grad.addColorStop(0.6, '#0d0d0d');
  grad.addColorStop(0.85, '#222');
  grad.addColorStop(1, '#111');
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fillStyle = grad;
  ctx.fill();
  const shine = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer * 0.4, cy - outer * 0.3);
  shine.addColorStop(0, 'rgba(255,255,255,0)');
  shine.addColorStop(0.4, 'rgba(255,255,255,.18)');
  shine.addColorStop(0.6, 'rgba(255,255,255,.06)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, outer - 1, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner + 1, 0, Math.PI * 2, true);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

function drawGoldBand(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, w: number) {
  ctx.save();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#f5e6a6');
  g.addColorStop(0.3, '#d4a017');
  g.addColorStop(0.5, '#f5e6a6');
  g.addColorStop(0.7, '#b8860b');
  g.addColorStop(1, '#f5e6a6');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = g;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

function drawCone(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.save();
  const g = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, 0, cx, cy, radius);
  g.addColorStop(0, '#d4a017');
  g.addColorStop(0.5, '#8b6914');
  g.addColorStop(1, '#3a2e08');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  const shine2 = ctx.createLinearGradient(cx - radius * 0.5, cy - radius, cx + radius * 0.3, cy);
  shine2.addColorStop(0, 'rgba(255,255,255,.35)');
  shine2.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine2;
  ctx.fill();
  ctx.restore();
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
  const lastTickRef = useRef(-1);
  const spinSoundRef = useRef(false);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;

    const draw = () => {
      const size = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.floor(size * dpr);
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const outerR = size * 0.48;
      const innerR = outerR * 0.78;
      const pocketR = outerR * 0.72;
      const numR = outerR * 0.84;
      const slotAngle = (Math.PI * 2) / EURO_ORDER.length;

      idleRef.current += phase === 'betting' ? 0.25 : 0;
      const duration = Math.max(1, spinEndsAt - spinStartedAt);
      const liveProgress = phase === 'spinning'
        ? Math.min(1, Math.max(0, (Date.now() - spinStartedAt) / duration))
        : phase === 'settled' ? 1 : 0;
      const deg = wheelAngle(result, liveProgress, idleRef.current);
      const rot = (deg * Math.PI) / 180;

      if (phase === 'spinning') {
        const bucket = Math.floor(deg / (360 / EURO_ORDER.length));
        if (bucket !== lastTickRef.current) { lastTickRef.current = bucket; playTick(); }
        if (!spinSoundRef.current) { spinSoundRef.current = true; playSpin(); }
      } else {
        spinSoundRef.current = false;
      }

      drawGlossyRing(ctx, cx, cy, outerR, innerR - 4);
      drawGoldBand(ctx, cx, cy, outerR - 2, 3);
      drawGoldBand(ctx, cx, cy, innerR - 2, 2);

      for (let i = 0; i < EURO_ORDER.length; i++) {
        const a = rot + i * slotAngle - Math.PI / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * innerR * 0.4, cy + Math.sin(a) * innerR * 0.4);
        ctx.lineTo(cx + Math.cos(a) * outerR * 0.7, cy + Math.sin(a) * outerR * 0.7);
        ctx.strokeStyle = 'rgba(212, 160, 23, .25)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      EURO_ORDER.forEach((num, i) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, pocketR, i * slotAngle - Math.PI / 2, (i + 1) * slotAngle - Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = pocketFill(num);
        ctx.fill();
        ctx.strokeStyle = 'rgba(212, 160, 23, .45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.save();
        ctx.rotate(i * slotAngle + slotAngle / 2);
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${Math.max(8, size * 0.034)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 3;
        ctx.fillText(String(num), 0, -numR);
        ctx.shadowBlur = 0;
        ctx.restore();
      });

      const hubGrad = ctx.createRadialGradient(-innerR * 0.1, -innerR * 0.1, 0, 0, 0, innerR * 0.38);
      hubGrad.addColorStop(0, '#1a1208');
      hubGrad.addColorStop(0.6, '#0e0b04');
      hubGrad.addColorStop(1, '#080604');
      ctx.beginPath();
      ctx.arc(0, 0, innerR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.restore();

      drawCone(ctx, cx, cy, size * 0.045);

      for (let i = 0; i < EURO_ORDER.length; i++) {
        const a = rot + (i + 0.5) * slotAngle - Math.PI / 2;
        const dx = cx + Math.cos(a) * (innerR - 6);
        const dy = cy + Math.sin(a) * (innerR - 6);
        ctx.beginPath();
        ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#d4a017';
        ctx.fill();
      }

      const pointer = -Math.PI / 2;
      ctx.save();
      ctx.beginPath();
      const px2 = cx + Math.cos(pointer) * (outerR + 2);
      const py2 = cy + Math.sin(pointer) * (outerR + 2);
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 - 6, py2 - 12);
      ctx.lineTo(px2 + 6, py2 - 12);
      ctx.closePath();
      ctx.fillStyle = '#d4a017';
      ctx.fill();
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      const ballProgress = phase === 'spinning'
        ? Math.min(1, Math.max(0, (Date.now() - spinStartedAt) / duration))
        : phase === 'settled' ? 1 : 0;
      const ballAngle = phase === 'betting'
        ? (Date.now() / 1200) % (Math.PI * 2)
        : -rot - Math.PI / 2 + easeOutQuint(ballProgress) * Math.PI * 12;
      const ballDist = phase === 'betting'
        ? pocketR * 0.92
        : pocketR * 0.92 - easeOutQuint(ballProgress) * pocketR * 0.12;
      const bx = cx + Math.cos(ballAngle) * ballDist;
      const by = cy + Math.sin(ballAngle) * ballDist;

      ctx.save();
      const ballGrad = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, size * 0.016);
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.5, '#e8e0d0');
      ballGrad.addColorStop(1, '#b8a888');
      ctx.beginPath();
      ctx.arc(bx, by, size * 0.016, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad;
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();

      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, result, spinStartedAt, spinEndsAt]);

  useEffect(() => render(), [render]);

  return (
    <div className="roulette-stage">
      <canvas ref={canvasRef} className="roulette-canvas-3d" />
    </div>
  );
}
