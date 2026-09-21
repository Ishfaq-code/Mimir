import unittest

from writing_policy import requests_writing


class WritingPolicy(unittest.TestCase):
    def test_explicit_requests_to_the_tutor(self):
        for text in ['Write that down.', 'Please draw a blank for me', 'Can you write the next step?',
                     'Could you please fill in that blank?', 'I want you to write the answer',
                     'Mimir, write it on the canvas', 'Can you just record my answer?',
                     'Could you go ahead and write that?', 'Okay, please write the next step.',
                     'Go ahead and write it down', 'Can you actually write it for me?']:
            with self.subTest(text=text):
                self.assertTrue(requests_writing(text))

    def test_answers_guidance_and_negation_do_not_authorize_ink(self):
        for text in ['six', 'The answer is 8', 'Check my work', 'What should I write?',
                     'Can you help me write this?', 'Show me how', 'Explain the next step',
                     'I wrote six', "I'll write that myself", "Don't write anything",
                     'Can you explain it but do not write?', 'Write it? No need to write it.',
                     'Please let me write the answer', 'The worksheet says write the next step']:
            with self.subTest(text=text):
                self.assertFalse(requests_writing(text))
