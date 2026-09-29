'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { linkAccountAction, type LinkFormState } from '@/app/accounts/actions'

const inputClass =
  'rounded-md border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/15'
const buttonClass =
  'rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/15 dark:hover:bg-white/10'

export default function LinkAccountForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<LinkFormState, FormData>(linkAccountAction, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state, router])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <h2 className="w-full text-lg font-semibold tracking-tight">Link account</h2>
      <select name="platform" defaultValue="lichess" className={inputClass} aria-label="Platform">
        <option value="lichess">Lichess</option>
        <option value="chesscom">Chess.com</option>
      </select>
      <input
        type="text"
        name="username"
        placeholder="Username"
        aria-label="Username"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? 'Linking…' : 'Link account'}
      </button>
      {state !== null && !state.ok && (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  )
}
