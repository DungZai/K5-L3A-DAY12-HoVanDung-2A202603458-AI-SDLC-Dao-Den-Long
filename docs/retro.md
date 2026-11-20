# Retro · Đảo Đèn Lồng

## Bốn lần bàn giao

| Giai đoạn | Cách đánh giá và điều rút ra |
|---|---|
| Phase 1 | 11 test và một lộ trình headless thắng ở tick 911. Dùng chung mô phỏng 60 Hz giúp đối chiếu cảnh chơi với JSONL. Agent từng chặn thời gian còn lại ở 0. Kịch bản 0,01 giây phát hiện sai công thức contract, nên chuyển việc chặn về HUD. |
| Phase 2 | 26 test, ba bản đồ và phép đo 1280×720. Kịch bản cầu giả định chạy 6 m/s trên cả đoạn, nhưng Bùa Gió đặt trên cầu đã tăng tốc đúng luật. Tách kịch bản cầu và bùa giúp xác nhận cả hai. Lượt đo SwiftShader đầu cho thấy chi phí dựng cảnh cao, từ đó thay vật liệu và đo lại trên GPU Intel. |
| Phase 3 | 38 test. Các kịch bản cạn dầu, châm lại và bình minh dùng tick chính xác để thấy khác biệt giữa luật cũ và mới. Giữ bằng chứng v1.1 ở tag cũ giúp cập nhật kỳ vọng hồi quy rõ ràng. ADR ghi lại vì sao dầu dùng số nguyên 1/60 và vì sao xét thắng sau cập nhật tick cuối. |
| Phase 4 | Cảnh benchmark, soak cùng tiến trình, kiểm tra bảng xếp hạng trên đĩa và kiểm thử trợ năng trên trình duyệt. Gom vật thể lặp bằng instancing giúp cảnh 200 Bóng Mực và 100 đom đóm vẫn dựng được ở 1280×720. Bản đóng gói được kiểm tra như một thư mục độc lập. |

## Làm việc với AI

AI hiệu quả khi đầu việc có số đo và ví dụ đầu vào rõ. Các lỗi khó thấy thường đến từ độ chính xác số, thứ tự xử lý trong một tick hoặc giả định của chính bộ test. Với cầu tre, kiểm thử ban đầu báo sai vì chưa tính bùa. Với luật bình minh, kịch bản đèn cạn đúng tick cuối chứng minh điểm và kết thúc dựa vào trạng thái đã cập nhật. Với hiệu năng, số đo trình duyệt và bộ đệm thật mới dùng để quyết định đạt hay chưa đạt. Kết quả của máy phát triển được giữ cùng cấu hình để giảng viên có thể chạy lại theo máy chấm.

`AGENTS.md` hữu ích nhất ở các quy ước xuyên suốt như việc dùng chung mô phỏng và phân biệt `tick` với `sim_tick`. Skill kiểm chứng giúp chạy lại các lệnh mà không phải nạp toàn bộ tài liệu. Các script headless và Playwright biến yêu cầu thành bước kiểm chứng có thể thực hiện lại. Các tag lưu bằng chứng theo đúng phiên bản luật.

## Token và lần làm sau

Ước tính thủ công theo độ dài yêu cầu, mã và kết quả công cụ khoảng **120–220 nghìn token nội dung** cho bốn giai đoạn. Các khoảng theo thứ tự là 20–40, 35–60, 25–45 và 40–75 nghìn. Đây là ước tính phục vụ retro, chưa có số chi phí tiền từ nhà cung cấp. Dùng lại fixture, chỉ đọc phần file liên quan, chạy test ngắn trước khi dựng bản 3D và tái sử dụng script là các cách giảm lượt chạy và làm lại.

Nếu làm lại, mình sẽ tạo ngay từ Phase 1 một bảng ánh xạ yêu cầu sang fixture, chốt các ca biên ở tick thay luật trước khi sửa code, và chuẩn bị sớm pipeline đo trình duyệt, đóng gói và quay video. Như vậy mỗi thay đổi nhỏ đều có thể được chạy lại trên bản sạch trong cùng một buổi lab.
