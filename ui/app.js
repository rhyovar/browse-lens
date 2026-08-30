const WS_URL = 'ws://127.0.0.1:8765';
let ws = null;
let spaces = [];
let selectedSpaceId = null;
function $(id) {
    return document.getElementById(id);
}
function setStatus(text, connected) {
    const el = $('status');
    el.textContent = text;
    el.className = 'status ' + (connected ? 'connected' : 'disconnected');
}
function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    setStatus('Connecting...', false);
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        setStatus('Connected', true);
        send({ type: 'space.list', payload: {} });
    };
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        }
        catch (e) {
            console.error('Failed to parse message:', e);
        }
    };
    ws.onerror = () => {
        setStatus('Error', false);
    };
    ws.onclose = () => {
        setStatus('Disconnected', false);
        spaces = [];
        selectedSpaceId = null;
        renderSpaces();
        $('spaceDetails').innerHTML = '<div class="empty-state">Select a space to view details</div>';
    };
}
function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
function handleMessage(msg) {
    switch (msg.type) {
        case 'space.list': {
            spaces = msg.payload;
            renderSpaces();
            break;
        }
        case 'space.created': {
            const space = msg.payload;
            spaces = [...spaces, space];
            renderSpaces();
            break;
        }
        case 'space.closed': {
            const { spaceId, closed } = msg.payload;
            if (closed) {
                spaces = spaces.filter(s => s.id !== spaceId);
                if (selectedSpaceId === spaceId) {
                    selectedSpaceId = null;
                    $('spaceDetails').innerHTML = '<div class="empty-state">Select a space to view details</div>';
                }
                renderSpaces();
            }
            break;
        }
        case 'browser.list': {
            if (selectedSpaceId) {
                renderSpaceDetails(selectedSpaceId, msg.payload);
            }
            break;
        }
        case 'error': {
            console.error('Server error:', msg.payload.message);
            break;
        }
        default:
            break;
    }
}
function renderSpaces() {
    const list = $('spaceList');
    list.innerHTML = '';
    if (spaces.length === 0) {
        list.innerHTML = '<li class="empty-state">No spaces yet</li>';
        return;
    }
    for (const space of spaces) {
        const li = document.createElement('li');
        li.className = 'space-item' + (space.id === selectedSpaceId ? ' selected' : '');
        li.textContent = space.name;
        li.addEventListener('click', () => selectSpace(space.id));
        list.appendChild(li);
    }
}
function selectSpace(spaceId) {
    selectedSpaceId = spaceId;
    renderSpaces();
    send({ type: 'browser.list', payload: { spaceId } });
}
function renderSpaceDetails(spaceId, pages) {
    const space = spaces.find(s => s.id === spaceId);
    const container = $('spaceDetails');
    if (!space) {
        container.innerHTML = '<div class="empty-state">Space not found</div>';
        return;
    }
    const flags = [];
    if (space.importProfile)
        flags.push('<span class="flag import">Import Profile</span>');
    if (space.privacy)
        flags.push('<span class="flag privacy">Privacy</span>');
    if (space.record)
        flags.push('<span class="flag record">Record</span>');
    let pagesHtml;
    if (pages.length === 0) {
        pagesHtml = '<li class="empty-state">No pages yet</li>';
    }
    else {
        pagesHtml = pages
            .map((p) => `<li class="page-item"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a></li>`)
            .join('');
    }
    container.innerHTML = `
    <div class="space-header">
      <h3>${escapeHtml(space.name)}</h3>
      <span class="space-id">${space.id.slice(0, 8)}...</span>
    </div>
    <div class="space-flags">${flags.join('')}</div>
    <div class="lists">
      <div class="list-block">
        <h4>Allowlist</h4>
        <p>${space.allowlist.length ? escapeHtml(space.allowlist.join(', ')) : 'Empty'}</p>
      </div>
      <div class="list-block">
        <h4>Blocklist</h4>
        <p>${space.blocklist.length ? escapeHtml(space.blocklist.join(', ')) : 'Empty'}</p>
      </div>
    </div>
    <div class="pages-section">
      <h4>Pages</h4>
      <ul class="pages-list">${pagesHtml}</ul>
    </div>
  `;
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function createSpace() {
    const nameInput = $('spaceName');
    const name = nameInput.value.trim();
    if (!name)
        return;
    send({ type: 'space.create', payload: { name } });
    nameInput.value = '';
}
// Event listeners
$('connectBtn').addEventListener('click', connect);
$('createSpaceBtn').addEventListener('click', createSpace);
$('spaceName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter')
        createSpace();
});
// Auto-connect on load
connect();
