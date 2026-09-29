let context: AudioContext | undefined;
let enabled = true;
export function setSound(value: boolean) { enabled = value; }
export function unlockSound() {
  if (!enabled) return;
  try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); } catch { /* Audio is optional. */ }
}
export function sound(kind: 'bomb' | 'blast' | 'pickup' | 'win' | 'count') {
  if (!enabled || !context || context.state !== 'running') return;
  const tones = kind === 'win' ? [330, 440, 660, 880] : kind === 'pickup' ? [520, 780] : kind === 'blast' ? [90, 45] : kind === 'bomb' ? [180] : [440];
  tones.forEach((frequency, i) => {
    const oscillator = context!.createOscillator(), gain = context!.createGain(), start = context!.currentTime + i * 0.08;
    oscillator.type = kind === 'blast' ? 'sawtooth' : 'square'; oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.035, start); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(start); oscillator.stop(start + 0.13);
  });
}
