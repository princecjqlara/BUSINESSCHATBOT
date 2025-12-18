/**
 * Utility functions for detecting and handling media URLs
 */

/**
 * Check if a URL is a media URL (image, video, or file)
 */
export function isMediaUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        // Check if it's a valid URL
        const urlObj = new URL(url);
        const urlLower = url.toLowerCase();

        // Check for image extensions
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|tif)$/i;
        if (imageExtensions.test(urlLower)) {
            return true;
        }

        // Check for video extensions
        const videoExtensions = /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv)$/i;
        if (videoExtensions.test(urlLower)) {
            return true;
        }

        // Check for file extensions
        const fileExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|txt|csv|json|xml|odt|ods|odp)$/i;
        if (fileExtensions.test(urlLower)) {
            return true;
        }

        // Check for common media hosting domains
        const mediaDomains = [
            'cloudinary.com',
            'imgur.com',
            'flickr.com',
            'youtube.com',
            'youtu.be',
            'vimeo.com',
            'dailymotion.com',
            'dropbox.com',
            'drive.google.com',
            'onedrive.live.com',
        ];

        const hostname = urlObj.hostname.toLowerCase();
        if (mediaDomains.some(domain => hostname.includes(domain))) {
            return true;
        }

        return false;
    } catch {
        // Not a valid URL
        return false;
    }
}

/**
 * Extract all URLs from a text string
 */
export function extractUrls(text: string): string[] {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // URL regex pattern - matches http(s) URLs
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const matches = text.match(urlPattern);

    return matches ? [...new Set(matches)] : []; // Remove duplicates
}

/**
 * Extract media URLs from a text string
 */
export function extractMediaUrls(text: string): string[] {
    const urls = extractUrls(text);
    return urls.filter(url => isMediaUrl(url));
}

/**
 * Get media type from URL (image, video, file, or unknown)
 */
export function getMediaType(url: string): 'image' | 'video' | 'file' | 'unknown' {
    if (!isMediaUrl(url)) {
        return 'unknown';
    }

    const urlLower = url.toLowerCase();

    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|tif)$/)) {
        return 'image';
    }

    if (urlLower.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv)$/)) {
        return 'video';
    }

    return 'file';
}

/**
 * Strip media URLs and markdown media links from text
 * This is used when media is being sent as a separate attachment,
 * so we don't want the URL or markdown link appearing in the text message
 */
export function stripMediaLinksFromText(text: string, mediaUrls: string[] = []): string {
    if (!text || typeof text !== 'string') {
        return text;
    }

    let result = text;

    // Build a set of media URLs to strip (from both provided mediaUrls and extracted from text)
    const urlsToStrip = new Set<string>([
        ...mediaUrls,
        ...extractMediaUrls(text)
    ]);

    // For each media URL, strip it from the text in various formats
    for (const url of urlsToStrip) {
        // Escape special regex characters in the URL
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 1. Remove markdown links: [any text](url) or [any text](url) with emoji
        //    Pattern: [text](url) where url is the media URL
        const markdownLinkPattern = new RegExp(`\\[([^\\]]*?)\\]\\(${escapedUrl}\\)\\s*`, 'gi');
        result = result.replace(markdownLinkPattern, '');

        // 2. Remove raw URLs (standalone URLs not in markdown)
        const rawUrlPattern = new RegExp(`(?<!\\()${escapedUrl}(?!\\))\\s*`, 'gi');
        result = result.replace(rawUrlPattern, '');
    }

    // 3. Remove media placeholder patterns (when media is being sent as attachment)
    // These are common placeholder patterns that should be replaced by actual media
    if (mediaUrls.length > 0) {
        const placeholderPatterns = [
            /\(insert\s+(?:media|image|photo|video|file|document)\s*(?:file)?\s*here\)/gi,
            /\[insert\s+(?:media|image|photo|video|file|document)\s*(?:file)?\s*here\]/gi,
            /\{insert\s+(?:media|image|photo|video|file|document)\s*(?:file)?\s*here\}/gi,
            /<insert\s+(?:media|image|photo|video|file|document)\s*(?:file)?\s*here>/gi,
            /\(attach\s+(?:media|image|photo|video|file|document)\s*here\)/gi,
            /\[attach\s+(?:media|image|photo|video|file|document)\s*here\]/gi,
            /\(see\s+attached\s*(?:media|image|photo|video|file|document)?\)/gi,
            /\[see\s+attached\s*(?:media|image|photo|video|file|document)?\]/gi,
        ];

        for (const pattern of placeholderPatterns) {
            result = result.replace(pattern, '');
        }
    }

    // Clean up any leftover artifacts
    // Remove orphaned emoji that might have been next to the link
    result = result.replace(/\s+([👨‍⚖️📸📷🖼️📄📎])\s*$/gm, '');

    // Remove multiple consecutive spaces
    result = result.replace(/  +/g, ' ');

    // Remove lines that are now empty or only whitespace
    result = result.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

    // Trim final result
    return result.trim();
}



