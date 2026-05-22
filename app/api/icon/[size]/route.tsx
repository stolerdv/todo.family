import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: { size: string } }) {
  const size = parseInt(params.size) || 512
  const imageData = await readFile(join(process.cwd(), 'public/couple.jpg'))
  const base64 = `data:image/jpeg;base64,${imageData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <img
          src={base64}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: size * 0.35,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: size * 0.06,
          }}
        >
          <span style={{ color: 'white', fontSize: size * 0.08, fontWeight: 700, letterSpacing: 2 }}>
            Todo Family
          </span>
        </div>
      </div>
    ),
    { width: size, height: size }
  )
}
