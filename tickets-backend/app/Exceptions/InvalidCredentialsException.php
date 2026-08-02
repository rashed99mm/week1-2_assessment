<?php

namespace App\Exceptions;

use Exception;

/**
 * Raised when the supplied credentials do not match any active account.
 */
class InvalidCredentialsException extends Exception
{
    /**
     * Construct the exception with a default message.
     *
     * @param  string  $message  Optional custom message.
     */
    public function __construct(string $message = 'Invalid email or password.')
    {
        parent::__construct($message);
    }
}
