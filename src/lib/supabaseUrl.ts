/** The dashboard's REST endpoint is sometimes pasted instead of the project URL. */
export function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.supabase.co') &&
      /^\/rest\/v1\/?$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    ) return url.origin
  } catch {
    // Keep existing validation in the Supabase SDK for other inputs.
  }
  return value
}
