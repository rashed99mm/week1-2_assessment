<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Owns the on-disk lifecycle of event cover images on the `public` disk.
 *
 * Deliberately free of constructor dependencies so it can be instantiated with
 * `new` outside of a container — see EventService::__construct.
 */
class EventCoverService
{
    public const DISK = 'public';

    public const DIRECTORY = 'covers';

    /**
     * Persist an uploaded cover and return its disk-relative path.
     *
     * Uses the framework's hashed name rather than the client-supplied filename,
     * which is never trusted.
     */
    public function store(UploadedFile $file): string
    {
        return $file->store(self::DIRECTORY, self::DISK);
    }

    /**
     * Delete a stored cover.
     *
     * Paths outside the covers directory are ignored, so a tampered
     * cover_image_path column can never make the app delete an arbitrary file.
     */
    public function delete(?string $path): void
    {
        if ($path === null || $path === '' || ! str_starts_with($path, self::DIRECTORY.'/')) {
            return;
        }

        Storage::disk(self::DISK)->delete($path);
    }
}
