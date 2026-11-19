import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type {
  ConversationChannelType,
  KeywordReplyRule,
  OrderItem,
  OrderStatus,
  PlatformType,
  ShippingCarrier,
  UserRole,
} from '../types/schema.ts';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  plan: text('plan').notNull(),
  createdAt: text('created_at').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  avatarUrl: text('avatar_url').notNull().default(''),
  online: boolean('online').notNull().default(true),
  avgResponseSeconds: integer('avg_response_seconds').notNull().default(40),
  allowedPageIds: jsonb('allowed_page_ids').$type<string[]>().notNull().default([]),
});

export const connectedPages = pgTable('connected_pages', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  platform: text('platform').$type<PlatformType>().notNull(),
  name: text('name').notNull(),
  handle: text('handle').notNull(),
  externalId: text('external_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: text('token_expires_at'),
  isActive: boolean('is_active').notNull().default(false),
  unreadCount: integer('unread_count').notNull().default(0),
  conversationCount: integer('conversation_count').notNull().default(0),
  connectedAt: text('connected_at'),
});

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  platform: text('platform').$type<PlatformType>().notNull(),
  externalId: text('external_id'),
  avatarUrl: text('avatar_url').notNull().default(''),
  totalOrders: integer('total_orders').notNull().default(0),
  deliveredOrders: integer('delivered_orders').notNull().default(0),
  returnedOrders: integer('returned_orders').notNull().default(0),
  note: text('note').notNull().default(''),
  previousAssigneeId: text('previous_assignee_id'),
});

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  pageId: text('page_id')
    .notNull()
    .references(() => connectedPages.id, { onDelete: 'cascade' }),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  platform: text('platform').$type<PlatformType>().notNull(),
  channelType: text('channel_type').$type<ConversationChannelType>().notNull(),
  postTitle: text('post_title'),
  externalPostId: text('external_post_id'),
  botPaused: boolean('bot_paused').notNull().default(false),
  unreadCount: integer('unread_count').notNull().default(0),
  isReplied: boolean('is_replied').notNull().default(false),
  hasPhone: boolean('has_phone').notNull().default(false),
  assigneeId: text('assignee_id'),
  tagIds: jsonb('tag_ids').$type<string[]>().notNull().default([]),
  lastMessageText: text('last_message_text').notNull().default(''),
  lastMessageAt: text('last_message_at').notNull(),
});

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  senderType: text('sender_type').$type<'customer' | 'staff' | 'system'>().notNull(),
  senderId: text('sender_id').notNull(),
  senderName: text('sender_name').notNull(),
  messageType: text('message_type')
    .$type<'text' | 'image' | 'comment' | 'file'>()
    .notNull(),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  fileName: text('file_name'),
  externalMessageId: text('external_message_id'),
  externalCommentId: text('external_comment_id'),
  isHidden: boolean('is_hidden').notNull().default(false),
  isLiked: boolean('is_liked').notNull().default(false),
  convertedToInbox: boolean('converted_to_inbox').notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  imageUrl: text('image_url').notNull(),
});

export const productVariants = pgTable('product_variants', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  color: text('color').notNull(),
  size: text('size').notNull(),
  price: integer('price').notNull(),
  stock: integer('stock').notNull(),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  pageId: text('page_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  items: jsonb('items').$type<OrderItem[]>().notNull(),
  subtotal: integer('subtotal').notNull(),
  shippingFee: integer('shipping_fee').notNull().default(0),
  discount: integer('discount').notNull().default(0),
  codTotal: integer('cod_total').notNull(),
  carrier: text('carrier').$type<ShippingCarrier>().notNull(),
  trackingCode: text('tracking_code').notNull(),
  carrierSynced: boolean('carrier_synced').notNull().default(false),
  status: text('status').$type<OrderStatus>().notNull(),
  note: text('note').notNull().default(''),
  createdByStaffId: text('created_by_staff_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const quickReplies = pgTable('quick_replies', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  shortcut: text('shortcut').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull(),
});

export const automationSettings = pgTable('automation_settings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  autoHidePhoneComments: boolean('auto_hide_phone_comments').notNull().default(true),
  autoReplyComments: boolean('auto_reply_comments').notNull().default(true),
  keywordRules: jsonb('keyword_rules').$type<KeywordReplyRule[]>().notNull().default([]),
  roundRobinEnabled: boolean('round_robin_enabled').notNull().default(true),
  roundRobinMode: text('round_robin_mode')
    .$type<'round_robin' | 'sticky_previous'>()
    .notNull()
    .default('sticky_previous'),
  lastAssignedIndex: integer('last_assigned_index').notNull().default(0),
  webhookVerifyToken: text('webhook_verify_token')
    .notNull()
    .default('dauto_verify_2026'),
  botApiKey: text('bot_api_key').notNull().default(''),
  outboundWebhookUrl: text('outbound_webhook_url').notNull().default(''),
  autoPauseBotOnStaffReply: boolean('auto_pause_bot_on_staff_reply')
    .notNull()
    .default(true),
});

export const systemNotifications = pgTable('system_notifications', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  conversationId: text('conversation_id'),
  read: boolean('read').notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  page: one(connectedPages, {
    fields: [conversations.pageId],
    references: [connectedPages.id],
  }),
  customer: one(customers, {
    fields: [conversations.customerId],
    references: [customers.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
