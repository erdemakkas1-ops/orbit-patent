# ORBIT V1

ORBIT, Türkçe varsayılan ve İngilizce destekli, açık erişimli patent keşif ve AI analiz uygulamasıdır. Kullanıcılar hesap açmadan patent keşfedebilir, hedefli arama yapabilir, patent detaylarını inceleyebilir ve doğal dille proje araması çalıştırabilir.

## Teknoloji yığını

- Next.js 16 App Router ve React 19
- Strict TypeScript
- Tailwind CSS 4
- Zod doğrulama
- OpenAI Responses API Structured Outputs
- EPO OPS OAuth ve XML adapter'ı
- Node test runner

API rotaları açıkça Node.js runtime kullanır. Uygulama yerel dosya sistemine, Windows yollarına veya kalıcı işlem belleğine bağımlı veri saklamaz. Process içi cache performans içindir ve replica'lar arasında paylaşılmaz.

## Yerel geliştirme

Node.js 22.12+ veya 24 LTS önerilir.

```sh
npm install
npm run dev
```

Uygulama `http://localhost:3000` üzerinde açılır ve `/tr` rotasına yönlenir. Mock mod varsayılandır ve API anahtarı gerektirmez.

## Ortam değişkenleri

Değişkenleri yerelde `.env.local`, Vercel'de Project Settings → Environment Variables alanında tanımlayın. Secret değerlerine `NEXT_PUBLIC_` öneki eklemeyin.

| Değişken                  | Değer                | Gerekli olduğu durum                    |
| ------------------------- | -------------------- | --------------------------------------- |
| `NEXT_PUBLIC_APP_URL`     | Public URL           | İsteğe bağlı canonical/OG base URL      |
| `PATENT_PROVIDER`         | `mock` veya `epo`    | İsteğe bağlı, varsayılan `mock`         |
| `EPO_OPS_CONSUMER_KEY`    | Secret               | Production'da `PATENT_PROVIDER=epo` ise |
| `EPO_OPS_CONSUMER_SECRET` | Secret               | Production'da `PATENT_PROVIDER=epo` ise |
| `AI_PROVIDER`             | `mock` veya `openai` | İsteğe bağlı, varsayılan `mock`         |
| `OPENAI_API_KEY`          | Secret               | Production'da `AI_PROVIDER=openai` ise  |
| `OPENAI_MODEL`            | Model adı            | İsteğe bağlı, varsayılan `gpt-4.1-mini` |

`NEXT_PUBLIC_APP_URL`; yoksa Vercel'in sağladığı `VERCEL_PROJECT_PRODUCTION_URL` veya `VERCEL_URL`, canonical, Open Graph, robots ve sitemap URL'leri için kullanılır. Yerelde güvenli fallback `http://localhost:3000` değeridir.

Merkezi Zod doğrulaması geçersiz provider değerlerini ve production'da eksik credentials durumunu yakalar. Development ortamında secret içermeyen bir uyarı ve mock fallback kullanılır. Production ortamında seçilmiş canlı provider eksik yapılandırılmışsa sessiz mock fallback yapılmaz; kullanıcı güvenli unavailable durumu görür.

## Provider modları

### Mock

```env
PATENT_PROVIDER=mock
AI_PROVIDER=mock
```

On sentetik patent, deterministik discovery sıralaması, arama, patent detayları ve örnek AI analizleri sağlar.

### EPO

```env
PATENT_PROVIDER=epo
EPO_OPS_CONSUMER_KEY=...
EPO_OPS_CONSUMER_SECRET=...
```

OAuth ve published-data arama/bibliyografik detay çağrıları sabit EPO hostuna gider. İstekler zaman aşımlı, durum ve XML content-type kontrollüdür. CQL girdileri temizlenir; detay identifier'ı yalnız güvenli patent numarası formatında kabul edilir. Token, key, secret ve ham XML loglanmaz veya API yanıtına dönmez.

EPO uygulama onayı halen beklenmektedir. Canlı credentials bu çalışma alanında denenmemiştir. Family, drawings ve ayrıntılı legal events entegrasyonu M9 kapsamındadır.

### OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Responses API Structured Outputs ve Zod şemaları kullanılır. İstekler 25 saniye zaman aşımı, tek retry, token bütçesi ve `store:false` ile çalışır. Raw model yanıtı, stack trace veya provider hatası kullanıcıya gösterilmez.

## Kullanıcı rotaları

- `/tr`, `/en`: ana sayfa
- `/[locale]/discover`: kategori, durum ve dönem bazlı keşif
- `/[locale]/patents`: keyword, patent identifier, CPC/IPC, yıl ve durum araması
- `/[locale]/patents/[id]`: patent detayı ve güvenli AI analizi
- `/[locale]/ai-search`: doğal dille proje araması

Tüm V1 kullanıcı rotaları auth, abonelik ve ödeme olmadan açıktır. `/api/*` rotaları robots tarafından engellenir. Mock patent detayları production sitemap'e eklenmez.

## API ve güvenlik sınırı

- `GET /api/patents`
- `GET /api/patents/[id]`
- `POST /api/ai`
- `GET /api/health`

API girdileri Zod ile doğrulanır. AI gövdesi 16 KiB ve proje metni 10–3000 karakterle sınırlıdır. Hatalar yalnız `INVALID_INPUT`, `NOT_FOUND`, `RATE_LIMITED` veya `SERVICE_UNAVAILABLE` gibi sabit kodlar döndürür. Raw XML, OpenAI çıktısı, OAuth hatası, env değeri ve stack trace yanıtlanmaz.

Security headers: `X-Content-Type-Options`, `Referrer-Policy` ve `X-Frame-Options`. Remote image wildcard'ı yoktur; V1 çizimleri yerel `next/image` varlıklarıdır.

AI endpoint'i production'da IP başına process içi 60 saniyelik pencerede 20 istekle sınırlıdır. Development ve test ortamında bu koruma engelleyici değildir; çoklu instance dağıtımında Vercel/gateway seviyesinde paylaşımlı limit eklenmelidir.

## Proje yapısı

- `src/app`: App Router sayfaları, metadata, API ve sistem rotaları
- `src/components`: layout, form, patent kartları ve tekrar kullanılabilir UI
- `src/lib`: provider adapter'ları, doğrulama, cache, AI safety ve SEO
- `src/data`: deterministik mock patent ve AI verileri
- `tests`: domain, güvenlik, provider, metadata ve release sınırı testleri

## Cache

- EPO arama: 5 dakika
- EPO detay: 30 dakika
- AI analiz: development 2 dakika, production 24 saat
- Mock discovery: uzak istek yapmadığı için ayrıca cache edilmez

Cache anahtarları deterministik oluşturulur. Provider, locale, patent/query, sayfa, filtre ve analiz tipi ilgili katmanda ayrılır. Hatalı promise sonuçları AI cache'de tutulmaz.

## Test ve build

```sh
npm run test
npm run typecheck
npm run build
npm start
```

CI ortamında kilitli bağımlılıklar için `npm ci` kullanın.

## Vercel deployment

1. Repository'yi Vercel projesine bağlayın.
2. Framework preset olarak Next.js kullanın.
3. Önce `PATENT_PROVIDER=mock` ve `AI_PROVIDER=mock` ile deploy edin.
4. Canlı provider kullanacaksanız ilgili production secret'larını Vercel Environment Variables içine ekleyin.
5. Build komutunu `npm run build` olarak bırakın.
6. Deploy sonrası aşağıdaki smoke testleri çalıştırın.

Uygulamada Windows yolu, localhost upstream'i, runtime dosya yazımı veya yerel credential bağımlılığı yoktur. EPO XML parser, OAuth için `Buffer` ve OpenAI SDK nedeniyle API rotaları Node.js runtime kullanır.

## Release smoke testleri

1. `/tr` ana sayfası açılır.
2. `/tr/discover` açılır.
3. Discovery kategori filtresi URL'yi günceller ve sonuçları filtreler.
4. Patent Ara içinde keyword araması çalışır.
5. `EP1000000A1` ve `US6808849` identifier olarak algılanır.
6. Geçerli patent detay sayfası açılır.
7. Mock modda AI proje araması sonuç üretir.
8. TR → EN geçişi mevcut yol ve query parametrelerini korur.
9. Filtreli sayfa yenilendiğinde URL durumu korunur.
10. Geçersiz patent kimliği 404 veya güvenli hata durumu gösterir.
11. Production'da `PATENT_PROVIDER=epo` ve eksik key, mock veri göstermeden güvenli unavailable sonucu verir.
12. Production'da `AI_PROVIDER=openai` ve eksik key, mock analiz göstermeden güvenli unavailable sonucu verir.

## Release checklist

- [ ] EPO account approved
- [ ] EPO credentials configured
- [ ] `PATENT_PROVIDER=epo`
- [ ] EPO live search smoke test
- [ ] EPO patent detail smoke test
- [ ] Production OpenAI key configured
- [ ] AI smoke test
- [ ] Vercel env configured
- [x] Production build passed
- [x] Mobile checked
- [x] TR/EN checked
- [ ] Domain configured
- [ ] Final release

## Bilinen sınırlar

- Mock kayıtlar gerçek patent değildir.
- EPO onayı ve canlı credential testi beklenmektedir.
- EPO legal status, family ve drawings alanları henüz genişletilmemiştir.
- Prototip maliyetleri doğrulanmış piyasa fiyatı değildir.
- Process içi rate limit ve cache, çoklu Vercel instance arasında paylaşılmaz. Yüksek trafik için harici rate limit/cache gerekir.
- Patent analizleri hukuki tavsiye veya freedom-to-operate görüşü değildir.
