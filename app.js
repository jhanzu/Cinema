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

  const INITIAL_QUEUE = [
    {
      id: 'q-1',
      videoId: '9B0yX0UIN9M',
      title: 'I Really Want to Stay at Your House',
      channel: 'Samuel Kim, Lorien - Topic',
      addedBy: 'Hanzu Cinema',
      votes: 1,
      ambilight: ['#38BDF8', '#EC4899']
    }
  ];

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
      color: (savedProfile && savedProfile.color) || defaultColor,
      isBot: false
    },
    peers: {}, // Remote tabs/users: { [clientId]: { id, name, seat, emoji, color } }
    friends: [],
    botsEnabled: false,

    // Local set of song IDs voted by THIS client (prevents sync overwrite bug)
    localVotedSongIds: new Set(['q-1']),

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
    currentVideo: {
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
    isAdPlaying: false,
    skippedAdsCount: 0,
    lastAdBypassTime: 0,
    preAdVolume: 25,
    preAdRate: 1,

    // Voting Queue & History
    queue: [...INITIAL_QUEUE],
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

            <button class="my-seat-pill" id="btnOpenProfile" title="Đổi tên, giới tính hoặc chọn ghế ngồi">
              <span id="myNavGender">${state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨')}</span>
              <span id="myNavEmoji">${state.me.emoji}</span>
              <span id="myNavName">${escapeHtml(state.me.name)}</span>
              <span>• Ghế <strong id="myNavSeat">${state.me.seat}</strong></span>
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

                      <!-- Top Quick Bar (Title & Mode) -->
                      <div class="screen-top-quickbar">
                        <span class="stq-title" id="screenTopTitle">${escapeHtml(state.currentVideo.title)}</span>
                        <div class="stq-actions">
                          <button class="stq-btn" id="btnToggleNativeYt" type="button" title="Chuyển đổi giữa Giao diện Rạp và Menu cài đặt gốc YouTube">⚙️ YouTube Gốc</button>
                          <button class="stq-btn" id="btnScreenFocusMode" type="button" title="Chế độ Rạp IMAX cận cảnh (Phím tắt: T)">⛶ Rạp IMAX</button>
                        </div>
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
                            <button class="yt-btn yt-adskip-btn ${state.autoSkipAds ? 'active' : ''}" id="btnToggleAutoSkipAds" type="button" title="Tự động bỏ qua quảng cáo (Click để bỏ qua ngay hoặc Bật/Tắt)">
                              <span id="adSkipBtnIcon">${state.autoSkipAds ? '🛡️ Bỏ qua QC: BẬT' : '🛡️ Bỏ qua QC: TẮT'}</span>
                            </button>
                            <button class="yt-btn yt-speed-btn" id="btnScreenSpeed" type="button" title="Tốc độ phát">
                              <span id="screenSpeedLabel">1x</span>
                            </button>
                            <button class="yt-btn" id="btnScreenExternalYt" type="button" title="Mở cửa sổ rạp iframe trực tiếp trong web (Không mở tab mới)">
                              <span style="font-size: 0.82rem;">🗗 Cửa sổ rạp</span>
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
                  <span>👆 <strong>Bấm vào ô ghế trống</strong> để đổi chỗ ngồi ngay lập tức</span>
                  <button class="btn-quick-switch" id="btnSidebarRandomSeat" type="button" title="Đổi sang một ghế trống ngẫu nhiên">🎲 Đổi ngẫu nhiên</button>
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
              <div class="modal-title" id="profileModalTitle">✨ Hồ sơ khán giả & Chỗ ngồi</div>
              <button class="icon-btn" id="btnCloseProfile" type="button" title="Đóng">✕</button>
            </div>

            <!-- Live Preview Card -->
            <div class="profile-preview-card" id="profilePreviewCard">
              <div class="preview-avatar-badge" id="previewBadge">
                <span id="previewEmoji">${state.me.emoji}</span>
                <span class="preview-gender-tag" id="previewGenderTag">${state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨')}</span>
              </div>
              <div class="preview-info">
                <div class="preview-name" id="previewName">${escapeHtml(state.me.name)}</div>
                <div class="preview-seat">Ghế: <strong id="previewSeat">${state.me.seat}</strong> • Hanzu Cinema</div>
              </div>
            </div>

            <form id="formSaveProfile">
              <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">1. Tên hiển thị trên ghế 3D (Độc lập, không trùng lặp)</label>
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

              <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;">3. Chọn Avatar nhân vật</label>
              <div class="emoji-grid" id="emojiPickerGrid"></div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                <button type="button" class="icon-btn" id="btnRandomEmptySeat">🎲 Ghế VIP ngẫu nhiên</button>
                <button type="submit" class="btn-submit" id="btnSubmitProfile" style="padding:10px 22px;font-size:0.92rem;">🎬 Vào Rạp Xem Phim</button>
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
            <div class="uv-icon">🚫</div>
            <div class="modal-title uv-title">Video Không Thể Xem (Unavailable)</div>
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
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    ROWS.forEach((rowLetter, rIdx) => {
      COLS.forEach((colNum, cIdx) => {
        const seatCode = `${rowLetter}${colNum}`;
        const isVip = rowLetter === 'E' || rowLetter === 'F';

        // Center aisle gap between col 5 and col 6, side aisles after col 2 and col 8
        let aisleOffset = 0;
        if (colNum > 2) aisleOffset += 18;
        if (colNum > 5) aisleOffset += 38;
        if (colNum > 8) aisleOffset += 18;

        const x = cIdx * 78 + aisleOffset + 32;
        const y = 0;
        const z = rIdx * 50 + 30;

        seatCoordMap[seatCode] = { x, y, z, rIdx, cIdx, rowLetter, colNum };

        const seatNode = document.createElement('div');
        seatNode.className = `seat-3d-node ${isVip ? 'vip-seat' : ''}`;
        seatNode.id = `seat-3d-${seatCode}`;
        seatNode.dataset.seat = seatCode;
        seatNode.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
        seatNode.title = `Ghế ${seatCode} ${isVip ? '(Hàng VIP Trung Tâm)' : ''} — Click để ngồi`;

        // Streamlined high-performance chair (no redundant DOM micro-elements, 60fps)
        seatNode.innerHTML = `
          <div class="chair-name-badge" id="chair-badge-${seatCode}"></div>
          <div class="seat-avatar-slot" id="avatar-slot-${seatCode}"></div>
          <div class="chair-3d-model">
            <div class="chair-back"><span class="seat-code-label">${seatCode}</span></div>
            <div class="chair-cushion"></div>
            <div class="chair-arm left"></div>
            <div class="chair-arm right"></div>
          </div>
        `;

        seatNode.addEventListener('click', (e) => {
          e.stopPropagation();
          selectSeat(seatCode);
        });

        fragment.appendChild(seatNode);
        seatNodeCache[seatCode] = {
          node3D: seatNode,
          slot: seatNode.querySelector('.seat-avatar-slot'),
          badge: seatNode.querySelector('.chair-name-badge')
        };
      });
    });

    container.appendChild(fragment);
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

        const occKey = person ? `${person.id}-${person.name}-${person.emoji}-${person.color}` : 'empty';
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
              chairBadgeEl.innerHTML = `<span style="font-size:0.74rem;">${person.emoji || '😎'}</span> <span>${escapeHtml(person.name)}</span> <span class="cnb-tag" style="color:#FDE047;font-size:0.65rem;font-weight:700;margin-left:2px;">(Bạn)</span>`;
              chairBadgeEl.style.display = 'inline-flex';
            }
          } else {
            node3D.classList.add('occupied', 'occupied-peer');
            node3D.title = `Ghế ${code} — Đã có "${person.name}" ngồi (Không thể chọn)`;
            if (chairBadgeEl) {
              chairBadgeEl.className = 'chair-name-badge peer-badge';
              chairBadgeEl.innerHTML = `<span style="font-size:0.74rem;">${person.emoji || '👤'}</span> <span>${escapeHtml(person.name)}</span>`;
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
                <span class="mannequin-emoji">${person.emoji || '😎'}</span>
                <span class="mannequin-name">${escapeHtml(person.name)}</span>
              </div>
              <div class="block-head-wrap">
                ${hairHtml}
                <div class="block-head">
                  <div class="block-face">${person.emoji || '😎'}</div>
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
    if (myNavEmoji) myNavEmoji.textContent = state.me.emoji;
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
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          fs: 1,
          iv_load_policy: 3,
          origin: originParam
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
              state.isPlaying = true;
              hideVideoRescueCard();
              updatePlayPauseButton();
              updateAmbilightColors(state.currentVideo.ambilight);
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
    mount.innerHTML = `
      <iframe
        id="youtubePlayerContainer"
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1${startParam}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    `;
    ytReady = true;
    state.isPlaying = true;
    updatePlayPauseButton();
    updateAmbilightColors(state.currentVideo.ambilight);
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

  function handleVideoPlayError(errCode) {
    clearTimeout(videoLoadWatchdogTimer);
    const currentVid = state.currentVideo;
    if (!currentVid || !currentVid.videoId) return;

    const failedVidId = currentVid.videoId;
    if (failedVideoIds.has(failedVidId)) {
      return; // Already handled this failed video
    }
    failedVideoIds.add(failedVidId);

    // 1. Immediately halt playback on player
    if (ytPlayer) {
      try {
        if (typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
        else if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
      } catch (_) {}
    }

    // 2. Xoá queue của bài này (không để xuất hiện hay phát nữa)
    state.queue = (state.queue || []).filter(
      (item) => item.videoId !== failedVidId && (!currentVid.id || item.id !== currentVid.id)
    );
    state.skipVotes.clear();
    renderQueue();
    updateSkipVoteUI();
    updateNextPlayingUI();

    // 3. Broadcast sync to all clients in the room to purge this video from queue & cinema screen
    broadcastSync({
      type: 'UNAVAILABLE_VIDEO_PURGE',
      videoId: failedVidId,
      queue: state.queue
    });

    // 4. Không phát trên màn chiếu nữa: chuyển bài tiếp theo hoặc chuyển về màn hình chờ
    if (state.queue && state.queue.length > 0) {
      playNextFromQueue('Bỏ qua video không thể xem (Unavailable)');
    } else {
      clearCinemaScreen();
    }

    // 5. Màn hình cảnh báo pop-up SẼ CHỈ XUẤT HIỆN VỚI NGƯỜI GỬI LINK
    const isSender = isMySubmittedVideo(currentVid);

    if (isSender) {
      isShowingUnavailableModal = true;
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

    // 1. Try local server search-alt endpoint
    try {
      const resp = await fetch(`/api/search-alt?q=${encodeURIComponent(cleanTitle)}&exclude=${encodeURIComponent(failedId)}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.videoIds)) {
          for (const candId of data.videoIds) {
            if (candId !== failedId && !failedVideoIds.has(candId)) {
              return { videoId: candId, channel: 'Bản thay thế không giới hạn' };
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
      if (pair.match.every(m => low.includes(m)) && pair.id !== failedId && !failedVideoIds.has(pair.id)) {
        return { videoId: pair.id, channel: pair.title };
      }
    }

    // 3. Public search gateways
    const publicGateways = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle)}`)}`
    ];

    for (const gw of publicGateways) {
      try {
        const r = await fetch(gw, { signal: AbortSignal.timeout(3500) });
        if (r.ok) {
          const text = await r.text();
          const matches = [...text.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map(m => m[1]);
          const unique = [...new Set(matches)].filter(id => id !== failedId && !failedVideoIds.has(id));
          if (unique.length > 0) {
            return { videoId: unique[0], channel: 'Bản YouTube thay thế' };
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
  // UNAVAILABLE VIDEO WARNING POPUP NOTIFICATION (Warning & Confirm)
  // =========================================================================
  let unavailableConfirmCallback = null;

  function showUnavailableVideoPopup(videoTitle, reasonMessage, onConfirm) {
    const modal = document.getElementById('unavailableVideoModal');
    const msgEl = document.getElementById('uvModalMessage');
    if (!modal) return;

    unavailableConfirmCallback = onConfirm || null;
    isShowingUnavailableModal = true;

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

  function forceSkipAdNow() {
    const ifrs = document.querySelectorAll('iframe[src*="youtube.com"]');
    ifrs.forEach((ifr) => {
      try {
        ifr.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [999999, true] }), '*');
        ifr.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [16] }), '*');
        ifr.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'skipAd', args: [] }), '*');
      } catch (_) {}
    });

    if (ytReady && ytPlayer) {
      try {
        if (typeof ytPlayer.setPlaybackRate === 'function') ytPlayer.setPlaybackRate(16);
        const dur = typeof ytPlayer.getDuration === 'function' ? ytPlayer.getDuration() : 0;
        if (dur > 0 && typeof ytPlayer.seekTo === 'function') {
          ytPlayer.seekTo(dur, true);
        }
      } catch (_) {}
    }
  }

  function startAutoAdSkipperEngine() {
    // 1. Listen for YouTube player window message events
    window.addEventListener('message', (e) => {
      if (!state.autoSkipAds) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;

        if (data.event === 'infoDelivery' && data.info) {
          const info = data.info;
          const isAdActive = info.adState === 1 || info.isAdPlaying || (info.videoData && info.videoData.video_id && state.currentVideo?.videoId && info.videoData.video_id !== state.currentVideo.videoId);
          if (isAdActive) {
            handleAdDetected();
          }
        }
      } catch (_) {}
    });

    // 2. High-frequency watcher loop (runs every 220ms)
    if (adSkipLoopTimer) clearInterval(adSkipLoopTimer);
    adSkipLoopTimer = setInterval(() => {
      if (!state.autoSkipAds || !ytReady || !ytPlayer || !state.isPlaying) {
        if (state.isAdPlaying) handleAdEnded();
        return;
      }

      let isAd = false;
      try {
        if (typeof ytPlayer.getVideoData === 'function') {
          const vd = ytPlayer.getVideoData();
          if (vd && vd.video_id && state.currentVideo?.videoId && vd.video_id !== state.currentVideo.videoId) {
            isAd = true;
          }
        }

        if (!isAd && typeof ytPlayer.getDuration === 'function') {
          const dur = ytPlayer.getDuration();
          if (dur > 0 && dur <= 35 && state.currentVideo?.duration && state.currentVideo.duration > 60) {
            isAd = true;
          }
        }
      } catch (_) {}

      if (isAd) {
        handleAdDetected();
      } else if (state.isAdPlaying) {
        handleAdEnded();
      }
    }, 220);
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

    // Accelerate ad to 16x and seek to end
    forceSkipAdNow();

    // If ad remains stuck for > 2.2 seconds, execute seamless refresh bypass
    const timeInAd = Date.now() - adDetectionStartTime;
    if (timeInAd > 2200) {
      if (!state.lastAdBypassTime || Date.now() - state.lastAdBypassTime > 6000) {
        state.lastAdBypassTime = Date.now();
        const cur = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0;
        if (state.currentVideo?.videoId && typeof ytPlayer.loadVideoById === 'function') {
          ytPlayer.loadVideoById(state.currentVideo.videoId, cur > 5 ? cur : 0);
        }
      }
    }
  }

  function handleAdEnded() {
    state.isAdPlaying = false;
    const indicator = document.getElementById('adSkipIndicator');
    if (indicator) indicator.classList.remove('show');

    // Restore volume and speed
    try {
      if (ytPlayer) {
        ytPlayer.setVolume(state.volume);
        if (!state.isMuted) ytPlayer.unMute();
        if (state.preAdRate && typeof ytPlayer.setPlaybackRate === 'function') {
          ytPlayer.setPlaybackRate(state.preAdRate);
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
      showToast('🎵 Đã phát xong video! Hàng đợi hiện đang trống.');
      state.skipVotes.clear();
      updateSkipVoteUI();
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
      inPageIframe.src = `https://www.youtube.com/embed/${state.currentVideo.videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1${startParam}`;
      if (inPageTitle) inPageTitle.textContent = state.currentVideo.title || 'Đang chiếu';
    }

    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
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
    } else if (ytReady) {
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

    // Safety watchdog: If video is blocked or unavailable and player stays unstarted, trigger unavailable warning
    clearTimeout(videoLoadWatchdogTimer);
    videoLoadWatchdogTimer = setTimeout(() => {
      if (!isShowingUnavailableModal && ytReady && ytPlayer) {
        try {
          const pState = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
          const curTime = typeof ytPlayer.getCurrentTime === 'function' ? ytPlayer.getCurrentTime() : 0;
          if ((pState === -1 || pState === 3) && curTime === 0 && !state.isPlaying) {
            handleVideoPlayError(150);
          }
        } catch (_) {}
      }
    }, 6000);

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

  // Playback Lock Guard (Locked when 2 or more viewers are in the theater)
  function isPlaybackLocked() {
    return Object.keys(getOccupantMap()).length >= 2;
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
    let isUnavailable = false;

    // 1. Try official YouTube oEmbed API first (fastest, most reliable)
    try {
      const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (resp.status === 404 || resp.status === 401 || resp.status === 400) {
        isUnavailable = true;
      } else if (resp.ok) {
        const data = await resp.json();
        if (data && data.title) {
          return {
            title: data.title,
            channel: data.author_name || 'YouTube Creator',
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
            available: true
          };
        }
        if (data2 && data2.error) {
          isUnavailable = true;
        }
      }
    } catch (err2) {}

    if (isUnavailable) {
      return {
        title: null,
        channel: null,
        available: false
      };
    }

    return {
      title: `Video YouTube #${videoId}`,
      channel: 'Khán giả đề xuất',
      available: true
    };
  }

  function sortQueue() {
    state.queue.sort((a, b) => b.votes - a.votes);
  }

  function renderQueue() {
    sortQueue();
    updateNextPlayingUI();
    const listEl = document.getElementById('queueListContainer');
    const badgeEl = document.getElementById('queueCountBadge');
    if (badgeEl) badgeEl.textContent = state.queue.length;
    updateSkipVoteUI();
    if (!listEl) return;

    if (state.queue.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:32px 14px;color:var(--text-secondary);font-size:0.82rem;">
          🍿 Hàng đợi đang trống.<br/>Hãy dán link YouTube ở trên để cả rạp cùng xem!
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.queue
      .map((item, idx) => {
        const isTop = idx === 0;
        const hasVoted = state.localVotedSongIds.has(item.id);
        const thumbUrl = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
        return `
          <div class="queue-card ${isTop ? 'top-rank' : ''}">
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
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-vote-id]').forEach((btn) => {
      btn.addEventListener('click', () => toggleVoteQueueItem(btn.dataset.voteId));
    });

    listEl.querySelectorAll('[data-play-id]').forEach((btn) => {
      btn.addEventListener('click', () => forcePlayQueueItem(btn.dataset.playId));
    });
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

  async function addVideoToQueue(videoId, customTitle, customChannel) {
    if (failedVideoIds.has(videoId)) {
      showUnavailableVideoPopup(
        customTitle || `ID: ${videoId}`,
        'Video này đã được xác nhận là không thể phát trong rạp (do chặn bản quyền nhúng hoặc bị tác giả xóa). Bạn không thể đề xuất lại video này.',
        () => {
          const input = document.getElementById('inputYoutubeUrl');
          if (input) { input.value = ''; input.focus(); }
        }
      );
      return;
    }

    if (state.queue.some((item) => item.videoId === videoId)) {
      showToast('⚡ Video này đã có trong danh sách bình chọn, hãy bấm Vote nhé!');
      return;
    }

    let title = customTitle;
    let channel = customChannel;
    if (!title) {
      showToast('🔍 Đang kiểm tra link video từ YouTube...');
      const meta = await fetchYouTubeMetadata(videoId);
      if (meta && meta.available === false) {
        state.queue = (state.queue || []).filter((q) => q.videoId !== videoId);
        renderQueue();
        showUnavailableVideoPopup(
          `ID: ${videoId}`,
          'Link video YouTube này không tồn tại, đã bị tác giả xóa hoặc đặt ở chế độ riêng tư (Unavailable). Bạn không được phép xem video này.',
          () => {
            const input = document.getElementById('inputYoutubeUrl');
            if (input) { input.value = ''; input.focus(); }
          }
        );
        return;
      }
      title = meta.title || `Video #${videoId}`;
      channel = meta.channel || 'YouTube Creator';
    }

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
    renderQueue();
    showToast(`✅ Đã thêm "${title}" vào danh sách bình chọn!`);
    showSeatSpeechBubble(state.me.seat, `Vừa đề xuất bài mới, vote nha! 🎵`, 4200);
    broadcastSync({ type: 'ADD_QUEUE', item: newItem });
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
      return;
    }
    const nextVideo = state.queue.shift();
    state.skipVotes.clear();
    renderQueue();
    updateSkipVoteUI();

    if (reasonText) {
      showToast(`⏭️ ${reasonText} • Chuyển sang: ${nextVideo.title}`);
    }

    broadcastSync({
      type: 'QUEUE_ADVANCE',
      nextVideo: nextVideo,
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

  function spawnSeatReaction3D(seatCode, emojiIcon, broadcast = true, playSound = true) {
    const seatNode = document.getElementById(`seat-3d-${seatCode}`);
    if (!seatNode) return;

    if (playSound) {
      sfx.playReactionPop();
    }

    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.className = 'reaction-particle';
        p.textContent = emojiIcon;
        const driftX = (Math.random() - 0.5) * 70;
        p.style.setProperty('--drift-x', `${driftX.toFixed(1)}px`);
        p.style.left = '50%';
        p.style.bottom = '45px';
        seatNode.appendChild(p);
        setTimeout(() => p.remove(), 2200);
      }, i * 110);
    }

    if (broadcast) {
      broadcastSync({ type: 'REACTION', seat: seatCode, emoji: emojiIcon });
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
            <div class="chat-avatar" style="background:${m.color}">${m.emoji}</div>
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
            <span style="font-size:1.05rem;">${p.emoji || '😎'}</span>
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
          }
          if (Array.isArray(data.queue) && data.queue.length > 0) {
            state.queue = data.queue;
            renderQueue();
            updateSkipVoteUI();
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

          // If connected via Cloud Broker, reply with full room state so new peer syncs immediately!
          if (mqttConnected && mqttClient) {
            try {
              const reply = new window.Paho.MQTT.Message(JSON.stringify({
                from: state.clientId,
                type: 'ROOM_SYNC_REPLY',
                targetClientId: data.from || data.clientId,
                occupants: getOccupantMap(),
                currentVideo: state.currentVideo,
                currentTime: (ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0,
                isPlaying: state.isPlaying,
                queue: state.queue,
                skipVotes: Array.from(state.skipVotes)
              }));
              reply.destinationName = CLOUD_ROOM_TOPIC;
              mqttClient.send(reply);
            } catch (err) {}
          }
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

      case 'ADD_QUEUE':
      case 'QUEUE_UPDATE':
        if (Array.isArray(data.queue)) {
          state.queue = data.queue;
          renderQueue();
          updateSkipVoteUI();
        } else if (data.item && !state.queue.some((q) => q.id === data.item.id)) {
          state.queue.push({ ...data.item });
          renderQueue();
          updateSkipVoteUI();
        }
        break;

      case 'QUEUE_ADVANCE':
        if (Array.isArray(data.queue)) {
          state.queue = data.queue;
          renderQueue();
        }
        state.skipVotes.clear();
        updateSkipVoteUI();
        if (data.nextVideo || data.currentVideo) {
          const vid = data.nextVideo || data.currentVideo;
          if (data.reason) {
            showToast(`⏭️ ${data.reason} • Đang phát: ${vid.title}`);
          }
          loadAndPlayVideo(vid, false);
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
                // Announce self to everyone in room
                broadcastSync({
                  type: 'PEER_JOIN',
                  user: state.me,
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
      broadcastSync({ type: 'PEER_JOIN', user: state.me });
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

    function toggleFullscreen() {
      const vp = document.getElementById('cinemaViewport') || document.documentElement;
      if (!document.fullscreenElement) {
        if (vp.requestFullscreen) vp.requestFullscreen();
        else if (vp.webkitRequestFullscreen) vp.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }

    document.addEventListener('fullscreenchange', () => {
      const icon = document.getElementById('screenFsIcon');
      if (icon) icon.textContent = document.fullscreenElement ? '✕' : '⛶';
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

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl);
      }
      showToast(`🔗 Đã sao chép link rạp: ${shareUrl}\nGửi link này cho bạn bè trên cùng Wi-Fi để xem chung!`, 4800);
    });

    // Profile Modal
    const profileModal = document.getElementById('profileModal');
    const emojiGrid = document.getElementById('emojiPickerGrid');
    if (emojiGrid) {
      emojiGrid.innerHTML = AVATAR_EMOJIS.map(
        (em) => `<button type="button" class="emoji-choice ${em === state.me.emoji ? 'selected' : ''}" data-em="${em}">${em}</button>`
      ).join('');
      emojiGrid.querySelectorAll('[data-em]').forEach((btn) => {
        btn.addEventListener('click', () => {
          emojiGrid.querySelectorAll('[data-em]').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.me.emoji = btn.dataset.em;
        });
      });
    }

    // Update Live Preview in Profile Modal
    const updateProfilePreview = () => {
      const pName = document.getElementById('previewName');
      const pEmoji = document.getElementById('previewEmoji');
      const pGender = document.getElementById('previewGenderTag');
      const pSeat = document.getElementById('previewSeat');
      if (pName) pName.textContent = state.me.name || 'Khán giả';
      if (pEmoji) pEmoji.textContent = state.me.emoji || '😎';
      if (pGender) pGender.textContent = state.me.gender === 'female' ? '👩' : (state.me.gender === 'other' ? '✨' : '👨');
      if (pSeat) pSeat.textContent = state.me.seat || 'E5';
    };

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
          title.textContent = '✨ Hồ sơ khán giả & Chỗ ngồi';
          submitBtn.textContent = 'Lưu thay đổi';
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
      refreshSeatsVisuals();
      closeProfile();
      sfx.playSeat();
      showToast(`🎉 Chào mừng ${state.me.name} (${state.me.gender === 'female' ? 'Nữ 👩' : (state.me.gender === 'other' ? '✨' : 'Nam 👨')}) vào rạp Hanzu Cinema!`);
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

    // Global PostMessage listener for YouTube Player Iframe errors
    window.addEventListener('message', (event) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && (data.event === 'onError' || data.info?.errorCode)) {
          const code = data.info?.errorCode || data.info || 150;
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

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          closeProfile();
        }
        return;
      }

      if (e.key === 'Escape') {
        closeProfile();
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
