/**
 * GET /api/auth/verify?token=xxx&redirectTo=xxx
 *
 * Verify magic link token and create session
 * Redirects user to app or specified URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const redirectTo = searchParams.get('redirectTo') || '/dashboard';

    if (!token) {
      return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
    }

    // Find magic link
    const magicLink = await prisma.magicLink.findUnique({
      where: { token },
      include: { user: true },
    });

    // Validate magic link
    if (!magicLink) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    if (magicLink.usedAt) {
      return NextResponse.redirect(new URL('/login?error=token_already_used', request.url));
    }

    if (new Date() > magicLink.expiresAt) {
      return NextResponse.redirect(new URL('/login?error=token_expired', request.url));
    }

    // Mark magic link as used
    await prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { usedAt: new Date() },
    });

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create session
    const session = await prisma.session.create({
      data: {
        userId: magicLink.userId,
        token: sessionToken,
        expiresAt,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        deviceInfo: getUserDeviceInfo(request.headers.get('user-agent')),
      },
    });

    // Update user's last login
    await prisma.user.update({
      where: { id: magicLink.userId },
      data: { lastLoginAt: new Date() },
    });

    // Create response with session cookie
    const response = NextResponse.redirect(new URL(redirectTo, request.url));

    // Set HTTP-only secure cookie
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
      path: '/',
    });

    // Also set user ID cookie for client-side (non-sensitive)
    response.cookies.set('user_id', magicLink.userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    console.log('✅ User authenticated:', {
      userId: magicLink.userId,
      email: magicLink.user.email,
      sessionId: session.id,
    });

    return response;

  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}

/**
 * Parse user agent to extract device info
 */
function getUserDeviceInfo(userAgent: string | null): string {
  if (!userAgent) return 'Unknown Device';

  const ua = userAgent.toLowerCase();

  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  // Detect browser
  if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edge')) browser = 'Edge';

  // Detect OS
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  // Detect device type
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    device = 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    device = 'Tablet';
  }

  return `${device} - ${browser} on ${os}`;
}
