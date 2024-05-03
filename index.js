var audioContext;
var sendButton;
var textToSend;
var isListeningCheckbox;
var samplesPerBitLabel;
var microphoneStream;
var microphoneNode;
var analyser;
var receivedDataTextarea;
var sentDataTextArea;
var receivedGraph;
var receivedData = [];
var MAX_BITS_DISPLAYED_ON_GRAPH = 11;
var MAX_DATA = 300;
var pauseTimeoutId;
var sampleIntervalId;

// 20 to 20,000 - human
var FREQUENCY_TONE = 18000;
var FREQUENCY_HIGH = 400;
var FREQUENCY_LOW = 500;
var FREQUENCY_DURATION = 100;
var FREQUENCY_THRESHOLD = 200;
var SAMPLE_DELAY_MS = 1;
var FFT_POWER = 10;
var LAST_BIT_PERCENT = 0.8;
var SMOOTHING_TIME_CONSTANT = 0;
var frequencyOverTime = [];
var bitStart = [];
var samplesPerBit = [];
var bitSampleCount = 0;
var PAUSE = false;
var PAUSE_AFTER_END = true;

function handleWindowLoad() {
  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');
  textToSend = document.getElementById('text-to-send');
  sentDataTextArea = document.getElementById('sent-data');
  samplesPerBitLabel = document.getElementById('samples-per-bit');
  document.getElementById('pause-after-end').checked = PAUSE_AFTER_END;
  document.getElementById('pause-after-end').addEventListener('change', event => {
    PAUSE_AFTER_END = event.target.checked;
    if(!PAUSE_AFTER_END) resumeGraph();
  })
  document.getElementById('bit-duration-text').addEventListener('input', (event) => {
    FREQUENCY_DURATION = parseInt(event.target.value);
    bitSampleCount = 0;
    samplesPerBit.length = 0;
    showSpeed();
  });
  document.getElementById('max-bits-displayed-on-graph').value= MAX_BITS_DISPLAYED_ON_GRAPH;
  document.getElementById('max-bits-displayed-on-graph').addEventListener('input', (event) => {
    MAX_BITS_DISPLAYED_ON_GRAPH = parseInt(event.target.value);
  })
  document.getElementById('bit-duration-text').value = FREQUENCY_DURATION;
  document.getElementById('amplitude-threshold-text').value = FREQUENCY_THRESHOLD;
  document.getElementById('frequency-high-text').value = FREQUENCY_HIGH;
  document.getElementById('frequency-low-text').value = FREQUENCY_LOW;
  document.getElementById('last-bit-percent').value = Math.floor(LAST_BIT_PERCENT * 100);
  document.getElementById('fft-size-power-text').value = FFT_POWER;
  document.getElementById('smoothing-time-constant-text').value = SMOOTHING_TIME_CONSTANT.toFixed(2);

  document.getElementById('amplitude-threshold-text').addEventListener('input', (event) => {
    FREQUENCY_THRESHOLD = parseInt(event.target.value);
  });
  document.getElementById('frequency-high-text').addEventListener('input', (event) => {
    FREQUENCY_HIGH = parseInt(event.target.value);
  });
  document.getElementById('frequency-low-text').addEventListener('input', (event) => {
    FREQUENCY_LOW = parseInt(event.target.value);
  });
  document.getElementById('last-bit-percent').addEventListener('input', (event) => {
    LAST_BIT_PERCENT = parseInt(event.target.value) / 100;
  });
  document.getElementById('fft-size-power-text').addEventListener('input', (event) => {
    FFT_POWER = parseInt(event.target.value);
    if(analyser) analyser.fftSize = 2 ** FFT_POWER;
    resetGraphData();
  });
  document.getElementById('smoothing-time-constant-text').addEventListener('input', event => {
    SMOOTHING_TIME_CONSTANT = parseFloat(event.target.value);
    if(analyser) analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  });
  document.getElementById('audio-context-sample-rate').innerText = getAudioContext().sampleRate.toLocaleString();
  // wire up events
  sendButton.addEventListener('click', handleSendButtonClick);
  isListeningCheckbox.addEventListener('click', handleListeningCheckbox);
  textToSend.addEventListener('keypress', handleTextToSendKeypress);
  showSpeed();
}

function showSpeed() {
  const baud = 1000 / FREQUENCY_DURATION;
  const bytes = baud / 8;
  document.getElementById('data-transfer-speed-bits-per-second').innerText = baud.toFixed(2);
  document.getElementById('data-transfer-speed-bytes-per-second').innerText = bytes.toFixed(2);
}

function handleTextToSendKeypress(event) {
  var keyCode = event.which || event.keyCode;
  var bits = keyCode.toString(2)
    .padStart(8, '0')
    .split('')
    .map(Number);
  sendBits(bits);
}
function getFrequency(bit) {
  return bit ? FREQUENCY_HIGH : FREQUENCY_LOW;
}
function sendBits(bits) {
  sentDataTextArea.value += bits.join('') + '\n';
  sentDataTextArea.scrollTop = sentDataTextArea.scrollHeight;
  var audioContext = getAudioContext();
  var oscillator = audioContext.createOscillator();
  var duration = bits.length * FREQUENCY_DURATION;
  for(var i = 0; i < bits.length; i++) {
    if(i > 0 && bits[i] === bits[i-1]) continue;
    var offset = ((i * FREQUENCY_DURATION)/1000);
    oscillator.frequency.setValueAtTime(
      getFrequency(bits[i]),
      audioContext.currentTime + offset
    );
  }
  resumeGraph();
  oscillator.connect(audioContext.destination);
  oscillator.start();
  window.setTimeout(function() { oscillator.stop(); }, duration);
}
function stopGraph() {
  PAUSE = true;
  if(sampleIntervalId) {
    window.clearInterval(sampleIntervalId);
    sampleIntervalId = undefined;
  }
}
function resumeGraph() {
  if(isListeningCheckbox.checked) {
    if(PAUSE) {
      PAUSE = false;
      sampleIntervalId = window.setInterval(collectSample, SAMPLE_DELAY_MS);
      resetGraphData();
      requestAnimationFrame(drawFrequencyData);  
    } else {
      PAUSE = false;
    }
  } else {
    PAUSE = false;
  }
}
function collectSample() {
  const time = performance.now();
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  const length = audioContext.sampleRate / analyser.fftSize;
  const {
    isHigh: wasHigh,
    isLow: wasLow,
    streamStarted: initialStreamStart = time,
    streamEnded: priorStreamEnded,
    bitIndex: priorBitIndex = -1
  } = frequencyOverTime[0] ?? {}
  analyser.getByteFrequencyData(frequencies);
  const data = { time, frequencies, length };
  const isHigh = canHear(FREQUENCY_HIGH, data);
  const isLow = canHear(FREQUENCY_LOW, data);
  data.isHigh = isHigh;
  data.isLow = isLow;
  if(isHigh || isLow) {
    // in a bit
    data.isBit = true;
    if(wasHigh || wasLow) {
      // continued bit stream
      data.streamStarted = initialStreamStart;
    } else {
      // new bit stream
      data.streamStarted = time;
    }
    // number of bit in the stream
    const bitIndex = data.bitIndex = Math.floor((time - initialStreamStart) / FREQUENCY_DURATION);
    if(priorBitIndex !== bitIndex && priorBitIndex !== -1) {
      processBitsReceived();
    }
  } else {
    data.isBit = false;
    data.bitIndex = -1;
    if(wasHigh || wasLow) {
      // just stopped
      data.streamStarted = -1;
      data.streamEnded = time;
      // update all prior values with stream end
      for(let i = 0; i < frequencyOverTime.length; i++) {
        if(frequencyOverTime[i].streamStarted === initialStreamStart) {
          frequencyOverTime[i].streamEnded = time;
        }
      }
      processBitsReceived();
      received('\n');
      if(PAUSE_AFTER_END && !pauseTimeoutId) {
         pauseTimeoutId = window.setTimeout(() => {
          pauseTimeoutId = undefined;
          if(PAUSE_AFTER_END) stopGraph();
        }, FREQUENCY_DURATION * 1.5);
      }
    } else {
      // continued stopping (or never started)
      data.streamEnded = priorStreamEnded;
    }
  }
  frequencyOverTime.unshift(data);
  truncateGraphData();
}
function processBitsReceived() {
  const {
    bitIndex,
    streamStarted
  } = frequencyOverTime[0];
  const bits = frequencyOverTime.filter(f => 
    f.bitIndex === bitIndex &&
    f.streamStarted === streamStarted
  );
  const bitEnded = bits[0].time;
  const bitStarted = streamStarted + (FREQUENCY_DURATION * bitIndex);
  const bitDuration = bitEnded - bitStarted;
  if(bitDuration < FREQUENCY_DURATION * LAST_BIT_PERCENT) {
    return;
  }
  // make sure majority qualifies as high bit
  const winnerIsHigh = bits.map(({isHigh, isLow, frequencies, length}) => {
    if(isHigh && isLow) {
      return amplitude(FREQUENCY_HIGH, {frequencies, length}) > 
        amplitude(FREQUENCY_LOW, {frequencies, length});
    }
    return isHigh;
  });
  const highCount = winnerIsHigh.filter(h => h).length;
  const lowCount = winnerIsHigh.filter(h => !h).length;
  if(highCount > lowCount) received('1'); else received('0');
}
function resetGraphData() {
  frequencyOverTime.length = 0;
  bitStart.length = 0;
}
function truncateGraphData() {
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const now = performance.now();
  let length = frequencyOverTime.length;
  while(length !== 0) {
    const time = frequencyOverTime[length-1].time;
    if(now - time > duration) length--;
    else break;
  }
  if(length !== frequencyOverTime.length) {
    frequencyOverTime.length = length;
    bitStart.length = length;
  }
}
function getAudioContext() {
  if(!audioContext) {
    audioContext = new (window.AudioContext || webkitAudioContext)();
  }
  if(audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function handleSendButtonClick() {
  var audioContext = getAudioContext();
  var oscillator = audioContext.createOscillator();
  oscillator.frequency.setValueAtTime(FREQUENCY_TONE, audioContext.currentTime);
  oscillator.connect(audioContext.destination);
  oscillator.start();
  window.setTimeout(function() { oscillator.stop(); }, 500);

}
function handleListeningCheckbox(e) {
  stopGraph();
  var audioContext = getAudioContext();
  function handleMicrophoneOn(stream) {
    microphoneStream = stream;
    microphoneNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
    analyser.fftSize = 2 ** FFT_POWER;
    microphoneNode.connect(analyser);
    resumeGraph();
  }
  function handleMicrophoneError(error) {
    console.error('Microphone Error', error);
  }
  if(e.target.checked) {
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          mandatory: {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            suppressLocalAudioPlayback: false,
            voiceIsolation: false
          },
          optional: []
        }
      })
      .then(handleMicrophoneOn)
      .catch(handleMicrophoneError)
  } else {
    if(microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = undefined;
    }
    if(analyser && microphoneNode) {
      try {
        analyser.disconnect(microphoneNode);
      } catch(e) {

      }
      microphoneNode = undefined;
      analyser = undefined;
    }
  }
}
function received(value) {
  receivedDataTextarea.value += value;
  receivedDataTextarea.scrollTop = receivedDataTextarea.scrollHeight;
}
let bitStarted;
let lastBitStarted;
let bitEnded;
let bitHighStrength = [];
let bitLowStrength = [];
let lastBitIndex = 0;

function canHear(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i] > FREQUENCY_THRESHOLD;
}
function amplitude(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i];
}
const sum = (total, value) => total + value;

function evaluateBit(highBits, lowBits) {
  let highCount = highBits.reduce(
    (count, highAmplitude, i) => 
      count += highAmplitude > lowBits[i] ? 1 : 0
    , 0
  );
  return highCount >= (highBits.length / 2) ? '1' : '0';
}

function avgLabel(array) {
  const values = array.filter(v => v > 0);
  if(values.length === 0) return 'N/A';
  return (values.reduce((t, v) => t + v, 0) / values.length).toFixed(2)
}
function drawBitDurationLines(ctx, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;

  const streamTimes = frequencyOverTime.filter((v, i, a) => {
    return v.streamStarted !== -1 && (
      i === 0 ||
      a[i-1].streamStarted !== v.streamStarted
    )
  });

  ctx.strokeStyle = color;
  streamTimes.forEach(({ streamStarted, streamEnded = newest}) => {
    for(let time = streamStarted; time < streamEnded; time += FREQUENCY_DURATION) {
      if(newest - time > duration) continue;
      const x = ((newest - time) / duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();  
    }
    // write end as well
    const x = ((newest - streamEnded) / duration) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();  
});
}

function drawBitStart(ctx, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  for(let i = 0; i < bitStart.length; i++) {
    if(!bitStart[i]) continue;
    const {time} = frequencyOverTime[i];
    if(newest - time > duration) continue;
    const x = ((newest - time) / duration) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}
function drawFrequencyLineGraph(ctx, hz, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {frequencies, time, length} = frequencyOverTime[i];
    if(newest - time > duration) continue;
    const x = ((newest - time) / duration) * width;

    var index = Math.round(hz / length);
    const amplitude = frequencies[index];
    const y = (1-(amplitude / MAX_DATA)) * height;
    if(i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke();
}
function drawFrequencyDots(ctx, hz, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  
  const radius = 2;
  const border = 0.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = border;
  const fullCircle = 2 * Math.PI;
for(let i = 0; i < frequencyOverTime.length; i++) {
    const {frequencies, time} = frequencyOverTime[i];
    if(newest - time > duration) continue;
    const x = ((newest - time) / duration) * width;

    var length = (audioContext.sampleRate / analyser.fftSize);
    var index = Math.round(hz / length);
    const amplitude = frequencies[index];
    const y = (1-(amplitude / MAX_DATA)) * height;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, fullCircle);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius + border, 0, fullCircle);
    ctx.stroke();
  }
}
function drawFrequencyData() {
  if(PAUSE) return;
  if(frequencyOverTime.length === 0) {
    requestAnimationFrame(drawFrequencyData);
    return;
  }
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  
  const thresholdY = (1 - (FREQUENCY_THRESHOLD/MAX_DATA)) * height;
  ctx.strokeStyle = 'grey';
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  drawBitDurationLines(ctx, 'yellow');
  drawBitStart(ctx, 'green');
  drawFrequencyLineGraph(ctx, FREQUENCY_HIGH, 'red');
  drawFrequencyLineGraph(ctx, FREQUENCY_LOW, 'blue');
  drawFrequencyDots(ctx, FREQUENCY_HIGH, 'red');
  drawFrequencyDots(ctx, FREQUENCY_LOW, 'blue');

  requestAnimationFrame(drawFrequencyData);
}

function drawReceivedData() {
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  const segmentWidth = (1 / MAX_BITS_DISPLAYED_ON_GRAPH) * width;
  ctx.clearRect(0, 0, width, height);
  const sorted = receivedData.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  ctx.beginPath();
  for(let i = 0; i < MAX_BITS_DISPLAYED_ON_GRAPH && i < receivedData.length; i++) {
    const value = receivedData[i];
    const y = (1-(value / range)) * height;
    if(i === 0) {
      ctx.moveTo(0, y);
    } else {
      ctx.lineTo(segmentWidth * i, y)
    }
  }
  ctx.stroke();
}


window.addEventListener('load', handleWindowLoad);