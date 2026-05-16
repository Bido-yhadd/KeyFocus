import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    title: "Key Focused",
    backgroundColor: "#07090b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const devServerUrl = process.env.KEYFOCUS_DEV_SERVER;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(rootDir, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("focus-window:hide", () => {
  if (!mainWindow) return;

  if (process.platform === "darwin") {
    mainWindow.minimize();
    return;
  }

  mainWindow.setOpacity(0);
  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setFocusable(false);
  mainWindow.blur();
});

ipcMain.handle("focus-window:show", () => {
  if (!mainWindow) return;

  mainWindow.setFocusable(true);
  mainWindow.setOpacity(1);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
