// Start screen and pause menu: HTML overlays on top of the game.
// Works with mouse, keyboard (arrows, Enter, Backspace) and controller (left
// stick or D-pad, A to confirm, B to go back).
// See .scratch/maps-characters-settings/spec.md and .scratch/controller-menus/spec.md.

export const SENSITIVITY = { min: 0.2, max: 3, step: 0.1 };

// options: { characters, maps, choice: { character, map }, settings: { mouse, stick },
//            onChoice(choice), onPlay(), onResume(), onQuit(), onSettings(settings) }
export function createMenus(options) {
  const { characters, maps, choice, settings } = options;
  const start = document.getElementById('start-menu');
  const pause = document.getElementById('pause-menu');
  let open = null; // 'start' | 'pause' | null
  let row = 0;

  // --- Start screen ---

  const characterCards = characters.map((c, i) => {
    const card = button('card', `
      <span class="swatch" style="background:${c.colours.shirt}"></span>
      <strong>${c.name}</strong>
      <span class="weapon">${c.weaponName}</span>
      <span class="blurb">${c.blurb}</span>`);
    card.addEventListener('click', () => {
      row = 0;
      chooseCharacter(i);
    });
    start.querySelector('.characters').append(card);
    return card;
  });
  const mapCards = maps.map((m, i) => {
    const card = button('card small', `<strong>${m.label}</strong><span class="blurb">${m.blurb}</span>`);
    card.addEventListener('click', () => {
      row = 1;
      chooseMap(i);
    });
    start.querySelector('.maps').append(card);
    return card;
  });
  const playButton = start.querySelector('.play');
  playButton.addEventListener('click', () => options.onPlay());

  function chooseCharacter(i) {
    choice.character = (i + characters.length) % characters.length;
    options.onChoice(choice);
    refresh();
  }

  function chooseMap(i) {
    choice.map = (i + maps.length) % maps.length;
    options.onChoice(choice);
    refresh();
  }

  // --- Pause menu ---

  const sliders = ['stick', 'mouse', 'touch'].map((key) => {
    const slider = pause.querySelector(`input[name="${key}"]`);
    Object.assign(slider, { min: SENSITIVITY.min, max: SENSITIVITY.max, step: SENSITIVITY.step, value: settings[key] });
    slider.addEventListener('input', () => setSetting(key, Number(slider.value)));
    return { key, slider };
  });
  const resumeButton = pause.querySelector('.resume');
  const quitButton = pause.querySelector('.quit');
  resumeButton.addEventListener('click', () => options.onResume());
  quitButton.addEventListener('click', () => options.onQuit());

  function setSetting(key, value) {
    const rounded = Math.round(value * 10) / 10;
    settings[key] = Math.min(SENSITIVITY.max, Math.max(SENSITIVITY.min, rounded));
    options.onSettings(settings);
    refresh();
  }

  // --- Shared ---

  // Rows a controller or the arrow keys move between.
  function rows() {
    if (open === 'start') return [characterCards[choice.character], mapCards[choice.map], playButton];
    if (open === 'pause') return [...sliders.map((s) => s.slider.parentElement), resumeButton, quitButton];
    return [];
  }

  function refresh() {
    characterCards.forEach((card, i) => card.classList.toggle('chosen', i === choice.character));
    mapCards.forEach((card, i) => card.classList.toggle('chosen', i === choice.map));
    for (const { key, slider } of sliders) {
      slider.value = settings[key];
      slider.parentElement.querySelector('output').textContent = `${settings[key].toFixed(1)}×`;
    }
    document.querySelectorAll('.focused').forEach((el) => el.classList.remove('focused'));
    rows()[row]?.classList.add('focused');
  }

  function show(which) {
    open = which;
    row = 0; // survivors on the start screen, controller sensitivity when paused
    start.hidden = which !== 'start';
    pause.hidden = which !== 'pause';
    refresh();
  }

  // dir: 'up' | 'down' | 'left' | 'right'
  function navigate(dir) {
    if (!open) return;
    const count = rows().length;
    if (dir === 'up') row = (row - 1 + count) % count;
    if (dir === 'down') row = (row + 1) % count;
    if (dir === 'left' || dir === 'right') {
      const change = dir === 'left' ? -1 : 1;
      if (open === 'start' && row === 0) chooseCharacter(choice.character + change);
      if (open === 'start' && row === 1) chooseMap(choice.map + change);
      if (open === 'pause' && row < sliders.length) {
        const { key } = sliders[row];
        setSetting(key, settings[key] + change * SENSITIVITY.step);
      }
    }
    refresh();
  }

  // A / Enter: on the start screen, confirm this row and move to the next
  // (survivor -> map -> PLAY), then play. When paused, press the selected button.
  function confirm() {
    const selected = rows()[row];
    if (open === 'start') {
      if (selected === playButton) return options.onPlay();
      row += 1;
    } else if (open === 'pause') {
      if (selected === resumeButton) return options.onResume();
      if (selected === quitButton) return options.onQuit();
      row += 1; // on a slider: move down
    }
    refresh();
  }

  // B / Backspace: up a row on the start screen; resume when paused.
  function back() {
    if (open === 'pause') return options.onResume();
    if (open === 'start' && row > 0) row -= 1;
    refresh();
  }

  refresh();
  return {
    showStart: () => show('start'),
    showPause: () => show('pause'),
    hide: () => show(null),
    navigate,
    confirm,
    back,
    isOpen: () => open !== null,
  };
}

function button(className, html) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.innerHTML = html;
  return el;
}
