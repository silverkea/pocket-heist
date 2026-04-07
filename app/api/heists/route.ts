import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'
import { verifyToken } from '@/lib/auth/verifyToken'
import { COLLECTIONS } from '@/types/firestore'

export async function POST(req: NextRequest) {
  const decoded = await verifyToken(req)
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { title, description, assignedTo = null, assignedToCodename = null } = body

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'Title and description are required' }, { status: 400 })
  }

  const docRef = await adminDb.collection(COLLECTIONS.HEISTS).add({
    title: title.trim(),
    description: description.trim(),
    createdBy: decoded.uid,
    createdByCodename: decoded.name ?? '',
    assignedTo,
    assignedToCodename,
    deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    finalStatus: null,
    createdAt: FieldValue.serverTimestamp(),
  })

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
