import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { verifyToken } from '@/lib/auth/verifyToken'
import { COLLECTIONS } from '@/types/firestore'

export async function GET(req: NextRequest) {
  const decoded = await verifyToken(req)
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  let queryRef = adminDb.collection(COLLECTIONS.USERS).orderBy('codename').limit(50)

  if (q) {
    queryRef = adminDb
      .collection(COLLECTIONS.USERS)
      .where('codename', '>=', q)
      .where('codename', '<=', q + '\uf8ff')
      .orderBy('codename')
      .limit(50)
  }

  const snapshot = await queryRef.get()
  const users = snapshot.docs
    .map((doc) => ({ id: doc.id, codename: doc.data().codename as string }))
    .filter((u) => u.id !== decoded.uid)

  return NextResponse.json({ users })
}
