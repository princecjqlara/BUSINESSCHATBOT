/**
 * Add User via Supabase Admin API
 * 
 * Run this with Node.js to add the user via API
 * 
 * Usage: node add_user_api.js
 */

const SUPABASE_URL = 'https://eqnkxjskwrpjqblnnlea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxbmt4anNrd3JwanFibG5ubGVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM3MjA0MCwiZXhwIjoyMDgwOTQ4MDQwfQ.fLiQYdEX4AmhyruIWDw7ZHTz_58fy25Tdfu1uePZWv8';

async function createUser() {
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'messengerbulksend@gmail.com',
                password: 'demet5732595',
                email_confirm: true, // Auto-confirm the email
                user_metadata: {}
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ User created successfully!');
            console.log('User ID:', data.id);
            console.log('Email:', data.email);
        } else {
            console.error('❌ Error creating user:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

createUser();

