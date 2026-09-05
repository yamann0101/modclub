import { useState } from 'react';
import { Coins, Play } from 'lucide-react';
import { OlympusSlotPage } from '@/components/olympus-slot';
import { ClubRoulettePage } from '@/components/club-roulette';
import type { PublicSlot, SlotSpin } from '@/lib/club-api';

const GAMES = [
  { id: 'olympus', kind: 'slot', title: 'Olimpos 1000x', copy: 'Slot · çarpan · free' },
  { id: 'gem', kind: 'slot', title: 'Kristal 1000x', copy: 'Slot · mücevher' },
  { id: 'jungle', kind: 'slot', title: 'Safari 1000x', copy: 'Slot · aslan / kaplan / kedi' },
  { id: 'roulette', kind: 'roulette', title: 'Kulüp Ruleti', copy: 'Avrupa 0–36' },
] as const;

export function CasinoLobby({
  coins,
  busy,
  onSpin,
  onRefresh,
}: {
  coins: number;
  busy: boolean;
  onSpin: (amount: number, theme: 'olympus' | 'gem' | 'jungle') => Promise<SlotSpin>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);

  if (open === 'roulette') {
    return <ClubRoulettePage coins={coins} onPlayed={onRefresh} onBack={() => setOpen(null)} />;
  }
  if (open === 'olympus' || open === 'gem' || open === 'jungle') {
    const title = GAMES.find((item) => item.id === open)?.title || 'Slot';
    return (
      <OlympusSlotPage
        coins={coins}
        busy={busy}
        slot={slot}
        title={title}
        onBack={() => setOpen(null)}
        onSpin={(amount) => onSpin(amount, open)}
      />
    );
  }

  return (
    <div className="page-view casino-page">
      <div className="oly-top">
        <div>
          <p className="oly-kicker">CASINO</p>
          <h1>Oyunlar</h1>
        </div>
        <span className="oly-coins"><Coins size={14} /> {coins}</span>
      </div>
      <p className="casino-copy">Sanal club coin. Chip’i admin panelden sen verirsin. Para yatırma / çekme yok.</p>
      <div className="casino-grid">
        {GAMES.map((game) => (
          <article key={game.id} className={`casino-card is-${game.id}`}>
            <div className="casino-cover" />
            <div className="casino-card-body">
              <small>{game.copy}</small>
              <h2>{game.title}</h2>
              <button type="button" onClick={() => { setSlot(null); setOpen(game.id); }}>
                <Play size={14} /> Oyna
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
