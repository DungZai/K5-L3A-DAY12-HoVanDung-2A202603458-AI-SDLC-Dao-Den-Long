# ADR 003 · Giữ đèn tới bình minh

**Trạng thái** Đã áp dụng ở Phase 3.

## Bối cảnh

Ticket-02 kết thúc Đêm ngay khi thắp đủ đèn. Ticket-03 yêu cầu đèn có thể cạn dầu, thay đổi vùng an toàn và buộc Mây duy trì đủ ánh sáng tới bình minh.

## Quyết định

- Một đèn có trạng thái sáng, lượng dầu nguyên theo bước 1/60, tiến độ nạp, cờ từng sáng và số lần thắp lại. Bước timer tổng hợp lượng hút của từng Bóng Mực với hao hụt tự nhiên. Đèn cạn tắt và đặt tiến độ nạp về 0 trước khi xử lý di chuyển và tương tác.
- Khi đèn sáng, dùng lượng dầu chính xác để chọn đèn còn nhận được đom đóm, tính số đom đóm cần châm và mở vùng an toàn. JSONL mới làm tròn đến một chữ số.
- Dùng danh sách đèn còn sáng sau khi xử lý cả tick cuối để xét ngưỡng `ceil(0.6 × tổng đèn)`. Hết Ngọn Lửa được xét trước. Thưởng bình minh đọc lượng dầu của chính trạng thái cuối này.
- Sức chứa dựa trên số hành động thắp thành công của Mây trong Đêm. Việc dựng scenario giữ nguyên điểm và số lần thắp, trừ khi scenario khai báo `successful_lights`.

## Hệ quả

Một đèn có thể tắt rồi được thắp lại ngay trong cùng tick. Đèn được phục hồi vùng an toàn ở bước tương tác sẽ đẩy Bóng Mực ra như lúc vừa thắp. Test hồi quy dùng công thức và thời lượng mới, còn bằng chứng v1.1 có thể chạy lại từ tag `phase-2`.
