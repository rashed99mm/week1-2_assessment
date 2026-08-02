<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTicketTypeRequest;
use App\Http\Requests\UpdateTicketTypeRequest;
use App\Http\Responses\ApiResponse;
use App\Services\TicketTypeService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

/**
 * Handles HTTP requests for the TicketType resource.
 */
class TicketTypeController extends Controller
{
    protected TicketTypeService $service;

    /**
     * Inject the ticket type service.
     *
     * @param  TicketTypeService  $service  The business-logic service for ticket types.
     */
    public function __construct(TicketTypeService $service)
    {
        $this->service = $service;
    }

    /**
     * List ticket types, optionally filtered by event id.
     *
     * @param  Request  $request  Incoming HTTP request.
     * @return JsonResponse
     */
    public function index(Request $request)
    {
        $ticketTypes = $this->service->index($request->integer('event_id') ?: null);

        return ApiResponse::success($ticketTypes, 'Ticket types fetched successfully.');
    }

    /**
     * Show a single ticket type.
     *
     * @param  mixed  $id  Ticket type id.
     * @return JsonResponse
     */
    public function show($id)
    {
        try {
            $ticketType = $this->service->show($id);

            return ApiResponse::success($ticketType, 'Ticket type fetched successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Ticket type not found.', null, 404);
        }
    }

    /**
     * Store a newly created ticket type.
     *
     * @param  StoreTicketTypeRequest  $request  Validated create payload.
     * @return JsonResponse
     */
    public function store(StoreTicketTypeRequest $request)
    {
        $ticketType = $this->service->create($request->validated());

        return ApiResponse::success($ticketType, 'Ticket type created successfully.', 201);
    }

    /**
     * Update an existing ticket type.
     *
     * @param  UpdateTicketTypeRequest  $request  Validated update payload.
     * @param  mixed  $id  Ticket type id.
     * @return JsonResponse
     */
    public function update(UpdateTicketTypeRequest $request, $id)
    {
        try {
            $ticketType = $this->service->update($id, $request->validated());

            return ApiResponse::success($ticketType, 'Ticket type updated successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Ticket type not found.', null, 404);
        }
    }

    /**
     * Delete a ticket type.
     *
     * @param  mixed  $id  Ticket type id.
     * @return JsonResponse
     */
    public function destroy($id)
    {
        try {
            $this->service->delete($id);

            return ApiResponse::success(null, 'Ticket type deleted successfully.');
        } catch (ModelNotFoundException $e) {
            return ApiResponse::error('Ticket type not found.', null, 404);
        } catch (QueryException $e) {
            return ApiResponse::error('Cannot delete ticket type because it has associated orders.', null, 409);
        }
    }
}
