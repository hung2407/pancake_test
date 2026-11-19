import crypto from 'node:crypto';
import type {
  ConnectedPage,
  Conversation,
  Customer,
  Message,
  Order,
  ShippingCarrier,
} from '../types/schema.ts';

/**
 * Verifies Meta's X-Hub-Signature-256 header against raw JSON payload bytes.
 * Only enforced when META_APP_SECRET is configured in environment variables.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  const secret = appSecret?.trim();
  if (!secret) return true;
  if (!rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Looks up customer full name & avatar from Meta Graph API or Zalo OA API when webhook
 * only delivered an external user ID and placeholder name.
 */
export async function fetchPlatformCustomerProfile(
  platform: string,
  externalUserId: string | undefined,
  accessToken: string | null | undefined
): Promise<{ fullName?: string; avatarUrl?: string } | null> {
  if (!externalUserId || !accessToken) return null;
  try {
    if (platform === 'facebook' || platform === 'instagram') {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(
          externalUserId
        )}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(
          accessToken
        )}`
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        name?: string;
        first_name?: string;
        last_name?: string;
        profile_pic?: string;
      };
      const fullName =
        data.name?.trim() ||
        [data.first_name, data.last_name].filter(Boolean).join(' ').trim() ||
        undefined;
      return {
        fullName,
        avatarUrl: data.profile_pic || undefined,
      };
    }

    if (platform === 'zalo') {
      const dataParam = encodeURIComponent(JSON.stringify({ user_id: externalUserId }));
      const resp = await fetch(
        `https://openapi.zalo.me/v2.0/oa/getprofile?data=${dataParam}`,
        {
          headers: { access_token: accessToken },
        }
      );
      if (!resp.ok) return null;
      const payload = (await resp.json()) as {
        error?: number;
        data?: { display_name?: string; avatar?: string };
      };
      if (payload.error && payload.error !== 0) return null;
      return {
        fullName: payload.data?.display_name?.trim() || undefined,
        avatarUrl: payload.data?.avatar || undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Signs Shopee Open Platform v2 API requests using HMAC-SHA256.
 * Base string: partner_id + path + timestamp (+ access_token + shop_id when present)
 */
export function signShopeeRequest(params: {
  partnerId: string;
  partnerKey: string;
  apiPath: string;
  timestamp: number;
  accessToken?: string;
  shopId?: string;
}): string {
  const baseString = `${params.partnerId}${params.apiPath}${params.timestamp}${
    params.accessToken || ''
  }${params.shopId || ''}`;
  return crypto
    .createHmac('sha256', params.partnerKey)
    .update(baseString)
    .digest('hex');
}

/**
 * Signs TikTok Shop Open API requests using HMAC-SHA256.
 */
export function signTikTokShopRequest(params: {
  appSecret: string;
  apiPath: string;
  queryParams: Record<string, string | number>;
  body?: string;
}): string {
  const keys = Object.keys(params.queryParams)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort();
  const concatenated = keys
    .map((k) => `${k}${params.queryParams[k]}`)
    .join('');
  const input = `${params.appSecret}${params.apiPath}${concatenated}${
    params.body || ''
  }${params.appSecret}`;
  return crypto
    .createHmac('sha256', params.appSecret)
    .update(input)
    .digest('hex');
}

/**
 * Refreshes Zalo OA v4 access token using refresh_token + ZALO_APP_ID + ZALO_APP_SECRET.
 */
export async function refreshZaloAccessToken(params: {
  refreshToken: string;
  appId?: string;
  appSecret?: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
} | null> {
  const appId = params.appId?.trim() || process.env.ZALO_APP_ID?.trim();
  const appSecret = params.appSecret?.trim() || process.env.ZALO_APP_SECRET?.trim();
  const refreshToken =
    params.refreshToken?.trim() || process.env.ZALO_REFRESH_TOKEN?.trim();

  if (!appId || !appSecret || !refreshToken) return null;

  try {
    const body = new URLSearchParams({
      app_id: appId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const resp = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: appSecret,
      },
      body: body.toString(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: string | number;
      error?: number;
    };
    if (!data.access_token || (data.error && data.error !== 0)) return null;
    const expiresSec = Number(data.expires_in) || 90000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: expiresSec,
      expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Exchanges Facebook OAuth authorization code for User Token and managed Fanpages.
 */
export async function exchangeFacebookOAuthCode(params: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<{
  pages: {
    externalId: string;
    name: string;
    handle: string;
    accessToken: string;
  }[];
}> {
  const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id', params.appId);
  tokenUrl.searchParams.set('client_secret', params.appSecret);
  tokenUrl.searchParams.set('redirect_uri', params.redirectUri);
  tokenUrl.searchParams.set('code', params.code);

  const tokenResp = await fetch(tokenUrl.toString());
  const tokenJson = (await tokenResp.json()) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!tokenResp.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error?.message || 'Không thể đổi mã OAuth lấy Facebook User Token'
    );
  }

  const pagesResp = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,username&access_token=${encodeURIComponent(
      tokenJson.access_token
    )}`
  );
  const pagesJson = (await pagesResp.json()) as {
    data?: { id: string; name: string; access_token?: string; username?: string }[];
    error?: { message?: string };
  };
  if (!pagesResp.ok) {
    throw new Error(
      pagesJson.error?.message || 'Không thể lấy danh sách Fanpage từ Facebook'
    );
  }

  return {
    pages: (pagesJson.data ?? [])
      .filter((p) => p.id && p.access_token)
      .map((p) => ({
        externalId: String(p.id),
        name: p.name || `Fanpage ${p.id}`,
        handle: p.username ? `@${p.username}` : `fb.com/${p.id}`,
        accessToken: p.access_token!,
      })),
  };
}

/**
 * Exchanges Zalo OA v4 authorization code for OA Access Token, Refresh Token, and OA metadata.
 */
export async function exchangeZaloOAuthCode(params: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<{
  externalId: string;
  name: string;
  handle: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}> {
  const body = new URLSearchParams({
    app_id: params.appId,
    grant_type: 'authorization_code',
    code: params.code,
  });
  const tokenResp = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: params.appSecret,
    },
    body: body.toString(),
  });
  const tokenJson = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: number;
    error_description?: string;
  };
  if (!tokenResp.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description || 'Không thể lấy Zalo OA Access Token từ OAuth code'
    );
  }

  const expiresSec = Number(tokenJson.expires_in) || 90000;
  const expiresAt = new Date(Date.now() + expiresSec * 1000).toISOString();

  let oaId = `zalo_${Date.now()}`;
  let oaName = 'Zalo Official Account';
  try {
    const infoResp = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: tokenJson.access_token },
    });
    if (infoResp.ok) {
      const infoJson = (await infoResp.json()) as {
        error?: number;
        data?: { oa_id?: string | number; name?: string };
      };
      if (infoJson.data?.oa_id) oaId = String(infoJson.data.oa_id);
      if (infoJson.data?.name) oaName = infoJson.data.name;
    }
  } catch {
    // Keep fallback OA name if getoa fails
  }

  return {
    externalId: oaId,
    name: oaName,
    handle: `OA ID: ${oaId}`,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
  };
}

export interface SyncedHistoricalThread {
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
}

/**
 * Fetches recent historical conversations and messages from Meta Graph API or Zalo OA v2.
 */
export async function fetchHistoricalConversations(params: {
  page: ConnectedPage;
  accessToken: string;
}): Promise<SyncedHistoricalThread[]> {
  const { page, accessToken } = params;
  if (!accessToken) {
    throw new Error('Trang chưa được cấu hình Page Access Token thật');
  }

  if (page.platform === 'facebook' || page.platform === 'instagram') {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      page.externalId
    )}/conversations?fields=id,updated_time,participants,messages.limit(20){id,message,from,created_time,attachments}&limit=20&access_token=${encodeURIComponent(
      accessToken
    )}`;
    const resp = await fetch(url);
    const json = (await resp.json()) as {
      data?: Array<{
        id: string;
        participants?: { data?: Array<{ id?: string; name?: string }> };
        messages?: {
          data?: Array<{
            id: string;
            message?: string;
            created_time?: string;
            from?: { id?: string; name?: string };
            attachments?: { data?: Array<{ image_data?: { url?: string }; file_url?: string }> };
          }>;
        };
      }>;
      error?: { message?: string };
    };

    if (!resp.ok) {
      throw new Error(
        json.error?.message ||
          'Meta Graph API từ chối truy vấn lịch sử hội thoại (kiểm tra Token & quyền pages_messaging)'
      );
    }

    const threads: SyncedHistoricalThread[] = [];
    for (const conv of json.data ?? []) {
      const participants = conv.participants?.data ?? [];
      const customerPart =
        participants.find((p) => p.id && p.id !== page.externalId) ?? participants[0];
      const custExtId = customerPart?.id || conv.id;
      const custName = customerPart?.name || `Khách #${String(custExtId).slice(-4)}`;

      const msgs = (conv.messages?.data ?? [])
        .map((m) => {
          const fromId = m.from?.id;
          const isStaff = fromId === page.externalId;
          const att = m.attachments?.data?.[0];
          const imageUrl = att?.image_data?.url || att?.file_url || undefined;
          const content =
            m.message?.trim() || (imageUrl ? '[Hình ảnh / Tệp đính kèm]' : '');
          if (!content && !imageUrl) return null;
          return {
            externalMessageId: m.id,
            senderType: (isStaff ? 'staff' : 'customer') as 'staff' | 'customer',
            senderName: m.from?.name || (isStaff ? page.name : custName),
            content,
            imageUrl,
            createdAt: m.created_time || new Date().toISOString(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .reverse();

      if (msgs.length > 0) {
        threads.push({
          customerExternalId: String(custExtId),
          customerName: custName,
          channelType: 'inbox',
          messages: msgs,
        });
      }
    }
    return threads;
  }

  if (page.platform === 'zalo') {
    const dataParam = encodeURIComponent(JSON.stringify({ offset: 0, count: 20 }));
    const resp = await fetch(
      `https://openapi.zalo.me/v2.0/oa/listrecentchat?data=${dataParam}`,
      { headers: { access_token: accessToken } }
    );
    const json = (await resp.json()) as {
      error?: number;
      message?: string;
      data?: Array<{
        message_id?: string;
        from_id?: string;
        to_id?: string;
        from_display_name?: string;
        to_display_name?: string;
        message?: string;
        thumb?: string;
        url?: string;
        time?: number;
        src?: number;
      }>;
    };
    if (!resp.ok || (json.error && json.error !== 0)) {
      throw new Error(
        json.message || 'Zalo OA API từ chối đồng bộ tin nhắn gần đây'
      );
    }

    const byCustomer = new Map<string, SyncedHistoricalThread>();
    for (const item of json.data ?? []) {
      const isFromOa = item.src === 0 || String(item.from_id) === page.externalId;
      const custExtId = String(isFromOa ? item.to_id : item.from_id || '');
      if (!custExtId) continue;
      const custName =
        (isFromOa ? item.to_display_name : item.from_display_name)?.trim() ||
        `Khách Zalo #${custExtId.slice(-4)}`;

      let thread = byCustomer.get(custExtId);
      if (!thread) {
        thread = {
          customerExternalId: custExtId,
          customerName: custName,
          channelType: 'inbox',
          messages: [],
        };
        byCustomer.set(custExtId, thread);
      }
      const imageUrl = item.url || item.thumb || undefined;
      const content =
        item.message?.trim() || (imageUrl ? '[Hình ảnh Zalo]' : '[Tin nhắn Zalo]');
      thread.messages.push({
        externalMessageId:
          item.message_id || `z_sync_${custExtId}_${item.time || Date.now()}`,
        senderType: isFromOa ? 'staff' : 'customer',
        senderName: isFromOa ? page.name : custName,
        content,
        imageUrl,
        createdAt: item.time
          ? new Date(item.time).toISOString()
          : new Date().toISOString(),
      });
    }

    return Array.from(byCustomer.values()).map((t) => ({
      ...t,
      messages: t.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }

  throw new Error(
    `Nền tảng ${page.platform} hiện chưa hỗ trợ kéo lịch sử trực tiếp qua API.`
  );
}

/**
 * Forwards staff/bot replies (text, images, file attachments, comment replies,
 * private inbox from comment, Shopee SellerChat, TikTok Shop CS, and Zalo OA v3 with auto-refresh)
 * to external platforms when real credentials are configured.
 */
export async function forwardReplyToPlatform(params: {
  page: ConnectedPage | undefined;
  customer: Customer | undefined;
  accessToken: string | null | undefined;
  refreshToken?: string | null;
  text: string;
  imageUrl?: string;
  fileName?: string;
  messageType?: 'text' | 'image' | 'comment' | 'file';
  publicBaseUrl?: string;
  replyAsPublicComment?: boolean;
  targetCommentExternalId?: string;
  convertCommentToInbox?: boolean;
}): Promise<{
  sent: boolean;
  refreshedToken?: { accessToken: string; refreshToken?: string; expiresAt?: string };
}> {
  const {
    page,
    customer,
    accessToken,
    refreshToken,
    text,
    imageUrl,
    fileName,
    messageType,
    publicBaseUrl,
    replyAsPublicComment,
    targetCommentExternalId,
    convertCommentToInbox,
  } = params;

  if (!page || !accessToken) return { sent: false };

  const resolvedMediaUrl =
    imageUrl && imageUrl.startsWith('http')
      ? imageUrl
      : imageUrl && imageUrl.startsWith('/') && publicBaseUrl?.startsWith('http')
        ? `${publicBaseUrl.replace(/\/$/, '')}${imageUrl}`
        : undefined;

  const isFileAttachment = messageType === 'file';

  try {
    // 1. Public comment reply on Facebook / Instagram
    if (
      (page.platform === 'facebook' || page.platform === 'instagram') &&
      replyAsPublicComment &&
      targetCommentExternalId &&
      text.trim()
    ) {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(
          targetCommentExternalId
        )}/comments?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            ...(resolvedMediaUrl && !isFileAttachment
              ? { attachment_url: resolvedMediaUrl }
              : {}),
          }),
        }
      );
      return { sent: resp.ok };
    }

    // 2. Meta Messenger / Instagram DM (including private reply from comment_id & file attachment)
    if (page.platform === 'facebook' || page.platform === 'instagram') {
      const recipient =
        convertCommentToInbox && targetCommentExternalId
          ? { comment_id: targetCommentExternalId }
          : customer?.externalId
            ? { id: customer.externalId }
            : null;
      if (!recipient) return { sent: false };

      let sentAny = false;
      if (resolvedMediaUrl) {
        const mediaResp = await fetch(
          `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(
            accessToken
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient,
              messaging_type: 'RESPONSE',
              message: {
                attachment: {
                  type: isFileAttachment ? 'file' : 'image',
                  payload: { url: resolvedMediaUrl, is_reusable: true },
                },
              },
            }),
          }
        );
        sentAny = mediaResp.ok;
      }

      if (text.trim()) {
        const textResp = await fetch(
          `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(
            accessToken
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient,
              messaging_type: 'RESPONSE',
              message: { text: text.trim() },
            }),
          }
        );
        sentAny = textResp.ok || sentAny;
      }
      return { sent: sentAny };
    }

    // 3. Zalo OA v3 CS message with automatic token refresh retry on -216 / 401
    if (page.platform === 'zalo' && customer?.externalId) {
      const sendZaloOnce = async (token: string) => {
        if (resolvedMediaUrl && !isFileAttachment) {
          const resp = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              access_token: token,
            },
            body: JSON.stringify({
              recipient: { user_id: customer.externalId },
              message: {
                text: text.trim() || undefined,
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'media',
                    elements: [{ media_type: 'image', url: resolvedMediaUrl }],
                  },
                },
              },
            }),
          });
          const bodyJson = (await resp.json().catch(() => ({}))) as { error?: number };
          return {
            ok: resp.ok && (!bodyJson.error || bodyJson.error === 0),
            expired: resp.status === 401 || bodyJson.error === -216,
          };
        }

        const msgText =
          isFileAttachment && resolvedMediaUrl
            ? `${text.trim() || `Tài liệu: ${fileName || 'Tệp đính kèm'}`}\nTải tệp: ${resolvedMediaUrl}`
            : text.trim();
        if (!msgText) return { ok: false, expired: false };

        const resp = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: token,
          },
          body: JSON.stringify({
            recipient: { user_id: customer.externalId },
            message: { text: msgText },
          }),
        });
        const bodyJson = (await resp.json().catch(() => ({}))) as { error?: number };
        return {
          ok: resp.ok && (!bodyJson.error || bodyJson.error === 0),
          expired: resp.status === 401 || bodyJson.error === -216,
        };
      };

      const firstAttempt = await sendZaloOnce(accessToken);
      if (firstAttempt.ok) return { sent: true };

      if (firstAttempt.expired && (refreshToken || process.env.ZALO_REFRESH_TOKEN)) {
        const refreshed = await refreshZaloAccessToken({
          refreshToken: refreshToken || process.env.ZALO_REFRESH_TOKEN || '',
        });
        if (refreshed?.accessToken) {
          const retry = await sendZaloOnce(refreshed.accessToken);
          return {
            sent: retry.ok,
            refreshedToken: {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              expiresAt: refreshed.expiresAt,
            },
          };
        }
      }
      return { sent: false };
    }

    // 4. Shopee SellerChat Open API v2
    if (
      page.platform === 'shopee' &&
      process.env.SHOPEE_PARTNER_ID &&
      process.env.SHOPEE_PARTNER_KEY &&
      customer?.externalId
    ) {
      const apiPath = '/api/v2/sellerchat/send_message';
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = process.env.SHOPEE_PARTNER_ID.trim();
      const sign = signShopeeRequest({
        partnerId,
        partnerKey: process.env.SHOPEE_PARTNER_KEY.trim(),
        apiPath,
        timestamp,
        accessToken,
        shopId: page.externalId,
      });
      const host =
        process.env.SHOPEE_API_HOST?.trim() || 'https://partner.shopeemobile.com';
      const url = `${host}${apiPath}?partner_id=${encodeURIComponent(
        partnerId
      )}&timestamp=${timestamp}&access_token=${encodeURIComponent(
        accessToken
      )}&shop_id=${encodeURIComponent(page.externalId)}&sign=${sign}`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_id: Number(customer.externalId) || customer.externalId,
          message_type: resolvedMediaUrl && !isFileAttachment ? 'image' : 'text',
          content:
            resolvedMediaUrl && !isFileAttachment
              ? { image_url: resolvedMediaUrl }
              : {
                  text:
                    isFileAttachment && resolvedMediaUrl
                      ? `${text.trim()} ${resolvedMediaUrl}`
                      : text.trim(),
                },
        }),
      });
      return { sent: resp.ok };
    }

    // 5. TikTok Shop Customer Service Open API
    if (
      page.platform === 'tiktok' &&
      process.env.TIKTOK_SHOP_APP_KEY &&
      process.env.TIKTOK_SHOP_APP_SECRET &&
      customer?.externalId
    ) {
      const appKey = process.env.TIKTOK_SHOP_APP_KEY.trim();
      const appSecret = process.env.TIKTOK_SHOP_APP_SECRET.trim();
      const timestamp = Math.floor(Date.now() / 1000);
      const apiPath = `/customer_service/202309/conversations/${encodeURIComponent(
        customer.externalId
      )}/messages`;
      const queryParams: Record<string, string | number> = {
        app_key: appKey,
        timestamp,
        ...(page.externalId ? { shop_cipher: page.externalId } : {}),
      };
      const bodyStr = JSON.stringify({
        type: resolvedMediaUrl && !isFileAttachment ? 'IMAGE' : 'TEXT',
        content: JSON.stringify(
          resolvedMediaUrl && !isFileAttachment
            ? { url: resolvedMediaUrl }
            : {
                content:
                  isFileAttachment && resolvedMediaUrl
                    ? `${text.trim()} ${resolvedMediaUrl}`
                    : text.trim(),
              }
        ),
      });
      const sign = signTikTokShopRequest({
        appSecret,
        apiPath,
        queryParams,
        body: bodyStr,
      });
      const qs = new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(queryParams).map(([k, v]) => [k, String(v)])
        ),
        sign,
      });
      const resp = await fetch(
        `https://open-api.tiktokglobalshop.com${apiPath}?${qs.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tts-access-token': accessToken,
          },
          body: bodyStr,
        }
      );
      return { sent: resp.ok };
    }
  } catch {
    return { sent: false };
  }

  return { sent: false };
}

/**
 * Syncs comment moderation (Like / Hide / Unhide) to Meta Graph API when real token & comment_id exist.
 */
export async function forwardCommentModerationToPlatform(params: {
  platform: string;
  accessToken: string | null | undefined;
  externalCommentId: string | undefined;
  action: 'like' | 'toggle_hide';
  nextState: boolean;
}): Promise<boolean> {
  const { platform, accessToken, externalCommentId, action, nextState } = params;
  if (
    (platform !== 'facebook' && platform !== 'instagram') ||
    !accessToken ||
    !externalCommentId
  ) {
    return false;
  }

  try {
    if (action === 'like') {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(
          externalCommentId
        )}/likes?access_token=${encodeURIComponent(accessToken)}`,
        { method: nextState ? 'POST' : 'DELETE' }
      );
      return resp.ok;
    }

    if (action === 'toggle_hide') {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(
          externalCommentId
        )}?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_hidden: nextState }),
        }
      );
      return resp.ok;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Dispatches an order to real Vietnamese shipping carriers (GHN, GHTK, Viettel Post, J&T Express)
 * when their API tokens are provided in environment variables. Falls back cleanly to local tracking when unconfigured.
 */
export async function dispatchOrderToShippingCarrier(params: {
  carrier: ShippingCarrier;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  codTotal: number;
  note: string;
  items: { productName: string; quantity: number; price: number }[];
}): Promise<{ trackingCode: string; carrierSynced: boolean }> {
  const prefix =
    params.carrier === 'GHN'
      ? 'GHN'
      : params.carrier === 'GHTK'
        ? 'GHTK'
        : params.carrier === 'Viettel Post'
          ? 'VTP'
          : 'JT';
  const fallbackCode = `${prefix}${Math.floor(100000 + Math.random() * 899999)}`;

  try {
    if (params.carrier === 'GHN' && process.env.GHN_TOKEN && process.env.GHN_SHOP_ID) {
      const resp = await fetch(
        'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Token: process.env.GHN_TOKEN,
            ShopId: process.env.GHN_SHOP_ID,
          },
          body: JSON.stringify({
            payment_type_id: 2,
            note: params.note || 'Đơn từ dauto',
            required_note: 'CHOXEMHANGKHONGTHU',
            to_name: params.customerName,
            to_phone: params.customerPhone,
            to_address: params.shippingAddress,
            cod_amount: params.codTotal,
            weight: 300,
            service_type_id: 2,
            items: params.items.map((i) => ({
              name: i.productName,
              quantity: i.quantity,
              price: i.price,
            })),
          }),
        }
      );
      if (resp.ok) {
        const json = (await resp.json()) as { data?: { order_code?: string } };
        if (json.data?.order_code) {
          return { trackingCode: json.data.order_code, carrierSynced: true };
        }
      }
    }

    if (params.carrier === 'GHTK' && process.env.GHTK_TOKEN) {
      const resp = await fetch(
        'https://services.giaohangtietkiem.vn/services/shipment/order',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Token: process.env.GHTK_TOKEN,
          },
          body: JSON.stringify({
            products: params.items.map((i) => ({
              name: i.productName,
              weight: 0.2,
              quantity: i.quantity,
            })),
            order: {
              id: params.orderCode,
              pick_name: process.env.GHTK_PICK_NAME || 'Kho dauto',
              pick_address: process.env.GHTK_PICK_ADDRESS || 'Hà Nội',
              pick_province: process.env.GHTK_PICK_PROVINCE || 'Hà Nội',
              pick_district: process.env.GHTK_PICK_DISTRICT || 'Đống Đa',
              pick_tel: process.env.GHTK_PICK_TEL || '0900000000',
              tel: params.customerPhone,
              name: params.customerName,
              address: params.shippingAddress,
              province: 'TP Hồ Chí Minh',
              district: 'Quận 1',
              ward: 'Phường Bến Nghé',
              hamlet: 'Khác',
              is_freeship: '0',
              pick_money: params.codTotal,
              note: params.note,
            },
          }),
        }
      );
      if (resp.ok) {
        const json = (await resp.json()) as {
          success?: boolean;
          order?: { label?: string };
        };
        if (json.success && json.order?.label) {
          return { trackingCode: json.order.label, carrierSynced: true };
        }
      }
    }

    if (params.carrier === 'Viettel Post' && process.env.VIETTEL_POST_TOKEN) {
      const resp = await fetch(
        'https://partner.viettelpost.vn/v2/order/createOrder',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Token: process.env.VIETTEL_POST_TOKEN,
          },
          body: JSON.stringify({
            ORDER_NUMBER: params.orderCode,
            GROUPADDRESS_ID: Number(process.env.VTP_GROUPADDRESS_ID) || 0,
            RECEIVER_FULLNAME: params.customerName,
            RECEIVER_ADDRESS: params.shippingAddress,
            RECEIVER_PHONE: params.customerPhone,
            PRODUCT_NAME: params.items.map((i) => i.productName).join(', '),
            PRODUCT_QUANTITY: params.items.reduce((s, i) => s + i.quantity, 0),
            PRODUCT_PRICE: params.codTotal,
            PRODUCT_WEIGHT: 300,
            ORDER_PAYMENT: 3,
            ORDER_SERVICE: 'VCN',
            MONEY_COLLECTION: params.codTotal,
            ORDER_NOTE: params.note || 'Đơn từ dauto',
            LIST_ITEM: params.items.map((i) => ({
              PRODUCT_NAME: i.productName,
              PRODUCT_PRICE: i.price,
              PRODUCT_WEIGHT: 150,
              PRODUCT_QUANTITY: i.quantity,
            })),
          }),
        }
      );
      if (resp.ok) {
        const json = (await resp.json()) as {
          status?: number;
          data?: { ORDER_NUMBER?: string };
        };
        if (json.data?.ORDER_NUMBER) {
          return { trackingCode: json.data.ORDER_NUMBER, carrierSynced: true };
        }
      }
    }

    if (
      params.carrier === 'J&T Express' &&
      process.env.JT_API_KEY &&
      process.env.JT_EC_COMPANY_ID &&
      process.env.JT_ORDER_URL
    ) {
      const logisticsInterface = JSON.stringify({
        eccompanyid: process.env.JT_EC_COMPANY_ID,
        customerid: process.env.JT_EC_COMPANY_ID,
        txlogisticid: params.orderCode,
        ordertype: 1,
        servicetype: 1,
        receiver: {
          name: params.customerName,
          mobile: params.customerPhone,
          address: params.shippingAddress,
        },
        itemsvalue: params.codTotal,
        goodsvalue: params.codTotal,
        remark: params.note,
        items: params.items.map((i) => ({
          itemname: i.productName,
          number: i.quantity,
          itemvalue: i.price,
        })),
      });
      const dataDigest = crypto
        .createHash('md5')
        .update(logisticsInterface + process.env.JT_API_KEY)
        .digest('base64');
      const formBody = new URLSearchParams({
        logistics_interface: logisticsInterface,
        data_digest: dataDigest,
        msg_type: 'ORDERCREATE',
        eccompanyid: process.env.JT_EC_COMPANY_ID,
      });
      const resp = await fetch(process.env.JT_ORDER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });
      if (resp.ok) {
        const json = (await resp.json()) as {
          responseitems?: Array<{ success?: string; billcode?: string }>;
        };
        const billcode = json.responseitems?.[0]?.billcode;
        if (billcode) {
          return { trackingCode: billcode, carrierSynced: true };
        }
      }
    }
  } catch {
    // Fall back gracefully to local tracking code
  }

  return { trackingCode: fallbackCode, carrierSynced: false };
}

/**
 * Fires non-blocking HTTP POST event to the user's external local bot webhook URL.
 */
export async function dispatchOutboundBotWebhook(params: {
  outboundWebhookUrl: string | undefined;
  botApiKey: string | undefined;
  event: 'message.received' | 'order.created';
  payload: {
    page: ConnectedPage;
    conversation: Conversation;
    customer: Customer;
    messages?: Message[];
    order?: Order;
  };
}): Promise<boolean> {
  const targetUrl =
    params.outboundWebhookUrl?.trim() ||
    process.env.OUTBOUND_BOT_WEBHOOK_URL?.trim();
  if (!targetUrl || !targetUrl.startsWith('http')) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dauto-Event': params.event,
        ...(params.botApiKey ? { 'X-Bot-Api-Key': params.botApiKey } : {}),
      },
      body: JSON.stringify({
        event: params.event,
        timestamp: new Date().toISOString(),
        ...params.payload,
      }),
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
