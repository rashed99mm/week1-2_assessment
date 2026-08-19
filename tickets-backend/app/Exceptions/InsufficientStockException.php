<?php

namespace App\Exceptions;

use InvalidArgumentException;

/**
 * Thrown when an order asks for more tickets than remain.
 *
 * Extends InvalidArgumentException so OrderController's existing catch maps it
 * to a 422 unchanged — the response contract for "you asked for too many" does
 * not change just because the check behind it became correct.
 */
class InsufficientStockException extends InvalidArgumentException
{
    //
}
