# Fix NVIDIA API Key for Document Saving

## Problem
Documents are not saving because the embedding API is returning a 401 Unauthorized error. This means the `NVIDIA_API_KEY` environment variable is missing or incorrect.

## Solution

### Step 1: Get Your NVIDIA API Key

1. Go to [NVIDIA API Keys](https://build.nvidia.com/)
2. Sign in or create an account
3. Navigate to your API keys section
4. Create a new API key or copy an existing one

### Step 2: Add to .env.local

Open your `.env.local` file in the project root and add:

```env
NVIDIA_API_KEY=your_nvidia_api_key_here
```

Replace `your_nvidia_api_key_here` with your actual NVIDIA API key.

### Step 3: Restart the Dev Server

After adding the API key, you must restart your development server:

1. Stop the current server (Ctrl+C in the terminal)
2. Run `npm run dev` again

### Step 4: Test Document Saving

1. Try saving a new document
2. The document should now save successfully

## Verification

The embedding API is used to:
- Generate vector embeddings for document chunks
- Enable semantic search in the knowledge base
- Power the RAG (Retrieval-Augmented Generation) system

Without a valid API key, documents cannot be saved because embeddings cannot be generated.

## Troubleshooting

If you still get errors after adding the key:

1. **Check the key is correct**: Make sure there are no extra spaces or quotes around the key
2. **Check .env.local location**: The file must be in the project root directory
3. **Restart server**: Environment variables are only loaded when the server starts
4. **Check API key permissions**: Ensure your NVIDIA API key has access to the embedding models




