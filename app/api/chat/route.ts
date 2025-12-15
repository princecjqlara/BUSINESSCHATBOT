import { NextResponse } from 'next/server';
import { getBotResponse } from '@/app/lib/chatService';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { message, sessionId, previewDocumentContent } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Use provided sessionId or generate a web session identifier
        const senderId = sessionId || `web_${Date.now()}`;

        console.log('[Chat API] Request received:', { 
            messageLength: message?.length, 
            sessionId: senderId,
            hasPreviewContent: !!previewDocumentContent 
        });

        const replyResult = await getBotResponse(message, senderId, undefined, previewDocumentContent);

        // Extract messages and mediaUrls from response
        let messages: string[];
        let mediaUrls: string[] = [];
        
        if (typeof replyResult === 'object' && 'messages' in replyResult) {
            // New format with mediaUrls
            const reply = replyResult.messages;
            messages = Array.isArray(reply) ? reply : [reply];
            mediaUrls = replyResult.mediaUrls || [];
        } else {
            // Legacy format (string or string[])
            messages = Array.isArray(replyResult) ? replyResult : [replyResult];
        }

        console.log('[Chat API] Bot response generated:', { 
            hasReply: !!messages && messages.length > 0,
            isArray: Array.isArray(messages),
            replyLength: messages.length,
            firstReplyPreview: messages[0]?.substring(0, 50),
            mediaUrlsCount: mediaUrls.length
        });

        if (!messages || messages.length === 0) {
            console.error('[Chat API] No reply generated from getBotResponse');
            return NextResponse.json({ 
                error: 'No response generated',
                reply: ['Sorry, I could not generate a response. Please try again.']
            }, { status: 500 });
        }

        // Return messages and mediaUrls
        return NextResponse.json({ 
            reply: messages, 
            mediaUrls: mediaUrls,
            sessionId: senderId 
        });
    } catch (error) {
        console.error('[Chat API] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ 
            error: errorMessage,
            reply: ['Sorry, I encountered an error. Please try again.']
        }, { status: 500 });
    }
}
