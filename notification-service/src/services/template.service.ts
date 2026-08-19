import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'

/**
 * Renders email templates.
 *
 * MJML sources are compiled to HTML at build time (scripts/build-templates.ts),
 * not per send: MJML's compiler is slow and the output only changes when the
 * template does. This module compiles the resulting HTML with Handlebars and
 * caches the compiled function.
 */

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Where the compiled .html templates live.
 *
 * Relative to this module, which is dist/services/ once built — so the default
 * resolves to dist/templates. Running from source (tests, `npm run dev`) puts
 * this module in src/services/, where ../templates holds the .mjml *sources*
 * rather than the compiled output, so those paths set TEMPLATE_DIR explicitly.
 */
const TEMPLATE_DIR = process.env.TEMPLATE_DIR ?? join(here, '..', 'templates')

const cache = new Map<string, HandlebarsTemplateDelegate>()

/** Money arrives as a decimal string and is displayed as one — never parsed. */
Handlebars.registerHelper('money', (amount: unknown, currency: unknown) => {
  const symbol = currency === 'USD' ? '$' : `${String(currency ?? '')} `
  return new Handlebars.SafeString(`${symbol}${String(amount ?? '0.00')}`)
})

Handlebars.registerHelper('formatDate', (value: unknown) => {
  if (typeof value !== 'string') return ''

  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'UTC',
  })
})

export async function render(
  template: string,
  context: Record<string, unknown>,
): Promise<string> {
  let compiled = cache.get(template)

  if (!compiled) {
    // Guard against a template name reaching the filesystem as a path. The
    // names are internal today, but this is one careless refactor away from
    // being attacker-influenced.
    if (!/^[a-z0-9-]+$/.test(template)) {
      throw new Error(`Invalid template name: ${template}`)
    }

    const source = await readFile(join(TEMPLATE_DIR, `${template}.html`), 'utf8')
    compiled = Handlebars.compile(source)
    cache.set(template, compiled)
  }

  return compiled(context)
}

/** Test seam: drops the compiled-template cache. */
export function clearTemplateCache(): void {
  cache.clear()
}
