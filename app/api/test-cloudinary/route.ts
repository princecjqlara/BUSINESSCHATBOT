/**
 * Test Cloudinary Connection
 * Verify Cloudinary credentials are correct
 */

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export async function GET() {
    try {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-cloudinary/route.ts:GET:entry',message:'Testing Cloudinary connection',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        // Check if credentials are present
        if (!cloudName || !apiKey || !apiSecret) {
            return NextResponse.json({
                success: false,
                error: 'Missing Cloudinary credentials',
                missing: {
                    cloudName: !cloudName,
                    apiKey: !apiKey,
                    apiSecret: !apiSecret,
                },
            }, { status: 400 });
        }

        // Configure Cloudinary
        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-cloudinary/route.ts:GET:config-set',message:'Cloudinary configured, testing connection',data:{cloudName,apiKeyLength:apiKey.length,apiSecretLength:apiSecret.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        // Test connection by getting account details
        try {
            const result = await cloudinary.api.ping();
            
            // #region agent log
            if (typeof fetch !== 'undefined') {
                fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-cloudinary/route.ts:GET:success',message:'Cloudinary connection successful',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion

            return NextResponse.json({
                success: true,
                message: 'Cloudinary credentials are valid',
                cloudName,
                apiKey: apiKey.substring(0, 3) + '...' + apiKey.substring(apiKey.length - 3),
            });
        } catch (error: any) {
            // #region agent log
            if (typeof fetch !== 'undefined') {
                fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-cloudinary/route.ts:GET:error',message:'Cloudinary connection failed',data:{error:error.message || String(error),httpCode:error.http_code,errorName:error.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion

            return NextResponse.json({
                success: false,
                error: 'Cloudinary authentication failed',
                message: error.message || 'Invalid credentials',
                httpCode: error.http_code,
                details: error.http_code === 401 
                    ? 'The API secret does not match the API key. Please verify your credentials in Cloudinary dashboard.'
                    : error.message,
            }, { status: error.http_code || 500 });
        }
    } catch (error: any) {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-cloudinary/route.ts:GET:exception',message:'Exception caught',data:{error:error.message || String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        return NextResponse.json({
            success: false,
            error: 'Internal Server Error',
            details: error.message,
        }, { status: 500 });
    }
}


