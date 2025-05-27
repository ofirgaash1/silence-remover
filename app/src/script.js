import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/classes.js";
import "./style.css";
window.FFmpegLib = {
  createFFmpeg: (options) => new FFmpeg(options),
  fetchFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  },
};

// … wait until global libs are defined, then call main()

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function runDelayedMain() {
  await delay(0); // Wait for the next event loop tick (effectively asynchronous)
  await main();
}

runDelayedMain();

export async function main() {
  console.warn("inside main");

  const { createFFmpeg, fetchFile: ffetch } = window.FFmpegLib;
  ffmpeg = createFFmpeg({ log: true });
  fetchFile = ffetch;

  setupUIEvents();
  updateBackground();
}

const title = document.getElementById("title");
const dropZone = document.getElementById("drop-zone");
const waveformDiv = document.getElementById("waveform");
const browseBtn = document.getElementById("drop-zone");
const fileInput = document.getElementById("audioFile");
const thresholdInput = document.getElementById("thresholdInput");
const shrinkSlider = document.getElementById("shrinkSlider");
const shrinkInput = document.getElementById("shrinkInput");
// const formatButtons = document.querySelectorAll(".fmt-btn");
const cutButton = document.getElementById("cutAudio");
const audioPreview = document.getElementById("audioPreview");
const downloadBtn = document.getElementById("AudioDownloadBtn");
const cutVideoBtn = document.getElementById("cutVideoBtn");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const statsPanel = document.getElementById("statsPanel");
const zoomSlider = document.getElementById("zoomSlider");
const zoomInput = document.getElementById("zoomInput");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdLine = document.getElementById("thresholdLine");
const waveform = document.getElementById("waveform");
const videoElement = document.getElementById("videoPreview2");
const videoElementContainer = document.getElementById("videoPreview2container");
//const PlayNonSilent = document.getElementById("Play-Non-Silent");
const sliders = document.querySelectorAll('input[type="range"]');
const currentTimeSpan = document.getElementById('currentTime');
const durationSpan = document.getElementById('duration');

let wave = null;
let wavesurfer = null;
let audioBuffer = null;
let silentRegions = [];
let lastBlob = null;
let outputFormat = "mp3";
let precomputedPeaks = [];
let ffmpeg;
let fetchFile;
let followScroll = true;
let textState = true;
let bigVideo = false;
let scrollTargetPx = null;
let scrollLoopActive = false;
let playState = {
  isPlaying: false,
  stopRequested: false,
  intervalId: null,
};

function updateBackground() {
  sliders.forEach((slider) => {
    const percentage =
      (100 * (slider.value - slider.min)) / (slider.max - slider.min);
    slider.style.setProperty("--value", `${percentage}%`);
  });
}

function setupUIEvents() {
  sliders.forEach((slider) => {
    slider.addEventListener("input", updateBackground);
  });

  thresholdSlider.addEventListener("input", updateThresholdLine);

  browseBtn.addEventListener("click", triggerFileLoad);

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Prevent accidental double-trigger
    fileInput.value = ""; // clear input so change fires again for same file
    handleFile(file);
  });

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

  videoPreview2.addEventListener('loadedmetadata', () => {
    const mins = Math.floor(videoPreview2.duration / 60);
    const secs = Math.floor(videoPreview2.duration % 60).toString().padStart(2, '0');
    durationSpan.textContent = `${mins}:${secs}`;
  });

  videoPreview2.addEventListener('timeupdate', () => {
    const mins = Math.floor(videoPreview2.currentTime / 60);
    const secs = Math.floor(videoPreview2.currentTime % 60).toString().padStart(2, '0');
    currentTimeSpan.textContent = `${mins}:${secs}`;
  });

  document
    .getElementById("invert")
    .addEventListener("click", invertSilentRegions);

  // formatButtons.forEach((btn) => {
  //   btn.addEventListener("click", () => {
  //     formatButtons.forEach((b) => {
  //       b.classList.remove("selected");
  //       b.innerText = b.dataset.format.toUpperCase();
  //     });
  //     btn.classList.add("selected");
  //     btn.innerText = `${btn.dataset.format.toUpperCase()} ✓`;
  //     outputFormat = btn.dataset.format;
  //   });
  // });

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

  fileInput.addEventListener("change", (e) => {
    if (window.ElectronAPI) {
      // Prevent accidental Electron fallback
      console.warn(
        "⚠️ Ignoring file input — Electron should use openVideoFile()"
      );
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    fileInput.value = ""; // clear input so change fires again for same file
    handleFile(file);
  });
  videoElementContainer.addEventListener("click", () => {
    playPause();
  });
  videoElementContainer.classList.add("small");

  // PlayNonSilent.addEventListener("click", () => {
  //   playPause();
  // });

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement.tagName;
    if (tag === "TEXTAREA" || document.activeElement.isContentEditable) return;

    if (e.code === "KeyF") {
      e.preventDefault();
      togglePreview();
    }

    if (e.code === "KeyS") {
      e.preventDefault();
      wavesurfer.seekTo(0);
      videoElement.currentTime = 0;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const newTime = Math.max(0, videoElement.currentTime - 10);
      videoElement.currentTime = newTime;
      wavesurfer.skip(-10);
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const newTime = Math.min(videoElement.duration, videoElement.currentTime + 10);
      videoElement.currentTime = newTime;
      wavesurfer.skip(10);
    }
  });




  document.addEventListener("keydown", function (event) {
    // Check if the spacebar was pressed
    if (event.code === "Space") {
      event.preventDefault(); // Prevent scrolling
      playPause(); // Your function to toggle play/pause
    }
  });

  zoomSlider.addEventListener("input", (e) => {
    zoomInput.value = ((e.target.value * 100) / 8).toFixed(2);
  });
}

function togglePreview() {
  bigVideo = !bigVideo;
  videoElementContainer.classList.toggle("small", !bigVideo);
  videoElementContainer.classList.toggle("big", bigVideo);
  btn.innerText = bigVideo ? "Minimize preview" : "Maximize preview";
}

function resetUIState() {
  console.warn("inside resetUIState()");
  //updatePlayButtonUI("start");
  if (wavesurfer) {
    wavesurfer.destroy();
    wavesurfer = null;
  }

  audioBuffer = null;
  silentRegions = [];
  lastBlob = null;
  audioPreview.src = "";
  //  videoPreview.src = "";

  dropZone.style.display = "none";
  waveformDiv.style.display = "block";
  updateThresholdLine();
}

///////////////////////
// SLIDERS RELATED
///////////////////////

function updateThresholdLine() {
  const raw = parseFloat(thresholdSlider.value) / 100;
  const mapped = 0.5 * (Math.sin(Math.PI * (raw - 0.5)) + 1);
  const threshold = mapped * mapped;

  const waveformHeight = waveform.offsetHeight;
  const centerY = waveformHeight / 2;
  const yPos = centerY * (1 - threshold); // line from center (0) to top (1)

  thresholdLine.style.top = `${yPos}px`;
}

function handleThresholdChange() {
  //console.warn("inside handleThresholdChange()");
  if (!audioBuffer && !precomputedPeaks) return;
  markSilentRegions();
}

function handleShrinkChange() {
  //console.warn("inside handleshrinkchange()");
  if (!audioBuffer && !precomputedPeaks) return;
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
///////////////////////
// PEAKS STUFF
///////////////////////

function normalizeAudioBuffer(buffer) {
  return;
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;

  // Step 1: Sum all channels to mono
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }

  // Step 2: Average to mono
  for (let i = 0; i < length; i++) {
    mono[i] /= numChannels;
  }

  // Step 3: Find peak
  let max = 0;
  for (let i = 0; i < length; i++) {
    const abs = Math.abs(mono[i]);
    if (abs > max) max = abs;
  }

  if (max === 0 || max === 1) return; // already normalized or silent

  // Step 4: Normalize
  const multiplier = 1.0 / max;
  for (let i = 0; i < length; i++) {
    mono[i] *= multiplier;
  }

  // Step 5: Write normalized mono back to all channels
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      channelData[i] = mono[i];
    }
  }
}

function computePeaks(monoArray, sampleRate) {
  const chunkDuration = 0.02; // 10ms
  const samplesPerChunk = Math.floor(sampleRate * chunkDuration);
  const length = monoArray.length;
  const peaks = [];

  for (let i = 0; i < length; i += samplesPerChunk) {
    let max = 0;
    const end = Math.min(i + samplesPerChunk, length);
    
    for (let j = i; j < end; j += 2) {
      const abs = Math.abs(monoArray[j]);
      if (abs > max) max = abs;
    }

    const time = i / sampleRate;
    peaks.push({ time, peak: max });
  }

  return peaks;
}

function enforceMinRegionDuration(regions, minDuration) {
  //console.warn("inside enforceMinRegionDuration()");
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

function calculateNonSilentRanges() {
  console.warn("inside calculateNonSilentRanges");

  const originalDuration =
    (audioBuffer && audioBuffer.duration) || wavesurfer.getDuration() || 0;

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

///////////////////////
// RED REGIONS
///////////////////////

function invertSilentRegions() {
  console.warn("inside invertSilentRegions");

  if (!silentRegions || silentRegions.length === 0) {
    alert("No silent regions to invert.");
    return;
  }

  const nonSilentRegions = [];
  let prevEnd = 0;

  const totalDuration =
    (audioBuffer && audioBuffer.duration) || wavesurfer.getDuration() || 0;

  for (let i = 0; i < silentRegions.length; i++) {
    const region = silentRegions[i];
    if (region.start > prevEnd) {
      nonSilentRegions.push({ start: prevEnd, end: region.start });
    }
    prevEnd = region.end;
  }

  if (prevEnd < totalDuration) {
    nonSilentRegions.push({ start: prevEnd, end: totalDuration });
  }

  silentRegions = nonSilentRegions;

  drawRegions();
  updateStats();
}

function autoAdjustThresholdSlider() {
  console.warn("inside function autoAdjustThresholdSlider() ");

  const step = 0.5;

  shrinkSlider.value = 0; // avoid distortion during detection

  let foundMin = null;
  let foundMax = null;
  let prevFound = null;

  const scan = (from, to, direction) => {
    for (
      let val = from;
      direction > 0 ? val <= to : val >= to;
      val += direction * step
    ) {
      thresholdSlider.value = val;
      handleThresholdChange(); // triggers markSilentRegions

      const originalDuration =
        (audioBuffer && audioBuffer.duration) || wavesurfer?.getDuration() || 0;

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

    zoomSlider.value = prevFound;
  };

  // Step 1: scan from 0 up
  scan(0, 100, 1);

  // Step 2: scan from 100 down
  scan(100, 0, -1);

  // Update slider bounds
  if (foundMin !== null) thresholdSlider.min = foundMin.toFixed(2);
  if (foundMax !== null) thresholdSlider.max = foundMax.toFixed(2);

  // Restore slider state
  thresholdSlider.value = 27;
  thresholdInput.value = 27;
  shrinkSlider.value = 40;
  shrinkInput.value = 40;
  zoomInput.value = 0;
  zoomSlider.value = 0;

  handleThresholdChange(); // reapply current threshold
  console.log(
    `Threshold range adjusted: ${thresholdSlider.min} - ${thresholdSlider.max}%`
  );
  zoomSlider.value = 0;
  updateBackground();
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
        const duration = currentRegion.end - currentRegion.start;

        if (duration > minRegionDuration) {
          silentRegions.push({ ...currentRegion });
        } else {
          silent = true;
        }

        silent = false;
        currentRegion = null;
      }
    }
  }

  if (silent && currentRegion) {
    const fallbackDuration =
      (audioBuffer && audioBuffer.duration) || wavesurfer.getDuration() || 0;
    currentRegion.end = fallbackDuration;

    const duration = currentRegion.end - currentRegion.start;
    //console.log("🔚 Final silent region to end of audio:", fallbackDuration.toFixed(3));
    //console.log(`⏱️ Region duration: ${duration.toFixed(3)}s`);

    if (duration > minRegionDuration) {
      silentRegions.push({ ...currentRegion });
      //console.log("✅ Final region pushed:", currentRegion);
    } else {
      //console.log("⏭️ Final region skipped (too short)");
    }
  }

  //console.log(`📦 Total silent regions detected: ${silentRegions.length}`);

  applyShrinkFilter(shrinkMs, minRegionDuration);
  silentRegions = enforceMinRegionDuration(silentRegions, minRegionDuration);

  thresholdLine.style.display = "block";
  title.innerText =
    "Silent parts in red will be removed - Tweak the sliders carefully :)";

  drawRegions();
  updateStats();
}

function drawRegions() {
  //console.warn("inside drawRegions...");

  if (!wavesurfer) {
    console.warn("⚠️ wavesurfer not initialized");
    return;
  }

  // Clear existing regions
  Object.values(wavesurfer.regions.list).forEach((region) => region.remove());

  //console.log(`🧠 silentRegions (${silentRegions.length}):`, silentRegions);

  let drawn = 0;

  silentRegions.forEach((region) => {
    if (region.start < region.end) {
      drawn += 1;
      wavesurfer.addRegion({
        start: region.start,
        end: region.end,
        color: "rgba(255,0,0,0.3)",
        drag: false,
        resize: false,
      });
    }
  });

  //console.log(`✅ drawn ${drawn} region(s)`);
}

function updateSegmentUI(region, index, total) {
  console.warn("inside updateSegmentUI()");

  scrollToTimeSmooth(region.start);
  title.innerText = `Encoding part ${index + 1} of ${total}...`;

  wavesurfer.addRegion({
    start: region.start,
    end: region.end,
    color: "rgba(0, 255, 0, 0.7)",
    drag: false,
    resize: false,
  });
}

///////////////////////
// WAVE & WAVESURFER
///////////////////////

function scrollToTimeSmooth(timeInSec) {
  const container = document.querySelector("#waveform wave");
  if (!wavesurfer || !container) return;

  const pxPerSec =
    wavesurfer.params.minPxPerSec ||
    container.scrollWidth / wavesurfer.getDuration();
  const targetPx = timeInSec * pxPerSec;

  const offset = container.clientWidth / 2;
  scrollTargetPx = Math.max(
    0,
    Math.min(targetPx - offset, container.scrollWidth - container.clientWidth)
  );

  if (!scrollLoopActive) {
    scrollLoopActive = true;
    requestAnimationFrame(smoothScrollLoop);
  }
}

function smoothScrollLoop() {
  const container = document.querySelector("#waveform wave");
  if (!container || scrollTargetPx === null) return;

  const currentScroll = container.scrollLeft;
  const delta = scrollTargetPx - currentScroll;

  // Scroll easing factor (adjust for speed)
  const easeFactor = 0.2;

  // Apply movement
  container.scrollLeft += delta * easeFactor;

  // If we're close to the target, snap and stop
  if (Math.abs(delta) < 1) {
    container.scrollLeft = scrollTargetPx;
    scrollLoopActive = false;
    return;
  }

  requestAnimationFrame(smoothScrollLoop);
}

function applyZoom(zoomValue, waveEl) {
  const duration = audioBuffer?.duration || wavesurfer.getDuration() || 1;
  const containerWidth = waveEl.clientWidth;

  const currentPxPerSec =
    wavesurfer.params.minPxPerSec || waveEl.scrollWidth / duration;
  const scrollLeft = waveEl.scrollLeft;
  const centerPx = scrollLeft + containerWidth / 2;
  const centerTime = centerPx / currentPxPerSec;
  const newPxPerSec = containerWidth / duration + zoomValue ** 2;

  wavesurfer.zoom(newPxPerSec);

  const newCenterPx = centerTime * newPxPerSec;
  waveEl.scrollLeft = newCenterPx - containerWidth / 2;

  title.innerText =
    "Click and drag the waveform";
}

function setupZoomAndScrollHandlers(wave) {
  const DRAG_DECELERATION = 0.95;
  const DRAG_STOP_THRESHOLD = 0.001;

  let latestZoomValue = 50;
  let zoomTimeout = null;

  zoomSlider.addEventListener("input", (e) => {
    latestZoomValue = e.target.valueAsNumber;

    zoomTimeout = setTimeout(() => {
      applyZoom(latestZoomValue, wave);
    }, 1);
  });

  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let dragVelocity = 0;
  let lastX = 0;
  let dragMomentumId = null;

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

  function dragMomentum() {
    if (Math.abs(dragVelocity) < DRAG_STOP_THRESHOLD) return;
    wave.scrollLeft -= dragVelocity;
    dragVelocity *= DRAG_DECELERATION;
    dragMomentumId = requestAnimationFrame(dragMomentum);
  }

}

function initializeWaveSurfer(backend = "WebAudio") {
  console.log("🛠️ Creating WaveSurfer with backend:", backend);
  wavesurfer = WaveSurfer.create({
    responsive: true,
    cursorWidth: 1.5,
    container: waveformDiv,
    height: 128,
    normalize: true,
    scrollParent: false,
    waveColor: "blue",
    progressColor: "blue",
    backend,
    autoCenter: false,
    plugins: [WaveSurfer.regions.create({})],
  });
  wavesurfer.on("finish", () => {
    console.log("✅ Playback finished");
    playState.isPlaying = false;
    //updatePlayButtonUI("play");
  });
  wavesurfer.on('seek', function (progress) {
    console.log("seeking!!!!");

    videoElement.currentTime = progress * videoElement.duration;
  });
  return document.querySelector("#waveform wave");
}

///////////////////////
// HANDLING FILE
///////////////////////

async function triggerFileLoad() {
  if (window.ElectronAPI) {
    const filePath = await window.ElectronAPI.openVideoFile();
    if (filePath) {
      await handleFile({ path: filePath }); // ← guaranteed to have .path
    }
  } else {
    console.log(
      `window.ElectronAPI = ${window.ElectronAPI} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`
    );

    fileInput.click(); // browser will trigger onchange → handleFile(file)
  }
}

function showLargeFileWarning() {
  if (document.getElementById("large-file-warning")) return; // prevent duplicates

  const warning = document.createElement("div");
  warning.id = "large-file-warning";
  warning.style.cssText = `
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    padding: 32px;
    font-size: 18px;
    border-radius: 6px;
    margin-top: 20px;
    text-align: center;
  `;

  warning.innerHTML = `
    ⚠️ This file is large and will not process well in your browser.<br>
    <a href="https://mega.nz/folder/PBtzhZqa#EcOfYukj90PzeAYlBa4LbA" target="_blank" style="color:#004085; text-decoration:underline;">
      Click here to download the desktop version of Silence Cutter
    </a>.
  `;

  const title = document.getElementById("title");
  if (title && title.parentNode) {
    title.parentNode.insertBefore(warning, title.nextSibling);
  }
}

async function handleFile(fileOrPath) {
  console.warn("inside handleFile");

  if (!fileOrPath) return;

  const isElectron = !!window.ElectronAPI;

  if (!isElectron && fileOrPath.size && fileOrPath.size >= 700 * 1024 * 1024) {
    showLargeFileWarning();
    return;
  }

  resetUIState();

  if (isElectron && fileOrPath.path) {
    console.log("⚡ Electron mode enabled");
    videoElement.src = fileOrPath.path; // In Electron, local paths work
    videoElement.style.display = "block";
    videoElementContainer.style.display = "flex";
    const filePath = fileOrPath.path;
    window.uploadedFile = { path: filePath }; // ✅ Set this immediately
    const sampleRate = 220.5;

    // ✅ Updated: Only return peaks and WAV path
    title.innerHTML = "Computing peaks...";
    const { peaks } = await window.ElectronAPI.extractWaveformPeaks(filePath);

    // Sanity check
    let minPeak = Infinity,
      maxPeak = -Infinity;
    for (const val of peaks) {
      if (val < minPeak) minPeak = val;
      if (val > maxPeak) maxPeak = val;
    }

    console.log(
      `🧪 Peak sanity check — min: ${minPeak.toFixed(
        3
      )}, max: ${maxPeak.toFixed(3)}`
    );
    if (minPeak < -1.01 || maxPeak > 1.01) {
      console.warn("⚠️ Peaks are outside expected [-1, 1] range.");
    } else if (minPeak === maxPeak) {
      console.warn("⚠️ All peaks identical — silent or corrupt?");
    } else {
      console.log("✅ Peaks look good.");
    }

    console.log("📦 Raw peak sample:", peaks.slice(0, 10));
    console.log("📏 Total peaks:", peaks.length);

    // Step 2: Prepare data for silence detection
    precomputedPeaks = peaks.map((p, i) => ({
      peak: Math.abs(p),
      time: i / sampleRate,
    }));

    // Step 3: Init WaveSurfer
    const arrayBuffer = await window.ElectronAPI.getNormalizedWavBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const wave = initializeWaveSurfer();
    setupZoomAndScrollHandlers(wave);
    wavesurfer.load(url);

    // Step 4: Analyze after ready
    wavesurfer.once("ready", () => {
      console.log("🟢 WaveSurfer ready");
      autoAdjustThresholdSlider();
      handleThresholdChange();
    });

    // Step 5: Store file reference

    window.uploadedFile = { path: filePath };
    console.log("✅ Normalized audio loaded and visualized");
    handleThresholdChange();
    return;
  }

  console.log("is browser!!!!!!!!!!");

  // 🌐 Browser path
  const file = fileOrPath;
  const url = URL.createObjectURL(file);
  videoElement.src = url;
  videoElement.style.display = "block";
  videoElementContainer.style.display = "flex";

  // ✅ Fix: Store the file for later use
  window.uploadedFile = file;
  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      title.innerText = `Loading file... ${percent}%`;
    }
  };

  reader.onloadstart = () => {
    title.innerText = "Starting file load...";
  };

  reader.onload = async (e) => {
    try {
      const arrayBuffer = e.target.result;
      const ctx = new AudioContext();
      title.innerText = "Decoding audio...";
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      title.innerText = "Normalizing...";
      normalizeAudioBuffer(audioBuffer); // in-place
      precomputedPeaks = computePeaks(
        audioBuffer.getChannelData(0),
        audioBuffer.sampleRate
      );

      const wave = initializeWaveSurfer();
      setupZoomAndScrollHandlers(wave);
      wavesurfer.loadDecodedBuffer(audioBuffer);
      autoAdjustThresholdSlider();
      handleThresholdChange();
    } catch (err) {
      title.innerText = `Audio decode error: ${err.message}`;
      console.error("❌ Audio decode error:", err);
    }
  };

  reader.onerror = () => {
    console.error("❌ FileReader error:", reader.error);
    title.innerText = "File load failed.";
  };
  reader.readAsArrayBuffer(file);
}

////////////////////////////
// PREVIEW AUDIO & VIDEO
////////////////////////////

// function updatePlayButtonUI(mode) {
//   PlayNonSilent.innerText = mode === "stop" ? "⏹ Stop" : "▶️ Play";
// }

function isTimeInSilentRegion(time) {
  return silentRegions.some((r) => time >= r.start && time < r.end);
}

function findNextNonSilentTime(time) {
  // Find the next time that's outside of a silent region
  for (const region of silentRegions) {
    if (time >= region.start && time < region.end) {
      return region.end;
    }
  }
  return null;
}

function startScrollFollowLoop() {
  if (!followScroll) return;

  const currentTime = wavesurfer.getCurrentTime();
  const duration = wavesurfer.getDuration() || 1;
  const scrollable = document.querySelector("#waveform wave");
  const containerWidth = scrollable.clientWidth;
  const pxPerSec = scrollable.scrollWidth / duration;
  const playheadPx = currentTime * pxPerSec;

  const targetScroll = playheadPx - containerWidth / 2;
  const scrollDelta = targetScroll - scrollable.scrollLeft;

  // Only move if there's a noticeable difference
  if (Math.abs(scrollDelta) > 2) {
    scrollable.scrollLeft += scrollDelta * 0.15;
  }

  requestAnimationFrame(startScrollFollowLoop);
}

function startLiveNonSilentPlayback(wave) {
  const currentTime = wavesurfer.getCurrentTime();
  playState.stopRequested = false;
  playState.isPlaying = true;
  //updatePlayButtonUI("stop");
  wavesurfer.play();
  playVideoFrom(currentTime);

  // Start interval for silence skipping
  playState.intervalId = setInterval(() => {
    if (playState.stopRequested) {
      videoElement.pause();
      console.log("🛑 Stop requested — stopping");
      clearInterval(playState.intervalId);
      followScroll = false;
      wavesurfer.pause();
      playState.isPlaying = false;
      //updatePlayButtonUI("play");
      return;
    }

    const currentTime = wavesurfer.getCurrentTime();

    if (isTimeInSilentRegion(currentTime)) {
      const skipTo = findNextNonSilentTime(currentTime);
      if (skipTo !== null) {
        playVideoFrom(skipTo);
        console.log(
          `⏭️ Skipping silence at ${currentTime.toFixed(2)} → ${skipTo.toFixed(
            2
          )}`
        );
        wavesurfer.play(skipTo);
        return;
      }
    }
  }, 50);
  // Start smooth scroll follow
  followScroll = true;
  startScrollFollowLoop();
}

function playPause() {
  if (!wavesurfer) {
    return;
  }

  if (document.getElementById("waveform").style.display == "none") {
    console.log("no waveform");
    if (textState) {
      console.log("was playing");
      //updatePlayButtonUI("stop");
      textState = false;
    } else {
      console.log("was stopped");
      //updatePlayButtonUI("start");
      textState = true;
    }
    return;
  }
  console.log("yes waveform");

  if (playState.isPlaying) {
    console.log("was playing");
    playState.stopRequested = true;
  } else {
    console.log("was stopped");
    startLiveNonSilentPlayback(wave);
  }
}

function playVideoFrom(seconds) {
  videoElement.currentTime = seconds;
  videoElement.removeAttribute("controls");
  videoElement.play();
  videoElement.removeAttribute("controls");
  videoElement.muted = true;
  videoElement.removeAttribute("controls");
}

function updateStats() {
  //console.warn("inside updateStats()");
  const originalDuration =
    (audioBuffer && audioBuffer.duration) || wavesurfer.getDuration() || 0;

  let totalSilence = 0;
  silentRegions.forEach((region) => {
    totalSilence += region.end - region.start;
  });

  const timeSaved = totalSilence.toFixed(2);
  const percentSaved = (
    originalDuration ? (totalSilence / originalDuration) * 100 : 0
  ).toFixed(1);

  const minutes = Math.floor(timeSaved / 60);
  const seconds = +(timeSaved % 60).toFixed(0);

  const timeDisplay =
    timeSaved > 60 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  statsPanel.innerText = `Time saved: ${timeDisplay} – ${percentSaved}% shorter – ${silentRegions.length} silence regions`;
}

////////////////////////////
// PROCESSING AUDIO
////////////////////////////

async function cutAudio() {
  console.warn("inside cutAudio");

  if (!audioBuffer) {
    alert(
      "currently, this is a browser only featue. if you are using browser, your file doesnt have sound."
    );
    return;
  }

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
    title.innerText = "Done! Consider donating ❤";
    audioPreview.style.display = "inline-block";
    downloadBtn.style.display = "inline-block";
    scrollToBottomWithDelay();
  } catch (err) {
    title.innerText = "Encoding failed";
    console.error(err);
  }
}

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
      view.setInt16(pos, sample < 0 ? sample * 0x44100 : sample * 0x7fff, true);
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

////////////////////////////
// PROCESSING VIDEO
////////////////////////////

async function cutVideo() {
  console.warn("inside cutVideo");

  console.log("🧠 cutVideo() called");

  const uploadedFile = window.uploadedFile;

  if (!uploadedFile) {
    console.warn("❌ No uploaded file — exiting early.");
    return;
  }

  const nonSilentRegions = calculateNonSilentRanges();
  if (!nonSilentRegions?.length) {
    alert("No silence detected — full video kept!");
    return;
  }

  const isElectron = typeof window.ElectronAPI?.cutOneSegment === "function";
  const totalParts = nonSilentRegions.length;

  const allSegmentFileNames = [];

  if (isElectron) {
    console.log("⚡ Detected Electron — using native FFmpeg");
    console.log(`window.uploadedFile.path: ${window.uploadedFile.path}`);

    const inputPath = window.uploadedFile.path; // set earlier in handleFile()
    if (!inputPath) {
      console.warn("❌ No input path set on uploadedFile");
      return;
    }

    for (let i = 0; i < totalParts; i++) {
      const region = nonSilentRegions[i];
      const outputName = `part${i}.mp4`;

      allSegmentFileNames.push(outputName);
      updateSegmentUI(region, i, totalParts);

      await window.ElectronAPI.cutOneSegment(
        { path: inputPath }, // ✅ Only pass file path
        { start: region.start, end: region.end, outputName }
      );
    }

    const finalPath = await window.ElectronAPI.runMergeAndClean(
      allSegmentFileNames
    );
    console.log(
      "✅ Native Electron processing complete. Final path:",
      finalPath
    );

    if (finalPath) {
      displayMergedVideoFromPath(finalPath);
    }
  } else {
    console.log("🌐 Detected Web — using ffmpeg.wasm");

    const BATCH_SIZE = 30;
    let ffmpegLoaded = false;
    let fullOutputBuffers = [];

    async function initFFmpeg() {
      console.warn("inside initFFmpeg");

      const { createFFmpeg } = window.FFmpegLib;
      ffmpeg = createFFmpeg({ log: true });
      await ffmpeg.load({
        classWorkerURL: new URL("/worker/worker.mjs", window.location.origin)
          .href,
        workerOptions: { type: "module" },
      });
      ffmpegLoaded = true;
    }

    if (!ffmpegLoaded) {
      await initFFmpeg();
    }

    for (
      let batchStart = 0;
      batchStart < totalParts;
      batchStart += BATCH_SIZE
    ) {
      const batch = nonSilentRegions.slice(batchStart, batchStart + BATCH_SIZE);
      const segmentFileNames = [];

      await ffmpeg.writeFile("input.mp4", await fetchFile(uploadedFile));

      for (let i = 0; i < batch.length; i++) {
        const index = batchStart + i;
        const region = batch[i];
        const outputName = `part${index}.mp4`;
        const start = region.start.toFixed(6);
        const duration = (region.end - region.start).toFixed(6);

        allSegmentFileNames.push(outputName);
        segmentFileNames.push(outputName);

        updateSegmentUI(region, index, totalParts);

        const args = [
          "-ss",
          start,
          "-i",
          "input.mp4",
          "-to",
          duration,
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
          outputName,
        ];

        await ffmpeg.exec(args);
      }

      await concatSegments(
        segmentFileNames,
        `final_batch_${batchStart / BATCH_SIZE}.mp4`
      );
      const batchData = await ffmpeg.readFile(
        `final_batch_${batchStart / BATCH_SIZE}.mp4`
      );
      fullOutputBuffers.push(batchData);

      ffmpegLoaded = false;
      ffmpeg = null;
      await initFFmpeg();
    }

    window.processedBatches = fullOutputBuffers;

    const finalBlob = await mergeProcessedBatchesWithFFmpegWASM();
    displayMergedVideo(finalBlob);
    console.log("✅ WASM processing complete.");
  }

  title.innerText =
    "✅ Done! You can now concatenate the parts or download scripts.";
}

async function mergeProcessedBatchesWithFFmpegWASM() {
  console.warn("inside mergeProcessedBatchesWithFFmpegWASM");

  const { createFFmpeg } = window.FFmpegLib;
  const ffmpegMerge = createFFmpeg({ log: true });

  await ffmpegMerge.load({
    classWorkerURL: new URL("/worker/worker.mjs", window.location.origin).href,
    workerOptions: { type: "module" },
  });

  const listLines = [];

  for (let i = 0; i < window.processedBatches.length; i++) {
    const filename = `final_batch_${i}.mp4`;
    await ffmpegMerge.writeFile(filename, window.processedBatches[i]);
    listLines.push(`file '${filename}'`);
  }

  await ffmpegMerge.writeFile("list.txt", listLines.join("\n"));

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

  const finalData = await ffmpegMerge.readFile("final_merged.mp4");
  return new Blob([finalData.buffer], { type: "video/mp4" });
}

function displayMergedVideo(blob) {
  console.warn("inside displayMergedVideo");

  const url = URL.createObjectURL(blob);
  //const videoPreview = document.querySelector("#videoPreview");

  // videoPreview.src = url;
  // videoPreview.style.display = "inline-block";
  downloadVideoBtn.style.display = "inline-block";

  title.innerText = "Done! Consider donating ❤️";

  downloadVideoBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "final_merged.mp4";
    a.click();
  };

  scrollToBottomWithDelay();
  console.log("Final video merged and loaded.");
}

function displayMergedVideoFromPath(filePath) {
  console.warn("inside displayMergedVideoFromPath");

  // const videoPreview = document.querySelector("#videoPreview");

  // videoPreview.src = filePath;
  // videoPreview.style.display = "inline-block";
  downloadVideoBtn.style.display = "inline-block";

  title.innerText = "Done! Consider donating ❤️";

  downloadVideoBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = filePath;
    a.download = "final_output.mp4";
    a.click();
  };

  scrollToBottomWithDelay();
  console.log("✅ Final video loaded from disk:", filePath);
}

async function concatSegments(fileNames, outputFileName = "final.mp4") {
  console.warn("inside concatSegments");

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
  console.warn("inside scrollToBottomWithDelay");
  setTimeout(() => {
    scroll(duration);
  }, 1000);
}

function scroll(duration) {
  console.warn("inside scroll");
  const start = window.scrollY;
  const end = document.documentElement.scrollHeight - window.innerHeight;
  const distance = end - start;
  const startTime = performance.now();

  function step(currentTime) {
    console.warn("inside step");

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



