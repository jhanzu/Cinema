# Hanzu Cinema — Rạp phim của chúng mình (3D 100 Ghế)

> *"Một chiếc rạp, cả hội cùng xem. Rạp phim 3D 100 ghế kết nối thời gian thực, bình chọn bài hát YouTube và trò chuyện cùng bạn bè."*

## 🌟 Điểm nổi bật
- **Onboarding Đặt Tên & Giới Tính:** Khi vào rạp, khán giả được chọn tên hiển thị và giới tính (👨 **Nam**, 👩 **Nữ**, ✨ **Khác**). Nhân vật hình nhân 3D (Block Mannequin) trên từng ghế sẽ tự động thay đổi kiểu tóc, kính 3D neon và nametag theo đúng giới tính đã chọn.
- **Mô hình 3D Volumetric 100 Ghế:** Ghế bọc da công thái học với tựa lưng, đệm ngồi, tay vịn tích hợp khay đựng cốc 3D và chân trụ kim loại gắn sàn. Hàng ghế phẳng song song mặt đất chuẩn điện ảnh.
- **Độ mượt mà 60 FPS & Không Layout Thrashing:** Tối ưu hóa GPU Backface Culling, CSS Containment, tách biệt hoàn toàn việc đọc DOM khỏi vòng lặp animation.
- **Real-Time Multi-User WebSocket Hub:** Kết nối đa thiết bị (điện thoại, laptop, tablet cùng Wi-Fi / LAN / Internet) đồng bộ vị trí ghế ngồi, chat trực tiếp, biểu cảm emoji 3D và điều khiển phát nhạc.
- **Đồng bộ toàn cầu trên GitHub Pages:** Hỗ trợ kết nối máy chủ Cloud WSS (Render.com, Railway, VPS) hoặc tự động đính kèm tham số `?ws=...` trong link mời bạn bè để tất cả mọi người cùng vào một rạp chiếu chung.
- **Cơ chế Skip bài thông minh (30% Vote):** Tự động tính toán theo 30% số lượng khán giả thực tế, tự động khoá nút khi hết hàng đợi để tránh lỗi và cho phép huỷ vote văn minh.
- **Tông màu Tím & Xanh Dương Huyền Bí:** Phong cách neon cyberpunk kết hợp cùng logo chữ ký cách điệu Hanzu và biểu tượng YouTube hài hòa.

---

## 🌐 Hướng dẫn kết nối mọi người cùng vào 1 Server chung trên GitHub Pages (`https://jhanzu.github.io/Cinema/`)

Vì **GitHub Pages** là dịch vụ lưu trữ tĩnh (Static Hosting - chỉ chạy HTML/CSS/JS, không chạy được Node.js backend), để tất cả mọi người truy cập link `https://jhanzu.github.io/Cinema/` đều vào cùng 1 rạp chung, chúng ta cần một máy chủ WebSocket chạy online (miễn phí 100%):

### Cách 1: Triển khai backend lên Render.com (Khuyên dùng - 100% Free & Tự động)
1. Đăng ký tài khoản miễn phí tại **[render.com](https://render.com)**.
2. Bấm nút **New +** -> Chọn **Web Service**.
3. Kết nối với repository GitHub **`jhanzu/Cinema`**.
4. Render sẽ tự động nhận diện file `render.yaml` và `server.js`:
   - **Runtime:** Node
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Bấm **Deploy Web Service**. Sau ~1 phút, bạn sẽ nhận được đường dẫn dạng:
   `https://hanzu-cinema-ws.onrender.com`
6. Địa chỉ WebSocket của bạn sẽ là:
   `wss://hanzu-cinema-ws.onrender.com/ws`

### Cách 2: Chia sẻ link kèm Server cho bạn bè (Không cần cài đặt thêm)
Trên trang web `https://jhanzu.github.io/Cinema/`:
1. Bấm vào nút **"Cài đặt Server"** trên thanh tiêu đề (thanh navbar trên cùng).
2. Dán link WebSocket Render của bạn vào ô WSS và bấm **Lưu**.
3. Bấm nút **"🔗 Mời bạn"** -> Hệ thống sẽ tự động sao chép link rạp kèm thông tin máy chủ:
   `https://jhanzu.github.io/Cinema/?room=rap-chung-minh&ws=wss://...`
4. Bất kỳ ai click vào đường link này sẽ tự động kết nối vào chung một phòng chiếu và thấy nhau ngay lập tức!

---

## 🚀 Khởi chạy thử nghiệm cục bộ (Local / LAN)
```bash
node server.js
```
- **Truy cập trên máy:** `http://localhost:8080`
- **Mời bạn bè cùng mạng Wi-Fi:** Bấm nút **"Mời bạn"** để nhận link IP nội bộ.
