import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getBotConfig, getUserByUid } from '../db/repository.ts';
import type { User } from '../types/schema.ts';
import { hasPermission, type PermissionKey } from '../utils/omnichannel.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: User | null;
  isBot?: boolean;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Chưa xác thực: Thiếu mã phiên đăng nhập' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    req.dbUser = await getUserByUid(decodedToken.uid);
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
};

export function requirePermission(permission: PermissionKey) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.isBot) {
      next();
      return;
    }
    const role = req.dbUser?.role;
    if (!role) {
      res.status(403).json({ error: 'Tài khoản chưa được cấp hồ sơ nhân viên hợp lệ' });
      return;
    }
    if (!hasPermission(role, permission)) {
      res.status(403).json({
        error: `Bạn không có quyền thực hiện thao tác này (cần quyền: ${permission})`,
      });
      return;
    }
    next();
  };
}

export const requireBotKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const headerKey =
    (typeof req.headers['x-bot-api-key'] === 'string'
      ? req.headers['x-bot-api-key']
      : '') ||
    (req.headers.authorization?.startsWith('Bot ')
      ? req.headers.authorization.slice(4)
      : '');

  const config = await getBotConfig();
  const expectedKey = config.botApiKey.trim();

  if (!expectedKey) {
    res.status(503).json({
      error:
        'Chưa cấu hình BOT_API_KEY trong Cài đặt → Webhook Localhost & Bot (xem candien.md)',
    });
    return;
  }

  const providedBuf = Buffer.from(headerKey.trim(), 'utf8');
  const expectedBuf = Buffer.from(expectedKey, 'utf8');
  if (
    providedBuf.length === 0 ||
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    res.status(401).json({ error: 'X-Bot-Api-Key không hợp lệ' });
    return;
  }

  req.isBot = true;
  next();
};

export async function verifySocketToken(token: unknown): Promise<DecodedIdToken | null> {
  if (typeof token !== 'string' || !token.trim()) return null;
  try {
    return await adminAuth.verifyIdToken(token.trim());
  } catch {
    return null;
  }
}
