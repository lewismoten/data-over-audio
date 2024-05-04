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
var MAX_BITS_DISPLAYED_ON_GRAPH = 9;
var MAX_DATA = 300;
var pauseTimeoutId;
var sampleIntervalId;
var HAMMING_ERROR_CORRECTION = true;

// 20 to 20,000 - human
var TEXT_TO_SEND = "Hello World!";
var MINIMUM_FREQUENCY = 5000;
var MAXIMUM_FREQUENCY = 10000;
var FREQUENCY_DURATION = 60;
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
var PACKET_SIZE_BITS = 10;

var EXPECTED_ENCODED_BITS = [];
var EXPECTED_BITS = [];
var EXPECTED_TEXT = '';

const packetBits = [];
const packetDecodedBits = [];
let packetDataByteCount = -1;

function handleWindowLoad() {
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
  const totalDuration = ((segmentCount * FREQUENCY_DURATION) / 1000);

  document.getElementById('error-correction-bits').innerText = errorCorrectionBits.toLocaleString();
  document.getElementById('data-bytes-to-send').innerText = dataByteCount.toLocaleString();
  document.getElementById('data-bits-to-send').innerText = dataBitCount.toLocaleString();
  document.getElementById('total-bytes-to-send').innerText = totalBytes.toLocaleString();
  document.getElementById('total-bits-to-send').innerText = totalBits.toLocaleString();
  document.getElementById('duration-to-send').innerText = totalDuration.toLocaleString();
  document.getElementById('packet-send-channel-count').innerText = channelCount.toLocaleString();
  document.getElementById('packet-send-segment-count').innerText = segmentCount.toLocaleString();
  document.getElementById('packet-send-segment-duration').innerText = (FREQUENCY_DURATION / 1000).toLocaleString();
  document.getElementById('data-size-header-bits').innerText = PACKET_SIZE_BITS.toLocaleString();
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
  const fftSize = 2 ** FFT_POWER;
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

  for(let i = 0; i < channelCount; i++) {//xxx
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
  const fftSize = 2 ** FFT_POWER;
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
    oscillators.push(oscillator);
  }

  // change our channel frequencies for the bit
  for(let i = 0; i < bits.length; i++) {
    const isHigh = bits[i];
    const channel = i % channelCount;
    const segment = Math.floor(i / channelCount);
    var offset = ((segment * FREQUENCY_DURATION)/1000);
    oscillators[channel].frequency.setValueAtTime(
      channels[channel][isHigh ? 1 : 0],
      currentTime + offset
    );
  }

  // start sending our signal
  oscillators.forEach(o => o.start(currentTime));

  // silence oscillators when done
  for(let i = bits.length; i < bits.length + channelCount; i++) {
    const channel = i % channelCount;
    const segment = Math.floor(i / channelCount);
    const offset = ((segment * FREQUENCY_DURATION) / 1000);
    oscillators[channel].stop(currentTime + offset);
  }

  // start the graph moving again
  resumeGraph();
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
function getInteger(start, end, samples) {
  let value = 0;
  let valueIndex = 0;
  for(let i = 0; i < samples.length; i++) {
    for(let j = 0; j < samples[i].pairs.length; j++) {
      if(b >= start) {
        value += getBit(samples[i].pairs[j]) << valueIndex++;
        if(b >= end) return bits;
      }
      b++;
    }
  }
  return bits;
}

function collectSample() {
  const time = performance.now();
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  const length = audioContext.sampleRate / analyser.fftSize;
  let processSegment = false;
  const {
    hasSignal: hadPriorSignal,
    streamStarted: initialStreamStart = -1,
    streamEnded: priorStreamEnded = -1,
    segmentIndex: priorSegmentIndex = -1
  } = frequencyOverTime[0] ?? {}
  analyser.getByteFrequencyData(frequencies);
  const data = {
    time,
    frequencies,
    length,
    streamEnded: priorStreamEnded
  };
  let hasSignal = false;
  data.pairs = getChannels().map(([low, high], i) => {
    const lowAmp = frequencies[Math.round(low / length)];
    const highAmp = frequencies[Math.round(high / length)];
    const isLow = lowAmp > FREQUENCY_THRESHOLD;
    const isHigh = highAmp > FREQUENCY_THRESHOLD;
    if(isLow || isHigh ) hasSignal = true;
    return {
      channel: i,
      lowHz: low,
      highHz: high,
      isMissing: !(isHigh || isLow),
      isHigh: (isHigh && !isLow) || highAmp > lowAmp
    };
  });
  data.hasSignal = hasSignal;
  if(hasSignal) {
    if(hadPriorSignal) {
      // continued bit stream
      data.streamStarted = initialStreamStart;

      // proposed end
      data.streamEnded = priorStreamEnded;
    } else {
      // new bit stream
      data.streamStarted = time;
      // clear last packet
      packetBits.length = 0;
      packetDataByteCount = 0;
    }

    // number of bit in the stream
    const segmentIndex = data.segmentIndex = Math.floor((time - initialStreamStart) / FREQUENCY_DURATION);
    if(priorSegmentIndex !== segmentIndex && priorSegmentIndex !== -1) {
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
        }, FREQUENCY_DURATION * 1.5);
      }
    } else {
      // continued stopping (or never started)
      data.streamEnded = -1;
    }
  }
  frequencyOverTime.unshift(data);
  if(processSegment) processSegmentReceived();
  truncateGraphData();
}

function evaluateBit(samples, segment, channel) {
  const started = samples.find(s => s.streamStarted > 0).streamStarted;
  const bitSamples = samples.filter(sample => {
    return sample.time >= started + (segment * FREQUENCY_DURATION) && 
      sample.time < started + ((segment + 1) * FREQUENCY_DURATION)
  }).map(samples => samples.pairs[channel])
  .reduce((bitSamples, { isHigh, isMissing }) => {
    bitSamples.total++;
    if(isHigh) bitSamples.highCount++;
  }, {highCount: 0, total: 0});  
  return bitSamples.highCount >= bitSamples.total / 2 ? 1 : 0;
}

function processSegmentReceived() {
  const {
    segmentIndex,
    streamStarted,
    pairs: {
      length: channelCount
    }
  } = frequencyOverTime[0];
  const bits = frequencyOverTime.filter(f => 
    f.segmentIndex === segmentIndex &&
    f.streamStarted === streamStarted
  );
  const bitEnded = bits[0].time;
  const bitStarted = streamStarted + (FREQUENCY_DURATION * segmentIndex);
  const bitDuration = bitEnded - bitStarted;

  // if(bitDuration < FREQUENCY_DURATION * LAST_BIT_PERCENT) {
  //   return;
  // }

  const channels = new Array(channelCount).fill(0).map(() => ({isHigh: 0, isLow: 0, isMissing: 0}));

  bits.forEach(({pairs}) => {
    pairs.forEach(({ isHigh, isMissing }, i) => {
      if(isHigh) channels[i].isHigh ++;
      // else if(isMissing) channels[i].isMissing ++;
      else channels[i].isLow++;
    })
  });
  const bitValues = channels.map(({isHigh, isLow, isMissing}) => {
    if(isMissing > isHigh + isLow) return '.';
    return isHigh > isLow ? 1 : 0;
  });

  packetBits.push(...bitValues);

  const encodingRatio = HAMMING_ERROR_CORRECTION ? 7/4 : 1;
  if(HAMMING_ERROR_CORRECTION) {
    packetDecodedBits.length = 0;
    for(let i = 0; i < packetBits.length; i += 7) {
      const hamming = packetBits.slice(i, i + 7);
      const nibble = hammingToNibble(hamming);
      packetDecodedBits.push(...nibble);
    }
  } else {
    packetDecodedBits.length = 0;
    packetDecodedBits.push(...packetBits);
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
      const duration = segments * FREQUENCY_DURATION;
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
    if(packetBits.length > totalBits) {
      // const excess = packetBits.length % totalBits;
      // packetBits.length = totalBits;
      // bitValues.length = bitValues.length - excess;
    }
  }

  document.getElementById('decoded-data').innerHTML = packetDecodedBits.reduce(bitExpectorReducer(EXPECTED_BITS), '');
  document.getElementById('received-data').innerHTML = packetBits.reduce(bitExpectorReducer(EXPECTED_ENCODED_BITS), '');

  const encodedBitCount = EXPECTED_ENCODED_BITS.length;
  const decodedBitCount = EXPECTED_BITS.length;
  const correctEncodedBits = packetBits.filter((b, i) => i < encodedBitCount && b === EXPECTED_ENCODED_BITS[i]).length;
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
  all += bit;
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
      all += '<span class="bit-wrong">' + char + '</span>';
    } else {
      all += char;
    }
  }
  return all;
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
let lastSegmentIndex = 0;

function canHear(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i] > FREQUENCY_THRESHOLD;
}
function amplitude(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i];
}
const sum = (total, value) => total + value;

// function evaluateBit(highBits, lowBits) {
//   let highCount = highBits.reduce(
//     (count, highAmplitude, i) => 
//       count += highAmplitude > lowBits[i] ? 1 : 0
//     , 0
//   );
//   return highCount >= (highBits.length / 2) ? '1' : '0';
// }

function avgLabel(array) {
  const values = array.filter(v => v > 0);
  if(values.length === 0) return 'N/A';
  return (values.reduce((t, v) => t + v, 0) / values.length).toFixed(2)
}
function drawBitDurationLines(ctx, color) {
  const { width, height } = receivedGraph;
  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;

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
  return getTimePercent(time, newest) * receivedGraph.width;
}
function getTimePercent(time, newest) {
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  if(newest - time > duration) return -1;
  return ((newest - time) / duration);
}
function drawChannelData() {
  const canvas = document.getElementById('received-channel-graph');
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_POWER;
  const frequencyResolution = sampleRate / fftSize;
  //const frequencyCount = (sampleRate/2) / frequencyResolution;
  const channels = getChannels();
  const channelCount = channels.length;
  const channelHeight = height / channelCount;
  const bandHeight = channelHeight / 2;

  const nyquistFrequency = audioContext.sampleRate / 2;
  const frequencySegments = Math.floor(nyquistFrequency / frequencyResolution);

  const newest = frequencyOverTime[0].time;
  const duration = FREQUENCY_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;

  for(let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    const [low, high] = channels[channelIndex];
    let top = channelHeight * channelIndex;

    ctx.fillStyle = channelIndex % 2 === 0 ? 'black' : 'white';
    // ctx.fillRect(0, top, width, channelHeight);

    // Data
    ctx.strokeStyle = 'blue';
    for(let i = 0; i < frequencyOverTime.length; i++) {
      const {frequencies, time, length, hasSignal, segmentIndex, pairs
      } = frequencyOverTime[i];
      if(!hasSignal) continue;

      const x1 = getTimePercent(time, newest) * width;
      if(x1 === -1) continue;
      const x2 = i < frequencyOverTime.length - 1 ? getTimePercent(frequencyOverTime[i + 1].time, newest) * width : width;
      const sampleWidth = x2 - x1;
      // const amplitude = hzAmplitude(hz, length, frequencies);
      ctx.beginPath();

      // what should the bit be for this channel?
      const bitIndex = (segmentIndex * channelCount) + channelIndex;
      const expectedBit = packetBits[bitIndex];

      // what is the bit?
      const {
        channel,
        lowHz,
        highHz,
        isMissing,
        isHigh
      } = pairs[channelIndex];
      const actualBit = isHigh ? 1 : 0;

      ctx.fillStyle = actualBit === expectedBit ? 'green' : 'red';
      ctx.fillRect(x1, top, sampleWidth,channelHeight);

      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.strokeRect(x1, top, sampleWidth, channelHeight);
      ctx.stroke();
    }

    // channel number
    ctx.font = `${channelHeight}px Arial`;
    const size = ctx.measureText(channelIndex);
    const textHeight = size.fontBoundingBoxAscent + size.fontBoundingBoxDescent;
    const textTop = top;//(top + (channelHeight / 2)) - (textHeight/2);
    ctx.fillStyle = 'red';
    ctx.fillText(channelIndex, 5, textTop);


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
  
  const thresholdY = (1 - (FREQUENCY_THRESHOLD/MAX_DATA)) * height;
  ctx.strokeStyle = 'grey';
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  drawBitDurationLines(ctx, 'rgba(255, 255, 0, .25)');
  drawBitStart(ctx, 'green');
  const frequencies = getChannels();
  frequencies.forEach(([low, high], i) => {
    if(i >= frequencies.length - 1) {
      drawFrequencyLineGraph(ctx, high, 'pink');
      drawFrequencyLineGraph(ctx, low, 'cyan');
    } else {
      drawFrequencyLineGraph(ctx, high, 'rgba(255, 0, 0, .5)');
      drawFrequencyLineGraph(ctx, low, 'rgba(0, 0, 255, .5)');
    }
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