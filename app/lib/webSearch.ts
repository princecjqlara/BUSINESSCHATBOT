/**
 * Web Search Utility
 * Provides web search functionality for the AI assistant
 */

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

/**
 * Search the web using DuckDuckGo (no API key required)
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    try {
        // Use DuckDuckGo HTML search (no API key needed)
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const html = await response.text();
        
        // Parse HTML to extract search results
        const results: SearchResult[] = [];
        
        // DuckDuckGo HTML structure: results are in <div class="result">
        const resultRegex = /<div class="result[^"]*">[\s\S]*?<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;
        
        let match;
        let count = 0;
        while ((match = resultRegex.exec(html)) !== null && count < maxResults) {
            results.push({
                title: match[2].trim(),
                url: match[1],
                snippet: match[3].trim(),
            });
            count++;
        }

        return results;
    } catch (error) {
        console.error('[Web Search] Error:', error);
        // Fallback: try alternative search method
        return await searchWebAlternative(query, maxResults);
    }
}

/**
 * Alternative web search using a different method
 */
async function searchWebAlternative(query: string, maxResults: number): Promise<SearchResult[]> {
    try {
        // Try using a public search API endpoint
        // This is a fallback method
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            throw new Error('Alternative search failed');
        }

        const data = await response.json();
        const results: SearchResult[] = [];

        // DuckDuckGo API returns RelatedTopics
        if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
            data.RelatedTopics.slice(0, maxResults).forEach((topic: any) => {
                if (topic.Text && topic.FirstURL) {
                    results.push({
                        title: topic.Text.split(' - ')[0] || topic.Text,
                        url: topic.FirstURL,
                        snippet: topic.Text,
                    });
                }
            });
        }

        // Also add Abstract if available
        if (data.Abstract && data.AbstractURL && results.length < maxResults) {
            results.unshift({
                title: data.Heading || 'Result',
                url: data.AbstractURL,
                snippet: data.Abstract,
            });
        }

        return results;
    } catch (error) {
        console.error('[Web Search] Alternative search error:', error);
        return [];
    }
}

/**
 * Format search results for AI context
 */
export function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'No web search results found.';
    }

    let formatted = 'WEB SEARCH RESULTS:\n\n';
    results.forEach((result, index) => {
        formatted += `${index + 1}. ${result.title}\n`;
        formatted += `   URL: ${result.url}\n`;
        formatted += `   Summary: ${result.snippet}\n\n`;
    });

    return formatted;
}

/**
 * Determine if a user prompt might benefit from web search
 */
export function shouldSearchWeb(userPrompt: string, documentText: string): boolean {
    const searchKeywords = [
        'current', 'latest', 'recent', 'today', 'now', '2024', '2025',
        'search', 'find', 'look up', 'check', 'verify', 'what is', 'who is',
        'price', 'cost', 'market', 'news', 'update', 'trend', 'statistics',
        'data', 'information about', 'details about', 'facts about',
    ];

    const promptLower = userPrompt.toLowerCase();
    const docLower = documentText.toLowerCase();

    // Check if prompt contains search keywords
    const hasSearchKeyword = searchKeywords.some(keyword => 
        promptLower.includes(keyword)
    );

    // Check if user explicitly asks to search
    const explicitSearch = promptLower.includes('search') || 
                          promptLower.includes('look up') ||
                          promptLower.includes('find information') ||
                          promptLower.includes('web search');

    return hasSearchKeyword || explicitSearch;
}



