/**
 * inspectPhysioDataset.mjs
 * Development inspection and metadata generator for PHYSIO-DATASET benchmark data.
 *
 * Usage:
 *   node scripts/inspectPhysioDataset.mjs
 *   node scripts/inspectPhysioDataset.mjs --dataset-root="D:\PhysiosisData\PHYSIO-DATASET\PHYSIO-DATASET_blur_augment"
 *
 * Performs safe, read-only audit of dataset folders, file counts, laterality,
 * and media formats without modifying any raw dataset files on disk.
 * Generates `src/data/physioDatasetIndex.json`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── 9 Registered Benchmark Protocols ─────────────────────────────────────────
const DATASET_INDEX_SCHEMA = [
  {
    exerciseId: 'ankle_plantar_flexion',
    name: 'Ankle Plantar Flexion',
    targetFolder: 'ankle',
    aliases: ['ankle', 'Ankle_Plantar_Flexion', 'Ankle Plantar Flexion'],
    laterality: 'bilateral',
    expectedSubfolders: [],
  },
  {
    exerciseId: 'arm_circumduction',
    name: 'Arm Circumduction',
    targetFolder: 'Arm_Circumduction',
    aliases: ['Arm_Circumduction', 'Arm Circumduction'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'ball_press',
    name: 'Ball Press',
    targetFolder: 'ballpress',
    aliases: ['ballpress', 'Ball_Press', 'Ball Press'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'cross_body_shoulder_stretch',
    name: 'Cross-Body Shoulder Stretch',
    targetFolder: 'cross-body_shoulder_stretch',
    aliases: ['cross-body_shoulder_stretch', 'Cross_Body_Shoulder_Stretch', 'Cross-Body Shoulder Stretch'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'isometric_rotation',
    name: 'Isometric Rotation',
    targetFolder: 'isoelectric_rotation',
    aliases: ['isoetric_rotation', 'isoelectric_rotation', 'Isometric_Rotation', 'Isometric Rotation'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'isometric_side_bending',
    name: 'Isometric Side Bending',
    targetFolder: 'isoelectric_side_bending',
    aliases: ['isoetric_side_bending', 'isoelectric_side_bending', 'Isometric_Side_Bending', 'Isometric Side Bending'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'shoulder_abduction',
    name: 'Shoulder Abduction',
    targetFolder: 'Shoulder_Abduction',
    aliases: ['Shoulder_Abduction', 'Shoulder Abduction'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'shoulder_flexion',
    name: 'Shoulder Flexion',
    targetFolder: 'Shoulder_Flexion',
    aliases: ['Shoulder_Flexion', 'Shoulder Flexion'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
  {
    exerciseId: 'wrist_extension_stretch',
    name: 'Wrist Extension Stretch',
    targetFolder: 'Wrist-extension-stretch',
    aliases: ['Wrist-extension-stretch', 'Wrist_Extension_Stretch', 'Wrist Extension Stretch'],
    laterality: 'left/right',
    expectedSubfolders: ['LEFT', 'RIGHT'],
  },
];

// Resolve dataset root
let datasetRoot = process.env.PHYSIO_DATASET_ROOT || '';
const rootArg = process.argv.find((arg) => arg.startsWith('--dataset-root='));
if (rootArg) {
  datasetRoot = rootArg.split('=')[1].replace(/^["']|["']$/g, '');
}

// Fallback search paths on local workstation
if (!datasetRoot || !fs.existsSync(datasetRoot)) {
  const candidates = [
    'D:\\PhysiosisData\\PHYSIO-DATASET\\PHYSIO-DATASET_blur_augment',
    'D:\\PhysiosisData\\PHYSIO-DATASET\\PHYIO-DATASET_blur_augment',
    'D:\\PhysiosisData\\PHYSIO-DATASET',
    'C:\\PhysiosisData\\PHYSIO-DATASET',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      datasetRoot = c;
      break;
    }
  }
}

console.log('========================================================================================');
console.log('PHYSIOSIS — PHYSIO-DATASET AUDIT & LIGHTWEIGHT INDEX GENERATOR');
console.log('========================================================================================\n');
console.log(`[Config] Dataset Root: ${datasetRoot || '(Not mounted)'}`);
console.log(`[Config] Reference Dataset: PHYSIO-DATASET (Augmented Benchmark)`);
console.log(`[Policy] Read-only inspection mode — zero raw media copied to frontend bundle.\n`);

const isMounted = Boolean(datasetRoot && fs.existsSync(datasetRoot));

// Audit storage metrics
function auditFolder(folderPath) {
  let fileCount = 0;
  let byteSize = 0;
  const extensions = new Set();
  const subdirs = [];
  const sampleFiles = [];
  const subfolderStats = {};

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(folderPath, ent.name);
      if (ent.isDirectory()) {
        subdirs.push(ent.name);
        const subFiles = fs.readdirSync(full, { withFileTypes: true });
        let subCount = 0;
        let subBytes = 0;
        for (const subEnt of subFiles) {
          if (subEnt.isFile()) {
            subCount++;
            fileCount++;
            const stat = fs.statSync(path.join(full, subEnt.name));
            subBytes += stat.size;
            byteSize += stat.size;
            const ext = path.extname(subEnt.name).toLowerCase();
            if (ext) extensions.add(ext);
            if (sampleFiles.length < 2) sampleFiles.push(path.join(ent.name, subEnt.name));
          }
        }
        subfolderStats[ent.name] = { count: subCount, sizeMB: (subBytes / (1024 * 1024)).toFixed(1) };
      } else if (ent.isFile()) {
        fileCount++;
        const stat = fs.statSync(full);
        byteSize += stat.size;
        const ext = path.extname(ent.name).toLowerCase();
        if (ext) extensions.add(ext);
        if (sampleFiles.length < 2) sampleFiles.push(ent.name);
      }
    }
  } catch (err) {
    console.error(`Error reading ${folderPath}:`, err.message);
  }

  return {
    fileCount,
    sizeMB: (byteSize / (1024 * 1024)).toFixed(1),
    sizeBytes: byteSize,
    extensions: Array.from(extensions),
    subdirs,
    subfolderStats,
    sampleFiles,
  };
}

let totalDatasetBytes = 0;
let totalDatasetFiles = 0;
let foldersFoundCount = 0;
const generatedIndex = [];

console.log('------------------------------------------------------------------------------------------------------------------');
console.log(
  'EXERCISE NAME'.padEnd(30) +
  'ACTUAL FOLDER'.padEnd(30) +
  'LATERALITY'.padEnd(14) +
  'FILES'.padEnd(8) +
  'SIZE (MB)'.padEnd(12) +
  'SUBFOLDERS'
);
console.log('------------------------------------------------------------------------------------------------------------------');

for (const item of DATASET_INDEX_SCHEMA) {
  let matchedFolder = null;
  let audit = {
    fileCount: 0,
    sizeMB: '0.0',
    sizeBytes: 0,
    extensions: ['.mp4'],
    subdirs: item.expectedSubfolders,
    subfolderStats: {},
    sampleFiles: [],
  };

  if (isMounted) {
    for (const cand of item.aliases) {
      const full = path.join(datasetRoot, cand);
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        matchedFolder = cand;
        audit = auditFolder(full);
        foldersFoundCount++;
        totalDatasetBytes += audit.sizeBytes;
        totalDatasetFiles += audit.fileCount;
        break;
      }
    }
  }

  const folderDisplayName = matchedFolder || `[MISSING: ${item.targetFolder}]`;
  const subfolderDisplay = audit.subdirs.length > 0 ? audit.subdirs.join(', ') : '(flat)';

  console.log(
    item.name.padEnd(30) +
    folderDisplayName.padEnd(30) +
    item.laterality.padEnd(14) +
    String(audit.fileCount).padEnd(8) +
    String(audit.sizeMB).padEnd(12) +
    subfolderDisplay
  );

  generatedIndex.push({
    exerciseId: item.exerciseId,
    name: item.name,
    folder: matchedFolder || item.targetFolder,
    actualDiskFolder: matchedFolder,
    laterality: item.laterality,
    fileCount: audit.fileCount,
    sizeMB: parseFloat(audit.sizeMB),
    mediaType: audit.extensions.length > 0 ? audit.extensions.join(', ') : '.mp4',
    subfolders: audit.subdirs,
    subfolderBreakdown: audit.subfolderStats,
    available: Boolean(matchedFolder && audit.fileCount > 0),
    sampleFiles: audit.sampleFiles,
  });
}

console.log('------------------------------------------------------------------------------------------------------------------\n');

// Print Visual ASCII Tree
console.log('--- VISUAL DATASET DIRECTORY TREE ---');
console.log(`PHYSIO-DATASET (${datasetRoot || 'Not Mounted'})`);
for (let i = 0; i < generatedIndex.length; i++) {
  const item = generatedIndex[i];
  const isLast = i === generatedIndex.length - 1;
  const branch = isLast ? '└── ' : '├── ';
  const indent = isLast ? '    ' : '│   ';

  console.log(`${branch}${item.folder} [${item.fileCount} files, ${item.sizeMB} MB, ${item.laterality}]`);
  if (item.subfolders && item.subfolders.length > 0) {
    for (let j = 0; j < item.subfolders.length; j++) {
      const sub = item.subfolders[j];
      const subIsLast = j === item.subfolders.length - 1;
      const subBranch = subIsLast ? '└── ' : '├── ';
      const subStats = item.subfolderBreakdown[sub];
      const countStr = subStats ? ` (${subStats.count} files, ${subStats.sizeMB} MB)` : '';
      console.log(`${indent}${subBranch}${sub}${countStr}`);
    }
  }
}
console.log('\n========================================================================================');
console.log(`DATASET AUDIT SUMMARY:`);
console.log(`• Total Exercise Folders Found: ${foldersFoundCount} / ${DATASET_INDEX_SCHEMA.length}`);
console.log(`• Total Video Files: ${totalDatasetFiles}`);
console.log(`• Total Dataset Size: ${(totalDatasetBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
console.log('========================================================================================\n');

// ── Write Lightweight Metadata Index to src/data/physioDatasetIndex.json ────
const indexPath = path.join(PROJECT_ROOT, 'src', 'data', 'physioDatasetIndex.json');
const indexPayload = {
  _comment: 'Lightweight reference metadata index for PHYSIO-DATASET. Do NOT embed raw video binaries.',
  generatedAt: new Date().toISOString(),
  datasetName: 'PHYSIO-DATASET',
  datasetRoot: datasetRoot,
  totalFiles: totalDatasetFiles,
  totalSizeGB: parseFloat((totalDatasetBytes / (1024 * 1024 * 1024)).toFixed(2)),
  exercises: generatedIndex,
};

fs.writeFileSync(indexPath, JSON.stringify(indexPayload, null, 2), 'utf-8');
console.log(`[Index] Generated lightweight JSON index at: ${indexPath}`);
