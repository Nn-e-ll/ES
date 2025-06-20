(() => {
    'use strict';

    /* ---- API ---- */
    const API = '/api/visitor_extra.php';   // см. PHP ниже

    /* ---- DOM ---- */
    const modal      = new bootstrap.Modal('#modal-extra');
    const titleEl    = document.getElementById('extra-title');
    const headRow    = document.getElementById('extra-head');
    const tbody      = document.querySelector('#extra-table tbody');

    /* ---- колонки ---- */
    const HEADS = {
        abons : ['ID','Вид','Куплен','Истекает','Осталось визитов','Сумма ₽'],
        visits: ['ID','Аквапарк','Дата','Вход','Выход','Минут','Доплата ₽']
    };

    /* ---- attach listeners once DOM ready ---- */
    document.addEventListener('DOMContentLoaded',()=>{
        /* кнопки в модале visitors */
        document.getElementById('btn-vis-abons')
            .addEventListener('click',()=>openExtra('abons'));
        document.getElementById('btn-vis-history')
            .addEventListener('click',()=>openExtra('visits'));
    });

    /* ---- core ---- */
    let currentGuestId = null;               // visitors.js заполняет fId.value
    function openExtra(kind){
        currentGuestId = document.getElementById('vis-id').value;
        if(!currentGuestId){ alert('Сначала сохраните гостя'); return; }

        titleEl.textContent = kind === 'abons'
            ? `Абонементы гостя #${currentGuestId}`
            : `История посещений гостя #${currentGuestId}`;

        /* шапка таблицы */
        headRow.innerHTML = HEADS[kind].map(t=>`<th>${t}</th>`).join('');

        loadData(kind);
    }

    async function loadData(kind){
        tbody.innerHTML = '<tr><td class="text-center p-2" colspan="10">Загрузка…</td></tr>';

        const res = await fetch(`${API}?guest=${currentGuestId}&kind=${kind}`);
        const arr = await res.json();

        if(arr.length===0){
            tbody.innerHTML = '<tr><td class="text-center p-2" colspan="10">Нет данных</td></tr>';
            modal.show(); return;
        }

        tbody.innerHTML = '';
        if(kind==='abons'){
            arr.forEach(a=>{
                const tr = tbody.insertRow();
                tr.innerHTML = `
          <td>${a.id}</td>
          <td>${a.название}</td>
          <td>${a.дата_покупки}</td>
          <td>${a.истекает}</td>
          <td>${a.осталось_визитов}</td>
          <td>${a.сумма}</td>`;
            });
        }else{
            arr.forEach(v=>{
                const tr = tbody.insertRow();
                tr.innerHTML = `
          <td>${v.id}</td>
          <td>${v.аквапарк}</td>
          <td>${v.дата_посещения}</td>
          <td>${v.вход}</td>
          <td>${v.выход ?? '—'}</td>
          <td>${v.минут_факт ?? '—'}</td>
          <td>${v.доплата ?? 0}</td>`;
            });
        }
        modal.show();
    }
})();
