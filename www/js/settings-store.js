(function (window) {
  'use strict';

  var DEFAULT_SETTINGS = {
    jellyfin: {
      enabled: false,
      serverUrl: '',
      username: '',
      password: '',
      userId: '',
      accessToken: '',
      selectedLibraries: []
    },
    sync: {
      localProgressEnabled: true,
      jellyfinProgressEnabled: false,
      lastSyncAt: ''
    },
    eink: {
      enabled: false,
      autoSend: false,
      transport: 'usb-serial',
      profile: 'portrait-480x800'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    });

    return target;
  }

  function readPath(object, path) {
    return path.split('.').reduce(function (current, part) {
      return current ? current[part] : undefined;
    }, object);
  }

  function writePath(object, path, value) {
    var parts = path.split('.');
    var cursor = object;

    parts.slice(0, -1).forEach(function (part) {
      cursor[part] = cursor[part] || {};
      cursor = cursor[part];
    });

    cursor[parts[parts.length - 1]] = value;
  }

  function SettingsStore() {
    this.db = null;
    this.mode = 'indexeddb';
    this.ready = null;
  }

  SettingsStore.prototype.open = function () {
    if (this.ready) {
      return this.ready;
    }

    this.ready = window.sqlitePlugin ? this.openSQLite() : this.openIndexedDB();
    return this.ready;
  };

  SettingsStore.prototype.openSQLite = function () {
    return new Promise(function (resolve, reject) {
      this.mode = 'sqlite';
      this.db = window.sqlitePlugin.openDatabase({
        name: 'eink_reader.db',
        location: 'default'
      });

      this.db.transaction(function (tx) {
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)'
        );
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS jellyfin_catalog (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, is_folder INTEGER NOT NULL, raw_json TEXT NOT NULL, updated_at INTEGER NOT NULL)'
        );
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS jellyfin_downloads (item_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, local_path TEXT NOT NULL, size INTEGER NOT NULL, raw_json TEXT NOT NULL, downloaded_at INTEGER NOT NULL)'
        );
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS reading_progress (progress_key TEXT PRIMARY KEY NOT NULL, book_name TEXT NOT NULL, cfi TEXT NOT NULL, percentage REAL NOT NULL, page_index INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
        );
      }, reject, function () {
        console.log('[SettingsStore] ready sqlite');
        resolve(this);
      }.bind(this));
    }.bind(this));
  };

  SettingsStore.prototype.openIndexedDB = function () {
    return new Promise(function (resolve, reject) {
      this.mode = 'indexeddb';
      var request = window.indexedDB.open('eink_reader', 4);

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('jellyfin_catalog')) {
          var catalogStore = db.createObjectStore('jellyfin_catalog', { keyPath: 'id' });
          catalogStore.createIndex('parentId', 'parentId', { unique: false });
        }

        if (!db.objectStoreNames.contains('jellyfin_downloads')) {
          db.createObjectStore('jellyfin_downloads', { keyPath: 'itemId' });
        }

        if (!db.objectStoreNames.contains('reading_progress')) {
          db.createObjectStore('reading_progress', { keyPath: 'key' });
        }
      };

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        this.db = request.result;
        console.log('[SettingsStore] ready indexeddb');
        resolve(this);
      }.bind(this);
    }.bind(this));
  };

  SettingsStore.prototype.getAll = function () {
    return this.open().then(function () {
      return this.mode === 'sqlite' ? this.getAllSQLite() : this.getAllIndexedDB();
    }.bind(this)).then(function (storedSettings) {
      return deepMerge(clone(DEFAULT_SETTINGS), storedSettings);
    });
  };

  SettingsStore.prototype.setValue = function (path, value) {
    return this.open().then(function () {
      var key = path;
      var payload = JSON.stringify(value);
      var updatedAt = Date.now();

      if (this.mode === 'sqlite') {
        return this.setValueSQLite(key, payload, updatedAt);
      }

      return this.setValueIndexedDB(key, payload, updatedAt);
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinCatalogItems = function (parentId, items) {
    return this.open().then(function () {
      var normalizedParentId = parentId || '';
      var now = Date.now();
      var records = (items || []).map(function (item) {
        return {
          id: item.Id,
          parentId: normalizedParentId,
          name: item.Name || 'Untitled',
          type: item.Type || '',
          isFolder: item.IsFolder || item.Type === 'Folder' || item.Type === 'CollectionFolder',
          raw: item,
          updatedAt: now
        };
      });

      if (this.mode === 'sqlite') {
        return this.saveJellyfinCatalogItemsSQLite(normalizedParentId, records);
      }

      return this.saveJellyfinCatalogItemsIndexedDB(normalizedParentId, records);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinCatalogItems = function (parentId) {
    return this.open().then(function () {
      var normalizedParentId = parentId || '';
      if (this.mode === 'sqlite') {
        return this.getJellyfinCatalogItemsSQLite(normalizedParentId);
      }

      return this.getJellyfinCatalogItemsIndexedDB(normalizedParentId);
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinDownload = function (item, download) {
    return this.open().then(function () {
      var record = {
        itemId: item.Id,
        name: item.Name || 'Untitled',
        localPath: download.path,
        size: download.size || 0,
        raw: item,
        downloadedAt: Date.now()
      };

      if (this.mode === 'sqlite') {
        return this.saveJellyfinDownloadSQLite(record);
      }

      return this.saveJellyfinDownloadIndexedDB(record);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownload = function (itemId) {
    return this.open().then(function () {
      if (this.mode === 'sqlite') {
        return this.getJellyfinDownloadSQLite(itemId);
      }

      return this.getJellyfinDownloadIndexedDB(itemId);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownloads = function () {
    return this.open().then(function () {
      if (this.mode === 'sqlite') {
        return this.getJellyfinDownloadsSQLite();
      }

      return this.getJellyfinDownloadsIndexedDB();
    }.bind(this));
  };

  SettingsStore.prototype.saveReadingProgress = function (progress) {
    return this.open().then(function () {
      var record = {
        key: progress.key,
        bookName: progress.bookName || 'Untitled',
        cfi: progress.cfi || '',
        percentage: Number(progress.percentage || 0),
        pageIndex: Number(progress.pageIndex || 1),
        updatedAt: progress.updatedAt || Date.now()
      };

      if (!record.key || !record.cfi) {
        return;
      }

      if (this.mode === 'sqlite') {
        return this.saveReadingProgressSQLite(record);
      }

      return this.saveReadingProgressIndexedDB(record);
    }.bind(this));
  };

  SettingsStore.prototype.getReadingProgress = function (key) {
    return this.open().then(function () {
      if (!key) {
        return null;
      }

      if (this.mode === 'sqlite') {
        return this.getReadingProgressSQLite(key);
      }

      return this.getReadingProgressIndexedDB(key);
    }.bind(this));
  };

  SettingsStore.prototype.getAllSQLite = function () {
    return new Promise(function (resolve, reject) {
      var settings = {};

      this.db.readTransaction(function (tx) {
        tx.executeSql('SELECT key, value FROM settings', [], function (tx, result) {
          var i;
          for (i = 0; i < result.rows.length; i++) {
            var row = result.rows.item(i);
            writePath(settings, row.key, JSON.parse(row.value));
          }
          resolve(settings);
        });
      }, reject);
    }.bind(this));
  };

  SettingsStore.prototype.setValueSQLite = function (key, payload, updatedAt) {
    return new Promise(function (resolve, reject) {
      this.db.transaction(function (tx) {
        tx.executeSql(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
          [key, payload, updatedAt]
        );
      }, reject, resolve);
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinCatalogItemsSQLite = function (parentId, records) {
    return new Promise(function (resolve, reject) {
      this.db.transaction(function (tx) {
        tx.executeSql('DELETE FROM jellyfin_catalog WHERE parent_id = ?', [parentId]);
        records.forEach(function (record) {
          tx.executeSql(
            'INSERT OR REPLACE INTO jellyfin_catalog (id, parent_id, name, type, is_folder, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              record.id,
              record.parentId,
              record.name,
              record.type,
              record.isFolder ? 1 : 0,
              JSON.stringify(record.raw),
              record.updatedAt
            ]
          );
        });
      }, reject, resolve);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinCatalogItemsSQLite = function (parentId) {
    return new Promise(function (resolve, reject) {
      this.db.readTransaction(function (tx) {
        tx.executeSql(
          'SELECT raw_json FROM jellyfin_catalog WHERE parent_id = ? ORDER BY is_folder DESC, name COLLATE NOCASE ASC',
          [parentId],
          function (tx, result) {
            var items = [];
            var i;
            for (i = 0; i < result.rows.length; i++) {
              items.push(JSON.parse(result.rows.item(i).raw_json));
            }
            resolve(items);
          }
        );
      }, reject);
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinDownloadSQLite = function (record) {
    return new Promise(function (resolve, reject) {
      this.db.transaction(function (tx) {
        tx.executeSql(
          'INSERT OR REPLACE INTO jellyfin_downloads (item_id, name, local_path, size, raw_json, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            record.itemId,
            record.name,
            record.localPath,
            record.size,
            JSON.stringify(record.raw),
            record.downloadedAt
          ]
        );
      }, reject, resolve);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownloadSQLite = function (itemId) {
    return new Promise(function (resolve, reject) {
      this.db.readTransaction(function (tx) {
        tx.executeSql(
          'SELECT item_id, name, local_path, size, raw_json, downloaded_at FROM jellyfin_downloads WHERE item_id = ?',
          [itemId],
          function (tx, result) {
            if (!result.rows.length) {
              resolve(null);
              return;
            }

            resolve(normalizeDownloadRow(result.rows.item(0)));
          }
        );
      }, reject);
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownloadsSQLite = function () {
    return new Promise(function (resolve, reject) {
      this.db.readTransaction(function (tx) {
        tx.executeSql(
          'SELECT item_id, name, local_path, size, raw_json, downloaded_at FROM jellyfin_downloads ORDER BY downloaded_at DESC',
          [],
          function (tx, result) {
            var downloads = [];
            var i;
            for (i = 0; i < result.rows.length; i++) {
              downloads.push(normalizeDownloadRow(result.rows.item(i)));
            }
            resolve(downloads);
          }
        );
      }, reject);
    }.bind(this));
  };

  SettingsStore.prototype.saveReadingProgressSQLite = function (record) {
    return new Promise(function (resolve, reject) {
      this.db.transaction(function (tx) {
        tx.executeSql(
          'INSERT OR REPLACE INTO reading_progress (progress_key, book_name, cfi, percentage, page_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            record.key,
            record.bookName,
            record.cfi,
            record.percentage,
            record.pageIndex,
            record.updatedAt
          ]
        );
      }, reject, resolve);
    }.bind(this));
  };

  SettingsStore.prototype.getReadingProgressSQLite = function (key) {
    return new Promise(function (resolve, reject) {
      this.db.readTransaction(function (tx) {
        tx.executeSql(
          'SELECT progress_key, book_name, cfi, percentage, page_index, updated_at FROM reading_progress WHERE progress_key = ?',
          [key],
          function (tx, result) {
            if (!result.rows.length) {
              resolve(null);
              return;
            }

            resolve(normalizeProgressRow(result.rows.item(0)));
          }
        );
      }, reject);
    }.bind(this));
  };

  SettingsStore.prototype.getAllIndexedDB = function () {
    return new Promise(function (resolve, reject) {
      var settings = {};
      var transaction = this.db.transaction(['settings'], 'readonly');
      var store = transaction.objectStore('settings');
      var request = store.openCursor();

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (!cursor) {
          resolve(settings);
          return;
        }

        writePath(settings, cursor.value.key, JSON.parse(cursor.value.value));
        cursor.continue();
      };
    }.bind(this));
  };

  SettingsStore.prototype.setValueIndexedDB = function (key, payload, updatedAt) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['settings'], 'readwrite');
      var store = transaction.objectStore('settings');
      var request = store.put({
        key: key,
        value: payload,
        updatedAt: updatedAt
      });

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve();
      };
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinCatalogItemsIndexedDB = function (parentId, records) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['jellyfin_catalog'], 'readwrite');
      var store = transaction.objectStore('jellyfin_catalog');
      var index = store.index('parentId');
      var cursorRequest = index.openCursor(IDBKeyRange.only(parentId));

      cursorRequest.onerror = function () {
        reject(cursorRequest.error);
      };

      cursorRequest.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          records.forEach(function (record) {
            store.put(record);
          });
        }
      };

      transaction.oncomplete = function () {
        resolve();
      };

      transaction.onerror = function () {
        reject(transaction.error);
      };
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinCatalogItemsIndexedDB = function (parentId) {
    return new Promise(function (resolve, reject) {
      var items = [];
      var transaction = this.db.transaction(['jellyfin_catalog'], 'readonly');
      var store = transaction.objectStore('jellyfin_catalog');
      var request = store.index('parentId').openCursor(IDBKeyRange.only(parentId));

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (!cursor) {
          items.sort(function (a, b) {
            var folderSort = Number(Boolean(b.IsFolder)) - Number(Boolean(a.IsFolder));
            return folderSort || String(a.Name || '').localeCompare(String(b.Name || ''));
          });
          resolve(items);
          return;
        }

        items.push(cursor.value.raw);
        cursor.continue();
      };
    }.bind(this));
  };

  SettingsStore.prototype.saveJellyfinDownloadIndexedDB = function (record) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['jellyfin_downloads'], 'readwrite');
      var store = transaction.objectStore('jellyfin_downloads');
      var request = store.put(record);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve();
      };
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownloadIndexedDB = function (itemId) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['jellyfin_downloads'], 'readonly');
      var store = transaction.objectStore('jellyfin_downloads');
      var request = store.get(itemId);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve(request.result || null);
      };
    }.bind(this));
  };

  SettingsStore.prototype.getJellyfinDownloadsIndexedDB = function () {
    return new Promise(function (resolve, reject) {
      var downloads = [];
      var transaction = this.db.transaction(['jellyfin_downloads'], 'readonly');
      var store = transaction.objectStore('jellyfin_downloads');
      var request = store.openCursor();

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (!cursor) {
          downloads.sort(function (a, b) {
            return Number(b.downloadedAt || 0) - Number(a.downloadedAt || 0);
          });
          resolve(downloads);
          return;
        }

        downloads.push(cursor.value);
        cursor.continue();
      };
    }.bind(this));
  };

  SettingsStore.prototype.saveReadingProgressIndexedDB = function (record) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['reading_progress'], 'readwrite');
      var store = transaction.objectStore('reading_progress');
      var request = store.put(record);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve();
      };
    }.bind(this));
  };

  SettingsStore.prototype.getReadingProgressIndexedDB = function (key) {
    return new Promise(function (resolve, reject) {
      var transaction = this.db.transaction(['reading_progress'], 'readonly');
      var store = transaction.objectStore('reading_progress');
      var request = store.get(key);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve(request.result || null);
      };
    }.bind(this));
  };

  SettingsStore.prototype.defaultSettings = function () {
    return clone(DEFAULT_SETTINGS);
  };

  SettingsStore.prototype.readPath = readPath;

  window.ReaderSettingsStore = SettingsStore;

  function normalizeDownloadRow(row) {
    return {
      itemId: row.item_id,
      name: row.name,
      localPath: row.local_path,
      size: row.size,
      raw: JSON.parse(row.raw_json),
      downloadedAt: row.downloaded_at
    };
  }

  function normalizeProgressRow(row) {
    return {
      key: row.progress_key,
      bookName: row.book_name,
      cfi: row.cfi,
      percentage: row.percentage,
      pageIndex: row.page_index,
      updatedAt: row.updated_at
    };
  }
})(window);
