<?php
/* ---------- PDO ---------- */
require_once __DIR__ . '/Db.php';       // ваш класс-обёртка
$pdo = Db::pdo();

/* ---------- boilerplate ---------- */
header('Content-Type: application/json; charset=utf-8');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

/* ---------- router ---------- */
try {
    if ($method === 'GET') {                        // list + search
        listVisitors($pdo);
    } elseif ($method === 'POST') {                 // create
        createVisitor($pdo);
    } elseif ($method === 'PUT' && isset($_GET['id'])) { // update
        updateVisitor($pdo, (int)$_GET['id']);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) { // delete
        deleteVisitor($pdo, (int)$_GET['id']);
    } else {
        throw new Exception('Bad request');
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

/* ======================================================= *
 * 1. LIST  (с поиском)                                    *
 *  GET ?limit=20&offset=0[&q=строка]                      *
 * ======================================================= */
function listVisitors(PDO $pdo): void
{
    $limit  = max(1,  (int)($_GET['limit']  ?? 20));
    $offset = max(0,  (int)($_GET['offset'] ?? 0));
    $q      = trim($_GET['q'] ?? '');

    if ($q === '') {                                   // без поиска
        $sql = "SELECT `ид` id, `ФИО`, `телефон`, `email`, `дата_рождения`, `создано_в`
                FROM `гости`
                ORDER BY `ид`
                LIMIT :lim OFFSET :off";
        $st  = $pdo->prepare($sql);
    } else {                                           // поиск
        $like = '%' . $q . '%';
        $sql  = "SELECT `ид` id, `ФИО`, `телефон`, `email`, `дата_рождения`, `создано_в`,
                        /* простая «релевантность» */
                        (CASE
                           WHEN `телефон` LIKE :exact THEN 3
                           WHEN `ФИО`     LIKE :exact THEN 2
                           ELSE 1
                         END) AS score
                 FROM `гости`
                 WHERE `ФИО` LIKE :like OR `телефон` LIKE :like
                 ORDER BY score DESC, `ид`
                 LIMIT :lim OFFSET :off";
        $st = $pdo->prepare($sql);
        $st->bindValue(':like',  $like, PDO::PARAM_STR);
        $st->bindValue(':exact', $q.'%', PDO::PARAM_STR);
    }

    $st->bindValue(':lim', $limit,  PDO::PARAM_INT);
    $st->bindValue(':off', $offset, PDO::PARAM_INT);
    $st->execute();

    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
}

/* ======================================================= *
 * 2. CREATE  (POST, JSON-body)                            *
 * ======================================================= */
function createVisitor(PDO $pdo): void
{
    $d = json_decode(file_get_contents('php://input'), true) ?? [];

    if (empty($d['ФИО']) || empty($d['дата_рождения']))
        throw new Exception('ФИО и дата рождения обязательны');

    $sql = "INSERT INTO `гости` (`ФИО`,`дата_рождения`,`телефон`,`email`)
            VALUES (?,?,?,?)";
    $pdo->prepare($sql)->execute([
        $d['ФИО'],
        $d['дата_рождения'],
        $d['телефон'] ?? null,
        $d['email']   ?? null
    ]);

    echo json_encode(['ok' => 1, 'id' => $pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
}

/* ======================================================= *
 * 3. UPDATE  (PUT ?id=…, JSON-body)                       *
 * ======================================================= */
function updateVisitor(PDO $pdo, int $id): void
{
    $d = json_decode(file_get_contents('php://input'), true) ?? [];

    if (empty($d['ФИО']) || empty($d['дата_рождения']))
        throw new Exception('ФИО и дата рождения обязательны');

    $sql = "UPDATE `гости`
            SET `ФИО`=?,`дата_рождения`=?,`телефон`=?,`email`=?
            WHERE `ид`=?";
    $pdo->prepare($sql)->execute([
        $d['ФИО'],
        $d['дата_рождения'],
        $d['телефон'] ?? null,
        $d['email']   ?? null,
        $id
    ]);

    echo json_encode(['ok' => 1]);
}

/* ======================================================= *
 * 4. DELETE  (DELETE ?id=…)                               *
 *  обнуляем ссылки в 3 таблицах, затем удаляем гостя       *
 * ======================================================= */
function deleteVisitor(PDO $pdo, int $id): void
{
    $pdo->beginTransaction();
    try {
        /* ссылки → NULL */
        $pdo->prepare("UPDATE `карты_гостей` SET `гость_ид`=NULL WHERE `гость_ид`=?")
            ->execute([$id]);
        $pdo->prepare("UPDATE `посещения`    SET `гость_ид`=NULL WHERE `гость_ид`=?")
            ->execute([$id]);
        $pdo->prepare("UPDATE `абонементы`   SET `гость_ид`=NULL WHERE `гость_ид`=?")
            ->execute([$id]);

        /* сам гость */
        $pdo->prepare("DELETE FROM `гости` WHERE `ид`=?")->execute([$id]);

        $pdo->commit();
        echo json_encode(['ok' => 1]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}
