/**
 * RoadGuard CAD & GIS Studio — Structured & Versioned VN-2000 Central Meridian Catalog
 * ====================================================================================
 * Single Source of Truth (SSOT) for all 34 provincial-level administrative units of Vietnam
 * effective 01/07/2025 across two official legal reference tables:
 *
 * 1. Administrative Map Table (Bản đồ hành chính cấp tỉnh):
 *    - Circular: Thông tư số 24/2025/TT-BNNMT ngày 20/06/2025 của Bộ trưởng Bộ Nông nghiệp và Môi trường
 *    - Provision: Điều 13 khoản 16 & Phụ lục kèm theo (thay thế Phụ lục B QCVN 80:2024/BTNMT kèm Thông tư 28/2024/TT-BTNMT)
 *    - Official Gazette: Công báo số 937 + 938 ngày 20/07/2025 (trang 15–16), đối chiếu khớp 100% với bản ký đóng dấu đỏ
 *    - Effective Date: 01/07/2025
 *
 * 2. Cadastral Map Table (Bản đồ địa chính):
 *    - Circular: Thông tư số 23/2025/TT-BNNMT ngày 20/06/2025 của Bộ trưởng Bộ Nông nghiệp và Môi trường
 *    - Provision: Khoản 5 Điều 8 sửa đổi, bổ sung Phụ lục số 01 kèm theo Thông tư số 26/2024/TT-BTNMT
 *    - Official Copy: Bản ký đóng dấu đỏ ngày 20/06/2025 (trang 23–24) trên Cổng TTĐT Chính phủ & Cục Quy hoạch và Phát triển tài nguyên đất
 *    - Effective Date: 01/07/2025
 *
 * Engineering Safety Notes:
 * - Degree–minute display strings (e.g. "107°45′"), Vietnamese decimal labels ("107,75°"), and API decimal strings ("107.75")
 *   are derived deterministically from the single numeric meridian value in each province record.
 * - Pre-merger former province names are intentionally NOT aliased into post-merger provinces so historical DXF drawings
 *   are never silently assigned a post-merger province's central meridian.
 */

export const VN2000_SURVEY_PRIORITY_GUIDANCE =
  'Giá trị tra cứu dùng để tham khảo. Khi xử lý DXF, ưu tiên CRS ghi trong hồ sơ khảo sát.'

export const VN2000_CATALOG_METADATA = Object.freeze({
  schemaVersion: '1.0.0',
  catalogVersion: '2025.07.1',
  unitCount: 34,
  effectiveDate: '2025-07-01',
  verifiedAt: '2026-11-07',
  guidance: VN2000_SURVEY_PRIORITY_GUIDANCE,
  tables: Object.freeze({
    administrative: Object.freeze({
      id: 'administrative',
      label: 'Bản đồ hành chính',
      shortLabel: 'Hành chính',
      documentNumber: '24/2025/TT-BNNMT',
      issuedDate: '2025-06-20',
      effectiveDate: '2025-07-01',
      verifiedAt: '2026-11-07',
      sourceTitle:
        'Phụ lục Quy định về kinh tuyến trục của bản đồ hành chính cấp tỉnh kèm theo Thông tư số 24/2025/TT-BNNMT (Công báo số 937 + 938 ngày 20/07/2025)',
      sourceUrl:
        'https://congbao.chinhphu.vn/tai-ve-van-ban-so-24-2025-tt-bnnmt-45474-57513',
      replacesNote:
        'Thay thế Phụ lục B của QCVN 80:2024/BTNMT ban hành kèm theo Thông tư số 28/2024/TT-BTNMT ngày 29/11/2024',
    }),
    cadastral: Object.freeze({
      id: 'cadastral',
      label: 'Bản đồ địa chính',
      shortLabel: 'Địa chính',
      documentNumber: '23/2025/TT-BNNMT',
      issuedDate: '2025-06-20',
      effectiveDate: '2025-07-01',
      verifiedAt: '2026-11-07',
      sourceTitle:
        'Phụ lục số 01 Danh sách kinh tuyến trục sử dụng cho các tỉnh, thành phố trực thuộc Trung ương (sửa đổi, bổ sung tại khoản 5 Điều 8 Thông tư số 23/2025/TT-BNNMT)',
      sourceUrl:
        'https://www.ppd.gov.vn/FileUpload/Documents/23_2025_ttbnnmt_phan_cap_ve_dat_dai.pdf',
      replacesNote:
        'Sửa đổi, bổ sung Phụ lục số 01 ban hành kèm theo Thông tư số 26/2024/TT-BTNMT ngày 26/11/2024',
    }),
  }),
})

/**
 * Canonical 34 provincial-level units (28 provinces + 6 centrally-governed cities).
 * Sorted in exact order of the Appendix of Circular 24/2025/TT-BNNMT (Vietnamese alphabetical order),
 * while also recording the exact row index (stt) in each official appendix.
 */
export const VN2000_PROVINCE_CRS_CATALOG = Object.freeze([
  {
    provinceId: 'an-giang',
    displayName: 'An Giang',
    shortAliases: [],
    administrative: { stt: 1, meridians: [104.75] },
    cadastral: { stt: 4, meridians: [104.5, 104.75] },
  },
  {
    provinceId: 'bac-ninh',
    displayName: 'Bắc Ninh',
    shortAliases: [],
    administrative: { stt: 2, meridians: [107.0] },
    cadastral: { stt: 17, meridians: [105.5, 107.0] },
  },
  {
    provinceId: 'ca-mau',
    displayName: 'Cà Mau',
    shortAliases: [],
    administrative: { stt: 3, meridians: [104.5] },
    cadastral: { stt: 5, meridians: [104.5, 105.0] },
  },
  {
    provinceId: 'cao-bang',
    displayName: 'Cao Bằng',
    shortAliases: [],
    administrative: { stt: 4, meridians: [105.75] },
    cadastral: { stt: 21, meridians: [105.75] },
  },
  {
    provinceId: 'dak-lak',
    displayName: 'Đắk Lắk',
    shortAliases: ['Đắc Lắc'],
    administrative: { stt: 5, meridians: [108.5] },
    cadastral: { stt: 34, meridians: [108.5] },
  },
  {
    provinceId: 'dien-bien',
    displayName: 'Điện Biên',
    shortAliases: [],
    administrative: { stt: 6, meridians: [103.0] },
    cadastral: { stt: 2, meridians: [103.0] },
  },
  {
    provinceId: 'dong-nai',
    displayName: 'Đồng Nai',
    shortAliases: [],
    administrative: { stt: 7, meridians: [107.75] },
    cadastral: { stt: 23, meridians: [106.25, 107.75] },
  },
  {
    provinceId: 'dong-thap',
    displayName: 'Đồng Tháp',
    shortAliases: [],
    administrative: { stt: 8, meridians: [105.0] },
    cadastral: { stt: 10, meridians: [105.0, 105.75] },
  },
  {
    provinceId: 'gia-lai',
    displayName: 'Gia Lai',
    shortAliases: [],
    administrative: { stt: 9, meridians: [108.25] },
    cadastral: { stt: 33, meridians: [108.25, 108.5] },
  },
  {
    provinceId: 'ha-tinh',
    displayName: 'Hà Tĩnh',
    shortAliases: [],
    administrative: { stt: 10, meridians: [105.5] },
    cadastral: { stt: 16, meridians: [105.5] },
  },
  {
    provinceId: 'hung-yen',
    displayName: 'Hưng Yên',
    shortAliases: [],
    administrative: { stt: 11, meridians: [105.5] },
    cadastral: { stt: 18, meridians: [105.5] },
  },
  {
    provinceId: 'khanh-hoa',
    displayName: 'Khánh Hòa',
    shortAliases: ['Khánh Hoà'],
    administrative: { stt: 12, meridians: [108.25] },
    cadastral: { stt: 32, meridians: [108.25] },
  },
  {
    provinceId: 'lai-chau',
    displayName: 'Lai Châu',
    shortAliases: [],
    administrative: { stt: 13, meridians: [104.75] },
    cadastral: { stt: 1, meridians: [103.0] },
  },
  {
    provinceId: 'lang-son',
    displayName: 'Lạng Sơn',
    shortAliases: [],
    administrative: { stt: 14, meridians: [107.25] },
    cadastral: { stt: 27, meridians: [107.25] },
  },
  {
    provinceId: 'lao-cai',
    displayName: 'Lào Cai',
    shortAliases: [],
    administrative: { stt: 15, meridians: [104.75] },
    cadastral: { stt: 6, meridians: [104.75] },
  },
  {
    provinceId: 'lam-dong',
    displayName: 'Lâm Đồng',
    shortAliases: [],
    administrative: { stt: 16, meridians: [107.75] },
    cadastral: { stt: 31, meridians: [107.75, 108.5] },
  },
  {
    provinceId: 'nghe-an',
    displayName: 'Nghệ An',
    shortAliases: [],
    administrative: { stt: 17, meridians: [104.75] },
    cadastral: { stt: 7, meridians: [104.75] },
  },
  {
    provinceId: 'ninh-binh',
    displayName: 'Ninh Bình',
    shortAliases: [],
    administrative: { stt: 18, meridians: [105.0] },
    cadastral: { stt: 13, meridians: [105.0, 105.5] },
  },
  {
    provinceId: 'phu-tho',
    displayName: 'Phú Thọ',
    shortAliases: [],
    administrative: { stt: 19, meridians: [104.75] },
    cadastral: { stt: 8, meridians: [104.75, 105.0, 106.0] },
  },
  {
    provinceId: 'quang-ngai',
    displayName: 'Quảng Ngãi',
    shortAliases: [],
    administrative: { stt: 20, meridians: [108.0] },
    cadastral: { stt: 28, meridians: [107.5, 108.0] },
  },
  {
    provinceId: 'quang-ninh',
    displayName: 'Quảng Ninh',
    shortAliases: [],
    administrative: { stt: 21, meridians: [107.75] },
    cadastral: { stt: 29, meridians: [107.75] },
  },
  {
    provinceId: 'quang-tri',
    displayName: 'Quảng Trị',
    shortAliases: [],
    administrative: { stt: 22, meridians: [106.0] },
    cadastral: { stt: 24, meridians: [106.0, 106.25] },
  },
  {
    provinceId: 'son-la',
    displayName: 'Sơn La',
    shortAliases: [],
    administrative: { stt: 23, meridians: [104.0] },
    cadastral: { stt: 3, meridians: [104.0] },
  },
  {
    provinceId: 'tay-ninh',
    displayName: 'Tây Ninh',
    shortAliases: [],
    administrative: { stt: 24, meridians: [105.75] },
    cadastral: { stt: 19, meridians: [105.5, 105.75] },
  },
  {
    provinceId: 'thai-nguyen',
    displayName: 'Thái Nguyên',
    shortAliases: [],
    administrative: { stt: 25, meridians: [106.5] },
    cadastral: { stt: 25, meridians: [106.5] },
  },
  {
    provinceId: 'thanh-hoa',
    displayName: 'Thanh Hóa',
    shortAliases: ['Thanh Hoá'],
    administrative: { stt: 26, meridians: [105.0] },
    cadastral: { stt: 9, meridians: [105.0] },
  },
  {
    provinceId: 'tp-can-tho',
    displayName: 'Thành phố Cần Thơ',
    shortAliases: ['TP. Cần Thơ', 'TP Cần Thơ', 'Cần Thơ'],
    administrative: { stt: 27, meridians: [105.0] },
    cadastral: { stt: 11, meridians: [105.0, 105.5] },
  },
  {
    provinceId: 'tp-da-nang',
    displayName: 'Thành phố Đà Nẵng',
    shortAliases: ['TP. Đà Nẵng', 'TP Đà Nẵng', 'Đà Nẵng'],
    administrative: { stt: 28, meridians: [107.75] },
    cadastral: { stt: 30, meridians: [107.75] },
  },
  {
    provinceId: 'tp-ha-noi',
    displayName: 'Thành phố Hà Nội',
    shortAliases: ['TP. Hà Nội', 'TP Hà Nội', 'Hà Nội'],
    administrative: { stt: 29, meridians: [105.0] },
    cadastral: { stt: 12, meridians: [105.0] },
  },
  {
    provinceId: 'tp-hai-phong',
    displayName: 'Thành phố Hải Phòng',
    shortAliases: ['TP. Hải Phòng', 'TP Hải Phòng', 'Hải Phòng'],
    administrative: { stt: 30, meridians: [105.75] },
    cadastral: { stt: 15, meridians: [105.5, 105.75] },
  },
  {
    provinceId: 'tp-ho-chi-minh',
    displayName: 'Thành phố Hồ Chí Minh',
    shortAliases: ['TP. Hồ Chí Minh', 'TP Hồ Chí Minh', 'TP.HCM', 'TPHCM', 'Hồ Chí Minh'],
    administrative: { stt: 31, meridians: [105.75] },
    cadastral: { stt: 22, meridians: [105.75, 107.75] },
  },
  {
    provinceId: 'tp-hue',
    displayName: 'Thành phố Huế',
    shortAliases: ['TP. Huế', 'TP Huế', 'Huế'],
    administrative: { stt: 32, meridians: [107.0] },
    cadastral: { stt: 26, meridians: [107.0] },
  },
  {
    provinceId: 'tuyen-quang',
    displayName: 'Tuyên Quang',
    shortAliases: [],
    administrative: { stt: 33, meridians: [106.0] },
    cadastral: { stt: 14, meridians: [105.5, 106.0] },
  },
  {
    provinceId: 'vinh-long',
    displayName: 'Vĩnh Long',
    shortAliases: [],
    administrative: { stt: 34, meridians: [105.5] },
    cadastral: { stt: 20, meridians: [105.5, 105.75] },
  },
])

/**
 * Formats a numeric meridian (e.g. 107.75) into degree–minute notation ("107°45′")
 * using Unicode prime U+2032.
 */
export function formatMeridianDegreeMinute(meridianNumeric) {
  const num = Number(meridianNumeric)
  if (!Number.isFinite(num)) return ''
  const totalMinutes = Math.round(num * 60)
  const degrees = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes - degrees * 60
  return `${degrees}°${String(minutes).padStart(2, '0')}′`
}

/**
 * Formats a numeric meridian into API decimal string ("107.75").
 */
export function formatMeridianApiDecimal(meridianNumeric) {
  const num = Number(meridianNumeric)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(2)
}

/**
 * Formats a numeric meridian into Vietnamese comma-decimal display string ("107,75°").
 */
export function formatMeridianViDecimal(meridianNumeric) {
  const api = formatMeridianApiDecimal(meridianNumeric)
  return api ? `${api.replace('.', ',')}°` : ''
}

/**
 * Normalizes Vietnamese text and meridian notation for loose, resilient search:
 * - Converts Đ/đ -> d, strips NFD combining marks
 * - Collapses extra whitespace
 * - Preserves digits, dots, commas, degrees, and primes via token normalization
 */
export function normalizeVn2000SearchText(input) {
  if (input == null) return ''
  return String(input)
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[′’'`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchIndexTokens(option) {
  const numericCm = Number(option.cmNumeric ?? option.cm)
  const apiDec = formatMeridianApiDecimal(numericCm) // "107.75"
  const viDec = apiDec.replace('.', ',') // "107,75"
  const trimmedDot = String(numericCm) // "107.75" or "105" or "108.5"
  const trimmedComma = trimmedDot.replace('.', ',') // "107,75" or "108,5"
  const dmsPrime = formatMeridianDegreeMinute(numericCm) // "107°45′"
  const dmsAscii = dmsPrime.replace('′', "'") // "107°45'"
  const dmsPlain = dmsAscii.replace(/[°']/g, ' ').replace(/\s+/g, ' ').trim() // "107 45"
  const dmsCompact = dmsAscii.replace("'", '') // "107°45"

  const rawParts = [
    option.provinceName,
    ...(option.shortAliases || []),
    option.tableLabel,
    option.tableShortLabel,
    option.documentNumber,
    option.label,
    apiDec,
    `${apiDec}°`,
    viDec,
    `${viDec}°`,
    trimmedDot,
    trimmedComma,
    dmsPrime,
    dmsAscii,
    dmsCompact,
    dmsPlain,
  ].filter(Boolean)

  return normalizeVn2000SearchText(rawParts.join(' | '))
}

function buildTableOptions(tableType) {
  const tableMeta = VN2000_CATALOG_METADATA.tables[tableType]
  const prefix = tableType === 'cadastral' ? 'cad' : 'adm'
  const options = []

  for (const prov of VN2000_PROVINCE_CRS_CATALOG) {
    const spec = prov[tableType]
    const meridians = spec.meridians
    meridians.forEach((cmNumeric, idx) => {
      const cm = formatMeridianApiDecimal(cmNumeric)
      const dms = formatMeridianDegreeMinute(cmNumeric)
      const viDecimal = formatMeridianViDecimal(cmNumeric)
      const primaryTitle = `${prov.displayName} · ${dms} (${viDecimal})`
      const label = `${primaryTitle} — ${tableMeta.shortLabel}`
      const opt = {
        id: `${prefix}:${prov.provinceId}:${cm}`,
        provinceId: prov.provinceId,
        provinceName: prov.displayName,
        shortAliases: prov.shortAliases,
        tableType,
        tableLabel: tableMeta.label,
        tableShortLabel: tableMeta.shortLabel,
        documentNumber: tableMeta.documentNumber,
        appendixStt: spec.stt,
        cmNumeric,
        cm,
        dms,
        viDecimal,
        k0: 0.9999,
        zone: '3deg',
        meridianCountInTable: meridians.length,
        meridianIndexInTable: idx + 1,
        primaryTitle,
        label,
      }
      opt.searchIndex = buildSearchIndexTokens(opt)
      options.push(Object.freeze(opt))
    })
  }

  return Object.freeze(options)
}

export const VN2000_ADMINISTRATIVE_OPTIONS = buildTableOptions('administrative')
export const VN2000_CADASTRAL_OPTIONS = buildTableOptions('cadastral')

export const VN2000_ZONE6_OPTIONS = Object.freeze(
  [
    {
      id: 'vn-6deg-48',
      provinceId: 'zone-48n',
      provinceName: 'Múi chiếu 6° — Múi 48N',
      shortAliases: ['Zone 48N', 'Mui 6', 'Mui 48'],
      tableType: 'zone6',
      tableLabel: 'Múi chiếu 6° quốc gia',
      tableShortLabel: 'Múi 6°',
      documentNumber: 'VN-2000 6°',
      cmNumeric: 105.0,
      cm: '105.00',
      dms: formatMeridianDegreeMinute(105.0),
      viDecimal: formatMeridianViDecimal(105.0),
      k0: 0.9996,
      zone: '6deg',
      meridianCountInTable: 1,
      meridianIndexInTable: 1,
      primaryTitle: `Múi 6° (Zone 48N) · ${formatMeridianDegreeMinute(105.0)} (${formatMeridianViDecimal(105.0)})`,
      label: `Múi 6° (Zone 48N) · ${formatMeridianDegreeMinute(105.0)} (${formatMeridianViDecimal(105.0)})`,
    },
    {
      id: 'vn-6deg-49',
      provinceId: 'zone-49n',
      provinceName: 'Múi chiếu 6° — Múi 49N',
      shortAliases: ['Zone 49N', 'Mui 6', 'Mui 49'],
      tableType: 'zone6',
      tableLabel: 'Múi chiếu 6° quốc gia',
      tableShortLabel: 'Múi 6°',
      documentNumber: 'VN-2000 6°',
      cmNumeric: 111.0,
      cm: '111.00',
      dms: formatMeridianDegreeMinute(111.0),
      viDecimal: formatMeridianViDecimal(111.0),
      k0: 0.9996,
      zone: '6deg',
      meridianCountInTable: 1,
      meridianIndexInTable: 1,
      primaryTitle: `Múi 6° (Zone 49N) · ${formatMeridianDegreeMinute(111.0)} (${formatMeridianViDecimal(111.0)})`,
      label: `Múi 6° (Zone 49N) · ${formatMeridianDegreeMinute(111.0)} (${formatMeridianViDecimal(111.0)})`,
    },
  ].map((opt) =>
    Object.freeze({
      ...opt,
      searchIndex: buildSearchIndexTokens(opt),
    })
  )
)

export const DEFAULT_VN2000_PRESET_ID = 'adm:tp-ho-chi-minh:105.75'

/**
 * Legacy preset IDs used prior to 34-province standardization.
 * Every legacy ID resolves deterministically without altering its numeric L₀ or k₀,
 * preventing empty dropdown states or unintended changes to existing defaults.
 */
export const VN2000_LEGACY_PRESET_REDIRECTS = Object.freeze({
  'hcm-3deg': 'adm:tp-ho-chi-minh:105.75',
  'dni-3deg': 'adm:dong-nai:107.75',
  'hni-3deg': 'adm:tp-ha-noi:105.00',
  'hp-3deg': 'adm:tp-hai-phong:105.75',
  'tni-3deg': 'cad:tay-ninh:105.50',
  'btr-3deg': 'adm:quang-tri:106.00',
  'cmu-3deg': 'adm:ca-mau:104.50',
  'kh-3deg': 'adm:khanh-hoa:108.25',
  'gl-3deg': 'cad:gia-lai:108.50',
  'hue-3deg': 'adm:tp-hue:107.00',
  'na-3deg': 'adm:nghe-an:104.75',
  'qn-3deg': 'adm:quang-ninh:107.75',
})

export const ALL_VN2000_LOOKUP_OPTIONS = Object.freeze([
  ...VN2000_ADMINISTRATIVE_OPTIONS,
  ...VN2000_CADASTRAL_OPTIONS,
  ...VN2000_ZONE6_OPTIONS,
])

const OPTION_BY_ID = new Map(ALL_VN2000_LOOKUP_OPTIONS.map((opt) => [opt.id, opt]))

/**
 * Resolves a canonical or legacy preset ID to its concrete preset option object.
 * Returns null for 'custom', 'unconfigured', or unknown IDs.
 */
export function resolveVn2000Preset(presetId) {
  if (!presetId || presetId === 'custom' || presetId === 'unconfigured') {
    return null
  }
  const direct = OPTION_BY_ID.get(presetId)
  if (direct) return direct

  const canonicalId = VN2000_LEGACY_PRESET_REDIRECTS[presetId]
  if (canonicalId) {
    return OPTION_BY_ID.get(canonicalId) || null
  }
  return null
}

/**
 * Returns the options for a given lookup table ('administrative' | 'cadastral').
 */
export function getVn2000OptionsByTable(tableType = 'administrative') {
  return tableType === 'cadastral'
    ? VN2000_CADASTRAL_OPTIONS
    : VN2000_ADMINISTRATIVE_OPTIONS
}

/**
 * Filters a list of VN-2000 lookup options against a user query.
 * Supports:
 * - Accented & unaccented Vietnamese names (including Đ/đ -> d)
 * - Extra internal/leading/trailing whitespace
 * - Dot or comma decimal notation ("107.75", "107,75")
 * - Degree–minute notation ("107°45′", "107°45'", "107°45")
 */
export function filterVn2000LookupOptions(options, rawQuery) {
  const normQ = normalizeVn2000SearchText(rawQuery)
  if (!normQ) return options

  // Also normalize degree/minute compact forms so e.g. "107° 45'" or "107o45" matches "107°45'"
  const compactAngleQ = normQ
    .replace(/\s*°\s*/g, '°')
    .replace(/\s*'\s*/g, "'")

  return options.filter((opt) => {
    const idx = opt.searchIndex || buildSearchIndexTokens(opt)
    if (idx.includes(normQ) || idx.includes(compactAngleQ)) {
      return true
    }
    return false
  })
}
