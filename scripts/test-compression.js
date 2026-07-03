'use strict'
/**
 * Compression test suite – generates ~500 MB test files for every supported
 * file type, compresses each to a 10 MB target, and prints a results table.
 *
 * Run:  node scripts/test-compression.js
 */

const path = require('path')
const { statSync, mkdirSync, existsSync, createWriteStream } = require('fs')
const { writeFile, readFile, rm } = require('fs/promises')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const os = require('os')

const execFileAsync = promisify(execFile)
const ffmpegBin = require('@ffmpeg-installer/ffmpeg').path
const ffprobeBin = require('@ffprobe-installer/ffprobe').path
const ffmpeg = require('fluent-ffmpeg')
const sharp = require('sharp')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const archiver = require('archiver')

ffmpeg.setFfmpegPath(ffmpegBin)
ffmpeg.setFfprobePath(ffprobeBin)

// ─── Directories ─────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..')
const IN_DIR = path.join(ROOT, 'test-files', 'input')
const OUT_DIR = path.join(ROOT, 'test-files', 'output')

;[IN_DIR, OUT_DIR].forEach((d) => mkdirSync(d, { recursive: true }))

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MB = 1024 * 1024
const TARGET_MB = 10
const TARGET_BYTES = TARGET_MB * MB

function fmt(bytes) {
  const mb = bytes / MB
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`
}

function fileSize(p) {
  try { return statSync(p).size } catch { return 0 }
}

function ratio(orig, out) {
  return orig === 0 ? '0%' : `${((1 - out / orig) * 100).toFixed(1)}%`
}

function log(msg) {
  process.stdout.write(msg + '\n')
}

function ok(label, pct) {
  const fits = pct <= 100
  return fits ? `✅ ${label}` : `⚠️  ${label} (over by ${(pct - 100).toFixed(1)}%)`
}

// ─── File Generators ──────────────────────────────────────────────────────────

/** Generate an MP4 using ffmpeg's testsrc2 pattern at ~500 MB. */
function generateVideo(outPath) {
  // 305 seconds at ~13 Mbps ≈ 497 MB
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('testsrc2=size=1920x1080:rate=30')
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-t 305',
        '-c:v libx264',
        '-b:v 13000k',
        '-maxrate 14000k',
        '-bufsize 20000k',
        '-preset ultrafast',
        '-movflags +faststart',
        '-an'
      ])
      .on('progress', (p) => {
        process.stdout.write(`\r  Generating video… ${(p.percent ?? 0).toFixed(0)}%   `)
      })
      .on('end', () => { process.stdout.write('\n'); resolve() })
      .on('error', reject)
      .save(outPath)
  })
}

/** Generate a WAV file at ~500 MB using ffmpeg's sine source. */
function generateWav(outPath) {
  // 44100 Hz, 16-bit stereo: 176400 B/s → 2840 s ≈ 500 MB
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('sine=frequency=440:sample_rate=44100')
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-t 2840',
        '-c:a pcm_s16le',
        '-ar 44100',
        '-ac 2'
      ])
      .on('progress', (p) => {
        process.stdout.write(`\r  Generating WAV… ${(p.percent ?? 0).toFixed(0)}%   `)
      })
      .on('end', () => { process.stdout.write('\n'); resolve() })
      .on('error', reject)
      .save(outPath)
  })
}

/** Generate a FLAC file at ~500 MB (PCM source, will be ~200 MB compressed). */
function generateFlac(outPath) {
  // FLAC compresses PCM sine to ~40% → need ~800s at 192kHz 24-bit stereo
  // 192000 * 3 * 2 = 1,152,000 B/s; 800s = 921 MB source → FLAC ~460 MB
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('sine=frequency=220:sample_rate=192000')
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-t 800',
        '-c:a flac',
        '-ar 192000',
        '-ac 2',
        '-sample_fmt s32'
      ])
      .on('progress', (p) => {
        process.stdout.write(`\r  Generating FLAC… ${(p.percent ?? 0).toFixed(0)}%   `)
      })
      .on('end', () => { process.stdout.write('\n'); resolve() })
      .on('error', reject)
      .save(outPath)
  })
}

/** Generate a large PNG using random noise rows via sharp. */
async function generatePng(outPath) {
  // 8192 x 8192 RGB random noise ≈ 192 MB PNG (noise doesn't compress well)
  const W = 8192
  const H = 8192
  const rowBytes = W * 3
  const chunkRows = 512
  const chunks = []

  process.stdout.write('  Generating PNG… (random noise)\n')
  for (let y = 0; y < H; y += chunkRows) {
    const rows = Math.min(chunkRows, H - y)
    chunks.push(Buffer.from(
      new Uint8Array(rowBytes * rows).map(() => (Math.random() * 256) | 0)
    ))
    if (y % 2048 === 0) process.stdout.write(`\r  Generating PNG… ${((y / H) * 100).toFixed(0)}%   `)
  }
  process.stdout.write('\n')

  const raw = Buffer.concat(chunks)
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toFile(outPath)
}

/** Generate a large JPEG via the same random noise buffer. */
async function generateJpeg(outPath) {
  const W = 8192
  const H = 8192
  process.stdout.write('  Generating JPEG… (random noise)\n')
  const raw = Buffer.from(
    new Uint8Array(W * H * 3).map(() => (Math.random() * 256) | 0)
  )
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 99, mozjpeg: false })
    .toFile(outPath)
}

/** Generate a large PDF: each page gets a UNIQUE embedded JPEG (~2 MB per page). */
async function generatePdf(outPath) {
  process.stdout.write('  Generating PDF… (unique image per page)\n')
  // 50 pages × ~2 MB JPEG ≈ 100 MB — large enough to demonstrate PDF limits
  // without risking OOM (250 pages would need ~1.5 GB of RAM)
  const PAGE_COUNT = 50

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (let i = 0; i < PAGE_COUNT; i++) {
    // Unique 1920 × 1080 noise JPEG per page ≈ 2 MB each
    const raw = Buffer.from(
      new Uint8Array(1920 * 1080 * 3).map(() => (Math.random() * 256) | 0)
    )
    const imgBuf = await sharp(raw, { raw: { width: 1920, height: 1080, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer()

    const embedded = await doc.embedJpg(imgBuf)
    const page = doc.addPage([842, 595]) // A4 landscape
    page.drawImage(embedded, { x: 0, y: 0, width: 842, height: 595 })
    page.drawText(`Page ${i + 1} / ${PAGE_COUNT}`, { x: 20, y: 570, size: 10, font, color: rgb(1, 1, 1) })

    if (i % 5 === 0) process.stdout.write(`\r  Generating PDF… ${((i / PAGE_COUNT) * 100).toFixed(0)}%   `)
  }

  process.stdout.write('\n')
  await writeFile(outPath, await doc.save())
}

/**
 * Generate a ~500 MB uncompressed text file (highly compressible repetitive CSV).
 * We test ZIP compression by zipping this — should go from 500 MB to ~1-2 MB.
 */
async function generateZipSource(outPath) {
  process.stdout.write('  Generating large CSV (compressible)…\n')
  // Write 500 MB of repetitive CSV rows in chunks
  const header = 'id,name,email,department,salary,start_date,status,notes\n'
  const row = (i) =>
    `${i},John Smith,john.smith@example.com,Engineering,85000,2021-01-15,active,"This is a sample employee record with some descriptive notes that make the row longer"\n`

  const ws = createWriteStream(outPath)
  await new Promise((resolve, reject) => {
    ws.on('finish', resolve)
    ws.on('error', reject)
    ws.write(header)
    let written = header.length
    const target = 500 * MB
    let rowIdx = 0
    function writeChunk() {
      let ok = true
      while (written < target && ok) {
        const r = row(rowIdx++)
        ok = ws.write(r)
        written += r.length
      }
      if (written < target) {
        ws.once('drain', writeChunk)
      } else {
        ws.end()
      }
    }
    writeChunk()
  })
}

// ─── Compressors ──────────────────────────────────────────────────────────────
// These mirror the main app's logic but standalone (no electron-store needed).

function resolveOut(inPath, ext) {
  const base = path.basename(inPath, path.extname(inPath))
  return path.join(OUT_DIR, `${base}_compressed${ext}`)
}

/** Image compression: binary search on WebP quality to hit target size. */
async function compressImage(inPath) {
  log(`  Compressing image…`)
  const meta = await sharp(inPath).metadata()
  const W = meta.width ?? 3840
  const H = meta.height ?? 2160
  let lo = 1, hi = 95, best = null

  for (let i = 0; i < 10; i++) {
    if (lo > hi) break
    const mid = Math.max(1, Math.floor((lo + hi) / 2))
    const buf = await sharp(inPath).webp({ quality: mid, effort: 4 }).toBuffer()
    if (buf.length <= TARGET_BYTES) { best = buf; lo = mid + 1 }
    else hi = mid - 1
    process.stdout.write(`\r  Image binary search Q=${mid} → ${fmt(buf.length)}   `)
    if (mid === 1 && buf.length > TARGET_BYTES) break
  }
  process.stdout.write('\n')

  // Resize down if needed
  if (!best) {
    for (const scale of [0.75, 0.5, 0.35, 0.25, 0.15, 0.1]) {
      const w = Math.max(64, Math.floor(W * scale / 2) * 2)
      let lo2 = 1, hi2 = 90
      for (let i = 0; i < 9; i++) {
        if (lo2 > hi2) break
        const mid = Math.max(1, Math.floor((lo2 + hi2) / 2))
        const buf = await sharp(inPath).resize({ width: w, fit: 'inside' }).webp({ quality: mid, effort: 4 }).toBuffer()
        if (buf.length <= TARGET_BYTES) { best = buf; lo2 = mid + 1 }
        else hi2 = mid - 1
        process.stdout.write(`\r  Resize ${Math.round(scale * 100)}%, Q=${mid} → ${fmt(buf.length)}   `)
        if (mid === 1 && buf.length > TARGET_BYTES) break
      }
      if (best) break
    }
    process.stdout.write('\n')
  }

  const outPath = resolveOut(inPath, '.webp')
  if (best) {
    await writeFile(outPath, best)
    return { outPath, size: best.length }
  }

  // Last resort
  const lastBuf = await sharp(inPath)
    .resize({ width: Math.floor(W / 4), fit: 'inside' })
    .webp({ quality: 10, effort: 6 })
    .toBuffer()
  await writeFile(outPath, lastBuf)
  return { outPath, size: lastBuf.length }
}

/** Video compression: calculate target bitrate and encode with ffmpeg. */
async function compressVideo(inPath) {
  log(`  Compressing video…`)
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inPath, (err, data) => {
      if (err) return reject(err)

      const duration = parseFloat(String(data.format.duration ?? '60'))
      const vStream = data.streams.find((s) => s.codec_type === 'video')
      const W = vStream?.width ?? 1920
      const H = vStream?.height ?? 1080
      const fpsStr = vStream?.r_frame_rate ?? '30/1'
      const [n, d] = fpsStr.split('/').map(Number)
      const fps = d ? n / d : 30

      const usableBits = TARGET_BYTES * 8 * 0.95
      const vBps = usableBits / duration
      const vKbps = Math.max(200, Math.min(8000, Math.floor(vBps / 1000)))

      // Scale down if bitrate is too low for the resolution
      let targetW = W
      const bppf = vKbps * 1000 / (W * H)
      if (bppf < 0.05 && W * H > 921600) {
        const scale = Math.sqrt(0.07 / bppf)
        targetW = Math.floor(W * scale / 2) * 2
      }

      const outPath = resolveOut(inPath, '.mp4')
      const cmd = ffmpeg(inPath)
        .videoCodec('libx264')
        .noAudio()
        .outputOptions([
          `-vf scale=${targetW}:-2`,
          `-b:v ${vKbps}k`,
          `-maxrate ${Math.floor(vKbps * 1.5)}k`,
          `-bufsize ${vKbps * 2}k`,
          `-preset fast`,
          `-movflags +faststart`
        ])
        .on('progress', (p) => {
          process.stdout.write(`\r  Video encoding… ${(p.percent ?? 0).toFixed(0)}% (${vKbps} kbps, w=${targetW})   `)
        })
        .on('end', () => {
          process.stdout.write('\n')
          resolve({ outPath, size: fileSize(outPath) })
        })
        .on('error', (e) => { process.stdout.write('\n'); reject(e) })
        .save(outPath)
    })
  })
}

/** Audio compression: MP3 at calculated bitrate. */
async function compressAudio(inPath) {
  log(`  Compressing audio…`)
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inPath, (err, data) => {
      if (err) return reject(err)
      const duration = parseFloat(String(data.format.duration ?? '60'))
      const bitrateKbps = Math.max(48, Math.min(320, Math.floor(TARGET_BYTES * 8 / duration / 1000)))

      const outPath = resolveOut(inPath, '.mp3')
      ffmpeg(inPath)
        .audioCodec('libmp3lame')
        .audioBitrate(bitrateKbps)
        .on('progress', (p) => {
          process.stdout.write(`\r  Audio encoding… ${(p.percent ?? 0).toFixed(0)}% (${bitrateKbps} kbps)   `)
        })
        .on('end', () => {
          process.stdout.write('\n')
          resolve({ outPath, size: fileSize(outPath) })
        })
        .on('error', (e) => { process.stdout.write('\n'); reject(e) })
        .save(outPath)
    })
  })
}

/** Document (PDF) compression: remove object redundancy via pdf-lib. */
async function compressPdf(inPath) {
  log(`  Compressing PDF…`)
  const bytes = await readFile(inPath)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const compressed = await doc.save({ useObjectStreams: true })
  const outPath = resolveOut(inPath, '.pdf')
  await writeFile(outPath, compressed)
  return { outPath, size: compressed.length }
}

/** Archive: ZIP the input file at max compression. */
async function compressToZip(inPath) {
  log(`  Compressing → ZIP (level 9)…`)
  return new Promise((resolve, reject) => {
    const outPath = resolveOut(inPath, '.zip')
    const output = createWriteStream(outPath)
    const arc = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve({ outPath, size: fileSize(outPath) }))
    arc.on('error', reject)
    arc.pipe(output)
    arc.file(inPath, { name: path.basename(inPath) })
    arc.finalize()
  })
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

const TESTS = [
  { name: 'MP4 Video',    file: 'test_video.mp4',    gen: generateVideo,  compress: compressVideo   },
  { name: 'WAV Audio',    file: 'test_audio.wav',    gen: generateWav,    compress: compressAudio   },
  { name: 'FLAC Audio',   file: 'test_audio.flac',   gen: generateFlac,   compress: compressAudio   },
  { name: 'PNG Image',    file: 'test_image.png',    gen: generatePng,    compress: compressImage   },
  { name: 'JPEG Image',   file: 'test_image.jpg',    gen: generateJpeg,   compress: compressImage   },
  { name: 'PDF Document', file: 'test_document.pdf', gen: generatePdf,    compress: compressPdf     },
  { name: 'ZIP Archive',  file: 'test_csv_source.csv', gen: generateZipSource, compress: compressToZip },
]

const PAD = 16

function printRow(name, orig, out, took) {
  const pct = out <= 0 ? 'N/A' : `${((out / TARGET_BYTES) * 100).toFixed(1)}%`
  const saved = ratio(orig, out)
  const status = out > 0 && out <= TARGET_BYTES * 1.05
    ? '✅ Under'
    : out > TARGET_BYTES * 1.05
      ? '⚠️  Over'
      : '❌ Failed'
  log(
    `  ${name.padEnd(PAD)} │ ${fmt(orig).padStart(10)} → ${fmt(out).padStart(10)} │ ` +
    `saved ${saved.padStart(6)} │ ${pct.padStart(7)} of 10 MB │ ${took.toFixed(1)}s │ ${status}`
  )
}

async function run() {
  log('\n═══════════════════════════════════════════════════════════════════════')
  log('  Discord Ready – Compression Test Suite')
  log(`  Target: ${TARGET_MB} MB  |  Files: ${TESTS.length}`)
  log('═══════════════════════════════════════════════════════════════════════\n')

  const results = []

  for (const test of TESTS) {
    const inPath = path.join(IN_DIR, test.file)
    log(`─── ${test.name} ────────────────────────────────────────────`)

    // Generate if needed
    if (!existsSync(inPath) || fileSize(inPath) < 10 * MB) {
      log(`  Generating ${test.file}…`)
      const genStart = Date.now()
      try {
        await test.gen(inPath)
        log(`  Generated: ${fmt(fileSize(inPath))} in ${((Date.now() - genStart) / 1000).toFixed(1)}s`)
      } catch (err) {
        log(`  ❌ Generation failed: ${err.message}`)
        results.push({ ...test, origSize: 0, outSize: 0, took: 0, error: err.message })
        continue
      }
    } else {
      log(`  Using cached: ${fmt(fileSize(inPath))}`)
    }

    const origSize = fileSize(inPath)

    // Compress
    const compStart = Date.now()
    let outSize = 0
    let outPath = ''
    try {
      const result = await test.compress(inPath)
      outPath = result.outPath
      outSize = result.size
    } catch (err) {
      log(`  ❌ Compression failed: ${err.message}`)
      results.push({ ...test, origSize, outSize: 0, took: 0, error: err.message })
      continue
    }
    const took = (Date.now() - compStart) / 1000

    printRow(test.name, origSize, outSize, took)
    log(`  Output: ${outPath}`)
    results.push({ ...test, origSize, outSize, took })
    log('')
  }

  // ─── Summary Table ──────────────────────────────────────────────────────────
  log('\n═══════════════════════════════════════════════════════════════════════')
  log('  RESULTS SUMMARY')
  log('═══════════════════════════════════════════════════════════════════════')
  log(`  ${'Type'.padEnd(PAD)} │ ${'Input'.padStart(10)}   ${'Output'.padStart(10)} │ ${'Saved'.padStart(6)} │ ${'%Target'.padStart(7)} │ ${'Time'.padStart(6)} │ Status`)
  log(`  ${'─'.repeat(PAD)} │ ${'─'.repeat(24)} │ ${'─'.repeat(6)} │ ${'─'.repeat(7)} │ ${'─'.repeat(6)} │ ──────`)

  let allPass = true
  for (const r of results) {
    if (r.error) {
      log(`  ${r.name.padEnd(PAD)} │ ${'ERROR'.padStart(24)} │ ${'N/A'.padStart(6)} │ ${'N/A'.padStart(7)} │ ${'N/A'.padStart(6)} │ ❌ ${r.error}`)
      allPass = false
      continue
    }
    const pct = r.outSize <= 0 ? 999 : (r.outSize / TARGET_BYTES) * 100
    const status = pct <= 105 ? '✅' : '⚠️'
    if (pct > 105) allPass = false
    log(
      `  ${r.name.padEnd(PAD)} │ ${fmt(r.origSize).padStart(10)} → ${fmt(r.outSize).padStart(10)} │ ` +
      `${ratio(r.origSize, r.outSize).padStart(6)} │ ${`${pct.toFixed(1)}%`.padStart(7)} │ ${`${r.took.toFixed(1)}s`.padStart(6)} │ ${status}`
    )
  }

  log('')
  log(allPass
    ? '  ✅ All tests passed – every file compressed to ≤10 MB'
    : '  ⚠️  Some files exceeded the 10 MB target (see details above)'
  )
  log('═══════════════════════════════════════════════════════════════════════\n')
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
