<?php

namespace App\Http\Controllers;

use App\Http\Responses\ApiResponse;
use App\Services\EventTypeService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;

/**
 * Handles HTTP requests for the EventType resource.
 */
class EventTypeController extends Controller
{
    protected EventTypeService $service;

    /**
     * Inject the event type service.
     *
     * @param  EventTypeService  $service  The business-logic service for event types.
     */
    public function __construct(EventTypeService $service)
    {
        $this->service = $service;
    }

    /**
     * List all event types.
     *
     * @return JsonResponse
     */
    public function index()
    {
        return ApiResponse::success($this->service->index(), 'Event types fetched successfully.');
    }

    /**
     * Show a single event type.
     *
     * @param  mixed  $id  Event type id.
     * @return JsonResponse
     */
    public function show($id)
    {
        try {
            return ApiResponse::success($this->service->show($id), 'Event type fetched successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Event type not found.', null, 404);
        }
    }
}
