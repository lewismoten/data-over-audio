var audioContext;
var sendButton;
var textToSend;
var isListeningCheckbox;
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
var FREQUENCY_DURATION = 100;
var FREQUENCY_THRESHOLD = 50;

function handleWindowLoad() {
  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');
  textToSend = document.getElementById('text-to-send');
  sentDataTextArea = document.getElementById('sent-data');

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

let listen = '';
function analyzeAudio() {
  if(!analyser) return;
  if(!microphoneNode) return;
  var audioContext = getAudioContext();
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);
  drawFrequencyData(frequencyData);

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

  var high = canHear(FREQUENCY_HIGH);
  var low = canHear(FREQUENCY_LOW);
  if(high || low) {
    listen += amplitude(FREQUENCY_HIGH) > amplitude(FREQUENCY_LOW) ? '1' : '0';
  } else {
    if(listen !== '') {
      receivedDataTextarea.value += listen + '\n';
      receivedDataTextarea.scrollTop = receivedDataTextarea.scrollHeight;
    }
    listen = '';
  }
  requestAnimationFrame(analyzeAudio);
}

function drawFrequencyData(frequencyData) {
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  const segmentWidth = (1 / frequencyData.length) * width;
  ctx.clearRect(0, 0, width, height);
  const sorted = frequencyData.slice().sort((a, b) => a - b);
  const min = 0;// sorted[0];
  const max = 255;//sorted[sorted.length - 1];
  const range = max - min;
  ctx.beginPath();
  for(let i = 0; i < frequencyData.length; i++) {
    const value = frequencyData[i];
    const y = (1-(value / range)) * height;
    if(i === 0) {
      ctx.moveTo(0, y);
    } else {
      ctx.lineTo(segmentWidth * i, y)
    }
  }
  ctx.stroke();
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