'use client';

import { useState, useCallback } from "react";
import KnowledgeBase from "../components/KnowledgeBase";
import ChatPreview from "../components/ChatPreview";
import Header from "../components/Header";
import DocumentEditor from "../components/DocumentEditor";
import RulesEditor from "../components/RulesEditor";

import FAQEditor from "../components/FAQEditor";
import PaymentMethodEditor from "../components/PaymentMethodEditor";
import { FileText, Bot, CreditCard } from "lucide-react";

interface Category {
  id: string;
  name: string;
  type: 'general' | 'qa' | 'payment_method';
  color: string;
}

export default function Home() {
  const [selectedDocText, setSelectedDocText] = useState('');
  const [selectedDocName, setSelectedDocName] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null); // metadata.documentId
  const [selectedDocMediaUrls, setSelectedDocMediaUrls] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'rules'>('documents');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewDocumentContent, setPreviewDocumentContent] = useState<string | undefined>(undefined);
  const [highlightedDocumentIds, setHighlightedDocumentIds] = useState<string[]>([]);

  const handleSaveDocument = useCallback(async (text: string, name: string, categoryId?: string, mediaUrls?: string[]) => {
    try {
      if (selectedDocId) {
        // Update existing document
        const response = await fetch('/api/knowledge', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedDocId, text, name, categoryId, mediaUrls, documentId: selectedDocumentId || undefined }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update document');
        }
      } else {
        // Create new document
        const response = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, name, categoryId, mediaUrls }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to create document: ${response.status} ${response.statusText}`);
        }
      }

      // Refresh the knowledge base instead of reloading the page
      setRefreshKey(prev => prev + 1);
      setIsEditingDoc(false);
      setSelectedDocText('');
      setSelectedDocName('');
      setSelectedDocId(null);
      setSelectedDocumentId(null);
      setSelectedDocMediaUrls([]);
    } catch (error) {
      console.error('Failed to save document:', error);
      alert(`Failed to save document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [selectedDocId, selectedDocumentId]);

  const handleCreateDocument = useCallback(() => {
    setSelectedDocText('');
    setSelectedDocName('');
    setSelectedDocId(null);
    setSelectedDocumentId(null);
    setSelectedDocMediaUrls([]);
    setSelectedCategory(null);
    setActiveTab('documents');
    setIsEditingDoc(true);
  }, []);

  const handleDocumentSelect = useCallback((text: string, name?: string, id?: string, mediaUrls?: string[], documentId?: string) => {
    setSelectedDocText(text);
    setSelectedDocName(name || '');
    setSelectedDocId(id || null);
    setSelectedDocumentId(documentId || null);
    setSelectedDocMediaUrls(mediaUrls || []);
    setIsEditingDoc(true);
  }, []);

  const handleCategorySelect = useCallback((category: Category | null) => {
    setSelectedCategory(category);
    setIsEditingDoc(false);
  }, []);

  const handleDocumentsEdited = useCallback((documentIds: string[]) => {
    // Highlight the edited documents temporarily
    setHighlightedDocumentIds(documentIds);
    // Refresh knowledge base to show updated documents
    setRefreshKey(prev => prev + 1);
    // Clear highlight after 5 seconds
    setTimeout(() => {
      setHighlightedDocumentIds([]);
    }, 5000);
  }, []);

  const handleDocumentSave = useCallback(async (text: string, name: string, mediaUrls?: string[]) => {
    await handleSaveDocument(text, name, selectedCategory?.id, mediaUrls);
  }, [handleSaveDocument, selectedCategory?.id]);

  // Determine which editor to show based on selected category
  const renderEditor = () => {
    if (activeTab === 'rules') {
      return <RulesEditor />;
    }

    // If user explicitly selected a document, show document editor
    if (isEditingDoc) {
      return (
        <DocumentEditor
          initialText={selectedDocText}
          initialName={selectedDocName}
          initialMediaUrls={selectedDocMediaUrls}
          onSave={handleDocumentSave}
          onPreviewContentChange={setPreviewDocumentContent}
        />
      );
    }

    // If a Q&A category is selected (and not editing a doc), show FAQ editor
    if (selectedCategory?.type === 'qa') {
      return (
        <FAQEditor
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
        />
      );
    }

    // If a Payment Method category is selected, show Payment Method editor
    if (selectedCategory?.type === 'payment_method') {
      return (
        <PaymentMethodEditor
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
        />
      );
    }

    // Default: show document editor (e.g. for general categories or no category)
    return (
      <DocumentEditor
        initialText={selectedDocText}
        initialName={selectedDocName}
        initialMediaUrls={selectedDocMediaUrls}
        onSave={handleDocumentSave}
        onPreviewContentChange={setPreviewDocumentContent}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Knowledge Base Sidebar */}
        <KnowledgeBase
          key={refreshKey}
          onSelect={handleDocumentSelect}
          onCategorySelect={handleCategorySelect}
          onCreateDocument={handleCreateDocument}
          highlightedDocumentIds={highlightedDocumentIds}
        />

        {/* Main Content Area with Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'documents'
                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {selectedCategory?.type === 'payment_method' ? (
                <CreditCard size={16} />
              ) : (
                <FileText size={16} />
              )}
              {selectedCategory?.type === 'qa' ? 'FAQs' : selectedCategory?.type === 'payment_method' ? 'Payment Methods' : 'Documents'}
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rules'
                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Bot size={16} />
              Bot Settings
            </button>
            {selectedCategory && (
              <span className="ml-2 text-sm text-gray-500">
                Category: <span className="font-medium text-gray-700">{selectedCategory.name}</span>
              </span>
            )}
            {!selectedCategory && (
              <span className="ml-2 text-sm text-gray-400">All Documents</span>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {renderEditor()}
          </div>
        </div>

        <ChatPreview
          previewDocumentContent={previewDocumentContent}
          onDocumentsEdited={handleDocumentsEdited}
        />
      </div>
    </div>
  );
}
