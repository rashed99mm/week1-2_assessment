<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation rules for creating an Event.
 */
class StoreEventRequest extends FormRequest
{
    /**
     * Determine if the user is authorised to make this request.
     *
     * The route already carries the `admin` middleware, so this is a second
     * lock on the same door: it keeps the rule attached to the request object
     * itself, so moving this route out of the admin group by accident fails
     * closed instead of silently opening the endpoint to every account.
     */
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'venue' => ['nullable', 'string', 'max:255'],
            'event_type_id' => ['nullable', 'integer', 'exists:event_types,id'],
            'cover_image' => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'total_tickets' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'string', 'in:draft,published,cancelled'],
        ];
    }
}
