<?php

namespace App\Http\Controllers;

use App\Exceptions\InvalidCredentialsException;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Responses\ApiResponse;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;

/**
 * Handles HTTP requests for user registration and JWT authentication.
 */
class AuthController extends Controller
{
    protected AuthService $service;

    /**
     * Inject the authentication service.
     *
     * @param  AuthService  $service  The business-logic service for auth.
     */
    public function __construct(AuthService $service)
    {
        $this->service = $service;
    }

    /**
     * Register a new user account and return a signed token.
     *
     * @param  RegisterRequest  $request  Validated register payload.
     * @return JsonResponse  User + JWT, HTTP 201.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $result = $this->service->register($request->validated());

        return ApiResponse::success($result, 'Account created successfully.', 201);
    }

    /**
     * Authenticate an existing user and return a signed token.
     *
     * @param  LoginRequest  $request  Validated login payload.
     * @return JsonResponse  User + JWT, HTTP 200.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        try {
            $result = $this->service->login($request->validated());

            return ApiResponse::success($result, 'Logged in successfully.');
        } catch (InvalidCredentialsException $e) {
            return ApiResponse::error($e->getMessage(), null, 401);
        }
    }

    /**
     * Invalidate the current token.
     *
     * @return JsonResponse  HTTP 200.
     */
    public function logout(): JsonResponse
    {
        $this->service->logout();

        return ApiResponse::success(null, 'Logged out successfully.');
    }

    /**
     * Issue a fresh token for the current session.
     *
     * @return JsonResponse  User + new JWT, HTTP 200.
     */
    public function refresh(): JsonResponse
    {
        $result = $this->service->refresh();

        return ApiResponse::success($result, 'Token refreshed successfully.');
    }

    /**
     * Return the currently authenticated user.
     *
     * @return JsonResponse  Authenticated user, HTTP 200.
     */
    public function me(): JsonResponse
    {
        return ApiResponse::success($this->service->me(), 'Authenticated user.');
    }
}
