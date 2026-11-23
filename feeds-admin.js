window.createFeedsAdmin = function (auth, reload, bulkUpdate) {
  const entries = new Set();
  const rows = new Map();
  const selectedRows = () => [...document.querySelectorAll('.feed-select-record:checked')].map(input => rows.get(String(input.value))).filter(Boolean);
  function button(text, action, className = '') {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text; element.className = className;
    element.addEventListener('click', action); return element;
  }
  function attach(article, row) {
    const selectRow = document.createElement('label'); selectRow.className = 'feed-select-row';
    const select = document.createElement('input'); select.type = 'checkbox'; select.className = 'feed-select-record'; select.value = row.id;
    selectRow.append(select, document.createTextNode(' Select record'));
    article.insertBefore(selectRow, article.firstChild);
    rows.set(String(row.id), row);
    const baseAttach = attachRecord(article, row, selectRow);
    entries.add(baseAttach);
    baseAttach();
  }
  return {
    attach,
    refresh() { entries.forEach(refresh => refresh()); },
    clear() { entries.clear(); rows.clear(); }
  };

  function attachRecord(article, row, selectRow) {
    const actions = document.createElement('div'); actions.className = 'feed-record-actions';
    const message = document.createElement('p'); message.className = 'feed-edit-status'; message.setAttribute('role', 'status'); message.hidden = true;
    let editor = null, busy = false;
    function refresh() {
      selectRow.classList.toggle('visible', auth.canManageFeeds);
      actions.hidden = !auth.canManageFeeds;
      actions.style.display = auth.canManageFeeds ? '' : 'none';
      if (!auth.canManageFeeds) { cancel(); message.textContent = ''; message.hidden = true; }
    }
    function cancel() { editor?.remove(); editor = null; edit.disabled = busy; }
    async function mutate(action, record = null, targets = [row]) {
      if (busy || !auth.canManageFeeds) return;
      if (action === 'delete' && !window.confirm(`Delete this feed record from ${row.name || 'this author'}? This cannot be undone.`)) return;
      busy = true; message.hidden = false; message.textContent = action === 'save' ? 'Saving...' : 'Deleting...';
      [...actions.querySelectorAll('button'), ...(editor?.querySelectorAll('button,input,textarea') || [])].forEach(control => { control.disabled = true; });
      try {
        if (action === 'save' && targets.length > 1) await bulkUpdate(targets, record);
        else await auth.manageFeed(action, row, record);
        await reload();
      }
      catch (error) { message.textContent = error.message || 'The record could not be updated. Please try again.'; }
      finally { busy = false; [...actions.querySelectorAll('button'), ...(editor?.querySelectorAll('button,input,textarea') || [])].forEach(control => { control.disabled = false; }); edit.disabled = Boolean(editor); }
    }
    const edit = button('Edit', () => {
      if (editor || busy || !auth.canManageFeeds) return;
      editor = document.createElement('form'); editor.className = 'feed-editor'; const fields = {};
      for (const [key, title] of [['name', 'Name'], ['title', 'Title'], ['update', 'Update'], ['date', 'Date']]) {
        const label = document.createElement('label'); label.textContent = title;
        const input = document.createElement(key === 'update' ? 'textarea' : 'input');
        if (key === 'date') { input.type = 'date'; input.required = true; }
        input.value = row[key] ?? ''; fields[key] = input; label.append(input); editor.append(label);
      }
      const cardLabel = document.createElement('label'); cardLabel.className = 'feed-card-toggle';
      const cardInput = document.createElement('input'); cardInput.type = 'checkbox'; cardInput.checked = row.show_name_card !== false; fields.show_name_card = cardInput;
      cardLabel.append(cardInput, document.createTextNode(' Show name card')); editor.append(cardLabel);
      const selected = selectedRows();
      const targets = selectRow.querySelector('input').checked && selected.length > 1 ? selected : [row];
      if (targets.length > 1) {
        const note = document.createElement('p'); note.className = 'feed-bulk-note';
        note.textContent = `Saving will apply these details to all ${targets.length} selected records.`;
        editor.append(note);
      }
      const buttons = document.createElement('div'); buttons.className = 'feed-record-actions';
      const save = button('Save', () => {}); save.type = 'submit';
      buttons.append(save, button('Cancel', () => { cancel(); message.textContent = ''; message.hidden = true; })); editor.append(buttons);
      editor.addEventListener('submit', event => {
        event.preventDefault();
        if (editor.reportValidity()) {
          const record = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value]));
          mutate('save', record, targets);
        }
      });
      article.insertBefore(editor, message); edit.disabled = true; fields.name.focus();
    });
    actions.append(edit, button('Delete', () => mutate('delete'), 'feed-delete'));
    article.append(actions, message);
    return refresh;
  }
};
