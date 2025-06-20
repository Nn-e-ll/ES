<?php
/*  s_hub.php  ── единый API для страниц:
 *     • выбор парка, тарифов, абонементов
 *     • покупка абонемента (buy_sub.js)
 *     • регистрация группы посещений (visit_create.js)
 *
 *  Поддерживаемые op₍GET/POST₎:
 *     parks   – список аквапарков + часы “сегодня”
 *     tariffs – активные тарифы парка+сезона+типа-дня
 *     abons   – действующие абонементы гостя для парка
 *     subs    – виды_абонементов (для формы покупки)
 *     buy     – купить абонемент (платёж + запись)
 *     visits  – создать сразу несколько посещений
 */
require_once __DIR__ . '/Db.php';
$pdo = Db::pdo();
header('Content-Type: application/json; charset=utf-8');

function bad($m)
{
    http_response_code(400);
    echo json_encode(['error' => $m], JSON_UNESCAPED_UNICODE);
    exit;
}
function seasonNow(): string
{
    $m = (int)date('n');
    return ($m <= 2 || $m == 12) ? 'зима' : ($m <= 5 ? 'весна' : ($m <= 8 ? 'лето' : 'осень'));
}

/* ───────────── helpers: day-type & holidays ───────────── */
function isRuHolidayToday(): bool
{
    $y   = date('Y');
    $key = sys_get_temp_dir() . "/ru_holidays_$y.json";
    /* кэш обновляется раз в сутки */
    if (!is_file($key) || filemtime($key) < time() - 86400) {
        $api = "https://date.nager.at/api/v3/PublicHolidays/$y/RU";
        $json = @file_get_contents($api);
        if ($json) file_put_contents($key, $json);
    }
    $list = @json_decode(@file_get_contents($key), true) ?: [];
    $today = date('Y-m-d');
    foreach ($list as $h) if ($h['date'] === $today) return true;
    return false;
}
function todayDayType(): string  // будний | выходной | праздник
{
    if (isRuHolidayToday()) return 'праздник';
    $w = (int)date('N');            // 1-пн … 7-вс
    return ($w >= 6) ? 'выходной' : 'будний';
}

$op = $_GET['op'] ?? '';

/* ======================================================= *
 * 1. parks   – список парков + часы работы на сегодня
 * ======================================================= */
if ($op === 'parks' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $dayTp  = todayDayType();
    $season = seasonNow();
    $sql = "SELECT p.`ид` id, p.`название`, p.`адрес`,
                   h.`время_отк` AS `open`, h.`время_зак` AS `close`
            FROM `аквапарки` p
            LEFT JOIN `часы_работы` h
                   ON h.`аквапарк_ид`=p.`ид`
                  AND h.`тип_дня`=? AND h.`сезон`=?
            ORDER BY p.`ид`";
    $st = $pdo->prepare($sql);
    $st->execute([$dayTp, $season]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
    exit;
}

/* ======================================================= *
 * 2. tariffs – активные тарифы (учёт сезона и типа дня)
 * ======================================================= */
if ($op === 'tariffs' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $park   = (int)($_GET['park']   ?? 0);
    $season =         $_GET['season'] ?? seasonNow();
    $dayTp  = todayDayType();
    if (!$park) bad('bad params');

    $st = $pdo->prepare("
      SELECT `ид` id,
             `название`,
             `категория_гостя`,
             `кол_гостей`,
             `длительность_мин`,
             `цена`
        FROM `тарифы`
       WHERE `аквапарк_ид`=? AND `сезон`=? AND `тип_дня`=? AND `статус`=1
       ORDER BY `цена`");
    $st->execute([$park, $season, $dayTp]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
    exit;
}

/* ======================================================= *
 * 3. abons – активные абонементы плательщика
 * ======================================================= */
if ($op === 'abons' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $guest = (int)($_GET['guest'] ?? 0);
    $park  = (int)($_GET['park']  ?? 0);
    if (!$guest || !$park) bad('bad params');

    $sql = "SELECT a.`ид` id, va.`название`, a.`осталось_визитов`
              FROM `абонементы` a
              JOIN `виды_абонементов` va ON va.`ид`=a.`вид_абонемента_ид`
             WHERE a.`гость_ид`=? AND va.`аквапарк_ид`=?
               AND a.`осталось_визитов`>0 AND a.`истекает`>=CURDATE()";
    $st  = $pdo->prepare($sql);
    $st->execute([$guest, $park]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
    exit;
}

/* ======================================================= *
 * 4. subs  – виды абонементов (buy_sub.js)
 * ======================================================= */
if ($op === 'subs' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $park   = (int)($_GET['park'] ?? 0);
    $season =       $_GET['season'] ?? '';
    if (!$park || !in_array($season, ['весна','лето','осень','зима'], true)) bad('bad params');

    $st = $pdo->prepare("
      SELECT `ид` id, `название`, `кол_посещений`, `цена`, `срок_дней`
        FROM `виды_абонементов`
       WHERE `аквапарк_ид`=? AND `сезон`=? AND `статус`=1
       ORDER BY `цена`");
    $st->execute([$park, $season]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
    exit;
}

/* ======================================================= *
 * 5. buy – покупка абонемента (для buy_sub.js)
 * ======================================================= */
if ($op === 'buy' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d     = json_decode(file_get_contents('php://input'), true) ?: [];
    $guest = (int)($d['guest_id']  ?? 0);
    $type  = (int)($d['sub_type']  ?? 0);
    $pay   =        $d['pay_method'] ?? '';
    if (!$guest || !$type || !in_array($pay, ['наличные','карта'], true)) bad('bad params');

    $pdo->beginTransaction();
    try {
        if (!$pdo->query("SELECT 1 FROM `гости` WHERE `ид`=$guest")->fetchColumn())
            throw new Exception('guest not found');

        $st = $pdo->prepare("SELECT * FROM `виды_абонементов`
                              WHERE `ид`=? AND `статус`=1 FOR UPDATE");
        $st->execute([$type]);
        if (!$v = $st->fetch()) throw new Exception('sub inactive');

        $now   = date('Y-m-d H:i:s');
        $price = (float)$v['цена'];
        $pdo->prepare("INSERT INTO `платежи`
              (`сумма`,`способ_оплаты`,`время_платежа`)
              VALUES (?,?,?)")->execute([$price,$pay,$now]);
        $payId = $pdo->lastInsertId();

        $expire = date('Y-m-d', strtotime("+{$v['срок_дней']} days"));
        $pdo->prepare("INSERT INTO `абонементы`
           (`гость_ид`,`вид_абонемента_ид`,`ид_платежа`,
            `дата_покупки`,`истекает`,`осталось_визитов`)
            VALUES (?,?,?,?,?,?)")
            ->execute([$guest,$type,$payId,$now,$expire,$v['кол_посещений']]);
        $pdo->commit(); echo json_encode(['ok'=>1],JSON_UNESCAPED_UNICODE); exit;

    } catch (Exception $e) {
        $pdo->rollBack(); bad($e->getMessage());
    }
}

/* ======================================================= *
 * 6. visits – создать группу посещений
 * ======================================================= */
if ($op === 'visits' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d     = json_decode(file_get_contents('php://input'), true) ?: [];
    $payer = (int)($d['payer_id']  ?? 0);
    $park  = (int)($d['park_id']   ?? 0);
    $payM  =        $d['pay_method'] ?? null;
    $rows  =        $d['visits']     ?? [];
    if (!$payer || !$park || !$rows) bad('bad params');

    $pdo->beginTransaction();
    try {
        if (!$pdo->query("SELECT 1 FROM `гости` WHERE `ид`=$payer")->fetchColumn())
            throw new Exception('payer not found');

        $total = 0; $tCache = [];
        foreach ($rows as &$r) {
            if ($r['type'] !== 'tariff') continue;

            $tid = (int)$r['tariff_id'];
            $qty = max(1, (int)$r['qty']);
            if (!isset($tCache[$tid])) {
                $t = $pdo->query("SELECT * FROM `тарифы`
                                   WHERE `ид`=$tid AND `аквапарк_ид`=$park AND `статус`=1")
                    ->fetch();
                if (!$t) throw new Exception('bad tariff');
                $tCache[$tid] = $t;
            }
            $r['_t'] = $tCache[$tid];
            $r['qty'] = $qty;

            $price = (float)$tCache[$tid]['цена'];
            $total += $qty * $price;
        }
        if ($total > 0 && !$payM) throw new Exception('need pay_method');

        $payId = null;
        $now   = date('Y-m-d H:i:s');
        if ($total > 0) {
            $pdo->prepare("INSERT INTO `платежи`
                (`сумма`,`способ_оплаты`,`время_платежа`)
                VALUES (?,?,?)")->execute([$total, $payM, $now]);
            $payId = $pdo->lastInsertId();
        }

        /* insert visits */
        foreach ($rows as $r) {
            if ($r['type'] === 'tariff') {
                $t   = $r['_t'];
                $qty = $r['qty'];
                $paidToBase = strtotime("+{$t['длительность_мин']} minutes", strtotime($now));
                for ($i = 0; $i < $qty; ++$i) {
                    $paidTo = date('Y-m-d H:i:s', $paidToBase);
                    $pdo->prepare("INSERT INTO `посещения`
                       (`гость_ид`,`аквапарк_ид`,`ид_платежа`,`тариф_ид`,
                        `дата_посещения`,`вход`,`оплачено_до`)
                       VALUES (?,?,?,?,CURDATE(),?,?)")
                        ->execute([$payer,$park,$payId,$t['ид'],$now,$paidTo]);
                }
            } else {   /* abon */
                $abon = (int)$r['abon_id'];
                $row = $pdo->query("SELECT `осталось_визитов`
                                     FROM `абонементы`
                                     WHERE `ид`=$abon AND `гость_ид`=$payer FOR UPDATE")
                    ->fetch();
                if (!$row || $row['осталось_визитов'] <= 0) throw new Exception('no abon');
                $pdo->query("UPDATE `абонементы`
                               SET `осталось_визитов`=`осталось_визитов`-1
                             WHERE `ид`=$abon");
                $pdo->prepare("INSERT INTO `посещения`
                    (`гость_ид`,`аквапарк_ид`,`абонемент_ид`,
                     `дата_посещения`,`вход`)
                    VALUES (?,?,?,?,?)")
                    ->execute([$payer,$park,$abon,$now,$now]);
            }
        }

        $pdo->commit();
        echo json_encode(['ok' => 1], JSON_UNESCAPED_UNICODE);
        exit;

    } catch (Exception $e) {
        $pdo->rollBack();
        bad($e->getMessage());
    }
}

/* ---------------- unknown op ---------------- */
bad('bad op');
