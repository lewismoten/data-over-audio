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
var MINIMUM_FREQUENCY = 5000;
var MAXIMUM_FREQUENCY = 10000;
var FREQUENCY_DURATION = 100;
var FREQUENCY_THRESHOLD_PERCENT = .75;
var FREQUENCY_THRESHOLD = 150;
var FREQUENCY_RESOLUTION_MULTIPLIER = 2;
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
  document.getElementById('frequency-resolution-multiplier').value = FREQUENCY_RESOLUTION_MULTIPLIER;
  document.getElementById('frequency-resolution-multiplier').addEventListener('input', event => {
    FREQUENCY_RESOLUTION_MULTIPLIER = parseInt(event.target.value);
    showSpeed();
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
  document.getElementById('amplitude-threshold-text').value = Math.floor(FREQUENCY_THRESHOLD_PERCENT * 100);
  FREQUENCY_THRESHOLD = Math.floor(FREQUENCY_THRESHOLD_PERCENT * 255);
  document.getElementById('maximum-frequency').value = MAXIMUM_FREQUENCY;
  document.getElementById('minimum-frequency').value = MINIMUM_FREQUENCY;
  document.getElementById('last-bit-percent').value = Math.floor(LAST_BIT_PERCENT * 100);
  document.getElementById('fft-size-power-text').value = FFT_POWER;
  document.getElementById('smoothing-time-constant-text').value = SMOOTHING_TIME_CONSTANT.toFixed(2);

  document.getElementById('amplitude-threshold-text').addEventListener('input', (event) => {
    FREQUENCY_THRESHOLD_PERCENT = parseInt(event.target.value) / 100;
    FREQUENCY_THRESHOLD = Math.floor(FREQUENCY_THRESHOLD_PERCENT * 255);
  });
  document.getElementById('maximum-frequency').addEventListener('input', (event) => {
    MAXIMUM_FREQUENCY = parseInt(event.target.value);
    showSpeed();
  });
  document.getElementById('minimum-frequency').addEventListener('input', (event) => {
    MINIMUM_FREQUENCY = parseInt(event.target.value);
    showSpeed();
  });
  document.getElementById('last-bit-percent').addEventListener('input', (event) => {
    LAST_BIT_PERCENT = parseInt(event.target.value) / 100;
  });
  document.getElementById('fft-size-power-text').addEventListener('input', (event) => {
    FFT_POWER = parseInt(event.target.value);
    if(analyser) analyser.fftSize = 2 ** FFT_POWER;
    updateFrequencyResolution();
    resetGraphData();
  });
  updateFrequencyResolution();
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

function updateFrequencyResolution() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const frequencyCount = (sampleRate/2) / frequencyResolution;
  document.getElementById('frequency-resolution').innerText = frequencyResolution.toFixed(2);
  document.getElementById('frequency-count').innerText = frequencyCount.toFixed(2);

  showSpeed();
}

function showSpeed() {
  const segmentsPerSecond = 1000 / FREQUENCY_DURATION;
  const bitsPerSegment = getBitFrequencies().length;
  const baud = bitsPerSegment * segmentsPerSecond;
  const bytes = baud / 8;
  document.getElementById('durations-per-second').innerText = segmentsPerSecond.toFixed(2);
  document.getElementById('bits-per-duration').innerText = bitsPerSegment;
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
  return bit ? MAXIMUM_FREQUENCY : MINIMUM_FREQUENCY;
}
function getBitFrequencies() {
  var audioContext = getAudioContext();
  const sampleRate = audioContext.sampleRate;
  const fftSize = 2 ** FFT_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const frequencies = [];
  const pairStep = frequencyResolution * 2 * FREQUENCY_RESOLUTION_MULTIPLIER;
  for(let hz = MINIMUM_FREQUENCY; hz < MAXIMUM_FREQUENCY; hz+= pairStep * 2) {
    const low = hz;
    const high = hz + frequencyResolution * FREQUENCY_RESOLUTION_MULTIPLIER;
    if(low < MINIMUM_FREQUENCY) continue;
    if(high > MAXIMUM_FREQUENCY) continue;
    frequencies.push([low, high]);
  }
  return frequencies;
}
function sendBits(bits) {
  sentDataTextArea.value += bits.join('') + '\n';
  sentDataTextArea.scrollTop = sentDataTextArea.scrollHeight;
  var audioContext = getAudioContext();
  var duration = bits.length * FREQUENCY_DURATION;
  const frequencies = getBitFrequencies();
  const oscillators = [];
  for(let j = 0; j < frequencies.length; j++) {
    var oscillator = audioContext.createOscillator();
    const [low, high] = frequencies[j];
    for(let i = 0; i < bits.length; i++) {
      if(i > 0 && bits[i] === bits[i-1]) continue;
      var offset = ((i * FREQUENCY_DURATION)/1000);
      oscillator.frequency.setValueAtTime(
        bits[i] ? high : low,
        audioContext.currentTime + offset
      );
    }
    oscillator.connect(audioContext.destination);
    oscillators.push(oscillator);
  }

  resumeGraph();
  oscillators.forEach(o => o.start());
  window.setTimeout(function() {
    oscillators.forEach(o => o.stop());
  }, duration);
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
    hasSignal: hadPriorSignal,
    streamStarted: initialStreamStart = time,
    streamEnded: priorStreamEnded,
    bitIndex: priorBitIndex = -1
  } = frequencyOverTime[0] ?? {}
  analyser.getByteFrequencyData(frequencies);
  const data = { time, frequencies, length };
  let hasSignal = false;
  data.pairs = getBitFrequencies().map(([low, high], i) => {
    const lowAmp = frequencies[Math.round(low / length)];
    const highAmp = frequencies[Math.round(high / length)];
    const isLow = lowAmp > FREQUENCY_THRESHOLD;
    const isHigh = highAmp > FREQUENCY_THRESHOLD;
    if(isLow || isHigh ) hasSignal = true;
    return {
      channel: i,
      lowHz: low,
      highHz: high,
      isHigh: (isHigh && !isLow) || highAmp > lowAmp
    };
  });
  data.hasSignal = hasSignal;
  if(hasSignal) {
    if(hadPriorSignal) {
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
    data.bitIndex = -1;
    if(hadPriorSignal) {
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
    streamStarted,
    pairs: {
      length: channelCount
    }
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

  const channels = new Array(channelCount).fill(0);
  const maxHighBits = bits.reduce((max, { pairs: { length } }) => max > length ? max : length, 0);

  bits.forEach(({pairs}) => {
    pairs.forEach(({ isHigh }, i) => {
      if(isHigh) channels[i]++;
    })
  });
  const bitString = channels.map(count => count >= (maxHighBits / 2) ? '1' : '0').join('');
  received(bitString + '\n');
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
function hzAmplitude(hz, length, frequencies) {
  var index = Math.round(hz / length);
  return frequencies[index];
}
function getPercentY(percent) {
  const { height } = receivedGraph;
  return (1 - percent) * height;
}
function drawFrequencyLineGraph(ctx, hz, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {frequencies, time, length} = frequencyOverTime[i];
    const x = getTimeX(time, newest);
    if(x === -1) continue;
    const amplitude = hzAmplitude(hz, length, frequencies);
    const y = getPercentY(amplitude / MAX_DATA);
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function drawFrequencyDots(ctx, hz, color) {
  const newest = frequencyOverTime[0].time;
  const radius = 2;
  const border = 0.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = border;
  const fullCircle = 2 * Math.PI;
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {frequencies, time, length} = frequencyOverTime[i];
    const x = getTimeX(time, newest);
    if(x === -1) continue;
    const amplitude = hzAmplitude(hz, length, frequencies);
    const y = getPercentY(amplitude / MAX_DATA);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, fullCircle);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius + border, 0, fullCircle);
    ctx.stroke();
  }
}
function getTimeX(time, newest) {
  const { width } = receivedGraph;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  if(newest - time > duration) return -1;
  return ((newest - time) / duration) * width;
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
  const frequencies = getBitFrequencies();
  // frequencies.forEach(([low, high]) => {
  //   drawFrequencyDots(ctx, high, 'red');
  //   drawFrequencyDots(ctx, low, 'blue');
  // });
  frequencies.forEach(([low, high]) => {
    drawFrequencyLineGraph(ctx, high, 'red');
    drawFrequencyLineGraph(ctx, low, 'blue');
  });

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