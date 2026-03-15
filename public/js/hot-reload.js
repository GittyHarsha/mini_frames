window.HotReload = {
  connect() {
    const ws = new WebSocket(`ws://${window.location.host}`);

    ws.addEventListener('open', () => {
      console.log('Connected to Mini Frames server');
      if (this._reconnecting) {
        this._reconnecting = false;
        this._syncPages();
      }
    });

    ws.addEventListener('message', (event) => {
      const { type, filename } = JSON.parse(event.data);
      const id = filename.replace(/\.html$/, '');

      if (type === 'add') {
        WindowManager.create(id, filename, '/pages/' + filename);
        if (window.Sidebar) Sidebar.refresh();
      } else if (type === 'change') {
        WindowManager.reload(id);
      } else if (type === 'delete') {
        WindowManager.close(id);
        if (window.Sidebar) Sidebar.refresh();
      } else if (type === 'metadata-update') {
        if (window.Sidebar) Sidebar.refresh();
      }
    });

    ws.addEventListener('close', () => {
      console.log('Disconnected, reconnecting...');
      this._scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  },

  _scheduleReconnect() {
    this._reconnecting = true;
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, 2000);
  },

  _syncPages() {
    fetch('/api/pages')
      .then((res) => res.json())
      .then((pages) => {
        const pageIds = new Set(pages.map((f) => f.replace(/\.html$/, '')));

        // Create windows for new pages
        pages.forEach((filename) => {
          const id = filename.replace(/\.html$/, '');
          WindowManager.create(id, filename, '/pages/' + filename);
        });

        // Close windows for removed pages
        WindowManager.getAll().forEach((id) => {
          if (!pageIds.has(id)) {
            WindowManager.close(id);
          }
        });

        if (window.Sidebar) Sidebar.refresh();
      })
      .catch((err) => console.error('Failed to sync pages:', err));
  },
};
