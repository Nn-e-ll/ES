    (async () => {
    const sel   = document.getElementById('aqua');          // <select id="aqua">
    const store = 'selectedParkId';                         // ключ в localStorage

    /* ─── 1. тянем парки с сервера ───────────────────────── */
    try {
    const res   = await fetch('/api/parks_api.php?action=list');
    const parks = await res.json();                       // [{id, название, …}, …]

    sel.innerHTML = '<option value="">нет</option>';      // сброс / базовый пункт
    parks.forEach(p => {
    const o   = document.createElement('option');
    o.value   = p.id;
    o.textContent = p.название ?? p.name ?? ('Парк ' + p.id);
    sel.appendChild(o);
});
} catch (e) {
    console.error('Не удалось загрузить список парков', e);
}

    /* ─── 2. ставим сохранённый выбор ────────────────────── */
    const saved = localStorage.getItem(store);
    if (saved) sel.value = saved;

    /* ─── 3. сохраняем выбор при изменении ───────────────── */
    sel.addEventListener('change', () => {
    if (sel.value)  localStorage.setItem(store, sel.value);
    else            localStorage.removeItem(store);       // выбрано «нет»
});

    /* ─── 4. удобный помощник для других скриптов ────────── */
    window.getSelectedParkId = () =>
    localStorage.getItem(store) || '';                // '' если не выбран
})();