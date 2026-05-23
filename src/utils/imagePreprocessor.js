const MAX_LONG_EDGE_PX = 800
const WEBP_QUALITY = 0.80
const BLUR_THRESHOLD = 80

/**
 * Resize and re-encode an image File or Blob for Claude Vision API.
 * Returns { blob, width, height, originalSize, outputSize, blurScore, tooBlurry }.
 */
export async function preprocessImageForVision(input) {
  const originalSize = input.size
  const bitmap = await createImageBitmap(input)
  const { width, height } = computeOutputDimensions(bitmap.width, bitmap.height)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blurScore = computeLaplacianBlurScore(ctx, width, height)
  const blob = await canvasToWebPBlob(canvas, WEBP_QUALITY)

  return { blob, width, height, originalSize, outputSize: blob.size, blurScore, tooBlurry: blurScore < BLUR_THRESHOLD }
}

/** Convert a Blob to a raw base64 string (strips the data URL prefix). */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function computeOutputDimensions(srcW, srcH) {
  const longEdge = Math.max(srcW, srcH)
  if (longEdge <= MAX_LONG_EDGE_PX) return { width: srcW, height: srcH }
  const scale = MAX_LONG_EDGE_PX / longEdge
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) }
}

/**
 * Laplacian variance blur score. Higher = sharper.
 * Samples a center crop to avoid edge artifacts.
 */
function computeLaplacianBlurScore(ctx, width, height) {
  const sampleW = Math.min(width, 300)
  const sampleH = Math.min(height, 300)
  const offsetX = Math.floor((width - sampleW) / 2)
  const offsetY = Math.floor((height - sampleH) / 2)

  const { data: pixels } = ctx.getImageData(offsetX, offsetY, sampleW, sampleH)
  const w = sampleW
  const h = sampleH

  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]
  }

  const laplacian = new Float32Array((w - 2) * (h - 2))
  let idx = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      laplacian[idx++] =
        gray[y * w + x - 1] + gray[y * w + x + 1] +
        gray[(y - 1) * w + x] + gray[(y + 1) * w + x] -
        4 * gray[y * w + x]
    }
  }

  let sum = 0, sumSq = 0
  const n = laplacian.length
  for (let i = 0; i < n; i++) { sum += laplacian[i]; sumSq += laplacian[i] * laplacian[i] }
  const mean = sum / n
  return sumSq / n - mean * mean
}

function canvasToWebPBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas.toBlob returned null')),
      'image/webp',
      quality
    )
  })
}
