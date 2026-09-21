"""Writing permission comes from the student's current request, never a model plan."""
import re


def requests_writing(text: str) -> bool:
    text = ' '.join(text.lower().replace('’', "'").split())
    action = r'(?:write|draw|fill|record|put)'
    # Err toward guidance for negation, self-directed work or questions about
    # what the student should write. These are not requests for AI handwriting.
    if re.search(r"\b(?:don't|do not|never|stop|avoid|no need to)\b.{0,45}\b(?:write|writing|draw|drawing|fill|record|put)\b", text):
        return False
    if re.search(r"\b(?:let me|i'll|i will|i want to|i need to)\b.{0,30}\b(?:write|draw|fill)\b", text):
        return False
    patterns = [
        rf'^(?:please\s+)?{action}\b',
        rf'\b(?:can|could|would|will) you (?:(?:please|just|also)\s+)*{action}\b',
        rf"\b(?:i want|i need|i would like|i'd like) you to {action}\b",
        rf'\b(?:please|mimir)[, ]+{action}\b',
    ]
    return any(re.search(pattern, text) for pattern in patterns)
