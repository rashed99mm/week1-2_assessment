<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Validates creation of an event type.
 */
class StoreEventTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    /**
     * Derive the slug from the name when the client did not supply one.
     *
     * The CMS offers a slug field with a manual override, but leaving it blank
     * is the common case and a slug is required by the unique index.
     */
    protected function prepareForValidation(): void
    {
        $name = $this->input('name');
        $slug = $this->input('slug');

        if ((! is_string($slug) || $slug === '') && is_string($name)) {
            $this->merge(['slug' => Str::slug($name)]);
        } elseif (is_string($slug)) {
            $this->merge(['slug' => Str::slug($slug)]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('event_types', 'name')],
            'slug' => ['required', 'string', 'max:100', Rule::unique('event_types', 'slug')],
            'is_online' => ['sometimes', 'boolean'],
            // Drives which seat-map the storefront renders for the event.
            'seating_model' => ['sometimes', Rule::in(['assigned', 'general'])],
        ];
    }
}
