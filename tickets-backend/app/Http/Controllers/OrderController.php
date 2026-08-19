<?php

namespace App\Http\Controllers;

use App\Exceptions\PaymentFailedException;
use App\Http\Requests\PayOrderRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Responses\ApiResponse;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Handles HTTP requests for the Order resource and its payment flow.
 */
class OrderController extends Controller
{
    protected OrderService $service;

    /**
     * Inject the order service.
     *
     * @param  OrderService  $service  The business-logic service for orders.
     */
    public function __construct(OrderService $service)
    {
        $this->service = $service;
    }

    /**
     * List orders visible to the caller.
     *
     * Scoping to the current user happens in the repository, not here.
     *
     * @param  Request  $request  Incoming HTTP request.
     * @return JsonResponse
     */
    public function index(Request $request)
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
     * Show a single order.
     *
     * @param  mixed  $id  Order id.
     * @return JsonResponse
     */
    public function show($id)
    {
        try {
            $order = $this->service->show($id);

            // 404 rather than 403 for someone else's order: telling an
            // arbitrary caller that order 5012 exists but is not theirs turns
            // this endpoint into a way to count the shop's sales.
            if (auth('api')->user()->cannot('view', $order)) {
                return ApiResponse::error('Order not found.', null, 404);
            }

            return ApiResponse::success($order, 'Order fetched successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Order not found.', null, 404);
        }
    }

    /**
     * Store a newly created order.
     *
     * @param  StoreOrderRequest  $request  Validated create payload.
     * @return JsonResponse
     */
    public function store(StoreOrderRequest $request)
    {
        try {
            $order = $this->service->create($request->validated());

            return ApiResponse::success($order, 'Order created successfully.', 201);
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Ticket type not found.', null, 404);
        } catch (InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), null, 422);
        }
    }

    /**
     * Process payment for an order through the FastAPI gateway.
     *
     * @param  PayOrderRequest  $request  Validated payment payload.
     * @param  mixed  $id  Order id.
     * @return JsonResponse
     */
    public function pay(PayOrderRequest $request, $id)
    {
        try {
            // Checked before charging: without it, any authenticated account
            // could pay down someone else's order by guessing an id.
            if (auth('api')->user()->cannot('pay', $this->service->show($id))) {
                return ApiResponse::error('Order not found.', null, 404);
            }

            $payment = $this->service->pay($id, $request->validated());

            return ApiResponse::success($payment, 'Payment processed successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Order not found.', null, 404);
        } catch (PaymentFailedException $e) {
            return ApiResponse::error($e->getMessage(), null, 400);
        } catch (InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), null, 422);
        }
    }
}
