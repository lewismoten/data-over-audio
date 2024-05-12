import Dispatcher from "./Dispatcher";

const dispatcher = new Dispatcher('AudioReceiver', ['begin', 'end', 'receive']);

let sampleIntervalIds = [];
let SAMPLE_LAST_COLLECTED = 0;
let AMPLITUDE_THRESHOLD = 50;
let FSK_SETS = [];
let SIGNAL_INTERVAL_MS = 30;
let SIGNAL_TIMEOUT_MS = 400;
let LAST_SIGNAL_BEFORE_TIMEOUT = 0;

let HAS_SIGNAL = false;
let SIGNAL_START_MS = -1;
let ANALYSER;
let SAMPLE_RATE;

let signalTimeoutId;
let SAMPLES = [];

const setTimeoutMilliseconds = (milliseconds) => {
  SIGNAL_TIMEOUT_MS = milliseconds;
  if(signalTimeoutId) {
    // probably a long timeout. let's reset
    window.clearTimeout(signalTimeoutId);
    signalTimeoutId = window.setTimeout(handleSignalLost, SIGNAL_TIMEOUT_MS, LAST_SIGNAL_BEFORE_TIMEOUT);
  }
}
const changeConfiguration = ({
  fskSets,
  signalIntervalMs,
  amplitudeThreshold,
  analyser,
  sampleRate
}) => {
  FSK_SETS = fskSets;
  AMPLITUDE_THRESHOLD = amplitudeThreshold;
  SIGNAL_INTERVAL_MS = signalIntervalMs;
  ANALYSER = analyser;
  SAMPLE_RATE = sampleRate;
}

function start() {
  // Browsers generally do not run any less than 3 milliseconds
  const MINIMUM_INTERVAL_MS = 3;
  // Running two intervals gives us a small increase in sample rate
  // Running more than two intervals was negligible
  const SAMPLING_INTERVAL_COUNT = 2;
  for(let i = 0; i < SAMPLING_INTERVAL_COUNT; i++) {
    // already started?
    if(sampleIntervalIds[i]) continue;
    // set interval
    sampleIntervalIds[i] = window.setInterval(
      collectSample,
      MINIMUM_INTERVAL_MS + (i/SAMPLING_INTERVAL_COUNT)
    );
  }
}
function stop() {
  sampleIntervalIds.forEach(window.clearInterval);
  sampleIntervalIds = sampleIntervalIds.map(() => {});
}
const reset =() => {
  HAS_SIGNAL = false;
  SIGNAL_START_MS = -1;
  SAMPLES.length = 0;
  SAMPLE_LAST_COLLECTED = -1;
}
const getAnalyser = () => ANALYSER;
const getFrequencyShiftKeyingSets = () => FSK_SETS;

function analyzeAudioFrequenciesAsBits() {
  const analyser = getAnalyser();
  const frequencyResolution = SAMPLE_RATE / analyser.fftSize;
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencies);

  const indexOfHz = hz => Math.round(hz/frequencyResolution);
  const ampsFromHz = hz => frequencies[indexOfHz(hz)];
  const ampsFromManyHz = fsk => fsk.map(ampsFromHz);
  return getFrequencyShiftKeyingSets().map(ampsFromManyHz);
}
const ampMeetsTheshold = amp => amp > AMPLITUDE_THRESHOLD;
const anyAmpMeetsThreshold = amps => amps.some(ampMeetsTheshold);
const anySetOfAmpsMeetsThreshold = bitStates => bitStates.some(anyAmpMeetsThreshold);

function collectSample() {
  const time = performance.now();
  // Do nothing if we already collected the sample
  if(time === SAMPLE_LAST_COLLECTED) return;
  SAMPLE_LAST_COLLECTED = time;
  // Get amplitude of each channels set of frequencies
  const bitStates = analyzeAudioFrequenciesAsBits();
  const hasSignal = anySetOfAmpsMeetsThreshold(bitStates);
  handleSignalState(time, hasSignal);
  if(hasSignal) {
    const duration = time - SIGNAL_START_MS;
    const index = Math.floor(duration / SIGNAL_INTERVAL_MS);
    const start = SIGNAL_START_MS + (index * SIGNAL_INTERVAL_MS);
    const end = start + SIGNAL_INTERVAL_MS;
    SAMPLES.unshift({
      signalStart: SIGNAL_START_MS,
      index,
      start,
      time,
      end,
      bitStates,
      bs: bitStates.map(ss => '[' + ss.join(':') + ']').join('')
    });
  }
  processSamples(time);
  removeSamples(time);
}
const isExpiredSample = time => {
  const duration = Math.max(30, SIGNAL_INTERVAL_MS * 2);
  const expired = time - duration;
  return sample => sample.time < expired;
};

const removeSamples = time => {
  // remove expired samples
  let length = SAMPLES.findIndex(isExpiredSample(time));
  if(length !== -1) SAMPLES.length = length;
  // Don't let long signal intervals take over memory
  if(SAMPLES.length > 1024) SAMPLES.length = 1024;
}

const uniqueSamplesReady = time => (all, {
  signalStart,
  index,
  end
}) => {
  // still collecting samples?
  if(end > time) return all;
  const isSameSample = sample => sample.signalStart === signalStart && sample.index === index;
  // sample exists?
  if(!all.some(isSameSample)) {
    all.push({ signalStart, index });
  }
  return all;
}

function processSamples(time) {
   SAMPLES
    .reduce(uniqueSamplesReady(time), [])
    .every(processSample);
}
function processSample({ signalStart, index }) {

  const isSegment = sample => (
    sample.signalStart === signalStart &&
    sample.index === index
  );
  const samples = SAMPLES.filter(isSegment);
  if(samples.length === 0) return;

  let bits = evaluateBits(samples);
  const { start, end } = samples[0];
  dispatcher.emit('receive', {
    signalStart,
    signalIndex: index,
    indexStart: start,
    indexEnd: end,
    bits,
  });

  // remove processed samples
  const isNotSegment = sample => !isSegment(sample);
  SAMPLES = SAMPLES.filter(isNotSegment)
}
const newSingleBitState = () => new Array(2).fill(0);
const newMultiBitStates = count => new Array(count).fill(0).map(newSingleBitState);
const mapBitValue = (bitStates) => bitStates[0] > bitStates[1] ? 0 : 1
const evaluateBits = (samples) => {
  if(samples.length === 0) return;
  const {bitStates: { length: bitCount }} = SAMPLES[0];
  if(bitCount === 0) return;
  const bitSums = newMultiBitStates(bitCount);
  samples.forEach(({bitStates}) => {
    bitStates.forEach((strength, bitIndex) => {
      strength.forEach((value, bitState) => {
        bitSums[bitIndex][bitState] += value;
      });
    });
  });
  return bitSums.map(mapBitValue);
}
const handleSignalState = (time, hasSignal) => {
  if(hasSignal) {
    handleSignalOn(time);
  } else {
    handleSignalOff(time);
  }
}
const handleSignalOn = time => {
  if(signalTimeoutId) {
    window.clearTimeout(signalTimeoutId);
    signalTimeoutId = undefined;
  }
  if(!HAS_SIGNAL) {
    HAS_SIGNAL = true;
    SIGNAL_START_MS = time;
    dispatcher.emit('begin', { signalStart: time });
  }
}
const handleSignalOff = time => {
  if(HAS_SIGNAL && !signalTimeoutId) {
    LAST_SIGNAL_BEFORE_TIMEOUT = time;
    signalTimeoutId = window.setTimeout(handleSignalLost, SIGNAL_TIMEOUT_MS, time);
  }
}
const handleSignalLost = time => {
  if(signalTimeoutId) {
    window.clearTimeout(signalTimeoutId);
    signalTimeoutId = undefined;
  }
  if(HAS_SIGNAL) {
    HAS_SIGNAL = false;
    dispatcher.emit('end', {
      signalStart: SIGNAL_START_MS,
      signalEnd: time
    });
  }
}
const addEventListener = dispatcher.addListener;
const removeEventListener = dispatcher.removeListener;

export {
  changeConfiguration,
  start,
  stop,
  reset,
  addEventListener,
  removeEventListener,
  setTimeoutMilliseconds
}
