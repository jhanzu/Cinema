# Hanzu Cinema — Rạp phim của chúng mình (3D 100 Ghế)

> *"Một chiếc rạp, cả hội cùng xem. Rạp phim 3D 100 ghế kết nối thời gian thực, bình chọn bài hát YouTube và trò chuyện cùng bạn bè."*

## 🌟 Điểm nổi bật
- **Mô hình 3D Volumetric 100 Ghế:** Ghế bọc da công thái học với tựa lưng, đệm ngồi, tay vịn tích hợp khay đựng cốc 3D và chân trụ kim loại gắn sàn. Hàng ghế phẳng song song mặt đất chuẩn điện ảnh.
- **Độ mượt mà 60 FPS & Không Layout Thrashing:** Tối ưu hóa GPU Backface Culling, CSS Containment, tách biệt hoàn toàn việc đọc DOM khỏi vòng lặp animation.
- **Real-Time Multi-User WebSocket Hub:** Kết nối đa thiết bị (điện thoại, laptop, tablet cùng Wi-Fi / LAN / Internet) đồng bộ vị trí ghế ngồi, chat trực tiếp, biểu cảm emoji 3D và điều khiển phát nhạc.
- **Cơ chế Skip bài thông minh (30% Vote):** Tự động tính toán theo 30% số lượng khán giả thực tế, tự động khoá nút khi hết hàng đợi để tránh lỗi và cho phép huỷ vote văn minh.
- **Tông màu Tím & Xanh Dương Huyền Bí:** Phong cách neon cyberpunk kết hợp cùng logo chữ ký cách điệu Hanzu và biểu tượng YouTube hài hòa.

## 📁 Cấu trúc thư mục
```text
wetube-cine-clone/
├── index.html                   # Giao diện chính (Meta tags, Google Fonts Caveat, Inter, JetBrains Mono)
├── brand-mark.svg               # Logo chữ ký nghệ thuật Hanzu kết hợp YouTube (vector SVG)
├── style.css                    # Hệ thống 3D Auditorium, Ambilight Engine, Bảng điều khiển HUD
├── app.js                       # Logic camera 3D, POV ghế ngồi, Client WebSocket + BroadcastChannel
├── server.js                    # Máy chủ Node.js Real-time HTTP + RFC 6455 WebSocket Hub (Zero-dependency)
├── assets/
│   ├── index-DXnS2hfP.css       # Bundle CSS đồng bộ
│   └── index-UAXrzXEs.js        # Bundle JS đồng bộ
├── package.json                 # Cấu hình dự án
└── README.md                    # Hướng dẫn sử dụng
```

## 🚀 Khởi chạy dự án
```bash
node server.js
```
- **Truy cập trên máy:** `http://localhost:8080`
- **Mời bạn bè cùng mạng Wi-Fi / LAN:** Nhấp nút **"Mời bạn"** để lấy link mạng nội bộ (VD: `http://192.168.1.147:8080`).
