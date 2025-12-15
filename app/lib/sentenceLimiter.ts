/**
 * Sentence Limiter Utility
 * Limits the number of sentences in AI responses
 */

/**
 * Count sentences in a text
 * Sentences end with . ! ? followed by space or end of string
 */
export function countSentences(text: string): number {
    if (!text || text.trim().length === 0) return 0;

    // Match sentence endings: . ! ? followed by space, newline, or end of string
    // Exclude common abbreviations and decimals
    const sentenceRegex = /[.!?]+(?:\s+|$)/g;
    const matches = text.match(sentenceRegex);

    if (!matches) {
        // If no sentence endings found, count as 1 sentence if there's content
        return text.trim().length > 0 ? 1 : 0;
    }

    return matches.length;
}

/**
 * Split text into multiple messages based on sentence limit
 * @param text - The text to split
 * @param maxSentencesPerMessage - Maximum number of sentences per message (0 or null = no limit, return as single message)
 * @returns Array of message strings
 */
export function splitIntoMessages(text: string, maxSentencesPerMessage: number | null | undefined): string[] {
    // If no limit or invalid limit, return as single message
    if (!maxSentencesPerMessage || maxSentencesPerMessage <= 0) {
        return [text];
    }

    if (!text || text.trim().length === 0) {
        return [text];
    }

    // Find all sentence endings - handle punctuation followed by:
    // - Space, newline, em dash, or end of string
    // - Emoji characters (immediately after punctuation like "?😏", "!🎁", "?🤑", "!👇")
    // Note: Emojis are surrogate pairs (2 code units), so we need to check properly
    const sentenceEndPattern = /[.!?]+/g;
    const endings: Array<{ index: number; endPos: number }> = [];
    let match;

    // Helper to check if a character (or surrogate pair) is an emoji
    function isEmojiAt(text: string, pos: number): boolean {
        if (pos >= text.length) return false;
        const code = text.charCodeAt(pos);
        // Check if it's a high surrogate (start of emoji)
        if (code >= 0xD800 && code <= 0xDBFF) {
            // It's a surrogate pair, check the low surrogate
            const lowSurrogate = text.charCodeAt(pos + 1);
            if (lowSurrogate >= 0xDC00 && lowSurrogate <= 0xDFFF) {
                // Calculate the full Unicode code point
                const fullCode = 0x10000 + ((code - 0xD800) << 10) + (lowSurrogate - 0xDC00);
                // Check emoji ranges
                return (
                    (fullCode >= 0x1F300 && fullCode <= 0x1F9FF) ||
                    (fullCode >= 0x1F600 && fullCode <= 0x1F64F) ||
                    (fullCode >= 0x1F900 && fullCode <= 0x1F9FF) ||
                    (fullCode >= 0x1FA00 && fullCode <= 0x1FAFF)
                );
            }
        }
        // Check single-character emojis
        return (
            (code >= 0x2600 && code <= 0x26FF) || // Miscellaneous Symbols
            (code >= 0x2700 && code <= 0x27BF)    // Dingbats
        );
    }

    // Common abbreviations that should NOT be treated as sentence endings
    const abbreviations = [
        'e.g', 'i.e', 'etc', 'vs', 'approx', 'avg', 'dept', 'est', 'govt', 'inc', 'ltd', 'max', 'min', 'misc',
        'no', 'pcs', 'qty', 'ref', 'sq', 'vol', 'yr', 'yrs', 'mo', 'mos', 'wk', 'wks', 'hr', 'hrs', 'min', 'mins', 'sec', 'secs',
        'dr', 'mr', 'mrs', 'ms', 'jr', 'sr', 'st', 'ave', 'blvd', 'rd', 'ft', 'lb', 'lbs', 'oz', 'kg', 'km', 'cm', 'mm',
        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
        'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
        'p.m', 'a.m', 'p.s', 'n.b', 'r.s.v.p', 'asap', 'fyi',
        'php', 'usd', 'gbp', 'eur', 'k', 'm', 'b' // Currency and number abbreviations
    ];

    // Helper function to check if position is part of an abbreviation
    function isAbbreviation(text: string, periodPos: number): boolean {
        // Check the character(s) before the period
        const beforePeriod = text.substring(Math.max(0, periodPos - 10), periodPos).toLowerCase();

        // Check for patterns like "e.g." (letter + period pattern)
        // Match: single letter followed by period at position
        if (/[a-z]\.$/.test(beforePeriod + '.')) {
            // Check if this looks like an abbreviation pattern (e.g., i.e., a.m., p.m.)
            const match = beforePeriod.match(/\b([a-z]\.)+[a-z]$/i);
            if (match) return true;
        }

        // Check for known abbreviations
        for (const abbr of abbreviations) {
            const abbrLower = abbr.toLowerCase();
            // Check if text ends with this abbreviation
            if (beforePeriod.endsWith(abbrLower)) {
                // Make sure it's a word boundary before the abbreviation
                const charBefore = beforePeriod.charAt(beforePeriod.length - abbrLower.length - 1);
                if (!charBefore || /[\s(,;:]/.test(charBefore)) {
                    return true;
                }
            }
        }

        // Check for decimal numbers (e.g., "5.5", "100.00")
        if (/\d\.\d/.test(text.substring(periodPos - 1, periodPos + 2))) {
            return true;
        }

        return false;
    }

    while ((match = sentenceEndPattern.exec(text)) !== null) {
        const punctEnd = match.index + match[0].length;

        // Skip if this is part of an abbreviation (only check for periods, not ! or ?)
        if (match[0].includes('.') && isAbbreviation(text, match.index + match[0].indexOf('.'))) {
            continue;
        }

        const charAfter = text.charAt(punctEnd);
        const charAfter2 = text.charAt(punctEnd + 1);
        const charAfter3 = text.charAt(punctEnd + 2);

        // Check if this is a sentence ending:
        // 1. End of string
        // 2. Followed by whitespace
        // 3. Followed by em dash/hyphen
        // 4. Followed by emoji (immediately after punctuation, could be 1 or 2 chars)
        // 5. Followed by closing parenthesis then space/emoji (e.g., "freebies!) 🎉")
        // 6. Followed by a number then period (numbered lists like "!2.", "?4.")
        const isEndOfString = punctEnd >= text.length;
        const isFollowedBySpace = /\s/.test(charAfter);
        const isFollowedByDash = /[—–-]/.test(charAfter);
        const isFollowedByEmoji = isEmojiAt(text, punctEnd);
        const charAfterPunct = text.substring(punctEnd, punctEnd + 3);
        const isFollowedByClosingParenThenSpace = /^\)\s/.test(charAfterPunct);
        const isFollowedByClosingParenThenEmoji = /^\)/.test(charAfterPunct) && isEmojiAt(text, punctEnd + 1);
        // Check for numbered lists: punctuation followed by digit then period (e.g., "!2.", "?4.")
        const isFollowedByNumberedList = /\d/.test(charAfter) && text.charAt(punctEnd + 1) === '.';

        if (isEndOfString || isFollowedBySpace || isFollowedByDash || isFollowedByEmoji || isFollowedByClosingParenThenSpace || isFollowedByClosingParenThenEmoji || isFollowedByNumberedList) {
            // If followed by emoji, include the emoji in the ending position
            let endPos = punctEnd;
            if (isFollowedByEmoji) {
                // Emojis are 2 characters (surrogate pair), check if there's a space after
                const emojiLength = (text.charCodeAt(punctEnd) >= 0xD800 && text.charCodeAt(punctEnd) <= 0xDBFF) ? 2 : 1;
                const charAfterEmoji = text.charAt(punctEnd + emojiLength);
                if (charAfterEmoji && /\s/.test(charAfterEmoji)) {
                    endPos = punctEnd + emojiLength + 1; // Include emoji and space
                } else {
                    endPos = punctEnd + emojiLength; // Just include emoji
                }
            } else if (isFollowedByClosingParenThenEmoji) {
                // Handle "!) 🎉" pattern - include ) and emoji
                const emojiLength = (text.charCodeAt(punctEnd + 1) >= 0xD800 && text.charCodeAt(punctEnd + 1) <= 0xDBFF) ? 2 : 1;
                endPos = punctEnd + 1 + emojiLength; // Include ) and emoji
            } else if (isFollowedByClosingParenThenSpace) {
                endPos = punctEnd + 2; // Include ) and space
            } else if (isFollowedByNumberedList) {
                // Handle numbered lists like "!2." or "?4." - end at the punctuation, not including the number
                // The number and period will be part of the next message
                endPos = punctEnd; // End at punctuation, number starts next message
            } else if (isFollowedBySpace) {
                endPos = punctEnd + 1; // Include the space
            }

            endings.push({
                index: match.index,
                endPos: endPos
            });
        }
    }

    // If no sentence endings found, return as single message
    if (endings.length === 0) {
        return [text];
    }

    // If we have fewer or equal sentences than the limit, return as single message
    if (endings.length <= maxSentencesPerMessage) {
        return [text];
    }

    // Split into multiple messages
    const messages: string[] = [];
    let lastIndex = 0;

    for (let i = 0; i < endings.length; i += maxSentencesPerMessage) {
        const endIndex = Math.min(i + maxSentencesPerMessage - 1, endings.length - 1);
        const cutPoint = endings[endIndex].endPos;
        let message = text.substring(lastIndex, cutPoint).trim();

        // Clean up: merge numbered list items (like "2.", "3.") with following text
        // Check if message ends with just a number and period (e.g., "2.", "3.")
        const numberedListPattern = /^(\d+)\.\s*$/;
        if (numberedListPattern.test(message) && lastIndex + message.length < text.length) {
            // This is just a number and period, merge with next sentence
            // Find the next sentence ending after this
            if (endIndex + 1 < endings.length) {
                const nextCutPoint = endings[endIndex + 1].endPos;
                message = text.substring(lastIndex, nextCutPoint).trim();
                lastIndex = nextCutPoint;
                i++; // Skip the next ending since we merged it
            } else {
                // Last ending, include remaining text
                message = text.substring(lastIndex).trim();
                lastIndex = text.length;
            }
        } else {
            lastIndex = cutPoint;
        }

        if (message.length > 0) {
            // Remove numbered list prefixes comprehensively:
            // 1. From the start of the message
            // 2. From the start of each line (multiline)
            // 3. Standalone numbering lines (lines that are just "2." or "3.")
            message = message
                .replace(/^\d+\.\s*/gm, '') // Remove from start of string and start of each line
                .replace(/^\s*\d+\.\s*$/gm, '') // Remove standalone numbering lines
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !/^\d+\.\s*$/.test(line)) // Filter out standalone numbering lines
                .join('\n')
                .trim();

            if (message.length > 0) {
                messages.push(message);
            }
        }
    }

    // Add any remaining text as the last message
    if (lastIndex < text.length) {
        let remaining = text.substring(lastIndex).trim();

        // Remove numbered list prefixes from remaining text too
        // Remove from start, from each line, and standalone numbering lines
        remaining = remaining
            .replace(/^\d+\.\s*/gm, '') // Remove from start of string and start of each line
            .replace(/^\s*\d+\.\s*$/gm, '') // Remove standalone numbering lines
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !/^\d+\.\s*$/.test(line)) // Filter out standalone numbering lines
            .join('\n')
            .trim();

        if (remaining.length > 0) {
            messages.push(remaining);
        }
    }

    // Final cleanup pass: remove numbered list prefixes from ALL messages
    // This ensures no numbers slip through, even if they were added during merging
    // Remove from start, from each line, and standalone numbering lines
    const cleanedMessages = messages
        .map(msg => {
            return msg
                .replace(/^\d+\.\s*/gm, '') // Remove from start of string and start of each line
                .replace(/^\s*\d+\.\s*$/gm, '') // Remove standalone numbering lines
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !/^\d+\.\s*$/.test(line)) // Filter out standalone numbering lines
                .join('\n')
                .trim();
        })
        .filter(msg => msg.length > 0);

    return cleanedMessages.length > 0 ? cleanedMessages : [text];
}

/**
 * Limit text to a maximum number of sentences (legacy function for backward compatibility)
 * @param text - The text to limit
 * @param maxSentences - Maximum number of sentences (0 or null = no limit)
 * @returns Limited text
 */
export function limitSentences(text: string, maxSentences: number | null | undefined): string {
    // If no limit or invalid limit, return original text
    if (!maxSentences || maxSentences <= 0) {
        return text;
    }

    if (!text || text.trim().length === 0) {
        return text;
    }

    // Improved sentence splitting - find all sentence endings first
    // Match sentence endings: . ! ? followed by space, newline, em dash, emoji, or end of string
    // Updated to handle emojis immediately after punctuation (e.g., "?😏", "!🎁")
    const sentenceEndPattern = /[.!?]+(?:\s+|$|—|–|-|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/gu;

    // Find all sentence ending positions
    const endings: number[] = [];
    let match;
    while ((match = sentenceEndPattern.exec(text)) !== null) {
        endings.push(match.index + match[0].length);
    }

    // If no sentence endings found, try fallback method
    if (endings.length === 0) {
        // Fallback: split by common sentence patterns
        const fallbackSplit = text.split(/([.!?]+\s+)/);
        const fallbackSentences: string[] = [];
        let currentSentence = '';

        for (let i = 0; i < fallbackSplit.length; i++) {
            currentSentence += fallbackSplit[i];
            if (fallbackSplit[i].match(/[.!?]+\s+/)) {
                fallbackSentences.push(currentSentence.trim());
                currentSentence = '';
            }
        }

        // Add any remaining text as last sentence
        if (currentSentence.trim().length > 0) {
            fallbackSentences.push(currentSentence.trim());
        }

        if (fallbackSentences.length > 0) {
            // If we have fewer or equal sentences than the limit, return original
            if (fallbackSentences.length <= maxSentences) {
                return text;
            }
            // Take only the first maxSentences sentences
            return fallbackSentences.slice(0, maxSentences).join(' ').trim();
        }

        // If still no sentences found, return original (might be a single sentence without punctuation)
        return text;
    }

    // If we have fewer or equal sentences than the limit, return original
    if (endings.length <= maxSentences) {
        return text;
    }

    // Take text up to the maxSentences-th ending
    const cutPoint = endings[maxSentences - 1];
    let limitedText = text.substring(0, cutPoint).trim();

    // Ensure we end with proper punctuation
    if (!/[.!?]$/.test(limitedText)) {
        // Find the punctuation that was at the cut point
        const charAtCut = text.charAt(cutPoint - 1);
        if (/[.!?]/.test(charAtCut)) {
            limitedText = text.substring(0, cutPoint).trim();
        }
    }

    return limitedText;
}

