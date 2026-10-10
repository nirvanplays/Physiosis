# Physiosis 🦾

> **Intelligent Real-Time Computer Vision & Biomechanical Rehabilitation Platform**

[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r185-black?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Vision-0097A7?style=flat&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

---

## 🌟 Overview

**Physiosis** is a clinical-grade, AI-powered physiotherapy and rehabilitation companion designed to operate in real time through a standard webcam. It combines cutting-edge computer vision, forward kinematics, real-time kinetic compensation analysis, and clinical safety engines to guide patients through therapeutic exercise routines safely and accurately.

All sensor telemetry, joint range-of-motion (ROM), and postural integrity calculations run with strict mathematical veracity and deterministic safety guards.

---

## 🚀 Key Features

### 🎥 1. Multimodal Real-Time Pose Tracking & 3D Kinematics
- **Browser-Native Vision:** Real-time 33-point anatomical landmark estimation via Google MediaPipe Pose.
- **Interactive 3D Articulated Skeleton:** Live 3D kinetic avatar rendered with Three.js, demonstrating reference trajectory vs. patient movement simultaneously.
- **Accurate Joint Angle Estimation:** Multi-planar joint tracking across shoulder flexion/abduction, knee extension, straight leg raise, and isometric exercises.

### 🛡️ 2. Real-Time Clinical Safety & Red-Flag Escalation Engine
- **Hierarchical Safety States:** Real-time state machine enforcing `SAFE`, `CAUTION`, `STOP`, and `ESCALATE`.
- **Protective Thresholds:** Intercepts sudden velocity spikes (>200°/s), joint hyper-extension overruns, severe postural compensation, and user-reported acute distress.
- **Deterministic Priority Override:** Safety limits supersede all automated progression, gamification, and coaching recommendations.

### 📐 3. Kinetic Compensation Analysis
- **Subtle Fault Detection:** Automated detection of trunk lateral flexion, shoulder hiking/shrugging, knee valgus deviation, and asymmetrical hip compensations.
- **Kinetic Integrity Score:** Continuous 0–100% postural alignment scoring with actionable real-time biomechanical feedback cues.

### 📈 4. Adaptive Difficulty Progression & Longitudinal Profiles
- **Safe Progression Engine:** Dynamically calculates next session difficulty (`EASIER`, `SAME`, `SLIGHTLY_ADVANCED`, `REST/REVIEW`) strictly bounded by clinical parameters (min/max target angles, reps, hold durations).
- **Personal Movement Profile:** Longitudinal tracking of ROM trends, repetition consistency, bilateral symmetry, movement velocity, and protocol adherence.

### 📋 5. 7-Section Intelligent Session Report
- **Canonical Clinical Structure:**
  1. *Session Summary:* Exercise, duration, repetitions, peak & average ROM, reference target.
  2. *Movement Quality:* Quality score, repetition consistency, bilateral symmetry, velocity pacing.
  3. *Compensation Analysis:* Granular assessment of trunk lean, shoulder hike, knee valgus, and postural integrity.
  4. *Progress:* Comparison against baseline and clinical reference target.
  5. *Guidance:* Actionable form cues and targeted corrective drill prescriptions.
  6. *Safety Audit:* Verified log of safety events and movement hazards.
  7. *Clinical Escalation:* Actionable clinician consultation advisories.
- **Zero Numerical Hallucination Verifier:** Every numerical claim in AI-generated summaries is cross-verified against raw session telemetry before being displayed.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 18, TypeScript, Vite |
| **3D Rendering & UI** | Three.js (`@types/three`), Lucide Icons, Custom CSS Design System |
| **Computer Vision** | Google MediaPipe Vision (`@mediapipe/tasks-vision`) |
| **Backend & Cloud** | Supabase (PostgreSQL, Row-Level Security, Auth, RPC) |
| **Local AI & Speech** | Ollama (Local RAG proxy), Faster-Whisper (STT), pyttsx3 (TTS) |
| **Python Sidecars** | OpenCV, NumPy, YOLO11n-Pose, Ursina Engine |

---

## 📦 Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm or pnpm

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nirvanplays/Physiosis.git
   cd Physiosis
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *(Optionally add your Supabase credentials or local Ollama endpoint)*

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 🌐 Deployment on Vercel

Physiosis is fully optimized for one-click deployment on [Vercel](https://vercel.com):

1. Import the repository `nirvanplays/Physiosis` from GitHub into Vercel.
2. Framework Preset will automatically detect **Vite**.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Click **Deploy**.

The included `vercel.json` ensures all Single Page Application (SPA) client routes are routed seamlessly.

---

## 📄 License & Medical Disclaimer

**Advisory Notice:** Physiosis provides movement analysis and exercise guidance for rehabilitation exercise monitoring. It is designed as an assistive software tool and does not provide medical diagnoses, treatment prescriptions, or replace formal consultation with a licensed physiotherapist or medical professional.