# MOD CLUB

Kulüp verisi tarayıcıda durmaz. Üyeler, banner, sohbet, çekiliş ve kurulum **Railway PostgreSQL** üzerindedir.

Variable yazmana gerek yok. `PORT` ve `DATABASE_URL` otomatik gelir. Sunucu `0.0.0.0` ve **8080** (veya Railway’in verdiği port) dinler.

Bu repo **tek sitedir**. `@workspace/mod-club`, `api-server`, `db` ayrı uygulamalar değildir. Railway 6 kutu gösterirse onları açma.

## Sıfırdan kurulum (Railway)

1. Eski denemede 6 servis çıktıysa o projeyi sil (`thriving-recreation` gibi).
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → **`yamann0101/modclub`**
3. 6 kutu ve **Apply 34 changes** gelirse kapat / uygulama. İstenen: **modclub** + **Postgres**.
4. Tek web servisi kalsın. Root Directory boş.
5. Postgres yoksa **+** → **Database** → **PostgreSQL**. `DATABASE_URL` kendiliğinden bağlanır.
6. **Generate Domain** → siteyi aç → kurulum sihirbazını bir kez tamamla.

Elle port, şifre veya variable yazma.
