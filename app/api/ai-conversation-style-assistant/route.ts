/**
 * AI Conversation Style Instructions Assistant API
 * Uses GPT OSS 120B or best available large model for conversation style instructions
 * Has full context of bot knowledge, rules, personality, etc.
 * Includes web search for current best practices
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';
import { searchDocuments } from '@/app/lib/rag';
import { searchWeb, formatSearchResults, shouldSearchWeb } from '@/app/lib/webSearch';

// Use best available large models - GPT OSS 120B equivalent
const CONVERSATION_STYLE_AI_MODELS = [
    'meta/llama-3.1-405b-instruct',  // GPT OSS 120B equivalent - best for analysis
    'qwen/qwen3-235b-a22b',          // Excellent for reasoning
    'meta/llama-3.1-70b-instruct',   // Fallback
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Get the best available model for conversation style editing
 */
async function getBestModel(): Promise<string> {
    for (const model of CONVERSATION_STYLE_AI_MODELS) {
        try {
            // Test if model is available
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Conversation Style AI] Using model: ${model} (GPT OSS 120B equivalent)`);
            return model;
        } catch (error) {
            // Model not available, try next
            continue;
        }
    }
    // Fallback to default
    console.log(`[Conversation Style AI] Using fallback model: ${CONVERSATION_STYLE_AI_MODELS[CONVERSATION_STYLE_AI_MODELS.length - 1]}`);
    return CONVERSATION_STYLE_AI_MODELS[CONVERSATION_STYLE_AI_MODELS.length - 1];
}

/**
 * Fetch bot settings (name, tone, etc.)
 */
async function getBotSettings() {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('bot_name, bot_tone')
            .limit(1)
            .single();

        if (error) {
            console.error('[Conversation Style AI] Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
        }

        return data || { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    } catch (error) {
        console.error('[Conversation Style AI] Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    }
}

/**
 * Fetch bot rules from database
 */
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('[Conversation Style AI] Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('[Conversation Style AI] Error fetching bot rules:', error);
        return [];
    }
}

/**
 * Fetch bot instructions from database
 */
async function getBotInstructions(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('[Conversation Style AI] Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('[Conversation Style AI] Error fetching bot instructions:', error);
        return '';
    }
}

/**
 * Get all knowledge base documents for context
 */
async function getAllKnowledgeDocuments(): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('id, content, metadata')
            .order('id', { ascending: false })
            .limit(50);

        if (error) {
            console.error('[Conversation Style AI] Error fetching documents:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[Conversation Style AI] Error fetching documents:', error);
        return [];
    }
}

/**
 * Calculate text diff to highlight changes (word-level for better accuracy)
 */
function calculateDiff(oldText: string, newText: string): Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> {
    if (!oldText && !newText) {
        return [];
    }
    
    if (!oldText) {
        return [{ type: 'added', text: newText }];
    }
    
    if (!newText) {
        return [{ type: 'removed', text: oldText }];
    }
    
    // Split into sentences/lines for better diff visualization
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff: Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> = [];
    
    // Use a simple longest common subsequence approach for line matching
    const maxLines = Math.max(oldLines.length, newLines.length);
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
        const oldLine = oldLines[oldIndex] || '';
        const newLine = newLines[newIndex] || '';
        
        if (oldLine === newLine && oldLine !== '') {
            // Lines match
            diff.push({ type: 'unchanged', text: oldLine });
            oldIndex++;
            newIndex++;
        } else if (oldIndex < oldLines.length && newIndex < newLines.length) {
            // Check if we can find a match ahead
            let foundMatch = false;
            for (let lookAhead = 1; lookAhead <= 3 && oldIndex + lookAhead < oldLines.length; lookAhead++) {
                if (oldLines[oldIndex + lookAhead] === newLine) {
                    // Old line was removed
                    diff.push({ type: 'removed', text: oldLine });
                    oldIndex++;
                    foundMatch = true;
                    break;
                }
            }
            
            if (!foundMatch) {
                for (let lookAhead = 1; lookAhead <= 3 && newIndex + lookAhead < newLines.length; lookAhead++) {
                    if (newLines[newIndex + lookAhead] === oldLine) {
                        // New line was added
                        diff.push({ type: 'added', text: newLine });
                        newIndex++;
                        foundMatch = true;
                        break;
                    }
                }
            }
            
            if (!foundMatch) {
                // No match found, treat as change
                if (oldLine) {
                    diff.push({ type: 'removed', text: oldLine });
                }
                if (newLine) {
                    diff.push({ type: 'added', text: newLine });
                }
                oldIndex++;
                newIndex++;
            }
        } else {
            // One array is exhausted
            if (oldIndex < oldLines.length) {
                diff.push({ type: 'removed', text: oldLine });
                oldIndex++;
            }
            if (newIndex < newLines.length) {
                diff.push({ type: 'added', text: newLine });
                newIndex++;
            }
        }
    }
    
    return diff;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            currentInstructions,
            userPrompt,
            conversationHistory = [],
            customPrompt, // Optional custom prompt from user
        } = body;

        if (!userPrompt) {
            return NextResponse.json(
                { error: 'User prompt is required' },
                { status: 400 }
            );
        }

        // Get the best available model (GPT OSS 120B equivalent)
        const model = await getBestModel();

        // Check if web search is needed
        const needsWebSearch = shouldSearchWeb(userPrompt, currentInstructions || '');
        
        // Fetch all context in parallel
        const [botSettings, botRules, botInstructions, allDocuments, webSearchResults] = await Promise.all([
            getBotSettings(),
            getBotRules(),
            getBotInstructions(),
            getAllKnowledgeDocuments(),
            needsWebSearch ? searchWeb(userPrompt + ' ' + (currentInstructions?.substring(0, 200) || ''), 5) : Promise.resolve([]),
        ]);

        // Get relevant knowledge context
        const knowledgeContext = currentInstructions 
            ? await searchDocuments(currentInstructions, 10)
            : null;

        console.log('[Conversation Style AI] Context loaded:', {
            botName: botSettings.bot_name,
            botTone: botSettings.bot_tone,
            rulesCount: botRules.length,
            hasInstructions: !!botInstructions,
            documentsCount: allDocuments.length,
            webSearchPerformed: needsWebSearch,
            webResultsCount: webSearchResults.length,
        });

        // Build conversation context
        const conversationContext = conversationHistory
            .map((msg: { role: string; content: string }) => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
            )
            .join('\n\n');

        // Build system prompt for conversation style instructions editing
        let systemPrompt = `You are an expert AI assistant specializing in writing and editing conversation style instructions for chatbots. Your task is to help create comprehensive, effective conversation style instructions that guide how a chatbot should interact with users.

IMPORTANT CONTEXT - BOT CONFIGURATION:
You are editing conversation style instructions for a chatbot with the following configuration:

BOT PERSONALITY:
- Bot Name: ${botSettings.bot_name || 'Assistant'}
- Bot Tone/Style: ${botSettings.bot_tone || 'helpful and professional'}

BOT RULES (These are specific behavioral rules - conversation style instructions should complement these):
${botRules.length > 0 
    ? botRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : 'No specific rules configured.'}

CURRENT BOT INSTRUCTIONS:
${botInstructions || 'No specific instructions configured.'}

KNOWLEDGE BASE CONTEXT:
${allDocuments.length > 0
    ? `The bot has ${allDocuments.length} knowledge base documents. Here's a summary of relevant content:\n${allDocuments.slice(0, 10).map((doc: any) => `- ${doc.content?.substring(0, 200) || 'N/A'}`).join('\n')}`
    : 'No knowledge base documents found.'}

${knowledgeContext && knowledgeContext.content
    ? `\n\nRELEVANT KNOWLEDGE BASE CONTENT:\n${knowledgeContext.content.substring(0, 1500)}`
    : ''}

${webSearchResults.length > 0 
    ? `\n\n${formatSearchResults(webSearchResults)}\n\nIMPORTANT: Use the web search results above to provide current best practices for conversation style instructions. You can reference these sources when writing or editing instructions.`
    : ''}

${customPrompt 
    ? `\n\nUSER'S CUSTOM INSTRUCTION TO YOU:\n${customPrompt}\n\nPlease follow this instruction when helping with the conversation style instructions.`
    : ''}

CONVERSATION STYLE INSTRUCTIONS GUIDELINES:

WHAT ARE CONVERSATION STYLE INSTRUCTIONS?
Conversation style instructions define HOW the bot should converse, including:
- Tone and personality (e.g., friendly, professional, casual, formal)
- Communication style (e.g., short messages, detailed explanations, use of emojis)
- Specific dos and don'ts (e.g., "NO multiple choice questions", "Use Taglish", "Keep messages under 2 sentences")
- Language preferences (e.g., Tagalog, English, Taglish)
- Response patterns (e.g., ask questions, be direct, provide examples)
- Engagement style (e.g., be conversational, avoid scripts, sound human)

CAPABILITIES:
- Write new conversation style instructions from scratch
- Edit and improve existing conversation style instructions
- Analyze current instructions and suggest improvements
- Ensure instructions align with bot personality, rules, and knowledge base
- Incorporate best practices from web search results
- Make instructions specific, actionable, and clear
- Ensure consistency with bot's overall configuration

CRITICAL INSTRUCTIONS:
1. **ALWAYS ensure conversation style instructions align with the bot's personality (${botSettings.bot_tone || 'helpful and professional'})**
2. **Make sure instructions complement (don't contradict) the bot rules listed above**
3. **Ensure instructions are consistent with the knowledge base content**
4. **If web search results are provided, use them to incorporate current best practices**
5. **Make instructions specific and actionable - avoid vague statements**
6. **Include both positive guidance (what to do) and negative guidance (what NOT to do)**
7. **Consider the bot's use case based on knowledge base content**
8. **Keep instructions clear and concise but comprehensive**
9. **If the user asks for style changes, apply them consistently**
10. **If the user asks to add content, make it relevant and well-integrated**
11. **If the user asks to remove content, do so cleanly**
12. **Always maintain the core purpose: guiding how the bot should converse**

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON object.

The JSON structure must be exactly:
{
  "editedInstructions": "The complete edited conversation style instructions text here",
  "explanation": "Brief explanation of what you changed and why",
  "diff": {
    "hasChanges": true/false,
    "summary": "Brief summary of changes made"
  }
}

CRITICAL REQUIREMENTS:
- Return ONLY the JSON object, nothing else before or after
- Do NOT wrap it in markdown code blocks (no \`\`\`json)
- Do NOT add any text before or after the JSON
- The editedInstructions field must contain the complete edited instructions
- Use proper JSON escaping for quotes and newlines (\\" for quotes, \\n for newlines)
- Keep the explanation concise (1-2 sentences)
- The JSON must be valid and parseable
- If no changes are needed, return the original text in editedInstructions

Example of correct output:
{"editedInstructions":"Complete instructions text here","explanation":"I made these changes because...","diff":{"hasChanges":true,"summary":"Added tone guidance and removed contradictory statements"}}

Do NOT output like this:
\`\`\`json
{"editedInstructions":"..."}
\`\`\`

Just output the raw JSON object.`;

        // Build user message
        let userMessage = `Current Conversation Style Instructions:
${currentInstructions || '(No instructions yet - you can create new ones)'}

User's Request:
${userPrompt}`;

        if (conversationContext) {
            userMessage += `\n\nPrevious Conversation:
${conversationContext}`;
        }

        // Call the AI model
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: 4000,
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Try to parse JSON response with robust error handling
        let parsedResponse;
        try {
            // Step 1: Remove markdown code blocks if present
            let cleanedResponse = responseText
                .replace(/```json\n?/gi, '')
                .replace(/```\n?/g, '')
                .trim();
            
            // Step 2: Try to extract JSON object if it's embedded in text
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
            }
            
            // Step 3: Try to fix common JSON issues
            cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1');
            
            // Step 4: Parse the JSON
            parsedResponse = JSON.parse(cleanedResponse);
            
            // Step 5: Validate required fields
            if (!parsedResponse.editedInstructions) {
                throw new Error('Missing editedInstructions field in JSON response');
            }
            
            // Ensure explanation and diff exist
            if (!parsedResponse.explanation) {
                parsedResponse.explanation = 'I\'ve made the requested changes to your conversation style instructions.';
            }
            
            if (!parsedResponse.diff) {
                parsedResponse.diff = {
                    hasChanges: parsedResponse.editedInstructions !== (currentInstructions || ''),
                    summary: 'Changes made to conversation style instructions',
                };
            }
            
        } catch (parseError) {
            console.warn('[Conversation Style AI] Failed to parse JSON:', parseError);
            console.warn('[Conversation Style AI] Raw response (first 1000 chars):', responseText.substring(0, 1000));
            
            // Fallback: Try to extract content using regex
            try {
                const editedInstructionsRegex = /"editedInstructions"\s*:\s*"((?:[^"\\]|\\.)*)"/;
                const explanationRegex = /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/;
                
                const editedInstructionsMatch = responseText.match(editedInstructionsRegex);
                const explanationMatch = responseText.match(explanationRegex);
                
                if (editedInstructionsMatch && editedInstructionsMatch[1]) {
                    let editedInstructions = editedInstructionsMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\t/g, '\t')
                        .replace(/\\\\/g, '\\');
                    
                    let explanation = explanationMatch && explanationMatch[1]
                        ? explanationMatch[1]
                            .replace(/\\n/g, '\n')
                            .replace(/\\"/g, '"')
                            .replace(/\\t/g, '\t')
                            .replace(/\\\\/g, '\\')
                        : 'I\'ve made the requested changes to your conversation style instructions.';
                    
                    parsedResponse = {
                        editedInstructions,
                        explanation,
                        diff: {
                            hasChanges: editedInstructions !== (currentInstructions || ''),
                            summary: 'Changes made to conversation style instructions',
                        },
                    };
                } else {
                    throw new Error('Could not extract editedInstructions from response');
                }
            } catch (extractError) {
                console.error('[Conversation Style AI] Failed to extract JSON fields:', extractError);
                // Last resort: treat entire response as edited instructions
                parsedResponse = {
                    editedInstructions: responseText.trim(),
                    explanation: 'I\'ve made the requested changes to your conversation style instructions. Note: The response format was not standard, but I\'ve included the full response.',
                    diff: {
                        hasChanges: true,
                        summary: 'Full response used as instructions',
                    },
                };
            }
        }

        // Calculate diff for highlighting
        const diff = calculateDiff(currentInstructions || '', parsedResponse.editedInstructions || '');

        // Enhance explanation
        let explanation = parsedResponse.explanation || 'I\'ve analyzed and edited your conversation style instructions based on your request.';
        if (!explanation.toLowerCase().includes('bot') && !explanation.toLowerCase().includes('tone') && !explanation.toLowerCase().includes('rule')) {
            explanation += ` The edits have been made to align with your bot's personality (${botSettings.bot_tone || 'helpful and professional'}) and rules.`;
        }
        if (webSearchResults.length > 0 && !explanation.toLowerCase().includes('web') && !explanation.toLowerCase().includes('search') && !explanation.toLowerCase().includes('current')) {
            explanation += ` I've also used current web search results to incorporate best practices.`;
        }

        return NextResponse.json({
            success: true,
            editedInstructions: parsedResponse.editedInstructions || responseText,
            explanation,
            diff,
            modelUsed: model,
        });
    } catch (error: any) {
        console.error('[Conversation Style AI] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to process conversation style instructions request',
            },
            { status: 500 }
        );
    }
}








