# 🛣️ RoadGuard: Drone and AI-Based Road Defect Inspection and Warranty

> **Hệ thống Web GIS & AutoCAD Viewer phục vụ quản lý, giám sát hư hỏng mặt đường và bảo hành công trình giao thông ứng dụng Drone & Trí tuệ Nhân tạo (AI).**

[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.3-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900.svg?logo=leaflet)](https://leafletjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Giới thiệu đề tài (Project Overview)

**RoadGuard** là giải pháp công nghệ toàn diện kết hợp giữa **Thiết bị bay không người lái (Drone/UAV)**, **Trí tuệ nhân tạo (AI/Computer Vision)** và **Hệ thống thông tin địa lý (Web GIS)** nhằm tự động hóa quy trình khảo sát, phát hiện hư hỏng mặt đường (ổ gà, nứt nẻ, lún sụt...) và quản lý thời hạn bảo hành công trình hạ tầng giao thông.

Phân hệ **Frontend (RoadGuard Web & CAD Command Center)** đóng vai trò là trung tâm chỉ huy kỹ thuật số:
- Đối soát bản vẽ thiết kế kỹ thuật CAD (`.dxf`, `.dwg`) với thực địa không gian GIS.
- Định vị các vị trí hư hỏng theo cọc lý trình ($Km0+000, Km0+100...$) và cao độ $Z$.
- Tự động hóa tính toán diện tích phân đoạn, ước tính khối lượng vật liệu sửa chữa/bảo hành (bê tông nhựa, tấm BTXM).
- Cung cấp môi trường xem bản vẽ AutoCAD trực tiếp trên trình duyệt Web (100% Client-Side CAD Viewport).

---

## 🚀 Các tính năng chính (Core Features)

### 1. 🗺️ Bản đồ Web GIS Giám sát & Quản lý Tuyến đường (Interactive Plan View)
- **Trực quan hóa hình học mặt đường thực tế**:
  - **Tim tuyến (Centerline)**: Hiển thị nét đứt màu vàng chuẩn kỹ thuật giao thông.
  - **Mặt đường (Road Surface)**: Đa giác 2D mô phỏng mặt đường bê tông nhựa/xi măng với độ trong suốt tối ưu.
  - **Mép đường (Road Edges)**: Xác định ranh giới hành lang tuyến đường 2 bên.
  - **Cọc lý trình (Stations)**: Gắn nhãn tự động khoảng cách chuỗi ($Km0+000$), cao độ $Z$ và tọa độ GPS phục vụ định vị vị trí hư hỏng do Drone ghi nhận.
- **Tùy biến lớp bản đồ số**:
  - Bản đồ nền tối (**CartoDB / OpenStreetMap Dark Mode**).
  - Bản đồ vệ tinh thực địa độ phân giải cao (**Esri World Imagery Satellite**).
- **Hệ quy chiếu chuẩn**: Đồng bộ tọa độ **WGS84 (EPSG:4326)** và VN-2000.

### 2. 📐 Trình xem bản vẽ AutoCAD Client-Side (Full Web CAD Viewer)
- **Tốc độ xử lý tức thì**: Sử dụng bộ giải mã `dxf-parser` đọc trực tiếp file `.dxf` tại trình duyệt, không phụ thuộc hay làm nghẽn máy chủ.
- **Giao diện chuẩn AutoCAD**:
  - Không gian đồ họa Dark Charcoal (`#161922`).
  - **Lưới CAD thích ứng (Adaptive Grid)**: Tự động điều chỉnh khoảng cách vạch chia theo độ thu phóng, hiển thị gốc tọa độ $(0,0)$ với trục $X$ đỏ và $Y$ xanh lá.
  - **Con trỏ chữ thập (Crosshair & Pickbox)** đặc trưng của phần mềm thiết kế CAD.
  - **Thanh trạng thái tọa độ**: Đo đạc và hiển thị tọa độ thực tế con trỏ chuột $(X, Y, Z)$ và kích thước bao (Bounding Box DIM).
- **Hỗ trợ toàn diện các thực thể CAD**:
  - Đường thẳng `LINE`, Cung tròn `ARC`, Đường tròn `CIRCLE`, Điểm mốc `POINT`, Chữ ghi chú `TEXT`/`MTEXT`.
  - Đa tuyến `LWPOLYLINE` / `POLYLINE` tích hợp giải thuật **nội suy cung cong Bulge Arc (`tan(θ/4)`)** giúp đường cong tim tuyến mềm mại và chính xác 100%.
  - Bảng màu **AutoCAD ACI (1–255)** chuẩn xác kèm bảng điều khiển ẩn/hiện từng Layer.

### 3. 📊 Biểu đồ Mặt Cắt Ngang Cao Độ (Cross-Section Profile)
- Dựng biểu đồ mặt cắt ngang địa hình và cao độ tuyến đường thông qua **Recharts**.
- Tự động tính toán và mô phỏng độ dốc ngang 2 mái tiêu chuẩn (**2% Crown Slope**) từ tim đường ra mép đường.
- Cho phép duyệt qua từng trạm cọc lý trình để kiểm tra độ dốc thoát nước và cao độ trắc dọc/trắc ngang.

### 4. ⚙️ Tùy biến Tham số Tuyến & Ước lượng Bảo hành
- Điều chỉnh trực tiếp các thông số kỹ thuật:
  - Chiều dài phân đoạn khảo sát (**Segment Length** - mét).
  - Bề rộng lòng đường (**Road Width** - mét).
  - Kích thước tấm bê tông xi măng (**Slab Length** - mét).
- Tự động thống kê: Tổng chiều dài tuyến, tổng diện tích mặt đường ($m^2$), số lượng tấm BTXM cần bảo dưỡng/thay thế.

### 5. 📥 Xuất báo cáo Khối lượng & Hồ sơ Bảo hành
- **Báo Cáo Kỹ Thuật Excel (.xlsx)**: Tạo tự động file Excel đa trang tính:
  - *Sheet 1 - Tổng Hợp Khối Lượng*: Bảng tổng hợp chiều dài, diện tích và số lượng tấm BTXM.
  - *Sheet 2 - Chi Tiết Cọc Lý Trình*: Danh mục chi tiết toàn bộ các cọc, lý trình, cao độ $Z$ và tọa độ GPS WGS84.
- **Xuất dữ liệu GIS (.geojson)**: Tương thích hoàn toàn với QGIS, ArcGIS và các hệ thống quản lý giao thông thông minh (ITS).
- **In báo cáo (Print View)**: Hỗ trợ xuất PDF / In trực tiếp khổ A4/A3 cho hồ sơ nghiệm thu bảo hành.

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

| Lĩnh vực | Thư viện / Công nghệ | Vai trò |
| :--- | :--- | :--- |
| **Giao diện & Điều khiển** | React 19, Vite 8 | Nền tảng SPA hiệu năng cao, phản hồi tức thì với HMR |
| **Thiết kế & Giao diện** | Tailwind CSS v4, Lucide Icons | Giao diện Dark Command Center hiện đại, tối ưu trải nghiệm |
| **Bản đồ số GIS** | Leaflet, React-Leaflet | Trực quan hóa dữ liệu không gian, tim tuyến và đa giác mặt đường |
| **CAD Engine 2D** | Canvas 2D API, `dxf-parser`, `three` | Phân tích cú pháp DXF và kết xuất đồ họa vector AutoCAD |
| **Biểu đồ trắc ngang** | Recharts | Trực quan hóa mặt cắt ngang cao độ tuyến đường |
| **Xử lý Báo cáo** | SheetJS (`xlsx`) | Xuất báo cáo khối lượng nghiệm thu định dạng Excel |
| **Tích hợp API** | Axios, React Hot Toast | Kết nối Backend REST API và hiển thị thông báo trạng thái |

---

## 📁 Cấu trúc dự án

```text
roadguard-frontend/
├── public/
│   └── sample_road.dxf          # Bản vẽ CAD mẫu phục vụ demo & kiểm thử
├── src/
│   ├── components/
│   │   ├── CadMap.jsx           # Bản đồ số GIS tích hợp Leaflet & vệ tinh
│   │   ├── CadViewer.jsx        # Trình xem bản vẽ AutoCAD Web (Canvas 2D)
│   │   ├── CrossSectionProfile.jsx # Biểu đồ trắc ngang & cao độ 2 mái
│   │   └── Sidebar.jsx          # Điều khiển tham số, nạp file, xuất báo cáo
│   ├── utils/
│   │   └── excelExporter.js     # Tiện ích tạo và xuất báo cáo Excel (.xlsx)
│   ├── App.jsx                  # Root state, Tab bar và layout điều phối
│   ├── main.jsx                 # Entry point ứng dụng
│   └── index.css                # Cấu hình Tailwind CSS & Custom Themes
├── package.json                 # Khai báo thư viện & dependencies
├── vite.config.js               # Cấu hình Vite bundler
└── README.md
```

---

## ⚡ Cài đặt & Chạy ứng dụng

### 1. Yêu cầu môi trường
- **Node.js**: Phiên bản `18.x` hoặc `20.x` trở lên.
- **npm** (đi kèm Node.js) hoặc **pnpm** / **yarn**.

### 2. Cài đặt các gói phụ thuộc
```bash
# Di chuyển vào thư mục dự án frontend
cd roadguard-frontend

# Cài đặt toàn bộ dependencies
npm install
```

### 3. Khởi chạy môi trường phát triển (Development)
```bash
npm run dev
```
Truy cập giao diện tại: 👉 **`http://localhost:5173`**

### 4. Đóng gói triển khai (Production Build)
```bash
npm run build
```
Thư mục xuất bản: `dist/`.

---

## 🔗 Kết nối Backend API

Ứng dụng kết nối với máy chủ Backend **RoadGuard API** tại địa chỉ:
- URL mặc định: `http://localhost:5198`
- Endpoint bóc tách CAD: `POST /api/cad/parse-dxf`

---

## 👨‍💻 Tác giả & Thông tin đồ án

- **Tên đề tài**: **RoadGuard: Drone and AI-Based Road Defect Inspection and Warranty** (Hệ thống giám sát hư hỏng và quản lý bảo hành đường bộ ứng dụng Drone và AI).
- **Sinh viên thực hiện**: Gia Huy ([@GiaHuy361](https://github.com/GiaHuy361))
- **Giấy phép**: Phát hành theo chuẩn [MIT License](LICENSE).
