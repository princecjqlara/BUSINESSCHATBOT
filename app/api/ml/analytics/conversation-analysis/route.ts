/**
 * Conversation Analysis API
 * Provides endpoints for analyzing chatbot conversations like a chess engine
 */

import { NextResponse } from 'next/server';
import {
    analyzeConversation,
    getRecentConversationsWithLeads,
} from '@/app/lib/conversationAnalysisService';

// GET - Get list of recent conversations or analyze a specific conversation
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const senderId = searchParams.get('senderId');
        const type = searchParams.get('type') || 'list';
        const limit = parseInt(searchParams.get('limit') || '20');

        // List recent conversations
        if (type === 'list') {
            const conversations = await getRecentConversationsWithLeads(limit);
            return NextResponse.json({ conversations });
        }

        // Analyze specific conversation
        if (type === 'analyze' && senderId) {
            const analysis = await analyzeConversation(senderId, limit);
            return NextResponse.json(analysis);
        }

        return NextResponse.json(
            { error: 'Invalid request. Use type=list or type=analyze&senderId=...' },
            { status: 400 }
        );
    } catch (error) {
        console.error('[Conversation Analysis API] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// POST - Analyze a conversation (alternative to GET for larger requests)
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { senderId, limit = 50 } = body;

        if (!senderId) {
            return NextResponse.json(
                { error: 'senderId is required' },
                { status: 400 }
            );
        }

        const analysis = await analyzeConversation(senderId, limit);
        return NextResponse.json(analysis);
    } catch (error) {
        console.error('[Conversation Analysis API] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
