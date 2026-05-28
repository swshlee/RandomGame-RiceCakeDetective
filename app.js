const CONFIG = {
  defaultDifficulty: "normal",
  difficulties: {
    easy: { label: "Easy", count: 3 },
    normal: { label: "Normal", count: 5 },
    hard: { label: "Hard", count: 7 },
  },
  shuffleRounds: 5,
  characterImages: {
    idle: "assets/sprite-idle.png",
    eat: "assets/sprite-eat.png",
    jump: "assets/sprite-jump.png",
    slide: "assets/sprite-slide.png",
  },
  sounds: {
    eat: "assets/sound-eat.wav",
    shuffle: "assets/sound-shuffle.wav",
    fanfare: "assets/sound-fanfare.wav",
  },
  motions: ["jump", "slide"],
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
  startButton: document.getElementById("startButton"),
  revealButton: document.getElementById("revealButton"),
  resetButton: document.getElementById("resetButton"),
  characterTotal: document.getElementById("characterTotal"),
  shuffleCounter: document.getElementById("shuffleCounter"),
  message: document.getElementById("message"),
  stageTitle: document.getElementById("stageTitle"),
  stageBadge: document.getElementById("stageBadge"),
  board: document.getElementById("board"),
  effectLayer: document.getElementById("effectLayer"),
  winnerPanel: document.getElementById("winnerPanel"),
  winnerName: document.getElementById("winnerName"),
};

const state = {
  difficulty: CONFIG.defaultDifficulty,
  characters: [],
  order: [],
  ricecakeId: -1,
  phase: "idle",
  running: false,
  token: 0,
  shuffleStep: 0,
  motionById: {},
};

init();

function init() {
  bindEvents();
  setDifficulty(state.difficulty);
  setupCharacters(readCharacterCount());
  render();
}

function bindEvents() {
  dom.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.running || state.phase === "ready") {
        return;
      }
      setDifficulty(button.dataset.difficulty);
      resetToPreview(readCharacterCount());
    });
  });

  dom.startButton.addEventListener("click", startGame);
  dom.revealButton.addEventListener("click", revealResult);
  dom.resetButton.addEventListener("click", resetGame);
  window.addEventListener("resize", () => {
    if (!state.running) {
      render();
    }
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

function resetToPreview(count) {
  stopShuffleSound();
  state.token += 1;
  state.phase = "idle";
  state.running = false;
  state.shuffleStep = 0;
  state.ricecakeId = -1;
  state.motionById = {};
  setupCharacters(count);
  dom.winnerPanel.hidden = true;
  render();
}

function setupCharacters(count) {
  state.characters = Array.from({ length: count }, (_, index) => ({
    id: index,
    label: `${index + 1}번 캐릭터`,
    accent: characterAccent(index),
  }));
  state.order = state.characters.map((character) => character.id);
}

async function startGame() {
  if (state.running) {
    return;
  }

  await ensureAudio();
  const count = readCharacterCount();
  setupCharacters(count);
  state.token += 1;
  const token = state.token;
  state.running = true;
  state.phase = "eating";
  state.shuffleStep = 0;
  state.ricecakeId = randomInt(0, state.characters.length - 1);
  state.motionById = { [state.ricecakeId]: "eat" };
  dom.winnerPanel.hidden = true;
  setControlsLocked(true);
  render();
  setMessage(`${state.ricecakeId + 1}번 캐릭터가 스스로 떡을 먹었습니다. 이제 움직임을 잘 따라가세요.`);
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
    const nextOrder = makeShuffleOrder(state.order, round);
    state.motionById = getMotionMap(state.order, nextOrder, round);
    state.order = nextOrder;
    render();
    setMessage(`${round}번째 섞기: 캐릭터들이 점프와 슬라이딩으로 자리를 바꿉니다.`);
    popBursts(10 + round, "spark");
    await wait(1480);

    state.motionById = {};
    render();
    await wait(240);
  }

  if (token !== state.token) {
    stopShuffleSound();
    return;
  }

  stopShuffleSound();
  state.phase = "ready";
  state.running = false;
  state.motionById = {};
  render();
  setMessage("섞기가 끝났습니다. 결과 확인 버튼을 눌러 떡 먹은 캐릭터를 공개하세요.");
}

function makeShuffleOrder(currentOrder, round) {
  const nextOrder = [...currentOrder];
  const swaps = Math.max(2, Math.ceil(nextOrder.length / 3));
  for (let index = 0; index < swaps; index += 1) {
    const first = randomInt(0, nextOrder.length - 1);
    let second = randomInt(0, nextOrder.length - 1);
    while (second === first) {
      second = randomInt(0, nextOrder.length - 1);
    }
    [nextOrder[first], nextOrder[second]] = [nextOrder[second], nextOrder[first]];
  }

  if (round % 2 === 0 && nextOrder.length > 4) {
    const moved = nextOrder.shift();
    nextOrder.splice(randomInt(2, nextOrder.length), 0, moved);
  }

  if (sameOrder(currentOrder, nextOrder)) {
    nextOrder.reverse();
  }

  return nextOrder;
}

function getMotionMap(previousOrder, nextOrder, round) {
  return nextOrder.reduce((motions, characterId, nextIndex) => {
    const previousIndex = previousOrder.indexOf(characterId);
    if (previousIndex !== nextIndex) {
      const distance = Math.abs(previousIndex - nextIndex);
      motions[characterId] = (round + nextIndex + distance) % 2 === 0 ? "jump" : "slide";
    }
    return motions;
  }, {});
}

function revealResult() {
  if (state.phase !== "ready") {
    return;
  }

  stopShuffleSound();
  playFanfare();
  state.phase = "revealed";
  state.motionById = { [state.ricecakeId]: "eat" };
  dom.winnerName.textContent = `${state.ricecakeId + 1}번 캐릭터`;
  dom.winnerPanel.hidden = false;
  popBursts(52, "rice");
  setMessage(`${state.ricecakeId + 1}번 캐릭터가 떡을 먹었습니다.`);
  render();
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
  const layout = computeLayout(count);
  const slots = layout.slots;
  const positionById = new Map(state.order.map((characterId, slotIndex) => [characterId, slots[slotIndex]]));
  const isFinalReveal = state.phase === "revealed";

  dom.characterTotal.textContent = formatNumber(count);
  dom.shuffleCounter.textContent = state.shuffleStep;
  dom.stageTitle.textContent = stageTitle();
  dom.stageBadge.textContent = stageBadge();
  dom.revealButton.hidden = state.phase !== "ready";
  dom.revealButton.disabled = state.phase !== "ready";
  dom.startButton.disabled = state.running || state.phase === "ready";
  dom.difficultyButtons.forEach((button) => {
    button.disabled = state.running || state.phase === "ready";
  });

  dom.board.dataset.phase = state.phase;
  dom.board.style.setProperty("--character-count", count);
  dom.board.style.setProperty("--card-width", `${layout.cardWidth}px`);
  dom.board.innerHTML = state.characters
    .map((character) => {
      const slot = positionById.get(character.id);
      const motion = state.motionById[character.id] || "";
      const imageSource = imageForCharacter(character.id, motion);
      const classes = ["character-card"];

      if (motion) {
        classes.push(`motion-${motion}`);
      }
      if (state.phase === "eating" && character.id === state.ricecakeId) {
        classes.push("eating");
      }
      if (state.phase === "shuffling" || state.phase === "ready") {
        classes.push("mystery");
      }
      if (isFinalReveal && character.id === state.ricecakeId) {
        classes.push("revealed");
      }
      if (isFinalReveal && character.id !== state.ricecakeId) {
        classes.push("cleared");
      }

      return `
        <article class="${classes.join(" ")}" style="left:${slot.x}%; top:${slot.y}%; --accent-color:${character.accent}; --z:${slot.z}">
          <div class="character-inner">
            <span class="number-badge">${character.id + 1}</span>
            <span class="question-mark">?</span>
            <img class="character-image" src="${imageSource}" alt="" draggable="false" />
          </div>
          <strong>${character.label}</strong>
        </article>
      `;
    })
    .join("");

  if (state.phase === "idle") {
    dom.winnerPanel.hidden = true;
    setControlsLocked(false);
    setMessage("난이도를 정하고 게임을 시작하세요.");
  }
}

function imageForCharacter(characterId, motion) {
  if (state.phase === "eating" && characterId === state.ricecakeId) {
    return CONFIG.characterImages.eat;
  }
  if (state.phase === "revealed" && characterId === state.ricecakeId) {
    return CONFIG.characterImages.eat;
  }
  if (motion === "jump") {
    return CONFIG.characterImages.jump;
  }
  if (motion === "slide") {
    return CONFIG.characterImages.slide;
  }
  return CONFIG.characterImages.idle;
}

function setControlsLocked(locked) {
  dom.startButton.disabled = locked;
  dom.difficultyButtons.forEach((button) => {
    button.disabled = locked;
  });
}

function stageTitle() {
  if (state.phase === "eating") return "몰래 떡 먹는 중";
  if (state.phase === "shuffling") return `${state.shuffleStep}번째 야바위`;
  if (state.phase === "ready") return "결과 확인 대기";
  if (state.phase === "revealed") return "떡 먹은 캐릭터 공개";
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
  const y = boardHeight < 420 ? 62 : 64;
  const slots = Array.from({ length: count }, (_, slotIndex) => ({
    x: round(((slotIndex + 1) / (count + 1)) * 100),
    y,
    z: 10 + slotIndex,
  }));
  return { slots, cardWidth };
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
