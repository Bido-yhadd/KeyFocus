import { createLookAwayDetector } from "./lookAwayDetector.js";

const video = document.querySelector("#video");
const canvas = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const statusText = document.querySelector("#statusText");
const reasonText = document.querySelector("#reasonText");
const stateDot = document.querySelector("#stateDot");
const yawValue = document.querySelector("#yawValue");
const gazeValue = document.querySelector("#gazeValue");
const pitchValue = document.querySelector("#pitchValue");
const confidenceValue = document.querySelector("#confidenceValue");
const eventLog = document.querySelector("#eventLog");

const controls = {
  headThreshold: document.querySelector("#headThreshold"),
  eyeThreshold: document.querySelector("#eyeThreshold"),
  debounceFrames: document.querySelector("#debounceFrames")
};

const outputs = {
  headThreshold: document.querySelector("#headThresholdValue"),
  eyeThreshold: document.querySelector("#eyeThresholdValue"),
  debounceFrames: document.querySelector("#debounceFramesValue")
};

let detector;

const setStatus = (state, label, reason) => {
  if (stateDot.dataset.state !== state) {
    stateDot.dataset.state = state;
    addEvent(label);
  }

  stateDot.className = `state-dot ${state}`;
  statusText.textContent = label;
  reasonText.textContent = reason;
};

const addEvent = (label) => {
  if (label === "Loading model") return;

  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${label}`;
  eventLog.prepend(item);

  while (eventLog.children.length > 6) {
    eventLog.lastElementChild.remove();
  }
};

const bindControl = (key) => {
  const update = () => {
    outputs[key].textContent = controls[key].value;
    detector?.setOptions(readThresholds());
  };
  controls[key].addEventListener("input", update);
  update();
};

Object.keys(controls).forEach(bindControl);

async function loadModel() {
  detector = await createLookAwayDetector({
    videoElement: video,
    canvasElement: canvas,
    thresholds: readThresholds(),
    onMetrics: updateMetrics,
    onStateChange: ({ state, label, reason }) => setStatus(state, label, reason),
    onLookAway: ({ metrics }) => {
      console.log("Trigger action: person looked away", metrics);
    },
    onLookBack: ({ metrics }) => {
      console.log("Person looked back", metrics);
    },
    onError: (error) => {
      console.error(error);
      startButton.disabled = false;
      setStatus("idle", "Detector failed", error.message);
    }
  });

  startButton.disabled = false;
  setStatus("idle", "Ready", "Start the webcam to classify attention.");
}

async function startCamera() {
  startButton.disabled = true;
  await detector.start();
}

function readThresholds() {
  return {
    headThreshold: Number(controls.headThreshold.value),
    eyeThreshold: Number(controls.eyeThreshold.value),
    debounceFrames: Number(controls.debounceFrames.value)
  };
}

function updateMetrics(metrics) {
  yawValue.textContent = metrics.headYaw.toFixed(2);
  gazeValue.textContent = metrics.eyeGaze.toFixed(2);
  pitchValue.textContent = metrics.pitch.toFixed(2);
  confidenceValue.textContent = `${Math.round(metrics.confidence * 100)}%`;
}

startButton.addEventListener("click", () => {
  startCamera().catch((error) => {
    console.error(error);
    startButton.disabled = false;
    setStatus("idle", "Camera failed", error.message);
  });
});

loadModel().catch((error) => {
  console.error(error);
  startButton.disabled = true;
  setStatus("idle", "Model failed", error.message);
});

window.addEventListener("beforeunload", () => {
  detector?.stop();
});
