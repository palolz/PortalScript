import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true
});

// LLM output is untrusted: strip scripts/handlers and only keep web/mail links (opened externally by main).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(href)) {
      node.removeAttribute('href');
    } else {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (node.tagName === 'IMG') {
    node.remove();
  }
});

function renderMarkdown(md) {
  if (!md) return { __html: '' };
  return {
    __html: DOMPurify.sanitize(marked.parse(md), {
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'svg', 'math'],
      FORBID_ATTR: ['style']
    })
  };
}

function PortalScriptLogo() {
  return (
    <div className="pt-logo" aria-label="PortalScript">
      <svg viewBox="0 0 48 48" className="pt-logo-dot" aria-hidden="true">
        <circle cx="24" cy="24" r="22.5" fill="#e6802e" stroke="#141413" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="8" fill="#141413" />
        <circle cx="24" cy="24" r="2.4" fill="#e6802e" />
      </svg>
      <div className="pt-logo-wordmark">
        <span className="pt-logo-line1">PORTAL</span>
        <span className="pt-logo-line2">SCRIPT</span>
      </div>
    </div>
  );
}

const STT_LABELS = {
  hybrid: 'APPLE LIVE + GEMINI',
  gemini: 'GEMINI AUDIO',
  groq: 'GROQ WHISPER',
  openai: 'OPENAI WHISPER',
  apple: 'APPLE ON-DEVICE'
};

const CONTEXT_KIND_STYLE = {
  pdf: { ink: '#d93a26', label: 'PDF' },
  doc: { ink: '#1f5fd1', label: 'DOC' },
  sheet: { ink: '#0b9a4b', label: 'XLS' },
  slides: { ink: '#e0640f', label: 'PPT' },
  image: { ink: '#8e5bd8', label: 'IMG' },
  web: { ink: '#0f9bb5', label: 'WEB' },
  md: { ink: '#e6dfcf', label: 'MD', dark: true },
  text: { ink: '#b9b3a6', label: 'TXT', dark: true },
  code: { ink: '#ffb000', label: 'CODE', dark: true }
};

function ContextFileIcon({ doc }) {
  const ext = (doc.ext || doc.name.split('.').pop() || '').toLowerCase();
  const kind = doc.kind || (ext === 'md' || ext === 'markdown' ? 'md' : 'text');
  const style = CONTEXT_KIND_STYLE[kind] || CONTEXT_KIND_STYLE.text;
  const label = kind === 'code' && ext.length <= 4 ? ext.toUpperCase() : style.label;
  const cut = style.dark ? '#141413' : '#f6f2e9';
  return (
    <svg viewBox="0 0 30 36" className="ctx-icon" aria-hidden="true">
      <path d="M2 3a2 2 0 0 1 2-2h15l9 9v23a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill={style.ink} />
      <path d="M19 1v7a2 2 0 0 0 2 2h7" fill="none" stroke={cut} strokeOpacity="0.55" strokeWidth="1.4" />
      {kind === 'image' ? (
        <>
          <circle cx="10" cy="11" r="2.4" fill={cut} />
          <path d="M5 21l6-6 4 4 3-3 7 7z" fill={cut} />
        </>
      ) : (
        <path d="M6 9h9M6 13h17M6 17h13" stroke={cut} strokeWidth="1.8" strokeLinecap="round" />
      )}
      <text x="15" y="31" textAnchor="middle" fill={cut} className="ctx-icon-label">
        {label}
      </text>
    </svg>
  );
}

function formatEngineLabel(engine) {
  if (!engine?.model) return '—';
  const model = String(engine.model).replace(/^(ollama|openai|anthropic|groq|openrouter|custom):/, '');
  return (
    <>
      {engine.provider && <span className="oled-info-provider">{`${engine.provider} · `.toUpperCase()}</span>}
      {model.toUpperCase()}
    </>
  );
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [devices, setDevices] = useState([]);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [modelCatalog, setModelCatalog] = useState({
    gemini: [
      'gemini-3.8-flash',
      'gemini-4-argon',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro-preview'
    ],
    openai: [
      'openai:gpt-6.1-sol',
      'openai:gpt-6.1-sol-pro',
      'openai:gpt-6-luna',
      'openai:gpt-6-luna-pro',
      'openai:gpt-6-sol',
      'openai:gpt-5.6-sol',
      'openai:gpt-5-mini'
    ],
    anthropic: [
      'anthropic:claude-sonnet-5.5',
      'anthropic:claude-opus-5.5',
      'anthropic:claude-haiku-5.5',
      'anthropic:claude-fable-5.1',
      'anthropic:claude-opus-4.8'
    ],
    groq: [
      'groq:meta-llama/llama-4-maverick-17b-128e-instruct',
      'groq:meta-llama/llama-4-scout-17b-16e-instruct',
      'groq:qwen-qwq-32b',
      'groq:deepseek-r1-distill-llama-70b',
      'groq:llama-3.3-70b-versatile'
    ],
    openrouter: [
      'openrouter:google/gemini-3.8-flash',
      'openrouter:google/gemini-4-argon',
      'openrouter:anthropic/claude-sonnet-5.5',
      'openrouter:anthropic/claude-opus-5.5',
      'openrouter:anthropic/claude-haiku-5.5',
      'openrouter:openai/gpt-6.1-sol',
      'openrouter:openai/gpt-6-luna',
      'openrouter:deepseek/deepseek-v4.1-flash',
      'openrouter:deepseek/deepseek-v4-pro',
      'openrouter:x-ai/grok-4.7',
      'openrouter:meta-llama/llama-4-maverick'
    ],
    ollama: []
  });
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [session, setSession] = useState({ segments: [], copilotCards: [] });
  const [pastSessions, setPastSessions] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [resolvedEngines, setResolvedEngines] = useState({ fast: {}, deep: {} });
  const [levels, setLevels] = useState({ me: 0, other: 0 });
  const [statusMessage, setStatusMessage] = useState(null);
  const [collapsedCards, setCollapsedCards] = useState({});
  const [cardFollowUps, setCardFollowUps] = useState({});
  const [selectedInBox, setSelectedInBox] = useState(null); // { segmentId, text }
  const [selectedInCard, setSelectedInCard] = useState(null); // { cardId, text, context }
  const [isDraggingMd, setIsDraggingMd] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [sysMenuOpen, setSysMenuOpen] = useState(false);
  const [sysApps, setSysApps] = useState({ loading: false, apps: [], error: null });
  const [scrubStatus, setScrubStatus] = useState(null); // 'FWD' | 'REV' | null
  const [scrubProgress, setScrubProgress] = useState(0.5); // 0..1 playhead position on timeline
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [ledFlashKey, setLedFlashKey] = useState(null);
  const ledFlashTimerRef = useRef(null);
  const [showDevTools, setShowDevTools] = useState(() => localStorage.getItem('pt.devTools') === '1');
  const prefersReducedMotion = useRef(
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Modals
  const [activeModal, setActiveModal] = useState(null); // 'settings' | 'profile' | 'sessions' | 'new-session' | null
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionParentDir, setNewSessionParentDir] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [simText, setSimText] = useState('');
  const [simSpeaker, setSimSpeaker] = useState('other');

  // Custom right-click menu state
  const [contextMenu, setContextMenu] = useState(null);

  const transcriptEndRef = useRef(null);
  const manualQueryInputRef = useRef(null);
  const shortcutRef = useRef({});
  const selectionTimerRef = useRef(null);
  const boxClickTimerRef = useRef(null);
  const reelLeftRef = useRef(null);
  const reelRightRef = useRef(null);
  const tapePathRef = useRef(null);
  const tapeAnimRef = useRef({
    angleLeft: 0,
    angleRight: 0,
    dashOffset: 0,
    scrubVel: 0,
    lastScrollTop: 0,
    scrubTimeout: null
  });

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // Synchronized Tape Transport + Scroll Scrubbing Physics Loop
  // Writes SVG transforms directly from requestAnimationFrame so the reels animate without React re-renders.
  // Idles completely when paused, unfocused or reduced-motion; scrubbing kicks it back on.
  useEffect(() => {
    const state = tapeAnimRef.current;
    const reelsSpin = isRecording && isWindowFocused && !prefersReducedMotion.current;

    const tick = () => {
      const baseSpeed = reelsSpin ? 1.55 : 0;
      const totalVel = baseSpeed + state.scrubVel;

      if (Math.abs(totalVel) > 0.01) {
        state.angleLeft = (state.angleLeft + totalVel) % 360;
        state.angleRight = (state.angleRight + totalVel * 1.24) % 360;
        state.dashOffset = (state.dashOffset - totalVel * 0.38) % 12;

        if (reelLeftRef.current) {
          reelLeftRef.current.setAttribute('transform', `rotate(${state.angleLeft.toFixed(2)} 60 31)`);
        }
        if (reelRightRef.current) {
          reelRightRef.current.setAttribute('transform', `rotate(${state.angleRight.toFixed(2)} 156 31)`);
        }
        if (tapePathRef.current) {
          tapePathRef.current.style.strokeDashoffset = `${state.dashOffset.toFixed(2)}`;
        }
      }

      // Smooth tape capstan friction decay when scrubbing stops
      state.scrubVel *= 0.86;
      if (Math.abs(state.scrubVel) < 0.02) {
        state.scrubVel = 0;
      }

      state.rafId = reelsSpin || state.scrubVel !== 0 ? requestAnimationFrame(tick) : null;
    };

    state.kick = () => {
      if (!state.rafId) state.rafId = requestAnimationFrame(tick);
    };
    state.kick();
    return () => {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    };
  }, [isRecording, isWindowFocused]);

  const triggerTapeScrub = (deltaY, scrollEl = null) => {
    if (!deltaY || Math.abs(deltaY) < 0.5) return;
    const state = tapeAnimRef.current;
    // Clamp velocity so fast trackpad flicks look like high-speed reel scrubbing
    if (!prefersReducedMotion.current) {
      state.scrubVel = Math.max(-18, Math.min(18, state.scrubVel + deltaY * 0.22));
      state.kick?.();
    }
    setScrubStatus(deltaY > 0 ? 'FWD' : 'REV');

    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
      const ratio = scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight);
      setScrubProgress(Math.max(0, Math.min(1, ratio)));
    } else {
      setScrubProgress((prev) => Math.max(0, Math.min(1, prev + (deltaY > 0 ? 0.03 : -0.03))));
    }

    if (state.scrubTimeout) clearTimeout(state.scrubTimeout);
    state.scrubTimeout = setTimeout(() => {
      setScrubStatus(null);
    }, 260);
  };

  const handleTextScroll = (e) => {
    const el = e.currentTarget;
    const delta = el.scrollTop - (tapeAnimRef.current.lastScrollTop || 0);
    tapeAnimRef.current.lastScrollTop = el.scrollTop;
    triggerTapeScrub(delta, el);
  };

  const handleTextWheel = (e) => {
    const el = e.currentTarget;
    // If container does not overflow yet, still scrub the tape reels from wheel delta
    if (el.scrollHeight <= el.clientHeight) {
      triggerTapeScrub(e.deltaY, el);
    }
  };

  const formatTapeCounter = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Track window focus for the header styling
  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setIsWindowFocused(true);
      } else {
        setIsWindowFocused(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    window.liveTranscriptAPI.init().then((data) => {
      setSettings(data.settings);
      setDevices(data.devices || []);
      setOllamaModels(data.ollamaModels || []);
      if (data.modelCatalog) setModelCatalog((prev) => ({ ...prev, ...data.modelCatalog }));
      if (data.currentSession) {
        setSession(data.currentSession);
        const initCollapsed = {};
        (data.currentSession.copilotCards || []).forEach((c, idx) => {
          initCollapsed[c.id] = idx > 0;
        });
        setCollapsedCards(initCollapsed);
      }
      setPastSessions(data.pastSessions || []);
      setIsRecording(Boolean(data.isRecording));
      if (data.resolvedEngines) setResolvedEngines(data.resolvedEngines);
      if (data.secureStorage === false) {
        setStatusMessage(
          "macOS Keychain isn't available, so API keys are stored unencrypted (owner-only file)."
        );
      }
    });

    const unsubSession = window.liveTranscriptAPI.onSessionUpdated((payload) => {
      setSession((prev) => ({
        ...prev,
        id: payload.sessionId,
        segments: payload.segments
      }));
    });

    const unsubCard = window.liveTranscriptAPI.onCopilotCardUpdated((updatedCard) => {
      setSession((prev) => {
        const existingIdx = (prev.copilotCards || []).findIndex((c) => c.id === updatedCard.id);
        let nextCards;
        if (existingIdx >= 0) {
          nextCards = [...prev.copilotCards];
          nextCards[existingIdx] = updatedCard;
        } else {
          // Collapse ("exit") previous open windows without deleting them when a new window opens
          setCollapsedCards((prevCollapsed) => {
            const next = { ...prevCollapsed, [updatedCard.id]: false };
            for (const c of prev.copilotCards || []) {
              next[c.id] = true;
            }
            return next;
          });
          nextCards = [updatedCard, ...(prev.copilotCards || [])];
        }
        return { ...prev, copilotCards: nextCards };
      });
    });

    const unsubLevel = window.liveTranscriptAPI.onAudioLevel(({ speaker, rms }) => {
      const scaled = Math.min(100, Math.round(Math.sqrt(rms) * 280));
      setLevels((prev) => ({ ...prev, [speaker]: scaled }));
    });

    const unsubStatus = window.liveTranscriptAPI.onAudioStatus((evt) => {
      if (evt.type === 'error' || evt.type === 'warning') {
        setStatusMessage(evt.message);
      }
    });

    const unsubRec = window.liveTranscriptAPI.onRecordingState(({ isRecording: rec }) => {
      setIsRecording(rec);
      if (!rec) {
        setLevels({ me: 0, other: 0 });
      }
    });

    const closeMenu = () => {
      setContextMenu(null);
      setMicMenuOpen(false);
      setSysMenuOpen(false);
    };
    window.addEventListener('click', closeMenu);

    return () => {
      unsubSession();
      unsubCard();
      unsubLevel();
      unsubStatus();
      unsubRec();
      window.removeEventListener('click', closeMenu);
    };
  }, []);

  useEffect(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.segments?.length]);

  const flashKeyLed = (name) => {
    clearTimeout(ledFlashTimerRef.current);
    setLedFlashKey(null);
    requestAnimationFrame(() => setLedFlashKey(name));
    ledFlashTimerRef.current = setTimeout(() => setLedFlashKey(null), 700);
  };

  const handleToggleRecording = async () => {
    setStatusMessage(null);
    if (isRecording) {
      await window.liveTranscriptAPI.stopRecording();
    } else {
      await window.liveTranscriptAPI.startRecording();
    }
  };

  const handleSelectMicDevice = async (micDeviceId) => {
    setMicMenuOpen(false);
    const res = await window.liveTranscriptAPI.saveSettings({ micDeviceId });
    setSettings(res.settings);
    setResolvedEngines(res.resolvedEngines);
  };

  const handleToggleChannel = async (speaker) => {
    const muted = speaker === 'me' ? !settings?.egoMuted : !settings?.sysMuted;
    const res = await window.liveTranscriptAPI.setChannelMuted(speaker, muted);
    if (res?.settings) setSettings(res.settings);
  };

  const handleToggleSysMenu = async () => {
    const opening = !sysMenuOpen;
    setMicMenuOpen(false);
    setSysMenuOpen(opening);
    if (!opening) return;
    setSysApps((prev) => ({ ...prev, loading: true, error: null }));
    const res = await window.liveTranscriptAPI.listAudioApps();
    setSysApps({ loading: false, apps: res?.apps || [], error: res?.error || null });
  };

  const handleSelectSysApp = async (app) => {
    setSysMenuOpen(false);
    const res = await window.liveTranscriptAPI.setSysAudioApp(app);
    if (res?.settings) setSettings(res.settings);
  };

  const handleToggleMicOnly = async () => {
    const nextMode = (settings?.micMode || 'direct') === 'direct' ? 'room' : 'direct';
    const res = await window.liveTranscriptAPI.saveSettings({ micMode: nextMode });
    setSettings(res.settings);
  };

  const openNewSessionModal = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16).replace('T', '_');
    setNewSessionName(`Session_${stamp}`);
    setActiveModal('new-session');
  };

  const handleCreateNewSession = async (e) => {
    e.preventDefault();
    const res = await window.liveTranscriptAPI.newSession({
      sessionName: newSessionName.trim(),
      parentDir: newSessionParentDir || undefined
    });
    if (res?.currentSession) {
      setSession(res.currentSession);
      setPastSessions(res.pastSessions || []);
      setActiveModal(null);
    }
  };

  const handleToggleSpeaker = async (e, segmentId) => {
    e.stopPropagation();
    const res = await window.liveTranscriptAPI.toggleSpeaker(segmentId);
    if (res) {
      setSession((prev) => ({ ...prev, segments: res.segments }));
    }
  };

  // Plain single click on a box (no selection, not on a control) → freeze it if live and ask for an interviewer answer.
  const handleBoxClick = (e, seg) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    clearTimeout(boxClickTimerRef.current);
    if (e.detail > 1) return;
    boxClickTimerRef.current = setTimeout(async () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      const res = await window.liveTranscriptAPI.answerSegment(seg.id);
      if (!res?.card) return;
      if (res.reused) {
        setCollapsedCards((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) next[id] = true;
          next[res.card.id] = false;
          return next;
        });
      }
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-card-id="${CSS.escape(res.card.id)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      );
    }, 260);
  };

  const openConceptWindow = (query, surroundingContext = '', kind = 'term', segmentId = null) => {
    const clean = (query || '').trim();
    if (!clean || clean.length < 2) return;
    window.liveTranscriptAPI.copilotLookup({
      kind,
      query: clean,
      surroundingContext: surroundingContext || clean,
      segmentId,
      runDeepImmediately: false
    });
  };

  // Track selection inside a transcript box so pressing "Open in Context Window" knows whether a phrase is selected
  const handleBoxSelectionChange = (e, seg) => {
    const container = e.currentTarget;
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (
        !sel ||
        sel.isCollapsed ||
        !container.contains(sel.anchorNode) ||
        !container.contains(sel.focusNode)
      ) {
        setSelectedInBox((prev) => (prev?.segmentId === seg.id ? null : prev));
        return;
      }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length >= 2) {
        setSelectedInBox({ segmentId: seg.id, text });
      }
    }, 60);
  };

  const handleOpenBoxInContextWindow = (seg) => {
    let selectedText = '';
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      selectedText = sel.toString().replace(/\s+/g, ' ').trim();
    }
    if (!selectedText && selectedInBox?.segmentId === seg.id) {
      selectedText = selectedInBox.text;
    }

    if (selectedText && selectedText.length >= 2 && selectedText !== seg.text.trim()) {
      openConceptWindow(selectedText, seg.text, 'selection', seg.id);
      setSelectedInBox(null);
      window.getSelection()?.removeAllRanges();
    } else {
      openConceptWindow(seg.text, seg.text, 'box', seg.id);
    }
  };

  // Inside right-hand Context Windows, track selected text so user can right-click or use the GUI action bar without auto-jumping
  const handleCardSelectionChange = (e, card, surroundingContext = '') => {
    const container = e.currentTarget;
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (
        !sel ||
        sel.isCollapsed ||
        !container.contains(sel.anchorNode) ||
        !container.contains(sel.focusNode)
      ) {
        setSelectedInCard((prev) => (prev?.cardId === card.id ? null : prev));
        return;
      }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length >= 2) {
        setSelectedInCard({
          cardId: card.id,
          text,
          context: surroundingContext || card.fastResponse || card.query
        });
      }
    }, 60);
  };

  const getSelectedTextInCard = (cardId) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      const t = sel.toString().replace(/\s+/g, ' ').trim();
      if (t.length >= 2) return t;
    }
    if (selectedInCard?.cardId === cardId && selectedInCard.text) {
      return selectedInCard.text;
    }
    return '';
  };

  const handleExplainInCardButton = (card) => {
    const selectedText = getSelectedTextInCard(card.id);
    setCollapsedCards((prev) => ({ ...prev, [card.id]: false }));
    if (selectedText) {
      window.liveTranscriptAPI.copilotFindMore(
        card.id,
        `Explain "${selectedText}" further in the context of this conversation and how I should use or talk about it.`
      );
      setSelectedInCard(null);
      window.getSelection()?.removeAllRanges();
    } else {
      window.liveTranscriptAPI.copilotFindMore(card.id);
    }
  };

  const handleOpenCardSelectionInNewWindow = (card) => {
    const selectedText = getSelectedTextInCard(card.id);
    const targetQuery = selectedText || card.query;
    const context =
      [card.fastResponse, card.deepResponse].filter(Boolean).join('\n\n') || card.surroundingContext;
    openConceptWindow(targetQuery, context, 'selection');
    setSelectedInCard(null);
    window.getSelection()?.removeAllRanges();
  };

  const applyContextResult = (res) => {
    if (!res) return;
    setSession((prev) => ({ ...prev, contextDocs: res.contextDocs || [] }));
    if (res.errors?.length) setStatusMessage(`Couldn't read: ${res.errors.join(' · ')}`);
  };

  const handleDropContextMd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMd(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) applyContextResult(await window.liveTranscriptAPI.addDroppedFiles(files));
  };

  const handlePickContextDoc = async () => {
    applyContextResult(await window.liveTranscriptAPI.pickContextDoc());
  };

  const handleRemoveContextDoc = async (docId) => {
    const contextDocs = await window.liveTranscriptAPI.removeContextDoc(docId);
    setSession((prev) => ({ ...prev, contextDocs }));
  };

  const handleCardFollowUpSubmit = (e, cardId) => {
    e.preventDefault();
    const q = (cardFollowUps[cardId] || '').trim();
    if (!q) return;
    setCardFollowUps((prev) => ({ ...prev, [cardId]: '' }));
    setCollapsedCards((prev) => ({ ...prev, [cardId]: false }));
    window.liveTranscriptAPI.copilotFindMore(cardId, q);
  };

  const toggleCardCollapse = (cardId) => {
    setCollapsedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handleRemoveCard = async (e, cardId) => {
    e.stopPropagation();
    const nextCards = await window.liveTranscriptAPI.removeCard(cardId);
    setSession((prev) => ({ ...prev, copilotCards: nextCards }));
  };

  const handleContextMenu = (e, fallbackText, surroundingContext = '', cardId = null) => {
    e.preventDefault();
    e.stopPropagation();
    const selectedText =
      window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ||
      (cardId && selectedInCard?.cardId === cardId ? selectedInCard.text : '');
    const queryText = selectedText || fallbackText;
    if (!queryText) return;

    const x = Math.min(e.clientX, window.innerWidth - 320);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    setContextMenu({
      x,
      y,
      query: queryText,
      context: surroundingContext || fallbackText,
      cardId
    });
  };

  const handleManualLookup = (e, deep = false) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    const q = manualQuery.trim();
    const isQ = q.includes('?') || q.split(/\s+/).length >= 6;
    window.liveTranscriptAPI.copilotLookup({
      kind: isQ ? 'question' : 'term',
      query: q,
      surroundingContext: q,
      runDeepImmediately: deep || isQ
    });
    setManualQuery('');
  };

  const handleSimulateSubmit = async (e) => {
    e.preventDefault();
    if (!simText.trim()) return;
    const text = simText.trim();
    setSimText('');
    await window.liveTranscriptAPI.simulateUtterance({
      speaker: simSpeaker,
      text
    });
  };

  const handleSaveSettingsModal = async (e) => {
    e.preventDefault();
    const res = await window.liveTranscriptAPI.saveSettings(settings);
    setSettings(res.settings);
    setOllamaModels(res.ollamaModels || []);
    if (res.modelCatalog) setModelCatalog((prev) => ({ ...prev, ...res.modelCatalog }));
    setResolvedEngines(res.resolvedEngines);
    setActiveModal(null);
  };

  const handlePickProfileFile = async () => {
    const res = await window.liveTranscriptAPI.pickProfileFile();
    if (res) {
      setSettings(res.settings);
    }
  };

  useEffect(() => {
    localStorage.setItem('pt.devTools', showDevTools ? '1' : '0');
  }, [showDevTools]);

  shortcutRef.current = {
    toggleRecording: handleToggleRecording,
    escape: () => {
      if (contextMenu || micMenuOpen || sysMenuOpen) {
        setContextMenu(null);
        setMicMenuOpen(false);
        setSysMenuOpen(false);
      } else if (activeModal) {
        setActiveModal(null);
      } else if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      } else {
        setSelectedInBox(null);
        setSelectedInCard(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    hasModal: Boolean(activeModal)
  };

  // Space = start/pause capture, ⌘K = ask box, ⌘⇧D = dev tools, Esc = close / clear
  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        shortcutRef.current.escape();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveModal(null);
        manualQueryInputRef.current?.focus();
        manualQueryInputRef.current?.select();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDevTools((v) => !v);
      } else if (
        e.code === 'Space' &&
        !e.repeat &&
        !mod &&
        !isTyping &&
        !(target instanceof HTMLButtonElement) &&
        !shortcutRef.current.hasModal
      ) {
        e.preventDefault();
        shortcutRef.current.toggleRecording();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const recDateObj = new Date(session.createdAt || session.updatedAt || Date.now());
  const recMonthStr = recDateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const recDayStr = String(recDateObj.getDate()).padStart(2, '0');
  const recYearStr = `'${String(recDateObj.getFullYear()).slice(-2)}`;

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="top-header">
        {/* Key bank */}
        <div className="header-actions op1-keybed">
          {/* Start / pause capture */}
          <button
            type="button"
            className={`op1-key-btn drum-pad-btn ${isRecording ? 'is-recording' : 'is-idle'}`}
            onClick={handleToggleRecording}
            title={
              isRecording
                ? 'Pause live capture — Space (session & audio are saved automatically)'
                : (session.segments?.length || 0) > 0
                  ? 'Continue recording into this same session — Space'
                  : 'Start live capture — Space'
            }
          >
            {/* LED + on/off readout */}
            <div className="drum-pad-top">
              <span className="drum-pad-led" />
              <div className="drum-pad-matrix">
                <span className="drum-pad-matrix-text">{isRecording ? 'ON·LIVE' : 'OFF'}</span>
              </div>
            </div>

            {/* Pad texture */}
            <div className="drum-pad-grip" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>

            {/* Pad label */}
            <div className="drum-pad-bottom">
              <span className="drum-pad-main-label">
                {isRecording ? 'PAUSE' : (session.segments?.length || 0) > 0 ? 'CONTINUE' : 'START'}
              </span>
              <span className="drum-pad-sub-label">LIVE CAPTURE</span>
            </div>
          </button>

          {/* Ego-only toggle */}
          <button
            type="button"
            className={`op1-key-btn toggle-key ${(settings?.micMode || 'direct') === 'direct' ? 'is-on' : 'is-off'}`}
            style={{ '--key-ink': '#0b9a4b' }}
            onClick={handleToggleMicOnly}
            title={
              (settings?.micMode || 'direct') === 'direct'
                ? 'ON: Mic captures EGO only (click to turn off for Room/2-PC Mic)'
                : 'OFF: Room Mic mode (click to isolate Mic to EGO only)'
            }
          >
            <span className="op1-key-led" />
            <div className="op1-key-circle">
              <svg viewBox="0 0 24 24" className="op1-circle-svg" aria-hidden="true">
                <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
                <path
                  d="M5.5 11a6.5 6.5 0 0 0 13 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <path
                  d="M12 17.5V21M8.5 21h7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="op1-key-label">EGO ONLY</span>
          </button>

          {/* Profile */}
          <button
            type="button"
            className={`op1-key-btn ${activeModal === 'profile' ? 'active' : ''} ${ledFlashKey === 'profile' ? 'led-flash' : ''}`}
            style={{ '--key-ink': '#e0640f' }}
            onClick={() => {
              flashKeyLed('profile');
              setActiveModal('profile');
            }}
            title="Load or Edit Your .md Candidate Profile"
          >
            <span className="op1-key-led" />
            <div className="op1-key-circle">
              <svg viewBox="0 0 24 24" className="op1-circle-svg" aria-hidden="true">
                <path
                  d="M6 2.5h8.5L19 7v14.5H6z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <path
                  className="cut"
                  d="M14.5 2.5V7H19M9 11h7M9 14.5h7M9 18h4.5"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="op1-key-label">MD PROFILE</span>
          </button>

          {/* Sessions */}
          <button
            type="button"
            className={`op1-key-btn ${activeModal === 'sessions' ? 'active' : ''} ${ledFlashKey === 'sessions' ? 'led-flash' : ''}`}
            style={{ '--key-ink': '#1f5fd1' }}
            onClick={() => {
              flashKeyLed('sessions');
              setActiveModal('sessions');
            }}
            title="Create, Load, or Export Sessions"
          >
            <span className="op1-key-led" />
            <div className="op1-key-circle">
              <svg viewBox="0 0 24 24" className="op1-circle-svg" aria-hidden="true">
                <rect x="2.5" y="5" width="19" height="14" rx="2.2" fill="currentColor" />
                <circle className="cut" cx="8" cy="11" r="2.6" />
                <circle className="cut" cx="16" cy="11" r="2.6" />
                <path className="cut" d="M7 19l1.6-3.2h6.8L17 19z" />
              </svg>
            </div>
            <span className="op1-key-label">SESSIONS</span>
          </button>

          {/* API & LLM settings */}
          <button
            type="button"
            className={`op1-key-btn ${activeModal === 'settings' ? 'active' : ''} ${ledFlashKey === 'settings' ? 'led-flash' : ''}`}
            style={{ '--key-ink': '#d93a26' }}
            onClick={() => {
              flashKeyLed('settings');
              setActiveModal('settings');
            }}
            title="Configure Fast & Deep LLMs, API Keys, and Transcription"
          >
            <span className="op1-key-led" />
            <div className="op1-key-circle">
              <svg viewBox="0 0 24 24" className="op1-circle-svg" aria-hidden="true">
                <path
                  d="M6 6.5h12M6 6.5l6 11.5M18 6.5l-6 11.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle cx="6" cy="6.5" r="3.3" fill="currentColor" />
                <circle cx="18" cy="6.5" r="3.3" fill="currentColor" />
                <circle cx="12" cy="18" r="3.3" fill="currentColor" />
              </svg>
            </div>
            <span className="op1-key-label">API & LLMS</span>
          </button>
        </div>

        {/* Black screen: tape transport, audio channels, session readout */}
        <div className="audio-controls-group">
          {/* Tape transport (animated from the rAF loop) */}
          <div
            className={`oled-tape-screen ${isRecording ? 'is-running' : 'is-paused'} ${scrubStatus ? 'is-scrubbing' : ''}`}
            title={
              scrubStatus
                ? `Scrubbing Tape (${scrubStatus === 'FWD' ? 'Forward ≫' : '≪ Reverse'})`
                : isRecording
                  ? 'Live Dual-Channel Capture Active (Tape Running)'
                  : 'Tape Transport Paused — Press Record or Scroll Text to Scrub'
            }
          >
            <div className="oled-glass-glare" />
            <svg viewBox="0 0 220 68" className="oled-tape-svg" aria-label="Tape Transport Status Display">
              {/* Date stamp */}
              <g className="oled-date-graphic">
                <rect
                  x="4"
                  y="5"
                  width="30"
                  height="23"
                  rx="1.5"
                  fill="#0c0c0b"
                  stroke="#f4f1e8"
                  strokeWidth="1.1"
                />
                <rect x="4" y="5" width="30" height="8" fill="#f4f1e8" />
                <text
                  x="19"
                  y="11.2"
                  textAnchor="middle"
                  fill="#050505"
                  fontSize="6.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="900"
                  letterSpacing="0.5"
                >
                  {recMonthStr}
                </text>
                <text
                  x="15"
                  y="23"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  fontWeight="800"
                >
                  {recDayStr}
                </text>
                <text
                  x="27.5"
                  y="22.5"
                  textAnchor="middle"
                  fill="#e6802e"
                  fontSize="6"
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                >
                  {recYearStr}
                </text>
              </g>

              {/* Timecode / scrub readout */}
              <text
                x="108"
                y="15"
                textAnchor="middle"
                fill={scrubStatus ? '#39ff14' : isRecording ? '#ffffff' : '#9e998e'}
                fontSize="11"
                fontFamily="var(--font-mono)"
                fontWeight="700"
                letterSpacing="0.8"
              >
                {scrubStatus === 'REV'
                  ? '≪ SCRUB'
                  : scrubStatus === 'FWD'
                    ? 'SCRUB ≫'
                    : formatTapeCounter(
                        recSeconds +
                          Math.round((session.segments?.length || 0) * 14 * (isRecording ? 1 : scrubProgress))
                      )}
              </text>

              {/* Scale ticks */}
              <line x1="94" y1="20" x2="94" y2="23" stroke="#8c877e" strokeWidth="1" />
              <line x1="101" y1="20" x2="101" y2="22.5" stroke="#8c877e" strokeWidth="1" />
              <line x1="108" y1="19.5" x2="108" y2="24" stroke="#ffffff" strokeWidth="1.2" />
              <line x1="115" y1="20" x2="115" y2="22.5" stroke="#8c877e" strokeWidth="1" />
              <line x1="122" y1="20" x2="122" y2="23" stroke="#8c877e" strokeWidth="1" />

              {/* State glyph */}
              <path
                d="M 101 30 H 115 A 3.5 3.5 0 0 1 115 37 H 100 A 3.5 3.5 0 0 1 100 30 H 105"
                fill="none"
                stroke={scrubStatus ? '#39ff14' : isRecording ? '#e6802e' : '#8c877e'}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <polyline
                points={scrubStatus === 'REV' ? '104,27.5 100.5,30 104,32.5' : '111,27.5 114.5,30 111,32.5'}
                fill="none"
                stroke={scrubStatus ? '#39ff14' : isRecording ? '#e6802e' : '#8c877e'}
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Supply reel */}
              <g ref={reelLeftRef} className="tape-reel-left">
                <circle cx="60" cy="31" r="20" fill="none" stroke="#f4f1e8" strokeWidth="1.3" />
                <circle
                  cx="60"
                  cy="31"
                  r="12"
                  fill="rgba(255,255,255,0.06)"
                  stroke="#57554f"
                  strokeWidth="0.8"
                />
                <circle cx="60" cy="31" r="6" fill="none" stroke="#f4f1e8" strokeWidth="1.3" />
                <circle cx="60" cy="31" r="2.2" fill="none" stroke="#f4f1e8" strokeWidth="1.1" />
                <line x1="60" y1="12" x2="60" y2="22" stroke="#f4f1e8" strokeWidth="1.2" />
                <line x1="43.5" y1="40.5" x2="52.2" y2="35.5" stroke="#f4f1e8" strokeWidth="1.2" />
                <line x1="76.5" y1="40.5" x2="67.8" y2="35.5" stroke="#f4f1e8" strokeWidth="1.2" />
              </g>

              {/* Take-up reel */}
              <g ref={reelRightRef} className="tape-reel-right">
                <circle cx="156" cy="31" r="20" fill="none" stroke="#f4f1e8" strokeWidth="1.3" />
                <circle
                  cx="156"
                  cy="31"
                  r="13.5"
                  fill="rgba(255,255,255,0.06)"
                  stroke="#57554f"
                  strokeWidth="0.8"
                />
                <circle cx="156" cy="31" r="6" fill="none" stroke="#f4f1e8" strokeWidth="1.3" />
                <circle cx="156" cy="31" r="2.2" fill="none" stroke="#f4f1e8" strokeWidth="1.1" />
                <line x1="156" y1="12" x2="156" y2="22" stroke="#f4f1e8" strokeWidth="1.2" />
                <line x1="139.5" y1="40.5" x2="148.2" y2="35.5" stroke="#f4f1e8" strokeWidth="1.2" />
                <line x1="172.5" y1="40.5" x2="163.8" y2="35.5" stroke="#f4f1e8" strokeWidth="1.2" />
              </g>

              {/* Tape path */}
              <polyline
                ref={tapePathRef}
                className="tape-path-line"
                points="44,43 72,53 86,52 108,54 130,52 144,53 168,36"
                fill="none"
                stroke={isRecording || scrubStatus ? '#f4f1e8' : '#9e998e'}
                strokeWidth="1.2"
                strokeDasharray={isRecording || scrubStatus ? '4 2' : 'none'}
              />

              {/* Rollers and head */}
              <circle cx="72" cy="53" r="2.2" fill="#0a0a0a" stroke="#f4f1e8" strokeWidth="1.2" />
              <circle cx="86" cy="52" r="3.6" fill="#0a0a0a" stroke="#f4f1e8" strokeWidth="1.2" />
              <circle cx="86" cy="52" r="1" fill="#f4f1e8" />
              <rect
                x="104.5"
                y="48.5"
                width="7"
                height="6"
                fill="#0a0a0a"
                stroke={isRecording ? '#e6802e' : scrubStatus ? '#39ff14' : '#ffffff'}
                strokeWidth="1.3"
              />
              <circle cx="130" cy="52" r="3.6" fill="#0a0a0a" stroke="#f4f1e8" strokeWidth="1.2" />
              <line x1="128.5" y1="53.5" x2="131.5" y2="50.5" stroke="#f4f1e8" strokeWidth="1" />
              <circle cx="144" cy="53" r="2.2" fill="#0a0a0a" stroke="#f4f1e8" strokeWidth="1.2" />

              {/* Timeline and playhead */}
              <line
                x1={42 + scrubProgress * 130}
                y1="51"
                x2={42 + scrubProgress * 130}
                y2="65"
                stroke={scrubStatus ? '#39ff14' : '#ffffff'}
                strokeWidth="1.3"
              />
              <line x1="42" y1="58" x2="42" y2="61" stroke="#8c877e" strokeWidth="1" />
              <line x1="85" y1="58" x2="85" y2="61" stroke="#8c877e" strokeWidth="1" />
              <line x1="131" y1="58" x2="131" y2="61" stroke="#8c877e" strokeWidth="1" />
              <line x1="175" y1="58" x2="175" y2="61" stroke="#8c877e" strokeWidth="1" />

              {/* Loop bar */}
              <line x1="108" y1="59.5" x2="146" y2="59.5" stroke="#4ade80" strokeWidth="1.4" />
              <circle cx="108" cy="59.5" r="1.6" fill="#4ade80" />
              <circle cx="146" cy="59.5" r="1.6" fill="#4ade80" />

              {/* Track regions */}
              <line x1="36" y1="63" x2="78" y2="63" stroke="#f87171" strokeWidth="1.5" />
              <line x1="84" y1="63" x2="136" y2="63" stroke="#818cf8" strokeWidth="1.5" />
              <line x1="140" y1="63" x2="162" y2="63" stroke="#f87171" strokeWidth="1.5" />

              {/* Peak needle */}
              <line x1="206" y1="10" x2="206" y2="56" stroke="#3f3f3a" strokeWidth="1.2" />
              <line
                x1="206"
                y1={56 - Math.min(44, Math.max(12, (levels.me + levels.other) * 0.45))}
                x2="206"
                y2="56"
                stroke="#f87171"
                strokeWidth="1.5"
              />
              <circle
                className="oled-peak-dot"
                cx="206"
                cy={56 - Math.min(44, Math.max(18, (levels.me + levels.other) * 0.45))}
                r="2.6"
                fill="#e6802e"
              />
            </svg>
          </div>

          {/* Audio channels */}
          <div className="te-channel-stack" onClick={(e) => e.stopPropagation()}>
            {/* Ego (mic) */}
            <div className={`te-stacked-row ${settings?.egoMuted ? 'muted' : ''}`}>
              <button
                type="button"
                className={`te-lamp-pill ego ${settings?.egoMuted ? 'off' : ''}`}
                onClick={() => handleToggleChannel('me')}
                aria-pressed={!settings?.egoMuted}
                title={
                  settings?.egoMuted
                    ? 'EGO is OFF — click to turn your mic back on'
                    : 'Click to turn EGO (your mic) off'
                }
              >
                EGO
              </button>
              <div className="meter-bar-bg" title="EGO Audio Input Level">
                <div className="meter-bar-fill me" style={{ width: `${levels.me}%` }} />
              </div>
              <button
                type="button"
                className="te-display-readout"
                onClick={() => {
                  setSysMenuOpen(false);
                  setMicMenuOpen((open) => !open);
                }}
                title="Click display to choose EGO Microphone Input"
              >
                <span className="te-display-text">
                  {(
                    devices.find((d) => String(d.id) === String(settings?.micDeviceId))?.name ||
                    'DEFAULT MICROPHONE'
                  ).toUpperCase()}
                </span>
                <span className="te-display-caret">{micMenuOpen ? '▴' : '▾'}</span>
              </button>
              {micMenuOpen && (
                <div className="te-dropdown-menu">
                  <div className="te-dropdown-header">EGO // INPUT DEVICE</div>
                  <button
                    type="button"
                    className={`te-dropdown-item ${(settings?.micDeviceId || 'default') === 'default' ? 'active' : ''}`}
                    onClick={() => handleSelectMicDevice('default')}
                  >
                    <span>● DEFAULT SYSTEM MIC</span>
                  </button>
                  {devices.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`te-dropdown-item ${String(settings?.micDeviceId) === String(d.id) ? 'active' : ''}`}
                      onClick={() => handleSelectMicDevice(d.id)}
                    >
                      <span>● {d.name.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* System audio */}
            <div className={`te-stacked-row ${settings?.sysMuted ? 'muted' : ''}`}>
              <button
                type="button"
                className={`te-lamp-pill sys ${settings?.sysMuted ? 'off' : ''}`}
                onClick={() => handleToggleChannel('other')}
                aria-pressed={!settings?.sysMuted}
                title={
                  settings?.sysMuted
                    ? 'System audio is OFF — click to turn it back on'
                    : 'Click to turn system audio off'
                }
              >
                <span className="lamp-full">SYSTEM AUDIO</span>
                <span className="lamp-short">SYS</span>
              </button>
              <div className="meter-bar-bg">
                <div className="meter-bar-fill other" style={{ width: `${levels.other}%` }} />
              </div>
              <button
                type="button"
                className="te-display-readout"
                onClick={handleToggleSysMenu}
                title="Click to listen to one app only (Zoom, Teams, Chrome…) or all system audio"
              >
                <span className="te-display-text">
                  {(settings?.sysAudioApp?.name || 'ALL SYSTEM AUDIO').toUpperCase()}
                </span>
                <span className="te-display-caret">{sysMenuOpen ? '▴' : '▾'}</span>
              </button>
              {sysMenuOpen && (
                <div className="te-dropdown-menu te-dropdown-scroll">
                  <div className="te-dropdown-header">SYS // LISTEN TO</div>
                  <button
                    type="button"
                    className={`te-dropdown-item ${!settings?.sysAudioApp ? 'active' : ''}`}
                    onClick={() => handleSelectSysApp(null)}
                  >
                    <span>● ALL SYSTEM AUDIO</span>
                  </button>
                  {settings?.sysAudioApp &&
                    !sysApps.apps.some((a) => a.bundleId === settings.sysAudioApp.bundleId) &&
                    !sysApps.loading && (
                      <button
                        type="button"
                        className="te-dropdown-item active"
                        onClick={() => setSysMenuOpen(false)}
                      >
                        <span>● {settings.sysAudioApp.name.toUpperCase()} (NOT RUNNING)</span>
                      </button>
                    )}
                  {sysApps.loading && <div className="te-dropdown-note">SCANNING APPS…</div>}
                  {sysApps.error && <div className="te-dropdown-note">{sysApps.error}</div>}
                  {sysApps.apps.map((a) => (
                    <button
                      key={a.bundleId}
                      type="button"
                      className={`te-dropdown-item ${settings?.sysAudioApp?.bundleId === a.bundleId ? 'active' : ''}`}
                      onClick={() => handleSelectSysApp(a)}
                    >
                      <span>● {a.name.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Session / engine readout */}
          <button
            type="button"
            className="oled-info-panel"
            onClick={() => setActiveModal('settings')}
            title="Current session and engines — click to change API & LLM settings"
          >
            <div className="oled-info-row">
              <span className="oled-info-key">SESSION</span>
              <span className="oled-info-val">{(session.title || 'AUTO-SAVED').toUpperCase()}</span>
              <span className={`oled-info-state ${isRecording ? 'rec' : ''}`}>
                {isRecording ? `● REC ${formatTapeCounter(recSeconds)}` : 'STANDBY'}
              </span>
            </div>
            <div className="oled-info-row">
              <span className="oled-info-key">FAST</span>
              <span className="oled-info-val">{formatEngineLabel(resolvedEngines.fast)}</span>
            </div>
            <div className="oled-info-row">
              <span className="oled-info-key">DEEP</span>
              <span className="oled-info-val">{formatEngineLabel(resolvedEngines.deep)}</span>
            </div>
            <div className="oled-info-row">
              <span className="oled-info-key">STT</span>
              <span className="oled-info-val">{STT_LABELS[settings?.sttProvider] || STT_LABELS.hybrid}</span>
            </div>
          </button>
        </div>

        {/* Wordmark */}
        <div className="brand-group" title="PortalScript">
          <PortalScriptLogo />
        </div>
      </header>

      {statusMessage && (
        <div className="status-banner">
          <span>⚠️ {statusMessage}</span>
          <button className="mini-btn" onClick={() => setStatusMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace */}
      <div className="workspace-split">
        {/* Transcript pane */}
        <section className="pane pane-left">
          <div className="pane-header">
            <div className="pane-title">
              <span>CH-01 // LIVE TRANSCRIPT</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="mini-btn"
                onClick={openNewSessionModal}
                title="Save current session and create a new session folder"
              >
                ＋ New
              </button>
              <button
                className="mini-btn"
                onClick={() => setActiveModal('sessions')}
                title="Load a previous session or browse from disk"
              >
                Load
              </button>
              <button
                className="mini-btn"
                onClick={() => window.liveTranscriptAPI.exportSession()}
                title="Save current session and export timestamped transcript (.md / .txt)"
              >
                Export
              </button>
            </div>
          </div>

          <div className="transcript-list" onScroll={handleTextScroll} onWheel={handleTextWheel}>
            {!session.segments || session.segments.length === 0 ? (
              <div className="transcript-empty">
                <h3>Live Transcription</h3>
                <p>
                  Click <strong>Start Live Capture</strong> to choose a save folder and begin transcribing.
                  Everything stays here permanently.
                </p>
                <div
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <button
                    className="icon-btn"
                    onClick={() =>
                      window.liveTranscriptAPI.simulateUtterance({
                        speaker: 'other',
                        text: 'Do you have experience in Rust, and how does the borrow checker handle memory safety compared to garbage collection?'
                      })
                    }
                  >
                    🧪 Sample: Rust & Borrow Checker
                  </button>
                </div>
              </div>
            ) : (
              session.segments.map((seg) => {
                const segConcepts = seg.concepts || [];
                return (
                  <div
                    key={seg.id}
                    className={`segment-card ${seg.speaker} ${selectedInBox?.segmentId === seg.id ? 'has-selection' : ''}`}
                    onClick={(e) => handleBoxClick(e, seg)}
                    title="Click: answer for the interviewer · Select text: explain a term"
                    onContextMenu={(e) => handleContextMenu(e, seg.text, seg.text)}
                  >
                    <div className="segment-meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className={`mini-btn speaker-tag ${seg.speaker}`}
                          onClick={(e) => handleToggleSpeaker(e, seg.id)}
                          title="Click to flip speaker (Ego ↔ System Audio)"
                        >
                          {seg.speaker === 'me' ? 'EGO ⇄' : 'SYS AUDIO ⇄'}
                        </button>
                        <span className="segment-time">{new Date(seg.timestamp).toLocaleTimeString()}</span>
                        {!seg.isFinal && (
                          <span style={{ color: '#e6802e', fontSize: 'var(--fs-sm)', fontWeight: 800 }}>
                            REC
                            <span className="live-dot" />
                          </span>
                        )}
                      </div>

                      <div className="segment-actions">
                        <button
                          type="button"
                          className={`mini-btn ${selectedInBox?.segmentId === seg.id ? 'is-armed' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleOpenBoxInContextWindow(seg)}
                          title={
                            selectedInBox?.segmentId === seg.id
                              ? 'Collapse current window (keeping it saved) and analyze why you selected this phrase'
                              : 'Analyze this entire box in full conversation context (meaning, how to answer questions, or how to solve challenges)'
                          }
                        >
                          {selectedInBox?.segmentId === seg.id
                            ? `⚡ Open "${selectedInBox.text.slice(0, 22)}${selectedInBox.text.length > 22 ? '…' : ''}"`
                            : '⚡ Context Window'}
                        </button>
                        <button
                          className="mini-btn"
                          onClick={() =>
                            window.liveTranscriptAPI.openInBrowser({
                              query: seg.text,
                              context: seg.text,
                              target: 'gemini'
                            })
                          }
                          title="Open this line in Gemini in your browser"
                        >
                          🌐 Gemini
                        </button>
                      </div>
                    </div>

                    <div
                      className="segment-text"
                      onDoubleClick={(e) => handleBoxSelectionChange(e, seg)}
                      onMouseUp={(e) => handleBoxSelectionChange(e, seg)}
                    >
                      {seg.committedText !== undefined && seg.liveText ? (
                        <>
                          <span>{seg.committedText ? `${seg.committedText} ` : ''}</span>
                          <span style={{ opacity: 0.9 }}>{seg.liveText}</span>
                        </>
                      ) : (
                        <span>{seg.text}</span>
                      )}
                    </div>

                    {segConcepts.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {segConcepts.map((concept) => (
                          <button
                            key={concept}
                            type="button"
                            className="mini-btn"
                            onClick={() => openConceptWindow(concept, seg.text)}
                          >
                            + {concept}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Dev-only manual input */}
          {showDevTools && (
            <form className="transcript-footer" onSubmit={handleSimulateSubmit}>
              <div className="sim-row">
                <select
                  className="mic-select"
                  value={simSpeaker}
                  onChange={(e) => setSimSpeaker(e.target.value)}
                >
                  <option value="other">System Audio</option>
                  <option value="me">Ego</option>
                </select>
                <input
                  className="sim-input"
                  placeholder="Type to add a transcript line..."
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                />
                <button type="submit" className="icon-btn">
                  Add
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Context pane */}
        <section
          className="pane pane-right"
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDraggingMd) setIsDraggingMd(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setIsDraggingMd(false);
          }}
          onDrop={handleDropContextMd}
          style={
            isDraggingMd
              ? {
                  outline: '2px dashed #e6802e',
                  outlineOffset: '-4px',
                  background: 'rgba(230, 128, 46, 0.08)'
                }
              : undefined
          }
        >
          <div className="pane-header">
            <div className="pane-title">
              <span>CH-02 // CONTEXT WINDOWS ({session.copilotCards?.length || 0})</span>
              <span
                style={{ fontSize: 'var(--fs-sm)', color: '#e6802e', fontWeight: 700, marginLeft: '6px' }}
              >
                • SYNCED [{session.segments?.length || 0} TURNS]
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {session.copilotCards?.length > 0 && (
                <button
                  className="mini-btn"
                  onClick={(e) => handleRemoveCard(e, null)}
                  title="Clear all context windows"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div className={`ctx-tray ${isDraggingMd ? 'is-drop' : ''}`}>
            {(session.contextDocs || []).map((doc) => (
              <div
                key={doc.id}
                className="ctx-item"
                title={`${doc.name}\n${(doc.content || '').length.toLocaleString()} characters of context`}
              >
                <ContextFileIcon doc={doc} />
                <span className="ctx-name">{doc.name.replace(/\.[^.]+$/, '')}</span>
                <button
                  type="button"
                  className="ctx-remove"
                  onClick={() => handleRemoveContextDoc(doc.id)}
                  title={`Remove ${doc.name}`}
                  aria-label={`Remove ${doc.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ctx-item ctx-add"
              onClick={handlePickContextDoc}
              title="Add context files — PDF, Word, slides, sheets, images, text, code… (or drop them anywhere on this panel)"
            >
              <span className="ctx-add-icon" aria-hidden="true">
                ＋
              </span>
              <span className="ctx-name">ADD</span>
            </button>
            {(isDraggingMd || !(session.contextDocs || []).length) && (
              <span className="ctx-hint">
                {isDraggingMd
                  ? 'DROP TO ADD CONTEXT'
                  : 'DROP ANY FILE — PDF · DOCX · PPTX · XLSX · IMAGES · TEXT · CODE'}
              </span>
            )}
          </div>

          <form className="copilot-search-bar" onSubmit={(e) => handleManualLookup(e, false)}>
            <input
              ref={manualQueryInputRef}
              className="sim-input"
              placeholder="Type a concept or question to open a window…  (⌘K)"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
            />
            <button type="submit" className="icon-btn">
              + Open Window
            </button>
          </form>

          <div className="copilot-list" onScroll={handleTextScroll} onWheel={handleTextWheel}>
            {!session.copilotCards || session.copilotCards.length === 0 ? (
              <div className="transcript-empty">
                <h3>Click Any Concept to Open a Window</h3>
                <p>
                  Click any <strong>+ concept</strong> chip on the left (or highlight / double-click any word
                  in the transcript) to open its response window here.
                </p>
              </div>
            ) : (
              session.copilotCards.map((card) => {
                const isCollapsed = Boolean(collapsedCards[card.id]);
                const relatedConcepts = (card.concepts || []).filter(
                  (c) => c.toLowerCase() !== card.query.toLowerCase()
                );
                return (
                  <div
                    key={card.id}
                    data-card-id={card.id}
                    className={`copilot-card ${card.kind === 'answer' ? 'is-answer' : ''} ${isCollapsed ? 'collapsed' : 'expanded'}`}
                    onContextMenu={(e) =>
                      handleContextMenu(
                        e,
                        card.query,
                        [card.fastResponse, card.deepResponse].filter(Boolean).join('\n\n') ||
                          card.surroundingContext,
                        card.id
                      )
                    }
                  >
                    <div
                      className="copilot-card-header"
                      onClick={() => toggleCardCollapse(card.id)}
                      title={isCollapsed ? card.query : undefined}
                    >
                      <div className="copilot-card-title-row">
                        <span className="copilot-chevron">{isCollapsed ? '▸' : '▾'}</span>
                        <div className="copilot-query-title">
                          {card.kind === 'answer' && <span className="answer-badge">ANSWER</span>}
                          {card.query}
                        </div>
                        <button
                          type="button"
                          className="mini-btn copilot-close"
                          onClick={(e) => handleRemoveCard(e, card.id)}
                          title="Close this window"
                        >
                          ✕
                        </button>
                      </div>

                      {!isCollapsed && (
                        <div className="copilot-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="mini-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            style={
                              selectedInCard?.cardId === card.id
                                ? {
                                    background: '#e6802e',
                                    color: '#141413',
                                    borderColor: '#e6802e',
                                    fontWeight: 700
                                  }
                                : undefined
                            }
                            onClick={() => handleExplainInCardButton(card)}
                            title="Select any text in this window and click Explain (or click with nothing selected to expand the whole topic)"
                          >
                            {selectedInCard?.cardId === card.id
                              ? `💬 Explain ("${selectedInCard.text.slice(0, 14)}${selectedInCard.text.length > 14 ? '…' : ''}")`
                              : '💬 Explain'}
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            style={
                              selectedInCard?.cardId === card.id
                                ? {
                                    background: '#ffb000',
                                    color: '#141413',
                                    borderColor: '#ffb000',
                                    fontWeight: 700
                                  }
                                : undefined
                            }
                            onClick={() => handleOpenCardSelectionInNewWindow(card)}
                            title="Select any text in this window and click to open it in a new Context Window"
                          >
                            {selectedInCard?.cardId === card.id
                              ? `⚡ Open in New Context Window ("${selectedInCard.text.slice(0, 14)}${selectedInCard.text.length > 14 ? '…' : ''}")`
                              : '⚡ Open in New Context Window'}
                          </button>
                          <button
                            className="mini-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const selText = getSelectedTextInCard(card.id);
                              window.liveTranscriptAPI.openInBrowser({
                                query: selText || card.query,
                                context: card.surroundingContext,
                                priorAnswer: [card.fastResponse, card.deepResponse]
                                  .filter(Boolean)
                                  .join('\n\n'),
                                target: 'gemini'
                              });
                            }}
                            title="Open in Gemini Web with full interview context & prior answer carried over"
                          >
                            🌐 Gemini Web
                          </button>
                        </div>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
                        <div className="copilot-section fast-section">
                          <div
                            className="md-content"
                            onDoubleClick={(e) => handleCardSelectionChange(e, card, card.fastResponse)}
                            onMouseUp={(e) => handleCardSelectionChange(e, card, card.fastResponse)}
                            dangerouslySetInnerHTML={renderMarkdown(card.fastResponse || '_Loading..._')}
                          />
                        </div>

                        {card.deepStatus !== 'idle' && (
                          <div className="copilot-section deep-section">
                            <div
                              className="md-content"
                              onDoubleClick={(e) => handleCardSelectionChange(e, card, card.deepResponse)}
                              onMouseUp={(e) => handleCardSelectionChange(e, card, card.deepResponse)}
                              dangerouslySetInnerHTML={renderMarkdown(
                                card.deepResponse || '_Loading deeper detail..._'
                              )}
                            />
                          </div>
                        )}

                        {relatedConcepts.length > 0 && (
                          <div
                            style={{
                              padding: '8px 14px',
                              borderTop: '1px dashed #b5afa2',
                              display: 'flex',
                              gap: '6px',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              background: '#eae5da'
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--fs-sm)',
                                color: '#4a4843',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700
                              }}
                            >
                              CONCEPTS //
                            </span>
                            {relatedConcepts.map((concept) => (
                              <button
                                key={concept}
                                type="button"
                                className="mini-btn"
                                onClick={() => openConceptWindow(concept, card.fastResponse)}
                              >
                                + {concept}
                              </button>
                            ))}
                          </div>
                        )}

                        <form
                          onSubmit={(e) => handleCardFollowUpSubmit(e, card.id)}
                          style={{
                            padding: '8px 12px',
                            borderTop: '1.5px solid #1c1c1a',
                            background: '#e2ddd1',
                            display: 'flex',
                            gap: '6px'
                          }}
                        >
                          <input
                            className="sim-input"
                            style={{ fontSize: 'var(--fs-sm)', padding: '5px 9px' }}
                            placeholder={`Ask further clarification on "${card.query.slice(0, 32)}${card.query.length > 32 ? '…' : ''}"...`}
                            value={cardFollowUps[card.id] || ''}
                            onChange={(e) =>
                              setCardFollowUps((prev) => ({ ...prev, [card.id]: e.target.value }))
                            }
                          />
                          <button
                            type="submit"
                            className="mini-btn"
                            style={{ background: '#e6802e', color: '#141413' }}
                          >
                            ASK
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Right-click menu */}
      {contextMenu && (
        <div
          className="custom-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            "{contextMenu.query.slice(0, 48)}
            {contextMenu.query.length > 48 ? '…' : ''}"
          </div>
          {contextMenu.cardId && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  const targetCard = (session.copilotCards || []).find((c) => c.id === contextMenu.cardId);
                  if (targetCard) {
                    setCollapsedCards((prev) => ({ ...prev, [targetCard.id]: false }));
                    window.liveTranscriptAPI.copilotFindMore(
                      targetCard.id,
                      `Explain "${contextMenu.query}" further in the context of this conversation and how I should use or talk about it.`
                    );
                  }
                  setSelectedInCard(null);
                  setContextMenu(null);
                }}
              >
                💬 Explain Here
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  setCollapsedCards((prev) => ({ ...prev, [contextMenu.cardId]: false }));
                  setCardFollowUps((prev) => ({
                    ...prev,
                    [contextMenu.cardId]: `Regarding "${contextMenu.query}": `
                  }));
                  setContextMenu(null);
                }}
              >
                ✏️ Ask Custom Question About Selection Below
              </button>
            </>
          )}
          <button
            className="context-menu-item"
            onClick={() => {
              openConceptWindow(contextMenu.query, contextMenu.context, 'selection');
              setSelectedInCard(null);
              setContextMenu(null);
            }}
          >
            ⚡ Search in New Context Window
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              window.liveTranscriptAPI.openInBrowser({
                query: contextMenu.query,
                context: contextMenu.context,
                target: 'gemini'
              });
              setContextMenu(null);
            }}
          >
            🌐 Open in Browser → Google Gemini
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.query);
              setContextMenu(null);
            }}
          >
            📋 Copy Selection
          </button>
        </div>
      )}

      {/* Profile modal */}
      {activeModal === 'profile' && settings && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📄 Candidate Technical Profile (.md)</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="icon-btn" onClick={handlePickProfileFile}>
                  📂 Load .md File from Disk
                </button>
                <button className="mini-btn" onClick={() => setActiveModal(null)}>
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={handleSaveSettingsModal}>
              <div className="modal-body">
                <p style={{ fontSize: 'var(--fs-sm)', color: '#4a4843' }}>
                  This Markdown file tells both the Fast and Deep LLMs your background, technical level, and
                  how you want answers framed. Current file: <code>{settings.profilePath}</code>
                </p>
                <div className="form-group full">
                  <textarea
                    value={settings.profileMarkdown || ''}
                    onChange={(e) => setSettings({ ...settings, profileMarkdown: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="icon-btn" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="find-more-btn">
                  💾 Save .md Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {activeModal === 'settings' && settings && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ Universal API & LLM Engine Settings</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={isRefreshingModels}
                  onClick={async () => {
                    setIsRefreshingModels(true);
                    try {
                      const res = await window.liveTranscriptAPI.refreshModelCatalog(settings);
                      if (res?.modelCatalog) {
                        setModelCatalog((prev) => ({ ...prev, ...res.modelCatalog }));
                      }
                      if (res?.ollamaModels) setOllamaModels(res.ollamaModels);
                    } finally {
                      setIsRefreshingModels(false);
                    }
                  }}
                >
                  {isRefreshingModels ? '⏳ Syncing Live Models...' : '🔄 Sync Live Models'}
                </button>
                <button className="mini-btn" onClick={() => setActiveModal(null)}>
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={handleSaveSettingsModal}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group full">
                    <label>
                      🔌 Primary LLM Provider Preset (Live Synced Catalog — or Mix-and-Match Below)
                    </label>
                    <select
                      value={settings.llmProvider || 'gemini'}
                      onChange={(e) => {
                        const prov = e.target.value;
                        const firstOllama = ollamaModels[0] || 'qwen2.5-coder:14b';
                        const presetMap = {
                          gemini: {
                            fastModel: 'gemini-3.8-flash',
                            deepModel: 'gemini-4-argon',
                            browserTarget: 'gemini'
                          },
                          ollama: { fastModel: `ollama:${firstOllama}`, deepModel: `ollama:${firstOllama}` },
                          openai: {
                            fastModel: 'openai:gpt-6-luna',
                            deepModel: 'openai:gpt-6.1-sol',
                            browserTarget: 'chatgpt'
                          },
                          anthropic: {
                            fastModel: 'anthropic:claude-haiku-5.5',
                            deepModel: 'anthropic:claude-sonnet-5.5',
                            browserTarget: 'claude'
                          },
                          groq: {
                            fastModel: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
                            deepModel: 'groq:meta-llama/llama-4-maverick-17b-128e-instruct'
                          },
                          openrouter: {
                            fastModel: 'openrouter:google/gemini-3.8-flash',
                            deepModel: 'openrouter:anthropic/claude-sonnet-5.5'
                          },
                          custom: {
                            fastModel: `custom:${settings.customModel || 'deepseek-v4.1-flash'}`,
                            deepModel: `custom:${settings.customModel || 'deepseek-v4-pro'}`
                          }
                        };
                        setSettings({
                          ...settings,
                          llmProvider: prov,
                          ...(presetMap[prov] || {})
                        });
                        setLlmTestResult(null);
                      }}
                    >
                      <option value="gemini">
                        Google AI Studio (Gemini 3.8 Flash & Gemini 4 Argon —{' '}
                        {modelCatalog.gemini?.length || 6} live models)
                      </option>
                      <option value="ollama">
                        Local Ollama (100% Offline on Your Mac — {ollamaModels.length} models installed)
                      </option>
                      <option value="openai">OpenAI (GPT-6.1 Sol, GPT-6 Luna, GPT-5.6, GPT-5 mini)</option>
                      <option value="anthropic">
                        Anthropic (Claude Sonnet 5.5, Opus 5.5, Haiku 5.5, Fable 5.1)
                      </option>
                      <option value="groq">
                        Groq LPU (Llama 4 Maverick, Llama 4 Scout, Qwen QwQ 32B & Whisper STT)
                      </option>
                      <option value="openrouter">
                        OpenRouter (Claude 5.5, GPT-6.1, Gemini 4, DeepSeek V4.1, Grok 4.7)
                      </option>
                      <option value="custom">
                        Custom OpenAI-Compatible Endpoint (DeepSeek V4.1, xAI Grok 4.7, LM Studio, vLLM)
                      </option>
                    </select>
                  </div>

                  {/* Provider keys */}
                  {(settings.llmProvider === 'gemini' ||
                    !settings.llmProvider ||
                    (settings.fastModel || '').startsWith('gemini') ||
                    (settings.deepModel || '').startsWith('gemini') ||
                    settings.sttProvider === 'hybrid' ||
                    settings.sttProvider === 'gemini') && (
                    <div className="form-group full">
                      <label>Google AI Studio API Key (Gemini LLM + Gemini Audio STT)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={(e) => e.target.select()}
                        placeholder="AIzaSy..."
                        value={settings.geminiApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'openai' ||
                    (settings.fastModel || '').startsWith('openai:') ||
                    (settings.deepModel || '').startsWith('openai:') ||
                    settings.sttProvider === 'openai') && (
                    <div className="form-group full">
                      <label>OpenAI API Key (GPT-4o / Whisper STT)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={(e) => e.target.select()}
                        placeholder="sk-..."
                        value={settings.openaiApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'anthropic' ||
                    (settings.fastModel || '').startsWith('anthropic:') ||
                    (settings.deepModel || '').startsWith('anthropic:')) && (
                    <div className="form-group full">
                      <label>Anthropic API Key (Claude 3.7 Sonnet / 3.5 Haiku)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={(e) => e.target.select()}
                        placeholder="sk-ant-..."
                        value={settings.anthropicApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'groq' ||
                    (settings.fastModel || '').startsWith('groq:') ||
                    (settings.deepModel || '').startsWith('groq:') ||
                    settings.sttProvider === 'groq') && (
                    <div className="form-group full">
                      <label>Groq API Key (Llama 3.3 70B + Whisper Large v3 Turbo STT)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={(e) => e.target.select()}
                        placeholder="gsk_..."
                        value={settings.groqApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'openrouter' ||
                    (settings.fastModel || '').startsWith('openrouter:') ||
                    (settings.deepModel || '').startsWith('openrouter:')) && (
                    <div className="form-group full">
                      <label>OpenRouter API Key (Any Model on OpenRouter.ai)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={(e) => e.target.select()}
                        placeholder="sk-or-v1-..."
                        value={settings.openrouterApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'ollama' ||
                    (settings.fastModel || '').startsWith('ollama:') ||
                    (settings.deepModel || '').startsWith('ollama:')) && (
                    <div className="form-group full">
                      <label>Local Ollama Server URL</label>
                      <input
                        type="text"
                        placeholder="http://127.0.0.1:11434"
                        value={settings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
                        onChange={(e) => setSettings({ ...settings, ollamaBaseUrl: e.target.value })}
                      />
                    </div>
                  )}

                  {(settings.llmProvider === 'custom' ||
                    (settings.fastModel || '').startsWith('custom:') ||
                    (settings.deepModel || '').startsWith('custom:')) && (
                    <>
                      <div className="form-group">
                        <label>Custom OpenAI-Compatible Base URL</label>
                        <input
                          type="text"
                          placeholder="https://api.deepseek.com/v1"
                          value={settings.customBaseUrl || ''}
                          onChange={(e) => setSettings({ ...settings, customBaseUrl: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Custom Model ID</label>
                        <input
                          type="text"
                          placeholder="deepseek-chat"
                          value={settings.customModel || ''}
                          onChange={(e) => {
                            const m = e.target.value;
                            setSettings({
                              ...settings,
                              customModel: m,
                              fastModel: `custom:${m}`,
                              deepModel: `custom:${m}`
                            });
                          }}
                        />
                      </div>
                      <div className="form-group full">
                        <label>Custom Endpoint API Key (Optional for Local Servers)</label>
                        <input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          onFocus={(e) => e.target.select()}
                          placeholder="sk-..."
                          value={settings.customApiKey || ''}
                          onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group full">
                    <label>🎙️ Speech Transcription Mode</label>
                    <select
                      value={settings.sttProvider || 'hybrid'}
                      onChange={(e) => setSettings({ ...settings, sttProvider: e.target.value })}
                    >
                      <option value="hybrid">
                        Hybrid: macOS Live Speech + Google Gemini Audio Fallback (Recommended)
                      </option>
                      <option value="gemini">Google Gemini 3.8 Flash Audio Only</option>
                      <option value="groq">Groq Whisper Large v3 Turbo Audio Only (Requires Groq Key)</option>
                      <option value="openai">OpenAI Whisper-1 Audio Only (Requires OpenAI Key)</option>
                      <option value="apple">macOS On-Device Live Speech Only (100% Local)</option>
                    </select>
                  </div>

                  <div className="form-group full">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={showDevTools}
                        onChange={(e) => setShowDevTools(e.target.checked)}
                      />
                      Show developer tools (manual transcript input bar) — ⌘⇧D
                    </label>
                  </div>

                  <div className="form-group">
                    <label>⚡ Fast LLM Engine (Instant Concept Window)</label>
                    <select
                      value={settings.fastModel || 'gemini-3.8-flash'}
                      onChange={(e) => setSettings({ ...settings, fastModel: e.target.value })}
                    >
                      <optgroup label="Google AI Studio (Gemini — Live)">
                        {(modelCatalog.gemini || []).map((m) => (
                          <option key={`fast-gem-${m}`} value={m}>
                            {m === 'gemini-3.8-flash' ? `${m} (Recommended Fast)` : m}
                          </option>
                        ))}
                      </optgroup>
                      {ollamaModels.length > 0 && (
                        <optgroup label="Local Ollama (On Your Mac)">
                          {ollamaModels.map((m) => (
                            <option key={`fast-ollama-${m}`} value={`ollama:${m}`}>
                              Local Ollama: {m}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="OpenAI (Latest)">
                        {(modelCatalog.openai || []).map((m) => (
                          <option key={`fast-oa-${m}`} value={m}>
                            {m.replace('openai:', 'OpenAI: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Anthropic Claude (Latest)">
                        {(modelCatalog.anthropic || []).map((m) => (
                          <option key={`fast-ant-${m}`} value={m}>
                            {m.replace('anthropic:', 'Anthropic: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Groq (Ultra-Fast LPU)">
                        {(modelCatalog.groq || []).map((m) => (
                          <option key={`fast-groq-${m}`} value={m}>
                            {m.replace('groq:', 'Groq: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="OpenRouter (Live Multi-Lab Catalog)">
                        {(modelCatalog.openrouter || []).map((m) => (
                          <option key={`fast-or-${m}`} value={m}>
                            {m.replace('openrouter:', 'OpenRouter: ')}
                          </option>
                        ))}
                      </optgroup>
                      {settings.customModel && (
                        <optgroup label="Custom Endpoint">
                          <option value={`custom:${settings.customModel}`}>
                            Custom: {settings.customModel}
                          </option>
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>🧠 Deep LLM Engine (Context Window & "Expand More")</label>
                    <select
                      value={settings.deepModel || 'gemini-4-argon'}
                      onChange={(e) => setSettings({ ...settings, deepModel: e.target.value })}
                    >
                      <optgroup label="Google AI Studio (Gemini — Live)">
                        {(modelCatalog.gemini || []).map((m) => (
                          <option key={`deep-gem-${m}`} value={m}>
                            {m === 'gemini-4-argon' ? `${m} (Recommended Deep)` : m}
                          </option>
                        ))}
                      </optgroup>
                      {ollamaModels.length > 0 && (
                        <optgroup label="Local Ollama (On Your Mac)">
                          {ollamaModels.map((m) => (
                            <option key={`deep-ollama-${m}`} value={`ollama:${m}`}>
                              Local Ollama: {m}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="OpenAI (Latest)">
                        {(modelCatalog.openai || []).map((m) => (
                          <option key={`deep-oa-${m}`} value={m}>
                            {m.replace('openai:', 'OpenAI: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Anthropic Claude (Latest)">
                        {(modelCatalog.anthropic || []).map((m) => (
                          <option key={`deep-ant-${m}`} value={m}>
                            {m.replace('anthropic:', 'Anthropic: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Groq (Ultra-Fast LPU)">
                        {(modelCatalog.groq || []).map((m) => (
                          <option key={`deep-groq-${m}`} value={m}>
                            {m.replace('groq:', 'Groq: ')}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="OpenRouter (Live Multi-Lab Catalog)">
                        {(modelCatalog.openrouter || []).map((m) => (
                          <option key={`deep-or-${m}`} value={m}>
                            {m.replace('openrouter:', 'OpenRouter: ')}
                          </option>
                        ))}
                      </optgroup>
                      {settings.customModel && (
                        <optgroup label="Custom Endpoint">
                          <option value={`custom:${settings.customModel}`}>
                            Custom: {settings.customModel}
                          </option>
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {/* Connection test results */}
                {llmTestResult && (
                  <div
                    style={{
                      background: '#161615',
                      border: '1.5px solid #1c1c1a',
                      borderRadius: '4px',
                      padding: '10px 12px',
                      fontSize: 'var(--fs-sm)',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    {['fast', 'deep'].map((tier) => {
                      const r = llmTestResult[tier];
                      if (!r) return null;
                      return (
                        <div key={tier} style={{ color: r.ok ? '#00e676' : '#e6802e' }}>
                          <strong>{tier === 'fast' ? '⚡ FAST:' : '🧠 DEEP:'}</strong>{' '}
                          {r.ok
                            ? `✅ ${r.providerLabel} (${r.latencyMs}ms) — "${r.preview}..."`
                            : `❌ ERROR (${r.latencyMs}ms): ${r.error}`}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="icon-btn"
                  disabled={isTestingLlm}
                  onClick={async () => {
                    setIsTestingLlm(true);
                    setLlmTestResult(null);
                    try {
                      const res = await window.liveTranscriptAPI.testLlmEngines(settings);
                      setLlmTestResult(res);
                    } catch (err) {
                      setLlmTestResult({
                        fast: { ok: false, latencyMs: 0, error: err.message }
                      });
                    } finally {
                      setIsTestingLlm(false);
                    }
                  }}
                >
                  {isTestingLlm ? '⏳ Testing APIs...' : '🧪 Test Selected Engines Now'}
                </button>
                <button type="button" className="icon-btn" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="find-more-btn">
                  💾 Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sessions modal */}
      {activeModal === 'new-session' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-box" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>＋ Start a New Session</h2>
              <button className="mini-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateNewSession}>
              <div className="modal-body">
                <div
                  style={{
                    background: '#f4f1e8',
                    border: '1.5px solid #1c1c1a',
                    borderLeft: '5px solid #e6802e',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: 'var(--fs-sm)',
                    color: '#141413'
                  }}
                >
                  ✅{' '}
                  <strong>
                    Your current session ({session.title || 'Active Session'}) is already saved.
                  </strong>
                  <div style={{ fontSize: 'var(--fs-sm)', color: '#4a4843', marginTop: '4px' }}>
                    Saved in: <code>{session.sessionDir}</code>
                  </div>
                </div>

                <div className="form-group full" style={{ marginTop: '12px' }}>
                  <label>1. Name Your New Session (creates a new folder with this name)</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Team_Sync_Monday"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                  />
                </div>

                <div className="form-group full" style={{ marginTop: '8px' }}>
                  <label>2. Where to Create This New Session Folder</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={newSessionParentDir || '~/Library/Application Support/PortalScript/sessions'}
                      style={{ flex: 1, opacity: 0.85 }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={async () => {
                        const picked =
                          await window.liveTranscriptAPI.pickSessionParentDir(newSessionParentDir);
                        if (picked) setNewSessionParentDir(picked);
                      }}
                    >
                      📂 Change Location...
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="icon-btn" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="find-more-btn">
                  ✅ Create New Session Folder & Start
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeModal === 'sessions' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗂️ Sessions (Auto-Saved)</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <button className="find-more-btn" onClick={openNewSessionModal}>
                  ＋ New Session
                </button>
                <button
                  className="icon-btn"
                  onClick={async () => {
                    const res = await window.liveTranscriptAPI.loadSession('__browse__');
                    if (res?.error) setStatusMessage(`Couldn't load session: ${res.error}`);
                    if (!res?.canceled && !res?.error && res?.currentSession) {
                      setSession(res.currentSession);
                      const nextCollapsed = {};
                      (res.currentSession.copilotCards || []).forEach((c, idx) => {
                        nextCollapsed[c.id] = idx > 0;
                      });
                      setCollapsedCards(nextCollapsed);
                      setPastSessions(res.pastSessions || []);
                      setActiveModal(null);
                    }
                  }}
                >
                  📂 Load Folder...
                </button>
                <button className="icon-btn" onClick={() => window.liveTranscriptAPI.openSessionFolder()}>
                  📂 Open in Finder
                </button>
                <button className="mini-btn" onClick={() => setActiveModal(null)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--fs-sm)', color: '#4a4843', lineHeight: 1.45 }}>
                Each session folder stores timestamped <code>transcript.md</code>, <code>transcript.txt</code>
                , <code>mic_me.wav</code>, <code>system_other.wav</code>, and <code>session.json</code>. Your
                active session is always saved before switching.
              </p>
              {pastSessions.map((s) => {
                const shortDir = (s.sessionDir || '').replace(/^\/Users\/[^/]+/, '~');
                return (
                  <div
                    key={s.sessionDir || s.id}
                    className="segment-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      borderLeftColor: s.id === session.id ? '#e6802e' : '#1c1c1a'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: 'var(--fs-md)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title}
                        </span>
                        {s.id === session.id && <span className="badge badge-deep">ACTIVE</span>}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--fs-sm)',
                          color: '#4a4843',
                          marginTop: '4px',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {s.segmentCount} turns • {s.cardCount} Context Windows •{' '}
                        {new Date(s.updatedAt || s.createdAt).toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--fs-sm)',
                          color: '#6e6a63',
                          marginTop: '3px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={s.sessionDir}
                      >
                        <code>{shortDir}</code>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                      <button
                        className="icon-btn"
                        onClick={() => window.liveTranscriptAPI.exportSession(s.id)}
                        title="Export timestamped transcript (.md or .txt)"
                      >
                        💾 Export
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => window.liveTranscriptAPI.openSessionFolder(s.id)}
                        title="Open session folder in Finder"
                      >
                        📂 Finder
                      </button>
                      {s.id !== session.id && (
                        <button
                          className="find-more-btn"
                          onClick={async () => {
                            const res = await window.liveTranscriptAPI.loadSession(s.sessionDir || s.id);
                            if (res?.error) setStatusMessage(`Couldn't load session: ${res.error}`);
                            if (res?.currentSession && !res?.error) {
                              setSession(res.currentSession);
                              const nextCollapsed = {};
                              (res.currentSession.copilotCards || []).forEach((c, idx) => {
                                nextCollapsed[c.id] = idx > 0;
                              });
                              setCollapsedCards(nextCollapsed);
                            }
                            setPastSessions(res?.pastSessions || []);
                            setActiveModal(null);
                          }}
                        >
                          Load Session
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
