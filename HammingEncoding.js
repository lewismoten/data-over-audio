// Encoding to encode/decode data with Hamming Error Correction
export const DECODED_SIZE = 4;
export const ENCODED_SIZE = 7;

export const blockSize = () => ({
  encoded: ENCODED_SIZE,
  decoded: DECODED_SIZE
});

export const encode = (bits) => {
  const encodedBits = [];
  for(let i = 0; i < bits.length; i+= DECODED_SIZE) {
    const block = bits.slice(i, i + DECODED_SIZE);
    encodedBits.push(...encodeBlock(block));
  }
  return encodedBits;
}
export const decode = bits => {
  const decodedBits = [];
  for(let i = 0; i < bits.length; i += ENCODED_SIZE) {
    const block = bits.slice(i, i + ENCODED_SIZE);
    decodedBits.push(...decodeBlock(block));
  }
  return decodedBits;
}

const encodeBlock = ([a = 0, b = 0, c = 0, d = 0]) => {
  // embed parity bits
  return [
    a ^ b ^ d,
    a ^ c ^ d,
    a,
    b ^ c ^ d,
    b,
    c,
    d
  ]
}

const decodeBlock = ([
  p0 = 0,
  p1 = 0,
  a = 0,
  p2 = 0,
  b = 0,
  c = 0,
  d = 0
]) => {
  // check parity bits
  const e0 = p0 ^ a ^ b ^ d;
  const e1 = p1 ^ a ^ c ^ d;
  const e2 = p2 ^ b ^ c ^ d;
  let error = (e2 << 2) | (e1 << 1) | e0;
  // flip the bit
  switch(error) {
    case 0b011: a ^= 1; break;
    case 0b101: b ^= 1; break;
    case 0b110: c ^= 1; break;
    case 0b111: d ^= 1; break;
    default: break;
  }
  return [a, b, c, d];
}