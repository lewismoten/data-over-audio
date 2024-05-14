import { 
  bitsToBytes,
  bitsToInt,
  numberToBits,
  numberToBytes,
  numberToHex,
  bytesToBits
 } from "./converters";
import * as CRC from './CRC';

let SEGMENT_DURATION = 30;
let PACKET_SIZE_BITS = 8;
let DATA_SIZE_BITS = 8;
let DATA_SIZE_CRC_BITS = 8;
let DATA_CRC_BITS = 8;
let BITS_PER_SAMPLE = 1;
let IS_ENCODED = false;
let PACKET_ENCODED_BLOCK_SIZE = 1;
let PACKET_DECODED_BLOCK_SIZE = 1;
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
  BITS_PER_SAMPLE = bitsPerSegment;
  IS_ENCODED = packetEncoding;
  if(IS_ENCODED) {
    PACKET_ENCODED_BLOCK_SIZE = packetEncodingBitCount;
    PACKET_DECODED_BLOCK_SIZE = packetDecodingBitCount;
  } else {
    PACKET_ENCODED_BLOCK_SIZE = 1;
    PACKET_DECODED_BLOCK_SIZE = 1;
  }
  PACKET_CRC_BIT_COUNT = packetCrcBitCount;
  PACKET_SEQUENCE_NUMBER_BIT_COUNT = packetSequenceNumberBitCount;
}
export const setEncoding = (encoding) => {
  ENCODING = encoding;
}
const encodePacket = (packetBits) => IS_ENCODED ? ENCODING.encode(packetBits) : packetBits;
const decodePacket = (packetBits) => IS_ENCODED ? ENCODING.decode(packetBits) : packetBits;
export const getSegmentDurationMilliseconds = () => SEGMENT_DURATION;
export const getPacketMaxByteCount = () => 2 ** PACKET_SIZE_BITS;
export const getPacketMaxBitCount = () => (2 ** PACKET_SIZE_BITS) * 8;
export const getDataMaxByteCount = () => 2 ** DATA_SIZE_BITS;
export const getPacketEncodedBitCount = () => getPacketEncodingBlockCount() * PACKET_ENCODED_BLOCK_SIZE;
export const getPacketEncodingBlockCount = () =>
  IS_ENCODED ? Math.floor(getPacketMaxBitCount() / PACKET_ENCODED_BLOCK_SIZE) : getPacketMaxBitCount();

export const getPacketDataByteCount = () => {
  const availableBitCount = getPacketEncodedBitCount();
  const blocks = Math.floor(availableBitCount / PACKET_ENCODED_BLOCK_SIZE);
  let decodedBits = blocks * PACKET_DECODED_BLOCK_SIZE;
  decodedBits -= getPacketHeaderBitCount()
  // We only transfer full bytes within packets
  return Math.floor(decodedBits / 8);
}
export const getPacketDataBitCount = () => getPacketDataByteCount() * 8;
export function fromByteCountGetPacketLastUnusedBitCount(byteCount) {
  const bitCount = byteCount * 8;
  const availableBits = getPacketMaxBitCount();
  const dataBitsPerPacket = getPacketDataBitCount();

  let bitsInLastPacket = bitCount % dataBitsPerPacket;
  let usedBits = bitsInLastPacket + getPacketHeaderBitCount() ;
  if(IS_ENCODED) {
    const blocks = Math.ceil(usedBits / PACKET_DECODED_BLOCK_SIZE)
    usedBits = blocks * PACKET_ENCODED_BLOCK_SIZE;
  }
  return availableBits - usedBits;
}
export function getPacketLastSegmentUnusedBitCount() {
  return (BITS_PER_SAMPLE - (getPacketMaxBitCount() % BITS_PER_SAMPLE));
}
export const getBaud = () => {
  return Math.floor(BITS_PER_SAMPLE / getSegmentDurationSeconds());
}
export const getEffectiveBaud = () => {
  return Math.floor(getPacketDataBitCount() / getPacketDurationSeconds());
}
export const getEncodedPacketDataBitCount = () => {
  return IS_ENCODED ? getPacketEncodedBitCount() : 0;
}
export const getPacketUsedBitCount = () => 
  IS_ENCODED ? getPacketEncodedBitCount() : getPacketMaxBitCount();
export const getPacketUnusedBitCount = () => getPacketMaxBitCount() - getPacketUsedBitCount();
export const getMaxPackets = () =>
  Math.ceil((getDataMaxByteCount() * 8) / getPacketUsedBitCount());
export const getMaxDurationMilliseconds = () => getMaxPackets() * getPacketDurationMilliseconds();
export const canSendPacket = () => {
  let maxBits = getPacketMaxBitCount();
  // Need to be able to send at least 1 data bit with each packet
  if(maxBits - getPacketHeaderBitCount() < 1) return false;
  // Make sure we have enough encoding blocks within a packet
  return IS_ENCODED ? maxBits >= PACKET_ENCODED_BLOCK_SIZE : true;
}
export const getPacketizationHeaderBitCount = (padUnusedBits = true) => {
  let count = DATA_SIZE_BITS + DATA_SIZE_CRC_BITS + DATA_CRC_BITS;
  if(padUnusedBits && count % 8 !== 0) {
    count += 8 - (count % 8);
  }
  return count;
}
export const getPacketizationHeaderByteCount = () => getPacketizationHeaderBitCount() / 8;

export const getPacketizationHeaderUnusedBitCount = () => {
  return getPacketizationHeaderBitCount(true) - getPacketizationHeaderBitCount(false);
}
export const getPacketizationBitCountFromBitCount = (bitCount) => bitCount + getPacketizationHeaderBitCount();

export const packetStats = byteCount => {

  const byteCountWithHeaders = byteCount + getPacketizationHeaderByteCount();
  const packetCount = Math.ceil(byteCountWithHeaders / getPacketDataByteCount());
  const packetByteSize = (2 ** PACKET_SIZE_BITS);
  const samplesPerPacket = Math.ceil((packetByteSize * 8) / BITS_PER_SAMPLE)
  const packetDurationSeconds = (samplesPerPacket * SEGMENT_DURATION) / 1000;
  const samplePeriodCount = packetCount * samplesPerPacket;
  const transferBitCount = samplePeriodCount * BITS_PER_SAMPLE;
  return ({
    packetCount,
    samplePeriodCount, // to packet utils, these are "blocks"
    transferBitCount: transferBitCount,
    transferByteCount: Math.ceil(transferBitCount / 8),
    totalDurationSeconds: packetCount * packetDurationSeconds,
    packetDurationSeconds,
  });
};
const packetsNeededToTransferBytes = (byteCount) => 
  canSendPacket() ? Math.ceil(byteCount / getPacketDataByteCount()) : 0;
export const getDataTransferDurationMilliseconds = (bitCount) => 
  packetsNeededToTransferBytes(bitCount/8) * getPacketDurationMilliseconds();
export const getPacketDurationSeconds = () => getPacketDurationMilliseconds() / 1000;
export const getSegmentDurationSeconds = () => getSegmentDurationMilliseconds() / 1000;
export const getPacketSegmentCount = () => Math.ceil(getPacketMaxBitCount() / BITS_PER_SAMPLE);
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
export const pack = (bytes) => {

  const getHeaderBytes = () => {

    // packetization headers
    // data length
    let dataLengthBits = [];
    let dataLengthCrcBits = [];
    let dataSizeCrcNumber = 0;
    if(DATA_SIZE_BITS !== 0) {
      dataLengthBits = numberToBits(bytes.length, DATA_SIZE_BITS);
  
      // crc on data length
      if(DATA_SIZE_CRC_BITS !== 0) {
        const dataLengthBytes = bitsToBytes(dataLengthBits);
        dataSizeCrcNumber = CRC.check(dataLengthBytes, DATA_SIZE_CRC_BITS);
        dataLengthCrcBits = numberToBits(dataSizeCrcNumber, DATA_SIZE_CRC_BITS);
      }
    }
  
    // crc on data
    let dataCrcBits = [];
    let dataCrcNumber = 0;
    if(DATA_CRC_BITS !== 0) {
      dataCrcNumber = CRC.check(bytes, DATA_CRC_BITS);
      dataCrcBits = numberToBits(dataCrcNumber, DATA_CRC_BITS);
    } 
    const headers = [
      ...dataLengthBits,
      ...dataLengthCrcBits,
      ...dataCrcBits
    ];
    // pad headers to take full bytes
    while(headers.length % 8 !== 0) {
      headers.push(0);
    }

    const unusedBitCount = getPacketizationHeaderUnusedBitCount();
    headers.push(...new Array(unusedBitCount).fill(0));

    if(headers.length !== getPacketizationHeaderBitCount()) {
      throw new Error(`Malformed header. Expected ${getPacketizationHeaderBitCount()} bits. We have ${headers.length}`);
    }

    // prefix bits with headers
    return bitsToBytes(headers);
  }

  const bits = bytesToBits([...getHeaderBytes(), ...bytes]);

  return ({

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
    if(packetBits.length === 0) {
      throw new Error(`Attempted to send packet ${packetIndex}, but no data available.`)
    }
    if(packetBits.length % 8 !== 0) {
      throw new Error('Attempted to create a packet with extra bits.');
    }

    // data byte count
    let byteCount = Math.ceil(packetBits.length / 8);
    const dataLengthBits = numberToBits(byteCount, PACKET_SIZE_BITS);
    let sequenceNumberBits = [];
    // sequence number
    if(PACKET_SEQUENCE_NUMBER_BIT_COUNT !== 0) {
      sequenceNumberBits = numberToBits(packetIndex, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
    }

    // add our headers
    const headerBits = [
      ...sequenceNumberBits,
      ...dataLengthBits,
      ...new Array(getPacketHeaderUnusedBitCount()).fill(0)
    ]

    if(PACKET_CRC_BIT_COUNT !== 0) {
      // convert to bytes
      const crcCheckBits = [...headerBits, ...packetBits];
      const bytes = bitsToBytes(crcCheckBits);
      const crc = CRC.check(bytes, PACKET_CRC_BIT_COUNT);
      const crcBits = numberToBits(crc, PACKET_CRC_BIT_COUNT);
    
      // CRC must be first
      headerBits.unshift(...crcBits);
    }
    packetBits.unshift(...headerBits);

    // encode our packet
    const encodedBits = encodePacket(packetBits);
    if(encodedBits.length > 2 ** PACKET_SIZE_BITS * 8) {
      throw new Error(`Attempted to create packet exceeding ${2 ** PACKET_SIZE_BITS * 8} bits with ${encodedBits.length} bits.`);
    }
    return encodedBits;
  }
});
}

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
    if(IS_ENCODED) {
      packetBits.splice(getPacketEncodedBitCount());// before or after... i thik we need encoded. 144 is too small for 256 available
      packetBits = decodePacket(packetBits);
    }

    const headerBitCount = getPacketHeaderBitCount();

    // Get data size
    const sizeBits = packetBits.slice(
      PACKET_CRC_BIT_COUNT + PACKET_SEQUENCE_NUMBER_BIT_COUNT, 
      PACKET_CRC_BIT_COUNT + PACKET_SEQUENCE_NUMBER_BIT_COUNT + PACKET_SIZE_BITS
    );
    const dataSizeByteCount = bitsToInt(sizeBits, PACKET_SIZE_BITS);
    unpacked.size = dataSizeByteCount;

    // Get sequence number
    if(PACKET_SEQUENCE_NUMBER_BIT_COUNT === 0) {
      unpacked.sequence = packetIndex;
    } else {
      const sequenceBits = packetBits.slice(
        PACKET_CRC_BIT_COUNT,
        PACKET_CRC_BIT_COUNT + PACKET_SEQUENCE_NUMBER_BIT_COUNT
      );
      const sequence = bitsToInt(sequenceBits, PACKET_SEQUENCE_NUMBER_BIT_COUNT);
      unpacked.sequence = sequence;
    }

    // Get CRC Header
    if(PACKET_CRC_BIT_COUNT !== 0) {
      const crcBits = packetBits.slice(0, PACKET_CRC_BIT_COUNT);
      const expectedCrc = bitsToInt(crcBits, PACKET_CRC_BIT_COUNT);
      unpacked.crc = expectedCrc;

      // Run CRC on all bits except CRC header
      const bitCountToCheck = (headerBitCount - PACKET_CRC_BIT_COUNT) + (dataSizeByteCount * 8);
      const crcCopy = packetBits.slice(PACKET_CRC_BIT_COUNT, PACKET_CRC_BIT_COUNT + bitCountToCheck);

      // check the crc is valid
      const bytes = bitsToBytes(crcCopy);
      unpacked.actualCrc = CRC.check(bytes, PACKET_CRC_BIT_COUNT);
    }

    // Get data bits
    packetBits = packetBits.slice(headerBitCount, headerBitCount + unpacked.size * 8);

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
    const packetBitCount = getPacketSegmentCount() + BITS_PER_SAMPLE;
    const offset = packetIndex * packetBitCount;
    const packetBits = bits.slice(offset, offset + packetBitCount);

    if(packetBits.length === 0) return unpacked;

    return this.getPacketFromBits(packetBits, packetIndex);
  }
});