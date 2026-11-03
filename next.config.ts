import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    // Default is 10MB, same as the upload route's own file-size cap — multipart
    // encoding adds overhead on top of the raw file size, so a 10MB file can trip
    // Next's own body-size limit (in middleware, before the route ever runs) before
    // it trips the route's explicit check. Small headroom avoids silent truncation.
    middlewareClientMaxBodySize: '15mb',
  },
}

export default nextConfig
