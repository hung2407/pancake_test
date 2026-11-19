import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  extractVietnamesePhones,
  containsPhoneNumber,
  extractAddressFromText,
  extractCustomerInfoFromMessages,
  interpolateQuickReply,
  calculateOrderTotals,
  computeCustomerDeliveryRisk,
  selectNextAssignee,
  hasPermission,
  verifyWebhookChallenge,
  parseIncomingWebhookPayload,
  computeStockDeltaOnStatusChange,
  generateOrdersCsv,
  isWithinDateRange,
  userCanAccessPage,
  parseProductsCsv,
} from './omnichannel';
import {
  verifyMetaSignature,
  signShopeeRequest,
  signTikTokShopRequest,
} from './server-integrations';

test('extractVietnamesePhones handles standard, dotted, spaced, and +84 formats', () => {
  assert.deepEqual(extractVietnamesePhones('Gọi cho mình số 0912345678 nhé'), [
    '0912345678',
  ]);
  assert.deepEqual(extractVietnamesePhones('SĐT: 0987.654.321 hoặc +84 365 889 900'), [
    '0987654321',
    '0365889900',
  ]);
  assert.equal(containsPhoneNumber('Tư vấn giúp mình 0905 112 233'), true);
  assert.equal(containsPhoneNumber('Shop ơi giá bao nhiêu ạ?'), false);
});

test('extractAddressFromText parses Vietnamese addresses accurately', () => {
  assert.equal(
    extractAddressFromText('Địa chỉ: Số 24 Ngõ 105 Láng Hạ, Đống Đa, Hà Nội 0912345678'),
    'Số 24 Ngõ 105 Láng Hạ, Đống Đa, Hà Nội'
  );
  assert.equal(
    extractAddressFromText('Giao về 120 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP HCM'),
    '120 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP HCM'
  );
  assert.equal(extractAddressFromText('Cho mình xem thêm mẫu màu đen nhé'), null);
});

test('extractCustomerInfoFromMessages scans latest customer messages', () => {
  const info = extractCustomerInfoFromMessages([
    { senderType: 'customer', content: 'Mẫu này còn size M không shop?' },
    { senderType: 'staff', content: 'Dạ còn ạ, chị cho em xin SĐT và địa chỉ nhé' },
    {
      senderType: 'customer',
      content: 'SĐT 0938.221.445, Địa chỉ: 45 Lê Lợi, Quận 1, TP.HCM',
    },
  ]);
  assert.equal(info.phone, '0938221445');
  assert.equal(info.address, '45 Lê Lợi, Quận 1, TP.HCM');
});

test('interpolateQuickReply replaces dynamic variables safely', () => {
  const msg = interpolateQuickReply(
    'Chào {full_name}, {staff_name} từ {page_name} xác nhận SĐT {phone} ạ.',
    {
      full_name: 'Chị Minh Anh',
      staff_name: 'Thu Hà',
      page_name: 'Lumi Beauty Official',
      phone: '0912345678',
    }
  );
  assert.equal(
    msg,
    'Chào Chị Minh Anh, Thu Hà từ Lumi Beauty Official xác nhận SĐT 0912345678 ạ.'
  );
});

test('calculateOrderTotals computes subtotal and COD cleanly without negative totals', () => {
  const res = calculateOrderTotals(
    [
      { price: 320000, quantity: 2 },
      { price: 150000, quantity: 1 },
    ],
    30000,
    50000
  );
  assert.equal(res.subtotal, 790000);
  assert.equal(res.codTotal, 770000);

  const clamped = calculateOrderTotals([{ price: 100000, quantity: 1 }], 0, 200000);
  assert.equal(clamped.codTotal, 0);
});

test('computeCustomerDeliveryRisk flags high return-rate customers', () => {
  const newCust = computeCustomerDeliveryRisk(0, 0, 0);
  assert.equal(newCust.riskLevel, 'new');

  const risky = computeCustomerDeliveryRisk(5, 2, 3);
  assert.equal(risky.riskLevel, 'danger');
  assert.equal(risky.successRate, 40);

  const safe = computeCustomerDeliveryRisk(6, 6, 0);
  assert.equal(safe.riskLevel, 'safe');
  assert.equal(safe.successRate, 100);
});

test('selectNextAssignee handles round_robin and sticky_previous modes', () => {
  const staff = [
    { id: 'u1', online: true },
    { id: 'u2', online: false },
    { id: 'u3', online: true },
  ];

  const rr1 = selectNextAssignee(staff, 'round_robin', null, -1);
  assert.equal(rr1.staffId, 'u1');
  assert.equal(rr1.nextIndex, 0);

  const rr2 = selectNextAssignee(staff, 'round_robin', null, rr1.nextIndex);
  assert.equal(rr2.staffId, 'u3');
  assert.equal(rr2.nextIndex, 1);

  const sticky = selectNextAssignee(staff, 'sticky_previous', 'u3', 0);
  assert.equal(sticky.staffId, 'u3');
});

test('hasPermission enforces RBAC roles accurately', () => {
  assert.equal(hasPermission('owner', 'manage_rbac'), true);
  assert.equal(hasPermission('admin', 'manage_automation'), true);
  assert.equal(hasPermission('admin', 'manage_rbac'), false);
  assert.equal(hasPermission('sale', 'create_orders'), true);
  assert.equal(hasPermission('sale', 'manage_automation'), false);
  assert.equal(hasPermission('warehouse', 'update_order_shipping'), true);
  assert.equal(hasPermission('warehouse', 'reply_conversations'), false);
});

test('verifyWebhookChallenge validates Meta GET subscribe requests', () => {
  const ok = verifyWebhookChallenge('subscribe', 'dauto_verify_2026', 'CHALLENGE_123', 'dauto_verify_2026');
  assert.equal(ok.valid, true);
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 'CHALLENGE_123');

  const bad = verifyWebhookChallenge('subscribe', 'wrong_token', 'CHALLENGE_123', 'dauto_verify_2026');
  assert.equal(bad.valid, false);
  assert.equal(bad.status, 403);
});

test('parseIncomingWebhookPayload parses Meta Messenger, Meta Comment IDs, image attachments, Zalo OA v3, and direct payloads', () => {
  // Meta Messenger with image attachment + mid
  const metaInbox = parseIncomingWebhookPayload('facebook', {
    object: 'page',
    entry: [
      {
        id: 'fb_1029384756',
        messaging: [
          {
            sender: { id: 'psid_998811', name: 'Nguyễn Văn A' },
            recipient: { id: 'fb_1029384756' },
            message: {
              mid: 'mid.12345',
              text: 'Shop ơi còn serum không ạ?',
              attachments: [
                { type: 'image', payload: { url: 'https://example.com/serum.jpg' } },
              ],
            },
          },
          {
            sender: { id: 'fb_1029384756' },
            message: { is_echo: true, text: 'echo' },
          },
        ],
      },
    ],
  });
  assert.equal(metaInbox.length, 1);
  assert.equal(metaInbox[0].externalPageId, 'fb_1029384756');
  assert.equal(metaInbox[0].senderExternalId, 'psid_998811');
  assert.equal(metaInbox[0].externalMessageId, 'mid.12345');
  assert.equal(metaInbox[0].imageUrl, 'https://example.com/serum.jpg');
  assert.equal(metaInbox[0].channelType, 'inbox');
  assert.equal(metaInbox[0].content, 'Shop ơi còn serum không ạ?');

  // Meta Feed Comment with comment_id & post_id
  const metaComment = parseIncomingWebhookPayload('facebook', {
    object: 'page',
    entry: [
      {
        id: 'fb_1029384756',
        changes: [
          {
            field: 'feed',
            value: {
              from: { id: 'user_7711', name: 'Trần Mai Phương' },
              post_id: 'post_555',
              comment_id: 'cmt_999',
              message: 'Chốt 1 lọ 0912345678',
            },
          },
        ],
      },
    ],
  });
  assert.equal(metaComment.length, 1);
  assert.equal(metaComment[0].channelType, 'comment');
  assert.equal(metaComment[0].externalPostId, 'post_555');
  assert.equal(metaComment[0].externalCommentId, 'cmt_999');
  assert.equal(metaComment[0].customerName, 'Trần Mai Phương');
  assert.equal(metaComment[0].content, 'Chốt 1 lọ 0912345678');

  // Zalo OA v3
  const zaloMsg = parseIncomingWebhookPayload('zalo', {
    event_name: 'user_send_text',
    oa_id: 'zalo_384920192',
    sender: { id: 'zalo_u_4455' },
    message: { msg_id: 'z_mid_1', text: 'Zalo check đơn giúp em' },
  });
  assert.equal(zaloMsg.length, 1);
  assert.equal(zaloMsg[0].externalPageId, 'zalo_384920192');
  assert.equal(zaloMsg[0].senderExternalId, 'zalo_u_4455');
  assert.equal(zaloMsg[0].externalMessageId, 'z_mid_1');
  assert.equal(zaloMsg[0].content, 'Zalo check đơn giúp em');

  // Direct JSON
  const direct = parseIncomingWebhookPayload('tiktok', {
    customerName: 'Lê Thanh Hoa',
    channelType: 'inbox',
    content: 'Ship về Hà Nội bao nhiêu ạ?',
  });
  assert.equal(direct.length, 1);
  assert.equal(direct[0].platform, 'tiktok');
  assert.equal(direct[0].customerName, 'Lê Thanh Hoa');
});

test('verifyMetaSignature verifies HMAC-SHA256 accurately when secret is configured', () => {
  const payload = JSON.stringify({ object: 'page', entry: [] });
  const secret = 'test_app_secret_123';
  const validSig =
    'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

  assert.equal(verifyMetaSignature(payload, validSig, secret), true);
  assert.equal(verifyMetaSignature(payload, 'sha256=deadbeef', secret), false);
  assert.equal(verifyMetaSignature(payload, undefined, secret), false);
  assert.equal(verifyMetaSignature(payload, undefined, undefined), true);
});

test('computeStockDeltaOnStatusChange restores stock when returned and reverts when un-returned', () => {
  assert.equal(computeStockDeltaOnStatusChange('pending', 'shipping'), 0);
  assert.equal(computeStockDeltaOnStatusChange('shipping', 'delivered'), 0);
  assert.equal(computeStockDeltaOnStatusChange('shipping', 'returned'), 1);
  assert.equal(computeStockDeltaOnStatusChange('returned', 'shipping'), -1);
  assert.equal(computeStockDeltaOnStatusChange('returned', 'returned'), 0);
});

test('generateOrdersCsv formats UTF-8 BOM CSV cleanly with escaping', () => {
  const csv = generateOrdersCsv([
    {
      code: 'DAU-2601',
      createdAt: '2026-11-17T00:00:00.000Z',
      customerName: 'Nguyễn "Lan" Hương',
      customerPhone: '0912345678',
      shippingAddress: 'Hà Nội, Việt Nam',
      items: [{ productName: 'Serum C', variantLabel: '30ml', quantity: 2 }],
      carrier: 'GHN',
      trackingCode: 'GHN123',
      codTotal: 640000,
      status: 'delivered',
      note: 'Giao giờ hành chính',
    },
  ]);
  assert.equal(csv.startsWith('\uFEFFMã đơn,'), true);
  assert.equal(csv.includes('"Nguyễn ""Lan"" Hương"'), true);
  assert.equal(csv.includes('Giao thành công'), true);
});

test('isWithinDateRange and userCanAccessPage enforce time windows and page RBAC', () => {
  const now = new Date('2026-11-17T12:00:00.000Z').getTime();
  assert.equal(isWithinDateRange('2026-11-17T08:00:00.000Z', 'today', now), true);
  assert.equal(isWithinDateRange('2026-11-15T08:00:00.000Z', 'today', now), false);
  assert.equal(isWithinDateRange('2026-11-12T08:00:00.000Z', '7d', now), true);
  assert.equal(isWithinDateRange('2026-11-01T08:00:00.000Z', '7d', now), false);
  assert.equal(isWithinDateRange('2026-10-01T08:00:00.000Z', 'all', now), true);

  assert.equal(userCanAccessPage({ role: 'owner', allowedPageIds: ['p1'] }, 'p2'), true);
  assert.equal(userCanAccessPage({ role: 'sale', allowedPageIds: [] }, 'p2'), true);
  assert.equal(userCanAccessPage({ role: 'sale', allowedPageIds: ['p1'] }, 'p1'), true);
  assert.equal(userCanAccessPage({ role: 'sale', allowedPageIds: ['p1'] }, 'p2'), false);
});

test('parseProductsCsv parses Vietnamese & English CSV headers and groups multi-variants', () => {
  const csv = `\uFEFFTên sản phẩm,Danh mục,SKU,Màu sắc,Kích thước,Giá bán,Tồn kho
"Áo Thun Lumi, Cotton",Thời trang,AT-DEN-M,Đen,M,199000,15
"Áo Thun Lumi, Cotton",Thời trang,AT-TRANG-L,Trắng,L,199000,20
Serum B5,Chăm sóc da,B5-30,,30ml,350000,10`;

  const parsed = parseProductsCsv(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Áo Thun Lumi, Cotton');
  assert.equal(parsed[0].variants.length, 2);
  assert.equal(parsed[0].variants[0].sku, 'AT-DEN-M');
  assert.equal(parsed[0].variants[1].size, 'L');
  assert.equal(parsed[1].variants[0].color, 'Mặc định');
  assert.equal(parsed[1].variants[0].price, 350000);
});

test('signShopeeRequest and signTikTokShopRequest produce deterministic HMAC-SHA256 hex signatures', () => {
  const spSign = signShopeeRequest({
    partnerId: '100200',
    partnerKey: 'shopee_secret',
    apiPath: '/api/v2/sellerchat/send_message',
    timestamp: 1700000000,
    accessToken: 'tok_abc',
    shopId: '9988',
  });
  const expectedShopee = crypto
    .createHmac('sha256', 'shopee_secret')
    .update('100200/api/v2/sellerchat/send_message1700000000tok_abc9988')
    .digest('hex');
  assert.equal(spSign, expectedShopee);

  const ttSign = signTikTokShopRequest({
    appSecret: 'tt_secret',
    apiPath: '/customer_service/202309/conversations/c1/messages',
    queryParams: { timestamp: 1700000000, app_key: 'app123' },
    body: '{"type":"TEXT"}',
  });
  const expectedTt = crypto
    .createHmac('sha256', 'tt_secret')
    .update(
      'tt_secret/customer_service/202309/conversations/c1/messagesapp_keyapp123timestamp1700000000{"type":"TEXT"}tt_secret'
    )
    .digest('hex');
  assert.equal(ttSign, expectedTt);
});


