/**
 * =====================================================================
 * PHYSIOSIS — LOCAL PHYSIOTHERAPY KNOWLEDGE ENGINE (PATCH 7)
 * =====================================================================
 * Authoritative facade for clinical document retrieval-augmented generation (RAG).
 *
 * Core Principles:
 * 1. The LLM is never the sole medical knowledge source.
 * 2. All clinical guidance must be grounded in verified, approved literature.
 * 3. Fallback: If no reliable knowledge is retrieved:
 *    "I don't have enough verified information to answer that."
 * 4. Transparent Citations: Returns verifiable metadata (source, title, section, date, evidenceLevel).
 * 5. 100% Local: Zero patient data or query transmission to external cloud services.
 */

import type {
  RAGRetrievalResult,
  KnowledgeCitation,
  KnowledgeTopic,
  KnowledgeEngineStats,
} from './KnowledgeTypes';
import { CURATED_PHYSIOTHERAPY_DOCUMENTS } from './curatedDocuments';
import { LocalVectorStore } from './LocalVectorStore';

export class PhysioKnowledgeEngine {
  private static vectorStore: LocalVectorStore = new LocalVectorStore();
  private static isInitialized = false;

  public static readonly UNVERIFIED_FALLBACK_MESSAGE =
    "I don't have enough verified information to answer that.";

  /**
   * Initialize and index the approved clinical knowledge corpus.
   * Deterministic, idempotent, and runs entirely in-memory.
   */
  public static initialize(): void {
    if (this.isInitialized) return;

    this.vectorStore.ingestDocuments(CURATED_PHYSIOTHERAPY_DOCUMENTS);
    this.isInitialized = true;
  }

  /**
   * Retrieve relevant clinical evidence for an exercise or rehabilitation query.
   */
  public static retrieve(
    query: string,
    options: {
      topK?: number;
      exerciseId?: string;
      topic?: KnowledgeTopic;
      minSimilarity?: number;
    } = {}
  ): RAGRetrievalResult {
    this.initialize();

    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return {
        query,
        hasReliableKnowledge: false,
        results: [],
        citations: [],
        groundedContextText: '',
        fallbackNotice: this.UNVERIFIED_FALLBACK_MESSAGE,
      };
    }

    const results = this.vectorStore.query(cleanQuery, options);

    if (results.length === 0) {
      return {
        query,
        hasReliableKnowledge: false,
        results: [],
        citations: [],
        groundedContextText: '',
        fallbackNotice: this.UNVERIFIED_FALLBACK_MESSAGE,
      };
    }

    // Extract deduplicated citations
    const citations: KnowledgeCitation[] = [];
    const seenTitles = new Set<string>();

    for (const r of results) {
      const key = `${r.chunk.metadata.source} - ${r.chunk.metadata.title}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        citations.push({
          source: r.chunk.metadata.source,
          title: r.chunk.metadata.title,
          section: r.chunk.metadata.section,
          date: r.chunk.metadata.date,
          topic: r.chunk.metadata.topic,
          exercise: r.chunk.metadata.exercise,
          evidenceLevel: r.chunk.metadata.evidenceLevel,
        });
      }
    }

    // Build grounded clinical context block for prompt injection
    const contextLines: string[] = [
      '### RETRIEVED CLINICAL PHYSIOTHERAPY EVIDENCE (MANDATORY GROUNDING):',
      'The following verified excerpts were retrieved from approved clinical guidelines.',
      'You MUST base your technical/educational explanation on these excerpts.',
      '',
    ];

    results.forEach((r, idx) => {
      const meta = r.chunk.metadata;
      contextLines.push(
        `[Evidence Source ${idx + 1}]: "${meta.title}" (${meta.date})`
      );
      contextLines.push(`  - Source: ${meta.source} [${meta.evidenceLevel}]`);
      contextLines.push(`  - Section: ${meta.section}`);
      contextLines.push(`  - Excerpt: "${r.chunk.text}"`);
      contextLines.push('');
    });

    contextLines.push(
      'MANDATORY CITATION INSTRUCTION:',
      '- At the end of your response, provide the verified source citation using this exact format:',
      `  Source: ${citations[0].source} — "${citations[0].title}" (${citations[0].date})`,
      `- If the user asks something outside these retrieved facts, respond: "${this.UNVERIFIED_FALLBACK_MESSAGE}"`,
      '- NEVER fabricate medical conditions, diagnoses, or pharmaceutical treatments.'
    );

    return {
      query,
      hasReliableKnowledge: true,
      results,
      citations,
      groundedContextText: contextLines.join('\n'),
    };
  }

  /**
   * Retrieve summary statistics of the knowledge base.
   */
  public static getStats(): KnowledgeEngineStats {
    this.initialize();

    const approvedSources = Array.from(
      new Set(CURATED_PHYSIOTHERAPY_DOCUMENTS.map((d) => d.source))
    );
    const topicsCovered = Array.from(
      new Set(CURATED_PHYSIOTHERAPY_DOCUMENTS.map((d) => d.topic))
    );

    return {
      totalDocuments: CURATED_PHYSIOTHERAPY_DOCUMENTS.length,
      totalChunks: this.vectorStore.getChunkCount(),
      vectorDimensions: 256,
      approvedSources,
      topicsCovered,
    };
  }

  /**
   * Retrieve all approved sources represented in the knowledge engine.
   */
  public static getAllApprovedSources(): string[] {
    return Array.from(
      new Set(CURATED_PHYSIOTHERAPY_DOCUMENTS.map((d) => d.source))
    );
  }
}
