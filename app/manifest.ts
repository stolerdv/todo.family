import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Todo Family',
    short_name: 'Todo',
    description: 'Family task manager',
    start_url: '/app',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#030712',
    icons: [
      { src: '/api/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
