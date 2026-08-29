import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const REFRESH_COOKIE = 'crm_refresh';
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_EXPIRY = '15m';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function setRefreshCookie(res: Response, token: string): void {
  // Frontend and backend share the same Vercel domain (same-origin), and
  // Vercel always serves production over HTTPS — so a plain same-origin
  // cookie works with no cross-origin sameSite:'none' complexity needed.
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: REFRESH_EXPIRY_MS,
    path: '/api/auth',
  });
}

function issueAccessToken(payload: {
  id: string;
  email: string;
  role: string;
  name: string;
  organizationId?: string | null;
}): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_EXPIRY });
}

async function createRefreshToken(userId: string, req: Request): Promise<string> {
  const raw = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt,
      userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
      ipAddress: (req.ip ?? '').slice(0, 45),
    },
  });

  return raw;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      organizationId: user.organizationId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(tokenPayload),
      createRefreshToken(user.id, req),
    ]);

    setRefreshCookie(res, refreshToken);

    const { password: _p, ...safeUser } = user;
    res.json({ success: true, data: { token: accessToken, user: safeUser } });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      res.status(401).json({ success: false, error: 'No refresh token' });
      return;
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      res.status(401).json({ success: false, error: 'Session expired — please log in again' });
      return;
    }

    if (!stored.user.isActive) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      res.status(401).json({ success: false, error: 'Account disabled' });
      return;
    }

    // Rotate: revoke old token, issue new one
    const newRaw = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(newRaw),
          userId: stored.userId,
          expiresAt,
          userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
          ipAddress: (req.ip ?? '').slice(0, 45),
        },
      }),
    ]);

    const tokenPayload = {
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
      name: stored.user.name,
      organizationId: stored.user.organizationId,
    };

    setRefreshCookie(res, newRaw);
    res.json({ success: true, data: { token: issueAccessToken(tokenPayload) } });
  } catch (err) {
    console.error('[auth] refresh error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, role: true,
        phone: true, avatar: true, organizationId: true, createdAt: true,
      },
    });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      res.status(400).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user!.id }, data: { password: hashed } });

    // Revoke all refresh tokens so other sessions are invalidated
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ success: true, message: 'Password updated. Please log in again.' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
