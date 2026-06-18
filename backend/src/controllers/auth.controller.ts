import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Validation Schemas ───────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  facilityId: z.string().cuid(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(),
  position: z.string().optional(),
  hoursPerWeek: z.number().min(1).max(60).optional(),
  unitIds: z.array(z.string().cuid()).optional(),
});

// ─── Token Helpers ────────────────────────────────────────────────────────────
const generateTokens = (user: { id: string; email: string; role: string; facilityId: string }) => {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, facilityId: user.facilityId },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

const SALT_ROUNDS = 12;

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Returns access + refresh tokens on success
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true, email: true, passwordHash: true, role: true,
        facilityId: true, firstName: true, lastName: true,
        isActive: true, expoPushToken: true, position: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token with 30-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    const { passwordHash: _, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: safeUser,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/register
 * Admin-only: creates a new user account for a staff member
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    // Check facility exists
    const facility = await prisma.facility.findUnique({ where: { id: data.facilityId } });
    if (!facility) throw new AppError('Facility not found.', 404);

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        facilityId: data.facilityId,
        role: data.role ?? 'STAFF',
        position: data.position,
        hoursPerWeek: data.hoursPerWeek ?? 40,
        // Assign to units if provided
        units: data.unitIds ? {
          create: data.unitIds.map((unitId, index) => ({
            unitId,
            isPrimary: index === 0,
          })),
        } : undefined,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, position: true, facilityId: true, createdAt: true,
      },
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required.', 400);

    // Verify JWT signature
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { sub: string };

    // Check it's in our DB and not expired
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { select: { id: true, email: true, role: true, facilityId: true, isActive: true } } },
    });

    if (!storedToken || storedToken.expiresAt < new Date() || !storedToken.user.isActive) {
      throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(storedToken.user);

    // Rotate refresh token (invalidate old one)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token: refreshToken } }),
      prisma.refreshToken.create({
        data: { userId: decoded.sub, token: newRefreshToken, expiresAt },
      }),
    ]);

    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Invalidates the refresh token
 */
export const logout = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/auth/push-token
 * Update Expo push notification token for the authenticated user
 */
export const updatePushToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { expoPushToken } = req.body;
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { expoPushToken },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
