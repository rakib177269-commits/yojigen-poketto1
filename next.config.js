/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // We serve pre-generated WebP sizes ourselves (see lib/images.js), so the
  // Next image optimiser isn't used.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/sample/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }],
      },
    ];
  },
};

export default nextConfig;
