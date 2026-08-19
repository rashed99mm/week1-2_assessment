<?php

namespace App\Support\Messaging;

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use RuntimeException;
use Throwable;

/**
 * Publishes domain events to the `tickets.events` topic exchange.
 *
 * Deliberately does not declare the exchange. The topology is loaded into the
 * broker from infra/rabbitmq/definitions.json at start-up, so no service owns
 * it — which means no service can bring another one down by declaring the same
 * object with different arguments and triggering a PRECONDITION_FAILED.
 *
 * See docs/contracts/broker-topology.md.
 */
class RabbitMqPublisher implements EventPublisher
{
    private ?AMQPStreamConnection $connection = null;

    /**
     * @param  array<string, mixed>  $config  The `messaging.rabbitmq` config block.
     */
    public function __construct(private readonly array $config) {}

    public function publish(array $envelope, string $routingKey): void
    {
        try {
            $channel = $this->connection()->channel();

            $message = new AMQPMessage(
                json_encode($envelope, JSON_THROW_ON_ERROR),
                [
                    // Mirrors of the envelope, so an operator reading the
                    // management UI can identify a message without opening it.
                    'message_id' => $envelope['id'],
                    'type' => $envelope['type'],
                    'timestamp' => strtotime($envelope['occurredAt']),
                    'app_id' => $envelope['source'],
                    'correlation_id' => $envelope['correlationId'] ?? '',
                    'content_type' => 'application/json',
                    'content_encoding' => 'utf-8',
                    // Survives a broker restart. The queues are durable and the
                    // exchange is durable; a transient message would still be
                    // dropped, which defeats the point of the outbox.
                    'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
                ],
            );

            $channel->basic_publish($message, $this->config['exchange'], $routingKey);
            $channel->close();
        } catch (Throwable $e) {
            // Drop the connection so the next attempt reconnects rather than
            // reusing a socket the broker has already closed.
            $this->disconnect();

            throw new RuntimeException(
                "Failed to publish [{$routingKey}] to RabbitMQ: {$e->getMessage()}",
                previous: $e,
            );
        }
    }

    /**
     * Open the connection lazily and reuse it.
     *
     * Queue workers process many events per process; a fresh TCP connection
     * and AMQP handshake per event would dominate the cost of publishing.
     */
    private function connection(): AMQPStreamConnection
    {
        if ($this->connection !== null && $this->connection->isConnected()) {
            return $this->connection;
        }

        return $this->connection = new AMQPStreamConnection(
            host: $this->config['host'],
            port: (int) $this->config['port'],
            user: $this->config['user'],
            password: $this->config['password'],
            vhost: $this->config['vhost'],
            connection_timeout: (float) $this->config['connection_timeout'],
            read_write_timeout: (float) $this->config['read_write_timeout'],
            keepalive: true,
            heartbeat: (int) $this->config['heartbeat'],
        );
    }

    private function disconnect(): void
    {
        try {
            $this->connection?->close();
        } catch (Throwable) {
            // Already gone; nothing useful to do or report.
        }

        $this->connection = null;
    }

    public function __destruct()
    {
        $this->disconnect();
    }
}
