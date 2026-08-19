<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

/**
 * Generic API response envelope wrapping every endpoint payload.
 *
 * Response body shape: { success, message, status_code, data, errors }.
 *
 * @template T The type carried in the `data` field.
 */
class ApiResponse
{
    /**
     * Return a success response wrapping the given payload.
     *
     * @param  T  $data  The payload to wrap.
     * @param  string  $message  Human readable success message.
     * @param  int  $status  HTTP status code.
     */
    public static function success(mixed $data, string $message = 'Success', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'status_code' => $status,
            'data' => $data,
            'errors' => null,
        ], $status);
    }

    /**
     * Return an error response.
     *
     * @param  string  $message  Human readable error message.
     * @param  mixed  $errors  Optional validation / debug details.
     * @param  int  $status  HTTP status code.
     */
    public static function error(string $message, mixed $errors = null, int $status = 400): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'status_code' => $status,
            'data' => null,
            'errors' => $errors,
        ], $status);
    }
}
