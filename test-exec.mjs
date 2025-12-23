// Check pending workflow executions and trigger cron
const BASE_URL = 'https://businesschatbot-beta.vercel.app';

async function checkAndTrigger() {
    console.log('🔍 Checking pending workflow executions...');
    console.log('Current time:', new Date().toISOString());
    console.log('');

    // Trigger execute-workflows to process any pending
    try {
        const res = await fetch(`${BASE_URL}/api/cron/execute-workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.processed > 0) {
            console.log(`\n✅ Processed ${data.processed} workflow executions!`);
        } else {
            console.log('\n⚠️ No workflow executions processed.');
            console.log('This could mean:');
            console.log('  - No pending executions yet');
            console.log('  - scheduled_for time hasn\'t arrived yet');
            console.log('  - There was an issue with scheduling');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

checkAndTrigger();
