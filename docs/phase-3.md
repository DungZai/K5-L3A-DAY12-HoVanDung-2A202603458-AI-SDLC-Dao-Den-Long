# Phase 3 · Đèn cạn dầu

[ADR 003](adr/003-giu-den-toi-binh-minh.md) ghi quyết định về mô hình trạng thái và luật thắng. [Changelog](../CHANGELOG.md) liệt kê các thay đổi phá tương thích với v1.1.

| Yêu cầu | Tiêu chí nghiệm thu | Kiểm chứng |
|---|---|---|
| Dầu, châm và thắp lại | Đèn 100 dầu tắt đúng sau 6.000 tick nếu chỉ hao tự nhiên. Có thể dùng 5 đom đóm thắp lại ngay tick đó. Đèn gần nhất còn chỗ nhận dầu được ưu tiên, bằng nhau theo ID | `relight`, `refuel` |
| Bóng Mực hút dầu | Hai Bóng Mực hút 10 dầu mỗi giây cộng với hao tự nhiên. Bóng lang thang ưu tiên đèn yếu, còn Bóng đang đuổi giữ mục tiêu Mây | `drain`, test tìm mục tiêu |
| Ngưỡng an toàn | 30 dầu còn vùng an toàn. Châm lên ngưỡng từ mức thấp đẩy Bóng Mực ra trong 30 tick. Bóng đang hút được 15 điểm khi trúng Tỏa Sáng | `restore-safety`, `pulse-drain` |
| Sống đến bình minh | Không kết thúc sớm. Đủ 3/5, 4/6 hoặc 5/7 đèn và còn Ngọn Lửa tại tick cuối mới thắng | `dawn`, `dawn-out`, test ngưỡng ba Đêm và hết Ngọn Lửa |
| Sức chứa và điểm | Mỗi lần thắp thêm 2 sức chứa, tối đa 20, đặt lại đầu Đêm. Điểm bình minh dùng dầu nguyên và Ngọn Lửa | `capacity`, `relight`, `dawn` |
| Pause | Dầu và nhịp hút đứng yên dù `tick` tiếp tục tăng | `pause-fuel` |
| Bản 3D dễ phân biệt | Đèn sáng có thanh dầu. Đèn yếu nhấp nháy 1 Hz. Đèn tắt xẹp 20% và hiện vết rách. Bật bảng màu sẽ đổi mắt/viền Bóng Mực sang xanh và cảnh báo sang trắng có ⚠. Tải lại vẫn giữ tuỳ chọn | Kiểm tra trình duyệt và ảnh |

## Các kiểm tra cũ đã cập nhật

- `phase1.test.mjs` giữ các kiểm tra input, di chuyển, nạp, va chạm và tính tất định còn áp dụng. Kỳ vọng giá trị thời gian, điểm nạp và lý do thắng cũ đổi theo Ticket-03. Trường hợp kết thúc của Phase 2 được thay bằng việc thắp đúng ngưỡng ở tick bình minh và ưu tiên hết Ngọn Lửa.
- `phase2.test.mjs` giữ bản đồ, nhảy, Lướt, rơi, Gió Lạc, Bùa Gió và gió lớn. Kịch bản hiệu năng chạy đủ 18.000 tick của thời lượng Đêm 3 mới. Scenario benchmark đặt bất tử đủ lâu để đo toàn bộ bước gameplay kể cả lúc đèn cạn.

## Quy ước

- `fuel_drain` ghi sau mỗi 60 tick hút liên tục của từng Bóng Mực. Nếu có nhiều Bóng trên cùng đèn, log dùng lượng dầu còn lại sau khi đã trừ tổng.
- Tương tác dùng dầu sau bước hao của tick. Một đèn đầy ở snapshot trước có thể nhận một đom đóm ở tick kế tiếp dù giá trị hiển thị vẫn làm tròn thành 100.
- Khi scenario bỏ trống `ever_lit`, giá trị mặc định lấy theo `lit`. `relit_count` theo số lần Mây thắp lại trong lượt này. Bóng Mực thôi hút khi đèn tắt, đầy lại đến mức an toàn hoặc ra khỏi tầm. Hết choáng trở về `wander` trước khi xét mục tiêu mới.

## Chạy kiểm chứng

```sh
npm test
npm run proof
```

[Bằng chứng headless](proof/phase-3-headless.json) chứa tham số, snapshot, sự kiện, số đo trọn Đêm và kết quả so từng byte. [Bằng chứng trình duyệt](proof/phase-3-browser.json) kiểm tra đèn, HUD, cài đặt và luồng bình minh bằng fixture. Đo FPS giữ bản đồ chuẩn và bộ đệm 1280×720. Chạy `node scripts/verify-browser.mjs` với Playwright và Chromium. Có thể dùng `LAB_PLAYWRIGHT` và `LAB_BROWSER` để chọn công cụ đã cài.

[Ảnh thanh dầu và bảng màu](proof/phase-3-fuel-and-palette.png) · [Ảnh kết thúc Bình Minh](proof/phase-3-dawn.png)

## Nhật ký AI

Dùng Codex để truy vết các kỳ vọng cũ bị thay thế, tách mô hình dầu khỏi dựng cảnh và rà thứ tự xử lý ở tick cạn dầu, tick hồi vùng an toàn và tick bình minh. Ước tính thủ công 25–45 nghìn token nội dung dựa trên ticket, mã và kết quả kiểm tra. Số token tính phí chưa được đo.
