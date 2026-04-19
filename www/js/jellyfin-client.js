(function (window) {
  'use strict';

  function JellyfinClient(settingsStore) {
    this.settingsStore = settingsStore;
    this.deviceId = this.getDeviceId();
  }

  JellyfinClient.prototype.getDeviceId = function () {
    var key = 'einkReaderDeviceId';
    var existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    var generated = 'eink-reader-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    window.localStorage.setItem(key, generated);
    return generated;
  };

  JellyfinClient.prototype.normalizeServerUrl = function (serverUrl) {
    return String(serverUrl || '').trim().replace(/\/+$/, '');
  };

  JellyfinClient.prototype.isHttpServerUrl = function (serverUrl) {
    return /^http:\/\//i.test(this.normalizeServerUrl(serverUrl));
  };

  JellyfinClient.prototype.httpRequest = function (url, options) {
    options = options || {};

    if (window.cordova && window.NativeHttp && window.NativeHttp.request) {
      return window.NativeHttp.request({
        url: url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || ''
      }).then(function (nativeResponse) {
        return {
          ok: nativeResponse.status >= 200 && nativeResponse.status < 300,
          status: nativeResponse.status,
          json: function () {
            return Promise.resolve(nativeResponse.body ? JSON.parse(nativeResponse.body) : null);
          }
        };
      });
    }

    return fetch(url, options);
  };

  JellyfinClient.prototype.sanitizeFileName = function (fileName) {
    return String(fileName || 'book.epub').replace(/[\\/:*?"<>|]/g, '_').trim();
  };

  JellyfinClient.prototype.base64ToArrayBuffer = function (base64) {
    var binary = window.atob(base64);
    var bytes = new Uint8Array(binary.length);
    var i;

    for (i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
  };

  JellyfinClient.prototype.getAuthHeader = function (settings, requireToken) {
    var jellyfin = settings.jellyfin || {};
    if (jellyfin.accessToken) {
      return 'MediaBrowser Token="' + jellyfin.accessToken + '"';
    }

    if (requireToken) {
      throw new Error('Jellyfin is not authenticated');
    }

    return [
      'MediaBrowser Client="LB-EReader"',
      'Device="Android"',
      'DeviceId="' + this.deviceId + '"',
      'Version="0.1.0"'
    ].join(', ');
  };

  JellyfinClient.prototype.authenticate = function () {
    return this.settingsStore.getAll().then(function (settings) {
      var jellyfin = settings.jellyfin || {};
      var serverUrl = this.normalizeServerUrl(jellyfin.serverUrl);

      if (!serverUrl) {
        throw new Error('Jellyfin server URL is missing');
      }

      if (!jellyfin.username || !jellyfin.password) {
        throw new Error('Jellyfin credentials are missing');
      }

      return this.httpRequest(serverUrl + '/Users/AuthenticateByName', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader(settings, false)
        },
        body: JSON.stringify({
          Username: jellyfin.username,
          Pw: jellyfin.password,
          PW: jellyfin.password
        })
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('Jellyfin sign in failed: HTTP ' + response.status);
        }
        return response.json();
      }).then(function (result) {
        var writes = [
          this.settingsStore.setValue('jellyfin.enabled', true),
          this.settingsStore.setValue('jellyfin.serverUrl', serverUrl),
          this.settingsStore.setValue('jellyfin.username', result.User && result.User.Name ? result.User.Name : jellyfin.username),
          this.settingsStore.setValue('jellyfin.userId', result.User && result.User.Id ? result.User.Id : ''),
          this.settingsStore.setValue('jellyfin.accessToken', result.AccessToken || '')
        ];

        return Promise.all(writes).then(function () {
          return result;
        });
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.ensureAuthenticated = function () {
    return this.settingsStore.getAll().then(function (settings) {
      if (settings.jellyfin && settings.jellyfin.accessToken) {
        return settings;
      }

      return this.authenticate().then(function () {
        return this.settingsStore.getAll();
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.request = function (path, options) {
    options = options || {};

    return this.ensureAuthenticated().then(function (settings) {
      var serverUrl = this.normalizeServerUrl(settings.jellyfin.serverUrl);
      var responseStatus = 0;

      if (!serverUrl) {
        throw new Error('Jellyfin server URL is missing');
      }

      return this.httpRequest(serverUrl + path, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader(settings, true)
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      }).then(function (response) {
        responseStatus = response.status;
        if (response.status === 401) {
          return Promise.all([
            this.settingsStore.setValue('jellyfin.accessToken', ''),
            this.settingsStore.setValue('jellyfin.userId', '')
          ]).then(function () {
            throw new Error('Jellyfin authorization expired');
          });
        }

        if (!response.ok) {
          throw new Error('Jellyfin request failed: HTTP ' + response.status);
        }

        if (responseStatus === 204) {
          return null;
        }

        return response.json();
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.getItems = function (parentId, options) {
    options = options || {};

    var query = [
      'SortBy=SortName',
      'SortOrder=Ascending',
      'Fields=Path,Overview,PrimaryImageAspectRatio,UserData,MediaSources',
      'EnableTotalRecordCount=true'
    ];

    if (parentId) {
      query.push('parentId=' + encodeURIComponent(parentId));
    }

    if (options.recursive) {
      query.push('Recursive=true');
    }

    if (options.includeItemTypes) {
      query.push('IncludeItemTypes=' + encodeURIComponent(options.includeItemTypes));
    }

    return this.request('/Items?' + query.join('&')).then(function (result) {
      return result && result.Items ? result.Items : [];
    });
  };

  JellyfinClient.prototype.getItemUserData = function (itemId) {
    return this.ensureAuthenticated().then(function (settings) {
      var userId = settings.jellyfin && settings.jellyfin.userId ? settings.jellyfin.userId : '';
      var path = '/UserItems/' + encodeURIComponent(itemId) + '/UserData';

      if (userId) {
        path += '?userId=' + encodeURIComponent(userId);
      }

      return this.request(path).catch(function (userDataError) {
        if (!userId) {
          throw userDataError;
        }

        console.log('[Jellyfin] user data fallback', userDataError);
        return this.request('/Users/' + encodeURIComponent(userId) + '/Items/' + encodeURIComponent(itemId)).then(function (item) {
          return item && item.UserData ? item.UserData : null;
        });
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.getProgressPayload = function (itemId, progress) {
    var percentage = Math.max(0, Math.min(1, Number(progress && progress.percentage ? progress.percentage : 0)));
    var positionTicks = Math.max(0, Math.floor(percentage * 10000000));
    var isFinished = percentage >= 0.98;

    return {
      itemId: itemId,
      percentage: isFinished ? 1 : percentage,
      playedPercentage: isFinished ? 100 : percentage * 100,
      positionTicks: isFinished ? 10000000 : positionTicks,
      played: isFinished
    };
  };

  JellyfinClient.prototype.reportPlaybackProgress = function (itemId, progress) {
    return this.ensureAuthenticated().then(function (settings) {
      var userId = settings.jellyfin && settings.jellyfin.userId ? settings.jellyfin.userId : '';
      var progressPayload = this.getProgressPayload(itemId, progress);
      var query = [
        'positionTicks=' + encodeURIComponent(progressPayload.positionTicks),
        'isPaused=false',
        'isMuted=false',
        'playMethod=DirectPlay',
        'repeatMode=RepeatNone'
      ];
      var body = {
        CanSeek: true,
        ItemId: itemId,
        IsPaused: false,
        IsMuted: false,
        PositionTicks: progressPayload.positionTicks,
        PlayMethod: 'DirectPlay',
        RepeatMode: 'RepeatNone',
        PlaybackOrder: 'Default'
      };

      if (!userId) {
        return this.request('/Sessions/Playing/Progress', {
          method: 'POST',
          body: body
        });
      }

      return this.request('/Users/' + encodeURIComponent(userId) + '/PlayingItems/' + encodeURIComponent(itemId) + '/Progress?' + query.join('&'), {
        method: 'POST'
      }).catch(function (userProgressError) {
        query.push('userId=' + encodeURIComponent(userId));
        return this.request('/PlayingItems/' + encodeURIComponent(itemId) + '/Progress?' + query.join('&'), {
          method: 'POST'
        }).catch(function () {
          return this.request('/Sessions/Playing/Progress', {
            method: 'POST',
            body: body
          }).catch(function () {
            throw userProgressError;
          });
        }.bind(this));
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.updateItemUserData = function (itemId, progress) {
    var progressPayload = this.getProgressPayload(itemId, progress);

    return this.reportPlaybackProgress(itemId, progress).catch(function (error) {
      console.log('[Jellyfin] playback progress report failed', error);
    }).then(function () {
      return this.ensureAuthenticated();
    }.bind(this)).then(function (settings) {
      var userId = settings.jellyfin && settings.jellyfin.userId ? settings.jellyfin.userId : '';
      var postPath = '/UserItems/' + encodeURIComponent(itemId) + '/UserData';

      if (userId) {
        postPath += '?userId=' + encodeURIComponent(userId);
      }

      return this.getItemUserData(itemId).catch(function (error) {
        console.log('[Jellyfin] existing user data read failed', error);
        return null;
      }).then(function (userData) {
        userData = userData || {};

        return this.request(postPath, {
          method: 'POST',
          body: {
            Rating: typeof userData.Rating === 'number' ? userData.Rating : null,
            PlayedPercentage: progressPayload.playedPercentage,
            UnplayedItemCount: typeof userData.UnplayedItemCount === 'number' ? userData.UnplayedItemCount : 0,
            PlaybackPositionTicks: progressPayload.positionTicks,
            PlayCount: Math.max(Number(userData.PlayCount || 0), 1),
            IsFavorite: Boolean(userData.IsFavorite),
            Likes: typeof userData.Likes === 'boolean' ? userData.Likes : false,
            LastPlayedDate: new Date().toISOString(),
            Played: progressPayload.played,
            Key: userData.Key || itemId,
            ItemId: userData.ItemId || itemId
          }
        });
      }.bind(this));
    }.bind(this));
  };

  JellyfinClient.prototype.downloadBook = function (item) {
    if (!window.NativeHttp || !window.NativeHttp.downloadFile) {
      return Promise.reject(new Error('Native file download is not available'));
    }

    return this.ensureAuthenticated().then(function (settings) {
      var serverUrl = this.normalizeServerUrl(settings.jellyfin.serverUrl);
      var fileName = this.sanitizeFileName((item.Name || 'book') + '.epub');

      return window.NativeHttp.downloadFile({
        url: serverUrl + '/Items/' + encodeURIComponent(item.Id) + '/Download',
        fileName: fileName,
        headers: {
          'Authorization': this.getAuthHeader(settings, true)
        }
      });
    }.bind(this));
  };

  JellyfinClient.prototype.readDownloadedBook = function (path) {
    if (!window.NativeHttp || !window.NativeHttp.readFile) {
      return Promise.reject(new Error('Native file read is not available'));
    }

    return window.NativeHttp.readFile({ path: path }).then(function (result) {
      return this.base64ToArrayBuffer(result.base64);
    }.bind(this));
  };

  window.JellyfinClient = JellyfinClient;
})(window);
