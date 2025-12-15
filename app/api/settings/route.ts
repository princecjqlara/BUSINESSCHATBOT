import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch settings from database
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            // Return defaults if no settings exist
            return NextResponse.json({
                botName: 'Assistant',
                botTone: 'helpful and professional',
                facebookVerifyToken: 'TEST_TOKEN',
                facebookPageAccessToken: '',
                enableBestTimeContact: false,
                enableMlChatbot: false,
                enableAiKnowledgeManagement: false,
                enableAiAutonomousFollowup: false,
                enableMultiModelChatbot: true,
                maxSentencesPerMessage: 3,
                conversationFlow: '',
                defaultAiModel: 'deepseek-ai/deepseek-v3.1',
            });
        }

        // Map database column names to frontend field names
        // For max_sentences_per_message, check if column exists and has a value
        let maxSentences = 3; // Default
        if (data.max_sentences_per_message !== null && data.max_sentences_per_message !== undefined) {
            maxSentences = Number(data.max_sentences_per_message);
        } else if ('max_sentences_per_message' in data) {
            // Column exists but value is null/undefined, use default
            maxSentences = 3;
        }

        return NextResponse.json({
            botName: data.bot_name || 'Assistant',
            botTone: data.bot_tone || 'helpful and professional',
            facebookVerifyToken: data.facebook_verify_token || 'TEST_TOKEN',
            facebookPageAccessToken: data.facebook_page_access_token || '',
            humanTakeoverTimeoutMinutes: data.human_takeover_timeout_minutes ?? 5,
            enableBestTimeContact: data.enable_best_time_contact ?? false,
            enableMlChatbot: data.enable_ml_chatbot ?? false,
            enableAiKnowledgeManagement: data.enable_ai_knowledge_management ?? false,
            enableAiAutonomousFollowup: data.enable_ai_autonomous_followup ?? false,
            enableMultiModelChatbot: data.enable_multi_model_chatbot ?? true,
            maxSentencesPerMessage: maxSentences,
            conversationFlow: data.conversation_flow || '',
            defaultAiModel: data.default_ai_model || 'deepseek-ai/deepseek-v3.1',
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Update settings in database
export async function POST(req: Request) {
    try {
        let body;
        try {
            body = await req.json();
        } catch (jsonError: any) {
            console.error('[Settings API] Error parsing request JSON:', jsonError);
            return NextResponse.json({
                error: 'Invalid JSON in request body',
                details: jsonError?.message || String(jsonError)
            }, { status: 400 });
        }

        console.log('[Settings API] Received request body:', {
            botName: body.botName,
            botTone: body.botTone,
            humanTakeoverTimeoutMinutes: body.humanTakeoverTimeoutMinutes,
            enableBestTimeContact: body.enableBestTimeContact,
            enableMlChatbot: body.enableMlChatbot,
            enableAiKnowledgeManagement: body.enableAiKnowledgeManagement,
            enableAiAutonomousFollowup: body.enableAiAutonomousFollowup,
            enableMultiModelChatbot: body.enableMultiModelChatbot,
            maxSentencesPerMessage: body.maxSentencesPerMessage,
            conversationFlow: body.conversationFlow
        });

        // Map frontend field names to database column names
        const updates: Record<string, any> = {};

        // Note: updated_at is handled by database trigger, so we don't need to set it manually

        // Only add fields that are explicitly provided (not undefined or null)
        // This allows partial updates
        // Note: Empty strings are allowed and will be saved
        if (body.botName !== undefined && body.botName !== null) updates.bot_name = String(body.botName);
        if (body.botTone !== undefined && body.botTone !== null) updates.bot_tone = String(body.botTone);
        if (body.facebookVerifyToken !== undefined && body.facebookVerifyToken !== null) updates.facebook_verify_token = String(body.facebookVerifyToken);
        if (body.facebookPageAccessToken !== undefined && body.facebookPageAccessToken !== null) updates.facebook_page_access_token = String(body.facebookPageAccessToken);
        if (body.humanTakeoverTimeoutMinutes !== undefined && body.humanTakeoverTimeoutMinutes !== null) {
            const timeout = parseInt(String(body.humanTakeoverTimeoutMinutes), 10);
            if (!isNaN(timeout) && timeout >= 1 && timeout <= 60) {
                updates.human_takeover_timeout_minutes = timeout;
                console.log('[Settings API] Setting human_takeover_timeout_minutes to:', timeout);
            } else {
                console.warn('[Settings API] Invalid humanTakeoverTimeoutMinutes value:', body.humanTakeoverTimeoutMinutes, 'parsed as:', timeout);
            }
        } else {
            console.log('[Settings API] humanTakeoverTimeoutMinutes not provided in request body');
        }
        if (body.enableBestTimeContact !== undefined && body.enableBestTimeContact !== null) updates.enable_best_time_contact = Boolean(body.enableBestTimeContact);
        if (body.enableMlChatbot !== undefined && body.enableMlChatbot !== null) updates.enable_ml_chatbot = Boolean(body.enableMlChatbot);
        if (body.enableAiKnowledgeManagement !== undefined && body.enableAiKnowledgeManagement !== null) updates.enable_ai_knowledge_management = Boolean(body.enableAiKnowledgeManagement);
        if (body.enableAiAutonomousFollowup !== undefined && body.enableAiAutonomousFollowup !== null) updates.enable_ai_autonomous_followup = Boolean(body.enableAiAutonomousFollowup);
        if (body.enableMultiModelChatbot !== undefined && body.enableMultiModelChatbot !== null) updates.enable_multi_model_chatbot = Boolean(body.enableMultiModelChatbot);
        if (body.maxSentencesPerMessage !== undefined && body.maxSentencesPerMessage !== null) {
            // Allow values from -1 (AI decides), 0 (no limit), to 20
            const value = parseInt(String(body.maxSentencesPerMessage), 10);
            if (!isNaN(value) && value >= -1 && value <= 20) {
                updates.max_sentences_per_message = Number(value);
            }
        }
        if (body.conversationFlow !== undefined) {
            updates.conversation_flow = body.conversationFlow === null ? null : String(body.conversationFlow);
        }
        if (body.defaultAiModel !== undefined && body.defaultAiModel !== null) {
            updates.default_ai_model = String(body.defaultAiModel);
        }

        console.log('[Settings API] Updates object before validation:', updates);
        console.log('[Settings API] Updates keys:', Object.keys(updates));

        // CRITICAL: Validate updates object is not empty
        if (Object.keys(updates).length === 0) {
            console.error('[Settings API] ERROR - Updates object is empty! Cannot proceed with update.');
            console.error('[Settings API] Request body was:', JSON.stringify(body, null, 2));
            return NextResponse.json({
                error: 'No updates provided',
                details: 'The request did not contain any valid fields to update. This may indicate the max_sentences_per_message column does not exist in the database. Please run the migration: add_max_sentences_setting.sql'
            }, { status: 400 });
        }


        // Check if settings row exists
        const { data: existing, error: existingError } = await supabase
            .from('bot_settings')
            .select('id')
            .limit(1)
            .maybeSingle();

        // If error is not "not found", it's a real error
        if (existingError && existingError.code !== 'PGRST116') {
            console.error('[Settings API] Error checking for existing settings:', existingError);
            return NextResponse.json({
                error: 'Failed to check settings',
                details: existingError.message
            }, { status: 500 });
        }

        if (existing) {
            // Update existing row
            try {
                // Check if we're trying to update max_sentences_per_message and verify column exists
                if (updates.max_sentences_per_message !== undefined) {
                    const { data: columnCheck, error: columnError } = await supabase
                        .from('bot_settings')
                        .select('max_sentences_per_message')
                        .eq('id', existing.id)
                        .limit(1);

                    // Check for column missing error - catch any error when selecting the column
                    if (columnError) {
                        const errorMsg = String(columnError.message || '').toLowerCase();
                        const errorCode = String(columnError.code || '');

                        // If it's a column error (42703 = undefined_column), or any error when selecting this column, assume it doesn't exist
                        if (errorCode === '42703' ||
                            errorMsg.includes('column') ||
                            errorMsg.includes('does not exist') ||
                            errorMsg.includes('max_sentences_per_message') ||
                            errorMsg.includes('undefined') ||
                            errorCode.includes('PGRST')) {
                            return new Response(JSON.stringify({
                                error: 'Database column missing',
                                details: 'The max_sentences_per_message column does not exist in the database.',
                                solution: 'Please run this SQL migration in your Supabase SQL Editor:',
                                sql: 'ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;',
                                instructions: [
                                    '1. Go to Supabase Dashboard → SQL Editor',
                                    '2. Copy and paste the SQL above',
                                    '3. Click "Run"',
                                    '4. Refresh this page and try again'
                                ],
                                migrationFile: 'supabase/migrations/add_max_sentences_setting.sql',
                                errorCode: columnError.code,
                                errorMessage: columnError.message
                            }), {
                                status: 400,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Cache-Control': 'no-cache'
                                }
                            });
                        }
                    }
                }

                // Check if updates object is empty (shouldn't happen, but just in case)
                if (Object.keys(updates).length === 0) {
                    console.warn('[Settings API] No updates to apply, returning current settings');
                    // Fetch current settings and return them
                    const { data: current, error: fetchError } = await supabase
                        .from('bot_settings')
                        .select('*')
                        .eq('id', existing.id)
                        .single();

                    if (fetchError) {
                        console.error('[Settings API] Error fetching current settings:', fetchError);
                        return NextResponse.json({
                            error: 'Failed to fetch current settings',
                            details: fetchError.message
                        }, { status: 500 });
                    }

                    if (current) {
                        return NextResponse.json({
                            botName: current.bot_name || 'Assistant',
                            botTone: current.bot_tone || 'helpful and professional',
                            facebookVerifyToken: current.facebook_verify_token || 'TEST_TOKEN',
                            facebookPageAccessToken: current.facebook_page_access_token || '',
                            humanTakeoverTimeoutMinutes: current.human_takeover_timeout_minutes ?? 5,
                            enableBestTimeContact: current.enable_best_time_contact ?? false,
                            enableMlChatbot: current.enable_ml_chatbot ?? false,
                            enableAiKnowledgeManagement: current.enable_ai_knowledge_management ?? false,
                            enableAiAutonomousFollowup: current.enable_ai_autonomous_followup ?? false,
                            enableMultiModelChatbot: current.enable_multi_model_chatbot ?? true,
                            maxSentencesPerMessage: current.max_sentences_per_message ?? 3,
                            conversationFlow: current.conversation_flow || '',
                            defaultAiModel: current.default_ai_model || 'deepseek-ai/deepseek-v3.1',
                        });
                    }
                }

                let updatedData, error;
                try {
                    const result = await supabase
                        .from('bot_settings')
                        .update(updates)
                        .eq('id', existing.id)
                        .select()
                        .single();
                    updatedData = result.data;
                    error = result.error;
                } catch (updateException: any) {
                    console.error('[Settings API] Exception during Supabase update:', updateException);
                    error = {
                        code: 'UPDATE_EXCEPTION',
                        message: updateException?.message || String(updateException) || 'Unknown exception during update',
                        hint: 'An exception was thrown while calling Supabase update method'
                    };
                    updatedData = null;
                }

                // Check if error is about missing column BEFORE processing other errors
                if (error && updates.max_sentences_per_message !== undefined) {
                    const errorMsg = String(error.message || '').toLowerCase();
                    const errorCode = String(error.code || '');

                    if (errorCode === '42703' ||
                        errorMsg.includes('column') ||
                        errorMsg.includes('does not exist') ||
                        errorMsg.includes('max_sentences_per_message') ||
                        errorMsg.includes('undefined column')) {
                        return new Response(JSON.stringify({
                            error: 'Database column missing',
                            details: 'The max_sentences_per_message column does not exist in the database.',
                            solution: 'Please run this SQL migration in your Supabase SQL Editor:',
                            sql: 'ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;',
                            instructions: [
                                '1. Go to Supabase Dashboard → SQL Editor',
                                '2. Copy and paste the SQL above',
                                '3. Click "Run"',
                                '4. Refresh this page and try again'
                            ],
                            migrationFile: 'supabase/migrations/add_max_sentences_setting.sql',
                            errorCode: error.code,
                            errorMessage: error.message
                        }), {
                            status: 400,
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache'
                            }
                        });
                    }
                }

                if (error) {
                    console.error('[Settings API] Error updating settings:', error);

                    // Check for common error codes
                    const errorCode = String(error?.code || '');
                    let errorMessage = 'Failed to update settings';

                    if (errorCode.includes('42703') || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
                        errorMessage = 'Database column may not exist. Please run the migration: add_max_sentences_setting.sql';
                    } else if (errorCode.includes('42501') || error?.message?.includes('permission') || error?.message?.includes('policy')) {
                        errorMessage = 'Database permission error. Check RLS policies.';
                    }

                    // Build error response - use Record<string, string> to ensure all values are strings
                    const errorInfo: Record<string, string> = {
                        error: errorMessage,
                    };

                    // Extract error message
                    if (error?.message) {
                        errorInfo.details = String(error.message);
                    } else if (error) {
                        errorInfo.details = String(error);
                    } else {
                        errorInfo.details = 'Unknown database error';
                    }

                    // Extract error code
                    if (error?.code) {
                        errorInfo.code = String(error.code);
                    }

                    // Extract hint
                    if (error?.hint) {
                        errorInfo.hint = String(error.hint);
                    }

                    // Extract details
                    if (error?.details) {
                        errorInfo.details_full = String(error.details);
                    }

                    // errorInfo is guaranteed to be serializable (all strings)
                    // Use Response directly to avoid any NextResponse.json serialization issues
                    try {
                        const errorJson = JSON.stringify(errorInfo);
                        return new Response(errorJson, {
                            status: 500,
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache'
                            }
                        });
                    } catch (responseError) {
                        console.error('[Settings API] Failed to create error response:', responseError);
                        // Last resort - return a basic error using Response directly
                        return new Response(JSON.stringify({
                            error: 'Failed to update settings',
                            details: 'Database update failed',
                            code: errorCode || 'UNKNOWN',
                            fallback: true
                        }), {
                            status: 500,
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache'
                            }
                        });
                    }
                }

                if (!updatedData) {
                    console.error('[Settings API] Update succeeded but no data returned');
                    return NextResponse.json({
                        error: 'Update succeeded but no data returned'
                    }, { status: 500 });
                }

                console.log('[Settings API] Settings updated successfully');
                console.log('[Settings API] Updated data from database:', {
                    human_takeover_timeout_minutes: updatedData.human_takeover_timeout_minutes,
                    bot_tone: updatedData.bot_tone,
                    bot_name: updatedData.bot_name
                });

                // Return the updated settings with the actual saved value from database
                const responseData = {
                    botName: updatedData.bot_name || body.botName || 'Assistant',
                    botTone: updatedData.bot_tone || body.botTone || 'helpful and professional',
                    facebookVerifyToken: updatedData.facebook_verify_token || body.facebookVerifyToken || 'TEST_TOKEN',
                    facebookPageAccessToken: updatedData.facebook_page_access_token || body.facebookPageAccessToken || '',
                    humanTakeoverTimeoutMinutes: updatedData.human_takeover_timeout_minutes ?? body.humanTakeoverTimeoutMinutes ?? 5,
                    enableBestTimeContact: updatedData.enable_best_time_contact ?? body.enableBestTimeContact ?? false,
                    enableMlChatbot: updatedData.enable_ml_chatbot ?? body.enableMlChatbot ?? false,
                    enableAiKnowledgeManagement: updatedData.enable_ai_knowledge_management ?? body.enableAiKnowledgeManagement ?? false,
                    enableAiAutonomousFollowup: updatedData.enable_ai_autonomous_followup ?? body.enableAiAutonomousFollowup ?? false,
                    enableMultiModelChatbot: updatedData.enable_multi_model_chatbot ?? body.enableMultiModelChatbot ?? true,
                    maxSentencesPerMessage: updatedData.max_sentences_per_message !== null && updatedData.max_sentences_per_message !== undefined
                        ? Number(updatedData.max_sentences_per_message)
                        : (body.maxSentencesPerMessage !== undefined && body.maxSentencesPerMessage !== null
                            ? parseInt(String(body.maxSentencesPerMessage), 10)
                            : 3),
                    conversationFlow: updatedData.conversation_flow || body.conversationFlow || '',
                    defaultAiModel: updatedData.default_ai_model || body.defaultAiModel || 'deepseek-ai/deepseek-v3.1',
                };

                console.log('[Settings API] Returning response data:', {
                    humanTakeoverTimeoutMinutes: responseData.humanTakeoverTimeoutMinutes,
                    botTone: responseData.botTone
                });

                return NextResponse.json(responseData);
            } catch (updateError: any) {
                console.error('[Settings API] Exception during update:', updateError);

                // Safely serialize exception response
                const exceptionResponse: any = {
                    error: 'Exception during update',
                    details: updateError?.message || String(updateError) || 'Unknown exception',
                };

                if (process.env.NODE_ENV === 'development' && updateError?.stack) {
                    try {
                        exceptionResponse.stack = String(updateError.stack).substring(0, 1000);
                    } catch (e) {
                        // Ignore stack extraction errors
                    }
                }

                try {
                    JSON.stringify(exceptionResponse); // Test serialization
                    return NextResponse.json(exceptionResponse, { status: 500 });
                } catch (serializeError) {
                    console.error('[Settings API] Error serializing exception response:', serializeError);
                    return NextResponse.json({
                        error: 'Exception during update',
                        details: 'An exception occurred but could not be serialized'
                    }, { status: 500 });
                }
            }
        } else {
            // Insert new row
            const insertData: Record<string, any> = {
                bot_name: body.botName || 'Assistant',
            bot_tone: body.botTone || 'helpful and professional',
            facebook_verify_token: body.facebookVerifyToken || 'TEST_TOKEN',
            facebook_page_access_token: body.facebookPageAccessToken || null,
            human_takeover_timeout_minutes: body.humanTakeoverTimeoutMinutes ?? 5,
            enable_best_time_contact: body.enableBestTimeContact ?? false,
            enable_ml_chatbot: body.enableMlChatbot ?? false,
            enable_ai_knowledge_management: body.enableAiKnowledgeManagement ?? false,
            enable_ai_autonomous_followup: body.enableAiAutonomousFollowup ?? false,
            enable_multi_model_chatbot: body.enableMultiModelChatbot ?? true,
        };

            // Only include max_sentences_per_message if it was provided
            if (body.maxSentencesPerMessage !== undefined && body.maxSentencesPerMessage !== null) {
                const value = parseInt(String(body.maxSentencesPerMessage), 10);
                // Allow -1 (AI decides), 0 (no limit), or 1-20
                if (!isNaN(value) && value >= -1 && value <= 20) {
                    insertData.max_sentences_per_message = value;
                } else {
                    insertData.max_sentences_per_message = 3; // Default
                }
            } else {
                insertData.max_sentences_per_message = 3; // Default
            }

            // Include conversation_flow if provided
            if (body.conversationFlow !== undefined) {
                insertData.conversation_flow = body.conversationFlow === null ? null : String(body.conversationFlow);
            }

            // Include default_ai_model if provided
            if (body.defaultAiModel !== undefined && body.defaultAiModel !== null) {
                insertData.default_ai_model = String(body.defaultAiModel);
            } else {
                insertData.default_ai_model = 'deepseek-ai/deepseek-v3.1';
            }

            const { data: insertedData, error } = await supabase
                .from('bot_settings')
                .insert(insertData)
                .select()
                .single();

            if (error) {
                console.error('Error inserting settings:', error);
                return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
            }

            // Return the inserted settings with the actual saved value from database
            if (insertedData) {
                return NextResponse.json({
                    botName: insertedData.bot_name || body.botName || 'Assistant',
                    botTone: insertedData.bot_tone || body.botTone || 'helpful and professional',
                    facebookVerifyToken: insertedData.facebook_verify_token || body.facebookVerifyToken || 'TEST_TOKEN',
                    facebookPageAccessToken: insertedData.facebook_page_access_token || body.facebookPageAccessToken || '',
                    humanTakeoverTimeoutMinutes: insertedData.human_takeover_timeout_minutes ?? body.humanTakeoverTimeoutMinutes ?? 5,
                    enableBestTimeContact: insertedData.enable_best_time_contact ?? body.enableBestTimeContact ?? false,
                    enableMlChatbot: insertedData.enable_ml_chatbot ?? body.enableMlChatbot ?? false,
                    enableAiKnowledgeManagement: insertedData.enable_ai_knowledge_management ?? body.enableAiKnowledgeManagement ?? false,
                    enableAiAutonomousFollowup: insertedData.enable_ai_autonomous_followup ?? body.enableAiAutonomousFollowup ?? false,
                    enableMultiModelChatbot: insertedData.enable_multi_model_chatbot ?? body.enableMultiModelChatbot ?? true,
                    maxSentencesPerMessage: insertedData.max_sentences_per_message !== null && insertedData.max_sentences_per_message !== undefined
                        ? Number(insertedData.max_sentences_per_message)
                        : (body.maxSentencesPerMessage !== undefined && body.maxSentencesPerMessage !== null
                            ? parseInt(String(body.maxSentencesPerMessage), 10)
                            : 3),
                    conversationFlow: insertedData.conversation_flow || body.conversationFlow || '',
                    defaultAiModel: insertedData.default_ai_model || body.defaultAiModel || 'deepseek-ai/deepseek-v3.1',
                });
            }
        }

        // Fallback - should not normally reach here
        return NextResponse.json({
            botName: body.botName,
            botTone: body.botTone,
            facebookVerifyToken: body.facebookVerifyToken,
            facebookPageAccessToken: body.facebookPageAccessToken,
            humanTakeoverTimeoutMinutes: body.humanTakeoverTimeoutMinutes,
            enableBestTimeContact: body.enableBestTimeContact,
            enableMlChatbot: body.enableMlChatbot,
            enableAiKnowledgeManagement: body.enableAiKnowledgeManagement,
            enableAiAutonomousFollowup: body.enableAiAutonomousFollowup,
            enableMultiModelChatbot: body.enableMultiModelChatbot ?? true,
            maxSentencesPerMessage: body.maxSentencesPerMessage !== undefined && body.maxSentencesPerMessage !== null
                ? parseInt(String(body.maxSentencesPerMessage), 10)
                : 3,
            conversationFlow: body.conversationFlow || '',
            defaultAiModel: body.defaultAiModel || 'deepseek-ai/deepseek-v3.1',
        });
    } catch (error: any) {
        console.error('[Settings API] Unexpected error:', error);

        const errorResponse: Record<string, string> = {
            error: 'Internal Server Error',
            details: 'An unexpected error occurred'
        };

        try {
            if (error?.message) {
                errorResponse.details = String(error.message).substring(0, 500);
            } else if (typeof error === 'string') {
                errorResponse.details = error.substring(0, 500);
            }
        } catch (e) {
            // Keep default details
        }

        if (process.env.NODE_ENV === 'development' && error?.stack) {
            try {
                errorResponse.stack = String(error.stack).substring(0, 1000);
            } catch (e) {
                // Ignore stack extraction errors
            }
        }

        try {
            const errorJson = JSON.stringify(errorResponse);
            return new Response(errorJson, {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
        } catch (serializeError) {
            console.error('[Settings API] Error serializing top-level error response:', serializeError);
            return new Response(JSON.stringify({
                error: 'Internal Server Error',
                details: 'An error occurred but could not be serialized'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    }
}
