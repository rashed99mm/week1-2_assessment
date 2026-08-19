<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation rules for creating or updating a TicketType.
 */
class StoreTicketTypeRequest extends FormRequest
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
            'event_id' => ['required', 'integer', 'exists:events,id'],
            'name' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'quantity' => ['required', 'integer', 'min:1'],
        ];
    }
}
