# 📖 CuuTruyen Manga Discord Bot & Crawler

Bot Discord tự động theo dõi, thu thập dữ liệu và thông báo truyện tranh mới cập nhật từ **[Cuutruyen.net](https://cuutruyen.net/)** với giao diện Embed giàu metadata, chống trùng lặp dữ liệu bằng SQLite, tích hợp cơ chế chống spam (Rate-Limiting) và hỗ trợ cả Direct API lẫn Playwright Browser Crawler.

---

## 🌟 Tính Năng Nổi Bật

1. **Crawler Thông Minh & Tối Ưu (Hybrid Engine)**:
   - **Direct Authenticated API**: Tốc độ phản hồi cực nhanh (mili-giây), mức chiếm dụng RAM/CPU gần như bằng 0. Sử dụng cơ chế Auth Header (`Cuutruyen-Client`, `M4U_UID`, `M4U_TOKEN`).
   - **Playwright Headless Browser**: Sẵn sàng kích hoạt để mô phỏng trình duyệt Chromium thật khi cần bypass Cloudflare Turnstile hoặc duyệt trang SPA.
2. **Discord Embed & Interactive Buttons**:
   - Tiêu đề truyện kèm link dẫn trực tiếp đến chương mới.
   - Hiển thị ảnh bìa sắc nét (`cover_url`).
   - Đầy đủ thông tin: Tác giả, Nhóm dịch, Thể loại (Tags), Thời gian đăng tải (Discord timestamp tương đối).
   - Trích dẫn tóm tắt nội dung truyện.
   - Nút bấm trực quan: `[📖 Đọc Chapter Mới]` và `[ℹ️ Chi Tiết Truyện]`.
3. **Quản Lý Bằng Slash Commands (Lệnh gạch chéo)**:
   - `/setchannel`: Chọn kênh Discord nhận thông báo truyện mới (Hỗ trợ lọc tất cả hoặc chỉ truyện đang theo dõi).
    - `/removechannel`: Hủy nhận thông báo trên server.
    - `/status`: Kiểm tra trạng thái kết nối Cuutruyen, số kênh đang phục vụ, số chapter đã lưu, uptime bot.
    - `/checknow`: Ép bot quét kiểm tra truyện mới ngay lập tức mà không cần chờ chu kỳ.
    - `/newest [broadcast]`: Gửi bộ truyện & chapter mới nhất vừa cập nhật với đầy đủ ảnh bìa, tác giả, nhóm dịch, tags, tóm tắt và nút đọc.
    - `/latest [count]`: Xem các truyện vừa cập nhật nhất dưới dạng thẻ embed phong phú (đầy đủ metadata, ảnh bìa, tóm tắt và link).
    - `/search [query]`: Tìm kiếm truyện trực tiếp trong Discord.
4. **Rate-Limiting & Chống Trùng Lặp**:
   - Tích hợp **Discord Message Queue** với độ giãn cách an toàn (1.5 giây giữa các tin nhắn) giúp tránh triệt để lỗi Discord HTTP 429 khi nhiều truyện ra cùng lúc.
   - Cơ sở dữ liệu SQLite lưu trữ lịch sử các chapter đã thông báo, đảm bảo **không bao giờ gửi trùng lặp**.

---

## 📁 Cấu Trúc Dự Án

```
├── src/
│   ├── index.ts                  # Entry point: Khởi động Bot & Scheduler
│   ├── config/
│   │   └── env.ts                # Load biến môi trường & validation
│   ├── crawler/
│   │   ├── types.ts              # Định nghĩa Typescript cho Manga & Chapter
│   │   ├── cuutruyenClient.ts    # Direct REST API Client (Auth, Session, Metadata)
│   │   ├── playwrightCrawler.ts  # Playwright Headless Browser fallback
│   │   └── crawlerManager.ts     # Bộ điều phối quét truyện định kỳ & phân phối
│   ├── discord/
│   │   ├── client.ts             # Discord Bot Client & Event Listeners
│   │   ├── deployCommands.ts     # Script đăng ký Slash Commands lên Discord API
│   │   ├── embedBuilder.ts       # Format Embed & Buttons đẹp mắt
│   │   ├── rateLimiter.ts        # Hàng đợi gửi tin nhắn an toàn (Chống 429)
│   │   └── commands/             # Danh mục Slash Commands (/setchannel, /status, ...)
│   ├── database/
│   │   ├── db.ts                 # Kết nối SQLite & thiết lập bảng
│   │   └── repositories/         # Quản lý kênh server & lịch sử chapter
│   └── utils/
│       └── logger.ts             # Logger màu sắc, trực quan
├── test/
│   ├── testDb.ts                 # Unit test Database & Embed Builder
│   └── testCrawler.ts            # Integration test API, Auth & Playwright
├── data/                         # Thư mục lưu trữ cơ sở dữ liệu SQLite (bot.sqlite)
├── .env.example                  # Mẫu cấu hình biến môi trường
├── package.json
└── tsconfig.json
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Bot

### 1. Yêu cầu hệ thống
- **Node.js**: Phiên bản 18+ hoặc 20+ (Khuyến nghị Node v20/v22).
- **npm** hoặc **yarn** / **pnpm**.

### 2. Cài đặt các gói phụ thuộc
```bash
npm install
```

*(Tùy chọn) Cài đặt Chromium cho Playwright nếu bạn muốn dùng tính năng Browser Fallback:*
```bash
npx playwright install chromium
```

### 3. Cấu hình biến môi trường (`.env`)
Mở file `.env` (hoặc sao chép từ `.env.example`):
```ini
# ==========================================
# DISCORD BOT CREDENTIALS
# ==========================================
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_client_id_here

# ==========================================
# CỨU TRUYỆN CONFIGURATION
# ==========================================
CUUTRUYEN_BASE_URL=https://cuutruyen.net
CUUTRUYEN_USERNAME=
CUUTRUYEN_PASSWORD=

# Chu kỳ quét (giây) - mặc định 180s (3 phút)
POLL_INTERVAL_SECONDS=180

# Chế độ crawler: hybrid | api | playwright
CRAWLER_MODE=hybrid

# Đường dẫn Database SQLite
DATABASE_PATH=./data/bot.sqlite
```

> **Cách lấy DISCORD_TOKEN và DISCORD_CLIENT_ID:**
> 1. Truy cập [Discord Developer Portal](https://discord.com/developers/applications).
> 2. Bấm **New Application**, đặt tên cho Bot (VD: `CuuTruyen Alert`).
> 3. Trong mục **OAuth2** > **General**, sao chép **Client ID** vào `DISCORD_CLIENT_ID`.
> 4. Trong mục **Bot**:
>    - Bấm **Reset Token** để lấy chuỗi Token dán vào `DISCORD_TOKEN`.
>    - Bật các quyền trong **Privileged Gateway Intents** nếu cần (Message Content Intent).
> 5. Mời Bot vào Server:
>    - Vào **OAuth2** > **URL Generator**.
>    - Chọn scopes: `bot`, `applications.commands`.
>    - Chọn Bot Permissions: `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Use External Emojis`.
>    - Sao chép URL tạo ra và mở trên trình duyệt để mời bot vào server của bạn.

---

## 🛠️ Các Lệnh Khởi Chạy

### 1. Đăng ký Slash Commands với Discord
Khi mới tạo bot hoặc thay đổi lệnh:
```bash
npm run deploy-commands
```

### 2. Chạy bot ở môi trường phát triển (Dev)
```bash
npm run dev
```

### 3. Build & Chạy môi trường chính thức (Production)
```bash
npm run build
npm start
```

### 4. Chạy kiểm thử hệ thống (Tests)
- Kiểm tra Database & Embed Builder:
  ```bash
  npm run test:db
  ```
- Kiểm tra kết nối Cuutruyen, Đăng nhập, API, Metadata & Playwright:
  ```bash
  npm run test:crawler
  ```

---

## 📖 Hướng Dẫn Sử Dụng Lệnh Trên Discord

Sau khi mời bot vào server:

1. **Cài đặt kênh nhận thông báo**:
   ```
   /setchannel channel:#thong-bao-truyen mode:Tất cả truyện mới cập nhật
   ```
   *Lưu ý: Bạn cần có quyền Quản lý kênh (Manage Channels) để thực hiện lệnh này.*

2. **Kiểm tra trạng thái hệ thống**:
   ```
   /status
   ```
   *Hiển thị trạng thái đăng nhập Cuutruyen, số lượng server đã đăng ký kênh, số chapter đã thông báo, thời gian bot chạy.*

3. **Quét truyện mới tức thì**:
   ```
   /checknow
   ```
   *Kích hoạt một chu kỳ quét ngay lập tức.*

4. **Gửi bộ truyện & chapter mới nhất vừa cập nhật vào kênh**:
   ```
   /newest
   ```
   *Gửi thẻ truyện đầy đủ gồm ảnh bìa, tên truyện, chương, tác giả, nhóm dịch, tags, tóm tắt và nút đọc trực tiếp.*

5. **Xem các truyện mới nhất (đầy đủ metadata & bìa)**:
   ```
   /latest count:3
   ```

6. **Tìm kiếm truyện tranh**:
   ```
   /search query:Dược Sư Tự Sự
   ```

---

## 🔒 Bản Quyền & Lưu Ý
Dự án được xây dựng với mục đích học tập và phục vụ cá nhân/cộng đồng đọc truyện văn minh, tuân thủ giới hạn tần suất yêu cầu và không làm gián đoạn hạ tầng máy chủ Cứu Truyện.

