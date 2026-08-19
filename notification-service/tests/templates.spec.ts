import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { clearTemplateCache, render } from '../src/services/template.service.js'

const here = dirname(fileURLToPath(import.meta.url))
const COMPILED_DIR = join(here, '..', 'dist', 'templates')

/**
 * Email templates.
 *
 * These exist because MJML compilation is a lossy step that can silently drop
 * Handlebars control flow: text sitting directly between mj-* components is
 * discarded, so a `{{#if}}` written there vanishes and the block it was
 * guarding renders unconditionally. Nothing errors — the email just goes out
 * saying "held until  (UTC)".
 *
 * Requires `npm run build:templates` to have run.
 */
describe('email templates', () => {
  beforeAll(async () => {
    clearTemplateCache()

    const files = await readdir(COMPILED_DIR).catch(() => [])

    if (files.length === 0) {
      throw new Error(
        'No compiled templates found. Run `npm run build:templates` before the test suite.',
      )
    }
  })

  it('renders the order confirmation with money as given', async () => {
    const html = await render('order-confirmation', {
      customerName: 'Ada Lovelace',
      orderId: 501,
      eventTitle: 'Aurora Live',
      ticketTypeName: 'Floor A',
      quantity: 2,
      unitPrice: '75.00',
      totalAmount: '150.00',
      currency: 'USD',
      expiresAt: '2026-08-16T12:45:00.000Z',
    })

    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Aurora Live')
    // The decimal string is displayed verbatim — never parsed into a number
    // and re-formatted, which is where cent-level drift creeps in.
    expect(html).toContain('$150.00')
    expect(html).toContain('$75.00')
    expect(html).not.toContain('{{')
  })

  it('shows the reservation deadline when there is one', async () => {
    const html = await render('order-confirmation', {
      customerName: 'Ada',
      orderId: 1,
      eventTitle: 'X',
      ticketTypeName: 'Y',
      quantity: 1,
      unitPrice: '10.00',
      totalAmount: '10.00',
      currency: 'USD',
      expiresAt: '2026-08-16T12:45:00.000Z',
    })

    expect(html).toContain('This reservation is held until')
  })

  /**
   * The regression this file exists for.
   *
   * `expiresAt` is nullable in the contract. If the guarding conditional is
   * lost during MJML compilation, this renders the sentence anyway with an
   * empty date.
   */
  it('omits the deadline entirely when there is none', async () => {
    const html = await render('order-confirmation', {
      customerName: 'Ada',
      orderId: 1,
      eventTitle: 'X',
      ticketTypeName: 'Y',
      quantity: 1,
      unitPrice: '10.00',
      totalAmount: '10.00',
      currency: 'USD',
      expiresAt: null,
    })

    expect(html).not.toContain('This reservation is held until')
  })

  it('references the QR attachment by content id', async () => {
    const html = await render('e-ticket', {
      customerName: 'Ada',
      orderId: 501,
      eventTitle: 'Aurora Live',
      quantity: 2,
      totalAmount: '150.00',
      currency: 'USD',
      gatewayReference: 'TXN-ABC123',
      paidAt: '2026-08-16T12:32:10.000Z',
      orderUrl: 'http://localhost/orders/501',
    })

    // Not a data: URI — Gmail strips those, leaving the ticket with no barcode.
    expect(html).toContain('cid:ticket-qr')
    expect(html).toContain('TXN-ABC123')
    expect(html).not.toContain('{{')
  })

  it('omits the refund reason when none was given', async () => {
    const withReason = await render('refund-confirmation', {
      customerName: 'Ada',
      orderId: 501,
      eventTitle: 'Aurora Live',
      refundedAmount: '150.00',
      currency: 'USD',
      reason: 'Customer request',
      gatewayReference: 'TXN-ABC123',
    })

    const withoutReason = await render('refund-confirmation', {
      customerName: 'Ada',
      orderId: 501,
      eventTitle: 'Aurora Live',
      refundedAmount: '150.00',
      currency: 'USD',
      reason: null,
      gatewayReference: 'TXN-ABC123',
    })

    expect(withReason).toContain('Customer request')
    expect(withoutReason).not.toContain('Reason')
  })

  it('refuses a template name that is a path', async () => {
    await expect(render('../../../etc/passwd', {})).rejects.toThrow('Invalid template name')
  })
})
