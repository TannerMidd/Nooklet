/**
 * Streaming CRC-32 (IEEE 802.3, the polynomial yEnc declares in
 * `crc32=`/`pcrc32=` trailers). Table-based, allocation-free per update.
 */

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let value = n;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[n] = value >>> 0;
  }

  return table;
})();

export function crc32(data: Uint8Array, seed = 0xffffffff): number {
  let crc = seed >>> 0;

  for (let index = 0; index < data.length; index += 1) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }

  return crc >>> 0;
}

/** Finalize a streamed CRC (xor-out step). */
export function crc32Final(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

/** One-shot convenience for whole buffers. */
export function crc32Of(data: Uint8Array): number {
  return crc32Final(crc32(data));
}
