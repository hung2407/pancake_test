import type { PlatformType, UserRole } from '../types/schema';

export type PermissionKey =
  | 'manage_pages'
  | 'reply_conversations'
  | 'create_orders'
  | 'manage_inventory'
  | 'update_order_shipping'
  | 'view_analytics'
  | 'manage_automation'
  | 'manage_rbac';

const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  owner: [
    'manage_pages',
    'reply_conversations',
    'create_orders',
    'manage_inventory',
    'update_order_shipping',
    'view_analytics',
    'manage_automation',
    'manage_rbac',
  ],
  admin: [
    'manage_pages',
    'reply_conversations',
    'create_orders',
    'manage_inventory',
    'update_order_shipping',
    'view_analytics',
    'manage_automation',
  ],
  sale: [
    'reply_conversations',
    'create_orders',
  ],
  warehouse: [
    'manage_inventory',
    'update_order_shipping',
    'view_analytics',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Chủ sở hữu (Owner)',
  admin: 'Quản trị viên (Admin)',
  sale: 'Nhân viên trực page (Sale)',
  warehouse: 'Nhân viên kho / vận đơn',
};

export function hasPermission(role: UserRole, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Extracts and normalizes Vietnamese mobile/landline phone numbers from free-form text.
 * Supports formats like 0912345678, 0912.345.678, 0912-345-678, +84 912 345 678.
 */
export function extractVietnamesePhones(text: string): string[] {
  if (!text) return [];
  const rawRegex = /(?:\+84|84|0)(?:[\s.\-]*\d){8,9}\b/g;
  const matches = text.match(rawRegex) ?? [];
  const normalizedSet = new Set<string>();

  for (const raw of matches) {
    let digits = raw.replace(/[\s.\-+]/g, '');
    if (digits.startsWith('84') && digits.length >= 10) {
      digits = '0' + digits.slice(2);
    }
    if (/^0[35789]\d{8}$/.test(digits) || /^02\d{8,9}$/.test(digits)) {
      normalizedSet.add(digits);
    }
  }

  return Array.from(normalizedSet);
}

export function containsPhoneNumber(text: string): boolean {
  return extractVietnamesePhones(text).length > 0;
}

/**
 * Extracts a likely Vietnamese delivery address from customer chat text.
 */
export function extractAddressFromText(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Explicit prefix like "địa chỉ: ..." or "đc: ..." or "giao về ..."
  const explicitMatch = trimmed.match(
    /(?:địa chỉ|dia chi|đc|ship về|giao về|gửi về)\s*[:\-]?\s*([^\n;]+)/i
  );
  if (explicitMatch && explicitMatch[1]) {
    const candidate = explicitMatch[1]
      .replace(/(?:\+84|84|0)(?:[\s.\-]*\d){8,9}\b/g, '')
      .replace(/[,.\-\s]+$/, '')
      .trim();
    if (candidate.length >= 8) {
      return candidate;
    }
  }

  // Heuristic detection for address keywords in message lines
  const addressKeywords =
    /\b(số nhà|ngõ|ngách|hẻm|đường|phố|phường|xã|thị trấn|quận|huyện|thành phố|tp\.?|tỉnh|hà nội|hồ chí minh|tp\.?\s*hcm|sài gòn|đà nẵng|hải phòng|cần thơ|bình dương|đồng nai)\b/i;

  const lines = trimmed.split(/\n+/);
  for (const line of lines) {
    if (addressKeywords.test(line)) {
      const cleaned = line
        .replace(/(?:\+84|84|0)(?:[\s.\-]*\d){8,9}\b/g, '')
        .replace(/^(?:địa chỉ|dia chi|đc|sđt|sdt)\s*[:\-]?\s*/i, '')
        .replace(/^[,.\-\s]+|[,.\-\s]+$/g, '')
        .trim();
      if (cleaned.length >= 10) {
        return cleaned;
      }
    }
  }

  return null;
}

export function extractCustomerInfoFromMessages(
  messages: { senderType: string; content: string }[]
): { phone: string | null; address: string | null } {
  let phone: string | null = null;
  let address: string | null = null;

  // Scan latest customer messages first
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.senderType !== 'customer') continue;
    if (!phone) {
      const phones = extractVietnamesePhones(msg.content);
      if (phones.length > 0) {
        phone = phones[0];
      }
    }
    if (!address) {
      const extractedAddr = extractAddressFromText(msg.content);
      if (extractedAddr) {
        address = extractedAddr;
      }
    }
    if (phone && address) break;
  }

  return { phone, address };
}

export function interpolateQuickReply(
  template: string,
  vars: {
    full_name?: string;
    phone?: string;
    page_name?: string;
    staff_name?: string;
  }
): string {
  return template
    .replace(/\{full_name\}/g, vars.full_name || 'Anh/Chị')
    .replace(/\{phone\}/g, vars.phone || '')
    .replace(/\{page_name\}/g, vars.page_name || 'Shop')
    .replace(/\{staff_name\}/g, vars.staff_name || 'Tư vấn viên');
}

export function calculateOrderTotals(
  items: { price: number; quantity: number }[],
  shippingFee: number,
  discount: number
): { subtotal: number; codTotal: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.max(0, item.price) * Math.max(0, item.quantity),
    0
  );
  const cleanShipping = Math.max(0, shippingFee);
  const cleanDiscount = Math.max(0, discount);
  const codTotal = Math.max(0, subtotal + cleanShipping - cleanDiscount);
  return { subtotal, codTotal };
}

export function computeCustomerDeliveryRisk(
  totalOrders: number,
  deliveredOrders: number,
  returnedOrders: number
): {
  successRate: number;
  riskLevel: 'safe' | 'warning' | 'danger' | 'new';
  label: string;
} {
  const completedOrders = deliveredOrders + returnedOrders;
  if (totalOrders === 0 || completedOrders === 0) {
    return {
      successRate: 100,
      riskLevel: 'new',
      label: 'Khách hàng mới · Chưa có lịch sử hoàn đơn',
    };
  }

  const successRate = Math.round((deliveredOrders / completedOrders) * 100);

  if (returnedOrders >= 2 || successRate < 65) {
    return {
      successRate,
      riskLevel: 'danger',
      label: `Cảnh báo hoàn đơn cao · ${successRate}% thành công (${returnedOrders} đơn hoàn)`,
    };
  }

  if (returnedOrders === 1 || successRate < 85) {
    return {
      successRate,
      riskLevel: 'warning',
      label: `Lưu ý giao hàng · ${successRate}% thành công (${returnedOrders} đơn hoàn)`,
    };
  }

  return {
    successRate,
    riskLevel: 'safe',
    label: `Khách uy tín · ${successRate}% giao thành công`,
  };
}

export function selectNextAssignee(
  staffList: { id: string; online: boolean }[],
  mode: 'round_robin' | 'sticky_previous',
  previousAssigneeId?: string | null,
  lastIndex = -1
): { staffId: string | null; nextIndex: number } {
  const onlineStaff = staffList.filter((s) => s.online);
  if (onlineStaff.length === 0) {
    return { staffId: null, nextIndex: lastIndex };
  }

  if (mode === 'sticky_previous' && previousAssigneeId) {
    const prev = onlineStaff.find((s) => s.id === previousAssigneeId);
    if (prev) {
      return { staffId: prev.id, nextIndex: lastIndex };
    }
  }

  const nextIdx = (lastIndex + 1) % onlineStaff.length;
  return {
    staffId: onlineStaff[nextIdx].id,
    nextIndex: nextIdx,
  };
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} ngày`;
}

export interface ParsedWebhookEvent {
  platform: PlatformType;
  pageId?: string;
  externalPageId?: string;
  senderExternalId?: string;
  customerName: string;
  channelType: 'inbox' | 'comment';
  content: string;
  imageUrl?: string;
  postTitle?: string;
  externalPostId?: string;
  externalMessageId?: string;
  externalCommentId?: string;
}

export function verifyWebhookChallenge(
  mode: unknown,
  token: unknown,
  challenge: unknown,
  expectedToken: string
): { valid: boolean; status: number; body: string } {
  const cleanExpected = expectedToken.trim();
  if (
    mode === 'subscribe' &&
    typeof token === 'string' &&
    token.trim() === cleanExpected &&
    typeof challenge === 'string' &&
    challenge.length > 0
  ) {
    return { valid: true, status: 200, body: challenge };
  }
  return {
    valid: false,
    status: 403,
    body: 'Xác thực Webhook thất bại (Verify Token không khớp)',
  };
}

function asRecord(val: unknown): Record<string, unknown> | null {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : null;
}

/**
 * Normalizes incoming webhook payloads from Meta (Facebook / Instagram Messenger & Feed comments),
 * Zalo OA v3, TikTok / Shopee / Website integrations, or direct JSON test payloads.
 */
export function parseIncomingWebhookPayload(
  platform: PlatformType,
  rawBody: unknown
): ParsedWebhookEvent[] {
  const body = asRecord(rawBody);
  if (!body) return [];

  const events: ParsedWebhookEvent[] = [];

  // 1. Meta Graph Webhook format (Facebook Page / Instagram)
  if (Array.isArray(body.entry)) {
    for (const rawEntry of body.entry) {
      const entry = asRecord(rawEntry);
      if (!entry) continue;
      const entryPageId = entry.id ? String(entry.id) : undefined;

      // 1a. Messenger / IG DM messaging array
      if (Array.isArray(entry.messaging)) {
        for (const rawMsgEvent of entry.messaging) {
          const msgEvent = asRecord(rawMsgEvent);
          if (!msgEvent) continue;
          const messageObj = asRecord(msgEvent.message);
          if (!messageObj || messageObj.is_echo) continue;

          const senderObj = asRecord(msgEvent.sender);
          const recipientObj = asRecord(msgEvent.recipient);
          const senderId = senderObj?.id ? String(senderObj.id) : undefined;
          const externalPageId =
            entryPageId || (recipientObj?.id ? String(recipientObj.id) : undefined);

          let imageUrl: string | undefined;
          if (Array.isArray(messageObj.attachments)) {
            for (const rawAtt of messageObj.attachments) {
              const att = asRecord(rawAtt);
              const payload = asRecord(att?.payload);
              if (att?.type === 'image' && typeof payload?.url === 'string') {
                imageUrl = payload.url;
                break;
              }
            }
          }

          const text =
            typeof messageObj.text === 'string' && messageObj.text.trim()
              ? messageObj.text.trim()
              : imageUrl
                ? '[Khách gửi hình ảnh]'
                : Array.isArray(messageObj.attachments) && messageObj.attachments.length > 0
                  ? '[Khách gửi tệp đính kèm]'
                  : '';

          if (!text && !imageUrl) continue;

          const senderName =
            typeof senderObj?.name === 'string' && senderObj.name.trim()
              ? senderObj.name.trim()
              : senderId
                ? `Khách ${platform.toUpperCase()} #${senderId.slice(-4)}`
                : 'Khách hàng mới';

          events.push({
            platform,
            externalPageId,
            senderExternalId: senderId,
            customerName: senderName,
            channelType: 'inbox',
            content: text,
            imageUrl,
            externalMessageId:
              typeof messageObj.mid === 'string' ? messageObj.mid : undefined,
          });
        }
      }

      // 1b. Feed / Post comment changes array
      if (Array.isArray(entry.changes)) {
        for (const rawChange of entry.changes) {
          const change = asRecord(rawChange);
          const value = asRecord(change?.value);
          if (!value) continue;

          // Ignore page's own comment echo or deletions
          if (value.verb === 'remove') continue;
          const fromObj = asRecord(value.from);
          const senderId = fromObj?.id ? String(fromObj.id) : undefined;
          if (entryPageId && senderId && senderId === entryPageId) continue;

          const photoUrl =
            typeof value.photo === 'string'
              ? value.photo
              : typeof value.link === 'string'
                ? value.link
                : undefined;

          const text =
            typeof value.message === 'string' && value.message.trim()
              ? value.message.trim()
              : photoUrl
                ? '[Khách bình luận kèm ảnh]'
                : '';
          if (!text) continue;

          const senderName =
            typeof fromObj?.name === 'string' && fromObj.name.trim()
              ? fromObj.name.trim()
              : senderId
                ? `Khách bình luận #${senderId.slice(-4)}`
                : 'Khách bình luận';

          const externalPostId = value.post_id ? String(value.post_id) : undefined;
          const externalCommentId = value.comment_id
            ? String(value.comment_id)
            : undefined;

          events.push({
            platform,
            externalPageId: entryPageId,
            senderExternalId: senderId,
            customerName: senderName,
            channelType: 'comment',
            content: text,
            imageUrl: photoUrl,
            postTitle: externalPostId ? `Bài viết ${externalPostId}` : undefined,
            externalPostId,
            externalCommentId,
            externalMessageId: externalCommentId,
          });
        }
      }
    }

    if (events.length > 0) return events;
  }

  // 2. Zalo OA Webhook v3 format
  if (typeof body.event_name === 'string' && body.event_name.startsWith('user_send_')) {
    const senderObj = asRecord(body.sender);
    const recipientObj = asRecord(body.recipient);
    const messageObj = asRecord(body.message);
    const senderId = senderObj?.id ? String(senderObj.id) : undefined;
    const externalPageId = body.oa_id
      ? String(body.oa_id)
      : recipientObj?.id
        ? String(recipientObj.id)
        : undefined;

    let imageUrl: string | undefined;
    if (Array.isArray(messageObj?.attachments)) {
      for (const rawAtt of messageObj.attachments) {
        const att = asRecord(rawAtt);
        const payload = asRecord(att?.payload);
        if (typeof payload?.url === 'string') {
          imageUrl = payload.url;
          break;
        }
      }
    }

    const text =
      typeof messageObj?.text === 'string' && messageObj.text.trim()
        ? messageObj.text.trim()
        : body.event_name === 'user_send_image'
          ? '[Khách gửi hình ảnh Zalo]'
          : body.event_name === 'user_send_file'
            ? '[Khách gửi tệp Zalo]'
            : '';

    if (text || imageUrl) {
      events.push({
        platform,
        externalPageId,
        senderExternalId: senderId,
        customerName:
          typeof senderObj?.name === 'string' && senderObj.name.trim()
            ? senderObj.name.trim()
            : senderId
              ? `Khách Zalo #${senderId.slice(-4)}`
              : 'Khách Zalo OA',
        channelType: 'inbox',
        content: text || '[Khách gửi hình ảnh Zalo]',
        imageUrl,
        externalMessageId:
          typeof messageObj?.msg_id === 'string' ? messageObj.msg_id : undefined,
      });
      return events;
    }
  }

  // 3. Direct / Custom / TikTok / Shopee / Website JSON webhook payload
  const nestedData = asRecord(body.data);
  const directContent =
    typeof body.content === 'string'
      ? body.content.trim()
      : typeof body.message === 'string'
        ? body.message.trim()
        : typeof nestedData?.content === 'string'
          ? nestedData.content.trim()
          : '';
  const directImageUrl =
    typeof body.imageUrl === 'string' && body.imageUrl.trim()
      ? body.imageUrl.trim()
      : undefined;

  if (directContent || directImageUrl) {
    events.push({
      platform,
      pageId: typeof body.pageId === 'string' ? body.pageId : undefined,
      externalPageId:
        typeof body.externalPageId === 'string'
          ? body.externalPageId
          : typeof body.shop_id === 'string' || typeof body.shop_id === 'number'
            ? String(body.shop_id)
            : undefined,
      senderExternalId:
        typeof body.senderExternalId === 'string'
          ? body.senderExternalId
          : typeof body.senderId === 'string'
            ? body.senderId
            : undefined,
      customerName:
        typeof body.customerName === 'string' && body.customerName.trim()
          ? body.customerName.trim()
          : 'Khách hàng mới',
      channelType: body.channelType === 'comment' ? 'comment' : 'inbox',
      content: directContent || '[Khách gửi hình ảnh]',
      imageUrl: directImageUrl,
      postTitle: typeof body.postTitle === 'string' ? body.postTitle : undefined,
      externalPostId:
        typeof body.externalPostId === 'string' ? body.externalPostId : undefined,
      externalCommentId:
        typeof body.externalCommentId === 'string' ? body.externalCommentId : undefined,
      externalMessageId:
        typeof body.externalMessageId === 'string' ? body.externalMessageId : undefined,
    });
  }

  return events;
}

/**
 * Computes stock adjustment multiplier when an order status changes.
 * Returns +1 to restore inventory (e.g. order returned), -1 to deduct inventory again
 * (e.g. reverting from returned back to active), or 0 when no inventory change applies.
 */
export function computeStockDeltaOnStatusChange(
  prevStatus: string,
  nextStatus: string
): 1 | -1 | 0 {
  if (prevStatus === nextStatus) return 0;
  if (prevStatus !== 'returned' && nextStatus === 'returned') return 1;
  if (prevStatus === 'returned' && nextStatus !== 'returned') return -1;
  return 0;
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateOrdersCsv(
  orders: {
    code: string;
    createdAt: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    items: { productName: string; variantLabel: string; quantity: number }[];
    carrier: string;
    trackingCode: string;
    codTotal: number;
    status: string;
    note: string;
  }[]
): string {
  const header = [
    'Mã đơn',
    'Ngày tạo',
    'Khách hàng',
    'Số điện thoại',
    'Địa chỉ giao hàng',
    'Sản phẩm',
    'Đơn vị vận chuyển',
    'Mã vận đơn',
    'Thu hộ COD (VNĐ)',
    'Trạng thái',
    'Ghi chú',
  ];

  const statusLabels: Record<string, string> = {
    pending: 'Chờ xác nhận',
    shipping: 'Đang giao',
    delivered: 'Giao thành công',
    returned: 'Hoàn hàng',
  };

  const rows = orders.map((o) => [
    o.code,
    o.createdAt,
    o.customerName,
    o.customerPhone,
    o.shippingAddress,
    o.items.map((i) => `${i.quantity}x ${i.productName} (${i.variantLabel})`).join(' | '),
    o.carrier,
    o.trackingCode,
    o.codTotal,
    statusLabels[o.status] ?? o.status,
    o.note,
  ]);

  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export type DateRangeFilter = 'today' | '7d' | '30d' | 'all';

export function isWithinDateRange(
  isoDate: string,
  range: DateRangeFilter,
  nowMs = Date.now()
): boolean {
  if (range === 'all') return true;
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return false;

  if (range === 'today') {
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    return ts >= startOfToday.getTime();
  }
  const days = range === '7d' ? 7 : 30;
  return ts >= nowMs - days * 24 * 60 * 60 * 1000;
}

export function userCanAccessPage(
  user: { role: UserRole; allowedPageIds?: string[] } | undefined | null,
  pageId: string
): boolean {
  if (!user) return true;
  if (user.role === 'owner') return true;
  if (!user.allowedPageIds || user.allowedPageIds.length === 0) return true;
  return user.allowedPageIds.includes(pageId);
}

export interface ParsedCsvProductImport {
  name: string;
  category: string;
  variants: {
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
  }[];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses CSV product inventory data into grouped products with multi-variants.
 * Columns: name, category, sku, color, size, price, stock (supports Vietnamese or English headers).
 */
export function parseProductsCsv(csvText: string): ParsedCsvProductImport[] {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const rawLines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return [];

  const firstCells = parseCsvLine(rawLines[0]).map((c) => c.toLowerCase());
  const hasHeader = firstCells.some((c) =>
    ['name', 'tên sản phẩm', 'ten san pham', 'product', 'sku'].includes(c)
  );

  const findCol = (aliases: string[], fallbackIdx: number) => {
    if (!hasHeader) return fallbackIdx;
    const idx = firstCells.findIndex((c) => aliases.includes(c));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const colName = findCol(['name', 'tên sản phẩm', 'ten san pham', 'product', 'product_name'], 0);
  const colCat = findCol(['category', 'danh mục', 'danh muc'], 1);
  const colSku = findCol(['sku', 'mã sku', 'ma sku'], 2);
  const colColor = findCol(['color', 'màu sắc', 'mau sac', 'phân loại', 'phan loai'], 3);
  const colSize = findCol(['size', 'kích thước', 'kich thuoc', 'dung tích', 'dung tich'], 4);
  const colPrice = findCol(['price', 'giá bán', 'gia ban', 'gia'], 5);
  const colStock = findCol(['stock', 'tồn kho', 'ton kho', 'so luong'], 6);

  const startIdx = hasHeader ? 1 : 0;
  const grouped = new Map<string, ParsedCsvProductImport>();

  for (let i = startIdx; i < rawLines.length; i++) {
    const cells = parseCsvLine(rawLines[i]);
    const name = (cells[colName] || '').trim();
    if (!name) continue;

    const category = (cells[colCat] || '').trim() || 'Sản phẩm mới';
    const sku = (cells[colSku] || '').trim() || `SKU-CSV-${i}`;
    const color = (cells[colColor] || '').trim() || 'Mặc định';
    const size = (cells[colSize] || '').trim() || 'Tiêu chuẩn';
    const priceRaw = Number(String(cells[colPrice] || '0').replace(/[^\d.-]/g, ''));
    const stockRaw = Number(String(cells[colStock] || '0').replace(/[^\d.-]/g, ''));

    const key = `${name.toLowerCase()}__${category.toLowerCase()}`;
    let product = grouped.get(key);
    if (!product) {
      product = { name, category, variants: [] };
      grouped.set(key, product);
    }

    product.variants.push({
      sku,
      color,
      size,
      price: Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw)) : 0,
      stock: Number.isFinite(stockRaw) ? Math.max(0, Math.round(stockRaw)) : 0,
    });
  }

  return Array.from(grouped.values());
}

export function generateSampleProductsCsv(): string {
  const rows = [
    ['Tên sản phẩm', 'Danh mục', 'SKU', 'Màu sắc', 'Kích thước', 'Giá bán', 'Tồn kho'],
    ['Sữa Rửa Mặt Dịu Nhẹ Lumi', 'Chăm sóc da', 'LUMI-SRM-150', 'Dịu nhẹ', '150ml', '210000', '30'],
    ['Sữa Rửa Mặt Dịu Nhẹ Lumi', 'Chăm sóc da', 'LUMI-SRM-300', 'Dịu nhẹ', '300ml', '350000', '18'],
    ['Phấn Nước Cushion Glow', 'Trang điểm', 'LUMI-CSH-01', 'Tone sáng', '15g', '420000', '25'],
  ];
  return `\uFEFF${rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n')}`;
}

