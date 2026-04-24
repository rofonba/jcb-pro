/**
 * Transforms Google Drive sharing URLs into a direct-embeddable format.
 * Supports:
 *   https://drive.google.com/file/d/FILE_ID/view...
 *   https://drive.google.com/open?id=FILE_ID
 *   https://drive.google.com/uc?id=FILE_ID
 * All other URLs are returned unchanged.
 */
export function getDirectImageUrl(url) {
  if (!url) return null
  if (url.includes('drive.google.com')) {
    const matchPath  = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
    const matchQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    const fileId     = (matchPath || matchQuery)?.[1]
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return url
}
