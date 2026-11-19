export type UserRole = 'owner' | 'admin' | 'sale' | 'warehouse';

export type PlatformType =
  | 'facebook'
  | 'instagram'
  | 'zalo'
  | 'tiktok'
  | 'shopee'
  | 'website';

export type ConversationChannelType = 'inbox' | 'comment';

export type OrderStatus =
  | 'pending'
  | 'shipping'
  | 'delivered'
  | 'returned';

export type ShippingCarrier = 'GHN' | 'GHTK' | 'Viettel Post' | 'J&T Express';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  online: boolean;
  avgResponseSeconds: number;
  allowedPageIds?: string[];
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  createdAt: string;
}

export interface ConnectedPage {
  id: string;
  workspaceId: string;
  platform: PlatformType;
  name: string;
  handle: string;
  externalId: string;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  tokenExpiresAt?: string | null;
  isActive: boolean;
  unreadCount: number;
  conversationCount: number;
  connectedAt: string | null;
}

export interface Customer {
  id: string;
  workspaceId: string;
  fullName: string;
  phone: string;
  address: string;
  platform: PlatformType;
  externalId?: string;
  avatarUrl?: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  note: string;
  previousAssigneeId: string | null;
}

export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  pageId: string;
  customerId: string;
  platform: PlatformType;
  channelType: ConversationChannelType;
  postTitle: string | null;
  externalPostId?: string | null;
  botPaused?: boolean;
  unreadCount: number;
  isReplied: boolean;
  hasPhone: boolean;
  assigneeId: string | null;
  tagIds: string[];
  lastMessageText: string;
  lastMessageAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'staff' | 'system';
  senderId: string;
  senderName: string;
  messageType: 'text' | 'image' | 'comment' | 'file';
  content: string;
  imageUrl?: string;
  fileName?: string;
  externalMessageId?: string;
  externalCommentId?: string;
  isHidden?: boolean;
  isLiked?: boolean;
  convertedToInbox?: boolean;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  price: number;
  stock: number;
}

export interface Product {
  id: string;
  workspaceId: string;
  name: string;
  category: string;
  imageUrl: string;
  variants: ProductVariant[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  sku: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  code: string;
  workspaceId: string;
  pageId: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  codTotal: number;
  carrier: ShippingCarrier;
  trackingCode: string;
  carrierSynced?: boolean;
  status: OrderStatus;
  note: string;
  createdByStaffId: string;
  createdAt: string;
}

export interface QuickReply {
  id: string;
  workspaceId: string;
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

export interface KeywordReplyRule {
  id: string;
  keywords: string[];
  commentReply: string;
  inboxReply: string;
  enabled: boolean;
}

export interface AutomationSettings {
  autoHidePhoneComments: boolean;
  autoReplyComments: boolean;
  keywordRules: KeywordReplyRule[];
  roundRobinEnabled: boolean;
  roundRobinMode: 'round_robin' | 'sticky_previous';
  lastAssignedIndex: number;
  webhookVerifyToken: string;
  botApiKey: string;
  outboundWebhookUrl: string;
  autoPauseBotOnStaffReply: boolean;
}

export interface SystemNotification {
  id: string;
  title: string;
  body: string;
  conversationId?: string;
  read: boolean;
  createdAt: string;
}

export interface BootstrapPayload {
  workspace: Workspace;
  users: User[];
  pages: ConnectedPage[];
  customers: Customer[];
  tags: Tag[];
  conversations: Conversation[];
  messages: Message[];
  products: Product[];
  orders: Order[];
  quickReplies: QuickReply[];
  automation: AutomationSettings;
  notifications: SystemNotification[];
}

