import Dispatcher from "./Dispatcher";

const dispatcher = new Dispatcher('AudioSender', ['begin', 'end', 'send']);

let audioContext;
let CHANNELS = [];
let DESTINATION;
let CHANNEL_OSCILLATORS = [];
let WAVE_FORM;

let futureEventIds = [];

let stopOscillatorsTimeoutId;

export const addEventListener = dispatcher.addListener;
export const removeEventListener = dispatcher.removeListener;

export const changeConfiguration = ({
  channels,
  destination,
  waveForm
}) => {
  CHANNELS = channels;
  DESTINATION = destination;
  WAVE_FORM = waveForm;
}

export const setAudioContext = ctx => audioContext = ctx;

function getAudioContext() {
  if(!audioContext) {
    throw 'Audio context not provided.';
  }
  if(audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

const getChannels = () => CHANNELS;
const getDestination = () => DESTINATION;

export const now = () => getAudioContext().currentTime;

export function beginAt(streamStartSeconds) {
  stopTimeout();
  const oscillators = getOscillators();
  if(oscillators.length !== 0) stop();
  const audioContext = getAudioContext();
  const channels = getChannels();
  const channelCount = channels.length;
  const destination = getDestination();;
  // create our oscillators
  for(let i = 0; i < channelCount; i++) {
    const oscillator = audioContext.createOscillator();
    oscillator.connect(destination);
    oscillator.type = WAVE_FORM;
    oscillator.start(streamStartSeconds);
    oscillators.push(oscillator);
  }
  dispatcher.emit('begin');
  return oscillators;
}
function getOscillators() {
  return CHANNEL_OSCILLATORS;
}
export function send(bits, startSeconds) {
  const oscillators = getOscillators();
  const sentBits = [];
  getChannels().forEach((channel, i) => {
    // send missing bits as zero
    const isHigh = bits[i] ?? 0;
    sentBits.push(isHigh);
    const oscillator = oscillators[i];
    // already at correct frequency
    if(oscillator.on === isHigh) return;
    oscillator.on = isHigh;
    const hz = channel[isHigh ? 1 : 0];
    oscillator.frequency.setValueAtTime(hz, startSeconds);
  });

  // Alghough we program an oscillator of when frequencies
  // should change, let's not emit that the data is sent
  // until the frequency actually changes in real-time
  futureEventIds.push(window.setTimeout(
    () => {
      dispatcher.emit('send', {bits: sentBits, startSeconds});
    }, delayMs(startSeconds)
  ));
}
const delayMs = (seconds) => {
  const time = now();
  // now or in the past, no delay
  if(time >= seconds) return 0;
  return (seconds - time) * 1000;
}
const stopTimeout = () => {
  if(stopOscillatorsTimeoutId) {
    window.setTimeout(stopOscillatorsTimeoutId);
    stopOscillatorsTimeoutId = undefined;
  }
}
export function stopAt(streamEndSeconds) {
  const channels = getChannels();
  const oscillators = getOscillators();
  const channelCount = channels.length;
  // silence oscillators when done
  for(let channel = 0; channel < channelCount; channel++) {
    const oscillator = oscillators[channel];
    oscillator?.stop(streamEndSeconds);
  }
  stopTimeout();
  stopOscillatorsTimeoutId = window.setTimeout(
    stop,
    delayMs(streamEndSeconds)
  );
}
export function stop() {
  const time = now();
  const oscillators = getOscillators();
  oscillators.forEach(
    oscillator => {
      oscillator?.stop(time);
      oscillator?.disconnect();
    }
  )
  oscillators.length = 0;
  futureEventIds.forEach(window.clearTimeout);
  futureEventIds.length = 0;
  dispatcher.emit('end');
  stopTimeout();
}
