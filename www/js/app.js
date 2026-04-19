(function (window, document, $) {
  'use strict';

  var APP_BUILD_MARKER = 'cordova-jellyfin-progress-sync-2026-04-17';

  var app = {
    book: null,
    rendition: null,
    currentBook: null,
    localBooks: [],
    localBooksDirectory: '',
    localBookKeys: {},
    progressSaveTimer: null,
    jellyfinProgressTimer: null,
    lastReadingLocation: null,
    lastJellyfinPushPercentage: null,
    fontSize: 100,
    readerReady: false,
    pendingCommand: null,
    readerControl: new window.ReaderControl(),
    settingsStore: new window.ReaderSettingsStore(),
    jellyfinClient: null,
    settings: null,
    nativeControls: null,
    exiting: false,
    exitPromptOpen: false,
    boundBackButtonHandler: null,

    initialize: function () {
      this.jellyfinClient = new window.JellyfinClient(this.settingsStore);
      this.boundBackButtonHandler = this.onBackButton.bind(this);
      document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
      document.addEventListener('init', this.onPageInit.bind(this), false);
      document.addEventListener('pause', this.onAppPause.bind(this), false);
      document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this), false);
      window.addEventListener('beforeunload', this.flushProgress.bind(this, 'beforeunload'));

      if (!window.cordova) {
        $(this.onDeviceReady.bind(this));
      }
    },

    onAppPause: function () {
      this.flushProgress('pause');
    },

    onVisibilityChange: function () {
      if (document.hidden) {
        this.flushProgress('hidden');
      }
    },

    onDeviceReady: function () {
      console.log('[App] device ready', APP_BUILD_MARKER);
      try {
        this.setupBackButtonHandling();
      } catch (error) {
        console.log('[App] back button setup error', error);
      }

      this.settingsStore.open().then(function () {
        return this.settingsStore.getAll();
      }.bind(this)).then(function (settings) {
        this.settings = settings;
        this.readerControl.setSettings(settings);
      }.bind(this)).catch(function (error) {
        console.log('[App] settings store error', error);
      });

      try {
        this.readerControl.attachExternalTransport(new window.ExternalTransports.UsbSerialTransport());
      } catch (error) {
        console.log('[App] external transport error', error);
      }

      try {
        this.nativeControls = new window.ReaderNativeControls(this.readerControl);
        this.nativeControls.initialize();
      } catch (error) {
        console.log('[App] native controls error', error);
      }
    },

    setupBackButtonHandling: function () {
      var bindHandler = function () {
        try {
          if (window.ons && window.ons.enableDeviceBackButtonHandler && window.ons.setDefaultDeviceBackButtonListener) {
            window.ons.enableDeviceBackButtonHandler();
            window.ons.setDefaultDeviceBackButtonListener(this.boundBackButtonHandler);
            return;
          }
        } catch (error) {
          console.log('[App] Onsen back handler setup error', error);
        }

        document.removeEventListener('backbutton', this.boundBackButtonHandler, false);
        document.addEventListener('backbutton', this.boundBackButtonHandler, false);
      }.bind(this);

      if (window.ons && window.ons.ready) {
        window.ons.ready(bindHandler);
        return;
      }

      bindHandler();
    },

    onBackButton: function (event) {
      if (event && event.preventDefault) {
        event.preventDefault();
      }

      var navigator = document.querySelector('#navigator');
      var topPage = navigator && navigator.topPage ? navigator.topPage : null;
      var pageId = topPage && topPage.id ? topPage.id : '';

      if (pageId === 'home-page') {
        this.confirmExit();
        return;
      }

      if (pageId === 'reader-page') {
        this.destroyCurrentBook();
      }

      if (navigator && navigator.pages && navigator.pages.length > 1) {
        navigator.popPage();
        return;
      }

      this.confirmExit();
    },

    confirmExit: function () {
      if (this.exiting || this.exitPromptOpen) {
        return;
      }

      this.exitPromptOpen = true;
      var ask = window.ons && window.ons.notification && window.ons.notification.confirm
        ? window.ons.notification.confirm('Vuoi uscire da LB-EReader?', {
          title: 'Esci',
          buttonLabels: ['No', 'Si']
        })
        : Promise.resolve(window.confirm('Vuoi uscire da LB-EReader?') ? 1 : 0);

      ask.then(function (index) {
        this.exitPromptOpen = false;
        if (index !== 1) {
          return;
        }

        this.exitApplication();
      }.bind(this)).catch(function () {
        this.exitPromptOpen = false;
      }.bind(this));
    },

    exitApplication: function () {
      if (this.exiting) {
        return;
      }

      this.exiting = true;
      this.flushProgress('exit').catch(function (error) {
        console.log('[App] exit flush error', error);
      }).then(function () {
        if (this.nativeControls && this.nativeControls.destroyMusicControls) {
          this.nativeControls.destroyMusicControls();
        }

        if (window.navigator && window.navigator.app && window.navigator.app.exitApp) {
          window.navigator.app.exitApp();
          return;
        }

        this.exiting = false;
      }.bind(this));
    },

    onPageInit: function (event) {
      if (event.target.id === 'home-page') {
        this.renderBookList();
      }

      if (event.target.id === 'reader-page') {
        this.openReader(event.target.data.book);
      }

      if (event.target.id === 'settings-page') {
        this.renderSettingsPage();
      }

      if (event.target.id === 'jellyfin-catalog-page') {
        this.renderJellyfinCatalogPage(event.target, event.target.data || {});
      }
    },

    renderBookList: function () {
      var $bookList = $('#book-list');
      $bookList.empty();

      this.listLocalBooks().then(function (books) {
        if (!books.length) {
          $bookList.append([
            '<ons-list-item>',
            '<div class="center">',
            '<span class="list-item__title">No local EPUB books</span>',
            '<span class="list-item__subtitle">Put files in ' + this.escapeHtml(this.localBooksDirectory || 'the app Books folder') + '</span>',
            '</div>',
            '</ons-list-item>'
          ].join(''));
          return;
        }

        books.forEach(function (book, index) {
          var item = [
            '<ons-list-item tappable modifier="chevron" data-index="' + index + '">',
            '<div class="center">',
            '<span class="list-item__title">' + this.escapeHtml(book.name || 'Untitled') + '</span>',
            '<span class="list-item__subtitle">' + this.escapeHtml(this.formatBytes(book.size)) + '</span>',
            '</div>',
            '<div class="right">',
            '<ons-button modifier="quiet" class="delete-local-book" data-delete-index="' + index + '">Delete</ons-button>',
            '</div>',
            '</ons-list-item>'
          ].join('');

          $bookList.append(item);
        }.bind(this));
      }.bind(this)).catch(function (error) {
        console.log('[Home] local books error', error);
        $bookList.append([
          '<ons-list-item>',
          '<div class="center">',
          '<span class="list-item__title">Unable to read local library</span>',
          '<span class="list-item__subtitle">' + this.escapeHtml(error.message || String(error)) + '</span>',
          '</div>',
          '</ons-list-item>'
        ].join(''));
      });
    },

    openReaderPage: function (book) {
      document.querySelector('#navigator').pushPage('reader.html', {
        data: {
          book: book
        }
      });
    },

    openSettingsPage: function () {
      document.querySelector('#navigator').pushPage('settings.html');
    },

    openJellyfinCatalogPage: function (parentId, title) {
      document.querySelector('#navigator').pushPage('jellyfin-catalog.html', {
        data: {
          parentId: parentId || '',
          title: title || 'Jellyfin'
        }
      });
    },

    openJellyfinHome: function () {
      this.settingsStore.getAll().then(function (settings) {
        if (!settings.jellyfin.serverUrl || !settings.jellyfin.username) {
          this.openSettingsPage();
          return;
        }

        this.openJellyfinCatalogPage('', 'Jellyfin');
      }.bind(this));
    },

    renderSettingsPage: function () {
      this.settingsStore.getAll().then(function (settings) {
        this.settings = settings;
        this.readerControl.setSettings(settings);

        $('#jellyfin-enabled')[0].checked = settings.jellyfin.enabled;
        $('#jellyfin-server-url').val(settings.jellyfin.serverUrl);
        $('#jellyfin-username').val(settings.jellyfin.username);
        $('#jellyfin-password').val(settings.jellyfin.password);
        $('#local-progress-enabled')[0].checked = settings.sync.localProgressEnabled;
        $('#jellyfin-progress-enabled')[0].checked = settings.sync.jellyfinProgressEnabled;
        $('#eink-enabled')[0].checked = settings.eink.enabled;
        $('#eink-auto-send')[0].checked = settings.eink.autoSend;

        $('#jellyfin-status').text(settings.jellyfin.enabled ? 'Not connected' : 'Disabled');
        $('#sync-status').text(settings.sync.lastSyncAt || 'Never');
        $('#eink-status').text(settings.eink.enabled ? 'Ready to configure' : 'Disabled');
        this.renderBooksDirectoryStatus();
      }.bind(this)).catch(function (error) {
        console.log('[Settings] render error', error);
      });
    },

    renderBooksDirectoryStatus: function () {
      if (!window.NativeHttp || !window.NativeHttp.getBooksDirectory) {
        $('#books-directory-status').text('Folder selection is not available');
        $('#reset-books-directory')[0].disabled = true;
        return Promise.resolve();
      }

      return window.NativeHttp.getBooksDirectory().then(function (result) {
        this.localBooksDirectory = result.directory || '';
        $('#books-directory-status').text(result.directory || 'Default app folder');
        $('#reset-books-directory')[0].disabled = !result.custom;
      }.bind(this)).catch(function (error) {
        console.log('[Settings] books directory error', error);
        $('#books-directory-status').text(error.message || 'Unable to read books folder');
      });
    },

    recordJellyfinSync: function (location, reason) {
      var percentage = Math.max(0, Math.min(100, Number(location && location.percentage ? location.percentage : 0) * 100));
      var stamp = new Date().toLocaleString() + ' - Jellyfin ' + Math.round(percentage) + '% (' + (reason || 'sync') + ')';

      if (this.settings && this.settings.sync) {
        this.settings.sync.lastSyncAt = stamp;
      }

      $('#sync-status').text(stamp);
      return this.settingsStore.setValue('sync.lastSyncAt', stamp);
    },

    chooseBooksDirectory: function () {
      if (!window.NativeHttp || !window.NativeHttp.chooseBooksDirectory) {
        $('#books-directory-status').text('Folder selection is not available');
        return Promise.resolve();
      }

      $('#books-directory-status').text('Choosing folder');
      return window.NativeHttp.chooseBooksDirectory().then(function (result) {
        this.localBooksDirectory = result.directory || '';
        $('#books-directory-status').text(result.directory || 'Selected folder');
        return this.listLocalBooks();
      }.bind(this)).then(function () {
        this.renderBookList();
      }.bind(this)).catch(function (error) {
        console.log('[Settings] choose books directory error', error);
        $('#books-directory-status').text(error.message || 'Folder not selected');
      });
    },

    resetBooksDirectory: function () {
      if (!window.NativeHttp || !window.NativeHttp.resetBooksDirectory) {
        $('#books-directory-status').text('Folder reset is not available');
        return Promise.resolve();
      }

      $('#books-directory-status').text('Using default folder');
      return window.NativeHttp.resetBooksDirectory().then(function (result) {
        this.localBooksDirectory = result.directory || '';
        $('#books-directory-status').text(result.directory || 'Default app folder');
        $('#reset-books-directory')[0].disabled = true;
        return this.listLocalBooks();
      }.bind(this)).then(function () {
        this.renderBookList();
      }.bind(this)).catch(function (error) {
        console.log('[Settings] reset books directory error', error);
        $('#books-directory-status').text(error.message || 'Unable to reset books folder');
      });
    },

    deleteLocalBook: function (book) {
      if (!book || !(book.path || book.localPath)) {
        return Promise.resolve();
      }

      if (!window.NativeHttp || !window.NativeHttp.deleteBook) {
        if (window.ons && window.ons.notification) {
          window.ons.notification.toast('Book deletion is not available.', { timeout: 2200 });
        }
        return Promise.resolve();
      }

      var bookName = book.name || book.fileName || 'Untitled';
      var ask = window.ons && window.ons.notification && window.ons.notification.confirm
        ? window.ons.notification.confirm('Delete "' + bookName + '" from this device?', {
          title: 'Delete book',
          buttonLabels: ['Cancel', 'Delete']
        })
        : Promise.resolve(window.confirm('Delete "' + bookName + '" from this device?') ? 1 : 0);

      return ask.then(function (index) {
        if (index !== 1) {
          return null;
        }

        return window.NativeHttp.deleteBook({
          path: book.path || book.localPath
        }).then(function () {
          if (window.ons && window.ons.notification) {
            window.ons.notification.toast('Book deleted.', { timeout: 1600 });
          }

          return this.listLocalBooks();
        }.bind(this)).then(function () {
          this.renderBookList();
          this.refreshVisibleJellyfinCatalogLocalState();
        }.bind(this));
      }.bind(this)).catch(function (error) {
        console.log('[Library] delete local book error', error);
        if (window.ons && window.ons.notification) {
          window.ons.notification.toast(error.message || 'Unable to delete book.', { timeout: 2400 });
        }
      });
    },

    saveSetting: function (path, value) {
      return this.settingsStore.setValue(path, value).then(function () {
        return this.settingsStore.getAll();
      }.bind(this)).then(function (settings) {
        this.settings = settings;
        this.readerControl.setSettings(settings);
        console.log('[Settings] saved', path, value);
      }.bind(this)).catch(function (error) {
        console.log('[Settings] save error', path, error);
      });
    },

    persistJellyfinForm: function () {
      return Promise.all([
        this.settingsStore.setValue('jellyfin.enabled', $('#jellyfin-enabled')[0].checked),
        this.settingsStore.setValue('jellyfin.serverUrl', $('#jellyfin-server-url').val().trim()),
        this.settingsStore.setValue('jellyfin.username', $('#jellyfin-username').val().trim()),
        this.settingsStore.setValue('jellyfin.password', $('#jellyfin-password').val())
      ]).then(function () {
        return this.settingsStore.getAll();
      }.bind(this)).then(function (settings) {
        this.settings = settings;
        this.readerControl.setSettings(settings);
        return settings;
      }.bind(this));
    },

    signInJellyfin: function () {
      $('#jellyfin-status').text('Signing in');
      return this.persistJellyfinForm().then(function () {
        return this.jellyfinClient.authenticate();
      }.bind(this)).then(function (result) {
        var username = result.User && result.User.Name ? result.User.Name : $('#jellyfin-username').val();
        $('#jellyfin-status').text('Connected as ' + username);
        return this.settingsStore.getAll();
      }.bind(this)).then(function (settings) {
        this.settings = settings;
        this.readerControl.setSettings(settings);
        return settings;
      }.bind(this)).catch(function (error) {
        console.log('[Jellyfin] sign in error', error);
        $('#jellyfin-status').text(this.formatJellyfinError(error, 'Sign in failed'));
        throw error;
      }.bind(this));
    },

    formatJellyfinError: function (error, fallback) {
      var message = error && error.message ? error.message : fallback;
      var serverUrl = $('#jellyfin-server-url').val();

      if (/failed to fetch/i.test(message) && this.jellyfinClient.isHttpServerUrl(serverUrl)) {
        return 'HTTP server blocked or unreachable. Rebuild the app and check Jellyfin URL.';
      }

      return message;
    },

    renderJellyfinCatalogPage: function (page, data) {
      var $page = $(page);
      var parentId = data.parentId || '';
      var title = data.title || 'Jellyfin';

      $page.find('#jellyfin-catalog-title').text(title);
      $page.find('#jellyfin-catalog-status').text('Loading catalog.');
      $page.find('#jellyfin-catalog-list').empty();
      $page.data('parent-id', parentId);
      $page.data('title', title);

      this.loadJellyfinCatalog(parentId).then(function (items) {
        this.renderJellyfinCatalogItems(page, items);
      }.bind(this)).catch(function (error) {
        console.log('[Jellyfin] catalog error', error);
        $page.find('#jellyfin-catalog-status').text(this.formatJellyfinError(error, 'Unable to load Jellyfin catalog.'));

        this.settingsStore.getJellyfinCatalogItems(parentId).then(function (cachedItems) {
          if (cachedItems.length) {
            $page.find('#jellyfin-catalog-status').text('Offline cache');
            this.renderJellyfinCatalogItems(page, cachedItems);
          }
        }.bind(this));
      }.bind(this));
    },

    loadJellyfinCatalog: function (parentId) {
      var options = parentId ? {
        recursive: true,
        includeItemTypes: 'Book'
      } : {
        includeItemTypes: 'CollectionFolder,Folder'
      };

      return this.jellyfinClient.getItems(parentId, options).then(function (items) {
        var filteredItems = this.filterJellyfinCatalogItems(items, parentId);

        return this.settingsStore.saveJellyfinCatalogItems(parentId, filteredItems).then(function () {
          return filteredItems;
        });
      }.bind(this));
    },

    filterJellyfinCatalogItems: function (items, parentId) {
      return items.filter(function (item) {
        var type = item.Type || '';
        var collectionType = item.CollectionType || '';

        if (!parentId) {
          return type === 'CollectionFolder' && collectionType === 'books';
        }

        return type === 'Book';
      });
    },

    listLocalBooks: function () {
      if (!window.NativeHttp || !window.NativeHttp.listBooks) {
        this.localBooks = [];
        this.localBooksDirectory = '';
        this.localBookKeys = {};
        return Promise.resolve([]);
      }

      return window.NativeHttp.listBooks().then(function (result) {
        var books = (result.books || []).map(function (book) {
          var normalized = {
            name: book.name || book.fileName || 'Untitled',
            fileName: book.fileName || '',
            path: book.path,
            size: Number(book.size || 0),
            lastModified: Number(book.lastModified || 0)
          };

          normalized.localKey = this.normalizeBookName(normalized.name);
          return normalized;
        }.bind(this));

        books.sort(function (left, right) {
          return String(left.name || '').localeCompare(String(right.name || ''));
        });

        this.localBooks = books;
        this.localBooksDirectory = result.directory || '';
        this.localBookKeys = {};
        books.forEach(function (book) {
          this.localBookKeys[book.localKey] = this.localBookKeys[book.localKey] || [];
          this.localBookKeys[book.localKey].push(book);
        }.bind(this));

        return books;
      }.bind(this));
    },

    normalizeBookName: function (name) {
      return String(name || '')
        .replace(/\.epub$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    },

    getJellyfinItemSize: function (item) {
      if (!item) {
        return 0;
      }

      if (item.Size) {
        return Number(item.Size);
      }

      if (item.MediaSources && item.MediaSources.length && item.MediaSources[0].Size) {
        return Number(item.MediaSources[0].Size);
      }

      return 0;
    },

    findLocalBookForJellyfinItem: function (item) {
      var candidates = this.localBookKeys[this.normalizeBookName(item && item.Name ? item.Name : 'Untitled')] || [];
      var size = this.getJellyfinItemSize(item);

      if (!candidates.length) {
        return null;
      }

      if (!size || candidates.length === 1) {
        return candidates[0];
      }

      return candidates.slice().sort(function (left, right) {
        return Math.abs(Number(left.size || 0) - size) - Math.abs(Number(right.size || 0) - size);
      })[0];
    },

    formatBytes: function (bytes) {
      var size = Number(bytes || 0);
      if (!size) {
        return 'Unknown size';
      }

      if (size < 1024 * 1024) {
        return Math.round(size / 1024) + ' KB';
      }

      return (size / 1024 / 1024).toFixed(1) + ' MB';
    },

    renderJellyfinCatalogItems: function (page, items) {
      var $page = $(page);
      var $list = $page.find('#jellyfin-catalog-list');
      $list.empty();

      if (!items.length) {
        $page.find('#jellyfin-catalog-status').text('No items found.');
        return;
      }

      var renderRows = function () {
        var itemsById = {};
        var localCount = 0;
        $list.empty();

        items.forEach(function (item) {
          var isFolder = item.IsFolder || item.Type === 'Folder' || item.Type === 'CollectionFolder';
          var modifier = isFolder ? 'chevron' : '';
          var itemType = item.Type || (isFolder ? 'Folder' : 'Item');
          var localBook = !isFolder && item.Type === 'Book' ? this.findLocalBookForJellyfinItem(item) : null;
          var subtitle = itemType;

          if (localBook) {
            item.localBook = localBook;
            subtitle += ' - local';
            localCount += 1;
          } else if (!isFolder && item.Type === 'Book') {
            var size = this.getJellyfinItemSize(item);
            subtitle += size ? ' - ' + this.formatBytes(size) : '';
          }

          itemsById[item.Id] = item;

          var row = [
            '<ons-list-item tappable modifier="' + modifier + '" data-id="' + item.Id + '" data-name="' + this.escapeHtml(item.Name || 'Untitled') + '" data-folder="' + (isFolder ? '1' : '0') + '" data-type="' + this.escapeHtml(itemType) + '">',
            '<div class="center">',
            '<span class="list-item__title">' + (localBook ? '[local] ' : '') + this.escapeHtml(item.Name || 'Untitled') + '</span>',
            '<span class="list-item__subtitle catalog-type">' + this.escapeHtml(subtitle) + '</span>',
            '</div>',
            '</ons-list-item>'
          ].join('');

          $list.append(row);
        }.bind(this));

        $page.find('#jellyfin-catalog-status').text(
          items.length + ' item' + (items.length === 1 ? '' : 's') +
          (localCount ? ' - ' + localCount + ' local' : '')
        );
        $page.data('items-by-id', itemsById);
      }.bind(this);

      this.listLocalBooks().then(function () {
        renderRows();
      }.bind(this)).catch(function (error) {
        console.log('[Jellyfin] local match error', error);
        this.localBookKeys = {};
        renderRows();
      });
    },

    refreshCurrentJellyfinCatalogPage: function () {
      var page = document.querySelector('#navigator').topPage;
      var $page = $(page);
      this.renderJellyfinCatalogPage(page, {
        parentId: $page.data('parent-id') || '',
        title: $page.data('title') || 'Jellyfin'
      });
    },

    refreshVisibleJellyfinCatalogLocalState: function () {
      var navigator = document.querySelector('#navigator');
      var topPage = navigator && navigator.topPage ? navigator.topPage : null;
      if (!topPage || topPage.id !== 'jellyfin-catalog-page') {
        return;
      }

      var $page = $(topPage);
      var itemsById = $page.data('items-by-id') || {};
      var items = Object.keys(itemsById).map(function (id) {
        return itemsById[id];
      });

      this.renderJellyfinCatalogItems(topPage, items);
    },

    escapeHtml: function (value) {
      return String(value).replace(/[&<>"']/g, function (character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[character];
      });
    },

    openReader: function (book) {
      this.currentBook = book;
      $('#reader-title').text(book.label);
      $('#page-indicator').text('Loading');

      this.destroyCurrentBook();
      this.readerReady = false;
      this.pendingCommand = null;
      console.log('[App] opening book source', book.arrayBuffer ? 'array-buffer' : book.file, APP_BUILD_MARKER);
      this.createRendition(book.arrayBuffer || book.file, book);
    },

    createRendition: function (bookSource, book) {
      if (!window.JSZip) {
        console.log('[App] JSZip missing; epub.js cannot open .epub files');
        $('#page-indicator').text('JSZip missing');
        return;
      }

      var isBinaryBook = bookSource instanceof ArrayBuffer;
      var bookUrl = isBinaryBook ? null : new URL(bookSource, window.location.href).href;
      var openPromise;
      console.log('[App] epub.js open', isBinaryBook ? 'array-buffer' : bookUrl);
      $('#reader').empty();

      if (isBinaryBook) {
        this.book = window.ePub();
        openPromise = this.book.open(bookSource, 'binary');
      } else {
        this.book = window.ePub(bookUrl, {
          openAs: 'epub'
        });
        openPromise = this.book.opened;
      }

      openPromise.then(function () {
        console.log('[App] book opened');
      }).catch(function (error) {
        console.log('[App] book open error', error && (error.message || error.name || JSON.stringify(error)));
        $('#page-indicator').text('Unable to open book');
      });

      this.rendition = this.book.renderTo('reader', {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none'
      });

      this.readerControl.registerPageCallbacks({
        nextPage: this.nextPageFromControl.bind(this),
        previousPage: this.previousPageFromControl.bind(this),
        customAction: function () {
          console.log('[App] custom reader action placeholder');
        }
      });

      this.book.loaded.metadata.then(function (metadata) {
        $('#reader-title').text(metadata.title || book.label);
      }).catch(function (error) {
        console.log('[App] metadata load error', error);
      });

      this.rendition.on('relocated', this.onRelocated.bind(this));
      this.rendition.on('displayerror', function (error) {
        console.log('[App] rendition displayerror event', error);
        $('#page-indicator').text('Unable to render book');
      });

      this.getResumeProgress(book).then(function (progress) {
        if (progress && progress.cfi) {
          console.log('[Progress] resume', progress.source, progress.cfi, progress.percentage);
          $('#page-indicator').text('Resuming');
          return this.withTimeout(this.rendition.display(progress.cfi), 12000, 'rendition.display timeout');
        }

        return this.withTimeout(this.rendition.display(), 12000, 'rendition.display timeout');
      }.bind(this)).then(function () {
        console.log('[App] rendition displayed');
        this.readerReady = true;
        $('#page-indicator').text('Page ' + this.readerControl.state.pageIndex);

        if (this.pendingCommand === 'NEXT_PAGE') {
          this.pendingCommand = null;
          this.nextPage('queued');
        } else if (this.pendingCommand === 'PREVIOUS_PAGE') {
          this.pendingCommand = null;
          this.previousPage('queued');
        }
      }.bind(this)).catch(function (error) {
        console.log('[App] rendition display error', error);
        $('#page-indicator').text('Unable to open book');
      });
    },

    getBookProgressKey: function (book) {
      if (!book) {
        return '';
      }

      return book.progressKey || book.localKey || this.normalizeBookName(book.label || book.name || book.fileName || book.localPath || book.file || '');
    },

    getJellyfinItemId: function (book) {
      return book && (book.jellyfinItemId || book.itemId) ? (book.jellyfinItemId || book.itemId) : '';
    },

    getResumeProgress: function (book) {
      return this.getLocalReadingProgress(book).then(function (localProgress) {
        return this.getJellyfinReadingProgress(book).then(function (jellyfinProgress) {
          var localPercentage = Number(localProgress && localProgress.percentage ? localProgress.percentage : 0);
          var jellyfinPercentage = Number(jellyfinProgress && jellyfinProgress.percentage ? jellyfinProgress.percentage : 0);

          if (jellyfinProgress && jellyfinPercentage > localPercentage + 0.01) {
            return this.getCfiForPercentage(jellyfinPercentage).then(function (cfi) {
              if (!cfi) {
                return localProgress;
              }

              return {
                source: 'jellyfin',
                cfi: cfi,
                percentage: jellyfinPercentage,
                pageIndex: localProgress && localProgress.pageIndex ? localProgress.pageIndex : 1
              };
            });
          }

          if (localProgress) {
            localProgress.source = 'local';
          }

          return localProgress;
        }.bind(this));
      }.bind(this));
    },

    getCfiForPercentage: function (percentage) {
      var clampedPercentage = Math.max(0, Math.min(1, Number(percentage || 0)));
      if (!this.book || !this.book.locations || !this.book.locations.cfiFromPercentage) {
        return Promise.resolve(null);
      }

      var hasLocations = false;
      if (typeof this.book.locations.length === 'function') {
        hasLocations = this.book.locations.length() > 0;
      }

      var generate = hasLocations ? Promise.resolve() : this.book.locations.generate(1600);
      return generate.then(function () {
        return this.book.locations.cfiFromPercentage(clampedPercentage);
      }.bind(this)).catch(function (error) {
        console.log('[Progress] cfi from percentage error', error);
        return null;
      });
    },

    getLocalReadingProgress: function (book) {
      var settings = this.settings || {};
      var sync = settings.sync || {};
      var progressKey = this.getBookProgressKey(book);

      if (!sync.localProgressEnabled || !progressKey) {
        return Promise.resolve(null);
      }

      return this.settingsStore.getReadingProgress(progressKey).catch(function (error) {
        console.log('[Progress] read error', error);
        return null;
      });
    },

    getJellyfinReadingProgress: function (book) {
      var settings = this.settings || {};
      var sync = settings.sync || {};
      var itemId = this.getJellyfinItemId(book);

      if (!sync.jellyfinProgressEnabled || !itemId) {
        return Promise.resolve(null);
      }

      return this.jellyfinClient.getItemUserData(itemId).then(function (userData) {
        if (!userData || userData.PlayedPercentage === null || typeof userData.PlayedPercentage === 'undefined') {
          return null;
        }

        return {
          source: 'jellyfin',
          percentage: Number(userData.PlayedPercentage || 0) / 100,
          itemId: itemId
        };
      }).catch(function (error) {
        console.log('[Jellyfin] progress pull error', error);
        return null;
      });
    },

    scheduleLocalProgressSave: function (location) {
      var settings = this.settings || {};
      var sync = settings.sync || {};
      var progressKey = this.getBookProgressKey(this.currentBook);

      this.lastReadingLocation = location || null;

      if (!sync.localProgressEnabled || !progressKey || !location || !location.cfi) {
        return;
      }

      if (this.progressSaveTimer) {
        clearTimeout(this.progressSaveTimer);
      }

      this.progressSaveTimer = setTimeout(function () {
        this.progressSaveTimer = null;
        this.settingsStore.saveReadingProgress({
          key: progressKey,
          bookName: this.currentBook.label || this.currentBook.name || 'Untitled',
          cfi: location.cfi,
          percentage: location.percentage,
          pageIndex: location.pageIndex,
          updatedAt: Date.now()
        }).catch(function (error) {
          console.log('[Progress] save error', error);
        });
      }.bind(this), 500);
    },

    scheduleJellyfinProgressPush: function (location) {
      var settings = this.settings || {};
      var sync = settings.sync || {};
      var itemId = this.getJellyfinItemId(this.currentBook);

      if (!sync.jellyfinProgressEnabled || !itemId || !location || !location.cfi) {
        return;
      }

      if (this.jellyfinProgressTimer) {
        clearTimeout(this.jellyfinProgressTimer);
      }

      this.jellyfinProgressTimer = setTimeout(function () {
        this.jellyfinProgressTimer = null;
        this.pushJellyfinProgress(location, 'debounced');
      }.bind(this), 3500);
    },

    pushJellyfinProgress: function (location, reason) {
      var settings = this.settings || {};
      var sync = settings.sync || {};
      var itemId = this.getJellyfinItemId(this.currentBook);
      var percentage = Number(location && location.percentage ? location.percentage : 0);

      if (!sync.jellyfinProgressEnabled || !itemId || !location || !location.cfi) {
        return Promise.resolve();
      }

      if (reason === 'debounced' && this.lastJellyfinPushPercentage !== null && Math.abs(this.lastJellyfinPushPercentage - percentage) < 0.002) {
        return Promise.resolve();
      }

      this.lastJellyfinPushPercentage = percentage;
      console.log('[Jellyfin] progress push', reason, itemId, percentage);
      var push = reason === 'debounced'
        ? this.jellyfinClient.reportPlaybackProgress(itemId, location)
        : this.jellyfinClient.updateItemUserData(itemId, location);

      return push.then(function () {
        return this.recordJellyfinSync(location, reason);
      }.bind(this)).catch(function (error) {
        console.log('[Jellyfin] progress push error', error);
        $('#sync-status').text('Jellyfin sync failed: ' + (error.message || String(error)));
      });
    },

    flushProgress: function (reason) {
      var settings = this.settings || {};
      var sync = settings.sync || {};

      if (this.progressSaveTimer) {
        clearTimeout(this.progressSaveTimer);
        this.progressSaveTimer = null;
      }

      if (this.jellyfinProgressTimer) {
        clearTimeout(this.jellyfinProgressTimer);
        this.jellyfinProgressTimer = null;
      }

      if (!this.lastReadingLocation) {
        return Promise.resolve();
      }

      var location = this.lastReadingLocation;
      var localSave = sync.localProgressEnabled ? this.settingsStore.saveReadingProgress({
        key: this.getBookProgressKey(this.currentBook),
        bookName: this.currentBook && (this.currentBook.label || this.currentBook.name) ? (this.currentBook.label || this.currentBook.name) : 'Untitled',
        cfi: location.cfi,
        percentage: location.percentage,
        pageIndex: location.pageIndex,
        updatedAt: Date.now()
      }).catch(function (error) {
        console.log('[Progress] flush save error', error);
      }) : Promise.resolve();

      return Promise.all([
        localSave,
        this.pushJellyfinProgress(location, reason || 'flush')
      ]);
    },

    withTimeout: function (promise, timeoutMs, message) {
      return new Promise(function (resolve, reject) {
        var timeoutId = setTimeout(function () {
          reject(new Error(message));
        }, timeoutMs);

        promise.then(function (value) {
          clearTimeout(timeoutId);
          resolve(value);
        }).catch(function (error) {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    },

    destroyCurrentBook: function () {
      this.flushProgress('close');

      if (this.rendition && this.rendition.destroy) {
        this.rendition.destroy();
      }

      if (this.book && this.book.destroy) {
        this.book.destroy();
      }

      this.book = null;
      this.rendition = null;
      this.readerReady = false;
      this.pendingCommand = null;
      this.lastReadingLocation = null;
      this.lastJellyfinPushPercentage = null;
      if (this.progressSaveTimer) {
        clearTimeout(this.progressSaveTimer);
        this.progressSaveTimer = null;
      }
      if (this.jellyfinProgressTimer) {
        clearTimeout(this.jellyfinProgressTimer);
        this.jellyfinProgressTimer = null;
      }
    },

    onRelocated: function (location) {
      var pageIndex = 1;
      var locator = '';
      var percentage = 0;

      if (location && location.start) {
        pageIndex = location.start.index + 1;
        locator = location.start.cfi || '';
        percentage = Number(location.start.percentage || 0);
        if (!percentage && locator && this.book && this.book.locations && this.book.locations.percentageFromCfi) {
          try {
            percentage = Number(this.book.locations.percentageFromCfi(locator) || 0);
          } catch (error) {
            percentage = 0;
          }
        }
      }

      $('#page-indicator').text(percentage ? Math.round(percentage * 100) + '%' : 'Page ' + pageIndex);
      this.readerControl.setCurrentLocation(pageIndex, locator);
      this.scheduleLocalProgressSave({
        cfi: locator,
        percentage: percentage,
        pageIndex: pageIndex
      });
      this.scheduleJellyfinProgressPush({
        cfi: locator,
        percentage: percentage,
        pageIndex: pageIndex
      });
    },

    nextPage: function (source) {
      this.readerControl.nextPage(source || 'ui');
    },

    previousPage: function (source) {
      this.readerControl.previousPage(source || 'ui');
    },

    nextPageFromControl: function () {
      console.log('[App] next page command');
      if (!this.readerReady) {
        console.log('[App] reader not ready; queue next page');
        this.pendingCommand = 'NEXT_PAGE';
        return;
      }

      if (this.rendition) {
        this.rendition.next().catch(function (error) {
          console.log('[App] next page error', error);
        });
      }
    },

    previousPageFromControl: function () {
      console.log('[App] previous page command');
      if (!this.readerReady) {
        console.log('[App] reader not ready; queue previous page');
        this.pendingCommand = 'PREVIOUS_PAGE';
        return;
      }

      if (this.rendition) {
        this.rendition.prev().catch(function (error) {
          console.log('[App] previous page error', error);
        });
      }
    },

    setFontSize: function (direction) {
      if (!this.rendition) {
        return;
      }

      this.fontSize += direction === 'larger' ? 10 : -10;
      this.fontSize = Math.max(70, Math.min(this.fontSize, 180));
      this.rendition.themes.fontSize(this.fontSize + '%');
      console.log('[App] font size', this.fontSize);
    },

    simulateExternalInput: function (command) {
      this.readerControl.simulateExternalInput(command);
    },

    openLocalBook: function (book) {
      return this.jellyfinClient.readDownloadedBook(book.path || book.localPath).then(function (arrayBuffer) {
        this.openReaderPage({
          label: book.name || 'Untitled',
          arrayBuffer: arrayBuffer,
          jellyfinItemId: book.itemId || '',
          localPath: book.path || book.localPath,
          size: book.size || 0,
          localKey: book.localKey || this.normalizeBookName(book.name || book.fileName || 'Untitled'),
          progressKey: book.localKey || this.normalizeBookName(book.name || book.fileName || 'Untitled')
        });
      }.bind(this)).catch(function (error) {
        console.log('[Library] open local book error', error);
        if (window.ons && window.ons.notification) {
          window.ons.notification.toast(error.message || 'Unable to open local book.', { timeout: 2200 });
        }
      });
    },

    downloadAndOpenJellyfinItem: function (item, page) {
      var $page = $(page);
      $page.find('#jellyfin-catalog-status').text('Checking local library.');

      return this.listLocalBooks().then(function () {
        var localBook = this.findLocalBookForJellyfinItem(item) || item.localBook;
        if (localBook) {
          $page.find('#jellyfin-catalog-status').text('Opening local book.');
          return Object.assign({}, localBook, {
            itemId: item.Id,
            jellyfinItemId: item.Id
          });
        }

        $page.find('#jellyfin-catalog-status').text('Downloading ' + (item.Name || 'book') + '.');
        return this.jellyfinClient.downloadBook(item).then(function (result) {
          return this.settingsStore.saveJellyfinDownload(item, result).then(function () {
            return this.listLocalBooks().then(function () {
              return {
                name: item.Name || result.fileName || 'Untitled',
                path: result.path,
                size: result.size || 0,
                itemId: item.Id
              };
            }.bind(this));
          }.bind(this));
        }.bind(this));
      }.bind(this)).then(function (download) {
        $page.find('#jellyfin-catalog-status').text('Opening ' + (download.name || 'book') + '.');
        this.renderBookList();
        return this.openLocalBook(download);
      }.bind(this)).catch(function (error) {
        console.log('[Jellyfin] download/open error', error);
        $page.find('#jellyfin-catalog-status').text(error.message || 'Unable to download book.');
      });
    }
  };

  $(document).on('click', '#book-list ons-list-item', function () {
    var index = Number($(this).attr('data-index'));
    if (!app.localBooks[index]) {
      return;
    }

    app.openLocalBook(app.localBooks[index]);
  });

  $(document).on('click', '.delete-local-book', function (event) {
    event.preventDefault();
    event.stopPropagation();

    var index = Number($(this).attr('data-delete-index'));
    if (!app.localBooks[index]) {
      return;
    }

    app.deleteLocalBook(app.localBooks[index]);
  });

  $(document).on('click', '#app-jellyfin-button', function () {
    app.openJellyfinHome();
  });

  $(document).on('click', '#app-settings-button', function () {
    app.openSettingsPage();
  });

  $(document).on('click', '#choose-books-directory', function () {
    app.chooseBooksDirectory();
  });

  $(document).on('click', '#reset-books-directory', function () {
    app.resetBooksDirectory();
  });

  $(document).on('change', '#jellyfin-enabled', function () {
    app.saveSetting('jellyfin.enabled', this.checked);
    $('#jellyfin-status').text(this.checked ? 'Not connected' : 'Disabled');
  });

  $(document).on('change blur', '#jellyfin-server-url', function () {
    app.saveSetting('jellyfin.serverUrl', this.value.trim());
  });

  $(document).on('change blur', '#jellyfin-username', function () {
    app.saveSetting('jellyfin.username', this.value.trim());
  });

  $(document).on('change blur', '#jellyfin-password', function () {
    app.saveSetting('jellyfin.password', this.value);
  });

  $(document).on('change', '#local-progress-enabled', function () {
    app.saveSetting('sync.localProgressEnabled', this.checked);
  });

  $(document).on('change', '#jellyfin-progress-enabled', function () {
    app.saveSetting('sync.jellyfinProgressEnabled', this.checked);
  });

  $(document).on('change', '#eink-enabled', function () {
    app.saveSetting('eink.enabled', this.checked);
    $('#eink-status').text(this.checked ? 'Ready to configure' : 'Disabled');
  });

  $(document).on('change', '#eink-auto-send', function () {
    app.saveSetting('eink.autoSend', this.checked);
  });

  $(document).on('click', '#jellyfin-sign-in', function () {
    console.log('[Settings] Jellyfin sign in');
    app.signInJellyfin();
  });

  $(document).on('click', '#jellyfin-sync-catalog', function () {
    console.log('[Settings] Jellyfin catalog browse');
    $('#sync-status').text('Loading catalog');
    app.persistJellyfinForm().then(function () {
      app.openJellyfinCatalogPage('', 'Jellyfin');
    }).catch(function (error) {
      console.log('[Jellyfin] catalog open error', error);
      $('#sync-status').text(error.message || 'Catalog unavailable');
    }.bind(this));
  });

  $(document).on('click', '#jellyfin-catalog-refresh', function () {
    app.refreshCurrentJellyfinCatalogPage();
  });

  $(document).on('click', '#jellyfin-catalog-list ons-list-item', function () {
    var $item = $(this);
    var page = $item.closest('ons-page')[0];
    var itemsById = $(page).data('items-by-id') || {};
    var item = itemsById[$item.attr('data-id')];
    var isFolder = $item.attr('data-folder') === '1';

    if (isFolder) {
      app.openJellyfinCatalogPage($item.attr('data-id'), $item.attr('data-name'));
      return;
    }

    if (!item || item.Type !== 'Book') {
      if (window.ons && window.ons.notification) {
        window.ons.notification.toast('Only EPUB books can be opened here.', { timeout: 1800 });
      }
      return;
    }

    app.downloadAndOpenJellyfinItem(item, page);
  });

  $(document).on('click', '#eink-test-connection', function () {
    console.log('[Settings] e-ink connection test placeholder');
    $('#eink-status').text('Not connected');
  });

  $(document).on('click', '#eink-send-current-page', function () {
    console.log('[Settings] e-ink send current page placeholder');
    app.readerControl.sendCurrentPageToExternalDisplay(true);
  });

  $(document).on('click', '#prev-button, #tap-left', function () {
    app.previousPage('ui');
  });

  $(document).on('click', '#next-button, #tap-right', function () {
    app.nextPage('ui');
  });

  $(document).on('click', '#settings-button', function () {
    document.querySelector('#settings-dialog').show();
  });

  $(document).on('click', '#close-settings', function () {
    document.querySelector('#settings-dialog').hide();
  });

  $(document).on('click', '#font-smaller', function () {
    app.setFontSize('smaller');
  });

  $(document).on('click', '#font-larger', function () {
    app.setFontSize('larger');
  });

  $(document).on('click', '#simulate-rot-left', function () {
    app.simulateExternalInput('ROT_LEFT');
  });

  $(document).on('click', '#simulate-rot-right', function () {
    app.simulateExternalInput('ROT_RIGHT');
  });

  $(document).on('click', '#simulate-button', function () {
    app.simulateExternalInput('BTN_CLICK');
  });

  window.readerApp = app;
  app.initialize();
})(window, document, jQuery);
