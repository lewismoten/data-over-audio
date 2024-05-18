export const numberToBytes = (number, bitLength) => {
  const bytes = [];
  let byte = 0;
  for(let i = 0; i < bitLength; i++) {
    let bit = (number >> (bitLength - 1 - i)) & 1;
    byte = (byte << 1) | bit;
    if((i + 1) % 8 === 0 || i === bitLength - 1) {
      bytes.push(byte);
      byte = 0;
    }
  }
  return bytes;
}
export const numberToHex = (bitLength, prefix = '0x') => {
  const digits = Math.ceil(bitLength / 4);
  return (number) => prefix + Number(number).toString(16).padStart(digits, '0').toUpperCase();
}
export const numberToAscii = (number) => String.fromCharCode(clamp(Number(number), 0, 255));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function numberToBits(number, bitLength) {
  const bits = [];
  for(let i = bitLength - 1; i >= 0; i--)
    bits.push((number >> i) & 1);
  return bits;
}
export function bytesToNumber(bytes) {
  let number = 0;
  for(let i = 0; i < bytes.length; i++) {
    number += bytes[i] << (8 * i);
  }
  return number;
}
export function bytesToText(bytes) {
  if(!(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))) {
    bytes = new Uint8Array(bytes).buffer;
  }
  return new TextDecoder().decode(bytes);
}
export function bytesToBits(bytes) {
  if(ArrayBuffer.isView(bytes)) {
    bytes = Array.from(bytes);
  } 
  if(!Array.isArray(bytes)) return [];
  return bytes.reduce((bits, byte) => [
      ...bits, 
      ...byte.toString(2).padStart(8, '0').split('').map(Number)
    ], []);
}

export function textToBytes(text) {
  return new TextEncoder().encode(text);
}
export function textToBits(text) {
  return bytesToBits(textToBytes(text));
}

export function bitsToText(bits) {
  const bytes = new Uint8Array(bitsToBytes(bits));
  return bytesToText(bytes.buffer);
}
export function bitsToBytes(bits) {
  const bytes = [];
  for(let i = 0; i < bits.length; i+= 8) {
    bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  return bytes;
}
export const bitsToInt = (bits, bitLength) => {
  if(bits.length === 0) return 0;
  if(bitLength <= 0) return 0;
  return parseInt(bits
    // only grab the bits we need
    .slice(0, bitLength)
    // combine into string
    .join('')
    // Assume missing bits were zeros
    .padEnd(bitLength, '0'),
    2
  );
}
export const urlToBytes = src => {
  const xhr = new XMLHttpRequest();
  // we need a synchronous response.
  xhr.open('GET', src, false);
  xhr.overrideMimeType('text/plain; charset=x-user-defined');
  xhr.send(null);
  if(xhr.status !== 200) return [];
  let bytes = [];
  for(let i = 0; i < xhr.response.length; i++) {
    bytes.push(xhr.response.charCodeAt(i) & 0xFF);
  }
  return bytes;
}
export const bytesToUrl = bytes => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return URL.createObjectURL(blob);
}
export function htmlEncode(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}