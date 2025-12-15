import { NextResponse } from 'next/server';

const DEBUG_SERVER_URL = 'http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380';

export async function POST(req: Request) {
  try {
    const logData = await req.json();
    
    // Forward the log to the debug server
    const response = await fetch(DEBUG_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logData),
    });

    if (!response.ok) {
      console.error('[Debug Log Proxy] Failed to forward log:', response.status, response.statusText);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // Silently fail - debug logs shouldn't break the app
    console.error('[Debug Log Proxy] Error forwarding log:', error);
    return NextResponse.json({ success: false, error: 'Failed to forward log' }, { status: 500 });
  }
}



