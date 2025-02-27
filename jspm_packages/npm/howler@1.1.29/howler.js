/* */ 
"format cjs";
(function(Buffer) {
  (function() {
    var cache = {};
    var ctx = null,
        usingWebAudio = true,
        noAudio = false;
    try {
      if (typeof AudioContext !== 'undefined') {
        ctx = new AudioContext();
      } else if (typeof webkitAudioContext !== 'undefined') {
        ctx = new webkitAudioContext();
      } else {
        usingWebAudio = false;
      }
    } catch (e) {
      usingWebAudio = false;
    }
    if (!usingWebAudio) {
      if (typeof Audio !== 'undefined') {
        try {
          new Audio();
        } catch (e) {
          noAudio = true;
        }
      } else {
        noAudio = true;
      }
    }
    if (usingWebAudio) {
      var masterGain = (typeof ctx.createGain === 'undefined') ? ctx.createGainNode() : ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
    }
    var HowlerGlobal = function(codecs) {
      this._volume = 1;
      this._muted = false;
      this.usingWebAudio = usingWebAudio;
      this.ctx = ctx;
      this.noAudio = noAudio;
      this._howls = [];
      this._codecs = codecs;
      this.iOSAutoEnable = true;
    };
    HowlerGlobal.prototype = {
      volume: function(vol) {
        var self = this;
        vol = parseFloat(vol);
        if (vol >= 0 && vol <= 1) {
          self._volume = vol;
          if (usingWebAudio) {
            masterGain.gain.value = vol;
          }
          for (var key in self._howls) {
            if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
              for (var i = 0; i < self._howls[key]._audioNode.length; i++) {
                self._howls[key]._audioNode[i].volume = self._howls[key]._volume * self._volume;
              }
            }
          }
          return self;
        }
        return (usingWebAudio) ? masterGain.gain.value : self._volume;
      },
      mute: function() {
        this._setMuted(true);
        return this;
      },
      unmute: function() {
        this._setMuted(false);
        return this;
      },
      _setMuted: function(muted) {
        var self = this;
        self._muted = muted;
        if (usingWebAudio) {
          masterGain.gain.value = muted ? 0 : self._volume;
        }
        for (var key in self._howls) {
          if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
            for (var i = 0; i < self._howls[key]._audioNode.length; i++) {
              self._howls[key]._audioNode[i].muted = muted;
            }
          }
        }
      },
      codecs: function(ext) {
        return this._codecs[ext];
      },
      _enableiOSAudio: function() {
        var self = this;
        if (ctx && (self._iOSEnabled || !/iPhone|iPad|iPod/i.test(navigator.userAgent))) {
          return;
        }
        self._iOSEnabled = false;
        var unlock = function() {
          var buffer = ctx.createBuffer(1, 1, 22050);
          var source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          if (typeof source.start === 'undefined') {
            source.noteOn(0);
          } else {
            source.start(0);
          }
          setTimeout(function() {
            if ((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
              self._iOSEnabled = true;
              self.iOSAutoEnable = false;
              window.removeEventListener('touchend', unlock, false);
            }
          }, 0);
        };
        window.addEventListener('touchend', unlock, false);
        return self;
      }
    };
    var audioTest = null;
    var codecs = {};
    if (!noAudio) {
      audioTest = new Audio();
      codecs = {
        mp3: !!audioTest.canPlayType('audio/mpeg;').replace(/^no$/, ''),
        opus: !!audioTest.canPlayType('audio/ogg; codecs="opus"').replace(/^no$/, ''),
        ogg: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
        wav: !!audioTest.canPlayType('audio/wav; codecs="1"').replace(/^no$/, ''),
        aac: !!audioTest.canPlayType('audio/aac;').replace(/^no$/, ''),
        m4a: !!(audioTest.canPlayType('audio/x-m4a;') || audioTest.canPlayType('audio/m4a;') || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
        mp4: !!(audioTest.canPlayType('audio/x-mp4;') || audioTest.canPlayType('audio/mp4;') || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
        weba: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, '')
      };
    }
    var Howler = new HowlerGlobal(codecs);
    var Howl = function(o) {
      var self = this;
      self._autoplay = o.autoplay || false;
      self._buffer = o.buffer || false;
      self._duration = o.duration || 0;
      self._format = o.format || null;
      self._loop = o.loop || false;
      self._loaded = false;
      self._sprite = o.sprite || {};
      self._src = o.src || '';
      self._pos3d = o.pos3d || [0, 0, -0.5];
      self._volume = o.volume !== undefined ? o.volume : 1;
      self._urls = o.urls || [];
      self._rate = o.rate || 1;
      self._model = o.model || null;
      self._onload = [o.onload || function() {}];
      self._onloaderror = [o.onloaderror || function() {}];
      self._onend = [o.onend || function() {}];
      self._onpause = [o.onpause || function() {}];
      self._onplay = [o.onplay || function() {}];
      self._onendTimer = [];
      self._webAudio = usingWebAudio && !self._buffer;
      self._audioNode = [];
      if (self._webAudio) {
        self._setupAudioNode();
      }
      if (typeof ctx !== 'undefined' && ctx && Howler.iOSAutoEnable) {
        Howler._enableiOSAudio();
      }
      Howler._howls.push(self);
      self.load();
    };
    Howl.prototype = {
      load: function() {
        var self = this,
            url = null;
        if (noAudio) {
          self.on('loaderror', new Error('No audio support.'));
          return;
        }
        for (var i = 0; i < self._urls.length; i++) {
          var ext,
              urlItem;
          if (self._format) {
            ext = self._format;
          } else {
            urlItem = self._urls[i];
            ext = /^data:audio\/([^;,]+);/i.exec(urlItem);
            if (!ext) {
              ext = /\.([^.]+)$/.exec(urlItem.split('?', 1)[0]);
            }
            if (ext) {
              ext = ext[1].toLowerCase();
            } else {
              self.on('loaderror', new Error('Could not extract format from passed URLs, please add format parameter.'));
              return;
            }
          }
          if (codecs[ext]) {
            url = self._urls[i];
            break;
          }
        }
        if (!url) {
          self.on('loaderror', new Error('No codec support for selected audio sources.'));
          return;
        }
        self._src = url;
        if (self._webAudio) {
          loadBuffer(self, url);
        } else {
          var newNode = new Audio();
          newNode.addEventListener('error', function() {
            if (newNode.error && newNode.error.code === 4) {
              HowlerGlobal.noAudio = true;
            }
            self.on('loaderror', {type: newNode.error ? newNode.error.code : 0});
          }, false);
          self._audioNode.push(newNode);
          newNode.src = url;
          newNode._pos = 0;
          newNode.preload = 'auto';
          newNode.volume = (Howler._muted) ? 0 : self._volume * Howler.volume();
          var listener = function() {
            self._duration = Math.ceil(newNode.duration * 10) / 10;
            if (Object.getOwnPropertyNames(self._sprite).length === 0) {
              self._sprite = {_default: [0, self._duration * 1000]};
            }
            if (!self._loaded) {
              self._loaded = true;
              self.on('load');
            }
            if (self._autoplay) {
              self.play();
            }
            newNode.removeEventListener('canplaythrough', listener, false);
          };
          newNode.addEventListener('canplaythrough', listener, false);
          newNode.load();
        }
        return self;
      },
      urls: function(urls) {
        var self = this;
        if (urls) {
          self.stop();
          self._urls = (typeof urls === 'string') ? [urls] : urls;
          self._loaded = false;
          self.load();
          return self;
        } else {
          return self._urls;
        }
      },
      play: function(sprite, callback) {
        var self = this;
        if (typeof sprite === 'function') {
          callback = sprite;
        }
        if (!sprite || typeof sprite === 'function') {
          sprite = '_default';
        }
        if (!self._loaded) {
          self.on('load', function() {
            self.play(sprite, callback);
          });
          return self;
        }
        if (!self._sprite[sprite]) {
          if (typeof callback === 'function')
            callback();
          return self;
        }
        self._inactiveNode(function(node) {
          node._sprite = sprite;
          var pos = (node._pos > 0) ? node._pos : self._sprite[sprite][0] / 1000;
          var duration = 0;
          if (self._webAudio) {
            duration = self._sprite[sprite][1] / 1000 - node._pos;
            if (node._pos > 0) {
              pos = self._sprite[sprite][0] / 1000 + pos;
            }
          } else {
            duration = self._sprite[sprite][1] / 1000 - (pos - self._sprite[sprite][0] / 1000);
          }
          var loop = !!(self._loop || self._sprite[sprite][2]);
          var soundId = (typeof callback === 'string') ? callback : Math.round(Date.now() * Math.random()) + '',
              timerId;
          (function() {
            var data = {
              id: soundId,
              sprite: sprite,
              loop: loop
            };
            timerId = setTimeout(function() {
              if (!self._webAudio && loop) {
                self.stop(data.id).play(sprite, data.id);
              }
              if (self._webAudio && !loop) {
                self._nodeById(data.id).paused = true;
                self._nodeById(data.id)._pos = 0;
                self._clearEndTimer(data.id);
              }
              if (!self._webAudio && !loop) {
                self.stop(data.id);
              }
              self.on('end', soundId);
            }, (duration / self._rate) * 1000);
            self._onendTimer.push({
              timer: timerId,
              id: data.id
            });
          })();
          if (self._webAudio) {
            var loopStart = self._sprite[sprite][0] / 1000,
                loopEnd = self._sprite[sprite][1] / 1000;
            node.id = soundId;
            node.paused = false;
            refreshBuffer(self, [loop, loopStart, loopEnd], soundId);
            self._playStart = ctx.currentTime;
            node.gain.value = self._volume;
            if (typeof node.bufferSource.start === 'undefined') {
              loop ? node.bufferSource.noteGrainOn(0, pos, 86400) : node.bufferSource.noteGrainOn(0, pos, duration);
            } else {
              loop ? node.bufferSource.start(0, pos, 86400) : node.bufferSource.start(0, pos, duration);
            }
          } else {
            if (node.readyState === 4 || !node.readyState && navigator.isCocoonJS) {
              node.readyState = 4;
              node.id = soundId;
              node.currentTime = pos;
              node.muted = Howler._muted || node.muted;
              node.volume = self._volume * Howler.volume();
              setTimeout(function() {
                node.play();
              }, 0);
            } else {
              self._clearEndTimer(soundId);
              (function() {
                var sound = self,
                    playSprite = sprite,
                    fn = callback,
                    newNode = node;
                var listener = function() {
                  sound.play(playSprite, fn);
                  newNode.removeEventListener('canplaythrough', listener, false);
                };
                newNode.addEventListener('canplaythrough', listener, false);
              })();
              return self;
            }
          }
          self.on('play');
          if (typeof callback === 'function')
            callback(soundId);
          return self;
        });
        return self;
      },
      pause: function(id) {
        var self = this;
        if (!self._loaded) {
          self.on('play', function() {
            self.pause(id);
          });
          return self;
        }
        self._clearEndTimer(id);
        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          activeNode._pos = self.pos(null, id);
          if (self._webAudio) {
            if (!activeNode.bufferSource || activeNode.paused) {
              return self;
            }
            activeNode.paused = true;
            if (typeof activeNode.bufferSource.stop === 'undefined') {
              activeNode.bufferSource.noteOff(0);
            } else {
              activeNode.bufferSource.stop(0);
            }
          } else {
            activeNode.pause();
          }
        }
        self.on('pause');
        return self;
      },
      stop: function(id) {
        var self = this;
        if (!self._loaded) {
          self.on('play', function() {
            self.stop(id);
          });
          return self;
        }
        self._clearEndTimer(id);
        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          activeNode._pos = 0;
          if (self._webAudio) {
            if (!activeNode.bufferSource || activeNode.paused) {
              return self;
            }
            activeNode.paused = true;
            if (typeof activeNode.bufferSource.stop === 'undefined') {
              activeNode.bufferSource.noteOff(0);
            } else {
              activeNode.bufferSource.stop(0);
            }
          } else if (!isNaN(activeNode.duration)) {
            activeNode.pause();
            activeNode.currentTime = 0;
          }
        }
        return self;
      },
      mute: function(id) {
        var self = this;
        if (!self._loaded) {
          self.on('play', function() {
            self.mute(id);
          });
          return self;
        }
        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          if (self._webAudio) {
            activeNode.gain.value = 0;
          } else {
            activeNode.muted = true;
          }
        }
        return self;
      },
      unmute: function(id) {
        var self = this;
        if (!self._loaded) {
          self.on('play', function() {
            self.unmute(id);
          });
          return self;
        }
        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          if (self._webAudio) {
            activeNode.gain.value = self._volume;
          } else {
            activeNode.muted = false;
          }
        }
        return self;
      },
      volume: function(vol, id) {
        var self = this;
        vol = parseFloat(vol);
        if (vol >= 0 && vol <= 1) {
          self._volume = vol;
          if (!self._loaded) {
            self.on('play', function() {
              self.volume(vol, id);
            });
            return self;
          }
          var activeNode = (id) ? self._nodeById(id) : self._activeNode();
          if (activeNode) {
            if (self._webAudio) {
              activeNode.gain.value = vol;
            } else {
              activeNode.volume = vol * Howler.volume();
            }
          }
          return self;
        } else {
          return self._volume;
        }
      },
      loop: function(loop) {
        var self = this;
        if (typeof loop === 'boolean') {
          self._loop = loop;
          return self;
        } else {
          return self._loop;
        }
      },
      sprite: function(sprite) {
        var self = this;
        if (typeof sprite === 'object') {
          self._sprite = sprite;
          return self;
        } else {
          return self._sprite;
        }
      },
      pos: function(pos, id) {
        var self = this;
        if (!self._loaded) {
          self.on('load', function() {
            self.pos(pos);
          });
          return typeof pos === 'number' ? self : self._pos || 0;
        }
        pos = parseFloat(pos);
        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          if (pos >= 0) {
            self.pause(id);
            activeNode._pos = pos;
            self.play(activeNode._sprite, id);
            return self;
          } else {
            return self._webAudio ? activeNode._pos + (ctx.currentTime - self._playStart) : activeNode.currentTime;
          }
        } else if (pos >= 0) {
          return self;
        } else {
          for (var i = 0; i < self._audioNode.length; i++) {
            if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
              return (self._webAudio) ? self._audioNode[i]._pos : self._audioNode[i].currentTime;
            }
          }
        }
      },
      pos3d: function(x, y, z, id) {
        var self = this;
        y = (typeof y === 'undefined' || !y) ? 0 : y;
        z = (typeof z === 'undefined' || !z) ? -0.5 : z;
        if (!self._loaded) {
          self.on('play', function() {
            self.pos3d(x, y, z, id);
          });
          return self;
        }
        if (x >= 0 || x < 0) {
          if (self._webAudio) {
            var activeNode = (id) ? self._nodeById(id) : self._activeNode();
            if (activeNode) {
              self._pos3d = [x, y, z];
              activeNode.panner.setPosition(x, y, z);
              activeNode.panner.panningModel = self._model || 'HRTF';
            }
          }
        } else {
          return self._pos3d;
        }
        return self;
      },
      fade: function(from, to, len, callback, id) {
        var self = this,
            diff = Math.abs(from - to),
            dir = from > to ? 'down' : 'up',
            steps = diff / 0.01,
            stepTime = len / steps;
        if (!self._loaded) {
          self.on('load', function() {
            self.fade(from, to, len, callback, id);
          });
          return self;
        }
        self.volume(from, id);
        for (var i = 1; i <= steps; i++) {
          (function() {
            var change = self._volume + (dir === 'up' ? 0.01 : -0.01) * i,
                vol = Math.round(1000 * change) / 1000,
                toVol = to;
            setTimeout(function() {
              self.volume(vol, id);
              if (vol === toVol) {
                if (callback)
                  callback();
              }
            }, stepTime * i);
          })();
        }
      },
      fadeIn: function(to, len, callback) {
        return this.volume(0).play().fade(0, to, len, callback);
      },
      fadeOut: function(to, len, callback, id) {
        var self = this;
        return self.fade(self._volume, to, len, function() {
          if (callback)
            callback();
          self.pause(id);
          self.on('end');
        }, id);
      },
      _nodeById: function(id) {
        var self = this,
            node = self._audioNode[0];
        for (var i = 0; i < self._audioNode.length; i++) {
          if (self._audioNode[i].id === id) {
            node = self._audioNode[i];
            break;
          }
        }
        return node;
      },
      _activeNode: function() {
        var self = this,
            node = null;
        for (var i = 0; i < self._audioNode.length; i++) {
          if (!self._audioNode[i].paused) {
            node = self._audioNode[i];
            break;
          }
        }
        self._drainPool();
        return node;
      },
      _inactiveNode: function(callback) {
        var self = this,
            node = null;
        for (var i = 0; i < self._audioNode.length; i++) {
          if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
            callback(self._audioNode[i]);
            node = true;
            break;
          }
        }
        self._drainPool();
        if (node) {
          return;
        }
        var newNode;
        if (self._webAudio) {
          newNode = self._setupAudioNode();
          callback(newNode);
        } else {
          self.load();
          newNode = self._audioNode[self._audioNode.length - 1];
          var listenerEvent = navigator.isCocoonJS ? 'canplaythrough' : 'loadedmetadata';
          var listener = function() {
            newNode.removeEventListener(listenerEvent, listener, false);
            callback(newNode);
          };
          newNode.addEventListener(listenerEvent, listener, false);
        }
      },
      _drainPool: function() {
        var self = this,
            inactive = 0,
            i;
        for (i = 0; i < self._audioNode.length; i++) {
          if (self._audioNode[i].paused) {
            inactive++;
          }
        }
        for (i = self._audioNode.length - 1; i >= 0; i--) {
          if (inactive <= 5) {
            break;
          }
          if (self._audioNode[i].paused) {
            if (self._webAudio) {
              self._audioNode[i].disconnect(0);
            }
            inactive--;
            self._audioNode.splice(i, 1);
          }
        }
      },
      _clearEndTimer: function(soundId) {
        var self = this,
            index = -1;
        for (var i = 0; i < self._onendTimer.length; i++) {
          if (self._onendTimer[i].id === soundId) {
            index = i;
            break;
          }
        }
        var timer = self._onendTimer[index];
        if (timer) {
          clearTimeout(timer.timer);
          self._onendTimer.splice(index, 1);
        }
      },
      _setupAudioNode: function() {
        var self = this,
            node = self._audioNode,
            index = self._audioNode.length;
        node[index] = (typeof ctx.createGain === 'undefined') ? ctx.createGainNode() : ctx.createGain();
        node[index].gain.value = self._volume;
        node[index].paused = true;
        node[index]._pos = 0;
        node[index].readyState = 4;
        node[index].connect(masterGain);
        node[index].panner = ctx.createPanner();
        node[index].panner.panningModel = self._model || 'equalpower';
        node[index].panner.setPosition(self._pos3d[0], self._pos3d[1], self._pos3d[2]);
        node[index].panner.connect(node[index]);
        return node[index];
      },
      on: function(event, fn) {
        var self = this,
            events = self['_on' + event];
        if (typeof fn === 'function') {
          events.push(fn);
        } else {
          for (var i = 0; i < events.length; i++) {
            if (fn) {
              events[i].call(self, fn);
            } else {
              events[i].call(self);
            }
          }
        }
        return self;
      },
      off: function(event, fn) {
        var self = this,
            events = self['_on' + event];
        if (fn) {
          for (var i = 0; i < events.length; i++) {
            if (fn === events[i]) {
              events.splice(i, 1);
              break;
            }
          }
        } else {
          self['_on' + event] = [];
        }
        return self;
      },
      unload: function() {
        var self = this;
        var nodes = self._audioNode;
        for (var i = 0; i < self._audioNode.length; i++) {
          if (!nodes[i].paused) {
            self.stop(nodes[i].id);
            self.on('end', nodes[i].id);
          }
          if (!self._webAudio) {
            nodes[i].src = '';
          } else {
            nodes[i].disconnect(0);
          }
        }
        for (i = 0; i < self._onendTimer.length; i++) {
          clearTimeout(self._onendTimer[i].timer);
        }
        var index = Howler._howls.indexOf(self);
        if (index !== null && index >= 0) {
          Howler._howls.splice(index, 1);
        }
        delete cache[self._src];
        self = null;
      }
    };
    if (usingWebAudio) {
      var loadBuffer = function(obj, url) {
        if (url in cache) {
          obj._duration = cache[url].duration;
          loadSound(obj);
          return;
        }
        if (/^data:[^;]+;base64,/.test(url)) {
          var data = atob(url.split(',')[1]);
          var dataView = new Uint8Array(data.length);
          for (var i = 0; i < data.length; ++i) {
            dataView[i] = data.charCodeAt(i);
          }
          decodeAudioData(dataView.buffer, obj, url);
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = function() {
            decodeAudioData(xhr.response, obj, url);
          };
          xhr.onerror = function() {
            if (obj._webAudio) {
              obj._buffer = true;
              obj._webAudio = false;
              obj._audioNode = [];
              delete obj._gainNode;
              delete cache[url];
              obj.load();
            }
          };
          try {
            xhr.send();
          } catch (e) {
            xhr.onerror();
          }
        }
      };
      var decodeAudioData = function(arraybuffer, obj, url) {
        ctx.decodeAudioData(arraybuffer, function(buffer) {
          if (buffer) {
            cache[url] = buffer;
            loadSound(obj, buffer);
          }
        }, function(err) {
          obj.on('loaderror', err);
        });
      };
      var loadSound = function(obj, buffer) {
        obj._duration = (buffer) ? buffer.duration : obj._duration;
        if (Object.getOwnPropertyNames(obj._sprite).length === 0) {
          obj._sprite = {_default: [0, obj._duration * 1000]};
        }
        if (!obj._loaded) {
          obj._loaded = true;
          obj.on('load');
        }
        if (obj._autoplay) {
          obj.play();
        }
      };
      var refreshBuffer = function(obj, loop, id) {
        var node = obj._nodeById(id);
        node.bufferSource = ctx.createBufferSource();
        node.bufferSource.buffer = cache[obj._src];
        node.bufferSource.connect(node.panner);
        node.bufferSource.loop = loop[0];
        if (loop[0]) {
          node.bufferSource.loopStart = loop[1];
          node.bufferSource.loopEnd = loop[1] + loop[2];
        }
        node.bufferSource.playbackRate.value = obj._rate;
      };
    }
    if (typeof define === 'function' && define.amd) {
      define(function() {
        return {
          Howler: Howler,
          Howl: Howl
        };
      });
    }
    if (typeof exports !== 'undefined') {
      exports.Howler = Howler;
      exports.Howl = Howl;
    }
    if (typeof window !== 'undefined') {
      window.Howler = Howler;
      window.Howl = Howl;
    }
  })();
})(require('buffer').Buffer);
