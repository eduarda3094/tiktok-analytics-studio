import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Lazy-init PrismaClient.
 *
 * We create the client on first access (not on module import) so that
 * tests can override DATABASE_URL via process.env before the client
 * is instantiated. This is required for integration tests that use
 * an isolated test.db instead of the production custom.db.
 *
 * To override the client entirely (e.g. in tests), set:
 *   globalForPrisma.prisma = myTestClient
 * BEFORE accessing `db` for the first time.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'production' ? [] : ['error', 'warn'],
      })
    }
    const value = (globalForPrisma.prisma as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(globalForPrisma.prisma) : value
  },
})
