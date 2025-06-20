<?php
require_once __DIR__.'/Db.php';
$pdo = Db::pdo();
header('Content-Type: application/json; charset=utf-8');

/* ===== ROUTER ===== */
$m = $_SERVER['REQUEST_METHOD'];
try {
    if ($m==='GET'  && isset($_GET['status']))      listVisits($pdo);
    elseif ($m==='GET'&& isset($_GET['id']))        visitDetails($pdo,(int)$_GET['id']);
    elseif ($m==='GET'&& isset($_GET['payhist']))   payHist($pdo,(int)$_GET['payhist']);
    elseif ($m==='PUT'&& isset($_GET['finish']))    finishVisit($pdo,(int)$_GET['finish']);
    else throw new Exception('Bad request');
} catch (Exception $e){
    http_response_code(400);
    echo json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);
}

/* ---------- 1. lists ---------- */
function listVisits(PDO $pdo){
    $active = $_GET['status']==='active';
    $where  = $active ? 'p.`выход` IS NULL' : 'p.`выход` IS NOT NULL';
    $lim    = max(1,(int)($_GET['limit']  ?? 20));
    $off    = max(0,(int)($_GET['offset'] ?? 0));
    $fmt    = "'%Y-%m-%d %H:%i'";

    $sql = "SELECT p.`ид` id,
                   g.`ФИО`          AS гость,
                   ap.`название`    AS аквапарк,
                   COALESCE(t.`название`,'Абонемент') AS тариф_или_абон,
                   DATE_FORMAT(p.`вход`,{$fmt})        AS вход,
                   DATE_FORMAT(p.`оплачено_до`,{$fmt}) AS оплачено_до,
                   DATE_FORMAT(p.`выход`,{$fmt})       AS выход,
                   p.`минут_факт`, p.`доплата`
            FROM   `посещения` p
              LEFT JOIN `гости`      g  ON g.`ид`  = p.`гость_ид`
              LEFT JOIN `аквапарки`  ap ON ap.`ид` = p.`аквапарк_ид`
              LEFT JOIN `тарифы`     t  ON t.`ид`  = p.`тариф_ид`
            WHERE  $where
            ORDER  BY p.`вход` DESC
            LIMIT :l OFFSET :o";
    $st=$pdo->prepare($sql);
    $st->bindValue(':l',$lim,PDO::PARAM_INT);
    $st->bindValue(':o',$off,PDO::PARAM_INT);
    $st->execute();
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
}

/* ---------- 2. details ---------- */
function visitDetails(PDO $pdo,int $id){
    $sql="SELECT p.`ид`          AS id,   /* alias гарантирует поле id */
                 p.*,
                 g.`ФИО`          AS гость,
                 ap.`название`    AS аквапарк,
                 COALESCE(t.`название`,'Абонемент') AS тариф_или_абон,
                 t.`штраф_руб_за_мин`               AS штраф_тарифа
          FROM `посещения` p
             LEFT JOIN `гости`      g  ON g.`ид`  = p.`гость_ид`
             LEFT JOIN `аквапарки`  ap ON ap.`ид` = p.`аквапарк_ид`
             LEFT JOIN `тарифы`     t  ON t.`ид`  = p.`тариф_ид`
          WHERE p.`ид`=?";
    $st=$pdo->prepare($sql); $st->execute([$id]);
    if(!$v=$st->fetch()) throw new Exception('visit not found');

    /* потенциальная доплата (только по тарифу) */
    $v['доплата_расчёт']=0;
    if($v['штраф_тарифа'] && $v['оплачено_до'] && !$v['выход']){
        $over = floor((time()-strtotime($v['оплачено_до']))/60);
        if($over>0) $v['доплата_расчёт']=$over*(float)$v['штраф_тарифа'];
    }

    echo json_encode($v,JSON_UNESCAPED_UNICODE);
}

/* ---------- 3. history ---------- */
function payHist(PDO $pdo,int $visit){
    $fmt="'%Y-%m-%d %H:%i'";
    $st=$pdo->prepare(
        "SELECT `ид` id, `сумма`, `способ_оплаты`,
                DATE_FORMAT(`время_платежа`,{$fmt}) AS время_платежа
           FROM `платежи`
          WHERE `посещение_ид`=?
          ORDER BY `время_платежа`");
    $st->execute([$visit]);
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
}

/* ---------- 4. finish ---------- */
function finishVisit(PDO $pdo,int $id){
    $req = json_decode(file_get_contents('php://input'),true) ?? [];
    $method = $req['method'] ?? 'none';

    $pdo->beginTransaction();

    $v=$pdo->query("SELECT * FROM `посещения` WHERE `ид`=$id FOR UPDATE")->fetch();
    if(!$v)           throw new Exception('visit not found');
    if($v['выход'])   throw new Exception('already finished');

    $now = date('Y-m-d H:i:s');
    $mins= floor((strtotime($now)-strtotime($v['вход']))/60);

    $fine=0;
    if($v['тариф_ид'] && $v['оплачено_до']){
        $rate = (float)$pdo->query("SELECT `штраф_руб_за_мин`
                                      FROM `тарифы`
                                     WHERE `ид`={$v['тариф_ид']}")->fetchColumn();
        $over = floor((strtotime($now)-strtotime($v['оплачено_до']))/60);
        if($over>0) $fine = $over*$rate;
    }

    $payId=null;
    if($fine>0){
        if($method==='none') throw new Exception('payment required');
        $ins=$pdo->prepare("INSERT INTO `платежи`
                       (`посещение_ид`,`сумма`,`способ_оплаты`,`время_платежа`)
                       VALUES (?,?,?,?)");
        $ins->execute([$id,$fine,$method,$now]);
        $payId=$pdo->lastInsertId();
    }

    if($v['абонемент_ид']){
        $pdo->query("UPDATE `абонементы`
                        SET `осталось_визитов`=GREATEST(`осталось_визитов`-1,0)
                      WHERE `ид`={$v['абонемент_ид']}");
    }

    $upd=$pdo->prepare("UPDATE `посещения`
               SET `выход`=?,`минут_факт`=?,`доплата`=?,`ид_платежа`=?
             WHERE `ид`=?");
    $upd->execute([$now,$mins,$fine,$payId,$id]);

    $pdo->commit();
    echo json_encode(['ok'=>1,'due'=>$fine],JSON_UNESCAPED_UNICODE);
}
