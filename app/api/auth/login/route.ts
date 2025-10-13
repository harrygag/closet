/**
 * POST /api/auth/login
 *
 * Request magic link (passwordless authentication)
 * Sends email with sign-in link to user
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';

const prisma = new PrismaClient();

const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  redirectTo: z.string().url().optional(), // Where to redirect after login
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = LoginRequestSchema.parse(body);

    const email = validated.email.toLowerCase().trim();

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create new user on first login
      user = await prisma.user.create({
        data: {
          email,
          role: 'SELLER', // Default role
        },
      });
    }

    // Generate cryptographically secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Create magic link (expires in 15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLink.create({
      data: {
        userId: user.id,
        email,
        token,
        expiresAt,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    });

    // Build magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${token}${validated.redirectTo ? `&redirectTo=${encodeURIComponent(validated.redirectTo)}` : ''}`;

    // Send email with magic link
    await sendMagicLinkEmail({
      to: email,
      magicLinkUrl,
      expiresInMinutes: 15,
    });

    return NextResponse.json({
      success: true,
      message: 'Magic link sent to your email',
      email,
      expiresInMinutes: 15,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to send magic link' },
      { status: 500 }
    );
  }
}

/**
 * Send magic link email
 * Uses Resend API (free tier: 100 emails/day)
 */
async function sendMagicLinkEmail(params: {
  to: string;
  magicLinkUrl: string;
  expiresInMinutes: number;
}) {
  const { to, magicLinkUrl, expiresInMinutes } = params;

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    // Development fallback: log magic link to console
    console.log('\n==============================================');
    console.log('🔐 MAGIC LINK (Development Mode)');
    console.log('==============================================');
    console.log(`Email: ${to}`);
    console.log(`Link: ${magicLinkUrl}`);
    console.log(`Expires in: ${expiresInMinutes} minutes`);
    console.log('==============================================\n');
    return;
  }

  // Production: Send via Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Virtual Closet Arcade <noreply@virtualcloset.app>',
      to: [to],
      subject: '🎮 Your Virtual Closet Arcade Sign-In Link',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign in to Virtual Closet Arcade</title>
        </head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 32px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                🎮 Virtual Closet Arcade
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                Your AI-Powered Reseller Platform
              </p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 24px;">Sign in to your account</h2>
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Click the button below to securely sign in to Virtual Closet Arcade. This link will expire in <strong>${expiresInMinutes} minutes</strong>.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLinkUrl}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">
                  🔓 Sign In to Virtual Closet Arcade
                </a>
              </div>

              <!-- Alternative Link -->
              <p style="margin: 30px 0 0; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:<br>
                <a href="${magicLinkUrl}" style="color: #667eea; word-break: break-all;">${magicLinkUrl}</a>
              </p>

              <!-- Security Notice -->
              <div style="margin-top: 40px; padding: 20px; background: #f7fafc; border-left: 4px solid #667eea; border-radius: 4px;">
                <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6;">
                  <strong>🔒 Security Notice:</strong><br>
                  If you didn't request this sign-in link, you can safely ignore this email. The link will expire automatically.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Need help? Reply to this email or visit our help center.
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                Virtual Closet Arcade &copy; ${new Date().getFullYear()}<br>
                AI-Powered Multi-Marketplace Reselling
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to send email:', error);
    throw new Error('Failed to send magic link email');
  }

  const result = await response.json();
  console.log('Magic link email sent:', result.id);
}
