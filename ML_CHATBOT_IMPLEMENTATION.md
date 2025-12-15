# ML-Powered Chatbot with Online Learning - Implementation Guide

## Overview

This system implements a sales-focused chatbot that improves automatically over time using online learning techniques. The chatbot learns which conversational strategies increase conversions and adapts its behavior continuously.

## Features

1. **Online Learning System**
   - Uses Contextual Bandits algorithm for strategy selection
   - Learns from user behavior (clicks, purchases, engagement)
   - Continuously optimizes conversational strategies

2. **AI Knowledge Base Management**
   - AI can automatically add, remove, and edit its own knowledge base
   - Manages rules, instructions, personality, and conversation styles
   - Analyzes conversation patterns to identify knowledge gaps

3. **User Control**
   - Toggle switch to enable/disable ML chatbot
   - Separate toggle for AI knowledge base management
   - Full control over when AI learning is active

## Database Schema

### Tables Created

1. **ml_strategies** - Conversational strategies (qualification, discount, recommendation, etc.)
2. **ml_behavior_events** - User behavior tracking (purchases, clicks, engagement)
3. **ml_strategy_performance** - Learning state (strategy performance per context)
4. **ml_knowledge_changes** - Audit log of AI knowledge base changes
5. **ml_conversation_contexts** - Context features for strategy selection

### Settings Added to bot_settings

- `enable_ml_chatbot` (BOOLEAN) - Enable/disable ML learning
- `enable_ai_knowledge_management` (BOOLEAN) - Enable/disable AI knowledge management

## Reward System

The system converts user behavior into numeric rewards:

| User Action | Reward |
|------------|--------|
| User completes purchase | +10 |
| User clicks product link | +3 |
| User continues conversation | +1 |
| User sends message | +0.5 |
| User leaves chat / closes window | -2 |
| No response | 0 |

## Strategy Types

Default strategies included:

1. **Ask Qualification Questions** - Understand customer needs
2. **Offer Discount** - Special promotions
3. **Recommend Product** - Product recommendations
4. **Provide Social Proof** - Testimonials and success stories
5. **Ask Clarifying Questions** - Get more details
6. **Provide Information** - Helpful information
7. **Create Urgency** - Scarcity and urgency

## How It Works

### 1. Strategy Selection (Contextual Bandits)

When ML chatbot is enabled:
- System builds context from conversation history (stage, user type, time of day, etc.)
- Uses epsilon-greedy algorithm (20% explore, 80% exploit)
- Selects best-performing strategy for current context
- Strategy guides LLM response generation

### 2. Learning Loop

1. User sends message
2. System selects strategy based on context
3. LLM generates response using strategy guidance
4. User behavior is tracked (purchase, click, continue, leave)
5. Reward is computed
6. Learning model updates strategy performance
7. Bot becomes more optimized over time

### 3. AI Knowledge Management

When enabled:
- After conversations, AI analyzes patterns
- Identifies knowledge gaps and improvements
- Suggests changes to knowledge base, rules, instructions
- High-confidence changes (>0.8) are auto-applied
- Lower confidence changes require manual review

## API Endpoints

### Behavior Tracking

**POST /api/ml/behavior**
```json
{
  "senderId": "user123",
  "leadId": "uuid",
  "eventType": "purchase|product_click|conversation_continue|leave|no_response|message_sent",
  "eventData": {},
  "strategyId": "uuid",
  "conversationId": "conv123",
  "messageId": "msg123"
}
```

**GET /api/ml/behavior?senderId=user123&limit=50**
- Returns behavior events for a sender

### Settings

**GET /api/settings**
- Returns bot settings including ML chatbot toggles

**POST /api/settings**
```json
{
  "enableMlChatbot": true,
  "enableAiKnowledgeManagement": true
}
```

## UI Components

### RulesEditor Component

Added two new toggle switches:

1. **Enable ML Chatbot**
   - Main toggle for online learning system
   - When enabled, chatbot uses contextual bandits for strategy selection

2. **AI Knowledge Base Management**
   - Only visible when ML chatbot is enabled
   - Allows AI to automatically manage its own knowledge base

## Integration Points

### chatService.ts

- Checks `enable_ml_chatbot` setting
- Builds context and selects strategy if enabled
- Adds strategy guidance to system prompt
- Records behavior events after response
- Processes knowledge improvements if enabled

### Workflow Engine

- Can be extended to use ML strategies in workflow nodes
- Behavior tracking can be integrated into workflow execution

## Usage

### Enabling ML Chatbot

1. Go to Settings/Rules Editor
2. Toggle "Enable ML Chatbot" ON
3. Optionally enable "AI Knowledge Base Management"
4. Save settings

### Tracking Behavior

To track user behavior (e.g., from webhook or frontend):

```typescript
await fetch('/api/ml/behavior', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    senderId: 'user123',
    eventType: 'purchase',
    eventData: { orderValue: 5000 },
    strategyId: 'strategy-uuid',
  }),
});
```

### Viewing Learning Performance

Query `ml_strategy_performance` table to see:
- Total uses per strategy
- Average reward per strategy
- Performance by context

## Migration

Run the migration file:

```sql
-- Run in Supabase SQL Editor
\i supabase/migrations/add_ml_chatbot_tables.sql
```

Or copy and paste the contents of `supabase/migrations/add_ml_chatbot_tables.sql` into Supabase SQL Editor.

## Safety Features

1. **Epsilon-Greedy Exploration**
   - 20% exploration ensures system doesn't get stuck
   - Always tries new strategies occasionally

2. **Knowledge Change Approval**
   - High-confidence changes (>0.8) auto-applied
   - Lower confidence changes require review
   - All changes logged in audit table

3. **Fallback Strategies**
   - If ML system fails, falls back to default behavior
   - No disruption to user experience

## Future Enhancements

1. **Reinforcement Learning**
   - Multi-step decision making
   - Long conversation optimization

2. **A/B Testing**
   - Compare strategy performance
   - Statistical significance testing

3. **Real-time Dashboard**
   - View learning performance
   - Strategy effectiveness metrics

4. **Custom Rewards**
   - User-defined reward functions
   - Business-specific optimization goals

## Troubleshooting

### ML Chatbot Not Learning

1. Check if `enable_ml_chatbot` is true in `bot_settings`
2. Verify behavior events are being recorded
3. Check `ml_strategy_performance` table for updates
4. Review console logs for errors

### Knowledge Changes Not Applied

1. Check `enable_ai_knowledge_management` setting
2. Review `ml_knowledge_changes` table for logged changes
3. Check `approved` column - changes may need manual approval
4. Verify confidence scores are above threshold (0.7)

## Notes

- All times are in Philippine Time (PHT, UTC+8)
- Learning happens in real-time as conversations occur
- No manual labeling or training data required
- System improves continuously with more data

