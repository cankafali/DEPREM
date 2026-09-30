import type { Earthquake, Range } from '../api/types'

export const APP_NAME = 'Sismo'
export const AFAD_URL = 'https://deprem.afad.gov.tr'
export const afadEventUrl = (id: string) => `https://deprem.afad.gov.tr/event-detail/${encodeURIComponent(id)}`

export const t = {
  disclaimer: 'Bu uygulama resmi bir uyarı sistemi değildir. Resmi bilgi için',
  disclaimerShort: 'Resmi uyarı sistemi değildir. Veri:',
  live: 'Canlı',
  offline: 'Bağlantı yok',
  connecting: 'Bağlanıyor',
  lastSync: 'Son senkron',
  ranges: { '24h': 'Son 24 saat', '7d': '7 gün', '30d': '30 gün' } satisfies Record<Range, string>,
  rangesShort: { '24h': '24 saat', '7d': '7 gün', '30d': '30 gün' } satisfies Record<Range, string>,
  timeRange: 'Zaman aralığı',
  minMag: 'En az büyüklük',
  province: 'İl',
  provinceSearch: 'İl ara...',
  allProvinces: 'Tüm iller',
  nearMe: 'Yakınımdakiler',
  nearMeShort: 'Yakınımda',
  nearActive: (km: number, fromMe: boolean) => `${fromMe ? 'Konumunun' : 'Seçilen noktanın'} ${km} km çevresi`,
  locating: 'Konum alınıyor...',
  geoDenied:
    'Konum izni verilmedi. Haritada bir noktaya uzun basarak da arama yapabilirsin.',
  geoUnavailable: 'Konum alınamadı. Haritada bir noktaya uzun basarak da arama yapabilirsin.',
  pickHint: 'Haritada bir noktaya uzun bas ya da sağ tıkla: o nokta merkez olur.',
  clear: 'Kaldır',
  radius: 'Yarıçap',
  sortBy: 'Sırala',
  sortTime: 'Zaman',
  sortMagnitude: 'Büyüklük',
  summary: (n: number, max?: number) =>
    n === 0 ? 'Deprem yok' : `${n.toLocaleString('tr-TR')} deprem${max !== undefined ? `, en büyüğü ${fmtMag(max)}` : ''}`,
  hourly: 'saatlik',
  daily: 'günlük',
  emptyTitle: 'Bu filtrelerle deprem yok.',
  emptyBody: 'En az büyüklüğü düşürmeyi ya da zaman aralığını genişletmeyi dene.',
  resetFilters: 'Filtreleri sıfırla',
  apiDown: (ago: string | null) =>
    `Canlı bağlantı kesildi${ago ? `, veriler ${ago} güncellendi` : ''}. Yeniden deneniyor.`,
  loadError: 'Veriler yüklenemedi. Yeniden deneniyor.',
  afadDown: (ago: string) => `AFAD'a şu an ulaşılamıyor. Son başarılı senkron ${ago}. Son veriler gösteriliyor.`,
  showMore: (n: number) => `${n} deprem daha göster`,
  close: 'Kapat',
  depth: 'Derinlik',
  coordinates: 'Koordinat',
  distanceFromYou: 'Senden uzaklık',
  distanceFromPoint: 'Seçilen noktaya',
  revised: 'Revize edildi',
  revisedTimes: (n: number) => `${n} kez`,
  nearbyWeek: 'Bu bölgede son 7 gün',
  nearbyWeekHint: '50 km içinde',
  viewOnAfad: "AFAD'da görüntüle",
  copyLink: 'Bağlantıyı kopyala',
  copied: 'Bağlantı kopyalandı',
  newQuake: 'Yeni deprem',
  notFound: 'Bu deprem bulunamadı. Son 30 günün dışında kalmış olabilir.',
  map: 'Deprem haritası',
  listLabel: 'Depremler',
  sheetExpand: 'Listeyi genişlet',
  sheetCollapse: 'Listeyi daralt',
  depthShort: (km: number) => `${fmtNum(km, km < 10 ? 1 : 0)} km derinlik`,
}

const numFmt = new Map<number, Intl.NumberFormat>()
export function fmtNum(n: number, digits = 1): string {
  let f = numFmt.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    numFmt.set(digits, f)
  }
  return f.format(n)
}

/** Magnitude is always shown with one decimal and a dot, the way AFAD and the press write it. */
export const fmtMag = (m: number) => m.toFixed(1)

const TZ = 'Europe/Istanbul'
const dateFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const hourFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' })

/** "30 Eylül 2026, 14:21:07" in Türkiye time. */
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${dateFmt.format(d)}, ${timeFmt.format(d)}`
}
export const fmtTime = (iso: string | Date) => timeFmt.format(typeof iso === 'string' ? new Date(iso) : iso)
export const fmtHour = (iso: string) => hourFmt.format(new Date(iso))
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso))

/** "şimdi", "12 dk önce", "3 sa önce", "2 gün önce" (short) or long words for the detail panel. */
export function fmtRelative(iso: string, now: number, long = false): string {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return long ? 'az önce' : 'şimdi'
  if (min < 60) return long ? `${min} dakika önce` : `${min} dk önce`
  const h = Math.floor(min / 60)
  if (h < 24) return long ? `${h} saat önce` : `${h} sa önce`
  const d = Math.floor(h / 24)
  return `${d} gün önce`
}

/** "Sındırgı, Balıkesir" when AFAD's text is just "Sındırgı (Balıkesir)", otherwise AFAD's own text. */
export function fmtPlace(q: Pick<Earthquake, 'location' | 'district' | 'province'>): string {
  if (q.district && q.province && q.location === `${q.district} (${q.province})`) {
    return `${q.district}, ${q.province}`
  }
  return q.location
}

export function fmtDistance(km: number): string {
  return km < 10 ? `${fmtNum(km, 1)} km` : `${fmtNum(Math.round(km), 0)} km`
}
