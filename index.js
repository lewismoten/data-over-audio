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
var MAX_DATA = 300;
var pauseTimeoutId;
var sampleIntervalIds = [];

var TEXT_TO_SEND = "U";
var RANDOM_COUNT = 128;
var MAX_BITS_DISPLAYED_ON_GRAPH = 78;
var SEGMENT_DURATION = 30;
var AMPLITUDE_THRESHOLD_PERCENT = .75;
var AMPLITUDE_THRESHOLD = 160;
var MINIMUM_FREQUENCY = 304;
var MAXIMUM_FREQUENCY = 4800;
var LAST_SEGMENT_PERCENT = 0.6;
var FFT_SIZE_POWER = 10;
var FREQUENCY_RESOLUTION_MULTIPLIER = 2;
var SMOOTHING_TIME_CONSTANT = 0;
var HAMMING_ERROR_CORRECTION = true;

var LAST_STREAM_STARTED;
var SAMPLE_DELAY_MS = 1;
const SAMPLING_INTERVAL_COUNT = 2;
var frequencyOverTime = [];
var bitStart = [];
var samplesPerBit = [];
var bitSampleCount = 0;
var PAUSE = false;
var PAUSE_AFTER_END = true;
var PACKET_SIZE_BITS = 8;

var EXPECTED_ENCODED_BITS = [];
var EXPECTED_BITS = [];
var EXPECTED_TEXT = '';

const packetReceivedBits = [];
const packetDecodedBits = [];
let packetDataByteCount = -1;

function handleWindowLoad() {
  const printable = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890`-=~!@#$%^&*()_+[]\\{}|;':\",./<>?";
  TEXT_TO_SEND = new Array(RANDOM_COUNT).fill(0).map(() => printable[Math.floor(Math.random() * printable.length)]).join('');

  // grab dom elements
  sendButton = document.getElementById('send-button');
  isListeningCheckbox = document.getElementById('is-listening-checkbox');
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');
  textToSend = document.getElementById('text-to-send');
  textToSend.value = TEXT_TO_SEND;
  sentDataTextArea = document.getElementById('sent-data');
  samplesPerBitLabel = document.getElementById('samples-per-bit');
  document.getElementById('pause-after-end').checked = PAUSE_AFTER_END;
  document.getElementById('error-correction-hamming').checked = HAMMING_ERROR_CORRECTION;
  document.getElementById('error-correction-hamming').addEventListener('change', event => {
    HAMMING_ERROR_CORRECTION = event.target.checked;
    showSpeed();
  })
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
    SEGMENT_DURATION = parseInt(event.target.value);
    bitSampleCount = 0;
    samplesPerBit.length = 0;
    showSpeed();
  });
  document.getElementById('max-bits-displayed-on-graph').value= MAX_BITS_DISPLAYED_ON_GRAPH;
  document.getElementById('max-bits-displayed-on-graph').addEventListener('input', (event) => {
    MAX_BITS_DISPLAYED_ON_GRAPH = parseInt(event.target.value);
  })
  document.getElementById('bit-duration-text').value = SEGMENT_DURATION;
  document.getElementById('amplitude-threshold-text').value = Math.floor(AMPLITUDE_THRESHOLD_PERCENT * 100);
  AMPLITUDE_THRESHOLD = Math.floor(AMPLITUDE_THRESHOLD_PERCENT * 255);
  document.getElementById('maximum-frequency').value = MAXIMUM_FREQUENCY;
  document.getElementById('minimum-frequency').value = MINIMUM_FREQUENCY;
  document.getElementById('last-bit-percent').value = Math.floor(LAST_SEGMENT_PERCENT * 100);
  document.getElementById('fft-size-power-text').value = FFT_SIZE_POWER;
  document.getElementById('smoothing-time-constant-text').value = SMOOTHING_TIME_CONSTANT.toFixed(2);

  document.getElementById('amplitude-threshold-text').addEventListener('input', (event) => {
    AMPLITUDE_THRESHOLD_PERCENT = parseInt(event.target.value) / 100;
    AMPLITUDE_THRESHOLD = Math.floor(AMPLITUDE_THRESHOLD_PERCENT * 255);
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
    LAST_SEGMENT_PERCENT = parseInt(event.target.value) / 100;
  });
  document.getElementById('fft-size-power-text').addEventListener('input', (event) => {
    FFT_SIZE_POWER = parseInt(event.target.value);
    if(analyser) analyser.fftSize = 2 ** FFT_SIZE_POWER;
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
  textToSend.addEventListener('input', handleTextToSendInput);
  handleTextToSendInput();
  showSpeed();
}

function handleTextToSendInput() {
  const text = textToSend.value;
  const dataByteCount = text.length;
  const dataBitCount = dataByteCount * 8;
  const nibblesToEncode = HAMMING_ERROR_CORRECTION ? Math.ceil((dataBitCount + PACKET_SIZE_BITS) / 4) : 0;
  const errorCorrectionBits = nibblesToEncode * 3;
  const totalBits = errorCorrectionBits + dataBitCount + PACKET_SIZE_BITS;
  const totalBytes = Math.ceil(totalBits / 8);
  const channelCount = getChannels().length;
  const segmentCount = Math.ceil(totalBits / channelCount);
  const totalDuration = ((segmentCount * SEGMENT_DURATION) / 1000);

  document.getElementById('error-correction-bits').innerText = errorCorrectionBits.toLocaleString();
  document.getElementById('data-bytes-to-send').innerText = dataByteCount.toLocaleString();
  document.getElementById('data-bits-to-send').innerText = dataBitCount.toLocaleString();
  document.getElementById('total-bytes-to-send').innerText = totalBytes.toLocaleString();
  document.getElementById('total-bits-to-send').innerText = totalBits.toLocaleString();
  document.getElementById('duration-to-send').innerText = totalDuration.toLocaleString();
  document.getElementById('packet-send-channel-count').innerText = channelCount.toLocaleString();
  document.getElementById('packet-send-segment-count').innerText = segmentCount.toLocaleString();
  document.getElementById('packet-send-segment-duration').innerText = (SEGMENT_DURATION / 1000).toLocaleString();
  document.getElementById('data-size-header-bits').innerText = PACKET_SIZE_BITS.toLocaleString();
}

function updateFrequencyResolution() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const frequencyCount = (sampleRate/2) / frequencyResolution;
  document.getElementById('frequency-resolution').innerText = frequencyResolution.toFixed(2);
  document.getElementById('frequency-count').innerText = frequencyCount.toFixed(2);

  showSpeed();
}

function showSpeed() {
  const segmentsPerSecond = 1000 / SEGMENT_DURATION;
  const channels = getChannels();
  const bitsPerSegment = channels.length;
  const baud = bitsPerSegment * segmentsPerSecond;
  const bytes = baud / 8;
  document.getElementById('durations-per-second').innerText = segmentsPerSecond.toFixed(2);
  document.getElementById('bits-per-duration').innerText = bitsPerSegment;
  document.getElementById('data-transfer-speed-bits-per-second').innerText = baud.toFixed(2);
  document.getElementById('data-transfer-speed-bytes-per-second').innerText = bytes.toFixed(2);
  if(HAMMING_ERROR_CORRECTION) {
    const effectiveBaud = baud * 4 / 7;
    const effectiveBytes = effectiveBaud / 8;
    document.getElementById('effective-speed-bits-per-second').innerText = effectiveBaud.toFixed(2);
    document.getElementById('effective-speed-bytes-per-second').innerText = effectiveBytes.toFixed(2);
  } else {
    const effectiveBaud = baud;
    const effectiveBytes = effectiveBaud / 8;
    document.getElementById('effective-speed-bits-per-second').innerText = effectiveBaud.toFixed(2);
    document.getElementById('effective-speed-bytes-per-second').innerText = effectiveBytes.toFixed(2);
  }

  const channelList = document.getElementById('channel-list');
  channelList.innerHTML = "";
  channels.forEach(([low, high]) => {
    const li = document.createElement('li');
    li.textContent = `Low: ${low} Hz High: ${high} Hz`;
    channelList.appendChild(li);
  })
  handleTextToSendInput();
  drawChannels();
}
function drawChannels() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  //const frequencyCount = (sampleRate/2) / frequencyResolution;
  const channels = getChannels();
  const channelCount = channels.length;
  const canvas = document.getElementById('channel-frequency-graph');
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;
  const channelHeight = height / channelCount;
  const bandHeight = channelHeight / 2;

  const nyquistFrequency = audioContext.sampleRate / 2;
  const frequencySegments = Math.floor(nyquistFrequency / frequencyResolution);

  for(let i = 0; i < channelCount; i++) {
    const [low, high] = channels[i];
    let top = channelHeight * i;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, top, width, bandHeight);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, top + bandHeight, width, bandHeight);

    const lowX = percentInFrequency(low, frequencyResolution) * width;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'blue';
    ctx.beginPath();
    ctx.moveTo(lowX, top);
    ctx.lineTo(lowX, top + bandHeight);
    ctx.stroke();
  
    const highX = percentInFrequency(high, frequencyResolution) * width;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'blue';
    ctx.beginPath();
    ctx.moveTo(highX, top + bandHeight);
    ctx.lineTo(highX, top + (bandHeight * 2));
    ctx.stroke();

  }
/*
  const binWidth = (1 / frequencySegments) * width;
  for(let x = 0; x < width; x+= binWidth * 2) {
    console.log(x);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, 0, binWidth, height);
  }
  */
}

function percentInFrequency(hz, frequencyResolution) {
  const index = Math.floor(hz/frequencyResolution);
  const startHz = index * frequencyResolution;
  const hzInSegement = hz - startHz;
  const percent = hzInSegement / frequencyResolution;
  return percent;
}
function nibbleToHamming(nibble) {
  if(nibble.length !== 4) return [];
  return [
    nibble[0] ^ nibble[1] ^ nibble[3],
    nibble[0] ^ nibble[2] ^ nibble[3],
    nibble[0],
    nibble[1] ^ nibble[2] ^ nibble[3],
    nibble[1],
    nibble[2],
    nibble[3]
  ]
}
function hammingToNibble(hamming) {
  if(hamming.length !== 7) return [];
  const error_1 = hamming[0] ^ hamming[2] ^ hamming[4] ^ hamming[6];
  const error_2 = hamming[1] ^ hamming[2] ^ hamming[5] ^ hamming[6];
  const error_3 = hamming[3] ^ hamming[4] ^ hamming[5] ^ hamming[6];
  let error = (error_3 << 2) | (error_2 << 1) | error_1;
  if(error !== 0) {
    // don't mutate the array
    hamming = hamming.slice();
    hamming[error - 1] ^= 1; // flip
  }
  return [
    hamming[2],
    hamming[4],
    hamming[5],
    hamming[6]
  ];
}

function getFrequency(bit) {
  return bit ? MAXIMUM_FREQUENCY : MINIMUM_FREQUENCY;
}
function getChannels() {
  var audioContext = getAudioContext();
  const sampleRate = audioContext.sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const channels = [];
  const pairStep = frequencyResolution * 2 * FREQUENCY_RESOLUTION_MULTIPLIER;
  for(let hz = MINIMUM_FREQUENCY; hz < MAXIMUM_FREQUENCY; hz+= pairStep) {
    const low = Math.floor(hz);
    const high = Math.floor(hz + frequencyResolution * FREQUENCY_RESOLUTION_MULTIPLIER);
    if(low < MINIMUM_FREQUENCY) continue;
    if(high > MAXIMUM_FREQUENCY) continue;
    channels.push([low, high]);
  }
  return channels;
}
function logSent(text) {
  // display what is being sent
  sentDataTextArea.value += text + '\n';
  sentDataTextArea.scrollTop = sentDataTextArea.scrollHeight;
}
function sendBits(bits) {
  const byteCount = bits.length / 8;
  if(bits.length === 0) {
    logSent('No bits to send!');
    return;
  } else if(bits.length % 8 !== 0 || bits.length === 0) {
    logSent('Bit count must be divisible by 8.');
    return;
  } else if(byteCount > (1 << PACKET_SIZE_BITS)) {
    logSent(`Can not transfer more than ${(1 << PACKET_SIZE_BITS)} bytes.`);
    return;
  }

  const packetLength = ((byteCount - 1) >>> 0)
    .toString(2)
    .padStart(PACKET_SIZE_BITS, '0')
    .split('')
    .map(Number);
    
  bits.unshift(...packetLength);

  EXPECTED_BITS = bits.slice();

  document.getElementById('sent-data').value = bits.reduce(bitReducer, '');

  if(HAMMING_ERROR_CORRECTION) {
    const encodedBits = [];
    for(let i = 0; i < bits.length; i+= 4) {
      const nibble = bits.slice(i, i + 4);
      while(nibble.length < 4) nibble.push(0);
      encodedBits.push(...nibbleToHamming(bits.slice(i, i + 4)));
    }
    document.getElementById('encoded-data').value = encodedBits.reduce(bitReducer, '');
    bits = encodedBits;
  } else {
    document.getElementById('encoded-data').value = bits.reduce(bitReducer, '');
  }
  EXPECTED_ENCODED_BITS = bits.slice();

  var audioContext = getAudioContext();
  const channels = getChannels();
  const oscillators = [];
  const channelCount = channels.length;

  const currentTime = audioContext.currentTime + 0.1;

  // create our oscillators
  for(let i = 0; i < channelCount; i++) {
    var oscillator = audioContext.createOscillator();
    oscillator.connect(audioContext.destination);
    oscillator.type = 'sawtooth';
    oscillators.push(oscillator);
  }

  // change our channel frequencies for the bit
  for(let i = 0; i < bits.length; i++) {
    const isHigh = bits[i];
    const channel = i % channelCount;
    const segment = Math.floor(i / channelCount);
    var offset = ((segment * SEGMENT_DURATION)/1000);
    var offset2 = (((segment+1) * SEGMENT_DURATION)/1000) - (1/100000);
    oscillators[channel].frequency.setValueAtTime(
      channels[channel][isHigh ? 1 : 0],
      currentTime + offset
    );
    oscillators[channel].frequency.setValueAtTime(
      channels[channel][isHigh ? 1 : 0],
      currentTime + offset2
    );
  }

  // start sending our signal
  oscillators.forEach(o => o.start(currentTime));

  // silence oscillators when done
  for(let i = bits.length; i < bits.length + channelCount; i++) {
    const channel = i % channelCount;
    const segment = Math.floor(i / channelCount);
    const offset = ((segment * SEGMENT_DURATION) / 1000);
    oscillators[channel].frequency.setValueAtTime(0, currentTime + offset);
    oscillators[channel].stop(currentTime + offset);
  }

  // start the graph moving again
  resumeGraph();
}
function stopGraph() {
  PAUSE = true;
  stopCollectingSamples();
}
function startCollectingSamples() {
  for(let i = 0; i < SAMPLING_INTERVAL_COUNT; i++) {
    if(sampleIntervalIds[i]) continue;
    sampleIntervalIds[i] = window.setInterval(
      collectSample,
      SAMPLE_DELAY_MS + (i/SAMPLING_INTERVAL_COUNT)
    );
  }
}
function stopCollectingSamples() {
  sampleIntervalIds.forEach(window.clearInterval);
  sampleIntervalIds = sampleIntervalIds.map(() => {});
}
function resumeGraph() {
  if(isListeningCheckbox.checked) {
    if(PAUSE) {
      PAUSE = false;
      startCollectingSamples();
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
  if(frequencyOverTime.length !== 0) {
    // we already have this sample
    if(time === frequencyOverTime[0].time) return;
  }
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencies);
  const length = audioContext.sampleRate / analyser.fftSize;
  let processSegment = false;
  const {
    hasSignal: hadPriorSignal,
    streamStarted: initialStreamStart = -1,
    streamEnded: priorStreamEnded = -1,
    segmentIndex: priorSegmentIndex = -1
  } = frequencyOverTime[0] ?? {}
  const data = {
    time,
    // frequencies: [...frequencies],
    length,
    streamEnded: priorStreamEnded
  };
  // Get amplitude of each channels set of frequencies
  data.pairs = getChannels().map(hzSet => hzSet.map(hz => frequencies[Math.round(hz / length)]));
  const hasSignal = data.hasSignal = data.pairs.some(amps => amps.some(amp => amp > AMPLITUDE_THRESHOLD));

  if(hasSignal) {
    if(hadPriorSignal) {
      // continued bit stream
      data.streamStarted = initialStreamStart;

      // proposed end
      data.streamEnded = priorStreamEnded;
    } else {
      // new bit stream
      data.streamStarted = time;
      LAST_STREAM_STARTED = time;
      // clear last packet
      packetReceivedBits.length = 0;
      packetDataByteCount = 0;
    }

    // number of bit in the stream
    const segmentIndex = data.segmentIndex = Math.floor((time - data.streamStarted) / SEGMENT_DURATION);
    if(priorSegmentIndex !== segmentIndex && priorSegmentIndex > -1) {
      processSegment = true;
    }
  } else {
    data.segmentIndex = -1;
    if(hadPriorSignal) {
      // just stopped
      data.streamStarted = -1;
      data.streamEnded = -1;
      // update all prior values with stream end if they don't have one
      frequencyOverTime
        .filter(fov => fov.streamStarted === initialStreamStart)
        .filter(fov => fov.streamEnded === -1)
        .forEach(fov => {
          fov.streamEnded === time
        });
      processSegment = true;
      if(PAUSE_AFTER_END && !pauseTimeoutId) {
         pauseTimeoutId = window.setTimeout(() => {
          pauseTimeoutId = undefined;
          if(PAUSE_AFTER_END) stopGraph();
        }, SEGMENT_DURATION * 0.5);
      }
    } else {
      // continued stopping (or never started)
      data.streamEnded = -1;
    }
  }
  frequencyOverTime.unshift(data);
  if(processSegment) processSegmentReceived(initialStreamStart, priorSegmentIndex);
  truncateGraphData();
}

function GET_SEGMENT_BITS(streamStarted, segmentIndex) {
  const samples = frequencyOverTime.filter(f => 
    f.segmentIndex === segmentIndex &&
    f.streamStarted === streamStarted
  );
  const channelCount = frequencyOverTime[0].pairs.length;
  const channelFrequencyCount = 2;
  const sums = new Array(channelCount)
    .fill(0)
    .map(() => 
      new Array(channelFrequencyCount)
      .fill(0)
    );
  samples.forEach(({pairs}) => {
    pairs.forEach((amps, channel) => {
      amps.forEach((amp, i) => {
        sums[channel][i] += amp;
      });
    });
  });
  const bitValues = sums.map((amps) => amps[0] > amps[1] ? 0 : 1);
  return bitValues;
}
function processSegmentReceived(streamStarted, segmentIndex) {
  const {
    pairs: {
      length: channelCount
    }
  } = frequencyOverTime[0];
  // is our segment long enough?

  const samples = frequencyOverTime.filter(
    fot => fot.streamStarted === streamStarted &&
    fot.segmentIndex === segmentIndex
  );
  if(samples.length <= 1) return; // too short
  const sampleEnd = samples[0].time;
  const sampleStart = samples[samples.length-1].time;
  const sampleDuration = sampleEnd - sampleStart;

  // not long enough to qualify as a segment
  if((sampleDuration / SEGMENT_DURATION) < LAST_SEGMENT_PERCENT) return;

  const bitValues = GET_SEGMENT_BITS(streamStarted, segmentIndex);
  // let bitValues2 = GET_SEGMENT_BITS(streamStarted, segmentIndex);
  // console.log(segmentIndex, bitValues.join('') === bitValues2.join(''), bitValues.join(''), bitValues2.join(''))
  packetReceivedBits.push(...bitValues);

  const encodingRatio = HAMMING_ERROR_CORRECTION ? 7/4 : 1;
  if(HAMMING_ERROR_CORRECTION) {
    packetDecodedBits.length = 0;
    for(let i = 0; i < packetReceivedBits.length; i += 7) {
      const hamming = packetReceivedBits.slice(i, i + 7);
      const nibble = hammingToNibble(hamming);
      packetDecodedBits.push(...nibble);
    }
  } else {
    packetDecodedBits.length = 0;
    packetDecodedBits.push(...packetReceivedBits);
  }

  // Determine if we can identify the length of data comming
  const encodedBitsNeededForDataLength = Math.ceil(Math.ceil(PACKET_SIZE_BITS / 4) * encodingRatio);
  if(packetDecodedBits.length >= encodedBitsNeededForDataLength) {
    // we can evaluate when we should know many bytes are comming
    const dataLengthIndex = Math.floor(encodedBitsNeededForDataLength / channelCount);
    // if(dataLengthIndex === segmentIndex) {
      // we just got the bits we needed
      packetDataByteCount = 1 + packetDecodedBits
        .slice(0, PACKET_SIZE_BITS)
        .reduce((value, bit) => (value << 1) | bit);
      document.getElementById('decoded-byte-count').innerText = packetDataByteCount;
      // let's get the end time
      const totalBits = Math.ceil(((packetDataByteCount * 8) + PACKET_SIZE_BITS) * encodingRatio);
      const segments = Math.ceil(totalBits / channelCount);
      const duration = segments * SEGMENT_DURATION;
      const streamEnded = streamStarted + duration;
      // console.log({
      //   tenBitNum: packetDecodedBits
      //   .slice(0, PACKET_SIZE_BITS).join(''),
      //   packetDataByteCount,
      //   PACKET_SIZE_BITS,
      //   totalBits,
      //   segments,
      //   streamStarted,
      //   duration,
      //   streamEnded
      // });
      // update everyones proposed end time
      frequencyOverTime
        .filter(fot => fot.streamStarted === streamStarted)
        .forEach(fot => {
          fot.streamEnded = streamEnded
        });
    // }
    // remove phantom bits
    // const totalBits = Math.ceil(((packetDataByteCount * 8) + PACKET_SIZE_BITS) * encodingRatio);
    if(packetReceivedBits.length > totalBits) {
      // const excess = packetReceivedBits.length % totalBits;
      // packetReceivedBits.length = totalBits;
      // bitValues.length = bitValues.length - excess;
    }
  }

  document.getElementById('decoded-data').innerHTML = packetDecodedBits.reduce(bitExpectorReducer(EXPECTED_BITS), '');
  document.getElementById('received-data').innerHTML = packetReceivedBits.reduce(bitExpectorReducer(EXPECTED_ENCODED_BITS), '');

  const encodedBitCount = EXPECTED_ENCODED_BITS.length;
  const decodedBitCount = EXPECTED_BITS.length;
  const correctEncodedBits = packetReceivedBits.filter((b, i) => i < encodedBitCount && b === EXPECTED_ENCODED_BITS[i]).length;
  const correctedDecodedBits = packetDecodedBits.filter((b, i) => i < decodedBitCount && b === EXPECTED_BITS[i]).length;
  document.getElementById('received-data-error-percent').innerText = (
    Math.floor((1 - (correctEncodedBits / encodedBitCount)) * 1000) * 0.1
  ).toLocaleString();
  document.getElementById('decoded-data-error-percent').innerText = (
    Math.floor((1 - (correctedDecodedBits / decodedBitCount)) * 1000) * 0.1
  ).toLocaleString();
  document.getElementById('decoded-text').innerHTML = packetDecodedBits.reduce(textExpectorReducer(EXPECTED_TEXT), '');
}
function bitReducer(all, bit, i) {
  if(i !== 0 && i % 8 === 0) return all + ' ' + bit;
  return all + bit;
}
const bitExpectorReducer = expected => (all, bit, i) => {
  // if(i === 0) console.log(expected.slice(), all, bit, i);

  if(i !== 0 && i % 8 === 0) all += ' ';
  if(i >= expected.length) {
    all += '<span class="bit-unexpected">';
  } else if(expected[i] !== bit) {
    all += '<span class="bit-wrong">';
  }
  all += bit.toString();
  if(i >= expected.length || expected[i] !== bit) {
    all += '</span>';
  }
  return all;
}
const textExpectorReducer = expected => (all, bit, i, bits) => {
  if(i < PACKET_SIZE_BITS) return all;
  if((i - PACKET_SIZE_BITS) % 8 === 0) {
    const bitString = bits.slice(
      i, 
      i + 8
    ).join('').padEnd(8, '0');
    const ascii = parseInt(bitString, 2);
    const char = String.fromCharCode(ascii);
    const charIndex = Math.floor((i - PACKET_SIZE_BITS) / 8);
    if(char !== expected[charIndex]) {
      all += '<span class="bit-wrong">' + htmlEncode(printable(char)) + '</span>';
    } else {
      all += htmlEncode(printable(char));
    }
  }
  return all;
}
function printable(text) {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, '.');
}
function htmlEncode(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}
function resetGraphData() {
  frequencyOverTime.length = 0;
  bitStart.length = 0;
}
function truncateGraphData() {
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
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

function textToBits(text) {
  const bits = [];
  for(let i = 0; i < text.length; i++) {
    // const unicode = text.codePointAt(i).toString(2).padStart(16, '0');
    const ascii = text[i].charCodeAt(0).toString(2).padStart(8, '0');
    bits.push(ascii);
  }
  return bits.join('').split('').map(Number);
}
function handleSendButtonClick() {
  receivedDataTextarea.value = '';
  sentDataTextArea.value = '';

  const text = document.getElementById('text-to-send').value;
  EXPECTED_TEXT = text;
  sendBits(textToBits(text));
}
function handleListeningCheckbox(e) {
  stopGraph();
  var audioContext = getAudioContext();
  function handleMicrophoneOn(stream) {
    microphoneStream = stream;
    microphoneNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
    analyser.fftSize = 2 ** FFT_SIZE_POWER;
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
let lastSegmentIndex = 0;

function canHear(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i] > AMPLITUDE_THRESHOLD;
}
function amplitude(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i];
}
const sum = (total, value) => total + value;

function avgLabel(array) {
  const values = array.filter(v => v > 0);
  if(values.length === 0) return 'N/A';
  return (values.reduce((t, v) => t + v, 0) / values.length).toFixed(2)
}
function drawSegmentIndexes(ctx) {
  if(!LAST_STREAM_STARTED) return;
  const { width, height } = receivedGraph;
  const fot = frequencyOverTime.find(fot => fot.streamStarted === LAST_STREAM_STARTED);
  const newest = frequencyOverTime[0].time;
  const channelCount = frequencyOverTime[0].pairs.length;
  let {
    streamStarted,
    streamEnded = newest
  } = fot ?? {
    streamStarted: LAST_STREAM_STARTED,
    streamEnded: newest
  };
  if(streamEnded === -1) streamEnded = newest;
  let segmentIndex = 0;

  // determine max segments to prevent infinite loop later
  let maxBits = ((1 << PACKET_SIZE_BITS) * 8) + PACKET_SIZE_BITS;
  if(HAMMING_ERROR_CORRECTION) maxBits *= 7/4;
  let maxSegments = Math.ceil(maxBits / channelCount);

  // loop through each index
  while(true) {
    let segmentStart = streamStarted + (segmentIndex * SEGMENT_DURATION);
    // if(segmentStart > streamEnded) break; // stream ended

    let segmentEnd = segmentStart + SEGMENT_DURATION;
    // find where the index is on the graph
    const rightX = getTimeX(segmentStart, newest);
    const leftX = getTimeX(segmentEnd, newest);
    const segmentWidth = rightX - leftX;
    if(leftX > width) continue; // too far in past
    if(rightX < 0) break; // in the future

    // Draw segment index
    ctx.fontSize = '24px';
    let text = segmentIndex.toString();
    let size = ctx.measureText(text);
    let textX = leftX + (segmentWidth / 2) - (size.width / 2);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.textBaseline = 'bottom';
    let textY = segmentIndex % 2 === 0 ? height : height - 12;
    ctx.strokeText(text, textX, textY);
    ctx.fillStyle = segmentStart > streamEnded ? 'grey' : 'white';
    ctx.fillText(text, textX, textY);

    // draw sample count
    const sampleCount = frequencyOverTime
      .filter(fot => 
        fot.streamStarted === streamStarted && 
        fot.segmentIndex === segmentIndex
      )
      .length;

    text = sampleCount.toString();
    size = ctx.measureText(text);
    textX = leftX + (segmentWidth / 2) - (size.width / 2);
    textY = segmentIndex % 2 === 0 ? 5 : 17;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.textBaseline = 'top';
    ctx.strokeText(text, textX, textY);
    if(sampleCount === 0) ctx.fillStyle = 'red';
    else if(sampleCount < 3) ctx.fillStyle = 'yellow';
    else ctx.fillStyle = 'white';
    ctx.fillText(text, textX, textY);
  
    segmentIndex++;
    // break out of potential infinite loop
    if(segmentIndex >= maxSegments) break;
  }
}
function drawBitDurationLines(ctx, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;

  const streamTimes = frequencyOverTime.filter(({
    streamStarted
  }) => {
    return streamStarted !== -1
  }).reduce((unique, {
    streamStarted,
    streamEnded = newest
  }) => {
    if(unique.every(u => u.streamStarted != streamStarted)) {
      unique.push({streamStarted, streamEnded})
    }
    return unique;
  }, []);

  ctx.strokeStyle = color;
  streamTimes.forEach(({ streamStarted, streamEnded = newest}) => {
    for(let time = streamStarted; time < streamEnded; time += SEGMENT_DURATION) {
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
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
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
function getPercentY(percent) {
  const { height } = receivedGraph;
  return (1 - percent) * height;
}
function drawFrequencyLineGraph(ctx, channel, highLowIndex, color, lineWidth, dashed) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if(dashed) {
    ctx.setLineDash([5, 5]);
  }
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {pairs, time} = frequencyOverTime[i];
    const x = getTimeX(time, newest);
    if(x === -1) continue;
    const amplitude = pairs[channel][highLowIndex];
    const y = getPercentY(amplitude / MAX_DATA);
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if(dashed) {
    ctx.setLineDash([]);
  }
}
function drawFrequencyDots(ctx, channel, highLowIndex, color) {
  const newest = frequencyOverTime[0].time;
  const radius = 2;
  const border = 0.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = border;
  const fullCircle = 2 * Math.PI;
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {pairs, time} = frequencyOverTime[i];
    const x = getTimeX(time, newest);
    if(x === -1) continue;
    const amplitude = pairs[channel][highLowIndex];
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
  return getTimePercent(time, newest) * receivedGraph.width;
}
function getTimePercent(time, newest) {
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  if(newest - time > duration) return -1;
  return ((newest - time) / duration);
}
function drawChannelData() {
  const S = performance.now();
  // return;
  const canvas = document.getElementById('received-channel-graph');
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  //const frequencyCount = (sampleRate/2) / frequencyResolution;
  const channels = getChannels();
  const channelCount = channels.length;
  const channelHeight = height / channelCount;
  const bandHeight = channelHeight / 2;

  const nyquistFrequency = audioContext.sampleRate / 2;
  const frequencySegments = Math.floor(nyquistFrequency / frequencyResolution);

  const newest = frequencyOverTime[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const overlays = [];

  for(let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    const [low, high] = channels[channelIndex];
    let top = channelHeight * channelIndex;

    // ctx.fillStyle = channelIndex % 2 === 0 ? 'black' : 'white';
    // ctx.fillRect(0, top, width, channelHeight);

    // Data
    // ctx.strokeStyle = 'blue';

    const segmentDurationS = SEGMENT_DURATION;

    // Segments
    const segmentCount = Math.ceil(EXPECTED_ENCODED_BITS.length / channelCount);
    const lastStream = frequencyOverTime.find(fot => fot.hasSignal);
    const streamStarted = lastStream?.streamStarted ?? newest;
    const lastSegmentIndex = lastStream?.segmentIndex ?? segmentCount;
    const oldest = newest - (segmentDurationS * MAX_BITS_DISPLAYED_ON_GRAPH);
  
    // Show segments with wrong bits
    for(let segmentIndex = 0; segmentIndex <= lastSegmentIndex; segmentIndex++) {
      const segmentBits = GET_SEGMENT_BITS(streamStarted, segmentIndex);
      if(channelIndex >= segmentBits.length) continue; // past received/heard bits
      const bitIndex = (segmentIndex * channelCount) + channelIndex;
      if(bitIndex >= EXPECTED_ENCODED_BITS.length) continue; // past data stream
      const segmentStart = streamStarted + (segmentIndex * segmentDurationS);
      if(segmentStart > newest) break; // too far in the future
      const segmentEnd = segmentStart + segmentDurationS;
      if(segmentEnd < oldest) continue; // to far in the past
      const endPercent = getTimePercent(segmentEnd, newest);
      const startPercent = getTimePercent(segmentStart, newest);
      const endX = (endPercent) * width;
      const startX = (startPercent) * width;
      const segmentWidth = startX - endX;

      // evaluate received bit
      const actualBit = segmentBits[channelIndex];
      // identify expected bit
      const expectedBit = EXPECTED_ENCODED_BITS[bitIndex];

      // color red if received bit does not match expected bit
      ctx.fillStyle = actualBit === expectedBit ? 'green' : 'red';
      ctx.fillRect(endX, top, segmentWidth, channelHeight);

      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.strokeRect(endX, top, segmentWidth, channelHeight);

      // show bad value
      // if(actualBit !== expectedBit) {
        ctx.font = `${channelHeight}px Arial`;
        const size = ctx.measureText(actualBit.toString());
        const textHeight = size.actualBoundingBoxAscent + size.actualBoundingBoxDescent;
        const centerChannel = top + (channelHeight / 2);
        const textTop = centerChannel + (size.actualBoundingBoxAscent / 2);

        overlays.push(() => {
          ctx.strokeStyle = actualBit !== expectedBit ? 'black' : 'black';
          ctx.lineWidth = 2;
          ctx.strokeText(actualBit.toString(), endX + (segmentWidth/2) - (size.width / 2), textTop);
          ctx.fillStyle = actualBit !== expectedBit ? 'white' : 'white';
          ctx.fillText(actualBit.toString(), endX + (segmentWidth/2) - (size.width / 2), textTop);
        })
    
      // }

    }
  }
  drawChannelByteMarkers(ctx, channelCount, channelHeight, width);
  overlays.forEach(fn => fn());
  drawChannelNumbers(ctx, channelCount, channelHeight)
  console.log('time', performance.now() - S);
}
function drawChannelByteMarkers(ctx, channelCount, channelHeight, width) {
  for(let channelIndex = 8; channelIndex < channelCount; channelIndex+= 8) {
    let top = channelHeight * channelIndex;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(width, top);
    ctx.stroke();
  }
}
function drawChannelNumbers(ctx, channelCount, channelHeight) {
  let fontHeight = Math.min(24, channelHeight);
  ctx.font = `${fontHeight}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 0, 0, .5)';
  const maxDigits = (channelCount - 1).toString().length;
  ctx.fillRect(0, 0, (fontHeight * maxDigits), channelHeight * channelCount);
  for(let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    let top = channelHeight * channelIndex;
    let text = channelIndex.toString();
    const textTop = top + (channelHeight / 2);
    const hue = channelHue(channelIndex, channelCount);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillText(text, 5, textTop);
  }
}
function drawFrequencyData() {
  if(PAUSE) return;
  if(frequencyOverTime.length === 0) {
    requestAnimationFrame(drawFrequencyData);
    return;
  }
  drawChannelData();
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  
  const thresholdY = (1 - (AMPLITUDE_THRESHOLD/MAX_DATA)) * height;
  ctx.strokeStyle = 'grey';
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  drawBitDurationLines(ctx, 'rgba(255, 255, 0, .25)');
  drawBitStart(ctx, 'green');
  const frequencies = getChannels();
  const high = 1;
  const low = 0
  frequencies.forEach((v, channel) => {
    const hue = channelHue(channel, frequencies.length);
    drawFrequencyLineGraph(ctx, channel, high, `hsl(${hue}, 100%, 50%)`, 2, false);
    drawFrequencyLineGraph(ctx, channel, low, `hsl(${hue}, 100%, 25%)`, 1, true);
  });
  drawSegmentIndexes(ctx);

  requestAnimationFrame(drawFrequencyData);
}

function channelHue(channelId, channelCount) {
  return Math.floor((channelId / channelCount) * 360);
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