let SEGMENT_DURATION = 30;
let PACKET_SIZE_BITS = 8;
let DATA_SIZE_BITS = 8;
let DATA_SIZE_CRC_BITS = 8;
let BITS_PER_SEGMENT = 1;
let PACKET_ENCODING = false;
let PACKET_ENCODING_SIZE = 7;
let PACKET_DECODING_SIZE = 4;
let ENCODING;

export const changeConfiguration = (config) => {
  const {
    segmentDurationMilliseconds,
    packetSizeBitCount,
    dataSizeBitCount,
    dataSizeCrcBitCount,
    bitsPerSegment,
    packetEncoding,
    packetEncodingBitCount,
    packetDecodingBitCount
  } = config;
  SEGMENT_DURATION = segmentDurationMilliseconds;
  PACKET_SIZE_BITS = packetSizeBitCount;
  DATA_SIZE_BITS = dataSizeBitCount;
  DATA_SIZE_CRC_BITS = dataSizeCrcBitCount;
  BITS_PER_SEGMENT = bitsPerSegment;
  PACKET_ENCODING = packetEncoding;
  PACKET_ENCODING_SIZE = packetEncodingBitCount;
  PACKET_DECODING_SIZE = packetDecodingBitCount;
}
export const setEncoding = (encoding) => {
  ENCODING = encoding;
}
const encodePacket = (bits) => ENCODING.encode(bits);
export const getSegmentDurationMilliseconds = () => SEGMENT_DURATION;
export const getPacketMaxByteCount = () => 2 ** PACKET_SIZE_BITS;
export const getDataMaxByteCount = () => 2 ** DATA_SIZE_BITS;
export const getBitsPerSegment = () => BITS_PER_SEGMENT;
export const isPacketEncoded = () => PACKET_ENCODING;
export const packetEncodingBlockSize = () => isPacketEncoded() ? PACKET_ENCODING_SIZE : 0;
export const packetDecodingBlockSize = () => isPacketEncoded() ? PACKET_DECODING_SIZE : 0;
export const getPacketDataBitCount = () => {
  if(isPacketEncoded()) return getPacketEncodingBlockCount() * PACKET_DECODING_SIZE;
  return getPacketMaxBitCount();
}
export function fromByteCountGetPacketLastUnusedBitCount(byteCount) {
  const bitCount = byteCount * 8;
  const availableBits = getPacketMaxBitCount();
  const dataBitsPerPacket = getPacketDataBitCount();
  let bitsInLastPacket = bitCount % dataBitsPerPacket;
  let usedBits = bitsInLastPacket;
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
  const maxBits = getPacketMaxBitCount();
  if(maxBits < 1) return false;
  return isPacketEncoded() ? maxBits >= packetEncodingBlockSize() : true;
}
export const getPacketEncodingBlockCount = () =>
  isPacketEncoded() ? Math.floor(getPacketMaxBitCount() / packetEncodingBlockSize()) : 0;
export const getPacketizationHeaderBitCount = () => DATA_SIZE_BITS + DATA_SIZE_CRC_BITS;
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
export const getPacketCount = (bitCount) => 
  canSendPacket() ? Math.ceil(bitCount / getPacketDataBitCount()) : 0;
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

export function getPacketUsedBits(bits, packetIndex) {
  if(!canSendPacket()) return [];

  // How many data bits will be in our packet?
  const dataBitCount = getPacketDataBitCount();

  // grab our data
  const startIndex = packetIndex * dataBitCount;
  const endIndex = startIndex + dataBitCount;
  let packetBits = bits.slice(startIndex, endIndex);

  return isPacketEncoded() ? encodePacket(packetBits) : packetBits;
}
export const getPacketBits = (bits, packetIndex) => 
  canSendPacket() ? getPacketUsedBits(bits, packetIndex) : [];

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
