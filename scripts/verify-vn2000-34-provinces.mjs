import assert from 'node:assert/strict'
import {
  VN2000_CATALOG_METADATA,
  VN2000_PROVINCE_CRS_CATALOG,
  VN2000_ADMINISTRATIVE_OPTIONS,
  VN2000_CADASTRAL_OPTIONS,
  VN2000_ZONE6_OPTIONS,
  VN2000_REFERENCE_PRESETS,
  VN2000_LEGACY_PRESET_REDIRECTS,
  DEFAULT_VN2000_PRESET_ID,
  VN2000_SURVEY_PRIORITY_GUIDANCE,
  resolveVn2000Preset,
  filterVn2000LookupOptions,
  formatMeridianDegreeMinute,
  formatMeridianApiDecimal,
  formatMeridianViDecimal,
} from '../src/utils/roadEngineeringBuilder.js'

/**
 * Independent Reference Oracle transcribed verbatim from:
 * 1) Phụ lục Thông tư số 24/2025/TT-BNNMT ngày 20/06/2025 (Công báo số 937+938 ngày 20/07/2025, trang 15–16)
 * 2) Phụ lục số 01 sửa đổi, bổ sung tại khoản 5 Điều 8 Thông tư số 23/2025/TT-BNNMT ngày 20/06/2025 (trang 24)
 */
const OFFICIAL_ADMIN_APPENDIX_TT24 = [
  [1, 'An Giang', '104°45′'],
  [2, 'Bắc Ninh', '107°00′'],
  [3, 'Cà Mau', '104°30′'],
  [4, 'Cao Bằng', '105°45′'],
  [5, 'Đắk Lắk', '108°30′'],
  [6, 'Điện Biên', '103°00′'],
  [7, 'Đồng Nai', '107°45′'],
  [8, 'Đồng Tháp', '105°00′'],
  [9, 'Gia Lai', '108°15′'],
  [10, 'Hà Tĩnh', '105°30′'],
  [11, 'Hưng Yên', '105°30′'],
  [12, 'Khánh Hòa', '108°15′'],
  [13, 'Lai Châu', '104°45′'],
  [14, 'Lạng Sơn', '107°15′'],
  [15, 'Lào Cai', '104°45′'],
  [16, 'Lâm Đồng', '107°45′'],
  [17, 'Nghệ An', '104°45′'],
  [18, 'Ninh Bình', '105°00′'],
  [19, 'Phú Thọ', '104°45′'],
  [20, 'Quảng Ngãi', '108°00′'],
  [21, 'Quảng Ninh', '107°45′'],
  [22, 'Quảng Trị', '106°00′'],
  [23, 'Sơn La', '104°00′'],
  [24, 'Tây Ninh', '105°45′'],
  [25, 'Thái Nguyên', '106°30′'],
  [26, 'Thanh Hóa', '105°00′'],
  [27, 'Thành phố Cần Thơ', '105°00′'],
  [28, 'Thành phố Đà Nẵng', '107°45′'],
  [29, 'Thành phố Hà Nội', '105°00′'],
  [30, 'Thành phố Hải Phòng', '105°45′'],
  [31, 'Thành phố Hồ Chí Minh', '105°45′'],
  [32, 'Thành phố Huế', '107°00′'],
  [33, 'Tuyên Quang', '106°00′'],
  [34, 'Vĩnh Long', '105°30′'],
]

const OFFICIAL_CADASTRAL_APPENDIX_TT23 = [
  [1, 'Lai Châu', ['103°00′']],
  [2, 'Điện Biên', ['103°00′']],
  [3, 'Sơn La', ['104°00′']],
  [4, 'An Giang', ['104°30′', '104°45′']],
  [5, 'Cà Mau', ['104°30′', '105°00′']],
  [6, 'Lào Cai', ['104°45′']],
  [7, 'Nghệ An', ['104°45′']],
  [8, 'Phú Thọ', ['104°45′', '105°00′', '106°00′']],
  [9, 'Thanh Hóa', ['105°00′']],
  [10, 'Đồng Tháp', ['105°00′', '105°45′']],
  [11, 'Thành phố Cần Thơ', ['105°00′', '105°30′']],
  [12, 'Thành phố Hà Nội', ['105°00′']],
  [13, 'Ninh Bình', ['105°00′', '105°30′']],
  [14, 'Tuyên Quang', ['105°30′', '106°00′']],
  [15, 'Thành phố Hải Phòng', ['105°30′', '105°45′']],
  [16, 'Hà Tĩnh', ['105°30′']],
  [17, 'Bắc Ninh', ['105°30′', '107°00′']],
  [18, 'Hưng Yên', ['105°30′']],
  [19, 'Tây Ninh', ['105°30′', '105°45′']],
  [20, 'Vĩnh Long', ['105°30′', '105°45′']],
  [21, 'Cao Bằng', ['105°45′']],
  [22, 'Thành phố Hồ Chí Minh', ['105°45′', '107°45′']],
  [23, 'Đồng Nai', ['106°15′', '107°45′']],
  [24, 'Quảng Trị', ['106°00′', '106°15′']],
  [25, 'Thái Nguyên', ['106°30′']],
  [26, 'Thành phố Huế', ['107°00′']],
  [27, 'Lạng Sơn', ['107°15′']],
  [28, 'Quảng Ngãi', ['107°30′', '108°00′']],
  [29, 'Quảng Ninh', ['107°45′']],
  [30, 'Thành phố Đà Nẵng', ['107°45′']],
  [31, 'Lâm Đồng', ['107°45′', '108°30′']],
  [32, 'Khánh Hòa', ['108°15′']],
  [33, 'Gia Lai', ['108°15′', '108°30′']],
  [34, 'Đắk Lắk', ['108°30′']],
]

function parseIndependentDms(dmsStr) {
  const m = /^(\d{3})°(\d{2})′$/.exec(dmsStr)
  assert.ok(m, `Invalid reference DMS format: ${dmsStr}`)
  const deg = Number(m[1])
  const min = Number(m[2])
  return Number((deg + min / 60).toFixed(6))
}

console.log('='.repeat(72))
console.log('VN-2000 34-PROVINCE / CITY CATALOG & SEARCH VERIFICATION SUITE')
console.log('='.repeat(72))

let passed = 0
function check(name, fn) {
  fn()
  passed++
  console.log(`[PASS] ${name}`)
}

// 1. Metadata & Legal Source Provenance
check('1. Catalog metadata records version, effective date 2025-07-01, both Circulars, and exact guidance text', () => {
  assert.equal(VN2000_CATALOG_METADATA.unitCount, 34)
  assert.equal(VN2000_CATALOG_METADATA.effectiveDate, '2025-07-01')
  assert.equal(VN2000_CATALOG_METADATA.tables.administrative.documentNumber, '24/2025/TT-BNNMT')
  assert.equal(VN2000_CATALOG_METADATA.tables.cadastral.documentNumber, '23/2025/TT-BNNMT')
  assert.equal(
    VN2000_SURVEY_PRIORITY_GUIDANCE,
    'Giá trị tra cứu dùng để tham khảo. Khi xử lý DXF, ưu tiên CRS ghi trong hồ sơ khảo sát.'
  )
})

// 2. Unique IDs across provinces and all generated options
check('2. Exactly 34/34 provinces with zero duplicate provinceIds and zero duplicate option IDs', () => {
  assert.equal(VN2000_PROVINCE_CRS_CATALOG.length, 34)
  const provIds = new Set(VN2000_PROVINCE_CRS_CATALOG.map((p) => p.provinceId))
  assert.equal(provIds.size, 34, 'Duplicate provinceId detected')

  const admProvIds = new Set(VN2000_ADMINISTRATIVE_OPTIONS.map((o) => o.provinceId))
  const cadProvIds = new Set(VN2000_CADASTRAL_OPTIONS.map((o) => o.provinceId))
  assert.equal(admProvIds.size, 34, 'Administrative options must cover 34/34 provinces')
  assert.equal(cadProvIds.size, 34, 'Cadastral options must cover 34/34 provinces')

  const allOptionIds = VN2000_REFERENCE_PRESETS.map((o) => o.id)
  const uniqueOptionIds = new Set(allOptionIds)
  assert.equal(uniqueOptionIds.size, allOptionIds.length, 'Duplicate option ID detected')
  assert.equal(VN2000_ADMINISTRATIVE_OPTIONS.length, 34)
  const expectedCadOptionCount = OFFICIAL_CADASTRAL_APPENDIX_TT23.reduce((acc, [, , m]) => acc + m.length, 0)
  assert.equal(expectedCadOptionCount, 52)
  assert.equal(VN2000_CADASTRAL_OPTIONS.length, expectedCadOptionCount)
  assert.equal(VN2000_ZONE6_OPTIONS.length, 2)
})

// 3. Full 34/34 Cross-Verification against Official Administrative Table (TT 24/2025/TT-BNNMT)
check('3. 34/34 Administrative map meridians match Circular 24/2025/TT-BNNMT (Công báo) 100%', () => {
  assert.equal(OFFICIAL_ADMIN_APPENDIX_TT24.length, 34)
  for (const [stt, expectedName, expectedDms] of OFFICIAL_ADMIN_APPENDIX_TT24) {
    const expectedCm = parseIndependentDms(expectedDms)
    const entry = VN2000_PROVINCE_CRS_CATALOG.find((p) => p.displayName === expectedName)
    assert.ok(entry, `Missing administrative province: ${expectedName}`)
    assert.equal(entry.administrative.stt, stt, `STT mismatch for ${expectedName} in TT 24/2025`)
    assert.deepEqual(entry.administrative.meridians, [expectedCm], `Meridian mismatch for ${expectedName} in TT 24/2025`)

    const opt = VN2000_ADMINISTRATIVE_OPTIONS.find((o) => o.provinceName === expectedName)
    assert.ok(opt, `Missing administrative option for ${expectedName}`)
    assert.equal(opt.dms, expectedDms)
    assert.equal(opt.cm, expectedCm.toFixed(2))
    assert.equal(opt.primaryTitle, `${expectedName} · ${expectedDms} (${expectedCm.toFixed(2).replace('.', ',')}°)`)
  }
})

// 4. Full 34/34 Cross-Verification against Official Cadastral Table (TT 23/2025/TT-BNNMT)
check('4. 34/34 Cadastral map meridians (all 52 options) match Circular 23/2025/TT-BNNMT Appendix 01 100%', () => {
  assert.equal(OFFICIAL_CADASTRAL_APPENDIX_TT23.length, 34)
  for (const [stt, expectedName, expectedDmsList] of OFFICIAL_CADASTRAL_APPENDIX_TT23) {
    const expectedCms = expectedDmsList.map(parseIndependentDms)
    const entry = VN2000_PROVINCE_CRS_CATALOG.find((p) => p.displayName === expectedName)
    assert.ok(entry, `Missing cadastral province: ${expectedName}`)
    assert.equal(entry.cadastral.stt, stt, `STT mismatch for ${expectedName} in TT 23/2025`)
    assert.deepEqual(entry.cadastral.meridians, expectedCms, `Cadastral meridians mismatch for ${expectedName}`)

    const opts = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceName === expectedName)
    assert.equal(opts.length, expectedDmsList.length, `Option count mismatch for ${expectedName}`)
    opts.forEach((opt, i) => {
      assert.equal(opt.dms, expectedDmsList[i])
      assert.equal(opt.cm, expectedCms[i].toFixed(2))
      assert.equal(opt.meridianCountInTable, expectedDmsList.length)
      assert.equal(opt.meridianIndexInTable, i + 1)
    })
  }
})

// 5. Mandatory Quick Spot-Checks (Lâm Đồng, Khánh Hòa, Gia Lai, Đồng Nai + Lai Châu per-table difference)
check('5. Mandatory spot-checks: Lâm Đồng, Khánh Hòa, Gia Lai, Đồng Nai, and Lai Châu per-table preservation', () => {
  // Lâm Đồng: hành chính 107°45′, địa chính 107°45′ và 108°30′
  const ldAdm = VN2000_ADMINISTRATIVE_OPTIONS.filter((o) => o.provinceId === 'lam-dong')
  const ldCad = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceId === 'lam-dong')
  assert.deepEqual(ldAdm.map((o) => o.dms), ['107°45′'])
  assert.deepEqual(ldAdm.map((o) => o.cm), ['107.75'])
  assert.deepEqual(ldCad.map((o) => o.dms), ['107°45′', '108°30′'])
  assert.deepEqual(ldCad.map((o) => o.cm), ['107.75', '108.50'])

  // Khánh Hòa: 108°15′ ở cả hai bảng (không còn gộp Lâm Đồng, Bình Thuận)
  const khAdm = VN2000_ADMINISTRATIVE_OPTIONS.filter((o) => o.provinceId === 'khanh-hoa')
  const khCad = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceId === 'khanh-hoa')
  assert.deepEqual(khAdm.map((o) => o.dms), ['108°15′'])
  assert.deepEqual(khCad.map((o) => o.dms), ['108°15′'])
  assert.ok(!khAdm[0].primaryTitle.includes('Lâm Đồng'))

  // Gia Lai: hành chính 108°15′, địa chính có thêm 108°30′
  const glAdm = VN2000_ADMINISTRATIVE_OPTIONS.filter((o) => o.provinceId === 'gia-lai')
  const glCad = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceId === 'gia-lai')
  assert.deepEqual(glAdm.map((o) => o.dms), ['108°15′'])
  assert.deepEqual(glCad.map((o) => o.dms), ['108°15′', '108°30′'])

  // Đồng Nai: hành chính 107°45′, địa chính đủ 106°15′ và 107°45′
  const dnAdm = VN2000_ADMINISTRATIVE_OPTIONS.filter((o) => o.provinceId === 'dong-nai')
  const dnCad = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceId === 'dong-nai')
  assert.deepEqual(dnAdm.map((o) => o.dms), ['107°45′'])
  assert.deepEqual(dnCad.map((o) => o.dms), ['106°15′', '107°45′'])
  assert.deepEqual(dnCad.map((o) => o.cm), ['106.25', '107.75'])

  // Lai Châu: hai bảng khác nhau -> hành chính 104°45′, địa chính 103°00′
  const lcAdm = VN2000_ADMINISTRATIVE_OPTIONS.filter((o) => o.provinceId === 'lai-chau')
  const lcCad = VN2000_CADASTRAL_OPTIONS.filter((o) => o.provinceId === 'lai-chau')
  assert.deepEqual(lcAdm.map((o) => o.dms), ['104°45′'])
  assert.deepEqual(lcCad.map((o) => o.dms), ['103°00′'])
})

// 6. Search Matrix (accented, unaccented, Đ/đ -> d, extra spaces, comma/dot decimal, degree-minute)
check('6. Search queries match structured province & meridian fields accurately', () => {
  const checkSearch = (tableOpts, query, expectedProvinceId, expectedCm = null) => {
    const hits = filterVn2000LookupOptions(tableOpts, query)
    const matched = hits.some(
      (h) => h.provinceId === expectedProvinceId && (expectedCm === null || h.cm === expectedCm)
    )
    assert.ok(matched, `Query "${query}" failed to match ${expectedProvinceId} (${expectedCm ?? 'any'})`)
  }

  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, 'Lâm Đồng', 'lam-dong', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, 'lam dong', 'lam-dong', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, '   lam    dong  ', 'lam-dong', '107.75')
  checkSearch(VN2000_CADASTRAL_OPTIONS, 'dong nai', 'dong-nai', '106.25')
  checkSearch(VN2000_CADASTRAL_OPTIONS, 'dong nai', 'dong-nai', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, 'da nang', 'tp-da-nang', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, 'khanh hoa', 'khanh-hoa', '108.25')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, '107,75', 'lam-dong', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, '107.75', 'lam-dong', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, '107°45′', 'lam-dong', '107.75')
  checkSearch(VN2000_ADMINISTRATIVE_OPTIONS, "107°45'", 'lam-dong', '107.75')

  // Former pre-merger province names must NOT silently match a post-merger province
  for (const formerName of ['Bình Thuận', 'binh thuan', 'Bình Phước', 'Kon Tum', 'Ninh Thuận']) {
    const hits = filterVn2000LookupOptions(VN2000_ADMINISTRATIVE_OPTIONS, formerName)
    assert.equal(hits.length, 0, `Former province "${formerName}" must not auto-match a merged province`)
  }
})

// 7. Legacy ID & Default CRS Compatibility
check('7. Default preset and all legacy preset IDs resolve cleanly without changing numeric L₀ or k₀', () => {
  const def = resolveVn2000Preset(DEFAULT_VN2000_PRESET_ID)
  assert.ok(def)
  assert.equal(def.provinceName, 'Thành phố Hồ Chí Minh')
  assert.equal(def.cm, '105.75')
  assert.equal(def.k0, 0.9999)

  const expectedLegacyCms = {
    'hcm-3deg': '105.75',
    'dni-3deg': '107.75',
    'hni-3deg': '105.00',
    'hp-3deg': '105.75',
    'tni-3deg': '105.50',
    'btr-3deg': '106.00',
    'cmu-3deg': '104.50',
    'kh-3deg': '108.25',
    'gl-3deg': '108.50',
    'hue-3deg': '107.00',
    'na-3deg': '104.75',
    'qn-3deg': '107.75',
  }
  for (const [legacyId, expCm] of Object.entries(expectedLegacyCms)) {
    assert.ok(VN2000_LEGACY_PRESET_REDIRECTS[legacyId], `Missing redirect for ${legacyId}`)
    const resolved = resolveVn2000Preset(legacyId)
    assert.ok(resolved, `Failed to resolve legacy ID ${legacyId}`)
    assert.equal(resolved.cm, expCm, `Legacy ID ${legacyId} changed CM from ${expCm} to ${resolved.cm}`)
    assert.equal(resolved.k0, 0.9999)
  }

  assert.equal(resolveVn2000Preset('custom'), null)
  assert.equal(resolveVn2000Preset('unconfigured'), null)

  // Formatters derive from single numeric value
  assert.equal(formatMeridianDegreeMinute(107.75), '107°45′')
  assert.equal(formatMeridianApiDecimal(107.75), '107.75')
  assert.equal(formatMeridianViDecimal(107.75), '107,75°')
})

console.log('='.repeat(72))
console.log(`ALL ${passed}/7 VN-2000 34-PROVINCE VERIFICATION CHECKS PASSED (34/34 x 2 TABLES)`)
console.log('='.repeat(72))
