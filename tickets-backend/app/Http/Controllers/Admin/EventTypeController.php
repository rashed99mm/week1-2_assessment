<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\ResourceInUseException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreEventTypeRequest;
use App\Http\Requests\Admin\UpdateEventTypeRequest;
use App\Http\Responses\ApiResponse;
use App\Services\EventTypeService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;

/**
 * Event-type CRUD for the admin CMS.
 *
 * The public EventTypeController is read-only — the storefront lists them to
 * build filter chips. Creating and deleting them is editorial work.
 */
class EventTypeController extends Controller
{
    public function __construct(protected EventTypeService $service) {}

    public function store(StoreEventTypeRequest $request): JsonResponse
    {
        $eventType = $this->service->create($request->validated());

        return ApiResponse::success($eventType, 'Event type created successfully.', 201)
            // 201 responses carry a Location header — see docs/contracts.
            ->header('Location', route('v1.event-types.show', $eventType->id));
    }

    public function update(UpdateEventTypeRequest $request, $id): JsonResponse
    {
        try {
            return ApiResponse::success(
                $this->service->update($id, $request->validated()),
                'Event type updated successfully.',
            );
        } catch (ModelNotFoundException) {
            return ApiResponse::error('Event type not found.', null, 404);
        }
    }

    public function destroy($id): JsonResponse
    {
        try {
            $this->service->delete($id);

            return ApiResponse::success(null, 'Event type deleted successfully.');
        } catch (ModelNotFoundException) {
            return ApiResponse::error('Event type not found.', null, 404);
        } catch (ResourceInUseException $e) {
            return ApiResponse::error($e->getMessage(), null, 409);
        }
    }
}
