// Test workflow execution endpoint
const BASE_URL = 'https://businesschatbot-beta.vercel.app';

async function testWorkflowExecution() {
    console.log('🔍 TESTING WORKFLOW EXECUTION');
    console.log('='.repeat(50));
    console.log(`Time: ${new Date().toISOString()}`);

    try {
        // Test the POST endpoint (manual trigger)
        console.log('\n📋 Testing POST /api/cron/execute-workflows...');
        const res = await fetch(`${BASE_URL}/api/cron/execute-workflows`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`Status: ${res.status} ${res.statusText}`);

        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (res.ok) {
            console.log(`\n✅ SUCCESS - Processed ${data.processed} workflows`);
        } else {
            console.log(`\n❌ FAILED - ${data.error}`);
        }
    } catch (error) {
        console.log(`\n❌ ERROR: ${error.message}`);
    }
}

testWorkflowExecution();
