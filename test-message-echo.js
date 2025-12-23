/**
 * Test Message Echo Detection
 * This script simulates a Facebook message echo webhook event
 * to test if the human takeover feature is working correctly.
 */

const WEBHOOK_URL = 'https://businesschatbot-beta.vercel.app/api/webhook';
const PAGE_ID = '536520592877468'; // Your Facebook Page ID

// Simulate a message echo from a human agent to a customer
async function testMessageEcho() {
    // This is a sample customer PSID - replace with a real one from your database
    const customerPSID = '24941440095540427'; // Replace with actual customer sender_id

    const echoPayload = {
        object: 'page',
        entry: [
            {
                id: PAGE_ID,
                time: Date.now(),
                messaging: [
                    {
                        sender: {
                            id: PAGE_ID // Page is the sender (echo)
                        },
                        recipient: {
                            id: customerPSID // Customer is the recipient
                        },
                        timestamp: Date.now(),
                        message: {
                            mid: `m_test_echo_${Date.now()}`,
                            text: 'Test message from human agent',
                            is_echo: true, // THIS IS THE KEY - marks it as an echo
                            app_id: 123456789
                        }
                    }
                ]
            }
        ]
    };

    console.log('Sending test message echo to webhook...');
    console.log('Payload:', JSON.stringify(echoPayload, null, 2));

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(echoPayload),
        });

        const responseText = await response.text();
        console.log('\nResponse status:', response.status);
        console.log('Response body:', responseText);

        if (response.ok) {
            console.log('\n✅ Webhook accepted the message echo!');
            console.log('Check Vercel logs for:');
            console.log('  - "📢 MESSAGE ECHO detected!"');
            console.log('  - "Human takeover started/refreshed for ' + customerPSID + '"');
        } else {
            console.log('\n❌ Webhook returned error');
        }
    } catch (error) {
        console.error('\n❌ Error sending request:', error);
    }
}

// Run the test
testMessageEcho();
