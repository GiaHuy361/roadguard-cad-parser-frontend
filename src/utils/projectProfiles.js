/**
 * Project Parameter Profiles (Bộ thông số dự án) for RoadGuard CAD & GIS Studio.
 *
 * Provides master technical dossier parameters (Sections 3 & 4) confirmed for each project.
 * Order of precedence for auto-filling inputs when a DXF drawing is loaded:
 *   1. Priority 1: Evidence-based value read authentically from DXF (highest precedence).
 *   2. Priority 2: Confirmed value from the currently active Project Parameter Profile.
 *   3. If neither source provides a value, left blank ("Chưa có dữ liệu") and flagged as missing.
 *
 * Supports conflict detection when DXF and Project Profile have differing numbers,
 * displaying both side-by-side with 1-click confirmation for the engineer.
 */

export const STORAGE_KEY_PROFILES = 'roadguard_project_profiles_v1'
export const STORAGE_KEY_ACTIVE_PROJECT = 'roadguard_active_project_id_v1'

export const SECTION_3_SPECS = [
  {
    key: 'roadWidth',
    label: 'Bề rộng mặt (B)',
    shortLabel: 'Bề rộng B',
    unit: 'm',
    step: '0.5',
    min: '1.0',
    max: '60.0',
    allowZero: false,
    description: 'Bề rộng mặt đường xe chạy theo hồ sơ thiết kế',
  },
  {
    key: 'laneCount',
    label: 'Số dải tấm ngang',
    shortLabel: 'Số dải tấm',
    unit: 'dải',
    step: '1',
    min: '1',
    max: '8',
    allowZero: false,
    description: 'Số dải phân chia tấm bê tông theo phương ngang mặt cắt',
  },
  {
    key: 'segmentLength',
    label: 'Bước cọc / Đoạn',
    shortLabel: 'Bước cọc',
    unit: 'm',
    step: '10',
    min: '10',
    max: '1000',
    allowZero: false,
    description: 'Cự ly cọc lý trình và chia đoạn quản lý thi công/khảo sát',
  },
  {
    key: 'slabLength',
    label: 'Chiều dài tấm BTXM',
    shortLabel: 'Chiều dài tấm',
    unit: 'm',
    step: '0.5',
    min: '1.0',
    max: '20.0',
    allowZero: false,
    description: 'Chiều dài một tấm bê tông xi măng tiêu chuẩn giữa hai khe co',
  },
]

export const SECTION_4_SPECS = [
  {
    key: 'slabThicknessCentimeters',
    label: 'Chiều dày tấm BTXM (cm)',
    shortLabel: 'Chiều dày tấm BTXM',
    unit: 'cm',
    allowZero: false,
    description: 'Chiều dày tấm bê tông xi măng theo hồ sơ thiết kế',
  },
  {
    key: 'contractionJointSpacingMeters',
    label: 'Cự ly khe co (m)',
    shortLabel: 'Cự ly khe co',
    unit: 'm',
    allowZero: false,
    description: 'Khoảng cách giữa các khe co ngang liên tiếp',
  },
  {
    key: 'expansionJointSpacingMeters',
    label: 'Cự ly khe giãn (m)',
    shortLabel: 'Cự ly khe giãn',
    unit: 'm',
    allowZero: false,
    description: 'Khoảng cách giữa các khe giãn nở (nếu thiết kế yêu cầu)',
  },
  {
    key: 'expansionJointGapMillimeters',
    label: 'Độ hở khe giãn (mm)',
    shortLabel: 'Độ hở khe giãn',
    unit: 'mm',
    allowZero: true,
    description: 'Độ hở chừa khe giãn nở bê tông xi măng',
  },
]

export const ALL_PARAM_SPECS = [...SECTION_3_SPECS, ...SECTION_4_SPECS]

/**
 * Predefined master project profiles with authentic parameters.
 * Marked as isTemplate: true to separate sample/template profiles from production profiles.
 */
export const DEFAULT_PROJECT_PROFILES = [
  {
    id: 'project-bao-loc-dt725',
    name: '[Mẫu kiểm thử] Dự án Nâng cấp ĐT.725 Bảo Lộc - Đạ Tẻh',
    code: 'DT725-BL',
    isTemplate: true,
    description: 'Bộ dữ liệu mẫu kiểm thử đối chiếu hồ sơ kỹ thuật ĐT.725 Bảo Lộc (Kinh tuyến trục 107°45\', k=0.9999, Lâm Đồng)',
    crs: {
      province: 'Lâm Đồng',
      centralMeridian: '107.75',
      scaleFactor: '0.9999',
      axisOrder: 'AUTO',
    },
    params: {
      // Mục 3: Thông số hình học & Tấm BTXM
      roadWidth: '7.0',
      laneCount: '2',
      segmentLength: '100',
      slabLength: '4.0',
      // Mục 4: Thông số thiết kế BTXM
      slabThicknessCentimeters: '22',
      contractionJointSpacingMeters: '4.0',
      expansionJointSpacingMeters: '100.0',
      expansionJointGapMillimeters: '20',
      // Khảo sát
      surveyWidthMeters: '14.0',
    },
    confirmedAt: '2026-10-15',
    confirmedBy: 'Hồ sơ thiết kế ĐT.725 (Đối chiếu kỹ thuật)',
  },
  {
    id: 'project-nong-thon-mau',
    name: '[Mẫu] Đường GTNT Mẫu (Mặt 3.5m, 1 dải)',
    code: 'GTNT-MAU-01',
    isTemplate: true,
    description: 'Thiết kế mẫu đường giao thông nông thôn BTXM mặt hẹp',
    crs: {
      province: 'Lâm Đồng',
      centralMeridian: '107.75',
      scaleFactor: '0.9999',
      axisOrder: 'AUTO',
    },
    params: {
      roadWidth: '3.5',
      laneCount: '1',
      segmentLength: '50',
      slabLength: '4.0',
      slabThicknessCentimeters: '18',
      contractionJointSpacingMeters: '4.0',
      expansionJointSpacingMeters: '50.0',
      expansionJointGapMillimeters: '15',
      surveyWidthMeters: '8.0',
    },
    confirmedAt: '2026-10-10',
    confirmedBy: 'Hồ sơ mẫu GTNT',
  },
  {
    id: 'project-do-thi-4lanes',
    name: '[Mẫu] Đường Đô Thị 4 Làn Xe (Mặt 14.0m)',
    code: 'DT-4L-02',
    isTemplate: true,
    description: 'Tuyến đường trục đô thị BTXM 4 làn có dải phân cách',
    crs: {
      province: 'Lâm Đồng',
      centralMeridian: '107.75',
      scaleFactor: '0.9999',
      axisOrder: 'AUTO',
    },
    params: {
      roadWidth: '14.0',
      laneCount: '4',
      segmentLength: '100',
      slabLength: '5.0',
      slabThicknessCentimeters: '26',
      contractionJointSpacingMeters: '5.0',
      expansionJointSpacingMeters: '150.0',
      expansionJointGapMillimeters: '25',
      surveyWidthMeters: '22.0',
    },
    confirmedAt: '2026-11-01',
    confirmedBy: 'Hồ sơ mẫu Đô thị',
  },
]

/**
 * Loads project profiles from localStorage or falls back to defaults.
 */
export function loadProjectProfiles() {
  if (typeof window === 'undefined') return DEFAULT_PROJECT_PROFILES
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES)
    if (!raw) return DEFAULT_PROJECT_PROFILES
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
  } catch (e) {
    console.warn('[ProjectProfiles] Failed to load custom profiles, using defaults', e)
  }
  return DEFAULT_PROJECT_PROFILES
}

/**
 * Persists project profiles to localStorage.
 */
export function saveProjectProfiles(profiles) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles))
  } catch (e) {
    console.error('[ProjectProfiles] Failed to save profiles', e)
  }
}

/**
 * Gets currently active project ID.
 * Returns empty string ('') by default on fresh start so engineer actively selects a profile.
 */
export function getActiveProjectId() {
  if (typeof window === 'undefined') return ''
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT)
    if (saved !== null && saved !== undefined) return saved
  } catch (e) {
    // ignore
  }
  return ''
}

/**
 * Saves currently active project ID.
 */
export function saveActiveProjectId(id) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, id || '')
  } catch (e) {
    // ignore
  }
}

/**
 * Resolves effective state for a single parameter field based on:
 *   1. Engineer manual edit (dirty in current drawing session)
 *   2. Priority 1: Authentic DXF extraction with clear evidence
 *   3. Priority 2: Confirmed active Project Profile (or Template if explicitly chosen for testing)
 *   4. Missing in both -> Blank & flagged
 *
 * Safety guarantees:
 *   - Real project profiles (isTemplate: false) only supply values if officially confirmed (confirmedAt & confirmedBy).
 *   - Template profiles clearly designate their source as sample ('Từ hồ sơ mẫu: ...').
 */
export function resolveParameterFieldState({
  key,
  userOverrideVal,
  isUserDirty = false,
  dxfExtractedVal = null,
  dxfEvidence = null,
  projectVal = null,
  projectName = '',
  projectCode = '',
  isTemplate = false,
  isConfirmed = false,
}) {
  const hasDxf = Boolean(
    dxfExtractedVal !== null &&
    dxfExtractedVal !== undefined &&
    String(dxfExtractedVal).trim() !== '' &&
    dxfEvidence &&
    dxfEvidence.status === 'EXTRACTED'
  )
  const cleanDxf = hasDxf ? String(dxfExtractedVal).trim() : null

  // Production project profiles only supply numbers if officially confirmed
  const isProjectEligible = Boolean(isTemplate || isConfirmed)
  const hasProject = Boolean(
    isProjectEligible &&
    projectVal !== null &&
    projectVal !== undefined &&
    String(projectVal).trim() !== ''
  )
  const cleanProject = hasProject ? String(projectVal).trim() : null

  const getProjectSourceLabel = () => {
    if (isTemplate) {
      return projectCode ? `Từ hồ sơ mẫu: ${projectCode}` : `Từ mẫu: ${projectName}`
    }
    return projectCode ? `Từ dự án: ${projectCode}` : `Từ dự án: ${projectName}`
  }

  const isMultipleDxf = Boolean(dxfEvidence && dxfEvidence.status === 'MULTIPLE_VALUES')
  const dxfCandidates = isMultipleDxf && Array.isArray(dxfEvidence.candidates) ? dxfEvidence.candidates : []

  // Check discrepancy / conflict between DXF and Project, or multiple values in DXF
  let hasConflict = false
  if (isMultipleDxf && dxfCandidates.length > 1) {
    hasConflict = true
  } else if (hasDxf && hasProject) {
    const numDxf = Number(cleanDxf)
    const numProj = Number(cleanProject)
    if (!isNaN(numDxf) && !isNaN(numProj)) {
      if (Math.abs(numDxf - numProj) > 1e-4) {
        hasConflict = true
      }
    } else if (cleanDxf !== cleanProject) {
      hasConflict = true
    }
  }

  // 1. Engineer manual modification for this drawing
  if (isUserDirty && userOverrideVal !== undefined) {
    const cleanUser = String(userOverrideVal).trim()
    return {
      value: String(userOverrideVal),
      source: 'USER_EDITED',
      sourceLabel: 'Kỹ sư đã sửa',
      sourceBadgeClass: 'bg-[#F06421]/15 text-[#F06421] border-[#F06421]/40',
      hasDxf,
      dxfValue: cleanDxf,
      hasMultipleDxf: isMultipleDxf,
      dxfCandidates,
      dxfEvidence,
      hasProject,
      projectValue: cleanProject,
      hasConflict,
      isMissing: cleanUser === '',
    }
  }

  // 2. Multiple conflicting values inside DXF
  if (isMultipleDxf) {
    const fallbackValue = hasProject ? cleanProject : ''
    const fallbackLabel = hasProject
      ? getProjectSourceLabel()
      : 'Nhiều giá trị trong DXF'
    return {
      value: fallbackValue,
      source: hasProject ? 'FROM_PROJECT' : 'MULTIPLE_DXF',
      sourceLabel: fallbackLabel,
      sourceBadgeClass: hasProject
        ? 'bg-[#22B7C9]/15 text-[#22B7C9] border-[#22B7C9]/40'
        : 'bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/40',
      hasDxf: false,
      dxfValue: null,
      hasMultipleDxf: true,
      dxfCandidates,
      dxfEvidence,
      hasProject,
      projectValue: cleanProject,
      hasConflict: true,
      isMissing: fallbackValue === '',
    }
  }

  // 3. Priority 1: Authentic DXF single extracted value
  if (hasDxf) {
    return {
      value: cleanDxf,
      source: 'FROM_DXF',
      sourceLabel: 'Từ DXF',
      sourceBadgeClass: 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/40',
      hasDxf: true,
      dxfValue: cleanDxf,
      hasMultipleDxf: false,
      dxfCandidates: [],
      dxfEvidence,
      hasProject,
      projectValue: cleanProject,
      hasConflict,
      isMissing: false,
    }
  }

  // 4. Priority 2: Confirmed Project Profile (or Template if chosen)
  if (hasProject) {
    const label = getProjectSourceLabel()
    return {
      value: cleanProject,
      source: 'FROM_PROJECT',
      sourceLabel: label,
      sourceBadgeClass: 'bg-[#22B7C9]/15 text-[#22B7C9] border-[#22B7C9]/40',
      hasDxf: false,
      dxfValue: null,
      hasMultipleDxf: false,
      dxfCandidates: [],
      dxfEvidence: null,
      hasProject: true,
      projectValue: cleanProject,
      hasConflict: false,
      isMissing: false,
    }
  }

  // 5. Missing in both sources
  return {
    value: '',
    source: 'MISSING',
    sourceLabel: 'Chưa có dữ liệu',
    sourceBadgeClass: 'bg-[#17263C] text-[#8FA3BA] border-[#27384E]',
    hasDxf: false,
    dxfValue: null,
    hasMultipleDxf: false,
    dxfCandidates: [],
    dxfEvidence: null,
    hasProject: false,
    projectValue: null,
    hasConflict: false,
    isMissing: true,
  }
}

export function isProfileEligible(project) {
  return Boolean(project && (project.isTemplate || (project.confirmedBy && project.confirmedAt)))
}

const GEOM_KEYS = ['roadWidth', 'laneCount', 'segmentLength', 'slabLength']
const BTXM_KEYS = [
  'slabThicknessCentimeters',
  'contractionJointSpacingMeters',
  'expansionJointSpacingMeters',
  'expansionJointGapMillimeters',
]

/**
 * Single source of truth for the number-picking rule, used by: successful scan, failed scan,
 * project switch, and save/confirm of the selected profile.
 *   1. Engineer-entered value for the current drawing (dirty) is always kept.
 *   2. Otherwise evidence-based value read from the DXF.
 *   3. Otherwise value from the selected profile, ONLY if it is a template or a confirmed real profile.
 *   4. Otherwise blank.
 */
export function computeEffectiveParams({ prev = {}, dirtySet, btxmExtraction, geomExtraction, project }) {
  const dirty = dirtySet instanceof Set ? dirtySet : new Set()
  const eligible = isProfileEligible(project)
  const btxmInputs = btxmExtraction?.autoFilledInputs || {}
  const geomInputs = geomExtraction?.autoFilledInputs || {}
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''
  const out = {}
  const pick = (key, dxfVal) => {
    if (dirty.has(key)) return prev[key] ?? ''
    if (has(dxfVal)) return String(dxfVal)
    const pv = project?.params?.[key]
    if (eligible && has(pv)) return String(pv)
    return ''
  }
  for (const k of GEOM_KEYS) out[k] = pick(k, geomInputs[k])
  for (const k of BTXM_KEYS) out[k] = pick(k, btxmInputs[k])
  return out
}
