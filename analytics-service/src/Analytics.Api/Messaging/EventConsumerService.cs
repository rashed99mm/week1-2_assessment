using System.Text.Json;
using Analytics.Api.Contracts;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Analytics.Api.Messaging;

public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string User { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string VirtualHost { get; set; } = "/";
    public string Queue { get; set; } = "analytics.events";

    /// <summary>Bounded so a crash loses at most this many in-flight messages.</summary>
    public ushort Prefetch { get; set; } = 20;

    /// <summary>Lets the test host skip the broker entirely.</summary>
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// Consumes domain events from RabbitMQ and hands them to the processor.
/// </summary>
/// <remarks>
/// Does not declare the queue or the exchange — the topology is loaded into
/// the broker from infra/rabbitmq/definitions.json at start-up. Declaring it
/// here would mean two deployed versions of this service could disagree about
/// queue arguments and take each other down with a PRECONDITION_FAILED.
///
/// See docs/contracts/broker-topology.md.
/// </remarks>
public sealed class EventConsumerService(
    IOptions<RabbitMqOptions> options,
    IServiceScopeFactory scopeFactory,
    ILogger<EventConsumerService> logger) : BackgroundService
{
    private readonly RabbitMqOptions _options = options.Value;

    private IConnection? _connection;
    private IChannel? _channel;

    /// <summary>Whether the broker is currently reachable, for the health check.</summary>
    public bool Connected => _channel?.IsOpen == true;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            logger.LogInformation("Broker consumption disabled.");
            return;
        }

        var delay = TimeSpan.FromSeconds(1);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConnectAndConsumeAsync(stoppingToken);

                // Connected; hold here until shutdown or the connection drops.
                delay = TimeSpan.FromSeconds(1);

                while (!stoppingToken.IsCancellationRequested && Connected)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception e)
            {
                logger.LogError(e, "Broker connection failed; retrying in {Delay}.", delay);
            }

            if (stoppingToken.IsCancellationRequested) break;

            // Backoff rather than exit. A container that dies because the
            // broker is slow to start turns a ten-second delay into a
            // crash-loop backoff, which takes far longer to recover from.
            await Task.Delay(delay, stoppingToken);
            delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 30));
        }
    }

    private async Task ConnectAndConsumeAsync(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory
        {
            HostName = _options.Host,
            Port = _options.Port,
            UserName = _options.User,
            Password = _options.Password,
            VirtualHost = _options.VirtualHost,
            AutomaticRecoveryEnabled = true,
        };

        _connection = await factory.CreateConnectionAsync(stoppingToken);
        _channel = await _connection.CreateChannelAsync(cancellationToken: stoppingToken);

        await _channel.BasicQosAsync(0, _options.Prefetch, false, stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += OnReceivedAsync;

        await _channel.BasicConsumeAsync(
            _options.Queue,
            autoAck: false,
            consumer,
            cancellationToken: stoppingToken);

        logger.LogInformation("Consuming {Queue}.", _options.Queue);
    }

    private async Task OnReceivedAsync(object sender, BasicDeliverEventArgs args)
    {
        if (_channel is null) return;

        DomainEventEnvelope? envelope;

        try
        {
            envelope = JsonSerializer.Deserialize<DomainEventEnvelope>(
                args.Body.Span,
                EventJson.Options);
        }
        catch (Exception e)
        {
            // Poison. Requeueing a malformed message redelivers it forever and
            // looks like broker load rather than a bad message.
            logger.LogError(e, "Malformed envelope; dead-lettering.");
            await _channel.BasicNackAsync(args.DeliveryTag, false, requeue: false);
            return;
        }

        if (envelope is null)
        {
            await _channel.BasicNackAsync(args.DeliveryTag, false, requeue: false);
            return;
        }

        // A scope per message: the processor and its projectors are scoped, so
        // one message's failure cannot leave state behind for the next.
        using var scope = scopeFactory.CreateScope();
        var processor = scope.ServiceProvider.GetRequiredService<EventProcessor>();

        var result = await processor.ProcessAsync(envelope, CancellationToken.None);

        switch (result)
        {
            case ProcessResult.Handled:
            case ProcessResult.Ignored:
                await _channel.BasicAckAsync(args.DeliveryTag, false);
                break;

            case ProcessResult.Poison:
                await _channel.BasicNackAsync(args.DeliveryTag, false, requeue: false);
                break;

            case ProcessResult.Retry:
                // x-delivery-limit on the queue dead-letters after 5 attempts.
                await _channel.BasicNackAsync(args.DeliveryTag, false, requeue: true);
                break;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_channel is not null) await _channel.CloseAsync(cancellationToken);
        if (_connection is not null) await _connection.CloseAsync(cancellationToken);

        await base.StopAsync(cancellationToken);
    }
}
