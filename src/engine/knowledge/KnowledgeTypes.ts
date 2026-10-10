/**
 * =====================================================================
 * PHYSIOSIS — LOCAL PHYSIOTHERAPY KNOWLEDGE TYPES (PATCH 7)
 * =====================================================================
 * Type definitions and contracts for the Local Physiotherapy RAG Engine.
 *
 * Ensures that:
 * 1. The LLM is never the sole medical authority.
 * 2. Every chunk retains verified clinical metadata (source, title, section,
 *    date, topic, exercise, evidenceLevel).
 * 3. Citations can be transparently presented to patients and clinicians.
 * 4. Zero patient data is uploaded to external vector databases.
 */

export type KnowledgeTopic =
  | 'exercise_education'
  | 'movement_explanation'
  | 'rehabilitation_concepts'
  | 'safety_education'
  | 'protocol_rationale';

export type EvidenceLevel =
  | 'Level 1a (Systematic Review)'
  | 'Level 1b (RCT)'
  | 'Level 2a (Clinical Practice Guideline)'
  | 'Level 2b (Cohort Study)'
  | 'Level 3 (Clinical Consensus / Expert)';

export interface KnowledgeCitation {
  source: string;
  title: string;
  section?: string;
  date?: string;
  topic?: KnowledgeTopic | string;
  exercise?: string;
  evidenceLevel?: EvidenceLevel | string;
}

export interface PhysioKnowledgeDocument {
  id: string;
  source: string;
  title: string;
  section: string;
  date: string;
  topic: KnowledgeTopic;
  exercise: string; // Specific exerciseId (e.g. 'shoulder-flexion') or 'all'
  evidenceLevel: EvidenceLevel;
  content: string;
  keywords: string[];
}

export interface KnowledgeChunkMetadata {
  docId: string;
  source: string;
  title: string;
  section: string;
  date: string;
  topic: KnowledgeTopic;
  exercise: string;
  evidenceLevel: EvidenceLevel;
  keywords: string[];
}

export interface KnowledgeChunk {
  chunkId: string;
  docId: string;
  text: string;
  embedding?: number[];
  tokenSet?: Set<string>;
  metadata: KnowledgeChunkMetadata;
}

export interface KnowledgeQueryResult {
  chunk: KnowledgeChunk;
  similarity: number; // Cosine similarity [0.0 - 1.0]
  relevanceRank: number;
}

export interface RAGRetrievalResult {
  query: string;
  hasReliableKnowledge: boolean;
  results: KnowledgeQueryResult[];
  citations: KnowledgeCitation[];
  groundedContextText: string;
  fallbackNotice?: string;
}

export interface KnowledgeEngineStats {
  totalDocuments: number;
  totalChunks: number;
  vectorDimensions: number;
  approvedSources: string[];
  topicsCovered: KnowledgeTopic[];
}
