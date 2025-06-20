/* ========================================================= *
 *   Visitors module  —  lazy-list + live-search + CRUD
 *   (изолированная IIFE, глобалей не создаёт)
 * ========================================================= */
(() => {
    'use strict';

    /* ---------- CONFIG ---------- */
    const PAGE_SIZE   = 20;
    const API_VISIT   = '/api/visitors_api.php';
    const SEARCH_DEBOUNCE = 300;                // мс

    /* ---------- DOM refs ---------- */
    const tblBody      = document.querySelector('#tbl-vis tbody');
    const wrapTable    = document.getElementById('wrap-vis');
    const btnToggle    = document.getElementById('toggle-vis');
    const inpSearch    = document.getElementById('visitor-search');
    const btnNew       = document.getElementById('btn-new-visitor');

    const modalEl      = document.getElementById('modal-visitor');
    const modal        = new bootstrap.Modal(modalEl);
    const form         = document.getElementById('form-visitor');
    const btnSave      = document.getElementById('btn-vis-save');
    const btnDelete    = document.getElementById('btn-vis-delete');
    const titleModal   = document.getElementById('vis-modal-title');

    /* поля формы */
    const fId    = document.getElementById('vis-id');
    const fName  = document.getElementById('vis-name');
    const fBirth = document.getElementById('vis-birth');
    const fPhone = document.getElementById('vis-phone');
    const fEmail = document.getElementById('vis-email');

    /* ---------- state ---------- */
    let busy = false;
    let page = 0;
    let currentSearch = '';      // активный поисковый запрос
    let loadingEnded  = false;   // больше нет данных с сервера
    let debounceTmr   = null;

    /* ---------- helpers ---------- */
    const rowHTML = g => `
    <td>${g.id}</td>
    <td>${g.ФИО}</td>
    <td>${g.телефон ?? '—'}</td>
    <td>${g.email   ?? '—'}</td>
    <td>${g.дата_рождения}</td>
    <td>${g.создано_в}</td>
    <td><button class="btn btn-sm btn-outline-secondary vis-menu">⋮</button></td>`;

    const resetList = () => {
        tblBody.innerHTML = '';
        page = 0;
        loadingEnded = false;
    };

    /* ---------- lazy-load / search ---------- */
    async function loadChunk() {
        if (busy || loadingEnded) return;
        busy = true;

        const params = new URLSearchParams({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE
        });
        if (currentSearch) params.append('q', currentSearch);

        const res  = await fetch(`${API_VISIT}?${params}`);
        const list = await res.json();

        if (list.length === 0) loadingEnded = true;

        list.forEach(g => {
            const tr = tblBody.insertRow();
            tr.innerHTML = rowHTML(g);
            tr.querySelector('.vis-menu').onclick = () => openModal(g);
        });

        page++;
        busy = false;
    }

    /* sentinel для IntersectionObserver */
    const sentinel = document.createElement('tr');
    tblBody.parentElement.after(sentinel);
    new IntersectionObserver(e=>{
        if(e[0].isIntersecting) loadChunk();
    },{root:null,threshold:1}).observe(sentinel);

    /* ---------- collapse control ---------- */
    const toggleWrap = () => {
        wrapTable.classList.toggle('collapsed');
        btnToggle.textContent = wrapTable.classList.contains('collapsed')
            ? 'Показать список' : 'Свернуть';
    };
    btnToggle.onclick = toggleWrap;

    /* ---------- search (debounced) ---------- */
    inpSearch.addEventListener('input', ()=>{
        clearTimeout(debounceTmr);
        debounceTmr = setTimeout(()=>{
            currentSearch = inpSearch.value.trim();
            resetList(); loadChunk();
        }, SEARCH_DEBOUNCE);
    });

    /* ---------- open modal (new / edit) ---------- */
    function openModal(g=null){
        if (g){                            // edit
            titleModal.textContent = `Редактирование #${g.id}`;
            fId.value    = g.id;
            fName.value  = g.ФИО;
            fBirth.value = g.дата_рождения;
            fPhone.value = g.телефон ?? '';
            fEmail.value = g.email   ?? '';
            btnDelete.style.display = '';
        }else{                             // new
            titleModal.textContent = 'Новый посетитель';
            form.reset(); fId.value='';
            btnDelete.style.display = 'none';
        }
        modal.show();
    }

    btnNew.onclick = () => openModal(null);

    /* ---------- save (insert / update) ---------- */
    btnSave.onclick = async ()=>{
        if(!form.reportValidity()) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        const method  = payload.ид ? 'PUT' : 'POST';
        const url     = payload.ид ? `${API_VISIT}?id=${payload.ид}` : API_VISIT;
        const r = await fetch(url,{
            method,
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const j = await r.json(); if(j.error) return alert(j.error);
        modal.hide(); resetList(); loadChunk();
    };

    /* ---------- delete ---------- */
    btnDelete.onclick = async ()=>{
        if(!confirm('Удалить посетителя?')) return;
        const id = fId.value;
        await fetch(`${API_VISIT}?id=${id}`,{method:'DELETE'});
        modal.hide(); resetList(); loadChunk();
    };

    /* ---------- init ---------- */
    document.addEventListener('DOMContentLoaded',()=>{
        loadChunk();                        // первая порция
    });
})();
