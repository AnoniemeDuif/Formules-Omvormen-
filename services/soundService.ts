// services/soundService.ts

let audioContext: AudioContext | null = null;
let isInitialized = false;

// Initialize the audio context. Must be called after a user interaction
// to comply with browser autoplay policies.
const initializeAudio = () => {
    if (isInitialized || typeof window === 'undefined') return;
    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        isInitialized = true;
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
        isInitialized = true; // Prevent trying again
    }
};

// Generic function to play a tone with an oscillator.
const playTone = (
    type: OscillatorType, 
    frequency: number, 
    duration: number, 
    volume: number = 0.5,
    startTime: number = 0
) => {
    if (!audioContext) return;
    const now = audioContext.currentTime;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now + startTime);

    gainNode.gain.setValueAtTime(volume * 0.5, now + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now + startTime);
    oscillator.stop(now + startTime + duration);
};

// --- Specific sound effect functions ---

/** Plays a short, sharp click sound. Ideal for button presses and UI interactions. */
export const playClick = () => {
    initializeAudio(); // Lazy initialization
    playTone('triangle', 523.25, 0.08, 0.2); // C5
    playTone('triangle', 783.99, 0.08, 0.2); // G5
};

/** Plays a soft "thud" sound. Used for dropping symbols onto the board. */
export const playDrop = () => {
    initializeAudio();
    playTone('sine', 220, 0.1, 0.4); // A3
};

/** Plays a positive, ascending arpeggio. Used for correct answers. */
export const playSuccess = () => {
    initializeAudio();
    if (!audioContext) return;
    const baseVolume = 0.3;
    // C4, E4, G4, C5 arpeggio
    playTone('sine', 261.63, 0.12, baseVolume, 0);
    playTone('sine', 329.63, 0.12, baseVolume, 0.1);
    playTone('sine', 392.00, 0.12, baseVolume, 0.2);
    playTone('sine', 523.25, 0.2, baseVolume, 0.3);
};

/** Plays a low, dissonant tone. Used for incorrect answers. */
export const playError = () => {
    initializeAudio();
    playTone('sawtooth', 130.81, 0.25, 0.2); // C3
};

/** Plays a "swoosh" sound. Used for resetting the board. */
export const playReset = () => {
    initializeAudio();
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    const duration = 0.2;

    const noise = audioContext.createBufferSource();
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    const biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = 'bandpass';
    biquadFilter.frequency.setValueAtTime(1800, now);
    biquadFilter.frequency.exponentialRampToValueAtTime(100, now + duration);
    biquadFilter.Q.value = 8;

    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + duration);

    noise.connect(biquadFilter);
    biquadFilter.connect(gainNode);
    gainNode.connect(audioContext.destination);
    noise.start(now);
    noise.stop(now + duration);
};
