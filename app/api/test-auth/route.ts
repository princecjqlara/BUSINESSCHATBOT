import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    const results: Record<string, any> = {
        timestamp: new Date().toISOString(),
        checks: {},
    };

    // Check Supabase Configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    results.checks.supabase = {
        url_configured: !!supabaseUrl,
        key_configured: !!supabaseKey,
        url_value: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET',
    };

    // Test Supabase Connection
    if (supabaseUrl && supabaseKey) {
        try {
            const { data, error } = await supabase
                .from('bot_settings')
                .select('id')
                .limit(1);
            
            results.checks.supabase.connection = error ? 'FAILED' : 'SUCCESS';
            results.checks.supabase.error = error?.message || null;
        } catch (error) {
            results.checks.supabase.connection = 'ERROR';
            results.checks.supabase.error = error instanceof Error ? error.message : 'Unknown error';
        }
    } else {
        results.checks.supabase.connection = 'NOT_CONFIGURED';
    }

    // Check Facebook Configuration
    const facebookAppId = process.env.FACEBOOK_APP_ID;
    const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
    const facebookVerifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
    
    results.checks.facebook = {
        app_id_configured: !!facebookAppId,
        app_secret_configured: !!facebookAppSecret,
        verify_token_configured: !!facebookVerifyToken,
        app_id_value: facebookAppId ? `${facebookAppId.substring(0, 10)}...` : 'NOT SET',
    };

    // Test Facebook App ID format (should be numeric)
    if (facebookAppId) {
        results.checks.facebook.app_id_valid = /^\d+$/.test(facebookAppId);
    }

    // Check NVIDIA API Key
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    results.checks.nvidia = {
        configured: !!nvidiaKey,
        value_preview: nvidiaKey ? `${nvidiaKey.substring(0, 20)}...` : 'NOT SET',
    };

    // Check Base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    results.checks.base_url = {
        configured: !!baseUrl,
        value: baseUrl || 'NOT SET (defaults to http://localhost:3000)',
    };

    // Overall Status
    const allConfigured = 
        !!supabaseUrl && 
        !!supabaseKey && 
        !!facebookAppId && 
        !!facebookAppSecret &&
        !!nvidiaKey;

    results.status = allConfigured ? 'CONFIGURED' : 'INCOMPLETE';
    results.summary = {
        supabase: results.checks.supabase.connection === 'SUCCESS' ? '✅' : '❌',
        facebook: results.checks.facebook.app_id_configured && results.checks.facebook.app_secret_configured ? '✅' : '❌',
        nvidia: results.checks.nvidia.configured ? '✅' : '❌',
    };

    return NextResponse.json(results, { status: 200 });
}

