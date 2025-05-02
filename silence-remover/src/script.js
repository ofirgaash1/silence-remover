

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
const thresholdSlider = document.getElementById('thresholdSlider');
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
const audioTitle = document.getElementById('audioTitle');

function setupUIEvents() {
  downloadVideoBtn.style.display = 'none';
  vidTitle.style.display = 'none';
  audioTitle.style.display = 'none';
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

  wavesurfer = WaveSurfer.create({
    container: waveformDiv,
    waveColor: 'blue',
    progressColor: 'blue',
    backend: 'WebAudio',
    plugins: [WaveSurfer.regions.create({})]
  });

  const reader = new FileReader();
  
  // Add progress event listener
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentLoaded = Math.round((e.loaded / e.total) * 100);
      title.innerText = `Loading file... ${percentLoaded}%`;
    }
  };

  title.innerText = "test1"

  reader.onloadstart = () => {
    console.log("File reading started");
    title.innerText = "Starting file load...";
  };
title.innerText = "test2"
  reader.onload = async e => {
    console.log("File fully loaded into memory");
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
      
      processingIndicator.innerText = "";
      console.log("File processing complete");
    } catch (err) {
      console.error("Processing error:", err);
      processingIndicator.innerText = "Error processing file";
    }
  };

  reader.onerror = () => {
    console.error("FileReader error:", reader.error);
    processingIndicator.innerText = "File loading failed";
  };

  reader.onabort = () => {
    console.warn("File reading aborted");
    processingIndicator.innerText = "File loading aborted";
  };

  console.log("Starting readAsArrayBuffer...");
  reader.readAsArrayBuffer(file);
  console.log("readAsArrayBuffer called (this doesn't mean loading is complete)");
}

function computePeaks(buffer) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const peaks = [];
  const numberOfPeaks = 8000;

  const samplesPerChunk = Math.floor(data.length / numberOfPeaks);
  for (let i = 0; i < data.length; i += samplesPerChunk) {
    //title.innerText = `Computing peaks: ${i} / ${data.length}`
    const slice = data.slice(i, i + samplesPerChunk);
    const peak = Math.max(...slice.map(Math.abs));
    const time = i / sampleRate;
    peaks.push({ time, peak });
  }
  return peaks;
}

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
    //title.innerText = `Marking silent regions: ${i} / ${precomputedPeaks.length}`
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
  title.innerText = "for each 2"
  Object.values(wavesurfer.regions.list).forEach(region => region.remove());
  title.innerText = "for each 3"
  silentRegions.forEach(region => {
    wavesurfer.addRegion({
      start: region.start,
      end: region.end,
      color: 'rgba(255,0,0,0.3)',
      drag: false,
      resize: false
    });
  });
  title.innerText = "Tweak the sliders!"
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
  if (silentRegions.length > 120) {
    title.innerText = `${silentRegions.length} silence regions is too many. Max: 120. Tweak the sliders!`
  }
  else {
    title.innerText = "Silent parts in red will be removed - adjust carefully"
  }
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
    audioTitle.style.display = 'block';
    audioPreview.style.display = 'inline-block';
    downloadBtn.style.display = 'inline-block';
    setTimeout(() => {
      scrollToBottomWithDelay();
    }, 500);
    
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
      //if (i % 10 == 1) {
        //title.innerText = `${i}`}
      
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
  console.log("Calculadted non-silent regions:", nonSilentRegions);

  if (nonSilentRegions.length === 0) {
    alert("No silence detected — full video kept!");
    return;
  }

  if (!ffmpegLoaded) {
    console.log("FFmpeg not loaded, loading now...");
    await ffmpeg.load({
      classWorkerURL: new URL('/worker/worker.mjs', window.location.origin).href,
      workerOptions: { type: 'module' }
    });
    ffmpegLoaded = true;
    console.log("FFmpeg loaded successfully.");
  } else {
    console.log("FFmpeg already loaded.");
  }

  console.log("Writing input file to ffmpeg filesystem: input.mp4");
  await ffmpeg.writeFile('input.mp4', await fetchFile(uploadedFile));
  console.log("Input file written successfully.");

  const segmentFileNames = [];
  processingIndicator.innerText = 'Cutting non-silent segments...';
  console.log("Starting to cut non-silent segments...");

  try {
    title.innerText = `Cutting your video. Consider donating ❤`
    for (let i = 0; i < nonSilentRegions.length; i++) {
      const region = nonSilentRegions[i];
      const outputName = `part${i}.mp4`;
      segmentFileNames.push(outputName);

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
        // VIDEO
        '-c:v', 'libx264',          // Standard YouTube codec
        '-crf', '20',               // Sweet spot for YouTube-like quality
        '-preset', 'ultrafast',        // No size compression - around 2.5 larger files than input
        '-profile:v', 'high',       // YouTube-compatible profile
        '-pix_fmt', 'yuv420p',      // Standard YouTube pixel format
        '-movflags', '+faststart',  // Enable streaming
        // AUDIO
        '-c:a', 'aac',              // YouTube's audio codec
        '-b:a', '128k',             // YouTube-standard bitrate
        // PERFORMANCE
        '-threads', '0',            // Use all CPU cores
        '-avoid_negative_ts', '1',
        outputName
      ];
      
      console.log(`Executing ffmpeg for segment ${i}:`, args);
      await ffmpeg.exec(args);
      console.log(`Segment ${i} (${outputName}) created successfully.`);
      const filesAfterCut = await ffmpeg.listDir('/');
      console.log(`Files in ffmpeg filesystem after cutting segment ${i}:`, filesAfterCut);

      // Attempt to read the file immediately after writing
      console.log(`Attempting to read back segment ${outputName} immediately after writing...`);
      try {
        const data = await ffmpeg.readFile(outputName);
        console.log(`Successfully read back segment ${outputName}. Size: ${data.length}`);
      } catch (readErr) {
        console.error(`Error reading back segment ${outputName}:`, readErr);
      }
      const filesAfterReadBack = await ffmpeg.listDir('/');
      console.log(`Filesystem after reading back segment ${outputName}:`, filesAfterReadBack);
    }
  } catch (err) {
    console.error("Failed to cut segments:", err);
    alert("Segment cutting failed. Check the console.");
    return;
  }

  title.innerText = 'Concatenating segments...';
  console.log("Calling concatSegments with filenames:", segmentFileNames);

  try {
    await concatSegments(segmentFileNames);
    title.innerText = `Success. Consider donating ❤`
    vidTitle.style.display = 'block';
    videoPreview.style.display = 'inline-block';
    downloadVideoBtn.style.display = 'inline-block';
    setTimeout(() => {
      scrollToBottomWithDelay();
    }, 500);
    
    console.log("Concatenation completed successfully.");
  } catch (err) {
    console.error("Concat failed:", err);
    alert("Concatenation failed. Check the console.");
    return;
  }

  // Load final video
  try {
    console.log("Reading final.mp4 from ffmpeg filesystem...");
    const data = await ffmpeg.readFile('final.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    videoPreview.src = url;

    downloadVideoBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'final.mp4';
      a.click();
    };
    console.log("Final video loaded and URL created.");
  } catch (err) {
    console.error("Failed to load final video:", err);
    alert("Could not load final output. Check console.");
  }
}

async function concatSegments(fileNames) {
  console.log("--- START concatSegments (Corrected) ---");
  
  // Create progress tracking
  let progress = 0;
  const totalSteps = fileNames.length + 3; // Each file + init + finalize
  const updateProgress = () => {
    const percent = Math.round((progress / totalSteps) * 100);
    title.innerText = `Processing ${percent}% (${progress}/${totalSteps})`;
  };

  try {
    // Step 1: Prepare list
    progress++;
    updateProgress();
    await ffmpeg.writeFile('list.txt', fileNames.map(name => `file '${name}'`).join('\n'));

    // Step 2: Process each file (simulated progress)
    for (const [index, fileName] of fileNames.entries()) {
      progress++;
      updateProgress();
      
      // Fake delay to show progress (remove in production)
      await new Promise(r => setTimeout(r, 100)); 
    }

    // Step 3: Final concatenation
    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'list.txt',
      '-c', 'copy',
      'final.mp4'
    ];

    progress++;
    updateProgress();
    await ffmpeg.exec(ffmpegArgs);

    // Verify output
    if (!(await ffmpeg.listDir('/')).some(f => f.name === 'final.mp4')) {
      throw new Error("Output file missing");
    }

    progress = totalSteps;
    updateProgress();
    
  } catch (err) {
    title.innerText = "Error during concatenation";
    throw err;
  }
}




function scrollToBottomWithDelay(duration = 2000) {
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
