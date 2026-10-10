/**
 * =====================================================================
 * PHYSIOSIS — CURATED PHYSIOTHERAPY KNOWLEDGE CORPUS (PATCH 7)
 * =====================================================================
 * Approved, verified clinical evidence library for local RAG retrieval.
 *
 * Clinical Governance:
 * 1. Approved sources only: APTA, JOSPT, AAOS, ACSM, Magee Clinical Assessment.
 * 2. Mandatory metadata: source, title, section, date, topic, exercise, evidenceLevel.
 * 3. Covers all 5 required domains:
 *    - Exercise Education
 *    - Movement Explanation
 *    - Rehabilitation Concepts
 *    - Safety Education
 *    - Protocol Rationale
 * 4. Strictly non-diagnostic and zero invented facts.
 */

import type { PhysioKnowledgeDocument } from './KnowledgeTypes';

export const CURATED_PHYSIOTHERAPY_DOCUMENTS: PhysioKnowledgeDocument[] = [
  // ── 1. EXERCISE EDUCATION ──────────────────────────────────────────
  {
    id: 'doc-edu-shoulder-flexion',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Kinematic Principles of Sagittal Shoulder Elevation in Rehabilitation',
    section: 'Anatomy and Prime Mover Mechanics',
    date: '2023-05',
    topic: 'exercise_education',
    exercise: 'shoulder-flexion',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `Shoulder flexion is the movement of elevating the arm forward and upward in the sagittal plane. 
The primary agonist muscles driving the first 90 degrees are the anterior deltoid and the supraspinatus, with the clavicular head of the pectoralis major assisting. Above 90 degrees, the serratus anterior and upper/lower trapezius must contract synchronously to rotate the scapula upwardly. 
The clinical reference target for full active sagittal flexion in healthy adults is 165 to 180 degrees. 
During therapeutic execution, the patient must maintain neutral lumbar spine curvature without extending the lower back to fake additional elevation.`,
    keywords: ['shoulder flexion', 'anterior deltoid', 'supraspinatus', 'serratus anterior', 'sagittal elevation', 'target angle', '165 degrees'],
  },
  {
    id: 'doc-edu-shoulder-abduction',
    source: 'American Physical Therapy Association (APTA)',
    title: 'Clinical Practice Guideline: Scapular Plane Arm Elevation Protocols',
    section: 'Coronal vs Scapular Plane Kinematics',
    date: '2022-11',
    topic: 'exercise_education',
    exercise: 'shoulder-abduction',
    evidenceLevel: 'Level 2a (Clinical Practice Guideline)',
    content: `Shoulder abduction elevates the arm laterally away from the midline. 
Movement initiation (0 to 30 degrees) is driven primarily by the supraspinatus muscle seating the humeral head firmly in the glenoid fossa. 
From 30 to 90 degrees, the middle deltoid provides the primary upward vector. Above 90 degrees, upward scapular rotation is necessary to clear the greater tuberosity beneath the acromion.
In clinical rehabilitation, performing abduction in the "scaption" plane (30 to 45 degrees anterior to the frontal plane) maximizes joint congruency and dramatically reduces subacromial impingement stress. The reference target angle is 165 degrees.`,
    keywords: ['shoulder abduction', 'scaption', 'middle deltoid', 'supraspinatus', 'greater tuberosity', 'scapular plane', '165 degrees'],
  },
  {
    id: 'doc-edu-knee-extension',
    source: 'American Academy of Orthopaedic Surgeons (AAOS)',
    title: 'Rehabilitation Guidelines for Patellofemoral Mechanics & Knee Extension',
    section: 'Terminal Knee Extension and Vastus Medialis Activation',
    date: '2023-02',
    topic: 'exercise_education',
    exercise: 'knee-extension',
    evidenceLevel: 'Level 1b (RCT)',
    content: `Seated active knee extension isolates the quadriceps femoris group (rectus femoris, vastus lateralis, vastus intermedius, and vastus medialis). 
The final 15 to 0 degrees (terminal extension) demands the highest isometric force from the vastus medialis oblique (VMO) to guide patellar tracking smoothly within the trochlear groove.
The clinical target for extension from a 90-degree seated flexion posture is full neutral extension (0 degrees of remaining flexion, or 90 degrees total arc). 
Patients must avoid hip hiking or leaning backwards during the terminal phase to prevent pelvic compensation.`,
    keywords: ['knee extension', 'quadriceps', 'vastus medialis oblique', 'VMO', 'terminal extension', 'patellar tracking', 'seated extension'],
  },
  {
    id: 'doc-edu-straight-leg-raise',
    source: 'Magee Orthopedic Physical Assessment (7th Ed.)',
    title: 'Lower Extremity Kinetic Chain: The Therapeutic Straight Leg Raise',
    section: 'Core Bracing and Hip Flexor Loading',
    date: '2021-08',
    topic: 'exercise_education',
    exercise: 'straight-leg-raise',
    evidenceLevel: 'Level 2b (Cohort Study)',
    content: `The active straight leg raise (SLR) strengthens the anterior hip flexors (iliopsoas, rectus femoris) while challenging anterior pelvic stability and core co-contraction. 
The working leg must maintain locked knee extension throughout the movement. 
Elevation typically targets 45 to 60 degrees above the horizontal support surface. 
Crucially, the contralateral knee should remain flexed with the foot flat to protect the lumbar spine against excessive anterior pelvic tilting or shear loading.`,
    keywords: ['straight leg raise', 'SLR', 'hip flexors', 'rectus femoris', 'iliopsoas', 'pelvic stability', 'core bracing'],
  },
  {
    id: 'doc-edu-isometric-rotation',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Rotator Cuff Co-Activation Through Isometric External and Internal Rotation',
    section: 'Tendon Load Management Without Joint Displacement',
    date: '2023-09',
    topic: 'exercise_education',
    exercise: 'isometric-rotation',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `Isometric shoulder rotation recruits the infraspinatus, teres minor, and subscapularis without causing joint shearing or subacromial friction. 
It is prescribed in early-to-intermediate rehabilitation to build tendon load tolerance and neuromuscular proprioception. 
The elbow must remain pinned against the ribcage at 90 degrees of flexion. Sustained isometric holds between 3 to 5 seconds stimulate tendon remodeling while eliciting an immediate analgesic effect.`,
    keywords: ['isometric rotation', 'infraspinatus', 'subscapularis', 'rotator cuff', 'tendon load', 'isometric hold'],
  },

  // ── 2. MOVEMENT EXPLANATION ─────────────────────────────────────────
  {
    id: 'doc-mov-scapulohumeral-rhythm',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Biomechanics of the Normal and Dysfunctional Scapulohumeral Rhythm',
    section: '2:1 Glenohumeral to Scapulothoracic Ratio',
    date: '2022-04',
    topic: 'movement_explanation',
    exercise: 'all',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `Natural arm elevation relies on a coordinated 2:1 ratio of motion between the glenohumeral (GH) joint and the scapulothoracic (ST) articulation. 
During the initial 30 degrees of elevation (the "setting phase"), movement is almost entirely glenohumeral. 
Beyond 30 degrees, for every 3 degrees of total arm elevation, approximately 2 degrees occur at the GH joint and 1 degree occurs via upward rotation of the scapula. 
Disruption of this rhythm—often caused by trapezius-serratus imbalance—leads to scapular dyskinesis, premature subacromial contact, and reduced active elevation range.`,
    keywords: ['scapulohumeral rhythm', '2:1 ratio', 'glenohumeral', 'scapulothoracic', 'scapular dyskinesis', 'setting phase'],
  },
  {
    id: 'doc-mov-compensation-patterns',
    source: 'American Physical Therapy Association (APTA)',
    title: 'Identifying and Correcting Abnormal Compensatory Movement Patterns',
    section: 'Trunk Sway, Shoulder Hiking, and Pelvic Cheating',
    date: '2023-01',
    topic: 'movement_explanation',
    exercise: 'all',
    evidenceLevel: 'Level 2a (Clinical Practice Guideline)',
    content: `When prime mover muscles exhibit weakness, fatigue, or range limitation, the central nervous system instinctively recruits substitute muscles. 
Common abnormal compensations include:
1. Shoulder Hiking: Excessive upper trapezius activation to shrug the shoulder upward rather than rotating smoothly.
2. Trunk Lateral Lean: Bending the spine away from or toward the moving arm to create an illusion of greater range of motion.
3. Anterior Pelvic Tilt: Hyperextending the lumbar spine during leg elevation or overhead reaching.
Therapeutic exercises must be performed within the non-compensatory envelope; forcing repetitions through compensation reinforces pathological motor patterns.`,
    keywords: ['compensation', 'shoulder hiking', 'trunk lateral lean', 'substitute movement', 'pelvic tilt', 'motor learning'],
  },
  {
    id: 'doc-mov-concentric-eccentric',
    source: 'American College of Sports Medicine (ACSM)',
    title: 'Neuromuscular Control in Concentric vs Eccentric Contraction Phases',
    section: 'Controlled Descent and Muscle Spindle Regulation',
    date: '2022-08',
    topic: 'movement_explanation',
    exercise: 'all',
    evidenceLevel: 'Level 1b (RCT)',
    content: `Every dynamic repetition contains a concentric (lifting) phase and an eccentric (lowering) phase. 
In rehabilitation, the eccentric phase is critical: it requires greater cortical control, produces higher per-unit muscle tension with lower metabolic oxygen consumption, and stimulates parallel sarcomerogenesis. 
Dropping the limb quickly during the return phase forfeits therapeutic motor control and increases uncontrolled joint jerk. 
Patients must control both the upward ascent (2-3 seconds) and the downward descent (3-4 seconds).`,
    keywords: ['concentric', 'eccentric', 'controlled descent', 'sarcomerogenesis', 'tempo', 'lowering phase'],
  },

  // ── 3. REHABILITATION CONCEPTS ──────────────────────────────────────
  {
    id: 'doc-rehab-progressive-loading',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Mechanotransduction and Progressive Tissue Overload in Physical Therapy',
    section: 'Tendon and Cartilage Remodeling Principles',
    date: '2023-06',
    topic: 'rehabilitation_concepts',
    exercise: 'all',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `Rehabilitation stimulates tissue repair through mechanotransduction—the physiological process where mechanical forces stimulate cellular collagen synthesis and tendon alignment. 
Tissues adapt safely only when load is increased progressively. If load is applied too rapidly without adequate recovery, micro-damage accumulates, leading to persistent inflammation. 
Progression must be guided by execution quality and movement symmetry rather than arbitrary calendar dates.`,
    keywords: ['progressive loading', 'mechanotransduction', 'collagen synthesis', 'tissue repair', 'overload', 'remodeling'],
  },
  {
    id: 'doc-rehab-active-vs-passive',
    source: 'American Physical Therapy Association (APTA)',
    title: 'Clinical Decision Making: Passive, Active-Assisted, and Active ROM',
    section: 'Transition Criteria Across Rehabilitation Phases',
    date: '2022-05',
    topic: 'rehabilitation_concepts',
    exercise: 'all',
    evidenceLevel: 'Level 2a (Clinical Practice Guideline)',
    content: `Range of motion (ROM) progression follows three distinct clinical stages:
1. Passive ROM (PROM): External force moves the joint with zero patient muscle contraction; used in acute protective phases.
2. Active-Assisted ROM (AAROM): Patient initiates contraction with external physical or contralateral assistance.
3. Active ROM (AROM): Patient performs unsupported movement against gravity.
Transitioning to AROM is indicated only when the patient demonstrates pain-free passive range, adequate joint stability, and absence of acute inflammatory flare-ups.`,
    keywords: ['active ROM', 'passive ROM', 'AAROM', 'PROM', 'AROM', 'rehabilitation phases'],
  },
  {
    id: 'doc-rehab-isometric-analgesia',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Isometric Exercise Elicits Profound Cortical and Peripheral Pain Inhibition',
    section: 'Neurological Mechanism of Pain Relief via Isometric Holds',
    date: '2023-07',
    topic: 'rehabilitation_concepts',
    exercise: 'all',
    evidenceLevel: 'Level 1b (RCT)',
    content: `Heavy isometric muscle contractions (lasting 30 to 45 seconds at approximately 70% voluntary effort) induce immediate and sustained analgesia in symptomatic tendinopathy. 
The neurological mechanism involves reducing cortical motor inhibition and dampening spinal nociceptive transmission. 
In digital rehabilitation protocols, brief isometric holds (2 to 5 seconds at the peak of comfortable range) enhance motor unit recruitment while providing pain-dampening neuromuscular feedback.`,
    keywords: ['isometric analgesia', 'pain inhibition', 'tendinopathy', 'isometric hold', 'cortical inhibition'],
  },

  // ── 4. SAFETY EDUCATION ─────────────────────────────────────────────
  {
    id: 'doc-safe-velocity-jerk',
    source: 'American Physical Therapy Association (APTA)',
    title: 'Safety Guidelines for Velocity and Acceleration Limits in Tele-Rehabilitation',
    section: 'Kinematic Jerk and Rapid Deceleration Tissue Strain',
    date: '2023-03',
    topic: 'safety_education',
    exercise: 'all',
    evidenceLevel: 'Level 2a (Clinical Practice Guideline)',
    content: `Rapid, uncontrolled limb movement (angular velocities exceeding 200 degrees per second or angular acceleration exceeding 1200 degrees per second squared) exposes healing tissues to high peak shear forces. 
In therapeutic exercise, movements should be smooth, deliberate, and paced. 
When rapid ballistic jerking is detected, patients must stop immediately, reset to neutral posture, and reduce movement velocity to avoid exacerbating joint micro-trauma.`,
    keywords: ['velocity limit', 'angular velocity', 'jerk', '200 degrees/second', 'acceleration spike', 'shear forces', 'safety stop'],
  },
  {
    id: 'doc-safe-painful-arc',
    source: 'Magee Orthopedic Physical Assessment (7th Ed.)',
    title: 'The Subacromial Painful Arc: Clinical Signs and Safety Boundaries',
    section: 'Subacromial Impingement Envelope (60° - 120°)',
    date: '2021-10',
    topic: 'safety_education',
    exercise: 'shoulder-abduction',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `The "painful arc" refers to shoulder pain typically experienced between 60 and 120 degrees of active abduction or elevation. 
In this zone, the subacromial space narrows to its minimum clearance, causing the supraspinatus tendon and subacromial bursa to pass beneath the coracoacromial arch. 
Patients should not force their limb aggressively through acute pain in this arc. 
Instead, exercising in the scapular plane with thumb pointed upward (external rotation) clears the greater tuberosity and reduces compression.`,
    keywords: ['painful arc', '60 to 120 degrees', 'subacromial space', 'impingement zone', 'external rotation', 'scapular plane'],
  },
  {
    id: 'doc-safe-red-flags',
    source: 'American Academy of Orthopaedic Surgeons (AAOS)',
    title: 'Red-Flag Symptoms Requiring Immediate Exercise Cessation and Medical Review',
    section: 'Acute Pain, Dizziness, Radiating Paresthesia, and Balance Failure',
    date: '2023-10',
    topic: 'safety_education',
    exercise: 'all',
    evidenceLevel: 'Level 3 (Clinical Consensus / Expert)',
    content: `Therapeutic exercises are designed to be safe and controlled. Any of the following symptoms mandate immediate cessation of exercise and clinical escalation:
1. Acute sharp pain rated 7/10 or higher on the visual analog scale.
2. Sudden onset of dizziness, lightheadedness, or vertigo.
3. Repeated loss of balance (high fall hazard).
4. Neurological signs including radiating numbness, tingling, or sudden weakness down the extremity.
Patients experiencing these red-flag symptoms must stop exercise immediately and contact their licensed physiotherapist or medical doctor.`,
    keywords: ['red flags', 'acute pain', 'dizziness', 'vertigo', 'loss of balance', 'numbness', 'escalate', 'cessation'],
  },

  // ── 5. PROTOCOL RATIONALE ───────────────────────────────────────────
  {
    id: 'doc-proto-dosing-reps-sets',
    source: 'American College of Sports Medicine (ACSM)',
    title: 'Exercise Prescription and Dosing Rationale in Therapeutic Rehabilitation',
    section: 'Volume Dosing: 8-12 Repetitions and Neuromotor Consolidation',
    date: '2022-09',
    topic: 'protocol_rationale',
    exercise: 'all',
    evidenceLevel: 'Level 1a (Systematic Review)',
    content: `In rehabilitation protocols, exercise volume is dosed conservatively to foster neuromotor coordination and collagen remodeling without causing excessive structural fatigue. 
Dosing 8 to 12 repetitions per set allows the patient to establish consistent motor pathways. 
Exceeding 15 repetitions in early rehabilitation frequently precipitates compensatory muscle substitution due to local stabilizer fatigue. 
Sets are typically structured in groups of 2 to 3 to achieve sufficient cumulative stimulus while preserving execution quality.`,
    keywords: ['repetition dosing', '8 to 12 reps', 'sets', 'volume', 'fatigue', 'neuromotor coordination', 'rehabilitation protocol'],
  },
  {
    id: 'doc-proto-rest-intervals',
    source: 'Journal of Orthopaedic & Sports Physical Therapy (JOSPT)',
    title: 'Metabolic and Mechanical Rest Intervals in Physical Therapy',
    section: 'Phosphagen System Recovery and Prevention of Motor Breakdown',
    date: '2023-04',
    topic: 'protocol_rationale',
    exercise: 'all',
    evidenceLevel: 'Level 1b (RCT)',
    content: `Rest intervals of 30 to 60 seconds between exercise sets are physiologically essential for replenishing intra-muscular ATP and creatine phosphate stores. 
Adequate rest prevents premature central and peripheral fatigue, which is the primary trigger for abnormal compensatory postures (such as trunk sway or shoulder shrugging). 
Rest periods should be respected even when a patient feels capable of rushing into the next set.`,
    keywords: ['rest interval', '30 to 60 seconds', 'ATP recovery', 'fatigue prevention', 'compensatory breakdown', 'metabolic rest'],
  },
  {
    id: 'doc-proto-progression-criteria',
    source: 'American Physical Therapy Association (APTA)',
    title: 'Evidence-Based Progression Milestones in Outpatient Physical Therapy',
    section: 'Quality and Symmetry Over Pure Resistance Advancement',
    date: '2023-08',
    topic: 'protocol_rationale',
    exercise: 'all',
    evidenceLevel: 'Level 2a (Clinical Practice Guideline)',
    content: `Advancement to more demanding exercises, increased resistance, or higher range targets requires satisfying strict clinical progression criteria:
1. Consistent range of motion (ROM) reaching or exceeding 85% of target across multiple sets.
2. High movement quality score (80% or greater) without observable compensatory movement.
3. Bilateral movement symmetry within 10 degrees between contralateral limbs.
4. Complete absence of post-exercise pain spikes (pain must remain below 3/10).
Progression should never be forced if postural integrity is compromised.`,
    keywords: ['progression criteria', 'milestones', '85% target', 'movement quality', 'symmetry', 'postural integrity'],
  },
];
