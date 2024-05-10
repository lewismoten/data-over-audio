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
export function check(bytes, bitCount = 8) {
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