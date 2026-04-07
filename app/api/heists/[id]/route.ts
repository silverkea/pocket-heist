import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { verifyToken } from '@/lib/auth/verifyToken'
import { COLLECTIONS } from '@/types/firestore'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const decoded = await verifyToken(req)
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { assignedTo, assignedToCodename } = body

  if (!assignedTo || !assignedToCodename) {
    return NextResponse.json({ error: 'assignedTo and assignedToCodename are required' }, { status: 400 })
  }

  await adminDb.collection(COLLECTIONS.HEISTS).doc(id).update({
    assignedTo,
    assignedToCodename,
  })

  return NextResponse.json({ ok: true })
}
