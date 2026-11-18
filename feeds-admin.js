window.createFeedsAdmin = function (auth, reload) {
  const entries = new Set();
  function button(text, action, className = '') {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text; element.className = className;
    element.addEventListener('click', action); return element;
  }
  function attach(article, row) {
    const actions = document.createElement('div'); actions.className = 'feed-record-actions';
    const message = document.createElement('p'); message.className = 'feed-edit-status'; message.setAttribute('role', 'status'); message.hidden = true;
    let editor = null, busy = false;
    function refresh() {
      actions.hidden = !auth.canManageFeeds;
      // Explicit display overrides the flex layout when the user signs out.
      actions.style.display = auth.canManageFeeds ? '' : 'none';
      if (!auth.canManageFeeds) { cancel(); message.textContent = ''; message.hidden = true; }
    }
    function cancel() { editor?.remove(); editor = null; edit.disabled = busy; }
    async function mutate(action, record = null) {
      if (busy || !auth.canManageFeeds) return;
      if (action === 'delete' && !window.confirm(`Delete this feed record from ${row.name || 'this author'}? This cannot be undone.`)) return;
      busy = true; message.hidden = false; message.textContent = action === 'save' ? 'Saving...' : 'Deleting...';
      [...actions.querySelectorAll('button'), ...(editor?.querySelectorAll('button,input,textarea') || [])].forEach(control => { control.disabled = true; });
      try {
        await auth.manageFeed(action, row, record);
        await reload();
      } catch (error) {
        message.textContent = error.message || 'The record could not be updated. Please try again.';
      } finally {
        busy = false;
        [...actions.querySelectorAll('button'), ...(editor?.querySelectorAll('button,input,textarea') || [])].forEach(control => { control.disabled = false; });
        edit.disabled = Boolean(editor);
      }
    }
    const edit = button('Edit', () => {
      if (editor || busy || !auth.canManageFeeds) return;
      editor = document.createElement('form'); editor.className = 'feed-editor';
      const fields = {};
      for (const [key, title] of [['name', 'Name'], ['title', 'Title'], ['update', 'Update'], ['date', 'Date']]) {
        const label = document.createElement('label'); label.textContent = title;
        const input = document.createElement(key === 'update' ? 'textarea' : 'input');
        if (key === 'date') { input.type = 'date'; input.required = true; }
        input.value = row[key] ?? ''; fields[key] = input; label.append(input); editor.append(label);
      }
      const buttons = document.createElement('div'); buttons.className = 'feed-record-actions';
      const save = button('Save', () => {}); save.type = 'submit';
      buttons.append(save, button('Cancel', () => { cancel(); message.textContent = ''; message.hidden = true; })); editor.append(buttons);
      editor.addEventListener('submit', event => {
        event.preventDefault();
        if (editor.reportValidity()) mutate('save', Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])));
      });
      article.insertBefore(editor, message); edit.disabled = true; fields.name.focus();
    });
    actions.append(edit, button('Delete', () => mutate('delete'), 'feed-delete'));
    article.append(actions, message); entries.add(refresh); refresh();
  }
  return { attach, refresh() { entries.forEach(refresh => refresh()); }, clear() { entries.clear(); } };
};
