import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If Supabase is not configured, create a mock client that won't crash
    if (!supabaseUrl || !supabaseKey) {
        // Return a mock client with no-op methods to prevent crashes
        return {
            auth: {
                signOut: async () => ({ error: null }),
                signInWithPassword: async () => ({ error: { message: 'Supabase is not configured' } }),
                getUser: async () => ({ data: { user: null }, error: null }),
            },
        } as any;
    }

    return createBrowserClient(supabaseUrl, supabaseKey);
}
