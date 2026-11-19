import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { auth } from '../lib/firebase';
import type {
  AutomationSettings,
  BootstrapPayload,
  ConnectedPage,
  Conversation,
  Customer,
  Message,
  Order,
  OrderStatus,
  PlatformType,
  Product,
  QuickReply,
  ShippingCarrier,
  SystemNotification,
  Tag,
  User,
  Workspace,
} from '../types/schema';

interface AppState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  workspace: Workspace | null;
  currentUserId: string;
  users: User[];
  pages: ConnectedPage[];
  customers: Customer[];
  tags: Tag[];
  conversations: Conversation[];
  messages: Message[];
  products: Product[];
  orders: Order[];
  quickReplies: QuickReply[];
  automation: AutomationSettings | null;
  notifications: SystemNotification[];
  socket: Socket | null;

  // Pagination state
  hasMoreConversations: boolean;
  hasMoreMessagesByConv: Record<string, boolean>;

  // Dashboard merge mode state
  mergeMode: boolean;
  selectedPageIds: string[];

  // Audio alert preference
  soundEnabled: boolean;
  toggleSoundEnabled: () => void;

  // Actions
  init: (idToken?: string) => Promise<void>;
  resetAuthState: () => void;
  refresh: () => Promise<void>;
  setCurrentUserId: (userId: string) => void;
  setMergeMode: (enabled: boolean) => void;
  toggleSelectedPageId: (pageId: string) => void;
  clearSelectedPageIds: () => void;

  connectPage: (payload: {
    pageId?: string;
    platform: PlatformType;
    name?: string;
    handle?: string;
    externalId?: string;
    accessToken?: string;
  }) => Promise<ConnectedPage>;
  updatePageCredentials: (
    pageId: string,
    patch: { externalId?: string; accessToken?: string }
  ) => Promise<ConnectedPage>;
  refreshPageToken: (pageId: string) => Promise<ConnectedPage>;
  syncPageHistory: (
    pageId: string
  ) => Promise<{ syncedConversations: number; importedMessages: number }>;
  togglePageActive: (pageId: string, isActive: boolean) => Promise<void>;

  updateConversation: (
    convId: string,
    patch: {
      assigneeId?: string | null;
      tagIds?: string[];
      unreadCount?: number;
      botPaused?: boolean;
    }
  ) => Promise<void>;

  loadMoreConversations: () => Promise<boolean>;
  loadOlderMessages: (convId: string) => Promise<boolean>;
  uploadAttachment: (
    file: File
  ) => Promise<{ url: string; fileName: string; isImage: boolean }>;
  uploadImage: (file: File) => Promise<string>;

  sendMessage: (payload: {
    conversationId: string;
    content: string;
    messageType?: 'text' | 'image' | 'file';
    imageUrl?: string;
    fileName?: string;
    convertCommentToInbox?: boolean;
    commentId?: string;
    replyAsPublicComment?: boolean;
  }) => Promise<void>;

  toggleCommentAction: (
    messageId: string,
    action: 'like' | 'toggle_hide'
  ) => Promise<void>;

  updateCustomer: (
    customerId: string,
    patch: { phone?: string; address?: string; note?: string; fullName?: string }
  ) => Promise<void>;

  createOrder: (payload: {
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
  }) => Promise<Order>;

  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  addProduct: (payload: {
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
  }) => Promise<void>;
  addProductVariant: (
    productId: string,
    variant: {
      sku: string;
      color: string;
      size: string;
      price: number;
      stock: number;
    }
  ) => Promise<Product>;
  importProductsCsv: (csvText: string) => Promise<{ importedCount: number }>;
  updateVariantStock: (
    productId: string,
    variantId: string,
    stock: number
  ) => Promise<void>;

  updateAutomation: (patch: Partial<AutomationSettings>) => Promise<void>;
  addTag: (name: string, color: string) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  addQuickReply: (payload: {
    shortcut: string;
    title: string;
    content: string;
    category: string;
  }) => Promise<void>;
  deleteQuickReply: (qrId: string) => Promise<void>;
  toggleStaffOnline: (userId: string, online: boolean) => Promise<void>;
  inviteStaff: (payload: {
    name: string;
    email: string;
    role: User['role'];
    allowedPageIds: string[];
  }) => Promise<User>;
  updateStaffAccess: (
    userId: string,
    patch: { role?: User['role']; allowedPageIds?: string[] }
  ) => Promise<User>;
  deleteStaff: (userId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  simulateWebhook: (payload: {
    platform: PlatformType;
    pageId?: string;
    customerName: string;
    channelType: 'inbox' | 'comment';
    content: string;
    postTitle?: string;
  }) => Promise<{ conversation: Conversation }>;
}

function upsertById<T extends { id: string }>(list: T[], item: T, prepend = false): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = item;
    return next;
  }
  return prepend ? [item, ...list] : [...list, item];
}

async function authFetch(
  url: string,
  init: RequestInit = {},
  explicitToken?: string
): Promise<Response> {
  const token = explicitToken ?? (await auth.currentUser?.getIdToken()) ?? '';
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

let sharedAudioCtx: AudioContext | null = null;

function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    const now = sharedAudioCtx.currentTime;
    const notes = [783.99, 987.77]; // G5 -> B5 gentle double-tone chime
    notes.forEach((freq, idx) => {
      if (!sharedAudioCtx) return;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.linearRampToValueAtTime(0.075, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.24);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.26);
    });
  } catch {
    // Browser autoplay restriction before user interaction
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  workspace: null,
  currentUserId: 'u1',
  users: [],
  pages: [],
  customers: [],
  tags: [],
  conversations: [],
  messages: [],
  products: [],
  orders: [],
  quickReplies: [],
  automation: null,
  notifications: [],
  socket: null,
  hasMoreConversations: true,
  hasMoreMessagesByConv: {},
  mergeMode: false,
  selectedPageIds: [],
  soundEnabled:
    typeof window !== 'undefined'
      ? window.localStorage.getItem('dauto_sound') !== 'false'
      : true,

  toggleSoundEnabled: () =>
    set((s) => {
      const next = !s.soundEnabled;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('dauto_sound', next ? 'true' : 'false');
      }
      if (next) {
        playNotificationChime();
      }
      return { soundEnabled: next };
    }),

  resetAuthState: () => {
    const existingSocket = get().socket;
    if (existingSocket) {
      existingSocket.disconnect();
    }
    set({
      initialized: false,
      loading: false,
      error: null,
      socket: null,
      workspace: null,
      users: [],
      pages: [],
      customers: [],
      tags: [],
      conversations: [],
      messages: [],
      products: [],
      orders: [],
      quickReplies: [],
      automation: null,
      notifications: [],
      hasMoreConversations: true,
      hasMoreMessagesByConv: {},
      selectedPageIds: [],
      mergeMode: false,
    });
  },

  init: async (idToken?: string) => {
    if (get().initialized || get().loading) return;
    set({ loading: true, error: null });
    try {
      const token = idToken ?? (await auth.currentUser?.getIdToken()) ?? '';
      const res = await authFetch('/api/bootstrap', {}, token);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Không thể tải dữ liệu hệ thống');
      }
      const data = (await res.json()) as BootstrapPayload & { currentUserId?: string };

      let socket = get().socket;
      if (!socket) {
        socket = io({
          transports: ['websocket', 'polling'],
          auth: { token },
        });

        socket.on('page:updated', (page: ConnectedPage) => {
          set((s) => ({ pages: upsertById(s.pages, page) }));
        });
        socket.on('conversation:updated', (conv: Conversation) => {
          set((s) => ({ conversations: upsertById(s.conversations, conv, true) }));
        });
        socket.on('message:created', (msg: Message) => {
          const isNew = !get().messages.some((m) => m.id === msg.id);
          set((s) => ({ messages: upsertById(s.messages, msg) }));
          if (isNew && msg.senderType === 'customer' && get().soundEnabled) {
            playNotificationChime();
          }
        });
        socket.on('message:updated', (msg: Message) => {
          set((s) => ({ messages: upsertById(s.messages, msg) }));
        });
        socket.on('customer:updated', (cust: Customer) => {
          set((s) => ({ customers: upsertById(s.customers, cust) }));
        });
        socket.on('product:updated', (prod: Product) => {
          set((s) => ({ products: upsertById(s.products, prod, true) }));
        });
        socket.on('order:created', (ord: Order) => {
          set((s) => ({ orders: upsertById(s.orders, ord, true) }));
        });
        socket.on('order:updated', (ord: Order) => {
          set((s) => ({ orders: upsertById(s.orders, ord) }));
        });
        socket.on('automation:updated', (automation: AutomationSettings) => {
          set({ automation });
        });
        socket.on('tag:created', (tag: Tag) => {
          set((s) => ({ tags: upsertById(s.tags, tag) }));
        });
        socket.on('tag:deleted', ({ id }: { id: string }) => {
          set((s) => ({
            tags: s.tags.filter((t) => t.id !== id),
            conversations: s.conversations.map((c) => ({
              ...c,
              tagIds: c.tagIds.filter((tid) => tid !== id),
            })),
          }));
        });
        socket.on('quick_reply:created', (qr: QuickReply) => {
          set((s) => ({ quickReplies: upsertById(s.quickReplies, qr) }));
        });
        socket.on('quick_reply:deleted', ({ id }: { id: string }) => {
          set((s) => ({
            quickReplies: s.quickReplies.filter((q) => q.id !== id),
          }));
        });
        socket.on('user:updated', (user: User) => {
          set((s) => ({ users: upsertById(s.users, user) }));
        });
        socket.on('user:deleted', ({ id }: { id: string }) => {
          set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
        });
        socket.on('notification:created', (notif: SystemNotification) => {
          set((s) => ({ notifications: upsertById(s.notifications, notif, true) }));
        });
      }

      set({
        ...data,
        hasMoreConversations: (data.conversations?.length ?? 0) >= 50,
        currentUserId: data.currentUserId || get().currentUserId,
        socket,
        initialized: true,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
      });
    }
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/bootstrap');
      if (!res.ok) throw new Error('Không thể làm mới dữ liệu');
      const data = (await res.json()) as BootstrapPayload & { currentUserId?: string };
      set({
        ...data,
        hasMoreConversations: (data.conversations?.length ?? 0) >= 50,
        currentUserId: data.currentUserId || get().currentUserId,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Lỗi làm mới dữ liệu',
      });
    }
  },

  setCurrentUserId: (userId) => set({ currentUserId: userId }),

  setMergeMode: (enabled) =>
    set((s) => ({
      mergeMode: enabled,
      selectedPageIds: enabled ? s.selectedPageIds : [],
    })),

  toggleSelectedPageId: (pageId) =>
    set((s) => {
      const exists = s.selectedPageIds.includes(pageId);
      return {
        selectedPageIds: exists
          ? s.selectedPageIds.filter((id) => id !== pageId)
          : [...s.selectedPageIds, pageId],
      };
    }),

  clearSelectedPageIds: () => set({ selectedPageIds: [] }),

  connectPage: async (payload) => {
    const res = await authFetch('/api/pages/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể kết nối trang');
    set((s) => ({ pages: upsertById(s.pages, data.page) }));
    return data.page as ConnectedPage;
  },

  updatePageCredentials: async (pageId, patch) => {
    const res = await authFetch(`/api/pages/${pageId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể lưu cấu hình trang');
    set((s) => ({ pages: upsertById(s.pages, data.page) }));
    return data.page as ConnectedPage;
  },

  refreshPageToken: async (pageId) => {
    const res = await authFetch(`/api/pages/${pageId}/refresh-token`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể làm mới Access Token');
    set((s) => ({ pages: upsertById(s.pages, data.page) }));
    return data.page as ConnectedPage;
  },

  syncPageHistory: async (pageId) => {
    const res = await authFetch(`/api/pages/${pageId}/sync-history`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể đồng bộ lịch sử hội thoại');
    set((s) => {
      let nextPages = s.pages;
      if (data.page) nextPages = upsertById(nextPages, data.page as ConnectedPage);

      let nextCustomers = s.customers;
      for (const cu of (data.customers || []) as Customer[]) {
        nextCustomers = upsertById(nextCustomers, cu);
      }

      let nextConvs = s.conversations;
      for (const co of (data.conversations || []) as Conversation[]) {
        nextConvs = upsertById(nextConvs, co, true);
      }

      let nextMsgs = s.messages;
      for (const m of (data.messages || []) as Message[]) {
        nextMsgs = upsertById(nextMsgs, m);
      }

      return {
        pages: nextPages,
        customers: nextCustomers,
        conversations: nextConvs,
        messages: nextMsgs,
      };
    });
    return {
      syncedConversations: Number(data.syncedConversations || 0),
      importedMessages: Number(data.importedMessages || 0),
    };
  },

  togglePageActive: async (pageId, isActive) => {
    const res = await authFetch(`/api/pages/${pageId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    const data = await res.json();
    if (res.ok && data.page) {
      set((s) => ({
        pages: upsertById(s.pages, data.page),
        selectedPageIds: isActive
          ? s.selectedPageIds
          : s.selectedPageIds.filter((id) => id !== pageId),
      }));
    }
  },

  updateConversation: async (convId, patch) => {
    const res = await authFetch(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.conversation) {
      set((s) => ({
        conversations: upsertById(s.conversations, data.conversation),
      }));
    }
  },

  loadMoreConversations: async () => {
    const offset = get().conversations.length;
    const res = await authFetch(`/api/conversations?limit=50&offset=${offset}`);
    const data = await res.json();
    if (!res.ok) return false;
    set((s) => {
      let nextConvs = s.conversations;
      for (const c of (data.conversations || []) as Conversation[]) {
        nextConvs = upsertById(nextConvs, c);
      }
      let nextCusts = s.customers;
      for (const cu of (data.customers || []) as Customer[]) {
        nextCusts = upsertById(nextCusts, cu);
      }
      return {
        conversations: nextConvs,
        customers: nextCusts,
        hasMoreConversations: Boolean(data.hasMore),
      };
    });
    return Boolean(data.hasMore);
  },

  loadOlderMessages: async (convId) => {
    const existingCount = get().messages.filter((m) => m.conversationId === convId).length;
    const res = await authFetch(
      `/api/conversations/${convId}/messages?limit=50&offset=${existingCount}`
    );
    const data = await res.json();
    if (!res.ok) return false;
    set((s) => {
      let nextMessages = s.messages;
      for (const m of (data.messages || []) as Message[]) {
        nextMessages = upsertById(nextMessages, m);
      }
      return {
        messages: nextMessages,
        hasMoreMessagesByConv: {
          ...s.hasMoreMessagesByConv,
          [convId]: Boolean(data.hasMore),
        },
      };
    });
    return Boolean(data.hasMore);
  },

  uploadAttachment: async (file) => {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không thể đọc tệp tải lên'));
      reader.readAsDataURL(file);
    });
    const res = await authFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name || 'attachment',
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Tải tệp lên thất bại');
    }
    return {
      url: data.url as string,
      fileName: (data.fileName as string) || file.name || 'tep-dinh-kem',
      isImage: Boolean(data.isImage),
    };
  },

  uploadImage: async (file) => {
    const uploaded = await get().uploadAttachment(file);
    return uploaded.url;
  },

  sendMessage: async (payload) => {
    const staffId = get().currentUserId;
    const res = await authFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, staffId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gửi tin nhắn thất bại');
    set((s) => ({
      messages: upsertById(s.messages, data.message),
      conversations: upsertById(s.conversations, data.conversation),
    }));
  },

  toggleCommentAction: async (messageId, action) => {
    const res = await authFetch(`/api/messages/${messageId}/comment-action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok && data.message) {
      set((s) => ({ messages: upsertById(s.messages, data.message) }));
    }
  },

  updateCustomer: async (customerId, patch) => {
    const res = await authFetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.customer) {
      set((s) => ({ customers: upsertById(s.customers, data.customer) }));
    }
  },

  createOrder: async (payload) => {
    const staffId = get().currentUserId;
    const res = await authFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, staffId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể tạo đơn hàng');

    set((s) => {
      let nextProducts = s.products;
      for (const prod of data.updatedProducts as Product[]) {
        nextProducts = upsertById(nextProducts, prod);
      }
      return {
        orders: upsertById(s.orders, data.order, true),
        products: nextProducts,
        customers: upsertById(s.customers, data.customer),
        conversations: upsertById(s.conversations, data.conversation),
        messages: upsertById(s.messages, data.systemMessage),
      };
    });
    return data.order as Order;
  },

  updateOrderStatus: async (orderId, status) => {
    const res = await authFetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) {
      set((s) => ({
        orders: upsertById(s.orders, data.order),
        customers: data.customer ? upsertById(s.customers, data.customer) : s.customers,
      }));
    }
  },

  addProduct: async (payload) => {
    const res = await authFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể thêm sản phẩm');
    set((s) => ({ products: upsertById(s.products, data.product, true) }));
  },

  addProductVariant: async (productId, variant) => {
    const res = await authFetch(`/api/products/${productId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variant),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể thêm biến thể');
    set((s) => ({ products: upsertById(s.products, data.product) }));
    return data.product as Product;
  },

  importProductsCsv: async (csvText) => {
    const res = await authFetch('/api/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể nhập sản phẩm từ CSV');
    set((s) => {
      let nextProducts = s.products;
      for (const p of (data.products || []) as Product[]) {
        nextProducts = upsertById(nextProducts, p, true);
      }
      return { products: nextProducts };
    });
    return { importedCount: Number(data.importedCount || 0) };
  },

  updateVariantStock: async (productId, variantId, stock) => {
    const res = await authFetch(`/api/products/${productId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, stock }),
    });
    const data = await res.json();
    if (res.ok && data.product) {
      set((s) => ({ products: upsertById(s.products, data.product) }));
    }
  },

  updateAutomation: async (patch) => {
    const res = await authFetch('/api/settings/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.automation) {
      set({ automation: data.automation });
    }
  },

  addTag: async (name, color) => {
    const res = await authFetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    const data = await res.json();
    if (res.ok && data.tag) {
      set((s) => ({ tags: upsertById(s.tags, data.tag) }));
    }
  },

  deleteTag: async (tagId) => {
    await authFetch(`/api/tags/${tagId}`, { method: 'DELETE' });
    set((s) => ({
      tags: s.tags.filter((t) => t.id !== tagId),
      conversations: s.conversations.map((c) => ({
        ...c,
        tagIds: c.tagIds.filter((tid) => tid !== tagId),
      })),
    }));
  },

  addQuickReply: async (payload) => {
    const res = await authFetch('/api/quick-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.quickReply) {
      set((s) => ({ quickReplies: upsertById(s.quickReplies, data.quickReply) }));
    }
  },

  deleteQuickReply: async (qrId) => {
    await authFetch(`/api/quick-replies/${qrId}`, { method: 'DELETE' });
    set((s) => ({ quickReplies: s.quickReplies.filter((q) => q.id !== qrId) }));
  },

  toggleStaffOnline: async (userId, online) => {
    const res = await authFetch(`/api/users/${userId}/online`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      set((s) => ({ users: upsertById(s.users, data.user) }));
    }
  },

  inviteStaff: async (payload) => {
    const res = await authFetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể mời nhân viên');
    set((s) => ({ users: upsertById(s.users, data.user) }));
    return data.user as User;
  },

  updateStaffAccess: async (userId, patch) => {
    const res = await authFetch(`/api/users/${userId}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể cập nhật phân quyền');
    set((s) => ({ users: upsertById(s.users, data.user) }));
    return data.user as User;
  },

  deleteStaff: async (userId) => {
    const res = await authFetch(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không thể xóa nhân viên');
    set((s) => ({ users: s.users.filter((u) => u.id !== userId) }));
  },

  markNotificationsRead: async () => {
    const res = await authFetch('/api/notifications/read-all', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.notifications) {
      set({ notifications: data.notifications });
    }
  },

  simulateWebhook: async (payload) => {
    const res = await fetch(`/api/webhooks/${payload.platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Webhook thất bại');
    set((s) => {
      let nextMessages = s.messages;
      for (const m of data.messages as Message[]) {
        nextMessages = upsertById(nextMessages, m);
      }
      return {
        customers: upsertById(s.customers, data.customer),
        conversations: upsertById(s.conversations, data.conversation, true),
        messages: nextMessages,
        notifications: data.notification
          ? upsertById(s.notifications, data.notification, true)
          : s.notifications,
      };
    });
    return { conversation: data.conversation as Conversation };
  },
}));
