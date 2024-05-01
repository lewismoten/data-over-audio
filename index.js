var audioContext;
var sendButton;
var isListeningCheckbox;
var microphoneStream;
var microphoneNode;
var analyser;
var receivedDataTextarea;

var FREQUENCY_TONE = 500;

function handleWindowLoad() {
  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');

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
  window.setTimeout(function() { oscillator.stop(); }, 100);

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

  var frequencyIndex = Math.round(FREQUENCY_TONE / (audioContext.sampleRate / analyser.fftSize));
  const amplitude = frequencyData[frequencyIndex];
  if(amplitude > 0) {
    receivedDataTextarea.value = `Frequency Detected. Amplitude: ${amplitude}`;
  } else {
    receivedDataTextarea.value = 'Frequency Not Detected.';
  }

  requestAnimationFrame(analyzeAudio);
}


window.addEventListener('load', handleWindowLoad);