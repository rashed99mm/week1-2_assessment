/**
 * Compile MJML email templates to HTML.
 *
 * Run at build time, not per send: MJML's compiler is slow and its output only
 * changes when a template does. Compiling on every email would put that cost
 * in the delivery path for no benefit.
 *
 * Each template is a fragment injected into layout.mjml, so the shell is
 * defined once. Handlebars expressions survive MJML compilation untouched and
 * are interpolated later, per email.
 *
 *   npm run build:templates
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mjml2html from 'mjml'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = join(here, '..', 'src', 'templates')
const OUTPUT_DIR = join(here, '..', 'dist', 'templates')

const LAYOUT = 'layout.mjml'
const CONTENT_MARKER = '{{> content}}'

async function main(): Promise<void> {
  const layout = await readFile(join(SOURCE_DIR, LAYOUT), 'utf8')

  if (!layout.includes(CONTENT_MARKER)) {
    throw new Error(`${LAYOUT} is missing the ${CONTENT_MARKER} placeholder.`)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  const files = (await readdir(SOURCE_DIR)).filter(
    (name) => name.endsWith('.mjml') && name !== LAYOUT,
  )

  if (files.length === 0) {
    throw new Error(`No templates found in ${SOURCE_DIR}`)
  }

  for (const file of files) {
    const fragment = await readFile(join(SOURCE_DIR, file), 'utf8')
    const source = layout.replace(CONTENT_MARKER, fragment)

    const { html, errors } = mjml2html(source, {
      validationLevel: 'strict',
      filePath: join(SOURCE_DIR, file),
    })

    if (errors.length > 0) {
      for (const error of errors) {
        console.error(`  ${file}: ${error.formattedMessage}`)
      }
      throw new Error(`MJML compilation failed for ${file}`)
    }

    const name = file.replace(/\.mjml$/, '.html')
    await writeFile(join(OUTPUT_DIR, name), html, 'utf8')
    console.log(`  compiled ${file} -> ${name}`)
  }

  console.log(`\n${files.length} template(s) written to dist/templates`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
