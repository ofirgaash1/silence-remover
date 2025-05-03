import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/classes.js';

import './script.js';

window.FFmpegLib = {
  createFFmpeg: (options) => new FFmpeg(options),
  fetchFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
};



// ✅ wait until global libs are defined, then call main()
import { main } from './script.js';
main();
