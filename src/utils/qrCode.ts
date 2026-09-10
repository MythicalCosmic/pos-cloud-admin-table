/** Generate a QR image entirely in the browser so private menu tokens never
 * leave the application origin. The encoder is loaded only when this page is
 * used, keeping it out of the initial application chunk. */
export async function createQrDataUrl(content: string, size = 320): Promise<string> {
  if (!content)
    return ''

  const { BarcodeFormat, EncodeHintType, QRCodeWriter } = await import('@zxing/library')
  const dimension = Math.min(1024, Math.max(64, Math.round(size)))
  const hints = new Map()

  hints.set(EncodeHintType.MARGIN, 4)

  const matrix = new QRCodeWriter().encode(
    content,
    BarcodeFormat.QR_CODE,
    dimension,
    dimension,
    hints,
  )

  const width = matrix.getWidth()
  const height = matrix.getHeight()
  const canvas = document.createElement('canvas')

  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context)
    throw new Error('Canvas is unavailable')

  const image = context.createImageData(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const color = matrix.get(x, y) ? 0 : 255

      image.data[offset] = color
      image.data[offset + 1] = color
      image.data[offset + 2] = color
      image.data[offset + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)

  return canvas.toDataURL('image/png')
}
