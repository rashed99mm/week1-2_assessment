<?php

namespace App\Services;

use App\Exceptions\PaymentFailedException;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Facades\Http;

/**
 * Communicates with the FastAPI payment gateway and persists payments.
 */
class PaymentService
{
    protected string $baseUrl;

    /**
     * Resolve the gateway base URL from configuration.
     */
    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.payment_gateway.url'), '/');
    }

    /**
     * Charge an order through the gateway and record the payment.
     *
     * @param  Order  $order  The order to charge.
     * @param  string  $cardToken  Mock card token sent to the gateway.
     * @return Payment
     *
     * @throws PaymentFailedException When the gateway is unreachable or declines the payment.
     */
    public function charge(Order $order, string $cardToken): Payment
    {
        $response = Http::timeout(15)->post($this->baseUrl.'/api/v1/payments/charge', [
            'order_id' => $order->id,
            'amount' => (float) $order->total_amount,
            'currency' => 'USD',
            'card_token' => $cardToken,
        ]);

        if ($response->failed()) {
            throw new PaymentFailedException('Payment gateway is unreachable.');
        }

        $body = $response->json();
        $gatewayStatus = $body['data']['status'] ?? null;
        $gatewayRef = $body['data']['gateway_reference'] ?? null;

        $payment = Payment::create([
            'order_id' => $order->id,
            'amount' => $order->total_amount,
            'currency' => 'USD',
            'status' => $gatewayStatus === 'success' ? 'success' : 'failed',
            'gateway_reference' => $gatewayRef,
            'paid_at' => $gatewayStatus === 'success' ? now() : null,
        ]);

        if ($gatewayStatus === 'success') {
            $order->update(['status' => 'paid']);

            return $payment;
        }

        $order->update(['status' => 'failed']);

        throw new PaymentFailedException($body['message'] ?? 'Payment was declined by the gateway.');
    }
}
