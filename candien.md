# DANH SÁCH THÔNG TIN CẦN ĐIỀN SAU (candien.md)

Tài liệu này liệt kê đầy đủ những thông số, khóa bảo mật (API Key / Token / App Secret) và cấu hình thực tế **chưa được điền sẵn** để tránh bịa đặt thông tin.  
Bạn có thể vận hành **dauto** ở chế độ nội bộ + test Webhook + nối với Bot Local ngay lập tức, sau đó điền dần các mục dưới đây khi gắn tài khoản thật.

---

## 1. Cấu hình dành cho Bot Local ngoài (Ưu tiên nếu bạn chạy bot riêng)

Bạn có thể cấu hình **trực tiếp trên Giao diện Web** (`Cài đặt` → Tab `Webhook, Bot Local & Phân quyền`) **HOẶC** điền vào file `.env`:

| Biến / Trường | Ý nghĩa | Cách điền |
|---|---|---|
| `BOT_API_KEY` | Khóa bảo mật để Bot Local gọi vào `/api/bot/*` đọc hội thoại & gửi tin nhắn không cần đăng nhập Google | Bấm nút **"Tạo Key"** trong tab Cài đặt, hoặc đặt trong `.env` |
| `OUTBOUND_BOT_WEBHOOK_URL` | Địa chỉ HTTP POST của Bot Local (VD: `http://localhost:8000/webhook`) để dauto đẩy tin nhắn khách mới sang cho bot xử lý | Dán URL bot của bạn vào ô **"Outbound Webhook URL (Đẩy sự kiện sang Bot Local)"** trong tab Cài đặt |

**Header gọi API từ Bot Local vào dauto:**
- `X-Bot-Api-Key: <BOT_API_KEY>`
- Endpoint chính cho bot:
  - `GET /api/bot/conversations` (lấy danh sách hội thoại + `botPaused` + tin nhắn gần nhất)
  - `POST /api/bot/messages` (bot gửi phản hồi cho khách, tự chuyển tiếp ra Facebook/Zalo nếu Page có Token)
  - `PATCH /api/bot/conversations/:id/bot-pause` (`{ "botPaused": true/false }` để tạm dừng/bật lại bot cho 1 khách)

---

## 2. Kết nối Facebook Fanpage & Instagram (Meta Graph API + OAuth 1 chạm + Đồng bộ lịch sử)

| Biến / Trường | Điền ở đâu | Nơi lấy thông tin thật |
|---|---|---|
| `WEBHOOK_VERIFY_TOKEN` | `.env` hoặc tab **Cài đặt → Webhook** | Tự đặt chuỗi bất kỳ (VD: `dauto_verify_2026`), sau đó nhập trùng khớp vào **Meta for Developers → Webhooks → Verify Token** |
| `META_APP_ID` | `.env` / Secrets | **Meta for Developers → App Dashboard → App settings → Basic → App ID** (cần nếu bật nút **Kết nối Facebook Fanpage OAuth 1 chạm**) |
| `META_APP_SECRET` | `.env` / Secrets | **Meta for Developers → App Dashboard → App settings → Basic → App Secret** (tự bật kiểm tra chữ ký `X-Hub-Signature-256` + đổi code OAuth) |
| `META_REDIRECT_URI` | `.env` (tùy chọn) + Meta OAuth Redirect URIs | Mặc định `<DOMAIN>/api/oauth/facebook/callback` (VD: `http://localhost:3000/api/oauth/facebook/callback`). Cần thêm đúng URL này vào **Facebook Login → Settings → Valid OAuth Redirect URIs** |
| `Page ID / IG Business ID` | Trên UI (**Kết nối kênh** hoặc **Cài đặt → Gán Page ID & Token**) | Tự điền khi dùng OAuth 1 chạm, hoặc lấy thủ công tại **Fanpage → Giới thiệu → Tính minh bạch của Trang → ID Trang** |
| `Page Access Token` | Trên UI (**Kết nối kênh** hoặc **Cài đặt → Gán Page ID & Token**) | Tự lưu khi dùng OAuth 1 chạm, hoặc lấy **Graph API Explorer / System User Token** có quyền: `pages_messaging`, `pages_read_engagement`, `pages_manage_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments` (dùng luôn cho nút **"Đồng bộ lịch sử"** trên Dashboard) |

---

## 3. Kết nối Zalo Official Account (Zalo OA v3/v4 + Auto Refresh Token)

| Biến / Trường | Điền ở đâu | Nơi lấy thông tin thật |
|---|---|---|
| `OA ID` | Trên UI (**Gán Page ID / OA ID**) | Tự điền khi bấm **Kết nối Zalo OA (OAuth 1 chạm)** hoặc lấy ở **Zalo OA Admin (oa.zalo.me) → Quản lý → Thông tin tài khoản → Official Account ID** |
| `Access Token (Zalo OA)` | Trên UI (**Gán Access Token**) | Tự lưu qua OAuth 1 chạm hoặc lấy từ **Zalo Developers → Ứng dụng → OA API Explorer** |
| `ZALO_APP_ID` | `.env` / Secrets | **Zalo Developers → Cài đặt ứng dụng → App ID** (cần cho OAuth 1 chạm và tự động Refresh Token v4 khi token hết hạn 25 giờ) |
| `ZALO_APP_SECRET` | `.env` / Secrets | **Zalo Developers → Cài đặt ứng dụng → Secret Key** |
| `ZALO_REFRESH_TOKEN` | `.env` / Secrets (hoặc tự lưu theo từng OA trong DB) | Lấy tự động khi ủy quyền OAuth Zalo OA v4; dauto sẽ tự gọi `oauth.zaloapp.com/v4/oa/access_token` để gia hạn khi nhận lỗi 401/`-216` hoặc khi bấm **"Làm mới Token Zalo"** trong Cài đặt |
| `ZALO_REDIRECT_URI` | `.env` (tùy chọn) + Zalo App Callback | Mặc định `<DOMAIN>/api/oauth/zalo/callback` (cần khai báo trùng trong **Zalo Developers → Thiết lập đường dẫn Callback**) |

---

## 4. Kết nối TikTok Shop & Shopee Open Platform (Ký HMAC-SHA256 2 chiều)

| Biến / Trường | Điền ở đâu | Nơi lấy thông tin thật |
|---|---|---|
| `TIKTOK_SHOP_APP_KEY` | `.env` / Secrets | **TikTok Shop Partner Center → App Management → App Key** |
| `TIKTOK_SHOP_APP_SECRET` | `.env` / Secrets | **TikTok Shop Partner Center → App Secret** (dauto dùng HMAC-SHA256 ký mọi lệnh gửi tin nhắn ra `/customer_service/202309/...`) |
| `SHOPEE_PARTNER_ID` | `.env` / Secrets | **Shopee Open Platform Console → App List → Partner ID** |
| `SHOPEE_PARTNER_KEY` | `.env` / Secrets | **Shopee Open Platform Console → Live/Test Partner Key** (dauto dùng HMAC-SHA256 ký mọi lệnh gửi SellerChat ra `/api/v2/sellerchat/send_message`) |
| `SHOPEE_API_HOST` | `.env` (tùy chọn) | Mặc định `https://partner.shopeemobile.com` (đổi sang sandbox `https://openplatform.sandbox.test-stable.shopee.sg` nếu test môi trường Sandbox) |
| `Shop ID / Cipher` | Trên UI (**Gán Page ID / Shop ID**) | Với Shopee: điền `shop_id`; với TikTok Shop: điền `shop_id` hoặc `shop_cipher` (dùng dấu `|` nếu cần tách `shop_id|shop_cipher`) và dán Access Token shop tương ứng |

---

## 5. Đơn vị vận chuyển thật (GHN, GHTK, Viettel Post, J&T Express)

Nếu bạn **chưa điền** các biến bên dưới, Mini-POS vẫn tạo đơn hàng, trừ tồn kho và sinh mã vận đơn nội bộ bình thường (`carrierSynced = false`).  
Khi muốn bấm **"Tạo đơn hàng"** trên Mini-POS và đẩy thẳng lên hãng vận chuyển thật để lấy mã vận đơn thật:

| Hãng vận chuyển | Biến môi trường cần điền (`.env` / Secrets) | Ghi chú |
|---|---|---|
| **Giao Hàng Nhanh (GHN)** | `GHN_TOKEN`, `GHN_SHOP_ID`, `GHN_FROM_DISTRICT_ID`, `GHN_FROM_WARD_CODE` | Lấy trong **khachhang.ghn.vn → Quản lý cửa hàng → Token API** |
| **Giao Hàng Tiết Kiệm (GHTK)** | `GHTK_TOKEN`, `GHTK_PICK_NAME`, `GHTK_PICK_ADDRESS`, `GHTK_PICK_PROVINCE`, `GHTK_PICK_DISTRICT`, `GHTK_PICK_TEL` | Lấy trong **khachhang.giaohangtietkiem.vn → Thông tin tài khoản → API Token** |
| **Viettel Post** | `VIETTEL_POST_TOKEN`, `VTP_GROUPADDRESS_ID` | Lấy qua API đăng nhập đối tác Viettel Post (`partner.viettelpost.vn`) và ID kho lấy hàng |
| **J&T Express** | `JT_API_KEY`, `JT_EC_COMPANY_ID`, `JT_ORDER_URL` | Cấp bởi bộ phận kỹ thuật J&T Express (URL API tạo đơn + Key ký MD5 `data_digest`) |

**Webhook cập nhật trạng thái giao hàng tự động từ hãng ship gửi về dauto:**
- `POST /api/webhooks/shipping/ghn`
- `POST /api/webhooks/shipping/ghtk`

---

## 6. Kiểm tra nhanh khi chạy Localhost trên máy cá nhân

1. Chạy `npm install && npm run dev` → mở `http://localhost:3000`.
2. Nếu cần nhận webhook từ Facebook/Zalo/Bot bên ngoài về máy local: mở HTTPS tunnel bằng `ngrok http 3000` hoặc `cloudflared tunnel --url http://localhost:3000`.
3. Kiểm tra lại file `.env` của bạn đã khớp với các khóa muốn kích hoạt ở mục 1–5.
