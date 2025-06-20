/* ───────── CONFIG ───────── */
const PAGE_SIZE      = 20;                       // строчек за подгрузку
const API_TARIFFS    = '/api/tariffs_api.php';
const API_PARKS      = '/api/parks_api.php';
const STORE_PARK_KEY = 'selectedParkId';         // тот же, что в aqua-select

/* ───────── DOM refs ───────── */
const tblActive = document.querySelector('#tbl-active tbody');
const tblArch   = document.querySelector('#tbl-arch tbody');

const btnNew        = document.getElementById('btn-new-tariff');
const modalNewEl    = document.getElementById('modal-new-tariff');
const modalArchiveEl= document.getElementById('modal-archive');
const modNew   = new bootstrap.Modal(modalNewEl);
const modArch  = new bootstrap.Modal(modalArchiveEl);

/* формы внутри модалов */
const formNew = document.getElementById('form-new-tariff');
const selPark = document.getElementById('nt-park');

/* состояние подзагрузки */
let pageAct = 0, pageArc = 0;
let busyAct = false, busyArc = false;

/* ───────── helper: текущий выбранный парк из localStorage ───────── */
function getSelectedParkId() { return localStorage.getItem(STORE_PARK_KEY) || ''; }

/* ───────── Рендер строки тарифа ───────── */
function rowHTML(t){
    return `
  <td>${t.id}</td>
  <td>${t.аквапарк ?? '—'}</td>
  <td>${t.название}</td>
  <td>${t.категория_гостя}</td>
  <td>${t.тип_дня}</td>
  <td>${t.сезон}</td>
  <td>${t.длительность_мин}</td>
  <td>${t.кол_гостей}</td>
  <td>${t.цена}</td>
  <td>${t.штраф_руб_за_мин}</td>
  <td><button class="btn btn-sm btn-outline-secondary act-menu">⋮</button></td>`;
}

/* ───────── Подгрузка порции тарифов ───────── */
async function loadChunk(type){            // type = 'act' | 'arch'
    if((type==='act'&&busyAct)||(type==='arch'&&busyArc))return;
    const isAct    = type==='act';
    const status   = isAct ? 1 : 0;
    const offset   = isAct ? pageAct*PAGE_SIZE : pageArc*PAGE_SIZE;
    isAct ? busyAct=true : busyArc=true;

    const res  = await fetch(`${API_TARIFFS}?action=list&status=${status}&limit=${PAGE_SIZE}&offset=${offset}`);
    const list = await res.json();

    const tbody = isAct ? tblActive : tblArch;
    list.forEach(t=>{
        const tr = tbody.insertRow();
        if(!isAct) tr.classList.add('table-danger');
        tr.innerHTML = rowHTML(t);
        tr.querySelector('.act-menu').onclick = ()=>openArchiveModal(t);
    });

    if(isAct) pageAct++; else pageArc++;
    isAct ? busyAct=false : busyArc=false;
}

/* ───────── IntersectionObserver для lazy-load ───────── */
function attachObserver(tbody,type){
    const sentinel = document.createElement('tr'); sentinel.className='sentinel';
    tbody.parentElement.after(sentinel);
    new IntersectionObserver(entries=>{
        if(entries[0].isIntersecting) loadChunk(type);
    },{root:null,threshold:1}).observe(sentinel);
}

/* ───────── заполнение select парков в модале создания ───────── */
async function fillParkSelect(){
    const res = await fetch(`${API_PARKS}?action=list`);
    const parks = await res.json();
    selPark.innerHTML = '<option value="">— выберите парк —</option>';
    parks.forEach(p=>{
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.название;
        selPark.appendChild(o);
    });
}

/* ───────── создание тарифа ───────── */
btnNew.addEventListener('click',async ()=>{
    await fillParkSelect();
    selPark.value = getSelectedParkId();
    formNew.reset();             // остальные поля очистятся
    modNew.show();
});
document.getElementById('btn-save-tariff').addEventListener('click',async ()=>{
    if(!formNew.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(formNew).entries());
    const r = await fetch(API_TARIFFS,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j = await r.json(); if(j.error) return alert(j.error);
    modNew.hide(); refreshTables();
});

/* ───────── архив / удаление ───────── */
let currentId = 0;
function openArchiveModal(t){
    currentId = t.id;
    modalArchiveEl.querySelector('#arch-info').textContent =
        `Тариф #${t.id} – «${t.название}»`;
    modArch.show();
}
document.getElementById('btn-archive').onclick = async ()=>{
    await fetch(`${API_TARIFFS}?id=${currentId}&mode=archive`,{method:'PUT'});
    modArch.hide(); refreshTables();
};
document.getElementById('btn-remove').onclick  = async ()=>{
    if(!confirm('Удалить тариф безвозвратно?'))return;
    await fetch(`${API_TARIFFS}?id=${currentId}`,{method:'DELETE'});
    modArch.hide(); refreshTables();
};

/* ───────── обновляем таблицы полностью ───────── */
function refreshTables(){
    tblActive.innerHTML=''; tblArch.innerHTML='';
    pageAct=pageArc=0;
    loadChunk('act'); loadChunk('arch');
}

/* ───────── INIT ───────── */
document.addEventListener('DOMContentLoaded',()=>{
    attachObserver(tblActive,'act');
    attachObserver(tblArch  ,'arch');
    loadChunk('act');          // сразу первая порция активных
});

/* ссылки на обёртки и кнопки */
const wrapActive = document.getElementById('wrap-active');
const wrapArch   = document.getElementById('wrap-arch');
const btnToggleAct = document.getElementById('toggle-active');
const btnToggleArc = document.getElementById('toggle-arch');

/* текст кнопок */
function updText(btn,wrap){
    btn.textContent = wrap.classList.contains('collapsed')
        ? 'Показать список' : 'Свернуть';
}

/* обработчики */
btnToggleAct.onclick = ()=>{
    wrapActive.classList.toggle('collapsed');
    updText(btnToggleAct,wrapActive);
};
btnToggleArc.onclick = ()=>{
    wrapArch.classList.toggle('collapsed');
    updText(btnToggleArc,wrapArch);
};

/* установить начальный текст */
updText(btnToggleAct,wrapActive);
updText(btnToggleArc,wrapArch);
