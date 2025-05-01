

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

const dropZone = document.getElementById('drop-zone');
const waveformDiv = document.getElementById('waveform');
const browseBtn = document.getElementById('browseBtn');
const fileInput = document.getElementById('audioFile');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdInput = document.getElementById('thresholdInput');
const shrinkSlider = document.getElementById('shrinkSlider');
const shrinkInput = document.getElementById('shrinkInput');
const formatButtons = document.querySelectorAll('.fmt-btn');
const cutButton = document.getElementById('cutAudio');
const audioPreview = document.getElementById('audioPreview');
const downloadBtn = document.getElementById('downloadBtn');
const cutVideoBtn = document.getElementById('cutVideoBtn');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const statsPanel = document.getElementById('statsPanel');

function setupUIEvents() {
  

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

  uploadedFile = file;
  if (wavesurfer) wavesurfer.destroy();
  audioBuffer = null;
  silentRegions = [];
  lastBlob = null;
  audioPreview.src = '';
  videoPreview.src = '';
  downloadVideoBtn.style.display = 'none';

  dropZone.style.display = 'none';
  waveformDiv.style.display = 'block';

  wavesurfer = WaveSurfer.create({
    container: waveformDiv,
    waveColor: 'blue',
    progressColor: 'blue',
    backend: 'WebAudio',
    plugins: [ WaveSurfer.regions.create({}) ]
  });

  const reader = new FileReader();
  reader.onload = async e => {
    const arrayBuffer = e.target.result;
    const ctx = new AudioContext();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    normalizeAudioBuffer(audioBuffer);
    precomputedPeaks = computePeaks(audioBuffer);

    handleThresholdChange(); // calculate initial regions
    drawRegions();

    wavesurfer.loadDecodedBuffer(audioBuffer);
  };
  reader.readAsArrayBuffer(file);
}

function computePeaks(buffer) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const peaks = [];
  const numberOfPeaks = 8000;

  const samplesPerChunk = Math.floor(data.length / numberOfPeaks);
  for (let i = 0; i < data.length; i += samplesPerChunk) {
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
    const peakData = precomputedPeaks[i];
    const max = peakData.peak;
    const time = peakData.time;

    if (max < threshold) {
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
  silentRegions = silentRegions
    .map(region => {
      let start = region.start + shrink;
      let end = region.end - shrink;
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

function cutAudio() {
  if (!audioBuffer) return;

  const sampleRate = audioBuffer.sampleRate;
  const output = [];
  let lastEnd = 0;

  silentRegions.forEach(region => {
    const startSample = Math.floor(lastEnd * sampleRate);
    const endSample = Math.floor(region.start * sampleRate);
    if (endSample > startSample) {
      output.push(audioBuffer.getChannelData(0).slice(startSample, endSample));
    }
    lastEnd = region.end;
  });

  const startSample = Math.floor(lastEnd * sampleRate);
  const endSample = audioBuffer.length;
  if (endSample > startSample) {
    output.push(audioBuffer.getChannelData(0).slice(startSample, endSample));
  }

  const totalLength = output.reduce((acc, arr) => acc + arr.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  output.forEach(arr => {
    combined.set(arr, offset);
    offset += arr.length;
  });

  const ctx = new AudioContext();
  const newBuffer = ctx.createBuffer(1, combined.length, sampleRate);
  newBuffer.copyToChannel(combined, 0);

  if (outputFormat === 'mp3') {
    lastBlob = encodeMP3(newBuffer);
    audioPreview.src = URL.createObjectURL(lastBlob);
  } else {
    encodeWAV(newBuffer).then(blob => {
      lastBlob = blob;
      audioPreview.src = URL.createObjectURL(blob);
    });
  }
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

function displayVideoAndDownload(url, filename) {
  // Remove existing preview and download link if any
  const existingPreview = document.getElementById('videoPreview');
  if (existingPreview) existingPreview.remove();

  const existingDownload = document.getElementById('videoDownloadLink');
  if (existingDownload) existingDownload.remove();

  // Display video preview
  const videoPreview = document.createElement('video');
  videoPreview.id = 'videoPreview';
  videoPreview.src = url;
  videoPreview.controls = true;
  videoPreview.style.marginTop = '10px';
  videoPreview.style.maxWidth = '100%';
  document.body.appendChild(videoPreview);

  // Display download link
  const downloadLink = document.createElement('a');
  downloadLink.id = 'videoDownloadLink';
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.innerText = '⬇ Download Video';
  downloadLink.style.display = 'block';
  downloadLink.style.marginTop = '10px';
  downloadLink.style.fontSize = '18px';
  document.body.appendChild(downloadLink);
}

function calculateNonSilentRanges() {
  const originalDuration = audioBuffer ? audioBuffer.duration : 0;
  let regions = [];

  let lastEnd = 0;
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
  if (nonSilentRegions.length === 0) {
    alert("No silence detected — full video kept!");
    return;
  }

  processingIndicator.style.display = 'block';

  if (!ffmpegLoaded) {
    await ffmpeg.load({
      classWorkerURL: new URL('/worker/worker.mjs', window.location.origin).href,
      workerOptions: { type: 'module' }
    });
    ffmpegLoaded = true;
  }

  await ffmpeg.writeFile('input.mp4', await fetchFile(uploadedFile));

  const videoDuration = audioBuffer.duration;
  const keyframeTimes = [];
  const files = [];

  let currentTime = 0;
  let index = 0;

  while (currentTime < videoDuration - 0.05) {
    console.log("currentTime " + currentTime + " videoDuration: " + videoDuration);
    
    const outputName = `keyseg_${index}.mp4`;
    const args = [
      '-ss', currentTime.toFixed(6),
      '-to', (currentTime + 1).toFixed(6),
      '-i', 'input.mp4',
      '-c', 'copy',
      outputName
    ];

    try {
      console.log("index " + index);
      await ffmpeg.exec(args);
      console.log("args " + args);
    } catch (err) {
      console.error("Failed to cut key segment:", err);
      break;
    }

    const duration = await getDuration(outputName);
    console.log("duration of part " + duration);
    
    if (duration < 0.05) break; // Fail-safe

    currentTime += duration;
    console.log("currentTime " + currentTime);
    
    keyframeTimes.push(currentTime);
    files.push(outputName);
    index++;
  }

  console.log("Discovered keyframe times:", keyframeTimes);

  const segments = planSegments(nonSilentRegions, keyframeTimes);
  console.log("Segments to cut:", segments);

  // Cut segments (copy or reencode)
  try {
    for (let i = 0; i < segments.length; i++) {
      console.log(`Cutting segment ${i}:`, segments[i]);
      await cutSegment(segments[i], i);
    }
  } catch (err) {
    console.error("Cutting failed:", err);
    alert("Segment cutting failed. Check the console.");
    processingIndicator.style.display = 'none';
    return;
  }

  // Concat all processed segments
  try {
    console.log("Attempting to concat segments...");
    await concatSegments(segments.length);
    console.log("Concat finished");
  } catch (err) {
    console.error("Concat failed:", err);
    alert("Concat step failed. Check the console.");
    processingIndicator.style.display = 'none';
    return;
  }

  // Load final video
  try {
    const data = await ffmpeg.readFile('final.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    videoPreview.src = url;
    videoPreview.style.display = 'block';
    downloadVideoBtn.style.display = 'inline-block';
    downloadVideoBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'final.mp4';
      a.click();
    };
  } catch (err) {
    console.error("Failed to load final video:", err);
    alert("Could not load final output. Check console.");
  }

  processingIndicator.style.display = 'none';
}

async function getDuration(filename, timeout = 3000) {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`getDuration timed out for ${filename}`));
    }, timeout);

    try {
      const outputFile = `dur_${Date.now()}.txt`;
      await ffmpeg.ffprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filename,
        '-o', outputFile
      ]);

      const result = await ffmpeg.readFile(outputFile, 'utf8');
      clearTimeout(timer);

      const value = parseFloat(result);
      if (isNaN(value)) throw new Error("Duration is NaN");
      resolve(value);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}


async function concatSegments(count) {
  console.log(`Starting concat of ${count} segments...`);

  const inputArgs = [];
  const concatFilterParts = [];

  const files = await ffmpeg.listDir('/');
  console.log("FFmpeg FS before concat:", files);

  // ✅ Verify each input file exists
  for (let i = 0; i < count; i++) {
    const filename = `part${i}.mp4`;
    if (!files.includes(filename)) {
      console.error(`Missing input segment: ${filename}`);
      throw new Error(`Cannot concat: segment ${filename} not found`);
    }

    inputArgs.push('-i', filename);
    concatFilterParts.push(`[${i}:v:0][${i}:a:0]`);
  }

  const concatFilter = `${concatFilterParts.join('')}concat=n=${count}:v=1:a=1[outv][outa]`;

  const ffmpegArgs = [
    ...inputArgs,
    '-filter_complex', concatFilter,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    'final.mp4'
  ];

  console.log("Running FFmpeg concat with args:", ffmpegArgs);

  try {
    await ffmpeg.exec(ffmpegArgs);
    const afterFiles = await ffmpeg.listDir('/');
    console.log("FS after concat:", afterFiles);

    if (!afterFiles.includes('final.mp4')) {
      throw new Error("Concat step ran but did not produce final.mp4");
    }

    console.log("✅ Concat succeeded. Final video ready.");
  } catch (err) {
    console.error("❌ Concat failed:", err);
    const afterFailFiles = await ffmpeg.listDir('/');
    console.log("❌ FS after failed concat:", afterFailFiles);
    throw new Error("Concat step failed. See console for details.");
  }
}
