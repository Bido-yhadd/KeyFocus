export function startGame({ rootElement, participant, detectedAt, metrics }) {
  rootElement.replaceChildren();

  const shell = document.createElement("div");
  shell.className = "game-placeholder";

  const label = document.createElement("p");
  label.className = "game-kicker";
  label.textContent = "Look-away game";

  const title = document.createElement("h2");
  title.textContent = "Game starts here";

  const detail = document.createElement("p");
  detail.className = "game-detail";
  detail.textContent = `Triggered for ${participant.email} at ${new Date(detectedAt).toLocaleTimeString()} with ${Math.round(metrics.confidence * 100)}% confidence.`;

  const status = document.createElement("div");
  status.className = "game-status";
  status.textContent = "Placeholder in src/game/index.js";

  shell.append(label, title, detail, status);
  rootElement.append(shell);
}
