import Dispatcher from "./Dispatcher";
import * as CRC from './CRC';
import * as PacketUtils from './PacketUtils';
import { 
  bitsToInt,
  bytesToBits,
  numberToBytes,
} from "./converters";

const dispatcher = new Dispatcher('StreamManager', [
  'change',
  'packetReceived',
  'packetFailed',
  'sizeReceived'
]);
let DATA = new Uint8ClampedArray();
let FAILED_SEQUENCES = [];
let SUCCESS_SEQUENCES = [];
let SAMPLES_EXPECTED = 0;
let SAMPLES_RECEIVED = 0;
let DATA_CRC_BIT_COUNT = 0;
let DATA_SIZE_BIT_COUNT = 0;
let DATA_SIZE_CRC_BIT_COUNT = 0;

const BITS = [];
let BITS_PER_PACKET = 0;
let SEGMENTS_PER_PACKET = 0;
let BITS_PER_SEGMENT = 0;
let STREAM_HEADERS = [];
let PACKET_ENCODING = {
  encode: bits => bits,
  decode: bits => bits
}

export const addEventListener = dispatcher.addListener;
export const removeEventListener = dispatcher.removeListener;

const isPacketInRange = (packetIndex) => {
  // Blindly accept. We can't do anything about it for now
  if(!isSizeTrusted()){
    return packetIndex < PacketUtils.getMaxPackets();
  }
  const { packetCount } = PacketUtils.packetStats(getSize());
  return packetIndex < packetCount;
}
export const reset = () => {
  let changed = false;
  SAMPLES_RECEIVED = 0;
  SAMPLES_EXPECTED = 0;
  if(SUCCESS_SEQUENCES.length !== 0) {
    SUCCESS_SEQUENCES.length = 0;
    changed = true;
  }
  if(FAILED_SEQUENCES.length !== 0) {
    FAILED_SEQUENCES.length = 0;
    changed = true;
  }
  if(DATA.length !== 0) {
    DATA = new Uint8ClampedArray();
    changed = true;
  }
  if(BITS.length !== 0) {
    BITS.length = 0;
    changed = true;
  }
  if(changed)
    dispatcher.emit('change');
}
export const getDataBytes = () => {
  const dataSize = getTransferByteCount();
  const dataSizeTrusted = isTransferByteCountTrusted();
  const headerByteCount = getStreamHeaderByteCount();
  if(dataSizeTrusted) {
    return DATA.subarray(headerByteCount, headerByteCount + dataSize);
  } else {
    return DATA.subarray(headerByteCount);
  }
}
export const applyPacket = ({
  crc,
  actualCrc,
  packetIndex,
  sequence,
  bytes,
  size
}) => {
  let trustedSize = isSizeTrusted();
  if(!isPacketInRange(sequence)) return;
  
  const dataSize = PacketUtils.getPacketDataByteCount();
  const offset = sequence * dataSize;
  const length = offset + dataSize;
  if(crc === actualCrc) {
    if(FAILED_SEQUENCES.includes(sequence)) {
      FAILED_SEQUENCES.splice(FAILED_SEQUENCES.indexOf(sequence), 1);
    }
    if(!SUCCESS_SEQUENCES.includes(sequence)) {
      SUCCESS_SEQUENCES.push(sequence);
    }
    if(DATA.length < length) {
      const copy = new Uint8ClampedArray(length);
      copy.set(DATA.subarray(0, DATA.length), 0);
      DATA = copy;
    }
    DATA.set(bytes, offset);

    if(!trustedSize && isSizeTrusted()) {
      // We may now have a trusted size. update prior failures.
      FAILED_SEQUENCES = FAILED_SEQUENCES.filter(isPacketInRange);
      dispatcher.emit('sizeReceived');
    }

    dispatcher.emit('packetReceived');
  } else {
    // do nothing if previously successful
    if(!SUCCESS_SEQUENCES.includes(sequence)) {
      // NOTE: Can we trust the sequence?
      // Check if sequence out of range
      if(!FAILED_SEQUENCES.includes(sequence))
        FAILED_SEQUENCES.push(sequence);
      dispatcher.emit('packetFailed', {sequence});
    }
  }
  delete BITS[packetIndex]
}
export const getFailedPacketIndeces = () => {
  return FAILED_SEQUENCES.filter(isPacketInRange);
}
export const getNeededPacketIndeces = () => {
  if(!isSizeTrusted()) return getFailedPacketIndeces();
  const packetCount = countExpectedPackets();
  let indeces = [];
  for(let i = 0; i < packetCount; i++) {
    if(SUCCESS_SEQUENCES.includes(i)) continue;
    indeces.push(i);
  }
  return indeces;
};
export const countFailedPackets = () => FAILED_SEQUENCES.length;
export const countSuccessfulPackets = () => SUCCESS_SEQUENCES.length;
export const countExpectedPackets = () => {
  if(!isSizeTrusted()) return PacketUtils.getMaxPackets();
  return PacketUtils.packetStats(getSize()).packetCount;
}
export const setPacketsExpected = packetCount => {
  if(packetCount < 0 || packetCount === Infinity) packetCount = 0;
  // used when requesting individual packets out of sequence
  SAMPLES_EXPECTED = packetCount * PacketUtils.getPacketSegmentCount();
}

const hasPackets = (start, end) => {
  for(let packetIndex = start; packetIndex <= end; packetIndex++) {
    // We need this packet, but it failed to transfer
    if(FAILED_SEQUENCES.includes(packetIndex)) return false;
    // We need this packet, but it hasn't come through yet
    if(!SUCCESS_SEQUENCES.includes(packetIndex)) return false;
  }
  return true;
}
const hasBytes = (index, length) => {
  if(DATA.length < index + length) return false;
  const packetSize = PacketUtils.getPacketDataByteCount();
  const start = Math.floor(index / packetSize);
  const end = Math.floor(index + length / packetSize);
  return hasPackets(start, end);
}
export const getSizeAvailable = () => {
  if(DATA_SIZE_BIT_COUNT === 0) return 1;
  let lastBit = DATA_SIZE_BIT_COUNT;
  let lastByte = Math.ceil(lastBit / 8);
  if(!hasBytes(0, lastByte)) return false;

  // Do we have a crc check on the size?
  if(DATA_SIZE_CRC_BIT_COUNT !== 0) {
    return getSizeCrcAvailable();
  }
  return true;  
}
export const isSizeTrusted = () => {
  if(!getSizeAvailable()) return false;
  if(DATA_SIZE_CRC_BIT_COUNT !== 0) return getSizeCrcPassed();
  return true;
}
export const getSize = () => {
  if(DATA_SIZE_BIT_COUNT === 0) return 1;
  if(!getSizeAvailable()) return -1;
  let firstBit = 0;
  let lastBit = DATA_SIZE_BIT_COUNT;

  // Do we have the data?
  let firstByte = Math.floor(firstBit / 8);
  let lastByte = Math.ceil(lastBit / 8);
  if(DATA.length < lastByte) return -1;

  // Grab the data
  let bits = bytesToBits(DATA.subarray(firstByte, lastByte));
  if(firstBit % 8 !== 0) {
    bits.splice(firstBit % 8);
  }
  bits.length = DATA_SIZE_BIT_COUNT

  return bitsToInt(bits, DATA_SIZE_BIT_COUNT);
}
export const getSizeCrc = () => {
  if(!getSizeCrcAvailable()) return CRC.INVALID;

  let startBitIndex = DATA_SIZE_BIT_COUNT;
  let endBitIndex = startBitIndex + DATA_SIZE_CRC_BIT_COUNT;

  let startByte = Math.floor(startBitIndex / 8);
  let endByte = Math.ceil(endBitIndex / 8);
  if(DATA.length < endByte) return CRC.INVALID;

  let bits = bytesToBits(DATA.subarray(startByte, endByte));
  if(startBitIndex % 8 !== 0) bits.splice(0, startBitIndex);
  bits.length = DATA_SIZE_CRC_BIT_COUNT;
  return bitsToInt(bits, DATA_SIZE_CRC_BIT_COUNT);
}
export const getCrc = () => {
  if(!getCrcAvailable()) return CRC.INVALID;

  let startBitIndex = DATA_SIZE_BIT_COUNT + DATA_SIZE_CRC_BIT_COUNT;
  let endBitIndex = startBitIndex + DATA_CRC_BIT_COUNT;

  let startByte = Math.floor(startBitIndex / 8);
  let endByte = Math.ceil(endBitIndex / 8);
  if(DATA.length < endByte) return CRC.INVALID;

  let bits = bytesToBits(DATA.subarray(startByte, endByte));
  if(startBitIndex % 8 !== 0) bits.splice(0, startBitIndex);
  bits.length = DATA_CRC_BIT_COUNT;
  return bitsToInt(bits, DATA_CRC_BIT_COUNT);
}
export const getSizeCrcAvailable = () => {
  if (DATA_SIZE_BIT_COUNT === 0) return false;
  if (DATA_SIZE_CRC_BIT_COUNT === 0) return false;
  const bitsNeeded = DATA_SIZE_BIT_COUNT + DATA_SIZE_CRC_BIT_COUNT;
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  return hasBytes(0, bytesNeeded);
}
export const getCrcAvailable = () => {
  if(DATA_CRC_BIT_COUNT === 0) return false;
  if(!getSizeAvailable()) return false;
  let byteCount = getSize();

  // Do we have enough bytes for the headers and underlying data?
  let headerBitCount = DATA_SIZE_BIT_COUNT + DATA_CRC_BIT_COUNT + DATA_SIZE_CRC_BIT_COUNT;
  if(headerBitCount % 8 !== 0)
    headerBitCount += 8 - (headerBitCount % 8);
  const headerByteCount = headerBitCount / 8;
  byteCount += headerByteCount;
  
  return hasBytes(0, byteCount);
}
export const getSizeCrcPassed = () => {
  if(!getSizeCrcAvailable()) return false;
  const size = getSize();
  const sizeCrc = getSizeCrc();
  if(sizeCrc === CRC.INVALID) return false;
  const crc = CRC.check(numberToBytes(size, DATA_SIZE_BIT_COUNT), DATA_SIZE_CRC_BIT_COUNT);
  return crc === sizeCrc;
}
export const getCrcPassed = () => {
  if(!getCrcAvailable()) return false;
  if(!isSizeTrusted()) return false;

  const size = getSize();
  const crc = getCrc();
  if(crc === CRC.INVALID) return false;
  // Get Data

  // How large is our header?
  let headerBitCount = DATA_CRC_BIT_COUNT + DATA_SIZE_BIT_COUNT + DATA_SIZE_CRC_BIT_COUNT;
  if(headerBitCount % 8 !== 0) headerBitCount += 8 - (headerBitCount % 8);
  let headerByteCount = headerBitCount / 8;

  // Get bytes needed to perform CRC check on
  const data = DATA.subarray(headerByteCount, headerByteCount + size);

  // Do the check
  return crc === CRC.check(data, DATA_CRC_BIT_COUNT);
}
export const changeConfiguration = ({
  segmentsPerPacket,
  bitsPerPacket,
  bitsPerSegment,
  streamHeaders,
  dataCrcBitLength,
  dataSizeBitCount,
  dataSizeCrcBitCount
}) => {
  BITS_PER_PACKET = bitsPerPacket;
  SEGMENTS_PER_PACKET = segmentsPerPacket;
  BITS_PER_SEGMENT = bitsPerSegment;
  STREAM_HEADERS = streamHeaders;
  DATA_CRC_BIT_COUNT = dataCrcBitLength;
  DATA_SIZE_BIT_COUNT = dataSizeBitCount;
  DATA_SIZE_CRC_BIT_COUNT = dataSizeCrcBitCount;
}
const noEncoding = bits => bits;
export const setPacketEncoding = ({ encode, decode } = {}) => {
  PACKET_ENCODING.encode = encode ?? noEncoding;
  PACKET_ENCODING.decode = decode ?? noEncoding;
}
export const addSample = (
  packetIndex,
  segmentIndex,
  bits
) => {
  SAMPLES_RECEIVED++;


  if(BITS[packetIndex] === undefined) {
    BITS[packetIndex] = [];
  }
  const oldBits = BITS[packetIndex][segmentIndex];
  BITS[packetIndex][segmentIndex] = bits;
  if(hasNewBits(oldBits, bits))
    dispatcher.emit('change');

  // Last segment in a packet?
  if(segmentIndex === PacketUtils.getPacketSegmentCount() -1) {
    // Unpack!
    const packetBits = getPacketBits(packetIndex);
    const unpacked = PacketUtils.unpack().getPacketFromBits(packetBits, packetIndex);
    applyPacket(unpacked);
  }
  if(SAMPLES_EXPECTED === 0) {
    const dataLength = getTransferByteCount();
    if(isTransferByteCountTrusted()) {
      SAMPLES_EXPECTED = PacketUtils.packetStats(dataLength).sampleCount;
    }
  }
}
const sumSegmentBits = (sum, segment) => sum + segment.length;
const sumPacketBits = (sum, packet) => sum + packet.reduce(sumSegmentBits, 0);
export const sumTotalBits = () => BITS.reduce(sumPacketBits, 0);

const hasNewBits = (oldBits = [], bits = []) => {
  if(oldBits.length === 0 && bits.length === BITS_PER_SEGMENT)
    return true;
  for(let i = 0; i < BITS_PER_SEGMENT; i++) {
    let a = oldBits[i] ?? 0;
    let b = bits[i] ?? 0;
    if(a !== b) return true;
  }
  return false;
}
export const getPacketReceivedCount = () => {
  if(BITS.length === 0) return 1;
  return BITS.length;
}
export const getPacketSegmentBits = (packetIndex, segmentIndex) => BITS[packetIndex]?.[segmentIndex];
export const getPacketBits = (packetIndex, defaultBit = 0) => {
  const bits = [];
  const packet = BITS[packetIndex] ?? [];
  for(let segmentIndex = 0; segmentIndex < SEGMENTS_PER_PACKET; segmentIndex++) {
    let segment = packet[segmentIndex] ?? [];
    for(let bitIndex = 0; bitIndex < BITS_PER_SEGMENT; bitIndex++) {
      const bit = segment[bitIndex];
      bits.push(bit ?? defaultBit);
      if(bits.length === BITS_PER_PACKET) return bits;
    }
  }
  while(bits.length < BITS_PER_PACKET) bits.push(defaultBit);
  return bits;
}
export const getPacketBitsDecoded = (packetIndex, defaultBit = 0) => {
  const bits = getPacketBits(packetIndex, defaultBit);
  return PACKET_ENCODING.decode(bits);
}
const getStreamHeaderByteCount = () => {
  const lastBit = Object.keys(STREAM_HEADERS).reduce((lastBit, key) => {
    const {index = 0, length = 0} = STREAM_HEADERS[key];
    if(length === 0)  return lastBit;
    if(lastBit < index + length) return index + length;
    return lastBit;
  }, 0);
  return Math.ceil(lastBit / 8);
}
const getStreamHeaderBits = name => {
  const header = STREAM_HEADERS[name];
  if(!header) return [];
  const { index, length } = header;
  if(length === 0) return [];
  const packetCount = getPacketReceivedCount();
  const bits = [];
  for(let packetIndex = 0; packetIndex < packetCount; packetIndex++) {
    bits.push(...getPacketBitsDecoded(packetIndex, 1));
    if(bits.length >= index + length) break;
  }
  return bits.slice(index, index + length);
}
export const getTransferByteCount = () => {
  const name = 'transfer byte count';
  const length = STREAM_HEADERS[name].length;
  if(length === 0) return 1;
  const bits = getStreamHeaderBits(name);
  return bitsToInt(bits, length);
}
export const getTransferByteCountCrc = () => {
  const name = 'transfer byte count crc';
  const length = STREAM_HEADERS[name].length;
  if(length === 0) return -1;
  const bits = getStreamHeaderBits(name);
  if(bits.length !== length) return CRC.INVALID;
  return bitsToInt(bits, length);
}
export const getTransferByteCountActualCrc = () => {
  const countBits = getStreamHeaderBits('transfer byte count').length;
  if(countBits === 0) return -1;

  const crcBits = getStreamHeaderBits('transfer byte count crc').length;
  if(crcBits === 0) return -1;

  const count = getTransferByteCount();
  const bytesOfCount = numberToBytes(count, countBits);
  return CRC.check(bytesOfCount, crcBits)
}
export const isTransferByteCountTrusted = () => {
  return getTransferByteCountCrc() === getTransferByteCountActualCrc();
}
export function getTransferDataCrc() {
  const name = 'transfer byte crc';
  const length = STREAM_HEADERS[name].length;
  if(length === 0) return 0;
  const bits = getStreamHeaderBits(name);
  if(bits.length !== length) return CRC.INVALID;
  return bitsToInt(bits, length);
}
export function getTransferActualDataCrc() {
  const name = 'transfer byte crc';
  const length = STREAM_HEADERS[name].length;
  if(length === 0) return 0;
  const crcBits = getStreamHeaderBits(name).length;
  const bytes = getDataBytes();
  return CRC.check(bytes, crcBits);
}
export const isTransferDataTrusted = () => {
  return getTransferDataCrc() === getTransferActualDataCrc();
}