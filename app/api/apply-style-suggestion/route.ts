/**
 * Apply Style Suggestion API
 * Applies a style suggestion to the appropriate location (rules, instructions, knowledge, etc.)
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { addDocument } from '@/app/lib/rag';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { suggestion } = body;

        if (!suggestion || !suggestion.type || !suggestion.content) {
            return NextResponse.json(
                { error: 'Invalid suggestion' },
                { status: 400 }
            );
        }

        switch (suggestion.type) {
            case 'rule':
                // Add to bot_rules
                const { error: ruleError } = await supabase
                    .from('bot_rules')
                    .insert({
                        rule: suggestion.content,
                        category: 'general',
                        priority: suggestion.priority || 5,
                        enabled: true,
                    });

                if (ruleError) {
                    console.error('Error adding rule:', ruleError);
                    return NextResponse.json(
                        { error: 'Failed to add rule' },
                        { status: 500 }
                    );
                }
                break;

            case 'instruction':
                // Add to bot_instructions table
                const { data: existingInstructions } = await supabase
                    .from('bot_instructions')
                    .select('id, instructions')
                    .order('id', { ascending: false })
                    .limit(1)
                    .single();

                const currentInstructions = existingInstructions?.instructions || '';
                const newInstructions = currentInstructions
                    ? `${currentInstructions}\n\n${suggestion.content}`
                    : suggestion.content;

                let instructionError = null;
                if (existingInstructions) {
                    // Update existing
                    const { error } = await supabase
                        .from('bot_instructions')
                        .update({ 
                            instructions: newInstructions,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingInstructions.id);
                    instructionError = error;
                } else {
                    // Insert new
                    const { error } = await supabase
                        .from('bot_instructions')
                        .insert({ instructions: newInstructions });
                    instructionError = error;
                }

                if (instructionError) {
                    console.error('Error updating instructions:', instructionError);
                    return NextResponse.json(
                        { error: 'Failed to update instructions' },
                        { status: 500 }
                    );
                }
                break;

            case 'knowledge':
                // Add to knowledge base (documents)
                const success = await addDocument(suggestion.content, {
                    source: 'style_analyzer',
                    title: suggestion.title || 'Style Knowledge',
                });

                if (!success) {
                    return NextResponse.json(
                        { error: 'Failed to add to knowledge base' },
                        { status: 500 }
                    );
                }
                break;

            case 'personality':
                // Update bot_tone in bot_settings
                // Extract tone from content if it's a tone description
                let toneUpdate = suggestion.content;
                
                // Try to extract a concise tone description
                if (suggestion.content.length > 100) {
                    // If too long, use the title or first sentence
                    toneUpdate = suggestion.title || suggestion.content.split('.')[0];
                }

                // Get settings ID first
                const { data: settingsData } = await supabase
                    .from('bot_settings')
                    .select('id')
                    .limit(1)
                    .single();

                if (!settingsData) {
                    return NextResponse.json(
                        { error: 'Bot settings not found' },
                        { status: 404 }
                    );
                }

                const { error: personalityError } = await supabase
                    .from('bot_settings')
                    .update({ bot_tone: toneUpdate })
                    .eq('id', settingsData.id);

                if (personalityError) {
                    console.error('Error updating personality:', personalityError);
                    return NextResponse.json(
                        { error: 'Failed to update personality' },
                        { status: 500 }
                    );
                }
                break;

            default:
                return NextResponse.json(
                    { error: 'Unknown suggestion type' },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            message: `Successfully applied to ${suggestion.type}`,
        });
    } catch (error) {
        console.error('[Apply Style Suggestion] Error:', error);
        return NextResponse.json(
            { error: 'Failed to apply suggestion' },
            { status: 500 }
        );
    }
}

