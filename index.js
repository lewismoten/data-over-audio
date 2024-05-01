var audioContext;
var sendButton;
var isListeningCheckbox;
var microphoneStream;
var microphoneNode;
var analyser;
var receivedDataTextarea;
var receivedGraph;
var receivedData = [];
var MAX_DATA_POINTS = 1024;

// 20 to 20,000 - human
var FREQUENCY_TONE = 18000;

function handleWindowLoad() {
  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');

  // wire up events
  sendButton.addEventListener('click', handleSendButtonClick);
  isListeningCheckbox.addEventListener('click', handleListeningCheckbox);
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
    analyser.fftSize = 2048;
    microphoneNode.connect(analyser);
    requestAnimationFrame(analyzeAudio);
  }
  function handleMicrophoneError(error) {
    console.error('Microphone Error', error);
  }
  if(e.target.checked) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(handleMicrophoneOn)
      .catch(handleMicrophoneError)
  } else {
    if(microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = undefined;
    }
    if(analyser && microphoneNode) {
      analyser.disconnect(microphoneNode);
      microphoneNode = undefined;
      analyser = undefined;
    }
  }
}

function analyzeAudio() {
  if(!analyser) return;
  if(!microphoneNode) return;
  var audioContext = getAudioContext();
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);
  drawFrequencyData(frequencyData);

  var frequencyIndex = Math.round(FREQUENCY_TONE / (audioContext.sampleRate / analyser.fftSize));
  const amplitude = frequencyData[frequencyIndex];
  receivedData.unshift(amplitude);
  if(receivedData.length > MAX_DATA_POINTS) {
    receivedData.length = MAX_DATA_POINTS;
  }
  // drawReceivedData();
  if(amplitude > 0) {
    receivedDataTextarea.value = `Frequency ${FREQUENCY_TONE}Hz Detected. Amplitude: ${amplitude}`;
  } else {
    receivedDataTextarea.value = `Frequency ${FREQUENCY_TONE}Hz Not Detected.`;
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