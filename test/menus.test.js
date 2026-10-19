// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMenus } from '../src/menus.js';
import { CHARACTERS } from '../src/characters.js';

// The real page's menus (scripts don't run when set through innerHTML).
const page = readFileSync('index.html', 'utf8'); // tests run from the project folder
const body = page
  .slice(page.indexOf('<body>') + 6, page.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, ''); // the menus only, not the whole game

const MAPS = ['Random', 'Atomic Avenue', 'Container Yard'].map((label) => ({ key: label.toLowerCase(), label, blurb: '' }));

let menus;
let choice;
let settings;
let calls;

beforeEach(() => {
  document.body.innerHTML = body;
  choice = { character: 0, map: 0 };
  settings = { mouse: 1, stick: 1, touch: 1 };
  calls = { onChoice: vi.fn(), onPlay: vi.fn(), onResume: vi.fn(), onQuit: vi.fn(), onSettings: vi.fn() };
  menus = createMenus({ characters: CHARACTERS, maps: MAPS, choice, settings, ...calls });
});

const chosenName = () => document.querySelector('.characters .chosen strong').textContent;
const chosenMap = () => document.querySelector('.maps .chosen strong').textContent;
const focused = () => document.querySelector('.focused');

describe('start screen with a controller', () => {
  beforeEach(() => menus.showStart());

  it('opens with the survivors selected, so right picks the next survivor', () => {
    expect(focused().closest('.characters')).not.toBeNull();
    menus.navigate('right');
    expect(chosenName()).toBe(CHARACTERS[1].name);
    expect(calls.onChoice).toHaveBeenCalled();
  });

  it('wraps around from the last survivor to the first', () => {
    menus.navigate('left');
    expect(chosenName()).toBe(CHARACTERS[CHARACTERS.length - 1].name);
  });

  it('moves down to the maps, where right changes the map', () => {
    menus.navigate('down');
    expect(focused().closest('.maps')).not.toBeNull();
    menus.navigate('right');
    expect(chosenMap()).toBe('Atomic Avenue');
    expect(chosenName()).toBe(CHARACTERS[0].name); // survivor unchanged
  });

  it('walks survivors -> map -> PLAY -> start with the confirm button', () => {
    menus.confirm();
    expect(focused().closest('.maps')).not.toBeNull();
    menus.confirm();
    expect(focused().classList.contains('play')).toBe(true);
    expect(calls.onPlay).not.toHaveBeenCalled();
    menus.confirm();
    expect(calls.onPlay).toHaveBeenCalledTimes(1);
  });

  it('goes back up a row with the back button', () => {
    menus.navigate('down');
    menus.back();
    expect(focused().closest('.characters')).not.toBeNull();
  });
});

describe('pause menu with a controller', () => {
  beforeEach(() => menus.showPause());

  it('opens on controller sensitivity, so right raises it by 0.1 and saves it', () => {
    menus.navigate('right');
    expect(settings.stick).toBeCloseTo(1.1);
    expect(calls.onSettings).toHaveBeenCalled();
    menus.navigate('left');
    menus.navigate('left');
    expect(settings.stick).toBeCloseTo(0.9);
  });

  it('shows the new value next to the slider', () => {
    menus.navigate('right');
    expect(focused().querySelector('output').textContent).toBe('1.1×');
  });

  it('changes mouse sensitivity one row down', () => {
    menus.navigate('down');
    menus.navigate('right');
    expect(settings.mouse).toBeCloseTo(1.1);
    expect(settings.stick).toBe(1);
  });

  it('keeps sensitivity between 0.2x and 3x', () => {
    for (let i = 0; i < 40; i++) menus.navigate('right');
    expect(settings.stick).toBe(3);
    for (let i = 0; i < 40; i++) menus.navigate('left');
    expect(settings.stick).toBe(0.2);
  });

  it('changes touch sensitivity two rows down', () => {
    menus.navigate('down');
    menus.navigate('down');
    menus.navigate('left');
    expect(settings.touch).toBeCloseTo(0.9);
  });

  it('resumes with Resume, and quits with Quit', () => {
    menus.navigate('down');
    menus.navigate('down');
    menus.navigate('down');
    menus.confirm();
    expect(calls.onResume).toHaveBeenCalledTimes(1);
    menus.showPause();
    menus.navigate('up'); // wraps round to the last row: Quit
    menus.confirm();
    expect(calls.onQuit).toHaveBeenCalledTimes(1);
  });

  it('resumes with the back button', () => {
    menus.back();
    expect(calls.onResume).toHaveBeenCalledTimes(1);
  });
});
