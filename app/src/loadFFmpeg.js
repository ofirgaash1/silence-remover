export async function loadFFmpeg(ffmpeg, {
  baseURL = document.baseURI,
  timeoutMs = 120000,
} = {}) {
  let timer;
  try {
    await Promise.race([
      ffmpeg.load({
        // Public assets live beside the HTML, including on project Pages sites.
        classWorkerURL: new URL("worker/worker.mjs", baseURL).href,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          "The export engine could not start. Check your connection and try exporting again."
        )), timeoutMs);
      }),
    ]);
  } catch (error) {
    ffmpeg.terminate();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
