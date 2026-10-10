/**
 * SkeletonRig.ts
 * Professional 3D Biomechanics Anatomical Human Skeletal Model.
 *
 * Engineering & Aesthetic Principles:
 *   1. Scientific Biomechanical Visual Quality: Rounded tapered volumetric capsules, segmented spine,
 *      pelvic girdle, contoured clavicles, simplified anatomical hands/feet.
 *   2. Interactive 3D Body Map: Every bone/joint is tagged with its BodyRegionId for seamless raycast hover/click.
 *   3. PBR Clinical Materials: Porcelain-titanium neutral bone, cyan active joint illumination,
 *      selective amber limitation pulse, emerald success state, and subtle hover highlights.
 *   4. Zero-Allocation 60fps Pipeline: Pre-allocated shared geometry cache, matrix-based orientation updates.
 *   5. Ghost Target Overlay: Semi-transparent cyan silhouette for visual reference comparison.
 */

import * as THREE from 'three';
import type { SkeletonPose3D, JointName3D } from './SkeletonPose3D';

export type JointHighlightStyle = 'active' | 'limitation' | 'success' | 'hover' | 'compensation' | 'none';

export type BodyRegionId =
  | 'head'
  | 'shoulders'
  | 'arms'
  | 'wrists'
  | 'spine'
  | 'hips'
  | 'knees'
  | 'ankles';

interface BoneSegment {
  name: string;
  fromKey: JointName3D;
  toKey: JointName3D;
  mesh: THREE.Mesh;
  radiusTop: number;
  radiusBottom: number;
  isGhost?: boolean;
  bodyRegion?: BodyRegionId;
}

const _UP_VEC = new THREE.Vector3(0, 1, 0);
const _DIR_VEC = new THREE.Vector3();
const _CENTER_POS_VEC = new THREE.Vector3();
const _ALL_JOINT_KEYS: readonly JointName3D[] = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'rightHip',
  'rightKnee',
  'rightAnkle',
];

export class SkeletonRig {
  public readonly group: THREE.Group;
  public readonly ghostGroup: THREE.Group;

  // Shared geometry cache for 60fps performance (zero runtime allocations)
  private readonly jointSphereGeom: THREE.SphereGeometry;
  private readonly largeJointGeom: THREE.SphereGeometry;
  private readonly headGeom: THREE.SphereGeometry;
  private readonly jawGeom: THREE.BoxGeometry;
  private readonly handGeom: THREE.BoxGeometry;
  private readonly footGeom: THREE.BoxGeometry;
  private readonly vertebraGeom: THREE.CylinderGeometry;
  private readonly pelvisWingGeom: THREE.TorusGeometry;
  private readonly ribGeom: THREE.TorusGeometry;

  // Primary Clinical PBR Materials
  private readonly neutralBoneMat: THREE.MeshStandardMaterial;
  private readonly neutralJointMat: THREE.MeshStandardMaterial;
  private readonly activeJointMat: THREE.MeshStandardMaterial;
  private readonly activeBoneMat: THREE.MeshStandardMaterial;
  private readonly limitationJointMat: THREE.MeshStandardMaterial;
  private readonly limitationBoneMat: THREE.MeshStandardMaterial;
  private readonly successJointMat: THREE.MeshStandardMaterial;
  private readonly successBoneMat: THREE.MeshStandardMaterial;
  private readonly hoverJointMat: THREE.MeshStandardMaterial;
  private readonly hoverBoneMat: THREE.MeshStandardMaterial;
  private readonly compensationJointMat: THREE.MeshStandardMaterial;
  private readonly compensationBoneMat: THREE.MeshStandardMaterial;

  // Ghost Reference Materials (Semi-transparent cyan silhouette)
  private readonly ghostJointMat: THREE.MeshStandardMaterial;
  private readonly ghostBoneMat: THREE.MeshStandardMaterial;

  // Primary Mesh Nodes
  private readonly jointMeshes: Map<JointName3D, THREE.Mesh> = new Map();
  private readonly boneSegments: BoneSegment[] = [];
  private readonly spineVertebrae: THREE.Mesh[] = [];
  private readonly ribMeshes: THREE.Mesh[] = [];
  private readonly pelvisMeshes: THREE.Mesh[] = [];
  private leftHandMesh!: THREE.Mesh;
  private rightHandMesh!: THREE.Mesh;
  private leftFootMesh!: THREE.Mesh;
  private rightFootMesh!: THREE.Mesh;
  private jawMesh!: THREE.Mesh;

  // Ghost Mesh Nodes
  private readonly ghostJointMeshes: Map<JointName3D, THREE.Mesh> = new Map();
  private readonly ghostBoneSegments: BoneSegment[] = [];
  private readonly ghostSpineVertebrae: THREE.Mesh[] = [];
  private readonly ghostRibMeshes: THREE.Mesh[] = [];
  private readonly ghostPelvisMeshes: THREE.Mesh[] = [];
  private ghostLeftHandMesh!: THREE.Mesh;
  private ghostRightHandMesh!: THREE.Mesh;
  private ghostLeftFootMesh!: THREE.Mesh;
  private ghostRightFootMesh!: THREE.Mesh;
  private ghostJawMesh!: THREE.Mesh;

  // Raycasting hit collection
  private readonly raycastMeshes: THREE.Mesh[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Physiosis_Biomechanics_Skeleton_3D';

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = 'Physiosis_Target_Ghost_Skeleton_3D';
    this.ghostGroup.visible = false;
    this.group.add(this.ghostGroup);

    // 1. Shared Geometry Library
    this.jointSphereGeom = new THREE.SphereGeometry(1, 20, 16);
    this.largeJointGeom = new THREE.SphereGeometry(1, 24, 18);
    this.headGeom = new THREE.SphereGeometry(1, 28, 22);
    this.jawGeom = new THREE.BoxGeometry(0.08, 0.05, 0.09);
    this.handGeom = new THREE.BoxGeometry(0.052, 0.085, 0.016);
    this.footGeom = new THREE.BoxGeometry(0.068, 0.038, 0.15);
    this.vertebraGeom = new THREE.CylinderGeometry(0.038, 0.038, 0.022, 16);
    this.pelvisWingGeom = new THREE.TorusGeometry(0.09, 0.022, 12, 24, Math.PI * 0.85);
    this.ribGeom = new THREE.TorusGeometry(0.12, 0.012, 10, 24, Math.PI * 0.9);

    // 2. PBR Clinical Materials
    this.neutralBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd6e2ec),
      roughness: 0.32,
      metalness: 0.08,
      flatShading: false,
    });

    this.neutralJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xb4c9dc),
      roughness: 0.26,
      metalness: 0.12,
    });

    this.activeJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00e5ff),
      emissive: new THREE.Color(0x008da6),
      emissiveIntensity: 0.65,
      roughness: 0.20,
      metalness: 0.25,
    });

    this.activeBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x40eaff),
      roughness: 0.28,
      metalness: 0.18,
    });

    this.hoverJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00e5ff),
      emissive: new THREE.Color(0x005b6b),
      emissiveIntensity: 0.45,
      roughness: 0.22,
    });

    this.hoverBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8aeaff),
      roughness: 0.28,
    });

    this.limitationJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffa726),
      emissive: new THREE.Color(0xb36200),
      emissiveIntensity: 0.70,
      roughness: 0.20,
    });

    this.limitationBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffb74d),
      roughness: 0.28,
    });

    this.successJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00e676),
      emissive: new THREE.Color(0x008033),
      emissiveIntensity: 0.70,
      roughness: 0.20,
    });

    this.successBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x33eb88),
      roughness: 0.28,
    });

    this.compensationJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xff5252),
      emissive: new THREE.Color(0xd50000),
      emissiveIntensity: 0.85,
      roughness: 0.18,
    });

    this.compensationBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xff6e40),
      emissive: new THREE.Color(0xbf360c),
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });

    // Ghost Materials (Semi-transparent cyan silhouette)
    this.ghostJointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00e5ff),
      transparent: true,
      opacity: 0.28,
      roughness: 0.55,
      depthWrite: false,
    });

    this.ghostBoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00b8d4),
      transparent: true,
      opacity: 0.20,
      roughness: 0.55,
      depthWrite: false,
    });

    // 3. Build Anatomical Models
    this.buildPrimarySkeleton();
    this.buildGhostSkeleton();
  }

  /**
   * Helper: Builds a volumetric tapered bone segment with rounded capsule caps.
   */
  private createBoneSegment(
    name: string,
    fromKey: JointName3D,
    toKey: JointName3D,
    radiusTop: number,
    radiusBottom: number,
    isGhost: boolean = false,
    bodyRegion?: BodyRegionId
  ): BoneSegment {
    const parentGroup = isGhost ? this.ghostGroup : this.group;
    const material = isGhost ? this.ghostBoneMat : this.neutralBoneMat;

    const cylGeom = new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 18, 1);
    cylGeom.translate(0, 0.5, 0);

    const mesh = new THREE.Mesh(cylGeom, material);
    mesh.name = `${isGhost ? 'ghost_' : ''}bone_${name}`;
    mesh.castShadow = !isGhost;
    mesh.receiveShadow = !isGhost;

    if (!isGhost && bodyRegion) {
      mesh.userData.bodyRegion = bodyRegion;
      this.raycastMeshes.push(mesh);
    }

    const segment: BoneSegment = {
      name,
      fromKey,
      toKey,
      mesh,
      radiusTop,
      radiusBottom,
      isGhost,
      bodyRegion,
    };

    parentGroup.add(mesh);
    return segment;
  }

  /**
   * Constructs the full primary anatomical human skeleton rig with tagged BodyRegionIds.
   */
  private buildPrimarySkeleton(): void {
    // ── 1. Articulating Joint Nodes ──
    const jointConfig: Record<JointName3D, { radius: number; region: BodyRegionId }> = {
      pelvis: { radius: 0.052, region: 'hips' },
      spine: { radius: 0.044, region: 'spine' },
      chest: { radius: 0.048, region: 'spine' },
      neck: { radius: 0.034, region: 'head' },
      head: { radius: 0.088, region: 'head' },

      leftShoulder: { radius: 0.046, region: 'shoulders' },
      leftElbow: { radius: 0.036, region: 'arms' },
      leftWrist: { radius: 0.026, region: 'wrists' },

      rightShoulder: { radius: 0.046, region: 'shoulders' },
      rightElbow: { radius: 0.036, region: 'arms' },
      rightWrist: { radius: 0.026, region: 'wrists' },

      leftHip: { radius: 0.048, region: 'hips' },
      leftKnee: { radius: 0.042, region: 'knees' },
      leftAnkle: { radius: 0.032, region: 'ankles' },

      rightHip: { radius: 0.048, region: 'hips' },
      rightKnee: { radius: 0.042, region: 'knees' },
      rightAnkle: { radius: 0.032, region: 'ankles' },
    };

    (Object.keys(jointConfig) as JointName3D[]).forEach((key) => {
      const conf = jointConfig[key];
      const geom = key === 'head' ? this.headGeom : this.jointSphereGeom;
      const mesh = new THREE.Mesh(geom, this.neutralJointMat);
      mesh.name = `joint_${key}`;
      mesh.scale.set(conf.radius, key === 'head' ? conf.radius * 1.16 : conf.radius, conf.radius);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.bodyRegion = conf.region;
      mesh.userData.jointKey = key;
      this.raycastMeshes.push(mesh);
      this.jointMeshes.set(key, mesh);
      this.group.add(mesh);
    });

    // Cranium Jaw contour
    this.jawMesh = new THREE.Mesh(this.jawGeom, this.neutralBoneMat);
    this.jawMesh.castShadow = true;
    this.jawMesh.userData.bodyRegion = 'head';
    this.raycastMeshes.push(this.jawMesh);
    this.group.add(this.jawMesh);

    // ── 2. Segmented Spinal Vertebrae ──
    for (let i = 0; i < 6; i++) {
      const vert = new THREE.Mesh(this.vertebraGeom, this.neutralBoneMat);
      vert.castShadow = true;
      vert.userData.bodyRegion = 'spine';
      this.spineVertebrae.push(vert);
      this.raycastMeshes.push(vert);
      this.group.add(vert);
    }

    // ── 3. Anatomical Thoracic Rib Arches ──
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(this.ribGeom, this.neutralBoneMat);
      rib.castShadow = true;
      rib.userData.bodyRegion = 'spine';
      this.ribMeshes.push(rib);
      this.raycastMeshes.push(rib);
      this.group.add(rib);
    }

    // ── 4. Pelvic Girdle Wings & Sacrum ──
    const leftIliac = new THREE.Mesh(this.pelvisWingGeom, this.neutralBoneMat);
    const rightIliac = new THREE.Mesh(this.pelvisWingGeom, this.neutralBoneMat);
    leftIliac.castShadow = true;
    rightIliac.castShadow = true;
    leftIliac.userData.bodyRegion = 'hips';
    rightIliac.userData.bodyRegion = 'hips';
    this.pelvisMeshes.push(leftIliac, rightIliac);
    this.raycastMeshes.push(leftIliac, rightIliac);
    this.group.add(leftIliac, rightIliac);

    // ── 5. Hands and Feet Simplified Anatomical Shapes ──
    this.leftHandMesh = new THREE.Mesh(this.handGeom, this.neutralBoneMat);
    this.rightHandMesh = new THREE.Mesh(this.handGeom, this.neutralBoneMat);
    this.leftFootMesh = new THREE.Mesh(this.footGeom, this.neutralBoneMat);
    this.rightFootMesh = new THREE.Mesh(this.footGeom, this.neutralBoneMat);

    this.leftHandMesh.userData.bodyRegion = 'wrists';
    this.rightHandMesh.userData.bodyRegion = 'wrists';
    this.leftFootMesh.userData.bodyRegion = 'ankles';
    this.rightFootMesh.userData.bodyRegion = 'ankles';

    this.leftHandMesh.castShadow = true;
    this.rightHandMesh.castShadow = true;
    this.leftFootMesh.castShadow = true;
    this.rightFootMesh.castShadow = true;

    this.raycastMeshes.push(this.leftHandMesh, this.rightHandMesh, this.leftFootMesh, this.rightFootMesh);
    this.group.add(this.leftHandMesh, this.rightHandMesh, this.leftFootMesh, this.rightFootMesh);

    // ── 6. Tapered Anatomical Bone Segments ──
    const addBone = (
      name: string,
      fromKey: JointName3D,
      toKey: JointName3D,
      radiusTop: number,
      radiusBottom: number,
      region: BodyRegionId
    ) => {
      this.boneSegments.push(
        this.createBoneSegment(name, fromKey, toKey, radiusTop, radiusBottom, false, region)
      );
    };

    // Torso Column
    addBone('pelvis_to_spine', 'pelvis', 'spine', 0.036, 0.042, 'spine');
    addBone('spine_to_chest', 'spine', 'chest', 0.042, 0.036, 'spine');
    addBone('chest_to_neck', 'chest', 'neck', 0.028, 0.036, 'head');
    addBone('neck_to_head', 'neck', 'head', 0.024, 0.028, 'head');

    // Clavicular Girdle (Contoured shoulders)
    addBone('chest_to_lShoulder', 'chest', 'leftShoulder', 0.026, 0.034, 'shoulders');
    addBone('chest_to_rShoulder', 'chest', 'rightShoulder', 0.026, 0.034, 'shoulders');

    // Pelvic-Femoral Bridge
    addBone('pelvis_to_lHip', 'pelvis', 'leftHip', 0.034, 0.040, 'hips');
    addBone('pelvis_to_rHip', 'pelvis', 'rightHip', 0.034, 0.040, 'hips');

    // Upper Limbs (Tapered Humerus & Forearm)
    addBone('l_upper_arm', 'leftShoulder', 'leftElbow', 0.036, 0.028, 'arms');
    addBone('l_forearm', 'leftElbow', 'leftWrist', 0.028, 0.020, 'arms');
    addBone('r_upper_arm', 'rightShoulder', 'rightElbow', 0.036, 0.028, 'arms');
    addBone('r_forearm', 'rightElbow', 'rightWrist', 0.028, 0.020, 'arms');

    // Lower Limbs (Tapered Femur & Tibia)
    addBone('l_thigh', 'leftHip', 'leftKnee', 0.044, 0.034, 'knees');
    addBone('l_shin', 'leftKnee', 'leftAnkle', 0.034, 0.026, 'ankles');
    addBone('r_thigh', 'rightHip', 'rightKnee', 0.044, 0.034, 'knees');
    addBone('r_shin', 'rightKnee', 'rightAnkle', 0.034, 0.026, 'ankles');
  }

  /**
   * Constructs the semi-transparent Target Ghost skeleton rig.
   */
  private buildGhostSkeleton(): void {
    const jointRadii: Record<JointName3D, number> = {
      pelvis: 0.048,
      spine: 0.040,
      chest: 0.044,
      neck: 0.030,
      head: 0.082,
      leftShoulder: 0.042,
      leftElbow: 0.032,
      leftWrist: 0.024,
      rightShoulder: 0.042,
      rightElbow: 0.032,
      rightWrist: 0.024,
      leftHip: 0.044,
      leftKnee: 0.038,
      leftAnkle: 0.028,
      rightHip: 0.044,
      rightKnee: 0.038,
      rightAnkle: 0.028,
    };

    (Object.keys(jointRadii) as JointName3D[]).forEach((key) => {
      const radius = jointRadii[key];
      const geom = key === 'head' ? this.headGeom : this.jointSphereGeom;
      const mesh = new THREE.Mesh(geom, this.ghostJointMat);
      mesh.name = `ghost_joint_${key}`;
      mesh.scale.set(radius, key === 'head' ? radius * 1.16 : radius, radius);
      this.ghostJointMeshes.set(key, mesh);
      this.ghostGroup.add(mesh);
    });

    this.ghostJawMesh = new THREE.Mesh(this.jawGeom, this.ghostBoneMat);
    this.ghostGroup.add(this.ghostJawMesh);

    for (let i = 0; i < 6; i++) {
      const vert = new THREE.Mesh(this.vertebraGeom, this.ghostBoneMat);
      this.ghostSpineVertebrae.push(vert);
      this.ghostGroup.add(vert);
    }

    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(this.ribGeom, this.ghostBoneMat);
      this.ghostRibMeshes.push(rib);
      this.ghostGroup.add(rib);
    }

    const ghostLeftIliac = new THREE.Mesh(this.pelvisWingGeom, this.ghostBoneMat);
    const ghostRightIliac = new THREE.Mesh(this.pelvisWingGeom, this.ghostBoneMat);
    this.ghostPelvisMeshes.push(ghostLeftIliac, ghostRightIliac);
    this.ghostGroup.add(ghostLeftIliac, ghostRightIliac);

    this.ghostLeftHandMesh = new THREE.Mesh(this.handGeom, this.ghostBoneMat);
    this.ghostRightHandMesh = new THREE.Mesh(this.handGeom, this.ghostBoneMat);
    this.ghostLeftFootMesh = new THREE.Mesh(this.footGeom, this.ghostBoneMat);
    this.ghostRightFootMesh = new THREE.Mesh(this.footGeom, this.ghostBoneMat);
    this.ghostGroup.add(
      this.ghostLeftHandMesh,
      this.ghostRightHandMesh,
      this.ghostLeftFootMesh,
      this.ghostRightFootMesh
    );

    const addGhostBone = (
      name: string,
      fromKey: JointName3D,
      toKey: JointName3D,
      radiusTop: number,
      radiusBottom: number
    ) => {
      this.ghostBoneSegments.push(
        this.createBoneSegment(name, fromKey, toKey, radiusTop, radiusBottom, true)
      );
    };

    addGhostBone('pelvis_to_spine', 'pelvis', 'spine', 0.032, 0.038);
    addGhostBone('spine_to_chest', 'spine', 'chest', 0.038, 0.032);
    addGhostBone('chest_to_neck', 'chest', 'neck', 0.024, 0.032);
    addGhostBone('neck_to_head', 'neck', 'head', 0.022, 0.024);

    addGhostBone('chest_to_lShoulder', 'chest', 'leftShoulder', 0.024, 0.030);
    addGhostBone('chest_to_rShoulder', 'chest', 'rightShoulder', 0.024, 0.030);

    addGhostBone('pelvis_to_lHip', 'pelvis', 'leftHip', 0.030, 0.036);
    addGhostBone('pelvis_to_rHip', 'pelvis', 'rightHip', 0.030, 0.036);

    addGhostBone('l_upper_arm', 'leftShoulder', 'leftElbow', 0.032, 0.024);
    addGhostBone('l_forearm', 'leftElbow', 'leftWrist', 0.024, 0.018);
    addGhostBone('r_upper_arm', 'rightShoulder', 'rightElbow', 0.032, 0.024);
    addGhostBone('r_forearm', 'rightElbow', 'rightWrist', 0.024, 0.018);

    addGhostBone('l_thigh', 'leftHip', 'leftKnee', 0.040, 0.030);
    addGhostBone('l_shin', 'leftKnee', 'leftAnkle', 0.030, 0.022);
    addGhostBone('r_thigh', 'rightHip', 'rightKnee', 0.040, 0.030);
    addGhostBone('r_shin', 'rightKnee', 'rightAnkle', 0.030, 0.022);
  }

  /**
   * Returns all interactive primary skeleton meshes for Raycasting.
   */
  public getRaycastMeshes(): THREE.Mesh[] {
    return this.raycastMeshes;
  }

  /**
   * Updates primary anatomical skeleton nodes at 60fps with zero runtime memory allocations.
   */
  public updatePose(pose: SkeletonPose3D): void {
    for (let i = 0; i < _ALL_JOINT_KEYS.length; i++) {
      const key = _ALL_JOINT_KEYS[i];
      const mesh = this.jointMeshes.get(key);
      const pos = pose[key];
      if (mesh && pos) {
        mesh.position.copy(pos);
      }
    }

    for (let i = 0; i < this.boneSegments.length; i++) {
      const segment = this.boneSegments[i];
      const pFrom = pose[segment.fromKey];
      const pTo = pose[segment.toKey];
      if (!pFrom || !pTo) continue;

      _DIR_VEC.subVectors(pTo, pFrom);
      const length = _DIR_VEC.length();

      segment.mesh.position.copy(pFrom);

      if (length > 1e-4) {
        _DIR_VEC.normalize();
        segment.mesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
        segment.mesh.scale.set(1, length, 1);
        segment.mesh.visible = true;
      } else {
        segment.mesh.visible = false;
      }
    }

    const pPelvis = pose.pelvis;
    const pSpine = pose.spine;
    const pChest = pose.chest;
    const pNeck = pose.neck;
    const pHead = pose.head;

    if (pPelvis && pSpine && pChest) {
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        this.spineVertebrae[i].position.lerpVectors(pPelvis, pSpine, t);
        this.spineVertebrae[i].position.z += Math.sin(t * Math.PI) * 0.015;
      }
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        this.spineVertebrae[3 + i].position.lerpVectors(pSpine, pChest, t);
        this.spineVertebrae[3 + i].position.z -= Math.sin(t * Math.PI) * 0.012;
      }

      const ribOffsets = [0.2, 0.5, 0.8];
      for (let r = 0; r < 3; r++) {
        const t = ribOffsets[r];
        _CENTER_POS_VEC.lerpVectors(pSpine, pChest, t);

        const leftRib = this.ribMeshes[r * 2];
        leftRib.position.set(_CENTER_POS_VEC.x + 0.04, _CENTER_POS_VEC.y, _CENTER_POS_VEC.z + 0.01);
        leftRib.rotation.set(0.2, -0.3, -0.4);

        const rightRib = this.ribMeshes[r * 2 + 1];
        rightRib.position.set(_CENTER_POS_VEC.x - 0.04, _CENTER_POS_VEC.y, _CENTER_POS_VEC.z + 0.01);
        rightRib.rotation.set(0.2, 0.3, 0.4);
      }
    }

    if (pPelvis && this.pelvisMeshes.length === 2) {
      this.pelvisMeshes[0].position.set(pPelvis.x + 0.06, pPelvis.y - 0.02, pPelvis.z);
      this.pelvisMeshes[0].rotation.set(Math.PI * 0.1, -Math.PI * 0.2, -Math.PI * 0.35);

      this.pelvisMeshes[1].position.set(pPelvis.x - 0.06, pPelvis.y - 0.02, pPelvis.z);
      this.pelvisMeshes[1].rotation.set(Math.PI * 0.1, Math.PI * 0.2, Math.PI * 0.35);
    }

    if (pHead && pNeck) {
      this.jawMesh.position.set(pHead.x, pHead.y - 0.045, pHead.z + 0.035);
      this.jawMesh.rotation.set(0.15, 0, 0);
    }

    if (pose.leftElbow && pose.leftWrist) {
      _DIR_VEC.subVectors(pose.leftWrist, pose.leftElbow).normalize();
      this.leftHandMesh.position.copy(pose.leftWrist).addScaledVector(_DIR_VEC, 0.045);
      this.leftHandMesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
    }
    if (pose.rightElbow && pose.rightWrist) {
      _DIR_VEC.subVectors(pose.rightWrist, pose.rightElbow).normalize();
      this.rightHandMesh.position.copy(pose.rightWrist).addScaledVector(_DIR_VEC, 0.045);
      this.rightHandMesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
    }

    if (pose.leftAnkle) {
      this.leftFootMesh.position.set(pose.leftAnkle.x, 0.02, pose.leftAnkle.z + 0.04);
      this.leftFootMesh.rotation.set(0, 0, 0);
    }
    if (pose.rightAnkle) {
      this.rightFootMesh.position.set(pose.rightAnkle.x, 0.02, pose.rightAnkle.z + 0.04);
      this.rightFootMesh.rotation.set(0, 0, 0);
    }
  }

  /**
   * Updates the semi-transparent Target Ghost skeleton pose.
   */
  public updateGhostPose(pose: SkeletonPose3D | null): void {
    if (!pose) {
      this.ghostGroup.visible = false;
      return;
    }

    this.ghostGroup.visible = true;

    for (let i = 0; i < _ALL_JOINT_KEYS.length; i++) {
      const key = _ALL_JOINT_KEYS[i];
      const mesh = this.ghostJointMeshes.get(key);
      const pos = pose[key];
      if (mesh && pos) {
        mesh.position.copy(pos);
      }
    }

    for (let i = 0; i < this.ghostBoneSegments.length; i++) {
      const segment = this.ghostBoneSegments[i];
      const pFrom = pose[segment.fromKey];
      const pTo = pose[segment.toKey];
      if (!pFrom || !pTo) continue;

      _DIR_VEC.subVectors(pTo, pFrom);
      const length = _DIR_VEC.length();

      segment.mesh.position.copy(pFrom);

      if (length > 1e-4) {
        _DIR_VEC.normalize();
        segment.mesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
        segment.mesh.scale.set(1, length, 1);
        segment.mesh.visible = true;
      } else {
        segment.mesh.visible = false;
      }
    }

    const pPelvis = pose.pelvis;
    const pSpine = pose.spine;
    const pChest = pose.chest;
    const pHead = pose.head;
    const pNeck = pose.neck;

    if (pPelvis && pSpine && pChest) {
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        this.ghostSpineVertebrae[i].position.lerpVectors(pPelvis, pSpine, t);
      }
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        this.ghostSpineVertebrae[3 + i].position.lerpVectors(pSpine, pChest, t);
      }
      const ribOffsets = [0.2, 0.5, 0.8];
      for (let r = 0; r < 3; r++) {
        const t = ribOffsets[r];
        _CENTER_POS_VEC.lerpVectors(pSpine, pChest, t);
        this.ghostRibMeshes[r * 2].position.set(_CENTER_POS_VEC.x + 0.04, _CENTER_POS_VEC.y, _CENTER_POS_VEC.z + 0.01);
        this.ghostRibMeshes[r * 2].rotation.set(0.2, -0.3, -0.4);
        this.ghostRibMeshes[r * 2 + 1].position.set(_CENTER_POS_VEC.x - 0.04, _CENTER_POS_VEC.y, _CENTER_POS_VEC.z + 0.01);
        this.ghostRibMeshes[r * 2 + 1].rotation.set(0.2, 0.3, 0.4);
      }
    }

    if (pPelvis && this.ghostPelvisMeshes.length === 2) {
      this.ghostPelvisMeshes[0].position.set(pPelvis.x + 0.06, pPelvis.y - 0.02, pPelvis.z);
      this.ghostPelvisMeshes[0].rotation.set(Math.PI * 0.1, -Math.PI * 0.2, -Math.PI * 0.35);
      this.ghostPelvisMeshes[1].position.set(pPelvis.x - 0.06, pPelvis.y - 0.02, pPelvis.z);
      this.ghostPelvisMeshes[1].rotation.set(Math.PI * 0.1, Math.PI * 0.2, Math.PI * 0.35);
    }

    if (pHead && pNeck) {
      this.ghostJawMesh.position.set(pHead.x, pHead.y - 0.045, pHead.z + 0.035);
    }

    if (pose.leftElbow && pose.leftWrist) {
      _DIR_VEC.subVectors(pose.leftWrist, pose.leftElbow).normalize();
      this.ghostLeftHandMesh.position.copy(pose.leftWrist).addScaledVector(_DIR_VEC, 0.045);
      this.ghostLeftHandMesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
    }
    if (pose.rightElbow && pose.rightWrist) {
      _DIR_VEC.subVectors(pose.rightWrist, pose.rightElbow).normalize();
      this.ghostRightHandMesh.position.copy(pose.rightWrist).addScaledVector(_DIR_VEC, 0.045);
      this.ghostRightHandMesh.quaternion.setFromUnitVectors(_UP_VEC, _DIR_VEC);
    }
    if (pose.leftAnkle) {
      this.ghostLeftFootMesh.position.set(pose.leftAnkle.x, 0.02, pose.leftAnkle.z + 0.04);
    }
    if (pose.rightAnkle) {
      this.ghostRightFootMesh.position.set(pose.rightAnkle.x, 0.02, pose.rightAnkle.z + 0.04);
    }
  }

  /**
   * Highlights a specific anatomical body region (for 3D Body Map hover/selection).
   */
  public setRegionHighlight(
    region: BodyRegionId | null,
    style: 'hover' | 'active' | 'none' = 'hover'
  ): void {
    if (!region || style === 'none') {
      this.resetMaterialsToNeutral();
      return;
    }

    const jointMat = style === 'hover' ? this.hoverJointMat : this.activeJointMat;
    const boneMat = style === 'hover' ? this.hoverBoneMat : this.activeBoneMat;

    this.raycastMeshes.forEach((mesh) => {
      if (mesh.userData.bodyRegion === region) {
        if (mesh.name.startsWith('joint_')) {
          mesh.material = jointMat;
        } else {
          mesh.material = boneMat;
        }
      }
    });
  }

  private resetMaterialsToNeutral(): void {
    this.jointMeshes.forEach((mesh) => {
      mesh.material = this.neutralJointMat;
    });
    for (const bone of this.boneSegments) {
      bone.mesh.material = this.neutralBoneMat;
    }
    this.leftHandMesh.material = this.neutralBoneMat;
    this.rightHandMesh.material = this.neutralBoneMat;
    this.leftFootMesh.material = this.neutralBoneMat;
    this.rightFootMesh.material = this.neutralBoneMat;
    this.jawMesh.material = this.neutralBoneMat;
    this.spineVertebrae.forEach((m) => (m.material = this.neutralBoneMat));
    this.ribMeshes.forEach((m) => (m.material = this.neutralBoneMat));
    this.pelvisMeshes.forEach((m) => (m.material = this.neutralBoneMat));
  }

  /**
   * Sets joint and limb segment visual highlights.
   */
  public setJointHighlight(
    joints: JointName3D[],
    style: JointHighlightStyle = 'active'
  ): void {
    this.resetMaterialsToNeutral();

    if (style === 'none' || joints.length === 0) return;

    let targetJointMat = this.activeJointMat;
    let targetBoneMat = this.activeBoneMat;

    if (style === 'limitation') {
      targetJointMat = this.limitationJointMat;
      targetBoneMat = this.limitationBoneMat;
    } else if (style === 'success') {
      targetJointMat = this.successJointMat;
      targetBoneMat = this.successBoneMat;
      // Subtly glow target ghost skeleton in success emerald
      this.ghostJointMeshes.forEach((mesh) => {
        mesh.material = this.successJointMat;
      });
      this.ghostBoneSegments.forEach((bone) => {
        bone.mesh.material = this.successBoneMat;
      });
    } else if (style === 'hover') {
      targetJointMat = this.hoverJointMat;
      targetBoneMat = this.hoverBoneMat;
    } else if (style === 'compensation') {
      targetJointMat = this.compensationJointMat;
      targetBoneMat = this.compensationBoneMat;
    }

    if (style !== 'success') {
      this.ghostJointMeshes.forEach((mesh) => {
        mesh.material = this.ghostJointMat;
      });
      this.ghostBoneSegments.forEach((bone) => {
        bone.mesh.material = this.ghostBoneMat;
      });
    }

    for (const jKey of joints) {
      const mesh = this.jointMeshes.get(jKey);
      if (mesh) {
        mesh.material = targetJointMat;
      }
    }

    const isLeftArmActive = joints.includes('leftShoulder') || joints.includes('leftElbow') || joints.includes('leftWrist');
    const isRightArmActive = joints.includes('rightShoulder') || joints.includes('rightElbow') || joints.includes('rightWrist');
    const isLeftLegActive = joints.includes('leftHip') || joints.includes('leftKnee') || joints.includes('leftAnkle');
    const isRightLegActive = joints.includes('rightHip') || joints.includes('rightKnee') || joints.includes('rightAnkle');
    const isSpineActive = joints.includes('spine') || joints.includes('chest') || joints.includes('neck') || joints.includes('head');

    for (const bone of this.boneSegments) {
      if (isLeftArmActive && (bone.name === 'chest_to_lShoulder' || bone.name === 'l_upper_arm' || bone.name === 'l_forearm')) {
        bone.mesh.material = targetBoneMat;
      }
      if (isRightArmActive && (bone.name === 'chest_to_rShoulder' || bone.name === 'r_upper_arm' || bone.name === 'r_forearm')) {
        bone.mesh.material = targetBoneMat;
      }
      if (isLeftLegActive && (bone.name === 'pelvis_to_lHip' || bone.name === 'l_thigh' || bone.name === 'l_shin')) {
        bone.mesh.material = targetBoneMat;
      }
      if (isRightLegActive && (bone.name === 'pelvis_to_rHip' || bone.name === 'r_thigh' || bone.name === 'r_shin')) {
        bone.mesh.material = targetBoneMat;
      }
      if (isSpineActive && (bone.name === 'pelvis_to_spine' || bone.name === 'spine_to_chest' || bone.name === 'chest_to_neck' || bone.name === 'neck_to_head')) {
        bone.mesh.material = targetBoneMat;
      }
    }

    if (isLeftArmActive) this.leftHandMesh.material = targetBoneMat;
    if (isRightArmActive) this.rightHandMesh.material = targetBoneMat;
    if (isLeftLegActive) this.leftFootMesh.material = targetBoneMat;
    if (isRightLegActive) this.rightFootMesh.material = targetBoneMat;
    if (isSpineActive) {
      this.spineVertebrae.forEach((m) => (m.material = targetBoneMat));
      this.ribMeshes.forEach((m) => (m.material = targetBoneMat));
    }
  }

  /**
   * Clean memory disposal of all geometries and materials.
   */
  public dispose(): void {
    this.jointSphereGeom.dispose();
    this.largeJointGeom.dispose();
    this.headGeom.dispose();
    this.jawGeom.dispose();
    this.handGeom.dispose();
    this.footGeom.dispose();
    this.vertebraGeom.dispose();
    this.pelvisWingGeom.dispose();
    this.ribGeom.dispose();

    this.neutralBoneMat.dispose();
    this.neutralJointMat.dispose();
    this.activeJointMat.dispose();
    this.activeBoneMat.dispose();
    this.hoverJointMat.dispose();
    this.hoverBoneMat.dispose();
    this.limitationJointMat.dispose();
    this.limitationBoneMat.dispose();
    this.successJointMat.dispose();
    this.successBoneMat.dispose();

    this.ghostJointMat.dispose();
    this.ghostBoneMat.dispose();

    for (const bone of this.boneSegments) {
      bone.mesh.geometry.dispose();
    }
    for (const bone of this.ghostBoneSegments) {
      bone.mesh.geometry.dispose();
    }
  }
}
