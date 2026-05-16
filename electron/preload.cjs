const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("keyFocus", {
  hideWindow: () => ipcRenderer.invoke("focus-window:hide"),
  showWindow: () => ipcRenderer.invoke("focus-window:show"),
  isDesktop: true
});
