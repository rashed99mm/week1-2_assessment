<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation rules for updating an Event.
 */
class UpdateEventRequest extends FormRequest
{
    /**
     * Determine if the user is authorised to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array>
     */
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'venue' => ['nullable', 'string', 'max:255'],
            'event_type_id' => ['nullable', 'integer', 'exists:event_types,id'],
            'cover_image' => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
            'remove_cover' => ['sometimes', 'boolean'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'total_tickets' => ['nullable', 'integer', 'min:0'],
            'status' => ['sometimes', 'required', 'string', 'in:draft,published,cancelled'],
        ];
    }

    /**
     * Normalise the multipart "remove_cover" flag before validation.
     *
     * FormData transmits booleans as the strings "true"/"false"/"1"/"0"; casting
     * those directly would make "false" truthy, so route them through
     * Request::boolean(), which uses FILTER_VALIDATE_BOOLEAN.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('remove_cover')) {
            $this->merge(['remove_cover' => $this->boolean('remove_cover')]);
        }
    }
}
