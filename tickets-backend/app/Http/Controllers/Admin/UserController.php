<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateUserRoleRequest;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * User and role management for the admin CMS.
 */
class UserController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /**
     * List accounts, searchable by name or email and filterable by role.
     */
    public function index(Request $request): JsonResponse
    {
        $search = $request->input('search');
        $role = $request->input('role');

        $users = User::query()
            ->when(is_string($search) && $search !== '', function ($query) use ($search): void {
                $query->where(function ($q) use ($search): void {
                    $q->whereLike('name', "%$search%", caseSensitive: false)
                        ->orWhereLike('email', "%$search%", caseSensitive: false);
                });
            })
            ->when(
                is_string($role) && in_array($role, UserRole::values(), true),
                fn ($query) => $query->where('role', $role),
            )
            ->withCount('orders')
            ->latest()
            ->paginate(max(1, min($request->integer('per_page', 15), self::MAX_PER_PAGE)));

        return ApiResponse::success($users, 'Users fetched successfully.');
    }

    /**
     * Change an account's role.
     *
     * Two guards, both of which exist because the alternative is being locked
     * out of your own admin panel with no way back in except a database
     * console.
     */
    public function updateRole(UpdateUserRoleRequest $request, $id): JsonResponse
    {
        try {
            $user = User::findOrFail($id);
            $newRole = UserRole::from($request->validated()['role']);

            if ($user->id === auth('api')->id() && $newRole !== UserRole::Admin) {
                return ApiResponse::error(
                    'You cannot remove your own administrator privileges.',
                    null,
                    422,
                );
            }

            if ($user->isAdmin() && $newRole !== UserRole::Admin && $this->isLastAdmin($user)) {
                return ApiResponse::error(
                    'This is the only administrator account. Promote another account first.',
                    null,
                    422,
                );
            }

            $user->update(['role' => $newRole->value]);

            return ApiResponse::success($user->fresh(), 'User role updated successfully.');
        } catch (ModelNotFoundException) {
            return ApiResponse::error('User not found.', null, 404);
        } catch (InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), null, 422);
        }
    }

    /**
     * Whether demoting this account would leave nobody able to administer.
     */
    private function isLastAdmin(User $user): bool
    {
        return User::where('role', UserRole::Admin->value)
            ->whereKeyNot($user->id)
            ->doesntExist();
    }
}
