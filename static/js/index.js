document.addEventListener('DOMContentLoaded', function () {
  var videos = Array.from(document.querySelectorAll('video[data-autoplay]'));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (videos.length && !reduceMotion) {
    function playVideo(video) {
      var promise = video.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {
          // Browser autoplay policies can still require manual playback.
        });
      }
    }

    if (!('IntersectionObserver' in window)) {
      videos.forEach(playVideo);
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (!entry.target.dataset.hold) {
              playVideo(entry.target);
            }
          } else {
            entry.target.pause();
          }
        });
      }, {
        rootMargin: '120px 0px',
        threshold: 0.2
      });

      videos.forEach(function (video) {
        observer.observe(video);
      });
    }
  }

  // Custom controls for the muted looping clips: play/pause, seek, time, full screen.
  var CONTROLLED = '.task-card__media, .deployment-card__media, .flow-card__video, .annotated-result-media';
  var ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  var ICON_FS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var s = t % 60;
    return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  Array.from(document.querySelectorAll(CONTROLLED)).forEach(function (clip) {
    var v = clip.querySelector('video');
    if (!v || v.hasAttribute('controls')) return;
    clip.classList.add('ctl', 'paused');

    var bar = document.createElement('div');
    bar.className = 'vc';
    bar.innerHTML =
      '<button type="button" class="vc-play" aria-label="Play">' + ICON_PLAY + ICON_PAUSE + '</button>' +
      '<input class="vc-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">' +
      '<span class="vc-time">0:00 / 0:00</span>' +
      '<button type="button" class="vc-fs" aria-label="Full screen">' + ICON_FS + '</button>';
    clip.appendChild(bar);

    var btn = bar.querySelector('.vc-play');
    var seek = bar.querySelector('.vc-seek');
    var time = bar.querySelector('.vc-time');
    var dragging = false, raf = 0;

    function sync() {
      var d = v.duration;
      if (!isFinite(d) || d <= 0) return;
      if (!dragging) seek.value = Math.round(v.currentTime / d * 1000);
      seek.style.setProperty('--p', (seek.value / 10) + '%');
      time.textContent = fmt(v.currentTime) + ' / ' + fmt(d);
      seek.setAttribute('aria-valuetext', time.textContent);
    }
    function tick() {
      sync();
      if (!v.paused) raf = requestAnimationFrame(tick);
    }
    function toggle() {
      if (v.paused) {
        delete v.dataset.hold;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.dataset.hold = '1';
        v.pause();
      }
    }

    v.addEventListener('play', function () {
      clip.classList.remove('paused');
      btn.setAttribute('aria-label', 'Pause');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    });
    v.addEventListener('pause', function () {
      clip.classList.add('paused');
      btn.setAttribute('aria-label', 'Play');
      cancelAnimationFrame(raf);
      sync();
    });
    v.addEventListener('loadedmetadata', sync);
    v.addEventListener('seeked', sync);

    btn.addEventListener('click', toggle);
    v.addEventListener('click', toggle);

    seek.addEventListener('pointerdown', function () { dragging = true; });
    seek.addEventListener('input', function () {
      var d = v.duration;
      seek.style.setProperty('--p', (seek.value / 10) + '%');
      if (isFinite(d) && d > 0) {
        v.currentTime = seek.value / 1000 * d;
        time.textContent = fmt(v.currentTime) + ' / ' + fmt(d);
      }
    });
    seek.addEventListener('change', function () { dragging = false; sync(); });
    seek.addEventListener('pointerup', function () { dragging = false; });

    bar.querySelector('.vc-fs').addEventListener('click', function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (clip.requestFullscreen) {
        clip.requestFullscreen().catch(function () {});
      } else if (clip.webkitRequestFullscreen) {
        clip.webkitRequestFullscreen();
      } else if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
    });
  });

  // Each comparison owns its playback, so individual viewport observers cannot
  // start or stop its clips independently. Shorter clips hold their last frame.
  document.querySelectorAll('[data-video-group]').forEach(function (group) {
    var clips = Array.from(group.querySelectorAll('video'));
    var controls = group.querySelector('.group-controls');
    var play = group.querySelector('[data-group-play]');
    var seek = group.querySelector('[data-group-seek]');
    var restart = group.querySelector('[data-group-restart]');
    var time = group.querySelector('[data-group-time]');
    var status = group.querySelector('[data-group-status]');
    var leader, duration = 0, ready = false, playing = false;
    var held = false, visible = false, frame = 0, attempt = 0;
    var label = group.getAttribute('aria-label');
    var endTime = Number(group.dataset.endTime);
    play.innerHTML = ICON_PLAY + ICON_PAUSE;
    restart.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6"/></svg>';
    restart.setAttribute('title', 'Restart all videos');
    controls.hidden = false;
    status.textContent = 'Loading comparison videos…';

    function render() {
      var current = leader ? Math.min(leader.currentTime, duration) : 0;
      seek.value = duration ? Math.round(current / duration * 1000) : 0;
      seek.style.setProperty('--progress', (Number(seek.value) / 10) + '%');
      var durationLabel = fmt(Math.ceil(duration));
      time.textContent = fmt(current) + ' / ' + durationLabel;
      seek.setAttribute('aria-valuetext', time.textContent);
      play.setAttribute('data-playing', String(playing));
      play.setAttribute('title', playing ? 'Pause all videos' : 'Play all videos');
      play.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + label);
    }
    function pause() {
      attempt++;
      playing = false;
      cancelAnimationFrame(frame);
      clips.forEach(function (v) { v.pause(); });
      render();
    }
    function seekAll(seconds) {
      seconds = Math.min(seconds, duration);
      clips.forEach(function (v) {
        v.currentTime = Math.min(seconds, Math.max(0, v.duration - 0.001));
      });
      render();
    }
    function tick() {
      if (!playing) return;
      var current = leader.currentTime;
      if (current >= duration) {
        pause();
        seekAll(0);
        start();
        return;
      }
      clips.forEach(function (v) {
        if (v === leader) return;
        var target = Math.min(current, Math.max(0, v.duration - 0.001));
        if (Math.abs(v.currentTime - target) > 0.15) v.currentTime = target;
      });
      render();
      frame = requestAnimationFrame(tick);
    }
    function start() {
      if (!ready || playing) return;
      if (leader.ended || leader.currentTime >= duration - 0.05) seekAll(0);
      var token = ++attempt;
      playing = true;
      status.textContent = '';
      render();
      // Start together; a rejected play request pauses the entire comparison.
      Promise.all(clips.map(function (v) {
        return v.currentTime < v.duration - 0.02 ? v.play() : Promise.resolve();
      })).then(function () {
        if (token !== attempt) return;
        cancelAnimationFrame(frame);
        tick();
      }).catch(function () {
        if (token !== attempt) return;
        pause();
        held = true;
        status.textContent = 'Playback paused. Select Play all to retry.';
      });
    }
    function metadata() {
      if (ready || !clips.every(function (v) { return isFinite(v.duration) && v.duration > 0; })) return;
      ready = true;
      leader = clips.reduce(function (a, b) { return a.duration >= b.duration ? a : b; });
      duration = leader.duration;
      if (isFinite(endTime) && endTime > 0) duration = Math.min(duration, endTime);
      clips.forEach(function (v) { v.controls = false; });
      play.disabled = seek.disabled = restart.disabled = false;
      status.textContent = '';
      leader.addEventListener('ended', function () {
        if (!playing) return;
        pause();
        seekAll(0);
        start();
      });
      render();
      if (visible && !held && !reduceMotion) start();
    }
    clips.forEach(function (v) {
      v.addEventListener('loadedmetadata', metadata);
      // Pause the row while any unfinished clip buffers, then resume together.
      v.addEventListener('waiting', function () {
        if (!playing || v.currentTime >= v.duration - 0.05) return;
        pause();
        group.dataset.buffering = 'true';
        status.textContent = 'Buffering comparison videos…';
      });
      v.addEventListener('canplay', function () {
        if (group.dataset.buffering && clips.every(function (clip) {
          return clip.readyState >= 3 || clip.currentTime >= clip.duration - 0.05;
        })) {
          delete group.dataset.buffering;
          status.textContent = '';
          if (visible && !held) start();
        }
      });
      v.addEventListener('error', function () {
        pause();
        held = true;
        status.textContent = 'A comparison video could not load. Reload the page to retry.';
      });
    });
    play.addEventListener('click', function () {
      if (playing || group.dataset.buffering) {
        held = true;
        delete group.dataset.buffering;
        status.textContent = '';
        pause();
      } else {
        held = false;
        start();
      }
    });
    seek.addEventListener('input', function () {
      var resume = playing;
      var seconds = Number(seek.value) / 1000 * duration;
      pause();
      seekAll(seconds);
      if (resume) start();
    });
    restart.addEventListener('click', function () {
      pause();
      seekAll(0);
      held = false;
      start();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (!visible) pause();
        else if (!held && !reduceMotion) start();
      }, { threshold: 0.1 }).observe(group);
    } else {
      visible = true;
    }
    metadata();
  });

  var methodFigure = document.querySelector('.method-interactive');
  var methodDescription = document.getElementById('method-stage-description');
  var methodHotspots = methodFigure ? Array.from(methodFigure.querySelectorAll('.method-hotspot')) : [];

  if (methodFigure && methodDescription && methodHotspots.length) {
    var descriptionTitle = methodDescription.querySelector('strong');
    var descriptionText = methodDescription.querySelector('span');
    var defaultTitle = descriptionTitle.textContent;
    var defaultText = descriptionText.textContent;

    function showMethodStage(hotspot) {
      methodHotspots.forEach(function (item) {
        var active = item === hotspot;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      descriptionTitle.textContent = hotspot.dataset.title;
      descriptionTitle.hidden = false;
      descriptionText.textContent = hotspot.dataset.description;
      methodDescription.classList.remove('is-default');
    }

    function resetMethodStage() {
      methodHotspots.forEach(function (item) {
        item.classList.remove('is-active');
        item.setAttribute('aria-pressed', 'false');
      });
      descriptionTitle.textContent = defaultTitle;
      descriptionTitle.hidden = !defaultTitle;
      descriptionText.textContent = defaultText;
      methodDescription.classList.toggle('is-default', !defaultTitle);
    }

    resetMethodStage();

    methodHotspots.forEach(function (hotspot) {
      hotspot.setAttribute('aria-pressed', 'false');
      hotspot.addEventListener('mouseenter', function () { showMethodStage(hotspot); });
      hotspot.addEventListener('focus', function () { showMethodStage(hotspot); });
      hotspot.addEventListener('click', function () { showMethodStage(hotspot); });
    });

    methodFigure.addEventListener('mouseleave', function () {
      if (!methodFigure.contains(document.activeElement)) {
        resetMethodStage();
      }
    });
  }

});
