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
var MAX_AMPLITUDE = 300; // Higher than 255 to give us space
const MAXIMUM_PACKETIZATION_SIZE_BITS = 16;
const CRC_BIT_COUNT = 8;

// bits after error correction is applied
let RECEIVED_STREAM_DECODED_BITS = [];
let RECEIVED_PACKET_DECODED_BITS = [];
// bits as they arrived
let RECEIVED_PACKET_RAW_BITS = [];
let RECEIVED_STREAM_RAW_BITS = [];
// all bits after interliving is removed and trimed to packet data size
let RECEIVED_STREAM_ENCODED_BITS = [];
let RECEIVED_PACKET_ENCODED_BITS = [];

// bits as they are sent
let SENT_ORIGINAL_TEXT = '';
let SENT_ORIGINAL_BYTES = [];
let SENT_ORIGINAL_BITS = []; // original bits
let SENT_ENCODED_BITS = []; // bits with error encoding
let SENT_TRANSFER_BITS = []; // bits sent in the transfer

const CHANNEL_OSCILLATORS = [];

// bit stream
let bitStarted;
let lastBitStarted;
let bitEnded;
let bitHighStrength = [];
let bitLowStrength = [];
let lastSegmentIndex = 0;

// interval and timeout ids
var pauseGraphId;
let stopOscillatorsTimeoutId;
var sampleIntervalIds = [];

let EXCLUDED_CHANNELS = [];

var TEXT_TO_SEND = "U";
var RANDOM_COUNT = 19;
var MAX_BITS_DISPLAYED_ON_GRAPH = 79;
var SEGMENT_DURATION = 30;
var AMPLITUDE_THRESHOLD_PERCENT = .75;
var AMPLITUDE_THRESHOLD = 160;
var MINIMUM_FREQUENCY = 9000;
var MAXIMUM_FREQUENCY = 15000;
var LAST_SEGMENT_PERCENT = 0.6;
var FFT_SIZE_POWER = 9;
var FREQUENCY_RESOLUTION_MULTIPLIER = 3;
let CHANNEL_FREQUENCY_RESOLUTION_PADDING = 1;
var SMOOTHING_TIME_CONSTANT = 0;
var HAMMING_ERROR_CORRECTION = true;
let PERIODIC_INTERLEAVING = true;
let WAVE_FORM = "triangle";

const ERROR_CORRECTION_BLOCK_SIZE = 7;
const ERROR_CORRECTION_DATA_SIZE = 4;
let CHANNEL_OVER = -1;
let CHANNEL_SELECTED = -1;
let SEGMENT_OVER = -1;
let SEGMENT_SELECTED = -1;

var SEND_VIA_SPEAKER = false;
var LAST_STREAM_STARTED;
var MINIMUM_INTERVAL_MS = 3; // DO NOT SET THIS BELOW THE BROWSERS MINIMUM "real" INTERVAL
const SAMPLING_INTERVAL_COUNT = 2;
var frequencyOverTime = [];
var bitStart = [];
var samplesPerBit = [];
var bitSampleCount = 0;
var PAUSE = false;
var PAUSE_AFTER_END = true;
var PACKET_SIZE_BITS = 5; // 32 bytes, 256 bits

var EXPECTED_ENCODED_BITS = [];
var EXPECTED_BITS = [];
var EXPECTED_TEXT = '';

const packetReceivedBits = [];
const packetUninterlievedBits = [];
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
  receivedChannelGraph = document.getElementById('received-channel-graph');
  receivedChannelGraph.addEventListener('mouseover', handleReceivedChannelGraphMouseover);
  receivedChannelGraph.addEventListener('mouseout', handleReceivedChannelGraphMouseout);
  receivedChannelGraph.addEventListener('mousemove', handleReceivedChannelGraphMousemove);
  receivedChannelGraph.addEventListener('click', handleReceivedChannelGraphClick);
  document.getElementById('wave-form').value = WAVE_FORM;
  document.getElementById('wave-form').addEventListener('change', (event) => {
    WAVE_FORM = event.target.value;
  });
  document.getElementById('packet-size-power').value = PACKET_SIZE_BITS;
  document.getElementById('packet-size').innerText = friendlyByteSize(2 ** PACKET_SIZE_BITS);
  document.getElementById('packet-size-power').addEventListener('input', event => {
    PACKET_SIZE_BITS = parseInt(event.target.value);
    document.getElementById('packet-size').innerText = friendlyByteSize(2 ** PACKET_SIZE_BITS);
    showSpeed();
  });
  document.getElementById('pause-after-end').checked = PAUSE_AFTER_END;
  document.getElementById('error-correction-hamming').checked = HAMMING_ERROR_CORRECTION;
  document.getElementById('error-correction-hamming').addEventListener('change', event => {
    HAMMING_ERROR_CORRECTION = event.target.checked;
    showSpeed();
  })
  document.getElementById('periodic-interleaving').checked = PERIODIC_INTERLEAVING;
  document.getElementById('periodic-interleaving').addEventListener('change', event => {
    PERIODIC_INTERLEAVING = event.target.checked;
  });
  document.getElementById('pause-after-end').addEventListener('change', event => {
    PAUSE_AFTER_END = event.target.checked;
    if(!PAUSE_AFTER_END) resumeGraph();
  })
  document.getElementById('send-via-speaker').checked = SEND_VIA_SPEAKER;
  document.getElementById('send-via-speaker').addEventListener('input', event => {
    SEND_VIA_SPEAKER = event.target.checked;
  })
  document.getElementById('frequency-resolution-multiplier').value = FREQUENCY_RESOLUTION_MULTIPLIER;
  document.getElementById('frequency-resolution-multiplier').addEventListener('input', event => {
    FREQUENCY_RESOLUTION_MULTIPLIER = parseInt(event.target.value);
    showSpeed();
  })
  document.getElementById('channel-frequency-resolution-padding').value = CHANNEL_FREQUENCY_RESOLUTION_PADDING;
  document.getElementById('channel-frequency-resolution-padding').addEventListener('input', event => {
    CHANNEL_FREQUENCY_RESOLUTION_PADDING = parseInt(event.target.value);
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
function friendlyByteSize(count) {
  let unitIndex = 0;
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb'];
  while(count > 900) {
    count /= 1024;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  count = Math.floor(count * 10) * 0.1
  return `${count.toLocaleString()} ${units[unitIndex]}`
}

function handleTextToSendInput() {
  const text = textToSend.value;
  const dataByteCount = text.length;
  const dataBitCount = dataByteCount * 8;
  const nibblesToEncode = HAMMING_ERROR_CORRECTION ? Math.ceil((dataBitCount) / ERROR_CORRECTION_DATA_SIZE) : 0;
  const errorCorrectionBits = nibblesToEncode * 3;
  const totalBits = errorCorrectionBits + dataBitCount;
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
  document.getElementById('data-size-header-bits').innerText = '0';
  updatePacketStats();
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
  const allChannels = getChannels(true);
  const bitsPerSegment = channels.length;
  const baud = bitsPerSegment * segmentsPerSecond;
  const bytes = baud / 8;
  document.getElementById('durations-per-second').innerText = segmentsPerSecond.toFixed(2);
  document.getElementById('bits-per-duration').innerText = bitsPerSegment;
  document.getElementById('data-transfer-speed-bits-per-second').innerText = baud.toFixed(2);
  document.getElementById('data-transfer-speed-bytes-per-second').innerText = bytes.toFixed(2);
  if(HAMMING_ERROR_CORRECTION) {
    const effectiveBaud = baud * ERROR_CORRECTION_DATA_SIZE / ERROR_CORRECTION_BLOCK_SIZE;
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
  allChannels.forEach(([low, high], i) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    li.appendChild(label);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !EXCLUDED_CHANNELS.includes(i);
    checkbox.addEventListener('input', event => {
      if(event.target.checked) {
        EXCLUDED_CHANNELS = EXCLUDED_CHANNELS.filter(channel => channel !== i)
      } else {
        EXCLUDED_CHANNELS.push(i);
      }
      showSpeed();
    })
    label.append(checkbox);
    const text = document.createTextNode(`Low: ${low} Hz High: ${high} Hz`);
    label.append(text);
    channelList.appendChild(li);
  })
  handleTextToSendInput();
  drawChannels();
  updatePacketStats();
}
function updatePacketStats() {
  const text = textToSend.value;
  const bits = textToBits(text);
  const bitCount = getPacketizationBitCount(bits.length);
  const byteCount = bitCount / 8;
  document.getElementById('original-byte-count').innerText = textToBytes(text).length.toLocaleString();
  document.getElementById('packetization-byte-count').innerText = byteCount.toLocaleString();
  document.getElementById('packetization-bit-count').innerText = bitCount.toLocaleString();
  document.getElementById('packet-bit-count').innerText = getPacketBitCount().toLocaleString();
  document.getElementById('packet-count').innerText = getPacketCount(bitCount).toLocaleString();
  document.getElementById('packet-error-correction').innerText = HAMMING_ERROR_CORRECTION ? 'Yes' : 'No';
  document.getElementById('packet-error-block-count').innerText = getPacketErrorBlockCount().toLocaleString();
  document.getElementById('packet-data-bit-count').innerText = getPacketDataBitCount().toLocaleString();
  document.getElementById('packet-unused-bit-count').innerText = getPacketUnusedBitCount().toLocaleString();
  document.getElementById('last-packet-unused-bit-count').innerText = getPacketLastUnusedBitCount(bitCount).toLocaleString();
  document.getElementById('last-segment-unused-channel-count').innerText = getPacketLastSegmentUnusedChannelCount().toLocaleString()
  document.getElementById('packet-transfer-duration').innerText = getPacketDurationSeconds().toLocaleString() + 's';
  document.getElementById('segment-transfer-duration').innerText = getSegmentTransferDurationSeconds().toLocaleString() + 's';
  document.getElementById('data-transfer-duration').innerText = getDataTransferDurationSeconds(bitCount).toLocaleString() + 's';
  document.getElementById('segments-per-packet').innerText = getPacketSegmentCount().toLocaleString();
  document.getElementById('total-segments').innerText = getTotalSegmentCount(bitCount).toLocaleString();
  document.getElementById('packet-error-bits-per-block').innerText = (HAMMING_ERROR_CORRECTION ? ERROR_CORRECTION_BLOCK_SIZE : 0).toLocaleString();
  document.getElementById('packet-error-bit-count').innerText = getPacketErrorBitCount();
}
function calcCrc(
  bytes,
  size,
  polynomial,
  {
    initialization = 0,
    reflectIn = false,
    reflectOut = false,
    xorOut = 0
  } = {}
) {
  if(bytes.length === 0) return 0;
  const validBits = (1 << size) - 1;
  const mostSignificantBit = 1 << size - 1;
  const bitsBeforeLastByte = size - 8;

  // setup our initial value
  let crc = initialization;

  function reverseBits(value, size) {
    let reversed = 0;
    for(let i = 0; i < size; i++) {
      // if bit position is on
      if(value & (1<<i)) {
        // turn on bit in reverse order
        reversed |= 1 << (size - 1 - i);
      }
    }
    return reversed;
  }

  for(let byte of bytes) {
    // reflect incoming bits?
    if(reflectIn){
      byte = reverseBits(byte, 8);
    }
    // xor current byte against first byte of crc
    crc ^= byte << bitsBeforeLastByte;
    // loop through the first 8 bits of the crc
    for(let i = 0; i < 8; i++) {
      // is first bit 1?
      const isFlagged = crc & mostSignificantBit;
      // if flagged, xor the first bit to prevent overflow
      if(isFlagged) crc ^= mostSignificantBit;
      // shift bits left
      crc <<= 1;
      // remove invalid bits
      crc &= validBits;
      // xor the polynomial
      if(isFlagged) crc ^= polynomial;
    }
  }

  // We only want the last [size] bits
  crc &= validBits;

  // reflect final bits?
  if(reflectOut) crc = reverseBits(crc, size);

  // xor the final value going out
  crc ^= xorOut;

  // remove sign
  if(size >= 32 && crc & mostSignificantBit) {
    crc >>>= 0;
  }
  return crc;
}
function crc(bytes, bitCount) {
  switch(bitCount) {
    case 8: return crc8(bytes);
    case 16: return crc16(bytes);
    case 32: return crc32(bytes);
    default: return 0;
  }
}
function crc8(bytes) { return calcCrc(bytes, 8, 0x07); }
function crc16(bytes) { 
  return calcCrc(
    bytes,
    16,
    0x8005,
    {
      initialization: 0,
      reflectIn: true,
      reflectOut: true,
      xorOut: 0
    }
  );
}
function crc32(bytes) {
  return calcCrc(
    bytes,
    32,
    0x04C11DB7,
    {
      initialization: 0xFFFFFFFF,
      reflectIn: true,
      reflectOut: true,
      xorOut: 0x0
    }
  );
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
}

function percentInFrequency(hz, frequencyResolution) {
  const index = Math.floor(hz/frequencyResolution);
  const startHz = index * frequencyResolution;
  const hzInSegement = hz - startHz;
  const percent = hzInSegement / frequencyResolution;
  return percent;
}
function nibbleToHamming(nibble) {
  if(nibble.length !== ERROR_CORRECTION_DATA_SIZE) return [];
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
  if(hamming.length !== ERROR_CORRECTION_BLOCK_SIZE) return [];
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
function removeInterleaving(bits) {
  return applyInterleaving(bits, true);
}
function applyInterleaving(bits, undo = false) {
  // Not turned on
  if(!PERIODIC_INTERLEAVING) return bits;

  // Only applicable for error correction
  if(!HAMMING_ERROR_CORRECTION) return bits;

  const channels = getChannels();
  const channelCount = channels.length;

  // We need at least 1 extra channel for one bit to escape the block
  if(channelCount < ERROR_CORRECTION_BLOCK_SIZE + 1) return bits;

  const blockCount = Math.ceil(channelCount / ERROR_CORRECTION_BLOCK_SIZE);
  // need another block to swap bits with
  if(blockCount < 2) return bits;

  // make a copy
  bits = bits.slice();

  // ensure last segment has enough bits to swap
  while(bits.length % channelCount !== 0) bits.push(0);

  // Loop through each segment
  for(let i = 0; i < bits.length; i+= channelCount) {

    // Grab the bits for the segment
    let segment = bits.slice(i, i + channelCount);
    segment = staggerValues(segment, ERROR_CORRECTION_BLOCK_SIZE, undo);

    // update the bits with the modified segment
    bits.splice(i, channelCount, ...segment);
  }
  return bits;
}

function staggerValues(values, blockSize, undo) {
  // loop through bit indexes of a block
  for(let blockMovement = 1; blockMovement < blockSize; blockMovement++) {
    values.filter((_, i) =>
      // values to be moved to different blocks
      i % blockSize === blockMovement
    ).map((_,i,a) => {
      // bit values moved N blocks
      if(undo) i -= blockMovement; else i += blockMovement;
      i = ((i % a.length) + a.length) % a.length;
      return a[i];
    }).forEach((v, i) => {
      // replace with new values
      values[blockMovement + (i * blockSize)] = v;
    })
  };
  return values;
}

function applyErrorCorrection(bits) {
  if(!HAMMING_ERROR_CORRECTION) return bits;
  const encodedBits = [];
  for(let i = 0; i < bits.length; i+= ERROR_CORRECTION_DATA_SIZE) {
    const nibble = bits.slice(i, i + ERROR_CORRECTION_DATA_SIZE);
    while(nibble.length < ERROR_CORRECTION_DATA_SIZE) nibble.push(0);
    encodedBits.push(...nibbleToHamming(bits.slice(i, i + ERROR_CORRECTION_DATA_SIZE)));
  }
  return encodedBits;
}
function getChannels(includeExcluded = false) {
  var audioContext = getAudioContext();
  const sampleRate = audioContext.sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const channels = [];
  const pairStep = frequencyResolution * (2 + CHANNEL_FREQUENCY_RESOLUTION_PADDING) * FREQUENCY_RESOLUTION_MULTIPLIER;
  let channelId = -1;
  for(let hz = MINIMUM_FREQUENCY; hz < MAXIMUM_FREQUENCY; hz+= pairStep) {
    const low = hz;
    const high = hz + frequencyResolution * FREQUENCY_RESOLUTION_MULTIPLIER;
    if(low < MINIMUM_FREQUENCY) continue;
    if(high > MAXIMUM_FREQUENCY) continue;
    channelId++;

    if(!includeExcluded) {
      if(EXCLUDED_CHANNELS.includes(channelId)) continue;
    }
    channels.push([low, high]);
  }
  return channels;
}
function logSent(text) {
  // display what is being sent
  sentDataTextArea.value += text + '\n';
  sentDataTextArea.scrollTop = sentDataTextArea.scrollHeight;
}

function sendBytes(bytes) {
  const byteCount = bytes.length;
  if(byteCount === 0) {
    logSent('Nothing to send!');
    return;
  } else if(byteCount > 0xFFFF) {
    logSent('Too much to send!');
    return;
  }

  const bits = bytesToBits(bytes);

  SENT_ORIGINAL_TEXT = bytesToText(bytes);
  SENT_ORIGINAL_BYTES = bytes;
  SENT_ORIGINAL_BITS = bits.slice();  

  // packetization headers
  // data length
  const dataLengthBits = numberToBits(bytes.length, MAXIMUM_PACKETIZATION_SIZE_BITS);
  // crc on data length
  const dataLengthCrcBits = numberToBits(crc(bitsToBytes(dataLengthBits), CRC_BIT_COUNT), CRC_BIT_COUNT);

  // prefix with headers
  bits.unshift(...dataLengthBits, ...dataLengthCrcBits);

  const bitCount = bits.length;

  SENT_TRANSFER_BITS.length = 0;
  SENT_ENCODED_BITS.length = 0;

  // add 100ms delay before sending
  const startSeconds = audioContext.currentTime + 0.1;
  const startMilliseconds = startSeconds * 1000;

  const packetBitCount = getPacketBitCount();
  const packetDurationSeconds = getPacketDurationSeconds();
  const packetCount = getPacketCount(bitCount);
  const totalDurationSeconds = getDataTransferDurationSeconds(bitCount);
  const totalDurationMilliseconds = getDataTransferDurationMilliseconds(bitCount);

  const channelCount = getChannels().length;
  const errorCorrectionBits = [];
  const interleavingBits = [];

  createOscillators(startSeconds);
  // send all packets
  for(let i = 0; i < packetCount; i++) {
    let packet = getPacketBits(bits, i);
    errorCorrectionBits.push(...packet);
    SENT_ENCODED_BITS.push(...packet);
    if(packet.length > packetBitCount) {
      console.error('Too many bits in the packet.');
      disconnectOscillators();
      return;
    }
    packet = padArray(packet, packetBitCount, 0);
    packet = applyInterleaving(packet);
    interleavingBits.push(...packet);
    sendPacket(packet, startSeconds + (i * packetDurationSeconds));
  }
  stopOscillators(startSeconds + totalDurationSeconds);
  stopOscillatorsTimeoutId = window.setTimeout(
    disconnectOscillators,
    startMilliseconds + totalDurationMilliseconds
  );
  // show what was sent

  // original bits
  document.getElementById('sent-data').innerHTML =
    SENT_ORIGINAL_BITS.reduce(bitReducer(
      getPacketDataBitCount(),
      HAMMING_ERROR_CORRECTION ? ERROR_CORRECTION_DATA_SIZE : 8
    ), '');
  
  // error correcting bits
  if(HAMMING_ERROR_CORRECTION) {
    document.getElementById('error-correcting-data').innerHTML =
    SENT_ENCODED_BITS.reduce(bitReducer(
      getPacketErrorBitCount(),
      ERROR_CORRECTION_BLOCK_SIZE
    ), '');
  } else {
    document.getElementById('error-correcting-data').innerHTML = '';
  }

  document.getElementById('actual-bits-to-send').innerHTML = 
  SENT_TRANSFER_BITS.reduce(bitReducer(
    getPacketBitCount() + getPacketLastSegmentUnusedChannelCount(),
    channelCount,
    (packetIndex, blockIndex) => `${blockIndex === 0 ? '' : '<br>'}Segment ${blockIndex}: `
  ), '');  

  // start the graph moving again
  resumeGraph();
}
function sendPacket(bits, packetStartSeconds) {
  const channels = getChannels();
  const channelCount = channels.length;
  let bitCount = bits.length;
  const segmentDurationSeconds = getSegmentTransferDurationSeconds();
  for(let i = 0; i < bitCount; i += channelCount) {
    const segmentBits = bits.slice(i, i + channelCount);
    const segmentIndex = Math.floor(i / channelCount);
    var offsetSeconds = segmentIndex * segmentDurationSeconds;
    changeOscillators(segmentBits, packetStartSeconds + offsetSeconds);
  }
}

function getDataTransferDurationMilliseconds(bitCount) {
  return getPacketCount(bitCount) * getPacketDurationMilliseconds();
}
function getDataTransferDurationSeconds(bitCount) {
  return getDataTransferDurationMilliseconds(bitCount) / 1000;
}
function getPacketDurationMilliseconds() {
  return getPacketSegmentCount() * SEGMENT_DURATION;
}
function getPacketEndMilliseconds(packetStartedMilliseconds) {
  return (packetStartedMilliseconds + getPacketDurationMilliseconds()) - 1;
}
function getTotalSegmentCount(bitCount) {
  return getPacketCount(bitCount) * getPacketSegmentCount();
}
function getPacketDurationSeconds() {
  return getPacketDurationMilliseconds() / 1000;
}
function getSegmentTransferDurationSeconds() {
  return SEGMENT_DURATION / 1000;
}
function getPacketByteCount() {
  return 2 ** PACKET_SIZE_BITS;
}
function getPacketizationBitCount(bitCount) {
  return bitCount + MAXIMUM_PACKETIZATION_SIZE_BITS + CRC_BIT_COUNT;
}
function getPacketBitCount() {
  return getPacketByteCount() * 8;
}
function getPacketSegmentCount() {
  return Math.ceil(getPacketBitCount() / getChannels().length);
}
function getPacketCount(bitCount) {
  if(!canSendPacket()) return 0;

  // How many data bits will be encoded in our packet?
  let dataBitCount = getPacketDataBitCount();

  // Return the total number of packets needed to send all data
  return Math.ceil(bitCount / dataBitCount);
}
function getPacketBits(bits, packetIndex) {
  if(!canSendPacket()) return [];
  return getPacketUsedBits(bits, packetIndex);  
}
function getPacketUsedBits(bits, packetIndex) {
  if(!canSendPacket()) return [];

  // How many data bits will be in our packet?
  const dataBitCount = getPacketDataBitCount();

  // grab our data
  const startIndex = packetIndex * dataBitCount;
  const endIndex = startIndex + dataBitCount;
  let packetBits = bits.slice(startIndex, endIndex);

  // Are we using error correction?
  if(HAMMING_ERROR_CORRECTION) {
    // encode data bits
    packetBits = applyErrorCorrection(packetBits);
  }
  return packetBits;
}
function getPacketErrorBlockCount() {
  const bitCount = getPacketBitCount();
  // No error correction?
  if(!HAMMING_ERROR_CORRECTION) {
    // No error blocks
    return 0;
  }
  // How many error blocks can be in a packet?
  return Math.floor(
    bitCount / 
    ERROR_CORRECTION_BLOCK_SIZE
  );
}
function getPacketUsedBitCount() {
  return HAMMING_ERROR_CORRECTION ? getPacketErrorBitCount() : getPacketBitCount();
}
function getPacketErrorBitCount() {
  return getPacketErrorBlockCount() * ERROR_CORRECTION_BLOCK_SIZE;
}
function canSendPacket() {
  const max = getPacketBitCount();
  // Need at least 1 bit to send
  if(max < 1) return false;
  // Has error correction?
  if(HAMMING_ERROR_CORRECTION) {
    // Need enough bits to fit one or more blocks
    return max >= ERROR_CORRECTION_BLOCK_SIZE;
  }
  // 1 or more is great without encoding
  return true;
}
function getPacketLastSegmentUnusedChannelCount() {
  const channelCount = getChannels().length;
  return (channelCount - (getPacketBitCount() % channelCount));
}
function getPacketUnusedBitCount() {
  const bitsAvailable = getPacketBitCount();
  let bitsUsed = bitsAvailable;
  if(HAMMING_ERROR_CORRECTION) {
    bitsUsed = getPacketErrorBitCount();
  }
  return bitsAvailable - bitsUsed;
}
function getPacketLastUnusedBitCount(bitCount) {
  const availableBits = getPacketBitCount();
  const dataBitsPerPacket = getPacketDataBitCount();
  let usedBits = bitCount % dataBitsPerPacket;
  if(HAMMING_ERROR_CORRECTION) {
    const blocks = Math.ceil(usedBits / ERROR_CORRECTION_DATA_SIZE);
    usedBits = blocks * ERROR_CORRECTION_BLOCK_SIZE;
  }
  return availableBits - usedBits;
}
function getPacketDataBitCount() {
  const bitCount = getPacketBitCount();
  // No error correction?
  if(!HAMMING_ERROR_CORRECTION) {
    // Return all bits available
    return bitCount;
  }
  return getPacketErrorBlockCount() * ERROR_CORRECTION_DATA_SIZE;
}
function padArray(values, length, value) {
  values = values.slice();//copy
  while(values.length < length) values.push(value);
  return values;
}
function createOscillators(streamStartSeconds) {
  const oscillators = getOscillators();
  if(oscillators.length !== 0) disconnectOscillators();
  var audioContext = getAudioContext();
  const channels = getChannels();
  const channelCount = channels.length;
  const destination = SEND_VIA_SPEAKER ? audioContext.destination : getAnalyser();
  // create our oscillators
  for(let i = 0; i < channelCount; i++) {
    const oscillator = audioContext.createOscillator();
    oscillator.connect(destination);
    oscillator.type = WAVE_FORM;
    oscillator.start(streamStartSeconds);
    oscillators.push(oscillator);
  }
  sendButton.innerText = 'Stop';
  return oscillators;
}
function getOscillators() {
  return CHANNEL_OSCILLATORS;
}
function changeOscillators(bits, startSeconds) {
  const oscillators = getOscillators();
  getChannels().forEach((channel, i) => {
    // missing bits past end of bit stream set to zero
    const isHigh = bits[i] ?? 0;
    SENT_TRANSFER_BITS.push(isHigh);
    const oscillator = oscillators[i];
    // already at correct frequency
    if(oscillator.on === isHigh) return;
    oscillator.on = isHigh;
    const hz = channel[isHigh ? 1 : 0];
    oscillator.frequency.setValueAtTime(hz, startSeconds);
  });
}
function stopOscillators(streamEndSeconds) {
  const channels = getChannels();
  const oscillators = getOscillators();
  const channelCount = channels.length;
  // silence oscillators when done
  for(let channel = 0; channel < channelCount; channel++) {
    const oscillator = oscillators[channel];
    oscillator?.stop(streamEndSeconds);
  }
}
function disconnectOscillators() {
  stopOscillators(getAudioContext().currentTime);
  const oscillators = getOscillators();
  oscillators.forEach(
    oscillator => oscillator.disconnect()
  )
  oscillators.length = 0;
  sendButton.innerText = 'Send';
  stopOscillatorsTimeoutId = undefined;
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
      MINIMUM_INTERVAL_MS + (i/SAMPLING_INTERVAL_COUNT)
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
  const channelCount = getChannels().length;
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencies);
  const length = audioContext.sampleRate / analyser.fftSize;
  let processSegment = false;
  const {
    hasSignal: hadPriorSignal,
    streamStarted: initialStreamStart = -1,
    streamEnded: priorStreamEnded = -1,
    segmentIndex: priorSegmentIndex = -1,
    packetIndex: priorPacketIndex = -1
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
  let processPacket = false;
  if(hasSignal) {
    if(hadPriorSignal) {
      // continued bit stream
      data.streamStarted = initialStreamStart;
      data.streamEnded = priorStreamEnded;
      data.packetIndex = priorPacketIndex;

      if(time > priorStreamEnded) {
        processPacket = true;
        // new packet
        data.streamStarted = priorStreamEnded;
        data.streamEnded = getPacketEndMilliseconds(initialStreamStart);
        data.packetIndex = priorPacketIndex + 1;
      }
    } else {
      if(pauseGraphId) {
        window.clearTimeout(pauseGraphId);
        pauseGraphId = undefined;
        // recover prior bit stream
        data.streamStarted = LAST_STREAM_STARTED;
        data.streamEnded = getPacketEndMilliseconds(LAST_STREAM_STARTED);
      } else {
          // new bit stream
        data.streamStarted = time;
        LAST_STREAM_STARTED = time;
        data.packetIndex = 0;
        // clear last packet
        packetReceivedBits.length = 0;
        packetUninterlievedBits.length = 0;
        packetDataByteCount = 0;
        data.streamEnded = getPacketEndMilliseconds(time);   
      }
    }

    // number of bit in the packet
    const segmentIndex = data.segmentIndex = Math.floor((time - data.streamStarted) / SEGMENT_DURATION);
    if(priorPacketIndex !== data.packetIndex ||
        (priorSegmentIndex !== segmentIndex && priorSegmentIndex > -1)
    ) {
      processSegment = true;
    }
  } else {
    data.segmentIndex = -1;
    data.packetIndex = -1;
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
      if(PAUSE_AFTER_END && !pauseGraphId) {
         pauseGraphId = window.setTimeout(() => {
          pauseGraphId = undefined;
          if(PAUSE_AFTER_END) stopGraph();
          processSegmentReceived(initialStreamStart, priorPacketIndex, priorSegmentIndex);
          processPacketReceived(priorPacketIndex, initialStreamStart, priorStreamEnded);
        }, SEGMENT_DURATION * 2);
      }
    } else {
      // continued stopping (or never started)
      data.streamEnded = -1;
    }
  }
  frequencyOverTime.unshift(data);
  if(processSegment) processSegmentReceived(initialStreamStart, priorPacketIndex, priorSegmentIndex);
  if(processPacket) processPacketReceived(priorPacketIndex, initialStreamStart, priorStreamEnded);

  truncateGraphData();
}

function GET_SEGMENT_BITS(streamStarted, segmentIndex, originalOrder = false) {
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
  return originalOrder ? bitValues : removeInterleaving(bitValues);
}
function resetReceivedData() {
  resetStream();
  resetPacket();
}
function resetStream() {
  RECEIVED_STREAM_RAW_BITS.length = 0;
  RECEIVED_STREAM_ENCODED_BITS.length = 0;
  RECEIVED_STREAM_DECODED_BITS.length = 0;
  RECEIVED_STREAM_DATA_LENGTH = -1;
}
function resetPacket() {
  RECEIVED_PACKET_RAW_BITS.length = 0;
  RECEIVED_PACKET_DECODED_BITS.length = 0;
  RECEIVED_PACKET_ENCODED_BITS.length = 0;
  packetReceivedBits.length = 0;
  packetUninterlievedBits.length = 0;
  packetDecodedBits.length = 0;
}
function processPacketReceived(packetIndex, startMs, endMs) {
  if(packetIndex === 0) resetStream();

  // append to the stream
  RECEIVED_STREAM_RAW_BITS.push(...RECEIVED_PACKET_RAW_BITS);
  RECEIVED_STREAM_ENCODED_BITS.push(...RECEIVED_PACKET_ENCODED_BITS);
  RECEIVED_STREAM_DECODED_BITS.push(...RECEIVED_PACKET_DECODED_BITS);

  resetPacket();
  updateReceivedData();
}
function processSegmentReceived(packetStarted, packetIndex, segmentIndex) {
  // is our segment long enough?

  const samples = frequencyOverTime.filter(
    fot => fot.streamStarted === packetStarted &&
    fot.segmentIndex === segmentIndex
  );

  let bitValues;
  if(samples.length === 0) {
    // nothing collected
    return;
  } else {
    const sampleEnd = samples[0].time;
    const sampleStart = packetStarted + (segmentIndex * SEGMENT_DURATION);
    const sampleDuration = (sampleEnd - sampleStart) + MINIMUM_INTERVAL_MS;

    // not long enough to qualify as a segment
    if((sampleDuration / SEGMENT_DURATION) < LAST_SEGMENT_PERCENT) return;

    bitValues = GET_SEGMENT_BITS(packetStarted, segmentIndex, true);
  }

  packetReceivedBits.push(...bitValues);
  
  // NOTE: Can't remove interleaving unless we have error correction and > 7 channels
  packetUninterlievedBits.push(...removeInterleaving(bitValues));

  if(HAMMING_ERROR_CORRECTION) {

    const errorBitCount = getPacketErrorBitCount();
    const errorBits = packetUninterlievedBits.slice(0, errorBitCount);
    packetDecodedBits.length = 0;
    for(let i = 0; i < errorBits.length; i += ERROR_CORRECTION_BLOCK_SIZE) {
      const blockBits = errorBits.slice(i, i + ERROR_CORRECTION_BLOCK_SIZE);
      if(blockBits.length === ERROR_CORRECTION_BLOCK_SIZE) {
        const nibble = hammingToNibble(blockBits);
        packetDecodedBits.push(...nibble);
      }
    }
  } else {
    packetDecodedBits.length = 0;
    packetDecodedBits.push(...packetUninterlievedBits);
  }

  RECEIVED_PACKET_RAW_BITS.push(...bitValues);
  RECEIVED_PACKET_ENCODED_BITS = packetUninterlievedBits.slice(0, getPacketUsedBitCount());
  RECEIVED_PACKET_DECODED_BITS = packetDecodedBits.slice(0, getPacketUsedBitCount());

  updateReceivedData();
}

function updateReceivedData() {
  const channelCount = getChannels().length;
  let allRawBits = [
    ...RECEIVED_STREAM_RAW_BITS,
    ...RECEIVED_PACKET_RAW_BITS
  ];

  let allEncodedBits = [
    ...RECEIVED_STREAM_ENCODED_BITS,
    ...RECEIVED_PACKET_ENCODED_BITS
  ];
  let allDecodedBits = [
    ...RECEIVED_STREAM_DECODED_BITS,
    ...RECEIVED_PACKET_DECODED_BITS
  ]

  // get packet data before removing decoded bits
  const transmissionByteCount = parseTransmissionByteCount(allDecodedBits);
  const transmissionByteCountCrc = parseTransmissionByteCountCrc(allDecodedBits)
  const transmissionByteCountActualCrc = crc(
    bitsToBytes(
      numberToBits(
        transmissionByteCount,
        MAXIMUM_PACKETIZATION_SIZE_BITS
      )
    ), CRC_BIT_COUNT
  );
  const trustedLength = transmissionByteCountCrc === transmissionByteCountActualCrc;
  const totalBitsTransferring = parseTotalBitsTransferring(allDecodedBits);

  // reduce all decoded bits based on original data sent
  allDecodedBits = removeDecodedHeadersAndPadding(allDecodedBits);

  // reduce encoded bits based on original data sent
  allEncodedBits = removeEncodedPadding(allEncodedBits);

  const encodedBitCount = SENT_ENCODED_BITS.length;
  const decodedBitCount = SENT_ORIGINAL_BITS.length;
  const rawBitCount = SENT_TRANSFER_BITS.length;

  const correctRawBits = allRawBits.filter((b, i) => i < rawBitCount && b === SENT_TRANSFER_BITS[i]).length;
  const correctEncodedBits = allEncodedBits.filter((b, i) => i < encodedBitCount && b === SENT_ENCODED_BITS[i]).length;
  const correctedDecodedBits = allDecodedBits.filter((b, i) => i < decodedBitCount && b === SENT_ORIGINAL_BITS[i]).length;

  const receivedProgess = document.getElementById('received-progress');
  let percentReceived = allRawBits.length / totalBitsTransferring;
  receivedProgess.style.width = `${Math.floor(Math.min(1, percentReceived) * 100)}%`;

  document.getElementById('received-raw-bits').innerHTML = allRawBits
    .reduce(
      bitExpectorReducer(
        SENT_TRANSFER_BITS,
        getPacketBitCount() + getPacketLastSegmentUnusedChannelCount(),
        channelCount,
        (packetIndex, blockIndex) => `${blockIndex === 0 ? '' : '<br>'}Segment ${blockIndex}: `
      ),
    '');
    if(HAMMING_ERROR_CORRECTION) {
      document.getElementById('received-encoded-bits').innerHTML = allEncodedBits
      .reduce(
        bitExpectorReducer(
          SENT_ENCODED_BITS,
          getPacketUsedBitCount(),
          ERROR_CORRECTION_BLOCK_SIZE
        ),
      '');
    } else {
      document.getElementById('received-encoded-bits').innerHTML = 'Not encoded.';
    }
  document.getElementById('received-decoded-bits').innerHTML = allDecodedBits
    .reduce(
      bitExpectorReducer(
        SENT_ORIGINAL_BITS,
        getPacketDataBitCount(),
        HAMMING_ERROR_CORRECTION ? ERROR_CORRECTION_DATA_SIZE : 8
      ),
    '');
  document.getElementById('received-packet-original-bytes').innerText = transmissionByteCount.toLocaleString();
  const packetCrc = document.getElementById('received-packet-original-bytes-crc');
  packetCrc.innerText = '0x' + asHex(2)(transmissionByteCountCrc);
  packetCrc.className = trustedLength ? 'bit-correct' : 'bit-wrong';
  if(!trustedLength) {
    packetCrc.innerText += ' (Expected 0x' + asHex(2)(transmissionByteCountActualCrc) + ')';
  }

  document.getElementById('received-encoded-bits-error-percent').innerText = (
    Math.floor((1 - (correctEncodedBits / allEncodedBits.length)) * 10000) * 0.01
  ).toLocaleString();
  document.getElementById('received-raw-bits-error-percent').innerText = (
    Math.floor((1 - (correctRawBits / allRawBits.length)) * 10000) * 0.01
  ).toLocaleString();
  document.getElementById('received-decoded-bits-error-percent').innerText = (
    Math.floor((1 - (correctedDecodedBits / allDecodedBits.length)) * 10000) * 0.01
  ).toLocaleString();
  document.getElementById('decoded-text').innerHTML = allDecodedBits.reduce(textExpectorReducer(SENT_ORIGINAL_TEXT), '');
}
function asHex(length) {
  return (number) => number.toString(16).padStart(length, '0').toUpperCase();
}
function parseTotalBitsTransferring(decodedBits) {
  const dataByteCount = parseTransmissionByteCount(decodedBits);
  const bitCount = getPacketizationBitCount(dataByteCount * 8);
  const segments = getTotalSegmentCount(bitCount);
  return segments * getChannels().length;
}
function parseTransmissionByteCountCrc(decodedBits) {
  const offset = MAXIMUM_PACKETIZATION_SIZE_BITS;
  decodedBits = decodedBits.slice(offset, offset + CRC_BIT_COUNT);
  return bitsToInt(decodedBits, CRC_BIT_COUNT);
}
function parseTransmissionByteCount(decodedBits) {
  decodedBits = decodedBits.slice(0, MAXIMUM_PACKETIZATION_SIZE_BITS);
  while(decodedBits.length < MAXIMUM_PACKETIZATION_SIZE_BITS) {
    // assume maximum value possible
    // until we have enough bits to find the real size
    decodedBits.push(1);
  }
  return bitsToInt(decodedBits, MAXIMUM_PACKETIZATION_SIZE_BITS);
}
function removeEncodedPadding(bits) {
  const sizeBits = MAXIMUM_PACKETIZATION_SIZE_BITS;
  const dataSize = ERROR_CORRECTION_DATA_SIZE;
  const blockSize = ERROR_CORRECTION_BLOCK_SIZE;
  let bitsNeeded = sizeBits;
  let blocksNeeded = sizeBits;
  // need to calc max bits
  if(HAMMING_ERROR_CORRECTION) {
    blocksNeeded = Math.ceil(sizeBits / dataSize);
    bitsNeeded = blocksNeeded * blockSize;
  }
  if(bits.length < bitsNeeded) {
    // unable to parse size just yet
    return bits;
  }

  // get header bits representing the size
  let dataSizeBits = [];
  let headerBitCount = MAXIMUM_PACKETIZATION_SIZE_BITS + CRC_BIT_COUNT;

  if(HAMMING_ERROR_CORRECTION) {
    for(i = 0; i < blocksNeeded; i++) {
      const block = bits.slice(i * blockSize, (i + 1) * blockSize);
      dataSizeBits.push(...hammingToNibble(block));
    }
    dataSizeBits.length = sizeBits;
    headerBitCount = Math.ceil(headerBitCount / ERROR_CORRECTION_DATA_SIZE) * ERROR_CORRECTION_BLOCK_SIZE;
  } else {
    dataSizeBits = bits.slice(0, sizeBits);
  }
  // decode the size
  const dataByteCount = bitsToInt(dataSizeBits, sizeBits);

  // determine how many decoded bits need to be sent (including the size)
  const totalBits = (dataByteCount * 8) + MAXIMUM_PACKETIZATION_SIZE_BITS + CRC_BIT_COUNT;
  let encodingBitCount = totalBits;
  if(HAMMING_ERROR_CORRECTION) {
    const blocks = Math.ceil(encodingBitCount / dataSize);
    encodingBitCount = blocks * blockSize;
  }

  // bits are padded
  if(bits.length > encodingBitCount) {
    // remove padding
    bits = bits.slice();
    bits.length = encodingBitCount;
  }
  return bits;
}
function removeDecodedHeadersAndPadding(bits) {
  const sizeBits = MAXIMUM_PACKETIZATION_SIZE_BITS;
  let bitCount = bits.length / 8;
  if(bits.length >= sizeBits) {
    bitCount = bitsToInt(bits.slice(0, sizeBits), sizeBits);
  }
  // remove size and crc header
  bits.splice(0, sizeBits + CRC_BIT_COUNT);

  // remove excessive bits
  bits.splice(bitCount * 8);
  return bits;
}
const bitReducer = (packetBitSize, blockSize, blockCallback) => (all, bit, i)  => {
  const packetIndex = Math.floor(i / packetBitSize);
  if(i % packetBitSize === 0) {
    all += `<span class="bit-packet">Packet ${packetIndex}</span>`;
  }
  const packetBitIndex = i % packetBitSize;
  if(packetBitIndex % blockSize === 0) {
    if(blockCallback) {
      const blockIndex = Math.floor(packetBitIndex / blockSize);
      return all + blockCallback(packetIndex, blockIndex) + bit;
    }
    return all + ' ' + bit;
  }
  return all + bit;
}
const bitExpectorReducer = (expected, packetBitSize, blockSize, blockCallback) => (all, bit, i) => {
  const packetIndex = Math.floor(i / packetBitSize);
  if(i % packetBitSize === 0) {
    all += `<span class="bit-packet">Packet ${packetIndex}</span>`;
  }
  const packetBitIndex = i % packetBitSize;

  if(packetBitIndex % blockSize === 0) {
    if(blockCallback) {
      const blockIndex = Math.floor(packetBitIndex / blockSize)
      all += blockCallback(packetIndex, blockIndex);
    } else if (packetBitIndex !== 0) {
      all += ' ';
    }
  }
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
  // if(i < PACKET_SIZE_BITS) return all;
  if(i % 8 === 0) {
    const bitString = bits.slice(
      i, 
      i + 8
    ).join('').padEnd(8, '0');
    const ascii = parseInt(bitString, 2);
    const char = String.fromCharCode(ascii);
    const charIndex = Math.floor(i / 8);
    const html = htmlEncode(printable(char));
    if(i >= expected.length * 8) {
      all += '<span class="bit-unexpected">' + html + '</span>';
    } else if(char !== expected[charIndex]) {
      all += '<span class="bit-wrong">' + html + '</span>';
    } else {
      all += html;
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
function bitsToInt(bits, bitLength) {
  // only grab the bits we need
  const bitString = bits.slice(0, bitLength)
    // combine into string
    .join('')
    // Assume missing bits were zeros
    .padEnd(bitLength, '0');
  // parse as int
  return parseInt(bitString, 2);
}
function intToBytes(int, bitLength) {
  const byteCount = Math.ceil(bitLength/8);
  const bytes = [];
  for(let i = 0; i < byteCount; i++) {
    bytes.push((int >> (8 * (byteCount - 1 - i))) & 0xFF);
  }
  return bytes;
}
function numberToBits(number, bitLength) {
  const bits = [];
  for(let i = bitLength - 1; i >= 0; i--)
    bits.push((number >> i) & 1);
  return bits;
}
function bytesToText(bytes, encoding='utf-8') {
  return new TextDecoder(encoding).decode(bytes);
}
function textToBytes(text, encoding='utf-8') {
  return new TextEncoder(encoding).encode(text);
}
function bytesToBits(bytes) {
  return bytes.reduce((bits, byte) => [
      ...bits, 
      ...byte.toString(2).padStart(8, '0').split('').map(Number)
    ], []);
}
function bitsToBytes(bits) {
  const bytes = [];
  for(let i = 0; i < bits.length; i+= 8) {
    bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  return bytes;
}
function textToBits(text) {
  return bytesToBits(textToBytes(text));
}
function bitsToText(bits) {
  return bytesToText(bitsToBytes(bits));
}
function handleSendButtonClick() {
  if(stopOscillatorsTimeoutId) {
    disconnectOscillators();
    return;
  }
  resetReceivedData();

  const text = document.getElementById('text-to-send').value;
  EXPECTED_TEXT = text;
  sendBytes(textToBytes(text));
}
function getAnalyser() {
  if(analyser) return analyser;
  analyser = audioContext.createAnalyser();
  analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  analyser.fftSize = 2 ** FFT_SIZE_POWER;
  return analyser;
}
function handleListeningCheckbox(e) {
  stopGraph();
  var audioContext = getAudioContext();
  function handleMicrophoneOn(stream) {
    microphoneStream = stream;
    microphoneNode = audioContext.createMediaStreamSource(stream);
    analyser = getAnalyser();
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

function canHear(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i] > AMPLITUDE_THRESHOLD;
}
function amplitude(hz, {frequencies, length}) {
  var i = Math.round(hz / length);
  return frequencies[i];
}
function sum(total, value) {
  return total + value;
}
function avgLabel(array) {
  const values = array.filter(v => v > 0);
  if(values.length === 0) return 'N/A';
  return (values.reduce((t, v) => t + v, 0) / values.length).toFixed(2)
}
function drawSegmentIndexes(ctx, width, height) {
  // Do/did we have a stream?
  if(!LAST_STREAM_STARTED) return;
  const latest = frequencyOverTime[0].time;

  // will any of the stream appear?
  const packetDuration = getPacketDurationMilliseconds();
  const lastStreamEnded = LAST_STREAM_STARTED + packetDuration;
  const graphDuration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const graphEarliest = latest - graphDuration;
  // ended too long ago?
  if(lastStreamEnded < graphEarliest) return;

  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;

  const latestSegmentEnded = Math.min(latest, lastStreamEnded);

  for(let time = latestSegmentEnded; time > graphEarliest; time -= SEGMENT_DURATION) {
    // too far back?
    if(time < LAST_STREAM_STARTED) break;

    // which segment are we looking at?
    const segmentIndex = Math.floor(((time - LAST_STREAM_STARTED) / SEGMENT_DURATION));

    // when did the segment begin/end
    const segmentStart = LAST_STREAM_STARTED + (segmentIndex * SEGMENT_DURATION);
    const segmentEnd = segmentStart + SEGMENT_DURATION;

    // where is the segments left x coordinate?
    const leftX = ((latest - segmentEnd) / graphDuration) * width;

    // Draw segment index
    ctx.fontSize = '24px';
    if(segmentStart < lastStreamEnded) {
      let text = segmentIndex.toString();
      let size = ctx.measureText(text);
      let textX = leftX + (segmentWidth / 2) - (size.width / 2);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.textBaseline = 'bottom';
      let textY = segmentIndex % 2 === 0 ? height : height - 12;
      ctx.strokeText(text, textX, textY);
      ctx.fillStyle = 'white';
      ctx.fillText(text, textX, textY);
    }

    // draw sample count
    const sampleCount = frequencyOverTime
      .filter(fot => 
        fot.streamStarted === LAST_STREAM_STARTED && 
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
  const isSelected = channel === CHANNEL_SELECTED;
  const isOver = channel === CHANNEL_OVER;
  if(dashed) {
    ctx.setLineDash([5, 5]);
  }
  ctx.beginPath();
  for(let i = 0; i < frequencyOverTime.length; i++) {
    const {pairs, time} = frequencyOverTime[i];
    const x = getTimeX(time, newest);
    if(x === -1) continue;
    if(channel >= pairs.length) continue;
    const amplitude = pairs[channel][highLowIndex];
    const y = getPercentY(amplitude / MAX_AMPLITUDE);
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if(isSelected || isOver) {
    ctx.lineWidth = lineWidth + 5;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
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
    const y = getPercentY(amplitude / MAX_AMPLITUDE);

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

function getPacketSizeSegmentCount() {
  const totalBits = getPacketBitCount();
  const channelCount = getChannels().length;
  return Math.ceil(totalBits / channelCount);
}
function drawChannelData() {
  // Do/did we have a stream?
  if(!LAST_STREAM_STARTED) return;

  const latest = frequencyOverTime[0].time;

  // will any of the stream appear?
  const packetBitCount = getPacketBitCount();

  const packetDuration = getPacketDurationMilliseconds();
  const lastStreamEnded = LAST_STREAM_STARTED + packetDuration;
  const graphDuration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const graphEarliest = latest - graphDuration;
  // ended too long ago?
  if(lastStreamEnded < graphEarliest) return;

  const channels = getChannels();
  const channelCount = channels.length;

  const canvas = document.getElementById('received-channel-graph');
  
  clearCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;

  // Loop through visible segments
  const latestSegmentEnded = Math.min(latest, lastStreamEnded);//yyy
  for(let time = latestSegmentEnded; time > graphEarliest; time -= SEGMENT_DURATION) {
    // too far back?
    if(time < LAST_STREAM_STARTED) break;

    // which segment are we looking at?
    const segmentIndex = Math.floor(((time - LAST_STREAM_STARTED) / SEGMENT_DURATION));

    // when did the segment begin/end
    const segmentStart = LAST_STREAM_STARTED + (segmentIndex * SEGMENT_DURATION);
    const segmentEnd = segmentStart + SEGMENT_DURATION;

    // where is the segments left x coordinate?
    const leftX = ((latest - segmentEnd) / graphDuration) * width;

    // what bits did we receive for the segment?
    const segmentBits = GET_SEGMENT_BITS(LAST_STREAM_STARTED, segmentIndex, true);

    // draw segment data background
    let expectedBitCount = channelCount;
    if(segmentEnd === lastStreamEnded) {
      expectedBitCount = packetBitCount % channelCount;
    } else if(segmentEnd > lastStreamEnded) {
      continue;
    }
    drawSegmentBackground(
      ctx,
      segmentIndex,
      leftX,
      expectedBitCount,
      channelCount,
      width,
      height
    )

    for(let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      // get received bit
      const receivedBit = segmentBits[channelIndex];
      // identify expected bit
      const bitIndex = channelIndex + (segmentIndex * channelCount);
      if(bitIndex >= EXPECTED_ENCODED_BITS.length) break;
      const expectedBit = EXPECTED_ENCODED_BITS[bitIndex];

      drawChannelSegmentBackground(
        ctx,
        leftX,
        segmentIndex,
        channelIndex,
        channelCount,
        height,
        width,
        receivedBit,
        expectedBit
      );

      drawChannelSegmentForeground(
        ctx,
        leftX,
        channelIndex,
        channelCount,
        height,
        width,
        receivedBit,
        expectedBit
      );
    }
  }
  drawChannelByteMarkers(ctx, channelCount, width, height);
  drawSelectedChannel(ctx, channelCount, width, height);
  drawChannelNumbers(ctx, channelCount, width, height)
}
function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
}
function drawSegmentBackground(
  ctx,
  segmentIndex,
  leftX,
  expectedBitCount,
  channelCount,
  width,
  height
) {
  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;

  const hue = 120;
  let luminance = segmentIndex % 2 === 0 ? 30 : 25;
  if(SEGMENT_SELECTED === segmentIndex || SEGMENT_OVER === segmentIndex) luminance += 15;

  ctx.fillStyle = `hsl(${hue}, 100%, ${luminance}%)`;
  const segmentHeight = (expectedBitCount / channelCount) * height
  ctx.fillRect(leftX, 0, segmentWidth, segmentHeight);
}
function drawChannelSegmentForeground(
  ctx,
  endX,
  channelIndex,
  channelCount,
  height,
  width,
  actualBit,
  expectedBit
) {
  const channelHeight = height / channelCount;
  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;
  let fontHeight = Math.min(24, channelHeight, segmentWidth);
  let top = channelHeight * channelIndex;
  ctx.font = `${fontHeight}px Arial`;
  const size = ctx.measureText(actualBit.toString());
  ctx.textBaseline = 'middle';
  const textTop = top + (channelHeight / 2);
  if(actualBit === expectedBit) {
    ctx.strokeStyle = actualBit !== expectedBit ? 'black' : 'black';
    ctx.lineWidth = 2;
    ctx.strokeText(actualBit.toString(), endX + (segmentWidth/2) - (size.width / 2), textTop);
  }
  ctx.fillStyle = actualBit !== expectedBit ? '#2d0c0c' : 'white';
  ctx.fillText(actualBit.toString(), endX + (segmentWidth/2) - (size.width / 2), textTop);

}
function drawChannelSegmentBackground(
  ctx,
  endX,
  segmentIndex,
  channelIndex,
  channelCount,
  height,
  width,
  actualBit,
  expectedBit
) {
  const isSelectedOrOver = 
    (CHANNEL_OVER === channelIndex && SEGMENT_OVER === segmentIndex) || 
    (CHANNEL_SELECTED === channelIndex && SEGMENT_SELECTED === segmentIndex);

  const isCorrect = expectedBit === actualBit;
  if(isCorrect && !isSelectedOrOver) return;

  // color red if received bit does not match expected bit
  const hue = isCorrect ? 120 : 0;
  let luminance = isCorrect ? 50 : 80;
  if(isSelectedOrOver) luminance += 15;

  const channelHeight = height / channelCount;
  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;
  let top = channelHeight * channelIndex;
  ctx.fillStyle = `hsl(${hue}, 100%, ${luminance}%)`;
  ctx.fillRect(endX, top, segmentWidth, channelHeight);

  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.strokeRect(endX, top, segmentWidth, channelHeight);
}
function drawChannelByteMarkers(ctx, channelCount, width, height) {
  const channelHeight = height / channelCount;
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
function drawSelectedChannel(ctx, channelCount, width, height) {
  const channelHeight = height / channelCount;
  ctx.globalCompositionOperation = 'overlay';
  ctx.fillStyle = 'hsla(0, 0%, 100%, 0.25)';
  if(CHANNEL_OVER !== -1) {
    ctx.fillRect(0, CHANNEL_OVER * channelHeight, width, channelHeight);
  }
  if(CHANNEL_SELECTED !== -1 && CHANNEL_SELECTED !== CHANNEL_OVER) {
    ctx.fillRect(0, CHANNEL_SELECTED * channelHeight, width, channelHeight);
  }
  ctx.globalCompositionOperation = 'source-over';
}
function drawChannelNumbers(ctx, channelCount, width, height) {
  const offset = 0;
  const channels = getChannels();
  const channelHeight = height / channelCount;
  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;
  let fontHeight = Math.min(24, channelHeight, segmentWidth);
  ctx.font = `${fontHeight}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 0, 0, .5)';
  const maxDigits = (channelCount - 1).toString().length;
  ctx.fillRect(offset, 0, (fontHeight * maxDigits), channelHeight * channelCount);
  for(let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    let top = channelHeight * channelIndex;
    let text = realChannel(channelIndex).toString();
    const textTop = top + (channelHeight / 2);
    // const hue = channelHue(channelIndex, channelCount);
    const highHue = hzHue(channels[channelIndex][1]);
    ctx.fillStyle = `hsl(${highHue}, 100%, 50%)`;
    ctx.fillText(text, offset + 5, textTop);
  }
}
function realChannel(id) {
  EXCLUDED_CHANNELS.sort(compareNumbers);
  for(let i = 0; i < EXCLUDED_CHANNELS.length; i++) {
    if(EXCLUDED_CHANNELS[i] <= id) id++;
  }
  return id;
}
function drawFrequencyData(forcedDraw) {
  if(PAUSE && forcedDraw !== true) return;
  if(frequencyOverTime.length === 0) {
    if(forcedDraw !== true) {
      requestAnimationFrame(drawFrequencyData);
    }
    return;
  }
  drawChannelData();
  const ctx = receivedGraph.getContext('2d');
  const { width, height } = receivedGraph;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  
  const thresholdY = (1 - (AMPLITUDE_THRESHOLD/MAX_AMPLITUDE)) * height;
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
  const isSelectedOrOver = CHANNEL_OVER !== -1 || CHANNEL_SELECTED !== -1;
  const highLuminance = isSelectedOrOver ? 25 : 50;
  const lowLuminance = isSelectedOrOver ? 12 : 25;
  frequencies.forEach((v, channel) => {
    // const hue = channelHue(channel, frequencies.length);
    const lowHue = hzHue(v[0]);
    const highHue = hzHue(v[1]);
    drawFrequencyLineGraph(ctx, channel, high, `hsl(${highHue}, 100%, ${highLuminance}%)`, 2, false);
    drawFrequencyLineGraph(ctx, channel, low, `hsl(${lowHue}, 100%, ${lowLuminance}%)`, 1, true);
  });
  if(CHANNEL_OVER !== -1) {
    // const hue = channelHue(CHANNEL_OVER, frequencies.length);
    const lowHue = hzHue(frequencies[CHANNEL_OVER][0]);
    const highHue = hzHue(frequencies[CHANNEL_OVER][1]);
    drawFrequencyLineGraph(ctx, CHANNEL_OVER, high, `hsl(${highHue}, 100%, 50%)`, 2, false);
    drawFrequencyLineGraph(ctx, CHANNEL_OVER, low, `hsl(${lowHue}, 100%, 25%)`, 1, true);
  } else if(CHANNEL_SELECTED !== -1) {
    const lowHue = hzHue(frequencies[CHANNEL_SELECTED][0]);
    const highHue = hzHue(frequencies[CHANNEL_SELECTED][1]);
    // const hue = channelHue(CHANNEL_SELECTED, frequencies.length);
    drawFrequencyLineGraph(ctx, CHANNEL_SELECTED, high, `hsl(${highHue}, 100%, 50%)`, 2, false);
    drawFrequencyLineGraph(ctx, CHANNEL_SELECTED, low, `hsl(${lowHue}, 100%, 25%)`, 1, true);
  }

  drawSegmentIndexes(ctx, width, height);

  requestAnimationFrame(drawFrequencyData);
}

function channelHue(channelId, channelCount) {
  return Math.floor((channelId / channelCount) * 360);
}
function hzHue(hz) {
  return Math.floor((hz / 20000) * 360);
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

function handleReceivedChannelGraphMouseover(e) {
  const {channelIndex, segmentIndex} = getChannelAndSegment(e);
  CHANNEL_OVER = channelIndex;
  SEGMENT_OVER = segmentIndex;
  requestAnimationFrame(drawFrequencyData.bind(null, true));
}
function handleReceivedChannelGraphMouseout(e) {
  CHANNEL_OVER = -1;
  SEGMENT_OVER = -1;
  requestAnimationFrame(drawFrequencyData.bind(null, true));
}
function handleReceivedChannelGraphMousemove(e) {
  const {channelIndex, segmentIndex} = getChannelAndSegment(e);
  CHANNEL_OVER = channelIndex;
  SEGMENT_OVER = segmentIndex;
  requestAnimationFrame(drawFrequencyData.bind(null, true));
}
function mouseXy({clientX, clientY, target}) {
  const rect = target.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  }
}
function handleReceivedChannelGraphClick(e) {
  const {channelIndex, segmentIndex} = getChannelAndSegment(e);
  CHANNEL_SELECTED = channelIndex;
  SEGMENT_SELECTED = segmentIndex;
  const channels = getChannels();
  const channelCount = channels.length;

  const selectedSamples = document.getElementById('selected-samples');
  selectedSamples.innerHTML = "";

  function addLowHigh(info, low, high) {
    const div = document.createElement('div');
    div.className = 'low-high-set'
    const infoDiv = document.createElement('div');
    infoDiv.className = 'ingo';
    const lowDiv = document.createElement('div');
    lowDiv.className = 'low';
    const highDiv = document.createElement('div');
    highDiv.className = 'high';
    infoDiv.innerText = info;
    lowDiv.innerText = low;
    highDiv.innerText = high;
    if(low === 255) lowDiv.classList.add('max');
    if(high === 255) highDiv.classList.add('max');
    if(typeof low === 'number' && typeof high === 'number') {
      if(low > high) lowDiv.classList.add('highest');
      else highDiv.classList.add('highest');
    }
    div.appendChild(infoDiv);
    div.appendChild(lowDiv);
    div.appendChild(highDiv);
    selectedSamples.appendChild(div);
  }

  if(CHANNEL_SELECTED !== -1) {
    addLowHigh('', 'Low', 'High');
    addLowHigh('Hz',
      channels[CHANNEL_SELECTED][0].toLocaleString(),
      channels[CHANNEL_SELECTED][1].toLocaleString()
    )
  }
  if(SEGMENT_SELECTED === -1) {
    document.getElementById('selected-segment').innerText = 'N/A';
  } else {
    document.getElementById('selected-segment').innerText = SEGMENT_SELECTED;
    if(CHANNEL_SELECTED !== -1) {

      const bitIndex = CHANNEL_SELECTED + (SEGMENT_SELECTED * channelCount);
      document.getElementById('selected-bit').innerText = bitIndex.toLocaleString();

      const samples = frequencyOverTime
        .filter(fot => fot.segmentIndex === SEGMENT_SELECTED)
        .map(fot => fot.pairs[CHANNEL_SELECTED]);
      samples.forEach(([low, high], i) => {
        if(i === 0) {
          addLowHigh(`Amplitude ${i}`, low, high);
        } else {
          [priorLow, priorHigh] = samples[i - 1];
          addLowHigh(`Amplitude ${i}`, 
            priorLow === low ? '"' : low,
            priorHigh === high ? '"' : high
          );
          
        }
      });

      const expectedBit = EXPECTED_ENCODED_BITS[bitIndex];
      const receivedBit = packetReceivedBits[bitIndex];
      addLowHigh('Expected Bit', expectedBit === 1 ? '' : '0', expectedBit === 1 ? '1' : '')
      addLowHigh('Received Bit', receivedBit === 1 ? '' : '0', receivedBit === 1 ? '1' : '')

      const sums = samples.reduce((sum, [low, high]) => {
        sum[0]+= low;
        sum[1]+= high;
        return sum;
      }, [0, 0]);
      addLowHigh('Total', sums[0], sums[1]);

      const sorts = samples.reduce((sum, [low, high]) => {
        sum.low.push(low);
        sum.high.push(high)
        return sum;
      }, {low: [], high: []});
      sorts.low.sort(compareNumbers);
      sorts.high.sort(compareNumbers);
      const middleIndex = Math.floor(samples.length / 2);

      addLowHigh('Median', sorts.low[middleIndex], sorts.high[middleIndex]);
      
    }
  }

  if(CHANNEL_SELECTED === -1) {
    document.getElementById('selected-channel').innerText = 'N/A';
  } else {
    document.getElementById('selected-channel').innerText = realChannel(CHANNEL_SELECTED);
  }


  requestAnimationFrame(drawFrequencyData.bind(null, true));
}
function compareNumbers(a, b) {
  return a - b;
}
function getChannelAndSegment(e) {
  const {width, height} = e.target.getBoundingClientRect();
  const {x,y} = mouseXy(e);
  if(y < 0 || x < 0 || y > height || x > width) return {
    channelIndex: -1,
    segmentIndex: -1
  };
  // what channel are we over?
  const channels = getChannels();
  const channelCount = channels.length;
  let channelIndex = Math.floor((y / height) * channelCount);
  if(channelIndex === channelCount) channelIndex--;

  // what segment are we over?
  // Do/did we have a stream?
  if(!LAST_STREAM_STARTED) {
    return {
      channelIndex,
      segmentIndex: -1
    };
  }
  const latest = frequencyOverTime[0].time;
  // will any of the stream appear?
  const packetDuration = getPacketDurationMilliseconds();
  const lastStreamEnded = LAST_STREAM_STARTED + packetDuration;
  const graphDuration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const graphEarliest = latest - graphDuration;
    // ended too long ago?
    if(lastStreamEnded < graphEarliest) {
      return {
        channelIndex,
        segmentIndex: -1
      };
    }
  
    const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;
  
    const latestSegmentEnded = Math.min(latest, lastStreamEnded);
  
    for(let time = latestSegmentEnded; time > graphEarliest; time -= SEGMENT_DURATION) {
      // too far back?
      if(time < LAST_STREAM_STARTED) {
        return {
          channelIndex,
          segmentIndex: -1
        }
      };
  
      // which segment are we looking at?
      const segmentIndex = Math.floor(((time - LAST_STREAM_STARTED) / SEGMENT_DURATION));
  
      // when did the segment begin/end
      const segmentStart = LAST_STREAM_STARTED + (segmentIndex * SEGMENT_DURATION);
      const segmentEnd = segmentStart + SEGMENT_DURATION;
  
      // where is the segments left x coordinate?
      const leftX = ((latest - segmentEnd) / graphDuration) * width;
      // where is the segments right x coordinate?
      const rightX = leftX + segmentWidth;

      if(x >= leftX && x <= rightX) {
        return {
          channelIndex,
          segmentIndex
        }
      }
    }

  return {
    channelIndex,
    segmentIndex: -1
  }

}
window.addEventListener('load', handleWindowLoad);