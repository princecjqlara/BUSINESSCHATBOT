import { getPageToken } from './config';
import type { PaymentMethod, Product, Property } from './data';

const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';

// Send products as Facebook Generic Template cards
export async function sendProductCards(sender_psid: string, products: Product[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || products.length === 0) return false;

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
                url: `${DEFAULT_APP_URL}/product/${product.id}`,
                title: 'View Product',
                webview_height_ratio: 'tall'
            }
        ];

        return element;
    });

    const requestBody = {
        messaging_type: 'RESPONSE',
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
export async function sendPropertyCards(sender_psid: string, properties: Property[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || properties.length === 0) return false;

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
                url: `${DEFAULT_APP_URL}/property/${property.id}`,
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
        messaging_type: 'RESPONSE',
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


// Send payment methods as Facebook Generic Template cards
export async function sendPaymentMethodCards(sender_psid: string, methods: PaymentMethod[], pageId?: string) {
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
        messaging_type: 'RESPONSE',
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

// Send typing indicator to show bot is working
export async function sendTypingIndicator(sender_psid: string, on: boolean, pageId?: string) {
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


export async function callSendAPI(sender_psid: string, response: any, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    console.log('callSendAPI called, token present:', !!PAGE_ACCESS_TOKEN);

    if (!PAGE_ACCESS_TOKEN) {
        console.warn('FACEBOOK_PAGE_ACCESS_TOKEN not set, skipping message send.');
        return;
    }

    const requestBody = {
        messaging_type: 'RESPONSE',
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

// Send media attachments (images, videos, files) via Facebook Messenger
export async function sendMediaAttachments(sender_psid: string, mediaUrls: string[], pageId?: string): Promise<boolean> {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    if (!PAGE_ACCESS_TOKEN || !mediaUrls || mediaUrls.length === 0) {
        return false;
    }

    console.log(`[Media] Sending ${mediaUrls.length} media attachment(s) to ${sender_psid}`);

    // Send each media URL as a separate attachment
    for (const url of mediaUrls) {
        try {
            // Determine attachment type based on URL extension
            let attachmentType = 'image'; // Default to image
            const urlLower = url.toLowerCase();
            if (urlLower.match(/\.(mp4|avi|mov|wmv|flv|webm)$/)) {
                attachmentType = 'video';
            } else if (urlLower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/)) {
                attachmentType = 'file';
            }

            const requestBody = {
                messaging_type: 'RESPONSE',
                recipient: { id: sender_psid },
                message: {
                    attachment: {
                        type: attachmentType,
                        payload: {
                            url: url,
                            is_reusable: true
                        }
                    }
                }
            };

            console.log(`[Media] Sending ${attachmentType}: ${url.substring(0, 100)}...`);

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
                console.error(`[Media] Failed to send ${attachmentType}:`, resData);
                continue; // Try next media URL
            }

            console.log(`[Media] Successfully sent ${attachmentType}`);
            
            // Add a small delay between media attachments
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error(`[Media] Error sending media attachment:`, error);
            continue; // Try next media URL
        }
    }

    return true;
}
