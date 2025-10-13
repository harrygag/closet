/**
 * GET /api/auth/sessions - List all active sessions
 * DELETE /api/auth/sessions/:id - Revoke specific session
 * POST /api/auth/sessions/revoke-all - Revoke all other sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getUserSessions, revokeSession, revokeAllOtherSessions } from '@/src/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const sessions = await getUserSessions(user.id);

    return NextResponse.json({
      sessions: sessions.map(session => ({
        id: session.id,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
        isCurrent: session.token === request.cookies.get('session_token')?.value,
      })),
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const success = await revokeSession(sessionId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session revoked',
    });

  } catch (error) {
    console.error('Revoke session error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const currentSessionToken = request.cookies.get('session_token')?.value;

    if (!currentSessionToken) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 400 }
      );
    }

    const count = await revokeAllOtherSessions(user.id, currentSessionToken);

    return NextResponse.json({
      success: true,
      message: `Revoked ${count} session(s)`,
      count,
    });

  } catch (error) {
    console.error('Revoke all sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke sessions' },
      { status: 500 }
    );
  }
}
