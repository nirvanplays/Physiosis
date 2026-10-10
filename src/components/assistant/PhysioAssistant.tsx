/**
 * PhysioAssistant.tsx
 * Floating physiotherapy rehabilitation assistant helpbox UI.
 *
 * Features:
 * - Non-intrusive floating button ("Physio Help") and expandable glassmorphic chat modal
 * - Multi-turn conversational history scoped to the current active session
 * - Real-time Ollama connectivity status badge & offline warning
 * - Suggested quick questions for physiotherapy, ROM, limitations, and exercise progress
 * - Domain-gated response indicators ("Restricted question")
 * - Safe markdown-like structured text rendering (headings, paragraphs, bullet points)
 * - Non-diagnostic advisory clinical disclaimer footer
 * - Microphone placeholder button for future voice integration
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Mic,
  MicOff,
  Globe,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Minimize2,
  RefreshCw,
  ChevronRight,
  Volume2,
  VolumeX,
  Square,
  Loader2,
  BookOpen,
} from 'lucide-react';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import type { LiveSessionState, PhysiosisSession } from '../../engine/session/SessionTypes';
import type { ShoulderFlexionAnalysis } from '../../engine/biomechanics/biomechanicsTypes';
import type {
  AssistantLanguage,
  OllamaConnectionStatus,
  PhysioAssistantContext,
  KnowledgeCitation,
} from '../../types/assistant';
import {
  SUPPORTED_ASSISTANT_LANGUAGES,
  DEFAULT_ASSISTANT_LANGUAGE,
} from '../../types/assistant';
import { physioAssistantService } from '../../services/physioAssistantService';
import { buildPhysioAssistantContext } from '../../engine/assistant/contextResolver';
import { OUT_OF_DOMAIN_REFUSAL_MESSAGE } from '../../engine/assistant/domainGuard';
import { RED_FLAG_SAFETY_RESPONSE } from '../../engine/assistant/safetyGuard';
import {
  speechInputService,
  type SpeechInputState,
} from '../../services/voice/SpeechInputService';
import { speechOutputService } from '../../services/voice/SpeechOutputService';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isRedFlag?: boolean;
  isOutOfDomain?: boolean;
  isError?: boolean;
  modelUsed?: string;
  language?: AssistantLanguage;
  sources?: KnowledgeCitation[];
  grounded?: boolean;
}

interface PhysioAssistantProps {
  activeExercise?: ExerciseDefinition;
  sessionState?: LiveSessionState;
  shoulderFlexion?: ShoulderFlexionAnalysis;
  lastSavedSession?: PhysiosisSession | null;
  savedSessions?: PhysiosisSession[];
  patientId?: string;
}

const QUICK_PROMPTS = [
  'What does my ROM mean?',
  'Why was this rep limited?',
  'How can I improve my movement?',
  'What happened in my last session?',
];

const getLocalizedWelcome = (_lang?: AssistantLanguage) => {
  return 'Hello! I am your Physiosis Rehabilitation Assistant. Ask me anything about your exercise technique, range of motion, movement form, or session results.';
};

export const PhysioAssistant: React.FC<PhysioAssistantProps> = ({
  activeExercise,
  sessionState,
  shoulderFlexion,
  lastSavedSession,
  savedSessions = [],
  patientId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaConnectionStatus | null>(null);

  // Single Authoritative Assistant Language State (Patch 7)
  const [assistantLanguage, setAssistantLanguage] = useState<AssistantLanguage>(
    DEFAULT_ASSISTANT_LANGUAGE
  );

  // Voice Input States
  const [speechState, setSpeechState] = useState<SpeechInputState>('idle');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Voice Output / TTS States
  const [autoSpeak, setAutoSpeak] = useState<boolean>(false);
  const [currentlySpeakingMsgId, setCurrentlySpeakingMsgId] = useState<string | null>(null);
  const [ttsWarning, setTtsWarning] = useState<string | null>(null);

  // Reference for Auto-Scroll in Messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'initial-1',
      sender: 'assistant',
      text: getLocalizedWelcome(DEFAULT_ASSISTANT_LANGUAGE),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'system-initial',
      language: DEFAULT_ASSISTANT_LANGUAGE,
    },
  ]);

  // Check Ollama Connectivity on mount and when panel opens
  useEffect(() => {
    checkOllama();
  }, [isOpen]);

  const checkOllama = async () => {
    try {
      const status = await physioAssistantService.checkOllamaHealth();
      setOllamaStatus(status);
    } catch {
      setOllamaStatus({
        status: 'OFFLINE',
        baseUrl: 'http://127.0.0.1:11434',
        model: 'none',
        availableModels: [],
        message: 'Local Physio Assistant unavailable. Please check Ollama.',
      });
    }
  };

  const checkHealth = checkOllama;

  // Scroll to bottom whenever messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Clean up speech recognition on unmount or panel close
  useEffect(() => {
    if (!isOpen) {
      speechInputService.stopListening();
    }
  }, [isOpen]);

  // Build Context Snapshot from Props
  const getContextSnapshot = (): PhysioAssistantContext => {
    return buildPhysioAssistantContext({
      activeExercise,
      sessionState,
      shoulderFlexion,
      lastSavedSession,
      savedSessions,
      patientId,
    });
  };

  // Handle Sending a Message
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    // Stop any existing voice output when sending a new query
    speechOutputService.stop();
    setCurrentlySpeakingMsgId(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      language: assistantLanguage,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const sessionContext = getContextSnapshot();
      const response = await physioAssistantService.sendPhysioChatMessage({
        message: query,
        sessionContext,
        language: assistantLanguage,
      });

      const isRedFlag =
        response.isRedFlag ||
        response.reply === RED_FLAG_SAFETY_RESPONSE ||
        response.model === 'safety-guard';

      const isRefusal =
        !isRedFlag &&
        (response.reply === OUT_OF_DOMAIN_REFUSAL_MESSAGE || response.model === 'domain-guard');

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRedFlag,
        isOutOfDomain: isRefusal,
        isError: !response.success && !isRefusal && !isRedFlag,
        modelUsed: response.model,
        language: assistantLanguage,
        sources: response.sources,
        grounded: response.grounded,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If Auto Speak is ON and response is valid, speak it automatically
      if (autoSpeak && (response.success ?? true)) {
        handleSpeakMessage(assistantMsg.id, response.reply, assistantLanguage);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          sender: 'assistant',
          text: 'Local assistant unavailable. Please check Ollama.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
          language: assistantLanguage,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Subscribe to TTS State Changes
  useEffect(() => {
    const unsubscribe = speechOutputService.onStateChange((state) => {
      setCurrentlySpeakingMsgId(state.currentMessageId);
    });
    return () => unsubscribe();
  }, []);

  // Toggle Text-to-Speech Output for a specific message (Language-Aware)
  const handleSpeakMessage = async (
    msgId: string,
    text: string,
    msgLanguage?: AssistantLanguage
  ) => {
    if (currentlySpeakingMsgId === msgId) {
      speechOutputService.stop();
      setCurrentlySpeakingMsgId(null);
      return;
    }

    setTtsWarning(null);
    const targetLanguage = msgLanguage || assistantLanguage;
    const result = await speechOutputService.speak(text, targetLanguage, msgId);

    if (!result.success) {
      setCurrentlySpeakingMsgId(null);
      setTtsWarning(
        result.message ||
          'Voice output is unavailable for this language on this device. Text response is available.'
      );
    }
  };

  // Toggle Speech Recognition Voice Input
  const handleToggleVoiceInput = () => {
    if (speechState === 'listening' || speechState === 'transcribing') {
      speechInputService.stopListening();
      return;
    }

    setSpeechError(null);
    setAudioLevel(0);

    if (!speechInputService.isSupported()) {
      setSpeechError('Local voice input is unavailable on this device. Please use text input.');
      return;
    }

    speechInputService.startListening({
      language: assistantLanguage.locale,
      maxDurationSeconds: 15,
      callbacks: {
        onTranscript: (transcript, isFinal) => {
          setInputMessage(transcript);
          if (isFinal && transcript.trim()) {
            handleSendMessage(transcript.trim());
          }
        },
        onStateChange: (state) => {
          setSpeechState(state);
          if (state !== 'listening') {
            setAudioLevel(0);
          }
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
        onError: (errorMessage) => {
          setSpeechError(errorMessage);
          setAudioLevel(0);
        },
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /**
   * Safe text & markdown renderer for assistant responses.
   * Formats section headers, bullet lists, and paragraphs cleanly.
   */
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');

    return (
      <div className="physio-chat__formatted-body">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} style={{ height: '6px' }} />;
          }

          // Format bullet points
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
            return (
              <div key={idx} className="physio-chat__bullet-item">
                <ChevronRight size={12} className="physio-chat__bullet-icon" />
                <span>{renderInlineFormatting(trimmed.replace(/^[-*•]\s+/, ''))}</span>
              </div>
            );
          }

          // Format Headings / Section prefixes (e.g., "Observed in your session:", "### Header")
          if (
            trimmed.startsWith('###') ||
            trimmed.startsWith('##') ||
            trimmed.toLowerCase().startsWith('observed in your session:') ||
            trimmed.toLowerCase().startsWith('general rehabilitation information:')
          ) {
            const cleanHeader = trimmed.replace(/^#+\s*/, '');
            return (
              <h4 key={idx} className="physio-chat__section-heading">
                {cleanHeader}
              </h4>
            );
          }

          return (
            <p key={idx} className="physio-chat__paragraph">
              {renderInlineFormatting(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderInlineFormatting = (text: string) => {
    // Basic bold parsing for **bold** text
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const isOllamaConnected = ollamaStatus?.status === 'CONNECTED';
  const isListeningOrTranscribing = speechState === 'listening' || speechState === 'transcribing';
  const activeLangObj = assistantLanguage;

  return (
    <>
      {/* ── 1. Floating Help / Assistant Launcher Button ────────────── */}
      <button
        type="button"
        className={`physio-help-launcher ${isOpen ? 'physio-help-launcher--active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Toggle Physiosis Assistant"
        title="Ask Physiosis Rehabilitation Assistant"
      >
        <div className="physio-help-launcher__icon-wrap">
          <Bot size={18} />
          <span
            className={`physio-help-launcher__status-dot ${
              isOllamaConnected ? 'status-dot--online' : 'status-dot--offline'
            }`}
          />
        </div>
        <span className="physio-help-launcher__label">Physio Assistant</span>
      </button>

      {/* ── Expanded Modern Helpbox Panel ───────────────────────────── */}
      {isOpen && (
        <aside
          className="physio-chat-panel"
          role="dialog"
          aria-label="Physiosis Rehabilitation Assistant"
        >
          {/* Header (2-Row Modern Medical-Tech Layout) */}
          <div className="physio-chat__header">
            {/* Header Row 1: Identity + Status + Minimize */}
            <div className="physio-chat__header-row1">
              <div className="physio-chat__header-info">
                <div className="physio-chat__avatar">
                  <Bot size={16} />
                </div>
                <div>
                  <h3 className="physio-chat__title">PHYSIOSIS ASSISTANT</h3>
                  <p className="physio-chat__subtitle">Advisory rehabilitation support</p>
                </div>
              </div>

              <div className="physio-chat__header-actions">
                <span
                  className={`physio-chat__status-pill ${
                    isOllamaConnected
                      ? 'physio-chat__status-pill--online'
                      : 'physio-chat__status-pill--offline'
                  }`}
                  title={
                    isOllamaConnected
                      ? `Connected to local model (${ollamaStatus?.model || 'Ollama'})`
                      : 'Ollama offline or not running'
                  }
                >
                  <span className="status-dot" />
                  {isOllamaConnected ? 'Ollama Online' : 'Offline'}
                </span>

                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => {
                    speechOutputService.stop();
                    setCurrentlySpeakingMsgId(null);
                    setIsOpen(false);
                  }}
                  title="Minimize assistant"
                  aria-label="Close assistant"
                >
                  <Minimize2 size={15} />
                </button>
              </div>
            </div>

            {/* Header Row 2: Language Selector + Voice State Indicator + Auto-Speak */}
            <div className="physio-chat__header-row2">
              <div className="physio-chat__lang-selector" title="Consultation Language">
                <Globe size={11} className="text-cyan shrink-0" />
                <select
                  value={assistantLanguage.code}
                  onChange={(e) => {
                    const chosen =
                      SUPPORTED_ASSISTANT_LANGUAGES.find((l) => l.code === e.target.value) ||
                      DEFAULT_ASSISTANT_LANGUAGE;
                    setAssistantLanguage(chosen);
                    speechOutputService.stop();
                    setCurrentlySpeakingMsgId(null);
                  }}
                  disabled={isListeningOrTranscribing}
                  aria-label="Select Consultation Language"
                >
                  {SUPPORTED_ASSISTANT_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} ({lang.locale})
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice State Badge / Button */}
              <button
                type="button"
                className={`physio-chat__voice-header-btn ${
                  speechState === 'listening'
                    ? 'physio-chat__voice-header-btn--listening'
                    : speechState === 'transcribing'
                    ? 'physio-chat__voice-header-btn--processing'
                    : currentlySpeakingMsgId
                    ? 'physio-chat__voice-header-btn--speaking'
                    : 'physio-chat__voice-header-btn--idle'
                }`}
                onClick={() => {
                  if (currentlySpeakingMsgId) {
                    speechOutputService.stop();
                    setCurrentlySpeakingMsgId(null);
                  } else {
                    handleToggleVoiceInput();
                  }
                }}
                title={
                  speechState === 'listening'
                    ? 'Listening... Click to stop'
                    : currentlySpeakingMsgId
                    ? 'Speaking... Click to mute'
                    : 'Voice input ready'
                }
              >
                {speechState === 'listening' ? (
                  <>
                    <MicOff size={11} />
                    <span>Listening…</span>
                  </>
                ) : speechState === 'transcribing' ? (
                  <>
                    <Loader2 size={11} className="spin-icon" />
                    <span>Processing…</span>
                  </>
                ) : currentlySpeakingMsgId ? (
                  <>
                    <Volume2 size={11} />
                    <span>Speaking…</span>
                  </>
                ) : (
                  <>
                    <Mic size={11} />
                    <span>Voice Off</span>
                  </>
                )}
              </button>

              {/* Auto-Speak Toggle Button */}
              <button
                type="button"
                className={`physio-chat__auto-speak-btn ${
                  autoSpeak ? 'physio-chat__auto-speak-btn--on' : ''
                }`}
                onClick={() => {
                  const next = !autoSpeak;
                  setAutoSpeak(next);
                  if (!next) {
                    speechOutputService.stop();
                    setCurrentlySpeakingMsgId(null);
                  }
                }}
                title={`Auto-speak replies: ${autoSpeak ? 'ON' : 'OFF'}`}
                aria-label="Toggle auto speak"
              >
                {autoSpeak ? <Volume2 size={11} /> : <VolumeX size={11} />}
                <span>{autoSpeak ? 'Auto ON' : 'Auto OFF'}</span>
              </button>
            </div>
          </div>

          {/* Compact Inline Status Banners (Offline, Listening, Speech Error, TTS Warning) */}
          {!isOllamaConnected && (
            <div className="physio-chat__status-bar physio-chat__status-bar--offline">
              <AlertCircle size={12} className="shrink-0" />
              <span className="status-bar-text">Local assistant unavailable. Check Ollama.</span>
              <button
                type="button"
                className="btn-icon btn-icon--xs"
                onClick={checkHealth}
                title="Retry Ollama connection"
              >
                <RefreshCw size={10} />
              </button>
            </div>
          )}

          {isListeningOrTranscribing && (
            <div className="physio-chat__status-bar physio-chat__status-bar--listening">
              <div className="speech-pulse-indicator-sm">
                <span className="speech-pulse-ring-sm" />
                <Mic size={11} className="text-cyan" />
              </div>
              <span className="status-bar-text">
                {speechState === 'listening'
                  ? `Listening… (${activeLangObj.name})`
                  : 'Transcribing…'}
              </span>

              {/* Real-time RMS audio level indicator ● ● ● ● */}
              {speechState === 'listening' && (
                <div className="physio-chat__audio-meter" title="Microphone sound level">
                  <span className={`audio-dot ${audioLevel > 0.05 ? 'audio-dot--active' : ''}`} />
                  <span className={`audio-dot ${audioLevel > 0.2 ? 'audio-dot--active' : ''}`} />
                  <span className={`audio-dot ${audioLevel > 0.4 ? 'audio-dot--active' : ''}`} />
                  <span className={`audio-dot ${audioLevel > 0.6 ? 'audio-dot--active' : ''}`} />
                </div>
              )}

              <button
                type="button"
                className="status-bar-stop-btn"
                onClick={() => speechInputService.stopListening()}
                title="Stop listening"
              >
                Stop
              </button>
            </div>
          )}

          {speechError && (
            <div className="physio-chat__status-bar physio-chat__status-bar--error">
              <AlertCircle size={11} className="shrink-0" />
              <span className="status-bar-text">{speechError}</span>
              <button
                type="button"
                className="status-bar-close-btn"
                onClick={() => setSpeechError(null)}
                title="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {ttsWarning && (
            <div className="physio-chat__status-bar physio-chat__status-bar--warning">
              <AlertCircle size={11} className="shrink-0" />
              <span className="status-bar-text">{ttsWarning}</span>
              <button
                type="button"
                className="status-bar-close-btn"
                onClick={() => setTtsWarning(null)}
                title="Dismiss warning"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Questions Prompt Chips (Horizontally Scrollable Chips) */}
          <div className="physio-chat__quick-prompts">
            <span className="quick-prompts__label">
              <Sparkles size={11} /> Suggested Questions
            </span>
            <div className="quick-prompts__chips">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-prompt-chip"
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isLoading || isListeningOrTranscribing}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation History */}
          <div className="physio-chat__history" role="log" aria-live="polite">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isSpeakingThis = currentlySpeakingMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`physio-chat__message-row ${
                    isUser ? 'message-row--user' : 'message-row--assistant'
                  }`}
                >
                  {!isUser && (
                    <div className="message-avatar">
                      <Bot size={15} />
                    </div>
                  )}

                  <div
                    className={`physio-chat__bubble ${
                      isUser
                        ? 'bubble--user'
                        : msg.isRedFlag
                        ? 'bubble--red-flag'
                        : msg.isOutOfDomain
                        ? 'bubble--restricted'
                        : msg.isError
                        ? 'bubble--error'
                        : 'bubble--assistant'
                    }`}
                  >
                    {/* Domain Guard Flag Banner (Polished Amber Card) */}
                    {msg.isOutOfDomain && (
                      <div className="bubble__restricted-badge">
                        <HelpCircle size={12} />
                        <span>PHYSIOTHERAPY ONLY</span>
                      </div>
                    )}

                    {/* Red-Flag Safety Emergency Banner */}
                    {msg.isRedFlag && (
                      <div className="bubble__red-flag-badge">
                        <AlertTriangle size={13} />
                        <span>CLINICAL SAFETY NOTICE</span>
                      </div>
                    )}

                    {/* Body Text */}
                    {isUser ? (
                      <p className="physio-chat__user-text">{msg.text}</p>
                    ) : (
                      renderFormattedText(msg.text)
                    )}

                    {/* Verified Clinical Citations (Patch 7: Local RAG) */}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 229, 255, 0.08)',
                          border: '1px solid rgba(0, 229, 255, 0.22)',
                          fontSize: '11px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                          <BookOpen size={11} />
                          <span>Verified Clinical Evidence (Local RAG)</span>
                        </div>
                        {msg.sources.map((src, idx) => (
                          <div key={idx} style={{ color: 'var(--text-secondary)', fontSize: '10.5px' }}>
                            <strong>Source:</strong> {src.source} — <em>"{src.title}"</em> {src.date ? `(${src.date})` : ''}
                            {src.evidenceLevel && (
                              <span style={{ marginLeft: '4px', opacity: 0.85, color: '#34D399' }}>
                                [{src.evidenceLevel}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bubble Metadata & TTS Controls */}
                    <div className="bubble__meta">
                      <span className="bubble__time">{msg.timestamp}</span>

                      {/* Text-to-Speech Output Button for Assistant Messages (Language-Aware) */}
                      {!isUser && !msg.isError && (
                        <button
                          type="button"
                          className={`bubble__speak-btn ${
                            isSpeakingThis ? 'bubble__speak-btn--speaking' : ''
                          }`}
                          onClick={() => handleSpeakMessage(msg.id, msg.text, msg.language)}
                          title={
                            isSpeakingThis
                              ? 'Stop voice readout'
                              : `Read aloud (${(msg.language || activeLangObj).name})`
                          }
                          aria-label="Speak assistant response"
                        >
                          {isSpeakingThis ? (
                            <>
                              <Square size={10} />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 size={10} />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking... State */}
            {isLoading && (
              <div className="physio-chat__message-row message-row--assistant">
                <div className="message-avatar">
                  <Bot size={15} />
                </div>
                <div className="physio-chat__bubble bubble--thinking">
                  <div className="thinking-indicator">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span className="thinking-text">Physiosis is thinking…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Box & Actions (Large 52px Bar) */}
          <div className="physio-chat__input-bar">
            <input
              ref={inputRef}
              type="text"
              className="physio-chat__input"
              placeholder={
                speechState === 'listening'
                  ? `Listening (${activeLangObj.nativeName})... Speak your question`
                  : speechState === 'transcribing'
                  ? 'Transcribing on-device...'
                  : 'Ask about your exercise, movement, or session…'
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || speechState === 'transcribing'}
            />

            {/* Multilingual Microphone Button (42x42px) */}
            <button
              type="button"
              className={`physio-chat__mic-btn ${
                speechState === 'listening'
                  ? 'physio-chat__mic-btn--listening'
                  : speechState === 'transcribing'
                  ? 'physio-chat__mic-btn--processing'
                  : 'physio-chat__mic-btn--off'
              }`}
              title={
                speechState === 'listening'
                  ? 'Stop voice input'
                  : speechState === 'transcribing'
                  ? 'Processing voice input...'
                  : 'Start voice input'
              }
              aria-label={speechState === 'listening' ? 'Stop voice input' : 'Start voice input'}
              onClick={handleToggleVoiceInput}
              disabled={isLoading || speechState === 'transcribing'}
            >
              {speechState === 'listening' ? (
                <MicOff size={18} />
              ) : speechState === 'transcribing' ? (
                <Loader2 size={18} className="spin-icon" />
              ) : (
                <Mic size={18} />
              )}
            </button>

            {/* Send Button (42x42px) */}
            <button
              type="button"
              className="physio-chat__send-btn"
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              title="Send message"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>

          {/* Clinical Disclaimer Footer */}
          <div className="physio-chat__footer">
            <span>Advisory rehabilitation assistant. Not a diagnostic service.</span>
          </div>
        </aside>
      )}
    </>
  );
};
