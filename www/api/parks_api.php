<?php
require_once __DIR__.'/Db.php';
$pdo = Db::pdo();

header('Content-Type: application/json; charset=utf-8');
$method = $_SERVER['REQUEST_METHOD'];
$act    = $_GET['action'] ?? null;

try {
    if ($method==='GET'  && $act==='list') listParks($pdo);
    elseif ($method==='GET'&& $act==='get') getPark ($pdo,(int)$_GET['id']);
    elseif ($method==='POST')               savePark($pdo, json_decode(file_get_contents('php://input'),true));
    elseif ($method==='DELETE')             deletePark($pdo,(int)$_GET['id']);
    else throw new Exception('Неверный запрос');
} catch(Exception $e){
    http_response_code(400);
    echo json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);
}

/* ───── helpers ───── */
function seasonNow(){ $m=(int)date('n'); return $m<=2||$m==12?'зима':($m<=5?'весна':($m<=8?'лето':'осень')); }
function dayNow()    { return in_array((int)date('w'),[0,6])?'выходной':'будний'; }

/* ───── list ─────── */
function listParks(PDO $pdo){
    $sql="SELECT p.`ид` AS id, p.`название`, p.`адрес`,
                 h.`время_отк` `open`, h.`время_зак` `close`
          FROM `аквапарки` p
          LEFT JOIN `часы_работы` h
                 ON h.`аквапарк_ид`=p.`ид`
                AND h.`сезон`=:s AND h.`тип_дня`=:d
          ORDER BY p.`ид`";
    $st=$pdo->prepare($sql); $st->execute([':s'=>seasonNow(), ':d'=>dayNow()]);
    echo json_encode($st->fetchAll(),JSON_UNESCAPED_UNICODE);
}

/* ───── get ─────── */
function getPark(PDO $pdo,int $id){
    $st=$pdo->prepare("SELECT `ид` AS id, `название`, `адрес` FROM `аквапарки` WHERE `ид`=?");
    $st->execute([$id]); $park=$st->fetch();
    if(!$park) throw new Exception('Парк не найден');

    $h=$pdo->prepare("SELECT `ид` AS id, `сезон`, `тип_дня`, `время_отк`, `время_зак`
                      FROM `часы_работы`
                      WHERE `аквапарк_ид`=? ORDER BY 2,3");
    $h->execute([$id]);
    $park['hours']=$h->fetchAll();
    echo json_encode($park,JSON_UNESCAPED_UNICODE);
}

/* ───── save ─────── */
function savePark(PDO $pdo,array $d){
    $name = trim($d['название'] ?? $d['name']  ?? '');
    $addr = trim($d['адрес']    ?? $d['addr']  ?? '');
    if($name===''||$addr==='') throw new Exception('Название и адрес обязательны');

    $id = isset($d['id']) && $d['id']!=='' ? (int)$d['id'] : 0;

    $pdo->beginTransaction();
    try{
        /* 1. парк */
        if($id){
            $pdo->prepare("UPDATE `аквапарки` SET `название`=?,`адрес`=? WHERE `ид`=?")
                ->execute([$name,$addr,$id]);
        }else{
            $pdo->prepare("INSERT INTO `аквапарки` (`название`,`адрес`) VALUES (?,?)")
                ->execute([$name,$addr]);
            $id = (int)$pdo->lastInsertId();
        }

        $keepIds = array_filter(array_map(fn($h)=>$h['id']??null, $d['hours']));

        $in = $keepIds ? implode(',', array_fill(0,count($keepIds),'?')) : '0';
        $pdo->prepare("DELETE FROM `часы_работы`
                       WHERE `аквапарк_ид`=? AND `ид` NOT IN ($in)")
            ->execute(array_merge([$id],$keepIds));

        $upd=$pdo->prepare("UPDATE `часы_работы`
              SET `сезон`=?,`тип_дня`=?,`время_отк`=?,`время_зак`=?
              WHERE `ид`=? AND `аквапарк_ид`=?");

        $ins=$pdo->prepare("INSERT INTO `часы_работы`
              (`аквапарк_ид`,`сезон`,`тип_дня`,`время_отк`,`время_зак`)
              VALUES (?,?,?,?,?)");

        foreach($d['hours'] as $h){
            if(!empty($h['id'])){  // update
                $upd->execute([$h['сезон'],$h['тип_дня'],$h['время_отк'],$h['время_зак'],$h['id'],$id]);
            }else{                // insert
                $ins->execute([$id,$h['сезон'],$h['тип_дня'],$h['время_отк'],$h['время_зак']]);
            }
        }

        $pdo->commit();
        echo json_encode(['ok'=>1,'id'=>$id],JSON_UNESCAPED_UNICODE);
    }catch(Exception $e){
        $pdo->rollBack(); throw $e;
    }
}

/* ───── delete ───── */
function deletePark(PDO $pdo,int $id){
    $pdo->beginTransaction();

    /* 1. чистим подчинённые таблицы */

    // время работы удаляем целиком
    $pdo->prepare("DELETE FROM `часы_работы` WHERE `аквапарк_ид`=?")
        ->execute([$id]);

    // посещения можно либо удалить, либо оставить; оставим
    $pdo->prepare("UPDATE `посещения` SET `аквапарк_ид`=NULL WHERE `аквапарк_ид`=?")
        ->execute([$id]);

    /* 2. помечаем тарифы и виды абонементов как неактивные */
    $pdo->prepare("UPDATE `тарифы`
                   SET `аквапарк_ид`=NULL, `статус`=0
                   WHERE `аквапарк_ид`=?")->execute([$id]);

    $pdo->prepare("UPDATE `виды_абонементов`
                   SET `аквапарк_ид`=NULL, `статус`=0
                   WHERE `аквапарк_ид`=?")->execute([$id]);

    /* 3. удаляем сам парк */
    $pdo->prepare("DELETE FROM `аквапарки` WHERE `ид`=?")
        ->execute([$id]);

    $pdo->commit();
    echo json_encode(['ok'=>1],JSON_UNESCAPED_UNICODE);
}

