import whisper
import os
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

class WhisperEngine:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(WhisperEngine, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.executor = ThreadPoolExecutor(max_workers=2)
            cls._instance.lock = asyncio.Lock()
            # Pre-load the tiny model in background thread on init
            import threading
            threading.Thread(target=cls._instance._load_model, daemon=True).start()
        return cls._instance

    def _load_model(self):
        print("[Whisper] Loading 'tiny.en' model...")
        self.model = whisper.load_model("tiny.en")
        print("[Whisper] 'tiny.en' model loaded and ready!")

    async def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe an audio buffer (webm, ogg, wav) via a temp file.
        Runs purely in a thread pool to avoid blocking the asyncio event loop.
        """
        if self.model is None:
            # wait briefly if models isn't loaded yet
            print("[Whisper] Model still loading, delaying request...")
            for _ in range(10):
                await asyncio.sleep(1)
                if self.model is not None: break
            if self.model is None:
                raise RuntimeError("Whisper model failed to load in time.")

        loop = asyncio.get_running_loop()
        
        # Write bytes to temp file synchronously for FFmpeg
        fd, temp_path = tempfile.mkstemp(suffix=".webm")
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(audio_bytes)
            
            # Add domain context so the model stops heavily hallucinating acronyms 
            prompt = (
                "Chess move commands: e4, d5, knight to f3, castle kingside, queen to h5"
            )
            # Offload heavy ML inference to ThreadPool
            async with self.lock:
                result = await loop.run_in_executor(
                    self.executor,
                    lambda: self.model.transcribe(temp_path, fp16=False, initial_prompt=prompt)
                )
            return result.get("text", "").strip()
        except Exception as ex:
            import traceback
            traceback.print_exc()
            raise ex
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)

# Instantiate singleton
engine = WhisperEngine()
