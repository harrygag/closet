/**
 * Authentication Utilities
 *
 * Helper functions for session management and authentication
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role: 'SELLER' | 'MANAGER' | 'ADMIN';
  createdAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Get current authenticated user from session
 * Returns null if not authenticated
 */
export async function getCurrentUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const sessionToken = request.cookies.get('session_token')?.value;

    if (!sessionToken) {
      return null;
    }

    // Find active session
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check if session expired
    if (new Date() > session.expiresAt) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    // Update last active timestamp
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phone: session.user.phone,
      avatar: session.user.avatar,
      role: session.user.role as 'SELLER' | 'MANAGER' | 'ADMIN',
      createdAt: session.user.createdAt,
      lastLoginAt: session.user.lastLoginAt,
    };

  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

/**
 * Require authentication middleware
 * Returns user or throws 401 error
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new AuthenticationError('Authentication required');
  }

  return user;
}

/**
 * Require specific role(s)
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: Array<'SELLER' | 'MANAGER' | 'ADMIN'>
): Promise<AuthUser> {
  const user = await requireAuth(request);

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError(`Role ${user.role} not authorized`);
  }

  return user;
}

/**
 * Logout - destroy session
 */
export async function logout(sessionToken: string): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
}

/**
 * Clean up expired sessions and magic links (run via cron)
 */
export async function cleanupExpiredAuth(): Promise<void> {
  const now = new Date();

  // Delete expired sessions
  const deletedSessions = await prisma.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  // Delete expired magic links
  const deletedMagicLinks = await prisma.magicLink.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  console.log('Cleanup completed:', {
    deletedSessions: deletedSessions.count,
    deletedMagicLinks: deletedMagicLinks.count,
  });
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActiveAt: 'desc' },
  });
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await prisma.session.deleteMany({
    where: {
      id: sessionId,
      userId, // Ensure user can only revoke their own sessions
    },
  });

  return result.count > 0;
}

/**
 * Revoke all sessions except current one
 */
export async function revokeAllOtherSessions(userId: string, currentSessionToken: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      token: { not: currentSessionToken },
    },
  });

  return result.count;
}

// Custom error classes
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
