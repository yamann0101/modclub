import { useState } from 'react';
import { Coins } from 'lucide-react';
import { rouletteBet, type RouletteSpin } from '@/lib/club-api';

const CHIPS = [10, 20, 50, 100, 200, 500];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function ClubRoulettePage({
  coins,
  onPlayed,
  onBack,
}: {
  coins: number;
  onPlayed: () => void;
  onBack: () => void;
}) {
  const [bet, setBet] = useState(10);
  const [kind, setKind] = useState<'number' | 'color' | 'parity'>('color');
  const [value, setValue] = useState<string | number>('red');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RouletteSpin | null>(null);
  const [error, setError] = useState('');

  const spin = async () => {
    if (busy || coins < bet) return;
    setBusy(true);
    setError('');
    try {
      const data = await rouletteBet(bet, kind, value);
      setResult(data.spin);
      onPlayed();
    } catch (err) {
      setError((err as Error).message === 'coins' ? 'Yeterli coin yok' : 'Çevrim olmadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-view casino-page">
      <div className="oly-top">
        <div>
          <p className="oly-kicker">CASINO</p>
          <h1>Kulüp Ruleti</h1>
          <button type="button" className="oly-pay-btn mt-2" onClick={onBack}>Lobi</button>
        </div>
        <span className="oly-coins"><Coins size={14} /> {coins}</span>
      </div>
      {error && <p className="casino-error">{error}</p>}
      <div className={`roulette-result ${result ? `is-${result.color}` : ''}`}>
        {result ? `${result.number} · ${result.win > 0 ? `+${result.win}` : 'kaybettin'}` : 'Bahis seç, çevir'}
      </div>
      <div className="roulette-zero">
        <button type="button" className={kind === 'number' && value === 0 ? 'is-on' : ''} onClick={() => { setKind('number'); setValue(0); }}>0</button>
      </div>
      <div className="roulette-nums">
        {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`${RED.has(n) ? 'is-red' : 'is-black'} ${kind === 'number' && value === n ? 'is-on' : ''}`}
            onClick={() => { setKind('number'); setValue(n); }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="roulette-outside">
        <button type="button" className={kind === 'color' && value === 'red' ? 'is-on is-red' : 'is-red'} onClick={() => { setKind('color'); setValue('red'); }}>Kırmızı</button>
        <button type="button" className={kind === 'color' && value === 'black' ? 'is-on is-black' : 'is-black'} onClick={() => { setKind('color'); setValue('black'); }}>Siyah</button>
        <button type="button" className={kind === 'parity' && value === 'even' ? 'is-on' : ''} onClick={() => { setKind('parity'); setValue('even'); }}>Çift</button>
        <button type="button" className={kind === 'parity' && value === 'odd' ? 'is-on' : ''} onClick={() => { setKind('parity'); setValue('odd'); }}>Tek</button>
      </div>
      <div className="oly-chips">
        {CHIPS.map((chip) => (
          <button key={chip} type="button" className={`oly-chip ${bet === chip ? 'is-on' : ''}`} onClick={() => setBet(chip)}>{chip}</button>
        ))}
      </div>
      <button type="button" className="oly-spin" disabled={busy || coins < bet} onClick={() => void spin()}>
        {busy ? '...' : `ÇEVİR · ${bet}`}
      </button>
    </div>
  );
}
