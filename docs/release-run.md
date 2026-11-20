# Đảo Đèn Lồng v1.0.0

Giải nén gói vào thư mục có quyền ghi. Mở terminal trong thư mục vừa giải nén, dùng Node.js 20 trở lên:

```sh
node scripts/serve.mjs
```

Mở [http://127.0.0.1:8080](http://127.0.0.1:8080) bằng trình duyệt có WebGL. Gói đã chứa Three.js. Bảng xếp hạng lưu trong `.data/leaderboard.json` trong cùng thư mục.

W A S D để di chuyển, Space để nhảy, Shift để Lướt, E để tương tác với đèn, Q để Tỏa Sáng, Esc hoặc P để tạm dừng. Giữ đủ đèn sáng tới bình minh. Cài đặt từ menu để đổi phím, bật chữ lớn, giảm chuyển động hoặc bật bảng màu dễ phân biệt.

Xuất bảng xếp hạng đã lưu:

```sh
node scripts/serve.mjs --export-leaderboard leaderboard.json
```

Chạy headless:

```sh
node scripts/headless.mjs --seed 42 --night 1 --ticks 300 --out run.jsonl
```

Thư mục `vendor` chứa thư viện và giấy phép Three.js. Xem `CREDITS.md` để biết nguồn nội dung và `LICENSE` để biết giấy phép mã nguồn dự án.
