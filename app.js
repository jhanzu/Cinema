/**
 * wetube ciné — Rạp phim của chúng mình (https://choigivui.com/)
 * Full High-Performance 3D Cinema Client
 *
 * Key Architecture & Optimizations:
 * - 3D 100-Seat Auditorium (Rows A-J x Cols 1-10) with Orbit, Authentic Seat POV, and Overview Cameras
 * - Differential DOM seat rendering (avoids 100 DOM re-parses, 60/120 FPS smooth animations)
 * - Safe pointer capture & iframe mouse shielding (eliminates stuck dragging forever)
 * - Resilient YouTube IFrame API + Fallback Embed Engine + oEmbed & NoEmbed metadata fetchers
 * - Robust multi-tab BroadcastChannel sync with unique peer IDs, seat changes, queue votes & play/pause lockstep
 * - Web Audio API Sound Synthesizer with gesture auto-unlock & silent bot reactions
 * - Touch pinch-to-zoom & responsive viewport auto-scaling for mobile, tablet, and desktop
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONSTANTS & INITIAL DATA
  // =========================================================================
  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const AVATAR_EMOJIS = ['😎', '🦊', '🐱', '🐼', '🐰', '🐯', '🐸', '🐵', '🦄', '🐲', '🎧', '🍿'];
  const AVATAR_COLORS = ['#FF4E45', '#F59E0B', '#10B981', '#06B6D4', '#8B5CF6', '#EC4899', '#3B82F6'];

  const PRESET_VIDEOS = [
    {
      videoId: '9B0yX0UIN9M',
      title: 'I Really Want to Stay at Your House',
      channel: 'Samuel Kim, Lorien - Topic',
      ambilight: ['#38BDF8', '#EC4899']
    }
  ];

  const INITIAL_QUEUE = [];

  const INITIAL_FRIENDS = [];
  const BOT_CHAT_LINES = [];

  // =========================================================================
  // 2. SOUND SYNTHESIZER (WEB AUDIO API)
  // =========================================================================
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    init() {
      if (!this.enabled) return;
      try {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      } catch (e) {}
    }

    playSeatSwitch() {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(290, now + 0.11);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      } catch (e) {}
    }

    playChatPop() {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    playReactionPop() {
      if (!this.enabled) return;
      const nowMs = Date.now();
      if (nowMs - (this._lastReactionPopTime || 0) < 110) return;
      this._lastReactionPopTime = nowMs;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340 + Math.random() * 220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch (e) {}
    }
  }

  const sfx = new SoundFX();

  // Unlock AudioContext and Video playback on first user interaction without console warnings
  function setupAudioUnlock() {
    const unlock = () => {
      sfx.init();
      if (ytReady && ytPlayer) {
        try {
          const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
          if (pState !== 1) {
            ytPlayer.playVideo();
          }
          if (state.isMuted && typeof ytPlayer.unMute === 'function') {
            ytPlayer.unMute();
            ytPlayer.setVolume(state.volume || 25);
            state.isMuted = false;
            const screenMuteIcon = document.getElementById('screenMuteIcon');
            if (screenMuteIcon) screenMuteIcon.textContent = '🔊';
            const muteBtn = document.getElementById('btnMuteToggle');
            if (muteBtn) muteBtn.textContent = '🔊';
          }
        } catch (_) {}
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  // =========================================================================
  // 3. APPLICATION STATE & MULTI-TAB PRESENCE
  // =========================================================================
  const urlParams = new URLSearchParams(window.location.search);
  const savedProfile = JSON.parse(
    localStorage.getItem('hanzu_cinema_profile') ||
    localStorage.getItem('wetube_cine_profile') ||
    'null'
  );
  const clientId = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const defaultEmoji = AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
  const defaultColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const currentRoomCode = urlParams.get('room') || 'rap-chung-minh';

  function getLiveRoomStorageKey(room) {
    return 'hanzu_live_room_' + encodeURIComponent(room || 'rap-chung-minh');
  }

  function loadLiveQueueFromStorage(room) {
    try {
      const raw = localStorage.getItem(getLiveRoomStorageKey(room));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.queue) && Date.now() - (parsed.timestamp || 0) < 12 * 3600 * 1000) {
        parsed.queue = parsed.queue.filter((q) => q && q.id !== 'q-1' && q.addedBy !== 'Hanzu Cinema');
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  const cachedLiveRoom = loadLiveQueueFromStorage(currentRoomCode);

  const state = {
    clientId,
    roomCode: urlParams.get('room') || 'rap-chung-minh',
    me: {
      id: clientId,
      name: (savedProfile && savedProfile.name) || urlParams.get('name') || `Khán giả #${randomSuffix}`,
      gender: (savedProfile && savedProfile.gender) || 'male',
      hasConfigured: !!(savedProfile && savedProfile.hasConfigured),
      seat: urlParams.get('seat') || (savedProfile && savedProfile.seat) || 'E5',
      emoji: (savedProfile && savedProfile.emoji) || defaultEmoji,
      avatar: (savedProfile && savedProfile.avatar) || null,
      color: (savedProfile && savedProfile.color) || defaultColor,
      isBot: false
    },
    peers: {}, // Remote tabs/users: { [clientId]: { id, name, seat, emoji, color } }
    friends: [],
    botsEnabled: false,

    // Local set of song IDs voted by THIS client (prevents sync overwrite bug)
    localVotedSongIds: new Set(),

    // Camera & 3D Transform State
    cameraMode: 'orbit', // 'orbit' | 'pov' | 'overview'
    rotX: -16,
    rotY: 0,
    zoom: 0.88,
    baseScale: 1,
    povHeadYaw: 0,
    povHeadPitch: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lightsDimmed: false,
    rafPending: false,

    // Current Video & YouTube Player State
    currentVideo: (cachedLiveRoom && cachedLiveRoom.currentVideo !== undefined)
      ? cachedLiveRoom.currentVideo
      : {
          videoId: '9B0yX0UIN9M',
          title: 'I Really Want to Stay at Your House',
          channel: 'Samuel Kim, Lorien - Topic',
          startedBy: 'Hanzu Cinema',
          ambilight: ['#38BDF8', '#EC4899']
        },
    isPlaying: false,
    isMuted: false,
    volume: 25,
    skipVotes: new Set(),
    isHandlingVideoEnd: false,

    // Auto Skip Ads State (60 FPS Safe, Fast-Forward & Instant Bypass)
    autoSkipAds: localStorage.getItem('hanzu_cinema_auto_skip_ads') !== 'false',
    // Personal Subtitles / Closed Captions State (Local client-only, does not affect others)
    subtitlesEnabled: localStorage.getItem('hanzu_subtitles_enabled') === '1',
    isAdPlaying: false,
    skippedAdsCount: 0,
    lastAdBypassTime: 0,
    preAdVolume: 25,
    preAdRate: 1,

    // Voting Queue & History (Syncs with live queue)
    queue: (cachedLiveRoom && Array.isArray(cachedLiveRoom.queue)) ? cachedLiveRoom.queue : [...INITIAL_QUEUE],
    queueSelectMode: false,
    selectedQueueItemIds: new Set(),
    mixerCount: 5,
    mixerNoDuplicate: localStorage.getItem('hanzu_mixer_no_duplicate') !== 'false',
    mixerHistoryVideoIds: new Set((() => {
      try {
        const raw = localStorage.getItem('hanzu_mixer_history');
        return raw ? JSON.parse(raw) : [];
      } catch (_) { return []; }
    })()),
    mixerRecommendations: [],
    history: [],

    // Active Speech Bubbles on 3D Seats: { [seatCode]: { text, timer } }
    seatBubbles: {},

    // Chat Messages
    messages: [
      {
        id: 'm-1',
        type: 'system',
        text: 'Chào mừng bạn đến với Hanzu Cinema — Rạp phim 3D 100 ghế! Nhấp vào bất kỳ chiếc ghế nào để đổi chỗ ngồi.'
      }
    ],

    activeTab: 'queue' // 'queue' | 'chat' | 'seats'
  };

  // Multi-tab real-time sync channel
  const syncChannel = ('BroadcastChannel' in window)
    ? new BroadcastChannel('hanzu_cinema_sync_v1')
    : null;

  let ytPlayer = null;
  let ytReady = false;
  let pendingVideoToLoad = null;
  const seatCoordMap = {}; // Maps 'E5' -> { x, y, z, rIdx, cIdx, rowLetter, colNum }

  // =========================================================================
  // 4. BUILD DOM SHELL
  // =========================================================================
    // =========================================================================
  // IMAGE PROCESSOR & COMPRESSION HELPER (Max 128x128px, compact data URL)
  // =========================================================================
  function processAvatarImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        return reject(new Error('Vui lòng chọn file hình ảnh hợp lệ (PNG, JPG, WebP)!'));
      }
      if (file.size > 20 * 1024 * 1024) {
        return reject(new Error('File ảnh quá lớn (tối đa 20MB)!'));
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh!'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Không thể tải hình ảnh này!'));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const targetSize = 128;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');

            // Center square crop
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;

            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

            // Export to WebP or JPEG
            let dataUrl = canvas.toDataURL('image/webp', 0.85);
            if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            }
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function mountAppShell() {
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="app-shell">
        <!-- Top Navigation Bar -->
        <header class="top-navbar">
          <div class="brand-group">
            <img src="./brand-mark.svg" alt="Hanzu Cinema" class="brand-logo" onerror="this.style.display='none'" />
            <div class="brand-titles">
              <div class="brand-name">
                <span class="brand-sig">Hanzu</span>
                <span class="brand-cine">Cinema</span>
                <span class="cine-badge">3D 100 Ghế</span>
              </div>
              <div class="brand-tagline">Một chiếc rạp, cả hội cùng xem • Phòng: <strong id="roomCodeLabel">#${state.roomCode}</strong></div>
            </div>
          </div>

          <!-- Camera Mode Switcher -->
          <div class="camera-mode-bar">
            <button class="mode-btn active" data-cam-mode="orbit" title="Kéo chuột xoay tự do quanh rạp 3D (Phím V để đổi)">
              🎥 Rạp 3D Tự Do
            </button>
            <button class="mode-btn" data-cam-mode="pov" title="Góc nhìn thực tế từ chính chiếc ghế bạn đang ngồi (Phím V)">
              👀 Góc Ghế Ngồi (POV)
            </button>
            <button class="mode-btn" data-cam-mode="overview" title="Góc nhìn toàn cảnh 100 ghế từ trên cao">
              🏟️ Toàn Cảnh 100 Ghế
            </button>
          </div>

          <!-- Right Actions -->
          <div class="nav-actions">
            <div class="fps-pill" id="fpsCounterPill" title="Tốc độ khung hình mượt mà thời gian thực (60 FPS)">
              <span class="fps-dot"></span>
              <span id="fpsValueText">60 FPS</span>
            </div>

            <div class="status-pill" title="Số người đang ngồi trong rạp">
              <span class="live-dot"></span>
              <span id="onlineCountText">1 / 100 ghế</span>
            </div>

            <button class="server-status-pill connecting" id="btnOpenServerSettings" title="Cài đặt kết nối máy chủ phòng chiếu chung">
              <span class="server-dot" id="serverDot"></span>
              <span id="serverStatusText">Đang kết nối...</span>
            </button>

            <button class="my-seat-pill" id="btnOpenProfile" title="Bấm để đổi tên, hình đại diện hoặc chọn ghế">
              <span id="myNavGender">${state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨')}</span>
              <img id="myNavAvatarImg" src="${state.me.avatar || ''}" style="display:${state.me.avatar ? 'inline-block' : 'none'};width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;border:1.5px solid #F59E0B;" />
              <span id="myNavEmoji" style="display:${state.me.avatar ? 'none' : 'inline'};">${state.me.emoji}</span>
              <span id="myNavName">${escapeHtml(state.me.name)}</span>
              <span>• Ghế <strong id="myNavSeat">${state.me.seat}</strong></span>
              <span style="opacity:0.75;font-size:0.75rem;margin-left:3px;">✏️</span>
            </button>

            <button class="icon-btn" id="btnToggleLights" title="Tắt/Bật đèn rạp (Phím tắt: L)">
              💡 Đèn rạp
            </button>

            <button class="icon-btn" id="btnShareRoom" title="Sao chép link mời bạn bè vào rạp">
              🔗 Mời bạn
            </button>
          </div>
        </header>

        <!-- Main Workspace -->
        <div class="main-workspace">
          <!-- Left: 3D Cinema Viewport -->
          <main class="cinema-viewport" id="cinemaViewport">
            <div class="ambilight-layer" id="ambilightLayer"></div>
            <div class="cinema-darkness-overlay" id="darknessOverlay"></div>

            <!-- Top HUD inside Viewport -->
            <div class="viewport-hud-top">
              <div class="now-playing-group">
                <div class="now-playing-card">
                  <span class="np-badge">ĐANG CHIẾU</span>
                  <div class="np-info">
                    <div class="np-title" id="hudVideoTitle">${escapeHtml(state.currentVideo.title)}</div>
                    <div class="np-meta" id="hudVideoMeta">${escapeHtml(state.currentVideo.channel)} • Chọn bởi ${escapeHtml(state.currentVideo.startedBy)}</div>
                  </div>
                </div>

                <div class="next-playing-card is-empty" id="hudNextPlayingCard" title="Xem danh sách bài hát trong hàng đợi">
                  <span class="np-badge next-badge">TIẾP THEO</span>
                  <div class="np-info">
                    <div class="np-title" id="hudNextVideoTitle">Hàng đợi đang trống</div>
                    <div class="np-meta" id="hudNextVideoMeta">Chưa có bài tiếp theo</div>
                  </div>
                </div>
              </div>

              <div class="camera-hint-pill" id="cameraHintPill">
                🖱️ Kéo để xoay 3D • Cuộn để Phóng to/Thu nhỏ • Click vào ghế bất kỳ để ngồi
              </div>
            </div>

            <!-- 3D Perspective World -->
            <div class="scene-3d-wrapper" id="scene3DWrapper">
              <div class="theater-world" id="theaterWorld">
                <div class="theater-ceiling"></div>
                <div class="theater-floor">
                  <div class="aisle-strip left"></div>
                  <div class="aisle-strip center"></div>
                  <div class="aisle-strip right"></div>
                </div>

                <!-- Giant Cinema Screen -->
                <div class="screen-pedestal">
                  <div class="screen-frame" id="cinemaScreenFrame">
                    <div class="screen-curtain-top">
                      <span>HANZU CINEMA IMAX 3D</span>
                      <span id="screenSeatStatus">GHẾ CỦA BẠN: ${state.me.seat}</span>
                    </div>
                    <div class="yt-player-mount" id="ytPlayerMount">
                      <div id="youtubePlayerContainer"></div>
                    </div>

                    <!-- YouTube Interactive Screen HUD Overlay -->
                    <div class="screen-interactive-overlay user-active" id="screenInteractiveOverlay">
                      <!-- Big Feedback Ripple Badge (Play/Pause/Seek) -->
                      <div class="screen-ripple-badge" id="screenRippleBadge">
                        <span class="srb-icon">▶️</span>
                        <span class="srb-text"></span>
                      </div>

                      <!-- Auto Skip Ads Real-Time Badge -->
                      <div class="ad-skip-indicator" id="adSkipIndicator">
                        <span class="ad-skip-spinner">⚡</span>
                        <span>Đang tự động bỏ qua quảng cáo...</span>
                      </div>

                      <!-- Top Quick Bar (Left Mode Actions & Title) -->
                      <div class="screen-top-quickbar">
                        <div class="stq-actions">
                          <button class="stq-btn" id="btnToggleNativeYt" type="button" title="Chuyển đổi giữa Giao diện Rạp và Menu cài đặt gốc YouTube">⚙️ YouTube Gốc</button>
                          <button class="stq-btn" id="btnScreenFocusMode" type="button" title="Chế độ Rạp IMAX cận cảnh (Phím tắt: T)">⛶ Rạp IMAX</button>
                        </div>
                        <span class="stq-title" id="screenTopTitle">${escapeHtml(state.currentVideo.title)}</span>
                      </div>

                      <!-- Center Gesture & Click Area -->
                      <div class="screen-click-area" id="screenClickArea">
                        <div class="screen-center-play-btn" id="screenCenterPlayBtn" title="Phát video">▶️</div>
                      </div>

                      <!-- Bottom YouTube Control HUD -->
                      <div class="screen-yt-hud" id="screenYtHud">
                        <!-- Scrubber / Progress Bar -->
                        <div class="yt-scrubber-container" id="ytScrubberContainer">
                          <div class="yt-scrubber-hover-preview" id="ytHoverPreview">0:00</div>
                          <div class="yt-scrubber-track">
                            <div class="yt-scrubber-buffer" id="ytScrubberBuffer"></div>
                            <div class="yt-scrubber-played" id="ytScrubberPlayed">
                              <div class="yt-scrubber-handle"></div>
                            </div>
                          </div>
                        </div>

                        <!-- Buttons Row -->
                        <div class="yt-hud-row">
                          <div class="yt-hud-left">
                            <button class="yt-btn" id="btnScreenPlayPause" type="button" title="Phát / Tạm dừng (Phím Space hoặc K)">
                              <span id="screenPlayIcon">⏸️</span>
                            </button>
                            <button class="yt-btn" id="btnScreenRewind10" type="button" title="Tua lùi 10 giây (Phím J hoặc Mũi tên trái)">
                              <span>⏪ 10s</span>
                            </button>
                            <button class="yt-btn" id="btnScreenForward10" type="button" title="Tua tiến 10 giây (Phím L hoặc Mũi tên phải)">
                              <span>⏩ 10s</span>
                            </button>
                            <button class="yt-btn" id="btnScreenNextVideo" type="button" title="Bài tiếp theo trong hàng đợi">
                              <span>⏭️</span>
                            </button>
                            <div class="yt-volume-group" id="screenVolumeGroup">
                              <button class="yt-btn" id="btnScreenMute" type="button" title="Bật / Tắt tiếng (Phím M)">
                                <span id="screenMuteIcon">🔊</span>
                              </button>
                              <input type="range" min="0" max="100" value="${state.volume}" class="yt-volume-slider" id="screenVolumeSlider" title="Âm lượng: ${state.volume}%" />
                            </div>
                            <div class="yt-time-display" id="screenTimeDisplay">
                              <span id="screenCurrentTime">0:00</span> / <span id="screenTotalDuration">0:00</span>
                            </div>
                          </div>

                          <div class="yt-hud-right">
                            <button class="yt-btn yt-cc-btn ${state.subtitlesEnabled ? 'active' : ''}" id="btnScreenToggleSubtitles" type="button" title="Bật / Tắt phụ đề cá nhân (Phím C)">
                              <span id="screenSubtitlesLabel">${state.subtitlesEnabled ? '💬 Phụ đề: BẬT' : '💬 Phụ đề: TẮT'}</span>
                            </button>
                            <button class="yt-btn yt-adskip-btn ${state.autoSkipAds ? 'active' : ''}" id="btnToggleAutoSkipAds" type="button" title="Tự động bỏ qua quảng cáo (Click để bỏ qua ngay hoặc Bật/Tắt)">
                              <span id="adSkipBtnIcon">${state.autoSkipAds ? '🛡️ Bỏ qua QC: BẬT' : '🛡️ Bỏ qua QC: TẮT'}</span>
                            </button>
                            <button class="yt-btn yt-speed-btn" id="btnScreenSpeed" type="button" title="Tốc độ phát">
                              <span id="screenSpeedLabel">1x</span>
                            </button>
                            <button class="yt-btn" id="btnScreenExternalYt" type="button" title="Mở cửa sổ rạp iframe trực tiếp trong web (Không mở tab mới)">
                              <span style="font-size: 0.82rem; white-space: nowrap;">🗗 Cửa sổ rạp</span>
                            </button>
                            <button class="yt-btn" id="btnScreenFullscreen" type="button" title="Toàn màn hình (Phím F)">
                              <span id="screenFsIcon">⛶</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="stage-apron"></div>
                </div>

                <!-- 100 Seats Auditorium Container -->
                <div class="seats-auditorium-3d" id="seatsAuditorium3D"></div>
              </div>
            </div>

            <!-- Bottom Controls & Reaction Dock -->
            <div class="viewport-hud-bottom">
              <div class="player-controls-dock">
                <button class="ctrl-btn primary" id="btnPlayPause" title="Phát / Tạm dừng (Phím Space)">
                  ⏸️ Tạm dừng
                </button>
                <button class="ctrl-btn" id="btnMuteToggle" title="Bật / Tắt tiếng (Phím M)">
                  🔊
                </button>
                <input type="range" min="0" max="100" value="${state.volume}" class="volume-slider" id="volumeSlider" title="Âm lượng: ${state.volume}%" />
                <span id="volumeValueLabel" class="volume-label">${state.volume}%</span>
                <button class="ctrl-btn vote-skip" id="btnVoteSkip" title="Bỏ phiếu chuyển sang video #1 trong hàng đợi (Cần 30% khán giả vote)">
                  ⏭️ Qua bài (<span id="skipVoteCounter">0/1</span>)
                </button>
                <button class="ctrl-btn" id="btnResetCamera" title="Đặt lại góc nhìn chuẩn">
                  🎯 Căn giữa
                </button>
              <button class="ctrl-btn cc-toggle ${state.subtitlesEnabled ? 'active' : ''}" id="btnDockToggleSubtitles" title="Bật / Tắt phụ đề cá nhân (Phím C)">
                  <span id="dockSubtitlesLabel">${state.subtitlesEnabled ? '💬 Phụ đề: BẬT' : '💬 Phụ đề'}</span>
                </button>
              </div>

              <!-- 3D Seat Reaction Cannon -->
              <div class="reaction-dock">
                <button class="react-btn" data-react="🍿" title="Tung bỏng ngô từ ghế của bạn (Phím 1)">🍿</button>
                <button class="react-btn" data-react="❤️" title="Thả tim (Phím 2)">❤️</button>
                <button class="react-btn" data-react="🪄" title="Quẩy Lightstick (Phím 3)">🪄</button>
                <button class="react-btn" data-react="🔥" title="Quá cháy (Phím 4)">🔥</button>
                <button class="react-btn" data-react="👏" title="Vỗ tay rần rần (Phím 5)">👏</button>
                <button class="react-btn" data-react="😂" title="Cười xỉu (Phím 6)">😂</button>
              </div>
            </div>
          </main>

          <!-- Right Sidebar -->
          <aside class="right-sidebar">
            <div class="sidebar-tabs">
              <button class="tab-trigger active" data-tab="queue">
                🎵 Bình chọn <span class="tab-badge" id="queueCountBadge">${state.queue.length}</span>
              </button>
              <button class="tab-trigger" data-tab="chat">
                💬 Trò chuyện <span class="tab-badge" id="chatCountBadge">${state.messages.length}</span>
              </button>
              <button class="tab-trigger" data-tab="seats">
                💺 100 Ghế
              </button>
            </div>

            <!-- Panel 1: YouTube Voting Queue -->
            <section class="sidebar-panel active" id="panel-queue">
              <div class="add-video-box">
                <form class="input-row" id="formAddVideo">
                  <input
                    type="text"
                    class="text-input"
                    id="inputYoutubeUrl"
                    placeholder="Dán link YouTube hoặc Video ID..."
                    autocomplete="off"
                  />
                  <button type="submit" class="btn-submit">+ Đề xuất</button>
                </form>
                <div class="preset-chips" id="presetChipsContainer"></div>
              </div>

              <!-- Solo Viewer Mixer Queue Card (Appears only when theater has 1 person) -->
              <div class="solo-mixer-card" id="soloMixerCard" style="display:none;">
                <div class="solo-mixer-header">
                  <div class="solo-mixer-title-wrap">
                    <span class="solo-mixer-badge">🎧 Rạp 1 người • Mixer Queue</span>
                    <div class="solo-mixer-title">Trộn nhạc theo bài đang chiếu</div>
                    <div class="solo-mixer-sub">Tự động chọn những bài mọi người hay nghe cùng</div>
                  </div>
                  <div class="solo-mixer-icon">🔀</div>
                </div>

                <div class="solo-mixer-current-track" id="soloMixerCurrentTrack">
                  <span class="sm-dot"></span>
                  <span class="sm-label">Bài gốc:</span>
                  <span class="sm-title" id="soloMixerSourceTitle">Đang cập nhật...</span>
                </div>

                <div class="solo-mixer-controls">
                  <div class="sm-count-row">
                    <span class="sm-count-label">Số bài mix:</span>
                    <div class="sm-count-input-wrap">
                      <div class="sm-count-pills" id="smCountPills">
                        <button type="button" class="sm-pill-btn" data-count="3">3</button>
                        <button type="button" class="sm-pill-btn active" data-count="5">5</button>
                        <button type="button" class="sm-pill-btn" data-count="10">10</button>
                        <button type="button" class="sm-pill-btn" data-count="20">20</button>
                      </div>
                      <div class="sm-custom-box" title="Tự nhập số bài muốn mix tùy ý (1 - 50 bài)">
                        <input
                          type="number"
                          id="inputCustomMixerCount"
                          class="sm-custom-input"
                          min="1"
                          max="50"
                          value="5"
                          placeholder="Số"
                        />
                        <span class="sm-custom-unit">bài</span>
                      </div>
                    </div>
                  </div>

                  <!-- No Duplicate Toggle Option -->
                  <div class="sm-toggle-row">
                    <label class="sm-toggle-label" title="Bật để các lần mix sau không bị trùng lặp bài với các lần mix trước">
                      <input type="checkbox" id="toggleMixerNoDuplicate" class="sm-toggle-checkbox" ${state.mixerNoDuplicate ? 'checked' : ''} />
                      <span class="sm-toggle-text">Không lặp lại bài đã mix</span>
                    </label>
                    <button type="button" class="sm-reset-history-btn" id="btnResetMixerHistory" title="Bấm để xóa danh sách bài cũ đã nhớ và làm mới từ đầu" style="display:none;">
                      <span id="smHistoryCountLabel"></span>
                    </button>
                  </div>

                  <div class="sm-actions-row">
                    <button type="button" class="btn-mixer-preview" id="btnOpenMixerPreview" title="Xem danh sách bài gợi ý và tự chọn">
                      👁️ Xem gợi ý
                    </button>
                    <button type="button" class="btn-mixer-add-now" id="btnMixerAddNow" title="Trộn và thêm ngay vào hàng đợi">
                      <span class="sm-spinner" id="smSpinner" style="display:none;">⏳</span>
                      <span>🔀 Mix ngay <span id="smAddCountLabel">5</span> bài</span>
                    </button>
                    <button type="button" class="btn-mixer-clear-queue" id="btnMixerClearQueue" title="Xóa toàn bộ các bài trong hàng đợi">
                      🗑️ Xóa queue
                    </button>
                  </div>
                </div>
              </div>

              <!-- Queue Management Toolbar (Always visible when queue has items) -->
              <div class="solo-queue-toolbar" id="soloQueueToolbar" style="${state.queue && state.queue.length > 0 ? 'display:flex;' : 'display:none;'}">
                <div class="sq-toolbar-left">
                  <span class="sq-toolbar-badge">🎵 Hàng đợi</span>
                  <span class="sq-toolbar-title" id="sqQueueCountTitle">${state.queue ? state.queue.length : 0} bài chờ chiếu</span>
                </div>
                <div class="sq-toolbar-actions">
                  <button type="button" class="sq-btn sq-btn-select" id="btnToggleQueueSelectMode" title="Chọn nhiều bài để xóa cùng lúc">
                    ☑️ Chọn bài
                  </button>
                  <button type="button" class="sq-btn sq-btn-clear" id="btnClearAllQueue" title="Xóa toàn bộ hàng đợi">
                    🗑️ Xóa tất cả
                  </button>
                </div>
              </div>

              <!-- Batch Action Bar when Select Mode is active -->
              <div class="queue-batch-bar" id="queueBatchBar" style="display:none;">
                <div class="qbb-info">
                  <span class="qbb-count-label">Đã chọn: <strong id="queueSelectedCountText">0</strong> bài</span>
                </div>
                <div class="qbb-actions">
                  <button type="button" class="link-btn" id="btnSelectAllQueue">Tất cả</button>
                  <button type="button" class="link-btn" id="btnDeselectAllQueue">Bỏ chọn</button>
                  <button type="button" class="qbb-btn-delete" id="btnDeleteSelectedQueue">
                    🗑️ Xóa (<span id="queueDeleteBtnCount">0</span>)
                  </button>
                  <button type="button" class="qbb-btn-close" id="btnCloseQueueSelectMode" title="Thoát chế độ chọn">✕</button>
                </div>
              </div>

              <div class="queue-list" id="queueListContainer"></div>
            </section>

            <!-- Panel 2: Live Theater Chat -->
            <section class="sidebar-panel" id="panel-chat">
              <div class="chat-messages-area" id="chatMessagesContainer"></div>
              <form class="chat-composer" id="formSendChat">
                <div class="input-row">
                  <input
                    type="text"
                    class="text-input"
                    id="inputChatMessage"
                    placeholder="Nhắn gì đó (sẽ hiện trên đầu ghế ${state.me.seat})..."
                    maxlength="160"
                    autocomplete="off"
                  />
                  <button type="submit" class="btn-submit">Gửi</button>
                </div>
              </form>
            </section>

            <!-- Panel 3: 2D 100-Seat Map & Audience Roster -->
            <section class="sidebar-panel" id="panel-seats">
              <div class="seatmap-panel-body">
                <div class="seatmap-action-hint">
                  <span>👆 <strong>Bấm vào ô ghế trống</strong> để đổi chỗ ngồi</span>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <button class="btn-quick-switch" id="btnSidebarChangeName" type="button" title="Cài đặt & Đổi tên của bạn">⚙️ Đổi tên</button>
                    <button class="btn-quick-switch" id="btnSidebarRandomSeat" type="button" title="Đổi sang một ghế trống ngẫu nhiên">🎲 Đổi ngẫu nhiên</button>
                  </div>
                </div>
                <div class="mini-screen-indicator">MÀN CHIẾU CHÍNH (SÂN KHẤU)</div>
                <div class="seat-grid-2d" id="seatGrid2D"></div>
                <div class="seat-legend">
                  <div class="legend-item"><span class="legend-swatch mine-swatch"></span> Ghế của bạn (BẠN)</div>
                  <div class="legend-item"><span class="legend-swatch occupied-swatch"></span> Đã có người ngồi (Khóa)</div>
                  <div class="legend-item"><span class="legend-swatch vip-swatch"></span> Ghế VIP (Hàng E-F)</div>
                </div>
                <div style="font-size:0.76rem;font-weight:700;color:var(--text-secondary);margin-top:6px;">
                  DANH SÁCH KHÁN GIẢ TRONG RẠP
                </div>
                <div class="audience-roster" id="audienceRosterContainer"></div>
              </div>
            </section>
          </aside>
        </div>

        <!-- Profile & Onboarding Modal -->
        <div class="modal-backdrop" id="profileModal">
          <div class="modal-card" style="max-width: 480px;">
            <div class="modal-header">
              <div class="modal-title" id="profileModalTitle">⚙️ Cài đặt & Đổi tên khán giả</div>
              <button class="icon-btn" id="btnCloseProfile" type="button" title="Đóng">✕</button>
            </div>

            <!-- Live Preview Card -->
            <div class="profile-preview-card" id="profilePreviewCard">
              <div class="preview-avatar-badge" id="previewBadge">
                <img id="previewAvatarImg" src="${state.me.avatar || ''}" style="display:${state.me.avatar ? 'block' : 'none'};width:100%;height:100%;border-radius:50%;object-fit:cover;" />
                <span id="previewEmoji" style="display:${state.me.avatar ? 'none' : 'block'};">${state.me.emoji}</span>
                <span class="preview-gender-tag" id="previewGenderTag">${state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨')}</span>
              </div>
              <div class="preview-info">
                <div class="preview-name" id="previewName">${escapeHtml(state.me.name)}</div>
                <div class="preview-seat">Ghế: <strong id="previewSeat">${state.me.seat}</strong> • Hanzu Cinema</div>
              </div>
            </div>

            <form id="formSaveProfile">
              <label style="font-size:0.82rem;font-weight:700;color:#F3F4F6;display:block;margin-bottom:6px;">✏️ 1. Tên hiển thị của bạn (Độc lập, không trùng lặp)</label>
              <input type="text" class="text-input" id="inputProfileName" style="width:100%;margin-bottom:8px;" value="${escapeHtml(state.me.name)}" maxlength="20" placeholder="Nhập tên hoặc nickname..." required />
              <div id="nameDuplicateWarning" style="display:none;color:#FBBF24;font-size:0.72rem;margin-top:-4px;margin-bottom:10px;font-weight:700;"></div>

              <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;">2. Giới tính của bạn</label>
              <div class="gender-selector-grid" id="genderSelectorGrid">
                <button type="button" class="gender-card ${state.me.gender === 'male' ? 'active' : ''}" data-gender="male">
                  <span class="gender-icon">👨</span>
                  <span class="gender-label">Nam</span>
                  <span class="gender-sub">Cyber Cyan</span>
                </button>
                <button type="button" class="gender-card ${state.me.gender === 'female' ? 'active' : ''}" data-gender="female">
                  <span class="gender-icon">👩</span>
                  <span class="gender-label">Nữ</span>
                  <span class="gender-sub">Neon Violet</span>
                </button>
                <button type="button" class="gender-card ${state.me.gender === 'other' ? 'active' : ''}" data-gender="other">
                  <span class="gender-icon">✨</span>
                  <span class="gender-label">Khác</span>
                  <span class="gender-sub">Prism Gold</span>
                </button>
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;margin-bottom:6px;">
                <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin:0;">3. Chọn Avatar nhân vật</label>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn-upload-avatar" id="btnUploadAvatar" title="Chọn ảnh từ máy tính / điện thoại">
                    📷 Tải ảnh từ máy
                  </button>
                  <button type="button" class="btn-clear-avatar" id="btnClearAvatar" style="display:${state.me.avatar ? 'inline-flex' : 'none'};" title="Xóa ảnh và dùng lại Emoji">
                    ✕ Dùng Emoji
                  </button>
                  <input type="file" id="inputAvatarFile" accept="image/*" style="display:none;" />
                </div>
              </div>

              <!-- Custom Avatar Photo Active Indicator Row -->
              <div id="avatarCustomPhotoRow" style="display:${state.me.avatar ? 'flex' : 'none'};align-items:center;gap:12px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:8px 12px;margin-bottom:10px;">
                <img id="avatarCustomThumb" src="${state.me.avatar || ''}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #60A5FA;box-shadow:0 0 10px rgba(59,130,246,0.4);" />
                <div style="flex:1;font-size:0.78rem;color:#E2E8F0;">
                  <strong style="color:#93C5FD;">Đang dùng ảnh từ máy của bạn</strong><br>
                  <span style="color:#94A3B8;font-size:0.72rem;">Ảnh sẽ hiển thị trên ghế 3D và chat</span>
                </div>
                <button type="button" class="btn-upload-avatar" id="btnChangeAvatarPhoto">Đổi ảnh khác</button>
              </div>

              <div class="emoji-grid" id="emojiPickerGrid" style="${state.me.avatar ? 'opacity:0.55;' : ''}"></div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                <button type="button" class="icon-btn" id="btnRandomEmptySeat">🎲 Ghế VIP ngẫu nhiên</button>
                <button type="submit" class="btn-submit" id="btnSubmitProfile" style="padding:10px 22px;font-size:0.92rem;">💾 Lưu tên & Cài đặt</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Server Settings Modal -->
        <div class="modal-backdrop" id="serverSettingsModal">
          <div class="modal-card" style="max-width: 480px;">
            <div class="modal-header">
              <div class="modal-title">🌐 Máy chủ phòng chiếu chung</div>
              <button class="icon-btn" id="btnCloseServerSettings" type="button">✕</button>
            </div>
            <p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">
              Để mọi người truy cập <strong>https://jhanzu.github.io/Cinema/</strong> cùng xem một màn hình, tất cả sẽ kết nối tới WebSocket Server chung.
            </p>
            <div style="margin-bottom:12px;">
              <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">Địa chỉ WebSocket Server (WSS):</label>
              <input type="text" class="text-input" id="inputCustomWsUrl" style="width:100%;font-family:monospace;font-size:0.8rem;" placeholder="wss://your-cinema-server.onrender.com/ws" />
            </div>
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:9px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:0.78rem;font-weight:700;color:#34D399;">🛡️ Tự động bỏ qua quảng cáo (Auto Skip Ads)</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);">Tự động tắt tiếng & tua tốc độ tối đa qua quảng cáo</div>
              </div>
              <input type="checkbox" id="checkModalAutoSkipAds" ${state.autoSkipAds ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:#10B981;" />
            </div>
            <div style="display:flex;gap:8px;margin-bottom:14px;">
              <button type="button" class="icon-btn" id="btnResetDefaultServer" style="flex:1;">🔄 Mặc định Cloud</button>
              <button type="button" class="icon-btn" id="btnConnectWsNow" style="flex:1;background:rgba(59,130,246,0.2);border-color:#3B82F6;color:#93C5FD;">⚡ Kết nối lại</button>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
              <div style="font-size:0.75rem;font-weight:700;color:#38BDF8;margin-bottom:4px;">💡 Hướng dẫn tạo server Render miễn phí 100%:</div>
              <ol style="font-size:0.72rem;color:var(--text-secondary);margin:0;padding-left:16px;line-height:1.5;">
                <li>Đăng nhập <strong>render.com</strong> miễn phí.</li>
                <li>Tạo <strong>New Web Service</strong> -> Kết nối repo <strong>jhanzu/Cinema</strong>.</li>
                <li>Bấm <strong>Deploy</strong> -> Nhận link dạng <code>https://...onrender.com</code>.</li>
                <li>Dán link WSS vào đây hoặc gửi link kèm <code>?ws=...</code> cho bạn bè!</li>
              </ol>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button type="button" class="btn-submit" id="btnSaveServerSettings">Xác nhận</button>
            </div>
          </div>
        </div>

        <!-- Unavailable Video Warning Pop-up Modal -->
        <div class="modal-backdrop" id="unavailableVideoModal">
          <div class="modal-card unavailable-modal-card">
            <div class="uv-icon" id="uvModalIcon">🚫</div>
            <div class="modal-title uv-title" id="uvModalTitle">Video Không Thể Xem (Unavailable)</div>
            <div class="uv-body" id="uvModalMessage">
              Link video YouTube này hiện không khả dụng để trình chiếu. Bạn không được phép xem video này.
            </div>
            <div class="uv-actions">
              <button type="button" class="btn-submit uv-btn-confirm" id="btnConfirmUnavailableVideo">
                ✅ Đồng Ý
              </button>
            </div>
          </div>
        </div>

        <!-- Video Duration Limit Warning Pop-up Modal (<= 8 Mins) -->
        <div class="modal-backdrop" id="videoLimitModal">
          <div class="modal-card unavailable-modal-card video-limit-modal-card">
            <div class="vl-icon">⏱️</div>
            <div class="modal-title uv-title vl-title">Video Quá Thời Lượng Cho Phép</div>
            <div class="uv-body" id="vlModalMessage">
              Video này vượt quá giới hạn thời lượng 8 phút cho phép của rạp chiếu phim. Vui lòng chọn bài khác!
            </div>
            <div class="uv-actions">
              <button type="button" class="btn-submit uv-btn-confirm vl-btn-confirm" id="btnConfirmVideoLimit">
                ✅ Đã Hiểu • Chọn Bài Khác
              </button>
            </div>
          </div>
        </div>

        <!-- Mixer Preview & Selection Modal -->
        <div class="modal-backdrop" id="mixerPreviewModal">
          <div class="modal-card" style="max-width: 520px;">
            <div class="modal-header">
              <div class="modal-title">🔀 Gợi ý bài hát nghe cùng (Mixer Queue)</div>
              <button class="icon-btn" id="btnCloseMixerModal" type="button">✕</button>
            </div>
            <div class="modal-body">
              <div class="mixer-modal-banner">
                <span class="mm-banner-left">🎵 Bài gốc: <strong id="modalMixerSourceSong">...</strong></span>
                <span class="mixer-limit-tag">⏱️ Dưới 8 phút</span>
              </div>
              <div class="mixer-modal-toolbar">
                <span class="mixer-hint-text">Chọn những bài bạn muốn thêm vào hàng đợi:</span>
                <div class="mixer-select-tools">
                  <button type="button" class="link-btn" id="btnSelectAllMixer">Chọn tất cả</button>
                  <button type="button" class="link-btn" id="btnDeselectAllMixer">Bỏ chọn</button>
                </div>
              </div>
              <div class="mixer-songs-list" id="mixerSongsList"></div>
              <div class="mixer-modal-footer">
                <span class="mixer-selected-count">Đã chọn: <strong id="mixerSelectedCountText">0</strong> bài</span>
                <div style="display:flex;gap:8px;">
                  <button type="button" class="icon-btn" id="btnCancelMixerModal">Hủy</button>
                  <button type="button" class="btn-submit" id="btnConfirmMixerAdd" style="padding:8px 18px;">
                    ➕ Thêm vào hàng đợi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Toast Notifications -->
        <div class="toast-container" id="toastContainer"></div>
      </div>
    `;
  }

  // =========================================================================
  // 5. 3D 100-SEAT AUDITORIUM RENDERER & HIGH PERFORMANCE VISUAL SYNC
  // =========================================================================
  const seatNodeCache = {};

  function build100Seats3D() {
    const container = document.getElementById('seatsAuditorium3D');
    if (!container) return;

    let rowsHtml = '';
    ROWS.forEach((rowLetter, rIdx) => {
      const z = rIdx * 50 + 30;
      const isVipRow = rowLetter === 'E' || rowLetter === 'F';
      let seatsHtml = '';

      COLS.forEach((colNum, cIdx) => {
        const seatCode = `${rowLetter}${colNum}`;
        let aisle = 0;
        if (colNum > 2) aisle += 18;
        if (colNum > 5) aisle += 38;
        if (colNum > 8) aisle += 18;
        const x = cIdx * 78 + aisle + 32;

        seatCoordMap[seatCode] = { x, y: 0, z, rIdx, cIdx, rowLetter, colNum };

        // Ultra-streamlined chair (4 DOM elements, armrests via CSS ::before/::after, max FPS)
        seatsHtml += `
          <div class="seat-3d-node ${isVipRow ? 'vip-seat' : ''}" id="seat-3d-${seatCode}" data-seat="${seatCode}" style="transform:translate3d(${x}px,0,0)" title="Ghế ${seatCode}${isVipRow ? ' (VIP)' : ''} — Click để ngồi">
            <div class="chair-name-badge" id="chair-badge-${seatCode}"></div>
            <div class="seat-avatar-slot" id="avatar-slot-${seatCode}"></div>
            <div class="chair-back">${seatCode}</div>
            <div class="chair-cushion"></div>
          </div>`;
      });

      rowsHtml += `<div class="seat-row-3d ${isVipRow ? 'vip-row' : ''}" id="seat-row-${rowLetter}" data-row="${rowLetter}" style="transform:translate3d(0,0,${z}px)">${seatsHtml}</div>`;
    });

    container.innerHTML = rowsHtml;

    // Fast cache population for differential DOM updater
    ROWS.forEach((r) => {
      COLS.forEach((c) => {
        const code = `${r}${c}`;
        const node = document.getElementById(`seat-3d-${code}`);
        if (node) {
          seatNodeCache[code] = {
            node3D: node,
            slot: node.querySelector('.seat-avatar-slot'),
            badge: node.querySelector('.chair-name-badge')
          };
        }
      });
    });

    // Single delegated click listener for all 100 seats (eliminates 100 individual event listeners)
    container.onclick = (e) => {
      const seatNode = e.target.closest('.seat-3d-node');
      if (seatNode && seatNode.dataset.seat) {
        e.stopPropagation();
        selectSeat(seatNode.dataset.seat);
      }
    };

    refreshSeatsVisuals();
  }

  function getOccupantMap() {
    const map = {};
    const now = Date.now();
    const seenUserIds = new Set();
    seenUserIds.add(state.me.id);

    // Peers from other tabs/clients (only active, fresh peers)
    Object.values(state.peers).forEach((p) => {
      if (!p || !p.seat || p.id === state.me.id) return;
      if (seenUserIds.has(p.id)) return; // Prevent duplicate entries for same user

      // Check if peer is stale (no heartbeat in 18s)
      if (!peerLastSeen[p.id]) {
        peerLastSeen[p.id] = p.lastSeen || now;
      }
      const lastSeen = peerLastSeen[p.id];
      if (now - lastSeen > 18000) {
        delete state.peers[p.id];
        delete peerLastSeen[p.id];
        return;
      }

      seenUserIds.add(p.id);
      map[p.seat] = { ...p, isMe: false };
    });

    // Local user always overrides their chosen seat
    map[state.me.seat] = { ...state.me, isMe: true };
    return map;
  }

  /**
   * Helper: Check if a viewer name is already taken by someone else in the room
   */
  function isNameTaken(name, excludeUserId = null) {
    if (!name) return false;
    const clean = String(name).trim().toLowerCase();
    const occupants = getOccupantMap();
    return Object.values(occupants).some((occ) => {
      if (!occ || !occ.name) return false;
      if (excludeUserId && occ.id === excludeUserId) return false;
      return occ.name.trim().toLowerCase() === clean;
    });
  }

  /**
   * Helper: Generate a distinctive, unique viewer name without duplicates
   */
  function makeUniqueName(desiredName, excludeUserId = null) {
    let base = (desiredName || 'Khán giả').trim().slice(0, 20);
    if (!isNameTaken(base, excludeUserId)) {
      return base;
    }
    const root = base.replace(/\s*[#(]\d+[)]?$/i, '').trim() || 'Khán giả';
    let counter = 2;
    while (isNameTaken(`${root} #${counter}`, excludeUserId)) {
      counter++;
    }
    return `${root} #${counter}`;
  }

  /**
   * High performance differential DOM updater:
   * Only touches elements whose occupant or speech bubble actually changed.
   * Completely eliminates 100-DOM reflow jank and animation resets.
   */
  function refreshSeatsVisuals() {
    const occupants = getOccupantMap();

    ROWS.forEach((rowLetter) => {
      COLS.forEach((colNum) => {
        const code = `${rowLetter}${colNum}`;
        const cached = seatNodeCache[code];
        const node3D = cached ? cached.node3D : document.getElementById(`seat-3d-${code}`);
        const slot = cached ? cached.slot : document.getElementById(`avatar-slot-${code}`);
        if (!node3D || !slot) return;

        const person = occupants[code];
        const bubble = state.seatBubbles[code];

        const occKey = person ? `${person.id}-${person.name}-${person.emoji}-${person.color}-${person.avatar ? person.avatar.slice(0, 30) : 'none'}` : 'empty';
        const bubbleKey = bubble ? bubble.text : '';

        // Check if anything actually changed for this seat
        if (node3D.dataset.cachedOccKey === occKey && node3D.dataset.cachedBubbleKey === bubbleKey) {
          return;
        }

        node3D.dataset.cachedOccKey = occKey;
        node3D.dataset.cachedBubbleKey = bubbleKey;

        node3D.classList.remove('occupied', 'my-seat', 'occupied-peer');
        const chairBadgeEl = cached ? cached.badge : document.getElementById(`chair-badge-${code}`);
        if (person) {
          if (person.isMe) {
            node3D.classList.add('my-seat');
            node3D.title = `Ghế ${code} của bạn (${person.name}) • Nhấp để đứng/đổi ghế`;
            if (chairBadgeEl) {
              chairBadgeEl.className = 'chair-name-badge my-badge';
              const avTagMy = person.avatar ? `<img src="${person.avatar}" class="chair-badge-avatar" />` : `<span style="font-size:0.74rem;">${person.emoji || '😎'}</span>`;
              chairBadgeEl.innerHTML = `${avTagMy} <span>${escapeHtml(person.name)}</span> <span class="cnb-tag" style="color:#FDE047;font-size:0.65rem;font-weight:700;margin-left:2px;">(Bạn)</span>`;
              chairBadgeEl.style.display = 'inline-flex';
            }
          } else {
            node3D.classList.add('occupied', 'occupied-peer');
            node3D.title = `Ghế ${code} — Đã có "${person.name}" ngồi (Không thể chọn)`;
            if (chairBadgeEl) {
              chairBadgeEl.className = 'chair-name-badge peer-badge';
              const avTagPeer = person.avatar ? `<img src="${person.avatar}" class="chair-badge-avatar" />` : `<span style="font-size:0.74rem;">${person.emoji || '👤'}</span>`;
              chairBadgeEl.innerHTML = `${avTagPeer} <span>${escapeHtml(person.name)}</span>`;
              chairBadgeEl.style.display = 'inline-flex';
            }
          }
          const bubbleHtml = bubble
            ? `<div class="seat-speech-bubble">${escapeHtml(bubble.text)}</div>`
            : '';
          const gender = person.gender || 'male';
          const genderIcon = gender === 'female' ? '👩' : (gender === 'other' ? '✨' : '👨');
          const hairHtml = gender === 'female' ? '<div class="block-hair-female"></div>' : '';

          slot.innerHTML = `
            ${bubbleHtml}
            <div class="block-mannequin mannequin-${gender} ${person.isMe ? 'is-me' : 'is-peer'}" style="--char-color:${person.color || '#3B82F6'}">
              <div class="mannequin-nametag">
                <span class="mannequin-gender">${genderIcon}</span>
                ${person.avatar ? `<img src="${person.avatar}" class="mannequin-avatar-img" />` : `<span class="mannequin-emoji">${person.emoji || '😎'}</span>`}
                <span class="mannequin-name">${escapeHtml(person.name)}</span>
              </div>
              <div class="block-head-wrap">
                ${hairHtml}
                <div class="block-head">
                  ${person.avatar ? `<div class="block-face block-face-photo-wrap"><img src="${person.avatar}" class="block-face-photo" /></div>` : `<div class="block-face">${person.emoji || '😎'}</div>`}
                  <div class="block-glasses-3d"></div>
                </div>
              </div>
              <div class="block-torso">
                <div class="block-torso-front"></div>
              </div>
              <div class="block-arm left"></div>
              <div class="block-arm right"></div>
              <div class="block-leg left">
                <div class="leg-thigh"></div>
                <div class="leg-shin"></div>
              </div>
              <div class="block-leg right">
                <div class="leg-thigh"></div>
                <div class="leg-shin"></div>
              </div>
            </div>
          `;
        } else {
          node3D.title = `Ghế ${code} (Trống - Nhấp để ngồi)`;
          if (chairBadgeEl) {
            chairBadgeEl.innerHTML = '';
            chairBadgeEl.style.display = 'none';
          }
          slot.innerHTML = bubble
            ? `<div class="seat-speech-bubble">${escapeHtml(bubble.text)}</div>`
            : '';
        }
      });
    });

    // Update top nav & screen counters
    const totalOccupied = Object.keys(occupants).length;
    const onlineEl = document.getElementById('onlineCountText');
    if (onlineEl) onlineEl.textContent = `${totalOccupied} / 100 ghế`;

    const myNavSeat = document.getElementById('myNavSeat');
    if (myNavSeat) myNavSeat.textContent = state.me.seat;
    const myNavName = document.getElementById('myNavName');
    if (myNavName) myNavName.textContent = state.me.name;
    const myNavEmoji = document.getElementById('myNavEmoji');
    if (myNavEmoji) {
      myNavEmoji.textContent = state.me.emoji;
      myNavEmoji.style.display = state.me.avatar ? 'none' : 'inline';
    }
    const myNavAvatarImg = document.getElementById('myNavAvatarImg');
    if (myNavAvatarImg) {
      if (state.me.avatar) {
        myNavAvatarImg.src = state.me.avatar;
        myNavAvatarImg.style.display = 'inline-block';
      } else {
        myNavAvatarImg.style.display = 'none';
      }
    }
    const myNavGender = document.getElementById('myNavGender');
    if (myNavGender) myNavGender.textContent = state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨');
    const screenSeatStatus = document.getElementById('screenSeatStatus');
    if (screenSeatStatus) screenSeatStatus.textContent = `GHẾ CỦA BẠN: ${state.me.seat}`;
    const chatInput = document.getElementById('inputChatMessage');
    if (chatInput) chatInput.placeholder = `Nhắn gì đó (sẽ hiện trên đầu ghế ${state.me.seat})...`;

    if (state.activeTab === 'seats') {
      render2DSeatMap(occupants);
    }
    updateSkipVoteUI();
    updatePlayPauseButton();
    updateMixerQueueVisibility();
    updateSoloQueueToolbar();
  }

  function selectSeat(seatCode, silent = false) {
    if (!seatCoordMap[seatCode]) return;

    // Check if another live person is currently occupying this seat
    const occupants = getOccupantMap();
    const occ = occupants[seatCode];
    if (occ && !occ.isMe) {
      const now = Date.now();
      const lastSeen = (occ.id && peerLastSeen[occ.id]) || (occ.id && state.peers[occ.id]?.lastSeen) || 0;
      if (occ.id && now - lastSeen > 15000) {
        // Ghost peer expired -> evict it immediately and proceed to sit!
        delete state.peers[occ.id];
        delete peerLastSeen[occ.id];
        refreshSeatsVisuals();
      } else {
        if (sfx && typeof sfx.playReactionPop === 'function') sfx.playReactionPop();
        showToast(`🚫 Ghế ${seatCode} đã có bạn "${occ.name}" ngồi rồi! Bạn không thể ngồi lên ghế này.`);
        return;
      }
    }

    const prevSeat = state.me.seat;
    state.me.seat = seatCode;
    saveProfileToStorage();
    sfx.playSeatSwitch();

    // Reset head look offsets on seat change
    state.povHeadYaw = 0;
    state.povHeadPitch = 0;

    refreshSeatsVisuals();
    render2DSeatMap(getOccupantMap());

    if (state.cameraMode === 'pov') {
      applyCameraTransform();
    }

    if (!silent && prevSeat !== seatCode) {
      showToast(`💺 Bạn đã chuyển sang ngồi Ghế ${seatCode}`);
      showSeatSpeechBubble(seatCode, `Mình ngồi ghế ${seatCode} nha! 👋`, 3600);
      broadcastSync({ type: 'SEAT_CHANGE', seat: seatCode, user: state.me });
    }
  }

  function findRandomFreeSeat(excludeSeat) {
    const occupants = getOccupantMap();
    const candidates = [];
    ROWS.forEach((r) => {
      COLS.forEach((c) => {
        const code = `${r}${c}`;
        if (code !== excludeSeat && !occupants[code]) {
          candidates.push(code);
        }
      });
    });
    if (candidates.length === 0) return 'J10';
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Focus on a seat in 3D: highlight, bubble, particle
  function focusOnSeat(seatCode) {
    if (!seatCoordMap[seatCode]) return;
    const node = document.getElementById(`seat-3d-${seatCode}`);
    if (node) {
      node.classList.remove('seat-highlight');
      // Trigger CSS reflow to replay animation
      void node.offsetWidth;
      node.classList.add('seat-highlight');
      setTimeout(() => node.classList.remove('seat-highlight'), 1900);
    }
    showSeatSpeechBubble(seatCode, '👋 Mình đang ngồi ở đây nè!', 3200);
    spawnSeatReaction3D(seatCode, '✨', false, false);
  }

  // =========================================================================
  // 6. 3D CAMERA ENGINE (ORBIT, AUTHENTIC FIRST-PERSON SEAT POV, OVERVIEW)
  // =========================================================================
  function updateViewportBaseScale() {
    const viewport = document.getElementById('cinemaViewport');
    if (!viewport) return;
    const w = viewport.clientWidth;
    // Auto scale 3D auditorium if viewport is narrower than 1020px
    if (w < 1020) {
      state.baseScale = Math.max(0.48, Math.min(1, (w - 24) / 1020));
    } else {
      state.baseScale = 1;
    }
  }

  function setCameraMode(mode) {
    state.cameraMode = mode;
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.camMode === mode);
    });

    const world = document.getElementById('theaterWorld');
    if (world) {
      world.classList.toggle('mode-pov', mode === 'pov');
    }

    const hintEl = document.getElementById('cameraHintPill');
    if (mode === 'pov') {
      state.povHeadYaw = 0;
      state.povHeadPitch = 0;
      if (hintEl) {
        hintEl.textContent = `👀 Góc nhìn thực tế từ Ghế ${state.me.seat} • Kéo nhẹ để nhìn quanh rạp`;
      }
    } else if (mode === 'overview') {
      state.rotX = -32;
      state.rotY = 0;
      state.zoom = 0.78;
      if (hintEl) {
        hintEl.textContent = '🏟️ Toàn cảnh 100 ghế từ trên cao • Nhấp vào ghế bất kỳ để đổi vị trí';
      }
    } else if (mode === 'focus') {
      state.rotX = 5.2;
      state.rotY = 0;
      if (hintEl) {
        hintEl.textContent = '🎬 Chế độ Rạp IMAX cận cảnh • Bấm phím T hoặc nhấp "Thoát IMAX" để quay lại';
      }
    } else {
      state.rotX = -16;
      state.rotY = 0;
      state.zoom = 0.88;
      if (hintEl) {
        hintEl.textContent = '🖱️ Kéo để xoay 3D • Cuộn để Phóng to/Thu nhỏ • Click vào ghế bất kỳ để ngồi';
      }
    }

    applyCameraTransform();
  }

  let cachedWorldEl = null;
  let cachedViewportEl = null;

  function getWorldEl() {
    if (!cachedWorldEl || !cachedWorldEl.isConnected) {
      cachedWorldEl = document.getElementById('theaterWorld');
    }
    return cachedWorldEl;
  }

  function getViewportEl() {
    if (!cachedViewportEl || !cachedViewportEl.isConnected) {
      cachedViewportEl = document.getElementById('cinemaViewport');
    }
    return cachedViewportEl;
  }

  function applyCameraTransform() {
    const world = getWorldEl();
    if (!world) return;

    if (state.cameraMode === 'pov') {
      // Calculate First-Person perspective from user's exact seat
      const coord = seatCoordMap[state.me.seat] || seatCoordMap['E5'];
      const colOffset = coord.cIdx - 4.5;
      const rowNorm = coord.rIdx;

      const povYaw = -colOffset * 3.2 + state.povHeadYaw;
      const povPitch = (rowNorm * 1.0 - 12.0) + state.povHeadPitch;
      const povZoom = (1.28 - rowNorm * 0.04) * state.baseScale;
      const translateX = -colOffset * 48;
      const translateY = 40 - rowNorm * 4;

      world.style.transform = `
        scale(${povZoom.toFixed(3)})
        rotateX(${povPitch.toFixed(2)}deg)
        rotateY(${povYaw.toFixed(2)}deg)
        translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px, 110px)
      `;
    } else if (state.cameraMode === 'focus') {
      const focusScale = (1.52 * state.baseScale).toFixed(3);
      world.style.transform = `
        scale(${focusScale})
        rotateX(5.2deg)
        rotateY(0deg)
        translate3d(0px, 85px, 130px)
      `;
    } else {
      const currentScale = (state.zoom * state.baseScale).toFixed(3);
      world.style.transform = `
        scale(${currentScale})
        rotateX(${state.rotX.toFixed(2)}deg)
        rotateY(${state.rotY.toFixed(2)}deg)
        translate3d(0, 0, 0)
      `;
    }
  }

  function requestCameraUpdate() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
      applyCameraTransform();
      state.rafPending = false;
    });
  }

  function setupViewportCameraControls() {
    const viewport = getViewportEl();
    const world = getWorldEl();
    if (!viewport || !world) return;

    let touchStartDist = 0;
    let wheelTransitionTimeout = null;

    viewport.addEventListener('pointerdown', (e) => {
      if (
        e.target.closest('.viewport-hud-top') ||
        e.target.closest('.viewport-hud-bottom') ||
        e.target.closest('.seat-3d-node') ||
        e.target.closest('.yt-player-mount') ||
        e.target.closest('.screen-interactive-overlay')
      ) {
        return;
      }

      state.isDragging = true;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      world.classList.add('dragging');
      document.body.classList.add('is-dragging-camera');
      viewport.classList.add('is-dragging-camera');

      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    viewport.addEventListener(
      'pointermove',
      (e) => {
        if (!state.isDragging) return;
        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;

        if (state.cameraMode === 'pov') {
          // In POV mode: rotate head view slightly without jarring mode switches
          state.povHeadYaw = Math.max(-26, Math.min(26, state.povHeadYaw + dx * 0.18));
          state.povHeadPitch = Math.max(-14, Math.min(14, state.povHeadPitch - dy * 0.14));
        } else {
          state.rotY = Math.max(-45, Math.min(45, state.rotY + dx * 0.22));
          state.rotX = Math.max(-40, Math.min(16, state.rotX - dy * 0.18));
        }

        requestCameraUpdate();
      },
      { passive: true }
    );

    const stopDragging = (e) => {
      if (state.isDragging) {
        state.isDragging = false;
        world.classList.remove('dragging');
        document.body.classList.remove('is-dragging-camera');
        viewport.classList.remove('is-dragging-camera');
        if (e && e.pointerId) {
          try {
            viewport.releasePointerCapture(e.pointerId);
          } catch (err) {}
        }
      }
    };

    viewport.addEventListener('pointerup', stopDragging);
    viewport.addEventListener('pointercancel', stopDragging);
    window.addEventListener('pointerup', stopDragging);

    // Smooth Wheel Zoom with normalized delta & instant response (no transition lag)
    viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (state.cameraMode === 'pov') {
          setCameraMode('orbit');
        }
        world.classList.add('dragging');
        clearTimeout(wheelTransitionTimeout);
        wheelTransitionTimeout = setTimeout(() => {
          if (!state.isDragging) {
            world.classList.remove('dragging');
          }
        }, 120);

        const delta = Math.sign(e.deltaY) * -0.05;
        state.zoom = Math.max(0.55, Math.min(1.6, state.zoom + delta));
        requestCameraUpdate();
      },
      { passive: false }
    );

    // Touch Pinch-to-Zoom for mobile devices
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / touchStartDist;
        touchStartDist = dist;

        if (state.cameraMode === 'pov') {
          setCameraMode('orbit');
        }

        const delta = (factor - 1) * 0.5;
        state.zoom = Math.max(0.55, Math.min(1.6, state.zoom + delta));
        requestCameraUpdate();
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      updateViewportBaseScale();
      requestCameraUpdate();
    });
  }

  // =========================================================================
  // 7. YOUTUBE IFRAME PLAYER & AMBILIGHT ENGINE
  // =========================================================================
  function initYouTubeIframeAPI() {
    let apiLoaded = false;

    if (window.YT && window.YT.Player) {
      createPlayerInstance();
      return;
    }

    window.onYouTubeIframeAPIReady = function () {
      apiLoaded = true;
      createPlayerInstance();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }

    // Fallback: If external YouTube API script is blocked or delayed, embed directly
    setTimeout(() => {
      if (!apiLoaded && (!ytPlayer || !ytReady)) {
        createFallbackIframe(state.currentVideo.videoId);
      }
    }, 7500);
  }

  function createPlayerInstance() {
    try {
      const originParam = (window.location.protocol.startsWith('http') && window.location.origin)
        ? window.location.origin
        : undefined;

      ytPlayer = new window.YT.Player('youtubePlayerContainer', {
        width: '100%',
        height: '100%',
        videoId: state.currentVideo.videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          fs: 1,
          iv_load_policy: 3,
          origin: originParam,
          widget_referrer: 'https://www.youtube.com/',
          cc_load_policy: state.subtitlesEnabled ? 1 : 0,
          cc_lang_pref: 'vi'
        },
        events: {
          onReady: (event) => {
            ytReady = true;
            hideVideoRescueCard();
            try {
              event.target.setVolume(state.volume);
              event.target.playVideo();
            } catch (e) {}
            updateAmbilightColors(state.currentVideo.ambilight);

            // Handle browser unmuted autoplay block
            setTimeout(() => {
              try {
                const pState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
                if (pState !== 1) {
                  event.target.playVideo();
                }
              } catch (_) {}
            }, 600);

            if (pendingVideoToLoad) {
              const vid = pendingVideoToLoad;
              pendingVideoToLoad = null;
              loadAndPlayVideo(vid, false, vid.startSeconds || 0);
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              clearTimeout(videoLoadWatchdogTimer);
              try {
                const dur = typeof event.target.getDuration === 'function' ? event.target.getDuration() : 0;
                if (dur && dur > MAX_VIDEO_DURATION_SECONDS) {
                  enforceVideoLimit(dur);
                  return;
                }
              } catch (_) {}
              state.isPlaying = true;
              hideVideoRescueCard();
              updatePlayPauseButton();
              updateAmbilightColors(state.currentVideo.ambilight);
            if (state.subtitlesEnabled) {
                setTimeout(() => { applySubtitlesStateToPlayer(); }, 350);
              }
            } else if (event.data === window.YT.PlayerState.ENDED) {
              handleVideoEnd();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              state.isPlaying = false;
              updatePlayPauseButton();
            } else if (event.data === window.YT.PlayerState.CUED) {
              try { event.target.playVideo(); } catch (_) {}
            }
          },
          onError: (event) => {
            clearTimeout(videoLoadWatchdogTimer);
            const errCode = event ? event.data : 150;
            handleVideoPlayError(errCode);
          }
        }
      });
    } catch (err) {
      createFallbackIframe(state.currentVideo.videoId);
    }
  }

  function createFallbackIframe(videoId, startSeconds = 0) {
    const mount = document.getElementById('ytPlayerMount');
    if (!mount) return;
    const startParam = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : '';
    const ccParam = state.subtitlesEnabled ? '&cc_load_policy=1&cc_lang_pref=vi' : '&cc_load_policy=0';
    const originParam = (window.location.protocol.startsWith('http') && window.location.origin)
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : '';
    mount.innerHTML = `
      <iframe
        id="youtubePlayerContainer"
        src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1&widget_referrer=${encodeURIComponent('https://www.youtube.com/')}${originParam}${startParam}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    `;
    ytReady = true;
    state.isPlaying = true;
    updatePlayPauseButton();
    if (state.currentVideo && state.currentVideo.ambilight) {
      updateAmbilightColors(state.currentVideo.ambilight);
    }
    try {
      if (window.YT && typeof window.YT.Player === 'function') {
        ytPlayer = new window.YT.Player('youtubePlayerContainer', {
          events: {
            onReady: (event) => {
              ytReady = true;
              try { event.target.setVolume(state.volume); } catch (_) {}
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                clearTimeout(videoLoadWatchdogTimer);
                try {
                  const dur = typeof event.target.getDuration === 'function' ? event.target.getDuration() : 0;
                  if (dur && dur > MAX_VIDEO_DURATION_SECONDS) {
                    enforceVideoLimit(dur);
                    return;
                  }
                } catch (_) {}
                state.isPlaying = true;
                hideVideoRescueCard();
                updatePlayPauseButton();
                if (state.currentVideo && state.currentVideo.ambilight) {
                  updateAmbilightColors(state.currentVideo.ambilight);
                }
              } else if (event.data === window.YT.PlayerState.ENDED) {
                handleVideoEnd();
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                state.isPlaying = false;
                updatePlayPauseButton();
              }
            },
            onError: (event) => {
              clearTimeout(videoLoadWatchdogTimer);
              const errCode = event ? event.data : 150;
              handleVideoPlayError(errCode);
            }
          }
        });
      }
    } catch (_) {}
  }

  // =========================================================================
  // CLIENT-SIDE CLOSED CAPTIONS / SUBTITLES CONTROLLER (100% PERSONAL PREFERENCE)
  // =========================================================================
  function updateSubtitlesUI() {
    const screenBtn = document.getElementById('btnScreenToggleSubtitles');
    const screenLabel = document.getElementById('screenSubtitlesLabel');
    const dockBtn = document.getElementById('btnDockToggleSubtitles');
    const dockLabel = document.getElementById('dockSubtitlesLabel');

    if (screenBtn) {
      screenBtn.classList.toggle('active', !!state.subtitlesEnabled);
    }
    if (screenLabel) {
      screenLabel.textContent = state.subtitlesEnabled ? '💬 Phụ đề: BẬT' : '💬 Phụ đề: TẮT';
    }
    if (dockBtn) {
      dockBtn.classList.toggle('active', !!state.subtitlesEnabled);
    }
    if (dockLabel) {
      dockLabel.textContent = state.subtitlesEnabled ? '💬 Phụ đề: BẬT' : '💬 Phụ đề';
    }
  }

  function applySubtitlesStateToPlayer() {
    if (!ytReady || !ytPlayer) return;

    try {
      if (state.subtitlesEnabled) {
        if (typeof ytPlayer.loadModule === 'function') {
          ytPlayer.loadModule('captions');
        }
        if (typeof ytPlayer.setOption === 'function') {
          try {
            const tracklist = (typeof ytPlayer.getOption === 'function') ? ytPlayer.getOption('captions', 'tracklist') : null;
            if (Array.isArray(tracklist) && tracklist.length > 0) {
              const viTrack = tracklist.find((t) => t.languageCode === 'vi');
              const enTrack = tracklist.find((t) => t.languageCode === 'en');
              const chosen = viTrack || enTrack || tracklist[0];
              ytPlayer.setOption('captions', 'track', chosen ? { languageCode: chosen.languageCode } : { languageCode: 'vi' });
            } else {
              ytPlayer.setOption('captions', 'track', { languageCode: 'vi' });
            }
          } catch (_) {
            try { ytPlayer.setOption('captions', 'track', { languageCode: 'vi' }); } catch (_) {}
          }
        }
      } else {
        if (typeof ytPlayer.unloadModule === 'function') {
          ytPlayer.unloadModule('captions');
        }
        if (typeof ytPlayer.setOption === 'function') {
          try {
            ytPlayer.setOption('captions', 'track', {});
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('Subtitles apply error:', err);
    }
  }

  function toggleSubtitles(forceState) {
    if (typeof forceState === 'boolean') {
      state.subtitlesEnabled = forceState;
    } else {
      state.subtitlesEnabled = !state.subtitlesEnabled;
    }

    try {
      localStorage.setItem('hanzu_subtitles_enabled', state.subtitlesEnabled ? '1' : '0');
    } catch (_) {}

    applySubtitlesStateToPlayer();
    updateSubtitlesUI();

    showToast(
      state.subtitlesEnabled
        ? '💬 Đã BẬT phụ đề (Tùy chọn cá nhân của bạn, không ảnh hưởng người khác)'
        : '💬 Đã TẮT phụ đề (Tùy chọn cá nhân của bạn)',
      3200
    );
  }

  // =========================================================================
  // UNAVAILABLE VIDEO HANDLER & WARNING POPUP (Strict Detection & Alert)
  // =========================================================================
  let isShowingUnavailableModal = false;
  const failedVideoIds = new Set();
  let videoLoadWatchdogTimer = null;

  /**
   * Helper: Check if a video was submitted or initiated by the local user
   */
  function isMySubmittedVideo(videoObj) {
    if (!videoObj) return false;
    // System default tracks are never considered user-submitted
    if (videoObj.startedBy === 'Hanzu Cinema' || videoObj.addedBy === 'Hanzu Cinema') return false;

    // 1. Direct unique ID matches
    if (videoObj.addedByUserId && videoObj.addedByUserId === state.me.id) return true;
    if (videoObj.addedByClientId && videoObj.addedByClientId === state.clientId) return true;
    if (videoObj.startedByUserId && videoObj.startedByUserId === state.me.id) return true;
    if (videoObj.startedByClientId && videoObj.startedByClientId === state.clientId) return true;

    // 2. Exact signature matches
    const mySignature = `${state.me.name} (${state.me.seat})`.trim().toLowerCase();
    const addedByStr = String(videoObj.addedBy || '').trim().toLowerCase();
    const startedByStr = String(videoObj.startedBy || '').trim().toLowerCase();
    const myName = (state.me.name || '').trim().toLowerCase();

    if (mySignature && (addedByStr === mySignature || startedByStr === mySignature)) return true;
    if (myName && (addedByStr === myName || startedByStr === myName)) return true;

    return false;
  }

  /**
   * Reset cinema screen to clean standby placeholder when queue is completely empty
   */
  function clearCinemaScreen() {
    state.currentVideo = null;
    state.isPlaying = false;
    hideVideoRescueCard();
    clearTimeout(videoLoadWatchdogTimer);
    updatePlayPauseButton();

    const titleEl = document.getElementById('hudVideoTitle');
    const metaEl = document.getElementById('hudVideoMeta');
    const screenTitleEl = document.getElementById('screenTopTitle');
    if (titleEl) titleEl.textContent = 'Chưa có video đang chiếu';
    if (screenTitleEl) screenTitleEl.textContent = 'MÀN CHIẾU 3D ĐANG CHỜ';
    if (metaEl) metaEl.textContent = 'Dán link YouTube ở cột bên phải để chiếu lên màn hình';
    if (typeof updateScrubberUI === 'function') updateScrubberUI(0, 0, 0);
    updateAmbilightColors(['#0F172A', '#1E293B']);

    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
      try { ytPlayer.stopVideo(); } catch (_) {}
    }
    const inPageIframe = document.getElementById('inPageCinemaIframe');
    if (inPageIframe) inPageIframe.src = 'about:blank';

    const mount = document.getElementById('ytPlayerMount');
    if (mount) {
      mount.innerHTML = `
        <div id="youtubePlayerContainer" style="display:none;"></div>
        <div class="cinema-empty-screen-placeholder" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05070D;color:#94A3B8;gap:12px;font-family:Inter,sans-serif;user-select:none;">
          <div style="font-size:3.2rem;filter:drop-shadow(0 0 18px rgba(56,189,248,0.4));">🎬</div>
          <div style="font-size:1.1rem;font-weight:700;color:#F1F5F9;letter-spacing:0.02em;">Màn chiếu đang chờ video</div>
          <div style="font-size:0.82rem;color:#64748B;">Hãy dán link YouTube hoặc chọn bài trong hàng đợi để chiếu</div>
        </div>
      `;
    }
    updateNextPlayingUI();
  }

  let isAutoRescuingSong = false;
  async function handleVideoPlayError(errCode) {
    clearTimeout(videoLoadWatchdogTimer);
    const currentVid = state.currentVideo;
    if (!currentVid || !currentVid.videoId) return;

    const failedVidId = currentVid.videoId;

    // 🎵 AUTO-RESCUE FOR BLOCKED MUSIC (Error 150 / 101: Owner disabled external embedding)
    // Seamlessly searches for official audio/lyric/cover version so playback never stops!
    if ((errCode === 150 || errCode === 101) && !isAutoRescuingSong && (currentVid._rescueAttempts || 0) < 2) {
      isAutoRescuingSong = true;
      currentVid._rescueAttempts = (currentVid._rescueAttempts || 0) + 1;
      showToast('🎵 Bài hát bị giới hạn nhúng, rạp đang tự động tìm bản âm thanh/bản nhạc thay thế chuẩn YouTube...');
      try {
        const alt = await findPlayableAlternative(currentVid.title, failedVidId);
        if (alt && alt.videoId && alt.videoId !== failedVidId) {
          failedVideoIds.add(failedVidId);
          failedVideoIds.delete(alt.videoId);
          showToast(`✨ Đã tự động đổi sang bản nhạc khả dụng: "${alt.title || currentVid.title}"!`);
          appendSystemChat(`🔄 Tự động chuyển sang bản nhạc thay thế khả dụng trên YouTube: "${alt.title || currentVid.title}" (do bản gốc giới hạn nhúng)`);
          currentVid.originalVideoId = failedVidId;
          currentVid.videoId = alt.videoId;
          if (alt.title) currentVid.title = alt.title;
          if (alt.channel) currentVid.channel = alt.channel;
          isAutoRescuingSong = false;
          playCinemaVideo(currentVid, 0, true);
          return;
        }
      } catch (_) {}
      isAutoRescuingSong = false;
    }

    if (failedVideoIds.has(failedVidId)) {
      return; // Already handled this failed video
    }
    failedVideoIds.add(failedVidId);

    // 1. Halt playback on player ONLY IF this failed video is currently playing
    if (ytPlayer && state.currentVideo && state.currentVideo.videoId === failedVidId) {
      try {
        if (typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
        else if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
      } catch (_) {}
    }

    // 2. Xoá bài này khỏi hàng đợi (giữ nguyên tất cả các bài hợp lệ khác trong queue)
    state.queue = (state.queue || []).filter(
      (item) => item.videoId !== failedVidId && (!currentVid.id || item.id !== currentVid.id)
    );
    state.skipVotes.clear();
    renderQueue();
    updateSkipVoteUI();
    updateNextPlayingUI();

    // 3. Broadcast sync to all clients in the room to purge this video from queue
    broadcastSync({
      type: 'UNAVAILABLE_VIDEO_PURGE',
      videoId: failedVidId,
      queue: state.queue
    });

    // 4. CHỈ chuyển bài hoặc xoá màn chiếu NẾU video bị lỗi CHÍNH LÀ VIDEO ĐANG CHIẾU TRÊN MÀN HÌNH:
    if (state.currentVideo && state.currentVideo.videoId === failedVidId) {
      if (state.queue && state.queue.length > 0) {
        playNextFromQueue('Bỏ qua video không thể xem (Unavailable)');
      } else {
        clearCinemaScreen();
      }
    }

    // 5. Màn hình cảnh báo pop-up SẼ CHỈ XUẤT HIỆN VỚI NGƯỜI GỬI LINK
    const isSender = isMySubmittedVideo(currentVid);

    if (isSender) {
      isShowingUnavailableModal = true;
      if (currentVid.isAgeRestricted) {
        showAgeRestrictedVideoPopup(
          currentVid.title || `Video #${failedVidId}`,
          'Video này bị giới hạn độ tuổi (18+) và yêu cầu đăng nhập tài khoản YouTube để xác nhận độ tuổi. Rạp chiếu phim không được phép chiếu video này.',
          () => {
            isShowingUnavailableModal = false;
          }
        );
      } else {
        let errText = 'Chủ sở hữu video hoặc YouTube không cho phép phát video này trên website bên ngoài (Chặn nhúng bản quyền hoặc giới hạn khu vực).';
        if (errCode === 100) {
          errText = 'Video đã bị tác giả xóa, chuyển sang chế độ riêng tư hoặc liên kết không tồn tại trên YouTube.';
        } else if (errCode === 2) {
          errText = 'Đường link hoặc ID video YouTube này không đúng định dạng.';
        } else if (errCode === 5) {
          errText = 'Không thể phát nội dung này trong trình phát HTML5 của trình duyệt.';
        }

        showUnavailableVideoPopup(
          currentVid.title || `Video #${failedVidId}`,
          errText,
          () => {
            isShowingUnavailableModal = false;
          }
        );
      }
    } else {
      // Với những khán giả khác: Không hiện pop-up làm gián đoạn, chỉ hiện thông báo toast nhẹ nhàng
      showToast(`⚠️ Video "${currentVid.title || 'này'}" bị hạn chế bản quyền/không thể xem nên hệ thống đã tự động gỡ khỏi rạp.`);
    }
  }

  async function findPlayableAlternative(title, failedId) {
    if (!title) return null;
    const cleanTitle = title
      .replace(/^Video YouTube #[a-zA-Z0-9_-]{11}$/i, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .trim() || title;

    // 1. Try server search-alt endpoint (powered by authentic YouTube InnerTube API)
    try {
      const resp = await fetch(`/api/search-alt?q=${encodeURIComponent(cleanTitle)}&exclude=${encodeURIComponent(failedId)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          for (const cand of data.items) {
            if (cand.videoId && cand.videoId !== failedId && !failedVideoIds.has(cand.videoId)) {
              return {
                videoId: cand.videoId,
                title: cand.title || cleanTitle,
                channel: cand.channel || 'Bản YouTube thay thế'
              };
            }
          }
        }
        if (Array.isArray(data.videoIds)) {
          for (const candId of data.videoIds) {
            if (candId !== failedId && !failedVideoIds.has(candId)) {
              return { videoId: candId, title: cleanTitle, channel: 'Bản YouTube thay thế' };
            }
          }
        }
      }
    } catch (e) {}

    // 2. Curated database of problem tracks (Edgerunners, Anime OSTs, VEVO hits)
    const KNOWN_PAIRS = [
      { match: ['rusty dream', 'edgerunners'], id: 'QNbWyGX4_vE', title: 'Dead as Disco - A Rusty Dream' },
      { match: ['stay at your house', 'edgerunners'], id: '9B0yX0UIN9M', title: 'I Really Want to Stay at Your House' },
      { match: ['edgerunners'], id: '9B0yX0UIN9M', title: 'Cyberpunk Edgerunners Theme' }
    ];

    const low = cleanTitle.toLowerCase();
    for (const pair of KNOWN_PAIRS) {
      if (pair.match.every((m) => low.includes(m)) && pair.id !== failedId && !failedVideoIds.has(pair.id)) {
        return { videoId: pair.id, title: pair.title, channel: pair.title };
      }
    }

    // 3. Public search gateways
    const publicGateways = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle + ' audio')}`)}`
    ];

    for (const gw of publicGateways) {
      try {
        const r = await fetch(gw, { signal: AbortSignal.timeout(3500) });
        if (r.ok) {
          const text = await r.text();
          const matches = [...text.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
          const unique = [...new Set(matches)].filter((id) => id !== failedId && !failedVideoIds.has(id));
          if (unique.length > 0) {
            return { videoId: unique[0], title: cleanTitle, channel: 'Bản YouTube thay thế' };
          }
        }
      } catch (err) {}
    }

    return null;
  }

  // =========================================================================
  // IN-PAGE CINEMA IFRAME WINDOW (Direct In-Web Theater Window - No Popup)
  // =========================================================================
  function openInPageCinemaWindow(videoId, title) {
    if (!videoId) return null;

    let winEl = document.getElementById('inPageCinemaWindow');
    if (winEl) {
      // If window already open, simply update its contents
      const ifr = document.getElementById('inPageCinemaIframe');
      const titleEl = document.getElementById('inPageCinemaTitle');
      if (ifr) ifr.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`;
      if (titleEl) titleEl.textContent = title || 'Rạp phim trong web';
      winEl.style.display = 'flex';
      return winEl;
    }

    winEl = document.createElement('div');
    winEl.className = 'inpage-cinema-window';
    winEl.id = 'inPageCinemaWindow';
    winEl.innerHTML = `
      <div class="inpage-cinema-header" id="inPageCinemaHeader">
        <div class="inpage-cinema-drag-handle">
          <span class="inpage-cinema-icon">🎬</span>
          <div class="inpage-cinema-title-wrap">
            <span class="inpage-cinema-badge">CỬA SỔ RẠP TRONG WEB</span>
            <span class="inpage-cinema-title" id="inPageCinemaTitle">${escapeHtml(title || 'Rạp phim trong web')}</span>
          </div>
        </div>
        <div class="inpage-cinema-actions">
          <button class="inpage-win-btn" id="btnInPageCinemaMountScreen" type="button" title="Chiếu thẳng lên màn hình lớn rạp 3D">
            <span>🖥️ Chiếu màn chính</span>
          </button>
          <button class="inpage-win-btn" id="btnInPageCinemaToggleSize" type="button" title="Thu nhỏ góc (PiP) / Mở rộng">
            <span id="inPageCinemaSizeIcon">🗗</span>
          </button>
          <button class="inpage-win-btn close" id="btnInPageCinemaClose" type="button" title="Đóng cửa sổ">
            <span>✕</span>
          </button>
        </div>
      </div>
      <div class="inpage-cinema-body">
        <iframe
          id="inPageCinemaIframe"
          src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
      <div class="inpage-cinema-footer">
        <span class="inpage-cinema-hint">💡 Kéo thanh tiêu đề để di chuyển • Bạn vẫn có thể xem rạp 3D, chat và tương tác bình thường</span>
      </div>
    `;

    document.body.appendChild(winEl);

    // Draggable header
    const headerEl = winEl.querySelector('#inPageCinemaHeader');
    if (headerEl) {
      makeInPageWindowDraggable(winEl, headerEl);
    }

    // Mount to main screen
    document.getElementById('btnInPageCinemaMountScreen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      createFallbackIframe(videoId);
      closeInPageCinemaWindow();
      showToast('🖥️ Đã chuyển phát Iframe trực tiếp lên màn hình rạp 3D chính!');
    });

    // Toggle PiP / Normal Size
    document.getElementById('btnInPageCinemaToggleSize')?.addEventListener('click', (e) => {
      e.stopPropagation();
      winEl.classList.toggle('is-pip');
      const icon = document.getElementById('inPageCinemaSizeIcon');
      if (icon) {
        icon.textContent = winEl.classList.contains('is-pip') ? '🗖' : '🗗';
      }
    });

    // Close button
    document.getElementById('btnInPageCinemaClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeInPageCinemaWindow();
      showToast('Đã đóng cửa sổ rạp trong web');
    });

    return winEl;
  }

  function closeInPageCinemaWindow() {
    const win = document.getElementById('inPageCinemaWindow');
    if (win) win.remove();
  }

  function makeInPageWindowDraggable(winEl, handleEl) {
    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    handleEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      handleEl.setPointerCapture(e.pointerId);
      const rect = winEl.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;
      winEl.style.transform = 'none';
      winEl.style.left = `${initialLeft}px`;
      winEl.style.top = `${initialTop}px`;
      winEl.style.bottom = 'auto';
      winEl.style.right = 'auto';
    });

    handleEl.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - winEl.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - winEl.offsetHeight - 10, initialTop + dy));
      winEl.style.left = `${newLeft}px`;
      winEl.style.top = `${newTop}px`;
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { handleEl.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    handleEl.addEventListener('pointerup', stopDrag);
    handleEl.addEventListener('pointercancel', stopDrag);
  }

  // =========================================================================
  // UNAVAILABLE VIDEO WARNING POPUP NOTIFICATION (Warning & Confirm)
  // =========================================================================
  // UNAVAILABLE & AGE RESTRICTED VIDEO WARNING POPUP NOTIFICATIONS
  // =========================================================================
  let unavailableConfirmCallback = null;

  function showAgeRestrictedVideoPopup(videoTitle, reasonMessage, onConfirm) {
    const modal = document.getElementById('unavailableVideoModal');
    const iconEl = document.getElementById('uvModalIcon');
    const titleEl = document.getElementById('uvModalTitle');
    const msgEl = document.getElementById('uvModalMessage');
    const btnEl = document.getElementById('btnConfirmUnavailableVideo');
    if (!modal) return;

    unavailableConfirmCallback = onConfirm || null;
    isShowingUnavailableModal = true;

    if (iconEl) iconEl.textContent = '🔞';
    if (titleEl) {
      titleEl.textContent = 'Video Giới Hạn Độ Tuổi (18+)';
      titleEl.style.color = '#EF4444';
    }
    if (btnEl) {
      btnEl.innerHTML = '✅ Đã Hiểu • Chọn Bài Khác';
      btnEl.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
    }

    if (msgEl) {
      const cleanTitle = videoTitle ? `"${escapeHtml(videoTitle)}"` : 'này';
      msgEl.innerHTML = `
        Video <strong>${cleanTitle}</strong> là video <strong>giới hạn độ tuổi (18+)</strong> và yêu cầu đăng nhập tài khoản YouTube để xác nhận độ tuổi.<br>
        Theo quy định của rạp chiếu phim, nội dung giới hạn độ tuổi <strong>không được phép trình chiếu</strong> trong phòng rạp.<br><br>
        <span style="color:#FCA5A5;font-weight:700;">⚠️ Video này không được phép chiếu trong rạp. Vui lòng chọn bài khác!</span>
      `;
    }

    modal.classList.add('open');
    if (sfx && typeof sfx.playSeatSwitch === 'function') {
      sfx.playSeatSwitch();
    }
  }

  function showUnavailableVideoPopup(videoTitle, reasonMessage, onConfirm) {
    const modal = document.getElementById('unavailableVideoModal');
    const iconEl = document.getElementById('uvModalIcon');
    const titleEl = document.getElementById('uvModalTitle');
    const msgEl = document.getElementById('uvModalMessage');
    const btnEl = document.getElementById('btnConfirmUnavailableVideo');
    if (!modal) return;

    unavailableConfirmCallback = onConfirm || null;
    isShowingUnavailableModal = true;

    if (iconEl) iconEl.textContent = '🚫';
    if (titleEl) {
      titleEl.textContent = 'Video Không Thể Xem (Unavailable)';
      titleEl.style.color = '#F87171';
    }
    if (btnEl) {
      btnEl.innerHTML = '✅ Đồng Ý';
      btnEl.style.background = '';
    }

    if (msgEl) {
      const cleanTitle = videoTitle ? `"${escapeHtml(videoTitle)}"` : 'này';
      msgEl.innerHTML = `
        Video <strong>${cleanTitle}</strong> hiện <strong>không thể xem được</strong> (Unavailable).<br>
        ${escapeHtml(reasonMessage || 'Do video đã bị xóa, bị giới hạn bản quyền hoặc đặt ở chế độ riêng tư trên YouTube.')}<br><br>
        <span style="color:#FCA5A5;font-weight:700;">⚠️ Video này không được phép xem trong rạp. Vui lòng bấm Đồng ý để tiếp tục.</span>
      `;
    }

    modal.classList.add('open');
    if (sfx && typeof sfx.playSeatSwitch === 'function') {
      sfx.playSeatSwitch();
    }
  }

  function hideUnavailableVideoPopup() {
    const modal = document.getElementById('unavailableVideoModal');
    if (modal) modal.classList.remove('open');
    isShowingUnavailableModal = false;
    if (typeof unavailableConfirmCallback === 'function') {
      const cb = unavailableConfirmCallback;
      unavailableConfirmCallback = null;
      cb();
    }
  }

  // =========================================================================
  // VIDEO DURATION LIMIT ENFORCER (MAX 8 MINUTES / 480 SECONDS)
  // =========================================================================
  const MAX_VIDEO_DURATION_SECONDS = 480; // 8 minutes limit

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const totalSec = Math.round(seconds);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  let videoLimitConfirmCallback = null;
  let isShowingVideoLimitModal = false;

  function showVideoLimitPopup(videoTitle, durationSeconds, onConfirm) {
    const modal = document.getElementById('videoLimitModal');
    const msgEl = document.getElementById('vlModalMessage');
    if (!modal) return;

    videoLimitConfirmCallback = onConfirm || null;
    isShowingVideoLimitModal = true;

    const cleanTitle = videoTitle ? `"${escapeHtml(videoTitle)}"` : 'Video này';
    const durationText = durationSeconds ? formatDuration(durationSeconds) : 'hơn 8 phút';

    if (msgEl) {
      msgEl.innerHTML = `
        Video <strong>${cleanTitle}</strong> có thời lượng <strong><span style="color:#FBBF24;">${durationText}</span></strong>.<br><br>
        <div style="background:rgba(245, 158, 11, 0.12);border:1px solid rgba(245, 158, 11, 0.35);border-radius:10px;padding:12px 14px;text-align:left;font-size:0.875rem;line-height:1.5;color:#FDE68A;">
          ⏱️ <strong>Quy định rạp:</strong> Video trong rạp <strong>chỉ được dưới 8 phút</strong> (tối đa 08:00) để đảm bảo mọi khán giả đều có thể đề xuất bài và giữ không khí sôi động.
        </div>
        <br>
        <span style="color:#E2E8F0;font-weight:600;">👉 Video này không được phép chiếu. Vui lòng chọn một bài hát hoặc video khác ngắn hơn!</span>
      `;
    }

    modal.classList.add('open');
    if (sfx && typeof sfx.playSeatSwitch === 'function') {
      sfx.playSeatSwitch();
    }
  }

  function hideVideoLimitPopup() {
    const modal = document.getElementById('videoLimitModal');
    if (modal) modal.classList.remove('open');
    isShowingVideoLimitModal = false;
    if (typeof videoLimitConfirmCallback === 'function') {
      const cb = videoLimitConfirmCallback;
      videoLimitConfirmCallback = null;
      cb();
    }
  }

  let isEnforcingLimit = false;
  function enforceVideoLimit(dur) {
    if (isEnforcingLimit) return;
    isEnforcingLimit = true;
    const current = state.currentVideo;
    const title = current?.title || 'Video này';
    const videoId = current?.videoId;

    try {
      if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo();
      }
    } catch (_) {}
    state.isPlaying = false;
    updatePlayPauseButton();

    if (videoId) {
      state.queue = (state.queue || []).filter((q) => q.videoId !== videoId);
      renderQueue();
      saveLiveQueueToStorage();
    }

    showVideoLimitPopup(title, Math.round(dur), () => {
      isEnforcingLimit = false;
      playNextFromQueue('Đã bỏ qua video vượt quá giới hạn 8 phút');
    });
  }

  function probeYouTubePlayability(videoId) {
    return new Promise((resolve) => {
      if (!videoId) {
        return resolve({ playable: false, errorCode: 2, reason: 'ID video YouTube không hợp lệ.' });
      }
      if (!window.YT || typeof window.YT.Player !== 'function') {
        return resolve({ playable: true, duration: null, errorCode: null });
      }

      let probeDiv = document.getElementById('ytDurationProbeContainer');
      if (!probeDiv) {
        probeDiv = document.createElement('div');
        probeDiv.id = 'ytDurationProbeContainer';
        probeDiv.style.cssText = 'position:fixed;width:240px;height:160px;left:-9999px;top:-9999px;opacity:0.01;pointer-events:none;z-index:-999;';
        document.body.appendChild(probeDiv);
      }
      // Clean up any stale probe iframes before creating a new one
      probeDiv.innerHTML = '';

      const probeTargetId = 'probe_yt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const targetDiv = document.createElement('div');
      targetDiv.id = probeTargetId;
      probeDiv.appendChild(targetDiv);

      let settled = false;
      let probePlayerInstance = null;
      let safetyTimer = null;

      function getReasonForErrorCode(errCode) {
        if (errCode === 100) {
          return 'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable).';
        }
        if (errCode === 2) {
          return 'Đường link hoặc ID video YouTube này không đúng định dạng.';
        }
        return 'Video này hiện không thể phát được trong rạp chiếu do hạn chế từ YouTube.';
      }

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        try {
          if (probePlayerInstance && typeof probePlayerInstance.destroy === 'function') {
            probePlayerInstance.destroy();
          }
        } catch (_) {}
        try {
          const actualIfr = document.getElementById(probeTargetId);
          if (actualIfr) actualIfr.remove();
        } catch (_) {}
        if (probeDiv) {
          try { probeDiv.innerHTML = ''; } catch (_) {}
        }
      };

      // Safety timeout: If by 1500ms no error occurred, assume playable
      safetyTimer = setTimeout(() => {
        if (settled) return;
        let dur = null;
        try {
          if (probePlayerInstance && typeof probePlayerInstance.getDuration === 'function') {
            dur = probePlayerInstance.getDuration();
          }
        } catch (_) {}
        cleanup();
        resolve({ playable: true, duration: (dur && dur > 0) ? dur : null, errorCode: null });
      }, 1500);

      try {
        probePlayerInstance = new window.YT.Player(probeTargetId, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            widget_referrer: 'https://www.youtube.com/'
          },
          events: {
            onReady: (e) => {
              if (settled) return;
              try {
                const dur = e.target.getDuration ? e.target.getDuration() : 0;
                cleanup();
                return resolve({ playable: true, duration: dur > 0 ? dur : null, errorCode: null });
              } catch (_) {
                cleanup();
                return resolve({ playable: true, duration: null, errorCode: null });
              }
            },
            onError: (e) => {
              if (settled) return;
              const errCode = (e && typeof e.data === 'number') ? e.data : 150;
              // Code 100: video not found, deleted, or private. Code 2: invalid syntax.
              if (errCode === 100 || errCode === 2) {
                const reason = getReasonForErrorCode(errCode);
                cleanup();
                return resolve({ playable: false, errorCode: errCode, reason });
              }
              cleanup();
              return resolve({ playable: true, errorCode: errCode });
            }
          }
        });
      } catch (_) {
        cleanup();
        resolve({ playable: true, duration: null, errorCode: null });
      }
    });
  }

  function showVideoRescueCard(currentVid, errCode) {
    hideVideoRescueCard();
    const overlay = document.getElementById('screenInteractiveOverlay');
    if (!overlay) return;

    const rescueDiv = document.createElement('div');
    rescueDiv.className = 'video-rescue-backdrop';
    rescueDiv.id = 'videoRescueBackdrop';
    rescueDiv.innerHTML = `
      <div class="video-rescue-card">
        <div class="vrc-icon">🛡️</div>
        <div class="vrc-title">Bản quyền YouTube giới hạn phát nhúng</div>
        <div class="vrc-desc">
          Bài hát <strong>${escapeHtml(currentVid.title)}</strong> bị YouTube hạn chế phát API mặc định (Mã lỗi ${errCode || '150/153'}).
        </div>
        <div class="vrc-actions">
          <button class="vrc-btn primary" id="btnRescueInPageWindow" type="button">
            🎬 Mở Cửa Sổ Rạp Iframe Trong Web
          </button>
          <button class="vrc-btn secondary" id="btnRescueMountScreen" type="button">
            🖥️ Chiếu Iframe Trực Tiếp Lên Màn Rạp 3D
          </button>
          <button class="vrc-btn secondary" id="btnRescueTryAlt" type="button">
            🔄 Tìm Bản Audio Khác Cùng Bài Hát
          </button>
          <button class="vrc-btn text-btn" id="btnRescueSkip" type="button">
            ⏭️ Bỏ qua và chuyển sang bài tiếp theo
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(rescueDiv);

    document.getElementById('btnRescueInPageWindow')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideVideoRescueCard();
      openInPageCinemaWindow(currentVid.videoId, currentVid.title);
      showToast('🎬 Đã mở cửa sổ rạp iframe trực tiếp trong web! Không mở thêm tab mới.');
    });

    document.getElementById('btnRescueMountScreen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideVideoRescueCard();
      createFallbackIframe(currentVid.videoId);
      showToast('🖥️ Đã chiếu Iframe trực tiếp lên màn hình lớn của rạp 3D!');
    });

    document.getElementById('btnRescueTryAlt')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      showToast('🔍 Đang tìm kiếm thêm các bản phát audio khác...');
      const alt = await findPlayableAlternative(currentVid.title + ' audio', currentVid.videoId);
      if (alt) {
        hideVideoRescueCard();
        loadAndPlayVideo({ videoId: alt.videoId, title: currentVid.title, channel: alt.channel, startedBy: currentVid.startedBy }, true);
      } else {
        showToast('⚠️ Hãy dùng nút "Mở Cửa Sổ Rạp Iframe Trong Web" để xem ngay!');
      }
    });

    document.getElementById('btnRescueSkip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideVideoRescueCard();
      playNextFromQueue('Bỏ qua video bị hạn chế');
    });
  }

  function hideVideoRescueCard() {
    const existing = document.getElementById('videoRescueBackdrop');
    if (existing) {
      if (typeof existing.remove === 'function') {
        existing.remove();
      } else if (existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }
  }

  // =========================================================================
  // 7.1 AUTO SKIP ADS ENGINE (Real-Time Detection, Speed-Burst & Ad Bypass)
  // =========================================================================
  let adSkipLoopTimer = null;
  let adDetectionStartTime = 0;

  function updateAutoSkipAdsUI() {
    const btn = document.getElementById('btnToggleAutoSkipAds');
    const icon = document.getElementById('adSkipBtnIcon');
    const check = document.getElementById('checkModalAutoSkipAds');
    if (btn) btn.classList.toggle('active', !!state.autoSkipAds);
    if (icon) {
      icon.textContent = state.autoSkipAds
        ? (state.skippedAdsCount > 0 ? `🛡️ Đã chặn ${state.skippedAdsCount} QC` : '🛡️ Bỏ qua QC: BẬT')
        : '🛡️ Bỏ qua QC: TẮT';
    }
    if (check) check.checked = !!state.autoSkipAds;
  }

  function getCinemaPlayerIframe() {
    return document.querySelector('#ytPlayerMount iframe');
  }

  function forceSkipAdNow() {
    const cinemaIframe = getCinemaPlayerIframe();
    if (cinemaIframe && cinemaIframe.contentWindow) {
      try {
        // Send official skipAd command to YouTube player inside the cinema iframe
        cinemaIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'skipAd', args: [] }), '*');
        // Set ad playback rate to 16x so unskippable ads fly by in < 1 second without disturbing the movie
        cinemaIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [16] }), '*');
      } catch (_) {}
    }

    if (ytReady && ytPlayer) {
      try {
        if (typeof ytPlayer.setPlaybackRate === 'function') ytPlayer.setPlaybackRate(16);
      } catch (_) {}
    }
  }

  function startAutoAdSkipperEngine() {
    // 1. Listen for YouTube player window message events ONLY from the cinema iframe
    window.addEventListener('message', (e) => {
      if (!state.autoSkipAds) return;
      try {
        const cinemaIframe = getCinemaPlayerIframe();
        if (!cinemaIframe || e.source !== cinemaIframe.contentWindow) {
          return; // Strictly ignore all background probe players or external iframes
        }

        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;

        if (data.event === 'infoDelivery' && data.info) {
          const info = data.info;
          // Genuine YouTube ad flags: adState === 1 or isAdPlaying === true
          const isAdActive = info.adState === 1 || info.isAdPlaying === true;
          if (isAdActive) {
            handleAdDetected();
          } else if (state.isAdPlaying && (info.adState === 0 || info.isAdPlaying === false)) {
            handleAdEnded();
          }
        }
      } catch (_) {}
    });

    // 2. Watcher loop for player state (runs every 300ms)
    if (adSkipLoopTimer) clearInterval(adSkipLoopTimer);
    adSkipLoopTimer = setInterval(() => {
      if (!state.autoSkipAds || !ytReady || !ytPlayer || !state.isPlaying) {
        if (state.isAdPlaying) handleAdEnded();
        return;
      }

      let isAd = false;
      try {
        if (typeof ytPlayer.getAdState === 'function') {
          isAd = ytPlayer.getAdState() === 1;
        }
      } catch (_) {}

      if (isAd) {
        handleAdDetected();
      } else if (state.isAdPlaying) {
        handleAdEnded();
      }
    }, 300);
  }

  function handleAdDetected() {
    const indicator = document.getElementById('adSkipIndicator');
    if (indicator) indicator.classList.add('show');

    if (!state.isAdPlaying) {
      state.isAdPlaying = true;
      adDetectionStartTime = Date.now();
      state.preAdVolume = state.volume || 25;
      state.preAdRate = (state.playbackRate && state.playbackRate > 0) ? state.playbackRate : 1;

      // Mute audio while ad is skipping
      try {
        ytPlayer?.mute();
      } catch (_) {}
    }

    // Accelerate ad to 16x and trigger skipAd (NEVER seek to end of movie)
    forceSkipAdNow();
  }

  function handleAdEnded() {
    if (!state.isAdPlaying) return;
    state.isAdPlaying = false;
    const indicator = document.getElementById('adSkipIndicator');
    if (indicator) indicator.classList.remove('show');

    // Restore volume and playback rate
    try {
      if (ytPlayer) {
        ytPlayer.setVolume(state.volume);
        if (!state.isMuted) ytPlayer.unMute();
        if (typeof ytPlayer.setPlaybackRate === 'function') {
          ytPlayer.setPlaybackRate(state.preAdRate || state.playbackRate || 1);
        }
      }
    } catch (_) {}

    state.skippedAdsCount = (state.skippedAdsCount || 0) + 1;
    updateAutoSkipAdsUI();
    showToast(`🛡️ Đã tự động bỏ qua quảng cáo! (Đã chặn: ${state.skippedAdsCount} QC)`, 3200);
  }

  function handleVideoEnd() {
    if (state.isHandlingVideoEnd) return;
    state.isHandlingVideoEnd = true;
    setTimeout(() => {
      state.isHandlingVideoEnd = false;
    }, 2000);

    if (state.queue && state.queue.length > 0) {
      playNextFromQueue('Video đã kết thúc');
    } else {
      showToast('🎬 Đã phát xong video! Hàng đợi hiện đang trống.');
      state.skipVotes.clear();
      updateSkipVoteUI();
      clearCinemaScreen();
      renderQueue();
      saveLiveQueueToStorage();
      broadcastSync({
        type: 'QUEUE_ADVANCE',
        nextVideo: null,
        currentVideo: null,
        queue: [],
        reason: 'Đã phát xong video! Hàng đợi hiện đang trống'
      });
    }
  }

  function loadAndPlayVideo(videoObj, broadcast = true, startSeconds = 0) {
    if (!videoObj || !videoObj.videoId) return;

    if (!ytReady) {
      pendingVideoToLoad = { ...videoObj, startSeconds };
    }

    // Save current video to history
    if (state.currentVideo && state.currentVideo.videoId && state.currentVideo.videoId !== videoObj.videoId) {
      state.history.unshift({ ...state.currentVideo, playedAt: getCurrentTimeStr() });
      if (state.history.length > 20) state.history.pop();
    }

    state.currentVideo = {
      id: videoObj.id || null,
      videoId: videoObj.videoId,
      title: videoObj.title,
      channel: videoObj.channel || 'YouTube Cinema',
      startedBy: videoObj.startedBy || videoObj.addedBy || state.me.name,
      addedBy: videoObj.addedBy || videoObj.startedBy || state.me.name,
      addedByUserId: videoObj.addedByUserId || videoObj.startedByUserId || (broadcast ? state.me.id : null),
      addedByClientId: videoObj.addedByClientId || videoObj.startedByClientId || (broadcast ? state.clientId : null),
      startedByUserId: videoObj.startedByUserId || (broadcast ? state.me.id : null),
      startedByClientId: videoObj.startedByClientId || (broadcast ? state.clientId : null),
      ambilight: videoObj.ambilight || randomAmbilightPair()
    };
    state.skipVotes.clear();
    updateSkipVoteUI();
    updateNextPlayingUI();

    const titleEl = document.getElementById('hudVideoTitle');
    const metaEl = document.getElementById('hudVideoMeta');
    const screenTitleEl = document.getElementById('screenTopTitle');
    if (titleEl) titleEl.textContent = state.currentVideo.title;
    if (screenTitleEl) screenTitleEl.textContent = state.currentVideo.title;
    if (typeof updateScrubberUI === 'function') updateScrubberUI(startSeconds || 0, 0, 0);
    hideVideoRescueCard();
    if (metaEl) {
      metaEl.textContent = `${state.currentVideo.channel} • Chọn bởi ${state.currentVideo.startedBy}`;
    }

    updateAmbilightColors(state.currentVideo.ambilight);

    // Keep in-page cinema iframe synced if currently open
    const inPageIframe = document.getElementById('inPageCinemaIframe');
    const inPageTitle = document.getElementById('inPageCinemaTitle');
    if (inPageIframe && state.currentVideo && state.currentVideo.videoId) {
      const startParam = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : '';
      const ccParam = state.subtitlesEnabled ? '&cc_load_policy=1&cc_lang_pref=vi' : '&cc_load_policy=0';
      inPageIframe.src = `https://www.youtube.com/embed/${state.currentVideo.videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1${ccParam}${startParam}`;
      if (inPageTitle) inPageTitle.textContent = state.currentVideo.title || 'Đang chiếu';
    }

    const mount = document.getElementById('ytPlayerMount');
    const hasPlaceholder = mount && mount.querySelector('.cinema-empty-screen-placeholder');
    const iframe = (ytPlayer && typeof ytPlayer.getIframe === 'function') ? ytPlayer.getIframe() : null;
    const isPlayerAlive = ytReady && ytPlayer && iframe && iframe.isConnected && !hasPlaceholder;

    if (isPlayerAlive && typeof ytPlayer.loadVideoById === 'function') {
      try {
        if (startSeconds > 0) {
          ytPlayer.loadVideoById({
            videoId: state.currentVideo.videoId,
            startSeconds: Math.floor(startSeconds)
          });
        } else {
          ytPlayer.loadVideoById(state.currentVideo.videoId);
        }
        ytPlayer.setVolume(state.volume);
      } catch (e) {
        createFallbackIframe(state.currentVideo.videoId, startSeconds);
      }
    } else {
      createFallbackIframe(state.currentVideo.videoId, startSeconds);
    }

    if (startSeconds > 2) {
      setTimeout(() => {
        if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
          try {
            const cur = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
            if (Math.abs(cur - startSeconds) > 3) {
              ytPlayer.seekTo(startSeconds, true);
            }
          } catch (e) {}
        }
      }, 1200);
    }

    clearTimeout(videoLoadWatchdogTimer);

    appendSystemChat(`🎬 Đang chiếu: "${state.currentVideo.title}" (Đề xuất bởi ${state.currentVideo.startedBy})`);

    if (broadcast) {
      broadcastSync({ type: 'LOAD_VIDEO', video: state.currentVideo, currentTime: startSeconds || 0 });
    }
  }

  let lastAmbilightPair = '';
  function updateAmbilightColors(colors) {
    const [c1, c2] = colors || ['#3B82F6', '#8B5CF6'];
    const key = `${c1}-${c2}`;
    if (lastAmbilightPair === key) return;
    lastAmbilightPair = key;
    document.documentElement.style.setProperty('--ambilight-1', c1);
    document.documentElement.style.setProperty('--ambilight-2', c2);
  }

  function randomAmbilightPair() {
    const c1 = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const c2 = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    return [c1, c2];
  }

  // Playback Lock Guard (Locked when 2 or more viewers are in the theater AND a video is actively playing)
  function isPlaybackLocked() {
    const hasActiveVideo = !!(state.currentVideo && state.currentVideo.videoId);
    return hasActiveVideo && Object.keys(getOccupantMap()).length >= 2;
  }

  function notifyPlaybackLocked() {
    const count = Object.keys(getOccupantMap()).length;
    showToast(`👥 Rạp hiện có ${count} người cùng xem. Chỉ được chỉnh âm lượng cá nhân, các chức năng phát/tạm dừng/tua/chuyển bài chung đã bị khóa!`);
    showRippleBadge('🔒', 'Đã khóa điều khiển (≥ 2 người)', 'center');
    if (sfx && typeof sfx.playReactionPop === 'function') sfx.playReactionPop();
  }

  function updatePlayPauseButton() {
    const btn = document.getElementById('btnPlayPause');
    const screenPlayIcon = document.getElementById('screenPlayIcon');
    const overlay = document.getElementById('screenInteractiveOverlay');
    const totalOccupants = Object.keys(getOccupantMap()).length;
    const locked = isPlaybackLocked();

    const lockableElements = [
      document.getElementById('btnPlayPause'),
      document.getElementById('btnScreenPlayPause'),
      document.getElementById('btnScreenRewind10'),
      document.getElementById('btnScreenForward10'),
      document.getElementById('btnScreenNextVideo'),
      document.getElementById('btnScreenSpeed'),
      document.getElementById('screenCenterPlayBtn'),
      document.getElementById('ytScrubberContainer')
    ];
    lockableElements.forEach((el) => {
      if (el) {
        el.classList.toggle('is-playback-locked', locked);
        if (locked) {
          el.title = `🔒 Rạp đang có ${totalOccupants} người cùng xem. Các chức năng điều khiển chung đã bị khóa (chỉ được chỉnh âm lượng).`;
        }
      }
    });

    if (btn) {
      if (state.isPlaying) {
        if (locked) {
          btn.innerHTML = '🔒 Đang chiếu (Khóa dừng)';
          btn.classList.add('disabled-pause');
        } else {
          btn.innerHTML = '⏸️ Tạm dừng';
          btn.classList.remove('disabled-pause');
        }
      } else {
        btn.innerHTML = '▶️ Phát tiếp';
        btn.classList.remove('disabled-pause');
      }
    }
    if (screenPlayIcon) {
      if (locked) {
        screenPlayIcon.textContent = '🔒';
      } else {
        screenPlayIcon.textContent = state.isPlaying ? '⏸️' : '▶️';
      }
    }
    if (overlay) {
      overlay.classList.toggle('is-paused', !state.isPlaying);
    }
  }

  function updateNextPlayingUI() {
    const nextCard = document.getElementById('hudNextPlayingCard');
    const titleEl = document.getElementById('hudNextVideoTitle');
    const metaEl = document.getElementById('hudNextVideoMeta');
    if (!titleEl || !metaEl) return;

    if (state.queue && state.queue.length > 0) {
      const nextVid = state.queue[0];
      titleEl.textContent = nextVid.title || 'Bài tiếp theo';
      metaEl.textContent = `${nextVid.channel || 'YouTube'} • Đề cử bởi ${nextVid.addedBy || 'Khán giả'} (${nextVid.votes || 0} vote)`;
      if (nextCard) nextCard.classList.remove('is-empty');
    } else {
      titleEl.textContent = 'Hàng đợi đang trống';
      metaEl.textContent = 'Chưa có bài tiếp theo • Hãy thêm video để nối tiếp hàng đợi!';
      if (nextCard) nextCard.classList.add('is-empty');
    }
  }

  // =========================================================================
  // 8. ROBUST YOUTUBE URL PARSER & VOTING QUEUE
  // =========================================================================
  function extractYouTubeId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : 'https://' + trimmed);
      if (url.hostname.includes('youtu.be')) {
        const id = url.pathname.slice(1).split('/')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const parts = url.pathname.split('/');
      const tagIdx = parts.findIndex((p) => ['shorts', 'live', 'embed', 'v'].includes(p));
      if (tagIdx !== -1 && parts[tagIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[tagIdx + 1])) {
        return parts[tagIdx + 1];
      }
    } catch (e) {}

    const match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
  }

  async function fetchYouTubeMetadata(videoId) {
    let title = null;
    let channel = null;
    let lengthSeconds = null;
    let isLive = false;

    // 0. Try local server video-info API first (returns exact lengthSeconds, title, isLive, availability, age restriction)
    try {
      const sResp = await fetch(`/api/video-info?id=${encodeURIComponent(videoId)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (sResp.ok) {
        const sData = await sResp.json();
        if (sData) {
          if (sData.available === false || sData.isAgeRestricted === true) {
            return {
              title: sData.title || null,
              channel: sData.channel || null,
              lengthSeconds: sData.lengthSeconds || null,
              available: false,
              isAgeRestricted: !!sData.isAgeRestricted,
              reason: sData.reason || (sData.isAgeRestricted ? 'Video này bị giới hạn độ tuổi (18+) và yêu cầu đăng nhập xác nhận tuổi trên YouTube.' : 'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable).')
            };
          }
          if (sData.title) title = sData.title;
          if (sData.lengthSeconds !== null && sData.lengthSeconds !== undefined) {
            lengthSeconds = sData.lengthSeconds;
          }
          if (sData.isLive) isLive = !!sData.isLive;
          if (title && lengthSeconds !== null) {
            return {
              title,
              channel: sData.channel || 'YouTube Creator',
              lengthSeconds,
              isLive,
              available: true,
              isAgeRestricted: false
            };
          }
        }
      }
    } catch (_) {}

    // 1. Try official YouTube oEmbed API
    try {
      const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (resp.status === 404 || resp.status === 401 || resp.status === 400) {
        return {
          title: null,
          channel: null,
          lengthSeconds: null,
          available: false,
          reason: 'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable).'
        };
      }
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.title) {
          return {
            title: data.title,
            channel: data.author_name || 'YouTube Creator',
            lengthSeconds: lengthSeconds,
            isLive: isLive,
            available: true
          };
        }
      }
    } catch (err) {}

    // 2. Fallback to NoEmbed
    try {
      const resp2 = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      if (resp2.ok) {
        const data2 = await resp2.json();
        if (data2 && data2.title) {
          return {
            title: data2.title,
            channel: data2.author_name || 'YouTube Creator',
            lengthSeconds: lengthSeconds,
            isLive: isLive,
            available: true
          };
        }
        if (data2 && data2.error) {
          return {
            title: null,
            channel: null,
            lengthSeconds: null,
            available: false,
            reason: 'Link video YouTube này không tồn tại hoặc không thể phát.'
          };
        }
      }
    } catch (err2) {}

    return {
      title: title || `Video YouTube #${videoId}`,
      channel: channel || 'Khán giả đề xuất',
      lengthSeconds: lengthSeconds,
      isLive: isLive,
      available: true
    };
  }

  function sortQueue() {
    state.queue.sort((a, b) => b.votes - a.votes);
  }


  // =========================================================================
  // SOLO VIEWER MIXER QUEUE ENGINE (Recommendations based on currently playing song)
  // =========================================================================
  function saveMixerHistoryToStorage() {
    try {
      if (state.mixerHistoryVideoIds) {
        localStorage.setItem(
          'hanzu_mixer_history',
          JSON.stringify(Array.from(state.mixerHistoryVideoIds).slice(-300))
        );
      }
    } catch (_) {}
    updateMixerHistoryUI();
  }

  function updateMixerHistoryUI() {
    const btnReset = document.getElementById('btnResetMixerHistory');
    const countLabel = document.getElementById('smHistoryCountLabel');
    const toggle = document.getElementById('toggleMixerNoDuplicate');
    if (toggle) toggle.checked = !!state.mixerNoDuplicate;

    const count = state.mixerHistoryVideoIds ? state.mixerHistoryVideoIds.size : 0;
    if (btnReset && countLabel) {
      if (state.mixerNoDuplicate && count > 0) {
        countLabel.textContent = `(Đã nhớ ${count} bài • Xóa)`;
        btnReset.style.display = 'inline-block';
      } else {
        btnReset.style.display = 'none';
      }
    }
  }

  function updateMixerQueueVisibility() {
    const card = document.getElementById('soloMixerCard');
    if (!card) return;
    const totalOccupants = Object.keys(getOccupantMap()).length;
    const isSolo = totalOccupants <= 1;

    if (!isSolo) {
      card.style.display = 'none';
      const modal = document.getElementById('mixerPreviewModal');
      if (modal && modal.classList.contains('open')) {
        modal.classList.remove('open');
      }
      return;
    }

    card.style.display = 'block';
    updateMixerHistoryUI();

    const trackTitleEl = document.getElementById('soloMixerSourceTitle');
    const modalTrackEl = document.getElementById('modalMixerSourceSong');
    let title = '';
    if (state.currentVideo && state.currentVideo.videoId) {
      title = state.currentVideo.title || `Video #${state.currentVideo.videoId}`;
    } else if (state.queue && state.queue.length > 0) {
      title = `Hàng đợi: ${state.queue[0].title}`;
    } else {
      title = 'Chưa có bài đang chiếu (Sẽ gợi ý nhạc hot mở màn)';
    }

    if (trackTitleEl) trackTitleEl.textContent = title;
    if (modalTrackEl) modalTrackEl.textContent = title;
  }

  function getSoloMixerSource() {
    if (state.currentVideo && state.currentVideo.videoId) {
      return {
        videoId: state.currentVideo.videoId,
        title: state.currentVideo.title || ''
      };
    }
    if (state.queue && state.queue.length > 0) {
      return {
        videoId: state.queue[0].videoId,
        title: state.queue[0].title || ''
      };
    }
    return {
      videoId: 'Llw9Q6akRo4', // Sơn Tùng M-TP - Lạc Trôi as default high-vibe seed
      title: 'Sơn Tùng M-TP - Lạc Trôi'
    };
  }

  async function fetchMixerTracks(count = 5) {
    const src = getSoloMixerSource();
    const cleanCount = Math.min(50, Math.max(1, count));
    let results = [];

    const historyOffset = (state.mixerNoDuplicate && state.mixerHistoryVideoIds) ? state.mixerHistoryVideoIds.size : 0;
    const countToFetch = Math.min(50, cleanCount + Math.min(historyOffset, 20) + 5);

    // 1. Try server API /api/mixer-queue
    try {
      const resp = await fetch(`/api/mixer-queue?videoId=${encodeURIComponent(src.videoId)}&title=${encodeURIComponent(src.title)}&count=${countToFetch}`, {
        signal: AbortSignal.timeout(4800)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          results = data.items;
        }
      }
    } catch (_) {}

    // 2. Client-side fallback if server API is unavailable or static hosting
    if (results.length < cleanCount) {
      const FALLBACK_CANDIDATES = [
        { videoId: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channel: 'Luis Fonsi', lengthSeconds: 282, lengthText: '4:42' },
        { videoId: 'Pkh8UtuejGw', title: 'Shawn Mendes, Camila Cabello - Señorita', channel: 'Shawn Mendes', lengthSeconds: 206, lengthText: '3:26' },
        { videoId: 'k2qgadSvNyU', title: 'Dua Lipa - New Rules (Official Music Video)', channel: 'Dua Lipa', lengthSeconds: 225, lengthText: '3:45' },
        { videoId: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', channel: 'Ed Sheeran', lengthSeconds: 264, lengthText: '4:24' },
        { videoId: 'Llw9Q6akRo4', title: 'Sơn Tùng M-TP - Lạc Trôi', channel: 'Sơn Tùng M-TP Official', lengthSeconds: 273, lengthText: '4:33' },
        { videoId: 'FN7ALfpGxiI', title: 'Sơn Tùng M-TP - Nơi Này Có Anh', channel: 'Sơn Tùng M-TP Official', lengthSeconds: 279, lengthText: '4:39' },
        { videoId: 'dT2owtxkU8k', title: "Shawn Mendes - There's Nothing Holdin' Me Back", channel: 'Shawn Mendes', lengthSeconds: 238, lengthText: '3:58' },
        { videoId: '3AtDnEC4zak', title: "Charlie Puth - We Don't Talk Anymore", channel: 'Charlie Puth', lengthSeconds: 231, lengthText: '3:51' },
        { videoId: 'ioNng23DkIM', title: "BLACKPINK - 'How You Like That' M/V", channel: 'BLACKPINK', lengthSeconds: 184, lengthText: '3:04' },
        { videoId: '2S24-y0Ij3Y', title: "BLACKPINK - 'Kill This Love' M/V", channel: 'BLACKPINK', lengthSeconds: 194, lengthText: '3:14' },
        { videoId: 'qGRU3sRbaYw', title: 'Sơn Tùng M-TP - Chúng Ta Không Thuộc Về Nhau', channel: 'Sơn Tùng M-TP Official', lengthSeconds: 243, lengthText: '4:03' },
        { videoId: 'papuvlVeZg8', title: 'Clean Bandit - Rockabye (feat. Sean Paul & Anne-Marie)', channel: 'Clean Bandit', lengthSeconds: 254, lengthText: '4:14' }
      ];
      for (const cand of FALLBACK_CANDIDATES) {
        if (cand.videoId !== src.videoId && !results.some((r) => r.videoId === cand.videoId)) {
          results.push({
            ...cand,
            thumbUrl: `https://i.ytimg.com/vi/${cand.videoId}/mqdefault.jpg`
          });
        }
      }
    }

    // Filter out videos already in queue, current video, or duration > 8 minutes (480s)
    const existingQueueIds = new Set((state.queue || []).map((q) => q.videoId));
    if (state.currentVideo && state.currentVideo.videoId) {
      existingQueueIds.add(state.currentVideo.videoId);
    }

    const filtered = results.filter((item) => {
      if (!item || !item.videoId) return false;
      if (existingQueueIds.has(item.videoId)) return false;
      if (item.lengthSeconds && item.lengthSeconds > MAX_VIDEO_DURATION_SECONDS) return false;
      if (state.mixerNoDuplicate && state.mixerHistoryVideoIds && state.mixerHistoryVideoIds.has(item.videoId)) {
        return false;
      }
      return true;
    });

    return filtered.slice(0, cleanCount);
  }

  async function triggerAutoMixQueue(count = 5) {
    const btn = document.getElementById('btnMixerAddNow');
    const spinner = document.getElementById('smSpinner');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline';

    showToast(`🔀 Đang tìm ${count} bài mọi người hay nghe cùng...`);

    try {
      const tracks = await fetchMixerTracks(count);
      if (tracks.length === 0) {
        showToast('⚠️ Không tìm thêm được bài liên quan chưa có trong hàng đợi.');
        return;
      }
      await addMixedVideosToQueue(tracks);
    } catch (err) {
      showToast('⚠️ Lỗi khi trộn bài: ' + (err.message || 'Thử lại sau'));
    } finally {
      if (btn) btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  async function addMixedVideosToQueue(videos) {
    if (!Array.isArray(videos) || videos.length === 0) return;

    let addedCount = 0;
    const itemsToAdd = [];

    videos.forEach((v, idx) => {
      if (state.queue.some((q) => q.videoId === v.videoId)) return;
      if (v.lengthSeconds && v.lengthSeconds > MAX_VIDEO_DURATION_SECONDS) return;

      const newItem = {
        id: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + idx,
        videoId: v.videoId,
        title: v.title,
        channel: v.channel || 'YouTube Creator',
        addedBy: `🎧 Solo Mixer (${state.me.name})`,
        addedByUserId: state.me.id,
        addedByClientId: state.clientId,
        lengthSeconds: v.lengthSeconds || null,
        votes: 1,
        ambilight: randomAmbilightPair()
      };

      state.localVotedSongIds.add(newItem.id);
      state.queue.push(newItem);
      itemsToAdd.push(newItem);
      if (state.mixerHistoryVideoIds) {
        state.mixerHistoryVideoIds.add(v.videoId);
      }
      addedCount++;
    });

    if (addedCount > 0) {
      saveMixerHistoryToStorage();
      saveLiveQueueToStorage();
      renderQueue();
      showToast(`🎉 Đã tự động mix thêm ${addedCount} bài nghe cùng vào hàng đợi!`);
      showSeatSpeechBubble(state.me.seat, `Đã mix thêm ${addedCount} bài nghe cùng! 🎧`, 4200);
      if (sfx && typeof sfx.playChatPop === 'function') sfx.playChatPop();

      // Synchronize with server / peers
      broadcastSync({ type: 'ADD_QUEUE_BATCH', items: itemsToAdd });
      broadcastSync({ type: 'SYNC_QUEUE', queue: state.queue });

      // If screen is currently empty, play next song right away!
      const isScreenEmpty = !state.currentVideo || !state.currentVideo.videoId;
      if (isScreenEmpty) {
        playNextFromQueue('Chiếu ngay bài mở màn từ Solo Mixer');
      }
    } else {
      showToast('⚡ Các bài này đều đã có trong danh sách hàng đợi rồi.');
    }
  }

  // Mixer Preview Modal Logic
  async function openMixerPreviewModal() {
    const modal = document.getElementById('mixerPreviewModal');
    const listEl = document.getElementById('mixerSongsList');
    const countText = document.getElementById('mixerSelectedCountText');
    if (!modal || !listEl) return;

    modal.classList.add('open');
    updateMixerQueueVisibility();

    listEl.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.8rem;">
        ⏳ Đang tải những bài mọi người hay nghe cùng...
      </div>
    `;

    const countToLoad = Math.max(state.mixerCount || 5, 12);
    const tracks = await fetchMixerTracks(countToLoad);
    state.mixerRecommendations = tracks;

    if (tracks.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.8rem;">
          Đã có đủ các bài gợi ý trong danh sách hàng đợi rồi!
        </div>
      `;
      if (countText) countText.textContent = '0';
      return;
    }

    const defaultSelectCount = Math.min(state.mixerCount || 5, tracks.length);
    listEl.innerHTML = tracks
      .map((t, idx) => {
        const isChecked = idx < defaultSelectCount;
        const thumb = t.thumbUrl || `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`;
        return `
          <div class="mixer-song-item ${isChecked ? 'selected' : ''}" data-idx="${idx}">
            <input type="checkbox" class="mixer-checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''} />
            <div class="mixer-thumb-wrap">
              <img src="${thumb}" alt="${escapeHtml(t.title)}" loading="lazy" />
            </div>
            <div class="mixer-info-wrap">
              <div class="mixer-song-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
              <div class="mixer-song-channel">${escapeHtml(t.channel)}</div>
            </div>
            <span class="mixer-len-badge">${t.lengthText || '3:30'}</span>
          </div>
        `;
      })
      .join('');

    const updateSelectedSummary = () => {
      const checkedBoxes = listEl.querySelectorAll('.mixer-checkbox:checked');
      if (countText) countText.textContent = checkedBoxes.length;
    };
    updateSelectedSummary();

    listEl.querySelectorAll('.mixer-song-item').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() !== 'input') {
          const cb = itemEl.querySelector('.mixer-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            itemEl.classList.toggle('selected', cb.checked);
            updateSelectedSummary();
          }
        }
      });
      const cb = itemEl.querySelector('.mixer-checkbox');
      cb?.addEventListener('change', () => {
        itemEl.classList.toggle('selected', cb.checked);
        updateSelectedSummary();
      });
    });
  }

  function closeMixerPreviewModal() {
    const modal = document.getElementById('mixerPreviewModal');
    if (modal) modal.classList.remove('open');
  }

  function updateSoloQueueToolbar() {
    const toolbar = document.getElementById('soloQueueToolbar');
    const batchBar = document.getElementById('queueBatchBar');
    const btnSelect = document.getElementById('btnToggleQueueSelectMode');
    const countTitle = document.getElementById('sqQueueCountTitle');
    const mixerClearBtn = document.getElementById('btnMixerClearQueue');
    const hasQueue = Array.isArray(state.queue) && state.queue.length > 0;

    if (mixerClearBtn) {
      mixerClearBtn.style.display = hasQueue ? 'inline-flex' : 'none';
    }

    if (!hasQueue) {
      if (toolbar) toolbar.style.display = 'none';
      if (batchBar) batchBar.style.display = 'none';
      state.queueSelectMode = false;
      state.selectedQueueItemIds.clear();
      return;
    }

    if (toolbar) toolbar.style.display = 'flex';
    if (countTitle) countTitle.textContent = `${state.queue.length} bài chờ chiếu`;
    if (btnSelect) btnSelect.classList.toggle('active', state.queueSelectMode);

    if (batchBar) {
      batchBar.style.display = state.queueSelectMode ? 'flex' : 'none';
      const countText = document.getElementById('queueSelectedCountText');
      const btnCount = document.getElementById('queueDeleteBtnCount');
      const delBtn = document.getElementById('btnDeleteSelectedQueue');
      const cnt = state.selectedQueueItemIds.size;
      if (countText) countText.textContent = cnt;
      if (btnCount) btnCount.textContent = cnt;
      if (delBtn) delBtn.disabled = cnt === 0;
    }
  }

  function deleteSingleQueueItem(itemId) {
    const item = state.queue.find((q) => q.id === itemId);
    if (!item) return;
    state.queue = state.queue.filter((q) => q.id !== itemId);
    state.selectedQueueItemIds.delete(itemId);
    saveLiveQueueToStorage();
    renderQueue();
    broadcastSync({ type: 'DELETE_QUEUE_ITEMS', itemIds: [itemId] });
    broadcastSync({ type: 'QUEUE_UPDATE', queue: state.queue });
    showToast(`🗑️ Đã xóa bài "${item.title}" khỏi hàng đợi!`);
    if (sfx && typeof sfx.playChatPop === 'function') sfx.playChatPop();
  }

  function clearAllQueue() {
    if (!state.queue || state.queue.length === 0) return;
    const count = state.queue.length;
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ ${count} bài trong hàng đợi không?`)) {
      return;
    }
    state.queue = [];
    state.selectedQueueItemIds.clear();
    state.queueSelectMode = false;
    saveLiveQueueToStorage();
    renderQueue();
    broadcastSync({ type: 'CLEAR_QUEUE' });
    broadcastSync({ type: 'QUEUE_UPDATE', queue: [] });
    showToast(`🗑️ Đã làm trống toàn bộ hàng đợi (${count} bài)!`);
    if (sfx && typeof sfx.playChatPop === 'function') sfx.playChatPop();
  }

  function deleteSelectedQueueItems() {
    const count = state.selectedQueueItemIds.size;
    if (count === 0) {
      showToast('⚠️ Vui lòng tích chọn ít nhất 1 bài để xóa.');
      return;
    }
    const idsToDelete = Array.from(state.selectedQueueItemIds);
    state.queue = state.queue.filter((q) => !state.selectedQueueItemIds.has(q.id));
    state.selectedQueueItemIds.clear();
    state.queueSelectMode = false;
    saveLiveQueueToStorage();
    renderQueue();
    broadcastSync({ type: 'DELETE_QUEUE_ITEMS', itemIds: idsToDelete });
    broadcastSync({ type: 'QUEUE_UPDATE', queue: state.queue });
    showToast(`🗑️ Đã xóa ${count} bài đã chọn khỏi hàng đợi!`);
    if (sfx && typeof sfx.playChatPop === 'function') sfx.playChatPop();
  }

  function renderQueue() {
    sortQueue();
    updateNextPlayingUI();
    const listEl = document.getElementById('queueListContainer');
    const badgeEl = document.getElementById('queueCountBadge');
    if (badgeEl) badgeEl.textContent = state.queue.length;
    updateSkipVoteUI();
    updateMixerQueueVisibility();
    updateSoloQueueToolbar();
    if (!listEl) return;

    if (state.queue.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:32px 14px;color:var(--text-secondary);font-size:0.82rem;">
          🍿 Hàng đợi đang trống.<br/>Hãy dán link YouTube ở trên để cả rạp cùng xem!
        </div>
      `;
      return;
    }

    const totalOccupants = Object.keys(getOccupantMap()).length;
    const isSolo = totalOccupants <= 1;

    listEl.innerHTML = state.queue
      .map((item, idx) => {
        const isTop = idx === 0;
        const hasVoted = state.localVotedSongIds.has(item.id);
        const thumbUrl = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
        const isSelected = state.selectedQueueItemIds.has(item.id);
        return `
          <div class="queue-card ${isTop ? 'top-rank' : ''} ${state.queueSelectMode ? 'select-mode' : ''} ${isSelected ? 'is-selected' : ''}" data-queue-card-id="${item.id}">
            ${state.queueSelectMode ? `<input type="checkbox" class="queue-select-cb" data-select-id="${item.id}" ${isSelected ? 'checked' : ''} />` : ''}
            <div class="queue-thumb-wrap">
              <img src="${thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy" />
              <span class="rank-tag">${isTop ? '👑 #1 Sắp chiếu' : `#${idx + 1}`}</span>
            </div>
            <div class="queue-details">
              <div class="queue-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              <div class="queue-sub">
                <span>${escapeHtml(item.channel)}</span>
                <span>•</span>
                <span>${escapeHtml(item.addedBy)}</span>
              </div>
              <button class="play-now-mini" data-play-id="${item.id}">▶ Chiếu ngay</button>
            </div>
            <div class="queue-actions">
              <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-vote-id="${item.id}" title="Bình chọn ưu tiên phát trước">
                <span>▲</span>
                <span>${item.votes}</span>
              </button>
              <button type="button" class="queue-item-delete-btn" data-delete-id="${item.id}" title="Xóa bài này khỏi hàng đợi">🗑️</button>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-vote-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVoteQueueItem(btn.dataset.voteId);
      });
    });

    listEl.querySelectorAll('[data-play-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        forcePlayQueueItem(btn.dataset.playId);
      });
    });

    listEl.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSingleQueueItem(btn.dataset.deleteId);
      });
    });

    if (state.queueSelectMode) {
      listEl.querySelectorAll('.queue-card.select-mode').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.queue-actions') || e.target.closest('.play-now-mini')) return;
          const id = card.dataset.queueCardId;
          if (!id) return;
          if (state.selectedQueueItemIds.has(id)) {
            state.selectedQueueItemIds.delete(id);
          } else {
            state.selectedQueueItemIds.add(id);
          }
          renderQueue();
        });
      });
    }
  }

  function renderPresetChips() {
    const wrap = document.getElementById('presetChipsContainer');
    if (!wrap) return;
    wrap.innerHTML = PRESET_VIDEOS.map(
      (p, i) => `<button type="button" class="preset-chip" data-preset-idx="${i}">+ ${escapeHtml(p.channel)}</button>`
    ).join('');

    wrap.querySelectorAll('[data-preset-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESET_VIDEOS[Number(btn.dataset.presetIdx)];
        if (preset) addVideoToQueue(preset.videoId, preset.title, preset.channel);
      });
    });
  }

  async function addVideoToQueue(videoId, customTitle, customChannel, customLength) {
    if (state.queue.some((item) => item.videoId === videoId)) {
      showToast('⚡ Video này đã có trong danh sách bình chọn, hãy bấm Vote nhé!');
      return;
    }

    let title = customTitle;
    let channel = customChannel;
    let lengthSeconds = (customLength !== undefined && customLength !== null) ? customLength : null;

    showToast('🔍 Đang kiểm tra link & tính khả dụng video...');
    const meta = await fetchYouTubeMetadata(videoId);

    // 1. Immediate unavailable or age-restricted check from server/oEmbed
    if (meta && (meta.available === false || meta.isAgeRestricted === true)) {
      failedVideoIds.add(videoId);
      state.queue = (state.queue || []).filter((q) => q.videoId !== videoId);
      renderQueue();
      saveLiveQueueToStorage();
      if (meta.isAgeRestricted || /giới hạn độ tuổi|18\+|xác nhận tuổi|age-restricted|inappropriate|phù hợp/i.test(meta.reason || '')) {
        showAgeRestrictedVideoPopup(
          title || meta.title || `Video #${videoId}`,
          meta.reason,
          () => {
            const input = document.getElementById('inputYoutubeUrl');
            if (input) { input.value = ''; input.focus(); }
          }
        );
      } else {
        showUnavailableVideoPopup(
          title || meta.title || `ID: ${videoId}`,
          meta.reason || 'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable). Bạn không được phép xem video này.',
          () => {
            const input = document.getElementById('inputYoutubeUrl');
            if (input) { input.value = ''; input.focus(); }
          }
        );
      }
      return;
    }

    if (meta) {
      if (!title && meta.title) title = meta.title;
      if (!channel && meta.channel) channel = meta.channel;
      if (lengthSeconds === null && meta.lengthSeconds !== null && meta.lengthSeconds !== undefined) {
        lengthSeconds = meta.lengthSeconds;
      }
    }

    // 2. Fallback probe duration if length is not yet known from server/oEmbed
    if (lengthSeconds === null || lengthSeconds === undefined) {
      try {
        const probeResult = await probeYouTubePlayability(videoId);
        if (probeResult && probeResult.playable === false && (!title || title.includes(videoId))) {
          failedVideoIds.add(videoId);
          state.queue = (state.queue || []).filter((q) => q.videoId !== videoId);
          renderQueue();
          saveLiveQueueToStorage();
          showUnavailableVideoPopup(
            title || `ID: ${videoId}`,
            probeResult.reason || 'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable).',
            () => {
              const input = document.getElementById('inputYoutubeUrl');
              if (input) { input.value = ''; input.focus(); }
            }
          );
          const input = document.getElementById('inputYoutubeUrl');
          if (input) input.value = '';
          return;
        }
        if (probeResult && probeResult.duration) {
          lengthSeconds = Math.round(probeResult.duration);
        }
      } catch (_) {}
    }

    // STRICT 8-MINUTE DURATION LIMIT CHECK (<= 480 seconds)
    if (lengthSeconds && lengthSeconds > MAX_VIDEO_DURATION_SECONDS) {
      showVideoLimitPopup(
        title || `ID: ${videoId}`,
        lengthSeconds,
        () => {
          const input = document.getElementById('inputYoutubeUrl');
          if (input) { input.value = ''; input.focus(); }
        }
      );
      return;
    }

    title = title || `Video #${videoId}`;
    channel = channel || 'YouTube Creator';

    const newItem = {
      id: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      videoId,
      title,
      channel,
      addedBy: `${state.me.name} (${state.me.seat})`,
      addedByUserId: state.me.id,
      addedByClientId: state.clientId,
      votes: 1,
      ambilight: randomAmbilightPair()
    };

    state.localVotedSongIds.add(newItem.id);
    state.queue.push(newItem);
    saveLiveQueueToStorage();
    renderQueue();
    showToast(`✅ Đã thêm "${title}" vào danh sách bình chọn!`);
    showSeatSpeechBubble(state.me.seat, `Vừa đề xuất bài mới, vote nha! 🎵`, 4200);

    const input = document.getElementById('inputYoutubeUrl');
    if (input) input.value = '';

    const isScreenEmpty = !state.currentVideo || !state.currentVideo.videoId;
    if (isScreenEmpty) {
      // Screen is currently waiting / empty: auto play newly proposed video immediately!
      playNextFromQueue('Chiếu ngay video vừa đề xuất');
    } else {
      broadcastSync({ type: 'ADD_QUEUE', item: newItem });
    }
  }

  function toggleVoteQueueItem(itemId) {
    const item = state.queue.find((q) => q.id === itemId);
    if (!item) return;

    if (state.localVotedSongIds.has(itemId)) {
      item.votes = Math.max(0, item.votes - 1);
      state.localVotedSongIds.delete(itemId);
    } else {
      item.votes += 1;
      state.localVotedSongIds.add(itemId);
      sfx.playReactionPop();
    }

    renderQueue();
    broadcastSync({ type: 'VOTE_QUEUE', queue: state.queue });
  }

  function forcePlayQueueItem(itemId) {
    if (isPlaybackLocked()) {
      notifyPlaybackLocked();
      return;
    }
    const idx = state.queue.findIndex((q) => q.id === itemId);
    if (idx === -1) return;
    const [picked] = state.queue.splice(idx, 1);
    picked.startedBy = state.me.name;
    picked.startedByUserId = state.me.id;
    picked.startedByClientId = state.clientId;
    state.skipVotes.clear();
    renderQueue();
    saveLiveQueueToStorage();
    updateSkipVoteUI();
    broadcastSync({
      type: 'QUEUE_ADVANCE',
      nextVideo: picked,
      queue: state.queue,
      reason: `Chiếu ngay bởi ${state.me.name}`
    });
    loadAndPlayVideo(picked, true);
  }

  function playNextFromQueue(reasonText) {
    sortQueue();
    if (!state.queue || state.queue.length === 0) {
      showToast('⚠️ Hàng đợi đã hết bài hát! Hãy đề xuất thêm video mới.');
      state.skipVotes.clear();
      updateSkipVoteUI();
      clearCinemaScreen();
      renderQueue();
      saveLiveQueueToStorage();
      broadcastSync({
        type: 'QUEUE_ADVANCE',
        nextVideo: null,
        currentVideo: null,
        queue: [],
        reason: 'Hàng đợi đã hết bài hát'
      });
      return;
    }
    const nextVideo = state.queue.shift();
    state.skipVotes.clear();
    renderQueue();
    saveLiveQueueToStorage();
    updateSkipVoteUI();

    if (reasonText) {
      showToast(`⏭️ ${reasonText} • Chuyển sang: ${nextVideo.title}`);
    }

    broadcastSync({
      type: 'QUEUE_ADVANCE',
      nextVideo: nextVideo,
      currentVideo: nextVideo,
      queue: state.queue,
      reason: reasonText
    });

    loadAndPlayVideo(nextVideo, true);
  }

  function purgeInvalidSkipVotes() {
    const occupants = getOccupantMap();
    const validIds = new Set(Object.values(occupants).map((o) => o.id));
    for (const voterId of state.skipVotes) {
      if (!validIds.has(voterId)) {
        state.skipVotes.delete(voterId);
      }
    }
  }

  function getRequiredSkipVotes() {
    const totalViewers = Object.keys(getOccupantMap()).length || 1;
    if (totalViewers <= 1) return 1;
    // Cần tối thiểu 30% khán giả đồng ý (làm tròn lên Math.ceil để luôn đạt từ 30% trở lên)
    // Và luôn yêu cầu tối thiểu 2 người khi phòng có từ 2 người trở lên (chống 1 người tự ý skip)
    const pct30 = Math.ceil(totalViewers * 0.3);
    return Math.max(2, pct30);
  }

  function updateSkipVoteUI() {
    const btn = document.getElementById('btnVoteSkip');
    if (!btn) return;

    purgeInvalidSkipVotes();
    const totalViewers = Object.keys(getOccupantMap()).length || 1;
    const required = getRequiredSkipVotes();
    const votesCount = state.skipVotes.size;
    const hasQueue = Array.isArray(state.queue) && state.queue.length > 0;
    const hasVoted = state.skipVotes.has(state.me.id);

    if (!hasQueue) {
      // Khi hàng đợi trống: Khoá nút hoàn toàn, ngăn chặn việc bấm skip vô nghĩa
      btn.disabled = true;
      btn.classList.add('is-disabled');
      btn.classList.remove('voted');
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'Hàng đợi đang trống (0 bài) • Hãy dán link hoặc chọn video đề xuất để có thể chuyển bài';
      btn.innerHTML = `⏭️ Qua bài <span class="skip-badge empty">Hết hàng đợi</span>`;
    } else {
      // Khi có video trong hàng đợi: Mở khoá nút
      btn.disabled = false;
      btn.classList.remove('is-disabled');
      btn.removeAttribute('aria-disabled');

      if (hasVoted) {
        btn.classList.add('voted');
        btn.title = `Bạn đã bỏ phiếu qua bài (${votesCount}/${required} phiếu). Bấm lại để huỷ vote.`;
        btn.innerHTML = `⏭️ Đã vote (<span id="skipVoteCounter">${votesCount}/${required}</span>)`;
      } else {
        btn.classList.remove('voted');
        btn.title = `Bỏ phiếu chuyển sang video #1 trong hàng đợi (Cần ${required}/${totalViewers} phiếu - tối thiểu 30% khán giả)`;
        btn.innerHTML = `⏭️ Qua bài (<span id="skipVoteCounter">${votesCount}/${required}</span>)`;
      }
    }
  }

  function handleVoteSkip() {
    // 1. Chặn tuyệt đối nếu hàng đợi rỗng
    if (!state.queue || state.queue.length === 0) {
      showToast('⚠️ Hàng đợi đang trống! Vui lòng đề xuất thêm video trước khi qua bài.');
      state.skipVotes.clear();
      updateSkipVoteUI();
      return;
    }

    // 2. Cơ chế toggle: nếu đã vote rồi thì bấm lại sẽ huỷ vote văn minh
    if (state.skipVotes.has(state.me.id)) {
      state.skipVotes.delete(state.me.id);
      updateSkipVoteUI();
      showToast('↩️ Đã huỷ bỏ phiếu qua bài.');
      broadcastSync({
        type: 'SKIP_VOTE_REVOKE',
        voterId: state.me.id,
        votes: Array.from(state.skipVotes)
      });
      return;
    }

    // 3. Ghi nhận phiếu vote của người dùng
    state.skipVotes.add(state.me.id);
    const required = getRequiredSkipVotes();
    updateSkipVoteUI();
    showSeatSpeechBubble(state.me.seat, 'Vote qua bài tiếp theo nha ⏭️', 3500);

    broadcastSync({
      type: 'SKIP_VOTE',
      voterId: state.me.id,
      votesCount: state.skipVotes.size,
      votes: Array.from(state.skipVotes)
    });

    // 4. Kiểm tra ngưỡng đủ để tiến hành skip
    if (state.skipVotes.size >= required) {
      const totalViewers = Object.keys(getOccupantMap()).length || 1;
      const pct = Math.round((state.skipVotes.size / totalViewers) * 100);
      const reason = `Đã đủ ${state.skipVotes.size}/${required} phiếu (${pct}% khán giả đồng ý)`;
      playNextFromQueue(reason);
    }
  }

  // =========================================================================
  // 9. LIVE CHAT, 3D SPEECH BUBBLES & SEAT REACTION CANNONS
  // =========================================================================
  function showSeatSpeechBubble(seatCode, text, duration = 6000) {
    if (state.seatBubbles[seatCode] && state.seatBubbles[seatCode].timer) {
      clearTimeout(state.seatBubbles[seatCode].timer);
    }
    const timer = setTimeout(() => {
      delete state.seatBubbles[seatCode];
      refreshSeatsVisuals();
    }, duration);

    state.seatBubbles[seatCode] = { text, timer };
    refreshSeatsVisuals();
  }

  // 3D Reaction Particles Engine (Anti-spam rate limiting & constant 60 FPS pool cap)
  const MAX_ACTIVE_REACTION_PARTICLES = 36;
  const activeReactionParticles = [];
  let lastLocalReactionBroadcastTime = 0;

  function spawnSeatReaction3D(seatCode, emojiIcon, broadcast = true, playSound = true) {
    const seatNode = document.getElementById(`seat-3d-${seatCode}`);
    if (!seatNode) return;

    const now = Date.now();

    // Throttle network broadcast only (protects WebSocket/MQTT while keeping local response instant)
    if (broadcast) {
      if (now - lastLocalReactionBroadcastTime >= 180) {
        lastLocalReactionBroadcastTime = now;
        broadcastSync({ type: 'REACTION', seat: seatCode, emoji: emojiIcon });
      }
    }

    // Audio throttled pop
    if (playSound && sfx && typeof sfx.playReactionPop === 'function') {
      sfx.playReactionPop();
    }

    // Spawn lively burst of 2 floating emoji particles
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        // Enforce FIFO cap so total DOM particles never exceed MAX_ACTIVE_REACTION_PARTICLES
        while (activeReactionParticles.length >= MAX_ACTIVE_REACTION_PARTICLES) {
          const oldest = activeReactionParticles.shift();
          if (oldest && oldest.isConnected) {
            oldest.remove();
          }
        }

        const p = document.createElement('div');
        p.className = 'reaction-particle';
        p.textContent = emojiIcon;
        const driftX = (Math.random() - 0.5) * 64;
        p.style.setProperty('--drift-x', `${driftX.toFixed(1)}px`);
        p.style.left = '50%';
        p.style.bottom = '46px';

        seatNode.appendChild(p);
        activeReactionParticles.push(p);

        setTimeout(() => {
          const idx = activeReactionParticles.indexOf(p);
          if (idx !== -1) activeReactionParticles.splice(idx, 1);
          if (p.isConnected) p.remove();
        }, 1600);
      }, i * 90);
    }
  }

  function sendChatMessage(rawText) {
    const text = rawText.trim();
    if (!text) return;

    const msg = {
      id: 'm-' + Date.now(),
      author: state.me.name,
      seat: state.me.seat,
      emoji: state.me.emoji,
      avatar: state.me.avatar || null,
      color: state.me.color,
      text,
      time: getCurrentTimeStr(),
      isMe: true
    };

    state.messages.push(msg);
    sfx.playChatPop();
    renderChatMessages(true);
    showSeatSpeechBubble(state.me.seat, text, 6500);
    broadcastSync({ type: 'CHAT_MSG', msg: { ...msg, isMe: false } });
  }

  function appendSystemChat(text) {
    state.messages.push({
      id: 'sys-' + Date.now() + Math.random(),
      type: 'system',
      text
    });
    renderChatMessages(true);
  }

  function renderChatMessages(forceScrollBottom = false) {
    const container = document.getElementById('chatMessagesContainer');
    const badge = document.getElementById('chatCountBadge');
    if (badge) badge.textContent = state.messages.length;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;

    container.innerHTML = state.messages
      .map((m) => {
        if (m.type === 'system') {
          return `<div class="chat-system-notice">${escapeHtml(m.text)}</div>`;
        }
        return `
          <div class="chat-msg ${m.isMe ? 'is-me' : ''}">
            <div class="chat-avatar" style="background:${m.color}">${m.avatar ? `<img src="${m.avatar}" class="chat-avatar-img" />` : (m.emoji || '👤')}</div>
            <div class="chat-bubble-wrap">
              <div class="chat-header-line">
                <span class="chat-author">${escapeHtml(m.author)}</span>
                <span class="chat-seat-tag" data-focus-seat="${m.seat}" title="Xem vị trí ghế ${m.seat} trong rạp">Ghế ${m.seat}</span>
                <span class="chat-time">${m.time}</span>
              </div>
              <div class="chat-text">${escapeHtml(m.text)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    if (forceScrollBottom || isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }

    container.querySelectorAll('[data-focus-seat]').forEach((tag) => {
      tag.addEventListener('click', () => {
        focusOnSeat(tag.dataset.focusSeat);
      });
    });
  }

  // =========================================================================
  // 10. 2D 100-SEAT MAP & AUDIENCE ROSTER
  // =========================================================================
  function render2DSeatMap(occupants) {
    const grid = document.getElementById('seatGrid2D');
    const roster = document.getElementById('audienceRosterContainer');
    if (!grid || !roster) return;

    let cellsHtml = '';
    ROWS.forEach((r) => {
      COLS.forEach((c) => {
        const code = `${r}${c}`;
        const isVip = r === 'E' || r === 'F';
        const occ = occupants[code];
        let cls = 'seat-cell-2d';
        if (isVip) cls += ' vip';
        if (occ) {
          if (occ.isMe) {
            cls += ' mine';
          } else {
            cls += ' occupied';
          }
        }

        const titleText = occ
          ? (occ.isMe ? `Ghế ${code} - Chỗ ngồi hiện tại của bạn (${occ.name})` : `Ghế ${code} - Đã có bạn "${occ.name}" ngồi (Không thể chọn)`)
          : `Ghế ${code} (Trống - Bấm để đổi sang ghế này)`;

        let cellContent = code;
        if (occ) {
          if (occ.isMe) {
            cellContent = `<span class="seat-2d-mine-badge">BẠN</span>`;
          } else {
            cellContent = `<span class="seat-2d-occ-name" title="${escapeHtml(occ.name)}">${escapeHtml(occ.name.slice(0, 4))}</span>`;
          }
        }
        cellsHtml += `<div class="${cls}" data-seat="${code}" data-seat-2d="${code}" title="${escapeHtml(titleText)}">${cellContent}</div>`;
      });
    });
    grid.innerHTML = cellsHtml;

    // Direct click listeners on all 2D seat cells for immediate seat change
    grid.querySelectorAll('.seat-cell-2d').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetSeat = cell.getAttribute('data-seat') || cell.getAttribute('data-seat-2d');
        if (!targetSeat) return;
        if (targetSeat === state.me.seat) {
          showToast(`💺 Bạn đang ngồi ở ghế ${targetSeat} rồi!`);
          return;
        }
        selectSeat(targetSeat);
      });
    });

    const people = Object.values(occupants);
    roster.innerHTML = people
      .map(
        (p) => `
        <div class="roster-row" data-roster-seat="${p.seat}">
          <div style="display:flex;align-items:center;gap:8px;">
            ${p.avatar ? `<img src="${p.avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;border:1px solid rgba(255,255,255,0.4);" />` : `<span style="font-size:1.05rem;">${p.emoji || '😎'}</span>`}
            <strong>${escapeHtml(p.name)}</strong>
            ${p.isMe ? '<span style="font-size:0.66rem;color:#FBBF24;font-weight:700;">(Bạn)</span>' : ''}
          </div>
          <span class="chat-seat-tag" data-jump-seat="${p.seat}" title="Xem vị trí ghế ${p.seat}">Ghế ${p.seat}</span>
        </div>
      `
      )
      .join('');
  }

  // =========================================================================
  // 11. AI AUDIENCE ENGINE & BROADCAST CHANNEL SYNCHRONIZATION
  // =========================================================================
  function startSimulatedAudienceEngine() {
    // Dummy bot viewers removed per user request
  }

  let wsClient = null;
  let wsConnected = false;
  let wsReconnectTimer = null;
  let mqttClient = null;
  let mqttConnected = false;
  let peerHeartbeatTimer = null;
  const peerLastSeen = {};

  const CLOUD_ROOM_TOPIC = `hanzu-cinema/v1/${encodeURIComponent(state.roomCode || 'rap-chung-minh')}`;

  function broadcastSync(payload) {
    const packet = {
      ...payload,
      from: state.clientId,
      senderId: state.clientId,
      userId: state.me.id,
      timestamp: Date.now()
    };
    const jsonStr = JSON.stringify(packet);

    // 1. Send via native WebSocket if connected (Local Node.js server or custom WSS)
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try {
        wsClient.send(jsonStr);
      } catch (e) {}
    }

    // 2. Send via Cloud Broker (connects all visitors on https://jhanzu.github.io/Cinema/ anywhere in the world!)
    if (mqttClient && mqttConnected) {
      try {
        const msg = new window.Paho.MQTT.Message(jsonStr);
        msg.destinationName = CLOUD_ROOM_TOPIC;
        mqttClient.send(msg);
      } catch (e) {}
    }

    // 3. Send via local BroadcastChannel for same-browser tabs
    if (syncChannel) {
      try {
        syncChannel.postMessage(packet);
      } catch (e) {}
    }
  }

  function handleIncomingSyncData(data) {
    if (!data || !data.type) return;
    if (data.from === state.clientId || data.senderId === state.clientId) return;
    if (data.userId && data.userId === state.me.id && data.type !== 'ROOM_SYNC') return;

    switch (data.type) {
      case 'REQUEST_ROOM_SYNC':
        if (data.from !== state.clientId && data.clientId !== state.clientId) {
          broadcastSync({
            from: state.clientId,
            type: 'ROOM_SYNC_REPLY',
            targetClientId: data.from || data.clientId,
            occupants: getOccupantMap(),
            currentVideo: state.currentVideo,
            currentTime: (ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0,
            isPlaying: state.isPlaying,
            queue: state.queue || [],
            skipVotes: Array.from(state.skipVotes)
          });
        }
        break;

      case 'ROOM_SYNC_REPLY':
        if (!data.targetClientId || data.targetClientId === state.clientId) {
          if (data.occupants) {
            state.peers = {};
            const now = Date.now();
            Object.values(data.occupants).forEach((occ) => {
              if (occ.id !== state.me.id && occ.seat) {
                state.peers[occ.id] = { ...occ, lastSeen: now };
                peerLastSeen[occ.id] = now;
              }
            });

            // If incoming room state has someone on my default seat, auto-relocate to a free seat
            if (data.occupants[state.me.seat] && data.occupants[state.me.seat].id !== state.me.id) {
              const freeSeat = findRandomFreeSeat(state.me.seat);
              state.me.seat = freeSeat;
              saveProfileToStorage();
              const seatPill = document.getElementById('myNavSeat');
              if (seatPill) seatPill.textContent = freeSeat;
              broadcastSync({ type: 'SEAT_CHANGE', seat: freeSeat, user: state.me });
            }

            // Ensure our own name is independent and unique
            if (isNameTaken(state.me.name, state.me.id)) {
              const uniqueName = makeUniqueName(state.me.name, state.me.id);
              state.me.name = uniqueName;
              saveProfileToStorage();
              const myNavName = document.getElementById('myNavName');
              if (myNavName) myNavName.textContent = uniqueName;
              showToast(`✨ Tên bạn đã đổi thành "${uniqueName}" để không trùng lặp.`);
              broadcastSync({ type: 'PROFILE_UPDATE', user: state.me });
            }

            refreshSeatsVisuals();
            render2DSeatMap(getOccupantMap());
            updateSkipVoteUI();
          }

          // CRITICAL: Always synchronize live queue, even if empty ([])
          if (Array.isArray(data.queue)) {
            state.queue = (data.queue || []).filter((q) => q && q.id !== 'q-1');
            saveLiveQueueToStorage();
            renderQueue();
            updateSkipVoteUI();
          }

          if (data.currentVideo && data.currentVideo.videoId) {
            const seekTime = (typeof data.currentTime === 'number' && data.currentTime > 0) ? data.currentTime : 0;
            if (!state.currentVideo || state.currentVideo.videoId !== data.currentVideo.videoId) {
              loadAndPlayVideo(data.currentVideo, false, seekTime);
            } else if (seekTime > 2) {
              if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
                try {
                  ytPlayer.seekTo(seekTime, true);
                } catch (err) {}
              } else {
                pendingVideoToLoad = { ...data.currentVideo, startSeconds: seekTime };
              }
            }
          } else if (data.currentVideo === null || (Array.isArray(data.queue) && data.queue.length === 0 && !data.isPlaying)) {
            clearCinemaScreen();
            saveLiveQueueToStorage();
            if ((!state.currentVideo || !state.currentVideo.videoId) && state.queue.length > 0) {
              playNextFromQueue('Tự động chiếu từ hàng đợi');
            }
          }

          if (Array.isArray(data.skipVotes)) {
            state.skipVotes = new Set(data.skipVotes);
            updateSkipVoteUI();
          }
        }
        break;

      case 'HEARTBEAT':
        if (data.user && data.user.id && data.user.id !== state.me.id) {
          const now = Date.now();
          data.user.lastSeen = now;
          peerLastSeen[data.user.id] = now;
          const prev = state.peers[data.user.id];
          const hasChange = !prev ||
            prev.seat !== data.user.seat ||
            prev.name !== data.user.name ||
            prev.gender !== data.user.gender ||
            prev.emoji !== data.user.emoji ||
            prev.avatar !== data.user.avatar ||
            prev.color !== data.user.color;
          state.peers[data.user.id] = data.user;
          if (hasChange) {
            refreshSeatsVisuals();
          }
        }
        break;

      case 'ROOM_SYNC':
        // Full room sync from server when entering
        if (data.assignedSeat && data.assignedSeat !== state.me.seat) {
          state.me.seat = data.assignedSeat;
          saveProfileToStorage();
          const seatPill = document.getElementById('myNavSeat');
          if (seatPill) seatPill.textContent = data.assignedSeat;
        }
        if (data.assignedName && data.assignedName !== state.me.name) {
          state.me.name = data.assignedName;
          saveProfileToStorage();
          const myNavName = document.getElementById('myNavName');
          if (myNavName) myNavName.textContent = data.assignedName;
        }
        if (data.occupants) {
          state.peers = {};
          const now = Date.now();
          Object.values(data.occupants).forEach((occ) => {
            if (occ.id !== state.me.id && occ.seat) {
              state.peers[occ.id] = { ...occ, lastSeen: now };
              peerLastSeen[occ.id] = now;
            }
          });

          // Ensure our own name is independent and unique
          if (isNameTaken(state.me.name, state.me.id)) {
            const uniqueName = makeUniqueName(state.me.name, state.me.id);
            state.me.name = uniqueName;
            saveProfileToStorage();
            const myNavName = document.getElementById('myNavName');
            if (myNavName) myNavName.textContent = uniqueName;
            showToast(`✨ Tên bạn đã đổi thành "${uniqueName}" để không trùng lặp.`);
            broadcastSync({ type: 'PROFILE_UPDATE', user: state.me });
          }

          refreshSeatsVisuals();
        }
        if (Array.isArray(data.queue)) {
          state.queue = data.queue;
          renderQueue();
        }
        if (Array.isArray(data.skipVotes)) {
          state.skipVotes = new Set(data.skipVotes);
        }
        updateSkipVoteUI();
        if (data.currentVideo && data.currentVideo.videoId) {
          const seekTime = (typeof data.currentTime === 'number' && data.currentTime > 0) ? data.currentTime : 0;
          if (!state.currentVideo || state.currentVideo.videoId !== data.currentVideo.videoId) {
            loadAndPlayVideo(data.currentVideo, false, seekTime);
          } else if (seekTime > 2) {
            if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
              try {
                ytPlayer.seekTo(seekTime, true);
              } catch (err) {}
            } else {
              pendingVideoToLoad = { ...data.currentVideo, startSeconds: seekTime };
            }
          }
        }
        break;

      case 'USER_JOINED':
        break;

      case 'VIDEO_AGE_RESTRICTED_REJECTED':
        showAgeRestrictedVideoPopup(data.title, data.message, () => {
          const input = document.getElementById('inputYoutubeUrl');
          if (input) { input.value = ''; input.focus(); }
        });
        break;

      case 'VIDEO_LIMIT_REJECTED':
        showVideoLimitPopup(data.title, data.lengthSeconds, () => {
          const input = document.getElementById('inputYoutubeUrl');
          if (input) { input.value = ''; input.focus(); }
        });
        break;

      case 'PEER_JOIN':
      case 'INIT_USER':
        if (data.user && data.user.id && data.user.id !== state.me.id) {
          if (isNameTaken(data.user.name, data.user.id)) {
            data.user.name = makeUniqueName(data.user.name, data.user.id);
          }
          state.peers[data.user.id] = data.user;
          peerLastSeen[data.user.id] = Date.now();
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showSeatSpeechBubble(data.user.seat, `👋 Chào cả rạp, mình vừa vào ngồi ghế ${data.user.seat}!`, 4200);
          showToast(`👋 Khán giả "${data.user.name}" vừa vào rạp (Ghế ${data.user.seat})!`);

          // Reply with live room state across all networks so new peer syncs immediately!
          broadcastSync({
            from: state.clientId,
            type: 'ROOM_SYNC_REPLY',
            targetClientId: data.from || data.clientId,
            occupants: getOccupantMap(),
            currentVideo: state.currentVideo,
            currentTime: (ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0,
            isPlaying: state.isPlaying,
            queue: state.queue || [],
            skipVotes: Array.from(state.skipVotes)
          });
        }
        break;

      case 'USER_LEFT':
      case 'PEER_LEAVE': {
        const leavingId = data.userId || data.peerId;
        if (leavingId && state.peers[leavingId]) {
          const departingUser = state.peers[leavingId];
          delete state.peers[leavingId];
          delete peerLastSeen[leavingId];
          if (state.skipVotes.has(leavingId)) {
            state.skipVotes.delete(leavingId);
          }
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showToast(`Khán giả "${departingUser.name || 'Một người bạn'}" đã rời khỏi rạp.`);
        }
        break;
      }

      case 'SEAT_CHANGE':
        if (data.userId && data.seat) {
          if (data.user) {
            state.peers[data.userId] = { ...(state.peers[data.userId] || {}), ...data.user, seat: data.seat };
          } else if (state.peers[data.userId]) {
            state.peers[data.userId].seat = data.seat;
          }
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showSeatSpeechBubble(data.seat, `Khán giả vừa chuyển sang ghế ${data.seat}!`, 3500);
        }
        break;

      case 'PROFILE_UPDATED':
        if (data.userId && data.user) {
          state.peers[data.userId] = { ...(state.peers[data.userId] || {}), ...data.user };
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showToast(`✨ Khán giả "${data.user.name}" vừa cập nhật hồ sơ!`);
        }
        break;

      case 'SEAT_TAKEN_ERROR':
        showToast(`⚠️ ${data.message || 'Ghế đã có người ngồi!'}`);
        break;

      case 'CHAT_MSG':
        if (data.msg) {
          state.messages.push(data.msg);
          renderChatMessages(false);
          if (data.msg.seat) {
            showSeatSpeechBubble(data.msg.seat, data.msg.text, 6200);
          }
          sfx.playChatPop();
        }
        break;

      case 'REACTION':
        if (data.seat && data.emoji) {
          spawnSeatReaction3D(data.seat, data.emoji, false, true);
        }
        break;

      case 'CLEAR_QUEUE':
        state.queue = [];
        state.selectedQueueItemIds.clear();
        state.queueSelectMode = false;
        renderQueue();
        updateSkipVoteUI();
        break;

      case 'DELETE_QUEUE_ITEMS':
        if (Array.isArray(data.itemIds)) {
          const idSet = new Set(data.itemIds);
          state.queue = (state.queue || []).filter((q) => !idSet.has(q.id));
          idSet.forEach((id) => state.selectedQueueItemIds.delete(id));
          renderQueue();
          updateSkipVoteUI();
        }
        break;

      case 'ADD_QUEUE':
      case 'ADD_QUEUE_BATCH':
      case 'QUEUE_UPDATE':
        if (Array.isArray(data.queue)) {
          state.queue = data.queue;
          renderQueue();
          updateSkipVoteUI();
        } else if (Array.isArray(data.items)) {
          data.items.forEach((it) => {
            if (it && !state.queue.some((q) => q.id === it.id)) {
              state.queue.push({ ...it });
            }
          });
          renderQueue();
          updateSkipVoteUI();
        } else if (data.item && !state.queue.some((q) => q.id === data.item.id)) {
          state.queue.push({ ...data.item });
          renderQueue();
          updateSkipVoteUI();
        }
        if ((!state.currentVideo || !state.currentVideo.videoId) && state.queue.length > 0) {
          playNextFromQueue('Tự động chiếu từ hàng đợi');
        }
        break;

      case 'QUEUE_ADVANCE':
        if (Array.isArray(data.queue)) {
          state.queue = data.queue;
          renderQueue();
          saveLiveQueueToStorage();
        }
        state.skipVotes.clear();
        updateSkipVoteUI();
        if (data.nextVideo || data.currentVideo) {
          const vid = data.nextVideo || data.currentVideo;
          if (data.reason) {
            showToast(`⏭️ ${data.reason} • Đang phát: ${vid.title}`);
          }
          loadAndPlayVideo(vid, false);
        } else if (data.nextVideo === null || (Array.isArray(data.queue) && data.queue.length === 0)) {
          clearCinemaScreen();
          saveLiveQueueToStorage();
          if (data.reason) {
            showToast(`⏭️ ${data.reason}`);
          }
        }
        break;

      case 'UNAVAILABLE_VIDEO_PURGE':
        if (data.videoId) {
          failedVideoIds.add(data.videoId);
          state.queue = (state.queue || []).filter(
            (q) => q.videoId !== data.videoId && (!data.id || q.id !== data.id)
          );
          state.skipVotes.clear();
          renderQueue();
          updateSkipVoteUI();
          updateNextPlayingUI();

          if (state.currentVideo && state.currentVideo.videoId === data.videoId) {
            if (ytPlayer) {
              try {
                if (typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
                else if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
              } catch (_) {}
            }
            if (data.nextVideo && data.nextVideo.videoId) {
              loadAndPlayVideo(data.nextVideo, false);
            } else if (state.queue.length > 0) {
              playNextFromQueue('Đã gỡ video không thể xem khỏi rạp');
            } else {
              clearCinemaScreen();
            }
          }
          showToast(`⚠️ Video bị hạn chế bản quyền đã được tự động gỡ khỏi rạp.`);
        }
        break;

      case 'LOAD_VIDEO':
        if (data.video) {
          loadAndPlayVideo(data.video, false, data.currentTime || 0);
        }
        break;

      case 'SYNC_PLAY_PAUSE':
        if (ytReady && ytPlayer) {
          const totalOccupants = Object.keys(getOccupantMap()).length;
          if (!data.isPlaying && totalOccupants >= 2) {
            return;
          }
          state.isPlaying = !!data.isPlaying;
          if (data.isPlaying && typeof ytPlayer.playVideo === 'function') {
            ytPlayer.playVideo();
          } else if (!data.isPlaying && typeof ytPlayer.pauseVideo === 'function') {
            ytPlayer.pauseVideo();
          }
          updatePlayPauseButton();
          if (data.by && data.by !== state.me.name) {
            showToast(data.isPlaying ? `▶️ ${escapeHtml(data.by)} đã tiếp tục phát` : `⏸️ ${escapeHtml(data.by)} đã tạm dừng video`);
          }
        }
        break;

      case 'SYNC_SEEK':
        if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
          const totalOccupants = Object.keys(getOccupantMap()).length;
          if (totalOccupants >= 2) {
            return;
          }
          const seekTime = Number(data.time) || 0;
          ytPlayer.seekTo(seekTime, true);
          const dur = (ytPlayer.getDuration && ytPlayer.getDuration()) || 0;
          if (typeof updateScrubberUI === 'function') updateScrubberUI(seekTime, dur);
          if (data.by && data.by !== state.me.name) {
            showToast(`⏩ ${escapeHtml(data.by)} đã tua đến ${formatTime(seekTime)}`);
          }
        }
        break;

      case 'SKIP_VOTE_UPDATE':
        if (Array.isArray(data.votes)) {
          state.skipVotes = new Set(data.votes);
          updateSkipVoteUI();
        }
        break;

      case 'SKIP_VOTE':
        if (Array.isArray(data.votes)) {
          data.votes.forEach((id) => state.skipVotes.add(id));
        } else if (data.voterId) {
          state.skipVotes.add(data.voterId);
        }
        updateSkipVoteUI();
        break;

      case 'SKIP_VOTE_REVOKE':
        if (data.voterId) {
          state.skipVotes.delete(data.voterId);
        }
        if (Array.isArray(data.votes)) {
          state.skipVotes = new Set(data.votes);
        }
        updateSkipVoteUI();
        break;

      case 'PEER_JOIN':
        if (data.user && data.user.id && data.user.id !== state.me.id) {
          state.peers[data.user.id] = data.user;
          refreshSeatsVisuals();
          updateSkipVoteUI();
        }
        break;

      case 'PEER_LEAVE':
        if (data.peerId && state.peers[data.peerId]) {
          delete state.peers[data.peerId];
          if (state.skipVotes.has(data.peerId)) {
            state.skipVotes.delete(data.peerId);
          }
          refreshSeatsVisuals();
          updateSkipVoteUI();
        }
        break;
    }
  }

  let currentWsUrl = '';

  function getTargetWsUrl() {
    const paramWs = urlParams.get('ws');
    if (paramWs) return paramWs;

    const savedWs = localStorage.getItem('hanzu_cinema_ws_url');
    if (savedWs) return savedWs;

    const host = window.location.host;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || /^192\.168\./.test(host) || /^10\./.test(host);
    if (isLocal && host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${host}/ws`;
    }
    return null;
  }

  function updateServerStatusUI(status) {
    const pill = document.getElementById('btnOpenServerSettings');
    const label = document.getElementById('serverStatusText');
    if (!pill || !label) return;

    pill.classList.remove('online', 'connecting', 'offline');
    if (status === 'online') {
      pill.classList.add('online');
      label.textContent = mqttConnected ? 'Máy chủ chung (Cloud 🟢)' : 'Máy chủ chung 🟢';
      pill.title = mqttConnected
        ? 'Đã kết nối Máy chủ Đám mây Toàn cầu — Mọi người trên jhanzu.github.io/Cinema/ đều xem chung và thấy nhau!'
        : `Đã kết nối máy chủ: ${currentWsUrl}`;
    } else if (status === 'connecting') {
      pill.classList.add('connecting');
      label.textContent = 'Đang kết nối...';
      pill.title = 'Đang kết nối máy chủ phòng chiếu...';
    } else {
      pill.classList.add('offline');
      label.textContent = 'Phòng riêng (Offline 🟢)';
      pill.title = 'Đang ở phòng riêng (Ngoại tuyến). Bạn có thể xem phim và đổi ghế bình thường. Bấm để kết nối máy chủ chung.';
    }
  }

  // 1. Native WebSocket Connection (For local Node.js server or custom user WebSocket URL)
  function initRealtimeWebSocket() {
    currentWsUrl = getTargetWsUrl();
    if (!currentWsUrl) return false;

    updateServerStatusUI('connecting');

    try {
      if (wsClient) {
        try { wsClient.close(); } catch(e) {}
      }

      wsClient = new WebSocket(currentWsUrl);

      wsClient.onopen = () => {
        wsConnected = true;
        clearTimeout(wsReconnectTimer);
        updateServerStatusUI('online');
        wsClient.send(JSON.stringify({
          type: 'INIT_USER',
          user: state.me
        }));
      };

      wsClient.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleIncomingSyncData(data);
        } catch (err) {}
      };

      wsClient.onclose = () => {
        wsConnected = false;
        clearTimeout(wsReconnectTimer);
        updateServerStatusUI('offline');
        wsReconnectTimer = setTimeout(initRealtimeWebSocket, 3500);
      };

      wsClient.onerror = () => {
        wsConnected = false;
        updateServerStatusUI('offline');
      };
      return true;
    } catch (e) {
      wsConnected = false;
      updateServerStatusUI('offline');
      return false;
    }
  }

  // 2. Global Cloud Realtime Broker (For GitHub Pages https://jhanzu.github.io/Cinema/ - Zero server required!)
  function initRealtimeCloudBroker() {
    if (!window.Paho || !window.Paho.MQTT) {
      console.warn('Paho MQTT library not loaded, retrying WebSocket...');
      return initRealtimeWebSocket();
    }

    updateServerStatusUI('connecting');

    const brokers = [
      { host: 'broker.emqx.io', port: 8084, path: '/mqtt' },
      { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' }
    ];
    let bIdx = 0;

    function connectBroker() {
      const b = brokers[bIdx];
      const pahoId = `hanzu-${state.clientId}-${Math.random().toString(36).slice(2, 6)}`;

      try {
        if (mqttClient) {
          try { mqttClient.disconnect(); } catch (e) {}
        }

        mqttClient = new window.Paho.MQTT.Client(b.host, b.port, b.path, pahoId);

        mqttClient.onConnectionLost = (resp) => {
          mqttConnected = false;
          updateServerStatusUI('offline');
          bIdx = (bIdx + 1) % brokers.length;
          setTimeout(connectBroker, 3000);
        };

        mqttClient.onMessageArrived = (message) => {
          try {
            const data = JSON.parse(message.payloadString);
            handleIncomingSyncData(data);
          } catch (e) {}
        };

        mqttClient.connect({
          useSSL: true,
          timeout: 5,
          onSuccess: () => {
            mqttConnected = true;
            updateServerStatusUI('online');
            mqttClient.subscribe(CLOUD_ROOM_TOPIC, {
              onSuccess: () => {
                // Announce self & request live room state immediately
                broadcastSync({
                  type: 'PEER_JOIN',
                  user: state.me,
                  clientId: state.clientId
                });
                broadcastSync({
                  type: 'REQUEST_ROOM_SYNC',
                  from: state.clientId,
                  clientId: state.clientId
                });

                // Periodic Heartbeat every 6s
                clearInterval(peerHeartbeatTimer);
                peerHeartbeatTimer = setInterval(() => {
                  if (mqttConnected) {
                    broadcastSync({
                      type: 'HEARTBEAT',
                      user: state.me,
                      clientId: state.clientId
                    });
                  }
                  // Prune stale peers inactive >15s
                  const now = Date.now();
                  let changed = false;
                  Object.keys(state.peers).forEach((pid) => {
                    const last = peerLastSeen[pid] || state.peers[pid]?.lastSeen || 0;
                    if (now - last > 15000) {
                      delete peerLastSeen[pid];
                      delete state.peers[pid];
                      changed = true;
                    }
                  });
                  if (changed) {
                    refreshSeatsVisuals();
                    updateSkipVoteUI();
                  }
                }, 6000);
              }
            });
          },
          onFailure: (err) => {
            mqttConnected = false;
            updateServerStatusUI('offline');
            bIdx = (bIdx + 1) % brokers.length;
            setTimeout(connectBroker, 3500);
          }
        });
      } catch (err) {
        mqttConnected = false;
        updateServerStatusUI('offline');
        bIdx = (bIdx + 1) % brokers.length;
        setTimeout(connectBroker, 3500);
      }
    }

    connectBroker();
    return true;
  }

  function setupSyncListener() {
    // 1. Setup local BroadcastChannel for same-browser tabs
    if (syncChannel) {
      broadcastSync({ type: 'PEER_JOIN', user: state.me, clientId: state.clientId });
      broadcastSync({ type: 'REQUEST_ROOM_SYNC', from: state.clientId, clientId: state.clientId });
      syncChannel.onmessage = (event) => {
        handleIncomingSyncData(event.data);
      };
    }

    // 2. Setup Realtime Networking:
    // If running on localhost or LAN with node server.js: use native WebSocket
    // If on GitHub Pages (https://jhanzu.github.io/Cinema/): use Global Cloud Realtime Broker!
    const host = window.location.host;
    const isLocalNode = host.includes('localhost') || host.includes('127.0.0.1') || /^192\.168\./.test(host);
    const customWs = urlParams.get('ws') || localStorage.getItem('hanzu_cinema_ws_url');

    if (customWs || isLocalNode) {
      initRealtimeWebSocket();
    } else {
      initRealtimeCloudBroker();
    }

    window.addEventListener('beforeunload', () => {
      broadcastSync({ type: 'PEER_LEAVE', peerId: state.clientId, userId: state.me.id });
    });
  }

  // =========================================================================
  // 12. EVENT LISTENERS & UI CONTROLLERS
  // =========================================================================
  function bindUIEvents() {
    // Camera Mode Buttons
    document.querySelectorAll('[data-cam-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setCameraMode(btn.dataset.camMode));
    });

    // Sidebar Tabs
    document.querySelectorAll('.tab-trigger').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.activeTab = tab.dataset.tab;
        document.querySelectorAll('.tab-trigger').forEach((t) =>
          t.classList.toggle('active', t.dataset.tab === state.activeTab)
        );
        document.querySelectorAll('.sidebar-panel').forEach((p) =>
          p.classList.toggle('active', p.id === `panel-${state.activeTab}`)
        );
        if (state.activeTab === 'seats') {
          render2DSeatMap(getOccupantMap());
        }
      });
    });

    // Delegated click on 2D 100-Seat Grid (Fast, responsive, zero listener churn)
    const seatGrid2D = document.getElementById('seatGrid2D');
    if (seatGrid2D) {
      seatGrid2D.addEventListener('click', (e) => {
        const cell = e.target.closest('.seat-cell-2d, [data-seat], [data-seat-2d]');
        if (!cell) return;
        const targetSeat = cell.getAttribute('data-seat') || cell.getAttribute('data-seat-2d') || cell.dataset['seat-2d'] || cell.dataset.seat;
        if (targetSeat) {
          if (targetSeat === state.me.seat) {
            showToast(`💺 Bạn đang ngồi ở ghế ${targetSeat} rồi!`);
            return;
          }
          selectSeat(targetSeat);
        }
      });
    }

    // Sidebar quick random seat button
    document.getElementById('btnSidebarRandomSeat')?.addEventListener('click', () => {
      const free = findRandomFreeSeat(state.me.seat);
      selectSeat(free);
    });

    // Jump to / highlight viewer's seat on roster click
    document.getElementById('audienceRosterContainer')?.addEventListener('click', (e) => {
      const jumpBtn = e.target.closest('[data-jump-seat]');
      if (jumpBtn) {
        focusOnSeat(jumpBtn.dataset.jumpSeat);
      }
    });

    // Add YouTube Video Form
    const formAddVideo = document.getElementById('formAddVideo');
    if (formAddVideo) {
      formAddVideo.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('inputYoutubeUrl');
        const vid = extractYouTubeId(input.value);
        if (!vid) {
          showToast('⚠️ Link YouTube không hợp lệ! Hãy dán link youtube.com hoặc youtu.be');
          return;
        }
        input.value = '';
        addVideoToQueue(vid);
      });
    }

    // Send Chat Form
    const formSendChat = document.getElementById('formSendChat');
    if (formSendChat) {
      formSendChat.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('inputChatMessage');
        sendChatMessage(input.value);
        input.value = '';
      });
    }

    // YouTube Core Player Functions
    function togglePlayPause() {
      if ((!state.currentVideo || !state.currentVideo.videoId) && state.queue && state.queue.length > 0) {
        playNextFromQueue('Bắt đầu chiếu từ hàng đợi');
        return;
      }
      if (!ytReady || !ytPlayer) {
        showToast('⏳ Trình phát đang khởi động...');
        return;
      }
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      try {
        const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
        if (pState === 1) {
          if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
          state.isPlaying = false;
          broadcastSync({ type: 'SYNC_PLAY_PAUSE', isPlaying: false, by: state.me.name });
        } else {
          if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
          state.isPlaying = true;
          broadcastSync({ type: 'SYNC_PLAY_PAUSE', isPlaying: true, by: state.me.name });
        }
        updatePlayPauseButton();
      } catch (e) {}
    }

    function seekRelative(deltaSeconds) {
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      if (!ytReady || !ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
      const current = ytPlayer.getCurrentTime() || 0;
      const duration = (ytPlayer.getDuration && ytPlayer.getDuration()) || 0;
      const target = Math.max(0, Math.min(duration || Infinity, current + deltaSeconds));
      ytPlayer.seekTo(target, true);
      updateScrubberUI(target, duration);
      broadcastSync({ type: 'SYNC_SEEK', time: target, by: state.me.name });
    }

    function seekToSeconds(targetSec, broadcast = true) {
      if (broadcast && isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      if (!ytReady || !ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
      const duration = (ytPlayer.getDuration && ytPlayer.getDuration()) || 0;
      const target = Math.max(0, Math.min(duration || Infinity, targetSec));
      ytPlayer.seekTo(target, true);
      updateScrubberUI(target, duration);
      if (broadcast) {
        broadcastSync({ type: 'SYNC_SEEK', time: target, by: state.me.name });
      }
    }

    function isScreenFullscreen() {
      const frame = document.getElementById('cinemaScreenFrame');
      return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        (frame && frame.classList.contains('is-fullscreen'))
      );
    }

    function toggleFullscreen() {
      const frame = document.getElementById('cinemaScreenFrame') || document.documentElement;
      const isFs = isScreenFullscreen();

      if (!isFs) {
        // Enter Fullscreen on Cinema Screen Frame
        if (frame.requestFullscreen) {
          frame.requestFullscreen().catch(() => {
            enterPseudoFullscreen(frame);
          });
        } else if (frame.webkitRequestFullscreen) {
          frame.webkitRequestFullscreen();
        } else {
          enterPseudoFullscreen(frame);
        }

        try {
          if (screen.orientation && typeof screen.orientation.lock === 'function') {
            screen.orientation.lock('landscape').catch(() => {});
          }
        } catch (_) {}

        frame.classList.add('is-fullscreen');
        document.body.classList.add('cinema-screen-is-fullscreen');
        updateFullscreenIcons(true);
        showToast('⛶ Đã phóng to toàn bộ màn chiếu');
      } else {
        // Exit Fullscreen
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
        exitPseudoFullscreen(frame);

        try {
          if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
          }
        } catch (_) {}

        frame.classList.remove('is-fullscreen');
        document.body.classList.remove('cinema-screen-is-fullscreen');
        updateFullscreenIcons(false);
        showToast('Thu nhỏ về chế độ phòng rạp 3D');
      }
    }

    function enterPseudoFullscreen(frame) {
      if (frame) frame.classList.add('is-fullscreen');
      document.body.classList.add('cinema-screen-is-fullscreen');
      updateFullscreenIcons(true);
    }

    function exitPseudoFullscreen(frame) {
      if (frame) frame.classList.remove('is-fullscreen');
      document.body.classList.remove('cinema-screen-is-fullscreen');
      updateFullscreenIcons(false);
    }

    function updateFullscreenIcons(isFs) {
      const icon = document.getElementById('screenFsIcon');
      if (icon) icon.textContent = isFs ? '✕' : '⛶';
      const btn = document.getElementById('btnScreenFullscreen');
      if (btn) btn.title = isFs ? 'Thu nhỏ màn chiếu (Phím F hoặc Esc)' : 'Phóng to toàn bộ màn chiếu cho máy tính / điện thoại (Phím F)';
    }

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const frame = document.getElementById('cinemaScreenFrame');
      if (!isFs && frame) {
        frame.classList.remove('is-fullscreen');
        document.body.classList.remove('cinema-screen-is-fullscreen');
      }
      updateFullscreenIcons(isFs);
    });

    document.addEventListener('webkitfullscreenchange', () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const frame = document.getElementById('cinemaScreenFrame');
      if (!isFs && frame) {
        frame.classList.remove('is-fullscreen');
        document.body.classList.remove('cinema-screen-is-fullscreen');
      }
      updateFullscreenIcons(isFs);
    });

    let rippleTimer = null;
    function showRippleBadge(icon, text, position = 'center') {
      const badge = document.getElementById('screenRippleBadge');
      if (!badge) return;
      badge.className = 'screen-ripple-badge';
      const iconEl = badge.querySelector('.srb-icon');
      const textEl = badge.querySelector('.srb-text');
      if (iconEl) iconEl.textContent = icon;
      if (textEl) textEl.textContent = text;
      badge.classList.add('animate', position);
      clearTimeout(rippleTimer);
      rippleTimer = setTimeout(() => {
        badge.className = 'screen-ripple-badge';
      }, 650);
    }

    // Auto-hide screen HUD timer
    let screenIdleTimer = null;
    const screenOverlay = document.getElementById('screenInteractiveOverlay');
    function wakeScreenControls() {
      if (!screenOverlay) return;
      screenOverlay.classList.remove('user-idle');
      screenOverlay.classList.add('user-active');
      clearTimeout(screenIdleTimer);
      if (state.isPlaying) {
        screenIdleTimer = setTimeout(() => {
          screenOverlay.classList.remove('user-active');
          screenOverlay.classList.add('user-idle');
        }, 2800);
      }
    }

    if (screenOverlay) {
      screenOverlay.addEventListener('pointermove', wakeScreenControls);
      screenOverlay.addEventListener('pointerdown', wakeScreenControls);
      screenOverlay.addEventListener('mouseleave', () => {
        if (state.isPlaying) {
          screenOverlay.classList.remove('user-active');
          screenOverlay.classList.add('user-idle');
        }
      });
    }

    // Single Click vs Double Click on Screen Center
    const screenClickArea = document.getElementById('screenClickArea');
    let screenClickTimer = null;
    if (screenClickArea) {
      screenClickArea.addEventListener('click', (e) => {
        if (screenClickTimer) {
          clearTimeout(screenClickTimer);
          screenClickTimer = null;
          // Double click detected
          const rect = screenClickArea.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = clickX / rect.width;
          if (ratio < 0.35) {
            if (isPlaybackLocked()) {
              notifyPlaybackLocked();
              return;
            }
            seekRelative(-10);
            showRippleBadge('⏪', '-10s', 'left');
          } else if (ratio > 0.65) {
            if (isPlaybackLocked()) {
              notifyPlaybackLocked();
              return;
            }
            seekRelative(+10);
            showRippleBadge('⏩', '+10s', 'right');
          } else {
            toggleFullscreen();
          }
        } else {
          screenClickTimer = setTimeout(() => {
            screenClickTimer = null;
            if (isPlaybackLocked()) {
              notifyPlaybackLocked();
              return;
            }
            togglePlayPause();
            showRippleBadge(state.isPlaying ? '▶️' : '⏸️', state.isPlaying ? 'Đang phát' : 'Tạm dừng', 'center');
          }, 240);
        }
      });
    }

    // Screen HUD Buttons
    document.getElementById('btnScreenPlayPause')?.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayPause();
      showRippleBadge(state.isPlaying ? '▶️' : '⏸️', state.isPlaying ? 'Đang phát' : 'Tạm dừng', 'center');
    });

    document.getElementById('btnScreenRewind10')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      seekRelative(-10);
      showRippleBadge('⏪', '-10s', 'left');
    });

    document.getElementById('btnScreenForward10')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      seekRelative(+10);
      showRippleBadge('⏩', '+10s', 'right');
    });

    document.getElementById('btnScreenNextVideo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      playNextFromQueue('Chuyển bài từ màn hình');
    });

    // Next Playing Card Click -> Jump to Queue
    document.getElementById('hudNextPlayingCard')?.addEventListener('click', () => {
      const tabQueueBtn = document.querySelector('.tab-trigger[data-tab="queue"]');
      if (tabQueueBtn) tabQueueBtn.click();
      if (state.queue && state.queue.length > 0) {
        showToast(`🎵 Bài tiếp theo: "${state.queue[0].title}" (${state.queue[0].votes} vote)`);
      } else {
        showToast('ℹ️ Hàng đợi đang trống. Hãy dán link YouTube để thêm bài mới!');
        const input = document.getElementById('inputYoutubeUrl');
        if (input) input.focus();
      }
    });

    document.getElementById('btnScreenFullscreen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });

    // Center Play Button (appears when paused)
    document.getElementById('screenCenterPlayBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((!state.currentVideo || !state.currentVideo.videoId) && state.queue && state.queue.length > 0) {
        playNextFromQueue('Bắt đầu chiếu từ hàng đợi');
        return;
      }
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      togglePlayPause();
      showRippleBadge('▶️', 'Đang phát', 'center');
    });

    // Toggle Native YouTube Controls Passthrough Mode
    document.getElementById('btnToggleNativeYt')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const frame = document.getElementById('cinemaScreenFrame');
      if (!frame) return;
      const isNative = frame.classList.toggle('native-yt-active');
      const btn = e.currentTarget;
      if (isNative) {
        btn.textContent = '🎬 Giao diện Rạp';
        btn.title = 'Trở về giao diện điều khiển Rạp Hanzu Cinema';
        showToast('⚙️ Đã bật tương tác trực tiếp YouTube gốc (Bấm gear để chỉnh 1080p, phụ đề, âm thanh)');
      } else {
        btn.textContent = '⚙️ YouTube Gốc';
        btn.title = 'Chuyển sang tương tác menu cài đặt gốc YouTube';
        showToast('🎬 Đã quay lại giao diện điều khiển Rạp Cinema');
      }
    });

    document.getElementById('btnScreenFocusMode')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.cameraMode === 'focus') {
        setCameraMode('orbit');
        e.currentTarget.textContent = '⛶ Rạp IMAX';
        showToast('🎥 Trở về góc nhìn rạp 3D');
      } else {
        setCameraMode('focus');
        e.currentTarget.textContent = '↩️ Thoát IMAX';
        showToast('🎬 Đã chuyển sang chế độ cận cảnh Rạp IMAX');
      }
    });

    // Auto Skip Ads Button & Settings Toggle
    document.getElementById('btnToggleAutoSkipAds')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isAdPlaying) {
        forceSkipAdNow();
        showToast('⚡ Đang ép bỏ qua quảng cáo ngay lập tức...');
        return;
      }
      state.autoSkipAds = !state.autoSkipAds;
      localStorage.setItem('hanzu_cinema_auto_skip_ads', state.autoSkipAds ? 'true' : 'false');
      updateAutoSkipAdsUI();
      if (state.autoSkipAds) {
        showToast('🛡️ Tính năng Tự động bỏ qua quảng cáo: ĐÃ BẬT');
      } else {
        showToast('⚠️ Tính năng Tự động bỏ qua quảng cáo: ĐÃ TẮT');
      }
    });

    // Personal Subtitles Toggle Buttons
    document.getElementById('btnScreenToggleSubtitles')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSubtitles();
    });
    document.getElementById('btnDockToggleSubtitles')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSubtitles();
    });

    document.getElementById('checkModalAutoSkipAds')?.addEventListener('change', (e) => {
      state.autoSkipAds = e.target.checked;
      localStorage.setItem('hanzu_cinema_auto_skip_ads', state.autoSkipAds ? 'true' : 'false');
      updateAutoSkipAdsUI();
    });

    document.getElementById('btnScreenExternalYt')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentVideo && state.currentVideo.videoId) {
        openInPageCinemaWindow(state.currentVideo.videoId, state.currentVideo.title);
        showToast('🎬 Đã mở cửa sổ rạp iframe trực tiếp trong web! (Không mở web mới)');
      }
    });

    // Playback Speed Selector (Cycles: 1x -> 1.25x -> 1.5x -> 2x -> 0.5x -> 0.75x)
    const SPEED_LIST = [1, 1.25, 1.5, 2, 0.5, 0.75];
    let currentSpeedIdx = 0;
    document.getElementById('btnScreenSpeed')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaybackLocked()) {
        notifyPlaybackLocked();
        return;
      }
      if (!ytReady || !ytPlayer || typeof ytPlayer.setPlaybackRate !== 'function') return;
      currentSpeedIdx = (currentSpeedIdx + 1) % SPEED_LIST.length;
      const speed = SPEED_LIST[currentSpeedIdx];
      try {
        ytPlayer.setPlaybackRate(speed);
        const lbl = document.getElementById('screenSpeedLabel');
        if (lbl) lbl.textContent = `${speed}x`;
        showToast(`⚡ Tốc độ phát: ${speed}x`);
      } catch (err) {}
    });

    // Screen Mute Toggle
    document.getElementById('btnScreenMute')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('btnMuteToggle')?.click();
    });

    // Screen Volume Slider Sync
    document.getElementById('screenVolumeSlider')?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = Number(e.target.value);
      state.volume = val;
      const bottomSlider = document.getElementById('volumeSlider');
      if (bottomSlider) {
        bottomSlider.value = val;
        bottomSlider.title = `Âm lượng: ${val}%`;
      }
      const valLabel = document.getElementById('volumeValueLabel');
      if (valLabel) valLabel.textContent = `${val}%`;

      if (ytReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        try {
          ytPlayer.setVolume(val);
          const screenMuteIcon = document.getElementById('screenMuteIcon');
          const muteBtn = document.getElementById('btnMuteToggle');
          if (val > 0 && ytPlayer.isMuted()) {
            ytPlayer.unMute();
            state.isMuted = false;
            if (muteBtn) muteBtn.textContent = '🔊';
            if (screenMuteIcon) screenMuteIcon.textContent = '🔊';
          } else if (val === 0) {
            ytPlayer.mute();
            state.isMuted = true;
            if (muteBtn) muteBtn.textContent = '🔇';
            if (screenMuteIcon) screenMuteIcon.textContent = '🔇';
          }
        } catch (err) {}
      }
    });

    // YouTube Scrubber Dragging & Scrubbing
    let isScrubbing = false;
    const scrubberContainer = document.getElementById('ytScrubberContainer');
    const hoverPreview = document.getElementById('ytHoverPreview');

    if (scrubberContainer) {
      const getScrubCalc = (clientX) => {
        const rect = scrubberContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const ratio = rect.width > 0 ? pos / rect.width : 0;
        const dur = (ytReady && ytPlayer && ytPlayer.getDuration && ytPlayer.getDuration()) || 0;
        return { ratio, time: ratio * dur, pos };
      };

      scrubberContainer.addEventListener('mousemove', (e) => {
        const calc = getScrubCalc(e.clientX);
        if (hoverPreview) {
          hoverPreview.textContent = formatTime(calc.time);
          hoverPreview.style.left = `${calc.pos}px`;
        }
      });

      scrubberContainer.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (isPlaybackLocked()) {
          notifyPlaybackLocked();
          return;
        }
        isScrubbing = true;
        scrubberContainer.classList.add('is-scrubbing');
        const calc = getScrubCalc(e.clientX);
        const dur = (ytReady && ytPlayer && ytPlayer.getDuration && ytPlayer.getDuration()) || 0;
        updateScrubberUI(calc.time, dur);

        const onPointerMove = (mEvt) => {
          const moveCalc = getScrubCalc(mEvt.clientX);
          updateScrubberUI(moveCalc.time, dur);
        };

        const onPointerUp = (uEvt) => {
          isScrubbing = false;
          scrubberContainer.classList.remove('is-scrubbing');
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          const upCalc = getScrubCalc(uEvt.clientX);
          seekToSeconds(upCalc.time, true);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
    }

    // High frequency time & buffer tracker (every 250ms)
    setInterval(() => {
      if (!ytReady || !ytPlayer || !state.isPlaying || isScrubbing) return;
      try {
        const cur = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
        const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
        if (dur && dur > MAX_VIDEO_DURATION_SECONDS) {
          enforceVideoLimit(dur);
          return;
        }
        const buf = ytPlayer.getVideoLoadedFraction ? ytPlayer.getVideoLoadedFraction() : 0;
        updateScrubberUI(cur, dur, buf);
      } catch (err) {}
    }, 250);

    // Player Controls (Bottom Dock)
    document.getElementById('btnPlayPause')?.addEventListener('click', () => {
      togglePlayPause();
    });

    document.getElementById('btnMuteToggle')?.addEventListener('click', (e) => {
      if (!ytReady || !ytPlayer) return;
      const screenMuteIcon = document.getElementById('screenMuteIcon');
      try {
        if (ytPlayer.isMuted()) {
          ytPlayer.unMute();
          ytPlayer.setVolume(state.volume || 25);
          state.isMuted = false;
          e.currentTarget.textContent = '🔊';
          if (screenMuteIcon) screenMuteIcon.textContent = '🔊';
        } else {
          ytPlayer.mute();
          state.isMuted = true;
          e.currentTarget.textContent = '🔇';
          if (screenMuteIcon) screenMuteIcon.textContent = '🔇';
        }
      } catch (err) {}
    });

    document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
      state.volume = Number(e.target.value);
      e.target.title = `Âm lượng: ${state.volume}%`;
      const valLabel = document.getElementById('volumeValueLabel');
      if (valLabel) valLabel.textContent = `${state.volume}%`;
      if (ytReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        try {
          ytPlayer.setVolume(state.volume);
          const muteBtn = document.getElementById('btnMuteToggle');
          if (state.volume > 0 && ytPlayer.isMuted()) {
            ytPlayer.unMute();
            state.isMuted = false;
            if (muteBtn) muteBtn.textContent = '🔊';
          } else if (state.volume === 0) {
            ytPlayer.mute();
            state.isMuted = true;
            if (muteBtn) muteBtn.textContent = '🔇';
          }
        } catch (err) {}
      }
    });

    document.getElementById('btnVoteSkip')?.addEventListener('click', handleVoteSkip);

    document.getElementById('btnResetCamera')?.addEventListener('click', () => {
      setCameraMode('orbit');
    });

    // Reaction Dock Buttons
    document.querySelectorAll('[data-react]').forEach((btn) => {
      btn.addEventListener('click', () => {
        spawnSeatReaction3D(state.me.seat, btn.dataset.react, true, true);
      });
    });

    // Toggle Cinema Lights Dimmer
    document.getElementById('btnToggleLights')?.addEventListener('click', (e) => {
      state.lightsDimmed = !state.lightsDimmed;
      document.documentElement.style.setProperty('--cinema-dim', state.lightsDimmed ? '0.82' : '0.35');
      e.currentTarget.classList.toggle('active', state.lightsDimmed);
      showToast(state.lightsDimmed ? '🌑 Đã tắt bớt đèn rạp để tập trung xem' : '💡 Đã bật đèn rạp');
    });

    // Share Room Invite Link
    document.getElementById('btnShareRoom')?.addEventListener('click', async () => {
      let shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomCode)}`;
      try {
        const res = await fetch('/api/info');
        if (res.ok) {
          const info = await res.json();
          if (['localhost', '127.0.0.1'].includes(window.location.hostname) && info.lanUrl) {
            shareUrl = `${info.lanUrl}${window.location.pathname}?room=${encodeURIComponent(state.roomCode)}`;
          }
        }
      } catch (e) {}

      // Attach ?ws= URL parameter so anyone who clicks the link connects to the EXACT same server!
      if (currentWsUrl && !currentWsUrl.includes('localhost') && !currentWsUrl.includes('127.0.0.1')) {
        shareUrl += `&ws=${encodeURIComponent(currentWsUrl)}`;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl);
      }
      showToast(`🔗 Đã sao chép link rạp kèm máy chủ chung! Gửi ngay cho bạn bè để vào cùng phòng chiếu.`, 4800);
    });



    // Profile Modal
    const profileModal = document.getElementById('profileModal');
    const emojiGrid = document.getElementById('emojiPickerGrid');
    if (emojiGrid) {
      emojiGrid.innerHTML = AVATAR_EMOJIS.map(
        (em) => `<button type="button" class="emoji-choice ${em === state.me.emoji && !state.me.avatar ? 'selected' : ''}" data-em="${em}">${em}</button>`
      ).join('');
      emojiGrid.querySelectorAll('[data-em]').forEach((btn) => {
        btn.addEventListener('click', () => {
          emojiGrid.querySelectorAll('[data-em]').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.me.emoji = btn.dataset.em;
          state.me.avatar = null;
          updateProfilePreview();
        });
      });
    }

    // Update Live Preview in Profile Modal
    const updateProfilePreview = () => {
      const pName = document.getElementById('previewName');
      const pEmoji = document.getElementById('previewEmoji');
      const pGender = document.getElementById('previewGenderTag');
      const pSeat = document.getElementById('previewSeat');
      const pAvatarImg = document.getElementById('previewAvatarImg');
      const customRow = document.getElementById('avatarCustomPhotoRow');
      const customThumb = document.getElementById('avatarCustomThumb');
      const btnClear = document.getElementById('btnClearAvatar');
      const emojiGridEl = document.getElementById('emojiPickerGrid');

      if (pName) pName.textContent = state.me.name || 'Khán giả';
      if (pGender) pGender.textContent = state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨');
      if (pSeat) pSeat.textContent = state.me.seat || 'E5';

      if (state.me.avatar) {
        if (pAvatarImg) {
          pAvatarImg.src = state.me.avatar;
          pAvatarImg.style.display = 'block';
        }
        if (pEmoji) pEmoji.style.display = 'none';
        if (customRow) customRow.style.display = 'flex';
        if (customThumb) customThumb.src = state.me.avatar;
        if (btnClear) btnClear.style.display = 'inline-flex';
        if (emojiGridEl) {
          emojiGridEl.style.opacity = '0.55';
          emojiGridEl.querySelectorAll('.emoji-choice').forEach((b) => b.classList.remove('selected'));
        }
      } else {
        if (pAvatarImg) pAvatarImg.style.display = 'none';
        if (pEmoji) {
          pEmoji.style.display = 'block';
          pEmoji.textContent = state.me.emoji || '😎';
        }
        if (customRow) customRow.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        if (emojiGridEl) {
          emojiGridEl.style.opacity = '1';
          emojiGridEl.querySelectorAll('.emoji-choice').forEach((b) => {
            if (b.dataset.em === state.me.emoji) b.classList.add('selected');
          });
        }
      }
    };

    // Avatar upload & change handling
    const inputAvatarFile = document.getElementById('inputAvatarFile');
    const btnUploadAvatar = document.getElementById('btnUploadAvatar');
    const btnClearAvatar = document.getElementById('btnClearAvatar');
    const btnChangeAvatarPhoto = document.getElementById('btnChangeAvatarPhoto');

    btnUploadAvatar?.addEventListener('click', () => {
      inputAvatarFile?.click();
    });
    btnChangeAvatarPhoto?.addEventListener('click', () => {
      inputAvatarFile?.click();
    });

    inputAvatarFile?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        showToast('⏳ Đang xử lý & nén ảnh avatar...');
        const dataUrl = await processAvatarImageFile(file);
        state.me.avatar = dataUrl;
        updateProfilePreview();
        showToast('✨ Đã tải ảnh đại diện từ máy thành công!');
      } catch (err) {
        showToast('⚠️ ' + (err.message || 'Không thể đọc file ảnh'));
      }
      e.target.value = '';
    });

    btnClearAvatar?.addEventListener('click', () => {
      state.me.avatar = null;
      updateProfilePreview();
      showToast('😎 Đã chuyển về dùng Emoji đại diện');
    });

    // Gender Card Selection
    document.querySelectorAll('#genderSelectorGrid .gender-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#genderSelectorGrid .gender-card').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.me.gender = btn.dataset.gender;
        if (state.me.gender === 'female') {
          state.me.color = '#F43F5E';
        } else if (state.me.gender === 'other') {
          state.me.color = '#F59E0B';
        } else {
          state.me.color = '#38BDF8';
        }
        updateProfilePreview();
      });
    });

    // Real-time name input preview & uniqueness validator
    document.getElementById('inputProfileName')?.addEventListener('input', (e) => {
      const val = e.target.value.trim() || 'Khán giả';
      state.me.name = val;
      const warnEl = document.getElementById('nameDuplicateWarning');
      if (warnEl) {
        const taken = isNameTaken(val, state.me.id);
        warnEl.style.display = taken ? 'block' : 'none';
        if (taken) {
          const suggested = makeUniqueName(val, state.me.id);
          warnEl.innerHTML = `⚠️ Tên "${escapeHtml(val)}" đã có người trong rạp dùng (sẽ tự đặt là <strong>"${escapeHtml(suggested)}"</strong> để độc lập)`;
        }
      }
      updateProfilePreview();
    });

    const openProfile = (isOnboarding = false) => {
      profileModal?.classList.add('open');
      const title = document.getElementById('profileModalTitle');
      const submitBtn = document.getElementById('btnSubmitProfile');
      if (title && submitBtn) {
        if (isOnboarding) {
          title.textContent = '✨ Chào mừng đến với Hanzu Cinema';
          submitBtn.textContent = '🎬 Vào Rạp Chiếu Phim';
        } else {
          title.textContent = '⚙️ Cài đặt & Đổi tên khán giả';
          submitBtn.textContent = '💾 Lưu tên & Cài đặt';
        }
      }
      const input = document.getElementById('inputProfileName');
      if (input) {
        input.value = state.me.name;
        if (typeof input.focus === 'function') input.focus();
        if (typeof input.select === 'function') input.select();
      }
      const warnEl = document.getElementById('nameDuplicateWarning');
      if (warnEl) warnEl.style.display = 'none';
      updateProfilePreview();
    };

    const closeProfile = () => {
      profileModal?.classList.remove('open');
    };

    document.getElementById('btnOpenProfile')?.addEventListener('click', () => openProfile(false));
    document.getElementById('btnOpenSettings')?.addEventListener('click', () => openProfile(false));
    document.getElementById('btnSidebarChangeName')?.addEventListener('click', () => openProfile(false));
    document.getElementById('btnCloseProfile')?.addEventListener('click', closeProfile);

    // Close modal on click outside
    profileModal?.addEventListener('click', (e) => {
      if (e.target === profileModal) {
        closeProfile();
      }
    });

    document.getElementById('btnRandomEmptySeat')?.addEventListener('click', () => {
      const nameInput = document.getElementById('inputProfileName');
      if (nameInput && nameInput.value.trim()) {
        let n = nameInput.value.trim();
        if (isNameTaken(n, state.me.id)) {
          n = makeUniqueName(n, state.me.id);
          nameInput.value = n;
        }
        state.me.name = n;
      }
      const pick = findRandomFreeSeat(state.me.seat);
      selectSeat(pick);
      updateProfilePreview();
      saveProfileToStorage();
    });

    document.getElementById('formSaveProfile')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('inputProfileName');
      let enteredName = (nameInput && nameInput.value.trim()) || 'Khán giả';
      if (isNameTaken(enteredName, state.me.id)) {
        const unique = makeUniqueName(enteredName, state.me.id);
        showToast(`⚠️ Tên "${enteredName}" đã có người đặt trong rạp! Hệ thống tự động đặt tên bạn là "${unique}" để đảm bảo độc lập.`);
        enteredName = unique;
        if (nameInput) nameInput.value = unique;
      }
      state.me.name = enteredName;
      state.me.hasConfigured = true;
      saveProfileToStorage();
      const myNavAvatarImg = document.getElementById('myNavAvatarImg');
      if (myNavAvatarImg) {
        if (state.me.avatar) {
          myNavAvatarImg.src = state.me.avatar;
          myNavAvatarImg.style.display = 'inline-block';
        } else {
          myNavAvatarImg.style.display = 'none';
        }
      }
      const myNavEmoji = document.getElementById('myNavEmoji');
      if (myNavEmoji) myNavEmoji.style.display = state.me.avatar ? 'none' : 'inline';
      refreshSeatsVisuals();
      closeProfile();
      sfx.playSeat();
      showToast(`✅ Đã đổi tên thành "${state.me.name}" thành công!`);
      broadcastSync({ type: 'SEAT_CHANGE', seat: state.me.seat, user: state.me });
      broadcastSync({ type: 'PROFILE_UPDATE', user: state.me });
    });

    // Server Settings Modal Event Handlers
    const serverModal = document.getElementById('serverSettingsModal');
    const openServerSettings = () => {
      serverModal?.classList.add('open');
      const input = document.getElementById('inputCustomWsUrl');
      if (input) input.value = currentWsUrl || getTargetWsUrl();
    };
    const closeServerSettings = () => {
      serverModal?.classList.remove('open');
    };

    document.getElementById('btnOpenServerSettings')?.addEventListener('click', openServerSettings);
    document.getElementById('btnCloseServerSettings')?.addEventListener('click', closeServerSettings);
    serverModal?.addEventListener('click', (e) => {
      if (e.target === serverModal) closeServerSettings();
    });

    document.getElementById('btnResetDefaultServer')?.addEventListener('click', () => {
      localStorage.removeItem('hanzu_cinema_ws_url');
      const input = document.getElementById('inputCustomWsUrl');
      if (input) input.value = 'wss://cinema-8pqa.onrender.com/ws';
      showToast('🔄 Đã đặt lại địa chỉ máy chủ mặc định.');
    });

    document.getElementById('btnConnectWsNow')?.addEventListener('click', () => {
      const input = document.getElementById('inputCustomWsUrl');
      const newUrl = input?.value.trim();
      if (newUrl) {
        localStorage.setItem('hanzu_cinema_ws_url', newUrl);
        initRealtimeWebSocket();
        showToast('⚡ Đang kết nối lại máy chủ...');
      }
    });

    document.getElementById('btnSaveServerSettings')?.addEventListener('click', () => {
      const input = document.getElementById('inputCustomWsUrl');
      const newUrl = input?.value.trim();
      if (newUrl) {
        localStorage.setItem('hanzu_cinema_ws_url', newUrl);
        initRealtimeWebSocket();
      }
      closeServerSettings();
      showToast('💾 Đã lưu cấu hình máy chủ phòng chiếu!');
    });

    // Unavailable Video Warning Modal Events
    document.getElementById('btnConfirmUnavailableVideo')?.addEventListener('click', () => {
      hideUnavailableVideoPopup();
    });
    document.getElementById('unavailableVideoModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'unavailableVideoModal') {
        hideUnavailableVideoPopup();
      }
    });


    // Solo Viewer Mixer Queue Controls & Modal Events
    const updateMixerCountUI = (newVal) => {
      state.mixerCount = Math.max(1, Math.min(50, newVal));
      const lbl = document.getElementById('smAddCountLabel');
      if (lbl) lbl.textContent = state.mixerCount;
      const customInput = document.getElementById('inputCustomMixerCount');
      if (customInput && parseInt(customInput.value, 10) !== state.mixerCount) {
        customInput.value = state.mixerCount;
      }
      document.querySelectorAll('#smCountPills .sm-pill-btn').forEach((b) => {
        if (parseInt(b.dataset.count, 10) === state.mixerCount) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    };

    document.querySelectorAll('#smCountPills .sm-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.count || '5', 10);
        updateMixerCountUI(val);
      });
    });

    const customMixerInput = document.getElementById('inputCustomMixerCount');
    customMixerInput?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 1) {
        updateMixerCountUI(val);
      }
    });
    customMixerInput?.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 50) val = 50;
      updateMixerCountUI(val);
    });

    document.getElementById('toggleMixerNoDuplicate')?.addEventListener('change', (e) => {
      state.mixerNoDuplicate = e.target.checked;
      try {
        localStorage.setItem('hanzu_mixer_no_duplicate', state.mixerNoDuplicate ? 'true' : 'false');
      } catch (_) {}
      updateMixerHistoryUI();
      showToast(state.mixerNoDuplicate ? '🔒 Đã BẬT: Các lần mix sau sẽ không trùng lặp bài cũ' : '🔓 Đã TẮT: Cho phép gợi ý lại các bài đã nghe');
    });

    document.getElementById('btnResetMixerHistory')?.addEventListener('click', () => {
      if (state.mixerHistoryVideoIds) state.mixerHistoryVideoIds.clear();
      saveMixerHistoryToStorage();
      showToast('🔄 Đã xóa bộ nhớ bài cũ! Các lần mix tiếp theo có thể gợi ý lại từ đầu.');
    });

    // Solo Queue Toolbar & Batch Delete Event Listeners
    document.getElementById('btnToggleQueueSelectMode')?.addEventListener('click', () => {
      state.queueSelectMode = !state.queueSelectMode;
      if (!state.queueSelectMode) state.selectedQueueItemIds.clear();
      renderQueue();
    });

    document.getElementById('btnClearAllQueue')?.addEventListener('click', () => {
      clearAllQueue();
    });

    document.getElementById('btnCloseQueueSelectMode')?.addEventListener('click', () => {
      state.queueSelectMode = false;
      state.selectedQueueItemIds.clear();
      renderQueue();
    });

    document.getElementById('btnSelectAllQueue')?.addEventListener('click', () => {
      (state.queue || []).forEach((q) => state.selectedQueueItemIds.add(q.id));
      renderQueue();
    });

    document.getElementById('btnDeselectAllQueue')?.addEventListener('click', () => {
      state.selectedQueueItemIds.clear();
      renderQueue();
    });

    document.getElementById('btnDeleteSelectedQueue')?.addEventListener('click', () => {
      deleteSelectedQueueItems();
    });

    document.getElementById('btnMixerClearQueue')?.addEventListener('click', () => {
      clearAllQueue();
    });

    document.getElementById('btnMixerAddNow')?.addEventListener('click', () => {
      triggerAutoMixQueue(state.mixerCount || 5);
    });

    document.getElementById('btnOpenMixerPreview')?.addEventListener('click', openMixerPreviewModal);
    document.getElementById('btnCloseMixerModal')?.addEventListener('click', closeMixerPreviewModal);
    document.getElementById('btnCancelMixerModal')?.addEventListener('click', closeMixerPreviewModal);
    document.getElementById('mixerPreviewModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'mixerPreviewModal') closeMixerPreviewModal();
    });

    document.getElementById('btnSelectAllMixer')?.addEventListener('click', () => {
      const listEl = document.getElementById('mixerSongsList');
      if (!listEl) return;
      listEl.querySelectorAll('.mixer-checkbox').forEach((cb) => {
        cb.checked = true;
        cb.closest('.mixer-song-item')?.classList.add('selected');
      });
      const countText = document.getElementById('mixerSelectedCountText');
      if (countText) countText.textContent = listEl.querySelectorAll('.mixer-checkbox').length;
    });

    document.getElementById('btnDeselectAllMixer')?.addEventListener('click', () => {
      const listEl = document.getElementById('mixerSongsList');
      if (!listEl) return;
      listEl.querySelectorAll('.mixer-checkbox').forEach((cb) => {
        cb.checked = false;
        cb.closest('.mixer-song-item')?.classList.remove('selected');
      });
      const countText = document.getElementById('mixerSelectedCountText');
      if (countText) countText.textContent = '0';
    });

    document.getElementById('btnConfirmMixerAdd')?.addEventListener('click', async () => {
      const listEl = document.getElementById('mixerSongsList');
      if (!listEl || !state.mixerRecommendations) return;
      const checkedBoxes = Array.from(listEl.querySelectorAll('.mixer-checkbox:checked'));
      if (checkedBoxes.length === 0) {
        showToast('⚠️ Vui lòng chọn ít nhất 1 bài để thêm vào hàng đợi.');
        return;
      }
      const selectedTracks = checkedBoxes.map((cb) => state.mixerRecommendations[parseInt(cb.dataset.idx, 10)]).filter(Boolean);
      closeMixerPreviewModal();
      await addMixedVideosToQueue(selectedTracks);
    });

    // Video Duration Limit Modal Events
    document.getElementById('btnConfirmVideoLimit')?.addEventListener('click', () => {
      hideVideoLimitPopup();
    });
    document.getElementById('videoLimitModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'videoLimitModal') {
        hideVideoLimitPopup();
      }
    });

    // Global PostMessage listener for YouTube Player Iframe errors (strictly for active cinema screen only)
    window.addEventListener('message', (event) => {
      try {
        if (!event.data) return;
        if (event.origin && !event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com')) {
          return;
        }
        const cinemaIframe = getCinemaPlayerIframe();
        if (!cinemaIframe || event.source !== cinemaIframe.contentWindow) {
          return; // strictly ignore background probe iframes or external dialogs
        }
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.event === 'onError') {
          const code = Number(data.info || 150);
          handleVideoPlayError(code);
        }
      } catch (_) {}
    });

    // Auto-open Onboarding Modal on first visit if not yet configured
    if (!state.me.hasConfigured) {
      setTimeout(() => {
        openProfile(true);
      }, 500);
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const uvModal = document.getElementById('unavailableVideoModal');
      if (uvModal && uvModal.classList.contains('open')) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          hideUnavailableVideoPopup();
          return;
        }
      }

      const vlModal = document.getElementById('videoLimitModal');
      if (vlModal && vlModal.classList.contains('open')) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          hideVideoLimitPopup();
          return;
        }
      }

      

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          closeProfile();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isScreenFullscreen()) {
          toggleFullscreen();
          return;
        }
        closeProfile();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleSubtitles();
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (isPlaybackLocked()) {
          notifyPlaybackLocked();
          return;
        }
        togglePlayPause();
        showRippleBadge(state.isPlaying ? '▶️' : '⏸️', state.isPlaying ? 'Đang phát' : 'Tạm dừng', 'center');
      } else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isPlaybackLocked()) {
          notifyPlaybackLocked();
          return;
        }
        seekRelative(-10);
        showRippleBadge('⏪', '-10s', 'left');
      } else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (isPlaybackLocked()) {
          notifyPlaybackLocked();
          return;
        }
        seekRelative(+10);
        showRippleBadge('⏩', '+10s', 'right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const curVol = Math.min(100, (state.volume || 0) + 5);
        const slider = document.getElementById('volumeSlider');
        if (slider) { slider.value = curVol; slider.dispatchEvent(new Event('input')); }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const curVol = Math.max(0, (state.volume || 0) - 5);
        const slider = document.getElementById('volumeSlider');
        if (slider) { slider.value = curVol; slider.dispatchEvent(new Event('input')); }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        document.getElementById('btnScreenFocusMode')?.click();
      } else if (e.key === 'v' || e.key === 'V') {
        setCameraMode(state.cameraMode === 'pov' ? 'orbit' : 'pov');
      } else if (e.key === 'm' || e.key === 'M') {
        document.getElementById('btnMuteToggle')?.click();
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        if (e.repeat) return; // Prevent key-hold repeat spam
        const emojis = ['🍿', '❤️', '🪄', '🔥', '👏', '😂'];
        spawnSeatReaction3D(state.me.seat, emojis[Number(e.key) - 1], true, true);
      }
    });
  }

  // =========================================================================
  // 13. HELPERS & INITIALIZATION
  // =========================================================================
  function saveProfileToStorage() {
    try {
      localStorage.setItem('wetube_cine_profile', JSON.stringify(state.me));
      localStorage.setItem('hanzu_cinema_profile', JSON.stringify(state.me));
    } catch (e) {}
  }

  function saveLiveQueueToStorage() {
    try {
      localStorage.setItem(
        getLiveRoomStorageKey(state.roomCode),
        JSON.stringify({
          queue: state.queue || [],
          currentVideo: state.currentVideo || null,
          timestamp: Date.now()
        })
      );
    } catch (e) {}
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.3s ease';
      setTimeout(() => item.remove(), 300);
    }, 3200);
  }

  function formatTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '0:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    const padSec = secs < 10 ? '0' + secs : secs;
    if (hrs > 0) {
      const padMin = mins < 10 ? '0' + mins : mins;
      return `${hrs}:${padMin}:${padSec}`;
    }
    return `${mins}:${padSec}`;
  }

  let lastFormattedCur = '';
  let lastFormattedTot = '';
  let lastPlayedPct = -1;

  function updateScrubberUI(currentSec, totalSec, bufferFraction = 0) {
    const playedBar = document.getElementById('ytScrubberPlayed');
    const bufferBar = document.getElementById('ytScrubberBuffer');
    const curTimeEl = document.getElementById('screenCurrentTime');
    const totTimeEl = document.getElementById('screenTotalDuration');

    const curStr = formatTime(currentSec);
    if (curTimeEl && curStr !== lastFormattedCur) {
      curTimeEl.textContent = curStr;
      lastFormattedCur = curStr;
    }

    if (totTimeEl && totalSec > 0) {
      const totStr = formatTime(totalSec);
      if (totStr !== lastFormattedTot) {
        totTimeEl.textContent = totStr;
        lastFormattedTot = totStr;
      }
    }

    if (totalSec > 0 && playedBar) {
      const pct = Math.min(100, Math.max(0, (currentSec / totalSec) * 100));
      if (Math.abs(pct - lastPlayedPct) >= 0.1) {
        playedBar.style.width = `${pct.toFixed(2)}%`;
        lastPlayedPct = pct;
      }
    }
    if (bufferBar && bufferFraction > 0) {
      const bufPct = Math.min(100, Math.max(0, bufferFraction * 100));
      bufferBar.style.width = `${bufPct.toFixed(1)}%`;
    }
  }

  function getCurrentTimeStr() {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // 13. REAL-TIME 60 FPS PERFORMANCE MONITOR
  // =========================================================================
  function startFpsMonitor() {
    let lastTime = performance.now();
    let frameCount = 0;
    const fpsValueEl = document.getElementById('fpsValueText');
    const fpsPillEl = document.getElementById('fpsCounterPill');

    function tick(now) {
      frameCount++;
      const elapsed = now - lastTime;
      if (elapsed >= 500) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        if (fpsValueEl) {
          fpsValueEl.textContent = `${fps} FPS`;
          if (fps >= 55) {
            fpsPillEl?.classList.remove('fps-warn');
          } else {
            fpsPillEl?.classList.add('fps-warn');
          }
        }
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function init() {
    setupAudioUnlock();
    mountAppShell();
    // Ensure legacy rename button is purged if cached
    document.getElementById('btnOpenSettings')?.remove();
    build100Seats3D();
    render2DSeatMap(getOccupantMap());
    renderPresetChips();
    renderQueue();
    renderChatMessages(true);
    updateViewportBaseScale();
    setupViewportCameraControls();
    bindUIEvents();
    applyCameraTransform();
    initYouTubeIframeAPI();
    setupSyncListener();
    startSimulatedAudienceEngine();
    updateSkipVoteUI();
    startAutoAdSkipperEngine();
    updateAutoSkipAdsUI();
    startFpsMonitor();

    // Auto start queue if cinema is idle and queue has pending songs
    if ((!state.currentVideo || !state.currentVideo.videoId) && state.queue && state.queue.length > 0) {
      playNextFromQueue('Bắt đầu chiếu bài trong hàng đợi');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
