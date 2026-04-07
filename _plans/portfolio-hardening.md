# Plan: Pocket Heist — Portfolio Hardening

## Context

This project was built as a learning exercise with Firebase credentials hardcoded directly in `lib/firebase.ts` and committed to a private repo. The goal is to transform it into a public portfolio project that demonstrates good practices: proper secret management, an API layer (no direct Firestore calls from the browser for writes), clean deployment, and IaC. The old repo will be deleted after migration to remove the credential history.

---

## Architecture Decision: Hybrid API Layer

**Writes** (create heist, reassign, user signup) → Next.js Route Handlers using Firebase Admin SDK  
**Reads** (`useHeists`, `useHeist`) → keep `onSnapshot` via Firestore client SDK (real-time is valuable; polling/SSE adds complexity for no security gain here)

Rationale: The security goal for writes is fully achieved — Firestore rules can deny all direct client writes once the Admin SDK handles them server-side. `onSnapshot` reads are scoped per-user by Firestore rules and can't be meaningfully abused.

**Hosting: Vercel** (not Firebase Hosting). Vercel has first-class Next.js support. Firebase Hosting requires Cloud Functions for SSR — significantly more complex.

---

## Phase 1: Credential Cleanup

### 1.1 — Update `.env.example`
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-only — NEVER expose to client)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=   # JSON-escaped: "-----BEGIN PRIVATE KEY-----\n...\n"
```

### 1.2 — Rewrite `lib/firebase.ts`
Replace hardcoded `firebaseConfig` object with `process.env.NEXT_PUBLIC_FIREBASE_*` reads. Everything else (initializeApp, exports) unchanged.  
**First**: create `.env.local` with the current hardcoded values so the app keeps running.

### 1.3 — Create `lib/firebaseAdmin.ts` (new)
Firebase Admin SDK singleton (singleton pattern to avoid re-init on every request):
```ts
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    })})

export const adminDb = getFirestore(adminApp)
export const adminAuth = getAuth(adminApp)
```

### 1.4 — Add `firebase-admin` to `package.json`
Pin to latest stable (check npmjs.com before pinning — currently `13.x`). CLAUDE.md requires pinned versions.

---

## Phase 2: API Layer

### 2.1 — Shared utilities (new files)

**`lib/auth/verifyToken.ts`** — extract + verify Firebase ID token from `Authorization: Bearer` header using `adminAuth.verifyIdToken`. Returns decoded token or null.

**`lib/api/client.ts`** — thin fetch wrapper (`apiGet`, `apiPost`, `apiPatch`) that auto-attaches `Authorization: Bearer <idToken>` from `auth.currentUser.getIdToken()`.

**`types/api/user.ts`** — `interface UserResult { id: string; codename: string }` (replaces local type duplicated in CreateHeistForm + HeistDetail)

### 2.2 — Route Handlers (all new under `app/api/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `app/api/auth/signup/route.ts` | POST | Verify token, generate codename via `lib/codename.ts`, call `adminAuth.updateUser` + `adminDb.collection('users').doc(uid).set(...)` |
| `app/api/users/route.ts` | GET | Verify token, query users by `?q=<codename>`, return `UserResult[]` |
| `app/api/heists/route.ts` | POST | Verify token, create heist doc via `adminDb.collection('heists').add(...)` with server-set `createdBy`, `createdAt`, `deadline` |
| `app/api/heists/[id]/route.ts` | PATCH | Verify token, `adminDb.doc('heists/id').update({ assignedTo, assignedToCodename })` |

### 2.3 — Update client components

**`components/AuthForm/AuthForm.tsx`**
- Remove: `firebase/firestore` imports (`doc`, `setDoc`, `db`)
- Keep: Firebase Auth calls (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`) — must stay client-side
- Change: after signup, call `apiPost('/api/auth/signup', {})` instead of `setDoc`. Call `auth.currentUser?.reload()` afterward to refresh displayName.
- Remove: client-side `updateProfile` call (server does it via Admin SDK)

**`components/CreateHeistForm/CreateHeistForm.tsx`**
- Remove: all `firebase/firestore` imports + `db`
- Change: `fetchUsers` → `apiGet('/api/users?q=<term>')`
- Change: `onSubmit` → `apiPost('/api/heists', { title, description, assignedTo, assignedToCodename })`

**`components/HeistDetail/HeistDetail.tsx`**
- Remove: all `firebase/firestore` imports + `db`
- Change: `fetchUsers` → `apiGet('/api/users?q=<term>')`
- Change: `confirmAssignment` → `apiPatch('/api/heists/${id}', { assignedTo, assignedToCodename })`

**Unchanged**: `Navbar.tsx`, `AuthContext.tsx`, `hooks/useHeists.ts`, `hooks/useHeist.ts`

### 2.4 — Tighten `firestore.rules`
Current rules are wide open until May 2026. Once API layer is verified end-to-end, update to:
```
match /heists/{heistId} {
  allow read: if request.auth != null;
  allow write: if false;  // writes go via Admin SDK (bypasses rules)
}
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

---

## Phase 3: Vercel Config + `vercel.json`

1. `vercel link` to connect to a Vercel project (run locally, generates `.vercel/project.json`)
2. Set all `.env.example` vars in Vercel project settings (Production + Preview). `FIREBASE_PRIVATE_KEY` must be stored with literal `\n` sequences.
3. Create `vercel.json` (minimal, explicit):
   ```json
   { "framework": "nextjs" }
   ```

---

## Phase 4: GitHub Actions CI/CD

### `.github/workflows/ci.yml` — on PR and push to main
- `npm ci` → `npm run lint` → `npx vitest run`
- No Firebase env vars needed (tests mock Firebase)

### `.github/workflows/deploy.yml` — on push to main
- **Job 1**: Vercel production deploy via `vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod`
- **Job 2**: `firebase deploy --only firestore:rules,firestore:indexes` (runs after Job 1)

Required GitHub Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `FIREBASE_TOKEN` (from `firebase login:ci`), `CLAUDE_CODE_OAUTH_TOKEN`

---

## Phase 5: Terraform IaC

### Scope
**Manage with Terraform:**
- `vercel_project` + `vercel_project_environment_variable` (all env vars, sensitive = true)
- `github_repository` (settings, topics, visibility)
- `github_branch_protection` on `main` (require PR, require CI to pass)
- `github_actions_secret` (all secrets listed above)

**Do NOT manage with Terraform:**
- Firebase project (Firebase Console owns this; Firebase Terraform provider is not well-maintained)
- Firestore rules/indexes (managed via `firebase deploy` in CI — they're code, not infra)
- Vercel deployments (triggered by git push)

### File structure
```
terraform/
  main.tf         # provider config, Terraform Cloud backend
  variables.tf    # input vars (all marked sensitive where applicable)
  vercel.tf       # vercel_project, vercel_project_environment_variable
  github.tf       # github_repository, github_branch_protection, github_actions_secret
  .gitignore      # *.tfstate, .terraform/, terraform.tfvars
```

State stored in Terraform Cloud (free tier).

---

## Phase 6: New Public Repo (clean history)

**Do this last** — once all config files (Vercel, GitHub Actions, Terraform) are in place so the public repo is complete from its first commit.

1. Verify the app and all config are in final state.
2. **Delete the local `.git` directory** to wipe all history (including the committed credential from the original repo):
   ```bash
   rm -rf .git
   git init
   git add -A        # .env.local is gitignored — will not be included
   git commit -m "Initial commit"
   ```
3. Create the new public GitHub repo:
   ```bash
   gh repo create pocket-heist --public --description "Tiny missions. Big office mischief."
   ```
4. Push:
   ```bash
   git remote add origin https://github.com/silverkea/pocket-heist.git
   git push -u origin main
   ```
5. Archive the old private repo (do not delete immediately — keep until new repo is confirmed working, then delete).

## Implementation Order

1. ✅ `firebase-admin` dependency → `.env.example` → `.env.local` (local, gitignored)
2. ✅ `lib/firebase.ts` (env vars) → `lib/firebaseAdmin.ts`
3. ✅ `lib/auth/verifyToken.ts` → `lib/api/client.ts` → `types/api/user.ts`
4. ✅ API routes (`users`, `auth/signup`, `heists`, `heists/[id]`)
5. ✅ Update `AuthForm.tsx` → `CreateHeistForm.tsx` → `HeistDetail.tsx`
6. ✅ Tighten `firestore.rules`
7. `vercel.json` + `vercel link` locally
8. GitHub Actions workflows (`ci.yml`, `deploy.yml`)
9. Terraform (`main.tf`, `variables.tf`, `vercel.tf`, `github.tf`)
10. **Delete `.git`, reinitialise, create new public repo, push** (do last)

---

## Files Changed

**Modified:**
- `lib/firebase.ts` — env vars
- `.env.example` — populated
- `package.json` — add `firebase-admin` (pinned)
- `components/AuthForm/AuthForm.tsx`
- `components/CreateHeistForm/CreateHeistForm.tsx`
- `components/HeistDetail/HeistDetail.tsx`
- `firestore.rules` — tighten

**Created:**
- `lib/firebaseAdmin.ts`
- `lib/auth/verifyToken.ts`
- `lib/api/client.ts`
- `types/api/user.ts`
- `app/api/auth/signup/route.ts`
- `app/api/users/route.ts`
- `app/api/heists/route.ts`
- `app/api/heists/[id]/route.ts`
- `vercel.json`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `terraform/main.tf`, `variables.tf`, `vercel.tf`, `github.tf`

---

## Verification

- Run `npx vitest run` — all tests pass
- `npm run build` succeeds with env vars set
- Sign up / log in / create heist / reassign heist all work end-to-end locally
- Firestore rules deny direct write from browser console (`firebase.firestore().collection('heists').add({...})` → permission denied)
- GitHub Actions CI passes on a test PR
- Vercel preview deployment works on PR
- `terraform plan` shows no unexpected changes after initial `apply`
