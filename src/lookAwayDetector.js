import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304";

export const LOOK_AWAY_PRESETS = {
  workedFine: {
    headThreshold: 0.18,
    eyeThreshold: 0.24,
    pitchThreshold: 0.18,
    debounceFrames: 4
  }
};

const DEFAULT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

export async function createLookAwayDetector(options) {
  const detector = new LookAwayDetector(options);
  await detector.load();
  return detector;
}

export class LookAwayDetector {
  constructor(options = {}) {
    if (!options.videoElement) {
      throw new Error("LookAwayDetector requires a videoElement.");
    }

    this.videoElement = options.videoElement;
    this.canvasElement = options.canvasElement ?? null;
    this.canvasContext = this.canvasElement?.getContext("2d") ?? null;
    this.modelUrl = options.modelUrl ?? DEFAULT_MODEL_URL;
    this.options = {
      ...LOOK_AWAY_PRESETS.workedFine,
      ...(options.preset ?? {}),
      ...(options.thresholds ?? {})
    };
    this.onMetrics = options.onMetrics ?? (() => {});
    this.onStateChange = options.onStateChange ?? (() => {});
    this.onLookAway = options.onLookAway ?? (() => {});
    this.onLookBack = options.onLookBack ?? (() => {});
    this.onError = options.onError ?? console.error;

    this.faceLandmarker = null;
    this.animationFrameId = null;
    this.lastVideoTime = -1;
    this.currentState = "idle";
    this.awayFrameCount = 0;
    this.attentiveFrameCount = 0;
    this.stream = null;
  }

  async load() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.modelUrl,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false
    });

    this.emitState("ready", "Ready", "Detector model loaded.");
  }

  async start(cameraOptions = {}) {
    if (!this.faceLandmarker) {
      await this.load();
    }

    this.emitState("searching", "Starting camera", "Waiting for camera permission.");
    const cameraRequest = {
      ...cameraOptions,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
        ...(cameraOptions.video ?? {})
      },
      audio: cameraOptions.audio ?? false
    };

    this.stream = await navigator.mediaDevices.getUserMedia(cameraRequest);

    this.videoElement.srcObject = this.stream;
    await this.videoElement.play();

    this.resizeCanvas();
    window.addEventListener("resize", this.resizeCanvas);
    this.emitState("searching", "Finding face", "Keep your face in view.");
    this.detectLoop();
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.videoElement.srcObject = null;
    window.removeEventListener("resize", this.resizeCanvas);
    this.emitState("idle", "Stopped", "Camera stopped.");
  }

  setOptions(nextOptions = {}) {
    this.options = {
      ...this.options,
      ...nextOptions
    };
  }

  resizeCanvas = () => {
    if (!this.canvasElement || !this.canvasContext) return;

    const rect = this.canvasElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvasElement.width = Math.round(rect.width * ratio);
    this.canvasElement.height = Math.round(rect.height * ratio);
    this.canvasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  detectLoop = () => {
    try {
      if (this.videoElement.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.videoElement.currentTime;
        const result = this.faceLandmarker.detectForVideo(this.videoElement, performance.now());
        this.handleResult(result);
      }

      this.animationFrameId = requestAnimationFrame(this.detectLoop);
    } catch (error) {
      this.onError(error);
      this.stop();
    }
  };

  handleResult(result) {
    this.clearCanvas();

    if (!result.faceLandmarks?.length) {
      this.awayFrameCount = 0;
      this.attentiveFrameCount = 0;
      this.onMetrics(emptyMetrics());
      this.emitState("searching", "No face", "Move into frame or improve lighting.");
      return;
    }

    const landmarks = mirrorLandmarks(result.faceLandmarks[0]);
    this.drawFace(landmarks);

    const metrics = classifyLookDirection(landmarks, this.options);
    this.onMetrics(metrics);
    this.updateState(metrics);
  }

  updateState(metrics) {
    if (metrics.isAway) {
      this.awayFrameCount += 1;
      this.attentiveFrameCount = 0;
    } else {
      this.attentiveFrameCount += 1;
      this.awayFrameCount = 0;
    }

    if (this.awayFrameCount >= this.options.debounceFrames) {
      this.emitState("away", "Looking away", metrics.reason, metrics);
    } else if (this.attentiveFrameCount >= this.options.debounceFrames) {
      this.emitState("attentive", "Looking at screen", metrics.reason, metrics);
    }
  }

  emitState(state, label, reason, metrics = emptyMetrics()) {
    const previousState = this.currentState;
    const changed = previousState !== state;
    this.currentState = state;
    const payload = { state, previousState, label, reason, metrics };

    this.onStateChange(payload);
    if (changed && state === "away") this.onLookAway(payload);
    if (changed && state === "attentive" && previousState === "away") this.onLookBack(payload);
  }

  clearCanvas() {
    if (!this.canvasElement || !this.canvasContext) return;
    this.canvasContext.clearRect(0, 0, this.canvasElement.clientWidth, this.canvasElement.clientHeight);
  }

  drawFace(landmarks) {
    if (!this.canvasElement || !this.canvasContext) return;

    const width = this.canvasElement.clientWidth;
    const height = this.canvasElement.clientHeight;
    const ctx = this.canvasContext;

    ctx.save();
    ctx.fillStyle = "rgba(56, 217, 115, 0.92)";

    drawConnectors(ctx, landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, width, height, {
      color: "rgba(47, 140, 255, 0.22)",
      lineWidth: 1
    });
    drawConnectors(ctx, landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, width, height, {
      color: "rgba(246, 247, 248, 0.75)",
      lineWidth: 2
    });

    [1, 33, 133, 263, 362, 468, 473].forEach((index) => {
      const point = landmarks[index];
      if (!point) return;

      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

export function classifyLookDirection(landmarks, options = LOOK_AWAY_PRESETS.workedFine) {
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  const nose = landmarks[1];
  const chin = landmarks[152];
  const forehead = landmarks[10];
  const leftIris = landmarks[468];
  const rightIris = landmarks[473];

  const eyeCenter = midpoint(leftOuter, rightOuter);
  const faceCenter = midpoint(landmarks[234] ?? leftOuter, landmarks[454] ?? rightOuter);
  const faceHeight = distance(forehead, chin) || 1;
  const eyeSpan = distance(leftOuter, rightOuter) || 1;

  const headYaw = clamp((nose.x - faceCenter.x) / eyeSpan, -1, 1);
  const pitch = clamp((nose.y - eyeCenter.y) / faceHeight - 0.12, -1, 1);
  const leftGaze = eyeRatio(leftIris, leftOuter, leftInner);
  const rightGaze = eyeRatio(rightIris, rightInner, rightOuter);
  const eyeGaze = clamp((leftGaze + rightGaze) / 2, -1, 1);

  const headLimit = options.headThreshold ?? LOOK_AWAY_PRESETS.workedFine.headThreshold;
  const eyeLimit = options.eyeThreshold ?? LOOK_AWAY_PRESETS.workedFine.eyeThreshold;
  const pitchLimit = options.pitchThreshold ?? LOOK_AWAY_PRESETS.workedFine.pitchThreshold;

  const yawAway = Math.abs(headYaw) > headLimit;
  const gazeAway = Math.abs(eyeGaze) > eyeLimit;
  const pitchAway = Math.abs(pitch) > pitchLimit;
  const isAway = yawAway || gazeAway || pitchAway;
  const confidence = clamp(
    Math.max(Math.abs(headYaw) / headLimit, Math.abs(eyeGaze) / eyeLimit, Math.abs(pitch) / pitchLimit) /
      1.8,
    0,
    1
  );

  let reason = "Face centered and eyes near screen.";
  if (yawAway) reason = `Head turned ${headYaw > 0 ? "right" : "left"}.`;
  if (gazeAway) reason = `Eyes looking ${eyeGaze > 0 ? "right" : "left"}.`;
  if (pitchAway) reason = `Head angled ${pitch > 0 ? "down" : "up"}.`;

  return { headYaw, eyeGaze, pitch, isAway, confidence, reason };
}

function drawConnectors(ctx, landmarks, connectors, width, height, options) {
  ctx.save();
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.lineWidth;

  connectors.forEach(({ start, end }) => {
    const from = landmarks[start];
    const to = landmarks[end];
    if (!from || !to) return;

    ctx.beginPath();
    ctx.moveTo(from.x * width, from.y * height);
    ctx.lineTo(to.x * width, to.y * height);
    ctx.stroke();
  });

  ctx.restore();
}

function mirrorLandmarks(landmarks) {
  return landmarks.map((point) => ({
    ...point,
    x: 1 - point.x
  }));
}

function eyeRatio(iris, outer, inner) {
  if (!iris || !outer || !inner) return 0;
  const center = midpoint(outer, inner);
  const halfWidth = distance(outer, inner) / 2 || 1;
  return (iris.x - center.x) / halfWidth;
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function emptyMetrics() {
  return {
    headYaw: 0,
    eyeGaze: 0,
    pitch: 0,
    isAway: false,
    confidence: 0,
    reason: "No face detected."
  };
}
