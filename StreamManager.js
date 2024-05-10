import { bitsToInt } from "./converters";

const BITS = [];
let BITS_PER_PACKET = 0;
let SEGMENTS_PER_PACKET = 0;
let BITS_PER_SEGMENT = 0;
let STREAM_HEADERS = [];
let SEGMENT_ENCODING = {
  encode: bits => bits,
  decode: bits => bits
};
let PACKET_ENCODING = {
  encode: bits => bits,
  decode: bits => bits
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
export const setSegmentEncoding = ({ encode, decode } = {}) => {
  SEGMENT_ENCODING.encode = encode ?? noEncoding;
  SEGMENT_ENCODING.decode = decode ?? noEncoding;
}
export const setPacketEncoding = ({ encode, decode } = {}) => {
  PACKET_ENCODING.encode = encode ?? noEncoding;
  PACKET_ENCODING.decode = decode ?? noEncoding;
}
export const addBits = (
  packetIndex,
  segmentIndex,
  bits
) => {
  if(BITS[packetIndex] === undefined) {
    BITS[packetIndex] = [];
  }
  BITS[packetIndex][segmentIndex] = bits;
}
export const getPacketReceivedCount = () => {
  if(BITS.length === 0) return 1;
  return BITS.length;
}
export const getStreamBits = () => {
  const bits = [];
  const packetCount = getPacketReceivedCount();
  for(let packetIndex = 0; packetIndex < packetCount; packetIndex++) {
    const packet = BITS[packetIndex] ?? [];
    for(let segmentIndex = 0; segmentIndex < SEGMENTS_PER_PACKET; segmentIndex++) {
      let segment = packet[segmentIndex] ?? [];
      for(let bitIndex = 0; bitIndex < BITS_PER_SEGMENT; bitIndex++) {
        const bit = segment[bitIndex];
        bits.push(bit ?? 0);
      }
    }
  }
  return bits;
}
export const getPacketSegmentBits = (packetIndex, segmentIndex) => BITS[packetIndex]?.[segmentIndex];
export const getAllPacketBits = () => {
  const packetCount = getPacketReceivedCount();
  const bits = [];
  for(let packetIndex = 0; packetIndex < packetCount; packetIndex++) {
    bits.push(...getPacketBits(packetIndex));
  }
  return bits;
}
export const getPacketBits = (packetIndex, defaultBit = 0) => {
  const bits = [];
  const packet = BITS[packetIndex] ?? [];
  for(let segmentIndex = 0; segmentIndex < SEGMENTS_PER_PACKET; segmentIndex++) {
    let segment = packet[segmentIndex] ?? [];
    segment = SEGMENT_ENCODING.decode(segment);
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
const getStreamHeaderBits = name => {
  const header = STREAM_HEADERS[name];
  if(!header) return [];
  const { index, length } = header;
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
  const bits = getStreamHeaderBits(name);
  return bitsToInt(bits, length);
}
