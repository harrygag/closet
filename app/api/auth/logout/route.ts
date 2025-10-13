/**
 * POST /api/auth/logout
 *
 * Logout current user and destroy session
 */

import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/src/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session_token')?.value;

    if (sessionToken) {
      await logout(sessionToken);
    }

    // Clear cookies
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    response.cookies.delete('session_token');
    response.cookies.delete('user_id');

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
