# Đảo Đèn Lồng

- Đọc `game.contract.json` và yêu cầu của phase hiện tại trước khi sửa cơ chế.
- `npm ci` cài thư viện dựng cảnh. `npm start` mở máy chủ local. `npm test` kiểm tra logic và CLI.
- Mô phỏng 60 Hz dùng chung cho trình duyệt và headless. Thứ tự bước nằm trong `src/game.mjs`. Bản đồ chuẩn nằm trong `src/maps.mjs`. DOM, GPU, âm thanh và thời gian thực thuộc lớp hiển thị.
- Giữ tuning trong contract. `tick` đếm bước input, còn `sim_tick` chỉ tăng khi đang chơi. V1.3 giữ dầu nguyên 1/60 đơn vị, bước xử lý v1.2 và kết thúc ở bình minh sau va chạm.
- Chạy `npm test` và `npm run proof`. Dùng [skill kiểm chứng](skills/kiem-chung-dao-den-long/SKILL.md) khi cần tái tạo bằng chứng JSONL, kiểm tra trình duyệt hoặc đo FPS.
- Tạo thông điệp commit bằng tiếng Việt có dấu.
- Lưu kết quả chạy thật cùng phiên bản mã đã chạy. Nếu test đỏ, sửa lỗi hoặc ghi rõ phần chưa đạt. Không đưa thông tin bí mật vào repo.
- Dùng `npm run bench -- --seed 42 --duration 30 --out bench.json` và `npm run soak -- --seed 7 --nights 10 --out soak.json` cho số đo bàn giao. Kiểm tra gói tạo bằng `npm run package` từ thư mục giải nén.
