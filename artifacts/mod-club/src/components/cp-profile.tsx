import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Heart, HeartCrack, X } from 'lucide-react';
import { avatarFor } from '@/lib/club-store';
import { breakCp, fetchCp, requestCp, respondCp, type CpAsk, type CpState } from '@/lib/club-api';

export function CpProfileCard({ onNotice }: { onNotice: (text: string) => void }) {
  const [state, setState] = useState<CpState | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchCp().then(setState).catch(() => undefined);
  }, []);

  async function run(work: () => Promise<CpState>, ok: string, fail: Record<string, string>) {
    setBusy(true);
    try {
      setState(await work());
      onNotice(ok);
    } catch (err) {
      onNotice(fail[(err as Error).message] || 'İşlem olmadı');
    } finally {
      setBusy(false);
    }
  }

  function onAsk(event: FormEvent) {
    event.preventDefault();
    const nick = target.trim();
    if (!nick) return;
    void run(() => requestCp(nick), 'Sevgili isteği gitti', {
      missing: 'Bu nick bulunamadı',
      self: 'Kendine istek atamazsın',
      taken: 'Biriniz zaten sevgili',
      pending: 'Zaten bekleyen bir istek var',
    }).then(() => setTarget(''));
  }

  return (
    <section className="cp-card">
      <p className="cp-card-kicker">CP TAKI</p>
      <h3>Sevgili</h3>
      {state?.partner ? (
        <div className="cp-card-partner">
          <img src={avatarFor(state.partner.nick, state.partner.photo)} alt="" />
          <div>
            <strong>{state.partner.nick}</strong>
            <small>Sevgilin</small>
          </div>
          <button type="button" disabled={busy} onClick={() => void run(breakCp, 'CP bozuldu', {})}>
            <HeartCrack size={14} /> Ayrıl
          </button>
        </div>
      ) : (
        <p className="cp-card-empty">Henüz sevgilin yok. Nick yazıp istek at.</p>
      )}
      {!state?.partner && (
        <form className="cp-card-form" onSubmit={onAsk}>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Nick yaz" maxLength={32} />
          <button type="submit" disabled={busy || !target.trim()}><Heart size={14} /> İstek at</button>
        </form>
      )}
      {!!state?.outgoing.length && (
        <p className="cp-card-wait">Bekleyen istek: {state.outgoing.map((item) => item.toUser?.nick || item.to).join(', ')}</p>
      )}
      {!!state?.incoming.length && (
        <div className="cp-card-inbox">
          {state.incoming.map((item) => (
            <div key={item.id} className="cp-card-ask">
              <span><strong>{item.fromUser?.nick || item.from}</strong> sana istek attı</span>
              <button type="button" disabled={busy} onClick={() => void run(() => respondCp(item.id, true), 'Artık sevgilisiniz', { taken: 'Biri zaten sevgili' })}>Kabul</button>
              <button type="button" disabled={busy} onClick={() => void run(() => respondCp(item.id, false), 'İstek reddedildi', {})}>Red</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CpAskOverlay({ onNotice }: { onNotice: (text: string) => void }) {
  const [ask, setAsk] = useState<CpAsk | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const data = await fetchCp();
        if (!live) return;
        setAsk(data.incoming[0] || null);
      } catch {
        /* stay quiet */
      }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 800);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  async function answer(accept: boolean) {
    if (!ask || busy) return;
    setBusy(true);
    try {
      await respondCp(ask.id, accept);
      onNotice(accept ? `${ask.fromUser?.nick || ask.from} artık sevgilin` : 'İstek reddedildi');
      setAsk(null);
    } catch (err) {
      const code = (err as Error).message;
      onNotice(code === 'taken' ? 'Biri zaten sevgili' : 'İstek işlenemedi');
    } finally {
      setBusy(false);
    }
  }

  if (!ask) return null;
  const nick = ask.fromUser?.nick || ask.from;
  const photo = avatarFor(nick, ask.fromUser?.photo);

  return (
    <div className="cp-ask-overlay">
      <div className="cp-ask-card">
        <button type="button" className="cp-ask-close" aria-label="Kapat" onClick={() => void answer(false)}>
          <X size={16} />
        </button>
        <p className="cp-ask-kicker">CP İSTEĞİ</p>
        <div className="cp-ask-ring" aria-hidden>
          <i />
          <i />
          <i />
          <span className="cp-ask-gem" />
          <img src={photo} alt="" />
        </div>
        <h2>{nick}</h2>
        <p>Sana yüzük uzattı. Sevgili olmak ister misin?</p>
        <div className="cp-ask-actions">
          <button type="button" className="is-yes" disabled={busy} onClick={() => void answer(true)}>
            <Heart size={16} fill="currentColor" /> Kabul et
          </button>
          <button type="button" className="is-no" disabled={busy} onClick={() => void answer(false)}>
            Reddet
          </button>
        </div>
      </div>
    </div>
  );
}
