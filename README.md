# MOD CLUB

İndir, kur, kullan. Replit veya başka bir platforma bağlı değildir.

## Yerel kurulum

Bilgisayarında [Node.js 20+](https://nodejs.org) olsun. Sonra:

**Windows:** `setup.bat` dosyasına çift tıkla.

**veya terminalde:**

```bash
node setup.mjs
```

Sihirbaz paketleri yükler, `.env` oluşturur ve uygulamayı açar.

Tarayıcı: [http://localhost:5173](http://localhost:5173)

Yerelde kurulum sihirbazı açılmaz; doğrudan giriş ekranı gelir.

Canlı sunucuda sihirbaz yalnızca ilk kurulumda bir kez çıkar. Sonraki dosya güncellemelerinde tekrar gelmez (`data/setup.json` silinmesin).

## Elle çalıştırma

```bash
pnpm install
pnpm dev
```

## Railway (GitHub)

1. Bu repoyu GitHub’a gönder.
2. Railway’de New Project → Deploy from GitHub repo.
3. Railway `pnpm run build` ve `start` komutlarını kendi çeker.

Gerekirse Railway’de `NODE_ENV=production` yeter. `PORT` Railway tarafından verilir.
