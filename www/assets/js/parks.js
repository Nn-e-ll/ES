const apiURL = '/api/parks_api.php';

const tblBody = document.querySelector('#parks-table tbody');
const modalEl = document.getElementById('parkModal');
const modal   = new bootstrap.Modal(modalEl);
const hoursTbody = document.querySelector('#hours-table tbody');

document.addEventListener('DOMContentLoaded', loadParks);
document.getElementById('add-park-btn' ).onclick = () => openModal(null);
document.getElementById('add-hour-row').onclick  = () => addHourRow();
document.getElementById('save-park-btn').onclick = savePark;
document.getElementById('delete-park-btn').onclick = deletePark;

/* ───────── загрузка списка ───────── */
async function loadParks() {
    const res = await fetch(`${apiURL}?action=list`);
    const data = await res.json();
    tblBody.innerHTML = '';
    data.forEach(p => {
        const tr = tblBody.insertRow();
        tr.innerHTML =
            `<td>${p.id}</td><td>${p.название}</td><td>${p.адрес}</td>
       <td>${p.open ?? '-'}</td><td>${p.close ?? '-'}</td>`;
        tr.onclick = () => openModal(p.id);
    });
}

/* openModal — правка: сохраняем id в data атрибут */
/* ========== openModal ========== */
async function openModal(id) {
    hoursTbody.innerHTML = '';
    const delBtn = document.getElementById('delete-park-btn');

    if (!id) {                                 // новый
        document.getElementById('park-id').value = '';
        delBtn.style.display = 'none';
        addHourRow();
        modal.show(); return;
    }

    delBtn.style.display = '';
    const r  = await fetch(`${apiURL}?action=get&id=${id}`);
    const d  = await r.json();

    document.getElementById('park-id').value      = d.id;
    document.getElementById('park-name').value    = d.название;
    document.getElementById('park-address').value = d.адрес;

    d.hours.forEach(addHourRow);
    modal.show();
}

/* ========== savePark ========== */
async function savePark() {
    const idRaw = document.getElementById('park-id').value;
    const id    = idRaw !== '' ? parseInt(idRaw,10) : null;

    const название = document.getElementById('park-name').value.trim();
    const адрес    = document.getElementById('park-address').value.trim();

    const hours = Array.from(hoursTbody.rows).map(r => ({
        id        : r.dataset.rowId || null,
        сезон     : r.querySelector('.season').value,
        тип_дня   : r.querySelector('.day').value,
        время_отк : r.querySelector('.open').value,
        время_зак : r.querySelector('.close').value
    }));

    const payload = { id, название, адрес, hours };

    const res = await fetch(apiURL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    });
    const j = await res.json();
    if (j.error) { alert(j.error); return; }

    modal.hide(); loadParks();
}

/* ========== addHourRow (фикс: dataset.rowId) ========== */
function addHourRow(row={}) {
    const tr = hoursTbody.insertRow();
    if(row.id) tr.dataset.rowId = row.id;     // important
    tr.innerHTML = `
    <td><select class="form-select form-select-sm season">
        <option>весна</option><option>лето</option>
        <option>осень</option><option>зима</option></select></td>
    <td><select class="form-select form-select-sm day">
        <option>будний</option><option>выходной</option><option>праздник</option></select></td>
    <td><input type="time" class="form-control form-control-sm open"></td>
    <td><input type="time" class="form-control form-control-sm close"></td>
    <td><button class="btn btn-sm btn-outline-danger">×</button></td>`;
    tr.querySelector('.season').value = row.сезон   || 'лето';
    tr.querySelector('.day').value    = row.тип_дня || 'будний';
    tr.querySelector('.open').value   = row.время_отк || '09:00';
    tr.querySelector('.close').value  = row.время_зак || '21:00';
    tr.querySelector('button').onclick = () => tr.remove();
}



/* ───────── удалить ───────── */
async function deletePark(){
    const id = modalEl.querySelector('#park-id').value;
    if (!id || !confirm('Удалить аквапарк?')) return;
    await fetch(`${apiURL}?id=${id}`, {method:'DELETE'});
    modal.hide(); loadParks();
}