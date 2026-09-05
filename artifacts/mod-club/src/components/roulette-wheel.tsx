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

function markLandedPit(root: HTMLElement | null, number?: number | null) {
  const inner = root?.querySelector<HTMLElement>('.roulette-wheel-inner');
  if (!inner) return;
  inner.querySelectorAll('.roulette-wheel-bet-number.is-landed').forEach((node) => node.classList.remove('is-landed'));
  if (number === undefined || number === null) {
    inner.classList.remove('is-snapped');
    return;
  }
  const pit = inner.querySelector(`.roulette-wheel-bet-number[data-bet="${number}"]`);
  pit?.classList.add('is-landed');
  inner.classList.add('is-snapped');
}

export function CasinoRouletteStage({
  phase,
  result,
  round,
  onLanded,
}: {
  phase: 'betting' | 'spinning' | 'settled';
  result?: number;
  round: number;
  onLanded?: (number: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(false);
  const [winningBet, setWinningBet] = useState<WheelBet>('-1');
  const [landed, setLanded] = useState<number | null>(null);
  const spinRoundRef = useRef<number | null>(null);
  const spinSoundRef = useRef(false);
  const resultRef = useRef(result);
  const onLandedRef = useRef(onLanded);
  resultRef.current = result;
  onLandedRef.current = onLanded;

  const lockLanded = () => {
    const number = resultRef.current;
    if (number === undefined) return;
    setLanded(number);
    markLandedPit(wrapRef.current, number);
    onLandedRef.current?.(number);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const box = wrap.getBoundingClientRect();
      const scale = Math.min(box.width / 374, box.height / 374, 1);
      wrap.style.setProperty('--wheel-scale', String(Math.max(0.28, scale * 0.96)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase === 'spinning' && result !== undefined && spinRoundRef.current !== round) {
      spinRoundRef.current = round;
      setLanded(null);
      markLandedPit(wrapRef.current, null);
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
      setLanded(null);
      markLandedPit(wrapRef.current, null);
      return;
    }
    if (phase === 'settled' && result !== undefined) {
      lockLanded();
    }
  }, [phase, round, result]);

  return (
    <div className={`roulette-stage casino-stage ${phase === 'settled' ? 'is-settled-glow' : ''}`}>
      <div className="casino-wheel-wrap" ref={wrapRef}>
        <CasinoWheel
          start={start}
          winningBet={winningBet}
          onSpinningEnd={() => {
            setStart(false);
            lockLanded();
          }}
          withAnimation={phase !== 'settled'}
          addRest={false}
        />
      </div>
      {phase === 'settled' && landed !== null && (
        <div className={`roulette-result-pop ${landed === 0 ? 'is-green' : RED_SET.has(landed) ? 'is-red' : 'is-black'}`}>
          {landed}
        </div>
      )}
    </div>
  );
}
