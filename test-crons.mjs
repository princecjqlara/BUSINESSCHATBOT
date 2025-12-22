// Test all cron endpoints
const CRON_SECRET = '6be21fda086930487f944b0a64ae86288bf0cfc22dfa2cf39baf366ed99abbc2';
const BASE_URL = 'https://businesschatbot-beta.vercel.app';

const endpoints = [
    '/api/cron/ai-autonomous-followups',
    '/api/cron/execute-workflows',
    '/api/cron/process-scheduled-messages'
];

async function testEndpoint(path) {
    console.log(`\n🔄 Testing: ${path}`);
    console.log('─'.repeat(50));

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`
            }
        });

        const status = response.status;
        const statusText = response.statusText;

        let body;
        try {
            body = await response.json();
        } catch {
            body = await response.text();
        }

        if (status === 200) {
            console.log(`✅ SUCCESS (${status} ${statusText})`);
        } else {
            console.log(`❌ FAILED (${status} ${statusText})`);
        }
        console.log('Response:', JSON.stringify(body, null, 2));

        return { path, status, body };
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        return { path, error: error.message };
    }
}

async function runTests() {
    console.log('🧪 CRON ENDPOINT TESTS');
    console.log('='.repeat(50));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Time: ${new Date().toISOString()}`);

    const results = [];
    for (const endpoint of endpoints) {
        const result = await testEndpoint(endpoint);
        results.push(result);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    for (const result of results) {
        const status = result.error ? '❌ ERROR' : (result.status === 200 ? '✅ OK' : `❌ ${result.status}`);
        console.log(`${status} - ${result.path}`);
    }
}

runTests();
