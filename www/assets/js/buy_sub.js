/* ============================================================= *
 *  Продажа абонемента  (buy_sub.js)   —   1-файловый hub-API
 *    - парки       : GET  /api/sales_hub.php?op=parks
 *    - виды        : GET  /api/sales_hub.php?op=subs&park=ID&season=…
 *    - покупка     : POST /api/sales_hub.php?op=buy   {guest_id,sub_type,pay_method}
 * ============================================================= */
(() => {
    'use strict';

    /* ---------- CONST ---------- */
    const HUB       = '/api/sales_hub.php';
    const API_GUEST = '/api/visitors_api.php';             // поиск гостей

    const LS_PARK   = 'selectedParkId';                    // хранится выбор
    const DEB_TIME  = 300;                                 // мс – debounce поиска

    /* ---------- DOM ---------- */
    const selParkHeader = document.getElementById('aqua'); // селект в шапке
    const parkCaption   = document.getElementById('park-caption');

    const inpSearch = document.getElementById('guest-search');
    const boxSuggest= document.getElementById('guest-suggest');
    const hidGuest  = document.getElementById('guest-id');

    const selSub    = document.getElementById('sub-select');
    const subPrice  = document.getElementById('sub-price');
    const selPay    = document.getElementById('pay-method');
    const btnBuy    = document.getElementById('btn-buy-sub');

    /* ---------- global helpers ---------- */
    const currentParkId = () => localStorage.getItem(LS_PARK) || '';

    const seasonNow = (() => {
        const m=new Date().getMonth();                 // 0-янв … 11-дек
        return (m<=1||m===11)?'зима':(m<=4?'весна':(m<=7?'лето':'осень'));
    })();

    let debounceTmr = null;
    let mapSubs={};                                  // id → объект вида

    const setBuyDisabled = () =>
        btnBuy.disabled = !currentParkId() || !hidGuest.value || !selSub.value;

    /* ============================================================= *
     * 0. Инициализация парков из hub-API (если parks.js не заполнил)
     * ============================================================= */
    (async function initParks(){
        if (selParkHeader.options.length <= 1) {       // шапка ещё пуста
            try{
                const parks = await (await fetch(`${HUB}?op=parks`)).json();
                selParkHeader.innerHTML='<option value="">нет</option>';
                parks.forEach(p=>{
                    const o=document.createElement('option');
                    o.value=p.id;
                    o.textContent=p.название ?? ('Парк '+p.id);
                    selParkHeader.appendChild(o);
                });
            }catch(e){console.error('parks load',e);}
        }
        /* восстановить выбор и обновить подпись */
        const saved=currentParkId();
        if(saved && selParkHeader.querySelector(`option[value="${saved}"]`))
            selParkHeader.value=saved;

        onParkChange();                            // первым делом подтянем виды
    })();

    /* реагируем на смену парка */
    selParkHeader.addEventListener('change',()=>{
        localStorage.setItem(LS_PARK, selParkHeader.value||'');
        onParkChange();
    });

    function onParkChange(){
        const opt=selParkHeader.querySelector(`option[value="${currentParkId()}"]`);
        parkCaption.textContent = opt ? opt.textContent : '—';
        loadSubs();
    }

    /* ============================================================= *
     * 1. Загрузка видов абонемента для текущего парка + сезона
     * ============================================================= */
    async function loadSubs(){
        selSub.innerHTML='<option value="">— выберите вид —</option>';
        selSub.disabled = !currentParkId();
        mapSubs={};  subPrice.textContent='Цена: —';  setBuyDisabled();
        if(!currentParkId()) return;

        const url = `${HUB}?op=subs&park=${currentParkId()}&season=${seasonNow}`;
        try{
            const arr = await (await fetch(url)).json();
            arr.forEach(v=>{
                mapSubs[v.id]=v;
                const o=document.createElement('option');
                o.value=v.id;
                o.textContent=`${v.название} • ${v.кол_посещений} пос. • ${v.срок_дней} дн`;
                selSub.appendChild(o);
            });
        }catch(e){console.error('subs load',e);}
    }

    selSub.addEventListener('change',()=>{
        const v=mapSubs[selSub.value];
        subPrice.textContent = v ? `Цена: ${(+v.цена).toFixed(2)} ₽` : 'Цена: —';
        setBuyDisabled();
    });

    /* ============================================================= *
     * 2. Live-поиск гостей
     * ============================================================= */
    inpSearch.addEventListener('input',()=>{
        clearTimeout(debounceTmr);
        debounceTmr=setTimeout(findGuests, DEB_TIME);
    });

    async function findGuests(){
        const q=inpSearch.value.trim();
        boxSuggest.classList.add('d-none'); hidGuest.value=''; setBuyDisabled();
        if(q.length<2) return;

        try{
            const res=await fetch(`${API_GUEST}?q=${encodeURIComponent(q)}&limit=10`);
            const list=await res.json();
            if(list.length===0) return;

            boxSuggest.innerHTML='';
            list.forEach(g=>{
                const btn=document.createElement('button');
                btn.type='button';
                btn.className='list-group-item list-group-item-action';
                btn.textContent=`${g.ФИО} (${g.телефон||'—'})`;
                btn.onclick=()=>{
                    hidGuest.value=g.id;
                    inpSearch.value=g.ФИО;
                    boxSuggest.classList.add('d-none');
                    setBuyDisabled();
                };
                boxSuggest.appendChild(btn);
            });
            boxSuggest.classList.remove('d-none');
        }catch(e){console.error('guest search',e);}
    }
    document.addEventListener('click',e=>{
        if(!boxSuggest.contains(e.target)&&e.target!==inpSearch)
            boxSuggest.classList.add('d-none');
    });

    /* ============================================================= *
     * 3. Покупка абонемента
     * ============================================================= */
    btnBuy.addEventListener('click',async ()=>{
        if(btnBuy.disabled) return;
        const payload={
            guest_id  : hidGuest.value,
            sub_type  : selSub.value,
            pay_method: selPay.value
        };
        btnBuy.disabled=true;
        try{
            const res=await fetch(`${HUB}?op=buy`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload)
            });
            const j=await res.json();
            if(j.error) throw new Error(j.error);
            alert('Абонемент успешно оформлен!');

            hidGuest.value=''; inpSearch.value='';
            selSub.value=''; subPrice.textContent='Цена: —';
            setBuyDisabled();
        }catch(e){alert('Ошибка: '+e.message);}
        finally{btnBuy.disabled=false;}
    });

    document.addEventListener('DOMContentLoaded',setBuyDisabled);
})();
