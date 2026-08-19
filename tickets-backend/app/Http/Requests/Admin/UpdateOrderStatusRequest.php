<?php

namespace App\Http\Requests\Admin;

use App\Models\Order;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates an administrator changing an order's status.
 */
class UpdateOrderStatusRequest extends FormRequest
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
            // Cancellation only. Marking an order paid without money moving,
            // or refunded without calling the gateway, would put these records
            // out of step with the payment provider. Refunds have their own
            // endpoint, which does call the gateway.
            'status' => ['required', Rule::in([Order::STATUS_CANCELLED])],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'status.in' => 'Only cancellation is supported here. Use the refund endpoint to refund an order.',
        ];
    }
}
