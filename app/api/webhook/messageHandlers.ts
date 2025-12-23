import { getBotResponse, ImageContext } from '@/app/lib/chatService';
import { extractAndStoreContactInfo } from '@/app/lib/contactExtractionService';
import { isTakeoverActive } from '@/app/lib/humanTakeoverService';
import { analyzeImageForReceipt, isConfirmedReceipt } from '@/app/lib/receiptDetectionService';
import { analyzeAndUpdateStage, getOrCreateLead, incrementMessageCount, moveLeadToReceiptStage, shouldAnalyzeStage, extractAndUpdateLeadName } from '@/app/lib/pipelineService';
import { computeBestContactTimes, storeBestContactTimes } from '@/app/lib/bestContactTimesService';
import { stripMediaLinksFromText } from '@/app/lib/mediaUtils';
import { supabase } from '@/app/lib/supabase';
import { callSendAPI, sendMediaAttachments, sendPaymentMethodCards, sendProductCards, sendPropertyCards, sendTypingIndicator } from './facebookClient';
import { getPageToken } from './config';
import { getPaymentMethods, getProducts, getProperties, PaymentMethod } from './data';
import { isPaymentQuery, isProductQuery, isPropertyQuery } from './keywords';

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Update best contact times for a lead based on message history
 * Runs in background, non-blocking
 */
async function updateBestContactTimes(senderId: string, leadId: string): Promise<void> {
    try {
        console.log(`[BestContactTimes] Updating best contact times for lead ${leadId} (sender: ${senderId})`);
        const computed = await computeBestContactTimes(senderId);
        if (computed) {
            await storeBestContactTimes(leadId, computed);
            console.log(`[BestContactTimes] Successfully updated best contact times for lead ${leadId}`);
        } else {
            console.log(`[BestContactTimes] No sufficient data to compute best contact times for lead ${leadId}`);
        }
    } catch (error) {
        console.error(`[BestContactTimes] Error updating best contact times for lead ${leadId}:`, error);
        // Don't throw - this is a background operation
    }
}

// Handle Referral Events (Chat to Buy)
export async function handleReferral(sender_psid: string, referral: any, pageId?: string) {
    const ref = referral.ref; // e.g., "p_id:123|vars:Size-M,Color-Red" or "prop_id:456"
    if (!ref) return;

    console.log('Handling referral ref:', ref);

    // Parse ref
    const params = new URLSearchParams(ref.replace(/\|/g, '&').replace(/:/g, '='));
    const productId = params.get('p_id');
    const propertyId = params.get('prop_id') || params.get('property_id');
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
            return;
        } else {
            console.error('Referral product not found:', productId);
            await callSendAPI(sender_psid, {
                text: "Hi! Thanks for messaging us. How can we help you today?"
            }, pageId);
            return;
        }
    }

    if (propertyId) {
        const { data: property, error } = await supabase
            .from('properties')
            .select('id, title, price, address, image_url, status, bedrooms, bathrooms')
            .eq('id', propertyId)
            .single();

        if (property && !error) {
            const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
            const formattedPrice = property.price
                ? `₱${property.price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
                : 'Price on request';
            const subtitleParts = [formattedPrice];
            if (property.address) subtitleParts.push(property.address);
            if (property.status) subtitleParts.push(property.status.replace('_', ' '));
            const specs: string[] = [];
            if (property.bedrooms) specs.push(`${property.bedrooms} BR`);
            if (property.bathrooms) specs.push(`${property.bathrooms} BA`);
            if (specs.length) subtitleParts.push(specs.join(' • '));

            await callSendAPI(sender_psid, {
                text: `Hi! 👋 I see you're checking out "${property.title}". Would you like to talk to an agent about this property?`
            }, pageId);

            await callSendAPI(sender_psid, {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: [
                            {
                                title: property.title,
                                image_url: property.image_url || undefined,
                                subtitle: subtitleParts.join(' • '),
                                buttons: [
                                    {
                                        type: 'web_url',
                                        url: `${appUrl}/property/${property.id}`,
                                        title: 'View Property',
                                        webview_height_ratio: 'tall'
                                    },
                                    {
                                        type: 'postback',
                                        title: 'I want to inquire',
                                        payload: `INQUIRE_PROP_${property.id}`
                                    }
                                ]
                            }
                        ]
                    }
                }
            }, pageId);
            return;
        } else {
            console.error('Referral property not found:', propertyId);
            await callSendAPI(sender_psid, {
                text: "Hi! Thanks for checking a property. How can we help you today?"
            }, pageId);
            return;
        }
    }

    // Fallback for unknown referral types
    await callSendAPI(sender_psid, {
        text: "Hi! Thanks for reaching out. How can we help you today?"
    }, pageId);
}

export async function handlePostback(postback: any, sender_psid: string, recipient_psid?: string, defer?: WaitUntil) {
    if (postback.referral) {
        console.log('Postback has referral:', postback.referral);
        defer?.(
            handleReferral(sender_psid, postback.referral, recipient_psid).catch(err => {
                console.error('Error handling postback referral:', err);
            })
        );
        return true;
    }

    if (postback.payload && postback.payload.startsWith('PAY_')) {
        console.log('Payment postback received:', postback.payload);
        return false;
    }

    if (postback.payload && postback.payload.startsWith('INQUIRE_PROP_')) {
        const propId = postback.payload.replace('INQUIRE_PROP_', '');
        console.log('Property Inquiry Postback:', propId);

        // Fetch property details to give context
        const { data: prop } = await supabase.from('properties').select('title, price').eq('id', propId).single();

        // Send automated response
        await callSendAPI(sender_psid, {
            text: `Thanks for your interest in ${prop?.title || 'this property'}! An agent will be with you shortly to assist you.`
        }, recipient_psid);

        // We could also notify the agent here via pipeline/lead update
        return true;
    }

    return false;
}

export async function handleMessage(sender_psid: string, received_message: string, pageId?: string) {
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

            // Try to extract name from conversation after a few messages (runs in background)
            if (messageCount >= 3 && messageCount <= 8) {
                setTimeout(() => {
                    extractAndUpdateLeadName(lead.id, sender_psid).catch((err: unknown) => {
                        console.error('Error extracting name from conversation:', err);
                    });
                }, 500); // Small delay to not interfere with main flow
            }

            // Get conversation history for better contact extraction
            let conversationHistory: Array<{ role: string; content: string }> = [];
            try {
                const { data: messages } = await supabase
                    .from('conversations')
                    .select('role, content')
                    .eq('sender_id', sender_psid)
                    .order('created_at', { ascending: true })
                    .limit(10); // Get last 10 messages for context

                if (messages) {
                    conversationHistory = messages;
                }
            } catch (err) {
                console.error('Error fetching conversation history for extraction:', err);
            }

            // Extract and store contact info (phone/email) and business details from the message
            extractAndStoreContactInfo(lead.id, received_message, conversationHistory).catch((err: unknown) => {
                console.error('Error extracting contact info:', err);
            });

            // Check if we should analyze stage (runs in background, non-blocking)
            if (shouldAnalyzeStage({ ...lead, message_count: messageCount }, received_message)) {
                console.log('Triggering pipeline stage analysis...');
                analyzeAndUpdateStage(lead, sender_psid).catch((err: unknown) => {
                    console.error('Error in stage analysis:', err);
                });
            }
        }

        const responseResult = await getBotResponse(received_message, sender_psid);

        // Extract messages and mediaUrls from response
        let messages: string[];
        let mediaUrls: string[] = [];

        if (typeof responseResult === 'object' && 'messages' in responseResult) {
            // New format with mediaUrls
            const response = responseResult.messages;
            messages = Array.isArray(response) ? response : [response];
            mediaUrls = responseResult.mediaUrls || [];
        } else {
            // Legacy format (string or string[])
            messages = Array.isArray(responseResult) ? responseResult : [responseResult];
        }

        console.log(`Bot response generated: ${messages.length} message(s), ${mediaUrls.length} media URL(s)`);

        // Send each message sequentially with a small delay between them
        for (let i = 0; i < messages.length; i++) {
            let message = messages[i];

            // Strip media URLs from text if we're sending them as attachments
            // This prevents duplicate media (once as text link, once as attachment)
            if (mediaUrls.length > 0) {
                message = stripMediaLinksFromText(message, mediaUrls);
            }

            // Skip empty messages after stripping
            if (!message || message.trim().length === 0) {
                console.log(`Skipping empty message ${i + 1}/${messages.length} after stripping media links`);
                continue;
            }

            console.log(`Sending message ${i + 1}/${messages.length}: "${message.substring(0, 80)}..."`);

            await callSendAPI(sender_psid, { text: message }, pageId);

            // Add a small delay between messages (except for the last one)
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            }
        }

        // Send media attachments after all text messages
        if (mediaUrls.length > 0) {
            console.log(`[Media] Sending ${mediaUrls.length} media attachment(s) from knowledge base`);
            await sendMediaAttachments(sender_psid, mediaUrls, pageId);
        }

        // Update best contact times after messages are sent (runs in background, non-blocking)
        // Add a small delay to allow database writes to complete
        if (lead) {
            setTimeout(() => {
                updateBestContactTimes(sender_psid, lead.id).catch((err: unknown) => {
                    console.error('Error updating best contact times:', err);
                });
            }, 1000); // 1 second delay to allow conversation storage to complete
        }
    } finally {
        // Turn off typing indicator
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}

// Handle image messages - analyze and pass context to chatbot for intelligent response
export async function handleImageMessage(sender_psid: string, imageUrl: string, pageId?: string, accompanyingText?: string) {
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
            // Get conversation history for better contact extraction
            let conversationHistory: Array<{ role: string; content: string }> = [];
            try {
                const { data: messages } = await supabase
                    .from('conversations')
                    .select('role, content')
                    .eq('sender_id', sender_psid)
                    .order('created_at', { ascending: true })
                    .limit(10); // Get last 10 messages for context

                if (messages) {
                    conversationHistory = messages;
                }
            } catch (err) {
                console.error('Error fetching conversation history for extraction:', err);
            }

            extractAndStoreContactInfo(lead.id, accompanyingText, conversationHistory).catch((err: unknown) => {
                console.error('Error extracting contact info from image message:', err);
            });
        }

        // Build a user message that includes any accompanying text
        const userMessage = accompanyingText
            ? `[Customer sent an image with message: "${accompanyingText}"]`
            : "[Customer sent an image]";

        // Get chatbot response with image context
        const responseResult = await getBotResponse(userMessage, sender_psid, imageContext);

        // Extract messages and mediaUrls from response
        let messages: string[];
        let mediaUrls: string[] = [];

        if (typeof responseResult === 'object' && 'messages' in responseResult) {
            // New format with mediaUrls
            const response = responseResult.messages;
            messages = Array.isArray(response) ? response : [response];
            mediaUrls = responseResult.mediaUrls || [];
        } else {
            // Legacy format (string or string[])
            messages = Array.isArray(responseResult) ? responseResult : [responseResult];
        }

        console.log(`Bot response for image: ${messages.length} message(s), ${mediaUrls.length} media URL(s)`);

        // Send each message sequentially with a small delay between them
        for (let i = 0; i < messages.length; i++) {
            let message = messages[i];

            // Strip media URLs from text if we're sending them as attachments
            // This prevents duplicate media (once as text link, once as attachment)
            if (mediaUrls.length > 0) {
                message = stripMediaLinksFromText(message, mediaUrls);
            }

            // Skip empty messages after stripping
            if (!message || message.trim().length === 0) {
                console.log(`Skipping empty message ${i + 1}/${messages.length} after stripping media links`);
                continue;
            }

            console.log(`Sending message ${i + 1}/${messages.length}: "${message.substring(0, 80)}..."`);

            await callSendAPI(sender_psid, { text: message }, pageId);

            // Add a small delay between messages (except for the last one)
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            }
        }

        // Send media attachments after all text messages
        if (mediaUrls.length > 0) {
            console.log(`[Media] Sending ${mediaUrls.length} media attachment(s) from knowledge base`);
            await sendMediaAttachments(sender_psid, mediaUrls, pageId);
        }

        // Update best contact times after messages are sent (runs in background, non-blocking)
        // Add a small delay to allow database writes to complete
        setTimeout(() => {
            updateBestContactTimes(sender_psid, lead.id).catch((err: unknown) => {
                console.error('Error updating best contact times:', err);
            });
        }, 1000); // 1 second delay to allow conversation storage to complete

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
