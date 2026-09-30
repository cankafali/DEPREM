# Canlı Deprem Haritası — Tasarım ve Teknik Spesifikasyon

> **Claude Code için not:** Bu doküman projenin tek doğruluk kaynağıdır. Belirsiz bir nokta olursa en sade çözümü seç ve kararını `DECISIONS.md` dosyasına tek satırla yaz. `{SÜSLÜ_PARANTEZ}` içindekiler yer tutucudur. Proje bir monorepo: `api/` (ASP.NET Core) ve `web/` (React). Harici veri kaynağının (AFAD) davranışını **varsayma, önce gerçek bir istekle doğrula** (bkz. bölüm 3).

---

## 1. Amaç ve Ton

Türkiye'deki depremleri AFAD verisiyle harita üzerinde canlı gösteren, filtrelenebilir, mobilde rahat kullanılan bir uygulama. Portfolyoda şu soruya cevap veriyor: **"Bu kişi uçtan uca, gerçek veriyle çalışan bir sistem kurabilir mi?"** Backend (veri çekme, saklama, API, gerçek zamanlı yayın) ve frontend (harita, filtre, durum yönetimi) birlikte görünür.

**Ton kuralı:** Deprem bu ülkede ağır bir konu. Arayüz sakin, bilgilendirici ve ciddi olmalı. Alarm sesi, titreyen ekran, kırmızı yanıp sönen uyarılar, "Şok!" dili **yok**. Her ekranda şu not görünür: "Bu uygulama resmi bir uyarı sistemi değildir. Resmi bilgi için AFAD." (AFAD linkiyle).

Proje adı: `{PROJE_ADI}` (öneri: **Sismo**).

---

## 2. Mimari

```
 AFAD apiv2 ──(60 sn'de bir)──▶ SyncService ──upsert──▶ SQLite (EF Core)
                                     │                        │
                                     │ yeni/güncellenen       │ sorgu
                                     ▼                        ▼
                               SignalR Hub ◀────────── Minimal API (REST)
                                     │                        │
                                     └──── WebSocket ───┐  ┌── HTTP ──┘
                                                        ▼  ▼
                                                   React (web/)
```

Frontend AFAD'a **asla doğrudan** gitmez. Tüm veri kendi API'mizden geçer: önbellek, filtreleme, CORS sorunu yok, AFAD'a gereksiz yük yok.

### 2.1 Teknoloji yığını

| Katman | Seçim |
|---|---|
| Backend | **ASP.NET Core** (güncel LTS sürüm), Minimal API, C# |
| Veri | **EF Core + SQLite** (tek dosya, deploy kolay) |
| Arka plan işi | `BackgroundService` + `PeriodicTimer` |
| HTTP istemci | Typed `HttpClient` + `Microsoft.Extensions.Http.Resilience` (retry, timeout, circuit breaker) |
| Gerçek zamanlı | **SignalR** |
| API dokümanı | `Microsoft.AspNetCore.OpenApi` + Scalar arayüzü (`/docs`) |
| Test | **xUnit** + `WebApplicationFactory` entegrasyon testleri |
| Frontend | **React + Vite + TypeScript** (strict) |
| Harita | **MapLibre GL JS** + **OpenFreeMap** vektör karoları (API anahtarı gerekmez) |
| Veri çekme | **TanStack Query** |
| Gerçek zamanlı istemci | `@microsoft/signalr` |
| Stil | **CSS Modules** + `tokens.css` (Tailwind yok) |
| Grafik | Kütüphane yok, küçük el yazımı SVG bileşenleri |
| CI | GitHub Actions: `dotnet test` + `npm run build` + lint |
| Deploy | API: Docker ile **Render** ya da **Fly.io** ücretsiz katman. Web: **Vercel** |

---

## 3. Veri Kaynağı: AFAD

- Uç noktalar: `https://deprem.afad.gov.tr/apiv2/event/filter` (filtreli) ve `https://deprem.afad.gov.tr/apiv2/event/latest` (son olaylar).
- `filter` için `start` ve `end` zorunlu (`YYYY-MM-DDThh:mm:ss`). Sıralama için `orderby=timedesc`, bölge için `minlat/maxlat/minlon/maxlon`, tekil olay için `eventid` parametreleri var. Büyüklük ve limit parametrelerini resmi dokümandan doğrula: `https://deprem.afad.gov.tr/event-service`.
- **İlk iş:** Gerçek bir istek at, dönen JSON'u `api/docs/afad-sample.json` olarak kaydet ve eşleyiciyi (`AfadMapper`) bu örneğe göre yaz. Alan adlarını tahmin etme. Beklenen alanlar kabaca: olay kimliği, tarih, enlem, boylam, derinlik, büyüklük, büyüklük tipi (ML/Mw), il, ilçe, konum metni, güncellenme bilgisi.
- Tarihlerin saat dilimini doğrula (UTC mi, Türkiye saati mi) ve veritabanında **her zaman UTC** sakla.
- AFAD aynı depremin büyüklüğünü sonradan revize edebilir; güncellemeyi yakala (bkz. 4.2).
- AFAD'a nazik ol: senkron 60 saniyede bir, tek istek, makul `User-Agent` (`{PROJE_ADI}/1.0 (+{REPO_URL})`).

---

## 4. Backend (`api/`)

### 4.1 Model

```csharp
public class Earthquake
{
    public string Id { get; set; }            // AFAD olay kimliği, PK
    public DateTime OccurredAtUtc { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double DepthKm { get; set; }
    public double Magnitude { get; set; }
    public string MagnitudeType { get; set; } // ML, Mw ...
    public string? Province { get; set; }
    public string? District { get; set; }
    public string Location { get; set; }      // AFAD'ın konum metni
    public DateTime UpdatedAtUtc { get; set; }
    public int Revision { get; set; }         // kaç kez güncellendi
}
```
İndeksler: `OccurredAtUtc`, `Magnitude`, `Province`.

### 4.2 SyncService

- Açılışta veritabanı boşsa son **30 günü** doldur (tek sorguda gelmezse günlük parçalar halinde).
- Sonra 60 sn'de bir **son 3 saatlik** pencereyi çek (geç gelen ve revize edilen kayıtları yakalamak için).
- Her kayıt için: yoksa ekle → `QuakeAdded` yayını. Varsa ve büyüklük/konum değişmişse güncelle, `Revision++` → `QuakeUpdated` yayını. Aynıysa dokunma.
- 30 günden eski kayıtları günde bir sil.
- AFAD hata verirse logla, bir sonraki turu bekle; servis asla çökmez. Son başarılı senkron zamanı bellekte tutulur ve `/health`'te görünür.

### 4.3 REST uç noktaları

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/api/earthquakes` | Liste. Parametreler: `range` (`24h`, `7d`, `30d`, varsayılan `24h`), `minMag` (0–9), `province`, `lat` + `lon` + `radiusKm` (en fazla 500), `sort` (`time`, `magnitude`), `limit` (varsayılan 500, en fazla 2000) |
| GET | `/api/earthquakes/{id}` | Tek deprem |
| GET | `/api/stats?range=24h` | Toplam sayı, en büyük deprem, büyüklük aralığına göre dağılım, saatlik/günlük sayılar, en çok deprem olan 5 il |
| GET | `/api/provinces` | Veride geçen il listesi (arama önerisi için) |
| GET | `/health` | Durum, son senkron zamanı, kayıt sayısı |

- Yarıçap filtresi: önce enlem/boylam kutusuyla SQL'de daralt, sonra **Haversine** ile C#'ta kesinleştir. Yanıtta her kayda `distanceKm` eklenir.
- Geçersiz parametre → `400` + `ProblemDetails`, Türkçe/İngilizce değil sade İngilizce hata mesajı.
- Output caching: liste ve istatistik 30 sn; yeni deprem gelince önbellek etiketi temizlenir.
- Rate limiting: IP başına dakikada 60 istek.
- CORS: yalnızca web'in üretim alan adı ve `localhost:5173`.

### 4.4 SignalR

- Hub: `/hubs/quakes`
- Olaylar: `QuakeAdded(EarthquakeDto)`, `QuakeUpdated(EarthquakeDto)`.
- İstemci filtre bilgisini sunucuya göndermez; filtreleme istemcide yapılır (veri küçük).

### 4.5 Testler

- `AfadMapperTests`: `afad-sample.json` doğru eşleniyor, eksik alanlar çökertmiyor, saat dilimi doğru.
- `HaversineTests`: bilinen iki şehir arası mesafe ±1 km.
- `SyncServiceTests`: sahte istemciyle ekleme, güncelleme (revizyon), değişmeyen kayıt senaryoları.
- `EarthquakesEndpointTests` (`WebApplicationFactory`, bellek içi SQLite): filtreler, sınır değerler, 400 durumları.

---

## 5. Tasarım Sistemi (`web/`)

### 5.1 Konsept

Kaynak malzeme **sismograf kâğıdı**: ince ızgara, tek renk mürekkep çizgisi, ölçek işaretleri. Harita sakin ve soluk, renkli olan tek şey depremlerin kendisi. Cesaretin harcandığı tek yer: **üst çubukta akan canlı sismograf çizgisi**. Normalde neredeyse düz akar; yeni bir deprem geldiğinde büyüklüğüyle orantılı tek bir sapma çizer ve o sapmanın üstünde deprem etiketi belirir. Başka hiçbir şey kendi kendine hareket etmez.

### 5.2 Renkler

```css
:root {
  --paper:     #F5F6F4;  /* zemin: hafif yeşilimsi kâğıt beyazı */
  --grid:      #DDE2DC;  /* sismograf ızgarası, ayırıcılar */
  --ink:       #1E2A2F;  /* ana metin, sismograf çizgisi */
  --ink-soft:  #56656B;  /* ikincil metin */
  --focus:     #2F6FEB;  /* odak halkası, seçili öğe, linkler */

  /* Büyüklük ölçeği: sıralı, renk körlüğüne dayanıklı (açıktan koyuya + boyut farkı) */
  --m-lt2:  #A9B8C0;     /* M < 2 */
  --m-2:    #7E9AA8;     /* 2.0 – 2.9 */
  --m-3:    #E3A13B;     /* 3.0 – 3.9 */
  --m-4:    #D9642A;     /* 4.0 – 4.9 */
  --m-5:    #A8232B;     /* 5.0 + */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #151C1F; --grid: #26322F; --ink: #E4E9E6; --ink-soft: #97A5A2; --focus: #7FA8FF;
  }
}
```
Renk tek başına anlam taşımaz: her depremin yanında büyüklük sayısı yazılı, haritadaki daire boyutu da büyüklükle artar.

Harita stili: OpenFreeMap "positron" benzeri soluk stil; açık temada gri tonlar, koyu temada koyu stil. Etiketler Türkçe (`name:tr` varsa onu kullan).

### 5.3 Tipografi

- Tek aile: **Geologica** (`@fontsource-variable/geologica`). Yer bilimi çağrışımlı adı dışında, sayılar için net, geniş bir sans.
- Tüm sayılar (büyüklük, derinlik, saat, mesafe) `font-variant-numeric: tabular-nums`.
- Büyüklük değeri her yerde görsel ağırlığı en yüksek sayı: listede `1.5rem / 600`, detay panelinde `3rem / 600`.
- Ölçek: `0.8125 / 0.9375 / 1.0625 / 1.5 / 2.25 / 3 rem`. Büyük harfli etiket yok, `→` ekli buton yok.

### 5.4 Hareket

- `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--dur: 200ms`.
- Yeni deprem haritada **bir kez** genişleyip sönen bir halka çizer (1.2s), sonra durur. Sürekli nabız atan nokta yok.
- `prefers-reduced-motion`: sismograf çizgisi statik, halka animasyonu yok.

---

## 6. Ekranlar

### 6.1 Masaüstü yerleşimi (≥ 1024px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sismo   ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿╱╲∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿   ● Canlı   Son senkron 14:32:05    │ ← 56px, sismograf çizgisi
├───────────────────────────┬──────────────────────────────────────────────────┤
│ Son 24 saat  7 gün  30 gün│                                                  │
│ En az büyüklük  ──●────  2│                                                  │
│ [ İl ara...            ]  │                                                  │
│ [ Yakınımdakiler ]        │                    HARİTA                        │
├───────────────────────────┤                                                  │
│ 142 deprem, en büyüğü 4.1 │                                                  │
│ ▁▂▁▃▂▁▅▂▁▁▂▃▁▂▁ (saatlik) │                                                  │
├───────────────────────────┤                                                  │
│ Sırala: Zaman | Büyüklük  │                                                  │
│ 3.4  Sındırgı, Balıkesir  │                                                  │
│      12 dk önce, 8 km     │                                                  │
│ 2.1  ...                  │                                                  │
│ (kaydırılabilir liste)    │                                                  │
├───────────────────────────┴──────────────────────────────────────────────────┤
│ Resmi uyarı sistemi değildir. Veri: AFAD.                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Sol panel 380px sabit, harita kalan alanı doldurur.
- Liste satırı: solda büyüklük (renkli küçük daire + sayı), sağda konum ve "12 dk önce, 8 km derinlik". Göreli zaman her dakika güncellenir; üzerine gelince tam tarih (`Europe/Istanbul`) görünür.
- Listede bir satırın üzerine gelmek haritadaki dairesini vurgular, haritadaki daireye gelmek liste satırını vurgular.
- Tıklama: harita o noktaya uçar (`flyTo`, 600ms), sağda detay paneli açılır.

### 6.2 Detay paneli

```
 ┌──────────────────────────────┐
 │ 4.1  Mw                  [×] │
 │ Sındırgı, Balıkesir          │
 │ 30 Eylül 2026, 14:21:07      │
 │ 23 dakika önce               │
 │                              │
 │ Derinlik       7.2 km        │
 │ Koordinat      39.21, 28.18  │
 │ Senden uzaklık 184 km        │  ← yalnızca konum izni verildiyse
 │ Revize edildi  1 kez         │  ← Revision > 0 ise
 │                              │
 │ Bu bölgede son 7 gün: 12     │
 │ AFAD'da görüntüle            │
 │ Bağlantıyı kopyala           │
 └──────────────────────────────┘
```
Örnekteki yer ve değerler yalnızca yerleşimi göstermek içindir.

### 6.3 Mobil (< 768px)

- Harita tam ekran. Altta **sürüklenebilir alt panel** (bottom sheet) üç konumda durur: kapalı (yalnızca özet satırı "142 deprem, en büyüğü 4.1"), yarım, tam.
- Filtreler üstte tek satır yatay çipler: `24 saat`, `M2+`, `İl`, `Yakınımda`. Çipe dokununca küçük bir panel açılır.
- Detay, alt panelin içinde açılır; geri hareketi (tarayıcı geri tuşu) detayı kapatır.

### 6.4 Durumlar

- **Yükleniyor:** Harita iskelet zemini + listede 6 gri satır iskeleti. Dönen çark yok.
- **Boş sonuç:** "Bu filtrelerle deprem yok. En az büyüklüğü düşürmeyi ya da zaman aralığını genişletmeyi dene." + "Filtreleri sıfırla" butonu.
- **API'ye ulaşılamıyor:** Üstte ince bir şerit: "Canlı bağlantı kesildi, veriler 3 dk önce güncellendi. Yeniden deneniyor." Son veri gösterilmeye devam eder.
- **SignalR koptu:** Üst çubuktaki `● Canlı` göstergesi gri `○ Bağlantı yok` olur; otomatik yeniden bağlanır.
- **Konum izni reddedildi:** "Yakınımdakiler" için "Konum izni verilmedi. Haritada bir noktaya uzun basarak da arama yapabilirsin." Haritaya uzun basmak / sağ tıklamak o noktayı merkez alır.

---

## 7. Canlı Davranış

- Sayfa açıkken `QuakeAdded` gelince: kayıt TanStack Query önbelleğine eklenir, aktif filtreye uyuyorsa listenin başına kayarak girer ve haritada halka animasyonu oynar, sismograf çizgisi sapma çizer.
- **M ≥ 3.0** olan yeni depremler için sağ üstte sakin bir bildirim: "Yeni deprem: 3.4, Sındırgı (Balıkesir)". 6 sn sonra kaybolur, tıklanınca detaya gider. Ses yok.
- Sekme arka plandayken gelen depremler sayılır; sekme başlığı `(2) Sismo` olur, geri dönünce sıfırlanır.
- `QuakeUpdated`: kayıt yerinde güncellenir, detay açıksa "Revize edildi" satırı belirir.

---

## 8. URL ve Paylaşım

Tüm filtre durumu URL'de: `/?range=7d&minMag=3&province=Malatya` ve seçili deprem `/?q={id}`. Link kopyalanıp açıldığında aynı görünüm gelir. Harita konumu URL'ye yazılmaz (gürültü yapar).

---

## 9. Erişilebilirlik

- Harita görsel bir tamamlayıcı; **tüm bilgi listede de var**. Ekran okuyucu kullanıcı yalnızca listeyle eksiksiz kullanabilmeli.
- Liste `role="list"`, satırlar buton; ok tuşlarıyla gezilebilir.
- Yeni deprem duyurusu `aria-live="polite"` bölgesiyle, yalnızca M ≥ 3.0 için.
- Kontrast WCAG AA; `--m-3` rengi açık zeminde metin olarak kullanılmaz, yalnızca daire dolgusu.
- Odak halkası `2px solid var(--focus)`.

---

## 10. Performans

- MapLibre büyük; harita bileşeni `React.lazy` ile ayrı parça, liste ve filtreler haritayı beklemeden görünür.
- Depremler haritada tek GeoJSON kaynağı + `circle` katmanı olarak çizilir (DOM marker **değil**), 2000 noktada akıcı kalır.
- 30 günlük görünümde yakınlaştırma düşükken kümeleme (`cluster: true`).
- Lighthouse mobil: Performans ≥ 90 (harita yüzünden 100 beklenmiyor), Erişilebilirlik 100.

---

## 11. Klasör Yapısı

```
/
├─ api/
│  ├─ Sismo.Api/
│  │  ├─ Program.cs
│  │  ├─ Data/            AppDbContext.cs, Migrations/
│  │  ├─ Domain/          Earthquake.cs, Geo.cs (Haversine)
│  │  ├─ Afad/            AfadClient.cs, AfadDto.cs, AfadMapper.cs
│  │  ├─ Sync/            SyncService.cs
│  │  ├─ Endpoints/       EarthquakeEndpoints.cs, StatsEndpoints.cs, HealthEndpoints.cs
│  │  ├─ Realtime/        QuakesHub.cs
│  │  └─ Dockerfile
│  ├─ Sismo.Tests/
│  └─ docs/afad-sample.json
├─ web/
│  └─ src/
│     ├─ api/             client.ts, types.ts, useEarthquakes.ts, useStats.ts, useLiveQuakes.ts
│     ├─ components/      Seismograph.tsx, FilterPanel.tsx, QuakeList.tsx, QuakeRow.tsx,
│     │                   QuakeDetail.tsx, StatsStrip.tsx, HourlyBars.tsx, BottomSheet.tsx, Toast.tsx
│     ├─ map/             QuakeMap.tsx, layers.ts, mapStyle.ts
│     ├─ hooks/           useUrlFilters.ts, useRelativeTime.ts, useGeolocation.ts
│     ├─ styles/          tokens.css, global.css
│     └─ i18n/            tr.ts (arayüz Türkçe; İngilizce opsiyonel, sonraya)
├─ .github/workflows/ci.yml
├─ DECISIONS.md
└─ README.md
```

---

## 12. README (portfolyo için kritik)

Mülakatçı önce README'yi okur. İçermesi gerekenler: canlı demo linki ve ekran görüntüsü/GIF, mimari diyagram (bölüm 2'deki), kullanılan teknolojiler, **"Karşılaştığım problemler"** bölümü (AFAD'ın revize ettiği kayıtlar, saat dilimi, yarıçap sorgusunun iki aşamalı yapılması gibi gerçek kararlar), yerelde çalıştırma adımları, test komutu. `{KİŞİSEL NOTLAR}` kısmını site sahibi kendi yazacak.

---

## 13. Geliştirme Sırası

Her aşama sonunda çalışan bir commit.

1. **Veri keşfi:** AFAD'a gerçek istek, `afad-sample.json`, `AfadMapper` + testleri.
2. **Backend çekirdeği:** EF Core + SQLite, SyncService (ilk doldurma + periyodik), `/api/earthquakes`, `/health`, OpenAPI.
3. **Frontend iskeleti:** Vite + TS, tokens, liste + filtreler (harita olmadan), URL senkronu.
4. **Harita:** MapLibre, GeoJSON katmanı, liste-harita eşleşmesi, detay paneli.
5. **Canlılık:** SignalR hub + istemci, bildirim, sismograf çizgisi, sekme başlığı sayacı.
6. **Kalan özellikler:** Yakınımdakiler, istatistikler, mobil alt panel, tüm boş/hata durumları.
7. **Cila ve yayın:** Testlerin tamamı, CI, Docker, Render/Fly.io + Vercel deploy, README, Lighthouse.

---

## 14. Kabul Kriterleri

- [ ] Yeni bir deprem AFAD'da yayınlandıktan en geç ~90 sn sonra açık sayfada görünüyor, sayfa yenilemeden.
- [ ] Revize edilen büyüklük listede ve detayda güncelleniyor.
- [ ] Filtreli URL kopyalanıp yeni sekmede açıldığında aynı sonuçlar geliyor.
- [ ] Mobilde (375px) harita, alt panel ve filtreler tek elle kullanılabiliyor.
- [ ] AFAD erişilemezken uygulama çökmüyor, son veriyi ve durumu gösteriyor.
- [ ] Liste tek başına (harita olmadan) tüm bilgiyi veriyor, klavyeyle gezilebiliyor.
- [ ] Hiçbir ekranda ses, titreşim ya da yanıp sönen kırmızı uyarı yok; resmi uyarı notu her ekranda görünüyor.
- [ ] `dotnet test` yeşil, CI yeşil, README'de canlı demo linki var.
