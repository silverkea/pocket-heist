import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebaseAdmin'
import { verifyToken } from '@/lib/auth/verifyToken'
import { generateCodename } from '@/lib/codename'
import { COLLECTIONS } from '@/types/firestore'

export async function POST(req: NextRequest) {
  const decoded = await verifyToken(req)
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const codename = generateCodename()

  await Promise.all([
    adminAuth.updateUser(decoded.uid, { displayName: codename }),
    adminDb.collection(COLLECTIONS.USERS).doc(decoded.uid).set({
      id: decoded.uid,
      codename,
    }),
  ])

  return NextResponse.json({ codename })
}
