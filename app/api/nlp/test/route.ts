import { NextRequest, NextResponse } from 'next/server';
import { analyzeMessage, getResponseGuidance } from '@/app/lib/nlpService';

/**
 * Test endpoint for NLP analysis
 * POST /api/nlp/test
 * Body: { message: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message } = body;

        if (!message || typeof message !== 'string') {
            return NextResponse.json(
                { error: 'Message is required and must be a string' },
                { status: 400 }
            );
        }

        // Perform NLP analysis
        const analysis = analyzeMessage(message);

        // Get response guidance based on analysis
        const guidance = getResponseGuidance(analysis);

        return NextResponse.json({
            success: true,
            analysis,
            guidance,
        });
    } catch (error) {
        console.error('[NLP Test] Error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze message' },
            { status: 500 }
        );
    }
}

/**
 * GET endpoint for quick testing
 * GET /api/nlp/test?message=Hello
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const message = searchParams.get('message');

        if (!message) {
            return NextResponse.json({
                info: 'NLP Test Endpoint',
                usage: {
                    POST: {
                        body: { message: 'Your message here' },
                        description: 'Analyze a message for intent, sentiment, and entities'
                    },
                    GET: {
                        query: '?message=Your message here',
                        description: 'Quick test with query parameter'
                    }
                },
                examples: [
                    'I want to order 2 shirts',
                    'Magkano po yung price?',
                    'This is so frustrating! My order never arrived!',
                    'My name is Juan, please deliver to Manila on December 20',
                    'Thanks po! 😊'
                ]
            });
        }

        const analysis = analyzeMessage(message);
        const guidance = getResponseGuidance(analysis);

        return NextResponse.json({
            success: true,
            analysis,
            guidance,
        });
    } catch (error) {
        console.error('[NLP Test] Error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze message' },
            { status: 500 }
        );
    }
}
