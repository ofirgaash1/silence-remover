import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/classes.js";
import "./style.css";
window.FFmpegLib = {
  createFFmpeg: (options) => new FFmpeg(options),
  fetchFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  },
};

// âœ… wait until global libs are defined, then call main()

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function runDelayedMain() {
  await delay(0); // Wait for the next event loop tick (effectively asynchronous)
  await main();
}

runDelayedMain();

let wavesurfer = null;
let audioBuffer = null;
let silentRegions = [];
let lastBlob = null;
let outputFormat = "mp3";
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

const title = document.getElementById("title");
const dropZone = document.getElementById("drop-zone");
const waveformDiv = document.getElementById("waveform");
const browseBtn = document.getElementById("drop-zone");
const fileInput = document.getElementById("audioFile");
const thresholdInput = document.getElementById("thresholdInput");
const shrinkSlider = document.getElementById("shrinkSlider");
const shrinkInput = document.getElementById("shrinkInput");
const formatButtons = document.querySelectorAll(".fmt-btn");
const cutButton = document.getElementById("cutAudio");
const audioPreview = document.getElementById("audioPreview");
const downloadBtn = document.getElementById("AudioDownloadBtn");
const cutVideoBtn = document.getElementById("cutVideoBtn");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const statsPanel = document.getElementById("statsPanel");
const vidTitle = document.getElementById("vidTitle");
const zoomSlider = document.getElementById("zoomSlider");
const zoomInput = document.getElementById("zoomInput");

const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdLine = document.getElementById("thresholdLine");
const waveform = document.getElementById("waveform");

thresholdSlider.addEventListener("input", updateThresholdLine);
function updateThresholdLine() {
  const raw = parseFloat(thresholdSlider.value) / 100;
  const mapped = 0.5 * (Math.sin(Math.PI * (raw - 0.5)) + 1);
  const threshold = mapped * mapped;

  const waveformHeight = waveform.offsetHeight;
  const centerY = waveformHeight / 2;
  const yPos = centerY * (1 - threshold); // line from center (0) to top (1)

  thresholdLine.style.top = `${yPos}px`;
}

function setupUIEvents() {
  vidTitle.style.display = "none";
  audioPreview.style.display = "none";

  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("dragover")
  );
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  thresholdSlider.addEventListener("input", (e) => {
    thresholdInput.value = e.target.value;
    handleThresholdChange();
  });
  thresholdInput.addEventListener("input", (e) => {
    thresholdSlider.value = e.target.value;
    handleThresholdChange();
  });

  shrinkSlider.addEventListener("input", (e) => {
    shrinkInput.value = e.target.value;
    handleShrinkChange();
  });
  shrinkInput.addEventListener("input", (e) => {
    shrinkSlider.value = e.target.value;
    handleShrinkChange();
  });

  formatButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      formatButtons.forEach((b) => {
        b.classList.remove("selected");
        b.innerText = b.dataset.format.toUpperCase();
      });
      btn.classList.add("selected");
      btn.innerText = `${btn.dataset.format.toUpperCase()} âœ“`;
      outputFormat = btn.dataset.format;
    });
  });

  cutButton.addEventListener("click", cutAudio);
  downloadBtn.addEventListener("click", () => {
    if (!lastBlob) return;
    const url = URL.createObjectURL(lastBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edited-audio.${outputFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  });

  cutVideoBtn.addEventListener("click", cutVideo);
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

  console.log("handleFile() called");
  window.uploadedFile = file;

  if (wavesurfer) wavesurfer.destroy();
  audioBuffer = null;
  silentRegions = [];
  lastBlob = null;
  audioPreview.src = "";
  videoPreview.src = "";

  dropZone.style.display = "none";
  waveformDiv.style.display = "block";

  updateThresholdLine(); // Ensure line is placed immediately

  wavesurfer = WaveSurfer.create({
    container: waveformDiv,
    cursorWidth: 0,
    height: 128,
    scrollParent: false,
    waveColor: "blue",
    progressColor: "blue",
    backend: "WebAudio",
    autoCenter: false, // may not do anything alone
    plugins: [WaveSurfer.regions.create({})],
  });

  wavesurfer.on("ready", () => {
    // Prevent zoom from auto-scrolling to playhead
    wavesurfer.drawer.recenter = () => {};
  });

  title.innerText = wavesurfer.params.minPxPerSec;

  const wave = document.querySelector("#waveform wave");

  // === CONFIGURABLE PARAMETERS ===
  const WHEEL_SENSITIVITY = 1 / 8; // scale wheel input
  const WHEEL_ACCELERATION = 0.15; // how quickly velocity ramps up
  const WHEEL_DECELERATION = 0.9; // how slowly it slows down
  const WHEEL_IDLE_TIMEOUT = 100; // ms to wait before deceleration starts

  const DRAG_DECELERATION = 0.95; // how slowly drag decays
  const DRAG_STOP_THRESHOLD = 0.001; // min velocity before stopping
  const WHEEL_STOP_THRESHOLD = 0.001; // min velocity before stopping

  let latestZoomValue = 50; // default zoom value
  let zoomTimeout = null;

  zoomSlider.addEventListener("input", (e) => {
    zoomInput.value = ((e.target.value * 100) / 8).toFixed(2);
    clearTimeout(zoomTimeout);
    latestZoomValue = e.target.valueAsNumber;

    // Debounce zoom: wait until user stops sliding
    zoomTimeout = setTimeout(() => {
      applyZoom(latestZoomValue);
    }, 1); // Increase for performance if needed
  });

  function applyZoom(zoomValue) {
    const scrollEl = wave; // Your scrollable container
    const duration = audioBuffer?.duration || wavesurfer.getDuration() || 1;
    const containerWidth = scrollEl.clientWidth;

    const currentPxPerSec =
      wavesurfer.params.minPxPerSec || scrollEl.scrollWidth / duration;

    const scrollLeft = scrollEl.scrollLeft;
    const centerPx = scrollLeft + containerWidth / 2;
    const centerTime = centerPx / currentPxPerSec;

    const newPxPerSec = containerWidth / duration + zoomValue ** 2;

    if (wavesurfer) {
      wavesurfer.zoom(newPxPerSec);

      // Now safe to apply scroll immediately â€” no more zoom "fighting"
      const newCenterPx = centerTime * newPxPerSec;
      scrollEl.scrollLeft = newCenterPx - containerWidth / 2;
    }

    title.innerText =
      "Click and drag the waveform, or use the scroll wheel over it";
  }

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
  wave.addEventListener("mousedown", (e) => {
    isDown = true;
    startX = e.pageX - wave.offsetLeft;
    startScroll = wave.scrollLeft;
    lastX = startX;
    cancelAnimationFrame(dragMomentumId);
    wave.classList.add("dragging");
    e.preventDefault();
  });

  wave.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const x = e.pageX - wave.offsetLeft;
    const delta = x - startX;
    dragVelocity = x - lastX;
    lastX = x;
    wave.scrollLeft = startScroll - delta;
  });

  ["mouseup", "mouseleave"].forEach((evt) =>
    wave.addEventListener(evt, () => {
      if (!isDown) return;
      isDown = false;
      wave.classList.remove("dragging");
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
  wave.addEventListener(
    "wheel",
    (e) => {
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
    },
    { passive: false }
  );

  function wheelMomentum() {
    if (targetWheelVelocity !== 0) {
      // While user is still interacting: ease toward target
      wheelVelocity +=
        (targetWheelVelocity - wheelVelocity) * WHEEL_ACCELERATION;
    } else {
      // After input stops: decelerate gradually
      wheelVelocity *= WHEEL_DECELERATION;
    }

    // Apply scroll
    wave.scrollLeft += wheelVelocity;

    // Continue if still moving
    if (
      Math.abs(wheelVelocity) > WHEEL_STOP_THRESHOLD ||
      Math.abs(targetWheelVelocity) > WHEEL_STOP_THRESHOLD
    ) {
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
  reader.onload = async (e) => {
    console.log("File fully loaded into memory");
    title.innerText = "Tweak the sliders!";
    try {
      const arrayBuffer = e.target.result;
      const ctx = new AudioContext();
      title.innerText = "Decoding audio... (Takes a few seconds)";
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      title.innerText = "Audio decoded, normalizing...";
      normalizeAudioBuffer(audioBuffer);
      precomputedPeaks = computePeaks(audioBuffer);
      autoAdjustThresholdSlider();
      console.log("Processing regions...");
      handleThresholdChange();
      drawRegions();

      console.log("Loading waveform...");
      wavesurfer.loadDecodedBuffer(audioBuffer);

      console.log("File processing complete");
    } catch (err) {
      console.error("Processing error:", err);
      title.innerText = `Processing error: ${err}. Try to play your file first. Maybe it doesn't have audio.`;
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
  console.log(
    "readAsArrayBuffer called (this doesn't mean loading is complete)"
  );
}

function computePeaks(buffer) {
  const originalDuration = audioBuffer ? audioBuffer.duration || 0 : 0;
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const peaks = [];
  const numberOfPeaks = 250 * Math.floor(audioBuffer.duration); // desired peaks per second * number of seconds

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
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
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
  const wave = document.querySelector("#waveform wave");
  if (!wavesurfer) return;
  const pxPerSec = wavesurfer.params.minPxPerSec;
  const targetPx = timeInSec * pxPerSec;
  // center it:
  const offset = wave.clientWidth / 2;
  let scrollPos = targetPx - offset;
  // clamp into valid range:
  scrollPos = Math.max(
    0,
    Math.min(scrollPos, wave.scrollWidth - wave.clientWidth)
  );

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

function applyShrinkFilter(shrinkMs, minRegionDuration) {
  const shrinkSec = shrinkMs / 1000;

  for (let region of silentRegions) {
    const duration = region.end - region.start;
    const reduction = Math.min(duration, shrinkSec);
    const newDuration = duration - reduction;

    // Keep it centered
    const center = (region.start + region.end) / 2;
    region.start = center - newDuration / 2;
    region.end = center + newDuration / 2;
  }

  // Remove any that became too short
  if (silentRegions.some((r) => r.end - r.start < minRegionDuration)) {
    silentRegions = enforceMinRegionDuration(silentRegions, minRegionDuration);
  }
}

function enforceMinRegionDuration(regions, minDuration) {
  if (!regions.length) return [];

  const merged = [{ ...regions[0] }];

  for (let i = 1; i < regions.length; i++) {
    const prev = merged[merged.length - 1];
    const current = regions[i];

    const gap = current.start - prev.end;

    if (gap < minDuration) {
      // Merge current into previous
      prev.end = current.end;
    } else {
      const duration = current.end - current.start;
      if (duration >= minDuration) {
        merged.push({ ...current });
      }
      // else skip this region entirely
    }
  }

  return merged;
}

function markSilentRegions() {
  const raw = +thresholdSlider.value / 100;
  const mapped = 0.5 * (Math.sin(Math.PI * (raw - 0.5)) + 1);
  const threshold = mapped * mapped;
  const shrinkMs = +shrinkSlider.value;
  const minRegionDuration = 0.1;

  silentRegions = [];
  let silent = false;
  let currentRegion = null;

  for (let i = 0; i < precomputedPeaks.length; i++) {
    const { peak: max, time } = precomputedPeaks[i];

    if (max <= threshold) {
      if (!silent) {
        if (currentRegion && time - currentRegion.end < minRegionDuration) {
          currentRegion.end = time;
        } else {
          currentRegion = { start: time };
        }
        silent = true;
      }
    } else {
      if (silent) {
        currentRegion.end = time;
        if (currentRegion.end - currentRegion.start > minRegionDuration) {
          silentRegions.push({ ...currentRegion });
        }
        silent = false;
        currentRegion = null;
      }
    }
  }

  if (silent && currentRegion) {
    currentRegion.end = audioBuffer.duration;
    if (currentRegion.end - currentRegion.start > minRegionDuration) {
      silentRegions.push({ ...currentRegion });
    }
  }

  applyShrinkFilter(shrinkMs, minRegionDuration);
  silentRegions = enforceMinRegionDuration(silentRegions, minRegionDuration);
  thresholdLine.style.display = "block";
  title.innerText =
    "Silent parts in red will be removed - Tweak the sliders carefully :)";
  drawRegions();
  updateStats();
}

function drawRegions() {
  if (!wavesurfer) return;
  Object.values(wavesurfer.regions.list).forEach((region) => region.remove());

  silentRegions.forEach((region) => {
    wavesurfer.addRegion({
      start: region.start,
      end: region.end,
      color: "rgba(255,0,0,0.3)",
      drag: false,
      resize: false,
    });
  });
}

function updateStats() {
  const originalDuration = audioBuffer ? audioBuffer.duration || 0 : 0;
  let totalSilence = 0;
  silentRegions.forEach((region) => {
    totalSilence += region.end - region.start;
  });
  const timeSaved = totalSilence.toFixed(2);
  const percentSaved = (
    originalDuration ? (timeSaved / originalDuration) * 100 : 0
  ).toFixed(1);
  let minutes = Math.floor(timeSaved / 60);
  let seconds = +(timeSaved % 60).toFixed(0); // round to 2 decimal places

  let timeDisplay = timeSaved > 60 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  statsPanel.innerText = `Time saved: ${timeDisplay} - ${percentSaved}% shorter - ${silentRegions.length} silence regions`;
}

async function cutAudio() {
  if (!audioBuffer) return;

  // 1. Initial setup
  title.innerText = "Preparing...";
  await new Promise((r) => setTimeout(r, 10));

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
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 3. Final segment
  await new Promise((r) => setTimeout(r, 10));
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
        await new Promise((r) => setTimeout(r, 0));
        title.innerText = `Creating buffer (${percent}%)...`;
      }
    }
    writePosition += chunk.length;
  }

  title.innerText = "Encoding... (Takes a few seconds)";
  await new Promise((r) => setTimeout(r, 10)); // Ensure UI renders

  try {
    lastBlob =
      outputFormat === "mp3"
        ? await encodeMP3Async(newBuffer) // Modified to be async
        : await encodeWAVAsync(newBuffer); // Modified to be async

    audioPreview.src = URL.createObjectURL(lastBlob);
    title.innerText = "Done! Consider donating â¤";
    audioPreview.style.display = "inline-block";
    downloadBtn.style.display = "inline-block";
    scrollToBottomWithDelay();
  } catch (err) {
    title.innerText = "Encoding failed";
    console.error(err);
  }
}

// Modified encoder functions
function encodeMP3Async(buffer) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = encodeMP3(buffer);
      resolve(result);
    }, 0);
  });
}

function encodeWAVAsync(buffer) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = encodeWAV(buffer);
      resolve(result);
    }, 0);
  });
}

function encodeWAV(buffer) {
  return new Promise((resolve) => {
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
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }

    writeString("RIFF");
    view.setUint32(pos, length - 8, true);
    pos += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(pos, 16, true);
    pos += 4;
    view.setUint16(pos, 1, true);
    pos += 2;
    view.setUint16(pos, numOfChan, true);
    pos += 2;
    view.setUint32(pos, buffer.sampleRate, true);
    pos += 4;
    view.setUint32(pos, buffer.sampleRate * 2, true);
    pos += 4;
    view.setUint16(pos, numOfChan * 2, true);
    pos += 2;
    view.setUint16(pos, 16, true);
    pos += 2;
    writeString("data");
    view.setUint32(pos, length - pos - 4, true);
    pos += 4;
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
      output[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
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

  return new Blob(data, { type: "audio/mp3" });
}

function calculateNonSilentRanges() {
  const originalDuration = audioBuffer ? audioBuffer.duration : 0;
  let regions = [];

  let lastEnd = 0;
  title.innerText = "Getting ready...";
  silentRegions.forEach((region) => {
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
  console.log("🧠 cutVideo() called");

  const uploadedFile = window.uploadedFile;
  console.log("📦 typeof uploadedFile:", typeof uploadedFile);
  console.log("📦 uploadedFile:", uploadedFile);

  if (!uploadedFile) {
    console.warn("❌ No uploaded file — exiting early.");
    return;
  }

  const nonSilentRegions = calculateNonSilentRanges();
  console.log("📏 nonSilentRegions:", nonSilentRegions);

  if (!nonSilentRegions?.length) {
    alert("No silence detected — full video kept!");
    return;
  }

  const psScriptLines = [];
  const bashScriptLines = [];
  const fileListLines = [];
  const allSegmentFileNames = [];

  const isElectron = typeof window.ElectronAPI?.cutOneSegment === "function";
  console.log("🧪 Running in Electron?", isElectron);

  if (isElectron) {
    console.log("⚡ Detected Electron — using native FFmpeg");

    // Serialize uploadedFile ONCE
    const uploadedFileSerialized = {
      name: uploadedFile.name,
      type: uploadedFile.type,
      buffer: await uploadedFile.arrayBuffer(),
    };
    console.log("📦 uploadedFileSerialized ready");

    for (let i = 0; i < nonSilentRegions.length; i++) {
      const region = nonSilentRegions[i];
      const outputName = `part${i}.mp4`;
      allSegmentFileNames.push(outputName);

      scrollToTimeSmooth(region.start);
      title.innerText = `Encoding part ${i + 1} of ${
        nonSilentRegions.length
      }...`;

      wavesurfer.addRegion({
        start: region.start,
        end: region.end,
        color: "rgba(0, 255, 0, 0.7)",
        drag: false,
        resize: false,
      });

      const start = region.start.toFixed(6);
      const duration = (region.end - region.start).toFixed(6);
      psScriptLines.push(
        `ffmpeg -ss ${start} -i input.mp4 -to ${duration} -c:v libx264 -crf 20 -preset ultrafast -profile:v high -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -threads 0 -avoid_negative_ts 1 ${outputName}`
      );
      bashScriptLines.push(
        `ffmpeg -ss ${start} -i input.mp4 -to ${duration} -c:v libx264 -crf 20 -preset ultrafast -profile:v high -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -threads 0 -avoid_negative_ts 1 ${outputName}`
      );
      fileListLines.push(`file '${outputName}'`);

      console.log(`📤 Calling ElectronAPI.cutOneSegment for part ${i}...`);
      await window.ElectronAPI.cutOneSegment(uploadedFileSerialized, {
        start: region.start,
        end: region.end,
        outputName,
      });
      console.log(`✅ Part ${i} done`);
    }

    console.log("🔗 Calling ElectronAPI.runMergeAndClean...");
    await window.ElectronAPI.runMergeAndClean(allSegmentFileNames);
    console.log("✅ Native Electron processing complete.");
  } else {
    console.log("🌐 Detected Web — falling back to browser FFmpeg");

    await cutVideoInBrowser(); // Make sure this exists
    console.log("✅ Web processing complete.");
  }

  // Output the generated scripts to textareas
  document.getElementById("psScript").value = psScriptLines.join("\n");
  document.getElementById("bashScript").value = bashScriptLines.join("\n");

  title.innerText =
    "✅ Done! You can now concatenate the parts or download scripts.";
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
    classWorkerURL: new URL("/worker/worker.mjs", window.location.origin).href,
    workerOptions: { type: "module" },
  });

  // Write all batch files and create list.txt
  const listLines = [];
  for (let i = 0; i < window.processedBatches.length; i++) {
    const filename = `final_batch_${i}.mp4`;
    await ffmpegMerge.writeFile(filename, window.processedBatches[i]);
    listLines.push(`file '${filename}'`);
  }

  await ffmpegMerge.writeFile("list.txt", listLines.join("\n"));

  // Concatenate batches
  const args = [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "list.txt",
    "-c",
    "copy",
    "final_merged.mp4",
  ];

  await ffmpegMerge.exec(args);

  // Read final merged output
  const finalData = await ffmpegMerge.readFile("final_merged.mp4");
  const blob = new Blob([finalData.buffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  // Display or download
  const videoPreview = document.querySelector("#videoPreview");
  title.innerText = "Done! Consider donating â¤";

  videoPreview.src = url;
  videoPreview.style.display = "inline-block";
  downloadVideoBtn.style.display = "inline-block";
  copyBtnBASH.style.display = "inline-block";
  copyBtnPS.style.display = "inline-block";
  downloadVideoBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "final_merged.mp4";
    a.click();
  };
  scrollToBottomWithDelay();
  console.log("Final video merged and loaded.");
}

async function concatSegments(fileNames, outputFileName = "final.mp4") {
  await ffmpeg.writeFile(
    "list.txt",
    fileNames.map((name) => `file '${name}'`).join("\n")
  );

  const ffmpegArgs = [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "list.txt",
    "-c",
    "copy",
    outputFileName,
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

document.addEventListener("DOMContentLoaded", () => {
  const copyBtnBASH = document.getElementById("copyBtnBASH");
  const copyBtnPS = document.getElementById("copyBtnPS");
  const psScript = document.getElementById("psScript");
  const bashScript = document.getElementById("bashScript");

  copyBtnPS.addEventListener("click", async () => {
    try {
      copyBtnPS.style.backgroundColor = "#2ecc71";
      copyBtnPS.innerText = "Copied PowerShell!";
      await navigator.clipboard.writeText(psScript.value);
      //alert('PowerShell script copied to clipboard!');
    } catch (err) {
      console.error("Failed to copy:", err);
      alert(
        "Failed to copy script. Your browser may not support clipboard access."
      );
    }
  });

  copyBtnBASH.addEventListener("click", async () => {
    try {
      copyBtnBASH.style.backgroundColor = "#2ecc71";
      copyBtnBASH.innerText = "Copied Bash!";
      await navigator.clipboard.writeText(bashScript.value);
      //alert('bash script copied to clipboard!');
    } catch (err) {
      console.error("Failed to copy:", err);
      alert(
        "Failed to copy script. Your browser may not support clipboard access."
      );
    }
  });
});

document
  .getElementById("invert")
  .addEventListener("click", invertSilentRegions);
function invertSilentRegions() {
  if (!silentRegions || silentRegions.length === 0) {
    alert("No silent regions to invert.");
    return;
  }

  const nonSilentRegions = [];
  let prevEnd = 0;

  for (let i = 0; i < silentRegions.length; i++) {
    const region = silentRegions[i];
    if (region.start > prevEnd) {
      nonSilentRegions.push({ start: prevEnd, end: region.start });
    }
    prevEnd = region.end;
  }

  // Final region, if any audio left at the end
  if (prevEnd < audioBuffer.duration) {
    nonSilentRegions.push({ start: prevEnd, end: audioBuffer.duration });
  }

  silentRegions = nonSilentRegions;

  drawRegions();
  updateStats();
}

function autoAdjustThresholdSlider() {
  const originalMin = 0;
  const originalMax = 100;
  const step = 0.5;

  const savedShrink = +shrinkSlider.value;
  shrinkSlider.value = 0; // avoid distortion during detection

  let foundMin = null;
  let foundMax = null;
  let prevFound = null;
  const originalThreshold = thresholdSlider.value;

  const scan = (from, to, direction) => {
    for (
      let val = from;
      direction > 0 ? val <= to : val >= to;
      val += direction * step
    ) {
      thresholdSlider.value = val;
      handleThresholdChange(); // triggers markSilentRegions
      const originalDuration = audioBuffer.duration || 0;

      let totalSilence = 0;
      for (const region of silentRegions) {
        totalSilence += region.end - region.start;
      }

      const timeSaved = totalSilence;
      const percentSaved = originalDuration
        ? (timeSaved / originalDuration) * 100
        : 0;

      if (direction > 0 && percentSaved > 0) {
        foundMin = prevFound;
        break;
      }

      if (direction < 0 && percentSaved < 100) {
        foundMax = prevFound;
        break;
      }
      prevFound = val;
    }
  };

  // Step 1: scan from 0 â†’ up
  scan(0, 100, 1);

  // Step 2: scan from 100 â†’ down
  scan(100, 0, -1);

  // Update slider bounds
  if (foundMin !== null) thresholdSlider.min = foundMin.toFixed(2);
  if (foundMax !== null) thresholdSlider.max = foundMax.toFixed(2);

  // Restore slider state
  thresholdSlider.value = originalThreshold;
  shrinkSlider.value = savedShrink;

  handleThresholdChange(); // reapply current threshold
  console.log(
    `Threshold range adjusted: ${thresholdSlider.min}% â€“ ${thresholdSlider.max}%`
  );
}
