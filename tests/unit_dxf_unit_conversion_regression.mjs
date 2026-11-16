import assert from 'node:assert/strict'
import {
  extractRoadGeometryParamsFromDxfText,
  extractBtxmDesignParamsFromDxfText,
} from '../src/utils/roadEngineeringBuilder.js'

console.log('===============================================================')
console.log('UNIT REGRESSION TESTS: UNITS, LIMITS & SINGLE NOTE MULTI-WIDTH')
console.log('===============================================================')

// Helper to wrap text into minimal DXF ENTITIES section
function makeDxf(text) {
  return `0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\nLAYER_NOTE\n1\n${text}\n0\nENDSEC\n0\nEOF`
}

// 1. Test 50 mm
console.log('\n--- Test Case 1: 50 mm ---')
{
  // Section 3: Road Width = 50 mm -> 0.05m (< 1.0m min) -> MUST BE REJECTED
  const dxfRw50mm = makeDxf('Bề rộng mặt đường B = 50 mm')
  const resRw = extractRoadGeometryParamsFromDxfText(dxfRw50mm)
  assert.strictEqual(resRw.fields.roadWidth.status, 'NOT_FOUND', '50 mm for road width must be rejected (0.05m < 1.0m min)')
  assert.strictEqual(resRw.fields.roadWidth.autoFillValue, '')

  // Section 4: Slab thickness = 50 mm -> 5 cm (< 10 cm min) -> MUST BE REJECTED
  const dxfThk50mm = makeDxf('Chiều dày tấm BTXM: 50 mm')
  const resThk = extractBtxmDesignParamsFromDxfText(dxfThk50mm)
  assert.strictEqual(resThk.fields.slabThicknessCentimeters.status, 'NOT_FOUND', '50 mm for slab thickness must be rejected (5 cm < 10 cm min)')

  // Section 4: Contraction joint spacing = 50 mm -> 0.05m (< 1.5m min) -> MUST BE REJECTED
  const dxfCj50mm = makeDxf('Cự ly khe co: 50 mm')
  const resCj = extractBtxmDesignParamsFromDxfText(dxfCj50mm)
  assert.strictEqual(resCj.fields.contractionJointSpacingMeters.status, 'NOT_FOUND', '50 mm for contraction joint must be rejected (0.05m < 1.5m min)')

  // Section 4: Expansion joint gap = 50 mm -> 50 mm (valid gap <= 100mm) -> ACCEPTED
  const dxfGap50mm = makeDxf('Độ hở khe giãn: 50 mm')
  const resGap = extractBtxmDesignParamsFromDxfText(dxfGap50mm)
  assert.strictEqual(resGap.fields.expansionJointGapMillimeters.status, 'EXTRACTED')
  assert.strictEqual(resGap.fields.expansionJointGapMillimeters.autoFillValue, '50')
  console.log('✓ 50 mm correctly converted and checked against limits for all fields')
}

// 2. Test 4 mm
console.log('\n--- Test Case 2: 4 mm ---')
{
  // Section 3: Road Width = 4 mm -> 0.004m (< 1.0m min) -> MUST BE REJECTED
  const dxfRw4mm = makeDxf('Mặt đường B = 4 mm')
  const resRw = extractRoadGeometryParamsFromDxfText(dxfRw4mm)
  assert.strictEqual(resRw.fields.roadWidth.status, 'NOT_FOUND', '4 mm for road width must be rejected (0.004m < 1.0m min)')

  // Section 4: Slab thickness = 4 mm -> 0.4 cm (< 10 cm min) -> MUST BE REJECTED
  const dxfThk4mm = makeDxf('Chiều dày tấm BTXM: 4 mm')
  const resThk = extractBtxmDesignParamsFromDxfText(dxfThk4mm)
  assert.strictEqual(resThk.fields.slabThicknessCentimeters.status, 'NOT_FOUND', '4 mm for slab thickness must be rejected (0.4 cm < 10 cm min)')

  // Section 4: Contraction joint = 4 mm -> 0.004m (< 1.5m min) -> MUST BE REJECTED
  const dxfCj4mm = makeDxf('Cự ly khe co: 4 mm')
  const resCj = extractBtxmDesignParamsFromDxfText(dxfCj4mm)
  assert.strictEqual(resCj.fields.contractionJointSpacingMeters.status, 'NOT_FOUND', '4 mm for contraction joint must be rejected')

  // Section 4: Expansion joint gap = 4 mm -> 4 mm (valid joint gap) -> ACCEPTED
  const dxfGap4mm = makeDxf('Độ hở khe giãn: 4 mm')
  const resGap = extractBtxmDesignParamsFromDxfText(dxfGap4mm)
  assert.strictEqual(resGap.fields.expansionJointGapMillimeters.status, 'EXTRACTED')
  assert.strictEqual(resGap.fields.expansionJointGapMillimeters.autoFillValue, '4')
  console.log('✓ 4 mm correctly converted and rejected for thickness/spacing/width, accepted for gap')
}

// 3. Test 7 m2 (Area unit rejection)
console.log('\n--- Test Case 3: 7 m2 / 7 m² (Area Unit Rejection) ---')
{
  // Section 3: B mặt đường = 7 m2 -> Area unit -> MUST BE REJECTED
  const dxfRw7m2 = makeDxf('B mặt đường = 7 m2')
  const resRw1 = extractRoadGeometryParamsFromDxfText(dxfRw7m2)
  assert.strictEqual(resRw1.fields.roadWidth.status, 'NOT_FOUND', '7 m2 must not be parsed as road width length')

  // Section 3: Bề rộng mặt đường = 7 m² (Unicode superscript) -> MUST BE REJECTED
  const dxfRw7m2Uni = makeDxf('Bề rộng mặt đường = 7 m²')
  const resRw2 = extractRoadGeometryParamsFromDxfText(dxfRw7m2Uni)
  assert.strictEqual(resRw2.fields.roadWidth.status, 'NOT_FOUND', '7 m² must not be parsed as road width length')

  // Section 4: Chiều dày tấm BTXM: 7 m2 -> MUST BE REJECTED
  const dxfThk7m2 = makeDxf('Chiều dày tấm BTXM: 7 m2')
  const resThk = extractBtxmDesignParamsFromDxfText(dxfThk7m2)
  assert.strictEqual(resThk.fields.slabThicknessCentimeters.status, 'NOT_FOUND', '7 m2 must not be parsed as slab thickness')
  console.log('✓ 7 m2 and 7 m² strictly rejected as area units')
}

// 4. Test Two road widths in ONE single note (Single Annotation Multi-Width)
console.log('\n--- Test Case 4: Two Road Widths in ONE Single Note ---')
{
  // Explicit two B assignments in one note
  const dxfSingleNote1 = makeDxf('Bề rộng mặt đường B = 7.0m, đoạn mở rộng B = 8.5m')
  const res1 = extractRoadGeometryParamsFromDxfText(dxfSingleNote1)
  assert.strictEqual(res1.fields.roadWidth.status, 'MULTIPLE_VALUES', 'Must detect multiple values in a single note')
  assert.strictEqual(res1.fields.roadWidth.candidates.length, 2, 'Must have exactly 2 candidates')
  assert.strictEqual(res1.fields.roadWidth.candidates[0].normalizedValue, 7)
  assert.strictEqual(res1.fields.roadWidth.candidates[1].normalizedValue, 8.5)

  // Shorthand "7.0m hoặc 8.5m" in one note
  const dxfSingleNote2 = makeDxf('Mặt đường B = 7.0m hoặc 8.5m')
  const res2 = extractRoadGeometryParamsFromDxfText(dxfSingleNote2)
  assert.strictEqual(res2.fields.roadWidth.status, 'MULTIPLE_VALUES', 'Must detect multiple values in shorthand "7.0m hoặc 8.5m"')
  assert.strictEqual(res2.fields.roadWidth.candidates.length, 2)
  assert.strictEqual(res2.fields.roadWidth.candidates[0].normalizedValue, 7)
  assert.strictEqual(res2.fields.roadWidth.candidates[1].normalizedValue, 8.5)
  console.log('✓ Two road widths in one single note correctly captured as multiple candidates')
}

// 5. Test Project Profiles: Template vs Production & Confirmation Gating
console.log('\n--- Test Case 5: Project Profiles: Template vs Real & Confirmation Rules ---')
{
  const { resolveParameterFieldState, getActiveProjectId } = await import('../src/utils/projectProfiles.js')

  // Rule 5.1: Initial start returns empty project ID
  assert.strictEqual(getActiveProjectId(), '', 'Initial active project ID must be empty string')

  // Rule 5.2: Template profile supplies value with "Từ hồ sơ mẫu: ..."
  const templateState = resolveParameterFieldState({
    key: 'roadWidth',
    projectVal: '7.0',
    projectName: 'Bảo Lộc',
    projectCode: 'DT725-BL',
    isTemplate: true,
    isConfirmed: true,
  })
  assert.strictEqual(templateState.value, '7.0')
  assert.strictEqual(templateState.source, 'FROM_PROJECT')
  assert.strictEqual(templateState.sourceLabel, 'Từ hồ sơ mẫu: DT725-BL')

  // Rule 5.3: Real project UNCONFIRMED must NOT supply value
  const realUnconfirmedState = resolveParameterFieldState({
    key: 'roadWidth',
    projectVal: '8.0',
    projectName: 'Dự án Quốc Lộ 1',
    projectCode: 'QL1-2026',
    isTemplate: false,
    isConfirmed: false,
  })
  assert.strictEqual(realUnconfirmedState.value, '', 'Unconfirmed real project must not supply value')
  assert.strictEqual(realUnconfirmedState.source, 'MISSING')
  assert.strictEqual(realUnconfirmedState.sourceLabel, 'Chưa có dữ liệu')

  // Rule 5.4: Real project CONFIRMED supplies value with "Từ dự án: ..."
  const realConfirmedState = resolveParameterFieldState({
    key: 'roadWidth',
    projectVal: '8.0',
    projectName: 'Dự án Quốc Lộ 1',
    projectCode: 'QL1-2026',
    isTemplate: false,
    isConfirmed: true,
  })
  assert.strictEqual(realConfirmedState.value, '8.0')
  assert.strictEqual(realConfirmedState.source, 'FROM_PROJECT')
  assert.strictEqual(realConfirmedState.sourceLabel, 'Từ dự án: QL1-2026')
  console.log('✓ Real projects require confirmation to supply values; templates explicitly state sample source')
}

console.log('\n===============================================================')
console.log('ALL UNIT REGRESSION TESTS PASSED 100% (STRICT)!')
console.log('===============================================================')
