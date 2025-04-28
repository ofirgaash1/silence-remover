// —— Globals ——
let wavesurfer = null;
let audioBuffer = null;
let silentRegions = [];
let lastBlob = null;
let outputFormat = 'mp3'; // default

// —— Element references ——
const dropZone = document.getElementById('drop-zone');
const waveformDiv = document.getElementById('waveform');
const browseBtn = document.getElementById('browseBtn');
const fileInput = document.getElementById('audioFile');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdInput = document.getElementById('thresholdInput');
const shrinkSlider = document.getElementById('shrinkSlider');
const shrinkInput = document.getElementById('shrinkInput');
const formatButtons = document.querySelectorAll('.fmt-btn');
const exportButton = document.getElementById('exportRanges');
const cutButton = document.getElementById('cutAudio');
const audioPreview = document.getElementById('audioPreview');
const downloadBtn = document.getElementById('downloadBtn');

// —— Setup UI Events ——

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

// Threshold sliders + input syncing
thresholdSlider.addEventListener('input', e => {
  thresholdInput.value = e.target.value;
  handleThresholdChange();
});
thresholdInput.addEventListener('input', e => {
  thresholdSlider.value = e.target.value;
  handleThresholdChange();
});

// Shrink sliders + input syncing
shrinkSlider.addEventListener('input', e => {
  shrinkInput.value = e.target.value;
  handleShrinkChange();
});
shrinkInput.addEventListener('input', e => {
  shrinkSlider.value = e.target.value;
  handleShrinkChange();
});

// Auto-cut when slider value changes (mouseup / blur)
thresholdSlider.addEventListener('change', cutAudio);
thresholdInput.addEventListener('change', cutAudio);
shrinkSlider.addEventListener('change', cutAudio);
shrinkInput.addEventListener('change', cutAudio);

// Format toggle buttons
formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      formatButtons.forEach(b => {
        b.classList.remove('selected');
        b.innerText = b.dataset.format.toUpperCase();
      });
      btn.classList.add('selected');
      btn.innerText = `${btn.dataset.format.toUpperCase()} ✓`;
      outputFormat = btn.dataset.format;
      cutAudio();
    });
  });
  

// Export button
exportButton.addEventListener('click', exportSilentRanges);

// Cut button
cutButton.addEventListener('click', cutAudio);

// Download button
downloadBtn.addEventListener('click', () => {
  if (!lastBlob) return;
  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edited-audio.${outputFormat}`;
  a.click();
  URL.revokeObjectURL(url);
});

// —— Core functions ——

function handleFile(file) {
    if (!file) return;
  
    if (wavesurfer) wavesurfer.destroy();
    audioBuffer = null;
    silentRegions = [];
    lastBlob = null;
    audioPreview.src = '';
  
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
    
      
      // 🛠 RIGHT HERE — detect silence IMMEDIATELY
      markSilentRegions();
      drawRegions();
      cutAudio();
  
      // Then load into WaveSurfer
      wavesurfer.loadDecodedBuffer(audioBuffer);
  
      // Optional: still listen for visual ready
      wavesurfer.on('ready', () => {
        dropZone.style.display = 'none';
        waveformDiv.style.display = 'block';
      });
    };
    reader.readAsArrayBuffer(file);
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

  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const samplesPerPixel = Math.floor(sampleRate / 100);
  let silent = false;
  let currentRegion = null;
  silentRegions = [];

  for (let i = 0; i < data.length; i += samplesPerPixel) {
    const slice = data.slice(i, i + samplesPerPixel);
    const max = Math.max(...slice.map(Math.abs));
    const time = i / sampleRate;

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
    currentRegion.end = data.length / sampleRate;
    if ((currentRegion.end - currentRegion.start) > 0.05) {
      silentRegions.push(currentRegion);
    }
  }
  
  applyShrinkFilter(shrinkMs);
  mergeOverlappingRegions();
  drawRegions();
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

function mergeOverlappingRegions() {
  if (silentRegions.length <= 1) return;
  silentRegions.sort((a, b) => a.start - b.start);

  const merged = [silentRegions[0]];
  for (let i = 1; i < silentRegions.length; i++) {
    const last = merged[merged.length - 1];
    const current = silentRegions[i];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  silentRegions = merged;
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

function exportSilentRanges() {
  if (!silentRegions.length) {
    alert('No silent regions detected.');
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(silentRegions, null, 2))
    .then(() => alert('Silent ranges copied to clipboard and console.'));
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
