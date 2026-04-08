export function isVideoUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase()

  if (normalizedUrl.startsWith('data:video/')) {
    return true
  }

  if (normalizedUrl.includes('#video') || normalizedUrl.includes('asset=video')) {
    return true
  }

  return ['.mp4', '.webm', '.ogg', '.mov', '.m4v'].some((extension) => normalizedUrl.includes(extension))
}

export function getPreviewAssetType(url: string): 'image' | 'video' {
  return isVideoUrl(url) ? 'video' : 'image'
}
