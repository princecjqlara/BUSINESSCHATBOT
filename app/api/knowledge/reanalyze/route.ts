import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import OpenAI from 'openai';

// OpenAI client for NVIDIA API
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Use GPT OSS 120B equivalent - best available large model for analysis
// Prioritize largest models first for best analysis quality
const ML_MODELS = [
    'meta/llama-3.1-405b-instruct',  // GPT OSS 120B equivalent - best for analysis
    'qwen/qwen3-235b-a22b',          // Large model - excellent for reasoning
    'meta/llama-3.1-70b-instruct',   // Fallback
];

async function getBestMLModel(): Promise<string> {
    // Try models in order of quality (largest first)
    for (const model of ML_MODELS) {
        try {
            // Test if model is available with a minimal request
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Reanalyze] Using model: ${model} (GPT OSS 120B equivalent)`);
            return model;
        } catch (error) {
            // Model not available, try next
            console.log(`[Reanalyze] Model ${model} not available, trying next...`);
            continue;
        }
    }
    // Final fallback
    const fallback = ML_MODELS[ML_MODELS.length - 1];
    console.log(`[Reanalyze] Using fallback model: ${fallback}`);
    return fallback;
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const customInstructions = body.instructions as string | undefined;

        console.log('[Reanalyze] Starting bulk document reanalysis...', {
            hasCustomInstructions: !!customInstructions,
            instructionsLength: customInstructions?.length || 0
        });

        // Fetch all documents
        const { data: documents, error: fetchError } = await supabase
            .from('documents')
            .select('id, content, metadata, category_id, folder_id')
            .order('created_at', { ascending: false });

        if (fetchError) {
            console.error('[Reanalyze] Error fetching documents:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
        }

        if (!documents || documents.length === 0) {
            return NextResponse.json({
                message: 'No documents to reanalyze',
                processed: 0,
                updated: 0
            });
        }

        console.log(`[Reanalyze] Found ${documents.length} documents to process`);

        const model = await getBestMLModel();
        const processed: string[] = [];
        const updated: string[] = [];
        const errors: string[] = [];

        // Process documents in batches to avoid overwhelming the API
        const batchSize = 5;
        for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);

            await Promise.all(batch.map(async (doc: any) => {
                try {
                    const originalContent = doc.content || '';
                    const originalName = doc.metadata?.name || 'Untitled Document';

                    if (!originalContent.trim()) {
                        console.log(`[Reanalyze] Skipping empty document: ${doc.id}`);
                        return;
                    }

                    console.log(`[Reanalyze] Processing document ${doc.id}: ${originalName.substring(0, 50)}...`);

                    // Get all documents for context (to avoid duplicates and understand categorization)
                    const allDocsContext = documents
                        .filter((d: any) => d.id !== doc.id)
                        .map((d: any) => ({
                            name: d.metadata?.name || 'Untitled',
                            content: (d.content || '').substring(0, 200)
                        }))
                        .slice(0, 10); // Limit context to avoid token limits

                    // Build the analysis prompt with optional custom instructions
                    let analysisPrompt = `You are an expert document organizer and content analyst. Your task is to analyze and improve a document to make it more organized, detailed, and properly categorized.

ORIGINAL DOCUMENT:
Name: "${originalName}"
Content:
${originalContent}

OTHER DOCUMENTS IN KNOWLEDGE BASE (for context and categorization):
${allDocsContext.map((d: any, idx: number) => `${idx + 1}. ${d.name}: ${d.content}...`).join('\n')}`;

                    // Add custom instructions if provided
                    if (customInstructions && customInstructions.trim()) {
                        analysisPrompt += `\n\nUSER-SPECIFIC INSTRUCTIONS (FOLLOW THESE CAREFULLY):
${customInstructions.trim()}

These instructions should guide how you organize, name, and categorize this document. Prioritize these instructions while still maintaining quality and clarity.`;
                    }

                    analysisPrompt += `

TASK:
1. Analyze the document content and identify its main topic/purpose
2. Reorganize and improve the content to be more structured, detailed, and clear
3. Suggest a better, more descriptive name that reflects the content accurately
4. Identify what category this document should belong to (based on the other documents)
5. Make the content more actionable and organized with clear sections if needed${customInstructions && customInstructions.trim() ? '\n6. Follow the user-specific instructions provided above' : ''}

RESPOND WITH VALID JSON ONLY (no markdown, no explanation):
{
  "improvedContent": "Reorganized and improved document content. Make it more detailed, structured, and clear. Add sections if needed. Preserve all important information but make it more organized.",
  "suggestedName": "A clear, descriptive name that accurately reflects the document content (max 100 characters)",
  "suggestedCategory": "A category name that fits this document (e.g., 'Product Information', 'Customer Support', 'Sales Process', etc.)",
  "improvements": ["List of improvements made", "e.g., 'Added clear sections', 'Improved clarity', 'Added actionable steps']",
  "reason": "Brief explanation of why these changes improve the document"
}

IMPORTANT:
- Preserve ALL important information from the original
- Make content more organized with clear structure
- Add details where needed to make it more comprehensive
- Suggest a name that is specific and descriptive
- Suggest a category that makes sense for this content type${customInstructions && customInstructions.trim() ? '\n- CRITICAL: Follow the user-specific instructions provided above' : ''}`;

                    const response = await client.chat.completions.create({
                        model,
                        messages: [{ role: 'user', content: analysisPrompt }],
                        temperature: 0.7,
                        max_tokens: 3000,
                    });

                    const responseText = response.choices[0]?.message?.content || '';

                    // Parse JSON response
                    let parsedResponse;
                    try {
                        const cleanedResponse = responseText
                            .replace(/```json\n?/g, '')
                            .replace(/```\n?/g, '')
                            .trim();

                        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            parsedResponse = JSON.parse(jsonMatch[0]);
                        } else {
                            throw new Error('No JSON found in response');
                        }
                    } catch (parseError) {
                        console.error(`[Reanalyze] Failed to parse AI response for document ${doc.id}:`, parseError);
                        errors.push(`Document ${doc.id}: Failed to parse AI response`);
                        return;
                    }

                    // Update document with improved content and name
                    const updates: any = {
                        content: parsedResponse.improvedContent || originalContent,
                        edited_by_ai: true,
                        last_ai_edit_at: new Date().toISOString(),
                    };

                    // Update metadata with new name if provided
                    if (parsedResponse.suggestedName && parsedResponse.suggestedName !== originalName) {
                        updates.metadata = {
                            ...doc.metadata,
                            name: parsedResponse.suggestedName,
                            originalName: originalName, // Keep original for reference
                            reanalyzedAt: new Date().toISOString(),
                            improvements: parsedResponse.improvements || [],
                            reason: parsedResponse.reason || ''
                        };
                    } else {
                        updates.metadata = {
                            ...doc.metadata,
                            reanalyzedAt: new Date().toISOString(),
                            improvements: parsedResponse.improvements || [],
                            reason: parsedResponse.reason || ''
                        };
                    }

                    const { error: updateError } = await supabase
                        .from('documents')
                        .update(updates)
                        .eq('id', doc.id);

                    if (updateError) {
                        console.error(`[Reanalyze] Error updating document ${doc.id}:`, updateError);
                        errors.push(`Document ${doc.id}: ${updateError.message}`);
                    } else {
                        updated.push(doc.id);
                        console.log(`[Reanalyze] ✅ Updated document ${doc.id}: ${parsedResponse.suggestedName || originalName}`);
                    }

                    processed.push(doc.id);

                    // Create entry in ml_knowledge_changes to track this edit
                    const { error: changeError } = await supabase
                        .from('ml_knowledge_changes')
                        .insert({
                            entity_type: 'document',
                            entity_id: String(doc.id),
                            action: 'update',
                            old_value: { content: originalContent, name: originalName },
                            new_value: {
                                content: parsedResponse.improvedContent || originalContent,
                                name: parsedResponse.suggestedName || originalName
                            },
                            reason: parsedResponse.reason || 'Bulk reanalysis and organization',
                            confidence: 0.8,
                            approved: true,
                            model_used: 'reanalysis',
                        });

                    if (changeError) {
                        console.error(`[Reanalyze] Error creating ml_knowledge_changes entry:`, changeError);
                    }

                } catch (error) {
                    console.error(`[Reanalyze] Error processing document ${doc.id}:`, error);
                    errors.push(`Document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }));

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < documents.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`[Reanalyze] Completed: ${processed.length} processed, ${updated.length} updated, ${errors.length} errors`);

        return NextResponse.json({
            success: true,
            message: `Reanalysis complete: ${updated.length} documents updated`,
            processed: processed.length,
            updated: updated.length,
            errors: errors.length,
            errorDetails: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('[Reanalyze] Unexpected error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

