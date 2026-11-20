---
name: kiem-chung-dao-den-long
description: Chạy và đối chiếu bằng chứng Test Contract, kiểm tra luồng trình duyệt và đo FPS khi cập nhật Đảo Đèn Lồng.
---

# Kiểm chứng Đảo Đèn Lồng

- Từ thư mục repo, chạy `npm test` để kiểm tra hồi quy và `npm run proof` để tái tạo JSONL trích đoạn, kết quả so từng byte và phép đo headless. Cấu hình từng kịch bản ở [phase2-scenarios.mjs](../../tests/phase2-scenarios.mjs).
- Khi test lệch ở pause, xem `tick` để đối chiếu input/sự kiện và `sim_tick` để đối chiếu spawn, TTL và cooldown. Dùng `--snapshot-every 1` để khoanh tick sai. V1.1 dừng đúng sau khi xét thắng/thua cuối bước, kể cả tick bình minh.
- Khi kiểm tra luồng UI hoặc FPS, chạy `node scripts/verify-browser.mjs` với Playwright và Chromium. Cách chọn môi trường và cách đọc FPS nằm trong [spec Phase 2](../../docs/phase-2.md). Máy chủ kiểm chứng tự chọn cổng và tự dừng.
- Bằng chứng được tạo từ lần chạy thật của từng phiên bản. Đối chiếu code đúng tag. Dùng tag `phase-1` khi cần chạy contract và lộ trình cũ.
