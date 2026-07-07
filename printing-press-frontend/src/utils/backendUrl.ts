/**
 * Get the backend URL for API and static file requests.
 * 
 * Priority:
 * 1. If VITE_BACKEND_URL is explicitly set, use it
 * 2. In production, use relative URLs (empty string) - works with current origin
 * 3. In development, use relative URLs - works with current origin
 * 
 * This ensures images and API calls work correctly whether accessing:
 * - From localhost on the same machine
 * - From another computer on the network (different IP)
 * - From a domain name
 * - From production deployment
 */
export function getBackendUrl(): string {
  // If explicitly configured, always use it
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }

  // Otherwise use relative URLs (works with current origin)
  // This handles all cases: localhost, network IP, domain name, production
  return ''
}

/**
 * Construct full image URL from relative path.
 * Handles path normalization (backslashes to forward slashes).
 */
export function getImageUrl(relativePath?: string): string | null {
  if (!relativePath || relativePath.startsWith('blob:')) {
    return relativePath || null
  }

  const backend = getBackendUrl()
  const normalized = String(relativePath).replace(/\\/g, '/')
  
  if (backend) {
    return `${backend}/${normalized}`
  }
  
  // Relative URL - works with current origin
  return `/${normalized}`
}

/**
 * Construct full URL for any backend resource.
 */
export function getBackendResource(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const backend = getBackendUrl()
  const normalized = String(path).replace(/\\/g, '/')

  if (backend) {
    // Ensure no double slashes
    return `${backend}/${normalized}`.replace(/\/+/g, '/')
  }

  // Relative URL
  return `/${normalized}`.replace(/\/+/g, '/')
}
