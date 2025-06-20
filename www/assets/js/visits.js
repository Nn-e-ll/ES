/* ========================================================= *
 *  Модуль «Фактические посещения»
 *  – две таблицы (active / closed)
 *  – карточка посещения  +  оплата доплаты  +  история платежей
 *  (глобалей не создаёт)
 * ========================================================= */
(() => {
    'use strict';

    /* ---------- CONFIG ---------- */
    const PAGE_SIZE = 20;
    const API = '/api/visits_api.php';           // backend-endpoint

    /* ---------- DOM refs ---------- */
    const tblAct  = document.querySelector('#tbl-vis-act  tbody');
    const tblCls  = document.querySelector('#tbl-vis-cls  tbody');

    const wrapAct = document.getElementById('wrap-vis-act');
    const wrapCls = document.getElementById('wrap-vis-cls');

    const btnToggleAct = document.getElementById('toggle-vis-act');
    const btnToggleCls = document.getElementById('toggle-vis-cls');

    /* visit modal */
    const modVisit  = new bootstrap.Modal('#modal-visit');
    const vTitle    = document.getElementById('visit-title');
    const vFields   = {
        gname  : document.getElementById('v-gname'),
        park   : document.getElementById('v-park'),
        tariff : document.getElementById('v-tariff'),
        date   : document.getElementById('v-date'),
        in     : document.getElementById('v-in'),
        paidto : document.getElementById('v-paidto'),
        out    : document.getElementById('v-out'),
        minutes: document.getElementById('v-minutes'),
        extra  : document.getElementById('v-extra')
    };
    const btnFinish = document.getElementById('btn-finish');
    const btnPayHist= document.getElementById('btn-pay-history');

    /* payment modal */
    const modPay   = new bootstrap.Modal('#modal-payment');
    const payAmt   = document.getElementById('pay-amount');
    const payMeth  = document.getElementById('pay-method');
    const btnPayOk = document.getElementById('btn-pay-confirm');

    /* history modal */
    const modHist  = new bootstrap.Modal('#modal-payhist');
    const tblHist  = document.querySelector('#tbl-payhist tbody');

    /* ---------- state ---------- */
    let pageA=0, pageC=0, busyA=false, busyC=false, doneA=false, doneC=false;
    let currentVisit = null;           // объект текущего посещения
    let payingDue = 0;

    /* ---------- helpers ---------- */
    const rowActive = v => `
    <td>${v.id}</td>
    <td>${v.гость}</td>
    <td>${v.аквапарк}</td>
    <td>${v.тариф_или_абон}</td>
    <td>${v.вход}</td>
    <td>${v.оплачено_до}</td>
    <td><button class="btn btn-sm btn-outline-secondary view">⋮</button></td>`;

    const rowClosed = v => `
    <td>${v.id}</td>
    <td>${v.гость}</td>
    <td>${v.аквапарк}</td>
    <td>${v.тариф_или_абон}</td>
    <td>${v.вход}</td>
    <td>${v.выход}</td>
    <td>${v.минут_факт ?? '—'}</td>
    <td>${v.доплата ?? 0}</td>
    <td><button class="btn btn-sm btn-outline-secondary view">⋮</button></td>`;

    const toggleWrap = (wrap, btn) => {
        wrap.classList.toggle('collapsed');
        btn.textContent = wrap.classList.contains('collapsed') ? 'Показать список':'Свернуть';
    };
    btnToggleAct.onclick = () => toggleWrap(wrapAct, btnToggleAct);
    btnToggleCls.onclick = () => toggleWrap(wrapCls, btnToggleCls);

    /* ---------- lazy-load ---------- */
    async function loadChunk(kind){
        const isAct = kind==='act';
        if((isAct?busyA:busyC) || (isAct?doneA:doneC)) return;
        isAct?busyA=true:busyC=true;

        const url = `${API}?status=${isAct?'active':'closed'}&limit=${PAGE_SIZE}&offset=${(isAct?pageA:pageC)*PAGE_SIZE}`;
        const list = await (await fetch(url)).json();
        if(list.length===0){ isAct?doneA=true:doneC=true; return; }

        const body = isAct?tblAct:tblCls;
        list.forEach(v=>{
            const tr = body.insertRow();
            tr.innerHTML = isAct?rowActive(v):rowClosed(v);
            tr.querySelector('.view').onclick = () => openModal(v.id, isAct);
        });

        isAct?pageA++:pageC++;
        isAct?busyA=false:busyC=false;
    }

    const sentinelA = document.createElement('tr'); tblAct.parentElement.after(sentinelA);
    const sentinelC = document.createElement('tr'); tblCls.parentElement.after(sentinelC);
    new IntersectionObserver(e=>e[0].isIntersecting&&loadChunk('act'),{threshold:1}).observe(sentinelA);
    new IntersectionObserver(e=>e[0].isIntersecting&&loadChunk('cls'),{threshold:1}).observe(sentinelC);

    /* ---------- open modal ---------- */
    async function openModal(id,isActive){
        const v = await (await fetch(`${API}?id=${id}`)).json();
        currentVisit = {...v, id};

        vTitle.textContent = `Посещение #${v.id}`;
        vFields.gname .textContent = v.гость;
        vFields.park  .textContent = v.аквапарк;
        vFields.tariff.textContent = v.тариф_или_абон;
        vFields.date  .textContent = v.дата_посещения;
        vFields.in    .textContent = v.вход;
        vFields.paidto.textContent = v.оплачено_до ?? '—';
        vFields.out   .textContent = v.выход ?? '—';
        vFields.minutes.textContent = v.минут_факт ?? '—';
        vFields.extra  .textContent = v.доплата ?? '—';

        btnFinish.style.display = isActive ? '' : 'none';
        payingDue = v.доплата_расчёт || 0;
        modVisit.show();
    }

    /* ---------- завершить сеанс ---------- */
    btnFinish.onclick = ()=>{
        if(payingDue>0){
            payAmt.textContent = payingDue.toFixed(2);
            payMeth.value='наличные';
            modPay.show();
        }else{
            finishVisit('none');
        }
    };

    btnPayOk.onclick = ()=>{
        finishVisit(payMeth.value);
        modPay.hide();
    };

    async function finishVisit(method){
        const payload = {method};
        const r = await fetch(`${API}?finish=${currentVisit.id}`,{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const j = await r.json(); if(j.error) return alert(j.error);
        modVisit.hide();
        refreshTables();
    }

    /* ---------- история оплат ---------- */
    btnPayHist.onclick = async ()=>{
        tblHist.innerHTML = '<tr><td colspan="4" class="text-center p-2">Загрузка…</td></tr>';
        const arr = await (await fetch(`${API}?payhist=${currentVisit.id}`)).json();
        tblHist.innerHTML='';
        if(arr.length===0){
            tblHist.innerHTML='<tr><td colspan="4" class="text-center p-2">Нет платежей</td></tr>';
        }else{
            arr.forEach(p=>{
                const tr = tblHist.insertRow();
                tr.innerHTML = `<td>${p.id}</td><td>${p.сумма}</td><td>${p.способ_оплаты}</td><td>${p.время_платежа}</td>`;
            });
        }
        modHist.show();
    };

    /* ---------- refresh ---------- */
    function refreshTables(){
        tblAct.innerHTML=''; tblCls.innerHTML='';
        pageA=pageC=0; busyA=busyC=false; doneA=doneC=false;
        loadChunk('act'); loadChunk('cls');
    }

    /* ---------- init ---------- */
    document.addEventListener('DOMContentLoaded',()=>{
        loadChunk('act');                       // первый запрос
    });
})();
