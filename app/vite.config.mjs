import { resolve } from 'path';

export default {
  base: './', // ✅ relative URLs work for both web & Electron
  build: {
    outDir: 'dist', // ✅ always builds to ./app/dist (from `app/` root)
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mp3: resolve(__dirname, 'mp3-silence-remover.html'),
        mp4: resolve(__dirname, 'mp4-silence-remover.html'),
        audio: resolve(__dirname, 'remove-silence-from-audio.html'),
        video: resolve(__dirname, 'remove-silence-from-video.html')
      }
    }
  },
  plugins: [
    {
      name: 'fix-worker-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.endsWith('/worker/worker.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
          }
          next();
        });
      }
    }
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
};
