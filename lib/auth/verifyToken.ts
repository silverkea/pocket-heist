import { NextRequest } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export async function verifyToken(req: NextRequest) {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    return await adminAuth.verifyIdToken(token)
  } catch {
    return null
  }
}
