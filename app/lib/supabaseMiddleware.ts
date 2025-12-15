import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    // Check if Supabase credentials are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If Supabase is not configured, skip authentication and allow all requests
    if (!supabaseUrl || !supabaseKey) {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseMiddleware.ts:12',message:'Supabase not configured, skipping auth',data:{hasUrl:!!supabaseUrl,hasKey:!!supabaseKey,path:request.nextUrl.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        return supabaseResponse;
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Do not run code between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    let user = null;
    try {
        const {
            data: { user: authUser },
        } = await supabase.auth.getUser();
        user = authUser;
    } catch (error) {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseMiddleware.ts:45',message:'Supabase auth error, allowing request',data:{error:error instanceof Error ? error.message : String(error),path:request.nextUrl.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        // If auth fails, allow the request to proceed (graceful degradation)
        return supabaseResponse;
    }

    // Protected routes - redirect to login if not authenticated
    const isLoginPage = request.nextUrl.pathname === '/login';
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    // Allow public access to product/property detail pages
    const isPublicProductPage = /^\/product\/[^/]+$/.test(request.nextUrl.pathname);
    const isPublicPropertyPage = /^\/property\/[^/]+$/.test(request.nextUrl.pathname);

    if (!user && !isLoginPage && !isApiRoute && !isPublicProductPage && !isPublicPropertyPage) {
        // Redirect unauthenticated users to login
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (user && isLoginPage) {
        // Redirect authenticated users away from login page
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
