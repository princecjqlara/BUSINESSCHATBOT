import OpenAI from 'openai';
import { searchDocuments } from './rag';
import { supabase } from './supabase';

const MAX_HISTORY = 10; // Reduced to prevent context overload

// Cache settings to avoid database calls on every request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettings: any = null;
let settingsLastRead = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Fetch bot settings from database with caching
async function getBotSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastRead < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
        }

        cachedSettings = data;
        settingsLastRead = now;
        return data;
    } catch (error) {
        console.error('Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional' };
    }
}

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Fetch bot rules from database
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('Error fetching bot rules:', error);
        return [];
    }
}

// Fetch bot instructions from database
async function getBotInstructions(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('Error fetching bot instructions:', error);
        return '';
    }
}

// Payment-related keywords to detect
const PAYMENT_KEYWORDS = [
    'payment', 'bayad', 'magbayad', 'pay', 'gcash', 'maya', 'paymaya',
    'bank', 'transfer', 'account', 'qr', 'qr code', 'send payment',
    'how to pay', 'paano magbayad', 'payment method', 'payment option',
    'where to pay', 'saan magbabayad', 'bank details', 'account number',
    'bdo', 'bpi', 'metrobank', 'unionbank', 'landbank', 'pnb',
    'remittance', 'padala', 'deposit'
];

// Check if message is asking about payment methods
function isPaymentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Fetch active payment methods from database
async function getPaymentMethods(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('name, account_name, account_number, instructions, qr_code_url')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) {
            console.log('No payment methods found or error:', error);
            return '';
        }

        // Format payment methods for the AI
        let formatted = 'AVAILABLE PAYMENT METHODS:\n';
        data.forEach((pm, index) => {
            formatted += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) formatted += `\n   Account Name: ${pm.account_name}`;
            if (pm.account_number) formatted += `\n   Account/Number: ${pm.account_number}`;
            if (pm.instructions) formatted += `\n   Instructions: ${pm.instructions}`;
            if (pm.qr_code_url) formatted += `\n   [QR Code Available]`;
        });
        formatted += '\n';

        console.log('[Payment Methods]:', formatted);
        return formatted;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return '';
    }
}

// Fetch conversation history for a sender (last 20 messages)
async function getConversationHistory(senderId: string): Promise<{ role: string; content: string }[]> {
    try {
        const { data: messages, error } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(MAX_HISTORY);

        if (error) {
            console.error('Error fetching conversation history:', error);
            return [];
        }

        return messages || [];
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        return [];
    }
}

// Store a message (fire and forget - don't await)
function storeMessageAsync(senderId: string, role: 'user' | 'assistant', content: string) {
    // Run in background - don't block the response
    (async () => {
        try {
            // Delete oldest if over limit (simple approach - just insert and let periodic cleanup handle it)
            const { error: insertError } = await supabase
                .from('conversations')
                .insert({
                    sender_id: senderId,
                    role,
                    content,
                });

            if (insertError) {
                console.error('Error storing message:', insertError);
            }

            // Cleanup old messages in background
            const { count } = await supabase
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', senderId);

            if (count && count > MAX_HISTORY + 5) {
                // Delete oldest ones to get back to MAX_HISTORY
                const { data: oldMessages } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('sender_id', senderId)
                    .order('created_at', { ascending: true })
                    .limit(count - MAX_HISTORY);

                if (oldMessages && oldMessages.length > 0) {
                    await supabase
                        .from('conversations')
                        .delete()
                        .in('id', oldMessages.map(m => m.id));
                }
            }
        } catch (error) {
            console.error('Error in storeMessage:', error);
        }
    })();
}

// Image context type for passing image analysis to the chatbot
export interface ImageContext {
    isReceipt: boolean;
    confidence: number;
    details?: string;
    extractedAmount?: string;
    extractedDate?: string;
    imageUrl?: string;
    // Receipt verification fields
    receiverName?: string;
    receiverNumber?: string;
    paymentPlatform?: string;
    verificationStatus?: 'verified' | 'mismatch' | 'unknown';
    verificationDetails?: string;
}

export async function getBotResponse(
    userMessage: string,
    senderId: string = 'web_default',
    imageContext?: ImageContext
): Promise<string> {
    const startTime = Date.now();

    // Read bot configuration from database (cached)
    const settings = await getBotSettings();
    const botName = settings.bot_name || 'Assistant';
    const botTone = settings.bot_tone || 'helpful and professional';

    // Store user message immediately (fire and forget)
    storeMessageAsync(senderId, 'user', userMessage);

    // Check if this is a payment-related query
    const isPaymentRelated = isPaymentQuery(userMessage);
    let paymentMethodsContext = '';
    if (isPaymentRelated) {
        paymentMethodsContext = await getPaymentMethods();
    }

    // Run independent operations in PARALLEL
    const [rules, history, context, instructions] = await Promise.all([
        getBotRules(),
        getConversationHistory(senderId),
        searchDocuments(userMessage),
        getBotInstructions(),
    ]);

    console.log(`Parallel fetch took ${Date.now() - startTime}ms - rules: ${rules.length}, history: ${history.length}, isPaymentQuery: ${isPaymentRelated}`);
    console.log('[RAG CONTEXT]:', context ? context.substring(0, 500) + '...' : 'NO CONTEXT RETRIEVED');

    // Build a clear system prompt optimized for Llama 3.1
    let systemPrompt = `You are ${botName}, a friendly Filipino salesperson. Your style: ${botTone}.

STYLE: Use Taglish, keep messages short, use 1-2 emojis max.

`;

    // Add instructions from database if available
    if (instructions) {
        systemPrompt += `${instructions}

`;
    }

    if (rules.length > 0) {
        systemPrompt += `RULES:\n${rules.join('\n')}\n\n`;
    }

    // Add knowledge base FIRST with clear instruction
    if (context && context.trim().length > 0) {
        systemPrompt += `REFERENCE DATA:
${context}

IMPORTANT: When asked about price/magkano/cost, use the EXACT price above.
Do NOT make up prices or add details not in the reference data.

`;
    } else {
        systemPrompt += `NOTE: No reference data available. If asked for specific prices or details, say "Ipa-check ko muna sa team."

`;
    }

    // Add payment methods if this is a payment query
    if (paymentMethodsContext) {
        systemPrompt += `${paymentMethodsContext}

INSTRUCTION FOR PAYMENT QUERIES:
- List ALL available payment methods from above
- Include account name and number for each
- Be clear and helpful about how to pay
- If they ask for QR code, tell them it's available and they can ask you to show it

`;
    }

    // Add image context if customer sent an image
    if (imageContext) {
        systemPrompt += `IMAGE ANALYSIS (Customer sent an image):
`;
        if (imageContext.isReceipt && imageContext.confidence >= 0.7) {
            systemPrompt += `- This appears to be a RECEIPT/PROOF OF PAYMENT (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- Details: ${imageContext.details}
`;
            }
            if (imageContext.extractedAmount) {
                systemPrompt += `- Amount shown: ${imageContext.extractedAmount}
`;
            }
            if (imageContext.extractedDate) {
                systemPrompt += `- Date: ${imageContext.extractedDate}
`;
            }
            if (imageContext.receiverName) {
                systemPrompt += `- Receiver Name: ${imageContext.receiverName}
`;
            }
            if (imageContext.receiverNumber) {
                systemPrompt += `- Receiver Number: ${imageContext.receiverNumber}
`;
            }
            if (imageContext.paymentPlatform) {
                systemPrompt += `- Platform: ${imageContext.paymentPlatform}
`;
            }

            // Add verification status
            if (imageContext.verificationStatus === 'verified') {
                systemPrompt += `
✅ PAYMENT VERIFIED: ${imageContext.verificationDetails}

INSTRUCTION: The payment details MATCH our records! Thank the customer warmly, confirm the payment is verified and correct. Let them know their order will be processed. Be enthusiastic and appreciative!

`;
            } else if (imageContext.verificationStatus === 'mismatch') {
                systemPrompt += `
⚠️ PAYMENT MISMATCH: ${imageContext.verificationDetails}

INSTRUCTION: Politely inform the customer that the payment details don't match our records. Ask them to double-check if they sent to the correct account. Provide our correct payment details. Be helpful and understanding - maybe they made an honest mistake.

`;
            } else {
                systemPrompt += `
INSTRUCTION: Thank the customer for their payment proof. Confirm you received it and will process it. Be warm and appreciative.

`;
            }
        } else if (imageContext.isReceipt) {
            systemPrompt += `- This might be a receipt but confidence is low (${Math.round(imageContext.confidence * 100)}%)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Politely ask the customer if this is their payment proof. If the image is unclear, ask them to resend a clearer photo.

`;
        } else {
            systemPrompt += `- This does NOT appear to be a receipt (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Respond naturally about the image. If they might be trying to send payment proof, guide them on what to send.

`;
        }
    }

    // Build messages array with history
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
        messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    try {
        const llmStart = Date.now();

        // Use Qwen3-235b model
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream: any = await client.chat.completions.create({
            model: "qwen/qwen3-235b-a22b",
            messages,
            temperature: 0.3,  // Low for accuracy
            top_p: 0.7,
            max_tokens: 1024,
            stream: true,
        });

        let responseContent = '';
        let reasoningContent = '';

        // Process the stream
        for await (const chunk of stream) {
            // Collect reasoning (thinking) content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reasoning = (chunk.choices[0]?.delta as any)?.reasoning_content;
            if (reasoning) {
                reasoningContent += reasoning;
            }

            // Collect actual response content
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                responseContent += content;
            }
        }

        console.log(`LLM call took ${Date.now() - llmStart} ms`);
        if (reasoningContent) {
            console.log('Reasoning:', reasoningContent.substring(0, 200) + '...');
        }

        // Handle empty responses with a fallback
        if (!responseContent || responseContent.trim() === '') {
            console.warn('Empty response from LLM, using fallback');
            const fallback = "Pasensya na po, may technical issue. Pwede po ba ulitin ang tanong niyo?";
            storeMessageAsync(senderId, 'assistant', fallback);
            return fallback;
        }

        // Store bot response (fire and forget)
        storeMessageAsync(senderId, 'assistant', responseContent);

        console.log(`Total response time: ${Date.now() - startTime} ms`);
        return responseContent;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Error calling NVIDIA API:", error.response?.data || error.message || error);
        return "Pasensya na po, may problema sa connection. Subukan ulit mamaya.";
    }
}
