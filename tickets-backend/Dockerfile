# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./

# --no-scripts because the post-install hooks boot the framework, which needs
# application code that has not been copied yet.
RUN composer install \
    --no-interaction --no-progress --prefer-dist \
    --no-dev --no-scripts --optimize-autoloader

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM php:8.4-fpm-alpine AS app

# pdo_pgsql: PostgreSQL.  bcmath: exact money arithmetic in OrderService.
# gd: cover-image processing.  sockets: the AMQP client.  pcntl: lets
# queue:work shut down cleanly on SIGTERM instead of being killed mid-job.
RUN apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS postgresql-dev freetype-dev libjpeg-turbo-dev libpng-dev \
    && apk add --no-cache postgresql-libs freetype libjpeg-turbo libpng \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql bcmath gd sockets pcntl opcache \
    && apk del .build-deps

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .

# The framework needs these writable; everything else stays read-only to the
# application user.
RUN mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# Compiling config and routes moves that work from every request to build
# time. Deliberately not caching views: there are none worth caching in an API.
RUN php artisan config:clear && php artisan route:clear

COPY deploy/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY deploy/php/php.ini /usr/local/etc/php/conf.d/99-app.ini

USER www-data

EXPOSE 9000

# php-fpm speaks FastCGI, not HTTP, so a health probe cannot simply curl it.
# cgi-fcgi would work but pulls in another package; checking the socket is
# accepting connections is enough to know the process is alive.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD php -r 'exit(@fsockopen("127.0.0.1", 9000) ? 0 : 1);'

CMD ["php-fpm"]
