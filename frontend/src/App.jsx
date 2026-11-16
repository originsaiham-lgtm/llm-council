import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  // Load conversations on mount
  useEffect(() => {
    api
      .listConversations()
      .then(setConversations)
      .catch((error) => console.error('Failed to load conversations:', error));
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (!currentConversationId) return;
    api
      .getConversation(currentConversationId)
      .then(setCurrentConversation)
      .catch((error) => console.error('Failed to load conversation:', error));
  }, [currentConversationId]);

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Create a partial assistant message that will be updated progressively
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      // Update the in-progress assistant message without mutating state
      const updateLastMessage = (update) => {
        setCurrentConversation((prev) => {
          const messages = [...prev.messages];
          const lastMsg = messages[messages.length - 1];
          messages[messages.length - 1] = update(lastMsg);
          return { ...prev, messages };
        });
      };
      const setStageLoading = (msg, stage, value) => ({
        ...msg,
        loading: { ...msg.loading, [stage]: value },
      });

      // Send message with streaming
      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            updateLastMessage((msg) => setStageLoading(msg, 'stage1', true));
            break;

          case 'stage1_complete':
            updateLastMessage((msg) => ({
              ...setStageLoading(msg, 'stage1', false),
              stage1: event.data,
            }));
            break;

          case 'stage2_start':
            updateLastMessage((msg) => setStageLoading(msg, 'stage2', true));
            break;

          case 'stage2_complete':
            updateLastMessage((msg) => ({
              ...setStageLoading(msg, 'stage2', false),
              stage2: event.data,
              metadata: event.metadata,
            }));
            break;

          case 'stage3_start':
            updateLastMessage((msg) => setStageLoading(msg, 'stage3', true));
            break;

          case 'stage3_complete':
            updateLastMessage((msg) => ({
              ...setStageLoading(msg, 'stage3', false),
              stage3: event.data,
            }));
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            updateLastMessage((msg) => ({
              ...msg,
              loading: { stage1: false, stage2: false, stage3: false },
              stage3: msg.stage3 || { model: 'error', response: `Error: ${event.message}` },
            }));
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
      // Make sure the UI never stays stuck if the stream closes early
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default App;
