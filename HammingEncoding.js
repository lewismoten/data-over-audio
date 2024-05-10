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

const encodeBlock = bits => {
  if(bits.length !== DECODED_SIZE) return [];
  return [
    bits[0] ^ bits[1] ^ bits[3],
    bits[0] ^ bits[2] ^ bits[3],
    bits[0],
    bits[1] ^ bits[2] ^ bits[3],
    bits[1],
    bits[2],
    bits[3]
  ]
}

const decodeBlock = bits => {
  if(bits.length !== ENCODED_SIZE) return [];
  const error_1 = bits[0] ^ bits[2] ^ bits[4] ^ bits[6];
  const error_2 = bits[1] ^ bits[2] ^ bits[5] ^ bits[6];
  const error_3 = bits[3] ^ bits[4] ^ bits[5] ^ bits[6];
  let error = (error_3 << 2) | (error_2 << 1) | error_1;
  if(error !== 0) bits[error - 1] ^= 1;
  return [
    bits[2],
    bits[4],
    bits[5],
    bits[6]
  ];
}