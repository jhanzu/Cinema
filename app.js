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
      videoId: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio - beats to relax/study to',
      channel: 'Lofi Girl',
      ambilight: ['#3B82F6', '#8B5CF6']
    },
    {
      videoId: '5qap5aO4i9A',
      title: 'Synthwave Radio - Chill Synth / Retro Music',
      channel: 'Lofi Girl Synthwave',
      ambilight: ['#06B6D4', '#EC4899']
    },
    {
      videoId: 'DWcJFNfaw9c',
      title: 'Ambient Space Cinema - Deep Relaxing Visuals 4K',
      channel: 'Space Ambient',
      ambilight: ['#3B82F6', '#10B981']
    },
    {
      videoId: '4xDzrJKXOOY',
      title: 'Cyberpunk Night Drive - Retro Future Beats',
      channel: 'Chillsynth FM',
      ambilight: ['#F59E0B', '#E11D48']
    },
    {
      videoId: 'n61ULEU7CO0',
      title: 'Best of Ghibli Piano Medley - Soothing Anime Ost',
      channel: 'Anime Piano Room',
      ambilight: ['#10B981', '#F59E0B']
    },
    {
      videoId: 'rUxyKA_-grg',
      title: 'Sleepy Fish - Chillhop Essentials Night Session',
      channel: 'Chillhop Music',
      ambilight: ['#06B6D4', '#3B82F6']
    }
  ];

  const INITIAL_QUEUE = [
    {
      id: 'q-1',
      videoId: '4xDzrJKXOOY',
      title: 'Synthwave Radio 🌌 - chill retro / night drive beats',
      channel: 'Lofi Girl',
      addedBy: 'Hệ thống rạp',
      votes: 5,
      ambilight: ['#EC4899', '#8B5CF6']
    },
    {
      id: 'q-2',
      videoId: 'rUxyKA_-grg',
      title: 'Sleepy Fish - Chillhop Essentials Night Session',
      channel: 'Chillhop Music',
      addedBy: 'Hệ thống rạp',
      votes: 3,
      ambilight: ['#06B6D4', '#3B82F6']
    },
    {
      id: 'q-3',
      videoId: 'n61ULEU7CO0',
      title: 'Best of Ghibli Piano Medley - Soothing Anime Ost',
      channel: 'Anime Piano Room',
      addedBy: 'Hệ thống rạp',
      votes: 2,
      ambilight: ['#10B981', '#F59E0B']
    },
    {
      id: 'q-4',
      videoId: 'K4DyBUG242c',
      title: 'Cartoon - On & On (feat. Daniel Levi) [NCS Release]',
      channel: 'NoCopyrightSounds',
      addedBy: 'Hệ thống rạp',
      votes: 1,
      ambilight: ['#FF4E45', '#F59E0B']
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

  // Unlock AudioContext on first user interaction without console warnings
  function setupAudioUnlock() {
    const unlock = () => {
      sfx.init();
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
      videoId: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio - beats to relax/study to',
      channel: 'Lofi Girl',
      startedBy: 'Hệ thống rạp',
      ambilight: ['#3B82F6', '#8B5CF6']
    },
    isPlaying: true,
    isMuted: false,
    volume: 75,
    skipVotes: new Set(),
    isHandlingVideoEnd: false,

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
              <div class="now-playing-card">
                <span class="np-badge">ĐANG CHIẾU</span>
                <div class="np-info">
                  <div class="np-title" id="hudVideoTitle">${escapeHtml(state.currentVideo.title)}</div>
                  <div class="np-meta" id="hudVideoMeta">${escapeHtml(state.currentVideo.channel)} • Chọn bởi ${escapeHtml(state.currentVideo.startedBy)}</div>
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
                  <div class="screen-frame">
                    <div class="screen-curtain-top">
                      <span>HANZU CINEMA IMAX 3D</span>
                      <span id="screenSeatStatus">GHẾ CỦA BẠN: ${state.me.seat}</span>
                    </div>
                    <div class="yt-player-mount" id="ytPlayerMount">
                      <div id="youtubePlayerContainer"></div>
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
                <input type="range" min="0" max="100" value="${state.volume}" class="volume-slider" id="volumeSlider" title="Âm lượng rạp" />
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
                <div class="mini-screen-indicator">MÀN CHIẾU CHÍNH</div>
                <div class="seat-grid-2d" id="seatGrid2D"></div>
                <div class="seat-legend">
                  <div class="legend-item"><span class="legend-swatch" style="background:#F59E0B"></span> Ghế của bạn</div>
                  <div class="legend-item"><span class="legend-swatch" style="background:rgba(139,92,246,0.6)"></span> Có người ngồi</div>
                  <div class="legend-item"><span class="legend-swatch" style="background:#222422;border:1px solid #F59E0B"></span> Ghế VIP (Hàng E-F)</div>
                </div>
                <div style="font-size:0.76rem;font-weight:700;color:var(--text-secondary);margin-top:4px;">
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
              <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">1. Tên hiển thị trên ghế 3D</label>
              <input type="text" class="text-input" id="inputProfileName" style="width:100%;margin-bottom:12px;" value="${escapeHtml(state.me.name)}" maxlength="20" placeholder="Nhập tên hoặc nickname..." required />

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

        <!-- Toast Notifications -->
        <div class="toast-container" id="toastContainer"></div>
      </div>
    `;
  }

  // =========================================================================
  // 5. 3D 100-SEAT AUDITORIUM RENDERER & HIGH PERFORMANCE VISUAL SYNC
  // =========================================================================
  function build100Seats3D() {
    const container = document.getElementById('seatsAuditorium3D');
    if (!container) return;
    container.innerHTML = '';

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
        // Hàng ghế nằm song song với mặt đất (không nghiêng nữa): y = 0 cho tất cả 10 hàng
        const y = 0;
        // Ghế tách xa màn hình một khoảng thông thoáng: Row A bắt đầu từ z = 30px (cách màn hình 180px)
        const z = rIdx * 50 + 30;

        seatCoordMap[seatCode] = { x, y, z, rIdx, cIdx, rowLetter, colNum };

        const seatNode = document.createElement('div');
        seatNode.className = `seat-3d-node ${isVip ? 'vip-seat' : ''}`;
        seatNode.id = `seat-3d-${seatCode}`;
        seatNode.dataset.seat = seatCode;
        seatNode.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
        seatNode.title = `Ghế ${seatCode} ${isVip ? '(Hàng VIP Trung Tâm)' : ''} — Click để ngồi`;

        seatNode.innerHTML = `
          <div class="seat-avatar-slot" id="avatar-slot-${seatCode}"></div>
          <div class="chair-3d-model">
            <!-- 3D Volumetric Backrest Box -->
            <div class="chair-back-box">
              <div class="cb-face cb-front">
                <div class="cb-stitch left"></div>
                <div class="cb-stitch right"></div>
              </div>
              <div class="cb-face cb-back">
                <span class="seat-code-label">${seatCode}</span>
              </div>
              <div class="cb-face cb-top"></div>
              <div class="cb-face cb-side left"></div>
              <div class="cb-face cb-side right"></div>
            </div>

            <!-- 3D Volumetric Seat Cushion Box -->
            <div class="chair-cushion-box">
              <div class="cc-face cc-top">
                <div class="cc-seam"></div>
              </div>
              <div class="cc-face cc-front"></div>
              <div class="cc-face cc-bottom"></div>
              <div class="cc-face cc-side left"></div>
              <div class="cc-face cc-side right"></div>
            </div>

            <!-- 3D Volumetric Armrests with 3D Cup Holders -->
            <div class="chair-armrest-box left">
              <div class="ca-face ca-top"><div class="cup-holder-3d"></div></div>
              <div class="ca-face ca-front"></div>
              <div class="ca-face ca-side outer"></div>
            </div>
            <div class="chair-armrest-box right">
              <div class="ca-face ca-top"><div class="cup-holder-3d"></div></div>
              <div class="ca-face ca-front"></div>
              <div class="ca-face ca-side outer"></div>
            </div>

            <!-- 3D Pedestal Base & Floor Plate -->
            <div class="chair-pedestal-box">
              <div class="cp-stem"></div>
              <div class="cp-foot"></div>
            </div>
          </div>
        `;

        seatNode.addEventListener('click', (e) => {
          e.stopPropagation();
          selectSeat(seatCode);
        });

        container.appendChild(seatNode);
      });
    });

    refreshSeatsVisuals();
  }

  function getOccupantMap() {
    const map = {};
    // Peers from other tabs
    Object.values(state.peers).forEach((p) => {
      if (p.seat && p.id !== state.me.id) {
        map[p.seat] = { ...p, isMe: false };
      }
    });

    // Local user always overrides their chosen seat
    map[state.me.seat] = { ...state.me, isMe: true };
    return map;
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
        const node3D = document.getElementById(`seat-3d-${code}`);
        const slot = document.getElementById(`avatar-slot-${code}`);
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

        node3D.classList.remove('occupied', 'my-seat');
        if (person) {
          node3D.classList.add(person.isMe ? 'my-seat' : 'occupied');
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

    render2DSeatMap(occupants);
    updateSkipVoteUI();
  }

  function selectSeat(seatCode, silent = false) {
    if (!seatCoordMap[seatCode]) return;

    // Check if another person is already sitting in this seat
    const occupants = getOccupantMap();
    if (occupants[seatCode] && !occupants[seatCode].isMe) {
      showToast(`⚠️ Ghế ${seatCode} đã có bạn "${occupants[seatCode].name}" ngồi rồi! Hãy chọn ghế trống khác.`);
      return;
    }

    const prevSeat = state.me.seat;
    state.me.seat = seatCode;
    saveProfileToStorage();
    sfx.playSeatSwitch();

    // Reset head look offsets on seat change
    state.povHeadYaw = 0;
    state.povHeadPitch = 0;

    refreshSeatsVisuals();

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
    } else {
      const currentScale = (state.zoom * state.baseScale).toFixed(3);
      world.style.transform = `
        scale(${currentScale})
        rotateX(${state.rotX.toFixed(2)}deg)
        rotateY(${state.rotY.toFixed(2)}deg)
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
        e.target.closest('.yt-player-mount')
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
    }, 4000);
  }

  function createPlayerInstance() {
    try {
      const originParam = window.location.origin.startsWith('http') ? window.location.origin : undefined;

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
          origin: originParam
        },
        events: {
          onReady: (event) => {
            ytReady = true;
            try {
              event.target.setVolume(state.volume);
            } catch (e) {}
            updateAmbilightColors(state.currentVideo.ambilight);

            if (pendingVideoToLoad) {
              const vid = pendingVideoToLoad;
              pendingVideoToLoad = null;
              loadAndPlayVideo(vid, false);
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              handleVideoEnd();
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              state.isPlaying = true;
              updatePlayPauseButton();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              state.isPlaying = false;
              updatePlayPauseButton();
            }
          },
          onError: () => {
            showToast('⚠️ Video này bị hạn chế nhúng, đang chuyển sang video tiếp theo...');
            setTimeout(() => playNextFromQueue('Tự động chuyển bài'), 1600);
          }
        }
      });
    } catch (err) {
      createFallbackIframe(state.currentVideo.videoId);
    }
  }

  function createFallbackIframe(videoId) {
    const mount = document.getElementById('ytPlayerMount');
    if (!mount) return;
    mount.innerHTML = `
      <iframe
        id="youtubePlayerContainer"
        src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
    ytReady = true;
    updateAmbilightColors(state.currentVideo.ambilight);
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

  function loadAndPlayVideo(videoObj, broadcast = true) {
    if (!videoObj || !videoObj.videoId) return;

    if (!ytReady) {
      pendingVideoToLoad = videoObj;
    }

    // Save current video to history
    if (state.currentVideo && state.currentVideo.videoId) {
      state.history.unshift({ ...state.currentVideo, playedAt: getCurrentTimeStr() });
      if (state.history.length > 20) state.history.pop();
    }

    state.currentVideo = {
      videoId: videoObj.videoId,
      title: videoObj.title,
      channel: videoObj.channel || 'YouTube Cinema',
      startedBy: videoObj.addedBy || state.me.name,
      ambilight: videoObj.ambilight || randomAmbilightPair()
    };
    state.skipVotes.clear();
    updateSkipVoteUI();

    const titleEl = document.getElementById('hudVideoTitle');
    const metaEl = document.getElementById('hudVideoMeta');
    if (titleEl) titleEl.textContent = state.currentVideo.title;
    if (metaEl) {
      metaEl.textContent = `${state.currentVideo.channel} • Chọn bởi ${state.currentVideo.startedBy}`;
    }

    updateAmbilightColors(state.currentVideo.ambilight);

    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      try {
        ytPlayer.loadVideoById(state.currentVideo.videoId);
      } catch (e) {
        createFallbackIframe(state.currentVideo.videoId);
      }
    } else if (ytReady) {
      createFallbackIframe(state.currentVideo.videoId);
    }

    appendSystemChat(`🎬 Đang chiếu: "${state.currentVideo.title}" (Đề xuất bởi ${state.currentVideo.startedBy})`);

    if (broadcast) {
      broadcastSync({ type: 'LOAD_VIDEO', video: state.currentVideo });
    }
  }

  function updateAmbilightColors(colors) {
    const [c1, c2] = colors || ['#3B82F6', '#8B5CF6'];
    document.documentElement.style.setProperty('--ambilight-1', c1);
    document.documentElement.style.setProperty('--ambilight-2', c2);
  }

  function randomAmbilightPair() {
    const c1 = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const c2 = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    return [c1, c2];
  }

  function updatePlayPauseButton() {
    const btn = document.getElementById('btnPlayPause');
    if (!btn) return;
    btn.innerHTML = state.isPlaying ? '⏸️ Tạm dừng' : '▶️ Phát tiếp';
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
    // 1. Try official YouTube oEmbed API first (fastest, most reliable)
    try {
      const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.title) {
          return {
            title: data.title,
            channel: data.author_name || 'YouTube Creator'
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
            channel: data2.author_name || 'YouTube Creator'
          };
        }
      }
    } catch (err2) {}

    return {
      title: `Video YouTube #${videoId}`,
      channel: 'Khán giả đề xuất'
    };
  }

  function sortQueue() {
    state.queue.sort((a, b) => b.votes - a.votes);
  }

  function renderQueue() {
    sortQueue();
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
    if (state.queue.some((item) => item.videoId === videoId)) {
      showToast('⚡ Video này đã có trong danh sách bình chọn, hãy bấm Vote nhé!');
      return;
    }

    let title = customTitle;
    let channel = customChannel;
    if (!title) {
      showToast('🔍 Đang lấy thông tin video từ YouTube...');
      const meta = await fetchYouTubeMetadata(videoId);
      title = meta.title;
      channel = meta.channel;
    }

    const newItem = {
      id: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      videoId,
      title,
      channel,
      addedBy: `${state.me.name} (${state.me.seat})`,
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
    const idx = state.queue.findIndex((q) => q.id === itemId);
    if (idx === -1) return;
    const [picked] = state.queue.splice(idx, 1);
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
    const rawThreshold = Math.floor(totalViewers * 0.3);
    // 30% người vote: làm tròn xuống (VD: 3.66 = 3; 7.2 = 7). Nếu không đủ 1 (1-3 người) thì chỉ cần 1 vote là tự động skip
    return Math.max(1, rawThreshold);
  }

  function updateSkipVoteUI() {
    const btn = document.getElementById('btnVoteSkip');
    if (!btn) return;

    purgeInvalidSkipVotes();
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
        btn.title = `Bỏ phiếu chuyển sang video #1 trong hàng đợi (Cần ${required} phiếu - 30% khán giả)`;
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

    // 4. Kiểm tra ngưỡng đủ 30% để tiến hành skip
    if (state.skipVotes.size >= required) {
      const totalViewers = Object.keys(getOccupantMap()).length || 1;
      const rawThreshold = Math.floor(totalViewers * 0.3);
      const reason = rawThreshold < 1
        ? 'Tự động qua bài (30% khán giả < 1 người)'
        : `Đã đủ ${state.skipVotes.size}/${required} phiếu (30% khán giả)`;
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
        if (occ) cls += occ.isMe ? ' mine' : ' occupied';
        cellsHtml += `<div class="${cls}" data-seat-2d="${code}" title="Ghế ${code}${occ ? ' • ' + occ.name : ' (Trống)'}">${occ ? occ.emoji : code}</div>`;
      });
    });
    grid.innerHTML = cellsHtml;

    grid.querySelectorAll('[data-seat-2d]').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectSeat(cell.dataset.seat2d);
      });
    });

    const people = Object.values(occupants);
    roster.innerHTML = people
      .map(
        (p) => `
        <div class="roster-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:1.05rem;">${p.emoji}</span>
            <strong>${escapeHtml(p.name)}</strong>
            ${p.isMe ? '<span style="font-size:0.66rem;color:#FBBF24;font-weight:700;">(Bạn)</span>' : ''}
          </div>
          <span class="chat-seat-tag" data-jump-seat="${p.seat}" title="Xem vị trí ghế ${p.seat}">Ghế ${p.seat}</span>
        </div>
      `
      )
      .join('');

    // Bind click events on Audience Roster jump seat buttons
    roster.querySelectorAll('[data-jump-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        focusOnSeat(btn.dataset.jumpSeat);
      });
    });
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

  function broadcastSync(payload) {
    const packet = { ...payload, senderId: state.clientId, userId: state.me.id };
    const jsonStr = JSON.stringify(packet);

    // 1. Send via WebSocket to server (syncs across all devices, phones, laptops on LAN/Internet)
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try {
        wsClient.send(jsonStr);
      } catch (e) {}
    }

    // 2. Also send via local BroadcastChannel for instant same-browser tabs
    if (syncChannel) {
      try {
        syncChannel.postMessage(packet);
      } catch (e) {}
    }
  }

  function handleIncomingSyncData(data) {
    if (!data || !data.type) return;
    if (data.senderId === state.clientId || (data.userId && data.userId === state.me.id && data.type !== 'ROOM_SYNC')) {
      return;
    }

    switch (data.type) {
      case 'ROOM_SYNC':
        // Full room sync from server when entering
        if (data.assignedSeat && data.assignedSeat !== state.me.seat) {
          state.me.seat = data.assignedSeat;
          saveProfileToStorage();
          const seatPill = document.getElementById('myNavSeat');
          if (seatPill) seatPill.textContent = data.assignedSeat;
        }
        if (data.occupants) {
          state.peers = {};
          Object.values(data.occupants).forEach((occ) => {
            if (occ.id !== state.me.id) {
              state.peers[occ.id] = occ;
            }
          });
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
          loadAndPlayVideo(data.currentVideo, false);
        }
        break;

      case 'USER_JOINED':
        if (data.user && data.user.id && data.user.id !== state.me.id) {
          state.peers[data.user.id] = data.user;
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showSeatSpeechBubble(data.user.seat, `👋 Chào cả rạp, mình vừa vào ngồi ghế ${data.user.seat}!`, 4200);
          showToast(`👋 Khán giả "${data.user.name}" vừa vào rạp (Ghế ${data.user.seat})!`);
        }
        break;

      case 'USER_LEFT':
        if (data.userId && state.peers[data.userId]) {
          const departingUser = state.peers[data.userId];
          delete state.peers[data.userId];
          if (state.skipVotes.has(data.userId)) {
            state.skipVotes.delete(data.userId);
          }
          refreshSeatsVisuals();
          updateSkipVoteUI();
          showToast(`Khán giả "${departingUser.name || 'Một người bạn'}" đã rời khỏi rạp.`);
        }
        break;

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

      case 'LOAD_VIDEO':
        if (data.video) {
          loadAndPlayVideo(data.video, false);
        }
        break;

      case 'SYNC_PLAY_PAUSE':
        if (ytReady && ytPlayer) {
          if (data.isPlaying && typeof ytPlayer.playVideo === 'function') {
            ytPlayer.playVideo();
          } else if (!data.isPlaying && typeof ytPlayer.pauseVideo === 'function') {
            ytPlayer.pauseVideo();
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
    // 1. URL Query Param ?ws=...
    const paramWs = urlParams.get('ws');
    if (paramWs) return paramWs;

    // 2. Saved custom URL in localStorage
    const savedWs = localStorage.getItem('hanzu_cinema_ws_url');
    if (savedWs) return savedWs;

    // 3. Localhost or Local LAN host
    const host = window.location.host;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || /^192\.168\./.test(host) || /^10\./.test(host);
    if (isLocal && host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${host}/ws`;
    }

    // 4. Default Production Cloud WebSocket Server (For GitHub Pages https://jhanzu.github.io/Cinema/)
    return 'wss://cinema-8pqa.onrender.com/ws';
  }

  function updateServerStatusUI(status) {
    const pill = document.getElementById('btnOpenServerSettings');
    const label = document.getElementById('serverStatusText');
    if (!pill || !label) return;

    pill.classList.remove('online', 'connecting', 'offline');
    if (status === 'online') {
      pill.classList.add('online');
      label.textContent = 'Máy chủ chung';
      pill.title = `Đã kết nối máy chủ phòng chiếu: ${currentWsUrl} (Click để xem)`;
    } else if (status === 'connecting') {
      pill.classList.add('connecting');
      label.textContent = 'Đang kết nối...';
      pill.title = `Đang kết nối tới: ${currentWsUrl}`;
    } else {
      pill.classList.add('offline');
      label.textContent = 'Ngoại tuyến';
      pill.title = 'Chưa kết nối máy chủ chung. Click để cài đặt URL server.';
    }
  }

  function initRealtimeWebSocket() {
    currentWsUrl = getTargetWsUrl();
    if (!currentWsUrl) return;

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
        // Register client user with server room
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
    } catch (e) {
      wsConnected = false;
      updateServerStatusUI('offline');
    }
  }

  function setupSyncListener() {
    // 1. Setup local BroadcastChannel for same-browser tabs
    if (syncChannel) {
      broadcastSync({ type: 'PEER_JOIN', user: state.me });
      syncChannel.onmessage = (event) => {
        handleIncomingSyncData(event.data);
      };
    }

    // 2. Setup WebSocket client to connect across multiple devices/LAN/Internet
    initRealtimeWebSocket();

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
      });
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

    // Player Controls
    document.getElementById('btnPlayPause')?.addEventListener('click', () => {
      if (!ytReady || !ytPlayer) {
        showToast('⏳ Trình phát đang khởi động...');
        return;
      }
      try {
        if (state.isPlaying) {
          ytPlayer.pauseVideo();
          broadcastSync({ type: 'SYNC_PLAY_PAUSE', isPlaying: false });
        } else {
          ytPlayer.playVideo();
          broadcastSync({ type: 'SYNC_PLAY_PAUSE', isPlaying: true });
        }
      } catch (e) {}
    });

    document.getElementById('btnMuteToggle')?.addEventListener('click', (e) => {
      if (!ytReady || !ytPlayer) return;
      try {
        if (ytPlayer.isMuted()) {
          ytPlayer.unMute();
          state.isMuted = false;
          e.currentTarget.textContent = '🔊';
        } else {
          ytPlayer.mute();
          state.isMuted = true;
          e.currentTarget.textContent = '🔇';
        }
      } catch (err) {}
    });

    document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
      state.volume = Number(e.target.value);
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

    // Real-time name input preview
    document.getElementById('inputProfileName')?.addEventListener('input', (e) => {
      state.me.name = e.target.value.trim() || 'Khán giả';
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
        input.focus();
        input.select();
      }
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
        state.me.name = nameInput.value.trim();
      }
      const vipSeats = ['E4', 'E5', 'E6', 'E7', 'F4', 'F5', 'F6', 'F7'];
      const pick = vipSeats[Math.floor(Math.random() * vipSeats.length)];
      selectSeat(pick);
      updateProfilePreview();
      saveProfileToStorage();
    });

    document.getElementById('formSaveProfile')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('inputProfileName');
      if (nameInput && nameInput.value.trim()) {
        state.me.name = nameInput.value.trim();
      }
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

    // Auto-open Onboarding Modal on first visit if not yet configured
    if (!state.me.hasConfigured) {
      setTimeout(() => {
        openProfile(true);
      }, 500);
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          closeProfile();
        }
        return;
      }

      if (e.key === 'Escape') {
        closeProfile();
      } else if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('btnPlayPause')?.click();
      } else if (e.key === 'v' || e.key === 'V') {
        setCameraMode(state.cameraMode === 'pov' ? 'orbit' : 'pov');
      } else if (e.key === 'l' || e.key === 'L') {
        document.getElementById('btnToggleLights')?.click();
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
        const fps = Math.min(60, Math.round((frameCount * 1000) / elapsed));
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
    startFpsMonitor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
