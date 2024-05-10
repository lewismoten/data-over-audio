// InterleaverEncoding

// Rolls / shifts elements of an array so that each
// block of N data elements contains the minimal
// amount of original data possible.
// Elements toward the end of an array are wrapped
// around to the beginning

// This is primarily used for data transfer where
// multiple channels representing various bits in
// the same block may be subsceptable to noise and
// provide the wrong value for one or more bits in
// a block

let BLOCK_SIZE = 1;

export const blockSize = () => ({
  encoded: BLOCK_SIZE,
  decoded: BLOCK_SIZE
});

export const changeConfiguration = ({
  blockSize
}) => {
  BLOCK_SIZE = blockSize ?? 1;
}

export const decode = bits => encode(bits, true);

export const encode = (bits, undo = false) => {
  // Block sizes of 1 or less are unable to move bits
  if(BLOCK_SIZE <= 1) return bits;

  // We need at least 1 extra bit for one bit to escape the block
  if(bits.length <= BLOCK_SIZE ) return bits;

  // loop through indexes of a block
  for(let blockMovement = 1; blockMovement < BLOCK_SIZE; blockMovement++) {
    // Move every N bit N blocks over...
    bits.filter((_, i) =>
      // values to be moved to different blocks
      i % BLOCK_SIZE === blockMovement
    ).map((_,i,a) => {
      // values moved N blocks
      if(undo) i -= blockMovement; else i += blockMovement;
      i = ((i % a.length) + a.length) % a.length;
      return a[i];
    }).forEach((v, i) => {
      // replace with new values
      bits[blockMovement + (i * BLOCK_SIZE)] = v;
    })
  };
  return bits;
}