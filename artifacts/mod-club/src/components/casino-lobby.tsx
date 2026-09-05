import { useEffect, useState } from 'react';
import { Coins, Dices, Play, X } from 'lucide-react';
import { fetchCasino, launchCasinoGame, type CasinoGame, type CasinoStatus } from '@/lib/club-api';

const KIND_LABEL: Record<CasinoGame['kind'], string> = {
  slot: 'Slot',
  slot2: 'Slot',
  animal: 'Slot',
  roulette: 'Rulet',
};

export function CasinoLobby({ coins, onCoins }: { coins: number; onCoins?: () => void }) {
  const [games, setGames] = useState<CasinoGame[]>([]);
  const [status, setStatus] = useState<CasinoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [play, setPlay] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    void fetchCasino()
      .then((data) => {
        setGames(data.games);
        setStatus(data.status);
      })
      .catch(() => setError('Oyun listesi alınamadı'));
  }, []);

  const openGame = async (game: CasinoGame) => {
    if (!game.configured) {
      setError('Bu oyun henüz yapılandırılmadı. Admin Pragmatic symbol eklemeli.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const launched = await launchCasinoGame(game.id);
      setPlay(launched);
    } catch (err) {
      const fail = err as Error & { status?: number };
      const message = fail.message;
      if (message === 'pragmatic_missing') {
        setError(status?.note || 'Pragmatic Play operator bilgileri eksik. Sahte API yok.');
      } else if (message === 'pragmatic_launch') {
        setError('Pragmatic launch URL vermedi. Operator panelindeki yetki ve symbol’ü kontrol et.');
      } else {
        setError('Oyun açılamadı');
      }
    } finally {
      setBusy(false);
    }
  };

  const closePlay = () => {
    setPlay(null);
    onCoins?.();
  };

  return (
    <div className="page-view casino-page">
      <div className="oly-top">
        <div>
          <p className="oly-kicker">CASINO</p>
          <h1>Oyunlar</h1>
        </div>
        <span className="oly-coins"><Coins size={14} /> {coins}</span>
      </div>
      <p className="casino-copy">Sadece sanal club coin. Para yatırma / çekme yok. Oyun Pragmatic Play’in resmi launch adresinde açılır.</p>
      {error && <p className="casino-error">{error}</p>}
      {status && !status.ready && (
        <div className="casino-missing">
          <strong>Pragmatic hesabı bağlı değil</strong>
          <p>{status.note}</p>
          <ul>
            {status.missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      <div className="casino-grid">
        {games.map((game) => (
          <article key={game.id} className="casino-card">
            <div className="casino-cover">
              {game.image ? <img src={game.image} alt="" /> : <Dices size={36} />}
            </div>
            <div className="casino-card-body">
              <small>{KIND_LABEL[game.kind]}</small>
              <h2>{game.title || 'Yapılandırılmadı'}</h2>
              <button type="button" disabled={busy} onClick={() => void openGame(game)}>
                <Play size={14} /> Oyna
              </button>
            </div>
          </article>
        ))}
      </div>

      {play && (
        <div className="casino-frame">
          <div className="casino-frame-bar">
            <strong>{play.title}</strong>
            <button type="button" onClick={closePlay} aria-label="Kapat"><X size={18} /></button>
          </div>
          <iframe title={play.title} src={play.url} allow="autoplay; fullscreen" />
        </div>
      )}
    </div>
  );
}
