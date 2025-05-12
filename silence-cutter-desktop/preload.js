const { contextBridge } = require("electron");
const path = require("path");
const fs = require("fs");
const { runNativeFFmpeg } = require("./electron-logic.js");

contextBridge.exposeInMainWorld("ElectronAPI", {
  cutOneSegment: async (uploadedFileRaw, segment) => {
    console.log("🧠 cutOneSegment called in preload");
    console.log("📤 segment:", segment);

    const { start, end, outputName } = segment;
    console.log("📥 uploadedFileRaw received:", uploadedFileRaw);
    console.log(
      "📥 uploadedFileRaw.buffer length:",
      uploadedFileRaw?.buffer?.byteLength
    );

    if (!uploadedFileRaw || start == null || end == null || !outputName) {
      console.warn("Electron: Missing required data for segment cutting.");
      return;
    }

    const fileBuffer = Buffer.from(uploadedFileRaw.buffer);
    const inputPath = path.join(__dirname, "input.mp4");
    const outputPath = path.join(__dirname, outputName);

    fs.writeFileSync(inputPath, fileBuffer);

    const args = [
      "-y",
      "-ss",
      start.toFixed(6),
      "-i",
      inputPath,
      "-to",
      (end - start).toFixed(6),
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "ultrafast",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-threads",
      "0",
      "-avoid_negative_ts",
      "1",
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
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      fileListPath,
      "-c",
      "copy",
      finalOutputPath,
    ]);

    for (const name of segmentFiles) {
      fs.unlinkSync(path.join(__dirname, name));
    }
    fs.unlinkSync(fileListPath);

    console.log("🧹 Cleanup complete. Final output saved:", finalOutputPath);
  },
});
