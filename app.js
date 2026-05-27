const CONFIG = {
  minCharacters: 3,
  maxCharacters: 12,
  defaultCharacters: 8,
  shuffleRounds: 5,
  characterImage: "assets/ricecake-yabawi-character-neutral.png",
  motions: ["jump", "roll", "leap", "spin", "dash"],
};

const dom = {
  characterCount: document.getElementById("characterCount"),
  presetButtons: [...document.querySelectorAll("[data-count]")],
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
  setupCharacters(readCharacterCount());
  render();
}

function bindEvents() {
  dom.characterCount.addEventListener("input", () => {
    if (state.running || state.phase === "ready") {
      return;
    }
    resetToPreview(readCharacterCount());
  });

  dom.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.running || state.phase === "ready") {
        return;
      }
      dom.characterCount.value = button.dataset.count;
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
  const rawValue = Number.parseInt(dom.characterCount.value, 10);
  const fallback = Number.isFinite(rawValue) ? rawValue : CONFIG.defaultCharacters;
  const count = clamp(fallback, CONFIG.minCharacters, CONFIG.maxCharacters);
  dom.characterCount.value = count;
  return count;
}

function resetToPreview(count) {
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
  setMessage(`${state.ricecakeId + 1}번 캐릭터가 몰래 떡을 먹었습니다. 눈으로 잘 따라가세요.`);
  popBursts(14, "rice");
  await wait(2300);

  if (token !== state.token) {
    return;
  }

  state.phase = "shuffling";
  for (let round = 1; round <= CONFIG.shuffleRounds; round += 1) {
    if (token !== state.token) {
      return;
    }
    state.shuffleStep = round;
    const nextOrder = makeShuffleOrder(state.order, round);
    state.motionById = getMotionMap(state.order, nextOrder, round);
    state.order = nextOrder;
    render();
    setMessage(`${round}번째 야바위 섞기 진행 중`);
    popBursts(10 + round, "spark");
    await wait(1420);
    state.motionById = {};
    render();
    await wait(220);
  }

  if (token !== state.token) {
    return;
  }

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
      const motionIndex = (round + nextIndex + distance) % CONFIG.motions.length;
      motions[characterId] = CONFIG.motions[motionIndex];
    }
    return motions;
  }, {});
}

function revealResult() {
  if (state.phase !== "ready") {
    return;
  }

  state.phase = "revealed";
  state.motionById = { [state.ricecakeId]: "winner" };
  dom.winnerName.textContent = `${state.ricecakeId + 1}번 캐릭터`;
  dom.winnerPanel.hidden = false;
  popBursts(52, "rice");
  setMessage(`${state.ricecakeId + 1}번 캐릭터가 떡을 먹었습니다.`);
  render();
}

function resetGame() {
  resetToPreview(readCharacterCount());
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
  dom.characterCount.disabled = state.running || state.phase === "ready";
  dom.presetButtons.forEach((button) => {
    button.disabled = state.running || state.phase === "ready";
  });

  dom.board.dataset.phase = state.phase;
  dom.board.style.setProperty("--character-count", count);
  dom.board.style.setProperty("--card-width", `${layout.cardWidth}px`);
  dom.board.innerHTML = state.characters
    .map((character) => {
      const slot = positionById.get(character.id);
      const classes = ["character-card"];
      const motion = state.motionById[character.id];
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
            <img class="character-image" src="${CONFIG.characterImage}" alt="" draggable="false" />
            <span class="ricecake-piece" aria-hidden="true"></span>
          </div>
          <strong>${character.label}</strong>
        </article>
      `;
    })
    .join("");

  if (state.phase === "idle") {
    dom.winnerPanel.hidden = true;
    setControlsLocked(false);
    setMessage("캐릭터 수를 정하고 게임을 시작하세요.");
  }
}

function setControlsLocked(locked) {
  dom.characterCount.disabled = locked;
  dom.startButton.disabled = locked;
  dom.presetButtons.forEach((button) => {
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
  const spaceBasedColumns = clamp(Math.floor(boardWidth / 136), 3, count);
  const preferredColumns = count <= 4 ? count : Math.ceil(Math.sqrt(count * 1.35));
  const columns = Math.min(preferredColumns, spaceBasedColumns, count);
  const rows = Math.ceil(count / columns);
  const horizontalWidth = (boardWidth / (columns + 1)) * 0.86;
  const verticalWidth = ((boardHeight / (rows + 1)) - 30) / 1.35;
  const cardWidth = Math.floor(clamp(Math.min(horizontalWidth, verticalWidth), 78, 158));
  const slots = Array.from({ length: count }, (_, slotIndex) => {
    const row = Math.floor(slotIndex / columns);
    const rowStart = row * columns;
    const itemsInRow = Math.min(columns, count - rowStart);
    const col = slotIndex - rowStart;
    const x = ((col + 1) / (itemsInRow + 1)) * 100;
    const y = rows === 1 ? 50 : ((row + 1) / (rows + 1)) * 100;
    return {
      x: round(x),
      y: round(y),
      z: 10 + row,
    };
  });
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
