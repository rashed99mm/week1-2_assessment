# Code Equivalents: .NET vs PHP vs Python

Mapping the patterns used in this project (`tickets-backend` = PHP/Laravel,
`payment-gateway` = Python/FastAPI) to their .NET equivalents
(ASP.NET Core + Entity Framework Core).

---

## 1. High-level stack map

| Concern | PHP — Laravel | Python — FastAPI | .NET — ASP.NET Core |
|---|---|---|---|
| Web framework | Laravel 13 | FastAPI 0.141 | ASP.NET Core (8/9) |
| Routing | `routes/api.php` | `APIRouter` + `include_router` | Controllers / Minimal APIs |
| Validation | `FormRequest::rules()` | Pydantic `BaseModel` + `Field` | Data Annotations / FluentValidation |
| ORM | Eloquent | SQLAlchemy 2.0 | Entity Framework Core |
| Migrations | `php artisan migrate` | `Base.metadata.create_all` (Alembic for prod) | `dotnet ef migrations` |
| DI container | `AppServiceProvider` bindings | `Depends(...)` | `builder.Services.AddScoped/AddTransient` |
| Config | `.env` + `config/services.php` | Pydantic settings (env) | `appsettings.json` + `IOptions<T>` |
| HTTP client | `Http::post(...)` facade | `httpx` | `HttpClient` + `IHttpClientFactory` |
| Response envelope | `ApiResponse<T>` | `ApiResponse[T]` | Generic `ApiResponse<T>` |
| Error handling | try/catch → status codes | `HTTPException` | Exceptions + middleware / `IExceptionHandler` |
| Health check | route | `GET /health` | `AddHealthChecks()` / `MapHealthChecks()` |
| Soft delete | `SoftDeletes` trait | — | Global query filter (`IsDeleted`) |
| Testing | PHPUnit (`php artisan test`) | pytest + `TestClient` | xUnit + `WebApplicationFactory<T>` |

---

## 2. Concept-by-concept mapping table

| # | Concept | PHP (this project) | Python (this project) | .NET equivalent |
|---|---|---|---|---|
| 1 | **REST resource route** | `Route::apiResource('events', EventController::class);` | `router = APIRouter(prefix="/payments")` then `app.include_router(router, prefix="/api/v1")` | `[ApiController]` + `[Route("api/events")]` + `[HttpGet]`/`[HttpPost]`; or Minimal API `app.MapGet("/api/events", ...)` |
| 2 | **Controller action** | `public function store(StoreEventRequest $request)` | `@router.post("/charge", response_model=ApiResponse[PaymentOut])` | `[HttpPost] public IActionResult Store([FromBody] StoreEventRequest req)` |
| 3 | **Input DTO** | `class StoreEventRequest extends FormRequest { rules() }` | `class ChargeRequest(BaseModel): order_id: int = Field(..., gt=0)` | `record StoreEventRequest { [Required] string Title; ... }` |
| 4 | **Validation rule** | `'price' => ['required','numeric','min:0']` | `amount: float = Field(..., gt=0)` | `[Range(0, double.MaxValue)]` or FluentValidation `RuleFor(x => x.Price).GreaterThanOrEqualTo(0)` |
| 5 | **Response envelope** | `ApiResponse::success($data, 'msg', 201)` / `::error($msg, $err, 404)` | `ApiResponse(success=True, message=..., status_code=200, data=PaymentOut.model_validate(p))` | `record ApiResponse<T>(bool Success, string Message, int StatusCode, T? Data, object? Errors);` returned via `Ok(...)` |
| 6 | **HTTP status mapping** | `ModelNotFoundException` → 404, `QueryException` → 409, `PaymentFailedException` → 400 | `HTTPException(404/400)`, Pydantic → 422 | `NotFound()` / `Conflict()` / `BadRequest()`; `[ApiController]` auto-400 on invalid model state |
| 7 | **ORM model** | `class Event extends Model { protected $casts = [...] }` | `class Payment(Base): __tablename__ = "payments"` | `public class Event { public int Id { get; set; } ... }` mapped in `DbContext` |
| 8 | **Money precision** | `decimal:2` cast (`Order`, `TicketType`) | SQLAlchemy `Numeric` column | C# native `decimal` + `HasPrecision(10, 2)` in `OnModelCreating` |
| 9 | **Find one / not found** | `TicketType::findOrFail($id)` throws | `db.get(Payment, id)` returns `None` → 404 | `_context.TicketTypes.FindAsync(id)` → `if (x is null) return NotFound();` |
| 10 | **Create + save** | `Order::create($data)` / `$repo->create($data)` | `self.db.add(p); self.db.commit(); self.db.refresh(p)` | `_context.Add(order); await _context.SaveChangesAsync();` |
| 11 | **Update** | `$ticketType->update($data)` | `payment.status = "refunded"; self.db.commit()` | set property + `SaveChangesAsync()` |
| 12 | **Delete / FK guard** | `TicketType::destroy($id)`; `QueryException` → 409 (restrict FK) | — | `Remove(entity); SaveChangesAsync()` catching `DbUpdateException` → `Conflict()` |
| 13 | **Soft delete** | `SoftDeletes` trait on `Event` | — | `ISoftDelete` + `modelBuilder.Entity<Event>().HasQueryFilter(e => !e.IsDeleted)` |
| 14 | **Service layer** | `class OrderService { pay($id, $data) }` | `class PaymentService: def charge(self, payload)` | `public class OrderService { PayAsync(...) }` registered via DI |
| 15 | **Repository pattern** | `OrderRepositoryInterface` → `EloquentOrderRepository`, bound in `AppServiceProvider` | thin — `PaymentService` uses `Session` directly | `IOrderRepository` → `EfOrderRepository`, `AddScoped<IOrderRepository, EfOrderRepository>()` |
| 16 | **HTTP call to gateway** | `Http::timeout(15)->post($url.'/api/v1/payments/charge', [...])` | httpx (tests); service uses SQLAlchemy | `_httpClient.PostAsJsonAsync("api/v1/payments/charge", payload)` via typed client + `IHttpClientFactory` |
| 17 | **External service config** | `config/services.php` + `PAYMENT_GATEWAY_URL` | `app/core/config.py` (Pydantic settings) | `"PaymentGateway": { "Url": "http://127.0.0.1:8001" }` in `appsettings.json` + `IOptions<PaymentGatewayOptions>` |
| 18 | **DB connection string** | `.env`: `DB_CONNECTION=sqlite` | `GATEWAY_DB_URL=sqlite:///./payment_gateway.sqlite3` | `"ConnectionStrings:Default"` + `UseSqlite(...)` |
| 19 | **Request-scoped session/context** | framework-managed | `def get_db(): db = SessionLocal(); yield db` | `AddDbContext` (scoped `DbContext` per request) |
| 20 | **Startup / entrypoint** | `bootstrap/app.php` | `main.py` (`FastAPI(...)`, `lifespan`) | `Program.cs` (`WebApplication.CreateBuilder`) |
| 21 | **Middleware / CORS** | HTTP kernel middleware stack | `CORSMiddleware` in `main.py` | `builder.Services.AddCors()` + `app.UseCors(...)` |
| 22 | **Pagination** | `paginate(15)` envelope | (list; not implemented) | LINQ `Skip()/Take()` or `X.PagedList` |
| 23 | **JSON serialization** | `response()->json([...])` | FastAPI `response_model` / Pydantic | `System.Text.Json` |
| 24 | **Seed data** | `DatabaseSeeder` | (none) | `modelBuilder.HasData(...)` / `EnsureSeedData()` |
| 25 | **Unit tests** | PHPUnit `tests/Unit/*` (Mockery, `Http::fake()`) | pytest `test_payment_service.py` | xUnit + Moq/NSubstitute |
| 26 | **Integration/API tests** | `tests/Feature/*` + `RefreshDatabase` (SQLite memory) | pytest + `TestClient` + in-memory SQLite | xUnit + `WebApplicationFactory<T>` + EF InMemory / Testcontainers |
| 27 | **Mock gateway rule** | `PaymentService::charge` (success/failed) | `amount <= 1000 and token.startswith("4242")` | same logic in a `PaymentService` / `IGatewayClient` stub |
| 28 | **Reference / unique id** | DB auto-increment | `TXN-{uuid.uuid4().hex[:16].upper()}` | `"TXN-" + Guid.NewGuid().ToString("N")[..16].ToUpperInvariant()` |

---

## 3. Side-by-side code examples

### 3.1 Create a resource (controller + validation + service)

**PHP (Laravel)** — `OrderController.php`
```php
public function store(StoreOrderRequest $request)
{
    $order = $this->service->create($request->validated());

    return ApiResponse::success($order, 'Order created successfully.', 201);
}
```

**Python (FastAPI)** — `payments.py`
```python
@router.post("/charge", response_model=ApiResponse[PaymentOut])
def charge(payload: ChargeRequest, svc: PaymentService = Depends(service)):
    payment = svc.charge(payload)
    return ApiResponse(
        success=True, message="Payment approved.",
        status_code=200, data=PaymentOut.model_validate(payment),
    )
```

**.NET (ASP.NET Core)**
```csharp
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _service;

    public OrdersController(IOrderService service) => _service = service;

    [HttpPost]
    public async Task<ActionResult<ApiResponse<OrderDto>>> Store(StoreOrderRequest request)
    {
        var order = await _service.CreateAsync(request);
        return StatusCode(201, ApiResponse<OrderDto>.Success(order, "Order created successfully."));
    }
}
```

### 3.2 Validation rules

**PHP** — `StoreTicketTypeRequest.php`
```php
public function rules(): array
{
    return [
        'price'    => ['required', 'numeric', 'min:0'],
        'quantity' => ['required', 'integer', 'min:1'],
    ];
}
```

**Python** — `schemas/payment.py`
```python
amount:     float = Field(..., gt=0, description="Amount to charge")
card_token: str  = Field(..., min_length=4, description="Mock card token")
```

**.NET**
```csharp
public class StoreTicketTypeRequest
{
    [Required, Range(0, double.MaxValue)] public decimal Price { get; set; }
    [Required, Range(1, int.MaxValue)]    public int     Quantity { get; set; }
}
```

### 3.3 Response envelope (the `Response<T>` contract)

**PHP** — `ApiResponse.php`
```php
public static function success(mixed $data, string $message = 'Success', int $status = 200): JsonResponse
{
    return response()->json([
        'success' => true, 'message' => $message, 'status_code' => $status,
        'data' => $data, 'errors' => null,
    ], $status);
}
```

**Python** — `schemas/response.py`
```python
class ApiResponse(BaseModel, Generic[T]):
    success: bool
    message: str
    status_code: int
    data: Optional[T] = None
    errors: Optional[dict] = None
```

**.NET**
```csharp
public record ApiResponse<T>(
    bool Success, string Message, int StatusCode, T? Data, object? Errors)
{
    public static ApiResponse<T> Ok(T data, string message = "Success", int status = 200)
        => new(true, message, status, data, null);

    public static ApiResponse<T> Fail(string message, object? errors = null, int status = 400)
        => new(false, message, status, default, errors);
}

// In a controller:
return Ok(ApiResponse<EventDto>.Ok(event, "Event created successfully.", 201));
```

### 3.4 Find one, or return 404

**PHP**
```php
try {
    return ApiResponse::success($this->service->show($id), 'Event fetched successfully.');
} catch (ModelNotFoundException $e) {
    return ApiResponse::error('Event not found.', null, 404);
}
```

**Python**
```python
payment = svc.get(payment_id)
if payment is None:
    raise HTTPException(status_code=404, detail="Payment not found.")
return ApiResponse(success=True, message="Payment fetched successfully.",
                   status_code=200, data=PaymentOut.model_validate(payment))
```

**.NET**
```csharp
[HttpGet("{id}")]
public async Task<ActionResult<ApiResponse<EventDto>>> Get(int id)
{
    var @event = await _service.GetByIdAsync(id);
    return @event is null
        ? NotFound(ApiResponse<EventDto>.Fail("Event not found.", status: 404))
        : Ok(ApiResponse<EventDto>.Ok(@event, "Event fetched successfully."));
}
```

### 3.5 ORM model with money precision

**PHP** — `Order.php`
```php
protected $casts = [
    'unit_price'   => 'decimal:2',
    'total_amount' => 'decimal:2',
];
```

**Python** — `models/payment.py` (SQLAlchemy)
```python
amount = mapped_column(Numeric(10, 2), nullable=False)
```

**.NET** — `Order.cs` + `AppDbContext.cs`
```csharp
public class Order
{
    public int Id { get; set; }
    [Column(TypeName = "decimal(10,2)")]
    public decimal UnitPrice { get; set; }
    [Column(TypeName = "decimal(10,2)")]
    public decimal TotalAmount { get; set; }
}

// AppDbContext.OnModelCreating
modelBuilder.Entity<Order>()
    .Property(o => o.UnitPrice).HasPrecision(10, 2);
modelBuilder.Entity<Order>()
    .Property(o => o.TotalAmount).HasPrecision(10, 2);
```

### 3.6 Service → HTTP call to the payment gateway

**PHP** — `PaymentService.php`
```php
$response = Http::timeout(15)->post($this->baseUrl.'/api/v1/payments/charge', [
    'order_id' => $order->id,
    'amount'   => (float) $order->total_amount,
    'currency' => 'USD',
    'card_token' => $cardToken,
]);

if ($response->failed()) {
    throw new PaymentFailedException('Payment gateway is unreachable.');
}
```

**Python** — same business logic in `PaymentService.charge` (mock rule in-process).

**.NET** — typed client + `IHttpClientFactory`
```csharp
public interface IGatewayClient
{
    Task<GatewayChargeResult?> ChargeAsync(GatewayChargeRequest request, CancellationToken ct = default);
}

public class GatewayClient(HttpClient http) : IGatewayClient
{
    public async Task<GatewayChargeResult?> ChargeAsync(GatewayChargeRequest req, CancellationToken ct = default)
    {
        var resp = await http.PostAsJsonAsync("api/v1/payments/charge", req, ct);
        if (!resp.IsSuccessStatusCode) return null;
        return await resp.Content.ReadFromJsonAsync<GatewayChargeResult>(ct);
    }
}

// Program.cs
builder.Services.AddHttpClient<IGatewayClient, GatewayClient>(client =>
    client.BaseAddress = new Uri(builder.Configuration["PaymentGateway:Url"]!));
```

---

## 4. Renaming quick-reference

| This project (PHP/Python) | .NET name |
|---|---|
| `routes/api.php` | `Program.cs` mapping + controllers |
| `AppServiceProvider` | `Program.cs` service registration |
| `FormRequest` | `[FromBody]` DTO + `[ApiController]` validation |
| `RepositoryInterface` | `IRepository` / `IOrderRepository` |
| `ApiResponse` helper | `ApiResponse<T>` record |
| `SoftDeletes` trait | `ISoftDelete` + global query filter |
| `php artisan migrate` | `dotnet ef migrations add X && dotnet ef database update` |
| `Http` facade | `HttpClient` (typed via `IHttpClientFactory`) |
| `.env` / `config/services.php` | `appsettings.json` + `IOptions<T>` |
| `bootstrap/app.php` | `Program.cs` |
| `DatabaseSeeder` | `HasData()` / `EnsureSeedData()` |
| `php artisan test` | `dotnet test` (xUnit) |
