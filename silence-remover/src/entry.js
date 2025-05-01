import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/classes.js';
import { FFprobeWorker } from 'https://unpkg.com/ffprobe-wasm@0.3.1/browser.mjs';
import './script.js';

window.FFmpegLib = {
  createFFmpeg: (options) => new FFmpeg(options),
  fetchFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
};

window.FFprobeLib = FFprobeWorker;

// ✅ wait until global libs are defined, then call main()
import { main } from './script.js';
main();
