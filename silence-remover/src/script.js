import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/classes.js';

window.FFmpegLib = {
  createFFmpeg: (options) => new FFmpeg(options),
  fetchFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
};

// ✅ wait until global libs are defined, then call main()

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function runDelayedMain() {
  await delay(0); // Wait for the next event loop tick (effectively asynchronous)
  await main();
}

runDelayedMain()

let wavesurfer = null;
let audioBuffer = null;
let silentRegions = [];
let lastBlob = null;
let outputFormat = 'mp3';
let precomputedPeaks = [];
let uploadedFile = null;
let ffmpeg;
let fetchFile;
let ffmpegLoaded = false;

export async function main() {
  const { createFFmpeg, fetchFile: ffetch } = window.FFmpegLib;
  ffmpeg = createFFmpeg({ log: true });
  fetchFile = ffetch;

  setupUIEvents();

}

const title = document.getElementById('title');
const dropZone = document.getElementById('drop-zone');
const waveformDiv = document.getElementById('waveform');
const browseBtn = document.getElementById('drop-zone');
const fileInput = document.getElementById('audioFile');
const thresholdInput = document.getElementById('thresholdInput');
const shrinkSlider = document.getElementById('shrinkSlider');
const shrinkInput = document.getElementById('shrinkInput');
const formatButtons = document.querySelectorAll('.fmt-btn');
const cutButton = document.getElementById('cutAudio');
const audioPreview = document.getElementById('audioPreview');
const downloadBtn = document.getElementById('AudioDownloadBtn');
const cutVideoBtn = document.getElementById('cutVideoBtn');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const statsPanel = document.getElementById('statsPanel');
const vidTitle = document.getElementById('vidTitle');
const zoomSlider = document.getElementById('zoomSlider');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdLine = document.getElementById('thresholdLine');
const waveform = document.getElementById('waveform');


thresholdSlider.addEventListener('input', updateThresholdLine);

function updateThresholdLine() {
  const raw = parseFloat(thresholdSlider.value) / 100;
  const mapped = 0.5 * (Math.sin(Math.PI * (raw - 0.5)) + 1);
  const threshold = mapped * mapped;

  const waveformHeight = waveform.offsetHeight;
  const centerY = waveformHeight / 2;
  const yPos = centerY * (1 - threshold); // line from center (0) to top (1)

  thresholdLine.style.top = `${yPos}px`;
}


zoomSlider.addEventListener('input', (e) => {
  const minPxPerSec = e.target.valueAsNumber;
  if (wavesurfer) {
    wavesurfer.zoom(minPxPerSec);
  }
});


function setupUIEvents() {
  downloadVideoBtn.style.display = 'none';
  vidTitle.style.display = 'none';
  audioPreview.style.display = 'none';
  downloadBtn.style.display = 'none';

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  thresholdSlider.addEventListener('input', e => {
    thresholdInput.value = e.target.value;
    handleThresholdChange();
  });
  thresholdInput.addEventListener('input', e => {
    thresholdSlider.value = e.target.value;
    handleThresholdChange();
  });

  shrinkSlider.addEventListener('input', e => {
    shrinkInput.value = e.target.value;
    handleShrinkChange();
  });
  shrinkInput.addEventListener('input', e => {
    shrinkSlider.value = e.target.value;
    handleShrinkChange();
  });
  formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      formatButtons.forEach(b => {
        b.classList.remove('selected');
        b.innerText = b.dataset.format.toUpperCase();
      });
      btn.classList.add('selected');
      btn.innerText = `${btn.dataset.format.toUpperCase()} ✓`;
      outputFormat = btn.dataset.format;
    });
  });

  cutButton.addEventListener('click', cutAudio);
  downloadBtn.addEventListener('click', () => {
    if (!lastBlob) return;
    const url = URL.createObjectURL(lastBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-audio.${outputFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  });

  cutVideoBtn.addEventListener('click', cutVideo);
}

function normalizeAudioBuffer(buffer) {

  const data = buffer.getChannelData(0);
  let max = 0;
  console.log(data.length);

  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > max) max = abs;
  }
  if (max === 0 || max === 1) return;
  const multiplier = 1.0 / max;
  for (let i = 0; i < data.length; i++) {
    data[i] *= multiplier;
  }
}



function handleFile(file) {
  if (!file) return;

  console.log(`Starting file processing for: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

  uploadedFile = file;
  if (wavesurfer) wavesurfer.destroy();
  audioBuffer = null;
  silentRegions = [];
  lastBlob = null;
  audioPreview.src = '';
  videoPreview.src = '';

  dropZone.style.display = 'none';
  waveformDiv.style.display = 'block';

  updateThresholdLine(); // Ensure line is placed immediately

  wavesurfer = WaveSurfer.create({
    height: 128,
    scrollParent: false,
    container: waveformDiv,
    waveColor: 'blue',
    progressColor: 'blue',
    backend: 'WebAudio',
    responsive: true,
    plugins: [WaveSurfer.regions.create({})]
  });







  

  const wave = document.querySelector('#waveform wave');

  // === CONFIGURABLE PARAMETERS ===
  const WHEEL_SENSITIVITY = 1 / 8;         // scale wheel input
  const WHEEL_ACCELERATION = 0.15;          // how quickly velocity ramps up
  const WHEEL_DECELERATION = 0.9;         // how slowly it slows down
  const WHEEL_IDLE_TIMEOUT = 100;          // ms to wait before deceleration starts
  
  const DRAG_DECELERATION = 0.95;          // how slowly drag decays
  const DRAG_STOP_THRESHOLD = 0.001;         // min velocity before stopping
  const WHEEL_STOP_THRESHOLD = 0.001;        // min velocity before stopping
  
  // === DRAG STATE ===
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let dragVelocity = 0;
  let lastX = 0;
  let dragMomentumId = null;
  
  // === WHEEL STATE ===
  let wheelVelocity = 0;
  let targetWheelVelocity = 0;
  let wheelMomentumId = null;
  let wheelTimeout = null;
  
  // === DRAG EVENTS ===
  wave.addEventListener('mousedown', e => {
    isDown = true;
    startX = e.pageX - wave.offsetLeft;
    startScroll = wave.scrollLeft;
    lastX = startX;
    cancelAnimationFrame(dragMomentumId);
    wave.classList.add('dragging');
    e.preventDefault();
  });
  
  wave.addEventListener('mousemove', e => {
    if (!isDown) return;
    const x = e.pageX - wave.offsetLeft;
    const delta = x - startX;
    dragVelocity = x - lastX;
    lastX = x;
    wave.scrollLeft = startScroll - delta;
  });
  
  ['mouseup', 'mouseleave'].forEach(evt =>
    wave.addEventListener(evt, () => {
      if (!isDown) return;
      isDown = false;
      wave.classList.remove('dragging');
      dragMomentum();
    })
  );
  
  // === DRAG INERTIA ===
  function dragMomentum() {
    if (Math.abs(dragVelocity) < DRAG_STOP_THRESHOLD) return;
    wave.scrollLeft -= dragVelocity;
    dragVelocity *= DRAG_DECELERATION;
    dragMomentumId = requestAnimationFrame(dragMomentum);
  }
  
  // === WHEEL EVENTS ===
  wave.addEventListener('wheel', e => {
    e.preventDefault();
  
    const scaledDelta = e.deltaY * WHEEL_SENSITIVITY;
    targetWheelVelocity += scaledDelta;
  
    clearTimeout(wheelTimeout);
    if (!wheelMomentumId) {
      wheelMomentum(); // begin loop if not running
    }
  
    wheelTimeout = setTimeout(() => {
      targetWheelVelocity = 0;
    }, WHEEL_IDLE_TIMEOUT);
  }, { passive: false });
  
  function wheelMomentum() {
    if (targetWheelVelocity !== 0) {
      // While user is still interacting: ease toward target
      wheelVelocity += (targetWheelVelocity - wheelVelocity) * WHEEL_ACCELERATION;
    } else {
      // After input stops: decelerate gradually
      wheelVelocity *= WHEEL_DECELERATION;
    }
  
    // Apply scroll
    wave.scrollLeft += wheelVelocity;
  
    // Continue if still moving
    if (Math.abs(wheelVelocity) > WHEEL_STOP_THRESHOLD || Math.abs(targetWheelVelocity) > WHEEL_STOP_THRESHOLD) {
      wheelMomentumId = requestAnimationFrame(wheelMomentum);
    } else {
      wheelVelocity = 0;
      targetWheelVelocity = 0;
      wheelMomentumId = null;
    }
  }
  
  
  
  














  const reader = new FileReader();

  // Add progress event listener
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentLoaded = Math.round((e.loaded / e.total) * 100);
      title.innerText = `Loading file... ${percentLoaded}%`;
    }
  };

  reader.onloadstart = () => {
    console.log("File reading started");
    title.innerText = "Starting file load...";
  };
  reader.onload = async e => {
    console.log("File fully loaded into memory");
    title.innerText = "Tweak the sliders!"
    try {
      const arrayBuffer = e.target.result;
      const ctx = new AudioContext();
      title.innerText = "Decoding audio... (Takes a few seconds)";
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      title.innerText = "Audio decoded, normalizing...";
      normalizeAudioBuffer(audioBuffer);
      precomputedPeaks = computePeaks(audioBuffer);

      console.log("Processing regions...");
      handleThresholdChange();
      drawRegions();

      console.log("Loading waveform...");
      wavesurfer.loadDecodedBuffer(audioBuffer);

      console.log("File processing complete");
    } catch (err) {
      console.error("Processing error:", err);
      title.innerText = `Processing error: ${err}. Try to play your file first. Maybe it doesn't have audio.`

    }
  };

  reader.onerror = () => {
    console.error("FileReader error:", reader.error);
  };

  reader.onabort = () => {
    console.warn("File reading aborted");
  };

  console.log("Starting readAsArrayBuffer...");
  reader.readAsArrayBuffer(file);
  console.log("readAsArrayBuffer called (this doesn't mean loading is complete)");
}

function computePeaks(buffer) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const peaks = [];
  const numberOfPeaks = 20000;

  const samplesPerChunk = Math.floor(data.length / numberOfPeaks);
  for (let i = 0; i < data.length; i += samplesPerChunk) {
    const slice = data.slice(i, i + samplesPerChunk);
    const peak = Math.max(...slice.map(Math.abs));
    const time = i / sampleRate;
    peaks.push({ time, peak });
  }
  return peaks;
}

function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t;
}

/**
 * Smoothly animates `el.scrollLeft` from its current value to `targetScroll`
 * over `duration` milliseconds, using an ease-in-out curve.
 */
function smoothScrollTo(el, targetScroll, duration = 1000) {
  
  const startScroll = el.scrollLeft;
  const change = targetScroll - startScroll;
  const startTime = performance.now();

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutQuad(progress);
    el.scrollLeft = startScroll + change * eased;

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

/**
 * Scrolls the waveform so that `timeInSec` lands in the center
 * of the visible area, easing over 1 second.
 */
function scrollToTimeSmooth(timeInSec) {
  const wave = document.querySelector('#waveform wave');
  if (!wavesurfer) return;
  const pxPerSec = wavesurfer.params.minPxPerSec;
  const targetPx = timeInSec * pxPerSec;
  // center it:
  const offset = wave.clientWidth / 2;
  let scrollPos = targetPx - offset;
  // clamp into valid range:
  scrollPos = Math.max(0, Math.min(scrollPos, wave.scrollWidth - wave.clientWidth));

  smoothScrollTo(wave, scrollPos, 1000);
}

// Usage: jumps in smoothly to 12.3 s
scrollToTimeSmooth(12.3);


function handleThresholdChange() {
  if (!audioBuffer) return;
  markSilentRegions();
}

function handleShrinkChange() {
  if (!audioBuffer) return;
  markSilentRegions();
}

function markSilentRegions() {
  const raw = +thresholdSlider.value / 100;
  const mapped = 0.5 * (Math.sin(Math.PI * (raw - 0.5)) + 1);
  const threshold = mapped * mapped;
  const shrinkMs = +shrinkSlider.value;

  let silent = false;
  let currentRegion = null;
  silentRegions = [];
  for (let i = 0; i < precomputedPeaks.length; i++) {
    const peakData = precomputedPeaks[i];
    const max = peakData.peak;
    const time = peakData.time;

    if (max <= threshold) {
      if (!silent) {
        currentRegion = { start: time };
        silent = true;
      }
    } else {
      if (silent) {
        currentRegion.end = time;
        if ((currentRegion.end - currentRegion.start) > 0.05) {
          silentRegions.push(currentRegion);
        }
        silent = false;
      }
    }
  }

  if (silent && currentRegion) {
    currentRegion.end = audioBuffer.duration;
    if ((currentRegion.end - currentRegion.start) > 0.05) {
      silentRegions.push(currentRegion);
    }
  }
  thresholdLine.style.display = 'block';
  title.innerText = "Silent parts in red will be removed - Tweak the sliders carefully :)"
  applyShrinkFilter(shrinkMs);
  drawRegions();
  updateStats();

}

function applyShrinkFilter(shrinkMs) {
  const shrink = shrinkMs / 1000;
  const duration = audioBuffer ? audioBuffer.duration : 0;

  silentRegions = silentRegions
    .map(region => {
      let start = region.start;
      let end = region.end;

      // Only shrink start if it's not at 0
      if (region.start > 0) {
        start = region.start + shrink;
      }

      // Only shrink end if it's not at duration
      if (region.end < duration) {
        end = region.end - shrink;
      }

      // Return null if invalid region after shrinking
      return start < end ? { start, end } : null;
    })
    .filter(region => region && (region.end - region.start) > 0.01);
}

function drawRegions() {

  if (!wavesurfer) return;
  Object.values(wavesurfer.regions.list).forEach(region => region.remove());

  silentRegions.forEach(region => {
    wavesurfer.addRegion({
      start: region.start,
      end: region.end,
      color: 'rgba(255,0,0,0.3)',
      drag: false,
      resize: false
    });
  });
}

function updateStats() {
  const originalDuration = audioBuffer ? (audioBuffer.duration || 0) : 0;
  let totalSilence = 0;
  silentRegions.forEach(region => {
    totalSilence += (region.end - region.start);
  });
  const timeSaved = totalSilence.toFixed(2);
  const percentSaved = (originalDuration ? (timeSaved / originalDuration * 100) : 0).toFixed(1);
  statsPanel.innerText = `Time saved: ${timeSaved}s - ${percentSaved}% shorter - ${silentRegions.length} silence regions`;
}

async function cutAudio() {
  if (!audioBuffer) return;

  // 1. Initial setup
  title.innerText = "Preparing...";
  await new Promise(r => setTimeout(r, 10));

  // 2. Process regions with progress
  title.innerText = "Processing regions (0%)...";
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  let outputChunks = [];
  let lastEnd = 0;

  for (let i = 0; i < silentRegions.length; i++) {
    const region = silentRegions[i];
    const startSample = Math.floor(lastEnd * sampleRate);
    const endSample = Math.floor(region.start * sampleRate);

    if (endSample > startSample) {
      outputChunks.push(channelData.slice(startSample, endSample));
    }
    lastEnd = region.end;

    // Update progress every few regions
    if (i % 3 === 0) {
      const percent = Math.floor((i / silentRegions.length) * 100);
      title.innerText = `Processing regions (${percent}%)...`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 3. Final segment
  await new Promise(r => setTimeout(r, 10));
  const startSample = Math.floor(lastEnd * sampleRate);
  const endSample = audioBuffer.length;
  if (endSample > startSample) {
    outputChunks.push(channelData.slice(startSample, endSample));
  }

  // 4. Create buffer in smaller chunks to prevent freezing
  const ctx = new AudioContext();
  const totalLength = outputChunks.reduce((sum, arr) => sum + arr.length, 0);
  const newBuffer = ctx.createBuffer(1, totalLength, sampleRate);
  const outputChannel = newBuffer.getChannelData(0);

  let writePosition = 0;
  const CHUNK_SIZE = 100000; // Process 100k samples at a time

  for (const chunk of outputChunks) {
    for (let i = 0; i < chunk.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, chunk.length);
      outputChannel.set(chunk.subarray(i, end), writePosition + i);

      // Update progress periodically
      if (i % (CHUNK_SIZE * 10) === 0) {
        const percent = Math.floor(((writePosition + i) / totalLength) * 100);
        await new Promise(r => setTimeout(r, 0));
        title.innerText = `Creating buffer (${percent}%)...`;
      }
    }
    writePosition += chunk.length;
  }

  title.innerText = "Encoding... (Takes a few seconds)";
  await new Promise(r => setTimeout(r, 10)); // Ensure UI renders

  try {
    lastBlob = outputFormat === 'mp3'
      ? await encodeMP3Async(newBuffer) // Modified to be async
      : await encodeWAVAsync(newBuffer); // Modified to be async

    audioPreview.src = URL.createObjectURL(lastBlob);
    title.innerText = "Done! Consider donating ❤";
    audioPreview.style.display = 'inline-block';
    downloadBtn.style.display = 'inline-block';
    scrollToBottomWithDelay()


  } catch (err) {
    title.innerText = "Encoding failed";
    console.error(err);
  }
}

// Modified encoder functions
function encodeMP3Async(buffer) {
  return new Promise(resolve => {
    setTimeout(() => {
      const result = encodeMP3(buffer);
      resolve(result);
    }, 0);
  });
}

function encodeWAVAsync(buffer) {
  return new Promise(resolve => {
    setTimeout(() => {
      const result = encodeWAV(buffer);
      resolve(result);
    }, 0);
  });
}

function encodeWAV(buffer) {
  return new Promise(resolve => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels = [];
    let pos = 0;

    function writeString(s) {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(pos++, s.charCodeAt(i));
      }
    }

    function write16bitSample(sample) {
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      pos += 2;
    }

    writeString('RIFF');
    view.setUint32(pos, length - 8, true); pos += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, numOfChan, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * 2, true); pos += 4;
    view.setUint16(pos, numOfChan * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    writeString('data');
    view.setUint32(pos, length - pos - 4, true); pos += 4;
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        write16bitSample(channels[channel][i]);
      }
    }

    resolve(new Blob([bufferArray], { type: "audio/wav" }));
  });
}

function encodeMP3(buffer) {
  const samples = buffer.getChannelData(0);
  const mp3enc = new lamejs.Mp3Encoder(1, buffer.sampleRate, 128);
  const blockSize = 1152;
  const data = [];

  function floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {

      output[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
    }
    return output;
  }

  for (let i = 0; i < samples.length; i += blockSize) {
    const slice = samples.subarray(i, i + blockSize);
    const mp3buf = mp3enc.encodeBuffer(floatTo16BitPCM(slice));
    if (mp3buf.length > 0) {
      data.push(new Int8Array(mp3buf));
    }
  }

  const endBuf = mp3enc.flush();
  if (endBuf.length > 0) {
    data.push(new Int8Array(endBuf));
  }

  return new Blob(data, { type: 'audio/mp3' });

}

function calculateNonSilentRanges() {
  const originalDuration = audioBuffer ? audioBuffer.duration : 0;
  let regions = [];

  let lastEnd = 0;
  title.innerText = "Getting ready..."
  silentRegions.forEach(region => {
    if (region.start > lastEnd) {
      regions.push({ start: lastEnd, end: region.start });
    }
    lastEnd = region.end;
  });

  if (lastEnd < originalDuration) {
    regions.push({ start: lastEnd, end: originalDuration });
  }

  return regions;
}

async function cutVideo() {
  if (!uploadedFile) {
    alert("Please upload a video first!");
    return;
  }

  const nonSilentRegions = calculateNonSilentRanges();
  console.log("Calculated non-silent regions:", nonSilentRegions);

  if (nonSilentRegions.length === 0) {
    alert("No silence detected — full video kept!");
    return;
  }

  const BATCH_SIZE = 30;
  let batchIndex = 0;
  const fullOutputBuffers = [];

  async function initFFmpeg() {
    const { createFFmpeg, fetchFile: ffetch } = window.FFmpegLib;
    ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load({
      classWorkerURL: new URL('/worker/worker.mjs', window.location.origin).href,
      workerOptions: { type: 'module' }
    });
    ffmpegLoaded = true;
  }

  if (!ffmpegLoaded) {
    console.log("Loading FFmpeg...");
    await initFFmpeg();
  }

  let totalParts = nonSilentRegions.length
  for (let batchStart = 0; batchStart < nonSilentRegions.length; batchStart += BATCH_SIZE) {
    const batchRegions = nonSilentRegions.slice(batchStart, batchStart + BATCH_SIZE);
    const segmentFileNames = [];
    console.log(`--- Processing batch ${batchIndex + 1} ---`);

    // Write input file again (after first batch or restart)
    await ffmpeg.writeFile('input.mp4', await fetchFile(uploadedFile));
    for (let i = 0; i < batchRegions.length; i++) {

      const region = batchRegions[i];
      const segmentIndex = batchStart + i;
      const outputName = `part${segmentIndex}.mp4`;
      segmentFileNames.push(outputName);
      scrollToTimeSmooth(region.start)
      title.innerText = `Encoding part ${segmentIndex + 1} of ${totalParts}...`
      wavesurfer.addRegion({
        start: region.start,
        end: region.end,
        color: 'rgba(0, 255, 0, 0.7)',
        drag: false,
        resize: false
      });

      const args = [
        '-ss', region.start.toFixed(6),
        '-i', 'input.mp4',
        '-to', (region.end - region.start).toFixed(6),
        '-c:v', 'libx264',
        '-crf', '20',
        '-preset', 'ultrafast',
        '-profile:v', 'high',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-threads', '0',
        '-avoid_negative_ts', '1',
        outputName
      ];

      await ffmpeg.exec(args);
    }

    // Concatenate this batch
    const batchOutputName = `final_batch_${batchIndex}.mp4`;
    await concatSegments(segmentFileNames, batchOutputName);

    // Read result to memory
    const batchData = await ffmpeg.readFile(batchOutputName);
    fullOutputBuffers.push(batchData);

    // Reset FFmpeg instance

    ffmpegLoaded = false;

    ffmpeg = null;
    console.log("FFmpeg exited after batch", batchIndex + 1);

    await initFFmpeg();
    batchIndex++;
  }

  // Save the buffers for further use (merge all batches, etc.)
  window.processedBatches = fullOutputBuffers;

  await mergeAllBatches();
}

async function mergeAllBatches() {
  if (!window.processedBatches || window.processedBatches.length === 0) {
    alert("No batches to merge. Run cutVideo() first.");
    return;
  }

  console.log("Merging all processed batches...");

  // Initialize FFmpeg
  const { createFFmpeg } = window.FFmpegLib;
  const ffmpegMerge = createFFmpeg({ log: true });
  await ffmpegMerge.load({
    classWorkerURL: new URL('/worker/worker.mjs', window.location.origin).href,
    workerOptions: { type: 'module' }
  });

  // Write all batch files and create list.txt
  const listLines = [];
  for (let i = 0; i < window.processedBatches.length; i++) {
    const filename = `final_batch_${i}.mp4`;
    await ffmpegMerge.writeFile(filename, window.processedBatches[i]);
    listLines.push(`file '${filename}'`);
  }

  await ffmpegMerge.writeFile('list.txt', listLines.join('\n'));

  // Concatenate batches
  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', 'list.txt',
    '-c', 'copy',
    'final_merged.mp4'
  ];

  await ffmpegMerge.exec(args);

  // Read final merged output
  const finalData = await ffmpegMerge.readFile('final_merged.mp4');
  const blob = new Blob([finalData.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  // Display or download
  const videoPreview = document.querySelector('#videoPreview');
  const downloadButton = document.querySelector('#downloadVideoBtn');
  title.innerText = "Done! Consider donating ❤";

  videoPreview.src = url;
  videoPreview.style.display = 'inline-block';
  downloadButton.style.display = 'inline-block';
  downloadButton.onclick = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'final_merged.mp4';
    a.click();
  };
  scrollToBottomWithDelay()
  console.log("Final video merged and loaded.");
}


async function concatSegments(fileNames, outputFileName = 'final.mp4') {
  await ffmpeg.writeFile('list.txt', fileNames.map(name => `file '${name}'`).join('\n'));

  const ffmpegArgs = [
    '-f', 'concat',
    '-safe', '0',
    '-i', 'list.txt',
    '-c', 'copy',
    outputFileName
  ];

  await ffmpeg.exec(ffmpegArgs);
}

async function scrollToBottomWithDelay(duration = 2000) {
  setTimeout(() => {
    scroll(duration);
  }, 1000);
}

function scroll(duration) {
  const start = window.scrollY;
  const end = document.documentElement.scrollHeight - window.innerHeight;
  const distance = end - start;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1); // cap at 1
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    window.scrollTo(0, start + distance * ease);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
