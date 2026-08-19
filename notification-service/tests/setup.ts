import { generateKeyPairSync } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Environment for the test run, set before any module reads it.
 *
 * config.ts validates and freezes its values at import time, so these have to
 * be in place before the first import of anything that pulls it in.
 */

// A throwaway RS256 pair. Generated rather than committed so the repository
// never contains a private key, even a test one — the next person to copy a
// pattern should not find a checked-in key to copy.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_PUBLIC_KEY = publicKey
process.env.MONGO_URL = 'mongodb://placeholder/test'
process.env.RABBITMQ_URL = 'amqp://placeholder'
process.env.APP_URL = 'http://localhost'

// Tests run from src/, where ../templates holds the .mjml sources. Point at
// the compiled output so the tests exercise what actually gets sent — the
// whole point of these tests is that MJML compilation is lossy.
process.env.TEMPLATE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'templates',
)

/** Exposed so tests can mint tokens the service will accept. */
export const TEST_PRIVATE_KEY = privateKey
export const TEST_PUBLIC_KEY = publicKey
