import type { User } from '../types'

declare global { interface Window { google?: { accounts: { id: { initialize: (config: object) => void; prompt: () => void } } } } }

function decodeCredential(credential: string): Record<string, string> {
  const segment = credential.split('.')[1]
  return JSON.parse(decodeURIComponent(escape(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))))) as Record<string, string>
}

export function signInWithGoogle(onSuccess: (user: User) => void) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID')
  if (!window.google) throw new Error('ไม่สามารถโหลด Google Sign-In ได้ โปรดลองใหม่')
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: ({ credential }: { credential: string }) => {
      const profile = decodeCredential(credential)
      onSuccess({ id: profile.sub, name: profile.name, email: profile.email, picture: profile.picture })
    },
  })
  window.google.accounts.id.prompt()
}
