<?php
require_once __DIR__.'/Db.php';
$pdo = Db::pdo();

header('Content-Type: application/json; charset=utf-8');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

try{
    if($method==='GET' && $action==='list')             listSubs($pdo);
    elseif($method==='POST')                             createSub($pdo);
    elseif($method==='PUT'  && isset($_GET['id']))       archiveSub($pdo,(int)$_GET['id']);
    elseif($method==='DELETE' && isset($_GET['id']))     deleteSub ($pdo,(int)$_GET['id']);
    else throw new Exception('Bad request');
}catch(Exception $e){
    http_response_code(400);
    echo json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);
}

/* -------- LIST -------- */
function listSubs(PDO $pdo){
    $st   = (int)($_GET['status'] ?? 1);
    $lim  = max(1,(int)($_GET['limit'] ?? 20));
    $off  = max(0,(int)($_GET['offset']?? 0));

    $sql="SELECT s.`ид` id,
               COALESCE(p.`название`,'—') аквапарк,
               s.`название`, s.`сезон`, s.`кол_посещений`,
               s.`срок_дней`, s.`цена`
        FROM `виды_абонементов` s
        LEFT JOIN `аквапарки` p ON p.`ид`=s.`аквапарк_ид`
        WHERE s.`статус`=:st
        ORDER BY s.`ид`
        LIMIT :lim OFFSET :off";
    $stm=$pdo->prepare($sql);
    $stm->bindValue(':st',$st,PDO::PARAM_INT);
    $stm->bindValue(':lim',$lim,PDO::PARAM_INT);
    $stm->bindValue(':off',$off,PDO::PARAM_INT);
    $stm->execute();
    echo json_encode($stm->fetchAll(),JSON_UNESCAPED_UNICODE);
}

/* -------- CREATE -------- */
function createSub(PDO $pdo){
    $d = json_decode(file_get_contents('php://input'),true)??[];
    $req=['аквапарк_ид','название','сезон','кол_посещений','цена','срок_дней'];
    foreach($req as $f) if(empty($d[$f])) throw new Exception("Поле $f обязательно");

    $pdo->prepare("INSERT INTO `виды_абонементов`
     (`аквапарк_ид`,`сезон`,`название`,`кол_посещений`,`цена`,`срок_дней`,`статус`)
     VALUES (?,?,?,?,?,?,1)")
        ->execute([
            $d['аквапарк_ид'],$d['сезон'],$d['название'],
            $d['кол_посещений'],$d['цена'],$d['срок_дней']
        ]);
    echo json_encode(['ok'=>1,'id'=>$pdo->lastInsertId()],JSON_UNESCAPED_UNICODE);
}

/* -------- ARCHIVE (status=0) -------- */
function archiveSub(PDO $pdo,int $id){
    $pdo->prepare("UPDATE `виды_абонементов` SET `статус`=0 WHERE `ид`=?")->execute([$id]);
    echo json_encode(['ok'=>1]);
}

/* -------- DELETE -------- */
function deleteSub(PDO $pdo,int $id){
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE `абонементы` SET `вид_абонемента_ид`=NULL WHERE `вид_абонемента_ид`=?")
        ->execute([$id]);
    $pdo->prepare("DELETE FROM `виды_абонементов` WHERE `ид`=?")->execute([$id]);
    $pdo->commit();
    echo json_encode(['ok'=>1]);
}
