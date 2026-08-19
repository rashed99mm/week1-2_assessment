<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when a resource cannot be deleted because other records depend on it.
 *
 * Surfaces as HTTP 409. Raised by an explicit dependency check rather than by
 * catching the database's foreign-key violation: on PostgreSQL a failed
 * statement aborts the surrounding transaction, so by the time the driver
 * error is caught the connection can no longer be used for anything else.
 * Checking first keeps the transaction usable and behaves identically on
 * every engine.
 */
class ResourceInUseException extends Exception
{
    //
}
