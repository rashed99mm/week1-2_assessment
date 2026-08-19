import type { Server } from 'socket.io'
import { logger } from '../core/logger.js'
import { bearerFrom, verifyToken } from '../core/jwt.js'

/**
 * Realtime push over Socket.IO.
 *
 * Socket.IO rather than raw `ws` because the requirement is per-user rooms, an
 * admin broadcast channel, reconnection with backoff, and a browser client
 * that works behind a reverse proxy. Raw `ws` would mean hand-rolling all four.
 * The cost is a non-standard framing layer and a heavier client, which is
 * acknowledged rather than pretended away.
 *
 * Single instance only. Scaling out needs the Redis adapter so a message
 * published on one node reaches sockets held by another; that is a deliberate
 * non-goal here, not an oversight.
 */

const USER_ROOM = (userId: number) => `user:${userId}`
const ADMIN_ROOM = 'admins'

class Realtime {
  private io: Server | null = null

  /** Wire up authentication and room membership on a Socket.IO server. */
  attach(io: Server): void {
    this.io = io

    io.use((socket, next) => {
      // The token arrives in the handshake auth payload rather than a header,
      // because the browser WebSocket API cannot set headers.
      const raw =
        (socket.handshake.auth as { token?: string } | undefined)?.token ??
        bearerFrom(socket.handshake.headers.authorization)

      if (!raw) {
        next(new Error('unauthorized'))
        return
      }

      try {
        const user = verifyToken(raw)
        socket.data.user = user
        next()
      } catch {
        // Deliberately unspecific: the client only needs to know it failed.
        next(new Error('unauthorized'))
      }
    })

    io.on('connection', (socket) => {
      const user = socket.data.user as { id: number; isAdmin: boolean }

      void socket.join(USER_ROOM(user.id))

      if (user.isAdmin) {
        void socket.join(ADMIN_ROOM)
      }

      logger.debug({ userId: user.id, isAdmin: user.isAdmin }, 'Socket connected.')

      socket.on('disconnect', (reason) => {
        logger.debug({ userId: user.id, reason }, 'Socket disconnected.')
      })
    })
  }

  /** Push a newly created notification to whoever it is addressed to. */
  notifyCreated(notification: {
    userId?: number | null
    audience?: string
    toJSON?: () => unknown
  }): void {
    if (!this.io) return

    const payload = notification.toJSON ? notification.toJSON() : notification

    if (notification.audience === 'admin') {
      this.io.to(ADMIN_ROOM).emit('notification:new', payload)
      return
    }

    if (typeof notification.userId === 'number') {
      this.io.to(USER_ROOM(notification.userId)).emit('notification:new', payload)
      this.notifyUnreadCount(notification.userId)
    }
  }

  /**
   * Tell a client its unread badge changed.
   *
   * Sends a signal rather than a number: the count depends on whether the
   * viewer is an administrator, and the socket layer would have to duplicate
   * that rule to compute it. The client re-reads the endpoint that already
   * knows.
   */
  notifyUnreadCount(userId: number): void {
    this.io?.to(USER_ROOM(userId)).emit('notification:unread-count')
  }

  /** Operational events for the CMS dashboard. */
  broadcastToAdmins(event: string, payload: unknown): void {
    this.io?.to(ADMIN_ROOM).emit(event, payload)
  }
}

export const realtime = new Realtime()
