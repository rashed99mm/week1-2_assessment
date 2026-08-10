<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreEventRequest;
use App\Http\Requests\UpdateEventRequest;
use App\Http\Responses\ApiResponse;
use App\Services\EventService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Throwable;

/**
 * Handles HTTP requests for the Event resource.
 */
class EventController extends Controller
{
    protected EventService $service;

    /**
     * Inject the event service.
     *
     * @param  EventService  $service  The business-logic service for events.
     */
    public function __construct(EventService $service)
    {
        $this->service = $service;
    }

    /**
     * List events with optional filtering, sorting and pagination.
     *
     * @param  Request  $request  Incoming HTTP request.
     * @return JsonResponse
     */
    public function index(Request $request)
    {
        $events = $this->service->index(
            $request->input('filters', []),
            $request->input('sort_by', 'created_at'),
            $request->input('sort_order', 'desc'),
            $request->integer('per_page', 15)
        );

        return ApiResponse::success($events, 'Events fetched successfully.');
    }

    /**
     * Show a single event.
     *
     * @param  mixed  $id  Event id.
     * @return JsonResponse
     */
    public function show($id)
    {
        try {
            $event = $this->service->show($id);

            return ApiResponse::success($event, 'Event fetched successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Event not found.', null, 404);
        }
    }

    /**
     * Show seat availability (sold counts per ticket type) for an event.
     *
     * Public read-only endpoint so visitors can see which seats are taken
     * without exposing order or customer data.
     *
     * @param  mixed  $id  Event id.
     * @return JsonResponse
     */
    public function availability($id)
    {
        try {
            $availability = $this->service->availability($id);

            return ApiResponse::success($availability, 'Availability fetched successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Event not found.', null, 404);
        }
    }

    /**
     * Store a newly created event.
     *
     * @param  StoreEventRequest  $request  Validated create payload.
     * @return JsonResponse
     */
    public function store(StoreEventRequest $request)
    {
        $event = $this->service->create($request->validated());

        return ApiResponse::success($event, 'Event created successfully.', 201);
    }

    /**
     * Update an existing event.
     *
     * @param  UpdateEventRequest  $request  Validated update payload.
     * @param  mixed  $id  Event id.
     * @return JsonResponse
     */
    public function update(UpdateEventRequest $request, $id)
    {
        try {
            $event = $this->service->update($id, $request->validated());

            return ApiResponse::success($event, 'Event updated successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Event not found.', null, 404);
        }
    }

    /**
     * Delete an event.
     *
     * @param  mixed  $id  Event id.
     * @return JsonResponse
     */
    public function destroy($id)
    {
        try {
            $this->service->delete($id);

            return ApiResponse::success(null, 'Event deleted successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Event not found.', null, 404);
        } catch (Throwable $e) {
            return ApiResponse::error('Failed to delete event.', $e->getMessage(), 500);
        }
    }
}
