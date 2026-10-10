/**
 * assistant.ts
 * Type definitions for the local Physiosis Physiotherapy Assistant (Ollama).
 */

export interface AssistantLanguage {
  code: string;
  locale: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_ASSISTANT_LANGUAGES: readonly AssistantLanguage[] = [
  { code: 'en', locale: 'en-IN', name: 'English', nativeName: 'English' },
  { code: 'hi', locale: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'te', locale: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ta', locale: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'kn', locale: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', locale: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'bn', locale: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', locale: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu', locale: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી' },
];

export const DEFAULT_ASSISTANT_LANGUAGE: AssistantLanguage = SUPPORTED_ASSISTANT_LANGUAGES[0];

export interface PhysioAssistantContext {
  patientId?: string;
  exercise?: string;
  targetROM?: number;
  currentROM?: number;
  bestROM?: number;
  averageROM?: number;
  repetitions?: number;
  movementQuality?: number;
  limitations?: string[];
  suggestions?: string[];
  trend?: string;
  hasActiveSession?: boolean;
  notes?: string;
  previousSessionsSummary?: {
    totalSessions: number;
    initialROM?: number;
    latestROM?: number;
    overallProgress?: string;
  };
  patientState?: import('../engine/state/PatientRehabilitationState').PatientRehabilitationState;
}

/** Alias for backward-compatibility */
export type PhysioAssistantSessionContext = PhysioAssistantContext;

export type { KnowledgeCitation } from '../engine/knowledge/KnowledgeTypes';
import type { KnowledgeCitation } from '../engine/knowledge/KnowledgeTypes';

export interface PhysioAssistantRequest {
  message: string;
  language?: AssistantLanguage | string;
  sessionContext?: PhysioAssistantContext;
}

export interface PhysioAssistantResponse {
  reply: string;
  model: string;
  timestamp: string;
  success: boolean;
  isRedFlag?: boolean;
  isOutOfDomain?: boolean;
  category?: string;
  error?: string;
  sources?: KnowledgeCitation[];
  grounded?: boolean;
}

export interface OllamaConnectionStatus {
  status: 'CONNECTED' | 'OFFLINE';
  baseUrl: string;
  model: string;
  availableModels: string[];
  version?: string;
  message?: string;
}
