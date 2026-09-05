import { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import type { PublicSlot, SlotCell, SlotSpin, SlotStep } from '@/lib/club-api';

const CHIPS = [10, 20, 50, 100, 200, 500];

const PAYS: Record<string, string> = {
  zeus: '5 / 15 / 50',
  crown: '2 / 6 / 20',
  goblet: '1.5 / 4 / 10',
  ring: '1 / 2.5 / 6',
  hour: '0.8 / 1.5 / 4',
  red: '0.5 / 1 / 2.5',
  purple: '0.4 / 0.8 / 2',
  green: '0.3 / 0.6 / 1.5',
  blue: '0.25 / 0.5 / 1.2',
  yellow: '0.2 / 0.4 / 1',
};

const SYMBOL_META: Record<string, { label: string; cls: string }> = {
  zeus: { label: 'ZEUS', cls: 'is-zeus' },
  crown: { label: '♔', cls: 'is-crown' },
  goblet: { label: '🏺', cls: 'is-goblet' },
  ring: { label: '◎', cls: 'is-ring' },
  hour: { label: '⌛', cls: 'is-hour' },
  red: { label: '◆', cls: 'is-red' },
  purple: { label: '◆', cls: 'is-purple' },
  green: { label: '◆', cls: 'is-green' },
  blue: { label: '◆', cls: 'is-blue' },
  yellow: { label: '◆', cls: 'is-yellow' },
};

let audioCtx: AudioContext | null = null;
function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.04) {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur + 0.02);
  } catch { /* */ }
}

function playSpinSound() {
  tone(140, 0.18, 'sawtooth', 0.03);
}
function playWinSound() {
  [440, 554, 659].forEach((freq, i) => setTimeout(() => tone(freq, 0.16, 'triangle', 0.045), i * 90));
}
function playFreeSound() {
  [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => tone(freq, 0.2, 'square', 0.035), i * 110));
}

const IDLE_SYMBOLS = ['yellow', 'blue', 'green', 'purple', 'red', 'hour', 'ring', 'goblet', 'crown'];

function emptyGrid(): SlotCell[][] {
  return Array.from({ length: 6 }, (_, col) => Array.from({ length: 5 }, (_, row) => ({
    id: `idle-${col}-${row}`,
    t: 's' as const,
    s: IDLE_SYMBOLS[(col + row) % IDLE_SYMBOLS.length],
  })));
}

function shuffleGrid(): SlotCell[][] {
  return Array.from({ length: 6 }, (_, col) => Array.from({ length: 5 }, (_, row) => ({
    id: `spin-${col}-${row}-${Math.random().toString(36).slice(2, 7)}`,
    t: 's' as const,
    s: IDLE_SYMBOLS[Math.floor(Math.random() * IDLE_SYMBOLS.length)],
  })));
}

function CellView({ cell, win }: { cell: SlotCell; win: boolean }) {
  if (cell.t === 'x') {
    return <div className={`oly-cell is-mult ${win ? 'is-win' : ''}`}><span>{cell.m}x</span></div>;
  }
  if (cell.t === 'f') {
    return <div className={`oly-cell is-scatter ${win ? 'is-win' : ''}`}><Zap size={18} /><small>FREE</small></div>;
  }
  const meta = SYMBOL_META[cell.s || 'yellow'] || SYMBOL_META.yellow;
  return <div className={`oly-cell ${meta.cls} ${win ? 'is-win' : ''}`}><span>{meta.label}</span></div>;
}

export function OlympusSlotPage({
  coins,
  busy,
  slot,
  onSpin,
}: {
  coins: number;
  busy: boolean;
  slot: PublicSlot | null;
  onSpin: (amount: number) => Promise<SlotSpin>;
}) {
  const [bet, setBet] = useState(slot?.lastBet && CHIPS.includes(slot.lastBet as typeof CHIPS[number]) ? slot.lastBet : 10);
  const [grid, setGrid] = useState<SlotCell[][]>(emptyGrid);
  const [wins, setWins] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [banner, setBanner] = useState('');
  const [lastWin, setLastWin] = useState(0);
  const [pot, setPot] = useState(slot?.pot || 0);
  const [freesLeft, setFreesLeft] = useState(slot?.freesLeft || 0);
  const [payOpen, setPayOpen] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (playing) return;
    setFreesLeft(slot?.freesLeft || 0);
    setPot(slot?.pot || 0);
  }, [slot?.freesLeft, slot?.pot, playing]);

  const canSpin = !busy && !playing && (freesLeft > 0 || coins >= bet);
  const scatterCount = grid.flat().filter((cell) => cell.t === 'f').length;

  const playSteps = async (steps: SlotStep[]) => {
    for (const step of steps) {
      if (cancelRef.current) return;
      setGrid(step.grid);
      setWins(step.wins.map((item) => item.symbol));
      setPot(step.pot);
      if (step.wins.length && !muted) playWinSound();
      await new Promise((resolve) => window.setTimeout(resolve, step.wins.length ? 720 : 380));
    }
    setWins([]);
  };

  const spin = async () => {
    if (!canSpin) return;
    setPlaying(true);
    setBanner('');
    setLastWin(0);
    if (!muted) playSpinSound();
    const shuffle = window.setInterval(() => setGrid(shuffleGrid()), 70);
    try {
      const result = await onSpin(bet);
      window.clearInterval(shuffle);
      setFreesLeft(result.freesLeft);
      await playSteps(result.steps);
      setLastWin(result.totalWin);
      setPot(result.pot);
      if (result.freesAwarded) {
        setBanner(result.free ? `+${result.freesAwarded} FREE` : `${result.freesAwarded} FREE SPIN`);
        if (!muted) playFreeSound();
      } else if (result.totalWin >= result.bet * 20) {
        setBanner(`BÜYÜK KAZANÇ  ${result.totalWin}`);
      } else if (result.totalWin > 0) {
        setBanner(`+${result.totalWin}`);
      } else {
        setBanner('Tekrar dene');
      }
    } catch (err) {
      window.clearInterval(shuffle);
      const code = (err as Error).message;
      setBanner(code === 'coins' ? 'Yeterli coin yok' : 'Çevrim olmadı');
    } finally {
      setPlaying(false);
    }
  };

  const payRows = useMemo(() => (
    Object.entries(SYMBOL_META).map(([key, meta]) => ({ key, ...meta }))
  ), []);

  return (
    <div className="page-view oly-page">
      <div className="oly-top">
        <div>
          <p className="oly-kicker">MOD CLUB SLOT</p>
          <h1>Olimpos 1000x</h1>
        </div>
        <div className="oly-top-actions">
          <button type="button" className="oly-icon-btn" onClick={() => setMuted((value) => !value)} aria-label="Ses">
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <span className="oly-coins"><Coins size={14} /> {coins}</span>
        </div>
      </div>

      <div className="oly-status">
        {freesLeft > 0 ? (
          <span className="oly-pill is-free"><Sparkles size={13} /> Free {freesLeft} · çarpan {Math.max(1, pot)}x</span>
        ) : (
          <span className="oly-pill">8+ aynı sembol kazanır · max 1000x</span>
        )}
      </div>

      <div className={`oly-stage ${playing ? 'is-spinning' : ''} ${freesLeft > 0 ? 'is-free' : ''}`}>
        {banner && <div className="oly-banner">{banner}</div>}
        <div className="oly-grid">
          {grid.map((col, c) => (
            <div key={c} className="oly-col">
              {col.map((cell) => (
                <CellView
                  key={cell.id}
                  cell={cell}
                  win={
                    (cell.t === 's' && !!cell.s && wins.includes(cell.s))
                    || (wins.length > 0 && cell.t === 'x')
                    || (cell.t === 'f' && scatterCount >= 4)
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="oly-winline">
        <strong>{lastWin > 0 ? `+${lastWin}` : '—'}</strong>
        <small>Son kazanç</small>
      </div>

      <div className="oly-chips">
        {CHIPS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={playing || freesLeft > 0}
            onClick={() => setBet(value)}
            className={`oly-chip ${bet === value ? 'is-on' : ''}`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="oly-controls">
        <button type="button" className="oly-pay-btn" onClick={() => setPayOpen((open) => !open)}>Ödeme</button>
        <button type="button" className="oly-spin" disabled={!canSpin} onClick={() => void spin()}>
          {freesLeft > 0 ? 'FREE' : playing ? '...' : 'ÇEVİR'}
        </button>
        <div className="oly-bet">Bahis <b>{freesLeft > 0 ? slot?.lastBet || bet : bet}</b></div>
      </div>

      {payOpen && (
        <div className="oly-paytable">
          <p>8 / 10 / 12 aynı sembol — bahis katı</p>
          {payRows.map((row) => (
            <div key={row.key} className="oly-pay-row">
              <span className={`oly-cell ${row.cls}`}><span>{row.label}</span></span>
              <small>{PAYS[row.key]}</small>
            </div>
          ))}
          <p>4 şimşek = 15 free, 5 = 20, 6 = 25. Free içinde 3+ şimşek = +5. Çarpanlar baz oyunda çarpılır, free’de pot’a eklenir. Tavan bahis × 1000.</p>
        </div>
      )}
    </div>
  );
}
