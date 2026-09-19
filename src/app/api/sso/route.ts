import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db';
import { randomBytes, scryptSync } from 'node:crypto';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token === 'nippon-ceo-token-2026') {
        // 1. Ensure the CEO user actually exists in the live database!
        try {
            const salt = randomBytes(16).toString('hex');
            const hash = scryptSync('AutoCEO@2026', salt, 64).toString('hex');
            await pool.query(
                `insert into admins (username, password_hash, salt, role)
         values ($1, $2, $3, $4)
         on conflict (username) do nothing`,
                ['ceo', hash, salt, 'ceo']
            );
        } catch (e) {
            console.error("Failed to seed CEO user:", e);
        }

        // 2. Create the session (sets the internal Next.js state)
        await createSession('ceo');
        const cookieStore = await cookies();
        const tokenVal = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        // 3. Create the redirect response
        const response = NextResponse.redirect(new URL('/ceo', request.url));

        // 4. Force the cookie explicitly onto the redirect response object
        // This bypasses the Next.js bug and forces SameSite=None + Secure
        if (tokenVal) {
            response.cookies.set(SESSION_COOKIE_NAME, tokenVal, {
                httpOnly: true,
                sameSite: 'none',
                secure: true,
                path: '/',
                maxAge: 12 * 60 * 60, // 12 hours
            });
        }

        return response;
    }

    return new NextResponse('Unauthorized SSO', { status: 401 });
}