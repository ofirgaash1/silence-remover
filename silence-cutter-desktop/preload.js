console.log("✅ [preload.js] loaded");
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ElectronAPI", {
  // Open a file dialog and return the selected video path
  openVideoFile: () => ipcRenderer.invoke("open-video-file"),

  // Request waveform peak extraction and normalization (runs in main)
  extractWaveformPeaks: (filePath) =>
    ipcRenderer.invoke("extract-waveform-peaks", filePath),

  // Get the final WAV file buffer (peak-normalized) as ArrayBuffer
  getNormalizedWavBuffer: () =>
    ipcRenderer.invoke("get-normalized-wav-buffer"),

  // Cut a single segment using ffmpeg
  cutOneSegment: (uploadedFileRaw, segment) =>
    ipcRenderer.invoke("cut-one-segment", uploadedFileRaw, segment),

  // Merge all segments into final output
  runMergeAndClean: (segmentFiles) =>
    ipcRenderer.invoke("run-merge-and-clean", segmentFiles),
});
