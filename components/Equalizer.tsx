import React, { useEffect, useRef, useState } from 'react';

interface EqualizerProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  className?: string;
  active: boolean; // Control animation loop
}

const Equalizer: React.FC<EqualizerProps> = ({ audioRef, className, active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bands, setBands] = useState({ bass: 50, mid: 50, treble: 50 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const animationRef = useRef<number>(0);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!active) {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return;
    }

    if (!audioRef.current) return;

    const initAudio = () => {
      if (isInitialized.current) return;
      
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = ctx.createMediaElementSource(audioRef.current!);

        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 200;

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 1;

        const treble = ctx.createBiquadFilter();
        treble.type = 'highshelf';
        treble.frequency.value = 3000;

        filtersRef.current = [bass, mid, treble];

        source.connect(bass);
        bass.connect(mid);
        mid.connect(treble);
        treble.connect(analyser);
        analyser.connect(ctx.destination);
        
        isInitialized.current = true;
      } catch (e) {
        console.warn("Audio Context Error (CORS likely):", e);
      }
    };

    // Initialize on first interaction/play if needed
    if (!isInitialized.current) {
        // Try immediately if playing, else wait for play
        if (!audioRef.current.paused) initAudio();
        else audioRef.current.addEventListener('play', initAudio, { once: true });
    }

    const draw = () => {
      if (!canvasRef.current || !analyserRef.current) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#22c55e');
        gradient.addColorStop(1, '#15803d');
        
        ctx.fillStyle = gradient;
        
        // Simple rects are faster than roundRect
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 2;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audioRef, active]);

  useEffect(() => {
    if (filtersRef.current.length === 3) {
      const getGain = (val: number) => (val - 50) / 2.5; 
      filtersRef.current[0].gain.value = getGain(bands.bass);
      filtersRef.current[1].gain.value = getGain(bands.mid);
      filtersRef.current[2].gain.value = getGain(bands.treble);
    }
  }, [bands]);

  return (
    <div className={`flex flex-col gap-4 p-4 ${className}`}>
      <div className="h-32 w-full flex items-end justify-center bg-black/20 rounded-xl overflow-hidden">
        <canvas ref={canvasRef} width={300} height={100} className="w-full h-full" />
      </div>

      <div className="flex justify-between items-center gap-4 text-xs font-mono text-gray-400">
        <div className="flex flex-col items-center gap-2 flex-1">
          <input 
            type="range" min="0" max="100" 
            value={bands.bass} 
            onChange={(e) => setBands({...bands, bass: Number(e.target.value)})}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span>BASS</span>
        </div>
        <div className="flex flex-col items-center gap-2 flex-1">
           <input 
            type="range" min="0" max="100" 
            value={bands.mid} 
            onChange={(e) => setBands({...bands, mid: Number(e.target.value)})}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span>MID</span>
        </div>
        <div className="flex flex-col items-center gap-2 flex-1">
           <input 
            type="range" min="0" max="100" 
            value={bands.treble} 
            onChange={(e) => setBands({...bands, treble: Number(e.target.value)})}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span>TREBLE</span>
        </div>
      </div>
    </div>
  );
};

export default Equalizer;