<?php

namespace App\Http\Requests\Admin;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a role change.
 *
 * The guards that actually matter — refusing self-demotion and refusing to
 * remove the last administrator — live in the controller, because both need to
 * compare against the current user and the rest of the table.
 */
class UpdateUserRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in(UserRole::values())],
        ];
    }
}
