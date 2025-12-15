/**
 * Test Follow-Up Message API
 * Allows users to test how follow-up messages will be generated
 */

import { NextResponse } from 'next/server';
import { getBotResponse } from '@/app/lib/chatService';
import { supabase } from '@/app/lib/supabase';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            scenario,
            conversationHistory = [],
            messageMode = 'ai',
            customMessage,
        } = body;

        // If custom message mode, return the custom message directly
        if (messageMode === 'custom' && customMessage) {
            return NextResponse.json({
                success: true,
                message: customMessage,
                mode: 'custom',
            });
        }

        // For AI mode, generate a follow-up message
        if (!scenario) {
            return NextResponse.json(
                { error: 'Scenario is required for AI mode' },
                { status: 400 }
            );
        }

        // Build a user message that simulates a follow-up scenario
        // getBotResponse will automatically fetch and include rules, instructions, and knowledge base
        // We format it as a request to generate a follow-up, emphasizing that ALL rules must be followed
        let userMessage = '';
        
        // Add conversation history context if provided
        if (conversationHistory.length > 0) {
            const historyText = conversationHistory
                .map((msg: { role: string; content: string }) => 
                    `${msg.role === 'user' ? 'Customer' : 'Bot'}: ${msg.content}`
                )
                .join('\n');
            userMessage = `Previous conversation:\n${historyText}\n\nGenerate a follow-up message for this scenario: ${scenario}\n\nIMPORTANT GUIDELINES FOR FOLLOW-UP MESSAGES:
- Follow ALL the rules and instructions provided to you
- Be helpful and friendly, NOT pushy or aggressive
- Avoid high-pressure sales tactics or fake urgency
- Don't use guilt-tripping language (like "Akala ko napanis na tayo?")
- Keep it natural, conversational, and respectful
- Focus on being helpful rather than closing a sale
- Use a warm, genuine tone that builds trust`;
        } else {
            // For follow-up messages, add instruction to generate a follow-up
            userMessage = `Generate a follow-up message for this scenario: ${scenario}\n\nIMPORTANT GUIDELINES FOR FOLLOW-UP MESSAGES:
- Follow ALL the rules and instructions provided to you
- Be helpful and friendly, NOT pushy or aggressive
- Avoid high-pressure sales tactics or fake urgency
- Don't use guilt-tripping language
- Keep it natural, conversational, and respectful
- Focus on being helpful rather than closing a sale
- Use a warm, genuine tone that builds trust`;
        }

        // Generate the follow-up message using the bot's response system
        // getBotResponse will automatically include:
        // - Bot rules from database (in system prompt)
        // - Bot instructions from database (in system prompt)
        // - Knowledge base context (in system prompt)
        // - Bot personality and tone (in system prompt)
        const testSenderId = 'test_followup_' + Date.now();
        const followUpResponse = await getBotResponse(userMessage, testSenderId);
        
        // Handle both single string and array of messages (for testing, return first message or join all)
        const followUpMessage = Array.isArray(followUpResponse) 
            ? followUpResponse.join(' ') 
            : followUpResponse;

        return NextResponse.json({
            success: true,
            message: followUpMessage,
            mode: 'ai',
            messageCount: Array.isArray(followUpResponse) ? followUpResponse.length : 1,
        });
    } catch (error) {
        console.error('[Test Follow-Up] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate follow-up message' },
            { status: 500 }
        );
    }
}

