# MOD CLUB

Kulüp verisi tarayıcıda durmaz. Üyeler, banner, sohbet, çekiliş ve kurulum **Railway PostgreSQL** üzerindedir.

Variable yazmana gerek yok. `PORT` ve `DATABASE_URL` Railway’den otomatik gelir. Sunucu `0.0.0.0` ve **8080** (veya Railway’in verdiği port) dinler.

## Sıfırdan kurulum (Railway)

1. GitHub deposu: [github.com/yamann0101/modclub](https://github.com/yamann0101/modclub)
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `modclub`
3. Tek servis aç. **Root Directory boş kalsın** (repo kökü). `@workspace/mod-club` gibi paket seçme.
4. Aynı projede **New** → **Database** → **PostgreSQL**. Railway `DATABASE_URL` değişkenini kendisi ekler. Variables ekranına elle bir şey yazma.
5. Servise **Generate Domain** de.
6. Açılan adrese gir. İlk seferde kurulum sihirbazı gelir; admin hesabını oluştur. Bundan sonra sihirbaz kilitlenir.
7. Üyeler aynı adresten kayıt olur. Herkes aynı Postgres verisini görür.

Deploy takılırsa Postgres’in web servisine bağlı olduğuna bak: Postgres → Connect / Variable Reference → `DATABASE_URL`. Kendin port veya şifre yazma.

## Ne kurulur?

Tablolar ilk açılışta otomatik oluşur. Volume, `setup.json` veya tarayıcı hafızası kullanılmaz.
