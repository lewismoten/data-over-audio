import * as StreamManager from "./StreamManager";
import * as HammingEncoding from './HammingEncoding';
import * as InterleaverEncoding from './InterleaverEncoding';
import * as PacketUtils from './PacketUtils';
import * as Humanize from './Humanize';
import * as Randomizer from './Randomizer';
import * as AudioSender from './AudioSender';
import * as AudioReceiver from './AudioReceiver';
import * as CRC from './CRC.js';
import CommunicationsPanel from './Panels/CommunicationsPanel';
import MessagePanel from "./Panels/MessagePanel.js";
import CodePanel from "./Panels/CodePanel.js";

var audioContext;
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

// bits as they are sent
let SENT_ORIGINAL_TEXT = '';
let SENT_ORIGINAL_BITS = []; // original bits
let SENT_ENCODED_BITS = []; // bits with error encoding
let SENT_TRANSFER_BITS = []; // bits sent in the transfer

let EXCLUDED_CHANNELS = [];

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
var RECEIVED_STREAM_START_MS = -1;
let SAMPLES = [];

var bitStart = [];
var PAUSE = false;
var PAUSE_AFTER_END = true;
var PACKET_SIZE_BITS = 5; // 32 bytes, 256 bits

const communicationsPanel = new CommunicationsPanel();
const messagePanel = new MessagePanel();
const bitsSentPanel = new CodePanel('Bits Sent');
const bitsReceivedPanel = new CodePanel('Bits Received');

function handleWindowLoad() {
  const panelContainer = document.getElementById('panel-container');
  panelContainer.prepend(bitsReceivedPanel.getDomElement());
  panelContainer.prepend(bitsSentPanel.getDomElement());
  panelContainer.prepend(messagePanel.getDomElement());
  panelContainer.prepend(communicationsPanel.getDomElement());

  // Initialize Values
  communicationsPanel.setListening(false);
  communicationsPanel.setSendSpeakers(false);
  communicationsPanel.setSendAnalyzer(true);

  messagePanel.setMessage(Randomizer.text(5));
  messagePanel.setProgress(0);
  messagePanel.setReceived('');
  messagePanel.setSendButtonText('Send');

  bitsSentPanel.setCode('');
  bitsReceivedPanel.setCode('');

  // Communications Events
  communicationsPanel.addEventListener('listeningChange', handleChangeListening);
  communicationsPanel.addEventListener('sendSpeakersChange', handleChangeSendSpeakers);
  communicationsPanel.addEventListener('sendAnalyzerChange', handleChangeSendAnalyzer);

  messagePanel.addEventListener('messageChange', configurationChanged);
  messagePanel.addEventListener('send', handleSendButtonClick);

  // Setup audio sender
  AudioSender.addEventListener('begin', () => messagePanel.setSendButtonText('Stop'));
  AudioSender.addEventListener('send', handleAudioSenderSend);
  AudioSender.addEventListener('end', () => messagePanel.setSendButtonText('Send'));
  // Setup audio receiver
  AudioReceiver.addEventListener('begin', handleAudioReceiverStart);
  AudioReceiver.addEventListener('receive', handleAudioReceiverReceive);
  AudioReceiver.addEventListener('end', handleAudioReceiverEnd);
  // Setup stream manager
  StreamManager.addEventListener('change', handleStreamManagerChange);

  // grab dom elements
  receivedDataTextarea = document.getElementById('received-data');
  receivedGraph = document.getElementById('received-graph');
  sentDataTextArea = document.getElementById('sent-data');
  const receivedChannelGraph = document.getElementById('received-channel-graph');
  receivedChannelGraph.addEventListener('mouseover', handleReceivedChannelGraphMouseover);
  receivedChannelGraph.addEventListener('mouseout', handleReceivedChannelGraphMouseout);
  receivedChannelGraph.addEventListener('mousemove', handleReceivedChannelGraphMousemove);
  receivedChannelGraph.addEventListener('click', handleReceivedChannelGraphClick);
  document.getElementById('wave-form').value = WAVE_FORM;
  document.getElementById('wave-form').addEventListener('change', (event) => {
    WAVE_FORM = event.target.value;
    configurationChanged();
  });
  document.getElementById('packet-size-power').value = PACKET_SIZE_BITS;
  document.getElementById('packet-size').innerText = Humanize.byteSize(2 ** PACKET_SIZE_BITS);
  document.getElementById('packet-size-power').addEventListener('input', event => {
    PACKET_SIZE_BITS = parseInt(event.target.value);
    document.getElementById('packet-size').innerText = Humanize.byteSize(2 ** PACKET_SIZE_BITS);
    configurationChanged();
  });
  document.getElementById('pause-after-end').checked = PAUSE_AFTER_END;
  document.getElementById('error-correction-hamming').checked = HAMMING_ERROR_CORRECTION;
  document.getElementById('error-correction-hamming').addEventListener('change', event => {
    HAMMING_ERROR_CORRECTION = event.target.checked;
    configurationChanged();
  })
  document.getElementById('periodic-interleaving').checked = PERIODIC_INTERLEAVING;
  document.getElementById('periodic-interleaving').addEventListener('change', event => {
    PERIODIC_INTERLEAVING = event.target.checked;
    configurationChanged();
    StreamManager.setSegmentEncoding(
      PERIODIC_INTERLEAVING ? InterleaverEncoding : undefined
    );
  });
  document.getElementById('pause-after-end').addEventListener('change', event => {
    PAUSE_AFTER_END = event.target.checked;
    if(!PAUSE_AFTER_END) resumeGraph();
  })
  document.getElementById('frequency-resolution-multiplier').value = FREQUENCY_RESOLUTION_MULTIPLIER;
  document.getElementById('frequency-resolution-multiplier').addEventListener('input', event => {
    FREQUENCY_RESOLUTION_MULTIPLIER = parseInt(event.target.value);
    configurationChanged();
  })
  document.getElementById('channel-frequency-resolution-padding').value = CHANNEL_FREQUENCY_RESOLUTION_PADDING;
  document.getElementById('channel-frequency-resolution-padding').addEventListener('input', event => {
    CHANNEL_FREQUENCY_RESOLUTION_PADDING = parseInt(event.target.value);
    configurationChanged();
  })
  document.getElementById('bit-duration-text').addEventListener('input', (event) => {
    SEGMENT_DURATION = parseInt(event.target.value);
    configurationChanged();
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
    configurationChanged();
  });
  document.getElementById('maximum-frequency').addEventListener('input', (event) => {
    MAXIMUM_FREQUENCY = parseInt(event.target.value);
    configurationChanged();
  });
  document.getElementById('minimum-frequency').addEventListener('input', (event) => {
    MINIMUM_FREQUENCY = parseInt(event.target.value);
    configurationChanged();
  });
  document.getElementById('last-bit-percent').addEventListener('input', (event) => {
    LAST_SEGMENT_PERCENT = parseInt(event.target.value) / 100;
  });
  document.getElementById('fft-size-power-text').addEventListener('input', (event) => {
    FFT_SIZE_POWER = parseInt(event.target.value);
    if(analyser) analyser.fftSize = 2 ** FFT_SIZE_POWER;
    configurationChanged();
    resetGraphData();
  });
  document.getElementById('smoothing-time-constant-text').addEventListener('input', event => {
    SMOOTHING_TIME_CONSTANT = parseFloat(event.target.value);
    if(analyser) analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  });
  document.getElementById('audio-context-sample-rate').innerText = getAudioContext().sampleRate.toLocaleString();
  // wire up events
  configurationChanged();
}

function updateFrequencyResolution() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const frequencyCount = (sampleRate/2) / frequencyResolution;
  document.getElementById('frequency-resolution').innerText = frequencyResolution.toFixed(2);
  document.getElementById('frequency-count').innerText = frequencyCount.toFixed(2);
}

function showChannelList() {
  const allChannels = getChannels(true);
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
      configurationChanged();
    })
    label.append(checkbox);
    const text = document.createTextNode(`Low: ${low} Hz High: ${high} Hz`);
    label.append(text);
    channelList.appendChild(li);
  })
  drawChannels();
}

function handleAudioSenderSend({bits}) {
  SENT_TRANSFER_BITS.push(...bits);
  showSentBits();
}
function configurationChanged() {
  updatePacketUtils();
  updateStreamManager();
  updateAudioSender();
  updateAudioReceiver();
  showChannelList();
  updateFrequencyResolution();
  updatePacketStats();
}
function updateAudioSender() {
  AudioSender.changeConfiguration({
    channels: getChannels(),
    destination: SEND_VIA_SPEAKER ? audioContext.destination : getAnalyser(),
    waveForm: WAVE_FORM
  });
}
const logFn = text => (...args) => {
  // console.log(text, ...args);
}
const handleAudioReceiverStart = ({signalStart}) => {
  StreamManager.reset();
  RECEIVED_STREAM_START_MS = signalStart;
}
const handleAudioReceiverReceive = ({signalStart, signalIndex, indexStart, bits}) => {
  const packetIndex = PacketUtils.getPacketIndex(signalStart, indexStart);
  const segmentIndex = PacketUtils.getPacketSegmentIndex(signalStart, indexStart);
  // Getting all 1's for only the first 5 segments?
  // console.log(signalIndex, packetIndex, segmentIndex, bits.join(''));
  StreamManager.addBits(packetIndex, segmentIndex, bits);
}
const handleAudioReceiverEnd = () => {
  if(PAUSE_AFTER_END) {
    stopGraph();
    AudioSender.stop();
  }
}
function updateAudioReceiver() {
  AudioReceiver.changeConfiguration({
    fskSets: getChannels(),
    segmentDurationMs: SEGMENT_DURATION,
    amplitudeThreshold: AMPLITUDE_THRESHOLD,
    analyser: getAnalyser(),
    signalIntervalMs: SEGMENT_DURATION,
    sampleRate: getAudioContext().sampleRate
  });
}
function updateStreamManager() {
  StreamManager.setPacketEncoding(
    HAMMING_ERROR_CORRECTION ? HammingEncoding : undefined
  );
  StreamManager.changeConfiguration({
    bitsPerPacket: PacketUtils.getPacketMaxBitCount(),
    segmentsPerPacket: PacketUtils.getPacketSegmentCount(),
    bitsPerSegment: getChannels().length,
    streamHeaders: {
      'transfer byte count': {
        index: 0,
        length: MAXIMUM_PACKETIZATION_SIZE_BITS
      },
      'transfer byte count crc': {
        index: MAXIMUM_PACKETIZATION_SIZE_BITS,
        length: CRC_BIT_COUNT
      },
    }
  });
}
function updatePacketUtils() {
  PacketUtils.setEncoding(
    HAMMING_ERROR_CORRECTION ? HammingEncoding : undefined
  );
  const bitsPerSegment = getChannels().length;
  PacketUtils.changeConfiguration({
    segmentDurationMilliseconds: SEGMENT_DURATION,
    packetSizeBitCount: PACKET_SIZE_BITS,
    dataSizeBitCount: MAXIMUM_PACKETIZATION_SIZE_BITS,
    dataSizeCrcBitCount: CRC_BIT_COUNT,
    bitsPerSegment,
    packetEncoding: HAMMING_ERROR_CORRECTION,
    packetEncodingBitCount: ERROR_CORRECTION_BLOCK_SIZE,
    packetDecodingBitCount: ERROR_CORRECTION_DATA_SIZE,
  });
}
function updatePacketStats() {
  const text = messagePanel.getMessage();
  const bits = textToBits(text);
  const byteCount = text.length;
  const bitCount = PacketUtils.getPacketizationBitCountFromBitCount(bits.length);;

  // # Packetization
  document.getElementById('packetization-max-bytes').innerText = Humanize.byteSize(PacketUtils.getDataMaxByteCount());
  document.getElementById('packetization-max-packets').innerText = PacketUtils.getMaxPackets().toLocaleString();
  document.getElementById('packetization-max-duration').innerText = Humanize.durationMilliseconds(PacketUtils.getMaxDurationMilliseconds());
  // ## Packetization Speed
  document.getElementById('packetization-speed-bits-per-second').innerText = Humanize.bitsPerSecond(PacketUtils.getBaud());
  document.getElementById('packetization-speed-effective-bits-per-second').innerText = Humanize.bitsPerSecond(PacketUtils.getEffectiveBaud());

  // Data
  document.getElementById('original-byte-count').innerText = textToBytes(text).length.toLocaleString();
  document.getElementById('packetization-byte-count').innerText = PacketUtils.getPacketizationByteCountFromBitCount(bits.length).toLocaleString();
  document.getElementById('packetization-bit-count').innerText = bitCount.toLocaleString();
  document.getElementById('packet-count').innerText = PacketUtils.getPacketCount(bitCount).toLocaleString();
  // # Packet Config
  document.getElementById('bits-per-packet').innerText = PacketUtils.getPacketMaxBitCount().toLocaleString();
  document.getElementById('bytes-per-packet').innerText = Humanize.byteSize(PacketUtils.getPacketMaxByteCount());
  // ## Packet Encoding
  document.getElementById('packet-encoding').innerText = PacketUtils.isPacketEncoded() ? 'Yes' : 'No';
  document.getElementById('packet-encoding-block-count').innerText = PacketUtils.getPacketEncodingBlockCount().toLocaleString();
  document.getElementById('packet-encoding-bits-per-block').innerText = PacketUtils.packetEncodingBlockSize().toLocaleString();
  document.getElementById('packet-encoding-bit-count').innerText = PacketUtils.getEncodedPacketDataBitCount().toLocaleString();

  document.getElementById('bits-per-segment').innerText = PacketUtils.getBitsPerSegment();

  // Data
  document.getElementById('packet-data-bit-count').innerText = PacketUtils.getPacketDataBitCount().toLocaleString();
  document.getElementById('packet-unused-bit-count').innerText = PacketUtils.getPacketUnusedBitCount().toLocaleString();
  document.getElementById('last-packet-unused-bit-count').innerText = PacketUtils.fromByteCountGetPacketLastUnusedBitCount(byteCount).toLocaleString();
  document.getElementById('last-segment-unused-bit-count').innerText = PacketUtils.getPacketLastSegmentUnusedBitCount().toLocaleString()
  document.getElementById('packet-transfer-duration').innerText = Humanize.durationMilliseconds(PacketUtils.getPacketDurationMilliseconds());
  document.getElementById('segment-transfer-duration').innerText = Humanize.durationMilliseconds(PacketUtils.getSegmentDurationMilliseconds());
  document.getElementById('data-transfer-duration').innerText = Humanize.durationMilliseconds(PacketUtils.getDataTransferDurationMilliseconds(bitCount));
  document.getElementById('segments-per-packet').innerText = PacketUtils.getPacketSegmentCount().toLocaleString();
  document.getElementById('total-segments').innerText = getTotalSegmentCount(bitCount).toLocaleString();
}


function drawChannels() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = 2 ** FFT_SIZE_POWER;
  const frequencyResolution = sampleRate / fftSize;
  const channels = getChannels();
  const channelCount = channels.length;
  const canvas = document.getElementById('channel-frequency-graph');
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;
  const channelHeight = height / channelCount;
  const bandHeight = channelHeight / 2;

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
  SENT_ORIGINAL_BITS = bits.slice();  

  // packetization headers
  // data length
  const dataLengthBits = numberToBits(bytes.length, MAXIMUM_PACKETIZATION_SIZE_BITS);
  // crc on data length
  const dataLengthCrcBits = numberToBits(CRC.check(bitsToBytes(dataLengthBits), CRC_BIT_COUNT), CRC_BIT_COUNT);

  // prefix with headers
  bits.unshift(...dataLengthBits, ...dataLengthCrcBits);

  const bitCount = bits.length;

  SENT_TRANSFER_BITS.length = 0;
  SENT_ENCODED_BITS.length = 0;

  AudioSender.setAudioContext(getAudioContext());

  const startSeconds = AudioSender.now() + 0.1;
  const packetBitCount = PacketUtils.getPacketMaxBitCount();
  const packetDurationSeconds = PacketUtils.getPacketDurationSeconds();
  const packetCount = PacketUtils.getPacketCount(bitCount);
  const totalDurationSeconds = PacketUtils.getDataTransferDurationSeconds(bitCount);

  const channelCount = getChannels().length;
  const errorCorrectionBits = [];

  AudioSender.beginAt(startSeconds);
  // send all packets
  for(let i = 0; i < packetCount; i++) {
    let packet = PacketUtils.getPacketBits(bits, i);
    errorCorrectionBits.push(...packet);
    SENT_ENCODED_BITS.push(...packet);
    if(packet.length > packetBitCount) {
      console.error('Too many bits in the packet. tried to send %s, limited to %s', packet.length, packetBitCount);
      AudioSender.stop();
      return;
    }
    packet = padArray(packet, packetBitCount, 0);
    sendPacket(packet, startSeconds + (i * packetDurationSeconds));
  }
  AudioSender.stopAt(startSeconds + totalDurationSeconds);

  showSentBits();

  // start the graph moving again
  resumeGraph();
}
function showSentBits() {
  const channelCount = getChannels().length;

  // original bits
  document.getElementById('sent-data').innerHTML =
    SENT_ORIGINAL_BITS.reduce(bitReducer(
      PacketUtils.getPacketMaxBitCount(),
      HAMMING_ERROR_CORRECTION ? ERROR_CORRECTION_DATA_SIZE : 8
    ), '');
  
  // error correcting bits
  if(HAMMING_ERROR_CORRECTION) {
    document.getElementById('error-correcting-data').innerHTML =
    SENT_ENCODED_BITS.reduce(bitReducer(
      PacketUtils.getPacketDataBitCount(),
      ERROR_CORRECTION_BLOCK_SIZE
    ), '');
  } else {
    document.getElementById('error-correcting-data').innerHTML = '';
  }
  bitsSentPanel.setCode(
    SENT_TRANSFER_BITS.reduce(bitReducer(
    PacketUtils.getPacketMaxBitCount() + PacketUtils.getPacketLastSegmentUnusedBitCount(),
    channelCount,
    (packetIndex, blockIndex) => `${blockIndex === 0 ? '' : '<br>'}Segment ${blockIndex}: `
  ), ''));  
}
function sendPacket(bits, packetStartSeconds) {
  const channels = getChannels();
  const channelCount = channels.length;
  let bitCount = bits.length;
  const segmentDurationSeconds = PacketUtils.getSegmentDurationSeconds();
  for(let i = 0; i < bitCount; i += channelCount) {
    let segmentBits = bits.slice(i, i + channelCount);
    if(PERIODIC_INTERLEAVING) {
      segmentBits = InterleaverEncoding.encode(segmentBits);
    }
    const segmentIndex = Math.floor(i / channelCount);
    var offsetSeconds = segmentIndex * segmentDurationSeconds;
    AudioSender.send(segmentBits, packetStartSeconds + offsetSeconds);
  }
}
function getNextPacketStartMilliseconds(priorPacketStartMilliseconds) {
  return priorPacketStartMilliseconds + PacketUtils.getPacketDurationMilliseconds();
}
function getPacketIndexEndMilliseconds(transferStartedMilliseconds, packetIndex) {
  const start = transferStartedMilliseconds + (PacketUtils.getPacketDurationMilliseconds() * packetIndex)
  return getPacketEndMilliseconds(start);
}
function getPacketEndMilliseconds(packetStartedMilliseconds) {
  return getNextPacketStartMilliseconds(packetStartedMilliseconds) - 0.1;
}
function getTotalSegmentCount(bitCount) {
  return PacketUtils.getPacketCount(bitCount) * PacketUtils.getPacketSegmentCount();
}
function padArray(values, length, value) {
  values = values.slice();//copy
  while(values.length < length) values.push(value);
  return values;
}

function stopGraph() {
  PAUSE = true;
  AudioReceiver.stop();
}

function resumeGraph() {
  if(communicationsPanel.isListeningChecked()) {
    if(PAUSE) {
      PAUSE = false;
      AudioReceiver.start();
      resetGraphData();
      requestAnimationFrame(drawFrequencyData);  
    } else {
      PAUSE = false;
    }
  } else {
    PAUSE = false;
  }
}

function getTransferredCorrectedBits() {
  const bits = [];
  const packetCount = StreamManager.getPacketReceivedCount();
  for(let packetIndex = 0; packetIndex < packetCount; packetIndex++) {
    let packetBits = StreamManager.getPacketBits(packetIndex);
    if(HAMMING_ERROR_CORRECTION) {
      bits.push(...HammingEncoding.decode(packetBits));
    } else {
      bits.push(...packetBits);
    }
  }
  return bits;
}

function handleStreamManagerChange() {
  const channelCount = getChannels().length;
  let allRawBits = StreamManager.getStreamBits();
  let allEncodedBits = StreamManager.getAllPacketBits();
  let allDecodedBits = getTransferredCorrectedBits();

  // get packet data before removing decoded bits
  const transmissionByteCount = parseTransmissionByteCount(allDecodedBits);
  const transmissionByteCountCrc = parseTransmissionByteCountCrc(allDecodedBits)
  const transmissionByteCountActualCrc = CRC.check(
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

  let percentReceived = StreamManager.sumTotalBits() / totalBitsTransferring;
  messagePanel.setProgress(percentReceived);

  bitsReceivedPanel.setCode(allRawBits
    .reduce(
      bitExpectorReducer(
        SENT_TRANSFER_BITS,
        PacketUtils.getPacketMaxBitCount() + PacketUtils.getPacketLastSegmentUnusedBitCount(),
        channelCount,
        (packetIndex, blockIndex) => `${blockIndex === 0 ? '' : '<br>'}Segment ${blockIndex}: `
      ),
    ''));
    if(HAMMING_ERROR_CORRECTION) {
      document.getElementById('received-encoded-bits').innerHTML = allEncodedBits
      .reduce(
        bitExpectorReducer(
          SENT_ENCODED_BITS,
          PacketUtils.getPacketDataBitCount(),
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
        PacketUtils.getPacketDataBitCount(),
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
  // ArrayBuffer / ArrayBufferView
  const receivedText = bitsToText(allDecodedBits);
  messagePanel.setReceived(
    receivedText.split('').reduce(textExpectorReducer(SENT_ORIGINAL_TEXT), '')
  );
}
function asHex(length) {
  return (number) => number.toString(16).padStart(length, '0').toUpperCase();
}
function parseDataTransferDurationMilliseconds() {
  const decodedBits = getTransferredCorrectedBits();
  const byteCount = parseTransmissionByteCount(decodedBits);
  return PacketUtils.getDataTransferDurationMillisecondsFromByteCount(byteCount);
}
function parseTotalBitsTransferring() {
  const dataByteCount = parseTransmissionByteCount();
  const bitCount = PacketUtils.getPacketizationBitCountFromByteCount(dataByteCount);
  const segments = getTotalSegmentCount(bitCount);
  return segments * getChannels().length;
}
function parseTransmissionByteCountCrc() {
  let decodedBits = getTransferredCorrectedBits();
  const offset = MAXIMUM_PACKETIZATION_SIZE_BITS;
  decodedBits = decodedBits.slice(offset, offset + CRC_BIT_COUNT);
  return bitsToInt(decodedBits, CRC_BIT_COUNT);
}
function parseTransmissionByteCount() {
  let decodedBits = getTransferredCorrectedBits();
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
  const dataByteCount = StreamManager.getTransferByteCount();

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
const textExpectorReducer = expected => {

  const expectedChars = expected.split('');
  
  return (all, char, i) => {
    const html = htmlEncode(char);
    if(i >= expected.length) {
      all += '<span class="bit-unexpected">' + html + '</span>';
    } else if(char !== expectedChars[i]) {
      all += '<span class="bit-wrong">' + html + '</span>';
    } else {
      all += html;
    }
    return all;
  };
}
function htmlEncode(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}
function resetGraphData() {
  SAMPLES.length = 0;
  bitStart.length = 0;
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
function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}
function textToBytes(text) {
  return new TextEncoder().encode(text);
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
  const bytes = new Uint8Array(bitsToBytes(bits));
  return bytesToText(bytes.buffer);
}
function handleSendButtonClick() {
  if(messagePanel.getSendButtonText() === 'Stop') {
    AudioSender.stop();
  } else {
    AudioReceiver.reset();
    StreamManager.reset();
    const text = messagePanel.getMessage();
    sendBytes(textToBytes(text));
  }
}
function getAnalyser() {
  if(analyser) return analyser;
  analyser = audioContext.createAnalyser();
  analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  analyser.fftSize = 2 ** FFT_SIZE_POWER;
  return analyser;
}
function handleChangeSendAnalyzer({checked}) {
  SEND_VIA_SPEAKER = !checked;
  configurationChanged();
}
function handleChangeSendSpeakers({checked}) {
  SEND_VIA_SPEAKER = checked;
  configurationChanged();
}
function handleChangeListening({checked}) {
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
  if(checked) {
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
  if(!RECEIVED_STREAM_START_MS) return;
  const latest = SAMPLES[0].time;

  // will any of the stream appear?
  const segmentCount = PacketUtils.getPacketSegmentCount();
  const transferDuration = parseDataTransferDurationMilliseconds();
  const lastStreamEnded = RECEIVED_STREAM_START_MS + transferDuration;

  const graphDuration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const graphEarliest = latest - graphDuration;
  // ended too long ago?
  if(lastStreamEnded < graphEarliest) return;

  const segmentWidth = width / MAX_BITS_DISPLAYED_ON_GRAPH;

  const latestSegmentEnded = Math.min(latest, lastStreamEnded);

  for(let time = latestSegmentEnded; time > graphEarliest; time -= SEGMENT_DURATION) {
    // too far back?
    if(time < RECEIVED_STREAM_START_MS) break;

    const transferSegmentIndex = PacketUtils.getTranserSegmentIndex(RECEIVED_STREAM_START_MS, time);
    const packetIndex = PacketUtils.getPacketIndex(RECEIVED_STREAM_START_MS, time);
    const packetSegmentIndex = PacketUtils.getPacketSegmentIndex(RECEIVED_STREAM_START_MS, time);
    const packetStarted = PacketUtils.getPacketStartMilliseconds(RECEIVED_STREAM_START_MS, packetIndex);
    const segmentStart = PacketUtils.getPacketSegmentStartMilliseconds(RECEIVED_STREAM_START_MS, packetIndex, packetSegmentIndex);
    const segmentEnd = PacketUtils.getPacketSegmentEndMilliseconds(RECEIVED_STREAM_START_MS, packetIndex, packetSegmentIndex);

    // where is the segments left x coordinate?
    const leftX = ((latest - segmentEnd) / graphDuration) * width;

    // Draw segment index
    ctx.fontSize = '24px';
    if(segmentStart < lastStreamEnded) {
      let text = packetSegmentIndex.toString();
      let size = ctx.measureText(text);
      let textX = leftX + (segmentWidth / 2) - (size.width / 2);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.textBaseline = 'bottom';
      let textY = transferSegmentIndex % 2 === 0 ? height : height - 12;
      ctx.strokeText(text, textX, textY);
      ctx.fillStyle = 'white';
      ctx.fillText(text, textX, textY);
    }

    // draw sample count
    const sampleCount = SAMPLES
      .filter(fot => 
        fot.streamStarted === packetStarted && 
        fot.segmentIndex === packetSegmentIndex &&
        fot.packetIndex === packetIndex
      )
      .length;
    // if(sampleCount === 0) {
    //   console.log({
    //     packetStarted,
    //     packetSegmentIndex,
    //     packetIndex,
    //     startTimes: SAMPLES.reduce((all, fot) => all.includes(fot.streamStarted) ? all : [...all, fot.streamStarted], [])
    //   })
    // }

    let text = sampleCount.toString();
    let size = ctx.measureText(text);
    let textX = leftX + (segmentWidth / 2) - (size.width / 2);
    let textY = transferSegmentIndex % 2 === 0 ? 5 : 17;
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
  const newest = SAMPLES[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;

  const streamTimes = SAMPLES.filter(({
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
  const newest = SAMPLES[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  ctx.strokeStyle = color;
  for(let i = 0; i < bitStart.length; i++) {
    if(!bitStart[i]) continue;
    const {time} = SAMPLES[i];
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
  const newest = SAMPLES[0].time;
  const duration = SEGMENT_DURATION * MAX_BITS_DISPLAYED_ON_GRAPH;
  const isSelected = channel === CHANNEL_SELECTED;
  const isOver = channel === CHANNEL_OVER;
  if(dashed) {
    ctx.setLineDash([5, 5]);
  }
  ctx.beginPath();
  for(let i = 0; i < SAMPLES.length; i++) {
    const {pairs, time} = SAMPLES[i];
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
  const newest = SAMPLES[0].time;
  const radius = 2;
  const border = 0.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = border;
  const fullCircle = 2 * Math.PI;
  for(let i = 0; i < SAMPLES.length; i++) {
    const {pairs, time} = SAMPLES[i];
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
  const totalBits = PacketUtils.getPacketMaxBitCount();
  const channelCount = getChannels().length;
  return Math.ceil(totalBits / channelCount);
}
function drawChannelData() {
  // Do/did we have a stream?
  if(!RECEIVED_STREAM_START_MS) return;

  const latest = SAMPLES[0].time;

  // will any of the stream appear?
  const packetBitCount = PacketUtils.getPacketMaxBitCount();

  const packetDuration = PacketUtils.getPacketDurationMilliseconds();
  const lastStreamEnded = RECEIVED_STREAM_START_MS + packetDuration;
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
  const latestSegmentEnded = Math.min(latest, lastStreamEnded);
  for(let time = latestSegmentEnded; time > graphEarliest; time -= SEGMENT_DURATION) {
    // too far back?
    if(time < RECEIVED_STREAM_START_MS) break;

    // which segment are we looking at?
    const segmentIndex = PacketUtils.getPacketSegmentIndex(RECEIVED_STREAM_START_MS, time);
    // when did the segment begin
    const packetIndex = PacketUtils.getPacketIndex(RECEIVED_STREAM_START_MS, time);
    const segmentEnd = PacketUtils.getPacketSegmentEndMilliseconds(RECEIVED_STREAM_START_MS, packetIndex, segmentIndex);

    // where is the segments left x coordinate?
    const leftX = ((latest - segmentEnd) / graphDuration) * width;

    // what bits did we receive for the segment?
    let segmentBits = StreamManager.getPacketSegmentBits(packetIndex, segmentIndex);
    if(!segmentBits){
      // unprocessed bits - let's grab them from the samples
      segmentBits = GET_SEGMENT_BITS(RECEIVED_STREAM_START_MS, segmentIndex, packetIndex, true);
    }
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
      if(bitIndex >= SENT_TRANSFER_BITS.length) break;
      const expectedBit = SENT_TRANSFER_BITS[bitIndex];

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
  if(SAMPLES.length === 0) {
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

      const samples = SAMPLES
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

      const expectedBit = SENT_TRANSFER_BITS[bitIndex];
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
  if(!RECEIVED_STREAM_START_MS) {
    return {
      channelIndex,
      segmentIndex: -1
    };
  }
  const latest = SAMPLES[0]?.time ?? performance.now();
  // will any of the stream appear?
  const packetDuration = PacketUtils.getPacketDurationMilliseconds();
  const lastStreamEnded = RECEIVED_STREAM_START_MS + packetDuration;
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
      if(time < RECEIVED_STREAM_START_MS) {
        return {
          channelIndex,
          segmentIndex: -1
        }
      };
  
      // which segment are we looking at?
      const segmentIndex = Math.floor(((time - RECEIVED_STREAM_START_MS) / SEGMENT_DURATION));
  
      // when did the segment begin/end
      const segmentStart = RECEIVED_STREAM_START_MS + (segmentIndex * SEGMENT_DURATION);
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