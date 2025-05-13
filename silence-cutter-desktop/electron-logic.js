const { spawn } = require("child_process");
const path = require("path");

function runNativeFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
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

module.exports = { runNativeFFmpeg };
