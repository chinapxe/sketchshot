const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export interface ZipEntryInput {
  name: string
  data: Uint8Array
  lastModified?: Date
}

export interface ZipEntryOutput {
  name: string
  data: Uint8Array
}

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_VERSION = 20
const ZIP_UTF8_FLAG = 0x0800
const ZIP_STORE_METHOD = 0

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff

  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function dateToDosTime(date: Date): number {
  const seconds = Math.floor(date.getSeconds() / 2)
  return ((date.getHours() & 0x1f) << 11)
    | ((date.getMinutes() & 0x3f) << 5)
    | (seconds & 0x1f)
}

function dateToDosDate(date: Date): number {
  const year = Math.max(date.getFullYear(), 1980)
  return (((year - 1980) & 0x7f) << 9)
    | (((date.getMonth() + 1) & 0x0f) << 5)
    | (date.getDate() & 0x1f)
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
}

function createLocalHeader(entry: {
  nameBytes: Uint8Array
  crc32: number
  dataLength: number
  lastModified: Date
}): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.length)
  const view = new DataView(header.buffer)

  writeUint32(view, 0, ZIP_LOCAL_FILE_HEADER_SIGNATURE)
  writeUint16(view, 4, ZIP_VERSION)
  writeUint16(view, 6, ZIP_UTF8_FLAG)
  writeUint16(view, 8, ZIP_STORE_METHOD)
  writeUint16(view, 10, dateToDosTime(entry.lastModified))
  writeUint16(view, 12, dateToDosDate(entry.lastModified))
  writeUint32(view, 14, entry.crc32)
  writeUint32(view, 18, entry.dataLength)
  writeUint32(view, 22, entry.dataLength)
  writeUint16(view, 26, entry.nameBytes.length)
  writeUint16(view, 28, 0)
  header.set(entry.nameBytes, 30)

  return header
}

function createCentralDirectoryHeader(entry: {
  nameBytes: Uint8Array
  crc32: number
  dataLength: number
  lastModified: Date
  localHeaderOffset: number
}): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.length)
  const view = new DataView(header.buffer)

  writeUint32(view, 0, ZIP_CENTRAL_DIRECTORY_SIGNATURE)
  writeUint16(view, 4, ZIP_VERSION)
  writeUint16(view, 6, ZIP_VERSION)
  writeUint16(view, 8, ZIP_UTF8_FLAG)
  writeUint16(view, 10, ZIP_STORE_METHOD)
  writeUint16(view, 12, dateToDosTime(entry.lastModified))
  writeUint16(view, 14, dateToDosDate(entry.lastModified))
  writeUint32(view, 16, entry.crc32)
  writeUint32(view, 20, entry.dataLength)
  writeUint32(view, 24, entry.dataLength)
  writeUint16(view, 28, entry.nameBytes.length)
  writeUint16(view, 30, 0)
  writeUint16(view, 32, 0)
  writeUint16(view, 34, 0)
  writeUint16(view, 36, 0)
  writeUint32(view, 38, 0)
  writeUint32(view, 42, entry.localHeaderOffset)
  header.set(entry.nameBytes, 46)

  return header
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)

  let offset = 0
  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })

  return merged
}

function toBlobPart(chunk: Uint8Array): ArrayBuffer {
  return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
}

export function createZipBlob(entries: ZipEntryInput[]): Blob {
  const fileParts: Uint8Array[] = []
  const centralDirectoryParts: Uint8Array[] = []
  let offset = 0

  entries.forEach((entryInput) => {
    const lastModified = entryInput.lastModified ?? new Date()
    const nameBytes = textEncoder.encode(entryInput.name)
    const crc32 = calculateCrc32(entryInput.data)
    const localHeader = createLocalHeader({
      nameBytes,
      crc32,
      dataLength: entryInput.data.length,
      lastModified,
    })

    fileParts.push(localHeader, entryInput.data)

    const centralDirectoryHeader = createCentralDirectoryHeader({
      nameBytes,
      crc32,
      dataLength: entryInput.data.length,
      lastModified,
      localHeaderOffset: offset,
    })
    centralDirectoryParts.push(centralDirectoryHeader)

    offset += localHeader.length + entryInput.data.length
  })

  const centralDirectory = concatUint8Arrays(centralDirectoryParts)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  writeUint32(endView, 0, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, entries.length)
  writeUint16(endView, 10, entries.length)
  writeUint32(endView, 12, centralDirectory.length)
  writeUint32(endView, 16, offset)
  writeUint16(endView, 20, 0)

  return new Blob(
    [...fileParts.map(toBlobPart), toBlobPart(centralDirectory), toBlobPart(endRecord)],
    {
      type: 'application/zip',
    }
  )
}

export function encodeTextFile(text: string): Uint8Array {
  return textEncoder.encode(text)
}

export function decodeTextFile(data: Uint8Array): string {
  return textDecoder.decode(data)
}

export function isZipData(data: Uint8Array): boolean {
  if (data.byteLength < 4) {
    return false
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return view.getUint32(0, true) === ZIP_LOCAL_FILE_HEADER_SIGNATURE
}

export function readZipEntries(data: Uint8Array): ZipEntryOutput[] {
  if (!isZipData(data)) {
    throw new Error('Invalid zip data')
  }

  const entries: ZipEntryOutput[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0

  while (offset + 4 <= data.byteLength) {
    const signature = view.getUint32(offset, true)

    if (
      signature === ZIP_CENTRAL_DIRECTORY_SIGNATURE
      || signature === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      break
    }

    if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error('Unsupported zip structure')
    }

    const compressionMethod = view.getUint16(offset + 8, true)
    if (compressionMethod !== ZIP_STORE_METHOD) {
      throw new Error('Only uncompressed zip entries are supported')
    }

    const fileNameLength = view.getUint16(offset + 26, true)
    const extraFieldLength = view.getUint16(offset + 28, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const fileNameStart = offset + 30
    const fileNameEnd = fileNameStart + fileNameLength
    const extraFieldEnd = fileNameEnd + extraFieldLength
    const dataStart = extraFieldEnd
    const dataEnd = dataStart + compressedSize

    if (dataEnd > data.byteLength) {
      throw new Error('Zip entry exceeds archive bounds')
    }

    entries.push({
      name: textDecoder.decode(data.slice(fileNameStart, fileNameEnd)),
      data: data.slice(dataStart, dataEnd),
    })

    offset = dataEnd
  }

  return entries
}
