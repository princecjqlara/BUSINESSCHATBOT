/**
 * Auto-Learn API Route
 * Triggers auto-learning from conversation analysis
 */

import { NextResponse } from 'next/server';
import { processConversationLearning, getConversationsForLearning } from '@/app/lib/conversationAutoLearnService';

export const maxDuration = 60;

// POST - Trigger auto-learning from analysis
export async function POST(req: Request) {
    try {
        const { analysis } = await req.json();

        if (!analysis || !analysis.messages) {
            return NextResponse.json({ error: 'Analysis data required' }, { status: 400 });
        }

        const result = await processConversationLearning(analysis);

        return NextResponse.json({
            success: true,
            ...result,
            message: result.rulesAdded > 0
                ? `Learned ${result.rulesAdded} new rules from conversation mistakes`
                : 'No new rules extracted (either no mistakes found or rules already exist)',
        });
    } catch (error) {
        console.error('[AutoLearn API] Error:', error);
        return NextResponse.json({ error: 'Auto-learn failed' }, { status: 500 });
    }
}

// GET - Get conversations for learning (filtered, no web_test)
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        const conversations = await getConversationsForLearning(limit);

        return NextResponse.json({
            success: true,
            conversations,
            total: conversations.length,
        });
    } catch (error) {
        console.error('[AutoLearn API] GET Error:', error);
        return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }
}
