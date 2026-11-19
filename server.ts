import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import {
  addProduct,
  addProductVariant,
  addQuickReply,
  addStaffMessage,
  addTag,
  connectPage,
  createOrder,
  deleteQuickReply,
  deleteStaffMember,
  deleteTag,
  getBotConversations,
  getConversationMessagesPage,
  getOrCreateUserAndBootstrap,
  getOrders,
  getPages,
  getPageWithTokens,
  getPaginatedConversations,
  getProducts,
  getWebhookVerifyToken,
  getWidgetConversationHistory,
  importProductsBulk,
  inviteOrAddStaff,
  markNotificationsRead,
  receiveWebhookEvent,
  syncHistoricalConversationsForPage,
  toggleCommentAction,
  togglePageActive,
  toggleStaffOnline,
  updateAutomation,
  updateConversation,
  updateCustomer,
  updateOrderStatus,
  updateOrderStatusByTrackingCode,
  updatePageCredentials,
  updateStaffAccess,
  updateVariantStock,
  upsertOAuthConnectedPage,
} from './src/db/repository.ts';
import {
  requireAuth,
  requireBotKey,
  requirePermission,
  verifySocketToken,
  type AuthRequest,
} from './src/middleware/auth.ts';
import type { OrderStatus, PlatformType, UserRole } from './src/types/schema.ts';
import {
  parseIncomingWebhookPayload,
  parseProductsCsv,
  verifyWebhookChallenge,
} from './src/utils/omnichannel.ts';
import {
  dispatchOrderToShippingCarrier,
  dispatchOutboundBotWebhook,
  exchangeFacebookOAuthCode,
  exchangeZaloOAuthCode,
  fetchHistoricalConversations,
  fetchPlatformCustomerProfile,
  forwardCommentModerationToPlatform,
  forwardReplyToPlatform,
  refreshZaloAccessToken,
  verifyMetaSignature,
} from './src/utils/server-integrations.ts';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function getPublicBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0]
    : req.protocol;
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '12mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  io.use(async (socket, next) => {
    const decoded = await verifySocketToken(socket.handshake.auth?.token);
    if (!decoded) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.uid = decoded.uid;
    next();
  });

  io.on('connection', (socket) => {
    socket.emit('workspace:ready', { connectedAt: new Date().toISOString() });
  });

  // 1. Bootstrap endpoint (authenticated via Firebase ID Token)
  app.get('/api/bootstrap', requireAuth, async (req: AuthRequest, res) => {
    try {
      const authUser = req.user!;
      const payload = await getOrCreateUserAndBootstrap({
        uid: authUser.uid,
        email: authUser.email || `${authUser.uid}@dauto.vn`,
        name: typeof authUser.name === 'string' ? authUser.name : undefined,
        avatarUrl: typeof authUser.picture === 'string' ? authUser.picture : undefined,
      });
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải dữ liệu hệ thống',
      });
    }
  });

  // 1b. Image & File Attachment Upload endpoint (base64 JSON -> /uploads/*)
  app.post('/api/upload', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { filename, mimeType, dataBase64 } = req.body as {
        filename?: string;
        mimeType?: string;
        dataBase64?: string;
      };
      if (!dataBase64 || typeof dataBase64 !== 'string') {
        res.status(400).json({ error: 'Thiếu dữ liệu tệp tải lên' });
        return;
      }

      const imageExtMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const fileExtMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/csv': 'csv',
      };

      const lowerMime = (mimeType || '').toLowerCase();
      const lowerName = (filename || '').toLowerCase();
      let ext = imageExtMap[lowerMime] || fileExtMap[lowerMime];
      let isImage = Boolean(imageExtMap[lowerMime]);

      if (!ext) {
        if (lowerName.endsWith('.png')) {
          ext = 'png';
          isImage = true;
        } else if (lowerName.endsWith('.webp')) {
          ext = 'webp';
          isImage = true;
        } else if (lowerName.endsWith('.gif')) {
          ext = 'gif';
          isImage = true;
        } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
          ext = 'jpg';
          isImage = true;
        } else if (lowerName.endsWith('.pdf')) ext = 'pdf';
        else if (lowerName.endsWith('.docx')) ext = 'docx';
        else if (lowerName.endsWith('.doc')) ext = 'doc';
        else if (lowerName.endsWith('.xlsx')) ext = 'xlsx';
        else if (lowerName.endsWith('.xls')) ext = 'xls';
        else if (lowerName.endsWith('.csv')) ext = 'csv';
        else {
          res.status(400).json({
            error:
              'Định dạng tệp chưa được hỗ trợ (chỉ nhận ảnh PNG/JPG/WebP/GIF hoặc tài liệu PDF/DOCX/XLSX)',
          });
          return;
        }
      }

      const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
        res.status(400).json({ error: 'Kích thước tệp phải nhỏ hơn 8MB' });
        return;
      }

      const prefix = isImage ? 'img' : 'doc';
      const safeName = `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
      res.status(201).json({
        url: `/uploads/${safeName}`,
        fileName: filename || safeName,
        isImage,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể lưu tệp tải lên',
      });
    }
  });

  // 2. Pages management
  app.get('/api/pages', requireAuth, async (_req, res) => {
    try {
      const pages = await getPages();
      res.json({ pages });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải danh sách trang',
      });
    }
  });

  app.post(
    '/api/pages/connect',
    requireAuth,
    requirePermission('manage_pages'),
    async (req, res) => {
      try {
        const { pageId, platform, name, handle, externalId, accessToken } = req.body as {
          pageId?: string;
          platform: PlatformType;
          name?: string;
          handle?: string;
          externalId?: string;
          accessToken?: string;
        };
        const page = await connectPage({
          pageId,
          platform,
          name,
          handle,
          externalId,
          accessToken,
        });
        io.emit('page:updated', page);
        res.json({ page });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể kết nối trang',
        });
      }
    }
  );

  app.patch(
    '/api/pages/:id/credentials',
    requireAuth,
    requirePermission('manage_pages'),
    async (req, res) => {
      try {
        const { externalId, accessToken } = req.body as {
          externalId?: string;
          accessToken?: string;
        };
        const page = await updatePageCredentials(req.params.id, {
          externalId,
          accessToken,
        });
        if (!page) {
          res.status(404).json({ error: 'Không tìm thấy trang' });
          return;
        }
        io.emit('page:updated', page);
        res.json({ page });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể lưu cấu hình trang',
        });
      }
    }
  );

  app.patch(
    '/api/pages/:id/toggle',
    requireAuth,
    requirePermission('manage_pages'),
    async (req, res) => {
      try {
        const { isActive } = req.body as { isActive: boolean };
        const page = await togglePageActive(req.params.id, Boolean(isActive));
        if (!page) {
          res.status(404).json({ error: 'Không tìm thấy trang' });
          return;
        }
        io.emit('page:updated', page);
        res.json({ page });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật trạng thái trang',
        });
      }
    }
  );

  // 2b. Zalo OA v4 Token Refresh & Historical Conversations Sync
  app.post(
    '/api/pages/:id/refresh-token',
    requireAuth,
    requirePermission('manage_pages'),
    async (req, res) => {
      try {
        const page = await getPageWithTokens(req.params.id);
        if (!page) {
          res.status(404).json({ error: 'Không tìm thấy trang' });
          return;
        }
        if (page.platform !== 'zalo') {
          res.status(400).json({ error: 'Chỉ hỗ trợ làm mới Refresh Token cho kênh Zalo OA' });
          return;
        }
        const refToken = page.refreshToken || process.env.ZALO_REFRESH_TOKEN || '';
        if (!refToken || !process.env.ZALO_APP_ID || !process.env.ZALO_APP_SECRET) {
          res.status(400).json({
            error:
              'Thiếu ZALO_APP_ID, ZALO_APP_SECRET hoặc Zalo Refresh Token (xem candien.md mục 3)',
          });
          return;
        }
        const refreshed = await refreshZaloAccessToken({ refreshToken: refToken });
        if (!refreshed) {
          res.status(400).json({
            error: 'Không thể làm mới Access Token từ Zalo OA v4 (vui lòng kiểm tra lại Refresh Token)',
          });
          return;
        }
        const updatedPage = await updatePageCredentials(page.id, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt: refreshed.expiresAt ?? null,
        });
        if (updatedPage) io.emit('page:updated', updatedPage);
        res.json({ page: updatedPage });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Lỗi làm mới token Zalo OA',
        });
      }
    }
  );

  app.post(
    '/api/pages/:id/sync-history',
    requireAuth,
    requirePermission('manage_pages'),
    async (req, res) => {
      try {
        const page = await getPageWithTokens(req.params.id);
        if (!page) {
          res.status(404).json({ error: 'Không tìm thấy trang' });
          return;
        }
        if (!page.accessToken) {
          res.status(400).json({
            error:
              'Trang chưa có Access Token thật. Hãy kết nối OAuth 1 chạm hoặc dán Token trong Cài đặt trước khi đồng bộ.',
          });
          return;
        }
        const threads = await fetchHistoricalConversations({
          page,
          accessToken: page.accessToken,
        });
        const result = await syncHistoricalConversationsForPage(page.id, threads);
        io.emit('page:updated', result.page);
        for (const cu of result.customers) io.emit('customer:updated', cu);
        for (const co of result.conversations) io.emit('conversation:updated', co);
        for (const msg of result.messages) io.emit('message:created', msg);
        res.json(result);
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Không thể đồng bộ lịch sử hội thoại',
        });
      }
    }
  );

  // 2c. 1-Click OAuth Connect (Meta Facebook & Zalo OA v4)
  app.get('/api/oauth/status', requireAuth, (_req, res) => {
    res.json({
      facebookConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      zaloConfigured: Boolean(process.env.ZALO_APP_ID && process.env.ZALO_APP_SECRET),
      shopeeConfigured: Boolean(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY),
      tiktokConfigured: Boolean(
        process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_APP_SECRET
      ),
    });
  });

  app.get('/api/oauth/facebook/start', (req, res) => {
    const appId = process.env.META_APP_ID?.trim();
    if (!appId) {
      res.status(400).json({
        error: 'Chưa cấu hình META_APP_ID trong biến môi trường (xem candien.md mục 2)',
      });
      return;
    }
    const redirectUri =
      process.env.META_REDIRECT_URI?.trim() ||
      `${getPublicBaseUrl(req)}/api/oauth/facebook/callback`;
    const oauthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    oauthUrl.searchParams.set('client_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set(
      'scope',
      'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_engagement,pages_read_user_content'
    );
    oauthUrl.searchParams.set('response_type', 'code');
    res.redirect(oauthUrl.toString());
  });

  app.get('/api/oauth/facebook/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!code || !appId || !appSecret) {
      res.redirect('/dashboard?oauth_error=facebook_missing_config');
      return;
    }
    try {
      const redirectUri =
        process.env.META_REDIRECT_URI?.trim() ||
        `${getPublicBaseUrl(req)}/api/oauth/facebook/callback`;
      const exchanged = await exchangeFacebookOAuthCode({
        code,
        redirectUri,
        appId,
        appSecret,
      });
      for (const p of exchanged.pages) {
        const saved = await upsertOAuthConnectedPage({
          platform: 'facebook',
          externalId: p.externalId,
          name: p.name,
          handle: p.handle,
          accessToken: p.accessToken,
        });
        io.emit('page:updated', saved);
      }
      res.redirect(`/dashboard?oauth=facebook_ok&count=${exchanged.pages.length}`);
    } catch (err) {
      const msg = encodeURIComponent(
        err instanceof Error ? err.message : 'facebook_oauth_failed'
      );
      res.redirect(`/dashboard?oauth_error=${msg}`);
    }
  });

  app.get('/api/oauth/zalo/start', (req, res) => {
    const appId = process.env.ZALO_APP_ID?.trim();
    if (!appId) {
      res.status(400).json({
        error: 'Chưa cấu hình ZALO_APP_ID trong biến môi trường (xem candien.md mục 3)',
      });
      return;
    }
    const redirectUri =
      process.env.ZALO_REDIRECT_URI?.trim() ||
      `${getPublicBaseUrl(req)}/api/oauth/zalo/callback`;
    const oauthUrl = new URL('https://oauth.zaloapp.com/v4/oa/permission');
    oauthUrl.searchParams.set('app_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    res.redirect(oauthUrl.toString());
  });

  app.get('/api/oauth/zalo/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const appId = process.env.ZALO_APP_ID?.trim();
    const appSecret = process.env.ZALO_APP_SECRET?.trim();
    if (!code || !appId || !appSecret) {
      res.redirect('/dashboard?oauth_error=zalo_missing_config');
      return;
    }
    try {
      const exchanged = await exchangeZaloOAuthCode({ code, appId, appSecret });
      const saved = await upsertOAuthConnectedPage({
        platform: 'zalo',
        externalId: exchanged.externalId,
        name: exchanged.name,
        handle: exchanged.handle,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        tokenExpiresAt: exchanged.expiresAt,
      });
      io.emit('page:updated', saved);
      res.redirect('/dashboard?oauth=zalo_ok');
    } catch (err) {
      const msg = encodeURIComponent(
        err instanceof Error ? err.message : 'zalo_oauth_failed'
      );
      res.redirect(`/dashboard?oauth_error=${msg}`);
    }
  });

  // 3. Conversations & Messages (including pagination)
  app.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await getPaginatedConversations({
        limit,
        offset,
        role: req.dbUser?.role,
        allowedPageIds: req.dbUser?.allowedPageIds,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải hội thoại',
      });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await getConversationMessagesPage(req.params.id, limit, offset);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải tin nhắn',
      });
    }
  });

  app.patch(
    '/api/conversations/:id',
    requireAuth,
    requirePermission('reply_conversations'),
    async (req, res) => {
      try {
        const conv = await updateConversation(req.params.id, req.body);
        if (!conv) {
          res.status(404).json({ error: 'Không tìm thấy hội thoại' });
          return;
        }
        io.emit('conversation:updated', conv);
        res.json({ conversation: conv });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật hội thoại',
        });
      }
    }
  );

  app.post(
    '/api/messages',
    requireAuth,
    requirePermission('reply_conversations'),
    async (req: AuthRequest, res) => {
      try {
        const {
          conversationId,
          staffId,
          content,
          messageType,
          imageUrl,
          fileName,
          convertCommentToInbox,
          commentId,
          replyAsPublicComment,
        } = req.body;
        if (!conversationId || (!content?.trim() && !imageUrl)) {
          res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
          return;
        }

        const result = await addStaffMessage({
          conversationId,
          staffId: staffId || req.dbUser?.id || 'u1',
          content: content?.trim() || '',
          messageType,
          imageUrl,
          fileName,
          convertCommentToInbox,
          commentId,
          replyAsPublicComment,
        });
        if (!result) {
          res.status(404).json({ error: 'Không tìm thấy hội thoại' });
          return;
        }

        const forwardRes = await forwardReplyToPlatform({
          page: result.page,
          customer: result.customer,
          accessToken: result.page?.accessToken,
          refreshToken: result.page?.refreshToken,
          text: result.message.content,
          imageUrl: result.message.imageUrl,
          fileName: result.message.fileName,
          messageType: result.message.messageType,
          publicBaseUrl: getPublicBaseUrl(req),
          replyAsPublicComment: Boolean(replyAsPublicComment),
          targetCommentExternalId: result.targetCommentExternalId,
          convertCommentToInbox: Boolean(convertCommentToInbox),
        });

        if (forwardRes.refreshedToken && result.page) {
          const updatedPage = await updatePageCredentials(result.page.id, {
            accessToken: forwardRes.refreshedToken.accessToken,
            refreshToken: forwardRes.refreshedToken.refreshToken,
            tokenExpiresAt: forwardRes.refreshedToken.expiresAt ?? null,
          });
          if (updatedPage) io.emit('page:updated', updatedPage);
        }

        io.emit('message:created', result.message);
        io.emit('conversation:updated', result.conversation);
        res.status(201).json({
          message: result.message,
          conversation: result.conversation,
          forwardedToPlatform: forwardRes.sent,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Gửi tin nhắn thất bại',
        });
      }
    }
  );

  app.patch(
    '/api/messages/:id/comment-action',
    requireAuth,
    requirePermission('reply_conversations'),
    async (req, res) => {
      try {
        const { action } = req.body as { action: 'like' | 'toggle_hide' };
        const result = await toggleCommentAction(req.params.id, action);
        if (!result) {
          res.status(404).json({ error: 'Không tìm thấy bình luận' });
          return;
        }

        const forwardedToPlatform = await forwardCommentModerationToPlatform({
          platform: result.page?.platform || 'facebook',
          accessToken: result.page?.accessToken,
          externalCommentId: result.message.externalCommentId,
          action,
          nextState:
            action === 'like'
              ? Boolean(result.message.isLiked)
              : Boolean(result.message.isHidden),
        });

        io.emit('message:updated', result.message);
        res.json({ message: result.message, forwardedToPlatform });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật bình luận',
        });
      }
    }
  );

  // 4. Customer CRM
  app.patch(
    '/api/customers/:id',
    requireAuth,
    requirePermission('reply_conversations'),
    async (req, res) => {
      try {
        const customer = await updateCustomer(req.params.id, req.body);
        if (!customer) {
          res.status(404).json({ error: 'Không tìm thấy khách hàng' });
          return;
        }
        io.emit('customer:updated', customer);
        res.json({ customer });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật khách hàng',
        });
      }
    }
  );

  // 5. Products & Inventory
  app.get('/api/products', requireAuth, async (_req, res) => {
    try {
      const products = await getProducts();
      res.json({ products });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải danh mục sản phẩm',
      });
    }
  });

  app.post(
    '/api/products',
    requireAuth,
    requirePermission('manage_inventory'),
    async (req, res) => {
      try {
        const { name, category, sku, color, size, price, stock, variants } = req.body;
        if (!name?.trim()) {
          res.status(400).json({ error: 'Tên sản phẩm không được để trống' });
          return;
        }
        const product = await addProduct({
          name,
          category: category || 'Chăm sóc da',
          sku: sku || '',
          color: color || 'Mặc định',
          size: size || 'Tiêu chuẩn',
          price: Number(price) || 0,
          stock: Number(stock) || 0,
          variants: Array.isArray(variants) ? variants : undefined,
        });
        io.emit('product:updated', product);
        res.status(201).json({ product });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể thêm sản phẩm',
        });
      }
    }
  );

  app.post(
    '/api/products/:id/variants',
    requireAuth,
    requirePermission('manage_inventory'),
    async (req, res) => {
      try {
        const { sku, color, size, price, stock } = req.body;
        const product = await addProductVariant(req.params.id, {
          sku: String(sku || ''),
          color: String(color || 'Mặc định'),
          size: String(size || 'Tiêu chuẩn'),
          price: Number(price) || 0,
          stock: Number(stock) || 0,
        });
        if (!product) {
          res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
          return;
        }
        io.emit('product:updated', product);
        res.status(201).json({ product });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể thêm biến thể',
        });
      }
    }
  );

  app.post(
    '/api/products/import',
    requireAuth,
    requirePermission('manage_inventory'),
    async (req, res) => {
      try {
        const { csvText } = req.body as { csvText?: string };
        if (!csvText?.trim()) {
          res.status(400).json({ error: 'Nội dung tệp CSV trống' });
          return;
        }
        const parsed = parseProductsCsv(csvText);
        if (parsed.length === 0) {
          res.status(400).json({
            error:
              'Không đọc được sản phẩm hợp lệ từ CSV (kiểm tra cột Tên sản phẩm, Danh mục, SKU, Màu sắc, Kích thước, Giá bán, Tồn kho)',
          });
          return;
        }
        const imported = await importProductsBulk(parsed);
        for (const p of imported) {
          io.emit('product:updated', p);
        }
        res.status(201).json({ products: imported, importedCount: imported.length });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể nhập sản phẩm từ CSV',
        });
      }
    }
  );

  app.patch(
    '/api/products/:id/stock',
    requireAuth,
    requirePermission('manage_inventory'),
    async (req, res) => {
      try {
        const { variantId, stock } = req.body as { variantId: string; stock: number };
        const product = await updateVariantStock(req.params.id, variantId, Number(stock));
        if (!product) {
          res.status(404).json({ error: 'Không tìm thấy sản phẩm hoặc biến thể' });
          return;
        }
        io.emit('product:updated', product);
        res.json({ product });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật tồn kho',
        });
      }
    }
  );

  // 6. Orders (with optional real GHN/GHTK dispatch & auto stock restore on return)
  app.get('/api/orders', requireAuth, async (_req, res) => {
    try {
      const orders = await getOrders();
      res.json({ orders });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể tải đơn hàng',
      });
    }
  });

  app.post(
    '/api/orders',
    requireAuth,
    requirePermission('create_orders'),
    async (req: AuthRequest, res) => {
      try {
        const allProds = await getProducts();
        const itemsPreview = (req.body.items || []).map(
          (i: { productId: string; variantId: string; quantity: number }) => {
            const p = allProds.find((x) => x.id === i.productId);
            const v = p?.variants.find((x) => x.id === i.variantId);
            return {
              productName: p?.name || 'Sản phẩm',
              quantity: i.quantity || 1,
              price: v?.price || 0,
            };
          }
        );
        const subtotal = itemsPreview.reduce(
          (s: number, it: { price: number; quantity: number }) =>
            s + it.price * it.quantity,
          0
        );
        const codTotal = Math.max(
          0,
          subtotal +
            (Number(req.body.shippingFee) || 0) -
            (Number(req.body.discount) || 0)
        );

        const carrierRes = await dispatchOrderToShippingCarrier({
          carrier: req.body.carrier || 'GHN',
          orderCode: `DAU-${Date.now().toString().slice(-4)}`,
          customerName: req.body.customerName || 'Khách hàng',
          customerPhone: req.body.customerPhone || '',
          shippingAddress: req.body.shippingAddress || '',
          codTotal,
          note: req.body.note || '',
          items: itemsPreview,
        });

        const result = await createOrder({
          ...req.body,
          staffId: req.body.staffId || req.dbUser?.id || 'u1',
          trackingCode: carrierRes.trackingCode,
          carrierSynced: carrierRes.carrierSynced,
        });

        io.emit('order:created', result.order);
        io.emit('customer:updated', result.customer);
        io.emit('conversation:updated', result.conversation);
        io.emit('message:created', result.systemMessage);
        for (const prod of result.updatedProducts) {
          io.emit('product:updated', prod);
        }
        res.status(201).json(result);
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Không thể tạo đơn hàng',
        });
      }
    }
  );

  app.patch(
    '/api/orders/:id/status',
    requireAuth,
    requirePermission('update_order_shipping'),
    async (req, res) => {
      try {
        const { status } = req.body;
        const result = await updateOrderStatus(req.params.id, status);
        if (!result) {
          res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
          return;
        }
        io.emit('order:updated', result.order);
        if (result.customer) {
          io.emit('customer:updated', result.customer);
        }
        for (const prod of result.updatedProducts) {
          io.emit('product:updated', prod);
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật đơn hàng',
        });
      }
    }
  );

  // 7. Automation, Tags, Quick Replies, Team RBAC
  app.patch(
    '/api/settings/automation',
    requireAuth,
    requirePermission('manage_automation'),
    async (req, res) => {
      try {
        const automation = await updateAutomation(req.body);
        io.emit('automation:updated', automation);
        res.json({ automation });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể lưu cấu hình',
        });
      }
    }
  );

  app.post(
    '/api/tags',
    requireAuth,
    requirePermission('manage_automation'),
    async (req, res) => {
      try {
        const { name, color } = req.body;
        if (!name?.trim()) {
          res.status(400).json({ error: 'Tên thẻ không được để trống' });
          return;
        }
        const tag = await addTag(name, color || '#4A69BB');
        io.emit('tag:created', tag);
        res.status(201).json({ tag });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể tạo thẻ màu',
        });
      }
    }
  );

  app.delete(
    '/api/tags/:id',
    requireAuth,
    requirePermission('manage_automation'),
    async (req, res) => {
      try {
        await deleteTag(req.params.id);
        io.emit('tag:deleted', { id: req.params.id });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể xóa thẻ màu',
        });
      }
    }
  );

  app.post(
    '/api/quick-replies',
    requireAuth,
    requirePermission('manage_automation'),
    async (req, res) => {
      try {
        const { shortcut, title, content, category } = req.body;
        if (!shortcut?.trim() || !content?.trim()) {
          res.status(400).json({ error: 'Vui lòng nhập phím tắt và nội dung mẫu' });
          return;
        }
        const quickReply = await addQuickReply({
          shortcut,
          title: title || shortcut,
          content,
          category: category || 'Chung',
        });
        io.emit('quick_reply:created', quickReply);
        res.status(201).json({ quickReply });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể thêm mẫu trả lời nhanh',
        });
      }
    }
  );

  app.delete(
    '/api/quick-replies/:id',
    requireAuth,
    requirePermission('manage_automation'),
    async (req, res) => {
      try {
        await deleteQuickReply(req.params.id);
        io.emit('quick_reply:deleted', { id: req.params.id });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Không thể xóa mẫu trả lời nhanh',
        });
      }
    }
  );

  app.patch('/api/users/:id/online', requireAuth, async (req, res) => {
    try {
      const user = await toggleStaffOnline(req.params.id, Boolean(req.body.online));
      if (!user) {
        res.status(404).json({ error: 'Không tìm thấy nhân viên' });
        return;
      }
      io.emit('user:updated', user);
      res.json({ user });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể cập nhật trạng thái trực ca',
      });
    }
  });

  // Real Team RBAC Management (Owner only)
  app.post(
    '/api/users/invite',
    requireAuth,
    requirePermission('manage_rbac'),
    async (req, res) => {
      try {
        const { name, email, role, allowedPageIds } = req.body as {
          name?: string;
          email: string;
          role: UserRole;
          allowedPageIds?: string[];
        };
        const user = await inviteOrAddStaff({
          name: name || '',
          email,
          role: role || 'sale',
          allowedPageIds: allowedPageIds || [],
        });
        io.emit('user:updated', user);
        res.status(201).json({ user });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Không thể mời nhân viên',
        });
      }
    }
  );

  app.patch(
    '/api/users/:id/access',
    requireAuth,
    requirePermission('manage_rbac'),
    async (req, res) => {
      try {
        const { role, allowedPageIds } = req.body as {
          role?: UserRole;
          allowedPageIds?: string[];
        };
        const user = await updateStaffAccess(req.params.id, { role, allowedPageIds });
        if (!user) {
          res.status(404).json({ error: 'Không tìm thấy nhân viên' });
          return;
        }
        io.emit('user:updated', user);
        res.json({ user });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Không thể cập nhật phân quyền',
        });
      }
    }
  );

  app.delete(
    '/api/users/:id',
    requireAuth,
    requirePermission('manage_rbac'),
    async (req, res) => {
      try {
        const ok = await deleteStaffMember(req.params.id);
        if (!ok) {
          res.status(404).json({ error: 'Không tìm thấy nhân viên' });
          return;
        }
        io.emit('user:deleted', { id: req.params.id });
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Không thể xóa nhân viên',
        });
      }
    }
  );

  app.post('/api/notifications/read-all', requireAuth, async (_req, res) => {
    try {
      const notifications = await markNotificationsRead();
      res.json({ notifications });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể cập nhật thông báo',
      });
    }
  });

  // 8. Dedicated Bot Local REST API (authenticated via X-Bot-Api-Key)
  app.get('/api/bot/conversations', requireBotKey, async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      const unreadOnly = req.query.unreadOnly === 'true';
      const platform =
        typeof req.query.platform === 'string'
          ? (req.query.platform as PlatformType)
          : undefined;
      const items = await getBotConversations({ limit, unreadOnly, platform });
      res.json({ items });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi tải hội thoại cho Bot',
      });
    }
  });

  app.post('/api/bot/messages', requireBotKey, async (req, res) => {
    try {
      const { conversationId, content, imageUrl, force, replyAsPublicComment } =
        req.body as {
          conversationId: string;
          content?: string;
          imageUrl?: string;
          force?: boolean;
          replyAsPublicComment?: boolean;
        };
      if (!conversationId || (!content?.trim() && !imageUrl)) {
        res.status(400).json({ error: 'Thiếu conversationId hoặc nội dung tin nhắn' });
        return;
      }

      // Check botPaused before letting bot reply unless force=true
      const existingList = await getBotConversations({ limit: 100 });
      const target = existingList.find((x) => x.conversation.id === conversationId);
      if (!target) {
        res.status(404).json({ error: 'Không tìm thấy hội thoại' });
        return;
      }
      if (target.conversation.botPaused && !force) {
        res.status(409).json({
          error: 'Hội thoại đang tạm dừng Bot (nhân viên đang chăm sóc trực tiếp)',
          botPaused: true,
        });
        return;
      }

      const result = await addStaffMessage({
        conversationId,
        staffId: 'u1',
        content: content?.trim() || '',
        messageType: imageUrl ? 'image' : 'text',
        imageUrl,
        replyAsPublicComment,
        isBotReply: true,
      });
      if (!result) {
        res.status(404).json({ error: 'Không tìm thấy hội thoại' });
        return;
      }

      const forwardRes = await forwardReplyToPlatform({
        page: result.page,
        customer: result.customer,
        accessToken: result.page?.accessToken,
        refreshToken: result.page?.refreshToken,
        text: result.message.content,
        imageUrl: result.message.imageUrl,
        fileName: result.message.fileName,
        messageType: result.message.messageType,
        publicBaseUrl: getPublicBaseUrl(req),
        replyAsPublicComment: Boolean(replyAsPublicComment),
        targetCommentExternalId: result.targetCommentExternalId,
      });

      if (forwardRes.refreshedToken && result.page) {
        const updatedPage = await updatePageCredentials(result.page.id, {
          accessToken: forwardRes.refreshedToken.accessToken,
          refreshToken: forwardRes.refreshedToken.refreshToken,
          tokenExpiresAt: forwardRes.refreshedToken.expiresAt ?? null,
        });
        if (updatedPage) io.emit('page:updated', updatedPage);
      }

      io.emit('message:created', result.message);
      io.emit('conversation:updated', result.conversation);
      res.status(201).json({
        message: result.message,
        conversation: result.conversation,
        forwardedToPlatform: forwardRes.sent,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Bot gửi tin nhắn thất bại',
      });
    }
  });

  app.patch('/api/bot/conversations/:id/bot-pause', requireBotKey, async (req, res) => {
    try {
      const conv = await updateConversation(req.params.id, {
        botPaused: Boolean(req.body.botPaused),
      });
      if (!conv) {
        res.status(404).json({ error: 'Không tìm thấy hội thoại' });
        return;
      }
      io.emit('conversation:updated', conv);
      res.json({ conversation: conv });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không thể cập nhật trạng thái Bot',
      });
    }
  });

  // 9. Public Webhook Receiver & Verification for Social Platforms
  app.use('/api/webhooks', (_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Hub-Signature-256'
    );
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/webhooks/:platform', async (req, res) => {
    try {
      const expectedToken = await getWebhookVerifyToken();
      const check = verifyWebhookChallenge(
        req.query['hub.mode'],
        req.query['hub.verify_token'],
        req.query['hub.challenge'],
        expectedToken
      );
      res.status(check.status).send(check.body);
    } catch {
      res.status(500).send('Lỗi xác thực Webhook');
    }
  });

  // Shipping carrier status callback (GHN / GHTK)
  app.post('/api/webhooks/shipping/:carrier', async (req, res) => {
    try {
      const trackingCode =
        req.body.OrderCode ||
        req.body.label_id ||
        req.body.trackingCode ||
        req.body.tracking_code;
      const rawStatus = String(
        req.body.Status || req.body.status_id || req.body.status || ''
      ).toLowerCase();

      if (!trackingCode) {
        res.status(400).json({ error: 'Thiếu mã vận đơn (OrderCode / label_id)' });
        return;
      }

      let mappedStatus: OrderStatus | null = null;
      if (['delivered', '5', '6'].includes(rawStatus)) mappedStatus = 'delivered';
      else if (['return', 'returned', '9', '10', '11', '-1'].includes(rawStatus))
        mappedStatus = 'returned';
      else if (['delivering', 'picking', 'picked', 'storing', '3', '4'].includes(rawStatus))
        mappedStatus = 'shipping';

      if (!mappedStatus) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }

      const result = await updateOrderStatusByTrackingCode(String(trackingCode), mappedStatus);
      if (result) {
        io.emit('order:updated', result.order);
        if (result.customer) io.emit('customer:updated', result.customer);
        for (const prod of result.updatedProducts) io.emit('product:updated', prod);
      }
      res.json({ ok: true, updated: Boolean(result) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi webhook vận chuyển',
      });
    }
  });

  app.post('/api/webhooks/:platform', async (req, res) => {
    try {
      const platform = req.params.platform as PlatformType;

      // Verify Meta X-Hub-Signature-256 when META_APP_SECRET is set
      if (
        (platform === 'facebook' || platform === 'instagram') &&
        process.env.META_APP_SECRET
      ) {
        const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
        const sig = req.headers['x-hub-signature-256'];
        const sigStr = typeof sig === 'string' ? sig : undefined;
        if (!verifyMetaSignature(rawBody, sigStr, process.env.META_APP_SECRET)) {
          res.status(403).json({ error: 'Chữ ký X-Hub-Signature-256 không hợp lệ' });
          return;
        }
      }

      const events = parseIncomingWebhookPayload(platform, req.body);

      if (events.length === 0) {
        if (req.body && Array.isArray(req.body.entry)) {
          res.status(200).json({ status: 'EVENT_RECEIVED', eventsCount: 0 });
          return;
        }
        res.status(400).json({ error: 'Thiếu nội dung sự kiện webhook' });
        return;
      }

      let lastResult: Awaited<ReturnType<typeof receiveWebhookEvent>> | null = null;
      for (const ev of events) {
        const result = await receiveWebhookEvent(ev);
        lastResult = result;
        if (result.deduplicated) continue;

        // Enrich customer real name & avatar from Meta / Zalo if placeholder
        if (
          result.pageAccessToken &&
          result.customer.externalId &&
          result.customer.fullName.startsWith('Khách ')
        ) {
          const profile = await fetchPlatformCustomerProfile(
            result.page.platform,
            result.customer.externalId,
            result.pageAccessToken
          );
          if (profile?.fullName || profile?.avatarUrl) {
            const updatedCust = await updateCustomer(result.customer.id, {
              fullName: profile.fullName,
              avatarUrl: profile.avatarUrl,
            });
            if (updatedCust) {
              result.customer = updatedCust;
            }
          }
        }

        // Forward auto comment reply out to Facebook / Instagram when token exists
        if (result.autoReplyText && result.pageAccessToken && ev.externalCommentId) {
          void forwardReplyToPlatform({
            page: result.page,
            customer: result.customer,
            accessToken: result.pageAccessToken,
            text: result.autoReplyText,
            replyAsPublicComment: true,
            targetCommentExternalId: ev.externalCommentId,
          });
        }

        // Dispatch outbound webhook to user's external Bot Local if not paused
        if (!result.conversation.botPaused && result.botConfig?.outboundWebhookUrl) {
          void dispatchOutboundBotWebhook({
            outboundWebhookUrl: result.botConfig.outboundWebhookUrl,
            botApiKey: result.botConfig.botApiKey,
            event: 'message.received',
            payload: {
              page: result.page,
              conversation: result.conversation,
              customer: result.customer,
              messages: result.messages,
            },
          });
        }

        io.emit('page:updated', result.page);
        io.emit('customer:updated', result.customer);
        io.emit('conversation:updated', result.conversation);
        for (const msg of result.messages) {
          io.emit('message:created', msg);
        }
        if (result.notification) {
          io.emit('notification:created', result.notification);
        }
      }

      res.status(200).json({
        status: 'EVENT_RECEIVED',
        eventsCount: events.length,
        ...(lastResult
          ? {
              page: lastResult.page,
              conversation: lastResult.conversation,
              customer: lastResult.customer,
              messages: lastResult.messages,
              notification: lastResult.notification,
            }
          : {}),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi xử lý sự kiện webhook',
      });
    }
  });

  // 10. Website Livechat Embeddable Widget Endpoints (CORS open for customer websites)
  app.get('/api/widget/history/:pageId', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    try {
      const visitorId =
        typeof req.query.visitorId === 'string' ? req.query.visitorId : '';
      if (!visitorId) {
        res.json({ messages: [] });
        return;
      }
      const history = await getWidgetConversationHistory(req.params.pageId, visitorId);
      res.json({ messages: history });
    } catch {
      res.status(500).json({ messages: [] });
    }
  });

  app.get('/widget.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const baseUrl = getPublicBaseUrl(req);
    res.send(`(function(){
  var s=document.currentScript;
  var pageId=(s&&s.getAttribute('data-page-id'))||'page_web_1';
  var base='${baseUrl}';
  var vid=localStorage.getItem('dauto_vid')||('web_'+Math.random().toString(36).slice(2,10));
  localStorage.setItem('dauto_vid',vid);
  var open=false;
  var box=document.createElement('div');
  box.style.cssText='position:fixed;bottom:20px;right:20px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;';
  box.innerHTML='<div id="dauto-w-win" style="display:none;width:320px;height:420px;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);border:1px solid #e2e8f0;overflow:hidden;margin-bottom:12px;flex-direction:column;">'
    +'<div style="background:#4A69BB;color:#fff;padding:12px 14px;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center;"><span>Hỗ trợ trực tuyến</span><button id="dauto-w-close" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✕</button></div>'
    +'<div id="dauto-w-msgs" style="flex:1;overflow-y:auto;padding:12px;background:#F0F2F5;font-size:13px;display:flex;flex-direction:column;gap:8px;"></div>'
    +'<form id="dauto-w-form" style="display:flex;gap:6px;padding:10px;border-top:1px solid #e2e8f0;background:#fff;"><input id="dauto-w-inp" placeholder="Nhập tin nhắn..." style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;"/><button type="submit" style="background:#4A69BB;color:#fff;border:none;border-radius:8px;padding:0 12px;font-weight:600;cursor:pointer;">Gửi</button></form>'
    +'</div><button id="dauto-w-btn" style="width:52px;height:52px;border-radius:999px;background:#4A69BB;color:#fff;border:none;box-shadow:0 6px 18px rgba(74,105,187,.4);font-weight:700;cursor:pointer;float:right;">Chat</button>';
  document.body.appendChild(box);
  var win=document.getElementById('dauto-w-win');
  var msgs=document.getElementById('dauto-w-msgs');
  function load(){
    fetch(base+'/api/widget/history/'+encodeURIComponent(pageId)+'?visitorId='+encodeURIComponent(vid))
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d.messages)return;
        msgs.innerHTML='';
        d.messages.forEach(function(m){
          var div=document.createElement('div');
          var isMe=m.senderType==='customer';
          div.style.cssText='max-width:82%;padding:8px 11px;border-radius:10px;align-self:'+(isMe?'flex-end':'flex-start')+';background:'+(isMe?'#4A69BB':'#fff')+';color:'+(isMe?'#fff':'#0f172a')+';';
          div.textContent=m.content;
          msgs.appendChild(div);
        });
        msgs.scrollTop=msgs.scrollHeight;
      }).catch(function(){});
  }
  document.getElementById('dauto-w-btn').onclick=function(){open=!open;win.style.display=open?'flex':'none';if(open)load();};
  document.getElementById('dauto-w-close').onclick=function(){open=false;win.style.display='none';};
  document.getElementById('dauto-w-form').onsubmit=function(e){
    e.preventDefault();
    var inp=document.getElementById('dauto-w-inp');
    var txt=(inp.value||'').trim();
    if(!txt)return;
    inp.value='';
    fetch(base+'/api/webhooks/website',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:pageId,senderExternalId:vid,customerName:'Khách Website '+vid.slice(-4),channelType:'inbox',content:txt})})
      .then(function(){load();});
  };
  setInterval(function(){if(open)load();},4000);
})();`);
  });

  // Vite / Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReady = createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled,
        ws: hmrEnabled ? undefined : false,
      },
      appType: 'spa',
    }).then((vite) => {
      viteMiddleware = vite.middlewares;
      return vite;
    });

    app.use(async (req, res, next) => {
      try {
        if (!viteMiddleware) {
          await viteReady;
        }
        if (viteMiddleware) {
          viteMiddleware(req, res, next);
        } else {
          next();
        }
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const portArgIdx = process.argv.indexOf('--port');
  const cliPort =
    portArgIdx >= 0 && process.argv[portArgIdx + 1]
      ? Number(process.argv[portArgIdx + 1])
      : 0;
  const port = cliPort || Number(process.env.PORT) || 3000;

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`dauto server listening on http://localhost:${port}`);
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start dauto server:', err);
  process.exit(1);
});
