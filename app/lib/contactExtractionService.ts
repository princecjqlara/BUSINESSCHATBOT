import { supabase } from './supabase';
import OpenAI from 'openai';

/**
 * Result of contact info extraction from text
 */
export interface ExtractedContactInfo {
    phone: string | null;
    email: string | null;
}

/**
 * Result of business details extraction from text
 */
export interface ExtractedBusinessDetails {
    businessName: string | null;
    decisionMakerName: string | null;
    decisionMakerPosition: string | null;
    pageName: string | null;
    pageLink: string | null;
    additionalContactInfo: Record<string, any> | null;
}

// OpenAI client for AI extraction
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Models for business details extraction
const EXTRACTION_MODELS = [
    'meta/llama-3.1-70b-instruct',   // Good balance of speed and accuracy
    'meta/llama-3.1-405b-instruct',  // Best accuracy if available
    'qwen/qwen3-235b-a22b',          // Alternative
];

async function getBestExtractionModel(): Promise<string> {
    for (const model of EXTRACTION_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            return model;
        } catch (error) {
            continue;
        }
    }
    return EXTRACTION_MODELS[EXTRACTION_MODELS.length - 1];
}

/**
 * Regex patterns for extracting contact information
 */

// Philippine phone number patterns:
// - 09xx xxx xxxx, 09xx-xxx-xxxx, 09xxxxxxxxx
// - +639xx xxx xxxx, +639xxxxxxxxx
// - 639xxxxxxxxx
const PHONE_PATTERNS = [
    // Philippine mobile: +63 9xx or 09xx formats
    /(?:\+63|0)9\d{2}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    // International format with country code
    /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    // Generic 10-11 digit number that looks like a phone
    /\b0\d{10}\b/g,
    // 11 digits starting with 09
    /\b09\d{9}\b/g,
];

// Email pattern - standard email format
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Extract phone numbers from text
 */
function extractPhoneNumbers(text: string): string[] {
    const phones: string[] = [];

    for (const pattern of PHONE_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                // Normalize: remove spaces, dashes, dots
                const normalized = match.replace(/[-.\s]/g, '');
                if (!phones.includes(normalized)) {
                    phones.push(normalized);
                }
            });
        }
    }

    return phones;
}

/**
 * Extract email addresses from text
 */
function extractEmails(text: string): string[] {
    const matches = text.match(EMAIL_PATTERN);
    if (!matches) return [];

    // Return unique emails, lowercase
    return [...new Set(matches.map(email => email.toLowerCase()))];
}

/**
 * Extract contact information (phone numbers and emails) from text
 */
export function extractContactInfo(text: string): ExtractedContactInfo {
    const phones = extractPhoneNumbers(text);
    const emails = extractEmails(text);

    return {
        phone: phones.length > 0 ? phones[0] : null, // Take the first phone found
        email: emails.length > 0 ? emails[0] : null, // Take the first email found
    };
}

/**
 * Extract business details from text using AI
 */
export async function extractBusinessDetails(
    messageText: string,
    conversationHistory?: Array<{ role: string; content: string }>
): Promise<ExtractedBusinessDetails> {
    try {
        // Build conversation context if available
        const conversationContext = conversationHistory
            ? conversationHistory
                .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                .join('\n\n')
            : '';

        const fullContext = conversationContext
            ? `${conversationContext}\n\nLatest message: ${messageText}`
            : messageText;

        const model = await getBestExtractionModel();

        const completion = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content: `You are a comprehensive customer information extraction assistant. Extract ALL business and contact details from conversations.

Extract the following information if mentioned:

PRIMARY FIELDS:
- Business name (company, store, organization, business name)
- Decision maker name (owner, manager, CEO, president, director, contact person, key person)
- Decision maker position (job title, role: owner, CEO, manager, director, president, etc.)
- Page name (Facebook page name, business page name, social media page)
- Page link (URL to Facebook page, business website, social media profile)

ADDITIONAL INFORMATION (put in additionalContactInfo JSON object):
- Owner name (if different from decision maker, or if explicitly mentioned as "owner")
- Business address (full address, street, city, province, location)
- Website URL (business website, online store)
- Industry (type of business: retail, restaurant, services, manufacturing, etc.)
- Business type (corporation, sole proprietorship, partnership, etc.)
- Company size (number of employees, small business, medium, large)
- Years in business (how long they've been operating)
- Products/Services (what they sell or offer)
- Social media handles (Instagram, Twitter, LinkedIn, etc.)
- Landline/Office phone (if different from mobile)
- Tax ID or business registration number
- Any other relevant business information mentioned

IMPORTANT EXTRACTION RULES:
1. Extract owner name separately if mentioned as "owner" or "business owner" - this can be the same as decision maker or different
2. If someone says "I own..." or "My business is...", extract that as both owner and decision maker
3. Look for business names in various formats: "ABC Company", "ABC Corp", "ABC Store", "ABC Restaurant"
4. Extract addresses even if incomplete (city, province, street)
5. Extract websites even without http:// (add it if missing)
6. Look for industry clues: "restaurant", "retail store", "construction company", etc.
7. Extract any numbers that might be business registration, tax ID, etc.

Respond ONLY with valid JSON in this exact format:
{
    "businessName": "extracted business name or null",
    "decisionMakerName": "name of decision maker/owner/contact person or null",
    "decisionMakerPosition": "position/title or null",
    "pageName": "page name or null",
    "pageLink": "URL or null",
    "additionalContactInfo": {
        "owner": "owner name if different from decision maker or null",
        "address": "full address or null",
        "website": "website URL or null",
        "industry": "industry type or null",
        "businessType": "business type or null",
        "companySize": "size description or null",
        "yearsInBusiness": "years or null",
        "productsServices": "what they offer or null",
        "socialMedia": "social media handles or null",
        "landline": "office phone or null",
        "taxId": "tax ID or registration number or null",
        "other": "any other relevant info or null"
    } or null
}

If a field is not found, use null. Do not make up information. Only extract what is explicitly mentioned or clearly implied from context.`,
                },
                {
                    role: 'user',
                    content: fullContext,
                },
            ],
            temperature: 0.2,
            max_tokens: 800,
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Parse JSON response
        try {
            // Remove markdown code blocks if present
            let cleanedResponse = responseText
                .replace(/```json\n?/gi, '')
                .replace(/```\n?/gi, '')
                .trim();

            // Try to extract JSON from response if it starts with prose
            // AI sometimes says "Here is the JSON:" before the actual JSON
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleanedResponse = jsonMatch[0];
            }

            // If still no valid JSON, return empty response
            if (!cleanedResponse.startsWith('{')) {
                console.log('[AI Extraction] Response was not JSON, skipping:', cleanedResponse.substring(0, 50));
                return {
                    businessName: null,
                    decisionMakerName: null,
                    decisionMakerPosition: null,
                    pageName: null,
                    pageLink: null,
                    additionalContactInfo: null,
                };
            }

            const extracted = JSON.parse(cleanedResponse);

            return {
                businessName: extracted.businessName || null,
                decisionMakerName: extracted.decisionMakerName || null,
                decisionMakerPosition: extracted.decisionMakerPosition || null,
                pageName: extracted.pageName || null,
                pageLink: extracted.pageLink || null,
                additionalContactInfo: extracted.additionalContactInfo || null,
            };
        } catch (parseError) {
            console.error('Error parsing AI extraction response:', parseError);
            return {
                businessName: null,
                decisionMakerName: null,
                decisionMakerPosition: null,
                pageName: null,
                pageLink: null,
                additionalContactInfo: null,
            };
        }
    } catch (error) {
        console.error('Error extracting business details:', error);
        return {
            businessName: null,
            decisionMakerName: null,
            decisionMakerPosition: null,
            pageName: null,
            pageLink: null,
            additionalContactInfo: null,
        };
    }
}

/**
 * Update a lead's contact information in the database
 * Only updates fields that are provided and not already set (won't overwrite existing data)
 */
export async function updateLeadContactInfo(
    leadId: string,
    phone: string | null,
    email: string | null,
    businessDetails?: ExtractedBusinessDetails
): Promise<boolean> {
    if (!phone && !email && !businessDetails) {
        // Nothing to update
        return true;
    }

    try {
        // First, get current lead data to avoid overwriting existing contact info
        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('phone, email, business_name, decision_maker_name, decision_maker_position, page_name, page_link, additional_contact_info')
            .eq('id', leadId)
            .single();

        if (fetchError) {
            console.error('Error fetching lead for contact update:', fetchError);
            return false;
        }

        // Build update object - only update if field is new and not already set
        const updates: any = {};

        if (phone && !lead?.phone) {
            updates.phone = phone;
        }

        if (email && !lead?.email) {
            updates.email = email;
        }

        // Update business details if provided
        if (businessDetails) {
            if (businessDetails.businessName && !lead?.business_name) {
                updates.business_name = businessDetails.businessName;
            }
            if (businessDetails.decisionMakerName && !lead?.decision_maker_name) {
                updates.decision_maker_name = businessDetails.decisionMakerName;
            }
            if (businessDetails.decisionMakerPosition && !lead?.decision_maker_position) {
                updates.decision_maker_position = businessDetails.decisionMakerPosition;
            }
            if (businessDetails.pageName && !lead?.page_name) {
                updates.page_name = businessDetails.pageName;
            }
            if (businessDetails.pageLink && !lead?.page_link) {
                updates.page_link = businessDetails.pageLink;
            }
            if (businessDetails.additionalContactInfo) {
                // Merge with existing additional contact info, but don't overwrite with null values
                const existing = lead?.additional_contact_info || {};
                const newInfo = businessDetails.additionalContactInfo;
                // Only merge non-null values
                const merged: Record<string, any> = { ...existing };
                for (const [key, value] of Object.entries(newInfo)) {
                    if (value !== null && value !== undefined && value !== '') {
                        merged[key] = value;
                    }
                }
                // Only update if there are new values
                if (Object.keys(merged).length > 0 && JSON.stringify(merged) !== JSON.stringify(existing)) {
                    updates.additional_contact_info = merged;
                }
            }
        }

        if (Object.keys(updates).length === 0) {
            // No new contact info to update
            console.log(`Lead ${leadId} already has contact info, skipping update`);
            return true;
        }

        // Update the lead
        const { error: updateError } = await supabase
            .from('leads')
            .update(updates)
            .eq('id', leadId);

        if (updateError) {
            console.error('Error updating lead contact info:', updateError);
            return false;
        }

        console.log(`Lead ${leadId} contact info updated:`, updates);
        return true;

    } catch (error) {
        console.error('Error in updateLeadContactInfo:', error);
        return false;
    }
}

/**
 * Extract and store contact info from a message for a lead
 * This is the main function to call from the webhook
 * Now also extracts business details using AI
 */
export async function extractAndStoreContactInfo(
    leadId: string,
    messageText: string,
    conversationHistory?: Array<{ role: string; content: string }>
): Promise<void> {
    // Extract phone and email using regex (fast)
    const { phone, email } = extractContactInfo(messageText);

    // Extract business details using AI
    // Run AI extraction if message seems substantial (more than just a greeting/short response)
    // Also check for business-related keywords that indicate business information might be present
    const businessKeywords = [
        'business', 'company', 'store', 'shop', 'restaurant', 'owner', 'manager',
        'address', 'location', 'website', 'industry', 'corp', 'inc', 'llc',
        'establishment', 'enterprise', 'firm', 'organization', 'office'
    ];
    const hasBusinessKeywords = businessKeywords.some(keyword =>
        messageText.toLowerCase().includes(keyword.toLowerCase())
    );

    const shouldExtractBusinessDetails = (
        messageText.length > 15 || // Longer messages likely have more info
        hasBusinessKeywords || // Business-related keywords
        conversationHistory && conversationHistory.length > 2 // More context available
    ) && !messageText.toLowerCase().match(/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|okay|sure)$/i);

    let businessDetails: ExtractedBusinessDetails | undefined;

    if (shouldExtractBusinessDetails) {
        try {
            businessDetails = await extractBusinessDetails(messageText, conversationHistory);
            console.log(`Extracted business details:`, businessDetails);
        } catch (error) {
            console.error('Error extracting business details:', error);
            // Continue with phone/email extraction even if business extraction fails
        }
    }

    // Update database if we found anything
    if (phone || email || businessDetails) {
        console.log(`Extracted contact info from message - Phone: ${phone}, Email: ${email}`);
        await updateLeadContactInfo(leadId, phone, email, businessDetails);
    }
}
