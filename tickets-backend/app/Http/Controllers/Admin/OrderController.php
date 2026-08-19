<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\PaymentFailedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RefundOrderRequest;
use App\Http\Requests\Admin\UpdateOrderStatusRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Order management for the admin CMS.
 *
 * Separate from the customer-facing OrderController because the two answer
 * different questions. A customer asks "where is my order"; an administrator
 * asks "show me every failed payment for this event last week, and refund that
 * one". Sharing a controller would mean one endpoint whose behaviour depends
 * on who is calling it, which is how scoping bugs get written.
 *
 * The whole group sits behind `jwt.auth` + `admin`.
 */
class OrderController extends Controller
{
    public function __construct(protected OrderService $service) {}

    /**
     * List every order, filtered and paginated.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->input('filters', []);

        return ApiResponse::success(
            $this->service->index(
                is_array($filters) ? $filters : [],
                $request->integer('per_page', 15),
            ),
            'Orders fetched successfully.',
        );
    }

    /**
     * Show one order with its payments and the account that placed it.
     */
    public function show($id): JsonResponse
    {
        try {
            $order = Order::with(['event', 'ticketType', 'payments', 'user'])->findOrFail($id);

            return ApiResponse::success($order, 'Order fetched successfully.');
        } catch (ModelNotFoundException) {
            return ApiResponse::error('Order not found.', null, 404);
        }
    }

    /**
     * Move an order to a new status.
     *
     * Only cancellation is offered. Marking an order paid without money having
     * moved, or refunded without calling the gateway, would put the local
     * records out of step with the payment provider — and the CMS is exactly
     * where someone would reach for that shortcut. Refunds go through refund().
     */
    public function updateStatus(UpdateOrderStatusRequest $request, $id): JsonResponse
    {
        try {
            $order = $this->service->cancel($id, $request->validated()['reason'] ?? null);

            return ApiResponse::success($order, 'Order status updated successfully.');
        } catch (ModelNotFoundException) {
            return ApiResponse::error('Order not found.', null, 404);
        } catch (InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), null, 422);
        }
    }

    /**
     * Refund a paid order through the gateway and return its tickets to stock.
     */
    public function refund(RefundOrderRequest $request, $id): JsonResponse
    {
        try {
            $order = $this->service->refund($id, $request->validated()['reason'] ?? null);

            return ApiResponse::success($order, 'Order refunded successfully.');
        } catch (ModelNotFoundException) {
            return ApiResponse::error('Order not found.', null, 404);
        } catch (PaymentFailedException $e) {
            // The gateway's own message is the useful part here — "already
            // refunded" and "gateway unreachable" need different responses from
            // the person on the other end of the phone.
            return ApiResponse::error($e->getMessage(), null, 400);
        } catch (InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), null, 422);
        }
    }
}
