// On-screen touch controls, Fortnite mobile style. Browser-only.
// Left half: a joystick appears under your thumb. Right half: drag to look.
// FIRE (hold, and drag to aim while firing), JUMP, pause, and game-over buttons.
// Each finger is tracked separately, so you can move, look and fire at once.
// See .scratch/mobile/spec.md.

import { joystickVector } from './touch.js';

const JOYSTICK_RADIUS = 60; // CSS pixels

// Is the main pointer a finger (a phone or tablet), not a mouse?
export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
}

// callbacks: { onPause(), onPlayAgain(), onMenu() }
export function createTouchControls(callbacks) {
  document.body.classList.add('touch');
  const layer = element('div', 'touch-layer');
  const ring = element('div', 'joystick-ring', layer);
  const knob = element('div', 'joystick-knob', ring);
  const fire = element('button', 'touch-button fire', layer, 'FIRE');
  const jump = element('button', 'touch-button jump', layer, 'JUMP');
  const pause = element('button', 'touch-button pause', layer, '❚❚');
  const gameOver = element('div', 'touch-game-over', layer);
  const playAgain = element('button', 'touch-wide', gameOver, 'Play again');
  const menu = element('button', 'touch-wide', gameOver, 'Menu');
  element('div', 'rotate-message', document.body, '<span>↻</span>Turn your phone sideways'); // shown by CSS when upright

  const state = { move: { x: 0, y: 0 }, firing: false, jump: false, lookDx: 0 };
  let joystick = null; // { id, start }
  const lookers = new Map(); // finger id -> last x

  layer.addEventListener('pointerdown', (e) => {
    if (e.target !== layer) return; // buttons handle their own touches
    layer.setPointerCapture(e.pointerId);
    if (e.clientX < innerWidth / 2 && !joystick) {
      joystick = { id: e.pointerId, start: { x: e.clientX, y: e.clientY } };
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      ring.hidden = false;
      knob.style.transform = 'translate(-50%, -50%)';
    } else {
      lookers.set(e.pointerId, e.clientX);
    }
  });

  // FIRE: hold to shoot; dragging it also looks around.
  fire.addEventListener('pointerdown', (e) => {
    fire.setPointerCapture(e.pointerId);
    state.firing = true;
    lookers.set(e.pointerId, e.clientX);
  });
  const stopFiring = (e) => {
    state.firing = false;
    lookers.delete(e.pointerId);
  };
  fire.addEventListener('pointerup', stopFiring);
  fire.addEventListener('pointercancel', stopFiring);
  fire.addEventListener('pointermove', (e) => look(e));

  jump.addEventListener('pointerdown', () => {
    state.jump = true; // used up by the next frame
  });
  pause.addEventListener('click', () => callbacks.onPause());
  playAgain.addEventListener('click', () => callbacks.onPlayAgain());
  menu.addEventListener('click', () => callbacks.onMenu());

  layer.addEventListener('pointermove', (e) => {
    if (joystick && e.pointerId === joystick.id) {
      state.move = joystickVector(joystick.start, { x: e.clientX, y: e.clientY }, JOYSTICK_RADIUS);
      const dx = Math.max(-1, Math.min(1, (e.clientX - joystick.start.x) / JOYSTICK_RADIUS)) * JOYSTICK_RADIUS;
      const dy = Math.max(-1, Math.min(1, (e.clientY - joystick.start.y) / JOYSTICK_RADIUS)) * JOYSTICK_RADIUS;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else {
      look(e);
    }
  });
  const release = (e) => {
    if (joystick && e.pointerId === joystick.id) {
      joystick = null;
      state.move = { x: 0, y: 0 };
      ring.hidden = true;
    }
    lookers.delete(e.pointerId);
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);

  function look(e) {
    if (!lookers.has(e.pointerId)) return;
    state.lookDx += e.clientX - lookers.get(e.pointerId);
    lookers.set(e.pointerId, e.clientX);
  }
  ring.hidden = true;

  return {
    // What the fingers are doing this frame. Look and jump are used up once read.
    read() {
      const reading = { move: state.move, firing: state.firing, jump: state.jump, lookDx: state.lookDx };
      state.jump = false;
      state.lookDx = 0;
      return reading;
    },
    // Show the right buttons for what's on screen.
    update({ menuOpen, gameOver: over }) {
      layer.hidden = menuOpen;
      fire.hidden = jump.hidden = pause.hidden = over;
      gameOver.hidden = !over;
      if (menuOpen || over) {
        state.firing = false;
        state.move = { x: 0, y: 0 };
        joystick = null;
        ring.hidden = true;
        lookers.clear();
      }
    },
  };
}

function element(tag, className, parent = document.body, html = '') {
  const el = document.createElement(tag);
  el.className = className;
  if (tag === 'button') el.type = 'button';
  el.innerHTML = html;
  parent.append(el);
  return el;
}
