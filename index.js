import * as StreamManager from "./StreamManager";
import * as HammingEncoding from './HammingEncoding';
import * as InterleaverEncoding from './InterleaverEncoding';
import * as PacketUtils from './PacketUtils';
import * as Humanize from './Humanize';
import * as Randomizer from './Randomizer';
import * as AudioSender from './AudioSender';
import * as AudioReceiver from './AudioReceiver';
import * as CRC from './CRC';
import CommunicationsPanel from './Panels/CommunicationsPanel';
import MessagePanel from "./Panels/MessagePanel";
import CodePanel from "./Panels/CodePanel";
import FrequencyPanel from "./Panels/FrequencyPanel";
import SignalPanel from "./Panels/SignalPanel";
import PacketizationPanel from "./Panels/PacketizationPanel";
import AvailableFskPairsPanel from "./Panels/AvailableFskPairsPanel";
import FrequencyGraphPanel from "./Panels/FrequencyGraphPanel";
import GraphConfigurationPanel from './Panels/GraphConfigurationPanel'
var audioContext;
var microphoneStream;
var microphoneNode;
var analyser;
var sentDataTextArea;
const MAXIMUM_PACKETIZATION_SIZE_BITS = 16;
const CRC_BIT_COUNT = 8;

// bits as they are sent
let SENT_ORIGINAL_TEXT = '';
let SENT_ORIGINAL_BITS = []; // original bits
let SENT_ENCODED_BITS = []; // bits with error encoding
let SENT_TRANSFER_BITS = []; // bits sent in the transfer

let EXCLUDED_CHANNELS = [];

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

const communicationsPanel = new CommunicationsPanel();
const messagePanel = new MessagePanel();
const bitsSentPanel = new CodePanel('Bits Sent');
const bitsReceivedPanel = new CodePanel('Bits Received');
const frequencyPanel = new FrequencyPanel();
const signalPanel = new SignalPanel();
const packetizationPanel = new PacketizationPanel();
const availableFskPairsPanel = new AvailableFskPairsPanel();
const frequencyGraphPanel = new FrequencyGraphPanel();
const graphConfigurationPanel = new GraphConfigurationPanel();

function handleWindowLoad() {
  const panelContainer = document.getElementById('panel-container');
  panelContainer.prepend(graphConfigurationPanel.getDomElement());
  panelContainer.prepend(frequencyGraphPanel.getDomElement());
  panelContainer.prepend(availableFskPairsPanel.getDomElement());
  panelContainer.prepend(packetizationPanel.getDomElement());
  panelContainer.prepend(signalPanel.getDomElement());
  panelContainer.prepend(frequencyPanel.getDomElement());
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

  frequencyPanel.setMinimumFrequency(9000);
  frequencyPanel.setMaximumFrequency(15000);
  frequencyPanel.setFftSize(2 ** 9);
  frequencyPanel.setFskPadding(1);
  frequencyPanel.setMultiFskPadding(1);

  signalPanel.setWaveform('triangle');
  signalPanel.setSegmentDurationMilliseconds(30);
  signalPanel.setAmplitudeThreshold(0.78);
  signalPanel.setSmoothingTimeConstant(0);
  signalPanel.setTimeoutMilliseconds(60);

  packetizationPanel.setSizePower(5);
  packetizationPanel.setErrorCorrection(true);
  packetizationPanel.setInterleaving(true);

  availableFskPairsPanel.setFskPairs(frequencyPanel.getFskPairs());

  graphConfigurationPanel.setDurationMilliseconds(signalPanel.getSegmentDurationMilliseconds() * 20);
  graphConfigurationPanel.setPauseAfterEnd(true);

  frequencyGraphPanel.setFskPairs(availableFskPairsPanel.getSelectedFskPairs());
  frequencyGraphPanel.setAmplitudeThreshold(signalPanel.getAmplitudeThreshold());
  frequencyGraphPanel.setDurationMilliseconds(graphConfigurationPanel.getDurationMilliseconds());

  AudioReceiver.setTimeoutMilliseconds(signalPanel.getTimeoutMilliseconds());


  // Events
  communicationsPanel.addEventListener('listeningChange', handleChangeListening);
  communicationsPanel.addEventListener('sendSpeakersChange', handleChangeSendSpeakers);
  communicationsPanel.addEventListener('sendAnalyzerChange', handleChangeSendAnalyzer);

  messagePanel.addEventListener('messageChange', configurationChanged);
  messagePanel.addEventListener('send', handleSendButtonClick);

  frequencyPanel.addEventListener('minimumFrequencyChange', configurationChanged);
  frequencyPanel.addEventListener('maximumFrequencyChange', configurationChanged);
  frequencyPanel.addEventListener('fftSizeChange', ({value}) => {
    configurationChanged();
    resetGraphData();
  });
  frequencyPanel.addEventListener('fskPaddingChange', configurationChanged);
  frequencyPanel.addEventListener('multiFskPaddingChange', configurationChanged);
  frequencyPanel.addEventListener('fskPairsChange', ({value}) => {
    availableFskPairsPanel.setFskPairs(value);
  });

  signalPanel.addEventListener('waveformChange', updateAudioSender);
  signalPanel.addEventListener('segmentDurationChange', () => { 
    frequencyGraphPanel.setSamplingPeriod(signalPanel.getSegmentDurationMilliseconds());
    configurationChanged();
  });
  signalPanel.addEventListener('amplitudeThresholdChange', ({value}) => {
    frequencyGraphPanel.setAmplitudeThreshold(value);
    configurationChanged();
  });
  signalPanel.addEventListener('smoothingConstantChange', configurationChanged);
  signalPanel.addEventListener('timeoutChange', () => {
    AudioReceiver.setTimeoutMilliseconds(signalPanel.getTimeoutMilliseconds());
  })

  packetizationPanel.addEventListener('sizePowerChange', configurationChanged);
  packetizationPanel.addEventListener('interleavingChange', () => {
    StreamManager.setSegmentEncoding(
      packetizationPanel.getInterleaving() ? InterleaverEncoding : undefined
    );
    configurationChanged();
  });
  packetizationPanel.addEventListener('errorCorrectionChange', configurationChanged);

  availableFskPairsPanel.addEventListener('change', (event) => {
    frequencyGraphPanel.setFskPairs(event.selected);
  });
  graphConfigurationPanel.addEventListener('pauseAfterEndChange', (event) => {
    if(!frequencyGraphPanel.isRunning()) {
      frequencyGraphPanel.start();
    }
  })
  graphConfigurationPanel.addEventListener('durationChange', event => {
    frequencyGraphPanel.setDurationMilliseconds(graphConfigurationPanel.getDurationMilliseconds());
  });

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
  sentDataTextArea = document.getElementById('sent-data');
  const receivedChannelGraph = document.getElementById('received-channel-graph');
  receivedChannelGraph.addEventListener('mouseover', handleReceivedChannelGraphMouseover);
  receivedChannelGraph.addEventListener('mouseout', handleReceivedChannelGraphMouseout);
  receivedChannelGraph.addEventListener('mousemove', handleReceivedChannelGraphMousemove);
  receivedChannelGraph.addEventListener('click', handleReceivedChannelGraphClick);
  document.getElementById('audio-context-sample-rate').innerText = getAudioContext().sampleRate.toLocaleString();
  // wire up events
  configurationChanged();
}

function updateFrequencyResolution() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = frequencyPanel.getFftSize();
  const frequencyResolution = sampleRate / fftSize;
  const frequencyCount = (sampleRate/2) / frequencyResolution;
  document.getElementById('frequency-resolution').innerText = frequencyResolution.toFixed(2);
  document.getElementById('frequency-count').innerText = frequencyCount.toFixed(2);
}

function handleAudioSenderSend({bits}) {
  SENT_TRANSFER_BITS.push(...bits);
  showSentBits();
}
function configurationChanged() {
  if(analyser) analyser.fftSize = frequencyPanel.getFftSize();
  updatePacketUtils();
  updateStreamManager();
  updateAudioSender();
  updateAudioReceiver();
  drawChannels();
  updateFrequencyResolution();
  updatePacketStats();
}
function updateAudioSender() {
  AudioSender.changeConfiguration({
    channels: availableFskPairsPanel.getSelectedFskPairs(),
    destination: SEND_VIA_SPEAKER ? audioContext.destination : getAnalyser(),
    waveForm: signalPanel.getWaveform()
  });
}
const handleAudioReceiverStart = ({signalStart}) => {
  StreamManager.reset();
  frequencyGraphPanel.setSignalStart(signalStart);
  RECEIVED_STREAM_START_MS = signalStart;
}
const handleAudioReceiverReceive = ({signalStart, signalIndex, indexStart, bits}) => {
  const packetIndex = PacketUtils.getPacketIndex(signalStart, indexStart);
  const segmentIndex = PacketUtils.getPacketSegmentIndex(signalStart, indexStart);
  // Getting all 1's for only the first 5 segments?
  // console.log(signalIndex, packetIndex, segmentIndex, bits.join(''));
  StreamManager.addBits(packetIndex, segmentIndex, bits);
}
const handleAudioReceiverEnd = (e) => {
  frequencyGraphPanel.setSignalEnd(e.signalEnd);
  if(graphConfigurationPanel.getPauseAfterEnd()) {
    stopGraph();
    frequencyGraphPanel.stop();
    AudioSender.stop();
  }
}
function updateAudioReceiver() {
  AudioReceiver.changeConfiguration({
    fskSets: availableFskPairsPanel.getSelectedFskPairs(),
    amplitudeThreshold: Math.floor(signalPanel.getAmplitudeThreshold() * 255),
    analyser: getAnalyser(),
    signalIntervalMs: signalPanel.getSegmentDurationMilliseconds(),
    sampleRate: getAudioContext().sampleRate
  });
}
function updateStreamManager() {
  StreamManager.setPacketEncoding(
    packetizationPanel.getErrorCorrection() ? HammingEncoding : undefined
  );
  StreamManager.changeConfiguration({
    bitsPerPacket: PacketUtils.getPacketMaxBitCount(),
    segmentsPerPacket: PacketUtils.getPacketSegmentCount(),
    bitsPerSegment: availableFskPairsPanel.getSelectedFskPairs().length,
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
    packetizationPanel.getErrorCorrection() ? HammingEncoding : undefined
  );
  const bitsPerSegment = availableFskPairsPanel.getSelectedFskPairs().length;
  PacketUtils.changeConfiguration({
    segmentDurationMilliseconds: signalPanel.getSegmentDurationMilliseconds(),
    packetSizeBitCount: packetizationPanel.getSizePower(),
    dataSizeBitCount: MAXIMUM_PACKETIZATION_SIZE_BITS,
    dataSizeCrcBitCount: CRC_BIT_COUNT,
    bitsPerSegment,
    packetEncoding: packetizationPanel.getErrorCorrection(),
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
  frequencyGraphPanel.setSamplePeriodsPerGroup(PacketUtils.getPacketSegmentCount());
  document.getElementById('total-segments').innerText = getTotalSegmentCount(bitCount).toLocaleString();
}


function drawChannels() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = frequencyPanel.getFftSize();
  const frequencyResolution = sampleRate / fftSize;
  const channels = availableFskPairsPanel.getSelectedFskPairs();
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
  const channelCount = availableFskPairsPanel.getSelectedFskPairs().length;

  // original bits
  document.getElementById('sent-data').innerHTML =
    SENT_ORIGINAL_BITS.reduce(bitReducer(
      PacketUtils.getPacketMaxBitCount(),
      packetizationPanel.getErrorCorrection() ? ERROR_CORRECTION_DATA_SIZE : 8
    ), '');
  
  // error correcting bits
  if(packetizationPanel.getErrorCorrection()) {
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
  const channels = availableFskPairsPanel.getSelectedFskPairs();
  const channelCount = channels.length;
  let bitCount = bits.length;
  const segmentDurationSeconds = PacketUtils.getSegmentDurationSeconds();
  for(let i = 0; i < bitCount; i += channelCount) {
    let segmentBits = bits.slice(i, i + channelCount);
    if(packetizationPanel.getInterleaving()) {
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
    if(packetizationPanel.getErrorCorrection()) {
      bits.push(...HammingEncoding.decode(packetBits));
    } else {
      bits.push(...packetBits);
    }
  }
  return bits;
}

function handleStreamManagerChange() {
  const channelCount = availableFskPairsPanel.getSelectedFskPairs().length;
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
    if(packetizationPanel.getErrorCorrection()) {
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
        packetizationPanel.getErrorCorrection() ? ERROR_CORRECTION_DATA_SIZE : 8
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
  return segments * availableFskPairsPanel.getSelectedFskPairs().length;
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
  if(packetizationPanel.getErrorCorrection()) {
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
  if(packetizationPanel.getErrorCorrection()) {
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
    frequencyPanel.setSampleRate(audioContext.sampleRate);
    availableFskPairsPanel.setSampleRate(audioContext.sampleRate);
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
    frequencyGraphPanel.start();
    const text = messagePanel.getMessage();
    sendBytes(textToBytes(text));
  }
}
function getAnalyser() {
  if(analyser) return analyser;
  analyser = audioContext.createAnalyser();
  frequencyGraphPanel.setAnalyser(analyser);
  analyser.smoothingTimeConstant = signalPanel.getSmoothingTimeConstant();
  analyser.fftSize = frequencyPanel.getFftSize();
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

function drawChannelData() {
  // Do/did we have a stream?
  if(!RECEIVED_STREAM_START_MS) return;

  const latest = SAMPLES[0].time;

  // will any of the stream appear?
  const packetBitCount = PacketUtils.getPacketMaxBitCount();

  const packetDuration = PacketUtils.getPacketDurationMilliseconds();
  const lastStreamEnded = RECEIVED_STREAM_START_MS + packetDuration;
  const graphDuration = graphConfigurationPanel.getDurationMilliseconds();
  const graphEarliest = latest - graphDuration;
  // ended too long ago?
  if(lastStreamEnded < graphEarliest) return;

  const channels = availableFskPairsPanel.getSelectedFskPairs();
  const channelCount = channels.length;

  const canvas = document.getElementById('received-channel-graph');
  
  clearCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const {height, width} = canvas;

  // Loop through visible segments
  const latestSegmentEnded = Math.min(latest, lastStreamEnded);
  for(let time = latestSegmentEnded; time > graphEarliest; time -= signalPanel.getSegmentDurationMilliseconds()) {
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
  const segmentWidth = width / (graphConfigurationPanel.getDurationMilliseconds() / signalPanel.getSegmentDurationMilliseconds());

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
  const segmentWidth = width / (graphConfigurationPanel.getDurationMilliseconds() / signalPanel.getSegmentDurationMilliseconds());
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
  const segmentWidth = width / (graphConfigurationPanel.getDurationMilliseconds() / signalPanel.getSegmentDurationMilliseconds());
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
  const channels = availableFskPairsPanel.getSelectedFskPairs();
  const channelHeight = height / channelCount;
  const segmentWidth = width / (graphConfigurationPanel.getDurationMilliseconds() / signalPanel.getSegmentDurationMilliseconds());
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
  requestAnimationFrame(drawFrequencyData);
}

function hzHue(hz) {
  return Math.floor((hz / 20000) * 360);
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
  const channels = availableFskPairsPanel.getSelectedFskPairs();
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
  const channels = availableFskPairsPanel.getSelectedFskPairs();
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
  const graphDuration = graphConfigurationPanel.getDurationMilliseconds();
  const graphEarliest = latest - graphDuration;
    // ended too long ago?
    if(lastStreamEnded < graphEarliest) {
      return {
        channelIndex,
        segmentIndex: -1
      };
    }
  
    const segmentWidth = width / (graphConfigurationPanel.getDurationMilliseconds() / signalPanel.getSegmentDurationMilliseconds());
  
    const latestSegmentEnded = Math.min(latest, lastStreamEnded);
  
    for(let time = latestSegmentEnded; time > graphEarliest; time -= signalPanel.getSegmentDurationMilliseconds()) {
      // too far back?
      if(time < RECEIVED_STREAM_START_MS) {
        return {
          channelIndex,
          segmentIndex: -1
        }
      };
  
      // which segment are we looking at?
      const segmentIndex = Math.floor(((time - RECEIVED_STREAM_START_MS) / signalPanel.getSegmentDurationMilliseconds()));
  
      // when did the segment begin/end
      const segmentStart = RECEIVED_STREAM_START_MS + (segmentIndex * signalPanel.getSegmentDurationMilliseconds());
      const segmentEnd = segmentStart + signalPanel.getSegmentDurationMilliseconds();
  
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