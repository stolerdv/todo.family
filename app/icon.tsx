import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default async function Icon() {
  const imageData = await readFile(join(process.cwd(), 'public/couple.jpg'))
  const base64 = `data:image/jpeg;base64,${imageData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          borderRadius: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Photo cropped to square */}
        <img
          src={base64}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
          }}
        />
        {/* Gradient overlay at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 160,
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            paddingBottom: 28,
            paddingLeft: 0,
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: 36, fontWeight: 700, letterSpacing: 2 }}>
            Todo Family
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
