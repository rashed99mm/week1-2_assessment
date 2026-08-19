<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Validates an update to an event type.
 */
class UpdateEventTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    protected function prepareForValidation(): void
    {
        $slug = $this->input('slug');

        if (is_string($slug) && $slug !== '') {
            $this->merge(['slug' => Str::slug($slug)]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // The uniqueness rules have to ignore the row being edited, or saving
        // a form without changing the name fails against its own record.
        $id = $this->route('id');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('event_types', 'name')->ignore($id)],
            'slug' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('event_types', 'slug')->ignore($id)],
            'is_online' => ['sometimes', 'boolean'],
            'seating_model' => ['sometimes', Rule::in(['assigned', 'general'])],
        ];
    }
}
