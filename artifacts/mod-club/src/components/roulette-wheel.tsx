import { useEffect, useRef, useCallback } from 'react';

export const EURO_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function pocketFill(n: number) {
  if (n === 0) return '#0b8a44';
  return RED_SET.has(n) ? '#c91c1c' : '#181818';
}

function easeOutQuint(t: number) { return 1 - (1 - t) ** 5; }

/**
 * The pointer sits at the top of the canvas (12-o'clock, angle = -π/2).
 * To make pocket `result` land under the pointer we need the wheel to rotate
 * so that the CENTER of the result pocket is at -π/2.
 *
 * Pocket i occupies from  i*slot  to  (i+1)*slot  (measured CW from the
 * wheel's local 12-o'clock which is at rot=0 → canvas -π/2).
 * Its center is at  (i + 0.5) * slot  in wheel-space.
 *
 * For that center to align with the fixed pointer the total wheel rotation
 * (mod 360) must equal  -(i+0.5)*slotDeg  (or equivalently 360 - (i+0.5)*slotDeg).
 *
 * We add full extra spins for visual drama.
 */
function targetAngle(result: number) {
  const index = EURO_ORDER.indexOf(result);
  const slotDeg = 360 / EURO_ORDER.length;
  return 360 * 8 + (360 - (index + 0.5) * slotDeg);
}

function wheelDeg(result: number, progress: number, idle: number) {
  if (progress <= 0) return idle % 360;
  const target = targetAngle(result);
  return idle + easeOutQuint(progress) * target;
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
  // glossy shine arc
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

/* ---- pocket separators (metallic frets) ---- */
function drawFrets(ctx: CanvasRenderingContext2D, n: number, innerR: number, outerR: number, slotAngle: number) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = i * slotAngle - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * innerR * 0.55, Math.sin(a) * innerR * 0.55);
    ctx.lineTo(Math.cos(a) * outerR * 0.98, Math.sin(a) * outerR * 0.98);
    ctx.strokeStyle = 'rgba(212, 160, 23, .5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
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
      const numR = outerR * 0.85;
      const slotAngle = (Math.PI * 2) / EURO_ORDER.length;

      idleRef.current += phase === 'betting' ? 0.25 : 0;
      const duration = Math.max(1, spinEndsAt - spinStartedAt);
      const liveProgress = phase === 'spinning'
        ? Math.min(1, Math.max(0, (Date.now() - spinStartedAt) / duration))
        : phase === 'settled' ? 1 : 0;
      const deg = wheelDeg(result, liveProgress, idleRef.current);
      const rot = (deg * Math.PI) / 180;

      if (phase === 'spinning') {
        const bucket = Math.floor(deg / (360 / EURO_ORDER.length));
        if (bucket !== lastTickRef.current) { lastTickRef.current = bucket; playTick(); }
        if (!spinSoundRef.current) { spinSoundRef.current = true; playSpin(); }
      } else {
        spinSoundRef.current = false;
      }

      // outer chrome ring
      drawGlossyRing(ctx, cx, cy, outerR, innerR - 4);
      drawGoldBand(ctx, cx, cy, outerR - 2, 3);
      drawGoldBand(ctx, cx, cy, innerR - 2, 2);

      // outer tick marks on chrome ring
      for (let i = 0; i < EURO_ORDER.length; i++) {
        const a = rot + (i + 0.5) * slotAngle - Math.PI / 2;
        const r1 = innerR + 1;
        const r2 = outerR - 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.strokeStyle = 'rgba(212, 160, 23, .3)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // rotating wheel
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      // pockets
      EURO_ORDER.forEach((num, i) => {
        const a1 = i * slotAngle - Math.PI / 2;
        const a2 = (i + 1) * slotAngle - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, pocketR, a1, a2);
        ctx.closePath();
        ctx.fillStyle = pocketFill(num);
        ctx.fill();

        // pocket inner shadow for depth
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, pocketR, a1, a2);
        ctx.closePath();
        const pShadow = ctx.createRadialGradient(0, 0, pocketR * 0.5, 0, 0, pocketR);
        pShadow.addColorStop(0, 'transparent');
        pShadow.addColorStop(1, 'rgba(0,0,0,.6)');
        ctx.fillStyle = pShadow;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // frets between pockets
      drawFrets(ctx, EURO_ORDER.length, innerR, pocketR, slotAngle);

      // numbers
      EURO_ORDER.forEach((num, i) => {
        ctx.save();
        ctx.rotate(i * slotAngle + slotAngle / 2);
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${Math.max(8, size * 0.034)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.6)';
        ctx.shadowBlur = 3;
        ctx.fillText(String(num), 0, -numR);
        ctx.shadowBlur = 0;
        ctx.restore();
      });

      // inner ring dots
      for (let i = 0; i < EURO_ORDER.length; i++) {
        const a = (i + 0.5) * slotAngle - Math.PI / 2;
        const dx = Math.cos(a) * (innerR - 6);
        const dy = Math.sin(a) * (innerR - 6);
        ctx.beginPath();
        ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#d4a017';
        ctx.fill();
      }

      // center hub
      const hubGrad = ctx.createRadialGradient(-innerR * 0.08, -innerR * 0.08, 0, 0, 0, innerR * 0.38);
      hubGrad.addColorStop(0, '#1a1208');
      hubGrad.addColorStop(0.6, '#0e0b04');
      hubGrad.addColorStop(1, '#080604');
      ctx.beginPath();
      ctx.arc(0, 0, innerR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = hubGrad;
      ctx.fill();

      // hub gold ring
      ctx.beginPath();
      ctx.arc(0, 0, innerR * 0.38, 0, Math.PI * 2);
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore(); // end wheel rotation

      // center cone (fixed)
      drawCone(ctx, cx, cy, size * 0.04);

      // pointer at top
      const pointerX = cx;
      const pointerY = cy - outerR - 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY + 4);
      ctx.lineTo(pointerX - 7, pointerY - 10);
      ctx.lineTo(pointerX + 7, pointerY - 10);
      ctx.closePath();
      const pointerGrad = ctx.createLinearGradient(pointerX, pointerY - 10, pointerX, pointerY + 4);
      pointerGrad.addColorStop(0, '#f5e6a6');
      pointerGrad.addColorStop(1, '#b8860b');
      ctx.fillStyle = pointerGrad;
      ctx.fill();
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // ball
      const ballProgress = phase === 'spinning'
        ? Math.min(1, Math.max(0, (Date.now() - spinStartedAt) / duration))
        : phase === 'settled' ? 1 : 0;

      let ballScreenAngle: number;
      let ballDist: number;

      if (phase === 'betting') {
        // ball orbits slowly around the outer track, counter to wheel
        ballScreenAngle = -(Date.now() / 800) % (Math.PI * 2);
        ballDist = pocketR * 0.92;
      } else {
        // ball decelerates and lands in the result pocket under the pointer
        // final resting angle in screen space = -π/2 (top, aligned with pointer)
        const BALL_SPINS = 6;
        const finalAngle = -Math.PI / 2;
        const startAngle = finalAngle - Math.PI * 2 * BALL_SPINS;
        ballScreenAngle = startAngle + easeOutQuint(ballProgress) * (finalAngle - startAngle);
        ballDist = pocketR * 0.92 - easeOutQuint(ballProgress) * pocketR * 0.14;
      }

      const bx = cx + Math.cos(ballScreenAngle) * ballDist;
      const by = cy + Math.sin(ballScreenAngle) * ballDist;

      ctx.save();
      const ballSize = size * 0.018;
      const ballGrad = ctx.createRadialGradient(bx - 1.5, by - 1.5, 0, bx, by, ballSize);
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.4, '#f0ece0');
      ballGrad.addColorStop(1, '#b0a080');
      ctx.beginPath();
      ctx.arc(bx, by, ballSize, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad;
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();

      // settled: glow ring around ball
      if (phase === 'settled') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, ballSize + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 215, 120, .5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

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
