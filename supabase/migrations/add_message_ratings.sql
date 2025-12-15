## Error Type
Console Error

## Error Message
[Regenerate] No user message found before bot message: 1


    at handleRegenerate (app/components/ChatPreview.tsx:190:21)
    at onClick (app/components/ChatPreview.tsx:444:49)
    at button (<anonymous>:null:null)
    at eval (app/components/ChatPreview.tsx:423:61)
    at Array.map (<anonymous>:null:null)
    at ChatPreview (app/components/ChatPreview.tsx:372:21)
    at Home (app/(main)/page.tsx:153:93)

## Code Frame
  188 |
  189 |         if (!userMessage) {
> 190 |             console.error('[Regenerate] No user message found before bot message:', messageIndex);
      |                     ^
  191 |             return;
  192 |         }
  193 |

Next.js version: 16.0.7 (Turbopack)


