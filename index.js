import * as StreamManager from "./StreamManager.js";
import * as HammingEncoding from './HammingEncoding.js';
import * as InterleaverEncoding from './InterleaverEncoding.js';
import * as PacketUtils from './PacketUtils.js';
import * as Humanize from './Humanize.js';
import * as Randomizer from './Randomizer.js';
import * as AudioSender from './AudioSender.js';
import * as AudioReceiver from './AudioReceiver.js';
import OutputPanel from './Panels/OutputPanel.js';
import MessagePanel from "./Panels/MessagePanel.js";
import CodePanel from "./Panels/CodePanel.js";
import FrequencyPanel from "./Panels/FrequencyPanel.js";
import SignalPanel from "./Panels/SignalPanel.js";
import PacketizationPanel from "./Panels/PacketizationPanel.js";
import AvailableFskPairsPanel from "./Panels/AvailableFskPairsPanel.js";
import FrequencyGraphPanel from "./Panels/FrequencyGraphPanel.js";
import GraphConfigurationPanel from './Panels/GraphConfigurationPanel.js';
import PacketErrorPanel from './Panels/PacketErrorPanel.js';
import SpeedPanel from './Panels/SpeedPanel.js';
import {
  bytesToText,
} from './converters.js';
import MicrophonePanel from "./Panels/MicrophonePanel.js";
import ReceivePanel from "./Panels/ReceivePanel.js";
var audioContext;
var analyser;

const ERROR_CORRECTION_BLOCK_SIZE = 7;
const ERROR_CORRECTION_DATA_SIZE = 4;

var SEND_VIA_SPEAKER = false;

var PAUSE = false;

const outputPanel = new OutputPanel();
const messagePanel = new MessagePanel();
const statusPanel = new CodePanel('Status');
// const bitsSentPanel = new CodePanel('Bits Sent');
// const bitsReceivedPanel = new CodePanel('Bits Received');
const frequencyPanel = new FrequencyPanel();
const signalPanel = new SignalPanel();
const packetizationPanel = new PacketizationPanel();
const availableFskPairsPanel = new AvailableFskPairsPanel();
const frequencyGraphPanel = new FrequencyGraphPanel();
const graphConfigurationPanel = new GraphConfigurationPanel();
const speedPanel = new SpeedPanel();
const microphonePanel = new MicrophonePanel();
const receivePanel = new ReceivePanel();
const packetErrorPanel = new PacketErrorPanel();

function handleWindowLoad() {
  const panelContainer = document.getElementById('panel-container');
  panelContainer.prepend(speedPanel.getDomElement());
  panelContainer.prepend(graphConfigurationPanel.getDomElement());
  panelContainer.prepend(frequencyGraphPanel.getDomElement());
  panelContainer.prepend(packetizationPanel.getDomElement());
  panelContainer.prepend(availableFskPairsPanel.getDomElement());
  panelContainer.prepend(frequencyPanel.getDomElement());
  panelContainer.prepend(signalPanel.getDomElement());
  // panelContainer.prepend(bitsReceivedPanel.getDomElement());
  // panelContainer.prepend(bitsSentPanel.getDomElement());
  panelContainer.prepend(statusPanel.getDomElement());
  panelContainer.prepend(packetErrorPanel.getDomElement());
  panelContainer.prepend(receivePanel.getDomElement());
  panelContainer.prepend(microphonePanel.getDomElement());
  panelContainer.prepend(outputPanel.getDomElement());
  panelContainer.prepend(messagePanel.getDomElement());

  // Initialize Values
  microphonePanel.setListening(false);

  outputPanel.setSendSpeakers(false);
  outputPanel.setSendAnalyzer(true);

  messagePanel.setMessageText(Randomizer.text(5));
  messagePanel.setDataType('text');
  messagePanel.setSendButtonText('Send');

  messagePanel.addEventListener('dataTypeChange', ({values: [dataType]}) => {
    receivePanel.setDataType(dataType);
  })
  receivePanel.setDataType(messagePanel.getDataType());
  receivePanel.setExpectedPacketCount(0);
  receivePanel.setFailedPacketCount(0);
  receivePanel.setSuccessfulPacketCount(0);

  receivePanel.setReceivedHtml('Ready.');

  packetErrorPanel.reset();

  // bitsSentPanel.setCode('');
  // bitsReceivedPanel.setCode('');

  frequencyPanel.setMinimumFrequency(300);
  frequencyPanel.setMaximumFrequency(3400);
  frequencyPanel.setFftSize(2 ** 11);
  frequencyPanel.setFskPadding(4);
  frequencyPanel.setMultiFskPadding(2);

  signalPanel.setWaveform('triangle');
  signalPanel.setSegmentDurationMilliseconds(65);
  signalPanel.setAmplitudeThreshold(0.3);
  signalPanel.setSmoothingTimeConstant(0);
  signalPanel.setTimeoutMilliseconds(1000);

  packetizationPanel.setDataSizePower(12);
  packetizationPanel.setDataSizeCrc(8);
  packetizationPanel.setDataCrc(16);
  packetizationPanel.setSizePower(4);
  packetizationPanel.setPacketCrc(8);
  packetizationPanel.setSequenceNumberPower(8);

  packetizationPanel.setErrorCorrection(true);
  packetizationPanel.setInterleaving(true);

  availableFskPairsPanel.setFskPairs(frequencyPanel.getFskPairs());

  graphConfigurationPanel.setDurationMilliseconds(signalPanel.getSegmentDurationMilliseconds() * 20);
  graphConfigurationPanel.setPauseAfterEnd(true);

  frequencyGraphPanel.setFskPairs(availableFskPairsPanel.getSelectedFskPairs());
  frequencyGraphPanel.setAmplitudeThreshold(signalPanel.getAmplitudeThreshold());
  frequencyGraphPanel.setDurationMilliseconds(graphConfigurationPanel.getDurationMilliseconds());

  speedPanel.setMaximumDurationMilliseconds(0);
  speedPanel.setDataBitsPerSecond(0);
  speedPanel.setPacketizationBitsPerSecond(0);
  speedPanel.setTransferDurationMilliseconds(0);


  // Events
  outputPanel.addEventListener('sendSpeakersChange', handleChangeSendSpeakers);
  outputPanel.addEventListener('sendAnalyzerChange', handleChangeSendAnalyzer);

  messagePanel.addEventListener('messageChange', configurationChanged);
  messagePanel.addEventListener('sendClick', handleSendButtonClick);
  messagePanel.addEventListener('stopClick', handleStopButtonClick);

  frequencyPanel.addEventListener('minimumFrequencyChange', configurationChanged);
  frequencyPanel.addEventListener('maximumFrequencyChange', configurationChanged);
  frequencyPanel.addEventListener('fftSizeChange', ({value}) => {
    configurationChanged();
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
    const encoding = packetizationPanel.getInterleaving() ? InterleaverEncoding : undefined;
    AudioReceiver.setSampleEncoding(encoding);
    AudioSender.setSampleEncoding(encoding)
    configurationChanged();
  });
  packetizationPanel.addEventListener('errorCorrectionChange', configurationChanged);
  packetizationPanel.addEventListener('dataSizePowerChange', configurationChanged);
  packetizationPanel.addEventListener('dataSizeCrcChange', configurationChanged);
  packetizationPanel.addEventListener('dataCrcChange', configurationChanged);
  packetizationPanel.addEventListener('packetCrcChange', configurationChanged);
  packetizationPanel.addEventListener('sequenceNumberPowerChange', configurationChanged);

  AudioReceiver.setTimeoutMilliseconds(signalPanel.getTimeoutMilliseconds());
  const encoding = packetizationPanel.getInterleaving() ? InterleaverEncoding : undefined;
  AudioReceiver.setSampleEncoding(encoding);
  AudioSender.setSampleEncoding(encoding)

  availableFskPairsPanel.addEventListener('change', (event) => {
    frequencyGraphPanel.setFskPairs(event.selected);
    configurationChanged();
  });
  graphConfigurationPanel.addEventListener('pauseAfterEndChange', (event) => {
    if(!frequencyGraphPanel.isRunning()) {
      frequencyGraphPanel.start();
    }
  })
  graphConfigurationPanel.addEventListener('durationChange', event => {
    frequencyGraphPanel.setDurationMilliseconds(graphConfigurationPanel.getDurationMilliseconds());
  });

  receivePanel.addEventListener('start', handleReceivePanelStart);
  receivePanel.addEventListener('receive', handleReceivePanelReceive);
  receivePanel.addEventListener('end', handleReceivePanelEnd);
  receivePanel.addEventListener('resetClick', () => {
    AudioReceiver.stop();
    AudioReceiver.reset();
    StreamManager.reset();
    packetErrorPanel.reset();
  });

  packetErrorPanel.addEventListener('requestPackets', requestFailedPackets);

  // Setup audio sender
  AudioSender.addEventListener('begin', () => messagePanel.setSendButtonText('Stop'));
  // AudioSender.addEventListener('send', () => {});
  AudioSender.addEventListener('end', () => messagePanel.setSendButtonText('Send'));

  AudioReceiver.addEventListener('end', () => {
    // Signal ended before complete transmission?
    const missingIndeces = StreamManager.getNeededPacketIndeces();
    packetErrorPanel.setFailedPacketIndeces(missingIndeces);
    if(missingIndeces.length !== 0 && packetErrorPanel.getAutomaticRepeatRequest()) {
      statusPanel.appendText(`Automatically Requesting ${missingIndeces.length} failed packet(s).`);
      sendPackets(messagePanel.getMessageBytes(), missingIndeces);
    }
  })
  // Setup stream manager
  StreamManager.addEventListener('sizeReceived', () => {
    receivePanel.setExpectedPacketCount(StreamManager.countExpectedPackets());
  });
  StreamManager.addEventListener('packetFailed', () => {
    receivePanel.setFailedPacketCount(StreamManager.countFailedPackets());
    packetErrorPanel.setFailedPacketIndeces(StreamManager.getFailedPacketIndeces());
  });
  StreamManager.addEventListener('packetReceived', () => {
    receivePanel.setSuccessfulPacketCount(StreamManager.countSuccessfulPackets());
    packetErrorPanel.setSuccessfulPacketCount(StreamManager.countSuccessfulPackets());
    
    // Failed indices changed?
    receivePanel.setFailedPacketCount(StreamManager.countFailedPackets());
    packetErrorPanel.setFailedPacketIndeces(StreamManager.getFailedPacketIndeces());

    if(StreamManager.getSizeCrcAvailable()) {
      packetErrorPanel.setSizeCrcPassed(StreamManager.getSizeCrcPassed());
    } else {
      packetErrorPanel.setSizeCrcUnavailable();
    }
    if(StreamManager.getCrcAvailable()) {
      packetErrorPanel.setCrcPassed(StreamManager.getCrcPassed());
    } else {
      packetErrorPanel.setCrcUnavailable();
    }
    receivePanel.setReceivedBytes(StreamManager.getDataBytes());  
  });

  // grab dom elements
  document.getElementById('audio-context-sample-rate').innerText = getAudioContext().sampleRate.toLocaleString();
  // wire up events
  configurationChanged();
}
const requestFailedPackets = () => {
  const packetIndeces = packetErrorPanel.getFailedPacketIndeces();
  try {
    sendPackets(messagePanel.getMessageBytes(), packetIndeces);
  } catch (e) {
    statusPanel.appendText(e);
  }
}

function updateFrequencyResolution() {
  const sampleRate = getAudioContext().sampleRate;
  const fftSize = frequencyPanel.getFftSize();
  const frequencyResolution = sampleRate / fftSize;
  const frequencyCount = (sampleRate/2) / frequencyResolution;
  
  document.getElementById('frequency-resolution').innerText = frequencyPanel.getFrequencyResolutionSize();;
  document.getElementById('frequency-count').innerText = frequencyCount.toFixed(2);
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
const handleReceivePanelStart = ({signalStart}) => {
  frequencyGraphPanel.setSignalStart(signalStart);
  RECEIVED_STREAM_START_MS = signalStart;
}
const handleReceivePanelReceive = ({signalStart, signalIndex, indexStart, bits}) => {
  const packetIndex = PacketUtils.getPacketIndex(signalStart, indexStart);
  const segmentIndex = PacketUtils.getPacketSegmentIndex(signalStart, indexStart);
  StreamManager.addSample(packetIndex, segmentIndex, bits);
}
const handleReceivePanelEnd = (e) => {
  frequencyGraphPanel.setSignalEnd(e.signalEnd);
  if(graphConfigurationPanel.getPauseAfterEnd()) {
    frequencyGraphPanel.stop();
    receivePanel.setIsOnline(false);
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
  const xferCountLength = packetizationPanel.getDataSizePower();
  const xferCountCrcLength = xferCountLength === 0 ? 0 : packetizationPanel.getDataSizeCrc();
  const xferCrcLength = packetizationPanel.getDataCrc();

  StreamManager.changeConfiguration({
    bitsPerPacket: PacketUtils.getPacketMaxBitCount(),
    segmentsPerPacket: PacketUtils.getPacketSegmentCount(),
    bitsPerSegment: availableFskPairsPanel.getSelectedFskPairs().length,
    dataCrcBitLength: packetizationPanel.getDataCrc(),
    dataSizeBitCount: packetizationPanel.getDataSizePower(),
    dataSizeCrcBitCount: packetizationPanel.getDataSizeCrc(),
    streamHeaders: {
      'transfer byte count': {
        index: 0,
        length: xferCountLength
      },
      'transfer byte count crc': {
        index:  xferCountLength,
        length: xferCountCrcLength
      },
      'transfer byte crc': {
        index:  xferCountLength + xferCountCrcLength,
        length: xferCrcLength
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
    dataSizeBitCount: packetizationPanel.getDataSizePower(),
    dataSizeCrcBitCount: packetizationPanel.getDataSizeCrc(),
    dataCrcBitCount: packetizationPanel.getDataCrc(),
    bitsPerSegment,
    packetEncoding: packetizationPanel.getErrorCorrection(),
    packetEncodingBitCount: ERROR_CORRECTION_BLOCK_SIZE,
    packetDecodingBitCount: ERROR_CORRECTION_DATA_SIZE,
    packetSequenceNumberBitCount: packetizationPanel.getSequenceNumberPower(),
    packetCrcBitCount: packetizationPanel.getPacketCrc()
  });
  speedPanel.setMaximumDurationMilliseconds(PacketUtils.getMaxDurationMilliseconds());
  speedPanel.setDataBitsPerSecond(PacketUtils.getEffectiveBaud());
  speedPanel.setPacketizationBitsPerSecond(PacketUtils.getBaud());
  const {
    totalDurationSeconds
  } = PacketUtils.packetStats(messagePanel.getMessageBytes().length);
  speedPanel.setTransferDurationMilliseconds(totalDurationSeconds * 1000);

}
function updatePacketStats() {
  const bytes = messagePanel.getMessageBytes();
  const byteCount = bytes.length;

  const {
    transferBitCount,
    transferByteCount,
    packetCount,
    samplePeriodCount
  } = PacketUtils.packetStats(byteCount);

  // Data
  document.getElementById('original-byte-count').innerText = byteCount.toLocaleString();
  document.getElementById('packetization-byte-count').innerText = transferByteCount.toLocaleString();
  document.getElementById('packetization-bit-count').innerText = transferBitCount.toLocaleString();
  document.getElementById('packet-count').innerText = packetCount.toLocaleString();
  document.getElementById('last-packet-unused-bit-count').innerText = PacketUtils.fromByteCountGetPacketLastUnusedBitCount(byteCount).toLocaleString();
  document.getElementById('total-segments').innerText = samplePeriodCount.toLocaleString();

  frequencyGraphPanel.setSamplePeriodsPerGroup(PacketUtils.getPacketSegmentCount());
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
function sendBytes(bytes) {
  const byteCount = bytes.length;
  const { packetCount } = PacketUtils.packetStats(byteCount);
  const packetIndeces = new Array(packetCount).fill(0).map((_, i) => i);
  sendPackets(bytes, packetIndeces);
}
function sendPackets(bytes, packetIndeces) {
  const byteCount = bytes.length;
  if(packetIndeces.length === 0) {
    statusPanel.appendText('Nothing requested!');
    return;
  } else if(byteCount === 0) {
    statusPanel.appendText('Nothing to send!');
    return;
  } else if(byteCount > packetizationPanel.getDataSize()) {
    statusPanel.appendText(`Attempted to send too much data. Limit is ${Humanize.byteSize(packetizationPanel.getDataSize())}. Tried to send ${Humanize.byteSize(byteCount)}`);
    return;
  }
  const {
    packetDurationSeconds,
    packetCount
  } = PacketUtils.packetStats(byteCount);

  // dedupe indices
  packetIndeces = packetIndeces
    // dedupe
    .filter((v,i,a) => a.indexOf(v, i+1) === -1)
    // integers only
    .filter(Number.isInteger)
    // in range
    .filter(v => v >=0 && v < packetCount);
  
  // ensure headers come first
  packetIndeces.sort((a, b) => a - b);

  // Make sure we still have something to send
  if(packetIndeces.length === 0) {
    statusPanel.appendText('No valid packets requested.');
    return;
  }

  const requestedPacketCount = packetIndeces.length;

  const audioContext = getAudioContext();

  AudioSender.setAudioContext(audioContext);

  if(audioContext.state !== "running") {
    statusPanel.appendText(`Expected audio context to be running. State: ${audioContext.state}`);
  }
  
  const startSeconds = AudioSender.now() + 0.1;
  const packetBitCount = PacketUtils.getPacketMaxBitCount();
  const packer = PacketUtils.pack(bytes);

  try {
    AudioSender.beginAt(startSeconds);
    // send all packets
    for(let i = 0; i < requestedPacketCount; i++) {
      let packet = packer.getBits(packetIndeces[i]);
      if(packet.length > packetBitCount) {
        throw new Error(`Too many bits in the packet. tried to send ${packet.length}, limited to ${packetBitCount}`);
      } else if(packet.length === 0) {
        throw new Error(`Attempted to send packet ${i} but it has no data!.`)
      }
      packet.push(...new Array(packetBitCount - packet.length).fill(0));
      sendPacket(packet, startSeconds + (i * packetDurationSeconds));
    }
    AudioSender.stopAt(startSeconds + (requestedPacketCount * packetDurationSeconds));
  } catch (e) {
    statusPanel.addText(e);
    AudioSender.stop();
    return;
  }

  // start the graph and receiver
  if(graphConfigurationPanel.getPauseAfterEnd()) {
    receivePanel.setIsOnline(true);
    frequencyGraphPanel.start();
  }
}
function sendPacket(bits, packetStartSeconds) {
  const channels = availableFskPairsPanel.getSelectedFskPairs();
  const channelCount = channels.length;
  let bitCount = bits.length;
  const segmentDurationSeconds = PacketUtils.getSegmentDurationSeconds();
  for(let i = 0; i < bitCount; i += channelCount) {
    let segmentBits = bits.slice(i, i + channelCount);
    if(segmentBits.length !== channelCount) {
      segmentBits.push(...new Array(channelCount - segmentBits.length).fill(0))
    }
    const segmentIndex = Math.floor(i / channelCount);
    var offsetSeconds = segmentIndex * segmentDurationSeconds;
    AudioSender.send(segmentBits, packetStartSeconds + offsetSeconds);
  }
}
function getAudioContext() {
  if(!audioContext) {
    audioContext = new (window.AudioContext || webkitAudioContext)();
    frequencyPanel.setSampleRate(audioContext.sampleRate);
    availableFskPairsPanel.setSampleRate(audioContext.sampleRate);
    microphonePanel.setAudioContext(audioContext);
  }
  if(audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}
function handleStopButtonClick() {
  AudioSender.stop();
}
function handleSendButtonClick() {
  sendBytes(messagePanel.getMessageBytes());
}
function getAnalyser() {
  if(analyser) return analyser;
  analyser = audioContext.createAnalyser();
  frequencyGraphPanel.setAnalyser(analyser);
  microphonePanel.setAnalyser(analyser);

  analyser.smoothingTimeConstant = signalPanel.getSmoothingTimeConstant();
  analyser.fftSize = frequencyPanel.getFftSize();
  return analyser;
}
function handleChangeSendAnalyzer({checked}) {
  SEND_VIA_SPEAKER = !checked;
  configurationChanged();
  AudioSender.setDestination(getAnalyser())
}
function handleChangeSendSpeakers({checked}) {
  SEND_VIA_SPEAKER = checked;
  configurationChanged();
  AudioSender.setDestination(audioContext.destination);
}

window.addEventListener('load', handleWindowLoad);