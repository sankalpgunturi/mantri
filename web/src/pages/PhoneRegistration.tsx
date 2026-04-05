import { useState } from 'react'

interface Props {
  accessToken: string
  provider: string
  onComplete: () => void
}

const COUNTRIES = [
  { code: '+91', label: 'IN +91', placeholder: '70134 57293' },
  { code: '+1', label: 'US +1', placeholder: '(415) 555-1234' },
] as const

export default function PhoneRegistration({ accessToken, provider, onComplete }: Props) {
  const [countryIdx, setCountryIdx] = useState(0)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const country = COUNTRIES[countryIdx]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const digits = phone.replace(/[\s\-()]/g, '')
    const full = digits.startsWith('+') ? digits : `${country.code}${digits}`

    if (!/^\+\d{7,15}$/.test(full)) {
      setError('Enter a valid phone number')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/user/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ phone_number: full, provider }),
      })

      const data = await res.json() as { success?: boolean; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to register phone number')
        return
      }

      onComplete()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-header">
        <h1>Mantri</h1>
        <p>One last step</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="phone-reg-desc">
          Enter your phone number. Mantri will call you here when you tap the button.
        </p>

        <div className="phone-input-row">
          <select
            className="country-select"
            value={countryIdx}
            onChange={(e) => {
              setCountryIdx(Number(e.target.value))
              setPhone('')
            }}
          >
            {COUNTRIES.map((c, i) => (
              <option key={c.code} value={i}>{c.label}</option>
            ))}
          </select>

          <input
            className="phone-reg-input"
            type="tel"
            placeholder={country.placeholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
        </div>

        {error && <p className="phone-reg-error">{error}</p>}

        <button
          type="submit"
          className="oauth-btn"
          disabled={submitting || !phone.trim()}
          style={{ background: 'var(--purple)', borderColor: 'var(--purple)' }}
        >
          {submitting ? <span className="spinner" /> : null}
          {submitting ? 'Registering…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
