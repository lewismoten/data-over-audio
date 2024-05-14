import Dispatcher from "./Dispatcher";
import * as CRC from './CRC';
import * as PacketUtils from './PacketUtils';
import { 
  bitsToBytes,
  bitsToInt,
  bytesToBits,
  numberToBytes,
  numberToHex
} from "./converters";

const dispatcher = new Dispatcher('StreamManager', ['change']);
let DATA = new Uint8ClampedArray();
const FAILED_SEQUENCES = [];
let SAMPLES_EXPECTED = 0;
let SAMPLES_RECEIVED = 0;

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

export const reset = () => {
  let changed = false;
  SAMPLES_RECEIVED = 0;
  SAMPLES_EXPECTED = 0;
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
  const dataSize = PacketUtils.getPacketDataByteCount();
  const offset = sequence * dataSize;
  const length = offset + dataSize;
  if(crc === actualCrc) {
    if(FAILED_SEQUENCES.includes(sequence)) {
      FAILED_SEQUENCES.splice(FAILED_SEQUENCES.indexOf(sequence), 1);
    }
    if(DATA.length < length) {
      const copy = new Uint8ClampedArray(length);
      copy.set(DATA.subarray(0, DATA.length));
      DATA = copy;
    }
    DATA.set(bytes, offset);
    delete BITS[packetIndex];
    dispatcher.emit('packetReceived');
  } else {
    if(!FAILED_SEQUENCES.includes(sequence))
      FAILED_SEQUENCES.push(sequence);
  }
}
export const getPercentReceived = () => {
  if(SAMPLES_EXPECTED === 0) return 0;
  return SAMPLES_RECEIVED / SAMPLES_EXPECTED;
}
export const setPacketsExpected = packetCount => {
  if(packetCount < 0 || packetCount === Infinity) packetCount = 0;
  // used when requesting individual packets out of sequence
  SAMPLES_EXPECTED = packetCount * PacketUtils.getPacketSegmentCount();
}
export const changeConfiguration = ({
  segmentsPerPacket,
  bitsPerPacket,
  bitsPerSegment,
  streamHeaders
}) => {
  BITS_PER_PACKET = bitsPerPacket;
  SEGMENTS_PER_PACKET = segmentsPerPacket;
  BITS_PER_SEGMENT = bitsPerSegment;
  STREAM_HEADERS = streamHeaders;
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