/* ============================================================== *
 *  visit_create.js   ·   регистрация посещений (плательщик = 1)
 * ============================================================== */
(() => {
    'use strict';

    /* ---------- CONST ---------- */
    const HUB        = '/api/s_hub.php';
    const API_GUEST  = '/api/visitors_api.php';
    const LS_PARK    = 'selectedParkId';
    const DEB        = 300;                    // мс для дебаунса

    /* ---------- DOM refs ---------- */
    const selParkHdr = document.getElementById('aqua');         // глобальный <select>
    const parkCap    = document.getElementById('vc-park-name');

    const payerInp   = document.getElementById('payer-search');
    const payerList  = document.getElementById('payer-suggest');
    const payerIdHid = document.getElementById('payer-id');
    const btnAddTick = document.getElementById('btn-add-ticket');

    const tblBody    = document.querySelector('#tickets-table tbody');
    const tblEmpty   = document.getElementById('tickets-empty');
    const totalCell  = document.getElementById('tickets-total');
    const payBlock   = document.getElementById('pay-block');
    const paySel     = document.getElementById('pay-method');
    const btnConfirm = document.getElementById('btn-confirm');

    /* modal */
    const modalEl    = document.getElementById('modal-ticket');
    const modal      = new bootstrap.Modal(modalEl);
    const tTariffRadio = document.getElementById('t-tariff');
    const tAbonRadio   = document.getElementById('t-abon');
    const tTariffBlock = document.getElementById('t-tariff-block');
    const tTarSel      = document.getElementById('t-tariff-select');
    const tQty         = document.getElementById('t-qty');
    const tAbonBlock   = document.getElementById('t-abon-block');
    const tAbonSel     = document.getElementById('t-abon-select');
    const tAbonLeft    = document.getElementById('t-abon-left');
    const tBtnAdd      = document.getElementById('t-btn-add');

    /* ---------- STATE ---------- */
    const seasonNow = (()=>{const m=new Date().getMonth();return (m<=1||m===11)?'зима':(m<=4?'весна':(m<=7?'лето':'осень'));})();
    const tickets=[];   // {type:'tariff', tariffId, name, qty, price} | {type:'abon', abonId, name}
    let debTimer;

    /* ---------- helpers ---------- */
    const curParkId = () => localStorage.getItem(LS_PARK)||'';
    const setAddBtnDisabled = ()=> btnAddTick.disabled = !payerIdHid.value || !curParkId();
    const totalPrice = () => tickets.reduce((s,t)=>s+(t.price||0),0);
    const setConfirmDisabled = ()=> btnConfirm.disabled = tickets.length===0 || (totalPrice()>0 && !paySel.value);

    /* ============================================================= *
     * 0. Парк в шапке
     * ============================================================= */
    function renderPark(){
        const id  = curParkId();
          let   txt = '—';
          if (id) {
                const opt = selParkHdr.querySelector(`option[value="${id}"]`);
                txt = opt ? opt.textContent : '-';   // ← резервный текст
              }
          parkCap.textContent = txt;
        setAddBtnDisabled();
    }
    selParkHdr.addEventListener('change',renderPark);
    const observer = new MutationObserver(renderPark);
    observer.observe(selParkHdr, { childList: true });
    document.addEventListener('DOMContentLoaded',renderPark);

    /* ============================================================= *
     * 1. ПЛАТЕЛЬЩИК – поиск
     * ============================================================= */
    payerInp.addEventListener('input',()=>{
        clearTimeout(debTimer);
        debTimer=setTimeout(()=>guestSearch(payerInp,payerList,payerIdHid,setAddBtnDisabled),DEB);
    });
    document.addEventListener('click',e=>{
        if(!payerList.contains(e.target)&&e.target!==payerInp)
            payerList.classList.add('d-none');
    });

    /* ============================================================= *
     * 2. «+ Добавить билет»  →  modal
     * ============================================================= */
    btnAddTick.addEventListener('click',openModal);

    function openModal(){
        resetModal();
        loadTariffs();
        loadAbons();  // если абонемент выбранного плательщика есть
        modal.show();
    }

    function resetModal(){
        tTariffRadio.checked=true;
        switchType();
        tTarSel.innerHTML='<option value="">загрузка…</option>';
        tQty.value=1;
        tAbonSel.innerHTML='<option value="">загрузка…</option>';
        tAbonLeft.textContent='';
        tBtnAdd.disabled=true;
    }

    /* переключатель типа */
    tTariffRadio.addEventListener('change',switchType);
    tAbonRadio.addEventListener('change',switchType);
    function switchType(){
        const isTar = tTariffRadio.checked;
        tTariffBlock.classList.toggle('d-none',!isTar);
        tAbonBlock.classList.toggle('d-none',isTar);
        validateModal();
    }

    /* --- загрузка тарифов --- */
    async function loadTariffs() {
        if (!curParkId()) {
            tTarSel.innerHTML = '<option value="">нет парка</option>';
            return;
        }
        tTarSel.innerHTML = '<option value="">загрузка…</option>';
        try {
            const url = `${HUB}?op=tariffs&park=${curParkId()}&season=${seasonNow}`;
            const list = await (await fetch(url)).json();

            tTarSel.innerHTML = list.length
                ? '<option value="">выберите тариф</option>'
                : '<option value="">нет тарифов</option>';

            list.forEach(t => {
                const o = document.createElement('option');
                o.value         = t.id;
                o.dataset.price = t.цена;
                o.dataset.cat   = t.категория_гостя;
                o.dataset.guest = t.кол_гостей;
                o.textContent =
                    `${t.название} • ${t.категория_гостя} • ${t.кол_гостей} чел` +
                    ` • ${t.длительность_мин} мин • ${(+t.цена).toFixed(2)} ₽`;
                tTarSel.appendChild(o);
            });
        } catch (e) {
            console.error('tariffs', e);
            tTarSel.innerHTML = '<option value="">ошибка загрузки</option>';
        }
    }

    /* --- загрузка абонементов --- */
    async function loadAbons(){
        tAbonSel.innerHTML='<option value="">нет плательщика</option>'; tAbonLeft.textContent='';
        if(!payerIdHid.value) return;
        try{
            const url=`${HUB}?op=abons&guest=${payerIdHid.value}&park=${curParkId()}`;
            const list=await (await fetch(url)).json();
            tAbonSel.innerHTML=list.length?'<option value="">выберите абонемент</option>':'<option value="">нет активных</option>';
            list.forEach(a=>{
                const o=document.createElement('option');
                o.value=a.id; o.dataset.left=a.осталось_визитов;
                o.textContent=`${a.название} (осталось ${a.осталось_визитов})`;
                tAbonSel.appendChild(o);
            });
        }catch(e){console.error('abons',e);}
    }
    tAbonSel.addEventListener('change',()=>{
        const opt=tAbonSel.selectedOptions[0];
        tAbonLeft.textContent=opt && opt.dataset.left ? `Останется: ${opt.dataset.left-1}`:'';
        validateModal();
    });

    /* --- модальное guest search убрали (гостей нет) --- */

    /* --- валидатор модалки --- */
    function validateModal(){
        const ok = tTariffRadio.checked
            ? tTarSel.value && +tQty.value>=1
            : !!tAbonSel.value;
        tBtnAdd.disabled=!ok;
    }

    /* --- ADD ticket --- */
    tBtnAdd.addEventListener('click',()=>{
        if(tTariffRadio.checked){
            const opt=tTarSel.selectedOptions[0];
            tickets.push({
                type:'tariff',
                tariffId:opt.value,
                name:opt.textContent,
                qty:+tQty.value,
                price:+opt.dataset.price * +tQty.value
            });
        }else{
            const opt=tAbonSel.selectedOptions[0];
            tickets.push({
                type:'abon',
                abonId:opt.value,
                name:opt.textContent,
                qty:1,
                price:0
            });
        }
        renderTable();
        modal.hide();
    });

    /* ============================================================= *
     * 3. TABLE  +  итого
     * ============================================================= */
    /* ---------- Отрисовка таблицы билетов ---------- */
    function renderTable() {
        tblBody.innerHTML = '';
        tickets.forEach((t, i) => {
            const tr = tblBody.insertRow();
            tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${t.type === 'tariff' ? 'Тариф' : 'Абон.'}</td>
      <td>${t.name}</td>
      <td>${t.qty}</td>
      <td>${t.price ? t.price.toFixed(2) : '—'}</td>
      <td><button class="btn btn-sm btn-outline-danger del" data-i="${i}">×</button></td>`;
        });

        if (tickets.length === 0) tblBody.appendChild(tblEmpty);
        totalCell.textContent = totalPrice().toFixed(2);

        payBlock.style.display = totalPrice() > 0 ? '' : 'none';
        setConfirmDisabled();
    }


    /* ============================================================= *
     * 4. CONFIRM
     * ============================================================= */
    btnConfirm.addEventListener('click',async ()=>{
        if(btnConfirm.disabled) return;
        const rows=[];
        tickets.forEach(t=>{
            if(t.type==='tariff'){
                rows.push({type:'tariff',tariff_id:t.tariffId,qty:t.qty});
            }else rows.push({type:'abon',abon_id:t.abonId});
        });
        const body={
            payer_id : payerIdHid.value,
            park_id  : curParkId(),
            pay_method: totalPrice()>0 ? paySel.value : null,
            visits   : rows
        };
        btnConfirm.disabled=true;
        try{
            const j=await (await fetch(`${HUB}?op=visits`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(body)
            })).json();
            if(j.error) throw new Error(j.error);
            alert('Сохранено!');
            tickets.length=0; renderTable();
            paySel.value='';
        }catch(e){alert('Ошибка: '+e.message);}
        finally{btnConfirm.disabled=false;}
    });

    /* ============================================================= *
     * 5. helper: guest search (общий)
     * ============================================================= */
    async function guestSearch(inp,list,hid,cb){
        const q=inp.value.trim();
        list.classList.add('d-none'); hid.value=''; cb();
        if(q.length<2) return;
        try{
            const res=await fetch(`${API_GUEST}?q=${encodeURIComponent(q)}&limit=10`);
            const arr=await res.json();
            if(arr.length===0) return;
            list.innerHTML='';
            arr.forEach(g=>{
                const btn=document.createElement('button');
                btn.type='button'; btn.className='list-group-item list-group-item-action';
                btn.textContent=`${g.ФИО} (${g.телефон||'—'})`;
                btn.onclick=()=>{
                    hid.value=g.id; inp.value=g.ФИО;
                    list.classList.add('d-none'); cb();
                    if(inp===payerInp) { setAddBtnDisabled(); loadAbons(); }
                };
                list.appendChild(btn);
            });
            list.classList.remove('d-none');
        }catch(e){console.error('guest search',e);}
    }

})();
