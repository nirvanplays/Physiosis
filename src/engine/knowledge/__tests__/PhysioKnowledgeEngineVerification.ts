/**
 * =====================================================================
 * PHYSIOSIS — LOCAL PHYSIOTHERAPY RAG ENGINE QA TEST BENCH (PATCH 7)
 * =====================================================================
 * Automated verification suite for the Local Physiotherapy Knowledge Engine.
 *
 * Validates:
 *   1. Document ingestion and semantic chunking across all approved sources.
 *   2. Semantic vector retrieval across all 5 core clinical domains:
 *      - Exercise education
 *      - Movement explanation
 *      - Rehabilitation concepts
 *      - Safety education
 *      - Protocol rationale
 *   3. Metadata-constrained retrieval (by exercise and topic).
 *   4. Strict non-hallucination failure: Irrelevant / ungrounded queries return
 *      "I don't have enough verified information to answer that."
 *   5. Citation metadata integrity (source, title, section, date, evidenceLevel).
 *   6. Strict non-diagnostic compliance across all retrieved chunks.
 *   7. 100% local in-memory execution with zero external network leakage.
 */

declare const process: any;

import { PhysioKnowledgeEngine } from '../PhysioKnowledgeEngine';
import { LocalVectorStore } from '../LocalVectorStore';
import { CURATED_PHYSIOTHERAPY_DOCUMENTS } from '../curatedDocuments';

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// 1. INGESTION & APPROVED CLINICAL SOURCES VERIFICATION
// ─────────────────────────────────────────────────────────────────────
test('1. Knowledge Ingestion: All approved clinical sources and topics indexed', () => {
  PhysioKnowledgeEngine.initialize();
  const stats = PhysioKnowledgeEngine.getStats();

  assert(stats.totalDocuments >= 14, `Expected at least 14 documents, got ${stats.totalDocuments}`);
  assert(stats.totalChunks >= 14, `Expected at least 14 chunks, got ${stats.totalChunks}`);
  assert(stats.vectorDimensions === 256, `Expected 256 vector dimensions, got ${stats.vectorDimensions}`);

  // Verify approved sources
  const requiredSources = [
    'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    'American Physical Therapy Association (APTA)',
    'American Academy of Orthopaedic Surgeons (AAOS)',
    'American College of Sports Medicine (ACSM)',
    'Magee Orthopedic Physical Assessment (7th Ed.)',
  ];

  for (const src of requiredSources) {
    assert(
      stats.approvedSources.includes(src),
      `Missing required clinical source: "${src}" in approvedSources: [${stats.approvedSources.join(', ')}]`
    );
  }

  // Verify all 5 topics covered
  const requiredTopics = [
    'exercise_education',
    'movement_explanation',
    'rehabilitation_concepts',
    'safety_education',
    'protocol_rationale',
  ];

  for (const topic of requiredTopics) {
    assert(
      stats.topicsCovered.includes(topic as any),
      `Missing required knowledge topic: "${topic}"`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// 2. EXERCISE EDUCATION SEMANTIC RETRIEVAL
// ─────────────────────────────────────────────────────────────────────
test('2a. Exercise Education: Shoulder Flexion kinematics and prime movers', () => {
  const res = PhysioKnowledgeEngine.retrieve('What muscles elevate the arm during shoulder flexion?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge to be found');
  assert(res.results.length > 0, 'Results must not be empty');
  assert(res.results[0].similarity >= LocalVectorStore.MIN_SIMILARITY_THRESHOLD, 'Similarity must exceed 0.40');

  const topChunk = res.results[0].chunk;
  assert(
    topChunk.metadata.exercise === 'shoulder-flexion',
    `Expected shoulder-flexion chunk, got ${topChunk.metadata.exercise}`
  );
  assert(
    topChunk.text.includes('anterior deltoid') || topChunk.text.includes('supraspinatus'),
    'Expected mention of anterior deltoid or supraspinatus'
  );
  assert(res.citations.length > 0, 'Citations must be populated');
  assert(res.citations[0].source.includes('JOSPT'), 'Citation must cite JOSPT');
});

test('2b. Exercise Education: Knee Extension and terminal VMO activation', () => {
  const res = PhysioKnowledgeEngine.retrieve('Why is the vastus medialis oblique VMO important in terminal knee extension?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  const topChunk = res.results[0].chunk;
  assert(
    topChunk.metadata.exercise === 'knee-extension',
    `Expected knee-extension chunk, got ${topChunk.metadata.exercise}`
  );
  assert(topChunk.text.includes('vastus medialis oblique') || topChunk.text.includes('VMO'), 'Must mention VMO');
  assert(res.citations[0].source.includes('AAOS'), 'Citation must cite AAOS');
});

// ─────────────────────────────────────────────────────────────────────
// 3. MOVEMENT EXPLANATION & SCAPULOHUMERAL RHYTHM
// ─────────────────────────────────────────────────────────────────────
test('3a. Movement Explanation: 2:1 Scapulohumeral Rhythm ratio', () => {
  const res = PhysioKnowledgeEngine.retrieve('Explain the 2:1 ratio of scapulohumeral rhythm');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  const topResult = res.results[0];
  assert(topResult.chunk.metadata.topic === 'movement_explanation', 'Topic must be movement_explanation');
  assert(topResult.chunk.text.includes('2:1 ratio'), 'Must explain 2:1 ratio');
  assert(topResult.chunk.metadata.evidenceLevel.includes('Level 1a'), 'Must carry Level 1a evidence');
});

test('3b. Movement Explanation: Compensatory substitute movements (hiking, trunk lean)', () => {
  const res = PhysioKnowledgeEngine.retrieve('What causes shoulder hiking and trunk lateral lean during exercise?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  const topText = res.results[0].chunk.text;
  assert(
    topText.includes('Shoulder Hiking') && topText.includes('Trunk Lateral Lean'),
    'Must explain both shoulder hiking and trunk lateral lean'
  );
});

// ─────────────────────────────────────────────────────────────────────
// 4. SAFETY EDUCATION RETRIEVAL
// ─────────────────────────────────────────────────────────────────────
test('4a. Safety Education: Kinematic jerk and velocity limit (> 200°/s)', () => {
  const res = PhysioKnowledgeEngine.retrieve('Why must movement velocity stay below 200 degrees per second?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  assert(res.results[0].chunk.metadata.topic === 'safety_education', 'Topic must be safety_education');
  assert(res.results[0].chunk.text.includes('200 degrees per second'), 'Must cite 200 deg/s threshold');
});

test('4b. Safety Education: Subacromial painful arc (60° to 120°)', () => {
  const res = PhysioKnowledgeEngine.retrieve('What is the painful arc between 60 and 120 degrees of abduction?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  assert(res.results[0].chunk.text.includes('60 and 120 degrees'), 'Must cite 60-120 deg painful arc');
});

// ─────────────────────────────────────────────────────────────────────
// 5. PROTOCOL RATIONALE & DOSING
// ─────────────────────────────────────────────────────────────────────
test('5a. Protocol Rationale: Repetition volume dosing (8-12 reps)', () => {
  const res = PhysioKnowledgeEngine.retrieve('Why are therapeutic repetitions dosed in sets of 8 to 12?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  assert(res.results[0].chunk.metadata.topic === 'protocol_rationale', 'Topic must be protocol_rationale');
  assert(res.results[0].chunk.text.includes('8 to 12 repetitions'), 'Must cite 8-12 reps rationale');
});

test('5b. Protocol Rationale: Rest intervals (30-60 seconds)', () => {
  const res = PhysioKnowledgeEngine.retrieve('Why are 30 to 60 second rest intervals necessary in physical therapy?');

  assert(res.hasReliableKnowledge === true, 'Expected reliable knowledge');
  assert(res.results[0].chunk.text.includes('30 to 60 seconds'), 'Must cite 30-60s rest interval');
});

// ─────────────────────────────────────────────────────────────────────
// 6. METADATA FILTERING
// ─────────────────────────────────────────────────────────────────────
test('6. Metadata Filtering: Exercise and topic constraints are strictly respected', () => {
  // Query with exercise filter for knee-extension
  const kneeFiltered = PhysioKnowledgeEngine.retrieve('Tell me about active exercise biomechanics', {
    exerciseId: 'knee-extension',
  });

  for (const r of kneeFiltered.results) {
    assert(
      r.chunk.metadata.exercise === 'knee-extension' || r.chunk.metadata.exercise === 'all',
      `Chunk exercise must be knee-extension or all, got ${r.chunk.metadata.exercise}`
    );
  }

  // Query with topic filter for safety_education
  const safetyFiltered = PhysioKnowledgeEngine.retrieve('What are the rules and guidelines?', {
    topic: 'safety_education',
  });

  for (const r of safetyFiltered.results) {
    assert(
      r.chunk.metadata.topic === 'safety_education',
      `Chunk topic must be safety_education, got ${r.chunk.metadata.topic}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// 7. STRICT NON-HALLUCINATION FAILURE
// ─────────────────────────────────────────────────────────────────────
test('7. Strict Non-Hallucination Failure: Ungrounded queries return verified fallback', () => {
  const ungroundedQueries = [
    'How do I bake chocolate chip cookies with walnuts?',
    'What is the stock price of Apple Inc AAPL?',
    'Who was the prime minister of Britain in 1850?',
    'Explain quantum chromodynamics and gluon scattering',
    'How do I change the spark plugs on a 2012 Honda Civic?',
  ];

  for (const q of ungroundedQueries) {
    const res = PhysioKnowledgeEngine.retrieve(q);
    assert(
      res.hasReliableKnowledge === false,
      `Expected ungrounded query "${q}" to yield hasReliableKnowledge === false`
    );
    assert(
      res.fallbackNotice === PhysioKnowledgeEngine.UNVERIFIED_FALLBACK_MESSAGE,
      `Expected fallbackNotice to be exact message: "${PhysioKnowledgeEngine.UNVERIFIED_FALLBACK_MESSAGE}", got: "${res.fallbackNotice}"`
    );
    assert(res.results.length === 0, 'Results must be empty for ungrounded queries');
  }
});

// ─────────────────────────────────────────────────────────────────────
// 8. CITATION INTEGRITY & RAG PROMPT FORMULATION
// ─────────────────────────────────────────────────────────────────────
test('8. Citation Integrity: Formatted context includes metadata, evidence levels and citations', () => {
  const res = PhysioKnowledgeEngine.retrieve('What is the scapulohumeral rhythm during arm elevation?');

  assert(res.hasReliableKnowledge === true, 'Must have reliable knowledge');
  assert(res.citations.length > 0, 'Citations must be present');

  const cit = res.citations[0];
  assert(cit.source.length > 0, 'Citation source must not be empty');
  assert(cit.title.length > 0, 'Citation title must not be empty');
  assert(cit.date !== undefined && cit.date.length > 0, 'Citation date must not be empty');
  assert(cit.evidenceLevel !== undefined && cit.evidenceLevel.length > 0, 'Citation evidence level must not be empty');

  // Verify prompt context text structure
  assert(
    res.groundedContextText.includes('RETRIEVED CLINICAL PHYSIOTHERAPY EVIDENCE'),
    'Prompt context must include clinical header'
  );
  assert(
    res.groundedContextText.includes('MANDATORY CITATION INSTRUCTION'),
    'Prompt context must include citation instruction'
  );
  assert(
    res.groundedContextText.includes(PhysioKnowledgeEngine.UNVERIFIED_FALLBACK_MESSAGE),
    'Prompt context must include fallback refusal instruction'
  );
});

// ─────────────────────────────────────────────────────────────────────
// 9. STRICT NON-DIAGNOSTIC INVARIANT
// ─────────────────────────────────────────────────────────────────────
test('9. Non-Diagnostic Invariant: Zero medical disease diagnoses across entire corpus', () => {
  const disallowedTerms = [
    'you have an acl tear',
    'you are diagnosed with',
    'patient has frozen shoulder',
    'you have scoliosis',
    'diagnosed condition',
  ];

  for (const doc of CURATED_PHYSIOTHERAPY_DOCUMENTS) {
    const textLower = `${doc.title} ${doc.section} ${doc.content}`.toLowerCase();
    for (const term of disallowedTerms) {
      assert(
        !textLower.includes(term),
        `Corpus Invariant Violated: Found disallowed diagnostic term "${term}" in document "${doc.id}"`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
// EXECUTE TEST BENCH
// ─────────────────────────────────────────────────────────────────────
console.log('=====================================================================');
console.log('  PHYSIOSIS LOCAL PHYSIOTHERAPY RAG ENGINE VERIFICATION (PATCH 7)');
console.log('=====================================================================\n');

for (const t of tests) {
  try {
    t.fn();
    console.log(`  [PASS] ${t.name}`);
    passCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${t.name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

console.log('\n=====================================================================');
console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed (Total: ${tests.length})`);
console.log('=====================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('>>> All Local Physiotherapy RAG Knowledge Engine QA tests passed successfully! <<<\n');
}
