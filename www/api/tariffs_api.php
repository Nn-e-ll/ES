<?php
/* ---------- подключение к БД ---------- */
require_once __DIR__.'/Db.php';        // класс-single­ton с PDO
$pdo = Db::pdo();

/* ---------- базовая настройка ---------- */
header('Content-Type: application/json; charset=utf-8');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

/* ---------- простой роутер ---------- */
try {
    if ($method === 'GET' && $action === 'list')          listTariffs($pdo);
    elseif ($method === 'POST')                           createTariff($pdo);
    elseif ($method === 'PUT'  && isset($_GET['id']))     archiveTariff($pdo, (int)$_GET['id']);
    elseif ($method === 'DELETE' && isset($_GET['id']))   deleteTariff ($pdo, (int)$_GET['id']);
    else throw new Exception('Bad request');
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

/* ========== 1. Список (постранично) ========== */
function listTariffs(PDO $pdo)
{
    $status = (int)($_GET['status'] ?? 1);              // 1 = активные, 0 = архив
    $limit  = max(1,  (int)($_GET['limit']  ?? 20));
    $offset = max(0,  (int)($_GET['offset'] ?? 0));

    $sql = "SELECT t.`ид`              AS id,
                   COALESCE(p.`название`, '—') AS аквапарк,
                   t.`название`,
                   t.`категория_гостя`,
                   t.`тип_дня`,
                   t.`сезон`,
                   t.`длительность_мин`,
                   t.`кол_гостей`,
                   t.`цена`,
                   t.`штраф_руб_за_мин`
            FROM   `тарифы` t
            LEFT JOIN `аквапарки` p ON p.`ид` = t.`аквапарк_ид`
            WHERE  t.`статус` = :st
            ORDER  BY t.`ид`
            LIMIT :lim OFFSET :off";

    $st = $pdo->prepare($sql);
    $st->bindValue(':st',  $status, PDO::PARAM_INT);
    $st->bindValue(':lim', $limit,  PDO::PARAM_INT);
    $st->bindValue(':off', $offset, PDO::PARAM_INT);
    $st->execute();

    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
}

/* ========== 2. Создание тарифа ========== */
function createTariff(PDO $pdo)
{
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $req  = ['аквапарк_ид', 'название', 'категория_гостя', 'длительность_мин',
        'кол_гостей', 'тип_дня', 'сезон', 'цена', 'штраф'];

    foreach ($req as $k)
        if (!isset($data[$k]) || $data[$k] === '')
            throw new Exception("Поле «$k» обязательно");

    $sql = "INSERT INTO `тарифы`
           (`аквапарк_ид`,`название`,`категория_гостя`,`длительность_мин`,
            `кол_гостей`,`тип_дня`,`сезон`,`цена`,`штраф_руб_за_мин`,`статус`)
            VALUES (?,?,?,?,?,?,?,?,?,1)";

    $pdo->prepare($sql)->execute([
        $data['аквапарк_ид'], $data['название'], $data['категория_гостя'],
        $data['длительность_мин'], $data['кол_гостей'], $data['тип_дня'],
        $data['сезон'], $data['цена'], $data['штраф']
    ]);

    echo json_encode(['ok' => 1, 'id' => $pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
}

/* ========== 3. Архивация (status = 0) ========== */
function archiveTariff(PDO $pdo, int $id)
{
    $pdo->prepare("UPDATE `тарифы` SET `статус` = 0 WHERE `ид` = ?")->execute([$id]);
    echo json_encode(['ok' => 1]);
}

/* ========== 4. Полное удаление тарифа ========== */
function deleteTariff(PDO $pdo, int $id)
{
    $pdo->beginTransaction();
    try {
        /* ссылки в посещениях обнуляем, чтобы FK не упал */
        $pdo->prepare("UPDATE `посещения` SET `тариф_ид` = NULL WHERE `тариф_ид` = ?")
            ->execute([$id]);

        /* сам тариф */
        $pdo->prepare("DELETE FROM `тарифы` WHERE `ид` = ?")->execute([$id]);

        $pdo->commit();
        echo json_encode(['ok' => 1]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}
