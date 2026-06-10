/**
 * Code 128 Barcode Generator
 * Generates barcode segments for rendering
 */

export interface BarcodeSegment {
  width: number;
  isBar: boolean;
}

// Code 128 character set (simplified for alphanumeric)
const CODE128_CHARS: { [key: string]: number[] } = {
  ' ': [2, 1, 2, 2, 2, 2], // Space
  '!': [2, 2, 2, 1, 2, 2],
  '"': [2, 2, 2, 2, 2, 1],
  '#': [1, 2, 1, 2, 2, 3],
  '$': [1, 2, 1, 3, 2, 2],
  '%': [1, 3, 1, 2, 2, 2],
  '&': [1, 2, 2, 2, 1, 3],
  "'": [1, 2, 2, 3, 1, 2],
  '(': [1, 3, 2, 2, 1, 2],
  ')': [2, 2, 1, 2, 1, 3],
  '*': [2, 2, 1, 3, 1, 2],
  '+': [2, 3, 1, 2, 1, 2],
  ',': [1, 1, 2, 2, 3, 2],
  '-': [1, 2, 2, 1, 3, 2],
  '.': [1, 2, 2, 2, 3, 1],
  '/': [1, 1, 3, 2, 2, 2],
  '0': [1, 1, 2, 3, 2, 2],
  '1': [1, 2, 2, 1, 2, 3],
  '2': [1, 2, 2, 3, 2, 1],
  '3': [1, 2, 1, 2, 2, 3],
  '4': [1, 2, 3, 2, 2, 1],
  '5': [1, 1, 3, 2, 2, 2],
  '6': [1, 3, 2, 2, 2, 1],
  '7': [2, 2, 1, 2, 2, 2],
  '8': [2, 3, 1, 2, 2, 1],
  '9': [2, 1, 2, 2, 2, 2],
  ':': [2, 2, 2, 1, 2, 2],
  ';': [2, 2, 2, 2, 2, 1],
  '<': [2, 1, 2, 1, 2, 3],
  '=': [2, 1, 2, 3, 2, 1],
  '>': [2, 3, 2, 1, 2, 1],
  '?': [2, 1, 3, 2, 1, 2],
  '@': [2, 3, 1, 2, 1, 2],
  'A': [3, 1, 2, 2, 1, 2],
  'B': [3, 2, 1, 2, 1, 2],
  'C': [3, 2, 2, 1, 1, 2],
  'D': [2, 1, 2, 1, 2, 2],
  'E': [2, 1, 2, 2, 1, 2],
  'F': [2, 2, 1, 2, 1, 2],
  'G': [1, 1, 1, 3, 2, 2],
  'H': [1, 3, 1, 1, 2, 2],
  'I': [1, 3, 1, 2, 2, 1],
  'J': [1, 1, 2, 2, 1, 3],
  'K': [1, 1, 2, 3, 1, 2],
  'L': [1, 2, 2, 1, 1, 3],
  'M': [1, 2, 1, 3, 1, 2],
  'N': [1, 1, 3, 1, 2, 2],
  'O': [1, 3, 3, 1, 2, 1],
  'P': [2, 1, 1, 2, 2, 2],
  'Q': [2, 3, 1, 1, 2, 2],
  'R': [2, 3, 1, 2, 2, 1],
  'S': [1, 1, 1, 2, 2, 3],
  'T': [1, 1, 2, 2, 2, 2],
  'U': [1, 2, 2, 2, 1, 2],
  'V': [3, 1, 2, 1, 2, 1],
  'W': [3, 1, 1, 2, 2, 1],
  'X': [3, 2, 1, 1, 2, 1],
  'Y': [3, 2, 1, 2, 1, 1],
  'Z': [3, 1, 2, 2, 1, 1],
  '[': [3, 1, 1, 1, 2, 2],
  '\\': [3, 1, 1, 2, 1, 2],
  ']': [3, 2, 1, 1, 1, 2],
  '^': [3, 2, 2, 1, 1, 1],
  '_': [2, 1, 2, 1, 2, 2],
  '`': [2, 1, 2, 2, 1, 2],
  'a': [2, 2, 1, 2, 1, 2],
  'b': [1, 1, 1, 2, 3, 2],
  'c': [1, 1, 2, 2, 2, 2],
  'd': [1, 2, 2, 2, 1, 2],
  'e': [1, 2, 1, 2, 2, 2],
  'f': [1, 2, 2, 1, 2, 2],
  'g': [1, 2, 2, 2, 2, 1],
  'h': [1, 1, 3, 2, 1, 1],
  'i': [1, 1, 1, 2, 2, 2],
  'j': [1, 1, 2, 2, 1, 2],
  'k': [1, 1, 2, 1, 2, 2],
  'l': [1, 1, 2, 2, 2, 1],
  'm': [1, 2, 1, 1, 2, 2],
  'n': [1, 2, 2, 1, 1, 2],
  'o': [1, 2, 2, 2, 1, 1],
  'p': [1, 1, 1, 2, 1, 3],
  'q': [1, 1, 2, 1, 1, 3],
  'r': [1, 1, 2, 3, 1, 1],
  's': [1, 3, 2, 1, 1, 1],
  't': [1, 1, 3, 1, 2, 1],
  'u': [1, 2, 1, 3, 1, 1],
  'v': [1, 2, 3, 1, 1, 1],
  'w': [3, 1, 1, 1, 2, 1],
  'x': [1, 1, 2, 1, 3, 1],
  'y': [1, 1, 2, 3, 1, 0],
  'z': [1, 3, 1, 1, 2, 1],
  '{': [1, 3, 1, 2, 1, 1],
  '|': [1, 1, 3, 1, 1, 2],
  '}': [1, 1, 3, 1, 2, 1],
  '~': [3, 1, 2, 1, 1, 1],
  'DEL': [3, 1, 1, 2, 1, 1],
};

/**
 * Generates Code 128 barcode segments for rendering
 * @param text - The text to encode
 * @returns Array of barcode segments with width and bar/space info
 */
export function buildCode128Segments(text: string): BarcodeSegment[] {
  const segments: BarcodeSegment[] = [];

  // Add start character (simplified - using Code B start)
  segments.push({ width: 2, isBar: true }); // Start B pattern simplified

  // Encode each character
  for (const char of text) {
    const pattern = CODE128_CHARS[char];
    if (!pattern) {
      // Unknown character - treat as space
      segments.push({ width: 2, isBar: true }, { width: 1, isBar: false });
      continue;
    }

    // Convert pattern to segments (each number represents width of bar/space)
    for (let i = 0; i < pattern.length; i++) {
      segments.push({
        width: pattern[i],
        isBar: i % 2 === 0 // Even indices are bars, odd are spaces
      });
    }
  }

  // Add stop character (simplified)
  segments.push({ width: 2, isBar: true }); // Stop pattern simplified

  return segments;
}
