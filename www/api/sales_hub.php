<?php
/*  sales_hub.php  — единый API для продажи абонементов */

require_once __DIR__.'/Db.php';
$pdo = Db::pdo();
header('Content-Type: application/json; charset=utf-8');

$op = $_GET['op'] ?? '';

/* ===================================================== *
 * 1. parks : GET /api/sales_hub.php?op=parks
 * ===================================================== */
if ($op === 'parks' && $_SERVER['REQUEST_METHOD']==='GET') {

    /* вычислим «тип дня» и «сезон» на сегодня */
    $w = (int)date('w');                                 // 0-вск … 6-сб
    $dayType = ($w===0||$w===6)? 'выходной' : 'будний';
    $m  = (int)date('n');
    $season = ($m<=2||$m===12)?'зима':($m<=5?'весна':($m<=8?'лето':'осень'));

    $sql = "SELECT p.`ид` id,
                   p.`название`,
                   p.`адрес`,
                   h.`время_отк` AS `open`,
                   h.`время_зак` AS `close`
            FROM   `аквапарки` p
            LEFT JOIN `часы_работы` h
                   ON h.`аквапарк_ид` = p.`ид`
                  AND h.`тип_дня`     = ?
                  AND h.`сезон`       = ?
            ORDER BY p.`ид`";
    $st = $pdo->prepare($sql);
    $st->execute([$dayType,$season]);
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
    exit;
}

/* ===================================================== *
 * 2. subs : GET /api/sales_hub.php?op=subs&park=1&season=лето
 * ===================================================== */
if ($op === 'subs' && $_SERVER['REQUEST_METHOD']==='GET') {

    $park   = (int)($_GET['park']   ?? 0);
    $season =         $_GET['season'] ?? '';

    if(!$park || !in_array($season,['весна','лето','осень','зима'],true)){
        http_response_code(400);
        exit(json_encode(['error'=>'bad params']));
    }

    $st=$pdo->prepare(
        "SELECT `ид` id, `название`, `кол_посещений`, `цена`, `срок_дней`
         FROM `виды_абонементов`
        WHERE `аквапарк_ид`=? AND `сезон`=? AND `статус`=1
        ORDER BY `цена`");
    $st->execute([$park,$season]);
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
    exit;
}

/* ===================================================== *
 * 3. buy : POST /api/sales_hub.php?op=buy   {JSON}
 *    { guest_id, sub_type, pay_method }                 *
 * ===================================================== */
if ($op === 'buy' && $_SERVER['REQUEST_METHOD']==='POST') {

    $d = json_decode(file_get_contents('php://input'),true) ?: [];
    $guest = (int)($d['guest_id']  ?? 0);
    $type  = (int)($d['sub_type']  ?? 0);
    $pay   =         $d['pay_method'] ?? '';

    if(!$guest || !$type || !in_array($pay,['наличные','карта'],true)){
        http_response_code(400);
        exit(json_encode(['error'=>'bad params']));
    }

    $pdo->beginTransaction();
    try{
        /* гость существует? */
        if(!$pdo->query("SELECT 1 FROM `гости` WHERE `ид`=$guest")->fetchColumn())
            throw new Exception('guest not found');

        /* вид абонемента активен? */
        $st=$pdo->prepare("SELECT * FROM `виды_абонементов`
                           WHERE `ид`=? AND `статус`=1 FOR UPDATE");
        $st->execute([$type]);
        if(!$v=$st->fetch()) throw new Exception('sub type inactive');

        /* платёж */
        $now   = date('Y-m-d H:i:s');
        $sum   = (float)$v['цена'];
        $pdo->prepare("INSERT INTO `платежи`
              (`сумма`,`способ_оплаты`,`время_платежа`)
              VALUES (?,?,?)")
            ->execute([$sum,$pay,$now]);
        $payId = $pdo->lastInsertId();

        /* абонемент */
        $expire = date('Y-m-d',strtotime("+{$v['срок_дней']} days"));
        $pdo->prepare("INSERT INTO `абонементы`
             (`гость_ид`,`вид_абонемента_ид`,`ид_платежа`,
              `дата_покупки`,`истекает`,`осталось_визитов`)
              VALUES (?,?,?,?,?,?)")
            ->execute([
                $guest, $type, $payId,
                $now,   $expire, $v['кол_посещений']
            ]);

        $pdo->commit();
        echo json_encode(['ok'=>1,'abon_id'=>$pdo->lastInsertId()],JSON_UNESCAPED_UNICODE);
        exit;

    }catch(Exception $e){
        $pdo->rollBack();
        http_response_code(400);
        exit(json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE));
    }
}

/* ===================================================== */
http_response_code(400);
echo json_encode(['error'=>'bad op'],JSON_UNESCAPED_UNICODE);
