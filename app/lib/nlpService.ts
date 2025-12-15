/**
 * NLP Service for Business Chatbot
 * Provides Intent Recognition, Sentiment Analysis, and Entity Extraction
 */

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export type IntentType =
    | 'order'       // User wants to buy/order something
    | 'inquiry'     // User wants product/service information
    | 'support'     // User needs help/has complaints
    | 'greeting'    // Initial greeting/hello
    | 'payment'     // Payment-related queries
    | 'follow_up'   // Following up on previous conversation
    | 'farewell'    // Goodbye/ending conversation
    | 'unknown';    // Cannot determine intent

export type SentimentType = 'positive' | 'neutral' | 'negative';

export interface IntentResult {
    intent: IntentType;
    confidence: number;
    subIntent?: string;  // More specific intent (e.g., 'order' -> 'order_inquiry')
}

export interface SentimentResult {
    sentiment: SentimentType;
    confidence: number;
    emotionalTone?: string;  // e.g., 'frustrated', 'excited', 'confused'
}

export interface ExtractedEntities {
    dates: { value: string; normalized?: string }[];
    times: { value: string; normalized?: string }[];
    phoneNumbers: string[];
    emails: string[];
    names: string[];
    locations: string[];
    quantities: { value: number; unit?: string }[];
    amounts: { value: number; currency?: string }[];
}

export interface NLPAnalysisResult {
    intent: IntentResult;
    sentiment: SentimentResult;
    entities: ExtractedEntities;
    rawMessage: string;
    analyzedAt: string;
}

// =============================================================================
// INTENT RECOGNITION
// =============================================================================

const INTENT_PATTERNS: Record<IntentType, { keywords: string[]; patterns?: RegExp[] }> = {
    order: {
        keywords: [
            'order', 'buy', 'purchase', 'checkout', 'bili', 'kuha', 'gusto ko',
            'i want', 'pabili', 'paorder', 'take my order', 'place order',
            'add to cart', 'i\'ll take', 'i\'ll get', 'kunin ko', 'bibili ako',
            'pabilhin', 'gusto kong bumili', 'kukuha ako', 'paki-order'
        ],
        patterns: [
            /(?:can i|pwede ba|gusto ko).*(?:order|buy|bili|get)/i,
            /(?:i(?:'ll)? (?:take|get|have)).*(?:\d+|one|two|three)/i,
        ]
    },
    inquiry: {
        keywords: [
            'how much', 'magkano', 'price', 'available', 'do you have',
            'meron ba', 'pwede ba', 'can i', 'what products', 'what do you sell',
            'ano meron', 'what\'s available', 'tell me about', 'info',
            'information', 'details', 'specs', 'specifications', 'features',
            'size', 'sizes', 'color', 'colors', 'variant', 'variants',
            'stock', 'in stock', 'mayroon pa ba', 'options'
        ],
        patterns: [
            /(?:how much|magkano).*(?:is|ang|yung|for)/i,
            /(?:what|ano).*(?:have|meron|available)/i,
            /(?:tell me|sabihin mo).*(?:about|tungkol)/i,
        ]
    },
    support: {
        keywords: [
            'help', 'problem', 'issue', 'wrong', 'broken', 'not working',
            'complaint', 'refund', 'return', 'exchange', 'cancel', 'late',
            'delayed', 'missing', 'damaged', 'disappointed', 'frustrated',
            'hindi dumating', 'sira', 'mali', 'tulong', 'reklamo',
            'nasaan', 'where is my order', 'track', 'status', 'walang dating'
        ],
        patterns: [
            /(?:my order|yung order ko).*(?:not|hindi|never|wala)/i,
            /(?:need|kailangan).*(?:help|tulong|assistance)/i,
            /(?:something|may).*(?:wrong|mali|problem)/i,
        ]
    },
    greeting: {
        keywords: [
            'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
            'kumusta', 'musta', 'magandang umaga', 'magandang hapon', 'magandang gabi',
            'yo', 'sup', 'hoy', 'uy', 'pre', 'bro', 'sis', 'mare', 'pare'
        ],
        patterns: [
            /^(?:hi|hello|hey|yo|uy|hoy)[\s!?.,]*$/i,
            /^(?:good )?(?:morning|afternoon|evening|night)[\s!?.,]*$/i,
            /^(?:magandang )?(?:umaga|hapon|gabi)[\s!?.,]*$/i,
        ]
    },
    payment: {
        keywords: [
            'payment', 'pay', 'gcash', 'maya', 'paymaya', 'bank', 'transfer',
            'bayad', 'magbayad', 'how to pay', 'paano magbayad', 'payment method',
            'account number', 'qr code', 'reference number', 'receipt',
            'proof of payment', 'sent payment', 'nabayaran', 'binayaran ko na'
        ],
        patterns: [
            /(?:how|paano).*(?:pay|bayad)/i,
            /(?:sent|send|nagpadala).*(?:payment|bayad)/i,
            /(?:where|saan).*(?:pay|bayad)/i,
        ]
    },
    follow_up: {
        keywords: [
            'still waiting', 'any update', 'update', 'follow up', 'following up',
            'paano na', 'ano na', 'status', 'update naman', 'kamusta na',
            'what happened', 'nagkano na', 'meron na ba', 'napadala na ba'
        ],
        patterns: [
            /(?:any|meron ba).*(?:update|news|balita)/i,
            /(?:still|pa rin).*(?:waiting|naghihintay)/i,
            /(?:what|ano).*(?:happened|nangyari)/i,
        ]
    },
    farewell: {
        keywords: [
            'bye', 'goodbye', 'thanks', 'thank you', 'salamat', 'sige',
            'ok thanks', 'okay thanks', 'got it', 'noted', 'ok na',
            'okay na', 'gets', 'alright', 'see you', 'take care'
        ],
        patterns: [
            /^(?:bye|goodbye|thanks|thank you|salamat)[\s!?.,]*$/i,
            /^(?:ok|okay|sige).*(?:thanks|salamat)[\s!?.,]*$/i,
        ]
    },
    unknown: {
        keywords: [],
        patterns: []
    }
};

/**
 * Recognize the intent of a user message
 */
export function recognizeIntent(message: string): IntentResult {
    const lowerMessage = message.toLowerCase().trim();
    const scores: Record<IntentType, number> = {
        order: 0,
        inquiry: 0,
        support: 0,
        greeting: 0,
        payment: 0,
        follow_up: 0,
        farewell: 0,
        unknown: 0
    };

    // Calculate scores based on keyword matches
    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
        const intent = intentType as IntentType;

        // Keyword matching
        for (const keyword of patterns.keywords) {
            if (lowerMessage.includes(keyword)) {
                // Exact word match gets higher score
                const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (wordBoundaryRegex.test(lowerMessage)) {
                    scores[intent] += 2;
                } else {
                    scores[intent] += 1;
                }
            }
        }

        // Pattern matching (higher weight)
        if (patterns.patterns) {
            for (const pattern of patterns.patterns) {
                if (pattern.test(lowerMessage)) {
                    scores[intent] += 3;
                }
            }
        }
    }

    // Find the intent with highest score
    let maxScore = 0;
    let detectedIntent: IntentType = 'unknown';

    for (const [intent, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            detectedIntent = intent as IntentType;
        }
    }

    // Calculate confidence (normalize to 0-1)
    const confidence = maxScore > 0 ? Math.min(1, maxScore / 10) : 0.1;

    return {
        intent: detectedIntent,
        confidence,
        subIntent: getSubIntent(detectedIntent, lowerMessage)
    };
}

/**
 * Get more specific sub-intent if applicable
 */
function getSubIntent(intent: IntentType, message: string): string | undefined {
    switch (intent) {
        case 'inquiry':
            if (/price|magkano|how much/i.test(message)) return 'price_inquiry';
            if (/available|stock|meron/i.test(message)) return 'availability_check';
            if (/size|color|variant/i.test(message)) return 'product_details';
            return 'general_inquiry';
        case 'support':
            if (/refund|return/i.test(message)) return 'refund_request';
            if (/track|status|nasaan/i.test(message)) return 'order_tracking';
            if (/complaint|reklamo/i.test(message)) return 'complaint';
            return 'general_support';
        case 'order':
            if (/cancel/i.test(message)) return 'order_cancellation';
            if (/change|modify|edit/i.test(message)) return 'order_modification';
            return 'new_order';
        default:
            return undefined;
    }
}

// =============================================================================
// SENTIMENT ANALYSIS
// =============================================================================

const SENTIMENT_LEXICON = {
    positive: {
        keywords: [
            'thanks', 'thank you', 'salamat', 'great', 'awesome', 'amazing',
            'love', 'perfect', 'excellent', 'happy', 'excited', 'wonderful',
            'fantastic', 'good', 'nice', 'best', 'beautiful', 'maganda',
            'galing', 'astig', 'solid', 'yes', 'ok', 'okay', 'sige',
            'sure', 'please', 'appreciate', 'helpful', '😊', '😃', '❤️',
            '👍', '🙏', '✨', 'wow', 'nice one', 'ang galing'
        ],
        patterns: [
            /(?:really|very|super|sobrang) (?:good|nice|great|helpful)/i,
            /(?:thank|salamat).*(?:so much|maraming)/i,
            /(?:love|gustong-gusto) (?:it|ko|this)/i,
        ],
        weight: 1
    },
    negative: {
        keywords: [
            'frustrated', 'angry', 'upset', 'disappointed', 'terrible',
            'horrible', 'worst', 'bad', 'hate', 'never', 'useless',
            'waste', 'scam', 'fake', 'galit', 'bwisit', 'nakakabwisit',
            'mali', 'pangit', 'hindi maganda', 'sira', 'walang kwenta',
            'fail', 'failed', 'problema', 'late', 'delayed', 'wrong',
            '😡', '😤', '😠', '💢', 'wtf', 'ugh', 'grr', 'kabadong'
        ],
        patterns: [
            /(?:so|very|super|sobrang) (?:frustrated|upset|disappointed|galit)/i,
            /(?:never|will not|won't|hindi na).*(?:again|ulit|order)/i,
            /(?:worst|terrible|horrible).*(?:experience|service)/i,
            /(?:what|ano).*(?:happened|problem|nangyari)/i,
        ],
        weight: 1.5  // Negative sentiment weighted more heavily
    },
    frustration_intensifiers: [
        'still', 'already', 'again', 'always', 'never', 'anymore',
        'pa rin', 'na naman', 'palagi', 'lagi', 'hindi na', '!!!', '???',
        'sobra', 'grabe', 'hay', 'jusko', 'anak ng', 'pucha', 'tangina'
    ]
};

/**
 * Analyze the sentiment of a user message
 */
export function analyzeSentiment(message: string): SentimentResult {
    const lowerMessage = message.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    // Check positive keywords and patterns
    for (const keyword of SENTIMENT_LEXICON.positive.keywords) {
        if (lowerMessage.includes(keyword)) {
            positiveScore += SENTIMENT_LEXICON.positive.weight;
        }
    }
    for (const pattern of SENTIMENT_LEXICON.positive.patterns) {
        if (pattern.test(lowerMessage)) {
            positiveScore += 2;
        }
    }

    // Check negative keywords and patterns
    for (const keyword of SENTIMENT_LEXICON.negative.keywords) {
        if (lowerMessage.includes(keyword)) {
            negativeScore += SENTIMENT_LEXICON.negative.weight;
        }
    }
    for (const pattern of SENTIMENT_LEXICON.negative.patterns) {
        if (pattern.test(lowerMessage)) {
            negativeScore += 3;
        }
    }

    // Check for frustration intensifiers (boost negative score)
    for (const intensifier of SENTIMENT_LEXICON.frustration_intensifiers) {
        if (lowerMessage.includes(intensifier)) {
            negativeScore += 0.5;
        }
    }

    // Check for all caps (indicates intensity)
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (capsRatio > 0.5 && message.length > 5) {
        negativeScore += 1; // All caps often indicates frustration
    }

    // Check for excessive punctuation
    if (/[!?]{2,}/.test(message)) {
        negativeScore += 0.5;
    }

    // Determine sentiment
    let sentiment: SentimentType;
    let confidence: number;
    let emotionalTone: string | undefined;

    const totalScore = positiveScore + negativeScore;

    if (totalScore === 0) {
        sentiment = 'neutral';
        confidence = 0.5;
    } else if (positiveScore > negativeScore * 1.2) {
        sentiment = 'positive';
        confidence = Math.min(1, positiveScore / 5);
        emotionalTone = getPositiveTone(lowerMessage);
    } else if (negativeScore > positiveScore * 1.2) {
        sentiment = 'negative';
        confidence = Math.min(1, negativeScore / 5);
        emotionalTone = getNegativeTone(lowerMessage);
    } else {
        sentiment = 'neutral';
        confidence = 0.5;
    }

    return { sentiment, confidence, emotionalTone };
}

function getPositiveTone(message: string): string {
    if (/excite|excited|can't wait|hindi makapaghintay/i.test(message)) return 'excited';
    if (/thank|salamat|appreciate/i.test(message)) return 'grateful';
    if (/love|gustong-gusto|sobrang like/i.test(message)) return 'delighted';
    if (/happy|masaya|satisfied/i.test(message)) return 'satisfied';
    return 'pleased';
}

function getNegativeTone(message: string): string {
    if (/angry|galit|furious/i.test(message)) return 'angry';
    if (/frustrated|bwisit|nakakabwisit/i.test(message)) return 'frustrated';
    if (/disappointed|nalungkot|sad/i.test(message)) return 'disappointed';
    if (/confused|naguguluhan|di ko gets/i.test(message)) return 'confused';
    if (/worried|nag-aalala|concerned/i.test(message)) return 'worried';
    return 'upset';
}

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

const ENTITY_PATTERNS = {
    // Philippine phone numbers
    phoneNumber: [
        /(?:\+63|0)9\d{9}/g,
        /09\d{2}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    ],

    // Email addresses
    email: [
        /[\w.+-]+@[\w-]+\.[\w.-]+/gi,
    ],

    // Dates (various formats)
    date: [
        // Dec 15, December 15, Dec. 15
        /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?/gi,
        // 12/15/2024, 12-15-2024
        /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g,
        // Relative dates
        /(?:today|tomorrow|yesterday|next week|this week|next month|bukas|kahapon|mamaya)/gi,
    ],

    // Times
    time: [
        /\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM|a\.m\.|p\.m\.)/g,
        /(?:morning|afternoon|evening|night|umaga|hapon|gabi)/gi,
    ],

    // Quantities
    quantity: [
        /(\d+)\s*(?:pcs?|pieces?|items?|units?|boxes?|packs?|sets?|pairs?)/gi,
        /(\d+)\s*(?:kilos?|kg|grams?|g|liters?|L|ml)/gi,
    ],

    // Currency/amounts (Philippine Peso)
    amount: [
        /(?:₱|PHP|Php|P|peso[s]?)\s*[\d,]+(?:\.\d{2})?/gi,
        /[\d,]+(?:\.\d{2})?\s*(?:pesos?|php)/gi,
    ],

    // Common Filipino names (first names to detect)
    namePrefixes: [
        /(?:ako si|my name is|i am|this is|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
        /(?:si|kay|para kay|for)\s+([A-Z][a-z]+)/gi,
    ],

    // Locations (common Philippine locations and patterns)
    location: [
        // Common cities
        /(?:Manila|Makati|Quezon City|QC|Cebu|Davao|Pasig|Taguig|BGC|Mandaluyong|Pasay|Paranaque|Caloocan|Marikina|Las Pinas|Muntinlupa|Valenzuela)/gi,
        // Address patterns
        /(?:brgy\.?|barangay)\s+[A-Za-z\s]+/gi,
        /\d+\s+[A-Za-z\s]+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.)/gi,
    ]
};

/**
 * Extract entities from a user message
 */
export function extractEntities(message: string): ExtractedEntities {
    const entities: ExtractedEntities = {
        dates: [],
        times: [],
        phoneNumbers: [],
        emails: [],
        names: [],
        locations: [],
        quantities: [],
        amounts: []
    };

    // Extract phone numbers
    for (const pattern of ENTITY_PATTERNS.phoneNumber) {
        const matches = message.match(pattern);
        if (matches) {
            entities.phoneNumbers.push(...matches.map(m => m.replace(/[-.\s]/g, '')));
        }
    }
    // Remove duplicates
    entities.phoneNumbers = [...new Set(entities.phoneNumbers)];

    // Extract emails
    for (const pattern of ENTITY_PATTERNS.email) {
        const matches = message.match(pattern);
        if (matches) {
            entities.emails.push(...matches);
        }
    }
    entities.emails = [...new Set(entities.emails)];

    // Extract dates
    for (const pattern of ENTITY_PATTERNS.date) {
        const matches = message.match(pattern);
        if (matches) {
            entities.dates.push(...matches.map(m => ({
                value: m,
                normalized: normalizeDate(m)
            })));
        }
    }

    // Extract times
    for (const pattern of ENTITY_PATTERNS.time) {
        const matches = message.match(pattern);
        if (matches) {
            entities.times.push(...matches.map(m => ({
                value: m,
                normalized: normalizeTime(m)
            })));
        }
    }

    // Extract quantities
    for (const pattern of ENTITY_PATTERNS.quantity) {
        let match;
        const regex = new RegExp(pattern.source, 'gi');
        while ((match = regex.exec(message)) !== null) {
            const fullMatch = match[0];
            const numMatch = fullMatch.match(/\d+/);
            if (numMatch) {
                const unit = fullMatch.replace(/\d+\s*/, '').trim();
                entities.quantities.push({
                    value: parseInt(numMatch[0], 10),
                    unit: unit || 'pieces'
                });
            }
        }
    }

    // Extract amounts
    for (const pattern of ENTITY_PATTERNS.amount) {
        const matches = message.match(pattern);
        if (matches) {
            for (const match of matches) {
                const numStr = match.replace(/[₱PHP\s,pesos?]/gi, '');
                const value = parseFloat(numStr);
                if (!isNaN(value)) {
                    entities.amounts.push({ value, currency: 'PHP' });
                }
            }
        }
    }

    // Extract names
    for (const pattern of ENTITY_PATTERNS.namePrefixes) {
        let match;
        const regex = new RegExp(pattern.source, 'gi');
        while ((match = regex.exec(message)) !== null) {
            if (match[1]) {
                entities.names.push(match[1].trim());
            }
        }
    }
    entities.names = [...new Set(entities.names)];

    // Extract locations
    for (const pattern of ENTITY_PATTERNS.location) {
        const matches = message.match(pattern);
        if (matches) {
            entities.locations.push(...matches);
        }
    }
    entities.locations = [...new Set(entities.locations)];

    return entities;
}

/**
 * Normalize relative dates to actual dates
 */
function normalizeDate(dateStr: string): string {
    const lower = dateStr.toLowerCase();
    const today = new Date();

    if (lower === 'today') {
        return today.toISOString().split('T')[0];
    }
    if (lower === 'tomorrow' || lower === 'bukas') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }
    if (lower === 'yesterday' || lower === 'kahapon') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }
    if (lower.includes('next week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.toISOString().split('T')[0];
    }

    // Return original if can't normalize
    return dateStr;
}

/**
 * Normalize time expressions
 */
function normalizeTime(timeStr: string): string {
    const lower = timeStr.toLowerCase();

    if (lower.includes('morning') || lower.includes('umaga')) return '09:00';
    if (lower.includes('afternoon') || lower.includes('hapon')) return '14:00';
    if (lower.includes('evening') || lower.includes('gabi')) return '18:00';
    if (lower.includes('night')) return '20:00';

    return timeStr;
}

// =============================================================================
// MAIN NLP ANALYSIS FUNCTION
// =============================================================================

/**
 * Perform complete NLP analysis on a user message
 */
export function analyzeMessage(message: string): NLPAnalysisResult {
    return {
        intent: recognizeIntent(message),
        sentiment: analyzeSentiment(message),
        entities: extractEntities(message),
        rawMessage: message,
        analyzedAt: new Date().toISOString()
    };
}

/**
 * Get response adjustment suggestions based on NLP analysis
 */
export function getResponseGuidance(analysis: NLPAnalysisResult): string {
    const parts: string[] = [];

    // Intent-based guidance
    switch (analysis.intent.intent) {
        case 'order':
            parts.push('User wants to make a purchase. Be helpful and guide them through the ordering process.');
            break;
        case 'inquiry':
            parts.push('User is asking for information. Provide clear, detailed answers from your knowledge base.');
            break;
        case 'support':
            parts.push('User needs help or has a complaint. Be empathetic and solution-focused.');
            break;
        case 'payment':
            parts.push('User is asking about payment. Provide clear payment instructions and options.');
            break;
    }

    // Sentiment-based guidance
    if (analysis.sentiment.sentiment === 'negative') {
        parts.push(`IMPORTANT: User seems ${analysis.sentiment.emotionalTone || 'upset'}. Be extra empathetic, apologize if appropriate, and focus on resolving their issue quickly.`);
    } else if (analysis.sentiment.sentiment === 'positive') {
        parts.push(`User is ${analysis.sentiment.emotionalTone || 'happy'}. Match their positive energy and keep the momentum going.`);
    }

    // Entity-based guidance
    if (analysis.entities.names.length > 0) {
        parts.push(`User's name appears to be: ${analysis.entities.names.join(', ')}. Use their name if appropriate.`);
    }
    if (analysis.entities.dates.length > 0 || analysis.entities.times.length > 0) {
        parts.push(`User mentioned timing: ${[...analysis.entities.dates.map(d => d.value), ...analysis.entities.times.map(t => t.value)].join(', ')}. Acknowledge and confirm these details.`);
    }
    if (analysis.entities.quantities.length > 0 || analysis.entities.amounts.length > 0) {
        parts.push('User mentioned specific quantities or amounts. Confirm these details in your response.');
    }

    return parts.join('\n');
}
