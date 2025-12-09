import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getBotResponse, ImageContext } from '@/app/lib/chatService';
import { supabase } from '@/app/lib/supabase';
import { getOrCreateLead, incrementMessageCount, shouldAnalyzeStage, analyzeAndUpdateStage, moveLeadToReceiptStage } from '@/app/lib/pipelineService';
import { analyzeImageForReceipt, isConfirmedReceipt } from '@/app/lib/receiptDetectionService';
import { isTakeoverActive, startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';
import { extractAndStoreContactInfo } from '@/app/lib/contactExtractionService';

// Cache settings to avoid database calls on every request
let cachedSettings: any = null;
let settingsLastFetched = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Cache for connected page tokens
const pageTokenCache = new Map<string, { token: string; fetchedAt: number }>();
const PAGE_TOKEN_CACHE_MS = 60000; // 1 minute cache

// Fetch settings from database with caching
async function getSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastFetched < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            return {
                facebook_verify_token: 'TEST_TOKEN',
                facebook_page_access_token: null,
            };
        }

        cachedSettings = data;
        settingsLastFetched = now;
        return data;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return {
            facebook_verify_token: 'TEST_TOKEN',
            facebook_page_access_token: null,
        };
    }
}

// Get page access token - first tries connected_pages table, then falls back to bot_settings
async function getPageToken(pageId?: string): Promise<string | null> {
    // If we have a page ID, try to get page-specific token first
    if (pageId) {
        const now = Date.now();
        const cached = pageTokenCache.get(pageId);
        if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
            return cached.token;
        }

        try {
            const { data, error } = await supabase
                .from('connected_pages')
                .select('page_access_token')
                .eq('page_id', pageId)
                .eq('is_active', true)
                .single();

            if (!error && data?.page_access_token) {
                pageTokenCache.set(pageId, { token: data.page_access_token, fetchedAt: now });
                return data.page_access_token;
            }
        } catch (error) {
            console.error('Error fetching page token:', error);
        }
    }

    // Fallback to bot_settings or environment variable
    const settings = await getSettings();
    return settings.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;
}

// Payment-related keywords to detect
const PAYMENT_KEYWORDS = [
    'payment', 'bayad', 'magbayad', 'pay', 'gcash', 'maya', 'paymaya',
    'bank', 'transfer', 'account', 'qr', 'qr code', 'send payment',
    'how to pay', 'paano magbayad', 'payment method', 'payment option',
    'where to pay', 'saan magbabayad', 'bank details', 'account number',
    'bdo', 'bpi', 'metrobank', 'unionbank', 'landbank', 'pnb',
    'remittance', 'padala', 'deposit', 'magkano', 'price', 'presyo'
];

// Product-related keywords
const PRODUCT_KEYWORDS = [
    'product', 'products', 'item', 'items', 'inventory', 'tinda', 'benta',
    'store', 'shop', 'katalogo', 'catalogue', 'menu', 'list', 'available'
];

// Property-related keywords
const PROPERTY_KEYWORDS = [
    'property', 'properties', 'house', 'bahay', 'lupa', 'lot', 'condo',
    'apartment', 'rent', 'sale', 'studio', 'bedroom', 'model', 'townhouse',
    'investment', 'preselling', 'reopen', 'inventory', 'available'
];

// Check if message is asking about products
function isProductQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for "anong tinda niyo" or "patingin ng products" patterns
    if (lowerMessage.includes('ano') && (lowerMessage.includes('tinda') || lowerMessage.includes('benta'))) return true;
    if (lowerMessage.includes('available') && (lowerMessage.includes('ba') || lowerMessage.includes('kayo'))) return true;

    return PRODUCT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Check if message is asking about properties
function isPropertyQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for "anong property meron" or "house and lot" patterns
    if (lowerMessage.includes('house') && lowerMessage.includes('lot')) return true;
    if (lowerMessage.includes('property') && lowerMessage.includes('list')) return true;

    return PROPERTY_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Check if message is asking about payment methods
function isPaymentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Payment method type
interface PaymentMethod {
    id: string;
    name: string;
    account_name: string | null;
    account_number: string | null;
    qr_code_url: string | null;
    instructions: string | null;
    is_active: boolean;
}

// Product type
interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    image_url: string | null;
    is_active: boolean;
}

interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    image_url: string | null;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    status: string;
    is_active: boolean;
}

// Fetch active products from database
async function getProducts(): Promise<Product[]> {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(10); // Limit to 10 for carousel

        if (error || !data) {
            console.log('No products found or error:', error);
            return [];
        }

        return data;
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

// Fetch active properties from database
async function getProperties(): Promise<Property[]> {
    try {
        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10); // Limit to 10 for carousel

        if (error || !data) {
            console.log('No properties found or error:', error);
            return [];
        }

        return data; // Supabase returns generic types, casting happens at consumption or strictly here if needed
    } catch (error) {
        console.error('Error fetching properties:', error);
        return [];
    }
}


// Send products as Facebook Generic Template cards
async function sendProductCards(sender_psid: string, products: Product[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || products.length === 0) return false;

    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app'; // Fallback needs to be actual URL

    // Build elements for Generic Template (max 10)
    const elements = products.slice(0, 10).map(product => {
        const priceFormatted = product.price
            ? `₱${product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            : 'Price upon request';

        // Truncate description if too long
        let subtitle = priceFormatted;
        if (product.description) {
            const desc = product.description.length > 50
                ? product.description.substring(0, 47) + '...'
                : product.description;
            subtitle += ` • ${desc}`;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: product.name,
            subtitle: subtitle,
        };

        // Add image if available
        if (product.image_url) {
            element.image_url = product.image_url;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'web_url',
                url: `${appUrl}/product/${product.id}`,
                title: 'View Product',
                webview_height_ratio: 'tall'
            }
        ];

        return element;
    });

    const requestBody = {
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending product cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send product cards:', resData);
            return false;
        }

        console.log('Product cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending product cards:', error);
        return false;
    }
}

// Send properties as Facebook Generic Template cards
async function sendPropertyCards(sender_psid: string, properties: Property[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || properties.length === 0) return false;

    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';

    // Build elements for Generic Template (max 10)
    const elements = properties.slice(0, 10).map(property => {
        const priceFormatted = property.price
            ? `₱${property.price.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
            : 'Price upon request';

        // Subtitle: Address + Beds/Baths
        const details = [
            property.address,
            property.bedrooms ? `${property.bedrooms} Beds` : null,
            property.bathrooms ? `${property.bathrooms} Baths` : null
        ].filter(Boolean).join(' • ');

        let subtitle = `${priceFormatted}`;
        if (details) subtitle += `\n${details}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: property.title,
            subtitle: subtitle,
        };

        // Add image if available
        if (property.image_url) {
            element.image_url = property.image_url;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'web_url',
                url: `${appUrl}/property/${property.id}`,
                title: 'View Details',
                webview_height_ratio: 'tall'
            },
            {
                type: 'postback',
                title: '💬 Inquire',
                payload: `INQUIRE_PROP_${property.id}`
            }
        ];

        return element;
    });

    const requestBody = {
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending property cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send property cards:', resData);
            return false;
        }

        console.log('Property cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending property cards:', error);
        return false;
    }
}


// Fetch active payment methods from database
async function getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data) {
            console.log('No payment methods found or error:', error);
            return [];
        }

        return data;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return [];
    }
}

// Send payment methods as Facebook Generic Template cards
async function sendPaymentMethodCards(sender_psid: string, methods: PaymentMethod[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || methods.length === 0) return false;

    // Build elements for Generic Template (max 10)
    const elements = methods.slice(0, 10).map(pm => {
        const subtitle = [
            pm.account_name ? `Account: ${pm.account_name}` : null,
            pm.account_number ? `Number: ${pm.account_number}` : null,
        ].filter(Boolean).join('\n');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: pm.name,
            subtitle: subtitle || 'Payment method available',
        };

        // Add QR code image if available
        if (pm.qr_code_url) {
            element.image_url = pm.qr_code_url;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'postback',
                title: '✅ I\'ll pay here',
                payload: `PAY_${pm.id}`
            }
        ];

        // Add View QR button if QR code exists
        if (pm.qr_code_url) {
            element.buttons.push({
                type: 'web_url',
                title: '📱 View QR Code',
                url: pm.qr_code_url,
                webview_height_ratio: 'tall'
            });
        }

        return element;
    });

    const requestBody = {
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending payment cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send payment cards:', resData);
            return false;
        }

        console.log('Payment cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending payment cards:', error);
        return false;
    }
}

export async function GET(req: Request) {
    const settings = await getSettings();
    const VERIFY_TOKEN = settings.facebook_verify_token || process.env.FACEBOOK_VERIFY_TOKEN || 'TEST_TOKEN';
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return new NextResponse(challenge, { status: 200 });
        } else {
            return new NextResponse('Forbidden', { status: 403 });
        }
    }

    return new NextResponse('Bad Request', { status: 400 });
}

// Track processed message IDs to prevent duplicates (Facebook retries webhooks)
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 1000;

function cleanupProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = Array.from(processedMessages).slice(0, processedMessages.size - MAX_PROCESSED_CACHE);
        toDelete.forEach(id => processedMessages.delete(id));
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('Webhook POST received:', JSON.stringify(body, null, 2));

        if (body.object === 'page') {
            for (const entry of body.entry) {
                const webhook_event = entry.messaging?.[0];
                if (!webhook_event) {
                    console.log('No messaging event found in entry:', entry);
                    continue;
                }

                const sender_psid = webhook_event.sender?.id;
                const recipient_psid = webhook_event.recipient?.id;

                // --- NEW: Handle Referral (m.me links with ref param) ---
                if (webhook_event.referral) {
                    console.log('Referral event received:', webhook_event.referral);
                    waitUntil(
                        handleReferral(sender_psid, webhook_event.referral, recipient_psid).catch(err => {
                            console.error('Error handling referral:', err);
                        })
                    );
                    continue;
                }

                // --- NEW: Handle Postback (Get Started button or Menu) ---
                if (webhook_event.postback) {
                    console.log('Postback event received:', webhook_event.postback);
                    // Check if postback has referral data (Get Started with ref)
                    const referral = webhook_event.postback.referral;
                    if (referral) {
                        console.log('Postback has referral:', referral);
                        waitUntil(
                            handleReferral(sender_psid, referral, recipient_psid).catch(err => {
                                console.error('Error handling postback referral:', err);
                            })
                        );
                        continue;
                    }

                    // Handle other postbacks if needed (e.g. standard Get Started without ref)
                    // limit to PAY_ for now as per existing logic, or extend
                    if (webhook_event.postback.payload && webhook_event.postback.payload.startsWith('PAY_')) {
                        // ... existing payment postback logic could go here if separated ...
                        // For now, let's just log it. The original code didn't seem to have a dedicated postback handler called here?
                        // Ah, looking at the original code, postbacks fell through or were ignored?
                        // Let's explicitly handle PAY_ payloads or valid text fallbacks.
                        console.log('Payment postback received:', webhook_event.postback.payload);
                        // TODO: Implement specific payment postback handling if not handled by text logic
                    }

                    // Handle Property Inquiry Postback
                    if (webhook_event.postback.payload && webhook_event.postback.payload.startsWith('INQUIRE_PROP_')) {
                        const propId = webhook_event.postback.payload.replace('INQUIRE_PROP_', '');
                        console.log('Property Inquiry Postback:', propId);

                        // Fetch property details to give context
                        const { data: prop } = await supabase.from('properties').select('title, price').eq('id', propId).single();

                        const msg = prop
                            ? `I'm interested in "${prop.title}". Is this still available?`
                            : "I'm interested in this property. Is it available?";

                        // Send automated response
                        await callSendAPI(sender_psid, {
                            text: `Thanks for your interest in ${prop?.title || 'this property'}! An agent will be with you shortly to assist you.`
                        }, recipient_psid);

                        // We could also notify the agent here via pipeline/lead update
                        continue;
                    }
                }


                const messageId = webhook_event.message?.mid;

                // Skip if already processed (prevents duplicate responses)
                if (messageId && processedMessages.has(messageId)) {
                    console.log('Skipping duplicate message:', messageId);
                    continue;
                }

                // Mark as processed
                if (messageId) {
                    processedMessages.add(messageId);
                    cleanupProcessedMessages();
                }

                console.log('Processing message from:', sender_psid, 'to:', recipient_psid, 'mid:', messageId);

                // Check if this is a message echo (page/human agent sent a message)
                // Facebook sends is_echo=true when the PAGE sends a message (human agent reply)
                const isEchoMessage = webhook_event.message?.is_echo === true;

                if (isEchoMessage) {
                    // This is a message sent BY the page (human agent) TO a customer
                    // The recipient is the customer, start takeover for them
                    console.log('📢 MESSAGE ECHO detected! Human agent sent message to:', recipient_psid);
                    waitUntil(
                        startOrRefreshTakeover(recipient_psid).catch(err => {
                            console.error('Error starting takeover:', err);
                        })
                    );
                    // Don't process echo messages further (they're outgoing, not incoming)
                    continue;
                }

                if (webhook_event.message) {
                    const hasImageAttachment = webhook_event.message.attachments?.some(
                        (att: { type: string }) => att.type === 'image'
                    );
                    const messageText = webhook_event.message.text;

                    // Handle image attachments - pass any accompanying text to the image handler
                    if (webhook_event.message.attachments) {
                        for (const attachment of webhook_event.message.attachments) {
                            if (attachment.type === 'image' && attachment.payload?.url) {
                                console.log('Image attachment detected:', attachment.payload.url.substring(0, 100));
                                waitUntil(
                                    handleImageMessage(
                                        sender_psid,
                                        attachment.payload.url,
                                        recipient_psid,
                                        messageText // Pass accompanying text
                                    ).catch(err => {
                                        console.error('Error handling image message:', err);
                                    })
                                );
                            }
                        }
                    }

                    // Handle text messages ONLY if there's no image attachment
                    // (if there's an image, the image handler already processes the text)
                    if (messageText && !hasImageAttachment) {
                        console.log('Message text:', messageText);
                        // Use waitUntil to ensure Vercel keeps the function alive
                        // until the message is fully processed and responded to
                        waitUntil(
                            handleMessage(sender_psid, messageText, recipient_psid).catch(err => {
                                console.error('Error handling message:', err);
                            })
                        );
                    }
                }
            }
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        } else {
            console.log('Not a page event:', body.object);
            return new NextResponse('Not Found', { status: 404 });
        }
    } catch (error) {
        console.error('Webhook error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// Handle Referral Events (Chat to Buy)
async function handleReferral(sender_psid: string, referral: any, pageId?: string) {
    const ref = referral.ref; // e.g., "p_id:123|vars:Size-M,Color-Red"
    if (!ref) return;

    console.log('Handling referral ref:', ref);

    // Parse ref
    const params = new URLSearchParams(ref.replace(/\|/g, '&').replace(/:/g, '='));
    const productId = params.get('p_id');
    const varsString = params.get('vars');

    if (productId) {
        // Get the product details
        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();

        if (product && !error) {
            const variationText = varsString ? `\nSelected Options: ${varsString.split(',').join(', ')}` : '';

            // Send welcome message with product context
            await callSendAPI(sender_psid, {
                text: `Hi! 👋 I see you're interested in ${product.name}.${variationText}\n\nHow can we help you with your purchase today?`
            }, pageId);

            // Send the product card again for easy access
            await sendProductCards(sender_psid, [product], pageId);
        } else {
            console.error('Referral product not found:', productId);
            await callSendAPI(sender_psid, {
                text: "Hi! Thanks for messaging us. How can we help you today?"
            }, pageId);
        }
    }
}


// Send typing indicator to show bot is working
async function sendTypingIndicator(sender_psid: string, on: boolean, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    if (!PAGE_ACCESS_TOKEN) return;

    try {
        await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: sender_psid },
                sender_action: on ? 'typing_on' : 'typing_off'
            }),
        });
    } catch (error) {
        console.error('Failed to send typing indicator:', error);
    }
}

async function handleMessage(sender_psid: string, received_message: string, pageId?: string) {
    console.log('handleMessage called, generating response...');

    // Check if human takeover is active for this conversation
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response');
        return;
    }

    // Send typing indicator immediately
    await sendTypingIndicator(sender_psid, true, pageId);

    // Process message and send response
    try {
        // Check if this is a product-related query
        if (isProductQuery(received_message)) {
            console.log('Product query detected, fetching products...');
            const products = await getProducts();

            if (products.length > 0) {
                // Send intro message first
                await callSendAPI(sender_psid, {
                    text: 'Here are our available products! 🛍️ Click on any item to view more details:'
                }, pageId);

                // Send product cards
                const cardsSent = await sendProductCards(sender_psid, products, pageId);

                if (cardsSent) {
                    return; // Don't send AI response, cards are enough
                }
            }
        }

        // Check if this is a PROPERTY-related query
        if (isPropertyQuery(received_message)) {
            console.log('Property query detected, fetching properties...');
            const properties = await getProperties();

            if (properties.length > 0) {
                // Send intro message first
                await callSendAPI(sender_psid, {
                    text: 'Here are our latest properties for you! 🏠 Click to view details:'
                }, pageId);

                // Send property cards
                const cardsSent = await sendPropertyCards(sender_psid, properties, pageId);

                if (cardsSent) {
                    return; // Don't send AI response, cards are enough
                }
            }
        }

        // Check if this is a payment-related query
        // Check if this is a payment-related query
        if (isPaymentQuery(received_message)) {
            console.log('Payment query detected, fetching payment methods...');
            const paymentMethods = await getPaymentMethods();

            if (paymentMethods.length > 0) {
                // Send intro message first
                await callSendAPI(sender_psid, {
                    text: 'Ito po ang aming payment options! 💳 Pwede po kayong pumili kung saan kayo magbabayad:'
                }, pageId);

                // Send payment method cards
                const cardsSent = await sendPaymentMethodCards(sender_psid, paymentMethods, pageId);

                if (cardsSent) {
                    // Also send a follow-up message
                    await callSendAPI(sender_psid, {
                        text: 'Pag nakapagbayad na po kayo, kindly send the screenshot ng receipt para ma-verify namin. Salamat po! 🙏'
                    }, pageId);
                    return; // Don't send AI response, cards are enough
                }
            }
        }

        // Get page access token for profile fetching (using per-page token)
        const pageToken = await getPageToken(pageId);

        // Track the lead and check if stage analysis is needed
        const lead = await getOrCreateLead(sender_psid, pageToken || undefined);
        if (lead) {
            const messageCount = await incrementMessageCount(lead.id);
            console.log(`Lead ${lead.id} message count: ${messageCount}`);

            // Extract and store contact info (phone/email) from the message
            // Fire and forget - don't await
            extractAndStoreContactInfo(lead.id, received_message).catch((err: unknown) => {
                console.error('Error extracting contact info:', err);
            });

            // Check if we should analyze stage (runs in background, non-blocking)
            if (shouldAnalyzeStage({ ...lead, message_count: messageCount }, received_message)) {
                console.log('Triggering pipeline stage analysis...');
                // Fire and forget - don't await
                analyzeAndUpdateStage(lead, sender_psid).catch((err: unknown) => {
                    console.error('Error in stage analysis:', err);
                });
            }
        }
        // === END AUTO-PIPELINE ===


        const responseText = await getBotResponse(received_message, sender_psid);
        console.log('Bot response generated:', responseText.substring(0, 100) + '...');

        const response = {
            text: responseText,
        };

        await callSendAPI(sender_psid, response, pageId);
    } finally {
        // Turn off typing indicator
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}

// Handle image messages - analyze and pass context to chatbot for intelligent response
async function handleImageMessage(sender_psid: string, imageUrl: string, pageId?: string, accompanyingText?: string) {
    console.log('handleImageMessage called, analyzing image...');

    // Check if human takeover is active
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response for image');
        return;
    }

    try {
        // Get page token for this specific page
        const pageToken = await getPageToken(pageId);

        // Get or create the lead first
        const lead = await getOrCreateLead(sender_psid, pageToken || undefined);
        if (!lead) {
            console.error('Could not get or create lead for sender:', sender_psid);
            return;
        }

        // Send typing indicator while analyzing
        await sendTypingIndicator(sender_psid, true, pageId);

        // Analyze the image
        const result = await analyzeImageForReceipt(imageUrl);
        console.log('Image analysis result:', result);

        // Build image context for the chatbot
        const imageContext: ImageContext = {
            isReceipt: result.isReceipt,
            confidence: result.confidence,
            details: result.details,
            extractedAmount: result.extractedAmount,
            extractedDate: result.extractedDate,
            imageUrl: imageUrl,
            receiverName: result.receiverName,
            receiverNumber: result.receiverNumber,
            paymentPlatform: result.paymentPlatform,
        };

        // If receipt detected, verify against stored payment methods
        if (result.isReceipt && result.confidence >= 0.5) {
            const paymentMethods = await getPaymentMethods();

            // Priority: Account NUMBER is the most reliable (names are often masked like "JO*N AN***O")
            if (paymentMethods.length > 0) {
                let matchedMethod: PaymentMethod | null = null;
                let matchedBy = '';

                // FIRST: Try to match by account number (most reliable)
                if (result.receiverNumber) {
                    for (const pm of paymentMethods) {
                        if (pm.account_number) {
                            // Normalize numbers for comparison (remove spaces, dashes, parentheses)
                            const extractedNum = result.receiverNumber.replace(/[\s\-\(\)]/g, '');
                            const storedNum = pm.account_number.replace(/[\s\-\(\)]/g, '');

                            // Check if last 4 digits match (often numbers start differently like +63 vs 09)
                            const extractedLast4 = extractedNum.slice(-4);
                            const storedLast4 = storedNum.slice(-4);

                            if (extractedNum.includes(storedNum) ||
                                storedNum.includes(extractedNum) ||
                                (extractedLast4 === storedLast4 && extractedNum.length >= 8)) {
                                matchedMethod = pm;
                                matchedBy = 'account number';
                                break;
                            }
                        }
                    }
                }

                // SECOND: Only if no number match AND name looks unmasked (no asterisks)
                if (!matchedMethod && result.receiverName && !result.receiverName.includes('*')) {
                    for (const pm of paymentMethods) {
                        if (pm.account_name) {
                            const extractedName = result.receiverName.toLowerCase().replace(/[^a-z]/g, '');
                            const storedName = pm.account_name.toLowerCase().replace(/[^a-z]/g, '');
                            if (extractedName.includes(storedName) || storedName.includes(extractedName)) {
                                matchedMethod = pm;
                                matchedBy = 'account name';
                                break;
                            }
                        }
                    }
                }

                if (matchedMethod) {
                    imageContext.verificationStatus = 'verified';
                    imageContext.verificationDetails = `Payment sent to ${matchedMethod.name} - ${matchedBy} matches our records!`;
                    console.log('✅ Payment VERIFIED:', imageContext.verificationDetails);
                } else if (result.receiverNumber) {
                    // Only mark as mismatch if we have a number to compare
                    imageContext.verificationStatus = 'mismatch';
                    const ourNumbers = paymentMethods
                        .filter(pm => pm.account_number)
                        .map(pm => `${pm.name}: ${pm.account_number}`)
                        .join(', ');
                    imageContext.verificationDetails = `Receipt shows payment to ${result.receiverNumber}, but our account numbers are: ${ourNumbers}`;
                    console.log('⚠️ Payment MISMATCH:', imageContext.verificationDetails);
                } else {
                    // No number to verify - accept but note we couldn't fully verify
                    imageContext.verificationStatus = 'unknown';
                    imageContext.verificationDetails = 'Could not extract account number from receipt for full verification, but receipt looks valid';
                }
            } else {
                imageContext.verificationStatus = 'unknown';
                imageContext.verificationDetails = 'No payment methods configured to verify against';
            }
        }

        // If high-confidence receipt detected, also move to receipt stage
        if (isConfirmedReceipt(result)) {
            console.log('Receipt confirmed! Moving lead to payment stage...');
            await moveLeadToReceiptStage(lead.id, imageUrl, result.details || 'Receipt detected by AI');
        }

        // Increment message count for the lead
        await incrementMessageCount(lead.id);

        // Extract contact info from accompanying text if present
        if (accompanyingText) {
            extractAndStoreContactInfo(lead.id, accompanyingText).catch((err: unknown) => {
                console.error('Error extracting contact info from image message:', err);
            });
        }

        // Build a user message that includes any accompanying text
        const userMessage = accompanyingText
            ? `[Customer sent an image with message: "${accompanyingText}"]`
            : "[Customer sent an image]";

        // Get chatbot response with image context
        const responseText = await getBotResponse(userMessage, sender_psid, imageContext);
        console.log('Bot response for image:', responseText.substring(0, 100) + '...');

        // Send the AI's response
        await callSendAPI(sender_psid, { text: responseText }, pageId);

    } catch (error) {
        console.error('Error in handleImageMessage:', error);
        // Send a fallback response on error
        await callSendAPI(sender_psid, {
            text: "Nakita ko po ang image niyo. May tanong ba kayo tungkol dito? 😊"
        }, pageId);
    } finally {
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}




async function callSendAPI(sender_psid: string, response: any, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    console.log('callSendAPI called, token present:', !!PAGE_ACCESS_TOKEN);

    if (!PAGE_ACCESS_TOKEN) {
        console.warn('FACEBOOK_PAGE_ACCESS_TOKEN not set, skipping message send.');
        return;
    }

    const requestBody = {
        recipient: {
            id: sender_psid,
        },
        message: response,
    };

    console.log('Sending to Facebook:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const resText = await res.text();
        console.log('Facebook API response:', res.status, resText);

        if (!res.ok) {
            console.error('Unable to send message:', resText);
        }
    } catch (error) {
        console.error('Unable to send message:', error);
    }
}
