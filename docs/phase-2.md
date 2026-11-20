# Phase 2 · Ba hòn đảo

Ticket-02 chuẩn hóa Đêm 1 và bổ sung Đảo Cau, Đảo Chuông. Tuning và điểm nằm trong [game.contract.json](../game.contract.json). Vị trí, danh sách điểm sinh, cầu, dốc, bục và tháp nằm trong [maps.mjs](../src/maps.mjs).

## Tiêu chí nghiệm thu

| Mục | Khi nào đạt | Bằng chứng |
|---|---|---|
| Lướt | Nhấn Shift một lần chạy 14 m/s trong 12 tick, hồi 90 tick từ lúc bắt đầu, giữ độ cao trên không và vẫn mất Ngọn Lửa nếu bị chạm | Headless `dash`, test va chạm khi Lướt |
| Rơi và hồi sinh | Dưới Y = −10 mất một Ngọn Lửa và toàn bộ đom đóm dù đang bất tử. Lượt còn sống hồi sinh sau 60 tick | Headless `fall` |
| Đảo Cau | Cầu tre nối hai vùng có mặt đất. Bục phóng về đảo kia, duy trì hướng khi giữ phím ngược lại | Headless `bridge`, `jump-cau` |
| Đảo Chuông | Dốc nối Y = 0 lên Y = 3, bục nối tầng 1 lên tầng 2, tháp chặn phía trong bán kính 2 m | Headless `ramp`, `jump-chuong`, test tháp |
| Gió lớn | Lá và âm thanh báo trước 120 tick. Gió bắt đầu tại tick 1.800, kéo dài 300 tick và đẩy Mây 2 m/s theo hướng đã gieo seed | Headless `wind`, quan sát lớp hiển thị |
| Gió Lạc | Spawn đúng lịch, phát hiện Mây đủ đom đóm, cướp trước sát thương Bóng Mực, rồi bỏ chạy. Tỏa Sáng xua được và lấy lại đom đóm đã cướp | Headless `drifter`, `drifter-spawn`, test bất tử |
| Bùa Gió | Nhặt giống đom đóm, chạy 7,2 m/s, Lướt liên tiếp trong 600 tick. Bùa trở lại sau 2.700 tick | Headless `charm`, test hai lần Lướt |
| Chuỗi 3 Đêm | Menu dẫn tới giới thiệu có lời Ông Đăng. Thua cho chơi lại đúng Đêm. Thắng cho đi tiếp, Đêm 3 dẫn tới Bình Minh và hiện tổng điểm đã thắng | Kiểm tra trình duyệt và ảnh Bình Minh |
| Tạm dừng | Esc hoặc P mở menu. Tiếp tục quay lại đúng trạng thái. Chơi lại, Cài đặt và Về menu hoạt động. Tick gameplay, thời gian và hiệu lực đứng yên | Headless `pause`, kiểm tra trình duyệt |
| Cài đặt | Âm lượng thay đổi mức gain. Độ nhạy thay đổi mức quay camera. Hai giá trị giữ nguyên sau khi tải lại | Kiểm tra trình duyệt và lớp âm thanh/điều khiển |
| Âm thanh | Chơi hợp âm nền theo Đêm. Có hiệu ứng nhặt, thắp đèn, Tỏa Sáng, bị đánh, nhảy, Lướt, thắng, thua, Bóng Mực xuất hiện và 10 giây cuối | [audio.mjs](../src/audio.mjs) và điểm gọi trong [main.mjs](../src/main.mjs) |
| HUD | Lửa ở trái, đồng hồ giữa, đèn và điểm ở phải, 10 ô đom đóm dưới giữa, hồi chiêu dưới phải. Có gợi ý E gần đèn và mũi tên nếu đèn gần nhất ngoài màn hình | Kiểm tra trình duyệt, ảnh ba Đêm |
| Màu và ánh sáng | Dùng bảng màu Ticket-02. Cường độ môi trường theo `0.15 + 0.55 × số đèn đã sáng / tổng đèn` | [scene.mjs](../src/scene.mjs) và [styles.css](../styles.css) |
| Hiệu năng | Headless hoàn thành 21.600 tick trong 30 giây. Bản thường đo trung bình tối thiểu 30 FPS ở 1280×720 | JSON headless và trình duyệt |

## Quy ước khi đề chưa chi tiết

- Góc bản đồ tính từ +X về +Z. Vị trí xuất phát các Đêm là gốc tọa độ và hướng ban đầu +Z. Các bề mặt của Đảo Chuông có độ cao riêng, Mây lên qua dốc hoặc bục và rơi xuống tầng dưới khi rời mép.
- Tương tác và vùng an toàn dùng XZ theo quy ước v1.0. Nhặt và chạm xét thêm chiều cao đúng Ticket-02. Tỏa Sáng xét khoảng cách 3D từ chân Mây cộng 0,8 m.
- `night_start` ghi ở tick 0 ngay sau snapshot gốc. `invuln` là boolean và `ttl_s` của đom đóm trên điểm sinh là `null`. Tick tiếp tục tăng khi tạm dừng. Tick nhấn Tiếp tục cũng chạy một bước gameplay.
- Bóng Mực mặc định bắt đầu di chuyển từ tick sau khi sinh. Gió Lạc cũng chỉ có thể phát hiện và tương tác từ tick sau. Đom đóm rơi có TTL 480 tick, nằm tại mặt đất dưới điểm rơi.
- Gió Lạc dùng các điểm sương trong danh sách điểm sinh Bóng Mực của Đảo Cau và Đảo Chuông.
- Ở tick sát bình minh, xử lý hành động, va chạm và sinh thực thể trước. Mất hết Ngọn Lửa có ưu tiên cao nhất, sau đó xét đủ đèn.

## Chạy lại bằng chứng

```sh
npm test
npm run proof
```

[Kịch bản hồi quy Phase 1](../tests/phase1.test.mjs) đã cập nhật số chuẩn, điểm theo đom đóm nạp, chiều cao nhặt và tên trạng thái. [Kịch bản Phase 2](../tests/phase2.test.mjs) chạy các fixture trong [phase2-scenarios.mjs](../tests/phase2-scenarios.mjs). [Kết quả headless](proof/phase-2-headless.json) lưu tham số chạy, các snapshot và sự kiện liên quan, cùng SHA-256 của lần kiểm tra tính tất định.

Chạy `node scripts/verify-browser.mjs` với Playwright và Chromium để đo 5 giây gameplay thật mỗi Đêm sau khi dựng cảnh. Biến `PHASE2_PLAYWRIGHT` có thể trỏ tới thư mục package Playwright có sẵn. `PHASE2_BROWSER` có thể trỏ tới Chrome/Chromium đã cài. `PHASE2_SWIFTSHADER=1` chọn SwiftShader khi đo bằng dựng hình phần mềm. Script kiểm tra mức 30 FPS và kích thước bộ đệm, rồi lưu [kết quả trình duyệt](proof/phase-2-browser.json). Để kiểm tra màn kết quả, điều hướng và đếm ngược, Playwright dùng fixture ngay trước đèn cuối, với 0 Ngọn Lửa hoặc 10,2 giây còn lại. Phép đo FPS lấy ở bản đồ mặc định trước các fixture.

Ảnh kiểm chứng [Đảo Bến](proof/phase-2-night-1.png), [Đảo Cau](proof/phase-2-night-2.png), [Đảo Chuông](proof/phase-2-night-3.png) và [Bình Minh](proof/phase-2-dawn.png).

Phép đo bản thường dùng Chromium và Intel Iris Xe trên Windows. Cả ba Đêm đạt khoảng 60 FPS ở bộ đệm 1280×720. Chế độ dựng bằng CPU SwiftShader có các lượt thấp hơn 30 FPS.

## Nhật ký AI

- Dùng Codex để cập nhật mô phỏng và bản đồ trước, sau đó mở rộng giao diện, âm thanh, kịch bản và bằng chứng. Tách dựng cảnh khỏi mô phỏng giúp thay HUD và tối ưu FPS trong khi giữ nguyên Test Contract.
- Kịch bản kiểm tra cầu ban đầu tính 6 m/s trong toàn bộ đoạn đường, nhưng Bùa Gió trên cầu tự kích hoạt đúng luật và nâng tốc độ. Đã cô lập kịch bản cầu bằng danh sách bùa rỗng và giữ kịch bản Bùa Gió riêng để xác minh cả hai kết quả.
- Lượt đo đầu trên SwiftShader tụt dưới 30 FPS, rõ nhất ở Đảo Chuông. Đã chuyển vật liệu địa hình sang Lambert, bỏ khử răng cưa đa mẫu và bỏ tone mapping toàn cảnh. Đo lại ở cùng độ phân giải 1280×720 và cùng ba bản đồ.
- Ước tính thủ công dựa trên độ dài ticket, mã, hội thoại và dữ liệu công cụ khoảng 35–60 nghìn token nội dung. Số token tính phí chưa được đo.
