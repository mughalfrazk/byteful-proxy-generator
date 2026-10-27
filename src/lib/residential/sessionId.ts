import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const SESSION_ID_LENGTH = 16

/**
 * A 16-character session ID from `[A-Z0-9]`.
 *
 * `crypto.randomInt` rather than `Math.random`: session IDs decide which exit
 * IP a request gets, so they should not be predictable from one another.
 */
export function generateSessionId(): string {
  let id = ''
  for (let i = 0; i < SESSION_ID_LENGTH; i += 1) {
    id += ALPHABET[randomInt(ALPHABET.length)]
  }
  return id
}
