<?php
/**
 * MCB CRM — database access.
 *
 * One PDO handle per request, configured to throw. Every query in this
 * codebase uses prepared statements with bound parameters; there is no
 * path that concatenates request data into SQL.
 */

declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = mcb_config()['db'] ?? [];
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $cfg['host'] ?? 'localhost',
        $cfg['name'] ?? '',
        $cfg['charset'] ?? 'utf8mb4'
    );

    try {
        $pdo = new PDO($dsn, $cfg['user'] ?? '', $cfg['password'] ?? '', [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Real prepared statements, not driver-side interpolation.
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // The message can contain the DSN, including the database user.
        error_log('MCB CRM: database connection failed: ' . $e->getMessage());
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    return $pdo;
}

/** Runs $work inside a transaction, rolling back on any exception. */
function db_transaction(callable $work): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $work($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** True when a PDOException is a UNIQUE constraint violation. */
function is_duplicate_error(PDOException $e): bool
{
    // SQLSTATE 23000 with driver code 1062 is MySQL/MariaDB's duplicate key.
    return $e->getCode() === '23000'
        && (int) ($e->errorInfo[1] ?? 0) === 1062;
}
