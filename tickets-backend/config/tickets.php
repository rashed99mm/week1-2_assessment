<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Reservation window
    |--------------------------------------------------------------------------
    |
    | How long, in minutes, a pending order holds its tickets before the
    | ExpirePendingOrders command returns them to the pool.
    |
    | Stock is decremented when an order is created rather than when it is
    | paid, so an abandoned checkout would otherwise hold seats forever. Too
    | short and a customer typing in card details loses their tickets mid-flow;
    | too long and a sold-out event stays sold out because of carts nobody
    | intends to finish.
    |
    */

    'reservation_minutes' => (int) env('TICKETS_RESERVATION_MINUTES', 15),

];
