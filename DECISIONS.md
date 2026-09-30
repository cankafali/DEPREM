# Kararlar

Spesifikasyonun belirsiz bıraktığı ya da gerçek veriyle çeliştiği noktalarda verilen kararlar, her biri tek satır.

- AFAD `deprem.afad.gov.tr/apiv2` 302 ile `servisnet.afad.gov.tr/apigateway/deprem/apiv2` adresine yönlendiriyor; tek istek için doğrudan ikincisi kullanılıyor (`Afad:BaseUrl`).
- AFAD tarihleri ofsetsiz ama UTC (canlı akışta en son olay ve `lastUpdateDate` şu anki UTC'nin dakikalar gerisindeydi); `AssumeUniversal` ile okunuyor.
- AFAD `limit` parametresini `orderby`'dan önce uyguluyor (en eski kayıtları döndürüyor); `limit` hiç kullanılmıyor, 30 gün (~2.600 kayıt, ~1 MB) tek istekte geliyor.
- Tüm sayısal alanlar AFAD'dan string geliyor; DTO string tutuyor, eşleyici InvariantCulture ile ayrıştırıyor.
- `isEventUpdate: true` gelen kayıt ilk eklemede `Revision = 1` alıyor (AFAD zaten revize etmiş); sonraki her gözlenen değişiklik +1.
- "Değişti" sayılan alanlar: büyüklük, büyüklük tipi, enlem, boylam, derinlik, konum metni, il, ilçe.
- Büyüklük tipi normalize: `MW` → `Mw`; diğerleri olduğu gibi, boşsa `M`.
- İlk doldurma sırasında (boş DB) SignalR yayını yapılmıyor; binlerce mesaj yerine istemciler REST'ten yükler.
- `/api/stats`, liste ile aynı filtreleri (minMag, province, yarıçap) kabul ediyor; kenar paneldeki özet filtrelenmiş listeyle tutarlı olsun diye.
- Günlük seriler Türkiye takvim gününe göre (sabit UTC+3, 2016'dan beri yaz saati yok); tzdata bağımlılığı yok.
- İl filtresi bellekte `tr-TR` kültürüyle büyük/küçük harf duyarsız (SQLite `lower()` yalnızca ASCII); veri 30 günle sınırlı olduğu için maliyetsiz.
- Liste yanıtı zarf değil düz dizi; toplam sayı `/api/stats`'tan geliyor.
- Output cache `Origin` başlığına göre de ayrışıyor; aksi halde önbellekten dönen yanıt yanlış CORS başlığı taşıyabilir.
- Rate limit için `X-Forwarded-For` güveniliyor (Render/Fly proxy'si arkasında gerçek IP için); proxy'siz ortamda bu başlık taklit edilebilir.
- User-Agent `Sismo/1.0`; repo URL'si belli olunca `Afad:UserAgent` ayarına `(+{REPO_URL})` eklenmeli.
