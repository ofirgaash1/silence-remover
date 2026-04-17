const { ipcMain, dialog, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const wavEncoder = require("wav-encoder");

function getFFmpegPath() {
  const ffmpegBinary = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ffmpegBaseDir =
    process.env.NODE_ENV === "development" || !app.isPackaged
      ? path.join(__dirname, "bin")
      : path.join(process.resourcesPath, "bin");
  const ffmpegPath = path.join(ffmpegBaseDir, ffmpegBinary);

  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg binary not found: ${ffmpegPath}`);
  }

  return ffmpegPath;
}


function runNativeFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const ffmpeg = spawn(ffmpegPath, args);

    ffmpeg.stderr.on("data", (chunk) => {
      const msg = chunk.toString();
      const skipKeywords = [
        "Press [q] to stop", "Stream mapping", "libx264", "profile", "frame",
        "kb/s", "encoder", "Auto-inserting", "muxing overhead", "Starting second pass",
        "Output #0", "Input #0", "Stream #0", "Duration:", "Metadata:"
      ];

      if (!skipKeywords.some((keyword) => msg.includes(keyword))) {
        console.warn("FFmpeg:", msg.trim());
      }
    });

    ffmpeg.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function resolveTempSegmentPath(fileName) {
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid temp file name.");
  }

  const safeName = path.basename(fileName);
  return path.join(app.getPath("temp"), safeName);
}

// Handle file open
ipcMain.handle("open-video-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm"] }],
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

// Normalize and extract waveform peaks
ipcMain.handle("extract-waveform-peaks", async (_, filePath) => {
  const tmpDir = app.getPath("temp");
  const normalizedPCMPath = path.join(tmpDir, "normalized_audio.f32");
  const normalizedWavPath = path.join(tmpDir, "normalized_output.wav");


  const argsPCM = [
    "-i", filePath,
    "-ar", "44100",
    "-ac", "1",
    "-map", "0:a:0",
    "-f", "f32le",
    "-y", normalizedPCMPath
  ];

  await runNativeFFmpeg(argsPCM);

  const buffer = fs.readFileSync(normalizedPCMPath);
  const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);

  let peak = 0;
  for (let i = 0; i < floatArray.length; i++) {
    peak = Math.max(peak, Math.abs(floatArray[i]));
  }


  if (peak === 0) {
    console.warn("⚠️ No signal in audio — all samples are zero.");
  } else if (peak > 1.5) {
    console.warn("⚠️ Peak value too high — possible clipping or corrupt data.");
  } else {
    for (let i = 0; i < floatArray.length; i++) {
      floatArray[i] /= peak;
    }
  }


  await wavEncoder.encode({
    sampleRate: 44100,
    channelData: [floatArray]
  }).then((encodedBuffer) => {
    fs.writeFileSync(normalizedWavPath, Buffer.from(encodedBuffer));
  });

  const peaks = [];
  const step = 200;
  for (let i = 0; i < floatArray.length; i += step) {
    let max = 0;
    for (let j = i; j < i + step && j < floatArray.length; j++) {
      max = Math.max(max, Math.abs(floatArray[j]));
    }
    peaks.push(max);
  }
  return {
    peaks,
    normalizedPath: normalizedWavPath
  };
});

// Return buffer of normalized WAV
ipcMain.handle("get-normalized-wav-buffer", async () => {
  const wavPath = path.join(app.getPath("temp"), "normalized_output.wav");

  if (!fs.existsSync(wavPath)) {
    throw new Error(`normalized_output.wav not found in ${wavPath}`);
  }

  const buffer = fs.readFileSync(wavPath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});


// Cut one segment
ipcMain.handle("cut-one-segment", async (_, uploadedFileRaw, segment) => {
  const { start, end, outputName } = segment;

  if (!uploadedFileRaw?.path || start == null || end == null || !outputName) {
    console.warn("Electron: Missing data for cutting segment.");
    return;
  }

  const inputPath = uploadedFileRaw.path;
  const outputPath = path.join(app.getPath("temp"), outputName);


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
});

ipcMain.handle("read-temp-segment-buffer", async (_, fileName) => {
  const tempSegmentPath = resolveTempSegmentPath(fileName);
  if (!fs.existsSync(tempSegmentPath)) {
    throw new Error(`Segment file not found: ${fileName}`);
  }

  const buffer = fs.readFileSync(tempSegmentPath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});

ipcMain.handle("write-temp-segment-buffer", async (_, fileName, data) => {
  const tempSegmentPath = resolveTempSegmentPath(fileName);
  const typed =
    data instanceof Uint8Array
      ? data
      : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  fs.writeFileSync(tempSegmentPath, Buffer.from(typed));
  return true;
});

ipcMain.handle("delete-temp-segment", async (_, fileName) => {
  const tempSegmentPath = resolveTempSegmentPath(fileName);
  if (fs.existsSync(tempSegmentPath)) {
    fs.unlinkSync(tempSegmentPath);
  }
  return true;
});

// Merge and clean
ipcMain.handle("run-merge-and-clean", async (_, segmentFiles) => {
  const tmpDir = app.getPath("temp");
  const fileListPath = path.join(tmpDir, "list.txt");
  const finalOutputPath = path.join(tmpDir, "final_output.mp4");

  // 👇 Compose file list with full temp paths and forward slashes
  const listContent = segmentFiles.map((name) =>
    `file '${path.join(tmpDir, name).replace(/\\/g, "/")}'`
  ).join("\n");

  fs.writeFileSync(fileListPath, listContent);

  await runNativeFFmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", fileListPath,
    "-c", "copy",
    finalOutputPath
  ]);

  // 🔥 Clean up parts
  for (const name of segmentFiles) {
    const partPath = path.join(tmpDir, name);
    if (fs.existsSync(partPath)) {
      fs.unlinkSync(partPath);
    }
  }

  fs.unlinkSync(fileListPath);

  console.log("🧹 Final output created:", finalOutputPath);
  return finalOutputPath;
});


