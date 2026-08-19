<?php

namespace App\Services;

use App\Domain\Events\DomainEventRecorder;
use App\Domain\Events\OrderPaid;
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
     *
     * @throws PaymentFailedException When the gateway is unreachable or declines.
     */
    public function charge(Order $order, string $cardToken): Payment
    {
        $response = Http::timeout(15)
            ->withHeaders($this->gatewayHeaders())
            ->post($this->baseUrl.'/api/v1/payments/charge', [
                'order_id' => $order->id,
                // Sent as the decimal string the cast already produces, not
                // cast to float. The gateway stores an exact decimal and
                // rejects more than two places; routing the value through a
                // binary float first is a needless opportunity for it to
                // arrive as 1234.5599999999999.
                'amount' => (string) $order->total_amount,
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
            // The gateway keys its refund endpoint on its own integer id, not
            // on the reference string, and it offers no lookup-by-reference.
            // Failing to capture this at charge time makes the payment
            // permanently unrefundable — there is no way to recover it later.
            'gateway_payment_id' => $body['data']['id'] ?? null,
            'paid_at' => $gatewayStatus === 'success' ? now() : null,
        ]);

        if ($gatewayStatus === 'success') {
            $order->update(['status' => Order::STATUS_PAID, 'expires_at' => null]);

            // The revenue-bearing event. Analytics derives gross revenue,
            // tickets sold and paid-order counts from this; notifications
            // sends the receipt and the e-ticket.
            app(DomainEventRecorder::class)->record(new OrderPaid($order, $payment));

            return $payment;
        }

        // A declined charge used to leave the order `failed` while its tickets
        // stayed decremented, so every rejected card permanently destroyed
        // inventory. Return the seats to the pool.
        app(OrderService::class)->transitionAndRestoreStock($order->id, Order::STATUS_FAILED);

        throw new PaymentFailedException($body['message'] ?? 'Payment was declined by the gateway.');
    }

    /**
     * Refund a successful payment through the gateway.
     *
     * @throws PaymentFailedException When the payment cannot be refunded.
     */
    public function refund(Payment $payment, ?string $reason = null): Payment
    {
        if ($payment->status !== 'success') {
            throw new PaymentFailedException('Only successful payments can be refunded.');
        }

        // Payments taken before `gateway_payment_id` was captured cannot be
        // refunded through the gateway, and there is no way to backfill it.
        // Say so plainly rather than surfacing a confusing gateway error.
        if ($payment->gateway_payment_id === null) {
            throw new PaymentFailedException(
                'This payment predates refund support and cannot be refunded automatically. Refund it directly with the payment provider.'
            );
        }

        $response = Http::timeout(15)
            ->withHeaders($this->gatewayHeaders())
            ->post($this->baseUrl."/api/v1/payments/{$payment->gateway_payment_id}/refund", [
                'reason' => $reason ?? '',
            ]);

        if ($response->failed()) {
            throw new PaymentFailedException('Payment gateway is unreachable.');
        }

        $body = $response->json();

        if (($body['data']['status'] ?? null) !== 'refunded') {
            throw new PaymentFailedException($body['message'] ?? 'The gateway refused the refund.');
        }

        $payment->update(['status' => 'refunded']);

        return $payment;
    }

    /**
     * Headers identifying this service to the gateway.
     *
     * The gateway is not reachable from outside the internal network, but a
     * shared key means a compromised sibling container still cannot mint
     * payments. Omitted when unconfigured so local development keeps working.
     *
     * @return array<string, string>
     */
    private function gatewayHeaders(): array
    {
        $key = config('services.payment_gateway.key');

        return $key ? ['X-Gateway-Key' => $key] : [];
    }
}
