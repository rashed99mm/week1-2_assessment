import type { FastifyInstance } from 'fastify'
import { fail, ok, paginate } from '../../core/api-response.js'
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '../../services/notification.service.js'
import { requireAuth } from '../plugins/auth.plugin.js'

const MAX_PER_PAGE = 100

/**
 * The in-app notification API, consumed by both the React portal's bell menu
 * and the Angular CMS.
 *
 * Responses use the same envelope and the same paginator field names as
 * tickets-backend, so a single client-side `Paginated<T>` type works against
 * either. See docs/contracts/api-response.md.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.get('/notifications', async (request) => {
    const query = request.query as { page?: string; per_page?: string; status?: string }
    const user = request.user!

    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, Number.parseInt(query.per_page ?? '15', 10) || 15),
    )
    const status = query.status === 'unread' ? 'unread' : 'all'

    const { items, total } = await listNotifications({
      userId: user.id,
      isAdmin: user.isAdmin,
      status,
      page,
      perPage,
    })

    return ok(
      paginate(items, total, page, perPage, '/notifications/api/v1/notifications'),
      'Notifications fetched successfully.',
    )
  })

  app.get('/notifications/unread-count', async (request) => {
    const user = request.user!

    return ok({ count: await unreadCount(user.id, user.isAdmin) }, 'Unread count fetched.')
  })

  app.patch('/notifications/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user!

    // Not found rather than forbidden for another user's notification:
    // distinguishing the two would confirm the id exists.
    if (!(await markRead(id, user.id, user.isAdmin))) {
      return reply.code(404).send(fail('Notification not found.', 404))
    }

    return ok(null, 'Notification marked as read.')
  })

  app.post('/notifications/read-all', async (request) => {
    const user = request.user!
    const updated = await markAllRead(user.id, user.isAdmin)

    return ok({ updated }, 'Notifications marked as read.')
  })
}
