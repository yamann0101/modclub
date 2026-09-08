function svgData(markup: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

const LION = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1468"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="168" r="86" fill="#f59e0b"/><circle cx="320" cy="168" r="58" fill="#fbbf24"/><circle cx="298" cy="158" r="8" fill="#1f2937"/><circle cx="342" cy="158" r="8" fill="#1f2937"/><path d="M292 186c18 18 38 18 56 0" fill="none" stroke="#7c2d12" stroke-width="6" stroke-linecap="round"/><path d="M214 150c18-62 54-86 106-86s88 24 106 86c-28-18-66-24-106-24s-78 6-106 24z" fill="#d97706"/><text x="320" y="312" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="36" fill="#fde68a">ASLAN</text></svg>`);

const DRAGON = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f1d1d"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><path d="M120 250c40-90 90-140 170-150 20 40 10 80-10 110 48-10 100 8 150 50-40 10-90 8-130-10-8 28-6 60 8 92-58-18-110-40-188-92z" fill="#dc2626"/><circle cx="278" cy="128" r="14" fill="#fde68a"/><circle cx="282" cy="126" r="6" fill="#111827"/><path d="M430 168c40-8 86 10 122 46-54 8-96 4-122-10z" fill="#b91c1c"/><text x="320" y="312" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="36" fill="#fecaca">DRAGON</text></svg>`);

const MERMAID = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="118" r="42" fill="#f8c7ae"/><path d="M278 118c8-48 84-48 92 0-18 8-74 8-92 0z" fill="#fbbf24"/><path d="M286 156c8 70 60 70 68 0" fill="#f8c7ae"/><path d="M300 220c-8 40 20 78 70 86-48-4-92 18-120 46 8-54 18-96 50-132z" fill="#22d3ee"/><text x="320" y="318" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="28" fill="#a5f3fc">DENİZ KIZI</text></svg>`);

export const DAILY_PRIZES = [
  { id: "aslan", title: "Aslan Çekilişi", prizeText: "500.000 coin", coins: 500_000, image: LION },
  { id: "dragon", title: "Dragon Çekilişi", prizeText: "2.000.000 coin", coins: 2_000_000, image: DRAGON },
  { id: "mermaid", title: "Deniz Kızı Çekilişi", prizeText: "10.000.000 coin", coins: 10_000_000, image: MERMAID },
] as const;
