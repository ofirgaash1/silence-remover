let wavesurfer;
let silentRegions = [];
let audioBuffer;
let threshold = 0.2; // 20% default
let shrinkMs = 100;  // 100ms default

const fileInput = document.getElementById('audioFile');
const thresholdSlider = document.getElementById('thresholdSlider');
const shrinkSlider = document.getElementById('shrinkSlider');
const thresholdValue = document.getElementById('thresholdValue');
const shrinkValue = document.getElementById('shrinkValue');
const exportButton = document.getElementById('exportRanges');
const cutButton = document.getElementById('cutAudio');
const audioPreview = document.getElementById('audioPreview');

fileInput.addEventListener('change', handleFile);
thresholdSlider.addEventListener('input', handleThresholdChange);
shrinkSlider.addEventListener('input', handleShrinkChange);
exportButton.addEventListener('click', exportSilentRanges);
cutButton.addEventListener('click', cutAudio);

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (wavesurfer) {
        wavesurfer.destroy();
    }

    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: 'lightblue',
        progressColor: 'blue',
        backend: 'WebAudio',
        plugins: [
            WaveSurfer.regions.create({})
        ]
    });


    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const audioContext = new AudioContext();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        wavesurfer.loadBlob(file);
        
        wavesurfer.on('ready', () => {
            markSilentRegions();
        });
    };
    reader.readAsArrayBuffer(file);
}

function handleThresholdChange(e) {
    const raw = e.target.value;
    const mapped = Math.pow(raw / 100, 2); // squared mapping
    threshold = mapped;
    thresholdValue.innerText = (mapped * 100).toFixed(1) + '%';
    if (wavesurfer && audioBuffer) {
        markSilentRegions();
    }
}


function handleShrinkChange(e) {
    shrinkMs = parseInt(e.target.value);
    shrinkValue.innerText = `${shrinkMs}ms`;
    if (wavesurfer && audioBuffer) {
        markSilentRegions();
    }
}

function markSilentRegions() {
    if (!audioBuffer) return;

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const samplesPerPixel = Math.floor(sampleRate / 100); // Analyze 100 samples per second
    const thresholdValue = threshold;

    let silent = false;
    let currentRegion = null;
    silentRegions = [];

    for (let i = 0; i < channelData.length; i += samplesPerPixel) {
        const slice = channelData.slice(i, i + samplesPerPixel);
        const max = Math.max(...slice.map(Math.abs));
        const time = i / sampleRate;

        if (max < thresholdValue) {
            if (!silent) {
                currentRegion = { start: time };
                silent = true;
            }
        } else {
            if (silent) {
                currentRegion.end = time;

                // ONLY ADD if wider than minimum duration
                if ((currentRegion.end - currentRegion.start) > 0.05) { // 50ms minimum
                    silentRegions.push(currentRegion);
                }

                silent = false;
            }
        }
    }

    if (silent && currentRegion) {
        currentRegion.end = channelData.length / sampleRate;
        if ((currentRegion.end - currentRegion.start) > 0.05) {
            silentRegions.push(currentRegion);
        }
    }

    applyShrink();
    mergeOverlappingRegions();
    drawRegions();
}



function applyShrink() {
    const shrink = shrinkMs / 1000; // convert ms to seconds

    silentRegions = silentRegions.map(region => {
        let start = region.start + shrink;
        let end = region.end - shrink;
        if (start >= end) {
            // If shrinking fully collapses the region, skip it
            return null;
        }
        return { start, end };
    }).filter(region => region && (region.end - region.start) > 0.01); // Keep only meaningful regions
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
            color: 'rgba(255,0,0,0.3)'
        });
    });
}

function exportSilentRanges() {
    if (!silentRegions.length) {
        alert('No silent regions detected yet!');
        return;
    }
    console.log('Silent Ranges:', silentRegions);
    alert('Silent ranges have been logged to the console.');
}

function cutAudio() {
    if (!audioBuffer || !silentRegions.length) return;

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

    // Add final piece
    const startSample = Math.floor(lastEnd * sampleRate);
    const endSample = audioBuffer.length;
    if (endSample > startSample) {
        output.push(audioBuffer.getChannelData(0).slice(startSample, endSample));
    }

    // Flatten
    const totalLength = output.reduce((acc, arr) => acc + arr.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    output.forEach(arr => {
        combined.set(arr, offset);
        offset += arr.length;
    });

    const audioContext = new AudioContext();
    const newBuffer = audioContext.createBuffer(1, combined.length, sampleRate);
    newBuffer.copyToChannel(combined, 0, 0);

    encodeWAV(newBuffer).then(wavBlob => {
        const url = URL.createObjectURL(wavBlob);
        audioPreview.src = url;
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

