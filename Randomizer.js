const UNICODE_TEXT = [
  '\u0041', // Latin
  '\u0410', // Cyrillic
  '\u0391', // Greek
  '\u05D0', // Hebrew
  '\u0627', // Arabic
  '\u0905', // Devanagari
  '\u0E01', // Thai
  '\u3042', // Japanese Hiragana
  '\u30A2', // Japanese Katakana
  '\uAC00', // Korean Hangul
  '\u10D0', // Georgian
  '\u0531', // Armenian
  '\u4E00', // Chinese
  '\u0F40', // Tibetan
  '\u0985', // Bengali
  '\u0A85', // Gujarati
  '\u0A05', // Gurmukhi
  '\u0C85', // Kannada
  '\u1780', // Khmer
  '\u0E81', // Lao
  '\u0D05', // Malayalam
  '\u1000', // Myanmar
  '\u0D85', // Sinhala
  '\u0B85', // Tamil
  '\u0C05', // Telugu
  '\u1200', // Amharic
  '\u1000', // Burmese
  '\u0C85', // Kannada
  '\u0B05', // Oriya
  '\u0D85'  // Sinhala  
];
const UNICODE_EMOJI = [
  "\u{1F600}", "\u{1F601}", "\u{1F602}", "\u{1F923}", "\u{1F603}", "\u{1F604}", "\u{1F605}", "\u{1F606}",
  "\u{1F609}", "\u{1F60A}", "\u{1F60B}", "\u{1F60E}", "\u{1F60D}", "\u{1F618}", "\u{1F617}", "\u{1F619}",
  "\u{1F61A}", "\u{1F61B}", "\u{263A}", "\u{1F642}", "\u{1F60F}", "\u{1F60C}", "\u{1F61C}", "\u{1F61D}",
  "\u{1F61E}", "\u{1F61F}", "\u{1F612}", "\u{1F613}", "\u{1F614}", "\u{1F615}", "\u{1F643}", "\u{1F610}",
  "\u{1F611}", "\u{1F636}", "\u{1F607}", "\u{1F60F}", "\u{1F623}", "\u{1F625}", "\u{1F62E}", "\u{1F62F}",
  "\u{1F62A}", "\u{1F62B}", "\u{1F634}", "\u{1F60D}", "\u{1F615}", "\u{1F625}", "\u{1F622}", "\u{1F62D}",
  "\u{1F631}", "\u{1F616}", "\u{1F623}", "\u{1F624}", "\u{1F630}", "\u{1F621}", "\u{1F620}", "\u{1F637}",
  "\u{1F912}", "\u{1F915}", "\u{1F922}", "\u{1F92A}", "\u{1F605}", "\u{1F624}", "\u{1F62C}", "\u{1F687}",
  "\u{1F636}", "\u{1F610}", "\u{1F611}", "\u{1F974}", "\u{1F612}", "\u{1F644}", "\u{1F913}", "\u{1F615}",
  "\u{1F62C}", "\u{1F636}", "\u{1F922}", "\u{1F927}", "\u{1F974}", "\u{1F975}", "\u{1F976}", "\u{1F92E}",
  "\u{1F927}", "\u{1F976}", "\u{1F925}", "\u{1F92F}", "\u{1F975}", "\u{1F976}", "\u{1F92E}", "\u{1F925}",
  "\u{1F924}", "\u{1F631}", "\u{1F634}", "\u{1F62C}", "\u{1F91E}", "\u{1F621}", "\u{1F608}", "\u{1F47F}",
  "\u{1F480}", "\u{1F47B}", "\u{1F47D}", "\u{1F916}", "\u{1F608}", "\u{1F47A}", "\u{1F479}", "\u{1F47C}",
  "\u{1F47E}", "\u{1F916}", "\u{1F4A9}", "\u{1F608}", "\u{1F4A4}", "\u{1F525}", "\u{1F4A3}", "\u{1F52E}",
  "\u{1F4A2}", "\u{1F4A1}", "\u{1F6A8}", "\u{1F3B6}", "\u{1F519}", "\u{1F5E8}", "\u{1F4F3}", "\u{1F4F1}",
  "\u{1F4F2}", "\u{1F514}", "\u{1F3A4}", "\u{1F4F9}", "\u{1F4F7}", "\u{1F4F8}", "\u{1F4F4}", "\u{1F4F6}",
  "\u{1F3AF}", "\u{1F4FD}", "\u{1F4FC}", "\u{1F4E5}"
];
const ASCII_CHARS = new Array(255)
  .fill(0)
  .map((_, code) => String.fromCharCode(code))
  .filter((_, code) => 
    // printable ascii
    (code >= 32 && code <= 126) ||
    // extended ascii (accented letters, currency, etc.)
    (code >= 160 && code <= 255)
);
const PRINTABLE_CHARS = [
  ...UNICODE_EMOJI,
  ...ASCII_CHARS,
  ...UNICODE_TEXT
];

function randomCharacter() {
  const index = Math.floor(Math.random() * PRINTABLE_CHARS.length);
  return PRINTABLE_CHARS[index];
}

export const text = (length) => new Array(length).fill(0).map(randomCharacter).join('');
