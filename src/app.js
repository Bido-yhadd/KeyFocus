import { startGame } from "./game/index.js";
import { createLookAwayDetector } from "./lookAwayDetector.js";

const video = document.querySelector("#video");
const canvas = document.querySelector("#overlay");
const launchForm = document.querySelector("#launchForm");
const emailInput = document.querySelector("#emailInput");
const confirmButton = document.querySelector("#confirmButton");
const formError = document.querySelector("#formError");
const sessionPanel = document.querySelector("#sessionPanel");
const statusText = document.querySelector("#statusText");
const reasonText = document.querySelector("#reasonText");
const stateDot = document.querySelector("#stateDot");
const gameRoot = document.querySelector("#gameRoot");

let detector;
let detectorReady = false;
let sessionStarted = false;
let participant = null;

const setStatus = (state, label, reason) => {
  stateDot.className = `state-dot ${state}`;
  statusText.textContent = label;
  reasonText.textContent = reason;
};

const validateLaunchForm = () => {
  if (!emailInput.validity.valid) {
    return "Enter a valid email address.";
  }

  return "";
};

async function loadModel() {
  detector = await createLookAwayDetector({
    videoElement: video,
    canvasElement: canvas,
    onStateChange: ({ state, label, reason }) => setStatus(state, label, reason),
    onLookAway: handleLookAway,
    onError: (error) => {
      console.error(error);
      confirmButton.disabled = false;
      confirmButton.textContent = "Go";
      if (sessionStarted) showApp();
      setStatus("idle", "Detector failed", error.message);
    }
  });

  detectorReady = true;
  confirmButton.disabled = false;
  confirmButton.textContent = "Go";
  setStatus("ready", "Ready", "Enter your email to start.");
}

async function startSession() {
  const error = validateLaunchForm();

  if (error) {
    formError.textContent = error;
    return;
  }

  if (!detectorReady || sessionStarted) return;

  formError.textContent = "";
  sessionStarted = true;
  confirmButton.disabled = true;
  confirmButton.textContent = "Starting";
  participant = {
    email: emailInput.value.trim()
  };

  sessionPanel.classList.remove("is-locked");

  try {
    await detector.start();
    hideApp();
  } catch (error) {
    console.error(error);
    sessionStarted = false;
    showLaunch();
    confirmButton.disabled = false;
    confirmButton.textContent = "Go";
    setStatus("idle", "Camera failed", error.message);
  }
}

function handleLookAway({ metrics }) {
  const payload = {
    participant,
    detectedAt: new Date().toISOString(),
    metrics
  };

  showApp();
  startGame({
    rootElement: gameRoot,
    ...payload
  });
}

function hideApp() {
  document.body.classList.add("session-running");
  document.body.classList.remove("alert-visible");
  window.keyFocus?.hideWindow();
}

function showApp() {
  document.body.classList.add("session-running", "alert-visible");
  window.keyFocus?.showWindow();
}

function showLaunch() {
  document.body.classList.remove("session-running", "alert-visible");
}

launchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startSession();
});

emailInput.addEventListener("input", () => {
  formError.textContent = "";
});

loadModel().catch((error) => {
  console.error(error);
  confirmButton.disabled = true;
  confirmButton.textContent = "Unavailable";
  setStatus("idle", "Model failed", error.message);
});

window.addEventListener("beforeunload", () => {
  detector?.stop();
});
