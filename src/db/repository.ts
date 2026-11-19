import { desc, eq, asc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  automationSettings,
  connectedPages,
  conversations,
  customers,
  messages,
  orders,
  products,
  productVariants,
  quickReplies,
  systemNotifications,
  tags,
  users,
  workspaces,
} from './schema.ts';
import type {
  AutomationSettings,
  BootstrapPayload,
  ConnectedPage,
  Conversation,
  Customer,
  Message,
  Order,
  OrderItem,
  OrderStatus,
  PlatformType,
  Product,
  QuickReply,
  ShippingCarrier,
  SystemNotification,
  Tag,
  User,
  UserRole,
} from '../types/schema.ts';
import {
  calculateOrderTotals,
  computeStockDeltaOnStatusChange,
  containsPhoneNumber,
  extractCustomerInfoFromMessages,
  interpolateQuickReply,
  selectNextAssignee,
  userCanAccessPage,
} from '../utils/omnichannel.ts';

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function sanitizePage(row: typeof connectedPages.$inferSelect): ConnectedPage {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    platform: row.platform,
    name: row.name,
    handle: row.handle,
    externalId: row.externalId,
    hasAccessToken: Boolean(row.accessToken),
    hasRefreshToken: Boolean(row.refreshToken),
    tokenExpiresAt: row.tokenExpiresAt ?? null,
    isActive: row.isActive,
    unreadCount: row.unreadCount,
    conversationCount: row.conversationCount,
    connectedAt: row.connectedAt,
  };
}

function sanitizeUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatarUrl,
    online: row.online,
    avgResponseSeconds: row.avgResponseSeconds,
    allowedPageIds: row.allowedPageIds ?? [],
  };
}

function sanitizeConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    pageId: row.pageId,
    customerId: row.customerId,
    platform: row.platform,
    channelType: row.channelType,
    postTitle: row.postTitle,
    externalPostId: row.externalPostId ?? null,
    botPaused: row.botPaused,
    unreadCount: row.unreadCount,
    isReplied: row.isReplied,
    hasPhone: row.hasPhone,
    assigneeId: row.assigneeId,
    tagIds: row.tagIds ?? [],
    lastMessageText: row.lastMessageText,
    lastMessageAt: row.lastMessageAt,
  };
}

function sanitizeCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fullName: row.fullName,
    phone: row.phone,
    address: row.address,
    platform: row.platform,
    externalId: row.externalId ?? undefined,
    avatarUrl: row.avatarUrl || undefined,
    totalOrders: row.totalOrders,
    deliveredOrders: row.deliveredOrders,
    returnedOrders: row.returnedOrders,
    note: row.note,
    previousAssigneeId: row.previousAssigneeId,
  };
}

function sanitizeMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    senderId: row.senderId,
    senderName: row.senderName,
    messageType: row.messageType,
    content: row.content,
    imageUrl: row.imageUrl ?? undefined,
    fileName: row.fileName ?? undefined,
    externalMessageId: row.externalMessageId ?? undefined,
    externalCommentId: row.externalCommentId ?? undefined,
    isHidden: row.isHidden,
    isLiked: row.isLiked,
    convertedToInbox: row.convertedToInbox,
    createdAt: row.createdAt,
  };
}

function sanitizeNotification(
  row: typeof systemNotifications.$inferSelect
): SystemNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    conversationId: row.conversationId ?? undefined,
    read: row.read,
    createdAt: row.createdAt,
  };
}

async function seedInitialWorkspaceData(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ownerProfile?: { uid: string; email: string; name?: string; avatarUrl?: string }
) {
  const wsId = 'ws_lumi';
  await tx
    .insert(workspaces)
    .values({
      id: wsId,
      name: 'Lumi Commerce Group',
      ownerId: 'u1',
      plan: 'Omnichannel Pro',
      createdAt: minutesAgo(60 * 24 * 30),
    })
    .onConflictDoNothing();

  await tx
    .insert(users)
    .values([
      {
        id: 'u1',
        uid: ownerProfile?.uid || 'seed_owner',
        workspaceId: wsId,
        name: ownerProfile?.name || 'Nguyễn Minh Thư',
        email: ownerProfile?.email || 'thu.nguyen@dauto.vn',
        role: 'owner',
        avatarUrl:
          ownerProfile?.avatarUrl ||
          '/src/assets/images/avatar_staff_lead_1794901775950.jpg',
        online: true,
        avgResponseSeconds: 38,
      },
      {
        id: 'u2',
        uid: 'seed_u2',
        workspaceId: wsId,
        name: 'Trần Quốc Bảo',
        email: 'bao.tran@dauto.vn',
        role: 'admin',
        avatarUrl: '',
        online: true,
        avgResponseSeconds: 45,
      },
      {
        id: 'u3',
        uid: 'seed_u3',
        workspaceId: wsId,
        name: 'Lê Thảo Vy',
        email: 'vy.le@dauto.vn',
        role: 'sale',
        avatarUrl: '',
        online: true,
        avgResponseSeconds: 29,
      },
      {
        id: 'u4',
        uid: 'seed_u4',
        workspaceId: wsId,
        name: 'Phạm Hoàng Nam',
        email: 'nam.pham@dauto.vn',
        role: 'warehouse',
        avatarUrl: '',
        online: true,
        avgResponseSeconds: 62,
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(connectedPages)
    .values([
      {
        id: 'page_fb_1',
        workspaceId: wsId,
        platform: 'facebook',
        name: 'Lumi Beauty Official',
        handle: '@lumibeauty.vn',
        externalId: 'fb_1029384756',
        accessToken: null,
        isActive: false,
        unreadCount: 2,
        conversationCount: 2,
        connectedAt: null,
      },
      {
        id: 'page_tt_1',
        workspaceId: wsId,
        platform: 'tiktok',
        name: 'Lumi Mall TikTok Shop',
        handle: '@lumimall.official',
        externalId: 'tt_99887766',
        accessToken: null,
        isActive: false,
        unreadCount: 1,
        conversationCount: 1,
        connectedAt: null,
      },
      {
        id: 'page_zalo_1',
        workspaceId: wsId,
        platform: 'zalo',
        name: 'Lumi Skincare Zalo OA',
        handle: 'OA ID: 384920192',
        externalId: 'zalo_384920192',
        accessToken: null,
        isActive: false,
        unreadCount: 0,
        conversationCount: 1,
        connectedAt: null,
      },
      {
        id: 'page_ig_1',
        workspaceId: wsId,
        platform: 'instagram',
        name: 'Lumi Fashion Studio',
        handle: '@lumifashion.studio',
        externalId: 'ig_55443322',
        accessToken: null,
        isActive: false,
        unreadCount: 1,
        conversationCount: 1,
        connectedAt: null,
      },
      {
        id: 'page_shopee_1',
        workspaceId: wsId,
        platform: 'shopee',
        name: 'Lumi Cosmetics Mall',
        handle: 'shopee.vn/lumicosmetics',
        externalId: 'sp_77112233',
        accessToken: null,
        isActive: false,
        unreadCount: 1,
        conversationCount: 1,
        connectedAt: null,
      },
      {
        id: 'page_web_1',
        workspaceId: wsId,
        platform: 'website',
        name: 'Website Livechat dauto.vn',
        handle: 'lumi-store.vn',
        externalId: 'web_lumi_01',
        accessToken: null,
        isActive: false,
        unreadCount: 1,
        conversationCount: 1,
        connectedAt: null,
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(tags)
    .values([
      { id: 't1', workspaceId: wsId, name: 'Khách VIP', color: '#7C3AED' },
      { id: 't2', workspaceId: wsId, name: 'Đã chốt', color: '#16A34A' },
      { id: 't3', workspaceId: wsId, name: 'Chờ chuyển khoản', color: '#D97706' },
      { id: 't4', workspaceId: wsId, name: 'Hỏi giá', color: '#2563EB' },
      { id: 't5', workspaceId: wsId, name: 'Lưu ý hoàn đơn', color: '#DC2626' },
    ])
    .onConflictDoNothing();

  await tx
    .insert(customers)
    .values([
      {
        id: 'cust_1',
        workspaceId: wsId,
        fullName: 'Nguyễn Lan Hương',
        phone: '',
        address: '',
        platform: 'facebook',
        totalOrders: 4,
        deliveredOrders: 4,
        returnedOrders: 0,
        note: 'Thích giao giờ hành chính, hay mua dòng Serum Vitamin C',
        previousAssigneeId: 'u3',
      },
      {
        id: 'cust_2',
        workspaceId: wsId,
        fullName: 'Trần Minh Quân',
        phone: '0987654321',
        address: '',
        platform: 'facebook',
        totalOrders: 1,
        deliveredOrders: 1,
        returnedOrders: 0,
        note: 'Để lại SĐT trên livestream',
        previousAssigneeId: 'u1',
      },
      {
        id: 'cust_3',
        workspaceId: wsId,
        fullName: 'Phạm Ngọc Ánh',
        phone: '0905112233',
        address: '88 Trần Phú, Hải Châu, Đà Nẵng',
        platform: 'tiktok',
        totalOrders: 5,
        deliveredOrders: 2,
        returnedOrders: 3,
        note: 'Cần gọi xác nhận kỹ trước khi gửi vận đơn',
        previousAssigneeId: 'u3',
      },
      {
        id: 'cust_4',
        workspaceId: wsId,
        fullName: 'Lê Thanh Tâm',
        phone: '0938221445',
        address: '45 Lê Lợi, Phường Bến Nghé, Quận 1, TP HCM',
        platform: 'zalo',
        totalOrders: 8,
        deliveredOrders: 8,
        returnedOrders: 0,
        note: 'Khách VIP thường chuyển khoản trước',
        previousAssigneeId: 'u2',
      },
      {
        id: 'cust_5',
        workspaceId: wsId,
        fullName: 'Hoàng Bảo Ngọc',
        phone: '',
        address: '',
        platform: 'instagram',
        totalOrders: 0,
        deliveredOrders: 0,
        returnedOrders: 0,
        note: '',
        previousAssigneeId: null,
      },
      {
        id: 'cust_6',
        workspaceId: wsId,
        fullName: 'Đặng Thu Trang',
        phone: '',
        address: '',
        platform: 'shopee',
        totalOrders: 2,
        deliveredOrders: 2,
        returnedOrders: 0,
        note: '',
        previousAssigneeId: 'u3',
      },
      {
        id: 'cust_7',
        workspaceId: wsId,
        fullName: 'Vũ Hải Long',
        phone: '0365889900',
        address: '120 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP HCM',
        platform: 'website',
        totalOrders: 1,
        deliveredOrders: 0,
        returnedOrders: 1,
        note: '',
        previousAssigneeId: 'u1',
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(conversations)
    .values([
      {
        id: 'conv_1',
        workspaceId: wsId,
        pageId: 'page_fb_1',
        customerId: 'cust_1',
        platform: 'facebook',
        channelType: 'inbox',
        postTitle: null,
        unreadCount: 2,
        isReplied: false,
        hasPhone: true,
        assigneeId: 'u3',
        tagIds: ['t4'],
        lastMessageText:
          'Gửi cho chị 1 Serum Vitamin C 30ml nhé. SĐT 0912.345.678, Địa chỉ: Số 28 Ngõ 105 Láng Hạ, Đống Đa, Hà Nội',
        lastMessageAt: minutesAgo(3),
      },
      {
        id: 'conv_2',
        workspaceId: wsId,
        pageId: 'page_fb_1',
        customerId: 'cust_2',
        platform: 'facebook',
        channelType: 'comment',
        postTitle: 'Livestream Sale 50% Serum Vitamin C & Kem Chống Nắng SPF50+',
        unreadCount: 1,
        isReplied: false,
        hasPhone: true,
        assigneeId: 'u1',
        tagIds: ['t4'],
        lastMessageText:
          'Lấy mình combo serum + chống nắng, gọi 0987 654 321 nhé shop',
        lastMessageAt: minutesAgo(8),
      },
      {
        id: 'conv_3',
        workspaceId: wsId,
        pageId: 'page_tt_1',
        customerId: 'cust_3',
        platform: 'tiktok',
        channelType: 'inbox',
        postTitle: null,
        unreadCount: 1,
        isReplied: false,
        hasPhone: true,
        assigneeId: 'u3',
        tagIds: ['t5'],
        lastMessageText:
          'Áo Blazer Linen màu Be size M còn không shop? Giao về 88 Trần Phú, Đà Nẵng sđt 0905112233 nha',
        lastMessageAt: minutesAgo(14),
      },
      {
        id: 'conv_4',
        workspaceId: wsId,
        pageId: 'page_zalo_1',
        customerId: 'cust_4',
        platform: 'zalo',
        channelType: 'inbox',
        postTitle: null,
        unreadCount: 0,
        isReplied: true,
        hasPhone: true,
        assigneeId: 'u2',
        tagIds: ['t1', 't3'],
        lastMessageText: 'Ok em giữ chị 2 lọ Serum 50ml, chiều chị chuyển khoản nhé',
        lastMessageAt: minutesAgo(28),
      },
      {
        id: 'conv_5',
        workspaceId: wsId,
        pageId: 'page_ig_1',
        customerId: 'cust_5',
        platform: 'instagram',
        channelType: 'comment',
        postTitle: 'BST Blazer Linen Thu Đông 2026 - Thanh lịch chuẩn công sở',
        unreadCount: 1,
        isReplied: false,
        hasPhone: false,
        assigneeId: 'u1',
        tagIds: ['t4'],
        lastMessageText: 'Ib giá áo blazer màu be size S giúp mình với shop ơi',
        lastMessageAt: minutesAgo(36),
      },
      {
        id: 'conv_6',
        workspaceId: wsId,
        pageId: 'page_shopee_1',
        customerId: 'cust_6',
        platform: 'shopee',
        channelType: 'inbox',
        postTitle: null,
        unreadCount: 1,
        isReplied: false,
        hasPhone: false,
        assigneeId: 'u3',
        tagIds: [],
        lastMessageText: 'Son lì Velvet màu Đỏ đất còn hàng sẵn giao ngay không ạ?',
        lastMessageAt: minutesAgo(52),
      },
      {
        id: 'conv_7',
        workspaceId: wsId,
        pageId: 'page_web_1',
        customerId: 'cust_7',
        platform: 'website',
        channelType: 'inbox',
        postTitle: null,
        unreadCount: 1,
        isReplied: false,
        hasPhone: true,
        assigneeId: 'u1',
        tagIds: ['t4'],
        lastMessageText:
          'Mình đặt 1 kem chống nắng kiềm dầu, giao về 120 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP HCM, số 0365889900',
        lastMessageAt: minutesAgo(75),
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(messages)
    .values([
      {
        id: 'm_101',
        conversationId: 'conv_1',
        senderType: 'customer',
        senderId: 'cust_1',
        senderName: 'Nguyễn Lan Hương',
        messageType: 'text',
        content: 'Shop ơi Serum Vitamin C 30ml hôm nay có còn ưu đãi freeship không?',
        createdAt: minutesAgo(12),
      },
      {
        id: 'm_102',
        conversationId: 'conv_1',
        senderType: 'staff',
        senderId: 'u3',
        senderName: 'Lê Thảo Vy',
        messageType: 'text',
        content:
          'Dạ chào chị Hương, bên em đang hỗ trợ freeship đơn từ 500k hoặc giảm 15k ship cho khách quen ạ. Chị gửi em lại SĐT và địa chỉ nhận hàng nhé!',
        createdAt: minutesAgo(7),
      },
      {
        id: 'm_103',
        conversationId: 'conv_1',
        senderType: 'customer',
        senderId: 'cust_1',
        senderName: 'Nguyễn Lan Hương',
        messageType: 'text',
        content:
          'Gửi cho chị 1 Serum Vitamin C 30ml nhé. SĐT 0912.345.678, Địa chỉ: Số 28 Ngõ 105 Láng Hạ, Đống Đa, Hà Nội',
        createdAt: minutesAgo(3),
      },
      {
        id: 'm_201',
        conversationId: 'conv_2',
        senderType: 'customer',
        senderId: 'cust_2',
        senderName: 'Trần Minh Quân',
        messageType: 'comment',
        content: 'Lấy mình combo serum + chống nắng, gọi 0987 654 321 nhé shop',
        isHidden: true,
        isLiked: false,
        convertedToInbox: false,
        createdAt: minutesAgo(8),
      },
      {
        id: 'm_301',
        conversationId: 'conv_3',
        senderType: 'customer',
        senderId: 'cust_3',
        senderName: 'Phạm Ngọc Ánh',
        messageType: 'text',
        content:
          'Áo Blazer Linen màu Be size M còn không shop? Giao về 88 Trần Phú, Đà Nẵng sđt 0905112233 nha',
        createdAt: minutesAgo(14),
      },
      {
        id: 'm_401',
        conversationId: 'conv_4',
        senderType: 'customer',
        senderId: 'cust_4',
        senderName: 'Lê Thanh Tâm',
        messageType: 'text',
        content: 'Chị muốn đặt thêm 2 chai Serum Vitamin C 50ml gửi về Quận 1 nhé',
        createdAt: minutesAgo(45),
      },
      {
        id: 'm_402',
        conversationId: 'conv_4',
        senderType: 'staff',
        senderId: 'u2',
        senderName: 'Trần Quốc Bảo',
        messageType: 'text',
        content:
          'Dạ em lên đơn 2 chai Serum 50ml cho chị Tâm rồi ạ, tổng 980.000đ freeship chị nhé.',
        createdAt: minutesAgo(33),
      },
      {
        id: 'm_403',
        conversationId: 'conv_4',
        senderType: 'customer',
        senderId: 'cust_4',
        senderName: 'Lê Thanh Tâm',
        messageType: 'text',
        content: 'Ok em giữ chị 2 lọ Serum 50ml, chiều chị chuyển khoản nhé',
        createdAt: minutesAgo(28),
      },
      {
        id: 'm_501',
        conversationId: 'conv_5',
        senderType: 'customer',
        senderId: 'cust_5',
        senderName: 'Hoàng Bảo Ngọc',
        messageType: 'comment',
        content: 'Ib giá áo blazer màu be size S giúp mình với shop ơi',
        isHidden: false,
        isLiked: false,
        convertedToInbox: false,
        createdAt: minutesAgo(36),
      },
      {
        id: 'm_601',
        conversationId: 'conv_6',
        senderType: 'customer',
        senderId: 'cust_6',
        senderName: 'Đặng Thu Trang',
        messageType: 'text',
        content: 'Son lì Velvet màu Đỏ đất còn hàng sẵn giao ngay không ạ?',
        createdAt: minutesAgo(52),
      },
      {
        id: 'm_701',
        conversationId: 'conv_7',
        senderType: 'customer',
        senderId: 'cust_7',
        senderName: 'Vũ Hải Long',
        messageType: 'text',
        content:
          'Mình đặt 1 kem chống nắng kiềm dầu, giao về 120 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP HCM, số 0365889900',
        createdAt: minutesAgo(75),
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(products)
    .values([
      {
        id: 'prod_1',
        workspaceId: wsId,
        name: 'Serum Vitamin C 15% Sáng Da Lumi',
        category: 'Chăm sóc da',
        imageUrl: '/src/assets/images/product_vitamin_serum_1794901776333.jpg',
      },
      {
        id: 'prod_2',
        workspaceId: wsId,
        name: 'Kem Chống Nắng Hydra Shield SPF50+',
        category: 'Chăm sóc da',
        imageUrl: '/src/assets/images/product_sunscreen_tube_1794901777067.jpg',
      },
      {
        id: 'prod_3',
        workspaceId: wsId,
        name: 'Son Lì Velvet Matte Aeterna',
        category: 'Trang điểm',
        imageUrl: '/src/assets/images/product_velvet_lipstick_1794901776428.jpg',
      },
      {
        id: 'prod_4',
        workspaceId: wsId,
        name: 'Áo Blazer Linen Dáng Suông Cao Cấp',
        category: 'Thời trang nữ',
        imageUrl: '/src/assets/images/product_linen_blazer_1794901777942.jpg',
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(productVariants)
    .values([
      {
        id: 'var_1',
        productId: 'prod_1',
        sku: 'LUMI-SVC-30',
        color: 'Hổ phách',
        size: '30ml',
        price: 320000,
        stock: 48,
      },
      {
        id: 'var_2',
        productId: 'prod_1',
        sku: 'LUMI-SVC-50',
        color: 'Hổ phách',
        size: '50ml',
        price: 490000,
        stock: 22,
      },
      {
        id: 'var_3',
        productId: 'prod_2',
        sku: 'LUMI-KCN-50K',
        color: 'Kiềm dầu',
        size: '50g',
        price: 265000,
        stock: 64,
      },
      {
        id: 'var_4',
        productId: 'prod_2',
        sku: 'LUMI-KCN-50D',
        color: 'Dưỡng ẩm',
        size: '50g',
        price: 265000,
        stock: 35,
      },
      {
        id: 'var_5',
        productId: 'prod_3',
        sku: 'AET-SON-01',
        color: 'Đỏ đất',
        size: '3.5g',
        price: 290000,
        stock: 41,
      },
      {
        id: 'var_6',
        productId: 'prod_3',
        sku: 'AET-SON-02',
        color: 'Cam cháy',
        size: '3.5g',
        price: 290000,
        stock: 19,
      },
      {
        id: 'var_7',
        productId: 'prod_4',
        sku: 'BLZ-BE-S',
        color: 'Be kem',
        size: 'S',
        price: 680000,
        stock: 14,
      },
      {
        id: 'var_8',
        productId: 'prod_4',
        sku: 'BLZ-BE-M',
        color: 'Be kem',
        size: 'M',
        price: 680000,
        stock: 26,
      },
      {
        id: 'var_9',
        productId: 'prod_4',
        sku: 'BLZ-BE-L',
        color: 'Be kem',
        size: 'L',
        price: 680000,
        stock: 9,
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(orders)
    .values([
      {
        id: 'ord_1',
        code: 'DAU-2601',
        workspaceId: wsId,
        pageId: 'page_zalo_1',
        conversationId: 'conv_4',
        customerId: 'cust_4',
        customerName: 'Lê Thanh Tâm',
        customerPhone: '0938221445',
        shippingAddress: '45 Lê Lợi, Phường Bến Nghé, Quận 1, TP HCM',
        items: [
          {
            productId: 'prod_1',
            productName: 'Serum Vitamin C 15% Sáng Da Lumi',
            variantId: 'var_2',
            variantLabel: 'Hổ phách · 50ml',
            sku: 'LUMI-SVC-50',
            price: 490000,
            quantity: 2,
          },
        ],
        subtotal: 980000,
        shippingFee: 0,
        discount: 0,
        codTotal: 980000,
        carrier: 'GHN',
        trackingCode: 'GHN849201',
        status: 'pending',
        note: 'Khách VIP, gọi trước khi giao',
        createdByStaffId: 'u2',
        createdAt: minutesAgo(30),
      },
      {
        id: 'ord_2',
        code: 'DAU-2598',
        workspaceId: wsId,
        pageId: 'page_fb_1',
        conversationId: 'conv_1',
        customerId: 'cust_1',
        customerName: 'Nguyễn Lan Hương',
        customerPhone: '0912345678',
        shippingAddress: 'Số 28 Ngõ 105 Láng Hạ, Đống Đa, Hà Nội',
        items: [
          {
            productId: 'prod_2',
            productName: 'Kem Chống Nắng Hydra Shield SPF50+',
            variantId: 'var_3',
            variantLabel: 'Kiềm dầu · 50g',
            sku: 'LUMI-KCN-50K',
            price: 265000,
            quantity: 2,
          },
        ],
        subtotal: 530000,
        shippingFee: 0,
        discount: 20000,
        codTotal: 510000,
        carrier: 'GHTK',
        trackingCode: 'GHTK773910',
        status: 'delivered',
        note: 'Giao giờ hành chính',
        createdByStaffId: 'u3',
        createdAt: minutesAgo(60 * 24 * 3),
      },
      {
        id: 'ord_3',
        code: 'DAU-2594',
        workspaceId: wsId,
        pageId: 'page_tt_1',
        conversationId: 'conv_3',
        customerId: 'cust_3',
        customerName: 'Phạm Ngọc Ánh',
        customerPhone: '0905112233',
        shippingAddress: '88 Trần Phú, Hải Châu, Đà Nẵng',
        items: [
          {
            productId: 'prod_3',
            productName: 'Son Lì Velvet Matte Aeterna',
            variantId: 'var_5',
            variantLabel: 'Đỏ đất · 3.5g',
            sku: 'AET-SON-01',
            price: 290000,
            quantity: 1,
          },
        ],
        subtotal: 290000,
        shippingFee: 30000,
        discount: 0,
        codTotal: 320000,
        carrier: 'Viettel Post',
        trackingCode: 'VTP551902',
        status: 'returned',
        note: 'Khách không nghe máy 3 lần',
        createdByStaffId: 'u3',
        createdAt: minutesAgo(60 * 24 * 5),
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(quickReplies)
    .values([
      {
        id: 'qr_1',
        workspaceId: wsId,
        shortcut: '/chao',
        title: 'Chào hỏi khách hàng mới',
        content:
          'Chào {full_name}, cảm ơn bạn đã quan tâm sản phẩm của {page_name}! Em là {staff_name}, em hỗ trợ tư vấn mình ạ.',
        category: 'Chào hỏi',
      },
      {
        id: 'qr_2',
        workspaceId: wsId,
        shortcut: '/gia',
        title: 'Báo giá & Freeship đơn 500k',
        content:
          'Dạ {full_name} ơi, đơn từ 500.000đ bên em miễn phí giao hàng toàn quốc ạ. Mình nhắn em SĐT và địa chỉ để em giữ hàng nhé!',
        category: 'Tư vấn giá',
      },
      {
        id: 'qr_3',
        workspaceId: wsId,
        shortcut: '/xacnhan',
        title: 'Xác nhận chốt đơn hàng',
        content:
          'Dạ {page_name} đã lên đơn cho {full_name} qua SĐT {phone} rồi ạ. Hàng sẽ đến tay anh/chị trong 2-3 ngày tới!',
        category: 'Chốt đơn',
      },
      {
        id: 'qr_4',
        workspaceId: wsId,
        shortcut: '/stk',
        title: 'Thông tin chuyển khoản',
        content:
          'Dạ {full_name} chuyển khoản về Techcombank - STK: 19038492011 - NGUYEN MINH THU, nội dung: {phone} giúp em nhé ạ.',
        category: 'Thanh toán',
      },
    ])
    .onConflictDoNothing();

  await tx
    .insert(automationSettings)
    .values({
      id: wsId,
      workspaceId: wsId,
      autoHidePhoneComments: true,
      autoReplyComments: true,
      keywordRules: [
        {
          id: 'kr_1',
          keywords: ['giá', 'ib', 'bao nhiêu', 'tư vấn'],
          commentReply:
            'Dạ {full_name} kiểm tra tin nhắn chờ nhé, {page_name} đã inbox báo giá chi tiết và ưu đãi cho mình rồi ạ!',
          inboxReply:
            'Chào {full_name}, cảm ơn bạn đã bình luận trên {page_name}! Mình cần tư vấn sản phẩm nào để em gửi bảng giá và ưu đãi ạ?',
          enabled: true,
        },
        {
          id: 'kr_2',
          keywords: ['chốt', 'đặt hàng', 'lấy mình', 'ship'],
          commentReply:
            'Dạ {page_name} đã tiếp nhận thông tin đặt hàng của {full_name} và ẩn bình luận để bảo mật SĐT giúp mình ạ!',
          inboxReply:
            'Chào {full_name}, em đã nhận yêu cầu đặt hàng từ bình luận của mình. Em xác nhận lại địa chỉ nhận hàng cho mình nhé!',
          enabled: true,
        },
      ],
      roundRobinEnabled: true,
      roundRobinMode: 'sticky_previous',
      lastAssignedIndex: 0,
      webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'dauto_verify_2026',
    })
    .onConflictDoNothing();

  await tx
    .insert(systemNotifications)
    .values([
      {
        id: 'notif_1',
        workspaceId: wsId,
        title: 'Tự động ẩn bình luận có SĐT',
        body: 'Hệ thống đã tự động ẩn bình luận chứa số 0987654321 của Trần Minh Quân.',
        conversationId: 'conv_2',
        read: false,
        createdAt: minutesAgo(8),
      },
      {
        id: 'notif_2',
        workspaceId: wsId,
        title: 'Khách hàng có tỷ lệ hoàn đơn cao',
        body: 'Phạm Ngọc Ánh (TikTok Shop) có 3/5 đơn hoàn trước đó. Vui lòng xác nhận kỹ.',
        conversationId: 'conv_3',
        read: false,
        createdAt: minutesAgo(14),
      },
    ])
    .onConflictDoNothing();
}

export async function getOrCreateUserAndBootstrap(authUser: {
  uid: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}): Promise<BootstrapPayload & { currentUserId: string }> {
  try {
    return await db.transaction(async (tx) => {
      const existingWs = await tx.select().from(workspaces).limit(1);
      if (existingWs.length === 0) {
        await seedInitialWorkspaceData(tx, authUser);
      }

      const ws = (await tx.select().from(workspaces).limit(1))[0];
      const existingByUid = await tx
        .select()
        .from(users)
        .where(eq(users.uid, authUser.uid))
        .limit(1);

      let activeUser: typeof users.$inferSelect;
      if (existingByUid.length > 0) {
        const updated = await tx
          .update(users)
          .set({
            email: authUser.email,
            ...(authUser.name ? { name: authUser.name } : {}),
            ...(authUser.avatarUrl ? { avatarUrl: authUser.avatarUrl } : {}),
          })
          .where(eq(users.uid, authUser.uid))
          .returning();
        activeUser = updated[0];
      } else {
        // Check if this email was pre-invited by Owner, or claim seed_owner row
        const invitedByEmail = await tx
          .select()
          .from(users)
          .where(eq(users.email, authUser.email.toLowerCase()))
          .limit(1);

        const seedOwner = await tx
          .select()
          .from(users)
          .where(eq(users.uid, 'seed_owner'))
          .limit(1);

        if (invitedByEmail.length > 0 && invitedByEmail[0].uid.startsWith('invite_')) {
          const claimedInvite = await tx
            .update(users)
            .set({
              uid: authUser.uid,
              name: authUser.name || invitedByEmail[0].name,
              avatarUrl: authUser.avatarUrl || invitedByEmail[0].avatarUrl,
            })
            .where(eq(users.id, invitedByEmail[0].id))
            .returning();
          activeUser = claimedInvite[0];
        } else if (seedOwner.length > 0) {
          const claimed = await tx
            .update(users)
            .set({
              uid: authUser.uid,
              email: authUser.email.toLowerCase(),
              name: authUser.name || seedOwner[0].name,
              avatarUrl: authUser.avatarUrl || seedOwner[0].avatarUrl,
            })
            .where(eq(users.id, seedOwner[0].id))
            .returning();
          activeUser = claimed[0];
        } else {
          const newId = `u_${authUser.uid.slice(0, 10)}`;
          const inserted = await tx
            .insert(users)
            .values({
              id: newId,
              uid: authUser.uid,
              workspaceId: ws.id,
              name: authUser.name || authUser.email.split('@')[0],
              email: authUser.email.toLowerCase(),
              role: 'sale',
              avatarUrl: authUser.avatarUrl || '',
              online: true,
              avgResponseSeconds: 40,
              allowedPageIds: [],
            })
            .onConflictDoUpdate({
              target: users.uid,
              set: {
                email: authUser.email.toLowerCase(),
                ...(authUser.name ? { name: authUser.name } : {}),
                ...(authUser.avatarUrl ? { avatarUrl: authUser.avatarUrl } : {}),
              },
            })
            .returning();
          activeUser = inserted[0];
        }
      }

      const [
        allUsers,
        allPages,
        allCustomers,
        allTags,
        allConvs,
        allMsgs,
        allProds,
        allVariants,
        allOrders,
        allQuickReplies,
        allAuto,
        allNotifs,
      ] = await Promise.all([
        tx.select().from(users),
        tx.select().from(connectedPages),
        tx.select().from(customers),
        tx.select().from(tags),
        tx.select().from(conversations).orderBy(desc(conversations.lastMessageAt)),
        tx.select().from(messages).orderBy(asc(messages.createdAt)),
        tx.select().from(products),
        tx.select().from(productVariants),
        tx.select().from(orders).orderBy(desc(orders.createdAt)),
        tx.select().from(quickReplies),
        tx.select().from(automationSettings).limit(1),
        tx.select().from(systemNotifications).orderBy(desc(systemNotifications.createdAt)),
      ]);

      const sanitizedActiveUser = sanitizeUser(activeUser);
      const accessiblePages = allPages
        .filter((p) => userCanAccessPage(sanitizedActiveUser, p.id))
        .map(sanitizePage);
      const accessiblePageIds = new Set(accessiblePages.map((p) => p.id));

      const accessibleConvs = allConvs
        .filter((c) => accessiblePageIds.has(c.pageId))
        .map(sanitizeConversation);
      const accessibleConvIds = new Set(accessibleConvs.map((c) => c.id));

      const productList: Product[] = allProds.map((p) => ({
        ...p,
        variants: allVariants.filter((v) => v.productId === p.id),
      }));

      const autoRow = allAuto[0];
      const automation: AutomationSettings = autoRow
        ? {
            autoHidePhoneComments: autoRow.autoHidePhoneComments,
            autoReplyComments: autoRow.autoReplyComments,
            keywordRules: autoRow.keywordRules ?? [],
            roundRobinEnabled: autoRow.roundRobinEnabled,
            roundRobinMode: autoRow.roundRobinMode,
            lastAssignedIndex: autoRow.lastAssignedIndex,
            webhookVerifyToken:
              autoRow.webhookVerifyToken ||
              process.env.WEBHOOK_VERIFY_TOKEN ||
              'dauto_verify_2026',
            botApiKey: autoRow.botApiKey || process.env.BOT_API_KEY || '',
            outboundWebhookUrl:
              autoRow.outboundWebhookUrl ||
              process.env.OUTBOUND_BOT_WEBHOOK_URL ||
              '',
            autoPauseBotOnStaffReply: autoRow.autoPauseBotOnStaffReply,
          }
        : {
            autoHidePhoneComments: true,
            autoReplyComments: true,
            keywordRules: [],
            roundRobinEnabled: true,
            roundRobinMode: 'sticky_previous',
            lastAssignedIndex: 0,
            webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'dauto_verify_2026',
            botApiKey: process.env.BOT_API_KEY || '',
            outboundWebhookUrl: process.env.OUTBOUND_BOT_WEBHOOK_URL || '',
            autoPauseBotOnStaffReply: true,
          };

      return {
        currentUserId: activeUser.id,
        workspace: ws,
        users: allUsers.map(sanitizeUser),
        pages: accessiblePages,
        customers: allCustomers.map(sanitizeCustomer),
        tags: allTags,
        conversations: accessibleConvs,
        messages: allMsgs
          .filter((m) => accessibleConvIds.has(m.conversationId))
          .map(sanitizeMessage),
        products: productList,
        orders: allOrders.filter((o) => accessiblePageIds.has(o.pageId)),
        quickReplies: allQuickReplies,
        automation,
        notifications: allNotifs.map(sanitizeNotification),
      };
    });
  } catch (error) {
    console.error('Database bootstrap failed:', error);
    throw new Error('Không thể tải dữ liệu từ Cloud SQL. Vui lòng thử lại.', {
      cause: error,
    });
  }
}

export async function getPages(): Promise<ConnectedPage[]> {
  try {
    const rows = await db.select().from(connectedPages);
    return rows.map(sanitizePage);
  } catch (error) {
    console.error('getPages failed:', error);
    throw new Error('Không thể tải danh sách trang kết nối.', { cause: error });
  }
}

export async function connectPage(payload: {
  pageId?: string;
  platform: PlatformType;
  name?: string;
  handle?: string;
  externalId?: string;
  accessToken?: string;
}): Promise<ConnectedPage> {
  try {
    if (payload.pageId) {
      const existing = await db
        .select()
        .from(connectedPages)
        .where(eq(connectedPages.id, payload.pageId))
        .limit(1);

      if (existing.length > 0) {
        const updated = await db
          .update(connectedPages)
          .set({
            isActive: true,
            connectedAt: new Date().toISOString(),
            ...(payload.externalId?.trim()
              ? { externalId: payload.externalId.trim() }
              : {}),
            ...(payload.accessToken?.trim()
              ? { accessToken: payload.accessToken.trim() }
              : {}),
          })
          .where(eq(connectedPages.id, payload.pageId))
          .returning();
        return sanitizePage(updated[0]);
      }
    }

    const ws = (await db.select().from(workspaces).limit(1))[0];
    if (!ws) {
      throw new Error('Workspace chưa được khởi tạo');
    }

    const inserted = await db
      .insert(connectedPages)
      .values({
        id: `page_${Date.now()}`,
        workspaceId: ws.id,
        platform: payload.platform,
        name: payload.name?.trim() || `Kênh ${payload.platform.toUpperCase()} Mới`,
        handle: payload.handle?.trim() || `@dauto.${payload.platform}`,
        externalId: payload.externalId?.trim() || `${payload.platform}_${Date.now()}`,
        accessToken: payload.accessToken?.trim() || null,
        isActive: true,
        unreadCount: 0,
        conversationCount: 0,
        connectedAt: new Date().toISOString(),
      })
      .returning();

    return sanitizePage(inserted[0]);
  } catch (error) {
    console.error('connectPage failed:', error);
    throw new Error('Không thể kết nối trang mới.', { cause: error });
  }
}

export async function getPageWithTokens(pageId: string) {
  const rows = await db
    .select()
    .from(connectedPages)
    .where(eq(connectedPages.id, pageId))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    ...sanitizePage(rows[0]),
    accessToken: rows[0].accessToken,
    refreshToken: rows[0].refreshToken,
  };
}

export async function updatePageCredentials(
  pageId: string,
  patch: {
    externalId?: string;
    accessToken?: string;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
  }
): Promise<ConnectedPage | null> {
  try {
    const existing = await db
      .select()
      .from(connectedPages)
      .where(eq(connectedPages.id, pageId))
      .limit(1);
    if (existing.length === 0) return null;

    const updateSet: Partial<typeof connectedPages.$inferInsert> = {};
    if (patch.externalId !== undefined && patch.externalId.trim()) {
      updateSet.externalId = patch.externalId.trim();
    }
    if (patch.accessToken !== undefined) {
      updateSet.accessToken = patch.accessToken.trim() || null;
    }
    if (patch.refreshToken !== undefined) {
      updateSet.refreshToken = patch.refreshToken?.trim() || null;
    }
    if (patch.tokenExpiresAt !== undefined) {
      updateSet.tokenExpiresAt = patch.tokenExpiresAt;
    }

    if (Object.keys(updateSet).length === 0) {
      return sanitizePage(existing[0]);
    }

    const updated = await db
      .update(connectedPages)
      .set(updateSet)
      .where(eq(connectedPages.id, pageId))
      .returning();
    return sanitizePage(updated[0]);
  } catch (error) {
    console.error('updatePageCredentials failed:', error);
    throw new Error('Không thể lưu cấu hình Page ID / Token.', { cause: error });
  }
}

export async function upsertOAuthConnectedPage(payload: {
  platform: PlatformType;
  externalId: string;
  name: string;
  handle: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}): Promise<ConnectedPage> {
  const allPages = await db.select().from(connectedPages);
  const existing = allPages.find(
    (p) => p.platform === payload.platform && p.externalId === payload.externalId
  );

  if (existing) {
    const updated = await db
      .update(connectedPages)
      .set({
        name: payload.name,
        handle: payload.handle,
        accessToken: payload.accessToken,
        ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
        ...(payload.tokenExpiresAt ? { tokenExpiresAt: payload.tokenExpiresAt } : {}),
        isActive: true,
        connectedAt: new Date().toISOString(),
      })
      .where(eq(connectedPages.id, existing.id))
      .returning();
    return sanitizePage(updated[0]);
  }

  const ws = (await db.select().from(workspaces).limit(1))[0];
  if (!ws) throw new Error('Workspace chưa được khởi tạo');

  const inserted = await db
    .insert(connectedPages)
    .values({
      id: `page_${payload.platform}_${Date.now().toString().slice(-6)}`,
      workspaceId: ws.id,
      platform: payload.platform,
      name: payload.name,
      handle: payload.handle,
      externalId: payload.externalId,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? null,
      tokenExpiresAt: payload.tokenExpiresAt ?? null,
      isActive: true,
      unreadCount: 0,
      conversationCount: 0,
      connectedAt: new Date().toISOString(),
    })
    .returning();
  return sanitizePage(inserted[0]);
}

export async function syncHistoricalConversationsForPage(
  pageId: string,
  threads: {
    customerExternalId: string;
    customerName: string;
    channelType: 'inbox' | 'comment';
    messages: {
      externalMessageId: string;
      senderType: 'customer' | 'staff';
      senderName: string;
      content: string;
      imageUrl?: string;
      createdAt: string;
    }[];
  }[]
): Promise<{
  syncedConversations: number;
  importedMessages: number;
  page: ConnectedPage;
  conversations: Conversation[];
  customers: Customer[];
  messages: Message[];
}> {
  return await db.transaction(async (tx) => {
    const pageRows = await tx
      .select()
      .from(connectedPages)
      .where(eq(connectedPages.id, pageId))
      .limit(1);
    if (pageRows.length === 0) {
      throw new Error('Không tìm thấy trang');
    }
    let pageRow = pageRows[0];

    const allCustomers = await tx.select().from(customers);
    const allConvs = await tx.select().from(conversations);
    const existingMsgs = await tx.select().from(messages);
    const existingExtMsgIds = new Set(
      existingMsgs.map((m) => m.externalMessageId).filter(Boolean)
    );

    const touchedConvs: Conversation[] = [];
    const touchedCusts: Customer[] = [];
    const insertedMsgs: Message[] = [];
    let newConvCount = 0;

    for (const thread of threads) {
      let custRow = allCustomers.find(
        (c) =>
          c.platform === pageRow.platform &&
          c.externalId === thread.customerExternalId
      );
      if (!custRow) {
        const createdCust = (
          await tx
            .insert(customers)
            .values({
              id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              workspaceId: pageRow.workspaceId,
              fullName: thread.customerName,
              phone: '',
              address: '',
              platform: pageRow.platform,
              externalId: thread.customerExternalId,
              avatarUrl: '',
              totalOrders: 0,
              deliveredOrders: 0,
              returnedOrders: 0,
              note: '',
              previousAssigneeId: null,
            })
            .returning()
        )[0];
        custRow = createdCust;
        allCustomers.push(createdCust);
      }
      touchedCusts.push(sanitizeCustomer(custRow));

      let convRow = allConvs.find(
        (c) =>
          c.pageId === pageRow.id &&
          c.customerId === custRow!.id &&
          c.channelType === thread.channelType
      );
      if (!convRow) {
        const createdConv = (
          await tx
            .insert(conversations)
            .values({
              id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              workspaceId: pageRow.workspaceId,
              pageId: pageRow.id,
              customerId: custRow.id,
              platform: pageRow.platform,
              channelType: thread.channelType,
              postTitle: null,
              botPaused: false,
              unreadCount: 0,
              isReplied: false,
              hasPhone: false,
              assigneeId: null,
              tagIds: [],
              lastMessageText: '',
              lastMessageAt: new Date().toISOString(),
            })
            .returning()
        )[0];
        convRow = createdConv;
        allConvs.push(createdConv);
        newConvCount += 1;
      }

      let latestText = convRow.lastMessageText;
      let latestAt = convRow.lastMessageAt;
      let hasPhone = convRow.hasPhone;

      for (const m of thread.messages) {
        if (existingExtMsgIds.has(m.externalMessageId)) continue;
        existingExtMsgIds.add(m.externalMessageId);

        const inserted = (
          await tx
            .insert(messages)
            .values({
              id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              conversationId: convRow.id,
              senderType: m.senderType,
              senderId: m.senderType === 'staff' ? 'sync_staff' : custRow.id,
              senderName: m.senderName,
              messageType: m.imageUrl ? 'image' : 'text',
              content: m.content,
              imageUrl: m.imageUrl ?? null,
              externalMessageId: m.externalMessageId,
              isHidden: false,
              isLiked: false,
              convertedToInbox: false,
              createdAt: m.createdAt,
            })
            .returning()
        )[0];
        insertedMsgs.push(sanitizeMessage(inserted));
        if (m.createdAt >= latestAt || !latestText) {
          latestText = m.content;
          latestAt = m.createdAt;
        }
        if (containsPhoneNumber(m.content)) {
          hasPhone = true;
        }
      }

      const updatedConv = (
        await tx
          .update(conversations)
          .set({
            lastMessageText: latestText,
            lastMessageAt: latestAt,
            hasPhone,
          })
          .where(eq(conversations.id, convRow.id))
          .returning()
      )[0];
      touchedConvs.push(sanitizeConversation(updatedConv));
    }

    if (newConvCount > 0) {
      pageRow = (
        await tx
          .update(connectedPages)
          .set({ conversationCount: pageRow.conversationCount + newConvCount })
          .where(eq(connectedPages.id, pageRow.id))
          .returning()
      )[0];
    }

    return {
      syncedConversations: touchedConvs.length,
      importedMessages: insertedMsgs.length,
      page: sanitizePage(pageRow),
      conversations: touchedConvs,
      customers: touchedCusts,
      messages: insertedMsgs,
    };
  });
}

export async function togglePageActive(
  pageId: string,
  isActive: boolean
): Promise<ConnectedPage | null> {
  try {
    const updated = await db
      .update(connectedPages)
      .set({
        isActive,
        connectedAt: isActive ? new Date().toISOString() : null,
      })
      .where(eq(connectedPages.id, pageId))
      .returning();
    return updated[0] ? sanitizePage(updated[0]) : null;
  } catch (error) {
    console.error('togglePageActive failed:', error);
    throw new Error('Không thể cập nhật trạng thái trang.', { cause: error });
  }
}

export async function updateConversation(
  convId: string,
  patch: {
    assigneeId?: string | null;
    tagIds?: string[];
    unreadCount?: number;
    botPaused?: boolean;
  }
): Promise<Conversation | null> {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);
      if (existing.length === 0) return null;

      const conv = existing[0];
      const updateSet: Partial<typeof conversations.$inferInsert> = {};
      if (patch.assigneeId !== undefined) {
        updateSet.assigneeId = patch.assigneeId;
        if (patch.assigneeId) {
          await tx
            .update(customers)
            .set({ previousAssigneeId: patch.assigneeId })
            .where(eq(customers.id, conv.customerId));
        }
      }
      if (patch.tagIds !== undefined) updateSet.tagIds = patch.tagIds;
      if (patch.unreadCount !== undefined) updateSet.unreadCount = patch.unreadCount;
      if (patch.botPaused !== undefined) updateSet.botPaused = Boolean(patch.botPaused);

      if (Object.keys(updateSet).length === 0) {
        return sanitizeConversation(conv);
      }

      const updated = await tx
        .update(conversations)
        .set(updateSet)
        .where(eq(conversations.id, convId))
        .returning();
      return sanitizeConversation(updated[0]);
    });
  } catch (error) {
    console.error('updateConversation failed:', error);
    throw new Error('Không thể cập nhật hội thoại.', { cause: error });
  }
}

export async function addStaffMessage(payload: {
  conversationId: string;
  staffId: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  imageUrl?: string;
  fileName?: string;
  convertCommentToInbox?: boolean;
  commentId?: string;
  replyAsPublicComment?: boolean;
  isBotReply?: boolean;
}): Promise<{
  message: Message;
  conversation: Conversation;
  page?: ConnectedPage & { accessToken: string | null; refreshToken: string | null };
  customer?: Customer;
  targetCommentExternalId?: string;
} | null> {
  try {
    return await db.transaction(async (tx) => {
      const convRows = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, payload.conversationId))
        .limit(1);
      if (convRows.length === 0) return null;
      const conv = convRows[0];

      const staffRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, payload.staffId))
        .limit(1);
      const fallbackStaff =
        staffRows[0] ?? (await tx.select().from(users).limit(1))[0];

      const autoRow = (await tx.select().from(automationSettings).limit(1))[0];
      const createdAt = new Date().toISOString();
      const msgType = payload.replyAsPublicComment
        ? 'comment'
        : payload.messageType ?? 'text';

      const insertedMsg = await tx
        .insert(messages)
        .values({
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          conversationId: conv.id,
          senderType: 'staff',
          senderId: payload.isBotReply ? 'bot_local' : fallbackStaff.id,
          senderName: payload.isBotReply ? 'Bot Local' : fallbackStaff.name,
          messageType: msgType,
          content: payload.content,
          imageUrl: payload.imageUrl ?? null,
          fileName: payload.fileName ?? null,
          isHidden: false,
          isLiked: false,
          convertedToInbox: false,
          createdAt,
        })
        .returning();

      let targetCommentExternalId: string | undefined;
      if (payload.commentId) {
        const cmtRows = await tx
          .select()
          .from(messages)
          .where(eq(messages.id, payload.commentId))
          .limit(1);
        targetCommentExternalId = cmtRows[0]?.externalCommentId ?? undefined;
        if (payload.convertCommentToInbox) {
          await tx
            .update(messages)
            .set({ convertedToInbox: true })
            .where(eq(messages.id, payload.commentId));
        }
      } else if (conv.channelType === 'comment') {
        // Pick latest customer comment with externalCommentId for public replies
        const threadMsgs = await tx
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt));
        const latestCustComment = threadMsgs.find(
          (m) => m.senderType === 'customer' && m.externalCommentId
        );
        targetCommentExternalId = latestCustComment?.externalCommentId ?? undefined;
      }

      const shouldPauseBot =
        !payload.isBotReply && Boolean(autoRow?.autoPauseBotOnStaffReply);

      const summaryText =
        payload.messageType === 'file'
          ? `[Tệp đính kèm: ${payload.fileName || 'Tài liệu'}]`
          : payload.messageType === 'image'
            ? '[Đã gửi hình ảnh]'
            : payload.content;

      const updatedConv = await tx
        .update(conversations)
        .set({
          ...(payload.convertCommentToInbox ? { channelType: 'inbox' } : {}),
          ...(shouldPauseBot ? { botPaused: true } : {}),
          lastMessageText: summaryText,
          lastMessageAt: createdAt,
          unreadCount: 0,
          isReplied: true,
          assigneeId: conv.assigneeId ?? fallbackStaff.id,
        })
        .where(eq(conversations.id, conv.id))
        .returning();

      const pageRow = (
        await tx
          .select()
          .from(connectedPages)
          .where(eq(connectedPages.id, conv.pageId))
          .limit(1)
      )[0];

      const custRow = (
        await tx
          .select()
          .from(customers)
          .where(eq(customers.id, conv.customerId))
          .limit(1)
      )[0];

      return {
        message: sanitizeMessage(insertedMsg[0]),
        conversation: sanitizeConversation(updatedConv[0]),
        page: pageRow
          ? {
              ...sanitizePage(pageRow),
              accessToken: pageRow.accessToken,
              refreshToken: pageRow.refreshToken,
            }
          : undefined,
        customer: custRow ? sanitizeCustomer(custRow) : undefined,
        targetCommentExternalId,
      };
    });
  } catch (error) {
    console.error('addStaffMessage failed:', error);
    throw new Error('Không thể gửi tin nhắn.', { cause: error });
  }
}

export async function toggleCommentAction(
  messageId: string,
  action: 'like' | 'toggle_hide'
): Promise<{
  message: Message;
  page?: ConnectedPage & { accessToken: string | null };
} | null> {
  try {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (rows.length === 0) return null;
    const msg = rows[0];

    const updated = await db
      .update(messages)
      .set(
        action === 'like' ? { isLiked: !msg.isLiked } : { isHidden: !msg.isHidden }
      )
      .where(eq(messages.id, messageId))
      .returning();

    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, msg.conversationId))
      .limit(1);
    const pageRows = convRows[0]
      ? await db
          .select()
          .from(connectedPages)
          .where(eq(connectedPages.id, convRows[0].pageId))
          .limit(1)
      : [];

    return {
      message: sanitizeMessage(updated[0]),
      page: pageRows[0]
        ? { ...sanitizePage(pageRows[0]), accessToken: pageRows[0].accessToken }
        : undefined,
    };
  } catch (error) {
    console.error('toggleCommentAction failed:', error);
    throw new Error('Không thể cập nhật trạng thái bình luận.', { cause: error });
  }
}

export async function updateCustomer(
  customerId: string,
  patch: {
    phone?: string;
    address?: string;
    note?: string;
    fullName?: string;
    avatarUrl?: string;
  }
): Promise<Customer | null> {
  try {
    const updateSet: Partial<typeof customers.$inferInsert> = {};
    if (patch.phone !== undefined) updateSet.phone = patch.phone.trim();
    if (patch.address !== undefined) updateSet.address = patch.address.trim();
    if (patch.note !== undefined) updateSet.note = patch.note.trim();
    if (patch.avatarUrl !== undefined) updateSet.avatarUrl = patch.avatarUrl.trim();
    if (patch.fullName !== undefined && patch.fullName.trim()) {
      updateSet.fullName = patch.fullName.trim();
    }

    if (Object.keys(updateSet).length === 0) {
      const existing = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      return existing[0] ? sanitizeCustomer(existing[0]) : null;
    }

    const updated = await db
      .update(customers)
      .set(updateSet)
      .where(eq(customers.id, customerId))
      .returning();
    return updated[0] ? sanitizeCustomer(updated[0]) : null;
  } catch (error) {
    console.error('updateCustomer failed:', error);
    throw new Error('Không thể cập nhật hồ sơ khách hàng.', { cause: error });
  }
}

export async function getProducts(): Promise<Product[]> {
  try {
    const [allProds, allVariants] = await Promise.all([
      db.select().from(products),
      db.select().from(productVariants),
    ]);
    return allProds.map((p) => ({
      ...p,
      variants: allVariants.filter((v) => v.productId === p.id),
    }));
  } catch (error) {
    console.error('getProducts failed:', error);
    throw new Error('Không thể tải danh mục sản phẩm.', { cause: error });
  }
}

export async function addProduct(payload: {
  name: string;
  category: string;
  sku?: string;
  color?: string;
  size?: string;
  price?: number;
  stock?: number;
  variants?: {
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
  }[];
}): Promise<Product> {
  try {
    return await db.transaction(async (tx) => {
      const ws = (await tx.select().from(workspaces).limit(1))[0];
      if (!ws) throw new Error('Workspace chưa được khởi tạo');

      const prodId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const insertedProd = await tx
        .insert(products)
        .values({
          id: prodId,
          workspaceId: ws.id,
          name: payload.name.trim(),
          category: payload.category.trim() || 'Sản phẩm mới',
          imageUrl: '/src/assets/images/product_vitamin_serum_1794901776333.jpg',
        })
        .returning();

      const inputVariants =
        payload.variants && payload.variants.length > 0
          ? payload.variants
          : [
              {
                sku: payload.sku || '',
                color: payload.color || 'Mặc định',
                size: payload.size || 'Tiêu chuẩn',
                price: Number(payload.price) || 0,
                stock: Number(payload.stock) || 0,
              },
            ];

      const variantRowsToInsert = inputVariants.map((v, idx) => ({
        id: `var_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        productId: prodId,
        sku: v.sku?.trim() || `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`,
        color: v.color?.trim() || 'Mặc định',
        size: v.size?.trim() || 'Tiêu chuẩn',
        price: Math.max(0, Number(v.price) || 0),
        stock: Math.max(0, Number(v.stock) || 0),
      }));

      const insertedVars = await tx
        .insert(productVariants)
        .values(variantRowsToInsert)
        .returning();

      return {
        ...insertedProd[0],
        variants: insertedVars,
      };
    });
  } catch (error) {
    console.error('addProduct failed:', error);
    throw new Error('Không thể thêm sản phẩm mới.', { cause: error });
  }
}

export async function addProductVariant(
  productId: string,
  variant: {
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
  }
): Promise<Product | null> {
  try {
    return await db.transaction(async (tx) => {
      const prodRows = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (prodRows.length === 0) return null;

      await tx.insert(productVariants).values({
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        productId,
        sku: variant.sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
        color: variant.color.trim() || 'Mặc định',
        size: variant.size.trim() || 'Tiêu chuẩn',
        price: Math.max(0, Number(variant.price) || 0),
        stock: Math.max(0, Number(variant.stock) || 0),
      });

      const allVars = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));
      return {
        ...prodRows[0],
        variants: allVars,
      };
    });
  } catch (error) {
    console.error('addProductVariant failed:', error);
    throw new Error('Không thể thêm biến thể sản phẩm.', { cause: error });
  }
}

export async function importProductsBulk(
  groupedProducts: {
    name: string;
    category: string;
    variants: {
      sku: string;
      color: string;
      size: string;
      price: number;
      stock: number;
    }[];
  }[]
): Promise<Product[]> {
  return await db.transaction(async (tx) => {
    const ws = (await tx.select().from(workspaces).limit(1))[0];
    if (!ws) throw new Error('Workspace chưa được khởi tạo');

    const existingProds = await tx.select().from(products);
    const touchedIds = new Set<string>();

    for (let pIdx = 0; pIdx < groupedProducts.length; pIdx++) {
      const item = groupedProducts[pIdx];
      let prod = existingProds.find(
        (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );
      if (!prod) {
        prod = (
          await tx
            .insert(products)
            .values({
              id: `prod_${Date.now()}_${pIdx}_${Math.random().toString(36).slice(2, 5)}`,
              workspaceId: ws.id,
              name: item.name.trim(),
              category: item.category.trim() || 'Sản phẩm mới',
              imageUrl: '/src/assets/images/product_vitamin_serum_1794901776333.jpg',
            })
            .returning()
        )[0];
        existingProds.push(prod);
      }

      touchedIds.add(prod.id);
      if (item.variants.length > 0) {
        await tx.insert(productVariants).values(
          item.variants.map((v, vIdx) => ({
            id: `var_${Date.now()}_${pIdx}_${vIdx}_${Math.random()
              .toString(36)
              .slice(2, 5)}`,
            productId: prod!.id,
            sku:
              v.sku.trim() ||
              `SKU-${Date.now().toString().slice(-4)}-${pIdx}-${vIdx}`,
            color: v.color.trim() || 'Mặc định',
            size: v.size.trim() || 'Tiêu chuẩn',
            price: Math.max(0, Number(v.price) || 0),
            stock: Math.max(0, Number(v.stock) || 0),
          }))
        );
      }
    }

    const [allProds, allVars] = await Promise.all([
      tx.select().from(products),
      tx.select().from(productVariants),
    ]);

    return allProds
      .filter((p) => touchedIds.has(p.id))
      .map((p) => ({
        ...p,
        variants: allVars.filter((v) => v.productId === p.id),
      }));
  });
}

export async function updateVariantStock(
  productId: string,
  variantId: string,
  stock: number
): Promise<Product | null> {
  try {
    return await db.transaction(async (tx) => {
      const prodRows = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (prodRows.length === 0) return null;

      const updatedVar = await tx
        .update(productVariants)
        .set({ stock: Math.max(0, stock) })
        .where(eq(productVariants.id, variantId))
        .returning();
      if (updatedVar.length === 0) return null;

      const variants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));

      return {
        ...prodRows[0],
        variants,
      };
    });
  } catch (error) {
    console.error('updateVariantStock failed:', error);
    throw new Error('Không thể cập nhật tồn kho.', { cause: error });
  }
}

export async function getOrders(): Promise<Order[]> {
  try {
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  } catch (error) {
    console.error('getOrders failed:', error);
    throw new Error('Không thể tải danh sách đơn hàng.', { cause: error });
  }
}

export async function createOrder(payload: {
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  items: { productId: string; variantId: string; quantity: number }[];
  shippingFee: number;
  discount: number;
  carrier: ShippingCarrier;
  note: string;
  staffId: string;
  trackingCode?: string;
  carrierSynced?: boolean;
}): Promise<{
  order: Order;
  updatedProducts: Product[];
  customer: Customer;
  conversation: Conversation;
  systemMessage: Message;
}> {
  if (!payload.customerPhone.trim() || !payload.shippingAddress.trim()) {
    throw new Error('Vui lòng nhập đầy đủ số điện thoại và địa chỉ giao hàng');
  }
  if (!payload.items || payload.items.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 sản phẩm để tạo đơn');
  }

  try {
    return await db.transaction(async (tx) => {
      const convRows = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, payload.conversationId))
        .limit(1);
      const custRows = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, payload.customerId))
        .limit(1);

      if (convRows.length === 0 || custRows.length === 0) {
        throw new Error('Không tìm thấy hội thoại hoặc khách hàng');
      }
      const conv = convRows[0];
      const cust = custRows[0];

      const resolvedItems: OrderItem[] = [];
      const touchedProductIds = new Set<string>();

      for (const reqItem of payload.items) {
        if (reqItem.quantity <= 0) {
          throw new Error('Số lượng phải lớn hơn 0');
        }
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, reqItem.productId))
          .limit(1);
        const varRows = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, reqItem.variantId))
          .limit(1);

        if (prodRows.length === 0 || varRows.length === 0) {
          throw new Error('Sản phẩm hoặc biến thể không tồn tại');
        }
        const prod = prodRows[0];
        const variant = varRows[0];
        if (variant.stock < reqItem.quantity) {
          throw new Error(
            `Sản phẩm ${prod.name} (${variant.color} - ${variant.size}) chỉ còn ${variant.stock} sản phẩm trong kho`
          );
        }

        await tx
          .update(productVariants)
          .set({ stock: variant.stock - reqItem.quantity })
          .where(eq(productVariants.id, variant.id));

        touchedProductIds.add(prod.id);
        resolvedItems.push({
          productId: prod.id,
          productName: prod.name,
          variantId: variant.id,
          variantLabel: `${variant.color} · ${variant.size}`,
          sku: variant.sku,
          price: variant.price,
          quantity: reqItem.quantity,
        });
      }

      const { subtotal, codTotal } = calculateOrderTotals(
        resolvedItems,
        payload.shippingFee,
        payload.discount
      );

      const carrierPrefix =
        payload.carrier === 'GHN'
          ? 'GHN'
          : payload.carrier === 'GHTK'
            ? 'GHTK'
            : payload.carrier === 'Viettel Post'
              ? 'VTP'
              : 'JT';
      const trackingCode =
        payload.trackingCode?.trim() ||
        `${carrierPrefix}${Math.floor(100000 + Math.random() * 899999)}`;
      const existingOrdersCount = (await tx.select().from(orders)).length;
      const orderCode = `DAU-${2602 + existingOrdersCount}`;
      const createdAt = new Date().toISOString();

      const insertedOrder = await tx
        .insert(orders)
        .values({
          id: `ord_${Date.now()}`,
          code: orderCode,
          workspaceId: conv.workspaceId,
          pageId: conv.pageId,
          conversationId: conv.id,
          customerId: cust.id,
          customerName: payload.customerName.trim() || cust.fullName,
          customerPhone: payload.customerPhone.trim(),
          shippingAddress: payload.shippingAddress.trim(),
          items: resolvedItems,
          subtotal,
          shippingFee: Math.max(0, payload.shippingFee),
          discount: Math.max(0, payload.discount),
          codTotal,
          carrier: payload.carrier,
          trackingCode,
          carrierSynced: Boolean(payload.carrierSynced),
          status: 'pending',
          note: payload.note.trim(),
          createdByStaffId: payload.staffId,
          createdAt,
        })
        .returning();
      const order = insertedOrder[0];

      const updatedCust = await tx
        .update(customers)
        .set({
          phone: order.customerPhone,
          address: order.shippingAddress,
          totalOrders: cust.totalOrders + 1,
        })
        .where(eq(customers.id, cust.id))
        .returning();

      const closedTag = (
        await tx.select().from(tags).where(eq(tags.name, 'Đã chốt')).limit(1)
      )[0];
      const nextTags = [...(conv.tagIds ?? [])];
      if (closedTag && !nextTags.includes(closedTag.id)) {
        nextTags.push(closedTag.id);
      }

      const sysContent = `Đã tạo đơn hàng ${order.code} · Thu hộ COD ${new Intl.NumberFormat('vi-VN').format(order.codTotal)}đ · Vận đơn ${order.carrier} (${order.trackingCode})`;
      const insertedSysMsg = await tx
        .insert(messages)
        .values({
          id: `m_sys_${Date.now()}`,
          conversationId: conv.id,
          senderType: 'system',
          senderId: 'system',
          senderName: 'Hệ thống dauto',
          messageType: 'text',
          content: sysContent,
          createdAt,
        })
        .returning();

      const updatedConv = await tx
        .update(conversations)
        .set({
          tagIds: nextTags,
          lastMessageText: sysContent,
          lastMessageAt: createdAt,
          isReplied: true,
          unreadCount: 0,
        })
        .where(eq(conversations.id, conv.id))
        .returning();

      const updatedProducts: Product[] = [];
      for (const pid of touchedProductIds) {
        const pRow = (
          await tx.select().from(products).where(eq(products.id, pid)).limit(1)
        )[0];
        const pVars = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, pid));
        if (pRow) {
          updatedProducts.push({ ...pRow, variants: pVars });
        }
      }

      return {
        order,
        updatedProducts,
        customer: sanitizeCustomer(updatedCust[0]),
        conversation: sanitizeConversation(updatedConv[0]),
        systemMessage: sanitizeMessage(insertedSysMsg[0]),
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Vui lòng')) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('chỉ còn')) {
      throw error;
    }
    console.error('createOrder failed:', error);
    throw new Error('Không thể tạo đơn hàng.', { cause: error });
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<{
  order: Order;
  customer: Customer | null;
  updatedProducts: Product[];
} | null> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (rows.length === 0) return null;

      const prevOrder = rows[0];
      const updatedOrder = (
        await tx
          .update(orders)
          .set({ status: newStatus })
          .where(eq(orders.id, orderId))
          .returning()
      )[0];

      // Auto-restore inventory when order moves to returned (or deduct back if un-returned)
      const stockDelta = computeStockDeltaOnStatusChange(prevOrder.status, newStatus);
      const updatedProducts: Product[] = [];
      if (stockDelta !== 0) {
        const touchedProdIds = new Set<string>();
        for (const item of prevOrder.items) {
          const varRows = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, item.variantId))
            .limit(1);
          if (varRows.length > 0) {
            const nextStock = Math.max(0, varRows[0].stock + stockDelta * item.quantity);
            await tx
              .update(productVariants)
              .set({ stock: nextStock })
              .where(eq(productVariants.id, item.variantId));
            touchedProdIds.add(item.productId);
          }
        }
        for (const pid of touchedProdIds) {
          const pRow = (
            await tx.select().from(products).where(eq(products.id, pid)).limit(1)
          )[0];
          const pVars = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.productId, pid));
          if (pRow) {
            updatedProducts.push({ ...pRow, variants: pVars });
          }
        }
      }

      let updatedCustomer: Customer | null = null;
      const custRows = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, prevOrder.customerId))
        .limit(1);

      if (custRows.length > 0 && prevOrder.status !== newStatus) {
        const cust = custRows[0];
        let delivered = cust.deliveredOrders;
        let returned = cust.returnedOrders;
        if (prevOrder.status === 'delivered') delivered = Math.max(0, delivered - 1);
        if (prevOrder.status === 'returned') returned = Math.max(0, returned - 1);
        if (newStatus === 'delivered') delivered += 1;
        if (newStatus === 'returned') returned += 1;

        const savedCust = await tx
          .update(customers)
          .set({ deliveredOrders: delivered, returnedOrders: returned })
          .where(eq(customers.id, cust.id))
          .returning();
        updatedCustomer = sanitizeCustomer(savedCust[0]);
      } else if (custRows.length > 0) {
        updatedCustomer = sanitizeCustomer(custRows[0]);
      }

      return { order: updatedOrder, customer: updatedCustomer, updatedProducts };
    });
  } catch (error) {
    console.error('updateOrderStatus failed:', error);
    throw new Error('Không thể cập nhật trạng thái đơn hàng.', { cause: error });
  }
}

export async function updateOrderStatusByTrackingCode(
  trackingCode: string,
  newStatus: OrderStatus
) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.trackingCode, trackingCode))
    .limit(1);
  if (rows.length === 0) return null;
  return updateOrderStatus(rows[0].id, newStatus);
}

export async function getWebhookVerifyToken(): Promise<string> {
  try {
    const rows = await db.select().from(automationSettings).limit(1);
    return (
      rows[0]?.webhookVerifyToken ||
      process.env.WEBHOOK_VERIFY_TOKEN ||
      'dauto_verify_2026'
    );
  } catch (error) {
    console.error('getWebhookVerifyToken failed:', error);
    return process.env.WEBHOOK_VERIFY_TOKEN || 'dauto_verify_2026';
  }
}

export async function getBotConfig(): Promise<{
  botApiKey: string;
  outboundWebhookUrl: string;
  autoPauseBotOnStaffReply: boolean;
}> {
  try {
    const rows = await db.select().from(automationSettings).limit(1);
    return {
      botApiKey: rows[0]?.botApiKey || process.env.BOT_API_KEY || '',
      outboundWebhookUrl:
        rows[0]?.outboundWebhookUrl || process.env.OUTBOUND_BOT_WEBHOOK_URL || '',
      autoPauseBotOnStaffReply: rows[0]?.autoPauseBotOnStaffReply ?? true,
    };
  } catch {
    return {
      botApiKey: process.env.BOT_API_KEY || '',
      outboundWebhookUrl: process.env.OUTBOUND_BOT_WEBHOOK_URL || '',
      autoPauseBotOnStaffReply: true,
    };
  }
}

export async function updateAutomation(
  patch: Partial<AutomationSettings>
): Promise<AutomationSettings> {
  try {
    const existing = await db.select().from(automationSettings).limit(1);
    if (existing.length === 0) {
      throw new Error('Cấu hình tự động hóa chưa được khởi tạo');
    }
    const row = existing[0];
    const updated = await db
      .update(automationSettings)
      .set({
        ...(patch.autoHidePhoneComments !== undefined
          ? { autoHidePhoneComments: patch.autoHidePhoneComments }
          : {}),
        ...(patch.autoReplyComments !== undefined
          ? { autoReplyComments: patch.autoReplyComments }
          : {}),
        ...(patch.keywordRules !== undefined
          ? { keywordRules: patch.keywordRules }
          : {}),
        ...(patch.roundRobinEnabled !== undefined
          ? { roundRobinEnabled: patch.roundRobinEnabled }
          : {}),
        ...(patch.roundRobinMode !== undefined
          ? { roundRobinMode: patch.roundRobinMode }
          : {}),
        ...(patch.lastAssignedIndex !== undefined
          ? { lastAssignedIndex: patch.lastAssignedIndex }
          : {}),
        ...(patch.webhookVerifyToken !== undefined
          ? { webhookVerifyToken: patch.webhookVerifyToken }
          : {}),
        ...(patch.botApiKey !== undefined
          ? { botApiKey: patch.botApiKey.trim() }
          : {}),
        ...(patch.outboundWebhookUrl !== undefined
          ? { outboundWebhookUrl: patch.outboundWebhookUrl.trim() }
          : {}),
        ...(patch.autoPauseBotOnStaffReply !== undefined
          ? { autoPauseBotOnStaffReply: patch.autoPauseBotOnStaffReply }
          : {}),
      })
      .where(eq(automationSettings.id, row.id))
      .returning();

    const r = updated[0];
    return {
      autoHidePhoneComments: r.autoHidePhoneComments,
      autoReplyComments: r.autoReplyComments,
      keywordRules: r.keywordRules ?? [],
      roundRobinEnabled: r.roundRobinEnabled,
      roundRobinMode: r.roundRobinMode,
      lastAssignedIndex: r.lastAssignedIndex,
      webhookVerifyToken: r.webhookVerifyToken,
      botApiKey: r.botApiKey,
      outboundWebhookUrl: r.outboundWebhookUrl,
      autoPauseBotOnStaffReply: r.autoPauseBotOnStaffReply,
    };
  } catch (error) {
    console.error('updateAutomation failed:', error);
    throw new Error('Không thể lưu cấu hình tự động hóa.', { cause: error });
  }
}

export async function addTag(name: string, color: string): Promise<Tag> {
  try {
    const ws = (await db.select().from(workspaces).limit(1))[0];
    if (!ws) throw new Error('Workspace chưa được khởi tạo');
    const inserted = await db
      .insert(tags)
      .values({
        id: `t_${Date.now()}`,
        workspaceId: ws.id,
        name: name.trim(),
        color,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('addTag failed:', error);
    throw new Error('Không thể tạo thẻ màu mới.', { cause: error });
  }
}

export async function deleteTag(tagId: string): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const deleted = await tx.delete(tags).where(eq(tags.id, tagId)).returning();
      const allConvs = await tx.select().from(conversations);
      for (const conv of allConvs) {
        if (conv.tagIds.includes(tagId)) {
          await tx
            .update(conversations)
            .set({ tagIds: conv.tagIds.filter((id) => id !== tagId) })
            .where(eq(conversations.id, conv.id));
        }
      }
      return deleted.length > 0;
    });
  } catch (error) {
    console.error('deleteTag failed:', error);
    throw new Error('Không thể xóa thẻ màu.', { cause: error });
  }
}

export async function addQuickReply(payload: {
  shortcut: string;
  title: string;
  content: string;
  category: string;
}): Promise<QuickReply> {
  try {
    const ws = (await db.select().from(workspaces).limit(1))[0];
    if (!ws) throw new Error('Workspace chưa được khởi tạo');
    const cleanShortcut = payload.shortcut.startsWith('/')
      ? payload.shortcut.trim()
      : `/${payload.shortcut.trim()}`;

    const inserted = await db
      .insert(quickReplies)
      .values({
        id: `qr_${Date.now()}`,
        workspaceId: ws.id,
        shortcut: cleanShortcut,
        title: payload.title.trim(),
        content: payload.content.trim(),
        category: payload.category.trim() || 'Chung',
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('addQuickReply failed:', error);
    throw new Error('Không thể thêm mẫu trả lời nhanh.', { cause: error });
  }
}

export async function deleteQuickReply(qrId: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(quickReplies)
      .where(eq(quickReplies.id, qrId))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('deleteQuickReply failed:', error);
    throw new Error('Không thể xóa mẫu trả lời nhanh.', { cause: error });
  }
}

export async function toggleStaffOnline(
  userId: string,
  online: boolean
): Promise<User | null> {
  try {
    const updated = await db
      .update(users)
      .set({ online })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ? sanitizeUser(updated[0]) : null;
  } catch (error) {
    console.error('toggleStaffOnline failed:', error);
    throw new Error('Không thể cập nhật trạng thái trực ca.', { cause: error });
  }
}

export async function getUserByUid(uid: string): Promise<User | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ? sanitizeUser(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function inviteOrAddStaff(payload: {
  name: string;
  email: string;
  role: UserRole;
  allowedPageIds?: string[];
}): Promise<User> {
  const ws = (await db.select().from(workspaces).limit(1))[0];
  if (!ws) throw new Error('Workspace chưa được khởi tạo');
  const cleanEmail = payload.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Email nhân viên không hợp lệ');
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanEmail))
    .limit(1);
  if (existing.length > 0) {
    throw new Error('Email nhân viên này đã tồn tại trong Workspace');
  }

  const inserted = await db
    .insert(users)
    .values({
      id: `u_${Date.now()}`,
      uid: `invite_${cleanEmail}`,
      workspaceId: ws.id,
      name: payload.name.trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      role: payload.role === 'owner' ? 'admin' : payload.role,
      avatarUrl: '',
      online: true,
      avgResponseSeconds: 40,
      allowedPageIds: payload.allowedPageIds ?? [],
    })
    .returning();
  return sanitizeUser(inserted[0]);
}

export async function updateStaffAccess(
  userId: string,
  patch: { role?: UserRole; allowedPageIds?: string[] }
): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length === 0) return null;
  const target = rows[0];
  if (target.role === 'owner' && patch.role && patch.role !== 'owner') {
    throw new Error('Không thể hạ quyền tài khoản Chủ sở hữu (Owner)');
  }

  const updated = await db
    .update(users)
    .set({
      ...(patch.role && target.role !== 'owner' ? { role: patch.role } : {}),
      ...(patch.allowedPageIds !== undefined
        ? { allowedPageIds: patch.allowedPageIds }
        : {}),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated[0] ? sanitizeUser(updated[0]) : null;
}

export async function deleteStaffMember(userId: string): Promise<boolean> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length === 0) return false;
  if (rows[0].role === 'owner') {
    throw new Error('Không thể xóa tài khoản Chủ sở hữu (Owner)');
  }
  const deleted = await db.delete(users).where(eq(users.id, userId)).returning();
  return deleted.length > 0;
}

export async function getBotConversations(opts?: {
  limit?: number;
  unreadOnly?: boolean;
  platform?: PlatformType;
}) {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const [allPages, allCusts, allConvs, allMsgs] = await Promise.all([
    db.select().from(connectedPages),
    db.select().from(customers),
    db.select().from(conversations).orderBy(desc(conversations.lastMessageAt)),
    db.select().from(messages).orderBy(asc(messages.createdAt)),
  ]);

  const filtered = allConvs
    .filter((c) => !opts?.unreadOnly || c.unreadCount > 0)
    .filter((c) => !opts?.platform || c.platform === opts.platform)
    .slice(0, limit);

  return filtered.map((c) => ({
    conversation: sanitizeConversation(c),
    page: sanitizePage(allPages.find((p) => p.id === c.pageId) ?? allPages[0]),
    customer: sanitizeCustomer(allCusts.find((cu) => cu.id === c.customerId) ?? allCusts[0]),
    messages: allMsgs
      .filter((m) => m.conversationId === c.id)
      .slice(-20)
      .map(sanitizeMessage),
  }));
}

export async function getPaginatedConversations(opts: {
  limit: number;
  offset: number;
  allowedPageIds?: string[];
  role?: UserRole;
}) {
  const [allConvs, allCusts] = await Promise.all([
    db.select().from(conversations).orderBy(desc(conversations.lastMessageAt)),
    db.select().from(customers),
  ]);
  const visible = allConvs.filter((c) =>
    userCanAccessPage(
      opts.role ? { role: opts.role, allowedPageIds: opts.allowedPageIds } : undefined,
      c.pageId
    )
  );
  const slice = visible.slice(opts.offset, opts.offset + opts.limit);
  return {
    conversations: slice.map(sanitizeConversation),
    customers: allCusts.map(sanitizeCustomer),
    total: visible.length,
    hasMore: opts.offset + opts.limit < visible.length,
  };
}

export async function getConversationMessagesPage(
  conversationId: string,
  limit = 50,
  offset = 0
) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt));
  const slice = rows.slice(offset, offset + limit).reverse();
  return {
    messages: slice.map(sanitizeMessage),
    total: rows.length,
    hasMore: offset + limit < rows.length,
  };
}

export async function getWidgetConversationHistory(
  pageId: string,
  visitorId: string
): Promise<Message[]> {
  const custRows = await db
    .select()
    .from(customers)
    .where(eq(customers.externalId, visitorId))
    .limit(1);
  if (custRows.length === 0) return [];
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, custRows[0].id));
  const target = convRows.find((c) => c.pageId === pageId);
  if (!target) return [];
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, target.id))
    .orderBy(asc(messages.createdAt));
  return msgs.map(sanitizeMessage);
}

export async function markNotificationsRead(): Promise<SystemNotification[]> {
  try {
    await db.update(systemNotifications).set({ read: true });
    const rows = await db
      .select()
      .from(systemNotifications)
      .orderBy(desc(systemNotifications.createdAt));
    return rows.map(sanitizeNotification);
  } catch (error) {
    console.error('markNotificationsRead failed:', error);
    throw new Error('Không thể cập nhật thông báo.', { cause: error });
  }
}

export async function receiveWebhookEvent(payload: {
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
}): Promise<{
  deduplicated?: boolean;
  page: ConnectedPage;
  pageAccessToken?: string | null;
  conversation: Conversation;
  customer: Customer;
  messages: Message[];
  notification?: SystemNotification;
  autoReplyText?: string;
  botConfig?: {
    botApiKey: string;
    outboundWebhookUrl: string;
  };
}> {
  try {
    return await db.transaction(async (tx) => {
      const existingWs = await tx.select().from(workspaces).limit(1);
      if (existingWs.length === 0) {
        await seedInitialWorkspaceData(tx);
      }

      // Deduplicate by externalMessageId if provided by Meta/Zalo
      if (payload.externalMessageId) {
        const dup = await tx
          .select()
          .from(messages)
          .where(eq(messages.externalMessageId, payload.externalMessageId))
          .limit(1);
        if (dup.length > 0) {
          const dupConv = (
            await tx
              .select()
              .from(conversations)
              .where(eq(conversations.id, dup[0].conversationId))
              .limit(1)
          )[0];
          const dupPage = (
            await tx
              .select()
              .from(connectedPages)
              .where(eq(connectedPages.id, dupConv.pageId))
              .limit(1)
          )[0];
          const dupCust = (
            await tx
              .select()
              .from(customers)
              .where(eq(customers.id, dupConv.customerId))
              .limit(1)
          )[0];
          return {
            deduplicated: true,
            page: sanitizePage(dupPage),
            pageAccessToken: dupPage.accessToken,
            conversation: sanitizeConversation(dupConv),
            customer: sanitizeCustomer(dupCust),
            messages: [],
          };
        }
      }

      const allPages = await tx.select().from(connectedPages);
      let pageRow =
        (payload.pageId && allPages.find((p) => p.id === payload.pageId)) ||
        (payload.externalPageId &&
          allPages.find((p) => p.externalId === payload.externalPageId)) ||
        allPages.find((p) => p.platform === payload.platform && p.isActive) ||
        allPages.find((p) => p.platform === payload.platform) ||
        allPages[0];

      if (!pageRow.isActive) {
        const activated = await tx
          .update(connectedPages)
          .set({ isActive: true, connectedAt: new Date().toISOString() })
          .where(eq(connectedPages.id, pageRow.id))
          .returning();
        pageRow = activated[0];
      }

      const allCustomers = await tx.select().from(customers);
      let custRow =
        (payload.senderExternalId &&
          allCustomers.find(
            (c) =>
              c.externalId === payload.senderExternalId &&
              c.platform === pageRow.platform
          )) ||
        allCustomers.find(
          (c) =>
            c.fullName.toLowerCase() === payload.customerName.trim().toLowerCase() &&
            c.platform === pageRow.platform
        );

      if (!custRow) {
        const insertedCust = await tx
          .insert(customers)
          .values({
            id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            workspaceId: pageRow.workspaceId,
            fullName: payload.customerName.trim() || 'Khách hàng mới',
            phone: '',
            address: '',
            platform: pageRow.platform,
            externalId: payload.senderExternalId ?? null,
            avatarUrl: '',
            totalOrders: 0,
            deliveredOrders: 0,
            returnedOrders: 0,
            note: '',
            previousAssigneeId: null,
          })
          .returning();
        custRow = insertedCust[0];
      } else if (payload.senderExternalId && !custRow.externalId) {
        const updatedCust = await tx
          .update(customers)
          .set({ externalId: payload.senderExternalId })
          .where(eq(customers.id, custRow.id))
          .returning();
        custRow = updatedCust[0];
      }

      const allConvs = await tx.select().from(conversations);
      let convRow = allConvs.find(
        (c) =>
          c.pageId === pageRow.id &&
          c.customerId === custRow!.id &&
          c.channelType === payload.channelType
      );

      const autoRow = (await tx.select().from(automationSettings).limit(1))[0];
      const allUsers = await tx.select().from(users);

      if (!convRow) {
        let assigneeId: string | null = null;
        if (autoRow?.roundRobinEnabled) {
          const salePool = allUsers.filter(
            (u) =>
              (u.role === 'sale' || u.role === 'admin' || u.role === 'owner') &&
              userCanAccessPage(sanitizeUser(u), pageRow.id)
          );
          const assignment = selectNextAssignee(
            salePool,
            autoRow.roundRobinMode,
            custRow.previousAssigneeId,
            autoRow.lastAssignedIndex
          );
          assigneeId = assignment.staffId;
          await tx
            .update(automationSettings)
            .set({ lastAssignedIndex: assignment.nextIndex })
            .where(eq(automationSettings.id, autoRow.id));
        }

        const insertedConv = await tx
          .insert(conversations)
          .values({
            id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            workspaceId: pageRow.workspaceId,
            pageId: pageRow.id,
            customerId: custRow.id,
            platform: pageRow.platform,
            channelType: payload.channelType,
            postTitle:
              payload.channelType === 'comment'
                ? payload.postTitle || 'Bài viết Livestream Khuyến Mãi 2026'
                : null,
            externalPostId: payload.externalPostId ?? null,
            botPaused: false,
            unreadCount: 0,
            isReplied: false,
            hasPhone: false,
            assigneeId,
            tagIds: [],
            lastMessageText: '',
            lastMessageAt: new Date().toISOString(),
          })
          .returning();
        convRow = insertedConv[0];

        const updatedPage = await tx
          .update(connectedPages)
          .set({ conversationCount: pageRow.conversationCount + 1 })
          .where(eq(connectedPages.id, pageRow.id))
          .returning();
        pageRow = updatedPage[0];
      }

      const hasPhoneInText = containsPhoneNumber(payload.content);
      const shouldAutoHide =
        payload.channelType === 'comment' &&
        Boolean(autoRow?.autoHidePhoneComments) &&
        hasPhoneInText;

      const createdAt = new Date().toISOString();
      const incomingMsg = (
        await tx
          .insert(messages)
          .values({
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            conversationId: convRow.id,
            senderType: 'customer',
            senderId: custRow.id,
            senderName: custRow.fullName,
            messageType:
              payload.channelType === 'comment'
                ? 'comment'
                : payload.imageUrl
                  ? 'image'
                  : 'text',
            content: payload.content,
            imageUrl: payload.imageUrl ?? null,
            externalMessageId: payload.externalMessageId ?? null,
            externalCommentId: payload.externalCommentId ?? null,
            isHidden: shouldAutoHide,
            isLiked: false,
            convertedToInbox: false,
            createdAt,
          })
          .returning()
      )[0];

      const emittedMessages: Message[] = [sanitizeMessage(incomingMsg)];

      const threadMessages = await tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convRow.id))
        .orderBy(asc(messages.createdAt));
      const extracted = extractCustomerInfoFromMessages(threadMessages);

      if (extracted.phone || extracted.address) {
        const updatedCust = await tx
          .update(customers)
          .set({
            ...(extracted.phone ? { phone: extracted.phone } : {}),
            ...(extracted.address ? { address: extracted.address } : {}),
          })
          .where(eq(customers.id, custRow.id))
          .returning();
        custRow = updatedCust[0];
      }

      let isReplied = false;
      let autoReplyText: string | undefined;
      if (payload.channelType === 'comment' && autoRow?.autoReplyComments) {
        const lower = payload.content.toLowerCase();
        const matchedRule = (autoRow.keywordRules ?? []).find(
          (r) => r.enabled && r.keywords.some((kw) => lower.includes(kw.toLowerCase()))
        );
        if (matchedRule) {
          autoReplyText = interpolateQuickReply(matchedRule.commentReply, {
            full_name: custRow.fullName,
            page_name: pageRow.name,
            phone: custRow.phone,
            staff_name: 'Trợ lý tự động',
          });
          const autoMsg = (
            await tx
              .insert(messages)
              .values({
                id: `m_auto_${Date.now()}`,
                conversationId: convRow.id,
                senderType: 'staff',
                senderId: 'auto_bot',
                senderName: 'Tự động trả lời',
                messageType: 'comment',
                content: autoReplyText,
                createdAt: new Date(Date.now() + 300).toISOString(),
              })
              .returning()
          )[0];
          emittedMessages.push(sanitizeMessage(autoMsg));
          isReplied = true;
        }
      }

      const updatedConv = (
        await tx
          .update(conversations)
          .set({
            lastMessageText: payload.content,
            lastMessageAt: createdAt,
            unreadCount: convRow.unreadCount + 1,
            isReplied,
            hasPhone: convRow.hasPhone || Boolean(extracted.phone),
            ...(payload.externalPostId && !convRow.externalPostId
              ? { externalPostId: payload.externalPostId }
              : {}),
          })
          .where(eq(conversations.id, convRow.id))
          .returning()
      )[0];

      const updatedPage = (
        await tx
          .update(connectedPages)
          .set({ unreadCount: pageRow.unreadCount + 1 })
          .where(eq(connectedPages.id, pageRow.id))
          .returning()
      )[0];

      let notification: SystemNotification | undefined;
      if (shouldAutoHide) {
        const insertedNotif = (
          await tx
            .insert(systemNotifications)
            .values({
              id: `notif_${Date.now()}`,
              workspaceId: pageRow.workspaceId,
              title: 'Đã tự động ẩn bình luận chứa SĐT',
              body: `Bình luận của ${custRow.fullName} trên ${pageRow.name} đã được ẩn tự động để bảo mật SĐT.`,
              conversationId: updatedConv.id,
              read: false,
              createdAt,
            })
            .returning()
        )[0];
        notification = sanitizeNotification(insertedNotif);
      }

      return {
        page: sanitizePage(updatedPage),
        pageAccessToken: updatedPage.accessToken,
        conversation: sanitizeConversation(updatedConv),
        customer: sanitizeCustomer(custRow),
        messages: emittedMessages,
        notification,
        autoReplyText,
        botConfig: {
          botApiKey: autoRow?.botApiKey || process.env.BOT_API_KEY || '',
          outboundWebhookUrl:
            autoRow?.outboundWebhookUrl ||
            process.env.OUTBOUND_BOT_WEBHOOK_URL ||
            '',
        },
      };
    });
  } catch (error) {
    console.error('receiveWebhookEvent failed:', error);
    throw new Error('Không thể xử lý sự kiện webhook.', { cause: error });
  }
}

