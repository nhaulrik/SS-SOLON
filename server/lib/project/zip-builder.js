/**
 * server/lib/zip-builder.js
 *
 * Minimal ZIP archive builder.
 * Implements ZIP format (PKZIP spec) without compression (stored method).
 * Pure Buffer operations only — no external dependencies.
 */

/**
 * Build a minimal ZIP archive buffer from an array of { name, data: Buffer } entries.
 * Implements ZIP format (PKZIP spec) without compression (stored method).
 */
export function buildZipBuffer(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);  // signature
    localHeader.writeUInt16LE(20, 4);           // version needed
    localHeader.writeUInt16LE(0, 6);            // flags
    localHeader.writeUInt16LE(0, 8);            // compression: stored
    localHeader.writeUInt16LE(0, 10);           // mod time
    localHeader.writeUInt16LE(0, 12);           // mod date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(size, 18);        // compressed size
    localHeader.writeUInt32LE(size, 22);        // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);           // extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory header
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // signature
    centralHeader.writeUInt16LE(20, 4);           // version made by
    centralHeader.writeUInt16LE(20, 6);           // version needed
    centralHeader.writeUInt16LE(0, 8);            // flags
    centralHeader.writeUInt16LE(0, 10);           // compression: stored
    centralHeader.writeUInt16LE(0, 12);           // mod time
    centralHeader.writeUInt16LE(0, 14);           // mod date
    centralHeader.writeUInt32LE(crc, 16);         // CRC-32
    centralHeader.writeUInt32LE(size, 20);        // compressed size
    centralHeader.writeUInt32LE(size, 24);        // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30);           // extra field length
    centralHeader.writeUInt16LE(0, 32);           // comment length
    centralHeader.writeUInt16LE(0, 34);           // disk number start
    centralHeader.writeUInt16LE(0, 36);           // internal attrs
    centralHeader.writeUInt32LE(0, 38);           // external attrs
    centralHeader.writeUInt32LE(offset, 42);      // relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    localHeaders.push(localHeader, entry.data);
    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirOffset = offset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // signature
  eocd.writeUInt16LE(0, 4);                      // disk number
  eocd.writeUInt16LE(0, 6);                      // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);         // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralDirSize, 12);        // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);      // central dir offset
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Compute CRC-32 checksum of a Buffer.
 */
function crc32(buf) {
  const table = getCrc32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table = null;
function getCrc32Table() {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}
