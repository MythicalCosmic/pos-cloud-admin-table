/** Start a browser download before releasing the file's object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename

  // Export menus should not interpret the generated click as an outside click.
  anchor.dataset.reportDownload = ''
  document.body.appendChild(anchor)
  try {
    anchor.click()
  }
  finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
