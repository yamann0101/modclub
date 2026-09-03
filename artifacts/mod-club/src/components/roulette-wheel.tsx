import { useEffect, useRef, useState } from 'react';
import { RouletteWheel as CasinoWheel } from 'react-casino-roulette';

export const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const CHIP_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f5d76e" stroke="#b8860b" stroke-width="3"/><circle cx="24" cy="24" r="14" fill="none" stroke="#b8860b" stroke-width="2" stroke-dasharray="5 4"/><text x="24" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="#7a5208">$</text></svg>',
)}`;

type WheelBet = '-1' | '0' | '00' | `${number}`;

function resultToBet(result?: number): WheelBet {
  if (result === undefined) return '-1';
  return String(result) as WheelBet;
}

/* ---- audio ---- */
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

export function CasinoRouletteStage({
  phase,
  result,
  round,
}: {
  phase: 'betting' | 'spinning' | 'settled';
  result?: number;
  round: number;
}) {
  const [start, setStart] = useState(false);
  const [winningBet, setWinningBet] = useState<WheelBet>('-1');
  const spinRoundRef = useRef<number | null>(null);
  const spinSoundRef = useRef(false);

  useEffect(() => {
    if (phase === 'spinning' && result !== undefined && spinRoundRef.current !== round) {
      spinRoundRef.current = round;
      setStart(false);
      setWinningBet(resultToBet(result));
      if (!spinSoundRef.current) { spinSoundRef.current = true; playSpin(); }
    }
    if (phase !== 'spinning') spinSoundRef.current = false;
  }, [phase, result, round]);

  useEffect(() => {
    if (winningBet !== '-1' && !start && phase === 'spinning') setStart(true);
  }, [winningBet, start, phase]);

  useEffect(() => {
    if (phase === 'betting') {
      spinRoundRef.current = null;
      setStart(false);
      setWinningBet('-1');
    }
  }, [phase, round]);

  return (
    <div className={`roulette-stage casino-stage ${phase === 'spinning' ? 'is-zoom' : ''} ${phase === 'settled' ? 'is-settled-glow' : ''}`}>
      <div className="casino-wheel-wrap">
        <CasinoWheel
          start={start}
          winningBet={winningBet}
          onSpinningEnd={() => setStart(false)}
          withAnimation
          addRest
        />
      </div>
      {phase === 'settled' && result !== undefined && (
        <div className={`roulette-result-pop ${result === 0 ? 'is-green' : RED_SET.has(result) ? 'is-red' : 'is-black'}`}>
          {result}
        </div>
      )}
    </div>
  );
}
