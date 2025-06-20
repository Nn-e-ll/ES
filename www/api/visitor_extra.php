<?php
require_once __DIR__.'/Db.php';
$pdo = Db::pdo();

header('Content-Type: application/json; charset=utf-8');

$guest = (int)($_GET['guest'] ?? 0);
$kind  = $_GET['kind'] ?? '';

if(!$guest || !in_array($kind,['abons','visits'])) {
    http_response_code(400);
    exit(json_encode(['error'=>'bad params']));
}

/* --- абонементы гостя --- */
if($kind==='abons'){
    $sql="SELECT a.`ид` id, v.`название`,
               a.`дата_покупки`, a.`истекает`,
               a.`осталось_визитов`,
               p.`сумма`
        FROM `абонементы` a
        LEFT JOIN `виды_абонементов` v ON v.`ид`=a.`вид_абонемента_ид`
        LEFT JOIN `платежи` p          ON p.`ид`=a.`ид_платежа`
        WHERE a.`гость_ид`=?";
    $st=$pdo->prepare($sql);
    $st->execute([$guest]);
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
    exit;
}

/* --- история посещений --- */
$sql="SELECT p.`ид` id,
             ap.`название` аквапарк,
             p.`дата_посещения`,
             p.`вход`, p.`выход`,
             p.`минут_факт`,
             p.`доплата`
      FROM `посещения` p
      LEFT JOIN `аквапарки` ap ON ap.`ид`=p.`аквапарк_ид`
      WHERE p.`гость_ид`=?
      ORDER BY p.`дата_посещения` DESC";
$st=$pdo->prepare($sql);
$st->execute([$guest]);
echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
