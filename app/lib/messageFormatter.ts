/**
 * Message Formatter Utility
 * Formats messages with proper spacing, line breaks, and readability
 */

/**
 * Format a message with proper spacing and line breaks
 * - Normalizes multiple spaces to single spaces
 * - Preserves intentional line breaks
 * - Adds spacing after sentences
 * - Trims excess whitespace
 * - Removes markdown formatting (bold, italic, etc.)
 */
export function formatMessage(message: string): string {
    if (!message || message.trim().length === 0) {
        return message;
    }

    let formatted = message;

    // Remove markdown formatting
    // Remove bold text markers (**text** or __text__)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold**
    formatted = formatted.replace(/__([^_]+)__/g, '$1'); // __bold__
    formatted = formatted.replace(/\*([^*]+)\*/g, '$1'); // *italic* (single asterisk)
    formatted = formatted.replace(/_([^_]+)_/g, '$1'); // _italic_ (single underscore)
    
    // Remove any remaining standalone asterisks or underscores that might be formatting artifacts
    formatted = formatted.replace(/\*\*/g, ''); // Remove any remaining **
    formatted = formatted.replace(/__/g, ''); // Remove any remaining __

    // Replace em dashes (—) and en dashes (–) with regular hyphens or spaces
    // This ensures the bot never uses em dashes in messages
    formatted = formatted.replace(/—/g, ' - '); // Em dash to hyphen with spaces
    formatted = formatted.replace(/–/g, '-'); // En dash to hyphen

    // First, normalize line breaks (handle different line break styles)
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Preserve intentional double line breaks (paragraphs)
    // Replace triple+ line breaks with double
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Normalize multiple spaces to single spaces (but preserve intentional spacing)
    // Don't collapse spaces at the start of lines (indentation)
    formatted = formatted.replace(/[ \t]+/g, ' ');

    // Add a space after sentence endings if not already present
    // This helps with readability when sentences run together
    formatted = formatted.replace(/([.!?])([A-Za-z])/g, '$1 $2');

    // Clean up spacing around line breaks
    formatted = formatted.replace(/ +\n/g, '\n'); // Remove trailing spaces before line breaks
    formatted = formatted.replace(/\n +/g, '\n'); // Remove leading spaces after line breaks

    // Trim the entire message
    formatted = formatted.trim();

    return formatted;
}

/**
 * Format multiple messages
 */
export function formatMessages(messages: string[]): string[] {
    return messages.map(msg => formatMessage(msg));
}

