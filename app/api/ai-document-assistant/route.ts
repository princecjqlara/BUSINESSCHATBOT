/**
 * AI Document Assistant API
 * Uses GPT OSS 120B or best available large model for document analysis and editing
 * Has full context of bot knowledge, rules, personality, etc.
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';
import { searchDocuments } from '@/app/lib/rag';
import { searchWeb, formatSearchResults, shouldSearchWeb } from '@/app/lib/webSearch';

// Use best available large models for document editing
// Try GPT OSS 120B first, then fallback to other large models
const DOCUMENT_AI_MODELS = [
    'meta/llama-3.1-405b-instruct',  // Best for complex document editing
    'qwen/qwen3-235b-a22b',          // Excellent for analysis and editing
    'meta/llama-3.1-70b-instruct',   // Fallback
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Get the best available model for document editing
 */
async function getBestDocumentModel(): Promise<string> {
    for (const model of DOCUMENT_AI_MODELS) {
        try {
            // Test if model is available
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Document AI] Using model: ${model}`);
            return model;
        } catch (error) {
            // Model not available, try next
            continue;
        }
    }
    // Fallback to default
    console.log(`[Document AI] Using fallback model: ${DOCUMENT_AI_MODELS[DOCUMENT_AI_MODELS.length - 1]}`);
    return DOCUMENT_AI_MODELS[DOCUMENT_AI_MODELS.length - 1];
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
            console.error('[Document AI] Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
        }

        return data || { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    } catch (error) {
        console.error('[Document AI] Error fetching bot settings:', error);
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
            console.error('[Document AI] Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('[Document AI] Error fetching bot rules:', error);
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
            console.error('[Document AI] Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('[Document AI] Error fetching bot instructions:', error);
        return '';
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            documentText,
            documentName,
            userPrompt,
            conversationHistory = [],
        } = body;

        // Allow empty document text (user might want to create new content)
        // But ensure it's at least a string
        const safeDocumentText = documentText || '';

        if (!userPrompt) {
            return NextResponse.json(
                { error: 'User prompt is required' },
                { status: 400 }
            );
        }

        // Get the best available model
        const model = await getBestDocumentModel();

        // Check if web search is needed
        const needsWebSearch = shouldSearchWeb(userPrompt, documentText);
        
        // Fetch bot context and web search results in parallel
        const [botSettings, botRules, botInstructions, knowledgeContext, webSearchResults] = await Promise.all([
            getBotSettings(),
            getBotRules(),
            getBotInstructions(),
            safeDocumentText ? searchDocuments(safeDocumentText, 5) : Promise.resolve(null), // Get relevant knowledge base context
            needsWebSearch ? searchWeb(userPrompt + ' ' + (safeDocumentText.substring(0, 200) || ''), 5) : Promise.resolve([]),
        ]);

        console.log('[Document AI] Bot context loaded:', {
            botName: botSettings.bot_name,
            botTone: botSettings.bot_tone,
            rulesCount: botRules.length,
            hasInstructions: !!botInstructions,
            hasKnowledge: !!knowledgeContext,
            webSearchPerformed: needsWebSearch,
            webResultsCount: webSearchResults.length,
        });

        // Build conversation context
        const conversationContext = conversationHistory
            .map((msg: { role: string; content: string }) => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
            )
            .join('\n\n');

        // Build system prompt for document editing with full bot context
        let systemPrompt = `You are an expert document editor and writing assistant for a chatbot. Your task is to analyze and edit documents that will be used in a chatbot's knowledge base.

IMPORTANT CONTEXT - BOT CONFIGURATION:
You are editing documents for a chatbot with the following configuration:

BOT PERSONALITY:
- Bot Name: ${botSettings.bot_name || 'Assistant'}
- Bot Tone/Style: ${botSettings.bot_tone || 'helpful and professional'}

BOT RULES (MUST FOLLOW THESE WHEN EDITING):
${botRules.length > 0 
    ? botRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : 'No specific rules configured.'}

BOT INSTRUCTIONS:
${botInstructions || 'No specific instructions configured.'}

KNOWLEDGE BASE CONTEXT:
${knowledgeContext && typeof knowledgeContext === 'object' && knowledgeContext.content
    ? `Here's relevant information from the bot's knowledge base that might be related to this document:\n${knowledgeContext.content.substring(0, 1500)}`
    : 'No related knowledge base content found.'}

${webSearchResults.length > 0 
    ? `\n\n${formatSearchResults(webSearchResults)}\n\nIMPORTANT: Use the web search results above to provide current, accurate information. You can reference these sources when editing the document. If the web search results contain more current or accurate information than what's in the document, prioritize the web search results.`
    : ''}

DOCUMENT EDITING GUIDELINES:

CAPABILITIES:
- Grammar and spelling correction
- Style improvements that match the bot's tone (${botSettings.bot_tone || 'helpful and professional'})
- Content expansion or summarization
- Structural improvements
- Clarity and readability enhancements
- Adding or removing content based on instructions
- Formatting improvements
- Ensuring consistency with bot rules and knowledge base

CRITICAL INSTRUCTIONS:
1. Carefully read the user's document
2. Understand what the user wants you to do (from their prompt and conversation history)
3. **ALWAYS ensure edited content aligns with the bot's personality, tone, and rules above**
4. **When adding or modifying content, make sure it's consistent with the bot's knowledge base context**
5. **Follow all bot rules when editing - if a rule says something specific, ensure the document reflects that**
6. **If web search results are provided, use them to add current, accurate information to the document**
7. **When using web search results, cite or reference them naturally in the document**
8. Make the requested changes while preserving the document's core meaning and intent
9. If the user asks for style changes, apply them consistently throughout while maintaining bot tone
10. If the user asks to add content, make it relevant, well-integrated, and consistent with bot knowledge
11. If the user asks to remove content, do so cleanly
12. Always maintain the document's original purpose and key information
13. Ensure the edited document will help the bot provide accurate, helpful responses to users
14. Provide a brief explanation of what you changed and how it aligns with bot configuration
${webSearchResults.length > 0 ? '15. Mention if you used web search results to update information' : ''}

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON object.

The JSON structure must be exactly:
{
  "editedText": "The complete edited document text here",
  "explanation": "Brief explanation of what you changed and why"
}

CRITICAL REQUIREMENTS:
- Return ONLY the JSON object, nothing else before or after
- Do NOT wrap it in markdown code blocks (no \`\`\`json)
- Do NOT add any text before or after the JSON
- The editedText field must contain the complete edited document
- Use proper JSON escaping for quotes and newlines (\\" for quotes, \\n for newlines)
- Keep the explanation concise (1-2 sentences)
- The JSON must be valid and parseable

Example of correct output:
{"editedText":"Complete document text here","explanation":"I made these changes because..."}

Do NOT output like this:
\`\`\`json
{"editedText":"..."}
\`\`\`

Just output the raw JSON object.`;

        // Build user message
        let userMessage = `Document Name: ${documentName || 'Untitled Document'}

Current Document:
${safeDocumentText || '(Document is empty - you can create new content)'}

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
            // Look for the first { and last } to extract the JSON
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
            }
            
            // Step 3: Try to fix common JSON issues
            // Remove any trailing commas before closing braces/brackets
            cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1');
            
            // Step 4: Parse the JSON
            parsedResponse = JSON.parse(cleanedResponse);
            
            // Step 5: Validate that we have the required fields
            if (!parsedResponse.editedText) {
                throw new Error('Missing editedText field in JSON response');
            }
            
            // Ensure explanation exists
            if (!parsedResponse.explanation) {
                parsedResponse.explanation = 'I\'ve made the requested changes to your document.';
            }
            
        } catch (parseError) {
            console.warn('[Document AI] Failed to parse JSON:', parseError);
            console.warn('[Document AI] Raw response (first 1000 chars):', responseText.substring(0, 1000));
            
            // Fallback: Try to extract content using regex (handles multi-line strings)
            try {
                // More robust regex that handles escaped quotes and newlines
                const editedTextRegex = /"editedText"\s*:\s*"((?:[^"\\]|\\.)*)"/;
                const explanationRegex = /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/;
                
                const editedTextMatch = responseText.match(editedTextRegex);
                const explanationMatch = responseText.match(explanationRegex);
                
                if (editedTextMatch && editedTextMatch[1]) {
                    // Unescape JSON string
                    let editedText = editedTextMatch[1]
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
                        : 'I\'ve made the requested changes to your document.';
                    
                    parsedResponse = {
                        editedText,
                        explanation,
                    };
                } else {
                    throw new Error('Could not extract editedText from response');
                }
            } catch (extractError) {
                console.error('[Document AI] Failed to extract JSON fields:', extractError);
                // Last resort: treat entire response as edited text
                parsedResponse = {
                    editedText: responseText.trim(),
                    explanation: 'I\'ve made the requested changes to your document. Note: The response format was not standard, but I\'ve included the full response.',
                };
            }
        }

        // Enhance explanation to mention bot context and web search if not already included
        let explanation = parsedResponse.explanation || 'I\'ve analyzed and edited your document based on your request.';
        if (!explanation.toLowerCase().includes('bot') && !explanation.toLowerCase().includes('tone') && !explanation.toLowerCase().includes('rule')) {
            explanation += ` The edits have been made to align with your bot's personality (${botSettings.bot_tone || 'helpful and professional'}) and rules.`;
        }
        if (webSearchResults.length > 0 && !explanation.toLowerCase().includes('web') && !explanation.toLowerCase().includes('search') && !explanation.toLowerCase().includes('current')) {
            explanation += ` I've also used current web search results to ensure the information is up-to-date.`;
        }

        return NextResponse.json({
            success: true,
            editedText: parsedResponse.editedText || responseText,
            explanation,
            modelUsed: model,
        });
    } catch (error: any) {
        console.error('[Document AI] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to process document editing request',
            },
            { status: 500 }
        );
    }
}

