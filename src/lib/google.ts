import type { User } from '../types'

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void
      prompt: () => void
    }
  }
}

declare global { interface Window { google?: GoogleIdentity } }

let loadingPromise: Promise<void> | null = null

function decodeCredential(credential: string): Record<string, string> {
  const segment = credential.split('.')[1]
  if (!segment) throw new Error('Google ไม่ได้ส่งข้อมูลบัญชีกลับมา')
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>
}

export function loadGoogleIdentity() {
  if (window.google) return Promise.resolve()
  if (loadingPromise) return loadingPromise

  loadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('#google-identity')
    const script = existing ?? document.createElement('script')
    script.id = 'google-identity'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => {
      loadingPromise = null
      reject(new Error('ไม่สามารถโหลด Google Sign-In ได้ กรุณาตรวจสอบอินเทอร์เน็ต'))
    }, { once: true })
    if (!existing) document.head.appendChild(script)
  })
  return loadingPromise
}

export async function signInWithGoogle(onSuccess: (user: User) => void) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID')
  await loadGoogleIdentity()
  if (!window.google) throw new Error('ไม่สามารถเริ่ม Google Sign-In ได้ โปรดลองใหม่')

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: ({ credential }) => {
      try {
        const profile = decodeCredential(credential)
        onSuccess({ id: profile.sub, name: profile.name, email: profile.email, picture: profile.picture })
      } catch {
        throw new Error('อ่านข้อมูลบัญชี Google ไม่สำเร็จ')
      }
    },
  })
  window.google.accounts.id.prompt()
}
