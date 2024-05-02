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
var MAX_DATA_POINTS = 300;
var MAX_DATA = 0;
var pauseTimeoutId;

// 20 to 20,000 - human
var FREQUENCY_TONE = 18000;
var FREQUENCY_HIGH = 400;
var FREQUENCY_LOW = 500;
var FREQUENCY_DURATION = 100;
var FREQUENCY_THRESHOLD = 200;
var FFT_POWER = 10;
var LAST_BIT_PERCENT = 0.8;
var SMOOTHING_TIME_CONSTANT = 0;
var frequencyOverTime = [];
var bitStart = [];
var samplesPerBit = [];
var bitSampleCount = 0;
var PAUSE = false;

function handleWindowLoad() {
  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');
  textToSend = document.getElementById('text-to-send');
  sentDataTextArea = document.getElementById('sent-data');
  samplesPerBitLabel = document.getElementById('samples-per-bit');
  document.getElementById('bit-duration-text').addEventListener('input', (event) => {
    FREQUENCY_DURATION = parseInt(event.target.value);
    bitSampleCount = 0;
    samplesPerBit.length = 0;
  });
  document.getElementById('max-samples-on-graph').value= MAX_DATA_POINTS;
  document.getElementById('max-samples-on-graph').addEventListener('input', (event) => {
    MAX_DATA_POINTS = parseInt(event.target.value);
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
    frequencyOverTime.length = 0;
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
  console.log('removing pause');
  if(PAUSE && isListeningCheckbox.checked) {
    PAUSE = false;
    requestAnimationFrame(analyzeAudio);
  }
  oscillator.connect(audioContext.destination);
  oscillator.start();
  window.setTimeout(function() { oscillator.stop(); }, duration);
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
  var audioContext = getAudioContext();
  function handleMicrophoneOn(stream) {
    microphoneStream = stream;
    microphoneNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
    analyser.fftSize = 2 ** FFT_POWER;
    microphoneNode.connect(analyser);
    requestAnimationFrame(analyzeAudio);
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
let bitHighStrength = [];
let bitLowStrength = [];
let lastBitIndex = 0;
function analyzeAudio() {
  if(PAUSE) return;
  if(!analyser) return;
  if(!microphoneNode) return;
  var audioContext = getAudioContext();
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);
  frequencyOverTime.unshift(frequencyData);
  const max = frequencyData.reduce((m, v) => m > v ? m : v, 0);
  if(max > MAX_DATA) MAX_DATA = max;
  bitStart.unshift(false);
  if(frequencyOverTime.length > MAX_DATA_POINTS) {
    frequencyOverTime.length = MAX_DATA_POINTS;
    bitStart.length = MAX_DATA_POINTS;
  }
  drawFrequencyData();

  function canHear(hz) {
    var length = (audioContext.sampleRate / analyser.fftSize);
    var i = Math.round(hz / length);
    return frequencyData[i] > FREQUENCY_THRESHOLD;
  }
  function amplitude(hz) {
    var length = (audioContext.sampleRate / analyser.fftSize);
    var i = Math.round(hz / length);
    return frequencyData[i];
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

  var high = canHear(FREQUENCY_HIGH);
  var low = canHear(FREQUENCY_LOW);
  const now = performance.now();
  if(high || low) {
    if(bitStarted) {
      var totalDuration = now - bitStarted;
      var bitIndex = Math.floor(totalDuration / FREQUENCY_DURATION)
      // next bit?
      if(lastBitIndex !== bitIndex) {
        lastBitIndex = bitIndex;
        samplesPerBit.unshift(bitSampleCount)
        received(evaluateBit(bitHighStrength, bitLowStrength));
        bitHighStrength.length = 0;
        bitLowStrength.length = 0;
        bitStart[0] = true;
        bitSampleCount = 1;
      } else {
        bitSampleCount++;
      }
    } else {
      lastBitIndex = 0;
      bitSampleCount = 1;
      bitStarted = now;
      bitStart[0] = true;
      bitHighStrength.length = 0;
      bitLowStrength.length = 0;
    }
    bitHighStrength.push(amplitude(FREQUENCY_HIGH));
    bitLowStrength.push(amplitude(FREQUENCY_LOW));
} else {
    if(bitStarted) {
      var bitIndex = Math.floor((bitStarted - now) / FREQUENCY_DURATION);
      var startTime = bitStarted + (FREQUENCY_DURATION * bitIndex);
      var duration = now - startTime;
      if(duration >= FREQUENCY_DURATION * LAST_BIT_PERCENT) {
        samplesPerBit.unshift(bitSampleCount)
        received(evaluateBit(bitHighStrength, bitLowStrength));
      }
      lastBitIndex = 0;
      bitStarted = undefined;
      bitStart[0] = true;
      received('\n');
      if(!pauseTimeoutId) {
        pauseTimeoutId = window.setTimeout(() => {
          PAUSE = true;
          pauseTimeoutId = undefined;
        }, FREQUENCY_DURATION * 2);
      }
    }
  }
  if(samplesPerBit.length > MAX_DATA_POINTS) {
    samplesPerBit.length = MAX_DATA_POINTS;
  }

  samplesPerBitLabel.innerText = avgLabel(samplesPerBit);
  requestAnimationFrame(analyzeAudio);
}

function avgLabel(array) {
  const values = array.filter(v => v > 0);
  if(values.length === 0) return 'N/A';
  return (values.reduce((t, v) => t + v, 0) / values.length).toFixed(2)
}

function drawBitStart(ctx, color) {
  const { width, height } = receivedGraph;
  const segmentWidth = (1 / MAX_DATA_POINTS) * width;
  ctx.strokeStyle = color;
  for(let i = 0; i < bitStart.length; i++) {
    if(!bitStart[i]) continue;
    ctx.beginPath();
    ctx.moveTo(segmentWidth * i, 0);
    ctx.lineTo(segmentWidth * i, height);
    ctx.stroke();
  }
}
function drawFrequency(ctx, hz, color) {
  const { width, height } = receivedGraph;
  const segmentWidth = (1 / MAX_DATA_POINTS) * width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const frequencies = frequencyOverTime[i];
    var length = (audioContext.sampleRate / analyser.fftSize);
    var index = Math.round(hz / length);
    const amplitude = frequencies[index];
    const y = (1-(amplitude / MAX_DATA)) * height;
    if(i === 0) {
      ctx.moveTo(0, y);
    } else {
      ctx.lineTo(segmentWidth * i, y)
    }
  }
  ctx.stroke();
}
function drawFrequencyData() {
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
  drawBitStart(ctx, 'green');
  drawFrequency(ctx, FREQUENCY_HIGH, 'red');
  drawFrequency(ctx, FREQUENCY_LOW, 'blue');
}

function drawReceivedData() {
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  const segmentWidth = (1 / MAX_DATA_POINTS) * width;
  ctx.clearRect(0, 0, width, height);
  const sorted = receivedData.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  ctx.beginPath();
  for(let i = 0; i < MAX_DATA_POINTS && i < receivedData.length; i++) {
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