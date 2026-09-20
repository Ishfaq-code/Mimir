"""Select one native voice provider without putting credentials in client tokens."""
import os

import config


def create_realtime_model():
    if config.TUTOR_PROVIDER == 'gemini':
        from google.genai import types
        from livekit.plugins import google

        key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        if not key:
            raise RuntimeError('Gemini voice requires GOOGLE_API_KEY in agent/.env')
        return google.realtime.RealtimeModel(
            model=config.GEMINI_LIVE_MODEL,
            api_key=key,
            voice=config.GEMINI_VOICE,
            # Review tools gate math judgments; ordinary conversation needs no tool.
            tool_behavior=types.Behavior.BLOCKING,
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                    prefix_padding_ms=300,
                    silence_duration_ms=350,
                ),
            ),
            context_window_compression=types.ContextWindowCompressionConfig(
                sliding_window=types.SlidingWindow(),
            ),
            # Gemini 3.8 does not accept thinking_config; use its native default.
        )
    if config.TUTOR_PROVIDER != 'openai':
        raise RuntimeError('TUTOR_PROVIDER must be openai or gemini')

    from livekit.plugins import openai
    from openai.types.realtime.realtime_audio_input_turn_detection import ServerVad
    return openai.realtime.RealtimeModel(
        model=config.OPENAI_REALTIME_MODEL,
        voice=config.TUTOR_VOICE,
        input_audio_noise_reduction='far_field',
        turn_detection=ServerVad(type='server_vad', threshold=.75, prefix_padding_ms=300,
                                silence_duration_ms=350, create_response=False, interrupt_response=False),
    )
