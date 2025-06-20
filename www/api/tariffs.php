<?php
require_once __DIR__.'/Db.php';          // ← подключаем класс

$pdo = Db::pdo();                        // ────────── 0. PDO готов

/* ─ 1. Читаем параметры (GET ↔ JSON) ───────────────────────── */
$dayType = $_GET['day-type'] ?? null;
$regType = $_GET['reg-type'] ?? null;

if ($dayType === null || $regType === null) {
    $json   = json_decode(file_get_contents('php://input'), true) ?: [];
    $dayType = $json['day-type'] ?? $dayType;
    $regType = $json['reg-type'] ?? $regType;
}

if (!$dayType || !$regType) {
    http_response_code(400);
    exit(json_encode(['error' => 'нужны day-type и reg-type']));
}

$dayType = mb_strtolower(trim($dayType));
$regType = mb_strtolower(trim($regType));

/* ─ 2. Сезон по текущему месяцу ────────────────────────────── */
$month  = (int)date('n');
$season = $month <= 2 || $month == 12 ? 'зима'
    : ($month <= 5 ? 'весна'
        : ($month <= 8 ? 'лето' : 'осень'));

/* ─ 3. Фильтр по категории ────────────────────────────────── */
$whereCat = $regType === 'по абонименту'
    ? "`категория_гостя` = 'абонемент'"
    : "`категория_гостя` <> 'абонемент'";

/* ─ 4. Запрос ─────────────────────────────────────────────── */
$sql = "
SELECT `ид`, `название`, `категория_гостя` AS категория,
       `длительность_мин`, `цена`, `кол_гостей`, `штраф_руб_за_мин`
FROM   `тарифы`
WHERE  `статус` = 1
  AND  `тип_дня` = :day
  AND  `сезон`   = :season
  AND  $whereCat
ORDER  BY `цена`, `категория_гостя`
";

$stmt   = $pdo->prepare($sql);
$stmt->execute([':day' => $dayType, ':season' => $season]);
$result = $stmt->fetchAll();

/* ─ 5. Ответ ──────────────────────────────────────────────── */
header('Content-Type: application/json; charset=utf-8');
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
