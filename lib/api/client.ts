import { auth } from '@/lib/firebase'

async function getAuthHeader(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiGet(path: string) {
  const headers = await getAuthHeader()
  const res = await fetch(path, { headers })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function apiPost(path: string, body: unknown) {
  const headers = await getAuthHeader()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function apiPatch(path: string, body: unknown) {
  const headers = await getAuthHeader()
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
