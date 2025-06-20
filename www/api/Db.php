<?php
/** Класс-singleton для подключения к базе */
class Db
{
    private const HOST     = '127.0.0.1';
    private const PORT     = 3306;
    private const NAME     = 'аквапарк';
    private const USER     = 'admin';
    private const PASS     = 'admin';
    private const CHARSET  = 'utf8mb4';

    private static ?PDO $pdo = null;

    /** Возвращает (и кеширует) экземпляр PDO */
    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                self::HOST, self::PORT, self::NAME, self::CHARSET
            );

            self::$pdo = new PDO($dsn, self::USER, self::PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        }
        return self::$pdo;
    }
}
