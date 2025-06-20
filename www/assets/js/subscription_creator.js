/* -------- CONFIG -------- */
const PAGE         = 20;                          // lazy-page size
const API_SUBS     = '/api/subs_api.php';
const API_PARKS    = '/api/parks_api.php';
const LS_PARK_KEY  = 'selectedParkId';            // уже используется селектом аквапарков

/* -------- DOM refs -------- */
const tblAct  = document.querySelector('#tbl-subs-act  tbody');
const tblArch = document.querySelector('#tbl-subs-arch tbody');

const wrapAct  = document.getElementById('wrap-subs-act');
const wrapArch = document.getElementById('wrap-subs-arch');

const btnToggleAct  = document.getElementById('toggle-subs-act');
const btnToggleArch = document.getElementById('toggle-subs-arch');

const btnNew   = document.getElementById('btn-new-sub');
const modalNew = new bootstrap.Modal('#modal-new-sub');
const modalArc = new bootstrap.Modal('#modal-archive-sub');

const selPark  = document.getElementById('sub-park');
const formNew  = document.getElementById('form-new-sub');

/* -------- state -------- */
let pageAct = 0, pageArch = 0;
let busyAct = false, busyArch = false;
let currentSubId = 0;

/* ================= HELPERS ================= */
const getSelPark = () => localStorage.getItem(LS_PARK_KEY) || '';

const rowHTML = s => `
  <td>${s.id}</td>
  <td>${s.аквапарк ?? '—'}</td>
  <td>${s.название}</td>
  <td>${s.сезон}</td>
  <td>${s.кол_посещений}</td>
  <td>${s.срок_дней}</td>
  <td>${s.цена}</td>
  <td><button class="btn btn-sm btn-outline-secondary sub-menu">⋮</button></td>`;

/* ================== LAZY LOAD ================== */
async function loadChunk(kind) {          // kind: 'act' | 'arch'
    if (kind==='act'?busyAct:busyArch) return;
    kind==='act'?busyAct=true:busyArch=true;

    const status = kind==='act'?1:0;
    const offset = (kind==='act'?pageAct:pageArch)*PAGE;

    const res  = await fetch(`${API_SUBS}?action=list&status=${status}&limit=${PAGE}&offset=${offset}`);
    const arr  = await res.json();
    const body = kind==='act'?tblAct:tblArch;

    arr.forEach(s=>{
        const tr = body.insertRow();
        if(status===0) tr.classList.add('table-danger');
        tr.innerHTML = rowHTML(s);
        tr.querySelector('.sub-menu').onclick = () => openArchModal(s);
    });

    kind==='act'?pageAct++:pageArch++;
    kind==='act'?busyAct=false:busyArch=false;
}

/* sentinel + IntersectionObserver */
function attachObserver(body, kind){
    const sent = document.createElement('tr'); sent.className='sentinel';
    body.parentElement.after(sent);
    new IntersectionObserver(e=>{
        if(e[0].isIntersecting) loadChunk(kind);
    },{root:null,threshold:1}).observe(sent);
}

/* ================== COLLAPSE HANDLERS ================== */
function toggleList(btn, wrap){
    wrap.classList.toggle('collapsed');
    btn.textContent = wrap.classList.contains('collapsed') ? 'Показать список':'Свернуть';
}
btnToggleAct .onclick = ()=>toggleList(btnToggleAct ,wrapAct );
btnToggleArch.onclick = ()=>toggleList(btnToggleArch,wrapArch);

/* ================== SELECT PARKS ================== */
async function fillParkSelect(){
    const parks = await (await fetch(`${API_PARKS}?action=list`)).json();
    selPark.innerHTML = '<option value="">— выберите парк —</option>';
    parks.forEach(p=>{
        const o=document.createElement('option');
        o.value=p.id; o.textContent=p.название;
        selPark.appendChild(o);
    });
}

/* ================== CREATE ================== */
btnNew.onclick = async ()=>{
    await fillParkSelect();
    selPark.value = getSelPark();
    formNew.reset();                        // очищаем цифры/название
    modalNew.show();
};
document.getElementById('btn-save-sub').onclick = async ()=>{
    if(!formNew.reportValidity()) return;
    const data = Object.fromEntries(new FormData(formNew).entries());
    const r = await fetch(API_SUBS,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(data)
    });
    const j = await r.json(); if(j.error) return alert(j.error);
    modalNew.hide(); refreshTables();
};

/* ================== ARCHIVE / DELETE ================== */
function openArchModal(s){
    currentSubId = s.id;
    document.getElementById('sub-arch-info').textContent =
        `Вид #${s.id} – «${s.название}»`;
    modalArc.show();
}
document.getElementById('btn-sub-archive').onclick = async ()=>{
    await fetch(`${API_SUBS}?id=${currentSubId}&mode=archive`,{method:'PUT'});
    modalArc.hide(); refreshTables();
};
document.getElementById('btn-sub-remove').onclick = async ()=>{
    if(!confirm('Удалить вид абонемента безвозвратно?')) return;
    await fetch(`${API_SUBS}?id=${currentSubId}`,{method:'DELETE'});
    modalArc.hide(); refreshTables();
};

/* ================== REFRESH ALL ================== */
function refreshTables(){
    tblAct.innerHTML=''; tblArch.innerHTML='';
    pageAct=pageArch=0;
    loadChunk('act'); loadChunk('arch');
}

/* ================== INIT ================== */
document.addEventListener('DOMContentLoaded',()=>{
    attachObserver(tblAct ,'act');
    attachObserver(tblArch,'arch');
    loadChunk('act');                     // первая порция активных
});