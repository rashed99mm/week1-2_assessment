<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation rules for registering a new user account.
 */
class RegisterRequest extends FormRequest
{
    /**
     * Determine if the user is authorised to make this request.
     *
     * @return bool  Always true — registration is a public endpoint.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalize the email to lowercase before validation so the unique rule
     * is case-insensitive and stored values are canonical.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge([
                'email' => strtolower($this->input('email')),
            ]);
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Passwords require at least one lower case letter, one upper case letter
     * and one digit for a minimum strength baseline, and must be confirmed.
     *
     * @return array<string, array>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => [
                'required',
                'string',
                'confirmed',
                'min:8',
                'regex:/[a-z]/',
                'regex:/[A-Z]/',
                'regex:/[0-9]/',
            ],
        ];
    }
}
