import { bitsToBytes, bitsToInt, numberToBits, numberToBytes, numberToHex } from "./converters";
import * as CRC from './CRC';

let SEGMENT_DURATION = 30;
let PACKET_SIZE_BITS = 8;
let DATA_SIZE_BITS = 8;
let DATA_SIZE_CRC_BITS = 8;
let DATA_CRC_BITS = 8;
let BITS_PER_SEGMENT = 1;
let PACKET_ENCODING = false;
let PACKET_ENCODING_SIZE = 7;
let PACKET_DECODING_SIZE = 4;
let ENCODING;
let PACKET_CRC_BIT_COUNT = 0;
let PACKET_SEQUENCE_NUMBER_BIT_COUNT = 0;

export const changeConfiguration = (config) => {
  const {
    segmentDurationMilliseconds,
    packetSizeBitCount,
    dataSizeBitCount,
    dataSizeCrcBitCount,
    dataCrcBitCount,
    bitsPerSegment,
    packetEncoding,
    packetEncodingBitCount,
    packetDecodingBitCount,
    packetSequenceNumberBitCount,
    packetCrcBitCount
  } = config;
  SEGMENT_DURATION = segmentDurationMilliseconds;
  PACKET_SIZE_BITS = packetSizeBitCount;
  DATA_SIZE_BITS = dataSizeBitCount;
  DATA_SIZE_CRC_BITS = dataSizeCrcBitCount;
  DATA_CRC_BITS = dataCrcBitCount;
  BITS_PER_SEGMENT = bitsPerSegment;
  PACKET_ENCODING = packetEncoding;
  PACKET_ENCODING_SIZE = packetEncodingBitCount;
  PACKET_DECODING_SIZE = packetDecodingBitCount;
  PACKET_CRC_BIT_COUNT = packetCrcBitCount;
  PACKET_SEQUENCE_NUMBER_BIT_COUNT = packetSequenceNumberBitCount;
}
export const setEncoding = (encoding) => {
  ENCODING = encoding;
}
const encodePacket = (packetBits) => isPacketEncoded() ? ENCODING.encode(packetBits) : packetBits;
const decodePacket = (packetBits) => isPacketEncoded() ? ENCODING.decode(packetBits) : packetBits;
export const getSegmentDurationMilliseconds = () => SEGMENT_DURATION;
export const getPacketMaxByteCount = () => 2 ** PACKET_SIZE_BITS;
export const getDataMaxByteCount = () => 2 ** DATA_SIZE_BITS;
export const getBitsPerSegment = () => BITS_PER_SEGMENT;
export const isPacketEncoded = () => PACKET_ENCODING;
export const packetEncodingBlockSize = () => isPacketEncoded() ? PACKET_ENCODING_SIZE : 0;
export const packetDecodingBlockSize = () => isPacketEncoded() ? PACKET_DECODING_SIZE : 0;
export const getPacketEncodedBitCount = () => {
  if(isPacketEncoded()) return getPacketEncodingBlockCount() * PACKET_DECODING_SIZE;
  return getPacketMaxBitCount();
}
export const getPacketDataByteCount = () => {
  const availableBitCount = getPacketEncodedBitCount() - getPacketHeaderBitCount();
  // We only transfer full bytes within packets
  return Math.floor(availableBitCount / 8);
}
export const getPacketDataBitCount = () => getPacketDataByteCount() * 8;
export function fromByteCountGetPacketLastUnusedBitCount(byteCount) {
  const bitCount = byteCount * 8;
  const availableBits = getPacketMaxBitCount();
  const dataBitsPerPacket = getPacketDataBitCount();

  let bitsInLastPacket = bitCount % dataBitsPerPacket;
  let usedBits = bitsInLastPacket + getPacketHeaderBitCount() ;
  if(isPacketEncoded()) {
    const blocks = Math.ceil(usedBits / packetDecodingBlockSize())
    usedBits = blocks * packetEncodingBlockSize();
  }
  return availableBits - usedBits;
}
export function getPacketLastSegmentUnusedBitCount() {
  return (BITS_PER_SEGMENT - (getPacketMaxBitCount() % BITS_PER_SEGMENT));
}
export const getBaud = () => {
  return Math.floor(getBitsPerSegment() / getSegmentDurationSeconds());
}
export const getEffectiveBaud = () => {
  return Math.floor(getPacketDataBitCount() / getPacketDurationSeconds());
}
export const getEncodedPacketDataBitCount = () => {
  return isPacketEncoded() ? getPacketEncodingBitCount() : 0;
}
export const getPacketUsedBitCount = () => 
  isPacketEncoded() ? getPacketEncodingBitCount() : getPacketMaxBitCount();
export const getPacketUnusedBitCount = () => getPacketMaxBitCount() - getPacketUsedBitCount();
export const getMaxPackets = () =>
  Math.ceil((getDataMaxByteCount() * 8) / getPacketUsedBitCount());
export const getMaxDurationMilliseconds = () => getMaxPackets() * getPacketDurationMilliseconds();
export const getPacketEncodingBitCount = () => getPacketEncodingBlockCount() * packetEncodingBlockSize();
export const canSendPacket = () => {
  let maxBits = getPacketMaxBitCount();
  // Need to be able to send at least 1 data bit with each packet
  if(maxBits - getPacketHeaderBitCount() < 1) return false;
  // Make sure we have enough encoding blocks within a packet
  return isPacketEncoded() ? maxBits >= packetEncodingBlockSize() : true;
}
export const getPacketEncodingBlockCount = () =>
  isPacketEncoded() ? Math.floor(getPacketMaxBitCount() / packetEncodingBlockSize()) : 0;
export const getPacketizationHeaderBitCount = () => DATA_SIZE_BITS + DATA_SIZE_CRC_BITS + DATA_CRC_BITS;
export const getPacketizationBitCountFromBitCount = (bitCount) => bitCount + getPacketizationHeaderBitCount();
export const getPacketizationBitCountFromByteCount = (byteCount) =>
  getPacketizationBitCountFromBitCount(byteCount * 8);
export const getPacketizationByteCountFromByteCount = (byteCount) =>
  Math.ceil(getPacketizationBitCountFromByteCount(byteCount) / 8);

export const getPacketizationByteCountFromBitCount = bitCount =>
  Math.ceil(getPacketizationBitCountFromBitCount(bitCount) / 8);

export const getDataTransferDurationMillisecondsFromByteCount = (byteCount) =>
  getDataTransferDurationMilliseconds(getPacketizationBitCountFromByteCount(byteCount));
export const getDataTransferDurationSeconds = (bitCount) =>
  getDataTransferDurationMilliseconds(bitCount) / 1000;
export const packetStats = byteCount => {
  const bitCount = byteCount * 8;
  const packetCount = getPacketCount(bitCount);
  return ({
    packetCount,
    sampleCount: packetCount * getPacketSegmentCount(),
    durationMilliseconds: packetCount * getPacketDurationMilliseconds(),
    totalBitCount: packetCount * getPacketMaxBitCount(),
  });
};
export const getPacketCount = (bitCount) => 
  canSendPacket() ? Math.ceil(bitCount / getPacketEncodedBitCount()) : 0;
export const getDataTransferDurationMilliseconds = (bitCount) => 
  getPacketCount(bitCount) * getPacketDurationMilliseconds();
export const getPacketDurationSeconds = () => getPacketDurationMilliseconds() / 1000;
export const getSegmentDurationSeconds = () => getSegmentDurationMilliseconds() / 1000;
export const getPacketMaxBitCount = () => getPacketMaxByteCount() * 8;
export const getPacketSegmentCount = () => Math.ceil(getPacketMaxBitCount() / getBitsPerSegment());
export const getPacketDurationMilliseconds = () => 
  getPacketSegmentCount() * getSegmentDurationMilliseconds();
export const getPacketIndex = (transferStartedMilliseconds, time) =>
  Math.floor((time - transferStartedMilliseconds) / getPacketDurationMilliseconds());

export function getPacketSegmentIndex(transferStartedMilliseconds, time) {
  return getTranserSegmentIndex(transferStartedMilliseconds, time) % getPacketSegmentCount();
}
export function getTranserSegmentIndex(transferStartedMilliseconds, time) {
  const transferMs = time - transferStartedMilliseconds;
  const segmentMs = getSegmentDurationMilliseconds();
  return Math.floor(transferMs / segmentMs);
}
export function getPacketSegmentStartMilliseconds(transferStartedMilliseconds, packetIndex, segmentIndex) {
  const packetStart = getPacketStartMilliseconds(transferStartedMilliseconds, packetIndex);
  const segmentOffset = segmentIndex * getSegmentDurationMilliseconds();
  return packetStart + segmentOffset;
}
export function getPacketStartMilliseconds(transferStartedMilliseconds, packetIndex) {
  if(packetIndex < 0) return 0;
  if(packetIndex === 0) return transferStartedMilliseconds;
  return transferStartedMilliseconds + (packetIndex * getPacketDurationMilliseconds());
}
export function getPacketSegmentEndMilliseconds(transferStartedMilliseconds, packetIndex, segmentIndex) {
  return getPacketSegmentStartMilliseconds(transferStartedMilliseconds, packetIndex, segmentIndex + 1) - 0.1;
}
export const getPacketHeaderUnusedBitCount = () => 8 - (getPacketHeaderBitCount(false) % 8);
export const getPacketHeaderBitCount = (padAsBytes = true) => {
  const bitCount = PACKET_CRC_BIT_COUNT +
    PACKET_SEQUENCE_NUMBER_BIT_COUNT +
    PACKET_SIZE_BITS;
  if(padAsBytes && bitCount % 8 !== 0) {
    return bitCount + (8 - (bitCount % 8))
  }
  return bitCount;
}
export const pack = (bits) => ({
  getBits: (packetIndex) => {
    // Returns a packet in the following order:
    // - [CRC]
    // - [Sequence Number]
    // - Data Length
    // - [Unused Bits (% 8 padding)]
    // - Data
    if(!canSendPacket()) return [];
  
    // How many data bits will be in our packet?
    let dataBitCount = getPacketDataBitCount();

    // grab our data
    const startIndex = packetIndex * dataBitCount;
    const endIndex = startIndex + dataBitCount;
    let packetBits = bits.slice(startIndex, endIndex);

    // add our headers
    const unusedBits = new Array(getPacketHeaderUnusedBitCount()).fill(0);

    // data byte count
    let byteCount = Math.ceil(packetBits.length / 8);
    const dataLengthBits = numberToBits(byteCount, PACKET_SIZE_BITS);
    let sequenceNumberBits = [];
    // sequence number
    if(PACKET_SEQUENCE_NUMBER_BIT_COUNT !== 0) {
      sequenceNumberBits = numberToBits(packetIndex, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
      if(packetIndex < 3)
        console.log('write sequence %s', packetIndex, packetIndex.toString(2));
    }

    const headerBits = [
      ...sequenceNumberBits,
      ...dataLengthBits,
      ...unusedBits
    ]

    if(PACKET_CRC_BIT_COUNT !== 0) {
      // convert to bytes
      const bytes = bitsToBytes([...headerBits, ...packetBits]);
      const crc = CRC.check(bytes, PACKET_CRC_BIT_COUNT);
      const crcBits = numberToBits(crc, PACKET_CRC_BIT_COUNT);
      if(packetIndex < 3)
      console.log('write packet %s crc 0b%s', packetIndex, crc.toString(2));

      // CRC must be first
      headerBits.unshift(...crcBits);
    }
    packetBits.unshift(...headerBits);

    if(packetIndex < 3) {
      console.log('WRITE packet %s bits', packetIndex, packetBits.slice(0, 20).join(''));
    }
    // encode our packet
    const encodedBits = encodePacket(packetBits);
    return encodedBits;
  }
});

export const unpack = (bits) => ({
  getPacketFromBits: (packetBits, packetIndex) => {
    const unpacked = {
      crc: CRC.INVALID,
      actualCrc: CRC.INVALID,
      packetIndex,
      sequence: -1,
      bytes: [],
      size: -1
    };
    if(packetBits.length === 0) return unpacked;

    // Remove the extra bits not used by the packet
    packetBits = packetBits.slice(0, getPacketMaxBitCount());

    // Remove extra bits not used by encoding
    if(isPacketEncoded()) {
      packetBits.splice(0, getPacketEncodedBitCount());
      packetBits = decodePacket(packetBits);
    }
    if(packetIndex < 3) {
      console.log('READ packet %s bits', packetIndex, packetBits.slice(0, 20).join(''));
    }
    const extraHeaderBitCount = getPacketHeaderUnusedBitCount();
    const headerBitCount = getPacketHeaderBitCount();

    // Detect data size
    const sizeBits = packetBits.slice(PACKET_CRC_BIT_COUNT + PACKET_SEQUENCE_NUMBER_BIT_COUNT, PACKET_SIZE_BITS);
    const dataSizeByteCount = numberToBytes(sizeBits, PACKET_SIZE_BITS);
    unpacked.size = dataSizeByteCount

    // Process CRC header FIRST (ensures all other headers are valid)
    if(PACKET_CRC_BIT_COUNT !== 0) {
      const crcBits = packetBits.slice(0, PACKET_CRC_BIT_COUNT);
      const expectedCrc = bitsToInt(crcBits, PACKET_CRC_BIT_COUNT);
      if(packetIndex < 3) {
        console.log('read packet %s crc', packetIndex, numberToHex(PACKET_CRC_BIT_COUNT)(expectedCrc))
      }
      unpacked.crc = expectedCrc;

      // Run CRC on all bits except CRC header
      const crcLength = (headerBitCount - PACKET_CRC_BIT_COUNT) + (dataSizeByteCount * 8);
      const crcCopy = packetBits.slice(PACKET_CRC_BIT_COUNT, crcLength);

      // check the crc is valid
      const bytes = bitsToBytes(crcCopy);
      unpacked.actualCrc = CRC.check(bytes, PACKET_CRC_BIT_COUNT);

      // remove CRC header
      packetBits.splice(0, PACKET_CRC_BIT_COUNT);
    }

    // Process sequence header
    if(PACKET_SEQUENCE_NUMBER_BIT_COUNT === 0) {
      unpacked.sequence = packetIndex;
    } else {
      const sequenceBits = packetBits.slice(0, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
      const sequence = bitsToInt(sequenceBits, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
      if(packetIndex < 3)
      console.log('read packetIndex %s as sequence %s', packetIndex, sequence, sequenceBits.join(''))
      unpacked.sequence = sequence;
      // remove sequence number header
      packetBits.splice(0, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
    }
  
    // Remove packet size header
    packetBits.splice(0, PACKET_SIZE_BITS);

    // remove unused header bits
    if(extraHeaderBitCount !== 0) packetBits.splice(0, extraHeaderBitCount);

    // Reduce remaining data to proper size
    packetBits.splice(0, unpacked.size * 8);

    // convert to bytes
    unpacked.bytes = bitsToBytes(packetBits);

    return unpacked;
  },
  getPacket: (packetIndex) => {
    const unpacked = {
      crc: CRC.INVALID,
      actualCrc: CRC.INVALID,
      sequence: -1,
      bytes: [],
      size: -1
    };

    if(!canSendPacket()) return unpacked;

    // Get bits associated with the packet
    const packetBitCount = getPacketSegmentCount() + BITS_PER_SEGMENT;
    const offset = packetIndex * packetBitCount;
    const packetBits = bits.slice(offset, offset + packetBitCount);

    if(packetBits.length === 0) return unpacked;

    return this.getPacketFromBits(packetBits, packetIndex);

  }
});