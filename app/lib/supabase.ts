import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a mock client if Supabase is not configured
let supabase: any;
if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. RAG features will not work.');
    
    // #region agent log
    if (typeof fetch !== 'undefined') {
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:8',message:'Supabase credentials missing - using mock client',data:{hasUrl:!!supabaseUrl,hasKey:!!supabaseKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
    // #endregion
    
    // Create a chainable mock query builder that returns empty results
    const createChainableQuery = (tableName: string): any => {
        const result = { data: [], error: null };
        const chainable = {
            select: () => {
                // #region agent log
                if (typeof fetch !== 'undefined') {
                    fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:mock-select',message:'Mock Supabase query returning empty array',data:{table:tableName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                }
                // #endregion
                return chainable;
            },
            insert: () => chainable,
            update: () => chainable,
            delete: () => chainable,
            order: () => chainable,
            limit: () => chainable,
            eq: () => chainable,
            in: () => chainable,
            neq: () => chainable,
            gt: () => chainable,
            gte: () => chainable,
            lt: () => chainable,
            lte: () => chainable,
            like: () => chainable,
            ilike: () => chainable,
            is: () => chainable,
            not: () => chainable,
            or: () => chainable,
            single: () => chainable,
            // Make it thenable (promise-like) so it can be awaited
            then: (onResolve: (value: any) => any, onReject?: (error: any) => any) => {
                return Promise.resolve(result).then(onResolve, onReject);
            },
            catch: (onReject: (error: any) => any) => {
                return Promise.resolve(result).catch(onReject);
            }
        };
        return chainable;
    };
    
    // Create a mock client with chainable from() method
    supabase = {
        from: (table: string) => createChainableQuery(table),
    };
} else {
    // #region agent log
    if (typeof fetch !== 'undefined') {
        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.ts:47',message:'Supabase client created successfully',data:{hasUrl:!!supabaseUrl,hasKey:!!supabaseKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
    // #endregion
    supabase = createClient(supabaseUrl, supabaseKey);
}

export { supabase };
