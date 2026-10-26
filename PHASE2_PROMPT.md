# RoadGuard CAD & GIS Studio — PHASE 2 IMPLEMENTATION PROMPT

Bạn là Senior Product Designer (industrial/engineering SaaS UI/UX), Senior React Engineer và GIS UX Specialist.

## Context
Phase 1 đã được báo cáo hoàn thành với build pass, INV-01..05 PASS, TGT-01..07 PASS. Ứng dụng là một CAD/GIS tool độc lập, không tích hợp trực tiếp vào RoadGuard chính. Frontend hiện dùng React/Vite/MapLibre/dxf-viewer; Backend .NET + Python. Đây là Phase 2, KHÔNG làm Landing Page (Phase 3) hoặc viết lại backend.

Trước tiên hãy đọc và áp dụng skill `.agents/skills/roadguard-studio-ui/SKILL.md`. Có thể kiểm tra `roadguard-landing-brand` để giữ nhất quán token và branding, nhưng KHÔNG triển khai Landing Page khi chưa được duyệt.

## Design outcome
Biến Studio từ giao diện sidebar cực chật, quá nhiều chữ nhỏ và nút nhỏ thành một Engineering Workspace premium, sang trọng, sắc nét và thực dụng. Bố cục 3 vùng (Left Input & Configuration / Large Center Map-CAD-Profile-JSON / Collapsible Right Inspector & Export), thanh header thông thoáng, thanh trạng thái dễ đọc, không lãng phí chiều cao viewport.

### Branding
Đã cung cấp file logo nguyên bản của CÔNG TY TNHH XÂY DỰNG BÊ TÔNG HOÀNG HẢI tại `public/brand/hoang-hai-logo-original.png` trong gói skill. Tích hợp logo một cách tiết chế vào Header hoặc About panel, giữ hình nguyên bản. Product name vẫn là `RoadGuard CAD & GIS Studio`. Palette lấy navy + orange của Hoàng Hải làm nhận diện; cyan dùng có chủ đích cho GIS, không dùng quá nhiều neon.

### Scope / Existing code
- Đọc Git status, xác định branch và commit; không xóa dữ liệu untracked hay reset. Tạo baseline bảo toàn giao diện trước khi sửa.
- Audit và giữ nguyên 4 tab thực tế `map`, `cad`, `profile`, `json`.
- Giữ chức năng: nạp DXF, nhập tọa độ VN-2000, cấu hình múi chiếu/kinh tuyến trục/trục X-Y, MapLibre worker, bản vẽ CAD, GIS/CAD layers, focus segments, mặt cắt ngang, GeoJSON inspector, xuất Excel 3 sheet.
- Khi tách `Sidebar.jsx` thành `LeftConfigPanel` / `RightInspectorPanel`, bảo toàn mọi state/callback/API và để map trung tâm rộng nhất. Không tạo state trùng hoặc làm mất dữ liệu khi chuyển tab.
- Cải thiện viewer CAD Fit to Drawing/Focus Road (kiểm tra extents thay vì làm biến mất layer khác).
- Gắn trạng thái Empty State, loading, error, invalid coords, ambiguous axes, success. Sau chỉnh thông số `roadWidth` có thể làm `surfaceAreaSqm` mới chỉ là ước tính tỷ lệ; ĐỪNG xuất diện tích tạm tính như dữ liệu kỹ thuật chính thức: yêu cầu chạy phân tích lại hoặc khóa các export phụ thuộc kết quả đó, có cảnh báo rõ.
- Kiểm tra xem cao độ và độ dốc trong Profile có phải dữ liệu từ DXF hay là default. Nếu default, label rõ là giả định/cấu hình; không trình bày như đo đạc thực tế.

### Quality bar
- Typography ít nhất ~13–14px cho văn bản thao tác chính; text hierarchy tốt. Tránh 9px everywhere.
- Panels scroll độc lập, inspector collapse/expand với map resize đúng, toolbar CAD/Map dễ thấy, tooltip + keyboard focus + WCAG-friendly contrast.
- Desktop 1920/1440; laptop 1280; 1024 cần thu gọn inspector; tablet/mobile thành drawer nếu hợp lý, không tràn ngang.
- Hiệu ứng tinh tế, nhanh; không animation giật khi render bản vẽ DXF lớn. Không cài UI library mới nếu không cần.
- Thiết kế thực sự đẹp và thống nhất tất cả 4 tab, không chỉ repaint Sidebar.

## Execution: staged implementation (autonomous within Phase 2)
1. Audit code + report brief UI design tokens/layout before edits; no extended back-and-forth needed.
2. Refactor shared layout/state and create components where necessary.
3. Improve map, CAD, profile, GeoJSON view presentation and toolbar layout without touching engineering business logic.
4. Integrate supplied Hoàng Hải logo minimally and professionally; keep original name/logo unaltered.
5. Verify with real `3. BDTK.dxf` and inputs including `roadWidth=3.5` plus 7.0, 3°/6°, import coordinates and export.
6. Run Frontend build, Backend build only if relevant, `tests/phase1_regression_suite.py` and `scripts/verify-phase1-ssot.mjs`; no regressions allowed.
7. Capture before/after screenshots of all four tabs at 1440 and 1920, plus narrow layout, check console/network errors, layer toggles and worker.
8. Provide changed-file summary, test report, screenshots and known issues. **STOP after Phase 2**; do not deploy or start Phase 3 without my approval.

### Non-negotiables
NO fabricated Demo UI/data. NO unsupported DWG claims. NO API/CRS logic changes. NO silent rounding/area recomputation deviations. NO broken layer/worker/exports. NO hardcoded elevations presented as survey data.
