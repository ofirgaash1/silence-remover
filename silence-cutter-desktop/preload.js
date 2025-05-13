const wavEncoder = require("wav-encoder");
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");
const { runNativeFFmpeg } = require("./electron-logic.js");

// Temp output for waveform audio extraction


contextBridge.exposeInMainWorld("ElectronAPI", {
  openVideoFile: () => ipcRenderer.invoke("open-video-file"),

  extractWaveformPeaks: async (filePath) => {
    console.log("🎧 Extracting and normalizing waveform from:", filePath);

    const normalizedWavPath = path.join(__dirname, "normalized.wav");
    const normalizedPCMPath = path.join(__dirname, "normalized_audio.f32");

    const args = [
      "-i", filePath,
      "-ar", "44100",
      "-ac", "1",
      "-map", "0:a:0",
      "-f", "f32le",
      "-y", normalizedPCMPath
    ];

    const argsWav = [
      "-i", filePath,
      "-ar", "44100",
      "-ac", "1",
      "-y", normalizedWavPath
    ];


    await runNativeFFmpeg(args);
    await runNativeFFmpeg(argsWav);

    console.log("✅ Normalized audio saved");

    // Step 2: Read normalized PCM into Float32Array
    const buffer = fs.readFileSync(normalizedPCMPath);
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);

    // Step 3: Peak-normalize
    let peak = 0;
    for (let i = 0; i < floatArray.length; i++) {
      peak = Math.max(peak, Math.abs(floatArray[i]));
    }

    console.log("🔊 Peak before normalization:", peak.toFixed(6));

    if (peak > 0 && peak <= 1.5) {
      for (let i = 0; i < floatArray.length; i++) {
        floatArray[i] /= peak; // Stretch to ±1
      }
      console.log("✅ Peak-normalized waveform in memory");
    } else {
      console.warn("⚠️ Unexpected peak value — skipping normalization.");
    }

    const sampleRate = 44100; // or match what you used in FFmpeg
    const outputWavPath = path.join(__dirname, "normalized_output.wav");

    await wavEncoder.encode({
      sampleRate,
      channelData: [floatArray] // mono
    }).then(buffer => {
      fs.writeFileSync(outputWavPath, Buffer.from(buffer));
      console.log("🎼 Saved peak-normalized WAV:", outputWavPath);
    });

    return {
      peaks: Array.from(floatArray),
      normalizedPath: outputWavPath
    };


  },

  cutOneSegment: async (uploadedFileRaw, segment) => {
    const { start, end, outputName } = segment;

    if (!uploadedFileRaw?.path || start == null || end == null || !outputName) {
      console.warn("Electron: Missing data for cutting segment.");
      return;
    }

    const inputPath = uploadedFileRaw.path;
    const outputPath = path.join(__dirname, outputName);

    const args = [
      "-y",
      "-ss", start.toFixed(6),
      "-i", inputPath,
      "-to", (end - start).toFixed(6),
      "-c:v", "libx264",
      "-crf", "20",
      "-preset", "ultrafast",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      "-threads", "0",
      "-avoid_negative_ts", "1",
      outputPath,
    ];

    await runNativeFFmpeg(args);
    console.log(`✅ Segment saved: ${outputName}`);
  },

  runMergeAndClean: async (segmentFiles) => {
    console.log("🔗 runMergeAndClean called with:", segmentFiles);

    const fileListPath = path.join(__dirname, "list.txt");
    const finalOutputPath = path.join(__dirname, "final_output.mp4");

    const listContent = segmentFiles.map((name) => `file '${name}'`).join("\n");
    fs.writeFileSync(fileListPath, listContent);

    await runNativeFFmpeg([
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", fileListPath,
      "-c", "copy",
      finalOutputPath,
    ]);

    for (const name of segmentFiles) {
      fs.unlinkSync(path.join(__dirname, name));
    }
    fs.unlinkSync(fileListPath);

    console.log("🧹 Cleanup complete. Final output saved:", finalOutputPath);
    return finalOutputPath;
  },

  getNormalizedWavBuffer: async () => {
    const wavPath = path.join(__dirname, "normalized_output.wav");
    const buffer = fs.readFileSync(wavPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); // return ArrayBuffer
  },
});
