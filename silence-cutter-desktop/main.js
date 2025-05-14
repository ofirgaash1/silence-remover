console.log("🔥 main.js is running");

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

const isDev = !app.isPackaged;

// ✅ Import all ipcMain handlers (like extract-waveform-peaks, etc.)
const logicLoaded = require("./electron-logic.js");
if (!logicLoaded) {
  console.error("❌ electron-logic.js did NOT load");
  app.quit();
}
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  const devPath = path.join(__dirname, "..", "app", "dist", "index.html");
  const prodPath = path.join(__dirname, "app", "index.html");
  const htmlToLoad = isDev ? devPath : prodPath;

  mainWindow.loadFile(htmlToLoad);
}

app.whenReady().then(createWindow);

