# Đêm 1 – Đảo Bến

Tài liệu này ghi nhận bản `phase-1` với Test Contract v1.0. Để tạo lại bằng chứng v1.0, chạy lệnh từ tag đó. Nhánh chính dùng v1.1 và các kiểm tra hồi quy với số chuẩn.

## Giả định và quyết định

- Một đom đóm bằng một đơn vị ánh sáng. Mây mang tối đa 12 đơn vị. Mỗi đèn cần đủ 4, cộng dồn qua nhiều lần nạp. Khi hai đèn cách Mây bằng nhau, đèn có ID nhỏ hơn được chọn trước.
- Đêm dài 180 giây. Mây có 3 sinh lực và miễn nhiễm trong 1,5 giây sau mỗi lần trúng đòn. Va chạm đánh rơi một nửa số đom đóm, làm tròn xuống. Đom đóm rơi có thể nhặt lại.
- Tỏa sáng tốn 2 đom đóm, kể cả khi vùng tác động trống. Đòn hợp lệ đẩy mục tiêu 3 m, làm choáng 2 giây và hồi sau 1,2 giây. Mỗi nút hành động kích hoạt lúc chuyển sang trạng thái nhấn.
- Bóng Mực tránh vùng có bán kính 4,2 m quanh đèn đã sáng. Màn mặc định mở đầu với hai Bóng Mực và có thêm một con mỗi 23 giây, tối đa năm con. Kịch bản có thể thay thế danh sách ban đầu hoặc tắt sinh tự động.
- Mặt đảo ở Y = 0, bán kính 31 m. So khoảng cách theo XZ, kể cả lúc nhảy. Mây có thể di chuyển tới bờ nhưng mép đảo chặn rơi. Cảnh vật trang trí không tham gia va chạm.
- Thắng khi đủ năm đèn, thua khi hết sinh lực hoặc tới bình minh. Điểm thưởng thời gian và sinh lực chỉ tính lúc thắng.
- Dùng Node.js và Three.js cho bản web. Cả CLI và trình duyệt đọc tuning từ cùng một contract và dùng chung lớp mô phỏng. Các thông số còn lại nằm trong [game.contract.json](../game.contract.json).

## Tiêu chí nghiệm thu và bằng chứng

| Yêu cầu | Cách kiểm chứng | Bằng chứng |
|---|---|---|
| Di chuyển, xoay hướng, chuẩn hóa đường chéo và nhảy | Kiểm tra vị trí theo tick và phím kích hoạt | [Bộ test](../tests/phase1.test.mjs) |
| Nhặt đom đóm, giới hạn sức chứa và nạp đủ 5 đèn | Kiểm tra bán kính, thao tác nạp từng phần, chạy màn mặc định từ đầu đến khi thắng | [JSONL màn mặc định](proof/phase-1-default-night.jsonl) |
| Bóng Mực đuổi, va chạm, đánh rơi và tránh đèn | Kiểm tra bán kính, vùng an toàn và hai lần trúng đòn đúng tick | [JSONL va chạm](proof/phase-1-collision.jsonl) |
| Xua Bóng Mực bằng ánh sáng | Kiểm tra chi phí, bán kính, hất lùi, choáng và hồi chiêu | [JSONL tỏa sáng](proof/phase-1-pulse.jsonl) |
| Kết thúc lượt, điểm, đồng hồ | Kiểm tra thắng, hết sinh lực và bình minh | [Tổng hợp](proof/phase-1-summary.json), [JSONL bình minh](proof/phase-1-dawn.jsonl) |
| Giao diện 3D, HUD và chơi lại | Khởi chạy trên Chromium, di chuyển tới đèn đầu tiên, nạp đèn và kiểm tra HUD. Chạy tiếp đến khi thua rồi chơi lại | [Ảnh kiểm chứng](proof/phase-1-gameplay.png) |
| Test Contract v1.0 | Kiểm tra tick 0, cadence, mã thoát, SHA-256 và so sánh từng byte ở hai lần chạy | [Tổng hợp](proof/phase-1-summary.json), [Bộ test](../tests/phase1.test.mjs) |

Chạy `npm test` để kiểm tra logic và định dạng CLI. Chạy `npm run proof` để tạo lại kịch bản, JSONL và kết quả tổng hợp. Lộ trình màn mặc định dùng input điều khiển thông thường và giữ đom đóm cùng Bóng Mực tự sinh.

11 bài kiểm tra đạt trên Node.js 24.22.3, Windows. Lượt headless màn mặc định thắng ở tick 911 với 1.178 điểm. Trong Chromium, kiểm tra tự động đã nhấn Bắt đầu, nhảy và đi tới L1, gom đom đóm, nạp đèn, kiểm tra HUD, đợi đến lúc thua rồi nhấn Chơi lại. HUD đặt lại về 3 sinh lực, 0 đèn và 03:00. Trình duyệt không báo lỗi JavaScript.

## Nhật ký dùng AI

- Dùng Codex để chuyển PRD thành tiêu chí nghiệm thu, xây mô phỏng xác định, dựng cảnh Three.js và viết kịch bản kiểm chứng. Hướng dẫn build, test và lưu bằng chứng nằm trong [AGENTS.md](../AGENTS.md).
- Giữ thông số ở một nguồn, ghim một thư viện dựng cảnh và kiểm tra CLI trước khi ghép cảnh 3D. Cách này giảm số lần sửa phần logic dùng chung.
- Bản nháp của mô phỏng chặn thời gian còn lại ở 0, làm sai công thức contract khi kịch bản kết thúc giữa hai mốc tick. Đã giữ phép trừ chính xác trong headless, chặn ở 0 riêng cho HUD và bổ sung trường hợp thời lượng 0,01 giây vào bộ test.
- Ước tính thủ công cho phiên Phase 1 khoảng 20–40 nghìn token nội dung, dựa trên yêu cầu, mã tạo và kết quả kiểm tra. Số liệu thực từ nhà cung cấp và chi phí chưa được đo.
