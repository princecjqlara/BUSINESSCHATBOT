# AI Edit Tracking & Highlighting Implementation

## Overview

This implementation adds comprehensive tracking, highlighting, and undo functionality for AI-generated edits to the knowledge base. Users can now see what the AI has edited, view the last 3 edits, and undo any changes.

## Features Implemented

### 1. **AI Edit Highlighting**
- Documents and rules edited by AI are visually highlighted
- Purple border/background indicates AI-edited content
- Bot icon indicator shows AI involvement

### 2. **Recent Edits Panel**
- Shows up to 3 most recent AI edits
- Displays change type (add/update/delete), entity type, reason, confidence score
- Shows timestamp and model used
- One-click undo functionality

### 3. **Undo Functionality**
- Users can undo any AI edit
- Restores previous value before AI change
- Works for documents, rules, instructions, and personality settings

### 4. **Best Model Selection for ML Tasks**
- Uses best available NVIDIA model for ML/analysis:
  - `meta/llama-3.1-405b-instruct` (if available) - Best for analysis
  - `qwen/qwen3-235b-a22b` - Excellent for reasoning
  - `meta/llama-3.1-70b-instruct` - Fallback
- Automatically tests and selects best model
- Only used for ML/analysis tasks, not regular chat

## Database Changes

### New Migration: `add_ai_edit_tracking.sql`

Added fields to track AI edits:

**documents table:**
- `edited_by_ai` (BOOLEAN) - Whether document was edited by AI
- `ai_edit_change_id` (UUID) - Reference to ml_knowledge_changes
- `last_ai_edit_at` (TIMESTAMPTZ) - When last edited by AI

**bot_rules table:**
- `edited_by_ai` (BOOLEAN) - Whether rule was edited by AI
- `ai_edit_change_id` (UUID) - Reference to ml_knowledge_changes
- `last_ai_edit_at` (TIMESTAMPTZ) - When last edited by AI

**ml_knowledge_changes table (updated):**
- `applied` (BOOLEAN) - Whether change was actually applied
- `undone` (BOOLEAN) - Whether change was undone by user
- `model_used` (TEXT) - Which AI model was used for this change

## API Endpoints

### GET /api/ml/knowledge-changes
Get recent AI edits (default: last 3)

**Query Parameters:**
- `limit` (optional) - Number of edits to return (default: 3)
- `entityType` (optional) - Filter by entity type

**Response:**
```json
{
  "changes": [
    {
      "id": "uuid",
      "change_type": "add|update|delete",
      "entity_type": "document|rule|instruction|personality",
      "entity_id": "uuid",
      "old_value": {...},
      "new_value": {...},
      "reason": "AI's reason for change",
      "confidence_score": 0.85,
      "created_at": "2025-01-27T...",
      "model_used": "meta/llama-3.1-405b-instruct",
      "undone": false
    }
  ]
}
```

### POST /api/ml/knowledge-changes
Undo an AI edit

**Request Body:**
```json
{
  "changeId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Change undone successfully"
}
```

## UI Components

### AIEditsPanel Component
- Displays recent AI edits in a compact panel
- Shows change type, entity type, reason, confidence
- Undo button for each edit
- Auto-refreshes after undo

### KnowledgeBase Component Updates
- Highlights AI-edited documents with purple border
- Shows Bot icon indicator for AI edits
- Visual distinction from user-created content

### RulesEditor Component Updates
- Highlights AI-edited rules with purple border
- Shows Bot icon indicator
- Includes AIEditsPanel when AI knowledge management is enabled
- Auto-refreshes after undo

## Code Changes

### mlKnowledgeManagement.ts
- Added `getBestMLModel()` function to select best available model
- Updated `analyzeKnowledgeGaps()` to use best model
- Updated `applyDocumentChange()` and `applyRuleChange()` to:
  - Mark items as AI-edited
  - Store old values for undo capability
  - Track model used
- All changes now properly tracked in `ml_knowledge_changes` table

### API Routes
- Updated `/api/knowledge` to include AI edit tracking fields
- Updated `/api/rules` to include AI edit tracking fields
- New `/api/ml/knowledge-changes` endpoint for viewing and undoing edits

## Usage

### Viewing AI Edits

1. Go to Settings/Rules Editor
2. If AI Knowledge Management is enabled, you'll see "Recent AI Edits" panel
3. View last 3 edits with details

### Undoing AI Edits

1. In the AI Edits Panel, click the undo button (↶) next to any edit
2. The change will be reverted immediately
3. Panel refreshes to show updated list

### Identifying AI Edits

- **Documents**: Purple left border and background tint
- **Rules**: Purple left border and background tint
- **Icon**: Bot icon (🤖) next to AI-edited items

## Migration Steps

1. Run the migration:
   ```sql
   -- Run in Supabase SQL Editor
   \i supabase/migrations/add_ai_edit_tracking.sql
   ```

2. Existing AI edits won't be highlighted until new edits are made
3. All new AI edits will be automatically tracked and highlighted

## Model Selection Logic

The system tries models in order:
1. `meta/llama-3.1-405b-instruct` - Largest, best for analysis
2. `qwen/qwen3-235b-a22b` - Excellent reasoning capabilities
3. `meta/llama-3.1-70b-instruct` - Reliable fallback

The first available model is used. This ensures the best possible analysis quality for ML tasks while maintaining compatibility.

## Notes

- AI edits are only highlighted when `enable_ai_knowledge_management` is enabled
- Undo functionality restores the exact previous state
- Deleted items cannot be fully restored (marked as undone in audit log)
- All changes are logged in `ml_knowledge_changes` for audit trail
- Model selection happens automatically - no configuration needed

