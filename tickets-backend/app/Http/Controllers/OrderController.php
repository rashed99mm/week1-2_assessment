<?php

namespace App\Http\Controllers;

use App\Exceptions\PaymentFailedException;
use App\Http\Requests\PayOrderRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Responses\ApiResponse;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
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
     * List all orders.
     *
     * @return JsonResponse
     */
    public function index()
    {
        return ApiResponse::success($this->service->index(), 'Orders fetched successfully.');
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
            return ApiResponse::success($this->service->show($id), 'Order fetched successfully.');
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
