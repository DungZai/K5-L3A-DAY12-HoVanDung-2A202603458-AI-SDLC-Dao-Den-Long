# Changelog

## Phase 3 · Đèn cạn dầu · Test Contract v1.2

### Thay đổi phá tương thích

- Đèn thắp đầy 100 dầu rồi hao 1 dầu mỗi giây. E có thể chọn đèn sáng còn thiếu dầu để châm. Đèn cạn tắt và xóa tiến độ nạp. Đèn đã từng sáng cần 5 đom đóm để thắp lại.
- Vùng an toàn chỉ hoạt động khi đèn còn ít nhất 30 dầu. Bóng Mực có thể chuyển sang `drain` và hút dầu. Tỏa Sáng lên Bóng Mực đang hút có giá trị 15 điểm.
- Thời lượng ba Đêm là 240, 270 và 300 giây. Trạng thái thắng chỉ xuất hiện ở bình minh nếu giữ đủ 3/5, 4/6 hoặc 5/7 đèn. Lý do thắng đổi từ `all_lit` sang `dawn_survived`.
- Điểm mỗi đom đóm nạp hoặc châm giảm xuống 5. Thắp lại được 40. Thưởng thời gian bị bỏ. Thưởng bình minh dựa vào số đèn còn sáng, lượng dầu nguyên và Ngọn Lửa còn lại.
- Sức chứa tăng từ 10 lên tối đa 20 trong mỗi Đêm theo số lần thực sự thắp đèn. Snapshot thêm `player.capacity`, `lanterns[].fuel`, `ever_lit` và `relit_count`.
- Scenario nhận thêm `successful_lights`, `fuel`, `ever_lit` và `target_lantern_id`. Đèn đặt sẵn sáng có 100 dầu theo mặc định. Sự kiện mới gồm `refuel`, `lantern_out`, `fuel_drain`. `lantern_lit` thêm cờ `relight`.

Các kịch bản của v1.1 còn tại tag `phase-2`. Danh sách kỳ vọng được thay trong kiểm thử nằm ở [ghi chép Phase 3](docs/phase-3.md).
