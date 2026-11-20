# Phase 4 · Bình minh

## Kiểm chứng

| Hạng mục | Tiêu chí và bằng chứng |
|---|---|
| Benchmark chuẩn | Cảnh Đảo Bến có 200 Bóng Mực `wander`, 100 đom đóm và L1–L3 ở 100 dầu. Camera đi một vòng mỗi 15 giây ở bán kính 30 m và Y = 15 m. `tests/phase4.test.mjs` kiểm tra bố trí và công thức. [Kết quả chạy](../bench.json) |
| Soak | Một tiến trình Node chơi 10 Đêm với seed 7 đến 16. RSS được đọc sau GC ở lúc tải Đêm đầu tiên và sau khi giải phóng Đêm cuối. [Kết quả chạy](../soak.json) |
| Xếp hạng | Màn thua và Bình Minh cho ghi điểm. Bảng giữ top 10, điểm bằng nhau xếp thời gian sớm trước. Kiểm thử xác nhận tệp đĩa còn đọc được khi tải lại và lệnh xuất dùng cùng tệp. [Ảnh bảng xếp hạng](proof/phase-4-leaderboard.png) |
| Đổi phím và trợ năng | Kiểm thử cả chín hành động, báo trùng, khôi phục, lưu cài đặt, tắt rung và chớp màn hình, đo chữ 18 và 22,5 px. Kiểm tra mũi tên Bóng Mực và phụ đề gió, dầu, đếm ngược. [Ảnh đổi phím](proof/phase-4-controls.png) · [Kết quả trình duyệt](proof/phase-4-browser.json) |
| Hồi quy và tính tất định | `npm test` chạy Phase 1–4. `npm run proof` tái tạo kết quả v1.3 theo cơ chế v1.2. [Bằng chứng headless](proof/phase-4-headless.json) |
| Bàn giao | Gói ZIP kèm thư viện và trình chạy Node, video MP4 ngắn, các tag và tài liệu. Bản giải nén mở cảnh WebGL và giữ bảng xếp hạng qua lần khởi động lại máy chủ. [Kết quả gói](proof/phase-4-package.json) · [Hướng dẫn gói](release-run.md) · [Retro](retro.md) |

## Cách đo

Benchmark đo các khoảng từ lần gọi dựng khung đến lần tiếp theo hoàn tất trong cửa sổ đo 30 giây, sau 3 giây khởi động. Kết quả máy phát triển dùng Windows, Intel Core i7-1255U, Intel Iris Xe và Chromium, với cửa sổ và bộ đệm 1280×720. Số đo ngưỡng chính thức do giảng viên chạy trên máy chấm. `peak_mem_mb` là `null` cho bản web.

Lượt đo lưu trong repo đạt 343,815 FPS trung bình, 98,841 FPS ở 1% khung chậm nhất, P95 5,1 ms và tải 3.768 ms. Soak có 0 lỗi qua 10 Đêm, RSS tăng từ 46,25 MB lên 52,92 MB, khoảng 14,4%.

Kiểm thử UI dùng kịch bản chuẩn bị trước một số tình huống để kiểm tra lưu điểm, thay phím và cảnh báo. Bảng xếp hạng kiểm thử được lưu ở thư mục tạm riêng. Phép đo FPS nằm ở cảnh mặc định. Video quay điều khiển thật trên bản đồ mặc định rồi hiện kết quả lệnh test, headless, benchmark và soak.

```sh
npm test
npm run proof
node scripts/verify-browser.mjs
npm run bench -- --seed 42 --duration 30 --out bench.json
npm run soak -- --seed 7 --nights 10 --out soak.json
npm run package
```

Playwright tìm trình duyệt hệ thống hoặc bản Chromium đã cài. `LAB_BROWSER` chỉ định trình duyệt. `LAB_FFMPEG` chỉ định FFmpeg khi chạy `node scripts/record-demo.mjs` để tạo lại video trong `dist/`.

Bản phát hành chạy bằng Node lưu bảng ở `.data/leaderboard.json`; biến `DDL_DATA_DIR` chọn thư mục khác khi kiểm thử. Nếu tự phục vụ thư mục dưới dạng web tĩnh bằng HTTP, trình duyệt dùng bộ nhớ cục bộ của origin. Để dùng chung dữ liệu giữa giao diện và lệnh xuất, mở qua trình chạy Node được đóng gói.
