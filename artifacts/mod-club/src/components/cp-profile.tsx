import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Heart, HeartCrack } from 'lucide-react';
import { avatarFor } from '@/lib/club-store';
import { breakCp, fetchCp, requestCp, respondCp, type CpState } from '@/lib/club-api';

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
