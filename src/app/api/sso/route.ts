import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { pool } from '@/lib/db';
import { randomBytes, scryptSync, createHmac } from 'node:crypto';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token === 'nippon-ceo-token-2026') {
        // 1. Ensure the CEO user exists in the live database!
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

        // 2. Generate the token manually to avoid Next.js cookie jar bugs
        const username = 'ceo';
        const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
        const payload = ${ username }.${ expiresAt };
        const secret = process.env.SESSION_SECRET;

        if (!secret) {
            console.error("SESSION_SECRET is missing!");
            return new NextResponse('Server Configuration Error', { status: 500 });
        }

        const signature = createHmac("sha256", secret).update(payload).digest("hex");
        const sessionToken = ${ payload }.${ signature };

        // 3. Create the redirect response
        const response = NextResponse.redirect(new URL('/ceo', request.url));

        // 4. Force the cookie explicitly onto the redirect response object
        // This bypasses the Next.js bug and forces SameSite=None + Secure
        response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            path: '/',
            expires: new Date(expiresAt),
        });

        return response;
    }

    return new NextResponse('Unauthorized SSO', { status: 401 });
}