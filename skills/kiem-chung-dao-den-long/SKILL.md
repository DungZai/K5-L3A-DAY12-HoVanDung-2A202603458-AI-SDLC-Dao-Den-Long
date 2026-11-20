---
name: kiem-chung-dao-den-long
description: Chạy và đối chiếu bằng chứng Test Contract, kiểm tra luồng trình duyệt và đo FPS khi cập nhật Đảo Đèn Lồng.
---

# Kiểm chứng Đảo Đèn Lồng

- Từ thư mục repo, chạy `npm test` và `npm run proof` để tái tạo JSONL trích đoạn, phép so từng byte và phép đo headless. Dữ liệu kịch bản ở [phase3-scenarios.mjs](../../tests/phase3-scenarios.mjs).
- Dùng `--snapshot-every 1` để khoanh tick sai. Khi kiểm tra pause, dùng `tick` cho input/sự kiện, `sim_tick` cho đếm dầu và timer. Ngưỡng dầu và điểm bình minh đọc số nguyên trong mô phỏng. Output làm tròn một chữ số, nên fuel in ra 30 có thể đã dưới ngưỡng an toàn.
- Dùng `node scripts/verify-browser.mjs` với Playwright và Chromium. Cách chọn môi trường nằm trong [spec Phase 3](../../docs/phase-3.md). Máy chủ kiểm chứng tự chọn cổng và tự dừng.
- Dùng đúng tag khi tái tạo bằng chứng cũ. Các test hiện hành giữ cơ chế còn hiệu lực và cập nhật kỳ vọng bị thay thế theo [changelog](../../CHANGELOG.md).
