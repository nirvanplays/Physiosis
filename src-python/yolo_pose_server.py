"""
yolo_pose_server.py
Physiosis Local YOLO11n-Pose CUDA Sidecar WebSocket Server

Runs on local RTX 4070 Laptop GPU (cuda:0).
Provides low-latency pose landmark estimation for Physiosis Web application.
"""

import os
import sys
import time
import json
import asyncio
import struct
import numpy as np
import cv2
import torch
import websockets
from ultralytics import YOLO

HOST = "127.0.0.1"
PORT = 8765
MODEL_NAME = "yolo11n-pose.pt"

print("=" * 65)
print("PHYSIOSIS — YOLO11n-POSE CUDA SIDECAR SERVER")
print("=" * 65)

# 1. Device Selection & Initialization
device = "cuda:0" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None"
is_cuda = torch.cuda.is_available()

print(f"[Init] PyTorch Version: {torch.__version__}")
print(f"[Init] CUDA Available: {is_cuda}")
print(f"[Init] Compute Device: {device} ({gpu_name})")

print(f"[Init] Loading {MODEL_NAME} onto {device}...")
model = YOLO(MODEL_NAME)
model.to(device)

# Warm-up CUDA kernels
print("[Init] Priming CUDA kernels with warm-up iterations...")
dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
for _ in range(15):
    _ = model(dummy_img, device=device, verbose=False)
if is_cuda:
    torch.cuda.synchronize()
print("[Init] YOLO11n-Pose is ready for live stream connections.")
print("=" * 65)

async def handle_client(websocket):
    client_ip = getattr(websocket, 'remote_address', '127.0.0.1')
    print(f"[WebSocket] Client connected: {client_ip}")

    latest_frame_data = None
    frame_ready_event = asyncio.Event()
    is_connected = True

    async def frame_receiver():
        nonlocal latest_frame_data, is_connected
        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    # Binary JPEG frame with 8-byte float timestamp header
                    if len(message) > 8:
                        try:
                            client_ts = struct.unpack(">d", message[:8])[0]
                            jpeg_bytes = message[8:]
                        except Exception:
                            client_ts = time.perf_counter() * 1000
                            jpeg_bytes = message
                    else:
                        client_ts = time.perf_counter() * 1000
                        jpeg_bytes = message

                    latest_frame_data = (jpeg_bytes, client_ts)
                    frame_ready_event.set()

                elif isinstance(message, str):
                    try:
                        req = json.loads(message)
                        if req.get("type") == "ping":
                            resp = {
                                "type": "pong",
                                "status": "READY",
                                "device": device,
                                "isCuda": is_cuda,
                                "gpu": gpu_name,
                                "model": "yolo11n-pose",
                                "timestamp": time.time() * 1000
                            }
                            await websocket.send(json.dumps(resp))
                    except Exception as json_err:
                        print(f"[WebSocket] Error parsing JSON message: {json_err}")
        except Exception:
            pass
        finally:
            is_connected = False
            frame_ready_event.set()

    async def inference_worker():
        nonlocal latest_frame_data
        frame_count = 0
        last_fps_time = time.perf_counter()

        while is_connected:
            await frame_ready_event.wait()
            frame_ready_event.clear()

            if not is_connected:
                break

            current_data = latest_frame_data
            if current_data is None:
                continue

            jpeg_bytes, client_ts = current_data
            t0 = time.perf_counter()

            # Decode JPEG
            img_arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)

            if img is None or img.size == 0:
                continue

            h, w, _ = img.shape

            # Run Inference on CUDA
            t_infer_start = time.perf_counter()
            with torch.inference_mode():
                results = model(img, device=device, verbose=False)
                if is_cuda:
                    torch.cuda.synchronize()
            t_infer_end = time.perf_counter()

            infer_ms = (t_infer_end - t_infer_start) * 1000.0

            keypoints_out = []
            confidence = 0.0

            if results and len(results) > 0 and results[0].keypoints is not None:
                r = results[0]
                kpts_data = r.keypoints.data.cpu().numpy()
                boxes = r.boxes.xywh.cpu().numpy() if r.boxes is not None else None

                if len(kpts_data) > 0:
                    best_idx = 0
                    if boxes is not None and len(boxes) > 1:
                        max_area = 0
                        for idx, box in enumerate(boxes):
                            area = box[2] * box[3]
                            if area > max_area:
                                max_area = area
                                best_idx = idx

                    person_kpts = kpts_data[best_idx]

                    for kp in person_kpts:
                        norm_x = float(kp[0] / max(1, w))
                        norm_y = float(kp[1] / max(1, h))
                        conf = float(kp[2])
                        keypoints_out.append([norm_x, norm_y, conf])

                    if len(keypoints_out) > 6:
                        confidence = float((keypoints_out[5][2] + keypoints_out[6][2]) / 2.0)

            t_end = time.perf_counter()
            total_server_ms = (t_end - t0) * 1000.0
            frame_count += 1

            now_perf = time.perf_counter()
            if now_perf - last_fps_time >= 2.0:
                frame_count = 0
                last_fps_time = now_perf

            response = {
                "type": "pose",
                "keypoints": keypoints_out,
                "confidence": confidence,
                "inferenceMs": round(infer_ms, 2),
                "serverMs": round(total_server_ms, 2),
                "clientTimestamp": client_ts,
                "serverTimestamp": time.time() * 1000,
                "device": device,
                "isCuda": is_cuda,
                "model": "yolo11n-pose"
            }

            try:
                await websocket.send(json.dumps(response))
            except Exception:
                break

    await asyncio.gather(frame_receiver(), inference_worker())
    print(f"[WebSocket] Client disconnected: {client_ip}")

async def main():
    print(f"[Server] Starting WebSocket server on ws://{HOST}:{PORT}...")
    async with websockets.serve(
        handle_client,
        HOST,
        PORT,
        max_size=10 * 1024 * 1024,
        compression=None,
        ping_interval=10,
        ping_timeout=5
    ):
        print(f"[Server] Listening on ws://{HOST}:{PORT}/pose")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Server] Shutting down YOLO pose sidecar.")
