import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token === 'nippon-ceo-token-2026') {
        // 1. Create the session (this sets the 'lax' cookie internally)
        await createSession('ceo');

        // 2. Overwrite it with 'none' + 'secure' so it survives inside the cross-domain iframe
        const cookieStore = await cookies();
        const tokenVal = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (tokenVal) {
            cookieStore.set(SESSION_COOKIE_NAME, tokenVal, {
                httpOnly: true,
                sameSite: 'none',
                secure: true,
                path: '/',
                expires: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
        }

        // 3. Redirect into the app
        return NextResponse.redirect(new URL('/ceo', request.url));
    }

    return new NextResponse('Unauthorized SSO', { status: 401 });
}