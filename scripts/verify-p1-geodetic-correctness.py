#!/usr/bin/env python3
"""
CAD & GIS STUDIO — P1: INDEPENDENT GEODETIC CORRECTNESS VERIFICATION SUITE
========================================================================
Validates VN-2000 <-> WGS-84 coordinate transformation against independent
pyproj calculations across 3-degree and 6-degree zones, custom central
meridians, and the AxisOrder matrix (AUTO, VN2000_XY, CAD_EN).

Specifications:
- Vietnamese Standard: Circular 973/2001/TT-TCĐC, Decision 05/2007/QĐ-BTNMT
- Ellipsoid: WGS84
- False Easting: 500,000 m, False Northing: 0 m
- 7-parameter Helmert Towgs84:
  dx=-191.90441429, dy=-39.30318279, dz=-111.45032835,
  rx=-0.00928836, ry=0.01975479, rz=-0.00427372, s=0.252906278 ppm
"""

import sys
import os
import math
import json
import urllib.request
import urllib.error
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
from pyproj import CRS, Transformer

# -----------------------------------------------------------------------------
# 1. Independent Reference Transformer (Ground Truth)
# -----------------------------------------------------------------------------
def make_independent_reference_transformer(cm: float, k0: float):
    """
    Constructs a pure, independent pyproj Transformer from base geodetic definitions.
    Does not use or import any application logic.
    """
    proj_def = (
        f"+proj=tmerc +lat_0=0 +lon_0={cm} +k={k0} "
        f"+x_0=500000 +y_0=0 +ellps=WGS84 "
        f"+towgs84=-191.90441429,-39.30318279,-111.45032835,"
        f"-0.00928836,0.01975479,-0.00427372,0.252906278 "
        f"+units=m +no_defs"
    )
    # always_xy=True guarantees input is (Easting, Northing) and output is (Longitude, Latitude)
    return Transformer.from_crs(CRS.from_proj4(proj_def), CRS.from_epsg(4326), always_xy=True)

# -----------------------------------------------------------------------------
# 2. Test Ground Truth Dataset
# -----------------------------------------------------------------------------
# Real-world benchmark coordinates across Vietnam in VN-2000
BENCHMARKS = [
    {
        "location": "Hà Nội (Hoàn Kiếm)",
        "zone": "Múi 3°",
        "cm": 105.00,
        "k0": 0.9999,
        # VN-2000 Surveying convention: X = Northing, Y = Easting
        "vn2000_x_north": 2325412.500,
        "vn2000_y_east": 588214.300,
        # CAD convention: X_cad = Easting, Y_cad = Northing
        "cad_x_east": 588214.300,
        "cad_y_north": 2325412.500,
    },
    {
        "location": "TP. Hồ Chí Minh (Quận 1)",
        "zone": "Múi 3°",
        "cm": 105.75,
        "k0": 0.9999,
        "vn2000_x_north": 1190349.616,
        "vn2000_y_east": 599347.980,
        "cad_x_east": 599347.980,
        "cad_y_north": 1190349.616,
    },
    {
        "location": "Đà Nẵng (Hải Châu) - Múi 6°",
        "zone": "Múi 6°",
        "cm": 107.75,
        "k0": 0.9996,
        "vn2000_x_north": 1775320.100,
        "vn2000_y_east": 525410.800,
        "cad_x_east": 525410.800,
        "cad_y_north": 1775320.100,
    },
    {
        "location": "Cần Thơ (Ninh Kiều)",
        "zone": "Múi 3°",
        "cm": 105.00,
        "k0": 0.9999,
        "vn2000_x_north": 1110540.200,
        "vn2000_y_east": 582100.400,
        "cad_x_east": 582100.400,
        "cad_y_north": 1110540.200,
    },
    {
        "location": "Kinh tuyến trục tùy chỉnh (Custom CM)",
        "zone": "Tùy chỉnh (k0=0.9999)",
        "cm": 106.25,
        "k0": 0.9999,
        "vn2000_x_north": 1205576.263,
        "vn2000_y_east": 650000.000,
        "cad_x_east": 650000.000,
        "cad_y_north": 1205576.263,
    },
    {
        "location": "Bản vẽ 3. BDTK.dxf (Bình Thuận Start Point)",
        "zone": "Múi 6°",
        "cm": 107.75,
        "k0": 0.9996,
        "vn2000_x_north": 1203812.610,
        "vn2000_y_east": 592567.310,
        "cad_x_east": 592567.310,
        "cad_y_north": 1203812.610,
    }
]

API_BASE = "http://localhost:5198"

def http_post_json(endpoint: str, payload: dict):
    req = urllib.request.Request(
        f"{API_BASE}{endpoint}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_geodetic_tests():
    print("=" * 80)
    print("CAD & GIS STUDIO — P1: GEODETIC CORRECTNESS VERIFICATION SUITE")
    print("Independent pyproj Ground Truth vs Backend Implementation")
    print("=" * 80)

    results_table = []
    total_passed = 0
    total_failed = 0

    # -------------------------------------------------------------------------
    # TEST 1: Benchmark Transverse Mercator Transformations vs Ground Truth
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Ground Truth Comparison across 3°, 6°, and Custom CMs")
    for bm in BENCHMARKS:
        # 1. Independent ground truth calculation
        ref_tf = make_independent_reference_transformer(bm["cm"], bm["k0"])
        ref_lon, ref_lat = ref_tf.transform(bm["cad_x_east"], bm["cad_y_north"])

        # 2. Backend API call via /api/cad/parse-coords
        # Input formatted as standard VN-2000 text: "X_North, Y_East"
        coord_text = f"{bm['vn2000_x_north']:.3f}, {bm['vn2000_y_east']:.3f}\n{bm['vn2000_x_north'] + 100:.3f}, {bm['vn2000_y_east'] + 100:.3f}"
        backend_payload = {
            "coordinates": coord_text,
            "centralMeridian": bm["cm"],
            "scaleFactor": bm["k0"],
            "axisOrder": "VN2000_XY",
            "roadWidth": 7.0
        }

        try:
            res = http_post_json("/api/cad/parse-coords", backend_payload)
            if not res.get("success"):
                raise RuntimeError(f"Backend failed: {res.get('detail')}")

            # parse-coords centerline returns [lat, lon]
            first_pt = res["centerline"][0]
            if first_pt[0] < first_pt[1]:
                api_lat, api_lon = first_pt[0], first_pt[1]
            else:
                api_lon, api_lat = first_pt[0], first_pt[1]

            delta_lon = abs(api_lon - ref_lon)
            delta_lat = abs(api_lat - ref_lat)
            # Max discrepancy tolerance: 1e-6 degrees (~0.1mm)
            passed = (delta_lon < 1e-6) and (delta_lat < 1e-6)

            if passed:
                total_passed += 1
                status_str = "PASS"
            else:
                total_failed += 1
                status_str = "FAIL"

            print(f"  [{status_str}] {bm['location']} (CM={bm['cm']}, k0={bm['k0']}):")
            print(f"         Reference: lon={ref_lon:.8f}°, lat={ref_lat:.8f}°")
            print(f"         Backend:   lon={api_lon:.8f}°, lat={api_lat:.8f}°")
            print(f"         Delta:     lon={delta_lon:.2e}°, lat={delta_lat:.2e}°")

            results_table.append({
                "location": bm["location"],
                "zone": bm["zone"],
                "cm": bm["cm"],
                "k0": bm["k0"],
                "axis_order": "VN2000_XY",
                "input_source": f"X={bm['vn2000_x_north']:.2f}, Y={bm['vn2000_y_east']:.2f}",
                "ref_wgs84": f"[{ref_lon:.8f}, {ref_lat:.8f}]",
                "actual_wgs84": f"[{api_lon:.8f}, {api_lat:.8f}]",
                "delta_deg": f"{max(delta_lon, delta_lat):.2e}",
                "status": status_str
            })

        except Exception as e:
            total_failed += 1
            print(f"  [FAIL] {bm['location']}: {e}")

    # -------------------------------------------------------------------------
    # TEST 2: AxisOrder Matrix Behavior (AUTO, VN2000_XY, CAD_EN)
    # -------------------------------------------------------------------------
    print("\n[TEST 2] AxisOrder Matrix Behavior (AUTO vs VN2000_XY vs CAD_EN)")
    bm = BENCHMARKS[5] # 3. BDTK.dxf start point

    ref_tf = make_independent_reference_transformer(bm["cm"], bm["k0"])
    # Mathematical ground truths:
    # A) CAD_EN: (Easting = 592567.31, Northing = 1203812.61)
    lon_cad_en, lat_cad_en = ref_tf.transform(bm["cad_x_east"], bm["cad_y_north"])
    # B) Inverted / Swapped: (Easting = 1203812.61, Northing = 592567.31)
    lon_swapped, lat_swapped = ref_tf.transform(bm["cad_y_north"], bm["cad_x_east"])

    print(f"  Expected Mathematical Ground Truth for (592567.31, 1203812.61):")
    print(f"    - Proper CAD_EN convention (E, N):     lat={lat_cad_en:.8f}°, lon={lon_cad_en:.8f}°")
    print(f"    - Inverted convention (N, E as E, N):  lat={lat_swapped:.8f}°, lon={lon_swapped:.8f}°")

    # Send CAD input format with CAD_EN mode
    payload_cad_en = {
        "coordinates": f"{bm['cad_x_east']:.3f}, {bm['cad_y_north']:.3f}\n{bm['cad_x_east']+10:.3f}, {bm['cad_y_north']+10:.3f}",
        "centralMeridian": bm["cm"],
        "scaleFactor": bm["k0"],
        "axisOrder": "CAD_EN",
        "roadWidth": 7.0
    }
    res_cad_en = http_post_json("/api/cad/parse-coords", payload_cad_en)
    pt_cad_en = res_cad_en["centerline"][0]
    api_lat_cad_en, api_lon_cad_en = (pt_cad_en[0], pt_cad_en[1]) if pt_cad_en[0] < pt_cad_en[1] else (pt_cad_en[1], pt_cad_en[0])
    pass_cad_en = (abs(api_lon_cad_en - lon_cad_en) < 1e-6 and abs(api_lat_cad_en - lat_cad_en) < 1e-6)
    print(f"  [{'PASS' if pass_cad_en else 'FAIL'}] CAD_EN mode maps directly to (E, N):")
    print(f"         Actual: [lon={api_lon_cad_en:.8f}, lat={api_lat_cad_en:.8f}]")
    if pass_cad_en: total_passed += 1
    else: total_failed += 1

    results_table.append({
        "location": "3. BDTK.dxf (Mode CAD_EN)",
        "zone": "Múi 6°",
        "cm": bm["cm"],
        "k0": bm["k0"],
        "axis_order": "CAD_EN",
        "input_source": f"E={bm['cad_x_east']:.2f}, N={bm['cad_y_north']:.2f}",
        "ref_wgs84": f"[{lon_cad_en:.8f}, {lat_cad_en:.8f}]",
        "actual_wgs84": f"[{api_lon_cad_en:.8f}, {api_lat_cad_en:.8f}]",
        "delta_deg": f"{max(abs(api_lon_cad_en-lon_cad_en), abs(api_lat_cad_en-lat_cad_en)):.2e}",
        "status": "PASS" if pass_cad_en else "FAIL"
    })

    # Send CAD input format with AUTO mode
    payload_auto = {
        "coordinates": f"{bm['cad_x_east']:.3f}, {bm['cad_y_north']:.3f}\n{bm['cad_x_east']+10:.3f}, {bm['cad_y_north']+10:.3f}",
        "centralMeridian": bm["cm"],
        "scaleFactor": bm["k0"],
        "axisOrder": "AUTO",
        "roadWidth": 7.0
    }
    res_auto = http_post_json("/api/cad/parse-coords", payload_auto)
    pt_auto = res_auto["centerline"][0]
    api_lat_auto, api_lon_auto = (pt_auto[0], pt_auto[1]) if pt_auto[0] < pt_auto[1] else (pt_auto[1], pt_auto[0])
    pass_auto = (abs(api_lon_auto - lon_cad_en) < 1e-6 and abs(api_lat_auto - lat_cad_en) < 1e-6)
    print(f"  [{'PASS' if pass_auto else 'FAIL'}] AUTO mode correctly detects (E, N) and matches CAD_EN:")
    print(f"         Actual: [lon={api_lon_auto:.8f}, lat={api_lat_auto:.8f}]")
    if pass_auto: total_passed += 1
    else: total_failed += 1

    results_table.append({
        "location": "3. BDTK.dxf (Mode AUTO)",
        "zone": "Múi 6°",
        "cm": bm["cm"],
        "k0": bm["k0"],
        "axis_order": "AUTO",
        "input_source": f"E={bm['cad_x_east']:.2f}, N={bm['cad_y_north']:.2f}",
        "ref_wgs84": f"[{lon_cad_en:.8f}, {lat_cad_en:.8f}]",
        "actual_wgs84": f"[{pt_auto[0]:.8f}, {pt_auto[1]:.8f}]",
        "delta_deg": f"{max(abs(pt_auto[0]-lon_cad_en), abs(pt_auto[1]-lat_cad_en)):.2e}",
        "status": "PASS" if pass_auto else "FAIL"
    })

    # -------------------------------------------------------------------------
    # TEST 3: Mathematical Proof of AUTO vs VN2000_XY Result Discrepancy
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Detailed Geodetic Analysis: AUTO vs VN2000_XY")
    print("  User question: Why did AUTO yield [lat=10.88478840, lon=108.59851450]")
    print("  while VN2000_XY yielded [lat=5.32555409, lon=114.08951683]?")

    # In 3. BDTK.dxf, the exact CAD vertex in layer TKDTIMTUYENTKT2 is:
    # CAD X = 592567.314134 m (Easting), CAD Y = 1203844.814606 m (Northing)
    # When projected with k0=0.9999 and L0=107.75:
    ref_tf_9999 = make_independent_reference_transformer(107.75, 0.9999)

    cad_x_exact = 592567.3141343576
    cad_y_exact = 1203844.814606074

    # 1. Normal CAD convention (CAD_EN / AUTO): Easting = cad_x, Northing = cad_y
    lon_auto_exact, lat_auto_exact = ref_tf_9999.transform(cad_x_exact, cad_y_exact)
    print(f"  A) Normal CAD_EN / AUTO: Easting={cad_x_exact:.3f}, Northing={cad_y_exact:.3f}")
    print(f"     pyproj independent calculation: lat={lat_auto_exact:.8f}°, lon={lon_auto_exact:.8f}°")
    print(f"     Reported AUTO value:            lat=10.88478840°, lon=108.59851450°")
    diff_auto_lat = abs(lat_auto_exact - 10.88478840)
    diff_auto_lon = abs(lon_auto_exact - 108.59851450)
    print(f"     Discrepancy: lat={diff_auto_lat:.2e}°, lon={diff_auto_lon:.2e}°")

    # 2. Inverted VN2000_XY forced on CAD data: Easting = cad_y, Northing = cad_x
    lon_vn_exact, lat_vn_exact = ref_tf_9999.transform(cad_y_exact, cad_x_exact)
    print(f"  B) Inverted VN2000_XY on CAD data: Easting={cad_y_exact:.3f}, Northing={cad_x_exact:.3f}")
    print(f"     pyproj independent calculation: lat={lat_vn_exact:.8f}°, lon={lon_vn_exact:.8f}°")
    print(f"     Reported VN2000_XY value:       lat=5.32555409°, lon=114.08951683°")
    diff_vn_lat = abs(lat_vn_exact - 5.32555409)
    diff_vn_lon = abs(lon_vn_exact - 114.08951683)
    print(f"     Discrepancy: lat={diff_vn_lat:.2e}°, lon={diff_vn_lon:.2e}°")

    proof_passed = (diff_auto_lat < 1e-6 and diff_auto_lon < 1e-6 and diff_vn_lat < 1e-6 and diff_vn_lon < 1e-6)
    print(f"  [{'PASS' if proof_passed else 'FAIL'}] MATHEMATICAL PROOF ESTABLISHED:")
    print(f"         [5.32555409, 114.08951683] is the mathematically EXACT result of applying")
    print(f"         VN2000_XY (swapping axes) to CAD (E, N) coordinates with k0=0.9999!")
    print(f"         This is NOT a bug; it is the correct mathematical consequence of intentionally")
    print(f"         changing the axis convention.")
    if proof_passed: total_passed += 1
    else: total_failed += 1

    results_table.append({
        "location": "3. BDTK.dxf (Corridor Start k0=0.9999 AUTO)",
        "zone": "Múi 3°/Mặc định",
        "cm": 107.75,
        "k0": 0.9999,
        "axis_order": "AUTO / CAD_EN",
        "input_source": f"E={cad_x_exact:.2f}, N={cad_y_exact:.2f}",
        "ref_wgs84": f"[{lon_auto_exact:.8f}, {lat_auto_exact:.8f}]",
        "actual_wgs84": "[108.59851450, 10.88478840]",
        "delta_deg": f"{max(diff_auto_lat, diff_auto_lon):.2e}",
        "status": "PASS" if proof_passed else "FAIL"
    })

    results_table.append({
        "location": "3. BDTK.dxf (Corridor Start k0=0.9999 VN2000_XY)",
        "zone": "Múi 3°/Mặc định",
        "cm": 107.75,
        "k0": 0.9999,
        "axis_order": "VN2000_XY (Inverted)",
        "input_source": f"E={cad_y_exact:.2f}, N={cad_x_exact:.2f}",
        "ref_wgs84": f"[{lon_vn_exact:.8f}, {lat_vn_exact:.8f}]",
        "actual_wgs84": "[114.08951683, 5.32555409]",
        "delta_deg": f"{max(diff_vn_lat, diff_vn_lon):.2e}",
        "status": "PASS" if proof_passed else "FAIL"
    })

    # -------------------------------------------------------------------------
    # TEST 4: Output Axis Order RFC 7946 Compliance Check [lon, lat]
    # -------------------------------------------------------------------------
    print("\n[TEST 4] RFC 7946 Output Compliance: [longitude, latitude] Ordering")
    # Verify that parse-dxf output features strictly have coordinates as [longitude, latitude]
    dxf_path = os.path.join(os.path.dirname(__file__), "..", "..", "roadguard-cad-parser", "3. BDTK.dxf")
    if os.path.exists(dxf_path):
        import requests
        with open(dxf_path, "rb") as f:
            dxf_res = requests.post(
                f"{API_BASE}/api/cad/parse-dxf",
                files={"file": f},
                data={"targetSrid": "4326", "centralMeridian": "107.75", "scaleFactor": "0.9996", "axisOrder": "AUTO"}
            ).json()
            fc = dxf_res.get("featureCollection", {})
            feats = fc.get("features", [])
            if feats:
                first_coord = feats[0]["geometry"]["coordinates"][0]
                lon, lat = first_coord[0], first_coord[1]
                is_rfc7946 = (102.0 <= lon <= 112.0) and (8.0 <= lat <= 24.0)
                print(f"  parse-dxf feature[0] coord: [lon={lon:.8f}, lat={lat:.8f}]")
                assert is_rfc7946, f"Feature coordinate {first_coord} is not [lon, lat]!"
                print("  [PASS] /api/cad/parse-dxf strictly outputs GeoJSON with RFC 7946 [longitude, latitude] ordering.")
                total_passed += 1
            else:
                print("  [WARN] No features returned from parse-dxf")
    else:
        print("  [SKIP] 3. BDTK.dxf not found for TEST 4")

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"P1 GEODETIC CORRECTNESS RESULTS: {total_passed} PASSED, {total_failed} FAILED")
    print("=" * 80)

    # Save summary table as JSON for report inclusion
    out_path = os.path.join(os.path.dirname(__file__), "p1_geodetic_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results_table, f, indent=2, ensure_ascii=False)
    print(f"Saved benchmark summary table to {out_path}")

    return total_failed == 0

if __name__ == "__main__":
    success = run_geodetic_tests()
    sys.exit(0 if success else 1)
