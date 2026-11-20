# Đảo Đèn Lồng

- Đọc `game.contract.json` và yêu cầu của phase hiện tại trước khi sửa cơ chế.
- `npm ci` cài thư viện dựng cảnh. `npm start` mở máy chủ local. `npm test` kiểm tra logic và CLI.
- Giữ mô phỏng 60 Hz trong `src/game.mjs`, dùng chung cho trình duyệt và headless. DOM, GPU và thời gian thực thuộc lớp hiển thị.
- Đọc tuning trực tiếp từ contract. Giữ thứ tự sự kiện, tick và đầu ra JSONL tất định.
- Chạy `npm test` trước khi báo hoàn tất. Chạy `npm run proof` khi thay đổi Phase 1, đối chiếu JSONL với tiêu chí trong `docs/phase-1.md`.
- Lưu kết quả chạy thật cùng phiên bản mã đã chạy. Nếu test đỏ, sửa lỗi hoặc ghi rõ phần chưa đạt. Không đưa thông tin bí mật vào repo.
