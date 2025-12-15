import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Max file size: 100MB (Cloudinary free tier limit is 100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

export async function POST(req: Request) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:14',message:'POST handler entry',data:{hasFormData:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const folder = formData.get('folder') as string || 'payment-methods';

        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:20',message:'File extracted from formData',data:{hasFile:!!file,fileName:file?.name,fileSize:file?.size,fileType:file?.type,folder},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
                { status: 400 }
            );
        }

        // Check if Cloudinary is configured
        const hasCloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
        const hasApiKey = !!process.env.CLOUDINARY_API_KEY;
        const hasApiSecret = !!process.env.CLOUDINARY_API_SECRET;
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
        const apiKey = process.env.CLOUDINARY_API_KEY || '';
        const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:33',message:'Cloudinary config check',data:{hasCloudName,hasApiKey,hasApiSecret,cloudNameLength:cloudName.length,apiKeyLength:apiKey.length,apiSecretLength:apiSecret.length,cloudNamePrefix:cloudName.substring(0,3),apiKeyPrefix:apiKey.substring(0,3)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (!hasCloudName || !hasApiKey || !hasApiSecret) {
            console.error('Cloudinary configuration missing');
            const missingVars = [];
            if (!hasCloudName) missingVars.push('CLOUDINARY_CLOUD_NAME');
            if (!hasApiKey) missingVars.push('CLOUDINARY_API_KEY');
            if (!hasApiSecret) missingVars.push('CLOUDINARY_API_SECRET');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:48',message:'Returning config error',data:{missingVars,statusCode:500},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return NextResponse.json(
                { 
                    error: 'File upload service is not configured',
                    details: `Missing environment variables: ${missingVars.join(', ')}. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env.local file.`,
                    missingVariables: missingVars
                },
                { status: 500 }
            );
        }

        // Determine resource type based on file type
        let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';
        const fileType = (file.type || '').toLowerCase();
        const fileName = (file.name || '').toLowerCase();
        
        if (fileType.startsWith('image/')) {
            resourceType = 'image';
        } else if (fileType.startsWith('video/')) {
            resourceType = 'video';
        } else if (fileName.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|odt|ods|odp)$/)) {
            resourceType = 'raw';
        } else {
            // Default to raw for unknown types (documents, etc.)
            resourceType = 'raw';
        }
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:55',message:'Resource type determined',data:{resourceType,fileType,fileName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        // Convert file to buffer then to base64
        // For documents (Word, PDF, etc.), Cloudinary handles them well with base64
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:59',message:'Before arrayBuffer conversion',data:{fileSize:file.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const bytes = await file.arrayBuffer();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:61',message:'After arrayBuffer conversion',data:{bytesLength:bytes.byteLength},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const buffer = Buffer.from(bytes);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:62',message:'Buffer created',data:{bufferLength:buffer.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Upload options
        const uploadOptions: any = {
            folder: folder,
            resource_type: resourceType,
            // For documents, preserve original format and filename
            ...(resourceType === 'raw' && {
                use_filename: true,
                unique_filename: true,
                overwrite: false,
                // Allow all formats for documents
                allowed_formats: undefined,
            }),
        };

        // For raw files (documents), we can upload the buffer directly or use base64
        // Using base64 is simpler and works reliably for all file types including Word docs and PDFs
        let result: any;
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:84',message:'Before base64 conversion',data:{resourceType,bufferLength:buffer.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (resourceType === 'raw') {
            // For documents, use base64 with proper MIME type
            const base64 = buffer.toString('base64');
            const dataURI = `data:${file.type || 'application/octet-stream'};base64,${base64}`;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:87',message:'Before Cloudinary upload (raw)',data:{base64Length:base64.length,dataURILength:dataURI.length,uploadOptions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            result = await cloudinary.uploader.upload(dataURI, uploadOptions);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:89',message:'After Cloudinary upload (raw)',data:{hasResult:!!result,hasSecureUrl:!!result?.secure_url,publicId:result?.public_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
        } else {
            // For images and videos, use base64 as well
            const base64 = buffer.toString('base64');
            const dataURI = `data:${file.type};base64,${base64}`;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:93',message:'Before Cloudinary upload (image/video)',data:{base64Length:base64.length,dataURILength:dataURI.length,uploadOptions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            result = await cloudinary.uploader.upload(dataURI, uploadOptions);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:95',message:'After Cloudinary upload (image/video)',data:{hasResult:!!result,hasSecureUrl:!!result?.secure_url,publicId:result?.public_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
        }

        if (!result || !result.secure_url) {
            throw new Error('Upload failed: No URL returned');
        }

        return NextResponse.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
        });
        } catch (error: any) {
        console.error('Upload error:', error);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'upload/route.ts:101',message:'Error caught',data:{errorType:error?.constructor?.name,errorMessage:error?.message,httpCode:error?.http_code,errorName:error?.name,errorStack:error?.stack?.substring(0,500),fullError:JSON.stringify(error).substring(0,1000)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Provide more specific error messages
        let errorMessage = 'Failed to upload file';
        let errorDetails = error.message;
        
        if (error.http_code === 401) {
            errorMessage = 'Cloudinary authentication failed - Invalid API credentials';
            errorDetails = 'The Cloudinary API secret does not match the API key. Please verify your CLOUDINARY_API_SECRET in .env.local matches your Cloudinary dashboard settings.';
        } else if (error.http_code === 400) {
            errorMessage = 'Invalid file format or file is corrupted';
            errorDetails = error.message;
        } else if (error.http_code === 413) {
            errorMessage = 'File is too large';
            errorDetails = error.message;
        } else if (error.message) {
            errorMessage = error.message;
            errorDetails = error.message;
        }
        
        return NextResponse.json(
            { 
                error: errorMessage, 
                details: errorDetails,
                httpCode: error.http_code || 500,
                troubleshooting: error.http_code === 401 ? 'Check your Cloudinary credentials in .env.local and verify they match your Cloudinary dashboard' : undefined
            },
            { status: error.http_code || 500 }
        );
    }
}
