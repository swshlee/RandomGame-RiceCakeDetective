const CONFIG = {
  defaultDifficulty: "normal",
  defaultSpeed: "slow",
  difficulties: {
    easy: { label: "Easy", count: 3 },
    normal: { label: "Normal", count: 5 },
    hard: { label: "Hard", count: 7 },
  },
  speeds: {
    slow: { label: "느리게", movePrepMs: 660, shuffleMoveMs: 820, shuffleSettleMs: 180 },
    normal: { label: "보통", movePrepMs: 560, shuffleMoveMs: 680, shuffleSettleMs: 150 },
    fast: { label: "빠르게", movePrepMs: 460, shuffleMoveMs: 540, shuffleSettleMs: 120 },
  },
  backgroundThemes: ["office", "tennis", "coast", "current", "city"],
  shuffleRounds: 3,
  shuffleMovesPerRound: 4,
  characterImages: {
    idle: "assets/sprite-idle.png",
    eat: "assets/sprite-eat.png",
    readyJumpSheet: "assets/sprite-ready-jump-sheet.png",
    jump: "assets/sprite-jump.png",
    slide: "assets/sprite-slide.png",
  },
  sounds: {
    eat: "assets/sound-eat.wav",
    shuffle: "assets/sound-shuffle.wav",
    fanfare: "assets/sound-fanfare.wav",
  },
};

const audio = {
  context: null,
  master: null,
  elements: null,
  shuffleTimer: 0,
  shuffleTick: 0,
};

const dom = {
  difficultyButtons: [...document.querySelectorAll("[data-difficulty]")],
  speedButtons: [...document.querySelectorAll("[data-speed]")],
  startButton: document.getElementById("startButton"),
  revealButton: document.getElementById("revealButton"),
  playAgainButton: document.getElementById("playAgainButton"),
  resetButton: document.getElementById("resetButton"),
  guessPanel: document.getElementById("guessPanel"),
  positionGuess: document.getElementById("positionGuess"),
  message: document.getElementById("message"),
  stageTitle: document.getElementById("stageTitle"),
  stageBadge: document.getElementById("stageBadge"),
  arena: document.getElementById("arena"),
  board: document.getElementById("board"),
  effectLayer: document.getElementById("effectLayer"),
  winnerPanel: document.getElementById("winnerPanel"),
  winnerName: document.getElementById("winnerName"),
};

const state = {
  difficulty: CONFIG.defaultDifficulty,
  speed: CONFIG.defaultSpeed,
  characters: [],
  order: [],
  ricecakeId: -1,
  phase: "idle",
  running: false,
  token: 0,
  shuffleStep: 0,
  motionById: {},
  travelById: {},
  targetPositionInput: "",
  targetPosition: 0,
  backgroundTheme: "current",
};

init();

function init() {
  bindEvents();
  preloadImages();
  setDifficulty(state.difficulty);
  setSpeed(state.speed);
  setupCharacters(readCharacterCount());
  render();
}

function bindEvents() {
  dom.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.phase !== "idle") {
        return;
      }
      setDifficulty(button.dataset.difficulty);
      resetToPreview(readCharacterCount());
    });
  });

  dom.speedButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.phase !== "idle") {
        return;
      }
      setSpeed(button.dataset.speed);
      render();
    });
  });

  dom.startButton.addEventListener("click", startGame);
  dom.revealButton.addEventListener("click", revealResult);
  dom.playAgainButton.addEventListener("click", resetGame);
  dom.resetButton.addEventListener("click", resetGame);
  dom.positionGuess.addEventListener("input", () => {
    state.targetPositionInput = dom.positionGuess.value.replace(/\D/g, "").slice(0, 2);
    dom.positionGuess.value = state.targetPositionInput;
    syncStartControls();
  });
  window.addEventListener("resize", () => {
    if (!state.running) {
      render();
    }
  });
}

function preloadImages() {
  Object.values(CONFIG.characterImages).forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

function readCharacterCount() {
  return characterCountForDifficulty(state.difficulty);
}

function setDifficulty(difficulty) {
  if (!CONFIG.difficulties[difficulty]) {
    return;
  }

  state.difficulty = difficulty;
  dom.difficultyButtons.forEach((button) => {
    const selected = button.dataset.difficulty === difficulty;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function characterCountForDifficulty(difficulty) {
  return CONFIG.difficulties[difficulty]?.count ?? CONFIG.difficulties[CONFIG.defaultDifficulty].count;
}

function setSpeed(speed) {
  if (!CONFIG.speeds[speed]) {
    return;
  }

  state.speed = speed;
  dom.speedButtons.forEach((button) => {
    const selected = button.dataset.speed === speed;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function speedConfig() {
  return CONFIG.speeds[state.speed] ?? CONFIG.speeds[CONFIG.defaultSpeed];
}

function resetToPreview(count) {
  stopShuffleSound();
  state.token += 1;
  state.phase = "idle";
  state.running = false;
  state.shuffleStep = 0;
  state.ricecakeId = -1;
  state.motionById = {};
  state.travelById = {};
  state.targetPositionInput = "";
  state.targetPosition = 0;
  state.backgroundTheme = "current";
  dom.positionGuess.value = "";
  setupCharacters(count);
  dom.winnerPanel.hidden = true;
  render();
}

function setupCharacters(count) {
  state.characters = Array.from({ length: count }, (_, index) => ({
    id: index,
    accent: characterAccent(index),
  }));
  state.order = state.characters.map((character) => character.id);
}

async function startGame() {
  if (state.running || state.phase !== "idle") {
    return;
  }

  const targetPosition = readTargetPosition();
  if (!targetPosition) {
    setMessage(`정답 위치를 1부터 ${readCharacterCount()} 사이로 비밀 입력하세요.`);
    syncStartControls();
    dom.positionGuess.focus();
    return;
  }

  await ensureAudio();
  const count = readCharacterCount();
  const speed = speedConfig();
  setupCharacters(count);
  state.token += 1;
  const token = state.token;
  state.running = true;
  state.phase = "eating";
  state.shuffleStep = 0;
  state.targetPosition = targetPosition;
  state.targetPositionInput = "";
  state.backgroundTheme = randomBackgroundTheme();
  dom.positionGuess.value = "";
  state.ricecakeId = randomInt(0, state.characters.length - 1);
  state.motionById = { [state.ricecakeId]: "eat" };
  dom.winnerPanel.hidden = true;
  setControlsLocked(true);
  render();
  setMessage("떡 먹은 긍정이가 움직이는 위치를 잘 따라가세요.");
  playEatSound();
  popBursts(14, "rice");
  await wait(2400);

  if (token !== state.token) {
    return;
  }

  state.phase = "shuffling";
  startShuffleSound();
  for (let round = 1; round <= CONFIG.shuffleRounds; round += 1) {
    if (token !== state.token) {
      stopShuffleSound();
      return;
    }

    state.shuffleStep = round;
    setMessage(`${round}번째 섞기: 캐릭터들이 좌우로 자리를 바꿉니다.`);
    for (let move = 1; move <= CONFIG.shuffleMovesPerRound; move += 1) {
      if (token !== state.token) {
        stopShuffleSound();
        return;
      }

      const previousOrder = state.order;
      const isFinalMove = round === CONFIG.shuffleRounds && move === CONFIG.shuffleMovesPerRound;
      const nextOrder = isFinalMove
        ? makeTargetOrder(previousOrder, state.ricecakeId, state.targetPosition - 1)
        : makeShuffleOrder(previousOrder, round, move);
      const nextMotionById = getMotionMap(previousOrder, nextOrder);
      const nextTravelById = getTravelMap(previousOrder, nextOrder);
      state.motionById = getPoseMap(nextMotionById);
      state.travelById = {};
      render();
      await wait(speed.movePrepMs);

      if (token !== state.token) {
        stopShuffleSound();
        return;
      }

      state.motionById = nextMotionById;
      state.travelById = nextTravelById;
      state.order = nextOrder;
      render();
      popBursts(4 + round, "spark");
      await wait(speed.shuffleMoveMs);
    }

    state.motionById = {};
    state.travelById = {};
    render();
    await wait(speed.shuffleSettleMs);
  }

  if (token !== state.token) {
    stopShuffleSound();
    return;
  }

  stopShuffleSound();
  state.phase = "ready";
  state.running = false;
  state.motionById = {};
  state.travelById = {};
  render();
  setMessage("섞기가 끝났습니다. 결과 공개 버튼을 눌러 정답 위치를 공개하세요.");
}

function makeShuffleOrder(currentOrder, round, move) {
  const direction = (round + move) % 2 === 0 ? 1 : -1;
  const offset = randomInt(1, currentOrder.length - 1);
  const nextOrder = currentOrder.map((_, index) => {
    const sourceIndex = (index + direction * offset + currentOrder.length) % currentOrder.length;
    return currentOrder[sourceIndex];
  });

  const swapCount = Math.max(1, Math.floor(nextOrder.length / 3));
  for (let index = 0; index < swapCount; index += 1) {
    const first = randomInt(0, nextOrder.length - 2);
    const second = first + 1;
    [nextOrder[first], nextOrder[second]] = [nextOrder[second], nextOrder[first]];
  }

  if (sameOrder(currentOrder, nextOrder)) {
    nextOrder.reverse();
  }

  return nextOrder;
}

function makeTargetOrder(currentOrder, targetCharacterId, targetIndex) {
  const others = currentOrder.filter((characterId) => characterId !== targetCharacterId);
  if (others.length > 1) {
    const shifted = others.shift();
    others.push(shifted);
  }

  const nextOrder = [];
  for (let index = 0; index < currentOrder.length; index += 1) {
    nextOrder.push(index === targetIndex ? targetCharacterId : others.shift());
  }

  if (sameOrder(currentOrder, nextOrder) && currentOrder.length > 2) {
    const swapIndex = targetIndex === 0 ? 1 : 0;
    const nextSwapIndex = swapIndex + 1 === targetIndex ? swapIndex + 2 : swapIndex + 1;
    if (nextSwapIndex < nextOrder.length) {
      [nextOrder[swapIndex], nextOrder[nextSwapIndex]] = [nextOrder[nextSwapIndex], nextOrder[swapIndex]];
    }
  }

  return nextOrder;
}

function getMotionMap(previousOrder, nextOrder) {
  return nextOrder.reduce((motions, characterId, nextIndex) => {
    const previousIndex = previousOrder.indexOf(characterId);
    if (previousIndex !== nextIndex) {
      const direction = nextIndex > previousIndex ? "right" : "left";
      motions[characterId] = `jump-${direction}`;
    }
    return motions;
  }, {});
}

function getPoseMap(motionById) {
  return Object.entries(motionById).reduce((poses, [characterId, motion]) => {
    poses[characterId] = motion.endsWith("right") ? "pose-right" : "pose-left";
    return poses;
  }, {});
}

function getTravelMap(previousOrder, nextOrder) {
  const boardWidth = dom.board.clientWidth || 900;
  return nextOrder.reduce((travels, characterId, nextIndex) => {
    const previousIndex = previousOrder.indexOf(characterId);
    if (previousIndex !== nextIndex) {
      const previousX = slotX(previousIndex, nextOrder.length);
      const nextX = slotX(nextIndex, nextOrder.length);
      travels[characterId] = round(((previousX - nextX) / 100) * boardWidth);
    }
    return travels;
  }, {});
}

function slotX(slotIndex, count) {
  return ((slotIndex + 1) / (count + 1)) * 100;
}

function revealResult() {
  if (state.phase !== "ready") {
    return;
  }

  stopShuffleSound();
  playFanfare();
  state.phase = "revealed";
  state.motionById = { [state.ricecakeId]: "eat" };
  state.travelById = {};
  const finalPosition = ricecakePosition();
  dom.winnerName.textContent = `왼쪽에서 ${finalPosition}번째`;
  dom.winnerPanel.hidden = false;
  popBursts(52, "rice");
  setMessage(`입력한 정답 위치는 왼쪽에서 ${finalPosition}번째였습니다.`);
  render();
}

function ricecakePosition() {
  const index = state.order.indexOf(state.ricecakeId);
  return index >= 0 ? index + 1 : 0;
}

function resetGame() {
  resetToPreview(readCharacterCount());
}

async function ensureAudio() {
  ensureSoundElements();
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return null;
  }

  if (!audio.context) {
    audio.context = new AudioContext();
    audio.master = audio.context.createGain();
    audio.master.gain.value = 0.32;
    audio.master.connect(audio.context.destination);
  }

  if (audio.context.state === "suspended") {
    await audio.context.resume();
  }

  return audio.context;
}

function startShuffleSound() {
  stopShuffleSound();
  const context = audio.context;
  if (!context || !audio.master) {
    playSoundElement("shuffle", true);
    return;
  }

  audio.shuffleTick = 0;
  audio.shuffleTimer = window.setInterval(() => {
    const time = context.currentTime + 0.018;
    const melody = [392, 466.16, 523.25, 587.33, 622.25, 587.33, 523.25, 466.16];
    const freq = melody[audio.shuffleTick % melody.length];
    const accent = audio.shuffleTick % 4 === 0;
    playTone(freq, time, 0.08, accent ? 0.09 : 0.055, "square");
    playTone(freq * 2, time + 0.045, 0.055, 0.026, "triangle");
    playNoise(time + 0.02, 0.052, accent ? 0.09 : 0.045);
    audio.shuffleTick += 1;
  }, 170);
}

function stopShuffleSound() {
  if (audio.shuffleTimer) {
    window.clearInterval(audio.shuffleTimer);
    audio.shuffleTimer = 0;
  }
  if (audio.elements?.shuffle) {
    audio.elements.shuffle.pause();
    audio.elements.shuffle.currentTime = 0;
  }
}

function playEatSound() {
  const context = audio.context;
  if (!context || !audio.master) {
    playSoundElement("eat");
    return;
  }

  const time = context.currentTime + 0.02;
  playTone(523.25, time, 0.09, 0.07, "triangle");
  playTone(659.25, time + 0.1, 0.1, 0.07, "triangle");
  playNoise(time + 0.19, 0.07, 0.04);
}

function playFanfare() {
  ensureAudio().then((context) => {
    if (!context || !audio.master) {
      playSoundElement("fanfare");
      window.setTimeout(() => popBursts(28, "spark"), 180);
      return;
    }

    const start = context.currentTime + 0.025;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const time = start + index * 0.12;
      playTone(freq, time, 0.16, 0.12, "sawtooth");
      playTone(freq * 1.5, time, 0.12, 0.05, "triangle");
    });
    playTone(1046.5, start + 0.52, 0.42, 0.16, "sawtooth");
    playTone(1318.51, start + 0.52, 0.42, 0.1, "triangle");
    playNoise(start + 0.5, 0.18, 0.12);
    window.setTimeout(() => popBursts(28, "spark"), 180);
  });
}

function ensureSoundElements() {
  if (audio.elements) {
    return;
  }

  audio.elements = {
    eat: new Audio(CONFIG.sounds.eat),
    shuffle: new Audio(CONFIG.sounds.shuffle),
    fanfare: new Audio(CONFIG.sounds.fanfare),
  };
  audio.elements.eat.volume = 0.45;
  audio.elements.shuffle.volume = 0.28;
  audio.elements.shuffle.loop = true;
  audio.elements.fanfare.volume = 0.52;
}

function playSoundElement(name, loop = false) {
  ensureSoundElements();
  const element = audio.elements?.[name];
  if (!element) {
    return;
  }

  element.pause();
  element.loop = loop;
  element.currentTime = 0;
  element.play().catch(() => {});
}

function playTone(frequency, time, duration, gainValue, type) {
  const context = audio.context;
  if (!context || !audio.master) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.018, time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain);
  gain.connect(audio.master);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.025);
}

function playNoise(time, duration, gainValue) {
  const context = audio.context;
  if (!context || !audio.master) {
    return;
  }

  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(1200, time);
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(time);
  source.stop(time + duration + 0.02);
}

function render() {
  const count = state.characters.length;
  const speed = speedConfig();
  const layout = computeLayout(count);
  const slots = layout.slots;
  const positionById = new Map(state.order.map((characterId, slotIndex) => [characterId, slots[slotIndex]]));
  const isFinalReveal = state.phase === "revealed";
  const isPanelCollapsed = state.phase !== "idle";

  document.body.dataset.phase = state.phase;
  document.body.classList.toggle("panel-collapsed", isPanelCollapsed);
  const title = stageTitle();
  dom.stageTitle.textContent = title;
  dom.stageTitle.hidden = !title;
  dom.stageBadge.textContent = stageBadge();
  dom.startButton.hidden = state.phase !== "idle";
  dom.revealButton.hidden = state.phase !== "ready";
  dom.playAgainButton.hidden = state.phase !== "revealed";
  dom.guessPanel.hidden = state.phase !== "idle";
  dom.positionGuess.disabled = state.phase !== "idle";
  dom.positionGuess.placeholder = `1~${count}`;
  dom.revealButton.disabled = state.phase !== "ready";
  dom.playAgainButton.disabled = state.phase !== "revealed";
  dom.startButton.disabled = state.running || state.phase !== "idle" || !isValidTargetPosition();
  dom.difficultyButtons.forEach((button) => {
    button.disabled = state.phase !== "idle";
  });
  dom.speedButtons.forEach((button) => {
    button.disabled = state.phase !== "idle";
  });

  dom.board.dataset.phase = state.phase;
  dom.arena.dataset.background = state.backgroundTheme;
  dom.board.style.setProperty("--character-count", count);
  dom.board.style.setProperty("--card-width", `${layout.cardWidth}px`);
  dom.board.style.setProperty("--move-card-width", `${layout.moveCardWidth}px`);
  dom.board.style.setProperty("--character-height", `${layout.characterHeight}px`);
  dom.board.style.setProperty("--move-prep-duration", `${speed.movePrepMs}ms`);
  dom.board.style.setProperty("--shuffle-move-duration", `${speed.shuffleMoveMs}ms`);
  dom.board.innerHTML = state.characters
    .map((character) => {
      const slot = positionById.get(character.id);
      const motion = state.motionById[character.id] || "";
      const travelX = state.travelById[character.id] || 0;
      const jumpStyle = jumpStyleForCharacter(character.id, travelX);
      const imageMarkup = imageMarkupForCharacter(character.id, motion);
      const classes = ["character-card"];

      if (motion) {
        classes.push(`motion-${motion}`);
      }
      if (state.phase === "eating" && character.id === state.ricecakeId) {
        classes.push("eating");
      }
      if (isFinalReveal && character.id === state.ricecakeId) {
        classes.push("revealed");
      }
      if (isFinalReveal && character.id !== state.ricecakeId) {
        classes.push("cleared");
      }

      return `
        <article class="${classes.join(" ")}" style="left:${slot.x}%; top:${slot.y}%; --accent-color:${character.accent}; --z:${slot.z}; --travel-x:${travelX}px; --jump-lift:${jumpStyle.lift}; --jump-peak:${jumpStyle.peak}; --jump-land:${jumpStyle.land}">
          <div class="character-inner">
            ${imageMarkup}
          </div>
        </article>
      `;
    })
    .join("");

  if (state.phase === "idle") {
    dom.winnerPanel.hidden = true;
    setControlsLocked(false);
    syncStartControls();
    setMessage("난이도와 정답 위치를 정하고 게임을 시작하세요.");
  }
}

function imageMarkupForCharacter(characterId, motion) {
  if (motion?.startsWith("pose")) {
    return '<span class="character-image character-pose-sprite" aria-hidden="true"></span>';
  }

  const imageSource = imageForCharacter(characterId, motion);
  return `<img class="character-image" src="${imageSource}" alt="" draggable="false" />`;
}

function imageForCharacter(characterId, motion) {
  if (state.phase === "eating" && characterId === state.ricecakeId) {
    return CONFIG.characterImages.eat;
  }
  if (state.phase === "revealed" && characterId === state.ricecakeId) {
    return CONFIG.characterImages.eat;
  }
  if (motion === "jump" || motion.startsWith("jump")) {
    return CONFIG.characterImages.jump;
  }
  if (motion === "slide") {
    return CONFIG.characterImages.slide;
  }
  return CONFIG.characterImages.idle;
}

function jumpStyleForCharacter(characterId, travelX = 0) {
  const profiles = [
    { lift: 54, peak: 92, landRatio: 0.46 },
    { lift: 72, peak: 132, landRatio: 0.38 },
    { lift: 42, peak: 76, landRatio: 0.5 },
    { lift: 84, peak: 152, landRatio: 0.34 },
    { lift: 58, peak: 108, landRatio: 0.44 },
    { lift: 48, peak: 86, landRatio: 0.52 },
    { lift: 76, peak: 142, landRatio: 0.36 },
  ];
  const profile = profiles[characterId % profiles.length];
  const distanceBoost = clamp(Math.round(Math.abs(travelX) / 14), 0, 24);
  const lift = profile.lift + Math.round(distanceBoost * 0.45);
  const peak = profile.peak + distanceBoost;
  return {
    lift: `-${lift}px`,
    peak: `-${peak}px`,
    land: `-${Math.round(lift * profile.landRatio)}px`,
  };
}

function syncStartControls() {
  dom.startButton.disabled = state.running || state.phase !== "idle" || !isValidTargetPosition();
}

function readTargetPosition() {
  const targetPosition = Number.parseInt(state.targetPositionInput, 10);
  return Number.isInteger(targetPosition) && targetPosition >= 1 && targetPosition <= state.characters.length ? targetPosition : 0;
}

function isValidTargetPosition() {
  return Boolean(readTargetPosition());
}

function randomBackgroundTheme() {
  const themes = CONFIG.backgroundThemes;
  return themes[randomInt(0, themes.length - 1)];
}

function setControlsLocked(locked) {
  dom.startButton.disabled = locked;
  dom.positionGuess.disabled = locked;
  dom.difficultyButtons.forEach((button) => {
    button.disabled = locked;
  });
  dom.speedButtons.forEach((button) => {
    button.disabled = locked;
  });
}

function stageTitle() {
  if (state.phase === "eating") return "몰래 떡 먹는 중";
  if (state.phase === "shuffling") return "";
  if (state.phase === "ready") return "결과 공개 대기";
  if (state.phase === "revealed") return "최종 위치 공개";
  return "대기 중";
}

function stageBadge() {
  if (state.phase === "eating") return "EAT";
  if (state.phase === "shuffling") return `MIX ${state.shuffleStep}`;
  if (state.phase === "ready") return "CHECK";
  if (state.phase === "revealed") return "OPEN";
  return "READY";
}

function computeLayout(count) {
  const boardWidth = dom.board.clientWidth || 900;
  const boardHeight = dom.board.clientHeight || 560;
  const usableWidth = Math.max(320, boardWidth - 36);
  const cardWidth = Math.floor(clamp((usableWidth / count) * 1.05, 66, 150));
  const moveCardWidth = Math.min(310, cardWidth * 2 + 16);
  const characterHeight = Math.round(cardWidth / 0.46);
  const y = boardHeight < 420 ? 62 : 64;
  const slots = Array.from({ length: count }, (_, slotIndex) => ({
    x: round(((slotIndex + 1) / (count + 1)) * 100),
    y,
    z: 10 + slotIndex,
  }));
  return { slots, cardWidth, moveCardWidth, characterHeight };
}

function popBursts(count, type) {
  const rect = dom.effectLayer.getBoundingClientRect();
  for (let index = 0; index < count; index += 1) {
    const burst = document.createElement("span");
    burst.className = `burst ${type === "rice" ? "rice-burst" : "spark-burst"}`;
    burst.style.left = `${randomInt(18, Math.max(20, Math.floor(rect.width - 24)))}px`;
    burst.style.top = `${randomInt(18, Math.max(20, Math.floor(rect.height - 24)))}px`;
    burst.style.setProperty("--x", `${randomInt(-150, 150)}px`);
    burst.style.setProperty("--y", `${randomInt(-150, 150)}px`);
    burst.style.animationDelay = `${randomInt(0, 220)}ms`;
    dom.effectLayer.appendChild(burst);
    window.setTimeout(() => burst.remove(), 1200);
  }
}

function setMessage(text) {
  dom.message.textContent = text;
}

function sameOrder(first, second) {
  return first.every((value, index) => value === second[index]);
}

function characterAccent(index) {
  const colors = ["#f2d78b", "#ff7066", "#5bd6ff", "#90f0a8", "#b98cff", "#ffb35c"];
  return colors[index % colors.length];
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
