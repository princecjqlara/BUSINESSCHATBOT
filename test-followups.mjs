// Check all follow-up systems
const BASE_URL = 'https://businesschatbot-beta.vercel.app';

async function diagnoseFollowups() {
    console.log('🔍 DIAGNOSING ALL FOLLOW-UP SYSTEMS');
    console.log('='.repeat(50));
    console.log('Current time:', new Date().toISOString());
    console.log('');

    // 1. Test AI Autonomous Follow-up
    console.log('1️⃣ AI AUTONOMOUS FOLLOW-UP');
    try {
        const res1 = await fetch(`${BASE_URL}/api/cron/ai-autonomous-followups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceRun: true })
        });
        const data1 = await res1.json();
        console.log('   Status:', res1.status);
        console.log('   Leads checked:', data1.leadsChecked);
        console.log('   Scheduled:', data1.followupsScheduled);
        console.log('   Sent:', data1.followupsSent);
        if (data1.errors?.length > 0) {
            console.log('   Errors:', data1.errors);
        }
    } catch (error) {
        console.log('   ERROR:', error.message);
    }
    console.log('');

    // 2. Test Best Time to Contact (Scheduled Messages)
    console.log('2️⃣ BEST TIME TO CONTACT (Scheduled Messages)');
    try {
        const res2 = await fetch(`${BASE_URL}/api/cron/process-scheduled-messages`, {
            method: 'POST'
        });
        const data2 = await res2.json();
        console.log('   Status:', res2.status);
        console.log('   Result:', data2.message || data2.error || JSON.stringify(data2));
    } catch (error) {
        console.log('   ERROR:', error.message);
    }
    console.log('');

    // 3. Test Workflow Executions
    console.log('3️⃣ WORKFLOW EXECUTIONS');
    try {
        const res3 = await fetch(`${BASE_URL}/api/cron/execute-workflows`, {
            method: 'POST'
        });
        const data3 = await res3.json();
        console.log('   Status:', res3.status);
        console.log('   Processed:', data3.processed);
    } catch (error) {
        console.log('   ERROR:', error.message);
    }
    console.log('');

    console.log('='.repeat(50));
    console.log('DIAGNOSIS COMPLETE');
}

diagnoseFollowups();
