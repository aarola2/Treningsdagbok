import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacySection } from './PrivacySection'

function section() {
  render(<PrivacySection />)
  return screen.getByRole('region', { name: 'Lagring og personvern' })
}

describe('PrivacySection', () => {
  it('er en navngitt seksjon med overskrift på nivå 2', () => {
    const region = section()
    expect(within(region).getByRole('heading', { level: 2, name: 'Lagring og personvern' })).toBeInTheDocument()
  })

  it('sier at data bare lagres i denne nettleseren på denne enheten og ikke sendes noe sted', () => {
    const region = section()
    expect(region).toHaveTextContent('lagres bare i denne nettleseren på denne enheten')
    expect(region).toHaveTextContent('Appen sender dem ikke noe sted.')
  })

  it('forklarer at data kan gå tapt, med alle tre årsakene', () => {
    const region = section()
    expect(region).toHaveTextContent('kan gå tapt')
    expect(region).toHaveTextContent('i privat modus')
    expect(region).toHaveTextContent('tømmer nettleserdata')
    expect(region).toHaveTextContent('rydder bort data etter en periode uten bruk')
  })

  it('anbefaler eksport som sikkerhetskopi', () => {
    expect(section()).toHaveTextContent('Bruk eksport jevnlig som sikkerhetskopi.')
  })

  it('sier at GitHub Pages som vert behandler IP-adresse og forespørselslogger', () => {
    const region = section()
    expect(region).toHaveTextContent('GitHub Pages')
    expect(region).toHaveTextContent('IP-adressen din')
    expect(region).toHaveTextContent('logger forespørsler')
  })

  it('lover ikke mer enn appen kan holde', () => {
    const region = section()
    expect(region).not.toHaveTextContent(/kryptert|anonym|for alltid|sikkert lagret/i)
  })
})
