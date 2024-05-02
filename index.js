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
var MAX_DATA_POINTS = 1024;

// 20 to 20,000 - human
var FREQUENCY_TONE = 18000;
var FREQUENCY_HIGH = 900;
var FREQUENCY_LOW = 1200;
// 190 = 11.63 samples
// 180 = 11 samples
var FREQUENCY_DURATION = 170;
var FREQUENCY_THRESHOLD = 200;
var frequencyOverTime = [];
var bitStart = [];
var samplesPerBit = [];
var bitSampleCount = 0;

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
  document.getElementById('amplitude-threshold-text').addEventListener('input', (event) => {
    FREQUENCY_THRESHOLD = parseInt(event.target.value);
  });
  

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
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = 2 ** 12;
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
function analyzeAudio() {
  if(!analyser) return;
  if(!microphoneNode) return;
  var audioContext = getAudioContext();
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);
  frequencyOverTime.unshift(frequencyData);
  bitStart.unshift(false);
  if(frequencyOverTime.length > 1024) {
    frequencyOverTime.length = 1024;
    bitStart.length = 1024;
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
      if(now - bitStarted >= FREQUENCY_DURATION) {
        samplesPerBit.unshift(bitSampleCount)
        received(evaluateBit(bitHighStrength, bitLowStrength));
        bitHighStrength.length = 0;
        bitLowStrength.length = 0;
        bitStarted = now;
        bitStart[0] = true;
        bitSampleCount = 1;
      } else {
        bitSampleCount++;
      }
    } else {
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
      // was bit long enough?
      const duration = now - bitStarted;
      if(duration >= FREQUENCY_DURATION * 0.6) {
        samplesPerBit.unshift(bitSampleCount)
        received(evaluateBit(bitHighStrength, bitLowStrength));
      }
      bitStarted = undefined;
      bitStart[0] = true;
      received('\n');
    }
  }
  if(samplesPerBit.length > 1024) {
    samplesPerBit.length = 1024;
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
  const segmentWidth = (1 / 1024) * width;
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
  const segmentWidth = (1 / 1024) * width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const frequencies = frequencyOverTime[i];
    var length = (audioContext.sampleRate / analyser.fftSize);
    var index = Math.round(hz / length);
    const amplitude = frequencies[index];
    const y = (1-(amplitude / 255)) * height;
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
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  
  const thresholdY = (1 - (FREQUENCY_THRESHOLD/255)) * height;
  ctx.strokeStyle = 'grey';
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  drawBitStart(ctx, 'grey');
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