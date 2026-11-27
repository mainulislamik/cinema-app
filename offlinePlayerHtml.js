export function getOfflinePlayerHtml(item) {
  const safeTitle = (item && item.title ? String(item.title) : 'Offline Video')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeResolution = (item && item.resolution ? String(item.resolution) : '1080p')
    .toUpperCase()
    .replace(/"/g, '');
  const fileUri = (item && item.fileUri ? String(item.fileUri) : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      width: 100%;
      height: 100%;
      background: #000000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    #player-wrap {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    video {
      width: 100vw;
      height: 100vh;
      object-fit: contain;
      background: #000000;
      transition: object-fit 0.2s ease;
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.92) 100%);
      z-index: 10;
    }
    .overlay.hidden {
      opacity: 0;
      pointer-events: none !important;
    }
    .overlay * {
      pointer-events: auto;
    }
    /* Top Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      gap: 12px;
    }
    .top-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    .btn-circle {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: rgba(255,255,255,0.14);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.18);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      outline: none;
      transition: background 0.15s, transform 0.1s;
      flex-shrink: 0;
    }
    .btn-circle:active {
      background: rgba(255,255,255,0.28);
      transform: scale(0.94);
    }
    .title-box {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .title-text {
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    .badge-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: #E11D48;
      color: #ffffff;
      text-transform: uppercase;
    }
    .badge-vault {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.5);
      color: #34d399;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .top-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .pill-btn {
      padding: 6px 12px;
      border-radius: 16px;
      background: rgba(255,255,255,0.14);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.18);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s, transform 0.1s;
    }
    .pill-btn:active {
      background: rgba(255,255,255,0.28);
      transform: scale(0.95);
    }
    /* Center Controls */
    .center-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 40px;
    }
    .btn-play {
      width: 66px;
      height: 66px;
      border-radius: 50%;
      background: linear-gradient(135deg, #FF2E56 0%, #E11D48 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      box-shadow: 0 4px 24px rgba(225, 29, 72, 0.55);
      cursor: pointer;
      transition: transform 0.12s, box-shadow 0.12s;
    }
    .btn-play:active {
      transform: scale(0.90);
      box-shadow: 0 2px 12px rgba(225, 29, 72, 0.4);
    }
    .btn-seek {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255,255,255,0.14);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.18);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 9px;
      font-weight: 800;
      transition: transform 0.12s;
    }
    .btn-seek:active {
      transform: scale(0.92);
      background: rgba(255,255,255,0.25);
    }
    /* Bottom Bar */
    .bottom-bar {
      padding: 8px 20px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .progress-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .slider-wrap {
      flex: 1;
      position: relative;
      height: 28px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
    }
    .progress-bar-bg {
      position: absolute;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(255,255,255,0.25);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-buffered {
      position: absolute;
      left: 0;
      height: 100%;
      width: 0%;
      background: rgba(255,255,255,0.35);
    }
    .progress-filled {
      position: absolute;
      left: 0;
      height: 100%;
      width: 0%;
      background: #E11D48;
    }
    .progress-thumb {
      position: absolute;
      left: 0%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 0 10px rgba(225, 29, 72, 0.9);
      pointer-events: none;
      transition: transform 0.1s;
    }
    .slider-wrap.dragging .progress-thumb {
      transform: translate(-50%, -50%) scale(1.3);
    }
    .time-text {
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      min-width: 105px;
      text-align: right;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .bottom-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .bottom-left-actions, .bottom-right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    /* Double tap ripple indicators */
    .tap-indicator {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 36%;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 20;
    }
    .tap-indicator.left { left: 0; }
    .tap-indicator.right { right: 0; }
    .tap-indicator.active {
      opacity: 1;
    }
    .tap-badge {
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.22);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 28px;
      font-size: 13px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    /* Floating Lock Button */
    .floating-lock-btn {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 30;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.25);
      color: #ffffff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .floating-lock-btn.visible {
      display: flex;
    }
  </style>
</head>
<body>
  <div id="player-wrap">
    <video
      id="video-player"
      autoplay
      playsinline
      webkit-playsinline
      controlsList="nodownload"
    >
      <source src="${fileUri}" type="video/mp4" />
    </video>

    <!-- Tap Double-Click Indicators -->
    <div id="tap-left" class="tap-indicator left">
      <div class="tap-badge">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
        <span>-10s</span>
      </div>
    </div>
    <div id="tap-right" class="tap-indicator right">
      <div class="tap-badge">
        <span>+10s</span>
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
      </div>
    </div>

    <!-- Floating Unlock Button (When Locked) -->
    <div id="btn-unlock" class="floating-lock-btn">
      <svg viewBox="0 0 24 24" width="20" height="20" stroke="#FF2E56" stroke-width="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
    </div>

    <!-- Cinema Fullscreen Interactive Overlay -->
    <div id="controls-overlay" class="overlay">
      <!-- Top Bar -->
      <div class="top-bar">
        <div class="top-left">
          <button id="btn-back" class="btn-circle" title="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div class="title-box">
            <span class="title-text">${safeTitle}</span>
            <div class="badge-row">
              <span class="badge">${safeResolution} • OFFLINE</span>
              <span class="badge badge-vault">
                <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                VAULT
              </span>
            </div>
          </div>
        </div>

        <div class="top-right">
          <button id="btn-aspect" class="pill-btn" title="Aspect Ratio">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><path d="M7 9h2v2H7zM15 13h2v2h-2z"/></svg>
            <span id="aspect-label">Fit</span>
          </button>
          <button id="btn-rotate" class="pill-btn" title="Rotate Screen">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M12 18h.01"></path></svg>
            <span>Rotate</span>
          </button>
          <button id="btn-lock" class="btn-circle" title="Lock Screen">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </button>
        </div>
      </div>

      <!-- Center Controls -->
      <div class="center-controls">
        <button id="btn-rewind" class="btn-seek" title="Rewind 10s">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          <span style="margin-top: -2px;">10</span>
        </button>

        <button id="btn-play" class="btn-play" title="Play / Pause">
          <svg id="icon-play" viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
          <svg id="icon-pause" viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style="display: none;"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>
        </button>

        <button id="btn-forward" class="btn-seek" title="Forward 10s">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span style="margin-top: -2px;">10</span>
        </button>
      </div>

      <!-- Bottom Bar -->
      <div class="bottom-bar">
        <div class="progress-row">
          <div id="slider" class="slider-wrap">
            <div class="progress-bar-bg">
              <div id="progress-buffered" class="progress-buffered"></div>
              <div id="progress-filled" class="progress-filled"></div>
            </div>
            <div id="progress-thumb" class="progress-thumb"></div>
          </div>
          <span id="time-display" class="time-text">00:00 / 00:00</span>
        </div>

        <div class="bottom-actions">
          <div class="bottom-left-actions">
            <button id="btn-speed" class="pill-btn" title="Playback Speed">
              <span>Speed:</span>
              <span id="speed-label" style="color: #FF2E56;">1.0x</span>
            </button>
          </div>
          <div class="bottom-right-actions">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 600;">Double-tap sides to skip 10s</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const video = document.getElementById('video-player');
      const wrap = document.getElementById('player-wrap');
      const overlay = document.getElementById('controls-overlay');
      const btnPlay = document.getElementById('btn-play');
      const iconPlay = document.getElementById('icon-play');
      const iconPause = document.getElementById('icon-pause');
      const btnRewind = document.getElementById('btn-rewind');
      const btnForward = document.getElementById('btn-forward');
      const btnBack = document.getElementById('btn-back');
      const btnAspect = document.getElementById('btn-aspect');
      const aspectLabel = document.getElementById('aspect-label');
      const btnRotate = document.getElementById('btn-rotate');
      const btnLock = document.getElementById('btn-lock');
      const btnUnlock = document.getElementById('btn-unlock');
      const btnSpeed = document.getElementById('btn-speed');
      const speedLabel = document.getElementById('speed-label');
      const slider = document.getElementById('slider');
      const progressFilled = document.getElementById('progress-filled');
      const progressBuffered = document.getElementById('progress-buffered');
      const progressThumb = document.getElementById('progress-thumb');
      const timeDisplay = document.getElementById('time-display');
      const tapLeft = document.getElementById('tap-left');
      const tapRight = document.getElementById('tap-right');

      let isLocked = false;
      let hideTimeout = null;
      let isDragging = false;
      let lastTapTime = 0;
      let lastTapX = 0;

      function postRN(data) {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }

      function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
        const s = Math.floor(seconds);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        const pMins = String(mins).padStart(2, '0');
        const pSecs = String(secs).padStart(2, '0');
        if (hrs > 0) {
          return hrs + ':' + pMins + ':' + pSecs;
        }
        return pMins + ':' + pSecs;
      }

      function showControls() {
        if (isLocked) return;
        overlay.classList.remove('hidden');
        resetHideTimer();
      }

      function hideControls() {
        if (video.paused) return;
        overlay.classList.add('hidden');
      }

      function toggleControls() {
        if (isLocked) return;
        if (overlay.classList.contains('hidden')) {
          showControls();
        } else {
          hideControls();
        }
      }

      function resetHideTimer() {
        if (hideTimeout) clearTimeout(hideTimeout);
        if (!video.paused && !isLocked) {
          hideTimeout = setTimeout(hideControls, 3500);
        }
      }

      // Play/Pause
      function togglePlay() {
        if (video.paused) {
          video.play().catch(function() {});
        } else {
          video.pause();
        }
      }

      video.addEventListener('play', function() {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        resetHideTimer();
      });

      video.addEventListener('pause', function() {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        showControls();
      });

      btnPlay.addEventListener('click', function(e) {
        e.stopPropagation();
        togglePlay();
      });

      // Rewind / Forward 10s
      function seekBy(diff) {
        const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + diff));
        video.currentTime = target;
        resetHideTimer();
      }

      btnRewind.addEventListener('click', function(e) {
        e.stopPropagation();
        seekBy(-10);
      });

      btnForward.addEventListener('click', function(e) {
        e.stopPropagation();
        seekBy(10);
      });

      // Double-tap gestures & single tap toggle
      wrap.addEventListener('click', function(e) {
        if (isLocked) return;
        if (e.target.closest('button') || e.target.closest('#slider')) return;

        const now = Date.now();
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        if (now - lastTapTime < 320 && Math.abs(x - lastTapX) < 120) {
          // Double-tap confirmed
          if (x < width * 0.4) {
            seekBy(-10);
            tapLeft.classList.add('active');
            setTimeout(function() { tapLeft.classList.remove('active'); }, 500);
          } else if (x > width * 0.6) {
            seekBy(10);
            tapRight.classList.add('active');
            setTimeout(function() { tapRight.classList.remove('active'); }, 500);
          } else {
            togglePlay();
          }
          lastTapTime = 0;
          return;
        }

        lastTapTime = now;
        lastTapX = x;

        // Single tap delay to allow double-tap
        setTimeout(function() {
          if (Date.now() - lastTapTime >= 280 && lastTapTime !== 0) {
            toggleControls();
          }
        }, 300);
      });

      // Progress Update
      video.addEventListener('timeupdate', function() {
        if (isDragging) return;
        const cur = video.currentTime || 0;
        const dur = video.duration || 0;
        timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);

        if (dur > 0) {
          const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
          progressFilled.style.width = pct + '%';
          progressThumb.style.left = pct + '%';
        }

        // Buffer update
        if (video.buffered && video.buffered.length > 0 && dur > 0) {
          for (let i = video.buffered.length - 1; i >= 0; i--) {
            if (video.buffered.start(i) <= cur) {
              const bufPct = Math.min(100, (video.buffered.end(i) / dur) * 100);
              progressBuffered.style.width = bufPct + '%';
              break;
            }
          }
        }
      });

      // Scrubber touch & drag
      function updateSeek(clientX) {
        const rect = slider.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const pct = pos * 100;
        progressFilled.style.width = pct + '%';
        progressThumb.style.left = pct + '%';
        if (video.duration) {
          const seekTo = pos * video.duration;
          timeDisplay.textContent = formatTime(seekTo) + ' / ' + formatTime(video.duration);
          return seekTo;
        }
        return 0;
      }

      slider.addEventListener('touchstart', function(e) {
        isDragging = true;
        slider.classList.add('dragging');
        if (hideTimeout) clearTimeout(hideTimeout);
        updateSeek(e.touches[0].clientX);
      }, { passive: true });

      slider.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        updateSeek(e.touches[0].clientX);
      }, { passive: true });

      slider.addEventListener('touchend', function(e) {
        if (isDragging) {
          isDragging = false;
          slider.classList.remove('dragging');
          const target = updateSeek(e.changedTouches[0].clientX);
          video.currentTime = target;
          resetHideTimer();
        }
      }, { passive: true });

      slider.addEventListener('click', function(e) {
        e.stopPropagation();
        const target = updateSeek(e.clientX);
        video.currentTime = target;
        resetHideTimer();
      });

      // Aspect Ratio Toggle: contain -> cover -> fill
      const aspectModes = [
        { mode: 'contain', label: 'Fit' },
        { mode: 'cover', label: 'Fill' },
        { mode: 'fill', label: 'Stretch' }
      ];
      let currentAspectIdx = 0;

      btnAspect.addEventListener('click', function(e) {
        e.stopPropagation();
        currentAspectIdx = (currentAspectIdx + 1) % aspectModes.length;
        const current = aspectModes[currentAspectIdx];
        video.style.objectFit = current.mode;
        aspectLabel.textContent = current.label;
        resetHideTimer();
      });

      // Playback Speed Toggle
      const speeds = [1.0, 1.25, 1.5, 2.0, 0.5, 0.75];
      let currentSpeedIdx = 0;

      btnSpeed.addEventListener('click', function(e) {
        e.stopPropagation();
        currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
        const speed = speeds[currentSpeedIdx];
        video.playbackRate = speed;
        speedLabel.textContent = speed.toFixed(speed === 1.0 || speed === 2.0 ? 1 : 2) + 'x';
        resetHideTimer();
      });

      // Rotate / Orientation Button
      btnRotate.addEventListener('click', function(e) {
        e.stopPropagation();
        postRN({ type: 'TOGGLE_ORIENTATION' });
        resetHideTimer();
      });

      // Back Button
      btnBack.addEventListener('click', function(e) {
        e.stopPropagation();
        postRN({ type: 'CLOSE_PLAYER' });
      });

      // Lock Screen Controls
      btnLock.addEventListener('click', function(e) {
        e.stopPropagation();
        isLocked = true;
        overlay.classList.add('hidden');
        btnUnlock.classList.add('visible');
      });

      btnUnlock.addEventListener('click', function(e) {
        e.stopPropagation();
        isLocked = false;
        btnUnlock.classList.remove('visible');
        showControls();
      });

      // Keyboard & remote control support
      window.addEventListener('keydown', function(e) {
        if (e.key === ' ' || e.key === 'k') {
          togglePlay();
        } else if (e.key === 'ArrowLeft') {
          seekBy(-10);
        } else if (e.key === 'ArrowRight') {
          seekBy(10);
        } else if (e.key === 'Escape' || e.key === 'Back') {
          postRN({ type: 'CLOSE_PLAYER' });
        }
      });

      // Start initial hide timer
      resetHideTimer();
    })();
  </script>
</body>
</html>`;
}
