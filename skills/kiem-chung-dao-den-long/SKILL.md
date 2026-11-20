---
name: kiem-chung-dao-den-long
description: Chạy và đối chiếu bằng chứng Test Contract, kiểm tra luồng trình duyệt và đo FPS khi cập nhật Đảo Đèn Lồng.
---

# Kiểm chứng Đảo Đèn Lồng

- Từ thư mục repo, chạy `npm test` và `npm run proof` để tái tạo JSONL trích đoạn, phép so từng byte và phép đo headless. Dữ liệu kịch bản ở [phase3-scenarios.mjs](../../tests/phase3-scenarios.mjs).
- Dùng `--snapshot-every 1` để khoanh tick sai. Khi kiểm tra pause, dùng `tick` cho input/sự kiện, `sim_tick` cho đếm dầu và timer. Ngưỡng dầu và điểm bình minh đọc số nguyên trong mô phỏng. Output làm tròn một chữ số, nên fuel in ra 30 có thể đã dưới ngưỡng an toàn.
- Dùng `node scripts/verify-browser.mjs` với Playwright và Chromium. Cách chọn môi trường và kịch bản có trong [spec Phase 4](../../docs/phase-4.md). Kiểm thử trình duyệt dùng thư mục bảng xếp hạng tạm.
- Chạy riêng lệnh benchmark trong cửa sổ 1280×720 để đo FPS và lệnh soak để đo RSS. Dùng số đo từ tiến trình thật. Dựng gói bằng `npm run package` và kiểm tra từ thư mục giải nén độc lập.
- Dùng đúng tag khi tái tạo bằng chứng cũ. Các test hiện hành giữ cơ chế còn hiệu lực và cập nhật kỳ vọng bị thay thế theo [changelog](../../CHANGELOG.md).
