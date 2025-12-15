import OpenAI from 'openai';
import { searchDocuments } from './rag';
import { supabase } from './supabase';
import { buildContext, selectStrategy, recordBehaviorAndLearn } from './mlOnlineLearning';
import { processKnowledgeImprovements } from './mlKnowledgeManagement';
import { detectConversionIntent, recordConversion } from './mlConversionTracking';
import { limitSentences, splitIntoMessages } from './sentenceLimiter';
import { formatMessage, formatMessages } from './messageFormatter';
import { checkAndRecordGoalCompletions, getActiveBotGoals, getCompletedGoals } from './goalTrackingService';
import { analyzeMessage, getResponseGuidance, type NLPAnalysisResult } from './nlpService';
import { validateResponse, logValidationResult, pickBestResponse } from './responseValidationService';

const MAX_HISTORY = 10; // Reduced to prevent context overload

// Cache settings to avoid database calls on every request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettings: any = null;
let settingsLastRead = 0;
const SETTINGS_CACHE_MS = 10000; // 10 seconds cache (reduced for faster updates)

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
        console.log(`[Settings Cache] Refreshed - max_sentences_per_message: ${data.max_sentences_per_message ?? 3}`);
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

// Lead context for AI awareness of contact details and conversation history
interface LeadContext {
    leadName: string | null;
    phone: string | null;
    email: string | null;
    businessName: string | null;
    pipelineStageName: string | null;
    pipelineStageDescription: string | null;
    lastBotMessages: string[];
    messageCount: number;
}

// Fetch lead context for autonomous AI follow-up
async function getLeadContext(senderId: string): Promise<LeadContext | null> {
    try {
        // Fetch lead with pipeline stage info
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select(`
                id,
                name,
                phone,
                email,
                business_name,
                message_count,
                current_stage_id,
                pipeline_stages (
                    name,
                    description
                )
            `)
            .eq('sender_id', senderId)
            .single();

        if (leadError || !lead) {
            console.log('[Lead Context] No lead found for sender:', senderId);
            return null;
        }

        // Fetch last 5 bot messages to avoid repetition
        const { data: botMessages } = await supabase
            .from('conversations')
            .select('content')
            .eq('sender_id', senderId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(5);

        const lastBotMessages = botMessages?.map((m: { content: string }) => m.content) || [];

        // Extract pipeline stage info
        const pipelineStage = (lead as unknown as { pipeline_stages?: { name: string; description?: string } }).pipeline_stages;

        const context: LeadContext = {
            leadName: lead.name,
            phone: lead.phone,
            email: lead.email,
            businessName: (lead as { business_name?: string }).business_name || null,
            pipelineStageName: pipelineStage?.name || null,
            pipelineStageDescription: pipelineStage?.description || null,
            lastBotMessages,
            messageCount: lead.message_count || 0,
        };

        console.log(`[Lead Context] Loaded for ${senderId}: Stage="${context.pipelineStageName}", Messages=${context.messageCount}`);
        return context;
    } catch (error) {
        console.error('[Lead Context] Error fetching:', error);
        return null;
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
        interface PaymentMethod {
            name: string;
            account_name?: string;
            account_number?: string;
            instructions?: string;
            qr_code_url?: string;
        }
        data.forEach((pm: PaymentMethod, index: number) => {
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
                        .in('id', oldMessages.map((m: { id: string }) => m.id));
                }
            }
        } catch (error) {
            console.error('Error in storeMessage:', error);
        }
    })();
}

// Extract a clean first name from any string (drops brackets/punctuation)
function extractFirstName(rawName?: string | null): string | null {
    if (!rawName) return null;

    const cleaned = rawName
        .replace(/[\[\]\{\}\(\)]/g, ' ')
        .replace(/[^A-Za-z' -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return null;
    const first = cleaned.split(' ')[0];
    if (!first) return null;

    return first.charAt(0).toUpperCase() + first.slice(1);
}

// Prefer lead name, then NLP-detected names
function getCustomerFirstName(leadContext: LeadContext | null, nlpAnalysis?: NLPAnalysisResult | null): string | null {
    const candidates: string[] = [];

    if (leadContext?.leadName) {
        candidates.push(leadContext.leadName);
    }
    if (nlpAnalysis?.entities?.names?.length) {
        candidates.push(...nlpAnalysis.entities.names);
    }

    for (const candidate of candidates) {
        const extracted = extractFirstName(candidate);
        if (extracted) {
            return extracted;
        }
    }

    return null;
}

// Replace or strip name placeholders before sending to the user
function personalizeContentWithName(content: string, firstName: string | null): string {
    if (!content) return content;

    let personalized = content;

    const placeholderPattern = /\[\s*name\s*\]|\[\s*Name\s*\]|\{\{\s*name\s*\}\}|\{\{\s*first_name\s*\}\}/gi;
    const bracketedNamePattern = /\[([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*)*)\]/g;

    if (firstName) {
        personalized = personalized.replace(placeholderPattern, firstName);
        personalized = personalized.replace(bracketedNamePattern, '$1');
    } else {
        personalized = personalized.replace(placeholderPattern, '');
        personalized = personalized.replace(bracketedNamePattern, '$1');
    }

    // Clean up spacing around punctuation that might be left after removal
    personalized = personalized.replace(/\s+([!?.,])/g, '$1');
    personalized = personalized.replace(/\s{2,}/g, ' ').trim();

    return personalized;
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
    imageContext?: ImageContext,
    previewDocumentContent?: string // Optional preview document content (unapplied AI edits)
): Promise<string | string[] | { messages: string | string[]; mediaUrls: string[] }> {
    const startTime = Date.now();

    // Read bot configuration from database (cached)
    const settings = await getBotSettings();
    const botName = settings.bot_name || 'Assistant';
    const botTone = settings.bot_tone || 'helpful and professional';
    const enableMlChatbot = settings.enable_ml_chatbot ?? false;
    const enableAiKnowledgeManagement = settings.enable_ai_knowledge_management ?? false;
    const enableAiAutonomousFollowup = settings.enable_ai_autonomous_followup ?? false;
    const enableMultiModelChatbot = settings.enable_multi_model_chatbot ?? true;
    const enableResponseValidation = settings.enable_response_validation ?? false;
    const maxSentencesPerMessage = settings.max_sentences_per_message ?? 3;
    const conversationFlow = settings.conversation_flow || '';
    const defaultAiModel = settings.default_ai_model || 'deepseek-ai/deepseek-v3.1';

    // Store user message immediately (fire and forget)
    storeMessageAsync(senderId, 'user', userMessage);

    // ML Learning: Build context and select strategy if enabled
    let selectedStrategy = null;
    let mlContext = null;
    if (enableMlChatbot) {
        try {
            mlContext = await buildContext(senderId);
            selectedStrategy = await selectStrategy(mlContext, senderId);
            console.log(`[ML] Selected strategy: ${selectedStrategy?.strategyName} for context: ${mlContext.conversationStage}`);
        } catch (error) {
            console.error('[ML] Error in strategy selection:', error);
        }
    }

    // NLP Analysis: Analyze user message for intent, sentiment, and entities
    let nlpAnalysis: NLPAnalysisResult | null = null;
    try {
        nlpAnalysis = analyzeMessage(userMessage);
        console.log(`[NLP] Intent: ${nlpAnalysis.intent.intent} (${(nlpAnalysis.intent.confidence * 100).toFixed(1)}%), Sentiment: ${nlpAnalysis.sentiment.sentiment} (${nlpAnalysis.sentiment.emotionalTone || 'neutral'})`);

        // Log extracted entities if any
        const entityCount = Object.values(nlpAnalysis.entities).flat().length;
        if (entityCount > 0) {
            console.log(`[NLP] Extracted ${entityCount} entities:`, nlpAnalysis.entities);
        }
    } catch (error) {
        console.error('[NLP] Error analyzing message:', error);
    }

    // Check if this is a payment-related query
    const isPaymentRelated = isPaymentQuery(userMessage);
    let paymentMethodsContext = '';
    if (isPaymentRelated) {
        paymentMethodsContext = await getPaymentMethods();
    }

    // Run independent operations in PARALLEL
    const [rules, history, contextResult, instructions, botGoals, leadContext, completedGoalIds] = await Promise.all([
        getBotRules(),
        getConversationHistory(senderId),
        searchDocuments(userMessage, 5, previewDocumentContent), // Pass preview content
        getBotInstructions(),
        getActiveBotGoals(),
        getLeadContext(senderId), // Get lead info for AI context
        getCompletedGoals(undefined, senderId),
    ]);

    const context = contextResult.content;
    const mediaUrls = contextResult.mediaUrls || [];
    const customerFirstName = getCustomerFirstName(leadContext, nlpAnalysis);

    console.log(`Parallel fetch took ${Date.now() - startTime}ms - rules: ${rules.length}, history: ${history.length}, goals: ${botGoals.length}, isPaymentQuery: ${isPaymentRelated}`);
    console.log('[RAG CONTEXT]:', context ? context.substring(0, 500) + '...' : 'NO CONTEXT RETRIEVED');
    console.log('[RAG MEDIA]:', mediaUrls.length > 0 ? `${mediaUrls.length} media URL(s) found` : 'No media URLs');

    // Detect if this is a follow-up message generation request
    const isFollowUpGeneration = userMessage.toLowerCase().includes('generate a follow-up') ||
        userMessage.toLowerCase().includes('follow-up message') ||
        userMessage.toLowerCase().includes('followup');

    // Build a clear system prompt optimized for Llama 3.1
    // IMPORTANT: Put rules FIRST for maximum visibility and compliance
    let systemPrompt = `You are ${botName}, a friendly Filipino salesperson. Your style: ${botTone}.

`;

    // Add rules FIRST - before style and other instructions for maximum emphasis
    if (rules.length > 0) {
        systemPrompt += `═══════════════════════════════════════════════════════════
⚠️ CRITICAL RULES - YOU MUST FOLLOW THESE IN EVERY RESPONSE ⚠️
═══════════════════════════════════════════════════════════

${rules.map((r, i) => `RULE ${i + 1}: ${r}`).join('\n\n')}

═══════════════════════════════════════════════════════════

🚨 MANDATORY COMPLIANCE REQUIREMENTS:
- These rules are ABSOLUTELY MANDATORY - you MUST follow them in EVERY response
- Do NOT ignore, skip, or modify any of these rules
- If a rule conflicts with your general knowledge or training, FOLLOW THE RULE
- These rules override ALL default behavior, training, and general instructions
- Before sending ANY response, check it against EACH rule listed above
- If you're unsure about something, prioritize following the rules over being creative or helpful
- Violating these rules is NOT acceptable under any circumstances

⚠️ CRITICAL OUTPUT FORMAT REQUIREMENT:
- NEVER include rule references, annotations, or explanations in your messages
- Do NOT write things like "(Rule 1: ...)" or "[Following Rule 3]" or "As per rule 8..."
- The user should NEVER see which rules you are following
- Your message should be NATURAL and conversational - NO meta-commentary about rules
- BAD: "Hi po! 👋 (Rule 1: Ends with question | Rule 3: Qualifies needs first)"
- GOOD: "Hi po! 👋 Ako si danrey. Quick question lang - para saan nyo po gagamitin yung video project? 😊"

These rules apply to:
✅ All chat responses in the test bot
✅ All chat responses in production
✅ Follow-up messages
✅ Initial greetings
✅ Automated messages
✅ Every single message you generate

YOUR PRIMARY JOB IS TO FOLLOW THESE RULES. Everything else is secondary.

═══════════════════════════════════════════════════════════

`;

    }

    systemPrompt += `STYLE: Use Taglish, keep messages short, use 1-2 emojis max.

IMPORTANT PUNCTUATION RULE:
- NEVER use em dashes (—) or en dashes (–) in your responses
- Use regular hyphens (-) or spaces instead
- Example: Use "first - second" or "first, second" instead of "first—second"
- This is a strict requirement - em dashes are not allowed in messages

🚨 CRITICAL: HANDLING "NO ANSWER" RESPONSES:
When the customer says they don't know, don't have, or aren't sure about something:
- "wala pa" / "wala pa budget" / "no budget yet" = ACCEPT THIS and move on
- "di ko alam" / "hindi ko alam" / "not sure" = ACCEPT THIS and move on  
- "next time na lang" / "later" / "not now" = ACCEPT THIS and move on

WHAT TO DO:
1. ACKNOWLEDGE their response (don't ignore it)
2. DO NOT repeat the same question
3. MOVE to a different topic or offer alternatives
4. Be understanding, not pushy

EXAMPLES:
- User: "wala pa budget" 
- BAD: "Anong budget range ang comfortable sa inyo?" (repeating same question)
- GOOD: "No problem! I can show you options pag ready ka na. May specific features ba na hinahanap mo?" (moved to different topic)

- User: "di ko pa alam"
- BAD: Asking the same question again
- GOOD: "All good! Let me know if you need help deciding. For now, can I share some popular choices?" (offered alternative)

MESSAGE LENGTH LIMIT:
${maxSentencesPerMessage > 0
            ? `- You MUST keep your response to a maximum of ${maxSentencesPerMessage} sentence${maxSentencesPerMessage === 1 ? '' : 's'}.\n- Be concise and direct.\n- If you need to say more, prioritize the most important information.\n\n`
            : '- No strict sentence limit, but keep messages conversational and engaging.\n\n'}
`;

    // Add clear guidance for name handling to avoid bracketed placeholders
    if (customerFirstName) {
        systemPrompt += `CUSTOMER NAME:
- Their name is "${customerFirstName}". Use it naturally in greetings (e.g., "Hi ${customerFirstName}!").
- NEVER use placeholders like [Name] or {{name}} - always write the real name without brackets.

`;
    } else {
        systemPrompt += `NAME HANDLING:
- We don't have their name yet. Do NOT use placeholders like [Name] or {{name}}.
- Use a warm generic greeting until the customer shares their name.

`;
    }

    // Add instructions from database if available
    if (instructions) {
        systemPrompt += `${instructions}

`;
    }

    // Add conversation flow if available
    if (conversationFlow) {
        systemPrompt += `CONVERSATION FLOW:
${conversationFlow}

IMPORTANT: Follow the conversation flow structure above. Use it to guide how you structure your responses and move the conversation through different stages or topics.

`;
    }

    // Add bot goals to guide conversation towards specific outcomes
    if (botGoals.length > 0) {
        const completedGoals = botGoals.filter(goal => completedGoalIds.includes(goal.id));
        const stopGoals = botGoals.filter(goal => goal.stop_on_completion);
        const completedStopGoals = stopGoals.filter(goal => completedGoalIds.includes(goal.id));

        const goalsText = botGoals.map((goal, i) => {
            const priorityLabel = goal.priority_order ? `[Priority ${goal.priority_order}]` : '[Low Priority]';
            const optionalLabel = goal.is_optional ? ' (Optional)' : ' (Required)';
            return `${i + 1}. ${goal.goal_name}${optionalLabel} ${priorityLabel}
   ${goal.goal_description || 'No description provided'}`;
        }).join('\n\n');

        const completedGoalsText = completedGoals.length > 0
            ? completedGoals.map(goal => `- ${goal.goal_name}${goal.stop_on_completion ? ' (Stop goal)' : ''}`).join('\n')
            : '- None yet';

        const stopGoalsText = stopGoals.length > 0
            ? stopGoals.map(goal => `- ${goal.goal_name}`).join('\n')
            : '- None defined';

        const completedStopGoalsText = completedStopGoals.length > 0
            ? completedStopGoals.map(goal => `- ${goal.goal_name}`).join('\n')
            : '- None yet';

        systemPrompt += `============================================================
CONVERSATION GOALS - WORK TOWARDS THESE OUTCOMES
============================================================

Your conversation should naturally work towards achieving these goals:

${goalsText}

IMPORTANT GOAL GUIDANCE:
- Naturally guide the conversation towards these goals
- Don't be pushy - let the conversation flow naturally
- Prioritize Required goals over Optional ones
- Higher priority goals should be addressed first when possible
- Track when goals are achieved during the conversation
- Once a goal is achieved, focus on the next priority goal
- Completed goals so far:
${completedGoalsText}
- Goals marked "stop when reached":
${stopGoalsText}
- Stop goals already achieved:
${completedStopGoalsText}
- If a stop goal is achieved (or was already achieved), ask if the user wants to stop. Respect "stop/done/ok na/that's all" and end politely with no new prompts.
- If they want to continue, keep helping but avoid repeating completed goals.

============================================================

`;
    }

    // Add special guidance for follow-up message generation
    if (isFollowUpGeneration) {
        systemPrompt += `FOLLOW-UP MESSAGE GUIDELINES (CRITICAL - READ CAREFULLY):
- Be helpful and friendly, NOT pushy or aggressive
- Avoid high-pressure sales tactics or fake urgency
- Don't use guilt-tripping language (like "Akala ko napanis na tayo?" or "Baka mawala na")
- Don't create artificial scarcity or time pressure unless it's genuinely real
- Focus on being helpful and providing value, not closing a sale
- Use a warm, genuine tone that builds trust
- Be respectful of the customer's time and decision-making process
- If mentioning offers or discounts, present them as helpful information, not pressure
- Keep it natural, conversational, and respectful
- Remember: A helpful follow-up builds relationships; a pushy one damages them

BAD EXAMPLES (DO NOT DO THIS):
- "Wait lang, [Name]! Akala ko napanis na tayo? 😏" (guilt-tripping)
- "Baka mawala na 'yung chance mo" (fake urgency)
- "I-follow up ako or i-extend yung offer?" (manipulative choice)

GOOD EXAMPLES (DO THIS INSTEAD):
- "Hi [Name]! Just checking in - may questions ka pa ba about our products? Happy to help! 😊"
- "Hey! Saw you were interested earlier. If you need any info, just let me know! 👍"
- "Hi there! Just following up - anything I can help you with today?"

\n\n`;
    }

    // Add AI Autonomous Follow-up / Self-Thinking prompt when enabled
    if (enableAiAutonomousFollowup) {
        // Build lead context section if available
        let leadContextSection = '';
        if (leadContext) {
            leadContextSection = `
📋 CURRENT CONTACT INFORMATION:
${leadContext.leadName ? `- Name: ${leadContext.leadName}` : '- Name: Unknown'}
${leadContext.phone ? `- Phone: ${leadContext.phone}` : ''}
${leadContext.email ? `- Email: ${leadContext.email}` : ''}
${leadContext.businessName ? `- Business: ${leadContext.businessName}` : ''}
${leadContext.pipelineStageName ? `- Pipeline Stage: ${leadContext.pipelineStageName}` : '- Pipeline Stage: New Lead'}
${leadContext.pipelineStageDescription ? `- Stage Description: ${leadContext.pipelineStageDescription}` : ''}
- Total Messages Exchanged: ${leadContext.messageCount}

⛔ YOUR RECENT MESSAGES (DO NOT REPEAT THESE):
${leadContext.lastBotMessages.length > 0
                    ? leadContext.lastBotMessages.map((msg, i) => `${i + 1}. "${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}"`).join('\n')
                    : '(No previous messages)'}

🚫 MESSAGE REPETITION RULE (CRITICAL - ZERO TOLERANCE):
- NEVER repeat the exact same message or similar phrasing as your recent messages listed above
- NEVER ask a question you already asked - even if the user didn't answer it properly
- Each response must be UNIQUE and move the conversation forward
- If you already asked about budget/price/timeline/purpose - DO NOT ASK AGAIN

🚨 IF USER SAYS "DI KO ALAM" / "WALA PA" / "NOT SURE":
- This IS their answer - ACCEPT IT
- DO NOT repeat the question
- MOVE to a completely different topic
- Example: If they don't know budget → ask about timeline, features, or purpose instead

⛔ BANNED BEHAVIOR:
- Asking "anong budget?" after user said "wala pa budget" = BANNED
- Asking "anong type of business?" after user already answered = BANNED
- Repeating any question from your recent messages above = BANNED

`;
        }

        systemPrompt += `AI AUTONOMOUS FOLLOW-UP & SELF-THINKING (ENABLED):

You have the ability to think autonomously about this conversation and proactively guide it. Use your own judgment and experience to:
${leadContextSection}
🧠 SELF-REFLECTION:
- Analyze the current state of this conversation
- Consider what the customer might need next, even if they haven't asked
- Think about potential concerns or questions they might have
- Reflect on the best approach to move the conversation forward productively
- Consider the customer's pipeline stage and tailor your approach accordingly

🎯 PROACTIVE ACTIONS:
- If you notice the customer might benefit from additional information, offer it naturally
- If the conversation seems to be stalling, suggest next steps or ask clarifying questions
- If there's an opportunity to add value, take it without being pushy
- If you sense hesitation, address potential concerns proactively
- For leads in early stages, focus on qualification; for later stages, focus on closing

📊 EXPERIENCE-BASED DECISIONS:
- Draw on patterns you've learned from conversations
- Use context clues to anticipate needs
- Make intelligent decisions about timing and approach
- Balance being helpful with being respectful of the customer's pace

💡 AUTONOMOUS FOLLOW-UP:
- If appropriate, you may suggest scheduling a follow-up or checking in later
- Recommend next steps based on where the conversation is heading
- Take initiative to keep the conversation productive and moving forward

IMPORTANT: Be natural and conversational. Don't explicitly mention that you're "thinking" or "analyzing" - just act on your insights naturally.

`;
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

    // Add NLP-based context and guidance
    if (nlpAnalysis) {
        const nlpGuidance = getResponseGuidance(nlpAnalysis);
        if (nlpGuidance) {
            systemPrompt += `NLP ANALYSIS CONTEXT:
${nlpGuidance}

`;
        }

        // Add specific guidance for negative sentiment (frustrated users)
        if (nlpAnalysis.sentiment.sentiment === 'negative') {
            systemPrompt += `⚠️ IMPORTANT - FRUSTRATED CUSTOMER DETECTED:
The customer appears to be ${nlpAnalysis.sentiment.emotionalTone || 'upset'}. Please:
- Start with empathy and acknowledgment of their frustration
- Apologize sincerely if there's an issue with our service
- Focus on solutions and resolution, not excuses
- Use a calm, reassuring tone
- Avoid being overly cheerful or dismissive of their concerns

`;
        }

        // Add extracted entities for reference
        if (nlpAnalysis.entities.names.length > 0) {
            systemPrompt += `Customer name detected: ${nlpAnalysis.entities.names.join(', ')}. Use their name appropriately in your response.

`;
        }
        if (nlpAnalysis.entities.dates.length > 0 || nlpAnalysis.entities.times.length > 0) {
            const timeRefs = [...nlpAnalysis.entities.dates.map(d => d.value), ...nlpAnalysis.entities.times.map(t => t.value)];
            systemPrompt += `Time/date mentioned: ${timeRefs.join(', ')}. Acknowledge and confirm these details.

`;
        }
        if (nlpAnalysis.entities.phoneNumbers.length > 0 || nlpAnalysis.entities.emails.length > 0) {
            systemPrompt += `Contact info provided: ${[...nlpAnalysis.entities.phoneNumbers, ...nlpAnalysis.entities.emails].join(', ')}. Confirm you received this information.

`;
        }
        if (nlpAnalysis.entities.quantities.length > 0) {
            const qtys = nlpAnalysis.entities.quantities.map(q => `${q.value} ${q.unit || 'pcs'}`).join(', ');
            systemPrompt += `Quantities mentioned: ${qtys}. Confirm these details in your response.

`;
        }
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

    // Add conversation history, but exclude any message that matches the current user message
    // This prevents duplication when the async storeMessageAsync completes before getConversationHistory
    for (const msg of history) {
        // Skip if this is a duplicate of the current message we're about to add
        // (can happen due to race condition with storeMessageAsync)
        if (msg.role === 'user' && msg.content === userMessage) {
            console.log('[History] Skipping duplicate user message from history');
            continue;
        }
        messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    // Helper function to call LLM with retry and fallback
    const callLLMWithRetry = async (model: string, retries: number = 2): Promise<string> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                console.log(`[LLM] Attempting call to ${model} (attempt ${attempt + 1}/${retries + 1})`);
                const llmStart = Date.now();

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const stream: any = await client.chat.completions.create({
                    model: model,
                    messages,
                    temperature: 0.3,
                    top_p: 0.7,
                    max_tokens: 1024,
                    stream: true,
                });

                let responseContent = '';
                let reasoningContent = '';

                for await (const chunk of stream) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const reasoning = (chunk.choices[0]?.delta as any)?.reasoning_content;
                    if (reasoning) {
                        reasoningContent += reasoning;
                    }
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        responseContent += content;
                    }
                }

                console.log(`[LLM] Call to ${model} took ${Date.now() - llmStart}ms`);
                if (reasoningContent) {
                    console.log('[LLM] Reasoning:', reasoningContent.substring(0, 200) + '...');
                }

                if (responseContent && responseContent.trim() !== '') {
                    return responseContent;
                }
                throw new Error('Empty response from LLM');
            } catch (error: any) {
                console.error(`[LLM] Error on attempt ${attempt + 1} with ${model}:`, error.message || error);
                if (attempt < retries) {
                    const delay = Math.pow(2, attempt) * 500; // Exponential backoff: 500ms, 1000ms
                    console.log(`[LLM] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
        throw new Error('All retry attempts failed');
    };

    try {
        const llmStart = Date.now();
        let responseContent = '';

        // Model cascade - try each in order until one works
        // Ordered by quality (best first) and reliability
        const preferredModels = [
            defaultAiModel,                   // User-selected primary model
            "deepseek-ai/deepseek-v3.1",      // Strong reasoning & rule following
            "qwen/qwen3-235b-a22b",           // High quality fallback
            "meta/llama-3.1-8b-instruct",     // Fast, reliable fallback
            "mistralai/mistral-nemo-12b-instruct",  // Additional safety fallback
        ];

        const models = enableMultiModelChatbot
            ? Array.from(new Set(preferredModels))
            : [defaultAiModel || "deepseek-ai/deepseek-v3.1"];

        console.log(`[LLM] Multi-model chatbot ${enableMultiModelChatbot ? 'enabled' : 'disabled'}, model order: ${models.join(' -> ')}`);

        let lastError: any = null;
        for (const model of models) {
            try {
                console.log(`[LLM] Trying model: ${model}`);
                responseContent = await callLLMWithRetry(model, 1);
                console.log(`[LLM] Successfully got response from ${model}`);
                break; // Success! Exit the loop
            } catch (err: any) {
                console.error(`[LLM] Model ${model} failed:`, err.message);
                lastError = err;

                // Add extra delay for 503 errors (service recovering)
                if (err.message?.includes('503') || err.message?.includes('Service Unavailable')) {
                    console.log(`[LLM] 503 detected, waiting 2 seconds before trying next model...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                continue; // Try next model
            }
        }

        // If all models failed
        if (!responseContent || responseContent.trim() === '') {
            console.error('[LLM] All models failed!');
            throw lastError || new Error('All models failed to respond');
        }

        console.log(`[LLM] Total LLM call took ${Date.now() - llmStart}ms`)

        // Handle empty responses with a fallback
        if (!responseContent || responseContent.trim() === '') {
            console.warn('Empty response from LLM, using fallback');
            const fallback = "Pasensya na po, may technical issue. Pwede po ba ulitin ang tanong niyo?";
            storeMessageAsync(senderId, 'assistant', fallback);
            return fallback;
        }

        // Multi-model response validation (if enabled)
        let validatedContent = responseContent;
        if (enableResponseValidation) {
            console.log('[Response Validation] Enabled, validating response...');
            try {
                const validationResult = await validateResponse(validatedContent, {
                    rules,
                    knowledgeContext: context || '',
                    conversationHistory: history,
                    botName,
                    botTone,
                    conversationFlow,
                });

                // Log validation result for analytics (fire and forget)
                logValidationResult(senderId, responseContent, validationResult).catch(err => {
                    console.error('[Response Validation] Error logging result:', err);
                });

                if (!validationResult.isValid) {
                    console.log(`[Response Validation] Issues found: ${validationResult.issues.join(', ')}`);

                    // Use corrected response if provided
                    if (validationResult.correctedResponse) {
                        console.log('[Response Validation] Using corrected response');
                        validatedContent = validationResult.correctedResponse;
                    } else {
                        console.log('[Response Validation] No corrected response provided, using original');
                    }
                } else {
                    console.log(`[Response Validation] Response passed validation (${validationResult.validationTimeMs}ms)`);
                }
            } catch (validationError) {
                console.error('[Response Validation] Error during validation:', validationError);
                // Continue with original response on error
            }
        }

        // Format the response content first (normalize spacing and line breaks)
        const personalizedContent = personalizeContentWithName(validatedContent, customerFirstName);
        const formattedContent = formatMessage(personalizedContent);

        // Split into multiple messages if sentence limit is configured
        let finalResponse: string | string[];

        // AI Decides mode (-1): Intelligently decide whether to split
        if (maxSentencesPerMessage === -1) {
            console.log(`[AI Split] AI-decides mode enabled, analyzing response...`);
            const sentences = formattedContent.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [formattedContent];
            const sentenceCount = sentences.length;
            const contentLength = formattedContent.length;

            // Heuristics for AI-decides splitting:
            // 1. If response has 2+ sentences, consider splitting (for conversational chat)
            // 2. If content is over 200 chars, consider splitting
            // 3. Look for topic changes (paragraph breaks, line breaks, "Also," "By the way," etc.)
            const hasTopicChange = /\n\n|\n|Also[,:]|By the way|Additionally|Furthermore|On another note/i.test(formattedContent);
            const shouldSplit = (sentenceCount >= 2 || contentLength > 200 || hasTopicChange) && sentenceCount > 1;

            if (shouldSplit) {
                // Determine optimal split point based on content
                // For conversational chat, we want smaller message chunks
                let optimalSentencesPerMessage: number;
                if (sentenceCount <= 3) {
                    optimalSentencesPerMessage = 1; // 1 sentence per message for short responses
                } else if (sentenceCount <= 5) {
                    optimalSentencesPerMessage = 2;
                } else if (sentenceCount <= 8) {
                    optimalSentencesPerMessage = 2;
                } else {
                    optimalSentencesPerMessage = 3;
                }

                console.log(`[AI Split] Decided to split: ${sentenceCount} sentences, ${contentLength} chars, topic change: ${hasTopicChange}`);
                console.log(`[AI Split] Using ${optimalSentencesPerMessage} sentences per message`);

                const messages = splitIntoMessages(formattedContent, optimalSentencesPerMessage);
                const formattedMessages = formatMessages(messages);
                finalResponse = formattedMessages;

                console.log(`[AI Split] Split into ${formattedMessages.length} message(s)`);
                formattedMessages.forEach((msg, idx) => {
                    console.log(`[AI Split] Message ${idx + 1}: "${msg.substring(0, 80)}..."`);
                });

                // Store all messages
                formattedMessages.forEach(msg => {
                    storeMessageAsync(senderId, 'assistant', msg);
                });
            } else {
                console.log(`[AI Split] Decided NOT to split: ${sentenceCount} sentences, ${contentLength} chars`);
                finalResponse = formattedContent;
                storeMessageAsync(senderId, 'assistant', finalResponse);
            }
        }
        // Manual sentence limit mode (positive number)
        else if (maxSentencesPerMessage > 0) {
            console.log(`[Sentence Split] Splitting into messages with max ${maxSentencesPerMessage} sentences per message`);
            console.log(`[Sentence Split] Original response length: ${formattedContent.length} chars`);

            // Count sentences before splitting
            const sentenceEndings = formattedContent.match(/[.!?]+(?:\s+|$)/g);
            const originalCount = sentenceEndings ? sentenceEndings.length : 1;
            console.log(`[Sentence Split] Detected ${originalCount} sentences in original response`);

            // Split into multiple messages
            const messages = splitIntoMessages(formattedContent, maxSentencesPerMessage);
            // Format each message for proper spacing
            const formattedMessages = formatMessages(messages);
            finalResponse = formattedMessages;

            console.log(`[Sentence Split] Split into ${formattedMessages.length} message(s)`);
            formattedMessages.forEach((msg, idx) => {
                const msgSentenceCount = (msg.match(/[.!?]+(?:\s+|$)/g) || []).length;
                console.log(`[Sentence Split] Message ${idx + 1}: ${msgSentenceCount} sentence(s), "${msg.substring(0, 80)}..."`);
            });

            // Store all messages (fire and forget)
            formattedMessages.forEach(msg => {
                storeMessageAsync(senderId, 'assistant', msg);
            });
        } else {
            // No limit (0 or null)
            console.log(`[Sentence Split] No limit applied (maxSentencesPerMessage: ${maxSentencesPerMessage})`);
            finalResponse = formattedContent;
            // Store bot response (fire and forget)
            storeMessageAsync(senderId, 'assistant', finalResponse);
        }

        // ML Learning: Track behavior and update learning (use first message for consistency)
        if (enableMlChatbot && selectedStrategy && mlContext) {
            try {
                const firstMessage = Array.isArray(finalResponse) ? finalResponse[0] : finalResponse;
                // Record that a message was sent (conversation_continue event)
                await recordBehaviorAndLearn(
                    {
                        senderId,
                        eventType: 'message_sent',
                        eventData: {
                            messageLength: responseContent.length,
                            messageCount: Array.isArray(finalResponse) ? finalResponse.length : 1
                        },
                        strategyId: selectedStrategy.id,
                    },
                    mlContext
                );
            } catch (error) {
                console.error('[ML] Error recording behavior:', error);
            }
        }

        // AI Knowledge Management: Process improvements if enabled
        if (enableAiKnowledgeManagement) {
            try {
                // Process knowledge improvements in background (fire and forget)
                processKnowledgeImprovements(senderId, history, []).catch(err => {
                    console.error('[ML Knowledge] Error processing improvements:', err);
                });
            } catch (error) {
                console.error('[ML Knowledge] Error:', error);
            }
        }

        // Goal Tracking: Check and record goal completions (fire and forget)
        try {
            // Get lead ID if available
            const { data: lead } = await supabase
                .from('leads')
                .select('id')
                .eq('sender_id', senderId)
                .single();

            const firstMessage = Array.isArray(finalResponse) ? finalResponse[0] : finalResponse;
            checkAndRecordGoalCompletions(
                senderId,
                userMessage,
                firstMessage,
                lead?.id
            ).catch(err => {
                console.error('[Goal Tracking] Error checking goal completions:', err);
            });
        } catch (error) {
            console.error('[Goal Tracking] Error:', error);
        }

        console.log(`Total response time: ${Date.now() - startTime} ms`);

        // Return response with mediaUrls if available
        if (mediaUrls.length > 0) {
            return { messages: finalResponse, mediaUrls };
        }

        return finalResponse;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("[LLM] Error calling NVIDIA API:");
        console.error("[LLM] Error message:", error.message);
        console.error("[LLM] Error response:", error.response?.data);
        console.error("[LLM] Error status:", error.response?.status);
        console.error("[LLM] Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        const fallbackMessage = "Pasensya na po, may technical issue ngayon. Pwede po ba ulitin mamaya ang inyong tanong?";
        storeMessageAsync(senderId, 'assistant', fallbackMessage);
        return fallbackMessage;
    }
}
