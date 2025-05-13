const { app, BrowserWindow } = require('electron');
const path = require('path');
const { ipcMain, dialog } = require("electron");
const fs = require("fs");
const { spawn } = require("child_process");



process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'app', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});



// Choose file from system
ipcMain.handle("open-video-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm"] }],
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

// Extract downsampled waveform peaks via ffmpeg (as raw PCM)
ipcMain.handle("extract-waveform-peaks", async (event, filePath) => {
  const tempOut = path.join(__dirname, "waveform.pcm");

  return new Promise((resolve, reject) => {
    const args = [
      "-i", filePath,
      "-vn",            // no video
      "-ac", "1",       // mono
      "-ar", "8000",    // sample rate downsample
      "-f", "s16le",    // raw PCM 16-bit
      tempOut
    ];

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.stderr.on("data", data => {
      const msg = data.toString();
      if (!msg.includes("frame") && !msg.includes("size=")) {
        console.log("FFmpeg:", msg.trim());
      }
    });

    ffmpeg.on("close", code => {
      if (code !== 0) return reject(new Error(`FFmpeg exited with code ${code}`));
      const pcmData = fs.readFileSync(tempOut);
      fs.unlinkSync(tempOut);

      // Convert to array of normalized samples
      const samples = new Int16Array(pcmData.buffer);
      const peaks = Array.from(samples).map(v => v / 32768); // Normalize to [-1, 1]
      resolve(peaks);
    });
  });
});

