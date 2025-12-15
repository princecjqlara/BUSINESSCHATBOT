/**
 * AI Knowledge Base Assistant API
 * Uses large models for knowledge base management with web search
 * Can read, edit, and manage knowledge base documents
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';
import { searchDocuments } from '@/app/lib/rag';
import { searchWeb, formatSearchResults, shouldSearchWeb } from '@/app/lib/webSearch';

// Use best available large models
const KNOWLEDGE_AI_MODELS = [
    'meta/llama-3.1-405b-instruct',
    'qwen/qwen3-235b-a22b',
    'meta/llama-3.1-70b-instruct',
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Get the best available model
 */
async function getBestModel(): Promise<string> {
    for (const model of KNOWLEDGE_AI_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Knowledge AI] Using model: ${model}`);
            return model;
        } catch (error) {
            continue;
        }
    }
    console.log(`[Knowledge AI] Using fallback model: ${KNOWLEDGE_AI_MODELS[KNOWLEDGE_AI_MODELS.length - 1]}`);
    return KNOWLEDGE_AI_MODELS[KNOWLEDGE_AI_MODELS.length - 1];
}

/**
 * Fetch bot settings
 */
async function getBotSettings() {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('bot_name, bot_tone')
            .limit(1)
            .single();

        if (error) {
            console.error('[Knowledge AI] Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
        }

        return data || { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    } catch (error) {
        console.error('[Knowledge AI] Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    }
}

/**
 * Fetch bot rules
 */
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('[Knowledge AI] Error fetching bot rules:', error);
            return [];
        }

        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('[Knowledge AI] Error fetching bot rules:', error);
        return [];
    }
}

/**
 * Fetch bot instructions
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
            console.error('[Knowledge AI] Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('[Knowledge AI] Error fetching bot instructions:', error);
        return '';
    }
}

/**
 * Get all knowledge base documents
 */
async function getAllKnowledgeDocuments(): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('id, content, metadata, folder_id, category_id')
            .order('id', { ascending: false })
            .limit(100);

        if (error) {
            console.error('[Knowledge AI] Error fetching documents:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[Knowledge AI] Error fetching documents:', error);
        return [];
    }
}

/**
 * Update a knowledge base document
 */
async function updateKnowledgeDocument(id: number, text: string, name?: string): Promise<boolean> {
    try {
        // Get existing document
        const { data: docChunk, error: fetchError } = await supabase
            .from('documents')
            .select('id, metadata, category_id, folder_id')
            .eq('id', id)
            .single();

        if (fetchError || !docChunk) {
            console.error('[Knowledge AI] Document not found:', id);
            return false;
        }

        const documentName = name || docChunk.metadata?.name;
        const categoryId = docChunk.category_id;
        const folderId = docChunk.folder_id;
        const existingDocumentId = docChunk.metadata?.documentId;

        // Find all chunks of this document
        let chunksToDelete: any[] = [];

        if (existingDocumentId) {
            const { data: allDocs } = await supabase
                .from('documents')
                .select('id, metadata');

            if (allDocs) {
                chunksToDelete = allDocs
                    .filter((doc: any) => doc.metadata?.documentId === existingDocumentId)
                    .map((doc: any) => ({ id: doc.id }));
            }
        } else {
            const { data: allDocs } = await supabase
                .from('documents')
                .select('id, metadata, category_id');

            if (allDocs) {
                chunksToDelete = allDocs
                    .filter((doc: any) => {
                        const nameMatch = documentName ? doc.metadata?.name === documentName : true;
                        const categoryMatch = categoryId ? doc.category_id === categoryId : true;
                        return (nameMatch && categoryMatch) || doc.id === id;
                    })
                    .map((doc: any) => ({ id: doc.id }));
            }
        }

        // Delete old chunks
        if (chunksToDelete.length > 0) {
            const chunkIds = chunksToDelete.map((c: any) => c.id);
            await supabase
                .from('documents')
                .delete()
                .in('id', chunkIds);
        }

        // Add new document using addDocument function
        const { addDocument } = await import('@/app/lib/rag');
        const metadata: any = {
            categoryId: categoryId,
            folderId: folderId,
        };
        if (documentName) metadata.name = documentName;
        if (existingDocumentId) metadata.documentId = existingDocumentId;

        const success = await addDocument(text, metadata);
        return success;
    } catch (error) {
        console.error('[Knowledge AI] Error updating document:', error);
        return false;
    }
}

/**
 * Create a new knowledge base document
 */
async function createKnowledgeDocument(text: string, name?: string, categoryId?: string): Promise<number | null> {
    try {
        const { addDocument } = await import('@/app/lib/rag');
        const metadata: any = {};
        if (name) metadata.name = name;
        if (categoryId) metadata.categoryId = categoryId;

        // addDocument now throws on error instead of returning false
        await addDocument(text, metadata);

        // Get the newly created document ID
        const { data } = await supabase
            .from('documents')
            .select('id')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        return data?.id || null;
    } catch (error) {
        console.error('[Knowledge AI] Error creating document:', error);
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            userPrompt,
            conversationHistory = [],
            action, // 'read', 'edit', 'create', 'query', or 'general'
            documentId,
            documentName,
        } = body;

        if (!userPrompt) {
            return NextResponse.json(
                { error: 'User prompt is required' },
                { status: 400 }
            );
        }

        const model = await getBestModel();
        const needsWebSearch = shouldSearchWeb(userPrompt, '');

        // Fetch all context in parallel
        const [botSettings, botRules, botInstructions, allDocuments, webSearchResults] = await Promise.all([
            getBotSettings(),
            getBotRules(),
            getBotInstructions(),
            getAllKnowledgeDocuments(),
            needsWebSearch ? searchWeb(userPrompt, 5) : Promise.resolve([]),
        ]);

        // Get relevant knowledge context based on query
        const relevantContext = await searchDocuments(userPrompt, 10);

        console.log('[Knowledge AI] Context loaded:', {
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

        // Build system prompt
        let systemPrompt = `You are an expert AI assistant for managing a chatbot's knowledge base. You have full access to read, edit, and create knowledge base documents, and you can search the web for current information.

IMPORTANT CONTEXT - BOT CONFIGURATION:
BOT PERSONALITY:
- Bot Name: ${botSettings.bot_name || 'Assistant'}
- Bot Tone/Style: ${botSettings.bot_tone || 'helpful and professional'}

BOT RULES (MUST FOLLOW THESE):
${botRules.length > 0
                ? botRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
                : 'No specific rules configured.'}

BOT INSTRUCTIONS:
${botInstructions || 'No specific instructions configured.'}

KNOWLEDGE BASE OVERVIEW:
You have access to ${allDocuments.length} documents in the knowledge base.

RELEVANT KNOWLEDGE BASE CONTENT:
${relevantContext && relevantContext.content
                ? `Here's relevant information from the knowledge base:\n${relevantContext.content.substring(0, 2000)}`
                : 'No relevant knowledge base content found for this query.'}

${webSearchResults.length > 0
                ? `\n\n${formatSearchResults(webSearchResults)}\n\nIMPORTANT: Use web search results to provide current, accurate information. You can reference these sources in your responses.`
                : ''}

CAPABILITIES:
1. **READ**: Answer questions about the knowledge base content
2. **EDIT**: Update existing knowledge base documents (you'll receive document ID and content)
3. **CREATE**: Create new knowledge base documents
4. **QUERY**: Search and analyze knowledge base content
5. **WEB SEARCH**: Access current information from the web
6. **GENERAL**: Provide general assistance about the knowledge base

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON object.

The JSON structure depends on the action:

For READ/QUERY/GENERAL actions:
{
  "response": "Your helpful response to the user",
  "action": "read|query|general",
  "suggestedEdits": [] // Optional: array of {documentId, reason, suggestedText} if you want to suggest improvements
}

For EDIT action (when user wants to edit a document):
{
  "response": "Brief explanation of what you changed",
  "action": "edit",
  "documentId": 123,
  "editedText": "The complete edited document text",
  "documentName": "Document Name" // Optional: if name should change
}

For CREATE action (when user wants to create a document):
{
  "response": "Brief explanation of the new document",
  "action": "create",
  "documentText": "The complete document text",
  "documentName": "Document Name", // Optional
  "categoryId": null // Optional
}

CRITICAL REQUIREMENTS:
- Return ONLY the JSON object, nothing else
- Do NOT wrap it in markdown code blocks
- Use proper JSON escaping (\\" for quotes, \\n for newlines)
- For edits, ensure editedText aligns with bot personality, tone, and rules
- For creates, ensure new documents align with bot configuration
- Always provide helpful, clear responses
- When suggesting edits, explain why they improve the knowledge base
- Use web search results when relevant to provide current information`;

        // Build user message
        let userMessage = `User's Request:
${userPrompt}`;

        if (action) {
            userMessage += `\n\nAction Type: ${action}`;
        }

        if (documentId) {
            const doc = allDocuments.find((d: any) => d.id === documentId);
            if (doc) {
                userMessage += `\n\nDocument to Edit:
ID: ${documentId}
Name: ${doc.metadata?.name || 'Unnamed'}
Current Content:
${doc.content}`;
            }
        }

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

        // Parse JSON response
        let parsedResponse;
        try {
            let cleanedResponse = responseText
                .replace(/```json\n?/gi, '')
                .replace(/```\n?/g, '')
                .trim();

            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
            }

            cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1');
            parsedResponse = JSON.parse(cleanedResponse);

            if (!parsedResponse.response) {
                throw new Error('Missing response field');
            }
        } catch (parseError) {
            console.warn('[Knowledge AI] Failed to parse JSON:', parseError);
            parsedResponse = {
                response: responseText.trim(),
                action: action || 'general',
            };
        }

        // Execute actions if needed
        let executedAction = null;
        if (parsedResponse.action === 'edit' && parsedResponse.documentId && parsedResponse.editedText) {
            const success = await updateKnowledgeDocument(
                parsedResponse.documentId,
                parsedResponse.editedText,
                parsedResponse.documentName
            );
            executedAction = {
                type: 'edit',
                success,
                documentId: parsedResponse.documentId,
            };
        } else if (parsedResponse.action === 'create' && parsedResponse.documentText) {
            const newDocId = await createKnowledgeDocument(
                parsedResponse.documentText,
                parsedResponse.documentName,
                parsedResponse.categoryId
            );
            executedAction = {
                type: 'create',
                success: newDocId !== null,
                documentId: newDocId,
            };
        }

        return NextResponse.json({
            success: true,
            response: parsedResponse.response,
            action: parsedResponse.action || action || 'general',
            executedAction,
            suggestedEdits: parsedResponse.suggestedEdits || [],
            modelUsed: model,
        });
    } catch (error: any) {
        console.error('[Knowledge AI] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to process request',
            },
            { status: 500 }
        );
    }
}

