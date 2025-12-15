/**
 * Update User Password via Supabase Admin API
 * 
 * Run this with Node.js to update the user's password
 * 
 * Usage: node update_user_password.js
 */

const SUPABASE_URL = 'https://eqnkxjskwrpjqblnnlea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxbmt4anNrd3JwanFibG5ubGVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM3MjA0MCwiZXhwIjoyMDgwOTQ4MDQwfQ.fLiQYdEX4AmhyruIWDw7ZHTz_58fy25Tdfu1uePZWv8';

async function updateUserPassword() {
    try {
        // First, get the user ID
        const getUserResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=messengerbulksend@gmail.com`, {
            method: 'GET',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            }
        });

        const users = await getUserResponse.json();
        
        if (!users.users || users.users.length === 0) {
            console.log('❌ User not found');
            return;
        }

        const userId = users.users[0].id;
        console.log('Found user:', userId);

        // Update the password
        const updateResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: 'demet5732595',
                email_confirm: true // Ensure email is confirmed
            })
        });

        const data = await updateResponse.json();

        if (updateResponse.ok) {
            console.log('✅ Password updated successfully!');
            console.log('Email:', data.email);
            console.log('User ID:', data.id);
        } else {
            console.error('❌ Error updating password:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

updateUserPassword();

