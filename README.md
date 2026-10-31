# wetube ciné — Rạp phim của chúng mình (Full Clone)

> *"Một chiếc rạp, cả hội cùng xem. Rạp phim 3D với 100 ghế, bình chọn YouTube và trò chuyện cùng bạn bè."*

## Cấu trúc thư mục
```text
wetube-cine-clone/
├── index.html                   # File HTML chính (chuẩn meta, Google Fonts Inter & JetBrains Mono)
├── brand-mark.svg               # Icon nhận diện thương hiệu wetube ciné
├── style.css                    # Hệ thống giao diện 3D Theater, Ambilight CSS @property, Responsive HUD
├── app.js                       # Logic 100 ghế 3D (Differential DOM), POV Camera, YouTube API, BroadcastChannel Sync
├── server.js                    # Web server Node.js native nhẹ (zero-dependency)
├── assets/
│   ├── index-DXnS2hfP.css       # Bản build tương thích đường dẫn gốc /assets/
│   └── index-UAXrzXEs.js        # Bản build tương thích đường dẫn gốc /assets/
├── package.json                 # Cấu hình lệnh chạy nhanh (npm start)
└── README.md                    # Hướng dẫn sử dụng
```

## Các lỗi đã được rà soát và khắc phục triệt để
1. **Lỗi kẹt xoay chuột 3D qua iFrame (Stuck Dragging Bug):** Đã bổ sung cơ chế `pointer-events: none` cho iFrame khi kéo xoay camera và gán `setPointerCapture`, chấm dứt hoàn toàn hiện tượng nhả chuột nhưng camera vẫn bị xoay liên tục.
2. **Tối ưu hóa hiệu năng 60/120 FPS (Differential DOM):** Chuyển đổi từ cơ chế render lại toàn bộ 100 ghế sang so khớp trạng thái vi sai (Differential Rendering) trên từng node, loại bỏ reflow giật lag và giữ chuyển động avatar luôn mượt mà.
3. **Đồng bộ đa tab (BroadcastChannel) hoàn chỉnh:** 
   - Đã sửa lỗi mất sự kiện `SEAT_CHANGE`.
   - Mỗi tab có `clientId` riêng biệt, không còn bị trùng danh tính người xem.
   - Trạng thái bình chọn (`votedByMe`) được quản lý độc lập theo từng client, không bị ghi đè chéo khi các tab vote bài hát.
   - Thêm đồng bộ Play/Pause, Skip Vote và Roster trực tiếp giữa các tab.
4. **Trình phát YouTube bền bỉ:**
   - Hỗ trợ đầy đủ tất cả định dạng URL YouTube (`youtube.com/watch`, `youtu.be`, `shorts`, `live`, `music.youtube.com`, link có timestamp).
   - Tự động lấy tiêu đề qua YouTube Official oEmbed và NoEmbed.
   - Tự động kích hoạt cơ chế Fallback iFrame nếu script YouTube API bị chặn mạng hoặc extension adblock.
5. **Góc nhìn thực tế (POV Mode) chuẩn điện ảnh:**
   - Giảm độ hiển thị của chính avatar người ngồi để không che khuất màn chiếu.
   - Cho phép rê chuột nhìn nhẹ quanh rạp thay vì nhảy giật về chế độ orbit.
6. **Âm thanh & Phím tắt:**
   - Cơ chế mở khóa AudioContext không lỗi console.
   - Tiếng pop chỉ phát khi người dùng chủ động tương tác; các bot phụ hoạ visual êm dịu, không ngắt quãng âm thanh phim.
   - Phím tắt đầy đủ: `Space` (Phát/Tạm dừng), `V` (Đổi góc nhìn POV/3D), `L` (Đèn rạp), `M` (Tắt/Bật tiếng), `1-6` (Tung hiệu ứng bỏng ngô, tim, quẩy...), `Escape` (Đóng modal).

## Cách chạy dự án
1. **Cách 1 (Nhanh nhất qua Node.js):**
   ```bash
   npm start
   ```
   Sau đó mở trình duyệt truy cập: `http://localhost:8080`
2. **Cách 2 (Mở trực tiếp):** Nhấp đúp vào file `index.html` trên trình duyệt bất kỳ (Chrome, Edge, Safari, Firefox).
3. **Cách 3 (Dùng Python hoặc VS Code):**
   - Chạy lệnh: `python -m http.server 8080` rồi mở `http://localhost:8080`.
   - Hoặc chuột phải vào `index.html` -> **Open with Live Server**.
