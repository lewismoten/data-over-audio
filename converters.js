export const bitsToInt = (bits, bitLength) => {
  parseInt(bits
    // only grab the bits we need
    .slice(0, bitLength)
    // combine into string
    .join('')
    // Assume missing bits were zeros
    .padEnd(bitLength, '0')
  );
}
